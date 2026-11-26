/** Tier A hero generators by content id (content/interiors.json). Child interiors (parent: ...) are cells of their parent. */
import type { GenCtx } from '../common';
import { genCorwin } from './corwin';

export const HERO_GENERATORS: Record<string, (c: GenCtx) => void> = {
  'interior.corwin_lobby': genCorwin,
};
/** Hero placement preferences for the address resolver. */
export const HERO_PLACEMENT: Record<string, { width: number; prefer: 'tallest_prewar' | 'any'; minFloors?: number }> = {
  'interior.corwin_lobby': { width: 8, prefer: 'tallest_prewar', minFloors: 10 },
};
