import RAPIER from '../shared/rapier';
import { loadReport } from '../engine/debug/LoadReport';
import type * as THREE from 'three/webgpu';
import { GROUPS } from '../shared/physicsGroups';

/**
 * Physics world (Rapier, WASM). Fixed 60 Hz step with an accumulator.
 *
 * City collision = static triangle meshes built from each chunk's LOD0 render geometry (buildings +
 * terrain-following ground with curbs), so collision always matches what is drawn. Colliders only exist
 * for chunks within `radius` of the focus (player); far chunks cost nothing.
 */
export type { RAPIER };

export interface ChunkGeometry { key: string; ox: number; oz: number; parts: THREE.BufferGeometry[] }

export class Physics {
  static async create(): Promise<Physics> { await RAPIER.init(); return new Physics(); }

  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly step = 1 / 60;
  private acc = 0;
  private chunks = new Map<string, { geo: ChunkGeometry; colliders: RAPIER.Collider[] | null }>();
  radius = 320;
  stats = { colliders: 0, chunksWithColliders: 0, buildMs: 0 };

  private constructor() { this.world.timestep = this.step; }

  /** Advance physics; `fixed` runs once per fixed step (before world.step) for kinematic controllers. */
  update(dt: number, fixed: (h: number) => void) {
    this.acc = Math.min(this.acc + dt, 0.25);
    while (this.acc >= this.step) { fixed(this.step); this.world.step(); this.acc -= this.step; }
  }
  /** 0..1 interpolation factor between the last two fixed steps (for smooth rendering). */
  get alpha() { return this.acc / this.step; }

  addChunk(g: ChunkGeometry) { this.chunks.set(g.key, { geo: g, colliders: null }); }
  removeChunk(key: string) { const c = this.chunks.get(key); if (c?.colliders) this.drop(c.colliders); this.chunks.delete(key); }

  /** Create/destroy chunk colliders around the focus. Call a few times per second. */
  sync(x: number, z: number, chunkSize: number) {
    let built = 0; const t0 = performance.now();
    // nearest first: the chunk under the player gets its colliders before anything else in range
    const list = [...this.chunks.values()].map((c) => {
      const dx = Math.max(Math.abs(x - c.geo.ox) - chunkSize / 2, 0), dz = Math.max(Math.abs(z - c.geo.oz) - chunkSize / 2, 0);
      return { c, d: Math.hypot(dx, dz) };
    }).sort((a, b) => a.d - b.d);
    for (const { c, d } of list) {
      if (d <= this.radius && !c.colliders && built < 2) { c.colliders = this.build(c.geo); built++; }
      else if (d > this.radius + 120 && c.colliders) { this.drop(c.colliders); c.colliders = null; }
    }
    if (built) { this.stats.buildMs = performance.now() - t0; loadReport.colliders(this.stats.buildMs); }
    let n = 0, k = 0; for (const c of this.chunks.values()) if (c.colliders) { n += c.colliders.length; k++; }
    this.stats.colliders = n; this.stats.chunksWithColliders = k;
  }

  /** True when every chunk within `r` of (x,z) has colliders (e.g. before dropping the player in). */
  readyAround(x: number, z: number, chunkSize: number, r = 60) {
    for (const c of this.chunks.values()) {
      const dx = Math.max(Math.abs(x - c.geo.ox) - chunkSize / 2, 0), dz = Math.max(Math.abs(z - c.geo.oz) - chunkSize / 2, 0);
      if (Math.hypot(dx, dz) <= r && !c.colliders) return false;
    }
    return true;
  }

  private build(g: ChunkGeometry): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    for (const geo of g.parts) {
      const pos = geo.attributes.position.array as Float32Array;
      const idx = geo.index?.array as Uint32Array | undefined;
      if (!idx || idx.length < 3) continue;
      const v = new Float32Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) { v[i] = pos[i] + g.ox; v[i + 1] = pos[i + 1]; v[i + 2] = pos[i + 2] + g.oz; }
      const desc = RAPIER.ColliderDesc.trimesh(v, new Uint32Array(idx)).setFriction(0.8).setCollisionGroups(GROUPS.world);
      out.push(this.world.createCollider(desc));
    }
    return out;
  }
  private drop(cs: RAPIER.Collider[]) { for (const c of cs) this.world.removeCollider(c, false); }

  /** Ray cast against the static city; returns distance or null. */
  ray(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, exclude?: RAPIER.Collider): number | null {
    const hit = this.world.castRay(new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), max, true, undefined, undefined, exclude);
    return hit ? hit.timeOfImpact : null;
  }
}
