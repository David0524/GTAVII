/**
 * Procedural layers on a posed skeleton (world space): analytic two-bone IK (legs on curbs,
 * stairs and slopes; arms to doors, rails and steering wheels), and a look-at that spreads the
 * turn over spine, neck, head and eyes with limits.
 */
import * as THREE from 'three/webgpu';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _pole = new THREE.Vector3();

export function worldPos(b: THREE.Object3D, out: THREE.Vector3) { return out.setFromMatrixPosition(b.matrixWorld); }

/** Rotate bone `b` (local) by a world-space rotation `qw`, then refresh its subtree matrices. */
export function rotateWorld(b: THREE.Object3D, qw: THREE.Quaternion) {
  const parentQ = _q2;
  if (b.parent) b.parent.getWorldQuaternion(parentQ); else parentQ.identity();
  // local' = parent^-1 * qw * parent * local
  const inv = parentQ.clone().invert();
  b.quaternion.premultiply(inv.multiply(qw).multiply(parentQ));
  b.updateMatrixWorld(true);
}

/**
 * Two-bone IK: rotates `upper` and `mid` so `end` reaches `target` (clamped to reach), keeping
 * the bend in the plane towards `pole` (world point). Blend 0..1.
 */
export function twoBoneIK(upper: THREE.Bone, mid: THREE.Bone, end: THREE.Bone, target: THREE.Vector3, pole: THREE.Vector3 | null, blend = 1) {
  if (blend <= 0) return;
  worldPos(upper, _a); worldPos(mid, _b); worldPos(end, _c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _t.copy(target);
  if (blend < 1) _t.lerpVectors(_c, target, blend);
  const toT = _v1.subVectors(_t, _a);
  const dist = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  // current bend plane normal
  const curDir = _v2.subVectors(_c, _a);
  const bendAxis = new THREE.Vector3();
  if (pole) bendAxis.crossVectors(curDir, _pole.subVectors(pole, _a)).normalize();
  if (!pole || bendAxis.lengthSq() < 1e-8) bendAxis.crossVectors(curDir, new THREE.Vector3().subVectors(_b, _a)).normalize();
  if (bendAxis.lengthSq() < 1e-8) return;
  // 1) set the knee angle: desired angle at the upper joint from the law of cosines
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const angA = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // build desired mid position in the plane spanned by toT and the bend direction
  const dirT = toT.clone().normalize();
  const side = new THREE.Vector3().crossVectors(bendAxis, dirT).normalize();
  const midTarget = new THREE.Vector3().copy(_a).addScaledVector(dirT, Math.cos(angA) * l1).addScaledVector(side, Math.sin(angA) * l1);
  // keep the bend on the same side as the current knee
  const curSide = new THREE.Vector3().subVectors(_b, _a).sub(dirT.clone().multiplyScalar(new THREE.Vector3().subVectors(_b, _a).dot(dirT)));
  if (curSide.dot(side) < 0 && !pole) midTarget.copy(_a).addScaledVector(dirT, Math.cos(angA) * l1).addScaledVector(side, -Math.sin(angA) * l1);
  // rotate upper so mid goes to midTarget
  _q.setFromUnitVectors(_v1.subVectors(_b, _a).normalize(), _v2.subVectors(midTarget, _a).normalize());
  rotateWorld(upper, _q);
  // rotate mid so end goes to target
  worldPos(mid, _b); worldPos(end, _c);
  _q.setFromUnitVectors(_v1.subVectors(_c, _b).normalize(), _v2.subVectors(_t, _b).normalize());
  rotateWorld(mid, _q);
}

/** Orient a bone so its local +Y (up) axis aligns with a world normal, blended (foot to slope). */
export function alignToNormal(b: THREE.Bone, n: THREE.Vector3, blend: number) {
  if (blend <= 0) return;
  b.getWorldQuaternion(_q);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
  _q2.setFromUnitVectors(up, n);
  _q2.slerp(new THREE.Quaternion(), 1 - blend);
  rotateWorld(b, _q2);
}

/**
 * Look-at: turns the chain [spine_03, neck, head] (weights sum ≈ 1) towards a world target,
 * clamped to a cone, then aims the eyes the rest of the way.
 */
export function lookAt(chain: { bone: THREE.Bone; w: number }[], eyes: THREE.Bone[], head: THREE.Bone, target: THREE.Vector3, blend: number, maxYaw = 1.4, maxPitch = 0.6) {
  if (blend <= 0) return;
  head.updateMatrixWorld(true);
  head.getWorldQuaternion(_q);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
  worldPos(head, _a);
  const to = new THREE.Vector3().subVectors(target, _a);
  if (to.lengthSq() < 1e-4) return;
  to.normalize();
  // clamp in the body's frame (yaw/pitch relative to the current head forward)
  const yaw = Math.atan2(to.x, to.z) - Math.atan2(fwd.x, fwd.z);
  let dy = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const pitch = Math.asin(Math.max(-1, Math.min(1, to.y))) - Math.asin(Math.max(-1, Math.min(1, fwd.y)));
  dy = Math.max(-maxYaw, Math.min(maxYaw, dy)) * blend;
  const dp = Math.max(-maxPitch, Math.min(maxPitch, pitch)) * blend;
  for (const { bone, w } of chain) {
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), dy * w);
    bone.getWorldQuaternion(_q2);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(_q2);
    const qp = new THREE.Quaternion().setFromAxisAngle(right, -dp * w);
    rotateWorld(bone, _q.multiply(qp));
  }
  // eyes: residual
  for (const e of eyes) {
    e.updateMatrixWorld(true);
    e.getWorldQuaternion(_q);
    const ef = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    worldPos(e, _b);
    const et = new THREE.Vector3().subVectors(target, _b).normalize();
    const lim = 0.45;
    const ang = ef.angleTo(et);
    const tt = ang > lim ? lim / ang : 1;
    _q2.setFromUnitVectors(ef, et).slerp(new THREE.Quaternion(), 1 - tt * blend);
    rotateWorld(e, _q2);
  }
  void _m;
}
