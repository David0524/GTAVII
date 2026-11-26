/**
 * Pure-data mesh generation for one chunk (runs in a Web Worker, no three.js import).
 * Output is flat typed arrays ready to become BufferGeometry attributes.
 *
 * Phase 1: untextured. Vertex colours encode surface kind / building style so the
 * city reads clearly; Phase 3 replaces these with PBR facade materials.
 */
import earcut from 'earcut';
import { type ChunkData, type BuildingRec, GroundKind, Style, BuildingFlag } from '../shared/chunkFormat';

export const SIDEWALK_H = 0.15;
/** Ground height in chunk-local coordinates (road surface). */
export type HeightFn = (x: number, z: number) => number;
const MAX_EDGE = 10; // metres: ground tessellation so surfaces follow the (15 m-smoothed) terrain

export interface MeshArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
}
export interface ChunkMeshes {
  key: string;
  i: number;
  j: number;
  /** LOD0: everything. */
  buildings: MeshArrays;
  ground: MeshArrays;
  /** LOD1: tall-building shells only (no ground clutter, merged). */
  buildingsLod1: MeshArrays;
  stats: { buildings: number; tris: number; trisLod1: number };
  /** Axis-aligned bounds (chunk-local). */
  maxHeight: number;
}

class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; idx: number[] = [];
  get vcount() { return this.p.length / 3; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: [number, number, number]) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]);
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  finish(): MeshArrays {
    return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), index: new Uint32Array(this.idx) };
  }
}

// ---------------------------------------------------------------- palette (linear-ish sRGB)
type RGB = [number, number, number];
const STYLE_COLORS: Record<number, RGB> = {
  [Style.Generic]: [0.42, 0.38, 0.34],
  [Style.Tenement]: [0.45, 0.25, 0.19], // red-brown brick
  [Style.CastIronLoft]: [0.52, 0.5, 0.45], // painted cast iron
  [Style.MasonryLoft]: [0.56, 0.45, 0.34], // buff brick
  [Style.PrewarOffice]: [0.66, 0.61, 0.52], // limestone
  [Style.SetbackTower]: [0.62, 0.57, 0.48],
  [Style.Postwar]: [0.6, 0.6, 0.58], // white brick / curtain wall
  [Style.LowCommercial]: [0.38, 0.34, 0.3],
  [Style.Civic]: [0.5, 0.5, 0.52],
};
const GROUND_COLORS: Record<number, RGB> = {
  [GroundKind.Road]: [0.11, 0.105, 0.1],
  [GroundKind.Sidewalk]: [0.4, 0.38, 0.35],
  [GroundKind.Park]: [0.16, 0.24, 0.1],
  [GroundKind.Lot]: [0.16, 0.15, 0.14],
  [GroundKind.Plaza]: [0.45, 0.42, 0.38],
};
const ROOF: RGB = [0.2, 0.19, 0.18];
const HERO_TINT: RGB = [1.08, 1.04, 0.98];

function jitter(id: number, base: RGB): RGB {
  let h = Math.imul(id ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15;
  const v = 0.86 + ((h >>> 0) % 1000) / 1000 * 0.28;
  const w = (((h >>> 10) % 1000) / 1000 - 0.5) * 0.06;
  return [base[0] * v + w, base[1] * v, base[2] * v - w];
}

// ---------------------------------------------------------------- geometry
function ringSignedArea(r: Float32Array) {
  let a = 0; const n = r.length / 2;
  for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += r[2 * k] * r[2 * j + 1] - r[2 * j] * r[2 * k + 1]; }
  return a / 2;
}

