/**
 * Fog of war: a grid of 20 m cells over the playable area. A cell is explored once the player (or a
 * sighted place) has been within reach of its centre. Pure logic, unit-tested in tests/ui-explored.test.ts.
 *
 * The grid stores its own origin and size, so a save made when PLAYABLE was smaller still loads
 * after the bounds widen: deserialize() remaps by cell centre into the current grid.
 *
 * Wire format (a plain string, ~1 KB for the current 76 x 89 grid even when half explored):
 *   "1|minX|minZ|cols|rows|cellM|<r|b><base64>"
 *   r = run-length: varints of alternating run lengths over the row-major cells, starting with an
 *       unexplored run (may be 0); b = raw bitset (LSB first). The smaller of the two is written.
 */
import { PLAYABLE } from '../../shared/bounds';

export const CELL_M = 20;
export interface ExploredBounds { minX: number; maxX: number; minZ: number; maxZ: number }
export interface Mask { w: number; h: number; data: Uint8ClampedArray }

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(b: number[]): string {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < b.length ? B64[n & 63] : '=');
  }
  return s;
}
function fromB64(s: string): number[] {
  const out: number[] = [];
  s = s.replace(/=+$/, '');
  for (let i = 0; i < s.length; i += 4) {
    let n = 0, k = 0;
    for (let j = 0; j < 4 && i + j < s.length; j++, k++) { const v = B64.indexOf(s[i + j]); if (v < 0) throw new Error('bad base64'); n = (n << 6) | v; }
    n <<= 6 * (4 - k);
    out.push((n >> 16) & 255); if (k > 2) out.push((n >> 8) & 255); if (k > 3) out.push(n & 255);
  }
  return out;
}

const dimsOf = (b: ExploredBounds, cell: number) => ({ cols: Math.max(1, Math.ceil((b.maxX - b.minX) / cell)), rows: Math.max(1, Math.ceil((b.maxZ - b.minZ) / cell)) });

export class Explored {
  readonly minX: number; readonly minZ: number; readonly cols: number; readonly rows: number; readonly cell: number;
  private cells: Uint8Array;
  private count = 0;
  /** Bumps whenever any cell changes; renderers cache their mask on it. */
  version = 0;

  constructor(bounds: ExploredBounds = PLAYABLE, cell = CELL_M) {
    this.minX = bounds.minX; this.minZ = bounds.minZ; this.cell = cell;
    const d = dimsOf(bounds, cell); this.cols = d.cols; this.rows = d.rows;
    this.cells = new Uint8Array(this.cols * this.rows);
  }

  get total() { return this.cells.length; }
  get exploredCount() { return this.count; }
  /** Explored share of the playable area, 0..1. */
  fraction() { return this.count / this.cells.length; }

  isExplored(x: number, z: number): boolean {
    const c = Math.floor((x - this.minX) / this.cell), r = Math.floor((z - this.minZ) / this.cell);
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows && this.cells[r * this.cols + c] === 1;
  }

  /** Explore every cell whose centre lies within radiusM of (x, z). Returns the number of newly explored cells. */
  mark(x: number, z: number, radiusM: number): number {
    const cs = this.cell, r2 = radiusM * radiusM;
    const c0 = Math.max(0, Math.floor((x - radiusM - this.minX) / cs)), c1 = Math.min(this.cols - 1, Math.floor((x + radiusM - this.minX) / cs));
    const r0 = Math.max(0, Math.floor((z - radiusM - this.minZ) / cs)), r1 = Math.min(this.rows - 1, Math.floor((z + radiusM - this.minZ) / cs));
    let added = 0;
    for (let r = r0; r <= r1; r++) {
      const dz = this.minZ + (r + 0.5) * cs - z;
      for (let c = c0; c <= c1; c++) {
        const dx = this.minX + (c + 0.5) * cs - x;
        const i = r * this.cols + c;
        if (dx * dx + dz * dz <= r2 && this.cells[i] === 0) { this.cells[i] = 1; added++; }
      }
    }
    if (added) { this.count += added; this.version++; }
    return added;
  }

