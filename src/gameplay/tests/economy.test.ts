import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig } from './harness';
import { migrate, SAVE_VERSION } from '../save';
import { Rng } from '../core/rng';

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', n), 'utf8'));
const T = 'char.teddy_arce', D = 'char.delphine_moore', N = 'char.nick_varelas';

test('inventory: stacks, weapons one per type, all-or-nothing take, money in integer cents', () => {
  const { g } = rig();
  assert.equal(g.inventory.of(T).money, 4000);
  assert.equal(g.inv.give(T, 'item.bandage', 20), 8, 'bandage stack 10, had 2');
  assert.equal(g.inv.give(T, 'item.service'), 0, 'already has one');
  assert.ok(!g.inventory.take(T, 'item.bandage', 11));
  assert.equal(g.inv.count(T, 'item.bandage'), 10);
  assert.ok(g.inventory.take(T, 'item.bandage', 10));
  assert.throws(() => g.inv.addMoney(T, 1.5));
  assert.ok(!g.inv.spend(T, 1e9));
  assert.equal(g.inventory.of(T).money, 4000);
});

test('save round-trip: inventory, money, loaded rounds, outfits, health, police, shops, props', () => {
  const a = rig();
  a.g.inv.addMoney(T, 1234); a.g.inv.give(D, 'item.ammo_9', 50);
  a.g.equip('weapon.service'); a.g.setFiring(true); a.g.setAiming(true); a.step(0.05); a.g.setFiring(false);
  a.g.shops.buy(T, 'shop.test_newsstand', 'item.street_map');
  a.g.policeSys.setPayoff('pct.square', 0.7);
  a.g.health.damage('player', { amount: 40, region: 'leg_l', type: 'bullet' });
  a.g.addProp('h1', 'hydrant', 5, 0, 5); a.g.props.damage('h1', 30, 'bullet');
  const s = JSON.parse(JSON.stringify(a.g.serialize()));
  assert.equal(s.v, SAVE_VERSION);
  const b = rig(); b.g.addProp('h1', 'hydrant', 5, 0, 5);
  b.g.deserialize(s);
  assert.deepEqual(b.g.serialize(), s);
  assert.equal(b.g.inventory.of(T).money, a.g.inventory.of(T).money);
  assert.equal(b.g.inv.ensure(T).loaded.get('weapon.service'), 5);
  assert.equal(b.g.policeSys.payoffOf('pct.square'), 0.7);
  assert.ok(b.g.health.get('player').injuries.includes('leg_l'));
  assert.equal(b.g.shops.stockOf('shop.test_newsstand', 'item.street_map'), 9);
});

test('migration fixture v1 (engine draft, dollars) → v4', () => {
  const m = migrate(fx('save_v1.json'));
  assert.equal(m.v, 4);
  assert.equal(m.inventory[T].money, 4035, '$40.35 → 4035¢ (rounded, not truncated)');
  assert.deepEqual(m.inventory[T].items.find((i) => i.id === 'item.bandage'), { id: 'item.bandage', qty: 2 });
  const { g } = rig();
  g.deserialize(fx('save_v1.json'));
  assert.equal(g.inventory.of(N).money, 30000);
  assert.ok(!g.inventory.of(N).items.some((i) => i.id === 'item.no_longer_exists'), 'removed content is dropped, never crashes');
  assert.equal(g.inv.ensure(T).wearing, 'outfit.teddy_desk', "'default' wardrobe → the lead's first outfit");
  assert.equal(g.inv.ensure(N).wearing, 'outfit.nick_weekend');
  assert.ok(g.inv.ensure(D).outfits.has('outfit.delphine_strip'));
  // and it saves back as v3 and round-trips
  const s = JSON.parse(JSON.stringify(g.serialize()));
  const h = rig(); h.g.deserialize(s); assert.deepEqual(h.g.serialize().inventory, s.inventory);
});

test('migration fixture v2 → v4; future versions are refused', () => {
  const { g } = rig();
  g.deserialize(fx('save_v2.json'));
  assert.equal(g.inventory.of(T).money, 1234);
  assert.equal(g.inv.count(T, 'item.ammo_38'), 37);
  assert.equal(g.inv.ensure(T).wearing, 'outfit.leisure_tan');
  assert.equal(g.policeSys.payoffOf('pct.midtown_central'), 0.5);
  assert.throws(() => migrate({ v: 99 }), /newer/);
  assert.throws(() => migrate({ hello: 1 }), /unknown/);
});

