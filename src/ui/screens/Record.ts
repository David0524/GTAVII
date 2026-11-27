/**
 * RECORD: stats, the completion checklist and achievements (original names), laid out as a
 * reporter's notebook: a stats column, ruled progress lines, and achievement "clippings".
 */
import type { UiHost } from '../host/types';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import type { MapModel } from '../map/MapModel';
import { esc } from '../util';

export class Record implements Tab {
  id = 'record'; label = 'RECORD';
  el = document.createElement('div');
  private view: 'stats' | 'checklist' | 'achievements' = 'stats';
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  constructor(private host: UiHost, private model: MapModel) { this.el.className = 'u-scroll u-record'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private render() {
    const items: NavItem[] = [];
    const head = `<div class="np-pages">${(['stats', 'checklist', 'achievements'] as const).map((v) => `<button data-v="${v}" class="${v === this.view ? 'on' : ''}">${v === 'stats' ? 'The numbers' : v === 'checklist' ? 'Checklist' : 'Achievements'}</button>`).join('')}</div>`;
    let body = '';
    if (this.view === 'stats') {
      const rows = this.host.stats().map((r) => (r.label === 'Places discovered' ? { ...r, value: String(this.model.discovery.counts.known) } : r));
      const groups = [...new Set(rows.map((r) => r.group))];
      body = `<div class="rc-book">${groups.map((g) => `<section><h3>${esc(g)}</h3>${rows.filter((r) => r.group === g).map((r) => `<div class="rc-row"><span>${esc(r.label)}</span><i></i><b>${esc(r.value)}</b></div>`).join('')}</section>`).join('')}</div>`;
    } else if (this.view === 'checklist') {
      const rows = this.host.completion().map((r) => (r.label === 'Places discovered' ? { ...r, done: this.model.discovery.counts.known, total: this.model.discovery.counts.total } : r));
      const done = rows.reduce((s, r) => s + r.done / r.total, 0) / rows.length;
      body = `<div class="rc-total"><b>${(done * 100).toFixed(1)}%</b><span>of the city, all told</span></div><div class="rc-book">${[...new Set(rows.map((r) => r.group))].map((g) => `<section><h3>${esc(g)}</h3>${rows.filter((r) => r.group === g).map((r) => `<div class="rc-check"><span>${esc(r.label)}</span><b>${r.done} / ${r.total}</b><i class="bar"><i style="width:${(r.done / r.total * 100).toFixed(1)}%"></i></i></div>`).join('')}</section>`).join('')}</div>`;
    } else {
      const a = this.host.achievements();
      body = `<div class="rc-total"><b>${a.filter((x) => x.unlocked).length} / ${a.length}</b><span>clippings</span></div><div class="rc-clips">${a.map((x) => `<div class="rc-clip${x.unlocked ? '' : ' locked'}"><b>${x.hidden && !x.unlocked ? 'Not yet' : esc(x.name)}</b><p>${x.hidden && !x.unlocked ? 'Keep living in the city.' : esc(x.text)}</p>${x.unlocked ? `<small>${esc(x.unlocked)}</small>` : ''}</div>`).join('')}</div>`;
    }
    this.el.innerHTML = head + body;
    this.el.querySelectorAll<HTMLElement>('.np-pages button').forEach((b) => items.push({ el: b, activate: () => { this.view = b.dataset.v as typeof this.view; this.render(); } }));
    this.setNav(items, true);
  }
}
