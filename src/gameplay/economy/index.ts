import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import type { Inventory } from '../items/inventory';
import type { TimeKeeper } from '../time';
import type { CrimeKind } from '../police/crime';
import { DEFAULT_ACTIVITIES, Supplies, rollPayout, type ActivityDef, type Supply } from './activities';
import { Fences, type FenceDef } from './fences';
import { ChopShop, type Car, type CarClass, CLASS_BASE, ERA_COLOURS } from './chop';
import { Registers, type ShopDef } from './registers';
import * as G from './gambling';
import { Property, type BusinessDef, type Choose, type Trouble } from './property';
import { Loans, type LoanDue } from './loans';
import { LOOT_CATEGORIES, NICK, clamp, usd, type CrimeFn, type FlagFn, type Lot, type LootCategory } from './types';

export * from './types';
export * from './activities';
export { Fences, DEFAULT_FENCES, type FenceDef, type Quote, type WantEntry } from './fences';
export * from './chop';
export { Registers, DEFAULT_SHOPS, type ShopDef } from './registers';
export * as gambling from './gambling';
export { Property, DEFAULT_BUSINESSES, type BusinessDef, type Trouble, type TroubleKind } from './property';
export { Loans, type Loan, type LoanDue } from './loans';

export interface EconomyEvents extends Record<string, unknown> {
  /** any cash earned (job, loot sale, winnings, collected till) */
  paid: { lead: string; cents: number; reason: string };
  robbed: { lead: string; shop: string; cents: number; armed: boolean };
  troubled: Trouble & { week: number };
  jobDone: { lead: string; id: string; cents: number; minutes: number };
  fenced: { lead: string; fence: string; category: LootCategory; street: number; cents: number; want: boolean };
  betSettled: { lead: string; game: string; stake: number; net: number };
  loanDue: LoanDue;
  /** a delta for the host's relationship system (Nick's loans) */
  relationship: { a: string; b: string; delta: number; reason: string };
  daily: { day: number };
  weekly: { week: number };
}

export interface EconomyOptions {
  inv: Inventory; time: TimeKeeper; crime: CrimeFn; rng: Rng; flags: FlagFn;
  activities?: ActivityDef[]; fences?: FenceDef[]; shops?: ShopDef[]; businesses?: BusinessDef[];
  seed?: number;
}
/** Options for one `attempt`. All optional: the headless policy picks sensible defaults. */
export interface AttemptOpts {
  /** a specific shop (register/safe) */
  target?: string;
  /** gambling stake in cents */
  stake?: number;
  /** number to play / horse index / fight side */
  pick?: number | 'a' | 'b';
  /** override the armed check for robbery */
  armed?: boolean;
  /** keep stolen lots in `loot` instead of fencing them at once */
  keepLoot?: boolean;
  /** a stolen car to deliver (chop) */
  car?: Car;
}
export interface AttemptResult {
  ok: boolean;
  /** net change to the lead's cash (negative for a lost bet) */
  cents: number;
  /** game minutes the attempt took (0 if it could not start) */
  minutes: number;
  crimes: CrimeKind[];
  reason?: string;
}

const LOOT_LABELS: Record<LootCategory, string[]> = {
  jewelry: ['a jewellery box', 'wristwatches', 'a pearl strand'], furs: ['a fox stole', 'a mink wrap', 'rabbit jackets'],
  electronics: ['a console television', 'a hi-fi set', 'a portable radio'], liquor: ['cased bourbon', 'imported gin', 'rye by the case'],
  silver: ['a silver service', 'candlesticks', 'flatware'], appliances: ['a window air conditioner', 'a toaster oven', 'an electric fan'],
};

export class Economy extends Emitter<EconomyEvents> {
  readonly defs = new Map<string, ActivityDef>();
  readonly supplies: Supplies;
  readonly fences: Fences;
  readonly chop: ChopShop;
  readonly registers: Registers;
  readonly property: Property;
  readonly loans = new Loans(NICK);
  /** unsold stolen lots per lead (`keepLoot` and the player's own fence runs) */
  readonly loot = new Map<string, Lot[]>();
  /** how the owner answers weekly property trouble; default pays when affordable */
  choose: Choose = (t) => (this.inv.ensure(t.owner).money >= t.demand ? 'pay' : 'refuse');
  private numberBets: G.NumberBet[] = [];
  private inv: Inventory; private time: TimeKeeper; private crime: CrimeFn; private rng: Rng; private flags: FlagFn;
  private seed: number;
  private off: () => void;

