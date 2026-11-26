/**
 * Per-vertex light baking for interiors (worker). Two channels:
 *   rgb = lamp irradiance (scaled at runtime by the interior's power state: on / dim / off),
 *   a   = window light (sky by day, street light by night; scaled by a runtime uniform).
 * Lights reach their own cell, and neighbouring cells only through a portal the light ray passes.
 * Shadows from props come from an occupancy grid (medium+), and corner AO from the cell box.
 * One bounce is approximated per cell as a fill proportional to the cell's average direct light.
 */
import type { CellOut, LightOut, PortalOut, MeshArrays } from './spec';

type Box = [number, number, number, number, number, number];

class Occupancy {
  readonly vs = 0.2;
  private nx: number; private ny: number; private nz: number; private bits: Uint8Array; private o: [number, number, number];
  constructor(bounds: Box, boxes: Box[]) {
    const vs = this.vs; this.o = [bounds[0] - vs, bounds[1] - vs, bounds[2] - vs];
    this.nx = Math.ceil((bounds[3] - bounds[0]) / vs) + 2; this.ny = Math.ceil((bounds[4] - bounds[1]) / vs) + 2; this.nz = Math.ceil((bounds[5] - bounds[2]) / vs) + 2;
    this.bits = new Uint8Array(this.nx * this.ny * this.nz);
    for (const b of boxes) {
      // shrink by half a voxel so surfaces don't self-occlude
      const i0 = Math.ceil((b[0] - this.o[0]) / vs), i1 = Math.floor((b[3] - this.o[0]) / vs) - 1;
      const j0 = Math.ceil((b[1] - this.o[1]) / vs), j1 = Math.floor((b[4] - this.o[1]) / vs) - 1;
      const k0 = Math.ceil((b[2] - this.o[2]) / vs), k1 = Math.floor((b[5] - this.o[2]) / vs) - 1;
      for (let k = Math.max(0, k0); k <= Math.min(this.nz - 1, k1); k++) for (let j = Math.max(0, j0); j <= Math.min(this.ny - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) this.bits[(k * this.ny + j) * this.nx + i] = 1;
    }
  }
  at(x: number, y: number, z: number) {
    const i = Math.floor((x - this.o[0]) / this.vs), j = Math.floor((y - this.o[1]) / this.vs), k = Math.floor((z - this.o[2]) / this.vs);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return 0;
    return this.bits[(k * this.ny + j) * this.nx + i];
  }
  private cache = new Map<number, number>();
  /** trace() memoised on a 0.25 m grid per source id: dense small props share one visibility sample. */
  traceCached(src: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const key = ((((src * 1024 + (Math.floor(x0 * 4) & 1023)) * 1024 + (Math.floor(y0 * 4) & 1023)) * 1024) + (Math.floor(z0 * 4) & 1023));
    let v = this.cache.get(key);
    if (v === undefined) { v = this.trace(x0, y0, z0, x1, y1, z1); this.cache.set(key, v); }
    return v;
  }
  /** Fraction of light transmitted along a segment (0 blocked .. 1 clear), soft near the ends. */
  trace(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dx, dy, dz);
    const n = Math.min(60, Math.floor(L / (this.vs * 0.9)));
    for (let s = 2; s < n - 1; s++) { const t = s / n; if (this.at(x0 + dx * t, y0 + dy * t, z0 + dz * t)) return 0.12; }
    return 1;
  }
}

/** Does the segment p->q pass through the (planar, convex quad) portal? */
function throughPortal(p: number[], q: number[], pt: PortalOut['pts']) {
  const [a, b, , d] = pt;
  const ex = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ey = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  const dir = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const den = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2]; if (Math.abs(den) < 1e-9) return false;
  const t = (n[0] * (a[0] - p[0]) + n[1] * (a[1] - p[1]) + n[2] * (a[2] - p[2])) / den; if (t < 0 || t > 1) return false;
  const h = [p[0] + dir[0] * t - a[0], p[1] + dir[1] * t - a[1], p[2] + dir[2] * t - a[2]];
  const u = (h[0] * ex[0] + h[1] * ex[1] + h[2] * ex[2]) / (ex[0] ** 2 + ex[1] ** 2 + ex[2] ** 2);
  const v = (h[0] * ey[0] + h[1] * ey[1] + h[2] * ey[2]) / (ey[0] ** 2 + ey[1] ** 2 + ey[2] ** 2);
  return u >= -0.02 && u <= 1.02 && v >= -0.02 && v <= 1.02;
}

