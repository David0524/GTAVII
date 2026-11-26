/**
 * Small 2D (XZ-plane) geometry helpers shared by the lane pipeline and the sim runtime.
 * Polylines are flat Float32Array/number[] as x0,z0,x1,z1,...
 */
export type Poly = ArrayLike<number>;

export function polyLength(p: Poly): number {
  let L = 0;
  for (let k = 2; k < p.length; k += 2) L += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
  return L;
}

/** Cumulative arc length at each vertex. */
export function cumLengths(p: Poly): Float32Array {
  const n = p.length >> 1;
  const c = new Float32Array(n);
  for (let k = 1; k < n; k++) c[k] = c[k - 1] + Math.hypot(p[2 * k] - p[2 * k - 2], p[2 * k + 1] - p[2 * k - 1]);
  return c;
}

/** Point + unit tangent at arc length s. Writes into out = [x, z, dx, dz]. */
export function sampleAt(p: Poly, cum: ArrayLike<number>, s: number, out: number[] | Float64Array): void {
  const n = cum.length;
  if (n < 2) { out[0] = p[0]; out[1] = p[1]; out[2] = 1; out[3] = 0; return; }
  if (s <= 0) s = 0;
  const L = cum[n - 1];
  if (s >= L) s = L;
  // binary search segment
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  const seg = cum[hi] - cum[lo] || 1e-9;
  const t = (s - cum[lo]) / seg;
  const ax = p[2 * lo], az = p[2 * lo + 1], bx = p[2 * hi], bz = p[2 * hi + 1];
  const dx = bx - ax, dz = bz - az, dl = Math.hypot(dx, dz) || 1;
  out[0] = ax + dx * t; out[1] = az + dz * t; out[2] = dx / dl; out[3] = dz / dl;
}

/** Offset a polyline laterally by d (positive = to the RIGHT of travel direction; right of (dx,dz) is (-dz,dx)). */
export function offsetPoly(p: Poly, d: number): number[] {
  const n = p.length >> 1;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    let nx = 0, nz = 0;
    const seg = (a: number) => {
      const dx = p[2 * a + 2] - p[2 * a], dz = p[2 * a + 3] - p[2 * a + 1], l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    };
    if (k === 0) [nx, nz] = seg(0);
    else if (k === n - 1) [nx, nz] = seg(n - 2);
    else {
      const [ax, az] = seg(k - 1), [bx, bz] = seg(k);
      let mx = ax + bx, mz = az + bz;
      const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = ax; mz = az; } else { mx /= ml; mz /= ml; }
      const cos = mx * ax + mz * az;
      const scale = 1 / Math.max(0.35, cos); // miter, limited
      nx = mx * scale; nz = mz * scale;
    }
    out.push(p[2 * k] + nx * d, p[2 * k + 1] + nz * d);
  }
  return out;
}

/** Sub-polyline between arc lengths s0 < s1. */
export function subPoly(p: Poly, s0: number, s1: number): number[] {
  const cum = cumLengths(p);
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0];
  sampleAt(p, cum, s0, a); sampleAt(p, cum, s1, b);
  const out = [a[0], a[1]];
  for (let k = 0; k < cum.length; k++) if (cum[k] > s0 + 1e-3 && cum[k] < s1 - 1e-3) out.push(p[2 * k], p[2 * k + 1]);
  out.push(b[0], b[1]);
  return out;
}

export function reversePoly(p: Poly): number[] {
  const out: number[] = [];
  for (let k = (p.length >> 1) - 1; k >= 0; k--) out.push(p[2 * k], p[2 * k + 1]);
  return out;
}

/** Closest point on polyline: returns {s, d (unsigned distance), side (+1 right of travel / -1 left)}. */
export function projectOnPoly(p: Poly, x: number, z: number): { s: number; d: number; side: number } {
  let best = Infinity, bs = 0, side = 1, acc = 0;
  for (let k = 2; k < p.length; k += 2) {
    const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az;
    const l2 = dx * dx + dz * dz || 1e-9, l = Math.sqrt(l2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bs = acc + t * l; side = (-dz * (x - px) + dx * (z - pz)) >= 0 ? 1 : -1; }
    acc += l;
  }
  return { s: bs, d: best, side };
}

/** Segment intersection; returns [t, u] params or null. */
export function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/** First intersection between two polylines: arc lengths along each, or null. */
export function polyIntersect(p: Poly, q: Poly): [number, number] | null {
  let sp = 0;
  for (let i = 2; i < p.length; i += 2) {
    const lp = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    let sq = 0;
    for (let j = 2; j < q.length; j += 2) {
      const lq = Math.hypot(q[j] - q[j - 2], q[j + 1] - q[j - 1]);
      const r = segIntersect(p[i - 2], p[i - 1], p[i], p[i + 1], q[j - 2], q[j - 1], q[j], q[j + 1]);
      if (r) return [sp + r[0] * lp, sq + r[1] * lq];
      sq += lq;
    }
    sp += lp;
  }
  return null;
}

/** Even-odd point in ring (flat x,z array). */
export function pointInRing(r: Poly, x: number, z: number): boolean {
  let inside = false;
  const n = r.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Point in polygon with holes (first ring outer). */
export function pointInPolygon(rings: Poly[], x: number, z: number): boolean {
  if (!rings.length || !pointInRing(rings[0], x, z)) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(rings[k], x, z)) return false;
  return true;
}

/** Deterministic PRNG (sfc32 seeded via splitmix32). */
export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number) {
    let s = seed >>> 0;
    const sm = () => { s = (s + 0x9e3779b9) | 0; let z = s; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b); z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35); return (z ^ (z >>> 16)) >>> 0; };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    for (let i = 0; i < 12; i++) this.next();
  }
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(n: number) { return Math.floor(this.next() * n); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.int(arr.length)]; }
}

/** Stable integer hash of two floats (for deterministic per-place choices at build time). */
export function hash2(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 10) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 10) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
