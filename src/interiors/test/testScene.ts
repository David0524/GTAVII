/**
 * ?interiors=1 : the interiors workstream's own test scene (engine wires the real thing later).
 *
 *   ?interiors=1                         walk the Corwin block (W 31st St, Broadway-6th Ave): every door works
 *   &at=x,z,deg                          start elsewhere on foot
 *   &t=HH:MM                             clock (default 14:00)        &power=dim|off   area brownout
 *   &gallery=<kind>&n=<0..29>            generator gallery: one seeded interior of <kind>, camera at the door
 *   &cam=x,y,z,yaw,pitch                 free camera pose (capture rig)
 *   &quality=low|medium|high|ultra  &webgl=1
 * Keys: 1 portals overlay · 2 streaming overlay · 3 collider view · P free cam · H hud
 */
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRenderer } from '../../engine/renderer';
import { qualityFromUrl } from '../../engine/quality';
import { Atmosphere } from '../../world/Atmosphere';
import { loadSkyline } from '../../world/Skyline';
import { buildChunk, SIDEWALK_H } from '../../world/meshBuilder';
import { readChunk } from '../../shared/chunkFormat';
import { loadTerrain, heightAt } from '../../shared/terrain';
import { Physics } from '../../physics/Physics';
import { PlayerController } from '../../player/PlayerController';
import { StandInBody } from '../../player/StandInBody';
import { OrbitCamera } from '../../camera/OrbitCamera';
import { FlyCamera } from '../../camera/FlyCamera';
import { Input } from '../../input/Input';
import { FrameStats } from '../../engine/debug/DebugHud';
import { createInteriors } from '../index';
import { buildShell, type ShellArrays, type WindowArrays } from './testShell';
import { createWindowRoomMaterial } from '../windowRooms';
import { roofHatchesWorld } from '../layout';
import { buildInterior } from '../build';
import type { BuildingIdx, UnitRec } from '../indexFormat';
import { createInteriorMaterial, createGlassMaterial, type InteriorLook } from '../runtime/material';
import type { MeshArrays } from '../spec';
import { hm } from '../catalog';

const CORWIN_START = { x: -296, z: -673.5, deg: 0 };

