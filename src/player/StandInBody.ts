import * as THREE from 'three/webgpu';
import type { LocoState } from './PlayerController';

/**
 * Placeholder player body until the Characters workstream merges. Structurally implements the
 * subset of its `Character` contract the player uses (object, setLocomotion, update, dispose), so the
 * real character is a drop-in replacement. Generic shape only: a capsule with a facing marker.
 */
export interface PlayerBody {
  readonly object: THREE.Object3D;
  setLocomotion(s: { velocity: [number, number, number]; grounded: boolean; heading: number; mode: 'walk' | 'run' | 'sprint' | 'crouch' }): void;
  update(dt: number): void;
  dispose(): void;
}

export class StandInBody implements PlayerBody {
  readonly object = new THREE.Group();
  private torso: THREE.Mesh;
  private phase = 0;
  private speed = 0;
  private grounded = true;

  constructor(color = 0x8e4a2e) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.2, 4, 12), mat);
    this.torso.position.y = 0.92;
    const marker = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.22), new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.6 }));
    marker.position.set(0, 1.55, -0.26);
    this.torso.add(marker); marker.position.y = 0.63;
    this.object.add(this.torso);
    this.object.name = 'player';
  }

  setLocomotion(s: Parameters<PlayerBody['setLocomotion']>[0] & Partial<LocoState>) {
    this.object.rotation.y = s.heading;
    this.speed = Math.hypot(s.velocity[0], s.velocity[2]);
    this.grounded = s.grounded;
  }

  update(dt: number) {
    // readable motion cues: bob with stride, lean into speed
    this.phase += dt * (2 + this.speed * 2.2);
    const bob = this.grounded ? Math.abs(Math.sin(this.phase)) * Math.min(0.08, this.speed * 0.015) : 0;
    this.torso.position.y = 0.92 + bob;
    this.torso.rotation.x = -Math.min(0.18, this.speed * 0.025);
  }

  dispose() { this.object.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); }
}
