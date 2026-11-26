/**
 * Procedural interior kit: emits tessellated geometry, colliders, lights, portals, doors, slots and
 * markers in the interior's local frame (x along frontage, z inward, y up). Runs in a worker; no
 * three.js. Everything is generated, nothing is shipped.
 */
import { type Mat, M } from './materials';
import type { CellOut, ColliderOut, DoorOut, LightOut, MarkerOut, MarkerType, MeshArrays, MoverOut, PortalOut, SlotOut } from '../spec';

export type V3 = [number, number, number];

// ---------------------------------------------------------------- RNG (deterministic per seed)
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() { let t = (this.s += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length) % a.length]; }
  shuffle<T>(a: T[]): T[] { for (let k = a.length - 1; k > 0; k--) { const j = Math.floor(this.next() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; } return a; }
}

// ---------------------------------------------------------------- mesh builder
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export class MeshB {
  p: number[] = []; n: number[] = []; c: number[] = []; uv: number[] = []; pat: number[] = []; idx: number[] = [];
  get vcount() { return this.p.length / 3; }
  v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number, m: Mat, shade = 1) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w);
    // albedo authored in sRGB; stored linear (emissive colours too)
    this.c.push(lin(m.c[0]) * shade, lin(m.c[1]) * shade, lin(m.c[2]) * shade);
    this.pat.push(m.pat, m.p ?? 0, m.wear ?? 0.35, m.e ?? 0);
  }
  tri(a: number, b: number, c: number) { this.idx.push(a, b, c); }
  /**
   * Tessellated parallelogram p + a*s + b*t (s,t in 0..1), facing n. UVs in metres (u along a, v along b),
   * offset by uv0. Winding is fixed so the face is front-facing from n.
   */
  quad(p: V3, a: V3, b: V3, n: V3, m: Mat, tess: number, uv0: [number, number] = [0, 0], shade = 1) {
    const la = Math.hypot(a[0], a[1], a[2]), lb = Math.hypot(b[0], b[1], b[2]);
    if (la < 1e-4 || lb < 1e-4) return;
    const na = Math.max(1, Math.ceil(la / tess)), nb = Math.max(1, Math.ceil(lb / tess));
    const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const v0 = this.vcount;
    for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
      const s = i / na, t = j / nb;
      this.v(p[0] + a[0] * s + b[0] * t, p[1] + a[1] * s + b[1] * t, p[2] + a[2] * s + b[2] * t, n[0], n[1], n[2], uv0[0] + s * la, uv0[1] + t * lb, m, shade);
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      const k = v0 + j * (na + 1) + i, k1 = k + 1, k2 = k + na + 1, k3 = k2 + 1;
      if (flip) { this.tri(k, k2, k3); this.tri(k, k3, k1); } else { this.tri(k, k1, k3); this.tri(k, k3, k2); }
    }
  }
  finish(): MeshArrays {
    const nv = this.vcount;
    return {
      position: new Float32Array(this.p), normal: new Float32Array(this.n), color: new Float32Array(this.c), uv: new Float32Array(this.uv),
      pat: new Float32Array(this.pat), light: new Float32Array(nv * 4), index: new Uint32Array(this.idx),
    };
  }
}

export interface Opening { s0: number; s1: number; y0: number; y1: number; /** depth of the reveal (wall thickness) */ depth?: number; revealMat?: Mat }
export interface BoxOpts { collide?: boolean | 'cover'; occlude?: boolean; glass?: boolean; faces?: number; breakable?: ColliderOut['breakable']; shade?: number }
/** face bits for box(): skip faces nobody can see */
export const F = { NX: 1, PX: 2, NY: 4, PY: 8, NZ: 16, PZ: 32, ALL: 63, NO_BOTTOM: 59 } as const;

interface CellBuild { id: number; name: string; level: number; box: CellOut['box']; opaque: MeshB; glass: MeshB; outdoor?: boolean }

