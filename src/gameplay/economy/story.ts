/**
 * Story mission pay, from narrative's mission files (content/missions/*.json, `rewards`).
 *
 * User decision (2026-11-26, relayed by oversight, verbatim): "Yes, but in GTA VI you can really rack up
 * money. Like 10s of thousands". So missions pay on the genre's scale: ordinary jobs in the hundreds to low
 * thousands, the big scores $10k-$50k+. Everyday 1974 prices stay real (coffee 20¢, a token 35¢).
 *
 * Narrative owns the numbers (narrative/tools/pay.py is the single source); gameplay reads:
 *   rewards.money        the base total
 *   rewards.moneyByLead  {charId: cents in DOLLARS} per wallet (each lead keeps their own)
 *   rewards.moneyIf      [{flag, lead, money, why}] applied at completion when the choice flag is set
 */
import { usd } from './types';

export interface StoryMission {
  id: string; number: number; act: number; playAs: string; durationMin: number;
  /** cents per lead */
  pay: Record<string, number>;
  /** alternative outcomes, cents */
  branches: { flag: string; lead: string; cents: number; why?: string }[];
  /** a debt run up in the mission (Brownout), repaid automatically from the lead's next income */
  debt?: { lead: string; cents: number; owedTo?: string };
}
/** One-off side content (content/side/*.json): a completion payout to whoever plays it. */
export interface SidePiece { id: string; leads: string[]; durationMin: number; heat: number; cents: number }
export function sideFromNarrative(side: readonly Json[]): SidePiece[] {
  return side.map((x) => ({ id: x.id, leads: x.leads ?? ['any'], durationMin: Number(x.durationMin ?? 15), heat: Number(x.heat ?? 0), cents: usd(Number(x.money ?? x.rewards?.money ?? 0)) }));
}

type Json = Record<string, any>;
/** Narrative's mission files (or gameplay's snapshot of their rewards) → ordered story pay. */
export function storyFromNarrative(missions: readonly Json[]): StoryMission[] {
  return missions
    .map((m) => {
      const r: Json = m.rewards ?? m;
      const byLead: Json = r.moneyByLead ?? {};
      const pay: Record<string, number> = {};
      for (const [k, v] of Object.entries(byLead)) pay[k] = usd(Number(v));
      // a base total with no split goes to whoever plays it
      if (!Object.keys(pay).length && r.money && m.playAs) pay[m.playAs] = usd(Number(r.money));
      return {
        id: m.id, number: Number(m.number ?? 0), act: Number(m.act ?? 1), playAs: m.playAs ?? '', durationMin: Number(m.durationMin ?? 15), pay,
        branches: (r.moneyIf ?? []).map((b: Json) => ({ flag: b.flag, lead: b.lead, cents: usd(Number(b.money)), why: b.why })),
        ...(r.debt ? { debt: { lead: r.debt.lead, cents: usd(Number(r.debt.amount)), owedTo: r.debt.owedTo } } : {}),
      };
    })
    .sort((a, b) => a.number - b.number);
}

/** Total base pay, cents. */
export const storyTotal = (s: readonly StoryMission[]) => s.reduce((a, m) => a + Object.values(m.pay).reduce((x, y) => x + y, 0), 0);
/** Real hours of mission play on the critical path. */
export const storyHours = (s: readonly StoryMission[]) => s.reduce((a, m) => a + m.durationMin, 0) / 60;
/** Mission income per real hour of mission play (the 1.0x reference). */
export const storyRatePerRealHour = (s: readonly StoryMission[]) => storyTotal(s) / Math.max(1e-6, storyHours(s));
