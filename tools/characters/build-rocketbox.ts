/**
 * EVALUATION ONLY (oversight request, user-approved): extracts the head of a Microsoft Rocketbox
 * avatar (MIT; docs/CHARACTER_SOURCES.md §6) so it can be fitted onto our parametric body:
 * head skin, eyes, teeth, eyelashes and hair cards, skinned to our rig (Head, jaw, eyes, neck).
 * Shirt collars painted in the head atlas (Spine2-dominated triangles) are left out.
 *
 *   git clone (blobless, sparse) https://github.com/microsoft/microsoft-rocketbox → --repo
 *   npx tsx tools/characters/build-rocketbox.ts --repo /home/user/microsoft/microsoft-rocketbox Male_Adult_12 …
 *
 * Writes public/characters/eval/rb_<name>.bin (T74X) and rb_<name>_{color,normal,opacity}.webp (1024²).
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
const repo = args[args.indexOf('--repo') + 1];
const names = args.filter((a, i) => a !== '--repo' && args[i - 1] !== '--repo');
const OUT = path.resolve(import.meta.dirname, '../../public/characters/eval');
fs.mkdirSync(OUT, { recursive: true });

/** Rocketbox Biped → our joints (head piece only). Facial bones collapse onto the head except jaw/eyes. */
const mapBone = (n: string): number => {
  const b = n.replace('Bip01_', '');
  if (b === 'MJaw' || b === 'MBottomLip' || b === 'MTongue' || b === 'LMouthBottom' || b === 'RMouthBottom') return JI.jaw;
  if (b === 'LEye') return JI.eye_l;
  if (b === 'REye') return JI.eye_r;
  if (b === 'Neck') return JI.neck_01;
  if (b === 'Spine2' || b === 'Spine1' || b === 'Spine' || b.includes('Clavicle')) return JI.spine_03;
  return JI.Head;
};

