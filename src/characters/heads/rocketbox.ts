/**
 * Rocketbox heads (MIT; docs/CHARACTER_SOURCES.md §6) on our parametric bodies.
 *   - Leads: altered heads built from appearance sheets (tools/characters/rb_leads.json).
 *   - Near ring (Medium and above): a pool matched to each pedestrian's sex, age, ancestry,
 *     tone and hair, tinted to the template's tone so the hand-off to the instanced LOD is quiet,
 *     never repeated within a view.
 *   - Far crowd and Low keep our generated heads.
 * One draw per head (face skin and hair/lash cards share one material), so a character is
 * 2 draws: main (body, clothes) + head.
 */
import * as THREE from 'three/webgpu';
import { texture, uv, attribute, float, vec2, vec3, uniform, normalMap, normalView, mix, dot, smoothstep, parallaxUV } from 'three/tsl';
import { SkinNodeMaterial } from '../render/skinLighting';
import { readContainer, formatReady } from '../format';
import type { GeoArrays } from '../build/MeshBuilder';
import { hairMaterial } from '../render/materials';
import { JOINT_INDEX as JI } from '../rig';
import type { Appearance } from '../body/appearance';

export interface HeadTag { sex: 0 | 1; age: [number, number]; anc: [number, number, number]; hair: 'short' | 'long' | 'curly' | 'bald' | 'tied' }
export interface HeadIndexEntry { id: string; source: string; bytes: number; tag: HeadTag | null; skinRGB: number[]; lead: string | null; ownHair?: boolean }
export interface HeadAsset {
  id: string;
  meta: { bbox: { min: number[]; max: number[] }; skinIdx: number; cardIdx: number; skinRGB: number[]; neckRGB: number[]; neckMinY: number; neckRing?: number[]; face?: { browZ: number; hx: number; zmin: number; zmax: number }; landmarks: Record<string, number[]>; tag: HeadTag | null; lead: string | null };
  pos: Float32Array; nrm: Float32Array; uv: Float32Array; sj: Uint16Array; sw: Float32Array; kind: Float32Array; idx: Uint16Array | Uint32Array;
  /** ICT heads: per-vertex scalp-hair weight (0..255) for the runtime coil shells. */
  hair?: Uint8Array;
  /** ICT heads: per-vertex brow weight (0..255) for the brow shells. */
  brow?: Uint8Array;
  color: THREE.Texture; normal: THREE.Texture; opacity: THREE.Texture | null;
  bytes: number;
}

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const toLin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

export class HeadLibrary {
  private cache = new Map<string, Promise<HeadAsset>>();
  index: HeadIndexEntry[] = [];
  constructor(private base: string) {}
  async init() {
    try { this.index = (await (await fetch(this.base + 'index.json')).json()).heads; } catch { this.index = []; }
    return this;
  }
  get pool() { return this.index.filter((h) => !h.lead && h.tag); }
  lead(name: string) { return this.index.find((h) => h.lead === name) ?? null; }
  load(id: string): Promise<HeadAsset> {
    let p = this.cache.get(id);
    if (!p) { p = loadHead(this.base, id); this.cache.set(id, p); }
    return p;
  }
  /**
   * Best pool head for a generated appearance: same sex; age band; ancestry close (the pool is
   * thin for darker skin, so a poor match returns null and the person keeps our head rather than
   * being given a face that doesn't fit); tone close enough that a ≤ 25% tint matches it.
   */
  pick(app: Appearance, exclude: Set<string>): string | null {
    const sex = app.sex >= 0.5 ? 1 : 0;
    const m = app.body.macro as unknown as { african: number; asian: number; caucasian: number };
    const s = m.african + m.asian + m.caucasian || 1;
    const anc = [m.african / s, m.asian / s, m.caucasian / s];
    const tone = hexRGB(app.skin.tone).map(toLin);
    let best: string | null = null, bestScore = Infinity;
    for (const h of this.pool) {
      const t = h.tag!;
      if (t.sex !== sex || exclude.has(h.id)) continue;
      const ageGap = app.age < t.age[0] ? t.age[0] - app.age : app.age > t.age[1] ? app.age - t.age[1] : 0;
      const ancGap = Math.abs(anc[0] - t.anc[0]) + Math.abs(anc[1] - t.anc[1]) + Math.abs(anc[2] - t.anc[2]);
      const hl = h.skinRGB.map(toLin);
      const toneRatio = Math.max(...[0, 1, 2].map((i) => Math.abs(Math.log((tone[i] + 0.01) / (hl[i] + 0.01)))));
      // gate on what the player will see: the head's skin after the clamped tint vs the body's
      // tone, in CIELAB (an RGB ratio let hue/chroma breaks through on darker heads)
      const tint = tintFor(h, app.skin.tone), tinted = hl.map((c, i) => c * tint[i]);
      const dE = labDist(tinted, tone);
      if (ancGap > 0.6 || dE > 7 || ageGap > 15) continue;
      const hairGap = hairCat(app.hair.style) === t.hair ? 0 : 0.3;
      const score = ancGap * 2 + toneRatio * 2 + ageGap / 10 + hairGap;
      if (score < bestScore) { bestScore = score; best = h.id; }
    }
    return best;
  }
}

