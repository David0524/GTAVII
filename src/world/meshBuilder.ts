/**
 * Pure-data mesh generation for one chunk (runs in a Web Worker, no three.js import).
 * Output is flat typed arrays ready to become BufferGeometry attributes.
 *
 * Phase 1: untextured. Vertex colours encode surface kind / building style so the
 * city reads clearly; Phase 3 replaces these with PBR facade materials.
 */
import earcut from 'earcut';
import { type ChunkData, type BuildingRec, GroundKind, Style, BuildingFlag } from '../shared/chunkFormat';
import { buildingCondition } from '../shared/condition';
import { buildProps } from './props';
import { floorHeight } from '../shared/facade';
import type { OpeningsFn, Span } from './openings';

export const SIDEWALK_H = 0.15;
/** Ground height in chunk-local coordinates (road surface). */
export type HeightFn = (x: number, z: number) => number;
const MAX_EDGE = 10; // metres: ground tessellation so surfaces follow the (15 m-smoothed) terrain

export interface MeshArrays {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  index: Uint32Array;
  /** Facade coordinates in metres: u = distance along the wall, v = height above the building's ground. Roofs: local x,z. */
  uv?: Float32Array;
  /** Per-building facade record: style, condition (0..4), floor height (m), seed (0..1). */
  facade?: Float32Array;
  /** Wall occlusion: x = distance to the facing wall (m, 127 = open), y = its height (m). */
  wallAO?: Float32Array;
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
  /** LOD0 props: water towers, fire escapes, AC units, awnings (vertex colours). */
  props: MeshArrays;
  /** Small props (AC units, fire escapes, balconies) in 4 chunk quadrants: [x-z-, x+z-, x-z+, x+z+]. */
  detail: MeshArrays[];
  /** Night light meshes: storefront spill pools (additive) and marquee bulb bands (emissive), may be empty. */
  spill: MeshArrays; marquee: MeshArrays;
  /** Storefront plugs: a quad in every facade opening, just inside the shell (shown while that unit's interior
   *  isn't streamed). uv = metres within the opening; facade.x = kind (0 door, 1 alcove, 2 window, 3 transom),
   *  facade.y = unit hash 0..1. `plugUnits` maps each unit to its vertex range so it can be hidden when live. */
  plugs: MeshArrays; plugUnits: { id: string; v0: number; n: number }[];
  stats: { buildings: number; tris: number; trisLod1: number };
  /** Axis-aligned bounds (chunk-local). */
  maxHeight: number;
}

class Builder {
  p: number[] = []; n: number[] = []; c: number[] = []; idx: number[] = [];
  uv: number[] = []; fac: number[] = []; ao: number[] = [];
  curAO: [number, number] = [127, 0];
  /** When set, every vert() also records facade uv + attributes (building meshes). */
  facadeMode = false;
  curUV: [number, number] = [0, 0];
  curFac: [number, number, number, number] = [0, 0, 3.4, 0];
  get vcount() { return this.p.length / 3; }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, col: [number, number, number]) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]);
    if (this.facadeMode) { this.uv.push(this.curUV[0], this.curUV[1]); this.fac.push(...this.curFac); this.ao.push(this.curAO[0], this.curAO[1]); }
  }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); }
  finish(): MeshArrays {
    const m: MeshArrays = { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), index: new Uint32Array(this.idx) };
    if (this.facadeMode) { m.uv = new Float32Array(this.uv); m.facade = new Float32Array(this.fac); m.wallAO = new Float32Array(this.ao); }
    return m;
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
  [Style.HeroDeco]: [0.66, 0.62, 0.54],
  [Style.HeroBeaux]: [0.7, 0.6, 0.47],
  [Style.HeroChelsea]: [0.42, 0.19, 0.14],
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
const PLUG_INSET = 0.06; // m behind the facade line (no visible gap, no z-fight)
const KIND_CODE: Record<Span['kind'], number> = { door: 0, alcove: 1, window: 2, transom: 3 };
const unitHash = (id: string) => { let h = 2166136261; for (let k = 0; k < id.length; k++) h = Math.imul(h ^ id.charCodeAt(k), 16777619); return ((h >>> 0) % 10007) / 10007; };
interface Cut { fn: OpeningsFn; ox: number; oz: number; plugs: Builder; units: Map<string, number[]> }

