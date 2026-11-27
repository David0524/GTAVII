/**
 * T74L lane-graph binary format (little-endian). Written by tools/pipeline/lanes.ts,
 * read by the sim runtime. Coordinates are int16 DECIMETRES in world space (+-3276 m),
 * other scalars are small ints or float32. Indices are int32 (-1 = none).
 *
 *   header : magic u32 'T74L' | version u16 | reserved u16
 *   section: tag u32 (4cc) | byteLength u32 | count u32 | records
 *     'NAME'  strings: len u8 | utf8
 *     'ROAD'  name i32 | cls u8 | oneway i8 | flags u8 | width f32 | sidewalk f32 | poly
 *     'JUNC'  x,z i16dm | flags u8 | cycle f32 | offset f32 | nPhase u8 | (green,yellow,allRed f32)* |
 *             nArm u8 | (road i32 | atStart u8 | phase i8 | dirX f32 | dirZ f32)*
 *     'LINK'  kind u8 | owner i32 | laneIndex u8 | laneCount u8 | width f32 | speed f32 | group i32 |
 *             left i32 | right i32 | startJ i32 | startArm i8 | endJ i32 | endArm i8 | turn u8 | prio u8 | dir i8 | flags u8 |
 *             nNext u16 | next i32* | nConf u16 | (link i32 | sSelf f32 | sOther f32)* |
 *             nCross u16 | (walkEdge i32 | s f32)* | poly
 *     'WNOD'  x,z i16dm | kind u8 | junction i32
 *     'WEDG'  a i32 | b i32 | kind u8 | owner i32 | arm i8 | opposite i32 | side i8 | half f32 | poly
 *     'SPOT'  kind u8 | x,z i16dm | heading f32 | edge i32 | s f32
 *     'BSTP'  link i32 | s f32 | spot i32
 *     'WILD'  kind u8 | x,z i16dm | y f32 (height above road surface) | heading f32   (pigeon/rat places)
 *   poly   : n u16 | n * (x i16dm, z i16dm)
 */
export const LANE_MAGIC = 0x4c343754; // 'T74L'
export const LANE_VERSION = 1;

export const enum RoadFlag { Avenue = 1, BusRoute = 2, Link = 4, Wide = 8 }
export const enum JuncFlag { Signal = 1, Continuation = 2, Synthesized = 4, DeadEnd = 8 }
export const enum LinkKind { Lane = 0, Connector = 1 }
export const enum Turn { Straight = 0, Right = 1, Left = 2 }
/** RightKerbRoom/LeftKerbRoom: the parking lane beside this kerb-side lane is on roadway ground along its whole length
 *  (sirens may gutter-run there, cars may pull into it). */
export const enum LinkFlag { CurbLane = 1, BusStop = 2, RightKerbRoom = 4, LeftKerbRoom = 8 }
export const enum WalkKind { Sidewalk = 0, Crosswalk = 1 }
export const enum SpotKind { Storefront = 0, Stoop = 1, Subway = 2, Corner = 3, BusStop = 4 }
/** Wildlife places. Ground spots are on sidewalk/park ground; ledges and coops are up on buildings (y = metres above the road surface). */
export const enum WildKind { PigeonPark = 0, PigeonCorner = 1, PigeonLedge = 2, PigeonCoop = 3, RatTrash = 4, RatSubway = 5 }

export interface Road { name: number; cls: number; oneway: number; flags: number; width: number; sidewalk: number; pts: Float32Array }
export interface Phase { green: number; yellow: number; allRed: number }
export interface Arm { road: number; atStart: number; phase: number; dirX: number; dirZ: number }
export interface Junction { x: number; z: number; flags: number; cycle: number; offset: number; phases: Phase[]; arms: Arm[] }
export interface Conflict { link: number; sSelf: number; sOther: number }
export interface Crossing { walkEdge: number; s: number }
export interface Link {
  kind: number; owner: number; laneIndex: number; laneCount: number; width: number; speed: number; group: number;
  left: number; right: number; startJ: number; startArm: number; endJ: number; endArm: number;
  turn: number; prio: number; dir: number; flags: number;
  next: number[]; conflicts: Conflict[]; crossings: Crossing[]; pts: Float32Array;
}
export interface WalkNode { x: number; z: number; kind: number; junction: number }
export interface WalkEdge { a: number; b: number; kind: number; owner: number; arm: number; opposite: number; side: number; half: number; pts: Float32Array }
export interface Spot { kind: number; x: number; z: number; heading: number; edge: number; s: number }
export interface BusStop { link: number; s: number; spot: number }
export interface WildSpot { kind: number; x: number; z: number; y: number; heading: number }

