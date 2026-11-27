/**
 * 1974 outfit model and generator. Frequencies and parameter ranges come from
 * docs/WARDROBE_1974.md §5 (reference ids there); "P" values there are period knowledge.
 * Everything is generic: no brands, no logos, no real insignia.
 */
import { Rng } from '../util/rng';
import { CLOTH, LEATHER, METAL, UNIFORM, type ClothKey } from './palette';

export type Pattern = 'solid' | 'stripeH' | 'stripeV' | 'pinstripe' | 'plaid' | 'check' | 'houndstooth' | 'paisley' | 'floral' | 'rib' | 'tweed' | 'denim' | 'geometric';
export interface Fabric {
  color: string; color2: string; pattern: Pattern;
  /** Pattern repeat in metres. */
  scale: number;
  rough: number;
  /** 0 matte cotton/wool … 1 shiny polyester/satin. */
  sheen: number;
  /** Fade, dirt and wear 0..1. */
  fade: number; dirt: number;
}
export type TopKind = 'dressShirt' | 'printShirt' | 'knitPolo' | 'tee' | 'tank' | 'blouse' | 'shell' | 'turtleneck' | 'workShirt' | 'uniformShirt' | 'sweater';
export interface TopDesc {
  kind: TopKind;
  /** Sleeve end along the arm chain: 0 shoulder, 1 elbow, 2 wrist (0.05 = sleeveless). */
  sleeve: number;
  collar: 'none' | 'spread' | 'polo' | 'crew' | 'v' | 'scoop' | 'mock';
  /** Collar point length, metres (1974: long points). */
  collarPoint: number;
  /** Buttons undone at the neck (0..3). */
  open: number;
  tucked: boolean;
  /** Ease (looseness) in metres. */
  fit: number;
  fabric: Fabric;
}
export type BottomKind = 'trousers' | 'jeans' | 'shorts' | 'skirt';
export interface BottomDesc {
  kind: BottomKind;
  /** Waistband height above the natural waist, metres (high rise ≈ +0.03). */
  rise: number;
  /** Trousers: extra hem radius at the ankle from flare (m). Skirts: A-line flare at the hem (m). */
  flare: number;
  /** Trousers/shorts: hem along the leg chain (0 hip, 1 knee, 2 ankle; 2.08 = full break). Skirts: hem offset from the knee (m, + below). */
  length: number;
  fit: number;
  fabric: Fabric;
  belt: Fabric | null;
}
export type OuterKind = 'suitJacket' | 'sportCoat' | 'leisureJacket' | 'cardigan' | 'vest' | 'trench' | 'overcoat' | 'raincoat' | 'smock' | 'workJacket' | 'windbreaker' | 'leather' | 'uniformJacket';
export interface OuterDesc {
  kind: OuterKind;
  /** Hem below the natural waist, metres (jacket ≈ 0.26, car coat 0.45, trench 0.62). */
  length: number;
  /** Lapel width at its widest, metres (1974 suits 0.09–0.12). 0 = no lapels. */
  lapel: number;
  /** 0 buttoned … 1 hanging open. */
  open: number;
  sleeve: number;
  belted: boolean;
  fabric: Fabric;
}
export type ShoeKind = 'oxford' | 'wingtip' | 'loafer' | 'boot' | 'sneaker' | 'platform' | 'pump' | 'sandal' | 'clog' | 'slipOn' | 'workBoot';
export interface ShoesDesc {
  kind: ShoeKind; color: string; color2: string; sole: number; heel: number; wear: number;
  /** Boot shaft top on the leg chain (legS: 1 knee, 2 ankle). */
  shaft?: number;
  /** Ankle strap (platforms). */
  strap?: boolean;
}
export type HatKind = 'fedora' | 'straw' | 'flatCap' | 'newsboy' | 'knit' | 'beret' | 'sunHat' | 'headscarf' | 'policeCap' | 'peakedCap' | 'hardHat';
export interface HatDesc { kind: HatKind; fabric: Fabric }
export interface GlassesDesc { kind: 'clear' | 'sun' | 'catEye' | 'aviator' | 'horn'; frame: string; tint: number; scale: number }
export interface Outfit {
  top: TopDesc;
  bottom: BottomDesc;
  /** Top and skirt cut from one fabric with no waistband. */
  dress: boolean;
  outer: OuterDesc | null;
  tie: (Fabric & { width: number }) | null;
  shoes: ShoesDesc;
  socks: string | null;
  /** Sheer hosiery tint strength 0..1 (0 = bare legs). */
  hosiery: number;
  hat: HatDesc | null;
  glasses: GlassesDesc | null;
  /** Carried props (ids from wardrobe/props.ts). */
  props: string[];
  uniform: string | null;
  /** Per-outfit heat response: sweat darkening multiplier. */
  sweat: number;
}

