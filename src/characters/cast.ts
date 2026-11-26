/**
 * Narrative cast sheets (content/cast/*.json: `appearance` for leads/principals, `visual` for
 * secondary characters) → CharacterBuild. The sheet's numbers and colours are used exactly
 * (heightCm, skinHex, hairHex); build, hair and per-act wardrobe text are read with a small
 * keyword parser on top of the 1974 generators. The three leads have hand-tuned builds in heroes.ts.
 */
import { generateAppearance, type FacialHair, type HairStyle } from './body/appearance';
import { generateOutfit, type Fabric, type Outfit, type OuterKind, type TopKind, type HatKind, type ShoeKind } from './wardrobe/outfit';
import { CLOTH, LEATHER } from './wardrobe/palette';
import type { CharacterBuild } from './Character';
import { hashString } from './util/rng';

export interface CastEntry {
  id: string; name?: string; age?: number; tier?: string; pronouns?: string; gender?: string;
  appearance?: { build?: string; heightCm?: number; skinHex?: string; skinTone?: string; hair?: string; hairHex?: string; face?: string; posture?: string; gait?: string; wardrobeByAct?: Record<string, string> };
  visual?: { palette?: string[]; silhouette?: string; wardrobe?: string; props?: string[] };
  [k: string]: unknown;
}

const COLOURS: [RegExp, string][] = [
  [/navy|midnight/, CLOTH.navy], [/charcoal/, CLOTH.charcoal], [/black/, CLOTH.black], [/white|ivory/, CLOTH.white], [/cream|off-white|eggshell/, CLOTH.cream],
  [/grey|gray/, CLOTH.suitGrey], [/tan|beige|camel|khaki/, CLOTH.khaki], [/brown|chocolate/, CLOTH.suitBrown], [/rust/, CLOTH.rust], [/oxblood|maroon|burgundy|wine/, CLOTH.oxblood],
  [/red/, CLOTH.red70], [/pink/, CLOTH.pinkPantsuit], [/mustard|gold|yellow/, CLOTH.mustard], [/orange/, CLOTH.orange70], [/olive|army/, CLOTH.olive], [/green/, CLOTH.forest],
  [/light blue|pale blue|powder/, CLOTH.paleBlue], [/blue|denim/, CLOTH.denim70], [/purple|lilac|lavender/, CLOTH.lilac], [/plaid|check/, CLOTH.plaidBrown],
];
const colourIn = (s: string) => COLOURS.find(([r]) => r.test(s))?.[1];

const isFemale = (e: CastEntry) => {
  const g = `${e.gender ?? ''} ${e.pronouns ?? ''}`.toLowerCase();
  if (/female|she|woman/.test(g)) return true;
  if (/male|he\b|man/.test(g)) return false;
  const text = JSON.stringify(e).toLowerCase();
  const she = (text.match(/\b(she|her|hers|woman|mother|daughter|wife|widow|mrs\.?|miss)\b/g) ?? []).length;
  const he = (text.match(/\b(he|him|his|man|father|son|husband|mr\.?|sgt\.?)\b/g) ?? []).length;
  return she > he;
};

function hairFrom(text: string, female: boolean, age: number): { style: HairStyle; facial: FacialHair; thinning: number; recession: number } {
  const t = text.toLowerCase();
  const style: HairStyle =
    /bald|shaved head/.test(t) ? 'bald' : /comb(ed)?[- ]over/.test(t) ? 'combOver' : /afro/.test(t) ? (/short|cropped|close/.test(t) ? 'afroShort' : 'afro') : /cornrow/.test(t) ? 'cornrows' :
    /pompadour|quiff/.test(t) ? 'pompadour' : /tonic|slicked|combed (straight )?back|brushed back|greased/.test(t) ? 'slick' : /beehive|bun|updo|chignon|french twist/.test(t) ? 'updo' :
    /set curls|permanent|perm|rollers|teased/.test(t) ? 'setCurls' : /braid|plait/.test(t) ? 'braid' : /ponytail/.test(t) ? 'ponytail' : /shag/.test(t) ? 'shag' : /feather/.test(t) ? 'feathered' :
    /flip/.test(t) ? 'flip' : /bob/.test(t) ? 'bob' : /long/.test(t) ? 'longStraight' : /curl/.test(t) ? 'curlyMid' : /crew|buzz|brush cut/.test(t) ? 'buzz' :
    /side[- ]part/.test(t) ? 'sidePart' : /collar|ears/.test(t) ? 'earLength' : female ? (age > 50 ? 'setCurls' : 'bob') : 'short';
  const facial: FacialHair = /full beard|beard/.test(t) && !/no beard|clean/.test(t) ? 'beard' : /goatee/.test(t) ? 'goatee' : /horseshoe/.test(t) ? 'horseshoe' :
    /mustache|moustache/.test(t) && /sideburn/.test(t) ? 'moustacheSideburns' : /mustache|moustache/.test(t) ? 'moustache' : /sideburn/.test(t) ? 'sideburns' : /stubble|five o'clock/.test(t) ? 'stubble' : 'none';
  return { style, facial: female ? 'none' : facial, thinning: /thinning|receding|balding/.test(t) ? 0.65 : 0, recession: /receding|high forehead|balding/.test(t) ? 0.7 : 0 };
}

