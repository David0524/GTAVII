/**
 * Hand-curated 1974 corrections layered on top of present-day open data.
 * Every entry is a deliberate, sourced decision; see DATA_SOURCES.md.
 */

/** Traffic direction of each avenue in summer 1974, relative to the grid.
 *  'north' = uptown only, 'south' = downtown only, 'two' = two-way. */
export const AVENUE_DIRECTION_1974: Record<string, { dir: 'north' | 'south' | 'two'; since: string; source: string }> = {
  '5th Avenue': { dir: 'south', since: '1966-01-14', source: 'Wikipedia "Fifth Avenue"; NYT 1966-01-15' },
  'Madison Avenue': { dir: 'north', since: '1966-01-14', source: 'Wikipedia "Fifth Avenue" (paired conversion)' },
  '6th Avenue': { dir: 'north', since: '1963-11-10 (south of Herald Sq)', source: 'Wikipedia "Sixth Avenue"' },
  'Avenue of the Americas': { dir: 'north', since: '1963-11-10', source: 'Wikipedia "Sixth Avenue"' },
  '7th Avenue': { dir: 'south', since: '1954-06-06', source: 'Wikipedia "Seventh Avenue (Manhattan)"' },
  '8th Avenue': { dir: 'north', since: '1954-06-06', source: 'Wikipedia "Eighth Avenue (Manhattan)"' },
  '9th Avenue': { dir: 'south', since: '1950s', source: 'Wikipedia "Ninth Avenue (Manhattan)" -- date unverified' },
  Broadway: { dir: 'south', since: '1963-11-10 Herald Sq->Union Sq; 1957 Columbus Circle->Herald Sq', source: 'Wikipedia "Broadway (Manhattan)"' },
  'Park Avenue South': { dir: 'two', since: 'always', source: 'Wikipedia "Park Avenue"' },
  'Park Avenue': { dir: 'two', since: 'always', source: 'Wikipedia "Park Avenue"' },
  'Lexington Avenue': { dir: 'south', since: '1960', source: 'Wikipedia "Lexington Avenue" -- date unverified' },
  '3rd Avenue': { dir: 'north', since: '1960', source: 'Wikipedia "Third Avenue" -- date unverified' },
};

/** Major crosstown streets were two-way throughout (wide 100-ft streets). */
export const TWO_WAY_STREETS = /^(East|West) (14th|23rd|34th|42nd) Street$/;

/** Curb-to-curb roadway width in metres. Present-day OSM lane counts reflect post-2007
 *  bike lanes and plazas, so 1974 widths come from the 1811 grid right-of-way minus
 *  sidewalk widths (100 ft avenues, 60 ft side streets, 80 ft Broadway/Madison). */
export function roadwayWidth(name: string | undefined, highway: string): number {
  const n = name ?? '';
  if (/^(5th Avenue)$/.test(n)) return 17;
  if (/^(6th Avenue|Avenue of the Americas|7th Avenue|8th Avenue|9th Avenue|Park Avenue South|Park Avenue)$/.test(n)) return 20;
  if (/^(Madison Avenue|Lexington Avenue|3rd Avenue)$/.test(n)) return 15;
  if (n === 'Broadway') return 15;
  if (TWO_WAY_STREETS.test(n)) return 18;
  if (/Street$/.test(n)) return 10.4; // 34 ft
  switch (highway) {
    case 'primary': case 'trunk': return 18;
    case 'secondary': return 15;
    case 'tertiary': return 12;
    case 'motorway': case 'motorway_link': case 'primary_link': case 'secondary_link': return 9;
    default: return 9;
  }
}

/** Buildings standing in 1974 that are gone today (no footprint in the current dataset).
 *  Geometry: grid-aligned box centred on the PLUTO lot centroid. */
export const RESTORED_BUILDINGS = [
  {
    name: 'Hotel Pennsylvania',
    note: '401 Seventh Ave, 1919, demolished 2022-23. 200 x 400 ft plot, 22 floors.',
    lat: 40.7496925, lon: -73.9905585, // PLUTO lot 1008087501 centroid
    sizeX: 120, sizeZ: 58, height: 86, floors: 22, year: 1919, use: 5,
  },
];

/** Twin towers for the downtown skyline layer (completed 1972/1973). */
export const SKYLINE_ADDITIONS = [
  { name: 'World Trade Center North Tower', lat: 40.71175, lon: -74.01315, size: 63.4, height: 417, heading: 29 },
  { name: 'World Trade Center South Tower', lat: 40.71065, lon: -74.01345, size: 63.4, height: 415, heading: 29 },
];

/** Named OSM outlines that mark hero landmarks (Phase 3 swaps in hand-modelled versions). */
export const HERO_NAMES = [
  'Flatiron Building', 'Empire State Building', 'Madison Square Garden', 'Hotel Chelsea',
  'Metropolitan Life Insurance Company Tower', 'New York Life Building', 'Macy\'s', 'Pennsylvania Station',
];

/** Heroes with no reliable OSM name, matched by a point inside the footprint. */
export const HERO_POINTS = [
  { name: 'Hotel Chelsea', lat: 40.74437, lon: -73.99683 }, // 222 W 23rd St
];
