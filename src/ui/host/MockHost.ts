/**
 * MockHost: a complete UiHost over fixed 1974 data so every screen runs without gameplay, sim or
 * narrative merged (brief "Done means": every gameplay screen working against mock data).
 * Names follow narrative content (the three leads) or are invented placeholders; prices are 1974.
 * The mock keeps light state so buy/sell/equip/switch work end to end in the lab and in tests.
 */
import {
  Emitter, CONCEAL_ORDER, type UiHost, type UiEvents, type PlayerView, type ClockView, type LeadView, type HealthView, type InventoryView,
  type HeatView, type ObjectiveView, type ShopView, type NewsIssue, type BusinessView, type StatRow, type CompletionRow, type Achievement,
  type UiAction, type ActionResult, type CarView, type LotView, type ClassifiedAd, type HomeView, type SleepInfo, type ItemView, type Conceal, type ConcealState, type OutfitView, type LeadId,
} from './types';
import type { Input } from '../../input/Input';
import type { SaveManager } from '../../save/SaveManager';
import type { StreetRec } from '../map/grid';
import { Locator } from '../../world/Districts';

export function concealState(size: Conceal, hides: Conceal): ConcealState {
  if (size === 'visible') return 'visible';
  const s = CONCEAL_ORDER.indexOf(size), h = CONCEAL_ORDER.indexOf(hides);
  return s <= h ? 'hidden' : s === h + 1 ? 'printing' : 'visible';
}

const OUTFITS: Record<string, OutfitView> = {
  teddy: { name: 'Night-desk sport coat', hides: 'jacket', description: 'Tan sport coat, brown slacks, white short-sleeve shirt.' },
  delphine: { name: 'Halter dress & shawl', hides: 'pocket', description: 'Rust halter dress, cream shawl, platform sandals.' },
  nick: { name: 'Three-piece, cream', hides: 'jacket', heatNote: 'Hot in this weather.', description: 'Cream three-piece suit, wide brown tie.' },
};

type MItem = Omit<ItemView, 'state'>;
const ITEMS: Record<string, MItem[]> = {
  'char.teddy_arce': [
    { id: 'gun.snub38', name: 'Snub-nose .38 "Pocket Dutchman"', qty: 1, kind: 'weapon', size: 'pocket', condition: 0.72, ammo: { loaded: 5, spare: 12 }, note: 'Cheap street gun. Jams when dirty.', equipped: true },
    { id: 'gun.service', name: 'Service revolver, 4-inch', qty: 1, kind: 'weapon', size: 'jacket', condition: 0.9, ammo: { loaded: 6, spare: 18 }, note: 'An ex-cop\'s old gun. Explosive if a cop finds it.', hot: true },
    { id: 'gun.sawnoff', name: 'Sawn-off double, 12 ga.', qty: 1, kind: 'weapon', size: 'longcoat', condition: 0.6, ammo: { loaded: 2, spare: 6 } },
    { id: 'tool.keyring', name: 'Corwin master keys', qty: 1, kind: 'key', size: 'pocket', note: 'Every room on floors 2–9.' },
    { id: 'tool.slimjim', name: 'Slim jim', qty: 1, kind: 'tool', size: 'jacket', note: 'Quiet entry into most 1970s cars.' },
    { id: 'paper.card', name: 'Business card: A-1 Bail Bonds', qty: 1, kind: 'paper', size: 'pocket', note: 'Reveals the bondsman on your map.' },
    { id: 'food.coffee', name: 'Coffee, regular (paper cup)', qty: 1, kind: 'food', size: 'pocket' },
    { id: 'val.watch', name: 'Gold wristwatch (not yours)', qty: 1, kind: 'valuable', size: 'pocket', hot: true, value: 60 },
    { id: 'tok.subway', name: 'Subway token', qty: 3, kind: 'paper', size: 'pocket' },
  ],
  'char.delphine_moore': [
    { id: 'cam.instant', name: 'Instant camera', qty: 1, kind: 'tool', size: 'bag', note: 'Prints sell to the night desk.' },
    { id: 'gun.derringer', name: 'Two-shot derringer', qty: 1, kind: 'weapon', size: 'pocket', condition: 0.8, ammo: { loaded: 2, spare: 4 }, equipped: true },
    { id: 'paper.photos', name: 'Instant prints', qty: 4, kind: 'evidence', size: 'pocket' },
  ],
  'char.nick_varelas': [
    { id: 'gun.auto', name: '.45 automatic', qty: 1, kind: 'weapon', size: 'jacket', condition: 0.95, ammo: { loaded: 7, spare: 14 }, equipped: true },
    { id: 'tool.ledger', name: 'The cold-storage ledger', qty: 1, kind: 'evidence', size: 'jacket' },
    { id: 'val.envelope', name: 'Envelope, $500', qty: 1, kind: 'valuable', size: 'jacket', value: 500 },
  ],
};


