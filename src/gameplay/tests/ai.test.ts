import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';

/** The shooting lot: the player behind a parked car, a gang across the lot among crates and a newsstand. */
export function lot(n = 4, faction: 'gang' | 'hood' | 'corrupt_cop' = 'gang') {
  const r = rig();
  r.g.addCar('car_p', 0, 0, -2.5, Math.PI / 2);
  const crates: [number, number][] = [[-8, -22], [-3, -24], [3, -23], [8, -21], [-12, -16], [12, -15], [-15, -8], [15, -9], [0, -14]];
  crates.forEach(([x, z], i) => r.g.addCover(`crate${i}`, [x, 0.55, z], [0.7, 0.55, 0.7], 0, 'wood'));
  r.g.addCover('wallL', [-18, 1, -12], [0.3, 1, 3], 0, 'brick');
  for (let i = 0; i < n; i++) r.g.spawnCombatant({ id: `e${i}`, faction, squad: 'crew', pos: [-6 + i * 4, 0, -30], weapon: i % 2 ? 'weapon.pistol' : 'weapon.snub', melee: 'weapon.bat', ammo: 30, leader: i === 0 });
  r.g.equip('weapon.service');
  r.pos[2] = -0.6; // crouched behind the car
  r.g.toggleCover([0, -1]);
  for (let i = 0; i < n; i++) r.g.ai.alert(`e${i}`, [0, 0], 'player');
  return r;
}

test('enemy AI: takes cover, respects attack tokens, suppresses and flanks, barks', () => {
  const r = lot(6);
  const states = new Set<string>();
  let maxConcurrent = 0;
  const shooters = new Map<number, Set<string>>();
  r.g.on('shot', (e) => { if (!e.player) { const k = Math.floor(r.g.now * 2); if (!shooters.has(k)) shooters.set(k, new Set()); shooters.get(k)!.add(e.shooter); } });
  r.step(40, 1 / 30, () => { for (const a of r.g.ai.agents.values()) states.add(a.state); });
  for (const s of shooters.values()) maxConcurrent = Math.max(maxConcurrent, s.size);
  for (const s of ['moveToCover', 'inCover', 'peek']) assert.ok(states.has(s), `used ${s} (${[...states]})`);
  assert.ok(states.has('suppress') || states.has('flank'), `suppress or flank (${[...states]})`);
  const peekers = [...r.g.ai.agents.values()].filter((a) => a.token).length;
  assert.ok(peekers <= 3, `tokens capped (${peekers})`);
  assert.ok(maxConcurrent <= 5, `few distinct shooters per half-second window (${maxConcurrent})`);
  const barks = new Set(r.events.filter((e) => e.type === 'bark').map((e) => e.e.bark));
  assert.ok(barks.has('spotted'));
  assert.ok(!r.g.health.get('player').injuries.includes('dead'), 'player in cover survives 40 s of a six-man crew');
});

test('enemy AI: morale breaks — the last man surrenders or runs instead of fighting to the death', () => {
  let broke = 0;
  for (let k = 0; k < 4; k++) {
    const r = lot(4, k % 2 ? 'gang' : 'hood');
    r.step(3);
    for (const id of ['e0', 'e1', 'e2']) r.g.health.damage(id, { amount: 999, region: 'torso', type: 'bullet', source: 'player' });
    r.g.health.damage('e3', { amount: 45, region: 'leg_r', type: 'bullet', source: 'player' });
    r.step(8);
    const s = r.g.ai.agents.get('e3')!.state;
    if (s === 'surrender' || s === 'flee' || s === 'retreat') broke++;
  }
  assert.ok(broke >= 3, `morale broke in ${broke}/4`);
});

test('first shots from a new angle are a warning: early accuracy is low, it tightens with tracking', () => {
  const r = lot(1, 'hood');
  r.g.toggleCover(null); r.pos[2] = 6; // stand in the open, away from the car
  const hits: number[] = [], shots: number[] = [];
  r.g.on('shot', (e) => { if (!e.player) shots.push(r.g.now); });
  r.g.on('hit', (e) => { if (e.target === 'player') hits.push(r.g.now); });
  r.step(20);
  assert.ok(shots.length >= 6, `it shoots (${shots.length})`);
  const firstHit = hits[0] ?? Infinity;
  assert.ok(firstHit > shots[0], 'the first shot misses');
});

test('melee AI: an unarmed hood closes in and swings; the player can parry it', () => {
  const r = rig();
  r.g.spawnCombatant({ id: 'm', faction: 'hood', squad: 's', pos: [0, 0, -8], weapon: null, melee: 'weapon.fists' });
  r.g.ai.alert('m', [0, 0], 'player');
  const melee: any[] = []; r.g.on('melee', (e) => melee.push(e));
  // watch for the windup telegraph and parry it
  let parried = false;
  r.step(10, 1 / 60, () => {
    const w = melee.find((e) => e.kind === 'windup' && e.id === 'm' && !e._seen);
    if (w) { w._seen = true; w._at = r.g.now; }
    // a human-like 0.22 s reaction after the telegraph starts
    const pend = melee.find((e) => e._seen && !e._done && r.g.now - e._at >= 0.22);
    if (pend) { pend._done = true; r.g.block(true); }
    if (melee.some((e) => e.kind === 'parried')) parried = true;
    const f = r.g.melee.fighters.get('player')!; if (f.blocking && r.g.melee.time - f.blockStart > 0.3) r.g.block(false);
  });
  assert.ok(melee.some((e) => e.kind === 'windup' && e.id === 'm'), 'telegraphed');
  assert.ok(parried, 'reacting to the telegraph parries');
});

test('police budget: a quality preset caps live combatants', () => {
  const r = rig('char.teddy_arce', { quality: 'low' });
  let n = 0; for (let i = 0; i < 10; i++) if (r.g.spawnCombatant({ id: `x${i}`, faction: 'gang', squad: 'a', pos: [i, 0, -20], weapon: 'weapon.pistol' })) n++;
  assert.equal(n, 6);
});
