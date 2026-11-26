import * as THREE from 'three/webgpu';
import { uniform, mix, smoothstep, color, float, vec3, positionLocal, mx_fractal_noise_float, mx_noise_float, clamp, fract, abs, sin, time, step } from 'three/tsl';
import { SLOTS, type Slot } from './builder';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';

/* eslint-disable @typescript-eslint/no-explicit-any */
// TSL's generic node typings collapse to `never` for several mixed-type expressions in this
// three.js release, so node expressions here are typed loosely.
type N = any;
const fu = (v: number) => uniform(v);
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
  bySlot: Record<Slot, THREE.Material>;
  u: MatUniforms;
  /** Per-pane glass state uniforms (0/1). */
  panes: Record<'front' | 'rear' | 'left' | 'right', { cracked: FloatUniform; broken: FloatUniform }>;
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

let shared: Partial<Record<Slot, THREE.Material>> & { _q?: Quality } = {};
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
  };
  // Woodgrain: long streaks along the body with knots, framed lighter edges come from geometry.
  const wood = new THREE.MeshStandardNodeMaterial({ roughness: 0.5, metalness: 0 });
  const g: N = (mx_noise_float(positionLocal.mul(vec3(18, 30, 0.6))) as N).mul(0.5).add(0.5);
  const streak: N = (sin(positionLocal.y.mul(140).add(g.mul(6))) as N).mul(0.5).add(0.5);
  wood.colorNode = mix(color(0x5a341a), color(0x8a5a32), streak.mul(0.6).add(g.mul(0.4)));
  shared.wood = wood;
  return shared;
}

const VINYL_CACHE = new Map<number, THREE.Material>();
function vinylMat(hex: number) {
  let m = VINYL_CACHE.get(hex);
  if (!m) {
    const v = new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 });
    // fine grain texture in the colour
    const n: N = (mx_noise_float(positionLocal.mul(140)) as N).mul(0.012);
    v.colorNode = (color(hex) as N).add(n);
    VINYL_CACHE.set(hex, (m = v));
  }
  return m;
}

export function createMaterialSet(q: Quality, o: { paint: number; paint2?: number; roof: 'paint' | 'paint2' | number; metallic: boolean; vinyl: number; dirt: number }): MaterialSet {
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
    p.colorNode = g.col;
    p.roughnessNode = mix(float(metallic ? 0.34 : 0.42), float(0.95), clamp(g.mask.add(u.burnt), 0, 1));
    (p as unknown as { userData: { base: typeof base } }).userData.base = base;
    owned.push(p);
    return p;
  };
  const paint = makePaint(o.paint, o.metallic);
  const paint2 = o.paint2 !== undefined ? makePaint(o.paint2, false) : paint;
  const roof = o.roof === 'paint' ? paint : o.roof === 'paint2' ? paint2 : makePaint(o.roof, false);

  // Glass: dark, glossy; rain streaks when wet; crazed when cracked; per pane so a bullet or a
  // smashed window affects only that pane. 'broken' = shattered out: you see the dark cabin.
  const makeGlass = (cracked: FloatUniform, broken: FloatUniform) => {
    const glass = new THREE.MeshPhysicalNodeMaterial({ color: 0x0b0e10, metalness: 0.1, roughness: 0.05, clearcoat: physical ? 1 : 0, clearcoatRoughness: 0.02 });
    const p: N = positionLocal;
    const nz = (x: N): N => mx_noise_float(x);
    const wob: N = nz(p.mul(vec3(6, 0.8, 6))).mul(0.6);
    const streak: N = (smoothstep(float(0.82), float(0.98), fract(p.x.add(p.z).mul(23).add(wob).add(nz(p.mul(vec3(40, 2, 40))).mul(0.3)))) as N)
      .mul(smoothstep(float(0.2), float(0.9), fract(p.y.mul(3).add((time as N).mul(0.35)).add(p.x.mul(7)))));
    const crack: N = (step(abs(nz(p.mul(11))), float(0.018)) as N).add(step(abs(nz(p.mul(4.5).add(3.1))), float(0.012)));
    const crazed: N = (clamp(crack, 0, 1) as N).mul(cracked as N);
    const wet: N = u.wet, burnt: N = u.burnt, br: N = broken;
    const lit: N = (mix(mix(color(0x0b0e10), color(0x5c6266), streak.mul(wet).mul(0.5)), color(0xa8aeb0), crazed.mul(0.75)) as N).mul(float(1).sub(burnt.mul(0.6)));
    glass.colorNode = mix(lit, color(0x050404), br);
    glass.roughnessNode = mix(mix(float(0.05), float(0.5), crazed.add(burnt)), float(1), br);
    glass.clearcoatNode = float(1).sub(br).mul(physical ? 1 : 0);
    glass.metalnessNode = mix(float(0.1), float(0), br);
    owned.push(glass);
    return glass;
  };
  const panes = {
    front: { cracked: fu(0), broken: fu(0) }, rear: { cracked: fu(0), broken: fu(0) },
    left: { cracked: fu(0), broken: fu(0) }, right: { cracked: fu(0), broken: fu(0) },
  };
  const glass = makeGlass(u.cracked, fu(0));
  const glassF = makeGlass(panes.front.cracked, panes.front.broken), glassB = makeGlass(panes.rear.cracked, panes.rear.broken);
  const glassL = makeGlass(panes.left.cracked, panes.left.broken), glassR = makeGlass(panes.right.cracked, panes.right.broken);
  const lamp = (c: number, e: number) => { const m = new THREE.MeshStandardNodeMaterial({ color: c, roughness: 0.15, metalness: 0, emissive: e, emissiveIntensity: 0 }); owned.push(m); return m; };
  const headlamp = lamp(0xe8e4d8, 0xfff0cc);
  headlamp.metalness = 0.6; headlamp.roughness = 0.06; // glassy lens over a silvered reflector
  const taillamp = lamp(0x5a0806, 0xff1a0a);
  const indicator = lamp(0x8a4a08, 0xff8a10);
  const reverse = lamp(0xd8d6d0, 0xffffff);

  const bySlot: Record<Slot, THREE.Material> = {
    paint, paint2, roof, vinyl: vinylMat(o.vinyl), chrome: s.chrome!, trim: s.trim!, rubber: s.rubber!, glass, glassF, glassB, glassL, glassR, under: s.under!, wood: s.wood!,
    white: s.white!, headlamp, taillamp, indicator, reverse, grille: s.grille!, interior: s.interior!,
  };
  return {
    array: SLOTS.map((sl) => bySlot[sl]), bySlot, u, panes,
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
    case 'vinyl': return 0x2a2420;
    default: return null; // paint-like (instance colour) or taillamp (instance brake)
  }
}
