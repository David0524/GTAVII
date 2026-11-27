/**
 * "T74X" container used for character data files (body.bin, anims.bin): a JSON header with
 * named, typed, 4-byte-aligned blobs. Written by tools/characters, read by the runtime.
 *   u32 magic 'T74X' | u32 version | u32 jsonBytes | json (utf8, space-padded to 4) | blobs
 */
export type BlobType = 'f32' | 'i16' | 'u16' | 'i8' | 'u8' | 'u32' | 'i32';
/**
 * Optional per-blob filter, undone at load. delta3: per-axis deltas between consecutive vertices
 * (stride 3), restarting every `seg` elements (one morph/PCA component), integer wrap-around so
 * decoding is exact. It makes vertex-ordered geometry data compress far better under gzip.
 */
export interface BlobFilter { kind: 'delta3'; seg: number }
export interface BlobDesc { name: string; type: BlobType; offset: number; length: number; filter?: BlobFilter }
export interface Container { meta: any; blobs: Map<string, ArrayBufferView> }

const MAGIC = 0x58343754; // 'T74X'
const CTOR = { f32: Float32Array, i16: Int16Array, u16: Uint16Array, i8: Int8Array, u8: Uint8Array, u32: Uint32Array, i32: Int32Array } as const;
const typeOf = (a: ArrayBufferView): BlobType => {
  if (a instanceof Float32Array) return 'f32'; if (a instanceof Int16Array) return 'i16'; if (a instanceof Uint16Array) return 'u16';
  if (a instanceof Int8Array) return 'i8'; if (a instanceof Uint8Array) return 'u8'; if (a instanceof Uint32Array) return 'u32';
  if (a instanceof Int32Array) return 'i32'; throw new Error('format: unsupported blob type');
};

/** Applies a filter (write side): returns a filtered copy. */
export function encodeFilter(a: ArrayBufferView, f: BlobFilter): ArrayBufferView {
  const src = a as unknown as { length: number; [i: number]: number }, Ctor = (a as any).constructor;
  const out = new Ctor(src.length);
  for (let s0 = 0; s0 < src.length; s0 += f.seg) for (let i = 0; i < f.seg && s0 + i < src.length; i++) out[s0 + i] = i >= 3 ? src[s0 + i] - src[s0 + i - 3] : src[s0 + i];
  return out;
}
function decodeFilter(a: ArrayBufferView, f: BlobFilter) {
  const v = a as unknown as { length: number; [i: number]: number };
  for (let s0 = 0; s0 < v.length; s0 += f.seg) for (let i = 3; i < f.seg && s0 + i < v.length; i++) v[s0 + i] = v[s0 + i] + v[s0 + i - 3];
}

export function writeContainer(meta: any, blobs: Record<string, ArrayBufferView>, filters: Record<string, BlobFilter> = {}): Uint8Array {
  const descs: BlobDesc[] = [];
  let off = 0;
  blobs = Object.fromEntries(Object.entries(blobs).map(([n, a]) => [n, filters[n] ? encodeFilter(a, filters[n]) : a]));
  for (const [name, a] of Object.entries(blobs)) {
    descs.push({ name, type: typeOf(a), offset: off, length: (a as unknown as { length: number }).length, ...(filters[name] ? { filter: filters[name] } : {}) });
    off += Math.ceil(a.byteLength / 4) * 4;
  }
  let json = JSON.stringify({ meta, blobs: descs });
  while ((new TextEncoder().encode(json).length) % 4) json += ' ';
  const jb = new TextEncoder().encode(json);
  const out = new Uint8Array(12 + jb.length + off);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, 1, true); dv.setUint32(8, jb.length, true);
  out.set(jb, 12);
  const base = 12 + jb.length;
  descs.forEach((d) => { const a = blobs[d.name]; out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), base + d.offset); });
  return out;
}

export function readContainer(buf: ArrayBuffer): Container {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('format: bad magic');
  const jl = dv.getUint32(8, true);
  const { meta, blobs } = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, jl))) as { meta: any; blobs: BlobDesc[] };
  const base = 12 + jl;
  const map = new Map<string, ArrayBufferView>();
  for (const d of blobs) { const v = new CTOR[d.type](buf, base + d.offset, d.length); if (d.filter) decodeFilter(v, d.filter); map.set(d.name, v); }
  return { meta, blobs: map };
}
