/**
 * Where am I? Converts world x,z into Manhattan grid coordinates (fractional street number and avenue
 * index) using the real centrelines, then names the 1974 district and nearest intersection.
 * District names are period-appropriate: no "NoMad", "Koreatown" or "Flatiron District" (later coinages).
 */
import type { StreetRec } from '../ui/Minimap';

const AVENUES: [string, number][] = [
  ['11th Avenue', 11], ['10th Avenue', 10], ['9th Avenue', 9], ['8th Avenue', 8], ['7th Avenue', 7], ['6th Avenue', 6],
  ['5th Avenue', 5], ['Madison Avenue', 4.5], ['Park Avenue South', 4], ['Park Avenue', 4], ['Lexington Avenue', 3.5], ['3rd Avenue', 3],
];
const SHORT: Record<string, string> = {
  '11th Avenue': '11th Ave', '10th Avenue': '10th Ave', '9th Avenue': '9th Ave', '8th Avenue': '8th Ave', '7th Avenue': '7th Ave', '6th Avenue': '6th Ave',
  '5th Avenue': '5th Ave', 'Madison Avenue': 'Madison Ave', 'Park Avenue South': 'Park Ave So', 'Park Avenue': 'Park Ave', 'Lexington Avenue': 'Lexington Ave', '3rd Avenue': '3rd Ave', Broadway: 'Broadway',
};

/** [name, streetFrom, streetTo, avenueFrom (east), avenueTo (west)] avenue indices grow westward. First match wins. */
const DISTRICTS: [string, number, number, number, number][] = [
  ['Times Square', 41.5, 48, 6, 8],
  ['Herald Square', 33, 35.5, 5.6, 6.6],
  ['Penn Station', 31, 33.5, 7, 8.2],
  ['Madison Square', 22.5, 26.5, 4.4, 5.6],
  ['Bryant Park', 40, 42, 5, 6],
  ['The Garment District', 34, 41.5, 6, 9],
  ['The Fur District', 26.5, 31, 6.6, 8],
  ['The Flower District', 26, 29, 5.8, 6.8],
  ['The Tenderloin', 23, 34, 5, 7],
  ['Hell\'s Kitchen', 34, 59, 8, 12],
  ['Chelsea', 14, 34, 6, 12],
  ['Murray Hill', 30, 42, 3, 5],
  ['Kips Bay', 23, 34, 1, 3.6],
  ['Gramercy', 14, 23, 2.5, 4.5],
  ['Midtown', 42, 59, 3, 6],
  ['Ladies\' Mile', 14, 23, 4.4, 6],
];

export class Locator {
  private streets: [number, number][] = []; // [streetNumber, z]
  private avenues: [number, number][] = []; // [avenueIndex, x]
  constructor(private recs: StreetRec[]) {
    const zs = new Map<number, number[]>(), xs = new Map<number, number[]>();
    for (const s of recs) {
      const m = s.n.match(/^(?:East|West) (\d+)(?:st|nd|rd|th) Street$/);
      if (m) { const n = +m[1]; const a = zs.get(n) ?? []; for (let k = 1; k < s.p.length; k += 2) a.push(s.p[k]); zs.set(n, a); continue; }
      const av = AVENUES.find(([n]) => n === s.n);
      if (av) { const a = xs.get(av[1]) ?? []; for (let k = 0; k < s.p.length; k += 2) a.push(s.p[k]); xs.set(av[1], a); }
    }
    const med = (a: number[]) => { const b = [...a].sort((u, v) => u - v); return b[b.length >> 1]; };
    this.streets = [...zs].map(([n, a]) => [n, med(a)] as [number, number]).sort((a, b) => a[0] - b[0]);
    this.avenues = [...xs].map(([n, a]) => [n, med(a)] as [number, number]).sort((a, b) => b[1] - a[1]);
  }
  /** Fractional street number at world z (interpolated between real centrelines). */
  streetAt(z: number) { return interp(this.streets.map(([n, zz]) => [zz, n] as [number, number]).sort((a, b) => a[0] - b[0]), z); }
  /** Fractional avenue index at world x (5 = Fifth, grows westward). */
  avenueAt(x: number) { return interp(this.avenues.map(([n, xx]) => [xx, n] as [number, number]).sort((a, b) => a[0] - b[0]), x); }

  district(x: number, z: number): string {
    const st = this.streetAt(z), av = this.avenueAt(x);
    for (const [name, s0, s1, a0, a1] of DISTRICTS) if (st >= s0 && st < s1 && av >= a0 && av < a1) return name;
    return 'Manhattan';
  }

  /** "W 34th St & Broadway": nearest crosstown street and nearest avenue (or Broadway). */
  intersection(x: number, z: number): string {
    const st = Math.round(this.streetAt(z));
    const side = this.avenueAt(x) > 5 ? 'W' : 'E';
    let best = '', bd = Infinity;
    for (const s of this.recs) {
      if (!(s.n in SHORT)) continue;
      for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < bd) { bd = d; best = SHORT[s.n]; }
      }
    }
    return `${side} ${st}${ord(st)} St & ${best || 'Broadway'}`;
  }
}

function interp(pts: [number, number][], v: number): number {
  if (pts.length < 2) return 0;
  if (v <= pts[0][0]) return pts[0][1] + (v - pts[0][0]) * (pts[1][1] - pts[0][1]) / (pts[1][0] - pts[0][0]);
  for (let k = 1; k < pts.length; k++) if (v <= pts[k][0]) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; return y0 + (v - x0) * (y1 - y0) / (x1 - x0 || 1); }
  const [x0, y0] = pts[pts.length - 2], [x1, y1] = pts[pts.length - 1];
  return y1 + (v - x1) * (y1 - y0) / (x1 - x0 || 1);
}
function ord(n: number) { const s = n % 100; if (s >= 11 && s <= 13) return 'th'; return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'; }
