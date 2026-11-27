/**
 * Map redesign mockups (oversight / user: "Redesign the map … consider how GTA and RDR2 maps look").
 * One renderer, three directions over the same data, phone landscape (844×390 CSS @2x):
 *   ?dir=A  Aerial: an orthographic render of our city (tools/ui/mapAerial.ts), graded, roads + route + blips on top
 *   ?dir=B  Period atlas: hand-inked 1974 street atlas on paper, washes, lettered names, landmark vignettes, ink fills in as you discover
 *   ?dir=C  Hybrid: the aerial as a two-colour halftone print, GTA readability with 1974 print character
 * Real data throughout: streets.json, the places catalogue, the route graph, the label placer. Mockup code, not shipping code.
 */
import { RouteGraph } from '../../../src/ui/map/Route';
import { LabelPlacer, type Box } from '../../../src/ui/map/labels';
import { pictogram } from '../../../src/ui/map/pictograms';
import { type Place, type Category } from '../../../src/ui/map/places';
import { PLAYABLE } from '../../../src/shared/bounds';
import type { StreetRec } from '../../../src/ui/map/grid';

type Dir = 'A' | 'B' | 'C';
const DIR = ((new URLSearchParams(location.search).get('dir') ?? 'A').toUpperCase()) as Dir;
document.body.dataset.dir = DIR;
const W = innerWidth, H = innerHeight, DPR = devicePixelRatio || 1;
const LEG_W = 206, TOP = 32, BOTTOM = 0;
// view: Lacy's (Herald Sq) at the top, Chelsea and the Flatiron at the bottom
const VIEW = { cx: -470, cz: -469, S: 3.0 }; // metres per CSS px: z −1000 sits just under the tabs, the Flatiron just above the bottom
const OX = (LEG_W + W) / 2, OY = (TOP + H - BOTTOM) / 2;
const X = (x: number) => OX + (x - VIEW.cx) / VIEW.S, Y = (z: number) => OY + (z - VIEW.cz) / VIEW.S;

const canvas = document.getElementById('map') as HTMLCanvasElement;
canvas.width = W * DPR; canvas.height = H * DPR; canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
const g = canvas.getContext('2d')!;
g.scale(DPR, DPR);
const off = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = w * DPR; c.height = h * DPR; const x = c.getContext('2d')!; x.scale(DPR, DPR); return [c, x] as const; };

const F_UI = "'T74 Heros', Helvetica, Arial, sans-serif", F_COND = "'T74 Heros Cn', 'Arial Narrow', sans-serif", F_BODY = "'T74 Schola', Georgia, serif";
const TAXI = '#e8a317';

// ------------------------------------------------------------------ data
const [streets, placesFile, aerialMeta] = await Promise.all([
  fetch('/data/streets.json').then((r) => r.json() as Promise<StreetRec[]>),
  fetch('/data/ui/places.json').then((r) => r.json() as Promise<{ places: Place[] }>),
  fetch('/shots/map/aerial.json').then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ x0: number; z0: number; mPerPx: number; w: number; h: number } | null>,
]);
await document.fonts.ready;
await Promise.all(['400 10px "T74 Heros"', '700 10px "T74 Heros"', '700 10px "T74 Heros Cn"', 'italic 400 10px "T74 Schola"', '400 10px "T74 Schola"'].map((f) => document.fonts.load(f)));
const loadImg = (src: string) => new Promise<HTMLImageElement | null>((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
const aerial = aerialMeta ? await loadImg('/shots/map/aerial.png') : null;

const HEROES: { id: string; name: string; x: number; z: number; seen: boolean }[] = [
  { id: 'flatiron', name: 'Flatiron Bldg.', x: 5.7, z: 19.3, seen: true },
  { id: 'macys', name: "Lacy's", x: -477.8, z: -951.7, seen: true },
  { id: 'kelsey', name: 'Hotel Kelsey', x: -710.9, z: -4.1, seen: true },
  { id: 'nylife', name: 'NY Lifelong', x: 225.1, z: -313.2, seen: true },
  { id: 'empire', name: 'Empire Estate', x: -131.4, z: -861.1, seen: true },
  { id: 'garden', name: 'Penn Sq. Garden', x: -788.6, z: -742.1, seen: true },
  { id: 'lifeline', name: 'Lifeline Tower', x: 222.3, z: -75.2, seen: true },
];
const PLAYER = { x: 2, z: -55, yaw: -0.35 };
const DEST = { x: -440, z: -905 }; // Lacy's front on 34th St
const route = new RouteGraph(streets).find(PLAYER.x, PLAYER.z, DEST.x, DEST.z, 'foot');

// discovered ground: Chelsea to Madison Square south of ~27th St, and the Eighth Avenue corridor up to the Garden.
// The Garment Center and Herald Square are still unexplored (the route heads into them).
const AREAS: [number, number][][] = [
  [[-1500, 200], [700, 200], [700, -300], [250, -330], [-300, -360], [-700, -330], [-1500, -300]],
  [[-1060, -300], [-640, -330], [-650, -900], [-1060, -900]],
];
const [maskC, mg] = off();
mg.fillStyle = '#fff';
for (const a of AREAS) { mg.beginPath(); a.forEach(([x, z], i) => (i ? mg.lineTo(X(x), Y(z)) : mg.moveTo(X(x), Y(z)))); mg.closePath(); mg.fill(); }
const maskData = mg.getImageData(0, 0, maskC.width, maskC.height).data;
/** The mask on black (for noise thresholding), and the alpha mask itself for cutting fog. */
const maskBW = (() => { const [c, x] = off(); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.drawImage(maskC, 0, 0, W, H); return c; })();
const discovered = (sx: number, sy: number) => { const i = (Math.round(sy * DPR) * maskC.width + Math.round(sx * DPR)) * 4; return (maskData[i] ?? 0) > 127; };
const inPlay = (x: number, z: number) => x > PLAYABLE.minX && x < PLAYABLE.maxX && z > PLAYABLE.minZ && z < PLAYABLE.maxZ;

// places: discovered ones in discovered ground; one marker per subway station; payphones filtered off in the legend
const seenStation = new Set<string>();
const SHOWN_CATS: Category[] = ['food', 'bar', 'subway', 'shop', 'clothes', 'garage', 'service', 'police', 'hospital', 'mission', 'home', 'crime', 'job', 'stranger'];
const places = placesFile.places.filter((p) => {
  const sx = X(p.x), sy = Y(p.z);
  if (sx < LEG_W + 6 || sx > W - 6 || sy < TOP + 6 || sy > H - BOTTOM - 6 || !inPlay(p.x, p.z)) return false;
  if (p.cat === 'landmark' || !SHOWN_CATS.includes(p.cat) || !discovered(sx, sy)) return false;
  if (p.cat === 'subway') { const st = p.id.split('.').slice(0, 3).join('.'); if (seenStation.has(st)) return false; seenStation.add(st); }
  return true;
});
// tips: heard about, not yet seen (shown as "?" in the undiscovered ground)
const TIPS = [{ x: -6.1, z: -909.7, name: 'Ashgrove Trust' }, { x: -300, z: -560, name: 'A tip: a fence on 29th' }];

// ------------------------------------------------------------------ helpers
function noiseCanvas(scale: number, octaves = 4, seed = 1) {
  const [c, x] = off(); const img = x.createImageData(c.width, c.height); const d = img.data;
  const rnd = (i: number, j: number, o: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + o * 74.7 + seed * 13.1) * 43758.5453; return s - Math.floor(s); };
  const val = (u: number, v: number, o: number) => { const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, a = rnd(i, j, o), b = rnd(i + 1, j, o), cc = rnd(i, j + 1, o), dd = rnd(i + 1, j + 1, o), su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv); return a + (b - a) * su + (cc - a) * sv + (a - b - cc + dd) * su * sv; };
  for (let py = 0; py < c.height; py++) for (let px = 0; px < c.width; px++) {
    let n = 0, amp = 0.5, f = 1 / (scale * DPR);
    for (let o = 0; o < octaves; o++) { n += val(px * f, py * f, o) * amp; amp *= 0.5; f *= 2; }
    const k = (py * c.width + px) * 4, v = Math.round(n * 255 / 0.94); d[k] = d[k + 1] = d[k + 2] = v; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
}
function polyline(ctx: CanvasRenderingContext2D, p: number[], jitter = 0, seed = 0) {
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) {
    let sx = X(p[i]), sy = Y(p[i + 1]);
    if (jitter) { sx += Math.sin(i * 1.7 + seed) * jitter; sy += Math.cos(i * 2.3 + seed * 0.7) * jitter; }
    i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
  }
}
/** Resample a world polyline to ~step px and wobble it: a hand-inked line. */
function inked(ctx: CanvasRenderingContext2D, p: number[], amp: number, seed: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i + 3 < p.length; i += 2) {
    const ax = X(p[i]), ay = Y(p[i + 1]), bx = X(p[i + 2]), by = Y(p[i + 3]), L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / 6));
    for (let k = 0; k < n; k++) pts.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]);
  }
  pts.push([X(p[p.length - 2]), Y(p[p.length - 1])]);
  ctx.beginPath();
  pts.forEach(([x, y], i) => { const w = Math.sin(i * 0.9 + seed) * amp + Math.sin(i * 2.7 + seed * 3) * amp * 0.4; i ? ctx.lineTo(x + w, y - w * 0.6) : ctx.moveTo(x + w, y); });
}
const named = new Map<string, StreetRec[]>();
for (const s of streets) if (s.n) { const a = named.get(s.n) ?? []; a.push(s); named.set(s.n, a); }
const visibleLen = (s: StreetRec) => { let L = 0; for (let i = 0; i + 3 < s.p.length; i += 2) { const mx = X((s.p[i] + s.p[i + 2]) / 2), my = Y((s.p[i + 1] + s.p[i + 3]) / 2); if (mx > LEG_W && mx < W && my > TOP && my < H - BOTTOM) L += Math.hypot(s.p[i + 2] - s.p[i], s.p[i + 3] - s.p[i + 1]); } return L; };
const isAve = (n: string) => /Avenue|Broadway|Ave\b/.test(n);
const shortName = (n: string) => n.replace(/^West /, 'W. ').replace(/^East /, 'E. ').replace(/ Street$/, ' St.').replace(/ Avenue$/, ' Ave.').replace(/^(\d+)(st|nd|rd|th) Ave\./, (m) => m);

