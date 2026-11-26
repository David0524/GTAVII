import { Emitter } from '../core/events';
import { clamp } from '../core/vec';

/**
 * Health, injury regions, bleeding, regeneration and armour for the player and every NPC.
 *
 * Design rules (docs/GAMEPLAY_PROGRESS.md "Damage model"):
 *  - Six regions. Legs make you limp, arms add aim sway, the head is lethal for NPCs (bullet ≥ 20)
 *    and doubled for the player (no one-shot player deaths from AI: fairness on a phone).
 *  - Wounds bleed. Small bleeds clot on their own; heavy ones need a bandage, a diner or a hospital.
 *    Bleeding alone never takes the PLAYER below BLEED_FLOOR (it is a warning, not a death sentence);
 *    NPCs can bleed out.
 *  - Slow partial regeneration: after REGEN_DELAY s without damage and with no bleeding,
 *    hp climbs at REGEN_RATE up to regenCeiling × max (per lead). Above that only food/treatment heals.
 *  - Injuries persist until treated (bandage −0.3, diner −0.5, hospital clears) with a very slow
 *    natural recovery, so treatment matters.
 */
export type Region = 'head' | 'torso' | 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';
export const REGIONS: readonly Region[] = ['head', 'torso', 'arm_l', 'arm_r', 'leg_l', 'leg_r'];
export type DamageType = 'bullet' | 'melee' | 'impact' | 'fire' | 'fall';

export interface DamageInput {
  amount: number; region?: Region | string; source?: string; type: DamageType;
  /** extra bleed rate (hp/s) for blades and broken bottles */
  bleed?: number;
  /** penetration power of the round (vest effectiveness halves above 1) */
  power?: number;
}
export interface DamageResult { dealt: number; region: Region | null; absorbed: number; lethal: boolean; killed: boolean; newInjury: Region | null }

export const REGION_MULT: Record<'bullet' | 'melee', Record<Region, number>> = {
  bullet: { head: 3.0, torso: 1, arm_l: 0.55, arm_r: 0.55, leg_l: 0.65, leg_r: 0.65 },
  melee: { head: 1.4, torso: 1, arm_l: 0.7, arm_r: 0.7, leg_l: 0.8, leg_r: 0.8 },
};
export const PLAYER_HEAD_MULT = 2.0;
/** Fraction of max hp a region can soak before it is "crippled" (wear 1). */
const REGION_CAP: Record<Region, number> = { head: 0.5, torso: 0.9, arm_l: 0.35, arm_r: 0.35, leg_l: 0.4, leg_r: 0.4 };
const WOUND_BLEED: Record<Region, number> = { head: 1.0, torso: 0.8, arm_l: 0.45, arm_r: 0.45, leg_l: 0.55, leg_r: 0.55 };
export const REGEN_DELAY = 5, REGEN_RATE = 1.5, BLEED_FLOOR = 0.1, BLEED_CAP = 3, CLOT_MINOR = 45, MINOR_BLEED = 0.6, INJURED = 0.5;
export const NATURAL_RECOVERY = 0.002; // wear per second
const FIRE_DPS = 8;

export interface HealthOpts { maxHp: number; regenCeiling?: number; isPlayer?: boolean; armor?: number }

interface Bleed { rate: number; age: number; minor: boolean }
export interface HealthState {
  id: string; maxHp: number; hp: number; armor: number; isPlayer: boolean; regenCeiling: number;
  wear: Record<Region, number>; bleeds: Bleed[]; sinceDamage: number; dead: boolean; burning: number; lastSource: string | null;
}

export interface HealthEvents extends Record<string, unknown> {
  damaged: { id: string; result: DamageResult; input: DamageInput; hp: number };
  injured: { id: string; region: Region; wear: number };
  died: { id: string; source: string | null; type: DamageType };
  bleeding: { id: string; rate: number };
  healed: { id: string; amount: number; hp: number };
}

export class HealthSystem extends Emitter<HealthEvents> {
  readonly states = new Map<string, HealthState>();
  time = 0;

  register(id: string, o: HealthOpts): HealthState {
    const s: HealthState = {
      id, maxHp: o.maxHp, hp: o.maxHp, armor: o.armor ?? 0, isPlayer: !!o.isPlayer, regenCeiling: o.regenCeiling ?? 0.6,
      wear: { head: 0, torso: 0, arm_l: 0, arm_r: 0, leg_l: 0, leg_r: 0 }, bleeds: [], sinceDamage: 1e9, dead: false, burning: 0, lastSource: null,
    };
    this.states.set(id, s);
    return s;
  }
  remove(id: string) { this.states.delete(id); }
  state(id: string) { return this.states.get(id); }