const hexRGB = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** CIE76 distance between two linear-sRGB colours (0..1). */
function labDist(a: number[], b: number[]) {
  const lab = (c: number[]) => {
    const x = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
function hairCat(style: string): HeadTag['hair'] {
  if (style === 'bald' || style === 'buzz') return 'bald';
  if (/afro|curly|setCurls/.test(style)) return 'curly';
  if (/ponytail|braid|updo/.test(style)) return 'tied';
  if (/long|bob|flip|shag|feathered/.test(style)) return 'long';
  return 'short';
}

async function loadHead(base: string, id: string): Promise<HeadAsset> {
  const buf = await (await fetch(`${base}${id}.bin`)).arrayBuffer();
  await formatReady();
  const c = readContainer(buf);
  const meta = c.meta;
  const B = (k: string) => c.blobs.get(k) as any;
  const qp = B('pos') as Uint16Array, qn = B('nrm') as Int8Array, quv = B('uv') as Uint16Array, qsj = B('sj') as Uint8Array, qsw = B('sw') as Uint8Array, kd = B('kind') as Uint8Array;
  const n = qp.length / 3, mn = meta.bbox.min, mx = meta.bbox.max;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uvs = new Float32Array(n * 2), sj = new Uint16Array(n * 4), sw = new Float32Array(n * 4), kind = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    for (let a = 0; a < 3; a++) { pos[v * 3 + a] = mn[a] + (qp[v * 3 + a] / 65535) * (mx[a] - mn[a]); nrm[v * 3 + a] = qn[v * 3 + a] / 127; }
    uvs[v * 2] = quv[v * 2] / 65535; uvs[v * 2 + 1] = quv[v * 2 + 1] / 65535;
    let t = 0; for (let k = 0; k < 4; k++) { sj[v * 4 + k] = qsj[v * 4 + k]; sw[v * 4 + k] = qsw[v * 4 + k] / 255; t += sw[v * 4 + k]; }
    if (t > 0) for (let k = 0; k < 4; k++) sw[v * 4 + k] /= t;
    kind[v] = kd[v];
  }
  const tl = new THREE.TextureLoader();
  const load = async (f: string, srgb: boolean) => { const t = await tl.loadAsync(`${base}${f}`); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  const [color, normal, opacity] = await Promise.all([load(`${id}_c.webp`, true), load(`${id}_n.webp`, false), meta.cardIdx > 0 ? load(`${id}_o.webp`, true) : Promise.resolve(null)]);
  meta.face = faceOf(pos, kind, meta.landmarks);
  if (!meta.neckRing) meta.neckRing = neckRingOf(meta.landmarks.Neck, pos, kind, B('idx'), meta.skinIdx);
  return { id, meta, pos, nrm, uv: uvs, sj, sw, kind, idx: B('idx'), color, normal, opacity, bytes: buf.byteLength, hair: c.blobs.get('hair') as Uint8Array | undefined, brow: c.blobs.get('brow') as Uint8Array | undefined };
}

const RING = 16;
/**
 * The bottom edge of the head's neck by angle around the neck landmark (head space): Rocketbox
 * necks are cut on a slant (higher at the nape), so a level cut through our body leaves gaps.
 */
function neckRingOf(neck: number[], pos: Float32Array, kind: Float32Array, idx: ArrayLike<number>, nSkin: number) {
  // boundary edges of the skin surface (used by one triangle) below the jaw are the neck's cut edge
  const edges = new Map<number, number>(), n = kind.length;
  for (let t = 0; t < nSkin; t += 3) for (let e = 0; e < 3; e++) {
    const a = idx[t + e], b = idx[t + (e + 1) % 3], k = Math.min(a, b) * n + Math.max(a, b);
    edges.set(k, (edges.get(k) ?? 0) + 1);
  }
  const sum = new Float64Array(RING), cnt = new Float64Array(RING), rsum = new Float64Array(RING);
  for (const [k, c] of edges) {
    if (c !== 1) continue;
    for (const v of [Math.floor(k / n), k % n]) {
      const x = pos[v * 3] - neck[0], y = pos[v * 3 + 1], z = pos[v * 3 + 2] - neck[2];
      if (Math.hypot(x, z) > 0.1 || y > neck[1] + 0.08) continue;
      const a = Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * RING) % RING;
      sum[a] += y; rsum[a] += Math.hypot(x, z); cnt[a]++;
    }
  }
  const fill = (src: Float64Array) => {
    const ring = Array.from(src, (v, a) => (cnt[a] ? v / cnt[a] : NaN));
    // fill gaps from neighbours, then smooth once around the loop
    for (let it = 0; it < RING; it++) for (let a = 0; a < RING; a++) if (Number.isNaN(ring[a])) {
      const l = ring[(a + RING - 1) % RING], r = ring[(a + 1) % RING];
      ring[a] = Number.isNaN(l) ? r : Number.isNaN(r) ? l : (l + r) / 2;
    }
    return ring.map((y, a) => (ring[(a + RING - 1) % RING] + 2 * y + ring[(a + 1) % RING]) / 4);
  };
  // [0, RING): edge height; [RING, 2 RING): edge radius around the neck landmark's vertical axis
  return [...fill(sum), ...fill(rsum)];
}

/** Fit (uniform scale by interocular distance, eye midpoints coincide) and the seam height (pre-lift). */
export function fitHead(h: { meta: Pick<HeadAsset['meta'], 'landmarks' | 'neckMinY' | 'neckRing'> }, joints: Float32Array) {
  const our = (j: number) => [joints[j * 3], joints[j * 3 + 1], joints[j * 3 + 2]];
  const oL = our(JI.eye_l), oR = our(JI.eye_r);
  const oMid = [(oL[0] + oR[0]) / 2, (oL[1] + oR[1]) / 2, (oL[2] + oR[2]) / 2];
  const rL = h.meta.landmarks.LEye, rR = h.meta.landmarks.REye;
  const rMid = [(rL[0] + rR[0]) / 2, (rL[1] + rR[1]) / 2, (rL[2] + rR[2]) / 2];
  const s = Math.hypot(oL[0] - oR[0], oL[1] - oR[1], oL[2] - oR[2]) / Math.hypot(rL[0] - rR[0], rL[1] - rR[1], rL[2] - rR[2]);
  const map = (x: number, y: number, z: number): [number, number, number] => [(x - rMid[0]) * s + oMid[0], (y - rMid[1]) * s + oMid[1], (z - rMid[2]) * s + oMid[2]];
  const neckBottom = map(0, h.meta.neckMinY, 0)[1];
  // the seam by angle (our space, pre-lift): ring bottom around the mapped neck landmark
  const ring = h.meta.neckRing, nk = map(h.meta.landmarks.Neck[0], h.meta.landmarks.Neck[1], h.meta.landmarks.Neck[2]);
  const ringY = (x: number, z: number) => {
    if (!ring) return neckBottom;
    const f = (((Math.atan2(x - nk[0], z - nk[2]) + Math.PI) / (2 * Math.PI)) * RING) - 0.5;
    const a0 = Math.floor(f), t = f - a0, a = (i: number) => ring[((i % RING) + RING) % RING];
    return (a(a0) * (1 - t) + a(a0 + 1) * t - rMid[1]) * s + oMid[1];
  };
  const ringR = (x: number, z: number) => {
    if (!ring || ring.length < 2 * RING) return 0;
    const f = (((Math.atan2(x - nk[0], z - nk[2]) + Math.PI) / (2 * Math.PI)) * RING) - 0.5;
    const a0 = Math.floor(f), t = f - a0, a = (i: number) => ring[RING + (((i % RING) + RING) % RING)];
    return (a(a0) * (1 - t) + a(a0 + 1) * t) * s;
  };
  return { s, map, neckBottom, cutY: neckBottom + 0.018, ringY, ringR, neckAxis: [nk[0], nk[2]] as [number, number] };
}

/** The head's face in head space (eye-midpoint frame): brow depth in front of the eyes, half-width and depth at eye height. */
function faceOf(pos: Float32Array, kind: Float32Array, lm: Record<string, number[]>) {
  const L = lm.LEye, R = lm.REye, mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2, (L[2] + R[2]) / 2];
  let browZ = -Infinity, hx = 0, zmin = Infinity, zmax = -Infinity;
  for (let v = 0; v < kind.length; v++) {
    if (kind[v]) continue;
    const x = pos[v * 3] - mid[0], dy = pos[v * 3 + 1] - mid[1], z = pos[v * 3 + 2];
    if (Math.abs(x) < 0.045 && dy > -0.015 && dy < 0.03) browZ = Math.max(browZ, z);
    if (Math.abs(dy) < 0.012) { hx = Math.max(hx, Math.abs(x)); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z); }
  }
  return { browZ, hx, zmin, zmax };
}
/**
 * The substituted head's face in our space (pre-lift), so glasses sit on *its* face, not on the
 * hidden one of ours. Works from the meta alone (the near-ring build worker has no geometry).
 */
