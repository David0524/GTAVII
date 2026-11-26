/** Kind -> generator. Every Tier B kind has an entry; hero interiors register by id in gen/heroes. */
import type { GenCtx } from './common';
import { genDiner, genBar, genDeli } from './food';
import * as R from './retail';
import { genTenement, genLoft, genApartmentLobby } from './vertical';
import * as Hl from './halls';

export type Generator = (c: GenCtx) => void;
export const genGenericShop = R.genGenericShop;
export const GENERATORS: Record<string, Generator> = {
  diner: (c) => genDiner(c, false),
  coffee_shop: (c) => genDiner(c, true),
  bar: genBar,
  deli: (c) => genDeli(c, false),
  bodega: (c) => genDeli(c, true),
  liquor: R.genLiquor,
  pawn: R.genPawn,
  barber: (c) => R.genBarber(c, false),
  beauty: (c) => R.genBarber(c, true),
  laundromat: R.genLaundromat,
  shoe_repair: R.genShoeRepair,
  tailor: R.genTailor,
  newsstand: R.genNewsstand,
  clothing: (c) => R.genClothing(c, 'clothing'),
  garment_showroom: (c) => R.genClothing(c, 'garment_showroom'),
  fur_showroom: (c) => R.genClothing(c, 'fur_showroom'),
  hardware: R.genHardware,
  florist: R.genFlorist,
  tenement: (c) => genTenement(c, false),
  sro: (c) => genTenement(c, true),
  loft: genLoft,
  apartment_lobby: genApartmentLobby,
  office_lobby: Hl.genOfficeLobby,
  hotel_lobby: Hl.genHotelLobby,
  garage: Hl.genGarage,
  church: Hl.genChurch,
  union_hall: Hl.genUnionHall,
  cinema_lobby: Hl.genCinemaLobby,
  pool_hall: (c) => Hl.genUpstairs(c, 'pool_hall'),
  gym: (c) => Hl.genUpstairs(c, 'gym'),
};
