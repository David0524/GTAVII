/**
 * The minimap: a heading-up window onto the same printed street guide as the pause map.
 *  - Base: paper, inked streets and 1974 one-way ticks, rendered lazily into 256 m tiles at the
 *    card's device resolution (LRU), so it is crisp on phones and costs a few drawImage calls a frame.
 *    The paper ends in a deckled edge at the playable boundary; beyond it is the table top.
 *  - World layer (same transform as the base): pencilled route, waypoint cross, police search cones
 *    and the search area (heat shown only here and through the radio: no stars). Redrawn only when
 *    its content changes (at most 10 Hz during a pursuit).
 *  - Screen layer as DOM: discovered places as upright period pictograms ("new" ones ringed in red
 *    pencil), the objective star pinned to the rim when off-card, the N tick and the player arrow.
 * Per frame the main thread writes a few CSS transforms and rasterises nothing; the compositor rotates
 * the layers. Budget: HUD + minimap <= 0.5 ms CPU per frame on mobile Low (UI_PROGRESS has the numbers).
 */
import { PLAYABLE } from '../../shared/bounds';
import { playablePath } from './playablePath';
import type { StreetRec } from './grid';
import type { MapModel } from './MapModel';
import type { HeatView, ObjectiveView } from '../host/types';
import { iconSprite, type IconName } from '../icons';
import { loadAerial, drawAerial, onAerialTile, type AerialManifest } from './aerialTiles';
import { PAPER, PAPER_SHADE, INK, TABLE } from './ink';

const TILE_M = 256;
const MARGIN = 60; // printed margin beyond the playable edge

/** Meaning-only blip colour (DESIGN_A §5). */
const MM_COLOUR: Partial<Record<string, string>> = { mission: '#e8a317', home: '#e8a317', safehouse: '#e8a317', property: '#e8a317', crime: '#ef7a64', callbox: '#ef7a64', police: '#9cc0ee', hospital: '#ef7a64' };

export interface MiniMapFrame { x: number; z: number; yaw: number; heading?: number; speed: number; inVehicle: boolean; heat: HeatView; objective: ObjectiveView | null; t: number }

export class MiniMap {
  readonly el = document.createElement('div');
  /** World overlay layer (route, waypoint, cones), aligned with the base window. */
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private screen = document.createElement('div');
  private icons = new Map<string, HTMLElement>();
  private player = document.createElement('div');
  private north = document.createElement('div');
  private star = document.createElement('div');
  private overlayKey = '';
  private overlayT = 0;
  private w = 0; private h = 0; private dpr = 1;
  private tiles = new Map<string, HTMLCanvasElement>();
  private aerial: { m: AerialManifest; base: string } | null = null;
  private tilesPending = false;
  private tileOrder: string[] = [];
  private tilePx = 0;
  private pxPerM = 0;
  rangeM = 150; // half-height of the card in metres
  private zoomTarget = 150;
  private bboxes: Float32Array;
  private newSeenTimer = new Map<string, number>();
  /** Timings for the perf budget (ms, exponential moving average) and how many frames were skipped. */
  readonly cost = { draw: 0, tiles: 0, skipped: 0, drawn: 0 };
  /** 3x3-tile composite around the player; rebuilt only when the centre tile or scale changes. */
  private win = document.createElement('canvas');
  private winKey = '';
  private ro: ResizeObserver;

