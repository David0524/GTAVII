import { Emitter } from './core/events';
import type { Rng } from './core/rng';
import type { HealthSystem } from './health/Health';
import type { Inventory } from './items/inventory';
import type { Registry } from './items/registry';
import { expectedBribe, type Police } from './police/police';

/**
 * Being wasted and being arrested (CORE_SYSTEMS §2–3). Both are quick (a reel-change cut on every
 * device), cost money and time rather than progress, and never lose more than the last checkpoint:
 * inside a mission the engine restores the checkpoint inventory (`restoreCheckpoint`); free roam keeps
 * the consequences.
 *
 * Wasted → the nearest hospital. A capped bill from cash on hand; the ambulance attendants "lose" a
 * share of what's left; half the loose ammo is gone; weapons, items and savings are kept; a temporary
 * max-health penalty that a diner meal or rest at home clears.
 *
 * Arrested → custody at the house that made the arrest. Illicit items and a share of cash go to the
 * property clerk; the arrest goes on the lead's record in that precinct (repeat offenders are made
 * faster). Ways out: a desk-sergeant envelope (only on a house that's on the pad, never for a dead
 * cop), a lawyer from the payphone (fast, gets the property back), BAIL BY ANOTHER LEAD (character
 * switch), or a night in holding (free, costs the night). Property left behind can be retrieved from
 * the clerk later for a fee, with some of it "gone missing".
 */
export interface Place { id: string; name: string; x: number; z: number; heading: number }
export const HOSPITALS: Place[] = [
  { id: 'hospital.west', name: 'Tenth Avenue Hospital', x: -1150, z: -560, heading: Math.PI / 2 },
  { id: 'hospital.east', name: 'Gramercy Infirmary', x: 300, z: 60, heading: -Math.PI / 2 },
];
export const BILL_BASE = 8500, BILL_CAP = 25000, DISCHARGE_HP = 0.6, PENALTY = 0.2, PENALTY_SECS = 300;
export const CLERK_CASH_SHARE = 0.2, LAWYER_FEE = 7500, RETRIEVE_FEE = 1500, RECORD_DECAY_DAYS = 30;
export type Release = 'desk' | 'lawyer' | 'bail' | 'night';
export interface Custody { lead: string; precinct: string; heat: number; fine: number; kinds: string[]; options: Release[] }

export interface OutcomeEvents extends Record<string, unknown> {
  wasted: { lead: string; at: [number, number]; hospital: Place; bill: number; paid: number; debt: number; lostCash: number; ammoLost: { id: string; qty: number }[]; hoursLost: number; source: string | null };
  arrested: { lead: string; precinct: string; station: Place; fine: number; paid: number; confiscated: { id: string; qty: number }[]; cashTaken: number; hoursLost: number; kinds: string[]; heat: number; options: Release[]; priors: number };
  released: { lead: string; precinct: string; how: Release; by?: string; cents: number; hoursLost: number; propertyBack: boolean };
  propertyReturned: { lead: string; precinct: string; how: 'lawyer' | 'payoff' | 'desk' | 'clerk'; items: { id: string; qty: number }[]; cents: number; missing?: { id: string; qty: number }[] };
}

export class Outcomes extends Emitter<OutcomeEvents> {
  /** precinct -> lead -> items (and cash) held by the property clerk */
  readonly property = new Map<string, Map<string, { id: string; qty: number }[]>>();
  readonly heldCash = new Map<string, number>(); // `${precinct}|${lead}`
  readonly debt = new Map<string, number>();
  /** lead -> precinct -> arrest days (game days) */
  readonly records = new Map<string, Map<string, number[]>>();
  custody: Custody | null = null;
  day = 0;
  flag: (id: string) => boolean = () => false;
  constructor(private reg: Registry, private inv: Inventory, private health: HealthSystem, private police: Police, private rng: Rng) { super(); }

  // ------------------------------------------------------------------ death
  hospitalBill(healthId: string) {
    const s = this.health.state(healthId);
    let wear = 0; if (s) for (const v of Object.values(s.wear)) wear += Math.min(1, v);
    return Math.min(BILL_CAP, BILL_BASE + Math.round(wear * 2500));
  }
  wasted(lead: string, at: [number, number], source: string | null = null, healthId = lead) {
    const h = nearest(HOSPITALS, at);
    const bill = this.hospitalBill(healthId);
    const paid = this.inv.payUpTo(lead, bill, 'hospital');
    const debt = bill - paid;
    if (debt > 0) this.debt.set(lead, (this.debt.get(lead) ?? 0) + debt);
    // the attendants' cut
    const left = this.inv.ensure(lead).money;
    const lostCash = Math.floor(left * this.rng.range(0.1, 0.25));
    if (lostCash > 0) this.inv.spend(lead, lostCash, 'ambulance');
    // half the loose ammo (rounds in the guns stay)
    const ammoLost: { id: string; qty: number }[] = [];
    for (const it of this.inv.of(lead).items) {
      if (this.reg.item(it.id).kind !== 'ammo') continue;
      const q = Math.ceil(it.qty / 2); if (q > 0 && this.inv.take(lead, it.id, q)) ammoLost.push({ id: it.id, qty: q });
    }
    this.health.restore(healthId, DISCHARGE_HP);
    this.health.penalize(healthId, PENALTY, PENALTY_SECS);
    this.emit('wasted', { lead, at, hospital: h, bill, paid, debt, lostCash, ammoLost, hoursLost: 6, source });
  }

