import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import { clamp, wrapAngle, type V3 } from '../core/vec';
import type { WorldQuery } from '../core/world';
import type { WeaponDef } from '../data/schema';
import type { Region } from '../health/Health';

/**
 * Melee: timing-based but readable.
 *  - Every attack has windup → active → recover phases. The windup is announced (`windup` event) so
 *    animation and a telegraph glint can show it; NPC windups are 35% longer than the player's.
 *  - Light (fast, chains), heavy (breaks a guard), kick (pushes back), grapple (then shove / knee / throw).
 *  - Defence: hold block (−80% damage, heavy attacks break it), PARRY by starting a block within the
 *    lead's parryWindow before the hit lands (attacker staggers; your next light hit is a ×2 counter),
 *    DODGE with invulnerability frames.
 *  - Poise: hits drain it; at 0 you stagger; a heavy hit on a staggered fighter knocks them down.
 *  - Environmental shove: a grappled or shoved fighter who meets a wall, car, hydrant or booth within
 *    1.3 m behind them is slammed into it (extra damage, longer stagger, and the prop takes the hit).
 */
export type AttackKind = 'light' | 'heavy' | 'kick' | 'grapple';
export type FighterState = 'idle' | 'windup' | 'active' | 'recover' | 'dodge' | 'stagger' | 'down' | 'grappling' | 'grappled';

export interface AttackSpec { windup: number; active: number; recover: number; poise: number; push: number; arcDeg: number; regions: [Region, number][] }
export const ATTACKS: Record<AttackKind, AttackSpec> = {
  light: { windup: 0.13, active: 0.08, recover: 0.2, poise: 18, push: 0.25, arcDeg: 70, regions: [['torso', 0.6], ['head', 0.3], ['arm_l', 0.05], ['arm_r', 0.05]] },
  heavy: { windup: 0.4, active: 0.1, recover: 0.45, poise: 50, push: 0.8, arcDeg: 100, regions: [['head', 0.45], ['torso', 0.45], ['arm_l', 0.05], ['arm_r', 0.05]] },
  kick: { windup: 0.24, active: 0.1, recover: 0.4, poise: 38, push: 2.2, arcDeg: 60, regions: [['torso', 0.55], ['leg_l', 0.2], ['leg_r', 0.25]] },
  grapple: { windup: 0.15, active: 0.12, recover: 0.5, poise: 0, push: 0, arcDeg: 60, regions: [['torso', 1]] },
};
export const NPC_TELEGRAPH = 1.35;
const DODGE_TIME = 0.45, DODGE_COOLDOWN = 0.6, DODGE_DIST = 2.2;
const STAGGER = 0.6, PARRY_STAGGER = 0.85, KNOCKDOWN = 1.3, POISE_MAX = 100, POISE_REGEN = 30, COUNTER_WINDOW = 0.9;

export interface FighterProfile { damage: number; speed: number; parryWindow: number; dodgeIframes: number; npc: boolean }
export interface Fighter {
  id: string; pos: V3; yaw: number; radius: number;
  weapon: WeaponDef; profile: FighterProfile;
  state: FighterState; t: number; attack: AttackKind | null; hitDone: boolean;
  blocking: boolean; blockStart: number; poise: number; dodgeCd: number; counter: number;
  grappleWith: string | null; team: string; breaksLeft: number; stunFor: number;
}

export interface MeleeHit { attacker: string; target: string; kind: AttackKind; damage: number; region: Region; blocked: boolean; counter: boolean; bleed: number; push: [number, number] }
export interface MeleeEvents extends Record<string, unknown> {
  windup: { id: string; kind: AttackKind; duration: number };
  hit: MeleeHit;
  whiff: { id: string; kind: AttackKind };
  parried: { attacker: string; defender: string };
  guardBroken: { id: string; by: string };
  stagger: { id: string; duration: number };
  knockdown: { id: string; by: string };
  dodge: { id: string; dir: [number, number] };
  grab: { attacker: string; target: string };
  release: { attacker: string; target: string; how: 'shove' | 'throw' | 'escape' | 'knee' };
  slam: { attacker: string; target: string; surface: string; damage: number };
  push: { id: string; dx: number; dz: number };
  weaponBroken: { id: string; weapon: string };
}

export class MeleeSystem extends Emitter<MeleeEvents> {
  readonly fighters = new Map<string, Fighter>();
  time = 0;
  constructor(private rng: Rng, private world?: WorldQuery) { super(); }