// chrome boxes the labels must avoid
const CHROME: Box[] = [[0, 0, LEG_W + 4, H], [0, 0, W, TOP + 2]];
const underChrome = (sx: number, sy: number, r = 8) => CHROME.some((b) => sx + r > b[0] && sx - r < b[2] && sy + r > b[1] && sy - r < b[3]);

// ------------------------------------------------------------------ base layers
const clipMap = () => { g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip(); };
function drawAerial(ctx: CanvasRenderingContext2D, filter: string) {
  if (!aerial || !aerialMeta) return;
  ctx.save(); ctx.filter = filter; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(aerial, X(aerialMeta.x0), Y(aerialMeta.z0), aerialMeta.w * aerialMeta.mPerPx / VIEW.S, aerialMeta.h * aerialMeta.mPerPx / VIEW.S);
  ctx.restore();
}
function outOfBounds(ctx: CanvasRenderingContext2D, fill: string, hatch: string) {
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(X(PLAYABLE.minX), Y(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) / VIEW.S, (PLAYABLE.maxZ - PLAYABLE.minZ) / VIEW.S); ctx.clip('evenodd');
  ctx.fillStyle = fill; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hatch; ctx.lineWidth = 1; for (let d = -H; d < W; d += 6) { ctx.beginPath(); ctx.moveTo(d, H); ctx.lineTo(d + H, 0); ctx.stroke(); }
  ctx.restore();
}
/** Fog over undiscovered ground: `paint` draws the fog layer, the discovery mask cuts it away (feathered). */
function fog(paint: (ctx: CanvasRenderingContext2D) => void, feather: number, ragged = 0) {
  const [fc, fx] = off(); paint(fx);
  fx.globalCompositeOperation = 'destination-out'; fx.filter = `blur(${feather}px)`;
  if (ragged) { // an ink-bleed edge: the mask thresholded against noise instead of a smooth blur
    const [mc, mx] = off(); mx.drawImage(maskBW, 0, 0, W, H); mx.globalCompositeOperation = 'multiply'; mx.drawImage(noiseCanvas(9, 3, 7), 0, 0, W, H);
    const id = mx.getImageData(0, 0, mc.width, mc.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const v = d[i] > 70 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v; }
    mx.putImageData(id, 0, 0); fx.drawImage(mc, 0, 0, W, H);
  } else fx.drawImage(maskC, 0, 0, W, H);
  g.drawImage(fc, 0, 0, W, H);
}

