/**
 * Character materials (TSL node materials, WebGPU and WebGL2):
 *   - characterMaterial(): one shared material for skin, cloth, leather, eyes, teeth, lenses,
 *     metal and paper, switched by a per-vertex kind (see build/MeshBuilder.ts). Skin uses the
 *     subsurface approximation of MeshSSSNodeMaterial plus procedural tone variation, pores,
 *     age wrinkles, stubble, lips and sweat sheen. Cloth has procedural 1974 patterns evaluated
 *     on the rest-pose surface (no swimming), fade, dirt, hem dust and heat sweat darkening.
 *   - hairMaterial(): alpha-tested strand shells.
 * Per-vertex data means every character shares one compiled pipeline per material.
 */
import * as THREE from 'three/webgpu';
import {
  attribute, positionGeometry, normalGeometry, texture, float, vec2, vec3, mix, smoothstep, step, fract, abs, sin, cos, Fn, If, uniform,
  mx_noise_float, mx_worley_noise_float, bumpMap, max, min, floor, dot, length, clamp, atan, pow, normalize, normalMap, normalView,
} from 'three/tsl';

/** Global character look controls (heat drives sweat; set by the engine's weather/time). */
export const charUniforms = {
  heat: uniform(0.7),
  wetness: uniform(0),
  time: uniform(0),
};

const KIND = { skin: 0, cloth: 1, leather: 2, eye: 3, teeth: 4, lens: 5, metal: 6, hosiery: 8, paper: 9, rubber: 10 };

function luminance(c: any) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/**
 * Fabric detail height maps (CC0, Poly Haven; docs/CHARACTER_SOURCES.md), packed RGB:
 *   a: wool herringbone, denim twill, cotton jersey;  b: poplin, corduroy, leather grain.
 * Installed by the factory before materials are built (index.ts); without them the relief is flat.
 */
export const fabricMaps = { a: new THREE.Texture(), b: new THREE.Texture() };
for (const t of [fabricMaps.a, fabricMaps.b]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; }
/** Install the loaded maps (the factory awaits them before any material is built). */
export function setFabricMaps(a: THREE.Texture, b: THREE.Texture) {
  for (const t of [a, b]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; t.needsUpdate = true; }
  fabricMaps.a = a; fabricMaps.b = b;
}
/**
 * Skin detail (MakeHuman CC0 skins, normalised to detail; tools/characters/build-skins.py): a
 * texture array sampled with the MakeHuman UVs (attribute uv1 = u, v, layer). High has 18 layers
 * (age × sex × ancestry), Low 6 (age × sex). Installed by the factory before materials are built.
 */
export const skinMaps = { strip: (() => { const t = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); t.needsUpdate = true; return t; })() as THREE.Texture, layers: 18 };
export function setSkinMaps(strip: THREE.Texture, layers: number) { skinMaps.strip = strip; skinMaps.layers = layers; }
/** Real-world tile size of the scanned swatches (m). */
const FABRIC_TILE = 0.27;

/** Shared surface shading (colour, roughness, micro-relief) from the per-vertex material data.
 *  `tint` (crowds) recolours garment slots per instance. */
