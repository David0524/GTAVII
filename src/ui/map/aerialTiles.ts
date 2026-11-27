/**
 * The aerial tile pyramid (public/map/aerial, baked by tools/ui/mapAerial.ts; a dev pyramid in map/aerial-dev until the
 * lit bake lands), shared by the pause map and the minimap: manifest loading, level choice, an image cache, and
 * drawing any world rectangle at any scale.
 */
export interface AerialManifest { format: string; x0: number; z0: number; tile: number; levels: { mPerPx: number; cols: number; rows: number }[] }

let manifest: Promise<{ m: AerialManifest; base: string } | null> | null = null;
export function loadAerial(baseUrl: string) {
  manifest ??= (async () => {
    for (const dir of ['map/aerial/', 'map/aerial-dev/']) {
      try { const r = await fetch(`${baseUrl}${dir}manifest.json`); if (r.ok) return { m: (await r.json()) as AerialManifest, base: `${baseUrl}${dir}` }; } catch { /* next */ }
    }
    return null;
  })();
  return manifest;
}

const cache = new Map<string, HTMLImageElement | 'loading' | 'missing'>();
const waiters = new Set<() => void>();
/** A tile image if loaded; otherwise starts loading it and returns null (onReady listeners fire when it arrives). */
export function aerialTile(a: { m: AerialManifest; base: string }, L: number, c: number, r: number): HTMLImageElement | null {
  const k = `${a.base}${L}/${c}_${r}`, t = cache.get(k);
  if (t instanceof HTMLImageElement) return t;
  if (t) return null;
  const img = new Image(); img.decoding = 'async';
  img.onload = () => { cache.set(k, img); for (const w of waiters) w(); };
  img.onerror = () => cache.set(k, 'missing');
  img.src = `${k}.webp`; cache.set(k, 'loading');
  return null;
}
export function onAerialTile(cb: () => void) { waiters.add(cb); return () => waiters.delete(cb); }

/** The finest level whose metres-per-pixel is at most `mPerDevicePx` × 1.35 (no visible softness, no wasted pixels). */
export function aerialLevel(m: AerialManifest, mPerDevicePx: number) {
  let L = m.levels.length - 1;
  for (let i = 0; i < m.levels.length; i++) if (m.levels[i].mPerPx <= mPerDevicePx * 1.35) L = i; else break;
  return L;
}

/**
 * Draw the world rectangle [x0,x1]×[z0,z1] into `g` at `pxPerM` (device px per metre), origin at (x0,z0).
 * Draws the next-coarser level underneath so nothing is ever blank while finer tiles stream in.
 * Returns true when every needed tile at the chosen level was available.
 */
export function drawAerial(g: CanvasRenderingContext2D, a: { m: AerialManifest; base: string }, x0: number, z0: number, x1: number, z1: number, pxPerM: number): boolean {
  const { m } = a, L = aerialLevel(m, 1 / pxPerM);
  let complete = true;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  for (const lv of [Math.min(m.levels.length - 1, L + 1), L]) {
    const { mPerPx, cols, rows } = m.levels[lv], tm = m.tile * mPerPx;
    const c0 = Math.max(0, Math.floor((x0 - m.x0) / tm)), c1 = Math.min(cols - 1, Math.floor((x1 - m.x0) / tm));
    const r0 = Math.max(0, Math.floor((z0 - m.z0) / tm)), r1 = Math.min(rows - 1, Math.floor((z1 - m.z0) / tm));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const img = aerialTile(a, lv, c, r);
      if (!img) { if (lv === L) complete = false; continue; }
      const sx = (m.x0 + c * tm - x0) * pxPerM, sy = (m.z0 + r * tm - z0) * pxPerM, s = tm * pxPerM;
      g.drawImage(img, Math.floor(sx), Math.floor(sy), Math.ceil(s + 1), Math.ceil(s + 1));
    }
  }
  return complete;
}
