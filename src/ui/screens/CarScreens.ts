/**
 * Car screens:
 *  - CarLot: a used-car lot or a showroom, played as a sales scene: the salesman's line, the car side-on
 *    in its own paint, and the deal in big numbers (asking, his counter, your offer stepper); the lot is a
 *    list beside it. Accept / pay asking / walk away.
 *  - MyCarsTab: the pause-hub tab for the lead's cars: one car at a time as the hero (where it is, its
 *    condition, the parking summonses as paper stubs, the boot, the pound, a route onto the map, the trunk),
 *    the rest of the garage listed beside it.
 *  - NoticeCard: the in-world summons (diegetic paper) laid on screen when a ticket, tow or boot happens.
 */
import type { UiHost, CarView, LotView } from '../host/types';
import type { Input } from '../../input/Input';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { Modal } from './Modal';
import { esc, money } from '../util';
import { carProfile } from './carProfile';

/** Condition as a word and a colour for its bar. */
export function conditionWord(c: number) { return c >= 0.9 ? 'Like new' : c >= 0.75 ? 'Good' : c >= 0.55 ? 'Fair' : c >= 0.4 ? 'Tired' : 'Rough'; }
const condClass = (c: number) => (c >= 0.75 ? 'good' : c >= 0.5 ? 'fair' : 'poor');
const conditionBar = (c: number) => `<span class="car-cond ${condClass(c)}"><span class="car-bar"><i style="width:${Math.round(c * 100)}%"></i></span><em>${conditionWord(c)}</em></span>`;
const miles = (m: number) => `${m.toLocaleString('en-US')} mi`;
const SWATCH: Record<string, string> = { maroon: '#6e1f2a', 'harvest gold': '#c8902c', avocado: '#6f7a3a', 'sky blue': '#6fa3c8', 'primer grey': '#8a8a86', 'midnight green': '#1f3a30', 'candy apple red': '#b3221f', 'bright yellow': '#e6c52a' };
const paint = (colour: string) => SWATCH[colour.toLowerCase()] ?? '#777';
const swatch = (colour: string) => `<i class="car-sw" style="background:${paint(colour)}" title="${esc(colour)}"></i>`;
const plate = (p: string) => `<span class="car-plate"><small>New York</small>${esc(p)}</span>`;

export class CarLot extends Modal {
  onToast?: (t: string) => void;
  private lot: LotView | null = null;
  private sel = '';
  private offer = 0;
  private counter: number | null = null;
  private accepted = false;
  private locked = new Set<string>();
  private said = '';
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-carlot'); host.on('money', () => { if (this.open) this.render(); }); }

  openLot(id: string) {
    this.lot = this.host.carLot?.(id) ?? null;
    if (!this.lot) return;
    this.sel = ''; this.counter = null; this.accepted = false; this.locked.clear();
    this.said = this.lot.patter;
    this.show(); this.render(false);
  }

  private pick(carId: string) {
    const c = this.lot!.cars.find((x) => x.id === carId)!;
    this.sel = carId; this.counter = null; this.accepted = false;
    this.offer = Math.max(25, Math.round((c.asking * 0.8) / 25) * 25);
    this.said = `${c.name}. ${c.notes ?? 'She\'s a beauty.'} Asking ${money(c.asking, false)}, but let's talk.`;
    this.render();
  }

  private buy(price: number) {
    const lot = this.lot!, c = lot.cars.find((x) => x.id === this.sel)!;
    const r = this.host.act({ kind: 'buyCar', lot: lot.id, car: c.id, price });
    if (r.ok) {
      this.onToast?.(r.text ?? `Bought: ${c.name}`);
      this.lot = this.host.carLot?.(lot.id) ?? lot; this.sel = ''; this.counter = null; this.accepted = false;
      this.said = r.text ?? 'Pleasure doing business.';
    } else this.said = r.text;
    this.render();
  }

