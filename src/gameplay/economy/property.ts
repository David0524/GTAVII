import type { Rng } from '../core/rng';
import { usd } from './types';

/**
 * Businesses for sale (PLACEHOLDER names, prices and blocks) and their weekly 1974 trouble.
 *
 *   weekly income = base x foot-traffic(block) x (1 + sum of upgrade bonuses) - wages - precinct pad
 *
 * Income accrues continuously into the business's till, prorated by the hours of every
 * `timeAdvanced` (a closed business earns nothing but still owes wages and the pad). The owner
 * collects the till; a till left full invites a break-in. Once a week each business rolls trouble:
 * a precinct shakedown, a crew demanding protection, a brownout loss, a break-in, a manager
 * skimming. The owner pays or refuses (the host passes a `choose` policy).
 */
export type TroubleKind = 'shakedown' | 'protection' | 'brownout' | 'breakin' | 'skimming';
export interface UpgradeDef { id: string; label: string; price: number; /** added to the income multiplier */ bonus: number; /** a visible change: sign, neon, awning */ visible: string; alarm?: boolean }
export interface BusinessDef {
  id: string; name: string; block: string; price: number;
  weeklyBase: number; wages: number; pad: number;
  /** what owning it unlocks (PLACEHOLDER for the narrative/interiors side lines) */
  sideline: string;
  upgrades: UpgradeDef[];
}
const up = (id: string, label: string, price: number, bonus: number, visible: string, alarm = false): UpgradeDef => ({ id, label, price, bonus, visible, alarm });

export const DEFAULT_BUSINESSES: BusinessDef[] = [
  { id: 'biz.newsstand', name: 'Eighth Ave newsstand', block: 'block.eighth', price: usd(1100), weeklyBase: usd(300), wages: 0, pad: usd(20), sideline: 'a numbers drop',
    upgrades: [up('awning', 'New awning', usd(250), 0.10, 'a fresh awning'), up('magazines', 'Magazine rack', usd(400), 0.14, 'a bigger rack')] },
  { id: 'biz.laundromat', name: 'Wash-and-Dry laundromat', block: 'block.ninth', price: usd(1900), weeklyBase: usd(480), wages: usd(120), pad: usd(35), sideline: 'launders cash',
    upgrades: [up('machines', 'Newer machines', usd(600), 0.12, 'a new sign', false), up('alarm', 'Door alarm', usd(220), 0.0, 'a bell on the door', true)] },
  { id: 'biz.diner', name: 'All-night diner', block: 'block.deuce', price: usd(2200), weeklyBase: usd(645), wages: usd(430), pad: usd(60), sideline: 'a back booth for meets',
    upgrades: [up('neon', 'Neon sign', usd(500), 0.12, 'a neon sign'), up('grill', 'Second grill', usd(700), 0.15, 'a longer counter')] },
  { id: 'biz.garage', name: 'Parking garage', block: 'block.garment', price: usd(2600), weeklyBase: usd(545), wages: usd(230), pad: usd(55), sideline: 'stores cars',
    upgrades: [up('lights', 'Lighting', usd(450), 0.10, 'bright bulbs'), up('alarm', 'Booth alarm', usd(240), 0.0, 'a booth alarm', true)] },
  { id: 'biz.arcade', name: 'Deuce arcade', block: 'block.deuce', price: usd(2500), weeklyBase: usd(462), wages: usd(210), pad: usd(55), sideline: 'launders cash',
    upgrades: [up('machines', 'New machines', usd(800), 0.16, 'new cabinets'), up('neon', 'Neon marquee', usd(550), 0.10, 'a neon marquee')] },
  { id: 'biz.poolhall', name: 'Pool hall', block: 'block.penn', price: usd(2300), weeklyBase: usd(500), wages: usd(190), pad: usd(50), sideline: 'a card game upstairs',
    upgrades: [up('tables', 'Re-clothed tables', usd(500), 0.11, 'green felt'), up('bar', 'Beer licence', usd(900), 0.16, 'a lit beer sign')] },
];
/** Foot traffic by block, a 0.6..1.6 multiplier. Sim owns the real numbers per block (setTraffic). */
export const DEFAULT_TRAFFIC: Record<string, number> = { 'block.eighth': 1.0, 'block.ninth': 0.95, 'block.deuce': 1.25, 'block.garment': 1.1, 'block.penn': 1.1 };

