/**
 * The map tab of the pause hub: the folding map, a printed legend that doubles as the filter list,
 * a dark info panel for the selected place, and waypoint actions. Fully usable by touch alone.
 */
import { AerialMap } from '../map/AerialMap';
import { icon, type IconName } from '../icons';
import { FoldingMap, type FoldingMapSelection } from '../map/FoldingMap';
import type { MapModel } from '../map/MapModel';
import { CATEGORIES, FILTER_GROUPS, type Place, type RevealVia } from '../map/places';
import { pictogramURL } from '../map/pictograms';
import type { UiHost } from '../host/types';
import type { NavItem } from '../MenuNav';
import { esc, gameTime } from '../util';
import { windowLabel } from './TimeScreens';

const VIA: Record<RevealVia, string> = {
  sight: 'You walked past it', enter: 'You went inside', tip: 'Somebody told you', overheard: 'You overheard it', news: 'An ad in the paper',
  call: 'A phone call', card: 'From a business card', mission: 'The job took you there', start: 'You live here',
};
const GROUP_ICON: Record<string, Place['cat']> = { story: 'mission', yours: 'home', eat: 'food', shop: 'shop', travel: 'subway', services: 'service', work: 'job', trouble: 'callbox' };

export class MapScreen {
  readonly el = document.createElement('div');
  readonly map: FoldingMap;
  private side = document.createElement('div');
  private card = document.createElement('div');
  private btns = document.createElement('div');
  onToast?: (t: string) => void;
  /** Called with nav items whenever the focusable set changes (the hub owns MenuNav). */
  private credit = document.createElement('div');
  onNav?: (items: NavItem[]) => void;

  constructor(private host: UiHost, private model: MapModel, heroes: { name: string; x: number; z: number }[]) {
    this.el.className = 't74-mapscreen';
    this.map = new AerialMap(model, host.streets, heroes); (this.map as AerialMap).baseUrl = host.baseUrl;
    this.side.className = 't74-mapside';
    this.card.className = 't74-card'; this.card.style.display = 'none';
    this.btns.className = 't74-mapbtns';
    // ODbL: the map is drawn from OpenStreetMap data, so it carries the credit (an imprint line, like a printed guide's)
    this.credit.className = 't74-mapcredit';
    this.credit.innerHTML = 'Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>, ODbL · NYC Open Data';
    // DESIGN_A: one slim panel holds the selected place, the legend (filters), the tools and the data credit
    this.el.append(this.map.canvas, this.side);
    addEventListener('resize', () => { if (this.el.offsetParent) { this.measureOccluders(); this.map.draw(true); } });
    this.map.onSelect = (s) => this.select(s);
  }

  open() {
    const p = this.host.player();
    this.map.player = { x: p.x, z: p.z, yaw: p.heading ?? p.yaw, lead: p.lead };
    const leads = this.host.party();
    for (const pl of this.model.discovery.known()) if (pl.cat === 'home' && pl.lead) this.map.ownerNotes[pl.id] = `${leads.find((l) => l.id === pl.lead)?.short ?? ''}'s place`;
    this.map.owned = new Set(this.host.businesses().filter((b) => b.owner).map((b) => b.id.replace('biz.', 'ui.forsale.')));
    this.map.missions = this.host.missionMarkers?.() ?? [];
    this.map.centerOn(p.x, p.z, Math.max(this.map.zoom, 0.42));
    this.card.style.display = 'none';
    this.renderSide();
    this.measureOccluders();
    this.map.draw(true);
  }