  /**
   * Alpha mask for the world rectangle [x0,x1] x [z0,z1] at mPerPx metres per pixel: one byte per
   * pixel (255 explored, 0 fogged), row-major with row 0 at z0. Cost is proportional to the explored
   * cells overlapping the rectangle (horizontal runs are filled as blocks), not to the pixel count.
   */
  mask(x0: number, z0: number, x1: number, z1: number, mPerPx: number): Mask {
    const w = Math.max(1, Math.ceil((x1 - x0) / mPerPx)), h = Math.max(1, Math.ceil((z1 - z0) / mPerPx));
    const data = new Uint8ClampedArray(w * h);
    const cs = this.cell;
    const c0 = Math.max(0, Math.floor((x0 - this.minX) / cs)), c1 = Math.min(this.cols - 1, Math.floor((x1 - this.minX) / cs));
    const r0 = Math.max(0, Math.floor((z0 - this.minZ) / cs)), r1 = Math.min(this.rows - 1, Math.floor((z1 - this.minZ) / cs));
    for (let r = r0; r <= r1; r++) {
      const py0 = Math.max(0, Math.round((this.minZ + r * cs - z0) / mPerPx)), py1 = Math.min(h, Math.round((this.minZ + (r + 1) * cs - z0) / mPerPx));
      if (py1 <= py0) continue;
      let c = c0;
      while (c <= c1) {
        if (this.cells[r * this.cols + c] === 0) { c++; continue; }
        let e = c; while (e + 1 <= c1 && this.cells[r * this.cols + e + 1] === 1) e++;
        const px0 = Math.max(0, Math.round((this.minX + c * cs - x0) / mPerPx)), px1 = Math.min(w, Math.round((this.minX + (e + 1) * cs - x0) / mPerPx));
        if (px1 > px0) for (let py = py0; py < py1; py++) data.fill(255, py * w + px0, py * w + px1);
        c = e + 1;
      }
    }
    return { w, h, data };
  }

  clear() { if (this.count) { this.cells.fill(0); this.count = 0; this.version++; } }

  /** Copy the other grid's explored cells into this one by cell centre (handles a different origin, size or cell size). */
  absorb(o: Explored): number {
    let added = 0;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c; if (this.cells[i]) continue;
      if (o.isExplored(this.minX + (c + 0.5) * this.cell, this.minZ + (r + 0.5) * this.cell)) { this.cells[i] = 1; added++; }
    }
    if (added) { this.count += added; this.version++; }
    return added;
  }

  serialize(): string {
    const n = this.cells.length;
    const runs: number[] = []; let cur = 0, len = 0;
    for (let i = 0; i < n; i++) { if (this.cells[i] === cur) len++; else { runs.push(len); cur ^= 1; len = 1; } }
    runs.push(len);
    const rle: number[] = [];
    for (let v of runs) { while (v >= 128) { rle.push((v & 127) | 128); v >>>= 7; } rle.push(v); }
    const bits: number[] = new Array(Math.ceil(n / 8)).fill(0);
    for (let i = 0; i < n; i++) if (this.cells[i]) bits[i >> 3] |= 1 << (i & 7);
    const useRle = rle.length < bits.length;
    return `1|${this.minX}|${this.minZ}|${this.cols}|${this.rows}|${this.cell}|${useRle ? 'r' : 'b'}${toB64(useRle ? rle : bits)}`;
  }

  /** Parse a serialized grid and remap it into a grid over `bounds` (default: the current PLAYABLE). Throws on malformed input. */
  static deserialize(s: string, bounds: ExploredBounds = PLAYABLE, cell = CELL_M): Explored {
    const p = String(s).split('|');
    if (p.length !== 7 || p[0] !== '1') throw new Error('bad explored grid');
    const [minX, minZ, cols, rows, cs] = p.slice(1, 6).map(Number);
    if (![minX, minZ, cols, rows, cs].every(Number.isFinite) || cols < 1 || rows < 1 || cs <= 0 || cols * rows > 4_000_000) throw new Error('bad explored grid header');
    const src = new Explored({ minX, minZ, maxX: minX + cols * cs, maxZ: minZ + rows * cs }, cs);
    const n = cols * rows, bytes = fromB64(p[6].slice(1));
    if (p[6][0] === 'r') {
      let i = 0, cur = 0, k = 0;
      while (k < bytes.length) {
        let v = 0, sh = 0, b: number;
        do { b = bytes[k++]; if (b === undefined) throw new Error('bad explored runs'); v += (b & 127) * 2 ** sh; sh += 7; } while (b & 128);
        if (i + v > n) throw new Error('bad explored runs');
        if (cur) { src.cells.fill(1, i, i + v); src.count += v; }
        i += v; cur ^= 1;
      }
      if (i !== n) throw new Error('bad explored runs');
    } else if (p[6][0] === 'b') {
      if (bytes.length < Math.ceil(n / 8)) throw new Error('bad explored bits');
      for (let i = 0; i < n; i++) if (bytes[i >> 3] & (1 << (i & 7))) { src.cells[i] = 1; src.count++; }
    } else throw new Error('bad explored mode');
    const d = dimsOf(bounds, cell);
    if (src.minX === bounds.minX && src.minZ === bounds.minZ && src.cell === cell && src.cols === d.cols && src.rows === d.rows) return src;
    const out = new Explored(bounds, cell); out.absorb(src); return out;
  }
}
