/**
 * The minimap: a heading-up window onto the same printed street guide as the pause map.
 *  - Base: paper, inked streets and 1974 one-way ticks, rendered lazily into 256 m tiles at the
 *    card's device resolution (LRU), so it is crisp on phones and costs a few drawImage calls a frame.
 *    The paper ends in a deckled edge at the playable boundary; beyond it is the table top.
 *  - Overlays each frame: pencilled route, police search cones and the search area (heat shown only
 *    here and through the radio: no stars), discovered places as period pictograms (kept upright,
 *    "new" ones circled in pencil), the waypoint cross, the objective marker (pinned to the rim when
 *    off-card), and the player arrow.
 * Budget: HUD + minimap <= 0.5 ms CPU per frame on mobile Low (measured in the lab, see UI_PROGRESS).
 */
import { PLAYABLE } from '../../shared/bounds';
import type { StreetRec } from './grid';
import type { MapModel } from './MapModel';
import type { HeatView, ObjectiveView } from '../host/types';
import { pictogram } from './pictograms';
import { PAPER, INK, TABLE, deckledRect, paperGrain, pencilLine, pencilRing, pencilCross, hash } from './ink';

const TILE_M = 256;
const MARGIN = 60; // printed margin beyond the playable edge

export interface MiniMapFrame { x: number; z: number; yaw: number; speed: number; inVehicle: boolean; heat: HeatView; objective: ObjectiveView | null; t: number }

export class MiniMap {
  readonly el = document.createElement('div');
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private tiles = new Map<string, HTMLCanvasElement>();
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
  private lastKey = '';
  private sinceDraw = 1;
  private ro: ResizeObserver;

  constructor(private model: MapModel, private streets: StreetRec[]) {
    this.el.className = 't74-minimap';
    this.el.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.ro = new ResizeObserver((e) => { const r = e[0].contentRect; this.measured = { w: r.width, h: r.height }; });
    this.ro.observe(this.canvas);
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
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
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
    deckledRect(g, X(PLAYABLE.minX - MARGIN), Z(PLAYABLE.minZ - MARGIN), X(PLAYABLE.maxX + MARGIN), Z(PLAYABLE.maxZ + MARGIN), 2.5 * s, 5 * s, 11);
    g.fillStyle = PAPER; g.fill(); g.clip();
    // the printed area (playable) a touch darker than the margin, like a street-guide plate
    g.fillStyle = 'rgba(160,120,70,.10)'; g.fillRect(X(PLAYABLE.minX), Z(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) * s, (PLAYABLE.maxZ - PLAYABLE.minZ) * s);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const x0 = ox - 40, z0 = oz - 40, x1 = ox + TILE_M + 40, z1 = oz + TILE_M + 40;
    for (const pass of [0, 1]) for (let k = 0; k < this.streets.length; k++) {
      const b = this.bboxes; if (b[k * 4] > x1 || b[k * 4 + 2] < x0 || b[k * 4 + 1] > z1 || b[k * 4 + 3] < z0) continue;
      const st = this.streets[k];
      const major = st.w >= 15;
      g.strokeStyle = pass === 0 ? INK : major ? '#fbf4de' : '#f4ead0';
      g.lineWidth = Math.max(1, st.w * s * (major ? 1.1 : 1)) + (pass === 0 ? 1.4 * this.dpr : 0);
      g.beginPath(); for (let q = 0; q < st.p.length; q += 2) (q ? g.lineTo : g.moveTo).call(g, X(st.p[q]), Z(st.p[q + 1])); g.stroke();
    }
    // one-way ticks (1974 table)
    g.fillStyle = 'rgba(80,55,35,.55)';
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
    // paper grain over everything printed
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6;
    g.fillStyle = g.createPattern(paperGrain(), 'repeat')!; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    this.tiles.set(key, c); this.tileOrder.push(key);
    if (this.tileOrder.length > 24) this.tiles.delete(this.tileOrder.shift()!);
    this.cost.tiles = performance.now() - t0;
    return c;
  }

