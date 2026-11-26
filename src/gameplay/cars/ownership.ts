import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import type { Inventory } from '../items/inventory';
import type { Cars } from './theft';

/**
 * Owning cars (HOMES_AND_CARS). 1974 money, 1974 hassles:
 *  - Used-car lot: weekly stock (seeded by week), asking prices by class × condition, HAGGLING (the
 *    dealer has a floor and runs out of patience after three lowballs).
 *  - Newspaper classifieds: private sellers, cheaper, condition HIDDEN until you inspect (a range that
 *    narrows to the truth). Phone the number, meet at the curb (the narrative/engine flow).
 *  - Titles: buying makes the lead the owner (no more theft reports); selling back to a lot pays ~55%.
 *    Lend a car to another lead.
 *  - Alternate-side parking: a car left on the street during the cleaning window gets a $15 ticket.
 *    Three unpaid → the boot; booted a day → towed to the pound ($40 + $5/day storage).
 *  - A monthly garage space keeps a car off the street (no tickets).
 */
export const PRICE: Record<string, number> = { sedan: 120000, compact: 90000, wagon: 110000, hardtop: 160000, taxi: 70000, box_truck: 180000, step_van: 150000 };
export const TICKET = 1500, BOOT_AT = 3, TOW_AFTER_H = 24, POUND_FEE = 4000, POUND_DAY = 500, GARAGE_MONTH = 6000;
/** Alternate-side cleaning: Mon/Thu 8–11 a.m. on our side streets (day 0 = Friday 21 June 1974). */
export function cleaningWindow(day: number, minutes: number) { const dow = (day + 5) % 7; return (dow === 1 || dow === 4) && minutes >= 8 * 60 && minutes < 11 * 60; }

export interface Listing { id: string; vclass: string; colour: string; condition: number; ask: number; seller: 'lot' | 'private'; known: [number, number]; patience: number; floor: number }
export interface Owned { car: string; owner: string; parked: 'street' | 'garage' | 'pound'; tickets: number; booted: boolean; bootedAt: number; impoundedDay: number; garageUntilDay: number }
export interface OwnEvents extends Record<string, unknown> {
  bought: { lead: string; car: string; cents: number; from: 'lot' | 'private' };
  sold: { lead: string; car: string; cents: number };
  ticket: { car: string; owner: string; tickets: number };
  booted: { car: string };
  towed: { car: string };
  released: { car: string; cents: number };
}

export class Ownership extends Emitter<OwnEvents> {
  readonly owned = new Map<string, Owned>();
  private week = -1;
  lot: Listing[] = [];
  classifieds: Listing[] = [];
  private seq = 1;
  constructor(private inv: Inventory, private cars: Cars) { super(); }

  /** Value of a car by class and condition (cents). */
  value(vclass: string, condition: number) { return Math.round((PRICE[vclass] ?? 100000) * (0.35 + 0.65 * condition)); }

  /** Regenerate the lot and the classifieds for a week (deterministic per week). */
  restockWeek(week: number) {
    if (week === this.week) return;
    this.week = week;
    const rng = new Rng(0x7400 + week);
    const classes = Object.keys(PRICE), colours = ['tan', 'green', 'maroon', 'cream', 'brown', 'white', 'harvest gold', 'avocado', 'powder blue', 'black'];
    const mk = (seller: 'lot' | 'private'): Listing => {
      const vclass = rng.pick(classes.filter((c) => c !== 'taxi' || seller === 'private'));
      const condition = +rng.range(seller === 'lot' ? 0.45 : 0.2, seller === 'lot' ? 0.9 : 0.95).toFixed(2);
      const v = this.value(vclass, condition);
      // lots ask over value and know their cars; private sellers ask near value and don't say how bad it is
      const ask = Math.round(seller === 'lot' ? v * rng.range(1.15, 1.35) : v * rng.range(0.85, 1.1));
      const known: [number, number] = seller === 'lot' ? [condition, condition] : [Math.max(0, condition - 0.3), Math.min(1, condition + 0.3)];
      return { id: `listing${week}_${this.seq++}`, vclass, colour: rng.pick(colours), condition, ask, seller, known, patience: 3, floor: Math.round(ask * (seller === 'lot' ? rng.range(0.8, 0.9) : rng.range(0.75, 0.92))) };
    };
    this.lot = Array.from({ length: 6 }, () => mk('lot'));
    this.classifieds = Array.from({ length: 5 }, () => mk('private'));
  }
  /** Look it over (or take a test drive): the condition range narrows to the truth. */
  inspect(id: string) { const l = this.find(id); if (!l) return null; l.known = [+(l.condition - 0.05).toFixed(2), +(l.condition + 0.05).toFixed(2)]; return l.known; }
  private find(id: string) { return this.lot.find((l) => l.id === id) ?? this.classifieds.find((l) => l.id === id) ?? null; }