  constructor(o: EconomyOptions) {
    super();
    this.inv = o.inv; this.time = o.time; this.crime = o.crime; this.rng = o.rng; this.flags = o.flags; this.seed = o.seed ?? 74;
    for (const a of o.activities ?? DEFAULT_ACTIVITIES) this.defs.set(a.id, a);
    this.supplies = new Supplies(new Map([...this.defs.values()].filter((d) => d.supply).map((d) => [d.id, d.supply as Supply])));
    this.fences = new Fences(o.fences, this.seed);
    this.chop = new ChopShop(this.seed);
    this.registers = new Registers(o.shops);
    this.property = new Property(this.rng, o.businesses);
    this.fences.rollWeek(this.week());
    this.off = this.time.on('timeAdvanced', (e) => this.onAdvance(e));
  }
  dispose() { this.off(); }

  // ---- clock -------------------------------------------------------------------------------
  /** Absolute game hours. */
  nowH() { const c = this.time.clock; return c.day * 24 + c.minutes / 60; }
  week() { return Math.floor(this.time.clock.day / 7); }

  private onAdvance(e: { hours: number; fromDay: number; toDay: number }) {
    const nowH = this.nowH();
    // income first, then the calendar boundaries crossed (day -> loans and the number; week -> trouble, lists)
    this.property.accrue(e.hours, nowH, this.week());
    for (let d = e.fromDay + 1; d <= e.toDay; d++) {
      this.dailyTick(d);
      if (d % 7 === 0) this.weeklyTick(d / 7, d * 24);
    }
  }
  private dailyTick(day: number) {
    this.emit('daily', { day });
    // the number drawn for the day just ended pays yesterday's bets
    const drawn = G.drawNumber(day - 1, this.seed);
    const keep: G.NumberBet[] = [];
    for (const b of this.numberBets) {
      if (b.day > day - 1) { keep.push(b); continue; }
      const net = G.numberNet(b.stake, b.pick, drawn);
      if (net > 0) this.pay(b.lead, b.stake + net, 'number');
      this.emit('betSettled', { lead: b.lead, game: 'number', stake: b.stake, net });
    }
    this.numberBets = keep;
    this.loans.accrue();
    for (const due of this.loans.settle(day, (l) => this.inv.ensure(l).money, (l, c) => this.inv.transfer(l, NICK, c, 'loan repayment'))) {
      this.emit('loanDue', due);
      if (due.relationship) this.emit('relationship', { a: due.loan.lender, b: due.loan.borrower, delta: due.relationship, reason: due.relationship > 0 ? 'loan repaid' : 'loan ignored' });
    }
  }
  private weeklyTick(week: number, nowH: number) {
    this.fences.rollWeek(week);
    for (const t of this.property.weekly(week, nowH, this.choose, (who, c) => this.inv.spend(who, c, 'property'))) this.emit('troubled', { ...t, week });
    this.emit('weekly', { week });
  }