const WS = [[0.25, 0.3], [0.75, 0.3], [0.25, 0.8], [0.75, 0.8], [0.5, 0.55], [0.5, 0.95]];
export interface BakeOpts { quality: 'low' | 'medium' | 'high' | 'ultra'; occluders: Box[]; bounds: Box }

export function bake(cells: CellOut[], lights: LightOut[], portals: PortalOut[], o: BakeOpts) {
  const occ = o.quality === 'low' ? null : new Occupancy(o.bounds, o.occluders);
  const aoRays = o.quality === 'high' || o.quality === 'ultra' ? 6 : o.quality === 'medium' ? 3 : 0;
  // expand tube lights into 3 point samples
  const pl: LightOut[] = [];
  for (const l of lights) {
    if (l.kind === 'tube') for (const f of [-0.45, 0, 0.45]) pl.push({ ...l, x: l.x + f, intensity: l.intensity / 3 });
    else pl.push(l);
  }
  const windows = portals.filter((p) => p.b === -1);
  const neigh = new Map<number, { cell: number; portal: PortalOut }[]>();
  for (const p of portals) {
    if (p.b < 0) continue;
    (neigh.get(p.a) ?? neigh.set(p.a, []).get(p.a)!).push({ cell: p.b, portal: p });
    (neigh.get(p.b) ?? neigh.set(p.b, []).get(p.b)!).push({ cell: p.a, portal: p });
  }
  const hemi = [[0.5, 0.7, 0.5], [-0.5, 0.7, 0.5], [0.5, 0.7, -0.5], [-0.5, 0.7, -0.5], [0, 1, 0], [0.8, 0.4, 0]];
  for (const c of cells) {
    const sources: { l: LightOut; via: PortalOut | null; via2?: PortalOut; id: number }[] = pl.filter((l) => l.cell === c.id).map((l) => ({ l, via: null, id: pl.indexOf(l) }));
    for (const nb of neigh.get(c.id) ?? []) {
      for (const l of pl) if (l.cell === nb.cell) sources.push({ l, via: nb.portal, id: pl.indexOf(l) });
      // two hops (e.g. stair landing -> hall -> apartment) through both portals
      for (const nb2 of neigh.get(nb.cell) ?? []) if (nb2.cell !== c.id) for (const l of pl) if (l.cell === nb2.cell) sources.push({ l, via: nb.portal, via2: nb2.portal, id: pl.indexOf(l) });
    }
    const myWindows = windows.filter((w) => w.a === c.id);
    for (const mesh of [c.opaque, c.glass]) if (mesh) bakeMesh(mesh, c, sources, myWindows, occ, aoRays, hemi);
  }
}

