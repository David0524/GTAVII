/**
 * Interior kinds: the Tier B vocabulary. Each kind has period hours (1974 New York practice),
 * the audio reverb class, and placement weights. Pure data, shared by the index tool and runtime.
 */
import type { District } from './grid';

export type ShopKind =
  | 'diner' | 'coffee_shop' | 'bar' | 'deli' | 'bodega' | 'liquor' | 'barber' | 'pawn' | 'laundromat'
  | 'shoe_repair' | 'tailor' | 'newsstand' | 'clothing' | 'hardware' | 'beauty' | 'garment_showroom'
  | 'fur_showroom' | 'pool_hall' | 'gym' | 'florist' | 'cinema_lobby';
export type CoreKind = 'tenement' | 'apartment_lobby' | 'sro' | 'office_lobby' | 'hotel_lobby' | 'loft' | 'garage' | 'church' | 'union_hall';
export type InteriorKind = ShopKind | CoreKind | 'hero';

export interface KindInfo {
  label: string;
  /** Opening hours [open, close] 'HH:MM'; close may wrap past midnight. Omitted = always open. */
  hours?: [string, string];
  /** Audio reverb hint. */
  reverb: 'small_room' | 'shop' | 'hall' | 'stairwell' | 'large_hall' | 'garage';
  /** Upstairs kinds: the street door opens on a stair to the 2nd floor. */
  upstairs?: boolean;
  /** Minimum bay width in metres. */
  minW: number;
}

export const KINDS: Record<Exclude<InteriorKind, 'hero'>, KindInfo> = {
  diner: { label: 'Diner', hours: ['05:30', '01:00'], reverb: 'shop', minW: 6 },
  coffee_shop: { label: 'Coffee shop', hours: ['06:00', '20:00'], reverb: 'shop', minW: 4.5 },
  bar: { label: 'Bar', hours: ['08:00', '04:00'], reverb: 'shop', minW: 4.5 },
  deli: { label: 'Delicatessen', hours: ['06:30', '21:00'], reverb: 'shop', minW: 4.5 },
  bodega: { label: 'Grocery (bodega)', hours: ['07:00', '23:00'], reverb: 'shop', minW: 4 },
  liquor: { label: 'Liquor store', hours: ['09:00', '22:00'], reverb: 'shop', minW: 4 },
  barber: { label: 'Barber shop', hours: ['08:00', '19:00'], reverb: 'small_room', minW: 3.6 },
  pawn: { label: 'Pawnshop', hours: ['09:00', '18:30'], reverb: 'shop', minW: 4 },
  laundromat: { label: 'Laundromat', hours: ['07:00', '22:00'], reverb: 'shop', minW: 4.5 },
  shoe_repair: { label: 'Shoe repair', hours: ['07:30', '18:30'], reverb: 'small_room', minW: 3.2 },
  tailor: { label: 'Tailor', hours: ['08:00', '18:30'], reverb: 'small_room', minW: 3.2 },
  newsstand: { label: 'Candy store & newsstand', hours: ['05:00', '21:00'], reverb: 'small_room', minW: 3.2 },
  clothing: { label: 'Clothing store', hours: ['09:30', '19:00'], reverb: 'shop', minW: 5 },
  hardware: { label: 'Hardware store', hours: ['08:00', '18:00'], reverb: 'shop', minW: 4.5 },
  beauty: { label: 'Beauty parlor', hours: ['09:00', '19:00'], reverb: 'small_room', minW: 3.6 },
  garment_showroom: { label: 'Garment showroom', hours: ['08:00', '18:00'], reverb: 'shop', minW: 5 },
  fur_showroom: { label: 'Fur showroom', hours: ['09:00', '18:00'], reverb: 'shop', minW: 5 },
  pool_hall: { label: 'Pool hall (upstairs)', hours: ['11:00', '02:00'], reverb: 'hall', upstairs: true, minW: 3 },
  gym: { label: 'Boxing gym (upstairs)', hours: ['09:00', '21:00'], reverb: 'hall', upstairs: true, minW: 3 },
  florist: { label: 'Florist', hours: ['06:00', '17:00'], reverb: 'small_room', minW: 3.6 },
  cinema_lobby: { label: 'Cinema', hours: ['10:00', '04:00'], reverb: 'hall', minW: 7 },
  tenement: { label: 'Walk-up stairwell', reverb: 'stairwell', minW: 2.4 },
  apartment_lobby: { label: 'Apartment lobby', reverb: 'hall', minW: 3 },
  sro: { label: 'SRO hotel', reverb: 'hall', minW: 3.5 },
  office_lobby: { label: 'Office lobby', hours: ['07:00', '20:00'], reverb: 'large_hall', minW: 4 },
  hotel_lobby: { label: 'Hotel lobby', reverb: 'large_hall', minW: 5 },
  loft: { label: 'Loft building', hours: ['07:00', '19:00'], reverb: 'stairwell', minW: 2.6 },
  garage: { label: 'Garage', hours: ['06:00', '23:00'], reverb: 'garage', minW: 6 },
  church: { label: 'Church', hours: ['07:00', '19:00'], reverb: 'large_hall', minW: 6 },
  union_hall: { label: 'Union hall', hours: ['08:00', '22:00'], reverb: 'large_hall', minW: 5 },
};

