import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { conceal, jamChance, rollShot, TIERS } from '../items/guns';
import { Rng } from '../core/rng';
import { makeStamina, stepStamina, heatMul } from '../player/stamina';
import { learn } from '../player/skills';
import { WEAPONS } from '../data/defaults';

const T = 'char.teddy_arce', D = 'char.delphine_moore', N = 'char.nick_varelas';
const W = (id: string) => WEAPONS.find((w) => w.id === id)!;

test('concealment: clothing decides what you can hide', () => {
  const r = rig();
  const look = (o: string) => r.g.reg.outfits.get(o)!;
  const L = (o: string) => { r.g.setContext({ atHome: true }); r.g.inv.ensure(T).outfits.add(o); r.g.changeOutfit(o); r.g.setContext({ atHome: false }); return r.g.wardrobe.look(T); };
  void look;
  const carried = [W('weapon.snub'), W('weapon.service'), W('weapon.sawnoff'), W('weapon.pump')];
  let c = conceal(L('outfit.teddy_desk'), carried, 'weapon.fists', false);
  assert.deepEqual(c.hidden, ['weapon.snub'], 'shirtsleeves: only the snub in a pocket');
  c = conceal(L('outfit.teddy_jacket'), carried, 'weapon.fists', false);
  assert.deepEqual(c.hidden, ['weapon.snub', 'weapon.service'], 'a jacket hides a revolver');
  c = conceal(L('outfit.raincoat'), carried, 'weapon.fists', true, 95);
  assert.deepEqual(c.hidden, ['weapon.snub', 'weapon.service', 'weapon.sawnoff'], 'a long coat hides a sawn-off');
  assert.deepEqual(c.bagged, ['weapon.pump'], 'a long gun only goes in a bag');
  assert.ok(c.heatLook, 'a long coat at 95°F draws looks');
  c = conceal(L('outfit.raincoat'), carried, 'weapon.service', false, 75);
  assert.ok(c.visible.includes('weapon.service'), 'the gun in your hand is always visible');
});

test('gun quality: tiers, wear, jams, one-tap clear, cleaning', () => {
  const rng = new Rng(5);
  const street = { tier: 'street' as const, condition: 0.4, jammed: false };
  const quality = { tier: 'quality' as const, condition: 1, jammed: false };
  assert.ok(jamChance(street) > 20 * jamChance(quality));
  let jams = 0; for (let i = 0; i < 2000; i++) { const g = { ...street }; if (!rollShot(g, rng)) jams++; }
  assert.ok(jams > 40 && jams < 200, `street guns in poor condition jam about 1 in 20 (${jams}/2000)`);
  assert.ok(TIERS.street.spread > TIERS.service.spread && TIERS.quality.spread < TIERS.service.spread);
  const r = rig();
  r.g.equip('weapon.service');
  const gs = r.g.gunState()!; gs.jammed = true;
  const shots: any[] = []; r.g.on('shot', (e) => shots.push(e));
  r.g.setFiring(true); r.step(0.1);
  assert.equal(shots.filter((s) => !s.jammed).length, 0, 'a jammed gun only clicks');
  assert.ok(r.g.clearJam()); r.step(0.7);
  assert.equal(gs.jammed, false);
  gs.condition = 0.3; assert.ok(!r.g.cleanGuns(), 'cleaning needs the safehouse');
  r.g.setContext({ atHome: true }); assert.ok(r.g.cleanGuns()); assert.equal(gs.condition, 1);
});

test('stamina: sprint drains (faster in the heat), walking recovers, exhaustion gate, fitness grows, unlimited toggle', () => {
  const s = makeStamina(100);
  let t = 0; while (stepStamina(s, 0.1, 'sprint', 80)) t += 0.1;
  assert.ok(t > 8 && t < 10, `≈9 s of sprint at 80°F (${t.toFixed(1)})`);
  const h = makeStamina(100); let th = 0; while (stepStamina(h, 0.1, 'sprint', 95)) th += 0.1;
  assert.ok(th < t * 0.75 && heatMul(95) === 1.5, 'the July heat cuts it by a third');
  assert.ok(!stepStamina(s, 0.1, 'walk'), 'exhausted');
  for (let i = 0; i < 60; i++) stepStamina(s, 0.1, 'walk');
  assert.ok(stepStamina(s, 0.1, 'walk'), 'recovered past the gate');
  assert.ok(s.max > 100, 'fitness grows with use');
  const u = makeStamina(10); for (let i = 0; i < 500; i++) assert.ok(stepStamina(u, 0.1, 'sprint', 99, true));
});

