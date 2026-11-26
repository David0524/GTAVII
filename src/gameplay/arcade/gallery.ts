/**
 * "Dead-Eye Gallery", an original electro-mechanical rifle gallery (1974: a light beam from a chained
 * rifle to photocells on tin targets riding chain belts). Headless and deterministic; the UI draws `rows`.
 *
 * Three belts run at different speeds and directions. Ducks are worth 100, rabbits 200, and the
 * slow owl on the top belt 500. Each hit target flips down and pops back up on its next lap. Hitting the
 * bell (the rare gold target) adds 10 seconds. A game is 45 seconds or 30 shots, whichever runs out
 * first. Aim is a reticle in 0..1 screen space: touch drags it, a mouse moves it, a gamepad stick nudges it.
 */
import { Rng } from '../core/rng';

export type TargetKind = 'duck' | 'rabbit' | 'owl' | 'bell';
export interface GalleryTarget { id: number; kind: TargetKind; x: number; down: boolean; downUntil: number }
export interface Belt { y: number; speed: number; targets: GalleryTarget[] }
export const GALLERY = { seconds: 45, shots: 30, hitHalfWidth: 0.035, hitHalfHeight: 0.05, bellBonus: 10 };
export const POINTS: Record<TargetKind, number> = { duck: 100, rabbit: 200, owl: 500, bell: 0 };

export interface GalleryEvent { type: 'hit' | 'miss' | 'bell' | 'over'; kind?: TargetKind; points?: number }

export class Gallery {
  rows: Belt[];
  score = 0; shots = 0; hits = 0; time = 0; over = false;
  aim = { x: 0.5, y: 0.5 };
  events: GalleryEvent[] = [];
  private seconds = GALLERY.seconds;
  private seq = 0;
  constructor(private rng = new Rng(1974)) {
    const row = (y: number, speed: number, n: number, kind: TargetKind): Belt => ({ y, speed, targets: Array.from({ length: n }, (_, i) => ({ id: this.seq++, kind, x: i / n, down: false, downUntil: 0 })) });
    this.rows = [row(0.25, 0.06, 3, 'owl'), row(0.5, -0.14, 6, 'rabbit'), row(0.75, 0.22, 8, 'duck')];
    // one duck on the bottom belt is the bell
    this.rows[2].targets[this.rng.int(0, 7)].kind = 'bell';
  }
  get timeLeft() { return Math.max(0, this.seconds - this.time); }

  setAim(x: number, y: number) { this.aim.x = Math.min(1, Math.max(0, x)); this.aim.y = Math.min(1, Math.max(0, y)); }
  step(dt: number) {
    if (this.over) return;
    this.time += dt;
    for (const r of this.rows) for (const t of r.targets) {
      const before = t.x;
      t.x = (((t.x + r.speed * dt) % 1) + 1) % 1;
      // a target that went down pops back up once it has ridden off the end and come round
      if (t.down && this.time >= t.downUntil && Math.abs(t.x - before) > 0.5) t.down = false;
    }
    if (this.timeLeft <= 0 || this.shots >= GALLERY.shots) this.end();
  }
  /** Pull the trigger. Returns the target hit, or null. */
  fire(): GalleryTarget | null {
    if (this.over || this.shots >= GALLERY.shots) return null;
    this.shots++;
    let best: GalleryTarget | null = null, bd = Infinity;
    for (const r of this.rows) {
      if (Math.abs(this.aim.y - r.y) > GALLERY.hitHalfHeight) continue;
      for (const t of r.targets) {
        if (t.down) continue;
        const dx = Math.abs(this.aim.x - t.x);
        if (dx <= GALLERY.hitHalfWidth && dx < bd) { bd = dx; best = t; }
      }
    }
    if (!best) { this.events.push({ type: 'miss' }); if (this.shots >= GALLERY.shots) this.end(); return null; }
    best.down = true; best.downUntil = this.time + 1;
    this.hits++;
    if (best.kind === 'bell') { this.seconds += GALLERY.bellBonus; this.events.push({ type: 'bell' }); }
    else { const p = POINTS[best.kind]; this.score += p; this.events.push({ type: 'hit', kind: best.kind, points: p }); }
    if (this.shots >= GALLERY.shots) this.end();
    return best;
  }
  private end() { if (!this.over) { this.over = true; this.events.push({ type: 'over', points: this.score }); } }
}
