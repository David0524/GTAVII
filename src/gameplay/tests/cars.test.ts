import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { match } from '../police/description';

function lot() {
  const r = rig();
  r.g.cars.add({ id: 'sedan1', vclass: 'sedan', colour: 'green', locked: true, keysIn: false, x: 3, z: 0 });
  return r;
}

test('slim jim is quiet; smashing a window is loud and gets heard', () => {
  const a = lot();
  a.sim.add('w1', 25, 0, { yaw: -Math.PI / 2, nerve: 0.9 }); // facing away, 22 m off
  let res = a.g.enterCar('sedan1', 'slimjim', 0.5)!;
  assert.ok(res.ok && res.needsHotwire, 'in, now the dash');
  assert.ok(!a.has('crimeWitnessed'), 'nobody heard a slim jim');
  res = a.g.hotwire()!;
  assert.ok(res.ok || res.stalled);
  if (res.ok) assert.equal(a.g.pc.vehicle?.id, 'sedan1');
  const b = lot();
  b.sim.add('w1', 25, 0, { yaw: -Math.PI / 2, nerve: 0.9 });
  b.g.enterCar('sedan1', 'smash');
  assert.ok(b.has('crimeWitnessed'), 'breaking glass is heard');
});

test('Teddy (lockwork 70) beats Nick (20) at the slim jim', () => {
  let t = 0, n = 0;
  for (let i = 0; i < 200; i++) {
    const timing = i / 199;
    const a = rig('char.teddy_arce'); a.g.cars.add({ id: 'c', vclass: 'sedan', colour: 'tan', locked: true });
    if (a.g.enterCar('c', 'slimjim', timing)?.ok) t++;
    const b = rig('char.nick_varelas'); b.g.cars.add({ id: 'c', vclass: 'sedan', colour: 'tan', locked: true });
    if (b.g.enterCar('c', 'slimjim', timing)?.ok) n++;
  }
  assert.ok(t > n * 1.3, `Teddy's sweet spot is wider (${t} vs ${n} of 200)`);
});

test('the owner reports it: the plate, colour and class make the car hot; new plates break it', () => {
  const r = lot();
  r.g.enterCar('sedan1', 'slimjim', 0.5); r.g.hotwire(); if (!r.g.pc.vehicle) r.g.hotwire();
  assert.equal(r.g.pc.vehicle?.id, 'sedan1');
  r.until(() => r.g.policeSys.reports.length > 0, 4000, 1);
  const rep = r.g.policeSys.reports[0];
  assert.deepEqual(rep.kinds, ['theft']);
  assert.equal(rep.description.clothes.length, 0, 'nobody saw the driver');
  assert.ok(match(rep.description, r.g.appearance()) > 0.55, 'a cop who sees the car knows it');
  r.g.inv.give('char.teddy_arce', 'item.plates');
  assert.ok(r.g.swapPlates());
  const m = match(rep.description, r.g.appearance());
  assert.ok(m < 0.55, `new plates: ${m.toFixed(2)}`);
  // a respray changes the colour but the report still has the old one, and the class still fits
  assert.ok(r.g.cars.respray('sedan1', 'maroon'));
});

test('carjacking: instant, the driver is a witness who reacts', () => {
  const r = rig();
  r.sim.add('drv', 2, 0, { nerve: 0.5 });
  r.g.cars.add({ id: 'cab', vclass: 'taxi', colour: 'yellow', locked: false, driver: 'drv' });
  const reacts: any[] = []; r.g.on('notice', (e) => { if (e.kind === 'driverReacts') reacts.push(e); });
  const res = r.g.enterCar('cab', 'carjack')!;
  assert.ok(res.ok); assert.deepEqual(res.crimes, ['carjack']);
  assert.equal(reacts.length, 1);
  assert.ok(r.has('crimeWitnessed'));
});
