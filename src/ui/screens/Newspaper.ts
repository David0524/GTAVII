/**
 * The newspaper (ECONOMY: weekly results, the daily number, the chop list, headlines, prices).
 * An invented evening tabloid laid out as a real front page: masthead, banner headline, deck, three
 * columns; the inside page carries the track results and the number; the chop shop's wanted list is
 * a mimeographed sheet tucked inside (the paper wouldn't print it). Classified ads can pencil a place
 * onto your map (discovery via 'news'). Bet on the number from here.
 */
import type { UiHost, ClassifiedAd } from '../host/types';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import type { MapModel } from '../map/MapModel';
import { esc, money } from '../util';

export class Newspaper implements Tab {
  id = 'paper'; label = 'PAPER';
  el = document.createElement('div');
  hint = 'Tap an ad to add it to your map';
  private page: 'front' | 'inside' | 'classifieds' = 'front';
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;

  constructor(private host: UiHost, private model: MapModel) { this.el.className = 'u-scroll u-paperwrap'; }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }

  private render() {
    const n = this.host.newspaper();
    const items: NavItem[] = [];
    if (!n) { this.el.innerHTML = '<p class="hint" style="padding:30px">No paper today. Newsstands open at 5 AM.</p>'; this.setNav([]); return; }
    const tabs = `<div class="np-pages"><button data-p="front" class="${this.page === 'front' ? 'on' : ''}">Front page</button><button data-p="inside" class="${this.page === 'inside' ? 'on' : ''}">Results & the number</button><button data-p="classifieds" class="${this.page === 'classifieds' ? 'on' : ''}">Classifieds</button></div>`;
    if (this.page === 'front') {
      this.el.innerHTML = `${tabs}<article class="np-sheet">
        <header class="np-mast"><div class="ear l">${esc(n.edition)}<br>${esc(n.price)}</div><h1>${esc(n.masthead)}</h1><div class="ear r">NEW YORK'S PICTURE<br>NEWSPAPER</div></header>
        <div class="np-dateline"><span>${esc(n.date)}</span><span>WEATHER: HOT, HUMID · HIGH 94</span><span>${esc(n.price)} IN CITY LIMITS</span></div>
        <h2 class="np-head">${esc(n.headline)}</h2><div class="np-deck">${esc(n.deck)}</div>
        <div class="np-cols">${n.stories.map((s) => `<section><h3>${esc(s.head)}</h3><p>${esc(s.body)}</p></section>`).join('')}
          <section class="np-ads"><h3>CLASSIFIED</h3>${n.ads.map((a, i) => `<button class="np-ad" data-i="${i}">${esc(a.text)}${a.placeId && this.model.discovery.isKnown(a.placeId) ? '<i>✓ on your map</i>' : ''}</button>`).join('')}</section></div>
      </article>`;
      this.el.querySelectorAll<HTMLElement>('.np-ad').forEach((b) => {
        const a = n.ads[+b.dataset.i!];
        items.push({ el: b, activate: () => {
          if (!a.placeId) return;
          const ok = this.model.discovery.reveal(a.placeId, 'news');
          const p = this.model.discovery.place(a.placeId);
          this.onToast?.(ok ? `Added to map · ${p?.name ?? 'the address'}` : 'Already on your map');
          this.render();
        } });
      });
    } else if (this.page === 'classifieds') {
      this.classifieds(tabs, items);
    } else {
      this.el.innerHTML = `${tabs}<article class="np-sheet inside">
        <div class="np-cols two"><section><h3>AT THE TRACK</h3><table class="np-table">${n.races.map((r) => `<tr><td>${esc(r.track)} · ${r.race}th</td><td><b>${esc(r.winner)}</b></td><td>${esc(r.odds)}</td></tr>`).join('')}</table>
          <h3 style="margin-top:18px">YESTERDAY'S HANDLE</h3><p class="np-small">Everybody on the block knows the number comes off the last three digits of the ${esc(n.number.source.replace(/^last three digits of the /, ''))}. Nobody prints it as such.</p>
          <div class="np-number"><span>${esc(n.number.date)}</span><b>${esc(n.number.digits)}</b></div>
          <div class="np-bet"><div class="np-small">Play tomorrow's number with a runner (pays 600 to 1, less his end):</div><div class="digits"></div><div class="stake"></div></div></section>
        <section class="np-mimeo"><div class="mimeo-h">WANTED THIS WEEK</div><div class="mimeo-sub">(don't ask, don't bring it hot past Tuesday)</div>
          <table>${n.chopList.map((c) => `<tr><td>${esc(c.cls)}</td><td>${esc(c.colour)}</td><td>${esc(c.condition)}</td><td>${money(c.pays, false)}</td></tr>`).join('')}</table>
          <div class="mimeo-foot">— S.</div></section></div></article>`;
      const digits = this.el.querySelector('.digits')!, stake = this.el.querySelector('.stake')!;
      const d = [1, 7, 4];
      d.forEach((v, i) => {
        const b = document.createElement('button'); b.className = 'np-digit'; b.textContent = String(v); digits.appendChild(b);
        const set = (dv: number) => { d[i] = (d[i] + dv + 10) % 10; b.textContent = String(d[i]); };
        items.push({ el: b, activate: () => set(1), inc: () => set(1), dec: () => set(-1) });
      });
      for (const s of [0.5, 1, 5]) {
        const b = document.createElement('button'); b.className = 'u-btn'; b.textContent = `Bet ${money(s)}`; stake.appendChild(b);
        items.push({ el: b, activate: () => { const r = this.host.act({ kind: 'betNumber', digits: d.join(''), stake: s }); this.onToast?.(r.text ?? ''); } });
      }
    }
    this.el.querySelectorAll<HTMLElement>('.np-pages button').forEach((b) => items.unshift({ el: b, activate: () => { this.page = b.dataset.p as 'front' | 'inside' | 'classifieds'; this.render(); } }));
    this.setNav(items, true);
  }

  /** Page three: the classified grid. Car ads say to call from a payphone; ads with a place add it to the map. */
  private classifieds(tabs: string, items: NavItem[]) {
    const ads = this.host.classifieds?.() ?? [];
    const cols: [ClassifiedAd['kind'], string][] = [['car', 'Cars'], ['room', 'Rooms'], ['job', 'Help wanted'], ['misc', 'Misc']];
    this.el.innerHTML = `${tabs}<article class="np-sheet cl-sheet"><header class="cl-mast"><h2>CLASSIFIED</h2><span>Read it, call it, find it · 20 words or less</span></header>
      <div class="cl-grid">${cols.map(([k, h]) => `<section class="cl-col"><h3>${h}</h3>${ads.filter((a) => a.kind === k).map((a) => `<button class="cl-ad" data-id="${esc(a.id)}"><span class="tx">${esc(a.text)}</span> <b class="pr">${money(a.price, false)}${k === 'room' ? '/wk' : k === 'job' ? '/wk' : ''}</b> <span class="ph">${esc(a.phone)}</span>${a.placeId && this.model.discovery.isKnown(a.placeId) ? '<i>✓ on your map</i>' : ''}</button>`).join('') || '<p class="cl-none">No listings today.</p>'}</section>`).join('')}</div>
      <div class="cl-foot">All ads payable in advance. The Courier is not responsible for errors after first insertion.</div></article>`;
    this.el.querySelectorAll<HTMLElement>('.cl-ad').forEach((b) => {
      const a = ads.find((x) => x.id === b.dataset.id)!;
      items.push({ el: b, activate: () => {
        if (a.kind === 'car') this.onToast?.('Call from a payphone to arrange a look');
        if (!a.placeId) return;
        const ok = this.model.discovery.reveal(a.placeId, 'news');
        const p = this.model.discovery.place(a.placeId);
        if (a.kind !== 'car') this.onToast?.(ok ? `Added to map · ${p?.name ?? 'the address'}` : 'Already on your map');
        this.render();
      } });
    });
  }
}
