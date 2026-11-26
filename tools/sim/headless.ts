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
import { CHUNK_SIZE, REGION } from '../../src/shared/geo.ts';
const inside = (x: number, z: number) => x > REGION.minX + 1 && x < REGION.maxX - 1 && z > REGION.minZ + 1 && z < REGION.maxZ - 1;
import { pointInPolygon, projectOnPoly, sampleAt } from '../../src/sim/geom.ts';
import { LinkKind } from '../../src/sim/laneFormat.ts';
import { Sig } from '../../src/sim/network.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'public/data');
const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const MINUTES = +arg('minutes', '10');
const SEED = +arg('seed', '1974');

const fetchBinary = async (p: string) => { const b = fs.readFileSync(path.join(DATA, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// ------------------------------------------------------------------ ground polygons
interface PolyW { rings: Float32Array[]; minX: number; minZ: number; maxX: number; maxZ: number }
const world = JSON.parse(fs.readFileSync(path.join(DATA, 'world.json'), 'utf8'));
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
  { name: '42nd St & 7th Ave', x: -330, z: -1560 },
];

function hashState(sim: Simulation): string {
  const { vehicles, peds } = sim.debugAgents();
  let h = 2166136261;
  const mix = (v: number) => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
  for (const v of vehicles) { mix(v.id); mix(v.link); mix(v.s); mix(v.v); }
  for (const p of peds) { mix(p.id); mix(p.edge); mix(p.x); mix(p.z); }
  return (h >>> 0).toString(16) + `:${vehicles.length}/${peds.length}`;
}

async function run(opts: { seconds: number; maxVehicles: number; maxPeds: number; checks: boolean; label: string }) {
  const sim = new Simulation({ seed: SEED, maxVehicles: opts.maxVehicles, maxPeds: opts.maxPeds, fetchBinary });
  await sim.load();
  sim.setClock(17 * 60 + 30);
  const net = sim.network, g = net.g;
  const events: Record<string, number> = {};
  for (const t of ['honk', 'collision', 'nearMiss', 'hail', 'jaywalk', 'doubleParked', 'pickup', 'dropoff', 'busStop', 'subwayExit', 'subwayEnter', 'dodge']) sim.on(t, () => { events[t] = (events[t] ?? 0) + 1; });
  const fail: Record<string, number> = { vehOffRoad: 0, vehOffLane: 0, wrongWay: 0, redLight: 0, vehOverlap: 0, pedInBuilding: 0, pedOffSidewalk: 0, pedHitByVehicle: 0 };
  const examples: Record<string, string[]> = {};
  const seen = new Set<string>();
  const note = (k: string, s: string) => { fail[k]++; const key = k + s.split(' at ')[0].split(' ')[0]; if (seen.has(key)) return; seen.add(key); (examples[k] ??= []).length < 8 && examples[k].push(s); };
  const prevLink = new Map<number, number>(), still = new Map<number, number>();
  let maxStill = 0, maxStillWho = '', minMovingFrac = 1, flowSamples = 0, movingSum = 0;
  const times: number[] = [];
  const steps = Math.round(opts.seconds / SIM_DT);
  const o = [0, 0, 0, 0];
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
      { id: 'scripted_car', x: o[0], z: o[1], vx: o[2] * 8, vz: o[3] * 8, radius: 1.3, kind: 'vehicle' },
    ]);
    const t0 = performance.now();
    sim.update(SIM_DT, f);
    times.push(performance.now() - t0);
    if (!opts.checks || k % 2) continue;
    const { vehicles, peds } = sim.debugAgents();
    let moving = 0;
    for (const v of vehicles) {
      const L = g.links[v.link];
      // roadway + lane band
      if (inside(v.x, v.z) && !onRoad.has(v.x, v.z)) note('vehOffRoad', `#${v.id} ${v.kind} at ${v.x.toFixed(1)},${v.z.toFixed(1)} link ${v.link}`);
      const pr = projectOnPoly(L.pts, v.x, v.z);
      const tol = L.width / 2 + Math.abs(v.lat) + (v.lcT < 1 ? L.width : 0) + 0.6;
      if (pr.d > tol) note('vehOffLane', `#${v.id} ${pr.d.toFixed(2)} m from link ${v.link} (tol ${tol.toFixed(2)})`);
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
        const red = net.laneSignal(pl, sim.time) === Sig.Red && net.laneSignal(pl, sim.time - SIM_DT) === Sig.Red && net.laneSignal(pl, sim.time - 2 * SIM_DT) === Sig.Red;
        if (red) note('redLight', `#${v.id} ran red from lane ${pl} at t=${sim.time.toFixed(1)}`);
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
    stats: { ...sim.stats }, stuckWhy: sim.stuckWhy, stuckLog: sim.stuckLog, events, hash: hashState(sim), archetypeWarnings: sim.archetypeWarnings,
  };
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
  const low = await run({ seconds: 120, maxVehicles: 40, maxPeds: 120, checks: false, label: 'Mobile Low preset, 2 sim-minutes, timing only' });
  report.low = low;
  const h1 = (await run({ seconds: 60, maxVehicles: 150, maxPeds: 400, checks: false, label: 'determinism A' })).hash;
  const h2 = (await run({ seconds: 60, maxVehicles: 150, maxPeds: 400, checks: false, label: 'determinism B' })).hash;
  report.determinism = { a: h1, b: h2, equal: h1 === h2 };
  const f = full.failures;
  const problems: string[] = [];
  for (const [k, n] of Object.entries(f)) if (n > 0) problems.push(`${k}: ${n}`);
  if (full.maxStationarySec > 180) problems.push(`deadlock: a vehicle stood still ${full.maxStationarySec} s (${full.maxStationaryWho})`);
  if (full.flow.minMovingFraction < 0.05) problems.push(`network-wide stall: moving fraction fell to ${full.flow.minMovingFraction}`);
  if (!report.determinism.equal) problems.push('non-deterministic');
  report.pass = problems.length === 0; report.problems = problems;
  fs.writeFileSync(path.join(ROOT, 'docs/sim_test_report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ high: { ...full, examples: undefined }, low: { stepMs: low.stepMs, final: low.final }, determinism: report.determinism }, null, 1));
  for (const [k, ex] of Object.entries(full.examples)) console.log(k, ex);
  console.log(report.pass ? 'PASS' : `FAIL\n  ${problems.join('\n  ')}`);
  process.exit(report.pass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