test('skills start per lead and improve with use, with diminishing returns', () => {
  const r = rig();
  const sk = (l: string) => r.g.inv.ensure(l).skills;
  assert.equal(sk(T).shooting, 80); assert.equal(sk(D).stealth, 85); assert.equal(sk(N).driving, 80);
  const s = { ...sk(N) }; const a = learn(s, 'shotHit', 50); const b = learn({ ...s, shooting: 90 }, 'shotHit', 50);
  assert.ok(a > 0 && b < a, 'learning slows near the top');
});

test('arrest: custody options, cash share to the clerk, records make repeat offenders hotter, bail by another lead', () => {
  const r = rig();
  r.g.inv.addMoney(T, 6000); // $100 on hand
  r.g.outcomes.arrested(T, 'pct.gramercy', 3, ['shots_fired']);
  const a = r.events.find((x) => x.type === 'arrested')!.e;
  assert.equal(a.cashTaken, 2000, '20% of cash on hand held');
  assert.ok(a.options.includes('bail') && a.options.includes('night') && a.options.includes('lawyer'));
  assert.ok(!a.options.includes('desk'), 'the desk only deals on a house that is on the pad');
  const nick0 = r.g.inv.ensure(N).money;
  assert.ok(r.g.release('bail', N));
  assert.equal(r.g.inv.ensure(N).money, nick0 - a.fine, 'Nick paid the bail');
  assert.ok(r.g.outcomes.held(T, 'pct.gramercy').length > 0, 'bail does not get the property back');
  assert.ok(r.g.outcomes.retrieve(T, 'pct.gramercy'));
  // second arrest in the same house: priors raise the fine and the next report's starting heat
  r.g.outcomes.arrested(T, 'pct.gramercy', 3, ['shots_fired']);
  const b = r.events.filter((x) => x.type === 'arrested')[1].e;
  assert.equal(b.priors, 1); assert.ok(b.fine > a.fine);
  assert.ok(r.g.release('night'));
  assert.equal(r.g.policeSys.priorsOf('player', 'pct.gramercy'), 2);
  // killing a cop: no desk deal even on the pad
  r.g.policeSys.setPayoff('pct.square', 1);
  r.g.outcomes.arrested(T, 'pct.square', 6, ['officer_down']);
  assert.ok(!r.g.outcomes.custody!.options.includes('desk'));
});

test('chase phases read from the world: spotted → pursuit → lost → searching → cooling', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 40, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.9 });
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.1); r.g.setFiring(false); r.g.setAiming(false); r.g.holster();
  r.g.setContext({ atHome: true }); r.g.changeOutfit('outfit.teddy_jacket'); r.g.changeOutfit('outfit.teddy_desk'); r.g.setContext({ atHome: false });
  const seen = new Set<string>();
  const ph = () => r.g.policeSys.phase('player');
  r.until(() => { seen.add(ph()); return r.has('police', 'stop'); }, 400);
  // run: sprint away until they lose him
  r.step(60, 1 / 30, () => { seen.add(ph()); r.pos[0] += 0.2; r.g.setContext({ speed: 6, sprinting: true }); });
  r.step(200, 0.25, () => seen.add(ph()));
  for (const p of ['spotted', 'pursuit']) assert.ok(seen.has(p), `${p} (${[...seen]})`);
  assert.ok(seen.has('lost') || seen.has('searching') || seen.has('cooling'), `${[...seen]}`);
});

test('foot cops tire in a long chase and radio for help', () => {
  const r = rig();
  const cop = r.g.registerPolice('foot', 'pct.gramercy', 7, -8, { corrupt: 0 }); // off the line of fire
  cop.yaw = Math.atan2(7, -8);
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05); r.g.setFiring(false);
  assert.equal(cop.state, 'pursuit');
  const radios: string[] = []; r.g.on('radio', (e) => radios.push(e.text));
  r.step(30, 1 / 30, () => { r.pos[2] += 6.2 / 30; r.g.setContext({ speed: 6.2, sprinting: true }); });
  assert.ok(cop.stamina.exhausted || cop.calledBackup, 'he tired');
  assert.ok(radios.some((t) => t.includes('need assistance')), 'and called it in');
});
