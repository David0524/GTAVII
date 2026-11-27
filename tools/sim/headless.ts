/**
 * Deterministic headless test of the ambient simulation (CPU only, no rendering).
 *   npm run test:sim [-- --minutes 10 --seed 1974]
 *
 * Runs N simulated minutes at the fixed step while the focus tours Flatiron -> Herald Square ->
 * 42nd St & 7th Ave, with threats, a blocked lane, a closed street and moving external actors.
 * Checks are independent of the sim's own bookkeeping where possible (geometry from chunk ground
 * polygons, signal state recomputed from the lane graph):
 *   - vehicles: centre on roadway ground and within the lane band of their link; travel matches the
 *     1974 one-way; never cross a stop line on red; no vehicle-vehicle overlap; no deadlock
 *     (no non-dwelling vehicle stationary > 180 s, flow never stops network-wide)
 *   - pedestrians: never inside a building; off the roadway unless crossing/jaywalking
 *   - determinism: two runs with the same seed produce identical state hashes
 * Writes docs/sim_test_report.json. Exit code 1 on failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Simulation, SIM_DT } from '../../src/sim/index.ts';
import { readChunk, GroundKind } from '../../src/shared/chunkFormat.ts';
import { CHUNK_SIZE } from '../../src/shared/geo.ts';
import { edgeDistance } from '../../src/shared/bounds.ts';
import { pointInPolygon, projectOnPoly, sampleAt } from '../../src/sim/geom.ts';
import { LinkKind } from '../../src/sim/laneFormat.ts';
import { Sig } from '../../src/sim/network.ts';
import { setTerrainData } from '../../src/shared/terrain.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'public/data');
const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MINUTES = +arg('minutes', '10');
const SEED = +arg('seed', '1974');

{ const tb = fs.readFileSync(path.join(DATA, 'terrain.bin')); setTerrainData(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)); } // engine E-response to sim request 6
const fetchBinary = async (p: string) => { const b = fs.readFileSync(path.join(DATA, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// ------------------------------------------------------------------ ground polygons
interface PolyW { rings: Float32Array[]; minX: number; minZ: number; maxX: number; maxZ: number }
const world = JSON.parse(fs.readFileSync(path.join(DATA, 'world.json'), 'utf8'));
const GR = world.region;
const inside = (x: number, z: number) => x > GR.minX + 1 && x < GR.maxX - 1 && z > GR.minZ + 1 && z < GR.maxZ - 1;
const bld: PolyW[] = [], road: PolyW[] = [];
for (const c of world.chunks) {
  const b = fs.readFileSync(path.join(DATA, 'chunks', `${c.key}.bin`));
  const d = readChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const ox = (d.i + 0.5) * CHUNK_SIZE, oz = (d.j + 0.5) * CHUNK_SIZE;
  const conv = (rings: Float32Array[]): PolyW => {
    const out = rings.map((r) => r.map((v, k) => v + (k % 2 ? oz : ox)));
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let k = 0; k < out[0].length; k += 2) { minX = Math.min(minX, out[0][k]); maxX = Math.max(maxX, out[0][k]); minZ = Math.min(minZ, out[0][k + 1]); maxZ = Math.max(maxZ, out[0][k + 1]); }
    return { rings: out, minX, minZ, maxX, maxZ };
  };
  for (const x of d.buildings) if (x.minHeight < 3) bld.push(conv(x.rings));
  for (const g of d.ground) if (g.kind === GroundKind.Road) road.push(conv(g.rings));
}
class Idx {
  cells = new Map<string, PolyW[]>();
  constructor(list: PolyW[], private cs = 40) {
    for (const p of list) for (let i = Math.floor(p.minX / cs); i <= Math.floor(p.maxX / cs); i++) for (let j = Math.floor(p.minZ / cs); j <= Math.floor(p.maxZ / cs); j++) (this.cells.get(`${i},${j}`) ?? this.cells.set(`${i},${j}`, []).get(`${i},${j}`)!).push(p);
  }
  has(x: number, z: number) { for (const p of this.cells.get(`${Math.floor(x / this.cs)},${Math.floor(z / this.cs)}`) ?? []) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ && pointInPolygon(p.rings, x, z)) return true; return false; }
}
const inBuilding = new Idx(bld), onRoad = new Idx(road);

// ------------------------------------------------------------------ tour
const FOCI = [
  { name: 'Flatiron spawn', x: world.spawn.x, z: world.spawn.z },
  { name: 'Herald Square', x: -380, z: -915 },
  { name: '42nd St & 7th Ave', x: -605, z: -1548 },
];

function hashState(sim: Simulation): string {
  const { vehicles, peds } = sim.debugAgents();
  let h = 2166136261;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
  for (const v of vehicles) { mix(v.id); mix(v.link); mix(v.s); mix(v.v); }
  for (const p of peds) { mix(p.id); mix(p.edge); mix(p.x); mix(p.z); }
  return (h >>> 0).toString(16) + `:${vehicles.length}/${peds.length}`;
}

async function run(opts: { seconds: number; maxVehicles: number; maxPeds: number; checks: boolean; label: string; clock?: number; day?: number }) {
  const sim = new Simulation({ seed: SEED, maxVehicles: opts.maxVehicles, maxPeds: opts.maxPeds, fetchBinary });
  await sim.load();
  sim.setClock(opts.clock ?? 17 * 60 + 30);
  if (opts.day !== undefined) sim.setDay(opts.day);
  const net = sim.network, g = net.g;
  const events: Record<string, number> = {};
  const hooks = { escorts: 0, gotos: 0, witnesses: 0, police: 0, acts: 0, kills: 0, stolen: 0, fire: 0, cab: -1, parkRule: '' };
  for (const t of ['escortProgress', 'escortDone', 'goalReached', 'policeArrived', 'policeBlocked', 'vehicleStolen', 'dispatched', 'responderArrived', 'responderLeft', 'mailStop', 'iceCreamStop', 'iceCreamChime', 'cabCalled', 'cabReady', 'cabDeparted', 'cabTurnAhead', 'cabRideArrived', 'cabGaveUp', 'ticketIssued', 'towDispatched', 'vehicleTowed', 'sweeperOut', 'trainArriving', 'trainDeparted']) sim.on(t, () => { events[t] = (events[t] ?? 0) + 1; });
  for (const t of ['honk', 'collision', 'nearMiss', 'hail', 'jaywalk', 'doubleParked', 'pickup', 'dropoff', 'busStop', 'subwayExit', 'subwayEnter', 'dodge']) sim.on(t, () => { events[t] = (events[t] ?? 0) + 1; });
  const fail: Record<string, number> = { vehOffRoad: 0, vehOffLane: 0, wrongWay: 0, redLight: 0, vehOverlap: 0, pedInBuilding: 0, pedOffSidewalk: 0, pedHitByVehicle: 0, beyondEdge: 0, badHeight: 0, animalInBuilding: 0, animalOnRoad: 0 };
  const examples: Record<string, string[]> = {};
  const seen = new Set<string>();
  const note = (k: string, s: string) => { fail[k]++; const key = k + s.split(' at ')[0].split(' ')[0]; if (seen.has(key)) return; seen.add(key); (examples[k] ??= []).length < 8 && examples[k].push(s); };
  const prevLink = new Map<number, number>(), still = new Map<number, number>();
  let maxStill = 0, maxStillWho = '', minMovingFrac = 1, flowSamples = 0, movingSum = 0;
  const times: number[] = [];
  const steps = Math.round(opts.seconds / SIM_DT);
  const o = [0, 0, 0, 0];
  let wildPeak = 0, powerChangedAt = -1, doorSeg = -1;
  let fi = 0, actorSeg = -1, walkE = -1, carL = -1, carS = 0;
  for (let k = 0; k < steps; k++) {
    const t = k * SIM_DT;
    const seg = Math.floor(t / (opts.seconds / FOCI.length));
    if (seg !== fi && seg < FOCI.length) fi = seg;
    const f = FOCI[fi];
    // scripted events
    if (k === Math.round(90 / SIM_DT)) sim.emit({ type: 'threat', x: f.x + 10, z: f.z - 30, radius: 25 });
    if (k === Math.round(150 / SIM_DT)) sim.emit({ type: 'blockLane', x: f.x, z: f.z - 60, until: sim.time + 90 });
    if (k === Math.round(260 / SIM_DT)) sim.emit({ type: 'closeStreet', x: f.x, z: f.z - 80, radius: 20, until: sim.time + 60 });
    // brownout: dark signals = all-way stops (narrative N2)
    if (k === Math.round(200 / SIM_DT)) { sim.setSignalPower({ x: f.x, z: f.z, radius: 180 }, false); powerChangedAt = sim.time; }
    if (k === Math.round(330 / SIM_DT)) { sim.setSignalPower({ x: f.x, z: f.z, radius: 5000 }, true); powerChangedAt = sim.time; }
    if (k === Math.round(420 / SIM_DT)) { sim.emit({ type: 'gunfire', x: f.x + 20, z: f.z, loudness: 150 }); hooks.witnesses = sim.perceive({ x: f.x + 20, z: f.z, loudness: 150, visibility: 60 }).peds.length; }
    // police (gameplay API): urgent siren run, roadblock, foot pursuit of the player, foot patrol; then act / kill / stolen car
    if (k === Math.round(440 / SIM_DT)) {
      const a = sim.spawnPolice({ kind: 'car', x: f.x, z: f.z + 120, siren: true });
      if (a >= 0) { hooks.police++; sim.setPoliceGoal(a, { kind: 'goto', x: f.x, z: f.z - 150, urgent: true }); }
      const b = sim.spawnPolice({ kind: 'car', x: f.x + 60, z: f.z + 60 });
      if (b >= 0) { hooks.police++; sim.setPoliceGoal(b, { kind: 'roadblock', x: f.x, z: f.z - 60 }); }
      const c = sim.spawnPolice({ kind: 'foot', x: f.x + 20, z: f.z });
      if (c >= 0) { hooks.police++; sim.setPoliceGoal(c, { kind: 'pursue', target: 'player', maxSpeed: 4 }); }
      const d = sim.spawnPolice({ kind: 'foot', x: f.x - 30, z: f.z });
      if (d >= 0) { hooks.police++; sim.setPoliceGoal(d, { kind: 'patrol', around: [f.x, f.z], radius: 70 }); }
      const e = sim.spawnPolice({ kind: 'foot', x: f.x, z: f.z + 30 });
      if (e >= 0) { hooks.police++; sim.setPoliceGoal(e, { kind: 'goto', x: f.x + 10, z: f.z - 20, urgent: true, maxSpeed: 3.5 }); }
    }
    if (k === Math.round(470 / SIM_DT)) {
      const ps = sim.debugAgents().peds.filter((p) => p.state === 'walk' && !p.cop2);
      if (ps[0]) hooks.acts += sim.setGoal(ps[0].id, { kind: 'act', name: 'use_callbox', duration: 8 }) ? 1 : 0;
      if (ps[1]) hooks.kills += sim.kill(ps[1].id, 30) ? 1 : 0;
      const car = sim.debugAgents().vehicles.find((v) => v.kind === 'car' && v.state === 'drive' && Math.hypot(v.x - f.x, v.z - f.z) < 80);
      if (car && sim.takeVehicle(car.id)) hooks.stolen++;
    }
    // doors (as the engine would feed them from interiors): storefront spots near the focus stand in for shop doors
    if (k === 0 || seg !== doorSeg) {
      doorSeg = seg;
      const doors = g.spots.filter((sp) => sp.kind === 0 && Math.hypot(sp.x - f.x, sp.z - f.z) < 140).slice(0, 40)
        .map((sp, i) => ({ id: `door_${seg}_${i}`, x: sp.x + Math.sin(sp.heading) * 0.4, z: sp.z + Math.cos(sp.heading) * 0.4, kind: ['diner', 'bodega', 'bar', 'clothing', 'office_lobby', 'tenement', 'deli', 'cinema_lobby'][i % 8], locked: i % 8 === 5 && i % 16 === 5, hours: ['07:00', '22:00'] as [string, string] }));
      sim.clearDoors(); sim.setDoors(doors);
    }
    // a (player's) car left at a hydrant: ticket, then tow
    if (k === Math.round(5 / SIM_DT)) {
      const h = sim.hydrantsNear(f.x, f.z, 120)[0];
      if (h) { sim.registerParkedCar('player_car', h.x + 1, h.z); hooks.parkRule = sim.parkingRule(h.x + 1, h.z).reasons.join('; '); }
    }
    // emergency + player cab ride (seg 0 at the Flatiron, so the ride has time)
    if (k === Math.round(20 / SIM_DT)) {
      hooks.fire = sim.dispatch('fire', f.x + 40, f.z - 80).length;
      hooks.cab = sim.callCab(f.x + 8, f.z);
      sim.on('cabReady', (e) => { if (e.cabId === hooks.cab) sim.boardCab(e.cabId, { x: f.x - 250, z: f.z - 350 }); });
      sim.on('cabRideArrived', (e) => { if (e.cabId === hooks.cab) sim.leaveCab(e.cabId); });
    }
    if (k === Math.round(590 / SIM_DT)) for (const pv of [...sim.police]) sim.despawnPolice(pv.id);
    // escort + goto goals on two nearby peds (narrative N4, gameplay scripted goals)
    if (k === Math.round(30 / SIM_DT) || k === Math.round(230 / SIM_DT) || k === Math.round(430 / SIM_DT)) {
      const ps = sim.debugAgents().peds.filter((p) => p.state === 'walk' && Math.hypot(p.x - f.x, p.z - f.z) < 60);
      if (ps[0]) hooks.escorts += sim.escort(ps[0].id, [{ x: f.x, z: f.z - 90 }, { x: f.x + 80, z: f.z - 90 }], { target: 'player', waitRadius: 400 }) ? 1 : 0;
      if (ps[1]) hooks.gotos += sim.setGoal(ps[1].id, { kind: 'goto', x: f.x - 60, z: f.z + 40, speed: 3.5 }) ? 1 : 0;
    }
    // external actors: the player walking a nearby sidewalk (ping-pong) and a scripted car following lanes
    if (k === 0 || seg !== actorSeg) {
      actorSeg = seg;
      walkE = net.sidewalkIds.reduce((b, e) => { const p = g.walkEdges[e].pts; const d = Math.hypot(p[0] - f.x, p[1] - f.z); return d < b[1] && net.walkLen[e] > 40 ? [e, d] : b; }, [-1, Infinity])[0];
      carL = net.laneIds.reduce((b, l) => { const p = g.links[l].pts; const d = Math.hypot(p[0] - f.x, p[1] - f.z); return d < b[1] && net.len[l] > 40 ? [l, d] : b; }, [-1, Infinity])[0]; carS = 0;
    }
    const wl = net.walkLen[walkE], ws = (t * 1.4) % (2 * wl), wsp = ws < wl ? ws : 2 * wl - ws;
    sampleAt(g.walkEdges[walkE].pts, net.walkCum[walkE], wsp, o);
    const pdir = ws < wl ? 1 : -1, px = o[0], pz = o[1], pvx = o[2] * 1.4 * pdir, pvz = o[3] * 1.4 * pdir;
    carS += 8 * SIM_DT;
    while (carS > net.len[carL]) { carS -= net.len[carL]; const L = g.links[carL]; carL = L.kind === LinkKind.Lane ? L.next[k % L.next.length] : L.next[0]; }
    sampleAt(g.links[carL].pts, net.cum[carL], carS, o);
    sim.setExternalActors([
      { id: 'player', x: px, z: pz, vx: pvx, vz: pvz, radius: 0.4, kind: 'player' },
      { id: 'scripted_car', x: o[0], z: o[1], vx: o[2] * 8, vz: o[3] * 8, radius: 1.3, kind: 'vehicle', siren: seg === 1 },
    ]);
    const t0 = performance.now();
    sim.update(SIM_DT, f);
    times.push(performance.now() - t0);
    if (!opts.checks || k % 2) continue;
    const { vehicles, peds } = sim.debugAgents();
    let moving = 0;
    for (const a of [...vehicles, ...peds]) if (edgeDistance(a.x, a.z) < -3) note('beyondEdge', `#${a.id} at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
    for (const a of [...sim.vehicles, ...sim.peds]) if (!Number.isFinite(a.y) || Math.abs(a.y) > 40) note('badHeight', `#${a.id} y=${a.y}`);
    for (const v of vehicles) {
      const L = g.links[v.link];
      // roadway + lane band
      if (inside(v.x, v.z) && !onRoad.has(v.x, v.z)) note('vehOffRoad', `#${v.id} ${v.kind} at ${v.x.toFixed(1)},${v.z.toFixed(1)} link ${v.link}`);
      const pr = projectOnPoly(L.pts, v.x, v.z);
      const tol = L.width / 2 + Math.abs(v.lat) + (v.lcT < 1 ? L.width : 0) + 0.6;
      if (pr.d > tol) note('vehOffLane', `#${v.id} ${v.kind}/${v.vclass}/${v.state} lat${v.lat.toFixed(2)} lc${v.lcT.toFixed(2)}from${v.lcFrom} prev${v.prevLink} s${v.s.toFixed(1)}/${net.len[v.link].toFixed(1)} k${L.kind} cop:${v.cop?.mode ?? '-'} ${pr.d.toFixed(2)} m from link ${v.link} (tol ${tol.toFixed(2)})`);
      // wrong way: lane direction must follow the road's 1974 one-way, and heading must follow the lane
      if (L.kind === LinkKind.Lane) {
        const R = g.roads[L.owner];
        if (R.oneway !== 0 && L.dir !== R.oneway) note('wrongWay', `#${v.id} on lane ${v.link} of ${net.roadName(L.owner)} against its one-way`);
      }
      sampleAt(L.pts, net.cum[v.link], v.s, o);
      if (-Math.sin(v.yaw) * o[2] + -Math.cos(v.yaw) * o[3] < 0.5) note('wrongWay', `#${v.id} heading against link ${v.link}`);
      // red light: entered a connector from a lane while red
      const pl = prevLink.get(v.id);
      if (pl !== undefined && pl !== v.link && g.links[pl].kind === LinkKind.Lane && (g.links[v.link].kind === LinkKind.Connector || g.links[pl].group !== g.links[v.link].group)) {
        // crossed the stop line during the last two steps: check both step times
        // signals are re-evaluated with today's power state; skip the instant power was switched (a car that crossed a dead signal is legal)
        const red = sim.time - powerChangedAt > 0.2 && net.laneSignal(pl, sim.time) === Sig.Red && net.laneSignal(pl, sim.time - SIM_DT) === Sig.Red && net.laneSignal(pl, sim.time - 2 * SIM_DT) === Sig.Red;
        if (red && !v.cop?.siren) note('redLight', `#${v.id} ran red from lane ${pl} at t=${sim.time.toFixed(1)}`);
      }
      prevLink.set(v.id, v.link);
      // deadlock bookkeeping
      const dwell = v.state !== 'drive';
      if (v.v < 0.1 && !dwell) { const s = (still.get(v.id) ?? 0) + 2 * SIM_DT; still.set(v.id, s); if (s > maxStill) { maxStill = s; maxStillWho = `#${v.id} ${v.kind} ${v.blockedBy} link ${v.link}`; } }
      else still.set(v.id, 0);
      if (v.v > 0.5) moving++;
    }
    // overlaps (oriented boxes, shrunk 0.3 m)
    for (let a = 0; a < vehicles.length; a++) for (let b = a + 1; b < vehicles.length; b++) {
      const A = vehicles[a], B = vehicles[b];
      const dx = B.x - A.x, dz = B.z - A.z;
      if (dx * dx + dz * dz > 100) continue;
      if (obbOverlap(A, B, 0.3)) note('vehOverlap', `#${A.id} ${A.kind}/${A.state}/L${A.link}(${g.links[A.link].kind})s${A.s.toFixed(1)}/lat${A.lat.toFixed(1)}/lc${A.lcT.toFixed(2)}from${A.lcFrom} v${A.v.toFixed(1)} & #${B.id} ${B.kind}/${B.state}/L${B.link}(${g.links[B.link].kind})s${B.s.toFixed(1)}/lat${B.lat.toFixed(1)}/lc${B.lcT.toFixed(2)}from${B.lcFrom} v${B.v.toFixed(1)} at ${A.x.toFixed(1)},${A.z.toFixed(1)}`);
    }
    if (vehicles.length > 20) { const frac = moving / vehicles.length; minMovingFrac = Math.min(minMovingFrac, frac); movingSum += frac; flowSamples++; }
    for (const p of peds) {
      if (inBuilding.has(p.x, p.z)) note('pedInBuilding', `#${p.id} ${p.state} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      if (!p.onRoad && onRoad.has(p.x, p.z)) note('pedOffSidewalk', `#${p.id} ${p.state} edge ${p.edge}(k${g.walkEdges[p.edge].kind} s${p.s.toFixed(1)}/${net.walkLen[p.edge].toFixed(1)} lat${p.lat.toFixed(2)}/${g.walkEdges[p.edge].half.toFixed(2)}) at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      for (const v of vehicles) {
        const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz > 49) continue;
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
        if (Math.abs(dx * fx + dz * fz) < v.len / 2 && Math.abs(dx * fz - dz * fx) < v.wid / 2 && v.v > 0.5) note('pedHitByVehicle', `ped #${p.id} (${p.state} e${p.edge}k${g.walkEdges[p.edge].kind} s${p.s.toFixed(1)} road${p.onRoad} t${sim.time.toFixed(1)}) veh ${v.kind} L${v.link}k${g.links[v.link].kind} s${v.s.toFixed(1)} v${v.v.toFixed(1)} ${v.blockedBy} & veh #${v.id} at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
      }
    }
    if (k % 30 === 0) {
      const W = sim.debugWildlife();
      wildPeak = Math.max(wildPeak, sim.wildlife.length);
      for (const { species, a, ground } of W.animals) {
        if (!ground) continue;
        if (inBuilding.has(a.x, a.z)) note('animalInBuilding', `${species} #${a.id} ${a.state} at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
        if (onRoad.has(a.x, a.z)) note('animalOnRoad', `${species} #${a.id} ${a.state} at ${a.x.toFixed(1)},${a.z.toFixed(1)}`);
      }
    }
    for (const id of [...still.keys()]) if (!vehicles.some((v) => v.id === id)) still.delete(id);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    label: opts.label, seconds: opts.seconds, maxVehicles: opts.maxVehicles, maxPeds: opts.maxPeds,
    final: { vehicles: sim.vehicles.length, peds: sim.peds.length },
    stepMs: { avg: +avg.toFixed(3), p95: +times[Math.floor(times.length * 0.95)].toFixed(3), max: +times[times.length - 1].toFixed(3) },
    failures: fail, examples, maxStationarySec: +maxStill.toFixed(1), maxStationaryWho: maxStillWho,
    flow: { minMovingFraction: +minMovingFrac.toFixed(2), avgMovingFraction: flowSamples ? +(movingSum / flowSamples).toFixed(2) : 0 },
    hooks, subway: sim.debugSubway(), doors: sim.debugDoors(), wildlife: (() => { const W = sim.debugWildlife(); const sp: Record<string, number> = {}; for (const x of W.animals) sp[x.species] = (sp[x.species] ?? 0) + 1; return { peakVisible: wildPeak, startles: W.startles, scatters: W.scatters, feeders: W.feeders, species: sp }; })(), stats: { ...sim.stats }, stuckWhy: sim.stuckWhy, stuckLog: sim.stuckLog, events, hash: hashState(sim), archetypeWarnings: sim.archetypeWarnings,
  };
}

/** Response time: siren units dispatched to a scene; seconds until the first one is on scene. */
/** Near-camera density (VISUAL_BAR "Life": a street must never look empty): agents within 60 m, camera turning slowly. */
async function densityRun(clock: number, where: { x: number; z: number }, preset: [number, number], label: string) {
  const sim = new Simulation({ seed: SEED, maxVehicles: preset[0], maxPeds: preset[1], fetchBinary });
  await sim.load(); sim.setClock(clock);
  let nv = 0, np = 0, minV = 1e9, minP = 1e9, n = 0;
  for (let k = 0; k < 150 / SIM_DT; k++) {
    sim.setView(where.x, where.z, Math.sin(k * 0.002), -Math.cos(k * 0.002));
    sim.update(SIM_DT, where);
    if (k > 60 / SIM_DT && k % 30 === 0) {
      const a = sim.vehicles.filter((v) => Math.hypot(v.x - where.x, v.z - where.z) < 60).length;
      const b = sim.peds.filter((p) => Math.hypot(p.x - where.x, p.z - where.z) < 60).length;
      nv += a; np += b; minV = Math.min(minV, a); minP = Math.min(minP, b); n++;
    }
  }
  return { label, preset, clock, vehiclesAvg: +(nv / n).toFixed(1), vehiclesMin: minV, pedsAvg: +(np / n).toFixed(1), pedsMin: minP };
}

