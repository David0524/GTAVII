/**
 * The pause map: a 1974 folding street guide from an invented publisher (Hollis & Crane Map Co.),
 * folded in 4 x 3 panels, laid on a diner table. The player's knowledge is pencilled onto it:
 * discovered places as small printed-style pictograms (new ones ringed in red pencil), lead homes
 * with a pencilled note, owned property stamped, the waypoint as a pencil cross and the route as a
 * pencilled line, plus the player's own marks. The sheet ends at the paper edge = the playable bound.
 *
 * Input: drag / pinch / wheel on pointer devices; on gamepad, a centre reticle with the left stick
 * (pan), triggers (zoom), confirm (select the place under the reticle, or pencil a waypoint there),
 * and 'use' to clear the waypoint. Redraws only when something changed.
 */
import { PLAYABLE } from '../../shared/bounds';
import type { StreetRec } from './grid';
import type { MapModel } from './MapModel';
import type { Place } from './places';
import { CATEGORIES } from './places';
import { pictogram } from './pictograms';
import { PAPER, INK, TABLE, deckledRect, paperGrain, pencilLine, pencilRing, pencilCross, stamp, coffeeRing, pencilText, hash } from './ink';
import type { Input } from '../../input/Input';

const MARGIN = 60;
const DISTRICTS: [string, number, number][] = [
  ['TIMES SQUARE', -520, -1640], ['GARMENT DISTRICT', -620, -1180], ['HERALD SQ.', -440, -930], ['HELL\'S KITCHEN', -1180, -1350],
  ['CHELSEA', -820, -250], ['THE TENDERLOIN', -330, -460], ['MURRAY HILL', 210, -1080], ['MADISON SQ.', 40, -70], ['KIPS BAY', 400, -420],
  ['GRAMERCY', 260, 210], ['FUR DISTRICT', -620, -640], ['FLOWER MARKET', -380, -330], ['PENN STATION', -720, -830],
];
const AVES = ['11th Avenue', '10th Avenue', '9th Avenue', '8th Avenue', '7th Avenue', '6th Avenue', '5th Avenue', 'Madison Avenue', 'Park Avenue South', 'Lexington Avenue', '3rd Avenue', 'Broadway'];
const SHORT: Record<string, string> = { 'Metropolitan Life Insurance Company Tower': 'Met Life Tower', 'Empire State Building': 'Empire State Bldg.', 'Madison Square Garden': 'Madison Sq. Garden', 'New York Life Building': 'N.Y. Life Bldg.', 'Flatiron Building': 'Flatiron Bldg.', "Macy's": 'Herald Sq. store' };

export interface FoldingMapSelection { place?: Place; at?: { x: number; z: number } }