const money$ = (v: number) => `$${v.toLocaleString('en-US')}`;
const LOTS: Record<string, LotView> = {
  sal: { id: 'sal', name: 'Sal\'s Square Deal Motors', kind: 'lot', salesman: 'Sal Brunetti',
    patter: 'Kick a tire, friend, go ahead, she don\'t bite. Everything on this lot runs, and what don\'t run I tell you up front. Cash talks. Cash talks loud.',
    cars: [
      { id: 'l.monarch', name: 'Monarch Brougham 4-dr', year: 1970, colour: 'Maroon', cls: 'Full-size sedan', trim: 'Brougham, vinyl top', condition: 0.62, mileage: 71400, asking: 1040, notes: 'One owner, a deacon. Rear shocks are tired.' },
      { id: 'l.kestrel', name: 'Kestrel Sprint 2-dr hardtop', year: 1969, colour: 'Harvest gold', cls: 'Two-door hardtop', trim: 'Sprint V8', condition: 0.48, mileage: 88200, asking: 1220, notes: 'Pulls left under braking. Fast anyway.' },
      { id: 'l.dunmore', name: 'Dunmore Villager wagon', year: 1968, colour: 'Avocado', cls: 'Station wagon', trim: 'Woodgrain panels', condition: 0.4, mileage: 102300, asking: 770, notes: 'Smells like a dog. A good dog.' },
      { id: 'l.corsair', name: 'Corsair Commuter 2-dr', year: 1972, colour: 'Sky blue', cls: 'Compact', trim: 'Four-cylinder', condition: 0.78, mileage: 38900, asking: 885, notes: 'Gets twenty-two to the gallon. Honest.' },
      { id: 'l.lancaster', name: 'Lancaster Hauler pickup', year: 1966, colour: 'Primer grey', cls: 'Pickup', trim: 'Stepside', condition: 0.33, mileage: 121000, asking: 975, notes: 'Starts when she feels like it.' },
      { id: 'l.halvorsen', name: 'Halvorsen Royale 4-dr', year: 1973, colour: 'Midnight green', cls: 'Full-size sedan', trim: 'Royale, 455 V8', condition: 0.88, mileage: 21500, asking: 1270, notes: 'Retired lady, Fort Lee. Tires like new.' },
    ] },
  halvorsen: { id: 'halvorsen', name: 'Halvorsen Motors, Eighth Avenue', kind: 'showroom', salesman: 'Mr. Pruitt',
    patter: 'Good evening. May I interest you in something with a warranty? Nineteen seventy-four, sir: the year of the radial tire and the five-mile-an-hour bumper.',
    cars: [
      { id: 's.royale', name: 'Halvorsen Royale 4-dr', year: 1974, colour: 'Candy apple red', cls: 'Full-size sedan', trim: 'Royale, 455 V8, AM/FM', condition: 1, mileage: 12, asking: 9500, notes: 'Factory air. 12 months or 12,000 miles.' },
      { id: 's.kestrel', name: 'Kestrel Sprint 2-dr hardtop', year: 1974, colour: 'Bright yellow', cls: 'Two-door hardtop', trim: 'Sprint V8, four-on-the-floor', condition: 1, mileage: 9, asking: 7800 },
      { id: 's.corsair', name: 'Corsair Commuter 2-dr', year: 1974, colour: 'Sky blue', cls: 'Compact', trim: 'Four-cylinder', condition: 1, mileage: 7, asking: 2495, notes: 'Gas is 55 cents. Think about it.' },
    ] },
};
const mockClassifieds = (): ClassifiedAd[] => [
  { id: 'cl.1', kind: 'car', text: '\'68 Kestrel Sprint, runs good, new tires, clean title. Deacon\'s car.', price: 650, phone: 'CH 3-8800' },
  { id: 'cl.2', kind: 'car', text: 'STATION WAGON \'67 Dunmore, 3 seats, needs brake job. Must sell, moving.', price: 275, phone: 'WA 9-0417' },
  { id: 'cl.3', kind: 'car', text: '\'73 Corsair Commuter, 22 mpg, low miles, AM radio.', price: 1190, phone: 'PE 6-2200' },
  { id: 'cl.4', kind: 'room', text: 'SLEEPING ROOM W 40s, quiet gentleman, hot plate, linen, week in advance.', price: 22, phone: 'LO 4-1500', placeId: 'ui.forsale.0' },
  { id: 'cl.5', kind: 'room', text: 'STUDIO furnished, 9th Av, private bath, utilities incl. No pets.', price: 85, phone: 'OR 5-1190' },
  { id: 'cl.6', kind: 'job', text: 'NIGHT CLERK wanted, midtown hotel, 11 to 7, references, steady man.', price: 110, phone: 'CO 5-7733', placeId: 'ui.job.0' },
  { id: 'cl.7', kind: 'job', text: 'DRIVERS: garment center, must know city, over 21, own license.', price: 95, phone: 'LA 4-6150' },
  { id: 'cl.8', kind: 'misc', text: 'WINDOW air conditioner, 6,000 BTU, works fine. You haul.', price: 60, phone: 'MU 3-2040', placeId: 'ui.shop.0' },
];
const HOME_UPGRADES = (owned: string[]): HomeView['upgrades'] => [
  { id: 'h.ac', name: 'Window air conditioner', cost: 189, owned: owned.includes('h.ac'), effect: 'Sleep well through the heat' },
  { id: 'h.lock', name: 'Deadbolt and chain', cost: 24, owned: owned.includes('h.lock'), effect: 'Fewer break-ins while you sleep' },
  { id: 'h.tv', name: 'Second-hand TV', cost: 60, owned: owned.includes('h.tv'), effect: 'Watch the news: hear about trouble early' },
  { id: 'h.fan', name: 'Electric fan', cost: 14, owned: owned.includes('h.fan'), effect: 'Cooler nights (a little)' },
  { id: 'h.phone', name: 'Telephone, wall model', cost: 35, owned: owned.includes('h.phone'), effect: 'Calls come to you at home' },
];

