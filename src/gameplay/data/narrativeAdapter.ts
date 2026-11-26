/**
 * Adapter: narrative's systems content (branch claude/sharp-maxwell-jnb6hr, ENGINE_REQUESTS "From
 * narrative: 13") → gameplay's schema. Narrative writes names, prices in DOLLARS, tiers and prose;
 * gameplay supplies the numbers. Unknown things are skipped with a warning, never thrown, so content
 * can grow ahead of the code. The result is validated by `validateContent` like any other content.
 */
import type { GameplayContent, ItemDef, ItemKind, PrecinctDef, ShopDef, WeaponDef } from './schema';
import { DEFAULT_CONTENT, WEAPONS } from './defaults';
import type { GunTier } from '../items/guns';

type Json = Record<string, any>;
export interface NarrativeFiles { ammo?: Json; consumables?: Json; keys?: Json; evidence?: Json; weapons?: Json; shops?: Json; precincts?: Json }

const cents = (d: unknown) => (typeof d === 'number' ? Math.round(d * 100) : 0);
const base = (id: string) => WEAPONS.find((w) => w.id === id)!;

/** Narrative weapon `class` → the archetype whose handling it inherits, plus damage scale and bulk. */
const ARCHETYPE: Record<string, { from: string; dmg?: number; mag?: number; bulk: WeaponDef['bulk'] }> = {
  'pocket pistol': { from: 'weapon.pistol', dmg: 0.7, mag: 6, bulk: 'pocket' },
  'small revolver': { from: 'weapon.snub', dmg: 0.75, mag: 6, bulk: 'pocket' },
  'snub-nose revolver': { from: 'weapon.snub', bulk: 'pocket' },
  'service revolver': { from: 'weapon.service', bulk: 'belt' },
  'automatic pistol': { from: 'weapon.pistol', dmg: 1.15, mag: 7, bulk: 'belt' },
  'pump shotgun': { from: 'weapon.pump', bulk: 'long' },
  'sawn-off shotgun': { from: 'weapon.sawnoff', bulk: 'coat' },
  'hunting rifle': { from: 'weapon.rifle', bulk: 'long' },
  'submachine gun': { from: 'weapon.smg', bulk: 'coat' },
  blade: { from: 'weapon.knife', bulk: 'pocket' },
  blunt: { from: 'weapon.pipe', bulk: 'long' },
  'blunt/tool': { from: 'weapon.pipe', bulk: 'long' },
};
const CALIBRE: [RegExp, string][] = [[/_25_|\.25/, 'item.ammo_25'], [/_22_|\.22/, 'item.ammo_22'], [/_38_|\.38|revolver_service/, 'item.ammo_38'], [/_45_|\.45/, 'item.ammo_45'], [/_9_|9mm/, 'item.ammo_9'], [/_12_|12-gauge|shotgun/, 'item.ammo_12ga'], [/_30_|\.30|rifle/, 'item.ammo_30']];
const ROUNDS: Record<string, number> = { 'item.ammo_12ga': 25, 'item.ammo_30': 20 };
const SHOP_KIND: Record<string, ShopDef['kind']> = { diner: 'diner', clothing: 'clothing', pawn: 'pawn', hardware: 'hardware', newsstand: 'newsstand', drugstore: 'pharmacy', liquor: 'liquor', guns: 'sporting', fence: 'fence' };
const SHOP_ECON: Record<ShopDef['kind'], { markup: number; buyback: number; buys?: ItemKind[] }> = {
  diner: { markup: 1, buyback: 0 }, clothing: { markup: 1, buyback: 0 }, pawn: { markup: 1.1, buyback: 0.4, buys: ['weapon', 'armor', 'misc'] },
  fence: { markup: 1.35, buyback: 0.3, buys: ['weapon', 'ammo', 'armor', 'misc'] }, hardware: { markup: 1, buyback: 0 }, newsstand: { markup: 1, buyback: 0 },
  liquor: { markup: 1, buyback: 0 }, pharmacy: { markup: 1, buyback: 0 }, sporting: { markup: 1, buyback: 0 },
};
/** Narrative effect prose → numbers. */
function effect(e: string | undefined): Partial<ItemDef> {
  const s = (e ?? '').toLowerCase();
  if (s.includes('stops bleeding')) return { heal: 25, stopsBleeding: true };
  if (s.startsWith('small health')) return { heal: 10 };
  if (s.startsWith('health')) return { heal: 40, stopsBleeding: true }; // a diner meal: you get cleaned up
  if (s.includes('stamina')) return { heal: 3 };
  return {};
}
const slug = (s: string) => 'item.' + s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * Street numbers → world z (geo.ts frame): W 23rd ≈ −32 m, about 80.9 m per street uptown.
 * Avenues → world x (from streets.json): 8th −878, 7th −605, 6th −330, 5th −20, Madison ≈ +90.
 */
