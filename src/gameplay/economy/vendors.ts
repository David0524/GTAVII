/**
 * Street vendors (STREET_VENDORS.md, user decision 2026-11-27): gameplay's side. Sim places the carts and
 * plays the vendors; gameplay owns what you can buy and what it does, the till, knocking carts over,
 * and three-card monte. Everyday prices are 1974 Midtown (a frank 35¢, a soda 25¢, a shine 50¢).
 * Brands are invented. Adults only.
 */
import type { Rng } from '../core/rng';

/** Narrative's vendor types (content/vendors.json `menus` keys; sim uses the same). */
export type VendorKind =
  | 'hot_dog' | 'pretzel_knish' | 'italian_ice' | 'nut_roaster' | 'coffee_cart' | 'fruit_stand' | 'flower_stand'
  | 'newsstand' | 'shoeshine' | 'peddler' | 'monte';
export const VENDOR_KINDS: readonly VendorKind[] = ['hot_dog', 'pretzel_knish', 'italian_ice', 'nut_roaster', 'coffee_cart', 'fruit_stand', 'flower_stand', 'newsstand', 'shoeshine', 'peddler', 'monte'];

/** A sale: eaten on the spot (hp, stamina, cools you in the heat, sobers) or carried (an inventory item). */
export interface VendorGood { id: string; name: string; cents: number; heal?: number; stamina?: number; cool?: number; sober?: number; item?: string; eatSeconds?: number; rainOnly?: boolean }
export type VendorMenus = Record<VendorKind, VendorGood[]>;

/**
 * MENUS AND PRICES ARE NARRATIVE'S (content/vendors.json, the single source of truth). Gameplay only owns what a
 * good DOES, keyed by its id: `<vendor type>.<slug of the item name>` (e.g. 'hot_dog.frank'). A good in the file
 * with no row here gets its vendor type's default from the file's `vendors[].health / stamina`.
 */
export const EFFECTS: Record<string, Partial<VendorGood>> = {
  'hot_dog.frank': { heal: 6 }, 'hot_dog.frank_with_kraut_or_onions': { heal: 7 }, 'hot_dog.soda': { stamina: 8, cool: 0.1, eatSeconds: 3 }, 'hot_dog.knish': { heal: 8, eatSeconds: 6 },
  'pretzel_knish.hot_pretzel': { heal: 4 }, 'pretzel_knish.two_pretzels': { heal: 7, eatSeconds: 6 }, 'pretzel_knish.potato_knish': { heal: 8, eatSeconds: 6 }, 'pretzel_knish.kasha_knish': { heal: 8, eatSeconds: 6 },
  'italian_ice.small_ice': { stamina: 12, cool: 0.3 }, 'italian_ice.large_ice': { stamina: 18, cool: 0.45 }, 'italian_ice.rainbow_three_flavours': { stamina: 18, cool: 0.5 },
  'nut_roaster.cashews_bag': { heal: 3, stamina: 5 }, 'nut_roaster.peanuts_bag': { heal: 2, stamina: 4 }, 'nut_roaster.almonds_bag': { heal: 3, stamina: 5 },
  'coffee_cart.coffee': { stamina: 12, sober: 0.08, eatSeconds: 3 }, 'coffee_cart.tea': { stamina: 8, sober: 0.04, eatSeconds: 3 }, 'coffee_cart.buttered_roll': { heal: 4 }, 'coffee_cart.danish': { heal: 5 },
  'fruit_stand.apple': { heal: 2, stamina: 4 }, 'fruit_stand.peach': { heal: 2, stamina: 6, cool: 0.05 }, 'fruit_stand.banana': { heal: 2, stamina: 5 }, 'fruit_stand.bag_of_cherries': { heal: 3, stamina: 6, cool: 0.05 },
  'flower_stand.carnation': { item: 'item.flower' }, 'flower_stand.bunch_of_daisies': { item: 'item.flowers' }, 'flower_stand.a_dozen_roses': { item: 'item.roses' },
  'newsstand.daily_ticker': { item: 'item.newspaper' }, 'newsstand.manhattan_evening_dispatch': { item: 'item.newspaper' }, 'newsstand.cigarettes_pack': { item: 'item.cigarettes' },
  'newsstand.candy_bar': { heal: 1, stamina: 4, eatSeconds: 2 }, 'newsstand.gum': { stamina: 2, eatSeconds: 1 },
  'peddler.umbrella_rain_only': { item: 'item.umbrella', rainOnly: true }, 'peddler.sunglasses': { item: 'item.sunglasses' }, 'peddler.gold_watch': { item: 'item.fake_watch' },
  'peddler.8_track_tape_no_label': { item: 'item.eight_track' }, 'peddler.souvenir_pennant': { item: 'item.pennant' },
  // shoeshine goods are services (see shine below)
  'shoeshine.shine': {}, 'shoeshine.shine_and_tip': {},
};
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const goodId = (kind: string, item: string) => `${kind}.${slug(item)}`;
/** "35¢" -> 35, "$1.00" -> 100. */
export function parsePrice(p: string): number {
  const t = p.trim();
  if (t.endsWith('¢')) return Math.round(parseFloat(t));
  return Math.round(parseFloat(t.replace('$', '')) * 100);
}
/** Load narrative's vendors.json into menus. `warn` lists goods with no effects row (they get the type default). */
export function loadVendorMenus(json: { menus?: Record<string, { item: string; price: string }[]>; vendors?: { type: string; health?: number; stamina?: number }[] }, warn: (m: string) => void = () => {}): VendorMenus {
  const out = Object.fromEntries(VENDOR_KINDS.map((k) => [k, [] as VendorGood[]])) as VendorMenus;
  const def = new Map((json.vendors ?? []).map((v) => [v.type, v]));
  for (const [kind, items] of Object.entries(json.menus ?? {})) {
    if (!(VENDOR_KINDS as readonly string[]).includes(kind)) { warn(`vendor type ${kind}: unknown to gameplay`); continue; }
    for (const x of items) {
      const id = goodId(kind, x.item), fx = EFFECTS[id];
      if (!fx) warn(`${id}: no effects row; using the ${kind} default`);
      const d = def.get(kind);
      out[kind as VendorKind].push({ id, name: x.item, cents: parsePrice(x.price), eatSeconds: 4, ...(fx ?? { heal: d?.health ?? 0, stamina: d?.stamina ?? 0 }) });
    }
  }
  return out;
}
/** A shine: the price comes from the file (the 'Shine' row); a quarter tip on top; shined shoes for the day. */
export const SHINE = { tip: 25, seconds: 20 } as const;

/**
 * The till: cash on hand by vendor kind (cents) when full, refilled by the takings over game hours. Peddlers and
 * the monte crew carry their cash on them (rob them, it's the same crime). A full hot-dog cart at lunch is a few
 * dollars; it's never a score (that's the point: a street robbery for small change still draws heat).
 */
export const TILL: Record<VendorKind, number> = {
  hot_dog: 1800, pretzel_knish: 1200, italian_ice: 900, nut_roaster: 900, coffee_cart: 1400, fruit_stand: 1500, flower_stand: 2200,
  newsstand: 3500, shoeshine: 600, peddler: 4000, monte: 8000,
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