  /** Contract view: hp plus a list of injury tags ('leg_l', 'arm_r', 'bleeding', 'burning', 'critical', 'dead'). */
  get(id: string): { hp: number; injuries: string[] } {
    const s = this.states.get(id);
    if (!s) return { hp: 0, injuries: ['unknown'] };
    const inj: string[] = [];
    for (const r of REGIONS) if (s.wear[r] >= INJURED) inj.push(r);
    if (this.bleedRate(s) > 0) inj.push('bleeding');
    if (s.burning > 0) inj.push('burning');
    if (!s.dead && s.hp < s.maxHp * 0.2) inj.push('critical');
    if (s.dead) inj.push('dead');
    return { hp: s.hp, injuries: inj };
  }

  damage(id: string, d: DamageInput): DamageResult {
    const s = this.states.get(id);
    const none: DamageResult = { dealt: 0, region: null, absorbed: 0, lethal: false, killed: false, newInjury: null };
    if (!s || s.dead || !(d.amount > 0)) return none;
    const region = (REGIONS as readonly string[]).includes(d.region ?? '') ? (d.region as Region) : null;
    let amt = d.amount;
    let lethal = false;
    if (region && (d.type === 'bullet' || d.type === 'melee')) {
      let m = REGION_MULT[d.type][region];
      if (region === 'head' && s.isPlayer && d.type === 'bullet') m = PLAYER_HEAD_MULT;
      amt *= m;
      if (region === 'head' && d.type === 'bullet' && !s.isPlayer && d.amount >= 20) lethal = true;
    }
    // armour: the vest covers the torso against bullets (75%) and blows (30%)
    let absorbed = 0;
    if (s.armor > 0 && region === 'torso' && (d.type === 'bullet' || d.type === 'melee')) {
      const eff = (d.type === 'bullet' ? 0.75 : 0.3) * ((d.power ?? 0.6) > 1 ? 0.5 : 1);
      absorbed = Math.min(s.armor, amt * eff);
      s.armor -= absorbed;
      amt -= absorbed;
    }
    if (d.type === 'fire') s.burning = Math.max(s.burning, 4);
    const before = s.hp;
    s.hp = lethal ? 0 : Math.max(0, s.hp - amt);
    const dealt = before - s.hp;
    s.sinceDamage = 0; s.lastSource = d.source ?? null;

    // injury wear and bleeding
    let newInjury: Region | null = null;
    const wearRegion: Region | null = region ?? (d.type === 'fall' ? ((this.time * 7) % 2 < 1 ? 'leg_l' : 'leg_r') : d.type === 'impact' ? 'torso' : null);
    if (wearRegion && amt > 0) {
      const was = s.wear[wearRegion];
      s.wear[wearRegion] = clamp(was + amt / (s.maxHp * REGION_CAP[wearRegion]), 0, 1.5);
      if (was < INJURED && s.wear[wearRegion] >= INJURED) newInjury = wearRegion;
    }
    if (amt > 0 && region && (d.type === 'bullet' || (d.bleed ?? 0) > 0)) {
      const rate = (d.type === 'bullet' ? WOUND_BLEED[region] : 0) + (d.bleed ?? 0);
      if (rate > 0) { s.bleeds.push({ rate, age: 0, minor: rate <= MINOR_BLEED }); this.emit('bleeding', { id, rate: this.bleedRate(s) }); }
    }
    const killed = s.hp <= 0;
    const result: DamageResult = { dealt, region, absorbed, lethal, killed, newInjury };
    this.emit('damaged', { id, result, input: d, hp: s.hp });
    if (newInjury) this.emit('injured', { id, region: newInjury, wear: s.wear[newInjury] });
    if (killed) this.kill(s, d.type);
    return result;
  }

  private kill(s: HealthState, type: DamageType) {
    if (s.dead) return;
    s.dead = true; s.hp = 0; s.bleeds = []; s.burning = 0;
    this.emit('died', { id: s.id, source: s.lastSource, type });
  }

  bleedRate(s: HealthState) { let r = 0; for (const b of s.bleeds) r += b.rate; return Math.min(BLEED_CAP, r); }

