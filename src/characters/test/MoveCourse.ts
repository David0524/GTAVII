/**
 * `?characters=1&scene=move`: the movement test course (docs/briefs/MOVEMENT.md) rendered, with a
 * character driven by the stand-in controller in moveCourseSim.ts. Side-on tracking camera.
 *   &t=<s>     deterministic capture time (frame strips: tools/characters/shots.sh 31_*)
 *   &seed=<n>  who runs it;  &cam=near   tighter framing for traversal detail
 * The report carries the event log (start/stop/skid/pivot, steps, traversals) and the state.
 */
import * as THREE from 'three/webgpu';
import type { CharacterFactory } from '../index';
import { MoveCourseSim, FEATURES, moveGround, SIDEWALK, ROOF } from './moveCourseSim';
import type { TraversalEvent, TraversalMotion } from '../anim/Traversal';

function box(world: THREE.Scene, w: number, h: number, d: number, x: number, y: number, z: number, color: number, rough = 0.85) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardNodeMaterial({ color, roughness: rough }));
  b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; world.add(b); return b;
}

/** Course geometry at real sizes: floors from moveGround, obstacles from FEATURES. */
function buildCourse(world: THREE.Scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshStandardNodeMaterial({ color: 0x34302e, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
  // floors: sample the ground function and extrude each run of constant height to the street
  const colors: Record<string, number> = { concrete: 0x8a857c, stone: 0x7c6a5a, metal: 0x3d5a3f, tile: 0xb9b2a2, tar: 0x2f2b28, wood: 0x7a5a3a };
  let x0 = -20, prev = moveGround(-20);
  const flush = (x1: number, g: { y: number; surface: string }) => {
    if (g.y === 0 && g.surface === 'asphalt') return;
    const bottom = Math.min(0, g.y) - 0.02, top = g.y;
    if (g.y < 0) { box(world, x1 - x0, 0.04, 3.2, (x0 + x1) / 2, top - 0.02, 0, colors[g.surface] ?? 0x888888); return; } // stairwell floor
    box(world, x1 - x0, top - bottom, 3.2, (x0 + x1) / 2, (top + bottom) / 2, 0, colors[g.surface] ?? 0x888888);
  };
  for (let x = -20; x <= 70; x += 0.01) {
    const g = moveGround(x);
    if (g.y !== prev.y || g.surface !== prev.surface) { flush(x, prev); x0 = x; prev = g; }
  }
  flush(70, prev);
  // building under the fire escape and roofs, and the subway stairwell walls
  box(world, 4, ROOF, 4, 39, ROOF / 2, -3.6, 0x6b3a2c); box(world, 5, ROOF, 4, 45.5, ROOF / 2, -3.6, 0x5d4a3a);
  box(world, 6.4, 1.4, 0.2, 28.2, SIDEWALK - 0.7, 1.7, 0x6f6a60); box(world, 6.4, 1.4, 0.2, 28.2, SIDEWALK - 0.7, -1.7, 0x6f6a60);
  for (const f of FEATURES) {
    switch (f.mesh) {
      case 'rail': for (const z of [-1.5, -0.5, 0.5, 1.5]) box(world, 0.05, f.top - SIDEWALK, 0.05, f.x + 0.03, (f.top + SIDEWALK) / 2, z, 0x1f2a22, 0.5); box(world, 0.06, 0.06, 3.2, f.x + 0.03, f.top, 0, 0x1f2a22, 0.5); break;
      case 'hood': box(world, f.depth, f.top - SIDEWALK - 0.3, 3.0, f.x + f.depth / 2, SIDEWALK + 0.3 + (f.top - SIDEWALK - 0.3) / 2, 0, 0x6a1f1a, 0.35); break;
      case 'dumpster': box(world, f.depth, f.top - SIDEWALK, 3.0, f.x + f.depth / 2, (f.top + SIDEWALK) / 2, 0, 0x2f4a32, 0.6); break;
      case 'fence': {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, f.top - SIDEWALK), new THREE.MeshStandardNodeMaterial({ color: 0x9aa0a0, roughness: 0.4, metalness: 0.8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
        mesh.rotation.y = Math.PI / 2; mesh.position.set(f.x, (f.top + SIDEWALK) / 2, 0); world.add(mesh);
        for (const z of [-1.6, 0, 1.6]) box(world, 0.05, f.top - SIDEWALK, 0.05, f.x, (f.top + SIDEWALK) / 2, z, 0x707676, 0.4);
        break;
      }
      case 'turnstile': box(world, f.depth, f.top - SIDEWALK, 0.25, f.x + f.depth / 2, (f.top + SIDEWALK) / 2, 0.9, 0x8a8a80, 0.4); box(world, f.depth, f.top - SIDEWALK, 0.25, f.x + f.depth / 2, (f.top + SIDEWALK) / 2, -0.9, 0x8a8a80, 0.4); box(world, 0.04, 0.04, 1.4, f.x + f.depth / 2, f.top - 0.05, 0, 0x555550, 0.3); break;
      case 'ladder': {
        const h = f.top - SIDEWALK, bottom = f.kind === 'dropLadder' ? SIDEWALK + 0.4 : SIDEWALK;
        for (const z of [-0.25, 0.25]) box(world, 0.04, f.top - bottom, 0.04, f.x + 0.2, (f.top + bottom) / 2, z, 0x222222, 0.5);
        for (let y = bottom + 0.15; y < f.top; y += 0.3) box(world, 0.03, 0.03, 0.5, f.x + 0.2, y, 0, 0x222222, 0.5);
        void h;
        break;
      }
    }
  }
}

export function moveCourse(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any, qp: URLSearchParams) {
  buildCourse(world);
  factory.setGround((x, z) => moveGround(x, z));
  const ch = factory.spawn(world, { seed: Number(qp.get('seed') ?? 12345) });
  const sim = new MoveCourseSim();
  const near = qp.get('cam') === 'near';
  if (qp.has('nostep')) ch.stepSmoothing = false;
  // --- traversal animation: clip timed to the root curve, hands onto the obstacle by IK ---------
  type Cur = { label: string; ev: TraversalEvent; m: TraversalMotion; t: number; f: (typeof FEATURES)[number] | undefined; x0: number; y0: number; phase: number };
  let cur: Cur | null = null;
  const startTraversal = (label: string, ev: TraversalEvent, m: TraversalMotion) => {
    const f = FEATURES.find((ff) => ff.label === label);
    cur = { label, ev, m, t: 0, f, x0: sim.s.x, y0: sim.s.y, phase: 0 };
    const k = ev.kind;
    if (k === 'vault' || k === 'turnstile' || k === 'climb' || k === 'fence' || k === 'roofJump') void ch.play(m.clip, { speed: 1 / m.duration, blendIn: 0.08 });
    else if (k === 'ladder') void ch.play('ladder', { loop: true, speed: 0.55 / 0.6, blendIn: 0.15 });
    else if (k === 'dropLadder') void ch.play('ladder_pull', { speed: 1 / 1.4, blendIn: 0.1 });
    else if (k === 'hangDrop') void ch.play('hang', { loop: true, blendIn: 0.15 });
    else if (k === 'drop') void ch.play(m.roll ? 'drop_roll' : 'drop_land', { speed: m.roll ? 1 : 0.7 / Math.max(0.15, m.duration - 0.3), blendIn: 0.08 });
  };
  const fwd = new THREE.Vector3(), left = new THREE.Vector3();
  const driveTraversal = (s: { x: number; y: number }, dt: number) => {
    const c = cur!; c.t += dt;
    const u = Math.min(1, c.t / c.m.duration), k = c.ev.kind;
    // phase switches inside a traversal
    if (k === 'dropLadder' && c.phase === 0 && c.t > 1.4) { c.phase = 1; void ch.play('ladder', { loop: true, speed: 0.55 / 0.6, blendIn: 0.15 }); }
    if (k === 'hangDrop' && c.phase === 0 && c.t > 0.6) { c.phase = 1; void ch.play(c.m.roll ? 'drop_roll' : 'drop_land', { speed: 0.7 / Math.max(0.15, c.m.duration - 0.9), blendIn: 0.1 }); }
    // hands: on the obstacle's top edge (vault, climb, turnstile, hang), on the mesh or rungs
    // just above the head (fence, ladders), blended in and out over each window
    fwd.set(1, 0, 0); left.set(0, 0, -1);
    for (const side of ['l', 'r'] as const) {
      const win = c.m.hands[side];
      if (!win || !c.f) { ch.setHandTarget(side, null, 0); continue; }
      const w = Math.min(1, Math.max(0, (u - win[0]) / 0.06)) * Math.min(1, Math.max(0, (win[1] - u) / 0.06));
      const lat = side === 'l' ? 0.2 : -0.2;
      let hx = c.f.x + 0.04, hy = c.f.top + 0.02;
      if (k === 'vault' || k === 'turnstile') hx = c.f.x + Math.min(0.25, c.f.depth * 0.3);
      if (k === 'fence') { hx = c.f.x - 0.06; hy = Math.min(c.f.top, s.y + (side === 'l' ? 1.85 : 1.6)); }
      if (k === 'ladder' || k === 'dropLadder') { hx = c.f.x + 0.17; const rung = (yy: number) => Math.round((yy - 0.15) / 0.3) * 0.3 + 0.15; hy = Math.min(c.f.top, rung(s.y + (side === 'l' ? 1.8 : 1.5))); }
      ch.setHandTarget(side, new THREE.Vector3(hx, hy, 0).addScaledVector(left, lat).addScaledVector(fwd, 0), w);
    }
  };
  let lastEvents = 0;
  // smoothness: the pelvis's vertical speed on grounded frames (a pop shows as a spike)
  let lastPelvis: number | null = null, maxVy = 0, sumVy = 0, nVy = 0;
  report.events = [];
  return (dt: number) => {
    const s = sim.step(dt);
    for (; lastEvents < sim.events.length; lastEvents++) {
      const e = sim.events[lastEvents];
      report.events.push({ ...e, motion: undefined, x: +e.x.toFixed(2), t: +e.t.toFixed(2) });
      if (e.type === 'traversal') startTraversal(e.label, e.event, e.motion);
      if (e.type === 'traversalEnd') { ch.stop(); for (const side of ['l', 'r'] as const) ch.setHandTarget(side, null, 0); cur = null; }
    }
    if (cur) driveTraversal(s, dt);
    ch.object.position.set(s.x, s.y, 0);
    const v = s.speed;
    ch.setLocomotion({ velocity: [Math.sin(s.heading) * v, 0, Math.cos(s.heading) * v], grounded: s.grounded || !!s.traversal, heading: s.heading, mode: v > 4.5 ? 'sprint' : v > 2 ? 'run' : 'walk' });
    ch.update(dt);
    const d = near ? 4.2 : 8;
    camera.fov = 40; camera.updateProjectionMatrix();
    camera.position.set(s.x + 0.6, s.y + 1.3, d); camera.lookAt(s.x + 0.6, s.y + 0.8, 0);
    const py = ch.jointWorld('pelvis').y;
    if (lastPelvis !== null && s.grounded && !s.traversal && dt > 0) {
      const vy = Math.abs(py - lastPelvis) / dt; maxVy = Math.max(maxVy, vy); sumVy += vy; nVy++;
      if (vy > 1.5) (report.spikes ??= []).push({ x: +s.x.toFixed(2), t: +s.t.toFixed(2), vy: +vy.toFixed(1), afterTraversal: lastEvents > 0 && sim.events[lastEvents - 1]?.type === 'traversalEnd' });
    }
    lastPelvis = py;
    report.pelvis = { maxVerticalSpeed: +maxVy.toFixed(2), meanVerticalSpeed: +(sumVy / Math.max(1, nVy)).toFixed(3), note: 'grounded frames only; m/s' };
    report.state = { t: +s.t.toFixed(2), x: +s.x.toFixed(2), y: +s.y.toFixed(3), speed: +s.speed.toFixed(2), traversal: s.traversal, done: s.done };
    report.updateMs = +ch.lastUpdateMs.toFixed(3);
  };
}
