/**
 * In-play overlays:
 *  - ShopCounter: the counter of a diner, clothier, pawnshop or fence. The keeper's line, price cards
 *    on the counter, buy (and sell where they buy), your cash. Illegal goods are marked.
 *  - LeadPicker: the bail-out and lead-switch picker (the leads as tall strips: who, where, what they
 *    carry; one large button; N5).
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
    const CARRY: Record<string, string> = { pocket: 'Pocket', jacket: 'Jacket', longcoat: 'Long coat', bag: 'Bag', visible: 'In hand' };
    // DESIGN_A: the counter (the goods, priced) on the left; the keeper's line and your cash as the scene on the right
    this.root.innerHTML = `<div class="u-head"><h2>${esc(s.name)}</h2><span class="sub">${esc(s.kind === 'fence' ? 'No receipts' : 'Cash only')}</span><span class="close"></span></div>
      <div class="sh-body sh-a"><div class="sh-goods">${s.buys ? '<div class="sh-modes"></div>' : `<h4 class="t74-group">On the counter · ${s.items.length}</h4>`}<div class="sh-counter"></div></div>
        <aside class="sh-keeper"><div class="sh-bubble"><b>${esc(s.keeper)}</b><p>${esc(this.msg)}</p></div>
        <div class="sh-cash"><span class="a-label">In your pocket</span><b class="a-num">${money(inv.cash)}</b></div></aside></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Leave'; this.root.querySelector('.close')!.appendChild(close);
    const counter = this.root.querySelector('.sh-counter')!;
    if (s.buys) {
      const m = this.root.querySelector('.sh-modes')!;
      for (const k of ['buy', 'sell'] as const) { const b = document.createElement('button'); b.className = `sh-mode${this.mode === k ? ' on' : ''}`; b.textContent = k === 'buy' ? `He's selling · ${s.items.length}` : 'Sell to him'; m.appendChild(b); items.push({ el: b, activate: () => { this.mode = k; this.render(); } }); }
    }
    if (this.mode === 'buy') {
      for (const it of s.items) {
        const b = document.createElement('button');
        const short = inv.cash < it.price;
        const carry = it.kind === 'weapon' || it.kind === 'tool' ? CARRY[it.size] : '';
        b.className = `sh-card${it.illegal ? ' illegal' : ''}${short ? ' short' : ''}`;
        b.innerHTML = `<span class="nm"><b>${esc(it.name)}</b>${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>
          <span class="tags">${carry ? `<i>Carry · ${carry}</i>` : ''}${it.stock ? `<i>${it.stock} left</i>` : ''}${it.illegal ? '<i class="il">Illegal</i>' : ''}</span>
          <span class="price a-num">${money(it.price)}${short ? `<em>Short ${money(it.price - inv.cash)}</em>` : ''}</span>`;
        counter.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'buy', shop: s.id, item: it.id }); this.msg = r.ok ? (fence ? 'Pleasure. You never saw me.' : 'There you go. Anything else?') : (r.text ?? ''); this.render(); } });
      }
    } else {
      const sellable = inv.items.filter((i) => s.buys?.includes(i.kind));
      if (!sellable.length) counter.innerHTML = '<p class="sh-none">Nothing he wants.</p>';
      for (const it of sellable) {
        const v = Math.round((it.value ?? 10) * (it.hot ? 0.4 : 0.6));
        const b = document.createElement('button'); b.className = `sh-card${it.hot ? ' illegal' : ''}`;
        b.innerHTML = `<span class="nm"><b>${esc(it.name)}</b><small>${it.hot ? 'Hot: he pays less for it.' : 'He looks it over.'}</small></span><span class="tags">${it.hot ? '<i class="il">Hot</i>' : ''}</span><span class="price a-num">${money(v, false)}</span>`;
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
      // no avatar silhouettes: who they are and where they are right now carries the card
      b.innerHTML = `<span class="tag">${esc(l.tagline)}</span><b>${esc(l.short)}</b><span class="where">${esc(l.where)}</span>
        <span class="state">${l.id === cur ? 'You, now' : l.available ? `<em class="a-num">${money(l.cash)}</em> on hand${l.mood ? ` · ${esc(l.mood)}` : ''}` : esc(l.reason ?? 'Not now')}</span>`;
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
    const HIDES: Record<string, string> = { pocket: 'a pocket gun', jacket: 'a jacket gun', longcoat: 'a long gun under the coat', bag: 'what fits in the bag', visible: 'nothing' };
    const rx = Math.min(300, innerWidth * 0.3), ry = Math.min(190, innerHeight * (innerHeight < 480 ? 0.25 : 0.3));
    // DESIGN_A: no boxes. A hairline ring over the live street, a square node per weapon, the label outside it.
    this.root.innerHTML = `<div class="ws-ring"><svg class="ws-orbit" width="${rx * 2 + 4}" height="${ry * 2 + 4}" style="left:${-rx - 2}px;top:${-ry - 2}px"><ellipse cx="${rx + 2}" cy="${ry + 2}" rx="${rx}" ry="${ry}"/></svg>
      <div class="ws-centre"><span class="a-label">Wearing</span><b>${esc(inv.outfit.name)}</b><span>Hides ${HIDES[inv.outfit.hides]}</span></div></div>`;
    const ring = this.root.querySelector('.ws-ring')!;
    const opts: (ItemView | null)[] = [null, ...weapons];
    opts.forEach((w, i) => {
      const a = (i / opts.length) * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const side = Math.abs(cx) < 0.3 ? (cy < 0 ? 't' : 'b') : cx > 0 ? 'r' : 'l';
      const b = document.createElement('button');
      b.className = `ws-opt ws-${side} ${w ? w.state : 'hidden'}${(w ? w.equipped : !weapons.some((x) => x.equipped)) ? ' eq' : ''}`;
      b.style.setProperty('--x', `${cx * rx}px`); b.style.setProperty('--y', `${cy * ry}px`);
      b.innerHTML = `<i class="node"></i><span class="lb">${w ? `<b>${esc(w.name.replace(/\s*".*?"/, ''))}${w.ammo ? ` <span class="a-num">${w.ammo.loaded}<small>+${w.ammo.spare}</small></span>` : ''}</b><em>${{ hidden: 'Drawn, only who\'s looking sees', printing: 'Printing even holstered', visible: 'Everyone sees it' }[w.state]}</em>` : '<b>Bare hands</b><em>Nothing showing</em>'}</span>`;
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
    this.root.innerHTML = `<div class="ch-wrap">${opts.prompt ? `<div class="ch-prompt">${esc(opts.prompt)}</div>` : ''}<div class="ch-list"></div>${this.total ? '<div class="ch-fuse"><i></i></div>' : ''}</div>`;
    const list = this.root.querySelector('.ch-list')!, items: NavItem[] = [];
    cs.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'ch-btn';
      b.innerHTML = `<span class="k">${i + 1}</span><span class="t">${esc(c.text.length > 44 ? `${c.text.slice(0, 43)}…` : c.text)}${c.disabled ? `<small>${esc(c.disabled)}</small>` : ''}</span>`;
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
