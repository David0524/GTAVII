import { Rng } from '../core/rng';
import { Inventory } from '../items/inventory';
import { Registry } from '../items/registry';
import { DEFAULT_CONTENT } from '../data/defaults';
import { TimeKeeper } from '../time';
import type { CrimeKind } from '../police/crime';
import { Economy } from './index';
import type { ActivityDef } from './activities';
import { DELPHINE, GAME_HOURS_PER_REAL_HOUR, NICK, TEDDY, usd } from './types';

/**
 * Deterministic headless economy simulation (ECONOMY.md "balance targets").
 *
 * Two instruments:
 *  1. `measureRates`: a FULL-TIME PROBE per activity. A lead does nothing but that activity, taking
 *     an opportunity only when at least 60% of a full payout is available and otherwise waiting an
 *     hour, for 4 game weeks after a 1-week warm-up. This gives the sustained, supply-limited
 *     cents per game hour, compared with the mission reference (default $150 per real hour =
 *     $5 per game hour at 30 game hours per real hour). Property is probed by owning one business
 *     (with its weekly trouble) for two game years.
 *  2. `runPlaythrough`: a 20-real-hour (600 game hour) mixed policy across the three leads.
 */
export interface SimOptions {
  seed?: number;
  realHours?: number;
  /** reference mission income, cents per REAL hour of mission play */
  missionCentsPerRealHour?: number;
  /** fraction of game time spent on missions ("mostly missions") */
  missionShare?: number;
  /** game hours a lead plays before the player switches to the next */
  stintHours?: number;
  /** free-roam-only stress policy: always take the best known earner instead of a mixed menu */
  greedy?: boolean;
}
export const DEFAULTS = { seed: 1974, realHours: 20, missionCentsPerRealHour: usd(150), missionShare: 0.6, stintHours: 50 } as const;
/** cents per game hour of mission play */
export const missionRate = (o: SimOptions = {}) => (o.missionCentsPerRealHour ?? DEFAULTS.missionCentsPerRealHour) / GAME_HOURS_PER_REAL_HOUR;

export interface Rig { eco: Economy; inv: Inventory; time: TimeKeeper; rng: Rng; flags: Set<string>; crimes: { kind: CrimeKind; visible: boolean }[] }
export function makeRig(seed: number, activities?: ActivityDef[]): Rig {
  const reg = new Registry(DEFAULT_CONTENT);
  const inv = new Inventory(reg), time = new TimeKeeper(), rng = new Rng(seed), flags = new Set<string>(), crimes: Rig['crimes'] = [];
  const eco = new Economy({ inv, time, rng, flags: (f) => flags.has(f), crime: (kind, o) => crimes.push({ kind, visible: !!o.visible }), activities, seed });
  for (const l of [TEDDY, DELPHINE, NICK]) inv.ensure(l);
  return { eco, inv, time, rng, flags, crimes };
}
/** A lead with $0, no items, no flags: the soft-lock case. */
export function bareLead(rig: Rig, lead: string) {
  const l = rig.inv.ensure(lead); l.money = 0; l.items.clear(); l.loaded.clear(); l.guns.clear(); l.equipped = 'weapon.fists';
}

// ---------------------------------------------------------------------------------------------
// 1. Full-time probes
/** `ratio` = sustained (waiting included) vs missions; `activeRatio` = earned per hour actually spent on attempts (the time-bound rate when supply is plentiful). */
export interface Rate { id: string; centsPerGameHour: number; ratio: number; activeRatio: number; attempts: number }
const PROBE_WARM_H = 7 * 24, PROBE_H = 28 * 24;

