import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import { clamp, wrapAngle, type V3 } from '../core/vec';
import type { WorldQuery } from '../core/world';
import type { WeaponDef } from '../data/schema';
import type { HealthSystem } from '../health/Health';
import type { CoverPoint, CoverSystem } from './cover';
import type { MeleeSystem } from './melee';
import { Gun } from './weapons';

/**
 * Enemy (and companion) combat AI: utility decisions at 4 Hz (staggered), movement every frame.
 *
 * Factions: gang (young, aggressive, low discipline), hood (older muscle, steady), corrupt_cop
 * (trained, uses cover well, will not surrender easily), police (honest response; arrests if possible),
 * muscle (the player's hired companions).
 *
 * Fairness for a phone and a pad: only ATTACK TOKENS' holders shoot at the player at once (2, +1 per 4
 * extra enemies, max 4); the rest suppress the player's cover, reposition or flank. Aim error starts
 * wide and tightens while an agent keeps eyes on you ("tracking"), so the first shots from a new
 * angle are a warning, not a death sentence. Everything telegraphs: barks before a flank, a reload
 * call, a shout before charging.
 *
 * Morale: falls when allies drop, when hit, when shots crack past, when outnumbered; recovers out of
 * fire. Low morale → retreat to rear cover; lower → surrender (hands up) or flee. No one fights to the
 * death by default.
 */
export type Faction = 'gang' | 'hood' | 'corrupt_cop' | 'police' | 'muscle';
export type AiState = 'idle' | 'alert' | 'moveToCover' | 'inCover' | 'peek' | 'suppress' | 'flank' | 'advance' | 'charge' | 'melee' | 'retreat' | 'surrender' | 'flee' | 'down' | 'dead' | 'follow';
export type Bark = 'spotted' | 'reloading' | 'flanking' | 'cover_me' | 'man_down' | 'behind_cover' | 'surrender' | 'run' | 'lost_him' | 'charge' | 'hit' | 'cease' | 'police';

interface FactionSpec { accuracy: number; bravery: [number, number]; discipline: number; surrenders: number; flanks: number; speed: number; peekTime: [number, number] }
export const FACTIONS: Record<Faction, FactionSpec> = {
  gang: { accuracy: 1.35, bravery: [0.45, 0.85], discipline: 0.4, surrenders: 0.7, flanks: 0.6, speed: 1.05, peekTime: [0.9, 1.8] },
  hood: { accuracy: 1.0, bravery: [0.55, 0.9], discipline: 0.7, surrenders: 0.5, flanks: 0.5, speed: 0.95, peekTime: [1.2, 2.2] },
  corrupt_cop: { accuracy: 0.85, bravery: [0.65, 0.95], discipline: 0.85, surrenders: 0.2, flanks: 0.8, speed: 1.0, peekTime: [1.0, 2.0] },
  police: { accuracy: 0.9, bravery: [0.7, 0.95], discipline: 0.9, surrenders: 0.05, flanks: 0.7, speed: 1.0, peekTime: [1.0, 2.0] },
  muscle: { accuracy: 1.0, bravery: [0.7, 0.95], discipline: 0.8, surrenders: 0.1, flanks: 0.3, speed: 1.05, peekTime: [1.0, 2.0] },
};
export const TOKENS_BASE = 2, TOKENS_MAX = 4;

export interface Agent {
  id: string; faction: Faction; squad: string; pos: V3; yaw: number; vel: [number, number];
  gun: Gun | null; melee: WeaponDef; ammo: number; state: AiState; t: number; think: number;
  morale: number; bravery: number; target: string | null; lastKnown: [number, number] | null; seeT: number; unseenT: number;
  track: number; cover: CoverPoint | null; goal: [number, number] | null; token: boolean; suppressed: number; flinch: number;
  barkCd: Record<string, number>; stance: 'stand' | 'crouch' | 'down'; leader: boolean; aimDir: V3; firing: boolean; burst: number;
  alive: boolean; downedAt: number;
}
export interface CombatTarget { id: string; pos: V3; vel: [number, number]; team: 'player' | 'enemy'; alive: boolean; inCover: boolean; stance: 'stand' | 'crouch' | 'down' }

export interface AiEvents extends Record<string, unknown> {
  bark: { id: string; bark: Bark; at: V3 };
  fire: { id: string; origin: V3; dir: V3; gun: Gun };
  meleeStart: { id: string };
  surrendered: { id: string };
  fled: { id: string };
  stateChange: { id: string; from: AiState; to: AiState };
}