export interface OutfitContext {
  sex: number; age: number;
  season?: 'summer' | 'spring' | 'autumn' | 'winter';
  weather?: 'clear' | 'overcast' | 'rain';
  /** Archetype id (built-in or a narrative npc.* id). */
  archetype?: string;
  /** Narrative archetype fields (content/npc_archetypes/*.json). */
  palette?: string[];
  wardrobe?: string;
  propsList?: string[];
  /** 0 office … 1 manual worker / idle (drives wear). */
  grit?: number;
  /** Content rule: no short hems, shorts or tank tops (e.g. npc.strip_worker: street clothes, never a costume). */
  modest?: boolean;
}

// --- fabrics ------------------------------------------------------------------------------------
const jitter = (rng: Rng, hex: string, amt = 0.05): string => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const l = rng.normal(0, amt * 255);
  const out = ch.map((c) => Math.round(Math.min(255, Math.max(0, c + l + rng.normal(0, amt * 80)))));
  return '#' + out.map((c) => c.toString(16).padStart(2, '0')).join('');
};
const shade = (hex: string, k: number) => '#' + [16, 8, 0].map((sh) => Math.min(255, Math.round(((parseInt(hex.slice(1), 16) >> sh) & 255) * k)).toString(16).padStart(2, '0')).join('');
function fabric(rng: Rng, color: string, o: Partial<Fabric> = {}): Fabric {
  return {
    color: jitter(rng, color), color2: o.color2 ? jitter(rng, o.color2, 0.03) : jitter(rng, color, 0.12),
    pattern: o.pattern ?? 'solid', scale: o.scale ?? 0.02, rough: o.rough ?? 0.8, sheen: o.sheen ?? 0,
    fade: o.fade ?? rng.range(0, 0.25), dirt: o.dirt ?? rng.range(0, 0.15),
  };
}
const C = (k: ClothKey) => CLOTH[k];

// summer shares per doc §3.12: ~45% light, 30% mid/dark, 20–25% saturated (red first)
const SHIRT_LIGHT: ClothKey[] = ['white', 'offWhite', 'shirtBlue', 'shirtPink', 'paleBlue', 'cream', 'khaki', 'chambray'];
const SATURATED: [ClothKey, number][] = [['red70', 5], ['mustard', 3], ['harvestYellow', 2], ['royalBlue', 2], ['pinkPantsuit', 2], ['orange70', 1.5], ['rust', 2], ['teal70', 1], ['lilac', 1], ['avocado', 1]];
const DARK: ClothKey[] = ['navy', 'charcoal', 'suitBrown', 'black', 'chocolate', 'olive', 'burgundy', 'forest', 'suitGrey'];

function topColor(rng: Rng, warm: boolean): Fabric {
  const r = rng.next();
  if (r < (warm ? 0.45 : 0.2)) return fabric(rng, C(rng.pick(SHIRT_LIGHT)), { rough: 0.75 });
  if (r < (warm ? 0.68 : 0.75)) return fabric(rng, C(rng.pick(DARK)), { rough: 0.8 });
  return fabric(rng, C(rng.weighted(SATURATED)), { rough: 0.7 });
}
function patterned(rng: Rng, f: Fabric, opts: [Pattern, number][]) {
  f.pattern = rng.weighted(opts);
  const sc: Record<Pattern, [number, number]> = {
    solid: [0.02, 0.02], stripeH: [0.012, 0.05], stripeV: [0.008, 0.025], pinstripe: [0.008, 0.014], plaid: [0.06, 0.14], check: [0.02, 0.06],
    houndstooth: [0.008, 0.016], paisley: [0.05, 0.1], floral: [0.04, 0.1], rib: [0.004, 0.006], tweed: [0.004, 0.008], denim: [0.003, 0.004], geometric: [0.04, 0.09],
  };
  f.scale = rng.range(...sc[f.pattern]);
  // mostly tonal prints (a lighter or darker shade of the ground colour); contrasting accents are rarer
  if (f.pattern !== 'solid') f.color2 = rng.chance(0.6) ? shade(f.color, rng.chance(0.5) ? 1.45 : 0.55) : jitter(rng, rng.pick([C('white'), C('cream'), C('red70'), C('navy'), C('rust'), C('chocolate')]), 0.05);
  return f;
}