export function headFaceExtents(h: { meta: Pick<HeadAsset['meta'], 'face'> }, fit: ReturnType<typeof fitHead>) {
  const f = h.meta.face;
  if (!f) return undefined;
  const z = (v: number) => fit.map(0, 0, v)[2];
  return { browZ: z(f.browZ), hx: f.hx * fit.s, hz: ((f.zmax - f.zmin) / 2) * fit.s, cz: z((f.zmax + f.zmin) / 2) };
}
export type HeadFace = NonNullable<ReturnType<typeof headFaceExtents>>;

/**
 * Radial profile of our neck around the neck joint (pre-lift), for stitching the head's neck ring
 * onto our body: radius at (height, angle).
 */
export interface NeckData { r: Float32Array; y0: number; y1: number; cx: number; cz: number }
const NA = 32, NY = 8;
/** Raw neck profile (transferable from the build worker). */
export function neckProfileData(pos: Float32Array, joints: Float32Array, y0: number, y1: number): NeckData {
  const cx = joints[JI.neck_01 * 3], cz = joints[JI.neck_01 * 3 + 2];
  const r = new Float32Array(NA * NY);
  for (let k = 0; k < pos.length / 3; k++) {
    const x = pos[k * 3] - cx, y = pos[k * 3 + 1], z = pos[k * 3 + 2] - cz;
    if (y < y0 || y > y1 || Math.abs(x) > 0.09 || Math.abs(z) > 0.09) continue;
    // the jaw and chin overhang the front of the neck: keep the front to the throat
    if (z > 0.015 && y > y0 + 0.042) continue;
    const a = Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * NA) % NA, b = Math.min(NY - 1, Math.floor(((y - y0) / (y1 - y0)) * NY));
    r[b * NA + a] = Math.max(r[b * NA + a], Math.hypot(x, z));
  }
  for (let it = 0; it < 4; it++) for (let b = 0; b < NY; b++) for (let a = 0; a < NA; a++) if (!r[b * NA + a]) r[b * NA + a] = Math.max(r[b * NA + (a + 1) % NA], r[b * NA + (a + NA - 1) % NA], b > 0 ? r[(b - 1) * NA + a] : 0);
  return { r, y0, y1, cx, cz };
}
export function neckSampler(d: NeckData) {
  return (x: number, y: number, z: number) => {
    const a = Math.floor(((Math.atan2(x - d.cx, z - d.cz) + Math.PI) / (2 * Math.PI)) * NA) % NA, b = Math.min(NY - 1, Math.max(0, Math.floor(((y - d.y0) / (d.y1 - d.y0)) * NY)));
    return { r: d.r[b * NA + a], cx: d.cx, cz: d.cz };
  };
}
/** Radial profile of our neck (pre-lift), for stitching the head's neck ring onto our body. */
export function neckProfile(pos: Float32Array, joints: Float32Array, y0: number, y1: number) { return neckSampler(neckProfileData(pos, joints, y0, y1)); }

