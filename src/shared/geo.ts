/**
 * World coordinate frame shared by the data pipeline and the runtime.
 *
 * The world is aligned to the 1811 Commissioners' Plan grid, not true north:
 *   +X  = "Manhattan east" (crosstown, toward the East River)
 *   -Z  = "Manhattan north" (uptown, along the avenues)
 *   +Y  = up, metres
 * Origin = the Flatiron Building's north tip (Fifth Ave / Broadway / 23rd St).
 *
 * Projection is a local equirectangular tangent plane at the origin. Over the
 * ~2.5 km play area its distortion is well under 1 cm, and it is far simpler
 * than a full transverse Mercator. The grid is rotated GRID_ROTATION_DEG
 * clockwise from true north (measured from OSM Fifth Avenue, see build.ts log).
 */
export const ORIGIN_LAT = 40.741226;
export const ORIGIN_LON = -73.989584;
export const GRID_ROTATION_DEG = 29.11;

const R = 6378137;
const DEG = Math.PI / 180;
const COS_LAT0 = Math.cos(ORIGIN_LAT * DEG);
const ROT = GRID_ROTATION_DEG * DEG;
const C = Math.cos(ROT);
const S = Math.sin(ROT);

/** lon/lat -> world [x, z] in metres. */
export function project(lon: number, lat: number): [number, number] {
  const e = (lon - ORIGIN_LON) * DEG * R * COS_LAT0; // true east
  const n = (lat - ORIGIN_LAT) * DEG * R; // true north
  // Rotate so that grid-north becomes -Z and grid-east becomes +X.
  const gx = e * C - n * S;
  const gn = e * S + n * C;
  return [gx, -gn];
}

/** world [x, z] -> lon/lat. */
export function unproject(x: number, z: number): [number, number] {
  const gn = -z;
  const e = x * C + gn * S;
  const n = -x * S + gn * C;
  return [ORIGIN_LON + e / (R * COS_LAT0 * DEG), ORIGIN_LAT + n / (R * DEG)];
}

/** Direction of true north in world XZ (unit vector), for sun/sky placement. */
export const TRUE_NORTH: [number, number] = [-S, -C];

/** Modelled region in world metres (grid-aligned rectangle): the playable area (bounds.ts PLAYABLE)
 *  plus a 200 m full-detail buffer so the city continues past the edge (pipeline v2). */
export const REGION = {
  minX: -1492, // past 10th Ave (playable edge: mid-block 9th-10th)
  maxX: 413, // past Park Ave (playable edge: mid-block Madison-Park)
  minZ: -1874, // ~46th St: Times Square stays visible and lit (playable edge: mid-block 43rd-44th)
  maxZ: 292, // ~19th St (playable edge: mid-block 21st-22nd)
};

export const CHUNK_SIZE = 200; // metres; chunk (i,j) covers [i*S,(i+1)*S) x [j*S,(j+1)*S)

export function chunkKey(i: number, j: number) {
  return `${i}_${j}`;
}
