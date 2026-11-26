import type { CrimeKind } from '../police/crime';
import type { Skill } from '../player/skills';
import type { Rng } from '../core/rng';
import { usd, TEDDY, DELPHINE } from './types';

/**
 * Activity definitions: a data model plus a default table. THE TABLE IS A PLACEHOLDER: narrative
 * supplies names, givers, regulars and final prices later; gameplay owns the shape and the balance.
 *
 * `minutes` is GAME minutes for one full attempt cycle, including finding the work, the trip and (for
 * crime) laying low afterwards. Because the clock runs 30x real time (see GAME_HOURS_PER_REAL_HOUR)
 * and 1974 prices are small, the targets in ECONOMY.md are met through supply (`supply`, register
 * and safe recovery, the weekly chop list, fence saturation), not through long cycle times.
 */
export type ActivityKind = 'job' | 'crime' | 'gamble' | 'property';
/** Which resolver in `Economy.attempt` handles the activity. */
export type Resolver = 'job' | 'register' | 'safe' | 'burglary' | 'hijack' | 'pickpocket' | 'collections' | 'chop' | 'number' | 'otb' | 'cards' | 'pool' | 'fight' | 'collect';

export interface Payout {
  min: number; max: number;
  /** >1 skews towards the low end (most bails are small, a few are big) */
  skew?: number;
  /** extra fraction of pay per skill point above 50 (0.002 = +/-10% across 0..100 around 50) */
  skillBonus?: number;
  /** chance (plus skill scaling) of a tip of a fraction of the base */
  tip?: { chance: number; skillScale: number; pctMin: number; pctMax: number };
  /** pay is `pct` of a random `min..max` figure (the bond), not of the range itself */
  of?: { min: number; max: number; pct: number; skew?: number };
}
export interface Requirement {
  /** the lead owns a car: flag `car.<lead>` */
  car?: boolean;
  /** a story/unlock flag, e.g. the hack licence */
  flag?: string;
  /** needs a firearm in the pockets */
  armed?: boolean;
  /** needs this item; `consume` uses one up per attempt */
  item?: { id: string; consume?: boolean };
}
/** A leaky bucket of opportunities: `capacity` ready at the start, `perHour` refilled in game hours. */
export interface Supply { capacity: number; perHour: number }

export interface ActivityDef {
  id: string;
  name: string;
  kind: ActivityKind;
  resolver: Resolver;
  /** which leads can do it (`any` = all) */
  leads: readonly string[] | 'any';
  /** skill that shifts the outcome (null = none) */
  skill: Skill | null;
  minutes: number;
  payout?: Payout;
  crime?: { kind: CrimeKind; armedKind?: CrimeKind; extra?: CrimeKind[]; noise?: number; witnessChance: number };
  /** chance the attempt fails outright (no pay); skill lowers it for crime */
  failChance?: number;
  supply?: Supply;
  requires?: Requirement;
  /** default and range for gambling stakes */
  stake?: { min: number; max: number; default: number };
  /** time-of-day demand multiplier by hour (24 entries) */
  tod?: readonly number[];
  note?: string;
}

/** Cab demand: peaks at the theatre let-out and bar close, thin before dawn. */
export const TOD_CAB: readonly number[] = [0.9, 0.7, 0.5, 0.4, 0.4, 0.5, 0.7, 0.9, 1.0, 0.9, 0.9, 1.0, 1.0, 0.9, 0.9, 1.0, 1.1, 1.2, 1.2, 1.2, 1.3, 1.3, 1.2, 1.1];

