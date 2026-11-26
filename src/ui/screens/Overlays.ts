/**
 * In-play overlays:
 *  - ShopCounter: the counter of a diner, clothier, pawnshop or fence. The keeper's line, price cards
 *    on the counter, buy (and sell where they buy), your cash. Illegal goods are marked.
 *  - LeadPicker: the bail-out and lead-switch picker (three portraits, one large button; N5).
 *  - WeaponSelect: mobile-first selector constrained by concealment (what a witness would see).
 *  - Choices: dialogue choices (≤ 4, ~40 chars, large buttons; untimed, or a visible fuse ≥ 6 s).
 */
import type { UiHost, ShopView, ItemView, DialogueChoice } from '../host/types';
import type { Input } from '../../input/Input';
import type { NavItem } from '../MenuNav';
import { Modal } from './Modal';
import { settings } from '../../settings/Settings';
import { esc, money } from '../util';

export class ShopCounter extends Modal {
  private shop: ShopView | null = null;
  private mode: 'buy' | 'sell' = 'buy';
  private msg = '';
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-shop'); host.on('money', () => { if (this.open) this.render(); }); }
  openShop(id: string) { this.shop = this.host.shop(id); if (!this.shop) return; this.mode = 'buy'; this.msg = this.shop.greeting; this.show(); this.render(); }

