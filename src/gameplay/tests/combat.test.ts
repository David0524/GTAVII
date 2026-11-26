import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../core/rng';
import { BoxWorld } from '../core/boxworld';
import { WEAPONS, LEADS } from '../data/defaults';
import { Gun, NEUTRAL_MODS, falloffAt } from '../combat/weapons';
import { resolveShots, humanoidHitbox } from '../combat/ballistics';
import { MeleeSystem } from '../combat/melee';
import type { V3 } from '../core/vec';

const W = (id: string) => WEAPONS.find((w) => w.id === id)!;
const fwd: V3 = [0, 0, -1];

test('gun: fire rate, magazine, full reload consumes reserve', () => {
  const g = new Gun(W('weapon.service'));
  const rng = new Rng(1);
  let shots = 0;
  for (let t = 0; t < 3; t += 1 / 60) { shots += g.fire({ origin: [0, 1.5, 0], dir: fwd, aiming: true, moveFrac: 0, mods: NEUTRAL_MODS, rng }).length; g.update(1 / 60, () => 0); }
  assert.equal(shots, 6, 'six-shot cylinder');
  assert.ok(g.empty);
  let reserve = 10;
  assert.ok(g.startReload(reserve));
  for (let t = 0; t < 3; t += 1 / 60) g.update(1 / 60, (n) => { const k = Math.min(n, reserve); reserve -= k; return k; });
  assert.equal(g.loaded, 6); assert.equal(reserve, 4);
});

test('per-round loading (pump) is interruptible by firing', () => {
  const g = new Gun(W('weapon.pump'), 0);
  let reserve = 10;
  const take = (n: number) => { const k = Math.min(n, reserve); reserve -= k; return k; };
  g.startReload(reserve);
  for (let t = 0; t < 1.2; t += 1 / 60) g.update(1 / 60, take);
  assert.equal(g.loaded, 2);
  const r = g.fire({ origin: [0, 1.5, 0], dir: fwd, aiming: false, moveFrac: 0, mods: NEUTRAL_MODS, rng: new Rng(2) });
  assert.equal(r.length, 8, 'eight pellets'); assert.equal(g.reloading, null); assert.equal(g.loaded, 1);
});

test('recoil climbs and recovers; spread: Teddy handles a revolver better than Nick', () => {
  const g = new Gun(W('weapon.service'));
  g.fire({ origin: [0, 0, 0], dir: fwd, aiming: true, moveFrac: 0, mods: NEUTRAL_MODS, rng: new Rng(3) });
  const r0 = g.recoil; assert.ok(r0 > 3);
  for (let i = 0; i < 60; i++) g.update(1 / 60, () => 0);
  assert.ok(g.recoil < r0 * 0.1);
  const teddy = LEADS[0], nick = LEADS[2];
  const sT = g.spread(true, 0, { ...NEUTRAL_MODS, aimMul: teddy.aim.revolver! });
  const sN = g.spread(true, 0, { ...NEUTRAL_MODS, aimMul: nick.aim.revolver! });
  assert.ok(sN > sT * 2, `${sN} vs ${sT}`);
  assert.ok(g.spread(false, 1, NEUTRAL_MODS) > g.spread(true, 0, NEUTRAL_MODS), 'hip + moving is worse');
});

test('damage falloff', () => {
  assert.equal(falloffAt([10, 30, 0.5], 5), 1);
  assert.equal(falloffAt([10, 30, 0.5], 20), 0.75);
  assert.equal(falloffAt([10, 30, 0.5], 99), 0.5);
});

