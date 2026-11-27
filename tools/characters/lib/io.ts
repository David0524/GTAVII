/**
 * Readers for the character source data (our own code; no MakeHuman program code is used).
 *   - readZip: minimal ZIP central-directory reader (stored + deflate), for targets.npz
 *   - readNpy: NumPy .npy (little-endian int16/int32/uint32/float32) reader
 *   - parseObj: Wavefront OBJ with groups and per-corner UVs (MakeHuman base.obj)
 *   - readGlb: glTF 2.0 binary container, with accessor decoding
 */
import zlib from 'node:zlib';

export function readZip(buf: Buffer): Map<string, Buffer> {
  // End of central directory record: scan back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip: no EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lNameLen + lExtraLen, local + 30 + lNameLen + lExtraLen + csize);
    out.set(name, method === 0 ? Buffer.from(data) : method === 8 ? zlib.inflateRawSync(data) : (() => { throw new Error(`zip: method ${method}`); })());
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export interface Npy { dtype: string; shape: number[]; data: Int16Array | Int32Array | Uint32Array | Float32Array | Uint16Array | Uint8Array }
export function readNpy(b: Buffer): Npy {
  if (b.toString('latin1', 1, 6) !== 'NUMPY') throw new Error('npy: bad magic');
  const major = b[6];
  const hlen = major === 1 ? b.readUInt16LE(8) : b.readUInt32LE(8);
  const hoff = major === 1 ? 10 : 12;
  const header = b.toString('latin1', hoff, hoff + hlen);
  const descr = /'descr':\s*'([^']+)'/.exec(header)![1];
  const shape = /'shape':\s*\(([^)]*)\)/.exec(header)![1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (/'fortran_order':\s*True/.test(header)) throw new Error('npy: fortran order unsupported');
  const off = hoff + hlen;
  const raw = new Uint8Array(b.subarray(off)).buffer as ArrayBuffer;
  const n = shape.reduce((a, c) => a * c, 1);
  const map: Record<string, (r: ArrayBuffer) => Npy['data']> = {
    '<i2': (r) => new Int16Array(r, 0, n), '<u2': (r) => new Uint16Array(r, 0, n), '<i4': (r) => new Int32Array(r, 0, n), '<u4': (r) => new Uint32Array(r, 0, n),
    '<f4': (r) => new Float32Array(r, 0, n), '|u1': (r) => new Uint8Array(r, 0, n),
  };
  if (!map[descr]) throw new Error(`npy: dtype ${descr}`);
  return { dtype: descr, shape, data: map[descr](raw) };
}

export interface ObjMesh {
  v: Float32Array; // xyz per vertex
  vt: Float32Array; // uv per texcoord
  /** faces: vertex indices, texcoord indices (quads or tris; tris have d = -1) */
  faces: { v: number[]; t: number[]; group: string }[];
}
export function parseObj(text: string): ObjMesh {
  const v: number[] = [], vt: number[] = [];
  const faces: ObjMesh['faces'] = [];
  let group = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) { const p = line.split(/\s+/); v.push(+p[1], +p[2], +p[3]); }
    else if (line.startsWith('vt ')) { const p = line.split(/\s+/); vt.push(+p[1], +p[2]); }
    else if (line.startsWith('g ')) group = line.slice(2).trim();
    else if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1);
      faces.push({ v: p.map((s) => +s.split('/')[0] - 1), t: p.map((s) => +(s.split('/')[1] || 0) - 1), group });
    }
  }
  return { v: new Float32Array(v), vt: new Float32Array(vt), faces };
}

export interface Glb { json: any; bin: Buffer }
export function readGlb(b: Buffer): Glb {
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('glb: bad magic');
  let p = 12, json: any = null, bin: Buffer = Buffer.alloc(0);
  while (p < b.length) {
    const len = b.readUInt32LE(p), type = b.readUInt32LE(p + 4);
    const chunk = b.subarray(p + 8, p + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    else if (type === 0x004e4942) bin = chunk;
    p += 8 + len;
  }
  return { json, bin };
}
const COMP: Record<number, [number, (b: ArrayBuffer, o: number, n: number) => ArrayLike<number>]> = {
  5126: [4, (b, o, n) => new Float32Array(b, o, n)], 5123: [2, (b, o, n) => new Uint16Array(b, o, n)],
  5125: [4, (b, o, n) => new Uint32Array(b, o, n)], 5121: [1, (b, o, n) => new Uint8Array(b, o, n)],
  5122: [2, (b, o, n) => new Int16Array(b, o, n)], 5120: [1, (b, o, n) => new Int8Array(b, o, n)],
};
const NCOMP: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
/** Decode accessor i into a Float32Array (applies normalisation for normalized ints). */
export function accessor(g: Glb, i: number): { data: Float32Array; size: number; count: number } {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const size = NCOMP[a.type];
  const [bytes, ctor] = COMP[a.componentType];
  const stride = bv.byteStride || bytes * size;
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  void ctor;
  const dv = new DataView(g.bin.buffer, g.bin.byteOffset, g.bin.length);
  const rd: Record<number, (o: number) => number> = {
    5126: (o) => dv.getFloat32(o, true), 5123: (o) => dv.getUint16(o, true), 5125: (o) => dv.getUint32(o, true),
    5121: (o) => dv.getUint8(o), 5122: (o) => dv.getInt16(o, true), 5120: (o) => dv.getInt8(o),
  };
  const r = rd[a.componentType];
  const out = new Float32Array(a.count * size);
  const norm = a.normalized ? ({ 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 } as Record<number, number>)[a.componentType] : 1;
  for (let k = 0; k < a.count; k++) for (let c = 0; c < size; c++) out[k * size + c] = r(base + k * stride + c * bytes) / norm;
  return { data: out, size, count: a.count };
}
