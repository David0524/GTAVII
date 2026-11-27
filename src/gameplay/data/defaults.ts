/**
 * PLACEHOLDER gameplay content, owned by gameplay only until the narrative stream supplies
 * `content/items`, `content/shops`, `content/weapons`, `content/outfits` and `content/precincts.json`
 * (requested: docs/GAMEPLAY_PROGRESS.md "Asks of narrative"). Every name here is invented; weapon
 * names are registered in docs/WEAPON_REGISTRY.md. Prices are 1974 New York prices in cents,
 * sourced/estimated in docs/GAMEPLAY_CONTENT_SCHEMA.md ("Price sheet").
 */
import type { GameplayContent, WeaponDef, ItemDef, ShopDef, OutfitDef, GarmentDef, PrecinctDef, LeadProfile } from './schema';

const W = (w: WeaponDef) => w;
export const WEAPONS: WeaponDef[] = [
  W({ id: 'weapon.fists', name: 'Fists', class: 'melee', family: 'fists', damage: 9, range: 1.1, interval: 0.32, noise: 18, concealable: true, melee: { light: 9, heavy: 20, reach: 1.1, speed: 1 } }),
  W({ id: 'weapon.bat', name: 'Ball bat', class: 'melee', family: 'blunt', damage: 18, range: 1.6, interval: 0.55, noise: 22, concealable: false, melee: { light: 18, heavy: 38, reach: 1.6, speed: 0.8 } }),
  W({ id: 'weapon.pipe', name: 'Length of pipe', class: 'melee', family: 'blunt', damage: 20, range: 1.5, interval: 0.6, noise: 24, concealable: false, melee: { light: 20, heavy: 40, reach: 1.5, speed: 0.75 } }),
  W({ id: 'weapon.nightstick', name: 'Nightstick', class: 'melee', family: 'blunt', damage: 15, range: 1.4, interval: 0.42, noise: 20, concealable: false, melee: { light: 15, heavy: 30, reach: 1.4, speed: 0.95 } }),
  W({ id: 'weapon.knife', name: 'Folding knife', class: 'melee', family: 'blade', damage: 16, range: 1.0, interval: 0.34, noise: 8, concealable: true, melee: { light: 16, heavy: 34, reach: 1.0, speed: 1.15, bleed: 1.6 } }),
  W({ id: 'weapon.bottle', name: 'Bottle', class: 'melee', family: 'blunt', damage: 14, range: 1.1, interval: 0.4, noise: 30, concealable: true, melee: { light: 14, heavy: 26, reach: 1.1, speed: 1.0, breaks: 1, bleed: 0.8 } }),
  W({ id: 'weapon.snub', name: 'Corbell Pocket Five', class: 'handgun', family: 'revolver', damage: 34, falloff: [8, 25, 0.5], range: 45, interval: 0.38, magazine: 5, ammo: 'item.ammo_38', reload: 2.4, spreadHip: 3.2, spreadAim: 1.5, spreadMove: 1.6, recoil: 4.5, recoilRecover: 14, bloom: 0.8, penetration: 0.6, noise: 110, concealable: true, driveBy: true }),
  W({ id: 'weapon.service', name: 'Corbell Patrol Six', class: 'handgun', family: 'revolver', damage: 38, falloff: [15, 40, 0.55], range: 60, interval: 0.42, magazine: 6, ammo: 'item.ammo_38', reload: 2.6, spreadHip: 2.4, spreadAim: 0.85, spreadMove: 1.4, recoil: 3.6, recoilRecover: 14, bloom: 0.6, penetration: 0.7, noise: 120, concealable: true, driveBy: true }),
  W({ id: 'weapon.pistol', name: 'Orsolini Model 52', class: 'handgun', family: 'pistol', damage: 30, falloff: [15, 40, 0.55], range: 55, interval: 0.22, magazine: 8, ammo: 'item.ammo_9', reload: 1.7, spreadHip: 2.6, spreadAim: 1.0, spreadMove: 1.4, recoil: 2.6, recoilRecover: 16, bloom: 0.5, penetration: 0.65, noise: 115, concealable: true, driveBy: true }),
  W({ id: 'weapon.pump', name: 'Bramwell Fieldpump', class: 'shotgun', family: 'long', damage: 13, pellets: 8, falloff: [6, 22, 0.15], range: 35, interval: 0.85, magazine: 5, ammo: 'item.ammo_12', perRound: 0.55, spreadHip: 5.5, spreadAim: 4.2, spreadMove: 1.0, recoil: 8, recoilRecover: 10, bloom: 0, penetration: 0.3, noise: 150, concealable: false }),
  W({ id: 'weapon.sawnoff', name: 'Ashby coach gun, cut down', class: 'shotgun', family: 'long', damage: 13, pellets: 9, falloff: [4, 14, 0.1], range: 22, interval: 0.3, magazine: 2, ammo: 'item.ammo_12', reload: 2.2, spreadHip: 8, spreadAim: 7, spreadMove: 1.0, recoil: 10, recoilRecover: 9, bloom: 0, penetration: 0.25, noise: 150, concealable: true, driveBy: true }),
  W({ id: 'weapon.rifle', name: 'Whitcombe Hillsman', class: 'rifle', family: 'long', damage: 85, falloff: [60, 150, 0.7], range: 180, interval: 1.3, magazine: 4, ammo: 'item.ammo_30', perRound: 0.7, spreadHip: 4, spreadAim: 0.2, spreadMove: 3, recoil: 9, recoilRecover: 8, bloom: 0, penetration: 1.4, noise: 220, concealable: false }),
  W({ id: 'weapon.smg', name: 'Vantine Mark II', class: 'smg', family: 'auto', damage: 22, falloff: [12, 35, 0.5], range: 50, interval: 0.085, auto: true, magazine: 30, ammo: 'item.ammo_45', reload: 2.6, spreadHip: 3.5, spreadAim: 2.0, spreadMove: 1.5, recoil: 1.4, recoilRecover: 12, bloom: 0.35, penetration: 0.55, noise: 140, concealable: false, driveBy: true }),
];