  /** Make an offer. 'sold' at or over the floor; 'counter' with a new ask; 'walk' when patience runs out. */
  offer(lead: string, id: string, cents: number): { result: 'sold' | 'counter' | 'walk' | 'broke'; ask?: number; car?: string } {
    const l = this.find(id); if (!l || l.patience <= 0) return { result: 'walk' };
    if (cents >= l.floor) {
      if (!this.inv.spend(lead, cents, `car:${l.seller}`)) return { result: 'broke' };
      const car = `car_${l.id}`;
      this.cars.add({ id: car, vclass: l.vclass, colour: l.colour, condition: l.condition, owner: lead, locked: true, keysIn: false });
      this.owned.set(car, { car, owner: lead, parked: 'street', tickets: 0, booted: false, bootedAt: -1, impoundedDay: -1, garageUntilDay: -1 });
      this.lot = this.lot.filter((x) => x !== l); this.classifieds = this.classifieds.filter((x) => x !== l);
      this.emit('bought', { lead, car, cents, from: l.seller });
      return { result: 'sold', car };
    }
    l.patience--;
    if (l.patience <= 0) return { result: 'walk' };
    l.ask = Math.max(l.floor, Math.round(l.ask - (l.ask - cents) * 0.3));
    return { result: 'counter', ask: l.ask };
  }
  /** Sell to a lot: ~55% of value by condition (boots and impounds must be cleared first). */
  sell(lead: string, car: string) {
    const o = this.owned.get(car), c = this.cars.cars.get(car);
    if (!o || o.owner !== lead || !c || o.booted || o.parked === 'pound') return 0;
    const cents = Math.round(this.value(c.vclass, c.condition) * 0.55);
    this.inv.addMoney(lead, cents, 'car sale');
    this.owned.delete(car); c.owner = 'npc';
    this.emit('sold', { lead, car, cents });
    return cents;
  }
  lend(car: string, from: string, to: string) { const o = this.owned.get(car), c = this.cars.cars.get(car); if (!o || o.owner !== from || !c) return false; o.owner = to; c.owner = to; return true; }
  rentGarage(lead: string, car: string, today: number) { const o = this.owned.get(car); if (!o || o.owner !== lead || !this.inv.spend(lead, GARAGE_MONTH, 'garage')) return false; o.parked = 'garage'; o.garageUntilDay = today + 30; return true; }
  parkOnStreet(car: string) { const o = this.owned.get(car); if (o && o.parked !== 'pound') o.parked = 'street'; }
  payTickets(lead: string, car: string) { const o = this.owned.get(car); if (!o || !o.tickets) return false; if (!this.inv.spend(lead, o.tickets * TICKET, 'tickets')) return false; o.tickets = 0; o.booted = false; return true; }
  /** Get it out of the pound: fee + storage + any tickets. */
  release(lead: string, car: string, today: number) {
    const o = this.owned.get(car); if (!o || o.parked !== 'pound') return false;
    const cents = POUND_FEE + POUND_DAY * Math.max(0, today - o.impoundedDay) + o.tickets * TICKET;
    if (!this.inv.spend(lead, cents, 'pound')) return false;
    o.parked = 'street'; o.tickets = 0; o.booted = false; o.impoundedDay = -1;
    this.emit('released', { car, cents });
    return true;
  }

  /** The sim's parking layer writes the tickets (its parkingRule knows each kerb); gameplay keeps fines, boot and pound. */
  externalTickets = false;
  /** A ticket written by the sim's parking enforcement. */
  addTicket(car: string, d: number, hourOfDay: number) {
    const o = this.owned.get(car); if (!o || o.parked !== 'street') return false;
    o.tickets++; this.emit('ticket', { car: o.car, owner: o.owner, tickets: o.tickets });
    if (!o.booted && o.tickets >= BOOT_AT) { o.booted = true; o.bootedAt = d * 24 + hourOfDay; this.emit('booted', { car: o.car }); }
    return true;
  }
  /** Towed (by the sim's tow truck, or after a day in the boot). */
  tow(car: string, d: number) { const o = this.owned.get(car); if (!o || o.parked === 'pound') return false; o.parked = 'pound'; o.impoundedDay = d; this.emit('towed', { car: o.car }); return true; }
  /** Game time passes (call on every timeAdvanced and periodically in play): tickets, boots, tows, garage expiry. */
  advance(fromDay: number, fromMin: number, toDay: number, toMin: number) {
    for (let d = fromDay; d <= toDay; d++) {
      const a = d === fromDay ? fromMin : 0, b = d === toDay ? toMin : 24 * 60;
      if (b <= a) continue;
      const hit = cleaningWindow(d, Math.max(a, 8 * 60)) && Math.max(a, 8 * 60) < Math.min(b, 11 * 60);
      for (const o of this.owned.values()) {
        if (o.parked === 'garage' && d > o.garageUntilDay) o.parked = 'street';
        if (o.parked !== 'street') continue;
        if (hit && !this.externalTickets) { o.tickets++; this.emit('ticket', { car: o.car, owner: o.owner, tickets: o.tickets }); }
        if (!o.booted && o.tickets >= BOOT_AT) { o.booted = true; o.bootedAt = d * 24 + Math.max(a, 8 * 60) / 60; this.emit('booted', { car: o.car }); }
        if (o.booted && d * 24 + b / 60 - o.bootedAt >= TOW_AFTER_H) { o.parked = 'pound'; o.impoundedDay = d; this.emit('towed', { car: o.car }); }
      }
    }
  }
  serialize() { return { owned: [...this.owned.values()], week: -1 }; }
  deserialize(d: ReturnType<Ownership['serialize']>) { this.owned.clear(); for (const o of d?.owned ?? []) this.owned.set(o.car, o); }
}