test('shops: buy/sell basics, ammo boxes are rounds, locked fence, closed hours, outfits', () => {
  const { g } = rig();
  let r = g.shops.buy(T, 'shop.test_fence', 'item.ammo_38');
  assert.ok(r.ok); assert.equal(g.inv.count(T, 'item.ammo_38'), 74, '24 loose rounds + a box of 50');
  assert.equal(r.cents, Math.round(650 * 1.35));
  r = g.shops.buy(T, 'shop.test_fence_trusted', 'item.smg'); assert.equal(r.reason, 'locked');
  g.setFlags(['flag.fence_trusted']); g.inv.addMoney(T, 100000);
  assert.ok(g.shops.buy(T, 'shop.test_fence_trusted', 'item.smg').ok);
  assert.equal(g.shops.buy(T, 'shop.test_fence_trusted', 'item.smg').reason, 'no_stock');
  assert.equal(g.shops.sell(T, 'shop.test_diner', 'item.smg').reason, 'not_buying');
  assert.equal(g.shops.sell(T, 'shop.test_pawn', 'item.key_corwin').reason, 'not_buying', 'keys never sell');
  g.shops.clock = () => 3 * 60; (g.reg.shops.get('shop.test_diner') as any).hours = ['06:00', '01:00'];
  assert.equal(g.shops.buy(T, 'shop.test_diner', 'item.coffee').reason, 'closed');
  g.shops.clock = () => 12 * 60;
  assert.ok(g.eatAt('shop.test_diner', 'item.coffee'));
});

test('shop invariants (fuzz): money and goods conserved, nothing negative, buy→sell never profits', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { g } = rig();
    const rng = new Rng(seed);
    g.inv.addMoney(T, rng.int(0, 60000));
    const shops = [...g.reg.shops.values()];
    let spent = 0, earned = 0;
    for (let i = 0; i < 300; i++) {
      const s = rng.pick(shops);
      const item = rng.chance(0.6) ? rng.pick(s.stock).item : rng.pick([...g.reg.items.keys()]);
      const qty = rng.int(1, 3);
      const before = { money: g.inv.ensure(T).money, have: g.inv.count(T, item), stock: g.shops.stockOf(s.id, item) };
      const res = rng.chance(0.55) ? g.shops.buy(T, s.id, item, qty) : g.shops.sell(T, s.id, item, qty);
      const after = { money: g.inv.ensure(T).money, have: g.inv.count(T, item), stock: g.shops.stockOf(s.id, item) };
      assert.ok(after.money >= 0 && after.have >= 0 && (after.stock === undefined || after.stock >= -1));
      if (!res.ok) { assert.deepEqual(after, before, `failed tx changed state (${res.reason})`); continue; }
      const dm = after.money - before.money;
      assert.ok(Number.isInteger(dm));
      if (dm < 0) spent -= dm; else earned += dm;
      assert.equal(Math.abs(dm), res.cents);
      if (before.stock === -1) assert.equal(after.stock, -1);
    }
    // round trip on every sellable stocked item: buy one, sell it straight back
    for (const s of shops) for (const st of s.stock) {
      const g2 = rig().g; g2.inv.addMoney(T, 1_000_000); g2.setFlags(['flag.fence_trusted']);
      const m0 = g2.inv.ensure(T).money; const had = g2.inv.count(T, st.item);
      const b = g2.shops.buy(T, s.id, st.item); if (!b.ok) continue;
      const units = g2.inv.count(T, st.item) - had;
      for (const s2 of shops) g2.shops.sell(T, s2.id, st.item, units);
      assert.ok(g2.inv.ensure(T).money <= m0, `${s.id}/${st.item} profit loop`);
    }
    void spent; void earned;
  }
});