export function probeActivity(id: string, o: SimOptions = {}): Rate {
  const rig = makeRig((o.seed ?? DEFAULTS.seed) + 11);
  const d = rig.eco.defs.get(id)!;
  const lead = d.leads === 'any' ? TEDDY : d.leads[0];
  rig.flags.add(`car.${lead}`); rig.flags.add('hack_licence');
  if (!rig.eco.armed(lead)) { rig.inv.give(lead, 'item.snub'); }
  let earned = 0, attempts = 0, t = 0, activeMin = 0;
  while (t < PROBE_WARM_H + PROBE_H) {
    if (rig.inv.count(lead, 'item.film_pack') < 2) rig.inv.give(lead, 'item.film_pack', 5);
    rig.inv.ensure(lead).money = Math.max(rig.inv.ensure(lead).money, usd(500)); // stakes are not what is being measured
    if (rig.eco.availability(lead, id) < 0.6) { rig.time.advance(1, 'wait'); t += 1; continue; }
    const r = rig.eco.attempt(lead, id);
    if (t >= PROBE_WARM_H) { earned += r.cents; attempts++; activeMin += r.minutes; }
    const m = Math.max(r.minutes, 15); rig.time.advance(m / 60, 'wait'); t += m / 60;
  }
  const rate = earned / PROBE_H;
  return { id, centsPerGameHour: rate, ratio: rate / missionRate(o), activeRatio: earned / Math.max(1, activeMin / 60) / missionRate(o), attempts };
}

/** One business owned for two game years with default trouble handling; net cash per game hour, purchase excluded. */
export function probeBusiness(id: string, o: SimOptions = {}, upgrades = false): Rate {
  const rig = makeRig((o.seed ?? DEFAULTS.seed) + 23);
  rig.inv.ensure(TEDDY).money = usd(1_000_000);
  rig.eco.buyBusiness(TEDDY, id);
  if (upgrades) for (const u of rig.eco.property.defs.get(id)!.upgrades) rig.eco.buyUpgrade(TEDDY, id, u.id);
  const base = rig.inv.ensure(TEDDY).money, weeks = 104;
  for (let w = 0; w < weeks; w++) { for (let d = 0; d < 7; d++) rig.time.advance(24, 'wait'); rig.eco.attempt(TEDDY, 'property.collect'); }
  const rate = (rig.inv.ensure(TEDDY).money - base) / (weeks * 168);
  return { id, centsPerGameHour: rate, ratio: rate / missionRate(o), activeRatio: rate / missionRate(o), attempts: weeks };
}

export interface Rates { jobs: Rate[]; crimes: Rate[]; property: Rate[]; legalBest: Rate; crimeBest: Rate; propertyMean: number }
export function measureRates(o: SimOptions = {}): Rates {
  const defs = makeRig(1).eco.defs;
  const jobs = [...defs.values()].filter((d) => d.kind === 'job').map((d) => probeActivity(d.id, o));
  const crimes = [...defs.values()].filter((d) => d.kind === 'crime').map((d) => probeActivity(d.id, o));
  const property = [...makeRig(1).eco.property.defs.keys()].map((id) => probeBusiness(id, o));
  const best = (r: Rate[]) => r.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return { jobs, crimes, property, legalBest: best(jobs), crimeBest: best(crimes), propertyMean: property.reduce((a, b) => a + b.ratio, 0) / property.length };
}

// ---------------------------------------------------------------------------------------------
// 2. The 20-hour playthrough
export interface Checkpoint { realHour: number; gameHour: number; cash: Record<string, number>; total: number }
export interface Earnings { mission: number; legal: number; crime: number; gamble: number; property: number }
export interface SimResult {
  seed: number; gameHours: number; realHours: number;
  curve: Checkpoint[];
  final: Record<string, number>; total: number;
  /** purchase price of businesses and cars still owned (money turned into things) */
  assets: number;
  earned: Earnings; earnedBy: Record<string, number>; hoursBy: Record<keyof Earnings, number>;
  spent: Record<string, number>;
  owned: string[]; cars: string[];
  /** each business bought, with when (real hours into the run) and its tier */
  bought: { id: string; tier: string; realHour: number; lead: string }[];
  attempts: Record<string, number>; visibleCrimes: number;
  /** realised cents per game hour per category in this playthrough */
  rates: Record<keyof Earnings, number>;
  startTotal: number;
}

