/**
 * Lossless second step of the body size pass (after pack-body.ts): the local-target index list
 * gets a delta filter (stride 1; sorted per target) and the local deltas a delta3 filter.
 *   npx tsx tools/characters/pack-locals.ts --file=public/characters/body.bin [--write]
 * Re-applies the basis filters, and verifies every decoded blob is bit-identical.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readContainer, formatReady, writeContainer, type BlobFilter } from '../../src/characters/format';
import { repack } from './meshopt.ts';
await formatReady(); // meshopt-coded index blobs

const file = process.argv.find((a) => a.startsWith('--file='))?.slice(7) ?? 'public/characters/body.bin';
const src = fs.readFileSync(file);
const raw = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
const c = readContainer(raw);
if (!c.meta.packed) { console.log('run pack-body.ts first'); process.exit(1); }
if (c.meta.packedLocals) { console.log('already packed'); process.exit(0); }
// the existing blob filters (from the file's own header) are kept
const jl = new DataView(raw).getUint32(8, true);
const header = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 12, jl))) as { blobs: { name: string; filter?: BlobFilter }[] };
const filters: Record<string, BlobFilter> = {};
for (const d of header.blobs) if (d.filter) filters[d.name] = d.filter;
const blobs: Record<string, ArrayBufferView> = {};
for (const [n, v] of c.blobs) blobs[n] = v;
filters.localIdx = { kind: 'delta', stride: 1, seg: (blobs.localIdx as Uint16Array).length };
filters.localD = { kind: 'delta3', seg: (blobs.localD as Int8Array).length };
const out = writeContainer({ ...c.meta, packedLocals: true }, blobs, filters);
const back = readContainer(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
for (const [n, v] of c.blobs) {
  const a = new Uint8Array((v as any).buffer, (v as any).byteOffset, (v as any).byteLength), b = back.blobs.get(n) as any, bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (a.length !== bb.length || a.some((x, i) => x !== bb[i])) { console.log('mismatch in', n); process.exit(1); }
}
const gz = (u: Uint8Array) => zlib.gzipSync(u, { level: 9 }).length;
console.log(`${file} gzip ${gz(src)} -> ${gz(out)} (lossless, verified)`);
if (process.argv.includes('--write')) { fs.writeFileSync(file, out); console.log('wrote', file, await repack(file)); }