/** Wall quad with y in [ya, yb] over s in [sa, sb] along the edge. */
function wallPiece(b: Builder, x0: number, z0: number, ex: number, ez: number, sa: number, sb: number, ya: number, yb: number, gAvg: number, along: number, nx: number, nz: number, col: RGB) {
  if (sb - sa < 1e-3 || yb - ya < 1e-3) return;
  const v = b.vcount;
  b.curUV = [along + sa, ya - gAvg]; b.vert(x0 + ex * sa, ya, z0 + ez * sa, nx, 0, nz, col);
  b.curUV = [along + sb, ya - gAvg]; b.vert(x0 + ex * sb, ya, z0 + ez * sb, nx, 0, nz, col);
  b.curUV = [along + sb, yb - gAvg]; b.vert(x0 + ex * sb, yb, z0 + ez * sb, nx, 0, nz, col);
  b.curUV = [along + sa, yb - gAvg]; b.vert(x0 + ex * sa, yb, z0 + ez * sa, nx, 0, nz, col);
  b.idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
}

function extrude(b: Builder, rec: BuildingRec, col: RGB, roofCol: RGB, hf: HeightFn, cond = 2, cut?: Cut) {
  // Heights are relative to the ground under the footprint: walls start below its lowest point
  // (no gaps on slopes), roofs sit at mean ground + height.
  const outer = rec.rings[0]; let gMin = Infinity, gSum = 0;
  for (let k = 0; k < outer.length; k += 2) { const h = hf(outer[k], outer[k + 1]); gMin = Math.min(gMin, h); gSum += h; }
  const gAvg = gSum / (outer.length / 2);
  const top = gAvg + Math.max(rec.height, rec.minHeight + 0.5);
  const bottom = rec.minHeight > 0 ? gAvg + rec.minHeight : gMin - 0.6; // sink into the ground: no light leaks at the sidewalk
  // Facade record: real floor-to-floor height from the data (clamped to period-plausible values).
  const floorH = floorHeight(rec.height, rec.minHeight, rec.floors);
  const seed = ((Math.imul(rec.id, 2654435761) >>> 0) % 100000) / 100000;
  b.curFac = [rec.style, cond, floorH, seed];
  for (let r = 0; r < rec.rings.length; r++) {
    const ring = rec.rings[r];
    const n = ring.length / 2;
    const ccw = ringSignedArea(ring) > 0;
    let along = 0; // facade u in metres, continuous around the ring
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const x0 = ring[2 * k], z0 = ring[2 * k + 1], x1 = ring[2 * j], z1 = ring[2 * j + 1];
      const dx = x1 - x0, dz = z1 - z0; const L = Math.hypot(dx, dz); if (L < 1e-3) continue;
      let nx = dz / L, nz = -dx / L;
      if (!ccw) { nx = -nx; nz = -nz; }
      const ao = rec.ao?.[r]; b.curAO = ao ? [ao[2 * k] / 2, ao[2 * k + 1] * 2] : [127, 0];
      const spans = cut && r === 0 ? cut.fn(rec.id, x0 + cut.ox, z0 + cut.oz, x1 + cut.ox, z1 + cut.oz) : [];
      if (spans.length && cut) {
        // split the wall around the openings (render and collider share this mesh: doors become walkable)
        const ex = dx / L, ez = dz / L;
        const cuts = [...new Set([0, L, ...spans.flatMap((q) => [q.s0, q.s1])])].sort((p, q) => p - q);
        for (let c = 1; c < cuts.length; c++) {
          const sa = cuts[c - 1], sb = cuts[c], mid = (sa + sb) / 2;
          const holes = spans.filter((q) => q.s0 <= mid && q.s1 >= mid).map((q) => [Math.max(bottom, q.y0), Math.min(top, q.y1)] as [number, number]).sort((p, q) => p[0] - q[0]);
          let y = bottom;
          for (const [h0, h1] of holes) { if (h0 > y) wallPiece(b, x0, z0, ex, ez, sa, sb, y, h0, gAvg, along, nx, nz, col); y = Math.max(y, h1); }
          wallPiece(b, x0, z0, ex, ez, sa, sb, y, top, gAvg, along, nx, nz, col);
        }
        // plugs: one quad per opening, just inside the shell, facing the street
        const P = cut.plugs, prevFac = P.curFac;
        for (const q of spans) {
          const v = P.vcount, h = unitHash(q.unit);
          P.curFac = [KIND_CODE[q.kind], h, q.s1 - q.s0, q.y1 - q.y0];
          const px = -nx * PLUG_INSET, pz = -nz * PLUG_INSET, w = q.s1 - q.s0, hh = q.y1 - q.y0;
          P.curUV = [0, 0]; P.vert(x0 + ex * q.s0 + px, q.y0, z0 + ez * q.s0 + pz, nx, 0, nz, col);
          P.curUV = [w, 0]; P.vert(x0 + ex * q.s1 + px, q.y0, z0 + ez * q.s1 + pz, nx, 0, nz, col);
          P.curUV = [w, hh]; P.vert(x0 + ex * q.s1 + px, q.y1, z0 + ez * q.s1 + pz, nx, 0, nz, col);
          P.curUV = [0, hh]; P.vert(x0 + ex * q.s0 + px, q.y1, z0 + ez * q.s0 + pz, nx, 0, nz, col);
          P.idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
          (cut.units.get(q.unit) ?? cut.units.set(q.unit, []).get(q.unit)!).push(v);
        }
        P.curFac = prevFac;
        along += L;
        continue;
      }
      const v = b.vcount;
      const vb = bottom - gAvg, vt = top - gAvg;
      b.curUV = [along, vb]; b.vert(x0, bottom, z0, nx, 0, nz, col);
      b.curUV = [along + L, vb]; b.vert(x1, bottom, z1, nx, 0, nz, col);
      b.curUV = [along + L, vt]; b.vert(x1, top, z1, nx, 0, nz, col);
      b.curUV = [along, vt]; b.vert(x0, top, z0, nx, 0, nz, col);
      b.idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
      along += L;
    }
  }
  b.curAO = [127, 0];
  // Roof
  const flat: number[] = []; const holes: number[] = [];
  for (let r = 0; r < rec.rings.length; r++) {
    if (r > 0) holes.push(flat.length / 2);
    const ring = rec.rings[r]; for (let k = 0; k < ring.length; k++) flat.push(ring[k]);
  }
  const tris = earcut(flat, holes, 2);
  const v0 = b.vcount;
  for (let k = 0; k < flat.length; k += 2) { b.curUV = [flat[k], flat[k + 1]]; b.vert(flat[k], top, flat[k + 1], 0, 1, 0, roofCol); }
  for (let k = 0; k < tris.length; k += 3) {
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
  const prevFac = b.curFac; b.curFac = [10, 0, 0, 0];
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
  b.curFac = prevFac;
}

