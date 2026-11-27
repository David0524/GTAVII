/**
 * The three leads, built from the same generators with hand-tuned parameters, following the
 * narrative team's appearance sheets (content/cast/leads.json on claude/sharp-maxwell-jnb6hr,
 * commit 7fffd4f): build, height, skin and hair hex, face notes, gait and wardrobe by act.
 * Invented people: no likeness of any real person or film character.
 * Jewellery and small props from the sheets (key ring, medal, bracelet, worry beads, signet
 * ring, camera bag) are noted for the gameplay/prop pass; garments and colours are here.
 */
import { generateAppearance, type Appearance } from './body/appearance';
import { generateOutfit, type Fabric, type Outfit } from './wardrobe/outfit';
import { CLOTH, LEATHER } from './wardrobe/palette';
import type { CharacterBuild } from './Character';

const fab = (color: string, o: Partial<Fabric> = {}): Fabric => ({ color, color2: o.color2 ?? color, pattern: o.pattern ?? 'solid', scale: o.scale ?? 0.02, rough: o.rough ?? 0.8, sheen: o.sheen ?? 0, fade: o.fade ?? 0.1, dirt: o.dirt ?? 0.08 });
const withApp = (seed: number, sex: number, age: number, f: (a: Appearance) => void) => { const a = generateAppearance(seed, { sex, age }); f(a); return a; };
const blank = (seed: number, sex: number, age: number): Outfit => { const o = generateOutfit(seed, { sex, age }); o.outer = null; o.tie = null; o.hat = null; o.glasses = null; o.props = []; o.hosiery = 0; o.dress = false; return o; };

/** Teodoro "Teddy" Arce, 34, 175 cm: medium build going soft at the middle, slight stoop. */
function teddy(): CharacterBuild {
  const appearance = withApp(1974_0001, 1, 34, (a) => {
    Object.assign(a.body.macro, { weight: 0.58, muscle: 0.55, height: 0.5, proportions: 0.5, african: 0.22, asian: 0.03, caucasian: 0.75 });
    a.body.locals = { ...a.body.locals, 'measure/measure-waist-circ-incr': 0.3, 'armslegs/lr-lowerarm-muscle-incr': 0.5, 'eyebrows/eyebrows-trans-up': -0.3, 'nose/nose-hump-incr': 0.5, 'asym/asym-nose-1-r': 0.6, 'eyes/lr-eye-eyefold-up': -0.3 };
    a.stature = 1.75;
    a.skin = { ...a.skin, tone: '#b98a67', melanin: 0.42, freckles: 0, redness: 0.2, ageSpots: 0 };
    a.hair = { ...a.hair, style: 'sidePart', color: '#1c1814', texture: 0.3, grey: 0.12, recession: 0.1, thinning: 0, volume: 1.05, parting: -1 };
    a.facialHair = 'stubble'; a.facialHairColor = '#1c1814'; a.eyeColor = '#3a2414';
    a.slump = 0.3; a.gait = { stride: 1.0, swing: 0.8, bounce: 0.9, speed: 0.95 };
  });
  const act1 = (): Outfit => {
    const o = blank(11, 1, 34);
    o.top = { kind: 'dressShirt', sleeve: 0.45, collar: 'spread', collarPoint: 0.1, open: 1, tucked: true, fit: 0.012, fabric: fab(CLOTH.khaki, { fade: 0.3, color2: CLOTH.khaki }) };
    o.bottom = { kind: 'trousers', rise: 0.02, flare: 0.025, length: 2.06, fit: 0.016, fabric: fab(CLOTH.suitBrown, { sheen: 0.25 }), belt: fab(LEATHER.black, { rough: 0.5 }) };
    o.shoes = { kind: 'oxford', color: LEATHER.black, color2: '#1a1614', sole: 0.014, heel: 0.022, wear: 0.75 };
    o.socks = CLOTH.black; o.sweat = 1.1;
    return o;
  };
  const act2 = (): Outfit => {
    const o = act1(); o.top.sleeve = 1.97; o.top.fabric = fab(CLOTH.offWhite); o.top.open = 1;
    o.outer = { kind: 'sportCoat', length: 0.27, lapel: 0.105, open: 1, sleeve: 1.97, belted: false, fabric: fab(CLOTH.beige, { rough: 0.75, sheen: 0.15 }) };
    o.tie = { ...fab(CLOTH.brownTan, { sheen: 0.3, rough: 0.6 }), width: 0.11 };
    return o;
  };
  const act2Wet = (): Outfit => { const o = act2(); o.outer = { kind: 'windbreaker', length: 0.08, lapel: 0, open: 0.4, sleeve: 1.97, belted: false, fabric: fab(CLOTH.navy, { sheen: 0.25 }) }; return o; };
  const act3 = (): Outfit => { const o = act1(); o.top = { ...o.top, sleeve: 1.3, fabric: fab(CLOTH.white, { fade: 0.02 }), open: 1 }; o.bottom.fabric = fab(CLOTH.charcoal); return o; };
  const act3Night = (): Outfit => { const o = act3(); o.outer = { kind: 'windbreaker', length: 0.08, lapel: 0, open: 0.3, sleeve: 1.97, belted: false, fabric: fab(CLOTH.navy, { sheen: 0.25 }) }; return o; };
  const epilogue = (): Outfit => { const o = act3(); o.top.sleeve = 1.97; o.outer = { kind: 'suitJacket', length: 0.28, lapel: 0.11, open: 0, sleeve: 1.97, belted: false, fabric: fab(CLOTH.suitGrey) }; o.bottom.fabric = o.outer.fabric; o.tie = { ...fab(CLOTH.navy, { sheen: 0.3 }), width: 0.11 }; return o; };
  return { appearance, outfit: act1(), wardrobeSets: { act1, act2, act2_wet: act2Wet, act3, act3_night: act3Night, epilogue, default: act1 } };
}