// --- generator -----------------------------------------------------------------------------------
export function generateOutfit(seed: number, ctx: OutfitContext): Outfit {
  const rng = new Rng(seed);
  const male = ctx.sex >= 0.5, age = ctx.age;
  const season = ctx.season ?? 'summer';
  const warm = season === 'summer';
  const rain = ctx.weather === 'rain';
  const grit = ctx.grit ?? rng.range(0, 0.5);
  const arch = (ctx.archetype ?? '').toLowerCase();
  const brief = (ctx.wardrobe ?? '').toLowerCase();

  const preset = uniformPreset(arch, brief);
  const o = preset ? preset(rng, male, age) : male ? menOutfit(rng, age, warm) : womenOutfit(rng, age, warm, !!ctx.modest);
  if (ctx.modest && o.top.kind === 'tank') { o.top.kind = 'tee'; o.top.sleeve = 0.32; o.top.collar = 'crew'; }

  // weather layers
  if (!o.outer && (rain || (!warm && rng.chance(0.8)))) {
    o.outer = coatFor(rng, male, age, warm, rain);
  }
  if (rain && !o.props.includes('umbrella') && rng.chance(0.5)) o.props.push('umbrella');

  // narrative archetype palette drives the main colours
  if (ctx.palette?.length) {
    const pal = ctx.palette.filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (pal.length) {
      o.top.fabric.color = jitter(rng, pal[0], 0.03);
      if (pal[1]) o.bottom.fabric.color = jitter(rng, pal[1], 0.03);
      if (pal[2] && o.outer) o.outer.fabric.color = jitter(rng, pal[2], 0.03);
    }
  }
  for (const p of ctx.propsList ?? []) if (!o.props.includes(p)) o.props.push(p);

  // wear: grit raises dirt/fade; workers' shoes scuffed
  for (const f of [o.top.fabric, o.bottom.fabric, o.outer?.fabric].filter(Boolean) as Fabric[]) {
    f.dirt = Math.min(1, f.dirt + grit * rng.range(0.2, 0.6));
    f.fade = Math.min(1, f.fade + grit * rng.range(0.1, 0.4));
  }
  o.shoes.wear = Math.min(1, o.shoes.wear + grit * 0.5);
  o.sweat = warm ? rng.range(0.3, 1) * (o.outer ? 1.2 : 1) : rng.range(0, 0.2);
  return o;
}

function shoesMen(rng: Rng, age: number, formal: boolean): ShoesDesc {
  const k = rng.weighted<ShoeKind>([['oxford', formal ? 4 : 2], ['wingtip', age > 40 ? 2 : 0.6], ['loafer', 2.5], ['workBoot', formal ? 0.2 : 1.5], ['sneaker', age < 35 ? 2.5 : 0.8], ['platform', age < 32 ? 0.8 : 0.05], ['boot', 0.6]]);
  const col = k === 'sneaker' ? rng.pick([LEATHER.white, '#c8c0b0', CLOTH.navy, CLOTH.red70]) : rng.weighted([[LEATHER.black, 4], [LEATHER.brown, 3], [LEATHER.oxblood, 1.5], [LEATHER.tan, 1]]);
  return { kind: k, color: col, color2: k === 'sneaker' ? '#d8d2c4' : '#2a2018', sole: k === 'platform' ? rng.range(0.03, 0.05) : k === 'workBoot' ? 0.02 : 0.012, heel: k === 'platform' ? rng.range(0.06, 0.08) : k === 'boot' ? 0.035 : 0.02, wear: rng.range(0.1, 0.5), shaft: k === 'boot' ? 1.68 : k === 'workBoot' ? 1.72 : undefined };
}
function shoesWomen(rng: Rng, age: number): ShoesDesc {
  const old = age >= 60;
  const k = rng.weighted<ShoeKind>([['platform', old ? 0.1 : 3], ['pump', 2.5], ['sandal', 2], ['slipOn', old ? 3 : 0.8], ['clog', age < 40 ? 0.6 : 0.1], ['sneaker', age < 30 ? 0.6 : 0.2], ['boot', 0.3]]);
  const col = rng.weighted([[LEATHER.black, 2], [LEATHER.brown, 2], [LEATHER.tan, 2], [LEATHER.white, 1.5], [CLOTH.red70, 0.6], [LEATHER.oxblood, 0.6], [CLOTH.cream, 1]]);
  const heel = k === 'platform' ? rng.range(0.08, 0.11) : k === 'pump' ? rng.range(0.04, 0.065) : k === 'clog' ? 0.05 : k === 'boot' ? 0.05 : 0.015;
  return {
    kind: k, color: col, color2: k === 'platform' ? rng.pick(['#3a2a1e', '#c8b090', '#2a2a2a']) : '#2a2018', sole: k === 'platform' ? rng.range(0.03, 0.06) : 0.01, heel, wear: rng.range(0.05, 0.4),
    // derived without extra draws so existing seeds keep their outfits
    shaft: k === 'boot' ? (col === LEATHER.white || col === CLOTH.cream ? 1.6 : 1.18) : undefined, strap: k === 'platform' && heel > 0.095,
  };
}
function glasses(rng: Rng, age: number, male: boolean, warm: boolean): GlassesDesc | null {
  const p = age >= 40 ? 0.45 : 0.2;
  if (rng.chance(p)) {
    const kind = !male && age > 45 && rng.chance(0.4) ? 'catEye' : rng.weighted([['horn', 2], ['clear', 2], ['aviator', male ? 1 : 0.6]] as const);
    return { kind, frame: rng.pick([METAL.blackFrame, METAL.tortoise, METAL.gold, METAL.silver]), tint: kind === 'aviator' && rng.chance(0.3) ? 0.3 : 0, scale: rng.range(1.2, 1.5) };
  }
  if (warm && rng.chance(0.15)) return { kind: rng.chance(0.5) ? 'aviator' : 'sun', frame: rng.pick([METAL.gold, METAL.blackFrame, METAL.tortoise]), tint: rng.range(0.6, 0.85), scale: rng.range(1.2, 1.45) };
  return null;
}
const trouserBase = (rng: Rng, age: number): Pick<BottomDesc, 'rise' | 'flare' | 'length' | 'fit'> => {
  // 1973 photos (docs/WARDROBE_1974.md): most men wear straight or mild boot-cut legs; big bell
  // flares are the fashionable young minority (about 1 in 4 under 35), near-straight over 35.
  const young = age < 35;
  const rise = young ? rng.range(0.01, 0.05) : rng.range(-0.01, 0.02);
  const r = rng.range(0, 1); // one draw, as before, so other seeded choices don't shift
  const flare = young ? (r < 0.25 ? 0.035 + 0.02 * (r / 0.25) : 0.01 + 0.014 * ((r - 0.25) / 0.75)) : 0.003 + 0.01 * r;
  return { rise, flare, length: rng.range(2.02, 2.1), fit: young ? 0.008 : rng.range(0.012, 0.022) };
};

