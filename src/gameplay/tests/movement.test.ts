import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { allowed, locomotion, landing, bargeChance, IDLE_MOVER, STAMINA_COST, FALL, DRUNK, HEIGHTS, type MoveAction } from '../player/movement';

const ALL: MoveAction[] = ['sprint', 'vault', 'climb', 'fenceClimb', 'ladder', 'dropLadder', 'roofJump', 'hangDrop', 'turnstileVault', 'shoulderBarge', 'roll', 'cover', 'aim', 'fire', 'melee', 'enterVehicle', 'crouch'];

test('movement rules: a fit, sober, empty-handed lead can do everything; kerbs are autostep below any rule', () => {
  for (const a of ALL) assert.ok(allowed(a, IDLE_MOVER).ok, a);
  assert.ok(HEIGHTS.step >= 0.4 && HEIGHTS.vaultMin > HEIGHTS.step, 'a granite kerb (0.15-0.25 m) and a stoop step are taken in stride');
});

test('movement rules: carrying a body takes both hands (no climbing, guns, cover or the car), a bag only stops roof jumps', () => {
  const body = { ...IDLE_MOVER, carrying: 'body' as const };
  for (const a of ['sprint', 'vault', 'climb', 'fenceClimb', 'ladder', 'roofJump', 'aim', 'fire', 'melee', 'cover', 'enterVehicle', 'roll', 'shoulderBarge'] as MoveAction[]) assert.equal(allowed(a, body).ok, false, a);
  assert.equal(allowed('enterVehicle', body).reason, 'put it in the trunk');
  for (const a of ['crouch', 'hangDrop'] as MoveAction[]) assert.ok(allowed(a, body).ok, a);
  const bag = { ...IDLE_MOVER, carrying: 'bag' as const };
  for (const a of ['sprint', 'vault', 'climb', 'fenceClimb', 'ladder', 'aim', 'fire', 'cover', 'enterVehicle'] as MoveAction[]) assert.ok(allowed(a, bag).ok, `bag: ${a}`);
  assert.equal(allowed('roofJump', bag).reason, 'not with the bag');
  const crate = { ...IDLE_MOVER, carrying: 'crate' as const };
  assert.ok(allowed('sprint', crate).ok && allowed('cover', crate).ok && !allowed('aim', crate).ok && !allowed('vault', crate).ok);
});

test('movement rules: injuries, drink, breath, hands up and cuffs', () => {
  const leg = { ...IDLE_MOVER, limp: 0.9, legCrippled: true };
  for (const a of ['sprint', 'vault', 'climb', 'fenceClimb', 'roofJump', 'turnstileVault'] as MoveAction[]) assert.equal(allowed(a, leg).reason, 'bad leg', a);
  assert.ok(allowed('ladder', leg).ok, 'a ladder is arms');
  const arm = { ...IDLE_MOVER, armWear: 1.1 };
  for (const a of ['climb', 'fenceClimb', 'ladder', 'dropLadder'] as MoveAction[]) assert.equal(allowed(a, arm).reason, 'bad arm', a);
  assert.ok(allowed('vault', arm).ok && allowed('sprint', arm).ok);
  assert.equal(allowed('roofJump', { ...IDLE_MOVER, intox: DRUNK.tipsy }).reason, 'too drunk', 'no roof jumps after a couple');
  assert.equal(allowed('vault', { ...IDLE_MOVER, intox: DRUNK.drunk }).reason, 'too drunk');
  assert.equal(allowed('sprint', { ...IDLE_MOVER, intox: DRUNK.legless }).reason, 'too drunk');
  assert.ok(allowed('climb', { ...IDLE_MOVER, intox: DRUNK.drunk }).ok, 'a drunk can still get up a wall, slowly');
  assert.equal(allowed('climb', { ...IDLE_MOVER, staminaValue: STAMINA_COST.climb - 1 }).reason, 'out of breath');
  assert.ok(allowed('hangDrop', { ...IDLE_MOVER, staminaValue: 0, exhausted: true }).ok, 'you can always let go');
  for (const a of ALL) if (a !== 'crouch' && a !== 'hangDrop') assert.equal(allowed(a, { ...IDLE_MOVER, surrendered: true }).ok, false, `hands up: ${a}`);
  for (const a of ALL) if (a !== 'crouch') assert.equal(allowed(a, { ...IDLE_MOVER, cuffed: true }).reason, 'cuffed');
  assert.equal(allowed('sprint', { ...IDLE_MOVER, inCover: true }).reason, 'in cover');
});