/** Delphine Moore, 29, 178 cm: tall and long-limbed, a presser's strong shoulders and hands. */
function delphine(): CharacterBuild {
  const appearance = withApp(1974_0002, 0, 29, (a) => {
    Object.assign(a.body.macro, { weight: 0.38, muscle: 0.58, height: 0.75, proportions: 0.65, african: 0.85, asian: 0.02, caucasian: 0.13 });
    a.body.locals = { ...a.body.locals, 'measure/measure-shoulder-dist-incr': 0.35, 'armslegs/lr-hand-scale-incr': 0.2, 'cheek/lr-cheek-bones-incr': 0.5, 'eyes/lr-eye-trans-out': 0.3 };
    a.stature = 1.78;
    a.skin = { ...a.skin, tone: '#5a3825', melanin: 0.78, freckles: 0, redness: 0.08, ageSpots: 0 };
    a.hair = { ...a.hair, style: 'afroShort', color: '#141010', texture: 0.95, grey: 0, recession: 0, thinning: 0, volume: 0.3 };
    a.facialHair = 'none'; a.eyeColor = '#2a1a10'; a.slump = 0.0;
    a.gait = { stride: 1.12, swing: 0.9, bounce: 0.85, speed: 1.08 };
  });
  const act1 = (): Outfit => {
    const o = blank(21, 0, 29);
    const jersey = fab(CLOTH.oxblood, { sheen: 0.3, rough: 0.7 });
    o.dress = true;
    o.top = { kind: 'blouse', sleeve: 0.95, collar: 'v', collarPoint: 0.08, open: 0, tucked: true, fit: 0.004, fabric: jersey };
    o.bottom = { kind: 'skirt', rise: 0, flare: 0.07, length: 0.03, fit: 0.006, fabric: jersey, belt: null };
    o.shoes = { kind: 'pump', color: LEATHER.black, color2: '#1a1614', sole: 0.012, heel: 0.04, wear: 0.3 };
    o.props = ['shoulderBag'];
    return o;
  };
  const act2 = (): Outfit => {
    const o = blank(22, 0, 29);
    o.top = { kind: 'blouse', sleeve: 0.4, collar: 'spread', collarPoint: 0.08, open: 1, tucked: true, fit: 0.006, fabric: fab(CLOTH.cream, { sheen: 0.3 }) };
    o.bottom = { kind: 'trousers', rise: 0.04, flare: 0.05, length: 2.1, fit: 0.008, fabric: fab(CLOTH.navy), belt: fab(LEATHER.brown) };
    o.outer = { kind: 'raincoat', length: 0.55, lapel: 0.09, open: 0.6, sleeve: 1.97, belted: true, fabric: fab(CLOTH.trench) };
    o.shoes = { kind: 'sandal', color: LEATHER.tan, color2: '#3a2a1e', sole: 0.01, heel: 0.012, wear: 0.4 };
    o.props = ['shoulderBag'];
    return o;
  };
  const act3 = (): Outfit => {
    const o = blank(23, 0, 29);
    const camel = fab(CLOTH.camel, { rough: 0.75 });
    o.top = { kind: 'shell', sleeve: 0.05, collar: 'scoop', collarPoint: 0.08, open: 0, tucked: true, fit: 0.004, fabric: fab(CLOTH.cream) };
    o.bottom = { kind: 'trousers', rise: 0.04, flare: 0.06, length: 2.12, fit: 0.007, fabric: camel, belt: null };
    o.outer = { kind: 'suitJacket', length: 0.22, lapel: 0.1, open: 0, sleeve: 1.97, belted: false, fabric: camel };
    o.shoes = { kind: 'pump', color: LEATHER.brown, color2: '#1a1614', sole: 0.012, heel: 0.05, wear: 0.1 };
    o.props = ['handbag'];
    return o;
  };
  const scarf = (): Outfit => { const o = act2(); o.hat = { kind: 'headscarf', fabric: fab(CLOTH.rust, { pattern: 'paisley', scale: 0.06, color2: CLOTH.mustard, sheen: 0.5 }) }; return o; };
  const epilogue = (): Outfit => { const o = act1(); o.top.fabric = o.bottom.fabric = fab(CLOTH.navy); o.outer = { kind: 'smock', length: 0.3, lapel: 0, open: 0, sleeve: 0.45, belted: false, fabric: fab(CLOTH.white, { dirt: 0.05 }) }; return o; };
  return { appearance, outfit: act1(), wardrobeSets: { act1, act2, act2_rain: scarf, act3, epilogue, default: act1 } };
}