  /** Screen areas the map's own UI covers (measured on open and resize, never per frame). */
  measureOccluders() {
    const c = this.map.canvas.getBoundingClientRect();
    this.map.occluders = [this.side, this.btns, this.card, this.credit].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4] as [number, number, number, number]; });
  }

  private renderSide() {
    const known = this.model.discovery.known();
    const c = this.model.discovery.counts;
    const items: NavItem[] = [];
    this.side.innerHTML = '';
    this.side.appendChild(this.card);
    this.side.insertAdjacentHTML('beforeend', `<header class="ms-head"><b>Legend</b><span>${c.known} known${c.fresh ? ` · <em>${c.fresh} new</em>` : ''}</span></header>`);
    for (const f of FILTER_GROUPS) {
      const n = known.filter((p) => CATEGORIES[p.cat].group === f.id).length;
      const b = document.createElement('button');
      b.className = `t74-filter${this.model.filters.has(f.id) ? '' : ' off'}`;
      b.innerHTML = `${icon(GROUP_ICON[f.id] as IconName, 18)}<span class="l">${f.label}</span><span class="n">${n}</span>`;
      b.title = f.label; b.setAttribute('aria-label', `${f.label}: ${n}`);
      b.setAttribute('aria-pressed', String(this.model.filters.has(f.id)));
      const act = () => { this.model.toggleFilter(f.id); this.renderSide(); };
      this.side.appendChild(b); items.push({ el: b, activate: act });
    }
    this.side.insertAdjacentHTML('beforeend', `<div class="ms-fog"><i></i>Not yet explored</div>`);
    this.btns.innerHTML = ''; this.side.appendChild(this.btns);
    const mk = (ic: IconName, label: string, fn: () => void) => { const b = document.createElement('button'); b.innerHTML = `${icon(ic, 16)}<span>${label}</span>`; this.btns.appendChild(b); items.push({ el: b, activate: fn }); return b; };
    mk('objective', 'Me', () => { const p = this.host.player(); this.map.centerOn(p.x, p.z, 0.6); });
    if (this.model.waypoint) mk('close', 'Route', () => { this.setWaypoint(null); });
    this.side.appendChild(this.credit);
    this.onNav?.(items);
  }

  private setWaypoint(at: { x: number; z: number } | null) {
    const p = this.host.player();
    this.model.setWaypoint(at, { x: p.x, z: p.z, inVehicle: p.inVehicle });
    this.host.act({ kind: 'waypoint', at });
    if (at && !this.model.route) this.onToast?.('No way through from here.');
    this.card.style.display = 'none';
    this.renderSide();
  }

  private select(s: FoldingMapSelection) {
    const c = this.card; c.style.display = '';
    const acts: [string, () => void][] = [];
    if (s.mission) {
      const ms = s.mission;
      c.innerHTML = `<div class="cat"><img alt="" src="${pictogramURL('mission', 18, 'print')}">STORY</div><h3>${esc(ms.title)}</h3>
        ${ms.window ? `<div class="u-window">${esc(windowLabel(ms.window[0], ms.window[1]))}</div>` : ''}
        ${ms.blurb ? `<div style="margin-top:6px">${esc(ms.blurb)}</div>` : ''}<div class="acts"></div>`;
      acts.push(['SET WAYPOINT', () => this.setWaypoint({ x: ms.x, z: ms.z })]);
    } else if (s.place) {
      const p = s.place, e = this.model.discovery.entry(p.id);
      c.innerHTML = `<div class="cat"><img alt="" src="${pictogramURL(p.cat, 18, 'print')}">${esc(CATEGORIES[p.cat].label)}</div>
        <h3>${esc(p.name)}</h3><div class="addr">${esc(p.address)}${p.hours ? ` · ${esc(p.hours)}` : ''}</div>
        ${p.blurb ? `<div style="margin-top:6px">${esc(p.blurb)}</div>` : ''}
        ${e ? `<div class="found">${VIA[e.via]}${e.via === 'start' ? '' : ` · ${gameTime(e.at)}`}.</div>` : ''}
        ${p.placeholder ? '<div class="ph">Stand-in business: interiors and narrative will name the real one.</div>' : ''}<div class="acts"></div>`;
      acts.push(['SET WAYPOINT', () => this.setWaypoint({ x: p.x, z: p.z })]);
    } else if (s.at) {
      const at = s.at;
      const n = this.nearestCorner(at.x, at.z);
      c.innerHTML = `<div class="cat">A SPOT ON THE MAP</div><h3>${esc(n)}</h3><div class="acts"></div>`;
      acts.push(['SET WAYPOINT', () => this.setWaypoint(at)]);
      acts.push(['CIRCLE IT', () => { this.model.annotations.push({ x: at.x, z: at.z, mark: 'circle' }); this.model.version++; c.style.display = 'none'; }]);
    }
    if (this.model.annotations.length) acts.push(['RUB OUT MY MARKS', () => { this.model.annotations = []; this.model.version++; c.style.display = 'none'; }]);
    acts.push(['CLOSE', () => { c.style.display = 'none'; this.renderSide(); }]);
    const box = c.querySelector('.acts')!;
    requestAnimationFrame(() => { this.measureOccluders(); this.map.draw(true); });
    const items: NavItem[] = acts.map(([l, fn]) => { const b = document.createElement('button'); b.textContent = l; box.appendChild(b); return { el: b, activate: fn }; });
    this.onNav?.(items);
  }

  private nearestCorner(x: number, z: number) {
    const near = (re: RegExp) => { let best = Infinity, n = ''; for (const s of this.host.streets) if (re.test(s.n)) for (let k = 0; k < s.p.length; k += 2) { const d = Math.hypot(s.p[k] - x, s.p[k + 1] - z); if (d < best) { best = d; n = s.n; } } return n; };
    const st = near(/Street$/).replace(/^West /, 'W. ').replace(/^East /, 'E. '), av = near(/Avenue$|^Broadway$/).replace('Avenue', 'Ave.');
    return `Near ${av} & ${st}`;
  }

  update(dt: number) { this.map.update(dt, this.host.input); }
  get cardOpen() { return this.card.style.display !== 'none'; }
  closeCard() { this.card.style.display = 'none'; this.renderSide(); this.measureOccluders(); this.map.draw(true); }
}