test('locomotion: limp, drink, load and breath change speed, sway, turns, stops and stumbles', () => {
  const n = locomotion(IDLE_MOVER);
  assert.deepEqual([n.speedMul, n.swayDeg, n.turnMul, n.stopMul, n.stumbleOnStep, n.gait], [1, 0, 1, 1, 0, 'normal']);
  const limp = locomotion({ ...IDLE_MOVER, limp: 1, legCrippled: true });
  assert.ok(limp.speedMul <= 0.56 && !limp.canSprint && limp.gait === 'limp' && limp.stumbleOnStep > 0.2);
  const drunk = locomotion({ ...IDLE_MOVER, intox: 0.7 });
  assert.ok(drunk.swayDeg > 3 && drunk.turnMul < 0.9 && drunk.stopMul > 1.3 && drunk.stumblePerSprintS > 0 && drunk.gait === 'drunk');
  const legless = locomotion({ ...IDLE_MOVER, intox: 0.9 });
  assert.ok(!legless.canSprint && legless.speedMul <= 0.71 && legless.swayDeg >= 7);
  const body = locomotion({ ...IDLE_MOVER, carrying: 'body' });
  assert.ok(body.speedMul === 0.55 && body.gait === 'carry_heavy' && !body.canSprint);
  assert.equal(locomotion(IDLE_MOVER, 0.1).gait, 'tired');
});

test('landing: free below ~2.9 m, a roll halves it to 6 m, ragdoll from 6 m, about 14 m kills', () => {
  assert.equal(landing(FALL.safe - 0.1, false).damage, 0);
  const four = landing(4.5, false), fourRoll = landing(4.5, true);
  assert.ok(four.damage > 0 && fourRoll.damage <= Math.ceil(four.damage / 2) && fourRoll.rolled);
  assert.ok(!landing(8, true).rolled, 'no rolling out of a two-storey drop');
  assert.ok(landing(6, false).ragdoll && !landing(5.9, false).ragdoll);
  assert.ok(landing(14, false).damage >= 100, `five storeys (${landing(14, false).damage})`);
  assert.ok(landing(10, false).damage < 100, 'three storeys hurts, usually survivable');
});

test('shoulder barge: interior doors give, apartments sometimes, steel and the police lock never; strength helps', () => {
  assert.equal(bargeChance('steel', 100, IDLE_MOVER), 0);
  assert.equal(bargeChance('police_lock', 100, IDLE_MOVER), 0);
  assert.ok(bargeChance('interior', 50, IDLE_MOVER) > bargeChance('apartment', 50, IDLE_MOVER));
  assert.ok(bargeChance('apartment', 90, IDLE_MOVER) > bargeChance('apartment', 20, IDLE_MOVER));
  assert.ok(bargeChance('apartment', 50, { ...IDLE_MOVER, armWear: 0.8 }) < bargeChance('apartment', 50, IDLE_MOVER));
});

test('facade: the rules hold in play (body in hands, landings, barging a door is heard, the turnstile vault)', () => {
  const r = rig();
  r.g.setContext({ carrying: 'body' });
  r.g.equip('weapon.service'); r.g.setAiming(true);
  assert.equal(r.g.pc.aiming, false, 'no aiming with a body in your arms');
  assert.equal(r.g.canMove('climb').ok, false);
  assert.equal(r.g.locomotion().gait, 'carry_heavy');
  r.g.setContext({ carrying: 'none' });
  // stamina: a fence costs 18
  const st = r.g.stamina()!.value; assert.ok(r.g.traversed('fenceClimb')); assert.equal(Math.round(st - r.g.stamina()!.value), 18);
  assert.ok(r.g.traversed('ladder', 10)); // 16 for ten metres
  // a rolled drop off a 4.5 m fire-escape platform leaves the legs working; the turnstile vault is fare evasion
  r.g.landed(4.5, true);
  assert.ok(r.g.canMove('turnstileVault').ok, 'rolled: legs fine');
  assert.ok(r.g.vaultTurnstile()); assert.ok(r.g.pc.subway);
  r.g.setContext({ subway: false });
  // a two-storey drop without a roll breaks a leg: no sprint, no climbing
  const hp0 = r.g.health.get('player').hp; const l = r.g.landed(7)!;
  assert.ok(l.damage > 0 && l.ragdoll && r.g.health.get('player').hp < hp0);
  assert.equal(r.g.canMove('sprint').reason, 'bad leg'); assert.equal(r.g.canMove('climb').reason, 'bad leg');
  // barging somebody's door: a heard crime even when it holds
  r.g.addProp('box', 'call_box', 30, 0, -10);
  for (let i = 0; i < 3; i++) r.g.bargeDoor({ id: 'door.4b', kind: 'apartment' });
  assert.ok(r.events.some((e) => e.type === 'notice' && e.e.kind === 'barge'));
});

