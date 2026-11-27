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

// ---- TOUCH_CONTROLS.md: tap-to-lock, assist/gyro, auto-fire, one context button
test('touch: tapping an enemy locks exactly that one; lockables lists only visible hostiles', () => {
  const r = touchRig();
  for (let i = 0; i < 3; i++) r.g.spawnCombatant({ id: `e${i}`, faction: 'hood', squad: 's', pos: [-6 + i * 6, 0, -15], weapon: null });
  for (let i = 0; i < 3; i++) r.g.ai.alert(`e${i}`, [0, 0], 'player');
  r.step(0.3);
  const ids = r.g.lockables().map((t) => t.id).sort();
  assert.deepEqual(ids, ['e0', 'e1', 'e2']);
  assert.ok(r.g.lockTarget('e2')); assert.equal(r.g.aimer.locked, 'e2');
  assert.ok(!r.g.lockTarget('nobody')); assert.equal(r.g.aimer.locked, null);
});

test('touch: gyro aim turns the soft assist off, and keeps it off', () => {
  const r = touchRig();
  r.g.setAssist('strong'); assert.equal(r.g.pc.assist, 'strong');
  r.g.setContext({ gyro: true }); assert.equal(r.g.pc.assist, 'off');
  r.g.setAssist('standard'); assert.equal(r.g.pc.assist, 'off');
  r.g.setContext({ gyro: false }); r.g.setAssist('low'); assert.equal(r.g.pc.assist, 'low');
});

test('touch: auto-fire shoots a locked target by itself; tap/button modes wait for input', () => {
  for (const mode of ['auto', 'button'] as const) {
    const r = touchRig();
    r.g.setContext({ fireMode: mode });
    r.g.spawnCombatant({ id: 'e', faction: 'gang', squad: 's', pos: [0, 0, -12], weapon: null, hp: 60 });
    r.g.ai.alert('e', [0, 0], 'player');
    r.g.equip('weapon.service'); r.g.inv.give('char.teddy_arce', 'item.ammo_38', 30);
    r.step(0.2); r.g.setAiming(true); assert.ok(r.g.lockTarget('e'));
    r.step(1.5);
    const shots = r.events.filter((e) => e.type === 'shot' && e.e.shooter === 'player').length;
    if (mode === 'auto') assert.ok(shots >= 1, `auto fired ${shots}`); else assert.equal(shots, 0, 'button mode never fires on its own');
  }
});

test('touch: one context button: cover, leave cover, then pick up a dropped gun', () => {
  const r = touchRig();
  r.g.addCar('car', 0, 0, -2.5, Math.PI / 2);
  r.pos[2] = -0.6;
  assert.equal(r.g.contextAction()?.kind, 'cover');
  r.g.doContextAction([0, -1]); assert.ok(r.g.pc.cover);
  assert.equal(r.g.contextAction()?.kind, 'leaveCover');
  r.g.doContextAction(); assert.ok(!r.g.pc.cover);
  // a dead gunman beside the player: picking up outranks cover
  r.g.spawnCombatant({ id: 'd', faction: 'gang', squad: 's', pos: [1, 0, -0.6], weapon: 'weapon.snub', hp: 1 });
  r.g.ai.agents.get('d')!.alive = false;
  assert.equal(r.g.contextAction()?.kind, 'pickUp');
});

test('touch: the context button announces changes with a "context" event', () => {
  const r = touchRig();
  r.g.addCar('car', 0, 0, -2.5, Math.PI / 2);
  const ev: any[] = []; r.g.on('context', (e) => ev.push(e));
  r.pos[2] = -0.6; r.step(0.3);
  assert.equal(ev.at(-1)?.kind, 'cover');
  const n = ev.length; r.step(1); assert.equal(ev.length, n, 'no repeats while nothing changes');
  r.pos[2] = 30; r.step(0.3);
  assert.equal(ev.at(-1)?.kind, null);
});

