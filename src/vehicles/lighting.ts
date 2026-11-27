import * as THREE from 'three/webgpu';
import type { Quality } from './gen/materials';

/**
 * Ground contact and car light, the two things VISUAL_BAR.md rejects vehicles for:
 *  - a soft contact shadow under every car (footprint + darker blobs under each tyre), baked
 *    per model into a small texture, laid on the ground plane under the wheels;
 *  - headlights and brake lamps that cast light: a small pool of real SpotLights / PointLights
 *    handed to the nearest cars each frame (fixed count, so no shader recompiles), and cheap
 *    additive light pools on the ground for every other car with its lamps on.
 */

export interface Footprint { halfW: number; minZ: number; maxZ: number; wheels: { x: number; z: number; r: number; w: number }[] }
export interface ShadowBake { tex: THREE.DataTexture; w: number; l: number; cz: number }

const bakes = new Map<string, ShadowBake>();
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Contact-shadow texture for a footprint (cached by key). Alpha only; drawn black. */
export function shadowBake(key: string, f: Footprint): ShadowBake {
  let b = bakes.get(key);
  if (b) return b;
  const len = f.maxZ - f.minZ;
  const w = f.halfW * 2 + 0.9, l = len + 1.0, cz = (f.minZ + f.maxZ) / 2;
  const W = 48, H = Math.min(256, Math.max(64, Math.round((l / w) * W)));
  const data = new Uint8Array(W * H * 4);
  // rounded-rect footprint, slightly inset (the body overhangs the sills), with a wide soft edge
  const hx = f.halfW * 0.86, hz = len * 0.47, rr = Math.min(0.5, f.halfW * 0.5);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = ((i + 0.5) / W - 0.5) * w, z = cz + (0.5 - (j + 0.5) / H) * l;
    const qx = Math.abs(x) - (hx - rr), qz = Math.abs(z - cz) - (hz - rr);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;
    let a = 0.78 * (1 - sstep(-0.45, 0.45, d));
    // tyres: tight dark contact patches with a short soft halo
    for (const wh of f.wheels) {
      const dx = (x - wh.x) / (wh.w * 0.5 + 0.12), dz = (z - wh.z) / (wh.r * 0.55 + 0.1);
      const e = Math.hypot(dx, dz);
      a = Math.max(a, 1 - sstep(0.4, 1.4, e));
    }
    const k = (j * W + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255; data[k + 3] = Math.round(a * 255);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  b = { tex, w, l, cz };
  bakes.set(key, b);
  return b;
}

/** Flat plane in XZ (+Y up), uv v=1 at the front (-Z). */
export function groundPlane(w: number, l: number, cz = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, cz);
  return g;
}

