import * as THREE from 'three/webgpu';
import { lodCrossfadeEnabled } from './gen/materials';

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/**
 * THREE.LOD with a dithered crossfade and hysteresis (VISUAL_BAR: no LOD pops).
 * During a switch both levels render; every vehicle material carries a screen-space dither mask
 * (gen/materials.ts withLodMask) driven by mesh.userData.lodFade, so the outgoing level dissolves
 * into the incoming one over `fadeTime` without holes or double-bright pixels.
 * With crossfade off (phones) it still adds the hysteresis, and switches instantly.
 */
export class FadeLOD extends THREE.LOD {
  fadeTime = 0.35;
  /** Fractional band around each switch distance that must be crossed before switching back. */
  band = 0.1;
  private cur = 0;
  private prev = -1;
  private t0 = 0;
  private last = new Map<THREE.Object3D, number>();

  /**
   * The view camera. The renderer also calls update() from shadow passes (light cameras);
   * those must not switch levels. Set this once (index.ts setVehicleViewCamera); when unset,
   * orthographic cameras (directional shadows) are ignored.
   */
  static viewCamera: THREE.Camera | null = null;
  /** A gap between updates longer than this (s) is a camera cut / paused frame: switch instantly. */
  static cutGap = 0.25;
  private lastT = -1;

  override update(camera: THREE.Camera) {
    const levels = this.levels;
    if (levels.length < 2) return;
    if (FadeLOD.viewCamera ? camera !== FadeLOD.viewCamera : (camera as THREE.OrthographicCamera).isOrthographicCamera) return;
    _a.setFromMatrixPosition(camera.matrixWorld);
    _b.setFromMatrixPosition(this.matrixWorld);
    const dist = _a.distanceTo(_b) / ((camera as THREE.PerspectiveCamera).zoom ?? 1);
    let target = Math.min(this.cur, levels.length - 1);
    while (target + 1 < levels.length && dist >= levels[target + 1].distance * (1 + this.band)) target++;
    while (target > 0 && dist < levels[target].distance * (1 - this.band)) target--;
    const now = performance.now() / 1000;
    const fade = lodCrossfadeEnabled() ? this.fadeTime : 0;
    const cut = this.lastT < 0 || now - this.lastT > FadeLOD.cutGap || Math.abs(target - this.cur) > 1;
    this.lastT = now;
    if (target !== this.cur) { this.prev = cut ? -1 : this.cur; this.cur = target; this.t0 = now; }
    const f = this.prev >= 0 && fade > 0 ? Math.min(1, (now - this.t0) / fade) : 1;
    if (f >= 1) this.prev = -1;
    const t = 1 - f; // share of pixels still on the outgoing level
    for (let i = 0; i < levels.length; i++) {
      const o = levels[i].object;
      const on = i === this.cur || i === this.prev;
      o.visible = on;
      if (!on) continue;
      this.setFade(o, this.prev < 0 ? 1 : i === this.prev ? t : t + 2);
    }
    (this as unknown as { _currentLevel: number })._currentLevel = this.cur;
  }

  private setFade(o: THREE.Object3D, v: number) {
    if (this.last.get(o) === v) return;
    this.last.set(o, v);
    o.traverse((c) => { c.userData.lodFade = v; });
  }
}
