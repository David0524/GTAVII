/** Deterministic PRNG (mulberry32). Every gameplay roll goes through one of these so headless tests replay exactly. */
export class Rng {
  private s: number;
  constructor(seed = 0x7419) { this.s = seed >>> 0; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  /** Approximately normal (sum of 3 uniforms), mean 0, sd ~1. */
  gauss() { return (this.next() + this.next() + this.next() - 1.5) * 2; }
  get state() { return this.s; }
  set state(v: number) { this.s = v >>> 0; }
}
