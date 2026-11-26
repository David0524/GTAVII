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
import { F_BODY, F_COND, F_UI } from '../fonts';
import { landmarks } from './landmarkData';
import { PLAYABLE } from '../../shared/bounds';
import type { StreetRec } from './grid';
import type { MapModel } from './MapModel';
import type { Place } from './places';
import { CATEGORIES } from './places';
import { pictogram } from './pictograms';
import { LabelPlacer } from './labels';
import { PAPER, PAPER_SHADE, INK, TABLE, pencilLine, pencilRing, pencilCross, pencilText, hash } from './ink';
import type { Input } from '../../input/Input';
import { settings } from '../../settings/Settings';

/** The printed sheet runs this far past the playable edge; beyond the edge it's greyed and hatched. */
const MARGIN = 240;
const DISTRICTS: [string, number, number][] = [
  ['TIMES SQUARE', -520, -1640], ['GARMENT DISTRICT', -620, -1180], ['HERALD SQ.', -440, -930], ['HELL\'S KITCHEN', -1180, -1350],
  ['CHELSEA', -820, -250], ['THE TENDERLOIN', -330, -460], ['MURRAY HILL', 110, -1080], ['MADISON SQ.', 40, -70], ['KIPS BAY', 400, -420],
  ['GRAMERCY', 260, 210], ['FUR DISTRICT', -620, -640], ['FLOWER MARKET', -380, -330], ['PENN STATION', -720, -830],
];
const AVES = ['11th Avenue', '10th Avenue', '9th Avenue', '8th Avenue', '7th Avenue', '6th Avenue', '5th Avenue', 'Madison Avenue', 'Park Avenue South', 'Lexington Avenue', '3rd Avenue', 'Broadway'];
function settingsIconScale() { return settings.get('mapIconSize') === 'large' ? 1.3 : 1; }