async function responseRun(clock: number, where: { x: number; z: number }, label: string) {
  const sim = new Simulation({ seed: SEED, maxVehicles: 150, maxPeds: 400, fetchBinary });
  await sim.load(); sim.setClock(clock);
  const arrivals: { who: string; t: number }[] = [];
  let t0 = -1;
  sim.on('responderArrived', (e) => arrivals.push({ who: e.role, t: sim.time - t0 }));
  sim.on('policeArrived', (e) => arrivals.push({ who: `police#${e.id}`, t: sim.time - t0 }));
  const scene = { x: where.x + 20, z: where.z - 70 };
  for (let k = 0; k < 150 / SIM_DT; k++) {
    if (k === Math.round(30 / SIM_DT)) {
      t0 = sim.time;
      sim.dispatch('ambulance', scene.x, scene.z);
      const id = sim.spawnPolice({ kind: 'car', x: 0, z: 0, siren: true, respondTo: scene });
      if (id >= 0) sim.setPoliceGoal(id, { kind: 'goto', x: scene.x, z: scene.z, urgent: true });
    }
    sim.update(SIM_DT, where);
  }
  arrivals.sort((a, b) => a.t - b.t);
  return { label, clock, firstUnitSec: arrivals.length ? +arrivals[0].t.toFixed(1) : null, arrivals: arrivals.map((a) => ({ ...a, t: +a.t.toFixed(1) })) };
}