function menOutfit(rng: Rng, age: number, warm: boolean): Outfit {
  const old = age >= 50;
  const kind = rng.weighted<string>([
    ['suit', old ? 6 : 2.5], ['sportcoat', 1], ['shortSleeve', 3.5], ['longSleeve', 1.5], ['knit', age < 40 ? 1 : 0.4], ['tee', age < 35 ? 0.8 : 0.2], ['work', 0.8], ['leisure', age < 50 ? 0.2 : 0.05],
  ]);
  const shirtFab = topColor(rng, warm);
  if (kind === 'longSleeve' && rng.chance(0.55)) patterned(rng, shirtFab, [['paisley', 2], ['floral', 1], ['stripeV', 2], ['geometric', 1.5], ['check', 1]]);
  if (kind === 'shortSleeve' && rng.chance(0.25)) patterned(rng, shirtFab, [['stripeV', 2], ['check', 1], ['plaid', 1]]);
  if (rng.chance(0.3)) shirtFab.sheen = rng.range(0.25, 0.6); // polyester
  const top: TopDesc = {
    kind: kind === 'knit' ? 'knitPolo' : kind === 'tee' ? (rng.chance(0.2) ? 'tank' : 'tee') : kind === 'work' ? 'workShirt' : 'dressShirt',
    sleeve: kind === 'shortSleeve' || kind === 'knit' ? rng.range(0.38, 0.5) : kind === 'tee' ? 0.32 : rng.chance(warm ? 0.35 : 0.05) ? rng.range(1.15, 1.45) : 1.97,
    collar: kind === 'knit' ? 'polo' : kind === 'tee' ? 'crew' : 'spread', collarPoint: rng.range(0.08, 0.12) * (age < 35 ? 1.1 : 1),
    open: kind === 'suit' ? (rng.chance(0.7) ? 0 : 1) : rng.int(1, age < 35 ? 3 : 2), tucked: kind !== 'tee' && rng.chance(0.85), fit: rng.range(0.008, 0.018), fabric: shirtFab,
  };
  if (top.kind === 'knitPolo') { if (rng.chance(0.5)) patterned(rng, shirtFab, [['stripeH', 1]]); shirtFab.rough = 0.9; }
  if (top.kind === 'tank') { top.sleeve = 0.03; top.collar = 'scoop'; }
  if (top.kind === 'workShirt') { shirtFab.color = rng.pick([CLOTH.chambray, CLOTH.navy, CLOTH.khaki, CLOTH.olive]); top.sleeve = rng.chance(0.6) ? rng.range(1.2, 1.4) : 1.97; }

  const tb = trouserBase(rng, age);
  let bottom: BottomDesc = { kind: 'trousers', ...tb, fabric: fabric(rng, C(rng.weighted<ClothKey>([['charcoal', 2], ['navy', 2], ['suitBrown', 2], ['khaki', 2], ['suitGrey', 1.5], ['cream', 0.8], ['olive', 0.6], ['black', 0.8], ['plaidBrown', 0.3]]))), belt: fabric(rng, rng.pick([LEATHER.black, LEATHER.brown]), { rough: 0.5, sheen: 0.2 }) };
  if (kind === 'work' || kind === 'tee' || (age < 35 && rng.chance(0.25))) bottom = { kind: 'jeans', ...tb, fabric: fabric(rng, rng.chance(0.85) ? C('denim70') : C('denimMid'), { pattern: 'denim', scale: 0.0035, rough: 0.9 }), belt: fabric(rng, LEATHER.brown) };
  if (warm && age < 30 && rng.chance(0.04)) { bottom.kind = 'shorts'; bottom.length = rng.range(0.45, 0.6); bottom.flare = 0.02; }

  let outer: OuterDesc | null = null;
  let tie: Outfit['tie'] = null;
  if (kind === 'suit' || kind === 'sportcoat' || kind === 'leisure') {
    const suitFab = kind === 'suit' ? bottom.fabric : fabric(rng, C(rng.weighted<ClothKey>([['camel', 2], ['cream', 1.5], ['tweedOat', 1.5], ['plaidBrown', 1], ['navy', 1], ['brownTan', 1]])), { rough: 0.85 });
    if (kind === 'suit' && rng.chance(0.2)) patterned(rng, suitFab, [['pinstripe', 2], ['check', 1]]);
    if (kind === 'sportcoat' && rng.chance(0.5)) patterned(rng, suitFab, [['plaid', 2], ['houndstooth', 2], ['check', 1], ['tweed', 2]]);
    if (kind === 'leisure') { suitFab.color = rng.pick([CLOTH.khaki, CLOTH.paleBlue, CLOTH.cream, CLOTH.rust, CLOTH.brownTan]); suitFab.sheen = 0.35; bottom.fabric = suitFab; top.collar = 'spread'; top.collarPoint = 0.12; top.open = 2; }
    if (kind === 'suit') bottom.fabric = suitFab;
    // in June many carry the jacket over the arm (doc §3.1, 549916, 551771)
    const carried = warm && rng.chance(age > 55 ? 0.1 : 0.25);
    if (!carried) outer = { kind: kind === 'suit' ? 'suitJacket' : kind === 'leisure' ? 'leisureJacket' : 'sportCoat', length: rng.range(0.24, 0.3), lapel: rng.range(0.09, 0.12), open: rng.chance(0.55) ? 1 : 0, sleeve: 1.97, belted: false, fabric: suitFab };
    else (top as TopDesc).sleeve = Math.min(top.sleeve, 1.97);
    if (kind !== 'leisure' && rng.chance(kind === 'suit' ? 0.85 : 0.4)) {
      const tf = fabric(rng, rng.weighted([[C('tieMaroon'), 3], [C('navy'), 1.5], [C('rust'), 1], [C('mustard'), 0.8], [C('forest'), 0.8], [C('brownTan'), 1]]), { rough: 0.5, sheen: 0.4 });
      if (rng.chance(0.55)) patterned(rng, tf, [['stripeV', 2], ['paisley', 1.5], ['geometric', 1.5], ['check', 0.5]]);
      tie = { ...tf, width: rng.range(0.1, 0.125) };
      top.open = 0; top.tucked = true;
    }
    if (carried) top.sleeve = rng.chance(0.5) ? 0.45 : 1.97;
  }
  if (kind === 'work' && rng.chance(0.3)) outer = { kind: 'workJacket', length: 0.12, lapel: 0, open: 1, sleeve: 1.97, belted: false, fabric: fabric(rng, C('navy')) };

  const hatP = age >= 60 ? 0.3 : age >= 40 ? 0.1 : 0.04;
  const hat: HatDesc | null = rng.chance(hatP) ? { kind: age >= 60 ? rng.weighted<HatKind>([[warm ? 'straw' : 'fedora', 3], ['fedora', 1.5], ['flatCap', 1]]) : rng.weighted<HatKind>([['flatCap', 2], ['newsboy', 1.5], [warm ? 'straw' : 'knit', 1]]), fabric: fabric(rng, rng.pick([CLOTH.tweedOat, CLOTH.charcoal, CLOTH.suitBrown, CLOTH.cream, CLOTH.khaki]), { rough: 0.85 }) } : null;
  if (hat?.kind === 'straw') hat.fabric = fabric(rng, '#d2bd8a', { pattern: 'tweed', scale: 0.003, rough: 0.9, color2: '#3a2a20' });

  const props: string[] = [];
  if (rng.chance(old ? 0.25 : 0.15)) props.push('newspaper');
  if (kind === 'suit' && rng.chance(0.25)) props.push('briefcase');
  if (rng.chance(0.1)) props.push('cigarette');
  if (rng.chance(0.08)) props.push('paperBag');
  return {
    top, bottom, dress: false, outer, tie, shoes: shoesMen(rng, age, kind === 'suit'),
    socks: rng.pick([CLOTH.black, CLOTH.navy, CLOTH.charcoal, CLOTH.suitBrown, CLOTH.white]), hosiery: 0, hat, glasses: glasses(rng, age, true, warm),
    props, uniform: null, sweat: 1,
  };
}

