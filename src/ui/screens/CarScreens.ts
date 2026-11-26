/**
 * Car screens:
 *  - CarLot: a used-car lot or a showroom. The salesman's patter on a cream card, the cars as price-tagged
 *    cards, and a haggle panel (offer stepper, his counter in his own voice, accept / walk / pay asking).
 *  - MyCarsTab: the pause-hub tab listing the lead's cars: where each is, its condition, parking summonses
 *    as paper chips, the boot, the pound, a route pencilled onto the map, and what's in the trunk.
 *  - NoticeCard: the small in-world summons that appears when a ticket, tow or boot happens.
 */
import type { UiHost, CarView, LotView } from '../host/types';
import type { Input } from '../../input/Input';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { Modal } from './Modal';
import { esc, money } from '../util';

/** Condition as a word and a colour for its bar. */
export function conditionWord(c: number) { return c >= 0.9 ? 'Like new' : c >= 0.75 ? 'Good' : c >= 0.55 ? 'Fair' : c >= 0.4 ? 'Tired' : 'Rough'; }
const barColour = (c: number) => (c >= 0.75 ? '#3f6b3a' : c >= 0.5 ? '#b78a1a' : '#a8372c');
const conditionBar = (c: number) => `<span class="car-cond"><span class="car-bar"><i style="width:${Math.round(c * 100)}%;background:${barColour(c)}"></i></span><em>${conditionWord(c)}</em></span>`;
const miles = (m: number) => `${m.toLocaleString('en-US')} mi`;
const SWATCH: Record<string, string> = { maroon: '#6e1f2a', 'harvest gold': '#c8902c', avocado: '#6f7a3a', 'sky blue': '#6fa3c8', 'primer grey': '#8a8a86', 'midnight green': '#1f3a30', 'candy apple red': '#b3221f', 'bright yellow': '#e6c52a' };
const swatch = (colour: string) => `<i class="car-sw" style="background:${SWATCH[colour.toLowerCase()] ?? '#777'}" title="${esc(colour)}"></i>`;

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
    this.said = `${c.name}. ${c.notes ?? 'She\'s a beauty.'} Asking ${money(c.asking, false)}, but let\'s talk.`;
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
    this.root.innerHTML = `<div class="u-head"><h2>${esc(lot.name)}</h2><span class="sub">${lot.kind === 'showroom' ? 'Showroom · new for \'74' : 'Used cars · cash talks'}</span><span class="car-cash">In your pocket <b>${money(inv.cash)}</b></span><span class="close"></span></div>
      <div class="car-body"><aside class="car-side"><div class="car-speech"><b>${esc(lot.salesman)}</b><p>${esc(this.said)}</p></div><div class="car-haggle"></div></aside><div class="car-grid"></div></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Leave ✕'; this.root.querySelector('.close')!.appendChild(close);
    const grid = this.root.querySelector('.car-grid')!;
    if (!lot.cars.length) grid.innerHTML = '<p class="hint">Sold out. Come back tomorrow.</p>';
    for (const c of lot.cars) {
      const b = document.createElement('div'); b.setAttribute('role', 'button'); b.tabIndex = 0; b.className = `car-card${c.id === this.sel ? ' sel' : ''}`;
      b.innerHTML = `<span class="car-price">${money(c.asking, false)}</span><span class="in"><b>${esc(c.name)}</b>
        <span class="car-sub">${swatch(c.colour)}${c.year} · ${esc(c.colour)}</span><span class="car-sub">${esc(c.cls)} · ${esc(c.trim)}</span>
        ${conditionBar(c.condition)}<span class="car-mi">${miles(c.mileage)}</span></span>`;
      grid.appendChild(b); items.push({ el: b, activate: () => this.pick(c.id) });
    }
    const hag = this.root.querySelector('.car-haggle')!;
    if (car) {
      const dead = this.locked.has(car.id);
      hag.innerHTML = `<div class="car-pick"><b>${esc(car.name)}</b><span>Asking ${money(car.asking, false)}</span></div>
        <div class="car-offer"><button data-d="-100">−100</button><button data-d="-25">−25</button><div class="amt"><span>Your offer</span><b>${money(this.offer, false)}</b></div><button data-d="25">+25</button><button data-d="100">+100</button></div>
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
      add('Walk away', '', () => { this.sel = ''; this.counter = null; this.accepted = false; this.said = `${lot.salesman}: Hey, come back anytime. I'm here till nine.`; this.render(); });
    } else hag.innerHTML = '<p class="car-tip">Tap a car to talk price.</p>';
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items, keep);
    (this.root.querySelector('.car-grid') as HTMLElement).scrollTop = scroll[0];
    (this.root.querySelector('.car-side') as HTMLElement).scrollTop = scroll[1];
  }
}
/** Index of the first offer-stepper button in a nav list (the "−25" one, a sensible resting focus). */
function lotIdx(items: NavItem[], _what: 'offer') { const i = items.findIndex((it) => it.el.parentElement?.classList.contains('car-offer')); return Math.max(0, i + 2); }

