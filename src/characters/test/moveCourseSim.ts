/**
 * The movement test course (docs/briefs/MOVEMENT.md "How it's checked"): layout, walkable ground
 * and a stand-in for the engine's player controller that speaks the root-motion contract
 * (ENGINE_REQUESTS "From characters: 5"): it moves the capsule from a speed script with the
 * locomotion tuning table, autosteps up to 0.4 m with a `step` event, detects traversals and
 * applies the root curve that `traversalMotion()` returns. No three.js here, so it runs headless
 * for the randomised no-snag test (tools/characters/move-test.ts).
 *
 * One lane along +x (z in -1.6..1.6), 1970s street furniture at real sizes:
 *   kerb 0.2 m (granite), railing 1.0 m, brownstone stoop (4 steps of 0.18 m), car hood 1.0 m,
 *   dumpster 1.6 m (climb, drop off the end), chain-link fence 3.0 m, subway stairs (8 x 0.17 m
 *   down and up), turnstile 1.0 m, fire escape with a drop ladder to a 3.6 m platform, roof gap
 *   2 m, hang-drop off the far roof, sidewalk-shed scaffold ladder 2.6 m with a drop, then a skid
 *   stop and a pivot.
 */
import { traversalMotion, type TraversalEvent, type TraversalKind, type TraversalMotion } from '../anim/Traversal';

export const SIDEWALK = 0.2;
export const ROOF = SIDEWALK + 3.6;

/** Walkable floors along the lane: [x0, x1, y, surface]; later entries win. */
const FLOORS: [number, number, number, string][] = [
  [-20, 3, 0, 'asphalt'],
  [3, 70, SIDEWALK, 'concrete'],
  // brownstone stoop: 4 steps up, landing, 4 steps down
  ...[0, 1, 2, 3].map((i): [number, number, number, string] => [9 + i * 0.3, 9 + (i + 1) * 0.3, SIDEWALK + (i + 1) * 0.18, 'stone']),
  [10.2, 11.4, SIDEWALK + 0.72, 'stone'],
  ...[0, 1, 2, 3].map((i): [number, number, number, string] => [11.4 + i * 0.3, 11.4 + (i + 1) * 0.3, SIDEWALK + (3 - i) * 0.18, 'stone']),
  // dumpster lid (climbed onto)
  [18, 19.6, SIDEWALK + 1.6, 'metal'],
  // subway stairs: 8 steps down, a landing, 8 up
  ...Array.from({ length: 8 }, (_, i): [number, number, number, string] => [25 + i * 0.3, 25 + (i + 1) * 0.3, SIDEWALK - (i + 1) * 0.17, 'stone']),
  [27.4, 29, SIDEWALK - 1.36, 'tile'],
  ...Array.from({ length: 8 }, (_, i): [number, number, number, string] => [29 + i * 0.3, 29 + (i + 1) * 0.3, SIDEWALK - (7 - i) * 0.17, 'stone']),
  // fire-escape platform running into roof A, the gap, roof B
  [37, 41, ROOF, 'tar'],
  [43, 48, ROOF, 'tar'],
  // sidewalk-shed scaffold deck
  [50.5, 54, SIDEWALK + 2.6, 'wood'],
];

export function moveGround(x: number, _z = 0): { y: number; surface: string } {
  let y = 0, surface = 'asphalt';
  for (const [x0, x1, yy, s] of FLOORS) if (x >= x0 && x < x1) { y = yy; surface = s; }
  return { y, surface };
}