test('ballistics: regions, car-door penetration, brick and engine block stop rounds', () => {
  const world = new BoxWorld();
  // a car broadside between shooter and target: hollow thin body
  world.add({ id: 'car', c: [0, 0.9, -5], h: [2.7, 0.55, 1.0], yaw: 0, material: 'metal_thin', hollow: true });
  const target = humanoidHitbox('t', [0, 0, -8], 0);
  const shot = (origin: V3, dir: V3, weapon = 'weapon.service') => { const w = W(weapon); return resolveShots([{ shooter: 's', ray: { origin, dir, range: w.range, damage: w.damage, falloff: w.falloff!, power: w.penetration!, weapon: w.id, pellet: 0 } }], [target], world)[0]; };
  // chest-high through both doors of the car
  const r = shot([0, 1.25, 0], [0, 0, -1]);
  assert.equal(r.surfaces.length, 2); assert.ok(r.surfaces.every((s) => s.penetrated));
  assert.equal(r.actorHits.length, 1); assert.equal(r.actorHits[0].region, 'torso');
  assert.ok(r.actorHits[0].damage < W('weapon.service').damage * 0.8, 'loses energy through two door skins');
  // a shotgun pellet does not get through two doors
  const s2 = shot([0, 1.25, 0], [0, 0, -1], 'weapon.pump');
  assert.equal(s2.actorHits.length, 0);
  // a brick wall stops everything
  world.add({ id: 'wall', c: [0, 1.5, -6.5], h: [3, 1.5, 0.15], yaw: 0, material: 'brick' });
  const r3 = shot([0, 1.25, 0], [0, 0, -1], 'weapon.rifle');
  assert.equal(r3.actorHits.length, 0); assert.ok(!r3.surfaces.at(-1)!.penetrated);
  // head shot over the car
  world.remove('wall');
  const head = shot([0, 1.66, 0], [0, 0, -1]);
  assert.equal(head.actorHits[0]?.region, 'head');
});

test('ballistics: rifle over-penetrates one body; near misses are reported; tyres can be hit', () => {
  const world = new BoxWorld();
  const a = humanoidHitbox('a', [0, 0, -5], 0), b = humanoidHitbox('b', [0, 0, -7], 0), c = humanoidHitbox('c', [1.6, 0, -6], 0);
  const w = W('weapon.rifle');
  const [r] = resolveShots([{ shooter: 's', ray: { origin: [0, 1.25, 0], dir: [0, 0, -1], range: w.range, damage: w.damage, falloff: w.falloff!, power: w.penetration!, weapon: w.id, pellet: 0 } }], [a, b, c], world, [{ vehicleId: 'v', wheel: 0, c: [0, 0.36, -20], r: 0.36 }]);
  // 1.4 power: the first body costs 1.0, so the round exits and reaches the second at reduced damage; a handgun would stop in the first
  assert.deepEqual(r.actorHits.map((h) => h.actorId), ['a', 'b']);
  assert.ok(r.actorHits[1].damage < r.actorHits[0].damage * 0.7);
  assert.ok(r.nearMiss.some((n) => n.actorId === 'c'));
  const p = W('weapon.pistol');
  const [t] = resolveShots([{ shooter: 's', ray: { origin: [0, 0.4, 0], dir: [0, 0, -1], range: 50, damage: p.damage, falloff: p.falloff!, power: p.penetration!, weapon: p.id, pellet: 0 } }], [], world, [{ vehicleId: 'v', wheel: 2, c: [0, 0.36, -20], r: 0.36 }]);
  assert.deepEqual(t.tyres.map((x) => x.wheel), [2]);
});

test('ballistics: a crouched target behind low cover is protected, a standing one is not', () => {
  const world = new BoxWorld([{ id: 'stoop', c: [0, 0.5, -4], h: [1.5, 0.5, 0.4], yaw: 0, material: 'concrete' }]);
  const w = W('weapon.pistol');
  const ray = (y: number) => ({ origin: [0, y, 0] as V3, dir: [0, 0, -1] as V3, range: 50, damage: w.damage, falloff: w.falloff!, power: w.penetration!, weapon: w.id, pellet: 0 });
  const crouched = humanoidHitbox('t', [0, 0, -5], 0, 'crouch');
  const standing = humanoidHitbox('t', [0, 0, -5], 0, 'stand');
  const hits = (hb: typeof crouched) => [0.6, 0.9, 1.1, 1.3, 1.5].map((y) => resolveShots([{ shooter: 's', ray: ray(y) }], [hb], world)[0].actorHits.length).reduce((a, b) => a + b, 0);
  assert.ok(hits(crouched) <= 1, `crouched hits ${hits(crouched)}`);
  assert.ok(hits(standing) >= 3);
});

