/**
 * meshoptimizer index coding for our containers (src/characters/format.ts, filter 'meshopt-idx').
 *   npx tsx tools/characters/meshopt.ts <file.bin> [...]     repack in place
 * Index blobs ('idx', 'idx_*', 'localIdx' excluded: that one is a vertex list, not triangles) that
 * hold triangle lists are re-coded with the index codec (~3x smaller than gzip alone); every other
 * blob keeps its bytes and its filter. Readers `await formatReady()` before readContainer.
 */
import fs from 'node:fs';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import type { BlobFilter } from '../../src/characters/format.ts';

export async function encodeIndices(a: Uint16Array | Uint32Array): Promise<{ bytes: Uint8Array; filter: BlobFilter }> {
  await MeshoptEncoder.ready;
  const ib = a instanceof Uint32Array ? a : Uint32Array.from(a);
  const bytes = MeshoptEncoder.encodeIndexBuffer(new Uint8Array(ib.buffer, ib.byteOffset, ib.byteLength), ib.length, 4);
  return { bytes, filter: { kind: 'meshopt-idx', seg: 0, count: ib.length, as: a instanceof Uint16Array ? 'u16' : 'u32' } };
}

const MAGIC = 0x58343754;
const CT: Record<string, any> = { f32: Float32Array, i16: Int16Array, u16: Uint16Array, i8: Int8Array, u8: Uint8Array, u32: Uint32Array, i32: Int32Array };

export async function repack(file: string) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const buf = fs.readFileSync(file), ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  const dv = new DataView(ab);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error(`${file}: not a container`);
  const jl = dv.getUint32(8, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 12, jl)));
  const base = 12 + jl;
  const parts: { desc: any; bytes: Uint8Array }[] = [];
  let changed = 0;
  for (const d of head.blobs) {
    const isTri = /^idx(_|$)/.test(d.name) && (d.type === 'u16' || d.type === 'u32') && !d.filter;
    if (isTri && d.length % 3 === 0) {
      const a = new CT[d.type](ab, base + d.offset, d.length) as Uint16Array | Uint32Array;
      const { bytes, filter } = await encodeIndices(a);
      // round-trip check before trusting it
      const back = new Uint32Array(a.length);
      MeshoptDecoder.decodeIndexBuffer(new Uint8Array(back.buffer), a.length, 4, bytes);
      // the codec may rotate a triangle's corners (same winding): compare up to rotation
      for (let t = 0; t < a.length; t += 3) {
        const x = [a[t], a[t + 1], a[t + 2]], y = [back[t], back[t + 1], back[t + 2]];
        if (![0, 1, 2].some((r) => x[0] === y[r] && x[1] === y[(r + 1) % 3] && x[2] === y[(r + 2) % 3])) throw new Error(`${file}:${d.name}: round trip failed at triangle ${t / 3}`);
      }
      parts.push({ desc: { name: d.name, type: d.type, length: bytes.length, filter }, bytes });
      changed++;
    } else {
      const el = new CT[d.type](1).BYTES_PER_ELEMENT;
      parts.push({ desc: { ...d }, bytes: new Uint8Array(ab, base + d.offset, d.length * (d.filter?.kind === 'meshopt-idx' ? 1 : el)) });
    }
  }
  let off = 0;
  for (const p of parts) { p.desc.offset = off; off += Math.ceil(p.bytes.length / 4) * 4; }
  let json = JSON.stringify({ meta: head.meta, blobs: parts.map((p) => p.desc) });
  while (new TextEncoder().encode(json).length % 4) json += ' ';
  const jb = new TextEncoder().encode(json);
  const out = new Uint8Array(12 + jb.length + off), odv = new DataView(out.buffer);
  odv.setUint32(0, MAGIC, true); odv.setUint32(4, 1, true); odv.setUint32(8, jb.length, true);
  out.set(jb, 12);
  for (const p of parts) out.set(p.bytes, 12 + jb.length + p.desc.offset);
  fs.writeFileSync(file, out);
  return { changed, before: buf.length, after: out.length };
}

if (process.argv[1] && /meshopt\.ts$/.test(process.argv[1])) {
  for (const f of process.argv.slice(2)) { const r = await repack(f); console.log(f, r); }
}
