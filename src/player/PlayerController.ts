import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/Physics';
import type { Input } from '../input/Input';
import { heightAt } from '../shared/terrain';
import { GROUPS } from '../shared/physicsGroups';

/**
 * Third-person on-foot controller: Rapier kinematic character controller on a capsule.
 *   - walk / run / sprint (analog: partial stick walks, full stick runs; sprint is held)
 *   - autostep onto curbs and stoops (<= 0.4 m), snap to ground on the real terrain slopes
 *   - jump; jumping at a ledge 0.45-1.9 m high climbs it instead (raycast ledge detection)
 * Position is the FEET point. Rendering interpolates between fixed steps.
 */
export const CAPSULE = { radius: 0.32, halfHeight: 0.6 } as const; // total height 1.84 m
const FOOT_TO_CENTER = CAPSULE.halfHeight + CAPSULE.radius;
export const SPEED = { walk: 1.5, run: 3.4, sprint: 6.0 } as const;
const JUMP_V = 4.6, GRAVITY = 9.81, COYOTE = 0.12;

export type LocoMode = 'walk' | 'run' | 'sprint' | 'crouch';
export interface LocoState { velocity: [number, number, number]; grounded: boolean; heading: number; mode: LocoMode; climbing: boolean }

export class PlayerController {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  /** Feet position: current and previous fixed step (for interpolation). */
  readonly pos = { x: 0, y: 0, z: 0 };
  private prev = { x: 0, y: 0, z: 0 };
  readonly vel = { x: 0, y: 0, z: 0 };
  heading = 0; // yaw: 0 = facing -Z
  grounded = false;
  mode: LocoMode = 'run';
  private airTime = 0;
  private climb: { t: number; dur: number; from: [number, number, number]; to: [number, number, number] } | null = null;
  /** When false the body holds still (e.g. until colliders around the spawn exist). */
  active = false;
  stats = { climbs: 0, jumps: 0 };

