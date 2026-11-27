/**
 * Offline build of the parametric human: MakeHuman CC0 base mesh + targets → public/characters/body.bin
 *   npx tsx tools/characters/build-body.ts
 *
 * Outputs (one T74X container):
 *   - split mesh (per-corner UV seams), group ids, triangle index buffers per group and LOD
 *   - skin weights on our rig (src/characters/rig.ts), joint and landmark regressors
 *   - macro body space: a PCA basis fitted to sampled bodies + a target→coefficient matrix
 *   - local (sparse) targets: face, measurements, body shapes, asymmetry, expressions
 *   - per-vertex limb params (segment joint, position along it, angle around it) for garments
 * See docs/CHARACTER_SOURCES.md for provenance and licences.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadSources, MH_SCALE, type Target } from './sources.ts';
import { symEig } from './lib/linalg.ts';
import { simplify } from './lib/simplify.ts';
import { writeContainer } from '../../src/characters/format.ts';
import { JOINTS, JOINT_INDEX, LANDMARKS, NUM_JOINTS, primaryChild } from '../../src/characters/rig.ts';
import { macroTargetNames, macroTargetWeights, type MacroParams } from '../../src/characters/body/macro.ts';
import { repack } from './meshopt.ts';

const OUT = path.resolve(import.meta.dirname, '../../public/characters');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const S = loadSources();
log('sources', S.targets.size, 'targets');

// ---------------------------------------------------------------------------------------------
// 1. Groups and kept vertices
export const GROUPS = ['body', 'helper-tights', 'helper-skirt', 'helper-hair', 'helper-l-eye', 'helper-r-eye', 'helper-upper-teeth', 'helper-lower-teeth', 'lashes'] as const;
const groupOf = (g: string) => (/eyelashes/.test(g) ? 8 : (GROUPS as readonly string[]).indexOf(g));
const faces = S.obj.faces.filter((f) => groupOf(f.group) >= 0);
const NSRC = S.obj.v.length / 3;
const keepSrc = new Uint8Array(NSRC);
for (const f of faces) for (const v of f.v) keepSrc[v] = 1;
const jointVerts = (names: string[]) => names.flatMap((n) => { const l = S.skel.joints[n]; if (!l) throw new Error(`no joint ${n}`); return l; });
for (const j of JOINTS) for (const v of jointVerts(j.mhHead)) keepSrc[v] = 1;
for (const l of Object.values(LANDMARKS)) for (const v of jointVerts(l)) keepSrc[v] = 1;
// child joints used for bone directions (tails of leaves)
const compactOf = new Int32Array(NSRC).fill(-1);
const srcOf: number[] = [];
for (let v = 0; v < NSRC; v++) if (keepSrc[v]) { compactOf[v] = srcOf.length; srcOf.push(v); }
const NK = srcOf.length;
log('kept src verts', NK);

const basePos = new Float32Array(NK * 3);
for (let i = 0; i < NK; i++) for (let c = 0; c < 3; c++) basePos[i * 3 + c] = S.obj.v[srcOf[i] * 3 + c] * MH_SCALE;

// ---------------------------------------------------------------------------------------------
// 2. Split mesh by UV
const splitKey = new Map<number, number>();
const splitSrc: number[] = [], splitUV: number[] = [], splitGroup: number[] = [];
const groupTris: number[][] = GROUPS.map(() => []);
for (const f of faces) {
  const g = groupOf(f.group);
  const ids = f.v.map((v, k) => {
    const t = f.t[k];
    const key = v * 65536 + (t + 1);
    let s = splitKey.get(key);
    if (s === undefined) { s = splitSrc.length; splitKey.set(key, s); splitSrc.push(compactOf[v]); splitUV.push(S.obj.vt[t * 2] ?? 0, S.obj.vt[t * 2 + 1] ?? 0); splitGroup.push(g); }
    return s;
  });
  if (ids.length === 3) groupTris[g].push(ids[0], ids[1], ids[2]);
  else {
    const p = (s: number) => splitSrc[s] * 3;
    const d02 = Math.hypot(...[0, 1, 2].map((c) => basePos[p(ids[0]) + c] - basePos[p(ids[2]) + c]));
    const d13 = Math.hypot(...[0, 1, 2].map((c) => basePos[p(ids[1]) + c] - basePos[p(ids[3]) + c]));
    if (d02 <= d13) groupTris[g].push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    else groupTris[g].push(ids[0], ids[1], ids[3], ids[1], ids[2], ids[3]);
  }
}
const NS = splitSrc.length;
log('split verts', NS, 'tris per group', groupTris.map((t) => t.length / 3).join(' '));

// ---------------------------------------------------------------------------------------------
// 3. Skin weights mapped onto our rig
const boneToJoint = new Map<string, number>();
for (const [j, def] of JOINTS.entries()) for (const b of def.mhBones) boneToJoint.set(b, j);
const resolveBone = (b: string): number => {
  let cur: string | null = b;
  while (cur) { const j = boneToJoint.get(cur); if (j !== undefined) return j; cur = S.skel.bones[cur]?.parent ?? null; }
  return JOINT_INDEX.pelvis;
};
const srcW: Map<number, number>[] = Array.from({ length: NK }, () => new Map());
for (const [bone, list] of Object.entries(S.weights)) {
  const j = resolveBone(bone);
  for (const [v, w] of list) { const k = compactOf[v]; if (k < 0) continue; const m = srcW[k]; m.set(j, (m.get(j) || 0) + w); }
}
const skinJ = new Uint8Array(NK * 4), skinW = new Uint8Array(NK * 4);
for (let k = 0; k < NK; k++) {
  const e = [...srcW[k].entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  if (!e.length) e.push([JOINT_INDEX.pelvis, 1]);
  const s = e.reduce((a, b) => a + b[1], 0);
  // quantise to bytes summing exactly to 255
  // largest-remainder rounding so the bytes always sum to exactly 255 (never negative)
  const raw = e.map(([, w]) => (w / s) * 255);
  const q = raw.map(Math.floor);
  let rem = 255 - q.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - q[i], i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rem > 0) { q[i]++; rem--; } });
  e.forEach(([j], i) => { skinJ[k * 4 + i] = j; skinW[k * 4 + i] = q[i]; });
}

// ---------------------------------------------------------------------------------------------
// 4. Regressors (joint/landmark positions = centroid of compact vertex lists)
const regressor = (names: string[]) => jointVerts(names).map((v) => compactOf[v]);
const jointReg = JOINTS.map((j) => (j.mhHead.length ? regressor(j.mhHead) : []));
const landmarkReg = Object.fromEntries(Object.entries(LANDMARKS).map(([k, v]) => [k, regressor(v)]));
const centroid = (pos: Float32Array, ids: number[]) => { const o = [0, 0, 0]; for (const i of ids) for (let c = 0; c < 3; c++) o[c] += pos[i * 3 + c] / ids.length; return o; };
const restJoints = jointReg.map((ids) => (ids.length ? centroid(basePos, ids) : [0, 0, 0]));
restJoints[0] = [restJoints[1][0], Math.min(centroid(basePos, landmarkReg.heel_l)[1], centroid(basePos, landmarkReg.toe_tip_l)[1]), restJoints[1][2]];

// ---------------------------------------------------------------------------------------------
// 5. Limb params per compact vertex: segment joint, t along bone, angle around bone
const SEGMENT_OF = (j: number): number => {
  const n = JOINTS[j].name;
  if (/^(thumb|index|middle|ring|pinky)_/.test(n)) return JOINT_INDEX[`hand_${n.slice(-1)}`];
  if (n === 'jaw' || n.startsWith('eye_')) return JOINT_INDEX.Head;
  if (n === 'root') return JOINT_INDEX.pelvis;
  return j;
};
const limbSeg = new Uint8Array(NK), limbT = new Uint8Array(NK), limbA = new Uint8Array(NK);
const vertical = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']);
for (let k = 0; k < NK; k++) {
  // dominant segment
  const acc = new Map<number, number>();
  for (const [j, w] of srcW[k]) { const s = SEGMENT_OF(j); acc.set(s, (acc.get(s) || 0) + w); }
  let seg = JOINT_INDEX.pelvis, best = -1;
  for (const [s, w] of acc) if (w > best) { best = w; seg = s; }
  limbSeg[k] = seg;
  const p = [basePos[k * 3], basePos[k * 3 + 1], basePos[k * 3 + 2]];
  const a = restJoints[seg];
  let axis: number[];
  const name = JOINTS[seg].name;
  if (vertical.has(name)) axis = [0, 1, 0];
  else {
    const c = primaryChild(seg);
    const b = c >= 0 ? restJoints[c] : name.startsWith('ball') ? centroid(basePos, landmarkReg[`toe_tip_${name.slice(-1)}`]) : [a[0], a[1] + 0.1, a[2]];
    axis = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  }
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  const ax = axis.map((x) => x / len);
  const d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  let t = (d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]) / len;
  if (vertical.has(name)) {
    // vertical segments: t along to the next joint up
    const c = name === 'Head' ? centroid(basePos, landmarkReg.head_top) : restJoints[primaryChild(seg)];
    t = (p[1] - a[1]) / Math.max(1e-3, c[1] - a[1]);
  }
  limbT[k] = Math.max(0, Math.min(255, Math.round((t + 0.5) / 2 * 255)));
  // angle around the axis, measured from the projected forward (+Z) direction
  const fwd = [0, 0, 1];
  const fd = fwd[0] * ax[0] + fwd[1] * ax[1] + fwd[2] * ax[2];
  let f = [fwd[0] - ax[0] * fd, fwd[1] - ax[1] * fd, fwd[2] - ax[2] * fd];
  if (Math.hypot(f[0], f[1], f[2]) < 1e-3) f = [0, 1, 0];
  const fl = Math.hypot(f[0], f[1], f[2]); f = f.map((x) => x / fl);
  const r = [ax[1] * f[2] - ax[2] * f[1], ax[2] * f[0] - ax[0] * f[2], ax[0] * f[1] - ax[1] * f[0]];
  const dd = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
  const q = [d[0] - ax[0] * dd, d[1] - ax[1] * dd, d[2] - ax[2] * dd];
  const ang = Math.atan2(q[0] * r[0] + q[1] * r[1] + q[2] * r[2], q[0] * f[0] + q[1] * f[1] + q[2] * f[2]);
  limbA[k] = Math.round(((ang / (2 * Math.PI)) + 1) % 1 * 255);
}

// ---------------------------------------------------------------------------------------------
// 6. Macro body space: PCA of sampled bodies
const macroNames = macroTargetNames();
const macroT = macroNames.map((n) => S.targets.get(n) ?? null);
const missing = macroNames.filter((_, i) => !macroT[i]);
if (missing.length) log('macro targets missing (treated as zero):', missing.length);
const D = NK * 3;
const dense = (t: Target | null, w = 1, into?: Float32Array) => {
  const a = into ?? new Float32Array(D);
  if (!t) return a;
  const s = w * 1e-3 * MH_SCALE;
  for (let i = 0; i < t.idx.length; i++) { const k = compactOf[t.idx[i]]; if (k < 0) continue; a[k * 3] += t.d[i * 3] * s; a[k * 3 + 1] += t.d[i * 3 + 1] * s; a[k * 3 + 2] += t.d[i * 3 + 2] * s; }
  return a;
};
let seed = 12345;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const sampleParams = (): MacroParams => {
  const r = [rnd(), rnd(), rnd()].map((x) => -Math.log(x + 1e-9));
  const b = () => Math.min(1, Math.max(0, 0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.45));
  return { sex: rnd() < 0.85 ? (rnd() < 0.5 ? 0 : 1) : rnd(), age: 11 + rnd() * 79, muscle: b(), weight: b(), height: b(), proportions: 0.3 + rnd() * 0.5, african: r[0], asian: r[1], caucasian: r[2] };
};
const sampleBody = (p: MacroParams) => { const w = macroTargetWeights(p); const a = new Float32Array(D); w.forEach((wi, i) => { if (wi > 1e-6) dense(macroT[i], wi, a); }); return a; };
const NSAMP = 600, K = 64;
const X = Array.from({ length: NSAMP }, () => sampleBody(sampleParams()));
const G = new Float64Array(NSAMP * NSAMP);
for (let i = 0; i < NSAMP; i++) for (let j = i; j < NSAMP; j++) { let s = 0; const a = X[i], b = X[j]; for (let k = 0; k < D; k++) s += a[k] * b[k]; G[i * NSAMP + j] = G[j * NSAMP + i] = s; }
log('gram');
const eig = symEig(G, NSAMP);
const basis: Float32Array[] = [];
for (let k = 0; k < K; k++) {
  const s = Math.sqrt(Math.max(eig.values[k], 1e-30));
  const b = new Float32Array(D);
  for (let j = 0; j < NSAMP; j++) { const w = eig.vectors[j * NSAMP + k] / s; if (w === 0) continue; const xj = X[j]; for (let d = 0; d < D; d++) b[d] += w * xj[d]; }
  basis.push(b);
}
log('pca basis', K);
// target → coefficient matrix
const P = new Float32Array(macroNames.length * K);
macroT.forEach((t, i) => { if (!t) return; const x = dense(t); for (let k = 0; k < K; k++) { let c = 0; const b = basis[k]; for (let d = 0; d < D; d++) c += b[d] * x[d]; P[i * K + k] = c; } });
// quantise: first 16 components int16, the rest int8, per-component scales
const K16 = 16;
const basis16 = new Int16Array(K16 * D), basis8 = new Int8Array((K - K16) * D), basisScale = new Float32Array(K);
for (let k = 0; k < K; k++) {
  let m = 0; for (const x of basis[k]) m = Math.max(m, Math.abs(x));
  const q = k < K16 ? 32767 : 127; basisScale[k] = m / q;
  const dst = k < K16 ? basis16 : basis8, off = (k < K16 ? k : k - K16) * D;
  for (let d = 0; d < D; d++) dst[off + d] = Math.round(basis[k][d] / basisScale[k]);
}
// holdout error (with quantisation)
{
  const errs: number[] = [];
  for (let n = 0; n < 60; n++) {
    const p = sampleParams(); const x = sampleBody(p); const w = macroTargetWeights(p);
    const coef = new Float32Array(K); w.forEach((wi, i) => { if (wi) for (let k = 0; k < K; k++) coef[k] += wi * P[i * K + k]; });
    let m = 0;
    for (let v = 0; v < NK; v++) {
      let e = 0;
      for (let c = 0; c < 3; c++) { const d = v * 3 + c; let r = 0; for (let k = 0; k < K; k++) r += coef[k] * basisScale[k] * (k < K16 ? basis16[k * D + d] : basis8[(k - K16) * D + d]); e += (r - x[d]) ** 2; }
      m = Math.max(m, Math.sqrt(e));
    }
    errs.push(m * 1000);
  }
  errs.sort((a, b) => a - b);
  log(`macro holdout error mm: median ${errs[30].toFixed(2)} p90 ${errs[54].toFixed(2)} max ${errs[59].toFixed(2)}`);
}

// ---------------------------------------------------------------------------------------------
// 7. Local sparse targets
const LOCAL_GROUPS = ['head', 'forehead', 'eyebrows', 'neck', 'eyes', 'nose', 'mouth', 'ears', 'chin', 'cheek', 'torso', 'hip', 'stomach', 'buttocks', 'armslegs', 'measure', 'asym', 'breast'];
/** Kept for size: the body/face variety they add is covered by the macro space or other targets. */
const DROP = [
  /pregnant|nipple|genital|penis|bulge/,
  /^torso\/torso-(trans|scale-vert)/, /^head\/head-trans/, /^neck\/neck-trans/, /^hip\/hip-trans/,
  /^measure\/measure-(napetowaist|waisttohip|frontchest|wrist|ankle|knee|lowerarm-length|upperarm-length|neck-height)/,
  /^armslegs\/.*-(trans-|scale-depth|scale-horiz|scale-vert|fingers-distance|fingers-diameter)/,
  /^asym\/asym-(top|temple|ear-[34]|eye-[3-8]|nose-[34]|jaw-[23]|mouth-2|cheek-2|brown-2)/, /^asym\/asymm-breast/,
];
const localNames: string[] = [];
for (const name of [...S.targets.keys()].sort()) {
  const g = name.split('/')[0];
  if (!LOCAL_GROUPS.includes(g)) continue;
  if (DROP.some((r) => r.test(name))) continue;
  if (g === 'breast' && /(cup|firmness)/.test(name) && !/^breast\/female-(young|old)-averagemuscle-averageweight-(min|max)cup-averagefirmness$/.test(name)) continue;
  if (!S.targets.get(name)!.idx.length) continue;
  localNames.push(name);
}
/** Symmetric l-/r- pairs (except asymmetry targets) are merged into one target: name with "l-"/"r-" → "lr-". */
const symKey = (n: string) => (n.startsWith('asym/') ? n : n.replace(/\/(l|r)-/, '/lr-'));
const localGroups = new Map<string, string[]>();
for (const n of localNames) { const k = symKey(n); if (!localGroups.has(k)) localGroups.set(k, []); localGroups.get(k)!.push(n); }
// expressions: the "units" exist for two ancestry variants; we average them into one set
const exprUnits = [...new Set([...S.targets.keys()].filter((k) => k.startsWith('expression/units/')).map((k) => k.split('/').pop()!))].sort();
const localDefs: { name: string; count: number; scale: number }[] = [];
const localIdx: number[] = [], localD: number[] = [];
const pushLocal = (name: string, a: Float32Array) => {
  const ids: number[] = []; let m = 0;
  for (let k = 0; k < NK; k++) { const l = Math.hypot(a[k * 3], a[k * 3 + 1], a[k * 3 + 2]); if (l > 6e-5) { ids.push(k); m = Math.max(m, Math.abs(a[k * 3]), Math.abs(a[k * 3 + 1]), Math.abs(a[k * 3 + 2])); } }
  if (!ids.length) return;
  const scale = m / 127;
  localDefs.push({ name, count: ids.length, scale });
  for (const k of ids) { localIdx.push(k); for (let c = 0; c < 3; c++) localD.push(Math.round(a[k * 3 + c] / scale)); }
};
for (const [k, ns] of localGroups) { const a = new Float32Array(D); for (const n of ns) dense(S.targets.get(n)!, 1, a); pushLocal(k, a); }
for (const u of exprUnits) {
  const vs = [...S.targets.keys()].filter((k) => k.startsWith('expression/units/') && k.endsWith('/' + u));
  const a = new Float32Array(D); for (const k of vs) dense(S.targets.get(k)!, 1 / vs.length, a);
  pushLocal(`expression/${u}`, a);
}
log('local targets', localDefs.length, 'entries', localIdx.length);

