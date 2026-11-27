/**
 * Who someone is to look at: body, face, skin, hair and facial hair, from a seed.
 * Variety comes from continuous parameters (skin tone, build, age, face shape, hair), never from
 * caricature: facial modifiers stay within moderate ranges for everyone. The population mix is a
 * rough midtown-Manhattan-1974 street mix (docs/WARDROBE_1974.md §5.1); it biases probabilities,
 * and every background draws from the same full ranges of build, age, hair and dress.
 */
import { Rng } from '../util/rng';
import type { BodyDesc } from './BodyModel';
import { MIN_ADULT_AGE, DEFAULT_MACRO } from './macro';

export type HairStyle =
  | 'bald' | 'buzz' | 'short' | 'sidePart' | 'slick' | 'combOver' | 'pompadour' | 'shag' | 'earLength' | 'feathered' | 'curlyMid' | 'afro' | 'afroShort'
  | 'longStraight' | 'bob' | 'ponytail' | 'braid' | 'updo' | 'setCurls' | 'cornrows' | 'flip';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'horseshoe' | 'sideburns' | 'moustacheSideburns' | 'beard' | 'goatee';

export interface SkinDesc {
  /** sRGB hex of the mid-tone (forearm) colour. */
  tone: string;
  /** 0..1 melanin estimate (drives SSS colour and how freckles/redness read). */
  melanin: number;
  redness: number; freckles: number; ageSpots: number;
  /** Heat/sweat sheen multiplier. */
  sheen: number;
}
export interface HairDesc {
  style: HairStyle;
  color: string;
  /** 0 straight … 1 tightly coiled. */
  texture: number;
  grey: number;
  /** Hairline recession 0..1 (temples), crown thinning 0..1. */
  recession: number; thinning: number;
  /** Volume multiplier for the style. */
  volume: number;
  length: number;
  parting: -1 | 0 | 1;
}
export interface Appearance {
  seed: number;
  sex: number; age: number;
  body: BodyDesc;
  /** Target stature in metres (barefoot). */
  stature: number;
  skin: SkinDesc;
  hair: HairDesc;
  facialHair: FacialHair;
  facialHairColor: string;
  eyeColor: string;
  /** Posture: 0 upright … 1 stooped (age, heat, fatigue). */
  slump: number;
  /** Gait character: stride scale, arm swing, bounce. */
  gait: { stride: number; swing: number; bounce: number; speed: number };
}

interface Background { w: number; tone: [string, string]; anc: [number, number, number]; texture: [number, number]; hairCols: [string, number][]; eyes: [string, number][] }
const DARK_HAIR: [string, number][] = [['#1a1412', 5], ['#2a1e16', 3], ['#3e2a1c', 1]];
const BROWN_EYES: [string, number][] = [['#3a2414', 5], ['#5a3a1e', 2], ['#20140c', 2]];
const BACKGROUNDS: Background[] = [
  // European-descended New Yorkers (Irish, Italian, Jewish, Greek, Polish …)
  { w: 50, tone: ['#ecd0b8', '#c09070'], anc: [0.03, 0.02, 0.95], texture: [0, 0.45], hairCols: [['#2a1e16', 3], ['#4a3222', 3], ['#6a4a30', 2], ['#8a6a44', 1], ['#b89060', 0.6], ['#7a3a1e', 0.5], ['#1a1412', 2]], eyes: [['#3a2414', 3], ['#5a6a7a', 2], ['#4a6a4a', 1], ['#6a5a3a', 1]] },
  // Black New Yorkers (African American, Caribbean)
  { w: 24, tone: ['#8a5a3c', '#3a2216'], anc: [0.85, 0.02, 0.13], texture: [0.75, 1], hairCols: DARK_HAIR, eyes: BROWN_EYES },
  // Puerto Rican, Dominican and other Latin American New Yorkers (a wide, mixed range)
  { w: 18, tone: ['#d4aa84', '#6a4428'], anc: [0.3, 0.05, 0.65], texture: [0.2, 0.95], hairCols: [['#1a1412', 4], ['#2a1e16', 3], ['#4a3222', 1.5]], eyes: BROWN_EYES },
  // Chinese and other East Asian New Yorkers
  { w: 5, tone: ['#e0c09c', '#b88c64'], anc: [0.02, 0.9, 0.08], texture: [0, 0.15], hairCols: [['#141010', 5], ['#221814', 2]], eyes: [['#2a1a10', 5], ['#3a2414', 2]] },
  // South Asian, Middle Eastern and others
  { w: 3, tone: ['#c8a07c', '#6e4a30'], anc: [0.15, 0.2, 0.65], texture: [0.1, 0.6], hairCols: DARK_HAIR, eyes: BROWN_EYES },
];

const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
};
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; };

export interface AppearanceOpts { sex?: number; age?: number; minAge?: number; maxAge?: number; overrides?: Partial<Appearance> }