export interface HeadMeshOpts {
  lift: number; tint?: [number, number, number]; neck?: ReturnType<typeof neckProfile>;
  /** Body skin tone (hex): the neck's bottom fades into it, so the painted neck shading doesn't ring. */
  bodyTone?: string;
  /** Drop the head's own hair/lash cards (our strand cards are drawn instead). */
  noCards?: boolean;
}

/** The head as one skinned draw on the character's skeleton. */
export function headMesh(h: HeadAsset, fit: ReturnType<typeof fitHead>, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4, o: HeadMeshOpts) {
  const n = h.pos.length / 3;
  const pos = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let p = fit.map(h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]);
    // neck stitch: the bottom 25 mm of the head's neck blends onto our neck surface
    if (o.neck && !h.kind[v]) {
      const rb = fit.ringY(p[0], p[2]), w = sm(rb + 0.025, rb, p[1]);
      if (w > 0) {
        const { r, cx, cz } = o.neck(p[0], p[1], p[2]);
        if (r > 0) { const dx = p[0] - cx, dz = p[2] - cz, d = Math.hypot(dx, dz) || 1; const tr = d + (r + 0.002 - d) * w; p = [cx + (dx / d) * tr, p[1], cz + (dz / d) * tr]; }
      }
    }
    pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1] + o.lift; pos[v * 3 + 2] = p[2];
  }
  const fade = new Float32Array(n);
  for (let v = 0; v < n; v++) { const y = fit.map(h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2])[1]; if (h.kind[v]) { fade[v] = 0; continue; } const p = fit.map(h.pos[v * 3], h.pos[v * 3 + 1], h.pos[v * 3 + 2]), rb = fit.ringY(p[0], p[2]); fade[v] = sm(rb + 0.065, rb + 0.01, y); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('hfade', new THREE.BufferAttribute(fade, 1));
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(h.nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(h.uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(h.sj, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(h.sw, 4));
  geo.setAttribute('hkind', new THREE.BufferAttribute(h.kind, 1));
  geo.setIndex(new THREE.BufferAttribute(o.noCards ? h.idx.slice(0, h.meta.skinIdx) : h.idx, 1));
  // packed (ICT) heads: tangents for the iris parallax (and a stable tangent frame for the normal map)
  if ((h.meta as { packed?: boolean }).packed) geo.computeTangents();
  geo.computeBoundingSphere();
  const bt = o.bodyTone ? hexRGB(o.bodyTone).map(toLin) : null;
  const m = new THREE.SkinnedMesh(geo, headMaterial(h, o.tint ?? [1, 1, 1], bt as [number, number, number] | null));
  m.bind(skeleton, bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}

/** Skin and cards in one material: the per-vertex kind picks the texture set. */
function headMaterial(h: HeadAsset, tint: [number, number, number], bodyLin: [number, number, number] | null) {
  const m = new SkinNodeMaterial({ side: THREE.DoubleSide, roughness: 0.5 });
  // ICT heads pack roughness (r), cavity (g) and skin weight (b) into the card texture's RGB on
  // the non-card texels (stored sRGB-encoded so the sampled linear value is the datum)
  const packed = !!(h.meta as { packed?: boolean }).packed;
  const kind = attribute('hkind', 'float');
  const isCard = kind.greaterThan(0.5);
  // ICT eyes: the iris sits ~2.5 mm behind the cornea; parallax shifts it against the corneal
  // dome as the view turns (eye texels: packed roughness < 0.1; the eye atlas cell is centred at
  // (0.125, 0.375) with the iris inside a radius of ~0.031)
  const packedH = !!(h.meta as { packed?: boolean }).packed;
  const irisW = packedH ? texture(h.opacity ?? h.color, uv()).r.lessThan(0.1).select(smoothstep(0.038, 0.031, uv().distance(vec2(0.125, 0.375))), float(0)) : float(0);
  const uvC: any = packedH ? (mix as any)(uv(), parallaxUV(uv(), float(0.011)), irisW) : uv();
  const tc = texture(h.color, uvC), tn = texture(h.normal, uv());
  const to = texture(h.opacity ?? h.color, uv());
  const tintU = uniform(new THREE.Color(tint[0], tint[1], tint[2]));
  const neckU = uniform(bodyLin ? new THREE.Vector3(bodyLin[0], bodyLin[1], bodyLin[2]) : new THREE.Vector3());
  const fadeW = attribute('hfade', 'float').mul(bodyLin ? 1 : 0);
  // keep the texture's fine detail (luminance ratio) while the colour moves to the body tone
  const skinC = tc.rgb.mul(tintU);
  const neckV = neckU;
  const neckC = neckV.mul(dot(skinC, vec3(0.3, 0.6, 0.1)).div(dot(neckV, vec3(0.3, 0.6, 0.1)).add(1e-4)).clamp(0.6, 1.4));
  // at the seam itself the body colour wins outright (luminance too), so the edge disappears
  const seamC = mix(neckC, neckV, smoothstep(0.55, 1, attribute('hfade', 'float')));
  const cavity = packed ? to.g : float(1);
  m.colorNode = isCard.select(to.rgb, mix(skinC.mul(cavity), seamC, fadeW));
  m.skinWeightNode = isCard.select(float(0), packed ? to.b : float(1));
  m.opacityNode = isCard.select(h.opacity ? to.a : float(1), float(1));
  m.alphaTest = 0.4;
  m.alphaToCoverage = true;
  m.normalNode = isCard.select(normalView, normalMap(tn));
  m.roughnessNode = isCard.select(float(0.65), packed ? to.r : float(0.5));
  // warm transmission through ears and nose, like our own skin shader; none on the cards
  // scaled by the skin's own colour, so darker skin doesn't glow orange
  m.thicknessColorNode = isCard.select(vec3(0), skinC.mul(vec3(1.1, 0.45, 0.3)));
  m.thicknessScaleNode = isCard.select(float(0), float(0.5));
  m.thicknessPowerNode = float(3); m.thicknessDistortionNode = float(0.15);
  return m;
}

/** Linear-space tint that moves a head's measured skin colour onto a target (clamped ±25%). */
export function tintFor(h: HeadAsset | HeadIndexEntry, targetHex: string): [number, number, number] {
  const src = ('meta' in h ? h.meta.skinRGB : h.skinRGB).map(toLin), dst = hexRGB(targetHex).map(toLin);
  return [0, 1, 2].map((i) => Math.min(1.25, Math.max(0.8, (dst[i] + 0.005) / (src[i] + 0.005)))) as [number, number, number];
}

/**
 * Leads keep our strand-card hair: their head and hair share one draw (2 draws per character).
 * The head's vertices join the hair geometry tagged sub 5 (m1.y) with the fade in m0.x.
 */
export function headWithHairMesh(h: HeadAsset, fit: ReturnType<typeof fitHead>, hair: GeoArrays, skeleton: THREE.Skeleton, bindMatrix: THREE.Matrix4, o: HeadMeshOpts) {
  const tmp = headMesh(h, fit, skeleton, bindMatrix, { ...o, noCards: true });
  const hg = tmp.geometry;
  const P = hg.attributes.position.array as Float32Array, N = hg.attributes.normal.array as Float32Array, U = hg.attributes.uv.array as Float32Array;
  const F = hg.attributes.hfade.array as Float32Array, idx = hg.index!.array;
  const n = P.length / 3, hn = hair.vertexCount;
  const cat = (a: ArrayLike<number>, k: number, extra: (v: number, c: number) => number, Ctor: any = Float32Array) => { const out = new Ctor((hn + n) * k); out.set(a as any); for (let v = 0; v < n; v++) for (let c = 0; c < k; c++) out[(hn + v) * k + c] = extra(v, c); return out; };
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cat(hair.position, 3, (v, c) => P[v * 3 + c]), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(cat(hair.normal, 3, (v, c) => N[v * 3 + c]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(cat(hair.uv, 2, (v, c) => U[v * 2 + c]), 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(cat(hair.skinIndex, 4, (v, c) => h.sj[v * 4 + c], Uint16Array), 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(cat(hair.skinWeight, 4, (v, c) => h.sw[v * 4 + c]), 4));
  geo.setAttribute('cA', new THREE.BufferAttribute(cat(hair.cA, 3, () => 0), 3));
  geo.setAttribute('cB', new THREE.BufferAttribute(cat(hair.cB, 3, () => 0), 3));
  geo.setAttribute('m0', new THREE.BufferAttribute(cat(hair.m0, 4, (v, c) => (c === 0 ? F[v] : 1)), 4));
  geo.setAttribute('m1', new THREE.BufferAttribute(cat(hair.m1, 4, (_v, c) => (c === 0 ? 7 : c === 1 ? 5 : 0)), 4));
  const I = new Uint32Array(hair.index.length + idx.length); I.set(hair.index); for (let i = 0; i < idx.length; i++) I[hair.index.length + i] = idx[i] + hn;
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  geo.computeBoundingSphere();
  tmp.geometry.dispose();
  const bt = o.bodyTone ? hexRGB(o.bodyTone).map(toLin) as [number, number, number] : null;
  const m = new THREE.SkinnedMesh(geo, hairMaterial({ color: h.color, normal: h.normal, tint: o.tint ?? [1, 1, 1], bodyLin: bt }));
  m.bind(skeleton, bindMatrix);
  m.frustumCulled = false; m.castShadow = true;
  return m;
}

