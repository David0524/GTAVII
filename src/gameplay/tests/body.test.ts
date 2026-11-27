import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { match } from '../police/description';

const T = 'char.teddy_arce';
test('drinking: modest and short', () => {
  const r = rig();
  r.g.inv.give(T, 'item.whiskey', 2);
  r.g.use('item.whiskey'); r.g.use('item.whiskey');
  assert.ok(r.g.intox() > 0.5 && r.g.intox() <= 1);
  r.step(150, 0.5);
  assert.equal(r.g.intox(), 0, 'sober in a few minutes');
});

test('barber: a shave changes what witnesses remember', () => {
  const r = rig();
  r.g.inv.ensure(T).grooming = 'moustache';
  const before = r.g.appearance();
  const desc = { clothes: [{ v: 'moustache', c: 0.9 }, { v: before.look.words[0], c: 0.9 }], subject: { v: before.subject, c: 0.6 } };
  const m0 = match(desc as any, before);
  assert.ok(r.g.groom('clean-shaven'));
  assert.ok(match(desc as any, r.g.appearance()) < m0);
});

test('boxing gym: training costs a buck an hour and builds the skill; a bout ends in a knockout and a purse', () => {
  const r = rig();
  const s0 = r.g.inv.ensure(T).skills.strength;
  assert.ok(r.g.train('strength', 2));
  assert.ok(r.g.inv.ensure(T).skills.strength > s0);
  const id = r.g.bout()!;
  const m0 = r.g.inv.ensure(T).money;
  for (let i = 0; i < 40 && !r.g.ai.agents.get(id)!.knockedOut; i++) r.g.health.damage(id, { amount: 12, region: 'torso', type: 'melee', source: 'player' });
  assert.ok(r.g.ai.agents.get(id)!.knockedOut, 'knocked out');
  assert.ok(!r.g.health.get(id).injuries.includes('dead'), 'never killed in the ring');
  assert.equal(r.g.inv.ensure(T).money, m0 + 2000);
  assert.ok(!r.has('crimeWitnessed'), 'a sanctioned bout is no crime');
});
