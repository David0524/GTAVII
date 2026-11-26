/**
 * "Pat down your pockets" (CORE_SYSTEMS §4): what you carry is laid out by where it sits on you:
 * trouser pockets, jacket, long coat, a bag, in your hands. The outfit decides which of those hide
 * things; each item shows what a witness would see (hidden / printing / in plain sight). Cash on
 * hand (losable) is shown apart from savings (safe). Mobile-first: big item tiles, details panel.
 */
import type { UiHost, ItemView, Conceal } from '../host/types';
import { CONCEAL_ORDER } from '../host/types';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { esc, money } from '../util';

const ZONE: Record<Conceal, { label: string; where: string }> = {
  pocket: { label: 'Pockets', where: 'Trousers and shirt' },
  jacket: { label: 'Jacket', where: 'Inside pocket, waistband' },
  longcoat: { label: 'Long coat', where: 'Under the coat' },
  bag: { label: 'Bag', where: 'Over the shoulder' },
  visible: { label: 'In your hands', where: 'Everyone can see' },
};
const STATE = { hidden: 'Hidden', printing: 'Printing', visible: 'In plain sight' };
const KIND_ICON: Record<ItemView['kind'], string> = {
  weapon: '<path d="M3 9h13l2-2h3v4h-6l-1 2h-3l-1 5H6l1-5H3z" fill="currentColor"/>',
  ammo: '<path d="M7 4h3v3H7zM7 7h3v13H7zM14 4h3v3h-3zM14 7h3v13h-3z" fill="currentColor"/>',
  food: '<path d="M5 8h11l-1 10H6zM16 10h2a2 2 0 010 4h-2" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  tool: '<path d="M4 20l9-9m2-7a4 4 0 104 4l-3 1-2-2z" fill="none" stroke="currentColor" stroke-width="2"/>',
  key: '<circle cx="8" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M11 11l9 9m-3-3l2-2m-5-1l2-2" stroke="currentColor" stroke-width="2"/>',
  evidence: '<rect x="4" y="5" width="16" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="7" y="8" width="10" height="7" fill="currentColor" opacity=".5"/>',
  paper: '<path d="M6 3h9l3 3v15H6z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 10h6M9 14h6" stroke="currentColor" stroke-width="1.4"/>',
  valuable: '<circle cx="12" cy="13" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 3h4l-1 4h-2z" fill="currentColor"/>',
  clothing: '<path d="M8 4l4 3 4-3 4 4-3 3v9H7v-9L4 8z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};

export class Pockets implements Tab {
  id = 'pockets'; label = 'POCKETS';
  el = document.createElement('div');
  hint = 'Tap an item for details';
  private sel: string | null = null;
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;

  constructor(private host: UiHost) { this.el.className = 'u-scroll u-pockets'; host.on('inventory', () => { if (this.el.style.display !== 'none') this.render(true); }); }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  render(keep = false) {
    const inv = this.host.inventory(), lead = this.host.party().find((l) => l.id === inv.lead);
    const hides = CONCEAL_ORDER.indexOf(inv.outfit.hides);
    const items: NavItem[] = [];
    this.el.innerHTML = `
      <div class="pk-top">
        <div class="pk-who"><div class="nm">${esc(lead?.short ?? '')}</div><div class="outfit">${esc(inv.outfit.name)}</div><div class="desc">${esc(inv.outfit.description)}</div>
          <div class="hides">This outfit hides up to: <b>${ZONE[inv.outfit.hides].label.toLowerCase()}</b>${inv.outfit.heatNote ? ` · <i>${esc(inv.outfit.heatNote)}</i>` : ''}</div></div>
        <div class="pk-money"><div><span>Cash on hand</span><b>${money(inv.cash)}</b><small>Lost if you're robbed, arrested or hurt</small></div>
          <div><span>Savings</span><b>${money(inv.savings, false)}</b><small>Bank and the safe at home</small></div>${inv.carCapacity ? `<div><span>Car trunk</span><b style="font-size:16px">${esc(inv.carCapacity)}</b></div>` : ''}</div>
      </div>
      <div class="pk-zones"></div><div class="pk-detail"></div>`;
    const zones = this.el.querySelector('.pk-zones')!;
    for (const z of CONCEAL_ORDER) {
      const its = inv.items.filter((i) => i.size === z);
      if (!its.length && z !== 'pocket' && z !== 'jacket') continue;
      const zi = CONCEAL_ORDER.indexOf(z);
      const col = document.createElement('div');
      col.className = `pk-zone ${z === 'visible' ? 'show' : zi <= hides ? 'ok' : zi === hides + 1 ? 'print' : 'show'}`;
      col.innerHTML = `<div class="zh"><b>${ZONE[z].label}</b><span>${ZONE[z].where}</span><em>${z === 'visible' ? 'Seen' : zi <= hides ? 'Hidden' : zi === hides + 1 ? 'Shows a bulge' : 'Seen'}</em></div>`;
      for (const it of its) {
        const b = document.createElement('button');
        b.className = `pk-item ${it.state}${it.id === this.sel ? ' sel' : ''}`;
        b.innerHTML = `<svg viewBox="0 0 24 24">${KIND_ICON[it.kind]}</svg><span class="n">${esc(it.name)}${it.qty > 1 ? ` ×${it.qty}` : ''}</span>
          <span class="tags">${it.equipped ? '<i class="eq">In hand</i>' : ''}${it.hot ? '<i class="hot">Hot</i>' : ''}<i class="st">${STATE[it.state]}</i></span>`;
        col.appendChild(b);
        items.push({ el: b, activate: () => { this.sel = it.id; this.render(true); } });
      }
      if (!its.length) col.insertAdjacentHTML('beforeend', '<div class="empty">Nothing</div>');
      zones.appendChild(col);
    }
    const it = inv.items.find((i) => i.id === this.sel);
    const d = this.el.querySelector('.pk-detail') as HTMLElement;
    if (it) {
      d.innerHTML = `<h3>${esc(it.name)}</h3>
        <div class="row"><span>Witnesses see</span><b class="${it.state}">${STATE[it.state]}</b></div>
        ${it.condition !== undefined ? `<div class="row"><span>Condition</span><b>${it.condition > 0.8 ? 'Good' : it.condition > 0.5 ? 'Worn' : 'Dirty: may jam'}</b><i class="bar"><i style="width:${(it.condition * 100).toFixed(0)}%"></i></i></div>` : ''}
        ${it.ammo ? `<div class="row"><span>Rounds</span><b>${it.ammo.loaded} loaded · ${it.ammo.spare} spare</b></div>` : ''}
        ${it.value ? `<div class="row"><span>A fence might pay</span><b>about ${money(it.value * (it.hot ? 0.4 : 0.6), false)}</b></div>` : ''}
        ${it.hot ? '<div class="warn">Hot: reported stolen. Cops who find it will book you.</div>' : ''}
        ${it.note ? `<p>${esc(it.note)}</p>` : ''}<div class="acts"></div>`;
      const acts = d.querySelector('.acts')!;
      const btn = (l: string, fn: () => void, primary = false) => { const b = document.createElement('button'); b.className = `u-btn${primary ? ' primary' : ''}`; b.textContent = l; acts.appendChild(b); items.push({ el: b, activate: fn }); };
      if (it.kind === 'weapon') btn(it.equipped ? 'Put away' : 'Take in hand', () => { this.host.act({ kind: 'equip', item: it.equipped ? null : it.id }); }, true);
      if (it.kind !== 'key' && it.kind !== 'evidence') btn('Drop it', () => { const r = this.host.act({ kind: 'drop', item: it.id }); this.sel = null; if (r.text) this.onToast?.(r.text); this.render(true); });
      btn('Close', () => { this.sel = null; this.render(true); });
    } else d.innerHTML = `<p class="hint">Where it sits decides who sees it. A long coat hides a sawn-off, but nobody wears one in July without being looked at.</p>`;
    this.setNav(items, keep);
  }
}