const fab = (color: string, o: Partial<Fabric> = {}): Fabric => ({ color, color2: o.color2 ?? color, pattern: o.pattern ?? 'solid', scale: o.scale ?? 0.02, rough: o.rough ?? 0.8, sheen: o.sheen ?? 0, fade: o.fade ?? 0.12, dirt: o.dirt ?? 0.1 });

/** Reads a wardrobe sentence ("Short-sleeve dress shirt with sweat rings, clip-on tie, plaid sport coat over his arm") into an outfit. */
export function outfitFromText(text: string, seed: number, female: boolean, age: number): Outfit {
  // only explicit uniforms select a uniform preset ("cop oxfords" is a shoe, not a uniform)
  const o = generateOutfit(seed, { sex: female ? 0 : 1, age, wardrobe: /uniform/i.test(text) ? text : '' });
  const t = text.toLowerCase();
  const clauses = t.split(/[,;]| and | over | with |: /);
  const colourNear = (re: RegExp) => { for (const c of clauses) if (re.test(c)) return colourIn(c); return undefined; };
  // tops
  // the first garment named is the visible top ("shirt over an undershirt" → shirt)
  const TOPS: [RegExp, TopKind][] = [[/blouse/, 'blouse'], [/t-shirt|\btee\b/, 'tee'], [/undershirt|tank top/, 'tank'], [/turtleneck/, 'turtleneck'], [/polo|knit shirt/, 'knitPolo'],
    [/sweater/, 'sweater'], [/work shirt|chambray/, 'workShirt'], [/(?<!under)shirt/, 'dressShirt'], [/\bshell\b/, 'shell']];
  let topKind: TopKind | null = null, at = Infinity;
  for (const [r, k] of TOPS) { const m = r.exec(t); if (m && m.index < at) { at = m.index; topKind = k; } }
  if (topKind) { o.top.kind = topKind; const c = colourNear(/shirt|blouse|tee|top|sweater|shell|turtleneck/); if (c) o.top.fabric = fab(c); }
  if (/short[- ]sleeve/.test(t)) o.top.sleeve = 0.45; else if (/sleeves rolled|rolled sleeves/.test(t)) o.top.sleeve = 1.3; else if (/sleeveless/.test(t)) o.top.sleeve = 0.05; else if (topKind && topKind !== 'tee' && topKind !== 'tank') o.top.sleeve = 1.97;
  if (/untucked/.test(t)) o.top.tucked = false;
  if (/sweat ring|sweat-stained|sweat/.test(t)) o.sweat = 1.6;
  // bottoms / dresses
  if (/dress\b(?! shirt)|wrap dress|shift|frock/.test(t)) { o.dress = true; o.bottom.kind = 'skirt'; o.bottom.length = /midi|calf/.test(t) ? 0.15 : 0; const c = colourNear(/dress/); if (c) o.top.fabric = o.bottom.fabric = fab(c); }
  else if (/jeans|denim/.test(t)) { o.bottom.kind = 'jeans'; o.bottom.fabric = fab(CLOTH.denim70, { pattern: 'denim', scale: 0.0035, rough: 0.9 }); }
  else if (/skirt/.test(t)) { o.bottom.kind = 'skirt'; o.bottom.length = /mini|short/.test(t) ? -0.1 : /midi|long/.test(t) ? 0.15 : 0; const c = colourNear(/skirt/); if (c) o.bottom.fabric = fab(c); }
  else if (/slacks|trousers|pants|flares|bell/.test(t)) { o.bottom.kind = 'trousers'; const c = colourNear(/slacks|trousers|pants|flares/); if (c) o.bottom.fabric = fab(c, { sheen: /poly/.test(t) ? 0.3 : 0 }); if (/flare|bell/.test(t)) o.bottom.flare = 0.06; }
  // outer layer
  const outer: OuterKind | null = /trench/.test(t) ? 'trench' : /raincoat/.test(t) ? 'raincoat' : /overcoat|topcoat/.test(t) ? 'overcoat' : /windbreaker/.test(t) ? 'windbreaker' : /leather jacket/.test(t) ? 'leather' :
    /cardigan/.test(t) ? 'cardigan' : /smock|apron/.test(t) ? 'smock' : /sport ?coat|blazer/.test(t) ? 'sportCoat' : /leisure suit/.test(t) ? 'leisureJacket' : /suit|jacket/.test(t) ? 'suitJacket' : /vest/.test(t) ? 'vest' : null;
  const carried = /over (his|her) arm|on (his|her) arm|left in the car|no jacket|jacket off/.test(t);
  if (outer && !carried) {
    const c = colourNear(/coat|jacket|suit|smock|cardigan|windbreaker|blazer|apron/) ?? o.outer?.fabric.color ?? CLOTH.charcoal;
    const pattern = /plaid/.test(t) ? 'plaid' : /check|houndstooth/.test(t) ? 'houndstooth' : /pinstripe/.test(t) ? 'pinstripe' : 'solid';
    o.outer = { kind: outer, length: outer === 'trench' || outer === 'overcoat' || outer === 'raincoat' ? 0.6 : outer === 'smock' ? 0.4 : outer === 'windbreaker' || outer === 'cardigan' ? 0.1 : 0.27,
      lapel: /suit|sport|blazer|trench|overcoat|raincoat|leisure/.test(outer.toLowerCase()) || outer === 'suitJacket' ? 0.105 : 0, open: /open|unbuttoned/.test(t) ? 1 : 0.4, sleeve: 1.97, belted: /belted/.test(t), fabric: fab(c, { pattern: pattern as Fabric['pattern'], scale: pattern === 'plaid' ? 0.09 : 0.012, color2: pattern !== 'solid' ? CLOTH.rust : undefined }) };
    if (outer === 'suitJacket' && /suit/.test(t)) o.bottom.fabric = o.outer.fabric;
  } else if (carried || /no jacket/.test(t)) o.outer = null;
  if (/tie gone|no tie|tieless|open collar/.test(t)) o.tie = null;
  else if (/\btie\b|necktie/.test(t)) o.tie = { ...fab(colourNear(/tie/) ?? CLOTH.tieMaroon, { sheen: 0.35, rough: 0.55 }), width: /clip-on|thin|narrow/.test(t) ? 0.08 : 0.115 };
  if (/bow tie/.test(t)) o.tie = { ...fab(CLOTH.black), width: 0.05 };
  // hats, shoes, glasses
  const hat: HatKind | null = /fedora|felt hat/.test(t) ? 'fedora' : /straw hat|boater|panama/.test(t) ? 'straw' : /flat cap|cloth cap/.test(t) ? 'flatCap' : /newsboy/.test(t) ? 'newsboy' :
    /beret/.test(t) ? 'beret' : /knit cap|watch cap|wool cap/.test(t) ? 'knit' : /headscarf|head scarf|kerchief|scarf over/.test(t) ? 'headscarf' : /hard ?hat/.test(t) ? 'hardHat' : null;
  if (hat) o.hat = { kind: hat, fabric: fab(colourNear(/hat|cap|scarf|beret/) ?? (hat === 'straw' ? '#d2bd8a' : CLOTH.charcoal), hat === 'straw' ? { pattern: 'tweed', scale: 0.003, color2: '#3a2a20' } : {}) };
  const shoe: ShoeKind | null = /platform/.test(t) ? 'platform' : /sneaker|canvas shoe|keds/.test(t) ? 'sneaker' : /work boot/.test(t) ? 'workBoot' : /boot/.test(t) ? 'boot' : /loafer/.test(t) ? 'loafer' :
    /wingtip|brogue/.test(t) ? 'wingtip' : /oxford|cop shoe/.test(t) ? 'oxford' : /sandal/.test(t) ? 'sandal' : /heel|pump/.test(t) ? 'pump' : /clog/.test(t) ? 'clog' : null;
  if (shoe) { o.shoes.kind = shoe; const c = colourNear(/shoe|boot|loafer|oxford|heel|pump|sandal|sneaker|wingtip|platform/); if (c) o.shoes.color = c; if (/scuff|worn|cracked/.test(t)) o.shoes.wear = 0.8; if (shoe === 'oxford' && !c) o.shoes.color = LEATHER.black; }
  if (/sunglasses|shades|dark glasses/.test(t)) o.glasses = { kind: 'aviator', frame: '#b08a3a', tint: 0.75, scale: 1.3 };
  else if (/glasses|spectacles|bifocals/.test(t)) o.glasses = { kind: 'horn', frame: '#4a2a18', tint: 0, scale: 1.3 };
  return o;
}

