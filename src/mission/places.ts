/**
 * Narrative place resolution (NARRATIVE_BRIEF "engine contract": content names real places, the engine resolves them).
 *   loc.<id>       content/places.json: `at` is an intersection ("W 31st St & 7th Ave", 3-way allowed) or a street with
 *                  `between: [cross1, cross2]` and `side` (north/south/east/west): mid-block on that side's sidewalk
 *   lm.<id>        world.json heroes (landmarks)
 *   "A & B"        an intersection string
 *   "<n> <Street>" an address: falls back to the street's nearest point to the map centre (coarse; logged)
 * Street names are normalised ("W 31st St" = "West 31st Street", "7th Ave" = "7th Avenue").
 */
export interface StreetRec { n: string; p: number[] }
export interface PlaceRec { id: string; name: string; at: string; between?: [string, string]; side?: string; kind?: string; discovery?: { via?: string[]; mission?: string; hiddenUntilIntroduced?: boolean; notify?: 'silent' | 'toast' } }
export interface Resolved { x: number; z: number; name: string }

export function normStreet(s: string): string {
  return s.toLowerCase().trim()
    .replace(/^w\.? /, 'west ').replace(/^e\.? /, 'east ')
    .replace(/ st\.?$/, ' street').replace(/ ave?\.?$/, ' avenue').replace(/ pl\.?$/, ' place').replace(/ sq\.?$/, ' square')
    .replace(/^ave(nue)? of the americas$/, '6th avenue')
    .replace(/\s+/g, ' ');
}

export class Places {
  private byName = new Map<string, number[][]>();
  readonly misses: string[] = [];
  constructor(streets: StreetRec[], private places: Map<string, PlaceRec>, private landmarks: Map<string, { x: number; z: number; name: string }>) {
    for (const s of streets) { const k = normStreet(s.n); (this.byName.get(k) ?? this.byName.set(k, []).get(k)!).push(s.p); }
  }

  place(id: string) { return this.places.get(id); }

  resolve(ref: string): Resolved | null {
    if (ref.startsWith('lm.')) { const l = this.landmarks.get(ref); return l ? { x: l.x, z: l.z, name: l.name } : this.miss(ref); }
    if (ref.startsWith('loc.')) {
      const p = this.places.get(ref); if (!p) return this.miss(ref);
      const r = p.between ? this.midBlock(p.at, p.between, p.side) : this.intersection(p.at);
      return r ? { ...r, name: p.name } : this.miss(ref);
    }
    if (ref.includes('&')) { const r = this.intersection(ref); return r ? { ...r, name: ref } : this.miss(ref); }
    const m = ref.match(/^\d+\s+(.*)$/); if (m) { const r = this.streetNear(m[1], 0, -800); return r ? { ...r, name: ref } : this.miss(ref); }
    return this.miss(ref);
  }

  private miss(ref: string): null { if (!this.misses.includes(ref)) { this.misses.push(ref); console.warn(`[mission] unresolved place ${ref}`); } return null; }

  /** Nearest point between two (or more) named streets: the crossing. */
  intersection(at: string): { x: number; z: number } | null {
    const r = this.cross(at); if (r) return r;
    // West 41st doesn't reach 5th Ave (Bryant Park): the avenue is the East/West boundary, so try the other half
    const sw = at.replace(/\b(W|West)\b\.?/g, 'East');
    if (sw !== at) { const r2 = this.cross(sw); if (r2) return r2; }
    const se = at.replace(/\b(E|East)\b\.?/g, 'West'); return se !== at ? this.cross(se) : null;
  }
  private cross(at: string): { x: number; z: number } | null {
    const names = at.split('&').map((s) => normStreet(s));
    const A = this.byName.get(names[0]), B = this.byName.get(names[1]); if (!A || !B) return null;
    // a true segment crossing first (long segments have no vertex near the crossing)
    for (const a of A) for (const b of B) for (let i = 2; i < a.length; i += 2) for (let j = 2; j < b.length; j += 2) {
      const X = segX(a[i - 2], a[i - 1], a[i], a[i + 1], b[j - 2], b[j - 1], b[j], b[j + 1]); if (X) return X;
    }
    let best = Infinity, bx = 0, bz = 0;
    // no crossing in the data (a street ending at the other, or a gap such as Broadway at Herald Square): the
    // closest approach, taken on the first-named street (the crossing is on its line)
    for (const [P, Q, onA] of [[A, B, true], [B, A, false]] as const) for (const a of P) for (let i = 0; i < a.length; i += 2) for (const b of Q) {
      const q = closestOnPoly(b, a[i], a[i + 1]);
      if (q.d < best) { best = q.d; bx = onA ? a[i] : q.x; bz = onA ? a[i + 1] : q.z; }
    }
    return best < 100 ? { x: bx, z: bz } : null;
  }

  /** Mid-block on `street` between two crossings, offset 9 m to the given side (onto the sidewalk). */
  midBlock(street: string, between: [string, string], side?: string): { x: number; z: number } | null {
    let a = this.intersection(`${street} & ${between[0]}`), b = this.intersection(`${street} & ${between[1]}`);
    // one crossing outside the street data (e.g. 9th Ave at the map edge): a block (~80 m) along the street from the other
    if (!a && !b) return null;
    if (!a || !b) { const k = (a ?? b)!, pt = this.streetNear(street, k.x + 300, k.z) ?? this.streetNear(street, k.x - 300, k.z); if (!pt) return null; const L = Math.hypot(pt.x - k.x, pt.z - k.z) || 1; const o = { x: k.x + ((pt.x - k.x) / L) * 160, z: k.z + ((pt.z - k.z) / L) * 160 }; a = a ?? o; b = b ?? o; }
    let x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L; // a normal to the street
    // map sides to the world: north = -z, south = +z, east = +x, west = -x (grid-aligned enough for a sidewalk pick)
    const want = side === 'north' ? [0, -1] : side === 'south' ? [0, 1] : side === 'east' ? [1, 0] : side === 'west' ? [-1, 0] : null;
    if (want) { const s = Math.sign(nx * want[0] + nz * want[1]) || 1; x += nx * 9 * s; z += nz * 9 * s; }
    return { x, z };
  }

  private streetNear(street: string, x: number, z: number) {
    const A = this.byName.get(normStreet(street)); if (!A) return null;
    let best = { d: Infinity, x: 0, z: 0 }; for (const a of A) { const q = closestOnPoly(a, x, z); if (q.d < best.d) best = q; }
    return { x: best.x, z: best.z };
  }
}

function segX(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const r1 = bx - ax, r2 = bz - az, s1 = dx - cx, s2 = dz - cz, den = r1 * s2 - r2 * s1;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * s2 - (cz - az) * s1) / den, u = ((cx - ax) * r2 - (cz - az) * r1) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: ax + r1 * t, z: az + r2 * t } : null;
}

function closestOnPoly(p: number[], x: number, z: number) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let k = 2; k < p.length; k += 2) {
    const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(qx - x, qz - z);
    if (d < best.d) best = { d, x: qx, z: qz };
  }
  return best;
}