export interface FoldingMapSelection { place?: Place; at?: { x: number; z: number }; mission?: { id: string; title: string; x: number; z: number; window?: [string, string]; blurb?: string } }

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
  /** Screen rects covered by the map screen's own UI (filter rail, buttons, card): no type goes under them. */
  occluders: [number, number, number, number][] = [];
  /** Story mission markers (printed as red stars; tapping opens their card). */
  missions: { id: string; title: string; x: number; z: number; window?: [string, string]; blurb?: string }[] = [];
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
    this.zoom = Math.min(2.4, Math.max(Math.max(W / sw, H / sh), this.zoom)); // full-bleed: never show bare table
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
  pickMission(sx: number, sy: number) {
    let best: FoldingMap['missions'][number] | null = null, bd = 22;
    for (const m of this.missions) { const [x, y] = this.toScreen(m.x, m.z), d = Math.hypot(x - sx, y - sy); if (d < bd) { bd = d; best = m; } }
    return best;
  }
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
    const mi = this.pickMission(sx, sy);
    if (mi) { this.onSelect?.({ mission: mi }); return; }
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

    // behind the sheet: flat dark
    g.fillStyle = TABLE; g.fillRect(0, 0, W, H);

    const x0 = tx(PLAYABLE.minX - MARGIN), z0 = tz(PLAYABLE.minZ - MARGIN), x1 = tx(PLAYABLE.maxX + MARGIN), z1 = tz(PLAYABLE.maxZ + MARGIN);
    const px0 = tx(PLAYABLE.minX), pz0 = tz(PLAYABLE.minZ), px1 = tx(PLAYABLE.maxX), pz1 = tz(PLAYABLE.maxZ);
    // sheet shadow + paper
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 16; g.shadowOffsetY = 4;
    g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.fillStyle = PAPER; g.fill(); g.restore();
    g.save(); g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.clip();
    // folds: 4 x 3 panels, alternating light so the creases read as mountain/valley folds
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const fx0 = x0 + (x1 - x0) * i / 4, fx1 = x0 + (x1 - x0) * (i + 1) / 4, fz0 = z0 + (z1 - z0) * j / 3, fz1 = z0 + (z1 - z0) * (j + 1) / 3;
      const gr = g.createLinearGradient(fx0, 0, fx1, 0);
      const a = i % 2 ? [0.0, 0.035] : [0.035, 0.0];
      gr.addColorStop(0, `rgba(0,0,0,${a[0]})`); gr.addColorStop(1, `rgba(0,0,0,${a[1]})`);
      g.fillStyle = gr; g.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);
    }
    g.fillStyle = PAPER_SHADE; g.fillRect(px0, pz0, px1 - px0, pz1 - pz0); // blocks: pale; streets print white over them
    // district names are printed UNDER the street network, as on a printed street guide: the white streets break the
    // letters where they cross, so a name never sits on top of an avenue. They stay on the sheet, on screen, and clear of
    // the pencilled route.
    {
      const dSize = Math.max(11, Math.min(24, Z * 54));
      g.save(); g.font = `700 ${dSize}px ${F_UI}`; g.fillStyle = 'rgba(17,17,17,.22)'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const route = this.model.route?.pts ?? [];
      for (const [n, x, z] of DISTRICTS) {
        if (x < PLAYABLE.minX || x > PLAYABLE.maxX || z < PLAYABLE.minZ || z > PLAYABLE.maxZ) continue;
        const text = n.split('').join('\u2009'), w = g.measureText(text).width, cx = tx(x), cy = tz(z);
        const b = [cx - w / 2, cy - dSize * 0.6, cx + w / 2, cy + dSize * 0.6];
        if (b[0] < px0 + 6 || b[2] > px1 - 6 || b[1] < pz0 + 6 || b[3] > pz1 - 6 || b[0] < 2 || b[1] < 2 || b[2] > W - 2 || b[3] > H - 2) continue;
        let hit = this.occluders.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);
        for (let k = 0; k < route.length && !hit; k += 2) { const rx = tx(route[k]), ry = tz(route[k + 1]); hit = rx > b[0] - 6 && rx < b[2] + 6 && ry > b[1] - 6 && ry < b[3] + 6; }
        if (!hit) g.fillText(text, cx, cy);
      }
      g.restore();
    }

    // streets (culled), white roads with ink casing
    g.lineCap = 'round'; g.lineJoin = 'round';
    const vx0 = this.cx - W / 2 / Z - 50, vx1 = this.cx + W / 2 / Z + 50, vz0 = this.cz - H / 2 / Z - 50, vz1 = this.cz + H / 2 / Z + 50;
    for (const pass of [0, 1]) for (const s of this.streets) {
      let inView = false; for (let k = 0; k < s.p.length; k += 2) if (s.p[k] > vx0 && s.p[k] < vx1 && s.p[k + 1] > vz0 && s.p[k + 1] < vz1) { inView = true; break; }
      if (!inView && s.p.length < 8) continue;
      const w = Math.max(0.9, s.w * Z * (s.w >= 15 ? 1.15 : 1));
      g.strokeStyle = pass === 0 ? INK : '#ffffff';
      g.lineWidth = pass === 0 ? w + 1.5 : w;
      g.beginPath(); for (let k = 0; k < s.p.length; k += 2) (k ? g.lineTo : g.moveTo).call(g, tx(s.p[k]), tz(s.p[k + 1])); g.stroke();
    }
    if (Z > 0.55) {
      g.fillStyle = 'rgba(60,60,60,.7)';
      for (const s of this.streets) if (s.o) for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az, L = Math.hypot(dx, dz); if (L < 40) continue;
        const ux = dx / L * s.o, uz = dz / L * s.o, cx = tx(ax + dx / 2), cz = tz(az + dz / 2), a = 3.6;
        if (cx < -10 || cz < -10 || cx > W + 10 || cz > H + 10) continue;
        g.beginPath(); g.moveTo(cx + ux * a * 1.5, cz + uz * a * 1.5); g.lineTo(cx - ux * a - uz * a, cz - uz * a + ux * a); g.lineTo(cx - ux * a + uz * a, cz - uz * a - ux * a); g.fill();
      }
    }
    // beyond the playable edge: still printed, but greyed and hatched (the city goes on; this sheet's coverage doesn't)
    g.save(); g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.rect(px0, pz0, px1 - px0, pz1 - pz0); g.clip('evenodd');
    g.fillStyle = 'rgba(110,110,110,.32)'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.strokeStyle = 'rgba(40,40,40,.16)'; g.lineWidth = 1;
    for (let d = -(z1 - z0); d < x1 - x0; d += 7) { g.beginPath(); g.moveTo(x0 + d, z0); g.lineTo(x0 + d + (z1 - z0), z1); g.stroke(); }
    g.restore();
    g.save(); g.strokeStyle = 'rgba(17,17,17,.75)'; g.lineWidth = 1.4; g.setLineDash([9, 4, 2, 4]); g.strokeRect(px0, pz0, px1 - px0, pz1 - pz0); g.restore();
    if (Z < 0.7) {
      g.save(); g.font = `700 11px ${F_COND}`; g.fillStyle = 'rgba(17,17,17,.7)'; g.textAlign = 'center';
      const note = 'C O V E R A G E   O F   T H I S   S H E E T   E N D S   ·   A D J O I N I N G   S H E E T S   S O L D   S E P A R A T E L Y';
      g.fillText(note, (px0 + px1) / 2, pz0 - 8); g.fillText(note, (px0 + px1) / 2, pz1 + 16); g.restore();
    }
    // crease lines
    g.strokeStyle = 'rgba(40,40,40,.16)'; g.lineWidth = 1;
    for (let i = 1; i < 4; i++) { const x = x0 + (x1 - x0) * i / 4; g.beginPath(); g.moveTo(x, z0); g.lineTo(x, z1); g.stroke(); }
    for (let i = 1; i < 3; i++) { const z = z0 + (z1 - z0) * i / 3; g.beginPath(); g.moveTo(x0, z); g.lineTo(x1, z); g.stroke(); }
    // coffee ring on the lower-right panel (it has lived on a diner counter)

    // ---------------------------------------------------------------- symbols first (they reserve space), then type
    const L = new LabelPlacer(W, H);
    const m = this.model;
    const icon = Math.round((Z > 0.6 ? 18 : Z > 0.3 ? 15 : 12) * (settingsIconScale()));
    const placed: [number, number][] = [], drawnPlaces: { p: Place; x: number; y: number }[] = [];
    for (const p of m.discovery.known()) {
      if (!m.visible(p)) continue;
      const x = tx(p.x), y = tz(p.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      // de-clutter at low zoom: payphones, call boxes and subway entrances that would overlap
      if (Z < 0.45 && (p.cat === 'payphone' || p.cat === 'callbox' || p.cat === 'subway') && placed.some(([a, b]) => Math.hypot(a - x, b - y) < icon * 0.9)) continue;
      placed.push([x, y]); drawnPlaces.push({ p, x, y });
      L.reserve([x - icon / 2, y - icon / 2, x + icon / 2, y + icon / 2]);
    }
    for (const h of this.heroes) L.reserve([tx(h.x) - 3, tz(h.z) - 3, tx(h.x) + 3, tz(h.z) + 3]);
    for (const ms of this.missions) L.reserve([tx(ms.x) - 11, tz(ms.z) - 11, tx(ms.x) + 11, tz(ms.z) + 11]);
    L.reserve([tx(this.player.x) - 9, tz(this.player.z) - 11, tx(this.player.x) + 9, tz(this.player.z) + 10]);
    for (const o of this.occluders) L.reserve(o);
    // the pencilled route reserves its path, so printed type never hides under the graphite
    if (m.route) for (let k = 0; k < m.route.pts.length; k += 2) { const x = tx(m.route.pts[k]), y = tz(m.route.pts[k + 1]); L.reserve([x - 4, y - 4, x + 4, y + 4]); if (k) { const px = tx(m.route.pts[k - 2]), py = tz(m.route.pts[k - 1]), n = Math.ceil(Math.hypot(x - px, y - py) / 8); for (let i = 1; i < n; i++) { const ix = px + (x - px) * i / n, iy = py + (y - py) * i / n; L.reserve([ix - 4, iy - 4, ix + 4, iy + 4]); } } }
    // printed furniture reserves its space so no type runs through it; the cartouche takes the first
    // sheet corner that isn't under the screen's UI
    let cart: { bx: number; bz: number } | null = null;
    if (Z < 0.6) {
      // sheet corners first, then the visible screen's corners (clamped onto the sheet); it must sit fully on
      // screen, on the sheet and clear of the UI, or it isn't printed at all (it's decoration, never clipped)
      const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
      const sx0 = cl(18, x0 + 18, x1 - 254), sx1 = cl(W - 254, x0 + 18, x1 - 254), sz0 = cl(18, z0 + 18, z1 - 96), sz1 = cl(H - 96, z0 + 18, z1 - 96);
      const corners = [{ bx: x0 + 18, bz: z1 - 96 }, { bx: x1 - 254, bz: z1 - 96 }, { bx: x0 + 18, bz: z0 + 18 }, { bx: x1 - 254, bz: z0 + 18 },
        { bx: sx1, bz: sz1 }, { bx: sx1, bz: sz0 }, { bx: sx0, bz: sz1 }, { bx: sx0, bz: sz0 }];
      const onScreen = (c: { bx: number; bz: number }) => c.bx >= 4 && c.bz >= 4 && c.bx + 236 <= W - 4 && c.bz + 78 <= H - 4;
      cart = corners.find((c) => onScreen(c) && L.free([c.bx, c.bz, c.bx + 236, c.bz + 78])) ?? null;
    }
    if (cart) L.reserve([cart.bx, cart.bz, cart.bx + 236, cart.bz + 78]);
    if (Z < 0.7) { const hw = 330; L.reserve([(px0 + px1) / 2 - hw, pz0 - 20, (px0 + px1) / 2 + hw, pz0 - 4]); L.reserve([(px0 + px1) / 2 - hw, pz1 + 4, (px0 + px1) / 2 + hw, pz1 + 20]); }
    // 1. printed landmarks (famous public buildings only; the player's own knowledge is pencil)
    g.fillStyle = '#111';
    for (const h of this.heroes) {
      g.fillStyle = '#111'; g.beginPath(); g.rect(tx(h.x) - 3, tz(h.z) - 3, 6, 6); g.fill();
      if (Z > 0.22) L.point(g, landmarks.short(h.name), tx(h.x), tz(h.z), { font: `700 ${Math.max(10, Math.min(12.5, Z * 26))}px ${F_UI}`, colour: '#111', symbol: 6, leader: true });
    }
    // 2. pencil notes on lead homes
    for (const d of drawnPlaces) if (d.p.cat === 'home' && Z > 0.2) {
      const t = this.ownerNotes[d.p.id] ?? d.p.name; g.font = `italic 400 13px ${F_BODY}`;
      const w = g.measureText(t).width;
      for (const [dx, dy] of [[icon / 2 + 4, 4], [-icon / 2 - 4 - w, 4], [-w / 2, -icon / 2 - 6], [-w / 2, icon / 2 + 14]]) {
        const b: [number, number, number, number] = [d.x + dx, d.y + dy - 12, d.x + dx + w, d.y + dy + 3];
        if (L.free(b)) { L.reserve(b); pencilText(g, t, d.x + dx, d.y + dy, 13, -0.06, d.p.x); break; }
      }
    }
    // 4. avenue names along their lines
    for (const name of AVES) {
      const s = this.streets.filter((r) => r.n === name && r.p.length >= 4).sort((a, b) => b.p.length - a.p.length)[0]; if (!s) continue;
      const pts: number[] = []; for (let k = 0; k < s.p.length; k += 2) pts.push(tx(s.p[k]), tz(s.p[k + 1]));
      L.line(g, name.replace('Avenue', 'Ave.').replace('South', 'So.').toUpperCase(), pts, { font: `700 ${Math.max(9.5, Math.min(13, Z * 30))}px ${F_COND}`, colour: '#222', offset: s.w * Z / 2 + 2 });
    }
    // 5. cross streets at street zoom
    if (Z > 0.5) {
      const done = new Set<string>();
      for (const s of this.streets) {
        const mm = s.n.match(/^(West|East) (\d+)(st|nd|rd|th) Street$/); if (!mm || done.has(s.n)) continue;
        const pts: number[] = []; for (let k = 0; k < s.p.length; k += 2) pts.push(tx(s.p[k]), tz(s.p[k + 1]));
        if (!pts.some((v, i) => (i % 2 ? v > 0 && v < H : v > 0 && v < W))) continue;
        if (L.line(g, `${mm[1][0]}. ${mm[2]} ST.`, pts, { font: `400 ${Math.min(11, Z * 14)}px ${F_COND}`, colour: 'rgba(17,17,17,.85)', offset: s.w * Z / 2 + 1 })) done.add(s.n);
      }
    }
    // 6. place names at close zoom
    if (Z > 0.75) for (const d of drawnPlaces) {
      if (d.p.cat === 'payphone' || d.p.cat === 'callbox' || d.p.cat === 'subway' || d.p.cat === 'home') continue;
      L.point(g, d.p.name, d.x, d.y, { font: `400 10px ${F_UI}`, colour: 'rgba(17,17,17,.88)', symbol: icon });
    }
    g.textAlign = 'left';
    // cartouche
    if (cart) {
      const { bx, bz } = cart;
      g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 1.2; g.fillRect(bx, bz, 236, 78); g.strokeRect(bx + 3, bz + 3, 230, 72);
      g.fillStyle = '#111'; g.font = `700 16px ${F_UI}`; g.fillText('Midtown Manhattan', bx + 12, bz + 26);
      g.font = `400 11px ${F_UI}`; g.fillText('Street guide · 1974 edition', bx + 12, bz + 44);
      g.font = `400 10px ${F_UI}`; g.fillText('Hollis & Crane Map Co. · 50¢ · one-way arrows current', bx + 12, bz + 62);
    }

    // ---------------------------------------------------------------- the player's pencil
    for (const a of m.annotations) {
      const [x, y] = [tx(a.x), tz(a.z)];
      if (a.mark === 'circle') pencilRing(g, x, y, 14, a.x); else if (a.mark === 'cross') pencilCross(g, x, y, 7, a.z);
      if (a.text) pencilText(g, a.text, x + 12, y - 8, 12, -0.05, a.x);
    }
    if (m.route) { const pts: number[] = []; for (let k = 0; k < m.route.pts.length; k += 2) pts.push(tx(m.route.pts[k]), tz(m.route.pts[k + 1])); pencilLine(g, pts, 2.6, 5, 0.6); }
    if (m.waypoint) { const x = tx(m.waypoint.x), y = tz(m.waypoint.z); pencilCross(g, x, y, 9, 2); if (m.route) pencilText(g, `${(m.route.length / 1609).toFixed(1)} mi`, x + 12, y + 16, 12); }
    for (const { p, x, y } of drawnPlaces) {
      const spr = pictogram(p.cat, icon, dpr, 'print');
      g.drawImage(spr, x - spr.width / dpr / 2, y - spr.height / dpr / 2, spr.width / dpr, spr.height / dpr);
      if (m.discovery.isNew(p.id)) pencilRing(g, x, y, icon / 2 + 5, hash(p.x * 3) * 99, 'rgba(158,42,36,.9)', 1.8);
      if (this.owned.has(p.id) && Z > 0.25) { // a business you own: a small black flag label, set straight
        g.save(); g.font = `700 10px ${F_UI}`; const tw = g.measureText('YOURS').width; g.fillStyle = '#111'; g.fillRect(x - tw / 2 - 4, y - icon - 16, tw + 8, 13);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('YOURS', x, y - icon - 9.5); g.restore(); }
    }
    for (const ms of this.missions) {
      const spr = pictogram('mission', 21, dpr, 'disc', '#b2302a'), x = tx(ms.x), y = tz(ms.z);
      g.drawImage(spr, x - spr.width / dpr / 2, y - spr.height / dpr / 2, spr.width / dpr, spr.height / dpr);
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
