import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { discoveryDelay, DISCOVERY } from '../police/bodies';

const kill = (r: ReturnType<typeof rig>, id: string, x: number, z: number) => {
  r.g.spawnCombatant({ id, faction: 'gang', squad: 's', pos: [x, 0, z], weapon: null, hp: 1 });
  (r.g as any).applyDamage(id, { amount: 500, type: 'melee', source: 'player' });
};

test('bodies: found sooner on a busy street than in an empty alley, later at night, later indoors', () => {
  assert.equal(discoveryDelay(1, 1), DISCOVERY.busy);
  assert.equal(discoveryDelay(0, 1), DISCOVERY.empty);
  assert.equal(discoveryDelay(0.5, 0.2), (DISCOVERY.busy + 0.5 * (DISCOVERY.empty - DISCOVERY.busy)) * DISCOVERY.nightMul);
  assert.ok(discoveryDelay(0.5, 1, true) > discoveryDelay(0.5, 1));
});

test('bodies: an unwitnessed killing is called in when a passer-by finds the body: a homicide with no description', () => {
  const r = rig();
  kill(r, 'v1', 20, -20);
  assert.ok(r.g.bodies.list.get('v1'), 'a body record');
  const found: any[] = []; r.g.on('police', (e: any) => { if (e.kind === 'bodyFound') found.push(e); });
  r.step(DISCOVERY.empty + 30, 1);
  assert.equal(found.length, 1);
  const rep = r.g.policeSys.reports.find((x) => x.kinds.includes('homicide'));
  assert.ok(rep && rep.description.clothes.length === 0 && !rep.description.vehicle, 'no description: nobody saw who');
});

test('bodies: carry one (hands full: no gun), put it in a trunk, and it is never found by passers-by; the pound finds it with the car', () => {
  const r = rig();
  kill(r, 'v2', 1, 0);
  r.pos[0] = 1.5;
  assert.equal(r.g.contextAction()?.kind, 'carryBody');
  r.g.doContextAction();
  assert.equal(r.g.pc.carrying, 'body');
  r.g.equip('weapon.service'); r.g.setAiming(true); assert.equal(r.g.pc.aiming, false, 'no gun with a body in your arms');
  assert.equal(r.g.canMove('climb').ok, false);
  // carrying in public is seen
  (r.sim as any).add('ped_onlooker', 8, 2, { yaw: Math.PI / 2, nerve: 0.9 });
  const crimes: string[] = []; r.g.on('crimeWitnessed', (e: any) => crimes.push(JSON.stringify(e)));
  r.step(5, 0.5);
  assert.ok(crimes.some((c) => c.includes('body_seen')), `an onlooker saw a man carrying a body: ${crimes[0]}`);
  // the car: own it so the pound can tow it later
  r.g.inv.addMoney('char.teddy_arce', 300000); r.g.ownership.restockWeek(0);
  const car = r.g.ownership.offer('char.teddy_arce', r.g.ownership.lot[0].id, r.g.ownership.lot[0].ask).car!;
  const c = r.g.cars.cars.get(car)!; c.x = r.pos[0] + 2; c.z = r.pos[2];
  assert.equal(r.g.contextAction()?.kind, 'stowBody');
  r.g.doContextAction();
  assert.equal(r.g.pc.carrying, 'none'); assert.equal(r.g.bodies.list.get('v2')!.place, 'trunk');
  const found: any[] = []; r.g.on('police', (e: any) => { if (e.kind === 'bodyFound') found.push(e); });
  r.step(DISCOVERY.empty * 2, 2);
  assert.equal(found.length, 0, 'a trunk body is not found by passers-by');
  r.g.ownership.tow(car, 3);
  assert.equal(found.length, 1); assert.equal(found[0].car, car);
  const rep = r.g.policeSys.reports.find((x) => x.kinds.includes('homicide') && x.description.vehicle);
  assert.ok(rep && rep.description.vehicle!.plate!.v === r.g.cars.plate(car), 'the report has the car and its plate');
  assert.equal(rep!.perp, 'player', 'it is the registered owner the police want');
});

test('bodies: put down somewhere quiet buys time; a hiding spot keeps it from passers-by; saved and restored', () => {
  const r = rig();
  kill(r, 'v3', 1, 0);
  r.pos[0] = 1.5; r.g.pickUpBody();
  r.g.setContext({ indoors: true, hiding: true });
  assert.ok(r.g.dropBody());
  assert.equal(r.g.bodies.list.get('v3')!.place, 'hidden');
  const save = JSON.parse(JSON.stringify(r.g.serialize()));
  const r2 = rig(); r2.g.deserialize(save);
  assert.equal(r2.g.bodies.list.get('v3')!.place, 'hidden');
  assert.equal(r2.g.bodies.list.get('v3')!.discoverAt, Infinity);
});
