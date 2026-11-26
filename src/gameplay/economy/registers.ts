import type { Rng } from '../core/rng';
import type { CrimeFn } from './types';
import { usd } from './types';

/**
 * Shop registers and back-office safes (PLACEHOLDER shops; Interiors supplies the real markers).
 *
 * Till model: each register has a level L in 0..1. A robbery empties it (L = 0); then
 *   L(t) = 1 - (1 - L0) * exp(-dt / TILL_TAU_H)   (dt in game hours since the last hit)
 * so repeat robberies of the same shop pay little: hitting again after 6 h gets about 3% of a full till.
 * Takings = base x time-of-day curve x L x (0.85..1.15 noise) x (armed ? 1 : 0.6, the clerk stalls).
 * Safes refill far more slowly (SAFE_TAU_H) and take time to open: crack minutes shrink with lockwork,
 * and every minute inside is a chance the noise brings someone.
 */
export interface ShopDef { id: string; name: string; base: number; safe?: number }
export const TILL_TAU_H = 72;
export const SAFE_TAU_H = 168;
/** Evening takings peak before the deposit; mornings are thin; the late night is bars only. */
export const TILL_TOD: readonly number[] = [0.55, 0.45, 0.35, 0.3, 0.3, 0.4, 0.5, 0.6, 0.65, 0.7, 0.75, 0.85, 0.9, 0.85, 0.8, 0.85, 0.95, 1.0, 1.05, 1.1, 1.1, 1.05, 0.9, 0.7];
export const SAFE_BASE_MINUTES = 45;
const UNARMED_MULT = 0.6;

export const DEFAULT_SHOPS: ShopDef[] = [
  { id: 'shop.newsstand_8th', name: 'Eighth Ave newsstand', base: usd(28) },
  { id: 'shop.deli_9th', name: 'Ninth Ave deli', base: usd(45), safe: usd(60) },
  { id: 'shop.liquor_w34', name: 'West 34th liquor', base: usd(70), safe: usd(110) },
  { id: 'shop.diner_deuce', name: 'Deuce all-night diner', base: usd(52) },
  { id: 'shop.bar_corner', name: 'Corner tap room', base: usd(63), safe: usd(100) },
  { id: 'shop.drug_7th', name: 'Seventh Ave drugstore', base: usd(60), safe: usd(85) },
  { id: 'shop.theatre_box', name: 'Deuce movie-house box office', base: usd(90), safe: usd(160) },
  { id: 'shop.market_10th', name: 'Tenth Ave market', base: usd(45) },
];

export interface RobberyResult { cents: number; shop: string; level: number; armed: boolean }
export interface SafeResult { cents: number; minutes: number; interrupted: boolean; shop: string }

export class Registers {
  readonly shops = new Map<string, ShopDef>();
  private till = new Map<string, { l: number; t: number }>();
  private safe = new Map<string, { l: number; t: number }>();
  constructor(defs: readonly ShopDef[] = DEFAULT_SHOPS) { for (const d of defs) this.shops.set(d.id, d); }

  private level(m: Map<string, { l: number; t: number }>, id: string, nowH: number, tau: number) {
    const st = m.get(id); if (!st) return 1;
    return 1 - (1 - st.l) * Math.exp(-Math.max(0, nowH - st.t) / tau);
  }
  tillLevel(id: string, nowH: number) { return this.level(this.till, id, nowH, TILL_TAU_H); }
  safeLevel(id: string, nowH: number) { return this.level(this.safe, id, nowH, SAFE_TAU_H); }
  /** Hour of day 0..23 from an absolute game hour. */
  static hourOf(nowH: number) { return Math.floor(((nowH % 24) + 24) % 24); }
  /** Expected full-till takings now (no noise, armed). */
  expected(id: string, nowH: number): number {
    const d = this.shops.get(id); if (!d) return 0;
    return d.base * TILL_TOD[Registers.hourOf(nowH)] * this.tillLevel(id, nowH);
  }
  /** The most promising shop right now (a smart player cases the ones not hit lately). */
  best(nowH: number): string {
    let b = '', bv = -1;
    for (const id of this.shops.keys()) { const v = this.expected(id, nowH); if (v > bv) { bv = v; b = id; } }
    return b;
  }
  bestSafe(nowH: number): string | null {
    let b: string | null = null, bv = -1;
    for (const d of this.shops.values()) { if (!d.safe) continue; const v = d.safe * this.safeLevel(d.id, nowH); if (v > bv) { bv = v; b = d.id; } }
    return b;
  }
  /** Held up at the counter. Always reports a crime through the callback: `assault_weapon` if armed, else `theft`. */
  rob(shop: string, o: { nowH: number; armed: boolean; rng: Rng; crime: CrimeFn; visible: boolean }): RobberyResult {
    const d = this.shops.get(shop); if (!d) throw new Error(`unknown shop ${shop}`);
    const level = this.tillLevel(shop, o.nowH);
    const cents = Math.round(d.base * TILL_TOD[Registers.hourOf(o.nowH)] * level * o.rng.range(0.85, 1.15) * (o.armed ? 1 : UNARMED_MULT));
    this.till.set(shop, { l: 0, t: o.nowH });
    o.crime(o.armed ? 'assault_weapon' : 'theft', { noise: o.armed ? 18 : 14, visible: o.visible });
    return { cents, shop, level, armed: o.armed };
  }
  /** Minutes to open a shop's safe at a lockwork skill (0..100): 45 min at skill 0 x1.7 down to x0.5 at 100. */
  static crackMinutes(lockwork: number) { return Math.round(SAFE_BASE_MINUTES * (1.7 - 1.2 * lockwork / 100)); }
  /** Work the safe. Interruption odds grow with the minutes spent (noise and the beat cop's round). */
  crack(shop: string, o: { nowH: number; lockwork: number; rng: Rng; crime: CrimeFn; visible: boolean }): SafeResult {
    const d = this.shops.get(shop); if (!d?.safe) throw new Error(`no safe at ${shop}`);
    const minutes = Registers.crackMinutes(o.lockwork);
    const interrupted = o.rng.chance(Math.min(0.6, minutes * 0.006));
    const lvl = this.safeLevel(shop, o.nowH);
    o.crime('theft', { noise: 22, visible: o.visible });
    if (interrupted) return { cents: 0, minutes, interrupted, shop };
    this.safe.set(shop, { l: 0, t: o.nowH });
    return { cents: Math.round(d.safe * lvl * o.rng.range(0.8, 1.2)), minutes, interrupted, shop };
  }
  serialize() { return { till: Object.fromEntries(this.till), safe: Object.fromEntries(this.safe) }; }
  restore(o: ReturnType<Registers['serialize']>) { this.till = new Map(Object.entries(o.till)); this.safe = new Map(Object.entries(o.safe)); }
}
