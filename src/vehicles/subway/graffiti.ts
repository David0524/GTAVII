/**
 * 1970s subway graffiti, procedurally painted onto canvases: whole-car pieces with bubble and
 * angular letters, throw-ups, marker tags, drips, stars and arrows.
 *
 * All tags are ORIGINAL. The narrative stream supplies the canonical tag set via setGraffitiTags();
 * until then tags are generated from syllables and checked against a blocklist of famous
 * real writers' names, so we never reproduce a real writer's tag.
 */
import { rng } from '../gen/rng';

let TAGS: string[] | null = null;
/** Narrative hook: the tags (writer names / crews) that appear on trains and walls. */
export function setGraffitiTags(tags: string[]) { TAGS = tags.length ? tags.map((t) => t.toUpperCase()) : null; }

/** Well-known real 1970s writers / crews we must not reproduce (partial; extend as needed). */
const BLOCK = new Set(['TAKI', 'LEE', 'DONDI', 'SEEN', 'BLADE', 'PHASE', 'STAYHIGH', 'SUPER KOOL', 'COMET', 'FAB', 'LADY PINK', 'DAZE', 'CRASH', 'ZEPHYR', 'FUTURA', 'RAMMELLZEE', 'TRACY', 'IZ', 'CLIFF', 'MIN', 'NOC', 'KASE', 'SKEME', 'DURO', 'MITCH', 'PNUT', 'JUNIOR', 'CAINE', 'MICO', 'STAY', 'RIFF', 'HONDO', 'TF5', 'TPA', 'TMB', 'TC5']);
const ONSET = ['K', 'Z', 'V', 'R', 'T', 'D', 'B', 'S', 'M', 'N', 'J', 'GR', 'KR', 'ST', 'SL', 'BR', 'PL', 'Q', 'X', 'W'];
const NUC = ['A', 'O', 'E', 'I', 'U', 'OO', 'AY'];
const CODA = ['', '', 'X', 'K', 'Z', 'N', 'M', 'R', 'S', 'TT', 'KE'];

function makeTag(r: () => number): string {
  for (let k = 0; k < 20; k++) {
    const syl = 1 + Math.floor(r() * 2);
    let w = '';
    for (let i = 0; i < syl; i++) w += ONSET[Math.floor(r() * ONSET.length)] + NUC[Math.floor(r() * NUC.length)] + (i === syl - 1 ? CODA[Math.floor(r() * CODA.length)] : '');
    if (w.length > 7) w = w.slice(0, 7);
    if (!BLOCK.has(w)) return r() < 0.45 ? `${w} ${1 + Math.floor(r() * 199)}` : r() < 0.2 ? `${w} II` : w;
  }
  return 'ZOKA';
}
const tag = (r: () => number) => (TAGS ? TAGS[Math.floor(r() * TAGS.length)] : makeTag(r));

const PAINT = ['#e33a2c', '#f08a24', '#f5d03a', '#8cc63e', '#3fa9e0', '#7b4bb3', '#f2f2ee', '#e85aa0', '#2c8f6e', '#c9c9c4'];
const FONT = '"League Gothic", Impact, "Arial Black", sans-serif';
const HAND = '"Courier Prime", "Comic Sans MS", cursive';

function pick<T>(a: T[], r: () => number) { return a[Math.floor(r() * a.length)]; }

function drips(g: CanvasRenderingContext2D, x0: number, x1: number, y: number, col: string, r: () => number, n: number) {
  g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round';
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + 8 + r() * 40); g.stroke(); }
}

function star(g: CanvasRenderingContext2D, x: number, y: number, rad: number, col: string) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? rad * 0.45 : rad; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}