  // ------------------------------------------------------------------ arrest
  priors(lead: string, precinct: string) { return (this.records.get(lead)?.get(precinct) ?? []).filter((d) => this.day - d < RECORD_DECAY_DAYS).length; }
  arrested(lead: string, precinctId: string, heat: number, kinds: string[]) {
    const pct = this.police.pct(precinctId);
    const priors = this.priors(lead, precinctId);
    const recs = this.records.get(lead) ?? new Map(); this.records.set(lead, recs);
    recs.set(precinctId, [...(recs.get(precinctId) ?? []), this.day]);
    // property clerk: illicit items and a share of cash
    const held = this.inv.illicit(lead);
    for (const it of held) this.inv.take(lead, it.id, it.qty);
    if (held.length) {
      const room = this.property.get(precinctId) ?? new Map(); this.property.set(precinctId, room);
      room.set(lead, mergeItems(room.get(lead) ?? [], held));
    }
    const cashTaken = Math.floor(this.inv.ensure(lead).money * CLERK_CASH_SHARE);
    if (cashTaken) { this.inv.spend(lead, cashTaken, 'property clerk'); this.heldCash.set(`${precinctId}|${lead}`, (this.heldCash.get(`${precinctId}|${lead}`) ?? 0) + cashTaken); }
    const fine = Math.round(2500 * Math.max(1, heat) * (1 + 0.25 * priors));
    const officerDown = kinds.includes('officer_down');
    const options: Release[] = [];
    if (!officerDown && this.police.payoffOf(precinctId) >= 0.3 && heat < 4) options.push('desk');
    options.push('lawyer');
    if ([...this.reg.leads.keys()].some((l) => l !== lead && this.inv.ensure(l).money + this.inv.ensure(l).savings >= fine)) options.push('bail');
    options.push('night');
    this.custody = { lead, precinct: precinctId, heat, fine, kinds, options };
    this.emit('arrested', { lead, precinct: precinctId, station: { id: precinctId, name: pct.name, x: pct.station[0], z: pct.station[1], heading: 0 }, fine, paid: 0, confiscated: held, cashTaken, hoursLost: 0, kinds, heat, options, priors });
    // a well-paid house loses the paperwork
    if (!officerDown && this.police.payoffOf(precinctId) >= 0.5) this.returnProperty(lead, precinctId, 'payoff');
  }

  /** Choose how to get out of custody. `by` is the lead who comes down to bail (character switch). */
  release(how: Release, by?: string): boolean {
    const c = this.custody; if (!c || !c.options.includes(how)) return false;
    const { lead, precinct } = c;
    let cents = 0, hours = 0, back = false;
    if (how === 'desk') {
      const env = Math.round(expectedBribe(c.heat) * 1.5);
      const pct = this.police.pct(precinct);
      if (!this.rng.chance(Math.min(0.95, pct.corruptibility + this.police.payoffOf(precinct) * 0.5))) { c.options = c.options.filter((o) => o !== 'desk'); return false; }
      if (!this.inv.spend(lead, env, 'desk')) return false;
      cents = env; hours = 1; back = true;
    } else if (how === 'lawyer') {
      const fee = LAWYER_FEE + c.fine;
      if (!this.inv.spend(lead, fee, 'lawyer') && !(this.inv.withdraw(lead, Math.max(0, fee - this.inv.ensure(lead).money)) && this.inv.spend(lead, fee, 'lawyer'))) return false;
      cents = fee; hours = 3; back = true;
    } else if (how === 'bail') {
      if (!by || by === lead) return false;
      const b = this.inv.ensure(by);
      if (b.money < c.fine) { if (!this.inv.withdraw(by, c.fine - b.money)) return false; }
      if (!this.inv.spend(by, c.fine, `bail:${lead}`)) return false;
      cents = c.fine; hours = 2;
    } else { hours = 10; }
    this.custody = null;
    if (back) this.returnProperty(lead, precinct, how === 'desk' ? 'desk' : 'lawyer');
    this.emit('released', { lead, precinct, how, by, cents, hoursLost: hours, propertyBack: back });
    return true;
  }

