/**
 * Stamina (FEATURE_AUDIT): sprinting drains it, the 1974 summer heat drains it faster, walking
 * recovers it (standing faster), and the pool grows with use (fitness). At empty you can't sprint
 * until it recovers past RECOVER_GATE, which stops sprint-tapping exploits. Cops on foot use the same
 * model, so a long foot chase really can be won by outrunning a tired patrolman. Accessibility:
 * `unlimited` turns drain off entirely (settings key unlimitedSprint, ENGINE_REQUESTS 3).
 */
export const DRAIN = 11, WALK_RECOVER = 7, IDLE_RECOVER = 12, RECOVER_GATE = 0.3, HEAT_FROM_F = 80;
export interface StaminaState { value: number; max: number; base: number; exhausted: boolean; sprintSeconds: number }

export function makeStamina(base: number): StaminaState { return { value: base, max: base, base, exhausted: false, sprintSeconds: 0 }; }
/** Heat multiplier on drain: 1 at ≤ 80°F, 1.5 at 95°F (a July afternoon in the canyons). */
export function heatMul(tempF: number) { return 1 + Math.max(0, tempF - HEAT_FROM_F) / 30; }

/** Advance one step. `mode` is what the body is doing. Returns whether sprint is allowed this frame. */
export function stepStamina(s: StaminaState, dt: number, mode: 'sprint' | 'run' | 'walk' | 'idle', tempF = 80, unlimited = false): boolean {
  if (unlimited) { s.value = s.max; s.exhausted = false; return true; }
  if (mode === 'sprint' && !s.exhausted) {
    s.value = Math.max(0, s.value - DRAIN * heatMul(tempF) * dt);
    s.sprintSeconds += dt;
    // fitness: +1 max per 20 s of sprinting, up to +40% of base
    s.max = Math.min(s.base * 1.4, s.base + s.sprintSeconds / 20);
    if (s.value <= 0) s.exhausted = true;
  } else {
    const r = mode === 'idle' ? IDLE_RECOVER : mode === 'walk' ? WALK_RECOVER : mode === 'run' ? 2 : 0;
    s.value = Math.min(s.max, s.value + r * dt);
    if (s.exhausted && s.value >= s.max * RECOVER_GATE) s.exhausted = false;
  }
  return !s.exhausted;
}
/** Speed multiplier for a tiring runner (cops in a foot chase): full until 35%, then down to 60%. */
export function tiredMul(s: StaminaState) { const f = s.value / s.max; return f > 0.35 ? 1 : 0.6 + (0.4 * f) / 0.35; }
