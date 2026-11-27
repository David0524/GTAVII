/**
 * Gameplay's section of the engine's versioned save (ENGINE_REQUESTS "From gameplay: 1").
 * The engine stores `gameplay: unknown` and hands it back; gameplay owns the shape and its migrations.
 *
 *  v1  the engine's draft per-character shape (ENGINE_RESPONSES N5): characters[id] = { money (DOLLARS,
 *      float), inventory: string[] (item ids, one each), at, wardrobe }.
 *  v2  first gameplay shape: leads[id] = { money (cents), items:[{id,qty}], outfits, wearing }, payoffs.
 *  v3  full systems (inventory with loaded rounds/equipped/armor/plates, health per lead,
 *      police reports + payoffs, shop stock, phones, props, outcomes).
 *  v4  current: + savings, gun instance state (tier/condition/jam), home stash, skills, stamina,
 *      arrest records, custody, max-health penalty. All additive: v3 → v4 fills defaults on load.
 * Migrations are pure functions, applied in order; unknown future versions are rejected (never guessed).
 */
import type { SavedLeadInv } from './items/inventory';

export const SAVE_VERSION = 4;

export interface SaveV1 { characters: Record<string, { money: number; inventory: string[]; at?: unknown; wardrobe?: string }>; activeCharacter?: string }
export interface SaveV2 { v: 2; leads: Record<string, { money: number; items: { id: string; qty: number }[]; outfits: string[]; wearing: string }>; payoffs?: Record<string, number> }
export interface SaveV3 {
  v: 3 | 4;
  inventory: Record<string, SavedLeadInv>;
  health: Record<string, unknown>;
  police: unknown;
  shops: Record<string, Record<string, number>>;
  phones: unknown;
  props: unknown;
  outcomes: unknown;
  cars?: unknown;
  ownership?: unknown;
  stats?: unknown;
  economy?: unknown;
  /** arcade credits and high-score cards (optional; absent in older saves) */
  arcade?: unknown;
  /** street vendors' tills and overturned carts */
  vendors?: unknown;
  /** purchases per lead per vendor ('lead|vendorId'), for regulars */
  vendorVisits?: unknown;
  /** bodies left lying, carried or in trunks; discoverAt is seconds remaining (-1 = never by passers-by) */
  bodies?: unknown;
  activeLead?: string;
}

/** Map legacy wardrobe strings (engine draft used 'default') to the lead's first outfit. */
const legacyOutfit = (lead: string, w?: string) => (!w || w === 'default' ? '' : w.startsWith('outfit.') ? w : '') || `@first:${lead}`;

export function migrate(raw: unknown): SaveV3 {
  if (!raw || typeof raw !== 'object') throw new Error('gameplay save: not an object');
  let s = raw as Record<string, unknown>;
  const v = typeof s.v === 'number' ? s.v : 'characters' in s ? 1 : NaN;
  if (!Number.isFinite(v)) throw new Error('gameplay save: unknown shape');
  if (v > SAVE_VERSION) throw new Error(`gameplay save v${v} is newer than this build (v${SAVE_VERSION})`);
  if (v === 1) s = v1to2(s as unknown as SaveV1) as unknown as Record<string, unknown>;
  if ((s.v as number) === 2) s = v2to3(s as unknown as SaveV2) as unknown as Record<string, unknown>;
  if ((s.v as number) === 3) s = { ...s, v: 4 }; // additive: defaults are filled by each system's deserialize
  return s as unknown as SaveV3;
}

export function v1to2(s: SaveV1): SaveV2 {
  const leads: SaveV2['leads'] = {};
  for (const [id, c] of Object.entries(s.characters ?? {})) {
    const counts = new Map<string, number>();
    for (const it of c.inventory ?? []) counts.set(it, (counts.get(it) ?? 0) + 1);
    leads[id] = {
      money: Math.round((c.money ?? 0) * 100), // dollars → cents (round, never truncate: $0.35 must stay 35¢)
      items: [...counts].map(([i, qty]) => ({ id: i, qty })),
      outfits: [], wearing: legacyOutfit(id, c.wardrobe),
    };
  }
  return { v: 2, leads, payoffs: {} };
}

export function v2to3(s: SaveV2): SaveV3 {
  const inventory: SaveV3['inventory'] = {};
  for (const [id, l] of Object.entries(s.leads)) inventory[id] = { money: l.money, items: l.items, loaded: {}, equipped: 'weapon.fists', outfits: l.outfits, wearing: l.wearing, armor: 0, plates: 0 };
  return { v: 3, inventory, health: {}, police: { payoff: s.payoffs ?? {}, reports: [], nextReport: 1 }, shops: {}, phones: { pending: [], messages: {} }, props: [], outcomes: { property: {}, debt: {} } };
}
