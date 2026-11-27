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
import { icon, type IconName } from '../icons';

const ZONE: Record<Conceal, { label: string; where: string }> = {
  pocket: { label: 'Pockets', where: 'Trousers and shirt' },
  jacket: { label: 'Jacket', where: 'Inside pocket, waistband' },
  longcoat: { label: 'Long coat', where: 'Under the coat' },
  bag: { label: 'Bag', where: 'Over the shoulder' },
  visible: { label: 'In your hands', where: 'Everyone can see' },
};
const STATE = { hidden: 'Hidden', printing: 'Printing', visible: 'In plain sight' };
const KIND_ICON: Record<ItemView['kind'], IconName> = { weapon: 'weapon', ammo: 'ammo', food: 'food', tool: 'garage', key: 'key', evidence: 'ticket', paper: 'paper', valuable: 'collectible', clothing: 'clothes' };

export class Pockets implements Tab {
  id = 'pockets'; label = 'POCKETS';
  el = document.createElement('div');
  hint = 'Tap an item for details';
  private sel: string | null = null;
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;

  constructor(private host: UiHost) { this.el.className = 'u-scroll u-pockets a-split'; host.on('inventory', () => { if (this.el.style.display !== 'none') this.render(true); }); }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  render(keep = false) {
    const inv = this.host.inventory(), lead = this.host.party().find((l) => l.id === inv.lead);
    const hides = CONCEAL_ORDER.indexOf(inv.outfit.hides);
    const items: NavItem[] = [];
    // DESIGN_A: one list on the left (grouped by where it sits on you), one hero on the right (the item, or your money)
    this.el.innerHTML = `
      <section class="pk-list">
        <header class="pk-who"><b class="a-voice">${esc(lead?.short ?? '')}</b>
          <div class="outfit"><span class="a-label">Wearing</span> ${esc(inv.outfit.name)}<small>${esc(inv.outfit.description)}</small></div></header>
        <div class="pk-zones"></div>
      </section>
      <section class="pk-detail"></section>`;
    const zones = this.el.querySelector('.pk-zones')!;
    for (const z of CONCEAL_ORDER) {
      const its = inv.items.filter((i) => i.size === z);
      if (!its.length && z !== 'pocket' && z !== 'jacket') continue;
      const zi = CONCEAL_ORDER.indexOf(z);
      const st = z === 'visible' ? 'show' : zi <= hides ? 'ok' : zi === hides + 1 ? 'print' : 'show';
      zones.insertAdjacentHTML('beforeend', `<div class="pk-zh ${st}"><b>${ZONE[z].label}</b><span>${ZONE[z].where}</span><em>${st === 'ok' ? 'Hidden' : st === 'print' ? 'Shows a bulge' : 'Seen'}</em></div>`);
      for (const it of its) {
        const b = document.createElement('button');
        b.className = `pk-item ${it.state}${it.id === this.sel ? ' sel' : ''}`;
        b.innerHTML = `${icon(KIND_ICON[it.kind], 20)}<span class="n">${esc(it.name)}${it.qty > 1 ? ` <i>×${it.qty}</i>` : ''}</span>
          <span class="tags">${it.equipped ? '<i class="eq">In hand</i>' : ''}${it.hot ? '<i class="hot">Hot</i>' : ''}</span>`;
        zones.appendChild(b);
        items.push({ el: b, activate: () => { this.sel = it.id; this.render(true); } });
      }
      if (!its.length) zones.insertAdjacentHTML('beforeend', '<div class="empty">Nothing here</div>');
    }
    const it = inv.items.find((i) => i.id === this.sel);
    const d = this.el.querySelector('.pk-detail') as HTMLElement;
    const fact = (k: string, v: string, cls = '') => `<div class="t74-row btn"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`;
    if (it) {
      d.innerHTML = `<div class="pk-hero">${icon(KIND_ICON[it.kind], 56, 'pk-big')}<div><span class="a-label">${ZONE[it.size].label} · ${ZONE[it.size].where}</span><h3 class="a-voice">${esc(it.name)}</h3></div></div>
        <div class="t74-rows">
          ${fact('Witnesses see', STATE[it.state], it.state)}
          ${it.condition !== undefined ? fact('Condition', `${it.condition > 0.8 ? 'Good' : it.condition > 0.5 ? 'Worn' : 'Dirty: may jam'}<i class="bar"><i style="width:${(it.condition * 100).toFixed(0)}%"></i></i>`) : ''}
          ${it.ammo ? fact('Rounds', `${it.ammo.loaded} loaded · ${it.ammo.spare} spare`) : ''}
          ${it.value ? fact('A fence might pay', `about ${money(it.value * (it.hot ? 0.4 : 0.6), false)}`) : ''}
        </div>
        ${it.hot ? '<p class="warn">Hot: reported stolen. Cops who find it will book you.</p>' : ''}
        ${it.note ? `<p class="note">${esc(it.note)}</p>` : ''}<div class="acts"></div>`;
      const acts = d.querySelector('.acts')!;
      const btn = (l: string, fn: () => void, primary = false) => { const b = document.createElement('button'); b.className = `u-btn${primary ? ' primary' : ''}`; b.textContent = l; acts.appendChild(b); items.push({ el: b, activate: fn }); };
      if (it.kind === 'weapon') btn(it.equipped ? 'Put away' : 'Take in hand', () => { this.host.act({ kind: 'equip', item: it.equipped ? null : it.id }); }, true);
      if (it.kind !== 'key' && it.kind !== 'evidence') btn('Drop it', () => { const r = this.host.act({ kind: 'drop', item: it.id }); this.sel = null; if (r.text) this.onToast?.(r.text); this.render(true); });
      btn('Back', () => { this.sel = null; this.render(true); });
    } else {
      d.innerHTML = `<div class="pk-money"><span class="a-label">Cash on hand</span><b class="a-num">${money(inv.cash)}</b><small>Lost if you're robbed, arrested or hurt</small></div>
        <div class="t74-rows">${fact('Savings', money(inv.savings, false))}${inv.carCapacity ? fact('Car trunk', esc(inv.carCapacity)) : ''}${fact('This outfit hides', `up to the ${ZONE[inv.outfit.hides].label.toLowerCase()}`)}</div>
        <p class="note">Where it sits decides who sees it. A long coat hides a sawn-off, but nobody wears one in July without being looked at.${inv.outfit.heatNote ? ` ${esc(inv.outfit.heatNote)}` : ''}</p>`;
    }
    this.setNav(items, keep);
  }
}
