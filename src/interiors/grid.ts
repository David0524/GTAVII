/**
 * Manhattan grid lookup for interiors (district rules, address resolution, naming).
 * Street and avenue positions are medians of the OSM centrelines in public/data/streets.json
 * (world frame from src/shared/geo.ts: -Z is uptown, +X is east). Pure data, worker safe.
 */
const STREET_Z: [number, number][] = [
  [15, 586.4], [16, 504.9], [17, 430.0], [18, 355.4], [19, 281.2], [20, 207.0], [21, 131], [22, 53.5], [23, -31.7],
  [24, -114.4], [25, -194.1], [26, -274.2], [27, -352.1], [28, -431], [29, -509.7], [30, -587.9], [31, -666.1],
  [32, -745.1], [33, -823.2], [34, -908.2], [35, -992.7], [36, -1071.7], [37, -1149.7], [38, -1227.3], [39, -1307.9],
  [40, -1385.9], [41, -1464.6], [42, -1548.5], [43, -1634.9], [44, -1714], [45, -1793.9], [46, -1873.5], [47, -1952.9],
  [48, -2032.4], [49, -2112.1], [50, -2192.0], [51, -2271.4],
];
/** West to east. Broadway is diagonal and handled separately by name. */
export const AVENUES: [string, number][] = [
  ['12th Avenue', -1828], ['11th Avenue', -1700.8], ['10th Avenue', -1427.9], ['9th Avenue', -1156], ['8th Avenue', -879.7],
  ['7th Avenue', -604.8], ['6th Avenue', -329.3], ['5th Avenue', -19.4], ['Madison Avenue', 132.1], ['Park Avenue', 288.1],
  ['Lexington Avenue', 444.6], ['3rd Avenue', 599.7], ['2nd Avenue', 816.3],
];

/** Fractional street number at world z (e.g. 31.5 = mid-block between 31st and 32nd). */
export function streetAt(z: number): number {
  const t = STREET_Z;
  if (z >= t[0][1]) return t[0][0] - (z - t[0][1]) / 80;
  for (let k = 1; k < t.length; k++) {
    if (z >= t[k][1]) { const [n0, z0] = t[k - 1], [, z1] = t[k]; return n0 + (z0 - z) / (z0 - z1); }
  }
  const l = t[t.length - 1]; return l[0] + (l[1] - z) / 80;
}
export function streetZ(n: number): number {
  const t = STREET_Z;
  for (let k = 1; k < t.length; k++) if (n <= t[k][0]) { const [n0, z0] = t[k - 1], [n1, z1] = t[k]; return z0 + ((n - n0) / (n1 - n0)) * (z1 - z0); }
  return t[t.length - 1][1];
}
/** Fractional avenue index (0 = 12th Ave ... ) at world x. */
export function avenueAt(x: number): number {
  const a = AVENUES;
  if (x <= a[0][1]) return 0;
  for (let k = 1; k < a.length; k++) if (x <= a[k][1]) return k - 1 + (x - a[k - 1][1]) / (a[k][1] - a[k - 1][1]);
  return a.length - 1;
}
export function avenueX(name: string): number | undefined {
  const n = normaliseStreet(name);
  return AVENUES.find((a) => a[0] === n)?.[1];
}

/** "W 31st St", "West 31st Street", "8th Ave", "Sixth Avenue" -> OSM spelling used in streets.json. */
export function normaliseStreet(s: string): string {
  let t = s.trim().replace(/\./g, '');
  const words: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', fifth: '5th', sixth: '6th', seventh: '7th', eighth: '8th', ninth: '9th', tenth: '10th', eleventh: '11th', twelfth: '12th' };
  t = t.replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\b/gi, (m) => words[m.toLowerCase()]);
  t = t.replace(/^W\b/i, 'West').replace(/^E\b/i, 'East');
  t = t.replace(/\bSt$/i, 'Street').replace(/\bAve$/i, 'Avenue').replace(/\bAv$/i, 'Avenue');
  if (/^avenue of the americas$/i.test(t)) t = '6th Avenue';
  return t;
}

/** Districts as they were known in 1974 (no later neighbourhood names: STYLE_GUIDE §10). */
export type District = 'garment' | 'fur' | 'flower' | 'deuce' | 'times_square' | 'hells_kitchen' | 'chelsea' | 'herald' | 'murray_hill' | 'gramercy' | 'midtown' | 'tenderloin';
export function districtAt(x: number, z: number): District {
  const s = streetAt(z), a = avenueAt(x); // 4 = 8th, 5 = 7th, 6 = 6th, 7 = 5th, 3 = 9th, 2 = 10th
  if (s >= 41.6 && s <= 42.4 && a >= 4 && a <= 6) return 'deuce';
  if (s > 42.4 && s < 48 && a >= 4.5 && a <= 6.2) return 'times_square';
  if (s >= 33.5 && s <= 35 && a >= 5.5 && a <= 6.6) return 'herald';
  if (s >= 34 && s < 41.6 && a >= 3.6 && a <= 6.05) return 'garment';
  if (s >= 26 && s < 31 && a >= 4.5 && a <= 6.05) return 'fur';
  if (s >= 27.6 && s <= 28.5 && a >= 5.8 && a <= 6.2) return 'flower';
  if (s >= 34 && a < 3.6) return 'hells_kitchen';
  if (s < 31 && a < 5) return 'chelsea';
  if (s >= 30 && s < 42 && a > 7) return 'murray_hill';
  if (s < 26 && a > 7.3) return 'gramercy';
  if (s >= 42.4) return 'midtown';
  return 'tenderloin';
}