function womenOutfit(rng: Rng, age: number, warm: boolean, modest = false): Outfit {
  const old = age >= 60, young = age < 30;
  const kind = rng.weighted<string>([
    ['flares', old ? 0.6 : 3.5], ['pantsuit', old ? 0.3 : 1], ['dressKnee', age >= 35 ? 3.5 : 1.5], ['skirtShort', modest ? 0 : young ? 2 : 0.6], ['midi', 0.7], ['shorts', !modest && young && warm ? 0.4 : 0], ['skirtBlouse', old ? 2.5 : 1.2],
  ]);
  const topFab = topColor(rng, warm);
  if (rng.chance(0.25)) patterned(rng, topFab, [['floral', 2], ['stripeH', 1], ['paisley', 1], ['geometric', 1]]);
  if (rng.chance(0.35)) topFab.sheen = rng.range(0.25, 0.6);
  const topKind: TopKind = rng.weighted([['blouse', 3], ['shell', warm ? 2 : 0.5], ['knitPolo', 0.6], ['tee', young ? 1.2 : 0.3], ['turtleneck', warm ? 0.1 : 1.2], ['sweater', warm ? 0 : 1]]);
  const top: TopDesc = {
    kind: topKind, sleeve: topKind === 'shell' ? 0.05 : topKind === 'tee' ? 0.3 : warm ? rng.weighted([[0.35, 2], [0.05, 1], [1.2, 0.6], [1.97, 0.8]]) : 1.97,
    collar: topKind === 'blouse' ? rng.weighted([['spread', 3], ['v', 1], ['scoop', 1]]) : topKind === 'turtleneck' ? 'mock' : topKind === 'knitPolo' ? 'polo' : rng.pick(['crew', 'scoop']),
    collarPoint: rng.range(0.07, 0.11), open: rng.int(0, 1), tucked: rng.chance(0.65), fit: rng.range(0.005, 0.015), fabric: topFab,
  };
  let bottom: BottomDesc;
  let dress = false;
  let outer: OuterDesc | null = null;
  if (kind === 'flares' || kind === 'pantsuit') {
    const f = kind === 'pantsuit' ? fabric(rng, C(rng.weighted<ClothKey>([['red70', 2], ['rust', 1.5], ['pinkPantsuit', 1.5], ['burgundy', 1], ['cream', 1], ['navy', 1], ['paleBlue', 1]])), { sheen: 0.3 }) : rng.chance(0.35)
      ? fabric(rng, C('denim70'), { pattern: 'denim', scale: 0.0035, rough: 0.9 })
      : fabric(rng, C(rng.weighted<ClothKey>([['cream', 2], ['paleBlue', 1.5], ['navy', 1.5], ['rust', 1], ['khaki', 1.2], ['black', 1], ['red70', 0.8], ['white', 1]])), { sheen: rng.chance(0.4) ? 0.3 : 0 });
    bottom = { kind: f.pattern === 'denim' ? 'jeans' : 'trousers', rise: rng.range(0, 0.05), flare: rng.range(0.05, 0.08), length: rng.range(2.1, 2.16), fit: 0.006, fabric: f, belt: rng.chance(0.4) ? fabric(rng, rng.pick([LEATHER.brown, LEATHER.tan, LEATHER.white])) : null };
    if (kind === 'pantsuit') outer = { kind: 'suitJacket', length: rng.range(0.16, 0.26), lapel: rng.range(0.08, 0.11), open: rng.chance(0.5) ? 1 : 0, sleeve: warm ? 1.97 : 1.97, belted: rng.chance(0.3), fabric: f };
  } else if (kind === 'shorts') {
    bottom = { kind: 'shorts', rise: 0.02, flare: 0.02, length: rng.range(0.25, 0.45), fit: 0.008, fabric: fabric(rng, rng.chance(0.5) ? C('denim70') : C(rng.pick(['khaki', 'white', 'red70', 'navy'] as ClothKey[])), {}), belt: null };
  } else {
    const len = kind === 'dressKnee' ? rng.range(-0.05, 0.05) : kind === 'skirtShort' ? -rng.range(0.05, 0.15) : kind === 'midi' ? rng.range(0.1, 0.2) : rng.range(-0.04, 0.08);
    const f = kind === 'dressKnee' || (kind === 'skirtShort' && rng.chance(0.5)) ? topFab : fabric(rng, C(rng.pick(DARK.concat(['camel', 'tweedOat', 'cream', 'rust'] as ClothKey[]))));
    if (kind === 'dressKnee' && rng.chance(0.4)) patterned(rng, f, [['floral', 3], ['stripeV', 1], ['geometric', 1], ['plaid', 0.5]]);
    bottom = { kind: 'skirt', rise: 0, flare: kind === 'midi' ? rng.range(0.08, 0.16) : rng.range(0.04, 0.1), length: len, fit: 0.01, fabric: f, belt: rng.chance(0.4) ? fabric(rng, rng.pick([LEATHER.black, LEATHER.brown, CLOTH.white])) : null };
    dress = kind === 'dressKnee' || (f === topFab);
    if (dress) { top.fabric = f; top.tucked = true; if (top.kind === 'tee' || top.kind === 'sweater') top.kind = 'blouse'; }
    if (old && rng.chance(0.4) && !warm) outer = { kind: 'cardigan', length: 0.12, lapel: 0, open: 1, sleeve: 1.97, belted: false, fabric: fabric(rng, rng.pick([CLOTH.cream, CLOTH.beige, CLOTH.navy, CLOTH.greyMarl]), { pattern: 'rib', scale: 0.005 }) };
  }
  if (old && warm && rng.chance(0.15)) outer = { kind: 'cardigan', length: 0.12, lapel: 0, open: 1, sleeve: 1.97, belted: false, fabric: fabric(rng, rng.pick([CLOTH.cream, CLOTH.beige, CLOTH.paleBlue]), { pattern: 'rib', scale: 0.005 }) };
  const hat: HatDesc | null = warm ? (rng.chance(0.05) ? { kind: 'sunHat', fabric: fabric(rng, '#d2bd8a', { pattern: 'tweed', scale: 0.003, color2: '#4a3a2a' }) } : old && rng.chance(0.06) ? { kind: 'headscarf', fabric: patterned(rng, fabric(rng, C(rng.pick(SHIRT_LIGHT))), [['floral', 2], ['paisley', 1], ['solid', 1]]) } : null)
    : rng.chance(0.2) ? { kind: rng.pick(['knit', 'beret', 'headscarf'] as HatKind[]), fabric: fabric(rng, C(rng.pick(DARK))) } : null;
  const props: string[] = [];
  if (rng.chance(0.7)) props.push(rng.weighted([['handbag', 4], ['shoulderBag', young ? 3 : 1], ['tote', 1]] as const));
  if (rng.chance(0.2)) props.push('shoppingBag');
  if (rng.chance(0.05)) props.push('cigarette');
  return {
    top, bottom, dress, outer, tie: null, shoes: shoesWomen(rng, age), socks: null,
    hosiery: bottom.kind === 'skirt' ? (old ? rng.range(0.35, 0.6) : rng.chance(0.6) ? rng.range(0.2, 0.45) : 0) : 0,
    hat, glasses: glasses(rng, age, false, warm), props, uniform: null, sweat: 1,
  };
}