export function generateAppearance(seed: number, opts: AppearanceOpts = {}): Appearance {
  const rng = new Rng(seed);
  const r = { body: rng.fork(1), face: rng.fork(2), skin: rng.fork(3), hair: rng.fork(4) };
  const sex = opts.sex ?? (rng.chance(0.6) ? 1 : 0); // weekday avenue mix (doc §5.1)
  const age = opts.age ?? Math.round(rng.weighted<[number, number]>([[[18, 35], 40], [[36, 59], 40], [[60, 86], 20]]).reduce((a, b) => a + rng.next() * (b - a)));
  // adults only: callers can narrow the range but never go below MIN_ADULT_AGE
  const clampAge = Math.max(MIN_ADULT_AGE, Math.min(opts.maxAge ?? 90, Math.max(opts.minAge ?? MIN_ADULT_AGE, Number.isFinite(age) ? age : MIN_ADULT_AGE)));
  const bg = rng.weighted(BACKGROUNDS.map((b) => [b, b.w] as const));
  const male = sex >= 0.5;

  // --- body ---
  const ageW = clampAge > 40 ? (clampAge - 40) / 50 : 0;
  const weight = r.body.normal(0.42 + ageW * 0.18, 0.13, 0.05, 0.95);
  const muscle = r.body.normal(male ? 0.52 : 0.42, 0.12, 0.1, 0.9) - ageW * 0.1;
  const anc = bg.anc.map((a) => Math.max(0.01, a + r.body.normal(0, 0.12))) as [number, number, number];
  const macro = { ...DEFAULT_MACRO, sex, age: clampAge, weight, muscle, height: r.body.normal(0.5, 0.15, 0.1, 0.9), proportions: r.body.normal(0.55, 0.12, 0.3, 0.85), african: anc[0], asian: anc[1], caucasian: anc[2] };
  const stature = (male ? r.body.normal(1.755, 0.07, 1.55, 1.98) : r.body.normal(1.625, 0.065, 1.45, 1.82)) - ageW * 0.03;
  const locals: Record<string, number> = {};
  const L = (k: string, sd: number, rr = r.face) => { locals[k] = rr.normal(0, sd, -1, 1); };
  // face (moderate ranges for everyone)
  for (const k of ['nose/nose-scale-horiz-incr', 'nose/nose-scale-vert-incr', 'nose/nose-scale-depth-incr', 'nose/nose-hump-incr', 'nose/nose-point-width-incr', 'nose/nose-nostrils-width-incr', 'nose/nose-volume-incr', 'nose/nose-trans-up', 'nose/nose-curve-convex', 'nose/nose-point-up']) L(k, 0.28);
  for (const k of ['mouth/mouth-scale-horiz-incr', 'mouth/mouth-scale-vert-incr', 'mouth/mouth-lowerlip-volume-incr', 'mouth/mouth-upperlip-volume-incr', 'mouth/mouth-trans-up', 'mouth/mouth-angles-up']) L(k, 0.25);
  for (const k of ['chin/chin-prominent-incr', 'chin/chin-width-incr', 'chin/chin-height-incr', 'chin/chin-jaw-drop-incr', 'cheek/lr-cheek-bones-incr', 'cheek/lr-cheek-volume-incr', 'forehead/forehead-scale-vert-incr', 'eyebrows/eyebrows-trans-up', 'eyebrows/eyebrows-angle-up']) L(k, 0.28);
  for (const k of ['eyes/lr-eye-scale-incr', 'eyes/lr-eye-trans-up', 'eyes/lr-eye-height2-incr', 'eyes/lr-eye-bag-incr', 'ears/lr-ear-scale-incr', 'ears/lr-ear-flap-incr', 'ears/lr-ear-lobe-incr', 'head/head-scale-horiz-incr', 'head/head-scale-vert-incr', 'head/head-fat-incr']) L(k, 0.25);
  // one dominant head-shape tendency
  locals[`head/head-${r.face.pick(['oval', 'round', 'square', 'rectangular', 'triangular', 'diamond'])}`] = r.face.range(0.15, 0.55);
  // small natural asymmetry
  for (const k of ['asym/asym-eye-1-l', 'asym/asym-nose-1-r', 'asym/asym-mouth-1-l', 'asym/asym-jaw-1-r', 'asym/asym-brown-1-l']) locals[k] = r.face.range(0, 0.35);
  // build details
  for (const k of ['measure/measure-waist-circ-incr', 'measure/measure-hips-circ-incr', 'measure/measure-shoulder-dist-incr', 'measure/measure-neck-circ-incr', 'measure/measure-upperarm-circ-incr', 'measure/measure-thigh-circ-incr', 'measure/measure-calf-circ-incr', 'torso/torso-vshape-incr']) L(k, 0.25, r.body);
  if (!male) { locals['measure/measure-bust-circ-incr'] = r.body.normal(0, 0.25, -0.8, 0.8); }
  if (clampAge > 55) { locals['head/head-age-incr'] = (clampAge - 55) / 35 * 0.8; locals['neck/neck-double-incr'] = weight > 0.55 ? r.body.range(0, 0.5) : 0; }

  // --- skin ---
  const t = r.skin.next();
  const tone = mix(bg.tone[0], bg.tone[1], t);
  const melanin = 1 - lum(tone);
  const skin: SkinDesc = {
    tone, melanin,
    redness: r.skin.range(0.1, 0.6) * (1 - melanin * 0.6),
    freckles: bg === BACKGROUNDS[0] && r.skin.chance(0.2) ? r.skin.range(0.2, 0.8) : 0,
    ageSpots: Math.max(0, (clampAge - 50) / 40) * r.skin.range(0.2, 1),
    sheen: r.skin.range(0.6, 1.2),
  };

  // --- hair ---
  const texture = r.hair.range(bg.texture[0], bg.texture[1]);
  const grey = Math.min(1, Math.max(0, (clampAge - 35) / 40 + r.hair.normal(0, 0.15)));
  const coily = texture > 0.7;
  let style: HairStyle;
  if (male) {
    style = clampAge < 35
      ? r.hair.weighted<HairStyle>([['shag', coily ? 0.5 : 45], ['earLength', coily ? 0 : 20], ['short', 20], ['afro', coily ? 40 : 1], ['afroShort', coily ? 25 : 0], ['curlyMid', texture > 0.4 ? 10 : 2], ['feathered', coily ? 0 : 8], ['cornrows', coily ? 3 : 0]])
      : clampAge < 60
        ? r.hair.weighted<HairStyle>([['sidePart', coily ? 3 : 30], ['short', 25], ['slick', coily ? 0 : 10], ['pompadour', coily ? 0 : 4], ['afroShort', coily ? 30 : 0], ['earLength', coily ? 0 : 8], ['combOver', 6], ['buzz', 5]])
        : r.hair.weighted<HairStyle>([['sidePart', coily ? 2 : 25], ['short', 25], ['combOver', 15], ['slick', 8], ['bald', 10], ['buzz', 8], ['afroShort', coily ? 20 : 0]]);
  } else {
    style = clampAge < 35
      ? r.hair.weighted<HairStyle>([['longStraight', coily ? 3 : 40], ['shag', 20], ['bob', 15], ['afro', coily ? 35 : 1], ['ponytail', 6], ['braid', coily ? 8 : 4], ['updo', 5], ['feathered', coily ? 0 : 8], ['flip', 4], ['cornrows', coily ? 4 : 0]])
      : clampAge < 50
        ? r.hair.weighted<HairStyle>([['bob', 25], ['shag', 15], ['flip', 15], ['setCurls', 15], ['longStraight', coily ? 1 : 10], ['afroShort', coily ? 25 : 0], ['updo', 10]])
        : r.hair.weighted<HairStyle>([['setCurls', 70], ['bob', 12], ['updo', 10], ['afroShort', coily ? 15 : 0]]);
  }
  const baseHair = r.hair.weighted(bg.hairCols);
  const recession = male ? Math.max(0, (clampAge - 25) / 50 * r.hair.range(0, 1.4)) : 0;
  const hair: HairDesc = {
    style: male && recession > 0.85 && style !== 'combOver' && r.hair.chance(0.5) ? 'bald' : style,
    color: mix(baseHair, clampAge > 60 ? '#d8d4cc' : '#8a8680', grey * 0.85), texture, grey,
    recession: Math.min(1, recession), thinning: male ? Math.min(1, Math.max(0, (clampAge - 35) / 45 * r.hair.range(0, 1.3))) : 0,
    volume: r.hair.range(0.8, 1.2), length: r.hair.range(0.8, 1.2), parting: r.hair.pick([-1, 0, 1] as const),
  };
  // facial hair (men 20–50: moustache 30%, sideburns 30%, beard 5%; doc §5.6)
  let facialHair: FacialHair = 'none';
  if (male && clampAge >= 18) {
    const p = clampAge <= 50 ? 1 : 0.5;
    facialHair = r.hair.weighted<FacialHair>([['none', 40], ['moustache', 18 * p], ['moustacheSideburns', 12 * p], ['sideburns', 18 * p], ['horseshoe', 4 * p], ['beard', 5 * p], ['goatee', 2 * p], ['stubble', 10]]);
  }
  const out: Appearance = {
    seed, sex, age: clampAge, body: { macro, locals }, stature, skin, hair, facialHair,
    facialHairColor: mix(hair.color, '#2a1e16', 0.15), eyeColor: r.face.weighted(bg.eyes),
    slump: Math.min(1, Math.max(0, (clampAge - 50) / 40 + r.body.normal(0, 0.12))),
    gait: { stride: r.body.normal(1, 0.06, 0.85, 1.15) * (clampAge > 65 ? 0.85 : 1), swing: r.body.normal(1, 0.2, 0.5, 1.5), bounce: r.body.normal(1, 0.2, 0.6, 1.4), speed: r.body.normal(1, 0.08, 0.75, 1.2) * (clampAge > 65 ? 0.8 : 1) },
    ...opts.overrides,
  };
  // overrides can't make anyone younger than an adult either (age and the body's macro age)
  out.age = Math.max(MIN_ADULT_AGE, out.age);
  out.body = { ...out.body, macro: { ...out.body.macro, age: Math.max(MIN_ADULT_AGE, out.body.macro.age) } };
  return out;
}