const I = (i: ItemDef) => i;
export const ITEMS: ItemDef[] = [
  I({ id: 'item.bat', name: 'Ball bat', kind: 'weapon', weapon: 'weapon.bat', price: 699, stack: 1, sellable: true }),
  I({ id: 'item.pipe', name: 'Length of pipe', kind: 'weapon', weapon: 'weapon.pipe', price: 189, stack: 1, sellable: false }),
  I({ id: 'item.nightstick', name: 'Nightstick', kind: 'weapon', weapon: 'weapon.nightstick', price: 900, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.knife', name: 'Folding knife', kind: 'weapon', weapon: 'weapon.knife', price: 450, stack: 1, sellable: true }),
  I({ id: 'item.bottle', name: 'Bottle of rye', kind: 'weapon', weapon: 'weapon.bottle', price: 429, stack: 1, sellable: false }),
  I({ id: 'item.snub', name: 'Snub revolver', kind: 'weapon', weapon: 'weapon.snub', price: 7500, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.service', name: 'Service revolver', kind: 'weapon', weapon: 'weapon.service', price: 11000, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.pistol', name: 'Semi-automatic pistol', kind: 'weapon', weapon: 'weapon.pistol', price: 12500, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.pump', name: 'Pump shotgun', kind: 'weapon', weapon: 'weapon.pump', price: 13500, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.sawnoff', name: 'Sawn-off shotgun', kind: 'weapon', weapon: 'weapon.sawnoff', price: 9000, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.rifle', name: 'Hunting rifle', kind: 'weapon', weapon: 'weapon.rifle', price: 16000, stack: 1, sellable: true, illicit: true }),
  I({ id: 'item.smg', name: 'Submachine gun', kind: 'weapon', weapon: 'weapon.smg', price: 60000, stack: 1, sellable: true, illicit: true, note: 'Rare. Fence only, after flag.fence_trusted.' }),
  I({ id: 'item.ammo_38', name: '.38 rounds (box of 50)', kind: 'ammo', ammo: 'item.ammo_38', rounds: 50, price: 650, stack: 999, sellable: true, illicit: true }),
  I({ id: 'item.ammo_9', name: '9 mm rounds (box of 50)', kind: 'ammo', ammo: 'item.ammo_9', rounds: 50, price: 750, stack: 999, sellable: true, illicit: true }),
  I({ id: 'item.ammo_12', name: '12-gauge shells (box of 25)', kind: 'ammo', ammo: 'item.ammo_12', rounds: 25, price: 525, stack: 999, sellable: true, illicit: true }),
  I({ id: 'item.ammo_30', name: 'Rifle cartridges (box of 20)', kind: 'ammo', ammo: 'item.ammo_30', rounds: 20, price: 895, stack: 999, sellable: true, illicit: true }),
  I({ id: 'item.ammo_45', name: '.45 rounds (box of 50)', kind: 'ammo', ammo: 'item.ammo_45', rounds: 50, price: 1200, stack: 999, sellable: true, illicit: true }),
  I({ id: 'item.bandage', name: 'Gauze and tape', kind: 'consumable', price: 79, stack: 10, sellable: false, heal: 10, stopsBleeding: true }),
  I({ id: 'item.aspirin', name: 'Aspirin (tin)', kind: 'consumable', price: 49, stack: 5, sellable: false, heal: 6 }),
  I({ id: 'item.coffee', name: 'Coffee, regular', kind: 'consumable', price: 25, stack: 3, sellable: false, heal: 4 }),
  I({ id: 'item.sandwich', name: 'Ham on rye', kind: 'consumable', price: 95, stack: 3, sellable: false, heal: 15 }),
  I({ id: 'item.blue_plate', name: 'Blue-plate special', kind: 'consumable', price: 185, stack: 1, sellable: false, heal: 40, stopsBleeding: true, note: 'Eaten at the counter: a diner stops bleeding (you get cleaned up in the washroom).' }),
  I({ id: 'item.beer', name: 'Beer', kind: 'consumable', price: 50, stack: 6, sellable: false, note: 'drink: modest, short sway' }),
  I({ id: 'item.whiskey', name: 'Shot of rye', kind: 'consumable', price: 100, stack: 3, sellable: false, note: 'drink' }),
  I({ id: 'item.vest', name: 'Police-issue vest', kind: 'armor', armor: 60, price: 15000, stack: 1, sellable: true, illicit: true, note: 'Rare. Soft body armour was only reaching patrol in the mid-70s.' }),
  I({ id: 'item.newspaper', name: 'Evening paper', kind: 'misc', price: 20, stack: 1, sellable: false }),
  I({ id: 'item.street_map', name: 'Folding street map', kind: 'misc', price: 75, stack: 1, sellable: false }),
  I({ id: 'item.dime', name: 'Dimes (roll)', kind: 'misc', price: 500, stack: 5, sellable: false, note: '50 dimes for the payphone.' }),
  I({ id: 'item.film_pack', name: 'Instant film (10 exposures)', kind: 'photo', price: 549, stack: 10, sellable: false }),
  I({ id: 'item.plates', name: 'Set of plates', kind: 'misc', price: 4000, stack: 2, sellable: false, illicit: true, note: 'Chop-shop plate swap breaks the plate part of a description.' }),
  I({ id: 'item.key_corwin', name: 'Corwin pass key', kind: 'key', price: 0, stack: 1, sellable: false }),
  I({ id: 'item.molotov', name: 'Firebomb', kind: 'misc', price: 300, stack: 3, sellable: false, illicit: true, note: 'Fence only. An item, never a recipe (content rule 6).' }),
  I({ id: 'item.photo_evidence', name: 'Instant photo: a cop with his hand out', kind: 'photo', price: 0, stack: 20, sellable: false }),
  I({ id: 'item.bag', name: 'Gym bag', kind: 'misc', price: 450, stack: 1, sellable: true, note: 'Hides one long gun; you must take it out to use it.' }),
  I({ id: 'item.ledger_page', name: 'Ledger page', kind: 'evidence', price: 0, stack: 20, sellable: false }),
  // street vendors and peddlers (STREET_VENDORS.md; invented goods, 1974 prices)
  I({ id: 'item.flower', name: 'A carnation', kind: 'misc', price: 50, stack: 3, sellable: false }),
  I({ id: 'item.flowers', name: 'A bunch of flowers', kind: 'misc', price: 200, stack: 2, sellable: false }),
  I({ id: 'item.roses', name: 'A dozen roses', kind: 'misc', price: 600, stack: 1, sellable: false }),
  I({ id: 'item.cigarettes', name: 'Cigarettes (pack)', kind: 'misc', price: 55, stack: 5, sellable: false }),
  I({ id: 'item.fake_watch', name: '"Gold" watch (it isn\'t)', kind: 'misc', price: 1000, stack: 3, sellable: true, note: 'Worth about $2 to a fence; a mission prop.' }),
  I({ id: 'item.umbrella', name: 'Umbrella', kind: 'misc', price: 200, stack: 1, sellable: false }),
  I({ id: 'item.pennant', name: 'Pennant', kind: 'misc', price: 150, stack: 3, sellable: false }),
  I({ id: 'item.eight_track', name: '8-track', kind: 'misc', price: 250, stack: 5, sellable: true }),
  I({ id: 'item.sunglasses', name: 'Sunglasses', kind: 'misc', price: 300, stack: 1, sellable: false }),
];

const S = (s: ShopDef) => s;
export const SHOPS: ShopDef[] = [
  S({ id: 'shop.test_diner', name: 'Counter (test diner)', kind: 'diner', markup: 1, buyback: 0, stock: [{ item: 'item.coffee', qty: -1 }, { item: 'item.sandwich', qty: -1 }, { item: 'item.blue_plate', qty: -1 }] }),
  S({ id: 'shop.test_pharmacy', name: 'Drugstore (test)', kind: 'pharmacy', markup: 1, buyback: 0, stock: [{ item: 'item.bandage', qty: 40 }, { item: 'item.aspirin', qty: 40 }] }),
  S({ id: 'shop.test_hardware', name: 'Hardware (test)', kind: 'hardware', markup: 1, buyback: 0, stock: [{ item: 'item.pipe', qty: 6 }, { item: 'item.bat', qty: 3 }] }),
  S({ id: 'shop.test_newsstand', name: 'Newsstand (test)', kind: 'newsstand', markup: 1, buyback: 0, stock: [{ item: 'item.newspaper', qty: 60 }, { item: 'item.street_map', qty: 10 }, { item: 'item.dime', qty: 20 }, { item: 'item.film_pack', qty: 6 }] }),
  S({ id: 'shop.test_liquor', name: 'Liquor store (test)', kind: 'liquor', markup: 1, buyback: 0, stock: [{ item: 'item.bottle', qty: 12 }] }),
  S({ id: 'shop.test_pawn', name: 'Pawnshop (test)', kind: 'pawn', markup: 1.1, buyback: 0.4, buysKinds: ['weapon', 'armor', 'misc'], stock: [{ item: 'item.knife', qty: 2 }, { item: 'item.bat', qty: 1 }] }),
  S({ id: 'shop.test_fence', name: 'Fence (test)', kind: 'fence', markup: 1.35, buyback: 0.3, buysKinds: ['weapon', 'ammo', 'armor'], stock: [
    { item: 'item.snub', qty: 2 }, { item: 'item.pistol', qty: 1 }, { item: 'item.pump', qty: 1 }, { item: 'item.sawnoff', qty: 1 }, { item: 'item.rifle', qty: 1 },
    { item: 'item.ammo_38', qty: 10 }, { item: 'item.ammo_9', qty: 6 }, { item: 'item.ammo_12', qty: 6 }, { item: 'item.ammo_30', qty: 4 }, { item: 'item.vest', qty: 1 }, { item: 'item.plates', qty: 2 }, { item: 'item.molotov', qty: 2 },
  ] }),
  S({ id: 'shop.test_fence_trusted', name: 'Fence, back room (test)', kind: 'fence', markup: 1.5, buyback: 0.3, requiresFlag: 'flag.fence_trusted', stock: [{ item: 'item.smg', qty: 1 }, { item: 'item.ammo_45', qty: 4 }] }),
];

export const GARMENTS: GarmentDef[] = [
  { id: 'g.leisure_suit', slot: 'full', noun: 'leisure suit', style: 'leisure' },
  { id: 'g.sport_coat', slot: 'outer', noun: 'sport coat', style: 'dressy' },
  { id: 'g.windbreaker', slot: 'outer', noun: 'windbreaker', style: 'casual' },
  { id: 'g.raincoat', slot: 'outer', noun: 'raincoat', style: 'dressy' },
  { id: 'g.short_sleeve', slot: 'top', noun: 'short-sleeve shirt', style: 'casual' },
  { id: 'g.print_shirt', slot: 'top', noun: 'print shirt', style: 'loud' },
  { id: 'g.undershirt', slot: 'top', noun: 'undershirt', style: 'work' },
  { id: 'g.turtleneck', slot: 'top', noun: 'turtleneck', style: 'dressy' },
  { id: 'g.blouse', slot: 'top', noun: 'blouse', style: 'casual' },
  { id: 'g.halter', slot: 'top', noun: 'halter top', style: 'loud' },
  { id: 'g.wrap_dress', slot: 'full', noun: 'wrap dress', style: 'dressy' },
  { id: 'g.slacks', slot: 'bottom', noun: 'slacks', style: 'dressy' },
  { id: 'g.flares', slot: 'bottom', noun: 'flares', style: 'loud' },
  { id: 'g.jeans', slot: 'bottom', noun: 'dungarees', style: 'casual' },
  { id: 'g.midi_skirt', slot: 'bottom', noun: 'skirt', style: 'casual' },
  { id: 'g.wingtips', slot: 'shoes', noun: 'wingtips', style: 'dressy' },
  { id: 'g.sneakers', slot: 'shoes', noun: 'sneakers', style: 'casual' },
  { id: 'g.platforms', slot: 'shoes', noun: 'platforms', style: 'loud' },
  { id: 'g.fedora', slot: 'hat', noun: 'hat', style: 'dressy' },
  { id: 'g.cap', slot: 'hat', noun: 'cap', style: 'casual' },
  { id: 'g.headscarf', slot: 'hat', noun: 'headscarf', style: 'casual' },
];
const O = (o: OutfitDef) => o;
export const OUTFITS: OutfitDef[] = [
  O({ id: 'outfit.teddy_desk', name: 'Night-desk clothes', price: 0, wardrobeSet: 'teddy.desk', leads: ['char.teddy_arce'], pieces: [{ garment: 'g.short_sleeve', colour: 'white' }, { garment: 'g.slacks', colour: 'brown' }, { garment: 'g.wingtips', colour: 'brown' }] }),
  O({ id: 'outfit.teddy_jacket', name: 'Windbreaker and dungarees', price: 3200, wardrobeSet: 'teddy.jacket', leads: ['char.teddy_arce'], pieces: [{ garment: 'g.windbreaker', colour: 'navy' }, { garment: 'g.undershirt', colour: 'white' }, { garment: 'g.jeans', colour: 'dark blue' }, { garment: 'g.sneakers', colour: 'white' }, { garment: 'g.cap', colour: 'navy' }] }),
  O({ id: 'outfit.leisure_tan', name: 'Tan leisure suit', price: 4500, wardrobeSet: 'leisure.tan', pieces: [{ garment: 'g.leisure_suit', colour: 'tan' }, { garment: 'g.print_shirt', colour: 'orange' }, { garment: 'g.platforms', colour: 'brown' }] }),
  O({ id: 'outfit.leisure_blue', name: 'Powder-blue leisure suit', price: 4500, wardrobeSet: 'leisure.blue', pieces: [{ garment: 'g.leisure_suit', colour: 'powder blue' }, { garment: 'g.print_shirt', colour: 'white' }, { garment: 'g.wingtips', colour: 'white' }] }),
  O({ id: 'outfit.raincoat', name: 'Raincoat and hat', price: 6800, wardrobeSet: 'raincoat.camel', pieces: [{ garment: 'g.raincoat', colour: 'camel' }, { garment: 'g.turtleneck', colour: 'black' }, { garment: 'g.slacks', colour: 'grey' }, { garment: 'g.wingtips', colour: 'black' }, { garment: 'g.fedora', colour: 'grey' }] }),
  O({ id: 'outfit.work', name: 'Work clothes', price: 1600, wardrobeSet: 'work.grey', pieces: [{ garment: 'g.undershirt', colour: 'grey' }, { garment: 'g.jeans', colour: 'dark blue' }, { garment: 'g.sneakers', colour: 'black' }, { garment: 'g.cap', colour: 'red' }] }),
  O({ id: 'outfit.delphine_strip', name: 'Evening on the Avenue', price: 0, wardrobeSet: 'delphine.evening', leads: ['char.delphine_moore'], pieces: [{ garment: 'g.halter', colour: 'red' }, { garment: 'g.flares', colour: 'white' }, { garment: 'g.platforms', colour: 'red' }] }),
  O({ id: 'outfit.delphine_day', name: 'Day dress', price: 2200, wardrobeSet: 'delphine.day', leads: ['char.delphine_moore'], pieces: [{ garment: 'g.wrap_dress', colour: 'green' }, { garment: 'g.headscarf', colour: 'yellow' }, { garment: 'g.sneakers', colour: 'white' }] }),
  O({ id: 'outfit.delphine_plain', name: 'Blouse and skirt', price: 1900, wardrobeSet: 'delphine.plain', leads: ['char.delphine_moore'], pieces: [{ garment: 'g.blouse', colour: 'cream' }, { garment: 'g.midi_skirt', colour: 'brown' }, { garment: 'g.sneakers', colour: 'brown' }] }),
  O({ id: 'outfit.nick_suit', name: 'Furrier\'s suit', price: 0, wardrobeSet: 'nick.suit', leads: ['char.nick_varelas'], pieces: [{ garment: 'g.sport_coat', colour: 'charcoal' }, { garment: 'g.turtleneck', colour: 'cream' }, { garment: 'g.slacks', colour: 'charcoal' }, { garment: 'g.wingtips', colour: 'black' }] }),
  O({ id: 'outfit.nick_weekend', name: 'Weekend clothes', price: 5400, wardrobeSet: 'nick.weekend', leads: ['char.nick_varelas'], pieces: [{ garment: 'g.short_sleeve', colour: 'yellow' }, { garment: 'g.slacks', colour: 'white' }, { garment: 'g.wingtips', colour: 'white' }, { garment: 'g.fedora', colour: 'straw' }] }),
];

/** Precinct areas: placeholder split of the playable area (bounds.ts PLAYABLE). Midtown Central
 *  is narrative's station house (W 31st St, 7th–8th Aves); the others are invented "houses". */
export const PRECINCTS: PrecinctDef[] = [
  { id: 'pct.midtown_central', name: 'Midtown Central', area: [-1580, -1150, 520, -1150, 520, -450, -1580, -450], station: [-742, -650], corruptibility: 0.45, responsiveness: 1 },
  { id: 'pct.square', name: 'the Square house', area: [-1580, -1990, 520, -1990, 520, -1150, -1580, -1150], station: [-470, -1420], corruptibility: 0.55, responsiveness: 0.9 },
  { id: 'pct.chelsea', name: 'the Chelsea house', area: [-1580, -450, -170, -450, -170, 320, -1580, 320], station: [-760, -200], corruptibility: 0.35, responsiveness: 1.15 },
  { id: 'pct.gramercy', name: 'the Gramercy house', area: [-170, -450, 520, -450, 520, 320, -170, 320], station: [260, -120], corruptibility: 0.3, responsiveness: 1.1 },
];

/** Lead combat profiles: the starting split from the brief, pending agreement with narrative. */
export const LEADS: LeadProfile[] = [
  {
    id: 'char.teddy_arce', name: 'Teddy', description: 'male, thirties, medium build', sex: 'male', build: 'medium', maxHp: 100,
    aim: { revolver: 0.7, pistol: 0.7, long: 1.0, auto: 1.15, default: 0.85 }, recoilControl: 0.75, reloadSpeed: 0.7,
    melee: { damage: 1.0, speed: 1.0, parryWindow: 0.16, dodgeIframes: 0.22 }, sprint: 1.0, evasion: 0.24, bribeSkill: 0.15, hiresMuscle: false, regenCeiling: 0.6,
    skills: { stamina: 50, strength: 60, shooting: 80, driving: 60, stealth: 40, lockwork: 70 }, crowdCover: 0.4, abilities: ['old_beat', 'keys'],
    startMoney: 4000, startItems: [{ id: 'item.service', qty: 1 }, { id: 'item.ammo_38', qty: 24 }, { id: 'item.bandage', qty: 2 }, { id: 'item.key_corwin', qty: 1 }],
    startOutfits: ['outfit.teddy_desk', 'outfit.teddy_jacket'], home: 'loc.corwin_hotel', homeAt: [-200, -680],
  },
  {
    id: 'char.delphine_moore', name: 'Delphine', description: 'female, late twenties, slim', sex: 'female', build: 'slim', maxHp: 90,
    aim: { revolver: 1.15, pistol: 1.15, long: 1.6, auto: 1.3, default: 1.15 }, recoilControl: 1.05, reloadSpeed: 0.95,
    melee: { damage: 1.15, speed: 1.3, parryWindow: 0.22, dodgeIframes: 0.32 }, sprint: 1.12, evasion: 0.42, bribeSkill: 0.05, hiresMuscle: false, regenCeiling: 0.6,
    skills: { stamina: 80, strength: 55, shooting: 50, driving: 30, stealth: 85, lockwork: 40 }, crowdCover: 0.9, abilities: ['evidence', 'disappear'],
    startMoney: 2500, startItems: [{ id: 'item.knife', qty: 1 }, { id: 'item.film_pack', qty: 1 }, { id: 'item.bandage', qty: 1 }],
    startOutfits: ['outfit.delphine_strip', 'outfit.delphine_day'], home: 'loc.arden_hotel', homeAt: [-860, -1180],
  },
  {
    id: 'char.nick_varelas', name: 'Nick', description: 'heavy-set male, fifties, well dressed', sex: 'male', build: 'heavy', maxHp: 110,
    aim: { revolver: 1.45, pistol: 1.45, long: 1.3, auto: 1.6, default: 1.45 }, recoilControl: 1.4, reloadSpeed: 1.35,
    melee: { damage: 1.1, speed: 0.8, parryWindow: 0.12, dodgeIframes: 0.16 }, sprint: 0.88, evasion: 0.06, bribeSkill: 0.3, hiresMuscle: true, regenCeiling: 0.5,
    skills: { stamina: 30, strength: 50, shooting: 30, driving: 80, stealth: 20, lockwork: 20 }, crowdCover: 0.2, abilities: ['payroll', 'muscle'],
    startMoney: 30000, startItems: [{ id: 'item.snub', qty: 1 }, { id: 'item.ammo_38', qty: 15 }],
    startOutfits: ['outfit.nick_suit', 'outfit.nick_weekend'], home: 'loc.varelas_loft', homeAt: [-470, -600],
  },
];

export const DEFAULT_CONTENT: GameplayContent = { items: ITEMS, weapons: WEAPONS, shops: SHOPS, outfits: OUTFITS, garments: GARMENTS, precincts: PRECINCTS, leads: LEADS };
