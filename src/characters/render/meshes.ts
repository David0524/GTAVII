import * as THREE from 'three/webgpu';
import type { GeoArrays } from '../build/MeshBuilder';
import { characterMaterial, hairMaterial } from './materials';

export function toGeometry(g: GeoArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(g.uv, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(g.skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(g.skinWeight, 4));
  geo.setAttribute('cA', new THREE.BufferAttribute(g.cA, 3));
  geo.setAttribute('cB', new THREE.BufferAttribute(g.cB, 3));
  geo.setAttribute('m0', new THREE.BufferAttribute(g.m0, 4));
  geo.setAttribute('m1', new THREE.BufferAttribute(g.m1, 4));
  geo.setAttribute('slot', new THREE.BufferAttribute(g.slot, 1));
  geo.setIndex(new THREE.BufferAttribute(g.vertexCount < 65536 ? Uint16Array.from(g.index) : g.index, 1));
  geo.computeBoundingSphere();
  return geo;
}

/** The ≤ 2 draw calls of a character: main (skin + clothes + accessories) and hair. */
export function createSkinnedMeshes(main: GeoArrays, hair: GeoArrays | null, skeleton: THREE.Skeleton, rootBone: THREE.Bone) {
  const m = new THREE.SkinnedMesh(toGeometry(main), characterMaterial());
  m.add(rootBone);
  m.bind(skeleton);
  m.frustumCulled = false; // bounds follow the animated skeleton; culled by the owner instead
  m.castShadow = true; m.receiveShadow = true;
  let h: THREE.SkinnedMesh | null = null;
  if (hair) {
    h = new THREE.SkinnedMesh(toGeometry(hair), hairMaterial());
    h.bind(skeleton, m.bindMatrix);
    h.frustumCulled = false; h.castShadow = true;
  }
  return { main: m, hair: h };
}
