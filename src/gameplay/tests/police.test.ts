import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { match, describeText } from '../police/description';
import { STOP_MATCH, expectedBribe } from '../police/police';

/** Teddy fires a revolver on an empty street with one witness and one call box. */
function shooting(seed?: { nerve?: number }) {
  const r = rig();
  r.g.addProp('box1', 'call_box', 40, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: seed?.nerve ?? 0.8 }); // facing the player
  r.g.equip('weapon.service');
  r.g.setAiming(true); r.g.setFiring(true);
  r.step(0.1);
  r.g.setFiring(false); r.g.setAiming(false); r.g.holster(); // gun put away (a visible gun gets you stopped on sight)
  return r;
}

test('witness → call box → report → precinct response (the whole chain, headless)', () => {
  const r = shooting();
  assert.ok(r.has('crimeWitnessed'), 'the shot was witnessed');
  const tHead = r.until(() => r.has('witness', 'heading'), 10);
  assert.ok(tHead >= 0, 'witness heads for a reporting point');
  const head = r.events.find((x) => x.type === 'witness' && x.e.kind === 'heading')!.e;
  assert.equal(head.id, 'box1'); assert.equal(head.to, 'callbox');
  assert.ok(r.until(() => r.has('witness', 'calling'), 30) >= 0, 'reaches the box and calls');
  assert.ok(r.until(() => r.has('reportFiled'), 15) >= 0, 'report filed after the call');
  const rep = r.g.police.reports[0];
  assert.equal(rep.precinct, 'pct.gramercy');
  assert.ok(rep.severity >= 3, 'shots fired is tier 3');
  assert.ok(/service|white|brown|male/.test(describeText(r.g.policeSys.reports[0].description)), describeText(r.g.policeSys.reports[0].description));
  assert.ok(r.has('radio'));
  // response arrives in stages
  assert.ok(r.until(() => r.has('police', 'dispatched'), 60) >= 0, 'a unit is dispatched');
  // standing in the same clothes where the report says: a unit comes, recognises and stops him
  assert.ok(r.until(() => r.has('police', 'stop'), 240) >= 0, 'a unit stops the player');
});

test('bribes: accepted by a bent cop (report cleared), refused when too small, insulting to an honest one', () => {
  const r = shooting();
  r.until(() => r.has('police', 'stop'), 400);
  const enc = r.g.hud()!.encounter!;
  assert.ok(enc, 'in an encounter');
  const u = r.g.policeSys.units.get(enc.unit)!;
  const money0 = r.g.inv.ensure('char.teddy_arce').money;
  // refused: corrupt but a lowball (money untouched)
  u.corrupt = 0.9;
  const heat = r.g.policeSys.reports[0].heat;
  assert.equal(r.g.police.bribe(u.id, Math.floor(expectedBribe(heat) * 0.3)), 'refused');
  assert.equal(r.g.inv.ensure('char.teddy_arce').money, money0);
  // accepted: enough cash, a bent cop (force the roll by giving him every reason)
  r.g.inv.addMoney('char.teddy_arce', 30000);
  u.corrupt = 1; r.g.policeSys.setPayoff('pct.gramercy', 1);
  const offer = Math.round(expectedBribe(heat) * 1.4);
  const res = r.g.police.bribe(u.id, offer);
  assert.equal(res, 'accepted');
  assert.equal(r.g.inv.ensure('char.teddy_arce').money, money0 + 30000 - offer);
  assert.equal(r.g.police.reports.length, 0, 'report cleared');
  assert.equal(u.state, 'leave');

  // honest cop: insulted, and the report gets worse
  const r2 = shooting();
  r2.until(() => r2.has('police', 'stop'), 400);
  const u2 = r2.g.policeSys.units.get(r2.g.hud()!.encounter!.unit)!;
  u2.corrupt = 0;
  const h0 = r2.g.policeSys.reports[0].heat;
  assert.equal(r2.g.police.bribe(u2.id, 50000), 'insulted');
  assert.ok(r2.g.policeSys.reports[0].heat > h0);
  assert.equal(u2.state, 'pursuit');
});

test('breaking the description: change clothes and the stop never comes', () => {
  const r = shooting();
  r.until(() => r.has('reportFiled'), 60);
  const desc = r.g.policeSys.reports[0].description;
  const before = match(desc, r.g.appearance());
  assert.ok(before >= STOP_MATCH, `fits before: ${before}`);
  r.g.setContext({ atHome: true });
  assert.ok(r.g.changeOutfit('outfit.teddy_jacket'));
  r.g.setContext({ atHome: false });
  const after = match(desc, r.g.appearance());
  assert.ok(after < STOP_MATCH, `no longer fits: ${after}`);
  r.step(200);
  assert.ok(!r.has('police', 'stop'), 'units search but never stop him');
  assert.ok(r.has('police', 'dispatched'));
});

test('changing outfit only works at home (or straight out of the store)', () => {
  const r = rig();
  assert.ok(!r.g.changeOutfit('outfit.teddy_jacket'));
  assert.ok(r.g.changeOutfit('outfit.teddy_jacket', true));
});

test('reports decay and clear; a precinct on the pad forgets faster and escalates less', () => {
  const timeToClear = (payoff: number) => {
    const r = shooting();
    r.g.policeSys.setPayoff('pct.gramercy', payoff);
    r.until(() => r.has('reportFiled'), 60);
    r.pos[0] = 3000; r.pos[2] = 3000; r.g.setContext({ indoors: true }); // gone, hiding indoors
    return r.until(() => r.g.police.reports.length === 0, 2000, 0.25);
  };
  const t0 = timeToClear(0), t1 = timeToClear(1);
  assert.ok(t0 > 0 && t1 > 0, `both clear (${t0}, ${t1})`);
  assert.ok(t1 < t0 * 0.6, `payoff clears faster: ${t1} vs ${t0}`);
  const r = shooting(); r.g.policeSys.setPayoff('pct.gramercy', 1); r.until(() => r.has('reportFiled'), 60);
  assert.ok(r.g.police.reports[0].tier < 3, 'a paid house sends less');
});

