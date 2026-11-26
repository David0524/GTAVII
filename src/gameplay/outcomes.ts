import { Emitter } from './core/events';
import type { Rng } from './core/rng';
import type { HealthSystem } from './health/Health';
import type { Inventory } from './items/inventory';
import type { Registry } from './items/registry';
import type { Police } from './police/police';

/**
 * Being wasted and being arrested. Both are fast (a 2–3 s title card on every device), cost money
 * and time rather than progress, and never lose more than the last checkpoint (the engine reloads
 * mission state from its checkpoint; gameplay only charges the bill and holds confiscated goods).
 *
 * Wasted → nearest hospital: bill (scaled by injuries, paid as far as cash allows; the rest is a debt
 * narrative can collect), discharged at 60% hp with injuries treated, +6 h.
 * Arrested → the house that made the arrest: illicit items go to the property room; fine/bail by heat;
 * a night in the tank (+8 h). Getting the property back: a lawyer (Nick, or flag.has_lawyer) for a fee,
 * free if that house is well paid (payoff ≥ 0.5), or a desk-sergeant envelope that a corrupt desk takes.
 */
export interface Place { id: string; name: string; x: number; z: number; heading: number }
export const HOSPITALS: Place[] = [
  { id: 'hospital.west', name: 'Tenth Avenue Hospital', x: -1150, z: -560, heading: Math.PI / 2 },
  { id: 'hospital.east', name: 'Gramercy Infirmary', x: 300, z: 60, heading: -Math.PI / 2 },
];
export interface OutcomeEvents extends Record<string, unknown> {
  wasted: { lead: string; at: [number, number]; hospital: Place; bill: number; paid: number; debt: number; hoursLost: number; source: string | null };
  arrested: { lead: string; precinct: string; station: Place; fine: number; paid: number; confiscated: { id: string; qty: number }[]; hoursLost: number; kinds: string[]; heat: number };
  propertyReturned: { lead: string; precinct: string; how: 'lawyer' | 'payoff' | 'desk'; items: { id: string; qty: number }[]; cents: number };
}

export class Outcomes extends Emitter<OutcomeEvents> {
  /** precinct -> lead -> items held in the property room */
  readonly property = new Map<string, Map<string, { id: string; qty: number }[]>>();
  readonly debt = new Map<string, number>();
  flag: (id: string) => boolean = () => false;
  constructor(private reg: Registry, private inv: Inventory, private health: HealthSystem, private police: Police, private rng: Rng) { super(); }

  hospitalBill(lead: string) {
    const s = this.health.state(lead);
    let wear = 0; if (s) for (const v of Object.values(s.wear)) wear += Math.min(1, v);
    return 8500 + Math.round(wear * 2500);
  }
  wasted(lead: string, at: [number, number], source: string | null = null) {
    const h = nearest(HOSPITALS, at);
    const bill = this.hospitalBill(lead);
    const paid = this.inv.payUpTo(lead, bill, 'hospital');
    const debt = bill - paid;
    if (debt > 0) this.debt.set(lead, (this.debt.get(lead) ?? 0) + debt);
    this.health.restore(lead, 0.6);
    this.emit('wasted', { lead, at, hospital: h, bill, paid, debt, hoursLost: 6, source });
  }

  arrested(lead: string, precinctId: string, heat: number, kinds: string[]) {
    const pct = this.police.pct(precinctId);
    const held = this.inv.illicit(lead);
    for (const it of held) this.inv.take(lead, it.id, it.qty);
    if (held.length) {
      const room = this.property.get(precinctId) ?? new Map(); this.property.set(precinctId, room);
      room.set(lead, mergeItems(room.get(lead) ?? [], held));
    }
    const fine = Math.round(2500 * Math.max(1, heat));
    const paid = this.inv.payUpTo(lead, fine, 'fine');
    if (fine - paid > 0) this.debt.set(lead, (this.debt.get(lead) ?? 0) + fine - paid);
    this.emit('arrested', { lead, precinct: precinctId, station: { id: precinctId, name: pct.name, x: pct.station[0], z: pct.station[1], heading: 0 }, fine, paid, confiscated: held, hoursLost: 8, kinds, heat });
    // a well-paid house loses the paperwork
    if (this.police.payoffOf(precinctId) >= 0.5) this.returnProperty(lead, precinctId, 'payoff');
  }

  held(lead: string, precinct: string) { return this.property.get(precinct)?.get(lead) ?? []; }

  /** Lawyer: Nick always has one; others need flag.has_lawyer. $50 retainer. */
  lawyer(lead: string, precinct: string): boolean {
    if (!this.held(lead, precinct).length) return false;
    if (!(this.reg.lead(lead).hiresMuscle || this.flag('flag.has_lawyer'))) return false;
    if (!this.inv.spend(lead, 5000, 'lawyer')) return false;
    this.returnProperty(lead, precinct, 'lawyer', 5000);
    return true;
  }
  /** An envelope for the desk sergeant: a corrupt desk takes it and returns the property; an honest one refuses (you keep the money). */
  desk(lead: string, precinct: string, cents: number): 'returned' | 'refused' {
    if (!this.held(lead, precinct).length) return 'refused';
    const pct = this.police.pct(precinct);
    const p = Math.min(0.95, (pct.corruptibility + this.police.payoffOf(precinct) * 0.4) * Math.min(1.3, cents / 4000));
    if (!this.rng.chance(p) || !this.inv.spend(lead, cents, 'desk')) return 'refused';
    this.returnProperty(lead, precinct, 'desk', cents);
    return 'returned';
  }
  private returnProperty(lead: string, precinct: string, how: 'lawyer' | 'payoff' | 'desk', cents = 0) {
    const items = this.held(lead, precinct);
    for (const it of items) this.inv.give(lead, it.id, it.qty);
    this.property.get(precinct)?.delete(lead);
    this.emit('propertyReturned', { lead, precinct, how, items, cents });
  }

  serialize() {
    const prop: Record<string, Record<string, { id: string; qty: number }[]>> = {};
    for (const [p, m] of this.property) prop[p] = Object.fromEntries(m);
    return { property: prop, debt: Object.fromEntries(this.debt) };
  }
  deserialize(d: ReturnType<Outcomes['serialize']>) {
    this.property.clear(); this.debt.clear();
    for (const [p, m] of Object.entries(d?.property ?? {})) this.property.set(p, new Map(Object.entries(m)));
    for (const [k, v] of Object.entries(d?.debt ?? {})) this.debt.set(k, v);
  }
}
function nearest(ps: Place[], at: [number, number]) { return ps.reduce((a, b) => (Math.hypot(b.x - at[0], b.z - at[1]) < Math.hypot(a.x - at[0], a.z - at[1]) ? b : a)); }
function mergeItems(a: { id: string; qty: number }[], b: { id: string; qty: number }[]) {
  const m = new Map(a.map((x) => [x.id, x.qty]));
  for (const x of b) m.set(x.id, (m.get(x.id) ?? 0) + x.qty);
  return [...m].map(([id, qty]) => ({ id, qty }));
}
