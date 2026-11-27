/**
 * HomeUpgrades: the active lead's home and what you can do to it (window air conditioner, a deadbolt
 * and chain, a second-hand TV). Each is a receipt-style card with its price and what it changes.
 */
import type { UiHost, HomeView } from '../host/types';
import type { Input } from '../../input/Input';
import type { NavItem } from '../MenuNav';
import { Modal } from './Modal';
import { esc, money } from '../util';

export class HomeUpgrades extends Modal {
  private msg = '';
  constructor(input: Input, private host: UiHost) { super(input, 'dimbg u-home'); host.on('money', () => { if (this.open) this.render(); }); }

  openHome() { this.msg = ''; this.show(); this.render(false); }

  private home(): HomeView | null {
    const lead = this.host.player().lead, all = this.host.homes?.() ?? [];
    return all.find((h) => h.lead === lead) ?? all[0] ?? null;
  }

  private render(keep = true) {
    const h = this.home(), items: NavItem[] = [];
    const scroll = this.root.querySelector('.hm-grid')?.scrollTop ?? 0;
    if (!h) {
      this.root.innerHTML = `<div class="u-head"><h2>Home</h2><span class="close"></span></div><p class="hint" style="padding:20px 4vw">You don't have a place of your own yet.</p>`;
      const c = document.createElement('button'); c.className = 'u-btn'; c.textContent = 'Close ✕'; this.root.querySelector('.close')!.appendChild(c);
      this.setNav([{ el: c, activate: () => this.hide() }]); return;
    }
    const cash = this.host.inventory().cash, owned = h.upgrades.filter((u) => u.owned).length;
    this.root.innerHTML = `<div class="u-head"><h2>${esc(h.name)}</h2><span class="sub">${esc(h.address)}</span><span class="close"></span></div>
      <div class="hm-body"><aside class="hm-side"><div class="hm-slip"><b>Fix the place up</b><p>${esc(this.msg || 'The super says he can have it done by tonight. Cash up front.')}</p></div>
        <div class="hm-cash"><span>In your pocket</span><b>${money(cash)}</b></div><div class="hm-count">${owned} of ${h.upgrades.length} done</div></aside>
        <div class="hm-grid"></div></div><div class="u-foot">${this.footer()}</div>`;
    const close = document.createElement('button'); close.className = 'u-btn'; close.textContent = 'Leave ✕'; this.root.querySelector('.close')!.appendChild(close);
    const grid = this.root.querySelector('.hm-grid')!;
    for (const u of h.upgrades) {
      const b = document.createElement('button'); const short = !u.owned && cash < u.cost;
      b.className = `hm-card${u.owned ? ' owned' : ''}${short ? ' short' : ''}`;
      b.innerHTML = `<span class="hm-price">${money(u.cost, false)}</span><span class="in"><b>${esc(u.name)}</b><small>${esc(u.effect)}</small>${short ? `<span class="hm-short">Short ${money(u.cost - cash)}</span>` : ''}</span>${u.owned ? '<span class="hm-stamp">Installed</span>' : ''}`;
      grid.appendChild(b);
      items.push({ el: b, activate: () => {
        if (u.owned) { this.msg = 'Already got that.'; this.render(); return; }
        const r = this.host.act({ kind: 'homeUpgrade', home: h.id, upgrade: u.id });
        this.msg = r.text ?? ''; this.render();
      } });
    }
    items.push({ el: close, activate: () => this.hide() });
    this.setNav(items, keep);
    (this.root.querySelector('.hm-grid') as HTMLElement).scrollTop = scroll;
  }
}
