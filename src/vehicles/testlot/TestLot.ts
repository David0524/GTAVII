import * as THREE from 'three/webgpu';
import RAPIER from '../rapier';
import { mix, color, positionWorld, mx_noise_float, float, smoothstep, fract, step, max } from 'three/tsl';
import { createRenderer } from '../../engine/renderer';
import { qualityFromUrl } from '../../engine/quality';
import { Input } from '../../input/Input';
import { TouchControls } from '../../ui/TouchControls';
import { DebugHud, FrameStats } from '../../engine/debug/DebugHud';
import { createVehicleFactory, setVehicleViewCamera, updateHeroRing, HERO_RING, type Vehicle, type SkidEvent, type ImpactEvent, type DamageEvent } from '../index';
import { SkidMarks } from '../SkidMarks';
import { MODELS } from '../models';
import { variantOf, heroGenTimes } from '../assets';
import { BIKES } from '../twowheel/bikes';
import type { TwoWheeler } from '../twowheel/TwoWheeler';
import { SubwayTrain } from '../subway/SubwayTrain';
import { DriverAssist, TOUCH_DEFAULTS, PAD_DEFAULTS } from '../assist';
import { ZONES } from '../gen/morphs';
import { VehicleLights, type VehicleClass } from '../../shared/traffic';
import { CarLightPool, updateCarLights, setGroundLightLevel } from '../lighting';

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
  sky.addColorStop(0, '#9aa2b4'); sky.addColorStop(0.3, '#f2e6cc'); sky.addColorStop(0.48, '#c8b090');
  sky.addColorStop(0.5, '#6a5e52'); sky.addColorStop(0.7, '#3a322c'); sky.addColorStop(1, '#1e1a17');
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
  setVehicleViewCamera(camera);
  const sun = new THREE.DirectionalLight(0xffe2bc, 2.4);
  sun.position.set(-40, 60, 25);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 200 });
  sun.shadow.bias = -0.0004;
  const hemi = new THREE.HemisphereLight(0xbcc4d8, 0x4a3e34, 1.1);
  scene.add(sun, sun.target, hemi);
  // time of day for light tests: 0 = afternoon, 1 = night (moonlight + sodium-ish sky glow)
  let night = 0;
  const DAY = { bg: new THREE.Color(0xb8ad9c), fog: new THREE.Color(0xb0a494), sun: new THREE.Color(0xffe2bc) };
  const NIGHT = { bg: new THREE.Color(0x0d1018), fog: new THREE.Color(0x10121a), sun: new THREE.Color(0x8ea4d8) };
  const setNight = (f: number) => {
    night = f;
    (scene.background as THREE.Color).copy(DAY.bg).lerp(NIGHT.bg, f);
    (scene.fog as THREE.Fog).color.copy(DAY.fog).lerp(NIGHT.fog, f);
    sun.color.copy(DAY.sun).lerp(NIGHT.sun, f);
    sun.intensity = THREE.MathUtils.lerp(2.4, 0.12, f);
    hemi.intensity = THREE.MathUtils.lerp(1.1, 0.14, f);
    scene.environmentIntensity = THREE.MathUtils.lerp(0.9, 0.1, f);
    setGroundLightLevel(f);
  };

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

  // ------------------------------------------------------------------ hill road (slopes, crown, cross-fall)
  // West of the grid: a 12 m crowned street. Flat, then +8% up to a 6 m crest, then a 12% descent
  // (steeper than most Manhattan streets; the real city has about 5–15 m of relief), plus a
  // 5% cross-fall section for parking tests.
  const HILL_X = -100;
  const hillProfile = (z: number) => {
    if (z > 60) return 0;
    if (z > -15) return (60 - z) * 0.08;
    if (z > -45) return 6 - 0.0025 * (z + 30) * (z + 30) + 0.5625; // rounded crest
    if (z > -95) return Math.max(0, 6 - (-45 - z) * 0.12);
    return 0;
  };
  const crossFall = (z: number) => (z > 110 && z < 170 ? 0.05 * Math.min(1, (z - 110) / 8, (170 - z) / 8) : 0);
  const roadHeight = (x: number, z: number) => {
    const u = x - HILL_X, a = Math.abs(u);
    const base = hillProfile(z) + crossFall(z) * u;
    if (a <= 6) return base + 0.15 * (1 - (u / 6) ** 2); // 2.5% crown at the edge
    return base * Math.max(0, 1 - (a - 6) / 6) + 0.0 * a; // embankment down to the lot
  };
  {
    const xs: number[] = []; for (let u = -12; u <= 12; u += 1) xs.push(HILL_X + u);
    const zs: number[] = []; for (let z = 190; z >= -130; z -= 2) zs.push(z);
    const pos = new Float32Array(xs.length * zs.length * 3), idx: number[] = [];
    zs.forEach((z, j) => xs.forEach((x, i) => { const k = (j * xs.length + i) * 3; pos[k] = x; pos[k + 1] = roadHeight(x, z) + 0.01; pos[k + 2] = z; }));
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1;
      idx.push(a, b, c, b, d, c); // CCW seen from above (z decreases with j)
    }
    world.createCollider(RAPIER.ColliderDesc.trimesh(pos, new Uint32Array(idx)).setFriction(1));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const hill = new THREE.Mesh(g, asphalt); hill.receiveShadow = true; scene.add(hill);
    // centre line paint along the crown
    const line = new THREE.MeshStandardNodeMaterial({ color: 0xd9c98a, roughness: 0.7 });
    for (let z = 186; z > -126; z -= 6) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 3), line);
      const h0 = roadHeight(HILL_X, z), h1 = roadHeight(HILL_X, z - 1);
      m.position.set(HILL_X, h0 + 0.165, z - 1.5); m.rotation.set(-Math.PI / 2 + Math.atan2(h1 - h0, 1), 0, 0);
      scene.add(m);
    }
  }

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
  const bikes: TwoWheeler[] = [];
  let riding: TwoWheeler | null = null; // when set, input and camera go to the bike
  let bikeIdx = -1;
  const wire = (v: Vehicle, key: string) => {
    v.on('skid', (e) => skids.add(e as SkidEvent, key));
    v.on('impact', (e) => { const i = e as ImpactEvent; log.unshift(`impact ${key} Δv ${i.speedChange.toFixed(1)} m/s zone ${i.zone} dmg ${(i.damage * 100).toFixed(0)}%`); log.length = Math.min(log.length, 5); });
    v.on('damage', (e) => { const d = e as DamageEvent; log.unshift(`${key}: ${d.stage}`); log.length = Math.min(log.length, 5); });
    v.on('destroyed', () => { log.unshift(`${key}: DESTROYED`); });
  };
  const spawnPlayer = (x = 0, z = 40, yaw = 0) => {
    player?.dispose();
    player = factory.spawn(world, scene, MODELS[modelIdx].id, { x, y: 0.1, z, yaw }, variant);
    player.security.keysIn = true; player.security.locked = false; // the tester owns this car
    player.setLights({ head: true });
    player.isPlayer = true;
    void player.prefetchHero().catch(() => undefined); // worker builds the hero mesh in the background
    wire(player, 'player');
  };

  const lineup = mode === 'lineup';
  const turntable = mode === 'turntable';
  if (lineup) {
    // every model parked along one curb of the block street, nose to tail
    // spaced by bumper extents (front of each = rear of the previous + a gap)
    let cursor = -75;
    MODELS.forEach((m, i) => {
      const mid = m.sF + m.wheelbase / 2;
      const front = mid + m.bumper.depth + 0.05;
      const rear = (m.cargo ? m.cargo[m.cargo.length - 1].s1 : m.L) - mid + (m.rearBumper ?? m.bumper).depth + 0.05;
      const z = cursor + front;
      const v = factory.spawn(world, scene, m.id, { x: ROAD / 2 - 1.5 - m.W / 2, y: 0.1, z, yaw: 0 }, i + variant);
      v.brakeLight = false; v.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: true });
      parked.push(v);
      cursor = z + rear + 1.4;
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

  // ------------------------------------------------------------------ car lights: fixed pool of real lights for the nearest lamps
  const carLights = new CarLightPool(scene, qname, quality.shadows && (qname === 'high' || qname === 'ultra'));
  let lastTrafficCands: ReturnType<NonNullable<typeof traffic>['lightCandidates']> = [];
  let heroOn = !params.has('nohero');
  const prerender = () => {
    if (heroOn) updateHeroRing([player, ...parked], camera.position, HERO_RING[qname]);
    updateCarLights(carLights, [player, ...parked], camera.position, lastTrafficCands);
  };
  if (params.has('night')) setNight(Number(params.get('night')) || 1);

  // ------------------------------------------------------------------ traffic (visual-only instanced proxies)
  const nTraffic = mode === 'traffic' ? Number(params.get('n') ?? (qname === 'low' ? 40 : 150)) : 0;
  const traffic = nTraffic ? factory.createTrafficRenderer(nTraffic) : null;
  const tcars: { vclass: VehicleClass; variant: number; x: number; y: number; z: number; yaw: number; lights: number; lane: number; axis: 0 | 1; dir: number; v: number }[] = [];
  if (traffic) {
    scene.add(traffic.object);
    const weights: VehicleClass[] = ['taxi', 'taxi', 'taxi', 'sedan', 'sedan', 'hardtop', 'compact', 'wagon', 'box_truck', 'step_van', 'police', 'bus', 'garbage', 'bicycle', 'motorcycle', 'ambulance', 'mail_truck', 'police_motorcycle', 'fire_engine', 'ice_cream', 'ladder_truck', 'bicycle'];
    for (let i = 0; i < nTraffic; i++) {
      const axis = (i % 2) as 0 | 1, dir = i % 4 < 2 ? 1 : -1;
      const lane = Math.floor(i / 4) % 5 - 2;
      const road = lane * (BLOCK + ROAD);
      tcars.push({ vclass: weights[(i * 7) % weights.length], variant: i, x: 0, y: 0, z: 0, yaw: 0, lights: 0, lane: road + dir * 2.6, axis, dir, v: 4 + (i % 5) });
      const c = tcars[i];
      const along = ((i * 37) % 300) - 150;
      if (axis === 0) { c.x = c.lane; c.z = along - 50; c.yaw = dir > 0 ? Math.PI : 0; } else { c.z = c.lane - 6; c.x = along; c.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2; }
    }
  }
  const moveTraffic = (dt: number) => {
    if (!traffic) return;
    for (const c of tcars) {
      const d = c.v * dt * c.dir;
      if (c.axis === 0) { c.z += d; if (c.z > 100) c.z -= 300; if (c.z < -200) c.z += 300; } else { c.x += d; if (c.x > 150) c.x -= 300; if (c.x < -150) c.x += 300; }
      const brake = Math.sin(c.x * 0.1 + c.z * 0.13) > 0.6;
      c.lights = VehicleLights.Head | (brake ? VehicleLights.Brake : 0) | (c.vclass === 'taxi' && c.variant % 3 === 0 ? VehicleLights.RoofLight : 0)
        | (c.vclass === 'police' && c.variant % 2 === 0 ? VehicleLights.Siren : 0) | (c.variant % 17 === 0 ? VehicleLights.Hazard : 0);
    }
    lastTrafficCands = traffic.lightCandidates(tcars, camera.position);
    traffic.setInstances(tcars, camera.position, carLights);
  };

  // ------------------------------------------------------------------ subway (mode=subway): straight track south of the lot
  let train: SubwayTrain | null = null;
  const trainSim = { s: 60, v: 0, phase: 'dwell' as 'dwell' | 'run', t: 0, dir: 1 };
  if (mode === 'subway') {
    const TZ = 230;
    const rail = new THREE.MeshStandardNodeMaterial({ color: 0x6a645c, metalness: 0.8, roughness: 0.4 });
    const tie = new THREE.MeshStandardNodeMaterial({ color: 0x3a2a20, roughness: 0.95 });
    for (const sx of [-0.72, 0.72]) { const m = new THREE.Mesh(new THREE.BoxGeometry(400, 0.15, 0.07), rail); m.position.set(0, 0.075, TZ + sx); scene.add(m); }
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.12, 2.5), tie, 600);
    for (let i = 0; i < 600; i++) ties.setMatrixAt(i, new THREE.Matrix4().makeTranslation(-200 + i * 0.66, 0.03, TZ));
    scene.add(ties);
    // a low platform edge to stand on
    addStatic(world, scene, sidewalk, 0, 0.55, TZ - 3.0, 80, 1.1, 3.4);
    train = new SubwayTrain(world, scene, { cars: 4, seed: variant + 3, graffiti: Number(params.get('graffiti') ?? 0.85), quality: qname });
    // track runs along +x; the train's front is toward -x when s grows from the +x end
    const pts = []; for (let x = 200; x >= -200; x -= 5) pts.push({ x, y: 0.15, z: TZ });
    train.setTrack(pts);
  }
  const runTrain = (dt: number) => {
    if (!train) return;
    const ts = trainSim; ts.t += dt;
    if (ts.phase === 'dwell') { const open = Math.min(1, Math.max(0, (ts.t - 1) / 1.5)) * (ts.t < 9 ? 1 : Math.max(0, 1 - (ts.t - 9) / 1.5)); train.setState({ s: ts.s, doorsOpen: open }); if (ts.t > 11) { ts.phase = 'run'; ts.t = 0; } }
    else { ts.v = Math.min(ts.v + 1.1 * dt, 14); ts.s += ts.v * dt; if (ts.s > 330) { ts.s = 60; ts.v = 0; ts.phase = 'dwell'; ts.t = 0; } train.setState({ s: ts.s, doorsOpen: 0 }); }
    train.update();
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
  // driver assist: touch default (analog pedals + steering assist); ?assist=0/1, ?auto=1 for auto-accelerate
  const assistOn = params.has('assist') ? params.get('assist') !== '0' : input.isTouch;
  let assist: DriverAssist | null = assistOn ? new DriverAssist({ ...TOUCH_DEFAULTS, autoAccelerate: params.get('auto') === '1' }) : null;
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
    if (e.code === 'KeyI') player.ignition(!player.engineRunning, { key: true });
    if (e.code === 'KeyG') api.shoot();
    if (e.code === 'KeyO') player.forceFailure('overheat');
    if (e.code === 'KeyK') player.forceFailure('deadBattery');
    if (e.code === 'KeyU') player.forceFailure('vapourLock');
    if (e.code === 'KeyN') { bikeIdx = (bikeIdx + 1) % (BIKES.length + 1); if (bikeIdx === BIKES.length) { riding = null; } else { const p = player.object.position; api.rideBike(BIKES[bikeIdx].id, { x: p.x + 4, z: p.z, yaw: 0 }); } }
    if (e.code === 'KeyJ' && riding?.crashed) riding.rightUp();
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
    const o = riding ? riding.object : player.object;
    const g = riding ? { maxZ: 1.2, minZ: -1.2, height: 1.4 } : player.asset.lod0;
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
      const seat = (riding ?? player).seatPose('driver');
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
    if (riding) { riding.setInput(i); player.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: true }); }
    else if (!turntable && !lineup) player.setInput(assist ? assist.apply(i, player, DT) : i);
    player.update(DT);
    for (const b of bikes) b.update(DT);
    for (const v of parked) v.update(DT);
    runTrain(DT);
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
    /** Render one frame (info counters reset first: with the loop paused nothing else resets them). */
    renderOnce() { if (freeCam) applyFree(); moveTraffic(0); prerender(); renderer.info.reset(); renderer.render(scene, camera); },
    /** Render now and return the canvas as a PNG data URL (read before the frame is composited). */
    capture() { if (freeCam) applyFree(); moveTraffic(0); prerender(); renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
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
    bikes,
    /** Set or clear the driver assist (null = raw input). */
    setAssist(o: Partial<typeof TOUCH_DEFAULTS> | null) { assist = o ? new DriverAssist({ ...TOUCH_DEFAULTS, ...o }) : null; },
    get assist() { return assist; }, PAD_DEFAULTS,
    get train() { return train; }, trainSim,
    get riding() { return riding; },
    /** Spawn a two-wheeler and ride it (input + camera). */
    rideBike(id: string, pose = { x: 0, z: 40, yaw: 0 }, variant = 0) {
      const b = factory.spawnBike(world, scene, id, { x: pose.x, y: 0.2, z: pose.z, yaw: pose.yaw }, variant);
      b.on('skid', (e) => skids.add(e as SkidEvent, b.id));
      b.on('crash', (e) => { const c = e as { cause: string; speed: number }; log.unshift(`${b.id} CRASH (${c.cause}) at ${(c.speed * 2.237).toFixed(0)} mph — rider handed to ragdoll`); });
      bikes.push(b); riding = b; return b;
    },
    stopRiding() { riding = null; },
    /** Fire a test round at the player car from the camera (or at a given local point). */
    shoot(local?: { x: number; y: number; z: number }) {
      const o = player.object;
      const target = local ? o.localToWorld(new THREE.Vector3(local.x, local.y, local.z)) : o.localToWorld(new THREE.Vector3((Math.random() - 0.5) * 2, 0.4 + Math.random() * 0.9, (Math.random() - 0.5) * 4));
      const n = camera.position.clone().sub(target).normalize();
      return player.applyHit({ point: target, normal: n, type: 'bullet', source: 'tester' });
    },
    /** Variant options (paint, metallic, vinyl...) of a model. */
    variantOf: (id: string, v: number) => variantOf(MODELS.find((m) => m.id === id)!, v),
    /** Hero mesh ring on/off (off: every car back to the standard LOD0). */
    setHeroRing(on: boolean) { heroOn = on; if (!on) for (const v of [player, ...parked]) v.setHero(false); },
    /** Resolve once every car's hero mesh has been built (worker), then apply the ring. */
    async heroReady() {
      await Promise.all([player, ...parked].map((v) => v.prefetchHero().catch(() => undefined)));
      for (let k = 0; k < 8; k++) prerender();
      return heroGenTimes.slice();
    },
    /** 0 = afternoon, 1 = night. */
    setNight, get night() { return night; }, carLights,
    /** Dent the player at a local point (metres of push), for damage close-ups. */
    dentAt(x: number, y: number, z: number, amount = 0.1, radius = 0.6) { player.object.updateMatrixWorld(); return player.dent(player.object.localToWorld(new THREE.Vector3(x, y, z)), amount, radius); },
    hill: { x: HILL_X, heightAt: (x: number, z: number) => roadHeight(x, z) },
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
    input.poll(dt);
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
    prerender();
    renderer.render(scene, camera);
    const s = frames.summary();
    const ph = player.physics;
    const info = renderer.info.render;
    hud.set(
      `VEHICLE TEST LOT  [${backend.toUpperCase()} | ${qname}]  ${s.avg.toFixed(1)} ms (${s.fps.toFixed(0)} fps)  draws ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
      (riding ? `RIDING ${riding.spec.displayName} ${(Math.abs(riding.speed) * 2.237).toFixed(0)} mph lean ${(riding.lean * 57.3).toFixed(0)}°${riding.crashed ? ' CRASHED (J to right it)' : ''}\n` : '') +
      `${MODELS[modelIdx].displayName}  #${variant}  (LOD0 ${player.asset.lod0.tris} tris)\n` +
      `${(Math.abs(ph.speed) * 2.237).toFixed(0)} mph  ${ph.reverse ? 'R' : 'D' + ph.gear}  ${ph.rpm.toFixed(0)} rpm  ` +
      `damage ${(player.damage * 100).toFixed(0)}% ${player.stage}  [F ${(player.zones.front * 100).toFixed(0)} R ${(player.zones.rear * 100).toFixed(0)} L ${(player.zones.left * 100).toFixed(0)} R ${(player.zones.right * 100).toFixed(0)}]\n` +
      `${player.trim} · plate ${player.plate} · ${player.mileage.toFixed(0)} mi · ${player.engineRunning ? 'engine on' : 'ENGINE OFF'} ${player.engine.temp.toFixed(0)}°C${player.engine.overheating ? ' OVERHEATING' : ''} · fuel ${player.fuel.toFixed(1)} L · ${player.security.locked ? 'locked' : 'unlocked'}${player.security.keysIn ? ' keys' : ''}${player.security.hotwired ? ' hot-wired' : ''}\n` +
      `glass F${player.components.glass.front} R${player.components.glass.rear} L${player.components.glass.left} R${player.components.glass.right} · tyres ${player.components.tyresFlat.map((f) => (f ? 'X' : 'o')).join('')} · radiator ${(player.components.radiator * 100).toFixed(0)}% engine ${(player.components.engine * 100).toFixed(0)}% tank ${(player.components.fuelTank * 100).toFixed(0)}%\n` +
      `physics ${physMs.toFixed(2)} ms/step (all vehicles)  player ${player.stepMs.toFixed(2)} ms` + (traffic ? `  traffic ${nTraffic} inst ${traffic.lastMs.toFixed(2)} ms` : '') + '\n' +
      log.slice(0, 4).join('\n') + '\n' +
      (input.isTouch ? 'stick drive · BRAKE · HAND · NEXT model · CAM' : 'WASD drive · Space handbrake · F model · V variant · H lights · B beacon · C cam · R reset · 1-4 dent · 5 crash test · I ignition · G shoot · O overheat · K dead battery · U vapour lock · N bikes · J right a bike'),
    );
  };
  renderer.setAnimationLoop(loop);
}
