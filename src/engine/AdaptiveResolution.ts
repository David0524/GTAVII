/**
 * Adaptive render resolution (oversight, first iPhone report: "preset Low at DPR 1.13 on a DPR-3 phone is
 * very soft"). Hill-climbs the renderer pixel ratio while the frame keeps its vsync-locked interval:
 *   - the target is a real vsync rate: 16.7 ms if any window has reached 60 Hz, else 33.3 ms (30 Hz).
 *     (It used to lock onto the best p50 seen; on the iPhone that was 34 ms while frames ran at 41 ms,
 *     so it never backed off.)
 *   - every 2.5 s window with p95 within 10% of the target raises the scale by 0.1, up to min(DPR, 2);
 *   - a window with p50 more than 15% over it drops the scale by 0.15 and holds a ceiling for 30 s
 *     (no oscillation between two sizes).
 * Starts once loading has settled. On by default on touch devices; ?adaptive=0 / ?adaptive=1 to force.
 */
export class AdaptiveResolution {
  scale: number;
  private samples: number[] = [];
  private t = 0;
  private locked = Infinity;
  private ceiling: number;
  private ceilingT = 0;
  constructor(base: number, readonly min: number, readonly max: number, private apply: (pr: number) => void) {
    this.scale = base; this.ceiling = max;
  }

  /** Call once per frame with the real frame interval (ms) and dt (s). */
  update(intervalMs: number, dt: number) {
    this.samples.push(intervalMs); this.t += dt;
    if (this.ceilingT > 0 && (this.ceilingT -= dt) <= 0) this.ceiling = this.max;
    if (this.t < 2.5 || this.samples.length < 20) return;
    const a = this.samples.sort((x, y) => x - y), p50 = a[a.length >> 1], p95 = a[Math.floor(a.length * 0.95)];
    this.samples = []; this.t = 0;
    this.locked = Math.min(this.locked, p50);
    const target = this.locked < 20 ? 1000 / 60 : 1000 / 30;
    if (p50 > target * 1.15 && this.scale > this.min) {
      this.ceiling = this.scale; this.ceilingT = 30;
      this.set(this.scale - 0.15);
    } else if (p95 <= target * 1.1 && this.scale + 0.1 <= Math.min(this.ceiling, this.max) + 1e-6) {
      this.set(this.scale + 0.1);
    }
  }
  private set(s: number) {
    const v = Math.round(Math.min(this.max, Math.max(this.min, s)) * 100) / 100;
    if (v === this.scale) return;
    this.scale = v; this.apply(v);
  }
  describe() { return `adaptive dpr ${this.scale.toFixed(2)} (range ${this.min.toFixed(2)}-${this.max.toFixed(2)}, best p50 ${Number.isFinite(this.locked) ? this.locked.toFixed(1) : '?'} ms, target ${Number.isFinite(this.locked) ? (this.locked < 20 ? '60' : '30') : '?'} Hz)`; }
}
