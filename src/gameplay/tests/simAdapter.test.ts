import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gameplay } from '../index';
import { PoliceMirror, type SimLike, type SimPedView, type SimPoliceView } from '../integration/simAdapter';

/** A fake with the sim stream's published shapes (src/sim/index.ts on claude/nice-sagan-2jh4m2). */
class FakeSim implements SimLike {
  peds: SimPedView[] = [];
  police: SimPoliceView[] = [];
  goals = new Map<number, any>(); copGoals = new Map<number, any>(); killed: number[] = [];
  private seq = 100;
  setGoal(id: number, g: any) { this.goals.set(id, g); return true; }
  kill(id: number) { this.killed.push(id); const p = this.peds.find((q) => q.id === id); if (p) p.state = 'dead'; return true; }
  spawnPolice(o: any) { const id = this.seq++; this.police.push({ id, kind: o.kind, x: o.x, z: o.z, yaw: 0, speed: 0, mode: 'idle', siren: !!o.siren, agentId: id }); return id; }
  setPoliceGoal(id: number, g: any) { this.copGoals.set(id, g); return true; }
  setSiren() {}
  despawnPolice(id: number) { this.police = this.police.filter((p) => p.id !== id); return true; }
  on() {}
  emit() {}
  vehicles: unknown[] = [];
}

test('sim adapter: witnesses run through setGoal, cops are sim agents gameplay steers, positions come back', () => {
  const sim = new FakeSim();
  sim.peds.push({ id: 7, archetype: 'npc.commuter', x: 8, y: 0, z: 0, yaw: Math.atan2(8, 0), speed: 0, state: 'walk', variant: 1, nerve: 0.9 });
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  g.addProp('box', 'call_box', 30, 0, -10);
  const mirror = new PoliceMirror(sim, g.policeSys);
  g.crime('shots_fired', { noise: 120 });
  for (let i = 0; i < 60; i++) { g.update(1 / 30); mirror.update(); }
  const goal = sim.goals.get(7);
  assert.ok(goal && (goal.kind === 'act' || goal.kind === 'goto' || goal.kind === 'flee'), `ped 7 was steered: ${JSON.stringify(goal)}`);
  const cop = g.registerPolice('foot', 'pct.gramercy', 50, 50, { corrupt: 0 });
  g.update(1 / 30); mirror.update();
  const agent = sim.police.find((p) => p.x === 50 && p.z === 50)!;
  assert.ok(agent, 'a sim agent stands in for the cop');
  assert.equal(sim.copGoals.get(agent.id).kind, 'patrol', 'a beat post patrols');
  agent.x = 55; agent.z = 52; // the sim walked him
  g.update(1 / 30); mirror.update();
  assert.equal(cop.x, 55, 'gameplay reads the position back');
  g.policeSys.units.delete(cop.id); mirror.update();
  assert.ok(!sim.police.some((p) => p.id === agent.id), 'despawned with the unit');
});