  /** Per-frame bookkeeping for everything registered. */
  update(dt: number) {
    this.time += dt;
    for (const s of this.states.values()) {
      if (s.dead) continue;
      s.sinceDamage += dt;
      // bleeding
      if (s.bleeds.length) {
        for (const b of s.bleeds) b.age += dt;
        s.bleeds = s.bleeds.filter((b) => !(b.minor && b.age > CLOT_MINOR));
        const loss = this.bleedRate(s) * dt;
        const floor = s.isPlayer ? s.maxHp * BLEED_FLOOR : 0;
        if (s.hp > floor) s.hp = Math.max(floor, s.hp - loss);
        if (s.hp <= 0) { this.kill(s, 'bullet'); continue; }
      }
      // burning
      if (s.burning > 0) {
        s.burning -= dt;
        s.hp = Math.max(0, s.hp - FIRE_DPS * dt); s.sinceDamage = 0;
        if (s.hp <= 0) { this.kill(s, 'fire'); continue; }
      }
      // regeneration (partial)
      const ceil = s.maxHp * s.regenCeiling;
      if (s.sinceDamage > REGEN_DELAY && s.bleeds.length === 0 && s.hp < ceil) s.hp = Math.min(ceil, s.hp + REGEN_RATE * dt);
      // natural recovery of injuries
      for (const r of REGIONS) if (s.wear[r] > 0) s.wear[r] = Math.max(0, s.wear[r] - NATURAL_RECOVERY * dt);
    }
  }

  heal(id: string, amount: number) {
    const s = this.states.get(id); if (!s || s.dead) return 0;
    const before = s.hp; s.hp = Math.min(s.maxHp, s.hp + amount);
    if (s.hp > before) this.emit('healed', { id, amount: s.hp - before, hp: s.hp });
    return s.hp - before;
  }
  /** Bandage / diner / hospital. `wearRelief` reduces every region's wear. */
  treat(id: string, o: { stopBleeding?: boolean; wearRelief?: number; heal?: number; extinguish?: boolean }) {
    const s = this.states.get(id); if (!s || s.dead) return;
    if (o.stopBleeding) s.bleeds = [];
    if (o.wearRelief) for (const r of REGIONS) s.wear[r] = Math.max(0, s.wear[r] - o.wearRelief);
    if (o.extinguish) s.burning = 0;
    if (o.heal) this.heal(id, o.heal);
  }
  /** Full restore (hospital discharge, checkpoint reload). */
  restore(id: string, hpFraction = 1) {
    const s = this.states.get(id); if (!s) return;
    s.dead = false; s.hp = s.maxHp * hpFraction; s.bleeds = []; s.burning = 0; s.sinceDamage = 1e9;
    for (const r of REGIONS) s.wear[r] = 0;
  }
  setArmor(id: string, pts: number) { const s = this.states.get(id); if (s) s.armor = pts; }

  /** Movement / aim consequences of injuries, read by controllers and the aim system. */
  effects(id: string) {
    const s = this.states.get(id);
    if (!s) return { speedMul: 1, canSprint: true, swayDeg: 0, aimMul: 1, limp: 0 };
    const leg = Math.max(s.wear.leg_l, s.wear.leg_r), arm = Math.max(s.wear.arm_l, s.wear.arm_r);
    const limp = clamp((leg - 0.2) / 0.8, 0, 1);
    const low = s.hp < s.maxHp * 0.25 ? 0.6 : 0;
    return {
      limp,
      speedMul: 1 - 0.45 * limp,
      canSprint: leg < 1,
      swayDeg: 2.6 * clamp(arm, 0, 1.2) + low,
      aimMul: 1 + 0.7 * clamp(arm, 0, 1.2),
    };
  }

  serialize(id: string) {
    const s = this.states.get(id); if (!s) return null;
    return { hp: +s.hp.toFixed(2), armor: +s.armor.toFixed(2), wear: { ...s.wear }, bleeds: s.bleeds.map((b) => ({ ...b })) };
  }
  deserialize(id: string, d: ReturnType<HealthSystem['serialize']>) {
    const s = this.states.get(id); if (!s || !d) return;
    s.hp = d.hp; s.armor = d.armor; s.wear = { ...s.wear, ...d.wear }; s.bleeds = d.bleeds.map((b) => ({ ...b })); s.dead = s.hp <= 0;
  }
}

/** Fall damage from drop height (m). Fatal around 14 m; 3 m is a stumble. */
export function fallDamage(dropM: number): number {
  const v = Math.sqrt(2 * 9.81 * Math.max(0, dropM));
  return Math.max(0, v - 7.5) * 11;
}
/** Pedestrian struck by a vehicle at relative speed v (m/s). 30 mph (13.4 m/s) is lethal. */
export function pedestrianImpactDamage(v: number): number { return Math.pow(Math.max(0, v - 2.5), 1.5) * 4; }
/** Occupant of a vehicle that changes velocity by dv (m/s) in a crash (1974: no airbags, lap belts at best). */
export function occupantImpactDamage(dv: number): number { return Math.max(0, dv - 6) * 5; }