export interface LaneGraph {
  names: string[]; roads: Road[]; junctions: Junction[]; links: Link[];
  walkNodes: WalkNode[]; walkEdges: WalkEdge[]; spots: Spot[]; busStops: BusStop[]; wild: WildSpot[];
}

const tag = (s: string) => (s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24)) >>> 0;
const T = { NAME: tag('NAME'), ROAD: tag('ROAD'), JUNC: tag('JUNC'), LINK: tag('LINK'), WNOD: tag('WNOD'), WEDG: tag('WEDG'), SPOT: tag('SPOT'), BSTP: tag('BSTP'), WILD: tag('WILD') };

// ---------------------------------------------------------------- writer
class W {
  buf = new ArrayBuffer(1 << 20); dv = new DataView(this.buf); o = 0;
  need(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2; while (cap < this.o + n) cap *= 2;
    const nb = new ArrayBuffer(cap); new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o)); this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v: number) { this.need(1); this.dv.setUint8(this.o, v); this.o += 1; }
  i8(v: number) { this.need(1); this.dv.setInt8(this.o, v); this.o += 1; }
  u16(v: number) { this.need(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v: number) { this.need(2); this.dv.setInt16(this.o, v, true); this.o += 2; }
  i32(v: number) { this.need(4); this.dv.setInt32(this.o, v, true); this.o += 4; }
  u32(v: number) { this.need(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  f32(v: number) { this.need(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  dm(v: number) {
    const q = Math.round(v * 10);
    if (q < -32767 || q > 32767) throw new Error(`coordinate out of int16 dm range: ${v}`);
    this.i16(q);
  }
  poly(p: ArrayLike<number>) { const n = p.length >> 1; this.u16(n); for (let k = 0; k < n * 2; k++) this.dm(p[k]); }
  section(t: number, count: number, body: () => void) {
    this.u32(t); const lenAt = this.o; this.u32(0); const start = this.o; this.u32(count); body();
    this.dv.setUint32(lenAt, this.o - start, true);
  }
}

export function writeLaneGraph(g: LaneGraph): Uint8Array {
  const w = new W();
  w.u32(LANE_MAGIC); w.u16(LANE_VERSION); w.u16(0);
  const enc = new TextEncoder();
  w.section(T.NAME, g.names.length, () => { for (const s of g.names) { const b = enc.encode(s).slice(0, 255); w.u8(b.length); for (const c of b) w.u8(c); } });
  w.section(T.ROAD, g.roads.length, () => {
    for (const r of g.roads) { w.i32(r.name); w.u8(r.cls); w.i8(r.oneway); w.u8(r.flags); w.f32(r.width); w.f32(r.sidewalk); w.poly(r.pts); }
  });
  w.section(T.JUNC, g.junctions.length, () => {
    for (const j of g.junctions) {
      w.dm(j.x); w.dm(j.z); w.u8(j.flags); w.f32(j.cycle); w.f32(j.offset);
      w.u8(j.phases.length); for (const p of j.phases) { w.f32(p.green); w.f32(p.yellow); w.f32(p.allRed); }
      w.u8(j.arms.length); for (const a of j.arms) { w.i32(a.road); w.u8(a.atStart); w.i8(a.phase); w.f32(a.dirX); w.f32(a.dirZ); }
    }
  });
  w.section(T.LINK, g.links.length, () => {
    for (const l of g.links) {
      w.u8(l.kind); w.i32(l.owner); w.u8(l.laneIndex); w.u8(l.laneCount); w.f32(l.width); w.f32(l.speed); w.i32(l.group);
      w.i32(l.left); w.i32(l.right); w.i32(l.startJ); w.i8(l.startArm); w.i32(l.endJ); w.i8(l.endArm);
      w.u8(l.turn); w.u8(l.prio); w.i8(l.dir); w.u8(l.flags);
      w.u16(l.next.length); for (const n of l.next) w.i32(n);
      w.u16(l.conflicts.length); for (const c of l.conflicts) { w.i32(c.link); w.f32(c.sSelf); w.f32(c.sOther); }
      w.u16(l.crossings.length); for (const c of l.crossings) { w.i32(c.walkEdge); w.f32(c.s); }
      w.poly(l.pts);
    }
  });
  w.section(T.WNOD, g.walkNodes.length, () => { for (const n of g.walkNodes) { w.dm(n.x); w.dm(n.z); w.u8(n.kind); w.i32(n.junction); } });
  w.section(T.WEDG, g.walkEdges.length, () => {
    for (const e of g.walkEdges) { w.i32(e.a); w.i32(e.b); w.u8(e.kind); w.i32(e.owner); w.i8(e.arm); w.i32(e.opposite); w.i8(e.side); w.f32(e.half); w.poly(e.pts); }
  });
  w.section(T.SPOT, g.spots.length, () => { for (const s of g.spots) { w.u8(s.kind); w.dm(s.x); w.dm(s.z); w.f32(s.heading); w.i32(s.edge); w.f32(s.s); } });
  w.section(T.BSTP, g.busStops.length, () => { for (const b of g.busStops) { w.i32(b.link); w.f32(b.s); w.i32(b.spot); } });
  w.section(T.WILD, g.wild.length, () => { for (const b of g.wild) { w.u8(b.kind); w.dm(b.x); w.dm(b.z); w.f32(b.y); w.f32(b.heading); } });
  return new Uint8Array(w.buf, 0, w.o).slice();
}

// ---------------------------------------------------------------- reader
export function readLaneGraph(buf: ArrayBuffer): LaneGraph {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== LANE_MAGIC) throw new Error('bad lanes magic');
  const ver = dv.getUint16(4, true);
  if (ver !== LANE_VERSION) throw new Error(`lanes version ${ver} != ${LANE_VERSION}`);
  let o = 8;
  const u8 = () => dv.getUint8(o++), i8 = () => dv.getInt8(o++);
  const u16 = () => { const v = dv.getUint16(o, true); o += 2; return v; };
  const i32 = () => { const v = dv.getInt32(o, true); o += 4; return v; };
  const u32 = () => { const v = dv.getUint32(o, true); o += 4; return v; };
  const f32 = () => { const v = dv.getFloat32(o, true); o += 4; return v; };
  const dm = () => { const v = dv.getInt16(o, true) / 10; o += 2; return v; };
  const poly = () => { const n = u16(); const a = new Float32Array(n * 2); for (let k = 0; k < n * 2; k++) a[k] = dm(); return a; };
  const dec = new TextDecoder();
  const g: LaneGraph = { names: [], roads: [], junctions: [], links: [], walkNodes: [], walkEdges: [], spots: [], busStops: [], wild: [] };
  while (o < buf.byteLength) {
    const t = u32(), len = u32(), end = o + len, count = u32();
    for (let k = 0; k < count; k++) {
      if (t === T.NAME) { const n = u8(); g.names.push(dec.decode(new Uint8Array(buf, o, n))); o += n; }
      else if (t === T.ROAD) g.roads.push({ name: i32(), cls: u8(), oneway: i8(), flags: u8(), width: f32(), sidewalk: f32(), pts: poly() });
      else if (t === T.JUNC) {
        const j: Junction = { x: dm(), z: dm(), flags: u8(), cycle: f32(), offset: f32(), phases: [], arms: [] };
        const np = u8(); for (let p = 0; p < np; p++) j.phases.push({ green: f32(), yellow: f32(), allRed: f32() });
        const na = u8(); for (let a = 0; a < na; a++) j.arms.push({ road: i32(), atStart: u8(), phase: i8(), dirX: f32(), dirZ: f32() });
        g.junctions.push(j);
      } else if (t === T.LINK) {
        const l: Link = {
          kind: u8(), owner: i32(), laneIndex: u8(), laneCount: u8(), width: f32(), speed: f32(), group: i32(),
          left: i32(), right: i32(), startJ: i32(), startArm: i8(), endJ: i32(), endArm: i8(),
          turn: u8(), prio: u8(), dir: i8(), flags: u8(), next: [], conflicts: [], crossings: [], pts: new Float32Array(0),
        };
        const nn = u16(); for (let q = 0; q < nn; q++) l.next.push(i32());
        const nc = u16(); for (let q = 0; q < nc; q++) l.conflicts.push({ link: i32(), sSelf: f32(), sOther: f32() });
        const nx = u16(); for (let q = 0; q < nx; q++) l.crossings.push({ walkEdge: i32(), s: f32() });
        l.pts = poly();
        g.links.push(l);
      } else if (t === T.WNOD) g.walkNodes.push({ x: dm(), z: dm(), kind: u8(), junction: i32() });
      else if (t === T.WEDG) g.walkEdges.push({ a: i32(), b: i32(), kind: u8(), owner: i32(), arm: i8(), opposite: i32(), side: i8(), half: f32(), pts: poly() });
      else if (t === T.SPOT) g.spots.push({ kind: u8(), x: dm(), z: dm(), heading: f32(), edge: i32(), s: f32() });
      else if (t === T.BSTP) g.busStops.push({ link: i32(), s: f32(), spot: i32() });
      else if (t === T.WILD) g.wild.push({ kind: u8(), x: dm(), z: dm(), y: f32(), heading: f32() });
      else { o = end; break; }
    }
    o = end;
  }
  return g;
}
