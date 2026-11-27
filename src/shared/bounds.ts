/**
 * Playable boundary: engine-owned shared API (see docs/briefs/BOUNDARIES.md).
 *
 * The playable area is smaller than the modelled city: beyond it sit full-detail buffer
 * chunks, then low-detail shells, rivers and boroughs, so the city never visibly ends.
 * Edges fall mid-block, beyond any story street, and lean on real 1974 barriers where they
 * exist: the Penn Central rail cut / West Side Yard and the Lincoln Tunnel trench on the
 * west side.
 *
 * Bounds (story core: user pillar "small map, very interactive"; supersedes the expanded bounds):
 *   west  : mid-block between 9th and 10th Aves (Lincoln Tunnel approach trench as layer-0 edge)  x = -1292
 *   east  : mid-block between Madison and Park Aves                                               x =   213
 *   north : mid-block between 43rd and 44th Sts (42nd St playable; Times Square visible beyond)    z = -1674
 *   south : mid-block between 21st and 22nd Sts (Madison Square Park and the Flatiron approach)    z =    92
 * plus the Grand Central annex (E17, PLAYABLE_ANNEX below): the playable area is a union of rectangles.
 */
export const PLAYABLE_CORE = { minX: -1292, maxX: 213, minZ: -1674, maxZ: 92 } as const;
/**
 * Grand Central annex (engine notice E17): Vanderbilt to just past Lexington, mid-block 41st/42nd to
 * mid-block 44th/45th. Takes in the terminal, the Park Ave viaduct around it, Pershing Square and the
 * Pan Amity base. Lexington Ave is its layer-0 edge.
 */
export const PLAYABLE_ANNEX = { minX: 213, maxX: 470, minZ: -1755, maxZ: -1506 } as const;
/** The playable area is the union of these rectangles. */
export const PLAYABLE_RECTS = [PLAYABLE_CORE, PLAYABLE_ANNEX] as const;
/** Bounding box of the union, for code that only needs a box (map extents, grids). Not a containment test: use inPlayable. */
export const PLAYABLE = {
  minX: Math.min(...PLAYABLE_RECTS.map((r) => r.minX)), maxX: Math.max(...PLAYABLE_RECTS.map((r) => r.maxX)),
  minZ: Math.min(...PLAYABLE_RECTS.map((r) => r.minZ)), maxZ: Math.max(...PLAYABLE_RECTS.map((r) => r.maxZ)),
} as const;

/**
 * Outline of the union as one simple polygon (x,z pairs).
 * Derived by hand from the two rectangles: the annex sits on the core's east edge and pokes 81 m north of it.
 */
export const PLAYABLE_OUTLINE: readonly (readonly [number, number])[] = [
  [PLAYABLE_CORE.minX, PLAYABLE_CORE.maxZ], [PLAYABLE_CORE.minX, PLAYABLE_CORE.minZ],
  [PLAYABLE_ANNEX.minX, PLAYABLE_CORE.minZ], [PLAYABLE_ANNEX.minX, PLAYABLE_ANNEX.minZ],
  [PLAYABLE_ANNEX.maxX, PLAYABLE_ANNEX.minZ], [PLAYABLE_ANNEX.maxX, PLAYABLE_ANNEX.maxZ],
  [PLAYABLE_ANNEX.minX, PLAYABLE_ANNEX.maxZ], [PLAYABLE_CORE.maxX, PLAYABLE_CORE.maxZ],
];

/** Inside the playable area (the union), with an optional inward margin in metres. */
export function inPlayable(x: number, z: number, margin = 0): boolean {
  return margin === 0 ? PLAYABLE_RECTS.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) : edgeDistance(x, z) >= margin;
}

// nearest point on the outline: [distance, qx, qz, edge index]
function nearestOnOutline(x: number, z: number): [number, number, number, number] {
  let best = Infinity, bx = 0, bz = 0, be = 0;
  const n = PLAYABLE_OUTLINE.length;
  for (let k = 0; k < n; k++) {
    const [ax, az] = PLAYABLE_OUTLINE[k], [cx, cz] = PLAYABLE_OUTLINE[(k + 1) % n];
    const ex = cx - ax, ez = cz - az, L2 = ex * ex + ez * ez;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz);
    if (d < best) { best = d; bx = qx; bz = qz; be = k; }
  }
  return [best, bx, bz, be];
}

/** Signed distance in metres to the playable edge (the union's outline): positive inside, negative outside. */
export function edgeDistance(x: number, z: number): number {
  const d = nearestOnOutline(x, z)[0];
  return inPlayable(x, z) ? d : -d; // points on the outline give 0 either way; the core/annex seam is inside
}

/** Unit vector pointing back into the playable area from (x,z) (for "face inward" recovery): away from the nearest edge. */
export function inwardDirection(x: number, z: number): [number, number] {
  const [d, qx, qz, k] = nearestOnOutline(x, z);
  if (d > 1e-6 && edgeDistance(x, z) < 0) return [(qx - x) / d, (qz - z) / d];
  // inside (or on the edge): the inward normal of the nearest outline edge
  const [ax, az] = PLAYABLE_OUTLINE[k], [cx, cz] = PLAYABLE_OUTLINE[(k + 1) % PLAYABLE_OUTLINE.length];
  const ex = cx - ax, ez = cz - az, L = Math.hypot(ex, ez);
  const nx = -ez / L, nz = ex / L; // one side; pick the one that points inside
  const mx = (ax + cx) / 2, mz = (az + cz) / 2;
  return edgeDistance(mx + nx, mz + nz) > 0 ? [nx, nz] : [-nx, -nz];
}

/**
 * Layered edge treatment thresholds (metres of edgeDistance). Streams key behaviour off these:
 *   sim: density/gridlock ramp starts at RAMP and no spawns beyond the edge;
 *   engine: period blockers sit between BLOCKERS and the edge; film-out (layer 4) begins below 0.
 */
export const EDGE = { RAMP: 160, BLOCKERS: 60, FILM_OUT: 0, RESET: -45 } as const;
