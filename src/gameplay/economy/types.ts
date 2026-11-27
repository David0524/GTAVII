import type { CrimeKind } from '../police/crime';

/**
 * Shared types and constants for the free-roam economy (ECONOMY.md). Everything is integer cents.
 * All content here (names, prices, rosters) is PLACEHOLDER: narrative supplies the real content later.
 */

/** The crime callback. The economy never calls police code; the host wires this to the police system. */
export type CrimeFn = (kind: CrimeKind, o: { noise?: number; visible?: boolean }) => void;
/** Story / unlock flags (e.g. `hack_licence`, `car.char.teddy_arce`). */
export type FlagFn = (flag: string) => boolean;

/** Whole dollars to integer cents. */
export const usd = (d: number) => Math.round(d * 100);
export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** The clock scale from the brief: 1 game minute = 2 real seconds, so one real hour is 30 game hours. */
export const GAME_HOURS_PER_REAL_HOUR = 30;

export const TEDDY = 'char.teddy_arce';
export const DELPHINE = 'char.delphine_moore';
export const NICK = 'char.nick_varelas';

/** What a fence or pawnshop can be sold. */
export type LootCategory = 'jewelry' | 'furs' | 'electronics' | 'liquor' | 'silver' | 'appliances';
export const LOOT_CATEGORIES: readonly LootCategory[] = ['jewelry', 'furs', 'electronics', 'liquor', 'silver', 'appliances'];

/** One lot of stolen goods; `cents` is the street (retail-ish) value, not what a fence pays. */
export interface Lot { category: LootCategory; cents: number; label: string }

/** Stable small hash so weekly content derives from the week number alone. */
export function hash32(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) { h ^= v | 0; h = Math.imul(h, 0x01000193); h ^= h >>> 13; }
  return h >>> 0;
}
