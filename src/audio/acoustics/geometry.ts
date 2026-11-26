/**
 * Acoustic geometry from the real city data: building footprint edges (with heights) in a
 * uniform grid for ray casts and line-of-sight, park polygons for surfaces and open air, and
 * street centrelines/intersections for "where am I" queries and corner diffraction.
 */
import { CHUNK_SIZE } from '../../shared/geo';
import { GroundKind, type ChunkData } from '../../shared/chunkFormat';

export interface StreetRec { n: string; c: string; w: number; o: number; p: number[] }
export interface Intersection { x: number; z: number; a: string; b: string; w: number }

const CELL = 16;

export class AcousticGeometry {
  // building edges: x1,z1,x2,z2 + height + building index + style + use
  private ex: Float32Array = new Float32Array(0);
  private eh: Float32Array = new Float32Array(0);
  private eb: Int32Array = new Int32Array(0);
  edgeCount = 0;
  private minX = 0; private minZ = 0; private nx = 1; private nz = 1;
  private cellStart: Int32Array = new Int32Array(1); private cellItems: Int32Array = new Int32Array(0);
  private stamp: Int32Array = new Int32Array(0); private query = 1;
  buildings: { x: number; z: number; h: number; style: number; use: number; floors: number; year: number; ring: Float32Array }[] = [];
  parks: { ring: Float32Array; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  streets: StreetRec[] = [];
  private segs: Float32Array = new Float32Array(0); // x1,z1,x2,z2 per street segment
  private segStreet: Int32Array = new Int32Array(0);
  private sCellStart: Int32Array = new Int32Array(1); private sCellItems: Int32Array = new Int32Array(0);
  intersections: Intersection[] = [];
  pois: { kind: number; x: number; z: number }[] = [];
  stats = { buildMs: 0, edges: 0, buildings: 0, intersections: 0 };

  build(chunks: ChunkData[], streets: StreetRec[]) {
    const t0 = performance.now();
    const edges: number[] = [], heights: number[] = [], bidx: number[] = [];
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const c of chunks) {
      const ox = (c.i + 0.5) * CHUNK_SIZE, oz = (c.j + 0.5) * CHUNK_SIZE;
      for (const b of c.buildings) {
        const bi = this.buildings.length;
        let cx = 0, cz = 0, n = 0;
        for (let r = 0; r < b.rings.length; r++) {
          const ring = b.rings[r];
          const m = ring.length / 2;
          for (let k = 0; k < m; k++) {
            const x1 = ring[k * 2] + ox, z1 = ring[k * 2 + 1] + oz;
            const k2 = (k + 1) % m; const x2 = ring[k2 * 2] + ox, z2 = ring[k2 * 2 + 1] + oz;
            edges.push(x1, z1, x2, z2); heights.push(b.height); bidx.push(bi);
            if (r === 0) { cx += x1; cz += z1; n++; }
            minX = Math.min(minX, x1); maxX = Math.max(maxX, x1); minZ = Math.min(minZ, z1); maxZ = Math.max(maxZ, z1);
          }
        }
        const outer = new Float32Array(b.rings[0].length);
        for (let k = 0; k < outer.length; k += 2) { outer[k] = b.rings[0][k] + ox; outer[k + 1] = b.rings[0][k + 1] + oz; }
        this.buildings.push({ x: cx / Math.max(n, 1), z: cz / Math.max(n, 1), h: b.height, style: b.style, use: b.use, floors: b.floors, year: b.year, ring: outer });
      }
      for (const gr of c.ground) {
        if (gr.kind !== GroundKind.Park) continue;
        const r0 = gr.rings[0]; const ring = new Float32Array(r0.length);
        let a = Infinity, bx = -Infinity, cz = Infinity, d = -Infinity;
        for (let k = 0; k < r0.length; k += 2) { ring[k] = r0[k] + ox; ring[k + 1] = r0[k + 1] + oz; a = Math.min(a, ring[k]); bx = Math.max(bx, ring[k]); cz = Math.min(cz, ring[k + 1]); d = Math.max(d, ring[k + 1]); }
        this.parks.push({ ring, minX: a, maxX: bx, minZ: cz, maxZ: d });
      }
      for (const p of c.pois) this.pois.push({ kind: p.kind, x: p.x + ox, z: p.z + oz });
    }
    this.ex = new Float32Array(edges); this.eh = new Float32Array(heights); this.eb = new Int32Array(bidx);
    this.edgeCount = heights.length; this.stamp = new Int32Array(this.edgeCount);
    const pad = 400;
    this.minX = (isFinite(minX) ? minX : -1000) - pad; this.minZ = (isFinite(minZ) ? minZ : -2000) - pad;
    this.nx = Math.ceil(((isFinite(maxX) ? maxX : 1000) + pad - this.minX) / CELL); this.nz = Math.ceil(((isFinite(maxZ) ? maxZ : 1000) + pad - this.minZ) / CELL);
    // Bucket edges into every cell their bounding box touches (edges are short: footprints).
    const counts = new Int32Array(this.nx * this.nz + 1);
    const each = (k: number, fn: (cell: number) => void) => {
      const x1 = this.ex[k * 4], z1 = this.ex[k * 4 + 1], x2 = this.ex[k * 4 + 2], z2 = this.ex[k * 4 + 3];
      const i0 = this.cx(Math.min(x1, x2)), i1 = this.cx(Math.max(x1, x2)), j0 = this.cz(Math.min(z1, z2)), j1 = this.cz(Math.max(z1, z2));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.nx + i);
    };
    for (let k = 0; k < this.edgeCount; k++) each(k, (c) => counts[c + 1]++);
    for (let c = 0; c < this.nx * this.nz; c++) counts[c + 1] += counts[c];
    this.cellStart = counts; const fill = counts.slice(); this.cellItems = new Int32Array(counts[this.nx * this.nz]);
    for (let k = 0; k < this.edgeCount; k++) each(k, (c) => { this.cellItems[fill[c]++] = k; });
    this.buildStreets(streets);
    this.stats = { buildMs: performance.now() - t0, edges: this.edgeCount, buildings: this.buildings.length, intersections: this.intersections.length };
  }

  private cx(x: number) { return Math.max(0, Math.min(this.nx - 1, Math.floor((x - this.minX) / CELL))); }
  private cz(z: number) { return Math.max(0, Math.min(this.nz - 1, Math.floor((z - this.minZ) / CELL))); }

  private buildStreets(streets: StreetRec[]) {
    this.streets = streets;
    const segs: number[] = [], owner: number[] = [];
    streets.forEach((s, si) => { for (let k = 0; k + 3 < s.p.length; k += 2) { segs.push(s.p[k], s.p[k + 1], s.p[k + 2], s.p[k + 3]); owner.push(si); } });
    this.segs = new Float32Array(segs); this.segStreet = new Int32Array(owner);
    const n = this.nx * this.nz;
    const counts = new Int32Array(n + 1);
    const nseg = owner.length;
    const each = (k: number, fn: (c: number) => void) => {
      const x1 = this.segs[k * 4], z1 = this.segs[k * 4 + 1], x2 = this.segs[k * 4 + 2], z2 = this.segs[k * 4 + 3];
      const i0 = this.cx(Math.min(x1, x2) - 20), i1 = this.cx(Math.max(x1, x2) + 20), j0 = this.cz(Math.min(z1, z2) - 20), j1 = this.cz(Math.max(z1, z2) + 20);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * this.nx + i);
    };
    for (let k = 0; k < nseg; k++) each(k, (c) => counts[c + 1]++);
    for (let c = 0; c < n; c++) counts[c + 1] += counts[c];
    this.sCellStart = counts; const fill = counts.slice(); this.sCellItems = new Int32Array(counts[n]);
    for (let k = 0; k < nseg; k++) each(k, (c) => { this.sCellItems[fill[c]++] = k; });
    // Intersections: crossings between segments of differently named streets, merged within 12 m.
    const pts: Intersection[] = [];
    const bb = (k: number) => [Math.min(this.segs[k * 4], this.segs[k * 4 + 2]), Math.max(this.segs[k * 4], this.segs[k * 4 + 2]), Math.min(this.segs[k * 4 + 1], this.segs[k * 4 + 3]), Math.max(this.segs[k * 4 + 1], this.segs[k * 4 + 3])];
    const boxes = Array.from({ length: nseg }, (_, k) => bb(k));
    for (let a = 0; a < nseg; a++) {
      const A = boxes[a];
      for (let b = a + 1; b < nseg; b++) {
        const B = boxes[b];
        if (B[0] > A[1] || B[1] < A[0] || B[2] > A[3] || B[3] < A[2]) continue;
        const sa = streets[owner[a]], sb = streets[owner[b]]; if (sa.n === sb.n) continue;
        const hit = segHit(this.segs[a * 4], this.segs[a * 4 + 1], this.segs[a * 4 + 2], this.segs[a * 4 + 3], this.segs[b * 4], this.segs[b * 4 + 1], this.segs[b * 4 + 2], this.segs[b * 4 + 3]);
        if (!hit) continue;
        const [x, z] = hit;
        if (pts.some((p) => Math.abs(p.x - x) < 12 && Math.abs(p.z - z) < 12)) continue;
        pts.push({ x, z, a: sa.n, b: sb.n, w: Math.max(sa.w, sb.w) });
      }
    }
    this.intersections = pts;
  }

  /** Nearest street centreline: name, roadway width, class, distance and unit direction. */
  nearestStreet(x: number, z: number, maxD = 60): { street: StreetRec; d: number; dx: number; dz: number; px: number; pz: number } | null {
    const c = this.cz(z) * this.nx + this.cx(x);
    let best = -1, bd = maxD * maxD, bpx = 0, bpz = 0;
    for (let q = this.sCellStart[c]; q < this.sCellStart[c + 1]; q++) {
      const k = this.sCellItems[q];
      const x1 = this.segs[k * 4], z1 = this.segs[k * 4 + 1], x2 = this.segs[k * 4 + 2], z2 = this.segs[k * 4 + 3];
      const vx = x2 - x1, vz = z2 - z1, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (z - z1) * vz) / L2));
      const px = x1 + vx * t, pz = z1 + vz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < bd) { bd = d2; best = k; bpx = px; bpz = pz; }
    }
    if (best < 0) return null;
    const vx = this.segs[best * 4 + 2] - this.segs[best * 4], vz = this.segs[best * 4 + 3] - this.segs[best * 4 + 1], L = Math.hypot(vx, vz) || 1;
    return { street: this.streets[this.segStreet[best]], d: Math.sqrt(bd), dx: vx / L, dz: vz / L, px: bpx, pz: bpz };
  }

  inPark(x: number, z: number): boolean {
    for (const p of this.parks) { if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue; if (pointInRing(p.ring, x, z)) return true; }
    return false;
  }
  /** Distance to the nearest park polygon edge (0 if inside), capped at `cap`. */
  parkDistance(x: number, z: number, cap = 200): number {
    let best = cap;
    for (const p of this.parks) {
      if (x < p.minX - cap || x > p.maxX + cap || z < p.minZ - cap || z > p.maxZ + cap) continue;
      if (pointInRing(p.ring, x, z)) return 0;
      const r = p.ring; const m = r.length / 2;
      for (let k = 0; k < m; k++) { const k2 = (k + 1) % m; best = Math.min(best, segDist(x, z, r[k * 2], r[k * 2 + 1], r[k2 * 2], r[k2 * 2 + 1])); }
    }
    return best;
  }

  /**
   * First facade hit along a horizontal ray. Returns distance (m) and building height, or null.
   * Amanatides-Woo traversal of the edge grid.
   */
  raycast(ox: number, oz: number, dx: number, dz: number, maxD: number): { d: number; h: number; b: number } | null {
    const q = ++this.query;
    let i = this.cx(ox), j = this.cz(oz);
    const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    const bx = this.minX + (i + (dx > 0 ? 1 : 0)) * CELL, bz = this.minZ + (j + (dz > 0 ? 1 : 0)) * CELL;
    let tmx = dx !== 0 ? (bx - ox) / dx : Infinity, tmz = dz !== 0 ? (bz - oz) / dz : Infinity;
    let best = Infinity, bh = 0, bb = -1;
    for (;;) {
      const c = j * this.nx + i;
      for (let s = this.cellStart[c]; s < this.cellStart[c + 1]; s++) {
        const k = this.cellItems[s]; if (this.stamp[k] === q) continue; this.stamp[k] = q;
        const t = rayEdge(ox, oz, dx, dz, this.ex[k * 4], this.ex[k * 4 + 1], this.ex[k * 4 + 2], this.ex[k * 4 + 3]);
        if (t > 0.05 && t < best) { best = t; bh = this.eh[k]; bb = this.eb[k]; }
      }
      const tExit = Math.min(tmx, tmz);
      if (best <= tExit || tExit > maxD) break;
      if (tmx < tmz) { i += stepI; tmx += tdx; if (i < 0 || i >= this.nx) break; } else { j += stepJ; tmz += tdz; if (j < 0 || j >= this.nz) break; }
    }
    return best <= maxD ? { d: best, h: bh, b: bb } : null;
  }

  /** Number of facade edges crossed by segment a->b, ignoring buildings lower than `minH` m. */
  crossings(ax: number, az: number, bx: number, bz: number, minH = 3.5, stopAt = 2): number {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) return 0;
    const ux = dx / L, uz = dz / L;
    const q = ++this.query;
    let i = this.cx(ax), j = this.cz(az); const ti = this.cx(bx), tj = this.cz(bz);
    const stepI = ux > 0 ? 1 : -1, stepJ = uz > 0 ? 1 : -1;
    const tdx = ux !== 0 ? Math.abs(CELL / ux) : Infinity, tdz = uz !== 0 ? Math.abs(CELL / uz) : Infinity;
    let tmx = ux !== 0 ? (this.minX + (i + (ux > 0 ? 1 : 0)) * CELL - ax) / ux : Infinity;
    let tmz = uz !== 0 ? (this.minZ + (j + (uz > 0 ? 1 : 0)) * CELL - az) / uz : Infinity;
    let n = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const c = j * this.nx + i;
      for (let s = this.cellStart[c]; s < this.cellStart[c + 1]; s++) {
        const k = this.cellItems[s]; if (this.stamp[k] === q) continue; this.stamp[k] = q;
        if (this.eh[k] < minH) continue;
        if (segHit(ax, az, bx, bz, this.ex[k * 4], this.ex[k * 4 + 1], this.ex[k * 4 + 2], this.ex[k * 4 + 3])) { if (++n >= stopAt) return n; }
      }
      if (i === ti && j === tj) break;
      if (Math.min(tmx, tmz) > L) break;
      if (tmx < tmz) { i += stepI; tmx += tdx; } else { j += stepJ; tmz += tdz; }
      if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) break;
    }
    return n;
  }

  /** Buildings within radius r (centroids), for placing facade emitters. */
  buildingsNear(x: number, z: number, r: number) { return this.buildings.filter((b) => Math.abs(b.x - x) < r && Math.abs(b.z - z) < r); }
}

function rayEdge(ox: number, oz: number, dx: number, dz: number, x1: number, z1: number, x2: number, z2: number): number {
  const ex = x2 - x1, ez = z2 - z1; const den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) return Infinity;
  const t = ((x1 - ox) * ez - (z1 - oz) * ex) / den; const u = ((x1 - ox) * dz - (z1 - oz) * dx) / den;
  return u >= 0 && u <= 1 ? t : Infinity;
}
export function segHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): [number, number] | null {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz; const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [ax + rx * t, az + rz * t] : null;
}
function segDist(px: number, pz: number, x1: number, z1: number, x2: number, z2: number) {
  const vx = x2 - x1, vz = z2 - z1, L2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((px - x1) * vx + (pz - z1) * vz) / L2));
  return Math.hypot(px - x1 - vx * t, pz - z1 - vz * t);
}
export function pointInRing(r: Float32Array, x: number, z: number) {
  let inside = false; const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
