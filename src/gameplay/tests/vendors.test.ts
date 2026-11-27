import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { MENUS, Monte, MONTE, TILL, SHINE } from '../economy/vendors';
import { Rng } from '../core/rng';

const T = 'char.teddy_arce';

test('vendors: 1974 prices; a frank heals a little, an ice restores breath and cools the heat, coffee sobers a touch', () => {
  const price = (k: keyof typeof MENUS, id: string) => MENUS[k].find((g) => g.id === id)!.cents;
  assert.equal(price('hotdog', 'frank'), 35); assert.equal(price('hotdog', 'soda'), 25); assert.equal(price('coffee_cart', 'coffee'), 25);
  assert.equal(price('ices', 'lemon_ice'), 20); assert.equal(price('newsstand', 'paper'), 15); assert.equal(SHINE.cents, 50);
  for (const goods of Object.values(MENUS)) for (const g of goods) assert.ok(g.cents <= 1000, `${g.id} stays street-priced`);
  const r = rig();
  r.g.registerVendor('cart1', 'hotdog', 2, 0); r.g.registerVendor('ice1', 'ices', -2, 0); r.g.registerVendor('cof1', 'coffee_cart', 0, 3);
  (r.g as any).applyDamage('player', { amount: 30, type: 'melee' });
  const hp = r.g.health.get('player').hp, m0 = r.g.inv.ensure(T).money;
  assert.ok(r.g.buyFromVendor('cart1', 'frank'));
  assert.equal(r.g.health.get('player').hp, hp + 6); assert.equal(m0 - r.g.inv.ensure(T).money, 35);
  const st = r.g.inv.ensure(T).stamina; st.value = 20;
  r.g.buyFromVendor('ice1', 'lemon_ice'); assert.equal(st.value, 35);
  r.g.inv.ensure(T).intox = 0.5; r.g.buyFromVendor('cof1', 'coffee'); assert.ok(Math.abs(r.g.inv.ensure(T).intox - 0.42) < 1e-9);
  r.g.inv.ensure(T).money = 10; assert.ok(!r.g.buyFromVendor('cart1', 'frank'), 'not on a dime');
});

test('vendors: the context button buys, shines and finds the lady; peddlers sell things you carry', () => {
  const r = rig();
  r.g.registerVendor('shine1', 'shoeshine', 1, 0);
  assert.equal(r.g.contextAction()?.kind, 'shine');
  r.g.doContextAction();
  assert.ok(r.g.inv.ensure(T).grooming.includes('shined shoes'));
  r.g.registerVendor('umb', 'peddler_umbrellas', 30, 30);
  r.pos[0] = 30; r.pos[2] = 30;
  assert.equal(r.g.contextAction()?.kind, 'buy');
  r.g.inv.addMoney(T, 1000);
  assert.ok(r.g.buyFromVendor('umb', 'umbrella')); assert.ok(r.g.inv.has(T, 'item.umbrella'));
});

test('vendors: robbing a cart is small change for real heat; an overturned cart is closed; tills refill over game hours', () => {
  const r = rig();
  r.g.addProp('box', 'call_box', 30, 0, -10);
  (r.sim as any).add('ped_lunch', 4, -3, { nerve: 0.9, yaw: Math.PI / 2 });
  r.g.registerVendor('cart2', 'hotdog', 1, 0);
  const crimes: string[] = []; r.g.on('crimeWitnessed', (e: any) => crimes.push(JSON.stringify(e)));
  const got = r.g.robVendor('cart2')!;
  assert.ok(got.cents > 0 && got.cents <= TILL.hotdog, `a few dollars (${got.cents})`);
  assert.ok(crimes.some((c) => c.includes('theft')), 'seen and reported');
  assert.equal(r.g.robVendor('cart2')!.cents, 0, 'nothing left straight after');
  r.g.equip('weapon.service');
  r.g.passTime(6, 'wait');
  const again = r.g.robVendor('cart2')!;
  assert.ok(again.armed && again.cents >= TILL.hotdog * 0.9, 'refilled after six hours; a gun makes it armed robbery');
  // knocked over in a chase
  assert.ok(r.g.cartHit('cart2', { by: 'car', speed: 9 }));
  assert.equal(r.g.vendorMenu('cart2')!.open, false);
  assert.ok(!r.g.buyFromVendor('cart2', 'frank'), 'closed while it is on its side');
  assert.ok(!r.g.cartHit('cart2', { by: 'npc', speed: 1 }), 'a nudge does nothing');
});

test('three-card monte is rigged: without the tell you never win; catch the bent corner and you do; win twice and the box folds', () => {
  const m = new Monte(new Rng(5));
  let lost = 0;
  for (let i = 0; i < 50; i++) { const d = m.deal(500, 0.5)!; if (!m.pick(d, d.queen, null).won) lost++; }
  assert.equal(lost, 50, 'pointing at the "right" card without the tell still loses: the palm');
  const d1 = m.deal(500, 0.5)!; assert.ok(m.pick(d1, 0, d1.tellAt + d1.tellWindow / 2).won, 'caught the tell');
  const d2 = m.deal(500, 0.5)!; m.pick(d2, 0, d2.tellAt + 0.01);
  assert.ok(m.folded && m.deal(500, 0.5) === null, 'the dealer folds after two wins');
  assert.ok(new Monte(new Rng(1)).deal(500, 1)!.tellWindow > new Monte(new Rng(1)).deal(500, 0)!.tellWindow, 'a sharp eye widens the tell');
  assert.equal(new Monte(new Rng(1)).deal(MONTE.maxStake + 1, 1), null, 'table limits');
  // through the facade: stake taken, paid 2x on a win
  const r = rig(); r.g.registerVendor('deuce_monte', 'monte', 1, 0); r.g.inv.addMoney(T, 5000);
  const m0 = r.g.inv.ensure(T).money;
  const deal = r.g.monteDeal('deuce_monte', 1000)!;
  assert.equal(r.g.inv.ensure(T).money, m0 - 1000);
  r.g.montePick(deal.dealId, 1, deal.tellAt + deal.tellWindow / 2);
  assert.equal(r.g.inv.ensure(T).money, m0 + 1000);
});
