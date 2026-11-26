import * as THREE from 'three/webgpu';
import type { Input } from '../input/Input';
import { heightAt } from '../shared/terrain';

/**
 * Phase 1 debug camera: free-fly driven by the shared Input actions (keyboard/mouse or touch).
 * Phase 2 replaces it as the default with the third-person orbit/chase rig; this stays as the
 * debug/photo-mode base. yaw 0 = looking up -Z ("Manhattan north"); positive yaw turns left (toward -X).
 */
export class FlyCamera {
  yaw = 0;
  pitch = 0;
  speed = 6;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(public camera: THREE.PerspectiveCamera, private input: Input) {}

  set(x: number, y: number, z: number, yaw: number, pitch = 0) {
    this.camera.position.set(x, y, z); this.yaw = yaw; this.pitch = pitch; this.apply();
  }

  private apply() { this.euler.set(this.pitch, this.yaw, 0); this.camera.quaternion.setFromEuler(this.euler); }

  update(dt: number) {
    const inp = this.input;
    const look = inp.consumeLook();
    this.yaw += look.yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, -1.5, 1.5);
    const w = inp.consumeWheel();
    if (w) this.speed = THREE.MathUtils.clamp(this.speed * (w > 0 ? 0.85 : 1.18), 1, 400);
    const v = this.speed * (inp.isHeld('sprint') ? 6 : 1) * dt;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw); // forward
    const p = this.camera.position;
    p.x += (fx * inp.move.y - fz * inp.move.x) * v;
    p.z += (fz * inp.move.y + fx * inp.move.x) * v;
    p.y += inp.vertical * v;
    p.y = Math.max(p.y, heightAt(p.x, p.z) + 0.4);
    this.apply();
  }
}