export function shadowMaterial(tex: THREE.Texture): THREE.MeshBasicNodeMaterial {
  return new THREE.MeshBasicNodeMaterial({
    color: 0x000000, map: tex, transparent: true, depthWrite: false, fog: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
}

// ------------------------------------------------------------------ light pools (ground decals)
let poolTex: THREE.DataTexture | null = null;
let glowTex: THREE.DataTexture | null = null;
/** Low-beam pattern on the road: a widening wedge, brightest 3–9 m ahead, sharp-ish cut-off far. */
export function headPoolTexture(): THREE.DataTexture {
  if (poolTex) return poolTex;
  const W = 64, H = 128, data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W - 0.5, v = (j + 0.5) / H; // v: 0 at the bumper, 1 far ahead
    const half = 0.16 + v * 0.34;
    const side = 1 - sstep(half * 0.55, half, Math.abs(u));
    const along = sstep(0.0, 0.1, v) * (1 - sstep(0.3, 1, v)) * (1.1 - v * 0.7);
    // two lamp hot spots merging further out
    const hot = Math.exp(-(((Math.abs(u) - 0.1 * (1 - v)) / (0.08 + v * 0.2)) ** 2)) * (1 - sstep(0.2, 0.7, v)) * 0.6;
    const a = Math.min(1, side * along + hot * along);
    const k = (j * W + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = Math.round(Math.min(1, a) * 255); data[k + 3] = 255;
  }
  poolTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  poolTex.magFilter = THREE.LinearFilter; poolTex.minFilter = THREE.LinearMipmapLinearFilter; poolTex.generateMipmaps = true; poolTex.needsUpdate = true;
  return poolTex;
}
/** Round soft glow (brake / tail lamps on the road). */
export function glowTexture(): THREE.DataTexture {
  if (glowTex) return glowTex;
  const N = 32, data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2;
    const a = Math.max(0, 1 - r) ** 2;
    const k = (j * N + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = Math.round(a * 255); data[k + 3] = 255;
  }
  glowTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  glowTex.magFilter = THREE.LinearFilter; glowTex.minFilter = THREE.LinearFilter; glowTex.needsUpdate = true;
  return glowTex;
}
export function additiveMaterial(tex: THREE.Texture, col: number): THREE.MeshBasicNodeMaterial {
  return new THREE.MeshBasicNodeMaterial({
    color: col, map: tex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
  });
}
/** Head pool geometry, local to the car: starts at the front bumper (minZ), runs 16 m ahead. */
export function headPoolGeometry(minZ: number, halfW: number): THREE.BufferGeometry {
  const L = 16, W = Math.max(5.5, halfW * 2 * 3.2);
  return groundPlane(W, L, minZ - L / 2 + 0.2);
}

// ------------------------------------------------------------------ real lights
/** Anything that can borrow a real light from the pool. Positions/dirs in world space. */
export interface LightCandidate {
  key: string;
  /** Headlamp centre and the point the beam aims at (null when headlights are off). */
  head: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
  /** Rear lamp glow position (null when no brake/tail light is on). */
  rear: { pos: THREE.Vector3; brake: boolean } | null;
  dist2: number;
  priority?: number;
}

export const LIGHT_BUDGET: Record<Quality, { spots: number; glows: number }> = {
  low: { spots: 1, glows: 1 }, medium: { spots: 3, glows: 2 }, high: { spots: 6, glows: 4 }, ultra: { spots: 8, glows: 6 },
};

/**
 * Fixed pool of SpotLights (headlights) and PointLights (brake glow). Lights never enter or leave
 * the scene: unused ones sit at intensity 0, so the light count (and every shader) stays stable.
 */
export class CarLightPool {
  readonly object = new THREE.Group();
  /**
   * Candela-ish intensities at full night. The scene's sun is not physically scaled, so real car
   * lights are faded with daylight too (off at noon, full at night) via setGroundLightLevel.
   */
  headIntensity = 220;
  brakeIntensity = 3.5;
  tailIntensity = 0.8;
  private spots: THREE.SpotLight[] = [];
  private glows: THREE.PointLight[] = [];
  /** Keys that got a real headlight / rear glow this frame (their ground pools are hidden). */
  readonly litHead = new Set<string>();
  readonly litRear = new Set<string>();

  constructor(scene: THREE.Object3D, quality: Quality, shadowsOnFirst = false) {
    this.object.name = 'vehicle-lights';
    const b = LIGHT_BUDGET[quality];
    for (let i = 0; i < b.spots; i++) {
      const s = new THREE.SpotLight(0xfff0d0, 0, 55, 0.58, 0.6, 2);
      s.castShadow = shadowsOnFirst && i === 0;
      if (s.castShadow) { s.shadow.mapSize.set(512, 512); s.shadow.camera.near = 0.3; s.shadow.bias = -0.0008; }
      this.object.add(s, s.target);
      this.spots.push(s);
    }
    for (let i = 0; i < b.glows; i++) {
      const p = new THREE.PointLight(0xff2a10, 0, 5, 2);
      this.object.add(p);
      this.glows.push(p);
    }
    scene.add(this.object);
  }

  get budget() { return { spots: this.spots.length, glows: this.glows.length }; }

  /** Hand the lights to the nearest candidates (priority first, e.g. the player). */
  assign(cands: LightCandidate[]) {
    this.litHead.clear(); this.litRear.clear();
    const order = cands.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.dist2 - b.dist2);
    let si = 0, gi = 0;
    for (const c of order) {
      if (c.head && si < this.spots.length) {
        const s = this.spots[si++];
        s.position.copy(c.head.pos); s.target.position.copy(c.head.target);
        s.intensity = this.headIntensity * groundLightLevel();
        this.litHead.add(c.key);
      }
      if (c.rear && gi < this.glows.length) {
        const p = this.glows[gi++];
        p.position.copy(c.rear.pos);
        p.intensity = (c.rear.brake ? this.brakeIntensity : this.tailIntensity) * groundLightLevel();
        this.litRear.add(c.key);
      }
      if (si >= this.spots.length && gi >= this.glows.length) break;
    }
    for (; si < this.spots.length; si++) this.spots[si].intensity = 0;
    for (; gi < this.glows.length; gi++) this.glows[gi].intensity = 0;
  }

  dispose() {
    for (const s of this.spots) { s.dispose(); }
    for (const p of this.glows) p.dispose();
    this.object.removeFromParent();
  }
}

// ------------------------------------------------------------------ shared ground-light materials
let gl: { head: THREE.MeshBasicNodeMaterial; brake: THREE.MeshBasicNodeMaterial; tail: THREE.MeshBasicNodeMaterial; night: number } | null = null;
const HEAD_COL = new THREE.Color(0xffe6b8), BRAKE_COL = new THREE.Color(0xff2810), TAIL_COL = new THREE.Color(0xb01808);
/** Shared additive materials for the cheap pools; scaled by setGroundLightLevel(night). */
export function groundLightMats() {
  if (!gl) {
    gl = { head: additiveMaterial(headPoolTexture(), 0xffffff), brake: additiveMaterial(glowTexture(), 0xffffff), tail: additiveMaterial(glowTexture(), 0xffffff), night: -1 };
    setGroundLightLevel(0);
  }
  return gl;
}
/** 0 = daylight (pools off), 1 = full night. The engine's time of day should drive this. */
export function setGroundLightLevel(night: number) {
  const m = groundLightMats();
  if (m.night === night) return;
  m.night = night;
  m.head.color.copy(HEAD_COL).multiplyScalar(0.16 * night);
  m.brake.color.copy(BRAKE_COL).multiplyScalar(0.4 * night);
  m.tail.color.copy(TAIL_COL).multiplyScalar(0.12 * night);
}
export function groundLightLevel() { return groundLightMats().night; }

/** Something that can be lit: a simulated Vehicle (or a two-wheeler later). */
export interface Lightable {
  lightCandidate(cam: THREE.Vector3, out?: LightCandidate): LightCandidate | null;
  /** Hide the cheap ground pools of lamps that got a real light this frame. */
  setRealLights(head: boolean, rear: boolean): void;
}
/** One call per frame: hand out the real lights, then let every car hide the pools it no longer needs. */
export function updateCarLights(pool: CarLightPool, cars: readonly Lightable[], cam: THREE.Vector3, extra: LightCandidate[] = []) {
  const mine = cars.map((c) => c.lightCandidate(cam));
  const cands = mine.filter((k): k is LightCandidate => !!k).concat(extra);
  pool.assign(cands);
  cars.forEach((c, i) => { const k = mine[i]; c.setRealLights(!!k && pool.litHead.has(k.key), !!k && pool.litRear.has(k.key)); });
}
