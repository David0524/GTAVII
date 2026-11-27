/**
 * Test-scene facade shells: the engine's extruded building, but with the facade cut where
 * facadeOpenings() says (doors, alcoves, display windows, transoms). This is exactly the change
 * requested of the engine's meshBuilder (ENGINE_REQUESTS "From interiors: 1"); here it lets the
 * test block be walked into before the engine wires it.
 */
import earcut from 'earcut';
import type { BuildingRec } from '../../shared/chunkFormat';
import type { BuildingIdx } from '../indexFormat';
import { facadeOpenings } from '../facade';
import { pushWindow } from '../windowRooms';
import { buildingCondition } from '../../shared/condition';

export interface WindowArrays { position: number[]; normal: number[]; wuv: number[]; wtan: number[]; wdat: number[]; index: number[] }

export interface ShellArrays { position: number[]; normal: number[]; color: number[]; index: number[] }
type RGB = [number, number, number];
const STYLE: Record<number, RGB> = { 0: [0.42, 0.38, 0.34], 1: [0.45, 0.25, 0.19], 2: [0.52, 0.5, 0.45], 3: [0.56, 0.45, 0.34], 4: [0.66, 0.61, 0.52], 5: [0.62, 0.57, 0.48], 6: [0.6, 0.6, 0.58], 7: [0.38, 0.34, 0.3], 8: [0.5, 0.5, 0.52] };

function signedArea(r: Float32Array | number[]) { let a = 0; const n = r.length / 2; for (let k = 0; k < n; k++) { const j = (k + 1) % n; a += r[2 * k] * r[2 * j + 1] - r[2 * j] * r[2 * k + 1]; } return a / 2; }

/** World-space opening rectangles on a building's outer ring edges (for shells and window shaders). */
export function shellOpenings(b: BuildingIdx, x0: number, z0: number, x1: number, z1: number) {
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
  const ops: { s0: number; s1: number; y0: number; y1: number }[] = [];
  for (const u of b.units) {
    const ax = u.ox - x0, az = u.oz - z0;
    const along = (ax * dx + az * dz) / L, off = Math.abs(ax * dz - az * dx) / L;
    if (off > 0.08 || Math.abs((u.ux * dx + u.uz * dz) / L) < 0.999) continue;
    const dir = Math.sign((u.ux * dx + u.uz * dz) / L);
    for (const q of facadeOpenings(u, b.year, b.fh)) {
      const sa = along + dir * q.s0, sb = along + dir * q.s1;
      ops.push({ s0: Math.min(sa, sb), s1: Math.max(sa, sb), y0: u.y + q.y0, y1: u.y + q.y1 });
    }
  }
  return ops;
}

