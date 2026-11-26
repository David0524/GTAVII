/**
 * Period props generated per chunk in the worker (one merged mesh, vertex colours, one draw call):
 *   water towers (wood stave tanks on steel legs) on mid-rise roofs, stair/elevator bulkheads,
 *   black iron fire escapes on tenement & loft street walls, window AC units (~1 in 6 windows, on the
 *   same window grid as the facade shader), striped canvas awnings over storefront bays.
 * Deterministic per building id. Props only go on walls that face open space (street side), never on
 * party walls, tested by probing a point 5 m outside each wall against the chunk's footprints.
 */
import type { BuildingRec, ChunkData } from '../shared/chunkFormat';
import type { HeightFn, MeshArrays } from './meshBuilder';
import { floorHeight, bayWidth, sillFrac } from '../shared/facade';

type RGB = [number, number, number];
class Geo {
  p: number[] = []; n: number[] = []; c: number[] = []; idx: number[] = [];
  /** Triangle count per category (profiling: which props cost the triangles). */
  cat = ''; readonly tris: Record<string, number> = {};
  quad(a: number[], b: number[], c: number[], d: number[], n: number[], col: RGB) {
    const v = this.p.length / 3;
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(n[0], n[1], n[2]); this.c.push(col[0], col[1], col[2]); }
    this.idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.tris[this.cat] = (this.tris[this.cat] ?? 0) + 2;
  }
  /** Oriented box: centre, half sizes along (along-wall u, up, out-of-wall w) with basis ux,uz / wx,wz. */
  box(cx: number, cy: number, cz: number, hu: number, hy: number, hw: number, ux: number, uz: number, col: RGB, skipBack = false) {
    const wx = -uz, wz = ux; // perpendicular (out of wall when u runs along it)
    const P = (su: number, sy: number, sw: number) => [cx + ux * hu * su + wx * hw * sw, cy + hy * sy, cz + uz * hu * su + wz * hw * sw];
    const f: [number[], number[], number[], number[], number[]][] = [
      [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), [wx, 0, wz]],
      [P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), [-wx, 0, -wz]],
      [P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), [ux, 0, uz]],
      [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), [-ux, 0, -uz]],
      [P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), [0, 1, 0]],
      [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), [0, -1, 0]],
    ];
    f.forEach(([a, b, c, d, n], i) => { if (!(skipBack && i === 1)) this.quad(a, b, c, d, n, col); }); // face 1 = -w (against the wall)
  }
  cylinder(cx: number, y0: number, cz: number, r: number, h: number, col: RGB, seg = 10, coneH = 0) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const nm = [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)];
      this.quad([cx + x1, y0, cz + z1], [cx + x0, y0, cz + z0], [cx + x0, y0 + h, cz + z0], [cx + x1, y0 + h, cz + z1], nm, col);
      if (coneH > 0) { // conical cap (as a degenerate quad)
        const v = this.p.length / 3, top = [cx, y0 + h + coneH, cz];
        const dark: RGB = [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7];
        for (const q of [[cx + x0 * 1.08, y0 + h, cz + z0 * 1.08], [cx + x1 * 1.08, y0 + h, cz + z1 * 1.08], top]) { this.p.push(q[0], q[1], q[2]); this.n.push(nm[0] * 0.6, 0.8, nm[2] * 0.6); this.c.push(...dark); }
        this.idx.push(v, v + 2, v + 1);
      }
    }
  }
  finish(): MeshArrays { return { position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), index: new Uint32Array(this.idx) }; }
}

