/**
 * Firearms on a character (Character.setWeapon / draw / holster / setAim / fire / setCover).
 *
 *  - The weapon mesh rides a holster (right hip, across the back, or hidden under the coat) and
 *    moves to hand_r halfway through the draw. Its grip frame is measured from the hand's own
 *    knuckle joints (index_01 / pinky_01 across the grip, hand -> middle_01 along the barrel), so it
 *    sits in any body's hand.
 *  - Aim: the Animator holds the pistol aim clips (upper body, pitch-blended) for the arms' base;
 *    here the spine turns toward the target, the gun is placed on the aim line (handguns just under
 *    the eye line, long guns with the butt in the right shoulder pocket), the right arm reaches it by
 *    two-bone IK and the hand is turned to it exactly; the left hand supports (handgun: wraps the
 *    grip; long gun: under the forend). Muzzle rays go where they are pointed.
 *  - Recoil: a critically damped spring kicks the muzzle up and the gun back (per weapon).
 *  - Cover: low cover crouches until aiming (pop up), high cover leans out to the open side.
 */
import * as THREE from 'three/webgpu';
import { WEAPONS, weaponMesh, type WeaponDef, type WeaponKind } from './build/weapons';
import { twoBoneIK, worldPos } from './anim/IK';
import { JOINT_INDEX as JI } from './rig';
import type { Animator } from './anim/Animator';

export type WeaponState = 'none' | 'holstered' | 'drawing' | 'drawn' | 'holstering';
export interface CoverState { height: 'low' | 'high'; side: 'l' | 'r' }
export interface ShotEvent { type: 'shot'; weapon: WeaponKind; muzzle: THREE.Vector3; dir: THREE.Vector3 }

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Rotate a bone about a world axis (keeps its parent). */
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  if (Math.abs(angle) < 1e-5) return;
  bone.parent!.getWorldQuaternion(_q2);
  const qd = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  // local' = parent^-1 * qd * parent * local
  bone.quaternion.premultiply(_q2.clone().invert().multiply(qd).multiply(_q2));
  bone.updateMatrixWorld(true);
}
/** Set a bone's world rotation (blended), keeping its parent. */
function setWorldQuat(bone: THREE.Object3D, q: THREE.Quaternion, w: number) {
  bone.parent!.getWorldQuaternion(_q2);
  const local = _q2.invert().multiply(q);
  bone.quaternion.slerp(local, w);
  bone.updateMatrixWorld(true);
}
/** Rotation taking orthonormal basis (f, a) to (F, A), i.e. R*f = F and R*a = A. */
function basisRot(f: THREE.Vector3, a: THREE.Vector3, F: THREE.Vector3, A: THREE.Vector3, out: THREE.Quaternion) {
  const m1 = new THREE.Matrix4().makeBasis(f, a, f.clone().cross(a)), m2 = new THREE.Matrix4().makeBasis(F, A, F.clone().cross(A));
  return out.setFromRotationMatrix(m2.multiply(m1.transpose()));
}

/** Out of reach: swing the clavicle so the shoulder comes toward the target (shooters protract the
 * support shoulder), at most 0.4 rad. */
function reachAssist(bones: THREE.Bone[], side: 'l' | 'r', target: THREE.Vector3, w: number) {
  const clav = bones[JI[`clavicle_${side}`]], up = bones[JI[`upperarm_${side}`]], lo = bones[JI[`lowerarm_${side}`]], hand = bones[JI[`hand_${side}`]];
  const c = worldPos(clav, new THREE.Vector3()), sh = worldPos(up, new THREE.Vector3());
  const L = sh.distanceTo(worldPos(lo, new THREE.Vector3())) + worldPos(lo, new THREE.Vector3()).distanceTo(worldPos(hand, new THREE.Vector3()));
  const d = sh.distanceTo(target);
  if (d <= 0.97 * L) return;
  const cs = sh.clone().sub(c), ct = target.clone().sub(c);
  const axis = cs.clone().cross(ct); if (axis.lengthSq() < 1e-8) return; axis.normalize();
  const ang = Math.min(0.4, (d - 0.97 * L) / cs.length(), cs.angleTo(ct)) * w;
  rotateWorld(clav, axis, ang);
}