const LEADS = [TEDDY, DELPHINE, NICK];
/** Whose hands are on the controller in each stint: mostly Teddy, with Delphine and Nick chapters. */
const SCHEDULE = [TEDDY, TEDDY, DELPHINE, TEDDY, NICK, TEDDY, TEDDY, DELPHINE, TEDDY, NICK, TEDDY, DELPHINE];
const LEGAL = ['job.cab', 'job.locksmith', 'job.photos', 'job.bail', 'job.tow'];
const CRIMES = ['crime.chop', 'crime.register', 'crime.safe', 'crime.burglary', 'crime.hijack', 'crime.collections', 'crime.pickpocket'];

export function runPlaythrough(o: SimOptions = {}): SimResult {
  const seed = o.seed ?? DEFAULTS.seed, realHours = o.realHours ?? DEFAULTS.realHours, share = o.missionShare ?? DEFAULTS.missionShare, stint = o.stintHours ?? DEFAULTS.stintHours;
  const endH = realHours * GAME_HOURS_PER_REAL_HOUR, mRate = missionRate(o);
  const rig = makeRig(seed), { eco, inv, time, rng } = rig;
  rig.flags.add(`hack_licence.${TEDDY}`);
  const total = () => LEADS.reduce((a, l) => a + inv.ensure(l).money + inv.ensure(l).savings, 0);
  const startTotal = total();

  const earned: Earnings = { mission: 0, legal: 0, crime: 0, gamble: 0, property: 0 };
  const bought: SimResult['bought'] = [];
  const hoursBy: Earnings = { mission: 0, legal: 0, crime: 0, gamble: 0, property: 0 };
  const spent: Record<string, number> = {};
  const attempts: Record<string, number> = {};
  const bucket = (reason: string): keyof Earnings | null => reason.startsWith('job.') ? 'legal' : reason === 'till' ? 'property' : reason.startsWith('gamble') || reason === 'number' ? null : ['robbery', 'safe', 'fence', 'chop'].includes(reason) || reason.startsWith('crime.') ? 'crime' : null;
  const earnedBy: Record<string, number> = {};
  eco.on('paid', (e) => { earnedBy[e.reason] = (earnedBy[e.reason] ?? 0) + e.cents; const b = bucket(e.reason); if (b) earned[b] += e.cents; });
  eco.on('betSettled', (e) => { earned.gamble += e.net; });
  inv.on('money', (e) => { if (e.delta < 0 && !['deposit', 'loan', 'loan repayment'].includes(e.reason)) spent[e.reason] = (spent[e.reason] ?? 0) - e.delta; });
  // sinks that arrive with the calendar: rent at each lead's home, every week
  eco.on('weekly', () => { for (const l of LEADS) inv.payUpTo(l, usd(35), 'rent'); });

  const plan = new Map(LEADS.map((l) => [l, { outfit: false, gun: false, licence: l === TEDDY, carPrice: usd(600 + 100 * rng.int(0, 9)) }]));
  const curve: Checkpoint[] = [];
  const stats = new Map<string, { cents: number; min: number }>();
  let nextBill = 120, nextCp = 0, missions = 0, visibleCrimes = 0;
  const checkpoint = () => {
    while (nextCp * GAME_HOURS_PER_REAL_HOUR <= eco.nowH() - startH && nextCp <= realHours) {
      curve.push({ realHour: nextCp, gameHour: nextCp * GAME_HOURS_PER_REAL_HOUR, cash: Object.fromEntries(LEADS.map((l) => [l, inv.ensure(l).money + inv.ensure(l).savings])), total: total() });
      nextCp++;
    }
  };
  const startH = eco.nowH();
  const advance = (hours: number, how: 'wait' | 'mission' = 'wait') => { time.advance(hours, how); checkpoint(); };
  checkpoint();

  const cash = (l: string) => inv.ensure(l).money;
  const buy = (l: string, cents: number, reason: string) => inv.spend(l, cents, reason);

  /** Shopping and chores, done between actions by whoever is playing. */
  const lastCollect = new Map<string, number>();
  const chores = (lead: string) => {
    const p = plan.get(lead)!, c = cash(lead);
    // an owner drops by the business about once a game day to empty the till (a real player passes it on the way)
    if (eco.property.ownedBy(lead).length && eco.nowH() - (lastCollect.get(lead) ?? -1e9) >= 24 && eco.availability(lead, 'property.collect') > 0) {
      lastCollect.set(lead, eco.nowH()); attempts['property.collect'] = (attempts['property.collect'] ?? 0) + 1; after(lead, eco.attempt(lead, 'property.collect'), 'property');
    }
    // Nick's loans: borrow only when stuck near zero; repay when flush
    if (lead !== NICK && c < usd(15) && eco.loans.outstanding(lead) === 0) eco.lend(NICK, lead, usd(60));
    if (lead !== NICK && c > usd(250) && eco.loans.outstanding(lead) > 0) eco.repay(lead, Math.min(c - usd(100), eco.loans.outstanding(lead)));
    if (!p.outfit && c >= usd(54) + usd(200) && buy(lead, usd(54), 'clothes')) p.outfit = true;
    if (!p.gun && !eco.armed(lead) && c >= usd(75) + usd(150) && buy(lead, usd(75), 'gun')) { inv.give(lead, 'item.snub'); p.gun = true; if (inv.reserve(lead, 'weapon.snub') < 20 && buy(lead, usd(6.5), 'ammo')) inv.give(lead, 'item.ammo_38', 50); }
    if (lead === DELPHINE && inv.count(lead, 'item.film_pack') < 2 && buy(lead, usd(5.49), 'film')) inv.give(lead, 'item.film_pack', 1);
    if (!p.licence && lead !== TEDDY && c >= usd(75) + usd(400) && buy(lead, usd(75), 'licence')) { rig.flags.add(`hack_licence.${lead}`); p.licence = true; }
    // a business once there is real cash to spare; at most two across the three leads
    // small early, big late: a starter as soon as it's affordable with a cushion, a mid business later, big ones only with a deep cushion
    {
      const cushion = { starter: usd(75), mid: usd(200), big: usd(1500) } as const;
      const pick = [...eco.property.defs.values()]
        .filter((b) => !eco.property.owned.has(b.id) && (!b.lead || b.lead === lead) && eco.property.owned.size < 3 && !eco.property.ownedBy(lead).some((o) => eco.property.defs.get(o.def)!.tier === b.tier) && b.price + cushion[b.tier] <= cash(lead))
        .sort((a, b) => a.price - b.price)[0];
      if (pick && eco.buyBusiness(lead, pick.id)) bought.push({ id: pick.id, tier: pick.tier, realHour: (eco.nowH() - startH) / GAME_HOURS_PER_REAL_HOUR, lead });
    }
    if (eco.property.owned.size > 0 && !rig.flags.has(`car.${lead}`) && cash(lead) >= p.carPrice + usd(100) && buy(lead, p.carPrice, 'car')) rig.flags.add(`car.${lead}`);
    for (const b of eco.property.ownedBy(lead)) for (const u of eco.property.defs.get(b.def)!.upgrades) if (cash(lead) >= u.price + usd(600)) eco.buyUpgrade(lead, b.def, u.id);
  };

  const after = (lead: string, r: ReturnType<Economy['attempt']>, cat: keyof Earnings) => {
    advance(r.minutes / 60); hoursBy[cat] += r.minutes / 60;
    const vis = rig.crimes.filter((x) => x.visible).length; visibleCrimes += vis;
    // heat is a real cost of doing business: a witnessed crime sometimes needs a bribe; violence sometimes needs a hospital
    if (vis && rng.chance(0.5)) inv.payUpTo(lead, usd(rng.int(40, 150)), 'bribe');
    if (r.crimes.some((k) => k === 'assault' || k === 'assault_weapon' || k === 'carjack') && rng.chance(0.05)) inv.payUpTo(lead, usd(rng.int(100, 300)), 'hospital');
    rig.crimes.length = 0;
  };

  const tryList = (lead: string, ids: string[], thr = 0.6) => {
    const ok = ids.filter((id) => eco.availability(lead, id) >= thr);
    return ok.length ? rng.pick(ok) : null;
  };

  while (eco.nowH() - startH < endH) {
    const h = eco.nowH() - startH, lead = SCHEDULE[Math.floor(h / stint) % SCHEDULE.length];
    chores(lead);
    if (h >= nextBill) { inv.payUpTo(lead, usd(rng.int(50, 150)), 'hospital'); nextBill = h + rng.range(150, 300); }
    // time budget: keep to the mission share of elapsed time
    if (hoursBy.mission < share * h || h < 1) {
      const len = 15, pay = Math.round(mRate * len * rng.range(0.85, 1.15));
      inv.addMoney(lead, pay, 'mission'); earned.mission += pay; hoursBy.mission += len; missions++;
      advance(len, 'mission'); continue;
    }
    if (o.greedy) {
      const ids = [...LEGAL, ...CRIMES, 'job.garment'].filter((id) => eco.availability(lead, id) >= 0.6);
      const score = (id: string) => (stats.get(id)?.cents ?? 1e9) / Math.max(1, stats.get(id)?.min ?? 1);
      const id = ids.sort((a, b) => score(b) - score(a))[0];
      if (id) {
        const r = eco.attempt(lead, id); const st = stats.get(id) ?? { cents: 0, min: 0 };
        stats.set(id, { cents: st.cents + r.cents, min: st.min + r.minutes });
        attempts[id] = (attempts[id] ?? 0) + 1; after(lead, r, id.startsWith('crime') ? 'crime' : 'legal'); continue;
      }
      advance(1); continue;
    }
    const roll = rng.next();
    if (roll < 0.40) {
      const id = tryList(lead, LEGAL) ?? (cash(lead) < usd(30) ? 'job.garment' : null);
      if (id) { attempts[id] = (attempts[id] ?? 0) + 1; after(lead, eco.attempt(lead, id), 'legal'); continue; }
    } else if (roll < 0.75) {
      const id = tryList(lead, CRIMES);
      if (id) { attempts[id] = (attempts[id] ?? 0) + 1; after(lead, eco.attempt(lead, id), 'crime'); continue; }
    } else if (roll < 0.90) {
      const id = rng.pick(['gamble.number', 'gamble.otb', 'gamble.cards', 'gamble.pool', 'gamble.fight']);
      const stake = Math.min(eco.defs.get(id)!.stake!.default, Math.floor(cash(lead) * 0.03));
      if (stake >= eco.defs.get(id)!.stake!.min) { attempts[id] = (attempts[id] ?? 0) + 1; after(lead, eco.attempt(lead, id, { stake }), 'gamble'); continue; }
    } else if (eco.availability(lead, 'property.collect') > 0) {
      attempts['property.collect'] = (attempts['property.collect'] ?? 0) + 1; after(lead, eco.attempt(lead, 'property.collect'), 'property'); continue;
    }
    // nothing worth doing this turn: another mission
    const len = 15, pay = Math.round(mRate * len * rng.range(0.85, 1.15));
    inv.addMoney(lead, pay, 'mission'); earned.mission += pay; hoursBy.mission += len; missions++;
    advance(len, 'mission');
  }
  attempts['mission'] = missions;
  const final = Object.fromEntries(LEADS.map((l) => [l, inv.ensure(l).money + inv.ensure(l).savings]));
  const rates = Object.fromEntries((Object.keys(earned) as (keyof Earnings)[]).map((k) => [k, earned[k] / Math.max(1, hoursBy[k])])) as Record<keyof Earnings, number>;
  return {
    seed, gameHours: endH, realHours, curve, final, total: total(),
    assets: [...eco.property.owned.keys()].reduce((a, id) => a + eco.property.defs.get(id)!.price, 0) + LEADS.filter((l) => rig.flags.has(`car.${l}`)).reduce((a, l) => a + plan.get(l)!.carPrice, 0), earned, earnedBy, hoursBy, spent,
    owned: [...eco.property.owned.keys()], cars: LEADS.filter((l) => rig.flags.has(`car.${l}`)),
    attempts, visibleCrimes, rates, startTotal, bought,
  };
}