/** Relative weights of ground-floor shop kinds by district. Kinds absent from a district get the base weight. */
const BASE: Partial<Record<ShopKind, number>> = {
  diner: 7, coffee_shop: 6, bar: 9, deli: 7, bodega: 7, liquor: 5, barber: 5, pawn: 2, laundromat: 3, shoe_repair: 3,
  tailor: 3, newsstand: 4, clothing: 3, hardware: 2, beauty: 3, pool_hall: 1.2, gym: 0.6, florist: 1,
};
const DISTRICT: Partial<Record<District, Partial<Record<ShopKind, number>>>> = {
  garment: { garment_showroom: 10, coffee_shop: 9, deli: 8, tailor: 5, bar: 6, laundromat: 1, beauty: 1, hardware: 3 },
  fur: { fur_showroom: 9, coffee_shop: 8, tailor: 4, laundromat: 1.5 },
  flower: { florist: 14 },
  deuce: { cinema_lobby: 10, pawn: 4, bar: 9, coffee_shop: 7, newsstand: 6, pool_hall: 2, laundromat: 0.5 },
  times_square: { cinema_lobby: 3, pawn: 4, bar: 9, coffee_shop: 7, newsstand: 6, pool_hall: 2, gym: 1, clothing: 4 },
  hells_kitchen: { bar: 13, bodega: 10, laundromat: 6, gym: 1.5, pool_hall: 2, shoe_repair: 4 },
  chelsea: { bodega: 10, laundromat: 6, bar: 10, hardware: 3 },
  herald: { clothing: 8, coffee_shop: 8, shoe_repair: 4, newsstand: 6, pawn: 1 },
  murray_hill: { liquor: 6, laundromat: 4, tailor: 4, bar: 6, florist: 3, pawn: 0.5 },
  gramercy: { liquor: 6, laundromat: 4, tailor: 4, florist: 3, pawn: 0.5 },
  tenderloin: { pawn: 3, bar: 10, coffee_shop: 7, pool_hall: 1.6 },
  midtown: { coffee_shop: 8, newsstand: 5, clothing: 4 },
};
export function shopWeights(d: District, avenue: boolean): [ShopKind, number][] {
  const w: Partial<Record<ShopKind, number>> = { ...BASE, ...(DISTRICT[d] ?? {}) };
  // Showrooms and cinemas front the side streets / the Deuce; diners and liquor stores like corners and avenues.
  if (avenue) { w.diner = (w.diner ?? 0) * 1.6; w.liquor = (w.liquor ?? 0) * 1.3; if (w.garment_showroom) w.garment_showroom *= 0.4; }
  else { w.diner = (w.diner ?? 0) * 0.6; w.hardware = (w.hardware ?? 0) * 1.2; }
  return Object.entries(w).filter(([, v]) => (v as number) > 0) as [ShopKind, number][];
}

/** 'HH:MM' -> minutes. */
export const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
/** Is a place with these hours open at clock minutes (0..1439)? Handles wrap past midnight. */
export function isOpen(hours: readonly [string, string] | undefined, minutes: number): boolean {
  if (!hours) return true;
  const o = hm(hours[0]), c = hm(hours[1]);
  if (c >= 1440 || o === c) return true;
  return o < c ? minutes >= o && minutes < c : minutes >= o || minutes < c;
}
