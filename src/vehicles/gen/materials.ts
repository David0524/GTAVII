import * as THREE from 'three/webgpu';
import { uniform, mix, smoothstep, color, float, vec3, positionLocal, positionView, normalLocal, normalWorld, mx_fractal_noise_float, mx_noise_float, mx_worley_noise_float, clamp, fract, abs, sin, time, step, atan, length, max, bumpMap, select, interleavedGradientNoise, screenCoordinate } from 'three/tsl';
import { SLOTS, type Slot } from './builder';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/* eslint-disable @typescript-eslint/no-explicit-any */
// TSL's generic node typings collapse to `never` for several mixed-type expressions in this
// three.js release, so node expressions here are typed loosely.
type N = any;
const fu = (v: number) => uniform(v);
const v3u = () => uniform(new THREE.Vector3());
type FloatUniform = ReturnType<typeof fu>;

/** Per-vehicle uniforms the damage and weather systems drive. */
export interface MatUniforms {
  dirt: FloatUniform;
  wet: FloatUniform;
  burnt: FloatUniform;
  cracked: FloatUniform;
}

export interface MaterialSet {
  /** Indexed by SLOTS order (matches geometry group materialIndex). */
  array: THREE.Material[];
  /** Same, with the tyre material (tread / sidewall detail) in the rubber slot: for wheels. */
  wheelArray: THREE.Material[];
  bySlot: Record<Slot, THREE.Material>;
  u: MatUniforms;
  /** Per-pane glass state uniforms (0/1). */
  panes: Record<'front' | 'rear' | 'left' | 'right', { cracked: FloatUniform; broken: FloatUniform; hit: ReturnType<typeof v3u> }>;
  setPaint(hex: number): void;
  dispose(): void;
}

const DIRT = new THREE.Color(0x4a3f33);
const CHAR = new THREE.Color(0x1a1714);

/** Dirt mask: low on the body + fractal noise, times a per-vehicle amount. Burnt overrides all. */
function grime(base: N, u: MatUniforms, lowCut = 0.95): { col: N; mask: N } {
  const n: N = (mx_fractal_noise_float(positionLocal.mul(2.6), 3) as N).mul(0.5).add(0.5);
  const low: N = smoothstep(float(lowCut), float(0.15), positionLocal.y);
  const mask: N = (clamp(low.mul(0.75).add(n.mul(0.5)).sub(0.3), 0, 1) as N).mul(u.dirt as N);
  const dirty: N = mix(base, color(DIRT), mask);
  return { col: mix(dirty, color(CHAR), u.burnt as N), mask };
}

// ------------------------------------------------------------------ dithered LOD crossfade
/**
 * Per-object LOD fade read in every vehicle material (see FadeLOD). Encoded in
 * mesh.userData.lodFade: v in [0,1] shows pixels whose dither < v (outgoing level),
 * v in [2,3] shows pixels whose dither >= v-2 (incoming level). Complementary, so no holes.
 * Default 1 = fully shown.
 */
const lodFade: N = uniform(1).onObjectUpdate(({ object }) => (object?.userData.lodFade as number | undefined) ?? 1);
let crossfade = true;
/** Off on phones: an always-present discard costs early-z on tiled GPUs. Set before creating cars. */
export function setLodCrossfade(on: boolean) { crossfade = on; }
export function lodCrossfadeEnabled() { return crossfade; }
function lodMask(): N {
  const n: N = interleavedGradientNoise(screenCoordinate.xy);
  return select(lodFade.lessThan(1.5), n.lessThan(lodFade), n.greaterThanEqual(lodFade.sub(2)));
}
/** Add the LOD dither mask to a material (no-op when crossfade is off). */
export function withLodMask<T extends THREE.Material>(m: T): T {
  if (crossfade) (m as unknown as { maskNode: N }).maskNode = lodMask();
  return m;
}

/** Fades high-frequency detail out with distance (it would only shimmer further away). */
const near = (d0: number, d1: number): N => smoothstep(float(d1), float(d0), length(positionView));

