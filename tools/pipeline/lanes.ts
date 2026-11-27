/**
 * Lane-graph build step: public/data/streets.json + chunk POIs/ground  ->  public/data/lanes.bin (T74L).
 *   npm run data:lanes
 *
 * Deterministic: no randomness; all per-place choices use hash2() of coordinates. Steps:
 *  1. Split street centrelines at shared vertices (intersections) into raw edges.
 *  2. Cluster intersection nodes joined by very short edges (divided carriageways,
 *     Herald/Madison Square complexes) into one junction; merge plain 2-way continuations.
 *  3. Per junction: arms sorted by angle, sidewalk corners (offset-line intersections),
 *     stop-line setbacks behind the crosswalks.
 *  4. Lanes from roadway width: 2.4 m parking lane each curb (named streets), ~3 m travel
 *     lanes, 1974 one-way directions from streets.json. Lane 0 = curb lane.
 *  5. Connectors per junction: straight lane i->i, right turns curb->curb, left turns from the
 *     leftmost lane. Conflicts (crossing/merging) and priorities precomputed.
 *  6. Signals from OSM traffic_signals POIs (synthesized where a real grid intersection has
 *     none). Phase groups by arm axis; 90 s cycle; green wave offsets up/down the one-way avenues.
 *  7. Walk graph: sidewalk paths along both kerbs, crosswalks between corners; validated
 *     against chunk ground (no building, no roadway) and pruned to the largest component.
 *  8. Loiter spots (storefronts, stoops, corners, subway entrances) and bus stops.
 *  9. Traffic graph pruned to its largest strongly connected component (no dead ends).
 */
import fs from 'node:fs';
import path from 'node:path';
import { readChunk, PoiKind, GroundKind } from '../../src/shared/chunkFormat.ts';
import { CHUNK_SIZE } from '../../src/shared/geo.ts';
import { edgeDistance } from '../../src/shared/bounds.ts';
import { cumLengths, hash2, offsetPoly, polyIntersect, polyLength, pointInPolygon, projectOnPoly, reversePoly, sampleAt, subPoly } from '../../src/sim/geom.ts';
import {
  writeLaneGraph, JuncFlag, WildKind, type WildSpot, LinkKind, RoadFlag, Turn, LinkFlag, WalkKind, SpotKind,
  type Junction, type Link, type Road, type WalkEdge, type WalkNode, type Spot, type BusStop, type LaneGraph,
} from '../../src/sim/laneFormat.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'public/data');
const log = (...a: unknown[]) => console.log('[lanes]', ...a);

// ------------------------------------------------------------------ constants (documented in docs/SIM_PROGRESS.md)
const PARK_W = 2.4; // curb parking lane
const MIN_LANE_W = 3.0;
const CLUSTER_EDGE = 13; // m: intersection nodes joined by a shorter edge become one junction
const CLUSTER_SPAN = 24; // m: max span of a clustered junction
const CYCLE = 90; // s, typical Manhattan signal cycle
const YELLOW = 3, ALL_RED = 2;
const WAVE_SPEED = 10; // m/s (~22 mph) avenue progression
const CLS_RANK: Record<string, number> = { primary: 3, secondary: 2, tertiary: 2, residential: 1, unclassified: 1, living_street: 0, primary_link: 0, secondary_link: 0 };
const CLS_ID: Record<string, number> = { primary: 0, secondary: 1, tertiary: 2, residential: 3, unclassified: 4, living_street: 5, primary_link: 6, secondary_link: 7 };
/** 1974 bus routes by street (MaBSTOA avenue + crosstown routes; see SIM_PROGRESS.md). */
const BUS_STREETS = /^(5th Avenue|Madison Avenue|6th Avenue|Avenue of the Americas|7th Avenue|8th Avenue|9th Avenue|Broadway|Lexington Avenue|3rd Avenue|(East|West) (23rd|34th|42nd) Street)$/;
/** Right-of-way widths (building line to building line) for sidewalk width. */
function rightOfWay(name: string): number {
  if (/^(5th Avenue|6th Avenue|Avenue of the Americas|7th Avenue|8th Avenue|9th Avenue|Park Avenue South|3rd Avenue)$/.test(name)) return 30.5;
  if (/^(East|West) (14th|23rd|34th|42nd) Street$/.test(name)) return 30.5;
  if (/^(Madison Avenue|Broadway)$/.test(name)) return 24.4;
  if (name === 'Lexington Avenue') return 22.9;
  if (name === 'Park Avenue') return 42.7;
  if (/Street$/.test(name)) return 18.3;
  return 0;
}

// ------------------------------------------------------------------ input
interface SRec { n: string; c: string; w: number; o: number; p: number[]; g?: number }
/** Ground level only: the Park Ave viaduct (g 1) and the tunnels and their portal ramps (g -1) are other
 *  levels; they would make false junctions with the streets they pass over or under. (Their own lane
 *  level comes with the Grand Central bounds change.) */
const streets: SRec[] = (JSON.parse(fs.readFileSync(path.join(DATA, 'streets.json'), 'utf8')) as SRec[]).filter((s) => !s.g);
const world = JSON.parse(fs.readFileSync(path.join(DATA, 'world.json'), 'utf8'));

// chunk ground + POIs in world coords
interface PolyW { rings: Float32Array[]; minX: number; minZ: number; maxX: number; maxZ: number }
const buildingsW: PolyW[] = [], roadsW: PolyW[] = [], parksW: PolyW[] = [];
const bldInfo: { p: PolyW; h: number; style: number }[] = [];
const signals: [number, number][] = [], subways: [number, number][] = [];
const toWorld = (rings: Float32Array[], ox: number, oz: number): PolyW => {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  const out = rings.map((r) => { const a = new Float32Array(r.length); for (let k = 0; k < r.length; k += 2) { a[k] = r[k] + ox; a[k + 1] = r[k + 1] + oz; } return a; });
  for (let k = 0; k < out[0].length; k += 2) { minX = Math.min(minX, out[0][k]); maxX = Math.max(maxX, out[0][k]); minZ = Math.min(minZ, out[0][k + 1]); maxZ = Math.max(maxZ, out[0][k + 1]); }
  return { rings: out, minX, minZ, maxX, maxZ };
};
for (const c of world.chunks) {
  const buf = fs.readFileSync(path.join(DATA, 'chunks', `${c.key}.bin`));
  const d = readChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const ox = (d.i + 0.5) * CHUNK_SIZE, oz = (d.j + 0.5) * CHUNK_SIZE;
  for (const b of d.buildings) if (b.minHeight < 3) { const pw = toWorld(b.rings, ox, oz); buildingsW.push(pw); bldInfo.push({ p: pw, h: b.height, style: b.style }); }
  for (const g of d.ground) {
    if (g.kind === GroundKind.Road) roadsW.push(toWorld(g.rings, ox, oz));
    else if (g.kind === GroundKind.Park) parksW.push(toWorld(g.rings, ox, oz));
  }
  for (const p of d.pois) {
    if (p.kind === PoiKind.Signal) signals.push([p.x + ox, p.z + oz]);
    else if (p.kind === PoiKind.SubwayEntrance) subways.push([p.x + ox, p.z + oz]);
  }
}
/** Uniform grid index over polygons for point queries. */
class PolyIndex {
  cells = new Map<string, PolyW[]>();
  constructor(list: PolyW[], private cs = 40) {
    for (const p of list) for (let i = Math.floor(p.minX / cs); i <= Math.floor(p.maxX / cs); i++) for (let j = Math.floor(p.minZ / cs); j <= Math.floor(p.maxZ / cs); j++) {
      const k = `${i},${j}`; (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(p);
    }
  }
  has(x: number, z: number) {
    const l = this.cells.get(`${Math.floor(x / this.cs)},${Math.floor(z / this.cs)}`);
    if (l) for (const p of l) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && pointInPolygon(p.rings, x, z)) return true;
    return false;
  }
}
const inBuilding = new PolyIndex(buildingsW), onRoad = new PolyIndex(roadsW);
/** Inside the PLAYABLE bounds (src/shared/bounds.ts) with margin m: no lanes or walk graph beyond the edge. */
const inRegion = (x: number, z: number, m = 0) => edgeDistance(x, z) >= -m;
/** Inside the modelled ground (world.json region): ground polygons exist here. */
const GR = world.region as { minX: number; maxX: number; minZ: number; maxZ: number };
const onGround = (x: number, z: number) => x > GR.minX + 1 && x < GR.maxX - 1 && z > GR.minZ + 1 && z < GR.maxZ - 1;
log(`input: ${streets.length} streets, ${buildingsW.length} building rings, ${roadsW.length} road polys, ${signals.length} signals, ${subways.length} subway entrances`);

