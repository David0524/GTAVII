/**
 * Street vendors (STREET_VENDORS.md, user decision 2026-11-27): gameplay's side. Sim places the carts and
 * plays the vendors; gameplay owns what you can buy and what it does, the till, knocking carts over,
 * and three-card monte. Everyday prices are 1974 Midtown (a frank 35¢, a soda 25¢, a shine 50¢).
 * Brands are invented. Adults only.
 */
import type { Rng } from '../core/rng';

export type VendorKind =
  | 'hotdog' | 'pretzel_knish' | 'ices' | 'nuts' | 'fruit' | 'flowers' | 'newsstand' | 'coffee_cart'
  | 'shoeshine' | 'peddler_watches' | 'peddler_umbrellas' | 'peddler_trinkets' | 'peddler_records' | 'peddler_sunglasses'
  | 'monte';

/** What a sale does: eaten on the spot (hp, stamina, cools you in the heat) or carried (an inventory item). */
export interface VendorGood { id: string; name: string; cents: number; heal?: number; stamina?: number; cool?: number; sober?: number; item?: string; eatSeconds?: number }
const eat = (id: string, name: string, cents: number, o: Partial<VendorGood>): VendorGood => ({ id, name, cents, eatSeconds: 4, ...o });
const carry = (id: string, name: string, cents: number, item: string): VendorGood => ({ id, name, cents, item });

export const MENUS: Record<VendorKind, VendorGood[]> = {
  hotdog: [eat('frank', 'Frank with onions', 35, { heal: 6 }), eat('frank2', 'Two franks', 65, { heal: 11, eatSeconds: 7 }), eat('soda', 'Soda (bottle)', 25, { stamina: 8, cool: 0.1 })],
  pretzel_knish: [eat('pretzel', 'Hot pretzel', 25, { heal: 4 }), eat('knish', 'Potato knish', 40, { heal: 8, eatSeconds: 6 })],
  ices: [eat('lemon_ice', 'Lemon ice', 20, { stamina: 15, cool: 0.35 }), eat('cherry_ice', 'Cherry ice', 20, { stamina: 15, cool: 0.35 })],
  nuts: [eat('cashews', 'Hot cashews (bag)', 50, { heal: 3, stamina: 5 }), eat('peanuts', 'Roasted peanuts (bag)', 25, { heal: 2, stamina: 4 })],
  fruit: [eat('apple', 'Apple', 15, { heal: 2, stamina: 4 }), eat('peach', 'Peach', 20, { heal: 2, stamina: 6, cool: 0.05 })],
  flowers: [carry('carnation', 'A carnation', 50, 'item.flower'), carry('bunch', 'A bunch of flowers', 200, 'item.flowers')],
  newsstand: [carry('paper', 'Evening paper', 15, 'item.newspaper'), carry('cigs', 'Cigarettes (pack)', 55, 'item.cigarettes'), eat('candy', 'Candy bar', 15, { heal: 1, stamina: 4, eatSeconds: 2 }), carry('magazine', 'Magazine', 75, 'item.magazine')],
  coffee_cart: [eat('coffee', 'Coffee, regular', 25, { stamina: 12, sober: 0.08 }), eat('roll', 'Buttered roll', 20, { heal: 4 }), eat('danish', 'Danish', 35, { heal: 5 })],
  shoeshine: [],
  peddler_watches: [carry('watch', 'A "gold" watch from the coat', 1000, 'item.fake_watch')],
  peddler_umbrellas: [carry('umbrella', 'Umbrella', 200, 'item.umbrella')],
  peddler_trinkets: [carry('trinket', 'Big Town keychain', 100, 'item.trinket'), carry('pennant', 'Pennant', 150, 'item.pennant')],
  peddler_records: [carry('lp', 'LP (scratched sleeve)', 200, 'item.lp'), carry('eight_track', '8-track', 250, 'item.eight_track')],
  peddler_sunglasses: [carry('shades', 'Sunglasses', 300, 'item.sunglasses')],
  monte: [],
};
/** A shine: 50¢ and a tip; your shoes stay shined for the day (a grooming touch witnesses and NPCs notice). */
export const SHINE = { cents: 50, tip: 25, seconds: 20 } as const;

/**
 * The till: cash on hand by vendor kind (cents) when full, refilled by the takings over game hours. Peddlers and
 * the monte crew carry their cash on them (rob them, it's the same crime). A full hot-dog cart at lunch is a few
 * dollars; it's never a score (that's the point: a street robbery for small change still draws heat).
 */