export interface Feature { label: string; kind: TraversalKind; x: number; top: number; depth: number; land: number; mesh: 'rail' | 'hood' | 'dumpster' | 'fence' | 'turnstile' | 'ladder' | 'none' }
/** Obstacles the controller detects (face position x, top height, depth, landing floor height). */
export const FEATURES: Feature[] = [
  { label: 'railing', kind: 'vault', x: 6, top: SIDEWALK + 1.0, depth: 0.06, land: SIDEWALK, mesh: 'rail' },
  { label: 'car hood', kind: 'vault', x: 14, top: SIDEWALK + 1.0, depth: 1.6, land: SIDEWALK, mesh: 'hood' },
  { label: 'dumpster', kind: 'climb', x: 18, top: SIDEWALK + 1.6, depth: 1.6, land: SIDEWALK + 1.6, mesh: 'dumpster' },
  { label: 'dumpster drop', kind: 'drop', x: 19.6, top: SIDEWALK + 1.6, depth: 0, land: SIDEWALK, mesh: 'none' },
  { label: 'chain-link fence', kind: 'fence', x: 22, top: SIDEWALK + 3.0, depth: 0.05, land: SIDEWALK, mesh: 'fence' },
  { label: 'turnstile', kind: 'turnstile', x: 32.5, top: SIDEWALK + 1.0, depth: 0.4, land: SIDEWALK, mesh: 'turnstile' },
  { label: 'fire-escape drop ladder', kind: 'dropLadder', x: 36.6, top: ROOF, depth: 0.4, land: ROOF, mesh: 'ladder' },
  { label: 'roof gap', kind: 'roofJump', x: 41, top: ROOF, depth: 2.0, land: ROOF, mesh: 'none' },
  { label: 'roof edge hang-drop', kind: 'hangDrop', x: 48, top: ROOF, depth: 0, land: SIDEWALK, mesh: 'none' },
  { label: 'scaffold ladder', kind: 'ladder', x: 50.2, top: SIDEWALK + 2.6, depth: 0.3, land: SIDEWALK + 2.6, mesh: 'ladder' },
  { label: 'scaffold drop', kind: 'drop', x: 54, top: SIDEWALK + 2.6, depth: 0, land: SIDEWALK, mesh: 'none' },
];
export const COURSE_END = 60;

/** Locomotion tuning table (the characters' side of the contract): m/s and m/s^2. */
export const TUNING = { walk: 1.5, jog: 2.6, run: 3.4, sprint: 6.0, accel: 5.5, decel: 8.0, skidFrom: 3.0, pivotTime: 0.55 } as const;

export type MoveEvent =
  | { type: 'start' | 'stop' | 'skid'; t: number; x: number }
  | { type: 'pivot'; t: number; x: number; angle: number }
  | { type: 'step'; t: number; x: number; rise: number }
  | { type: 'traversal'; t: number; x: number; event: TraversalEvent; label: string; motion: TraversalMotion }
  | { type: 'traversalEnd'; t: number; x: number; label: string };

export interface MoveState { t: number; x: number; y: number; speed: number; heading: number; grounded: boolean; traversal: { label: string; kind: TraversalKind; u: number } | null; done: boolean }

/** Speed script: where to walk, run and sprint (scale and jitter for randomised runs). */
export function speedScript(x: number, scale = 1): number {
  if (x >= COURSE_END - 3) return 0; // skid stop
  if (x > 38 && x < 41) return TUNING.sprint * scale; // run-up for the roof gap
  if (x > 24.5 && x < 31.5) return TUNING.run * scale; // running the subway stairs
  if (x < 2) return TUNING.walk * scale;
  return TUNING.run * scale;
}

export class MoveCourseSim {
  s: MoveState = { t: 0, x: -2, y: 0, speed: 0, heading: Math.PI / 2, grounded: true, traversal: null, done: false };
  events: MoveEvent[] = [];
  private done = new Set<string>();
  private trav: { f: Feature; m: TraversalMotion; t: number; x0: number; y0: number } | null = null;
  private pivot = 0;
  constructor(public opts: { scale?: number; startX?: number; script?: (x: number) => number } = {}) {
    if (opts.startX !== undefined) this.s.x = opts.startX;
    this.s.y = moveGround(this.s.x).y;
  }
  private emit(e: MoveEvent) { this.events.push(e); }

