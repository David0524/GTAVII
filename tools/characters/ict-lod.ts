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
// flags: --topo <id> simplify on that head's bake (same vertex set: the pool's neutral) and apply the
// result here; --inplace replace <id> itself (pool heads ship only the light mesh)
const argv = process.argv.slice(2), flag = (k: string) => { const i = argv.indexOf(k); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const inplace = argv.includes('--inplace'); if (inplace) argv.splice(argv.indexOf('--inplace'), 1);
const topoId = flag('--topo'), shared = flag('--shared');
const [srcId, tgtArg, outArg] = argv;
const target = Number(tgtArg ?? 10000), outId = inplace ? srcId : outArg ?? `${srcId}_l1`;
await formatReady(); await MeshoptSimplifier.ready;

const readHead = (hid: string) => {
  const buf = fs.readFileSync(path.join(OUT, `${hid}.bin`));
  const c = readContainer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const qp = c.blobs.get('pos') as Uint16Array, n = qp.length / 3, mm = c.meta.bbox;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) for (let a = 0; a < 3; a++) pos[v * 3 + a] = mm.min[a] + (qp[v * 3 + a] / 65535) * (mm.max[a] - mm.min[a]);
  return { c, n, pos };
};
const self = readHead(srcId), c = self.c, meta = c.meta, B = (k: string) => c.blobs.get(k) as any;
if (meta.lod) throw new Error(`${srcId} is already a LOD`);
const idx: Uint16Array | Uint32Array = B('idx'), quv: Uint16Array = B('uv');
const n = self.n;
// the simplifier runs on the topology source (itself unless --topo)
const topo = topoId ? readHead(topoId) : self;
if (topo.n !== n) throw new Error(`--topo ${topoId}: ${topo.n} vertices, ${srcId} has ${n} (not the same bake topology)`);
const T = (k: string) => topo.c.blobs.get(k) as any;
{ const a = T('idx') as ArrayLike<number>, tu = T('uv') as Uint16Array; for (let i = 0; i < a.length; i++) if (a[i] !== idx[i]) throw new Error(`--topo ${topoId}: index differs at ${i}`); for (let i = 0; i < tu.length; i++) if (tu[i] !== quv[i]) throw new Error(`--topo ${topoId}: uv differs at ${i}`); }
const pos = topo.pos;
const uv = Float32Array.from(quv, (x) => x / 65535);

const skin = Uint32Array.from(idx.subarray(0, meta.skinIdx)), cards = Array.from(idx.subarray(meta.skinIdx));
// lock: vertices on the mesh border (neck cut, mouth/eye openings) and position-sharing UV seam twins
const edge = new Map<string, number>();
for (let t = 0; t < skin.length; t += 3) for (let e = 0; e < 3; e++) { const a = skin[t + e], b = skin[t + (e + 1) % 3]; const k = a < b ? `${a},${b}` : `${b},${a}`; edge.set(k, (edge.get(k) ?? 0) + 1); }
const lock = new Uint8Array(n);
for (const [k, cnt] of edge) if (cnt === 1) for (const q of k.split(',')) lock[+q] = 1;
let nLock = 0; for (let v = 0; v < n; v++) nLock += lock[v];

