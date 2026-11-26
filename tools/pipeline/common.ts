import { REGION, unproject } from '../../src/shared/geo.ts';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const RAW = path.join(ROOT, 'data/raw');
export const OUT = path.join(ROOT, 'public/data');

/** Lon/lat bounding box enclosing the rotated play REGION, plus a margin in metres. */
export function regionBBox(margin = 60) {
  const xs = [REGION.minX - margin, REGION.maxX + margin];
  const zs = [REGION.minZ - margin, REGION.maxZ + margin];
  let w = 180, e = -180, s = 90, n = -90;
  for (const x of xs) for (const z of zs) {
    const [lon, lat] = unproject(x, z);
    w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return { w, s, e, n };
}

export function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
export function log(...a: unknown[]) { console.log('[pipeline]', ...a); }
