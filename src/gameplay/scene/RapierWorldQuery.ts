import RAPIER from '../../shared/rapier';
import type { Physics } from '../../physics/Physics';
import type { RayHit, WorldQuery } from '../core/world';
import type { V3 } from '../core/vec';
import { heightAt } from '../../shared/terrain';

/**
 * WorldQuery over the engine's Rapier world (static city colliders). Colliders gameplay owns
 * (cover boxes, props, cars — handled analytically by BoxWorld with materials) and the player capsule
 * are excluded so they are never double-counted. City geometry has no material data yet: walls read
 * as brick and ground as asphalt (request: per-chunk material tags, ENGINE_REQUESTS "From gameplay: 5").
 */
export class RapierWorldQuery implements WorldQuery {
  readonly excluded = new Set<number>();
  rays = 0;
  constructor(private physics: Physics) {}
  ray(o: V3, d: V3, max: number): RayHit | null {
    this.rays++;
    const ex = this.excluded;
    const hit = this.physics.world.castRayAndGetNormal(new RAPIER.Ray({ x: o[0], y: o[1], z: o[2] }, { x: d[0], y: d[1], z: d[2] }), max, true, undefined, undefined, undefined, undefined, (c) => !ex.has(c.handle));
    if (!hit) return null;
    const n = hit.normal;
    const ground = n.y > 0.7;
    return { t: hit.timeOfImpact, material: ground ? 'asphalt' : 'brick', id: 'city', normal: [n.x, n.y, n.z], thickness: ground ? 1 : 0.3 };
  }
  ground(x: number, z: number) { return heightAt(x, z); }
}
