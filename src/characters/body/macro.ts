/**
 * Macro body parameters → weights of the MakeHuman (CC0) macro targets. Our own formulation:
 * piecewise-linear weights per factor, multiplied across factors (a multilinear lattice).
 * Shared by the offline build (sampling the body space) and the runtime (evaluating a body).
 */
export interface MacroParams {
  /** 0 = female, 1 = male (in-between values are allowed: the build space is continuous). */
  sex: number;
  /** Age in years (the build space covers 11..90; the game spawns adults only: no child characters anywhere). */
  age: number;
  /** 0..1, 0.5 average. */
  muscle: number;
  /** 0..1, 0.5 average. */
  weight: number;
  /** 0..1, 0.5 average (the lattice's height target, before the uniform stature scale). */
  height: number;
  /** 0..1, 0.5 neutral; >0.5 towards "ideal", <0.5 towards "uncommon" proportions. */
  proportions: number;
  /** Ancestry blend for the skeletal/facial base shape (normalised internally). Skin tone is separate. */
  african: number; asian: number; caucasian: number;
}

export const DEFAULT_MACRO: MacroParams = { sex: 0.5, age: 25, muscle: 0.5, weight: 0.5, height: 0.5, proportions: 0.5, african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 };

const tri = (v: number): [number, number, number] => {
  // weights for min / average / max at 0 / 0.5 / 1
  v = Math.min(1, Math.max(0, v));
  return v < 0.5 ? [1 - v * 2, v * 2, 0] : [0, 2 - v * 2, v * 2 - 1];
};
/** Youngest age any body may be built at. The game has adults only (CHARACTERS_BRIEF): a hard floor. */
export const MIN_ADULT_AGE = 18;
/** Age in years → [child, young, old] weights (11 → child, 25 → young, 90 → old). Clamped to adults. */
export function ageWeights(years: number): [number, number, number] {
  const y = Math.min(90, Math.max(MIN_ADULT_AGE, Number.isFinite(years) ? years : MIN_ADULT_AGE));
  if (y <= 25) { const t = (y - 11) / 14; return [1 - t, t, 0]; }
  const t = (y - 25) / 65; return [0, 1 - t, t];
}

export const SEXES = ['female', 'male'] as const;
export const AGES = ['child', 'young', 'old'] as const;
export const MUSCLES = ['minmuscle', 'averagemuscle', 'maxmuscle'] as const;
export const WEIGHTS = ['minweight', 'averageweight', 'maxweight'] as const;
export const RACES = ['african', 'asian', 'caucasian'] as const;

/** All macro target names, in a fixed order (the build stores per-target data in this order). */
export function macroTargetNames(): string[] {
  const out: string[] = [];
  for (const s of SEXES) for (const a of AGES) for (const m of MUSCLES) for (const w of WEIGHTS) out.push(`macrodetails/universal-${s}-${a}-${m}-${w}`);
  for (const r of RACES) for (const s of SEXES) for (const a of AGES) out.push(`macrodetails/${r}-${s}-${a}`);
  for (const s of SEXES) for (const a of AGES) for (const m of MUSCLES) for (const w of WEIGHTS) for (const h of ['minheight', 'maxheight']) out.push(`macrodetails/height/${s}-${a}-${m}-${w}-${h}`);
  for (const s of SEXES) for (const a of AGES) for (const m of MUSCLES) for (const w of WEIGHTS) for (const p of ['uncommonproportions', 'idealproportions']) out.push(`macrodetails/proportions/${s}-${a}-${m}-${w}-${p}`);
  return out;
}

/** Weights for macroTargetNames(), same order. */
export function macroTargetWeights(p: MacroParams): Float32Array {
  const sw = [1 - Math.min(1, Math.max(0, p.sex)), Math.min(1, Math.max(0, p.sex))];
  const aw = ageWeights(p.age), mw = tri(p.muscle), ww = tri(p.weight);
  const rs = Math.max(1e-6, p.african + p.asian + p.caucasian);
  const rw = [p.african / rs, p.asian / rs, p.caucasian / rs];
  const h = Math.min(1, Math.max(0, p.height)), pr = Math.min(1, Math.max(0, p.proportions));
  const hw = [Math.max(0, (0.5 - h) * 2), Math.max(0, (h - 0.5) * 2)];
  const pw = [Math.max(0, (0.5 - pr) * 2), Math.max(0, (pr - 0.5) * 2)];
  const out: number[] = [];
  for (let s = 0; s < 2; s++) for (let a = 0; a < 3; a++) for (let m = 0; m < 3; m++) for (let w = 0; w < 3; w++) out.push(sw[s] * aw[a] * mw[m] * ww[w]);
  for (let r = 0; r < 3; r++) for (let s = 0; s < 2; s++) for (let a = 0; a < 3; a++) out.push(rw[r] * sw[s] * aw[a]);
  for (let s = 0; s < 2; s++) for (let a = 0; a < 3; a++) for (let m = 0; m < 3; m++) for (let w = 0; w < 3; w++) for (let k = 0; k < 2; k++) out.push(sw[s] * aw[a] * mw[m] * ww[w] * hw[k]);
  for (let s = 0; s < 2; s++) for (let a = 0; a < 3; a++) for (let m = 0; m < 3; m++) for (let w = 0; w < 3; w++) for (let k = 0; k < 2; k++) out.push(sw[s] * aw[a] * mw[m] * ww[w] * pw[k]);
  return Float32Array.from(out);
}