export function surfaceNodes(tint?: (col: any) => any) {
  const cA = attribute('cA', 'vec3'), cB = attribute('cB', 'vec3');
  const m0 = attribute('m0', 'vec4'), m1 = attribute('m1', 'vec4');
  const uvA = attribute('uv', 'vec2');
  const kind = floor(m1.x.add(0.5));
  const p = positionGeometry; // rest pose: patterns stick to the body
  // photographic skin detail (CC0 MakeHuman skins) through the MakeHuman UVs; sampled always (uniform control flow)
  const u1 = attribute('uv1', 'vec3');
  // tiles are stacked top to bottom; Low's 6 tiles are ancestry-averaged (layer / 3)
  const L = skinMaps.layers;
  const layer = (L < 18 ? floor(u1.z.div(3)) : u1.z).max(0);
  // keep a 1-texel margin inside each tile so mips/filtering don't bleed between neighbours
  const tv = float(1).sub(u1.y).clamp(0.002, 0.998);
  const skinTex = texture(skinMaps.strip, vec2(u1.x, layer.add(tv).div(L))).rgb.mul(2);
  // the default skins are smooth after normalisation: lift their contrast a little
  const skinDetail = mix(vec3(1), skinTex.sub(1).mul(1.8).add(1).max(0.2), step(0, u1.z).mul(0.9));

  // --- cloth patterns ------------------------------------------------------------------------
  const pattern = Fn(() => {
    const id = floor(m0.x.add(0.5));
    const sc = max(m0.y, 0.002);
    const col = vec3(cA).toVar();
    const around = atan(p.x, p.z).mul(0.16); // ≈ metres around the torso/limbs
    const u = p.x.add(p.z.mul(0.35)), v = p.y;
    If(id.equal(1), () => { col.assign(mix(cA, cB, step(0.5, fract(v.div(sc))))); }); // horizontal stripes
    If(id.equal(2), () => { col.assign(mix(cA, cB, step(0.62, fract(around.div(sc))))); }); // vertical stripes
    If(id.equal(3), () => { col.assign(mix(cA, cB, step(0.9, fract(around.div(sc))).mul(0.8))); }); // pinstripe
    If(id.equal(4), () => { // plaid: two overlapping stripe sets + a thin over-check
      const a = step(0.6, fract(v.div(sc))), b = step(0.6, fract(around.div(sc)));
      const thin = step(0.93, fract(v.div(sc).mul(2).add(0.3))).add(step(0.93, fract(around.div(sc).mul(2).add(0.3))));
      col.assign(mix(mix(cA, cB, a.add(b).mul(0.4)), cB.mul(0.6), min(thin, 1).mul(0.6)));
    });
    If(id.equal(5), () => { const a = step(0.5, fract(v.div(sc))), b = step(0.5, fract(around.div(sc))); col.assign(mix(cA, cB, abs(a.sub(b)))); });
    If(id.equal(6), () => { // houndstooth (approximate: check sheared along diagonals)
      const s1 = fract(v.div(sc).add(around.div(sc))), s2 = fract(v.div(sc).sub(around.div(sc)).mul(0.5));
      col.assign(mix(cA, cB, step(0.5, s1).mul(step(0.25, s2)).add(step(0.75, s2).mul(0.6))));
    });
    If(id.equal(7).or(id.equal(8)), () => { // paisley / floral: soft blobs with a darker core
      const w = mx_worley_noise_float(vec3(u, v, p.z).div(sc).mul(1.3));
      const blob = smoothstep(0.42, 0.3, w);
      const core = smoothstep(0.18, 0.1, w);
      const third = mix(cB, cA.mul(0.45), 0.5);
      col.assign(mix(mix(cA, cB, blob), third, core.mul(id.equal(8).select(0.8, 0.5))));
    });
    If(id.equal(9), () => { col.assign(cA.mul(mix(0.82, 1.0, step(0.5, fract(around.div(sc)))))); }); // rib knit
    If(id.equal(10), () => { const n = mx_noise_float(p.mul(900)); col.assign(mix(cA, cB, smoothstep(0.35, 0.8, n).mul(0.45))); }); // tweed / straw
    If(id.equal(11), () => { // denim twill: diagonal fine lines, white weft showing at wear points
      const tw = step(0.5, fract(v.add(around).div(sc)));
      const n = mx_noise_float(p.mul(vec3(30, 4, 30)));
      col.assign(mix(cA.mul(0.85), cA.mul(1.15).add(0.03), tw).mul(mix(0.92, 1.12, n)));
    });
    If(id.equal(12), () => { // geometric 70s print: staggered diamond lattice with outlined centres (no rings/targets)
      const gy = v.div(sc), row = floor(gy);
      const gx = around.div(sc).add(row.mul(0.5));
      const d = abs(fract(gx).sub(0.5)).add(abs(fract(gy).sub(0.5)));
      const fill = smoothstep(0.3, 0.27, d), line = smoothstep(0.37, 0.39, d).mul(smoothstep(0.45, 0.43, d));
      col.assign(mix(mix(cA, cB, fill), cB.mul(0.55), line.mul(0.8)));
    });
    return col;
  });

  // --- colour by kind ------------------------------------------------------------------------
  const nLow = mx_noise_float(p.mul(7));
  const nMid = mx_noise_float(p.mul(60));
  const nHi = mx_noise_float(p.mul(420));
  const color = Fn(() => {
    const c = vec3(cA).toVar();
    If(kind.equal(KIND.skin), () => {
      // tone variation, redness, lips, brows, stubble, freckles, age spots
      const melanin = m1.y;
      const base = cA.mul(mix(0.94, 1.06, nLow)).mul(skinDetail).toVar();
      base.assign(mix(base, base.mul(vec3(1.06, 0.9, 0.9)), cB.x.mul(0.35).mul(smoothstep(0.3, 0.8, nLow))));
      const lips = m0.x;
      base.assign(mix(base, base.mul(vec3(0.78, 0.52, 0.52)).mul(mix(1.1, 0.85, melanin)), lips.mul(0.85)));
      // brows painted as short strokes (fine shells alias without TAA)
      const strokes = smoothstep(0.35, 0.7, mx_noise_float(vec3(p.x.mul(900), p.y.mul(260), p.z.mul(900))).mul(0.5).add(0.5));
      base.assign(mix(base, mix(base.mul(0.35), vec3(0.03, 0.025, 0.022), 0.6), m0.y.mul(mix(0.55, 0.95, strokes))));
      const stubble = m0.z.mul(smoothstep(0.45, 0.75, nHi));
      base.assign(mix(base, vec3(0.06, 0.055, 0.06), stubble.mul(0.55)));
      const freck = cB.y.mul(smoothstep(0.62, 0.72, mx_noise_float(p.mul(260))));
      base.assign(mix(base, base.mul(vec3(0.72, 0.56, 0.42)), freck));
      const spots = cB.z.mul(smoothstep(0.66, 0.75, mx_noise_float(p.mul(55))));
      base.assign(mix(base, base.mul(vec3(0.75, 0.62, 0.5)), spots.mul(0.6)));
      c.assign(base);
    });
    If(kind.equal(KIND.hosiery), () => {
      const sheer = m1.y;
      c.assign(mix(cA.mul(mix(0.94, 1.06, nLow)), cB, sheer.mul(0.55)).mul(mix(1, 0.92, sheer)));
    });
    If(kind.equal(KIND.cloth).or(kind.equal(KIND.leather)).or(kind.equal(KIND.rubber)), () => {
      const col = pattern().toVar();
      // fade: towards a chalky, slightly lighter grey; dirt: grime and dust
      const fade = m1.y;
      col.assign(mix(col, vec3(luminance(col)).mul(1.1).add(0.03), fade.mul(0.45)));
      const dirtN = smoothstep(0.35, 0.75, mx_noise_float(p.mul(22)));
      col.assign(mix(col, vec3(0.17, 0.14, 0.11), m1.z.mul(dirtN).mul(0.35)));
      // heat sweat: darker, irregular patches
      const sweat = m1.w.mul(charUniforms.heat).mul(smoothstep(0.25, 0.6, mx_noise_float(p.mul(9))));
      col.assign(col.mul(mix(1, 0.72, clamp(sweat, 0, 1))));
      // fabric micro-variation
      col.assign(col.mul(mix(0.95, 1.04, nHi)));
      c.assign(col);
    });
    If(kind.equal(KIND.eye), () => {
      const ang = m0.x, iris = m0.y, pupil = m0.z;
      const r = ang.div(iris);
      const streak = mx_noise_float(vec3(atan(p.x.mul(1000), p.y.mul(1000)).mul(6), r.mul(4), 0));
      const irisCol = cA.mul(mix(0.55, 1.25, streak)).mul(mix(1.0, 0.6, smoothstep(0.75, 1.0, r)));
      // the sclera darkens toward the corners and under the lids (no lid AO otherwise)
      const sclera = cB.mul(mix(1.0, 0.62, smoothstep(1.25, 2.3, r)));
      c.assign(mix(mix(vec3(0.01), irisCol, smoothstep(pupil.mul(0.95), pupil.mul(1.05), ang)), sclera, smoothstep(iris.mul(0.95), iris.mul(1.05), ang)));
    });
    If(kind.equal(KIND.lens), () => { c.assign(mix(vec3(0.55, 0.6, 0.6), vec3(0.02, 0.02, 0.015), m0.x)); });
    If(kind.equal(KIND.paper), () => { // newsprint: text columns on light paper
      const cols = step(0.08, fract(p.x.mul(40))).mul(step(0.5, fract(p.y.mul(400)))).mul(step(0.3, nMid));
      c.assign(mix(cA, cB, cols.mul(m1.y.greaterThan(0.15).select(0.55, 0))));
    });
    return c;
  });

  const roughness = Fn(() => {
    const r = float(m0.z).toVar();
    If(kind.equal(KIND.skin).or(kind.equal(KIND.hosiery)), () => {
      const oily = m1.w.mul(charUniforms.heat).mul(0.25);
      r.assign(mix(0.58, 0.42, m0.x).sub(oily).add(nHi.mul(0.08)));
    });
    If(kind.equal(KIND.cloth), () => { r.assign(mix(m0.z, 0.5, m0.w.mul(0.6)).add(m1.z.mul(0.1))); });
    If(kind.equal(KIND.leather), () => { r.assign(m0.z.add(m1.z.mul(smoothstep(0.4, 0.8, nMid)).mul(0.35))); });
    If(kind.equal(KIND.eye), () => { r.assign(0.06); });
    If(kind.equal(KIND.teeth), () => { r.assign(0.3); });
    If(kind.equal(KIND.lens), () => { r.assign(0.04); });
    return clamp(r.sub(charUniforms.wetness.mul(0.35)), 0.03, 1);
  });

  // --- micro relief: pores and wrinkles (skin), weave (cloth), grain (leather) ----------------
  // triplanar in bind space (no UVs on cut garments); sampled unconditionally (uniform control flow)
  const tq = p.div(FABRIC_TILE);
  const tw0 = pow(abs(normalGeometry), vec3(4)), tw = tw0.div(tw0.x.add(tw0.y).add(tw0.z).add(1e-5));
  const tri = (t: THREE.Texture) => texture(t, tq.yz).mul(tw.x).add(texture(t, tq.xz).mul(tw.y)).add(texture(t, tq.xy).mul(tw.z));
  const fa = tri(fabricMaps.a), fb = tri(fabricMaps.b);
  const pid = floor(m0.x.add(0.5));
  // which swatch a cloth uses: denim twill, wool (suitings, tweeds, checks), jersey (knits), else shirting poplin
  const wool = pid.equal(3).or(pid.equal(4)).or(pid.equal(5)).or(pid.equal(6)).or(pid.equal(10)).or(m0.z.greaterThan(0.6).and(m0.w.lessThan(0.2)).and(pid.equal(0)));
  const clothDetail = pid.equal(11).select(fa.y, wool.select(fa.x, pid.equal(9).select(fa.z, fb.x)));
  const height = Fn(() => {
    const h = float(0).toVar();
    If(kind.equal(KIND.skin), () => {
      const age = m1.z; // 0..1 (90 years)
      const pores = mx_noise_float(p.mul(1600)).mul(0.25);
      const forehead = uvA.x.mul(smoothstep(0.35, 0.8, age)).mul(sin(p.y.mul(900)).mul(0.5).add(0.5));
      const crows = uvA.y.mul(smoothstep(0.3, 0.75, age)).mul(sin(atan(p.y.mul(100), abs(p.x).mul(100)).mul(40)).mul(0.5).add(0.5));
      h.assign(pores.add(forehead.mul(0.9)).add(crows.mul(0.7)).add(nMid.mul(0.15).mul(age)));
    });
    If(kind.equal(KIND.cloth), () => { h.assign(clothDetail.mul(0.85).add(mx_noise_float(p.mul(300)).mul(0.12))); });
    If(kind.equal(KIND.leather), () => { h.assign(fb.z.mul(0.6).add(mx_noise_float(p.mul(700)).mul(0.1))); });
    return h;
  });

  const col = tint ? tint(color()) : color();
  return { color: col, roughness: roughness(), height: height(), kind, m0, m1, detail: vec3(fa.x, fa.y, fb.z), skinDet: skinTex.mul(0.5) };
}