test('a broken call box sends the witness to a payphone; intimidating a timid witness silences them', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 30, 0, 0);
  r.g.addProp('booth1', 'phone_booth', -30, 0, 0);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.9 });
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.1); r.g.setFiring(false);
  r.until(() => r.has('witness', 'heading'), 10);
  r.g.props.damage('box1', 999, 'bullet', 'player');
  assert.ok(r.has('propBroken'));
  const last = [...r.events].reverse().find((x) => x.type === 'witness' && x.e.kind === 'heading')!.e;
  assert.equal(last.id, 'booth1', 'rerouted to the payphone');
  assert.ok(r.until(() => r.has('reportFiled'), 90) >= 0, 'still reports, slower');

  const q = rig();
  q.g.addProp('box1', 'call_box', 40, 0, 0);
  q.sim.add('w1', 5, 0, { yaw: Math.atan2(5, 0), nerve: 0.05 });
  q.g.setContext({ atHome: true }); q.g.changeOutfit('outfit.teddy_jacket'); q.g.setContext({ atHome: false }); // a jacket hides a holstered revolver
  q.g.equip('weapon.service'); q.g.setAiming(true); q.g.setFiring(true); q.step(0.1); q.g.setFiring(false); q.g.setAiming(false); q.g.holster(); // gun put away: no ongoing menacing
  q.step(0.4);
  let res = 'none'; for (let i = 0; i < 4 && res !== 'silenced'; i++) res = q.g.intimidate('w1');
  assert.equal(res, 'silenced');
  q.step(60);
  assert.ok(!q.has('reportFiled'), 'no report');
});

test('no witnesses, no crime', () => {
  const r = rig();
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.1);
  r.step(30);
  assert.ok(!r.has('crimeWitnessed') && r.g.police.reports.length === 0);
});

test('arrest: comply → precinct, illicit items confiscated, fine; lawyer gets them back (Nick)', () => {
  const r = shooting();
  r.until(() => r.has('police', 'stop'), 400);
  r.g.surrender(true);
  assert.ok(r.until(() => r.has('arrested'), 30) >= 0);
  const a = r.events.find((x) => x.type === 'arrested')!.e;
  assert.ok(a.confiscated.some((i: any) => i.id === 'item.service'));
  assert.ok(!r.g.inv.has('char.teddy_arce', 'item.service'));
  assert.ok(r.g.inv.has('char.teddy_arce', 'item.key_corwin'), 'legal things stay');
  assert.ok(!r.g.outcomes.lawyer('char.teddy_arce', a.precinct), 'Teddy has no lawyer yet');
  r.g.setFlags(['flag.has_lawyer']); r.g.inv.addMoney('char.teddy_arce', 10000);
  assert.ok(r.g.outcomes.lawyer('char.teddy_arce', a.precinct));
  assert.ok(r.g.inv.has('char.teddy_arce', 'item.service'));
});

test('a cop who sees it happen gives chase at once', () => {
  const r = rig();
  r.g.registerPolice('foot', 'pct.gramercy', 0, -15, { corrupt: 0 });
  r.g.policeSys.units.forEach((u) => (u.yaw = 0)); // facing -z… away
  for (const u of r.g.policeSys.units.values()) u.yaw = Math.PI; // facing +z, toward the player
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.1);
  assert.ok(r.has('police', 'pursuit'));
});

test('five witnesses to one gunshot make one shots-fired, not five', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 30, 0, -10);
  for (let i = 0; i < 5; i++) r.sim.add(`w${i}`, 6 + i, 2, { yaw: Math.atan2(6 + i, 2), nerve: 0.95 });
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05); r.g.setFiring(false); r.g.setAiming(false); r.g.holster();
  r.g.setContext({ atHome: true }); r.g.changeOutfit('outfit.teddy_jacket'); r.g.setContext({ atHome: false });
  r.until(() => r.g.policeSys.reports.length > 0 && r.g.policeSys.reports[0].sources >= 3, 120);
  const rep = r.g.policeSys.reports[0];
  assert.ok(rep.sources >= 3, `several accounts (${rep.sources})`);
  assert.equal(rep.kinds.filter((k) => k === 'shots_fired').length, 1, rep.kinds.join(','));
  assert.ok(rep.heat < 3.6, `heat ${rep.heat}`);
});

test('after an accepted bribe nobody else on that report keeps coming', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 30, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.95 });
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05); r.g.setFiring(false); r.g.setAiming(false); r.g.holster();
  r.until(() => r.has('police', 'stop'), 400);
  const id = r.g.hud()!.encounter!.unit;
  r.g.policeSys.units.get(id)!.corrupt = 1; r.g.policeSys.setPayoff('pct.gramercy', 1); r.g.inv.addMoney('char.teddy_arce', 50000);
  assert.equal(r.g.police.bribe(id, 20000), 'accepted');
  // then a jacket over the holstered revolver: in shirtsleeves it would keep showing (menacing)
  r.g.inv.ensure('char.teddy_arce').wearing = 'outfit.teddy_jacket';
  r.step(90);
  assert.ok(!r.has('police', 'stop') || r.events.filter((e) => e.type === 'police' && e.e.kind === 'stop').every((e) => e.t <= r.events.find((x) => x.type === 'police' && x.e.kind === 'bribe')!.t), 'no new stop after the bribe');
  assert.ok(r.g.heatClear(), 'clear');
});
