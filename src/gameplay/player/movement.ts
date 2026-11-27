/**
 * The rules side of on-foot movement (MOVEMENT.md, user decision 2026-11-27: "Make sure we have character
 * physics like climbing, stepping on a curb without having to jump..."). The engine detects traversal and
 * moves the body; characters animate it; gameplay decides WHAT IS ALLOWED WHEN, what it costs and what it
 * does to you. Pure functions plus tables, so the engine and the UI read the same numbers.
 *
 * Kerbs and stoop steps (<= 0.40 m) are autostep in the engine: no action, no cost, no rule.
 */
import { fallDamage } from '../health/Health';

export type MoveAction =
  | 'sprint' | 'vault' | 'climb' | 'fenceClimb' | 'ladder' | 'dropLadder' | 'roofJump' | 'hangDrop'
  | 'turnstileVault' | 'shoulderBarge' | 'roll' | 'cover' | 'aim' | 'fire' | 'melee' | 'enterVehicle' | 'crouch' | 'tackle';
export type Carrying = 'none' | 'bag' | 'crate' | 'body';

/** Everything the rules look at. The facade builds it from health, stamina, intox and the player context. */
export interface MoverState {
  carrying: Carrying;
  /** 0..1 from injury (Health.effects().limp) */
  limp: number;
  legCrippled: boolean;
  /** 0..1.2 worst arm wear; >= 1 is a crippled arm */
  armWear: number;
  intox: number;
  staminaValue: number;
  exhausted: boolean;
  aiming: boolean;
  inCover: boolean;
  inVehicle: boolean;
  surrendered: boolean;
  cuffed: boolean;
  burning: boolean;
  bleeding: boolean;
}
export const IDLE_MOVER: MoverState = { carrying: 'none', limp: 0, legCrippled: false, armWear: 0, intox: 0, staminaValue: 100, exhausted: false, aiming: false, inCover: false, inVehicle: false, surrendered: false, cuffed: false, burning: false, bleeding: false };

/** Heights the engine classifies (m). Below STEP is autostep; VAULT is taken at speed; CLIMB needs a hand plant. */
export const HEIGHTS = { step: 0.40, vaultMin: 0.5, vaultMax: 1.2, climbMax: 2.2, fenceMax: 3.6 } as const;

/**
 * Stamina costs (points; a fit lead has 60-100). Sprint drains continuously (stamina.ts DRAIN = 11/s, more
 * in the heat). An action you can't pay for is refused, except the hang-drop and the crouch, which are free.
 */
export const STAMINA_COST: Record<Exclude<MoveAction, 'sprint'>, number> = {
  vault: 6, climb: 14, fenceClimb: 18, ladder: 0, dropLadder: 4, roofJump: 12, hangDrop: 0, turnstileVault: 5,
  shoulderBarge: 10, roll: 5, cover: 0, aim: 0, fire: 0, melee: 0, enterVehicle: 0, crouch: 0, tackle: 12,
};
/** Ladders and fire-escape stairs: per metre climbed. */
export const LADDER_PER_M = 1.6;

export interface Verdict { ok: boolean; reason?: string }
const no = (reason: string): Verdict => ({ ok: false, reason });
const yes: Verdict = { ok: true };

/**
 * What's allowed when. The engine asks before it commits a traversal; the UI greys the button with `reason`.
 * Carrying a body or a crate takes both hands: no climbing, vaulting, guns, melee or cover.
 */
