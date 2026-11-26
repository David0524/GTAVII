import * as THREE from 'three/webgpu';

/**
 * Material slots used by every generated vehicle. A body is ONE indexed BufferGeometry with
 * a group per slot (ordered as below), so a car costs one draw per slot it actually uses.
 */
export const SLOTS = [
  'paint', 'paint2', 'roof', 'vinyl', 'chrome', 'trim', 'rubber', 'glass', 'under',
  'wood', 'white', 'headlamp', 'taillamp', 'indicator', 'reverse', 'grille', 'interior',
] as const;
export type Slot = (typeof SLOTS)[number];

export type V3 = [number, number, number];

/**
 * Accumulates indexed triangles per material slot. Vertices are shared inside a grid (smooth
 * shading along it); separate grids/parts get their own vertices (hard creases between them).
 */
export class GeoBuilder {
  readonly pos: number[] = [];
  readonly uv: number[] = [];
  readonly idx = new Map<Slot, number[]>();

  get vcount() { return this.pos.length / 3; }

  v(p: V3, u = 0, w = 0): number {
    this.pos.push(p[0], p[1], p[2]); this.uv.push(u, w);
    return this.vcount - 1;
  }
  private list(s: Slot) { let l = this.idx.get(s); if (!l) this.idx.set(s, (l = [])); return l; }
  tri(s: Slot, a: number, b: number, c: number) { this.list(s).push(a, b, c); }
  quad(s: Slot, a: number, b: number, c: number, d: number) { this.list(s).push(a, b, c, a, c, d); }

  /**
   * Grid of rows[i][j]. Material per cell from `slot` (constant or fn of cell indices).
   * Winding is fixed automatically so faces point away from `inside` (a point inside the solid),
   * or along `facing` when given (for open, flat-ish patches).
   */
  grid(rows: V3[][], slot: Slot | ((i: number, j: number) => Slot | null), opt: { closeJ?: boolean; inside?: V3; facing?: V3 } = {}) {
    const ni = rows.length, nj = rows[0].length;
    const ids: number[][] = rows.map((r, i) => r.map((p, j) => this.v(p, i / Math.max(1, ni - 1), j / Math.max(1, nj - 1))));
    const jm = opt.closeJ ? nj : nj - 1;
    // decide winding from the aggregate orientation of all quads
    let score = 0;
    const c = opt.inside ?? centroid(rows);
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jm; j++) {
      const a = rows[i][j], b = rows[i + 1][j], d = rows[i][(j + 1) % nj];
      const n = cross(sub(b, a), sub(d, a));
      score += opt.facing ? dot(n, opt.facing) : dot(n, sub(a, c));
    }
    const flip = score < 0;
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jm; j++) {
      const s = typeof slot === 'function' ? slot(i, j) : slot;
      if (!s) continue;
      const a = ids[i][j], b = ids[i + 1][j], cc = ids[i + 1][(j + 1) % nj], d = ids[i][(j + 1) % nj];
      if (flip) this.quad(s, a, d, cc, b); else this.quad(s, a, b, cc, d);
    }
    return ids;
  }

  /** Planar polygon cap (convex-ish, fan from centroid), facing along `facing`. */
  cap(poly: V3[], slot: Slot, facing: V3) {
    const c = centroid([poly]);
    const ci = this.v(c);
    const ids = poly.map((p) => this.v(p));
    let score = 0;
    for (let k = 0; k < poly.length; k++) score += dot(cross(sub(poly[k], c), sub(poly[(k + 1) % poly.length], c)), facing);
    for (let k = 0; k < poly.length; k++) {
      const a = ids[k], b = ids[(k + 1) % poly.length];
      if (score >= 0) this.tri(slot, ci, a, b); else this.tri(slot, ci, b, a);
    }
  }

  /** Merge an existing (three.js primitive) geometry, transformed. */
  add(slot: Slot, g: THREE.BufferGeometry, m?: THREE.Matrix4) {
    const gg = g.index ? g : g;
    if (m) gg.applyMatrix4(m);
    const p = gg.getAttribute('position');
    const uv = gg.getAttribute('uv');
    const base = this.vcount;
    for (let k = 0; k < p.count; k++) { this.pos.push(p.getX(k), p.getY(k), p.getZ(k)); this.uv.push(uv ? uv.getX(k) : 0, uv ? uv.getY(k) : 0); }
    const l = this.list(slot);
    if (gg.index) { const ix = gg.index; for (let k = 0; k < ix.count; k++) l.push(base + ix.getX(k)); }
    else for (let k = 0; k < p.count; k++) l.push(base + k);
    g.dispose();
  }

  box(slot: Slot, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)), new THREE.Vector3(1, 1, 1));
    this.add(slot, new THREE.BoxGeometry(sx, sy, sz), m);
  }

  /**
   * Sweep a closed 2D profile along a polyline in the XZ plane at height y (or per-point y).
   * Profile coords: [outward (perpendicular to path, +right of travel), up].
   */
  sweep(slot: Slot, path: V3[], profile: [number, number][], closed = true) {
    const rows: V3[][] = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[2] - a[2];
      const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = tz, nz = -tx; // right of travel
      rows.push(profile.map(([o, u]) => [path[i][0] + nx * o, path[i][1] + u, path[i][2] + nz * o] as V3));
    }
    const ids = this.grid(rows, slot, { closeJ: closed });
    // end caps
    if (closed) for (const i of [0, rows.length - 1]) {
      const ring = rows[i];
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      const t: V3 = norm(sub(b, a));
      this.cap(ring, slot, i === 0 ? scale(t, -1) : t);
    }
    return ids;
  }

  /** Lathe around the local X axis (wheels): profile [radius, x]. */
  latheX(slot: Slot, profile: [number, number][], segs: number, center: V3, mirror = false) {
    const rows: V3[][] = profile.map(([r, x]) => {
      const row: V3[] = [];
      for (let k = 0; k < segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        row.push([center[0] + (mirror ? -x : x), center[1] + Math.cos(t) * r, center[2] + Math.sin(t) * r]);
      }
      return row;
    });
    // Winding: faces point away from a point just inboard of the profile's mid-plane on the axis.
    const xs = profile.map((p) => p[1]);
    const xin = (Math.min(...xs) + Math.max(...xs)) / 2;
    this.grid(rows, slot, { closeJ: true, inside: [center[0] + (mirror ? -xin : xin), center[1], center[2]] });
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const all: number[] = [];
    for (const s of SLOTS) {
      const l = this.idx.get(s);
      if (!l || !l.length) continue;
      g.addGroup(all.length, l.length, SLOTS.indexOf(s));
      for (const i of l) all.push(i);
    }
    g.setIndex(all);
    g.computeVertexNormals();
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export function centroid(rows: V3[][]): V3 {
  let x = 0, y = 0, z = 0, n = 0;
  for (const r of rows) for (const p of r) { x += p[0]; y += p[1]; z += p[2]; n++; }
  return [x / n, y / n, z / n];
}
/** Piecewise-linear lookup in [[t, value], ...] (sorted by t). */
export function pw(pts: [number, number][], t: number): number {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) {
    const [t0, v0] = pts[i - 1], [t1, v1] = pts[i];
    return lerp(v0, v1, (t - t0) / (t1 - t0 || 1));
  }
  return pts[pts.length - 1][1];
}
/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