/** A big piece: chunky letters with an outline, a 3D drop shadow, highlights, arrows, drips. */
function piece(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, r: () => number) {
  const fill = pick(PAINT, r), out = r() < 0.5 ? '#111' : pick(PAINT, r), shadow = pick(['#111', '#2a1a40', '#5a1a14'], r);
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((r() - 0.5) * 0.12);
  g.font = `${h}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sx = Math.min(1.6, w / Math.max(1, g.measureText(text).width));
  g.scale(sx, 1);
  g.lineJoin = 'round';
  // background cloud
  if (r() < 0.6) { g.fillStyle = pick(PAINT, r); g.globalAlpha = 0.85; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc((r() - 0.5) * w / sx, (r() - 0.5) * h * 0.7, h * (0.25 + r() * 0.3), 0, Math.PI * 2); g.fill(); } g.globalAlpha = 1; }
  // 3D drop shadow
  g.fillStyle = shadow;
  for (let k = 8; k > 0; k--) g.fillText(text, k * 1.5, k * 1.5);
  // fat outline + fill
  g.strokeStyle = out; g.lineWidth = h * 0.16; g.strokeText(text, 0, 0);
  const gr = g.createLinearGradient(0, -h / 2, 0, h / 2);
  gr.addColorStop(0, fill); gr.addColorStop(1, pick(PAINT, r));
  g.fillStyle = gr; g.fillText(text, 0, 0);
  // highlights
  g.strokeStyle = '#ffffffcc'; g.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const hx = (r() - 0.5) * w / sx * 0.8, hy = -h * 0.25 + r() * h * 0.2; g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx + 8, hy - 4); g.stroke(); }
  g.restore();
  // arrows and stars
  g.strokeStyle = out; g.fillStyle = out; g.lineWidth = 6;
  if (r() < 0.7) { const ax = x + w * (0.8 + r() * 0.15), ay = y + h * 0.15; g.beginPath(); g.moveTo(ax - 40, ay + 30); g.quadraticCurveTo(ax, ay + 10, ax + 25, ay - 15); g.stroke(); g.beginPath(); g.moveTo(ax + 25, ay - 15); g.lineTo(ax + 5, ay - 12); g.lineTo(ax + 18, ay + 4); g.fill(); }
  for (let i = 0; i < 3; i++) if (r() < 0.6) star(g, x + r() * w, y + r() * h * 0.3, 8 + r() * 10, '#ffffff');
  drips(g, x + w * 0.1, x + w * 0.9, y + h * 0.82, fill, r, 10);
}

/** Throw-up: two or three quick bubble letters, one fill, one outline. */
function throwUp(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, r: () => number) {
  const t = text.replace(/[^A-Z]/g, '').slice(0, 3) || 'ZK';
  g.save(); g.font = `${h}px ${FONT}`; g.lineJoin = 'round'; g.textBaseline = 'top';
  g.strokeStyle = r() < 0.5 ? '#111' : '#f2f2ee'; g.lineWidth = h * 0.2; g.strokeText(t, x, y);
  g.fillStyle = pick(['#c9c9c4', '#f2f2ee', '#f5d03a', '#e33a2c'], r); g.fillText(t, x, y);
  g.restore();
}

/** Marker / spray-can tag: handwriting with a crown, halo, underline or star. */
function markerTag(g: CanvasRenderingContext2D, text: string, x: number, y: number, h: number, col: string, r: () => number) {
  g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.3);
  g.font = `italic 700 ${h}px ${HAND}`; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(2, h * 0.06);
  g.fillText(text, 0, 0);
  const w = g.measureText(text).width;
  const deco = r();
  if (deco < 0.3) { g.beginPath(); g.moveTo(-4, h * 0.25); g.quadraticCurveTo(w / 2, h * 0.55, w + 10, h * 0.1); g.stroke(); }
  else if (deco < 0.5) { g.beginPath(); for (let i = 0; i < 3; i++) { g.moveTo(w * 0.2 + i * 10, -h * 0.9); g.lineTo(w * 0.2 + i * 10 + 5, -h * 1.25); g.lineTo(w * 0.2 + i * 10 + 10, -h * 0.9); } g.stroke(); }
  else if (deco < 0.65) star(g, w + 12, -h * 0.4, h * 0.3, col);
  g.restore();
}

export interface GraffitiOpts { seed: number; coverage: number /* 0 clean .. 1 bombed top to bottom */ }

/** Exterior side canvas (length x height maps to the car side). */
export function paintCarSide(w: number, h: number, o: GraffitiOpts): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(o.seed * 2654435761);
  // pieces: whole-car or window-down, a couple per side
  const nPieces = o.coverage > 0.7 ? 3 : o.coverage > 0.3 ? 2 : o.coverage > 0.1 ? 1 : 0;
  for (let i = 0; i < nPieces; i++) {
    const pw = w / nPieces;
    const topToBottom = o.coverage > 0.8 && r() < 0.5;
    piece(g, tag(r).split(' ')[0], i * pw + pw * 0.04, topToBottom ? h * 0.05 : h * 0.42, pw * 0.92, topToBottom ? h * 0.85 : h * 0.5, r);
  }
  // throw-ups and tags fill the gaps
  const nThrow = Math.round(o.coverage * 8);
  for (let i = 0; i < nThrow; i++) throwUp(g, tag(r), r() * w * 0.92, h * (0.5 + r() * 0.3), h * (0.18 + r() * 0.12), r);
  const nTags = Math.round(4 + o.coverage * 40);
  for (let i = 0; i < nTags; i++) markerTag(g, tag(r), r() * w * 0.95, h * (0.15 + r() * 0.8), h * (0.05 + r() * 0.07), pick(['#111', '#111', '#3a2a7a', '#9a1a1a', '#f2f2ee', '#2c8f6e'], r), r);
  return c;
}

/** Interior wall panel: marker tags, scratchiti, a few stickers' ghosts. */
export function paintInterior(w: number, h: number, o: GraffitiOpts): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(o.seed * 97 + 13);
  const n = Math.round(6 + o.coverage * 60);
  for (let i = 0; i < n; i++) markerTag(g, tag(r), r() * w * 0.95, h * (0.1 + r() * 0.85), h * (0.04 + r() * 0.06), pick(['#111', '#111', '#111', '#1d2a6a', '#7a1414', '#3a3a3a'], r), r);
  // scratched lines (scratchiti)
  g.strokeStyle = '#ffffff55'; g.lineWidth = 1;
  for (let i = 0; i < n / 3; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + (r() - 0.3) * 40, y + (r() - 0.5) * 20); g.stroke(); }
  return c;
}

/** The car-card ad strip above the windows: invented period products, no real brands. */
export function paintCarCards(w: number, h: number, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = rng(seed * 31 + 5);
  const ADS = ['ACE TYPEWRITER REPAIR — 7TH AVE', 'DR. KAPLAN — CORNS · BUNIONS · 34TH ST', 'LEARN TO TYPE IN 30 DAYS', 'NORWOOD RYE — THE CITY LOAF', 'GET YOUR HIGH SCHOOL DIPLOMA AT NIGHT', 'PALOMA CIGARETTES', 'CALL 212-555-0199 FOR A FREE ESTIMATE', 'SAVE AT EMPIRE BOROUGH SAVINGS', 'HALLORAN TRUCKS — BUILT FOR THE CITY', 'SPEND A WEEKEND IN THE CATSKILLS'];
  const cw = 260;
  for (let x = 0; x < w; x += cw) {
    g.fillStyle = pick(['#f0e6c8', '#d84a2c', '#2c4a7a', '#f5d03a', '#ffffff', '#3a6a3a'], r); g.fillRect(x + 4, 4, cw - 8, h - 8);
    g.fillStyle = '#111'; g.font = `600 ${Math.floor(h * 0.22)}px Archivo, Helvetica, sans-serif`; g.textBaseline = 'middle';
    const ad = pick(ADS, r).split(' ');
    let line = '', y = h * 0.3;
    for (const word of ad) { if (g.measureText(line + word).width > cw - 24) { g.fillText(line, x + 12, y); line = ''; y += h * 0.27; } line += word + ' '; }
    g.fillText(line, x + 12, y);
    if (r() < 0.6) markerTag(g, tag(r), x + 20 + r() * 120, h * 0.8, h * 0.18, '#111', r);
  }
  return c;
}