export interface AiCtx {
  world: WorldQuery;
  cover: CoverSystem;
  health: HealthSystem;
  melee: MeleeSystem;
  targets: readonly CombatTarget[];
  /** can the agent walk straight from a to b (no box in the way at knee height)? */
  walkable?: (ax: number, az: number, bx: number, bz: number) => boolean;
}

const THINK_HZ = 4, EYE = 1.6, CROUCH_EYE = 1.05;

export class CombatAI extends Emitter<AiEvents> {
  readonly agents = new Map<string, Agent>();
  private squadSize = new Map<string, number>();
  stats = { thinkMs: 0, moveMs: 0, agents: 0, losRays: 0 };
  /** fairness knob: how many agents may shoot at the player at once (per difficulty) */
  tokensBase = TOKENS_BASE;

  constructor(private rng: Rng) { super(); }

  spawn(o: { id: string; faction: Faction; squad: string; pos: V3; yaw?: number; gun?: WeaponDef | null; melee: WeaponDef; ammo?: number; leader?: boolean }): Agent {
    const f = FACTIONS[o.faction];
    const bravery = this.rng.range(f.bravery[0], f.bravery[1]);
    const a: Agent = {
      id: o.id, faction: o.faction, squad: o.squad, pos: [...o.pos] as V3, yaw: o.yaw ?? 0, vel: [0, 0],
      gun: o.gun ? new Gun(o.gun) : null, melee: o.melee, ammo: o.ammo ?? 30, state: 'idle', t: 0, think: this.rng.range(0, 1 / THINK_HZ),
      morale: bravery, bravery, target: null, lastKnown: null, seeT: 0, unseenT: 0, track: 0, cover: null, goal: null, token: false, suppressed: 0, flinch: 0,
      barkCd: {}, stance: 'stand', leader: !!o.leader, aimDir: [0, 0, -1], firing: false, burst: 0, alive: true, downedAt: -1,
    };
    this.agents.set(a.id, a);
    this.squadSize.set(o.squad, (this.squadSize.get(o.squad) ?? 0) + 1);
    return a;
  }
  remove(id: string) { this.agents.delete(id); }