  step(dt: number): MoveState {
    const s = this.s; s.t += dt;
    if (s.done) return s;
    // traversal in progress: the root curve moves the capsule
    if (this.trav) {
      const tr = this.trav; tr.t += dt;
      const [f, u] = tr.m.root(Math.min(tr.t, tr.m.duration));
      s.x = tr.x0 + f; s.y = tr.y0 + u; s.grounded = false;
      s.traversal = { label: tr.f.label, kind: tr.f.kind, u: Math.min(1, tr.t / tr.m.duration) };
      if (tr.t >= tr.m.duration) {
        s.y = moveGround(s.x).y; s.speed = tr.m.exitSpeed; s.grounded = true; s.traversal = null; this.trav = null;
        this.emit({ type: 'traversalEnd', t: s.t, x: s.x, label: tr.f.label });
      }
      return s;
    }
    // end of course: skid stop, then a 180-degree pivot in place
    const target = this.opts.script ? this.opts.script(s.x) : speedScript(s.x, this.opts.scale ?? 1);
    if (target === 0 && s.speed === 0 && s.x >= COURSE_END - 3) {
      if (this.pivot === 0) this.emit({ type: 'pivot', t: s.t, x: s.x, angle: Math.PI });
      this.pivot += dt; s.heading = Math.PI / 2 + Math.PI * Math.min(1, this.pivot / TUNING.pivotTime);
      if (this.pivot >= TUNING.pivotTime + 0.3) s.done = true;
      return s;
    }
    const was = s.speed;
    if (target > s.speed) s.speed = Math.min(target, s.speed + TUNING.accel * dt);
    else s.speed = Math.max(target, s.speed - TUNING.decel * dt);
    if (was === 0 && s.speed > 0) this.emit({ type: 'start', t: s.t, x: s.x });
    if (target === 0 && was >= TUNING.skidFrom && !this.done.has('skid')) { this.done.add('skid'); this.emit({ type: 'skid', t: s.t, x: s.x }); }
    if (was > 0 && s.speed === 0) this.emit({ type: 'stop', t: s.t, x: s.x });
    // traversal detection: a feature face within reach ahead (reach grows with speed)
    const reach = 0.45 + s.speed * 0.12;
    const stepX = Math.sin(s.heading) * s.speed * dt;
    for (const f of FEATURES) {
      if (this.done.has(f.label)) continue;
      // drops trigger when this frame's step would cross the edge (frame-rate independent);
      // everything else when its face comes within reach
      const isDrop = f.kind === 'drop' || f.kind === 'hangDrop';
      if (isDrop ? !(f.x >= s.x - 1e-6 && f.x <= s.x + stepX + 1e-6) : f.x < s.x - 0.05 || f.x > s.x + reach) continue;
      this.done.add(f.label);
      const ev: TraversalEvent = { kind: f.kind, height: f.top - s.y, depth: f.depth, landRise: f.land - s.y, speed: s.speed, approach: Math.max(0, f.x - s.x) };
      const m = traversalMotion(ev);
      this.trav = { f, m, t: 0, x0: s.x, y0: s.y };
      this.emit({ type: 'traversal', t: s.t, x: s.x, event: ev, label: f.label, motion: m });
      return s;
    }
    // walk: autostep up/down to 0.4 m, otherwise the floor ahead is a wall we haven't detected
    const nx = s.x + Math.sin(s.heading) * s.speed * dt;
    const g = moveGround(nx).y;
    const rise = g - s.y;
    if (rise > 0.4) { s.speed = 0; return s; } // blocked (counts as a snag in the test)
    if (Math.abs(rise) > 1e-4 && rise >= -0.4) this.emit({ type: 'step', t: s.t, x: nx, rise });
    if (rise < -0.4) {
      // an unmarked edge: fall off it
      const ev: TraversalEvent = { kind: 'drop', height: 0, depth: 0, landRise: rise, speed: s.speed, approach: 0 };
      const m = traversalMotion(ev);
      this.trav = { f: { label: `edge@${nx.toFixed(1)}`, kind: 'drop', x: nx, top: s.y, depth: 0, land: g, mesh: 'none' }, m, t: 0, x0: s.x, y0: s.y };
      this.emit({ type: 'traversal', t: s.t, x: s.x, event: ev, label: 'edge', motion: m });
      return s;
    }
    s.x = nx; s.y = g; s.grounded = true; s.traversal = null;
    return s;
  }
}
