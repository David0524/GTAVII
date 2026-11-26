/**
 * Facade openings for a unit: the single source of truth for where the facade must be cut
 * (street door, recessed alcove, display windows, transom). Used by the interior generators,
 * the test-scene shells and (via ENGINE_REQUESTS) the engine's facade builder, so the hole in
 * the outside wall always matches the reveals inside.
 *
 * Coordinates: s along the unit's frontage (0..w from the unit origin), y above the unit floor.
 */
import type { UnitRec } from './indexFormat';
import { isCoreKind } from './indexFormat';

export interface FacadeOpening { s0: number; s1: number; y0: number; y1: number; kind: 'door' | 'alcove' | 'window' | 'transom' }
export type Era = 'original' | 'deco' | 'modern';

function h(seed: number, k: number) { let x = Math.imul(seed ^ (k * 0x9e3779b9), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

/** Storefront remodel era from the building year and the unit seed (deterministic). */
export function unitEra(u: UnitRec, year: number): Era {
  const r = h(u.seed, 1), r2 = h(u.seed, 2);
  if (year < 1915) return r < 0.45 ? 'modern' : r2 < 0.4 ? 'deco' : 'original';
  if (year < 1940) return r < 0.5 ? 'modern' : 'deco';
  return 'modern';
}
/** Ground-floor ceiling height for a unit's building. */
export const groundCeiling = (fh: number) => Math.max(3.2, Math.min(4.6, fh * 1.12));
export const DOOR_H = 2.25;
export const PARTY_INSET = 0.12;

export function facadeOpenings(u: UnitRec, year: number, fh: number): FacadeOpening[] {
  const H = groundCeiling(fh), era = unitEra(u, year);
  const dt = u.door.t, dw = u.door.w, recess = u.door.recess;
  const winTop = Math.min(H - 0.35, 2.9);
  const out: FacadeOpening[] = [];
  if (isCoreKind(u.kind) || u.kind === 'pool_hall' || u.kind === 'gym' || u.kind === 'cinema_lobby' || u.kind === 'hero') {
    const wide = u.kind === 'garage';
    out.push({ s0: dt - dw / 2, s1: dt + dw / 2, y0: 0, y1: wide ? 3.6 : DOOR_H, kind: 'door' });
    if (!wide && winTop - DOOR_H > 0.4) out.push({ s0: dt - dw / 2, s1: dt + dw / 2, y0: DOOR_H + 0.08, y1: winTop, kind: 'transom' });
    return out;
  }
  const sill = u.kind === 'bar' ? 0.9 : era === 'modern' ? 0.35 : 0.55;
  const alcW = recess > 0 ? dw + 1.0 : dw;
  const a0 = dt - alcW / 2, a1 = dt + alcW / 2;
  out.push({ s0: a0, s1: a1, y0: 0, y1: recess > 0 ? winTop : DOOR_H, kind: recess > 0 ? 'alcove' : 'door' });
  for (const [s0, s1] of [[PARTY_INSET + 0.3, a0 - 0.2], [a1 + 0.2, u.w - PARTY_INSET - 0.3]] as [number, number][]) {
    if (s1 - s0 < 0.7) continue;
    out.push({ s0, s1, y0: sill, y1: winTop, kind: 'window' });
  }
  if (recess === 0 && winTop - DOOR_H > 0.4) out.push({ s0: a0, s1: a1, y0: DOOR_H + 0.08, y1: winTop, kind: 'transom' });
  return out;
}
