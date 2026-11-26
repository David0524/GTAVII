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
  attribute, positionGeometry, float, vec2, vec3, mix, smoothstep, step, fract, abs, sin, cos, Fn, If, uniform,
  mx_noise_float, mx_worley_noise_float, bumpMap, max, min, floor, dot, length, clamp, atan, pow, normalize,
} from 'three/tsl';

/** Global character look controls (heat drives sweat; set by the engine's weather/time). */
export const charUniforms = {
  heat: uniform(0.7),
  wetness: uniform(0),
  time: uniform(0),
};

const KIND = { skin: 0, cloth: 1, leather: 2, eye: 3, teeth: 4, lens: 5, metal: 6, hosiery: 8, paper: 9, rubber: 10 };

function luminance(c: any) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/** Shared surface shading (colour, roughness, micro-relief) from the per-vertex material data.
 *  `tint` (crowds) recolours garment slots per instance. */
export function surfaceNodes(tint?: (col: any) => any) {
  const cA = attribute('cA', 'vec3'), cB = attribute('cB', 'vec3');
  const m0 = attribute('m0', 'vec4'), m1 = attribute('m1', 'vec4');
  const uvA = attribute('uv', 'vec2');
  const kind = floor(m1.x.add(0.5));
  const p = positionGeometry; // rest pose: patterns stick to the body

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
    If(id.equal(12), () => { // geometric 70s print: rings
      const g = fract(length(vec2(fract(around.div(sc)).sub(0.5), fract(v.div(sc)).sub(0.5))).mul(3));
      col.assign(mix(cA, cB, step(0.5, g)));
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
      const base = cA.mul(mix(0.94, 1.06, nLow)).toVar();
      base.assign(mix(base, base.mul(vec3(1.06, 0.9, 0.9)), cB.x.mul(0.35).mul(smoothstep(0.3, 0.8, nLow))));
      const lips = m0.x;
      base.assign(mix(base, base.mul(vec3(0.78, 0.52, 0.52)).mul(mix(1.1, 0.85, melanin)), lips.mul(0.85)));
      base.assign(mix(base, base.mul(0.82), m0.y.mul(0.5))); // under-brow
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
      const sclera = cB.mul(mix(1.0, 0.85, smoothstep(1.4, 2.2, r)));
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
  const height = Fn(() => {
    const h = float(0).toVar();
    If(kind.equal(KIND.skin), () => {
      const age = m1.z; // 0..1 (90 years)
      const pores = mx_noise_float(p.mul(1600)).mul(0.25);
      const forehead = uvA.x.mul(smoothstep(0.35, 0.8, age)).mul(sin(p.y.mul(900)).mul(0.5).add(0.5));
      const crows = uvA.y.mul(smoothstep(0.3, 0.75, age)).mul(sin(atan(p.y.mul(100), abs(p.x).mul(100)).mul(40)).mul(0.5).add(0.5));
      h.assign(pores.add(forehead.mul(0.9)).add(crows.mul(0.7)).add(nMid.mul(0.15).mul(age)));
    });
    If(kind.equal(KIND.cloth), () => { h.assign(mx_noise_float(p.mul(1100)).mul(0.5).add(sin(p.y.mul(2600)).mul(0.25))); });
    If(kind.equal(KIND.leather), () => { h.assign(mx_noise_float(p.mul(700)).mul(0.4)); });
    return h;
  });

  const col = tint ? tint(color()) : color();
  return { color: col, roughness: roughness(), height: height(), kind, m0, m1 };
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
  m.normalNode = bumpMap(h, kind.equal(KIND.skin).select(float(0.0006), float(0.0004)));
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
export function hairMaterial(): THREE.MeshPhysicalNodeMaterial {
  if (sharedHair) return sharedHair;
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
  const cornrow = m1.w.greaterThan(0.5).select(smoothstep(0.25, 0.4, abs(fract(uvA.x.mul(45)).sub(0.5)).mul(-1).add(0.5)), float(1));
  const alpha = Fn(() => {
    const a = n.mul(density).mul(cornrow).toVar();
    // shells thin out towards the tips; the innermost layer is solid scalp coverage
    const keep = smoothstep(h.mul(0.75).sub(0.06), h.mul(0.75).add(0.06), a);
    return sub.equal(3).select(float(1), h.lessThan(0.02).select(density.mul(cornrow), keep));
  });
  m.opacityNode = alpha();
  m.alphaTest = 0.32;
  const grey = m1.z.mul(step(0.5, mx_noise_float(vec3(uvA.mul(freq.mul(0.7)), 3)).add(0.5)));
  // inner layers darker (self-shadowing), tips lighter; grey strands mixed in by age
  m.colorNode = mix(mix(cA.mul(0.55), cB, h.mul(0.8).add(0.1)).mul(mix(0.8, 1.15, n)), vec3(0.72, 0.7, 0.67), grey);
  m.roughnessNode = float(0.48);
  m.sheenNode = cA.mul(0.6).add(0.03);
  m.sheenRoughnessNode = float(0.35);
  m.specularIntensityNode = float(0.6);
  sharedHair = m;
  void max; void min; void cos; void pow; void normalize; void length;
  return m;
}
