import type { WeaponDef } from '../data/schema';
import type { Rng } from '../core/rng';
import type { Look } from './wardrobe';

/**
 * Gun quality (CORE_SYSTEMS §7): every firearm a lead owns is an instance of an invented model ×
 * tier × condition.
 *  - street: cheap, inaccurate, jams; service: the reference; quality: accurate, reliable, rare.
 *  - Condition 0..1 wears with every shot (faster in rain) and is restored by cleaning at a safehouse.
 *  - Jams: per-shot chance from tier reliability and condition. Clearing is one readable action
 *    (one tap on mobile, JAM_CLEAR seconds).
 * Sullivan Act sourcing: handguns come from fences, the street and enemies (registry `illicit`).
 */
export type GunTier = 'street' | 'service' | 'quality';
export const TIERS: Record<GunTier, { spread: number; recoil: number; reload: number; jam: number; value: number }> = {
  street: { spread: 1.35, recoil: 1.15, reload: 1.1, jam: 0.02, value: 0.6 },
  service: { spread: 1.0, recoil: 1.0, reload: 1.0, jam: 0.004, value: 1.0 },
  quality: { spread: 0.8, recoil: 0.9, reload: 0.92, jam: 0.0008, value: 1.6 },
};
export const WEAR_PER_SHOT = 0.0025, RAIN_WEAR = 2, JAM_CLEAR = 0.6;

export interface GunState { tier: GunTier; condition: number; jammed: boolean }
export const DEFAULT_GUN: GunState = { tier: 'service', condition: 0.9, jammed: false };

/** Chance a given trigger pull jams: tier base, rising steeply as condition falls. */
export function jamChance(g: GunState) { return TIERS[g.tier].jam * (1 + 6 * Math.pow(1 - g.condition, 2)); }
/** Roll a shot: wears the gun, maybe jams it. Returns true if it fired. */
export function rollShot(g: GunState, rng: Rng, raining = false): boolean {
  if (g.jammed) return false;
  g.condition = Math.max(0, g.condition - WEAR_PER_SHOT * (raining ? RAIN_WEAR : 1));
  if (rng.chance(jamChance(g))) { g.jammed = true; return false; }
  return true;
}
/** A gun taken off an enemy: random condition, tier by faction (street crews carry street guns). */
export function lootGun(rng: Rng, faction: string): GunState {
  const tier: GunTier = faction === 'gang' ? (rng.chance(0.8) ? 'street' : 'service') : faction === 'hood' ? (rng.chance(0.5) ? 'street' : 'service') : rng.chance(0.85) ? 'service' : 'quality';
  return { tier, condition: rng.range(0.35, 0.95), jammed: false };
}
/** Fence value of a gun instance in cents. */
export function gunValue(basePrice: number, g: GunState) { return Math.round(basePrice * TIERS[g.tier].value * (0.4 + 0.6 * g.condition)); }

// ------------------------------------------------------------------ concealment (CORE_SYSTEMS §4)
/** How big a thing is to hide. */
export type Bulk = 'pocket' | 'belt' | 'coat' | 'long';
export function bulkOf(w: WeaponDef): Bulk {
  if (w.bulk) return w.bulk;
  switch (w.id) {
    case 'weapon.fists': case 'weapon.knife': case 'weapon.snub': return 'pocket';
    case 'weapon.service': case 'weapon.pistol': case 'weapon.nightstick': case 'weapon.bottle': return 'belt';
    case 'weapon.sawnoff': case 'weapon.smg': return 'coat';
    default: return w.class === 'melee' ? (w.melee && w.melee.reach > 1.3 ? 'long' : 'belt') : w.class === 'handgun' ? 'belt' : 'long';
  }
}
const RANK: Record<Bulk, number> = { pocket: 0, belt: 1, coat: 2, long: 3 };
/** What an outfit can hide: pockets always; a jacket or sport coat hides a belt gun; a long coat hides a cut-down shotgun. */
export function capacityOf(look: Look): Bulk {
  const nouns = look.pieces.map((p) => p.noun);
  if (nouns.includes('raincoat') || nouns.includes('overcoat') || nouns.includes('trench coat')) return 'coat';
  if (look.pieces.some((p) => p.slot === 'outer' || p.slot === 'full' && p.noun.includes('suit'))) return 'belt';
  return 'pocket';
}
export interface Concealment { capacity: Bulk; visible: string[]; hidden: string[]; bagged: string[]; heatLook: boolean }
/**
 * Carried weapons → what anyone on the street can see. The weapon in hand is always visible.
 * A bag (item.bag) hides one long gun (you can't use it until you take it out).
 * `hot` (°F ≥ 85): a long coat in the summer heat draws looks by itself.
 */
export function conceal(look: Look, carried: WeaponDef[], inHand: string, hasBag: boolean, tempF = 80): Concealment {
  const capacity = capacityOf(look);
  const out: Concealment = { capacity, visible: [], hidden: [], bagged: [], heatLook: capacity === 'coat' && tempF >= 85 };
  let bag = hasBag;
  for (const w of carried) {
    if (w.id === 'weapon.fists') continue;
    if (w.id === inHand) { out.visible.push(w.id); continue; }
    const b = bulkOf(w);
    if (RANK[b] <= RANK[capacity]) out.hidden.push(w.id);
    else if (b === 'long' && bag) { out.bagged.push(w.id); bag = false; }
    else out.visible.push(w.id);
  }
  return out;
}
export function canDraw(c: Concealment, weaponId: string) { return !c.bagged.includes(weaponId); }