for (const name of names) {
  const dir = path.join(repo, 'Assets/Avatars/Adults', name);
  const buf = fs.readFileSync(path.join(dir, 'Export', `${name}.fbx`));
  const g = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '');
  g.updateMatrixWorld(true);
  let mesh: any = null; g.traverse((o: any) => { if (o.isSkinnedMesh) mesh = o; });
  const geo = mesh.geometry, mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m: any) => m.name as string);
  const P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight;
  const bm = mesh.bindMatrix as InstanceType<typeof THREE.Matrix4>;
  const nm = new THREE.Matrix3().getNormalMatrix(bm);
  const bones = mesh.skeleton.bones as any[];
  const S = 0.01; // cm → m
  const wpos = (b: string) => { const o = bones.find((x) => x.name === b); const v = new THREE.Vector3(); o.getWorldPosition(v); return v.multiplyScalar(S); };
  const eyeL = wpos('Bip01_LEye'), eyeR = wpos('Bip01_REye'), head = wpos('Bip01_Head'), neck = wpos('Bip01_Neck');
  // which triangles belong to the head piece: head/opacity materials, vertices dominated by head-side bones
  const headish = (v: number) => { let w = 0; for (let c = 0; c < 4; c++) { const b = bones[SI.getComponent(v, c)].name.replace('Bip01_', ''); if (!/^(Spine|Spine1|Spine2|Pelvis)$/.test(b) && !b.includes('Clavicle')) w += SW.getComponent(v, c); } return w; };
  const verts = new Map<number, number>();
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], sj: number[] = [], sw: number[] = [], kind: number[] = [];
  const idx: Record<string, number[]> = { skin: [], opacity: [] };
  let neckMinY = Infinity;
  for (const gr of geo.groups) {
    const mname = mats[gr.materialIndex];
    const isOpacity = mname.endsWith('_opacity'), isHead = mname.endsWith('_head');
    if (!isHead && !isOpacity) continue;
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const tri = [0, 1, 2].map((k) => (geo.index ? geo.index.getX(i + k) : i + k));
      if (tri.some((v) => headish(v) < 0.5)) continue;
      const out = tri.map((v) => {
        let o = verts.get(v);
        if (o === undefined) {
          o = pos.length / 3;
          const p = new THREE.Vector3(P.getX(v), P.getY(v), P.getZ(v)).applyMatrix4(bm).multiplyScalar(S);
          const n = new THREE.Vector3(N.getX(v), N.getY(v), N.getZ(v)).applyMatrix3(nm).normalize();
          pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(UV.getX(v), UV.getY(v));
          const js: number[] = [], ws: number[] = [];
          for (let c = 0; c < 4; c++) { const w = SW.getComponent(v, c); if (w <= 0) continue; const j = mapBone(bones[SI.getComponent(v, c)].name); const at = js.indexOf(j); if (at >= 0) ws[at] += w; else { js.push(j); ws.push(w); } }
          const tw = ws.reduce((a, b) => a + b, 0) || 1;
          for (let c = 0; c < 4; c++) { sj.push(js[c] ?? 0); sw.push((ws[c] ?? 0) / tw); }
          kind.push(isOpacity ? 1 : 0);
          verts.set(v, o);
          if (!isOpacity) neckMinY = Math.min(neckMinY, p.y);
        }
        return o;
      });
      idx[isOpacity ? 'opacity' : 'skin'].push(...out);
    }
  }
  // textures: head colour, normal, opacity (cards) → 1024² WebP; and a reference skin tone
  const tex = (suffix: string) => fs.readdirSync(path.join(dir, 'Textures')).find((f) => f.endsWith(suffix));
  const conv = (src: string | undefined, dst: string, alpha = false) => {
    if (!src) return 0;
    const out = path.join(OUT, dst);
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image
im=Image.open(sys.argv[1]); im=im.convert('RGBA' if ${alpha ? 'True' : 'False'} else 'RGB').resize((1024,1024), Image.LANCZOS)
im.save(sys.argv[2],'WEBP',quality=88)`, path.join(dir, 'Textures', src), out]);
    return fs.statSync(out).size;
  };
  const sizes = {
    color: conv(tex('_head_color.tga'), `rb_${name}_color.webp`),
    normal: conv(tex('_head_normal.tga'), `rb_${name}_normal.webp`),
    opacity: conv(tex('_opacity_color.tga'), `rb_${name}_opacity.webp`, true),
  };
  // skin tone: median colour of the head texture under front-facing cheek/forehead vertices
  const samples: number[][] = [];
  const cy = (eyeL.y + eyeR.y) / 2;
  const pts: [number, number][] = [];
  for (let v = 0; v < pos.length / 3; v++) {
    if (kind[v]) continue;
    const y = pos[v * 3 + 1], z = nrm[v * 3 + 2];
    if (z > 0.75 && y > cy - 0.06 && y < cy + 0.05 && Math.abs(pos[v * 3] - head.x) > 0.02) pts.push([uv[v * 2], uv[v * 2 + 1]]);
  }
  const ptsFile = path.join(OUT, `.rb_pts.json`); fs.writeFileSync(ptsFile, JSON.stringify(pts));
  const tone = execFileSync('python3', ['-I', '-c', `
import sys,json
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB'); W,H=im.size
pts=json.load(open(sys.argv[2])); cs=[]
for u,v in pts:
  x=min(W-1,max(0,int(u*W))); y=min(H-1,max(0,int((1-v)*H))); cs.append(im.getpixel((x,y)))
cs.sort(key=lambda c:sum(c)); c=cs[len(cs)//2] if cs else (180,140,110)
print('#%02x%02x%02x'%c)`, path.join(dir, 'Textures', tex('_head_color.tga')!), ptsFile]).toString().trim();
  fs.unlinkSync(ptsFile);
  void samples;
  const meta = {
    name, licence: 'MIT (Microsoft Rocketbox, Copyright (c) 2020 Microsoft)', tone,
    eyeL: eyeL.toArray(), eyeR: eyeR.toArray(), head: head.toArray(), neck: neck.toArray(), neckMinY,
    counts: { verts: pos.length / 3, skinTris: idx.skin.length / 3, opacityTris: idx.opacity.length / 3 },
  };
  const blob = writeContainer(meta, {
    pos: Float32Array.from(pos), nrm: Float32Array.from(nrm), uv: Float32Array.from(uv),
    sj: Uint16Array.from(sj), sw: Float32Array.from(sw), kind: Uint8Array.from(kind),
    idxSkin: Uint32Array.from(idx.skin), idxOpacity: Uint32Array.from(idx.opacity),
  });
  fs.writeFileSync(path.join(OUT, `rb_${name}.bin`), blob);
  console.log(name, meta.counts, 'tone', tone, 'bin', blob.length, 'textures', sizes, 'iod', eyeL.distanceTo(eyeR).toFixed(4));
}
