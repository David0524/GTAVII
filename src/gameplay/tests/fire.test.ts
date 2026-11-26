import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

test('a firebomb: arson (witnessed), people inside burn, a newsstand catches, engines put it out', () => {
  const r = rig();
  r.g.addProp('news', 'newsstand', 9, 0, -10);
  r.g.addCover('crate', [12, 0.55, -10], [0.7, 0.55, 0.7], 0, 'wood');
  r.sim.add('w1', 4, 4, { yaw: Math.atan2(4, 4), nerve: 0.9 });
  r.g.spawnCombatant({ id: 'e', faction: 'gang', squad: 's', pos: [7, 0, -10], weapon: null });
  r.g.inv.give('char.teddy_arce', 'item.molotov');
  const ev: any[] = []; r.g.on('fire', (e) => ev.push(e));
  assert.ok(r.g.throwMolotov([7, 0, -10]));
  assert.ok(r.has('crimeWitnessed'), 'arson is a crime someone saw');
  r.step(3);
  assert.ok(r.g.healthSys.state('e')!.hp < 100, 'the man inside it burned');
  r.step(10);
  assert.ok(ev.some((e) => e.kind === 'spread'), 'it spread to the newsstand');
  assert.ok(r.g.props.isBroken('news'), 'the newsstand burned');
  assert.ok(ev.some((e) => e.kind === 'engines'));
  r.step(200, 0.25);
  assert.equal(r.g.fire.fires.size, 0, 'out (fuel or engines)');
});

test('stop, drop and roll: dodging while burning usually puts you out', () => {
  let out = 0;
  for (let i = 0; i < 20; i++) {
    const r = rig();
    r.g.rng.state = 7919 * (i + 1);
    r.g.health.damage('player', { amount: 2, type: 'fire' });
    r.g.dodge([1, 0]);
    if (!r.g.health.get('player').injuries.includes('burning')) out++;
  }
  assert.ok(out >= 10 && out <= 19, `${out}/20`);
});