  private render(keep = true) {
    const lot = this.lot!, items: NavItem[] = [], inv = this.host.inventory();
    const grid0 = this.root.querySelector('.car-grid'), side0 = this.root.querySelector('.car-side');
    const scroll = [grid0?.scrollTop ?? 0, side0?.scrollTop ?? 0];
    const car = lot.cars.find((c) => c.id === this.sel) ?? null;
    // DESIGN_A: a sales scene. The hero is the car and the deal (his line, the big numbers); the lot is a list beside it.
    this.root.innerHTML = `<div class="u-head"><h2>${esc(lot.name)}</h2><span class="sub">${lot.kind === 'showroom' ? 'Showroom · new for \'74' : 'Used cars · cash talks'}</span><span class="car-cash">In your pocket <b>${money(inv.cash)}</b></span><span class="close"></span></div>
      <div class="car-body lot-a${car ? ' dealing' : ''}"><section class="car-side lot-stage"><div class="car-speech lot-say"><b>${esc(lot.salesman)}</b><p>${esc(this.said)}</p></div><div class="car-haggle"></div></section>
        <aside class="lot-side"><h4 class="t74-group">On the lot · ${lot.cars.length}</h4><div class="car-grid"></div></aside></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Leave'; this.root.querySelector('.close')!.appendChild(close);
    const grid = this.root.querySelector('.car-grid')!;
    if (!lot.cars.length) grid.innerHTML = '<p class="hint">Sold out. Come back tomorrow.</p>';
    for (const c of lot.cars) {
      const b = document.createElement('div'); b.setAttribute('role', 'button'); b.tabIndex = 0; b.className = `car-card lot-row${c.id === this.sel ? ' sel' : ''}`;
      b.innerHTML = `${swatch(c.colour)}<span class="in"><b>${esc(c.name)}</b><span class="car-sub">${c.year} · ${esc(c.cls)} · ${miles(c.mileage)}</span></span><em class="lot-cw ${condClass(c.condition)}">${conditionWord(c.condition)}</em><span class="car-price a-num">${money(c.asking, false)}</span>`;
      grid.appendChild(b); items.push({ el: b, activate: () => this.pick(c.id) });
    }
    const hag = this.root.querySelector('.car-haggle')!;
    if (car) {
      const dead = this.locked.has(car.id);
      const said = this.counter != null ? `<div class="lot-ctr"><span class="a-label">He'll take</span><b class="a-num">${money(this.counter, false)}</b></div>`
        : this.accepted ? '<div class="lot-ctr"><span class="a-label">He says</span><b class="a-num">Deal</b></div>'
          : dead ? '<div class="lot-ctr dead"><span class="a-label">He says</span><b class="a-num">No sale</b></div>' : '';
      hag.innerHTML = `<div class="lot-car">${carProfile(car.cls, paint(car.colour))}</div>
        <div class="car-pick lot-id"><b class="a-voice">${esc(car.name)}</b><span>${car.year} · ${esc(car.colour)} · ${esc(car.trim)} · ${miles(car.mileage)}</span>${conditionBar(car.condition)}</div>
        <div class="lot-deal"><div class="lot-ask"><span class="a-label">Asking</span><b class="a-num">${money(car.asking, false)}</b></div>${said}
          <div class="car-offer"><button data-d="-100">−100</button><button data-d="-25">−25</button><div class="amt"><span>Your offer</span><b class="a-num">${money(this.offer, false)}</b></div><button data-d="25">+25</button><button data-d="100">+100</button></div></div>
        <div class="car-acts"></div>`;
      const step = (d: number) => { this.offer = Math.min(car.asking, Math.max(25, this.offer + d)); this.counter = null; this.accepted = false; this.render(); this.nav.focus(lotIdx(items, 'offer')); };
      const offerBtns = [...hag.querySelectorAll<HTMLElement>('.car-offer button')];
      offerBtns.forEach((b) => items.push({ el: b, activate: () => step(+b.dataset.d!), inc: () => step(25), dec: () => step(-25) }));
      const acts = hag.querySelector('.car-acts')!;
      const add = (label: string, cls: string, fn: () => void, disabled = false) => {
        const b = document.createElement('button'); b.className = `u-btn ${cls}`; b.textContent = label; if (disabled) b.setAttribute('aria-disabled', 'true');
        acts.appendChild(b); items.push({ el: b, activate: () => { if (!disabled) fn(); } });
      };
      if (this.accepted) add(`Buy for ${money(this.offer, false)}`, 'primary', () => this.buy(this.offer));
      else {
        add('Make offer', 'primary', () => {
          const r = this.host.act({ kind: 'haggle', lot: lot.id, car: car.id, offer: this.offer });
          this.said = r.text ?? '';
          if (!r.ok) { this.locked.add(car.id); this.counter = null; }
          else if (r.accepted) { this.accepted = true; this.counter = null; }
          else this.counter = r.counter ?? null;
          this.render();
        }, dead);
        if (this.counter != null) add(`Accept ${money(this.counter, false)}`, '', () => this.buy(this.counter!));
        add(`Pay asking ${money(car.asking, false)}`, '', () => this.buy(car.asking));
      }
      add('Walk away', 'quiet', () => { this.sel = ''; this.counter = null; this.accepted = false; this.said = `${lot.salesman}: Hey, come back anytime. I'm here till nine.`; this.render(); });
    } else hag.innerHTML = `<div class="lot-line" aria-hidden="true">${lot.cars.slice(0, 4).map((c) => carProfile(c.cls, paint(c.colour))).join('')}</div><p class="car-tip">Pick a car off the lot to talk price.</p>`;
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items, keep);
    (this.root.querySelector('.car-grid') as HTMLElement).scrollTop = scroll[0];
    (this.root.querySelector('.car-side') as HTMLElement).scrollTop = scroll[1];
  }
}
/** Index of the first offer-stepper button in a nav list (the "−25" one, a sensible resting focus). */
function lotIdx(items: NavItem[], _what: 'offer') { const i = items.findIndex((it) => it.el.parentElement?.classList.contains('car-offer')); return Math.max(0, i + 2); }

