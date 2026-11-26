/**
 * Procedural period facade material (TSL node material, WebGPU + WebGL2 backends).
 *
 * Inputs per vertex (meshBuilder): uv = facade metres (u along the wall, v height above the building's
 * ground), facade = (style, condition 0..4, floor height m, seed 0..1), color = style base albedo.
 * Everything is procedural in real units, so window rhythm follows the real floor count of every building.
 *
 * Reads as (docs/STYLE_GUIDE.md):
 *  - window grid by style: tenement 2.6 m bays with tall double-hung sash; lofts wide 3.2 m bays with big
 *    glass; offices 2.4 m punched windows; postwar ribbon-ish 1.8 m
 *  - ground floor: storefront glass between piers for commercial styles, stoop-level for tenements
 *  - brick coursing (77 mm courses, running bond) faded out by pixel footprint (no moire at distance)
 *  - soot: streaks below every sill/cornice band, heavier with worse condition, darker ground floors
 *  - glass: window shades at random heights, some panes boarded on derelict buildings
 *  - night: windows lit by a per-window hash against a time-of-day probability (incandescent / TV / office)
 *  - interiors tier-C hook: `interiorNode` can later replace the lit-window colour with interior mapping
 */
import * as THREE from 'three/webgpu';
import {
  attribute, uv, vec2, vec3, float, fract, floor, step, smoothstep, mix, hash, mx_noise_float,
  normalWorld, uniform, select, vertexColor, clamp, max, min, fwidth, abs, sin,
} from 'three/tsl';

export const facadeUniforms = {
  /** 0 = full day, 1 = deep night (drives lit windows). */
  night: uniform(0),
  /** Real seconds, for subtle flicker (TVs). */
  time: uniform(0),
  /** Global scale on window emission (exposure tuning / debugging). */
  litScale: uniform(0.5),
};