/** Walls + flat roof for one building (or building part). */
function extrude(b: Builder, rec: BuildingRec, col: RGB, roofCol: RGB, hf: HeightFn) {
  // Heights are relative to the ground under the footprint: walls start below its lowest point
  // (no gaps on slopes), roofs sit at mean ground + height.
  const outer = rec.rings[0]; let gMin = Infinity, gSum = 0;
  for (let k = 0; k < outer.length; k += 2) { const h = hf(outer[k], outer[k + 1]); gMin = Math.min(gMin, h); gSum += h; }
  const gAvg = gSum / (outer.length / 2);
  const top = gAvg + Math.max(rec.height, rec.minHeight + 0.5);
  const bottom = rec.minHeight > 0 ? gAvg + rec.minHeight : gMin - 0.6; // sink into the ground: no light leaks at the sidewalk
  for (let r = 0; r < rec.rings.length; r++) {
    const ring = rec.rings[r];
    const n = ring.length / 2;
    // Outer rings are CCW in (x,z) math orientation, holes CW; outward normal = (dz, -dx) for CCW... in x/z with y up,
    // a CCW ring in (x,z) is clockwise when viewed from above (+Y looking down maps x->x, z->down-screen). Compute directly:
    const ccw = ringSignedArea(ring) > 0;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const x0 = ring[2 * k], z0 = ring[2 * k + 1], x1 = ring[2 * j], z1 = ring[2 * j + 1];
      const dx = x1 - x0, dz = z1 - z0; const L = Math.hypot(dx, dz); if (L < 1e-3) continue;
      // Outward normal for a CCW (x,z) ring is (dz, -dx)/L... verified by the sign test below.
      let nx = dz / L, nz = -dx / L;
      if (!ccw) { nx = -nx; nz = -nz; }
      // Wall shading: slight darkening toward the base (cheap AO stand-in until Phase 3).
      const base: RGB = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
      const v = b.vcount;
      b.vert(x0, bottom, z0, nx, 0, nz, base);
      b.vert(x1, bottom, z1, nx, 0, nz, base);
      b.vert(x1, top, z1, nx, 0, nz, col);
      b.vert(x0, top, z0, nx, 0, nz, col);
      // Winding: front face must face (nx, nz). For outward normal (dz,-dx) with ccw ring, order v,v+3,v+2,v+1 is CCW from outside.
      b.idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
    }
  }
  // Roof
  const flat: number[] = []; const holes: number[] = [];
  for (let r = 0; r < rec.rings.length; r++) {
    if (r > 0) holes.push(flat.length / 2);
    const ring = rec.rings[r]; for (let k = 0; k < ring.length; k++) flat.push(ring[k]);
  }
  const tris = earcut(flat, holes, 2);
  const v0 = b.vcount;
  for (let k = 0; k < flat.length; k += 2) b.vert(flat[k], top, flat[k + 1], 0, 1, 0, roofCol);
  for (let k = 0; k < tris.length; k += 3) {
    // Ensure upward facing: (x,z) CCW triangle seen from +Y is clockwise on screen -> reverse.
    const a = tris[k], c = tris[k + 1], d = tris[k + 2];
    const ax = flat[2 * a], az = flat[2 * a + 1], cx = flat[2 * c], cz = flat[2 * c + 1], dx2 = flat[2 * d], dz2 = flat[2 * d + 1];
    const cross = (cx - ax) * (dz2 - az) - (cz - az) * (dx2 - ax);
    if (cross > 0) b.idx.push(v0 + a, v0 + d, v0 + c); else b.idx.push(v0 + a, v0 + c, v0 + d);
  }
}

