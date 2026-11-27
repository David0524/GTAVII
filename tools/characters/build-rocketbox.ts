/**
 * Microsoft Rocketbox heads (MIT; docs/CHARACTER_SOURCES.md §6) for the near ring and the leads.
 * Adults only: the library's Children folder is never read.
 *
 *   npx tsx tools/characters/build-rocketbox.ts --repo /home/user/microsoft/microsoft-rocketbox [--pool] [--leads] [--only id,id]
 *
 * Per head: the head piece (skin, eyes, teeth, lashes, hair cards) extracted by bone dominance,
 * welded and quantised, skinned to our Head / jaw / eyes / neck; facial landmarks (bone positions)
 * for fitting and for the leads' feature edits; tags for matching (sex, age, ancestry, hair).
 * Leads (rb_leads.json) get landmark-driven feature deformations and Lab colour transfer so each
 * is its own character, not the stock face.
 * Output: public/characters/rb/<id>.bin, <id>_c.webp (colour), <id>_n.webp (normal), <id>_o.webp
 * (hair/lash cards, RGBA), and public/characters/rb/index.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeContainer } from '../../src/characters/format.ts';
import { JOINT_INDEX as JI } from '../../src/characters/rig.ts';

(globalThis as any).document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {} }) };
(globalThis as any).window = globalThis; (globalThis as any).self = globalThis;
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); } as any;

const args = process.argv.slice(2);
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const repo = opt('--repo')!;
const only = opt('--only')?.split(',');
const OUT = path.resolve(import.meta.dirname, '../../public/characters/rb');
const TMP = path.resolve(import.meta.dirname, 'scratch/rb');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(TMP, { recursive: true });

/**
 * The near-ring pool, tagged by eye from the library's previews (sex, apparent age band, broad
 * ancestry weights african/asian/caucasian for matching our generated bodies, hair category).
 * Excluded: heads whose mesh includes headwear implausible on 1974 Midtown streets (hijab,
 * burqa, keffiyeh, hood up), and the heads used as the leads' bases (Male_Adult_07, Male_Adult_14,
 * Female_Party_02): no pedestrian shares a lead's base face. Tags were checked against the
 * library's own preview renders (the adult library has no woman who reads as Black).
 */