// ------------------------------------------------------------------ 1. nodes + raw edges
const vkey = (x: number, z: number) => `${x.toFixed(1)},${z.toFixed(1)}`;
const vcount = new Map<string, number>();
for (const s of streets) {
  const seen = new Set<string>();
  for (let k = 0; k < s.p.length; k += 2) { const key = vkey(s.p[k], s.p[k + 1]); if (!seen.has(key)) { seen.add(key); vcount.set(key, (vcount.get(key) ?? 0) + 1); } }
}
const nodeId = new Map<string, number>();
const nodePos: [number, number][] = [];
const getNode = (x: number, z: number) => { const k = vkey(x, z); let id = nodeId.get(k); if (id === undefined) { id = nodePos.length; nodeId.set(k, id); nodePos.push([x, z]); } return id; };
interface RawEdge { s: number; pts: number[]; a: number; b: number }
let raw: RawEdge[] = [];
for (let si = 0; si < streets.length; si++) {
  const p = streets[si].p, n = p.length >> 1;
  let cur: number[] = [p[0], p[1]], a = getNode(p[0], p[1]);
  for (let k = 1; k < n; k++) {
    const x = p[2 * k], z = p[2 * k + 1];
    cur.push(x, z);
    if (k === n - 1 || (vcount.get(vkey(x, z)) ?? 0) >= 2) {
      const b = getNode(x, z);
      raw.push({ s: si, pts: cur, a, b });
      cur = [x, z]; a = b;
    }
  }
}
raw = raw.filter((e) => {
  if (e.a === e.b || polyLength(e.pts) < 0.5) return false;
  const m = Math.floor((e.pts.length >> 1) / 2);
  const mx = (e.pts[0] + e.pts[e.pts.length - 2]) / 2, mz = (e.pts[1] + e.pts[e.pts.length - 1]) / 2;
  // keep only edges on the streamed ground (no lanes over the void outside the region)
  return e.pts.every((_, k) => k % 2 || inRegion(e.pts[k], e.pts[k + 1], 2)) || (inRegion(mx, mz, -5) && inRegion(e.pts[2 * m], e.pts[2 * m + 1], -5));
});
const degree = new Array(nodePos.length).fill(0);
for (const e of raw) { degree[e.a]++; degree[e.b]++; }

// ------------------------------------------------------------------ 2. clustering
const parent = nodePos.map((_, i) => i);
const members = nodePos.map((_, i) => [i]);
const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const shortEdges = raw.map((e, i) => ({ i, L: polyLength(e.pts) })).filter((x) => x.L < CLUSTER_EDGE).sort((a, b) => a.L - b.L || a.i - b.i);
for (const { i } of shortEdges) {
  const e = raw[i];
  if (degree[e.a] < 3 || degree[e.b] < 3) continue;
  const ra = find(e.a), rb = find(e.b);
  if (ra === rb) continue;
  const all = [...members[ra], ...members[rb]];
  let span = 0;
  for (const p of all) for (const q of all) span = Math.max(span, Math.hypot(nodePos[p][0] - nodePos[q][0], nodePos[p][1] - nodePos[q][1]));
  if (span > CLUSTER_SPAN) continue;
  parent[rb] = ra; members[ra] = all; members[rb] = [];
}

// Working edges between clusters.
interface WEdge { name: string; cls: string; w: number; oneway: number; pts: number[]; ja: number; jb: number; dead?: boolean }
let edges: WEdge[] = [];
for (const e of raw) {
  const ja = find(e.a), jb = find(e.b);
  if (ja === jb) continue;
  const s = streets[e.s];
  edges.push({ name: s.n, cls: s.c, w: s.w, oneway: s.o, pts: e.pts.slice(), ja, jb });
}
// Merge plain continuations (2 arms, same street, same width, consistent direction).
{
  let merged = 0;
  for (let changed = true; changed;) {
    changed = false;
    const inc = new Map<number, number[]>();
    edges.forEach((e, i) => { if (e.dead) return; (inc.get(e.ja) ?? inc.set(e.ja, []).get(e.ja)!).push(i); (inc.get(e.jb) ?? inc.set(e.jb, []).get(e.jb)!).push(i); });
    for (const [j, list] of inc) {
      if (list.length !== 2 || list[0] === list[1]) continue;
      const e1 = edges[list[0]], e2 = edges[list[1]];
      if (e1.dead || e2.dead || e1.name !== e2.name || e1.w !== e2.w) continue;
      // orient e1 to END at j and e2 to START at j
      const o1 = e1.jb === j ? e1.oneway : -e1.oneway, o2 = e2.ja === j ? e2.oneway : -e2.oneway;
      if (o1 !== o2) continue;
      const p1 = e1.jb === j ? e1.pts : reversePoly(e1.pts), p2 = e2.ja === j ? e2.pts : reversePoly(e2.pts);
      const start = e1.jb === j ? e1.ja : e1.jb, end = e2.ja === j ? e2.jb : e2.ja;
      if (start === end) continue;
      e1.pts = [...p1, ...p2.slice(2)]; e1.oneway = o1; e1.ja = start; e1.jb = end;
      if ((CLS_RANK[e2.cls] ?? 0) > (CLS_RANK[e1.cls] ?? 0)) e1.cls = e2.cls;
      e2.dead = true; merged++; changed = true;
    }
  }
  edges = edges.filter((e) => !e.dead);
  log(`raw edges ${raw.length} -> ${edges.length} road edges (${merged} continuations merged)`);
}

// ------------------------------------------------------------------ roads
const names: string[] = [];
const nameIdx = new Map<string, number>();
const nameOf = (n: string) => { let i = nameIdx.get(n); if (i === undefined) { i = names.length; names.push(n); nameIdx.set(n, i); } return i; };
interface RoadInfo { park: number; nLanes: number; laneW: number; pathOff: number; half: number; speed: number; sidewalk: number }
const roads: Road[] = [], rinfo: RoadInfo[] = [];
for (const e of edges) {
  const isLink = /_link$/.test(e.cls) || e.name === '';
  const avenue = /Avenue|Broadway/.test(e.name) && !/Street$/.test(e.name);
  let flags = 0;
  if (avenue) flags |= RoadFlag.Avenue;
  if (BUS_STREETS.test(e.name)) flags |= RoadFlag.BusRoute;
  if (isLink) flags |= RoadFlag.Link;
  if (e.w >= 15) flags |= RoadFlag.Wide;
  const park = isLink || e.w - 2 * PARK_W < MIN_LANE_W * (e.oneway === 0 ? 2 : 1) ? 0 : PARK_W;
  const per = (e.w - 2 * park) / (e.oneway === 0 ? 2 : 1);
  const nLanes = Math.max(1, Math.min(5, Math.floor(per / MIN_LANE_W)));
  // divided carriageways (Park Avenue's one-way halves): the right-of-way spans both and the mall between,
  // so it says nothing about this half's sidewalk; use the default kerb-side band
  const row = e.oneway !== 0 && /^Park Avenue( South)?$/.test(e.name) ? 0 : rightOfWay(e.name);
  const sidewalk = row > e.w ? (row - e.w) / 2 : 3.0;
  const pathOff = Math.max(1.0, Math.min(2.4, sidewalk * 0.42));
  const half = Math.max(0.3, Math.min(pathOff - 0.5, sidewalk - pathOff - 0.6, 1.5));
  roads.push({ name: nameOf(e.name), cls: CLS_ID[e.cls] ?? 4, oneway: e.oneway, flags, width: e.w, sidewalk, pts: new Float32Array(e.pts) });
  rinfo.push({ park, nLanes, laneW: per / nLanes, pathOff, half, speed: avenue ? 12.5 : isLink ? 9 : 9.5, sidewalk });
}