export class WeaponRig {
  def: WeaponDef | null = null;
  state: WeaponState = 'none';
  private mesh: THREE.Mesh | null = null;
  /** gun frame in hand_r's local frame, and in the holster bone's local frame */
  private grip = new THREE.Matrix4(); private holsterM = new THREE.Matrix4(); private holsterBone: THREE.Bone | null = null;
  private t = 0; private dur = 0.6; private resolve: (() => void) | null = null;
  private aimTarget: THREE.Vector3 | null = null;
  aimW = 0; private readyW = 0;
  private rec = 0; private recV = 0;
  cover: CoverState | null = null; private coverLean = 0;
  /** hand-local axes (constant: the knuckles are children of the hand) */
  private axes: { r: { f: THREE.Vector3; a: THREE.Vector3 }; l: { f: THREE.Vector3; a: THREE.Vector3 } } | null = null;

  constructor(private bones: THREE.Bone[], private root: THREE.Object3D, private animator: Animator, private emit: (type: string, e: unknown) => void) {}

  private leather: THREE.Mesh | null = null;
  dispose() { this.mesh?.removeFromParent(); this.mesh = null; this.leather?.removeFromParent(); this.leather = null; }

  private measureAxes() {
    const loc = (side: 'l' | 'r') => {
      const h = this.bones[JI[`hand_${side}`]];
      h.updateMatrixWorld(true);
      const inv = _m.copy(h.matrixWorld).invert();
      const p = (n: string) => worldPos(this.bones[JI[`${n}_${side}`]], new THREE.Vector3()).applyMatrix4(inv);
      const hp = new THREE.Vector3(); // hand origin in its own frame
      const across = p('index_01').sub(p('pinky_01')).normalize();
      const along = p('middle_01').sub(hp);
      along.addScaledVector(across, -along.dot(across)).normalize();
      return { f: along, a: across };
    };
    this.axes = { r: loc('r'), l: loc('l') };
  }

