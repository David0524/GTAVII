/**
 * The pause-menu map: a 1974 folding street map. Cream paper, inked street grid from the real
 * centrelines, avenue names, period district names, landmarks, fold creases, a publisher's cartouche
 * (invented publisher), and the map simply ends at the paper's edge (= the playable boundary).
 * Pan: drag / right stick / arrows. Zoom: wheel / pinch / triggers.
 */
import type { StreetRec } from './Minimap';
import { PLAYABLE } from '../shared/bounds';
import type { Input } from '../input/Input';

const DISTRICT_LABELS: [string, number, number][] = [ // name, x, z (world)
  ['TIMES SQUARE', -520, -1640], ['THE GARMENT DISTRICT', -620, -1180], ['HERALD SQ.', -440, -930], ['HELL\'S KITCHEN', -1180, -1350],
  ['CHELSEA', -820, -250], ['THE TENDERLOIN', -330, -460], ['MURRAY HILL', 210, -1080], ['MADISON SQ.', 40, -70], ['KIPS BAY', 480, -420],
  ['GRAMERCY', 260, 210], ['FUR DISTRICT', -620, -640], ['FLOWER DIST.', -380, -330],
];
const SHORT_NAMES: Record<string, string> = {
  'Metropolitan Life Insurance Company Tower': 'Met Life Tower', 'Empire State Building': 'Empire State', 'Madison Square Garden': 'Madison Sq. Garden',
  'New York Life Building': 'N.Y. Life', 'Flatiron Building': 'Flatiron', "Macy's": 'Dept. store',
};
const AVE_LABELS = ['11th Avenue', '10th Avenue', '9th Avenue', '8th Avenue', '7th Avenue', '6th Avenue', '5th Avenue', 'Madison Avenue', 'Park Avenue South', 'Lexington Avenue', '3rd Avenue', 'Broadway'];

