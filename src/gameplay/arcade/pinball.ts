/**
 * "Night Owl", an original 1974 electro-mechanical pinball table for the Deuce arcade (FEATURE_AUDIT).
 * Headless and deterministic: a fixed-step 2D simulation the UI only draws. All units are metres on a
 * 0.52 × 1.06 m playfield, with y growing toward the player (down the table) and gravity from the
 * playfield's 6.5° slope.
 *
 * Period rules (no video-era modes): 3 balls; three top rollover lanes ("O-W-L") light the pop bumpers;
 * a bank of three drop targets raises the end-of-ball bonus multiplier; slingshots kick; outlanes
 * drain. Nudging is allowed, but three nudges inside 4 s is TILT: the flippers go dead and the bonus
 * is lost for that ball. Reaching the replay score knocks a free game.
 */
import { Rng } from '../core/rng';

export type Vec = { x: number; y: number };
export interface Seg { a: Vec; b: Vec; kick?: number; id?: string }
export interface Bumper { x: number; y: number; r: number; id: string }
export interface DropTarget { seg: Seg; down: boolean; letter: string }
export interface Flipper { pivot: Vec; len: number; rest: number; up: number; side: 'L' | 'R'; angle: number; omega: number; held: boolean }

export const TABLE = { w: 0.52, h: 1.06 };
export const BALL_R = 0.0135;
const G = 9.81 * Math.sin((6.5 * Math.PI) / 180);
const STEP = 1 / 480;
const REST = 0.45;          // wall restitution
const FLIP_SPEED = 38;      // rad/s, a solenoid snap
const FLIP_REST = 0.3;
export const SCORES = { bumper: 100, bumperLit: 1000, sling: 10, rollover: 500, drop: 500, dropBank: 5000, bonusUnit: 1000 };
export const REPLAY = 60000;
export const BALLS = 3;
const TILT_WINDOW = 4, TILT_NUDGES = 3;

const v = (x: number, y: number): Vec => ({ x, y });
const S = (ax: number, ay: number, bx: number, by: number, o: Partial<Seg> = {}): Seg => ({ a: v(ax, ay), b: v(bx, by), ...o });

/** The playfield: outer walls, shooter lane, inlane/outlane guides, slingshots. */
function layout() {
  const W = TABLE.w, H = TABLE.h, lane = 0.035, OUT = 0.04;
  const walls: Seg[] = [
    S(0, 0.12, 0, H), S(W, 0.06, W, H),                                     // sides
    // top arch (approximated), feeding the shooter lane around into the field
    S(0, 0.12, 0.05, 0.04), S(0.05, 0.04, 0.16, 0.0), S(0.16, 0.0, W - 0.12, 0.0), S(W - 0.12, 0.0, W - 0.02, 0.03), S(W - 0.02, 0.03, W, 0.06),
    S(W - lane, 0.16, W - lane, H),                                         // shooter lane wall
    // lower guides: a narrow outlane against each side wall (drains), a divider post, and an inlane
    // guide that rolls the ball onto the flipper
    S(OUT, 0.78, OUT, 0.87), S(OUT, 0.87, 0.165, 0.935),
    S(W - lane - OUT, 0.78, W - lane - OUT, 0.87), S(W - lane - OUT, 0.87, W - lane - 0.165, 0.935),
    // the orbit exit throws the ball off the left wall toward the bumpers, and slanted rubbers above the
    // outlanes push wall-huggers inward: only a ball moving outward finds the outlane
    S(0, 0.20, 0.05, 0.27),
    S(0, 0.64, OUT - 0.005, 0.74), S(W - lane, 0.64, W - lane - OUT + 0.005, 0.74),
    // top lane dividers
    S(0.15, 0.06, 0.15, 0.12), S(0.23, 0.06, 0.23, 0.12), S(0.31, 0.06, 0.31, 0.12), S(0.39, 0.06, 0.39, 0.12),
  ];
  const slings: Seg[] = [S(0.13, 0.74, 0.18, 0.84, { kick: 1.4, id: 'slingL' }), S(W - lane - 0.13, 0.74, W - lane - 0.18, 0.84, { kick: 1.4, id: 'slingR' })];
  const bumpers: Bumper[] = [{ x: 0.17, y: 0.26, r: 0.028, id: 'b1' }, { x: 0.31, y: 0.26, r: 0.028, id: 'b2' }, { x: 0.24, y: 0.36, r: 0.028, id: 'b3' }];
  const drops: DropTarget[] = ['O', 'W', 'L'].map((letter, i) => ({ seg: S(0.04, 0.42 + i * 0.05, 0.04, 0.46 + i * 0.05, { id: `drop${i}` }), down: false, letter }));
  const rollovers = [{ x: 0.19, y: 0.09, letter: 'O' }, { x: 0.27, y: 0.09, letter: 'W' }, { x: 0.35, y: 0.09, letter: 'L' }];
  const cx = (W - lane) / 2;
  const flippers: Flipper[] = [
    { pivot: v(0.165, 0.935), len: 0.072, rest: 0.52, up: -0.45, side: 'L', angle: 0.52, omega: 0, held: false },
    { pivot: v(W - lane - 0.165, 0.935), len: 0.072, rest: Math.PI - 0.52, up: Math.PI + 0.45, side: 'R', angle: Math.PI - 0.52, omega: 0, held: false },
  ];
  return { walls, slings, bumpers, drops, rollovers, flippers, shooter: v(W - lane / 2, H - 0.06), centre: cx };
}

