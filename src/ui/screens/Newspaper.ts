/**
 * The newspaper (ECONOMY: weekly results, the daily number, the chop list, headlines, prices).
 * An invented evening tabloid laid out as a real front page: masthead, banner headline, deck, three
 * columns; the inside page carries the track results and the number; the chop shop's wanted list is
 * a mimeographed sheet tucked inside (the paper wouldn't print it). Classified ads can add a place
 * to your map (discovery via 'news'). Bet on the number from here.
 * DESIGN_A: the paper is a diegetic object (straight on, print-correct type); everything you do with it
 * (the page switcher, the runner's slip, what's on your map) lives in the UI rail beside it.
 */
import type { UiHost, ClassifiedAd } from '../host/types';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import type { MapModel } from '../map/MapModel';
import { esc, money } from '../util';

type Page = 'front' | 'inside' | 'classifieds';

export class Newspaper implements Tab {
  id = 'paper'; label = 'PAPER';
  el = document.createElement('div');
  hint = 'Tap an ad to add it to your map';
  private page: Page = 'front';
  private digits = [1, 7, 4];
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;

  constructor(private host: UiHost, private model: MapModel) { this.el.className = 'u-scroll u-paperwrap np-a'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private onMap(placeId?: string) { return !!placeId && this.model.discovery.isKnown(placeId); }
  private addToMap(placeId: string) {
    const ok = this.model.discovery.reveal(placeId, 'news');
    const p = this.model.discovery.place(placeId);
    this.onToast?.(ok ? `Added to map: ${p?.name ?? 'the address'}` : 'Already on your map');
  }
  private mark(placeId?: string) { return this.onMap(placeId) ? '<i class="np-onmap">On your map</i>' : ''; }

  private render() {
    const n = this.host.newspaper();
    const items: NavItem[] = [];
    if (!n) { this.el.innerHTML = '<p class="np-none"><b class="a-voice">No paper today.</b><span>Newsstands open at 5 AM.</span></p>'; this.setNav([]); return; }
    const ads = this.host.classifieds?.() ?? [];
    const PAGES: [Page, string, string, string][] = [
      ['front', 'A1', 'Front page', n.headline.charAt(0) + n.headline.slice(1).toLowerCase()],
      ['inside', 'B6', 'Results & the number', `Yesterday's number ${n.number.digits.replace(/\s/g, '')}`],
      ['classifieds', 'C2', 'Classifieds', `${ads.length} ads today`],
    ];
    const rail = `<aside class="np-rail"><div class="np-ident"><span class="a-label">${esc(n.masthead)}</span><small>${esc(n.date)}</small></div>
      <nav class="np-pages">${PAGES.map(([p, no, l, sub]) => `<button data-p="${p}" class="${this.page === p ? 'on' : ''}"><i>${no}</i><b>${l}</b><small>${esc(sub)}</small></button>`).join('')}</nav>
      <div class="np-side"></div></aside>`;
    let sheet = '';
    if (this.page === 'front') {
      sheet = `<article class="np-sheet">
        <header class="np-mast"><div class="ear l">${esc(n.edition)}<br>${esc(n.price)}</div><h1>${esc(n.masthead)}</h1><div class="ear r">NEW YORK'S PICTURE<br>NEWSPAPER</div></header>
        <div class="np-dateline"><span>${esc(n.date)}</span><span>WEATHER: HOT, HUMID · HIGH 94</span><span>${esc(n.price)} IN CITY LIMITS</span></div>
        <h2 class="np-head">${esc(n.headline)}</h2><div class="np-deck">${esc(n.deck)}</div>
        <div class="np-cols">${n.stories.map((s) => `<section><h3>${esc(s.head)}</h3><p>${esc(s.body)}</p></section>`).join('')}
          <section class="np-ads"><h3>CLASSIFIED</h3>${n.ads.map((a, i) => `<button class="np-ad${this.onMap(a.placeId) ? ' known' : ''}" data-i="${i}">${esc(a.text)}${this.mark(a.placeId)}</button>`).join('')}</section></div>
      </article>`;
    } else if (this.page === 'classifieds') {
      const cols: [ClassifiedAd['kind'], string][] = [['car', 'Cars'], ['room', 'Rooms'], ['job', 'Help wanted'], ['misc', 'Misc']];
      sheet = `<article class="np-sheet cl-sheet"><header class="cl-mast"><h2>CLASSIFIED</h2><span>Read it, call it, clip it · 20 words or less</span></header>
      <div class="cl-grid">${cols.map(([k, h]) => `<section class="cl-col"><h3>${h}</h3>${ads.filter((a) => a.kind === k).map((a) => `<button class="cl-ad${this.onMap(a.placeId) ? ' known' : ''}" data-id="${esc(a.id)}"><span class="tx">${esc(a.text)}</span> <b class="pr">${money(a.price, false)}${k === 'room' || k === 'job' ? '/wk' : ''}</b> <span class="ph">${esc(a.phone)}</span>${this.mark(a.placeId)}</button>`).join('') || '<p class="cl-none">No listings today.</p>'}</section>`).join('')}</div>
      <div class="cl-foot">All ads payable in advance. The Courier is not responsible for errors after first insertion.</div></article>`;
    } else {
      sheet = `<article class="np-sheet inside">
        <div class="np-cols two"><section><h3>AT THE TRACK</h3><table class="np-table">${n.races.map((r) => `<tr><td>${esc(r.track)} · ${r.race}th</td><td><b>${esc(r.winner)}</b></td><td>${esc(r.odds)}</td></tr>`).join('')}</table>
          <h3 style="margin-top:18px">YESTERDAY'S HANDLE</h3><p class="np-small">Everybody on the block knows the number comes off the last three digits of the ${esc(n.number.source.replace(/^last three digits of the /, ''))}. Nobody prints it as such.</p>
          <div class="np-number"><span>${esc(n.number.date)}</span><b>${esc(n.number.digits)}</b></div></section>
        <section class="np-mimeo"><div class="mimeo-h">WANTED THIS WEEK</div><div class="mimeo-sub">(don't ask, don't bring it hot past Tuesday)</div>
          <table>${n.chopList.map((c) => `<tr><td>${esc(c.cls)}</td><td>${esc(c.colour)}</td><td>${esc(c.condition)}</td><td>${money(c.pays, false)}</td></tr>`).join('')}</table>
          <div class="mimeo-foot">— S.</div></section></div></article>`;
    }
    this.el.innerHTML = `${rail}<div class="np-desk">${sheet}</div>`;
    const side = this.el.querySelector('.np-side') as HTMLElement;
    this.el.querySelectorAll<HTMLElement>('.np-pages button').forEach((b) => items.push({ el: b, activate: () => { this.page = b.dataset.p as Page; this.render(); } }));

    const count = (known: number, of: number, what: string) => `<div class="np-count"><b class="a-num">${known}<small> / ${of}</small></b><span>${what}</span></div>`;
    if (this.page === 'front') {
      const placed = n.ads.filter((a) => a.placeId);
      side.innerHTML = `${count(placed.filter((a) => this.onMap(a.placeId)).length, placed.length, 'ads with an address on your map')}<p>Pick an ad to add the place to your map.</p>`;
      this.el.querySelectorAll<HTMLElement>('.np-ad').forEach((b) => {
        const a = n.ads[+b.dataset.i!];
        items.push({ el: b, activate: () => { if (!a.placeId) return; this.addToMap(a.placeId); this.render(); } });
      });
    } else if (this.page === 'classifieds') {
      const placed = ads.filter((a) => a.placeId);
      side.innerHTML = `${count(placed.filter((a) => this.onMap(a.placeId)).length, placed.length, 'addresses on your map')}<p>Rooms and jobs with an address go on your map. For a car, call the number from a payphone.</p>`;
      this.el.querySelectorAll<HTMLElement>('.cl-ad').forEach((b) => {
        const a = ads.find((x) => x.id === b.dataset.id)!;
        items.push({ el: b, activate: () => {
          if (a.kind === 'car') this.onToast?.('Call from a payphone to arrange a look');
          if (!a.placeId) return;
          if (a.kind === 'car') this.model.discovery.reveal(a.placeId, 'news'); else this.addToMap(a.placeId);
          this.render();
        } });
      });
    } else {
      // the runner's slip is UI, not print: the paper never prints the number as such
      side.innerHTML = `<div class="np-slip"><span class="a-label">Play tomorrow's number</span><div class="digits"></div>
        <small class="tip">Change a digit: tap it, or up and down</small><div class="stake"></div><p>With a runner. Pays 600 to 1, less his end.</p></div>`;
      const digits = side.querySelector('.digits')!, stake = side.querySelector('.stake')!;
      const d = this.digits;
      d.forEach((v, i) => {
        const b = document.createElement('button'); b.className = 'np-digit'; b.textContent = String(v); digits.appendChild(b);
        const set = (dv: number) => { d[i] = (d[i] + dv + 10) % 10; b.textContent = String(d[i]); };
        items.push({ el: b, activate: () => set(1), inc: () => set(1), dec: () => set(-1) });
      });
      for (const s of [0.5, 1, 5]) {
        const b = document.createElement('button'); b.className = 'u-btn np-stake'; b.innerHTML = `<small>Bet</small>${money(s)}`; stake.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'betNumber', digits: d.join(''), stake: s }); this.onToast?.(r.text ?? ''); } });
      }
    }
    this.setNav(items, true);
  }
}