  /** Draw a frame. Returns ids of "new" places currently on the card (the HUD marks them seen after a while). */
  draw(f: MiniMapFrame, dt: number) {
    const t0 = performance.now();
    this.fit();
    if (!this.w) return;
    // Redraw only when something visible changed, and at most ~30 Hz while it changes slowly.
    this.sinceDraw += dt;
    const m0 = this.model, animating = f.heat.phase !== 'none' || m0.discovery.counts.fresh > 0;
    const key = `${f.x.toFixed(1)}|${f.z.toFixed(1)}|${f.yaw.toFixed(3)}|${this.rangeM.toFixed(1)}|${m0.version}|${f.objective?.target?.x ?? ''}`;
    if ((key === this.lastKey && !animating) || this.sinceDraw < 1 / 32) { this.cost.skipped++; return; }
    this.lastKey = key; this.sinceDraw = 0; this.cost.drawn++;
    // zoom out with speed (driving) and when a pursuit is on
    this.zoomTarget = f.inVehicle ? 230 + Math.min(120, f.speed * 4) : f.heat.phase === 'pursuit' ? 190 : 140;
    this.rangeM += (this.zoomTarget - this.rangeM) * Math.min(1, dt * 1.5);
    this.ensureScale();
    const g = this.g, W = this.w * this.dpr, H = this.h * this.dpr, s = this.pxPerM, cx = W / 2, cy = H * 0.58;
    const scale = (H / 2 / this.rangeM) / s; // tile px -> canvas px
    const cos = Math.cos(f.yaw), sin = Math.sin(f.yaw), k = (H / 2) / this.rangeM; // world m -> canvas px
    const toScreen = (x: number, z: number): [number, number] => { const dx = (x - f.x) * k, dz = (z - f.z) * k; return [cx + dx * cos - dz * sin, cy + dx * sin + dz * cos]; };

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = TABLE; g.fillRect(0, 0, W, H);
    // base: one rotated blit of the 3x3-tile window around the player
    const ci = Math.floor(f.x / TILE_M), cj = Math.floor(f.z / TILE_M), wk = `${ci},${cj},${this.tilePx}`;
    if (wk !== this.winKey) {
      this.winKey = wk; const tp = this.tilePx;
      if (this.win.width !== tp * 3) { this.win.width = this.win.height = tp * 3; }
      const wg = this.win.getContext('2d')!;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) wg.drawImage(this.tile(ci + i, cj + j), (i + 1) * tp, (j + 1) * tp);
    }
    g.save(); g.translate(cx, cy); g.rotate(f.yaw); g.scale(scale, scale);
    g.drawImage(this.win, ((ci - 1) * TILE_M - f.x) * s, ((cj - 1) * TILE_M - f.z) * s);
    g.restore();

    // police: search area and cones (pencil hatching in red)
    const heat = f.heat;
    if (heat.searchArea) {
      const [sx, sy] = toScreen(heat.searchArea.x, heat.searchArea.z), r = heat.searchArea.r * k;
      g.save(); g.setLineDash([5 * this.dpr, 5 * this.dpr]); g.strokeStyle = 'rgba(158,42,36,.7)'; g.lineWidth = 1.6 * this.dpr;
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.stroke(); g.fillStyle = 'rgba(158,42,36,.07)'; g.fill(); g.restore();
    }
    for (const c of heat.cones) {
      const [sx, sy] = toScreen(c.x, c.z), r = c.r * k, a = c.dir + f.yaw;
      const pulse = c.seeing ? 0.28 + 0.1 * Math.sin(f.t * 8) : 0.14;
      const grd = g.createRadialGradient(sx, sy, 0, sx, sy, r); grd.addColorStop(0, `rgba(178,48,42,${pulse + 0.15})`); grd.addColorStop(1, 'rgba(178,48,42,0)');
      g.fillStyle = grd; g.beginPath(); g.moveTo(sx, sy); g.arc(sx, sy, r, a - c.spread, a + c.spread); g.closePath(); g.fill();
    }
    for (const u of heat.units) {
      const [sx, sy] = toScreen(u.x, u.z);
      g.fillStyle = u.seeing ? '#b2302a' : '#5a2330'; g.strokeStyle = '#efe3c4'; g.lineWidth = 1.2 * this.dpr;
      g.beginPath(); if (u.kind === 'car') g.rect(sx - 3.5 * this.dpr, sy - 2.2 * this.dpr, 7 * this.dpr, 4.4 * this.dpr); else g.arc(sx, sy, 2.8 * this.dpr, 0, Math.PI * 2); g.fill(); g.stroke();
    }

