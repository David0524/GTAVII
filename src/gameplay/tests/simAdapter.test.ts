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
  on(_t: string, _cb: (e: any) => void) {}
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

/** The same fake plus the responder and cab APIs (sim claude/nice-sagan-2jh4m2). */
class ServiceSim extends FakeSim {
  hs = new Map<string, ((e: any) => void)[]>(); dispatched: [string, number, number][] = []; boarded: any[] = []; left: number[] = [];
  on(t: string, cb: (e: any) => void) { (this.hs.get(t) ?? this.hs.set(t, []).get(t)!).push(cb); }
  fire(t: string, e: any) { for (const cb of this.hs.get(t) ?? []) cb(e); }
  dispatch(role: 'ambulance' | 'fire', x: number, z: number) { this.dispatched.push([role, x, z]); return [900]; }
  callCab() { return 42; }
  boardCab(id: number, d: { x: number; z: number }) { this.boarded.push({ id, ...d }); return true; }
  leaveCab(id: number) { this.left.push(id); }
}
function serviceRig() {
  const sim = new ServiceSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  const ev: any[] = []; g.on('cab', (e) => ev.push(e));
  return { sim, g, pos, ev };
}

test('sim services: a real cab ride is called, boarded, metered by distance and paid on arrival', () => {
  const { sim, g, pos, ev } = serviceRig();
  const lead = 'char.teddy_arce'; const before = g.inv.ensure(lead).money;
  assert.ok(g.hailCab()); assert.ok(!g.hailCab(), 'one cab at a time');
  assert.ok(!g.boardCab(800, -400), 'cannot board before it pulls up');
  sim.fire('cabReady', { cabId: 42, x: 3, z: 0, kerb: 'east' });
  pos[0] = 3; assert.ok(g.boardCab(800, -400));
  assert.deepEqual(sim.boarded[0], { id: 42, x: 800, z: -400 });
  assert.equal(g.pc.vehicle?.id, 'cab:42');
  sim.fire('cabTurnAhead', { cabId: 42, dir: 'left', street: 'W 31st St', distance: 60 });
  sim.fire('cabRideArrived', { cabId: 42, x: 800, z: -400 });
  const arrived = ev.find((e) => e.kind === 'arrived');
  assert.ok(arrived.paid && arrived.fare > 0, JSON.stringify(arrived));
  assert.equal(before - g.inv.ensure(lead).money, arrived.fare + arrived.tip);
  assert.deepEqual(sim.left, [42]); assert.equal(g.cab, null); assert.equal(g.pc.vehicle, null);
  assert.deepEqual(ev.map((e) => e.kind), ['called', 'ready', 'boarded', 'turn', 'arrived']);
});

test('sim services: a broke rider stiffs the cabbie and the ride still ends; fires and shootings get responders once', () => {
  const { sim, g } = serviceRig();
  g.inv.ensure('char.teddy_arce').money = 0;
  g.hailCab(); sim.fire('cabReady', { cabId: 42, x: 0, z: 0 }); g.boardCab(500, 0);
  sim.fire('cabRideArrived', { cabId: 42, x: 500, z: 0 });
  assert.equal(g.cab, null);
  g.fire.start(10, 10, 'molotov', null); g.fire.start(12, 10, 'molotov', null);
  assert.equal(sim.dispatched.filter((d) => d[0] === 'fire').length, 1, 'one engine company per fire scene');
  g.addProp('box', 'call_box', 30, 0, -10);
  g.policeSys.file({ witness: 'w1', perp: 'player', kinds: ['shooting'], desc: { clothes: [] }, lastKnown: [5, 5], crimeAt: [5, 5], via: 'callbox', time: 0 } as any);
  g.policeSys.file({ witness: 'w2', perp: 'player', kinds: ['shooting'], desc: { clothes: [] }, lastKnown: [6, 5], crimeAt: [6, 5], via: 'callbox', time: 1 } as any);
  assert.deepEqual(sim.dispatched.filter((d) => d[0] === 'ambulance'), [['ambulance', 5, 5]]);
});
