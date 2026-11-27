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
  let lastEvents = 0;
  report.events = [];
  return (dt: number) => {
    const s = sim.step(dt);
    for (; lastEvents < sim.events.length; lastEvents++) {
      const e = sim.events[lastEvents];
      report.events.push({ ...e, motion: undefined, x: +e.x.toFixed(2), t: +e.t.toFixed(2) });
      // placeholder traversal poses until the authored traversal clips land (M4)
      if (e.type === 'traversal' && e.motion.clip === 'climb') void ch.play('climb_ledge');
      if (e.type === 'traversal' && e.motion.roll) void ch.play('roll');
    }
    ch.object.position.set(s.x, s.y, 0);
    const v = s.speed;
    ch.setLocomotion({ velocity: [Math.sin(s.heading) * v, 0, Math.cos(s.heading) * v], grounded: s.grounded || s.traversal?.kind === 'climb', heading: s.heading, mode: v > 4.5 ? 'sprint' : v > 2 ? 'run' : 'walk' });
    ch.update(dt);
    const d = near ? 4.2 : 8;
    camera.fov = 40; camera.updateProjectionMatrix();
    camera.position.set(s.x + 0.6, s.y + 1.3, d); camera.lookAt(s.x + 0.6, s.y + 0.8, 0);
    report.state = { t: +s.t.toFixed(2), x: +s.x.toFixed(2), y: +s.y.toFixed(3), speed: +s.speed.toFixed(2), traversal: s.traversal, done: s.done };
    report.updateMs = +ch.lastUpdateMs.toFixed(3);
  };
}