// ---- the tackle (foot-chase finisher; narrative's `finish: "tackle"`)
import { tackleChance, TACKLE } from '../player/movement';

test('tackle: a sprinting dive usually lands; walking, drunk, limping or diving at someone pulling away is worse', () => {
  const base = { sprinting: true, speed: 6, quarrySpeed: 5, strength: 50, s: IDLE_MOVER };
  assert.equal(tackleChance(base), TACKLE.base);
  assert.ok(tackleChance({ ...base, speed: 1.5, sprinting: false }) < 0.5);
  assert.ok(tackleChance({ ...base, quarrySpeed: 8 }) < TACKLE.base);
  assert.ok(tackleChance({ ...base, s: { ...IDLE_MOVER, intox: 0.7 } }) < TACKLE.base);
  assert.ok(tackleChance({ ...base, s: { ...IDLE_MOVER, limp: 0.5 } }) < TACKLE.base);
  assert.ok(tackleChance({ ...base, strength: 90 }) > TACKLE.base);
  assert.equal(allowed('tackle', { ...IDLE_MOVER, carrying: 'bag' }).ok, false);
});

test('tackle: the context button finishes a foot chase on the quarry; non-lethal; a lawful quarry is no crime; a bystander is an assault', () => {
  const r = rig();
  r.g.setContext({ device: 'touch' });
  r.g.spawnCombatant({ id: 'snatcher', faction: 'hood', squad: 'q', pos: [0, 0, -2], weapon: null, hp: 30 });
  r.g.setChaseTarget('snatcher', { catchDistanceM: 2.5, lawful: true });
  r.g.setContext({ speed: 6, sprinting: true });
  assert.equal(r.g.contextAction()?.kind, 'tackle');
  const got: any[] = []; r.g.on('tackle', (e) => got.push(e));
  r.g.doContextAction();
  // a dive can miss (15%): try again after the stumble, as a player would
  for (let i = 0; i < 6 && !got.some((e) => e.hit); i++) { r.step(1); r.g.tackle(); }
  assert.ok(got.some((e) => e.hit && e.target === 'snatcher' && e.quarry), JSON.stringify(got));
  assert.ok(r.g.ai.agents.get('snatcher')!.alive, 'non-lethal');
  assert.ok(r.g.ai.agents.get('snatcher')!.knockedOut, 'down and pinned');
  assert.ok(!r.g.policeSys.reports.length, 'a citizen\'s arrest is no crime');
  r.step(TACKLE.stun + 1);
  assert.ok(r.g.ai.agents.get('snatcher')!.knockedOut, 'a caught quarry stays down for the mission to resolve');
  // a bystander: assault, and they get up and run
  const r2 = rig();
  r2.g.addProp('box', 'call_box', 30, 0, -10);
  (r2.sim as any).add('ped_witness', 6, -4, { nerve: 0.9 });
  r2.g.spawnCombatant({ id: 'bystander', faction: 'hood', squad: 'b', pos: [0, 0, -1.5], weapon: null, hp: 40 });
  r2.g.setContext({ speed: 6, sprinting: true });
  const crimes: string[] = []; r2.g.on('crimeWitnessed', (e: any) => crimes.push(JSON.stringify(e)));
  r2.g.tackle();
  assert.ok(crimes.some((c) => c.includes('assault')), 'tackling a bystander is an assault');
  r2.step(TACKLE.stun + 1);
  assert.notEqual(r2.g.ai.agents.get('bystander')!.state, 'down', 'a bystander gets up and runs');
});

test('tackle: a miss sprawls you and still costs the breath', () => {
  const r = rig();
  r.g.setContext({ speed: 6, sprinting: true });
  const s0 = r.g.stamina()!.value;
  const res = r.g.tackle();
  assert.equal(res.reason, 'nobody in reach');
  assert.ok(r.g.stumbling);
  assert.equal(Math.round(s0 - r.g.stamina()!.value), 12);
  assert.equal(r.g.tackle().reason, 'down', 'no second dive while sprawled');
});