// ------------------------------------------------------------------ A: aerial
function baseA() {
  g.fillStyle = '#121210'; g.fillRect(0, 0, W, H);
  drawAerial(g, 'saturate(.55) sepia(.2) brightness(2.6) contrast(1.05)');
  // roads lifted a touch so the grid reads at a glance (GTA's map does the same over its render)
  g.lineCap = 'round';
  for (const s of streets) { if (!s.n && s.w < 8) continue; g.strokeStyle = isAve(s.n) ? 'rgba(236,230,214,.16)' : 'rgba(236,230,214,.09)'; g.lineWidth = Math.max(1, s.w / VIEW.S * 0.8); polyline(g, s.p); g.stroke(); }
  fog((f) => { f.fillStyle = 'rgba(52,54,58,.86)'; f.fillRect(0, 0, W, H); f.globalCompositeOperation = 'overlay'; f.globalAlpha = .35; f.drawImage(noiseCanvas(36, 4, 3), 0, 0, W, H); }, 5);
  outOfBounds(g, 'rgba(8,8,8,.7)', 'rgba(255,255,255,.05)');
}

// ------------------------------------------------------------------ B: period atlas
let paperB: HTMLCanvasElement | null = null;
function baseB() {
  // paper: warm sheet, fibre noise, foxing at the edges
  g.fillStyle = '#efe5cb'; g.fillRect(0, 0, W, H);
  paperB = noiseCanvas(3, 2, 11);
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = .28; g.drawImage(paperB, 0, 0, W, H); g.globalAlpha = .3; g.drawImage(noiseCanvas(80, 3, 5), 0, 0, W, H); g.restore();
  // washes: blocks in a sand wash, buildings (from our render's roofs) in brick pink, parks in green
  const [wc, wx] = off();
  wx.fillStyle = 'rgba(232,206,150,.62)'; wx.fillRect(0, 0, W, H);
  if (aerial && aerialMeta) {
    const [bc, bx] = off(); drawAerialTo(bx, 'grayscale(1) brightness(1.6) contrast(1.6)');
    const id = bx.getImageData(0, 0, bc.width, bc.height), d = id.data;
    const [pc, px] = off(); drawAerialTo(px, 'none'); const pd = px.getImageData(0, 0, pc.width, pc.height).data;
    for (let i = 0; i < d.length; i += 4) {
      const roof = d[i] < 70, park = pd[i + 1] > pd[i] * 1.12 && pd[i + 1] > pd[i + 2] * 1.1 && pd[i + 1] > 40;
      if (park) { d[i] = 150; d[i + 1] = 170; d[i + 2] = 118; d[i + 3] = 150; } else if (roof && pd[i + 3]) { d[i] = 226; d[i + 1] = 160; d[i + 2] = 132; d[i + 3] = 120; } else d[i + 3] = 0;
    }
    bx.putImageData(id, 0, 0);
    wx.filter = 'blur(1.4px)'; wx.drawImage(bc, 0, 0, W, H); wx.filter = 'none';
  }
  wx.globalCompositeOperation = 'overlay'; wx.globalAlpha = .45; wx.drawImage(noiseCanvas(14, 3, 2), 0, 0, W, H);
  wx.globalCompositeOperation = 'destination-out'; wx.globalAlpha = 1; wx.lineCap = 'round';
  for (const s of streets) { wx.lineWidth = s.w / VIEW.S + 0.6; polyline(wx, s.p); wx.stroke(); }
  // undiscovered: no wash yet; ink fills in as you discover, with a ragged bleed edge
  wx.globalCompositeOperation = 'destination-in';
  const [mc, mx] = off(); mx.filter = 'blur(9px)'; mx.drawImage(maskBW, 0, 0, W, H); mx.filter = 'none'; mx.globalCompositeOperation = 'multiply'; mx.drawImage(noiseCanvas(7, 4, 7), 0, 0, W, H);
  const id = mx.getImageData(0, 0, mc.width, mc.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const v = d[i] > 70 ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = v; } mx.putImageData(id, 0, 0);
  wx.drawImage(mc, 0, 0, W, H);
  g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(wc, 0, 0, W, H); g.restore();
  // pencil: the whole grid lightly ruled (the sheet's construction lines), then inked where discovered
  g.strokeStyle = 'rgba(70,60,50,.28)'; g.lineWidth = 0.5;
  for (const s of streets) { for (const side of [-1, 1]) { g.save(); g.translate(side * s.w / VIEW.S / 2 * 0.7, 0); polyline(g, s.p); g.stroke(); g.restore(); } }
  const [ic, ix] = off(); ix.strokeStyle = '#2b2118'; ix.lineCap = 'round';
  streets.forEach((s, k) => { ix.lineWidth = s.w / VIEW.S + (isAve(s.n) ? 1.6 : 1.2); inked(ix, s.p, 0.35, k); ix.stroke(); });
  ix.globalCompositeOperation = 'destination-out'; streets.forEach((s, k) => { ix.lineWidth = Math.max(0.6, s.w / VIEW.S - 0.2); inked(ix, s.p, 0.35, k); ix.stroke(); });
  ix.globalCompositeOperation = 'destination-in'; ix.drawImage(mc, 0, 0, W, H);
  g.drawImage(ic, 0, 0, W, H);
  // the edge of this sheet's survey
  outOfBounds(g, 'rgba(236,226,201,.72)', 'rgba(70,60,50,.18)');
  g.save(); g.strokeStyle = '#2b2118'; g.lineWidth = 1.2; g.setLineDash([7, 3, 1.5, 3]); g.strokeRect(X(PLAYABLE.minX), Y(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) / VIEW.S, (PLAYABLE.maxZ - PLAYABLE.minZ) / VIEW.S); g.restore();
  // foxing and a darker deckle at the sheet edge
  const v = g.createRadialGradient(W * 0.58, H * 0.5, H * 0.35, W * 0.58, H * 0.5, W * 0.75); v.addColorStop(0, 'rgba(120,90,50,0)'); v.addColorStop(1, 'rgba(120,90,50,.28)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function drawAerialTo(ctx: CanvasRenderingContext2D, filter: string) { drawAerial(ctx, filter); }

// ------------------------------------------------------------------ C: hybrid halftone print
function baseC() {
  g.fillStyle = '#efe9dc'; g.fillRect(0, 0, W, H);
  if (aerial && aerialMeta) {
    const [ac, ax] = off(); drawAerial(ax, 'grayscale(1) brightness(3) contrast(.8)');
    const src = ax.getImageData(0, 0, ac.width, ac.height).data, cw = ac.width;
    // AM halftone at 45°, one ink; dots fade to nothing in undiscovered ground (that part of the plate isn't printed yet)
    const cell = 4.2 * DPR / 2, ang = Math.PI / 4, ca = Math.cos(ang), sa = Math.sin(ang);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#1e1b18';
    const R = Math.hypot(ac.width, ac.height);
    for (let v = -R; v < R; v += cell) for (let u = -R; u < R; u += cell) {
      const px = u * ca - v * sa + ac.width / 2, py = u * sa + v * ca + ac.height / 2;
      if (px < 0 || py < 0 || px >= ac.width || py >= ac.height) continue;
      const i = (Math.floor(py) * cw + Math.floor(px)) * 4; if (!src[i + 3]) continue;
      const m = maskData[i] / 255, k = Math.min(0.5, (1 - src[i] / 255) * 0.62); const r = cell * 0.62 * Math.sqrt(Math.max(0, k)) * (0.2 + 0.8 * m);
      if (r < 0.25) continue; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
    }
    g.restore();
  }
  // streets printed clean over the screen (the readability of A), a hairline ink edge
  g.lineCap = 'round';
  for (const s of streets) { g.strokeStyle = 'rgba(30,27,24,.55)'; g.lineWidth = s.w / VIEW.S + 0.9; polyline(g, s.p); g.stroke(); }
  for (const s of streets) { g.strokeStyle = '#f3eee2'; g.lineWidth = Math.max(0.7, s.w / VIEW.S - 0.1); polyline(g, s.p); g.stroke(); }
  outOfBounds(g, 'rgba(239,233,220,.8)', 'rgba(30,27,24,.12)');
  g.save(); g.strokeStyle = 'rgba(30,27,24,.8)'; g.lineWidth = 1; g.setLineDash([6, 3]); g.strokeRect(X(PLAYABLE.minX), Y(PLAYABLE.minZ), (PLAYABLE.maxX - PLAYABLE.minX) / VIEW.S, (PLAYABLE.maxZ - PLAYABLE.minZ) / VIEW.S); g.restore();
  // paper at the edges: grain and a soft press-sheet darkening
  g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = .12; g.drawImage(noiseCanvas(2.5, 2, 4), 0, 0, W, H); g.restore();
  const v = g.createRadialGradient(W * 0.6, H * 0.5, H * 0.45, W * 0.6, H * 0.5, W * 0.72); v.addColorStop(0, 'rgba(110,90,60,0)'); v.addColorStop(1, 'rgba(110,90,60,.22)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------------ landmark glyphs (ours: plan-view silhouettes, not logos)
const LM_GLYPH: Record<string, (c: CanvasRenderingContext2D) => void> = {
  flatiron: (c) => { c.beginPath(); c.moveTo(0, -7); c.lineTo(4.5, 6); c.lineTo(-4.5, 6); c.closePath(); c.fill(); },
  macys: (c) => { c.fillRect(-6, -3, 12, 9); c.fillRect(-6, -5, 12, 1.4); for (let i = -4; i <= 4; i += 4) c.fillRect(i - 0.5, -8, 1, 3); },
  kelsey: (c) => { c.fillRect(-4.5, -6, 9, 12); c.save(); c.globalCompositeOperation = 'destination-out'; for (let y = -4; y < 5; y += 3) c.fillRect(-3, y, 6, 0.9); c.restore(); },
  nylife: (c) => { c.fillRect(-4, -2, 8, 8); c.beginPath(); c.moveTo(-3, -2); c.lineTo(0, -8); c.lineTo(3, -2); c.closePath(); c.fill(); },
  empire: (c) => { c.fillRect(-5, 1, 10, 5); c.fillRect(-3.5, -3, 7, 4); c.fillRect(-2, -6, 4, 3); c.fillRect(-0.6, -9, 1.2, 3); },
  garden: (c) => { c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill(); c.restore(); },
  lifeline: (c) => { c.fillRect(-3, -4, 6, 10); c.beginPath(); c.moveTo(-3, -4); c.lineTo(0, -9); c.lineTo(3, -4); c.closePath(); c.fill(); c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(0, -1, 1.6, 0, 7); c.fill(); c.restore(); },
};

// ------------------------------------------------------------------ B: landmark vignettes, inked in cabinet-oblique (our drawings of our buildings)
type Mass = { w: number; d: number; h: number; x?: number; roof?: 'flat' | 'pyramid' | 'spire' | 'mast' | 'cornice' | 'drum' | 'wedge' | 'clock' };
const VIG: Record<string, { scale: number; parts: Mass[] }> = {
  flatiron: { scale: 0.62, parts: [{ w: 22, d: 46, h: 87, roof: 'wedge' }] },
  empire: { scale: 0.2, parts: [{ w: 130, d: 60, h: 25, roof: 'flat' }, { w: 90, d: 45, h: 190, x: 0, roof: 'flat' }, { w: 64, d: 32, h: 120, roof: 'flat' }, { w: 30, d: 16, h: 40, roof: 'mast' }] },
  macys: { scale: 0.5, parts: [{ w: 110, d: 60, h: 45, roof: 'cornice' }, { w: 60, d: 30, h: 14, roof: 'flat' }] },
  kelsey: { scale: 0.62, parts: [{ w: 56, d: 30, h: 50, roof: 'cornice' }] },
  nylife: { scale: 0.3, parts: [{ w: 90, d: 50, h: 120, roof: 'flat' }, { w: 40, d: 26, h: 40, roof: 'flat' }, { w: 30, d: 20, h: 30, roof: 'pyramid' }] },
  garden: { scale: 0.42, parts: [{ w: 130, d: 130, h: 46, roof: 'drum' }] },
  lifeline: { scale: 0.25, parts: [{ w: 76, d: 40, h: 60, roof: 'flat' }, { w: 42, d: 42, h: 150, roof: 'clock' }, { w: 30, d: 30, h: 26, roof: 'pyramid' }] },
};
const vigCache = new Map<string, { c: HTMLCanvasElement; w: number; h: number }>();
function vignette(id: string) {
  const hit = vigCache.get(id); if (hit) return hit;
  const spec = VIG[id]; const S = spec.scale, ox = 0.42, oy = -0.32; // oblique: depth goes up and right
  const W0 = 120, H0 = 110; const [c, x] = off(W0, H0);
  const INK = '#2b2118'; x.lineJoin = 'round'; x.lineCap = 'round';
  let base = H0 - 10, cxm = W0 / 2 - 8;
  const hatch = (poly: [number, number][], gap: number, a: number) => {
    x.save(); x.beginPath(); poly.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.clip();
    x.strokeStyle = 'rgba(43,33,24,.55)'; x.lineWidth = 0.45;
    for (let k = -200; k < 200; k += gap) { x.beginPath(); x.moveTo(-50 + k, -50); x.lineTo(-50 + k + Math.cos(a) * 400, -50 + Math.sin(a) * 400); x.stroke(); }
    x.restore();
  };
  // ground shadow and a few strokes of street
  x.strokeStyle = 'rgba(43,33,24,.4)'; x.lineWidth = 0.5; for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(8 + i * 3, base + 4 + i * 1.6); x.lineTo(W0 - 8 - i * 6, base + 4 + i * 1.6); x.stroke(); }
  for (const m of spec.parts) {
    const w = m.w * S, d = m.d * S, h = m.h * S, l = cxm - w / 2 + (m.x ?? 0) * S, t = base - h, dx = d * ox, dy = d * oy;
    if (m.roof === 'drum') {
      const rx = w / 2, ry = rx * 0.38, cx0 = l + rx;
      x.fillStyle = '#efe5cb'; x.beginPath(); x.ellipse(cx0, base, rx, ry, 0, 0, Math.PI); x.lineTo(cx0 - rx, t); x.ellipse(cx0, t, rx, ry, 0, Math.PI, 0, true); x.closePath(); x.fill();
      hatch([[cx0 + rx * 0.2, t], [cx0 + rx, t], [cx0 + rx, base], [cx0 + rx * 0.2, base + ry]], 1.6, 1.2);
      x.strokeStyle = INK; x.lineWidth = 0.9; x.beginPath(); x.ellipse(cx0, t, rx, ry, 0, 0, 7); x.stroke();
      x.beginPath(); x.moveTo(cx0 - rx, t); x.lineTo(cx0 - rx, base); x.ellipse(cx0, base, rx, ry, 0, Math.PI, 0, true); x.lineTo(cx0 + rx, t); x.stroke();
      x.lineWidth = 0.4; for (let k = 1; k < 12; k++) { const a = Math.PI * k / 12, u = cx0 - Math.cos(a) * rx; x.beginPath(); x.moveTo(u, t + Math.sin(a) * ry); x.lineTo(u, base + Math.sin(a) * ry); x.stroke(); }
      base = t; continue;
    }
    if (m.roof === 'wedge') { // the prow: a narrow front face, a long side running back
      const front: [number, number][] = [[l + w * 0.35, base], [l + w * 0.65, base], [l + w * 0.65, t], [l + w * 0.35, t]];
      const side: [number, number][] = [[l + w * 0.65, base], [l + w * 0.65 + d * 0.9, base + d * oy * 1.2], [l + w * 0.65 + d * 0.9, t + d * oy * 1.2], [l + w * 0.65, t]];
      const side2: [number, number][] = [[l + w * 0.35, base], [l - d * 0.5, base + d * oy * 1.1], [l - d * 0.5, t + d * oy * 1.1], [l + w * 0.35, t]];
      x.fillStyle = '#efe5cb'; for (const p of [side2, front, side]) { x.beginPath(); p.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.fill(); }
      hatch(side, 1.5, 1.15);
      const roofF: [number, number][] = [[l + w * 0.35, t], [l + w * 0.65, t], [l + w * 0.65 + d * 0.9, t + d * oy * 1.2], [l - d * 0.5, t + d * oy * 1.1]];
      x.fillStyle = '#e6d9b8'; x.beginPath(); roofF.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.fill();
      x.strokeStyle = INK; x.lineWidth = 0.9; x.stroke();
      x.strokeStyle = INK; x.lineWidth = 0.9; for (const p of [side2, front, side]) { x.beginPath(); p.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.stroke(); }
      x.lineWidth = 0.35; for (let y = t + 4; y < base - 2; y += 2.6) { x.beginPath(); x.moveTo(l + w * 0.65, y); x.lineTo(l + w * 0.65 + d * 0.9, y + d * oy * 1.2); x.moveTo(l + w * 0.35, y); x.lineTo(l - d * 0.5, y + d * oy * 1.1); x.stroke(); }
      x.lineWidth = 1.2; x.beginPath(); x.moveTo(l - d * 0.5, t + d * oy * 1.1 - 1.5); x.lineTo(l + w * 0.35, t - 1.5); x.lineTo(l + w * 0.65, t - 1.5); x.lineTo(l + w * 0.65 + d * 0.9, t + d * oy * 1.2 - 1.5); x.stroke();
      continue;
    }
    const front: [number, number][] = [[l, base], [l + w, base], [l + w, t], [l, t]];
    const side: [number, number][] = [[l + w, base], [l + w + dx, base + dy], [l + w + dx, t + dy], [l + w, t]];
    const top: [number, number][] = [[l, t], [l + w, t], [l + w + dx, t + dy], [l + dx, t + dy]];
    x.fillStyle = '#efe5cb'; for (const p of [front, side, top]) { x.beginPath(); p.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.fill(); }
    hatch(side, 1.5, 1.15);
    // windows: short ink ticks in rows on the lit face
    x.strokeStyle = 'rgba(43,33,24,.7)'; x.lineWidth = 0.5;
    for (let y = t + 2.5; y < base - 2; y += 2.4) for (let u = l + 1.6; u < l + w - 1; u += 1.9) { x.beginPath(); x.moveTo(u, y); x.lineTo(u, y + 1.1); x.stroke(); }
    x.strokeStyle = INK; x.lineWidth = 0.9; for (const p of [front, side, top]) { x.beginPath(); p.forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.stroke(); }
    if (m.roof === 'cornice') { x.lineWidth = 1.3; x.beginPath(); x.moveTo(l - 1, t + 1.2); x.lineTo(l + w + 1, t + 1.2); x.lineTo(l + w + dx + 1, t + dy + 1.2); x.stroke(); }
    if (m.roof === 'pyramid') { const px = l + w / 2 + dx / 2, py = t + dy / 2 - h * 1.1; x.fillStyle = 'rgba(176,122,12,.55)'; x.beginPath(); x.moveTo(l, t); x.lineTo(px, py); x.lineTo(l + w + dx, t + dy); x.lineTo(l + w, t); x.closePath(); x.fill(); x.lineWidth = 0.9; x.stroke(); x.beginPath(); x.moveTo(px, py); x.lineTo(l + w, t); x.stroke(); x.beginPath(); x.moveTo(px, py); x.lineTo(px, py - 4); x.stroke(); }
    if (m.roof === 'mast') { const px = l + w / 2 + dx / 2; x.lineWidth = 1; x.beginPath(); x.moveTo(px, t + dy / 2); x.lineTo(px, t + dy / 2 - 16); x.stroke(); x.lineWidth = 0.5; x.beginPath(); x.moveTo(px, t + dy / 2 - 16); x.lineTo(px, t + dy / 2 - 26); x.stroke(); }
    if (m.roof === 'clock') { const cx0 = l + w / 2, cy0 = t + 6; x.lineWidth = 0.7; x.fillStyle = '#efe5cb'; x.beginPath(); x.arc(cx0, cy0, Math.min(4.5, w / 3), 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(cx0, cy0); x.lineTo(cx0, cy0 - 2.6); x.moveTo(cx0, cy0); x.lineTo(cx0 + 1.8, cy0); x.stroke(); }
    base = t + dy / 2; cxm += dx / 2;
  }
  // trim to the drawing, then fade the bottom into the paper
  const img = x.getImageData(0, 0, c.width, c.height), dd = img.data; let minY = c.height;
  for (let y = 0; y < c.height; y++) for (let u = 0; u < c.width; u++) if (dd[(y * c.width + u) * 4 + 3] > 10) { minY = Math.min(minY, y); break; }
  const top = Math.max(0, minY / DPR - 2), r = { c, w: W0, h: H0 - top };
  const [c2, x2] = off(W0, H0 - top); x2.drawImage(c, 0, top * DPR, c.width, c.height - top * DPR, 0, 0, W0, H0 - top);
  r.c = c2; vigCache.set(id, r); return r;
}

// ------------------------------------------------------------------ overlays: route, places, landmarks, player, labels
async function overlays() {
  const L = new LabelPlacer(W, H, 2);
  for (const b of CHROME) L.reserve(b);
  const ink = DIR === 'A' ? '#f2ede2' : '#1e1b18', halo = DIR === 'A' ? 'rgba(10,10,10,.85)' : DIR === 'B' ? 'rgba(236,226,201,.9)' : 'rgba(243,238,226,.92)';

  // route
  if (route) {
    const p = route.pts;
    if (DIR === 'B') { // red crayon, wobbling, over the ink
      g.strokeStyle = 'rgba(170,40,30,.85)'; g.lineWidth = 3; g.lineCap = g.lineJoin = 'round'; inked(g, p, 0.9, 3); g.stroke();
      g.strokeStyle = 'rgba(170,40,30,.35)'; g.lineWidth = 1.2; inked(g, p, 1.4, 9); g.stroke();
    } else {
      g.lineCap = g.lineJoin = 'round';
      g.strokeStyle = DIR === 'A' ? 'rgba(0,0,0,.75)' : 'rgba(30,27,24,.9)'; g.lineWidth = DIR === 'A' ? 6.5 : 5.5; polyline(g, p); g.stroke();
      g.strokeStyle = TAXI; g.lineWidth = DIR === 'A' ? 3.6 : 3; polyline(g, p); g.stroke();
    }
    for (let i = 0; i + 3 < p.length; i += 2) L.reserve([Math.min(X(p[i]), X(p[i + 2])) - 3, Math.min(Y(p[i + 1]), Y(p[i + 3])) - 3, Math.max(X(p[i]), X(p[i + 2])) + 3, Math.max(Y(p[i + 1]), Y(p[i + 3])) + 3]);
  }

  // icons first (they reserve their space), then type
  const icon = (cat: Category, sx: number, sy: number, size: number) => {
    const style = DIR === 'A' ? 'disc' : 'print';
    const story = cat === 'mission' || cat === 'home';
    const sp = pictogram(cat, size, DPR, style, DIR === 'B' ? (story ? '#a8281e' : '#2b2118') : DIR === 'C' ? (story ? '#b07a0c' : '#1e1b18') : undefined);
    g.drawImage(sp, sx - size / 2, sy - size / 2, size, size);
    L.reserve([sx - size / 2 - 1, sy - size / 2 - 1, sx + size / 2 + 1, sy + size / 2 + 1]);
  };
  const drawn: { p: Place; sx: number; sy: number }[] = [];
  for (const p of places) {
    const sx = X(p.x), sy = Y(p.z), size = p.cat === 'mission' || p.cat === 'home' ? 17 : 14;
    if (drawn.some((d) => Math.hypot(d.sx - sx, d.sy - sy) < 13) || underChrome(sx, sy)) continue; // de-clutter at this zoom (cluster); never under a panel
    icon(p.cat, sx, sy, size); drawn.push({ p, sx, sy });
  }
  // tips in the fog
  for (const t of TIPS) {
    const sx = X(t.x), sy = Y(t.z);
    g.save(); g.globalAlpha = .9; g.fillStyle = DIR === 'A' ? 'rgba(242,237,226,.16)' : 'rgba(30,27,24,.06)'; g.strokeStyle = DIR === 'A' ? 'rgba(242,237,226,.7)' : DIR === 'B' ? 'rgba(43,33,24,.7)' : 'rgba(30,27,24,.7)';
    g.setLineDash([2, 2]); g.lineWidth = 1; g.beginPath(); g.arc(sx, sy, 7, 0, 7); g.fill(); g.stroke(); g.setLineDash([]);
    g.fillStyle = g.strokeStyle; g.font = `700 10px ${DIR === 'B' ? F_BODY : F_UI}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', sx, sy + 0.5); g.restore();
    L.reserve([sx - 8, sy - 8, sx + 8, sy + 8]);
  }

  L.reserve([X(PLAYER.x) - 10, Y(PLAYER.z) - 10, X(PLAYER.x) + 10, Y(PLAYER.z) + 10]);
  L.reserve([X(DEST.x) - 2, Y(DEST.z) - 17, X(DEST.x) + 11, Y(DEST.z) + 1]);
  const vigLabel = new Map<string, [number, number]>(); // B: where each landmark's name goes (under its drawing)
  // landmarks: B gets ink vignettes (our 3D landmarks, drawn as ink), A and C get distinct silhouette glyphs
  for (const h of HEROES) {
    const sx = X(h.x), sy = Y(h.z);
    if (sx < LEG_W || sx > W || sy < TOP || sy > H - BOTTOM || underChrome(sx, sy, 10)) continue;
    if (DIR === 'B') {
      // a drawing of the building, placed in the first free spot around its location, with a hairline to the spot
      const v = vignette(h.id);
      let placed = false;
      for (const k of [0.62, 0.48]) { if (placed) break; const hh = v.h * k, ww = v.w * k;
      const spots: [number, number][] = [[0, 0], [ww * 0.55, 0], [-ww * 0.55, 0], [ww * 0.6, hh * 0.55], [-ww * 0.6, hh * 0.55], [0, hh + 10], [ww * 0.6, hh + 6], [-ww * 0.6, hh + 6],
        [-ww * 1.1, 0], [ww * 1.1, 0], [-ww * 1.1, -hh * 0.4], [ww * 1.1, -hh * 0.4], [-ww * 1.6, 0], [ww * 1.6, 0]];
      for (const [ox, oy] of spots) {
        const bx = sx + ox, by = sy + oy; // by = the drawing's base line
        const box: Box = [bx - ww * 0.34, by - hh + 4, bx + ww * 0.34, by + 13];
        if (box[1] < TOP + 2 || box[3] > H - 2 || box[2] > W - 2 || box[0] < LEG_W + 2 || !L.free(box)) continue;
        L.reserve(box);
        g.drawImage(v.c, bx - ww / 2, by - hh + 2, ww, hh);
        if (ox || oy) { g.save(); g.strokeStyle = 'rgba(43,33,24,.55)'; g.lineWidth = 0.6; g.setLineDash([2, 1.5]); g.beginPath(); g.moveTo(sx, sy); g.lineTo(bx, by - 2); g.stroke(); g.restore(); }
        g.save(); g.fillStyle = '#2b2118'; g.beginPath(); g.arc(sx, sy, 1.8, 0, 7); g.fill(); g.restore();
        vigLabel.set(h.id, [bx, by + 10]);
        placed = true; break;
      } }
      if (placed) continue; // otherwise fall through to the glyph
    }
    const sz = 22;
    g.save(); g.translate(sx, sy);
    if (DIR === 'A') { g.fillStyle = 'rgba(10,10,10,.82)'; g.beginPath(); g.arc(0, 0, sz / 2, 0, 7); g.fill(); g.strokeStyle = 'rgba(242,237,226,.9)'; g.lineWidth = 1.2; g.stroke(); g.fillStyle = '#f2ede2'; }
    else { g.fillStyle = '#efe9dc'; g.beginPath(); g.arc(0, 0, sz / 2, 0, 7); g.fill(); g.strokeStyle = '#1e1b18'; g.lineWidth = 1.4; g.stroke(); g.fillStyle = '#1e1b18'; }
    g.scale(0.95, 0.95); LM_GLYPH[h.id]?.(g); g.restore();
    L.reserve([sx - sz / 2 - 1, sy - sz / 2 - 1, sx + sz / 2 + 1, sy + sz / 2 + 1]);
  }

  // player
  g.save(); g.translate(X(PLAYER.x), Y(PLAYER.z)); g.rotate(PLAYER.yaw);
  g.fillStyle = DIR === 'B' ? '#a8281e' : DIR === 'A' ? '#f2ede2' : TAXI; g.strokeStyle = DIR === 'A' ? '#0a0a0a' : '#1e1b18'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.stroke(); g.fill(); g.restore();
  L.reserve([X(PLAYER.x) - 10, Y(PLAYER.z) - 10, X(PLAYER.x) + 10, Y(PLAYER.z) + 10]);
  // destination flag
  { const sx = X(DEST.x), sy = Y(DEST.z); g.save(); g.fillStyle = DIR === 'B' ? '#a8281e' : TAXI; g.strokeStyle = DIR === 'A' ? '#000' : '#1e1b18'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy - 16); g.lineTo(sx + 10, sy - 12); g.lineTo(sx, sy - 8); g.stroke(); g.fill(); g.restore(); L.reserve([sx - 2, sy - 17, sx + 11, sy + 1]); }

  // landmark names (priority), then districts, avenues, cross streets, then place names
  const lmFont = DIR === 'B' ? `italic 700 11px ${F_BODY}` : `700 10.5px ${F_COND}`;
  for (const h of HEROES) {
    const sx = X(h.x), sy = Y(h.z); if (sx < LEG_W || sx > W || sy < TOP || sy > H) continue;
    const at = vigLabel.get(h.id);
    if (at) { g.save(); g.font = lmFont; { const tw = g.measureText(h.name).width / 2; at[0] = Math.min(W - 6 - tw, Math.max(LEG_W + 6 + tw, at[0])); } L.reserve([at[0] - 40, at[1] - 10, at[0] + 40, at[1] + 3]); g.textAlign = 'center'; g.lineJoin = 'round'; g.lineWidth = 2.6; g.strokeStyle = halo; g.strokeText(h.name, at[0], at[1]); g.fillStyle = ink; g.fillText(h.name, at[0], at[1]); g.restore(); continue; }
    labelPoint(L, h.name, sx, sy, lmFont, ink, halo, 22);
  }
  const DIST = [{ t: 'CHELSEA', x: -1000, z: -170 }, { t: 'TENDERLOIN', x: -330, z: -470 }, { t: 'HERALD SQ.', x: -330, z: -800 }, { t: 'MADISON SQ.', x: 150, z: -190 }, { t: 'GARMENT CENTER', x: -700, z: -560 }];
  for (const d of DIST) {
    const sx = X(d.x), sy = Y(d.z);
    const font = DIR === 'B' ? `400 13px ${F_BODY}` : `700 13px ${F_COND}`;
    g.save(); g.font = font; (g as unknown as { letterSpacing: string }).letterSpacing = DIR === 'B' ? '0.32em' : '0.26em';
    const w = g.measureText(d.t).width, b: Box = [sx - w / 2, sy - 11, sx + w / 2, sy + 3];
    if (L.free(b)) { L.reserve(b); g.textAlign = 'center'; g.fillStyle = DIR === 'A' ? 'rgba(242,237,226,.5)' : DIR === 'B' ? 'rgba(43,33,24,.55)' : 'rgba(30,27,24,.45)'; g.fillText(d.t, sx, sy); }
    g.restore();
  }
  const byLen = [...named.entries()].map(([n, recs]) => ({ n, recs, len: recs.reduce((a, s) => a + visibleLen(s), 0) })).filter((e) => e.len > 120).sort((a, b) => (isAve(b.n) ? 1 : 0) - (isAve(a.n) ? 1 : 0) || b.len - a.len);
  const stFont = DIR === 'B' ? `italic 400 9.5px ${F_BODY}` : `700 8.5px ${F_COND}`;
  for (const e of byLen) {
    const s = e.recs.reduce((a, b) => (visibleLen(b) > visibleLen(a) ? b : a));
    const pts: number[] = []; for (let i = 0; i < s.p.length; i += 2) if (inPlay(s.p[i], s.p[i + 1])) pts.push(X(s.p[i]), Y(s.p[i + 1])); // names only inside the playable sheet
    if (pts.length < 4) continue;
    const text = DIR === 'B' ? shortName(e.n) : shortName(e.n).toUpperCase();
    lineLabel(L, text, pts, stFont, ink, halo);
  }
  for (const d of drawn) if (['mission', 'home', 'police', 'hospital'].includes(d.p.cat)) labelPoint(L, d.p.name.split(',')[0], d.sx, d.sy, DIR === 'B' ? `italic 400 9.5px ${F_BODY}` : `600 9px ${F_UI}`, ink, halo, 16);
}
/** A street name set along its line (candidates along the street), with a halo, using the shared placer's collision boxes. */
function lineLabel(L: LabelPlacer, text: string, pts: number[], font: string, ink: string, halo: string) {
  g.save(); g.font = font; if (DIR !== 'B') (g as unknown as { letterSpacing: string }).letterSpacing = '0.06em';
  const w = g.measureText(text).width, h = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '9');
  for (const f of [0.5, 0.35, 0.65, 0.2, 0.8, 0.12, 0.9]) {
    const k = Math.max(0, Math.min(pts.length / 2 - 2, Math.floor((pts.length / 2 - 1) * f))) * 2;
    // widen the span along the polyline until it carries the name (avenues are many one-block segments)
    let k2 = k + 2; while (k2 + 1 < pts.length && Math.hypot(pts[k2] - pts[k], pts[k2 + 1] - pts[k + 1]) < w + 8) k2 += 2;
    const ax = pts[k], ay = pts[k + 1], bx = pts[k2], by = pts[k2 + 1]; if (bx === undefined) continue;
    if (Math.hypot(bx - ax, by - ay) < w + 6) continue;
    if ((ax + bx) / 2 < LEG_W || (ay + by) / 2 < TOP) continue;
    let ang = Math.atan2(by - ay, bx - ax); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, c = Math.cos(ang), sn = Math.sin(ang);
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].map(([u, v]) => [mx + u * c - v * sn, my + u * sn + v * c]);
    const b: Box = [Math.min(...corners.map((q) => q[0])), Math.min(...corners.map((q) => q[1])), Math.max(...corners.map((q) => q[0])), Math.max(...corners.map((q) => q[1]))];
    if (!L.free(b)) continue;
    L.reserve(b);
    g.translate(mx, my); g.rotate(ang); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 2.6; g.strokeStyle = halo; g.strokeText(text, 0, 0.5); g.fillStyle = ink; g.fillText(text, 0, 0.5);
    break;
  }
  g.restore();
}
function labelPoint(L: LabelPlacer, text: string, sx: number, sy: number, font: string, ink: string, halo: string, symbol: number) {
  g.save(); g.font = font; g.lineJoin = 'round';
  // place with the placer, then draw halo + ink at the same spot (point labels store no candidate, so recompute)
  const w = g.measureText(text).width, h = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? '10'), s = symbol / 2 + 3;
  const cands: [number, number][] = [[s, h * 0.35], [-s - w, h * 0.35], [-w / 2, -s - 2], [-w / 2, s + h], [s, -s], [s, s + h * 0.6], [-s - w, -s], [-s - w, s + h * 0.6]];
  for (const [dx, dy] of cands) {
    const b: Box = [sx + dx, sy + dy - h * 0.8, sx + dx + w, sy + dy + h * 0.25];
    if (!L.free(b)) continue;
    L.reserve(b); g.textAlign = 'left'; g.lineWidth = 2.6; g.strokeStyle = halo; g.strokeText(text, sx + dx, sy + dy); g.fillStyle = ink; g.fillText(text, sx + dx, sy + dy);
    break;
  }
  g.restore();
}

// ------------------------------------------------------------------ chrome (HTML, our type system)
function chrome() {
  const legend = [
    { cat: 'mission' as Category, label: 'Story', n: 2, on: true },
    { cat: 'landmark' as Category, label: 'Landmarks', n: 7, on: true },
    { cat: 'home' as Category, label: 'Yours', n: 1, on: true },
    { cat: 'food' as Category, label: 'Eat & drink', n: places.filter((p) => p.cat === 'food' || p.cat === 'bar').length, on: true },
    { cat: 'shop' as Category, label: 'Shops', n: places.filter((p) => p.cat === 'shop' || p.cat === 'clothes').length, on: true },
    { cat: 'subway' as Category, label: 'Subway', n: places.filter((p) => p.cat === 'subway').length, on: true },
    { cat: 'payphone' as Category, label: 'Payphones', n: 15, on: false },
    { cat: 'service' as Category, label: 'Services', n: places.filter((p) => ['service', 'police', 'hospital', 'garage'].includes(p.cat)).length, on: true },
    { cat: 'crime' as Category, label: 'Trouble', n: places.filter((p) => p.cat === 'crime').length, on: true },
  ];
  const icon = (c: Category) => pictogram(c, 14, DPR, DIR === 'A' ? 'disc' : 'print').toDataURL();
  const el = document.getElementById('chrome')!;
  el.innerHTML = `
    <nav class="tabs"><b class="on">Map</b><span>Pockets</span><span>Paper</span><span>Business</span><span>Cars</span><span>Record</span><span>System</span><i>Resume ✕</i></nav>
    <aside class="legend">
      <section class="card"><small>${DIR === 'B' ? 'Waypoint · Landmark' : 'Waypoint · Landmark'}</small><b>Lacy's, Herald Square</b><span>${route ? `${(route.length / 1609).toFixed(1)} mi on foot · ${Math.round(route.length / 1.35 / 60)} min` : ''}</span></section>
      <header><b>${DIR === 'B' ? 'Index' : 'Legend'}</b><span>${places.length + 7} known</span></header>
      <ul>${legend.map((l) => `<li class="${l.on ? '' : 'off'}"><img src="${icon(l.cat)}" alt=""><span>${l.label}</span><em>${l.n}</em></li>`).join('')}</ul>
      <div class="fogkey"><i></i>${DIR === 'B' ? 'Not yet surveyed' : 'Not yet explored'}</div>
      <div class="tools"><button aria-label="Centre on me">◎ Me</button><button aria-label="Erase route">✕ Route</button><span><kbd>Hold</kbd> waypoint</span></div>
      <div class="odbl">Map data © OpenStreetMap contributors, ODbL · NYC Open Data</div>
      </aside>
`;
}

// ------------------------------------------------------------------ go
clipMap();
if (DIR === 'A') baseA(); else if (DIR === 'B') baseB(); else baseC();
if (DIR === 'B') { /* the compass, the sheet's one decorative gesture */
  const cx = LEG_W + 30, cy = TOP + 34; g.save(); g.translate(cx, cy); g.strokeStyle = '#2b2118'; g.fillStyle = '#2b2118'; g.lineWidth = 0.8;
  g.beginPath(); g.arc(0, 0, 13, 0, 7); g.stroke(); g.beginPath(); g.moveTo(0, -18); g.lineTo(3, 0); g.lineTo(0, 18); g.lineTo(-3, 0); g.closePath(); g.stroke(); g.beginPath(); g.moveTo(0, -18); g.lineTo(3, 0); g.lineTo(-3, 0); g.closePath(); g.fill();
  g.font = `italic 700 9px ${F_BODY}`; g.textAlign = 'center'; g.fillText('N', 0, -21); g.restore(); CHROME.push([cx - 22, cy - 32, cx + 22, cy + 22]);
}
await overlays();
g.restore();
chrome();
(window as unknown as { __MOCK_READY: boolean }).__MOCK_READY = true;
