import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

function guard(atZ = -6, yaw = 0) {
  const r = rig();
  r.g.spawnCombatant({ id: 'g', faction: 'hood', squad: 's', pos: [0, 0, atZ], yaw, weapon: 'weapon.pistol' });
  return r;
}

test('stealth: a guard looking away does not notice a sneaking player; a sprinting one is heard', () => {
  const r = guard(-6, 0); // the guard faces -z, away from the player at the origin
  r.g.setContext({ crouch: true, speed: 1 });
  r.step(5);
  assert.equal(r.g.ai.agents.get('g')!.state, 'idle', 'unaware');
  r.g.setContext({ crouch: false, speed: 6, sprinting: true });
  r.step(1);
  assert.notEqual(r.g.ai.agents.get('g')!.state, 'idle', 'heard the footsteps');
});

test('stealth: someone in plain view builds suspicion before the alarm; sneaking and distance slow it', () => {
  const r = guard(-20, Math.PI); // the guard faces +z, toward the player 20 m off
  r.step(0.6);
  assert.equal(r.g.ai.agents.get('g')!.state, 'idle', 'not instant');
  r.step(3);
  assert.notEqual(r.g.ai.agents.get('g')!.state, 'idle', 'noticed');
  const q = guard(-22, Math.PI);
  q.g.setContext({ crouch: true });
  q.step(6);
  assert.equal(q.g.ai.agents.get('g')!.state, 'idle', 'crouched at 22 m: out of his range');
});

test('takedown from behind: knockout with fists, lethal with a blade; only on the unaware', () => {
  const r = guard(-1.0, 0);
  r.g.setContext({ crouch: true, speed: 0.5 });
  const t = r.g.takedown();
  assert.deepEqual(t, { id: 'g', lethal: false });
  assert.ok(r.g.ai.agents.get('g')!.knockedOut);
  assert.ok(!r.g.health.get('g').injuries.includes('dead'));
  const k = rig('char.delphine_moore');
  k.g.spawnCombatant({ id: 'g', faction: 'hood', squad: 's', pos: [0, 0, -1], yaw: 0, weapon: null });
  k.g.equip('weapon.knife');
  assert.equal(k.g.takedown()?.lethal, true);
  const f = guard(-1.0, Math.PI); // facing the player
  assert.equal(f.g.takedown(), null, 'not from the front');
});