/** rec rings are chunk-local; ox/oz = chunk centre. Output in chunk-local coordinates. */
export function buildShell(out: ShellArrays, rec: BuildingRec, ox: number, oz: number, b: BuildingIdx | undefined, hf: (x: number, z: number) => number, roofHoles: number[][] = [], win?: WindowArrays) {
  const ring = rec.rings[0]; let gMin = Infinity, gSum = 0;
  for (let k = 0; k < ring.length; k += 2) { const h = hf(ring[k], ring[k + 1]); gMin = Math.min(gMin, h); gSum += h; }
  const gAvg = gSum / (ring.length / 2), top = gAvg + Math.max(rec.height, rec.minHeight + 0.5), bottom = rec.minHeight > 0 ? gAvg + rec.minHeight : gMin - 0.6;
  let h = Math.imul(rec.id ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; const v = 0.86 + ((h >>> 0) % 1000) / 1000 * 0.28;
  const base = STYLE[rec.style] ?? STYLE[0]; const col: RGB = [base[0] * v, base[1] * v, base[2] * v];
  const push = (x: number, y: number, z: number, nx: number, nz: number, c: RGB, ny = 0) => { out.position.push(x, y, z); out.normal.push(nx, ny, nz); out.color.push(c[0], c[1], c[2]); return out.position.length / 3 - 1; };
  for (let r = 0; r < rec.rings.length; r++) {
    const rg = rec.rings[r], n = rg.length / 2, ccw = signedArea(rg) > 0;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n; const x0 = rg[2 * k], z0 = rg[2 * k + 1], x1 = rg[2 * j], z1 = rg[2 * j + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 1e-3) continue;
      let nx = dz / L, nz = -dx / L; if (!ccw) { nx = -nx; nz = -nz; }
      const ops = b && r === 0 ? shellOpenings(b, x0 + ox, z0 + oz, x1 + ox, z1 + oz) : [];
      // Tier C: window grid on street-facing edges above the ground floor
      if (win && b && r === 0 && rec.floors > 1 && b.frontage.some((e) => Math.hypot(e[0] - (x0 + ox), e[1] - (z0 + oz)) + Math.hypot(e[2] - (x1 + ox), e[3] - (z1 + oz)) < L + 0.5)) {
        const fh = (top - gAvg) / rec.floors, cols = Math.floor((L - 0.6) / 2.1), cond = buildingCondition({ id: rec.id, year: rec.year, style: rec.style, use: rec.use, floors: rec.floors, flags: rec.flags });
        for (let f = 1; f < rec.floors; f++) for (let q = 0; q < cols; q++) {
          const s = (L - cols * 2.1) / 2 + q * 2.1 + 0.55, y = gAvg + f * fh + 0.85;
          let hsh = Math.imul(rec.id * 131 + k * 17 + f * 7 + q, 0x9e3779b1); hsh ^= hsh >>> 15;
          pushWindow(win, [x0 + (dx / L) * s + ox, y, z0 + (dz / L) * s + oz], [dx / L, 0, dz / L], [nx, 0, nz], 1.0, Math.min(1.7, fh - 1.2), [((hsh >>> 0) % 10000) / 10000, rec.use, f, cond]);
        }
      }
      const ss = [0, L, ...ops.flatMap((q) => [q.s0, q.s1])].sort((p, q) => p - q);
      const ys = [bottom, top, ...ops.flatMap((q) => [q.y0, q.y1])].sort((p, q) => p - q);
      const dark: RGB = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8];
      for (let i = 0; i + 1 < ss.length; i++) for (let jj = 0; jj + 1 < ys.length; jj++) {
        if (ss[i + 1] - ss[i] < 1e-4 || ys[jj + 1] - ys[jj] < 1e-4) continue;
        const sm = (ss[i] + ss[i + 1]) / 2, ym = (ys[jj] + ys[jj + 1]) / 2;
        if (ops.some((q) => sm > q.s0 && sm < q.s1 && ym > q.y0 && ym < q.y1)) continue;
        const ta = (ys[jj] - bottom) / (top - bottom), tb = (ys[jj + 1] - bottom) / (top - bottom);
        const ca: RGB = [dark[0] + (col[0] - dark[0]) * ta, dark[1] + (col[1] - dark[1]) * ta, dark[2] + (col[2] - dark[2]) * ta];
        const cb: RGB = [dark[0] + (col[0] - dark[0]) * tb, dark[1] + (col[1] - dark[1]) * tb, dark[2] + (col[2] - dark[2]) * tb];
        const xa = x0 + (dx / L) * ss[i], za = z0 + (dz / L) * ss[i], xb = x0 + (dx / L) * ss[i + 1], zb = z0 + (dz / L) * ss[i + 1];
        const a = push(xa, ys[jj], za, nx, nz, ca), bb = push(xb, ys[jj], zb, nx, nz, ca), c = push(xb, ys[jj + 1], zb, nx, nz, cb), d = push(xa, ys[jj + 1], za, nx, nz, cb);
        out.index.push(a, d, c, a, c, bb);
      }
    }
  }
  // roof (with optional hatch holes, chunk-local rings)
  const flat: number[] = [], holes: number[] = [];
  for (let r = 0; r < rec.rings.length; r++) { if (r > 0) holes.push(flat.length / 2); for (const q of rec.rings[r]) flat.push(q); }
  for (const hr of roofHoles) { holes.push(flat.length / 2); flat.push(...hr); }
  const tris = earcut(flat, holes, 2); const v0 = out.position.length / 3; const roof: RGB = [0.2, 0.19, 0.18];
  for (let k = 0; k < flat.length; k += 2) push(flat[k], top, flat[k + 1], 0, 0, roof, 1);
  for (let k = 0; k < tris.length; k += 3) {
    const a = tris[k], c = tris[k + 1], d = tris[k + 2];
    const cr = (flat[2 * c] - flat[2 * a]) * (flat[2 * d + 1] - flat[2 * a + 1]) - (flat[2 * c + 1] - flat[2 * a + 1]) * (flat[2 * d] - flat[2 * a]);
    if (cr > 0) out.index.push(v0 + a, v0 + d, v0 + c); else out.index.push(v0 + a, v0 + c, v0 + d);
  }
}