/** Nikos "Nick" Varelas, 51, 168 cm: short, barrel-chested, heavy shoulders, thickening waist. */
function nick(): CharacterBuild {
  const appearance = withApp(1974_0003, 1, 51, (a) => {
    Object.assign(a.body.macro, { weight: 0.66, muscle: 0.6, height: 0.3, proportions: 0.45, african: 0.04, asian: 0.03, caucasian: 0.93 });
    a.body.locals = { ...a.body.locals, 'measure/measure-shoulder-dist-incr': 0.2, 'torso/torso-scale-depth-incr': 0.25, 'measure/measure-waist-circ-incr': 0.4, 'armslegs/lr-hand-scale-incr': 0.3, 'head/head-scale-horiz-incr': 0.3, 'eyebrows/eyebrows-trans-forward': 0.4 };
    a.stature = 1.68;
    a.skin = { ...a.skin, tone: '#c8a17e', melanin: 0.28, redness: 0.45, ageSpots: 0.15, freckles: 0 };
    a.hair = { ...a.hair, style: 'slick', color: '#7a7570', texture: 0.35, grey: 0.6, recession: 0.25, thinning: 0, volume: 1.15 };
    a.facialHair = 'none'; a.facialHairColor = '#2a2420'; a.eyeColor = '#2a1a10'; a.slump = 0.05;
    a.gait = { stride: 0.9, swing: 0.75, bounce: 1.15, speed: 0.85 };
  });
  const suit = (color: string, rumpled = 0) => fab(color, { rough: 0.65, sheen: 0.12, fade: 0.05, dirt: 0.03 + rumpled * 0.2 });
  const act2 = (): Outfit => {
    const o = blank(31, 1, 51);
    const s = suit('#1e2638');
    o.top = { kind: 'dressShirt', sleeve: 1.97, collar: 'spread', collarPoint: 0.11, open: 0, tucked: true, fit: 0.008, fabric: fab('#e8e0cc', { fade: 0.02, sheen: 0.15 }) };
    o.bottom = { kind: 'trousers', rise: 0.01, flare: 0.02, length: 2.07, fit: 0.02, fabric: s, belt: fab(LEATHER.oxblood, { rough: 0.4, sheen: 0.3 }) };
    o.outer = { kind: 'suitJacket', length: 0.28, lapel: 0.115, open: 0, sleeve: 1.97, belted: false, fabric: s };
    o.tie = { ...fab(CLOTH.tieMaroon, { pattern: 'paisley', scale: 0.04, color2: CLOTH.mustard, sheen: 0.5, rough: 0.45 }), width: 0.125 };
    o.shoes = { kind: 'loafer', color: LEATHER.oxblood, color2: '#1a1210', sole: 0.014, heel: 0.022, wear: 0.05 };
    o.socks = CLOTH.navy;
    return o;
  };
  const act3 = (): Outfit => { const o = act2(); o.outer!.fabric = o.bottom.fabric = suit(CLOTH.charcoal, 1); o.tie = null; o.top.open = 2; return o; };
  const act3Closing = (): Outfit => { const o = act2(); o.outer!.fabric = o.bottom.fabric = suit(CLOTH.charcoal); return o; };
  const epilogue = (): Outfit => { const o = act3Closing(); o.outer = { kind: 'overcoat', length: 0.62, lapel: 0.11, open: 0.5, sleeve: 1.97, belted: false, fabric: fab(CLOTH.camel) }; return o; };
  return { appearance, outfit: act2(), wardrobeSets: { act1: act2, act2, act3, act3_closing: act3Closing, epilogue, default: act2 } };
}

export const HEROES: Record<string, () => CharacterBuild> = {
  'char.teddy_arce': teddy, teddy, 'char.delphine_moore': delphine, delphine, 'char.nick_varelas': nick, nick,
};
