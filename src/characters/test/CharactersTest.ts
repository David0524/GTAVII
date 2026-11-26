/**
 * ?characters=1 test scenes (deterministic: ?t= simulates that many seconds at 60 Hz before the
 * capture; without it the scene runs live).
 *   scene=lineup  page=0|1   20 seeded pedestrians (10 per page) on a turntable (?yaw=deg)
 *   scene=leads   act=1..3   the three leads
 *   scene=course  shot=walkrun|curb|stairs|slope|turn|hail|ledge   locomotion course with foot IK
 *   scene=slide              foot-sliding measurement at three crowd speeds (report only)
 *   scene=crowd   n=400 quality=high|low                           crowd stress test + timings
 *   zoom=1, lod=n, seed=n, dbg=n|nobump
 */
import * as THREE from 'three/webgpu';
import { normalGeometry } from 'three/tsl';
import { createRenderer } from '../../engine/renderer';
import { createCharacterFactory, type CharacterFactory, type Character } from '../index';
import { characterMaterial } from '../render/materials';
import type { AgentView } from '../crowd/CrowdRenderer';
import { hash2 } from '../util/rng';

const qp = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qp.has(k) ? +qp.get(k)! : d);

export async function runCharactersTest() {
  const scene = qp.get('scene') ?? 'lineup';
  const { renderer, backend } = await createRenderer(document.getElementById('app')!, 1);
  const world = new THREE.Scene();
  world.background = new THREE.Color(0x2a2522);
  world.fog = new THREE.Fog(0x2a2522, 60, 260);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
  // late-afternoon light: warm key, cool sky fill, back rim
  world.add(new THREE.HemisphereLight(0xc8d2e6, 0x4a3c30, 1.25));
  const sun = new THREE.DirectionalLight(0xffe8cc, 2.6); sun.position.set(4, 7, 6); world.add(sun);
  const rim = new THREE.DirectionalLight(0xc0d0ff, 1.0); rim.position.set(-5, 3, -6); world.add(rim);
  if (qp.get('dbg') === 'n') { const mm = characterMaterial(); mm.colorNode = normalGeometry.mul(0.5).add(0.5); mm.normalNode = null; }
  if (qp.get('dbg') === 'nobump') characterMaterial().normalNode = null;
  const quality = (qp.get('quality') ?? 'high') as 'low' | 'high';
  const factory = await createCharacterFactory({ quality });
  factory.setClimate({ heat: 0.7 });
  const report: any = { backend, scene, note: 'Headless timings are SwiftShader software rendering (no GPU): CPU-side numbers are meaningful, frame times are not.' };
  let tick: (dt: number) => void = () => {};
  if (scene === 'lineup' || scene === 'leads') tick = lineup(world, camera, factory, scene, report);
  else if (scene === 'course' || scene === 'slide') tick = course(world, camera, factory, report, scene === 'slide');
  else if (scene === 'crowd') tick = crowd(world, camera, factory, report);
  const simT = qp.has('t') ? num('t', 0) : -1;
  const frameMs: number[] = [];
  if (simT >= 0) {
    const steps = Math.round(simT * 60);
    for (let i = 0; i < steps; i++) tick(1 / 60);
    if (report.waitFor) { await report.waitFor(tick); delete report.waitFor; }
    renderer.render(world, camera); // warm-up (shader compile)
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); tick(1 / 60); renderer.render(world, camera); frameMs.push(performance.now() - t0); }
    report.renderMsSoftware = frameMs;
    // static capture: stop rendering so the headless screenshot isn't starved by software frames
    requestAnimationFrame(() => { renderer.render(world, camera); (window as any).__CHAR = { ready: true, report }; });
  } else {
    const clock = new THREE.Timer();
    renderer.setAnimationLoop((t) => { clock.update(t); tick(Math.min(0.05, clock.getDelta())); renderer.render(world, camera); });
    (window as any).__CHAR = { ready: true, report };
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.getElementById('loading')?.remove();
}

function floor(world: THREE.Scene, size = 60, color = 0x4c4642) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardNodeMaterial({ color, roughness: 0.92 }));
  f.rotation.x = -Math.PI / 2; world.add(f);
}