  add(id: string, o: { pos: V3; yaw: number; weapon: WeaponDef; profile: FighterProfile; team: string; radius?: number }): Fighter {
    const f: Fighter = {
      id, pos: o.pos, yaw: o.yaw, radius: o.radius ?? 0.35, weapon: o.weapon, profile: o.profile, state: 'idle', t: 0, attack: null, hitDone: false,
      blocking: false, blockStart: -1, poise: POISE_MAX, dodgeCd: 0, counter: 0, grappleWith: null, team: o.team, breaksLeft: o.weapon.melee?.breaks ?? Infinity, stunFor: 0,
    };
    this.fighters.set(id, f);
    return f;
  }
  remove(id: string) { this.fighters.delete(id); }
  setWeapon(id: string, w: WeaponDef) { const f = this.fighters.get(id); if (f) { f.weapon = w; f.breaksLeft = w.melee?.breaks ?? Infinity; } }

  canAct(f: Fighter) { return f.state === 'idle' || (f.state === 'recover' && f.t > this.phase(f).recover * 0.6); }
  private phase(f: Fighter): AttackSpec & { windup: number } {
    const a = ATTACKS[f.attack ?? 'light'];
    const sp = (f.weapon.melee?.speed ?? 1) * f.profile.speed;
    const tele = f.profile.npc ? NPC_TELEGRAPH : 1;
    return { ...a, windup: (a.windup * tele) / sp, recover: a.recover / sp };
  }

  /** Start an attack; returns false if busy. */
  attack(id: string, kind: AttackKind): boolean {
    const f = this.fighters.get(id);
    if (!f || !this.canAct(f) || f.grappleWith) return false;
    f.blocking = false;
    f.state = 'windup'; f.t = 0; f.attack = kind; f.hitDone = false;
    this.emit('windup', { id, kind, duration: this.phase(f).windup });
    return true;
  }

  /** Hold-to-block; the press moment starts the parry window. */
  block(id: string, held: boolean) {
    const f = this.fighters.get(id); if (!f) return;
    if (held && !f.blocking && (f.state === 'idle' || f.state === 'recover')) { f.blocking = true; f.blockStart = this.time; }
    if (!held) f.blocking = false;
  }

  dodge(id: string, dir: [number, number]): boolean {
    const f = this.fighters.get(id);
    if (!f || f.dodgeCd > 0 || !(f.state === 'idle' || f.state === 'recover' || f.state === 'windup')) return false;
    if (f.grappleWith) return false;
    f.state = 'dodge'; f.t = 0; f.attack = null; f.blocking = false; f.dodgeCd = DODGE_COOLDOWN + DODGE_TIME;
    const L = Math.hypot(dir[0], dir[1]) || 1;
    const dx = (dir[0] / L) * DODGE_DIST, dz = (dir[1] / L) * DODGE_DIST;
    this.emit('dodge', { id, dir: [dx, dz] });
    this.emit('push', { id, dx, dz });
    return true;
  }

  /** While grappling: 'shove' (directional, environmental), 'knee' (damage, keeps hold), 'throw' (knockdown). */
  grappleAction(id: string, how: 'shove' | 'knee' | 'throw', dir?: [number, number]) {
    const f = this.fighters.get(id); if (!f || f.state !== 'grappling' || !f.grappleWith) return false;
    const t = this.fighters.get(f.grappleWith); if (!t) return false;
    const fx = -Math.sin(f.yaw), fz = -Math.cos(f.yaw);
    const [dx, dz] = dir ? norm2(dir) : [fx, fz];
    if (how === 'knee') {
      this.applyHit(f, t, 'light', 14 * f.profile.damage, 'torso', [0, 0], false);
      f.t = 0; return true;
    }
    this.release(f, t, how);
    const dist = how === 'throw' ? 1.8 : 2.4;
    const slam = this.surfaceBehind(t, dx, dz, how === 'throw' ? 1.8 : 1.3);
    if (slam) {
      const dmg = 24 * f.profile.damage;
      this.emit('slam', { attacker: f.id, target: t.id, surface: slam, damage: dmg });
      this.applyHit(f, t, 'heavy', dmg, 'torso', [dx * 0.6, dz * 0.6], false);
      this.knockdown(t, f.id);
    } else {
      this.emit('push', { id: t.id, dx: dx * dist, dz: dz * dist });
      if (how === 'throw') { this.applyHit(f, t, 'heavy', 10 * f.profile.damage, 'torso', [0, 0], false); this.knockdown(t, f.id); }
      else this.stagger(t, STAGGER * 1.4);
    }
    return true;
  }
  /** Mash to break a hold: each press has a chance scaled by poise difference. */
  struggle(id: string) {
    const t = this.fighters.get(id); if (!t || t.state !== 'grappled' || !t.grappleWith) return false;
    const f = this.fighters.get(t.grappleWith); if (!f) return false;
    if (this.rng.chance(0.18 + (t.profile.speed - 1) * 0.3)) { this.release(f, t, 'escape'); this.stagger(f, 0.4); return true; }
    return false;
  }