function coatFor(rng: Rng, male: boolean, age: number, warm: boolean, rain: boolean): OuterDesc {
  if (rain || warm) return { kind: rain ? rng.pick(['trench', 'raincoat'] as OuterKind[]) : 'trench', length: male ? rng.range(0.55, 0.68) : rng.range(0.5, 0.7), lapel: 0.1, open: rng.chance(0.4) ? 1 : 0, sleeve: 1.97, belted: rng.chance(0.6), fabric: fabric(rng, rng.weighted([[CLOTH.trench, 4], [CLOTH.camel, 2], [CLOTH.navy, 1], [CLOTH.olive, 0.6], [CLOTH.black, 0.6]])) };
  const k = rng.weighted<OuterKind>([['trench', 2.5], ['overcoat', 3], ['leather', age < 45 ? 1 : 0.3], ['windbreaker', 1], ['raincoat', 0.6]]);
  return { kind: k, length: k === 'windbreaker' || k === 'leather' ? rng.range(0.05, 0.15) : rng.range(0.5, 0.75), lapel: k === 'windbreaker' ? 0 : rng.range(0.08, 0.12), open: rng.chance(0.4) ? 1 : 0, sleeve: 1.97, belted: k === 'trench' && rng.chance(0.6), fabric: fabric(rng, k === 'leather' ? rng.pick([LEATHER.brown, LEATHER.black]) : rng.pick([CLOTH.charcoal, CLOTH.navy, CLOTH.camel, CLOTH.trench, CLOTH.suitBrown]), { rough: k === 'leather' ? 0.45 : 0.85, sheen: k === 'leather' ? 0.3 : 0 }) };
}

