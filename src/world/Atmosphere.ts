import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { TRUE_NORTH } from '../shared/geo';
import { worldClock, exactMinutes, sunPosition } from './Clock';

/** World-space direction for a true-compass azimuth (deg, clockwise from north) and elevation (deg). */
export function compassToWorld(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimuthDeg), e = THREE.MathUtils.degToRad(elevationDeg);
  const [nx, nz] = TRUE_NORTH; // true north in world XZ
  const ex = -nz, ez = nx; // true east = north rotated 90 deg clockwise (seen from above)
  const h = Math.cos(e);
  return out.set((Math.cos(a) * nx + Math.sin(a) * ex) * h, Math.sin(e), (Math.cos(a) * nz + Math.sin(a) * ez) * h).normalize();
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
const lerpC = (a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color) => out.copy(a).lerp(b, t);

export interface LightState {
  sunElevation: number;
  /** 0 day .. 1 night: drives lit windows. */
  night: number;
  /** 0..1 street/neon lighting level (comes on in a wave just before sunset). */
  lightsOn: number;
  /** Tone-mapping exposure: stopped down at noon, opened up at night (cinematographer's iris). */
  exposure: number;
}

/**
 * Atmosphere driven by the world clock: real NYC solar position for the in-game date and 1974 EDT time,
 * sun colour/intensity by elevation (white noon, golden hour, dusk), moonlight + sodium city glow at
 * night, haze colour following the sky. Weather variety is Phase 6.
 */
export class Atmosphere {
  readonly sky = new SkyMesh();
  readonly sun = new THREE.DirectionalLight(0xffb27a, 2.2);
  readonly hemi = new THREE.HemisphereLight(0x9aa2c4, 0x3a302a, 1.7);
  readonly sunDir = new THREE.Vector3();
  readonly lightDir = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {
    this.sky.scale.setScalar(40000);
    this.sky.turbidity.value = 8;
    this.sky.rayleigh.value = 2.2;
    this.sky.mieCoefficient.value = 0.012;
    this.sky.mieDirectionalG.value = 0.9;
    this.sky.cloudCoverage.value = 0.25;
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    scene.fog = new THREE.Fog(0x7a6a66, 250, 3800);
    this.setSun(298, 4); // NYC, late June, ~20:15 EDT
  }

  private tmp = { a: new THREE.Color(), b: new THREE.Color() };