const WHERE: Record<CarView['where']['kind'], string> = { street: 'On the street', garage: 'In the garage', pound: 'At the pound' };
/** The one-word state of a car for the garage list: what needs you first. */
function carState(c: CarView): [string, string] {
  if (c.towed) return ['Towed', 'bad'];
  if (c.booted) return ['Booted', 'bad'];
  if (c.tickets.length) return [`${c.tickets.length} ${c.tickets.length === 1 ? 'ticket' : 'tickets'}`, 'warn'];
  return [WHERE[c.where.kind], ''];
}

export class MyCarsTab implements Tab {
  id = 'cars'; label = 'CARS';
  el = document.createElement('div');
  hint = 'Set a route to walk back to a car';
  onToast?: (t: string) => void;
  /** The index wires this to the map's waypoint. */
  onRoute?: (x: number, z: number, car: CarView) => void;
  private sel = '';
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  constructor(private host: UiHost) { this.el.className = 'u-scroll u-cars mc-a'; host.on('money', () => { if (this.el.style.display !== 'none') this.render(); }); }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(false); }

  private render(keep = true) {
    const cars = this.host.cars?.() ?? [], items: NavItem[] = [], inv = this.host.inventory();
    const scroll = this.el.scrollTop;
    if (!cars.length) {
      this.el.innerHTML = '<div class="car-empty"><span class="a-label">Your cars</span><h3 class="a-voice">No wheels</h3><p>You don\'t own a car. Check the Classifieds, or walk onto a used-car lot and kick a few tires.</p></div>';
      this.setNav([]); return;
    }
    // the hero is one car; by default the one that needs you
    if (!cars.some((c) => c.id === this.sel)) this.sel = (cars.find((c) => c.towed || c.booted || c.tickets.length) ?? cars[0]).id;
    const c = cars.find((x) => x.id === this.sel)!;
    const owed = cars.reduce((s, x) => s + x.tickets.reduce((t, k) => t + k.amount, 0) + (x.towed?.fee ?? 0), 0);
    const [state, stCls] = carState(c);
    this.el.innerHTML = `<section class="mc-stage">
        <div class="mc-top">${plate(c.plate)}<span class="mc-state ${stCls}">${esc(state)}</span></div>
        <div class="mc-car">${carProfile(c.name, paint(c.colour))}</div>
        <h3 class="a-voice">${esc(c.name)}</h3>
        <div class="mc-sub">${swatch(c.colour)}${c.year} · ${esc(c.colour)} · ${miles(c.mileage)}</div>
        ${c.booted ? '<div class="mc-boot"><b>Booted</b><span>A Denver boot on the front wheel. Pay every summons on this car to have it removed.</span></div>' : ''}
        ${c.tickets.length ? `<h4 class="t74-group">Summonses · ${c.tickets.length}</h4><div class="mc-tickets">${c.tickets.map((t) => `<div class="mc-tk" data-id="${esc(t.id)}"><div class="stub"><span>Parking violation</span><b>${money(t.amount, false)}</b><p>${esc(t.reason)}</p><i>${esc(t.date)}</i></div></div>`).join('')}</div>` : ''}
        <div class="mc-facts">
          <div class="mc-where"><span class="a-label">${WHERE[c.where.kind]}${c.towed ? ` · ${esc(c.towed.pound)}` : ''}</span><b>${esc(c.where.label)}</b></div>
          <div class="mc-cond"><span class="a-label">Condition</span>${conditionBar(c.condition)}</div>
          ${c.trunk ? `<div class="mc-trunk"><span class="a-label">Trunk</span><b>${c.trunk.length ? esc(c.trunk.join(' · ')) : 'Empty'}</b></div>` : ''}
        </div>
        <div class="mc-acts"></div>
      </section>
      <aside class="mc-list"><h4 class="t74-group">Your cars · ${cars.length}</h4><div class="mc-rows"></div>
        <div class="mc-sum">${owed ? `<div><span class="a-label">You owe the city</span><b class="a-num">${money(owed, false)}</b></div>` : ''}<div><span class="a-label">In your pocket</span><b class="a-num">${money(inv.cash)}</b></div></div></aside>`;
    const rows = this.el.querySelector('.mc-rows')!;
    for (const x of cars) {
      const [st, sc] = carState(x);
      const b = document.createElement('button'); b.className = `mc-row${x.id === this.sel ? ' sel' : ''}`;
      b.innerHTML = `${swatch(x.colour)}<span class="in"><b>${esc(x.name)}</b><span>${esc(x.plate)} · ${esc(x.where.label)}</span></span><em class="${sc}">${esc(st)}</em>`;
      rows.appendChild(b); items.push({ el: b, activate: () => { this.sel = x.id; this.render(); } });
    }
    const acts = this.el.querySelector('.mc-acts')!;
    this.el.querySelectorAll<HTMLElement>('.mc-tk').forEach((tk) => {
      const t = c.tickets.find((x) => x.id === tk.dataset.id)!;
      const b = document.createElement('button'); b.className = 'u-btn car-pay'; b.textContent = `Pay ${money(t.amount, false)}`; tk.appendChild(b);
      items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'payTicket', car: c.id, ticket: t.id }); this.onToast?.(r.text ?? ''); this.render(); } });
    });
    if (c.towed) {
      const b = document.createElement('button'); b.className = 'u-btn primary'; b.textContent = `Pay the pound ${money(c.towed.fee, false)}`; acts.appendChild(b);
      items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'payPound', car: c.id }); this.onToast?.(r.text ?? ''); this.render(); } });
    }
    const route = document.createElement('button'); route.className = `u-btn${c.towed ? '' : ' primary'}`; route.textContent = 'Set a route'; acts.appendChild(route);
    items.push({ el: route, activate: () => { this.onRoute?.(c.where.x, c.where.z, c); this.onToast?.(`Route set to ${c.name}`); } });
    this.setNav(items, keep);
    this.el.scrollTop = scroll;
  }
}