// ---------------------------------------------------------------------------------------------
// 8. LODs (welded topology per group, seams + boundaries locked)
const splitsOfSrc: number[][] = Array.from({ length: NK }, () => []);
for (let s = 0; s < NS; s++) splitsOfSrc[splitSrc[s]].push(s);
const importance = new Float32Array(NK).fill(1);
for (let k = 0; k < NK; k++) {
  const n = JOINTS[skinJ[k * 4]].name;
  if (n === 'Head' || n === 'jaw' || n.startsWith('eye')) importance[k] = 8;
  else if (n === 'neck_01') importance[k] = 2;
  else if (/hand|thumb|index|middle|ring|pinky/.test(n)) importance[k] = 3;
}
// body has 5 levels (full, 15k hero, 7k near crowd, 2.6k mid, 900 far); helpers have 4
const LOD_TARGETS: Record<number, number[]> = { 0: [15000, 7000, 2600, 900], 1: [2600, 1100, 420], 2: [800, 380, 160], 3: [500, 220, 0] };
const lodIndex: Record<string, Uint16Array> = {};
const lodMeta: Record<string, number[]> = {};
for (let g = 0; g < GROUPS.length; g++) {
  const full = groupTris[g];
  const counts = [full.length / 3];
  lodIndex[`idx_${g}_0`] = Uint16Array.from(full);
  const targets = LOD_TARGETS[g] ?? [full.length / 3, g === 8 ? 0 : full.length / 3, 0];
  // welded
  const wTris = Uint32Array.from(full.map((s) => splitSrc[s]));
  const locked = new Uint8Array(NK);
  for (let k = 0; k < NK; k++) if (splitsOfSrc[k].length > 1) locked[k] = 1;
  for (let l = 1; l <= targets.length; l++) {
    const target = targets[l - 1];
    let out: number[];
    if (target === 0) out = [];
    else if (target >= full.length / 3) out = full;
    else {
      const res = simplify({ pos: basePos, tris: wTris, locked: l >= targets.length ? undefined : locked, importance, targetTris: target });
      // map welded corners back to split vertices (nearest UV to the original corner)
      out = [];
      const triUV = (s: number) => [splitUV[s * 2], splitUV[s * 2 + 1]];
      // index: for each surviving welded tri, find an original tri sharing ≥1 corner to pick the island UV
      for (let t = 0; t < res.length; t += 3) {
        const corners = [res[t], res[t + 1], res[t + 2]];
        // island reference: pick any split of a non-seam corner if possible
        let ref: number[] | null = null;
        for (const c of corners) if (splitsOfSrc[c].length === 1) { ref = triUV(splitsOfSrc[c][0]); break; }
        for (const c of corners) {
          const cand = splitsOfSrc[c].filter((s) => splitGroup[s] === g);
          let best = cand[0], bd = Infinity;
          if (ref) for (const s of cand) { const uv = triUV(s); const d = (uv[0] - ref[0]) ** 2 + (uv[1] - ref[1]) ** 2; if (d < bd) { bd = d; best = s; } }
          out.push(best);
        }
      }
    }
    lodIndex[`idx_${g}_${l}`] = Uint16Array.from(out);
    counts.push(out.length / 3);
  }
  lodMeta[GROUPS[g]] = counts;
  log('lod', GROUPS[g], counts.join(' / '));
}

