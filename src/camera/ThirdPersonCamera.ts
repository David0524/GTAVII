import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Input } from '../input/Input';
import type { Physics } from '../physics/Physics';
import { heightAt } from '../shared/terrain';
import { G, groups } from '../shared/physicsGroups';

/**
 * On-foot third-person camera to docs/CAMERA_SPEC.md (written by UI & cinematics, owned and reviewed by
 * the engine). A drop-in replacement for OrbitCamera: same public fields, `snap()` and `update(dt, feet)`.
 * The optional third argument to `update` carries the controller state that drives climb, fall and gait framing.
 *
 *  - Collision: a 0.22 m sphere cast along the arm plus two rays alongside it at the camera end, against the
 *    static world and vehicles only (pedestrians and props never pull the camera in). Pull-in is instant;
 *    ease-out is 2.5 m/s and only after 0.25 s clear. Minimum arm 0.6 m; below 1 m the player fades.
 *  - Alley mode: lateral probes from the head; walls on both sides within 1.6 m narrow the shoulder to 0.25 m
 *    and lift the camera 6°.
 *  - Shoulder swap (manual 0.22 s, or automatic when the near shoulder is pinned to a wall), look-behind
 *    (hold, 0.18 s), aim framing, climb, ladder and fall framing, and arm length by gait.
 *
 * Conventions as OrbitCamera: yaw 0 looks up -Z; positive pitch looks up. Wiring (inputs, settings, the
 * player fade) is left to main.ts; see the bottom of CAMERA_SPEC.md.
 */

/** Controller state; `PlayerController.loco()` already supplies the first fields. */
export interface CamLoco {
  velocity: readonly [number, number, number];
  grounded: boolean;
  climbing: boolean;
  /** Hand height while climbing (world y); without it the target sits 0.8 m above the normal head height. */
  handY?: number;
  ladder?: boolean;
  aiming?: boolean;
  /** Landing roll in progress: keep the fall framing until it ends. */
  rolling?: boolean;
}

/** Settings the host copies in (Settings: onFootFollow, cameraShake, reduceMotion; device: mobile). */
export interface CamTune { follow: number; shake: number; reduceMotion: boolean; mobile: boolean }

