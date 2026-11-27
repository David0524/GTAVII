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
    // Facing cue (user camera report: the symmetric capsule showed no facing, so the camera seemed to turn
    // the player). Head with a dark visor and nose on the front (-z), and a faint arrow on the ground.
    const skin = new THREE.MeshStandardMaterial({ color: 0xc9a080, roughness: 0.7 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), skin); head.position.set(0, 0.86, 0);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.08), dark); visor.position.set(0, 0.03, -0.13);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.08), skin); nose.position.set(0, -0.04, -0.17);
    head.add(visor, nose); this.torso.add(head);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 3).rotateX(-Math.PI / 2).translate(0, 0.02, -0.62), new THREE.MeshBasicMaterial({ color: 0xe6dcc6, transparent: true, opacity: 0.35, depthWrite: false }));
    arrow.scale.y = 0.05; this.object.add(arrow);
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