export function allowed(a: MoveAction, s: MoverState): Verdict {
  if (s.cuffed && a !== 'crouch') return no('cuffed');
  if (s.surrendered && !['crouch', 'hangDrop'].includes(a)) return no('hands up');
  if (s.inVehicle && a !== 'aim' && a !== 'fire') return no('in a vehicle');
  const twoHands = s.carrying === 'body' || s.carrying === 'crate';
  const cost = a === 'sprint' ? 0 : STAMINA_COST[a];
  if (cost > 0 && s.staminaValue < cost) return no('out of breath');
  switch (a) {
    case 'sprint':
      if (s.carrying === 'body') return no('carrying a body');
      if (s.exhausted) return no('out of breath');
      if (s.legCrippled) return no('bad leg');
      if (s.inCover) return no('in cover');
      if (s.intox >= DRUNK.legless) return no('too drunk');
      return yes; // aiming is dropped by sprinting (the engine releases aim)
    case 'vault':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      if (s.legCrippled) return no('bad leg');
      if (s.intox >= DRUNK.drunk) return no('too drunk');
      return yes;
    case 'climb': case 'ladder': case 'dropLadder':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      if (s.armWear >= 1) return no('bad arm');
      if (a === 'climb' && s.legCrippled) return no('bad leg');
      if (s.intox >= DRUNK.legless) return no('too drunk');
      return yes;
    case 'fenceClimb':
      if (twoHands) return no(`carrying a ${s.carrying}`); // a bag goes over first
      if (s.armWear >= 1) return no('bad arm');
      if (s.legCrippled) return no('bad leg');
      if (s.intox >= DRUNK.drunk) return no('too drunk');
      return yes;
    case 'roofJump':
      if (s.carrying !== 'none') return no(s.carrying === 'bag' ? 'not with the bag' : `carrying a ${s.carrying}`);
      if (s.limp > 0.3) return no('bad leg');
      if (s.exhausted) return no('out of breath');
      if (s.intox >= DRUNK.tipsy) return no('too drunk');
      return yes;
    case 'hangDrop': return yes;
    case 'turnstileVault':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      if (s.legCrippled) return no('bad leg');
      return yes;
    case 'shoulderBarge':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      if (s.burning) return no('on fire');
      return yes;
    case 'roll':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      return yes;
    case 'cover':
      if (s.carrying === 'body') return no('carrying a body');
      return yes; // a crate can be set down behind cover
    case 'aim': case 'fire':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      return yes;
    case 'melee':
      if (twoHands) return no(`carrying a ${s.carrying}`);
      return yes;
    case 'enterVehicle':
      if (s.carrying === 'body') return no('put it in the trunk');
      return yes;
    case 'tackle':
      if (s.carrying !== 'none') return no(`carrying a ${s.carrying}`);
      if (s.legCrippled) return no('bad leg');
      if (s.intox >= DRUNK.legless) return no('too drunk');
      if (s.inCover) return no('in cover');
      return yes;
    case 'crouch': return yes;
  }
}

/**
 * The tackle (a foot-chase finisher; narrative's `finish: "tackle"`). Close within reach of the quarry at a run and
 * press: a dive at the legs. Non-lethal: a few points of damage and the quarry is down for STUN seconds (pinned for
 * PIN while you hold them). A miss sends you sprawling (STUMBLE seconds without control) and costs the stamina anyway.
 * Touch gets one button with auto-align: a longer reach and a wider cone.
 */
export const TACKLE = { reach: 2.4, touchReach: 2.9, coneDeg: 60, touchConeDeg: 120, minSpeed: 3, base: 0.85, walking: 0.45, damage: 5, stun: 4, pin: 3, stumble: 0.9 } as const;
export function tackleChance(o: { sprinting: boolean; speed: number; quarrySpeed: number; strength: number; s: MoverState }) {
  const d = o.s.intox, drunkK = d < DRUNK.tipsy ? 0 : Math.min(1, (d - DRUNK.tipsy) / (DRUNK.legless - DRUNK.tipsy));
  let p = o.speed >= TACKLE.minSpeed ? TACKLE.base : TACKLE.walking;
  if (o.quarrySpeed > o.speed + 1) p -= 0.25;          // diving at someone pulling away
  p += 0.12 * (o.strength - 50) / 50;
  p -= 0.4 * o.s.limp + 0.3 * drunkK + (o.s.exhausted ? 0.15 : 0);
  return Math.max(0.05, Math.min(0.95, p));
}

/** Drink thresholds (intox 0..1, 1974 bar measures: a beer +0.12, a whiskey +0.2). */
export const DRUNK = { tipsy: 0.3, drunk: 0.6, legless: 0.85 } as const;

