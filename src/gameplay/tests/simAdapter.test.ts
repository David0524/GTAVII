import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gameplay } from '../index';
import { type SimLike, type SimPedView, type SimPoliceView } from '../integration/simAdapter';
import { assignPursuit } from '../police/pursuit';

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
  assert.ok(g.mirror, 'bindSim builds the police mirror'); const mirror = g.mirror!; // g.update also drives it
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

test('pursuit tactics: one car tails, a second boxes only when the suspect is slowed, the rest cut off corners ahead', () => {
  const choke = (n: [number, number]) => [{ x: n[0] + 250, z: n[1], yaw: 0 }, { x: n[0] - 250, z: n[1], yaw: 0 }, { x: n[0], z: n[1] + 250, yaw: 0 }, { x: n[0], z: n[1] - 250, yaw: 0 }];
  const cars = [0, 1, 2, 3].map((i) => ({ id: `c${i}`, car: true, x: -30 - i * 20, z: 0, seesSuspect: i < 2 }));
  const fast = assignPursuit([...cars, { id: 'f', car: false, x: -10, z: 0, seesSuspect: true }], { x: 0, z: 0, vx: 15, vz: 0, inVehicle: true }, choke);
  const role = (a: typeof fast, id: string) => a.find((r) => r.id === id)!;
  assert.equal(role(fast, 'c0').role, 'tail');
  assert.equal(role(fast, 'c1').role, 'tail', 'no boxing at speed');
  assert.equal(role(fast, 'f').role, 'foot');
  assert.equal(role(fast, 'c2').role, 'cutoff'); assert.deepEqual(role(fast, 'c2').to, [250, 0], 'the corner ahead first');
  assert.ok(role(fast, 'c3').role === 'cutoff' && role(fast, 'c3').to![0] !== -250, 'never the corner behind');
  const slow = assignPursuit(cars, { x: 0, z: 0, vx: 2, vz: 0, inVehicle: true }, choke);
  assert.equal(role(slow, 'c1').role, 'box', 'stuck at a light: box them in');
  const onFoot = assignPursuit(cars.slice(0, 3), { x: 0, z: 0, vx: 0, vz: -5, inVehicle: false }, choke);
  assert.ok(onFoot.every((r) => r.role === 'cutoff'), 'cars cut off a runner instead of tailing on the sidewalk');
  assert.ok(!onFoot.some((r) => r.to![1] === 250), 'never the corner behind a runner');
  assert.equal(new Set(onFoot.map((r) => r.to?.join())).size, onFoot.length, 'one car per corner');
  const lost = assignPursuit(cars.map((c) => ({ ...c, seesSuspect: false })), { x: 0, z: 0, vx: 10, vz: 0, inVehicle: true }, choke);
  assert.ok(lost.every((r) => r.role === 'search'));
  assert.ok(lost[1].to![0] > lost[0].to![0], 'searchers spread along the route ahead');
});

test('pursuit tactics reach the sim: cut-off cars get urgent gotos, the tail car pursues', () => {
  const sim = new FakeSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  g.setContext({ vehicle: { id: 'car', kind: 'car', seat: 'driver' } as any });
  const units = [0, 1, 2].map((i) => g.registerPolice('radio_car', 'pct.gramercy', -40 - i * 30, 0, { corrupt: 0 }));
  for (let f = 0; f < 30; f++) { pos[0] += 0.5; for (const u of units) { u.state = 'pursuit'; u.lostFor = 0; } g.update(1 / 30); }
  const goals = units.map((u) => g.mirror!.roles.get(u.id)!.role);
  assert.deepEqual(goals.slice().sort(), ['cutoff', 'tail', 'tail']);
  const cut = units[goals.indexOf('cutoff')];
  const agent = [...sim.copGoals.entries()].map(([, gl]) => gl).find((gl) => gl.kind === 'goto' && gl.urgent);
  assert.ok(agent && agent.x > pos[0], `a cut-off car races ahead: ${JSON.stringify(agent)} (${cut.id})`);
});

test('sim mirror: a dispatched radio car is spawned responding (the sim starts it out of sight), a beat post where it stands', () => {
  const sim = new FakeSim(); const spawns: any[] = [];
  const orig = sim.spawnPolice.bind(sim); sim.spawnPolice = (o: any) => { spawns.push(o); return orig(o); };
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  g.registerPolice('foot', 'pct.gramercy', 50, 50, { corrupt: 0 });
  g.update(1 / 30);
  assert.equal(spawns.find((o) => o.kind === 'foot').respondTo, undefined, 'a beat post spawns where it stands');
  // a shooting called in: the precinct dispatches cars after its delay
  g.policeSys.file({ witness: 'w1', perp: 'player', kinds: ['shooting'], desc: { clothes: [] }, lastKnown: [10, 5], crimeAt: [10, 5], via: 'callbox', time: 0 } as any);
  for (let i = 0; i < 30 * 90 && !spawns.some((o) => o.kind === 'car'); i++) g.update(1 / 30);
  const car = spawns.find((o) => o.kind === 'car');
  assert.ok(car, 'a car was dispatched');
  assert.ok(car.respondTo && Math.hypot(car.respondTo.x - 10, car.respondTo.z - 5) < 30 && car.siren, `responding to the scene: ${JSON.stringify(car)}`);
});