export async function runInteriorsTest() {
  const params = new URLSearchParams(location.search);
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.08, 30000);
  const onResize = () => { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect > 2 ? 52 : 60; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
  addEventListener('resize', onResize); onResize();
  const minutes = params.has('t') ? hm(params.get('t')!) : 14 * 60;
  const atmo = new Atmosphere(scene);
  const day = Math.max(0, Math.min(1, (Math.min(minutes - 5 * 60, 20 * 60 - minutes)) / 90));
  atmo.setSun(day > 0 ? 200 + (minutes - 12 * 60) / 6 : 300, day > 0 ? 8 + 55 * Math.sin(Math.PI * Math.max(0, Math.min(1, (minutes - 6 * 60) / (14 * 60)))) : -8);
  atmo.sun.intensity = 0.4 + 2.2 * day; atmo.hemi.intensity = 0.25 + 1.5 * day;
  const base = import.meta.env.BASE_URL + 'data/';
  await loadTerrain();

  const interiors = createInteriors({ quality: quality.name, content: { interiors: null, places: null } });
  await interiors.ready;
  if (params.get('power')) interiors.setPower('all', params.get('power') as 'dim' | 'off');
  const clock = { minutes, date: '1974-07-19' };
  const hud = document.createElement('pre');
  Object.assign(hud.style, { position: 'fixed', left: '8px', top: '8px', margin: '0', padding: '6px 8px', background: '#0d0b09cc', color: '#efe3c4', font: '11px/1.35 ui-monospace, monospace', zIndex: '10', pointerEvents: 'none', whiteSpace: 'pre' });
  document.body.appendChild(hud);
  document.getElementById('loading')?.remove();
  const frames = new FrameStats();
  const debug: Record<string, unknown> = { backend, quality: quality.name, renderer, scene, camera, interiors, frames, ready: false };
  (window as unknown as { __INT: typeof debug }).__INT = debug;

  // ------------------------------------------------------------------ gallery mode: one interior, no city
  const galleryKind = params.get('gallery');
  if (galleryKind) {
    const mat = createInteriorMaterial(), glass = createGlassMaterial();
    const look: InteriorLook = { lampPower: 1, lampTint: new THREE.Color(1, 1, 1), window: new THREE.Color(0.95, 0.86, 0.72).multiplyScalar(1.6 * day + 0.2), ambient: 0.01, flicker: 0 };
    const pw = params.get('power'); if (pw === 'dim') { look.lampPower = 0.45; look.flicker = 1; } else if (pw === 'off') look.lampPower = 0;
    const holder = new THREE.Group(); scene.add(holder);
    const streetMat = new THREE.MeshStandardMaterial({ color: 0x3a2f2c, roughness: 1 }), oppMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2c, roughness: 1 });
    const fly = new FlyCamera(camera, new Input(renderer.domElement));
    let label = '';
    /** Show seeded interior n (0..29) of `kind`; picks are spread evenly across the city's units of that kind. */
    const show = async (kind: string, n: number, view: 'door' | 'back' | 'cam' = 'door') => {
      const list: { b: BuildingIdx; u: UnitRec }[] = [];
      for (const { b, u } of interiors.allUnits()) if (u.kind === kind) list.push({ b, u });
      const step = Math.max(1, Math.floor(list.length / 30));
      const pick = list[(n * step) % Math.max(1, list.length)];
      holder.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); holder.clear();
      if (!pick) { label = `no units of kind ${kind}`; return null; }
      const cr = await fetch(`${base}chunks/${pick.b.i}_${pick.b.j}.bin`).then((r) => r.arrayBuffer()).then(readChunk);
      const rec = cr.buildings.find((x) => x.id === pick.b.id);
      const ring = rec ? Array.from(rec.rings[0], (v, k) => v + ((k % 2 ? pick.b.j : pick.b.i) + 0.5) * 200) : null;
      const t0 = performance.now();
      // built in the unit's local frame; rendered at the origin (frame ignored)
      const built = buildInterior({ unit: pick.u, building: { ...pick.b }, quality: quality.name, ring, street: interiors.index.streets[pick.u.street] ?? '' });
      const ms = performance.now() - t0;
      let tris = 0;
      for (const c of built.cells) for (const [m, mt] of [[c.opaque, mat], [c.glass, glass]] as [MeshArrays | null, THREE.Material][]) if (m) { const me = new THREE.Mesh(geom(m), mt); me.userData.interior = look; holder.add(me); tris += m.index.length / 3; }
      for (const d of built.doors) { if (d.street) continue; const g = new THREE.Group(); g.position.set(...d.hinge); g.rotation.y = d.yaw + d.swing * 1.5; const me = new THREE.Mesh(geom(d.mesh), mat); me.userData.interior = look; g.add(me); holder.add(g); }
      const street = new THREE.Mesh(new THREE.PlaneGeometry(80, 30).rotateX(-Math.PI / 2), streetMat); street.position.set(pick.u.w / 2, -0.05, -15); holder.add(street);
      const opp = new THREE.Mesh(new THREE.BoxGeometry(80, 25, 2), oppMat); opp.position.set(pick.u.w / 2, 12, -22); holder.add(opp);
      const cp = params.get('cam')?.split(',').map(Number);
      if (view === 'cam' && cp) fly.set(cp[0], cp[1], cp[2], THREE.MathUtils.degToRad(cp[3]), THREE.MathUtils.degToRad(cp[4] ?? 0));
      else if (view === 'back') fly.set(Math.min(pick.u.w - 0.6, Math.max(0.6, pick.u.w * 0.75)), 1.65, pick.u.d - 1.0, 0.25 * (pick.u.w > 3 ? 1 : 0), -0.1);
      else fly.set(pick.u.door.t, 1.6, Math.min(1.8, pick.u.d * 0.18), Math.PI, -0.12);
      label = `${kind} #${n}  b${pick.b.id} ${pick.b.address ?? ''}  ${pick.b.year} use ${pick.b.use} style ${pick.b.style}  ${pick.u.w.toFixed(1)}x${pick.u.d.toFixed(1)} m  ${pick.b.district}  ${interiors.index.streets[pick.u.street] ?? ''}\nbuild ${ms.toFixed(0)} ms (main thread, ${quality.name})  verts ${built.stats.verts} tris ${tris} cells ${built.cells.length} slots ${built.slots.length} markers ${built.markers.length} colliders ${built.colliders.length}  [${backend}]`;
      debug.gallery = { label, stats: built.stats, ms, slots: built.slots.length, markers: built.markers.length, colliders: built.colliders.length, building: pick.b.id, unit: pick.u.id };
      return debug.gallery;
    };
    debug.show = show;
    await show(galleryKind, +(params.get('n') ?? 0), params.has('cam') ? 'cam' : (params.get('view') as 'door' | 'back') ?? 'door');
    renderer.setAnimationLoop(() => { fly.update(1 / 60); renderer.render(scene, camera); const i = renderer.info.render; hud.textContent = `${label}\ndraws ${i.drawCalls}`; frames.push(16); });
    debug.ready = true;
    return;
  }

  // ------------------------------------------------------------------ street mode: mini city around the start
  const at = params.get('at')?.split(',').map(Number);
  const start = at ? { x: at[0], z: at[1], deg: at[2] ?? 0 } : CORWIN_START;
  const physics = await Physics.create();
  const skyline = await loadSkyline(base + 'skyline.bin'); scene.add(skyline);
  const cityMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const byBuilding = new Map<number, BuildingIdx>(); for (const b of interiors.index.buildings) byBuilding.set(b.id, b);
  const R = 420, ENTER_R = 260;
  const ci0 = Math.floor((start.x - R) / 200), ci1 = Math.floor((start.x + R) / 200), cj0 = Math.floor((start.z - R) / 200), cj1 = Math.floor((start.z + R) / 200);
  let shellCount = 0, windowCount = 0;
  const wroom = createWindowRoomMaterial();
  wroom.uniforms.minutes.value = minutes; wroom.uniforms.daylight.value = day; wroom.uniforms.power.value = params.get('power') === 'off' ? 0 : params.get('power') === 'dim' ? 0.45 : 1;
  const winAll: WindowArrays = { position: [], normal: [], wuv: [], wtan: [], wdat: [], index: [] };
  await Promise.all(Array.from({ length: (ci1 - ci0 + 1) * (cj1 - cj0 + 1) }, async (_, k) => {
    const i = ci0 + (k % (ci1 - ci0 + 1)), j = cj0 + Math.floor(k / (ci1 - ci0 + 1));
    const r = await fetch(`${base}chunks/${i}_${j}.bin`); if (!r.ok) return;
    const data = readChunk(await r.arrayBuffer()); const ox = (i + 0.5) * 200, oz = (j + 0.5) * 200;
    const hf = (x: number, z: number) => heightAt(ox + x, oz + z);
    const shells: ShellArrays = { position: [], normal: [], color: [], index: [] };
    const keep = data.buildings.filter((rec) => {
      const b = byBuilding.get(rec.id);
      const near = Math.hypot(ox + rec.rings[0][0] - start.x, oz + rec.rings[0][1] - start.z) < ENTER_R;
      if (b && near && rec.minHeight === 0) { const holes = roofHatchesWorld(b).map((r) => r.map((v, q) => v - (q % 2 ? oz : ox))); buildShell(shells, rec, ox, oz, b, hf, holes, winAll); shellCount++; return false; }
      return true;
    });
    const mesh = buildChunk({ ...data, buildings: keep }, 200, hf);
    const g = new THREE.Group(); g.position.set(ox, 0, oz);
    const parts: THREE.BufferGeometry[] = [];
    for (const m of [mesh.buildings, mesh.ground]) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.BufferAttribute(m.position, 3)); ge.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3)); ge.setAttribute('color', new THREE.BufferAttribute(m.color, 3)); ge.setIndex(new THREE.BufferAttribute(m.index, 1)); g.add(new THREE.Mesh(ge, cityMat)); parts.push(ge); }
    if (shells.index.length) { const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(shells.position, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(shells.normal, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(shells.color, 3)); ge.setIndex(shells.index); const sm = new THREE.Mesh(ge, cityMat); sm.name = 'shells'; g.add(sm); parts.push(ge); }
    scene.add(g);
    physics.addChunk({ key: `${i}_${j}`, ox, oz, parts });
  }));
  scene.add(interiors.object);
  if (winAll.index.length) {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(winAll.position, 3)); wg.setAttribute('normal', new THREE.Float32BufferAttribute(winAll.normal, 3));
    wg.setAttribute('wuv', new THREE.Float32BufferAttribute(winAll.wuv, 2)); wg.setAttribute('wtan', new THREE.Float32BufferAttribute(winAll.wtan, 3)); wg.setAttribute('wdat', new THREE.Float32BufferAttribute(winAll.wdat, 4));
    wg.setIndex(winAll.index); const wm = new THREE.Mesh(wg, wroom.material); wm.name = 'tierC_windows'; scene.add(wm); windowCount = winAll.index.length / 6;
  }

  const input = new Input(renderer.domElement);
  const startY = heightAt(start.x, start.z) + SIDEWALK_H;
  const player = new PlayerController(physics, start.x, startY, start.z, THREE.MathUtils.degToRad(start.deg));
  const body = new StandInBody(); scene.add(body.object);
  const orbit = new OrbitCamera(camera, input, physics, player.collider); orbit.snap({ x: start.x, y: startY, z: start.z }, THREE.MathUtils.degToRad(start.deg));
  const fly = new FlyCamera(camera, input);
  let mode: 'onfoot' | 'photo' = 'onfoot';
  const cp = params.get('cam')?.split(',').map(Number);
  if (cp) { fly.set(cp[0], cp[1], cp[2], THREE.MathUtils.degToRad(cp[3]), THREE.MathUtils.degToRad(cp[4] ?? 0)); mode = 'photo'; }

  // ------------------------------------------------------------------ debug overlays
  const overlay = { portals: false, streaming: false, colliders: false };
  const portalLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x40ff80, depthTest: false })); portalLines.renderOrder = 10; scene.add(portalLines);
  const streamPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.6, vertexColors: true, depthTest: false })); streamPts.renderOrder = 10; scene.add(streamPts);
  const colLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff5040, depthTest: true })); scene.add(colLines);
  addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Digit1') overlay.portals = !overlay.portals;
    if (e.code === 'Digit2') overlay.streaming = !overlay.streaming;
    if (e.code === 'Digit3') overlay.colliders = !overlay.colliders;
    if (e.code === 'KeyH') hud.style.display = hud.style.display === 'none' ? '' : 'none';
  });
  const drawOverlays = () => {
    portalLines.visible = overlay.portals; streamPts.visible = overlay.streaming; colLines.visible = overlay.colliders;
    if (overlay.portals) {
      const p: number[] = [];
      for (const L of (interiors as unknown as { live: Map<string, { built: { portals: { pts: number[][]; b: number }[] }; matrix: THREE.Matrix4 }> }).live.values()) for (const q of L.built.portals) {
        const w = q.pts.map((v) => new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(L.matrix));
        for (let k = 0; k < 4; k++) p.push(w[k].x, w[k].y, w[k].z, w[(k + 1) % 4].x, w[(k + 1) % 4].y, w[(k + 1) % 4].z);
      }
      portalLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    }
    if (overlay.streaming) {
      const p: number[] = [], c: number[] = []; const live = (interiors as unknown as { live: Map<string, unknown>; pending: Map<string, unknown> });
      for (const d of [...Array(9).keys()].flatMap((k) => interiors.doorsForChunk(Math.floor(player.pos.x / 200) + (k % 3) - 1, Math.floor(player.pos.z / 200) + Math.floor(k / 3) - 1))) {
        p.push(d.x, d.y + 2.6, d.z); const st = live.live.has(d.id) ? [0.2, 1, 0.3] : live.pending.has(d.id) ? [1, 0.8, 0.2] : d.locked ? [1, 0.2, 0.2] : [0.5, 0.5, 0.5]; c.push(...st);
      }
      streamPts.geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); streamPts.geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    if (overlay.colliders) { const r = physics.world.debugRender(); const v: number[] = []; for (let k = 0; k < r.vertices.length; k += 3) { if (Math.hypot(r.vertices[k] - player.pos.x, r.vertices[k + 2] - player.pos.z) < 30) v.push(r.vertices[k], r.vertices[k + 1], r.vertices[k + 2]); else v.push(0, -1000, 0); } colLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); }
  };

  // ------------------------------------------------------------------ loop
  const timer = new THREE.Timer(); let jump = false, syncT = 0, hudT = 0, overT = 0, frameCount = 0;
  debug.player = player; debug.physics = physics; debug.orbit = orbit; debug.fly = fly; debug.RAPIER = RAPIER; debug.shells = shellCount; debug.windows = windowCount; debug.windowRooms = wroom;
  debug.setMode = (m: 'onfoot' | 'photo') => { mode = m; };
  debug.teleport = (x: number, y: number, z: number, deg: number) => { player.teleport(x, y, z, THREE.MathUtils.degToRad(deg)); orbit.snap({ x, y, z }, THREE.MathUtils.degToRad(deg)); };
  debug.whenIdle = () => new Promise<void>((res) => { const t = () => (frameCount > 20 && interiors.stats.pending === 0 && (mode === 'photo' || player.active) ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); });
  /** Place the player on the door axis of unit `id`, `dist` metres outside (negative = inside), facing in. */
  debug.walkTo = (id: string, dist: number, dy = 0) => {
    const e = interiors.unit(id); if (!e) return null;
    const u = e.u; const dx = u.ox + u.ux * u.door.t, dz = u.oz + u.uz * u.door.t;
    const x = dx - u.nx * dist, z = dz - u.nz * dist, y = (dist > 0.3 ? heightAt(x, z) + SIDEWALK_H : u.y) + dy;
    const yaw = Math.atan2(-u.nx, -u.nz);
    mode = 'onfoot'; player.teleport(x, y, z, yaw); orbit.snap({ x, y, z }, yaw); orbit.pitch = -0.12;
    return { x, y, z, yaw };
  };
  debug.ready = true;
  renderer.setAnimationLoop((t) => {
    timer.update(t); const dt = Math.min(timer.getDelta(), 0.1); frames.push(dt * 1000);
    input.poll(dt);
    if (input.pressed('photo')) { if (mode === 'onfoot') { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); fly.set(camera.position.x, camera.position.y, camera.position.z, e.y, e.x); mode = 'photo'; } else { mode = 'onfoot'; orbit.snap(player.pos, orbit.yaw); } }
    if (input.pressed('jump')) jump = true;
    if ((syncT -= dt) <= 0) { physics.sync(player.pos.x, player.pos.z, 200); syncT = 0.2; }
    if (!player.active && physics.readyAround(player.pos.x, player.pos.z, 200)) player.active = true;
    const focus = mode === 'onfoot' ? player.pos : camera.position;
    interiors.update(dt, focus, clock, camera);
    interiors.colliders(physics.world);
    if (mode === 'onfoot') {
      physics.update(dt, (h) => { player.fixedUpdate(h, input, orbit.yaw, jump); jump = false; });
      const rp = player.renderPos(physics.alpha); body.object.position.set(rp.x, rp.y, rp.z); body.setLocomotion(player.loco()); body.update(dt); orbit.update(dt, rp);
    } else { physics.update(dt, () => { jump = false; }); fly.update(dt); }
    input.endFrame();
    if ((overT -= dt) <= 0) { drawOverlays(); overT = 0.25; }
    renderer.render(scene, camera); frameCount++;
    if ((hudT -= dt) <= 0) {
      hudT = 0.25; const s = frames.summary(), i = renderer.info.render, st = interiors.stats;
      const ins = interiors.inside(focus.x, focus.y, focus.z);
      hud.textContent = `INTERIORS TEST  [${backend.toUpperCase()} ${quality.name}]  ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}\n` +
        `frame ${s.avg.toFixed(1)} ms avg ${s.p95.toFixed(1)} p95   draws ${i.drawCalls} tris ${(i.triangles / 1000).toFixed(0)}k\n` +
        `live ${st.live} pending ${st.pending} built ${st.built}  build avg ${st.buildMsAvg.toFixed(0)} max ${st.buildMsMax.toFixed(0)} ms  door->ready avg ${st.streamMsAvg.toFixed(0)} max ${st.streamMsMax.toFixed(0)} ms\n` +
        `interior cells visible ${st.visibleCells}  interior draws ${st.drawCalls}  cull ${st.cullMs.toFixed(2)} ms  colliders ${st.colliders}  exteriorHidden ${interiors.exteriorHidden}\n` +
        `pos ${focus.x.toFixed(1)}, ${focus.y.toFixed(1)}, ${focus.z.toFixed(1)}  ${ins ? `INSIDE ${ins.interiorId} (${ins.kind}, ${ins.cell}, ${ins.roomVolume} m3, ${ins.reverb})` : 'street'}\n` +
        `1 portals ${overlay.portals ? 'on' : 'off'} · 2 streaming ${overlay.streaming ? 'on' : 'off'} · 3 colliders ${overlay.colliders ? 'on' : 'off'} · P free cam`;
    }
  });
}

function geom(m: MeshArrays) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3)); g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('pat', new THREE.BufferAttribute(m.pat, 4)); g.setAttribute('light', new THREE.BufferAttribute(m.light, 4));
  g.setIndex(new THREE.BufferAttribute(m.index, 1)); return g;
}
