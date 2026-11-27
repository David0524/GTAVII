import { clamp, dot, norm, sub, wrapAngle, type V3 } from '../core/vec';

/**
 * Aiming per device (docs/GAMEPLAY_PROGRESS.md "Aiming"):
 *  - Touch: LOCK-ON. Tap AIM to lock the best target; swipe or tap ◀ ▶ to cycle; tap HEAD / BODY / LEGS
 *    to pick a limb; hold FIRE for assisted fire at the locked limb (weapon spread and lead skill still
 *    apply). No touch action needs precise free aim.
 *  - Pad: SOFT LOCK. Pulling aim snaps once to the target nearest the crosshair (within SNAP_DEG),
 *    then friction slows the stick over targets and magnetism drags along with a moving target. Free
 *    aim when the setting is off.
 *  - Mouse: free aim; the aim-assist setting adds friction only (no snapping).
 */
export type Limb = 'head' | 'torso' | 'legs';
export interface AimTarget { id: string; chest: V3; head: V3; legs: V3; hostile: boolean; alive: boolean; visible: boolean; threat: number }
export type AssistLevel = 'off' | 'low' | 'standard' | 'strong';
const ASSIST: Record<AssistLevel, { snap: number; friction: number; magnet: number }> = {
  off: { snap: 0, friction: 1, magnet: 0 },
  low: { snap: 6, friction: 0.75, magnet: 0.15 },
  standard: { snap: 10, friction: 0.55, magnet: 0.3 },
  strong: { snap: 14, friction: 0.4, magnet: 0.45 },
};
export const LOCK_RANGE = 45, LOCK_CONE_DEG = 70;

export class Aim {
  locked: string | null = null;
  limb: Limb = 'torso';
  private snapped = false;

  pointOf(t: AimTarget, limb: Limb = this.limb): V3 { return limb === 'head' ? t.head : limb === 'legs' ? t.legs : t.chest; }

  /** Score candidates in a cone around viewDir. Higher threat and nearer the centre wins. */
  candidates(origin: V3, viewDir: V3, ts: readonly AimTarget[], coneDeg = LOCK_CONE_DEG, range = LOCK_RANGE) {
    const out: { t: AimTarget; ang: number; side: number; score: number }[] = [];
    const cosMax = Math.cos((coneDeg * Math.PI) / 360);
    for (const t of ts) {
      if (!t.alive || !t.visible || !t.hostile) continue;
      const v = sub(t.chest, origin), d = Math.hypot(v[0], v[1], v[2]);
      if (d > range || d < 0.3) continue;
      const c = dot(norm(v), viewDir);
      if (c < cosMax) continue;
      const ang = Math.acos(clamp(c, -1, 1));
      const side = wrapAngle(Math.atan2(-v[0], -v[2]) - Math.atan2(-viewDir[0], -viewDir[2]));
      out.push({ t, ang, side, score: -ang * 2 - d / range + t.threat * 0.6 });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Touch/pad lock: lock the best target (or keep the current one if still valid). */
  lock(origin: V3, viewDir: V3, ts: readonly AimTarget[]): AimTarget | null {
    const c = this.candidates(origin, viewDir, ts);
    const cur = this.locked && ts.find((t) => t.id === this.locked && t.alive && t.visible);
    if (cur) return cur;
    this.locked = c[0]?.t.id ?? null;
    return c[0]?.t ?? null;
  }
  release() { this.locked = null; this.snapped = false; }
  /** Cycle left (-1) / right (+1) by screen side angle. */
  cycle(origin: V3, viewDir: V3, ts: readonly AimTarget[], dir: 1 | -1): AimTarget | null {
    const c = this.candidates(origin, viewDir, ts, 160).sort((a, b) => a.side - b.side);
    if (!c.length) return null;
    const i = c.findIndex((x) => x.t.id === this.locked);
    const n = c[(i < 0 ? 0 : i + (dir > 0 ? -1 : 1) + c.length) % c.length]; // side>0 = left of view
    this.locked = n.t.id;
    return n.t;
  }
  /** Direction to fire for a locked target (assisted fire). */
  lockedDir(origin: V3, ts: readonly AimTarget[]): V3 | null {
    const t = ts.find((x) => x.id === this.locked);
    if (!t || !t.alive) { this.locked = null; return null; }
    return norm(sub(this.pointOf(t), origin));
  }

  /**
   * Pad soft lock / mouse friction. Returns the look-rate multiplier and an optional yaw/pitch nudge
   * (radians) to apply this frame. `aimingStarted` is the frame the aim trigger was pulled.
   */
  assist(origin: V3, dir: V3, ts: readonly AimTarget[], level: AssistLevel, aimingStarted: boolean, device: 'pad' | 'mouse', dt: number) {
    const a = ASSIST[level];
    const res = { rateMul: 1, nudgeYaw: 0, nudgePitch: 0, target: null as AimTarget | null };
    if (level === 'off') return res;
    if (aimingStarted) this.snapped = false;
    const c = this.candidates(origin, dir, ts, Math.max(24, a.snap * 2.4), 60);
    const best = c[0]; if (!best) return res;
    const p = this.pointOf(best.t, 'torso'), v = norm(sub(p, origin));
    const dyaw = wrapAngle(Math.atan2(-v[0], -v[2]) - Math.atan2(-dir[0], -dir[2]));
    const dpitch = Math.asin(clamp(v[1], -1, 1)) - Math.asin(clamp(dir[1], -1, 1));
    const angDeg = (Math.hypot(dyaw, dpitch) * 180) / Math.PI;
    res.target = best.t;
    if (device === 'pad' && !this.snapped && angDeg <= a.snap) { res.nudgeYaw = dyaw; res.nudgePitch = dpitch; this.snapped = true; return res; }
    if (angDeg < 4) {
      res.rateMul = a.friction;
      if (device === 'pad') { const k = Math.min(1, a.magnet * dt * 8); res.nudgeYaw = dyaw * k; res.nudgePitch = dpitch * k; }
    }
    return res;
  }
}