let shared: Partial<Record<Slot, THREE.Material>> & { _q?: Quality; tyre?: THREE.Material } = {};
function sharedMats(q: Quality) {
  if (shared._q === q) return shared;
  const std = (o: THREE.MeshStandardNodeMaterialParameters) => new THREE.MeshStandardNodeMaterial(o);
  shared = {
    _q: q,
    chrome: std({ color: 0xd6d4cf, metalness: 1, roughness: 0.16 }),
    trim: std({ color: 0x1c1d1e, metalness: 0.2, roughness: 0.55 }),
    rubber: std({ color: 0x141414, metalness: 0, roughness: 0.92 }),
    under: std({ color: 0x0d0c0b, metalness: 0, roughness: 1 }),
    white: std({ color: 0xe6e3da, metalness: 0, roughness: 0.6 }),
    grille: std({ color: 0x090909, metalness: 0.3, roughness: 0.6 }),
    interior: std({ color: 0x171310, metalness: 0, roughness: 0.95 }),
    reverse: std({ color: 0xd8d6d0, metalness: 0, roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 }),
    tyre: std({ color: 0x161616, metalness: 0, roughness: 0.9 }),
  };
  if (q !== 'low') {
    const p: N = positionLocal;
    // chrome: fine pitting and polish swirl in the roughness, a whisper of bump up close
    const pit: N = (mx_noise_float(p.mul(260)) as N).mul(0.5).add(0.5);
    const chrome = shared.chrome as THREE.MeshStandardNodeMaterial;
    chrome.roughnessNode = float(0.13).add(pit.mul(0.08).mul(near(1, 6)));
    chrome.normalNode = bumpMap(smoothstep(float(0.78), float(0.9), pit).mul(0.00025).mul(near(0.8, 4)));
    // grille: egg-crate bars (raised, catching light at the edges)
    const grille = shared.grille as THREE.MeshStandardNodeMaterial;
    const gx: N = abs(fract(p.x.mul(1 / 0.034)).sub(0.5)), gy: N = abs(fract(p.y.mul(1 / 0.028)).sub(0.5));
    const bars: N = max(smoothstep(float(0.36), float(0.44), gx), smoothstep(float(0.36), float(0.44), gy));
    grille.colorNode = mix(color(0x050505), color(0x2e2d2b), bars);
    grille.roughnessNode = mix(float(0.75), float(0.35), bars);
    grille.normalNode = bumpMap(bars.mul(0.004).mul(near(1, 10)));
    // tyres: tread blocks and circumferential grooves on the crown, fine rings and dust on the
    // sidewall. Wheels are lathed around local X, centred on the hub.
    const tyre = shared.tyre as THREE.MeshStandardNodeMaterial;
    const side: N = abs(normalLocal.x);
    const crown: N = float(1).sub(smoothstep(float(0.35), float(0.75), side));
    const ang: N = atan(p.y, p.z);
    const groove: N = smoothstep(float(0.38), float(0.46), abs(fract(p.x.mul(1 / 0.03)).sub(0.5)));
    const sipe: N = smoothstep(float(0.4), float(0.48), abs(fract(ang.mul(56 / (2 * Math.PI)).add(abs(p.x).mul(9))).sub(0.5)));
    const treadH: N = float(1).sub(max(groove, sipe.mul(0.8)));
    const rad: N = length(p.yz);
    const rings: N = (sin(rad.mul(520)) as N).mul(0.5).add(0.5).mul(0.25);
    const dust: N = (mx_noise_float(p.mul(30)) as N).mul(0.5).add(0.5);
    tyre.normalNode = bumpMap(mix(rings.mul(0.0015), treadH.mul(0.006), crown).mul(near(1, 9)));
    tyre.colorNode = mix(mix(color(0x262422), color(0x36322d), dust.mul(0.7)), mix(color(0x0b0b0b), color(0x181818), treadH), crown);
    tyre.roughnessNode = mix(float(0.82), mix(float(0.97), float(0.86), treadH), crown);
  }
  for (const k of Object.keys(shared)) if (k !== '_q') withLodMask(shared[k as Slot] as THREE.Material);
  // Woodgrain: long streaks along the body with knots, framed lighter edges come from geometry.
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0 });
  const g: N = (mx_noise_float(positionLocal.mul(vec3(18, 30, 0.6))) as N).mul(0.5).add(0.5);
  const streak: N = (sin(positionLocal.y.mul(140).add(g.mul(6))) as N).mul(0.5).add(0.5);
  wood.colorNode = mix(color(0x5a341a), color(0x8a5a32), streak.mul(0.6).add(g.mul(0.4)));
  shared.wood = withLodMask(wood);
  return shared;
}

