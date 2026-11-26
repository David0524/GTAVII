/**
 * "T74X" container used for character data files (body.bin, anims.bin): a JSON header with
 * named, typed, 4-byte-aligned blobs. Written by tools/characters, read by the runtime.
 *   u32 magic 'T74X' | u32 version | u32 jsonBytes | json (utf8, space-padded to 4) | blobs
 */
export type BlobType = 'f32' | 'i16' | 'u16' | 'i8' | 'u8' | 'u32' | 'i32';
export interface BlobDesc { name: string; type: BlobType; offset: number; length: number }
export interface Container { meta: any; blobs: Map<string, ArrayBufferView> }

const MAGIC = 0x58343754; // 'T74X'
const CTOR = { f32: Float32Array, i16: Int16Array, u16: Uint16Array, i8: Int8Array, u8: Uint8Array, u32: Uint32Array, i32: Int32Array } as const;
const typeOf = (a: ArrayBufferView): BlobType => {
  if (a instanceof Float32Array) return 'f32'; if (a instanceof Int16Array) return 'i16'; if (a instanceof Uint16Array) return 'u16';
  if (a instanceof Int8Array) return 'i8'; if (a instanceof Uint8Array) return 'u8'; if (a instanceof Uint32Array) return 'u32';
  if (a instanceof Int32Array) return 'i32'; throw new Error('format: unsupported blob type');
};

export function writeContainer(meta: any, blobs: Record<string, ArrayBufferView>): Uint8Array {
  const descs: BlobDesc[] = [];
  let off = 0;
  for (const [name, a] of Object.entries(blobs)) {
    descs.push({ name, type: typeOf(a), offset: off, length: (a as unknown as { length: number }).length });
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
  for (const d of blobs) map.set(d.name, new CTOR[d.type](buf, base + d.offset, d.length));
  return { meta, blobs: map };
}
