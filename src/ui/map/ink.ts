/**
 * Print and pencil drawing helpers shared by the minimap and the folding map:
 * paper grain, deckled paper edge, pencil lines (graphite, several light passes with a hand wobble),
 * pencil rings, rubber stamps and a coffee ring. All deterministic (seeded), so the map looks the
 * same every frame and every visit.
 */
type G = CanvasRenderingContext2D;

export const PAPER = '#ebdfc3';
export const PAPER_SHADE = '#d9c8a4';
export const INK = '#3b2a20';
export const GRAPHITE = 'rgba(52,50,48,';
export const TABLE = '#1c1311';

export function hash(n: number) { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }

let grainCanvas: HTMLCanvasElement | null = null;
/** A 256 px tile of paper fibre noise used as a pattern. */
export function paperGrain(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i & 255, y = i >> 8;
    const fibre = Math.sin((x * 0.21 + y * 0.03) + hash(y * 7) * 6) * 0.5 + 0.5;
    const n = hash(i) * 0.7 + fibre * 0.3;
    const v = Math.round(n * 38);
    img.data[i * 4] = 90; img.data[i * 4 + 1] = 60; img.data[i * 4 + 2] = 30; img.data[i * 4 + 3] = v;
  }
  g.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

/** Path of a rectangle whose edges are slightly torn/deckled (amplitude in px). */
export function deckledRect(g: G, x0: number, y0: number, x1: number, y1: number, amp = 3, step = 6, seed = 7) {
  g.beginPath();
  const edge = (ax: number, ay: number, bx: number, by: number, s: number) => {
    const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.floor(L / step)), nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let i = 0; i < n; i++) {
      const t = i / n, j = (hash(s * 1000 + i) - 0.5) * 2 * amp;
      g.lineTo(ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j);
    }
  };
  g.moveTo(x0, y0);
  edge(x0, y0, x1, y0, seed); edge(x1, y0, x1, y1, seed + 1); edge(x1, y1, x0, y1, seed + 2); edge(x0, y1, x0, y0, seed + 3);
  g.closePath();
}

/** Graphite line over a polyline of screen points: 3 light passes with a wobble, darker where it overlaps. */
export function pencilLine(g: G, pts: number[], width = 2, seed = 1, alpha = 0.5) {
  if (pts.length < 4) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for (let pass = 0; pass < 3; pass++) {
    g.strokeStyle = `${GRAPHITE}${(alpha * (pass === 0 ? 1 : 0.55)).toFixed(3)})`;
    g.lineWidth = width * (pass === 0 ? 1 : 0.6);
    g.beginPath();
    let along = 0;
    for (let k = 0; k < pts.length; k += 2) {
      if (k) along += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      const w = Math.sin(along * 0.07 + seed + pass * 2.1) * (0.6 + pass * 0.35);
      const px = pts[k] + w, py = pts[k + 1] - w * 0.6;
      if (!k) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.restore();
}

/** Hand-drawn pencil ring with an overshooting tail (how you'd circle a place on a street map). */
export function pencilRing(g: G, x: number, y: number, r: number, seed = 1, colour = `${GRAPHITE}0.75)`, width = 1.6) {
  g.save(); g.strokeStyle = colour; g.lineWidth = width; g.lineCap = 'round';
  g.beginPath();
  const start = hash(seed) * Math.PI * 2, sweep = Math.PI * 2.25;
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, a = start + t * sweep, rr = r * (1 + 0.08 * Math.sin(a * 2 + seed) + 0.06 * t);
    const px = x + Math.cos(a) * rr * 1.12, py = y + Math.sin(a) * rr * 0.92;
    if (!i) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke(); g.restore();
}

/** Pencil cross (waypoint) with a short note. */
export function pencilCross(g: G, x: number, y: number, s = 9, seed = 3) {
  g.save(); g.strokeStyle = `${GRAPHITE}0.85)`; g.lineWidth = 2.2; g.lineCap = 'round';
  const j = (k: number) => (hash(seed * 13 + k) - 0.5) * 2;
  g.beginPath(); g.moveTo(x - s + j(1), y - s + j(2)); g.lineTo(x + s + j(3), y + s + j(4)); g.moveTo(x + s + j(5), y - s + j(6)); g.lineTo(x - s + j(7), y + s + j(8)); g.stroke();
  g.restore();
}

/** Rubber stamp: a double-ruled box with spaced capitals, uneven ink. */
export function stamp(g: G, text: string, x: number, y: number, rot: number, colour = '#9e2a24', size = 13, seed = 5) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `400 ${size}px 'League Gothic', 'Arial Narrow', sans-serif`;
  const t = text.toUpperCase().split('').join(' ');
  const w = g.measureText(t).width + size * 1.2, h = size * 1.7;
  g.globalAlpha = 0.78; g.strokeStyle = colour; g.fillStyle = colour;
  g.lineWidth = 2; g.strokeRect(-w / 2, -h / 2, w, h); g.lineWidth = 0.8; g.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 1);
  // ink dropouts
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc((hash(seed + i) - 0.5) * w, (hash(seed + i + 50) - 0.5) * h, 0.6 + hash(seed + i + 90) * 1.4, 0, Math.PI * 2); g.fill(); }
  g.restore();
}

/** A coffee ring stain (the map has been on a diner counter). */
export function coffeeRing(g: G, x: number, y: number, r: number, seed = 9) {
  g.save();
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = `rgba(120,70,30,${0.10 + i * 0.04})`; g.lineWidth = 2.5 - i * 0.7;
    g.beginPath();
    for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2, rr = r * (1 + 0.025 * Math.sin(a * 3 + seed + i)); if (k === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.stroke(); r *= 0.985;
  }
  const grd = g.createRadialGradient(x, y, r * 0.6, x, y, r); grd.addColorStop(0, 'rgba(120,70,30,0)'); grd.addColorStop(1, 'rgba(120,70,30,0.07)');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.restore();
}

/** Pencil handwriting stand-in: Fraunces italic in graphite with a tiny baseline wobble per word. */
export function pencilText(g: G, text: string, x: number, y: number, size = 12, rot = -0.04, seed = 2) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.font = `italic 500 ${size}px Fraunces, Georgia, serif`; g.fillStyle = `${GRAPHITE}0.82)`;
  let cx = 0;
  for (const [i, w] of text.split(' ').entries()) { g.fillText(w, cx, (hash(seed + i) - 0.5) * 1.6); cx += g.measureText(`${w} `).width; }
  g.restore();
}