// ------------------------------------------------------------------------------------------------
function lineup(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, scene: string, report: any) {
  floor(world);
  const chars: Character[] = [];
  const zoom = qp.has('zoom');
  if (scene === 'leads') {
    const act = num('act', 1);
    for (const hero of ['char.teddy_arce', 'char.delphine_moore', 'char.nick_varelas']) chars.push(factory.spawn(world, { seed: 1, hero, act }));
  } else {
    const page = num('page', 0), per = num('n', 10), seed0 = num('seed', 1974);
    for (let i = 0; i < per; i++) chars.push(factory.spawn(world, { seed: hash2(seed0, page * per + i) }));
  }
  const n = chars.length;
  const gap = scene === 'leads' ? 1.1 : 0.85;
  chars.forEach((c, i) => { c.object.position.set(zoom ? 0 : (i - (n - 1) / 2) * gap, 0, 0); c.object.visible = !zoom || i === num('focus', 0); });
  const yaw = THREE.MathUtils.degToRad(num('yaw', 0));
  const spin = qp.has('spin');
  if (zoom) { camera.position.set(0, 1.5, 1.7); camera.lookAt(0, 1.4, 0); }
  else { const w = n * gap; camera.fov = 26; camera.position.set(0, 1.2, Math.max(5.5, w * 1.12 + 1.5)); camera.lookAt(0, 0.92, 0); camera.updateProjectionMatrix(); }
  report.people = chars.map((c) => ({ seed: c.desc.seed, hero: c.desc.hero, sex: c.appearance.sex, age: c.appearance.age, hair: c.appearance.hair.style, facialHair: c.appearance.facialHair, top: c.outfit.top.kind, bottom: c.outfit.bottom.kind, outer: c.outfit.outer?.kind ?? null, shoes: c.outfit.shoes.kind, hat: c.outfit.hat?.kind ?? null, props: c.outfit.props, tris: c.stats.tris, draws: c.stats.draws, buildMs: +c.stats.buildMs.toFixed(1) }));
  let t = 0;
  return (dt: number) => {
    t += dt;
    for (const c of chars) {
      c.setLocomotion({ velocity: [0, 0, 0], grounded: true, heading: yaw + (spin ? t * 0.6 : 0), mode: 'walk' });
      c.update(dt);
    }
    report.updateMs = chars.map((c) => +c.lastUpdateMs.toFixed(3));
  };
}

// ------------------------------------------------------------------------------------------------
/** Course geometry: flat street, a 0.15 m curb, 6 stairs of 0.17 m, a 10% slope, a 1 m ledge. */
function courseGround(x: number, z: number): { y: number; surface: string } {
  if (z > -2 && z < 2 && x >= 2 && x < 6) return { y: 0.15, surface: 'concrete' }; // sidewalk past the curb at x=2
  if (z > -2 && z < 2 && x >= 8 && x < 8 + 6 * 0.3) return { y: Math.floor((x - 8) / 0.3 + 1) * 0.17, surface: 'stone' }; // stairs
  if (z > -2 && z < 2 && x >= 8 + 1.8 && x < 13) return { y: 1.02, surface: 'stone' };
  if (z >= 4 && z < 8) return { y: Math.max(0, (x - 2) * 0.1), surface: 'asphalt' }; // slope lane
  if (z <= -4 && z > -6 && x >= 4 && x < 5) return { y: 1.0, surface: 'brick' }; // ledge block
  return { y: 0, surface: 'asphalt' };
}
function courseMeshes(world: THREE.Scene) {
  floor(world, 80, 0x3a3634);
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x8a8278, roughness: 0.85 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); world.add(b); };
  box(4, 0.15, 4, 4, 0.075, 0); // sidewalk + curb
  for (let i = 0; i < 6; i++) box(0.3, (i + 1) * 0.17, 4, 8 + i * 0.3 + 0.15, ((i + 1) * 0.17) / 2, 0);
  box(3.2, 1.02, 4, 8 + 1.8 + 1.6, 0.51, 0);
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(30, 4), new THREE.MeshStandardNodeMaterial({ color: 0x4a4440, roughness: 0.9 }));
  slope.rotation.x = -Math.PI / 2; slope.rotation.order = 'YXZ';
  const ang = Math.atan(0.1);
  slope.geometry.rotateX(-Math.PI / 2); slope.rotation.set(0, 0, ang); slope.position.set(2 + 15 * Math.cos(ang), 15 * Math.sin(ang), 6); world.add(slope);
  box(1, 1, 2, 4.5, 0.5, -5, new THREE.MeshStandardNodeMaterial({ color: 0x7a3b2c, roughness: 0.9 }));
}

