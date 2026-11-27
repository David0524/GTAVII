import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig } from './harness';
import { EFFECTS, goodId, loadVendorMenus, Monte, MONTE, parsePrice, TILL } from '../economy/vendors';
import { Rng } from '../core/rng';

const T = 'char.teddy_arce';
// narrative's content/vendors.json (claude/sharp-maxwell-jnb6hr): the single source of menus and prices
const VJ = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/narrative/vendors.json'), 'utf8'));
const vrig = () => { const r = rig(); r.g.loadVendorContent(VJ); return r; };

test('vendors.json is the single source: every gameplay effect resolves to an entry, and every entry has an effect', () => {
  const ids = new Set<string>();
  for (const [kind, items] of Object.entries(VJ.menus as Record<string, { item: string; price: string }[]>)) for (const x of items) ids.add(goodId(kind, x.item));
  for (const id of Object.keys(EFFECTS)) assert.ok(ids.has(id), `effects row ${id} has no vendors.json entry`);
  const warnings: string[] = []; loadVendorMenus(VJ, (m) => warnings.push(m));
  assert.deepEqual(warnings, [], 'every vendors.json good has an effects row');
  assert.equal(parsePrice('35¢'), 35); assert.equal(parsePrice('$1.00'), 100); assert.equal(parsePrice('$6.00'), 600);
});

test('vendors: prices are narrative\'s; a frank heals a little, an ice restores breath and cools, coffee sobers a touch', () => {
  const r = vrig();
  const price = (kind: string, id: string) => r.g.vendorMenus[kind as 'hot_dog'].find((g) => g.id === id)!.cents;
  assert.equal(price('hot_dog', 'hot_dog.frank'), 35); assert.equal(price('coffee_cart', 'coffee_cart.coffee'), 20);
  assert.equal(price('italian_ice', 'italian_ice.small_ice'), 25); assert.equal(price('italian_ice', 'italian_ice.large_ice'), 40);
  r.g.registerVendor('cart1', 'hot_dog', 2, 0); r.g.registerVendor('ice1', 'italian_ice', -2, 0); r.g.registerVendor('cof1', 'coffee_cart', 0, 3);
  (r.g as any).applyDamage('player', { amount: 30, type: 'melee' });
  const hp = r.g.health.get('player').hp, m0 = r.g.inv.ensure(T).money;
  assert.ok(r.g.buyFromVendor('cart1', 'hot_dog.frank'));
  assert.equal(r.g.health.get('player').hp, hp + 6); assert.equal(m0 - r.g.inv.ensure(T).money, 35);
  const st = r.g.inv.ensure(T).stamina; st.value = 20;
  r.g.buyFromVendor('ice1', 'italian_ice.small_ice'); assert.equal(st.value, 32);
  r.g.inv.ensure(T).intox = 0.5; r.g.buyFromVendor('cof1', 'coffee_cart.coffee'); assert.ok(Math.abs(r.g.inv.ensure(T).intox - 0.42) < 1e-9);
  r.g.inv.ensure(T).money = 10; assert.ok(!r.g.buyFromVendor('cart1', 'hot_dog.frank'), 'not on a dime');
  // without narrative's file nothing is for sale (no duplicate price list in gameplay)
  const bare = rig(); bare.g.registerVendor('c', 'hot_dog', 0, 0);
  assert.equal(bare.g.vendorMenu('c')!.goods.length, 0);
});

test('vendors: the context button buys, shines and finds the lady; peddlers sell things you carry; umbrellas only in the rain', () => {
  const r = vrig();
  r.g.registerVendor('shine1', 'shoeshine', 1, 0);
  assert.equal(r.g.contextAction()?.label, 'Shine 50¢');
  const m0 = r.g.inv.ensure(T).money; r.g.doContextAction();
  assert.equal(m0 - r.g.inv.ensure(T).money, 75, '50¢ and a quarter tip');
  assert.ok(r.g.inv.ensure(T).grooming.includes('shined shoes'));
  r.g.registerVendor('ped', 'peddler', 30, 30);
  r.pos[0] = 30; r.pos[2] = 30;
  assert.equal(r.g.contextAction()?.kind, 'buy');
  r.g.inv.addMoney(T, 2000);
  assert.ok(!r.g.vendorMenu('ped')!.goods.some((g) => g.id === 'peddler.umbrella_rain_only'), 'no umbrellas on a dry day');
  assert.ok(!r.g.buyFromVendor('ped', 'peddler.umbrella_rain_only'));
  r.g.setContext({ raining: true });
  assert.ok(r.g.buyFromVendor('ped', 'peddler.umbrella_rain_only')); assert.ok(r.g.inv.has(T, 'item.umbrella'));
  assert.ok(r.g.buyFromVendor('ped', 'peddler.gold_watch')); assert.ok(r.g.inv.has(T, 'item.fake_watch'));
});

test('vendors: robbing a cart is small change for real heat; an overturned cart is closed; tills refill over game hours', () => {
  const r = vrig();
  r.g.addProp('box', 'call_box', 30, 0, -10);
  (r.sim as any).add('ped_lunch', 4, -3, { nerve: 0.9, yaw: Math.PI / 2 });
  r.g.registerVendor('cart2', 'hot_dog', 1, 0);
  const crimes: string[] = []; r.g.on('crimeWitnessed', (e: any) => crimes.push(JSON.stringify(e)));
  const got = r.g.robVendor('cart2')!;
  assert.ok(got.cents > 0 && got.cents <= TILL.hot_dog, `a few dollars (${got.cents})`);
  assert.ok(crimes.some((c) => c.includes('theft')), 'seen and reported');
  assert.equal(r.g.robVendor('cart2')!.cents, 0, 'nothing left straight after');
  r.g.equip('weapon.service');
  r.g.passTime(6, 'wait');
  const again = r.g.robVendor('cart2')!;
  assert.ok(again.armed && again.cents >= TILL.hot_dog * 0.9, 'refilled after six hours; a gun makes it armed robbery');
  assert.ok(r.g.cartHit('cart2', { by: 'car', speed: 9 }));
  assert.equal(r.g.vendorMenu('cart2')!.open, false);
  assert.ok(!r.g.buyFromVendor('cart2', 'hot_dog.frank'), 'closed while it is on its side');
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
  const r = vrig(); r.g.registerVendor('deuce_monte', 'monte', 1, 0); r.g.inv.addMoney(T, 5000);
  const m0 = r.g.inv.ensure(T).money;
  const deal = r.g.monteDeal('deuce_monte', 1000)!;
  assert.equal(r.g.inv.ensure(T).money, m0 - 1000);
  r.g.montePick(deal.dealId, 1, deal.tellAt + deal.tellWindow / 2);
  assert.equal(r.g.inv.ensure(T).money, m0 + 1000);
});