interface Tag { sex: 0 | 1; age: [number, number]; anc: [number, number, number]; hair: 'short' | 'long' | 'curly' | 'bald' | 'tied' }
const POOL: Record<string, Tag> = {
  Female_Adult_01: { sex: 0, age: [22, 40], anc: [0, 0, 1], hair: 'tied' },
  Female_Adult_02: { sex: 0, age: [35, 55], anc: [0, 0, 1], hair: 'tied' },
  Female_Adult_03: { sex: 0, age: [20, 40], anc: [0, 0.8, 0.2], hair: 'long' },
  Female_Adult_04: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'short' },
  Female_Adult_05: { sex: 0, age: [22, 40], anc: [0, 0.1, 0.9], hair: 'long' },
  Female_Adult_07: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'tied' },
  Female_Adult_08: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'long' },
  Female_Adult_09: { sex: 0, age: [35, 55], anc: [0, 0, 1], hair: 'tied' },
  Female_Adult_11: { sex: 0, age: [20, 35], anc: [0, 1, 0], hair: 'tied' },
  Female_Adult_12: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'long' },
  Female_Adult_13: { sex: 0, age: [20, 40], anc: [0, 0, 1], hair: 'short' },
  Female_Adult_14: { sex: 0, age: [20, 40], anc: [0, 0, 1], hair: 'long' },
  Female_Adult_15: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'long' },
  Female_Adult_17: { sex: 0, age: [20, 40], anc: [0, 0, 1], hair: 'tied' },
  Female_Party_01: { sex: 0, age: [20, 35], anc: [0, 0, 1], hair: 'curly' },
  Male_Adult_01: { sex: 1, age: [20, 35], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_02: { sex: 1, age: [25, 40], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_03: { sex: 1, age: [58, 75], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_04: { sex: 1, age: [22, 40], anc: [0.7, 0, 0.3], hair: 'curly' },
  Male_Adult_05: { sex: 1, age: [50, 70], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_06: { sex: 1, age: [22, 40], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_08: { sex: 1, age: [22, 40], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_09: { sex: 1, age: [22, 40], anc: [0, 1, 0], hair: 'short' },
  Male_Adult_10: { sex: 1, age: [20, 35], anc: [0, 0.6, 0.4], hair: 'short' },
  Male_Adult_11: { sex: 1, age: [20, 35], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_12: { sex: 1, age: [25, 45], anc: [1, 0, 0], hair: 'short' },
  Male_Adult_13: { sex: 1, age: [45, 65], anc: [0, 0, 1], hair: 'bald' },
  Male_Adult_15: { sex: 1, age: [25, 45], anc: [0.1, 0.5, 0.4], hair: 'short' },
  Male_Adult_16: { sex: 1, age: [20, 35], anc: [0, 0, 1], hair: 'short' },
  Male_Adult_17: { sex: 1, age: [22, 40], anc: [0.1, 0.5, 0.4], hair: 'short' },
  Male_Adult_20: { sex: 1, age: [25, 45], anc: [0, 0, 1], hair: 'short' },
};

interface DeformOp { at: string; radius: number; scale?: [number, number, number]; offset?: [number, number, number]; mirror?: boolean }
interface LeadSpec { id: string; base: string; skinTarget: string; hairTarget?: string; deform: DeformOp[]; hairScale?: number; texSize?: number; ownHair?: boolean }

const mapBone = (n: string): number => {
  const b = n.replace('Bip01_', '');
  if (b === 'MJaw' || b === 'MBottomLip' || b === 'MTongue' || b === 'LMouthBottom' || b === 'RMouthBottom') return JI.jaw;
  if (b === 'LEye') return JI.eye_l;
  if (b === 'REye') return JI.eye_r;
  if (b === 'Neck') return JI.neck_01;
  if (b === 'Spine2' || b === 'Spine1' || b === 'Spine' || b.includes('Clavicle')) return JI.spine_03;
  return JI.Head;
};
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function build(name: string, id: string, texC: number, texN: number, lead?: LeadSpec) {
  const dir = path.join(repo, 'Assets/Avatars/Adults', name);
  if (dir.includes('/Children/')) throw new Error('adults only');
  const buf = fs.readFileSync(path.join(dir, 'Export', `${name}.fbx`));
  const g = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '');
  g.updateMatrixWorld(true);
  let mesh: any = null; g.traverse((o: any) => { if (o.isSkinnedMesh) mesh = o; });
  const geo = mesh.geometry, mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m: any) => m.name as string);
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const bm = mesh.bindMatrix, nm = new THREE.Matrix3().getNormalMatrix(bm);
  const bones = mesh.skeleton.bones as any[];
  const S = 0.01;
  const lm: Record<string, number[]> = {};
  for (const b of bones) { const v = new THREE.Vector3(); b.getWorldPosition(v); lm[b.name.replace('Bip01_', '')] = v.multiplyScalar(S).toArray(); }
  const headish = (v: number) => { let w = 0; for (let c = 0; c < 4; c++) { const b = bones[SI.getComponent(v, c)].name.replace('Bip01_', ''); if (!/^(Spine|Spine1|Spine2|Pelvis)$/.test(b) && !b.includes('Clavicle')) w += SW.getComponent(v, c); } return w; };
  // weld identical corners (FBX splits every corner)
  const key = new Map<string, number>();
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], sj: number[] = [], sw: number[] = [], kind: number[] = [];
  const idx: number[] = [];
  let nSkin = 0;
  for (const pass of [0, 1]) for (const gr of geo.groups) {
    const mname = mats[gr.materialIndex];
    const isOp = mname.endsWith('_opacity'), isHead = mname.endsWith('_head');
    if (pass === 0 ? !isHead : !isOp) continue;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const tri = [0, 1, 2].map((k) => (geo.index ? geo.index.getX(i + k) : i + k));
      if (tri.some((v) => headish(v) < 0.5)) continue;
      for (const v of tri) {
        const p = new THREE.Vector3(P.getX(v), P.getY(v), P.getZ(v)).applyMatrix4(bm).multiplyScalar(S);
        const n = new THREE.Vector3(N.getX(v), N.getY(v), N.getZ(v)).applyMatrix3(nm).normalize();
        const k = `${pass}|${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}|${Math.round(UV.getX(v) * 4096)},${Math.round(UV.getY(v) * 4096)}|${Math.round(n.x * 20)},${Math.round(n.y * 20)},${Math.round(n.z * 20)}`;
        let o = key.get(k);
        if (o === undefined) {
          o = pos.length / 3; key.set(k, o);
          pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(UV.getX(v), UV.getY(v)); kind.push(pass);
          const js: number[] = [], ws: number[] = [];
          for (let c = 0; c < 4; c++) { const w = SW.getComponent(v, c); if (w <= 0) continue; const j = mapBone(bones[SI.getComponent(v, c)].name); const at = js.indexOf(j); if (at >= 0) ws[at] += w; else { js.push(j); ws.push(w); } }
          const tw = ws.reduce((a, b) => a + b, 0) || 1;
          for (let c = 0; c < 4; c++) { sj.push(js[c] ?? 0); sw.push((ws[c] ?? 0) / tw); }
        }
        idx.push(o);
      }
      if (pass === 0) nSkin += 3;
    }
  }
  const nv = pos.length / 3;
  // --- leads: feature deformations (smooth falloff around landmarks) and cropped hair ---------
  if (lead) {
    for (const op of lead.deform) {
      const sides = op.mirror ? [op.at.replace(/^R/, 'L'), op.at.replace(/^L/, 'R')] : [op.at];
      for (const at of sides) {
        const c = lm[at]; if (!c) throw new Error(`no landmark ${at}`);
        const sx = at.startsWith('R') && op.mirror ? -1 : 1;
        for (let v = 0; v < nv; v++) {
          const d = Math.hypot(pos[v * 3] - c[0], pos[v * 3 + 1] - c[1], pos[v * 3 + 2] - c[2]);
          if (d >= op.radius) continue;
          const t = 1 - d / op.radius, w = t * t * (3 - 2 * t);
          for (let a = 0; a < 3; a++) {
            const rel = pos[v * 3 + a] - c[a];
            let dv = 0;
            if (op.scale) dv += rel * (op.scale[a] - 1);
            if (op.offset) dv += op.offset[a] * (a === 0 ? sx : 1);
            pos[v * 3 + a] += dv * w;
          }
        }
      }
    }
    if (lead.hairScale) {
      // cropped hair: cards scale toward the head centre; hair *volume* modelled in the head mesh
      // (anything beyond the skull, above the brow) is compressed onto a thin layer over the skull
      const hc = [lm.Head[0], lm.Head[1] + 0.03, lm.Head[2] - 0.01], skull = 0.1, browY = (lm.LEye[1] + lm.REye[1]) / 2 + 0.02;
      for (let v = 0; v < nv; v++) {
        const d = Math.hypot(pos[v * 3] - hc[0], pos[v * 3 + 1] - hc[1], pos[v * 3 + 2] - hc[2]);
        // hair cards only (eyelash cards sit below the brow and stay where they are)
        if (kind[v] === 1) { if (pos[v * 3 + 1] > browY - 0.01) for (let a = 0; a < 3; a++) pos[v * 3 + a] = hc[a] + (pos[v * 3 + a] - hc[a]) * lead.hairScale; continue; }
        // smooth weights: the crown above the brow and anything behind the skull above the nape
        // (buns, ponytails) are compressed; the face (brow, eyes, nose) never is
        const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        const y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        const wCrown = ss(browY - 0.06, browY - 0.01, y);
        const wBehind = ss(hc[2] - 0.02, hc[2] - 0.06, z) * ss(lm.Neck[1], lm.Neck[1] + 0.04, y);
        const wFace = ss(hc[2], hc[2] + 0.05, z) * (1 - ss(browY + 0.02, browY + 0.08, y));
        const w = Math.max(wCrown, wBehind) * (1 - wFace), r0 = skull - 0.015 * wBehind;
        if (w > 0 && d > r0) {
          const nd = d + (r0 + (d - r0) * Math.max(0.05, lead.hairScale - 0.55) - d) * w;
          for (let a = 0; a < 3; a++) pos[v * 3 + a] = hc[a] + (pos[v * 3 + a] - hc[a]) * (nd / d);
        }
      }
    }
  }
  if (lead?.hairScale) {
    const hc = [lm.Head[0], lm.Head[1] + 0.03, lm.Head[2] - 0.01];
    const out = (v: number) => kind[v] === 1 && pos[v * 3 + 2] < hc[2] - 0.03 && Math.hypot(pos[v * 3] - hc[0], pos[v * 3 + 1] - hc[1], pos[v * 3 + 2] - hc[2]) > 0.085;
    const keep: number[] = [];
    for (let t = nSkin; t < idx.length; t += 3) if (!(out(idx[t]) || out(idx[t + 1]) || out(idx[t + 2]))) keep.push(idx[t], idx[t + 1], idx[t + 2]);
    idx.length = nSkin; idx.push(...keep);
  }
  // --- quantise ---
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[v * 3 + a]); mx[a] = Math.max(mx[a], pos[v * 3 + a]); }
  const qp = new Uint16Array(nv * 3);
  for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) qp[v * 3 + a] = Math.round(((pos[v * 3 + a] - mn[a]) / (mx[a] - mn[a] || 1)) * 65535);
  const qn = Int8Array.from(nrm.map((x) => Math.round(x * 127)));
  const quv = Uint16Array.from(uv.map((x) => Math.round(Math.min(1, Math.max(0, x)) * 65535)));
  const qsw = Uint8Array.from(sw.map((x) => Math.round(x * 255)));
  const qsj = Uint8Array.from(sj);
  // --- skin colour (cheeks/forehead) and neck colour (bottom ring) from the colour texture ---
  const eyeY = (lm.LEye[1] + lm.REye[1]) / 2;
  const cheek: [number, number][] = [], neckUV: [number, number][] = [];
  let neckMinY = Infinity;
  for (let v = 0; v < nv; v++) if (!kind[v]) neckMinY = Math.min(neckMinY, pos[v * 3 + 1]);
  for (let v = 0; v < nv; v++) {
    if (kind[v]) continue;
    const y = pos[v * 3 + 1], z = nrm[v * 3 + 2];
    if (z > 0.75 && y > eyeY - 0.06 && y < eyeY + 0.05 && Math.abs(pos[v * 3] - lm.Head[0]) > 0.02) cheek.push([uv[v * 2], uv[v * 2 + 1]]);
    if (y < neckMinY + 0.02) neckUV.push([uv[v * 2], uv[v * 2 + 1]]);
  }
  const tex = (suffix: string) => fs.readdirSync(path.join(dir, 'Textures')).find((f) => f.endsWith(suffix));
  const sample = (pts: [number, number][]) => {
    const f = path.join(TMP, 'pts.json'); fs.writeFileSync(f, JSON.stringify(pts));
    return JSON.parse(execFileSync('python3', ['-I', '-c', `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); W,H=im.size
cs=sorted((im.getpixel((min(W-1,max(0,int(u*W))),min(H-1,max(0,int((1-v)*H))))) for u,v in json.load(open(sys.argv[2]))), key=sum)
print(json.dumps(list(cs[len(cs)//2]) if cs else [180,140,110]))`, path.join(dir, 'Textures', tex('_head_color.tga')!), f]).toString());
  };
  const skinRGB = sample(cheek), neckRGB = sample(neckUV);
  // --- textures ---
  const job = (src: string | undefined, dst: string, size: number, alpha: boolean, recolor: boolean) => {
    if (!src) return 0;
    const j = path.join(TMP, 'job.json');
    fs.writeFileSync(j, JSON.stringify({ src: path.join(dir, 'Textures', src), dst: path.join(OUT, dst), size, alpha, quality: alpha ? 84 : 86,
      skin: recolor ? skinRGB : null, skinTarget: recolor && lead ? hex(lead.skinTarget) : null, hairTarget: recolor && lead?.hairTarget ? hex(lead.hairTarget) : null }));
    execFileSync('python3', ['-I', path.resolve(import.meta.dirname, 'rb_tex.py'), j]);
    return fs.statSync(path.join(OUT, dst)).size;
  };
  const sizes = {
    c: job(tex('_head_color.tga'), `${id}_c.webp`, texC, false, true),
    n: job(tex('_head_normal.tga'), `${id}_n.webp`, texN, false, false),
    o: kind.includes(1) ? job(tex('_opacity_color.tga'), `${id}_o.webp`, texC, true, !!lead?.hairTarget) : 0,
  };
  const outRGB = lead ? hex(lead.skinTarget) : skinRGB;
  const meta = {
    id, source: name, licence: 'MIT (Microsoft Rocketbox, Copyright (c) 2020 Microsoft)', lead: lead?.id ?? null,
    bbox: { min: mn, max: mx }, skinIdx: nSkin, cardIdx: idx.length - nSkin,
    skinRGB: outRGB, neckRGB: lead ? outRGB : neckRGB, neckMinY,
    landmarks: Object.fromEntries(['Head', 'Neck', 'LEye', 'REye', 'MNose', 'MJaw', 'LCheek', 'RCheek', 'MUpperLip', 'MBottomLip', 'LMouthCorner', 'RMouthCorner'].map((k) => [k, lm[k]])),
    tag: POOL[name] ?? null,
  };
  const blob = writeContainer(meta, { pos: qp, nrm: qn, uv: quv, sj: qsj, sw: qsw, kind: Uint8Array.from(kind), idx: nv < 65536 ? Uint16Array.from(idx) : Uint32Array.from(idx) });
  fs.writeFileSync(path.join(OUT, `${id}.bin`), blob);
  const total = blob.length + sizes.c + sizes.n + sizes.o;
  console.log(id.padEnd(18), 'verts', nv, 'tris', idx.length / 3, `(cards ${(idx.length - nSkin) / 3})`, 'bin', blob.length, 'tex', sizes, 'total KB', (total / 1024).toFixed(0), 'skin', outRGB);
  return { id, source: name, bytes: total, tag: POOL[name] ?? null, skinRGB: outRGB, lead: lead?.id ?? null, ownHair: !!lead?.ownHair };
}

const index: any[] = [];
const prev = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : { heads: [] };
if (args.includes('--pool')) for (const name of Object.keys(POOL)) {
  if (only && !only.includes(name)) continue;
  if (!fs.existsSync(path.join(repo, 'Assets/Avatars/Adults', name, 'Export', `${name}.fbx`))) { console.warn('missing', name); continue; }
  index.push(build(name, name, 512, 256));
}
if (args.includes('--leads')) {
  const leads = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, 'rb_leads.json'), 'utf8')) as LeadSpec[];
  for (const l of leads) { if (only && !only.includes(l.id)) continue; index.push(build(l.base, l.id, l.texSize ?? 1024, 512, l)); }
}
const merged = [...prev.heads.filter((h: any) => !index.some((x) => x.id === h.id)), ...index];
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ licence: 'MIT (Microsoft Rocketbox); see LICENSE-Rocketbox.md', heads: merged }, null, 1));
console.log('heads', merged.length, 'pool bytes', merged.filter((h: any) => !h.lead).reduce((a: number, h: any) => a + h.bytes, 0), 'lead bytes', merged.filter((h: any) => h.lead).reduce((a: number, h: any) => a + h.bytes, 0));
