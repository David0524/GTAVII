import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { needs } from '../police/police';
import { RADIO_SILENCE } from '../index';

test('killing a cop: copKilled, found even unwitnessed, citywide, unbribable, slow to cool, surge response', () => {
  const r = rig();
  const killed: any[] = []; r.g.on('copKilled', (e) => killed.push(e));
  const cop = r.g.registerPolice('foot', 'pct.gramercy', 0, -6, { corrupt: 1 });
  cop.yaw = Math.PI * 0; // facing away: he never sees it coming
  r.g.health.damage(cop.id, { amount: 999, region: 'torso', type: 'bullet', source: 'player' });
  assert.equal(killed.length, 1);
  assert.equal(r.g.police.reports.length, 0, 'nobody saw it yet');
  r.step(RADIO_SILENCE + 1);
  const rep = r.g.policeSys.reports[0];
  assert.ok(rep && rep.kinds.includes('officer_down'), 'radio silence → officer-down report');
  assert.ok(r.g.policeSys.isCitywide(rep));
  const want = needs(5, true);
  assert.ok((want.sector_car ?? 0) >= 4 && (want.roadblock ?? 0) >= 4, 'officer-down surge');
  // a bent cop from another house still won't take money for it
  const other = r.g.registerPolice('foot', 'pct.square', 3, 3, { corrupt: 1 });
  r.g.inv.addMoney('char.teddy_arce', 500000);
  assert.equal(r.g.police.bribe(other.id, 400000), 'insulted');
  // slow decay: still on file after 10 minutes in hiding
  r.pos[0] = 5000; r.g.setContext({ indoors: true });
  r.step(600, 0.25);
  assert.ok(r.g.policeSys.reports.some((x) => x.kinds.includes('officer_down')), 'a dead cop is remembered');
});

test('heatClear gate and the cleared event; essential deaths are reported for mission fail', () => {
  const r = rig();
  r.g.addProp('box1', 'call_box', 40, 0, -10);
  r.sim.add('w1', 8, 0, { yaw: Math.atan2(8, 0), nerve: 0.9 });
  assert.ok(r.g.heatClear());
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.1); r.g.setFiring(false); r.g.setAiming(false);
  r.until(() => r.g.police.reports.length > 0, 60);
  assert.ok(!r.g.heatClear());
  let cleared = 0; r.g.on('cleared', () => cleared++);
  r.pos[0] = 4000; r.g.setContext({ indoors: true });
  assert.ok(r.until(() => r.g.heatClear(), 2000, 0.25) >= 0);
  r.step(0.5);
  assert.equal(cleared, 1);
  const ek: any[] = []; r.g.on('essentialKilled', (e) => ek.push(e));
  r.g.spawnCombatant({ id: 'mayhew', faction: 'corrupt_cop', squad: 's', pos: [10, 0, 10], weapon: null });
  r.g.setEssential('mayhew');
  r.g.health.damage('mayhew', { amount: 999, region: 'torso', type: 'bullet', source: 'player' });
  assert.equal(ek[0]?.id, 'mayhew');
});

test('a beat cop who hears a shot behind him goes to look, and a drawn gun in plain sight gets a pursuit', () => {
  const r = rig();
  const cop = r.g.registerPolice('foot', 'pct.gramercy', 0, -30, { corrupt: 0 });
  cop.yaw = 0; // looking uptown, away from the player at the origin
  assert.equal(cop.state, 'post');
  r.step(20);
  assert.equal(r.g.policeSys.units.get(cop.id)?.state, 'post', 'a beat post never times out');
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05); r.g.setFiring(false);
  assert.ok(r.has('police', 'investigate'), 'heard it');
  assert.ok(r.until(() => r.has('police', 'pursuit'), 20) >= 0, 'turns up, sees the gun still out, gives chase');
});