export class MockHost implements UiHost {
  readonly saves: SaveManager | null = null;
  private ev = new Emitter<UiEvents>();
  lead: LeadId = 'char.teddy_arce';
  pos = { x: -2, z: -19, yaw: 0 };
  minutes = 20 * 60 + 41;
  cash: Record<string, number> = { 'char.teddy_arce': 43.15, 'char.delphine_moore': 112.4, 'char.nick_varelas': 2310 };
  savings: Record<string, number> = { 'char.teddy_arce': 380, 'char.delphine_moore': 1940, 'char.nick_varelas': 48200 };
  items: Record<string, MItem[]> = JSON.parse(JSON.stringify(ITEMS));
  heatPhase: HeatView['phase'] = 'none';
  hp = 72;
  stamina = 0.64;
  obj: ObjectiveView | null = { text: 'Walk up Broadway with Mayhew', target: { x: 18, z: -240, label: 'Broadway & W 26 St' }, mission: 'Dusk on Broadway' };
  owned = new Set<string>(['biz.laundromat']);
  garageCars: CarView[] = [
    { id: 'car.monarch', name: 'Monarch Brougham 4-dr', year: 1971, colour: 'Harvest gold', plate: '612-KTR', condition: 0.58, mileage: 64210,
      where: { kind: 'street', x: -205, z: -640, label: 'W 31 St near 8 Av, alternate-side Tue/Fri' },
      tickets: [{ id: 'tk.1', amount: 15, reason: 'Alternate-side parking', date: 'Jun 18' }, { id: 'tk.2', amount: 25, reason: 'Hydrant, within 15 ft', date: 'Jun 20' }, { id: 'tk.3', amount: 15, reason: 'Expired meter', date: 'Jun 21' }], booted: true, trunk: ['Tire iron', 'Road flares', 'Spare coat'] },
    { id: 'car.kestrel', name: 'Kestrel Sprint 2-dr hardtop', year: 1969, colour: 'Avocado', plate: '47-RDN', condition: 0.81, mileage: 52900,
      where: { kind: 'garage', x: -640, z: -960, label: 'Midtown Park & Lock, level 2' }, tickets: [], booted: false, trunk: ['Crowbar', 'Gym bag'] },
    { id: 'car.dunmore', name: 'Dunmore Villager wagon', year: 1967, colour: 'Maroon', plate: '385-BDN', condition: 0.35, mileage: 117800,
      where: { kind: 'pound', x: -1180, z: -1010, label: 'Pier 74 city pound, W 38 St at 12 Av' }, tickets: [{ id: 'tk.4', amount: 15, reason: 'No standing, bus stop', date: 'Jun 19' }], booted: false, towed: { pound: 'Pier 74 pound', fee: 45 }, trunk: [] },
  ];
  homeOwned: Record<string, string[]> = {};
  bed = true;
  private sold = new Set<string>();

  constructor(readonly input: Input, readonly streets: StreetRec[], readonly baseUrl = '/', readonly heroes: { name: string; x: number; z: number }[] = []) {}

  on<K extends keyof UiEvents>(k: K, cb: (e: UiEvents[K]) => void) { return this.ev.on(k, cb); }
  emit<K extends keyof UiEvents>(k: K, e: UiEvents[K]) { this.ev.emit(k, e); }