// ---------------------------------------------------------------------------------------------
// 9. Write
const meta = {
  version: 1,
  source: 'MakeHuman 1.x CC0 assets (base mesh, targets, default skeleton + weights); our build',
  groups: GROUPS, numSrc: NK, numSplit: NS, numJoints: NUM_JOINTS,
  joints: JOINTS.map((j, i) => ({ name: j.name, parent: j.parent, reg: jointReg[i] })),
  landmarks: landmarkReg,
  macro: { names: macroNames, K, K16 },
  locals: localDefs,
  lods: lodMeta,
  restJoints,
};
const blobs: Record<string, ArrayBufferView> = {
  basePos, splitSrc: Uint16Array.from(splitSrc), splitUV: Float32Array.from(splitUV), splitGroup: Uint8Array.from(splitGroup),
  skinJ, skinW, limbSeg, limbT, limbA,
  macroP: P, basis16, basis8, basisScale,
  localIdx: Uint16Array.from(localIdx), localD: Int8Array.from(localD),
  ...lodIndex,
};
const bin = writeContainer(meta, blobs);
fs.writeFileSync(path.join(OUT, 'body.bin'), bin);
await repack(path.join(OUT, 'body.bin')); // meshopt index coding
log('wrote body.bin', (bin.length / 1048576).toFixed(2), 'MiB');
for (const [k, v] of Object.entries(blobs)) if (v.byteLength > 200000) log('  ', k, (v.byteLength / 1048576).toFixed(2), 'MiB');