let shared: THREE.MeshSSSNodeMaterial | null = null;
export function characterMaterial(): THREE.MeshSSSNodeMaterial {
  if (shared) return shared;
  // double-sided: the inside of collars, cuffs and hems shows fabric, not a hole
  const m = new THREE.MeshSSSNodeMaterial({ side: THREE.DoubleSide });
  const { color: col, roughness: rough, height: h, kind, m0, m1 } = surfaceNodes();
  m.colorNode = col;
  m.roughnessNode = rough;
  m.metalnessNode = kind.equal(KIND.metal).select(float(0.9), float(0));
  m.normalNode = bumpMap(h, kind.equal(KIND.skin).select(float(0.0006), float(0.0007)));
  // polyester/satin sheen; skin peach fuzz
  m.sheenNode = kind.equal(KIND.cloth).select(vec3(m0.w.mul(0.35)), kind.equal(KIND.skin).select(vec3(0.04), vec3(0)));
  m.sheenRoughnessNode = float(0.45);
  m.clearcoatNode = kind.equal(KIND.eye).or(kind.equal(KIND.lens)).select(float(1), float(0));
  m.clearcoatRoughnessNode = float(0.03);
  // subsurface (skin only): warm red transmission through thin parts (ears, nose, fingers)
  const isSkin = kind.equal(KIND.skin).or(kind.equal(KIND.hosiery));
  m.thicknessColorNode = isSkin.select(mix(vec3(0.45, 0.1, 0.05), vec3(0.18, 0.05, 0.03), m1.y), vec3(0));
  m.thicknessDistortionNode = float(0.15);
  m.thicknessAmbientNode = float(0.0);
  m.thicknessAttenuationNode = float(0.6);
  m.thicknessPowerNode = float(3.0);
  m.thicknessScaleNode = isSkin.select(float(1.2), float(0));
  shared = m;
  void cos; void pow; void normalize;
  return m;
}

