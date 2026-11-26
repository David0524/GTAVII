/**
 * Content schemas for gameplay. The narrative stream owns the content (`content/items/*.json`,
 * `content/shops/*.json`, `content/weapons/*.json`, `content/precincts.json`, `content/outfits/*.json`);
 * gameplay owns these shapes and validates whatever it is given. `defaults.ts` holds placeholder
 * content so the systems run before narrative content lands. See docs/GAMEPLAY_CONTENT_SCHEMA.md.
 *
 * Money is ALWAYS integer cents inside gameplay (1974 prices are 10¢ phone calls and 25¢ coffees;
 * floats would drift). Mission rewards written in dollars are converted at the boundary (×100).
 */

export type ItemKind = 'weapon' | 'ammo' | 'consumable' | 'key' | 'evidence' | 'photo' | 'armor' | 'clothing' | 'misc';

export interface ItemDef {
  id: string;                 // item.*
  name: string;
  kind: ItemKind;
  /** base price in cents (shops apply their own markup) */
  price: number;
  stack: number;              // max per stack; inventory holds any number of stacks for non-weapons
  /** Can a shop buy it back? Evidence and keys never. */
  sellable: boolean;
  /** Is possession itself a crime if a cop searches you (unlicensed handgun under the Sullivan Act, etc.)? */
  illicit?: boolean;
  weapon?: string;            // weapon.* for kind 'weapon'
  ammo?: string;              // ammo item id for kind 'ammo' (self) or the calibre group
  rounds?: number;            // rounds per purchased box (ammo)
  heal?: number;              // hp restored (consumables)
  stopsBleeding?: boolean;
  armor?: number;             // armor points (vest)
  /** firearm quality tier for new instances (street | service | quality) */
  tier?: 'street' | 'service' | 'quality';
  note?: string;
}

export type WeaponClass = 'melee' | 'handgun' | 'shotgun' | 'rifle' | 'smg';
export interface WeaponDef {
  id: string;                 // weapon.*
  name: string;               // invented, see docs/WEAPON_REGISTRY.md
  class: WeaponClass;
  /** handling family used by lead skills: revolver | pistol | long | auto | blunt | blade */
  family: 'revolver' | 'pistol' | 'long' | 'auto' | 'blunt' | 'blade' | 'fists';
  damage: number;             // per projectile (or per melee hit)
  pellets?: number;           // shotguns
  falloff?: [number, number, number]; // start m, end m, min multiplier
  range: number;              // max effective range m (melee: reach)
  interval: number;           // s between shots / swings
  auto?: boolean;
  magazine?: number;
  ammo?: string;              // ammo item id
  reload?: number;            // s for a full reload
  perRound?: number;          // s per round when loaded singly (revolver w/o loader, pump, bolt). Interruptible.
  spreadHip?: number;         // degrees (cone half-angle)
  spreadAim?: number;
  spreadMove?: number;        // added while moving at run speed
  recoil?: number;            // degrees of muzzle climb per shot
  recoilRecover?: number;     // degrees/s
  bloom?: number;             // spread added per shot (degrees), recovers with recoil
  penetration?: number;       // power units (see world.ts RESIST)
  noise: number;              // metres a witness can hear it (open street; canyon multipliers apply)
  concealable: boolean;       // does carrying it in hand count as "brandishing" at a glance
  melee?: { light: number; heavy: number; reach: number; speed: number; breaks?: number; bleed?: number };
  driveBy?: boolean;          // usable from a vehicle seat
  /** how big it is to hide (items/guns.ts concealment); derived from class when absent */
  bulk?: 'pocket' | 'belt' | 'coat' | 'long';
}

export interface ShopDef {
  id: string;                 // shop.*
  name: string;
  kind: 'diner' | 'clothing' | 'pawn' | 'fence' | 'hardware' | 'newsstand' | 'liquor' | 'pharmacy' | 'sporting';
  at?: string;                // narrative place / interior id
  hours?: [string, string];
  markup: number;             // multiplier on ItemDef.price
  buyback: number;            // fraction of base price paid when the shop buys from the player (0 = doesn't buy)
  buysKinds?: ItemKind[];
  stock: { item: string; qty: number; price?: number }[]; // qty -1 = unlimited
  /** Needs an introduction (flag) before it will deal: fences. */
  requiresFlag?: string;
}

export interface GarmentDef { id: string; slot: 'top' | 'bottom' | 'full' | 'shoes' | 'hat' | 'outer'; noun: string; style: string }
export interface OutfitDef {
  id: string;                 // outfit.*
  name: string;
  price: number;              // cents, whole outfit
  pieces: { garment: string; colour: string }[]; // colour = plain-English witness word ("tan", "powder blue")
  /** characters stream wardrobe set id passed to Character.setWardrobe */
  wardrobeSet: string;
  leads?: string[];           // who can wear it (fit); empty = anyone
}

export interface PrecinctDef {
  id: string;                 // pct.*
  name: string;
  /** polygon x,z pairs in world metres */
  area: number[];
  station: [number, number];
  /** 0..1 base share of officers who will take money (narrative tunes per act) */
  corruptibility: number;
  /** base response delay multiplier (1 = normal) */
  responsiveness: number;
}

