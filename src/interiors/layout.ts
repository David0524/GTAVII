/**
 * Deterministic core layouts shared by generators, test shells and the engine: where a stair
 * compartment sits, its floor-to-floor height, and the roof hatch (bulkhead) footprint that the
 * roof must be cut for. Coordinates are unit-local (x along frontage, z inward).
 */
import type { UnitRec, BuildingIdx } from './indexFormat';
import { PARTY_INSET } from './facade';

export const WALL_T = 0.3;
export interface CoreLayout {
  x0: number; x1: number; /** inner width bounds */
  zs: number; ze: number; /** stair compartment z range (front landing starts at zs) */
  landing: number; run: number; flightW: number;
  floors: number; fh: number; roofY: number;
  /** vestibule depth (ground floor) */
  vest: number;
  stairs: boolean; roof: boolean;
}

export function coreLayout(u: UnitRec, b: Pick<BuildingIdx, 'floors' | 'top' | 'roof' | 'fh'>): CoreLayout {
  const x0 = PARTY_INSET, x1 = u.w - PARTY_INSET, ze = u.d - PARTY_INSET;
  const floors = Math.max(2, b.floors || 2);
  const roofY = Math.max(floors * 2.7, b.top - u.y);
  const fh = Math.min(4.6, Math.max(2.7, roofY / floors));
  const steps = Math.max(12, Math.round(fh / 0.19)), perFlight = Math.ceil(steps / 2);
  let run = perFlight * 0.25, landing = 1.05;
  let vest = 1.6;
  // shallow cores: tighten landings, vestibule and tread
  const need = WALL_T + vest + 1.2 + landing * 2 + run;
  if (need > u.d) { landing = 0.9; vest = 1.3; run = perFlight * 0.23; }
  const zs = Math.max(WALL_T + vest + 0.8, ze - (landing * 2 + run));
  const flightW = Math.min(1.25, (x1 - x0 - 0.08) / 2);
  return { x0, x1, zs, ze, landing, run, flightW, floors, fh, roofY, vest, stairs: true, roof: b.roof };
}

/** Roof hatch rectangle (bulkhead footprint) in world x/z, or null. */
export function roofHatchWorld(u: UnitRec, b: Pick<BuildingIdx, 'floors' | 'top' | 'roof' | 'fh'>): number[] | null {
  if (!b.roof) return null;
  const L = coreLayout(u, b);
  const pts = [[L.x0, L.zs], [L.x1, L.zs], [L.x1, L.ze], [L.x0, L.ze]];
  return pts.flatMap(([x, z]) => [u.ox + u.ux * x + u.nx * z, u.oz + u.uz * x + u.nz * z]);
}

/** Fire-stair tower at the back corner of an office/hotel lobby (same flight geometry as coreLayout). */
export function towerLayout(u: UnitRec, b: Pick<BuildingIdx, 'floors' | 'top' | 'roof' | 'fh'>): CoreLayout {
  const L = coreLayout({ ...u, w: Math.min(u.w, 2.9) + 0 } as UnitRec, b);
  const x1 = u.w - PARTY_INSET, x0 = Math.max(PARTY_INSET, x1 - 2.7);
  return { ...L, x0, x1, flightW: Math.min(1.25, (x1 - x0 - 0.08) / 2) };
}
/** Ship's-ladder roof hatch in a low building's shop back room (unit-local rect x0,z0,x1,z1). */
export function shopRoofHatch(u: UnitRec): [number, number, number, number] {
  const x1 = u.w - PARTY_INSET, z1 = u.d - PARTY_INSET;
  return [x1 - 1.8, z1 - 3.0, x1 - 0.1, z1 - 0.1];
}
/** Every roof hatch of a building in world x/z rings (for cutting the roof). */
export function roofHatchesWorld(b: BuildingIdx): number[][] {
  const out: number[][] = [];
  for (const u of b.units) {
    let r: number[] | null = null;
    if (u.roofAccess) { const [x0, z0, x1, z1] = shopRoofHatch(u); r = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].flatMap(([x, z]) => [u.ox + u.ux * x + u.nx * z, u.oz + u.uz * x + u.nz * z]); }
    else if (u === b.units[0] && ['tenement', 'loft', 'sro', 'apartment_lobby'].includes(u.kind)) r = roofHatchWorld(u, b);
    else if (u === b.units[0] && b.roof && (u.kind === 'office_lobby' || u.kind === 'hotel_lobby')) { const L = towerLayout(u, b); r = [[L.x0, L.zs], [L.x1, L.zs], [L.x1, L.ze], [L.x0, L.ze]].flatMap(([x, z]) => [u.ox + u.ux * x + u.nx * z, u.oz + u.uz * x + u.nz * z]); }
    if (r) out.push(r);
  }
  return out;
}
