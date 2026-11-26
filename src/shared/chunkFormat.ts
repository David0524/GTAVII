/**
 * T74C chunk binary format (little-endian), shared by the pipeline (writer) and
 * runtime worker (reader). Coordinates are int16 centimetres relative to the chunk
 * centre (+-327 m range), heights are uint16 decimetres (0..6553 m).
 *
 *   header : magic u32 'T74C' | version u16 | reserved u16 | i i16 | j i16
 *   section: tag u32 (4cc) | byteLength u32 | payload
 *     'BLDG': count u32, then per building:
 *              id u32 | year u16 | use u8 | style u8 | floors u8 | flags u8 |
 *              height u16(dm) | minHeight u16(dm) | ringCount u16 | rings
 *     'GRND': count u32, then per polygon: kind u8 | ringCount u16 | rings
 *     'POIS': count u32, then per point:   kind u8 | x i16 | z i16 | heading i16 (centi-rad)
 *     'PNT ': count u32, then per stroke:  kind u8 (PaintKind) | width u8 (cm) | n u16 | n*(x i16, z i16)   (road paint centrelines)
 *   ring  : n u16 | n * (x i16, z i16)    (first ring outer CCW in XZ-up view, rest holes)
 */
export const MAGIC = 0x43343754; // 'T74C'
export const VERSION = 2;

export const enum BuildingFlag { Hero = 1, StandIn = 2, OsmPart = 4, Restored = 8 }

/** Facade style hints consumed by the Phase 3 facade generator. */
export const enum Style {
  Generic = 0,
  Tenement = 1, // brick walk-up, <=7 floors, residential
  CastIronLoft = 2, // pre-1900 commercial/industrial loft
  MasonryLoft = 3, // 1900-1931 garment/loft building
  PrewarOffice = 4, // limestone/terra cotta office or hotel
  SetbackTower = 5, // 1920s-30s zoning-envelope tower
  Postwar = 6, // 1946-1974 white brick / curtain wall
  LowCommercial = 7, // 1-3 floor taxpayer, garage
  Civic = 8, // station, arena, church, school
  HeroDeco = 9, // Empire State: limestone, aluminium spandrel strips between narrow window columns
  HeroBeaux = 10, // Flatiron / Met Life / N.Y. Life: terra cotta & limestone, rusticated base, floor banding
  HeroChelsea = 11, // Hotel Chelsea: red brick with cast-iron balconies on every floor
}

export const enum GroundKind { Road = 0, Sidewalk = 1, Park = 2, Lot = 3, Plaza = 4 }
/** Road paint (1974 NYC): white dashed lane lines (10 ft / 30 ft), double yellow on two-way streets,
 *  crosswalks as two parallel white lines, stop bars. */
export const enum PaintKind { LaneDash = 1, Yellow = 2, CrosswalkLine = 3, StopBar = 4 }
export const enum PoiKind { Signal = 1, SubwayEntrance = 2, Spawn = 3 }

export interface Ring { pts: Int16Array } // interleaved x,z in cm
export interface BuildingRec {
  id: number; year: number; use: number; style: number; floors: number; flags: number;
  height: number; minHeight: number; rings: Float32Array[]; // metres, chunk-local, interleaved x,z
}
export interface GroundRec { kind: number; rings: Float32Array[] }
export interface PoiRec { kind: number; x: number; z: number; heading: number }
export interface PaintRec { kind: number; width: number; pts: Float32Array }
export interface ChunkData { i: number; j: number; buildings: BuildingRec[]; ground: GroundRec[]; pois: PoiRec[]; paint: PaintRec[] }

const tag = (s: string) => s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24);
export const TAG_BLDG = tag('BLDG') >>> 0;
export const TAG_GRND = tag('GRND') >>> 0;
export const TAG_POIS = tag('POIS') >>> 0;
export const TAG_PNT = tag('PNT ') >>> 0;