  held(lead: string, precinct: string) { return this.property.get(precinct)?.get(lead) ?? []; }
  /** Later: the property clerk window. A fee, and maybe something "went missing". */
  retrieve(lead: string, precinct: string): boolean {
    if (!this.held(lead, precinct).length && !this.heldCash.get(`${precinct}|${lead}`)) return false;
    if (!this.inv.spend(lead, RETRIEVE_FEE, 'property clerk')) return false;
    const items = this.held(lead, precinct);
    const missing: { id: string; qty: number }[] = [];
    if (items.length && this.rng.chance(0.25)) { const i = this.rng.int(0, items.length - 1); const q = Math.max(1, Math.floor(items[i].qty / 2)); missing.push({ id: items[i].id, qty: q }); items[i] = { id: items[i].id, qty: items[i].qty - q }; }
    this.property.get(precinct)?.set(lead, items.filter((x) => x.qty > 0));
    this.returnProperty(lead, precinct, 'clerk', RETRIEVE_FEE, missing);
    return true;
  }
  /** Lawyer from the payphone (legacy single-call path): Nick always has one, others need flag.has_lawyer. */
  lawyer(lead: string, precinct: string): boolean {
    if (!this.held(lead, precinct).length) return false;
    if (!(this.reg.lead(lead).hiresMuscle || this.flag('flag.has_lawyer'))) return false;
    if (!this.inv.spend(lead, 5000, 'lawyer')) return false;
    this.returnProperty(lead, precinct, 'lawyer', 5000);
    return true;
  }
  /** An envelope for the desk sergeant after the fact: a corrupt desk returns the property; an honest one refuses (you keep the money). */
  desk(lead: string, precinct: string, cents: number): 'returned' | 'refused' {
    if (!this.held(lead, precinct).length) return 'refused';
    const pct = this.police.pct(precinct);
    const p = Math.min(0.95, (pct.corruptibility + this.police.payoffOf(precinct) * 0.4) * Math.min(1.3, cents / 4000));
    if (!this.rng.chance(p) || !this.inv.spend(lead, cents, 'desk')) return 'refused';
    this.returnProperty(lead, precinct, 'desk', cents);
    return 'returned';
  }
  private returnProperty(lead: string, precinct: string, how: 'lawyer' | 'payoff' | 'desk' | 'clerk', cents = 0, missing?: { id: string; qty: number }[]) {
    const items = this.held(lead, precinct);
    for (const it of items) this.inv.give(lead, it.id, it.qty);
    this.property.get(precinct)?.delete(lead);
    const k = `${precinct}|${lead}`, cash = this.heldCash.get(k) ?? 0;
    if (cash) { this.inv.addMoney(lead, cash, 'property returned'); this.heldCash.delete(k); }
    this.emit('propertyReturned', { lead, precinct, how, items, cents, missing });
  }

  serialize() {
    const prop: Record<string, Record<string, { id: string; qty: number }[]>> = {};
    for (const [p, m] of this.property) prop[p] = Object.fromEntries(m);
    const records: Record<string, Record<string, number[]>> = {};
    for (const [l, m] of this.records) records[l] = Object.fromEntries(m);
    return { property: prop, debt: Object.fromEntries(this.debt), heldCash: Object.fromEntries(this.heldCash), records, custody: this.custody, day: this.day };
  }
  deserialize(d: Partial<ReturnType<Outcomes['serialize']>>) {
    this.property.clear(); this.debt.clear(); this.heldCash.clear(); this.records.clear();
    for (const [p, m] of Object.entries(d?.property ?? {})) this.property.set(p, new Map(Object.entries(m)));
    for (const [k, v] of Object.entries(d?.debt ?? {})) this.debt.set(k, v);
    for (const [k, v] of Object.entries(d?.heldCash ?? {})) this.heldCash.set(k, v);
    for (const [l, m] of Object.entries(d?.records ?? {})) this.records.set(l, new Map(Object.entries(m)));
    this.custody = d?.custody ?? null; this.day = d?.day ?? 0;
  }
}
function nearest(ps: Place[], at: [number, number]) { return ps.reduce((a, b) => (Math.hypot(b.x - at[0], b.z - at[1]) < Math.hypot(a.x - at[0], a.z - at[1]) ? b : a)); }
function mergeItems(a: { id: string; qty: number }[], b: { id: string; qty: number }[]) {
  const m = new Map(a.map((x) => [x.id, x.qty]));
  for (const x of b) m.set(x.id, (m.get(x.id) ?? 0) + x.qty);
  return [...m].map(([id, qty]) => ({ id, qty }));
}