const rand = (id: number, k: number) => { let h = Math.imul(id ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
function inRing(x: number, z: number, r: Float32Array) {
  let inside = false;
  for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) {
    const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const IRON: RGB = [0.035, 0.033, 0.03];
const STEEL: RGB = [0.08, 0.075, 0.07];
const AWNINGS: RGB[] = [[0.12, 0.22, 0.12], [0.32, 0.07, 0.06], [0.08, 0.1, 0.22], [0.36, 0.26, 0.1], [0.2, 0.06, 0.12]];

/**
 * Props split by size: `props` (bulkheads, water towers, awnings: skyline-scale, drawn to propsRadius) and
 * `detail` (window AC units, fire escapes, balconies: ~85% of the triangles but sub-pixel beyond a few
 * dozen metres) in four chunk quadrants (x<0/x>=0 by z<0/z>=0, chunk-local) so they cull on a short
 * radius at 100 m granularity (first iPhone report: 380k triangles on Low, ~56% of them AC units).
 */
export function buildProps(data: ChunkData, hf: HeightFn): { props: MeshArrays; detail: MeshArrays[] } {
  const g = new Geo();
  const dq = [new Geo(), new Geo(), new Geo(), new Geo()];
  const D = (x: number, z: number, cat: string) => { const q = dq[(x >= 0 ? 1 : 0) + (z >= 0 ? 2 : 0)]; q.cat = cat; return q; };
  const rings = data.buildings.map((b) => b.rings[0]);
  const openAt = (x: number, z: number) => !rings.some((r) => inRing(x, z, r));
  for (const b of data.buildings) {
    if (b.minHeight > 0 || b.flags & 1) continue; // parts above podiums and hand-dressed heroes skip
    const outer = b.rings[0]; const n = outer.length / 2;
    let gs = 0; for (let k = 0; k < n; k++) gs += hf(outer[2 * k], outer[2 * k + 1]);
    const gAvg = gs / n, top = gAvg + b.height;
    const floorH = floorHeight(b.height, b.minHeight, b.floors);
    // u along the outer ring at each vertex (the facade shader's uv.x; edges shorter than 1 mm add nothing there either)
    const along: number[] = [0]; for (let k = 0; k < n; k++) { const j = (k + 1) % n; const L = Math.hypot(outer[2 * j] - outer[2 * k], outer[2 * j + 1] - outer[2 * k + 1]); along.push(along[k] + (L < 1e-3 ? 0 : L)); }
    let cx = 0, cz = 0; for (let k = 0; k < n; k++) { cx += outer[2 * k]; cz += outer[2 * k + 1]; } cx /= n; cz /= n;
    const area = Math.abs(outer.reduce((a, _v, i) => (i % 2 ? a : a + outer[i] * outer[(i + 3) % outer.length] - outer[(i + 2) % outer.length] * outer[i + 1]), 0)) / 2;

    // ---- roof: bulkhead and water tower (6+ floors, under ~120 m, period residential/loft/office stock)
    g.cat = 'bulkhead';
    if (b.floors >= 4 && area > 60 && rand(b.id, 1) < 0.6) g.box(cx + (rand(b.id, 2) - 0.5) * 4, top + 1.4, cz + (rand(b.id, 3) - 0.5) * 4, 1.6, 1.4, 1.6, 1, 0, [0.16, 0.12, 0.1]);
    if (b.floors >= 6 && b.height < 120 && area > 150 && rand(b.id, 4) < 0.55) {
      const tx = cx + (rand(b.id, 5) - 0.5) * 6, tz = cz + (rand(b.id, 6) - 0.5) * 6;
      g.cat = 'water tower';
      if (inRing(tx, tz, outer)) {
        const r = 2.2 + rand(b.id, 7) * 1.1, legH = 3.2 + rand(b.id, 8) * 2.5, tankH = 4 + rand(b.id, 9) * 1.5;
        const wood: RGB = rand(b.id, 10) < 0.7 ? [0.2, 0.14, 0.09] : [0.24, 0.22, 0.2]; // weathered cedar / grey
        for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) g.box(tx + lx * r * 0.62, top + legH / 2, tz + lz * r * 0.62, 0.1, legH / 2, 0.1, 1, 0, STEEL);
        g.box(tx, top + legH, tz, r * 0.8, 0.08, r * 0.8, 1, 0, STEEL); // platform
        g.cylinder(tx, top + legH + 0.08, tz, r, tankH, wood, 12, 1.2);
      }
    }

    // ---- street walls: fire escapes, AC units, awnings
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const x0 = outer[2 * k], z0 = outer[2 * k + 1], x1 = outer[2 * j], z1 = outer[2 * j + 1];
      const L = Math.hypot(x1 - x0, z1 - z0); if (L < 5) continue;
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      // outward normal = the side whose probe point is open space
      let wx = -uz, wz = ux;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      if (inRing(mx + wx * 0.5, mz + wz * 0.5, outer)) { wx = -wx; wz = -wz; }
      if (!openAt(mx + wx * 5, mz + wz * 5)) continue; // party wall
      const uxs = -wz, uzs = wx; // u axis such that box() 'w' = outward
      const style = b.style;
      g.cat = 'fire escape';
      // fire escape: tenements and lofts, middle of the wall, floors 2..top-1
      if ((style === 1 || style === 2 || style === 3) && b.floors >= 4 && L > 8 && rand(b.id, 20 + k) < 0.75) {
        const ex = mx + wx * 0.65, ez = mz + wz * 0.65, half = Math.min(3.2, L * 0.25);
        for (let f = 1; f < Math.min(b.floors, 12); f++) {
          const y = gAvg + f * floorH + 0.05;
          D(ex, ez, 'fire escape').box(ex, y, ez, half, 0.04, 0.6, uxs, uzs, IRON); // platform
          D(ex, ez, 'fire escape').box(ex + wx * 0.55, y + 0.5, ez + wz * 0.55, half, 0.025, 0.025, uxs, uzs, IRON); // rail
          // ladder/stair diagonal to the next floor
          if (f < Math.min(b.floors, 12) - 1) D(ex, ez, 'fire escape').box(ex + uxs * half * 0.4, y + floorH / 2, ez + uzs * half * 0.4, 0.35, floorH / 2, 0.03, uxs, uzs, IRON);
        }
      }
      g.cat = 'balcony';
      // Hotel Chelsea: cast-iron balconies across the street facade on every upper floor
      if (style === 11) {
        for (let f = 1; f < b.floors; f++) {
          const y = gAvg + f * floorH + 0.05;
          D(mx, mz, 'balcony').box(mx + wx * 0.55, y, mz + wz * 0.55, L / 2 - 0.4, 0.05, 0.55, uxs, uzs, IRON);
          D(mx, mz, 'balcony').box(mx + wx * 1.05, y + 0.5, mz + wz * 1.05, L / 2 - 0.4, 0.45, 0.02, uxs, uzs, [0.05, 0.045, 0.04]); // railing panel
        }
      }
      g.cat = 'ac unit';
      // AC units seated in real window cells: the shader's grid (u along the whole ring, bays of bayWidth,
      // floors of floorH from the building's mean ground), resting on the sill, in grey-beige enamel
      const bay = bayWidth(style), sill = sillFrac(style);
      if (style !== 5 && b.year < 1974) {
        const i0 = Math.ceil(along[k] / bay - 0.5), i1 = Math.floor((along[k] + L) / bay - 0.5);
        for (let f = 1; f < Math.min(b.floors, 14); f++) for (let i = i0; i <= i1; i++) {
          if (rand(b.id * 31 + k, f * 97 + i) > 0.16) continue;
          const s = (i + 0.5) * bay - along[k]; if (s < 0.6 || s > L - 0.6) continue; // whole unit on this wall
          const sx = x0 + ux * s + wx * 0.24, sz = z0 + uz * s + wz * 0.24;
          D(sx, sz, 'ac unit').box(sx, gAvg + (f + sill) * floorH + 0.2, sz, 0.3, 0.2, 0.26, uxs, uzs, [0.22, 0.21, 0.19], true);
        }
      }
      g.cat = 'awning';
      // awning over storefront bays (commercial ground floors)
      if (style !== 1 && style !== 5 && rand(b.id, 40 + k) < 0.6) {
        const col = AWNINGS[Math.floor(rand(b.id, 50 + k) * AWNINGS.length)];
        const len = Math.min(L - 1, 4 + rand(b.id, 60 + k) * 6), s = L / 2 + (rand(b.id, 70 + k) - 0.5) * (L - len) * 0.8;
        const ax = x0 + ux * s + wx * 0.7, az = z0 + uz * s + wz * 0.7;
        g.box(ax, gAvg + 2.95, az, len / 2, 0.05, 0.7, uxs, uzs, col);
        g.box(ax + wx * 0.68, gAvg + 2.75, az + wz * 0.68, len / 2, 0.2, 0.02, uxs, uzs, col); // valance
      }
    }
  }
  buildDoors(data, hf, g);
  for (const geo of [g, ...dq]) for (const [k, v] of Object.entries(geo.tris)) propTris[k] = (propTris[k] ?? 0) + v;
  return { props: g.finish(), detail: dq.map((q) => q.finish()) };
}
/**
 * Door geometry from the chunk's door records (one per building, interiors' DoorRec fields): a stone or iron
 * surround (jambs + lintel), the leaf proud of the wall (wood, glazed bronze, steel), a transom, a roll-down
 * gate housing over shops, a revolving drum, and stoop / church steps with stone cheek walls where `rise` > 0.
 * Part of the main props mesh, so stoops get colliders. Door base = sidewalk level (terrain + curb).
 */
const WOOD: RGB = [0.11, 0.065, 0.04], GLASS: RGB = [0.045, 0.05, 0.055], BRONZE: RGB = [0.2, 0.15, 0.08], STONE: RGB = [0.26, 0.2, 0.16];
const BROWNSTONE: RGB = [0.22, 0.13, 0.1], STEEL_GREEN: RGB = [0.13, 0.15, 0.12], GATE: RGB = [0.1, 0.1, 0.1];
function buildDoors(data: ChunkData, hf: HeightFn, g: Geo) {
  g.cat = 'door';
  for (const d of data.doors) {
    if (d.style === 'internal') continue;
    const nx = -Math.sin(d.yaw), nz = -Math.cos(d.yaw); // outward
    const ux = nz, uz = -nx; // along the wall, so that box()'s w axis = outward
    const y0 = hf(d.x, d.z) + 0.15, base = y0 + d.rise, hw = d.width / 2, H = d.height;
    const at = (s: number, out: number) => [d.x + ux * s + nx * out, d.z + uz * s + nz * out] as const;
    const stoneish = d.style === 'stoop' || d.style === 'church' || d.style === 'vestibule' || d.style === 'brass_double';
    const sur: RGB = stoneish ? STONE : IRON;
    // surround: jambs + lintel
    for (const side of [-1, 1]) { const [px, pz] = at(side * (hw + 0.1), 0.06); g.box(px, base + H / 2 + 0.06, pz, 0.1, H / 2 + 0.06, 0.07, ux, uz, sur, true); }
    { const [px, pz] = at(0, 0.07); g.box(px, base + H + 0.14, pz, hw + 0.22, 0.12, 0.08, ux, uz, sur, true); }
    // transom light over shop / vestibule / church doors
    if (d.style !== 'freight' && d.style !== 'revolving') { const [px, pz] = at(0, 0.02); g.box(px, base + H + 0.36, pz, hw, 0.18, 0.02, ux, uz, GLASS, true); }
    // leaf
    const leaf: RGB = d.style === 'freight' ? STEEL_GREEN : d.style === 'shop' || d.style === 'shop_recessed' || d.style === 'brass_double' ? GLASS : WOOD;
    const recess = d.style === 'shop_recessed' || d.style === 'vestibule' ? -0.0 : 0.02;
    { const [px, pz] = at(0, recess + 0.02); g.box(px, base + H / 2, pz, hw, H / 2, 0.02, ux, uz, leaf, true); }
    if (leaf === GLASS) { // bronze stiles and kick plate on glazed doors
      for (const side of [-1, 0, 1]) { if (side === 0 && d.width < 1.5) continue; const [px, pz] = at(side * (hw - 0.05), 0.05); g.box(px, base + H / 2, pz, 0.05, H / 2, 0.02, ux, uz, BRONZE, true); }
      const [px, pz] = at(0, 0.05); g.box(px, base + 0.15, pz, hw, 0.15, 0.02, ux, uz, BRONZE, true);
    }
    if (d.nightGate) { const [px, pz] = at(0, 0.2); g.box(px, base + H + 0.62, pz, hw + 0.25, 0.16, 0.2, ux, uz, GATE, true); } // roll-down gate housing
    if (d.style === 'revolving') { const [px, pz] = at(0, 0.55); g.cylinder(px, base, pz, 1.1, H, GLASS, 10); g.box(px, base + H + 0.08, pz, 1.15, 0.08, 1.15, ux, uz, BRONZE); }
    // steps: stoop (brownstone, 4 risers + landing, cheek walls) or church steps (2 risers, wide)
    if (d.rise > 0.01) {
      const risers = d.style === 'stoop' ? 4 : 2, r = d.rise / risers, tread = 0.3, landing = d.style === 'stoop' ? 1.2 : 0.6;
      const halfW = d.style === 'stoop' ? hw + 0.35 : hw + 1.0, col = d.style === 'stoop' ? BROWNSTONE : STONE;
      for (let k = 0; k < risers; k++) {
        const depth = landing + (risers - 1 - k) * tread, top = y0 + (k + 1) * r;
        const [px, pz] = at(0, depth / 2); g.box(px, (y0 - 0.3 + top) / 2, pz, halfW, (top - y0 + 0.3) / 2, depth / 2, ux, uz, col, true);
      }
      if (d.style === 'stoop') {
        const depth = landing + (risers - 1) * tread;
        for (const side of [-1, 1]) { const [px, pz] = at(side * (halfW + 0.12), depth / 2); g.box(px, y0 + d.rise / 2 + 0.25, pz, 0.12, d.rise / 2 + 0.4, depth / 2, ux, uz, col, true); }
      }
    }
  }
}

/** Running triangle totals per prop category (profiling tools read this). */
export const propTris: Record<string, number> = {};
export type { BuildingRec };
