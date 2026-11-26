/**
 * The three leads, built from the same generators with hand-tuned parameters.
 * PROVISIONAL: these follow the story bible's facts (age, background, job) only. Final looks
 * wait for the narrative team's appearance sheets (ENGINE_REQUESTS "From characters: 1").
 * Invented people: no likeness of any real person or film character.
 */
import { generateAppearance, type Appearance } from './body/appearance';
import { generateOutfit, type Fabric, type Outfit } from './wardrobe/outfit';
import { CLOTH, LEATHER, METAL } from './wardrobe/palette';
import type { CharacterBuild } from './Character';

const fab = (color: string, o: Partial<Fabric> = {}): Fabric => ({ color, color2: o.color2 ?? color, pattern: o.pattern ?? 'solid', scale: o.scale ?? 0.02, rough: o.rough ?? 0.8, sheen: o.sheen ?? 0, fade: o.fade ?? 0.1, dirt: o.dirt ?? 0.08 });
const withApp = (seed: number, sex: number, age: number, f: (a: Appearance) => void) => { const a = generateAppearance(seed, { sex, age }); f(a); return a; };

/** Teodoro "Teddy" Arce, 34: night desk clerk at an SRO hotel, ex-patrolman. Born Mayagüez, raised on W 26th St. */
function teddy(): CharacterBuild {
  const appearance = withApp(1974_0001, 1, 34, (a) => {
    Object.assign(a.body.macro, { weight: 0.55, muscle: 0.58, height: 0.5, african: 0.25, asian: 0.03, caucasian: 0.72 });
    a.stature = 1.76;
    a.skin = { ...a.skin, tone: '#b58462', melanin: 0.45, freckles: 0, redness: 0.25 };
    a.hair = { ...a.hair, style: 'sidePart', color: '#1e1612', texture: 0.35, grey: 0.05, recession: 0.15, thinning: 0, volume: 1.05 };
    a.facialHair = 'moustache'; a.facialHairColor = '#1e1612'; a.eyeColor = '#3a2414';
    a.slump = 0.25; // tired, night shift
  });
  const base = (seed: number) => generateOutfit(seed, { sex: 1, age: 34 });
  const act1 = (): Outfit => {
    const o = base(11);
    o.top = { kind: 'dressShirt', sleeve: 0.45, collar: 'spread', collarPoint: 0.1, open: 1, tucked: true, fit: 0.012, fabric: fab(CLOTH.shirtBlue, { fade: 0.25 }) };
    o.bottom = { kind: 'trousers', rise: 0.02, flare: 0.03, length: 2.06, fit: 0.014, fabric: fab(CLOTH.charcoal), belt: fab(LEATHER.brown, { rough: 0.5 }) };
    o.outer = null; o.tie = null; o.hat = null; o.glasses = null; o.props = [];
    o.shoes = { kind: 'loafer', color: LEATHER.brown, color2: '#2a2018', sole: 0.012, heel: 0.02, wear: 0.55 };
    o.socks = CLOTH.black; o.sweat = 1;
    return o;
  };
  const act2 = (): Outfit => { const o = act1(); o.top.sleeve = 1.97; o.outer = { kind: 'sportCoat', length: 0.27, lapel: 0.105, open: 1, sleeve: 1.97, belted: false, fabric: fab(CLOTH.plaidBrown, { pattern: 'plaid', scale: 0.09, color2: CLOTH.rust }) }; return o; };
  const act3 = (): Outfit => { const o = act1(); o.top.sleeve = 1.97; o.outer = { kind: 'windbreaker', length: 0.08, lapel: 0, open: 0.6, sleeve: 1.97, belted: false, fabric: fab(CLOTH.navy, { sheen: 0.2 }) }; return o; };
  return { appearance, outfit: act1(), wardrobeSets: { act1, act2, act3, default: act1 } };
}

