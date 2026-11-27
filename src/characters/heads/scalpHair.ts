/**
 * Hair grown from a baked head's own scalp (ICT heads carry a per-vertex hair weight): shell layers
 * offset along the scalp normal, drawn with the shared hair material, so the hair always sits on
 * the head it belongs to (our helper-mesh hair is shaped for our skull, not ICT's).
 * Close crops and teeny-weeny afros: an even layer that tapers to nothing at the hairline, with the
 * hair material's coily clumps (m1.w = 2) breaking it into tufts. Volume grows it outward.
 * Brows: short shells on the brow arcs (baked per-vertex brow weight), in the same draw.
 */
import * as THREE from 'three/webgpu';
import type { HeadAsset, fitHead } from './rocketbox';
import { hairMaterial } from '../render/materials';
import { KIND } from '../build/MeshBuilder';
import type { Appearance } from '../body/appearance';

const lin = (h: string) => [1, 3, 5].map((i) => { const c = parseInt(h.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

interface ShellSpec { w: Uint8Array; layers: number; thick: (up: number, w: number) => number; density: (w: number) => number; freq: number; clump: 0 | 2; brow: boolean }

export function scalpHairMesh(h: HeadAsset, fit: ReturnType<typeof fitHead>, app: Appearance, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4, lift: number, lod = 0) {
  if (!h.hair) return null;
  const coily = /afro|curly/.test(app.hair.style) || app.hair.texture > 0.7;
  const lm = h.meta.landmarks, eyeY = (lm.LEye[1] + lm.REye[1]) / 2;
  const specs: ShellSpec[] = [{
    w: h.hair, layers: [6, 4, 3, 2][Math.min(lod, 3)],
    // ~1 cm for a close crop, growing with volume (an afro's crown rises most)
    thick: (up, w) => ((0.008 + 0.004 * up) + app.hair.volume * 0.05 * (0.5 + 0.5 * up)) * w,
    density: (w) => Math.min(1, w ** 0.7) * (coily ? 1.1 : 1), freq: coily ? 3000 : 1800, clump: coily ? 2 : 0, brow: false,
  }];
  // brows: ~1 mm of short straight strands (boundary triangles kept, density tapering to 0) lying along the arc (LOD 0-1 only)
  if (h.brow && lod <= 1) specs.push({ w: h.brow, layers: 2, thick: (_u, w) => 0.0012 * w, density: (w) => w ** 1.5 * 0.85, freq: 5200, clump: 0, brow: true });
  const col = lin(app.hair.color), tip = col.map((c) => Math.min(1, c * 1.25 + 0.02));
  const hc = lm.Head;
  const out = { P: [] as number[], N: [] as number[], UV: [] as number[], SJ: [] as number[], SW: [] as number[], CA: [] as number[], CB: [] as number[], M0: [] as number[], M1: [] as number[], I: [] as number[] };
  for (const sp of specs) {
    const hw = sp.w;
    const tri: number[] = [];
    for (let t = 0; t < h.meta.skinIdx; t += 3) { const a = h.idx[t], b = h.idx[t + 1], c = h.idx[t + 2]; if (!h.kind[a] && (sp.brow ? hw[a] || hw[b] || hw[c] : hw[a] && hw[b] && hw[c])) tri.push(a, b, c); }
    if (!tri.length) continue;
    const used = [...new Set(tri)], at = new Map(used.map((v, i) => [v, i]));
    for (let L = 0; L < sp.layers; L++) {
      const hl = sp.layers === 1 ? 0.5 : L / (sp.layers - 1);
      const base = out.P.length / 3;
      for (const v of used) {
        const w = hw[v] / 255;
        const x = h.pos[v * 3], y = h.pos[v * 3 + 1], z = h.pos[v * 3 + 2];
        const up = Math.min(1, Math.max(0, (y - eyeY) / 0.11));
        const off = sp.thick(up, w) * (0.12 + 0.88 * hl);
        const p = fit.map(x + h.nrm[v * 3] * off, y + h.nrm[v * 3 + 1] * off, z + h.nrm[v * 3 + 2] * off);
        out.P.push(p[0], p[1] + lift, p[2]);
        for (let c = 0; c < 3; c++) { out.N.push(h.nrm[v * 3 + c]); out.CA.push(col[c]); out.CB.push(tip[c]); }
        for (let c = 0; c < 4; c++) { out.SJ.push(h.sj[v * 4 + c]); out.SW.push(h.sw[v * 4 + c]); }
        // strand coordinates in metres. Scalp: around the head (u), down from the crown (v).
        // Brows: strands run along the arc, so v (the long axis of the strand noise) follows x
        if (sp.brow) out.UV.push((y - eyeY) * fit.s * 3, Math.abs(x - hc[0]) * fit.s);
        else out.UV.push(Math.atan2(x - hc[0], z - hc[2]) * 0.09 * fit.s, (hc[1] + 0.09 - y) * fit.s);
        out.M0.push(hl, sp.density(w), sp.freq, sp.brow ? 0.1 : app.hair.texture);
        out.M1.push(KIND.hair, 0, app.hair.grey, sp.clump);
      }
      for (const k of tri) out.I.push(base + at.get(k)!);
    }
  }
  if (!out.I.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(out.P), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(out.N), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(out.UV), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(Uint16Array.from(out.SJ), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(Float32Array.from(out.SW), 4));
  geo.setAttribute('cA', new THREE.BufferAttribute(Float32Array.from(out.CA), 3));
  geo.setAttribute('cB', new THREE.BufferAttribute(Float32Array.from(out.CB), 3));
  geo.setAttribute('m0', new THREE.BufferAttribute(Float32Array.from(out.M0), 4));
  geo.setAttribute('m1', new THREE.BufferAttribute(Float32Array.from(out.M1), 4));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(out.I), 1));
  geo.computeBoundingSphere();
  const m = new THREE.SkinnedMesh(geo, hairMaterial());
  m.bind(skeleton, bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}
