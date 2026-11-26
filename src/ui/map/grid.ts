/**
 * Street-grid helpers for the UI: normalise narrative street spellings ("W 31st St", "8th Ave") to the
 * OSM names in streets.json, intersect centrelines, and resolve narrative place strings
 * ("W 31st St & 8th Ave", "W 31st St" between ["Broadway","6th Ave"] side "north") to world x,z.
 * Pure functions over StreetRec[] so the build tool and the runtime share them.
 * World frame (src/shared/geo.ts): grid-aligned, north = -z, west = -x.
 */
import type { StreetRec } from '../../shared/uiHost';
export type { StreetRec };

const ORD: Record<string, string> = { '1': 'st', '2': 'nd', '3': 'rd' };
function ordinal(n: number) { const t = n % 100; return `${n}${t >= 11 && t <= 13 ? 'th' : ORD[String(n % 10)] ?? 'th'}`; }

/** "W 31st St" -> "West 31st Street"; "8th Ave" -> "8th Avenue"; "Park Ave So" -> "Park Avenue South". */
export function normaliseStreet(s: string): string {
  let t = s.trim().replace(/\./g, '');
  const m = t.match(/^(W|E|West|East)\s+(\d+)(?:st|nd|rd|th)?\s+(St|Street)$/i);
  if (m) return `${m[1].toUpperCase().startsWith('W') ? 'West' : 'East'} ${ordinal(+m[2])} Street`;
  t = t.replace(/\bAve\b/i, 'Avenue').replace(/\bSo\b$/i, 'South').replace(/\bSt\b$/i, 'Street');
  const a = t.match(/^(\d+)(?:st|nd|rd|th)?\s+Avenue$/i);
  if (a) return `${ordinal(+a[1])} Avenue`;
  return t;
}

/** Short period street-sign style: "West 31st Street" -> "W 31 St", "8th Avenue" -> "8 Av". */
export function shortStreet(n: string): string {
  return n.replace(/^West /, 'W ').replace(/^East /, 'E ').replace(/(\d+)(st|nd|rd|th)/, '$1').replace(/ Street$/, ' St').replace(/ Avenue$/, ' Av').replace(/ South$/, ' So');
}

export class StreetIndex {
  private byName = new Map<string, StreetRec[]>();
  constructor(readonly streets: StreetRec[]) {
    for (const s of streets) { if (!s.n) continue; const a = this.byName.get(s.n) ?? []; a.push(s); this.byName.set(s.n, a); }
  }
  has(name: string) { return this.byName.has(normaliseStreet(name)); }
  get(name: string) { return this.byName.get(normaliseStreet(name)) ?? []; }

  /** Point where two named streets meet (true segment intersection, else the closest approach within 40 m). */
  intersect(a: string, b: string, maxD = 40): [number, number] | null {
    const r = this.intersectRaw(a, b, maxD);
    if (r) return r;
    // Fifth Avenue splits East from West: a corner on Fifth may be stored under the other half.
    const flip = (n: string) => { const m = normaliseStreet(n); return m.startsWith('West ') ? m.replace('West ', 'East ') : m.startsWith('East ') ? m.replace('East ', 'West ') : null; };
    const fa = flip(a), fb = flip(b);
    return (fa && this.intersectRaw(fa, b, maxD)) || (fb && this.intersectRaw(a, fb, maxD)) || (maxD < 90 ? this.intersect(a, b, 90) : null);
  }
  private intersectRaw(a: string, b: string, maxD: number): [number, number] | null {
    const A = this.get(a), B = this.get(b);
    let best: [number, number] | null = null, bestD = maxD;
    for (const sa of A) for (const sb of B) for (let i = 2; i < sa.p.length; i += 2) for (let j = 2; j < sb.p.length; j += 2) {
      const r = segClosest(sa.p[i - 2], sa.p[i - 1], sa.p[i], sa.p[i + 1], sb.p[j - 2], sb.p[j - 1], sb.p[j], sb.p[j + 1]);
      if (r.d < bestD) { bestD = r.d; best = [r.x, r.z]; if (r.d === 0) return best; }
    }
    return best;
  }

