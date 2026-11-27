/** Minimal allocation-free 3D helpers on tuples (the gameplay core has no three.js dependency so it runs headless). */
export type V3 = [number, number, number];
export type V2 = [number, number];

export const v3 = (x = 0, y = 0, z = 0): V3 => [x, y, z];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Heading convention matches the engine's PlayerController: yaw 0 faces -Z, forward = (-sin, -cos). */
export const forwardOf = (yaw: number): V2 => [-Math.sin(yaw), -Math.cos(yaw)];
export const yawTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(-(tx - fx), -(tz - fz));

/** Ray vs capsule (segment a-b, radius r). Returns distance along unit dir or -1. */
export function rayCapsule(o: V3, d: V3, a: V3, b: V3, r: number): number {
  // Closest approach between ray and segment, then refine with sphere test at that segment point.
  const ba = sub(b, a), oa = sub(o, a);
  const baba = dot(ba, ba), bard = dot(ba, d), baoa = dot(ba, oa), rdoa = dot(d, oa), oaoa = dot(oa, oa);
  const A = baba - bard * bard;
  let B = baba * rdoa - baoa * bard;
  let C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
    // caps
    const oc = y <= 0 ? oa : sub(o, b);
    B = dot(d, oc); C = dot(oc, oc) - r * r; h = B * B - C;
    if (h > 0) { const tc = -B - Math.sqrt(h); if (tc >= 0) return tc; }
    return -1;
  }
  // ray parallel to the segment: test both end spheres
  let best = -1;
  for (const c of [a, b]) {
    const oc = sub(o, c); const Bs = dot(d, oc), Cs = dot(oc, oc) - r * r, hs = Bs * Bs - Cs;
    if (hs > 0) { const t = -Bs - Math.sqrt(hs); if (t >= 0 && (best < 0 || t < best)) best = t; }
  }
  return best;
}

/** Ray vs oriented box (centre c, half extents hx,hy,hz, yaw about Y). Returns entry distance or -1. */
export function rayObb(o: V3, d: V3, c: V3, hx: number, hy: number, hz: number, yaw: number): number {
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  const px = o[0] - c[0], py = o[1] - c[1], pz = o[2] - c[2];
  // rotate into box space (inverse yaw)
  const lx = px * cs - pz * sn, lz = px * sn + pz * cs;
  const dx = d[0] * cs - d[2] * sn, dz = d[0] * sn + d[2] * cs;
  let tmin = -Infinity, tmax = Infinity;
  const slab = (p: number, dd: number, h: number) => {
    if (Math.abs(dd) < 1e-9) return Math.abs(p) <= h;
    let t1 = (-h - p) / dd, t2 = (h - p) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); return tmin <= tmax;
  };
  if (!slab(lx, dx, hx) || !slab(py, d[1], hy) || !slab(lz, dz, hz)) return -1;
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

/** Point-in-polygon (x,z pairs). */
export function inPoly(x: number, z: number, poly: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], zi = poly[i + 1], xj = poly[j], zj = poly[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