// ---------------------------------------------------------------- reader
export function readChunk(buf: ArrayBuffer): ChunkData {
  const dv = new DataView(buf);
  let o = 0;
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad chunk magic');
  const ver = dv.getUint16(4, true);
  if (ver !== VERSION) throw new Error(`chunk version ${ver} != ${VERSION}`);
  const out: ChunkData = { i: dv.getInt16(8, true), j: dv.getInt16(10, true), buildings: [], ground: [], pois: [], paint: [] };
  o = 12;
  const rings = (): Float32Array[] => {
    const rc = dv.getUint16(o, true); o += 2;
    const res: Float32Array[] = [];
    for (let r = 0; r < rc; r++) {
      const n = dv.getUint16(o, true); o += 2;
      const a = new Float32Array(n * 2);
      for (let k = 0; k < n * 2; k++) { a[k] = dv.getInt16(o, true) / 100; o += 2; }
      res.push(a);
    }
    return res;
  };
  while (o < buf.byteLength) {
    const t = dv.getUint32(o, true); const len = dv.getUint32(o + 4, true); o += 8;
    const end = o + len;
    const count = dv.getUint32(o, true); o += 4;
    if (t === TAG_BLDG) {
      for (let k = 0; k < count; k++) {
        const b: BuildingRec = {
          id: dv.getUint32(o, true), year: dv.getUint16(o + 4, true), use: dv.getUint8(o + 6), style: dv.getUint8(o + 7),
          floors: dv.getUint8(o + 8), flags: dv.getUint8(o + 9), height: dv.getUint16(o + 10, true) / 10,
          minHeight: dv.getUint16(o + 12, true) / 10, rings: [],
        };
        o += 14; b.rings = rings(); out.buildings.push(b);
      }
    } else if (t === TAG_GRND) {
      for (let k = 0; k < count; k++) { const kind = dv.getUint8(o); o += 1; out.ground.push({ kind, rings: rings() }); }
    } else if (t === TAG_PNT) {
      for (let k = 0; k < count; k++) {
        const kind = dv.getUint8(o), width = dv.getUint8(o + 1) / 100, n = dv.getUint16(o + 2, true); o += 4;
        const pts = new Float32Array(n * 2); for (let q = 0; q < n * 2; q++) { pts[q] = dv.getInt16(o, true) / 100; o += 2; }
        out.paint.push({ kind, width, pts });
      }
    } else if (t === TAG_POIS) {
      for (let k = 0; k < count; k++) {
        out.pois.push({ kind: dv.getUint8(o), x: dv.getInt16(o + 1, true) / 100, z: dv.getInt16(o + 3, true) / 100, heading: dv.getInt16(o + 5, true) / 100 });
        o += 7;
      }
    }
    o = end;
  }
  return out;
}

// ---------------------------------------------------------------- writer
export class ByteWriter {
  private buf = new ArrayBuffer(1 << 16);
  private dv = new DataView(this.buf);
  o = 0;
  private need(n: number) {
    if (this.o + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2; while (cap < this.o + n) cap *= 2;
    const nb = new ArrayBuffer(cap); new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.o));
    this.buf = nb; this.dv = new DataView(nb);
  }
  u8(v: number) { this.need(1); this.dv.setUint8(this.o, v); this.o += 1; }
  u16(v: number) { this.need(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  i16(v: number) { this.need(2); this.dv.setInt16(this.o, v, true); this.o += 2; }
  u32(v: number) { this.need(4); this.dv.setUint32(this.o, v >>> 0, true); this.o += 4; }
  setU32(at: number, v: number) { this.dv.setUint32(at, v >>> 0, true); }
  bytes() { return new Uint8Array(this.buf, 0, this.o).slice(); }
}

const clampI16 = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v)));
const clampU16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)));

/** rings: arrays of [x,z] in chunk-local metres. */
function writeRings(w: ByteWriter, rings: [number, number][][]) {
  w.u16(rings.length);
  for (const r of rings) { w.u16(r.length); for (const [x, z] of r) { w.i16(clampI16(x * 100)); w.i16(clampI16(z * 100)); } }
}

export interface WBuilding { id: number; year: number; use: number; style: number; floors: number; flags: number; height: number; minHeight: number; rings: [number, number][][] }
export interface WGround { kind: number; rings: [number, number][][] }
export interface WPoi { kind: number; x: number; z: number; heading: number }
export interface WPaint { kind: number; width: number; pts: [number, number][] }

export function writeChunk(i: number, j: number, b: WBuilding[], g: WGround[], p: WPoi[], paint: WPaint[] = []): Uint8Array {
  const w = new ByteWriter();
  w.u32(MAGIC); w.u16(VERSION); w.u16(0); w.i16(i); w.i16(j);
  const section = (t: number, count: number, body: () => void) => {
    w.u32(t); const lenAt = w.o; w.u32(0); const start = w.o; w.u32(count); body(); w.setU32(lenAt, w.o - start);
  };
  section(TAG_BLDG, b.length, () => {
    for (const x of b) {
      w.u32(x.id); w.u16(x.year); w.u8(x.use); w.u8(x.style); w.u8(Math.min(255, x.floors)); w.u8(x.flags);
      w.u16(clampU16(x.height * 10)); w.u16(clampU16(x.minHeight * 10)); writeRings(w, x.rings);
    }
  });
  section(TAG_GRND, g.length, () => { for (const x of g) { w.u8(x.kind); writeRings(w, x.rings); } });
  section(TAG_PNT, paint.length, () => {
    for (const x of paint) { w.u8(x.kind); w.u8(Math.min(255, Math.round(x.width * 100))); w.u16(x.pts.length); for (const [px, pz] of x.pts) { w.i16(clampI16(px * 100)); w.i16(clampI16(pz * 100)); } }
  });
  section(TAG_POIS, p.length, () => {
    for (const x of p) { w.u8(x.kind); w.i16(clampI16(x.x * 100)); w.i16(clampI16(x.z * 100)); w.i16(clampI16(x.heading * 100)); }
  });
  return w.bytes();
}