  private render() {
    const s = this.shop!, inv = this.host.inventory(), items: NavItem[] = [];
    const fence = s.kind === 'fence' || s.kind === 'pawn';
    this.root.innerHTML = `<div class="u-head"><h2>${esc(s.name)}</h2><span class="sub">${esc(s.kind === 'fence' ? 'No receipts' : 'Cash only')}</span><span class="close"></span></div>
      <div class="sh-body"><div class="sh-keeper"><div class="sh-bubble"><b>${esc(s.keeper)}</b>${esc(this.msg)}</div>
        <div class="sh-cash"><span>In your pocket</span><b>${money(inv.cash)}</b></div>${s.buys ? '<div class="sh-modes"></div>' : ''}</div>
        <div class="sh-counter"></div></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Leave ✕'; this.root.querySelector('.close')!.appendChild(close);
    const counter = this.root.querySelector('.sh-counter')!;
    if (s.buys) {
      const m = this.root.querySelector('.sh-modes')!;
      for (const k of ['buy', 'sell'] as const) { const b = document.createElement('button'); b.className = `u-btn${this.mode === k ? ' primary' : ''}`; b.textContent = k === 'buy' ? 'Buy' : 'Sell to him'; m.appendChild(b); items.push({ el: b, activate: () => { this.mode = k; this.render(); } }); }
    }
    if (this.mode === 'buy') {
      for (const it of s.items) {
        const b = document.createElement('button');
        const short = inv.cash < it.price;
        b.className = `sh-card${it.illegal ? ' illegal' : ''}${short ? ' short' : ''}`;
        b.innerHTML = `<span class="price">${money(it.price)}</span><b>${esc(it.name)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}${short ? `<span class="short">Short ${money(it.price - inv.cash)}</span>` : ''}<span class="meta">${it.kind === 'weapon' || it.kind === 'tool' ? `Carry: ${{ pocket: 'pocket', jacket: 'jacket', longcoat: 'long coat', bag: 'bag', visible: 'in hand' }[it.size]}` : ''}${it.stock ? ` · ${it.stock} left` : ''}${it.illegal ? ' · <i>illegal</i>' : ''}</span>`;
        counter.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'buy', shop: s.id, item: it.id }); this.msg = r.ok ? (fence ? 'Pleasure. You never saw me.' : 'There you go. Anything else?') : (r.text ?? ''); this.render(); } });
      }
    } else {
      const sellable = inv.items.filter((i) => s.buys?.includes(i.kind));
      if (!sellable.length) counter.innerHTML = '<p class="hint">Nothing he wants.</p>';
      for (const it of sellable) {
        const v = Math.round((it.value ?? 10) * (it.hot ? 0.4 : 0.6));
        const b = document.createElement('button'); b.className = `sh-card${it.hot ? ' illegal' : ''}`;
        b.innerHTML = `<span class="price">${money(v, false)}</span><b>${esc(it.name)}</b><small>${it.hot ? 'Hot: he pays less for it.' : 'He looks it over.'}</small>`;
        counter.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'sell', shop: s.id, item: it.id }); this.msg = r.text ?? ''; this.render(); } });
      }
    }
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items, true);
  }
}

export class LeadPicker extends Modal {
  private sel = '';
  onSwitch?: (lead: string) => void;
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-leads'); }
  openPicker(reason: 'switch' | 'bail' = 'switch') { this.show(); this.sel = this.host.party().find((l) => l.id !== this.host.player().lead && l.available)?.id ?? ''; this.render(reason); }

  private render(reason: 'switch' | 'bail') {
    const party = this.host.party(), cur = this.host.player().lead, items: NavItem[] = [];
    this.root.innerHTML = `<div class="u-head"><h2>${reason === 'bail' ? 'Who comes for you?' : 'Switch to…'}</h2><span class="sub">${reason === 'bail' ? 'They pay the bail. They\'ll remember it.' : 'The others carry on where you left them.'}</span><span class="close"></span></div>
      <div class="ld-row"></div><div class="ld-go"></div><div class="u-foot">${this.footer()}</div>`;
    const row = this.root.querySelector('.ld-row')!;
    for (const l of party) {
      const b = document.createElement('button');
      b.className = `ld-card${l.id === this.sel ? ' sel' : ''}${l.id === cur ? ' cur' : ''}${l.available ? '' : ' na'}`;
      b.style.setProperty('--lc', l.colour);
      b.innerHTML = `<div class="ld-portrait"><svg viewBox="0 0 100 120"><defs><linearGradient id="g${l.short}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${l.colour}" stop-opacity=".55"/><stop offset="1" stop-color="#140c0d"/></linearGradient></defs><rect width="100" height="120" fill="url(#g${l.short})"/><circle cx="50" cy="44" r="19" fill="#0d0809" opacity=".85"/><path d="M14 120c4-30 18-44 36-44s32 14 36 44z" fill="#0d0809" opacity=".85"/></svg><span class="init">${esc(l.short[0])}</span></div>
        <b>${esc(l.short)}</b><span class="tag">${esc(l.tagline)}</span><span class="where">${esc(l.where)}</span>
        <span class="state">${l.id === cur ? 'You' : l.available ? `${money(l.cash)} on hand${l.mood ? ` · ${esc(l.mood)}` : ''}` : esc(l.reason ?? 'Not now')}</span>`;
      row.appendChild(b);
      items.push({ el: b, activate: () => { if (l.available && l.id !== cur) { this.sel = l.id; this.render(reason); } } });
    }
    const target = party.find((l) => l.id === this.sel);
    const go = document.createElement('button'); go.className = 'u-btn primary ld-big';
    go.textContent = target ? (reason === 'bail' ? `Call ${target.short}` : `Switch to ${target.short}`) : 'Nobody free right now';
    if (!target) go.setAttribute('aria-disabled', 'true');
    this.root.querySelector('.ld-go')!.appendChild(go);
    items.push({ el: go, activate: () => { if (!target) return; const r = this.host.act({ kind: 'switchLead', lead: target.id }); if (r.ok) { this.hide(); this.onSwitch?.(target.id); } } });
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Cancel'; this.root.querySelector('.close')!.appendChild(close);
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items);
    const gi = items.findIndex((i) => i.el === go); this.nav.focus(gi);
  }
}

export class WeaponSelect extends Modal {
  constructor(input: Input, private host: UiHost) { super(input, 'u-weapons'); }
  openSelect() { this.show(); this.render(); }
  private render() {
    const inv = this.host.inventory(), items: NavItem[] = [];
    const weapons = inv.items.filter((i) => i.kind === 'weapon');
    this.root.innerHTML = `<div class="ws-ring"><div class="ws-centre"><b>${esc(inv.outfit.name)}</b><span>hides up to a ${({ pocket: 'pocket gun', jacket: 'jacket gun', longcoat: 'long gun under the coat', bag: 'bag', visible: 'nothing' } as Record<string, string>)[inv.outfit.hides]}</span></div></div>`;
    const ring = this.root.querySelector('.ws-ring')!;
    const opts: (ItemView | null)[] = [null, ...weapons];
    opts.forEach((w, i) => {
      const a = (i / opts.length) * Math.PI * 2 - Math.PI / 2;
      const b = document.createElement('button');
      b.className = `ws-opt ${w ? w.state : 'hidden'}${(w ? w.equipped : !weapons.some((x) => x.equipped)) ? ' eq' : ''}`;
      const rx = Math.min(250, innerWidth * 0.3), ry = Math.min(150, innerHeight * 0.3);
      b.style.setProperty('--x', `${Math.cos(a) * rx}px`); b.style.setProperty('--y', `${Math.sin(a) * ry}px`);
      b.innerHTML = w ? `<b>${esc(w.name.replace(/\s*".*?"/, ''))}</b><span>${w.ammo ? `${w.ammo.loaded}+${w.ammo.spare}` : ''}</span><em>${{ hidden: 'Draw: only who\'s looking sees', printing: 'Printing even holstered', visible: 'Everyone sees it' }[w.state]}</em>` : '<b>Bare hands</b><em>Nothing showing</em>';
      ring.appendChild(b);
      items.push({ el: b, activate: () => { this.host.act({ kind: 'equip', item: w ? w.id : null }); this.hide(); } });
    });
    this.setNav(items);
    const cur = opts.findIndex((w) => (w ? w.equipped : false)); if (cur > 0) this.nav.focus(cur);
  }
}

export class Choices extends Modal {
  private resolve: ((id: string) => void) | null = null;
  private timer = 0; private total = 0; private defaultId = '';
  constructor(input: Input) { super(input, 'u-choices'); }
  ask(choices: DialogueChoice[], resolve: (id: string) => void, opts: { prompt?: string; seconds?: number; defaultId?: string } = {}) {
    if (choices.length > 4) console.warn('More than four choices (narrative rule): truncating');
    const cs = choices.slice(0, 4);
    this.resolve = resolve; this.total = this.timer = opts.seconds && !settings.get('skipTimers') ? Math.max(6, opts.seconds) : 0; this.defaultId = opts.defaultId ?? cs[cs.length - 1].id;
    this.show();
    this.root.innerHTML = `${opts.prompt ? `<div class="ch-prompt">${esc(opts.prompt)}</div>` : ''}<div class="ch-list"></div>${this.total ? '<div class="ch-fuse"><i></i></div>' : ''}`;
    const list = this.root.querySelector('.ch-list')!, items: NavItem[] = [];
    cs.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'ch-btn';
      b.innerHTML = `<span class="k">${i + 1}</span>${esc(c.text.length > 44 ? `${c.text.slice(0, 43)}…` : c.text)}${c.disabled ? `<small>${esc(c.disabled)}</small>` : ''}`;
      if (c.disabled) b.setAttribute('aria-disabled', 'true');
      list.appendChild(b); items.push({ el: b, activate: () => { if (!c.disabled) this.pick(c.id); } });
    });
    this.setNav(items);
    const keys = (e: KeyboardEvent) => { const n = +e.key; if (n >= 1 && n <= cs.length && this.open && !cs[n - 1].disabled) this.pick(cs[n - 1].id); };
    window.addEventListener('keydown', keys); this.onClose = () => window.removeEventListener('keydown', keys);
  }
  private pick(id: string) { const r = this.resolve; this.resolve = null; this.hide(); r?.(id); }
  update(dt: number) {
    if (!this.open) return;
    if (this.total) { this.timer -= dt; (this.root.querySelector('.ch-fuse i') as HTMLElement).style.width = `${Math.max(0, this.timer / this.total) * 100}%`; if (this.timer <= 0) { this.pick(this.defaultId); return; } }
    this.nav.update(dt); // back does nothing: a choice must be made (untimed ones wait forever)
  }
}