  private release(f: Fighter, t: Fighter, how: 'shove' | 'throw' | 'escape' | 'knee') {
    f.grappleWith = null; t.grappleWith = null;
    f.state = 'recover'; f.t = 0; f.attack = 'grapple';
    t.state = 'idle'; t.t = 0;
    this.emit('release', { attacker: f.id, target: t.id, how });
  }

  private surfaceBehind(t: Fighter, dx: number, dz: number, reach: number): string | null {
    if (!this.world) return null;
    const h = this.world.ray([t.pos[0], t.pos[1] + 1.0, t.pos[2]], [dx, 0, dz], reach + t.radius);
    return h ? h.id : null;
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.fighters.values()) {
      f.t += dt;
      f.dodgeCd = Math.max(0, f.dodgeCd - dt);
      f.counter = Math.max(0, f.counter - dt);
      if (f.state !== 'stagger' && f.state !== 'down') f.poise = Math.min(POISE_MAX, f.poise + POISE_REGEN * dt);
      switch (f.state) {
        case 'windup': if (f.t >= this.phase(f).windup) { f.state = 'active'; f.t = 0; } break;
        case 'active': {
          if (!f.hitDone) { f.hitDone = true; this.resolveAttack(f); }
          if (f.state === 'active' && f.t >= this.phase(f).active) { f.state = 'recover'; f.t = 0; }
          break;
        }
        case 'recover': if (f.t >= this.phase(f).recover) { f.state = 'idle'; f.t = 0; f.attack = null; } break;
        case 'dodge': if (f.t >= DODGE_TIME) { f.state = 'idle'; f.t = 0; } break;
        case 'stagger': if (f.t >= f.stunFor) { f.state = 'idle'; f.t = 0; f.poise = POISE_MAX * 0.5; } break;
        case 'down': if (f.t >= KNOCKDOWN) { f.state = 'idle'; f.t = 0; f.poise = POISE_MAX * 0.6; } break;
        case 'grappling': if (f.t > 3.5) { const t = this.fighters.get(f.grappleWith ?? ''); if (t) this.release(f, t, 'escape'); } break;
      }
    }
  }

  isInvulnerable(f: Fighter) { return f.state === 'dodge' && f.t < f.profile.dodgeIframes; }

  /** Find targets in reach/arc at the active frame and apply. */
  private resolveAttack(f: Fighter) {
    const kind = f.attack!;
    const spec = ATTACKS[kind];
    const reach = (kind === 'kick' ? 1.25 : kind === 'grapple' ? 0.95 : f.weapon.melee?.reach ?? 1.1);
    const multi = kind === 'heavy' && f.weapon.family === 'blunt';
    let any = false;
    const targets = [...this.fighters.values()].filter((t) => t !== f && t.team !== f.team && t.state !== 'down')
      .map((t) => ({ t, d: Math.hypot(t.pos[0] - f.pos[0], t.pos[2] - f.pos[2]) })).sort((a, b) => a.d - b.d);
    for (const { t, d } of targets) {
      if (d > reach + t.radius) continue;
      if (Math.abs(t.pos[1] - f.pos[1]) > 1.2) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(-(t.pos[0] - f.pos[0]), -(t.pos[2] - f.pos[2])) - f.yaw));
      if (ang > (spec.arcDeg * Math.PI) / 360) continue;
      if (this.isInvulnerable(t)) continue;
      any = true;
      if (kind === 'grapple') {
        if (t.blocking && this.rng.chance(0.5)) { this.stagger(f, STAGGER); this.emit('guardBroken', { id: f.id, by: t.id }); break; }
        f.state = 'grappling'; f.t = 0; f.grappleWith = t.id; t.state = 'grappled'; t.t = 0; t.grappleWith = f.id; t.blocking = false;
        this.emit('grab', { attacker: f.id, target: t.id });
        break;
      }
      // parry: defender pressed block within the window before this frame
      if (t.blocking && this.time - t.blockStart <= t.profile.parryWindow) {
        this.emit('parried', { attacker: f.id, defender: t.id });
        this.stagger(f, PARRY_STAGGER);
        t.counter = COUNTER_WINDOW;
        break;
      }
      const fx = t.pos[0] - f.pos[0], fz = t.pos[2] - f.pos[2], L = Math.hypot(fx, fz) || 1;
      const push: [number, number] = [(fx / L) * spec.push, (fz / L) * spec.push];
      const base = (kind === 'heavy' ? f.weapon.melee?.heavy : kind === 'kick' ? 12 : f.weapon.melee?.light) ?? f.weapon.damage;
      let dmg = base * f.profile.damage;
      const counter = f.counter > 0 && kind === 'light';
      if (counter) { dmg *= 2; f.counter = 0; }
      if (t.blocking) {
        if (kind === 'heavy' || kind === 'kick') {
          t.blocking = false;
          this.emit('guardBroken', { id: t.id, by: f.id });
          this.stagger(t, STAGGER);
          this.applyHit(f, t, kind, dmg * 0.35, 'arm_l', push, true);
        } else this.applyHit(f, t, kind, dmg * 0.2, 'arm_r', [push[0] * 0.3, push[1] * 0.3], true);
      } else {
        this.applyHit(f, t, kind, dmg, pickRegion(this.rng, spec.regions), push, false, counter);
        // a shove into a surface (kicks)
        if (kind === 'kick') {
          const s = this.surfaceBehind(t, fx / L, fz / L, 1.3);
          if (s) { const sd = 16 * f.profile.damage; this.emit('slam', { attacker: f.id, target: t.id, surface: s, damage: sd }); this.applyHit(f, t, 'heavy', sd, 'torso', [0, 0], false); }
        }
      }
      if (!multi) break;
    }
    if (!any) this.emit('whiff', { id: f.id, kind });
  }

  private applyHit(f: Fighter, t: Fighter, kind: AttackKind, damage: number, region: Region, push: [number, number], blocked: boolean, counter = false) {
    const spec = ATTACKS[kind];
    const bleed = blocked ? 0 : f.weapon.melee?.bleed ?? 0;
    this.emit('hit', { attacker: f.id, target: t.id, kind, damage, region, blocked, counter, bleed, push });
    if (push[0] || push[1]) this.emit('push', { id: t.id, dx: push[0], dz: push[1] });
    // weapon wear (bottles)
    if (f.breaksLeft !== Infinity && !blocked) {
      f.breaksLeft--;
      if (f.breaksLeft <= 0) this.emit('weaponBroken', { id: f.id, weapon: f.weapon.id });
    }
    if (t.state === 'grappled' || t.state === 'grappling') return;
    // a hit interrupts the target's windup (trading blows rewards the faster attack)
    if (!blocked && t.state === 'windup') { t.state = 'idle'; t.attack = null; }
    const wasStaggered = t.state === 'stagger';
    t.poise -= spec.poise * (blocked ? 0.5 : 1) * (counter ? 1.5 : 1);
    if (!blocked && kind === 'heavy' && wasStaggered) this.knockdown(t, f.id);
    else if (t.poise <= 0) this.stagger(t, STAGGER);
  }

  stagger(t: Fighter, dur: number) {
    if (t.grappleWith) { const o = this.fighters.get(t.grappleWith); if (o) this.release(t.state === 'grappling' ? t : o, t.state === 'grappling' ? o : t, 'escape'); }
    t.state = 'stagger'; t.t = 0; t.stunFor = dur; t.attack = null; t.blocking = false;
    this.emit('stagger', { id: t.id, duration: dur });
  }
  knockdown(t: Fighter, by: string) {
    t.state = 'down'; t.t = 0; t.attack = null; t.blocking = false; t.poise = 0;
    this.emit('knockdown', { id: t.id, by });
  }
  /** Normalised remaining windup 0..1 for telegraph UI. */
  telegraph(id: string) {
    const f = this.fighters.get(id); if (!f || f.state !== 'windup') return 0;
    return clamp(f.t / this.phase(f).windup, 0, 1);
  }
}

function norm2(d: [number, number]): [number, number] { const L = Math.hypot(d[0], d[1]) || 1; return [d[0] / L, d[1] / L]; }
function pickRegion(rng: Rng, w: [Region, number][]): Region {
  let r = rng.next();
  for (const [reg, p] of w) { if ((r -= p) <= 0) return reg; }
  return w[0][0];
}