export const HOURS_PER_WEEK = 168;
/** Weekly odds of each trouble (summer 1974: heat, brownouts, a squeezed precinct). */
export const TROUBLE_ODDS = { shakedown: 0.2, protection: 0.12, brownout: 0.12, breakin: 0.10, skimming: 0.08 };
export const ALARM_BREAKIN_MULT = 0.35;

export interface Owned { def: string; owner: string; upgrades: string[]; till: number; closedUntilH: number; skimUntilWeek: number; boughtH: number; earned: number }
export interface Trouble {
  biz: string; owner: string; kind: TroubleKind; text: string;
  /** what was demanded or at stake, in cents */
  demand: number;
  decision: 'pay' | 'refuse' | 'auto';
  /** cash the owner paid out of pocket */
  paid: number;
  /** taken out of the till */
  lost: number;
  /** days the business is shut by it */
  closedDays: number;
}
export type Choose = (t: Pick<Trouble, 'biz' | 'owner' | 'kind' | 'demand' | 'text'>) => 'pay' | 'refuse';

export class Property {
  readonly defs = new Map<string, BusinessDef>();
  readonly owned = new Map<string, Owned>();
  private traffic = new Map<string, number>(Object.entries(DEFAULT_TRAFFIC));
  constructor(private rng: Rng, defs: readonly BusinessDef[] = DEFAULT_BUSINESSES) { for (const d of defs) this.defs.set(d.id, d); }

  setTraffic(block: string, f: number) { this.traffic.set(block, f); }
  trafficOf(block: string) { return this.traffic.get(block) ?? 1; }
  upgradeBonus(o: Owned) { const d = this.defs.get(o.def)!; return d.upgrades.filter((u) => o.upgrades.includes(u.id)).reduce((a, u) => a + u.bonus, 0); }
  hasAlarm(o: Owned) { const d = this.defs.get(o.def)!; return d.upgrades.some((u) => u.alarm && o.upgrades.includes(u.id)); }
  /** Gross, before wages and pad, per week at the current traffic and upgrades. */
  grossWeekly(id: string) { const o = this.owned.get(id)!, d = this.defs.get(o.def)!; return d.weeklyBase * this.trafficOf(d.block) * (1 + this.upgradeBonus(o)); }
  /** Net per week before trouble. */
  netWeekly(id: string) { const o = this.owned.get(id)!, d = this.defs.get(o.def)!; return this.grossWeekly(id) - d.wages - d.pad; }
  isOpen(o: Owned, nowH: number) { return nowH >= o.closedUntilH; }

  buy(owner: string, id: string, nowH: number, spend: (cents: number) => boolean): boolean {
    const d = this.defs.get(id); if (!d || this.owned.has(id)) return false;
    if (!spend(d.price)) return false;
    this.owned.set(id, { def: id, owner, upgrades: [], till: 0, closedUntilH: 0, skimUntilWeek: -1, boughtH: nowH, earned: 0 });
    return true;
  }
  upgrade(id: string, upgradeId: string, spend: (cents: number) => boolean): boolean {
    const o = this.owned.get(id); if (!o) return false;
    const u = this.defs.get(o.def)!.upgrades.find((x) => x.id === upgradeId);
    if (!u || o.upgrades.includes(u.id) || !spend(u.price)) return false;
    o.upgrades.push(u.id); return true;
  }
  ownedBy(lead: string) { return [...this.owned.values()].filter((o) => o.owner === lead); }