// ------------------------------------------------------------------ 3. junctions, arms, corners, setbacks
interface ArmW { road: number; atStart: boolean; ox: number; oz: number; dx: number; dz: number; theta: number }
const jIds = new Map<number, number>(); // cluster root -> junction index
const jArms: ArmW[][] = [];
const jCentre: [number, number][] = [];
const jOf = (root: number) => {
  let id = jIds.get(root);
  if (id === undefined) {
    id = jArms.length; jIds.set(root, id); jArms.push([]);
    const m = members[root]; let x = 0, z = 0; for (const k of m) { x += nodePos[k][0]; z += nodePos[k][1]; }
    jCentre.push([x / m.length, z / m.length]);
  }
  return id;
};
const armDir = (pts: number[] | Float32Array, fromStart: boolean): [number, number, number, number] => {
  const p = fromStart ? Array.from(pts) : reversePoly(pts);
  const cum = cumLengths(p), L = cum[cum.length - 1];
  const o = [0, 0, 0, 0]; sampleAt(p, cum, Math.min(8, L), o);
  const dx = o[0] - p[0], dz = o[1] - p[1], l = Math.hypot(dx, dz) || 1;
  return [p[0], p[1], dx / l, dz / l];
};
const roadJ: [number, number][] = []; // [junction at start, junction at end]
const roadArm: [number, number][] = [];
edges.forEach((e, r) => {
  const ja = jOf(e.ja), jb = jOf(e.jb);
  roadJ.push([ja, jb]);
  for (const [j, atStart] of [[ja, true], [jb, false]] as const) {
    const [ox, oz, dx, dz] = armDir(roads[r].pts, atStart);
    jArms[j].push({ road: r, atStart, ox, oz, dx, dz, theta: Math.atan2(dz, dx) });
  }
});
for (const arms of jArms) arms.sort((a, b) => a.theta - b.theta || a.road - b.road);
roads.forEach((_, r) => {
  const [ja, jb] = roadJ[r];
  roadArm.push([jArms[ja].findIndex((a) => a.road === r && a.atStart), jArms[jb].findIndex((a) => a.road === r && !a.atStart)]);
});

const cross = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;
const offOf = (r: number) => roads[r].width / 2 + rinfo[r].pathOff;
/** corners[j][k] = sidewalk corner in the sector between arm k and arm k+1 (on the RIGHT of arm k's outward direction). */
const corners: [number, number][][] = [];
const setback: number[][] = [];
for (let j = 0; j < jArms.length; j++) {
  const arms = jArms[j], n = arms.length;
  const cs: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const A = arms[k], B = arms[(k + 1) % n];
    const offA = offOf(A.road), offB = offOf(B.road);
    let delta = n === 1 ? 2 * Math.PI : B.theta - A.theta; if (delta <= 0) delta += 2 * Math.PI;
    const nAx = -A.dz, nAz = A.dx, nBx = B.dz, nBz = -B.dx;
    const pAx = A.ox + nAx * offA, pAz = A.oz + nAz * offA, pBx = B.ox + nBx * offB, pBz = B.oz + nBz * offB;
    const ox = (A.ox + B.ox) / 2, oz = (A.oz + B.oz) / 2;
    const den = cross(A.dx, A.dz, B.dx, B.dz);
    const deg = (delta * 180) / Math.PI;
    if (n === 1) { cs.push([pAx, pAz]); continue; }
    if (deg >= 20 && deg <= 160 && Math.abs(den) > 1e-6) {
      let t = cross(pBx - pAx, pBz - pAz, B.dx, B.dz) / den;
      t = Math.max(-2, Math.min(35, t));
      cs.push([pAx + A.dx * t, pAz + A.dz * t]);
    } else {
      const th = A.theta + delta / 2, bx = Math.cos(th), bz = Math.sin(th);
      let d = Math.max(offA, offB);
      if (deg < 20) d = Math.min(35, d / Math.max(0.17, Math.sin(delta / 2)));
      cs.push([ox + bx * d, oz + bz * d]);
    }
  }
  if (n === 1) { const A = arms[0]; const offA = offOf(A.road); cs.push([A.ox + A.dz * offA, A.oz - A.dx * offA]); } // left corner of a dead end
  corners.push(cs);
  const sb: number[] = [];
  const real = n >= 3;
  for (let k = 0; k < n; k++) {
    const A = arms[k];
    if (n === 1) { sb.push(0); continue; }
    if (!real) { sb.push(1.0); continue; }
    const cR = cs[k], cL = cs[(k - 1 + n) % n];
    const proj = Math.max((cR[0] - A.ox) * A.dx + (cR[1] - A.oz) * A.dz, (cL[0] - A.ox) * A.dx + (cL[1] - A.oz) * A.dz);
    sb.push(Math.max(4, proj + 1.5 + 1.0));
  }
  setback.push(sb);
}
// clamp setbacks on short roads
const roadSb: [number, number][] = roads.map((rd, r) => {
  const L = polyLength(rd.pts);
  let a = setback[roadJ[r][0]][roadArm[r][0]], b = setback[roadJ[r][1]][roadArm[r][1]];
  if (a + b > L - 3) { const k = Math.max(0, L - 3) / (a + b); a *= k; b *= k; }
  return [a, b];
});
const cornerRight = (_j: number, k: number) => k; // index into corners[j]
const cornerLeft = (j: number, k: number) => (jArms[j].length === 1 ? 1 : (k - 1 + jArms[j].length) % jArms[j].length);

