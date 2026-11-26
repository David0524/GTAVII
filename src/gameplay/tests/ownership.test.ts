import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { cleaningWindow, TICKET, BOOT_AT } from '../cars/ownership';

const T = 'char.teddy_arce';
test('buying a car: lot stock by week, haggling to the floor, a title (no theft report), selling back loses money', () => {
  const r = rig();
  r.g.inv.addMoney(T, 300000);
  const o = r.g.ownership; o.restockWeek(0);
  assert.equal(o.lot.length, 6); assert.equal(o.classifieds.length, 5);
  const l = o.lot[0];
  assert.equal(o.offer(T, l.id, Math.round(l.ask * 0.5)).result, 'counter');
  const res = o.offer(T, l.id, l.ask);
  assert.equal(res.result, 'sold');
  const car = res.car!;
  assert.equal(r.g.cars.cars.get(car)!.owner, T);
  r.g.enterCar(car, 'keys');
  r.step(4000, 1);
  assert.equal(r.g.police.reports.length, 0, 'your own car is never reported stolen');
  const back = o.sell(T, car);
  assert.ok(back > 0 && back < l.ask, 'selling back loses money');
});

test('classifieds: the condition is hidden until you look; three lowballs and the seller walks', () => {
  const r = rig(); r.g.inv.addMoney(T, 300000);
  const o = r.g.ownership; o.restockWeek(1);
  const c = o.classifieds[0];
  assert.ok(c.known[1] - c.known[0] > 0.5, 'a wide guess');
  o.inspect(c.id);
  assert.ok(c.known[1] - c.known[0] <= 0.11 && c.known[0] <= c.condition && c.condition <= c.known[1]);
  const c2 = o.classifieds[1];
  for (let i = 0; i < 2; i++) assert.equal(o.offer(T, c2.id, 100).result, 'counter');
  assert.equal(o.offer(T, c2.id, 100).result, 'walk');
});

test('alternate-side parking: tickets on cleaning days, the boot at three, the pound a day later; a garage avoids it', () => {
  const r = rig(); r.g.inv.addMoney(T, 300000);
  const o = r.g.ownership; o.restockWeek(0);
  const car = o.offer(T, o.lot[0].id, o.lot[0].ask).car!;
  const car2 = o.offer(T, o.lot[1].id, o.lot[1].ask).car!;
  assert.ok(o.rentGarage(T, car2, 0));
  // day 0 is Friday 21 June 1974: cleaning Mon (day 3) and Thu (day 6)
  assert.ok(cleaningWindow(3, 9 * 60) && !cleaningWindow(4, 9 * 60));
  r.g.setClock({ day: 0, minutes: 22 * 60 }); r.g.setContext({ atHome: true });
  for (let i = 0; i < 20; i++) r.g.sleep(i % 2 ? 22 : 12); // ten nights: Mondays and Thursdays
  const ow = o.owned.get(car)!;
  assert.ok(ow.tickets >= BOOT_AT, `tickets ${ow.tickets}`);
  assert.ok(ow.booted || ow.parked === 'pound');
  assert.equal(o.owned.get(car2)!.tickets, 0, 'the garaged car got nothing');
  r.g.sleep(12); r.g.sleep(22); r.g.sleep(12);
  assert.equal(ow.parked, 'pound');
  const m0 = r.g.inv.ensure(T).money, owed = 4000 + ow.tickets * TICKET;
  assert.ok(o.release(T, car, r.g.clock.clock.day));
  assert.ok(m0 - r.g.inv.ensure(T).money >= owed);
});