export class StreetMap {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private cx = -300; private cz = -800; private zoom = 0.34; // px per metre (CSS px)
  private drag: { x: number; y: number; cx: number; cz: number } | null = null;
  private pinch: { d: number; zoom: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  player = { x: 0, z: 0, yaw: 0 };

  constructor(private streets: StreetRec[], private heroes: { name: string; x: number; z: number }[], private input: Input) {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.beginGesture(); });
    c.addEventListener('pointermove', (e) => { if (!this.pointers.has(e.pointerId)) return; this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.moveGesture(); });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.beginGesture(); };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 0.88 : 1.14); }, { passive: false });
  }

  centerOnPlayer() { this.cx = this.player.x; this.cz = this.player.z; }
  private zoomBy(f: number) { this.zoom = Math.min(2.2, Math.max(0.12, this.zoom * f)); }
  private beginGesture() {
    const pts = [...this.pointers.values()];
    this.drag = pts.length === 1 ? { x: pts[0].x, y: pts[0].y, cx: this.cx, cz: this.cz } : null;
    this.pinch = pts.length === 2 ? { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), zoom: this.zoom } : null;
  }
  private moveGesture() {
    const pts = [...this.pointers.values()];
    if (this.drag && pts.length === 1) { this.cx = this.drag.cx - (pts[0].x - this.drag.x) / this.zoom; this.cz = this.drag.cz - (pts[0].y - this.drag.y) / this.zoom; }
    if (this.pinch && pts.length === 2) this.zoom = Math.min(2.2, Math.max(0.12, this.pinch.zoom * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / this.pinch.d));
  }

  update(dt: number) {
    // right stick pans, triggers zoom (left stick is menu navigation)
    const look = this.input.consumeLook();
    this.cx -= look.yaw * 900 / this.zoom * 0.35; this.cz -= look.pitch * 900 / this.zoom * 0.35;
    if (this.input.vertical) this.zoomBy(1 + this.input.vertical * dt * 1.6);
    this.cx = Math.min(PLAYABLE.maxX, Math.max(PLAYABLE.minX, this.cx));
    this.cz = Math.min(PLAYABLE.maxZ, Math.max(PLAYABLE.minZ, this.cz));
    this.draw();
  }

  draw() {
    const c = this.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = this.ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tx = (x: number) => W / 2 + (x - this.cx) * this.zoom, tz = (z: number) => H / 2 + (z - this.cz) * this.zoom;
    g.fillStyle = '#1a1110'; g.fillRect(0, 0, W, H); // table under the map

    // the sheet = playable area + a printed margin
    const m = 60, x0 = tx(PLAYABLE.minX - m), z0 = tz(PLAYABLE.minZ - m), x1 = tx(PLAYABLE.maxX + m), z1 = tz(PLAYABLE.maxZ + m);
    g.save();
    g.shadowColor = '#000c'; g.shadowBlur = 24; g.shadowOffsetY = 6;
    g.fillStyle = '#e9dcc0'; g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.restore();
    g.save(); g.beginPath(); g.rect(x0, z0, x1 - x0, z1 - z0); g.clip();
    // paper tone variation + inked blocks
    const grd = g.createLinearGradient(x0, z0, x1, z1); grd.addColorStop(0, 'rgba(120,80,40,.06)'); grd.addColorStop(1, 'rgba(120,80,40,.14)');
    g.fillStyle = grd; g.fillRect(x0, z0, x1 - x0, z1 - z0);
    g.fillStyle = '#d6c39c'; g.fillRect(tx(PLAYABLE.minX), tz(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) * this.zoom, (PLAYABLE.maxZ - PLAYABLE.minZ) * this.zoom);
    // streets: white roads with ink casing
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) for (const s of this.streets) {
      const w = Math.max(1, s.w * this.zoom * (s.w >= 15 ? 1.15 : 1));
      g.strokeStyle = pass === 0 ? '#5b4636' : s.w >= 15 ? '#fbf3dc' : '#f3e9cf';
      g.lineWidth = pass === 0 ? w + 1.6 : w;
      g.beginPath(); for (let k = 0; k < s.p.length; k += 2) (k ? g.lineTo : g.moveTo).call(g, tx(s.p[k]), tz(s.p[k + 1])); g.stroke();
    }
    // one-way arrows at higher zoom
    if (this.zoom > 0.55) {
      g.fillStyle = '#8b6a4c';
      for (const s of this.streets) if (s.o) for (let k = 2; k < s.p.length; k += 2) {
        const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az, L = Math.hypot(dx, dz); if (L < 40) continue;
        const ux = dx / L * s.o, uz = dz / L * s.o, cx = tx(ax + dx / 2), cz = tz(az + dz / 2), a = 4;
        g.beginPath(); g.moveTo(cx + ux * a * 1.5, cz + uz * a * 1.5); g.lineTo(cx - ux * a - uz * a, cz - uz * a + ux * a); g.lineTo(cx - ux * a + uz * a, cz - uz * a - ux * a); g.fill();
      }
    }
    // avenue names along their lines
    g.fillStyle = '#3d2a20'; g.font = `italic 600 ${Math.max(9, Math.min(13, this.zoom * 30))}px Fraunces, Georgia, serif`;
    for (const name of AVE_LABELS) {
      const s = this.streets.find((r) => r.n === name && r.p.length >= 4); if (!s) continue;
      const k = Math.floor(s.p.length / 4) * 2, ax = s.p[k], az = s.p[k + 1], bx = s.p[k + 2] ?? ax, bz = s.p[k + 3] ?? az;
      g.save(); g.translate(tx(ax), tz(az)); g.rotate(Math.atan2(tz(bz) - tz(az), tx(bx) - tx(ax)) + (tz(bz) < tz(az) ? Math.PI : 0));
      g.fillText(name.replace('Avenue', 'Ave.').toUpperCase(), 6, -3); g.restore();
    }
    // districts
    g.textAlign = 'center'; g.fillStyle = 'rgba(110,40,30,.55)'; g.font = `400 ${Math.max(11, Math.min(22, this.zoom * 52))}px 'League Gothic', sans-serif`;
    for (const [n, x, z] of DISTRICT_LABELS) { g.save(); g.translate(tx(x), tz(z)); g.fillText(n.split('').join(' '), 0, 0); g.restore(); }
    // landmarks
    g.font = `600 ${Math.max(9, Math.min(12, this.zoom * 26))}px 'Courier Prime', monospace`; g.fillStyle = '#2e171d';
    for (const h of this.heroes) { g.beginPath(); g.arc(tx(h.x), tz(h.z), 3.2, 0, Math.PI * 2); g.fill(); if (this.zoom > 0.3) g.fillText(SHORT_NAMES[h.name] ?? h.name, tx(h.x), tz(h.z) - 7); }
    g.textAlign = 'left';
    // fold creases (sheet folded in 4 x 3)
    g.strokeStyle = 'rgba(70,45,25,.18)'; g.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) { const x = x0 + (x1 - x0) * i / 4; g.beginPath(); g.moveTo(x, z0); g.lineTo(x, z1); g.stroke(); }
    for (let i = 1; i < 3; i++) { const z = z0 + (z1 - z0) * i / 3; g.beginPath(); g.moveTo(x0, z); g.lineTo(x1, z); g.stroke(); }
    // cartouche (invented publisher)
    g.fillStyle = '#e9dcc0'; g.strokeStyle = '#3d2a20'; g.lineWidth = 1.5;
    const bx = x0 + 18, bz = z1 - 92; g.fillRect(bx, bz, 230, 74); g.strokeRect(bx + 3, bz + 3, 224, 68);
    g.fillStyle = '#2e171d'; g.font = "italic 800 17px Fraunces, serif"; g.fillText('Midtown Manhattan', bx + 12, bz + 26);
    g.font = "400 12px 'League Gothic', sans-serif"; g.fillText('S T R E E T   G U I D E   ·   1 9 7 4   E D I T I O N', bx + 12, bz + 44);
    g.font = "10px 'Courier Prime', monospace"; g.fillText('Hollis & Crane Map Co. · 50¢', bx + 12, bz + 62);
    g.restore();
    // player
    const px = tx(this.player.x), pz = tz(this.player.z);
    g.save(); g.translate(px, pz); g.rotate(-this.player.yaw);
    g.fillStyle = '#b2302a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
}