// ------------------------------------------------------------------ 6a. signals + phases
const junctions: Junction[] = [];
let synthesized = 0, fromPoi = 0;
const sigAt = new Set<number>();
for (const [sx, sz] of signals) {
  let best = -1, bd = 30;
  for (let j = 0; j < jArms.length; j++) if (jArms[j].length >= 3) { const d = Math.hypot(jCentre[j][0] - sx, jCentre[j][1] - sz); if (d < bd) { bd = d; best = j; } }
  if (best >= 0) sigAt.add(best);
}
for (let j = 0; j < jArms.length; j++) {
  const arms = jArms[j], n = arms.length;
  let flags = n === 1 ? JuncFlag.DeadEnd : n === 2 ? JuncFlag.Continuation : 0;
  const armPhase = new Array(n).fill(-1);
  const phases: { green: number; yellow: number; allRed: number }[] = [];
  let offset = 0;
  const named = arms.filter((a) => !(roads[a.road].flags & RoadFlag.Link)).map((a) => names[roads[a.road].name]);
  const realCrossing = n >= 3 && new Set(named).size >= 2;
  let signal = n >= 3 && sigAt.has(j);
  if (signal) fromPoi++;
  else if (realCrossing && arms.every((a) => !(roads[a.road].flags & RoadFlag.Link))) { signal = true; synthesized++; flags |= JuncFlag.Synthesized; }
  if (signal) {
    // cluster arms by axis (mod pi)
    const groups: { phi: number; arms: number[] }[] = [];
    for (let k = 0; k < n; k++) {
      const phi = ((arms[k].theta % Math.PI) + Math.PI) % Math.PI;
      let g = groups.find((G) => { const d = Math.abs(G.phi - phi); return Math.min(d, Math.PI - d) < (25 * Math.PI) / 180; });
      if (!g) { g = { phi, arms: [] }; groups.push(g); }
      g.arms.push(k);
    }
    while (groups.length > 3) { // merge the two closest axes
      let bi = 0, bj = 1, bd = Infinity;
      for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) { const d = Math.abs(groups[a].phi - groups[b].phi); const dd = Math.min(d, Math.PI - d); if (dd < bd) { bd = dd; bi = a; bj = b; } }
      groups[bi].arms.push(...groups[bj].arms); groups.splice(bj, 1);
    }
    if (groups.length >= 2) {
      flags |= JuncFlag.Signal;
      // order: most avenue-like (Z-aligned) first
      groups.sort((a, b) => Math.abs(Math.sin(b.phi)) - Math.abs(Math.sin(a.phi)));
      const weight = groups.map((G) => (G.arms.some((k) => roads[arms[k].road].flags & RoadFlag.Avenue) ? 1.3 : 1.0));
      const avail = CYCLE - groups.length * (YELLOW + ALL_RED), wsum = weight.reduce((a, b) => a + b, 0);
      groups.forEach((G, gi) => { phases.push({ green: Math.round((avail * weight[gi]) / wsum), yellow: YELLOW, allRed: ALL_RED }); for (const k of G.arms) armPhase[k] = gi; });
      const fix = CYCLE - phases.reduce((s, p) => s + p.green + p.yellow + p.allRed, 0); phases[0].green += fix;
      // green wave along the first group's one-way avenue
      const z = jCentre[j][1];
      const av = groups[0].arms.map((k) => roads[arms[k].road]).find((rd) => rd.flags & RoadFlag.Avenue && rd.oneway !== 0);
      if (av) {
        const dz = (av.pts[av.pts.length - 1] - av.pts[1]) * av.oneway; // travel dz
        offset = dz < 0 ? -z / WAVE_SPEED : z / WAVE_SPEED;
        offset = ((offset % CYCLE) + CYCLE) % CYCLE;
      }
    }
  }
  junctions.push({ x: jCentre[j][0], z: jCentre[j][1], flags, cycle: CYCLE, offset, phases, arms: arms.map((a, k) => ({ road: a.road, atStart: a.atStart ? 1 : 0, phase: armPhase[k], dirX: a.dx, dirZ: a.dz })) });
}
log(`junctions ${junctions.length}: signals ${junctions.filter((j) => j.flags & JuncFlag.Signal).length} (${fromPoi} from OSM POIs, ${synthesized} synthesized), dead ends ${junctions.filter((j) => j.flags & JuncFlag.DeadEnd).length}`);

// ------------------------------------------------------------------ 4. lanes
let links: Link[] = [];
const groupLanes: number[][] = []; // group -> lane link ids (index = laneIndex)
const roadGroups: [number, number][] = roads.map(() => [-1, -1]); // [forward group, backward group]
const emptyLink = (): Link => ({ kind: 0, owner: -1, laneIndex: 0, laneCount: 1, width: 3, speed: 9, group: -1, left: -1, right: -1, startJ: -1, startArm: -1, endJ: -1, endArm: -1, turn: 0, prio: 0, dir: 1, flags: 0, next: [], conflicts: [], crossings: [], pts: new Float32Array(0) });
roads.forEach((rd, r) => {
  const info = rinfo[r];
  const [sa, sb] = roadSb[r];
  for (const dir of [1, -1]) {
    if (rd.oneway !== 0 && rd.oneway !== dir) continue;
    const base = dir === 1 ? Array.from(rd.pts) : reversePoly(rd.pts);
    const s0 = dir === 1 ? sa : sb, s1 = dir === 1 ? sb : sa;
    const g = groupLanes.length; groupLanes.push([]);
    roadGroups[r][dir === 1 ? 0 : 1] = g;
    for (let i = 0; i < info.nLanes; i++) {
      const off = rd.width / 2 - info.park - (i + 0.5) * info.laneW;
      const op = offsetPoly(base, off);
      const L = polyLength(op);
      const pts = subPoly(op, s0, Math.max(s0 + 1, L - s1));
      const l = emptyLink();
      Object.assign(l, {
        kind: LinkKind.Lane, owner: r, laneIndex: i, laneCount: info.nLanes, width: info.laneW, speed: info.speed, group: g, dir,
        startJ: dir === 1 ? roadJ[r][0] : roadJ[r][1], startArm: dir === 1 ? roadArm[r][0] : roadArm[r][1],
        endJ: dir === 1 ? roadJ[r][1] : roadJ[r][0], endArm: dir === 1 ? roadArm[r][1] : roadArm[r][0],
        flags: i === 0 ? LinkFlag.CurbLane : 0, pts: new Float32Array(pts),
      });
      groupLanes[g].push(links.length); links.push(l);
    }
    const ids = groupLanes[g];
    ids.forEach((id, i) => { links[id].right = i > 0 ? ids[i - 1] : -1; links[id].left = i < ids.length - 1 ? ids[i + 1] : -1; });
  }
});
const nLanesTotal = links.length;

