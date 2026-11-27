/**
 * The pause map, direction A (user's pick, 2026-11-27; docs/research/MAP_DIRECTIONS.md, docs/DESIGN_A.md):
 * an aerial render of our own city from a tile pyramid (public/map/aerial, baked by tools/ui/mapAerial.ts),
 * with fog over unexplored ground (MapModel.explored), the route, blips, landmark silhouettes and
 * street names on top. Input, picking and taps are FoldingMap's (this replaces only the drawing), so the map
 * screen, the card and the waypoint flow are unchanged.
 */
import { FoldingMap } from './FoldingMap';
import { LabelPlacer, type Box } from './labels';
import { CATEGORIES, type Category } from './places';
import { PLAYABLE } from '../../shared/bounds';
import { iconSprite, spritePad, LANDMARK_ICON, type IconName } from '../icons';
import { F_UI, F_COND } from '../fonts';

interface Manifest { format: string; x0: number; z0: number; tile: number; levels: { mPerPx: number; cols: number; rows: number }[] }
const F_VOICE = "'Libre Franklin', 'Franklin Gothic Medium', Arial, sans-serif";
const TAXI = '#e8a317', CREAM = '#f2ede3';
/** Meaning-only colour (DESIGN_A §5): amber story, red danger, blue police; everything else cream. */
const BLIP_COLOUR: Partial<Record<Category, string>> = { mission: TAXI, home: TAXI, safehouse: TAXI, property: TAXI, crime: '#ef7a64', callbox: '#ef7a64', police: '#9cc0ee', hospital: '#ef7a64' };
const DISTRICTS: [string, number, number][] = [['CHELSEA', -1000, -170], ['TENDERLOIN', -330, -470], ['HERALD SQ.', -330, -800], ['MADISON SQ.', 150, -190], ['GARMENT CENTER', -700, -560], ['FLOWER MARKET', -380, -330], ['FUR DISTRICT', -620, -640], ['MURRAY HILL', 120, -900]];

let manifestP: Promise<{ m: Manifest; base: string } | null> | null = null;
function loadManifest(baseUrl: string) {
  manifestP ??= (async () => {
    for (const dir of ['map/aerial/', 'map/aerial-dev/']) {
      try { const r = await fetch(`${baseUrl}${dir}manifest.json`); if (r.ok) return { m: (await r.json()) as Manifest, base: `${baseUrl}${dir}` }; } catch { /* next */ }
    }
    return null;
  })();
  return manifestP;
}

interface Region { window: { minX: number; maxX: number; minZ: number; maxZ: number }; land: { name: string; rings: number[][] }[]; labels: { text: string; x: number; z: number; kind: 'water' | 'boro' | 'place'; rot: number }[] }
let regionP: Promise<Region | null> | null = null;
function loadRegion(baseUrl: string) { regionP ??= fetch(`${baseUrl}map/region.json`).then((r) => (r.ok ? (r.json() as Promise<Region>) : null)).catch(() => null); return regionP; }
/** Regional zoom-out: how far past the sheet the map can pull back (metres), GTA-style "the world beyond". */
const REGION_VIEW = { minX: -7200, maxX: 6200, minZ: -8600, maxZ: 5200 };
/** The bake covers the playable sheet plus this margin (tools/ui/mapAerial.ts default); the pyramid is padded past it. */
const BAKE_PAD = 120;
const WATER = '#0b1013', LAND = '#2b2925', SHORE = 'rgba(242,237,227,.22)';

export class AerialMap extends FoldingMap {
  private region: Region | null = null;
  private man: { m: Manifest; base: string } | null = null;
  private tiles = new Map<string, HTMLImageElement | 'loading' | 'missing'>();
  private fogC = document.createElement('canvas');
  private fogKey = '';
  baseUrl = '/';