  /** Equip (holstered) or unequip (null). */
  setWeapon(kind: WeaponKind | null) {
    this.dispose();
    this.def = kind ? WEAPONS[kind] : null;
    this.state = kind ? 'holstered' : 'none';
    this.animator.gun.ready = false; this.animator.gun.aim = false; this.animator.gun.long = !!this.def?.long;
    this.readyW = 0; this.aimW = 0;
    if (!kind) return;
    this.root.updateMatrixWorld(true);
    if (!this.axes) this.measureAxes();
    this.mesh = weaponMesh(kind);
    this.mesh.matrixAutoUpdate = false;
    // grip: gun frame in hand_r local. Hand-local axes: f along the barrel (wrist -> knuckles), a across
    // the grip toward the index finger (= the gun's up: the sights sit over the index/thumb web)
    const { f, a } = this.axes!.r;
    const gy = a.clone(), gz = f.clone(), gx = gy.clone().cross(gz).normalize();
    const o = f.clone().multiplyScalar(0.075).addScaledVector(gy, -0.012);
    this.grip.makeBasis(gx, gy, gz).setPosition(o);
    // holster: right hip (barrel down, butt back), across the back (muzzle up over the left shoulder)
    const pelvis = this.bones[JI.pelvis], spine = this.bones[JI.spine_03];
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.getWorldQuaternion(_q)), right = new THREE.Vector3().crossVectors(UP, fwd).negate();
    if (this.def!.carry === 'back') {
      const p = worldPos(spine, new THREE.Vector3()).addScaledVector(fwd, -0.16).addScaledVector(UP, -0.12);
      const z = UP.clone().multiplyScalar(0.85).addScaledVector(right, -0.5).normalize(), y = fwd.clone().negate(), x = y.clone().cross(z).normalize();
      this.holsterBone = spine; this.holsterM.copy(_m2.copy(spine.matrixWorld).invert().multiply(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p)));
    } else {
      const thigh = worldPos(this.bones[JI.thigh_r], new THREE.Vector3());
      const p = thigh.addScaledVector(right, 0.095).addScaledVector(UP, 0.075).addScaledVector(fwd, 0.005);
      const z = UP.clone().negate().addScaledVector(fwd, 0.15).normalize(), y = fwd.clone().negate().addScaledVector(UP, 0.0).normalize(), x = y.clone().cross(z).normalize();
      y.copy(z).cross(x).normalize();
      this.holsterBone = pelvis; this.holsterM.copy(_m2.copy(pelvis.matrixWorld).invert().multiply(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p)));
    }
    this.attach('holster');
    // a leather holster on the belt for handguns (stays when the gun is drawn)
    if (this.def!.carry === 'hip') {
      const len = kind === 'snub' ? 0.1 : kind === 'pistol' ? 0.17 : 0.16;
      const g = new THREE.BoxGeometry(0.042, 0.05, len); g.translate(0, 0.03, 0.02 + len / 2 - 0.035);
      this.leather = new THREE.Mesh(g, new THREE.MeshStandardNodeMaterial({ color: 0x3a2214, roughness: 0.6 }));
      this.leather.matrixAutoUpdate = false; this.leather.matrix.copy(this.holsterM); this.leather.castShadow = true;
      this.holsterBone!.add(this.leather);
    }
  }

  private attach(where: 'hand' | 'holster') {
    const m = this.mesh!; m.removeFromParent();
    if (where === 'hand') { this.bones[JI.hand_r].add(m); m.matrix.copy(this.grip); m.visible = true; }
    else { this.holsterBone!.add(m); m.matrix.copy(this.holsterM); m.visible = this.def!.carry !== 'hidden'; }
    m.matrixWorldNeedsUpdate = true;
  }

  draw(): Promise<void> {
    if (!this.def || this.state === 'drawn' || this.state === 'drawing') return Promise.resolve();
    this.state = 'drawing'; this.t = 0; this.dur = this.def.long ? 0.8 : 0.55;
    this.resolve?.();
    return new Promise((r) => { this.resolve = r; });
  }
  holster(): Promise<void> {
    if (!this.def || this.state === 'holstered' || this.state === 'holstering') return Promise.resolve();
    this.state = 'holstering'; this.t = 0; this.dur = this.def.long ? 0.8 : 0.55; this.aimTarget = null;
    this.animator.gun.aim = false; this.animator.gun.ready = false;
    this.resolve?.();
    return new Promise((r) => { this.resolve = r; });
  }
  setAim(target: THREE.Vector3 | null) { this.aimTarget = target ? (this.aimTarget ?? new THREE.Vector3()).copy(target) : null; }

  /** World muzzle position and barrel direction (null when not in hand). */
  muzzle(pos = new THREE.Vector3(), dir = new THREE.Vector3()) {
    if (!this.mesh || !this.def || this.state !== 'drawn') return null;
    this.mesh.updateMatrixWorld(true);
    pos.copy(this.def.muzzle).applyMatrix4(this.mesh.matrixWorld);
    dir.set(0, 0, 1).transformDirection(this.mesh.matrixWorld);
    return { pos, dir };
  }
  /** A shot: recoil kick and a 'shot' event with the muzzle ray (the engine owns ballistics and FX). */
  fire() {
    if (this.state !== 'drawn' || !this.def) return false;
    this.recV += 26;
    const m = this.muzzle();
    if (m) this.emit('shot', { type: 'shot', weapon: this.def.kind, muzzle: m.pos.clone(), dir: m.dir.clone() } satisfies ShotEvent);
    return true;
  }

  /** Test metrics: barrel-to-target angle (deg), gun up vs world up, support hand gap (m). */
  debug() {
    if (!this.mesh || !this.def || this.state !== 'drawn') return null;
    const m = this.muzzle()!; const out: Record<string, number> = {};
    if (this.aimTarget) out.aimErrDeg = +THREE.MathUtils.radToDeg(m.dir.angleTo(this.aimTarget.clone().sub(m.pos))).toFixed(1);
    out.upDot = +new THREE.Vector3(0, 1, 0).transformDirection(this.mesh.matrixWorld).dot(UP).toFixed(2);
    out.dirY = +m.dir.y.toFixed(2);
    const sup = this.def.long ? this.def.forend! : new THREE.Vector3(-0.022, -0.035, -0.006);
    const lp = sup.clone().applyMatrix4(this.mesh.matrixWorld), palm = worldPos(this.bones[JI.middle_01_l], new THREE.Vector3());
    out.supportGap = +lp.distanceTo(palm).toFixed(3);
    const hand = worldPos(this.bones[JI.hand_r], new THREE.Vector3()), want = this.lastHand;
    if (want) out.rHandGap = +hand.distanceTo(want).toFixed(3);
    for (const [k, v] of Object.entries(this.dbgL)) out['L' + k] = +v.toFixed(3);
    return out;
  }
  private lastHand: THREE.Vector3 | null = null;
  private dbgL: Record<string, number> = {};

  /** Low cover: crouch unless aiming. */
  wantsCrouch() { return !!this.cover && this.cover.height === 'low' && !this.aimTarget; }

  /** After the animated pose (and foot IK), before gameplay hand targets. */
  update(dt: number) {
    if (!this.def || !this.mesh) return;
    const hand = this.bones[JI.hand_r];
    // draw / holster timeline: the hand goes to the holster, the gun changes parent at the middle
    if (this.state === 'drawing' || this.state === 'holstering') {
      this.t += dt / this.dur;
      const swap = this.state === 'drawing' ? 0.45 : 0.55;
      if (this.t >= swap && this.mesh.parent !== (this.state === 'drawing' ? hand : this.holsterBone)) {
        this.attach(this.state === 'drawing' ? 'hand' : 'holster');
        if (this.state === 'drawing') this.animator.gun.ready = true;
      }
      // reach for the holster grip (the hand's pose at the swap is the gun's grip in the holster)
      const w = Math.sin(Math.PI * Math.min(1, this.t)) ** 0.7;
      const hm = _m.copy(this.holsterBone!.matrixWorld).multiply(this.holsterM).multiply(_m2.copy(this.grip).invert());
      const tp = new THREE.Vector3().setFromMatrixPosition(hm), tq = new THREE.Quaternion().setFromRotationMatrix(hm);
      const up = this.bones[JI.upperarm_r], lo = this.bones[JI.lowerarm_r];
      const pole = worldPos(lo, new THREE.Vector3()).add(new THREE.Vector3(-0.4, -0.2, -0.5).applyQuaternion(this.root.getWorldQuaternion(_q)));
      twoBoneIK(up, lo, hand, tp, pole, w);
      setWorldQuat(hand, tq, w * 0.9);
      if (this.t >= 1) { this.state = this.state === 'drawing' ? 'drawn' : 'holstered'; this.resolve?.(); this.resolve = null; }
    }
    const drawn = this.state === 'drawn';
    const aiming = drawn && !!this.aimTarget;
    this.animator.gun.aim = aiming;
    this.aimW += ((aiming ? 1 : 0) - this.aimW) * Math.min(1, dt * 12);
    this.readyW += ((drawn ? 1 : 0) - this.readyW) * Math.min(1, dt * 10);
    // recoil spring (critically damped, w = 26/s)
    const w0 = 26; this.recV += (-w0 * w0 * this.rec - 2 * w0 * this.recV) * dt; this.rec += this.recV * dt;
    // cover lean (high cover, aiming): out to the open side
    this.coverLean += ((this.cover?.height === 'high' && aiming ? (this.cover.side === 'l' ? 1 : -1) : 0) - this.coverLean) * Math.min(1, dt * 8);

    const long = this.def.long;
    const poseW = long ? this.readyW : this.aimW; // handguns at low-ready ride the pistol idle clip
    if (poseW < 0.01 || !drawn) return;
    const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rootQ), right = new THREE.Vector3().crossVectors(UP, fwd).negate();
    const head = worldPos(this.bones[JI.Head], new THREE.Vector3());
    const eye = head.clone().addScaledVector(UP, 0.03).addScaledVector(fwd, 0.08);
    // aim direction (from the eye); low-ready (long guns): forward, 40 degrees down, a little across
    const aimDir = this.aimTarget ? this.aimTarget.clone().sub(eye).normalize() : fwd.clone();
    this.animator.gun.pitch = Math.max(-1, Math.min(1, Math.asin(Math.max(-1, Math.min(1, aimDir.y))) / (Math.PI / 4)));
    // spine: turn the chest toward the target (yaw 35/65 over spine_02/03), lean for high cover
    if (this.aimW > 0.01) {
      const h = new THREE.Vector3(aimDir.x, 0, aimDir.z).normalize();
      let yaw = Math.atan2(h.x, h.z) - Math.atan2(fwd.x, fwd.z); yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
      yaw = Math.max(-1.2, Math.min(1.2, yaw)) * this.aimW;
      // long guns: bladed stance, left shoulder forward (chest turned ~25 degrees to the right) so the
      // support hand reaches the forend
      const blade = long ? -0.6 * this.aimW : 0;
      rotateWorld(this.bones[JI.spine_02], UP, yaw * 0.35 + blade * 0.4);
      rotateWorld(this.bones[JI.spine_03], UP, yaw * 0.65 + blade * 0.6);
      if (Math.abs(this.coverLean) > 0.01) {
        const ax = fwd.clone();
        rotateWorld(this.bones[JI.spine_01], ax, -this.coverLean * 0.16);
        rotateWorld(this.bones[JI.spine_02], ax, -this.coverLean * 0.14);
        rotateWorld(this.bones[JI.spine_03], ax, -this.coverLean * 0.1);
      }
    }
    // the gun's frame on the aim line
    const sR = worldPos(this.bones[JI.upperarm_r], new THREE.Vector3()), sL = worldPos(this.bones[JI.upperarm_l], new THREE.Vector3());
    const eye2 = worldPos(this.bones[JI.Head], new THREE.Vector3()).addScaledVector(UP, 0.03).addScaledVector(fwd, 0.08);
    const dirA = this.aimTarget ? this.aimTarget.clone().sub(eye2).normalize() : aimDir;
    const gunAt = (dir: THREE.Vector3, low: boolean) => {
      const z = dir.clone(), y = UP.clone().addScaledVector(z, -z.dot(UP)).normalize(), x = y.clone().cross(z).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      let p: THREE.Vector3;
      if (!long) p = eye2.clone().addScaledVector(dir, 0.42).addScaledVector(y, -0.085);
      else if (this.def!.butt && !low) {
        const pocket = sR.clone().lerp(sL, 0.14).addScaledVector(UP, -0.03).addScaledVector(fwd, 0.04);
        p = pocket.sub(this.def!.butt.clone().applyQuaternion(q));
      } else if (low) {
        p = worldPos(this.bones[JI.pelvis], new THREE.Vector3()).addScaledVector(right, 0.13).addScaledVector(fwd, 0.22).addScaledVector(UP, 0.16);
      } else p = sR.clone().lerp(sL, 0.3).addScaledVector(dir, 0.32).addScaledVector(UP, -0.1); // sawn-off: from the chest
      return { p, q };
    };
    const armLen = (side: 'l' | 'r') => { const u = worldPos(this.bones[JI[`upperarm_${side}`]], new THREE.Vector3()), l = worldPos(this.bones[JI[`lowerarm_${side}`]], new THREE.Vector3()); return u.distanceTo(l) + l.distanceTo(worldPos(this.bones[JI[`hand_${side}`]], new THREE.Vector3())); };
    const LR = armLen('r'), LL = armLen('l');
    const lowDir = fwd.clone().addScaledVector(UP, -0.85).addScaledVector(right, -0.35).normalize();
    let g = gunAt(dirA, false);
    // long guns sit off the eye line: re-aim once from the gun's own muzzle so the barrel's ray hits
    if (long && this.aimTarget) { const mz = this.def.muzzle.clone().applyQuaternion(g.q).add(g.p); g = gunAt(this.aimTarget.clone().sub(mz).normalize(), false); }
    // handguns: back along the aim line until the right hand can reach it (crouched, hunched bodies)
    if (!long) { const ex = g.p.distanceTo(sR) - 0.95 * LR - 0.04; if (ex > 0) g.p.addScaledVector(dirA, -Math.min(0.2, ex)); }
    if (long && this.aimW < 0.999) {
      const lo = gunAt(lowDir, true);
      // low-ready: the forend must be in the support hand's reach (shift the gun toward that shoulder)
      const fe = this.def.forend!.clone().applyQuaternion(lo.q).add(lo.p), ex = fe.distanceTo(sL) - 0.95 * LL - 0.02;
      if (ex > 0) lo.p.addScaledVector(sL.clone().sub(fe).normalize(), Math.min(0.2, ex));
      g = { p: lo.p.lerp(g.p, this.aimW), q: lo.q.slerp(g.q, this.aimW) };
    }
    // recoil: muzzle rises (about the gun's x), gun moves back along the barrel
    const k = Math.max(0, this.rec) / 0.37;
    if (k > 0.001) {
      const gx = new THREE.Vector3(1, 0, 0).applyQuaternion(g.q), gz = new THREE.Vector3(0, 0, 1).applyQuaternion(g.q);
      g.q.premultiply(new THREE.Quaternion().setFromAxisAngle(gx, -this.def.kick[0] * k));
      g.p.addScaledVector(gz, -this.def.kick[1] * k);
      if (long) rotateWorld(this.bones[JI.spine_03], right, -0.06 * k);
    }
    // right hand: where the gun's grip needs it
    const gunM = new THREE.Matrix4().compose(g.p, g.q, new THREE.Vector3(1, 1, 1));
    const handM = gunM.clone().multiply(_m2.copy(this.grip).invert());
    const hp = new THREE.Vector3().setFromMatrixPosition(handM), hq = new THREE.Quaternion().setFromRotationMatrix(handM);
    const upR = this.bones[JI.upperarm_r], loR = this.bones[JI.lowerarm_r];
    const poleR = worldPos(loR, new THREE.Vector3()).addScaledVector(UP, -0.5).addScaledVector(right, long ? 0.25 : 0.35);
    reachAssist(this.bones, 'r', hp, poseW);
    twoBoneIK(upR, loR, hand, hp, poleR, poseW);
    this.lastHand = hp.clone();
    setWorldQuat(hand, hq, poseW);
    // left hand: under the forend (long), wrapping the grip (handgun)
    const sup = long ? this.def.forend! : new THREE.Vector3(-0.022, -0.035, -0.006);
    const lp = sup.clone().applyMatrix4(gunM);
    const gx = new THREE.Vector3(1, 0, 0).applyQuaternion(g.q), gy = new THREE.Vector3(0, 1, 0).applyQuaternion(g.q), gz = new THREE.Vector3(0, 0, 1).applyQuaternion(g.q);
    const { f, a } = this.axes!.l;
    // long: fingers across under the forend to the far side (+x), index toward the muzzle (+z);
    // handgun: fingers wrap the shooting hand (+x, a little down), index along the barrel
    const F = long ? gx.clone().addScaledVector(gy, 0.35).normalize() : gx.clone().addScaledVector(gy, -0.4).addScaledVector(gz, 0.2).normalize();
    const A0 = long ? gz.clone().negate() : gy.clone().negate().addScaledVector(gz, -0.3);
    const A = A0.addScaledVector(F, -A0.dot(F)).normalize();
    const lw = poseW;
    const handL = this.bones[JI.hand_l];
    // the wrist sits behind the support point (the palm is ~6 cm along the fingers)
    const lq = basisRot(f, a, F, A, new THREE.Quaternion());
    const lWrist = lp.clone().addScaledVector(F, -0.055).addScaledVector(gy, long ? -0.035 : -0.01);
    reachAssist(this.bones, 'l', lWrist, lw);
    const upL = this.bones[JI.upperarm_l], loL = this.bones[JI.lowerarm_l];
    const poleL = worldPos(loL, new THREE.Vector3()).addScaledVector(UP, -0.6).addScaledVector(right, -0.3);
    twoBoneIK(upL, loL, handL, lWrist, poleL, lw);
    // (f, a) are the hand's local axes, so R with R*f = F, R*a = A is its world rotation
    setWorldQuat(handL, lq, lw);
    this.dbgL = { wrist: worldPos(handL, new THREE.Vector3()).distanceTo(lWrist), rot: THREE.MathUtils.radToDeg(handL.getWorldQuaternion(new THREE.Quaternion()).angleTo(lq)), reach: worldPos(upL, new THREE.Vector3()).distanceTo(lWrist) };
  }
}