export class MyCarsTab implements Tab {
  id = 'cars'; label = 'CARS';
  el = document.createElement('div');
  hint = 'Tap Pencil a route to mark a car on your map';
  onToast?: (t: string) => void;
  /** The index wires this to the map's waypoint. */
  onRoute?: (x: number, z: number, car: CarView) => void;
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  constructor(private host: UiHost) { this.el.className = 'u-scroll u-cars'; host.on('money', () => { if (this.el.style.display !== 'none') this.render(); }); }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(false); }

  private render(keep = true) {
    const cars = this.host.cars?.() ?? [], items: NavItem[] = [], inv = this.host.inventory();
    const scroll = this.el.scrollTop;
    if (!cars.length) {
      this.el.innerHTML = '<div class="car-empty"><h3>No wheels</h3><p>You don\'t own a car. Check the Classifieds, or walk onto a used-car lot and kick a few tires.</p></div>';
      this.setNav([]); return;
    }
    this.el.innerHTML = `<div class="car-top"><h3>Your cars</h3><span>In your pocket <b>${money(inv.cash)}</b></span></div><div class="car-list"></div>`;
    const list = this.el.querySelector('.car-list')!;
    for (const c of cars) {
      const where = c.where.kind === 'street' ? 'On the street' : c.where.kind === 'garage' ? 'In the garage' : `At the pound${c.towed ? ` · ${money(c.towed.fee, false)}` : ''}`;
      const card = document.createElement('article'); card.className = `car-reg ${c.where.kind}`;
      card.innerHTML = `<header><div><h4>${esc(c.name)}</h4><div class="car-sub">${swatch(c.colour)}${c.year} · ${esc(c.colour)} · ${miles(c.mileage)}</div></div><span class="car-plate">${esc(c.plate)}</span></header>
        <div class="car-where"><b>${where}</b><span>${esc(c.where.label)}</span></div>
        ${conditionBar(c.condition)}
        ${c.booted ? '<div class="car-boot">BOOTED<small>Pay the summonses to have it removed</small></div>' : ''}
        ${c.tickets.length ? `<div class="car-tickets">${c.tickets.map((t) => `<div class="car-tk" data-id="${esc(t.id)}"><div><b>${money(t.amount, false)}</b><span>${esc(t.reason)}</span><i>${esc(t.date)}</i></div></div>`).join('')}</div>` : ''}
        <div class="car-acts"></div>
        ${c.trunk ? `<div class="car-trunk"><span>Trunk</span>${c.trunk.length ? esc(c.trunk.join(' · ')) : 'Empty'}</div>` : ''}`;
      list.appendChild(card);
      const acts = card.querySelector('.car-acts')!;
      card.querySelectorAll<HTMLElement>('.car-tk').forEach((tk) => {
        const t = c.tickets.find((x) => x.id === tk.dataset.id)!;
        const b = document.createElement('button'); b.className = 'u-btn car-pay'; b.textContent = 'Pay ticket'; tk.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'payTicket', car: c.id, ticket: t.id }); this.onToast?.(r.text ?? ''); this.render(); } });
      });
      if (c.towed) {
        const b = document.createElement('button'); b.className = 'u-btn primary'; b.textContent = `Pay the pound ${money(c.towed.fee, false)}`; acts.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'payPound', car: c.id }); this.onToast?.(r.text ?? ''); this.render(); } });
      }
      const route = document.createElement('button'); route.className = 'u-btn'; route.textContent = 'Pencil a route'; acts.appendChild(route);
      items.push({ el: route, activate: () => { this.onRoute?.(c.where.x, c.where.z, c); this.onToast?.(`Route pencilled to ${c.name}`); } });
    }
    this.setNav(items, keep);
    this.el.scrollTop = scroll;
  }
}

/** A ticket/tow/boot summons laid on the screen for a few seconds. Tap to dismiss. */
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
    const serial = `${String(4000 + ((car?.plate ?? e.car).length * 211 + (e.amount ?? 0) * 7) % 5000)}-${String(100 + clk.minutes % 899)}-${e.kind[0].toUpperCase()}`;
    const row = (k: string, v: string) => `<dt>${k}</dt><dd>${esc(v)}</dd>`;
    const d = new Date(Date.parse(`${clk.date}T00:00:00Z`));
    const card = document.createElement('div');
    card.className = `car-notice ${e.kind}`;
    card.innerHTML = `<div class="nt-band"><b>${title}</b></div>
      <div class="nt-serial"><span>No.</span>${esc(serial)}</div>
      <dl>${row('Vehicle', car ? car.name : e.car)}${row('Plate', car?.plate ?? '—')}${row('Date', `${d.getUTCMonth() + 1}/${d.getUTCDate()}/74  ${time}`)}${row(e.kind === 'ticket' ? 'Violation' : e.kind === 'tow' ? 'Removed' : 'Notice', e.text)}</dl>
      ${e.amount != null ? `<div class="nt-fine"><span>${e.kind === 'tow' ? 'Pound fee' : 'Fine'}</span><b>${money(e.amount, false)}</b></div>` : ''}
      <div class="nt-foot">Pay at any precinct window or by mail. Tap to dismiss.</div><i class="nt-fuse"></i>`;
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