// ------------------------------------------------------------------ 5. connectors
const endInfo = (pts: Float32Array, atEnd: boolean) => {
  const n = pts.length >> 1;
  if (atEnd) { const dx = pts[2 * n - 2] - pts[2 * n - 4], dz = pts[2 * n - 1] - pts[2 * n - 3], l = Math.hypot(dx, dz) || 1; return [pts[2 * n - 2], pts[2 * n - 1], dx / l, dz / l]; }
  const dx = pts[2] - pts[0], dz = pts[3] - pts[1], l = Math.hypot(dx, dz) || 1; return [pts[0], pts[1], dx / l, dz / l];
};
function connectorPts(a: Float32Array, b: Float32Array, straight: boolean): number[] | null {
  for (const f of [0.55, 0.35, 0.8, 0.15, 1.0]) {
    const p = connectorPtsK(a, b, straight, f);
    const cum = cumLengths(p), L = cum[cum.length - 1], o = [0, 0, 0, 0];
    let ok = true;
    for (let s = 0; s <= L && ok; s += 0.75) { sampleAt(p, cum, s, o); if (onGround(o[0], o[1]) && !onRoad.has(o[0], o[1])) ok = false; }
    if (ok) return p;
  }
  badConnectors++;
  return null;
}
let badConnectors = 0;
function connectorPtsK(a: Float32Array, b: Float32Array, straight: boolean, kf: number): number[] {
  const [x0, z0, dx0, dz0] = endInfo(a, true), [x3, z3, dx3, dz3] = endInfo(b, false);
  const dist = Math.hypot(x3 - x0, z3 - z0);
  if (dist < 0.05) return [x0, z0, x3 + dx3 * 0.1, z3 + dz3 * 0.1];
  let k0 = dist / 3, k3 = dist / 3;
  const den = cross(dx0, dz0, dx3, dz3);
  if (Math.abs(den) > 0.2) {
    const t = cross(x3 - x0, z3 - z0, dx3, dz3) / den, u = cross(x3 - x0, z3 - z0, dx0, dz0) / den;
    if (t > 0 && u > 0 && t < 2 * dist && u < 2 * dist) { k0 = t * kf; k3 = u * kf; }
  }
  const x1 = x0 + dx0 * k0, z1 = z0 + dz0 * k0, x2 = x3 - dx3 * k3, z2 = z3 - dz3 * k3;
  const N = straight ? 3 : 10, out: number[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    out.push(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * z0 + 3 * u * u * t * z1 + 3 * u * t * t * z2 + t * t * t * z3);
  }
  return out;
}
const inGroupAt = (j: number, k: number) => { const a = jArms[j][k]; return roadGroups[a.road][a.atStart ? 1 : 0]; }; // lanes arriving at j via arm k
const outGroupAt = (j: number, k: number) => { const a = jArms[j][k]; return roadGroups[a.road][a.atStart ? 0 : 1]; };
const srcOf = new Map<number, number>();
function makeConnector(j: number, ki: number, ko: number, from: number, to: number, turn: number) {
  const a = links[from], b = links[to];
  if (a.next.some((c) => links[c].next[0] === to)) return;
  const pts = connectorPts(a.pts, b.pts, turn === Turn.Straight);
  if (!pts) return;
  const c = emptyLink();
  const sp = turn === Turn.Right ? 4.5 : turn === Turn.Left ? 6 : Math.min(a.speed, b.speed);
  Object.assign(c, {
    kind: LinkKind.Connector, owner: j, laneIndex: a.laneIndex, laneCount: 1, width: Math.min(a.width, 3.5), speed: sp, group: -1, dir: 1,
    startJ: j, startArm: ki, endJ: j, endArm: ko, turn, prio: rankOf(a.owner) * 4 + (turn === Turn.Straight ? 3 : turn === Turn.Right ? 2 : 1),
    next: [to], pts: new Float32Array(pts),
  });
  a.next.push(links.length); srcOf.set(links.length, from); links.push(c);
}
const rankOf = (r: number) => CLS_RANK[Object.keys(CLS_ID).find((k) => CLS_ID[k] === roads[r].cls) ?? 'unclassified'] ?? 1;
for (let j = 0; j < jArms.length; j++) {
  const arms = jArms[j], n = arms.length;
  const signal = !!(junctions[j].flags & JuncFlag.Signal);
  const continuation = n === 2;
  for (let ki = 0; ki < n; ki++) {
    const gi = inGroupAt(j, ki); if (gi < 0) continue;
    const inLanes = groupLanes[gi];
    const inDx = -arms[ki].dx, inDz = -arms[ki].dz;
    const cands: { ko: number; turn: number; ang: number }[] = [];
    for (let ko = 0; ko < n; ko++) {
      if (ko === ki) continue;
      const go = outGroupAt(j, ko); if (go < 0) continue;
      const ang = Math.atan2(cross(inDx, inDz, arms[ko].dx, arms[ko].dz), inDx * arms[ko].dx + inDz * arms[ko].dz);
      const deg = (ang * 180) / Math.PI;
      if (!continuation && Math.abs(deg) > 155) continue;
      const turn = continuation || Math.abs(deg) < 35 ? Turn.Straight : deg > 0 ? Turn.Right : Turn.Left;
      cands.push({ ko, turn, ang: Math.abs(deg) });
    }
    const add = (from: number, to: number, turn: number, ko: number) => makeConnector(j, ki, ko, from, to, turn);
    for (const cd of cands) {
      const outLanes = groupLanes[outGroupAt(j, cd.ko)];
      if (cd.turn === Turn.Straight) inLanes.forEach((l, i) => add(l, outLanes[Math.min(i, outLanes.length - 1)], cd.turn, cd.ko));
      else if (cd.turn === Turn.Right) add(inLanes[0], outLanes[0], cd.turn, cd.ko);
      else add(inLanes[inLanes.length - 1], outLanes[outLanes.length - 1], cd.turn, cd.ko);
    }
    // every lane must have an exit if the arm has any
    if (cands.length) for (const [i, l] of inLanes.entries()) if (!links[l].next.length) {
      const best = [...cands].sort((a, b) => a.ang - b.ang)[0];
      const outLanes = groupLanes[outGroupAt(j, best.ko)];
      add(l, outLanes[Math.min(i, outLanes.length - 1)], best.turn, best.ko);
    }
  }
  void signal;
}
log(`lanes ${nLanesTotal}, connectors ${links.length - nLanesTotal} (${badConnectors} dropped: no curve stays on the roadway ground)`);