/** Knuckle frame of a hand in its own local space: f along the metacarpals, a across toward the index. */
export function handAxes(bones: THREE.Bone[], side: 'l' | 'r') {
  const h = bones[JI[`hand_${side}`]]; h.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(h.matrixWorld).invert();
  const p = (n: string) => worldPos(bones[JI[`${n}_${side}`]], new THREE.Vector3()).applyMatrix4(inv);
  const a = p('index_01').sub(p('pinky_01')).normalize(), f = p('middle_01');
  f.addScaledVector(a, -f.dot(a)).normalize();
  const n = f.clone().cross(a).normalize();
  // n out of the palm: the thumb's middle joint sits on the palm side
  if (p('thumb_02').dot(n) < 0) n.negate();
  return { f, a, n };
}
const PROP_MATS: Record<string, THREE.Material> = {};
const pm = (k: string, c: number, r = 0.7) => (PROP_MATS[k] ??= new THREE.MeshStandardNodeMaterial({ color: c, roughness: r }));
/** A prop held in the hand (child of the hand bone): broom (right hand, the handle across the fist),
 * a hand of cards (left), a notepad (left palm). */
export function handProp(kind: 'broom' | 'cards' | 'notepad', bones: THREE.Bone[]): THREE.Object3D {
  const side = kind === 'broom' ? 'r' : 'l';
  const { f, n } = handAxes(bones, side);
  const g = new THREE.Group(); g.matrixAutoUpdate = false;
  // frame: x = a (across the fist), y = n (palm normal), z = f (along the fingers); origin at the grip
  const x = n.clone().cross(f).normalize(); // right-handed with y = n, z = f (x ~ a)
  g.matrix.makeBasis(x, n, f).setPosition(f.clone().multiplyScalar(0.07));
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); return o; };
  if (kind === 'broom') {
    // aimed each frame from the fist to the pavement (aimBroom): the stick along -y of its own group
    const b = new THREE.Group(); b.name = 'broom';
    const stick = new THREE.CylinderGeometry(0.013, 0.013, 1.32, 8); stick.translate(0, -0.36, 0);
    b.add(new THREE.Mesh(stick, pm('wood', 0x8a6a44)));
    const head = new THREE.BoxGeometry(0.3, 0.07, 0.06); head.translate(0, -1.02, 0); b.add(new THREE.Mesh(head, pm('bristle', 0x9a8250, 0.95)));
    b.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    return b; // parented by the caller (the character root), not the hand
  } else if (kind === 'cards') {
    for (let i = 0; i < 5; i++) { const c = new THREE.BoxGeometry(0.062, 0.0008, 0.088); c.translate(0, 0, 0.03); c.rotateY((i - 2) * 0.18); c.translate(0, 0.022 + i * 0.001, 0.01); add(c, pm('card', 0xeee8dc, 0.5)); }
  } else {
    const pad = new THREE.BoxGeometry(0.08, 0.01, 0.12); pad.translate(0, 0.024, -0.01); add(pad, pm('pad', 0xd8d0b4, 0.8));
  }
  bones[JI[`hand_${side}`]].add(g);
  return g;
}

