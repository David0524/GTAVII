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
 */
export const PLAYABLE = { minX: -1292, maxX: 213, minZ: -1674, maxZ: 92 } as const;

/** Signed distance in metres to the playable edge: positive inside, negative outside. */
export function edgeDistance(x: number, z: number): number {
  const dx = Math.min(x - PLAYABLE.minX, PLAYABLE.maxX - x);
  const dz = Math.min(z - PLAYABLE.minZ, PLAYABLE.maxZ - z);
  if (dx >= 0 && dz >= 0) return Math.min(dx, dz);
  const ox = Math.min(dx, 0), oz = Math.min(dz, 0);
  return -Math.hypot(ox, oz);
}

/** Unit vector pointing back into the playable area from (x,z) (for "face inward" recovery). */
export function inwardDirection(x: number, z: number): [number, number] {
  const cx = (PLAYABLE.minX + PLAYABLE.maxX) / 2, cz = (PLAYABLE.minZ + PLAYABLE.maxZ) / 2;
  const dx = Math.min(x - PLAYABLE.minX, PLAYABLE.maxX - x), dz = Math.min(z - PLAYABLE.minZ, PLAYABLE.maxZ - z);
  if (dx < dz) return [x < cx ? 1 : -1, 0];
  return [0, z < cz ? 1 : -1];
}

/**
 * Layered edge treatment thresholds (metres of edgeDistance). Streams key behaviour off these:
 *   sim: density/gridlock ramp starts at RAMP and no spawns beyond the edge;
 *   engine: period blockers sit between BLOCKERS and the edge; film-out (layer 4) begins below 0.
 */
export const EDGE = { RAMP: 160, BLOCKERS: 60, FILM_OUT: 0, RESET: -45 } as const;