  // ---- helpers -----------------------------------------------------------------------------
  private pay(lead: string, cents: number, reason: string) { if (cents > 0) { this.inv.addMoney(lead, cents, reason); this.emit('paid', { lead, cents, reason }); } }
  armed(lead: string) { return this.inv.weapons(lead).some((w) => this.inv.reg.weapon(w).class !== 'melee'); }
  /** Why the lead cannot start the activity right now, or null. */
  gate(lead: string, id: string): string | null {
    const d = this.defs.get(id); if (!d) return 'unknown';
    if (d.leads !== 'any' && !d.leads.includes(lead)) return 'wrong_lead';
    const r = d.requires;
    // a story flag may be global (`hack_licence`) or per lead (`hack_licence.char.teddy_arce`)
    if (r?.flag && !this.flags(r.flag) && !this.flags(`${r.flag}.${lead}`)) return `needs_${r.flag}`;
    if (r?.car && !this.flags(`car.${lead}`)) return 'needs_car';
    if (r?.armed && !this.armed(lead)) return 'needs_gun';
    if (r?.item && !this.inv.has(lead, r.item.id)) return 'needs_item';
    if (d.stake && this.inv.ensure(lead).money < d.stake.min) return 'broke';
    return null;
  }
  /** 0..1: how much of a full payout the best opportunity would give now (policies wait when low). */
  availability(lead: string, id: string): number {
    const d = this.defs.get(id); if (!d || this.gate(lead, id)) return 0;
    const t = this.nowH();
    switch (d.resolver) {
      case 'register': return this.registers.tillLevel(this.registers.best(t), t);
      case 'safe': { const s = this.registers.bestSafe(t); return s ? this.registers.safeLevel(s, t) : 0; }
      case 'chop': return this.chop.open(this.week()).length ? 1 : 0.2;
      case 'collect': return this.property.ownedBy(lead).reduce((a, o) => a + o.till, 0) > usd(20) ? 1 : 0;
      default: return d.supply ? Math.min(1, this.supplies.level(id, t)) : 1;
    }
  }
  private visibleRoll(d: ActivityDef, stealth: number) { return this.rng.chance((d.crime?.witnessChance ?? 0) * (1 - 0.5 * stealth / 100)); }
  private lots(n: number, cats: readonly LootCategory[], lo: number, hi: number): Lot[] {
    return Array.from({ length: n }, () => { const category = this.rng.pick(cats); return { category, cents: Math.round(usd(lo) + (usd(hi) - usd(lo)) * Math.pow(this.rng.next(), 1.4)), label: this.rng.pick(LOOT_LABELS[category]) }; });
  }

  /** Sell one lot to a named fence, or the best offer. Returns cash paid. */
  sellLot(lead: string, lot: Lot, fence?: string): number {
    const nowH = this.nowH();
    const q = fence ? this.fences.sell(fence, lot, nowH) : (() => { const b = this.fences.best(lot, nowH); return b ? this.fences.sell(b.fence, lot, nowH) : null; })();
    if (!q) return 0;
    this.pay(lead, q.cents, 'fence');
    this.emit('fenced', { lead, fence: q.fence, category: lot.category, street: lot.cents, cents: q.cents, want: !!q.want });
    return q.cents;
  }
  /** Sell everything the lead is carrying. */
  sellAll(lead: string): number { const l = this.loot.get(lead) ?? []; this.loot.delete(lead); return l.reduce((a, lot) => a + this.sellLot(lead, lot), 0); }

