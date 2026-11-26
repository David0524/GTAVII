import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { mix, color, positionWorld, mx_noise_float, float, smoothstep, fract, step, max } from 'three/tsl';
import { createRenderer } from '../../engine/renderer';
import { qualityFromUrl } from '../../engine/quality';
import { Input } from '../../input/Input';
import { TouchControls } from '../../ui/TouchControls';
import { DebugHud, FrameStats } from '../../ui/DebugHud';
import { createVehicleFactory, type Vehicle, type SkidEvent, type ImpactEvent, type DamageEvent } from '../index';
import { SkidMarks } from '../SkidMarks';
import { MODELS } from '../models';
import { ZONES } from '../gen/morphs';

/* eslint-disable @typescript-eslint/no-explicit-any */
type N = any;

/**
 * Vehicle test scene (?vehicles=1). A flat lot plus a grid of 20 m blocks with 0.15 m curbs,
 * a concrete crash wall, posts, a ramp and parked cars. The engine swaps in city colliders later.
 *
 *   &model=<id> &variant=<n>   start vehicle      &mode=drive|turntable|lineup
 *   keys: WASD/arrows drive, Space handbrake, F next model, V next variant, H lights,
 *         B beacon, R repair+reset, C camera, 1-4 dent a zone, 5 = 30 mph crash test
 */
const BLOCK = 20, ROAD = 12, CURB = 0.15;
const DT = 1 / 60;

function addStatic(world: RAPIER.World, scene: THREE.Scene, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY = 0, rotX = 0, visual = true) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setFriction(0.9));
  if (!visual) return null;
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z); m.quaternion.copy(q);
  m.castShadow = true; m.receiveShadow = true;
  scene.add(m);
  return m;
}

/** Environment for reflections: hazy warm sky, dark street band, bright window speckle. */
function streetEnvironment(renderer: THREE.WebGPURenderer) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#8c93a3'); sky.addColorStop(0.35, '#d8c7a8'); sky.addColorStop(0.5, '#a08a74');
  sky.addColorStop(0.52, '#3a332e'); sky.addColorStop(1, '#1a1715');
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
  // building silhouettes along the horizon with lit windows
  for (let x = 0; x < 1024; x += 30 + Math.random() * 50) {
    const w = 30 + Math.random() * 70, h = 40 + Math.random() * 120;
    g.fillStyle = `rgb(${50 + Math.random() * 30},${42 + Math.random() * 20},${36 + Math.random() * 16})`;
    g.fillRect(x, 256 - h, w, h);
    g.fillStyle = '#e8d8b066';
    for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 8) if (Math.random() < 0.25) g.fillRect(wx, wy, 3, 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  tex.dispose(); pm.dispose();
  return env;
}