export interface PinballEvents { type: 'bumper' | 'sling' | 'rollover' | 'drop' | 'bank' | 'drain' | 'tilt' | 'replay' | 'launch' | 'gameOver'; id?: string; score?: number }

export class Pinball {
  readonly t = layout();
  ball = { x: 0, y: 0, vx: 0, vy: 0, live: false, inLane: true };
  score = 0; ballNo = 1; bonus = 0; mult = 1; credits = 0; over = false;
  lit = new Set<string>(); bumpersLit = false;
  tilted = false; private nudges: number[] = []; private time = 0;
  private replayed = false;
  /** sounds and lights for the UI: drained by the caller each frame */
  events: PinballEvents[] = [];
  private acc = 0;
  constructor(private rng = new Rng(1974)) { this.serve(); }

  private serve() { const s = this.t.shooter; Object.assign(this.ball, { x: s.x, y: s.y, vx: 0, vy: 0, live: true, inLane: true }); }
  /** Plunger: pull 0..1. A full pull reaches the top arch; a soft one dribbles back. */
  launch(pull: number) {
    if (!this.ball.inLane || this.over) return false;
    const p = Math.max(0.15, Math.min(1, pull));
    this.ball.vy = -(1.6 + 2.6 * p) * (0.97 + 0.06 * this.rng.next()); this.ball.inLane = false;
    this.events.push({ type: 'launch' }); return true;
  }
  flip(side: 'L' | 'R', held: boolean) { const f = this.t.flippers.find((q) => q.side === side)!; f.held = held && !this.tilted; }
  /** Bump the cabinet. Returns false when it tilts. */
  nudge(dx: number) {
    if (this.over || this.tilted) return false;
    this.nudges = this.nudges.filter((t) => this.time - t < TILT_WINDOW); this.nudges.push(this.time);
    if (this.nudges.length >= TILT_NUDGES) { this.tilted = true; for (const f of this.t.flippers) f.held = false; this.events.push({ type: 'tilt' }); return false; }
    if (this.ball.live && !this.ball.inLane) { this.ball.vx += Math.sign(dx) * 0.25; this.ball.vy -= 0.12; }
    return true;
  }