test('restrain: after the tackle, one button binds the quarry, they walk with you, and go in the car (skip_board)', () => {
  const r = rig();
  r.g.spawnCombatant({ id: 'skip', faction: 'hood', squad: 'q', pos: [0, 0, -1.5], weapon: null, hp: 40 });
  r.g.setChaseTarget('skip', { lawful: true });
  r.g.setContext({ speed: 6, sprinting: true });
  for (let i = 0; i < 8 && !r.g.ai.agents.get('skip')!.knockedOut; i++) { r.g.tackle(); r.step(1); }
  assert.ok(r.g.ai.agents.get('skip')!.knockedOut);
  assert.equal(r.g.contextAction()?.kind, 'restrain');
  r.g.doContextAction();
  assert.ok(r.g.restrained.has('skip'));
  assert.notEqual(r.g.contextAction()?.kind, 'tackle', 'a restrained skip is not tackled again');
  // walk 20 m: the skip follows at your side
  for (let i = 0; i < 40; i++) { r.pos[0] += 0.5; r.step(0.25, 0.05); }
  const a = r.g.ai.agents.get('skip')!;
  assert.ok(Math.hypot(a.pos[0] - r.pos[0], a.pos[2] - r.pos[2]) < 3, `escorted (${a.pos[0].toFixed(1)} vs ${r.pos[0]})`);
  assert.equal(a.state, 'surrender');
  r.g.cars.add({ id: 'bondsman_car', vclass: 'sedan', colour: 'black', x: r.pos[0] + 2, z: r.pos[2], owner: 'char.teddy_arce', locked: false, keysIn: true, driver: null });
  assert.equal(r.g.contextAction()?.kind, 'loadQuarry');
  r.g.doContextAction();
  assert.equal(r.g.restrained.get('skip')!.car, 'bondsman_car');
  assert.ok(r.events.some((e) => e.type === 'notice' && e.e.kind === 'quarryLoaded'));
});

test('breaking free: a skip tries to bolt (more when the escort lags or a gun comes out); mash to hold on, or chase them again', () => {
  const setup = () => {
    const r = rig();
    r.g.spawnCombatant({ id: 'skip', faction: 'hood', squad: 'q', pos: [0, 0, -1.5], weapon: null, hp: 40 });
    r.g.setChaseTarget('skip', { lawful: true });
    r.g.setContext({ speed: 6, sprinting: true });
    for (let i = 0; i < 8 && !r.g.ai.agents.get('skip')!.knockedOut; i++) { r.g.tackle(); r.step(1); }
    assert.ok(r.g.restrain('skip'));
    return r;
  };
  // a lagging, armed escort: a bolt comes within a few minutes
  const r = setup();
  r.g.equip('weapon.service');
  let bolt: any = null; r.g.on('notice', (e: any) => { if (e.kind === 'breakFree') bolt = e; });
  for (let i = 0; i < 3000 && !bolt; i++) { r.pos[0] += 0.4; r.step(0.1, 0.1); }
  assert.ok(bolt && bolt.window === 1.5 && bolt.presses === 4, 'a bolt with a mash window');
  assert.equal(r.g.contextAction()?.kind, 'holdOn', 'the one button becomes "Hold on!"');
  for (let i = 0; i < 4; i++) r.g.doContextAction();
  assert.equal(r.g.breakFree, null); assert.ok(r.g.restrained.has('skip'), 'held');
  // a failed hold: they're loose and the tackle is back on
  const r2 = setup();
  r2.g.breakFree = { id: 'skip', until: (r2.g as any).time + 0.2, presses: 0 };
  r2.step(0.5, 0.1);
  assert.ok(!r2.g.restrained.has('skip'));
  assert.equal(r2.g.ai.agents.get('skip')!.state, 'flee');
  assert.ok(r2.g.chaseTargets.has('skip'), 'a chase target again');
  // a story walk marked noBolt never tries (M26 o8c)
  const r3 = setup(); r3.g.setChaseTarget('skip', { lawful: true, noBolt: true }); r3.g.equip('weapon.service');
  let tried = false; r3.g.on('notice', (e: any) => { if (e.kind === 'breakFree') tried = true; });
  for (let i = 0; i < 3000; i++) { r3.pos[0] += 0.4; r3.step(0.1, 0.1); }
  assert.ok(!tried, 'noBolt');
});