export async function runTestLot() {
  const params = new URLSearchParams(location.search);
  const quality = qualityFromUrl();
  await RAPIER.init();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb8ad9c);
  scene.fog = new THREE.Fog(0xb0a494, 120, 600);
  try { scene.environment = streetEnvironment(renderer); scene.environmentIntensity = 0.9; } catch (e) { console.warn('env map failed', e); }
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 2000);
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.4);
  sun.position.set(-40, 60, 25);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xbcc4d8, 0x4a3e34, 1.1));

  // ------------------------------------------------------------------ world
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  // ground: asphalt with grime noise; lot is concrete with paint lines
  const asphalt = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
  {
    const p: N = positionWorld;
    const n: N = (mx_noise_float(p.mul(0.35)) as N).mul(0.5).add(0.5);
    const fine: N = (mx_noise_float(p.mul(6)) as N).mul(0.5).add(0.5);
    const patch: N = smoothstep(float(0.55), float(0.6), n);
    asphalt.colorNode = mix(mix(color(0x2b2a28), color(0x3a3734), fine.mul(0.6)), color(0x24221f), patch.mul(0.7));
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), asphalt);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(3000, 0.5, 3000).setTranslation(0, -0.5, 0).setFriction(1));
  // the lot: 80 x 60 concrete pad south of the grid, with parking stripes
  const concrete = new THREE.MeshStandardNodeMaterial({ roughness: 0.85 });
  {
    const p: N = positionWorld;
    const joints: N = max(step(float(0.985), fract(p.x.div(5))), step(float(0.985), fract(p.z.div(5))));
    const n: N = (mx_noise_float(p.mul(0.8)) as N).mul(0.5).add(0.5);
    concrete.colorNode = mix(mix(color(0x77726a), color(0x8c867b), n), color(0x3e3a35), joints.mul(0.8));
  }
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), concrete);
  pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.003, 30); pad.receiveShadow = true;
  scene.add(pad);
  const paint = new THREE.MeshStandardNodeMaterial({ color: 0xe4dcc4, roughness: 0.7 });
  for (let i = -6; i <= 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5.5), paint);
    m.rotation.x = -Math.PI / 2; m.position.set(i * 2.9, 0.006, 52);
    scene.add(m);
  }
  // grid of 20 m blocks (raised sidewalks with 0.15 m curbs) north of the lot
  const sidewalk = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  {
    const p: N = positionWorld;
    const flags: N = max(step(float(0.97), fract(p.x.div(1.5))), step(float(0.97), fract(p.z.div(1.5))));
    sidewalk.colorNode = mix(color(0x8a847a), color(0x5e5953), flags.mul(0.7));
  }
  const brick = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
  {
    const p: N = positionWorld;
    const win: N = step(float(0.45), fract(p.x.div(2.4))).mul(step(float(0.35), fract(p.y.div(3.4)))).mul(step(float(3.0), p.y));
    const win2: N = step(float(0.45), fract(p.z.div(2.4))).mul(step(float(0.35), fract(p.y.div(3.4)))).mul(step(float(3.0), p.y));
    const n: N = (mx_noise_float(p.mul(0.2)) as N).mul(0.5).add(0.5);
    brick.colorNode = mix(mix(color(0x5a3528), color(0x6e4a38), n), color(0x15130f), max(win, win2).mul(0.85));
  }
  const blocks: { x0: number; z0: number }[] = [];
  for (let i = -2; i <= 1; i++) for (let j = 1; j <= 3; j++) {
    const x0 = i * (BLOCK + ROAD) + ROAD / 2, z0 = -j * (BLOCK + ROAD);
    blocks.push({ x0, z0 });
    addStatic(world, scene, sidewalk, x0 + BLOCK / 2, CURB / 2, z0 + BLOCK / 2, BLOCK, CURB, BLOCK);
    // a low building on some blocks, set back 4 m (sidewalk width), for street context
    if ((i + j) % 2 === 0) addStatic(world, scene, brick, x0 + BLOCK / 2, CURB + 6, z0 + BLOCK / 2, BLOCK - 8, 12, BLOCK - 8);
    // corner posts (lamp/sign posts) to hit
    const post = new THREE.MeshStandardNodeMaterial({ color: 0x2e3a32, roughness: 0.6, metalness: 0.4 });
    for (const [cx, cz] of [[0.6, 0.6], [BLOCK - 0.6, 0.6], [0.6, BLOCK - 0.6], [BLOCK - 0.6, BLOCK - 0.6]]) {
      world.createCollider(RAPIER.ColliderDesc.cylinder(2, 0.12).setTranslation(x0 + cx, 2, z0 + cz));
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 4, 10), post);
      m.position.set(x0 + cx, 2, z0 + cz); m.castShadow = true;
      scene.add(m);
    }
  }
  // crash wall (east of the lot) and a ramp
  const concreteBlock = new THREE.MeshStandardNodeMaterial({ color: 0x8b857a, roughness: 0.9 });
  addStatic(world, scene, concreteBlock, 55, 1, 30, 1.2, 2, 30);
  addStatic(world, scene, concreteBlock, -30, 0.55, 25, 5, 0.3, 9, 0, -0.17);

  // ------------------------------------------------------------------ vehicles
  const qname = quality.name;
  const factory = createVehicleFactory({ quality: qname });
  await Promise.race([factory.ready, new Promise((r) => setTimeout(r, 1500))]);
  const skids = new SkidMarks();
  scene.add(skids.mesh);
  let modelIdx = Math.max(0, MODELS.findIndex((m) => m.id === (params.get('model') ?? 'bancroft')));
  let variant = Number(params.get('variant') ?? 0);
  const mode = params.get('mode') ?? 'drive';
  const log: string[] = [];
  let player: Vehicle;
  const parked: Vehicle[] = [];
  const wire = (v: Vehicle, key: string) => {
    v.on('skid', (e) => skids.add(e as SkidEvent, key));
    v.on('impact', (e) => { const i = e as ImpactEvent; log.unshift(`impact ${key} Δv ${i.speedChange.toFixed(1)} m/s zone ${i.zone} dmg ${(i.damage * 100).toFixed(0)}%`); log.length = Math.min(log.length, 5); });
    v.on('damage', (e) => { const d = e as DamageEvent; log.unshift(`${key}: ${d.stage}`); log.length = Math.min(log.length, 5); });
    v.on('destroyed', () => { log.unshift(`${key}: DESTROYED`); });
  };
  const spawnPlayer = (x = 0, z = 40, yaw = 0) => {
    player?.dispose();
    player = factory.spawn(world, scene, MODELS[modelIdx].id, { x, y: 0.1, z, yaw }, variant);
    player.setLights({ head: true });
    wire(player, 'player');
  };

  const lineup = mode === 'lineup';
  const turntable = mode === 'turntable';
  if (lineup) {
    // every model parked along one curb of the block street, nose to tail
    let z = -60;
    MODELS.forEach((m, i) => {
      const v = factory.spawn(world, scene, m.id, { x: ROAD / 2 - 2.2 - (m.W > 2.3 ? 0.3 : 0), y: 0.1, z, yaw: 0 }, i + variant);
      parked.push(v);
      z += (m.cargo ? m.cargo[m.cargo.length - 1].s1 : m.L) + 1.6;
    });
    spawnPlayer(-30, 40);
  } else if (turntable) {
    spawnPlayer(0, 30);
  } else if (mode === 'traffic') {
    spawnPlayer(0, 40);
  } else {
    // parked cars in the lot to crash into
    for (let i = 0; i < 4; i++) {
      const v = factory.spawn(world, scene, MODELS[(i * 3 + 1) % 6].id, { x: -8.7 + i * 5.8, y: 0.1, z: 52, yaw: Math.PI }, 10 + i);
      v.brakeLight = false; v.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: true });
      parked.push(v);
      wire(v, `parked${i}`);
    }
    spawnPlayer();
  }

  // ------------------------------------------------------------------ traffic (visual-only instanced proxies)
  const nTraffic = mode === 'traffic' ? Number(params.get('n') ?? (qname === 'low' ? 40 : 150)) : 0;
  const traffic = nTraffic ? factory.createTrafficRenderer(nTraffic) : null;
  const tcars: { modelId: string; variant: number; x: number; y: number; z: number; yaw: number; brake: boolean; lane: number; axis: 0 | 1; dir: number; v: number }[] = [];
  if (traffic) {
    scene.add(traffic.object);
    const weights = ['fareway', 'fareway', 'fareway', 'bancroft', 'bancroft', 'tiverton', 'ferris', 'homestead', 'b60', 'walkin', 'bancroft_patrol', 'ct40', 'b80'];
    for (let i = 0; i < nTraffic; i++) {
      const axis = (i % 2) as 0 | 1, dir = i % 4 < 2 ? 1 : -1;
      const lane = Math.floor(i / 4) % 5 - 2;
      const road = lane * (BLOCK + ROAD);
      tcars.push({ modelId: weights[(i * 7) % weights.length], variant: i, x: 0, y: 0, z: 0, yaw: 0, brake: false, lane: road + dir * 2.6, axis, dir, v: 4 + (i % 5) });
      const c = tcars[i];
      const along = ((i * 37) % 300) - 150;
      if (axis === 0) { c.x = c.lane; c.z = along - 50; c.yaw = dir > 0 ? Math.PI : 0; } else { c.z = c.lane - 50; c.x = along; c.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
  }
  const moveTraffic = (dt: number) => {
    if (!traffic) return;
    for (const c of tcars) {
      const d = c.v * dt * c.dir;
      if (c.axis === 0) { c.z += d; if (c.z > 100) c.z -= 300; if (c.z < -200) c.z += 300; } else { c.x += d; if (c.x > 150) c.x -= 300; if (c.x < -150) c.x += 300; }
      c.brake = Math.sin(c.x * 0.1 + c.z * 0.13) > 0.6;
    }
    traffic.setInstances(tcars, camera.position);
  };

  // ------------------------------------------------------------------ input
  const input = new Input(renderer.domElement);
  if (input.isTouch || params.has('touch')) {
    input.isTouch = true;
    new TouchControls(input, [
      { label: 'BRAKE', action: 'sink', hold: true },
      { label: 'HAND', action: 'jump', hold: true },
      { label: 'NEXT', action: 'use', hold: false },
      { label: 'CAM', action: 'photo', hold: false },
    ]);
    document.body.classList.add('touch');
  }
  let auto: { throttle: number; brake: number; steer: number; handbrake: boolean } | null = null;
  let camMode = 0; // 0 chase, 1 hood, 2 orbit
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (keys.has(e.code)) return; keys.add(e.code);
    if (e.code === 'KeyV') { variant++; spawnAt(); }
    if (e.code === 'KeyH') { lightsOn = !lightsOn; player.setLights({ head: lightsOn }); }
    if (e.code === 'KeyB') { beacon = !beacon; player.setLights({ beacon, hazard: beacon }); }
    if (e.code === 'KeyR') { player.repair(); player.setPose({ x: 0, y: 0.3, z: 40, yaw: 0 }); skids.clear(); }
    if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
    if (e.code >= 'Digit1' && e.code <= 'Digit4') player.applyDamage(ZONES[Number(e.code.slice(5)) - 1], 0.35);
    if (e.code === 'Digit5') api.crashTest();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  let lightsOn = true, beacon = false;
  const spawnAt = () => {
    const b = player.body.translation();
    const yaw = new THREE.Euler().setFromQuaternion(player.object.quaternion, 'YXZ').y;
    spawnPlayer(b.x, b.z, yaw);
  };

  // ------------------------------------------------------------------ camera
  const camPos = new THREE.Vector3(0, 4, 50), camLook = new THREE.Vector3();
  let orbit = 0, orbitPitch = 0.12, turnT = 0;
  const updateCamera = (dt: number) => {
    const o = player.object;
    const g = player.asset.lod0;
    const len = g.maxZ - g.minZ;
    if (turntable) {
      turnT += dt * 0.35;
      const r = Math.max(7, len * 1.05);
      camera.position.set(o.position.x + Math.sin(turnT) * r, 1.4 + g.height * 0.35, o.position.z + Math.cos(turnT) * r);
      camera.lookAt(o.position.x, g.height * 0.42, o.position.z);
      return;
    }
    const look = input.consumeLook();
    orbit += look.yaw; orbitPitch = THREE.MathUtils.clamp(orbitPitch - look.pitch, -0.2, 1.2);
    if (camMode !== 2) orbit *= Math.pow(0.1, dt);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(o.quaternion); fwd.y = 0; fwd.normalize();
    const yaw = Math.atan2(-fwd.x, -fwd.z) + orbit;
    if (camMode === 1) {
      const seat = player.seatPose('driver');
      camera.position.setFromMatrixPosition(seat).add(new THREE.Vector3(0, 0.55, 0).applyQuaternion(o.quaternion));
      camera.quaternion.copy(o.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.05, orbit, 0, 'YXZ')));
      return;
    }
    const dist = Math.max(6.5, len * 0.95 + 2.5), h = 1.6 + g.height * 0.55;
    const target = new THREE.Vector3(o.position.x + Math.sin(yaw) * dist * Math.cos(orbitPitch), o.position.y + h + Math.sin(orbitPitch) * dist * 0.5, o.position.z + Math.cos(yaw) * dist * Math.cos(orbitPitch));
    camPos.lerp(target, 1 - Math.pow(0.002, dt));
    camLook.lerp(new THREE.Vector3(o.position.x, o.position.y + g.height * 0.5, o.position.z), 1 - Math.pow(0.0005, dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  };

  // ------------------------------------------------------------------ hud
  const hud = new DebugHud(document.body);
  if (params.get('hud') === '0') { hud.visible = false; hud.el.style.display = 'none'; }
  const frames = new FrameStats();
  let physMs = 0;
  window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  // ------------------------------------------------------------------ sim
  const stepOnce = () => {
    const t0 = performance.now();
    const i = auto ?? (() => {
      const mv = input.move;
      const steerKey = mv.x;
      return { throttle: Math.max(0, mv.y), brake: Math.max(0, -mv.y, input.isHeld('sink') ? 1 : 0), steer: steerKey, handbrake: input.isHeld('jump') };
    })();
    if (!turntable && !lineup) player.setInput(i);
    player.update(DT);
    for (const v of parked) v.update(DT);
    world.step();
    skids.update(DT);
    physMs = physMs * 0.95 + (performance.now() - t0) * 0.05;
  };
  let acc = 0;

  const api = {
    backend, quality: qname, world, scene, camera, renderer,
    get player() { return player; }, parked, factory, frames, log,
    /** Advance the simulation synchronously (no rendering). */
    simulate(seconds: number) { const n = Math.round(seconds / DT); for (let k = 0; k < n; k++) stepOnce(); updateCamera(seconds); },
    /** Scripted input (null = keyboard/touch). */
    setAuto(i: typeof auto) { auto = i; },
    setModel(id: string, v = 0, pose = { x: 0, z: 40, yaw: 0 }) { modelIdx = MODELS.findIndex((m) => m.id === id); variant = v; spawnPlayer(pose.x, pose.z, pose.yaw); },
    setCamera(x: number, y: number, z: number, lx: number, ly: number, lz: number, fov = 55) { freeCam = { p: new THREE.Vector3(x, y, z), l: new THREE.Vector3(lx, ly, lz), fov }; },
    clearCamera() { freeCam = null; camera.fov = 55; camera.updateProjectionMatrix(); },
    renderOnce() { if (freeCam) applyFree(); renderer.render(scene, camera); },
    /** Render now and return the canvas as a PNG data URL (read before the frame is composited). */
    capture() { if (freeCam) applyFree(); renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    /** Stop / restart the interactive loop (the shot rig drives frames itself). */
    pause() { renderer.setAnimationLoop(null); },
    resume() { renderer.setAnimationLoop(loop); },
    /** 30 mph (13.4 m/s) straight into the crash wall from a run-up. Returns the impact report. */
    crashTest(speed = 13.4) {
      player.repair(); skids.clear();
      player.setPose({ x: 40, y: 0.3, z: 30, yaw: -Math.PI / 2 });
      // settle, then launch at speed toward +x
      for (let k = 0; k < 30; k++) { player.setInput({ throttle: 0, brake: 0, steer: 0, handbrake: false }); player.update(DT); world.step(); }
      player.body.setLinvel({ x: speed, y: 0, z: 0 }, true);
      return speed;
    },
    trafficMs: () => traffic?.lastMs ?? 0,
    moveTraffic,
    stats() {
      const g = player.asset.lod0;
      return { model: player.modelId, tris: g.tris, speed: player.speed, damage: player.damage, stage: player.stage, zones: { ...player.zones }, gear: player.physics.gear, rpm: player.physics.rpm, physMs, stepMs: player.stepMs };
    },
  };
  let freeCam: { p: THREE.Vector3; l: THREE.Vector3; fov: number } | null = null;
  const applyFree = () => { camera.position.copy(freeCam!.p); camera.lookAt(freeCam!.l); if (camera.fov !== freeCam!.fov) { camera.fov = freeCam!.fov; camera.updateProjectionMatrix(); } };
  (window as unknown as { __VEH: typeof api }).__VEH = api;
  document.getElementById('loading')?.remove();
  api.simulate(0.5);

  const clock = new THREE.Timer();
  const loop = (t: number) => {
    clock.update(t);
    const dt = Math.min(clock.getDelta(), 0.1);
    frames.push(dt * 1000);
    input.poll();
    if (input.pressed('use')) { modelIdx = (modelIdx + 1) % MODELS.length; spawnAt(); }
    if (input.pressed('photo')) camMode = (camMode + 1) % 3;
    acc += dt;
    let n = 0;
    while (acc >= DT && n < 5) { stepOnce(); acc -= DT; n++; }
    if (n === 5) acc = 0;
    input.endFrame();
    if (freeCam) applyFree(); else updateCamera(dt);
    moveTraffic(dt);
    sun.target.position.copy(player.object.position); sun.position.copy(player.object.position).add(new THREE.Vector3(-40, 60, 25));
    renderer.render(scene, camera);
    const s = frames.summary();
    const ph = player.physics;
    const info = renderer.info.render;
    hud.set(
      `VEHICLE TEST LOT  [${backend.toUpperCase()} | ${qname}]  ${s.avg.toFixed(1)} ms (${s.fps.toFixed(0)} fps)  draws ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
      `${MODELS[modelIdx].displayName}  #${variant}  (LOD0 ${player.asset.lod0.tris} tris)\n` +
      `${(Math.abs(ph.speed) * 2.237).toFixed(0)} mph  ${ph.reverse ? 'R' : 'D' + ph.gear}  ${ph.rpm.toFixed(0)} rpm  ` +
      `damage ${(player.damage * 100).toFixed(0)}% ${player.stage}  [F ${(player.zones.front * 100).toFixed(0)} R ${(player.zones.rear * 100).toFixed(0)} L ${(player.zones.left * 100).toFixed(0)} R ${(player.zones.right * 100).toFixed(0)}]\n` +
      `physics ${physMs.toFixed(2)} ms/step (all vehicles)  player ${player.stepMs.toFixed(2)} ms` + (traffic ? `  traffic ${nTraffic} inst ${traffic.lastMs.toFixed(2)} ms` : '') + '\n' +
      log.slice(0, 4).join('\n') + '\n' +
      (input.isTouch ? 'stick drive · BRAKE · HAND · NEXT model · CAM' : 'WASD drive · Space handbrake · F model · V variant · H lights · B beacon · C cam · R reset · 1-4 dent · 5 crash test'),
    );
  };
  renderer.setAnimationLoop(loop);
}
