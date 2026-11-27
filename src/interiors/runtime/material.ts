/**
 * Interior uber-material (TSL, WebGPU + WebGL2). Unlit by scene lights on purpose: interiors are
 * lit by their own baked lamp + window light, scaled per interior by uniforms, so the sun never
 * leaks through walls and a brownout is a uniform change, not a rebuild.
 *
 *   colour = albedo(pattern) * (lamp.rgb * lampPower + window * windowLight + ambient) + emissive * lampPower
 *
 * Patterns are procedural (no textures shipped): checker and hex tile, planks, linoleum, terrazzo,
 * wallpaper, subway tile, two-tone dado, pressed tin, brick, paneling, acoustic tile, chrome,
 * vinyl, formica, mirror, baize, tar, glass block, lettering, carpet, concrete, fabric, wood.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, uniform, vec2, vec3, vec4, float, floor, fract, sin, abs, mix, step, smoothstep, max, min, dot, If,
  positionWorld, normalWorld, normalView, positionViewDirection, mod, time, clamp, length, select, fwidth, cameraPosition, normalize, reflect,
} from 'three/tsl';

/** Per-object uniforms read from object.userData.interior (set by the streamer). */
export interface InteriorLook { lampPower: number; lampTint: THREE.Color; window: THREE.Color; ambient: number; flicker: number }