  constructor(private physics: Physics, x: number, y: number, z: number, heading: number) {
    const w = physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + FOOT_TO_CENTER, z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(CAPSULE.halfHeight, CAPSULE.radius).setCollisionGroups(GROUPS.player), this.body);
    this.kcc = w.createCharacterController(0.03);
    this.kcc.enableAutostep(0.4, 0.15, false);
    this.kcc.enableSnapToGround(0.35);
    this.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.kcc.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    this.kcc.setSlideEnabled(true);
    Object.assign(this.pos, { x, y, z }); Object.assign(this.prev, this.pos);
    this.heading = heading;
  }

  teleport(x: number, y: number, z: number, heading = this.heading) {
    Object.assign(this.pos, { x, y, z }); Object.assign(this.prev, this.pos);
    this.vel.x = this.vel.y = this.vel.z = 0; this.heading = heading; this.climb = null;
    this.body.setTranslation({ x, y: y + FOOT_TO_CENTER, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + FOOT_TO_CENTER, z });
  }

  /** Fixed-step update. camYaw orients stick/keys relative to the camera. */
  fixedUpdate(h: number, input: Input, camYaw: number, jumpPressed: boolean) {
    Object.assign(this.prev, this.pos);
    if (!this.active) return;
    if (this.climb) { this.stepClimb(h); return; }

    // desired planar velocity
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * input.move.y + rx * input.move.x, dz = fz * input.move.y + rz * input.move.x;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 1e-3) { const L = Math.hypot(dx, dz); dx /= L; dz /= L; }
    const sprint = input.isHeld('sprint') && mag > 0.3;
    this.mode = sprint ? 'sprint' : mag > 0.6 ? 'run' : 'walk';
    const speed = mag < 1e-3 ? 0 : sprint ? SPEED.sprint : mag > 0.6 ? SPEED.run : SPEED.walk * Math.max(0.4, mag / 0.6);
    const accel = this.grounded ? (speed > Math.hypot(this.vel.x, this.vel.z) ? 14 : 18) : 3;
    const tx = dx * speed, tz = dz * speed;
    const k = Math.min(1, accel * h / Math.max(0.001, Math.hypot(tx - this.vel.x, tz - this.vel.z)));
    this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;

    // jump / climb
    if (jumpPressed && (this.grounded || this.airTime < COYOTE)) {
      if (!this.tryClimb()) { this.vel.y = JUMP_V; this.grounded = false; this.airTime = COYOTE; this.stats.jumps++; }
      else return;
    }
    this.vel.y = this.grounded && this.vel.y <= 0 ? -1.5 : this.vel.y - GRAVITY * h;

    // move with collision
    const want = { x: this.vel.x * h, y: this.vel.y * h, z: this.vel.z * h };
    this.kcc.computeColliderMovement(this.collider, want);
    const m = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.vel.y > 0 && m.y < want.y * 0.5) this.vel.y = 0; // bumped head
    if (this.grounded) this.airTime = 0; else this.airTime += h;
    // wall stop: kill velocity into obstacles so we don't keep pushing
    if (Math.abs(want.x) > 1e-5 && Math.abs(m.x) < Math.abs(want.x) * 0.3) this.vel.x *= 0.5;
    if (Math.abs(want.z) > 1e-5 && Math.abs(m.z) < Math.abs(want.z) * 0.3) this.vel.z *= 0.5;
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;

    // safety: never fall through the world
    const g = heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < g - 3) { this.pos.y = g + 0.2; this.vel.y = 0; }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + FOOT_TO_CENTER, z: this.pos.z });

    // face movement direction
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3 && mag > 1e-3) {
      const target = Math.atan2(-this.vel.x, -this.vel.z);
      let d = target - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, h * 12);
    }
  }

  /** Ledge ahead within reach and 0.45-1.9 m above the feet, with room on top -> start a climb. */
  private tryClimb(): boolean {
    const p = this.physics, x = this.pos.x, y = this.pos.y, z = this.pos.z;
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    let wall: number | null = null;
    for (const hgt of [0.35, 0.9, 1.4]) {
      const d = p.ray(x, y + hgt, z, fx, 0, fz, 0.9, this.collider);
      if (d !== null && (wall === null || d < wall)) wall = d;
    }
    if (wall === null) return false;
    const reach = wall + 0.4, top0 = y + 2.2;
    const down = p.ray(x + fx * reach, top0, z + fz * reach, 0, -1, 0, 2.2, this.collider);
    if (down === null) return false;
    const topY = top0 - down, rise = topY - y;
    if (rise < 0.45 || rise > 1.9) return false;
    // room to stand on top (no wall right behind the ledge, no low ceiling)
    if (p.ray(x + fx * reach, topY + 0.2, z + fz * reach, 0, 1, 0, 1.75, this.collider) !== null) return false;
    if (p.ray(x, topY + 0.5, z, fx, 0, fz, reach + 0.3, this.collider) !== null) return false;
    this.climb = { t: 0, dur: 0.35 + rise * 0.25, from: [x, y, z], to: [x + fx * reach, topY + 0.02, z + fz * reach] };
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.stats.climbs++;
    return true;
  }

  private stepClimb(h: number) {
    const c = this.climb!; c.t += h;
    const u = Math.min(1, c.t / c.dur);
    // up first, then over: vertical leads, horizontal follows
    const uy = Math.min(1, u * 1.6), ux = Math.max(0, (u - 0.35) / 0.65);
    const ease = (t: number) => t * t * (3 - 2 * t);
    this.pos.x = c.from[0] + (c.to[0] - c.from[0]) * ease(ux);
    this.pos.y = c.from[1] + (c.to[1] - c.from[1]) * ease(uy);
    this.pos.z = c.from[2] + (c.to[2] - c.from[2]) * ease(ux);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + FOOT_TO_CENTER, z: this.pos.z });
    if (u >= 1) { this.climb = null; this.grounded = true; }
  }

  get climbing() { return this.climb !== null; }

  /** Interpolated feet position for rendering. */
  renderPos(alpha: number) {
    return { x: this.prev.x + (this.pos.x - this.prev.x) * alpha, y: this.prev.y + (this.pos.y - this.prev.y) * alpha, z: this.prev.z + (this.pos.z - this.prev.z) * alpha };
  }

  loco(): LocoState {
    return { velocity: [this.vel.x, this.vel.y, this.vel.z], grounded: this.grounded, heading: this.heading, mode: this.mode, climbing: this.climbing };
  }
}