  player(): PlayerView { return { ...this.pos, speed: 1.4, inVehicle: false, lead: this.lead }; }
  clock(): ClockView { return { date: '1974-06-21', minutes: Math.floor(this.minutes) % 1440, weather: 'clear', tempF: 84 }; }
  party(): LeadView[] {
    return [
      { id: 'char.teddy_arce', name: 'Teodoro "Teddy" Arce', short: 'Teddy', tagline: 'Night desk, Hotel Corwin', colour: '#c79a3c', cash: this.cash['char.teddy_arce'], where: 'Broadway & W 23 St', available: true, mood: 'Tired' },
      { id: 'char.delphine_moore', name: 'Delphine Moore', short: 'Delphine', tagline: 'Eighth Avenue', colour: '#b2302a', cash: this.cash['char.delphine_moore'], where: 'Hotel Arden bar, 8 Av & W 39 St', available: true, mood: 'Watchful' },
      { id: 'char.nick_varelas', name: 'Nikos "Nick" Varelas', short: 'Nick', tagline: 'Varelas & Co., furs', colour: '#2e4a6b', cash: this.cash['char.nick_varelas'], where: 'Off the map until 7:30 AM', available: false, reason: 'Asleep in Astoria until 7:30 AM' },
    ];
  }
  health(): HealthView {
    return { hp: this.hp, max: 100, injuries: [{ region: 'left arm', kind: 'graze', bandaged: true }, { region: 'ribs', kind: 'bruise', bandaged: false }], stamina: this.stamina, staminaMax: 1, heatExhaustion: 0.35 };
  }
  inventory(lead: LeadId = this.lead): InventoryView {
    const key = lead.includes('teddy') ? 'teddy' : lead.includes('delphine') ? 'delphine' : 'nick';
    const outfit = OUTFITS[key];
    const items = (this.items[lead] ?? []).map((i) => ({ ...i, state: concealState(i.size, outfit.hides) }));
    return { lead, cash: this.cash[lead] ?? 0, savings: this.savings[lead] ?? 0, outfit, items, carCapacity: lead.includes('nick') ? 'Sedan trunk: 6 of 12' : undefined };
  }
  heat(): HeatView {
    if (this.heatPhase === 'none') return { phase: 'none', cones: [], units: [] };
    const { x, z } = this.pos;
    return {
      phase: this.heatPhase,
      cones: [{ x: x + 70, z: z - 60, dir: Math.atan2(-60, 70) + Math.PI, spread: 0.6, r: 55, seeing: this.heatPhase === 'pursuit' }, { x: x - 110, z: z + 30, dir: 0.2, spread: 0.5, r: 45, seeing: false }],
      units: [{ x: x + 70, z: z - 60, kind: 'car', seeing: this.heatPhase === 'pursuit' }, { x: x - 110, z: z + 30, kind: 'foot', seeing: false }],
      searchArea: this.heatPhase === 'searching' || this.heatPhase === 'lost' ? { x: x + 20, z: z - 30, r: 140, age: 30 } : undefined,
      description: 'Male, Hispanic, thirties, tan sport coat, on foot heading uptown on Broadway',
    };
  }
  objective() { return this.obj; }
  missionMarkers() {
    return [
      { id: 'mission.night_desk', title: 'Night Desk', x: -232, z: -655, window: ['23:00', '05:00'] as [string, string], lead: 'char.teddy_arce', blurb: 'The Corwin\'s night desk. Something is wrong on the ninth floor.' },
      { id: 'mission.hack', title: 'Hack', x: -486, z: -712, window: ['19:00', '23:00'] as [string, string], lead: 'char.teddy_arce', blurb: 'Delroy needs a second driver at the Penn Station cab line.' },
      { id: 'mission.lunch_counter', title: 'Lunch Counter', x: -440, z: -930, window: ['11:30', '14:00'] as [string, string], lead: 'char.teddy_arce', blurb: 'Meet Carmen at the department-store lunch counter.' },
    ];
  }
  private loc?: Locator;
  location() { this.loc ??= new Locator(this.streets); return { district: this.loc.district(this.pos.x, this.pos.z), crossing: this.loc.intersection(this.pos.x, this.pos.z) }; }

  shop(id: string): ShopView | null {
    const S: Record<string, ShopView> = {
      diner: { id: 'diner', name: 'Olympia Coffee Shop', kind: 'diner', keeper: 'Gus', greeting: 'Sit anywhere. Coffee\'s fresh, the pie\'s from this morning.', open: true, items: [
        { id: 'f.coffee', name: 'Coffee, regular', price: 0.25, kind: 'food', size: 'pocket', note: 'A little stamina back.' },
        { id: 'f.eggs', name: 'Two eggs, toast, home fries', price: 0.85, kind: 'food', size: 'visible', note: 'Heals 20.' },
        { id: 'f.cheeseburger', name: 'Deluxe cheeseburger platter', price: 1.65, kind: 'food', size: 'visible', note: 'Heals 40.' },
        { id: 'f.pie', name: 'Cherry pie, à la mode', price: 0.75, kind: 'food', size: 'visible', note: 'Heals 10. Worth it.' },
        { id: 'f.eggcream', name: 'Egg cream', price: 0.35, kind: 'food', size: 'visible', note: 'Cools you down in the heat.' },
      ] },
      pawn: { id: 'pawn', name: 'Golden Pawn & Loan', kind: 'pawn', keeper: 'Mr. Feingold', greeting: 'Buying or selling? Either way, I need to see ID. Mostly.', open: true, buys: ['valuable', 'tool'], items: [
        { id: 'p.watch', name: 'Wristwatch, gold-filled', price: 35, kind: 'valuable', size: 'pocket', stock: 2 },
        { id: 'p.radio', name: 'Transistor radio', price: 12, kind: 'tool', size: 'jacket', stock: 3 },
        { id: 'p.knife', name: 'Folding knife', price: 6, kind: 'weapon', size: 'pocket', stock: 4 },
        { id: 'p.binocs', name: 'Field glasses', price: 18, kind: 'tool', size: 'bag', stock: 1 },
      ] },
      fence: { id: 'fence', name: 'The back of a TV repair', kind: 'fence', keeper: 'Sully', greeting: 'You weren\'t followed. Right?', open: true, buys: ['valuable', 'weapon'], items: [
        { id: 'g.snub', name: 'Snub-nose .38 (street)', price: 45, kind: 'weapon', size: 'pocket', illegal: true, note: 'Cheap. Unreliable when dirty.' },
        { id: 'g.service', name: 'Service revolver (no questions)', price: 120, kind: 'weapon', size: 'jacket', illegal: true },
        { id: 'g.sawn', name: 'Sawn-off double', price: 90, kind: 'weapon', size: 'longcoat', illegal: true },
        { id: 'g.ammo38', name: '.38 cartridges, box of 50', price: 8, kind: 'ammo', size: 'pocket', illegal: true },
        { id: 'g.plates', name: 'Clean plates (New Jersey)', price: 60, kind: 'tool', size: 'bag', illegal: true, note: 'Cools a hot car.' },
      ] },
      clothes: { id: 'clothes', name: 'Weiss Menswear', kind: 'clothes', keeper: 'Irv Weiss', greeting: 'For you? Something that breathes. It\'s ninety out.', open: true, items: [
        { id: 'c.sportcoat', name: 'Sport coat, brown plaid', price: 38, kind: 'clothing', size: 'visible', note: 'Hides a jacket-size gun. New description.' },
        { id: 'c.leisure', name: 'Leisure suit, powder blue', price: 55, kind: 'clothing', size: 'visible', note: 'Hides a jacket-size gun.' },
        { id: 'c.trench', name: 'Trench coat, camel', price: 72, kind: 'clothing', size: 'visible', note: 'Hides a sawn-off. People stare in July.' },
        { id: 'c.shirt', name: 'Short-sleeve shirt, print', price: 9, kind: 'clothing', size: 'visible', note: 'Pockets only. Cool in the heat.' },
        { id: 'c.cap', name: 'Newsboy cap', price: 4, kind: 'clothing', size: 'visible', note: 'Changes your description a little.' },
      ] },
    };
    return S[id] ?? null;
  }