export interface LeadProfile {
  id: string;
  name: string;
  description: string;        // witness phrasing of the person themselves (narrative-owned wording)
  sex: 'male' | 'female';
  build: 'slim' | 'medium' | 'heavy';
  maxHp: number;
  /** spread multipliers by weapon family (lower is better) */
  aim: Partial<Record<WeaponDef['family'], number>> & { default: number };
  recoilControl: number;      // multiplier on recoil (lower is better)
  reloadSpeed: number;        // multiplier on reload time (lower is faster)
  melee: { damage: number; speed: number; parryWindow: number; dodgeIframes: number };
  sprint: number;             // speed multiplier on foot
  evasion: number;            // 0..1: how much less memorable/visible (witness memory, cop spotting)
  bribeSkill: number;         // added to bribe chance
  hiresMuscle: boolean;       // can hire companion AI
  regenCeiling: number;       // fraction of max hp regen reaches
  startMoney: number;         // cents
  startItems: { id: string; qty: number }[];
  startOutfits: string[];
  home: string;               // place id where the wardrobe is stored
  homeAt: [number, number];
  /** starting skills 0–100 (narrative 1–10 sheet × 10); improve with use (player/skills.ts) */
  skills?: Partial<Record<'stamina' | 'strength' | 'shooting' | 'driving' | 'stealth' | 'lockwork', number>>;
  /** 0..1: how well crowds hide them once line of sight breaks (Delphine's "Disappear") */
  crowdCover?: number;
  /** lead abilities agreed with narrative (ENGINE_REQUESTS narrative 11) */
  abilities?: ('old_beat' | 'keys' | 'evidence' | 'disappear' | 'payroll' | 'muscle')[];
}

export interface GameplayContent {
  items: ItemDef[];
  weapons: WeaponDef[];
  shops: ShopDef[];
  outfits: OutfitDef[];
  garments: GarmentDef[];
  precincts: PrecinctDef[];
  leads: LeadProfile[];
}

/** Validate and normalise loose content. Throws with every problem listed (content bugs should fail loudly in tests). */
export function validateContent(c: GameplayContent): GameplayContent {
  const errs: string[] = [];
  const ids = new Set<string>();
  const uniq = (id: string, prefix: string) => {
    if (!id?.startsWith(prefix)) errs.push(`${id}: id must start with ${prefix}`);
    if (ids.has(id)) errs.push(`${id}: duplicate id`);
    ids.add(id);
  };
  const isCents = (n: number, where: string) => { if (!Number.isInteger(n) || n < 0) errs.push(`${where}: price must be non-negative integer cents, got ${n}`); };
  const weapons = new Map(c.weapons.map((w) => [w.id, w]));
  const items = new Map(c.items.map((i) => [i.id, i]));
  for (const w of c.weapons) {
    uniq(w.id, 'weapon.');
    if (w.class !== 'melee') {
      if (!w.magazine || !w.ammo || !(w.reload || w.perRound)) errs.push(`${w.id}: firearms need magazine, ammo and reload/perRound`);
      if (w.ammo && !items.has(w.ammo)) errs.push(`${w.id}: unknown ammo ${w.ammo}`);
    } else if (!w.melee) errs.push(`${w.id}: melee weapons need melee stats`);
  }
  for (const i of c.items) {
    uniq(i.id, 'item.'); isCents(i.price, i.id);
    if (i.kind === 'weapon' && (!i.weapon || !weapons.has(i.weapon))) errs.push(`${i.id}: weapon item must reference a weapon`);
    if ((i.kind === 'evidence' || i.kind === 'key') && i.sellable) errs.push(`${i.id}: evidence and keys are never sellable`);
    if (i.stack < 1) errs.push(`${i.id}: stack must be >= 1`);
  }
  for (const s of c.shops) {
    uniq(s.id, 'shop.');
    if (!(s.markup >= 1)) errs.push(`${s.id}: markup must be >= 1 (shops never sell below base)`);
    if (s.buyback < 0 || s.buyback >= 1) errs.push(`${s.id}: buyback must be in [0,1) so buy→sell never profits`);
    for (const st of s.stock) { if (!items.has(st.item)) errs.push(`${s.id}: unknown stock item ${st.item}`); if (st.price !== undefined) isCents(st.price, `${s.id}/${st.item}`); }
  }
  const garments = new Set(c.garments.map((g) => g.id));
  for (const o of c.outfits) {
    uniq(o.id, 'outfit.'); isCents(o.price, o.id);
    for (const p of o.pieces) if (!garments.has(p.garment)) errs.push(`${o.id}: unknown garment ${p.garment}`);
  }
  // narrative uses precinct.*, the placeholders pct.*
  for (const p of c.precincts) { uniq(p.id, p.id.startsWith('precinct.') ? 'precinct.' : 'pct.'); if (p.area.length < 6 || p.area.length % 2) errs.push(`${p.id}: area must be a polygon of x,z pairs`); }
  for (const l of c.leads) {
    uniq(l.id, 'char.'); isCents(l.startMoney, l.id);
    for (const it of l.startItems) if (!items.has(it.id)) errs.push(`${l.id}: unknown start item ${it.id}`);
    for (const o of l.startOutfits) if (!c.outfits.some((x) => x.id === o)) errs.push(`${l.id}: unknown outfit ${o}`);
  }
  if (errs.length) throw new Error('Gameplay content invalid:\n  ' + errs.join('\n  '));
  return c;
}