// --- uniforms and archetype presets (generic; no insignia) ----------------------------------------
type Preset = (rng: Rng, male: boolean, age: number) => Outfit;
function uniformPreset(arch: string, brief: string): Preset | null {
  const has = (...k: string[]) => k.some((w) => arch.includes(w) || brief.includes(w));
  if (has('beat_cop', 'police', 'patrolman', 'cop')) return policeUniform;
  if (has('sanitation')) return (r, m, a) => workUniform(r, m, a, UNIFORM.sanitation, 'sanitation');
  if (has('transit', 'conductor', 'bus driver', 'rail')) return (r, m, a) => workUniform(r, m, a, UNIFORM.transitGrey, 'transit');
  if (has('doorman')) return doorman;
  if (has('hard hat', 'hardhat', 'construction')) return (r, m, a) => { const o = workUniform(r, m, a, CLOTH.chambray, 'construction'); o.hat = { kind: 'hardHat', fabric: fabric(r, UNIFORM.hardhat, { rough: 0.4, sheen: 0.3 }) }; return o; };
  if (has('garment', 'cart', 'handcart', 'presser', 'smock')) return garmentWorker;
  if (has('vendor')) return vendor;
  return null;
}
const plainShirt = (rng: Rng, color: string, sleeve: number): TopDesc => ({ kind: 'uniformShirt', sleeve, collar: 'spread', collarPoint: 0.08, open: 1, tucked: true, fit: 0.012, fabric: fabric(rng, color, { fade: rng.range(0, 0.15) }) });
const plainTrousers = (rng: Rng, color: string, flare = 0.02): BottomDesc => ({ kind: 'trousers', rise: 0.01, flare, length: 2.05, fit: 0.016, fabric: fabric(rng, color), belt: fabric(rng, LEATHER.black, { rough: 0.45, sheen: 0.3 }) });
const policeUniform: Preset = (rng) => ({
  top: plainShirt(rng, UNIFORM.policeShirt, 0.45), bottom: plainTrousers(rng, UNIFORM.policeDark, 0.015), dress: false, outer: null,
  tie: { ...fabric(rng, UNIFORM.policeDark, { rough: 0.6 }), width: 0.07 },
  shoes: { kind: 'oxford', color: LEATHER.patent, color2: '#1a1614', sole: 0.014, heel: 0.022, wear: 0.15 }, socks: CLOTH.black, hosiery: 0,
  hat: { kind: 'policeCap', fabric: fabric(rng, UNIFORM.policeDark, { rough: 0.6 }) }, glasses: rng.chance(0.15) ? { kind: 'aviator', frame: METAL.gold, tint: 0.7, scale: 1.3 } : null,
  props: ['nightstick'], uniform: 'police', sweat: 1,
});
const workUniform = (rng: Rng, _male: boolean, _age: number, color: string, kind: string): Outfit => ({
  top: { ...plainShirt(rng, color, rng.chance(0.6) ? 0.45 : 1.3), kind: 'workShirt' }, bottom: plainTrousers(rng, color, 0.015), dress: false,
  outer: kind === 'sanitation' && rng.chance(0.3) ? { kind: 'workJacket', length: 0.1, lapel: 0, open: 1, sleeve: 1.97, belted: false, fabric: fabric(rng, color) } : null,
  tie: null, shoes: { kind: 'workBoot', color: LEATHER.black, color2: '#1a1614', sole: 0.02, heel: 0.025, wear: 0.6 }, socks: CLOTH.black, hosiery: 0,
  hat: kind === 'transit' ? { kind: 'peakedCap', fabric: fabric(rng, color) } : rng.chance(0.3) ? { kind: 'flatCap', fabric: fabric(rng, CLOTH.charcoal) } : null,
  glasses: null, props: kind === 'sanitation' ? ['workGloves'] : [], uniform: kind, sweat: 1.3,
});
const doorman: Preset = (rng) => ({
  top: plainShirt(rng, CLOTH.white, 1.97), bottom: plainTrousers(rng, UNIFORM.doorman, 0.01), dress: false,
  outer: { kind: 'uniformJacket', length: 0.42, lapel: 0, open: 0, sleeve: 1.97, belted: false, fabric: fabric(rng, UNIFORM.doorman, { rough: 0.7 }) },
  tie: { ...fabric(rng, CLOTH.black), width: 0.06 }, shoes: { kind: 'oxford', color: LEATHER.patent, color2: '#1a1614', sole: 0.014, heel: 0.022, wear: 0.1 }, socks: CLOTH.black, hosiery: 0,
  hat: { kind: 'peakedCap', fabric: fabric(rng, UNIFORM.doorman) }, glasses: null, props: [], uniform: 'doorman', sweat: 1.2,
});
const garmentWorker: Preset = (rng, male, age) => {
  const base = male ? menOutfit(rng, age, true) : womenOutfit(rng, age, true);
  base.outer = rng.chance(male ? 0.25 : 0.55) ? { kind: 'smock', length: male ? 0.45 : 0.35, lapel: 0, open: rng.chance(0.5) ? 1 : 0, sleeve: rng.chance(0.5) ? 0.45 : 1.97, belted: false, fabric: fabric(rng, rng.pick([UNIFORM.smock, UNIFORM.smockBlue]), { dirt: 0.3 }) } : null;
  base.tie = null;
  if (male) { base.top.sleeve = rng.range(1.15, 1.4); base.top.open = 2; }
  base.props = ['handcart'];
  base.hat = male && rng.chance(0.2) ? { kind: 'flatCap', fabric: fabric(rng, CLOTH.charcoal) } : null;
  return base;
};
const vendor: Preset = (rng, male, age) => {
  const base = male ? menOutfit(rng, age, true) : womenOutfit(rng, age, true);
  base.outer = { kind: 'smock', length: 0.4, lapel: 0, open: 0, sleeve: 0.05, belted: false, fabric: fabric(rng, CLOTH.white, { dirt: 0.4 }) };
  base.tie = null; base.props = [];
  base.hat = rng.chance(0.5) ? { kind: 'flatCap', fabric: fabric(rng, CLOTH.white) } : base.hat;
  return base;
};
