/**
 * Street-level ground material (TSL): world-space so patterns run seamlessly across chunk borders.
 * facade.x = surface kind: 0 road, 1 sidewalk, 2 park, 3 lot, 4 plaza, 10 curb face.
 *   road     warm patched asphalt (STYLE_GUIDE asphalt.dry #3a2f2c), large repair patches, aggregate speckle
 *   sidewalk concrete slabs on 1.5 m grid-aligned joints, stains and gum spots, darker by the curb
 *   lot      darker asphalt with oil stains     park  olive grass/dirt     curb  granite
 * Fine detail fades out by pixel footprint (no shimmer at distance).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as THREE from 'three/webgpu';
import { attribute, positionWorld, vec3, float, fract, smoothstep, mix, select, mx_noise_float, fwidth, min, abs, max } from 'three/tsl';

export function createGroundMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial();
  const kind: any = attribute('facade', 'vec4').x;
  const p: any = positionWorld;
  const x = p.x, z = p.z;
  const px = fwidth(x).add(fwidth(z)); // metres per pixel
  const fine = smoothstep(0.08, 0.02, px); // 1 near, 0 far

  // shared noise layers
  const n1 = mx_noise_float(vec3(x.mul(0.045), z.mul(0.045), 3.1)).mul(0.5).add(0.5); // large patches
  const n2 = mx_noise_float(vec3(x.mul(0.35), z.mul(0.35), 7.7)).mul(0.5).add(0.5); // stains
  const n3 = mx_noise_float(vec3(x.mul(9), z.mul(9), 1.3)).mul(0.5).add(0.5); // aggregate / grit

  // road: warm asphalt, repair patches (darker newer tar vs grey older), grit
  const patch = smoothstep(0.55, 0.62, n1);
  // worn 1974 asphalt: oxidised grey-mauve (refs: the roadway reads mid-tone in sun), darker fresh tar patches
  const asphalt = mix(vec3(0.115, 0.098, 0.092), vec3(0.055, 0.046, 0.043), patch)
    .mul(float(0.9).add(n2.mul(0.18))).mul(float(1).add(n3.sub(0.5).mul(0.25).mul(fine)));

  // sidewalk: slabs on a 1.5 m world grid (streets are grid-aligned), joint lines, stains
  const jx = abs(fract(x.div(1.5)).sub(0.5)).mul(1.5), jz = abs(fract(z.div(1.5)).sub(0.5)).mul(1.5);
  const joint = smoothstep(0.035, 0.0, min(float(0.75).sub(jx), float(0.75).sub(jz))).mul(fine);
  const slabTone = mx_noise_float(vec3(x.div(1.5).floor(), z.div(1.5).floor(), 5.5)).mul(0.06);
  // stains: soft and low-contrast (hard 3 m blotches read as camouflage from above)
  const n4 = mx_noise_float(vec3(x.mul(0.9), z.mul(0.9), 2.2)).mul(0.5).add(0.5);
  const stain = smoothstep(0.58, 0.95, n2).mul(0.1).add(smoothstep(0.7, 0.95, n4).mul(0.08));
  const gum = smoothstep(0.93, 0.97, n3).mul(fine).mul(0.35);
  const concrete = vec3(0.2, 0.178, 0.155).mul(float(1).add(slabTone)).mul(float(1).sub(joint.mul(0.45))).mul(float(1).sub(stain)).mul(float(1).sub(gum));

  const lot = vec3(0.04, 0.034, 0.03).mul(float(1).sub(smoothstep(0.5, 0.75, n2).mul(0.5))).mul(float(0.9).add(n3.mul(0.15).mul(fine)));
  const park = mix(vec3(0.05, 0.065, 0.022), vec3(0.08, 0.065, 0.04), smoothstep(0.4, 0.7, n1)); // olive grass / worn dirt
  const curb = vec3(0.17, 0.16, 0.15).mul(float(0.85).add(n3.mul(0.2)));

  // road paint: worn, dirty white and faded yellow; patchy where traffic has scrubbed it off
  const wear = smoothstep(0.35, 0.75, n2).mul(0.55).add(n3.mul(0.15).mul(fine));
  const paintWhite = mix(vec3(0.42, 0.4, 0.36), asphalt, wear);
  const paintYellow = mix(vec3(0.42, 0.29, 0.07), asphalt, wear);
  const k = kind;
  const col = select(k.greaterThan(20.5), paintYellow, select(k.greaterThan(19.5), paintWhite, select(k.greaterThan(9.5), curb,
    select(k.lessThan(0.5), asphalt,
      select(k.lessThan(1.5), concrete,
        select(k.lessThan(2.5), park,
          select(k.lessThan(3.5), lot, concrete)))))));
  m.colorNode = col;
  m.roughnessNode = select(k.lessThan(0.5).or(k.greaterThan(2.5).and(k.lessThan(3.5))), float(0.92).sub(patch.mul(0.12)), float(0.95));
  m.metalnessNode = float(0);
  void max;
  return m;
}
