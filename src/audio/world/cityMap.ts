/**
 * Where the listener is, in 1974 terms: avenue and street positions measured from streets.json
 * (never hard-coded coordinates), districts as soft-edged blocks, and the clock curves that drive
 * density. All curves are hour-of-day tables, interpolated, documented in AUDIO_PROGRESS.md.
 */
import type { StreetRec } from '../acoustics/geometry';

export const AVENUES = ['8th Avenue', '7th Avenue', '6th Avenue', '5th Avenue', 'Madison Avenue', 'Park Avenue South', 'Lexington Avenue', '3rd Avenue'] as const;

export class CityMap {
  avenueX: Record<string, number> = {};
  private streetZ = new Map<number, number>();
  constructor(streets: StreetRec[]) {
    const xs: Record<string, number[]> = {};
    const zs = new Map<number, number[]>();
    for (const s of streets) {
      if ((AVENUES as readonly string[]).includes(s.n)) { (xs[s.n] ??= []); for (let k = 0; k < s.p.length; k += 2) xs[s.n].push(s.p[k]); }
      const m = /^(?:West|East) (\d+)\w\w Street$/.exec(s.n);
      if (m) { const n = +m[1]; if (!zs.has(n)) zs.set(n, []); for (let k = 1; k < s.p.length; k += 2) zs.get(n)!.push(s.p[k]); }
    }
    const med = (a: number[]) => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
    for (const [k, v] of Object.entries(xs)) this.avenueX[k] = med(v);
    for (const [k, v] of zs) this.streetZ.set(k, med(v));
    // Fallbacks so a partial streets file still works (values measured from the 2026-11 build).
    const fb: Record<string, number> = { '8th Avenue': -880, '7th Avenue': -605, '6th Avenue': -330, '5th Avenue': -19, 'Madison Avenue': 134, 'Park Avenue South': 298, 'Lexington Avenue': 446, '3rd Avenue': 603 };
    for (const k of AVENUES) this.avenueX[k] ??= fb[k];
  }
  /** World Z of the centreline of "West/East <n>th Street" (interpolated between measured streets). */
  z(n: number): number {
    const v = this.streetZ.get(n); if (v !== undefined) return v;
    const keys = [...this.streetZ.keys()].sort((a, b) => a - b);
    if (!keys.length) return -32 - (n - 23) * 79.7;
    let lo = keys[0], hi = keys[keys.length - 1];
    for (const k of keys) { if (k <= n) lo = k; if (k >= n) { hi = k; break; } }
    if (lo === hi) return this.streetZ.get(lo)! - (n - lo) * 79.7;
    const a = this.streetZ.get(lo)!, b = this.streetZ.get(hi)!; return a + (b - a) * (n - lo) / (hi - lo);
  }
  x(avenue: string) { return this.avenueX[avenue]; }

  /** Soft rectangle membership: 1 inside, fading to 0 over `edge` metres. */
  private rect(x: number, z: number, x0: number, x1: number, z0: number, z1: number, edge = 40) {
    const dx = Math.max(Math.min(x0, x1) - x, 0, x - Math.max(x0, x1)), dz = Math.max(Math.min(z0, z1) - z, 0, z - Math.max(z0, z1));
    return Math.max(0, 1 - Math.hypot(dx, dz) / edge);
  }

  districts(x: number, z: number) {
    const A = this.avenueX;
    return {
      garment: this.rect(x, z, -1000, A['6th Avenue'], this.z(34), this.z(41), 60),
      fur: this.rect(x, z, A['8th Avenue'], A['6th Avenue'], this.z(26), this.z(30), 50),
      flower: this.rect(x, z, A['7th Avenue'], A['6th Avenue'], this.z(28) + 25, this.z(28) - 25, 40),
      eighth: this.rect(x, z, A['8th Avenue'] - 45, A['8th Avenue'] + 45, this.z(35), this.z(45), 50),
      deuce: this.rect(x, z, A['8th Avenue'], A['7th Avenue'], this.z(42) + 30, this.z(42) - 30, 50),
      herald: Math.max(0, 1 - Math.hypot(x - (A['6th Avenue'] - 15), z - this.z(34)) / 160),
    };
  }
}

/** Piecewise-linear table over hours (0..24). */
export function curve(table: [number, number][], h: number): number {
  h = ((h % 24) + 24) % 24;
  for (let i = 1; i < table.length; i++) if (h <= table[i][0]) { const [h0, v0] = table[i - 1], [h1, v1] = table[i]; return v0 + (v1 - v0) * (h - h0) / Math.max(1e-6, h1 - h0); }
  return table[table.length - 1][1];
}
export const CURVE = {
  traffic: [[0, 0.38], [3, 0.16], [5, 0.22], [7, 0.7], [8.5, 1], [10, 0.82], [12, 0.88], [15, 0.86], [17.5, 1], [19, 0.8], [22, 0.6], [24, 0.38]] as [number, number][],
  peds: [[0, 0.16], [3, 0.04], [6, 0.12], [8, 0.8], [12, 1], [13, 0.95], [17.5, 1], [19, 0.6], [22, 0.4], [24, 0.16]] as [number, number][],
  birds: [[0, 0], [4.6, 0], [5.3, 1], [7, 0.65], [9, 0.3], [18, 0.25], [20.2, 0.45], [21, 0], [24, 0]] as [number, number][],
  night: [[0, 0.95], [2, 0.8], [4, 0.35], [6, 0], [19, 0.05], [21, 0.6], [23, 1], [24, 0.95]] as [number, number][],
  garment: [[0, 0], [6.5, 0], [7.5, 1], [12, 0.9], [17.5, 0.8], [18.5, 0], [24, 0]] as [number, number][],
  sirens: [[0, 1], [4, 0.7], [8, 0.5], [16, 0.6], [20, 0.9], [24, 1]] as [number, number][],
  dark: [[0, 1], [5.2, 1], [5.8, 0], [20.4, 0], [21, 1], [24, 1]] as [number, number][],
};

/** 0 = Sunday. */
export function weekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}
