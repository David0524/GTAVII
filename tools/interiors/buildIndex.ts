/**
 * Interiors index builder: decides which buildings are enterable, where their doors are, and what
 * is behind each door, from the city's real data (chunk footprints with PLUTO use/year/floors and
 * the OSM street centrelines). Deterministic per building id.
 *
 *   npx tsx tools/interiors/buildIndex.ts      -> public/data/interiors/index.json
 *                                                 docs/interiors/coverage.json
 *
 * Frontage: a footprint edge is street frontage when a probe 1.2 m outside its midpoint lands on
 * sidewalk/plaza/road ground and in no other building, within reach of a named street centreline.
 * Units are oriented rectangles fitted inside the real footprint (sampled containment test), never
 * overlapping each other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readChunk, GroundKind, Style, BuildingFlag } from '../../src/shared/chunkFormat';
import { PLAYABLE } from '../../src/shared/bounds';
import { decodeTerrain } from '../../src/shared/terrain';
import { districtAt, type District } from '../../src/interiors/grid';
import { KINDS, shopWeights, type InteriorKind, type ShopKind, type CoreKind } from '../../src/interiors/catalog';
import { execSync } from 'node:child_process';
import { buildingCondition } from '../../src/shared/condition';
import { normaliseStreet } from '../../src/interiors/grid';
import { HERO_PLACEMENT } from '../../src/interiors/gen/heroes';
import { encodeIndex, isCoreKind, type BuildingIdx, type IndexFile, type UnitRec } from '../../src/interiors/indexFormat';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'public/data');
const S = 200;

// ---------------------------------------------------------------- terrain (same bilinear as src/shared/terrain.ts)
const tbuf = fs.readFileSync(path.join(DATA, 'terrain.bin'));
const T = decodeTerrain(tbuf.buffer.slice(tbuf.byteOffset, tbuf.byteOffset + tbuf.byteLength));
function heightAt(x: number, z: number) {
  const g = T;
  const fx = Math.min(Math.max((x - g.minX) / g.cell, 0), g.nx - 1.001), fz = Math.min(Math.max((z - g.minZ) / g.cell, 0), g.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * g.nx + i, h = g.h;
  return ((h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz) / 100;
}
const SIDEWALK_H = 0.15;

// ---------------------------------------------------------------- deterministic hash
function hash(...v: number[]) {
  let h = 0x811c9dc5;
  for (const x of v) { h ^= x | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
}
function pickWeighted<T>(items: [T, number][], r: number): T {
  let tot = 0; for (const [, w] of items) tot += w;
  let a = r * tot; for (const [k, w] of items) { if ((a -= w) <= 0) return k; }
  return items[items.length - 1][0];
}

// ---------------------------------------------------------------- load
type B = { id: number; i: number; j: number; use: number; style: number; year: number; floors: number; flags: number; height: number; minHeight: number; ring: Float64Array; holes: Float64Array[]; minX: number; maxX: number; minZ: number; maxZ: number; area: number };
type G = { kind: number; rings: Float64Array[]; minX: number; maxX: number; minZ: number; maxZ: number };
const blds: B[] = []; const grounds: G[] = [];
for (const f of fs.readdirSync(path.join(DATA, 'chunks'))) {
  const buf = fs.readFileSync(path.join(DATA, 'chunks', f));
  const c = readChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ox = (c.i + 0.5) * S, oz = (c.j + 0.5) * S;
  const toW = (r: Float32Array) => { const a = new Float64Array(r.length); for (let k = 0; k < r.length; k += 2) { a[k] = r[k] + ox; a[k + 1] = r[k + 1] + oz; } return a; };
  const bb = (r: Float64Array) => { let a = Infinity, b = -Infinity, cc = Infinity, d = -Infinity; for (let k = 0; k < r.length; k += 2) { a = Math.min(a, r[k]); b = Math.max(b, r[k]); cc = Math.min(cc, r[k + 1]); d = Math.max(d, r[k + 1]); } return { minX: a, maxX: b, minZ: cc, maxZ: d }; };
  for (const r of c.buildings) {
    const ring = toW(r.rings[0]);
    blds.push({ id: r.id, i: c.i, j: c.j, use: r.use, style: r.style, year: r.year, floors: r.floors, flags: r.flags, height: r.height, minHeight: r.minHeight, ring, holes: r.rings.slice(1).map(toW), ...bb(ring), area: Math.abs(signedArea(ring)) });
  }
  for (const g of c.ground) { const rings = g.rings.map(toW); grounds.push({ kind: g.kind, rings, ...bb(rings[0]) }); }
}
const streets = JSON.parse(fs.readFileSync(path.join(DATA, 'streets.json'), 'utf8')) as { n: string; c: string; w: number; p: number[] }[];
// Period audit addresses (keep rows) for naming; matched by centroid-in-footprint.
const audit = fs.readFileSync(path.join(ROOT, 'docs/period_audit.csv'), 'utf8').split('\n').slice(1).map((l) => l.split(',')).filter((r) => r[9] === 'keep').map((r) => ({ address: r[1], x: +r[7], z: +r[8] }));

function signedArea(r: Float64Array) { let a = 0; const n = r.length / 2; for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += r[2 * k] * r[2 * j + 1] - r[2 * j] * r[2 * k + 1]; } return a / 2; }
function inRing(r: Float64Array, x: number, z: number) {
  let ins = false; const n = r.length / 2;
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const xi = r[2 * k], zi = r[2 * k + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
const inPoly = (outer: Float64Array, holes: Float64Array[], x: number, z: number) => inRing(outer, x, z) && !holes.some((h) => inRing(h, x, z));

// ---------------------------------------------------------------- spatial grid
const CELL = 25;
const grid = new Map<string, number[]>(); const ggrid = new Map<string, number[]>();
const add = (m: Map<string, number[]>, idx: number, o: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
  for (let x = Math.floor(o.minX / CELL); x <= Math.floor(o.maxX / CELL); x++) for (let z = Math.floor(o.minZ / CELL); z <= Math.floor(o.maxZ / CELL); z++) {
    const k = `${x},${z}`; let a = m.get(k); if (!a) m.set(k, (a = [])); a.push(idx);
  }
};
blds.forEach((b, k) => add(grid, k, b)); grounds.forEach((g, k) => add(ggrid, k, g));
function buildingAt(x: number, z: number, minH = -1): number {
  for (const k of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const b = blds[k]; if (b.minHeight > minH + 0.01 && minH >= 0) continue;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
    if (inPoly(b.ring, b.holes, x, z)) return k;
  }
  return -1;
}
function groundAt(x: number, z: number): number {
  // Raised kinds win over road (roads are cut out of sidewalks, but be robust to overlaps).
  let best = -1;
  for (const k of ggrid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const g = grounds[k]; if (x < g.minX || x > g.maxX || z < g.minZ || z > g.maxZ) continue;
    if (inPoly(g.rings[0], g.rings.slice(1), x, z)) { if (g.kind !== GroundKind.Road) return g.kind; best = g.kind; }
  }
  return best;
}
// streets: segment list with name index
const streetNames: string[] = []; const sidx = new Map<string, number>();
const segs: { ax: number; az: number; bx: number; bz: number; s: number; w: number; avenue: boolean }[] = [];
for (const s of streets) {
  if (!s.n || s.c.startsWith('motorway')) continue;
  let id = sidx.get(s.n); if (id === undefined) { id = streetNames.length; streetNames.push(s.n); sidx.set(s.n, id); }
  const avenue = /Avenue|Broadway|Square/.test(s.n);
  for (let k = 2; k < s.p.length; k += 2) segs.push({ ax: s.p[k - 2], az: s.p[k - 1], bx: s.p[k], bz: s.p[k + 1], s: id, w: s.w, avenue });
}
const sgrid = new Map<string, number[]>();
segs.forEach((g, k) => add(sgrid, k, { minX: Math.min(g.ax, g.bx) - 30, maxX: Math.max(g.ax, g.bx) + 30, minZ: Math.min(g.az, g.bz) - 30, maxZ: Math.max(g.az, g.bz) + 30 }));
function nearestStreet(x: number, z: number): { s: number; d: number; avenue: boolean } | null {
  let best: { s: number; d: number; avenue: boolean } | null = null;
  for (const k of sgrid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const g = segs[k]; const dx = g.bx - g.ax, dz = g.bz - g.az;
    const t = Math.max(0, Math.min(1, ((x - g.ax) * dx + (z - g.az) * dz) / (dx * dx + dz * dz || 1)));
    const d = Math.hypot(g.ax + dx * t - x, g.az + dz * t - z) - g.w / 2;
    if (!best || d < best.d) best = { s: g.s, d, avenue: g.avenue };
  }
  return best;
}

// ---------------------------------------------------------------- frontage
type Edge = { ax: number; az: number; bx: number; bz: number; L: number; ux: number; uz: number; nx: number; nz: number; street: number; avenue: boolean };
function frontage(b: B): Edge[] {
  const r = b.ring, n = r.length / 2, ccw = signedArea(r) > 0, out: Edge[] = [];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n; const ax = r[2 * k], az = r[2 * k + 1], bx = r[2 * j], bz = r[2 * j + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 2.4) continue;
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    let ox = uz, oz = -ux; if (!ccw) { ox = -ox; oz = -oz; } // outward (meshBuilder convention)
    // probes at 3 points along the edge: majority must be open ground
    let open = 0;
    for (const f of [0.2, 0.5, 0.8]) {
      const px = ax + (bx - ax) * f + ox * 1.2, pz = az + (bz - az) * f + oz * 1.2;
      if (buildingAt(px, pz) >= 0) continue;
      const g = groundAt(px, pz);
      if (g === GroundKind.Sidewalk || g === GroundKind.Plaza || g === GroundKind.Road) open++;
    }
    if (open < 2) continue;
    const mx = (ax + bx) / 2 + ox * 1.2, mz = (az + bz) / 2 + oz * 1.2;
    const st = nearestStreet(mx, mz); if (!st || st.d > 14) continue;
    out.push({ ax, az, bx, bz, L, ux, uz, nx: -ox, nz: -oz, street: st.s, avenue: st.avenue });
  }
  // merge collinear consecutive frontage edges (footprints often split a straight front into several segments)
  const merged: Edge[] = [];
  for (const e of out) {
    const p = merged[merged.length - 1];
    if (p && p.street === e.street && Math.hypot(p.bx - e.ax, p.bz - e.az) < 0.05 && p.ux * e.ux + p.uz * e.uz > 0.9986) {
      p.bx = e.bx; p.bz = e.bz; p.L = Math.hypot(p.bx - p.ax, p.bz - p.az); p.ux = (p.bx - p.ax) / p.L; p.uz = (p.bz - p.az) / p.L;
      p.nx = ccw ? -p.uz : p.uz; p.nz = ccw ? p.ux : -p.ux;
    } else merged.push({ ...e });
  }
  if (merged.length > 1) { const f = merged[0], l = merged[merged.length - 1]; if (f.street === l.street && Math.hypot(l.bx - f.ax, l.bz - f.az) < 0.05 && f.ux * l.ux + f.uz * l.uz > 0.9986) { f.ax = l.ax; f.az = l.az; f.L = Math.hypot(f.bx - f.ax, f.bz - f.az); f.ux = (f.bx - f.ax) / f.L; f.uz = (f.bz - f.az) / f.L; f.nx = ccw ? -f.uz : f.uz; f.nz = ccw ? f.ux : -f.ux; merged.pop(); } }
  return merged;
}

// ---------------------------------------------------------------- rect fitting inside the footprint
type Rect = { ox: number; oz: number; ux: number; uz: number; nx: number; nz: number; w: number; d: number };
const rectPts = (q: Rect, step = 1.0) => {
  const pts: [number, number][] = [];
  const nu = Math.max(2, Math.ceil(q.w / step)), nd = Math.max(2, Math.ceil(q.d / step));
  for (let a = 0; a <= nu; a++) for (let c = 0; c <= nd; c++) {
    const s = 0.2 + (q.w - 0.4) * (a / nu), t = 0.3 + (q.d - 0.35) * (c / nd);
    pts.push([q.ox + q.ux * s + q.nx * t, q.oz + q.uz * s + q.nz * t]);
  }
  return pts;
};
function inRect(q: Rect, x: number, z: number) {
  const dx = x - q.ox, dz = z - q.oz; const s = dx * q.ux + dz * q.uz, t = dx * q.nx + dz * q.nz;
  return s > 0 && s < q.w && t > 0 && t < q.d;
}
/** Grow depth from 0 in 0.5 m steps while the rect stays inside the footprint and clear of `taken`. */
function fitDepth(b: B, base: Omit<Rect, 'd'>, maxD: number, taken: Rect[]): number {
  let d = 0;
  for (let t = 1.5; t <= maxD + 1e-6; t += 0.5) {
    const q = { ...base, d: t };
    // only test the newly added strip
    const strip: Rect = { ox: base.ox + base.nx * (t - 0.5), oz: base.oz + base.nz * (t - 0.5), ux: base.ux, uz: base.uz, nx: base.nx, nz: base.nz, w: base.w, d: 0.5 };
    const pts = t === 1.5 ? rectPts(q, 0.7) : rectPts(strip, 0.7);
    if (pts.some(([x, z]) => !inPoly(b.ring, b.holes, x, z) || taken.some((o) => inRect(o, x, z)))) break;
    d = t;
  }
  return d;
}