const DEG = Math.PI / 180;
const RADIUS = 0.22, SIDE = 0.35, MIN_ARM = 0.6, FADE_ARM = 1.0;
const EASE_OUT = 2.5, CLEAR_HOLD = 0.25;
const ALLEY_W = 1.6, ALLEY_SHOULDER = 0.25, ALLEY_PITCH = 6 * DEG;
const SHOULDER = 0.75, SWAP_T = 0.22, AUTO_WALL = 0.8, AUTO_T = 0.4;
const AIM = { shoulder: 0.45, arm: 1.45, fov: -10, t: 0.18 };
const BEHIND_T = 0.18, BEHIND_T_REDUCED = 0.3;
const CLIMB = { arm: 0.8, pitch: -8 * DEG, tin: 0.25, tout: 0.4 };
const LADDER = { arm: 1.2, pitch: 12 * DEG, follow: 8 };
const FALL = { after: 0.35, arm: 1.0, pitch: -10 * DEG, kv: 4, dipT: 0.12 };
const DROP_HOLD = 0.2;
const GAIT = { walk: 5.2, jog: 5.6, sprint: 6.4, sprintFov: 6, rate: 1.5 };

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // ease-in-out
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const approach = (v: number, to: number, step: number) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step));
const k = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class ThirdPersonCamera {
  yaw = 0;
  pitch = -0.05;
  /** User zoom (wheel/pinch). Scales the gait arm lengths; 5.6 = as designed. */
  distance = 5.6;
  /** Current lateral offset in metres (+ = player left of centre). Read-only in practice. */
  shoulder = SHOULDER;
  /** Hold to look behind (pad L3-hold, keyboard B, touch flick down). */
  lookBehind = false;
  /** Preferred side: 1 = right shoulder (settings `shoulderDefault`). */
  side: 1 | -1 = 1;
  tune: CamTune = { follow: 0.6, shake: 1, reduceMotion: false, mobile: false };
  /** Called when the player's opacity should change (1 = solid, down to 0.4 when the lens is close). */
  onPlayerFade?: (alpha: number) => void;
  /** Read by tests and the debug HUD. */
  readonly debug = { arm: 0, want: 0, alley: false, sideT: 1, fovOffset: 0, ms: 0, clearT: 0, autoSwaps: 0 };

  private target = new THREE.Vector3();
  private armLen = 5.6;
  private clearT = 0;
  private sideT = 1; // animated -1..1
  private swapFrom = 1; private swapAge = 1;
  private behind = 0; // 0..1
  private aim = 0; private climb = 0; private fall = 0; private ladder = 0;
  private air = 0; private wasGrounded = true; private dropHold = 0; private lastVy = 0;
  private dip = 0; private dipAge = 1;
  private gaitArm = GAIT.jog; private sprint = 0;
  private pinnedT = 0;
  private alleyK = 0;
  private fade = 1;
  private fovApplied = 0; private fovWritten = -1;
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly ball = new RAPIER.Ball(RADIUS);
  private readonly rot = { x: 0, y: 0, z: 0, w: 1 };
  /** Static world and parked cars only: pedestrians and props never pull the camera in. */
  private readonly filter = groups(G.PLAYER, G.WORLD | G.VEHICLE);
  private readonly v = { origin: new THREE.Vector3(), back: new THREE.Vector3(), right: new THREE.Vector3(), pos: new THREE.Vector3() };

  constructor(public camera: THREE.PerspectiveCamera, private input: Input | null, private physics: Physics, private exclude?: RAPIER.Collider) {}

  snap(feet: { x: number; y: number; z: number }, yaw: number) {
    this.yaw = yaw; this.target.set(feet.x, feet.y + 1.5, feet.z); this.armLen = this.distance;
    this.behind = this.aim = this.climb = this.fall = this.ladder = this.dip = 0; this.air = 0; this.dropHold = 0; this.wasGrounded = true;
    this.sideT = this.side; this.swapAge = 1; this.clearT = 0;
  }

  /** Manual swap (R3 / C / two-finger tap). Also sets the preferred side, so an auto swap is undone only by this. */
  swapShoulder() { this.startSwap((this.side = this.side === 1 ? -1 : 1)); }

  private startSwap(to: number) { if (Math.sign(this.sideT) === to && this.swapAge >= 1) return; this.swapFrom = this.sideT; this.swapAge = 0; this.side = to as 1 | -1; }

  update(dt: number, feet: { x: number; y: number; z: number }, loco?: CamLoco) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    const tune = this.tune;
    if (this.input) {
      const look = this.input.consumeLook();
      this.yaw += look.yaw;
      this.pitch = THREE.MathUtils.clamp(this.pitch + look.pitch, -1.1, 0.75);
      const w = this.input.consumeWheel();
      if (w) this.distance = THREE.MathUtils.clamp(this.distance * (w > 0 ? 1.12 : 0.89), 1.6, 9);
    }

    // ---- state blends
    const vy = loco?.velocity[1] ?? 0, speed = loco ? Math.hypot(loco.velocity[0], loco.velocity[2]) : 0;
    const grounded = loco?.grounded ?? true, climbing = !!loco?.climbing;
    const aiming = !!loco?.aiming, onLadder = !!loco?.ladder;
    this.aim = approach(this.aim, aiming ? 1 : 0, dt / AIM.t);
    this.climb = approach(this.climb, climbing ? 1 : 0, dt / (climbing ? CLIMB.tin : CLIMB.tout));
    this.ladder = approach(this.ladder, onLadder ? 1 : 0, dt / CLIMB.tin);
    // falls: air time counts only while descending and not climbing
    if (!grounded && !climbing && !onLadder && vy < 0) this.air += dt; else if (grounded) this.air = 0;
    const falling = this.air > FALL.after || (!!loco?.rolling && this.fall > 0);
    this.fall = approach(this.fall, falling ? 1 : 0, dt / (falling ? 0.3 : 0.4));
    // a drop (left the ground without jumping): hold height briefly so you see it before you take it
    if (this.wasGrounded && !grounded && !climbing && vy <= 0.5) this.dropHold = DROP_HOLD;
    this.dropHold = Math.max(0, this.dropHold - dt);
    // landing dip sized by impact speed
    if (!this.wasGrounded && grounded && this.lastVy < -6 && !tune.reduceMotion) { this.dip = Math.min(0.35, (-this.lastVy - 6) * 0.03) * tune.shake; this.dipAge = 0; }
    this.wasGrounded = grounded; this.lastVy = vy;
    this.dipAge = Math.min(1, this.dipAge + dt / FALL.dipT);
    // gait arm
    const gaitWant = speed > 5 ? GAIT.sprint : speed > 2.5 ? GAIT.jog : GAIT.walk;
    this.gaitArm = approach(this.gaitArm, gaitWant, dt * GAIT.rate);
    this.sprint = approach(this.sprint, speed > 5 && grounded ? 1 : 0, dt * 2);
    // look-behind
    this.behind = approach(this.behind, this.lookBehind ? 1 : 0, dt / (tune.reduceMotion ? BEHIND_T_REDUCED : BEHIND_T));

    // ---- follow (onFootFollow 0.6 = designed rates; mobile 15% tighter)
    const fs = THREE.MathUtils.clamp(tune.follow, 0.1, 1) / 0.6 * (tune.mobile ? 1.15 : 1);
    const kh = k((this.ladder > 0.5 ? LADDER.follow : 16) * fs, dt);
    const kv = k(THREE.MathUtils.lerp(10, FALL.kv, this.fall) * fs, dt);
    const headY = Math.max(feet.y + 1.5, climbing ? (loco?.handY ?? feet.y + 2.1) + 0.2 : -Infinity);
    this.target.x += (feet.x - this.target.x) * kh;
    this.target.z += (feet.z - this.target.z) * kh;
    if (this.dropHold <= 0) this.target.y += (headY - this.target.y) * kv;

    // ---- frame
    const yaw = this.yaw + Math.PI * (tune.reduceMotion ? ease(this.behind) : easeOut(this.behind));
    const pitchBias = this.climb * CLIMB.pitch + this.ladder * LADDER.pitch + this.fall * FALL.pitch - this.alleyK * ALLEY_PITCH;
    const pitch = THREE.MathUtils.clamp(this.pitch + pitchBias, -1.2, 0.85);
    const zoom = this.distance / 5.6;
    let want = THREE.MathUtils.lerp(this.gaitArm * zoom, AIM.arm, this.aim) + this.climb * CLIMB.arm + this.ladder * LADDER.arm + this.fall * FALL.arm;

    const { origin, back, right, pos } = this.v;
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    back.set(Math.sin(yaw) * cp, -sp, Math.cos(yaw) * cp);
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const head = this.target;

    // ---- lateral probes from the head: alley detection, shoulder clamp, automatic swap
    const ph = this.physics;
    const rHit = ph.world.castRay(new RAPIER.Ray(head, right), ALLEY_W, true, undefined, this.filter, this.exclude)?.timeOfImpact ?? null;
    const lHit = ph.world.castRay(new RAPIER.Ray(head, { x: -right.x, y: 0, z: -right.z }), ALLEY_W, true, undefined, this.filter, this.exclude)?.timeOfImpact ?? null;
    const alley = rHit !== null && lHit !== null;
    this.alleyK = approach(this.alleyK, alley ? 1 : 0, dt / 0.3);
    // swap timing
    this.swapAge = Math.min(1, this.swapAge + dt / SWAP_T);
    this.sideT = THREE.MathUtils.lerp(this.swapFrom, this.side, ease(this.swapAge));
    const nearHit = this.side === 1 ? rHit : lHit, farHit = this.side === 1 ? lHit : rHit;
    if (!aiming && speed > 0.5 && nearHit !== null && nearHit < AUTO_WALL && (farHit === null || farHit > 1.2) && this.behind === 0) {
      this.pinnedT += dt;
      if (this.pinnedT > AUTO_T) { this.pinnedT = 0; this.debug.autoSwaps++; this.startSwap(-this.side); }
    } else this.pinnedT = 0;
    let lateral = THREE.MathUtils.lerp(THREE.MathUtils.lerp(SHOULDER, ALLEY_SHOULDER, this.alleyK), AIM.shoulder, this.aim) * this.sideT;
    // never put the arm's root inside a wall: clamp to the near-side hit
    const sideHit = lateral >= 0 ? rHit : lHit;
    if (sideHit !== null) lateral = Math.sign(lateral) * Math.min(Math.abs(lateral), Math.max(0, sideHit - RADIUS - 0.05));
    this.shoulder = lateral;
    origin.copy(head).addScaledVector(right, lateral);

    // ---- collision: sphere along the arm, two rays alongside it
    const max = want + 0.3;
    const hit = ph.world.castShape(origin, this.rot, back, this.ball, 0, max, true, undefined, this.filter, this.exclude);
    let free = hit ? Math.max(0, hit.time_of_impact - 0.02) : want;
    for (const s of [-SIDE, SIDE]) {
      const o = { x: origin.x + right.x * s, y: origin.y, z: origin.z + right.z * s };
      const r = ph.world.castRay(new RAPIER.Ray(o, back), max, true, undefined, this.filter, this.exclude);
      if (r && r.timeOfImpact - 0.2 < free) free = Math.max(0, r.timeOfImpact - 0.2);
    }
    want = Math.max(MIN_ARM, Math.min(want, free));
    // instant pull-in; ease back out at 2.5 m/s once clear for 0.25 s
    // "clear" means the arm could be longer than it is now; pinned at equal length doesn't count
    if (want <= this.armLen + 1e-4) { this.armLen = want; this.clearT = 0; }
    else { this.clearT += dt; if (this.clearT >= CLEAR_HOLD) this.armLen = approach(this.armLen, want, EASE_OUT * dt); }
    // a hard floor: even at minimum arm, never let the lens end up past the hit
    const lens = hit && free < MIN_ARM ? Math.max(0.05, free) : this.armLen;
    pos.copy(origin).addScaledVector(back, Math.min(this.armLen, lens));
    // landing dip
    if (this.dipAge < 1) pos.y -= this.dip * Math.sin(Math.PI * this.dipAge);
    pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.35);
    this.camera.position.copy(pos);
    this.euler.set(pitch, yaw, 0);
    this.camera.quaternion.setFromEuler(this.euler);

    // ---- player fade when the lens is close
    const fade = this.armLen < FADE_ARM ? THREE.MathUtils.lerp(0.4, 1, (this.armLen - MIN_ARM) / (FADE_ARM - MIN_ARM)) : 1;
    const f = THREE.MathUtils.clamp(fade, 0.4, 1);
    if (Math.abs(f - this.fade) > 0.01) { this.fade = f; this.onPlayerFade?.(f); }

    // ---- FOV offset (aim, sprint kick), layered on whatever the host set
    const fovOff = AIM.fov * this.aim + (tune.reduceMotion ? 0 : GAIT.sprintFov * this.sprint * Math.min(1, tune.shake));
    if (this.camera.fov !== this.fovWritten) this.fovApplied = 0; // host changed the base (resize, settings)
    if (Math.abs(fovOff - this.fovApplied) > 0.01) {
      this.camera.fov += fovOff - this.fovApplied; this.fovApplied = fovOff; this.camera.updateProjectionMatrix();
    }
    this.fovWritten = this.camera.fov;

    const d = this.debug;
    d.arm = this.armLen; d.want = want; d.alley = alley; d.sideT = this.sideT; d.fovOffset = fovOff; d.clearT = this.clearT;
    d.ms = performance.now() - t0;
  }
}