  /** Shadows: one map following the player (2k High / 1k Medium), 160 m across, re-aimed every frame. */
  enableShadows(renderer: THREE.WebGPURenderer, mapSize: number) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const sh = this.sun.shadow;
    this.sun.castShadow = true;
    sh.mapSize.set(mapSize, mapSize);
    const cam = sh.camera as THREE.OrthographicCamera;
    cam.left = -80; cam.right = 80; cam.top = 80; cam.bottom = -80; cam.near = 10; cam.far = 1200;
    sh.bias = -0.0004; sh.normalBias = 0.6;
  }
  /** Keep the shadow frustum centred on the focus (texel-snapped to avoid shimmer). */
  followFocus(x: number, y: number, z: number) {
    const texel = 160 / this.sun.shadow.mapSize.x;
    const sx = Math.round(x / texel) * texel, sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + this.lightDir.x * 500, y + this.lightDir.y * 500, sz + this.lightDir.z * 500);
    this.sun.target.updateMatrixWorld();
  }
  readonly state: LightState = { sunElevation: 0, night: 0, lightsOn: 0, exposure: 1 };

  /** Recompute sun, sky, lights and haze from the world clock. Cheap; call every frame. */
  update(): LightState {
    const { azimuth, elevation: el } = sunPosition(worldClock.date, exactMinutes());
    const day = smooth(-4, 12, el), golden = 1 - smooth(2, 18, el), night = smooth(3, -7, el);
    const moonUp = smooth(-3, -8, el);
    // The sky always uses the REAL sun (below the horizon at night = dark sky); only the directional
    // light switches to the moon.
    compassToWorld(azimuth, el, this.sunDir);
    this.sky.sunPosition.value.copy(this.sunDir);
    if (moonUp > 0.5) compassToWorld(160, 42, this.lightDir); // moonlight from the south-east, high
    else compassToWorld(azimuth, Math.max(el, 0.5), this.lightDir);
    this.sun.position.copy(this.lightDir).multiplyScalar(1000);
    // sun / moon light
    lerpC(C(1.0, 0.95, 0.86), C(1.0, 0.62, 0.36), golden, this.sun.color);
    if (moonUp > 0.5) this.sun.color.set(0.55, 0.62, 0.85);
    this.sun.intensity = moonUp > 0.5 ? 0.12 * moonUp : 3.1 * day * (1 - 0.45 * golden);
    // sky / ground fill: blue skylight by day, sodium-lit city glow bouncing up at night
    lerpC(C(0.62, 0.68, 0.82), C(0.42, 0.4, 0.52), golden, this.tmp.a);
    lerpC(this.tmp.a, C(0.09, 0.1, 0.17), night, this.hemi.color);
    lerpC(C(0.32, 0.27, 0.22), C(0.3, 0.18, 0.09), night, this.hemi.groundColor);
    this.hemi.intensity = (this.envEnabled ? 1.0 : 1.5) * day + 0.55 * night + 0.2;
    // sky dome
    this.sky.turbidity.value = 6 + 4 * golden;
    this.sky.rayleigh.value = 1.6 + 1.2 * golden;
    // haze colour follows the sky: bleached day, rose dusk, sodium-brown night
    lerpC(C(0.66, 0.63, 0.6), C(0.52, 0.42, 0.42), golden, this.tmp.b);
    lerpC(this.tmp.b, C(0.09, 0.075, 0.07), night, (this.scene.fog as THREE.Fog).color);
    // late-night windows thin out between 1:00 and 5:30
    const m = worldClock.minutes, late = m > 60 && m < 330 ? 0.45 : 1;
    this.state.sunElevation = el; this.state.night = night * late; this.state.lightsOn = smooth(6, -1, el);
    this.state.exposure = 0.5 + 0.38 * golden + 0.35 * night; // ~0.5 noon, ~0.88 golden, ~1.2 night
    return this.state;
  }

  // ---- reflection / image-based environment (vehicles request 2): a PMREM of the live sky only ----
  private envScene = new THREE.Scene();
  private pmrem?: THREE.PMREMGenerator;
  private envRT?: THREE.RenderTarget;
  private envSun = new THREE.Vector3(0, -1, 0);
  /** Strength of sky IBL (diffuse + specular) relative to the hemisphere fill it partly replaces. */
  envIntensity = 0.55;
  envEnabled = true;
  /**
   * Re-capture the sky into scene.environment when the sun has moved > 2 deg (about every 16 s of
   * game time at the default day length). Only the sky is captured: buildings are not in the probe,
   * so reflections read as open sky/haze, correct for paint, chrome and glass at street level.
   */
  updateEnvironment(renderer: THREE.WebGPURenderer, force = false) {
    if (!this.envEnabled) return;
    if (!force && this.envRT && this.sunDir.angleTo(this.envSun) < THREE.MathUtils.degToRad(2)) return;
    this.envSun.copy(this.sunDir);
    this.pmrem ??= new THREE.PMREMGenerator(renderer);
    const parent = this.sky.parent;
    this.envScene.add(this.sky);
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02, 1, 100000, { size: 128, renderTarget: (this.envRT ?? null) as any }) as unknown as THREE.RenderTarget; // eslint-disable-line @typescript-eslint/no-explicit-any
    parent?.add(this.sky);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.envIntensity;
  }

  setSun(azimuthDeg: number, elevationDeg: number) {
    compassToWorld(azimuthDeg, elevationDeg, this.sunDir);
    this.sky.sunPosition.value.copy(this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(1000);
  }
}