export function createFacadeMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ vertexColors: true });
  const fac = attribute('facade', 'vec4');
  const style = fac.x, cond = fac.y, floorH = fac.z, seed = fac.w;
  const st = uv();
  const u = st.x, v = st.y;
  const isRoof = normalWorld.y.greaterThan(0.6);

  // ---------------------------------------------------------------- window grid
  const isTenement = style.equal(1), isCast = style.equal(2), isLoft = style.equal(3), isPostwar = style.equal(6), isLow = style.equal(7);
  const isDeco = style.equal(9), isBeaux = style.equal(10), isChelsea = style.equal(11);
  const bay = select(isDeco, float(1.55), select(isBeaux, float(1.8), select(isChelsea, float(2.4),
    select(isTenement, float(2.6), select(isCast.or(isLoft), float(3.3), select(isPostwar, float(1.9), float(2.45)))))));
  const winFrac = select(isDeco, float(0.42), select(isBeaux, float(0.58), select(isCast.or(isLoft), float(0.78), select(isPostwar, float(0.82), float(0.5)))));
  const sill = select(isCast.or(isLoft), float(0.2), float(0.3));
  const head = select(isCast.or(isLoft), float(0.86), float(0.84));
  const fu = fract(u.div(bay)), fv = fract(v.div(floorH));
  const floorIdx = floor(v.div(floorH)), bayIdx = floor(u.div(bay));
  const aa = fwidth(u).add(fwidth(v)).mul(0.6).max(0.002);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const edge = (lo: any, x: any, w: any) => smoothstep(lo.sub(w), lo.add(w), x);
  const halfW = winFrac.mul(0.5);
  const inU = edge(float(0.5).sub(halfW), fu, aa.div(bay)).mul(float(1).sub(edge(float(0.5).add(halfW), fu, aa.div(bay))));
  const inV = edge(sill, fv, aa.div(floorH)).mul(float(1).sub(edge(head, fv, aa.div(floorH))));
  const groundFloor = v.lessThan(floorH.mul(1.15));
  // storefronts: tall glass between narrow piers on commercial ground floors (not tenement stoops)
  const storeU = edge(float(0.07), fu, aa.div(bay)).mul(float(1).sub(edge(float(0.93), fu, aa.div(bay))));
  const storeV = edge(float(0.45), v, aa).mul(float(1).sub(edge(floorH.mul(0.82), v, aa)));
  const hasStore = isTenement.not().or(hash(bayIdx.add(seed.mul(911))).lessThan(0.35));
  const storeMask = select(groundFloor.and(hasStore), storeU.mul(storeV), float(0));
  const upperMask = select(groundFloor.and(hasStore), float(0), inU.mul(inV));
  const winMaskSharp = clamp(storeMask.add(upperMask), 0, 1).mul(select(v.greaterThan(0.2), float(1), float(0)));
  // Distance LOD: when a bay is only a few pixels wide the pattern aliases into speckle; fade to the
  // average window coverage instead (also used to average lit windows).
  const bayPx = fwidth(u).div(bay);
  const lodFade = smoothstep(0.03, 0.12, bayPx);
  const coverage = winFrac.mul(head.sub(sill)).mul(0.85);
  const winMask = mix(winMaskSharp, coverage, lodFade);

  // ---------------------------------------------------------------- wall material
  const brickStyle = isTenement.or(isLoft).or(isLow).or(style.equal(0)).or(isChelsea);
  const course = fract(v.div(0.077));
  const rowOff = floor(v.div(0.077)).mul(0.5);
  const head2 = fract(u.div(0.205).add(rowOff));
  const mortar = max(step(course, 0.13), step(head2, 0.05));
  const mortarFade = smoothstep(0.012, 0.004, fwidth(v)); // fade coursing well before a course is < ~4 px (no speckle)
  const mortarK = select(brickStyle, mortar.mul(mortarFade).mul(0.22), float(0));
  const blotch = mx_noise_float(vec3(u.mul(0.11), v.mul(0.13), seed.mul(37))).mul(0.5).add(0.5);
  // banding: sill / cornice lines at each floor (stone in offices, brick soldier courses in tenements)
  const band = smoothstep(0.06, 0.0, fv).mul(select(isCast, float(0.35), float(0.18)));
  // soot: streaks hang below every sill band; worse condition = heavier; ground floor grime
  const dirt = float(4).sub(cond).div(4); // 0 pristine .. 1 derelict
  const streak = mx_noise_float(vec3(u.mul(2.3), v.mul(0.06), seed.mul(13))).mul(0.5).add(0.5);
  const underSill = smoothstep(0.55, 0.0, fv).mul(streak);
  const soot = clamp(dirt.mul(0.55).mul(underSill.mul(0.7).add(0.3)).add(select(groundFloor, float(0.18), float(0))).add(dirt.mul(0.15)), 0, 0.8);
  const wallBase = vertexColor().rgb.mul(blotch.mul(0.22).add(0.88));
  // hero treatments: Beaux-Arts rusticated base (horizontal grooves on the lower floors) and strong cornice bands
  const rustic = select(isBeaux.and(v.lessThan(floorH.mul(3))), step(fract(v.div(0.42)), 0.08).mul(0.3).mul(mortarFade.max(0.4)), float(0));
  const heroBand = select(isBeaux, smoothstep(0.1, 0.0, fv).mul(0.18), float(0));
  const wall = wallBase.mul(float(1).sub(mortarK)).mul(float(1).sub(band)).mul(float(1).sub(soot)).mul(float(1).sub(rustic)).mul(float(1).sub(heroBand));

  // ---------------------------------------------------------------- glass, shades, boarded, lit
  const winId = floorIdx.mul(97.13).add(bayIdx.mul(13.7)).add(seed.mul(1000));
  const rnd = hash(winId), rnd2 = hash(winId.add(17.3)), rnd3 = hash(winId.add(41.9));
  const shadeDown = rnd2.mul(0.8); // fraction of the window covered by a pulled shade
  const shadeHere = fv.greaterThan(head.sub(head.sub(sill).mul(shadeDown))).and(groundFloor.not());
  const glassDay = mix(vec3(0.05, 0.055, 0.06), vec3(0.11, 0.1, 0.09), rnd3);
  // storefronts: dim warm interior behind the glass, a transom band above the door height
  const transom = v.greaterThan(floorH.mul(0.66));
  const storeCol = select(transom, vec3(0.16, 0.13, 0.1), mix(vec3(0.08, 0.06, 0.045), vec3(0.14, 0.1, 0.07), rnd));
  const shadeCol = mix(vec3(0.62, 0.55, 0.42), vec3(0.4, 0.36, 0.3), rnd);
  const boarded = cond.lessThan(0.5).and(rnd3.lessThan(0.45)).or(cond.lessThan(1.5).and(rnd3.lessThan(0.06)));
  const boardCol = vec3(0.32, 0.27, 0.2).mul(mx_noise_float(vec3(u.mul(4), v.mul(0.5), seed)).mul(0.2).add(0.8));
  const inStore = groundFloor.and(hasStore);
  const glassCol = select(boarded, boardCol, select(inStore, storeCol, select(shadeHere, shadeCol, glassDay)));

  // lit probability: residential evenings, offices emptier, derelict dark; storefronts lit at dusk/night
  const resid = isTenement.or(isPostwar);
  const litP = facadeUniforms.night.mul(select(resid, float(0.55), float(0.28))).mul(select(cond.lessThan(0.5), float(0.08), float(1)));
  const isLit = rnd.lessThan(litP).and(boarded.not());
  const office = style.equal(4).or(style.equal(5));
  const tv = rnd3.lessThan(0.12).and(resid);
  const flicker = sin(facadeUniforms.time.mul(7.0).add(rnd.mul(40))).mul(0.15).add(0.85);
  const lampCol = select(office, vec3(0.9, 0.88, 0.72), select(tv, vec3(0.42, 0.55, 1.0).mul(flicker), vec3(1.0, 0.7, 0.38)));
  const storeLit = groundFloor.and(hasStore).and(facadeUniforms.night.greaterThan(0.15)).and(rnd.lessThan(0.7));
  // Emission is modest: the Phase 3 post stack (filmic tonemap + bloom/halation) supplies the glow.
  const emissiveSharp = select(isLit.or(storeLit), lampCol.mul(select(storeLit, float(0.55), float(0.38))), vec3(0));
  const emissiveAvg = lampCol.mul(litP.mul(0.38));
  const emissiveWin = mix(emissiveSharp, emissiveAvg, lodFade);

  // ---------------------------------------------------------------- roofs
  const tar = vec3(0.13, 0.12, 0.115).mul(mx_noise_float(vec3(u.mul(0.4), v.mul(0.4), seed.mul(5))).mul(0.25).add(0.85));

  const spandrel = select(isDeco, inU.mul(float(1).sub(inV)).mul(float(1).sub(lodFade.mul(0.5))), float(0));
  const aluminium = vec3(0.42, 0.42, 0.4);
  const wallDeco = mix(wall, aluminium, spandrel);
  const color = select(isRoof, tar, mix(wallDeco, glassCol, winMask));
  m.colorNode = color;
  m.roughnessNode = select(isRoof, float(0.95), mix(float(0.9), select(boarded.or(shadeHere), float(0.8), float(0.12)), winMask));
  m.metalnessNode = spandrel.mul(0.6);
  m.emissiveNode = select(isRoof, vec3(0), emissiveWin.mul(winMask).mul(facadeUniforms.litScale));
  void abs; void min; void vec2;
  return m;
}
