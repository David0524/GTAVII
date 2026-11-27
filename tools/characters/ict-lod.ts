/**
 * Lighter ICT head for the near ring: meshoptimizer's simplifier over a baked lead head.
 *   npx tsx tools/characters/ict-lod.ts <id> [targetTris=10000] [outId=<id>_l1]
 * Skin triangles are simplified with UV as an attribute (seams and the neck border locked, so the
 * head still meets the body's neck profile); lash cards are kept as they are. Unused vertices are
 * dropped. The simplifier collapses onto existing vertices only, so the index subset it picks is a
 * valid topology for every identity of the same bake (the shared near-ring pool topology).
 * Textures are shared with the source head (`tex` in index.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer';
import { readContainer, writeContainer, formatReady, encodeFilter } from '../../src/characters/format.ts';
import { repack } from './meshopt.ts';

const OUT = path.resolve(import.meta.dirname, '../../public/characters/rb');
const [srcId, tgtArg, outArg] = process.argv.slice(2);
const target = Number(tgtArg ?? 10000), outId = outArg ?? `${srcId}_l1`;
await formatReady(); await MeshoptSimplifier.ready;

const buf = fs.readFileSync(path.join(OUT, `${srcId}.bin`));
const c = readContainer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const meta = c.meta, B = (k: string) => c.blobs.get(k) as any;
const qp: Uint16Array = B('pos'), idx: Uint16Array | Uint32Array = B('idx'), quv: Uint16Array = B('uv');
const n = qp.length / 3;
const pos = new Float32Array(n * 3);
for (let v = 0; v < n; v++) for (let a = 0; a < 3; a++) pos[v * 3 + a] = meta.bbox.min[a] + (qp[v * 3 + a] / 65535) * (meta.bbox.max[a] - meta.bbox.min[a]);
const uv = Float32Array.from(quv, (x) => x / 65535);

const skin = Uint32Array.from(idx.subarray(0, meta.skinIdx)), cards = Array.from(idx.subarray(meta.skinIdx));
// lock: vertices on the mesh border (neck cut, mouth/eye openings) and position-sharing UV seam twins
const edge = new Map<string, number>();
for (let t = 0; t < skin.length; t += 3) for (let e = 0; e < 3; e++) { const a = skin[t + e], b = skin[t + (e + 1) % 3]; const k = a < b ? `${a},${b}` : `${b},${a}`; edge.set(k, (edge.get(k) ?? 0) + 1); }
const lock = new Uint8Array(n);
for (const [k, cnt] of edge) if (cnt === 1) for (const q of k.split(',')) lock[+q] = 1;
let nLock = 0; for (let v = 0; v < n; v++) nLock += lock[v];

const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(skin, pos, 3, uv, 2, [1.0, 1.0], lock, target * 3, 0.01, []);
console.log(srcId, 'skin tris', skin.length / 3, '->', simp.length / 3, 'rel err', err.toFixed(5), 'abs err mm', (err * MeshoptSimplifier.getScale(pos, 3) * 1000).toFixed(2), 'locked', nLock);

// compact
const all = [...simp, ...cards];
const remap = new Int32Array(n).fill(-1); const order: number[] = [];
for (const v of all) if (remap[v] < 0) { remap[v] = order.length; order.push(v); }
const m = order.length;
const pick = (a: any, w: number) => { const o = new a.constructor(m * w); for (let i = 0; i < m; i++) for (let k = 0; k < w; k++) o[i * w + k] = a[order[i] * w + k]; return o; };
const out: Record<string, ArrayBufferView> = {};
for (const [name, arr] of c.blobs) {
  if (name === 'idx') continue;
  const w = (arr as any).length / n;
  if (Number.isInteger(w) && w >= 1 && w <= 4) out[name] = pick(arr, w); else throw new Error(`${name}: not per-vertex (${w})`);
}
const nidx = all.map((v) => remap[v]);
out.idx = m < 65536 ? Uint16Array.from(nidx) : Uint32Array.from(nidx);
const nm = { ...meta, id: outId, skinIdx: simp.length, cardIdx: cards.length, lod: { of: srcId, err } };
const blob = writeContainer(nm, out, { pos: { kind: 'delta3', seg: m * 3 }, nrm: { kind: 'delta3', seg: m * 3 }, uv: { kind: 'delta', seg: m * 2, stride: 2 } });
const file = path.join(OUT, `${outId}.bin`);
fs.writeFileSync(file, blob); await repack(file);
const bytes = fs.statSync(file).size;
console.log(outId, 'verts', n, '->', m, 'tris', all.length / 3, 'bin bytes', bytes);

const idxFile = path.join(OUT, 'index.json');
const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
const src = index.heads.find((h: any) => h.id === srcId);
index.heads = [...index.heads.filter((h: any) => h.id !== outId), { ...src, id: outId, tex: src.tex ?? srcId, lodOf: srcId, bytes }];
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
void encodeFilter;