  // ---- the headless entry point --------------------------------------------------------------
  /**
   * Resolve ONE attempt at an activity. Does not advance the clock (the host or sim does that with the
   * returned `minutes`). Crimes are reported through the callback and listed in the result.
   */
  attempt(lead: string, id: string, o: AttemptOpts = {}): AttemptResult {
    const d = this.defs.get(id);
    const why = this.gate(lead, id);
    if (!d || why) return { ok: false, cents: 0, minutes: 0, crimes: [], reason: why ?? 'unknown' };
    const inv = this.inv.ensure(lead), sk = d.skill ? inv.skills[d.skill] : 50, nowH = this.nowH(), crimes: CrimeKind[] = [];
    const report: CrimeFn = (kind, c) => { crimes.push(kind); this.crime(kind, c); };
    const res = (ok: boolean, cents: number, minutes = d.minutes, reason?: string): AttemptResult => ({ ok, cents, minutes, crimes, reason });
    if (d.requires?.item?.consume) this.inv.take(lead, d.requires.item.id, 1);
    const failed = () => this.rng.chance((d.failChance ?? 0) * (d.kind === 'crime' ? 1 - 0.4 * sk / 100 : 1));
    const visible = () => this.visibleRoll(d, inv.skills.stealth);
    const bust = () => { report(d.crime!.kind, { noise: d.crime!.noise, visible: true }); return res(false, 0, d.minutes, 'failed'); };

    switch (d.resolver) {
      case 'job': {
        const f = this.supplies.take(id, nowH);
        if (failed()) return res(false, 0, d.minutes, 'failed');
        const tod = d.tod ? d.tod[Registers.hourOf(nowH)] : 1;
        const cents = Math.round(rollPayout(d.payout!, sk, this.rng) * f * tod);
        this.pay(lead, cents, id); this.emit('jobDone', { lead, id, cents, minutes: d.minutes });
        return res(true, cents);
      }
      case 'register': {
        if (failed()) return bust();
        const shop = o.target ?? this.registers.best(nowH);
        const armed = o.armed ?? this.armed(lead);
        const r = this.registers.rob(shop, { nowH, armed, rng: this.rng, crime: report, visible: visible() });
        this.pay(lead, r.cents, 'robbery'); this.emit('robbed', { lead, shop, cents: r.cents, armed });
        return res(true, r.cents);
      }
      case 'safe': {
        const shop = o.target ?? this.registers.bestSafe(nowH);
        if (!shop || !this.registers.shops.get(shop)?.safe) return res(false, 0, 0, 'no_safe');
        const r = this.registers.crack(shop, { nowH, lockwork: inv.skills.lockwork, rng: this.rng, crime: report, visible: visible() });
        this.pay(lead, r.cents, 'safe'); if (r.cents) this.emit('robbed', { lead, shop, cents: r.cents, armed: false });
        return res(!r.interrupted, r.cents, d.minutes + r.minutes, r.interrupted ? 'interrupted' : undefined);
      }
      case 'burglary': case 'hijack': {
        const f = this.supplies.take(id, nowH);
        if (failed()) return bust();
        if (d.resolver === 'hijack') { report('carjack', { noise: 24, visible: true }); report('assault_weapon', { noise: 18, visible: true }); }
        else report('theft', { noise: d.crime!.noise, visible: visible() });
        // a truckload is a big score (high heat); an apartment is a few hundred on the street
        const lots = d.resolver === 'hijack' ? this.lots(this.rng.int(3, 5), ['furs', 'liquor', 'electronics'], 1500, 5000) : this.lots(this.rng.int(1, 3), LOOT_CATEGORIES, 60, 600);
        for (const l of lots) l.cents = Math.round(l.cents * f);
        if (o.keepLoot) { this.loot.set(lead, [...(this.loot.get(lead) ?? []), ...lots]); return res(true, 0); }
        return res(true, lots.reduce((a, l) => a + this.sellLot(lead, l), 0));
      }
      case 'pickpocket': case 'collections': {
        const f = this.supplies.take(id, nowH);
        if (failed()) return bust();
        const c = d.crime!;
        report(c.kind, { noise: c.noise, visible: visible() });
        for (const x of c.extra ?? []) if (this.rng.chance(0.4)) report(x, { noise: c.noise, visible: true });
        const cents = Math.round(rollPayout(d.payout!, sk, this.rng) * f);
        this.pay(lead, cents, id); this.emit('jobDone', { lead, id, cents, minutes: d.minutes });
        return res(true, cents);
      }
      case 'chop': {
        const week = this.week(), open = this.chop.open(week);
        const car = o.car ?? this.stealCar(open.length ? open[0].cls : this.rng.pick(Object.keys(CLASS_BASE) as CarClass[]), open.length ? open[0].colour : this.rng.pick(ERA_COLOURS), sk);
        if (failed()) return bust();
        report('theft', { noise: d.crime!.noise, visible: visible() });
        const r = this.chop.deliver(week, car);
        this.pay(lead, r.cents, 'chop');
        return res(r.ok, r.cents, d.minutes, r.reason);
      }
      case 'collect': {
        const c = this.property.ownedBy(lead).reduce((a, b) => a + this.property.collect(b.def), 0);
        this.pay(lead, c, 'till');
        return res(c > 0, c);
      }
      default: return this.gamble(lead, d, o, sk, res);
    }
  }
  /** Steal a car of the wanted class: the damage it takes on the way in is skill-dependent. */
  private stealCar(cls: CarClass, colour: Car['colour'], driving: number): Car {
    return { cls, colour, condition: clamp(0.5 + 0.5 * Math.pow(this.rng.next(), 0.7) + 0.001 * (driving - 50), 0.3, 1) };
  }

