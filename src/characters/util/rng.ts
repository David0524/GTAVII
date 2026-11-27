/** Small deterministic RNG helpers (mulberry32). Every generated person is a pure function of a seed. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  /** Approximately normal (sum of 3 uniforms), mean m, sd s, clamped to [lo, hi]. */
  normal(m: number, s: number, lo = -Infinity, hi = Infinity) { const v = m + (this.next() + this.next() + this.next() - 1.5) * 2 * s; return Math.min(hi, Math.max(lo, v)); }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  /** Weighted pick from [item, weight] pairs. */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0; for (const [, w] of items) total += Math.max(0, w);
    let r = this.next() * total;
    for (const [it, w] of items) { r -= Math.max(0, w); if (r <= 0) return it; }
    return items[items.length - 1][0];
  }
  /** Derive an independent stream for a sub-system (so adding draws in one doesn't reshuffle others). */
  fork(salt: number) { return new Rng(hash2(this.s, salt)); }
}

export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(b + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return h >>> 0;
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
