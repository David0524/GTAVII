/**
 * Building condition: one grade per building, shared by the engine's facades (Phase 3) and the
 * interiors stream, so a building reads the same inside and out (worn down ... beautiful).
 *
 *   0 DERELICT   boarded shopfronts, broken panes, heavy soot, peeling/absent signage, vacant
 *   1 WORN       soot streaks, faded/peeling paint and signs, patched glass, rusted fire escapes
 *   2 LIVED_IN   typical 1974 Midtown: grimy but maintained, mixed old/new signage
 *   3 KEPT       cleaned masonry, working neon, polished brass, fresh awnings
 *   4 PRISTINE   landmark-grade upkeep: hotels, department stores, prime offices
 *
 * Deterministic from building data (no randomness at runtime): the same id always yields the same grade.
 * Weights are period-informed (DOCUMERICA references): side streets and the West Side skew worn;
 * avenue frontages, landmarks and big offices skew kept. Content (narrative/interiors) may override per
 * place id; the override wins on both sides of the wall.
 */
export const enum Condition { Derelict = 0, Worn = 1, LivedIn = 2, Kept = 3, Pristine = 4 }
export const CONDITION_NAMES = ['derelict', 'worn', 'lived_in', 'kept', 'pristine'] as const;

export interface ConditionInput {
  id: number;
  year: number;
  style: number; // chunkFormat Style
  use: number; // PLUTO land use (1-11)
  floors: number;
  flags: number; // chunkFormat BuildingFlag (Hero = 1)
  /** Distance in metres from the nearest avenue centreline (frontage vs mid-block side street). */
  avenueDistance?: number;
  /** World x (west side skews worn in 1974). */
  x?: number;
}

function hash01(n: number) { let h = Math.imul(n ^ 0x2c1b3c6d, 0x297a2d39); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; }

export function buildingCondition(b: ConditionInput, override?: Condition): Condition {
  if (override !== undefined) return override;
  if (b.flags & 1) return Condition.Pristine; // heroes are hand-dressed, kept
  let score = 2.0;
  if (b.style === 5 /* SetbackTower */ || b.style === 4 /* PrewarOffice */) score += 0.7;
  if (b.style === 1 /* Tenement */) score -= 0.5;
  if (b.style === 7 /* LowCommercial */) score -= 0.3;
  if (b.floors >= 15) score += 0.4;
  if (b.year >= 1950) score += 0.4; // newer buildings: less soot accumulated
  if (b.year < 1900) score -= 0.4;
  if (b.use === 5 /* commercial office */) score += 0.2;
  if (b.use === 6 /* industrial */) score -= 0.3;
  if (b.avenueDistance !== undefined) score += b.avenueDistance < 30 ? 0.4 : -0.3;
  if (b.x !== undefined && b.x < -900) score -= 0.4; // west of Eighth Ave
  score += (hash01(b.id) - 0.5) * 1.6; // spread within the block
  return Math.max(0, Math.min(4, Math.round(score))) as Condition;
}
