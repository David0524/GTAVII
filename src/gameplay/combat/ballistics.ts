import { add, dot, rayCapsule, scale, sub, type V3 } from '../core/vec';
import { DEFAULT_THICKNESS, RESIST, type Material, type WorldQuery } from '../core/world';
import type { Region } from '../health/Health';
import { falloffAt, type ShotRay } from './weapons';

/**
 * Batched hitscan resolution. All shots fired in a frame are resolved together against
 *  - actor hitboxes (analytic capsules per region; a bounding-sphere broadphase rejects most actors),
 *  - vehicle tyres (spheres) and bodies (handled by the WorldQuery as hollow thin-metal shells),
 *  - the world (WorldQuery: Rapier in game, boxes in tests) with material penetration.
 * Penetration: each round carries `power`; passing a surface consumes RESIST[material]·thickness and
 * scales damage. Car doors (metal_thin) and plaster walls let handgun rounds through at reduced damage;
 * brick never does. Bodies consume 1 power, so only rifles over-penetrate a person.
 */
export interface HitPart { region: Region; a: V3; b: V3; r: number }
export interface ActorHitbox { id: string; centre: V3; radius: number; parts: HitPart[]; vehicleId?: string }
export interface TyreShape { vehicleId: string; wheel: number; c: V3; r: number }

export interface ActorHit { actorId: string; region: Region; damage: number; dist: number; point: V3; through: number }
export interface SurfaceHit { point: V3; material: Material; id: string; dist: number; penetrated: boolean; normal?: V3 }
export interface ShotResult { shot: ShotRay; shooter: string; actorHits: ActorHit[]; surfaces: SurfaceHit[]; tyres: { vehicleId: string; wheel: number; dist: number }[]; end: V3; nearMiss: { actorId: string; dist: number }[] }

const FLESH_POWER = 1.0;
const NEAR_MISS_R = 1.6;
const MAX_SURFACES = 4;

export function resolveShots(shots: { shooter: string; ray: ShotRay }[], actors: readonly ActorHitbox[], world: WorldQuery, tyres: readonly TyreShape[] = []): ShotResult[] {
  const out: ShotResult[] = [];
  for (const { shooter, ray } of shots) out.push(resolveOne(shooter, ray, actors, world, tyres));
  return out;
}

function resolveOne(shooter: string, ray: ShotRay, actors: readonly ActorHitbox[], world: WorldQuery, tyres: readonly TyreShape[]): ShotResult {
  const o = ray.origin, d = ray.dir;
  // Broadphase: candidate actors whose bounding sphere the ray passes within range.
  const cands: { a: ActorHitbox; t: number }[] = [];
  const near: { actorId: string; dist: number }[] = [];
  for (const a of actors) {
    if (a.id === shooter) continue;
    const oc = sub(a.centre, o); const tc = dot(oc, d);
    if (tc < -a.radius || tc > ray.range + a.radius) continue;
    const perp2 = dot(oc, oc) - tc * tc;
    if (perp2 > (a.radius + NEAR_MISS_R) ** 2) continue;
    if (perp2 <= a.radius * a.radius) cands.push({ a, t: tc });
    else near.push({ actorId: a.id, dist: Math.sqrt(perp2) - a.radius });
  }
  // Narrowphase on capsules: nearest part per actor.
  const bodyHits: { a: ActorHitbox; t: number; region: Region }[] = [];
  for (const { a } of cands) {
    let best = -1, reg: Region = 'torso';
    for (const p of a.parts) {
      const t = rayCapsule(o, d, p.a, p.b, p.r);
      if (t >= 0 && t <= ray.range && (best < 0 || t < best)) { best = t; reg = p.region; }
    }
    if (best >= 0) bodyHits.push({ a, t: best, region: reg });
    else near.push({ actorId: a.id, dist: 0.2 });
  }
  bodyHits.sort((x, y) => x.t - y.t);
  const tyreHits: { vehicleId: string; wheel: number; dist: number }[] = [];

  let power = ray.power, mul = 1, t0 = 0, bi = 0;
  const actorHits: ActorHit[] = [], surfaces: SurfaceHit[] = [];
  let end = add(o, scale(d, ray.range));
  let ignore: string | undefined;
  for (let s = 0; s <= MAX_SURFACES && power > 0; s++) {
    const start = add(o, scale(d, t0));
    const hit = world.ray(start, d, ray.range - t0, ignore);
    const tw = hit ? t0 + hit.t : ray.range;
    // bodies before this surface
    while (bi < bodyHits.length && bodyHits[bi].t <= tw && power > 0) {
      const b = bodyHits[bi++];
      if (b.t < t0) continue;
      const dmg = ray.damage * falloffAt(ray.falloff, b.t) * mul;
      actorHits.push({ actorId: b.a.id, region: b.region, damage: dmg, dist: b.t, point: add(o, scale(d, b.t)), through: 1 - mul });
      power -= FLESH_POWER; mul *= 0.6;
    }
    // tyres before this surface (a wheel sits outside the body shell)
    for (const ty of tyres) {
      if (tyreHits.some((h) => h.vehicleId === ty.vehicleId && h.wheel === ty.wheel)) continue;
      const oc = sub(ty.c, o), tc = dot(oc, d);
      if (tc < t0 || tc > tw) continue;
      if (dot(oc, oc) - tc * tc <= ty.r * ty.r) { tyreHits.push({ vehicleId: ty.vehicleId, wheel: ty.wheel, dist: tc }); power -= 0.5; }
    }
    if (power <= 0) { end = add(o, scale(d, actorHits.length ? actorHits[actorHits.length - 1].dist : tw)); break; }
    if (!hit) { end = add(o, scale(d, ray.range)); break; }
    const p = add(o, scale(d, tw));
    const thick = hit.thickness ?? DEFAULT_THICKNESS[hit.material];
    const cost = RESIST[hit.material] * thick;
    const pen = cost < power;
    surfaces.push({ point: p, material: hit.material, id: hit.id, dist: tw, penetrated: pen, normal: hit.normal });
    if (!pen) { end = p; break; }
    mul *= Math.max(0.2, 1 - (cost / power) * 0.8);
    power -= cost;
    t0 = tw + thick + 0.01;
    ignore = undefined;
    end = add(o, scale(d, ray.range));
  }
  return { shot: ray, shooter, actorHits, surfaces, tyres: tyreHits, end, nearMiss: near };
}