  constructor(...a: ConstructorParameters<typeof FoldingMap>) {
    super(...a);
    this.canvas.className = 't74-foldmap t74-aerialmap';
  }
  private loading = false;
  private regionLoading = false;
  private zT: number | null = null;
  private anchor: [number, number] = [0, 0];

  /** Smooth zoom (wheel, triggers, keys): ease to a target around the cursor; pinch stays direct under the fingers. */
  protected override zoomAt(f: number, sx: number, sy: number) { this.zT = Math.min(2.4, Math.max(this.minZoom(), (this.zT ?? this.zoom) * f)); this.anchor = [sx, sy]; }
  /** The regional view fills the screen at the far end of the zoom. */
  private minZoom() { const W = this.canvas.clientWidth || 800, H = this.canvas.clientHeight || 600; return Math.max(W / (REGION_VIEW.maxX - REGION_VIEW.minX), H / (REGION_VIEW.maxZ - REGION_VIEW.minZ)); }
  /** Zoomed in, pan stays on the sheet (as before); pulled back past it, pan ranges over the region. */
  protected override clamp() {
    const W = this.canvas.clientWidth || 800, H = this.canvas.clientHeight || 600;
    this.zoom = Math.min(2.4, Math.max(this.minZoom(), this.zoom));
    const sheetFit = Math.max(W / (PLAYABLE.maxX - PLAYABLE.minX + 400), H / (PLAYABLE.maxZ - PLAYABLE.minZ + 400));
    // blend the pan limits from the sheet (at sheet-fit zoom and closer) to the region (fully pulled back)
    const t = this.zoom >= sheetFit ? 0 : Math.min(1, Math.log(sheetFit / this.zoom) / Math.log(sheetFit / this.minZoom()));
    const lerp = (a: number, b: number) => a + (b - a) * t;
    const lim = { minX: lerp(PLAYABLE.minX - 200, REGION_VIEW.minX), maxX: lerp(PLAYABLE.maxX + 200, REGION_VIEW.maxX), minZ: lerp(PLAYABLE.minZ - 200, REGION_VIEW.minZ), maxZ: lerp(PLAYABLE.maxZ + 200, REGION_VIEW.maxZ) };
    const ax = (lo: number, hi: number, half: number) => (hi - lo > 2 * half ? [lo + half, hi - half] : [(lo + hi) / 2, (lo + hi) / 2]);
    const [x0, x1] = ax(lim.minX, lim.maxX, W / 2 / this.zoom), [z0, z1] = ax(lim.minZ, lim.maxZ, H / 2 / this.zoom);
    this.cx = Math.min(x1, Math.max(x0, this.cx)); this.cz = Math.min(z1, Math.max(z0, this.cz));
  }
  override update(dt: number, input: Parameters<FoldingMap['update']>[1]) {
    if (this.zT !== null) {
      const before = this.zoom, next = before + (this.zT - before) * (1 - Math.exp(-dt * 14));
      this.zoomBy(next / before, this.anchor[0], this.anchor[1]);
      // done when close, or when the clamp stopped us (full-bleed limit)
      if (Math.abs(this.zoom - this.zT) / this.zT < 0.002 || Math.abs(this.zoom - before) < 1e-6) this.zT = null;
    }
    super.update(dt, input);
  }

  private tile(L: number, c: number, r: number): HTMLImageElement | null {
    const k = `${L}/${c}_${r}`, t = this.tiles.get(k);
    if (t instanceof HTMLImageElement) return t;
    if (t) return null;
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { this.tiles.set(k, img); this.dirtyKey = ''; };
    img.onerror = () => this.tiles.set(k, 'missing');
    img.src = `${this.man!.base}${k}.webp`; this.tiles.set(k, 'loading');
    return null;
  }

