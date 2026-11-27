import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { cabFare } from '../meta/travel';

test('the 1973 cab meter: 60¢ the first fifth of a mile, a dime each fifth after', () => {
  assert.equal(cabFare(100), 60);
  assert.equal(cabFare(322), 70);
  assert.equal(cabFare(1609), 100, 'a mile: 60¢ + 4 × 10¢');
});

test('cab: pays meter + tip and moves the clock; subway: a token, or jump it (a crime), and breaks contact', () => {
  const r = rig();
  r.g.setClock({ minutes: 12 * 60 });
  const m0 = r.g.inv.ensure('char.teddy_arce').money;
  const ride = r.g.cabTo(-800, -1200)!;
  assert.ok(ride.ok);
  assert.ok(r.g.inv.ensure('char.teddy_arce').money === m0 - ride.fare! - ride.tip!);
  assert.ok(r.g.clock.clock.minutes > 12 * 60 + 5, 'the ride took game time');
  assert.ok(r.g.enterSubway());
  assert.equal(r.g.inv.ensure('char.teddy_arce').money, m0 - ride.fare! - ride.tip! - 35);
  r.sim.add('clerk', 3, 0, { yaw: Math.atan2(3, 0) });
  const q = rig(); q.sim.add('clerk', 3, 0, { yaw: Math.atan2(3, 0), nerve: 0.9 });
  q.g.enterSubway(true);
  assert.ok(q.has('crimeWitnessed'), 'the token clerk saw him jump it');
  const cop = q.g.registerPolice('foot', 'pct.gramercy', 0, -10, { corrupt: 0 }); cop.state = 'pursuit';
  q.g.rideSubwayTo(-600, -900);
  assert.ok(cop.state !== 'pursuit', `he came up somewhere else (${cop.state})`);
});