    // pencilled route
    const m = this.model;
    if (m.route) {
      const pts: number[] = [];
      const rr2 = this.rangeM * 2;
      for (let q = 0; q < m.route.pts.length; q += 2) {
        const rx = m.route.pts[q], rz = m.route.pts[q + 1];
        if (Math.abs(rx - f.x) > rr2 || Math.abs(rz - f.z) > rr2) { if (pts.length >= 4) break; continue; }
        const p = toScreen(rx, rz); pts.push(p[0], p[1]);
      }
      pencilLine(this.g, pts, 2.4 * this.dpr, 3, 0.62);
    }
    if (m.waypoint) { const [wx, wy] = this.clampToCard(toScreen(m.waypoint.x, m.waypoint.z), W, H, 10 * this.dpr); pencilCross(g, wx, wy, 5 * this.dpr); }

    // places (upright pictograms)
    const ic = Math.round(15), seenNow: string[] = [];
    const rr = this.rangeM * 1.5;
    for (const p of m.discovery.known()) {
      if (Math.abs(p.x - f.x) > rr || Math.abs(p.z - f.z) > rr || !m.visible(p)) continue;
      const [sx, sy] = toScreen(p.x, p.z);
      if (sx < -12 || sy < -12 || sx > W + 12 || sy > H + 12) continue;
      const spr = pictogram(p.cat, ic, this.dpr);
      g.drawImage(spr, sx - spr.width / 2, sy - spr.height / 2);
      if (m.discovery.isNew(p.id)) {
        pencilRing(g, sx, sy, (ic / 2 + 4 + Math.sin(f.t * 4) * 1.2) * this.dpr, hash(p.x) * 100, 'rgba(158,42,36,.9)', 1.6 * this.dpr);
        const tt = (this.newSeenTimer.get(p.id) ?? 0) + dt; this.newSeenTimer.set(p.id, tt);
        if (tt > 6) seenNow.push(p.id);
      }
    }
    if (seenNow.length) m.discovery.markSeen(seenNow);

    // objective marker (story star), pinned to the rim when off-card
    if (f.objective?.target) {
      const raw = toScreen(f.objective.target.x, f.objective.target.z);
      const [ox, oy] = this.clampToCard(raw, W, H, 11 * this.dpr);
      const spr = pictogram('mission', 17, this.dpr, 'disc', '#b2302a');
      g.drawImage(spr, ox - spr.width / 2, oy - spr.height / 2);
      if (raw[0] !== ox || raw[1] !== oy) { g.save(); g.translate(ox, oy); g.rotate(Math.atan2(raw[1] - oy, raw[0] - ox)); g.fillStyle = '#b2302a'; g.beginPath(); g.moveTo(13 * this.dpr, 0); g.lineTo(8 * this.dpr, -4 * this.dpr); g.lineTo(8 * this.dpr, 4 * this.dpr); g.fill(); g.restore(); }
    }

    // player
    g.save(); g.translate(cx, cy); g.scale(this.dpr, this.dpr);
    g.fillStyle = '#b2302a'; g.strokeStyle = '#fff6e0'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 7); g.lineTo(0, 3.5); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north tick on the bezel
    const [px, py] = this.clampToCard(toScreen(f.x, f.z - 10000), W, H, 9 * this.dpr);
    g.font = `700 ${10 * this.dpr}px Archivo, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#efe3c4'; g.strokeStyle = '#1c1311'; g.lineWidth = 3 * this.dpr; g.strokeText('N', px, py); g.fillText('N', px, py);

    const dtMs = performance.now() - t0;
    this.cost.draw = this.cost.draw ? this.cost.draw * 0.95 + dtMs * 0.05 : dtMs;
  }

  private clampToCard(p: [number, number], W: number, H: number, inset: number): [number, number] {
    return [Math.min(W - inset, Math.max(inset, p[0])), Math.min(H - inset, Math.max(inset, p[1]))];
  }
}