// ---------------------------------------------------------------- classification
function coreKindFor(b: B, d: District, h: number): CoreKind | null {
  const u = b.use, f = b.floors;
  if (b.flags & BuildingFlag.Hero) return null; // landmarks: hand-made later (Tier A)
  if (u === 9 || u === 11 || u === 0) return null;
  if (u === 10 || u === 7) return 'garage';
  if (u === 8 || b.style === Style.Civic) return h < 0.45 ? 'church' : h < 0.7 ? 'union_hall' : null;
  if (u === 6) return f <= 2 ? 'garage' : 'loft';
  if (u <= 2) return f >= 3 ? 'tenement' : null;
  if (u === 3) return f <= 6 ? 'tenement' : 'apartment_lobby';
  if (u === 4) return f <= 7 ? (h < 0.12 && f >= 4 ? 'sro' : 'tenement') : 'apartment_lobby';
  if (u === 5) {
    if (b.style === Style.CastIronLoft || b.style === Style.MasonryLoft) return (d === 'garment' || d === 'fur' || h < 0.7) ? 'loft' : 'office_lobby';
    if (f >= 8 && b.style === Style.PrewarOffice && h < 0.2 && (d === 'tenderloin' || d === 'herald' || d === 'times_square' || d === 'midtown')) return 'hotel_lobby';
    if (f >= 6 && f <= 14 && h > 0.2 && h < 0.3 && b.year < 1932) return 'sro';
    if (f >= 6) return 'office_lobby';
    return null; // taxpayers: shops only
  }
  return null;
}
function shopChance(b: B, avenue: boolean): number {
  const u = b.use;
  if (u === 9 || u === 11 || u === 0 || u === 8 || u === 10 || u === 7) return 0;
  if (b.flags & BuildingFlag.Hero) return 0;
  if (u <= 3) return avenue ? 0.9 : 0.3; // avenue tenements almost always had storefronts
  if (u === 4) return 1;
  if (u === 5) return 1;
  if (u === 6) return 0.8;
  return 0;
}

