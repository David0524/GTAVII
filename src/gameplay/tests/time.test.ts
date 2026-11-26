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

test('home upgrade: an air conditioner makes a heatwave night a full rest', () => {
  const r = rig();
  r.g.setClock({ day: 1, minutes: 23 * 60, heatwave: true }); r.g.setContext({ atHome: true });
  r.g.inv.addMoney('char.teddy_arce', 20000);
  assert.ok(r.g.buyHomeUpgrade('ac'));
  assert.ok(!r.g.buyHomeUpgrade('ac'), 'once');
  assert.equal(r.g.sleep(7).quality, 1);
});

test('live clock: the engine feed runs tills, the calendar and restocks while you play; jumps and loads do not', () => {
  const r = rig();
  const lead = 'char.teddy_arce';
  r.g.setClock({ day: 0, minutes: 22 * 60 });
  r.g.inv.ensure(lead).money = 100000;
  assert.ok(r.g.economy.buyBusiness(lead, 'biz.newsstand'));
  const till = () => r.g.economy.property.owned.get('biz.newsstand')!.till;
  const ticks: string[] = []; r.g.clock.on('timeAdvanced', (e) => ticks.push(e.how));
  // 3 game hours of play at 1 game minute per 2 real seconds, fed every frame at 30 fps (minutes only, like the engine)
  let m = 22 * 60;
  for (let f = 0; f < 3 * 60 * 2 * 30; f++) { m += 1 / 60; r.g.setClock({ minutes: m >= 1440 ? m - 1440 : m }); }
  assert.ok(till() > 0, `the till filled in live play (${till()})`);
  assert.equal(r.g.clock.clock.day, 1, 'midnight rolled the day');
  assert.ok(ticks.length >= 30 && ticks.every((h) => h === 'live'), `batched live ticks (${ticks.length})`);
  // a big jump (a load, a debug set) moves the clock with no effects
  const t0 = till(); r.g.setClock({ day: 5, minutes: 600 });
  assert.equal(till(), t0); assert.equal(ticks.length >= 30, true);
});