// attributes: UV, plus the scalp-hair and brow weights (the runtime grows hair/brow shells from them,
// so their edges must survive; without them the hairline steps and the brows thicken)
const hw: Uint8Array = T('hair'), bw: Uint8Array = T('brow');
const AW = Number(process.env.LOD_AW ?? 1.0);
const attr = new Float32Array(n * 4);
for (let v = 0; v < n; v++) { attr[v * 4] = uv[v * 2]; attr[v * 4 + 1] = uv[v * 2 + 1]; attr[v * 4 + 2] = hw ? hw[v] / 255 : 0; attr[v * 4 + 3] = bw ? bw[v] / 255 : 0; }
const [simp, err] = MeshoptSimplifier.simplifyWithAttributes(skin, pos, 3, attr, 4, [1.0, 1.0, AW, AW], lock, Math.min(target * 3, skin.length), target * 3 >= skin.length ? 0 : 0.01, []);
console.log(srcId, topoId ? `(topology of ${topoId})` : '', 'skin tris', skin.length / 3, '->', simp.length / 3, 'rel err', err.toFixed(5), 'abs err mm', (err * MeshoptSimplifier.getScale(pos, 3) * 1000).toFixed(2), 'locked', nLock);

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
// --shared <name>: what every head of this topology has in common (uv, kind, idx) goes to <name>.bin,
// written once and downloaded once; the head keeps positions, skin weights and hair/brow weights,
// and its normals are rebuilt at load (welded across UV seams; rocketbox.ts loadHead)
let sharedBytes = 0;
if (shared) {
  const sFile = path.join(OUT, `${shared}.bin`);
  const sBlobs = { uv: out.uv, kind: out.kind, idx: out.idx };
  if (fs.existsSync(sFile)) {
    const sb = fs.readFileSync(sFile), sc = readContainer(sb.buffer.slice(sb.byteOffset, sb.byteOffset + sb.length));
    for (const [k, v] of Object.entries(sBlobs)) { const o = sc.blobs.get(k) as any, a = v as any; if (!o || o.length !== a.length) throw new Error(`${shared}: ${k} differs from ${srcId} (rebuild the pool)`); const same = k === 'idx' // the index codec may rotate a triangle's corners
        ? (i: number) => { const t = i - (i % 3); return [0, 1, 2].some((r) => o[t] === a[t + r] && o[t + 1] === a[t + (r + 1) % 3] && o[t + 2] === a[t + (r + 2) % 3]); }
        : (i: number) => o[i] === a[i];
      for (let i = 0; i < a.length; i++) if (!same(i)) throw new Error(`${shared}: ${k} differs from ${srcId} at ${i}`); }
  } else {
    fs.writeFileSync(sFile, writeContainer({ id: shared, shared: true, skinIdx: simp.length, cardIdx: cards.length, verts: m, licence: meta.licence }, sBlobs, { uv: { kind: 'delta', seg: m * 2, stride: 2 } }));
    await repack(sFile);
  }
  sharedBytes = fs.statSync(sFile).size;
  delete out.uv; delete out.kind; delete out.idx; delete out.nrm;
}
const nm = { ...meta, id: outId, skinIdx: simp.length, cardIdx: cards.length, lod: { of: srcId, err, topo: topoId ?? srcId }, ...(shared ? { shared } : {}) };
const blob = writeContainer(nm, out, { pos: { kind: 'delta3', seg: m * 3 }, ...(out.nrm ? { nrm: { kind: 'delta3', seg: m * 3 } } : {}), ...(out.uv ? { uv: { kind: 'delta', seg: m * 2, stride: 2 } } : {}) });
const file = path.join(OUT, `${outId}.bin`);
fs.writeFileSync(file, blob); await repack(file);
const bytes = fs.statSync(file).size;
if (shared) console.log('shared', shared, sharedBytes, 'bytes');
console.log(outId, 'verts', n, '->', m, 'tris', all.length / 3, 'bin bytes', bytes);

const idxFile = path.join(OUT, 'index.json');
const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
const src = index.heads.find((h: any) => h.id === srcId);
const texBytes = ['c', 'n', 'o'].reduce((t, m) => t + (fs.existsSync(path.join(OUT, `${srcId}_${m}.webp`)) ? fs.statSync(path.join(OUT, `${srcId}_${m}.webp`)).size : 0), 0);
index.heads = inplace ? index.heads.map((h: any) => (h.id === srcId ? { ...h, bytes: bytes + texBytes } : h))
  : [...index.heads.filter((h: any) => h.id !== outId), { ...src, id: outId, lead: null, tex: src.tex ?? srcId, lodOf: srcId, bytes }];
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
void encodeFilter;
