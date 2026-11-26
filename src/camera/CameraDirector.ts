import * as THREE from 'three/webgpu';

/**
 * Camera ownership (UI/cinematics request 4). Gameplay cameras (orbit, fly, later chase/aim) write into
 * `gameplay`, a proxy camera that keeps updating even while another owner drives the real camera.
 * acquire(owner) hands the real camera to e.g. cinematics; release(blendSeconds) blends from its last
 * pose back to the live gameplay pose with no cut or black frame.
 */
export class CameraDirector {
  readonly gameplay = new THREE.PerspectiveCamera();
  private owner = 'gameplay';
  private blend: { t: number; dur: number; fromPos: THREE.Vector3; fromQuat: THREE.Quaternion; fromFov: number } | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  get currentOwner() { return this.owner; }
  private baseFov = 60;
  acquire(owner: string): THREE.PerspectiveCamera { if (this.owner === 'gameplay') this.baseFov = this.camera.fov; this.owner = owner; this.blend = null; return this.camera; }
  release(blendSeconds = 0.8) {
    if (this.owner === 'gameplay') return;
    this.owner = 'gameplay';
    this.blend = blendSeconds > 0 ? { t: 0, dur: blendSeconds, fromPos: this.camera.position.clone(), fromQuat: this.camera.quaternion.clone(), fromFov: this.camera.fov } : null;
  }
  /** The live gameplay pose (cinematics read this to plan the hand-back). */
  gameplayPose() { return { position: this.gameplay.position.clone(), quaternion: this.gameplay.quaternion.clone(), fov: this.gameplay.fov }; }

  /** Call after gameplay cameras updated, before render. */
  update(dt: number) {
    if (this.owner !== 'gameplay') return;
    const g = this.gameplay, c = this.camera;
    if (this.blend) {
      const b = this.blend; b.t += dt;
      const u = Math.min(1, b.t / b.dur), e = u * u * (3 - 2 * u);
      c.position.lerpVectors(b.fromPos, g.position, e);
      c.quaternion.slerpQuaternions(b.fromQuat, g.quaternion, e);
      c.fov = b.fromFov + (this.baseFov - b.fromFov) * e; c.updateProjectionMatrix(); // back to the player's FOV setting
      if (u >= 1) this.blend = null;
    } else { c.position.copy(g.position); c.quaternion.copy(g.quaternion); }
  }
}
