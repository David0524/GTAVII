import type { V3 } from '../core/vec';

/**
 * Contextual cover. Cover objects (cars, stoops, newsstands, mailboxes, planters, curbs) generate cover
 * points along their faces, each with an outward normal (the side you crouch on) and an edge flag
 * for peeking round high cover. A point protects against a threat when the threat is on the far side
 * (dot(normal, toThreat) < -0.35). Cars are layered: a thin-metal body you can be shot through and a
 * solid engine block — the classic "get behind the engine" choice comes out of the ballistics, not a flag.
 * Curbs (0.15 m) only protect someone who is down.
 */
export type CoverHeight = 'curb' | 'low' | 'high';
export interface CoverObject { id: string; c: V3; half: [number, number, number]; yaw: number; height: CoverHeight; vehicle?: boolean }
export interface CoverPoint { id: string; obj: string; x: number; y: number; z: number; nx: number; nz: number; height: CoverHeight; edge: -1 | 0 | 1; occupant: string | null }

const SPACING = 0.9, OFFSET = 0.5;
export const PROTECT_DOT = -0.35;

export class CoverSystem {
  readonly objects = new Map<string, CoverObject>();
  points: CoverPoint[] = [];
  private dirty = true;

  add(o: CoverObject) { this.objects.set(o.id, o); this.dirty = true; }
  remove(id: string) { this.objects.delete(id); this.dirty = true; }
  move(id: string, c: V3, yaw: number) { const o = this.objects.get(id); if (o) { o.c = c; o.yaw = yaw; this.dirty = true; } }

  rebuild() {
    if (!this.dirty) return;
    const occ = new Map(this.points.filter((p) => p.occupant).map((p) => [p.id, p.occupant]));
    this.points = [];
    for (const o of this.objects.values()) {
      const cs = Math.cos(o.yaw), sn = Math.sin(o.yaw);
      // local (lx, lz) -> world, matching BoxWorld's convention
      const W = (lx: number, lz: number): [number, number] => [o.c[0] + lx * cs + lz * sn, o.c[2] - lx * sn + lz * cs];
      const faces: { axis: 0 | 2; s: 1 | -1 }[] = [{ axis: 0, s: 1 }, { axis: 0, s: -1 }, { axis: 2, s: 1 }, { axis: 2, s: -1 }];
      let k = 0;
      for (const f of faces) {
        const along = f.axis === 0 ? o.half[2] : o.half[0];
        const n = Math.max(1, Math.floor((along * 2) / SPACING));
        for (let i = 0; i < n; i++) {
          const u = n === 1 ? 0 : -along + (i + 0.5) * ((along * 2) / n);
          const lx = f.axis === 0 ? f.s * (o.half[0] + OFFSET) : u;
          const lz = f.axis === 0 ? u : f.s * (o.half[2] + OFFSET);
          const [x, z] = W(lx, lz);
          const nl: [number, number] = f.axis === 0 ? [f.s, 0] : [0, f.s];
          const nx = nl[0] * cs + nl[1] * sn, nz = -nl[0] * sn + nl[1] * cs;
          const edge: -1 | 0 | 1 = n > 1 && i === 0 ? -1 : n > 1 && i === n - 1 ? 1 : 0;
          const id = `${o.id}#${k++}`;
          this.points.push({ id, obj: o.id, x, y: o.c[1] - o.half[1], z, nx, nz, height: o.height, edge, occupant: occ.get(id) ?? null });
        }
      }
    }
    this.dirty = false;
  }

  /** 0..1 how well point p protects from a threat at (tx,tz). */
  protection(p: CoverPoint, tx: number, tz: number) {
    const dx = tx - p.x, dz = tz - p.z, L = Math.hypot(dx, dz) || 1;
    const d = (p.nx * dx + p.nz * dz) / L; // -1 = threat straight across the object
    return d < PROTECT_DOT ? Math.min(1, (-d - 0.2) / 0.6) * (p.height === 'high' ? 1 : p.height === 'low' ? 0.85 : 0.3) : 0;
  }

  /** Best free cover for an agent at (x,z) against threat (tx,tz). `prefer` biases: 'near' | 'toward' (advance) | 'away' (retreat) | flank angle. */
  best(x: number, z: number, tx: number, tz: number, o: { maxDist?: number; who?: string; prefer?: 'near' | 'toward' | 'away'; flankFrom?: [number, number]; minThreatDist?: number } = {}) {
    this.rebuild();
    const maxD = o.maxDist ?? 14;
    let best: CoverPoint | null = null, bs = -Infinity;
    const td0 = Math.hypot(tx - x, tz - z);
    for (const p of this.points) {
      if (p.occupant && p.occupant !== o.who) continue;
      if (p.height === 'curb') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > maxD) continue;
      const prot = this.protection(p, tx, tz);
      if (prot <= 0) continue;
      const td = Math.hypot(tx - p.x, tz - p.z);
      if (td < (o.minThreatDist ?? 5)) continue;
      let s = prot * 3 - d * 0.18;
      if (o.prefer === 'toward') s += (td0 - td) * 0.25;
      if (o.prefer === 'away') s += (td - td0) * 0.25;
      if (o.flankFrom) {
        // angle around the target between the squad's current line and this point
        const a0 = Math.atan2(o.flankFrom[1] - tz, o.flankFrom[0] - tx), a1 = Math.atan2(p.z - tz, p.x - tx);
        const da = Math.abs(Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)));
        s += da > 0.9 ? 2.5 + da : -2;
      }
      if (p.edge !== 0) s += 0.3; // edges let you peek
      if (s > bs) { bs = s; best = p; }
    }
    return best;
  }

  /** Player: nearest point within reach in roughly the direction of movement (or any if dir is 0). */
  near(x: number, z: number, dir: [number, number] | null, reach = 2.6): CoverPoint | null {
    this.rebuild();
    let best: CoverPoint | null = null, bs = Infinity;
    for (const p of this.points) {
      if (p.occupant || p.height === 'curb') continue;
      const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz);
      if (d > reach) continue;
      let s = d;
      if (dir && (dir[0] || dir[1])) { const c = (dx * dir[0] + dz * dir[1]) / (d || 1); s -= c * 1.2; if (c < -0.3) continue; }
      // facing the cover means the normal points back at us
      if (s < bs) { bs = s; best = p; }
    }
    return best;
  }
  claim(p: CoverPoint, who: string) { this.release(who); p.occupant = who; }
  release(who: string) { for (const p of this.points) if (p.occupant === who) p.occupant = null; }
  pointOf(who: string) { return this.points.find((p) => p.occupant === who) ?? null; }
}