  /** External stimuli. */
  alert(id: string, at: [number, number], target: string) {
    const a = this.agents.get(id); if (!a || !a.alive || a.state === 'surrender' || a.state === 'flee') return;
    a.target = target; a.lastKnown = at;
    if (a.state === 'idle') { this.setState(a, 'alert'); this.bark(a, a.faction === 'police' ? 'police' : 'spotted'); }
  }
  /** A round cracked past (near miss) or hit cover next to them. */
  suppress(id: string, amount = 1) {
    const a = this.agents.get(id); if (!a || !a.alive) return;
    a.suppressed = Math.min(3, a.suppressed + amount);
    a.morale -= 0.025 * amount * (1 - FACTIONS[a.faction].discipline * 0.5);
  }
  onDamaged(id: string, dealt: number, maxHp: number, from: [number, number] | null, attacker: string | null) {
    const a = this.agents.get(id); if (!a || !a.alive) return;
    a.morale -= (dealt / maxHp) * 0.9;
    a.flinch = 0.35; a.track *= 0.4;
    if (from) a.lastKnown = from;
    if (attacker && !a.target) a.target = attacker;
    if (a.state === 'idle') this.setState(a, 'alert');
    this.bark(a, 'hit', 2);
  }
  onDied(id: string) {
    const a = this.agents.get(id); if (!a) return;
    a.alive = false; this.setState(a, 'dead'); this.cover?.release(a.id);
    for (const b of this.agents.values()) {
      if (!b.alive || b.squad !== a.squad) continue;
      const d = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]);
      b.morale -= (d < 25 ? 0.22 : 0.1) + (a.leader ? 0.2 : 0);
      if (d < 25) this.bark(b, 'man_down', 3);
    }
  }
  private cover?: CoverSystem;

  private setState(a: Agent, s: AiState) { if (a.state === s) return; const from = a.state; a.state = s; a.t = 0; this.emit('stateChange', { id: a.id, from, to: s }); }
  private bark(a: Agent, b: Bark, cd = 5) {
    const now = a.barkCd[b] ?? 0; if (now > 0) return;
    a.barkCd[b] = cd; this.emit('bark', { id: a.id, bark: b, at: a.pos });
  }

  /** Line of sight eye→point against the world (cover boxes included). */
  los(ctx: AiCtx, from: V3, eyeY: number, to: V3) {
    this.stats.losRays++;
    const o: V3 = [from[0], from[1] + eyeY, from[2]];
    const dx = to[0] - o[0], dy = to[1] - o[1], dz = to[2] - o[2], L = Math.hypot(dx, dy, dz) || 1;
    const h = ctx.world.ray(o, [dx / L, dy / L, dz / L], L - 0.35);
    return !h || h.material === 'glass';
  }

  update(dt: number, ctx: AiCtx) {
    this.cover = ctx.cover;
    const t0 = now();
    // token allocation (per hostile target): the closest/best-placed holders keep tokens; rotate slowly
    this.allocateTokens(ctx);
    let thinkMs = 0;
    let n = 0;
    for (const a of this.agents.values()) {
      if (!a.alive) continue;
      n++;
      a.t += dt; a.flinch = Math.max(0, a.flinch - dt); a.suppressed = Math.max(0, a.suppressed - dt * 0.8);
      for (const k in a.barkCd) a.barkCd[k] -= dt;
      if (a.gun) a.gun.update(dt, (k) => { const got = Math.min(k, a.ammo); a.ammo -= got; return got; });
      // morale recovers out of fire
      if (a.suppressed < 0.1 && a.state !== 'surrender' && a.state !== 'flee') a.morale = Math.min(a.bravery, a.morale + 0.015 * dt);
      a.think -= dt;
      if (a.think <= 0) { a.think += 1 / THINK_HZ; const s = now(); this.decide(a, ctx); thinkMs += now() - s; }
      this.act(a, dt, ctx);
    }
    this.stats.agents = n; this.stats.thinkMs = thinkMs; this.stats.moveMs = now() - t0 - thinkMs;
  }

  private hostileTargets(a: Agent, ctx: AiCtx) { return ctx.targets.filter((t) => t.alive && (a.faction === 'muscle' ? t.team === 'enemy' : t.team === 'player')); }

  private allocateTokens(ctx: AiCtx) {
    const hostiles = [...this.agents.values()].filter((a) => a.alive && a.faction !== 'muscle' && a.target && a.gun && !['surrender', 'flee', 'down', 'retreat'].includes(a.state));
    const cap = Math.min(TOKENS_MAX, this.tokensBase + Math.floor(Math.max(0, hostiles.length - this.tokensBase) / 4));
    // keep current holders unless they lost sight for a while; then best by visibility and distance
    const score = (a: Agent) => (a.token ? 2 : 0) + (a.unseenT < 0.5 ? 1.5 : 0) - Math.hypot(a.pos[0] - (a.lastKnown?.[0] ?? 0), a.pos[2] - (a.lastKnown?.[1] ?? 0)) * 0.03 + (a.t > 4 && a.token ? -2.5 : 0);
    hostiles.sort((x, y) => score(y) - score(x));
    hostiles.forEach((a, i) => { const had = a.token; a.token = i < cap; if (had && !a.token) a.t = 0; });
    for (const a of this.agents.values()) if (a.faction === 'muscle') a.token = true;
    void ctx;
  }

  private decide(a: Agent, ctx: AiCtx) {
    const st = a.state;
    if (st === 'dead' || st === 'surrender' || st === 'flee') return;
    const hp = ctx.health.state(a.id);
    const hpFrac = hp ? hp.hp / hp.maxHp : 1;
    const legs = hp ? Math.max(hp.wear.leg_l, hp.wear.leg_r) : 0;
    // pick / refresh target
    const hs = this.hostileTargets(a, ctx);
    let tgt = hs.find((t) => t.id === a.target) ?? null;
    if (!tgt && hs.length) { tgt = nearestT(a, hs); a.target = tgt.id; }
    if (!tgt) { if (a.faction === 'muscle') this.setState(a, 'follow'); return; }
    const eye = a.stance === 'crouch' ? CROUCH_EYE : EYE;
    const chest: V3 = [tgt.pos[0], tgt.pos[1] + (tgt.stance === 'crouch' ? 0.75 : tgt.stance === 'down' ? 0.25 : 1.2), tgt.pos[2]];
    const sees = this.los(ctx, a.pos, st === 'inCover' && a.cover?.height === 'low' ? EYE : eye, chest);
    const dist = Math.hypot(tgt.pos[0] - a.pos[0], tgt.pos[2] - a.pos[2]);
    if (sees) { a.lastKnown = [tgt.pos[0], tgt.pos[2]]; a.seeT += 0.25; a.unseenT = 0; if (st === 'idle') { this.setState(a, 'alert'); this.bark(a, a.faction === 'police' ? 'police' : 'spotted'); } }
    else { a.unseenT += 0.25; a.seeT = 0; }
    if (st === 'idle') return;

    // --- morale gates (surrender / flee / retreat)
    const size = this.squadSize.get(a.squad) ?? 1;
    const alive = [...this.agents.values()].filter((b) => b.squad === a.squad && b.alive && b.state !== 'surrender' && b.state !== 'flee').length;
    const outnumbered = alive / size;
    const m = a.morale * (0.6 + 0.4 * outnumbered) * (0.5 + 0.5 * hpFrac);
    const F = FACTIONS[a.faction];
    if (a.faction !== 'muscle' && (m < 0.12 || (hpFrac < 0.18 && legs >= 1))) {
      if (dist < 18 && this.rng.chance(F.surrenders)) { this.setState(a, 'surrender'); a.firing = false; this.bark(a, 'surrender', 99); ctx.cover.release(a.id); this.emit('surrendered', { id: a.id }); return; }
      this.setState(a, 'flee'); a.firing = false; this.bark(a, 'run', 99); ctx.cover.release(a.id); this.emit('fled', { id: a.id }); return;
    }
    if (m < 0.3 && st !== 'retreat' && a.faction !== 'muscle') {
      const c = ctx.cover.best(a.pos[0], a.pos[2], tgt.pos[0], tgt.pos[2], { who: a.id, prefer: 'away', maxDist: 22, minThreatDist: dist + 4 });
      if (c) { ctx.cover.claim(c, a.id); a.cover = c; a.goal = [c.x, c.z]; this.setState(a, 'retreat'); this.bark(a, 'cease', 8); return; }
    }

    // --- melee: no gun, out of ammo, or they're right on top of you
    const gunUsable = !!a.gun && (a.gun.loaded > 0 || a.ammo > 0);
    if (!gunUsable || (dist < 2.6 && a.faction !== 'police')) {
      if (st !== 'charge' && st !== 'melee') { this.setState(a, 'charge'); this.bark(a, 'charge', 6); ctx.cover.release(a.id); a.cover = null; }
      return;
    }
    // reload in cover
    if (a.gun && a.gun.empty && a.ammo > 0 && !a.gun.reloading) { a.gun.startReload(a.ammo); this.bark(a, 'reloading', 4); a.firing = false; if (st === 'peek') this.setState(a, 'inCover'); }

    switch (st) {
      case 'alert': case 'advance': case 'follow': {
        const c = ctx.cover.best(a.pos[0], a.pos[2], tgt.pos[0], tgt.pos[2], { who: a.id, prefer: dist > 22 ? 'toward' : 'near', maxDist: 16 });
        if (c) { ctx.cover.claim(c, a.id); a.cover = c; a.goal = [c.x, c.z]; this.setState(a, 'moveToCover'); }
        else if (st !== 'advance') { a.goal = a.lastKnown; this.setState(a, 'advance'); }
        break;
      }
      case 'moveToCover': if (a.t > 6) this.setState(a, 'alert'); break;
      case 'inCover': {
        if (a.cover && ctx.cover.protection(a.cover, tgt.pos[0], tgt.pos[2]) <= 0) { this.setState(a, 'alert'); break; } // flanked: move
        if (a.gun?.reloading) break;
        const [p0, p1] = F.peekTime;
        if (a.t > this.rng.range(p0, p1) * (1 + a.suppressed * 0.5)) {
          if (a.token && (sees || a.unseenT < 3)) { this.setState(a, 'peek'); a.burst = a.gun?.def.auto ? this.rng.int(3, 6) : this.rng.int(1, 3); }
          else if (!a.token && a.unseenT < 6 && this.rng.chance(0.45)) { this.setState(a, 'suppress'); a.burst = a.gun?.def.auto ? 5 : 2; this.bark(a, 'cover_me', 7); }
          else if (tgt.inCover && a.unseenT > 2.5 && this.squadFlankFree(a) && this.rng.chance(F.flanks)) {
            const from: [number, number] = [a.pos[0], a.pos[2]];
            const c = ctx.cover.best(a.pos[0], a.pos[2], tgt.pos[0], tgt.pos[2], { who: a.id, flankFrom: from, maxDist: 24 });
            if (c) { ctx.cover.claim(c, a.id); a.cover = c; a.goal = [c.x, c.z]; this.setState(a, 'flank'); this.bark(a, 'flanking', 6); }
          } else a.t = 0;
        }
        break;
      }
      case 'peek': if (a.burst <= 0 || a.t > 2.5 || a.suppressed > 1.6) { a.firing = false; this.setState(a, a.cover ? 'inCover' : 'alert'); } break;
      case 'suppress': if (a.burst <= 0 || a.t > 2.5) { a.firing = false; this.setState(a, a.cover ? 'inCover' : 'alert'); } break;
      case 'flank': if (a.t > 9) this.setState(a, 'alert'); break;
      case 'retreat': if (a.t > 8) this.setState(a, 'inCover'); break;
      case 'charge': case 'melee': if (gunUsable && dist > 6) this.setState(a, 'alert'); break;
    }
  }
  private squadFlankFree(a: Agent) { for (const b of this.agents.values()) if (b !== a && b.squad === a.squad && b.state === 'flank') return false; return true; }

  private act(a: Agent, dt: number, ctx: AiCtx) {
    const tgt = ctx.targets.find((t) => t.id === a.target) ?? null;
    let speed = 0;
    const F = FACTIONS[a.faction];
    const legs = (() => { const s = ctx.health.state(a.id); return s ? Math.max(s.wear.leg_l, s.wear.leg_r) : 0; })();
    const legMul = 1 - 0.45 * clamp((legs - 0.2) / 0.8, 0, 1);
    a.firing = false;
    switch (a.state) {
      case 'moveToCover': case 'flank': case 'retreat': case 'advance': {
        speed = (a.state === 'advance' ? 3.2 : 4.6) * F.speed;
        a.stance = 'stand';
        if (a.goal && this.moveTo(a, a.goal, speed * legMul, dt, ctx)) { if (a.state !== 'advance') { a.stance = a.cover?.height === 'low' ? 'crouch' : 'stand'; this.setState(a, 'inCover'); } else this.setState(a, 'alert'); }
        break;
      }
      case 'inCover': a.stance = a.cover?.height === 'low' ? 'crouch' : 'stand'; if (tgt) this.face(a, tgt.pos, dt); break;
      case 'peek': case 'suppress': {
        a.stance = 'stand';
        if (!tgt || !a.gun) break;
        // edge-of-high-cover peek: step out sideways a little
        const aimAt: V3 = a.state === 'suppress' && a.lastKnown ? [a.lastKnown[0], tgt.pos[1] + 0.9, a.lastKnown[1]] : [tgt.pos[0], tgt.pos[1] + (tgt.stance === 'crouch' ? 0.75 : 1.15), tgt.pos[2]];
        this.face(a, aimAt, dt);
        if (a.flinch > 0 || a.gun.reloading) break;
        const eyeOk = a.state === 'suppress' || this.los(ctx, a.pos, EYE, aimAt);
        if (!eyeOk) break;
        if (a.gun.canFire) {
          a.track = Math.min(3, a.track + dt * 4);
          const dir = this.aimWithError(a, aimAt, tgt, a.state === 'suppress');
          const origin: V3 = [a.pos[0], a.pos[1] + 1.45, a.pos[2]];
          a.aimDir = dir; a.firing = true; a.burst--;
          this.emit('fire', { id: a.id, origin, dir, gun: a.gun });
        } else a.track = Math.min(3, a.track + dt);
        break;
      }
      case 'charge': {
        if (!tgt) break;
        a.stance = 'stand';
        const d = Math.hypot(tgt.pos[0] - a.pos[0], tgt.pos[2] - a.pos[2]);
        if (d > 1.3) this.moveTo(a, [tgt.pos[0], tgt.pos[2]], 5.2 * F.speed * legMul, dt, ctx);
        else { this.face(a, tgt.pos, dt); const f = ctx.melee.fighters.get(a.id); if (f) { f.pos = a.pos; f.yaw = a.yaw; if (ctx.melee.canAct(f)) { const roll = this.rng.next(); ctx.melee.attack(a.id, roll < 0.55 ? 'light' : roll < 0.8 ? 'heavy' : roll < 0.92 ? 'kick' : 'grapple'); this.emit('meleeStart', { id: a.id }); } } }
        break;
      }
      case 'flee': {
        if (tgt) { const dx = a.pos[0] - tgt.pos[0], dz = a.pos[2] - tgt.pos[2], L = Math.hypot(dx, dz) || 1; this.moveTo(a, [a.pos[0] + (dx / L) * 10, a.pos[2] + (dz / L) * 10], 5.5 * legMul, dt, ctx); }
        break;
      }
      case 'surrender': a.stance = 'stand'; break;
      case 'follow': {
        const leader = ctx.targets.find((t) => t.team === 'player');
        if (leader && Math.hypot(leader.pos[0] - a.pos[0], leader.pos[2] - a.pos[2]) > 3.5) this.moveTo(a, [leader.pos[0] + 1.5, leader.pos[2] + 1.5], 4.5, dt, ctx);
        break;
      }
      case 'alert': if (tgt) this.face(a, tgt.pos, dt); break;
    }
    const mf = ctx.melee.fighters.get(a.id); if (mf) { mf.pos = a.pos; mf.yaw = a.yaw; }
  }

  /** Aim error: wide on first sight, tightens with tracking; worse at range, vs. movers, when suppressed. */
  private aimWithError(a: Agent, at: V3, tgt: CombatTarget, suppress: boolean): V3 {
    const F = FACTIONS[a.faction];
    const d = Math.hypot(at[0] - a.pos[0], at[2] - a.pos[2]);
    const mv = Math.hypot(tgt.vel[0], tgt.vel[1]);
    const r = suppress ? 1.4 : 0.45 * F.accuracy * (1 + d / 18) * (1 + mv / 3) * Math.max(0.35, 1 - a.track / 2.6) * (1 + a.suppressed * 0.35);
    const ex = this.rng.gauss() * r, ey = this.rng.gauss() * r * 0.6, ez = this.rng.gauss() * r;
    const o: V3 = [a.pos[0], a.pos[1] + 1.45, a.pos[2]];
    const dx = at[0] + ex - o[0], dy = at[1] + ey - o[1], dz = at[2] + ez - o[2], L = Math.hypot(dx, dy, dz) || 1;
    return [dx / L, dy / L, dz / L];
  }

  private face(a: Agent, p: V3, dt: number) {
    const want = Math.atan2(-(p[0] - a.pos[0]), -(p[2] - a.pos[2]));
    a.yaw += wrapAngle(want - a.yaw) * Math.min(1, dt * 10);
  }

  /** Steering with simple probe-based avoidance; returns true on arrival. */
  private moveTo(a: Agent, goal: [number, number], speed: number, dt: number, ctx: AiCtx): boolean {
    const dx = goal[0] - a.pos[0], dz = goal[1] - a.pos[2], d = Math.hypot(dx, dz);
    if (d < 0.4) { a.vel = [0, 0]; return true; }
    let dirx = dx / d, dirz = dz / d;
    if (ctx.walkable) {
      const probe = Math.min(d, 1.4);
      if (!ctx.walkable(a.pos[0], a.pos[2], a.pos[0] + dirx * probe, a.pos[2] + dirz * probe)) {
        for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
          const c = Math.cos(off), s = Math.sin(off), nx = dirx * c - dirz * s, nz = dirx * s + dirz * c;
          if (ctx.walkable(a.pos[0], a.pos[2], a.pos[0] + nx * probe, a.pos[2] + nz * probe)) { dirx = nx; dirz = nz; break; }
        }
      }
    }
    // separation from squadmates
    for (const b of this.agents.values()) {
      if (b === a || !b.alive) continue;
      const sx = a.pos[0] - b.pos[0], sz = a.pos[2] - b.pos[2], sd = Math.hypot(sx, sz);
      if (sd < 0.9 && sd > 1e-3) { dirx += (sx / sd) * 0.5; dirz += (sz / sd) * 0.5; }
    }
    const L = Math.hypot(dirx, dirz) || 1;
    const step = Math.min(d, speed * dt);
    a.vel = [(dirx / L) * speed, (dirz / L) * speed];
    a.pos[0] += (dirx / L) * step; a.pos[2] += (dirz / L) * step;
    a.pos[1] = ctx.world.ground(a.pos[0], a.pos[2]);
    const want = Math.atan2(-dirx, -dirz);
    a.yaw += wrapAngle(want - a.yaw) * Math.min(1, dt * 8);
    return false;
  }
}
function nearestT(a: Agent, ts: CombatTarget[]) { return ts.reduce((p, c) => (Math.hypot(c.pos[0] - a.pos[0], c.pos[2] - a.pos[2]) < Math.hypot(p.pos[0] - a.pos[0], p.pos[2] - a.pos[2]) ? c : p)); }
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