  private gamble(lead: string, d: ActivityDef, o: AttemptOpts, sk: number, res: (ok: boolean, cents: number, minutes?: number, reason?: string) => AttemptResult): AttemptResult {
    const cash = this.inv.ensure(lead).money;
    const stake = clamp(o.stake ?? d.stake!.default, d.stake!.min, d.stake!.max);
    if (cash < stake) return res(false, 0, 0, 'broke');
    let net = 0;
    switch (d.resolver) {
      case 'number': { const pick = typeof o.pick === 'number' ? o.pick : this.rng.int(0, G.NUMBER_SPACE - 1); net = G.numberNet(stake, pick, this.rng.int(0, G.NUMBER_SPACE - 1)); break; }
      case 'otb': { const r = G.makeRace(this.rng); net = G.otbNet(r, typeof o.pick === 'number' ? o.pick % r.true.length : this.rng.int(0, r.true.length - 1), stake, this.rng); break; }
      case 'cards': net = G.playCards(cash, stake, 6, sk, this.rng).net; break;
      case 'pool': net = G.playPool(stake, sk, o.pick === undefined ? this.rng.int(35, 75) : Number(o.pick), this.rng); break;
      case 'fight': net = G.fightNet(G.makeBout(this.rng), o.pick === 'b' ? 'b' : 'a', stake, this.rng); break;
    }
    if (net >= 0) this.pay(lead, net, d.id); else this.inv.spend(lead, -net, d.id);
    this.emit('betSettled', { lead, game: d.id, stake, net });
    return res(true, net);
  }

  // ---- longer-lived bets, property and loans -------------------------------------------------
  /** Bet the daily number with a runner; it settles when the day's number is drawn at the next midnight. */
  placeNumber(lead: string, pick: number, stake: number): boolean {
    if (!Number.isInteger(pick) || pick < 0 || pick >= G.NUMBER_SPACE || !this.inv.spend(lead, stake, 'number')) return false;
    this.numberBets.push({ lead, pick, stake, day: this.time.clock.day });
    return true;
  }
  buyBusiness(lead: string, id: string) { return this.property.buy(lead, id, this.nowH(), (c) => this.inv.spend(lead, c, 'business')); }
  buyUpgrade(lead: string, id: string, upgrade: string) { return this.property.owned.get(id)?.owner === lead && this.property.upgrade(id, upgrade, (c) => this.inv.spend(lead, c, 'upgrade')); }
  /** Nick lends to another lead; the interest accrues daily and repayment is drawn from the borrower's cash. */
  lend(lender: string, borrower: string, cents: number): boolean {
    const l = this.loans.lend(lender, borrower, cents, this.time.clock.day);
    if (!l) return false;
    if (!this.inv.transfer(lender, borrower, cents, 'loan')) { this.loans.loans.splice(this.loans.loans.indexOf(l), 1); return false; }
    this.emit('relationship', { a: lender, b: borrower, delta: 0, reason: 'loan made' });
    return true;
  }
  repay(borrower: string, cents: number): number {
    const c = Math.min(cents, this.inv.ensure(borrower).money);
    if (c <= 0 || !this.inv.spend(borrower, c, 'loan repayment')) return 0;
    const used = this.loans.repay(borrower, c);
    if (used < c) this.inv.addMoney(borrower, c - used, 'loan change');
    if (used > 0) this.inv.addMoney(NICK, used, 'loan repayment');
    return used;
  }

  serialize() {
    return { supplies: this.supplies.serialize(), fences: this.fences.serialize(), chop: this.chop.serialize(), registers: this.registers.serialize(), property: this.property.serialize(), loans: this.loans.serialize(), loot: Object.fromEntries(this.loot), numberBets: this.numberBets };
  }
  restore(s: ReturnType<Economy['serialize']>) {
    this.supplies.restore(s.supplies); this.fences.restore(s.fences); this.chop.restore(s.chop); this.registers.restore(s.registers);
    this.property.restore(s.property); this.loans.restore(s.loans);
    this.loot.clear(); for (const [k, v] of Object.entries(s.loot)) this.loot.set(k, v);
    this.numberBets = s.numberBets;
  }
}