export interface Locomotion {
  /** multiplies every gait's speed */
  speedMul: number;
  canSprint: boolean;
  /** degrees of body and camera sway (drink, a bad arm doesn't sway the body) */
  swayDeg: number;
  /** turn rate multiplier: drink and a limp make pivots wider */
  turnMul: number;
  /** stop distance multiplier: momentum carries further when drunk */
  stopMul: number;
  /** chance per kerb or stair taken at a sprint of a stumble (a short ragdoll-blend) */
  stumbleOnStep: number;
  /** chance per second of sprinting of a stumble on flat ground */
  stumblePerSprintS: number;
  /** characters' gait layer: none | limp | drunk | carry */
  gait: 'normal' | 'limp' | 'drunk' | 'carry_heavy' | 'tired';
}
/** Injury, drink, load and breath, combined. Characters pick the gait layer; the engine scales speeds and turns. */
export function locomotion(s: MoverState, staminaFrac = 1): Locomotion {
  const d = s.intox;
  const drunkK = d < DRUNK.tipsy ? 0 : Math.min(1, (d - DRUNK.tipsy) / (DRUNK.legless - DRUNK.tipsy));
  const load = s.carrying === 'body' ? 0.55 : s.carrying === 'crate' ? 0.75 : s.carrying === 'bag' ? 0.95 : 1;
  const limpMul = 1 - 0.45 * s.limp;
  const tired = staminaFrac < 0.2;
  const speedMul = +(limpMul * load * (1 - 0.3 * drunkK) * (s.bleeding ? 0.92 : 1)).toFixed(3);
  const canSprint = allowed('sprint', s).ok;
  const gait = s.carrying === 'body' || s.carrying === 'crate' ? 'carry_heavy' : s.limp > 0.25 ? 'limp' : d >= DRUNK.tipsy ? 'drunk' : tired ? 'tired' : 'normal';
  return {
    speedMul, canSprint,
    swayDeg: +(d >= DRUNK.tipsy ? 1.5 + 6 * drunkK : 0).toFixed(2),
    turnMul: +((1 - 0.35 * drunkK) * (1 - 0.3 * s.limp)).toFixed(3),
    stopMul: +(1 + 0.8 * drunkK).toFixed(3),
    stumbleOnStep: +Math.min(0.6, 0.35 * drunkK + 0.25 * s.limp + (tired ? 0.08 : 0)).toFixed(3),
    stumblePerSprintS: +Math.min(0.3, 0.12 * drunkK).toFixed(3),
    gait,
  };
}

/**
 * Combat movement. Speeds are multipliers of the engine's run speed (about 5 m/s).
 * Sprinting drops aim; there's no firing at a sprint; pistols fire on the jog, long guns at a walk.
 */
export const COMBAT_MOVE = {
  aimWalk: 0.42,           // strafing while aiming
  aimJogPistol: 0.62,      // a handgun can be fired at a jog (wider spread: aim.ts moveFrac)
  coverShuffle: 0.32,      // moving along cover, crouched
  coverToCover: 1.0,       // the dash between cover points runs at full run speed
  crouchWalk: 0.45,
  blindFireSpreadMul: 2.6,
} as const;

/**
 * Landing. Free below ~2.9 m (7.5 m/s, Health.fallDamage). A ROLL on landing (timed, or automatic when moving
 * fast) halves the damage up to 6 m. Fall damage lands on a leg (Health: wear = damage / 40), so unrolled:
 * a limp from ~4.4 m, a broken leg (no sprint, no climbing) from ~6 m; rolled, the legs are fine to ~6 m.
 * From 6 m it's a ragdoll landing; about 14 m (five storeys) is fatal for a 100 hp lead.
 */
export const FALL = { safe: 2.9, rollMax: 6, ragdollFrom: 6 } as const;
export function landing(heightM: number, rolled: boolean): { damage: number; ragdoll: boolean; rolled: boolean } {
  const canRoll = rolled && heightM <= FALL.rollMax;
  return { damage: Math.round(fallDamage(heightM) * (canRoll ? 0.5 : 1)), ragdoll: heightM >= FALL.ragdollFrom, rolled: canRoll };
}

/**
 * Shoulder-barging a locked door (MOVEMENT.md: "shoulder-barge locked ones (gameplay rules)").
 * Each attempt costs stamina and makes noise; success depends on the door and the lead's strength (0-100).
 * Steel and fire doors don't give: they need a crowbar or the keys. Barging a door that isn't yours is a crime
 * (vandalism, heard) the caller reports; a police lock (a 1970s brace bar) needs a tool.
 */
export const DOORS = {
  interior: { chance: 0.6, noise: 18 },
  apartment: { chance: 0.25, noise: 24 },   // a deadbolt and a chain
  shop_back: { chance: 0.15, noise: 26 },
  police_lock: { chance: 0, noise: 26 },    // the brace bar: no
  steel: { chance: 0, noise: 30 },
} as const;
export type DoorKind = keyof typeof DOORS;
export const BARGE_SECONDS = 1.3;
export function bargeChance(door: DoorKind, strength: number, s: MoverState) {
  const base = DOORS[door].chance; if (base === 0) return 0;
  return Math.min(0.95, base * (0.6 + 0.8 * strength / 100) * (s.armWear >= 0.6 ? 0.6 : 1) * (s.intox >= DRUNK.drunk ? 0.8 : 1));
}

/**
 * The turnstile vault: fare evasion, a crime only if someone sees it. The token-booth clerk is always
 * watching their own turnstiles (witness chance 0.9 within 15 m), a transit cop on the platform makes it
 * an immediate stop; noise is a rattle (10 m).
 */
export const TURNSTILE = { noise: 10, clerkWitness: 0.9, clerkRange: 15 } as const;