export class FoldingMap {
  readonly canvas = document.createElement('canvas');
  private g = this.canvas.getContext('2d')!;
  cx = -300; cz = -800; zoom = 0.34;
  private pointers = new Map<number, { x: number; y: number; x0: number; y0: number }>();
  private drag: { x: number; y: number; cx: number; cz: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private dirtyKey = '';
  private seenT = new Map<string, number>();
  player = { x: 0, z: 0, yaw: 0, lead: '' };
  owned = new Set<string>();
  ownerNotes: Record<string, string> = {};
  showReticle = false;
  onSelect?: (s: FoldingMapSelection) => void;
  readonly cost = { draw: 0 };

  constructor(private model: MapModel, private streets: StreetRec[], private heroes: { name: string; x: number; z: number }[]) {
    const c = this.canvas;
    c.className = 't74-foldmap';
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }); this.begin(); });
    c.addEventListener('pointermove', (e) => { const p = this.pointers.get(e.pointerId); if (!p) return; p.x = e.clientX; p.y = e.clientY; this.move(); });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId); this.pointers.delete(e.pointerId);
      if (p && this.pointers.size === 0 && Math.hypot(p.x - p.x0, p.y - p.y0) < 8 && e.type === 'pointerup') {
        const r = c.getBoundingClientRect(); this.tap(e.clientX - r.left, e.clientY - r.top);
      }
      this.begin();
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); this.zoomAt(e.deltaY > 0 ? 0.87 : 1.15, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  }

  centerOn(x: number, z: number, zoom?: number) { this.cx = x; this.cz = z; if (zoom) this.zoom = zoom; this.clamp(); }
  /** Keep the sheet filling the view when it's bigger than the view (no bare table on one side). */
  private clamp() {
    const W = this.canvas.clientWidth || 800, H = this.canvas.clientHeight || 600;
    const sw = PLAYABLE.maxX - PLAYABLE.minX + 2 * MARGIN, sh = PLAYABLE.maxZ - PLAYABLE.minZ + 2 * MARGIN;
    this.zoom = Math.min(2.4, Math.max(Math.min(W / sw, H / sh) * 0.92, this.zoom));
    const ax = (lo: number, hi: number, half: number) => (hi - lo > 2 * half ? [lo + half, hi - half] : [(lo + hi) / 2, (lo + hi) / 2]);
    const [x0, x1] = ax(PLAYABLE.minX - MARGIN, PLAYABLE.maxX + MARGIN, W / 2 / this.zoom), [z0, z1] = ax(PLAYABLE.minZ - MARGIN, PLAYABLE.maxZ + MARGIN, H / 2 / this.zoom);
    this.cx = Math.min(x1, Math.max(x0, this.cx));
    this.cz = Math.min(z1, Math.max(z0, this.cz));
  }
  private zoomAt(f: number, sx: number, sy: number) {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const wx = this.cx + (sx - W / 2) / this.zoom, wz = this.cz + (sy - H / 2) / this.zoom;
    this.zoom *= f; this.clamp();
    this.cx = wx - (sx - W / 2) / this.zoom; this.cz = wz - (sy - H / 2) / this.zoom; this.clamp();
  }
  private begin() {
    const p = [...this.pointers.values()];
    this.drag = p.length === 1 ? { x: p[0].x, y: p[0].y, cx: this.cx, cz: this.cz } : null;
    this.pinch = p.length === 2 ? { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), zoom: this.zoom } : null;
  }
  private move() {
    const p = [...this.pointers.values()];
    if (this.drag && p.length === 1) { this.cx = this.drag.cx - (p[0].x - this.drag.x) / this.zoom; this.cz = this.drag.cz - (p[0].y - this.drag.y) / this.zoom; this.clamp(); }
    if (this.pinch && p.length === 2) { this.zoom = this.pinch.zoom * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / this.pinch.d; this.clamp(); }
  }

  toWorld(sx: number, sy: number) { return { x: this.cx + (sx - this.canvas.clientWidth / 2) / this.zoom, z: this.cz + (sy - this.canvas.clientHeight / 2) / this.zoom }; }
  private toScreen(x: number, z: number): [number, number] { return [this.canvas.clientWidth / 2 + (x - this.cx) * this.zoom, this.canvas.clientHeight / 2 + (z - this.cz) * this.zoom]; }

  /** Nearest visible place to a screen point (within 22 px). */
  pick(sx: number, sy: number): Place | null {
    let best: Place | null = null, bd = 22;
    for (const p of this.model.discovery.known()) {
      if (!this.model.visible(p)) continue;
      const [x, y] = this.toScreen(p.x, p.z), d = Math.hypot(x - sx, y - sy);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  tap(sx: number, sy: number) {
    const p = this.pick(sx, sy);
    if (p) { this.model.discovery.markSeen([p.id]); this.model.version++; this.onSelect?.({ place: p }); }
    else { const w = this.toWorld(sx, sy); if (w.x > PLAYABLE.minX && w.x < PLAYABLE.maxX && w.z > PLAYABLE.minZ && w.z < PLAYABLE.maxZ) this.onSelect?.({ at: w }); }
  }

  /** Gamepad / keyboard control while the map is open. Left stick or right stick pan, triggers zoom. */
  update(dt: number, input: Input) {
    const pan = 520 / this.zoom * dt;
    const look = input.consumeLook();
    const mx = input.move.x || -look.yaw * 18, mz = -input.move.y || -look.pitch * 18;
    if (mx || mz) { this.cx += mx * pan; this.cz += mz * pan; this.clamp(); this.showReticle = input.activeDevice !== 'touch' && input.activeDevice !== 'kbm'; }
    if (input.vertical) { const W = this.canvas.clientWidth, H = this.canvas.clientHeight; this.zoomAt(1 + input.vertical * dt * 1.8, W / 2, H / 2); }
    const wh = input.consumeWheel(); if (wh) this.zoomAt(wh > 0 ? 0.87 : 1.15, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    if (this.showReticle && input.pressed('confirm')) this.tap(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
    this.lookSeen(dt);
    this.draw();
  }

  /** "New marks fade after you look": a new place counts as seen after 1.2 s on screen at street zoom. */
  private lookSeen(dt: number) {
    if (this.zoom < 0.22) return;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight, seen: string[] = [];
    for (const p of this.model.discovery.known()) {
      if (!this.model.discovery.isNew(p.id) || !this.model.visible(p)) continue;
      const [x, y] = this.toScreen(p.x, p.z);
      if (x < 30 || y < 30 || x > W - 30 || y > H - 30) { this.seenT.delete(p.id); continue; }
      const t = (this.seenT.get(p.id) ?? 0) + dt; this.seenT.set(p.id, t);
      if (t > 1.2) seen.push(p.id);
    }
    if (seen.length) { this.model.discovery.markSeen(seen); this.model.version++; }
  }

  draw(force = false) {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    const key = `${W}|${H}|${dpr}|${this.cx.toFixed(2)}|${this.cz.toFixed(2)}|${this.zoom.toFixed(4)}|${this.model.version}|${this.showReticle}|${this.player.x.toFixed(0)},${this.player.z.toFixed(0)}`;
    if (!force && key === this.dirtyKey) return;
    this.dirtyKey = key;
    const t0 = performance.now();
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const Z = this.zoom, tx = (x: number) => W / 2 + (x - this.cx) * Z, tz = (z: number) => H / 2 + (z - this.cz) * Z;

    // diner table: dark formica with a faint boomerang-free grain
    const tg = g.createLinearGradient(0, 0, W, H); tg.addColorStop(0, '#2a1b17'); tg.addColorStop(1, TABLE);
    g.fillStyle = tg; g.fillRect(0, 0, W, H);

    const x0 = tx(PLAYABLE.minX - MARGIN), z0 = tz(PLAYABLE.minZ - MARGIN), x1 = tx(PLAYABLE.maxX + MARGIN), z1 = tz(PLAYABLE.maxZ + MARGIN);
    // sheet shadow + paper
    g.save(); g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 26; g.shadowOffsetY = 8;
    deckledRect(g, x0, z0, x1, z1, Math.max(1.5, 2.6 * Z), Math.max(4, 7 * Z), 11); g.fillStyle = PAPER; g.fill(); g.restore();
    g.save(); deckledRect(g, x0, z0, x1, z1, Math.max(1.5, 2.6 * Z), Math.max(4, 7 * Z), 11); g.clip();
    // folds: 4 x 3 panels, alternating light so the creases read as mountain/valley folds
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const px0 = x0 + (x1 - x0) * i / 4, px1 = x0 + (x1 - x0) * (i + 1) / 4, pz0 = z0 + (z1 - z0) * j / 3, pz1 = z0 + (z1 - z0) * (j + 1) / 3;
      const gr = g.createLinearGradient(px0, 0, px1, 0);
      const a = i % 2 ? [0.0, 0.07] : [0.07, 0.0];
      gr.addColorStop(0, `rgba(90,60,30,${a[0]})`); gr.addColorStop(1, `rgba(90,60,30,${a[1]})`);
      g.fillStyle = gr; g.fillRect(px0, pz0, px1 - px0, pz1 - pz0);
      if (j % 2) { g.fillStyle = 'rgba(255,250,235,.05)'; g.fillRect(px0, pz0, px1 - px0, pz1 - pz0); }
    }
    g.fillStyle = 'rgba(160,120,70,.10)'; g.fillRect(tx(PLAYABLE.minX), tz(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) * Z, (PLAYABLE.maxZ - PLAYABLE.minZ) * Z);

    // streets (culled), white roads with ink casing
    g.lineCap = 'round'; g.lineJoin = 'round';
    const vx0 = this.cx - W / 2 / Z - 50, vx1 = this.cx + W / 2 / Z + 50, vz0 = this.cz - H / 2 / Z - 50, vz1 = this.cz + H / 2 / Z + 50;
    for (const pass of [0, 1]) for (const s of this.streets) {
      let inView = false; for (let k = 0; k < s.p.length; k += 2) if (s.p[k] > vx0 && s.p[k] < vx1 && s.p[k + 1] > vz0 && s.p[k + 1] < vz1) { inView = true; break; }
      if (!inView && s.p.length < 8) continue;
      const w = Math.max(0.9, s.w * Z * (s.w >= 15 ? 1.15 : 1));
      g.strokeStyle = pass === 0 ? INK : s.w >= 15 ? '#fcf5e0' : '#f5ebd2';
      g.lineWidth = pass === 0 ? w + 1.5 : w;
      g.beginPath(); for (let k = 0; k < s.p.length; k += 2) (k ? g.lineTo : g.moveTo).call(g, tx(s.p[k]), tz(s.p[k + 1])); g.stroke();
    }
    if (Z > 0.55) {
      g.fillStyle = 'rgba(110,80,55,.75)';
      for (const s of this.streets) if (s.o) for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az, L = Math.hypot(dx, dz); if (L < 40) continue;
        const ux = dx / L * s.o, uz = dz / L * s.o, cx = tx(ax + dx / 2), cz = tz(az + dz / 2), a = 3.6;
        if (cx < -10 || cz < -10 || cx > W + 10 || cz > H + 10) continue;
        g.beginPath(); g.moveTo(cx + ux * a * 1.5, cz + uz * a * 1.5); g.lineTo(cx - ux * a - uz * a, cz - uz * a + ux * a); g.lineTo(cx - ux * a + uz * a, cz - uz * a - ux * a); g.fill();
      }
    }
    // paper grain
    g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.55; g.fillStyle = g.createPattern(paperGrain(), 'repeat')!; g.fillRect(x0, z0, x1 - x0, z1 - z0); g.restore();
    // printed labels: avenues, districts, landmarks
    g.fillStyle = '#3d2a20'; g.font = `italic 600 ${Math.max(9, Math.min(13, Z * 30))}px Fraunces, Georgia, serif`;
    for (const name of AVES) {
      const s = this.streets.find((r) => r.n === name && r.p.length >= 4); if (!s) continue;
      const k = Math.floor(s.p.length / 4) * 2, ax = s.p[k], az = s.p[k + 1], bx = s.p[k + 2] ?? ax, bz = s.p[k + 3] ?? az;
      g.save(); g.translate(tx(ax), tz(az)); g.rotate(Math.atan2(tz(bz) - tz(az), tx(bx) - tx(ax)) + (tz(bz) < tz(az) ? Math.PI : 0));
      g.fillText(name.replace('Avenue', 'Ave.').toUpperCase(), 6, -3); g.restore();
    }
    if (Z > 0.5) { // cross streets at street zoom
      g.font = `500 ${Math.min(11, Z * 14)}px Archivo, sans-serif`; g.fillStyle = 'rgba(61,42,32,.8)'; g.textAlign = 'center';
      const done = new Set<string>();
      for (const s of this.streets) {
        const m = s.n.match(/^(West|East) (\d+)(st|nd|rd|th) Street$/); if (!m || done.has(s.n + Math.round(s.p[0] / 400))) continue;
        const k = Math.floor(s.p.length / 4) * 2, x = tx(s.p[k]), z = tz(s.p[k + 1]);
        if (x < 0 || z < 0 || x > W || z > H) continue;
        done.add(s.n + Math.round(s.p[0] / 400)); g.fillText(`${m[1][0]}. ${m[2]} ST.`, x, z - s.w * Z / 2 - 3);
      }
      g.textAlign = 'left';
    }
    g.textAlign = 'center'; g.fillStyle = 'rgba(120,40,30,.5)'; g.font = `400 ${Math.max(11, Math.min(24, Z * 54))}px 'League Gothic', sans-serif`;
    for (const [n, x, z] of DISTRICTS) g.fillText(n.split('').join(' '), tx(x), tz(z));
    g.font = `600 ${Math.max(9, Math.min(12, Z * 26))}px 'Courier Prime', monospace`; g.fillStyle = '#2e171d';
    for (const h of this.heroes) { g.beginPath(); g.rect(tx(h.x) - 3, tz(h.z) - 3, 6, 6); g.fill(); if (Z > 0.28) g.fillText(SHORT[h.name] ?? h.name, tx(h.x), tz(h.z) - 8); }
    g.textAlign = 'left';
    // crease lines
    g.strokeStyle = 'rgba(70,45,25,.22)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const x = x0 + (x1 - x0) * i / 4; g.beginPath(); g.moveTo(x, z0); g.lineTo(x, z1); g.stroke(); }
    for (let i = 1; i < 3; i++) { const z = z0 + (z1 - z0) * i / 3; g.beginPath(); g.moveTo(x0, z); g.lineTo(x1, z); g.stroke(); }
    // coffee ring on the lower-right panel (it has lived on a diner counter)
    coffeeRing(g, tx(PLAYABLE.maxX - 260), tz(PLAYABLE.maxZ - 330), 95 * Z, 4);
    // cartouche
    const bx = x0 + 18 * Math.min(1, Z * 3), bz = z1 - 96;
    if (Z < 0.6) {
      g.fillStyle = PAPER; g.strokeStyle = '#3d2a20'; g.lineWidth = 1.5; g.fillRect(bx, bz, 236, 78); g.strokeRect(bx + 3, bz + 3, 230, 72);
      g.fillStyle = '#2e171d'; g.font = 'italic 800 17px Fraunces, serif'; g.fillText('Midtown Manhattan', bx + 12, bz + 26);
      g.font = "400 12px 'League Gothic', sans-serif"; g.fillText('S T R E E T   G U I D E   ·   1 9 7 4   E D I T I O N', bx + 12, bz + 44);
      g.font = "10px 'Courier Prime', monospace"; g.fillText('Hollis & Crane Map Co. · 50¢ · one-way arrows current', bx + 12, bz + 62);
    }

    // ---------------------------------------------------------------- the player's pencil
    const m = this.model;
    for (const a of m.annotations) {
      const [x, y] = [tx(a.x), tz(a.z)];
      if (a.mark === 'circle') pencilRing(g, x, y, 14, a.x); else if (a.mark === 'cross') pencilCross(g, x, y, 7, a.z);
      if (a.text) pencilText(g, a.text, x + 12, y - 8, 12, -0.05, a.x);
    }
    if (m.route) { const pts: number[] = []; for (let k = 0; k < m.route.pts.length; k += 2) pts.push(tx(m.route.pts[k]), tz(m.route.pts[k + 1])); pencilLine(g, pts, 2.6, 5, 0.6); }
    if (m.waypoint) { const x = tx(m.waypoint.x), y = tz(m.waypoint.z); pencilCross(g, x, y, 9, 2); if (m.route) pencilText(g, `${(m.route.length / 1609).toFixed(1)} mi`, x + 12, y + 16, 12); }

    const icon = Z > 0.6 ? 18 : Z > 0.3 ? 15 : 12;
    const placed: [number, number][] = [];
    for (const p of m.discovery.known()) {
      if (!m.visible(p)) continue;
      const x = tx(p.x), y = tz(p.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      // de-clutter at low zoom: skip payphones/call boxes/subway entrances that would overlap
      if (Z < 0.3 && (p.cat === 'payphone' || p.cat === 'callbox' || p.cat === 'subway') && placed.some(([a, b]) => Math.hypot(a - x, b - y) < 10)) continue;
      placed.push([x, y]);
      const spr = pictogram(p.cat, icon, dpr, 'print');
      g.drawImage(spr, x - spr.width / dpr / 2, y - spr.height / dpr / 2, spr.width / dpr, spr.height / dpr);
      if (m.discovery.isNew(p.id)) pencilRing(g, x, y, icon / 2 + 5, hash(p.x * 3) * 99, 'rgba(158,42,36,.9)', 1.8);
      if (p.cat === 'home' && Z > 0.2) pencilText(g, this.ownerNotes[p.id] ?? p.name, x + icon / 2 + 4, y + 4, 13, -0.06, p.x);
      if (this.owned.has(p.id) && Z > 0.25) stamp(g, 'Ours', x, y - icon - 6, -0.12, '#9e2a24', 11, p.z | 0);
      if (Z > 0.75 && p.cat !== 'payphone' && p.cat !== 'callbox' && p.cat !== 'subway' && p.cat !== 'home') {
        g.font = `500 10px 'Courier Prime', monospace`; g.fillStyle = 'rgba(46,23,29,.85)'; g.fillText(p.name, x + icon / 2 + 3, y + 3);
      }
    }
    // objective marker (story)
    g.restore();

    // player: a red pencil arrow
    const px = tx(this.player.x), pz = tz(this.player.z);
    g.save(); g.translate(px, pz); g.rotate(-this.player.yaw);
    g.fillStyle = '#b2302a'; g.strokeStyle = '#fff6e0'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(7.5, 9); g.lineTo(0, 4.5); g.lineTo(-7.5, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
    if (this.showReticle) { g.strokeStyle = 'rgba(239,227,196,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, Math.PI * 2); g.moveTo(W / 2 - 22, H / 2); g.lineTo(W / 2 - 8, H / 2); g.moveTo(W / 2 + 8, H / 2); g.lineTo(W / 2 + 22, H / 2); g.moveTo(W / 2, H / 2 - 22); g.lineTo(W / 2, H / 2 - 8); g.moveTo(W / 2, H / 2 + 8); g.lineTo(W / 2, H / 2 + 22); g.stroke(); }
    this.cost.draw = performance.now() - t0;
    void CATEGORIES;
  }
}