// ------------------------------------------------------------------ 7. walk graph
const walkNodes: WalkNode[] = [];
const cornerNode: number[][] = corners.map((cs, j) => cs.map(([x, z]) => { walkNodes.push({ x, z, kind: jArms[j].length === 1 ? 1 : 0, junction: j }); return walkNodes.length - 1; }));
let walkEdges: WalkEdge[] = [];
const sideEdge: [number, number][] = roads.map(() => [-1, -1]); // [right(+1), left(-1)]
roads.forEach((rd, r) => {
  const [ja, jb] = roadJ[r], [ka, kb] = roadArm[r];
  for (const side of [1, -1]) {
    const cA = side === 1 ? cornerNode[ja][cornerRight(ja, ka)] : cornerNode[ja][cornerLeft(ja, ka)];
    const cB = side === 1 ? cornerNode[jb][cornerLeft(jb, kb)] : cornerNode[jb][cornerRight(jb, kb)];
    if (cA === cB) continue;
    const op = offsetPoly(rd.pts, side * offOf(r));
    const A = walkNodes[cA], B = walkNodes[cB];
    const s1 = projectOnPoly(op, A.x, A.z).s, s2 = projectOnPoly(op, B.x, B.z).s;
    let pts: number[];
    if (s2 > s1 + 0.5) { const mid = subPoly(op, s1, s2); pts = [A.x, A.z, ...mid.slice(2, -2), B.x, B.z]; }
    else pts = [A.x, A.z, B.x, B.z];
    sideEdge[r][side === 1 ? 0 : 1] = walkEdges.length;
    walkEdges.push({ a: cA, b: cB, kind: WalkKind.Sidewalk, owner: r, arm: -1, opposite: -1, side, half: rinfo[r].half, pts: new Float32Array(pts) });
  }
});
for (let j = 0; j < jArms.length; j++) {
  const n = jArms[j].length;
  if (n < 3) continue;
  for (let k = 0; k < n; k++) {
    if (roads[jArms[j][k].road].flags & RoadFlag.Link) continue;
    const a = cornerNode[j][cornerLeft(j, k)], b = cornerNode[j][cornerRight(j, k)];
    if (a === b) continue;
    const A = walkNodes[a], B = walkNodes[b];
    walkEdges.push({ a, b, kind: WalkKind.Crosswalk, owner: j, arm: k, opposite: -1, side: 0, half: 1.2, pts: new Float32Array([A.x, A.z, B.x, B.z]) });
  }
}
// quantize to the stored precision (int16 dm) so validation sees what the runtime sees
const q = (v: number) => Math.round(v * 10) / 10;
for (const n of walkNodes) { n.x = q(n.x); n.z = q(n.z); }
for (const e of walkEdges) { for (let k = 0; k < e.pts.length; k++) e.pts[k] = q(e.pts[k]); }
// validate
const okPoint1 = (x: number, z: number) => !inBuilding.has(x, z) && !onRoad.has(x, z);
// also test the int16-decimetre quantized position that ends up in lanes.bin
const okPoint = (x: number, z: number) => okPoint1(x, z) && okPoint1(Math.round(x * 10) / 10, Math.round(z * 10) / 10);
const nodeOk = walkNodes.map((n) => okPoint(n.x, n.z) && inRegion(n.x, n.z, 2));
const dbgCorners = walkNodes.map((n, i) => [Math.round(n.x * 10) / 10, Math.round(n.z * 10) / 10, nodeOk[i] ? 1 : inBuilding.has(n.x, n.z) ? 2 : onRoad.has(n.x, n.z) ? 3 : 4]);
let badEdges = 0, badNodes = nodeOk.filter((v) => !v).length;
walkEdges = walkEdges.map((e) => {
  if (!nodeOk[e.a] || !nodeOk[e.b]) return null;
  if (e.kind === WalkKind.Sidewalk) {
    const cum = cumLengths(e.pts), L = cum[cum.length - 1], o = [0, 0, 0, 0];
    let half = e.half;
    for (let s = 0.05; s <= L - 0.05 + 1e-6; s = s + 0.25 > L - 0.05 && s < L - 0.05 ? L - 0.05 : s + 0.25) {
      sampleAt(e.pts, cum, s, o);
      if (!okPoint(o[0], o[1])) { badEdges++; return null; }
      // widest symmetric walking band that stays on sidewalk here
      let l = 0.1;
      for (; l <= half + 1e-6; l += 0.1) { const m = l + 0.15; if (!okPoint(o[0] - o[3] * m, o[1] + o[2] * m) || !okPoint(o[0] + o[3] * m, o[1] - o[2] * m)) break; }
      half = Math.min(half, l - 0.1);
    }
    e.half = Math.max(0.05, half);
  }
  return e;
}).filter((e): e is WalkEdge => e !== null);
// largest connected component
{
  const par = walkNodes.map((_, i) => i);
  const f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
  for (const e of walkEdges) par[f(e.a)] = f(e.b);
  const size = new Map<number, number>();
  for (const e of walkEdges) size.set(f(e.a), (size.get(f(e.a)) ?? 0) + 1);
  let bestRoot = -1, bs = -1; for (const [k, v] of size) if (v > bs) { bs = v; bestRoot = k; }
  const before = walkEdges.length;
  walkEdges = walkEdges.filter((e) => f(e.a) === bestRoot);
  // compact nodes
  const used = new Map<number, number>(), nn: WalkNode[] = [];
  for (const e of walkEdges) for (const v of [e.a, e.b]) if (!used.has(v)) { used.set(v, nn.length); nn.push(walkNodes[v]); }
  for (const e of walkEdges) { e.a = used.get(e.a)!; e.b = used.get(e.b)!; }
  walkNodes.length = 0; walkNodes.push(...nn);
  log(`walk graph: ${walkNodes.length} nodes, ${walkEdges.length} edges (${walkEdges.filter((e) => e.kind === WalkKind.Crosswalk).length} crosswalks); dropped ${badNodes} bad corners, ${badEdges} sidewalk edges crossing buildings/road, ${before - walkEdges.length} outside main component`);
}
// sidewalk edge index by road side, opposite edges
for (const s of sideEdge) { s[0] = -1; s[1] = -1; }
walkEdges.forEach((e, i) => { if (e.kind === WalkKind.Sidewalk) sideEdge[e.owner][e.side === 1 ? 0 : 1] = i; });
for (const [a, b] of sideEdge) if (a >= 0 && b >= 0) { walkEdges[a].opposite = b; walkEdges[b].opposite = a; }

// ------------------------------------------------------------------ 9. SCC pruning of the traffic graph
// Pruned at lane-GROUP level (vehicles can change lanes within a group), then every lane in a
// surviving group gets at least one exit into a surviving group (copied from a sibling lane).
{
  const G = groupLanes.length;
  const gAlive = new Array(G).fill(true);
  const tgtGroup = (c: number) => links[links[c].next[0]].group;
  let added = 0;
  for (let outer = 0; outer < 10; outer++) {
  for (let iter = 0; iter < 20; iter++) {
    const succ = (g: number) => [...new Set(groupLanes[g].flatMap((l) => links[l].next.map(tgtGroup)).filter((t) => gAlive[t]))];
    const index = new Int32Array(G).fill(-1), low = new Int32Array(G), onSt = new Uint8Array(G), comp = new Int32Array(G).fill(-1);
    const st: number[] = []; let idx = 0, nc = 0;
    for (let s0 = 0; s0 < G; s0++) {
      if (!gAlive[s0] || index[s0] >= 0) continue;
      const work: [number, number, number[]][] = [[s0, 0, succ(s0)]];
      index[s0] = low[s0] = idx++; st.push(s0); onSt[s0] = 1;
      while (work.length) {
        const top = work[work.length - 1]; const [v, i, ns] = top;
        if (i < ns.length) {
          top[1]++; const w = ns[i];
          if (index[w] < 0) { index[w] = low[w] = idx++; st.push(w); onSt[w] = 1; work.push([w, 0, succ(w)]); }
          else if (onSt[w]) low[v] = Math.min(low[v], index[w]);
        } else {
          work.pop();
          if (work.length) { const u = work[work.length - 1][0]; low[u] = Math.min(low[u], low[v]); }
          if (low[v] === index[v]) { let w; do { w = st.pop()!; onSt[w] = 0; comp[w] = nc; } while (w !== v); nc++; }
        }
      }
    }
    const csize = new Map<number, number>(); for (let g = 0; g < G; g++) if (gAlive[g]) csize.set(comp[g], (csize.get(comp[g]) ?? 0) + groupLanes[g].length);
    let big = -1, bs = -1; for (const [k, v] of csize) if (v > bs) { bs = v; big = k; }
    let changed = false;
    for (let g = 0; g < G; g++) if (gAlive[g] && comp[g] !== big) { gAlive[g] = false; changed = true; }
    if (!changed) break;
  }
  // entries from the city beyond the edge: a dropped group that starts at the playable edge and leads into the
  // kept network is a source (the sim feeds traffic in there), e.g. 7th Avenue coming down from uptown
  let entries = 0;
  for (let g = 0; g < G; g++) {
    if (gAlive[g]) continue;
    const first = links[groupLanes[g][0]].pts;
    if (edgeDistance(first[0], first[1]) > 25) continue;
    if (!groupLanes[g].some((l) => links[l].next.some((c) => gAlive[tgtGroup(c)]))) continue;
    gAlive[g] = true; entries++;
  }
  if (outer === 0) log(`edge entries revived: ${entries}`);
  // exits for every lane of a surviving group; a group where some lane can't get one is dropped and we re-prune
  let killed = 0;
  for (let g = 0; g < G; g++) if (gAlive[g]) for (const [i, l] of groupLanes[g].entries()) {
    if (links[l].next.some((c) => gAlive[tgtGroup(c)])) continue;
    const sibs = groupLanes[g].flatMap((s2) => links[s2].next).filter((c) => gAlive[tgtGroup(c)])
      .sort((x, y) => links[x].turn - links[y].turn || Math.abs(links[x].laneIndex - i) - Math.abs(links[y].laneIndex - i) || x - y);
    for (const sib of sibs) {
      const c = links[sib], tl = groupLanes[tgtGroup(sib)];
      makeConnector(c.owner, c.startArm, c.endArm, l, tl[Math.min(i, tl.length - 1)], c.turn);
      if (links[l].next.some((x) => gAlive[tgtGroup(x)])) { added++; break; }
    }
    if (!links[l].next.some((x) => gAlive[tgtGroup(x)])) { gAlive[g] = false; killed++; break; }
  }
  if (!killed) break;
  }
  const alive = links.map((l, i) => (l.kind === LinkKind.Lane ? gAlive[l.group] : gAlive[links[srcOf.get(i)!].group] && gAlive[tgtGroup(i)]));
  if (process.env.LANES_DEBUG) fs.writeFileSync(process.env.LANES_DEBUG, JSON.stringify({
    lanes: links.map((l, i) => ({ k: l.kind, a: alive[i] ? 1 : 0, n: l.kind === 0 ? names[roads[l.owner].name] : '', p: Array.from(l.pts).map((v) => Math.round(v * 10) / 10) })),
    corners: dbgCorners, roads: roads.map((r) => ({ n: names[r.name], o: r.oneway, p: Array.from(r.pts) })), junctions: junctions.map((j) => [j.x, j.z, j.flags, j.arms.length]),
  }));
  const map = new Int32Array(links.length).fill(-1); let n = 0;
  links.forEach((_, i) => { if (alive[i]) map[i] = n++; });
  const kept = links.filter((_, i) => alive[i]);
  for (const l of kept) {
    l.next = l.next.map((x) => map[x]).filter((x) => x >= 0);
    l.left = l.left >= 0 ? map[l.left] : -1; l.right = l.right >= 0 ? map[l.right] : -1;
  }
  log(`SCC prune: ${links.length} -> ${kept.length} links (${kept.filter((l) => l.kind === LinkKind.Lane).length} lanes; ${added} exits added)`);
  links = kept;
  const deadEnds = links.filter((l) => l.kind === LinkKind.Lane && !l.next.length).length;
  if (deadEnds) throw new Error(`${deadEnds} lanes without exits after pruning`);
}
/** Where two paths come closer than thr (vehicle bodies would touch): [start on a, END of the zone on b],
 *  so a vehicle on b only counts as clear once it has left the whole shared zone. */
