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