const prof = (npc = false) => ({ damage: 1, speed: 1, parryWindow: 0.16, dodgeIframes: 0.22, npc });
function duel(world?: BoxWorld) {
  const m = new MeleeSystem(new Rng(7), world);
  const a = m.add('a', { pos: [0, 0, 0], yaw: 0, weapon: W('weapon.fists'), profile: prof(), team: 'p' });
  const b = m.add('b', { pos: [0, 0, -1], yaw: Math.PI, weapon: W('weapon.fists'), profile: prof(true), team: 'e' });
  const ev: string[] = []; const hits: any[] = [];
  for (const k of ['hit', 'parried', 'guardBroken', 'stagger', 'knockdown', 'whiff', 'grab', 'slam', 'dodge'] as const) m.on(k, (e: any) => { ev.push(k); if (k === 'hit') hits.push(e); });
  const run = (s: number) => { for (let t = 0; t < s; t += 1 / 60) m.update(1 / 60); };
  return { m, a, b, ev, hits, run };
}

test('melee: light attack lands after its windup; out of reach whiffs', () => {
  const d = duel();
  assert.ok(d.m.attack('a', 'light'));
  d.run(0.05); assert.equal(d.hits.length, 0, 'not during windup');
  d.run(0.3); assert.equal(d.hits.length, 1); assert.equal(d.hits[0].target, 'b');
  d.b.pos = [0, 0, -3]; d.run(1);
  d.m.attack('a', 'light'); d.run(0.5); assert.ok(d.ev.includes('whiff'));
});

test('melee: parry inside the window staggers the attacker and arms a x2 counter', () => {
  const d = duel();
  d.m.attack('b', 'light'); // NPC windup 0.13*1.35 ≈ 0.176 s
  d.run(0.1); d.m.block('a', true); d.run(0.2);
  assert.ok(d.ev.includes('parried')); assert.equal(d.b.state, 'stagger'); assert.equal(d.hits.length, 0);
  d.m.block('a', false); d.run(0.05);
  d.m.attack('a', 'light'); d.run(0.3);
  assert.ok(d.hits[0].counter); assert.equal(d.hits[0].damage, 18);
});

test('melee: block soaks lights, heavy breaks the guard; dodge i-frames avoid a hit', () => {
  const d = duel();
  d.m.block('a', true); d.run(0.5); // held long before: no parry
  d.m.attack('b', 'light'); d.run(0.4);
  assert.ok(d.hits[0].blocked && d.hits[0].damage < 3);
  d.run(1); d.m.attack('b', 'heavy'); d.run(0.8);
  assert.ok(d.ev.includes('guardBroken'));
  const e = duel();
  e.m.attack('b', 'light'); e.run(0.12); assert.ok(e.m.dodge('a', [1, 0])); e.run(0.3);
  assert.equal(e.hits.length, 0, 'dodged');
});

test('melee: grapple then shove into a wall slams', () => {
  const world = new BoxWorld([{ id: 'wall', c: [0, 1.5, -2.2], h: [3, 1.5, 0.2], yaw: 0, material: 'brick' }]);
  const d = duel(world);
  assert.ok(d.m.attack('a', 'grapple')); d.run(0.35);
  assert.ok(d.ev.includes('grab')); assert.equal(d.a.state, 'grappling');
  assert.ok(d.m.grappleAction('a', 'shove', [0, -1]));
  assert.ok(d.ev.includes('slam') && d.ev.includes('knockdown'));
});