function obbOverlap(A: { x: number; z: number; yaw: number; len: number; wid: number }, B: typeof A, shrink: number) {
  const axes = [A, B].flatMap((V) => { const fx = -Math.sin(V.yaw), fz = -Math.cos(V.yaw); return [[fx, fz], [fz, -fx]]; });
  for (const [ax, az] of axes) {
    const proj = (V: typeof A) => {
      const fx = -Math.sin(V.yaw), fz = -Math.cos(V.yaw);
      const c = V.x * ax + V.z * az;
      const r = Math.abs((fx * ax + fz * az) * (V.len / 2 - shrink)) + Math.abs((fz * ax - fx * az) * (V.wid / 2 - shrink));
      return [c - r, c + r];
    };
    const [a0, a1] = proj(A), [b0, b1] = proj(B);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

async function main() {
  const report: any = { generated: new Date().toISOString(), note: 'Headless Node timings, CPU only (container, no GPU); single thread.', seed: SEED };
  const full = await run({ seconds: MINUTES * 60, maxVehicles: 150, maxPeds: 400, checks: true, label: 'High preset, 10 sim-minutes, all checks' });
  report.high = full;
  const low = await run({ seconds: 120, maxVehicles: 40, maxPeds: 120, checks: true, label: 'Mobile Low preset, 2 sim-minutes, Wednesday 09:00 (street cleaning, mail), all checks', clock: 9 * 60, day: 3 });
  report.low = low;
  const resp = [
    await responseRun(17 * 60 + 30, FOCI[1], 'rush hour, Herald Square'),
    await responseRun(17 * 60 + 30, FOCI[2], 'rush hour, 42nd St & 7th Ave'),
    await responseRun(11 * 60, FOCI[1], 'off-peak, Herald Square'),
    await responseRun(11 * 60, FOCI[0], 'off-peak, Flatiron'),
  ];
  report.response = resp;
  const dens = [
    await densityRun(17 * 60 + 30, FOCI[1], [150, 400], 'High, rush hour, Herald Square'),
    await densityRun(13 * 60, FOCI[2], [150, 400], 'High, midday, Times Square'),
    await densityRun(17 * 60 + 30, FOCI[1], [40, 120], 'Low, rush hour, Herald Square'),
  ];
  report.density = dens;
  const h1 = (await run({ seconds: 60, maxVehicles: 150, maxPeds: 400, checks: false, label: 'determinism A' })).hash;
  const h2 = (await run({ seconds: 60, maxVehicles: 150, maxPeds: 400, checks: false, label: 'determinism B' })).hash;
  report.determinism = { a: h1, b: h2, equal: h1 === h2 };
  const f = full.failures;
  const problems: string[] = [];
  for (const [k, n] of Object.entries(f)) if (n > 0) problems.push(`${k}: ${n}`);
  for (const [k, n] of Object.entries(low.failures)) if (n > 0) problems.push(`low/morning ${k}: ${n}`);
  if (full.maxStationarySec > 180) problems.push(`deadlock: a vehicle stood still ${full.maxStationarySec} s (${full.maxStationaryWho})`);
  if (full.flow.minMovingFraction < 0.05) problems.push(`network-wide stall: moving fraction fell to ${full.flow.minMovingFraction}`);
  if (!report.determinism.equal) problems.push('non-deterministic');
  for (const r of report.response) {
    const limit = r.clock === 11 * 60 ? 40 : 60;
    if (r.firstUnitSec === null || r.firstUnitSec > limit) problems.push(`response ${r.label}: first unit ${r.firstUnitSec ?? 'never'} s (target <= ${limit} s)`);
  }
  // police arrival is asserted by the dedicated response-time runs below
  {
    const sim = new Simulation({ seed: SEED, maxVehicles: 10, maxPeds: 10, fetchBinary }); await sim.load();
    const ix = sim.nearestIntersections(-380, -915, 150);
    if (ix.length < 3 || !ix.every((q) => q.streets.length >= 2)) problems.push(`nearestIntersections: ${JSON.stringify(ix.slice(0, 3))}`);
    const st = sim.subwayStations();
    if (st.filter((q) => q.complex === 'herald_sq').length !== 2 || st.filter((q) => q.complex === 'times_sq').length !== 2 || !st.some((q) => q.line === 'path') || st.some((q) => !q.contentId)) problems.push(`subway canon: ${st.map((q) => `${q.line}/${q.name}`).join(', ')}`);
  }
  for (const d of dens) {
    const [needV, needP] = d.preset[0] >= 150 ? [20, 60] : [8, 35];
    if (d.vehiclesAvg < needV || d.pedsAvg < needP) problems.push(`street too empty (${d.label}): ${d.vehiclesAvg} vehicles, ${d.pedsAvg} peds within 60 m (need ${needV}/${needP})`);
  }
  {
    const sim = new Simulation({ seed: SEED, maxVehicles: 10, maxPeds: 10, fetchBinary }); await sim.load();
    const H = sim.signalHeads(); const st = sim.signalStates();
    const veh = H.filter((h) => h.kind === 'vehicle').length, ped = H.length - veh;
    if (veh < 200 || ped < 400 || st.length !== H.length || ![...st].some((x) => x === 3) || ![...st].some((x) => x === 6)) problems.push(`signal heads: ${veh} vehicle, ${ped} ped`);
    report.signalHeads = { vehicle: veh, ped, junctions: new Set(H.map((h) => h.junction)).size };
  }
  if (!full.doors.entered || !full.doors.exited) problems.push(`door traffic inactive: ${JSON.stringify(full.doors)}`);
  if (!full.subway.stations || !full.events.trainArriving) problems.push(`subway inactive: ${JSON.stringify(full.subway)}`);
  if (full.wildlife.peakVisible === 0 || full.wildlife.startles === 0) problems.push(`wildlife inactive: ${JSON.stringify(full.wildlife)}`);
  report.pass = problems.length === 0; report.problems = problems;
  fs.writeFileSync(path.join(ROOT, 'docs/sim_test_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ high: { ...full, examples: undefined }, low: { stepMs: low.stepMs, final: low.final, failures: low.failures, events: low.events }, determinism: report.determinism, response: report.response }, null, 1));
  for (const [k, ex] of Object.entries(full.examples)) console.log(k, ex);
  console.log(report.pass ? 'PASS' : `FAIL\n  ${problems.join('\n  ')}`);
  process.exit(report.pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
