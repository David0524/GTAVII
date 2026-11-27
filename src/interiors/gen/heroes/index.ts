/** Tier A hero generators by content id (content/interiors.json). Child interiors (parent: ...) are cells of their parent. */
import type { GenCtx } from '../common';
import { genCorwin } from './corwin';
import { genStationHouse } from './precinct';

export const HERO_GENERATORS: Record<string, (c: GenCtx) => void> = {
  'interior.corwin_lobby': genCorwin,
  'interior.station_house_desk': genStationHouse,
};
/** Hero placement preferences for the address resolver. */
export const HERO_PLACEMENT: Record<string, { width: number; prefer: 'tallest_prewar' | 'lowrise' | 'any'; minFloors?: number; minDepth?: number }> = {
  'interior.corwin_lobby': { width: 8, prefer: 'tallest_prewar', minFloors: 10 },
  'interior.station_house_desk': { width: 12, prefer: 'lowrise', minFloors: 3, minDepth: 18 }, // 1900s precinct house: 3-5 floors
};