test('sim parking: an owned car left at the kerb is registered; the sim writes the tickets, gameplay boots and impounds', () => {
  class ParkingSim extends FakeSim {
    hs = new Map<string, ((e: any) => void)[]>(); parked: any[] = [];
    on(t: string, cb: (e: any) => void) { (this.hs.get(t) ?? this.hs.set(t, []).get(t)!).push(cb); }
    fire(t: string, e: any) { for (const cb of this.hs.get(t) ?? []) cb(e); }
    parkingRule(x: number) { return x > 0 ? { kind: 'alternate_side', until: 660 } : { kind: 'ok' }; }
    registerParkedCar(id: string, x: number, z: number) { this.parked.push({ id, x, z }); }
  }
  const sim = new ParkingSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [5, 0, 0]; const T = 'char.teddy_arce';
  g.bindPlayer({ id: 'player', lead: T, position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  g.inv.addMoney(T, 300000); g.ownership.restockWeek(0);
  const l = g.ownership.lot[0]; const car = g.ownership.offer(T, l.id, l.ask).car!;
  g.enterCar(car, 'keys'); g.exitCar();
  assert.deepEqual(sim.parked[0], { id: car, x: 5, z: 0 });
  assert.deepEqual(g.parkingRuleAt(5, 0), { kind: 'alternate_side', until: 660 });
  // gameplay no longer writes its own alternate-side tickets...
  g.ownership.advance(1, 0, 8, 0);
  assert.equal(g.ownership.owned.get(car)!.tickets, 0);
  // ...the sim's enforcement does, and three unpaid is the boot (gameplay's rule)
  sim.fire('ticketIssued', { carId: car, reasons: ['alternate_side'], fine: 'minor', street: 'W 31st St' });
  sim.fire('ticketIssued', { carId: car, reasons: ['hydrant'], fine: 'major', street: 'W 31st St' });
  sim.fire('ticketIssued', { carId: car, reasons: ['alternate_side'], fine: 'minor', street: 'W 31st St' });
  const ow = g.ownership.owned.get(car)!;
  assert.equal(ow.tickets, 3); assert.ok(ow.booted);
  assert.equal(g.ownership.owed(ow), 1500 + 2500 + 1500, 'minor $15, major $25');
  sim.fire('vehicleTowed', { carId: car, truckId: 9, to: 'pound' });
  assert.equal(g.ownership.owned.get(car)!.parked, 'pound');
});

test('real intersections: pursuit corners and roadblocks come from the sim\'s lane graph', () => {
  class JunctionSim extends FakeSim {
    nearestIntersections(x: number, z: number) { return [{ id: 'j1', x: x + 30, z, dist: 30, signal: true, streets: ['A', 'B'], armYaw: [0] }, { id: 'j2', x: x + 200, z: z - 5, dist: 200, signal: true, streets: ['W 31st St', '8th Ave'], armYaw: [Math.PI / 2, 0] }]; }
  }
  const sim = new JunctionSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  const cps = g.policeSys.chokepoints([0, 0]);
  assert.equal(cps.length, 1, 'junctions under 60 m are too close to cut off');
  // the suspect is west of the junction: block the west arm (yaw pi/2 heads -x), 15 m out
  assert.ok(Math.abs(cps[0].x - 185) < 1e-6 && Math.abs(cps[0].z - -5) < 1e-6, `on the arm facing the suspect: ${JSON.stringify(cps[0])}`);
});

test('sidewalk bumps: an angry pedestrian sometimes shoves back; knockdowns are reckless, three in 30 s an assault', () => {
  const { sim, g, pos } = serviceRig();
  sim.peds.push({ id: 31, archetype: 'npc.commuter', x: 6, y: 0, z: -3, yaw: Math.PI / 2, speed: 0, state: 'walk', variant: 1, nerve: 0.9 });
  g.addProp('box', 'call_box', 30, 0, -10);
  let shoves = 0; g.on('notice', (e: any) => { if (e.kind === 'shovedBack') shoves++; });
  for (let i = 0; i < 40; i++) { sim.fire('pedBumped', { id: 40 + i, kind: 'stumble', response: 'angry', x: 1, z: 0, dirX: 1, dirZ: 0, by: 'player' }); g.update(1); }
  assert.ok(shoves >= 6 && shoves <= 24, `about a third shove back (${shoves}/40)`);
  const kinds: string[] = []; g.on('crimeWitnessed', (e: any) => kinds.push(JSON.stringify(e)));
  const crimesBefore = (g as any).crimeSeq ?? 0;
  for (let i = 0; i < 3; i++) sim.fire('pedBumped', { id: 90 + i, kind: 'knockdown', response: 'frightened', x: pos[0] + 1, z: pos[2], dirX: 1, dirZ: 0, by: 'player' });
  g.update(0.5);
  assert.ok(kinds.some((k) => k.includes('reckless')) && kinds.some((k) => k.includes('assault')), `reckless, then assault: ${kinds.length} witnessed (${crimesBefore})`);
});

class HandoffSim extends ServiceSim {
  released = new Set<number>(); acts: any[] = []; moves: any[] = []; reclaimed: number[] = []; vcmds: any[] = []; vnotes: any[] = [];
  releasePed(id: number) { this.released.add(id); return true; }
  pedAct(id: number, act: string) { this.acts.push({ id, act }); return true; }
  moveReleasedPed(id: number, x: number, z: number) { this.moves.push({ id, x, z }); }
  reclaimPed(id: number) { this.released.delete(id); this.reclaimed.push(id); }
  vendorCommand(id: string, c: any) { this.vcmds.push({ id, ...c }); }
  vendorNotice(n: any) { this.vnotes.push(n); }
}
function handoffRig() {
  const sim = new HandoffSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  return { sim, g, pos };
}

test('brawler hand-off: shoved twice, a pedestrian squares up; gameplay drives them, then hands them back when it ends', () => {
  const { sim, g, pos } = handoffRig();
  sim.peds.push({ id: 51, archetype: 'npc.dockworker', x: 1.2, y: 0, z: 0, yaw: 0, speed: 0, state: 'angry', variant: 1, nerve: 0.9 });
  let n = 0;
  while (!g.brawls.size && n < 200) { sim.fire('pedBumped', { id: 51, kind: 'stumble', response: 'angry', x: 1.2, z: 0, dirX: 1, dirZ: 0, by: 'player' }); g.update(1); n++; }
  assert.ok(g.brawls.has('brawl:51') && sim.released.has(51), 'released to gameplay as a brawler');
  assert.ok(sim.acts.some((a) => a.id === 51 && a.act === 'shove'), 'the first shove is animated by the sim');
  g.update(0.1); g.update(0.1);
  assert.ok(sim.moves.some((m) => m.id === 51), 'gameplay moves the released ped each frame');
  pos[0] = 60; for (let i = 0; i < 20; i++) g.update(0.2);
  assert.ok(!g.brawls.size && sim.reclaimed.includes(51), 'walk off and the sim gets them back');
});

test('vendors through the sim: sales and overturned carts are animated there; an unarmed robbery sometimes gets the hot-dog man swinging', () => {
  let swung = 0, fled = 0;
  for (let seed = 0; seed < 12; seed++) {
    const { sim, g } = handoffRig();
    (g as any).rng.state = 1000 + seed;
    g.loadVendorContent({ menus: { hot_dog: [{ item: 'Frank', price: '35¢' }] } });
    sim.peds.push({ id: 70, archetype: 'npc.vendor', x: 1, y: 0, z: 0, yaw: 0, speed: 0, state: 'work', variant: 1, nerve: 0.8 });
    sim.fire('vendorSpawned', { id: 'vendor:7th_31', kind: 'hot_dog', pedId: 70, crew: [], x: 1, z: 0, cart: null, licensed: true, goods: [], variant: 0, arriving: false });
    if (seed === 0) {
      assert.ok(g.buyFromVendor('vendor:7th_31', 'hot_dog.frank'));
      assert.deepEqual(sim.vnotes[0], { kind: 'vendorSale', vendor: 'vendor:7th_31', good: 'hot_dog.frank' });
      g.cartHit('vendor:7th_31', { by: 'car', speed: 8 });
      assert.equal(sim.vnotes.at(-1).kind, 'cartOverturned');
    }
    g.robVendor('vendor:7th_31');
    if (g.brawls.has('brawl:70')) swung++; else if (sim.vcmds.some((c) => c.type === 'flee')) fled++;
  }
  assert.ok(swung >= 2 && fled >= 2, `the hot-dog man fights back about half the time (${swung} swung, ${fled} fled)`);
});

// ---- greet / antagonize (the player's side of sim's memory greetings)
class TalkSim extends HandoffSim {
  rep = 0; mem: any[] = [];
  remember(kind: string, x: number, z: number, o: any = {}) { this.mem.push({ kind, x, z, ...o }); }
  reputation() { return { score: this.rep, last: null, ago: Infinity }; }
}
function talkRig(nerve: number) {
  const sim = new TalkSim();
  const g = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  const pos: [number, number, number] = [0, 0, 0];
  g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  g.bindSim(sim as any);
  sim.peds.push({ id: 7, archetype: 'npc.dockworker', x: 1.5, y: 0, z: 0, yaw: 0, speed: 0, state: 'walk', variant: 1, nerve });
  const replies: any[] = []; g.on('pedReply', (e: any) => replies.push(e));
  const barks: any[] = []; g.on('bark', (e: any) => barks.push(e));
  return { sim, g, pos, replies, barks };
}

test('greet: the context button says hello to a passer-by; the answer comes from the block\'s standing and what you did to them', () => {
  const { sim, g, replies, barks } = talkRig(0.8);
  const c = g.contextAction()!;
  assert.equal(c.kind, 'greet'); assert.equal(c.target, 'ped:7'); assert.equal(c.alt?.kind, 'antagonize');
  // most New Yorkers: a nod or nothing
  const ctx = new Set<string>();
  for (let i = 0; i < 30; i++) { (g as any).rapport.clear(); g.greet('ped:7'); ctx.add(replies.at(-1).context); }
  assert.deepEqual([...ctx].sort(), ['greet', 'ignore']);
  assert.ok(barks.some((b) => b.bark === 'barks.player_greet') && barks.some((b) => b.pool === 'barks.dockworker'), 'player line and the ped\'s pool');
  // greeted before: a warm hello
  g.greet('ped:7'); assert.equal(replies.at(-1).context, 'greet_known');
  // a block that likes you
  (g as any).rapport.clear(); sim.rep = 3; g.greet('ped:7'); assert.equal(replies.at(-1).context, 'greet_known');
  // a block that resents you: a steady one complains
  (g as any).rapport.clear(); sim.rep = -5; g.greet('ped:7'); assert.equal(replies.at(-1).context, 'complain');
  assert.equal(sim.mem.length, 0, 'a hello is not a favour: nothing remembered');
});

test('antagonize: a steady one gives it back, then shoves, then squares up (they start it: no crime); the street remembers', () => {
  const { sim, g } = talkRig(0.85);
  const crimes: any[] = []; g.on('crimeWitnessed', (e: any) => crimes.push(e));
  const a1 = g.doAltContextAction()!; assert.equal(a1.context, 'antagonize'); assert.equal(a1.escalated, 'none');
  assert.equal(sim.mem.at(-1).kind, 'bumped'); assert.equal(sim.mem.at(-1).pedId, 7);
  const a2 = g.antagonize('ped:7')!; assert.equal(a2.escalated, 'shove'); assert.ok(g.stumbling);
  const a3 = g.antagonize('ped:7')!; assert.equal(a3.escalated, 'brawl'); assert.ok(g.brawls.has('brawl:7') && sim.released.has(7));
  assert.equal(crimes.length, 0, 'mouthing off unarmed is no crime');
});

test('antagonize: a shy one backs off; with a gun out it is menacing and they hurry away', () => {
  const { sim, g, replies } = talkRig(0.3);
  const a = g.antagonize('ped:7')!; assert.equal(a.context, 'fear'); assert.equal(sim.goals.get(7).kind, 'goto');
  g.greet('ped:7'); // within ten minutes they remember
  assert.equal(replies.at(-1).context, 'fear'); assert.equal(replies.at(-1).recall, 'antagonized');
  const t2 = talkRig(0.9);
  t2.g.addProp('box', 'call_box', 30, 0, -10);
  t2.sim.peds.push({ id: 8, archetype: 'npc.commuter', x: 5, y: 0, z: -3, yaw: Math.PI, speed: 0, state: 'walk', variant: 1, nerve: 0.9 });
  t2.g.equip('weapon.service');
  const kinds: string[] = []; t2.g.on('crimeWitnessed', (e: any) => kinds.push(e.crime.kind));
  const b = t2.g.antagonize('ped:7')!;
  assert.equal(b.context, 'fear', 'nobody squares up to a gun');
  assert.ok(t2.sim.goals.get(7).urgent);
  assert.ok(kinds.includes('menacing'), kinds.join());
  // no greet offer with a gun drawn (combat mode)
  assert.notEqual(t2.g.contextAction()?.kind, 'greet');
});