export const TILL: Record<VendorKind, number> = {
  hotdog: 1800, pretzel_knish: 1200, ices: 900, nuts: 900, fruit: 1500, flowers: 2200, newsstand: 3500, coffee_cart: 1400,
  shoeshine: 600, peddler_watches: 6000, peddler_umbrellas: 1500, peddler_trinkets: 1200, peddler_records: 2000, peddler_sunglasses: 1800, monte: 8000,
};
export const TILL_REFILL_H = 6; // game hours from empty to full

export interface VendorState { id: string; kind: VendorKind; till: number; tillAt: number; overturnedUntil: number; robbedCount: number }

export class Vendors {
  readonly list = new Map<string, VendorState>();
  add(id: string, kind: VendorKind, nowH: number) { const v: VendorState = { id, kind, till: TILL[kind] * 0.6, tillAt: nowH, overturnedUntil: -1, robbedCount: 0 }; this.list.set(id, v); return v; }
  /** Cash in the till now, refilled toward full by the hours since it was last emptied. */
  till(v: VendorState, nowH: number) { return Math.min(TILL[v.kind], v.till + (TILL[v.kind] * (nowH - v.tillAt)) / TILL_REFILL_H); }
  open(v: VendorState, nowH: number) { return nowH >= v.overturnedUntil; }
  /** Take the till (the caller reports the crime). Returns cents. */
  rob(v: VendorState, nowH: number) { const c = Math.round(this.till(v, nowH)); v.till = 0; v.tillAt = nowH; v.robbedCount++; return c; }
  /** Knocked over: closed for a while, goods spilled. Hours closed by impact. */
  overturn(v: VendorState, nowH: number, hours = 2) { v.overturnedUntil = Math.max(v.overturnedUntil, nowH + hours); }
  serialize() { return [...this.list.values()]; }
  restore(d: VendorState[]) { this.list.clear(); for (const v of d ?? []) this.list.set(v.id, { ...v }); }
}

/**
 * Three-card monte (the Deuce, Times Square). It's a scam: the dealer palms the money card on a real bet, so
 * you lose, unless you catch the TELL, a brief moment in the deal where the bent corner of the queen shows.
 * Press within the tell window to follow the right card: a sharp eye (stealth skill, sober) widens the window.
 * The shill wins small to draw you in; win twice and the dealer folds the box and the lookout moves you on.
 */
export const MONTE = { minStake: 200, maxStake: 2000, tellSeconds: 0.35, dealSeconds: 4, shillWinChance: 1, foldAfterWins: 2 } as const;
export interface MonteDeal { id: number; stake: number; tellAt: number; tellWindow: number; queen: 0 | 1 | 2; shownQueen: 0 | 1 | 2 }
export class Monte {
  wins = 0; folded = false; private seq = 0;
  constructor(private rng: Rng) {}
  /** Deal one hand. `eye` 0..1 from stealth and sobriety widens the tell. */
  deal(stake: number, eye: number): MonteDeal | null {
    if (this.folded || stake < MONTE.minStake || stake > MONTE.maxStake) return null;
    const queen = this.rng.int(0, 2) as 0 | 1 | 2;
    // the card the deal shows you is never the queen on a real bet (the palm)
    const shownQueen = ((queen + 1 + this.rng.int(0, 1)) % 3) as 0 | 1 | 2;
    return { id: this.seq++, stake, tellAt: this.rng.range(0.8, MONTE.dealSeconds - 0.8), tellWindow: MONTE.tellSeconds * (0.6 + 0.8 * eye), queen, shownQueen };
  }
  /**
   * Pick a card. `pressedAt` is when (seconds into the deal) the player pressed to follow; a press inside the tell
   * window means they saw the bent corner and pick the true queen whatever `card` says. Returns net cents.
   */
  pick(d: MonteDeal, card: 0 | 1 | 2, pressedAt: number | null): { won: boolean; net: number; folded: boolean } {
    const caught = pressedAt !== null && pressedAt >= d.tellAt && pressedAt <= d.tellAt + d.tellWindow;
    void card; // without the tell, whichever card you point at, the palm means it isn't the queen
    const won = caught;
    if (won) { this.wins++; if (this.wins >= MONTE.foldAfterWins) this.folded = true; }
    return { won, net: won ? d.stake : -d.stake, folded: this.folded };
  }
}
