import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

test('stats feed: shots, hits, kills, distance, money, checklist, and a save round-trip', () => {
  const r = rig();
  r.g.spawnCombatant({ id: 'e', faction: 'gang', squad: 's', pos: [0, 0, -6], weapon: null, hp: 30 });
  r.g.equip('weapon.service');
  r.g.setAiming(true); r.g.setContext({ device: 'touch' }); r.g.lockOn();
  for (let i = 0; i < 6; i++) { r.g.setFiring(true); r.step(0.5); }
  r.step(1, 1 / 30, () => { r.pos[0] += 0.1; });
  const s = r.g.stats.of('char.teddy_arce');
  assert.ok(s.shotsFired >= 1 && s.shotsHit >= 1 && s.kills === 1, JSON.stringify({ f: s.shotsFired, h: s.shotsHit, k: s.kills }));
  assert.ok(s.distanceOnFoot > 2.5);
  r.g.inv.addMoney('char.teddy_arce', 500);
  assert.ok(r.g.stats.of('char.teddy_arce').moneyEarned >= 500);
  assert.ok(r.g.stats.checklist().every((c) => typeof c.done === 'boolean'));
  const saved = JSON.parse(JSON.stringify(r.g.serialize()));
  const b = rig(); b.g.deserialize(saved);
  assert.deepEqual(b.g.stats.of('char.teddy_arce'), r.g.stats.of('char.teddy_arce'));
});
