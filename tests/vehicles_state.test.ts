/** Vehicles: per-instance state (trim, condition, engine systems, trunk, save format). Pure; no WebGL. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState, effectivePhysics, EngineSystems, trunkAdd, trunkRemove, deriveCondition, TRIM, type Condition,
} from '../src/vehicles/state.ts';
import { rng } from '../src/vehicles/gen/rng.ts';
import { MODEL_BY_ID, MODELS } from '../src/vehicles/models.ts';
import { resolve, CLASS_MODELS } from '../src/vehicles/registry.ts';
import { VEHICLE_CLASSES } from '../src/shared/traffic.ts';
import { BIKE_BY_ID } from '../src/vehicles/twowheel/bikes.ts';

const spec = (id: string) => MODEL_BY_ID.get(id)!;
const healthy: Condition = { mileage: 1000, shocks: 0, tyres: 0, alignment: 0, brakes: 0, engine: 0, radiator: 0, battery: 0, tyreType: 'bias' };

test('initial state is deterministic per (model, variant)', () => {
  for (const m of MODELS) for (const v of [0, 7, 123]) assert.deepEqual(initialState(m, v), initialState(m, v));
  assert.notDeepEqual(initialState(spec('bancroft'), 1).plate, initialState(spec('bancroft'), 2).plate);
});

test('every traffic class resolves to a model', () => {
  for (const c of VEHICLE_CLASSES) {
    assert.ok(CLASS_MODELS[c]?.length, c);
    for (let v = 0; v < 20; v++) { const id = resolve(c, v).modelId; assert.ok(MODEL_BY_ID.has(id) || BIKE_BY_ID.has(id), id); }
  }
});

test('police package out-powers and out-grips the average civilian sedan', () => {
  const base = spec('bancroft').physics;
  const civ = effectivePhysics(base, 'standard', healthy, []);
  const cop = effectivePhysics(spec('bancroft_patrol').physics, 'police', healthy, []);
  assert.ok(cop.torque / cop.mass > civ.torque / civ.mass * 1.3);
  assert.ok(cop.muPeak > civ.muPeak && cop.brakeForce > civ.brakeForce);
  // even a luxury civilian car with a four-barrel is behind the police package
  const lux = effectivePhysics(base, 'luxury', healthy, ['fourBarrel']);
  assert.ok(cop.torque / cop.mass > lux.torque / lux.mass);
});

test('wear softens the car: worn shocks, bald tyres, tired engine', () => {
  const base = spec('bancroft').physics;
  const worn = effectivePhysics(base, 'standard', { ...healthy, shocks: 1, tyres: 1, engine: 1 }, []);
  const fresh = effectivePhysics(base, 'standard', healthy, []);
  assert.ok(worn.zeta < fresh.zeta * 0.5 && worn.muPeak < fresh.muPeak && worn.torque < fresh.torque * 0.8);
  const up = effectivePhysics(base, 'standard', healthy, ['radialTyres', 'hdSuspension']);
  assert.ok(up.muPeak > fresh.muPeak && up.zeta > fresh.zeta && up.antiRoll > fresh.antiRoll);
});

test('cabs and trucks run high mileage; police cars are kept up', () => {
  const avg = (id: string, k: keyof Condition) => { let s = 0; for (let i = 0; i < 400; i++) s += deriveCondition(spec(id), rng(i + 1))[k] as number; return s / 400; };
  assert.ok(avg('fareway', 'mileage') > avg('bancroft', 'mileage') * 1.5);
  assert.ok(avg('bancroft_patrol', 'shocks') < avg('bancroft', 'shocks'));
});

function sim(e: EngineSystems, mins: number, f: (t: number) => { rpm: number; load: number; speed: number }, radiatorHealth = 1) {
  let first = -1;
  for (let k = 0; k < mins * 3600; k++) {
    const p = f(k / 60);
    e.update(1 / 60, { ...p, throttle: p.load, brakePower: 0, radiatorHealth, engineHealth: 1, fuelTankHealth: 1 });
    if (e.overheating && first < 0) first = k / 60;
  }
  return first;
}
const stopgo = (t: number) => (t % 30 < 10 ? { rpm: 1800, load: 0.4, speed: 4 } : { rpm: 650, load: 0.05, speed: 0 });

test('a healthy engine never overheats in August stop-and-go; a worn radiator does, a holed one fast', () => {
  const mk = (radiator: number) => { const e = new EngineSystems({ ...healthy, radiator }, { tankL: 85, fuel: 60, cooling: 1, seed: 3 }); e.ambient = 32; e.failureRate = 0; e.running = true; return e; };
  assert.equal(sim(mk(0), 20, stopgo), -1);
  const weak = sim(mk(0.8), 20, stopgo);
  assert.ok(weak > 4 * 60 && weak < 15 * 60, `weak radiator overheated at ${weak}s`);
  const holed = sim(mk(0), 10, () => ({ rpm: 1900, load: 0.35, speed: 13 }), 0.3);
  assert.ok(holed > 0 && holed < 6 * 60, `holed radiator overheated at ${holed}s`);
});

test('failure modes: forced, controllable, and recoverable', () => {
  const e = new EngineSystems({ ...healthy, battery: 0.9 }, { tankL: 85, fuel: 60, cooling: 1, seed: 9 });
  const events: string[] = [];
  e.on((t) => events.push(t));
  e.force('deadBattery');
  for (let i = 0; i < 5; i++) { e.crank(0); for (let k = 0; k < 120; k++) e.update(1 / 60, { rpm: 0, load: 0, speed: 0, throttle: 0, brakePower: 0, radiatorHealth: 1, engineHealth: 1, fuelTankHealth: 1 }); }
  assert.equal(e.running, false);
  assert.ok(events.includes('deadBattery'));
  assert.ok(e.pushStart(4), 'push start works with a dead battery');
  // flooded carb clears when cranked with the throttle floored
  const f = new EngineSystems(healthy, { tankL: 85, fuel: 60, cooling: 1, seed: 5 });
  f.force('flood');
  let started = false;
  for (let i = 0; i < 12 && !started; i++) { f.crank(1); for (let k = 0; k < 120; k++) f.update(1 / 60, { rpm: 0, load: 0, speed: 0, throttle: 1, brakePower: 0, radiatorHealth: 1, engineHealth: 1, fuelTankHealth: 1 }); started = f.running; }
  assert.ok(started, 'flooring it clears a flooded carburettor');
  // failureRate 0: nothing happens on its own
  const q = new EngineSystems({ ...healthy, engine: 1, battery: 1 }, { tankL: 85, fuel: 60, cooling: 1, seed: 1 });
  q.failureRate = 0; q.running = true; const ev: string[] = []; q.on((t) => ev.push(t));
  sim(q, 5, stopgo);
  assert.ok(!ev.includes('misfire') && !ev.includes('stall'), ev.join());
});

test('running out of fuel stalls the engine', () => {
  const e = new EngineSystems(healthy, { tankL: 85, fuel: 0.05, cooling: 1, seed: 2 });
  e.running = true;
  sim(e, 1, () => ({ rpm: 2500, load: 0.6, speed: 15 }));
  assert.equal(e.running, false);
});

test('trunk: capacity, stacking, removal', () => {
  const t = { capacity: 5, items: [] as { id: string; qty: number; meta?: Record<string, unknown> }[] };
  assert.ok(trunkAdd(t, { id: 'cash', qty: 3 }));
  assert.ok(trunkAdd(t, { id: 'cash', qty: 1 }));
  assert.equal(t.items.length, 1);
  assert.ok(!trunkAdd(t, { id: 'shotgun', qty: 2 }));
  assert.ok(trunkAdd(t, { id: 'shotgun', qty: 1, meta: { ammo: 4 } }));
  assert.equal(trunkRemove(t, 'cash', 10), 4);
  assert.deepEqual(t.items, [{ id: 'shotgun', qty: 1, meta: { ammo: 4 } }]);
});

test('engine snapshot round-trips exactly through JSON', () => {
  const e = new EngineSystems({ ...healthy, radiator: 0.7 }, { tankL: 85, fuel: 40, cooling: 1.1, seed: 4 });
  e.running = true; sim(e, 3, stopgo);
  const snap = JSON.parse(JSON.stringify(e.snapshot()));
  const f = new EngineSystems({ ...healthy, radiator: 0.7 }, { tankL: 85, fuel: 1, cooling: 1.1, seed: 4 });
  f.restore(snap);
  assert.deepEqual(f.snapshot(), e.snapshot());
  assert.ok(TRIM.police.power > TRIM.luxury.power);
});
