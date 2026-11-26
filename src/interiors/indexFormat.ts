/**
 * Interiors index (public/data/interiors/index.json), written by tools/interiors/buildIndex.ts.
 * One record per enterable building: its units (shop bays, the residential/office core) as
 * oriented rectangles on the real footprint, each with a door on a real street frontage.
 *
 * Frame per unit: origin (ox,oz) is on the facade line; u = unit vector along the frontage,
 * n = unit vector pointing INTO the building. The rectangle spans [0,w] along u and [0,d]
 * along n. The door centre sits at t along u, on the facade line.
 */
import type { InteriorKind } from './catalog';

export interface UnitRec {
  id: string;
  kind: InteriorKind;
  ox: number; oz: number; ux: number; uz: number; nx: number; nz: number;
  w: number; d: number;
  /** Door centre offset along u, door clear width, recess depth (period storefronts are recessed). */
  door: { t: number; w: number; recess: number };
  /** Interior ground-floor level (sidewalk height at the door). */
  y: number;
  street: number; // index into IndexFile.streets
  avenue: boolean;
  hours?: [string, string];
  locked: boolean;
  seed: number;
  /** this unit carries the building's roof access (ship's ladder in the back room of a low building) */
  roofAccess?: boolean;
  /** hero interior id from content/interiors.json (kind === 'hero') */
  hero?: string;
}
export interface BuildingIdx {
  id: number; i: number; j: number;
  use: number; style: number; year: number; floors: number;
  /** Floor-to-floor height (m) and roof height (absolute y, same rule as the engine's extrude). */
  fh: number; top: number;
  /** Mean ground under the footprint (engine roof rule = gAvg + height). */
  gAvg: number;
  district: string;
  roof: boolean;
  units: UnitRec[];
  /** Street frontage edges [ax, az, bx, bz, streetIdx]. */
  frontage: [number, number, number, number, number][];
  address?: string;
}
export interface IndexFile {
  version: 1;
  streets: string[];
  buildings: BuildingIdx[];
  coverage: Record<string, number>;
}

/**
 * Wire format (compact, ~10x smaller than the object form):
 *   { v: 2, streets, kinds, districts, coverage, b: [[id, i, j, use, style, year, floors, fh, top, gAvg, districtIdx, roof, addressOrEmpty, frontageFlat[], units[]]] }
 *   unit = [kindIdx, ox, oz, angleU, w, d, doorT, doorW, recess, y, street, flags, seed]
 *   flags: 1 avenue, 2 locked, 4 inward normal is +90deg from u (else -90deg), 8 roof access
 */