export function buildChunk(data: ChunkData, chunkSize: number, hf: HeightFn = () => 0, ox = 0, opts: { oz?: number; openings?: OpeningsFn } = {}): ChunkMeshes {
  const bAll = new Builder(); bAll.facadeMode = true;
  const plugB = new Builder(); plugB.facadeMode = true;
  const cut: Cut | undefined = opts.openings ? { fn: opts.openings, ox, oz: opts.oz ?? 0, plugs: plugB, units: new Map() } : undefined;
  const bLod = new Builder(); bLod.facadeMode = true;
  const g = new Builder(); g.facadeMode = true; // ground: facade.x = surface kind (GroundKind; 10 = curb face)
  let maxHeight = 0;
  for (const rec of data.buildings) {
    let col = jitter(rec.id, STYLE_COLORS[rec.style] ?? STYLE_COLORS[0]);
    if (rec.flags & BuildingFlag.Hero) col = [col[0] * HERO_TINT[0], col[1] * HERO_TINT[1], col[2] * HERO_TINT[2]];
    const cond = buildingCondition({ id: rec.id, year: rec.year, style: rec.style, use: rec.use, floors: rec.floors, flags: rec.flags, x: ox + rec.rings[0][0] });
    extrude(bAll, rec, col, ROOF, hf, cond, cut);
    if (rec.height >= 12) extrude(bLod, rec, col, ROOF, hf, cond);
    maxHeight = Math.max(maxHeight, rec.height);
  }
  const half = chunkSize / 2;
  for (const gr of data.ground) {
    const col = GROUND_COLORS[gr.kind] ?? GROUND_COLORS[GroundKind.Sidewalk];
    g.curFac = [gr.kind, 0, 0, 0];
    if (gr.kind === GroundKind.Road) groundPoly(g, gr.rings, 0, col, false, half, hf);
    else if (gr.kind === GroundKind.Lot) groundPoly(g, gr.rings, SIDEWALK_H + 0.04, col, false, half, hf); // 4 cm: different tessellation from the sidewalk below must not z-fight on slopes
    else groundPoly(g, gr.rings, SIDEWALK_H, col, true, half, hf);
  }
  // road paint: thin quads on the road surface (terrain-following), kind 20 white / 21 yellow
  for (const st of data.paint) {
    g.curFac = [st.kind === 2 ? 21 : 20, 0, 0, 0];
    for (let q = 2; q < st.pts.length; q += 2) {
      const x0 = st.pts[q - 2], z0 = st.pts[q - 1], x1 = st.pts[q], z1 = st.pts[q + 1];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
      const nx = -(z1 - z0) / L * st.width / 2, nz = (x1 - x0) / L * st.width / 2;
      const segs = Math.max(1, Math.ceil(L / 6));
      for (let k = 0; k < segs; k++) {
        const ta = k / segs, tb = (k + 1) / segs;
        const ax = x0 + (x1 - x0) * ta, az = z0 + (z1 - z0) * ta, bx = x0 + (x1 - x0) * tb, bz = z0 + (z1 - z0) * tb;
        const v = g.vcount, white: RGB = [1, 1, 1];
        g.vert(ax - nx, hf(ax, az) + 0.015, az - nz, 0, 1, 0, white); g.vert(ax + nx, hf(ax, az) + 0.015, az + nz, 0, 1, 0, white);
        g.vert(bx + nx, hf(bx, bz) + 0.015, bz + nz, 0, 1, 0, white); g.vert(bx - nx, hf(bx, bz) + 0.015, bz - nz, 0, 1, 0, white);
        const cross = (nx) * (bz - az) - (nz) * (bx - ax); // keep the quad facing up
        if (cross > 0) g.idx.push(v, v + 2, v + 1, v, v + 3, v + 2); else g.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      }
    }
  }
  const buildings = bAll.finish(), ground = g.finish(), buildingsLod1 = bLod.finish();
  const { props, detail, spill, marquee } = buildProps(data, hf, !!opts.openings);
  // plug ranges per unit: quads are pushed per opening, so a unit's quads may not be contiguous; record each quad
  const plugUnits: ChunkMeshes['plugUnits'] = [];
  for (const [id, vs] of cut?.units ?? []) for (const v0 of vs) plugUnits.push({ id, v0, n: 4 });
  const plugs = plugB.finish();
  return {
    key: `${data.i}_${data.j}`, i: data.i, j: data.j, buildings, ground, buildingsLod1, props, detail, spill, marquee, plugs, plugUnits, maxHeight,
    stats: { buildings: data.buildings.length, tris: (buildings.index.length + ground.index.length) / 3, trisLod1: buildingsLod1.index.length / 3 },
  };
}