  /** Accrue `hours` of income into every till. Returns the (signed) net added per business. */
  accrue(hours: number, nowH: number, week: number): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, o] of this.owned) {
      const d = this.defs.get(o.def)!;
      // the closed fraction of the span earns no gross but wages and pad still run
      const spanStart = nowH - hours;
      const openHours = o.closedUntilH <= spanStart ? hours : o.closedUntilH >= nowH ? 0 : nowH - o.closedUntilH;
      const skim = week < o.skimUntilWeek ? 0.18 : 0;
      const gross = this.grossWeekly(id) / HOURS_PER_WEEK * openHours * (1 - skim);
      const costs = (d.wages + d.pad) / HOURS_PER_WEEK * hours;
      const net = gross - costs;
      o.till = Math.max(0, o.till + net); o.earned += net;
      out.set(id, net);
    }
    return out;
  }
  /** Take the till. */
  collect(id: string): number { const o = this.owned.get(id); if (!o) return 0; const c = Math.round(o.till); o.till = 0; return c; }

  /** The weekly trouble roll. `charge` takes owner cash (all-or-nothing). */
  weekly(week: number, nowH: number, choose: Choose, charge: (owner: string, cents: number) => boolean): Trouble[] {
    const out: Trouble[] = [];
    for (const [id, o] of this.owned) {
      const d = this.defs.get(o.def)!, r = this.rng;
      const mk = (kind: TroubleKind, text: string, demand: number): Trouble => ({ biz: id, owner: o.owner, kind, text, demand, decision: 'auto', paid: 0, lost: 0, closedDays: 0 });
      if (r.chance(TROUBLE_ODDS.shakedown)) {
        const t = mk('shakedown', `Two plainclothes men from the precinct say the ${d.name} is "overdue for an inspection", unless it's friends with them.`, usd(r.int(60, 120)));
        const pay = choose(t) === 'pay' && charge(o.owner, t.demand);
        t.decision = pay ? 'pay' : 'refuse';
        if (pay) t.paid = t.demand; else { t.closedDays = r.int(3, 5); o.closedUntilH = Math.max(o.closedUntilH, nowH + t.closedDays * 24); }
        out.push(t);
      }
      if (r.chance(TROUBLE_ODDS.protection)) {
        const t = mk('protection', `A crew from over the avenue wants weekly "insurance" for the ${d.name}.`, usd(r.int(25, 70)));
        const pay = choose(t) === 'pay' && charge(o.owner, t.demand);
        t.decision = pay ? 'pay' : 'refuse';
        if (pay) t.paid = t.demand; else { t.lost = Math.min(o.till, usd(r.int(30, 90))); o.till -= t.lost; t.closedDays = 1; o.closedUntilH = Math.max(o.closedUntilH, nowH + 24); }
        out.push(t);
      }
      if (r.chance(TROUBLE_ODDS.brownout)) {
        const t = mk('brownout', `The block goes dark in the heat; the ${d.name} loses a night and the stock.`, Math.round(this.grossWeekly(id) * 0.12));
        t.lost = Math.min(o.till, t.demand); o.till -= t.lost;
        out.push(t);
      }
      if (r.chance(TROUBLE_ODDS.breakin * (this.hasAlarm(o) ? ALARM_BREAKIN_MULT : 1))) {
        const t = mk('breakin', `Someone forced the back door of the ${d.name} overnight.`, usd(r.int(25, 60)));
        const muscle = choose(t) === 'pay' && charge(o.owner, usd(40)); // a night man on the door afterwards
        t.decision = muscle ? 'pay' : 'refuse'; if (muscle) t.paid = usd(40);
        t.lost = Math.round(o.till * r.range(0.5, 1) * (muscle ? 0.3 : 1)); o.till -= t.lost;
        const repair = t.demand; if (charge(o.owner, repair)) t.paid += repair; else o.till = Math.max(0, o.till - repair);
        out.push(t);
      }
      if (d.wages > 0 && week >= o.skimUntilWeek && r.chance(TROUBLE_ODDS.skimming)) {
        const t = mk('skimming', `The manager at the ${d.name} has been shaving the count.`, usd(45));
        const fire = choose(t) === 'pay' && charge(o.owner, t.demand); // a replacement manager costs a week of hunting
        t.decision = fire ? 'pay' : 'refuse'; if (fire) t.paid = t.demand; else o.skimUntilWeek = week + 3;
        out.push(t);
      }
    }
    return out;
  }
  serialize() { return { owned: [...this.owned.values()] }; }
  restore(o: ReturnType<Property['serialize']>) { this.owned.clear(); for (const b of o.owned) this.owned.set(b.def, b); }
}
