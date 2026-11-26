import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { TRUE_NORTH } from '../shared/geo';

/** World-space direction for a true-compass azimuth (deg, clockwise from north) and elevation (deg). */
export function compassToWorld(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimuthDeg), e = THREE.MathUtils.degToRad(elevationDeg);
  const [nx, nz] = TRUE_NORTH; // true north in world XZ
  const ex = -nz, ez = nx; // true east = north rotated 90 deg clockwise (seen from above)
  const h = Math.cos(e);
  return out.set((Math.cos(a) * nx + Math.sin(a) * ex) * h, Math.sin(e), (Math.cos(a) * nz + Math.sin(a) * ez) * h).normalize();
}

/**
 * Phase 1 atmosphere: physical sky dome, low sun, hemisphere fill and distance haze.
 * Phase 6 turns this into the full day/night + weather system.
 */
export class Atmosphere {
  readonly sky = new SkyMesh();
  readonly sun = new THREE.DirectionalLight(0xffb27a, 2.2);
  readonly hemi = new THREE.HemisphereLight(0x9aa2c4, 0x3a302a, 1.7);
  readonly sunDir = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
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

  setSun(azimuthDeg: number, elevationDeg: number) {
    compassToWorld(azimuthDeg, elevationDeg, this.sunDir);
    this.sky.sunPosition.value.copy(this.sunDir);
    this.sun.position.copy(this.sunDir).multiplyScalar(1000);
  }
}