  newspaper(): NewsIssue {
    return {
      id: 'news.1974-06-22', date: 'Saturday, June 22, 1974', masthead: 'The Evening Courier', price: '20¢', edition: 'Late City Final',
      headline: 'HEAT WAVE GRIPS CITY', deck: 'Hudson Union asks for cutbacks as mercury hits 94; brownouts feared in Midtown',
      stories: [
        { head: 'Hotel tenants fight eviction', body: 'Residents of a West 31st Street hotel say a new owner wants them out by fall. "Where do we go?" asked one, 81.' },
        { head: 'Garment trucks hijacked', body: 'Police report the third truck taken on Ninth Avenue this month. No arrests.' },
        { head: 'Precinct shake-up rumored', body: 'Sources at One Police Plaza decline comment on a sweep of Midtown South.' },
      ],
      number: { date: 'Fri 6/21', digits: '4 1 7', source: 'last three digits of the Ozone Downs handle' },
      races: [
        { track: 'Ozone Downs', race: 3, winner: 'Lucky Seventh', odds: '9–2' }, { track: 'Ozone Downs', race: 5, winner: 'Broadway Belle', odds: '3–1' },
        { track: 'Ozone Downs', race: 7, winner: 'Night Clerk', odds: '22–1' }, { track: 'Ozone Downs', race: 9, winner: 'Garment King', odds: '6–5' },
      ],
      chopList: [
        { cls: 'Full-size sedan', colour: 'Maroon', condition: 'Clean', pays: 400 }, { cls: 'Two-door hardtop', colour: 'Harvest gold', condition: 'Any', pays: 320 },
        { cls: 'Box truck', colour: 'White', condition: 'Running', pays: 650 }, { cls: 'Station wagon', colour: 'Avocado', condition: 'Any', pays: 220 },
      ],
      ads: [{ text: 'KAPLAN HARDWARE · keys cut while u wait · W 37 St', placeId: 'ui.shop.0' }, { text: 'FOR SALE: going laundromat, owner retiring. LO 4-1500', placeId: 'ui.forsale.0' }, { text: 'TONY\'S BARBER · razor cut $3', placeId: 'ui.service.0' }],
    };
  }

  // lot prices follow gameplay's cars/ownership.ts: value = class base x (0.35 + 0.65 x condition), asking ~15% over value;
  // the showroom matches its new-car list (luxury sedan $9,500, personal coupe $7,800)
  businesses(): BusinessView[] {
    const trend = (b: number) => Array.from({ length: 8 }, (_, i) => Math.round(b * (0.8 + 0.4 * Math.abs(Math.sin(i * 1.7 + b)))));
    // numbers from gameplay's economy (claude/gameplay-74 src/gameplay/economy/property.ts, the 2026-11-26 rebalance):
    // net a week = weeklyBase x block traffic - wages - pad
    const net = (base: number, traffic: number, wages: number, pad: number) => Math.round(base * traffic - wages - pad);
    const lw = net(4190, 0.95, 300, 150);
    return [
      { id: 'biz.laundromat', name: 'Wash-and-Dry laundromat', kind: 'Laundromat', address: '9th Ave block', owner: this.owned.has('biz.laundromat') ? this.lead : null, weeklyIncome: lw, trend: trend(lw), manager: 'Mrs. Ocasio', staff: 2,
        upgrades: [{ id: 'u.machines', name: 'Newer machines', cost: 290, owned: false, effect: '+12% takings' }, { id: 'u.alarm', name: 'Door alarm', cost: 50, owned: true, effect: 'Fewer break-ins' }, { id: 'u.side', name: 'Launder cash through it', cost: 0, owned: false, effect: 'Side line (illegal)' }],
        trouble: [{ kind: 'shakedown', text: 'A sergeant from Midtown South wants $300 more a week "for the inspector".', due: 'Monday' }, { kind: 'brownout', text: 'Brownout Friday: lost a day\'s takings.' }],
        ledger: [{ week: 'Jun 9', gross: 3980, payroll: 300, pad: 150, net: 3530 }, { week: 'Jun 16', gross: 3415, payroll: 300, pad: 150, net: 2965 }] },
      { id: 'biz.newsstand', name: 'Eighth Ave newsstand', kind: 'Newsstand', address: '8th Ave block', owner: null, price: 1200, weeklyIncome: net(2210, 1.0, 0, 90), trend: trend(net(2210, 1.0, 0, 90)), staff: 1,
        upgrades: [{ id: 'u.awning', name: 'New awning', cost: 120, owned: false, effect: '+10% takings' }, { id: 'u.drop', name: 'A numbers drop', cost: 0, owned: false, effect: 'Side line (illegal)' }], trouble: [], ledger: [] },
      { id: 'biz.garage', name: 'Parking garage', kind: 'Parking garage', address: 'Garment District block', owner: null, price: 65000, weeklyIncome: net(22980, 1.1, 3000, 1100), trend: trend(net(22980, 1.1, 3000, 1100)), staff: 6,
        upgrades: [{ id: 'u.lights', name: 'Lighting', cost: 3900, owned: false, effect: '+10% takings' }, { id: 'u.store', name: 'Stores cars', cost: 0, owned: false, effect: 'Keep hot cars out of sight' }], trouble: [], ledger: [] },
    ];
  }

