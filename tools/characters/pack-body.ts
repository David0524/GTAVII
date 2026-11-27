/**
 * Repack public/characters/body.bin for download size (the size pass):
 *   npx tsx tools/characters/pack-body.ts [--file=public/characters/body_low.bin] [--keep=4] [--write]
 * - the int16 PCA components are requantised to int8 with per-component scales (folded into
 *   basisScale), so the whole macro basis is one int8 block;
 * - that block and the local-target deltas are stored with the delta3 filter (per-axis deltas
 *   between consecutive vertices), which gzip compresses far better;
 * - checks accuracy: 200 generated bodies evaluated with the old and new data, max and mean
 *   vertex error reported (the pass is refused if the max exceeds 1.5 mm).
 * Without --write it only reports.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import { readContainer, writeContainer } from '../../src/characters/format';
import { BodyModel } from '../../src/characters/body/BodyModel';
import { generateAppearance } from '../../src/characters/body/appearance';

const file = process.argv.find((a) => a.startsWith('--file='))?.slice(7) ?? 'public/characters/body.bin';
const src = fs.readFileSync(file);
const ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
const c = readContainer(ab);
const meta = structuredClone(c.meta);
const { K, K16 } = meta.macro;
const b16 = c.blobs.get('basis16') as Int16Array, b8 = c.blobs.get('basis8') as Int8Array, bs = c.blobs.get('basisScale') as Float32Array;
const D = b8.length / (K - K16);
if (meta.packed) { console.log('already packed'); process.exit(0); }
meta.packed = true;
// keep the leading (largest-variance) components at int16; requantise the rest to int8
const keep = Number(process.argv.find((a) => a.startsWith("--keep="))?.slice(7) ?? 4); // 4: max 0.46 mm, mean 0.08 mm
const basis = new Int8Array((K - keep) * D), scale = Float32Array.from(bs);
for (let k = keep; k < K16; k++) {
  let mx = 0; for (let i = 0; i < D; i++) mx = Math.max(mx, Math.abs(b16[k * D + i]));
  const s = mx / 127 || 1;
  for (let i = 0; i < D; i++) basis[(k - keep) * D + i] = Math.round(b16[k * D + i] / s);
  scale[k] = bs[k] * s;
}
basis.set(b8, (K16 - keep) * D);
meta.macro.K16 = keep;
const blobs: Record<string, ArrayBufferView> = {};
for (const [n, v] of c.blobs) blobs[n] = v;
blobs.basis16 = b16.slice(0, keep * D); blobs.basis8 = basis; blobs.basisScale = scale;
const out = writeContainer(meta, blobs, { basis8: { kind: 'delta3', seg: D }, basis16: { kind: 'delta3', seg: D } });

// accuracy: the same 200 bodies with old and new data
const oldM = new BodyModel(ab), newM = new BodyModel(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer);
let maxE = 0, sumE = 0, n = 0;
for (let i = 0; i < 200; i++) {
  const a = generateAppearance((i * 2654435761) >>> 0);
  const p0 = oldM.evaluate({ ...a.body, stature: a.stature }).pos, p1 = newM.evaluate({ ...a.body, stature: a.stature }).pos;
  for (let v = 0; v < p0.length; v += 3) { const e = Math.hypot(p0[v] - p1[v], p0[v + 1] - p1[v + 1], p0[v + 2] - p1[v + 2]); maxE = Math.max(maxE, e); sumE += e; n++; }
}
const gz = (u: Uint8Array) => zlib.gzipSync(u, { level: 9 }).length;
console.log(`body.bin raw ${src.length} -> ${out.length}; gzip ${gz(src)} -> ${gz(out)}; vertex error max ${(maxE * 1000).toFixed(2)} mm, mean ${(sumE / n * 1000).toFixed(3)} mm`);
if (maxE > 0.0015) { console.log('refused: error above 1.5 mm'); process.exit(1); }
if (process.argv.includes('--write')) { fs.writeFileSync(file, out); console.log('wrote', file); }
