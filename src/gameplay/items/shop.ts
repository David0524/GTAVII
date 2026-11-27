import { Emitter } from '../core/events';
import type { Inventory } from './inventory';
import type { Registry } from './registry';

/**
 * Shops. Invariants (tested): money and goods are conserved; nothing goes negative; buy-then-sell never
 * profits (buyback < 1 ≤ markup); stock never goes below zero; unlimited stock (-1) stays unlimited;
 * a failed transaction changes nothing.
 */
export type ShopFail = 'unknown' | 'not_stocked' | 'no_stock' | 'no_money' | 'full' | 'locked' | 'closed' | 'not_buying' | 'not_owned' | 'bad_qty';
export interface ShopResult { ok: boolean; reason?: ShopFail; cents?: number; qty?: number }
export interface ShopEvents extends Record<string, unknown> {
  bought: { lead: string; shop: string; item: string; qty: number; cents: number };
  sold: { lead: string; shop: string; item: string; qty: number; cents: number };
  outfitBought: { lead: string; shop: string; outfit: string; cents: number };
}

export class Shops extends Emitter<ShopEvents> {
  private stock = new Map<string, Map<string, number>>();
  flag: (id: string) => boolean = () => false;
  /** minutes since midnight provider (engine clock); shops with hours close outside them */
  clock: () => number | null = () => null;

  constructor(private reg: Registry, private inv: Inventory) {
    super();
    for (const s of reg.shops.values()) this.stock.set(s.id, new Map(s.stock.map((x) => [x.item, x.qty])));
  }
  /** Overnight: shops and fences restock up to their listed stock (never above, never removing what's there). */
  restock() {
    for (const s of this.reg.shops.values()) { const st = this.stock.get(s.id)!; for (const x of s.stock) { const cur = st.get(x.item)!; if (cur !== -1 && cur < x.qty) st.set(x.item, x.qty); } }
  }
  stockOf(shop: string, item: string) { return this.stock.get(shop)?.get(item); }
  listing(shop: string) {
    const s = this.reg.shops.get(shop); if (!s) return [];
    return s.stock.map((st) => ({ item: st.item, name: this.reg.item(st.item).name, price: this.price(shop, st.item)!, qty: this.stock.get(shop)!.get(st.item)! }));
  }
  price(shop: string, item: string): number | null {
    const s = this.reg.shops.get(shop); const st = s?.stock.find((x) => x.item === item);
    if (!s || !st) return null;
    return st.price ?? Math.round(this.reg.item(item).price * s.markup);
  }
  sellPrice(shop: string, item: string): number | null {
    const s = this.reg.shops.get(shop), d = this.reg.items.get(item);
    if (!s || !d || !d.sellable || s.buyback <= 0) return null;
    if (s.buysKinds && !s.buysKinds.includes(d.kind)) return null;
    const unit = d.kind === 'ammo' ? d.price / (d.rounds ?? 1) : d.price; // ammo sells per round
    return Math.floor(unit * s.buyback);
  }
  isOpen(shop: string) {
    const s = this.reg.shops.get(shop); if (!s) return false;
    const now = this.clock(); if (!s.hours || now === null) return true;
    const [a, b] = s.hours.map((h) => { const [H, M] = h.split(':').map(Number); return H * 60 + M; });
    return a <= b ? now >= a && now < b : now >= a || now < b;
  }
  private gate(shop: string): ShopFail | null {
    const s = this.reg.shops.get(shop);
    if (!s) return 'unknown';
    if (s.requiresFlag && !this.flag(s.requiresFlag)) return 'locked';
    if (!this.isOpen(shop)) return 'closed';
    return null;
  }

  buy(lead: string, shop: string, item: string, qty = 1): ShopResult {
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'bad_qty' };
    const g = this.gate(shop); if (g) return { ok: false, reason: g };
    const price = this.price(shop, item); if (price === null) return { ok: false, reason: 'not_stocked' };
    const st = this.stock.get(shop)!, have = st.get(item)!;
    if (have !== -1 && have < qty) return { ok: false, reason: 'no_stock' };
    const def = this.reg.item(item);
    const units = def.kind === 'ammo' ? (def.rounds ?? 1) * qty : qty;
    const cap = def.kind === 'weapon' ? 1 : def.stack;
    if (this.inv.count(lead, item) + units > cap) return { ok: false, reason: 'full' };
    const cost = price * qty;
    if (!this.inv.spend(lead, cost, `shop:${shop}`)) return { ok: false, reason: 'no_money' };
    this.inv.give(lead, item, units);
    if (have !== -1) st.set(item, have - qty);
    this.emit('bought', { lead, shop, item, qty, cents: cost });
    return { ok: true, cents: cost, qty: units };
  }

  sell(lead: string, shop: string, item: string, qty = 1): ShopResult {
    if (!Number.isInteger(qty) || qty < 1) return { ok: false, reason: 'bad_qty' };
    const g = this.gate(shop); if (g) return { ok: false, reason: g };
    const unit = this.sellPrice(shop, item); if (unit === null) return { ok: false, reason: 'not_buying' };
    if (!this.inv.has(lead, item, qty)) return { ok: false, reason: 'not_owned' };
    this.inv.take(lead, item, qty);
    const cents = unit * qty;
    this.inv.addMoney(lead, cents, `sell:${shop}`);
    const st = this.stock.get(shop)!;
    const def = this.reg.item(item);
    if (def.kind !== 'ammo') { const cur = st.get(item); if (cur !== undefined && cur !== -1) st.set(item, cur + qty); }
    this.emit('sold', { lead, shop, item, qty, cents });
    return { ok: true, cents, qty };
  }

  /** Clothing stores sell outfits: owned from then on, stored at home, and worn out of the store. */
  buyOutfit(lead: string, shop: string, outfit: string): ShopResult {
    const s = this.reg.shops.get(shop); if (!s || s.kind !== 'clothing') return { ok: false, reason: 'unknown' };
    const g = this.gate(shop); if (g) return { ok: false, reason: g };
    const o = this.reg.outfits.get(outfit); if (!o) return { ok: false, reason: 'not_stocked' };
    if (o.leads && o.leads.length && !o.leads.includes(lead)) return { ok: false, reason: 'not_stocked' };
    const l = this.inv.ensure(lead);
    if (l.outfits.has(outfit)) return { ok: false, reason: 'full' };
    const cost = Math.round(o.price * s.markup);
    if (!this.inv.spend(lead, cost, `shop:${shop}`)) return { ok: false, reason: 'no_money' };
    l.outfits.add(outfit);
    this.emit('outfitBought', { lead, shop, outfit, cents: cost });
    return { ok: true, cents: cost };
  }

  serialize() { const o: Record<string, Record<string, number>> = {}; for (const [s, m] of this.stock) o[s] = Object.fromEntries(m); return o; }
  deserialize(d: Record<string, Record<string, number>>) {
    for (const [s, m] of Object.entries(d ?? {})) { const st = this.stock.get(s); if (!st) continue; for (const [i, q] of Object.entries(m)) if (st.has(i)) st.set(i, q); }
  }
}
