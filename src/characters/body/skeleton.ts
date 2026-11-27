import * as THREE from 'three/webgpu';
import { JOINTS } from '../rig';

/** Builds identity-oriented bones from rest joint positions (see rig.ts). */
export function buildSkeleton(joints: Float32Array): { bones: THREE.Bone[]; skeleton: THREE.Skeleton; root: THREE.Bone } {
  const bones = JOINTS.map((j) => { const b = new THREE.Bone(); b.name = j.name; return b; });
  JOINTS.forEach((j, i) => {
    const p = j.parent;
    const px = p >= 0 ? joints[p * 3] : 0, py = p >= 0 ? joints[p * 3 + 1] : 0, pz = p >= 0 ? joints[p * 3 + 2] : 0;
    bones[i].position.set(joints[i * 3] - px, joints[i * 3 + 1] - py, joints[i * 3 + 2] - pz);
    if (p >= 0) bones[p].add(bones[i]);
  });
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { bones, skeleton, root: bones[0] };
}

/** Rest offsets (bone.position at rest) as a flat array, for resetting poses. */
export function restOffsets(bones: THREE.Bone[]): Float32Array {
  const o = new Float32Array(bones.length * 3);
  bones.forEach((b, i) => b.position.toArray(o, i * 3));
  return o;
}