/** Delphine Moore, 29: former garment presser, works the Eighth Avenue strip and banks the women's savings. Born Wilmington, NC. */
function delphine(): CharacterBuild {
  const appearance = withApp(1974_0002, 0, 29, (a) => {
    Object.assign(a.body.macro, { weight: 0.38, muscle: 0.5, height: 0.6, african: 0.85, asian: 0.02, caucasian: 0.13 });
    a.stature = 1.69;
    a.skin = { ...a.skin, tone: '#6a4430', melanin: 0.72, freckles: 0, redness: 0.1, ageSpots: 0 };
    a.hair = { ...a.hair, style: 'afro', color: '#16100c', texture: 0.92, grey: 0, recession: 0, thinning: 0, volume: 0.9 };
    a.facialHair = 'none'; a.eyeColor = '#2a1a10'; a.slump = 0.05;
  });
  const base = (seed: number) => generateOutfit(seed, { sex: 0, age: 29 });
  const act1 = (): Outfit => {
    const o = base(21);
    o.dress = false;
    o.top = { kind: 'blouse', sleeve: 0.35, collar: 'spread', collarPoint: 0.09, open: 1, tucked: true, fit: 0.006, fabric: fab(CLOTH.cream, { sheen: 0.4 }) };
    o.bottom = { kind: 'trousers', rise: 0.04, flare: 0.07, length: 2.14, fit: 0.006, fabric: fab(CLOTH.rust, { sheen: 0.25 }), belt: fab(LEATHER.tan, { rough: 0.5 }) };
    o.outer = { kind: 'suitJacket', length: 0.2, lapel: 0.1, open: 1, sleeve: 1.97, belted: false, fabric: o.bottom.fabric };
    o.shoes = { kind: 'platform', color: LEATHER.tan, color2: '#3a2a1e', sole: 0.04, heel: 0.09, wear: 0.2 };
    o.hosiery = 0; o.hat = null; o.glasses = null; o.props = ['shoulderBag']; o.tie = null;
    return o;
  };
  const act2 = (): Outfit => { const o = act1(); o.outer = null; o.top = { ...o.top, kind: 'knitPolo', collar: 'polo', sleeve: 0.4, fabric: fab(CLOTH.mustard, { pattern: 'stripeH', scale: 0.03, color2: CLOTH.chocolate }) }; o.bottom.fabric = fab(CLOTH.denim70, { pattern: 'denim', scale: 0.0035, rough: 0.9 }); o.bottom.kind = 'jeans'; return o; };
  const act3 = (): Outfit => { const o = act1(); o.outer = { kind: 'trench', length: 0.6, lapel: 0.1, open: 0, sleeve: 1.97, belted: true, fabric: fab(CLOTH.trench) }; return o; };
  return { appearance, outfit: act1(), wardrobeSets: { act1, act2, act3, default: act1 } };
}

/** Nikos "Nick" Varelas, 51: fur manufacturer and building owner, born in Kastoria. */
function nick(): CharacterBuild {
  const appearance = withApp(1974_0003, 1, 51, (a) => {
    Object.assign(a.body.macro, { weight: 0.68, muscle: 0.45, height: 0.45, african: 0.05, asian: 0.03, caucasian: 0.92 });
    a.stature = 1.72;
    a.skin = { ...a.skin, tone: '#c49a78', melanin: 0.3, redness: 0.35, ageSpots: 0.15, freckles: 0 };
    a.hair = { ...a.hair, style: 'slick', color: '#4a4440', texture: 0.3, grey: 0.45, recession: 0.45, thinning: 0.2, volume: 1 };
    a.facialHair = 'moustache'; a.facialHairColor = '#5a5450'; a.eyeColor = '#3a2414'; a.slump = 0.15;
  });
  const base = (seed: number) => generateOutfit(seed, { sex: 1, age: 51 });
  const act1 = (): Outfit => {
    const o = base(31);
    const suit = fab(CLOTH.charcoal, { pattern: 'pinstripe', scale: 0.011, color2: '#8a8a88', rough: 0.7 });
    o.top = { kind: 'dressShirt', sleeve: 1.97, collar: 'spread', collarPoint: 0.11, open: 0, tucked: true, fit: 0.014, fabric: fab(CLOTH.white, { fade: 0.02 }) };
    o.bottom = { kind: 'trousers', rise: 0.01, flare: 0.02, length: 2.07, fit: 0.018, fabric: suit, belt: fab(LEATHER.black, { rough: 0.4, sheen: 0.3 }) };
    o.outer = { kind: 'suitJacket', length: 0.28, lapel: 0.115, open: 0, sleeve: 1.97, belted: false, fabric: suit };
    o.tie = { ...fab(CLOTH.tieMaroon, { pattern: 'geometric', scale: 0.03, color2: CLOTH.mustard, sheen: 0.45, rough: 0.5 }), width: 0.12 };
    o.shoes = { kind: 'wingtip', color: LEATHER.oxblood, color2: '#1a1210', sole: 0.014, heel: 0.022, wear: 0.05 };
    o.socks = CLOTH.black; o.hat = null; o.glasses = { kind: 'horn', frame: METAL.tortoise, tint: 0, scale: 1.3 }; o.props = [];
    return o;
  };
  const act2 = (): Outfit => { const o = act1(); o.outer!.fabric = fab(CLOTH.cream, { sheen: 0.15 }); o.bottom.fabric = fab(CLOTH.khaki); return o; };
  const act3 = (): Outfit => { const o = act1(); o.outer = { kind: 'overcoat', length: 0.66, lapel: 0.11, open: 0.5, sleeve: 1.97, belted: false, fabric: fab(CLOTH.camel) }; o.hat = { kind: 'fedora', fabric: fab(CLOTH.charcoal) }; return o; };
  return { appearance, outfit: act1(), wardrobeSets: { act1, act2, act3, default: act1 } };
}

export const HEROES: Record<string, () => CharacterBuild> = {
  'char.teddy_arce': teddy, teddy, 'char.delphine_moore': delphine, delphine, 'char.nick_varelas': nick, nick,
};
