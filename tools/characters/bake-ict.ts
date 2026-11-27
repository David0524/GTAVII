/**
 * Bake a synthesised ICT-FaceKit Light identity into a shipping head (same container as the
 * Rocketbox heads, so fitHead / headMesh / the neck conform reuse it unchanged).
 *   npx tsx tools/characters/bake-ict.ts delphine
 * Reads data/raw_ict/ict_basis.bin (build-ict.ts) and tools/characters/ict_leads.json; writes
 * public/characters/rb/lead_<name>.bin, _c.webp, _n.webp and merges the index entry.
 *
 * Only the baked head ships (positions for one hand-chosen coefficient vector); the basis never
 * does. Identities are synthesised; we never fit the model to photographs of real people.
 *
 * Kept: face, head and neck, mouth and eye sockets, gums, teeth, the eyeballs' outer shell
 * (sclera + cornea dome; the iris is painted under the dome) and the lashes. Dropped: the inner
 * iris layer, lacrimal, eye-blend and occlusion films (translucent layers we don't draw yet).
 * UVs: ICT's UDIM-style tiles are packed into one atlas (texture.py layout below).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readContainer, writeContainer } from '../../src/characters/format.ts';
import { JOINT_INDEX as JI } from '../../src/characters/rig.ts';

const name = process.argv[2];
const leads = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'ict_leads.json'), 'utf8'));
const spec = leads[name];
if (!spec) throw new Error(`no ICT lead ${name}`);
const id = `lead_${name}`;
const OUT = path.resolve(import.meta.dirname, '../../public/characters/rb');
const TMP = path.resolve(import.meta.dirname, 'scratch/ict');
fs.mkdirSync(TMP, { recursive: true });

const raw = fs.readFileSync(path.resolve(import.meta.dirname, '../../data/raw_ict/ict_basis.bin'));
const C = readContainer(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
const B = (k: string) => C.blobs.get(k) as any;
const neutral = B('neutral') as Float32Array, splitSrc = B('splitSrc') as Uint32Array, uvIn = B('uv') as Float32Array, idxIn = B('idx') as Uint32Array;
const deltas = B('deltas') as Int16Array, scales = B('scales') as Float32Array;
const nv = C.meta.numSrc as number, modes = C.meta.modes as number;
const parts = C.meta.parts as Record<string, [number, number]>;

// --- identity positions --------------------------------------------------------------------
const P = Float32Array.from(neutral);
(spec.c as number[]).forEach((w, m) => { if (!w || m >= modes) return; const s = w * scales[m], o = m * nv * 3; for (let i = 0; i < nv * 3; i++) P[i] += s * deltas[o + i]; });

let neckCutY = 0;
// --- neck length: ICT's neck runs down past the collarbones, so our body would be cut open at the
// chest. Skin below `neckCut` (metres under the eye line; spec.neckCut, default 0.125: the Rocketbox leads end ~2.3 interocular distances under the eyes, ICT ~3.1) is lifted
// onto the cut, which leaves a clean, level-ish bottom edge for the body to conform to.
{
  let ey = 0, c = 0; for (let k = parts.eyeL[0]; k < parts.eyeR[1]; k++) { ey += P[k * 3 + 1]; c++; } ey /= c;
  neckCutY = ey - (spec.neckCut ?? 0.125);
}
// skin triangles wholly below the cut are dropped (ICT's front neck flaps reach onto the chest);
// the remaining vertices below it are lifted onto it after triangle selection
const belowCut = (k: number) => k < parts.headNeck[1] && P[k * 3 + 1] < neckCutY;

// --- parts ---------------------------------------------------------------------------------
const inP = (k: number, p: string) => k >= parts[p][0] && k < parts[p][1];
type Region = 'face' | 'scalp' | 'eye' | 'teeth' | 'gums' | 'lash' | 'mouth' | 'socket' | 'occl' | null;
// eye shells: the first 770 vertices of each eye range are the outer shell (sclera + cornea)
const outerEye = (k: number) => (k >= parts.eyeL[0] && k < parts.irisL[0]) || (k >= parts.eyeR[0] && k < parts.irisR[0]);
// the mouth's back half (molars, back gums) is never seen with lips that only part a little: it
// was ~28% of the head's vertices. Teeth/gums more than 2.6 cm behind the front of the mouth go.
let mouthFrontZ = -Infinity;
for (let k = parts.teeth[0]; k < parts.teeth[1]; k++) mouthFrontZ = Math.max(mouthFrontZ, P[k * 3 + 2]);
const backOfMouth = (k: number) => P[k * 3 + 2] < mouthFrontZ - (spec.mouthDepth ?? 0.026);
const eyeCzL = (() => { let a = Infinity, b = -Infinity; for (let k = parts.eyeL[0]; k < parts.irisL[0]; k++) { a = Math.min(a, P[k * 3 + 2]); b = Math.max(b, P[k * 3 + 2]); } return (a + b) / 2; })();
const eyeCzR = (() => { let a = Infinity, b = -Infinity; for (let k = parts.eyeR[0]; k < parts.irisR[0]; k++) { a = Math.min(a, P[k * 3 + 2]); b = Math.max(b, P[k * 3 + 2]); } return (a + b) / 2; })();
const eyeCz = (k: number) => (k < parts.eyeR[0] ? eyeCzL : eyeCzR);
function regionOf(k: number, tileU: number): Region {
  if (inP(k, 'face') || inP(k, 'headNeck')) return tileU < 1 ? 'face' : 'scalp';
  if (inP(k, 'mouthSocket')) return 'mouth';
  if (inP(k, 'eyeSocketL') || inP(k, 'eyeSocketR')) return 'socket';
  if (inP(k, 'gums')) return backOfMouth(k) ? null : 'gums';
  if (inP(k, 'teeth')) return backOfMouth(k) ? null : 'teeth';
  // the back half of each eyeball sits inside the socket, never seen
  if (outerEye(k)) return P[k * 3 + 2] < eyeCz(k) - 0.004 ? null : 'eye';
  if (inP(k, 'lashesL') || inP(k, 'lashesR')) return 'lash';
  // (the eye-occlusion film is not drawn: alpha-tested it would be a hard band; the lid shadow is
  // painted into the sclera from the lid contour instead, see ict_tex.py)
  return null;
}
const REGION_CODE: Record<Exclude<Region, null>, number> = { face: 0, scalp: 1, eye: 2, teeth: 3, gums: 4, lash: 5, mouth: 6, socket: 7, occl: 8 };
// atlas cells [u0, v0, size] (v up); local [0,1] coordinates are inset so cells never bleed
const CELL: Record<string, [number, number, number]> = { face: [0, 0.5, 0.5], scalp: [0.5, 0.5, 0.5], mouth: [0.5, 0.5, 0.5], socket: [0.5, 0.5, 0.5], eye: [0, 0.25, 0.25], teeth: [0.25, 0.25, 0.25], gums: [0.5, 0.25, 0.25], lash: [0.75, 0.25, 0.25], occl: [0.75, 0, 0.25] };
const TILE_OF: Record<string, number> = { face: 0, scalp: 1, mouth: 1, socket: 1, eye: 0, teeth: 3, gums: 2, lash: 6, occl: 0 };

// --- triangles, atlas vertices ---------------------------------------------------------------
const vkey = new Map<string, number>();
const vSplit: number[] = [], vRegion: number[] = [], vUV: number[] = [], vOrig: number[] = [];
const tris: number[] = [];
for (let t = 0; t < idxIn.length; t += 3) {
  const s = [idxIn[t], idxIn[t + 1], idxIn[t + 2]];
  const cu = (uvIn[s[0] * 2] + uvIn[s[1] * 2] + uvIn[s[2] * 2]) / 3;
  const reg = regionOf(splitSrc[s[0]], Math.floor(cu));
  if (!reg || s.some((i) => regionOf(splitSrc[i], Math.floor(cu)) !== reg)) continue;
  if (s.every((i) => belowCut(splitSrc[i]))) continue;
  const [u0, v0, sz] = CELL[reg];
  let tile = TILE_OF[reg];
  if (reg === 'lash') tile = cu >= 6.5 ? 6.5 : 6; // the two lash strips share tile 6: each half fills the cell
  for (const i of s) {
    const k = `${i}|${reg}`;
    let o = vkey.get(k);
    if (o === undefined) {
      o = vSplit.length; vkey.set(k, o);
      let fu = uvIn[i * 2] - tile, fv = uvIn[i * 2 + 1];
      if (reg === 'lash') fu *= 2;
      fu = Math.min(1, Math.max(0, fu)); fv = Math.min(1, Math.max(0, fv));
      vSplit.push(i); vRegion.push(REGION_CODE[reg]);
      vUV.push(u0 + (0.006 + 0.988 * fu) * sz, v0 + (0.006 + 0.988 * fv) * sz);
      vOrig.push(uvIn[i * 2], uvIn[i * 2 + 1]);
    }
    tris.push(o);
  }
}
const n = vSplit.length;
for (const k of new Set(vSplit.map((i) => splitSrc[i]))) if (belowCut(k)) P[k * 3 + 1] = neckCutY;
// relaxed upper lids: ICT's neutral holds the eyes wide open (sclera above the iris). The upper lid
// margin and the skin above it (falloff over ~9 mm) and the upper lashes drop by spec.lidDrop
// (default 1.3 mm), so the lid rests on the top of the iris as in a relaxed gaze.
{
  const drop = spec.lidDrop ?? 0.0013;
  const faceEdge = new Map<number, number>();
  for (let t = 0; t < tris.length; t += 3) {
    if (vRegion[tris[t]] !== REGION_CODE.face) continue;
    for (let e = 0; e < 3; e++) { const a = splitSrc[vSplit[tris[t + e]]], b = splitSrc[vSplit[tris[t + (e + 1) % 3]]]; const k = Math.min(a, b) * nv + Math.max(a, b); faceEdge.set(k, (faceEdge.get(k) ?? 0) + 1); }
  }
  for (const [e0, e1] of [[parts.eyeL[0], parts.irisL[0]], [parts.eyeR[0], parts.irisR[0]]]) {
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let k = e0; k < e1; k++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], P[k * 3 + a]); mx[a] = Math.max(mx[a], P[k * 3 + a]); }
    const c = [0, 1, 2].map((a) => (mn[a] + mx[a]) / 2);
    const margin: number[][] = [];
    for (const [k, cnt] of faceEdge) if (cnt === 1) for (const q of [Math.floor(k / nv), k % nv]) if (Math.hypot(P[q * 3] - c[0], P[q * 3 + 1] - c[1]) < 0.02 && P[q * 3 + 1] > c[1] + 0.001 && P[q * 3 + 2] > c[2]) margin.push([P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]);
    if (!margin.length) continue;
    const span = Math.max(...margin.map((m) => m[0])) - Math.min(...margin.map((m) => m[0])), cx = (Math.max(...margin.map((m) => m[0])) + Math.min(...margin.map((m) => m[0]))) / 2;
    const moved = new Set<number>();
    for (const i of vSplit) {
      const k = splitSrc[i];
      if (moved.has(k) || !(inP(k, 'face') || inP(k, 'lashesL') || inP(k, 'lashesR'))) continue;
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      if (y < c[1] || z < c[2] - 0.004 || Math.abs(x - c[0]) > 0.022) continue;
      let d = Infinity; for (const m of margin) d = Math.min(d, Math.hypot(x - m[0], y - m[1], z - m[2]));
      const along = 1 - Math.min(1, Math.abs(x - cx) / (span / 2)) ** 2; // most at the middle of the lid
      const w = (1 - Math.min(1, d / 0.009)) ** 2 * along;
      if (w > 0) { P[k * 3 + 1] -= drop * w; moved.add(k); }
    }
  }
}
// lash triangles go last: they are alpha cards (kind 1, the head material's card branch)
{
  const skin: number[] = [], cards: number[] = [];
  for (let t = 0; t < tris.length; t += 3) (vRegion[tris[t]] === REGION_CODE.lash || vRegion[tris[t]] === REGION_CODE.occl ? cards : skin).push(tris[t], tris[t + 1], tris[t + 2]);
  tris.length = 0; for (const x of skin) tris.push(x); for (const x of cards) tris.push(x);
  var nSkinIdx = skin.length;
}
const kind = Uint8Array.from(vRegion, (r) => (r === REGION_CODE.lash || r === REGION_CODE.occl ? 1 : 0));
const pos = new Float32Array(n * 3);
for (let v = 0; v < n; v++) { const k = splitSrc[vSplit[v]]; for (let a = 0; a < 3; a++) pos[v * 3 + a] = P[k * 3 + a]; }

// normals per source vertex (UV seams share them)
const nAcc = new Float64Array(nv * 3);
for (let t = 0; t < tris.length; t += 3) {
  const k = [0, 1, 2].map((e) => splitSrc[vSplit[tris[t + e]]]);
  const p = k.map((q) => [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]);
  const e1 = [0, 1, 2].map((a) => p[1][a] - p[0][a]), e2 = [0, 1, 2].map((a) => p[2][a] - p[0][a]);
  const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  for (const q of new Set(k)) for (let a = 0; a < 3; a++) nAcc[q * 3 + a] += cr[a];
}
const nrm = new Float32Array(n * 3);
for (let v = 0; v < n; v++) { const k = splitSrc[vSplit[v]]; const l = Math.hypot(nAcc[k * 3], nAcc[k * 3 + 1], nAcc[k * 3 + 2]) || 1; for (let a = 0; a < 3; a++) nrm[v * 3 + a] = nAcc[k * 3 + a] / l; }

// --- landmarks (topology picks: ICT's face tile is a frontal layout, so UV points are stable) ---
const src3 = (k: number) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
function atFaceUV(u: number, v: number) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < splitSrc.length; i++) { if (!inP(splitSrc[i], 'face')) continue; const d = (uvIn[i * 2] - u) ** 2 + (uvIn[i * 2 + 1] - v) ** 2; if (d < bd) { bd = d; best = i; } }
  return src3(splitSrc[best]);
}
function centre(a: number, b: number) { const c = [0, 0, 0]; let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let k = a; k < b; k++) for (let x = 0; x < 3; x++) { mn[x] = Math.min(mn[x], P[k * 3 + x]); mx[x] = Math.max(mx[x], P[k * 3 + x]); } for (let x = 0; x < 3; x++) c[x] = (mn[x] + mx[x]) / 2; return c; }
const LEye = centre(parts.eyeL[0], parts.irisL[0]), REye = centre(parts.eyeR[0], parts.irisR[0]);
const eyeY = (LEye[1] + REye[1]) / 2, eyeZ = (LEye[2] + REye[2]) / 2;
const MNose = atFaceUV(0.5, 0.6), MUpperLip = atFaceUV(0.5, 0.447), MBottomLip = atFaceUV(0.5, 0.415), MJaw = atFaceUV(0.5, 0.3);
const LMouthCorner = atFaceUV(0.555, 0.431), RMouthCorner = atFaceUV(0.445, 0.431), LCheek = atFaceUV(0.68, 0.6), RCheek = atFaceUV(0.32, 0.6);
const mouthY = (MUpperLip[1] + MBottomLip[1]) / 2;

// bottom boundary loop of the skin (source topology, so UV seams don't count as edges)
const edgeCount = new Map<number, number>();
for (let t = 0; t < tris.length; t += 3) {
  if (vRegion[tris[t]] > 1) continue;
  for (let e = 0; e < 3; e++) { const a = splitSrc[vSplit[tris[t + e]]], b = splitSrc[vSplit[tris[t + (e + 1) % 3]]]; const k = Math.min(a, b) * nv + Math.max(a, b); edgeCount.set(k, (edgeCount.get(k) ?? 0) + 1); }
}
const loop = new Set<number>();
for (const [k, c] of edgeCount) if (c === 1) for (const q of [Math.floor(k / nv), k % nv]) if (P[q * 3 + 1] < eyeY - 0.12) loop.add(q);
const lc = [0, 0, 0]; for (const q of loop) for (let a = 0; a < 3; a++) lc[a] += P[q * 3 + a] / loop.size;
const Neck = [lc[0], lc[1] + 0.03, lc[2]];
const Head = [(LEye[0] + REye[0]) / 2, eyeY + 0.02, eyeZ - 0.075];
const RING = 16;
const ringY = new Float64Array(RING), ringR = new Float64Array(RING), ringN = new Float64Array(RING);
for (const q of loop) {
  const x = P[q * 3] - Neck[0], z = P[q * 3 + 2] - Neck[2];
  const a = Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * RING) % RING;
  ringY[a] += P[q * 3 + 1]; ringR[a] += Math.hypot(x, z); ringN[a]++;
}
const fillRing = (s: Float64Array) => {
  const r = Array.from(s, (v, a) => (ringN[a] ? v / ringN[a] : NaN));
  for (let it = 0; it < RING; it++) for (let a = 0; a < RING; a++) if (Number.isNaN(r[a])) { const l = r[(a + RING - 1) % RING], rr = r[(a + 1) % RING]; r[a] = Number.isNaN(l) ? rr : Number.isNaN(rr) ? l : (l + rr) / 2; }
  return r.map((y, a) => (r[(a + RING - 1) % RING] + 2 * y + r[(a + 1) % RING]) / 4);
};
const neckRing = [...fillRing(ringY), ...fillRing(ringR)];
// eye openings: boundary vertices of the face skin within 2 cm of each eye centre (the lid margins)
const lids: { L: number[][]; R: number[][] } = { L: [], R: [] };
for (const [k, c] of edgeCount) if (c === 1) for (const q of [Math.floor(k / nv), k % nv]) {
  if (!inP(q, 'face')) continue;
  for (const [side, e] of [['L', LEye], ['R', REye]] as const) if (Math.hypot(P[q * 3] - e[0], P[q * 3 + 1] - e[1]) < 0.02 && Math.abs(P[q * 3 + 2] - e[2]) < 0.03) lids[side].push([P[q * 3], P[q * 3 + 1], P[q * 3 + 2]]);
}

// --- skin weights (no rig in ICT Light: by region) ------------------------------------------
const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sj = new Uint8Array(n * 4), sw = new Uint8Array(n * 4);
const earZ = Math.min(LEye[2], REye[2]) - 0.075;
for (let v = 0; v < n; v++) {
  const k = splitSrc[vSplit[v]], [x, y, z] = src3(k), r = vRegion[v];
  const w: Record<number, number> = {};
  if (r === REGION_CODE.eye) w[x > 0 ? JI.eye_l : JI.eye_r] = 1;
  else if (r === REGION_CODE.teeth || r === REGION_CODE.gums || r === REGION_CODE.mouth) w[y < mouthY ? JI.jaw : JI.Head] = 1;
  else if (r === REGION_CODE.lash || r === REGION_CODE.socket || r === REGION_CODE.occl) w[JI.Head] = 1;
  else {
    // neck below the jaw line (front: under the chin; back: below the occiput)
    const front = ss(earZ - 0.02, earZ + 0.04, z);
    const yTop = (MJaw[1] - 0.02) * front + (eyeY - 0.1) * (1 - front);
    const wn = ss(yTop, yTop - 0.05, y);
    const wj = (1 - wn) * ss(mouthY - 0.004, mouthY - 0.016, y) * ss(earZ, earZ + 0.05, z);
    if (wn > 0) w[JI.neck_01] = wn;
    if (wj > 0) w[JI.jaw] = wj;
    const wh = 1 - wn - wj; if (wh > 0) w[JI.Head] = wh;
  }
  const e = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = e.reduce((s, [, x]) => s + x, 0);
  e.forEach(([j, x], c) => { sj[v * 4 + c] = +j; sw[v * 4 + c] = Math.round((x / tot) * 255); });
}

// --- quantise and write ---------------------------------------------------------------------
const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let v = 0; v < n; v++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[v * 3 + a]); mx[a] = Math.max(mx[a], pos[v * 3 + a]); }
const qp = new Uint16Array(n * 3);
for (let v = 0; v < n; v++) for (let a = 0; a < 3; a++) qp[v * 3 + a] = Math.round(((pos[v * 3 + a] - mn[a]) / (mx[a] - mn[a])) * 65535);
const qn = Int8Array.from(nrm, (x) => Math.round(x * 127));
const quv = Uint16Array.from(vUV, (x) => Math.round(x * 65535));
let neckMinY = Infinity; for (let v = 0; v < n; v++) if (vRegion[v] <= 1) neckMinY = Math.min(neckMinY, pos[v * 3 + 1]);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const meta = {
  id, source: 'ICT-FaceKit Light, synthesised identity', licence: 'MIT (ICT-FaceKit, Copyright (c) 2020 USC Institute for Creative Technologies)', lead: id,
  bbox: { min: mn, max: mx }, skinIdx: nSkinIdx, cardIdx: tris.length - nSkinIdx,
  skinRGB: hex(spec.tone), neckRGB: hex(spec.tone), neckMinY, neckRing,
  landmarks: { Head, Neck, LEye, REye, MNose, MJaw, LCheek, RCheek, MUpperLip, MBottomLip, LMouthCorner, RMouthCorner },
  tag: null, coef: spec.c, packed: true,
};


// --- textures (procedural; texture.py) -------------------------------------------------------
const job = {
  size: spec.texSize ?? 2048, out: path.join(OUT, id), tone: spec.tone, brow: spec.brow ?? '#141010', iris: spec.iris ?? '#2a1a10', lip: spec.lip ?? null, seed: spec.seed ?? 7,
  uv: vUV, orig: vOrig, region: vRegion, pos: Array.from(pos), tris,
  eyes: { L: LEye, R: REye }, lids, eyeY, mouthY,
};
const jf = path.join(TMP, `${id}.json`);
fs.writeFileSync(jf, JSON.stringify(job));
execFileSync('python3', ['-I', path.resolve(import.meta.dirname, 'ict_tex.py'), jf], { stdio: 'inherit' });
const hairJ = JSON.parse(fs.readFileSync(path.join(OUT, `${id}_hair.json`), 'utf8'));
const blob = writeContainer(meta, { pos: qp, nrm: qn, uv: quv, sj, sw, kind, hair: Uint8Array.from(hairJ.hair), brow: Uint8Array.from(hairJ.brow), idx: n < 65536 ? Uint16Array.from(tris) : Uint32Array.from(tris) },
  // vertex order follows first use in the triangle list, so deltas are small and gzip well
  { pos: { kind: 'delta3', seg: n * 3 }, nrm: { kind: 'delta3', seg: n * 3 }, uv: { kind: 'delta', seg: n * 2, stride: 2 }, idx: { kind: 'delta', seg: tris.length, stride: 1 } });
fs.writeFileSync(path.join(OUT, `${id}.bin`), blob);
fs.rmSync(path.join(OUT, `${id}_hair.json`));
const sizes = { c: fs.statSync(path.join(OUT, `${id}_c.webp`)).size, n: fs.statSync(path.join(OUT, `${id}_n.webp`)).size, o: fs.statSync(path.join(OUT, `${id}_o.webp`)).size };
const bytes = blob.length + sizes.c + sizes.n + sizes.o;

const idxFile = path.join(OUT, 'index.json');
const index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
index.heads = [...index.heads.filter((h: any) => h.id !== id), { id, source: meta.source, bytes, tag: null, skinRGB: meta.skinRGB, lead: id, ownHair: spec.ownHair ?? true }];
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
console.log(id, 'verts', n, 'tris', tris.length / 3, 'bin', blob.length, 'tex', sizes, 'total KB', (bytes / 1024).toFixed(0), 'eyes', LEye.map((x) => x.toFixed(3)), 'neck', Neck.map((x) => x.toFixed(3)));