function course(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any, slideOnly: boolean) {
  courseMeshes(world);
  factory.setGround(courseGround);
  const shot = qp.get('shot') ?? 'curb';
  const ch = factory.spawn(world, { seed: num('seed', 12345) });
  const footsteps: any[] = [];
  ch.on('footstep', (e) => footsteps.push({ foot: e.foot, surface: e.surface, x: +e.position.x.toFixed(2), y: +e.position.y.toFixed(3) }));
  report.footsteps = footsteps;
  // scripted paths per shot: position along x at a speed profile
  let x = 0, z = 0, heading = Math.PI / 2, t = 0;
  const speedAt = (tt: number): number => {
    switch (shot) {
      case 'walkrun': return tt < 1.5 ? 1.3 : Math.min(5.5, 1.3 + (tt - 1.5) * 2.2);
      case 'turn': return 0;
      case 'hail': return 0;
      case 'ledge': return 0;
      default: return 1.3;
    }
  };
  if (shot === 'curb') x = -1.5;
  if (shot === 'stairs') x = 5.2;
  if (shot === 'slope') { x = 3; z = 6; }
  if (shot === 'walkrun') x = -14;
  if (shot === 'ledge') { x = 4.5; z = -3.6; heading = Math.PI; }
  if (shot === 'hail') void ch.play('hail_cab');
  if (shot === 'ledge') void ch.play('climb_ledge');
  // camera framing per shot
  const frame = () => {
    if (shot === 'walkrun') { camera.position.set(x - 1, 1.4, 7); camera.lookAt(x, 0.9, 0); }
    else if (shot === 'turn' || shot === 'hail') { camera.position.set(2.2, 1.5, 3.2); camera.lookAt(0, 1.0, 0); }
    else if (shot === 'ledge') { camera.position.set(8, 1.8, -1); camera.lookAt(4.5, 0.9, -4.5); }
    else { camera.fov = 38; camera.updateProjectionMatrix(); camera.position.set(x + 0.3, 0.75, z + 3.6); camera.lookAt(x, 0.5, z); }
  };
  // foot sliding: world drift of each foot while its contact is planted
  const slide = { l: { last: null as THREE.Vector3 | null, drift: 0, time: 0 }, r: { last: null as THREE.Vector3 | null, drift: 0, time: 0 } };
  const speeds = [0.8, 1.3, 1.75];
  let speedIdx = 0, slideT = 0;
  const slideReport: any[] = [];
  if (slideOnly) { x = -20; }
  return (dt: number) => {
    t += dt;
    let v = speedAt(t);
    if (slideOnly) {
      v = speeds[speedIdx]; slideT += dt;
      if (slideT > 6) {
        slideReport.push({ speed: v, driftMmPerPlantedSecond: { l: +((slide.l.drift / Math.max(1e-3, slide.l.time)) * 1000).toFixed(1), r: +((slide.r.drift / Math.max(1e-3, slide.r.time)) * 1000).toFixed(1) } });
        report.footSliding = slideReport;
        slide.l = { last: null, drift: 0, time: 0 }; slide.r = { last: null, drift: 0, time: 0 };
        speedIdx = Math.min(speeds.length - 1, speedIdx + 1); slideT = 0;
      }
    }
    if (shot === 'turn') heading += dt * 1.6;
    x += Math.sin(heading) * v * dt; z += Math.cos(heading) * v * dt;
    const g = courseGround(x, z);
    ch.object.position.set(x, g.y, z);
    ch.setLocomotion({ velocity: [Math.sin(heading) * v, 0, Math.cos(heading) * v], grounded: true, heading, mode: v > 4 ? 'sprint' : v > 2 ? 'run' : 'walk' });
    ch.update(dt);
    if (slideOnly && slideT > 1.5) {
      for (const side of ['l', 'r'] as const) {
        const p = ch.jointWorld(`ball_${side}`);
        const s = slide[side];
        if (ch.animator.planted[side]) { if (s.last) { s.drift += Math.hypot(p.x - s.last.x, p.z - s.last.z); s.time += dt; } s.last = p.clone(); } else s.last = null;
      }
    }
    frame();
    report.updateMs = +ch.lastUpdateMs.toFixed(3);
    report.pos = [+x.toFixed(2), +z.toFixed(2)];
  };
}