export const DEFAULT_ACTIVITIES: ActivityDef[] = [
  // ---- legal jobs (best legal job should land around 0.4-0.5x of missions) ----
  { id: 'job.cab', name: 'Hack cab fares', kind: 'job', resolver: 'job', leads: 'any', skill: 'driving', minutes: 140,
    payout: { min: usd(3), max: usd(7), skillBonus: 0.002, tip: { chance: 0.25, skillScale: 0.5, pctMin: 0.1, pctMax: 0.3 } },
    supply: { capacity: 5, perHour: 0.6 }, requires: { flag: 'hack_licence' }, tod: TOD_CAB, note: 'Fares hail you; tip scales with route knowledge and smoothness.' },
  { id: 'job.garment', name: 'Garment rush', kind: 'job', resolver: 'job', leads: 'any', skill: 'stamina', minutes: 480,
    payout: { min: usd(15), max: usd(15), skillBonus: 0.002 }, note: 'The floor: on foot, no money, no kit. Always available, never lucrative.' },
  { id: 'job.locksmith', name: 'Locksmith call-outs', kind: 'job', resolver: 'job', leads: [TEDDY], skill: 'lockwork', minutes: 570,
    payout: { min: usd(10), max: usd(25), skillBonus: 0.004 }, supply: { capacity: 3, perHour: 0.15 } },
  { id: 'job.photos', name: 'Night photos (tabloid desk)', kind: 'job', resolver: 'job', leads: [DELPHINE], skill: 'stealth', minutes: 1050,
    payout: { min: usd(10), max: usd(75), skew: 1.7, skillBonus: 0.004 }, supply: { capacity: 3, perHour: 0.12 },
    requires: { item: { id: 'item.film_pack', consume: true } }, note: 'Price by subject, composition and how fast she got there.' },
  { id: 'job.bail', name: 'Bail skips', kind: 'job', resolver: 'job', leads: 'any', skill: 'strength', minutes: 690,
    payout: { min: 0, max: 0, of: { min: usd(50), max: usd(500), pct: 0.10, skew: 1.5 }, skillBonus: 0.003 }, failChance: 0.25, supply: { capacity: 3, perHour: 0.12 } },
  { id: 'job.tow', name: 'Tow and repo', kind: 'job', resolver: 'job', leads: 'any', skill: 'driving', minutes: 520,
    payout: { min: usd(8), max: usd(30), skew: 1.3 }, failChance: 0.12, supply: { capacity: 4, perHour: 0.15 }, requires: { car: true } },

  // ---- crime (best should land around 0.6-0.8x before heat costs) ----
  { id: 'crime.register', name: 'Register robbery', kind: 'crime', resolver: 'register', leads: 'any', skill: 'stealth', minutes: 1000,
    crime: { kind: 'theft', armedKind: 'assault_weapon', noise: 14, witnessChance: 0.7 }, failChance: 0.08 },
  { id: 'crime.safe', name: 'Back-office safe', kind: 'crime', resolver: 'safe', leads: 'any', skill: 'lockwork', minutes: 1790,
    crime: { kind: 'theft', noise: 22, witnessChance: 0.35 } },
  { id: 'crime.burglary', name: 'Burglary (fenced loot)', kind: 'crime', resolver: 'burglary', leads: 'any', skill: 'lockwork', minutes: 900,
    crime: { kind: 'theft', noise: 8, witnessChance: 0.3 }, failChance: 0.22, supply: { capacity: 4, perHour: 0.12 } },
  { id: 'crime.hijack', name: 'Truck hijack', kind: 'crime', resolver: 'hijack', leads: 'any', skill: 'driving', minutes: 3000,
    crime: { kind: 'carjack', extra: ['assault_weapon'], noise: 24, witnessChance: 0.85 }, failChance: 0.2, supply: { capacity: 1, perHour: 0.007 }, requires: { car: true, armed: true } },
  { id: 'crime.pickpocket', name: 'Pickpocketing', kind: 'crime', resolver: 'pickpocket', leads: 'any', skill: 'stealth', minutes: 440,
    payout: { min: usd(8), max: usd(60), skew: 1.8, skillBonus: 0.006 }, crime: { kind: 'theft', noise: 4, witnessChance: 0.15 }, failChance: 0.3, supply: { capacity: 4, perHour: 0.2 } },
  { id: 'crime.collections', name: 'Collections (loan shark)', kind: 'crime', resolver: 'collections', leads: 'any', skill: 'strength', minutes: 670,
    payout: { min: usd(150), max: usd(600) }, crime: { kind: 'menacing', extra: ['assault'], noise: 10, witnessChance: 0.5 }, failChance: 0.25, supply: { capacity: 3, perHour: 0.15 } },
  { id: 'crime.chop', name: 'Car theft for the chop shop', kind: 'crime', resolver: 'chop', leads: 'any', skill: 'driving', minutes: 3400,
    crime: { kind: 'theft', noise: 12, witnessChance: 0.6 }, failChance: 0.2 },

  // ---- gambling (negative EV on purpose; stakes in cents) ----
  { id: 'gamble.number', name: 'The daily number', kind: 'gamble', resolver: 'number', leads: 'any', skill: null, minutes: 10, stake: { min: 25, max: usd(20), default: usd(1) } },
  { id: 'gamble.otb', name: 'Off-track betting', kind: 'gamble', resolver: 'otb', leads: 'any', skill: null, minutes: 40, stake: { min: usd(2), max: usd(100), default: usd(5) } },
  { id: 'gamble.cards', name: 'Backroom card game', kind: 'gamble', resolver: 'cards', leads: 'any', skill: 'stealth', minutes: 180, stake: { min: usd(1), max: usd(25), default: usd(3) } },
  { id: 'gamble.pool', name: 'Pool for money', kind: 'gamble', resolver: 'pool', leads: 'any', skill: 'shooting', minutes: 60, stake: { min: usd(2), max: usd(50), default: usd(5) } },
  { id: 'gamble.fight', name: 'Fight card bet', kind: 'gamble', resolver: 'fight', leads: 'any', skill: null, minutes: 120, stake: { min: usd(5), max: usd(100), default: usd(10) } },

  // ---- property ----
  { id: 'property.collect', name: 'Collect the till', kind: 'property', resolver: 'collect', leads: 'any', skill: null, minutes: 45 },
];