  /** Where a numbered street *would* cross an avenue when that block of it doesn't exist (superblocks like
   *  Penn South): halfway between the neighbouring streets' crossings. */
  interpolated(street: string, ave: string): [number, number] | null {
    const m = normaliseStreet(street).match(/^(West|East) (\d+)(st|nd|rd|th) Street$/); if (!m) return null;
    const n = +m[2], name = (k: number) => `${m[1]} ${ordinal(k)} Street`;
    for (let d = 1; d <= 2; d++) {
      const lo = this.intersect(name(n - d), ave), hi = this.intersect(name(n + d), ave);
      if (lo && hi) return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2];
    }
    return null;
  }

  /** Mean direction (unit) of a named street near a point. */
  direction(name: string, x: number, z: number): [number, number] {
    let best = Infinity, dir: [number, number] = [1, 0];
    for (const s of this.get(name)) for (let k = 2; k < s.p.length; k += 2) {
      const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az, L = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (L * L)));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) { best = d; dir = [dx / L, dz / L]; }
    }
    return dir;
  }

  /** Nearest named street and distance. */
  nearest(x: number, z: number, filter?: (s: StreetRec) => boolean): { name: string; d: number } {
    let best = Infinity, name = '';
    for (const s of this.streets) {
      if (!s.n || (filter && !filter(s))) continue;
      for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az, L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
        const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
        if (d < best) { best = d; name = s.n; }
      }
    }
    return { name, d: best };
  }

  /**
   * Resolve a narrative place: `at` is "A & B[ & C]" (a corner) or a single street with `between`
   * (a block face). `side` pushes the point off the centreline onto the sidewalk / into the block.
   */
  resolve(at: string, between?: string[], side?: string): [number, number] | null {
    const parts = at.split('&').map((s) => s.trim()).filter(Boolean);
    let p: [number, number] | null = null;
    if (parts.length >= 2) {
      const pts: [number, number][] = [];
      // A three-way corner ("Broadway & 5th Ave & E 23rd St") is defined by the numbered street: average
      // only the crossings that involve it (Broadway meets Fifth two blocks north of 23rd).
      const numbered = parts.findIndex((s) => /\d+(st|nd|rd|th)?\s+(St|Street)$/i.test(s));
      for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
        if (parts.length > 2 && numbered >= 0 && i !== numbered && j !== numbered) continue;
        const q = this.intersect(parts[i], parts[j]); if (q) pts.push(q);
      }
      if (pts.length) p = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
    } else if (parts.length === 1 && between?.length === 2) {
      const a = this.intersect(parts[0], between[0]) ?? this.interpolated(parts[0], between[0]), b = this.intersect(parts[0], between[1]) ?? this.interpolated(parts[0], between[1]);
      if (a && b) p = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }
    if (!p) return null;
    const off = 14; // metres: roadway half-width + sidewalk to the building line
    const S: Record<string, [number, number]> = {
      north: [0, -off], south: [0, off], east: [off, 0], west: [-off, 0],
      ne_corner: [off * .8, -off * .8], nw_corner: [-off * .8, -off * .8], se_corner: [off * .8, off * .8], sw_corner: [-off * .8, off * .8],
    };
    const o = side ? S[side] : undefined;
    return o ? [p[0] + o[0], p[1] + o[1]] : p;
  }
}

function segClosest(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const rX = bx - ax, rZ = bz - az, sX = dx - cx, sZ = dz - cz, den = rX * sZ - rZ * sX;
  if (Math.abs(den) > 1e-9) {
    const t = ((cx - ax) * sZ - (cz - az) * sX) / den, u = ((cx - ax) * rZ - (cz - az) * rX) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { x: ax + rX * t, z: az + rZ * t, d: 0 };
  }
  // closest of the four endpoint-to-segment distances
  const cands = [pt(ax, az, cx, cz, dx, dz), pt(bx, bz, cx, cz, dx, dz), pt(cx, cz, ax, az, bx, bz), pt(dx, dz, ax, az, bx, bz)];
  return cands.reduce((m, c) => (c.d < m.d ? c : m));
}
function pt(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  const qx = ax + dx * t, qz = az + dz * t;
  return { x: (px + qx) / 2, z: (pz + qz) / 2, d: Math.hypot(px - qx, pz - qz) };
}
