/**
 * Per-lead skills (FEATURE_AUDIT): stamina, strength, shooting, driving, stealth, lockwork, on a
 * 0–100 scale. They start where the narrative's lead sheets put them (1–10 × 10) and improve with use,
 * quickly at first and slowly near the top (diminishing returns), so playing a lead to their
 * weaknesses is possible but never erases who they are. Effects are small and readable.
 */
export type Skill = 'stamina' | 'strength' | 'shooting' | 'driving' | 'stealth' | 'lockwork';
export const SKILLS: readonly Skill[] = ['stamina', 'strength', 'shooting', 'driving', 'stealth', 'lockwork'];
export type Skills = Record<Skill, number>;

/** XP units per skill-point at level L: gains slow as L rises. */
export const costAt = (L: number) => 1 + L / 25;
/** Usage events and how much each one teaches. */
export const TEACH: Record<string, [Skill, number]> = {
  sprintSecond: ['stamina', 0.02], meleeHit: ['strength', 0.15], shotHit: ['shooting', 0.12], headshot: ['shooting', 0.3],
  driveMinute: ['driving', 0.25], cleanGetaway: ['driving', 0.8], sneakSecond: ['stealth', 0.02], unseenTakedown: ['stealth', 0.6], lockPicked: ['lockwork', 1.0], hotwired: ['lockwork', 0.8],
};
export function learn(s: Skills, event: keyof typeof TEACH | string, times = 1): number {
  const t = TEACH[event]; if (!t) return 0;
  const [k, amt] = t;
  const before = s[k];
  let xp = amt * times;
  while (xp > 0 && s[k] < 100) { const c = costAt(s[k]); const step = Math.min(xp / c, 1); s[k] = Math.min(100, s[k] + step); xp -= step * c; }
  return s[k] - before;
}
/** Effects on play. */
export const effects = (s: Skills) => ({
  aimMul: 1.15 - 0.3 * (s.shooting / 100),      // 1.15 (0) → 0.85 (100), on top of the lead's family skill
  meleeDamage: 0.85 + 0.35 * (s.strength / 100),
  staminaBase: 60 + 0.8 * s.stamina,            // 60 → 140
  sneakNoise: 1 - 0.5 * (s.stealth / 100),
  lockTime: 1.6 - 1.0 * (s.lockwork / 100),     // seconds multiplier for slim jim / hot-wire / locks
  handling: 0.85 + 0.3 * (s.driving / 100),
});