const VINYL_CACHE = new Map<number, THREE.Material>();
function vinylMat(hex: number) {
  let m = VINYL_CACHE.get(hex);
  if (!m) {
    const v = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 });
    // fine grain texture in the colour
    const g: N = mx_noise_float(positionLocal.mul(140));
    v.colorNode = (color(hex) as N).add(g.mul(0.012));
    // pebbled vinyl grain
    v.normalNode = bumpMap((mx_worley_noise_float(positionLocal.mul(260)) as N).mul(0.00035).mul(near(0.8, 5)));
    VINYL_CACHE.set(hex, (m = withLodMask(v)));
  }
  return m;
}

export function createMaterialSet(q: Quality, o: { paint: number; paint2?: number; roof: 'paint' | 'paint2' | number; metallic: boolean; vinyl: number; dirt: number; seat?: number; seeThroughGlass?: boolean }): MaterialSet {
  if (q === 'low') crossfade = false; // phones: no always-on discard
  const s = sharedMats(q);
  const u: MatUniforms = { dirt: uniform(o.dirt), wet: uniform(0), burnt: uniform(0), cracked: uniform(0) };
  const physical = q !== 'low';
  const owned: THREE.Material[] = [];

  const makePaint = (hex: number, metallic: boolean) => {
    const p = physical
      ? new THREE.MeshPhysicalNodeMaterial({ metalness: metallic ? 0.55 : 0.0, roughness: metallic ? 0.34 : 0.42, clearcoat: metallic ? 0.9 : 0.75, clearcoatRoughness: 0.12 })
      : new THREE.MeshStandardNodeMaterial({ metalness: metallic ? 0.45 : 0.0, roughness: 0.42 });
    const base = uniform(new THREE.Color(hex));
    const g = grime(base, u);
    const wet: N = u.wet;
    const pl: N = positionLocal;
    const rough0 = metallic ? 0.34 : 0.42;
    // metallic flake: sparse bright specks that lower the roughness (faded with distance)
    const flake: N = metallic ? (smoothstep(float(0.55), float(0.8), mx_noise_float(pl.mul(700))) as N).mul(near(0.6, 5)) : float(0);
    // wet: water darkens the paint and the dirt, the clearcoat sharpens, beads stand on the panels
    const upF: N = smoothstep(float(-0.2), float(0.8), normalWorld.y);
    const cells: N = mx_worley_noise_float(pl.mul(85));
    const bead: N = (smoothstep(float(0.32), float(0.0), cells) as N).mul(wet).mul(float(0.35).add(upF.mul(0.65))).mul(clamp(float(1).sub(g.mask.mul(1.5)), 0, 1));
    p.colorNode = (mix(g.col, (g.col as N).mul(0.72), wet.mul(0.8)) as N).add(flake.mul(0.06));
    p.roughnessNode = mix(mix(float(rough0).sub(flake.mul(0.2)), float(rough0 * 0.45), wet), float(0.95), clamp(g.mask.mul(float(1).sub(wet.mul(0.5))).add(u.burnt), 0, 1));
    if (physical) {
      const pm = p as THREE.MeshPhysicalNodeMaterial;
      pm.clearcoatRoughnessNode = mix(float(0.12), float(0.03), wet);
      // orange peel (subtle, only in reflections) + water beads
      const peel: N = (mx_noise_float(pl.mul(70)) as N).mul(0.00012).mul(near(1.2, 7));
      pm.normalNode = bumpMap(peel.add(bead.mul(0.0012).mul(near(1, 8))));
    }
    withLodMask(p);
    (p as unknown as { userData: { base: typeof base } }).userData.base = base;
    owned.push(p);
    return p;
  };
  const paint = makePaint(o.paint, o.metallic);
  const paint2 = o.paint2 !== undefined ? makePaint(o.paint2, false) : paint;
  const roof = o.roof === 'paint' ? paint : o.roof === 'paint2' ? paint2 : makePaint(o.roof, false);

  // Glass: dark, glossy; rain streaks when wet; crazed when cracked; per pane so a bullet or a
  // smashed window affects only that pane. 'broken' = shattered out: you see the dark cabin.
  const makeGlass = (cracked: FloatUniform, broken: FloatUniform, seeThrough = false, impact?: { hit: N; laminated: boolean }) => {
    const glass = new THREE.MeshPhysicalNodeMaterial({ color: 0x0b0e10, metalness: 0.1, roughness: 0.05, clearcoat: physical ? 1 : 0, clearcoatRoughness: 0.02 });
    const p: N = positionLocal;
    const nz = (x: N): N => mx_noise_float(x);
    const wob: N = nz(p.mul(vec3(6, 0.8, 6))).mul(0.6);
    const streak: N = (smoothstep(float(0.82), float(0.98), fract(p.x.add(p.z).mul(23).add(wob).add(nz(p.mul(vec3(40, 2, 40))).mul(0.3)))) as N)
      .mul(smoothstep(float(0.2), float(0.9), fract(p.y.mul(3).add((time as N).mul(0.35)).add(p.x.mul(7)))));
    let crack: N = (step(abs(nz(p.mul(11))), float(0.018)) as N).add(step(abs(nz(p.mul(4.5).add(3.1))), float(0.012)));
    if (impact) {
      // cracks radiate from the impact point, in the pane's own plane
      const d: N = p.sub(impact.hit);
      const r: N = length(d);
      const nl: N = normalLocal;
      const t1: N = nl.cross(vec3(0, 1, 0)).normalize();
      const t2: N = nl.cross(t1);
      const a: N = atan(d.dot(t2), d.dot(t1));
      const wob: N = nz(vec3(r.mul(7), a.mul(2), 0)).mul(0.22);
      // spokes: ~17 main ones, thinner further out, reaching most of the pane
      const spokeW: N = mix(float(0.06), float(0.012), smoothstep(float(0.0), float(0.5), r));
      const spokes: N = (step(float(0.5).sub(spokeW), abs(fract(a.mul(17 / (2 * Math.PI)).add(wob)).sub(0.5))) as N).mul(smoothstep(float(0.95), float(0.35), r));
      const fine: N = (step(float(0.485), abs(fract(a.mul(41 / (2 * Math.PI)).add(wob.mul(2.3)).add(0.37)).sub(0.5))) as N).mul(smoothstep(float(0.45), float(0.1), r));
      let pattern: N;
      if (impact.laminated) {
        // laminated windscreen: a spider web (concentric rings between the spokes) and a crushed core
        const rings: N = (step(float(0.44), abs(fract(r.mul(16).add(nz(vec3(a.mul(3), r.mul(3), 1)).mul(0.35))).sub(0.5))) as N).mul(smoothstep(float(0.32), float(0.05), r));
        const core: N = smoothstep(float(0.045), float(0.015), r);
        pattern = spokes.add(fine).add(rings).add(core);
      } else {
        // tempered side glass: a dice pattern that spreads out from the hit
        const cells: N = step(abs(nz(p.mul(38))), float(0.028));
        pattern = spokes.mul(0.6).add(cells.mul(smoothstep(float(0.38), float(0.04), r)).mul(0.8));
      }
      crack = pattern;
    }
    const crazed: N = (clamp(crack, 0, 1) as N).mul(cracked as N);
    if (physical) glass.normalNode = bumpMap(crazed.mul(0.0005));
    const wet: N = u.wet, burnt: N = u.burnt, br: N = broken;
    const lit: N = (mix(mix(color(0x0b0e10), color(0x5c6266), streak.mul(wet).mul(0.5)), color(0xa8aeb0), crazed.mul(0.75)) as N).mul(float(1).sub(burnt.mul(0.6)));
    glass.colorNode = mix(lit, color(0x050404), br);
    glass.roughnessNode = mix(mix(float(0.05), float(0.5), crazed.add(burnt)), float(1), br);
    glass.clearcoatNode = float(1).sub(br).mul(physical ? 1 : 0);
    glass.metalnessNode = mix(float(0.1), float(0), br);
    if (seeThrough) {
      // tinted, partly transparent so the cabin reads; cracked glass goes milky, shattered is open
      glass.transparent = true; glass.depthWrite = false;
      glass.opacityNode = mix(mix(float(0.58), float(0.88), (cracked as N)), float(0.0), br);
    }
    withLodMask(glass);
    owned.push(glass);
    return glass;
  };
  const panes = {
    front: { cracked: fu(0), broken: fu(0), hit: v3u() }, rear: { cracked: fu(0), broken: fu(0), hit: v3u() },
    left: { cracked: fu(0), broken: fu(0), hit: v3u() }, right: { cracked: fu(0), broken: fu(0), hit: v3u() },
  };
  const glass = makeGlass(u.cracked, fu(0));
  const see = o.seeThroughGlass ?? false;
  const glassF = makeGlass(panes.front.cracked, panes.front.broken, see, { hit: panes.front.hit, laminated: true }), glassB = makeGlass(panes.rear.cracked, panes.rear.broken, see, { hit: panes.rear.hit, laminated: true });
  const glassL = makeGlass(panes.left.cracked, panes.left.broken, see, { hit: panes.left.hit, laminated: false }), glassR = makeGlass(panes.right.cracked, panes.right.broken, see, { hit: panes.right.hit, laminated: false });
  const lamp = (c: number, e: number) => { const m = withLodMask(new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.15, metalness: 0, emissive: e, emissiveIntensity: 0 })); owned.push(m); return m; };
  const seat = withLodMask(new THREE.MeshStandardNodeMaterial({ color: o.seat ?? 0x5a4632, roughness: 0.55, metalness: 0 })); // vinyl upholstery
  owned.push(seat);
  const headlamp = lamp(0xe8e4d8, 0xfff0cc);
  headlamp.metalness = 0.6; headlamp.roughness = 0.06; // glassy lens over a silvered reflector
  const taillamp = lamp(0x5a0806, 0xff1a0a);
  const indicator = lamp(0x8a4a08, 0xff8a10);
  const reverse = lamp(0xd8d6d0, 0xffffff);

  const bySlot: Record<Slot, THREE.Material> = {
    paint, paint2, roof, vinyl: vinylMat(o.vinyl), chrome: s.chrome!, trim: s.trim!, rubber: s.rubber!, glass, glassF, glassB, glassL, glassR, under: s.under!, wood: s.wood!,
    white: s.white!, headlamp, taillamp, indicator, reverse, grille: s.grille!, interior: s.interior!, seat,
  };
  const array = SLOTS.map((sl) => bySlot[sl]);
  return {
    array, bySlot, u, panes,
    wheelArray: array.map((m) => (m === s.rubber ? s.tyre! : m)),
    setPaint(hex: number) { ((paint as unknown as { userData: { base: { value: THREE.Color } } }).userData.base.value).setHex(hex); },
    dispose() { for (const m of owned) m.dispose(); },
  };
}

/** Flat material list for low-cost / instanced use: one standard material per slot, vertex-free. */
export function trafficSlotColor(slot: Slot): number | null {
  switch (slot) {
    case 'chrome': return 0xb8b6b0;
    case 'trim': return 0x1c1d1e;
    case 'rubber': return 0x151515;
    case 'glass': case 'glassF': case 'glassB': case 'glassL': case 'glassR': return 0x101315;
    case 'under': return 0x0d0c0b;
    case 'wood': return 0x6e4426;
    case 'white': return 0xe0ddd4;
    case 'headlamp': return 0xe8e4d8;
    case 'indicator': return 0x9a5a10;
    case 'reverse': return 0xd8d6d0;
    case 'grille': return 0x0a0a0a;
    case 'interior': return 0x171310;
    case 'seat': return 0x4a3828;
    case 'vinyl': return 0x2a2420;
    default: return null; // paint-like (instance colour) or taillamp (instance brake)
  }
}