/** Roll a payout in cents. `skill` is 0..100. Order: base (or a cut of a bond) -> skill -> tip. */
export function rollPayout(p: Payout, skill: number, rng: Rng): number {
  const u = Math.pow(rng.next(), p.skew ?? 1);
  let v: number;
  if (p.of) {
    const bond = p.of.min + (p.of.max - p.of.min) * Math.pow(rng.next(), p.of.skew ?? 1);
    v = bond * p.of.pct;
  } else v = p.min + (p.max - p.min) * u;
  v *= 1 + (p.skillBonus ?? 0) * (skill - 50);
  if (p.tip && rng.chance(Math.min(0.95, p.tip.chance + p.tip.skillScale * skill / 100))) v *= 1 + rng.range(p.tip.pctMin, p.tip.pctMax);
  return Math.max(0, Math.round(v));
}

/** Leaky-bucket opportunity pools in game hours. Starts full. */
export class Supplies {
  private s = new Map<string, { tokens: number; t: number }>();
  constructor(private defs: Map<string, Supply>) {}
  level(id: string, nowH: number): number {
    const d = this.defs.get(id); if (!d) return Infinity;
    const st = this.s.get(id) ?? { tokens: d.capacity, t: nowH };
    return Math.min(d.capacity, st.tokens + Math.max(0, nowH - st.t) * d.perHour);
  }
  /** Use one opportunity. Returns the yield factor 0..1 (a partly refilled pool pays proportionally). */
  take(id: string, nowH: number): number {
    const d = this.defs.get(id); if (!d) return 1;
    const lv = this.level(id, nowH);
    this.s.set(id, { tokens: Math.max(0, lv - 1), t: nowH });
    return Math.min(1, lv);
  }
  serialize() { return Object.fromEntries(this.s); }
  restore(o: Record<string, { tokens: number; t: number }>) { this.s = new Map(Object.entries(o)); }
}
