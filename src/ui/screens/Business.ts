/**
 * Business management (ECONOMY §4): what you own and what's for sale. Each business is a ledger
 * page: weekly income with an eight-week trend, the week-by-week book (gross, payroll, the pad, net),
 * upgrades, and the trouble that comes with it (shakedowns, protection, brownouts, break-ins,
 * skimming, inspections) with what you can do about it.
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

  constructor(private host: UiHost) { this.el.className = 'u-scroll u-biz'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private render() {
    const all = this.host.businesses(), items: NavItem[] = [];
    if (!this.sel || !all.some((b) => b.id === this.sel)) this.sel = (all.find((b) => b.owner) ?? all[0])?.id ?? '';
    const b = all.find((x) => x.id === this.sel);
    const weekly = all.filter((x) => x.owner).reduce((s, x) => s + x.weeklyIncome, 0);
    this.el.innerHTML = `<div class="bz-grid"><nav class="bz-list"><div class="bz-sum"><span>Your businesses bring in</span><b>${money(weekly, false)}<small> a week</small></b></div></nav><section class="bz-page"></section></div>`;
    const list = this.el.querySelector('.bz-list')!;
    for (const [title, group] of [['Yours', all.filter((x) => x.owner)], ['For sale', all.filter((x) => !x.owner)]] as const) {
      if (!group.length) continue;
      list.insertAdjacentHTML('beforeend', `<div class="bz-gh">${title}</div>`);
      for (const x of group) {
        const el = document.createElement('button'); el.className = `bz-item${x.id === this.sel ? ' on' : ''}`;
        el.innerHTML = `<b>${esc(x.name)}</b><span>${esc(x.kind)} · ${esc(x.address)}</span><em>${x.owner ? `${money(x.weeklyIncome, false)}/wk` : money(x.price ?? 0, false)}</em>${x.trouble.length ? '<i class="tr">!</i>' : ''}`;
        list.appendChild(el); items.push({ el, activate: () => { this.sel = x.id; this.render(); } });
      }
    }
    const page = this.el.querySelector('.bz-page') as HTMLElement;
    if (b) {
      const max = Math.max(...b.trend, 1);
      const spark = `<svg class="bz-spark" viewBox="0 0 160 44" preserveAspectRatio="none"><polyline fill="none" stroke="currentColor" stroke-width="1.6" points="${b.trend.map((v, i) => `${(i / (b.trend.length - 1)) * 158 + 1},${42 - (v / max) * 38}`).join(' ')}"/></svg>`;
      page.innerHTML = `<header><h3>${esc(b.name)}</h3><div class="sub">${esc(b.kind)} · ${esc(b.address)}${b.manager ? ` · run by ${esc(b.manager)}` : ''} · ${b.staff} staff</div></header>
        <div class="bz-kpis"><div><span>Weekly income</span><b>${money(b.weeklyIncome, false)}</b>${spark}<small>last eight weeks</small></div>${b.price && !b.owner ? `<div><span>Asking</span><b>${money(b.price, false)}</b><small>cash and savings</small></div>` : ''}</div>
        ${b.trouble.length ? `<div class="bz-h">Trouble</div>${b.trouble.map((t, i) => `<div class="bz-trouble" data-i="${i}"><b>${TROUBLE[t.kind]}</b><p>${esc(t.text)}${t.due ? ` <i>Due ${esc(t.due)}.</i>` : ''}</p><div class="acts"></div></div>`).join('')}` : ''}
        ${b.ledger.length ? `<div class="bz-h">The book</div><table class="bz-ledger"><tr><th>Week of</th><th>Gross</th><th>Payroll</th><th>The pad</th><th>Net</th></tr>${b.ledger.map((l) => `<tr><td>${esc(l.week)}</td><td>${money(l.gross, false)}</td><td>${money(-l.payroll, false)}</td><td>${money(-l.pad, false)}</td><td><b>${money(l.net, false)}</b></td></tr>`).join('')}</table>` : ''}
        <div class="bz-h">Improvements</div><div class="bz-ups"></div><div class="bz-buy"></div>`;
      const ups = page.querySelector('.bz-ups')!;
      for (const u of b.upgrades) {
        const el = document.createElement('button'); el.className = `bz-up${u.owned ? ' owned' : ''}`;
        el.innerHTML = `<b>${esc(u.name)}</b><span>${esc(u.effect)}</span><em>${u.owned ? 'Done' : u.cost ? money(u.cost, false) : 'Free'}</em>`;
        ups.appendChild(el);
        items.push({ el, activate: () => { if (u.owned || !b.owner) return; const r = this.host.act({ kind: 'upgrade', business: b.id, upgrade: u.id }); this.onToast?.(r.text ?? (r.ok ? `Ordered: ${u.name}` : '')); this.render(); } });
      }
      page.querySelectorAll<HTMLElement>('.bz-trouble').forEach((t) => {
        const i = +t.dataset.i!, acts = t.querySelector('.acts')!;
        const kind = b.trouble[i].kind;
        const opts: [string, () => void][] = kind === 'shakedown' || kind === 'protection'
          ? [['Pay it', () => this.resolve(b, i, 'Paid. They\'ll be back next week.')], ['Refuse', () => this.resolve(b, i, 'Refused. Expect an inspection, or worse.')], ['Handle it yourself', () => this.resolve(b, i, 'Added to map: deal with it in person.')]]
          : [['Noted', () => this.resolve(b, i, 'Noted.')]];
        for (const [l, fn] of opts) { const el = document.createElement('button'); el.className = 'u-btn'; el.textContent = l; acts.appendChild(el); items.push({ el, activate: fn }); }
      });
      if (!b.owner && b.price) {
        const el = document.createElement('button'); el.className = 'u-btn primary'; el.textContent = `Buy for ${money(b.price, false)}`;
        page.querySelector('.bz-buy')!.appendChild(el);
        items.push({ el, activate: () => { const r = this.host.act({ kind: 'buyBusiness', id: b.id }); this.onToast?.(r.text ?? ''); this.render(); } });
      }
    }
    this.setNav(items, true);
  }
  private resolve(b: BusinessView, i: number, text: string) { this.host.act({ kind: 'payTrouble', business: b.id, index: i }); this.onToast?.(text); }
}
