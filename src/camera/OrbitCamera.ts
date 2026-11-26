import * as THREE from 'three/webgpu';
import type { Input } from '../input/Input';
import type { Physics } from '../physics/Physics';
import { heightAt } from '../shared/terrain';
import type RAPIER from '@dimforge/rapier3d-compat';

/**
 * On-foot third-person orbit camera: over-the-shoulder offset, smoothed follow, wheel/pinch zoom,
 * and a collision "spring arm" (ray from the head to the desired camera position) so walls and
 * buildings never get between camera and player. yaw 0 = looking up -Z.
 */
export class OrbitCamera {
  yaw = 0;
  pitch = -0.05; // near-level: horizon at eye height, street and skyline dominate the frame
  distance = 5.6;
  shoulder = 0.75; // character sits left of centre
  private target = new THREE.Vector3();
  private armLen = 4.2;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(public camera: THREE.PerspectiveCamera, private input: Input, private physics: Physics, private exclude?: RAPIER.Collider) {}

  snap(feet: { x: number; y: number; z: number }, yaw: number) {
    this.yaw = yaw; this.target.set(feet.x, feet.y + 1.5, feet.z); this.armLen = this.distance;
  }

  update(dt: number, feet: { x: number; y: number; z: number }) {
    const look = this.input.consumeLook();
    this.yaw += look.yaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, -1.1, 0.75);
    const w = this.input.consumeWheel();
    if (w) this.distance = THREE.MathUtils.clamp(this.distance * (w > 0 ? 1.12 : 0.89), 1.6, 9);

    // smoothed head target (tight vertically to hide stair/curb steps less, loose horizontally)
    const k = 1 - Math.exp(-dt * 16), kv = 1 - Math.exp(-dt * 10);
    this.target.x += (feet.x - this.target.x) * k;
    this.target.z += (feet.z - this.target.z) * k;
    this.target.y += (feet.y + 1.5 - this.target.y) * kv;

    // desired offset: behind (+back), right shoulder, pitched
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const back = new THREE.Vector3(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const origin = this.target.clone().addScaledVector(right, this.shoulder);
    const dir = back.clone();
    // spring arm: pull in instantly on hit, ease back out
    const hit = this.physics.ray(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, this.distance + 0.3, this.exclude);
    const want = hit === null ? this.distance : Math.max(0.35, hit - 0.3);
    this.armLen = want < this.armLen ? want : this.armLen + (want - this.armLen) * (1 - Math.exp(-dt * 3));
    const pos = origin.addScaledVector(dir, this.armLen);
    pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.35);
    this.camera.position.copy(pos);
    this.euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);
  }
}