function bakeMesh(m: MeshArrays, c: CellOut, sources: { l: LightOut; via: PortalOut | null; via2?: PortalOut; id: number }[], wins: PortalOut[], occ: Occupancy | null, aoRays: number, hemi: number[][]) {
  const P = m.position, N = m.normal, L = m.light, nv = P.length / 3, b = c.box;
  let sumR = 0, sumG = 0, sumB = 0;
  for (let v = 0; v < nv; v++) {
    const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2], nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2];
    const px = x + nx * 0.03, py = y + ny * 0.03, pz = z + nz * 0.03;
    let r = 0, g = 0, bl = 0;
    for (const s of sources) {
      const l = s.l, lx = l.x - px, ly = l.y - py, lz = l.z - pz, d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
      let cos = (lx * nx + ly * ny + lz * nz) / d;
      if (l.kind === 'neon') cos = cos * 0.5 + 0.5; // neon tubes are omnidirectional and close
      if (cos <= 0) continue;
      if (s.via && !throughPortal([px, py, pz], [l.x, l.y, l.z], s.via.pts)) continue;
      if (s.via2 && !throughPortal([px, py, pz], [l.x, l.y, l.z], s.via2.pts)) continue;
      // bulbs in shades throw more down than up
      const down = l.kind === 'bulb' ? (ly > 0 ? 1 : 0.55) : 1;
      let e = (l.intensity * cos * down) / (d2 + 0.8);
      if (occ && e > 0.004) e *= occ.traceCached(s.id, px, py, pz, l.x, l.y, l.z);
      r += e * l.color[0]; g += e * l.color[1]; bl += e * l.color[2];
    }
    // window light: sample each glazed street opening at 6 points (rough form factor)
    let sky = 0;
    for (let wi = 0; wi < wins.length; wi++) {
      const w = wins[wi];
      const [a, bb, , dd] = w.pts;
      const ex = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], ey = [dd[0] - a[0], dd[1] - a[1], dd[2] - a[2]];
      const area = Math.hypot(ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]);
      let wn = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]; const wl = Math.hypot(wn[0], wn[1], wn[2]) || 1; wn = wn.map((q) => q / wl);
      for (let si = 0; si < 6; si++) {
        const su = WS[si][0], sv = WS[si][1];
        const sx = a[0] + ex[0] * su + ey[0] * sv, sy = a[1] + ex[1] * su + ey[1] * sv, sz = a[2] + ex[2] * su + ey[2] * sv;
        const lx = sx - px, ly = sy - py, lz = sz - pz, d2 = lx * lx + ly * ly + lz * lz, d = Math.sqrt(d2);
        const cv = (lx * nx + ly * ny + lz * nz) / d; if (cv <= 0) continue;
        const cw = Math.abs((lx * wn[0] + ly * wn[1] + lz * wn[2]) / d);
        // light from a window comes in mostly downward: weight samples on the upper part
        let e = (area / 6) * cv * cw / (Math.PI * (d2 + 0.25)) * (0.6 + sv * 0.6);
        if (occ && e > 0.002) e *= occ.traceCached(5000 + wi * 8 + si, px, py, pz, sx, sy, sz);
        sky += e;
      }
    }
    // corner AO from the cell box (distance to faces the vertex is not on)
    let ao = 1;
    const dists = [x - b[0], b[3] - x, y - b[1], b[4] - y, z - b[2], b[5] - z];
    for (const dd of dists) if (dd > 0.03) ao *= 0.55 + 0.45 * Math.min(1, dd / 0.7);
    if (occ && aoRays) {
      let hit = 0;
      for (let k = 0; k < aoRays; k++) {
        const h = hemi[k];
        // orthonormal basis around the normal: t, n, bt ; direction = t*h0 + n*h1 + bt*h2
        const tx = Math.abs(ny) < 0.9 ? -nz : 1, ty = Math.abs(ny) < 0.9 ? 0 : 0, tz = Math.abs(ny) < 0.9 ? nx : 0;
        const tl = Math.hypot(tx, ty, tz) || 1, ux = tx / tl, uy = ty / tl, uz = tz / tl;
        const bx = ny * uz - nz * uy, by = nz * ux - nx * uz, bz = nx * uy - ny * ux;
        const dx = ux * h[0] + nx * h[1] + bx * h[2], dy = uy * h[0] + ny * h[1] + by * h[2], dz = uz * h[0] + nz * h[1] + bz * h[2];
        const dl = Math.hypot(dx, dy, dz) || 1;
        if (occ.at(px + (dx / dl) * 0.35, py + (dy / dl) * 0.35, pz + (dz / dl) * 0.35) || occ.at(px + (dx / dl) * 0.7, py + (dy / dl) * 0.7, pz + (dz / dl) * 0.7)) hit++;
      }
      ao *= 1 - 0.55 * (hit / aoRays);
    }
    L[4 * v] = r * ao; L[4 * v + 1] = g * ao; L[4 * v + 2] = bl * ao; L[4 * v + 3] = sky * ao;
    sumR += r; sumG += g; sumB += bl;
  }
  // one-bounce fill: a fraction of the mean direct light, everywhere in the cell (AO-weighted)
  const k = nv ? 0.22 / nv : 0;
  const fr = sumR * k, fg = sumG * k, fb = sumB * k;
  for (let v = 0; v < nv; v++) {
    const y = P[3 * v + 1], ao = 0.6 + 0.4 * Math.min(1, (y - b[1]) / 1.2);
    L[4 * v] += fr * ao; L[4 * v + 1] += fg * ao; L[4 * v + 2] += fb * ao;
  }
}