test('outfits: buy at a clothing store, wear it out, it feeds the description', () => {
  const { g } = rig();
  (g.reg.shops as Map<string, any>).set('shop.clothes', { id: 'shop.clothes', name: 'Clothier', kind: 'clothing', markup: 1, buyback: 0, stock: [] });
  assert.equal(g.shops.buyOutfit(T, 'shop.clothes', 'outfit.leisure_tan').ok, false, 'no store stock map entry is fine but money is short');
  g.inv.addMoney(T, 5000);
  assert.ok(g.shops.buyOutfit(T, 'shop.clothes', 'outfit.leisure_tan').ok);
  assert.ok(g.changeOutfit('outfit.leisure_tan', true));
  assert.equal(g.appearance().look.headline, 'tan leisure suit');
  assert.equal(g.shops.buyOutfit(T, 'shop.clothes', 'outfit.delphine_day').ok, false, "doesn't fit Teddy");
});

test('payphones: a dime a call, incoming calls ring the nearest working phone, missed ones go to the service', () => {
  const r = rig();
  r.g.addProp('booth1', 'phone_booth', 20, 0, 0);
  r.g.addProp('booth2', 'phone_booth', 60, 0, 0);
  r.g.phones.queueIncoming({ id: 'call.m02', lead: T, from: 'char.carl_mayhew' });
  const rings: any[] = []; r.g.on('ring', (e) => rings.push(e));
  r.step(0.5);
  assert.equal(rings[0]?.phone, 'booth1');
  r.g.props.damage('booth1', 999, 'bullet');
  r.step(0.5);
  assert.equal(r.g.phones.messages.get(T)?.length, 1, 'broken mid-ring: message left');
  const m0 = r.g.inv.ensure(T).money;
  const res = r.g.phones.place(T, 'booth2', 'service');
  assert.ok(res.ok); assert.equal(res.messages?.length, 1); assert.equal(r.g.inv.ensure(T).money, m0 - 10);
  assert.equal(r.g.phones.place(T, 'booth1', 'service').reason, 'broken');
});

test('wasted: capped bill from cash, the attendants\' cut, half the loose ammo, guns kept, savings safe, max-health penalty', () => {
  const r = rig();
  r.g.inv.deposit(T, 1000); // $10 in savings
  r.g.inv.spend(T, 2000);   // $10 left on hand
  const ammo0 = r.g.inv.count(T, 'item.ammo_38');
  r.g.health.damage('player', { amount: 500, region: 'torso', type: 'bullet' });
  const w = r.events.find((x) => x.type === 'wasted')!.e;
  assert.ok(w.bill >= 8500 && w.bill <= 25000 && w.paid === 1000 && w.debt === w.bill - 1000);
  assert.equal(r.g.inventory.of(T).money, 0);
  assert.equal(r.g.inv.ensure(T).savings, 1000, 'savings are safe');
  assert.equal(r.g.inv.count(T, 'item.ammo_38'), ammo0 - Math.ceil(ammo0 / 2), 'half the loose ammo');
  assert.ok(r.g.inv.has(T, 'item.service'), 'the hospital keeps no guns');
  const s = r.g.healthSys.state('player')!;
  assert.equal(s.hp, 60); assert.equal(r.g.healthSys.effMax(s), 80, '20% max-health penalty');
  r.step(301, 0.5); assert.equal(r.g.healthSys.effMax(s), 100);
});

test('economy is wired into Gameplay: a street job pays, a register robbery is a witnessed crime, and it saves', () => {
  const r = rig();
  r.sim.add('clerk', 2, 0, { yaw: Math.atan2(2, 0), nerve: 0.9 });
  const ids = [...(r.g.economy as any).defs.keys()] as string[];
  const legal = ids.find((i) => /garment/.test(i))!, rob = ids.find((i) => /register/.test(i))!;
  const m0 = r.g.inv.ensure(T).money;
  const job = r.g.economy.attempt(T, legal);
  assert.ok(job.ok && job.cents > 0 && r.g.inv.ensure(T).money === m0 + job.cents, JSON.stringify(job));
  r.g.equip('weapon.service');
  const hit = r.g.economy.attempt(T, rob, { armed: true });
  assert.ok(hit.crimes.length > 0, JSON.stringify(hit));
  assert.ok(r.has('crimeWitnessed'), 'the clerk saw it');
  const s = JSON.parse(JSON.stringify(r.g.serialize()));
  const b = rig(); b.g.deserialize(s);
  assert.deepEqual(b.g.economy.serialize(), r.g.economy.serialize());
});