export function castBuild(e: CastEntry): CharacterBuild {
  const female = isFemale(e);
  const age = Math.max(18, e.age ?? 40);
  const seed = hashString(e.id);
  const a = e.appearance;
  const appearance = generateAppearance(seed, { sex: female ? 0 : 1, age });
  if (a) {
    const build = (a.build ?? '').toLowerCase();
    const m = appearance.body.macro;
    if (/fat|heavy|stout|portly|paunch|big|barrel|thick/.test(build)) m.weight = Math.min(0.95, m.weight + 0.3);
    if (/thin|slight|wiry|lean|gaunt|skinny|bony|slim/.test(build)) m.weight = Math.max(0.08, m.weight - 0.25);
    if (/muscle|strong|broad|powerful|athletic/.test(build)) m.muscle = Math.min(0.9, m.muscle + 0.25);
    if (/soft|gone to fat/.test(build)) m.muscle = Math.max(0.2, m.muscle - 0.1);
    if (a.heightCm) appearance.stature = a.heightCm / 100;
    if (a.skinHex) { appearance.skin.tone = a.skinHex.toLowerCase(); const n = parseInt(a.skinHex.slice(1), 16); appearance.skin.melanin = 1 - (((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) / 255; }
    if (/ruddy|flushed|red-faced|broken veins/.test((a.skinTone ?? '').toLowerCase())) appearance.skin.redness = 0.8;
    if (/freckl/.test(`${a.skinTone} ${a.face}`.toLowerCase())) appearance.skin.freckles = 0.6;
    const h = hairFrom(`${a.hair ?? ''} ${a.face ?? ''}`, female, age);
    appearance.hair = { ...appearance.hair, style: h.style, thinning: h.thinning, recession: Math.max(appearance.hair.recession, h.recession), color: (a.hairHex ?? appearance.hair.color).toLowerCase(), grey: /grey|gray|white|silver/.test((a.hair ?? '').toLowerCase()) ? 0.5 : appearance.hair.grey };
    appearance.facialHair = h.facial; appearance.facialHairColor = appearance.hair.color;
    if (/stoop|hunch|slump/.test(`${a.posture} ${a.build}`.toLowerCase())) appearance.slump = 0.6;
    if (/upright|straight|military|chin up/.test((a.posture ?? '').toLowerCase())) appearance.slump = 0.05;
    const g = (a.gait ?? '').toLowerCase();
    if (/slow|amble|shuffl|heavy/.test(g)) appearance.gait = { ...appearance.gait, stride: 0.9, speed: 0.85, bounce: 1.15 };
    if (/long|brisk|quick|fast/.test(g)) appearance.gait = { ...appearance.gait, stride: 1.1, speed: 1.1 };
  }
  const acts = a?.wardrobeByAct ?? {};
  const sets: Record<string, (s: number) => Outfit> = {};
  for (const [k, text] of Object.entries(acts)) if (!/not seen|offstage/i.test(text)) sets[k] = () => outfitFromText(text, seed ^ hashString(k), female, age);
  const visualText = e.visual?.wardrobe;
  const first = Object.keys(sets)[0];
  const outfit = first ? sets[first](seed) : visualText ? outfitFromText(visualText, seed, female, age) : generateOutfit(seed, { sex: female ? 0 : 1, age, palette: e.visual?.palette });
  if (!first && e.visual?.palette?.length) { outfit.top.fabric.color = e.visual.palette[0]; if (e.visual.palette[1]) outfit.bottom.fabric.color = e.visual.palette[1]; }
  sets.default = () => outfit;
  return { appearance, outfit, wardrobeSets: sets };
}