/** A ticket/tow/boot summons laid on the screen for a few seconds: a piece of paper. Tap to dismiss. */
export class NoticeCard {
  private card: HTMLElement | null = null;
  private timer = 0;
  constructor(private host: UiHost) { host.on('notice', (e) => this.show(e)); }

  show(e: { kind: 'ticket' | 'tow' | 'boot'; car: string; text: string; amount?: number }) {
    this.dismiss();
    const car = this.host.cars?.().find((c) => c.id === e.car || c.name === e.car);
    const clk = this.host.clock(), h = Math.floor(clk.minutes / 60), m = clk.minutes % 60;
    const time = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    const title = e.kind === 'ticket' ? 'Parking ticket' : e.kind === 'tow' ? 'Car towed' : 'Car booted';
    const form = e.kind === 'ticket' ? 'Notice of parking violation' : e.kind === 'tow' ? 'Notice of removal' : 'Notice of immobilization';
    const serial = `${String(4000 + ((car?.plate ?? e.car).length * 211 + (e.amount ?? 0) * 7) % 5000)}-${String(100 + clk.minutes % 899)}-${e.kind[0].toUpperCase()}`;
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    const d = new Date(Date.parse(`${clk.date}T00:00:00Z`));
    const card = document.createElement('div');
    card.className = `sm-notice ${e.kind}`;
    card.innerHTML = `<div class="sm-paper"><header><span>City of New York</span><b>${form}</b><em>No. ${esc(serial)}</em></header>
      <dl>${row('Vehicle', car ? car.name : e.car)}${row('Plate', car?.plate ?? '—')}${row('Date', `${d.getUTCMonth() + 1}/${d.getUTCDate()}/74  ${time}`)}${row(e.kind === 'ticket' ? 'Violation' : e.kind === 'tow' ? 'Removed' : 'Notice', e.text)}</dl>
      ${e.amount != null ? `<div class="sm-fine"><span>${e.kind === 'tow' ? 'Pound fee' : 'Fine'}</span><b>${money(e.amount, false)}</b></div>` : ''}
      <footer>Pay at any precinct window or by mail.</footer></div>
      <div class="sm-ui"><b>${title}</b><span>Tap to put it away</span><i class="sm-fuse"></i></div>`;
    card.addEventListener('click', () => this.dismiss());
    document.body.appendChild(card);
    this.card = card;
    this.timer = window.setTimeout(() => this.dismiss(), 6000);
  }

  dismiss() {
    clearTimeout(this.timer);
    const c = this.card; this.card = null;
    if (!c) return;
    c.classList.add('out'); setTimeout(() => c.remove(), 300);
  }
}
