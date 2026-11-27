/**
 * Mobile/Low download: derives public/characters/body_low.bin from body.bin by keeping only the
 * vertices the Low LODs use (body LOD 3–4, helpers LOD 2–3, eye helpers for sizing, regressors),
 * the first 32 macro components, and the local targets restricted to that subset.
 *   npx tsx tools/characters/build-low.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { readContainer, writeContainer } from '../../src/characters/format.ts';

const DIR = path.resolve(import.meta.dirname, '../../public/characters');
const buf = fs.readFileSync(path.join(DIR, 'body.bin'));
const c = readContainer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const meta = c.meta, B = (n: string) => c.blobs.get(n) as any;
const groups: string[] = meta.groups;
const KEEP: Record<string, number[]> = { body: [3, 4], 'helper-tights': [2, 3], 'helper-skirt': [2, 3], 'helper-hair': [2, 3], 'helper-l-eye': [0, 2], 'helper-r-eye': [0, 2], 'helper-upper-teeth': [], 'helper-lower-teeth': [], lashes: [] };
const splitSrc: Uint16Array = B('splitSrc');
const NK = meta.numSrc as number;
const keepSplit = new Uint8Array(splitSrc.length), keepSrc = new Uint8Array(NK);
const lodBlobs: Record<string, Uint16Array> = {};
groups.forEach((g, gi) => { for (const l of KEEP[g] ?? []) { const ix = B(`idx_${gi}_${l}`) as Uint16Array; lodBlobs[`idx_${gi}_${l}`] = ix; for (const s of ix) { keepSplit[s] = 1; keepSrc[splitSrc[s]] = 1; } } });
for (const j of meta.joints) for (const k of j.reg) keepSrc[k] = 1;
for (const ids of Object.values(meta.landmarks as Record<string, number[]>)) for (const k of ids) keepSrc[k] = 1;
// splits for kept src that aren't referenced by kept triangles are dropped; build remaps
const srcMap = new Int32Array(NK).fill(-1); let ns = 0;
for (let k = 0; k < NK; k++) if (keepSrc[k]) srcMap[k] = ns++;
const splitMap = new Int32Array(splitSrc.length).fill(-1); let nsp = 0;
for (let s = 0; s < splitSrc.length; s++) if (keepSplit[s]) splitMap[s] = nsp++;
const pick = <T extends { length: number; constructor: any }>(a: T, per: number, map: Int32Array, n: number): T => { const o = new a.constructor(n * per); for (let i = 0; i < map.length; i++) if (map[i] >= 0) for (let c2 = 0; c2 < per; c2++) o[map[i] * per + c2] = (a as any)[i * per + c2]; return o; };
const K = 32, K16 = meta.macro.K16 as number, Kfull = meta.macro.K as number;
const D = NK * 3, Dn = ns * 3;
const b16: Int16Array = B('basis16'), b8: Int8Array = B('basis8');
const nb16 = new Int16Array(K16 * Dn), nb8 = new Int8Array((K - K16) * Dn);
for (let k = 0; k < K; k++) for (let v = 0; v < NK; v++) { const m = srcMap[v]; if (m < 0) continue; for (let c2 = 0; c2 < 3; c2++) { if (k < K16) nb16[k * Dn + m * 3 + c2] = b16[k * D + v * 3 + c2]; else nb8[(k - K16) * Dn + m * 3 + c2] = b8[(k - K16) * D + v * 3 + c2]; } }
const P: Float32Array = B('macroP'); const nP = new Float32Array((P.length / Kfull) * K);
for (let i = 0; i < P.length / Kfull; i++) for (let k = 0; k < K; k++) nP[i * K + k] = P[i * Kfull + k];
// locals: restrict entries
const li: Uint16Array = B('localIdx'), ld: Int8Array = B('localD');
const nli: number[] = [], nld: number[] = [];
let off = 0;
const locals = (meta.locals as { name: string; count: number; scale: number }[]).filter((d) => !d.name.startsWith('expression/')).map((d) => d);
const all = meta.locals as { name: string; count: number; scale: number }[];
const newLocals: typeof all = [];
for (const d of all) {
  const start = off; off += d.count;
  if (!locals.includes(d)) continue;
  let n = 0;
  for (let i = start; i < start + d.count; i++) { const m = srcMap[li[i]]; if (m < 0) continue; nli.push(m); nld.push(ld[i * 3], ld[i * 3 + 1], ld[i * 3 + 2]); n++; }
  if (n) newLocals.push({ ...d, count: n });
}
const blobs: Record<string, ArrayBufferView> = {
  basePos: pick(B('basePos'), 3, srcMap, ns), splitSrc: Uint16Array.from(Array.from(splitSrc).filter((_, s) => keepSplit[s]).map((k) => srcMap[k])),
  splitUV: pick(B('splitUV'), 2, splitMap, nsp), splitGroup: pick(B('splitGroup'), 1, splitMap, nsp),
  skinJ: pick(B('skinJ'), 4, srcMap, ns), skinW: pick(B('skinW'), 4, srcMap, ns), limbSeg: pick(B('limbSeg'), 1, srcMap, ns), limbT: pick(B('limbT'), 1, srcMap, ns), limbA: pick(B('limbA'), 1, srcMap, ns),
  macroP: nP, basis16: nb16, basis8: nb8, basisScale: (B('basisScale') as Float32Array).slice(0, K),
  localIdx: Uint16Array.from(nli), localD: Int8Array.from(nld),
};
for (const [k, ix] of Object.entries(lodBlobs)) blobs[k] = Uint16Array.from(Array.from(ix).map((s) => splitMap[s]));
const nmeta = {
  ...meta, numSrc: ns, numSplit: nsp, macro: { ...meta.macro, K }, locals: newLocals, lowSubset: true,
  joints: meta.joints.map((j: any) => ({ ...j, reg: j.reg.map((k: number) => srcMap[k]) })),
  landmarks: Object.fromEntries(Object.entries(meta.landmarks as Record<string, number[]>).map(([k, ids]) => [k, ids.map((i) => srcMap[i])])),
  availableLods: Object.fromEntries(groups.map((g) => [g, KEEP[g] ?? []])),
};
const out = writeContainer(nmeta, blobs);
fs.writeFileSync(path.join(DIR, 'body_low.bin'), out);
console.log('body_low.bin', (out.length / 1048576).toFixed(2), 'MiB', 'src', ns, 'split', nsp, 'locals', newLocals.length);
