/**
 * Pursuit on real streets, headless (gameplay-owned bench). The real sim on the real lane graph, gameplay bound
 * through the full SimLike path (police mirror, pursuit roles, chokepoints from real junctions), and the player's
 * car driven kinematically along real lanes at a set speed, turning at random (seeded) at each junction.
 * A radio car watches the carjack from behind; more radio cars are posted at real junctions around the start.
 *
 *   npx tsx tools/gameplay/pursuitHeadless.ts [--runs 6] [--minutes 4] [--speed 13] [--seed 1974] [--cars 4]
 *
 * Writes docs/gameplay_pursuit_report.json. Measured per run: time to pursuit, share of time a unit sees the car,
 * roles assigned, intercepts (a unit within 15 m ahead of the car), closest approach, whether and when the car got
 * away (phase lost/searching/cooling/none after pursuit), and gameplay's update cost.
 *
 * Limits (stated in the report): the player's car is kinematic: it ignores traffic, lights and collisions, and
 * never slows for a turn, so it is a hard target; the sim's police cars do obey the lane graph.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Simulation, SIM_DT } from '../../src/sim/index.ts';
import { LinkKind } from '../../src/sim/laneFormat.ts';
import { sampleAt } from '../../src/sim/geom.ts';
import { setTerrainData } from '../../src/shared/terrain.ts';
import { Gameplay } from '../../src/gameplay/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DATA = path.join(ROOT, 'public/data');
const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const VERBOSE = args.includes('--verbose');
const RUNS = +arg('runs', '6'), MINUTES = +arg('minutes', '4'), SPEED = +arg('speed', '13'), SEED = +arg('seed', '1974'), CARS = +arg('cars', '4');
{ const tb = fs.readFileSync(path.join(DATA, 'terrain.bin')); setTerrainData(tb.buffer.slice(tb.byteOffset, tb.byteOffset + tb.byteLength)); }
const fetchBinary = async (p: string) => { const b = fs.readFileSync(path.join(DATA, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// a tiny seeded rng for the drive's turns
const mul = (s: number) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// start points: Tenderloin avenues near the main game's spawn (lane links whose midpoint is near these)
const STARTS: [number, number][] = [[-20, -51], [120, -200], [-150, 80], [60, 150], [-260, -120], [200, 40]];

async function run(k: number) {
  const sim = new Simulation({ seed: SEED + k, maxVehicles: 150, maxPeds: 400, fetchBinary });
  await sim.load(); sim.setClock(14 * 60 + 30);
  const net = sim.network, g = net.g, rnd = mul(SEED * 31 + k);
  // the lane link nearest the start
  const [sx, sz] = STARTS[k % STARTS.length];
  let carL = -1, bd = Infinity;
  for (let i = 0; i < g.links.length; i++) { const L = g.links[i]; if (L.kind !== LinkKind.Lane || net.len[i] < 90) continue; /* room for the watcher behind on the same lane */ const m = L.pts.length >> 1; const d = Math.hypot(L.pts[m * 2 - 2] - sx, L.pts[m * 2 - 1] - sz); if (d < bd) { bd = d; carL = i; } }
  let carS = 50; const o = [0, 0, 0, 0];
  const place = () => sampleAt(g.links[carL].pts, net.cum[carL], carS, o);
  place();
  const pos: [number, number, number] = [o[0], 0, o[1]];
  const gp = new Gameplay({ quality: 'high', content: { items: null, shops: null, weapons: null } });
  gp.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => pos, aim: () => ({ origin: [pos[0], 1.5, pos[2]], dir: [0, 0, -1] }) });
  gp.bindSim(sim as any);
  // warm the street up a little first
  for (let i = 0; i < 10 / SIM_DT; i++) { sim.setExternalActors([{ id: 'player', x: pos[0], z: pos[2], vx: 0, vz: 0, radius: 2.6, kind: 'vehicle' } as any]); sim.update(SIM_DT, { x: pos[0], z: pos[2] }); }
  // the watcher: a radio car 35 m behind on the same lane; the rest at real junctions 150-450 m out
  // the warm-up let traffic run; the car waited at carS. The watcher: 35 m behind on the same lane, same direction
  const ob = [0, 0, 0, 0]; sampleAt(g.links[carL].pts, net.cum[carL], carS - 35, ob);
  const watcher = gp.registerPolice('radio_car', 'pct.midtown_central', ob[0], ob[1], { corrupt: 0 });
  watcher.yaw = Math.atan2(-o[2], -o[3]);
  const junctions = (sim as any).nearestIntersections(pos[0], pos[2], 450, 40).filter((j: any) => j.dist > 150);
  for (let i = 0; i < CARS - 1 && i < junctions.length; i++) { const j = junctions[Math.floor(i * junctions.length / (CARS - 1))]; gp.registerPolice('radio_car', 'pct.midtown_central', j.x, j.z, { corrupt: 0 }); }
  gp.setContext({ vehicle: { id: 'stolen', vclass: 'sedan', colour: '#5a3a22' }, speed: 0, vehicleYaw: 0 });
  gp.crime('carjack', { noise: 20 });
  let pedsStruck = 0; gp.on('crimeWitnessed', (e: any) => { if (e.crime.kind === 'hit_and_run' || e.crime.kind === 'homicide') pedsStruck++; });

  const N = Math.round(MINUTES * 60 / SIM_DT);
  let pursuitAt: number | null = null, seen = 0, intercepts = 0, closest = Infinity, lostAt: number | null = null, maxUnits = 0, gpMs = 0;
  const roles: Record<string, number> = {}, phases: string[] = [];
  let lastInterceptT = -10;
  for (let i = 0; i < N; i++) {
    const t = i * SIM_DT;
    carS += SPEED * SIM_DT;
    while (carS > net.len[carL]) { carS -= net.len[carL]; const L = g.links[carL]; carL = L.kind === LinkKind.Lane ? L.next[Math.floor(rnd() * L.next.length)] : L.next[0]; }
    place(); pos[0] = o[0]; pos[2] = o[1];
    const yaw = Math.atan2(-o[2], -o[3]);
    sim.setExternalActors([{ id: 'player', x: o[0], z: o[1], vx: o[2] * SPEED, vz: o[3] * SPEED, radius: 2.6, kind: 'vehicle' } as any]);
    sim.update(SIM_DT, { x: o[0], z: o[1] });
    gp.setContext({ speed: SPEED, vehicleYaw: yaw });
    const t0 = performance.now(); gp.update(SIM_DT); gpMs += performance.now() - t0;
    if (i % 3) continue; // sample at 10 Hz
    if (VERBOSE && i % 60 === 0) console.log(`t=${t.toFixed(0).padStart(3)} ${gp.policeSys.phase('player').padEnd(9)} car@${Math.round(o[0])},${Math.round(o[1])} ` + [...gp.policeSys.units.values()].map((u) => `${u.kind[0]}:${u.state}:${gp.mirror?.roles?.get(u.id)?.role ?? '-'}@${Math.round(Math.hypot(u.x - o[0], u.z - o[1]))}v${Math.round(u.speed ?? 0)}${u.lostFor === 0 && u.lastSeen ? "*" : ""}`).join(' '));
    const ph = gp.policeSys.phase('player'); if (phases.at(-1) !== ph) phases.push(ph);
    if (ph === 'pursuit' && pursuitAt === null) pursuitAt = t;
    if (pursuitAt !== null && lostAt === null && ph !== 'pursuit' && ph !== 'spotted') lostAt = t;
    if (lostAt !== null && (ph === 'pursuit')) lostAt = null; // reacquired
    const units = [...gp.policeSys.units.values()].filter((u) => u.state !== 'down');
    maxUnits = Math.max(maxUnits, units.length);
    if (units.some((u) => u.lostFor === 0 && u.lastSeen)) seen += 3 * SIM_DT;
    for (const u of units) {
      const dx = u.x - o[0], dz = u.z - o[1], d = Math.hypot(dx, dz); closest = Math.min(closest, d);
      if (d < 15 && dx * o[2] + dz * o[3] > 3 && t - lastInterceptT > 5) { intercepts++; lastInterceptT = t; }
      const r = gp.mirror?.roles?.get(u.id)?.role; if (r) roles[r] = (roles[r] ?? 0) + 1;
    }
  }
  return { run: k, start: [Math.round(sx), Math.round(sz)], pursuitAt: pursuitAt === null ? null : +pursuitAt.toFixed(1), seenShare: +(seen / (MINUTES * 60)).toFixed(2), intercepts,
    closest: Math.round(closest), gotAwayAt: lostAt === null ? null : +lostAt.toFixed(1), finalPhase: gp.policeSys.phase('player'), phases, maxUnits, roles,
    gpMsPerFrame: +(gpMs / N).toFixed(2), reports: gp.policeSys.reports.length, pedsStruck };
}

