import type { BoxShape, RayHit, WorldQuery } from './world';
import { DEFAULT_THICKNESS } from './world';
import type { V3 } from './vec';

/**
 * Analytic oriented-box world: headless tests, the flat shooting lot and the dynamic layer in game
 * (cars, props and cover pieces that are not part of the static city). Solid boxes report their full
 * thickness along the ray; `hollow` boxes (vehicle bodies) report thin-skin panels on entry AND exit,
 * so a round can pass a near door, the cabin (and whoever sits in it), then the far door.
 */
export interface Box extends BoxShape { hollow?: boolean; enabled?: boolean }

export class BoxWorld implements WorldQuery {
  boxes: Box[] = [];
  groundY = 0;
  constructor(boxes: Box[] = [], public fallback?: WorldQuery) { this.boxes = boxes; }
  add(b: Box) { this.boxes.push(b); return b; }
  remove(id: string) { this.boxes = this.boxes.filter((b) => b.id !== id); }
  get(id: string) { return this.boxes.find((b) => b.id === id); }

  ray(o: V3, d: V3, max: number, ignore?: string): RayHit | null {
    let best: RayHit | null = null;
    for (const b of this.boxes) {
      if (b.enabled === false || b.id === ignore) continue;
      const span = slabs(o, d, b);
      if (!span) continue;
      const [tin, tout, nin, nout] = span;
      if (tout < 0) continue;
      let t: number, thickness: number, normal: V3;
      if (tin >= 0) { t = tin; normal = nin; thickness = b.hollow ? b.thickness ?? DEFAULT_THICKNESS[b.material] : tout - tin; }
      else if (b.hollow) { t = tout; normal = nout; thickness = b.thickness ?? DEFAULT_THICKNESS[b.material]; } // inside the cabin: far panel
      else { t = 0; normal = [-d[0], -d[1], -d[2]]; thickness = tout; }
      if (t > max) continue;
      if (!best || t < best.t) best = { t, material: b.material, id: b.id, thickness, normal };
    }
    // ground plane
    if (d[1] < -1e-6) {
      const tg = (this.ground(o[0], o[2]) - o[1]) / d[1];
      if (tg >= 0 && tg <= max && (!best || tg < best.t)) best = { t: tg, material: 'asphalt', id: 'ground', thickness: 1, normal: [0, 1, 0] };
    }
    if (this.fallback) {
      const f = this.fallback.ray(o, d, best ? best.t : max, ignore);
      if (f && (!best || f.t < best.t)) best = f;
    }
    return best;
  }
  ground(x: number, z: number) { return this.fallback ? this.fallback.ground(x, z) : this.groundY; }

  /** 2D: is the segment blocked by any solid box taller than minH (for AI line-of-sight on the plane)? */
  blocked(ax: number, az: number, bx: number, bz: number, y: number) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    const h = this.ray([ax, y, az], [dx / L, 0, dz / L], L);
    return !!h && h.material !== 'glass';
  }
}

function slabs(o: V3, d: V3, b: Box): [number, number, V3, V3] | null {
  const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  const px = o[0] - b.c[0], py = o[1] - b.c[1], pz = o[2] - b.c[2];
  const lp = [px * cs - pz * sn, py, px * sn + pz * cs];
  const ld = [d[0] * cs - d[2] * sn, d[1], d[0] * sn + d[2] * cs];
  let tmin = -Infinity, tmax = Infinity, amin = 0, amax = 0, smin = 1, smax = 1;
  for (let a = 0; a < 3; a++) {
    const h = b.h[a];
    if (Math.abs(ld[a]) < 1e-9) { if (Math.abs(lp[a]) > h) return null; continue; }
    let t1 = (-h - lp[a]) / ld[a], t2 = (h - lp[a]) / ld[a], s1 = -1, s2 = 1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [s1, s2] = [s2, s1]; }
    if (t1 > tmin) { tmin = t1; amin = a; smin = s1; }
    if (t2 < tmax) { tmax = t2; amax = a; smax = s2; }
    if (tmin > tmax) return null;
  }
  const toWorld = (a: number, s: number): V3 => {
    const l = [0, 0, 0]; l[a] = s;
    return [l[0] * cs + l[2] * sn, l[1], -l[0] * sn + l[2] * cs];
  };
  return [tmin, tmax, toWorld(amin, smin), toWorld(amax, smax)];
}