  constructor(private model: MapModel, private streets: StreetRec[]) {
    void loadAerial(import.meta.env.BASE_URL).then((x) => { this.aerial = x; this.tiles.clear(); this.tileOrder = []; this.winKey = ''; });
    onAerialTile(() => { if (this.tilesPending) { this.tilesPending = false; this.winKey = ''; } });
    this.el.className = 't74-minimap';
    this.win.className = 't74-mm-base'; this.canvas.className = 't74-mm-base';
    this.screen.className = 't74-mm-screen';
    this.player.className = 't74-mm-player'; this.player.innerHTML = '<svg viewBox="-9 -10 18 20"><path d="M0-8L6 7 0 3.5-6 7z" fill="#f2ede3" stroke="#0a0a09" stroke-width="1.8" stroke-linejoin="miter"/></svg>';
    this.north.className = 't74-mm-n'; this.north.textContent = 'N';
    this.star.className = 't74-mm-star'; this.star.innerHTML = '<b></b><i></i>';
    this.screen.append(this.star, this.player, this.north);
    this.el.append(this.win, this.canvas, this.screen);
    this.g = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver((e) => { const r = e[0].contentRect; this.measured = { w: r.width, h: r.height }; });
    this.ro.observe(this.el);
    this.bboxes = new Float32Array(streets.length * 4);
    streets.forEach((s, i) => {
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let k = 0; k < s.p.length; k += 2) { x0 = Math.min(x0, s.p[k]); x1 = Math.max(x1, s.p[k]); z0 = Math.min(z0, s.p[k + 1]); z1 = Math.max(z1, s.p[k + 1]); }
      this.bboxes.set([x0 - s.w, z0 - s.w, x1 + s.w, z1 + s.w], i * 4);
    });
  }

  private measured = { w: 0, h: 0 };
  /** Size comes from a ResizeObserver: no forced layout in the frame loop. */
  private fit() {
    const r = { width: this.measured.w, height: this.measured.h };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (r.width === this.w && r.height === this.h && dpr === this.dpr) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.pxPerM = 0; // invalidate tiles
  }

  /** Tile scale follows zoom in steps so tiles are reused while zooming slightly. */
  private ensureScale() {
    const want = (this.h / 2 / this.rangeM) * this.dpr; // device px per metre
    const q = Math.pow(2, Math.round(Math.log2(want) * 2) / 2);
    if (q !== this.pxPerM) { this.pxPerM = q; this.tilePx = Math.ceil(TILE_M * q); this.tiles.clear(); this.tileOrder = []; this.winKey = ''; }
  }

  private tile(i: number, j: number): HTMLCanvasElement {
    const key = `${i},${j}`;
    let c = this.tiles.get(key);
    if (c) return c;
    const t0 = performance.now();
    c = document.createElement('canvas'); c.width = c.height = this.tilePx;
    const g = c.getContext('2d')!, s = this.pxPerM, ox = i * TILE_M, oz = j * TILE_M;
    const X = (x: number) => (x - ox) * s, Z = (z: number) => (z - oz) * s;
    g.fillStyle = TABLE; g.fillRect(0, 0, c.width, c.height);
    g.save();
    g.beginPath(); g.rect(X(PLAYABLE.minX - MARGIN), Z(PLAYABLE.minZ - MARGIN), (PLAYABLE.maxX - PLAYABLE.minX + 2 * MARGIN) * s, (PLAYABLE.maxZ - PLAYABLE.minZ + 2 * MARGIN) * s);
    g.fillStyle = PAPER; g.fill(); g.clip();
    // the printed area (playable) a touch darker than the margin, like a street-guide plate
    g.fillStyle = PAPER_SHADE; g.beginPath(); playablePath(g, X, Z); g.fill();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const x0 = ox - 40, z0 = oz - 40, x1 = ox + TILE_M + 40, z1 = oz + TILE_M + 40;
    for (const pass of [0, 1]) for (let k = 0; k < this.streets.length; k++) {
      const b = this.bboxes; if (b[k * 4] > x1 || b[k * 4 + 2] < x0 || b[k * 4 + 1] > z1 || b[k * 4 + 3] < z0) continue;
      const st = this.streets[k];
      const major = st.w >= 15;
      g.strokeStyle = pass === 0 ? INK : '#ffffff';
      g.lineWidth = Math.max(1, st.w * s * (major ? 1.1 : 1)) + (pass === 0 ? 1.4 * this.dpr : 0);
      g.beginPath(); for (let q = 0; q < st.p.length; q += 2) (q ? g.lineTo : g.moveTo).call(g, X(st.p[q]), Z(st.p[q + 1])); g.stroke();
    }
    // one-way ticks (1974 table)
    g.fillStyle = 'rgba(60,60,60,.6)';
    for (let k = 0; k < this.streets.length; k++) {
      const st = this.streets[k]; if (!st.o) continue;
      const b = this.bboxes; if (b[k * 4] > x1 || b[k * 4 + 2] < x0 || b[k * 4 + 1] > z1 || b[k * 4 + 3] < z0) continue;
      for (let q = 2; q < st.p.length; q += 2) {
        const ax = st.p[q - 2], az = st.p[q - 1], dx = st.p[q] - ax, dz = st.p[q + 1] - az, L = Math.hypot(dx, dz); if (L < 30) continue;
        const ux = dx / L * st.o, uz = dz / L * st.o;
        for (let t = 15; t < L - 8; t += 45) {
          const cx = X(ax + dx * t / L), cz = Z(az + dz * t / L), a = 2.6 * this.dpr;
          g.beginPath(); g.moveTo(cx + ux * a * 1.5, cz + uz * a * 1.5); g.lineTo(cx - ux * a - uz * a, cz - uz * a + ux * a); g.lineTo(cx - ux * a + uz * a, cz - uz * a - ux * a); g.fill();
        }
      }
    }
    g.restore();
    // direction A: the same aerial as the pause map, over the vector fallback (an incomplete tile is redrawn when its images land)
    if (this.aerial) {
      const done = drawAerial(g, this.aerial, ox, oz, ox + TILE_M, oz + TILE_M, s);
      g.fillStyle = 'rgba(8,8,7,.55)'; g.save(); g.beginPath(); g.rect(0, 0, c.width, c.height);
      playablePath(g, X, Z); g.clip('evenodd'); g.fillRect(0, 0, c.width, c.height); g.restore();
      if (!done) { this.tilesPending = true; this.cost.tiles = performance.now() - t0; return c; } // not cached: retried next pass
    }
    this.tiles.set(key, c); this.tileOrder.push(key);
    if (this.tileOrder.length > 40) this.tiles.delete(this.tileOrder.shift()!);
    this.cost.tiles = performance.now() - t0;
    return c;
  }

  /** Draw a frame: positions layers; rasterises only when content changed. */
  draw(f: MiniMapFrame, dt: number) {
    const t0 = performance.now();
    this.fit();
    if (!this.w) return;
    this.zoomTarget = f.inVehicle ? 230 + Math.min(120, f.speed * 4) : f.heat.phase === 'pursuit' ? 190 : 140;
    this.rangeM += (this.zoomTarget - this.rangeM) * Math.min(1, dt * 1.5);
    this.ensureScale();
    const W = this.w, H = this.h, dpr = this.dpr, s = this.pxPerM, cx = W / 2, cy = H * 0.58;
    const k = (H / 2) / this.rangeM; // world m -> CSS px
    const cos = Math.cos(f.yaw), sin = Math.sin(f.yaw);
    const toScreen = (x: number, z: number): [number, number] => { const dx = (x - f.x) * k, dz = (z - f.z) * k; return [cx + dx * cos - dz * sin, cy + dx * sin + dz * cos]; };

    // ---- base window (3x3 tiles) and the world overlay share one transform
    const ci = Math.floor(f.x / TILE_M), cj = Math.floor(f.z / TILE_M), tp = this.tilePx, wk = `${ci},${cj},${tp}`;
    if (wk !== this.winKey) {
      this.winKey = wk; this.overlayKey = '';
      if (this.win.width !== tp * 3) { this.win.width = this.win.height = tp * 3; this.canvas.width = this.canvas.height = tp * 3; }
      const wg = this.win.getContext('2d')!;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) wg.drawImage(this.tile(ci + i, cj + j), (i + 1) * tp, (j + 1) * tp);
    }
    this.prefetch(ci, cj);
    const ox0 = (ci - 1) * TILE_M, oz0 = (cj - 1) * TILE_M, scale = k / s;
    const tf = `translate(${cx.toFixed(2)}px,${cy.toFixed(2)}px) rotate(${f.yaw.toFixed(4)}rad) scale(${scale.toFixed(5)}) translate(${((ox0 - f.x) * s).toFixed(2)}px,${((oz0 - f.z) * s).toFixed(2)}px)`;
    this.win.style.transform = tf; this.canvas.style.transform = tf;

    // ---- world overlay: redraw on change (route, waypoint, heat), heat at most 10 Hz
    const m = this.model, heat = f.heat;
    const heatKey = heat.phase === 'none' ? '' : `${heat.phase}|${heat.cones.map((c) => `${c.x | 0},${c.z | 0},${c.dir.toFixed(1)},${+c.seeing}`).join(';')}|${heat.units.map((u) => `${u.x | 0},${u.z | 0}`).join(';')}|${heat.searchArea?.r ?? ''}`;
    const okey = `${wk}|${m.version}|${heatKey}|${(s / k).toFixed(1)}`;
    this.overlayT -= dt;
    if (okey !== this.overlayKey && (this.overlayT <= 0 || !heatKey)) {
      this.overlayKey = okey; this.overlayT = 0.1; this.drawWorldOverlay(ox0, oz0, heat, s / k);
    }

    // ---- screen layer (DOM): pictograms upright, "new" rings, star, N, player
    const seenNow: string[] = [], rr = this.rangeM * 1.5, live = new Set<string>();
    for (const p of m.knownNear(f.x, f.z, rr)) {
      const [sx, sy] = toScreen(p.x, p.z);
      if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
      live.add(p.id);
      let e = this.icons.get(p.id);
      if (!e) {
        e = document.createElement('div'); e.className = 't74-mm-icon';
        const spr = iconSprite(p.cat as IconName, 14, dpr, { colour: MM_COLOUR[p.cat] }); const c = document.createElement('canvas'); c.width = spr.width; c.height = spr.height; c.getContext('2d')!.drawImage(spr, 0, 0);
        c.style.width = `${spr.width / dpr}px`; e.appendChild(c); this.screen.insertBefore(e, this.star); this.icons.set(p.id, e);
      }
      const isNew = m.discovery.isNew(p.id);
      if (e.classList.contains('new') !== isNew) e.classList.toggle('new', isNew);
      e.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
      if (e.style.display) e.style.display = '';
      if (isNew) { const tt = (this.newSeenTimer.get(p.id) ?? 0) + dt; this.newSeenTimer.set(p.id, tt); if (tt > 6) seenNow.push(p.id); }
    }
    for (const [id, e] of this.icons) if (!live.has(id) && e.style.display !== 'none') e.style.display = 'none';
    if (seenNow.length) m.discovery.markSeen(seenNow);

    if (f.objective?.target) {
      const raw = toScreen(f.objective.target.x, f.objective.target.z), [sx, sy] = this.clampToCard(raw, W, H, 11);
      const off = raw[0] !== sx || raw[1] !== sy;
      this.star.style.display = '';
      this.star.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
      const arw = this.star.firstElementChild as HTMLElement; arw.style.display = off ? '' : 'none'; if (off) arw.style.transform = `rotate(${Math.atan2(raw[1] - sy, raw[0] - sx).toFixed(3)}rad)`;
    } else if (this.star.style.display !== 'none') this.star.style.display = 'none';
    const [nx, ny] = this.clampToCard(toScreen(f.x, f.z - 10000), W, H, 9);
    this.north.style.transform = `translate(${nx.toFixed(1)}px,${ny.toFixed(1)}px)`;
    // the map turns with the camera; the arrow shows where the body faces, so circling the camera swings the arrow (GTA-style)
    this.player.style.transform = `translate(${cx}px,${cy}px) rotate(${(f.yaw - (f.heading ?? f.yaw)).toFixed(4)}rad)`;

    const ms = performance.now() - t0;
    this.cost.draw = this.cost.draw ? this.cost.draw * 0.95 + ms * 0.05 : ms; this.cost.drawn++;
  }

  private prefetching = false;
  /** Render the 5x5 ring of tiles around the player in idle time, one tile per idle slice, so crossing
   *  a tile boundary never renders vector streets inside a frame. */
  private prefetch(ci: number, cj: number) {
    if (this.prefetching) return;
    const missing: [number, number][] = [];
    for (let r = 1; r <= 2; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r && !this.tiles.has(`${ci + i},${cj + j}`)) missing.push([ci + i, cj + j]);
    if (!missing.length) return;
    this.prefetching = true;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 30));
    const step = () => { const t = missing.shift(); if (t) this.tile(t[0], t[1]); if (missing.length) ric(step, { timeout: 500 }); else this.prefetching = false; };
    ric(step, { timeout: 500 });
  }

  /** Route, waypoint and police marks in window pixel space (tile px), aligned with the base layer. */
  private drawWorldOverlay(ox0: number, oz0: number, heat: HeatView, px: number) {
    // px: tile pixels per CSS pixel on screen, so strokes keep their on-screen width at any zoom
    const g = this.g, s = this.pxPerM, d = px;
    const X = (x: number) => (x - ox0) * s, Z = (z: number) => (z - oz0) * s;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const m = this.model, lim = TILE_M * 3;
    // fog of war: unexplored ground hazed (same treatment as the pause map)
    const ex = m.explored;
    if (ex) {
      const mk = ex.mask(ox0, oz0, ox0 + lim, oz0 + lim, 8);
      const fc = document.createElement('canvas'); fc.width = mk.w; fc.height = mk.h;
      const fg = fc.getContext('2d')!, id = fg.createImageData(mk.w, mk.h);
      for (let i = 0; i < mk.w * mk.h; i++) { id.data[i * 4] = 44; id.data[i * 4 + 1] = 46; id.data[i * 4 + 2] = 50; id.data[i * 4 + 3] = Math.round((255 - mk.data[i]) * 0.82); }
      fg.putImageData(id, 0, 0); g.imageSmoothingQuality = 'high'; g.drawImage(fc, 0, 0, lim * s, lim * s);
    }
    if (heat.searchArea) {
      g.save(); g.setLineDash([5 * d, 5 * d]); g.strokeStyle = 'rgba(158,42,36,.75)'; g.lineWidth = 2.2 * d;
      g.beginPath(); g.arc(X(heat.searchArea.x), Z(heat.searchArea.z), heat.searchArea.r * s, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(158,42,36,.08)'; g.fill(); g.restore();
    }
    for (const c of heat.cones) {
      const x = X(c.x), z = Z(c.z), r = c.r * s, a = c.dir;
      const grd = g.createRadialGradient(x, z, 0, x, z, r); grd.addColorStop(0, `rgba(178,48,42,${c.seeing ? 0.55 : 0.3})`); grd.addColorStop(1, 'rgba(178,48,42,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(x, z); g.arc(x, z, r, a - c.spread, a + c.spread); g.closePath(); g.fill();
    }
    for (const u of heat.units) {
      g.fillStyle = u.seeing ? '#b2302a' : '#6b6b6b'; g.strokeStyle = '#ffffff'; g.lineWidth = 1.4 * d;
      g.beginPath(); if (u.kind === 'car') g.rect(X(u.x) - 4 * d, Z(u.z) - 2.5 * d, 8 * d, 5 * d); else g.arc(X(u.x), Z(u.z), 3 * d, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (m.route) {
      const pts: number[] = [];
      for (let q = 0; q < m.route.pts.length; q += 2) {
        const x = m.route.pts[q] - ox0, z = m.route.pts[q + 1] - oz0;
        if (x < -200 || z < -200 || x > lim + 200 || z > lim + 200) { if (pts.length >= 4) break; continue; }
        pts.push(X(m.route.pts[q]), Z(m.route.pts[q + 1]));
      }
      // the route (DESIGN_A): amber on a dark casing, as on the pause map
      const line = () => { g.beginPath(); for (let q = 0; q < pts.length; q += 2) (q ? g.lineTo : g.moveTo).call(g, pts[q], pts[q + 1]); };
      g.lineCap = g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 6 * d; line(); g.stroke(); g.strokeStyle = '#e8a317'; g.lineWidth = 3.2 * d; line(); g.stroke();
    }
    if (m.waypoint) { const sp = iconSprite('waypoint', 18, 1, { colour: '#e8a317' }); g.drawImage(sp, X(m.waypoint.x) - sp.width / 2 + 3 * d, Z(m.waypoint.z) - sp.height + 4 * d, sp.width * d, sp.height * d); }
  }

  private clampToCard(p: [number, number], W: number, H: number, inset: number): [number, number] {
    return [Math.min(W - inset, Math.max(inset, p[0])), Math.min(H - inset, Math.max(inset, p[1]))];
  }
}