const results = [] as Awaited<ReturnType<typeof run>>[];
const ONLY = arg('only', '');
for (let k = 0; k < RUNS; k++) { if (ONLY && !ONLY.split(',').includes(String(k))) continue; const r = await run(k); results.push(r); console.log(JSON.stringify(r)); }
const ok = results.filter((r) => r.pursuitAt !== null);
const summary = {
  speedMs: SPEED, minutes: MINUTES, runs: RUNS, carsPerRun: CARS,
  pursuitStarted: `${ok.length}/${RUNS}`, gotAway: `${results.filter((r) => r.gotAwayAt !== null).length}/${RUNS}`,
  medianGetAwayS: (() => { const a = results.map((r) => r.gotAwayAt).filter((x): x is number => x !== null).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; })(),
  meanSeenShare: +(results.reduce((s, r) => s + r.seenShare, 0) / RUNS).toFixed(2), totalIntercepts: results.reduce((s, r) => s + r.intercepts, 0),
  gpMsPerFrame: +(results.reduce((s, r) => s + r.gpMsPerFrame, 0) / RUNS).toFixed(2),
  pedsStruck: results.reduce((s, r) => s + r.pedsStruck, 0),
  limits: 'player car is kinematic (ignores traffic, lights, collisions and pedestrians, so it runs some down and the chase escalates; never slows to turn); police cars drive the sim lane graph',
};
console.log(JSON.stringify(summary, null, 1));
fs.writeFileSync(path.join(ROOT, 'docs/gameplay_pursuit_report.json'), JSON.stringify({ summary, results }, null, 1));
process.exit(0);
