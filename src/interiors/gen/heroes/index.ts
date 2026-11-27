/** Tier A hero generators by content id (content/interiors.json). Child interiors (parent: ...) are cells of their parent. */
import type { GenCtx } from '../common';
import { genCorwin } from './corwin';
import { genStationHouse } from './precinct';
import { genDelphine, genVarelas } from './homes';
import { genHospitalER } from './hospital';

export const HERO_GENERATORS: Record<string, (c: GenCtx) => void> = {
  'interior.corwin_lobby': genCorwin,
  'interior.station_house_desk': genStationHouse,
  'interior.penn_south_delphine': genDelphine,
  'interior.varelas_apartment': genVarelas,
  'interior.pennington_er': genHospitalER,
};
/** Hero placement preferences for the address resolver. */
export const HERO_PLACEMENT: Record<string, { width: number; prefer: 'tallest_prewar' | 'lowrise' | 'any'; minFloors?: number; minDepth?: number; minFront?: number; uses?: number[] }> = {
  'interior.corwin_lobby': { width: 8, prefer: 'tallest_prewar', minFloors: 10 },
  'interior.station_house_desk': { width: 12, prefer: 'lowrise', minFloors: 3, minDepth: 18 }, // 1900s precinct house: 3-5 floors
  'interior.penn_south_delphine': { width: 10, prefer: 'any', minFloors: 8 },   // Penn South slab tower (1962)
  'interior.varelas_apartment': { width: 16, prefer: 'any', minFloors: 11, minFront: 15 }, // prewar doorman building, Madison & E 37th: a wide lot so the flat reads grand
  'interior.pennington_er': { width: 14, prefer: 'any', minFloors: 3, uses: [4, 5, 6, 8], minFront: 12, minDepth: 15 },       // Pennington General ER (local entry until narrative lists it)
};