export class Kit {
  readonly rng: Rng;
  readonly cells: CellBuild[] = [];
  readonly colliders: ColliderOut[] = [];
  readonly portals: PortalOut[] = [];
  readonly lights: LightOut[] = [];
  readonly slots: SlotOut[] = [];
  readonly markers: MarkerOut[] = [];
  readonly doors: DoorOut[] = [];
  readonly movers: MoverOut[] = [];
  /** occluder boxes for baking shadows/AO (local AABBs) */
  readonly occluders: [number, number, number, number, number, number][] = [];
  cur = 0;
  /** tessellation edge (m) for large surfaces */
  tess: number;
  /** mobile Low: props simplify (fewer cylinder segments, goods as blocks) */
  readonly low: boolean;
  constructor(seed: number, public readonly id: string, quality: 'low' | 'medium' | 'high' | 'ultra') {
    this.rng = new Rng(seed);
    this.tess = quality === 'low' ? 1.1 : quality === 'medium' ? 0.8 : 0.6;
    this.low = quality === 'low';
  }

  // ------------------------------------------------------------ cells
  cell(name: string, box: CellOut['box'], level = 0, outdoor = false): number {
    const id = this.cells.length;
    this.cells.push({ id, name, level, box, opaque: new MeshB(), glass: new MeshB(), outdoor });
    this.cur = id; return id;
  }
  use(c: number) { this.cur = c; return this; }
  private get m() { return this.cells[this.cur].opaque; }
  private get g() { return this.cells[this.cur].glass; }
  portal(a: number, b: number, pts: V3[]) { this.portals.push({ a, b, pts }); }
  /** Portal for a vertical rectangular opening in a wall from (ax,az) to (bx,bz) between y0..y1. */
  portalRect(a: number, b: number, ax: number, az: number, bx: number, bz: number, y0: number, y1: number) {
    this.portal(a, b, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]]);
  }
  /** Horizontal portal (stair well opening) at height y. */
  portalFloor(a: number, b: number, x0: number, z0: number, x1: number, z1: number, y: number) {
    this.portal(a, b, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  }

  // ------------------------------------------------------------ primitives
  quad(p: V3, a: V3, b: V3, n: V3, mat: Mat, opts?: { glass?: boolean; tess?: number; uv0?: [number, number]; shade?: number }) {
    (opts?.glass ? this.g : this.m).quad(p, a, b, n, mat, opts?.tess ?? this.tess, opts?.uv0, opts?.shade);
  }
  floor(x0: number, z0: number, x1: number, z1: number, y: number, mat: Mat) {
    this.m.quad([x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, 1, 0], mat, this.tess, [x0, z0]);
  }
  ceiling(x0: number, z0: number, x1: number, z1: number, y: number, mat: Mat) {
    this.m.quad([x0, y, z0], [x1 - x0, 0, 0], [0, 0, z1 - z0], [0, -1, 0], mat, this.tess, [x0, z0]);
  }

  /** Axis-aligned box. Large faces are tessellated so baked light reads across them. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Mat, o: BoxOpts = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const mb = o.glass ? this.g : this.m, f = o.faces ?? F.ALL, dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const big = Math.max(dx, dy, dz) > this.tess * 1.5;
    const t = big ? this.tess : 99, sh = o.shade ?? 1;
    if (f & F.NX) mb.quad([x0, y0, z1], [0, 0, -dz], [0, dy, 0], [-1, 0, 0], mat, t, [z0, y0], sh);
    if (f & F.PX) mb.quad([x1, y0, z0], [0, 0, dz], [0, dy, 0], [1, 0, 0], mat, t, [z0, y0], sh);
    if (f & F.NY) mb.quad([x0, y0, z0], [dx, 0, 0], [0, 0, dz], [0, -1, 0], mat, t, [x0, z0], sh);
    if (f & F.PY) mb.quad([x0, y1, z0], [dx, 0, 0], [0, 0, dz], [0, 1, 0], mat, t, [x0, z0], sh);
    if (f & F.NZ) mb.quad([x0, y0, z0], [dx, 0, 0], [0, dy, 0], [0, 0, -1], mat, t, [x0, y0], sh);
    if (f & F.PZ) mb.quad([x1, y0, z1], [-dx, 0, 0], [0, dy, 0], [0, 0, 1], mat, t, [x0, y0], sh);
    if (o.collide) this.colliders.push({ c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], h: [dx / 2, dy / 2, dz / 2], yaw: 0, cover: o.collide === 'cover', breakable: o.breakable });
    if (o.occlude ?? (Math.min(dx, dz) > 0.25 && dy > 0.3 && !o.glass)) this.occluders.push([x0, y0, z0, x1, y1, z1]);
  }
  /** Box rotated by yaw about its centre (props). Not tessellated. */
  obox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw: number, mat: Mat, o: BoxOpts = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const R = (x: number, z: number): [number, number] => [cx + x * c + z * s, cz - x * s + z * c];
    const mb = o.glass ? this.g : this.m, f = o.faces ?? F.ALL, sh = o.shade ?? 1;
    const ax: V3 = [c * 2 * hx, 0, -s * 2 * hx], az: V3 = [s * 2 * hz, 0, c * 2 * hz], ay: V3 = [0, 2 * hy, 0];
    const p000 = R(-hx, -hz), p100 = R(hx, -hz), p001 = R(-hx, hz);
    const y0 = cy - hy, y1 = cy + hy;
    const nX: V3 = [c, 0, -s], nZ: V3 = [s, 0, c];
    if (f & F.NX) mb.quad([p000[0], y0, p000[1]], az, ay, [-nX[0], 0, -nX[2]], mat, 99, [0, 0], sh);
    if (f & F.PX) mb.quad([p100[0], y0, p100[1]], az, ay, nX, mat, 99, [0, 0], sh);
    if (f & F.NY) mb.quad([p000[0], y0, p000[1]], ax, az, [0, -1, 0], mat, 99, [0, 0], sh);
    if (f & F.PY) mb.quad([p000[0], y1, p000[1]], ax, az, [0, 1, 0], mat, 99, [0, 0], sh);
    if (f & F.NZ) mb.quad([p000[0], y0, p000[1]], ax, ay, [-nZ[0], 0, -nZ[2]], mat, 99, [0, 0], sh);
    if (f & F.PZ) mb.quad([p001[0], y0, p001[1]], ax, ay, nZ, mat, 99, [0, 0], sh);
    if (o.collide) this.colliders.push({ c: [cx, cy, cz], h: [hx, hy, hz], yaw, cover: o.collide === 'cover', breakable: o.breakable });
    if (o.occlude) { const r = Math.abs(hx * c) + Math.abs(hz * s), q = Math.abs(hx * s) + Math.abs(hz * c); this.occluders.push([cx - r, y0, cz - q, cx + r, y1, cz + q]); }
  }
  /** Vertical cylinder (stools, poles, columns, bottles). */
  cyl(cx: number, y0: number, cz: number, r: number, h: number, mat: Mat, seg = 10, o: BoxOpts & { top?: boolean; r1?: number } = {}) {
    if (this.low) seg = Math.max(4, Math.round(seg * 0.5));
    const mb = o.glass ? this.g : this.m, r1 = o.r1 ?? r, v0 = mb.vcount, sh = o.shade ?? 1;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      mb.v(cx + ca * r, y0, cz + sa * r, ca, 0, sa, (k / seg) * 6.283 * r, 0, mat, sh);
      mb.v(cx + ca * r1, y0 + h, cz + sa * r1, ca, 0, sa, (k / seg) * 6.283 * r, h, mat, sh);
    }
    for (let k = 0; k < seg; k++) { const a = v0 + k * 2; mb.tri(a, a + 1, a + 3); mb.tri(a, a + 3, a + 2); }
    if (o.top !== false) {
      const c0 = mb.vcount; mb.v(cx, y0 + h, cz, 0, 1, 0, 0, 0, mat, sh);
      for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI * 2; mb.v(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1, 0, 1, 0, Math.cos(a) * r1, Math.sin(a) * r1, mat, sh); }
      for (let k = 0; k < seg; k++) mb.tri(c0, c0 + 2 + k, c0 + 1 + k);
    }
    if (o.collide) this.colliders.push({ c: [cx, y0 + h / 2, cz], h: [Math.max(r, r1), h / 2, Math.max(r, r1)], yaw: 0, cover: o.collide === 'cover', breakable: o.breakable });
  }

  /**
   * Wall face from (ax,az) to (bx,bz), y0..y1, visible from side `side` (+1 = left of a->b, i.e.
   * normal (-dz,dx)). Openings are in wall coordinates (s along a->b from a, y). Each opening gets
   * reveals of `depth` going away from the visible side (into the wall).
   */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, mat: Mat, side: 1 | -1, openings: Opening[] = [], o: { collide?: boolean; thick?: number } = {}) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 1e-3) return;
    const dx = (bx - ax) / L, dz = (bz - az) / L, nx = -dz * side, nz = dx * side;
    const ops = openings.map((q) => ({ ...q, s0: Math.max(0, q.s0), s1: Math.min(L, q.s1), y0: Math.max(y0, q.y0), y1: Math.min(y1, q.y1) })).filter((q) => q.s1 - q.s0 > 0.01 && q.y1 - q.y0 > 0.01);
    const ss = [0, L, ...ops.flatMap((q) => [q.s0, q.s1])].sort((p, q) => p - q).filter((v, k, a) => k === 0 || v - a[k - 1] > 1e-3);
    const ys = [y0, y1, ...ops.flatMap((q) => [q.y0, q.y1])].sort((p, q) => p - q).filter((v, k, a) => k === 0 || v - a[k - 1] > 1e-3);
    for (let i = 0; i + 1 < ss.length; i++) for (let j = 0; j + 1 < ys.length; j++) {
      const sm = (ss[i] + ss[i + 1]) / 2, ym = (ys[j] + ys[j + 1]) / 2;
      if (ops.some((q) => sm > q.s0 && sm < q.s1 && ym > q.y0 && ym < q.y1)) continue;
      this.m.quad([ax + dx * ss[i], ys[j], az + dz * ss[i]], [dx * (ss[i + 1] - ss[i]), 0, dz * (ss[i + 1] - ss[i])], [0, ys[j + 1] - ys[j], 0], [nx, 0, nz], mat, this.tess, [ss[i], ys[j] - y0]);
    }
    for (const q of ops) {
      const d = q.depth ?? 0; if (d <= 0) continue;
      const rm = q.revealMat ?? mat, bx0 = -nx * d, bz0 = -nz * d;
      const pA: V3 = [ax + dx * q.s0, 0, az + dz * q.s0], pB: V3 = [ax + dx * q.s1, 0, az + dz * q.s1];
      // jambs (normals face into the opening), head, sill
      this.m.quad([pA[0], q.y0, pA[2]], [bx0, 0, bz0], [0, q.y1 - q.y0, 0], [dx, 0, dz], rm, this.tess);
      this.m.quad([pB[0], q.y0, pB[2]], [bx0, 0, bz0], [0, q.y1 - q.y0, 0], [-dx, 0, -dz], rm, this.tess);
      this.m.quad([pA[0], q.y1, pA[2]], [dx * (q.s1 - q.s0), 0, dz * (q.s1 - q.s0)], [bx0, 0, bz0], [0, -1, 0], rm, this.tess);
      if (q.y0 > y0 + 0.01) this.m.quad([pA[0], q.y0, pA[2]], [dx * (q.s1 - q.s0), 0, dz * (q.s1 - q.s0)], [bx0, 0, bz0], [0, 1, 0], rm, this.tess);
    }
    if (o.collide !== false) {
      // collider slabs around openings (doors leave a gap); thickness behind the visible face
      const th = o.thick ?? 0.2, cx = -nx * th / 2, cz = -nz * th / 2, yaw = Math.atan2(dx, dz) - Math.PI / 2;
      const solid: [number, number, number, number][] = [];
      const cutS = [0, L, ...ops.flatMap((q) => [q.s0, q.s1])].sort((p, q) => p - q);
      for (let i = 0; i + 1 < cutS.length; i++) {
        const s0 = cutS[i], s1 = cutS[i + 1]; if (s1 - s0 < 0.02) continue; const sm = (s0 + s1) / 2;
        const over = ops.filter((q) => sm > q.s0 && sm < q.s1);
        if (!over.length) { solid.push([s0, s1, y0, y1]); continue; }
        // above/below openings
        let yl = y0; for (const q of over.sort((p, r) => p.y0 - r.y0)) { if (q.y0 - yl > 0.05) solid.push([s0, s1, yl, q.y0]); yl = Math.max(yl, q.y1); }
        if (y1 - yl > 0.05) solid.push([s0, s1, yl, y1]);
      }
      for (const [s0, s1, ya, yb] of solid) {
        const sm = (s0 + s1) / 2;
        this.colliders.push({ c: [ax + dx * sm + cx, (ya + yb) / 2, az + dz * sm + cz], h: [(s1 - s0) / 2, (yb - ya) / 2, th / 2], yaw });
      }
    }
  }

  /** Rectangular room shell with inward-facing walls. `ops` per side: z0 (facade side), x1, z1, x0. */
  room(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, m: { floor?: Mat | null; wall: Mat; ceiling?: Mat | null; wallZ0?: Mat; wallX1?: Mat; wallZ1?: Mat; wallX0?: Mat },
    ops: { z0?: Opening[]; x1?: Opening[]; z1?: Opening[]; x0?: Opening[] } = {}, o: { collide?: boolean; skip?: ('z0' | 'x1' | 'z1' | 'x0')[] } = {}) {
    if (m.floor) this.floor(x0, z0, x1, z1, y0, m.floor);
    if (m.ceiling) this.ceiling(x0, z0, x1, z1, y1, m.ceiling);
    const sk = o.skip ?? [], col = o.collide;
    // Walls run counter-clockwise in x/z (z0: +x, x1: +z, z1: -x, x0: -z), so side = 1 faces inward on every edge.
    // Openings are measured from each edge's start: z0 from x0, x1 from z0, z1 from x1, x0 from z1.
    if (!sk.includes('z0')) this.wall(x0, z0, x1, z0, y0, y1, m.wallZ0 ?? m.wall, 1, ops.z0, { collide: col });
    if (!sk.includes('x1')) this.wall(x1, z0, x1, z1, y0, y1, m.wallX1 ?? m.wall, 1, ops.x1, { collide: col });
    if (!sk.includes('z1')) this.wall(x1, z1, x0, z1, y0, y1, m.wallZ1 ?? m.wall, 1, ops.z1, { collide: col });
    if (!sk.includes('x0')) this.wall(x0, z1, x0, z0, y0, y1, m.wallX0 ?? m.wall, 1, ops.x0, { collide: col });
  }

  /** Baseboard strip along a wall (cheap detail that sells a room). */
  baseboard(ax: number, az: number, bx: number, bz: number, nx: number, nz: number, mat: Mat = M.woodDark, h = 0.14, y = 0) {
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.05) return;
    const dx = (bx - ax) / L, dz = (bz - az) / L, t = 0.02;
    this.m.quad([ax + nx * t, y, az + nz * t], [dx * L, 0, dz * L], [0, h, 0], [nx, 0, nz], mat, 99);
    this.m.quad([ax + nx * t, y + h, az + nz * t], [dx * L, 0, dz * L], [-nx * t, 0, -nz * t], [0, 1, 0], mat, 99);
  }

  /**
   * Straight stair flight. Starts at (x,z) bottom-front-left, climbs along direction (dx,dz) (axis aligned),
   * width w across. Renders treads/risers/stringer and adds one smooth ramp collider.
   */
  stair(x: number, z: number, dirX: number, dirZ: number, w: number, y0: number, y1: number, mat: Mat, o: { run?: number; stringer?: Mat; nosing?: Mat; rail?: 'left' | 'right' | 'both' | 'none'; railMat?: Mat; soffit?: Mat | null } = {}) {
    const rise = y1 - y0, n = Math.max(2, Math.round(rise / 0.19)), rh = rise / n, run = o.run ?? 0.26, L = run * n;
    const px = -dirZ, pz = dirX; // across, to the left of travel
    for (let k = 0; k < n; k++) {
      const s0 = k * run, ya = y0 + k * rh, yb = ya + rh;
      const ax = x + dirX * s0, az = z + dirZ * s0;
      // riser
      this.m.quad([ax, ya, az], [px * w, 0, pz * w], [0, rh, 0], [-dirX, 0, -dirZ], mat, 99, [0, ya]);
      // tread
      this.m.quad([ax, yb, az], [px * w, 0, pz * w], [dirX * run, 0, dirZ * run], [0, 1, 0], o.nosing ?? mat, 99, [0, s0]);
    }
    // stringers (side faces) as stepped profile approximated by a sloped quad + triangle fill
    const sm = o.stringer ?? mat;
    for (const side of [0, 1]) {
      const sx = x + px * w * side, sz = z + pz * w * side, nxs = side ? px : -px, nzs = side ? pz : -pz;
      // sloped band
      this.m.quad([sx, y0 - 0.25, sz], [dirX * L, rise, dirZ * L], [0, 0.25 + rh, 0], [nxs, 0, nzs], sm, this.tess);
    }
    if (o.soffit !== null) this.m.quad([x, y0 - 0.25, z], [px * w, 0, pz * w], [dirX * L, rise, dirZ * L], [0, -1, 0], o.soffit ?? sm, this.tess);
    // ramp collider: a thin slab along the slope
    const len = Math.hypot(L, rise), pitch = Math.atan2(rise, L);
    const cxm = x + dirX * L / 2 + px * w / 2, czm = z + dirZ * L / 2 + pz * w / 2;
    const yaw = Math.atan2(dirX, dirZ); // local +z of the box points along travel
    this.colliders.push({ c: [cxm, y0 + rise / 2 - 0.1 * Math.cos(pitch), czm], h: [w / 2, 0.1, len / 2 + 0.05], yaw, pitch });
    if (o.rail && o.rail !== 'none') {
      const rm = o.railMat ?? M.woodDark;
      const sides = o.rail === 'both' ? [0, 1] : o.rail === 'left' ? [1] : [0];
      for (const side of sides) {
        const rx = x + px * (side ? w - 0.05 : 0.05), rz = z + pz * (side ? w - 0.05 : 0.05);
        // handrail as a thin sloped box made of a quad pair; balusters every other step
        this.m.quad([rx - px * 0.03, y0 + 0.9, rz - pz * 0.03], [dirX * L, rise, dirZ * L], [px * 0.06, 0, pz * 0.06], [0, 1, 0], rm, 99);
        this.m.quad([rx - px * 0.03, y0 + 0.84, rz - pz * 0.03], [dirX * L, rise, dirZ * L], [0, 0.06, 0], [-px, 0, -pz], rm, 99);
        this.m.quad([rx + px * 0.03, y0 + 0.84, rz + pz * 0.03], [dirX * L, rise, dirZ * L], [0, 0.06, 0], [px, 0, pz], rm, 99);
        for (let k = 0; k < n; k += 2) {
          const s = (k + 0.5) * run, yy = y0 + (k + 1) * rh;
          this.box(rx + dirX * s - 0.015, yy, rz + dirZ * s - 0.015, rx + dirX * s + 0.015, yy + 0.86 - 0.5 * rh, rz + dirZ * s + 0.015, M.paintDarkGreen, { occlude: false });
        }
        this.colliders.push({ c: [x + dirX * L / 2 + px * (side ? w : 0), y0 + rise / 2 + 0.5, z + dirZ * L / 2 + pz * (side ? w : 0)], h: [0.03, 0.5, len / 2], yaw, pitch });
      }
    }
    return { L, n, rh };
  }

  /** Colliders only (invisible blockers, e.g. behind counters). */
  collider(c: ColliderOut) { this.colliders.push(c); }

  light(x: number, y: number, z: number, color: [number, number, number], intensity: number, kind: LightOut['kind'] = 'bulb', flicker?: number) {
    this.lights.push({ x, y, z, color, intensity, kind, cell: this.cur, flicker });
  }
  slot(role: string, x: number, y: number, z: number, yaw: number, hours?: [string, string]) {
    this.slots.push({ id: `${this.id}:${role}:${this.slots.filter((s) => s.role === role).length}`, role, x, y, z, yaw, hours });
  }
  marker(type: MarkerType, x: number, y: number, z: number, name?: string) {
    this.markers.push({ id: `${this.id}:${type}:${this.markers.filter((s) => s.type === type).length}`, type, x, y, z, name });
  }

  /**
   * Hinged door leaf. Hinge at (hx, y, hz); closed leaf runs along local direction `yaw` (0 = +x).
   * swing +1 opens toward the left of the leaf direction.
   */
  door(id: string, hx: number, y: number, hz: number, w: number, h: number, yaw: number, swing: 1 | -1, o: { locked?: boolean; cellA?: number; cellB?: number; street?: boolean; glazed?: boolean; mat?: Mat; key?: string } = {}) {
    const mb = new MeshB(), mat = o.mat ?? M.woodDark, t = 0.045;
    const glazed = o.glazed ?? false;
    const panel = (x0: number, x1: number, y0: number, y1: number) => {
      // both faces + edges, leaf frame: x along leaf, y up, z thickness
      mb.quad([x0, y0, t], [x1 - x0, 0, 0], [0, y1 - y0, 0], [0, 0, 1], mat, 99, [x0, y0]);
      mb.quad([x1, y0, -t], [x0 - x1, 0, 0], [0, y1 - y0, 0], [0, 0, -1], mat, 99, [x0, y0]);
    };
    if (glazed) {
      panel(0, w, 0, h * 0.42); panel(0, w, h - 0.12, h); panel(0, 0.1, h * 0.42, h - 0.12); panel(w - 0.1, w, h * 0.42, h - 0.12);
    } else {
      panel(0, w, 0, h);
      // raised panels: thin boxes on both faces
      for (const [py0, py1] of [[0.15, h * 0.45], [h * 0.52, h - 0.15]]) for (const zs of [1, -1]) {
        mb.quad([0.12, py0, zs * (t + 0.008)], [w - 0.24, 0, 0], [0, py1 - py0, 0], [0, 0, zs], mat, 99, [0, 0], 0.92);
      }
    }
    // edges
    mb.quad([0, 0, -t], [0, 0, 2 * t], [0, h, 0], [-1, 0, 0], mat, 99); mb.quad([w, 0, t], [0, 0, -2 * t], [0, h, 0], [1, 0, 0], mat, 99);
    mb.quad([0, h, -t], [w, 0, 0], [0, 0, 2 * t], [0, 1, 0], mat, 99);
    // knob both sides
    for (const zs of [1, -1]) { mb.quad([w - 0.12, 0.98, zs * (t + 0.04)], [0.05, 0, 0], [0, 0.05, 0], [0, 0, zs], M.chrome, 99); }
    const out = mb.finish();
    if (glazed) {
      const gb = new MeshB();
      gb.quad([0.1, h * 0.42, 0], [w - 0.2, 0, 0], [0, h * 0.58 - 0.12, 0], [0, 0, 1], M.glass, 99);
      gb.quad([w - 0.1, h * 0.42, 0], [-(w - 0.2), 0, 0], [0, h * 0.58 - 0.12, 0], [0, 0, -1], M.glass, 99);
      // merge glass into door mesh with emissive=-1 tag (runtime renders door glass with the glass material)
      const g = gb.finish(); for (let k = 0; k < g.pat.length; k += 4) g.pat[k] = -1;
      merge(out, g);
    }
    this.doors.push({ id, hinge: [hx, y, hz], w, h, yaw, swing, locked: o.locked ?? false, cellA: o.cellA ?? this.cur, cellB: o.cellB ?? -1, street: o.street ?? false, glazed, mesh: out, key: o.key });
  }

  finishCells(): CellOut[] {
    return this.cells.map((c) => ({ id: c.id, name: c.name, level: c.level, box: c.box, opaque: c.opaque.finish(), glass: c.glass.vcount ? c.glass.finish() : null, outdoor: c.outdoor }));
  }
}

/** Append mesh b into a (in place, returns a new arrays object). */
export function merge(a: MeshArrays, b: MeshArrays): MeshArrays {
  const cat = (x: Float32Array, y: Float32Array) => { const r = new Float32Array(x.length + y.length); r.set(x); r.set(y, x.length); return r; };
  const nv = a.position.length / 3;
  const idx = new Uint32Array(a.index.length + b.index.length); idx.set(a.index); for (let k = 0; k < b.index.length; k++) idx[a.index.length + k] = b.index[k] + nv;
  a.position = cat(a.position, b.position); a.normal = cat(a.normal, b.normal); a.color = cat(a.color, b.color); a.uv = cat(a.uv, b.uv); a.pat = cat(a.pat, b.pat); a.light = cat(a.light, b.light); a.index = idx;
  return a;
}