// TSL node graphs are typed loosely here: the generic node types don't compose across Fn boundaries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
// sin-free hash (Hoskins "hash12"): stays uniform for |p| up to ~1e4 in float32, where fract(sin(dot)) collapses into
// per-pixel noise at Manhattan-scale world coordinates (engine report, 2026-11-27). Inputs are also wrapped with mod.
const h21 = Fn(([p]: [N]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, vec3(p3.y, p3.z, p3.x).add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});
const noise2 = Fn(([p]: [N]) => {
  const i: N = floor(p), f: N = fract(p), u: N = f.mul(f).mul(float(3).sub(f.mul(2)));
  const a = h21(i), b = h21(i.add(vec2(1, 0))), c = h21(i.add(vec2(0, 1))), d = h21(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});
const fbm = Fn(([p]: [N]) => noise2(p).mul(0.55).add(noise2(p.mul(2.7)).mul(0.3)).add(noise2(p.mul(7.1)).mul(0.15)));
/** grout/line mask: 1 on tile, 0 in a line of width w (in cell units) */
const lines = Fn(([f, w]: [N, N]) => {
  const a = smoothstep(float(0), w, f.x).mul(smoothstep(float(0), w, float(1).sub(f.x)));
  const b = smoothstep(float(0), w, f.y).mul(smoothstep(float(0), w, float(1).sub(f.y)));
  return a.mul(b);
});

function albedoNode() {
  const base = attribute('color', 'vec3');
  const uvA = attribute('uv', 'vec2');
  const pat = attribute('pat', 'vec4');
  return Fn(() => {
    // the pattern id is a per-vertex float: interpolation leaves it a hair off the integer on some pixels (seen on
    // SwiftShader/WebGL2), so id.equal(13) failed there and those pixels fell through to another pattern (the chrome
    // door/jamb/stool speckle). Round it once. prm likewise: a hair under the integer would flip the variant.
    const id = floor(pat.x.add(0.5)), prm = pat.y.add(0.0005), variant = floor(prm), scl = fract(prm);
    const c = base.toVar();
    const col = vec3(c).toVar();
    const uvv = uvA.toVar();
    // 1 checker
    If(id.equal(1), () => {
      const s = select(scl.greaterThan(0.001), scl, float(0.3));
      const cell = floor(uvv.div(s)); const par = mod(cell.x.add(cell.y), 2);
      const dark = select(variant.greaterThan(0.5), vec3(0.32, 0.035, 0.03), c.mul(0.045));
      col.assign(mix(dark, c, par).mul(lines(fract(uvv.div(s)), float(0.02)).mul(0.25).add(0.75)));
    });
    // 2 hex mosaic (approximated by offset round tiles)
    If(id.equal(2), () => {
      const s = float(0.026); const q = uvv.div(s); const row = floor(q.y);
      const qq = vec2(q.x.add(mod(row, 2).mul(0.5)), q.y); const f = fract(qq).sub(0.5);
      const tile = smoothstep(0.5, 0.38, length(f));
      const r = h21(floor(qq));
      const flower = step(0.93, h21(floor(qq.div(7)))).mul(step(length(fract(qq.div(7)).sub(0.5)), 0.2)); // occasional dark rosette
      const tc = mix(c, c.mul(0.18), flower).mul(r.mul(0.12).add(0.9));
      col.assign(mix(c.mul(0.55), tc, tile));
    });
    // 3 planks (boards along u)
    If(id.equal(3), () => {
      const bw = select(scl.greaterThan(0.001), scl, float(0.1));
      const board = floor(uvv.y.div(bw)); const seamL = h21(vec2(board, 3)).mul(2).add(1.2);
      const seg = floor(uvv.x.div(seamL).add(h21(vec2(board, 7))));
      const tone = h21(vec2(board, seg)).mul(0.35).add(0.8);
      const grain = sin(uvv.x.mul(9).add(noise2(uvv.mul(vec2(2, 40))).mul(6))).mul(0.06).add(1);
      const gap = smoothstep(0, 0.06, fract(uvv.y.div(bw))).mul(smoothstep(0, 0.012, fract(uvv.x.div(seamL).add(h21(vec2(board, 7))))));
      col.assign(c.mul(tone).mul(grain).mul(gap.mul(0.5).add(0.5)));
    });
    // 4 linoleum: speckle + faint 0.3 m tile seams
    If(id.equal(4), () => {
      const sp = noise2(uvv.mul(60)).mul(0.25).add(fbm(uvv.mul(3)).mul(0.2)).add(0.68);
      col.assign(c.mul(sp).mul(lines(fract(uvv.div(0.3)), float(0.008)).mul(0.12).add(0.88)));
    });
    // 5 terrazzo (variant 2: marble)
    If(id.equal(5), () => {
      If(variant.greaterThan(1.5), () => {
        const v = abs(sin(uvv.x.mul(2.1).add(uvv.y.mul(1.3)).add(fbm(uvv.mul(1.7)).mul(7))));
        col.assign(c.mul(smoothstep(0, 0.12, v).mul(0.25).add(0.75)));
      }).Else(() => {
        const chip = step(0.72, noise2(uvv.mul(55))); const chip2 = step(0.8, noise2(uvv.mul(35).add(7)));
        const strips = lines(fract(uvv.div(1.2)), float(0.006));
        col.assign(mix(c, c.mul(vec3(0.55, 0.5, 0.45)), chip).mul(mix(1, 1.15, chip2)).mul(strips.mul(0.3).add(0.7)));
      });
    });
    // 6 wallpaper: stripes + small motif (variant 1: trellis)
    If(id.equal(6), () => {
      const st = smoothstep(0.42, 0.5, abs(fract(uvv.x.div(0.16)).sub(0.5))).mul(0.12);
      const m = fract(uvv.mul(vec2(1 / 0.16, 1 / 0.2))).sub(0.5);
      const motif = select(variant.greaterThan(0.5), smoothstep(0.08, 0.0, abs(abs(m.x).sub(abs(m.y)))), smoothstep(0.14, 0.08, length(m)));
      col.assign(c.mul(float(1).sub(st)).mul(float(1).sub(motif.mul(0.22))).mul(fbm(uvv.mul(0.8)).mul(0.15).add(0.9)));
    });
    // 7 subway tile 3x6 in running bond
    If(id.equal(7), () => {
      const q = uvv.div(vec2(0.152, 0.076)); const row = floor(q.y); const qq = vec2(q.x.add(mod(row, 2).mul(0.5)), q.y);
      const g = lines(fract(qq), float(0.04)); const t = h21(floor(qq)).mul(0.06).add(0.95);
      col.assign(mix(c.mul(0.62), c.mul(t), g));
    });
    // 8 two-tone dado: dark lower wall, a stripe, light upper (variant 1: higher line)
    If(id.equal(8), () => {
      const hgt = select(variant.greaterThan(0.5), float(1.45), float(1.2));
      const lower = step(uvv.y, hgt); const stripe = step(abs(uvv.y.sub(hgt)), 0.025);
      const darkC = vec3(0.13, 0.12, 0.075);
      col.assign(mix(mix(c, darkC, lower), vec3(0.06, 0.05, 0.035), stripe).mul(fbm(uvv.mul(vec2(0.7, 1.4))).mul(0.25).add(0.8)));
    });
    // 9 pressed tin ceiling: 0.3 m squares with embossed rings
    If(id.equal(9), () => {
      const f = fract(uvv.div(0.305)).sub(0.5); const r = length(f);
      const emb = sin(r.mul(38)).mul(0.08).add(smoothstep(0.5, 0.45, max(abs(f.x), abs(f.y))).mul(0.1)).add(0.9);
      col.assign(c.mul(emb));
    });
    // 10 brick running bond (variant 1: painted)
    If(id.equal(10), () => {
      const q = uvv.div(vec2(0.205, 0.068)); const row = floor(q.y); const qq = vec2(q.x.add(mod(row, 2).mul(0.5)), q.y);
      const g = lines(fract(qq), float(0.05)); const t = h21(floor(qq));
      const paint = variant.greaterThan(0.5);
      const bc = select(paint, c.mul(t.mul(0.06).add(0.95)), c.mul(t.mul(0.4).add(0.75)));
      col.assign(mix(select(paint, c.mul(0.8), vec3(0.22, 0.2, 0.18)), bc, g).mul(fbm(uvv.mul(0.9)).mul(0.25).add(0.8)));
    });
    // 11 paneling: vertical boards with V grooves and grain
    If(id.equal(11), () => {
      const bw = float(0.2); const b = floor(uvv.x.div(bw));
      const groove = smoothstep(0.0, 0.04, fract(uvv.x.div(bw)));
      const grain = sin(uvv.y.mul(12).add(noise2(uvv.mul(vec2(30, 2))).mul(5)).add(b.mul(3))).mul(0.07).add(1);
      col.assign(c.mul(h21(vec2(b, 1)).mul(0.25).add(0.85)).mul(grain).mul(groove.mul(0.55).add(0.45)));
    });
    // 12 acoustic drop ceiling: 2x4 ft grid + pinholes
    If(id.equal(12), () => {
      const g = lines(fract(uvv.div(vec2(0.61, 1.22))), float(0.012)); const pin = step(0.82, noise2(uvv.mul(140)));
      col.assign(mix(vec3(0.45, 0.43, 0.4), c.mul(float(1).sub(pin.mul(0.25))), g));
    });
    // 13 chrome / brushed steel: fake environment from the view reflection
    If(id.equal(13), () => {
      // world-space reflection (camera to surface, geometric world normal): no view-space normal, which the engine's
      // pipeline may not supply for an unlit material (speckle on chrome door leaves and jambs, engine board)
      const r = reflect(normalize(positionWorld.sub(cameraPosition)), normalize(normalWorld));
      // floor bounce below the horizon, bright ceiling/fixtures above, a narrow dark horizon band (studio-chrome look)
      const env = mix(float(0.5), float(1.05), smoothstep(-0.15, 0.55, r.y)).mul(float(1).sub(smoothstep(0.12, 0.0, abs(r.y.add(0.05))).mul(0.35)));
      col.assign(c.mul(select(variant.greaterThan(0.5), env.mul(0.5).add(0.5), env)));
    });
    // 14 vinyl upholstery: tufted diamond + sheen
    If(id.equal(14), () => {
      const q = vec2(uvv.x.add(uvv.y), uvv.x.sub(uvv.y)).div(0.16); const f = fract(q).sub(0.5);
      const tuft = smoothstep(0.0, 0.08, length(f)).mul(0.12).add(0.88);
      const sheen = smoothstep(0.3, 1.0, normalView.y.abs().oneMinus()).mul(0.1);
      col.assign(c.mul(tuft).add(sheen));
    });
    // 15 formica (variant 0 boomerang-dots, 1 linen, 2 speckle)
    If(id.equal(15), () => {
      const d = step(0.86, noise2(uvv.mul(38))).mul(0.18); const ln = noise2(uvv.mul(120)).mul(0.06);
      col.assign(c.mul(float(1).sub(d)).mul(ln.add(0.97)));
    });
    // 17 mirror: dark, silvered, view dependent
    If(id.equal(17), () => {
      const r = positionViewDirection.negate().reflect(normalView);
      col.assign(c.mul(0.35).add(vec3(0.25, 0.22, 0.18).mul(smoothstep(-0.2, 0.5, r.y))).mul(fbm(uvv.mul(4)).mul(0.25).add(0.75)));
    });
    // 18 baize felt
    If(id.equal(18), () => { col.assign(c.mul(noise2(uvv.mul(90)).mul(0.12).add(0.9))); });
    // 19 tar roof
    If(id.equal(19), () => { col.assign(c.mul(fbm(uvv.mul(1.2)).mul(0.5).add(0.6)).add(step(0.9, noise2(uvv.mul(70))).mul(0.06))); });
    // 20 glass block
    If(id.equal(20), () => { const f = fract(uvv.div(0.2)); const g = lines(f, float(0.06)); col.assign(mix(c.mul(0.5), c.mul(sin(f.x.mul(12)).mul(0.1).add(0.95)), g)); });
    // 21 lettering (signs, newspapers, menu boards): rows of dashes (variant 2: light on dark)
    If(id.equal(21), () => {
      const row = floor(uvv.y.div(0.055)); const inRow = step(0.3, fract(uvv.y.div(0.055)));
      const word = step(0.35, noise2(vec2(uvv.x.mul(18), row.mul(3.1)))).mul(step(0.12, fract(uvv.x.mul(16))));
      const ink = inRow.mul(word).mul(step(0.25, h21(vec2(row, 2))));
      col.assign(select(variant.greaterThan(1.5), mix(c, vec3(0.85, 0.8, 0.7), ink), mix(c, vec3(0.06, 0.05, 0.05), ink.mul(0.8))));
    });
    // 22 carpet: patterned (medallions on a field)
    If(id.equal(22), () => {
      // bold 1930s-40s lobby carpet (Aberdeen reference): medallion lattice with scroll lobes, gold and dark accents
      const q = uvv.div(0.46); const f = fract(q).sub(0.5); const f2 = fract(q.add(0.5)).sub(0.5);
      const ring = smoothstep(0.24, 0.21, length(f)).sub(smoothstep(0.15, 0.12, length(f)));
      const lobe = smoothstep(0.1, 0.07, length(vec2(abs(f2.x).sub(0.16), f2.y))).add(smoothstep(0.1, 0.07, length(vec2(f2.x, abs(f2.y).sub(0.16)))));
      const dot0 = smoothstep(0.06, 0.04, length(f));
      const gold = vec3(0.62, 0.48, 0.22), dark = c.mul(0.35);
      let cc: N = mix(c, gold, ring.clamp(0, 1).mul(0.85));
      cc = mix(cc, dark, lobe.clamp(0, 1).mul(0.8)); cc = mix(cc, gold, dot0);
      col.assign(cc.mul(noise2(uvv.mul(80)).mul(0.12).add(0.9)).mul(fbm(uvv.mul(0.6)).mul(0.2).add(0.85)));
    });
    // 23 concrete
    If(id.equal(23), () => { col.assign(c.mul(fbm(uvv.mul(0.8)).mul(0.35).add(0.7)).mul(noise2(uvv.mul(40)).mul(0.1).add(0.95))); });
    // 24 fabric (variant 1 plaid, 2 fur)
    If(id.equal(24), () => {
      If(variant.greaterThan(1.5), () => { col.assign(c.mul(noise2(uvv.mul(vec2(20, 160))).mul(0.4).add(0.75))); })
        .ElseIf(variant.greaterThan(0.5), () => {
          const pl = step(0.7, fract(uvv.x.div(0.09))).add(step(0.7, fract(uvv.y.div(0.09)))).mul(0.5);
          col.assign(mix(c, vec3(0.42, 0.1, 0.08), pl.mul(0.5)));
        }).Else(() => { col.assign(c.mul(noise2(uvv.mul(140)).mul(0.1).add(0.93))); });
    });
    // 25 paper
    If(id.equal(25), () => { col.assign(c.mul(noise2(uvv.mul(30)).mul(0.08).add(0.95))); });
    // 26 wood
    If(id.equal(26), () => { col.assign(c.mul(sin(uvv.x.mul(30).add(noise2(uvv.mul(vec2(3, 30))).mul(4))).mul(0.07).add(1))); });
    // filtering: fade each pattern's detail toward its mean as its smallest feature nears pixel size
    const fw = length(fwidth(uvv));
    const FEAT: [number, number][] = [[2, 0.026], [3, 0.012], [4, 0.017], [5, 0.02], [6, 0.03], [7, 0.008], [9, 0.03], [10, 0.012], [11, 0.01], [12, 0.008], [14, 0.04], [15, 0.02], [18, 0.012], [21, 0.012], [22, 0.012], [24, 0.008]];
    let feat: N = float(0.05);
    for (const [k, v] of FEAT) feat = select(id.equal(k), float(v), feat);
    const fade = float(1).sub(smoothstep(feat.mul(0.3), feat.mul(1.1), fw));
    col.assign(mix(c.mul(0.84), col, fade));
    // wear/grime: low-frequency world-space blotches + darker toward the floor (pat.z = amount)
    // wrapped before hashing (h21's sin breaks down at Manhattan-scale coordinates in float32 → per-pixel speckle)
    const wp = mod(positionWorld.xz.add(positionWorld.y.mul(0.37)), float(37));
    const grime = fbm(wp.mul(0.9)).mul(0.6).add(fbm(wp.mul(4.3)).mul(0.4));
    const wear = pat.z.mul(smoothstep(0.35, 0.85, grime)).mul(0.35);
    // water stains on ceilings and upper walls: tide-marked rings (dark edge, paler centre) that grow with wear (grade)
    const ceilingish = smoothstep(-0.4, -0.8, normalWorld.y);
    const sp = mod(positionWorld.xz, float(41)).mul(0.55);
    const blob = fbm(sp.add(vec2(13.1, 7.7)));
    const amt = smoothstep(0.55, 0.95, pat.z);           // only worn and derelict surfaces carry stains
    const ring = smoothstep(0.6, 0.64, blob).mul(float(1).sub(smoothstep(0.66, 0.72, blob)));
    const inner = smoothstep(0.64, 0.7, blob);
    const stain = ceilingish.mul(amt).mul(ring.mul(0.45).add(inner.mul(0.12)));
    // fallen plaster (derelict): lath-brown patches with a pale broken edge
    const lath = ceilingish.mul(step(0.97, pat.z)).mul(smoothstep(0.74, 0.76, fbm(sp.mul(1.7).add(3.3))));
    const stained = mix(col.mul(float(1).sub(wear)), col.mul(vec3(0.72, 0.6, 0.42)), stain);
    return mix(stained, vec3(0.22, 0.15, 0.1), lath.mul(0.85));
  })();
}

export function createInteriorMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  const lampPower = uniform(1).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.lampPower ?? 1);
  const flick = uniform(0).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.flicker ?? 0);
  const lampTint = uniform(new THREE.Color(1, 1, 1)).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.lampTint ?? new THREE.Color(1, 1, 1));
  const win = uniform(new THREE.Color(0.6, 0.62, 0.66)).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.window ?? new THREE.Color(0.6, 0.62, 0.66));
  const amb = uniform(0.02).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.ambient ?? 0.02);
  const light = attribute('light', 'vec4');
  const pat = attribute('pat', 'vec4');
  const albedo = albedoNode();
  // brownout flicker: a cheap per-interior shimmer when power is 'dim'
  const fl = float(1).sub(flick.mul(abs(sin(time.mul(23))).mul(sin(time.mul(3.7)).mul(0.5).add(0.5)).mul(0.5)));
  const lamp = light.xyz.mul(lampTint).mul(lampPower.mul(fl));
  const lit = albedo.mul(lamp.add(win.mul(light.w)).add(amb));
  const emissive = attribute('color', 'vec3').mul(pat.w).mul(lampPower.mul(fl));
  mat.colorNode = select(floor(pat.x.add(0.5)).equal(16), emissive.add(albedo.mul(0.1)), lit);
  mat.side = THREE.FrontSide;
  return mat;
}