  stats(): StatRow[] {
    return [
      ['Time', 'Days in the city', '3'], ['Time', 'Play time', '4 h 12 min'],
      ['Getting around', 'Walked', '14.2 mi'], ['Getting around', 'Driven', '31.8 mi'], ['Getting around', 'Cab fares taken', '17'], ['Getting around', 'Subway rides', '6'],
      ['Money', 'Earned', '$2,418.50'], ['Money', 'Spent', '$1,903.15'], ['Money', 'Bribes paid', '$310'], ['Money', 'Lost to the property clerk', '$85'],
      ['Trouble', 'Arrests', '2'], ['Trouble', 'Times hospitalised', '1'], ['Trouble', 'Witness reports filed', '9'], ['Trouble', 'Pursuits escaped', '5'],
      ['Trouble', 'Cars stolen', '4'], ['Trouble', 'Hydrants opened', '3'], ['City', 'Places discovered', '—'], ['City', 'Newspapers read', '3'],
    ].map(([group, label, value]) => ({ group, label, value }));
  }
  completion(): CompletionRow[] {
    return [
      ['Story', 'Missions', 3, 32], ['Story', 'Strangers', 1, 12], ['Work', 'Street jobs tried', 2, 6], ['Work', 'Businesses owned', this.owned.size, 9],
      ['City', 'Places discovered', 31, 360], ['City', 'Subway stations used', 2, 7], ['Found', 'Stash spots', 1, 40], ['Found', 'Contact prints', 0, 25],
    ].map(([group, label, done, total]) => ({ group: group as string, label: label as string, done: done as number, total: total as number }));
  }
  achievements(): Achievement[] {
    return [
      { id: 'a.first_night', name: 'Behind the Glass', text: 'Work your first night desk at the Corwin.', unlocked: '1974-06-21' },
      { id: 'a.token', name: 'Thirty-Five Cents', text: 'Ride the subway between two stations.', unlocked: '1974-06-22' },
      { id: 'a.cool', name: 'Cooling Off', text: 'Lose a pursuit by changing your clothes.' },
      { id: 'a.pad', name: 'On the Pad', text: 'Pay a precinct for a full month.' },
      { id: 'a.number', name: 'Hit the Number', text: 'Win on the daily number.' },
      { id: 'a.hydrant', name: 'Summer Relief', text: 'Open a hydrant on a 90-degree day.' },
      { id: 'a.secret1', name: '???', text: 'A story secret.', hidden: true },
    ];
  }

  cars(): CarView[] { return JSON.parse(JSON.stringify(this.garageCars)); }
  carLot(id: string): LotView | null { const l = LOTS[id]; return l ? JSON.parse(JSON.stringify({ ...l, cars: l.cars.filter((c) => !this.sold.has(c.id)) })) : null; }
  classifieds(): ClassifiedAd[] { return mockClassifieds(); }
  homes(): HomeView[] {
    const H: [string, string, string][] = [['char.teddy_arce', 'Room 9F, Hotel Corwin', 'W 31 St, Broadway–6 Av, ninth floor'], ['char.delphine_moore', 'Room at the Hotel Arden', '8 Av & W 39 St'], ['char.nick_varelas', 'The office over the loft', 'Varelas & Co., W 30 St, 6 Av–7 Av']];
    return H.map(([lead, name, address]) => ({ id: `home.${lead.split('.')[1]}`, lead, name, address, upgrades: HOME_UPGRADES(this.homeOwned[lead] ?? []) }));
  }
  sleepInfo(): SleepInfo {
    const ac = (this.homeOwned[this.lead] ?? []).includes('h.ac');
    const ok = this.bed;
    return { canSleep: true, bed: ok, restQuality: ac && ok ? 'good' : 'poor',
      note: ok ? (ac ? 'The air conditioner hums. You will sleep like a stone.' : 'Ninety at midnight and no air conditioner: you won\'t rest well.') : 'No bed here. All you can do is stand around and watch the clock.',
      nextPinnedDate: 'Saturday, June 22' };
  }
  private advance(until: string) {
    const [h, m] = until.split(':').map(Number); const target = h * 60 + m, now = Math.floor(this.minutes) % 1440;
    this.minutes += (target - now + 1440) % 1440 || 1440;
  }

