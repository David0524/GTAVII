/**
 * Gameplay CPU benchmark (headless Node, this container's CPU; no GPU, no rendering).
 *   npx tsx tools/gameplay/bench.ts   → prints and writes shots/gameplay/bench.json
 * Budgets (brief): 12 combatants on High ≤ 1.5 ms; 6 on mobile Low; police+witness bookkeeping ≤ 0.3 ms.
 * Node on a desktop-class container core is roughly 2–4× faster than a mid-range phone's JS; the
 * mobile row is therefore also reported ×3 as a rough phone estimate (labelled as such).
 */
import fs from 'node:fs';
import path from 'node:path';
import { rig } from '../../src/gameplay/tests/harness';

function stats(xs: number[]) { const s = [...xs].sort((a, b) => a - b); const avg = xs.reduce((a, b) => a + b, 0) / xs.length; return { avg: +avg.toFixed(3), p95: +s[Math.floor(s.length * 0.95)].toFixed(3), p99: +s[Math.floor(s.length * 0.99)].toFixed(3), max: +s[s.length - 1].toFixed(3) }; }

function combat(n: number, quality: 'high' | 'low') {
  const r = rig('char.teddy_arce', { quality });
  r.g.addCar('car_p', 0, 0, -2.5, Math.PI / 2);
  for (let i = 0; i < 16; i++) r.g.addCover(`c${i}`, [-20 + (i % 8) * 5.5, 0.55, -14 - Math.floor(i / 8) * 9], [0.7, 0.55, 0.7], 0, 'wood');
  for (let i = 0; i < n; i++) r.g.spawnCombatant({ id: `e${i}`, faction: i % 3 === 0 ? 'hood' : 'gang', squad: i < n / 2 ? 'a' : 'b', pos: [-18 + i * 3, 0, -32], weapon: ['weapon.pistol', 'weapon.snub', 'weapon.pump', 'weapon.smg'][i % 4], melee: 'weapon.bat', ammo: 9999, hp: 1e6 });
  for (let i = 0; i < n; i++) r.g.ai.alert(`e${i}`, [0, 0], 'player');
  r.g.health.damage('player', { amount: 0, type: 'bullet' });
  (r.g.healthSys.state('player')!).maxHp = 1e9; r.g.healthSys.state('player')!.hp = 1e9; // keep the fight going
  r.g.equip('weapon.service'); r.pos[2] = -0.6; r.g.toggleCover([0, -1]);
  const total: number[] = [], combatMs: number[] = [];
  const dt = 1 / 60;
  let shots = 0; r.g.on('shot', () => shots++);
  for (let f = 0; f < 3600; f++) {
    if (f % 90 === 0) { r.g.setAiming(true); r.g.setFiring(true); }
    r.sim.update(dt); r.g.update(dt);
    if (f > 120) { total.push(r.g.timings.totalMs); combatMs.push(r.g.timings.combatMs); }
    if (r.g.currentGun()?.empty) r.g.inv.give('char.teddy_arce', 'item.ammo_38', 6);
  }
  const live = [...r.g.ai.agents.values()].filter((a) => a.alive).length;
  return { combatants: live, frames: total.length, combat: stats(combatMs), gameplayTotal: stats(total), shotsPerSecond: +(shots / 60).toFixed(1), aiStates: [...new Set([...r.g.ai.agents.values()].map((a) => a.state))] };
}

function police(peds: number) {
  const r = rig();
  r.sim.bounds = [-60, 60, -60, 60];
  for (let i = 0; i < peds; i++) r.sim.add(`p${i}`, ((i * 37) % 120) - 60, ((i * 53) % 120) - 60, { yaw: (i * 1.7) % 6.28 });
  for (let i = 0; i < 6; i++) r.g.addProp(`box${i}`, 'call_box', -50 + i * 20, 0, i % 2 ? 50 : -50);
  for (let i = 0; i < 4; i++) r.g.addProp(`booth${i}`, 'phone_booth', -45 + i * 30, 0, 0);
  for (let i = 0; i < 6; i++) r.g.registerPolice(i % 2 ? 'radio_car' : 'foot', 'pct.gramercy', -40 + i * 15, 30);
  r.g.equip('weapon.service');
  const ms: number[] = [], wit: number[] = [];
  const dt = 1 / 60;
  for (let f = 0; f < 3600; f++) {
    if (f % 600 === 10) { r.g.setAiming(true); r.g.setFiring(true); }
    if (f % 600 === 20) { r.g.setAiming(false); r.g.setFiring(false); r.pos[0] = ((f / 600) % 3) * 20 - 20; }
    r.sim.update(dt); r.g.update(dt);
    if (f > 30) { ms.push(r.g.timings.policeMs); }
    wit.push(r.g.witnesses.list.size);
  }
  return { peds, frames: ms.length, policeAndWitnesses: stats(ms), peakWitnesses: Math.max(...wit), units: r.g.policeSys.units.size, reports: r.g.police.reports.length };
}

const out = {
  note: 'CPU-only, headless Node in the build container (no GPU, no rendering). Gameplay main-thread cost only; physics and rendering are the engine\'s.',
  node: process.version, date: new Date().toISOString(),
  high12: combat(12, 'high'),
  low6: combat(6, 'low'),
  police400: police(400),
  police120: police(120),
};
const est = { combatLow6_phoneEstimate_ms: +(out.low6.combat.avg * 3).toFixed(3), police120_phoneEstimate_ms: +(out.police120.policeAndWitnesses.avg * 3).toFixed(3) };
const res = { ...out, phoneEstimateX3: est };
console.log(JSON.stringify(res, null, 2));
fs.mkdirSync(path.resolve(import.meta.dirname, '../../shots/gameplay'), { recursive: true });
fs.writeFileSync(path.resolve(import.meta.dirname, '../../shots/gameplay/bench.json'), JSON.stringify(res, null, 2));
