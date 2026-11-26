import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

/**
 * Touch-only playthrough (brief: "every combat action is possible without precise aim").
 * The camera ray points at the sky the whole time — the player never aims. Only touch-layer commands
 * are used: AIM (lock-on), ◀ ▶, HEAD/BODY/LEGS, FIRE (hold), COVER, BLIND, RELOAD, GUARD (tap = dodge,
 * hold = block/parry), GRAB, WPN, USE, THREAT.
 */
function touchRig() {
  const r = rig();
  r.dir[0] = 0; r.dir[1] = 1; r.dir[2] = 0; // aim straight up: no precise aim anywhere
  r.g.setContext({ device: 'touch' });
  return r;
}

test('touch: lock-on + hold FIRE wins a gunfight from cover without aiming', () => {
  const r = touchRig();
  r.g.addCar('car', 0, 0, -2.5, Math.PI / 2);
  r.pos[2] = -0.6;
  r.g.toggleCover([0, -1]);                       // COVER
  assert.ok(r.g.pc.cover);
  for (let i = 0; i < 3; i++) r.g.spawnCombatant({ id: `e${i}`, faction: 'gang', squad: 's', pos: [-5 + i * 5, 0, -22], weapon: 'weapon.snub', hp: 60 });
  for (let i = 0; i < 3; i++) r.g.ai.alert(`e${i}`, [0, 0], 'player');
  r.g.equip('weapon.service');
  r.g.inv.give('char.teddy_arce', 'item.ammo_38', 60);
  let kills = 0; r.g.on('hit', (e) => { if (e.killed && e.shooter === 'player') kills++; });
  r.step(40, 1 / 30, () => {
    if (!r.g.aimer.locked) { r.g.setAiming(true); r.g.lockOn(); }   // AIM
    r.g.setFiring(true);                                            // hold FIRE
    if (r.g.currentGun()?.empty) r.g.reload();                      // RELOAD
  });
  const left = [...r.g.ai.agents.values()].filter((a) => a.alive && a.state !== 'surrender' && a.state !== 'flee').length;
  assert.ok(kills >= 1, `kills ${kills}`);
  assert.ok(left <= 1, `still fighting: ${left}`);
  assert.ok(!r.g.health.get('player').injuries.includes('dead'));
});

test('touch: cycling targets and picking a limb need no aim', () => {
  const r = touchRig();
  for (let i = 0; i < 3; i++) r.g.spawnCombatant({ id: `e${i}`, faction: 'hood', squad: 's', pos: [-6 + i * 6, 0, -15], weapon: null });
  // the camera is pointed at the sky: lock-on still finds targets in front
  r.dir[0] = 0; r.dir[1] = 0.2; r.dir[2] = -1;
  const a = r.g.lockOn(); assert.ok(a, 'AIM locks the best target');
  const b = r.g.cycleLock(1); const c = r.g.cycleLock(1);
  assert.ok(b && c && new Set([a!.id, b.id, c.id]).size === 3, '▶ cycles through all three');
  r.g.setLimb('legs');
  r.dir[0] = 0; r.dir[1] = 1; r.dir[2] = 0;
  r.g.equip('weapon.service'); r.g.setAiming(true); r.g.setFiring(true); r.step(0.05);
  const hits = r.events.filter((e) => e.type === 'hit' && e.e.shooter === 'player');
  assert.ok(hits.length === 0 || ['leg_l', 'leg_r', 'torso'].includes(hits[0].e.region), `limb respected (${hits[0]?.e.region})`);
});

test('touch: melee by buttons: GUARD tap dodges, GUARD hold blocks/parries, FIRE strikes, GRAB then shove', () => {
  const r = touchRig();
  r.g.spawnCombatant({ id: 'm', faction: 'hood', squad: 's', pos: [0, 0, -1.2], weapon: null, melee: 'weapon.fists' });
  r.g.ai.alert('m', [0, 0], 'player');
  const ev: string[] = []; r.g.on('melee', (e) => ev.push(e.kind));
  const f = r.g.melee.fighters.get('player')!;
  f.yaw = 0; // facing the hood at -z
  r.step(0.3);
  assert.ok(r.g.meleeAttack('light'));         // FIRE (tap) with fists
  r.step(0.5);
  r.g.block(true); r.step(1.5); r.g.block(false); // GUARD hold
  assert.ok(r.g.dodge([1, 0]));                // GUARD tap
  r.step(0.8);
  r.g.meleeAttack('grapple'); r.step(0.4);     // GRAB
  if (f.state === 'grappling') r.g.grappleAction('shove', [0, -1]);
  for (const k of ['hit', 'dodge']) assert.ok(ev.includes(k), `${k} (${[...new Set(ev)]})`);
});