function groundPoly(b: Builder, rings: Float32Array[], yOff: number, col: RGB, skirt: boolean, half: number, hf: HeightFn) {
  const flat: number[] = []; const holes: number[] = [];
  for (let r = 0; r < rings.length; r++) { if (r > 0) holes.push(flat.length / 2); for (const v of rings[r]) flat.push(v); }
  const tris = earcut(flat, holes, 2);
  for (let k = 0; k < tris.length; k += 3) {
    let a = tris[k], c = tris[k + 1], d = tris[k + 2];
    const cross = (flat[2 * c] - flat[2 * a]) * (flat[2 * d + 1] - flat[2 * a + 1]) - (flat[2 * c + 1] - flat[2 * a + 1]) * (flat[2 * d] - flat[2 * a]);
    if (cross > 0) [c, d] = [d, c]; // upward facing
    const ax = flat[2 * a], az = flat[2 * a + 1], bx = flat[2 * c], bz = flat[2 * c + 1], cx = flat[2 * d], cz = flat[2 * d + 1];
    // Longest-edge bisection until every edge <= MAX_EDGE: thin earcut slivers split along their length
    // only, so cost scales with perimeter, not area^2. (Shared-edge T-junctions leave sub-mm cracks on
    // the smoothed terrain.)
    const emit = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number, depth: number): void => {
      const l01 = (x1 - x0) ** 2 + (z1 - z0) ** 2, l12 = (x2 - x1) ** 2 + (z2 - z1) ** 2, l20 = (x0 - x2) ** 2 + (z0 - z2) ** 2;
      const m = Math.max(l01, l12, l20);
      if (m <= MAX_EDGE * MAX_EDGE || depth > 14) {
        const v = b.vcount;
        b.vert(x0, hf(x0, z0) + yOff, z0, 0, 1, 0, col); b.vert(x1, hf(x1, z1) + yOff, z1, 0, 1, 0, col); b.vert(x2, hf(x2, z2) + yOff, z2, 0, 1, 0, col);
        b.idx.push(v, v + 1, v + 2);
        return;
      }
      if (m === l01) { const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2; emit(x0, z0, mx, mz, x2, z2, depth + 1); emit(mx, mz, x1, z1, x2, z2, depth + 1); }
      else if (m === l12) { const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; emit(x0, z0, x1, z1, mx, mz, depth + 1); emit(x0, z0, mx, mz, x2, z2, depth + 1); }
      else { const mx = (x2 + x0) / 2, mz = (z2 + z0) / 2; emit(x0, z0, x1, z1, mx, mz, depth + 1); emit(mx, mz, x1, z1, x2, z2, depth + 1); }
    };
    emit(ax, az, bx, bz, cx, cz, 0);
  }
  if (!skirt) return;
  // Curb faces: every edge of a raised polygon that is not on the chunk boundary drops to road level,
  // split into <= MAX_EDGE segments so the curb follows the slope.
  const curb: RGB = [0.5, 0.48, 0.45];
  const onEdge = (x: number, z: number) => Math.abs(Math.abs(x) - half) < 0.02 || Math.abs(Math.abs(z) - half) < 0.02;
  for (const ring of rings) {
    const n = ring.length / 2; const ccw = ringSignedArea(ring) > 0;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const x0 = ring[2 * k], z0 = ring[2 * k + 1], x1 = ring[2 * j], z1 = ring[2 * j + 1];
      if (onEdge(x0, z0) && onEdge(x1, z1) && (Math.abs(x0 - x1) < 0.02 || Math.abs(z0 - z1) < 0.02)) continue;
      const dx = x1 - x0, dz = z1 - z0; const L = Math.hypot(dx, dz); if (L < 1e-3) continue;
      let nx = dz / L, nz = -dx / L; if (!ccw) { nx = -nx; nz = -nz; }
      const segs = Math.max(1, Math.ceil(L / MAX_EDGE));
      for (let s = 0; s < segs; s++) {
        const xa = x0 + (dx * s) / segs, za = z0 + (dz * s) / segs, xb = x0 + (dx * (s + 1)) / segs, zb = z0 + (dz * (s + 1)) / segs;
        const ha = hf(xa, za), hb = hf(xb, zb);
        const v = b.vcount;
        b.vert(xa, ha - 0.05, za, nx, 0, nz, curb); b.vert(xb, hb - 0.05, zb, nx, 0, nz, curb);
        b.vert(xb, hb + yOff, zb, nx, 0, nz, curb); b.vert(xa, ha + yOff, za, nx, 0, nz, curb);
        b.idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
      }
    }
  }
}

export function buildChunk(data: ChunkData, chunkSize: number, hf: HeightFn = () => 0): ChunkMeshes {
  const bAll = new Builder();
  const bLod = new Builder();
  const g = new Builder();
  let maxHeight = 0;
  for (const rec of data.buildings) {
    let col = jitter(rec.id, STYLE_COLORS[rec.style] ?? STYLE_COLORS[0]);
    if (rec.flags & BuildingFlag.Hero) col = [col[0] * HERO_TINT[0], col[1] * HERO_TINT[1], col[2] * HERO_TINT[2]];
    extrude(bAll, rec, col, ROOF, hf);
    if (rec.height >= 12) extrude(bLod, rec, col, ROOF, hf);
    maxHeight = Math.max(maxHeight, rec.height);
  }
  const half = chunkSize / 2;
  for (const gr of data.ground) {
    const col = GROUND_COLORS[gr.kind] ?? GROUND_COLORS[GroundKind.Sidewalk];
    if (gr.kind === GroundKind.Road) groundPoly(g, gr.rings, 0, col, false, half, hf);
    else if (gr.kind === GroundKind.Lot) groundPoly(g, gr.rings, SIDEWALK_H + 0.01, col, false, half, hf);
    else groundPoly(g, gr.rings, SIDEWALK_H, col, true, half, hf);
  }
  const buildings = bAll.finish(), ground = g.finish(), buildingsLod1 = bLod.finish();
  return {
    key: `${data.i}_${data.j}`, i: data.i, j: data.j, buildings, ground, buildingsLod1, maxHeight,
    stats: { buildings: data.buildings.length, tris: (buildings.index.length + ground.index.length) / 3, trisLod1: buildingsLod1.index.length / 3 },
  };
}
