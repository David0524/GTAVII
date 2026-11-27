import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { Gameplay } from '../index';

// Driving landed on the engine (Driving.ts): the physics car reports impacts without `ped` (sim peds are kinematic),
// and sim's traffic reports `collision {vehicle, actor, speed}` against external actors such as the player on foot.

test('driving: the player\'s car running into a sim pedestrian is a strike, witnessed as a hit and run; one strike per contact', () => {
  const r = rig();
  r.g.addProp('box', 'call_box', 30, 0, -10);
  (r.sim as any).add('ped_witness', 8, -6, { nerve: 0.9, yaw: Math.PI / 2 });
  const victim = (r.sim as any).add('ped_victim', 0, -2.5, { nerve: 0.5 });
  r.g.setContext({ vehicle: { id: 'car1', vclass: 'sedan', colour: '#6b4a2a' }, speed: 11, vehicleYaw: 0 }); // 25 mph, facing -z
  const crimes: string[] = []; r.g.on('crimeWitnessed', (e: any) => crimes.push(JSON.stringify(e)));
  r.g.update(1 / 30);
  const hp1 = r.g.health.get('ped_victim')?.hp ?? 0;
  assert.ok(hp1 < 70, `struck (${hp1})`);
  for (let i = 0; i < 10; i++) r.g.update(1 / 30);
  assert.equal(r.g.health.get('ped_victim')?.hp ?? 0, hp1, 'one strike per contact, not one per frame');
  r.step(3);
  assert.ok(crimes.some((c) => /hit_and_run|homicide/.test(c)), crimes.join('\n'));
  void victim;
});

test('driving: walking pace or a ped beside the car is not a strike; nobody is hit from a parked car', () => {
  const r = rig();
  (r.sim as any).add('ped_beside', 2.2, 0, {});
  (r.sim as any).add('ped_ahead', 0, -2.5, {});
  r.g.setContext({ vehicle: { id: 'car1', vclass: 'sedan', colour: '#6b4a2a' }, speed: 1, vehicleYaw: 0 });
  r.g.update(1 / 30);
  assert.equal(r.g.health.get('ped_ahead')!.hp, 70, 'creeping at 1 m/s');
  r.g.setContext({ speed: 9 });
  r.g.update(1 / 30);
  assert.equal(r.g.health.get('ped_beside')!.hp, 70, 'outside the footprint');
  assert.ok(r.g.health.get('ped_ahead')!.hp < 70);
  assert.equal(Gameplay.RUN_OVER.halfLen, 2.7);
});

test('driving: sim traffic hitting the player on foot hurts; sim\'s {vehicle, actor} shape is understood', () => {
  const r = rig();
  const hp0 = r.g.health.get('player')!.hp;
  r.sim.emit({ type: 'collision', vehicle: 17, actor: 'player', x: 0, z: 0, speed: 8 });
  assert.ok(r.g.health.get('player')!.hp < hp0, 'struck by a cab at 18 mph');
  // in the car (the engine's car actor is also 'player'): kinematic traffic gives no physics impact, so sim's report
  // is the crash; half the closing speed reaches the occupant. Not counted twice after a physics impact.
  const r2 = rig();
  r2.g.setContext({ vehicle: { id: 'car1', vclass: 'sedan', colour: '#333' }, speed: 0 });
  const h2 = r2.g.health.get('player')!.hp;
  r2.sim.emit({ type: 'collision', vehicle: 17, actor: 'player', x: 0, z: 0, speed: 16 });
  const h3 = r2.g.health.get('player')!.hp;
  assert.ok(h3 < h2, `a 36 mph T-bone hurts (${h2} -> ${h3})`);
  r2.step(1);
  (r2.g as any).onVehicleImpact({ vehicleId: 'car1', speed: 16, dv: 8, occupant: 'player', driver: 'player' });
  const h4 = r2.g.health.get('player')!.hp;
  r2.sim.emit({ type: 'collision', vehicle: 18, actor: 'player', x: 0, z: 0, speed: 16 });
  assert.equal(r2.g.health.get('player')!.hp, h4, 'the same contact reported by both is counted once');
});