  override draw(force = false) {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    const ex = this.model.explored;
    const key = `${W}|${H}|${dpr}|${this.cx.toFixed(2)}|${this.cz.toFixed(2)}|${this.zoom.toFixed(4)}|${this.model.version}|${ex?.version ?? 0}|${this.showReticle}|${this.player.x.toFixed(0)},${this.player.z.toFixed(0)},${this.player.yaw.toFixed(2)}`;
    if (!force && key === this.dirtyKey) return;
    this.dirtyKey = key;
    const t0 = performance.now();
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    if (!this.man && !this.loading) { this.loading = true; void loadManifest(this.baseUrl).then((mf) => { this.man = mf; this.dirtyKey = ''; }); }
    if (!this.region && !this.regionLoading) { this.regionLoading = true; void loadRegion(this.baseUrl).then((r) => { this.region = r; this.dirtyKey = ''; }); }
    const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = this.region ? WATER : '#0d0d0c'; g.fillRect(0, 0, W, H);
    const wx0 = this.cx - W / 2 / this.zoom, wz0 = this.cz - H / 2 / this.zoom, wx1 = this.cx + W / 2 / this.zoom, wz1 = this.cz + H / 2 / this.zoom;
    const X = (x: number) => (x - wx0) * this.zoom, Y = (z: number) => (z - wz0) * this.zoom;

    // ---- 0. the region: land around the sheet (muted), water as the ground; the aerial covers it where it exists
    if (this.region) {
      g.beginPath();
      for (const l of this.region.land) for (const r of l.rings) { g.moveTo(X(r[0]), Y(r[1])); for (let i = 2; i < r.length; i += 2) g.lineTo(X(r[i]), Y(r[i + 1])); g.closePath(); }
      g.fillStyle = LAND; g.fill('evenodd'); g.strokeStyle = SHORE; g.lineWidth = 1; g.stroke();
    }

    // ---- 1. the aerial: the finest level the screen needs, parents underneath while children stream in
    const bk = { x0: PLAYABLE.minX - BAKE_PAD, z0: PLAYABLE.minZ - BAKE_PAD, x1: PLAYABLE.maxX + BAKE_PAD, z1: PLAYABLE.maxZ + BAKE_PAD };
    const bakeClip = () => { g.beginPath(); g.rect(X(bk.x0), Y(bk.z0), (bk.x1 - bk.x0) * this.zoom, (bk.z1 - bk.z0) * this.zoom); g.clip(); };
    if (this.man) {
      g.save(); bakeClip();
      const { m, base: _b } = this.man; void _b;
      const devMpp = 1 / (this.zoom * dpr);
      let L = m.levels.length - 1;
      for (let i = 0; i < m.levels.length; i++) if (m.levels[i].mPerPx <= devMpp * 1.35) L = i; else break;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      for (const lv of [Math.min(m.levels.length - 1, L + 1), L]) {
        const { mPerPx, cols, rows } = m.levels[lv], tm = m.tile * mPerPx;
        const c0 = Math.max(0, Math.floor((wx0 - m.x0) / tm)), c1 = Math.min(cols - 1, Math.floor((wx1 - m.x0) / tm));
        const r0 = Math.max(0, Math.floor((wz0 - m.z0) / tm)), r1 = Math.min(rows - 1, Math.floor((wz1 - m.z0) / tm));
        for (let r = r0; r <= r1; r++) for (let cc = c0; cc <= c1; cc++) {
          const img = this.tile(lv, cc, r); if (!img) continue;
          const sx = X(m.x0 + cc * tm), sy = Y(m.z0 + r * tm), s = tm * this.zoom;
          g.drawImage(img, Math.floor(sx), Math.floor(sy), Math.ceil(s + 1), Math.ceil(s + 1));
        }
      }
      g.restore();
    }

    // ---- 2. fog over unexplored ground (soft: a coarse mask upscaled with smoothing), then the edge of the playable area
    if (ex) {
      const mpp = 8, qx0 = Math.floor(wx0 / 80) * 80, qz0 = Math.floor(wz0 / 80) * 80, qx1 = Math.ceil(wx1 / 80) * 80, qz1 = Math.ceil(wz1 / 80) * 80;
      const fk = `${ex.version}|${qx0}|${qz0}|${qx1}|${qz1}`;
      if (fk !== this.fogKey) {
        this.fogKey = fk;
        const mk = ex.mask(qx0, qz0, qx1, qz1, mpp);
        this.fogC.width = mk.w; this.fogC.height = mk.h;
        const fg = this.fogC.getContext('2d')!, id = fg.createImageData(mk.w, mk.h);
        for (let i = 0; i < mk.w * mk.h; i++) { const a = 255 - mk.data[i]; id.data[i * 4] = 44; id.data[i * 4 + 1] = 46; id.data[i * 4 + 2] = 50; id.data[i * 4 + 3] = Math.round(a * 0.86); }
        fg.putImageData(id, 0, 0);
      }
      g.imageSmoothingQuality = 'high';
      // only over the baked aerial: beyond it the region is a plain land map with nothing to discover
      g.save(); bakeClip();
      g.drawImage(this.fogC, X(qx0), Y(qz0), (qx1 - qx0) * this.zoom, (qz1 - qz0) * this.zoom);
      g.restore();
    }
    // out of bounds: shade and hatch the baked buffer ring around the sheet (beyond it the region is already muted)
    const bx0 = bk.x0, bz0 = bk.z0, bx1 = bk.x1, bz1 = bk.z1;
    g.save(); g.beginPath(); g.rect(X(bx0), Y(bz0), (bx1 - bx0) * this.zoom, (bz1 - bz0) * this.zoom); g.rect(X(PLAYABLE.minX), Y(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) * this.zoom, (PLAYABLE.maxZ - PLAYABLE.minZ) * this.zoom); g.clip('evenodd');
    g.fillStyle = 'rgba(8,8,7,.72)'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(242,237,227,.05)'; g.lineWidth = 1; for (let d = -H; d < W; d += 7) { g.beginPath(); g.moveTo(d, H); g.lineTo(d + H, 0); g.stroke(); }
    g.restore();
    // pulled back: the sheet gets a hairline frame so "where you can go" reads at a glance
    const regional = this.zoom < 0.16;
    if (regional) { g.strokeStyle = 'rgba(232,163,23,.7)'; g.lineWidth = 1.5; g.strokeRect(X(PLAYABLE.minX), Y(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) * this.zoom, (PLAYABLE.maxZ - PLAYABLE.minZ) * this.zoom); }

    // ---- 3. labels and symbols share one placer (no collisions); chrome rects reserved first
    const Lp = new LabelPlacer(W, H, 2);
    for (const o of this.occluders) Lp.reserve(o);
    const m = this.model;
    if (m.route) {
      const p = m.route.pts; g.lineCap = g.lineJoin = 'round';
      const line = () => { g.beginPath(); for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(p[i]), Y(p[i + 1])); };
      g.strokeStyle = 'rgba(0,0,0,.72)'; g.lineWidth = 7; line(); g.stroke();
      g.strokeStyle = TAXI; g.lineWidth = 3.8; line(); g.stroke();
      for (let i = 0; i + 3 < p.length; i += 2) Lp.reserve([Math.min(X(p[i]), X(p[i + 2])) - 3, Math.min(Y(p[i + 1]), Y(p[i + 3])) - 3, Math.max(X(p[i]), X(p[i + 2])) + 3, Math.max(Y(p[i + 1]), Y(p[i + 3])) + 3]);
    }
    const spr = (name: IconName, sx: number, sy: number, size: number, colour?: string) => {
      const s = iconSprite(name, size, dpr, { colour }), pad = spritePad();
      g.drawImage(s, sx - size / 2 - pad, sy - size / 2 - pad, s.width / dpr, s.height / dpr);
    };
    // player (by heading) and waypoint first: they own their space
    const [px, py] = this.toScreen(this.player.x, this.player.z);
    Lp.reserve([px - 12, py - 12, px + 12, py + 12]);
    if (m.waypoint) { const [wx, wy] = this.toScreen(m.waypoint.x, m.waypoint.z); spr('waypoint', wx + 3, wy - 9, 22, TAXI); Lp.reserve([wx - 6, wy - 22, wx + 14, wy + 2]); }
    // missions
    for (const mi of this.missions) { const [sx, sy] = this.toScreen(mi.x, mi.z); if (sx < -20 || sy < -20 || sx > W + 20 || sy > H + 20) continue; spr('mission', sx, sy, this.zoom < 0.16 ? 16 : 22, TAXI); Lp.reserve([sx - 12, sy - 12, sx + 12, sy + 12]); }
    // landmarks: silhouettes on a plinth, named
    const lmSize = this.zoom > 0.5 ? 30 : this.zoom < 0.16 ? 18 : 24;
    const lmDrawn: [string, number, number][] = [];
    for (const h of this.heroes as { id?: string; name: string; x: number; z: number }[]) {
      const ic = h.id ? LANDMARK_ICON[h.id] : undefined; if (!ic) continue;
      const [sx, sy] = this.toScreen(h.x, h.z); if (sx < -30 || sy < -30 || sx > W + 30 || sy > H + 30) continue;
      const b: Box = [sx - lmSize / 2, sy - lmSize / 2, sx + lmSize / 2, sy + lmSize / 2];
      if (!Lp.free(b)) continue; Lp.reserve(b); spr(ic, sx, sy, lmSize); lmDrawn.push([h.name, sx, sy]);
    }
    // places (discovered, filtered), declustered at low zoom; new ones get an amber tick
    const regionalNow = this.zoom < 0.16;
    const size = this.zoom > 0.6 ? 20 : this.zoom > 0.3 ? 17 : regionalNow ? 12 : 14;
    const drawn: { id: string; name: string; sx: number; sy: number; cat: Category; key: boolean }[] = [];
    for (const p of m.discovery.known()) {
      if (!m.visible(p)) continue;
      if (regionalNow && !['mission', 'home', 'safehouse', 'property', 'police', 'hospital'].includes(p.cat) && !this.ownerNotes[p.id]) continue; // pulled back: only what you'd plan a trip around
      const [sx, sy] = this.toScreen(p.x, p.z); if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue;
      const b: Box = [sx - size / 2, sy - size / 2, sx + size / 2, sy + size / 2];
      if (!Lp.free(b)) continue; Lp.reserve(b);
      spr(p.cat as IconName, sx, sy, size, BLIP_COLOUR[p.cat]);
      if (m.discovery.isNew(p.id)) { g.fillStyle = TAXI; g.beginPath(); g.moveTo(sx + size / 2 + 1, sy - size / 2 - 4); g.lineTo(sx + size / 2 + 5, sy - size / 2); g.lineTo(sx + size / 2 + 1, sy - size / 2 + 4); g.lineTo(sx + size / 2 - 3, sy - size / 2); g.fill(); }
      drawn.push({ id: p.id, name: p.name, sx, sy, cat: p.cat, key: ['mission', 'home', 'safehouse', 'property', 'police', 'hospital'].includes(p.cat) || !!this.ownerNotes[p.id] });
    }
    // type: landmark names, districts, avenues then streets (zoom-dependent), key place names
    const halo = 'rgba(8,8,7,.86)';
    const point = (text: string, sx: number, sy: number, font: string, colour: string, sym: number) => {
      g.font = font; const w = g.measureText(text).width, hh = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '10'), s = sym / 2 + 3;
      for (const [dx, dy] of [[s, hh * 0.35], [-s - w, hh * 0.35], [-w / 2, -s - 2], [-w / 2, s + hh]] as [number, number][]) {
        const b: Box = [sx + dx, sy + dy - hh * 0.8, sx + dx + w, sy + dy + hh * 0.25]; if (!Lp.free(b)) continue; Lp.reserve(b);
        g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(text, sx + dx, sy + dy); g.fillStyle = colour; g.fillText(text, sx + dx, sy + dy); return;
      }
    };
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    for (const [n, sx, sy] of lmDrawn) point(n, sx, sy, `700 ${this.zoom > 0.5 ? 12 : 11}px ${F_COND}`, CREAM, lmSize);
    if (this.region && this.zoom < 0.3) this.regionLabels(Lp, W, H);
    g.save(); (g as unknown as { letterSpacing: string }).letterSpacing = '0.28em';
    for (const [t, x, z] of regional ? [] : DISTRICTS) {
      const [sx, sy] = this.toScreen(x, z); g.font = `800 ${this.zoom > 0.5 ? 16 : 13}px ${F_VOICE}`;
      const w = g.measureText(t).width + t.length * (this.zoom > 0.5 ? 4.5 : 3.6), b: Box = [sx - w / 2, sy - 12, sx + w / 2, sy + 3]; // + letter-spacing
      if (Lp.free(b)) { Lp.reserve(b); g.textAlign = 'center'; g.fillStyle = 'rgba(242,237,227,.42)'; g.fillText(t, sx, sy); }
    }
    g.restore();
    this.streetNames(Lp, X, Y, W, H, halo);
    for (const d of drawn) if (d.key) point(this.ownerNotes[d.id] ?? d.name.split(',')[0], d.sx, d.sy, `600 10.5px ${F_UI}`, CREAM, size);

    // ---- 4. the player: an arrow by body heading (cream with a dark keyline), and the reticle
    g.save(); g.translate(px, py); g.rotate(-this.player.yaw);
    g.fillStyle = CREAM; g.strokeStyle = '#0a0a09'; g.lineWidth = 2; g.lineJoin = 'miter';
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.stroke(); g.fill(); g.restore();
    if (this.showReticle) { g.strokeStyle = CREAM; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 12, H / 2); g.lineTo(W / 2 - 4, H / 2); g.moveTo(W / 2 + 4, H / 2); g.lineTo(W / 2 + 12, H / 2); g.moveTo(W / 2, H / 2 - 12); g.lineTo(W / 2, H / 2 - 4); g.moveTo(W / 2, H / 2 + 4); g.lineTo(W / 2, H / 2 + 12); g.stroke(); }
    this.cost.draw = performance.now() - t0;
    void CATEGORIES;
  }

  /** Rivers in italic along their run, boroughs in spaced caps, neighbourhoods small: what's out there, not playable. */
  private regionLabels(L: LabelPlacer, W: number, H: number) {
    const g = this.g;
    for (const l of this.region!.labels) {
      const [sx, sy] = this.toScreen(l.x, l.z); if (sx < -80 || sy < -30 || sx > W + 80 || sy > H + 30) continue;
      if (l.x > PLAYABLE.minX && l.x < PLAYABLE.maxX && l.z > PLAYABLE.minZ && l.z < PLAYABLE.maxZ) continue;
      if (l.kind === 'place' && this.zoom < 0.1) continue;
      g.save();
      (g as unknown as { letterSpacing: string }).letterSpacing = l.kind === 'boro' ? '0.32em' : l.kind === 'water' ? '0.12em' : '0.04em';
      g.font = l.kind === 'water' ? `italic 600 ${this.zoom > 0.12 ? 15 : 13}px ${F_UI}` : l.kind === 'boro' ? `800 ${this.zoom > 0.12 ? 15 : 13}px ${F_VOICE}` : `600 11px ${F_UI}`;
      const text = l.kind === 'boro' ? l.text.toUpperCase() : l.text, w = g.measureText(text).width + (l.kind === 'boro' ? text.length * 4 : 0), hh = 9;
      const a = (l.rot * Math.PI) / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
      const bw = w * cs + hh * 2 * sn, bh = w * sn + hh * 2 * cs, b: Box = [sx - bw / 2, sy - bh / 2, sx + bw / 2, sy + bh / 2];
      if (L.free(b)) {
        L.reserve(b); g.translate(sx, sy); g.rotate(a); g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = l.kind === 'water' ? 'rgba(150,178,196,.72)' : l.kind === 'boro' ? 'rgba(242,237,227,.5)' : 'rgba(242,237,227,.42)';
        g.fillText(text, 0, 0);
      }
      g.restore();
    }
  }

  /** Avenues always, cross streets once you're close: names set along the street with a dark halo. */
  private streetNames(L: LabelPlacer, X: (x: number) => number, Y: (z: number) => number, W: number, H: number, halo: string) {
    const g = this.g, byName = new Map<string, number[][]>();
    for (const s of this.streets) { if (!s.n) continue; const a = byName.get(s.n) ?? []; a.push(s.p); byName.set(s.n, a); }
    const isAve = (n: string) => /Avenue|Broadway/.test(n);
    const short = (n: string) => n.replace(/^West /, 'W ').replace(/^East /, 'E ').replace(/ Street$/, ' St').replace(/ Avenue$/, ' Ave').toUpperCase();
    const font = `700 ${this.zoom > 0.6 ? 10.5 : 9.5}px ${F_COND}`;
    g.save(); g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = '0.08em';
    const names = [...byName.keys()].filter((n) => isAve(n) || this.zoom > 0.32).sort((a, b) => (isAve(b) ? 1 : 0) - (isAve(a) ? 1 : 0));
    for (const n of names) {
      const text = short(n), w = g.measureText(text).width;
      // the longest on-screen run of this street
      let best: number[] | null = null, bestL = 0;
      for (const p of byName.get(n)!) {
        const pts: number[] = []; for (let i = 0; i < p.length; i += 2) { const x = p[i], z = p[i + 1]; if (x < PLAYABLE.minX || x > PLAYABLE.maxX || z < PLAYABLE.minZ || z > PLAYABLE.maxZ) continue; pts.push(X(x), Y(z)); }
        let len = 0; for (let i = 0; i + 3 < pts.length; i += 2) len += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
        if (len > bestL) { bestL = len; best = pts; }
      }
      if (!best || bestL < w + 30) continue;
      for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        const k = Math.max(0, Math.min(best.length / 2 - 2, Math.floor((best.length / 2 - 1) * f))) * 2;
        let k2 = k + 2; while (k2 + 1 < best.length && Math.hypot(best[k2] - best[k], best[k2 + 1] - best[k + 1]) < w + 8) k2 += 2;
        const ax = best[k], ay = best[k + 1], bx = best[k2], by = best[k2 + 1]; if (bx === undefined || Math.hypot(bx - ax, by - ay) < w + 6) continue;
        let ang = Math.atan2(by - ay, bx - ax); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
        const mx = (ax + bx) / 2, my = (ay + by) / 2; if (mx < 0 || my < 0 || mx > W || my > H) continue;
        const cs = Math.cos(ang), sn = Math.sin(ang), hh = 5.5;
        const cr = [[-w / 2, -hh], [w / 2, -hh], [-w / 2, hh], [w / 2, hh]].map(([u, v]) => [mx + u * cs - v * sn, my + u * sn + v * cs]);
        const b: Box = [Math.min(...cr.map((q) => q[0])), Math.min(...cr.map((q) => q[1])), Math.max(...cr.map((q) => q[0])), Math.max(...cr.map((q) => q[1]))];
        if (!L.free(b)) continue; L.reserve(b);
        g.save(); g.translate(mx, my); g.rotate(ang); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(text, 0, 0.5); g.fillStyle = isAve(n) ? CREAM : 'rgba(242,237,227,.82)'; g.fillText(text, 0, 0.5); g.restore();
        break;
      }
    }
    g.restore();
  }
}