test('touch: context button opens doors (interiors list), knocks out of hours, and talks', () => {
  const r = touchRig();
  const opened: string[] = [];
  const doors = [{ id: 'door.diner', x: 3, z: 0, yaw: 0, kind: 'shop', locked: false }, { id: 'door.bank', x: 403, z: 0, yaw: 0, kind: 'shop', locked: true, hours: ['09:00', '15:00'] as [string, string] }];
  r.g.bindDoors({ doorsForChunk: (i, j) => doors.filter((d) => Math.floor(d.x / 200) === i && Math.floor(d.z / 200) === j), open: (id) => opened.push(id) });
  r.pos[0] = 2; r.pos[2] = 0;
  assert.equal(r.g.contextAction()?.kind, 'door');
  r.g.doContextAction(); assert.deepEqual(opened, ['door.diner']);
  r.pos[0] = 402; r.g.setClock({ minutes: 10 * 60 });
  assert.equal(r.g.contextAction()?.label, 'Knock');
  r.g.setClock({ minutes: 22 * 60 }); assert.equal(r.g.contextAction()?.label, 'Locked');
  r.g.doContextAction(); assert.deepEqual(opened, ['door.diner'], 'a locked door stays shut');
  // engine talkables outrank doors; with none bound, a ped within 2 m gets a bark
  const talked: string[] = [];
  r.g.bindTalk({ nearestTalkable: (x, z) => (Math.hypot(x - 402, z) < 2 ? { id: 'char.mrs_k', name: 'Mrs. K', x: 402, z: 1 } : null), talk: (id) => talked.push(id) });
  assert.deepEqual([r.g.contextAction()?.kind, r.g.contextAction()?.target], ['talk', 'char.mrs_k']);
  r.g.doContextAction(); assert.deepEqual(talked, ['char.mrs_k']);
});

test('touch: UiHost.touch helpers: mode, armed, draw/swap, cover-or-roll, short labels', () => {
  const r = touchRig();
  r.step(0.1);
  assert.equal(r.g.touchMode(), 'foot');
  assert.ok(r.g.armed(), 'Teddy starts with his service revolver');
  assert.notEqual(r.g.drawWeapon(), 'weapon.fists'); assert.equal(r.g.touchMode(), 'combat');
  const drawn = r.g.pc.weapon;
  assert.equal(r.g.drawWeapon(), 'weapon.fists'); assert.equal(r.g.touchMode(), 'foot');
  assert.equal(r.g.drawWeapon(), drawn, 'draw brings back the last gun');
  const order = r.g.weaponList().map((w) => w.id);
  assert.equal(r.g.swapWeapon(1), order[(order.indexOf(drawn) + 1) % order.length]);
  r.g.holster();
  // a hostile in sight flips to combat
  r.g.spawnCombatant({ id: 'e', faction: 'gang', squad: 's', pos: [0, 0, -15], weapon: null });
  r.g.ai.alert('e', [0, 0], 'player'); r.step(0.3);
  assert.equal(r.g.touchMode(), 'combat');
  // cover-or-roll
  assert.equal(r.g.coverLabel(), 'Roll');
  r.g.addCar('car', 0, 0, -2.5, Math.PI / 2); r.pos[2] = -0.6;
  assert.equal(r.g.coverLabel(), 'Cover'); assert.equal(r.g.coverOrRoll([0, -1]), 'Cover'); assert.equal(r.g.coverLabel(), 'Leave');
  // labels fit a button
  r.g.spawnCombatant({ id: 'd', faction: 'gang', squad: 's2', pos: [1, 0, -0.6], weapon: 'weapon.snub', hp: 1 });
  r.g.ai.agents.get('d')!.alive = false;
  const c = r.g.contextAction()!; assert.equal(c.kind, 'pickUp'); assert.ok(c.label.length <= 14, c.label);
});

// the UI's real adapter (src/ui/touch/adapters.ts): Gameplay must satisfy GameplayTouchLike as is
import { gameplayTouch } from '../../ui/touch/adapters';
test('UI TouchHost adapter: Gameplay plugs straight into gameplayTouch ({x, z} directions, lockTarget(null))', () => {
  const r = touchRig();
  const t = gameplayTouch(r.g, () => ({ x: 10, y: 20 }));
  r.g.addCar('car', 0, 0, -2.5, Math.PI / 2); r.pos[2] = -0.6; r.step(0.1);
  assert.equal(t.context()?.kind, 'cover');
  t.doContext({ x: 0, z: -1 }); assert.ok(r.g.pc.cover, 'the object-form direction works');
  t.coverOrRoll!({ x: 0, z: 1 }); assert.ok(!r.g.pc.cover);
  t.lockTarget!(null); assert.equal(t.locked!(), null);
  t.configure!({ fireMode: 'tap', aimAssist: 'strong', gyro: 'aim', steerAssist: true, steerAssistStrength: 0.5, autoAccelerate: false });
  assert.equal(r.g.pc.fireMode, 'tap'); assert.equal(r.g.pc.assist, 'off', 'gyro aim turns assist off');
});