/** Glass for display windows, doors, cases: low opacity, fresnel-ish reflection, dirt. */
export function createGlassMaterial(): THREE.MeshBasicNodeMaterial {
  const mat = new THREE.MeshBasicNodeMaterial();
  const light = attribute('light', 'vec4');
  const lampPower = uniform(1).onObjectUpdate(({ object }) => (object?.userData.interior as InteriorLook | undefined)?.lampPower ?? 1);
  const fres = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(3);
  // world position wrapped before hashing: the sin hash (h21) breaks down at |p| ~ 1e2..1e3 in float32 and turned
  // the dirt into per-pixel noise on storefront glass (engine, 2026-11-27). 23 m wrap: seams never show on a pane
  const dirt = (Fn(() => fbm(mod(positionWorld.xy.add(positionWorld.zy), float(23)).mul(3)))());
  mat.colorNode = vec3(0.55, 0.6, 0.58).mul(light.xyz.mul(lampPower).mul(0.4).add(light.w.mul(0.8)).add(0.05)).add(vec3(0.5, 0.48, 0.45).mul(fres.mul(0.5)));
  mat.opacityNode = clamp(fres.mul(0.55).add(0.12).add(dirt.mul(0.12)), 0, 0.8);
  mat.transparent = true; mat.depthWrite = false; mat.side = THREE.DoubleSide;
  void vec4; void min;
  return mat;
}
