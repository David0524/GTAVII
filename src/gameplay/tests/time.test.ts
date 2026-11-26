import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

test('sleep: blocked in a mission, a pursuit or away from home; at home it restores, autosaves and advances the world', () => {
  const r = rig();
  r.g.setClock({ day: 3, minutes: 23 * 60, heatwave: true });
  assert.equal(r.g.sleep(7).reason, 'notHome');
  r.g.setContext({ atHome: true });
  r.g.clock.inMission = true; assert.equal(r.g.sleep(7).reason, 'mission'); r.g.clock.inMission = false;
  // a report cools while you sleep, shops restock, the penalty clears
  r.g.policeSys.file({ witness: 'x', perp: 'player', kinds: ['shots_fired'], desc: { clothes: [] }, lastKnown: [500, 500], crimeAt: [500, 500], via: 'callbox', time: 0 });
  r.g.shops.buy('char.teddy_arce', 'shop.test_newsstand', 'item.street_map');
  r.g.healthSys.penalize('player', 0.2, 300);
  const adv: any[] = []; r.g.clock.on('timeAdvanced', (e) => adv.push(e));
  const saves: any[] = []; r.g.clock.on('autosave', (e) => saves.push(e));
  const res = r.g.sleep(7, { hasAC: false });
  assert.ok(res.ok); assert.equal(res.hours, 8); assert.equal(res.quality, 0.6, 'heatwave without AC: a poor night');
  assert.equal(r.g.clock.clock.day, 4); assert.equal(r.g.clock.clock.minutes, 7 * 60);
  assert.equal(adv[0].how, 'sleep'); assert.equal(saves.length, 1);
  assert.equal(r.g.police.reports.length, 0, 'eight hours off the street cools a shots-fired report');
  assert.equal(r.g.shops.stockOf('shop.test_newsstand', 'item.street_map'), 10, 'restocked');
  assert.equal(r.g.healthSys.effMax(r.g.healthSys.state('player')!), 100);
});

test('no sleeping while they are looking for you; waiting at a counter passes time without healing', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 30, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.95 });
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05); r.g.setFiring(false); r.g.setAiming(false); r.g.holster();
  r.until(() => r.has('police', 'dispatched'), 120);
  r.step(10);
  r.g.setContext({ atHome: true });
  assert.ok(['police', 'pursuit'].includes(r.g.canSleep() ?? ''), `can't sleep: ${r.g.canSleep()}`);
  const r2 = rig();
  r2.g.health.damage('player', { amount: 50, type: 'impact' });
  const hp = r2.g.health.get('player').hp;
  r2.g.setClock({ minutes: 12 * 60 });
  assert.ok(r2.g.wait(2).ok);
  assert.equal(r2.g.clock.clock.minutes, 14 * 60);
  assert.equal(r2.g.health.get('player').hp, hp, 'no healing from waiting');
});
