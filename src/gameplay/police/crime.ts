/**
 * Crimes and how bad they are. Severity is "heat" on a 0–6 scale; a report's response tier comes from it.
 * Noise (m) is how far the act carries on an open street; street canyons extend it (CANYON) because
 * gunfire echoes down the avenues — the same effect the audio stream renders.
 */
export type CrimeKind =
  | 'vandalism' | 'menacing' | 'assault' | 'assault_weapon' | 'theft' | 'carjack' | 'shots_fired' | 'shooting'
  | 'homicide' | 'assault_officer' | 'officer_down' | 'resisting' | 'bribery_attempt' | 'hit_and_run' | 'reckless'
  /** a gun carried in plain sight (not pointed at anyone): someone calls it in */
  | 'weapon_seen'
  /** setting a fire on purpose (molotov, arson) */
  | 'arson'
  /** jumping the subway turnstile */
  | 'fare_evasion';

export const SEVERITY: Record<CrimeKind, number> = {
  vandalism: 0.8, reckless: 0.6, weapon_seen: 0.9, arson: 3.2, fare_evasion: 0.4, menacing: 1.4, resisting: 1.0, bribery_attempt: 1.5, assault: 2.0, theft: 2.0, assault_weapon: 2.6,
  carjack: 2.6, hit_and_run: 2.8, shots_fired: 3.0, shooting: 4.0, assault_officer: 4.2, homicide: 5.0, officer_down: 6.0,
};
export const NOISE: Record<CrimeKind, number> = {
  vandalism: 25, reckless: 30, weapon_seen: 6, arson: 35, fare_evasion: 8, menacing: 8, resisting: 15, bribery_attempt: 3, assault: 15, theft: 12, assault_weapon: 18,
  carjack: 20, hit_and_run: 35, shots_fired: 0 /* weapon noise */, shooting: 0, assault_officer: 18, homicide: 15, officer_down: 0,
};
export const CANYON = 1.25;
export const MAX_HEAT = 6.5;

export interface Crime {
  id: number;
  kind: CrimeKind;
  /** the perpetrator's actor id (internal truth; the police never read it, only descriptions) */
  perp: string;
  at: [number, number, number];
  time: number;
  /** override noise radius (gunshots use the weapon's) */
  noise?: number;
  victim?: string;
  /** visible act? Silent knife work in an alley is still visible to someone looking. */
  visible: boolean;
}
export const radiusOf = (c: Crime) => (c.noise ?? NOISE[c.kind]) * CANYON;
/** Worst crime, +0.3 per other distinct kind, +0.05 per repeat of a kind (capped +0.3): walking past six
 *  people with a gun showing is one problem seen six times, not six problems. */
export function reportSeverity(kinds: CrimeKind[]): number {
  if (!kinds.length) return 0;
  const distinct = [...new Set(kinds)].map((k) => SEVERITY[k]).sort((a, b) => b - a);
  const repeats = kinds.length - distinct.length;
  return Math.min(MAX_HEAT, distinct[0] + 0.3 * (distinct.length - 1) + Math.min(0.3, 0.05 * repeats));
}
