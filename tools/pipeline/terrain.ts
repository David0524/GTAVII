/**
 * Terrain height field (pipeline v2): 5 m grid over REGION, from the NYC footprint dataset's
 * per-building `ground_elevation` (feet, NAVD88). Inverse-distance weighting from nearby buildings,
 * then a separable Gaussian smooth so streets don't bump, re-based so the spawn is y = 0.
 *
 * Output public/data/terrain.bin:
 *   magic 'T74H' u32 | version u16 | cell u16 (cm) | nx u16 | nz u16 | minX f32 | minZ f32 | baseNavd88 f32 (m)
 *   then nx*nz int16 heights in cm, row-major (z rows, x columns)
 */
import { REGION, project } from '../../src/shared/geo.ts';

const FT = 0.3048;

export interface TerrainGrid { cell: number; nx: number; nz: number; minX: number; minZ: number; h: Float32Array; base: number }

export let rejected = 0;
export function buildTerrain(footprints: any[], spawn: [number, number], cell = 5): TerrainGrid {
  // 1) samples: building centroids with ground elevation
  const pts: [number, number, number][] = [];
  for (const f of footprints) {
    const e = parseFloat(f.properties?.ground_elevation);
    if (!Number.isFinite(e) || e <= 0 || !f.geometry) continue;
    const ring = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0]) as number[][];
    let x = 0, z = 0;
    for (const [lon, lat] of ring) { const [px, pz] = project(lon, lat); x += px; z += pz; }
    pts.push([x / ring.length, z / ring.length, e * FT]);
  }
  // 1b) robust outlier rejection: drop samples > 6 m from the median of neighbours within ~80 m
  //     (a few records carry roof or bad survey elevations, e.g. 273 ft at E 20th St)
  {
    const B = 80, grid = new Map<string, number[]>();
    pts.forEach((p, i) => { const k = `${Math.floor(p[0] / B)},${Math.floor(p[1] / B)}`; (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); });
    const keep = pts.filter((p) => {
      const bx = Math.floor(p[0] / B), bz = Math.floor(p[1] / B); const near: number[] = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of grid.get(`${bx + a},${bz + b}`) ?? []) near.push(pts[k][2]);
      near.sort((u, v) => u - v);
      return Math.abs(p[2] - near[near.length >> 1]) <= 6;
    });
    rejected = pts.length - keep.length; pts.length = 0; pts.push(...keep);
  }
  // 2) IDW on grid via binning
  const minX = REGION.minX - 50, minZ = REGION.minZ - 50;
  const nx = Math.ceil((REGION.maxX + 50 - minX) / cell) + 1, nz = Math.ceil((REGION.maxZ + 50 - minZ) / cell) + 1;
  const BIN = 40, bins = new Map<string, number[]>();
  pts.forEach((p, i) => { const k = `${Math.floor(p[0] / BIN)},${Math.floor(p[1] / BIN)}`; (bins.get(k) ?? bins.set(k, []).get(k)!).push(i); });
  const h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minX + i * cell, z = minZ + j * cell;
    let wsum = 0, hsum = 0;
    for (let r = 1; r <= 4 && wsum === 0; r++) {
      const bx = Math.floor(x / BIN), bz = Math.floor(z / BIN);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (const k of bins.get(`${bx + a},${bz + b}`) ?? []) {
        const p = pts[k]; const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2 + 25;
        const w = 1 / (d2 * d2); wsum += w; hsum += w * p[2];
      }
    }
    h[j * nx + i] = wsum ? hsum / wsum : NaN;
  }
  // fill gaps (rivers, parks far from buildings) with nearest valid along rows then columns
  for (let pass = 0; pass < 2; pass++) for (let j = 0; j < nz; j++) {
    let last = NaN;
    for (let i = 0; i < nx; i++) { const v = h[j * nx + i]; if (Number.isNaN(v)) { if (!Number.isNaN(last)) h[j * nx + i] = last; } else last = v; }
    last = NaN;
    for (let i = nx - 1; i >= 0; i--) { const v = h[j * nx + i]; if (Number.isNaN(v)) { if (!Number.isNaN(last)) h[j * nx + i] = last; } else last = v; }
  }
  for (let k = 0; k < h.length; k++) if (Number.isNaN(h[k])) h[k] = 0;
  // 3) separable Gaussian smooth, sigma ~15 m
  const sigma = 15 / cell, rad = Math.ceil(sigma * 3);
  const ker: number[] = []; let ks = 0;
  for (let t = -rad; t <= rad; t++) { const v = Math.exp(-(t * t) / (2 * sigma * sigma)); ker.push(v); ks += v; }
  const tmp = new Float32Array(h.length);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let t = -rad; t <= rad; t++) s += ker[t + rad] * h[j * nx + Math.min(nx - 1, Math.max(0, i + t))]; tmp[j * nx + i] = s / ks; }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let t = -rad; t <= rad; t++) s += ker[t + rad] * tmp[Math.min(nz - 1, Math.max(0, j + t)) * nx + i]; h[j * nx + i] = s / ks; }
  // 4) re-base at spawn
  const si = Math.round((spawn[0] - minX) / cell), sj = Math.round((spawn[1] - minZ) / cell);
  const base = h[sj * nx + si];
  for (let k = 0; k < h.length; k++) h[k] -= base;
  return { cell, nx, nz, minX, minZ, h, base };
}

export function encodeTerrain(t: TerrainGrid): Uint8Array {
  const buf = new ArrayBuffer(28 + t.nx * t.nz * 2);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x48343754, true); // 'T74H'
  dv.setUint16(4, 1, true); dv.setUint16(6, Math.round(t.cell * 100), true);
  dv.setUint16(8, t.nx, true); dv.setUint16(10, t.nz, true);
  dv.setFloat32(12, t.minX, true); dv.setFloat32(16, t.minZ, true); dv.setFloat32(20, t.base, true);
  for (let k = 0; k < t.h.length; k++) dv.setInt16(28 + k * 2, Math.max(-32767, Math.min(32767, Math.round(t.h[k] * 100))), true);
  return new Uint8Array(buf);
}
