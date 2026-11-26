/**
 * EVALUATION ONLY: a Microsoft Rocketbox head (MIT) fitted onto our parametric body, so the
 * "hybrid" option can be judged beside the generator (docs/CHARACTERS_PROGRESS.md, Rocketbox
 * evaluation). Built offline by tools/characters/build-rocketbox.ts.
 *
 * Fit: uniform scale by interocular distance, translated so the eye midpoints coincide. Our head
 * skin above the seam, eyes, teeth, hair and brows are dropped; the Rocketbox neck overlaps ours
 * by 12 mm under the collar. Skinned to our Head / jaw / eyes / neck joints.
 */
import * as THREE from 'three/webgpu';
import { texture, uv, attribute, float, vec3, mix } from 'three/tsl';
import { readContainer } from '../format';
import { JOINT_INDEX as JI } from '../rig';

export interface RocketboxHead {
  name: string;
  meta: { tone: string; eyeL: number[]; eyeR: number[]; neckMinY: number; counts: { verts: number; skinTris: number; opacityTris: number } };
  pos: Float32Array; nrm: Float32Array; uv: Float32Array; sj: Uint16Array; sw: Float32Array;
  idxSkin: Uint32Array; idxOpacity: Uint32Array;
  color: THREE.Texture; normal: THREE.Texture; opacity: THREE.Texture | null;
  bytes: number;
}

const qp = (k: string) => (typeof location !== 'undefined' ? new URLSearchParams(location.search).get(k) : null);

export async function loadRocketboxHead(base: string, name: string): Promise<RocketboxHead> {
  const res = await fetch(`${base}eval/rb_${name}.bin`);
  const buf = await res.arrayBuffer();
  const c = readContainer(buf);
  const B = (k: string) => c.blobs.get(k) as any;
  const tl = new THREE.TextureLoader();
  const load = async (f: string, srgb: boolean) => { const t = await tl.loadAsync(`${base}eval/${f}`); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = qp('rbflip') !== '0'; t.anisotropy = 4; return t; };
  const color = await load(`rb_${name}_color.webp`, true), normal = await load(`rb_${name}_normal.webp`, false);
  const hasOp = (c.meta.counts.opacityTris ?? 0) > 0;
  const opacity = hasOp ? await load(`rb_${name}_opacity.webp`, true) : null;
  let bytes = buf.byteLength;
  for (const f of [`rb_${name}_color.webp`, `rb_${name}_normal.webp`, ...(hasOp ? [`rb_${name}_opacity.webp`] : [])]) { const h = await fetch(`${base}eval/${f}`, { method: 'HEAD' }); bytes += Number(h.headers.get('content-length') ?? 0); }
  return { name, meta: c.meta, pos: B('pos'), nrm: B('nrm'), uv: B('uv'), sj: B('sj'), sw: B('sw'), idxSkin: B('idxSkin'), idxOpacity: B('idxOpacity'), color, normal, opacity, bytes };
}

/** Fit (scale, offset) from the Rocketbox eyes to ours, and the neck seam height (pre-lift). */
export function fitHead(h: RocketboxHead, joints: Float32Array) {
  const our = (j: number) => [joints[j * 3], joints[j * 3 + 1], joints[j * 3 + 2]];
  const oL = our(JI.eye_l), oR = our(JI.eye_r);
  const oMid = [(oL[0] + oR[0]) / 2, (oL[1] + oR[1]) / 2, (oL[2] + oR[2]) / 2];
  const rL = h.meta.eyeL, rR = h.meta.eyeR, rMid = [(rL[0] + rR[0]) / 2, (rL[1] + rR[1]) / 2, (rL[2] + rR[2]) / 2];
  const s = Math.hypot(oL[0] - oR[0], oL[1] - oR[1], oL[2] - oR[2]) / Math.hypot(rL[0] - rR[0], rL[1] - rR[1], rL[2] - rR[2]);
  const map = (x: number, y: number, z: number): [number, number, number] => [(x - rMid[0]) * s + oMid[0], (y - rMid[1]) * s + oMid[1], (z - rMid[2]) * s + oMid[2]];
  const cutY = map(0, h.meta.neckMinY, 0)[1] + 0.012;
  return { s, map, cutY };
}

/** The head as a skinned mesh on the character's skeleton (1–2 draws: skin, cards). */
export function rocketboxHeadMesh(h: RocketboxHead, fit: ReturnType<typeof fitHead>, lift: number, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4) {
  const n = h.pos.length / 3;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) { const p = fit.map(h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]); pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1] + lift; pos[v * 3 + 2] = p[2]; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(h.nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(h.uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(h.sj, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(h.sw, 4));
  const idx = new Uint32Array(h.idxSkin.length + h.idxOpacity.length); idx.set(h.idxSkin); idx.set(h.idxOpacity, h.idxSkin.length);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.addGroup(0, h.idxSkin.length, 0);
  if (h.idxOpacity.length) geo.addGroup(h.idxSkin.length, h.idxOpacity.length, 1);
  geo.computeBoundingSphere();
  const skin = new THREE.MeshSSSNodeMaterial({ map: h.color, normalMap: h.normal, roughness: 0.52 });
  skin.normalScale = new THREE.Vector2(1, qp('rbn') === '-1' ? -1 : 1);
  // warm transmission like our own skin shader
  skin.thicknessColorNode = vec3(0.4, 0.1, 0.05); skin.thicknessScaleNode = float(1.0); skin.thicknessPowerNode = float(3); skin.thicknessDistortionNode = float(0.15);
  void attribute; void mix;
  const mats: THREE.Material[] = [skin];
  if (h.opacity) {
    const op = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, roughness: 0.7 });
    const t = texture(h.opacity, uv());
    op.colorNode = t.rgb; op.opacityNode = t.a; op.alphaTest = 0.4; op.alphaToCoverage = true;
    mats.push(op);
  }
  const m = new THREE.SkinnedMesh(geo, mats.length > 1 ? mats : mats[0]);
  m.bind(skeleton, bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}