/** Broom: from the right fist down to the pavement ahead and to the right (the brush follows the swing). */
export function aimBroom(broom: THREE.Object3D, bones: THREE.Bone[], root: THREE.Object3D) {
  const hand = worldPos(bones[JI.hand_r], new THREE.Vector3()), q = root.getWorldQuaternion(new THREE.Quaternion());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q), right = new THREE.Vector3(-1, 0, 0).applyQuaternion(q);
  const ground = root.getWorldPosition(new THREE.Vector3()).addScaledVector(fwd, 0.55).addScaledVector(right, 0.12);
  ground.x += (hand.x - root.getWorldPosition(new THREE.Vector3()).x) * 0.6; ground.z += (hand.z - root.getWorldPosition(new THREE.Vector3()).z) * 0.6;
  ground.y += 0.035;
  const dir = ground.sub(hand).normalize(); // stick runs down (-y) toward the brush
  broom.position.copy(root.worldToLocal(hand.clone()));
  const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  broom.quaternion.copy(q.clone().invert().multiply(wq));
  // left hand on the stick, 0.42 m up from the right fist
  const grip = hand.clone().addScaledVector(dir, -0.42);
  const lo = bones[JI.lowerarm_l];
  const pole = worldPos(lo, new THREE.Vector3()).addScaledVector(right, -0.4).addScaledVector(new THREE.Vector3(0, 1, 0), -0.3);
  twoBoneIK(bones[JI.upperarm_l], lo, bones[JI.hand_l], grip, pole, 1);
}