export interface WireIndex { v: 2; streets: string[]; kinds: string[]; districts: string[]; coverage: Record<string, number>; b: unknown[][] }
const r2 = (v: number, p = 100) => Math.round(v * p) / p;
export function encodeIndex(f: IndexFile, kindHours: (k: string) => [string, string] | undefined): WireIndex {
  void kindHours;
  const kinds: string[] = [], districts: string[] = [];
  const ki = (k: string) => { let i = kinds.indexOf(k); if (i < 0) { i = kinds.length; kinds.push(k); } return i; };
  const di = (k: string) => { let i = districts.indexOf(k); if (i < 0) { i = districts.length; districts.push(k); } return i; };
  const b = f.buildings.map((x) => [x.id, x.i, x.j, x.use, x.style, x.year, x.floors, r2(x.fh), r2(x.top), r2(x.gAvg), di(x.district), x.roof ? 1 : 0, x.address ?? '',
    x.frontage.flatMap((e) => [r2(e[0], 10), r2(e[1], 10), r2(e[2], 10), r2(e[3], 10), e[4]]),
    x.units.map((u) => {
      const left = Math.abs(u.nx - -u.uz) < 0.01 && Math.abs(u.nz - u.ux) < 0.01; // n = (-uz, ux) is +90deg
      return [ki(u.kind), r2(u.ox), r2(u.oz), r2(Math.atan2(u.uz, u.ux), 10000), r2(u.w), r2(u.d), r2(u.door.t), r2(u.door.w), r2(u.door.recess), r2(u.y), u.street, (u.avenue ? 1 : 0) | (u.locked ? 2 : 0) | (left ? 4 : 0) | (u.roofAccess ? 8 : 0), u.seed, ...(u.hero ? [u.hero] : [])];
    })]);
  return { v: 2, streets: f.streets, kinds, districts, coverage: f.coverage, b };
}
export function decodeIndex(w: WireIndex, kindHours: (k: string) => [string, string] | undefined): IndexFile {
  const buildings: BuildingIdx[] = w.b.map((a) => {
    const [id, i, j, use, style, year, floors, fh, top, gAvg, d, roof, address, fr, us] = a as [number, number, number, number, number, number, number, number, number, number, number, number, string, number[], number[][]];
    const frontage: BuildingIdx['frontage'] = [];
    for (let k = 0; k < fr.length; k += 5) frontage.push([fr[k], fr[k + 1], fr[k + 2], fr[k + 3], fr[k + 4]]);
    const units: UnitRec[] = us.map((u, k) => {
      const kind = w.kinds[u[0]] as UnitRec['kind'];
      const ux = Math.cos(u[3]), uz = Math.sin(u[3]); const left = (u[11] & 4) !== 0;
      return { id: u[13] ? (u[13] as unknown as string) : k === 0 && isCoreKind(kind) ? `b${id}` : `b${id}u${k}`, kind, ox: u[1], oz: u[2], ux, uz, nx: left ? -uz : uz, nz: left ? ux : -ux, w: u[4], d: u[5],
        door: { t: u[6], w: u[7], recess: u[8] }, y: u[9], street: u[10], avenue: (u[11] & 1) !== 0, locked: (u[11] & 2) !== 0, roofAccess: (u[11] & 8) !== 0, seed: u[12], ...(u[13] ? { hero: u[13] as unknown as string } : {}), hours: kindHours(kind) };
    });
    return { id, i, j, use, style, year, floors, fh, top, gAvg, district: w.districts[d], roof: roof === 1, units, frontage, ...(address ? { address } : {}) };
  });
  return { version: 1, streets: w.streets, buildings, coverage: w.coverage };
}
export const CORE_KINDS = ['tenement', 'apartment_lobby', 'sro', 'office_lobby', 'hotel_lobby', 'loft', 'garage', 'church', 'union_hall'];
export const isCoreKind = (k: string) => CORE_KINDS.includes(k);

export interface DoorRec {
  id: string; buildingId: number; x: number; y: number; z: number;
  /** Direction the door's outside face points (toward the street); 0 = facing -Z (engine heading convention). */
  yaw: number;
  kind: string; locked: boolean; hours?: [string, string];
  /** Clear opening width/height (m) so the engine can cut and frame the facade. */
  width: number; height: number;
  /** Display-window openings either side of the door (storefronts), along the facade: [t0, t1] offsets from the door centre. */
  windows?: [number, number][];
}

export const DOOR_H = 2.25;
export function unitDoor(u: UnitRec, bId: number): DoorRec {
  const x = u.ox + u.ux * u.door.t, z = u.oz + u.uz * u.door.t;
  const yaw = Math.atan2(u.nx, u.nz); // outward = -n; heading convention atan2(-dx,-dz) with d = -n
  const shop = !isCoreKind(u.kind) && u.kind !== 'hero';
  const windows: [number, number][] | undefined = shop && u.w > u.door.w + 1.4
    ? [[-u.door.t + 0.35, -u.door.w / 2 - 0.15], [u.door.w / 2 + 0.15, u.w - u.door.t - 0.35]].filter(([a, b]) => b - a > 0.6) as [number, number][]
    : undefined;
  return { id: u.id, buildingId: bId, x, y: u.y, z, yaw, kind: u.kind, locked: u.locked, hours: u.hours, width: u.door.w, height: u.kind === 'garage' ? 3.6 : DOOR_H, windows };
}
