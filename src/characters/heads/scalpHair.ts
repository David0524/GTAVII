/**
 * Hair grown from a baked head's own scalp (ICT heads carry a per-vertex hair weight): shell layers
 * offset along the scalp normal, drawn with the shared hair material, so the hair always sits on
 * the head it belongs to (our helper-mesh hair is shaped for our skull, not ICT's).
 * Close crops and teeny-weeny afros: an even layer that tapers to nothing at the hairline, with the
 * hair material's coily clumps (m1.w = 2) breaking it into tufts. Volume grows it outward.
 */
import * as THREE from 'three/webgpu';
import type { HeadAsset, fitHead } from './rocketbox';
import { hairMaterial } from '../render/materials';
import { KIND } from '../build/MeshBuilder';
import type { Appearance } from '../body/appearance';

const lin = (h: string) => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

export function scalpHairMesh(h: HeadAsset, fit: ReturnType<typeof fitHead>, app: Appearance, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4, lift: number, lod = 0) {
  if (!h.hair) return null;
  const hw = h.hair;
  // scalp triangles (all three corners carry hair)
  const tri: number[] = [];
  for (let t = 0; t < h.meta.skinIdx; t += 3) { const a = h.idx[t], b = h.idx[t + 1], c = h.idx[t + 2]; if (hw[a] && hw[b] && hw[c] && !h.kind[a]) tri.push(a, b, c); }
  if (!tri.length) return null;
  const used = [...new Set(tri)], at = new Map(used.map((v, i) => [v, i]));
  const coily = /afro|curly/.test(app.hair.style) || app.hair.texture > 0.7;
  const layers = [6, 4, 3, 2][Math.min(lod, 3)];
  // thickness: ~1 cm for a close crop, growing with volume (an afro's crown rises most)
  const lm = h.meta.landmarks, eyeY = (lm.LEye[1] + lm.REye[1]) / 2;
  const col = lin(app.hair.color), tip = col.map((c) => Math.min(1, c * 1.25 + 0.02));
  const nv = used.length * layers;
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = new Float32Array(nv * 2), SJ = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
  const CA = new Float32Array(nv * 3), CB = new Float32Array(nv * 3), M0 = new Float32Array(nv * 4), M1 = new Float32Array(nv * 4);
  const hc = lm.Head;
  for (let L = 0; L < layers; L++) {
    const hl = layers === 1 ? 0.5 : L / (layers - 1);
    used.forEach((v, i) => {
      const o = L * used.length + i, w = hw[v] / 255;
      const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
      const up = Math.min(1, Math.max(0, (y - eyeY) / 0.11));
      const th = ((0.008 + 0.004 * up) + app.hair.volume * 0.05 * (0.5 + 0.5 * up)) * w;
      const off = th * (0.12 + 0.88 * hl);
      const p = fit.map(x + h.nrm[v * 3] * off, y + h.nrm[v * 3 + 1] * off, z + h.nrm[v * 3 + 2] * off);
      P[o * 3] = p[0]; P[o * 3 + 1] = p[1] + lift; P[o * 3 + 2] = p[2];
      for (let c = 0; c < 3; c++) { N[o * 3 + c] = h.nrm[v * 3 + c]; CA[o * 3 + c] = col[c]; CB[o * 3 + c] = tip[c]; }
      for (let c = 0; c < 4; c++) { SJ[o * 4 + c] = h.sj[v * 4 + c]; SW[o * 4 + c] = h.sw[v * 4 + c]; }
      // strand coordinates in metres: around the head and down from the crown
      UV[o * 2] = Math.atan2(x - hc[0], z - hc[2]) * 0.09 * fit.s; UV[o * 2 + 1] = (hc[1] + 0.09 - y) * fit.s;
      // density fades in over the hairline taper; the shell material thins outer layers into tufts
      M0[o * 4] = hl; M0[o * 4 + 1] = Math.min(1, w ** 0.7) * (coily ? 1.1 : 1); M0[o * 4 + 2] = coily ? 3000 : 1800; M0[o * 4 + 3] = app.hair.texture;
      M1[o * 4] = KIND.hair; M1[o * 4 + 1] = 0; M1[o * 4 + 2] = app.hair.grey; M1[o * 4 + 3] = coily ? 2 : 0;
    });
  }
  const I = new Uint32Array(tri.length * layers);
  for (let L = 0; L < layers; L++) for (let k = 0; k < tri.length; k++) I[L * tri.length + k] = L * used.length + at.get(tri[k])!;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(SJ, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  geo.setAttribute('cA', new THREE.BufferAttribute(CA, 3));
  geo.setAttribute('cB', new THREE.BufferAttribute(CB, 3));
  geo.setAttribute('m0', new THREE.BufferAttribute(M0, 4));
  geo.setAttribute('m1', new THREE.BufferAttribute(M1, 4));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  const m = new THREE.SkinnedMesh(geo, hairMaterial());
  m.bind(skeleton, bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}