  /** Advance real time; the physics runs in fixed 1/480 s steps. */
  step(dt: number) {
    if (this.over) return;
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= STEP) { this.acc -= STEP; this.tick(STEP); }
  }

  private tick(h: number) {
    this.time += h;
    for (const f of this.t.flippers) {
      const target = f.held ? f.up : f.rest, d = target - f.angle;
      const sp = FLIP_SPEED * (f.held ? 1 : 0.6);
      f.omega = Math.abs(d) < 1e-4 ? 0 : Math.sign(d) * Math.min(sp, Math.abs(d) / h);
      f.angle += f.omega * h;
    }
    const b = this.ball; if (!b.live) return;
    if (b.inLane) return;
    b.vy += G * h;
    b.x += b.vx * h; b.y += b.vy * h;
    // walls, slingshots, drop targets
    for (const s of this.t.walls) this.collideSeg(s, 0, 0, REST);
    // a slingshot's rubber face looks into the table: hit from behind (the inlane side) it's a plain wall
    for (const s of this.t.slings) if (this.collideSeg(s, 0, 0, REST) && this.onFace(s)) { this.kick(s); this.add(SCORES.sling); this.events.push({ type: 'sling', id: s.id }); }
    for (const d of this.t.drops) if (!d.down && this.collideSeg(d.seg, 0, 0, REST)) this.dropHit(d);
    for (const bu of this.t.bumpers) this.collideBumper(bu);
    for (const f of this.t.flippers) this.collideFlipper(f);
    for (const r of this.t.rollovers) if (!this.lit.has(r.letter) && Math.hypot(b.x - r.x, b.y - r.y) < 0.02 && b.vy > 0) this.rollover(r.letter);
    // speed cap (a real ball rarely exceeds ~5 m/s on a table this size)
    const sp = Math.hypot(b.vx, b.vy); if (sp > 5) { b.vx *= 5 / sp; b.vy *= 5 / sp; }
    // the shooter lane returns a weak plunge
    if (b.x > TABLE.w - 0.035 && b.y > 0.16 && b.vy > 0 && b.y > this.t.shooter.y) { Object.assign(b, { x: this.t.shooter.x, y: this.t.shooter.y, vx: 0, vy: 0, inLane: true }); }
    if (b.y > TABLE.h + BALL_R) this.drain();
  }

  private add(n: number) {
    if (this.tilted) return;
    this.score += n;
    if (!this.replayed && this.score >= REPLAY) { this.replayed = true; this.credits++; this.events.push({ type: 'replay', score: this.score }); }
  }
  private onFace(s: Seg) { const mx = (s.a.x + s.b.x) / 2; return Math.sign(this.ball.x - mx) === Math.sign(this.t.centre - mx); }
  private kick(s: Seg) {
    const nx = -(s.b.y - s.a.y), ny = s.b.x - s.a.x, L = Math.hypot(nx, ny);
    const b = this.ball; let ux = nx / L, uy = ny / L;
    const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2; if ((b.x - mx) * ux + (b.y - my) * uy < 0) { ux = -ux; uy = -uy; }
    b.vx += ux * (s.kick ?? 0); b.vy += uy * (s.kick ?? 0);
  }
  private dropHit(d: DropTarget) {
    d.down = true; this.add(SCORES.drop); this.bonus++; this.events.push({ type: 'drop', id: d.letter });
    if (this.t.drops.every((x) => x.down)) { this.mult = Math.min(5, this.mult + 1); this.add(SCORES.dropBank); this.events.push({ type: 'bank', score: this.mult }); for (const x of this.t.drops) x.down = false; }
  }
  private rollover(letter: string) {
    this.lit.add(letter); this.add(SCORES.rollover); this.bonus++; this.events.push({ type: 'rollover', id: letter });
    if (this.lit.size === 3) { this.bumpersLit = true; this.lit.clear(); }
  }
  private drain() {
    const b = this.ball; b.live = false;
    const bonus = this.tilted ? 0 : this.bonus * this.mult * SCORES.bonusUnit;
    if (bonus) this.add(bonus);
    this.events.push({ type: 'drain', score: bonus });
    this.bonus = 0; this.mult = 1; this.tilted = false; this.nudges = [];
    if (++this.ballNo > BALLS) { this.over = true; this.events.push({ type: 'gameOver', score: this.score }); return; }
    this.serve();
  }

  /** Circle–segment contact with an optional moving surface (sx, sy = surface velocity at contact). */
  private collideSeg(s: Seg, sx: number, sy: number, e: number, svAt?: (px: number, py: number) => Vec): boolean {
    const b = this.ball;
    const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, L2 = ex * ex + ey * ey;
    let t = ((b.x - s.a.x) * ex + (b.y - s.a.y) * ey) / L2; t = Math.max(0, Math.min(1, t));
    const px = s.a.x + ex * t, py = s.a.y + ey * t;
    let dx = b.x - px, dy = b.y - py; const d = Math.hypot(dx, dy);
    if (d >= BALL_R || d < 1e-9) return false;
    dx /= d; dy /= d;
    b.x = px + dx * BALL_R; b.y = py + dy * BALL_R;
    if (svAt) { const w = svAt(px, py); sx = w.x; sy = w.y; }
    const rvx = b.vx - sx, rvy = b.vy - sy, vn = rvx * dx + rvy * dy;
    if (vn < 0) { b.vx -= (1 + e) * vn * dx; b.vy -= (1 + e) * vn * dy; }
    return true;
  }
  private collideBumper(bu: Bumper) {
    const b = this.ball; let dx = b.x - bu.x, dy = b.y - bu.y; const d = Math.hypot(dx, dy), R = bu.r + BALL_R;
    if (d >= R || d < 1e-9) return;
    dx /= d; dy /= d; b.x = bu.x + dx * R; b.y = bu.y + dy * R;
    const vn = b.vx * dx + b.vy * dy;
    if (vn < 0) { b.vx -= 1.6 * vn * dx; b.vy -= 1.6 * vn * dy; }
    b.vx += dx * 1.1; b.vy += dy * 1.1; // the pop coil
    this.add(this.bumpersLit ? SCORES.bumperLit : SCORES.bumper); this.events.push({ type: 'bumper', id: bu.id });
  }
  private collideFlipper(f: Flipper) {
    const tip = v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len);
    const seg: Seg = { a: f.pivot, b: tip };
    // surface velocity of the rotating bat at the contact point: omega × r
    this.collideSeg(seg, 0, 0, FLIP_REST, (px, py) => v(-f.omega * (py - f.pivot.y), f.omega * (px - f.pivot.x)));
  }

  /** For the renderer. */
  flipperTip(f: Flipper) { return v(f.pivot.x + Math.cos(f.angle) * f.len, f.pivot.y + Math.sin(f.angle) * f.len); }
}
