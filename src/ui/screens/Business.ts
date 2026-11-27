/**
 * Business management (ECONOMY §4): what you own and what's for sale. Each business is a ledger
 * page: weekly income with an eight-week trend, the week-by-week book (gross, payroll, the pad, net),
 * upgrades, and the trouble that comes with it (shakedowns, protection, brownouts, break-ins,
 * skimming, inspections) with what you can do about it.
 * DESIGN_A: one hero, this week's take across everything you own, as a big number over an eight-week
 * band; below it the books (left) and the open page (right): trouble first, as actions, then the book.
 */
import type { UiHost, BusinessView } from '../host/types';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { esc, money } from '../util';

const TROUBLE: Record<BusinessView['trouble'][number]['kind'], string> = {
  shakedown: 'Shakedown', protection: 'Protection', brownout: 'Brownout', breakin: 'Break-in', skimming: 'Skimming', inspection: 'Inspection',
};

export class Business implements Tab {
  id = 'business'; label = 'BUSINESS';
  el = document.createElement('div');
  private sel = '';
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;

  constructor(private host: UiHost) { this.el.className = 'u-scroll u-biz bk-a'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private render() {
    const all = this.host.businesses(), items: NavItem[] = [];
    if (!this.sel || !all.some((b) => b.id === this.sel)) this.sel = (all.find((b) => b.owner) ?? all[0])?.id ?? '';
    const b = all.find((x) => x.id === this.sel);
    const mine = all.filter((x) => x.owner);
    const weekly = mine.reduce((s, x) => s + x.weeklyIncome, 0);
    // the eight-week band: everything you own, summed week by week; this week is the last bar
    const weeks = Array.from({ length: 8 }, (_, i) => mine.reduce((s, x) => s + (x.trend[i] ?? 0), 0));
    const top = Math.max(1, ...weeks), last = weeks[7] ?? 0, prev = weeks[6] ?? 0, delta = last - prev;
    const trouble = mine.reduce((s, x) => s + x.trouble.length, 0);
    this.el.innerHTML = `<header class="bk-take">
        <div class="bk-hero"><span class="a-label">This week's take</span><b class="a-num">${money(weekly, false)}</b>
          <small>${mine.length ? `From ${mine.length === 1 ? 'one business' : `${mine.length} businesses`}, after payroll and the pad` : 'You don\'t own anything yet'}${mine.length && prev ? ` · <em class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : '−'}${money(Math.abs(delta), false)} on last week</em>` : ''}</small></div>
        ${mine.length ? `<div class="bk-weeks" aria-hidden="true">${weeks.map((v, i) => `<i class="${i === 7 ? 'now' : ''}" style="height:${Math.max(4, (v / top) * 100).toFixed(1)}%"><span>${i === 7 ? 'This wk' : `${7 - i}w`}</span></i>`).join('')}</div>` : ''}
        ${trouble ? `<div class="bk-alert"><b class="a-num">${trouble}</b><span>open ${trouble === 1 ? 'problem' : 'problems'}<br>need you</span></div>` : ''}
      </header>
      <nav class="bk-list"></nav><section class="bk-page"></section>`;
    const list = this.el.querySelector('.bk-list')!;
    for (const [title, group] of [['Yours', mine], ['For sale', all.filter((x) => !x.owner)]] as const) {
      if (!group.length) continue;
      list.insertAdjacentHTML('beforeend', `<h4 class="t74-group">${title}</h4>`);
      for (const x of group) {
        const el = document.createElement('button'); el.className = `bz-item bk-item${x.id === this.sel ? ' on' : ''}${x.trouble.length ? ' trouble' : ''}`;
        el.innerHTML = `<b>${esc(x.name)}</b><span>${esc(x.kind)} · ${esc(x.address)}</span><em class="a-num">${x.owner ? `${money(x.weeklyIncome, false)}<small>/wk</small>` : money(x.price ?? 0, false)}</em>${x.trouble.length ? `<i class="tr">${x.trouble.length} trouble</i>` : ''}`;
        list.appendChild(el); items.push({ el, activate: () => { this.sel = x.id; this.render(); } });
      }
    }
    const page = this.el.querySelector('.bk-page') as HTMLElement;
    if (b) {
      page.innerHTML = `<header class="bk-head"><span class="a-label">${b.owner ? 'Your book' : 'For sale'} · ${esc(b.kind)}</span><h3 class="a-voice">${esc(b.name)}</h3>
          <div class="sub">${esc(b.address)}${b.manager ? ` · run by ${esc(b.manager)}` : ''} · ${b.staff} staff</div></header>
        ${!b.owner && b.price ? `<div class="bk-buy"><div><span class="a-label">Asking</span><b class="a-num">${money(b.price, false)}</b><small>Cash and savings. Makes about ${money(b.weeklyIncome, false)} a week.</small></div><div class="go"></div></div>` : ''}
        ${b.trouble.length ? `<h4 class="t74-group bk-th">Trouble</h4>${b.trouble.map((t, i) => `<div class="bk-trouble" data-i="${i}"><div class="tx"><b>${TROUBLE[t.kind]}</b><p>${esc(t.text)}${t.due ? ` <i>Due ${esc(t.due)}.</i>` : ''}</p></div><div class="acts"></div></div>`).join('')}` : ''}
        ${b.ledger.length ? `<h4 class="t74-group">The book</h4><table class="bk-ledger"><thead><tr><th>Week of</th><th>Gross</th><th>Payroll</th><th>The pad</th><th>Net</th></tr></thead><tbody>${b.ledger.map((l) => `<tr><td>${esc(l.week)}</td><td>${money(l.gross, false)}</td><td>−${money(l.payroll, false)}</td><td>−${money(l.pad, false)}</td><td><b>${money(l.net, false)}</b></td></tr>`).join('')}</tbody></table>` : ''}
        <h4 class="t74-group">Improvements</h4><div class="bk-ups"></div>`;
      const ups = page.querySelector('.bk-ups')!;
      for (const u of b.upgrades) {
        const el = document.createElement('button'); el.className = `bk-up${u.owned ? ' owned' : ''}${b.owner ? '' : ' locked'}`;
        el.innerHTML = `<b>${esc(u.name)}</b><span>${esc(u.effect)}</span><em class="a-num">${u.owned ? 'Done' : u.cost ? money(u.cost, false) : 'Free'}</em>`;
        ups.appendChild(el);
        items.push({ el, activate: () => { if (u.owned || !b.owner) return; const r = this.host.act({ kind: 'upgrade', business: b.id, upgrade: u.id }); this.onToast?.(r.text ?? (r.ok ? `Ordered: ${u.name}` : '')); this.render(); } });
      }
      // trouble comes first in the focus order after the list: it's what needs you
      const troubleItems: NavItem[] = [];
      page.querySelectorAll<HTMLElement>('.bk-trouble').forEach((t) => {
        const i = +t.dataset.i!, acts = t.querySelector('.acts')!;
        const kind = b.trouble[i].kind;
        const opts: [string, () => void, boolean][] = kind === 'shakedown' || kind === 'protection'
          ? [['Pay it', () => this.resolve(b, i, 'Paid. They\'ll be back next week.'), true], ['Refuse', () => this.resolve(b, i, 'Refused. Expect an inspection, or worse.'), false], ['Handle it yourself', () => this.resolve(b, i, 'Added to map: settle it in person.'), false]]
          : [['Noted', () => this.resolve(b, i, 'Noted.'), false]];
        for (const [l, fn, primary] of opts) { const el = document.createElement('button'); el.className = `u-btn${primary ? ' primary' : ''}`; el.textContent = l; acts.appendChild(el); troubleItems.push({ el, activate: fn }); }
      });
      const upStart = items.length - b.upgrades.length;
      items.splice(upStart, 0, ...troubleItems);
      if (!b.owner && b.price) {
        const el = document.createElement('button'); el.className = 'u-btn primary'; el.textContent = `Buy for ${money(b.price, false)}`;
        page.querySelector('.bk-buy .go')!.appendChild(el);
        items.splice(upStart, 0, { el, activate: () => { const r = this.host.act({ kind: 'buyBusiness', id: b.id }); this.onToast?.(r.text ?? ''); this.render(); } });
      }
    }
    this.setNav(items, true);
  }
  private resolve(b: BusinessView, i: number, text: string) { this.host.act({ kind: 'payTrouble', business: b.id, index: i }); this.onToast?.(text); }
}