function nearPoint(a: Float32Array, b: Float32Array, thr: number): [number, number] | null {
  const cum = cumLengths(a), L = cum[cum.length - 1], o = [0, 0, 0, 0];
  let first = -1, lastB = -1;
  for (let s = 0; s <= L; s += 0.5) { sampleAt(a, cum, s, o); const p = projectOnPoly(b, o[0], o[1]); if (p.d < thr) { if (first < 0) first = s; lastB = Math.max(lastB, p.s); } }
  return first < 0 ? null : [first, lastB];
}
// connector conflicts (crossing or merging paths from different source lanes, same junction)
{
  const src = new Int32Array(links.length).fill(-1);
  links.forEach((l, i) => { if (l.kind === LinkKind.Lane) for (const c of l.next) src[c] = i; });
  const byJ = new Map<number, number[]>();
  links.forEach((l, i) => { if (l.kind === LinkKind.Connector) (byJ.get(l.owner) ?? byJ.set(l.owner, []).get(l.owner)!).push(i); });
  let nconf = 0;
  for (const list of byJ.values()) for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const ca = links[list[a]], cb = links[list[b]];
    // same source lane: they diverge, but bodies overlap until the paths separate (zone conflict below)
    if (ca.next[0] === cb.next[0]) { ca.conflicts.push({ link: list[b], sSelf: polyLength(ca.pts), sOther: polyLength(cb.pts) }); cb.conflicts.push({ link: list[a], sSelf: polyLength(cb.pts), sOther: polyLength(ca.pts) }); nconf++; continue; }
    const ab = nearPoint(ca.pts, cb.pts, 2.6), ba = nearPoint(cb.pts, ca.pts, 2.6);
    const x = src[list[a]] === src[list[b]] ? null : polyIntersect(ca.pts, cb.pts);
    if (ab || ba || x) {
      // zone on b as seen from a, and on a as seen from b (crossing point if they only cross)
      const aStart = ab ? ab[0] : x![0], bEnd = ab ? ab[1] : x![1];
      const bStart = ba ? ba[0] : x![1], aEnd = ba ? ba[1] : x![0];
      ca.conflicts.push({ link: list[b], sSelf: aStart, sOther: Math.max(bEnd, x ? x[1] : 0) });
      cb.conflicts.push({ link: list[a], sSelf: bStart, sOther: Math.max(aEnd, x ? x[0] : 0) });
      nconf++;
    }
  }
  log(`connector conflicts: ${nconf}`);
}

// crosswalk crossings on connectors
{
  const byJ = new Map<number, number[]>();
  walkEdges.forEach((e, i) => { if (e.kind === WalkKind.Crosswalk) (byJ.get(e.owner) ?? byJ.set(e.owner, []).get(e.owner)!).push(i); });
  let nx = 0;
  for (const l of links) if (l.kind === LinkKind.Connector) for (const w of byJ.get(l.owner) ?? []) {
    const h = polyIntersect(l.pts, walkEdges[w].pts);
    if (h) { l.crossings.push({ walkEdge: w, s: h[0] }); nx++; }
  }
  log(`connector/crosswalk crossings: ${nx}`);
}

// ------------------------------------------------------------------ 8. spots + bus stops
const spots: Spot[] = [];
/** Straight walk between two points stays on sidewalk (peds step from the path to a spot this way). */
function okSegment(x0: number, z0: number, x1: number, z1: number) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  for (let t = 0; t <= d; t += 0.25) { const f = d ? t / d : 0; if (!okPoint(x0 + (x1 - x0) * f, z0 + (z1 - z0) * f)) return false; }
  return true;
}
const yawFacing = (fx: number, fz: number) => Math.atan2(-fx, -fz);
walkEdges.forEach((e, ei) => {
  if (e.kind !== WalkKind.Sidewalk) return;
  const rd = roads[e.owner];
  const cum = cumLengths(e.pts), L = cum[cum.length - 1], o = [0, 0, 0, 0];
  const stoopy = rd.cls === CLS_ID.residential && /Street$/.test(names[rd.name]);
  for (let s = 9; s < L - 8; s += 21) {
    sampleAt(e.pts, cum, s, o);
    // outward (away from road): right normal of the path direction times side
    const nx = -o[3] * e.side, nz = o[2] * e.side;
    const d = Math.min(rinfo[e.owner].sidewalk - rinfo[e.owner].pathOff - 0.5, e.half + 0.6);
    if (d < 0.3) continue;
    const x = o[0] + nx * d, z = o[1] + nz * d;
    if (!okPoint(x, z) || !okSegment(o[0], o[1], x, z)) continue;
    const kind = stoopy && hash2(x, z) % 3 !== 0 ? SpotKind.Stoop : SpotKind.Storefront;
    spots.push({ kind, x, z, heading: yawFacing(-nx, -nz), edge: ei, s });
  }
});
walkNodes.forEach((n, ni) => {
  if (n.kind !== 0) return;
  const ei = walkEdges.findIndex((e) => e.kind === WalkKind.Sidewalk && (e.a === ni || e.b === ni));
  if (ei < 0 || hash2(n.x, n.z) % 2) return;
  const e = walkEdges[ei], s = e.a === ni ? 0.5 : polyLength(e.pts) - 0.5;
  spots.push({ kind: SpotKind.Corner, x: n.x, z: n.z, heading: 0, edge: ei, s });
});
let subwayOk = 0;
for (let [x, z] of subways) {
  let best = -1, bd = 15, bs = 0;
  walkEdges.forEach((e, i) => { if (e.kind !== WalkKind.Sidewalk) return; const p = projectOnPoly(e.pts, x, z); if (p.d < bd) { bd = p.d; best = i; bs = p.s; } });
  if (best < 0 || inBuilding.has(x, z)) continue;
  const o = [0, 0, 0, 0]; const e = walkEdges[best]; sampleAt(e.pts, cumLengths(e.pts), bs, o);
  // entrances mapped on islands/medians (or not reachable in a straight line): use the kerbside path point
  if (!okPoint(x, z) || !okSegment(o[0], o[1], x, z)) { x = o[0]; z = o[1]; }
  spots.push({ kind: SpotKind.Subway, x, z, heading: yawFacing(o[0] - x, o[1] - z), edge: best, s: bs }); subwayOk++;
}
const busStops: BusStop[] = [];
links.forEach((l, li) => {
  if (l.kind !== LinkKind.Lane || l.laneIndex !== 0 || !(roads[l.owner].flags & RoadFlag.BusRoute)) return;
  const L = polyLength(l.pts);
  if (L < 45 || hash2(l.pts[0], l.pts[1]) % 2) return;
  // far-side stop, far enough into the block that a bus entering in another lane can reach the kerb
  const s = Math.max(18, Math.min(40, L * 0.45));
  const side = l.dir; // curb (right of travel) = road right side when travelling forward
  const we = sideEdge[l.owner][side === 1 ? 0 : 1];
  if (we < 0) return;
  const o = [0, 0, 0, 0]; sampleAt(l.pts, cumLengths(l.pts), s + 6, o);
  const p = projectOnPoly(walkEdges[we].pts, o[0], o[1]);
  const q = [0, 0, 0, 0]; sampleAt(walkEdges[we].pts, cumLengths(walkEdges[we].pts), p.s, q);
  spots.push({ kind: SpotKind.BusStop, x: q[0], z: q[1], heading: yawFacing(o[0] - q[0], o[1] - q[1]), edge: we, s: p.s });
  busStops.push({ link: li, s, spot: spots.length - 1 });
  l.flags |= LinkFlag.BusStop;
});
log(`spots ${spots.length} (storefront ${spots.filter((s) => s.kind === SpotKind.Storefront).length}, stoop ${spots.filter((s) => s.kind === SpotKind.Stoop).length}, corner ${spots.filter((s) => s.kind === SpotKind.Corner).length}, subway ${subwayOk}/${subways.length}, bus ${busStops.length})`);

