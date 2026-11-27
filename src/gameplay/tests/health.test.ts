import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthSystem, fallDamage, pedestrianImpactDamage, occupantImpactDamage, REGEN_DELAY, BLEED_FLOOR, CLOT_MINOR } from '../health/Health';

const step = (h: HealthSystem, secs: number, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) h.update(dt); };

test('region multipliers: torso 1x, legs 0.65x, arms 0.55x', () => {
  const h = new HealthSystem();
  h.register('a', { maxHp: 100 }); h.register('b', { maxHp: 100 }); h.register('c', { maxHp: 100 });
  assert.equal(h.damage('a', { amount: 20, region: 'torso', type: 'bullet' }).dealt, 20);
  assert.equal(h.damage('b', { amount: 20, region: 'leg_l', type: 'bullet' }).dealt, 13);
  assert.equal(h.damage('c', { amount: 20, region: 'arm_r', type: 'bullet' }).dealt, 11);
});

test('the head is lethal for NPCs, doubled (not lethal) for the player', () => {
  const h = new HealthSystem();
  h.register('npc', { maxHp: 150 }); h.register('pl', { maxHp: 110, isPlayer: true });
  const r = h.damage('npc', { amount: 25, region: 'head', type: 'bullet' });
  assert.ok(r.lethal && r.killed);
  const p = h.damage('pl', { amount: 25, region: 'head', type: 'bullet' });
  assert.equal(p.dealt, 50); assert.ok(!p.killed);
  // a weak melee blow to the head is not lethal
  h.register('n2', { maxHp: 100 });
  assert.ok(!h.damage('n2', { amount: 9, region: 'head', type: 'melee' }).killed);
});

test('a vest soaks 75% of torso rounds and wears down; rifles halve it; it does nothing for legs', () => {
  const h = new HealthSystem();
  h.register('v', { maxHp: 100, armor: 60 });
  const r = h.damage('v', { amount: 40, region: 'torso', type: 'bullet', power: 0.7 });
  assert.equal(r.absorbed, 30); assert.equal(r.dealt, 10); assert.equal(h.state('v')!.armor, 30);
  const r2 = h.damage('v', { amount: 40, region: 'torso', type: 'bullet', power: 1.4 });
  assert.equal(r2.absorbed, 15);
  const r3 = h.damage('v', { amount: 20, region: 'leg_r', type: 'bullet' });
  assert.equal(r3.absorbed, 0);
});

test('bleeding: minor wounds clot; heavy bleeds need treatment; the player never bleeds out below the floor', () => {
  const h = new HealthSystem();
  h.register('n', { maxHp: 100 });
  h.damage('n', { amount: 10, region: 'arm_l', type: 'bullet' }); // minor (0.45/s)
  assert.ok(h.get('n').injuries.includes('bleeding'));
  step(h, CLOT_MINOR + 1);
  assert.ok(!h.get('n').injuries.includes('bleeding'), 'minor bleed clots');
  h.register('p', { maxHp: 100, isPlayer: true });
  h.damage('p', { amount: 30, region: 'torso', type: 'bullet' });
  h.damage('p', { amount: 10, region: 'torso', type: 'bullet' });
  step(h, 300);
  const s = h.state('p')!;
  assert.ok(!s.dead); assert.ok(Math.abs(s.hp - 100 * BLEED_FLOOR) < 1e-6, `player held at floor, hp=${s.hp}`);
  h.treat('p', { stopBleeding: true });
  assert.ok(!h.get('p').injuries.includes('bleeding'));
  // NPCs can bleed out
  h.register('q', { maxHp: 30 });
  h.damage('q', { amount: 20, region: 'torso', type: 'bullet', }); h.damage('q', { amount: 5, region: 'torso', type: 'bullet' });
  step(h, 60);
  assert.ok(h.state('q')!.dead);
});

test('regeneration waits REGEN_DELAY and stops at the lead ceiling', () => {
  const h = new HealthSystem();
  h.register('p', { maxHp: 100, isPlayer: true, regenCeiling: 0.6 });
  h.damage('p', { amount: 70, type: 'impact' });
  step(h, REGEN_DELAY - 0.5);
  assert.ok(Math.abs(h.state('p')!.hp - 30) < 1e-6, 'no regen before delay');
  step(h, 60);
  assert.ok(Math.abs(h.state('p')!.hp - 60) < 1e-6, `stops at ceiling (hp=${h.state('p')!.hp})`);
  h.heal('p', 25); assert.equal(h.state('p')!.hp, 85);
});

test('injuries: leg wounds limp, a crippled leg cannot sprint, arms add sway; treatment relieves', () => {
  const h = new HealthSystem();
  h.register('p', { maxHp: 100, isPlayer: true });
  h.damage('p', { amount: 35, region: 'leg_l', type: 'bullet' }); // 22.75 / 40 = 0.57 wear
  let e = h.effects('p');
  assert.ok(e.limp > 0.4 && e.speedMul < 0.85 && e.canSprint, JSON.stringify(e));
  h.damage('p', { amount: 30, region: 'leg_l', type: 'bullet' });
  e = h.effects('p'); assert.ok(!e.canSprint);
  h.damage('p', { amount: 35, region: 'arm_r', type: 'bullet' });
  assert.ok(h.effects('p').swayDeg > 1);
  assert.ok(h.get('p').injuries.includes('leg_l') && h.get('p').injuries.includes('arm_r'));
  h.treat('p', { wearRelief: 2 });
  assert.equal(h.effects('p').limp, 0);
});

test('fall / vehicle damage curves', () => {
  assert.equal(fallDamage(2), 0);
  assert.ok(fallDamage(5) > 15 && fallDamage(5) < 30);
  assert.ok(fallDamage(15) > 100);
  assert.ok(pedestrianImpactDamage(4) < 10, 'a bump at a walking pace');
  assert.ok(pedestrianImpactDamage(13.4) > 100, '30 mph is lethal');
  assert.equal(occupantImpactDamage(5), 0);
  assert.ok(occupantImpactDamage(20) > 50);
});

test('fire damage over time, extinguish', () => {
  const h = new HealthSystem();
  h.register('p', { maxHp: 100 });
  h.damage('p', { amount: 5, type: 'fire' });
  step(h, 2);
  assert.ok(h.state('p')!.hp < 90 && h.get('p').injuries.includes('burning'));
  h.treat('p', { extinguish: true });
  const hp = h.state('p')!.hp; step(h, 1); assert.ok(h.state('p')!.hp >= hp);
});

test('serialize round-trip', () => {
  const h = new HealthSystem();
  h.register('p', { maxHp: 100 });
  h.damage('p', { amount: 30, region: 'leg_r', type: 'bullet' });
  const s = h.serialize('p');
  const h2 = new HealthSystem(); h2.register('p', { maxHp: 100 }); h2.deserialize('p', s);
  assert.deepEqual(h2.serialize('p'), s);
});
