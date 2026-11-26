import { Rng } from '../core/rng';
import { hash32, LOOT_CATEGORIES, usd, type LootCategory, type Lot } from './types';

/**
 * Fences and pawnshops (PLACEHOLDER roster).
 *
 * Price paid = street value x cut x saturation, where
 *   - cut: a fence pays 30-50% (more for its specialty); a pawnshop 12-25%, always below any fence;
 *   - saturation factor = 1 / (1 + sat), sat rising by (value / satCap) with every sale in that
 *     category and decaying exponentially with a time constant of SAT_TAU_H game hours (3 days), so
 *     dumping the same thing on the same fence has diminishing returns and the price recovers over
 *     game days;
 *   - the weekly want list pays a premium (added to the cut) on 2 categories per fence, up to a cap
 *     of street value per entry; want sales saturate at half rate.
 */
export interface FenceDef {
  id: string; name: string; kind: 'fence' | 'pawn';
  /** base cut of street value */
  cut: number;
  /** categories the fence pays a higher cut for (+0.06) */
  specialty: readonly LootCategory[];
  accepts: readonly LootCategory[];
  /** street value that halves the price when sold into one category */
  satCap: number;
}
export const SAT_TAU_H = 72;
const SPECIALTY_BONUS = 0.06;

export const DEFAULT_FENCES: FenceDef[] = [
  { id: 'fence.lund', name: 'Lund (back of a watch repair)', kind: 'fence', cut: 0.44, specialty: ['jewelry', 'silver'], accepts: ['jewelry', 'silver', 'furs'], satCap: usd(4500) },
  { id: 'fence.kessel', name: 'Kessel (appliance warehouse)', kind: 'fence', cut: 0.40, specialty: ['electronics', 'appliances'], accepts: ['electronics', 'appliances', 'liquor'], satCap: usd(6000) },
  { id: 'fence.drago', name: 'Drago (garment loft)', kind: 'fence', cut: 0.42, specialty: ['furs', 'liquor'], accepts: ['furs', 'liquor', 'silver', 'jewelry'], satCap: usd(5000) },
  { id: 'fence.mercer', name: 'Mercer (anything, for less)', kind: 'fence', cut: 0.32, specialty: [], accepts: LOOT_CATEGORIES, satCap: usd(7000) },
  { id: 'pawn.golden', name: 'Golden Ball Loans', kind: 'pawn', cut: 0.22, specialty: [], accepts: LOOT_CATEGORIES, satCap: usd(9000) },
  { id: 'pawn.eighth', name: 'Eighth Ave Pawn', kind: 'pawn', cut: 0.18, specialty: [], accepts: LOOT_CATEGORIES, satCap: usd(9000) },
];

export interface WantEntry { id: string; fence: string; category: LootCategory; premium: number; remaining: number }
export interface Quote { fence: string; cents: number; cut: number; factor: number; want?: string }

export class Fences {
  readonly defs = new Map<string, FenceDef>();
  private sat = new Map<string, { s: number; t: number }>();
  private wants: WantEntry[] = [];
  private wantWeek = -1;
  constructor(defs: readonly FenceDef[] = DEFAULT_FENCES, private seed = 74) {
    for (const d of defs) this.defs.set(d.id, d);
  }

  /** Current saturation (0 = fresh market) for a fence and category. */
  saturation(fence: string, cat: LootCategory, nowH: number): number {
    const st = this.sat.get(`${fence}|${cat}`); if (!st) return 0;
    return st.s * Math.exp(-Math.max(0, nowH - st.t) / SAT_TAU_H);
  }
  /** Deterministic weekly want list: two categories per fence at a premium, from the week number alone. */
  rollWeek(week: number) {
    if (week === this.wantWeek) return;
    this.wantWeek = week; this.wants = [];
    let i = 0;
    for (const d of this.defs.values()) {
      if (d.kind !== 'fence') continue;
      const r = new Rng(hash32(this.seed, week, i++));
      const pool = [...d.accepts];
      for (let k = 0; k < 2 && pool.length; k++) {
        const cat = pool.splice(r.int(0, pool.length - 1), 1)[0];
        this.wants.push({ id: `want.w${week}.${d.id}.${k}`, fence: d.id, category: cat, premium: Math.round(r.range(0.12, 0.25) * 100) / 100, remaining: usd(r.int(2000, 5000)) });
      }
    }
  }
  wantList(week: number): readonly WantEntry[] { this.rollWeek(week); return this.wants; }

  private wantFor(fence: string, cat: LootCategory): WantEntry | undefined {
    return this.wants.find((w) => w.fence === fence && w.category === cat && w.remaining > 0);
  }

  quote(fence: string, lot: Lot, nowH: number): Quote | null {
    const d = this.defs.get(fence);
    if (!d || !d.accepts.includes(lot.category)) return null;
    const sat = this.saturation(fence, lot.category, nowH);
    const w = d.kind === 'fence' ? this.wantFor(fence, lot.category) : undefined;
    const cut = d.cut + (d.specialty.includes(lot.category) ? SPECIALTY_BONUS : 0) + (w ? w.premium : 0);
    const factor = 1 / (1 + (w ? sat / 2 : sat));
    return { fence, cents: Math.round(lot.cents * cut * factor), cut, factor, want: w?.id };
  }
  /** Sell a lot; returns the cash paid (0 if the fence will not take it). Raises saturation. */
  sell(fence: string, lot: Lot, nowH: number): Quote | null {
    const q = this.quote(fence, lot, nowH); if (!q) return null;
    const d = this.defs.get(fence)!;
    const key = `${fence}|${lot.category}`;
    const add = lot.cents / d.satCap * (q.want ? 0.5 : 1);
    this.sat.set(key, { s: this.saturation(fence, lot.category, nowH) + add, t: nowH });
    if (q.want) { const w = this.wants.find((x) => x.id === q.want)!; w.remaining = Math.max(0, w.remaining - lot.cents); }
    return q;
  }
  /** The best current offer; pawnshops only if `pawn` (they never beat a fence for the same lot). */
  best(lot: Lot, nowH: number, pawn = true): Quote | null {
    let b: Quote | null = null;
    for (const d of this.defs.values()) {
      if (d.kind === 'pawn' && !pawn) continue;
      const q = this.quote(d.id, lot, nowH);
      if (q && (!b || q.cents > b.cents)) b = q;
    }
    return b;
  }
  serialize() { return { sat: Object.fromEntries(this.sat), wants: this.wants, wantWeek: this.wantWeek }; }
  restore(o: ReturnType<Fences['serialize']>) { this.sat = new Map(Object.entries(o.sat)); this.wants = o.wants; this.wantWeek = o.wantWeek; }
}
