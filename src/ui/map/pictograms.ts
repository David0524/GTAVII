/**
 * Period map pictograms: small, bold, transit-sign style glyphs drawn with Canvas2D paths (no icon
 * fonts, no images, so they cost no download and stay crisp at any DPR). Each category gets a
 * coloured disc with a cream glyph. Sprites are rasterised once per (category, size, dpr) and
 * blitted, so drawing 100 icons a frame is 100 drawImage calls.
 * The red cross is a protected emblem, so the hospital uses an H.
 */
import { CATEGORIES, type Category } from './places';

type G = CanvasRenderingContext2D;
const GLYPH: Record<Category, (g: G) => void> = {
  home: (g) => { g.beginPath(); g.moveTo(-5, 0); g.lineTo(0, -5); g.lineTo(5, 0); g.lineTo(3.5, 0); g.lineTo(3.5, 5); g.lineTo(-3.5, 5); g.lineTo(-3.5, 0); g.closePath(); g.fill(); },
  safehouse: (g) => { GLYPH.home(g); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-1, 1.5, 2, 3.5); g.restore(); },
  property: (g) => { g.font = '800 11px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 0.5); },
  forsale: (g) => { g.fillRect(-5, -4, 10, 6); g.fillRect(-0.8, 2, 1.6, 4); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-3.5, -2.5, 7, 1); g.fillRect(-3.5, -0.5, 5, 1); g.restore(); },
  food: (g) => { // cup and saucer with steam
    g.beginPath(); g.moveTo(-4.5, -1); g.lineTo(3, -1); g.lineTo(2.2, 3.5); g.lineTo(-3.7, 3.5); g.closePath(); g.fill();
    g.lineWidth = 1.3; g.beginPath(); g.arc(3.6, 0.8, 1.6, -1.4, 1.4); g.stroke(); g.fillRect(-5.5, 4, 10, 1.2);
    g.beginPath(); g.moveTo(-2, -2.5); g.quadraticCurveTo(-3, -4, -1.6, -5.5); g.moveTo(0.8, -2.5); g.quadraticCurveTo(-0.2, -4, 1.2, -5.5); g.stroke();
  },
  bar: (g) => { g.beginPath(); g.moveTo(-5, -5); g.lineTo(5, -5); g.lineTo(0.8, 0); g.lineTo(0.8, 3.5); g.lineTo(3, 4.6); g.lineTo(-3, 4.6); g.lineTo(-0.8, 3.5); g.lineTo(-0.8, 0); g.closePath(); g.fill(); },
  clothes: (g) => { g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -2); g.lineTo(-5.5, 3); g.lineTo(5.5, 3); g.closePath(); g.stroke(); g.beginPath(); g.arc(0, -3.6, 1.6, Math.PI * 0.9, Math.PI * 2.3); g.stroke(); },
  shop: (g) => { // awning storefront
    g.beginPath(); g.moveTo(-5.5, -2); g.lineTo(-4.5, -5); g.lineTo(4.5, -5); g.lineTo(5.5, -2); g.closePath(); g.fill();
    g.fillRect(-4.5, -1, 9, 6); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-3, 0.5, 2.8, 4.5); g.fillRect(1, 0.5, 2, 2); g.restore();
  },
  garage: (g) => { g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(-3.5, 3.5); g.lineTo(2, -2); g.stroke(); g.beginPath(); g.arc(3, -3, 2.6, 0, Math.PI * 2); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(2.5, -6, 1.6, 3.5); g.restore(); },
  payphone: (g) => { g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.arc(0, 1.5, 5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.beginPath(); g.ellipse(-4.2, -0.2, 2, 1.4, -0.6, 0, Math.PI * 2); g.ellipse(4.2, -0.2, 2, 1.4, 0.6, 0, Math.PI * 2); g.fill(); g.fillRect(-1, 3, 2, 2.5); },
  callbox: (g) => { // red post with a lamp
    g.fillRect(-1.3, -2, 2.6, 7.5); g.fillRect(-3.2, -3.5, 6.4, 4); g.beginPath(); g.arc(0, -4.4, 1.6, 0, Math.PI * 2); g.fill();
  },
  subway: (g) => { // globe lamp on a post (entrance globes), not any transit logo
    g.beginPath(); g.arc(0, -2, 3.6, 0, Math.PI * 2); g.fill(); g.fillRect(-0.9, 1.5, 1.8, 4); g.fillRect(-2.5, 4.4, 5, 1.2);
  },
  service: (g) => { // scissors
    g.lineWidth = 1.4; g.beginPath(); g.arc(-2.6, 3, 1.8, 0, Math.PI * 2); g.moveTo(4.4, 3); g.arc(2.6, 3, 1.8, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-1.5, 1.5); g.lineTo(3, -5.5); g.moveTo(1.5, 1.5); g.lineTo(-3, -5.5); g.stroke();
  },
  police: (g) => { g.beginPath(); g.moveTo(0, -5.5); g.lineTo(5, -3.5); g.lineTo(4, 2); g.lineTo(0, 5.5); g.lineTo(-4, 2); g.lineTo(-5, -3.5); g.closePath(); g.fill(); },
  hospital: (g) => { g.font = '800 11px Archivo, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 0, 0.5); },
  crime: (g) => { // fedora
    g.beginPath(); g.ellipse(0, 2.5, 6, 1.6, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(-3.6, 2); g.lineTo(-3, -3.5); g.quadraticCurveTo(0, -1.5, 3, -3.5); g.lineTo(3.6, 2); g.closePath(); g.fill();
  },
  job: (g) => { g.fillRect(-5, -2, 10, 7); g.lineWidth = 1.3; g.strokeRect(-2, -4.5, 4, 2.5); },
  stranger: (g) => { g.font = '800 12px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 0.5); },
  mission: (g) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 5.6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); },
  landmark: (g) => { g.fillRect(-1.6, -5.5, 3.2, 11); g.fillRect(-4, -1, 8, 6.5); },
  collectible: (g) => { g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 0); g.lineTo(0, 5); g.lineTo(-4, 0); g.closePath(); g.fill(); },
};

const cache = new Map<string, HTMLCanvasElement>();
const INK = '#f3ead2';

/** A sprite of `size` CSS px (disc diameter) at `dpr`. 'print' = ink-only on paper for the folding map. */
export function pictogram(cat: Category, size: number, dpr: number, style: 'disc' | 'print' = 'disc', colourOverride?: string): HTMLCanvasElement {
  const key = `${cat}|${size}|${dpr}|${style}|${colourOverride ?? ''}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  const px = Math.ceil((size + 4) * dpr);
  c.width = c.height = px;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr); g.translate((size + 4) / 2, (size + 4) / 2);
  const col = colourOverride ?? CATEGORIES[cat].color;
  if (style === 'disc') {
    g.fillStyle = '#0008'; g.beginPath(); g.arc(0.4, 0.8, size / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, size / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = INK; g.strokeStyle = INK;
  } else {
    g.fillStyle = '#efe3c4'; g.beginPath(); g.arc(0, 0, size / 2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = col; g.strokeStyle = col;
  }
  const s = (size / 2 - 1.5) / 6; g.scale(s, s);
  GLYPH[cat](g);
  cache.set(key, c);
  return c;
}

/** For legends: a data URL of the pictogram. */
export function pictogramURL(cat: Category, size = 18, style: 'disc' | 'print' = 'disc') { return pictogram(cat, size, 2, style).toDataURL(); }
