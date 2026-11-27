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
  constructor(private host: UiHost, private model: MapModel) { this.el.className = 'u-scroll u-record a-split rc-a'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private render() {
    const items: NavItem[] = [];
    // DESIGN_A: a hero column (how much of the city is yours, big) beside dense ruled data; no cards
    const comp = this.host.completion().map((r) => (r.label === 'Places discovered' ? { ...r, done: this.model.discovery.counts.known, total: this.model.discovery.counts.total } : r));
    const done = comp.reduce((s, r) => s + r.done / Math.max(1, r.total), 0) / Math.max(1, comp.length);
    const walked = this.model.explored?.fraction?.() ?? 0;
    const ach = this.host.achievements(), got = ach.filter((x) => x.unlocked).length;
    const PAGES = [['stats', 'The numbers'], ['checklist', 'Checklist'], ['achievements', 'Achievements']] as const;
    const hero = `<aside class="rc-hero">
        <span class="a-label">Of the city, all told</span><b class="a-num rc-pct">${(done * 100).toFixed(1)}<i>%</i></b>
        <div class="rc-sub"><span><b class="a-num">${Math.round(walked * 100)}%</b> of the streets walked</span><span><b class="a-num">${got}</b> of ${ach.length} achievements</span></div>
        <nav class="rc-pages">${PAGES.map(([v, l]) => `<button data-v="${v}" class="${v === this.view ? 'on' : ''}">${l}</button>`).join('')}</nav>
      </aside>`;
    let body = '';
    const group = (g: string) => `<h4 class="t74-group">${esc(g)}</h4>`;
    if (this.view === 'stats') {
      const rows = this.host.stats().map((r) => (r.label === 'Places discovered' ? { ...r, value: String(this.model.discovery.counts.known) } : r));
      body = [...new Set(rows.map((r) => r.group))].map((g) => `<section>${group(g)}${rows.filter((r) => r.group === g).map((r) => `<div class="rc-row"><span>${esc(r.label)}</span><b>${esc(r.value)}</b></div>`).join('')}</section>`).join('');
    } else if (this.view === 'checklist') {
      body = [...new Set(comp.map((r) => r.group))].map((g) => `<section>${group(g)}${comp.filter((r) => r.group === g).map((r) => `<div class="rc-row rc-check${r.done >= r.total ? ' full' : ''}"><span>${esc(r.label)}</span><b>${r.done}<small> / ${r.total}</small></b><i class="bar"><i style="width:${(r.done / Math.max(1, r.total) * 100).toFixed(1)}%"></i></i></div>`).join('')}</section>`).join('');
    } else {
      body = `<section class="rc-ach">${ach.map((x) => `<div class="rc-a${x.unlocked ? '' : ' locked'}"><b>${x.hidden && !x.unlocked ? 'Not yet' : esc(x.name)}</b><p>${x.hidden && !x.unlocked ? 'Keep living in the city.' : esc(x.text)}</p><small>${x.unlocked ? esc(x.unlocked) : 'Locked'}</small></div>`).join('')}</section>`;
    }
    this.el.innerHTML = hero + `<div class="rc-data ${this.view}">${body}</div>`;
    this.el.querySelectorAll<HTMLElement>('.rc-pages button').forEach((b) => items.push({ el: b, activate: () => { this.view = b.dataset.v as typeof this.view; this.render(); } }));
    this.setNav(items, true);
  }
}