  act(a: UiAction): ActionResult {
    const lead = this.lead;
    if (a.kind === 'buy') {
      const it = this.shop(a.shop)?.items.find((i) => i.id === a.item);
      if (!it) return { ok: false, text: 'Not on the counter.' };
      if (this.cash[lead] < it.price) return { ok: false, text: `Short $${(it.price - this.cash[lead]).toFixed(2)}.` };
      this.cash[lead] = +(this.cash[lead] - it.price).toFixed(2);
      if (it.kind !== 'food' && it.kind !== 'clothing') (this.items[lead] ??= []).push({ id: `${it.id}.${Date.now()}`, name: it.name, qty: 1, kind: it.kind, size: it.size });
      if (it.kind === 'food') this.hp = Math.min(100, this.hp + 15);
      this.emit('money', { lead, delta: -it.price, cash: this.cash[lead], reason: it.name });
      this.emit('inventory', { lead });
      return { ok: true, text: `Bought: ${it.name}` };
    }
    if (a.kind === 'sell') {
      const list = this.items[lead] ?? [], i = list.findIndex((x) => x.id === a.item);
      if (i < 0) return { ok: false, text: 'You don\'t have that.' };
      const v = Math.round((list[i].value ?? 10) * (list[i].hot ? 0.4 : 0.6));
      list.splice(i, 1); this.cash[lead] += v;
      this.emit('money', { lead, delta: v, cash: this.cash[lead], reason: 'sold' }); this.emit('inventory', { lead });
      return { ok: true, text: `Sold for $${v}` };
    }
    if (a.kind === 'equip') { for (const it of this.items[lead] ?? []) it.equipped = it.id === a.item; this.emit('inventory', { lead }); return { ok: true }; }
    if (a.kind === 'drop') { this.items[lead] = (this.items[lead] ?? []).filter((x) => x.id !== a.item); this.emit('inventory', { lead }); return { ok: true, text: 'Dropped.' }; }
    if (a.kind === 'switchLead') {
      const l = this.party().find((p) => p.id === a.lead);
      if (!l?.available) return { ok: false, text: l?.reason ?? 'Not available.' };
      this.lead = a.lead; this.emit('lead', { id: a.lead }); return { ok: true };
    }
    if (a.kind === 'buyBusiness') {
      const b = this.businesses().find((x) => x.id === a.id);
      if (!b?.price) return { ok: false, text: 'Not for sale.' };
      const total = this.cash[lead] + this.savings[lead];
      if (total < b.price) return { ok: false, text: `You need $${b.price.toLocaleString()} between cash and savings.` };
      this.savings[lead] -= b.price; this.owned.add(a.id); return { ok: true, text: `You own ${b.name}.` };
    }
    if (a.kind === 'waypoint') return { ok: true };
    if (a.kind === 'betNumber') {
      if (this.cash[lead] < a.stake) return { ok: false, text: 'Not enough cash.' };
      this.cash[lead] -= a.stake; this.emit('money', { lead, delta: -a.stake, cash: this.cash[lead], reason: `number ${a.digits}` });
      return { ok: true, text: `$${a.stake} on ${a.digits}. Pays 600 to 1 (the runner keeps 10%).` };
    }
    if (a.kind === 'wait' || a.kind === 'sleep') {
      this.advance(a.until); const c = this.clock(), h = Math.floor(c.minutes / 60), mm = c.minutes % 60;
      if (a.kind === 'sleep') this.hp = Math.min(100, this.hp + (this.sleepInfo().restQuality === 'good' ? 30 : 12));
      return { ok: true, text: `${a.kind === 'sleep' ? 'You slept. ' : ''}It is ${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}.` };
    }
    if (a.kind === 'haggle') {
      const c = LOTS[a.lot]?.cars.find((x) => x.id === a.car);
      if (!c) return { ok: false, text: 'That one\'s gone.' };
      if (a.offer < c.asking * 0.5) return { ok: false, text: 'Are you kidding me? Get outta here with that. (He turns away.)' };
      if (a.offer >= c.asking * 0.85) return { ok: true, accepted: true, counter: a.offer, text: `You know what? ${money$(a.offer)}. Done. Don\'t tell nobody.` };
      const counter = Math.min(c.asking - 5, Math.max(a.offer + 5, Math.round((a.offer + c.asking) / 2 / 5) * 5));
      return { ok: true, accepted: false, counter, text: `${money$(a.offer)}? I got a family. Meet me halfway: ${money$(counter)}.` };
    }
    if (a.kind === 'buyCar') {
      const c = LOTS[a.lot]?.cars.find((x) => x.id === a.car);
      if (!c || this.sold.has(c.id)) return { ok: false, text: 'That one\'s gone.' };
      if (this.cash[lead] + this.savings[lead] < a.price) return { ok: false, text: `You need ${money$(a.price)} between cash and savings.` };
      const fromCash = Math.min(this.cash[lead], a.price); this.cash[lead] = +(this.cash[lead] - fromCash).toFixed(2); this.savings[lead] -= a.price - fromCash;
      this.sold.add(c.id);
      this.garageCars.push({ id: `car.${c.id}`, name: c.name, year: c.year, colour: c.colour, plate: '409-AJM', condition: c.condition, mileage: c.mileage, where: { kind: 'street', x: this.pos.x, z: this.pos.z, label: 'Right outside' }, tickets: [], booted: false, trunk: [] });
      this.emit('money', { lead, delta: -a.price, cash: this.cash[lead], reason: c.name });
      return { ok: true, text: `Yours: ${c.name}. Plates and keys in the glovebox.` };
    }
    if (a.kind === 'payTicket') {
      const car = this.garageCars.find((x) => x.id === a.car), t = car?.tickets.find((x) => x.id === a.ticket);
      if (!car || !t) return { ok: false, text: 'No such ticket.' };
      if (this.cash[lead] < t.amount) return { ok: false, text: `Short ${money$(t.amount - this.cash[lead])}.` };
      this.cash[lead] -= t.amount; car.tickets = car.tickets.filter((x) => x !== t); if (!car.tickets.length) car.booted = false;
      this.emit('money', { lead, delta: -t.amount, cash: this.cash[lead], reason: 'parking summons' });
      return { ok: true, text: car.booted ? 'Paid. Still booted.' : 'Paid.' };
    }
    if (a.kind === 'payPound') {
      const car = this.garageCars.find((x) => x.id === a.car);
      if (!car?.towed) return { ok: false, text: 'It\'s not at the pound.' };
      if (this.cash[lead] < car.towed.fee) return { ok: false, text: `Short ${money$(car.towed.fee - this.cash[lead])}.` };
      this.cash[lead] -= car.towed.fee; this.emit('money', { lead, delta: -car.towed.fee, cash: this.cash[lead], reason: 'pound' });
      car.where = { kind: 'street', x: -1180, z: -1010, label: 'Outside the pound gate, 12 Av' }; delete car.towed;
      return { ok: true, text: 'Released. Keys in the ignition.' };
    }
    if (a.kind === 'homeUpgrade') {
      const h = this.homes().find((x) => x.id === a.home), u = h?.upgrades.find((x) => x.id === a.upgrade);
      if (!h || !u || u.owned) return { ok: false, text: 'Already done.' };
      if (this.cash[h.lead] < u.cost) return { ok: false, text: `Short ${money$(u.cost - this.cash[h.lead])}.` };
      this.cash[h.lead] -= u.cost; (this.homeOwned[h.lead] ??= []).push(u.id);
      this.emit('money', { lead: h.lead, delta: -u.cost, cash: this.cash[h.lead], reason: u.name });
      return { ok: true, text: `Installed: ${u.name}.` };
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------- touch (TOUCH_CONTROLS.md), scripted
  /** Lab only: lockables are given straight in screen px (z = 0) and project() passes them through. */
  touchMode: import('../../shared/uiHost').TouchMode = 'foot';
  touchLog: string[] = [];
  private lockedId: string | null = null;
  private enemies = [{ id: 'npc.goon_1', x: 0.58, y: 0.42 }, { id: 'npc.goon_2', x: 0.71, y: 0.47 }, { id: 'npc.goon_3', x: 0.46, y: 0.5 }];
  touch: import('../../shared/uiHost').TouchHost = {
    mode: () => this.touchMode,
    armed: () => true,
    context: () => this.touchMode === 'foot' ? { kind: 'enterVehicle', label: 'Steal car' } : this.touchMode === 'combat' ? { kind: 'pickUp', label: 'Pick up .38' } : { kind: 'exitVehicle', label: 'Get out' },
    doContext: () => {
      this.touchLog.push(`context:${this.touchMode}`);
      this.touchMode = this.touchMode === 'foot' ? 'drive' : this.touchMode === 'drive' ? 'foot' : 'combat';
    },
    lockables: () => this.enemies.map((e) => ({ id: e.id, x: e.x * innerWidth, y: e.y * innerHeight, z: 0, threat: 1 })),
    project: (x, y) => ({ x, y }),
    locked: () => this.lockedId,
    lockTarget: (id) => { this.lockedId = id; this.touchLog.push(`lock:${id}`); },
    swipeLock: (d) => { const i = this.enemies.findIndex((e) => e.id === this.lockedId); this.lockedId = this.enemies[(i + d + this.enemies.length) % this.enemies.length].id; this.touchLog.push(`swipe:${d}`); },
    setFiring: (on) => this.touchLog.push(`fire:${on}`),
    reload: () => this.touchLog.push('reload'),
    swapWeapon: (d) => this.touchLog.push(`swap:${d}`),
    coverLabel: () => 'Cover',
    coverOrRoll: () => this.touchLog.push('cover'),
    drawWeapon: () => { this.touchLog.push('draw'); this.touchMode = this.touchMode === 'combat' ? 'foot' : 'combat'; },
    handbrake: (on) => this.touchLog.push(`handbrake:${on}`),
    horn: (on) => this.touchLog.push(`horn:${on}`),
    driveBy: (on) => this.touchLog.push(`driveby:${on}`),
    configure: (c) => this.touchLog.push(`configure:${c.fireMode}/${c.aimAssist}/${c.autoAccelerate}`),
  };

  // ---------------------------------------------------------------- traversal hint (MOVEMENT.md), scripted
  /** Lab only: the edge sits at a fixed screen point and project() passes it through. */
  travKind: import('../../shared/uiHost').TraversalKind | null = null;
  traversal = () => (this.travKind ? { kind: this.travKind, x: innerWidth * 0.56, y: innerHeight * 0.58, z: 0 } : null);
  project = (x: number, y: number) => ({ x, y });
}