let sharedHair: THREE.MeshPhysicalNodeMaterial | null = null;
const tex2D = texture; // (hairMaterial shadows `texture` with the hair-texture attribute)
/** rb: a Rocketbox face merged into this draw (leads keep our hair): vertices with sub 5 use its textures. */
export interface HairFace { color: THREE.Texture; normal: THREE.Texture; tint: [number, number, number]; bodyLin: [number, number, number] | null }
export function hairMaterial(rb?: HairFace): THREE.MeshPhysicalNodeMaterial {
  if (sharedHair && !rb) return sharedHair;
  const m = new THREE.MeshPhysicalNodeMaterial({ side: THREE.DoubleSide });
  const cA = attribute('cA', 'vec3'), cB = attribute('cB', 'vec3');
  const m0 = attribute('m0', 'vec4'), m1 = attribute('m1', 'vec4');
  const uvA = attribute('uv', 'vec2');
  const h = m0.x, density = m0.y, freq = m0.z, texture = m0.w;
  const sub = floor(m1.y.add(0.5));
  // anisotropic strands for straight hair (long along v), round clumps for curly/coily
  // anisotropic strands for straight hair (long along v), round clumps for curly/coily
  const f = freq.mul(mix(0.55, 0.3, smoothstep(0.5, 0.9, texture)));
  const straight = mx_noise_float(vec3(uvA.x.mul(f), uvA.y.mul(f).mul(0.07), h.mul(0.7)));
  const curly = mx_noise_float(vec3(uvA.x.mul(f), uvA.y.mul(f), h.mul(4)));
  const n = mix(straight, curly, smoothstep(0.35, 0.8, texture)).mul(0.5).add(0.5);
  const cornrow = m1.w.greaterThan(0.5).and(m1.w.lessThan(1.5)).select(smoothstep(0.25, 0.4, abs(fract(uvA.x.mul(45)).sub(0.5)).mul(-1).add(0.5)), float(1));
  // coily hair: clumps (Worley cells) that shrink outward, so the silhouette breaks into tufts
  const clumpD = mx_worley_noise_float(vec3(uvA.mul(freq.mul(0.045)), h.mul(1.7)));
  const clump = m1.w.greaterThan(1.5).select(smoothstep(1.1, 0.45, clumpD.add(h.mul(0.15))).mul(mix(0.85, 1.15, n)), float(1));
  const alpha = Fn(() => {
    const a = m1.w.greaterThan(1.5).select(clump.mul(density), n.mul(density).mul(cornrow)).toVar();
    // shells thin out towards the tips; the innermost layer is solid scalp coverage
    const keep = smoothstep(h.mul(0.75).sub(0.06), h.mul(0.75).add(0.06), a);
    return sub.equal(3).select(float(1), h.lessThan(0.02).select(density.mul(cornrow), keep));
  });
  // strand cards (sub 4): uv.x = card id + across (0..1), uv.y = root → tip
  const cu = fract(uvA.x), seed = floor(uvA.x), cv = uvA.y;
  const strand = mx_noise_float(vec3(cu.mul(11).add(seed.mul(3.7)), cv.mul(1.2).add(seed.mul(0.37)), seed.mul(0.11))).mul(0.5).add(0.5);
  const strandEnd = mx_noise_float(vec3(cu.mul(40).add(seed), seed.mul(1.3), 2.0)).mul(0.5).add(0.5).mul(0.35).add(0.65);
  const cardAlpha = smoothstep(0.22, 0.6, strand)
    .mul(smoothstep(0.0, 0.22, cu).mul(smoothstep(1.0, 0.78, cu)))
    .mul(smoothstep(strandEnd, strandEnd.sub(0.12), cv))
    .mul(smoothstep(0.0, 0.06, cv).mul(0.6).add(0.4))
    .mul(1.35);
  // grey strands: per strand on cards, fine salt-and-pepper on shells (independent of the shell's clump size)
  const greyShell = step(0.5, mx_noise_float(vec3(uvA.mul(900), 3)).add(0.5));
  const greyCard = step(0.5, mx_noise_float(vec3(cu.mul(11).add(seed.mul(5.3)), seed, 7)).add(0.5));
  const grey = m1.z.mul(sub.equal(4).select(greyCard, greyShell));
  m.opacityNode = sub.equal(4).select(cardAlpha, alpha());
  m.alphaTest = 0.3;
  m.alphaToCoverage = true;

  // inner layers darker (self-shadowing), tips lighter; grey strands mixed in by age
  const shellCol = mix(cA.mul(m1.w.greaterThan(1.5).select(float(0.82), float(0.55))), cB, h.mul(0.8).add(0.1)).mul(mix(0.8, 1.15, n));
  // cards: darker near the root and on inner layers, strand-to-strand variation, lighter tips
  const cardCol = mix(cA.mul(0.62), cB, cv.mul(0.55).add(h.mul(0.25))).mul(mix(0.72, 1.18, strand));
  m.colorNode = mix(sub.equal(4).select(cardCol, shellCol), vec3(0.72, 0.7, 0.67), grey);
  if (rb) {
    // the face: texture × tint, neck fading into the body tone (m0.x = fade), normal-mapped, opaque
    const isFace = sub.equal(5);
    const tc = tex2D(rb.color, uvA).rgb.mul(vec3(rb.tint[0], rb.tint[1], rb.tint[2]));
    const nb = rb.bodyLin ? vec3(rb.bodyLin[0], rb.bodyLin[1], rb.bodyLin[2]) : tc;
    const neckC = nb.mul(dot(tc, vec3(0.3, 0.6, 0.1)).div(dot(nb, vec3(0.3, 0.6, 0.1)).add(1e-4)).clamp(0.6, 1.4));
    const faceCol = mix(tc, mix(neckC, nb, smoothstep(0.55, 1, m0.x)), m0.x.mul(rb.bodyLin ? 1 : 0));
    const dbgRB = typeof location !== 'undefined' && location.search.includes('rbdbg');
    m.colorNode = isFace.select(dbgRB ? vec3(1, 0, 1) : faceCol, m.colorNode as any) as any;
    m.opacityNode = isFace.select(float(1), m.opacityNode as any) as any;
    m.normalNode = isFace.select(normalMap(tex2D(rb.normal, uvA)), normalView);
    m.roughnessNode = isFace.select(float(0.5), float(0.62));
    m.sheenNode = isFace.select(vec3(0.03), cA.mul(0.6).add(0.03));
    m.sheenRoughnessNode = float(0.35);
    m.specularIntensityNode = isFace.select(float(0.5), float(0.3));
    return m;
  }
  m.roughnessNode = float(0.62);
  m.sheenNode = cA.mul(0.6).add(0.03);
  m.sheenRoughnessNode = float(0.35);
  m.specularIntensityNode = float(0.3);
  sharedHair = m;
  void max; void min; void cos; void pow; void normalize; void length;
  return m;
}
