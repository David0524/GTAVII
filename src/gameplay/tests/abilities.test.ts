import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { expectedBribe } from '../police/police';

function stopped(lead: string) {
  const r = rig(lead);
  r.g.addProp('box1', 'call_box', 30, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.95 });
  r.g.equip(r.g.inv.weapons(lead).find((w) => r.g.reg.weapon(w).class !== 'melee') ?? 'weapon.fists');
  r.g.crime('shots_fired', { noise: 120 });
  r.until(() => r.has('police', 'stop'), 400);
  return r;
}

test('Payroll: Nick buys a cop for less', () => {
  const n = stopped('char.nick_varelas'), t = stopped('char.teddy_arce');
  for (const r of [n, t]) { const u = r.g.policeSys.units.get(r.g.hud()!.encounter!.unit)!; u.corrupt = 0.8; r.g.inv.addMoney(r.g.reg.leads.has('char.nick_varelas') ? 'char.nick_varelas' : '', 0); }
  const heat = n.g.policeSys.reports[0].heat;
  const cheap = Math.round(expectedBribe(heat) * 0.35); // under the 0.4 floor for anyone else
  n.g.inv.addMoney('char.nick_varelas', 100000); t.g.inv.addMoney('char.teddy_arce', 100000);
  assert.equal(t.g.police.bribe(t.g.hud()!.encounter!.unit, cheap), 'refused');
  assert.notEqual(n.g.police.bribe(n.g.hud()!.encounter!.unit, cheap), 'insulted');
  assert.ok(n.g.hasAbility('payroll') && !t.g.hasAbility('payroll'));
});

test('Evidence: Delphine photographs the cop she just paid; his report on her is gone', () => {
  const r = stopped('char.delphine_moore');
  const id = r.g.hud()!.encounter!.unit;
  r.g.policeSys.units.get(id)!.corrupt = 1; r.g.policeSys.setPayoff('pct.gramercy', 1);
  r.g.inv.addMoney('char.delphine_moore', 50000);
  // a big report she can't bribe away whole
  r.g.policeSys.reports[0].heat = 4.5;
  assert.equal(r.g.police.bribe(id, 40000), 'accepted');
  assert.ok(r.g.policeSys.reports.length >= 1, 'heat 4.5: the bribe only knocks it down');
  assert.ok(r.g.photographCop(id));
  assert.equal(r.g.policeSys.reports.filter((x) => x.perp === 'player').length, 0);
  assert.ok(r.g.inv.has('char.delphine_moore', 'item.photo_evidence'));
});

test('Disappear: a crowd swallows Delphine faster than Nick', () => {
  const lose = (lead: string) => {
    const r = stopped(lead);
    for (let i = 0; i < 6; i++) r.sim.add(`c${i}`, 2 + (i % 3), 2 + Math.floor(i / 3), { nerve: 1 });
    const u = r.g.policeSys.units.get(r.g.hud()!.encounter!.unit)!;
    u.state = 'pursuit'; u.x = 200; u.z = 200; u.lastSeen = [210, 210]; // out of sight, chasing the wrong corner
    r.sim.peds.forEach((p) => (p.cmd = { type: 'cower' }));
    let t = 0; r.until(() => { t += 1 / 30; return u.state !== 'pursuit'; }, 60);
    return t;
  };
  const d = lose('char.delphine_moore'), n = lose('char.nick_varelas');
  assert.ok(d < n * 0.6, `Delphine lost in ${d.toFixed(1)} s, Nick in ${n.toFixed(1)} s`);
});

test("Old Beat: once a day, if the desk thinks well of Teddy", () => {
  const r = stopped('char.teddy_arce');
  const rep = r.g.policeSys.reports[0]; rep.heat = 3.5;
  assert.ok(!r.g.oldBeat(rep.precinct), 'no relationship, no favour');
  r.g.setFlags([`rel.desk.${rep.precinct}`]);
  assert.ok(r.g.oldBeat(rep.precinct));
  assert.equal(rep.heat, 1.5);
  assert.ok(!r.g.oldBeat(rep.precinct), 'once a day');
});
