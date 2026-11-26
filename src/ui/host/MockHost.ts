/**
 * MockHost: a complete UiHost over fixed 1974 data so every screen runs without gameplay, sim or
 * narrative merged (brief "Done means": every gameplay screen working against mock data).
 * Names follow narrative content (the three leads) or are invented placeholders; prices are 1974.
 * The mock keeps light state so buy/sell/equip/switch work end to end in the lab and in tests.
 */
import {
  Emitter, CONCEAL_ORDER, type UiHost, type UiEvents, type PlayerView, type ClockView, type LeadView, type HealthView, type InventoryView,
  type HeatView, type ObjectiveView, type ShopView, type NewsIssue, type BusinessView, type StatRow, type CompletionRow, type Achievement,
  type UiAction, type ActionResult, type ItemView, type Conceal, type ConcealState, type OutfitView, type LeadId,
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

  constructor(readonly input: Input, readonly streets: StreetRec[], readonly baseUrl = '/') {}

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
      headline: 'HEAT WAVE GRIPS CITY', deck: 'Con Ed asks for cutbacks as mercury hits 94; brownouts feared in Midtown',
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

  businesses(): BusinessView[] {
    const trend = (b: number) => Array.from({ length: 8 }, (_, i) => Math.round(b * (0.8 + 0.4 * Math.abs(Math.sin(i * 1.7 + b)))));
    return [
      { id: 'biz.laundromat', name: 'Spin-Kleen Laundromat', kind: 'Laundromat', address: 'W 29 St, 7 Av–8 Av', owner: this.owned.has('biz.laundromat') ? this.lead : null, weeklyIncome: 185, trend: trend(185), manager: 'Mrs. Ocasio', staff: 2,
        upgrades: [{ id: 'u.dryers', name: 'Six new dryers', cost: 900, owned: false, effect: '+$40 a week' }, { id: 'u.sign', name: 'Neon window sign', cost: 260, owned: true, effect: '+foot traffic' }, { id: 'u.drop', name: 'Numbers drop in the back', cost: 0, owned: false, effect: 'Side line: the daily number (illegal)' }],
        trouble: [{ kind: 'shakedown', text: 'A sergeant from Midtown South wants $50 a week "for the inspector".', due: 'Monday' }, { kind: 'brownout', text: 'Brownout Friday: lost a day\'s takings.' }],
        ledger: [{ week: 'Jun 9', gross: 410, payroll: 160, pad: 50, net: 200 }, { week: 'Jun 16', gross: 382, payroll: 160, pad: 50, net: 172 }] },
      { id: 'biz.garage', name: 'Midtown Park & Lock', kind: 'Parking garage', address: 'W 35 St, 9 Av–10 Av', owner: null, price: 22000, weeklyIncome: 520, trend: trend(520), staff: 4,
        upgrades: [{ id: 'u.storage', name: 'Back-row storage', cost: 1500, owned: false, effect: 'Store stolen cars (still hot)' }], trouble: [], ledger: [] },
      { id: 'biz.newsstand', name: 'Newsstand at 34th & 7th', kind: 'Newsstand', address: '7 Av & W 34 St', owner: null, price: 3500, weeklyIncome: 90, trend: trend(90), staff: 1,
        upgrades: [{ id: 'u.drop2', name: 'Numbers drop', cost: 0, owned: false, effect: 'Side line (illegal)' }], trouble: [], ledger: [] },
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
    return { ok: true };
  }
}
