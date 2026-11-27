/**
 * Repack public/characters/anims.bin for download size (lossless): rotation tracks get a delta
 * filter along time (stride = joints x 4 quaternion components), undone at load.
 *   npx tsx tools/characters/pack-anims.ts [--write]
 * Verifies the decoded file is bit-identical to the original before writing.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readContainer, writeContainer, type BlobFilter } from '../../src/characters/format';

const file = 'public/characters/anims.bin';
const src = fs.readFileSync(file);
const ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength) as ArrayBuffer;
const c = readContainer(ab);
if (c.meta.packed) { console.log('already packed'); process.exit(0); }
const meta = { ...c.meta, packed: true };
const stride = meta.numJoints * 4;
const blobs: Record<string, ArrayBufferView> = {}, filters: Record<string, BlobFilter> = {};
for (const [n, v] of c.blobs) { blobs[n] = v; if (n.startsWith('rot_')) filters[n] = { kind: 'delta', stride, seg: (v as Int16Array).length }; }
const out = writeContainer(meta, blobs, filters);
const back = readContainer(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
for (const [n, v] of c.blobs) {
  const a = new Uint8Array((v as any).buffer, (v as any).byteOffset, (v as any).byteLength), b = back.blobs.get(n) as any, bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (a.length !== bb.length || a.some((x, i) => x !== bb[i])) { console.log('mismatch in', n); process.exit(1); }
}
const gz = (u: Uint8Array) => zlib.gzipSync(u, { level: 9 }).length;
console.log(`anims.bin gzip ${gz(src)} -> ${gz(out)} (lossless, verified)`);
if (process.argv.includes('--write')) { fs.writeFileSync(file, out); console.log('wrote', file); }