// ------------------------------------------------------------------ wildlife places (pigeons, rats)
const wild: WildSpot[] = [];
{
  const nearWalk = (x: number, z: number, r: number) => walkEdges.some((e) => e.kind === WalkKind.Sidewalk && projectOnPoly(e.pts, x, z).d < r);
  // pigeons on park ground: a grid inside each park polygon, near its paths/edges
  for (const pk of parksW) for (let x = Math.ceil(pk.minX / 14) * 14; x < pk.maxX; x += 14) for (let z = Math.ceil(pk.minZ / 14) * 14; z < pk.maxZ; z += 14) {
    if (!inRegion(x, z, -3) || !pointInPolygon(pk.rings, x, z) || inBuilding.has(x, z) || onRoad.has(x, z)) continue;
    if (hash2(x, z) % 3 === 0) continue;
    let ring = true; for (let a = 0; a < 8 && ring; a++) { const px = x + 3.2 * Math.cos(a * Math.PI / 4), pz = z + 3.2 * Math.sin(a * Math.PI / 4); ring = !inBuilding.has(px, pz) && !onRoad.has(px, pz); }
    if (!ring) continue;
    wild.push({ kind: WildKind.PigeonPark, x, z, y: 0, heading: 0 });
  }
  // pigeons on sidewalk corners (every other corner spot)
  for (const sp of spots) if (sp.kind === SpotKind.Corner && hash2(sp.x, sp.z) % 2 === 0) wild.push({ kind: WildKind.PigeonCorner, x: sp.x, z: sp.z, y: 0, heading: 0 });
  // ledges: street-facing cornice of low/mid buildings; coops: some tenement roofs
  for (const b of bldInfo) {
    const r = b.p.rings[0];
    let cx = 0, cz = 0; for (let k = 0; k < r.length; k += 2) { cx += r[k]; cz += r[k + 1]; } cx /= r.length / 2; cz /= r.length / 2;
    if (!inRegion(cx, cz, -5)) continue;
    if (b.h >= 9 && b.h <= 40 && hash2(cx, cz) % 3 === 0) {
      for (let k = 0; k < r.length - 2; k += 2) {
        const ax = r[k], az = r[k + 1], bx = r[k + 2], bz = r[k + 3], L = Math.hypot(bx - ax, bz - az);
        if (L < 8) continue;
        let nx = (bz - az) / L, nz = -(bx - ax) / L; // one of the normals; pick the one pointing away from the centroid
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }
        const x = mx + nx * 0.3, z = mz + nz * 0.3;
        if (!nearWalk(x + nx * 2.5, z + nz * 2.5, 4)) continue; // faces a sidewalk
        wild.push({ kind: WildKind.PigeonLedge, x, z, y: b.h, heading: Math.atan2(-nx, -nz) });
        break;
      }
    }
    if (b.style === 1 /* Tenement */ && b.h <= 26 && hash2(cz, cx) % 9 === 0) wild.push({ kind: WildKind.PigeonCoop, x: cx, z: cz, y: b.h, heading: 0 });
  }
  // rats: kerbside trash in front of shops and stoops (night), subway entrances
  for (const sp of spots) {
    if ((sp.kind === SpotKind.Storefront || sp.kind === SpotKind.Stoop) && hash2(sp.z, sp.x) % 4 === 0) {
      const e = walkEdges[sp.edge], o = [0, 0, 0, 0];
      sampleAt(e.pts, cumLengths(e.pts), sp.s, o);
      const lr = -e.side * Math.max(0, e.half - 0.5); // near the kerb, inside the walking band (rats dash around it)
      const x = o[0] - o[3] * lr, z = o[1] + o[2] * lr;
      if (okPoint(x, z)) wild.push({ kind: WildKind.RatTrash, x, z, y: 0, heading: sp.heading });
    } else if (sp.kind === SpotKind.Subway) wild.push({ kind: WildKind.RatSubway, x: sp.x, z: sp.z, y: 0, heading: sp.heading });
  }
  const c = (k: number) => wild.filter((w) => w.kind === k).length;
  log(`wildlife places: pigeon park ${c(WildKind.PigeonPark)}, corner ${c(WildKind.PigeonCorner)}, ledge ${c(WildKind.PigeonLedge)}, coop ${c(WildKind.PigeonCoop)}; rat trash ${c(WildKind.RatTrash)}, subway ${c(WildKind.RatSubway)}`);
}

// ------------------------------------------------------------------ kerb room (parking lane actually on roadway ground)
{
  let ok = 0, total = 0;
  for (const l of links) {
    if (l.kind !== LinkKind.Lane) continue;
    for (const [side, flag, cond] of [[1, LinkFlag.RightKerbRoom, l.laneIndex === 0], [-1, LinkFlag.LeftKerbRoom, l.laneIndex === l.laneCount - 1]] as const) {
      if (!cond) continue;
      total++;
      const off = side * (l.width / 2 + 1.2);
      const op = offsetPoly(l.pts, off), cum = cumLengths(op), L = cum[cum.length - 1], o = [0, 0, 0, 0];
      let good = true;
      for (let s2 = 0; s2 <= L && good; s2 += 2) { sampleAt(op, cum, s2, o); for (const d of [-1.1, 0, 1.1]) if (!onRoad.has(o[0] - o[3] * d, o[1] + o[2] * d)) { good = false; break; } }
      if (good) { l.flags |= flag; ok++; }
    }
  }
  log(`kerb room: ${ok}/${total} kerb-side lanes have a parking lane on roadway ground`);
}

// ------------------------------------------------------------------ write
const graph: LaneGraph = { names, roads, junctions, links, walkNodes, walkEdges, spots, busStops, wild };
const bytes = writeLaneGraph(graph);
fs.writeFileSync(path.join(DATA, 'lanes.bin'), bytes);
log(`wrote public/data/lanes.bin: ${(bytes.length / 1024).toFixed(0)} KiB`);