/**
 * Standard humanoid hitbox from feet position, heading and stance. Crouched (in low cover) lowers
 * everything; `exposed` 0..1 is for blind-fire/cover where the body stays behind the cover top.
 */
export function humanoidHitbox(id: string, feet: V3, yaw: number, stance: 'stand' | 'crouch' | 'down' = 'stand', scaleH = 1): ActorHitbox {
  const [x, y, z] = feet;
  const h = (stance === 'crouch' ? 0.66 : 1) * scaleH;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw); // right vector (yaw 0 faces -Z)
  if (stance === 'down') {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const P = (f: number, s: number, up: number): V3 => [x + fx * f + rx * s, y + up, z + fz * f + rz * s];
    return { id, centre: [x, y + 0.25, z], radius: 1.1, parts: [
      { region: 'head', a: P(0.75, 0, 0.18), b: P(0.85, 0, 0.18), r: 0.12 },
      { region: 'torso', a: P(0.1, 0, 0.18), b: P(0.6, 0, 0.18), r: 0.18 },
      { region: 'leg_l', a: P(-0.8, -0.12, 0.12), b: P(0, -0.1, 0.12), r: 0.09 },
      { region: 'leg_r', a: P(-0.8, 0.12, 0.12), b: P(0, 0.1, 0.12), r: 0.09 },
      { region: 'arm_l', a: P(0.2, -0.3, 0.12), b: P(0.6, -0.3, 0.12), r: 0.06 },
      { region: 'arm_r', a: P(0.2, 0.3, 0.12), b: P(0.6, 0.3, 0.12), r: 0.06 },
    ] };
  }
  const S = (side: number, up: number): V3 => [x + rx * side, y + up * h, z + rz * side];
  return {
    id, centre: [x, y + 0.95 * h, z], radius: 1.0 * h + 0.1,
    parts: [
      { region: 'head', a: S(0, 1.6), b: S(0, 1.72), r: 0.12 },
      { region: 'torso', a: S(0, 1.0), b: S(0, 1.42), r: 0.19 },
      { region: 'arm_l', a: S(-0.27, 1.05), b: S(-0.27, 1.42), r: 0.065 },
      { region: 'arm_r', a: S(0.27, 1.05), b: S(0.27, 1.42), r: 0.065 },
      { region: 'leg_l', a: S(-0.1, 0.08), b: S(-0.1, 0.9), r: 0.085 },
      { region: 'leg_r', a: S(0.1, 0.08), b: S(0.1, 0.9), r: 0.085 },
    ],
  };
}
