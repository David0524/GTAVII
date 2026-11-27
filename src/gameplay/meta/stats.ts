/**
 * Stats and completion feed for the UI chat's stats page and checklist (FEATURE_AUDIT). Gameplay counts;
 * the UI presents. Everything is derived from gameplay events, so nothing else needs to remember to
 * report. Per lead and totals; saved with gameplay's section.
 */
export type StatKey =
  | 'distanceOnFoot' | 'distanceDriven' | 'shotsFired' | 'shotsHit' | 'headshots' | 'kills' | 'copsKilled' | 'knockouts' | 'meleeHits' | 'parries'
  | 'timesWasted' | 'timesArrested' | 'bribesPaid' | 'bribeCents' | 'bribesRefused' | 'witnessesSilenced' | 'reportsAgainst' | 'carsStolen' | 'carsBought'
  | 'propsBroken' | 'hydrantsOpened' | 'firesStarted' | 'moneyEarned' | 'moneySpent' | 'hospitalCents' | 'phoneCalls' | 'outfitsBought' | 'nightsSlept' | 'chasesEscaped';
export const STAT_KEYS: readonly StatKey[] = ['distanceOnFoot', 'distanceDriven', 'shotsFired', 'shotsHit', 'headshots', 'kills', 'copsKilled', 'knockouts', 'meleeHits', 'parries', 'timesWasted', 'timesArrested', 'bribesPaid', 'bribeCents', 'bribesRefused', 'witnessesSilenced', 'reportsAgainst', 'carsStolen', 'carsBought', 'propsBroken', 'hydrantsOpened', 'firesStarted', 'moneyEarned', 'moneySpent', 'hospitalCents', 'phoneCalls', 'outfitsBought', 'nightsSlept', 'chasesEscaped'];

/** Completion checklist items gameplay can verify (narrative adds story items). */
export const CHECKLIST: { id: string; label: string; test: (s: Record<StatKey, number>) => boolean }[] = [
  { id: 'chk.bribe', label: 'Square a cop', test: (s) => s.bribesPaid >= 1 },
  { id: 'chk.escape', label: 'Lose the police in a chase', test: (s) => s.chasesEscaped >= 1 },
  { id: 'chk.quiet', label: 'Talk a witness out of it', test: (s) => s.witnessesSilenced >= 1 },
  { id: 'chk.car', label: 'Own a car', test: (s) => s.carsBought >= 1 },
  { id: 'chk.wardrobe', label: 'Buy a new outfit', test: (s) => s.outfitsBought >= 1 },
  { id: 'chk.parry', label: 'Parry ten blows', test: (s) => s.parries >= 10 },
  { id: 'chk.knockout', label: 'Put someone down without a sound', test: (s) => s.knockouts >= 1 },
  { id: 'chk.hydrant', label: 'Open a hydrant on a hot day', test: (s) => s.hydrantsOpened >= 1 },
];

export class Stats {
  readonly by = new Map<string, Record<StatKey, number>>();
  private blank() { return Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Record<StatKey, number>; }
  of(lead: string) { let s = this.by.get(lead); if (!s) this.by.set(lead, (s = this.blank())); return s; }
  add(lead: string, k: StatKey, n = 1) { this.of(lead)[k] += n; }
  totals() { const t = this.blank(); for (const s of this.by.values()) for (const k of STAT_KEYS) t[k] += s[k]; return t; }
  accuracy(lead?: string) { const s = lead ? this.of(lead) : this.totals(); return s.shotsFired ? s.shotsHit / s.shotsFired : 0; }
  checklist() { const t = this.totals(); return CHECKLIST.map((c) => ({ id: c.id, label: c.label, done: c.test(t) })); }
  serialize() { return Object.fromEntries(this.by); }
  deserialize(d: Record<string, Partial<Record<StatKey, number>>> | undefined) { this.by.clear(); for (const [l, s] of Object.entries(d ?? {})) this.by.set(l, { ...this.blank(), ...s }); }
}
