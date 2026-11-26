import type { WeaponDef } from '../data/schema';
import type { Rng } from '../core/rng';
import { clamp, norm, type V3 } from '../core/vec';

/**
 * Firearm state for one wielder: magazine, reload (full or per-round, interruptible), fire rate,
 * recoil climb and spread bloom. Pure and deterministic given an Rng.
 *
 * Spread model: cone half-angle (deg) = base(hip|aim) + move·speedFrac + bloom, × lead family skill
 * × injury aimMul, + injury sway. Pellets are sampled with a gaussian-ish radial distribution
 * (dense centre, soft edge), which reads better than a uniform cone.
 */
export interface ShooterMods { aimMul: number; recoilMul: number; reloadMul: number; swayDeg: number }
export const NEUTRAL_MODS: ShooterMods = { aimMul: 1, recoilMul: 1, reloadMul: 1, swayDeg: 0 };

export interface FireContext { origin: V3; dir: V3; aiming: boolean; moveFrac: number; mods: ShooterMods; blind?: boolean; rng: Rng }
export interface ShotRay { origin: V3; dir: V3; range: number; damage: number; falloff: [number, number, number]; power: number; weapon: string; pellet: number }

export class Gun {
  loaded: number;
  cooldown = 0;
  /** Current muzzle climb in degrees (applied to the camera/aim by the controller, recovers over time). */
  recoil = 0;
  bloom = 0;
  reloading: { t: number; dur: number; perRound: boolean } | null = null;
  shotsFired = 0;

  constructor(readonly def: WeaponDef, loaded?: number) { this.loaded = loaded ?? def.magazine ?? 0; }

  get isMelee() { return this.def.class === 'melee'; }
  get canFire() { return !this.isMelee && this.cooldown <= 0 && this.loaded > 0 && (!this.reloading || this.reloading.perRound); }
  get empty() { return !this.isMelee && this.loaded === 0; }

  /** Current spread half-angle in degrees for UI reticle and AI. */
  spread(aiming: boolean, moveFrac: number, mods: ShooterMods, blind = false) {
    const d = this.def;
    const base = (aiming ? d.spreadAim ?? 2 : d.spreadHip ?? 3) + (d.spreadMove ?? 1) * clamp(moveFrac, 0, 1) + this.bloom;
    return base * mods.aimMul * (blind ? 3.2 : 1) + mods.swayDeg * (aiming ? 0.6 : 0.3);
  }

  /** Pull the trigger. Returns the rays to resolve this frame (empty if it can't fire). */
  fire(ctx: FireContext): ShotRay[] {
    if (!this.canFire) return [];
    const d = this.def;
    if (this.reloading?.perRound) this.reloading = null; // firing interrupts single-round loading
    const cone = this.spread(ctx.aiming, ctx.moveFrac, ctx.mods, ctx.blind) * (Math.PI / 180);
    const pellets = d.pellets ?? 1;
    const out: ShotRay[] = [];
    // a shared aim error for the whole shot (so pellets cluster) plus per-pellet scatter for shotguns
    const shared = pellets > 1 ? 0.35 : 1;
    const [ex, ey] = sampleDisc(ctx.rng, cone * shared);
    for (let p = 0; p < pellets; p++) {
      let [px, py] = [ex, ey];
      if (pellets > 1) { const [sx, sy] = sampleDisc(ctx.rng, cone); px += sx; py += sy; }
      out.push({ origin: ctx.origin, dir: deflect(ctx.dir, px, py), range: d.range, damage: d.damage, falloff: d.falloff ?? [d.range, d.range, 1], power: d.penetration ?? 0.5, weapon: d.id, pellet: p });
    }
    this.loaded--; this.shotsFired++;
    this.cooldown = d.interval;
    this.recoil += (d.recoil ?? 2) * ctx.mods.recoilMul * (ctx.aiming ? 1 : 1.2);
    this.bloom = Math.min(this.bloom + (d.bloom ?? 0.4), 6);
    return out;
  }

  /** Start reloading from `reserve` rounds; returns false if nothing to do. */
  startReload(reserve: number, mods: ShooterMods = NEUTRAL_MODS): boolean {
    const d = this.def;
    if (this.isMelee || this.reloading || reserve <= 0 || this.loaded >= (d.magazine ?? 0)) return false;
    const per = !!d.perRound;
    this.reloading = { t: 0, dur: (per ? d.perRound! : d.reload!) * mods.reloadMul, perRound: per };
    return true;
  }

  /** Advance timers. `takeAmmo(n)` removes up to n rounds from reserve and returns how many it got. */
  update(dt: number, takeAmmo: (n: number) => number): 'reloaded' | 'round' | null {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const rec = this.def.recoilRecover ?? 10;
    this.recoil = Math.max(0, this.recoil - rec * dt * (1 + this.recoil * 0.15));
    this.bloom = Math.max(0, this.bloom - rec * 0.25 * dt);
    const r = this.reloading;
    if (!r) return null;
    r.t += dt;
    if (r.t < r.dur) return null;
    const cap = this.def.magazine ?? 0;
    if (r.perRound) {
      const got = takeAmmo(1);
      this.loaded += got;
      if (got === 0 || this.loaded >= cap) { this.reloading = null; return 'reloaded'; }
      r.t -= r.dur; return 'round';
    }
    this.loaded += takeAmmo(cap - this.loaded);
    this.reloading = null;
    return 'reloaded';
  }
  cancelReload() { if (this.reloading) this.reloading = null; }
}

/** Damage multiplier at distance (m) for a [start, end, min] falloff. */
export function falloffAt(f: [number, number, number], dist: number) {
  const [a, b, m] = f;
  if (dist <= a) return 1;
  if (dist >= b) return m;
  return 1 + (m - 1) * ((dist - a) / (b - a));
}

/** Sample a 2D offset (radians) with a soft-edged radial distribution inside `cone`. */
function sampleDisc(rng: Rng, cone: number): [number, number] {
  const r = cone * Math.min(1, Math.abs(rng.gauss()) * 0.55);
  const a = rng.next() * Math.PI * 2;
  return [Math.cos(a) * r, Math.sin(a) * r];
}
/** Rotate unit dir by small yaw/pitch offsets (radians) about its own frame. */
export function deflect(d: V3, yawOff: number, pitchOff: number): V3 {
  // build an orthonormal frame around d
  const up: V3 = Math.abs(d[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
  const rx = d[1] * up[2] - d[2] * up[1], ry = d[2] * up[0] - d[0] * up[2], rz = d[0] * up[1] - d[1] * up[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  const r: V3 = [rx / rl, ry / rl, rz / rl];
  const u: V3 = [r[1] * d[2] - r[2] * d[1], r[2] * d[0] - r[0] * d[2], r[0] * d[1] - r[1] * d[0]];
  const ty = Math.tan(yawOff), tp = Math.tan(pitchOff);
  return norm([d[0] + r[0] * ty + u[0] * tp, d[1] + r[1] * ty + u[1] * tp, d[2] + r[2] * ty + u[2] * tp]);
}
