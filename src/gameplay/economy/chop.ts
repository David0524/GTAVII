import { Rng } from '../core/rng';
import { clamp, hash32, usd } from './types';

/**
 * The chop shop's weekly wanted list (PLACEHOLDER classes and colours). The list is a pure function
 * of the week number, so a save never needs to store it and every client sees the same board.
 * Each entry can be filled once. Pay = class base x condition, where condition is 0..1 (damage taken
 * on the way in), landing in $100-$600. A car that fits no open entry only fetches scrap money.
 */
export type CarClass = 'compact' | 'wagon' | 'sedan' | 'truck' | 'coupe' | 'luxury';
export const CLASS_BASE: Record<CarClass, number> = {
  compact: usd(450), wagon: usd(520), sedan: usd(650), truck: usd(750), coupe: usd(950), luxury: usd(1500),
};
export const ERA_COLOURS = ['avocado', 'harvest gold', 'burnt orange', 'brown', 'tan', 'cream', 'black', 'white'] as const;
export type EraColour = typeof ERA_COLOURS[number];
const CLASSES = Object.keys(CLASS_BASE) as CarClass[];
export const ENTRIES_PER_WEEK = 2;
export const SCRAP_FRACTION = 0.1;

export interface ChopEntry { id: string; week: number; cls: CarClass; colour: EraColour; minCondition: number }
export interface Car { cls: CarClass; colour: EraColour; condition: number }
export interface ChopResult { ok: boolean; cents: number; entry?: string; reason?: 'no_match' | 'condition' | 'filled' | 'scrap' }

/** Deterministic weekly list. */
export function chopList(week: number, seed = 74): ChopEntry[] {
  const r = new Rng(hash32(seed, week, 0xc40b));
  const out: ChopEntry[] = [];
  for (let i = 0; i < ENTRIES_PER_WEEK; i++) {
    out.push({ id: `chop.w${week}.${i}`, week, cls: r.pick(CLASSES), colour: r.pick(ERA_COLOURS), minCondition: 0.5 + 0.05 * r.int(0, 7) });
  }
  return out;
}
/** Pay for a delivery at a given condition. */
export const chopPay = (cls: CarClass, condition: number) => Math.round(CLASS_BASE[cls] * clamp(condition, 0, 1));

export class ChopShop {
  private filled = new Set<string>();
  constructor(private seed = 74) {}
  list(week: number) { return chopList(week, this.seed).map((e) => ({ ...e, filled: this.filled.has(e.id) })); }
  open(week: number) { return this.list(week).filter((e) => !e.filled); }
  /** Deliver a car for the week's list. A match pays class x condition once; anything else is scrap. */
  deliver(week: number, car: Car): ChopResult {
    const hit = chopList(week, this.seed).find((e) => e.cls === car.cls && e.colour === car.colour);
    if (hit) {
      if (this.filled.has(hit.id)) return { ok: false, cents: Math.round(CLASS_BASE[car.cls] * SCRAP_FRACTION * car.condition), entry: hit.id, reason: 'filled' };
      if (car.condition < hit.minCondition) return { ok: false, cents: Math.round(CLASS_BASE[car.cls] * SCRAP_FRACTION * car.condition), entry: hit.id, reason: 'condition' };
      this.filled.add(hit.id);
      return { ok: true, cents: chopPay(car.cls, car.condition), entry: hit.id };
    }
    return { ok: false, cents: Math.round(CLASS_BASE[car.cls] * SCRAP_FRACTION * car.condition), reason: 'no_match' };
  }
  serialize() { return [...this.filled]; }
  restore(f: string[]) { this.filled = new Set(f); }
}