const zSt = (n: number) => -32 - (n - 23) * 80.9;
const X = { edgeW: -1580, ave8: -878, ave7: -605, ave6: -330, ave5: -20, madison: 90, edgeE: 520 };
const Z = { edgeS: 320, edgeN: -1990 };
/** Precinct houses → areas. Narrative's `covers` is prose; these rectangles follow it (gaps go to the
 *  nearest house: north of 43rd joins the house below it, south of 22nd joins Madison Square). */
const AREAS: Record<string, { area: number[]; station: [number, number] }> = {
  'precinct.midtown_central': { area: rect(X.edgeW, X.ave6, Z.edgeN, zSt(29)), station: [-742, -650] },
  'precinct.bryant_park': { area: rect(X.ave6, X.edgeE, Z.edgeN, zSt(29)), station: [-175, zSt(40) + 8] },
  'precinct.madison_square': { area: rect(X.edgeW, X.edgeE, zSt(29), Z.edgeS), station: [-470, zSt(24) - 8] },
};
function rect(x0: number, x1: number, z0: number, z1: number) { return [x0, z0, x1, z0, x1, z1, x0, z1]; }

export function adaptNarrative(f: NarrativeFiles, warn: (m: string) => void = () => {}): GameplayContent {
  const items: ItemDef[] = [];
  const weapons: WeaponDef[] = [...DEFAULT_CONTENT.weapons.filter((w) => w.id === 'weapon.fists')];
  const add = (i: ItemDef) => { if (!items.some((x) => x.id === i.id)) items.push(i); };
  for (const a of f.ammo?.items ?? []) add({ id: a.id, name: a.name, kind: 'ammo', ammo: a.id, rounds: ROUNDS[a.id] ?? 50, price: cents(a.price), stack: 999, sellable: true, illicit: true });
  for (const c of f.consumables?.items ?? []) add({ id: c.id, name: c.name, kind: 'consumable', price: cents(c.price), stack: 10, sellable: false, ...effect(c.effect) });
  for (const k of f.keys?.items ?? []) add({ id: k.id, name: k.name, kind: 'key', price: 0, stack: 1, sellable: false });
  for (const e of f.evidence?.items ?? []) add({ id: e.id, name: e.name, kind: e.id.startsWith('item.photo') || e.id.startsWith('item.print') ? 'photo' : 'evidence', price: 0, stack: 20, sellable: false });
  for (const w of f.weapons?.weapons ?? []) {
    const arch = ARCHETYPE[w.class];
    if (!arch) { warn(`weapon ${w.id}: unknown class "${w.class}"`); continue; }
    const b = base(arch.from);
    const wid = w.id.replace(/^item\./, 'weapon.');
    const melee = b.class === 'melee';
    const ammo = melee ? undefined : CALIBRE.find(([re]) => re.test(w.id) || re.test(w.name))?.[1];
    if (!melee && !ammo) { warn(`weapon ${w.id}: no calibre`); continue; }
    if (ammo && !items.some((i) => i.id === ammo)) add({ id: ammo, name: `${ammo.replace('item.ammo_', '')} rounds (box)`, kind: 'ammo', ammo, rounds: ROUNDS[ammo] ?? 50, price: 600, stack: 999, sellable: true, illicit: true });
    weapons.push({ ...b, id: wid, name: w.name, damage: Math.round(b.damage * (arch.dmg ?? 1)), magazine: melee ? undefined : arch.mag ?? b.magazine, ammo, bulk: arch.bulk, ...(melee && w.id.includes('razor') ? { melee: { ...b.melee!, bleed: 2.2 } } : {}) });
    const handgun = !melee && b.class === 'handgun';
    add({ id: w.id, name: w.name, kind: 'weapon', weapon: wid, price: cents(w.price), stack: 1, sellable: true, illicit: handgun || w.id === 'item.nightstick', tier: (w.tier === 'melee' ? undefined : w.tier) as GunTier | undefined, note: w.flavour });
  }
  // shops: item ids are stocked; "thing $price" strings become misc items
  const shops: ShopDef[] = [];
  for (const s of f.shops?.shops ?? []) {
    const kind = SHOP_KIND[s.type]; if (!kind) { warn(`shop ${s.id}: unknown type ${s.type}`); continue; }
    if (kind === 'clothing') continue; // outfits come from content/outfits (wardrobe)
    const econ = SHOP_ECON[kind];
    const stock: ShopDef['stock'] = [];
    for (const x of s.sells ?? []) {
      if (typeof x !== 'string') continue;
      if (x.startsWith('item.')) { if (items.some((i) => i.id === x)) stock.push({ item: x, qty: kind === 'diner' ? -1 : 6 }); else warn(`shop ${s.id}: unknown item ${x}`); continue; }
      const m = x.match(/^(.*?)\s+\$?([\d.]+)(¢)?$/);
      if (!m) continue; // "watches", "radios": things the shop buys, not sells
      const id = slug(m[1]);
      add({ id, name: m[1][0].toUpperCase() + m[1].slice(1), kind: 'misc', price: m[3] ? Math.round(+m[2]) : cents(+m[2]), stack: 5, sellable: kind === 'pawn' });
      stock.push({ item: id, qty: 8 });
    }
    shops.push({ id: s.id, name: s.name ?? s.id.replace('shop.', '').replace(/_/g, ' '), kind, at: s.biz, markup: econ.markup, buyback: econ.buyback, buysKinds: econ.buys, stock });
  }
  const precincts: PrecinctDef[] = [];
  for (const p of f.precincts?.precincts ?? []) {
    const a = AREAS[p.id];
    if (!a) { warn(`precinct ${p.id}: no area yet (narrative: please add street bounds)`); continue; }
    precincts.push({ id: p.id, name: p.name, area: a.area, station: a.station, corruptibility: Math.min(1, (p.corruptibility ?? 2.5) / 5), responsiveness: p.corruptibility >= 4 ? 1.1 : p.corruptibility <= 1 ? 0.9 : 1 });
  }
  // keep gameplay's placeholders for anything narrative hasn't written yet
  const out: GameplayContent = {
    items: [...items, ...DEFAULT_CONTENT.items.filter((d) => !items.some((i) => i.id === d.id) && (d.kind !== 'weapon' || weapons.some((w) => w.id === d.weapon)) && (d.kind !== 'ammo' || true))],
    weapons,
    shops: shops.length ? shops : DEFAULT_CONTENT.shops,
    outfits: DEFAULT_CONTENT.outfits, garments: DEFAULT_CONTENT.garments,
    precincts: precincts.length ? precincts : DEFAULT_CONTENT.precincts,
    leads: DEFAULT_CONTENT.leads,
  };
  // leads' start items must exist: swap placeholders for narrative equivalents
  const swap: Record<string, string> = { 'item.service': 'item.revolver_service', 'item.snub': 'item.mercer_38_pocketbook', 'item.knife': 'item.straight_razor', 'item.bandage': 'item.first_aid' };
  out.leads = out.leads.map((l) => ({ ...l, startItems: l.startItems.map((s) => (out.items.some((i) => i.id === s.id) ? s : swap[s.id] && out.items.some((i) => i.id === swap[s.id]) ? { ...s, id: swap[s.id] } : null)).filter((x): x is { id: string; qty: number } => !!x) }));
  return out;
}