// ------------------------------------------------------------------------------------------------
/** Crowd stress test: replays a synthetic "recorded" sim walk (the sim isn't merged yet). */
function crowd(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any) {
  floor(world, 400, 0x3c3836);
  const n = num('n', 400);
  const cr = factory.createCrowdRenderer(n);
  world.add(cr.object);
  (cr as any).setCamera(camera);
  // sidewalks: 6 parallel 4 m-wide strips along Z, agents walk both ways; some stand (talk, smoke, wait, hail)
  const agents: AgentView[] = [];
  const states = ['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'talk', 'wait', 'smoke', 'read', 'hail', 'lean', 'sit'];
  for (let i = 0; i < n; i++) {
    const h = (k: number) => (hash2(i, k) % 100000) / 100000;
    const lane = Math.floor(h(1) * 6);
    const state = states[Math.floor(h(2) * states.length)];
    const moving = state === 'walk';
    const dir = h(3) < 0.5 ? 1 : -1;
    const archetype = h(4) < 0.06 ? 'beat_cop' : h(4) < 0.16 ? 'worker_handcart' : h(4) < 0.2 ? 'vendor' : h(4) < 0.6 ? 'commuter' : 'shopper';
    agents.push({ id: i + 1, archetype, variant: hash2(i, 99), x: (lane - 2.5) * 9 + (h(5) - 0.5) * 3, y: 0, z: (h(6) - 0.5) * 220, yaw: dir > 0 ? 0 : Math.PI, speed: moving ? 0.8 + h(7) * 1.1 : 0, state });
  }
  camera.fov = 40; camera.updateProjectionMatrix();
  camera.position.set(num('cx', 3), num('cy', 3.2), num('cz', 24)); camera.lookAt(0, 1.2, -10);
  const cpu: number[] = [];
  let frames = 0;
  // near-ring characters are built in a worker: let them arrive before a static capture
  report.waitFor = async (tick: (dt: number) => void) => {
    cpu.length = 0; frames = 0;
    for (let i = 0; i < 150; i++) tick(1 / 60);
    const measured = { ...report.crowd };
    for (let i = 0; i < 300; i++) {
      tick(1 / 60);
      await new Promise((r) => setTimeout(r, 50));
      if (i > 20 && (cr as any).pendingBuilds === 0 && (cr as any).stats.near > 0) break;
    }
    report.crowd = { ...measured, nearAtCapture: (cr as any).stats.near, nearBuilds: (cr as any).stats.nearBuilds };
  };
  return (dt: number) => {
    for (const a of agents) {
      if (a.speed > 0) { a.z += Math.cos(a.yaw) * a.speed * dt; if (a.z > 110) a.z -= 220; if (a.z < -110) a.z += 220; }
    }
    const t0 = performance.now();
    cr.setAgents(agents);
    cpu.push(performance.now() - t0);
    frames++;
    const s = (cr as any).stats;
    if (frames > 30) {
      const w = cpu.slice(30).sort((a, b) => a - b);
      report.crowd = { agents: n, ...s, cpuAvgMs: +(w.reduce((a, b) => a + b, 0) / w.length).toFixed(3), cpuP95Ms: +w[Math.floor(w.length * 0.95)].toFixed(3), framesMeasured: w.length };
    }
  };
}