// ---------------------------------------------------------------- main pass
const out: BuildingIdx[] = [];
const cov = { buildingsPlayable: 0, groundBuildings: 0, enterableBuildings: 0, roofBuildings: 0, commercialFrontageM: 0, enterableCommercialFrontageM: 0, allFrontageM: 0, enterableFrontageM: 0, units: 0, shopUnits: 0, cores: 0 } as Record<string, number>;
const kindCount: Record<string, number> = {};
const lost: Record<string, number> = {};
for (const b of blds) {
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const inPlay = cx >= PLAYABLE.minX && cx <= PLAYABLE.maxX && cz >= PLAYABLE.minZ && cz <= PLAYABLE.maxZ;
  const inRegion = cx >= PLAYABLE.minX - 120 && cx <= PLAYABLE.maxX + 120 && cz >= PLAYABLE.minZ - 120 && cz <= PLAYABLE.maxZ + 120;
  if (inPlay) cov.buildingsPlayable++;
  if (b.minHeight > 0.01 || !inRegion) continue; // upper building:parts carry no doors
  if (inPlay) cov.groundBuildings++;
  const edges = frontage(b);
  const district = districtAt(cx, cz);
  const commercial = [4, 5, 6, 7, 10].includes(b.use);
  const frontLen = edges.reduce((a, e) => a + e.L, 0);
  if (inPlay) { cov.allFrontageM += frontLen; if (commercial) cov.commercialFrontageM += frontLen; }
  if (!edges.length || b.area < 30) continue;

  // engine roof rule: mean ground over outer ring + height
  let gs = 0; const nv = b.ring.length / 2; for (let k = 0; k < b.ring.length; k += 2) gs += heightAt(b.ring[k], b.ring[k + 1]);
  const gAvg = gs / nv; const top = gAvg + Math.max(b.height, b.minHeight + 0.5);
  const fh = Math.max(2.8, Math.min(5.2, b.floors > 0 ? b.height / b.floors : 3.2));
  const units: UnitRec[] = []; const taken: Rect[] = []; const wantD = new Map<number, number>();
  const h0 = hash(b.id, 1);
  const core = coreKindFor(b, district, h0);
  // edges by preference: the core door goes on a side street when there is one (NYC residential entrances)
  const ordered = [...edges].sort((p, q) => (p.avenue === q.avenue ? q.L - p.L : p.avenue ? 1 : -1));
  let coreEdge: Edge | null = null, coreSpan: [number, number] | null = null;
  if (core) {
    const info = KINDS[core];
    for (const e of ordered) {
      if (e.L < info.minW + 0.6) continue;
      const big = core === 'church' || core === 'garage' || core === 'hotel_lobby' || core === 'office_lobby' || core === 'union_hall';
      const w = Math.min(e.L - 0.4, big ? Math.max(info.minW, Math.min(e.L * 0.6, core === 'garage' ? 14 : 12)) : core === 'loft' ? 3.4 : core === 'tenement' ? 3.0 : 4.2);
      // position along the edge: centred for tenements (middle stair hall), otherwise hashed
      const slack = e.L - w; const t0 = core === 'tenement' || core === 'sro' ? slack / 2 : slack * hash(b.id, 2);
      coreEdge = e; coreSpan = [t0, t0 + w]; break;
    }
  }
  const mkUnit = (e: Edge, t0: number, w: number, kind: InteriorKind, idx: number, maxD: number): UnitRec | null => {
    const base = { ox: e.ax + e.ux * t0, oz: e.az + e.uz * t0, ux: e.ux, uz: e.uz, nx: e.nx, nz: e.nz, w };
    // pass 1: shops claim a shallow strip so corner units don't swallow the other frontage; pass 2 deepens
    const d = fitDepth(b, base, isCoreKind(kind) ? maxD : Math.min(maxD, 4.5), taken);
    const small = kind === 'newsstand' || kind === 'shoe_repair' || kind === 'tailor' || kind === 'florist' || kind === 'barber' || kind === 'liquor' || kind === 'bodega';
    const minD = kind === 'tenement' || kind === 'loft' ? 6.5 : small ? 2.6 : 3.5;
    if (d < minD) return null;
    taken.push({ ...base, d });
    wantD.set(taken.length - 1, maxD);
    const seed = Math.floor(hash(b.id, idx, 77) * 2 ** 31);
    const info = kind === 'hero' ? null : KINDS[kind];
    const dw = kind === 'garage' ? Math.min(6, w - 1) : ['church', 'hotel_lobby', 'office_lobby', 'cinema_lobby', 'union_hall'].includes(kind) ? 1.6 : 0.95;
    const recessed = info && !['tenement', 'apartment_lobby', 'sro', 'loft', 'garage', 'office_lobby', 'hotel_lobby', 'church', 'union_hall'].includes(kind) && w >= 4.5 && hash(seed, 3) < 0.55;
    let t = recessed ? w / 2 : hash(seed, 4) < 0.5 ? 0.35 + dw / 2 + 0.1 : w - 0.35 - dw / 2 - 0.1;
    if (kind === 'tenement' || kind === 'loft' || kind === 'sro' || kind === 'apartment_lobby' || dw > 1) t = w / 2;
    if (info?.upstairs) t = w / 2;
    const dx = base.ox + e.ux * t, dz = base.oz + e.uz * t;
    const y = heightAt(dx - e.nx * 1.0, dz - e.nz * 1.0) + SIDEWALK_H;
    // residential street doors: most are locked to strangers in 1974 (buzzers were broken often enough: ~40% open)
    const residential = kind === 'tenement' || kind === 'apartment_lobby';
    const locked = residential ? hash(seed, 9) > 0.62 : kind === 'garage' ? hash(seed, 9) > 0.7 : false;
    return {
      id: `b${b.id}${kind === core ? '' : `u${idx}`}`, kind, ox: +base.ox.toFixed(3), oz: +base.oz.toFixed(3), ux: +e.ux.toFixed(5), uz: +e.uz.toFixed(5), nx: +e.nx.toFixed(5), nz: +e.nz.toFixed(5),
      w: +w.toFixed(2), d: +d.toFixed(2), door: { t: +t.toFixed(2), w: dw, recess: recessed ? +(0.8 + hash(seed, 5) * 0.6).toFixed(2) : 0 }, y: +y.toFixed(3),
      street: e.street, avenue: e.avenue, hours: info?.hours, locked, seed,
    };
  };
  if (core && coreEdge && coreSpan) {
    const maxD = core === 'tenement' ? 16 : core === 'loft' ? 14 : core === 'garage' || core === 'church' ? 40 : 18;
    const u = mkUnit(coreEdge, coreSpan[0], coreSpan[1] - coreSpan[0], core, 0, maxD);
    if (u) units.push(u);
  }
  // shop bays along each frontage edge (skipping the core span)
  let idx = 1; let prevKind: string | null = null;
  for (const e of [...edges].sort((p, q) => (p.avenue === q.avenue ? q.L - p.L : p.avenue ? -1 : 1))) {
    const chance = shopChance(b, e.avenue);
    if (chance <= 0) { if (commercial && inPlay && !(e === coreEdge && units.length)) lost.nochance = (lost.nochance ?? 0) + e.L; continue; }
    const spans: [number, number][] = [];
    if (e === coreEdge && coreSpan && units.length) { spans.push([0, coreSpan[0] - 0.3], [coreSpan[1] + 0.3, e.L]); } else spans.push([0, e.L]);
    for (const [s0, s1] of spans) {
      const L = s1 - s0; if (L < 3.2) { if (commercial && inPlay) lost.short = (lost.short ?? 0) + Math.max(0, L); continue; }
      const n = Math.max(1, Math.round(L / (5.5 + hash(b.id, idx, 11) * 3)));
      const w = L / n;
      for (let k = 0; k < n; k++, idx++) {
        if (hash(b.id, idx, 12) > chance) { if (commercial && inPlay) lost.chance = (lost.chance ?? 0) + w; continue; }
        let kind: ShopKind = pickWeighted(shopWeights(district, e.avenue), hash(b.id, idx, 13));
        for (let tries = 0; (kind === prevKind || KINDS[kind].minW > w) && tries < 6; tries++) kind = pickWeighted(shopWeights(district, e.avenue), hash(b.id, idx, 14 + tries));
        if (KINDS[kind].minW > w) { if (commercial && inPlay) lost.minw = (lost.minw ?? 0) + w; continue; }
        const upstairs: boolean = !!KINDS[kind].upstairs;
        const uw: number = upstairs ? Math.min(w, 3.0) : w;
        const t0: number = s0 + k * w + (upstairs ? (w - uw) / 2 : 0);
        const maxD = upstairs ? 7 : kind === 'cinema_lobby' ? 22 : kind === 'diner' || kind === 'bar' || kind === 'laundromat' ? 20 : 15;
        let u = mkUnit(e, t0, uw, kind, idx, maxD);
        // corner/irregular retries: inset the bay, then fall back to a small-shop kind that fits shallow space
        if (!u && uw > 4.2 && !KINDS[kind].upstairs) u = mkUnit(e, t0 + 0.6, uw - 1.2, kind, idx, maxD);
        if (!u && !KINDS[kind].upstairs) { const alt = pickWeighted<ShopKind>((['newsstand', 'shoe_repair', 'tailor', 'bodega', 'liquor', 'barber'] as ShopKind[]).map((q) => [q, 1]), hash(b.id, idx, 31)); if (KINDS[alt].minW <= uw) u = mkUnit(e, t0, uw, alt, idx, 8) ?? (uw > 4.2 ? mkUnit(e, t0 + 0.6, uw - 1.2, alt, idx, 8) : null); }
        if (u) { units.push(u); prevKind = u.kind; } else if (commercial && inPlay) { lost.fit = (lost.fit ?? 0) + w; if (process.env.DBG && w > 6) { const mx = e.ax + e.ux * (t0 + uw / 2), mz = e.az + e.uz * (t0 + uw / 2); let dd = 0; while (dd < 30 && inPoly(b.ring, b.holes, mx + e.nx * (dd + 0.3), mz + e.nz * (dd + 0.3))) dd += 0.25; const tk = taken.some((o) => inRect(o, mx + e.nx * 1.5, mz + e.nz * 1.5)); console.error('fitfail', b.id, kind, 'depthAtMid', dd.toFixed(2), 'taken', tk, 'flags', b.flags, 'area', b.area.toFixed(0)); } }
      }
    }
  }
  // pass 2: deepen shop units into the space nobody else claimed
  for (let ti = 0; ti < taken.length; ti++) {
    const md = wantD.get(ti); const q = taken[ti]; if (!md || md <= q.d) continue;
    const others = taken.filter((_, k) => k !== ti);
    const nd = fitDepth(b, { ox: q.ox, oz: q.oz, ux: q.ux, uz: q.uz, nx: q.nx, nz: q.nz, w: q.w }, md, others);
    if (nd > q.d) { q.d = nd; const u = units.find((x) => Math.abs(x.ox - q.ox) < 0.01 && Math.abs(x.oz - q.oz) < 0.01 && Math.abs(x.w - q.w) < 0.02); if (u) u.d = +nd.toFixed(2); }
  }
  if (!units.length) continue;
  units.forEach((u, k) => { u.id = k === 0 && isCoreKind(u.kind) ? `b${b.id}` : `b${b.id}u${k}`; });
  const roofCore = units[0]?.kind;
  let roof = (roofCore === 'tenement' || roofCore === 'loft' || roofCore === 'sro' || roofCore === 'apartment_lobby') && b.floors <= 16;
  if ((roofCore === 'office_lobby' || roofCore === 'hotel_lobby') && b.floors <= 14 && units[0].d >= 9) roof = true;
  // low taxpayers: a ship's ladder in a deep shop's back room up to a roof hatch
  if (!roof && b.floors <= 3) { const ru = units.find((u) => !isCoreKind(u.kind) && !(KINDS as any)[u.kind]?.upstairs && u.d > 11 && u.w > 3.6); if (ru) { ru.roofAccess = true; roof = true; } }
  const addr = audit.find((a) => a.x >= b.minX && a.x <= b.maxX && a.z >= b.minZ && a.z <= b.maxZ && inRing(b.ring, a.x, a.z))?.address;
  out.push({
    id: b.id, i: b.i, j: b.j, use: b.use, style: b.style, year: b.year, floors: b.floors, fh: +fh.toFixed(3), top: +top.toFixed(3), gAvg: +gAvg.toFixed(3), district, cond: buildingCondition({ id: b.id, year: b.year, style: b.style, use: b.use, floors: b.floors, flags: b.flags, avenueDistance: edges.some((e) => e.avenue) ? 10 : 60, x: cx }), roof, units,
    frontage: edges.map((e) => [+e.ax.toFixed(2), +e.az.toFixed(2), +e.bx.toFixed(2), +e.bz.toFixed(2), e.street]), ...(addr ? { address: addr } : {}),
  });
  if (inPlay) {
    cov.enterableBuildings++; if (roof) cov.roofBuildings++;
    for (const u of units) {
      cov.units++; kindCount[u.kind] = (kindCount[u.kind] ?? 0) + 1;
      if (u.kind === roofCore && u === units[0] && !(KINDS as any)[u.kind]?.upstairs && ['tenement', 'apartment_lobby', 'sro', 'office_lobby', 'hotel_lobby', 'loft', 'garage', 'church', 'union_hall'].includes(u.kind)) cov.cores++; else cov.shopUnits++;
      cov.enterableFrontageM += u.w; if (commercial) cov.enterableCommercialFrontageM += u.w;
    }
  }
}
// ---------------------------------------------------------------- Tier A heroes: resolve narrative block faces to buildings
let heroContent: { id: string; address: string; parent?: string; hours?: [string, string] }[] = [];
try { heroContent = JSON.parse(execSync('git show origin/claude/sharp-maxwell-jnb6hr:content/interiors.json', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).interiors; } catch { console.warn('narrative content not reachable; heroes skipped'); }
const heroLog: string[] = [];
const avenueXAt = (name: string, z: number) => {
  const n = normaliseStreet(name); let best = Infinity, bx = NaN;
  for (const g of segs) if (streetNames[g.s] === n) { const t = Math.max(0, Math.min(1, (z - g.az) / ((g.bz - g.az) || 1e-9))); const x = g.ax + (g.bx - g.ax) * t; const zz = g.az + (g.bz - g.az) * t; const d = Math.abs(zz - z); if (d < best) { best = d; bx = x; } }
  return bx;
};
for (const h of heroContent) {
  const place = HERO_PLACEMENT[h.id]; if (!place || h.parent) continue;
  const m = /^(.+?),\s*(.+?)[–-](.+?),\s*(north|south|east|west) side/i.exec(h.address);
  if (!m) { heroLog.push(`${h.id}: unsupported address form "${h.address}"`); continue; }
  const street = normaliseStreet(m[1]), sIdx = streetNames.indexOf(street);
  const cand = out.filter((b) => b.frontage.some((e) => e[4] === sIdx)).map((b) => {
    const e = b.frontage.find((q) => q[4] === sIdx)!; const mx = (e[0] + e[2]) / 2, mz = (e[1] + e[3]) / 2;
    const xa = avenueXAt(m[2], mz), xb = avenueXAt(m[3], mz);
    const between = mx > Math.min(xa, xb) && mx < Math.max(xa, xb);
    const north = m[4].toLowerCase() === 'north' ? (b.units[0]?.nz ?? 0) < 0 : (b.units[0]?.nz ?? 0) > 0;
    return { b, e, ok: between && north && b.year < 1975 && b.floors >= (place.minFloors ?? 0) };
  }).filter((q) => q.ok).sort((p, q) => q.b.floors - p.b.floors || p.b.year - q.b.year);
  const pick = cand[0];
  if (!pick) { heroLog.push(`${h.id}: no building matches "${h.address}"`); continue; }
  const b = pick.b, [ax, az, bx, bz] = pick.e, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
  const w = Math.min(place.width, L - 0.6), t0 = (L - w) / 2;
  const base = b.units.find((q) => q.street === sIdx) ?? b.units[0];
  const ox = ax + ux * t0, oz = az + uz * t0;
  // drop units that overlap the hero span on this frontage
  b.units = b.units.filter((q) => { if (q.street !== sIdx) return true; const s0 = (q.ox - ax) * ux + (q.oz - az) * uz, s1 = s0 + q.w * Math.sign(q.ux * ux + q.uz * uz); return Math.max(s0, s1) <= t0 || Math.min(s0, s1) >= t0 + w; });
  const hn = (-uz * base.nx + ux * base.nz) >= 0 ? [-uz, ux] : [uz, -ux];
  const y = heightAt(ox + ux * w / 2 - base.nx, oz + uz * w / 2 - base.nz) + SIDEWALK_H;
  b.units.unshift({ id: h.id, kind: 'hero', hero: h.id, ox: +ox.toFixed(3), oz: +oz.toFixed(3), ux, uz, nx: hn[0], nz: hn[1], w: +w.toFixed(2), d: Math.max(base.d, 16), door: { t: +(w / 2).toFixed(2), w: 1.6, recess: 0 }, y: +y.toFixed(3), street: sIdx, avenue: false, hours: h.hours, locked: false, seed: b.id * 7 + 1 });
  b.roof = true;
  heroLog.push(`${h.id} -> building ${b.id} (${b.address ?? 'no address'}, ${b.year}, ${b.floors} fl) w ${w.toFixed(1)}`);
}
console.log('heroes:', heroLog);

const coverage = {
  ...cov,
  enterableShareOfGroundBuildings: +(cov.enterableBuildings / cov.groundBuildings).toFixed(4),
  roofShareOfGroundBuildings: +(cov.roofBuildings / cov.groundBuildings).toFixed(4),
  enterableShareOfCommercialFrontage: +(cov.enterableCommercialFrontageM / cov.commercialFrontageM).toFixed(4),
  enterableShareOfAllFrontage: +(cov.enterableFrontageM / cov.allFrontageM).toFixed(4),
};
const file: IndexFile = { version: 1, streets: streetNames, buildings: out, coverage };
fs.mkdirSync(path.join(DATA, 'interiors'), { recursive: true });
fs.writeFileSync(path.join(DATA, 'interiors/index.json'), JSON.stringify(encodeIndex(file, (k) => (KINDS as Record<string, { hours?: [string, string] }>)[k]?.hours)));
fs.mkdirSync(path.join(ROOT, 'docs/interiors'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs/interiors/coverage.json'), JSON.stringify({ coverage, kinds: kindCount }, null, 2));
console.log(coverage, 'lost commercial frontage m:', lost, kindCount, `index ${(fs.statSync(path.join(DATA, 'interiors/index.json')).size / 1024).toFixed(0)} KiB`);
