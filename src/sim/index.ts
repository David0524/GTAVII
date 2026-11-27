/**
 * Ambient simulation for Tenderloin '74: traffic and pedestrians as generic agents.
 * See docs/SIM_PROGRESS.md for design, decisions and numbers.
 *
 * Integration contract (docs/briefs/SIM_BRIEF.md). Extensions are optional fields/methods only.
 */
import { ArchetypeRegistry, AreaResolver, BUILTIN_ARCHETYPES, type ArchetypeDef } from './archetypes';
import { Rng, sampleAt, projectOnPoly } from './geom';
import type { TrafficVehicleView } from '../shared/traffic';
import { heightAt, CURB_HEIGHT, loadTerrain, terrainLoaded } from '../shared/terrain';
import { edgeDistance } from '../shared/bounds';
import { buildSignalHeads, writeSignalStates, type SignalHead } from './signals';
export { SignalState, type SignalHead } from './signals';
import { LinkKind, type LaneGraph, readLaneGraph } from './laneFormat';
import { AgentGrid, Network, Sig } from './network';
import { bumpReactions } from './bump';
import { cullBehindView, feedEdgeLanes } from './traffic';
import { cullPedsBehindView, separatePeds, despawnPed, dodgeActors, gunfire, killPed, setPedGoal, spawnPedAt, spawnPedNear, spawnPeds, stepPeds, threaten } from './peds';
import { newStats, type Actor, type Ped, type PedGoal, type SimCore, type Stats, type Vehicle } from './state';
export type { PedGoal } from './state';
import { Wildlife, type WildlifeView } from './wildlife';
import { boardCab, callCab, dispatchResponders, leaveCab } from './service';
import { Parking, type ParkingRule } from './parking';
import { Subway, type Station, type TrainCall } from './subway';
import { Doors, type DoorRec, type DoorRate } from './doors';
import { Vendors, type VendorView } from './vendors';
import { Memory, type MemKind } from './memory';
import { ParkedCars, type ParkedCar } from './parked';
export type { DoorRec, DoorRate } from './doors';
export { VENDOR_KINDS, type VendorView, type VendorKind } from './vendors';
export type { ParkedCar } from './parked';
export { DOOR_RATES } from './doors';
export type { Station, TrainCall } from './subway';
export type { ParkingRule } from './parking';
import { policePedTick, removePolice, setCopGoal, spawnPolice as spawnCop, type PoliceGoal, type PoliceView } from './police';
export type { PoliceGoal, PoliceView } from './police';
export type { WildlifeView } from './wildlife';
import { despawnVehicle, honk, rebuildOcc, spawnVehicles, stepVehicles, vehicleContacts } from './traffic';

export type { ArchetypeDef } from './archetypes';
export { BUILTIN_ARCHETYPES, validateArchetype } from './archetypes';

/** @deprecated old name, kept for compatibility. */
export type AgentView = PedView;
/** Pedestrian view (contract). Vehicles use TrafficVehicleView from src/shared/traffic.ts. */
const tmp4 = [0, 0, 0, 0];
export interface PedView {
  /** nerve 0..1: courage (gameplay decides who runs to a call box and who freezes) */
  nerve: number;
  /** in the roadway (vs on the sidewalk, a kerb height up): a change is a kerb step for foot IK */
  onRoad: boolean;
  /** what they're carrying from a vendor ('' none): frank, pretzel, coffee, newspaper... */
  carry: string;
  id: number; archetype: string;
  x: number; y: number; z: number; yaw: number; speed: number; state: string; variant: number;
}
export type SimEventType = 'honk' | 'collision' | 'nearMiss' | 'hail';
export interface SimOptions {
  seed: number; maxVehicles: number; maxPeds: number; baseUrl?: string;
  /** Extra archetypes (e.g. content/npc_archetypes/*.json); override built-ins with the same id. */
  archetypes?: ArchetypeDef[];
  /** Custom loader (Node tests): path relative to baseUrl -> bytes. */
  fetchBinary?: (path: string) => Promise<ArrayBuffer>;
  /** terrain.bin URL override (Node tests pass a data: URL). */
  terrainUrl?: string;
}

/** One agent that could notice an event (see Simulation.perceive). */
export interface Witness { id: number; distance: number; saw: boolean; heard: boolean; archetype: string }

/** Fixed internal timestep (s). */
export const SIM_DT = 1 / 30;

export class Simulation {
  readonly vehicles: readonly TrafficVehicleView[] = [];
  readonly peds: readonly PedView[] = [];
  /** Pigeons and rats near the focus (one view per animal; instance them). */
  get wildlife(): readonly WildlifeView[] { return this.wild?.views ?? []; }
  private wild!: Wildlife;
  /** Wall-clock ms spent in the last update() call, and how many fixed steps it ran. */
  lastUpdateMs = 0;
  lastSteps = 0;
  private core!: SimCore;
  private net!: Network;
  private acc = 0;
  private listeners = new Map<string, ((e: any) => void)[]>();
  private started = false;
  private lastFocus = { x: 0, z: 0 };
  private contactCd = new Map<string, number>();
  private pendingArchetypes: ArchetypeDef[] = [];
  private minute = 18 * 60 + 30;
  private weather: 'clear' | 'overcast' | 'rain' = 'clear';
  private densityHook: SimCore['densityHook'] = null;
  private stopLines: { lane: number; x: number; z: number }[] = [];
  /** Why gridlock-fallback despawns happened (debug). */
  readonly stuckWhy: Record<string, number> = {};
  readonly stuckLog: string[] = [];
  /** Debug: describe the vehicle at the head of v's queue. */
  private queueHead(v: Vehicle): string {
    const S = this.core, g = this.net.g;
    let cur = v, link = v.link;
    for (let k = 0; k < 40; k++) {
      const list = S.occ[link], i = list.indexOf(cur);
      if (i >= 0 && i < list.length - 1) { cur = list[i + 1]; continue; }
      const L = g.links[link];
      const nx = L.kind === LinkKind.Lane ? cur.next : L.next[0];
      if (nx >= 0 && S.occ[nx].length) { link = nx; cur = S.occ[nx][0]; continue; }
      if (nx >= 0 && L.kind === LinkKind.Lane) { const o = g.links[nx].next[0]; if (S.occ[o].length) { link = o; cur = S.occ[o][0]; continue; } }
      break;
    }
    const L = g.links[cur.link];
    return `#${v.id}@${v.x.toFixed(0)},${v.z.toFixed(0)} head #${cur.id} ${cur.kind} ${cur.state}/${cur.blockedBy}/${cur.why} next ${cur.next} link ${cur.link}(${L.kind ? 'conn' : this.net.roadName(L.owner)}) s${cur.s.toFixed(0)}/${this.net.len[cur.link].toFixed(0)} @${cur.x.toFixed(0)},${cur.z.toFixed(0)} stop${cur.stopT.toFixed(0)}`;
  }

  constructor(private opts: SimOptions) { if (opts.archetypes) this.pendingArchetypes.push(...opts.archetypes); }

  async load(): Promise<void> {
    const base = this.opts.baseUrl ?? '/data/';
    const buf = this.opts.fetchBinary ? await this.opts.fetchBinary('lanes.bin') : await fetch(base + 'lanes.bin').then((r) => { if (!r.ok) throw new Error(`lanes.bin: HTTP ${r.status}`); return r.arrayBuffer(); });
    // ground heights for agent y (engine-owned terrain; the engine normally loads it first)
    if (!terrainLoaded()) await loadTerrain(this.opts.terrainUrl ?? base + 'terrain.bin').catch(() => undefined);
    this.init(readLaneGraph(buf));
  }

  /** Initialise from an already-parsed graph (tests, workers). */
  init(g: LaneGraph) {
    const net = (this.net = new Network(g));
    const reg = new ArchetypeRegistry(new AreaResolver(net));
    reg.register(BUILTIN_ARCHETYPES);
    reg.register(this.pendingArchetypes);
    const srcLane = new Int32Array(g.links.length).fill(-1);
    g.links.forEach((l, i) => { if (l.kind === LinkKind.Lane) for (const c of l.next) srcLane[c] = i; });
    const crossConns = new Map<number, number[]>();
    g.links.forEach((l, i) => { for (const c of l.crossings) (crossConns.get(c.walkEdge) ?? crossConns.set(c.walkEdge, []).get(c.walkEdge)!).push(i); });
    const rOutV = Math.max(150, Math.min(300, 120 + this.opts.maxVehicles * 0.95)); // initial; spawnVehicles sizes it from the lane-metres around the focus
    const rOutP = Math.max(80, Math.min(150, 60 + this.opts.maxPeds * 0.2));
    const core: SimCore = {
      net, rng: new Rng(this.opts.seed), reg, t: 0, minute: this.minute, weather: this.weather,
      vehicles: [], peds: [], occ: g.links.map(() => []), occDirty: [],
      pGrid: new AgentGrid(4), vGrid: new AgentGrid(8), obstacles: [], obsGrid: new AgentGrid(4), obsBase: [], sirenWant: new Set(), onWalk: new Map(), srcLane,
      actors: [], blocks: [], threats: [], closedRoads: new Map(), hails: [], spotOwner: new Int32Array(g.spots.length).fill(-1),
      focus: { x: 0, z: 0 }, maxVehicles: this.opts.maxVehicles, maxPeds: this.opts.maxPeds,
      ringV: [rOutV * 0.6, rOutV], view: null, ringP: [rOutP * 0.6, rOutP], densityHook: this.densityHook,
      emit: (type, e) => this.fire(type, e), stats: newStats(), nextId: 1, pedById: new Map(),
      busStopOf: new Map(g.busStops.map((b) => [b.link, b])), crossConns, lcList: [], sirens: [], preds: g.links.map(() => []),
      footCount: new Float32Array(g.roads.length), footAvg: new Float32Array(g.roads.length),
      spawnPedAt: (x, z, reason) => spawnPedAt(core, x, z, reason),
      onBusStop: (spot, v) => {
        for (const p of core.peds) if (p.alive && p.state === 'waitBus' && p.spot === spot) { despawnPed(core, p); core.stats.boardings++; }
        const n = core.rng.int(3); for (let k = 0; k < n; k++) spawnPedAt(core, v.x, v.z, 'alight');
      },
    };
    g.links.forEach((l, i) => { if (l.kind === LinkKind.Connector) core.preds[l.next[0]].push(i); });
    this.core = core;
    this.parking = new Parking(core);
    this.memory = new Memory(core, (x, z) => this.blockAt(x, z));
    this.on('pedBumped', (e: any) => { if (e.byPlayer) this.memory.remember(e.kind === 'knockdown' ? 'knockdown' : 'bumped', e.x, e.z, { pedId: e.id }); });
    // hydrants are sidewalk obstacles too (the same positions the kerb rules use)
    this.hydrantObs = this.parking.hydrantsNear(-540, -790, 1100).map((h) => ({ x: h.x, z: h.z, r: 0.22 }));
    this.setObstacles([]);
    this.subway = new Subway(core);
    this.doors = new Doors(core);
    this.vendors = new Vendors(core, () => this.parking.dow);
    this.parked = new ParkedCars(core, this.parking);
    core.parked = this.parked;
    core.onThreat = (x, z, r) => this.vendors.onThreat(x, z, r);
    core.doorArrived = (p, id) => this.doors.arrived(p, id);
    core.doorStepIn = (p) => this.doors.stepIn(p);
    this.wild = new Wildlife(core, g.wild, Math.round(this.opts.maxPeds * 0.5), Math.round(this.opts.maxPeds * 0.15));
    g.links.forEach((l, i) => {
      if (l.kind !== LinkKind.Lane || !net.isSignal(l.endJ)) return;
      const o = [0, 0, 0, 0]; sampleAt(l.pts, net.cum[i], net.len[i], o);
      this.stopLines.push({ lane: i, x: o[0], z: o[1] });
    });
  }

  get graph(): LaneGraph { return this.net.g; }
  get network(): Network { return this.net; }
  /** Simulated seconds since load. */
  get time() { return this.core.t; }
  get stats(): Readonly<Stats> { return this.core.stats; }
  get archetypeWarnings(): readonly string[] { return this.core.reg.warnings; }
  get archetypes() { return this.core.reg.list.map((a) => a.def); }

  update(dt: number, focus: { x: number; z: number }): void {
    const t0 = performance.now();
    const S = this.core;
    S.focus.x = focus.x; S.focus.z = focus.z;
    const jump = !this.started || Math.hypot(focus.x - this.lastFocus.x, focus.z - this.lastFocus.z) > 150;
    this.lastFocus = { x: focus.x, z: focus.z };
    if (jump) { this.clearFar(); this.started = true; rebuildOcc(S); spawnVehicles(S, 1000, true); spawnPeds(S, 1000, true); }
    this.acc += Math.min(dt, 0.25);
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 6) { this.step(SIM_DT); this.acc -= SIM_DT; steps++; }
    if (steps === 6) this.acc = 0;
    this.writeViews(this.acc / SIM_DT);
    this.lastUpdateMs = performance.now() - t0;
    this.lastSteps = steps;
  }

  /** One fixed step. Public for tests. */
  step(h: number) {
    const S = this.core;
    S.t += h;
    S.minute = this.minute; S.weather = this.weather; S.densityHook = this.densityHook;
    // expire events
    if (S.blocks.length) S.blocks = S.blocks.filter((b) => b.until > S.t);
    for (const [r, until] of S.closedRoads) if (until <= S.t) S.closedRoads.delete(r);
    rebuildOcc(S);
    S.pGrid.clear();
    for (let i = 0; i < S.peds.length; i++) S.pGrid.add(S.peds[i].x, S.peds[i].z, i);
    S.vGrid.clear();
    for (let i = 0; i < S.vehicles.length; i++) S.vGrid.add(S.vehicles[i].x, S.vehicles[i].z, i);
    stepVehicles(S, h);
    dodgeActors(S);
    for (const p of S.peds) if (p.cop2 && p.alive) policePedTick(S, p);
    stepPeds(S, h);
    bumpReactions(S, h);
    separatePeds(S, this.sepParity ^= 1);
    vehicleContacts(S, this.contactCd);
    this.wild.step(h);
    this.parking.step(h);
    this.subway.step(h);
    this.doors.step(h);
    this.vendors.step(h);
    this.memory.step(h);
    // despawn
    const [, rV] = S.ringV, [, rP] = S.ringP;
    for (const v of S.vehicles) {
      if (!v.alive) continue;
      const d = Math.hypot(v.x - S.focus.x, v.z - S.focus.z);
      const dwelling = v.state !== 'drive';
      if (v.ride || (v.cop && (!v.cop.role || v.cop.role === 'police' || v.cop.mode !== 'idle'))) continue; // police, working responders and ride cabs stay
      if (d > rV + 30) despawnVehicle(S, v);
      else if (!dwelling && v.blockedBy !== 'red' && ((v.stopT > 60 && d > 70) || v.stopT > 150)) { despawnVehicle(S, v); S.stats.stuckDespawn++; const k = `${v.blockedBy || 'queue'}`; this.stuckWhy[k] = (this.stuckWhy[k] ?? 0) + 1; if (this.stuckLog.length < 60) this.stuckLog.push(this.queueHead(v)); }
    }
    for (const p of S.peds) if (p.alive && !p.goal && !p.cop2 && p.state !== 'dead' && p.state !== 'external' && !(p.vendor && p.state === 'vendor') && Math.hypot(p.x - S.focus.x, p.z - S.focus.z) > rP + 20) { despawnPed(S, p); S.stats.despawnedP++; }
    // compact
    if (S.vehicles.some((v) => !v.alive)) S.vehicles = S.vehicles.filter((v) => v.alive);
    if (S.peds.some((p) => !p.alive)) {
      for (const p of S.peds) if (!p.alive) { S.pedById.delete(p.id); if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1; }
      S.peds = S.peds.filter((p) => p.alive);
      for (const [k, l] of S.onWalk) { const f = l.filter((p) => p.alive && p.edge === k); S.onWalk.set(k, f); }
    }
    if (this.contactCd.size > 500) for (const [k, t] of this.contactCd) if (t < S.t) this.contactCd.delete(k);
    cullBehindView(S, h); cullPedsBehindView(S, h); feedEdgeLanes(S, h);
    spawnVehicles(S, 2, false);
    spawnPeds(S, 3, false);
    // now and then an ambulance runs through with its siren on (ambient; Gameplay dispatches the rest)
    if ((this.ambulanceT -= h) <= 0) {
      this.ambulanceT = S.rng.range(150, 320);
      const a = S.rng.next() * Math.PI * 2, r = S.rng.range(40, S.ringV[0]);
      dispatchResponders(S, 'ambulance', S.focus.x + Math.cos(a) * r, S.focus.z + Math.sin(a) * r);
    }
    // foot traffic: once a sim minute, fold counts into a rolling per-minute average (observed blocks only)
    if (Math.floor(S.t / 60) !== Math.floor((S.t - h) / 60)) {
      for (const e of this.net.sidewalksNear(S.focus.x, S.focus.z, S.ringP[0], new Set())) {
        const r = this.net.g.walkEdges[e].owner;
        if (this.footSeen.has(r)) continue; this.footSeen.add(r);
        S.footAvg[r] = S.footAvg[r] * 0.7 + S.footCount[r] * 0.3;
      }
      this.footSeen.clear(); S.footCount.fill(0);
    }
  }
  private footSeen = new Set<number>();
  private sepParity = 0;

  private clearFar() {
    const S = this.core;
    for (const v of S.vehicles) if (Math.hypot(v.x - S.focus.x, v.z - S.focus.z) > S.ringV[1]) despawnVehicle(S, v);
    for (const p of S.peds) if (Math.hypot(p.x - S.focus.x, p.z - S.focus.z) > S.ringP[1]) despawnPed(S, p);
    S.vehicles = S.vehicles.filter((v) => v.alive);
    S.peds = S.peds.filter((p) => p.alive);
    for (const [k, l] of S.onWalk) S.onWalk.set(k, l.filter((p) => p.alive));
  }

  private writeViews(alpha: number) {
    const S = this.core;
    this.wild.writeViews(alpha);
    this.writePolice();
    const lerpYaw = (a: number, b: number) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * alpha; };
    const vs = this.vehicles as TrafficVehicleView[];
    while (vs.length < S.vehicles.length) vs.push({ id: 0, vclass: 'sedan', variant: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, lights: 0, state: '' });
    vs.length = S.vehicles.length;
    S.vehicles.forEach((v, i) => {
      const o = vs[i];
      o.id = v.id; o.vclass = v.vclass; o.variant = v.variant; o.lights = v.lights;
      o.x = v.px + (v.x - v.px) * alpha; o.z = v.pz + (v.z - v.pz) * alpha; o.y = heightAt(o.x, o.z);
      o.yaw = lerpYaw(v.pyaw, v.yaw); o.speed = v.v;
      o.state = v.state === 'drive' ? (v.blockedBy ? (v.blockedBy === 'red' ? 'stopped' : 'yielding') : v.v < 0.3 ? 'queue' : v.lcT < 1 ? 'laneChange' : 'drive')
        : v.state === 'doubleParked' ? 'doublePark' : v.state === 'curb' ? (v.stopKind || 'pickup') : v.state;
    });
    const ps = this.peds as PedView[];
    while (ps.length < S.peds.length) ps.push({ id: 0, archetype: '', nerve: 0, onRoad: false, carry: '', x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
    ps.length = S.peds.length;
    S.peds.forEach((p, i) => {
      const o = ps[i];
      o.id = p.id; o.archetype = p.arch.def.id; o.nerve = p.nerve; o.onRoad = p.onRoad; o.carry = p.carry ?? ''; o.x = p.px + (p.x - p.px) * alpha; o.z = p.pz + (p.z - p.pz) * alpha;
      // sidewalk top = road surface + kerb (src/shared/terrain.ts); in the roadway = road surface
      o.y = heightAt(o.x, o.z) + (p.y > 0 ? CURB_HEIGHT : 0);
      o.yaw = lerpYaw(p.pyaw, p.yaw); o.speed = p.v; o.variant = p.variant;
      o.state = p.state === 'act' ? `act:${p.actName}` : p.state === 'free' ? (p.jaywalking ? 'jaywalking' : p.then === 'flee' ? 'flee' : 'stepping') : p.onRoad ? (p.jaywalking ? 'jaywalking' : 'crossing') : p.state;
    });
  }

  private writePolice() {
    const out = this.policeViews; let n = 0;
    for (const v of this.core.vehicles) if (v.cop && (!v.cop.role || v.cop.role === 'police')) { out[n++] = { id: v.cop.id, kind: 'car', x: v.x, z: v.z, yaw: v.yaw, speed: v.v, mode: v.cop.mode, siren: v.cop.siren, agentId: v.id }; }
    for (const p of this.core.peds) if (p.cop2) { out[n++] = { id: p.cop2.id, kind: 'foot', x: p.x, z: p.z, yaw: p.yaw, speed: p.v, mode: p.cop2.mode, siren: false, agentId: p.id }; }
    out.length = n;
  }
  private policeViews: PoliceView[] = [];
  /** Police agents (cars also appear in `vehicles` as vclass 'police'; foot cops in `peds`). */
  get police(): readonly PoliceView[] { return this.policeViews; }

  // ---------------------------------------------------------------- police (Gameplay keeps the decisions; the sim moves them)
  /** Spawn a police car on the nearest lane or a foot cop on the nearest sidewalk. Returns the police id (== agent id), or -1. */
  /** `respondTo`: start a car about 25 s of siren driving from that point (a unit already on patrol nearby); x/z are then ignored. */
  spawnPolice(opts: { kind: 'foot' | 'car'; x: number; z: number; precinct?: string; siren?: boolean; respondTo?: { x: number; z: number } }): number {
    const r = spawnCop(this.core, opts); return r ? r.cop.id : -1;
  }
  setPoliceGoal(id: number, goal: PoliceGoal): boolean {
    const a = this.copAgent(id); if (!a) return false;
    setCopGoal(this.core, a.cop, a.agent, goal); return true;
  }
  /** Siren on/off for a police car. */
  setSiren(id: number, on: boolean) { const a = this.copAgent(id); if (a) a.cop.siren = on; }
  despawnPolice(id: number): boolean {
    const a = this.copAgent(id); if (!a) return false;
    removePolice(this.core, a.agent, a.cop.kind === 'car'); return true;
  }
  private copAgent(id: number) {
    for (const v of this.core.vehicles) if (v.cop?.id === id && v.alive) return { cop: v.cop, agent: v as Vehicle | Ped };
    for (const p of this.core.peds) if (p.cop2?.id === id && p.alive) return { cop: p.cop2, agent: p as Vehicle | Ped };
    return null;
  }

  // ---------------------------------------------------------------- emergency, service, cab rides
  /** Send an ambulance (or a fire engine + ladder truck) to a scene, sirens on. Returns vehicle ids.
   *  Events: dispatched, responderArrived {id, role}, responderLeft. */
  dispatch(role: 'ambulance' | 'fire', x: number, z: number): number[] { return dispatchResponders(this.core, role, x, z); }
  /** Player cab: the nearest free cab comes to the kerb by (x,z). Returns cab id or -1. Event `cabReady {cabId}` when waiting. */
  callCab(x: number, z: number): number { return callCab(this.core, x, z); }
  /** Player gets in: the cab drives to `dest` by the legal shortest route. Events: cabTurnAhead {dir, street, distance}, cabRideArrived. */
  boardCab(cabId: number, dest: { x: number; z: number }): boolean { return boardCab(this.core, cabId, dest); }
  /** Player gets out (or cancels): the cab goes back to cruising. */
  leaveCab(cabId: number): boolean { return leaveCab(this.core, cabId); }
  private ambulanceT = 120;

  // ---------------------------------------------------------------- kerbside rules, enforcement, tows, street cleaning
  private parking!: Parking;
  // ---------------------------------------------------------------- memory of the player (memory.ts)
  private memory!: Memory;
  /**
   * Gameplay: something the player did at (x, z) that the street remembers: helped | tipped | bumped | knockdown |
   * reckless | theft | robbed | assault | gunfire | killed. The block's reputation shifts (decays over ~15 min
   * half-life) and witnesses within the kind's radius remember it personally (~10 min); `pedId` = the person it
   * was done to/for. Player bumps, `kill(..., byPlayer)` and `emit({..., byPlayer})` are recorded automatically.
   */
  remember(kind: MemKind, x: number, z: number, opts: { witnessR?: number; pedId?: number } = {}) { this.memory.remember(kind, x, z, opts); }
  /** The player's standing on the block at (x, z): `{score, last, ago}` (score < 0 = feared/resented). */
  reputation(x: number, z: number) { return this.memory.reputation(x, z); }
  /** Greetings emitted so far (`pedGreets` events). */
  get greetings() { return this.memory.greetings; }
  /** Day of week for kerb rules (0 Sun .. 6 Sat; default Friday, 21 June 1974). */
  setDay(dow: number) { this.parking.dow = ((Math.floor(dow) % 7) + 7) % 7; }
  /** Can a car park at this kerb now (or at `minute`/`dow`)? Reasons, tow-away and fine tier. */
  parkingRule(x: number, z: number, minute?: number, dow?: number): ParkingRule { return this.parking.rule(x, z, minute, dow); }
  /** Hydrant positions on the kerbs near a point (the same ones the rules use; place props here). */
  hydrantsNear(x: number, z: number, r: number) { return this.parking.hydrantsNear(x, z, r); }
  /** A parked car the sim should enforce against (the player's). Events: ticketIssued, towDispatched, vehicleTowed. */
  registerParkedCar(id: string, x: number, z: number) { this.parking.register(id, x, z); }
  unregisterParkedCar(id: string) { this.parking.unregister(id); }

  // ---------------------------------------------------------------- traffic-signal heads (engine props)
  private heads: SignalHead[] | null = null;
  /**
   * Static list of signal heads to place (call after load): one vehicle head per signalised approach and a
   * pedestrian WALK/DON'T WALK head at each crosswalk end. Use this, not the OSM POIs: it includes the
   * junctions the sim signalises itself, so every lit head is one the cars obey.
   */
  signalHeads(): readonly SignalHead[] { return (this.heads ??= buildSignalHeads(this.core.net)); }
  /** Per-frame states, one byte per head (SignalState: 0 dark, 1 red, 2 yellow, 3 green, 4 DON'T WALK, 5 flashing, 6 WALK). */
  signalStates(out?: Uint8Array): Uint8Array {
    const h = this.signalHeads(); const o = out && out.length >= h.length ? out : new Uint8Array(h.length);
    writeSignalStates(this.core.net, h as SignalHead[], this.core.t, o); return o;
  }

  // ---------------------------------------------------------------- street graph queries
  /**
   * Real intersections (lane-graph junctions where 2+ named streets meet) within `radius` of a point,
   * nearest first. For chokepoints and roadblocks; `armYaw` are the yaws of the approach roads
   * (direction pointing away from the junction) so a car can be placed across one.
   */
  nearestIntersections(x: number, z: number, radius: number, max = 16) {
    const net = this.core.net, out: { id: number; x: number; z: number; dist: number; signal: boolean; streets: string[]; armYaw: number[] }[] = [];
    net.g.junctions.forEach((J, id) => {
      const d = Math.hypot(J.x - x, J.z - z); if (d > radius || edgeDistance(J.x, J.z) < 0) return;
      const streets = [...new Set(J.arms.map((a) => net.roadName(a.road)).filter((n) => n))];
      if (streets.length < 2) return; // bends and mid-block merges aren't chokepoints
      out.push({ id, x: J.x, z: J.z, dist: d, signal: net.isSignal(id), streets, armYaw: J.arms.map((a) => Math.atan2(-a.dirX, -a.dirZ)) });
    });
    return out.sort((a, b) => a.dist - b.dist).slice(0, max);
  }

  // ---------------------------------------------------------------- subway (logical layer over the street entrances)
  private subway!: Subway;
  /** Stations (clusters of street entrances) with their line, name and entrances. */
  subwayStations(): readonly Station[] { return this.subway.stations; }
  /** Next trains at a station, both directions, soonest first (deterministic timetable). */
  nextTrains(stationId: number, n = 4): TrainCall[] { return this.subway.nextTrains(stationId, n); }
  /** Seconds a train takes from leaving one station to arriving at another on the same line (and which way). */
  trainTravel(fromStation: number, toStation: number) { return this.subway.trainTravel(fromStation, toStation); }
  /** Riders waiting on the platforms. */
  platformCrowd(stationId: number) { return this.subway.platformCrowd(stationId); }
  stationNear(x: number, z: number, r = 150): number { return this.subway.stationNear(x, z, r); }
  /** Send a pedestrian down the nearest station's stairs (they leave the street; counted on the platform). */
  boardSubway(pedId: number): boolean {
    const p = this.core.pedById.get(pedId); if (!p || !p.alive) return false;
    const st = this.subway.stationNear(p.x, p.z, 400); if (st < 0) return false;
    const e = this.subway.stations[st].entrances.reduce((b, q) => (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? q : b));
    setPedGoal(this.core, p, { kind: 'goto', x: e.x, z: e.z, then: 'subway' }); return true;
  }
  /** Subway counters (tests/debug). */
  debugSubway() { return { stations: this.subway.stations.length, arrivals: this.subway.arrivals, boarded: Math.round(this.subway.boarded), alighted: this.subway.alighted }; }

  // ---------------------------------------------------------------- doors (interiors hand-off)
  private doors!: Doors;
  /** Doors near the player (from interiors `doorsForChunk`): pedestrians use them. Re-sending an id updates it. */
  setDoors(doors: DoorRec[]) { this.doors.set(doors); }
  /** Override per-kind door rates (interiors tuning); unspecified fields keep the built-in table (DOOR_RATES). */
  setDoorRates(t: Record<string, Partial<DoorRate>>) { this.doors.setRates(t); }
  clearDoors(ids?: string[]) { this.doors.clear(ids); }
  /** An interior occupant walks out onto the street. Returns the ped id or -1. Event `pedExitedDoor`. */
  exitFromDoor(doorId: string, archetypeId?: string): number { return this.doors.exitFromDoor(doorId, archetypeId); }
  /** A street ped goes in through a door. Event `pedEnteredDoor {doorId, pedId, archetype}` at the threshold. */
  enterDoor(pedId: number, doorId: string): boolean { const p = this.core.pedById.get(pedId); return !!p && p.alive && this.doors.enterDoor(p, doorId); }
  // ---------------------------------------------------------------- street vendors (vendors.ts)
  private vendors!: Vendors;
  /** Vendors near the focus: stall/cart props and their state (engine renders the props, characters the people). */
  get vendorViews(): readonly VendorView[] { return this.vendors.views; }
  /** Gameplay: the vendor was robbed etc. (`flee` | `cower`, optionally away from x,z). */
  vendorCommand(vendorId: string, cmd: { type: 'flee' | 'cower'; x?: number; z?: number }): boolean { return this.vendors.command(vendorId, cmd); }
  /** Gameplay notices: `cartOverturned` (right it, close 2 h), `vendorSale` (serve + make change), `monteFolded` (crew walks off). */
  vendorNotice(n: { kind: 'cartOverturned' | 'vendorSale' | 'monteFolded'; vendor: string; good?: string }): boolean { return this.vendors.notice(n); }
  private parked!: ParkedCars;
  /**
   * Parked cars along the kerbs within r of (x, z): static instances for the traffic renderer. Deterministic
   * per place and day; they follow the kerb rules (hydrants, bus stops, corners, avenue rush-hour no-standing,
   * the alternate-side cleaning window), so refresh when the focus moves ~100 m or on the quarter hour.
   * Fields: x, z, yaw (heading = (-sin, -cos)), vclass, variant, len, wid (+ lane, s, side for debugging).
   */
  parkedCars(x: number, z: number, r: number): ParkedCar[] { return this.parked.near(x, z, r); }
  /** Vehicles' cart physics: a cart came to rest somewhere else after a shove (call once it settles). */
  vendorCartMoved(vendorId: string, x: number, z: number, yaw: number): boolean { return this.vendors.cartMoved(vendorId, x, z, yaw); }
  debugVendors() { return { count: this.vendors.count, byKind: this.vendors.byKind(), sales: this.vendors.sales, scatters: this.vendors.scatters, movedOn: this.vendors.movedOn, calls: this.vendors.calls }; }

  // ---------------------------------------------------------------- handing a ped to gameplay (brawls)
  /**
   * Gameplay takes over a pedestrian's movement (a shoved man turned brawler, an angry vendor): the sim
   * stops moving it, never despawns it, and draws it wherever `moveReleasedPed` puts it, until `reclaimPed`
   * (or its death). Returns false for unknown/dead peds.
   */
  /**
   * A short one-off action played in place (gameplay: `shove` on shovedBack, `point`, `shout`...): the ped
   * holds still for `duration` s with PedView.state `act:<name>` and then carries on. Emits `pedAct`.
   */
  pedAct(pedId: number, act: string, duration = 0.9): boolean {
    const p = this.core.pedById.get(pedId); if (!p || !p.alive || p.state === 'dead' || p.state === 'external') return false;
    if (p.vendor && p.state === 'vendor') { this.core.emit('pedAct', { id: p.id, act, vendor: p.vendor }); return true; } // a stall vendor stays put; the animation plays at the cart
    setPedGoal(this.core, p, { kind: 'act', name: act, duration });
    this.core.emit('pedAct', { id: p.id, act }); return true;
  }
  releasePed(pedId: number): boolean {
    const p = this.core.pedById.get(pedId); if (!p || !p.alive || p.state === 'dead') return false;
    if (p.vendor && p.state === 'vendor') this.vendors.setReleased(pedId, true);
    p.goal = null; p.path = []; p.state = 'external'; p.v = 0; return true;
  }
  moveReleasedPed(pedId: number, x: number, z: number, yaw: number, speed = 0): boolean {
    const p = this.core.pedById.get(pedId); if (!p || p.state !== 'external') return false;
    p.px = p.x; p.pz = p.z; p.x = x; p.z = z; p.yaw = yaw; p.v = speed; return true;
  }
  /** Hand it back: it walks to the nearest sidewalk and carries on (a vendor goes back to the stall). */
  reclaimPed(pedId: number): boolean {
    const S = this.core, p = S.pedById.get(pedId); if (!p || p.state !== 'external') return false;
    if (p.vendor) { this.vendors.setReleased(pedId, false); return true; }
    let be = -1, bd = 60, bs = 0;
    for (const e of this.net.sidewalksNear(p.x, p.z, 60, new Set())) { const pr = projectOnPoly(this.net.g.walkEdges[e].pts, p.x, p.z); if (pr.d < bd) { bd = pr.d; be = e; bs = pr.s; } }
    if (be < 0) { despawnPed(S, p); return true; }
    sampleAt(this.net.g.walkEdges[be].pts, this.net.walkCum[be], bs, tmp4);
    p.toEdge = be; p.toS = bs; p.state = 'free'; p.tx = tmp4[0]; p.tz = tmp4[1]; p.then = 'attach';
    S.emit('pedCalmed', { id: p.id }); return true;
  }

  debugDoors() { return { doors: this.doors.count, entered: this.doors.entered, exited: this.doors.exited }; }

  // ---------------------------------------------------------------- violence and theft (gameplay)
  /** Stop simulating a pedestrian and leave the body for `bodySeconds`. */
  kill(pedId: number, bodySeconds = 120, byPlayer = false): boolean {
    const p = this.core.pedById.get(pedId); if (!p || !p.alive) return false;
    if (byPlayer) this.memory.remember('killed', p.x, p.z);
    killPed(this.core, p, bodySeconds); return true;
  }
  /**
   * The player takes a sim car. The car leaves the sim (the engine spawns its own drivable copy from
   * the returned class/variant/pose); its driver steps out at the kerb and gives chase on foot for a
   * few seconds. Emits `vehicleStolen {vehicleId, ownerPedId, x, z}`.
   */
  takeVehicle(vehicleId: number): { ownerPedId: number; vclass: string; variant: number; x: number; z: number; yaw: number } | null {
    const S = this.core, v = S.vehicles.find((w) => w.id === vehicleId && w.alive);
    if (!v || v.cop) return null;
    const res = { ownerPedId: -1, vclass: v.vclass as string, variant: v.variant, x: v.x, z: v.z, yaw: v.yaw };
    despawnVehicle(S, v);
    const arch = S.reg.list.find((a) => a.def.id === 'npc.commuter') ?? S.reg.list.find((a) => a.behaviour === 'walker');
    const owner = arch ? spawnPedNear(S, res.x, res.z, arch, 30) : null;
    if (owner) {
      res.ownerPedId = owner.id; owner.nerve = Math.max(owner.nerve, 0.6);
      setPedGoal(S, owner, { kind: 'follow', target: 'player', maxSpeed: 4.2, urgent: true, until: S.t + S.rng.range(6, 10) });
    }
    S.emit('vehicleStolen', { vehicleId, ownerPedId: res.ownerPedId, x: res.x, z: res.z });
    return res;
  }

  /** Road (block-face) id of the sidewalk nearest to (x,z), or -1. Use with footTraffic(). */
  blockAt(x: number, z: number): number {
    const g = this.net.g;
    let best = -1, bd = 25;
    for (const e of this.net.sidewalksNear(x, z, 25, new Set())) { const d = projectOnPoly(g.walkEdges[e].pts, x, z).d; if (d < bd) { bd = d; best = g.walkEdges[e].owner; } }
    return best;
  }
  /** Rolling average of pedestrians entering this block's sidewalks per minute (both sides). Only blocks
   *  near the sim focus are observed; elsewhere it holds its last value (Economy can blend with time of day). */
  footTraffic(blockId: number): number { return this.core.footAvg[blockId] ?? 0; }

  setExternalActors(actors: Actor[]): void { if (this.core) this.core.actors = actors.slice(); }

  emit(event: { type: 'threat' | 'blockLane' | 'closeStreet' | 'gunfire'; x: number; z: number; radius?: number; until?: number; loudness?: number; byPlayer?: boolean }): void {
    const S = this.core, net = this.net;
    if (event.byPlayer && (event.type === 'gunfire' || event.type === 'threat')) this.memory.remember(event.type === 'gunfire' ? 'gunfire' : 'assault', event.x, event.z, event.type === 'gunfire' ? { witnessR: Math.min(120, (event.loudness ?? event.radius ?? 120) * 0.6) } : {});
    const until = event.until ?? S.t + 60;
    if (event.type === 'gunfire') {
      const loud = event.loudness ?? event.radius ?? 120;
      gunfire(S, event.x, event.z, loud);
      this.wild.alarm(event.x, event.z, loud * 0.8);
      for (const v of S.vehicles) if (Math.hypot(v.x - event.x, v.z - event.z) < loud * 0.5) honk(S, v, 'gunfire', 1);
    } else if (event.type === 'threat') {
      const r = event.radius ?? 25;
      threaten(S, event.x, event.z, r);
      this.wild.alarm(event.x, event.z, r * 2);
      for (const v of S.vehicles) if (Math.hypot(v.x - event.x, v.z - event.z) < r * 1.5) honk(S, v, 'threat', 1);
    } else if (event.type === 'blockLane') {
      const r = event.radius ?? 6;
      let best = -1, bs = 0, bd = r;
      const o = [0, 0, 0, 0];
      for (const l of net.lanesNear(event.x, event.z, r + 10, new Set())) {
        const len = net.len[l];
        for (let s = 0; s <= len; s += 1) { sampleAt(net.g.links[l].pts, net.cum[l], s, o); const d = Math.hypot(o[0] - event.x, o[1] - event.z); if (d < bd) { bd = d; best = l; bs = s; } }
      }
      if (best >= 0) S.blocks.push({ link: best, s: bs, until });
    } else if (event.type === 'closeStreet') {
      const r = event.radius ?? 30;
      const o = [0, 0, 0, 0];
      for (const l of net.lanesNear(event.x, event.z, r + 10, new Set())) {
        sampleAt(net.g.links[l].pts, net.cum[l], net.len[l] / 2, o);
        if (Math.hypot(o[0] - event.x, o[1] - event.z) < r + net.len[l] / 2) S.closedRoads.set(net.g.links[l].owner, until);
      }
      // physically stop traffic at the closure: block every lane of those roads at the point nearest the event
      for (const r2 of S.closedRoads.keys()) for (const l of net.roadLanes[r2]) {
        let bs = 0, bd = Infinity;
        for (let s = 0; s <= net.len[l]; s += 2) { sampleAt(net.g.links[l].pts, net.cum[l], s, o); const d = Math.hypot(o[0] - event.x, o[1] - event.z); if (d < bd) { bd = d; bs = s; } }
        if (bd < r) S.blocks.push({ link: l, s: bs, until });
      }
    }
  }

  on(type: SimEventType | string, cb: (e: any) => void): void { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)!).push(cb); }
  private fire(type: string, e: Record<string, unknown>) {
    if (type === 'subwayEnter' && this.subway) this.subway.riderEntered(e.x as number, e.z as number);
    const l = this.listeners.get(type), any = this.listeners.get('*');
    if (l || any) { e.type = type; e.t = this.core.t; if (l) for (const cb of l) cb(e); if (any) for (const cb of any) cb(e); }
  }

  // ---------------------------------------------------------------- gameplay / narrative hooks
  /**
   * Who could notice an event at (x,z)? `loudness` = audible radius (m), `visibility` = visible radius (m).
   * Peds see within a forward cone (not behind them); drivers see all around but hear less (windows up).
   * Building occlusion is not modelled here: callers raycast against city colliders if they need it.
   */
  perceive(ev: { x: number; z: number; loudness?: number; visibility?: number }): { peds: Witness[]; vehicles: Witness[] } {
    const S = this.core, loud = ev.loudness ?? 0, vis = ev.visibility ?? 0, r = Math.max(loud, vis);
    const peds: Witness[] = [], vehicles: Witness[] = [];
    for (const p of S.peds) {
      const dx = ev.x - p.x, dz = ev.z - p.z, d = Math.hypot(dx, dz); if (d > r) continue;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), facing = d < 1e-3 ? 1 : (dx * fx + dz * fz) / d;
      const saw = d <= vis && (facing > -0.3 || d < 4), heard = d <= loud;
      if (saw || heard) peds.push({ id: p.id, distance: d, saw, heard, archetype: p.arch.def.id });
    }
    for (const v of S.vehicles) {
      const d = Math.hypot(ev.x - v.x, ev.z - v.z); if (d > r) continue;
      const saw = d <= vis, heard = d <= loud * 0.6;
      if (saw || heard) vehicles.push({ id: v.id, distance: d, saw, heard, archetype: v.arch.def.id });
    }
    peds.sort((a, b) => a.distance - b.distance); vehicles.sort((a, b) => a.distance - b.distance);
    return { peds, vehicles };
  }
  /** Give one pedestrian a scripted goal (goto / follow / escort / flee / flagDownCar); null clears it. Peds with goals don't despawn. */
  setGoal(pedId: number, goal: PedGoal | null): boolean {
    const p = this.core.pedById.get(pedId); if (!p || !p.alive) return false;
    setPedGoal(this.core, p, goal); return true;
  }
  /**
   * Escort / companion locomotion (narrative N4): walk `route` on the sidewalk graph, pacing against the
   * player (or `opts.target`): waits when they fall more than `waitRadius` behind, leads when they get ahead.
   * Emits `escortProgress {id, segment, of}` per waypoint and `escortDone {id}`.
   */
  escort(pedId: number, route: { x: number; z: number }[], opts: { waitRadius?: number; maxSpeed?: number; target?: string | number } = {}): boolean {
    return this.setGoal(pedId, { kind: 'escort', waypoints: route, ...opts });
  }
  /**
   * Cutscene → play hand-off (UI `actor.handoff` cue / ActorHost.handOff): a live pedestrian appears at
   * exactly the cutscene's last pose (position, yaw, and the walking speed it ended on, so there's no pop),
   * steps onto the sidewalk band and then:
   *  - `companion`: follows `follow` (default the player) with escort pacing; give it a route later with
   *    `escort(pedId, ...)` for a walk-and-talk;
   *  - `stay`: holds at the pose (talking, waiting) until given a goal;
   *  - `ambient`: becomes an ordinary walker.
   * `cast` is the archetype/character id (unknown ids fall back to a plain walker with a warning).
   * Returns the pedestrian id (or -1); emits `actorHandedOff {cast, cue, pedId}`. Companions never despawn.
   */
  handOff(cue: { id?: string; cast: string; x: number; z: number; yaw: number; speed?: number; after: 'companion' | 'stay' | 'ambient'; follow?: string | number; waitRadius?: number; maxSpeed?: number }): number {
    const S = this.core;
    let arch = S.reg.list.find((a) => a.def.id === cue.cast);
    if (!arch) { S.reg.warnings.push(`handOff: unknown cast '${cue.cast}', using a walker`); arch = S.reg.pick((a) => a.behaviour === 'walker' || a.behaviour === 'commuter', cue.x, cue.z, S.minute, 0.5) ?? undefined; }
    if (!arch) return -1;
    const p = spawnPedNear(S, cue.x, cue.z, arch, 25);
    if (!p) return -1;
    // exactly the cutscene pose, then step to the walking band
    p.x = p.px = cue.x; p.z = p.pz = cue.z; p.yaw = p.pyaw = cue.yaw; p.v = cue.speed ?? 0;
    const e = S.net.g.walkEdges[p.edge]; sampleAt(e.pts, S.net.walkCum[p.edge], p.s, tmp4);
    p.state = 'free'; p.then = 'attach'; p.toEdge = p.edge; p.toS = p.s; p.tx = tmp4[0]; p.tz = tmp4[1];
    if (cue.after === 'companion') setPedGoal(S, p, { kind: 'follow', target: cue.follow ?? 'player', waitRadius: cue.waitRadius ?? 10, maxSpeed: cue.maxSpeed ?? 2.4 });
    else if (cue.after === 'stay') setPedGoal(S, p, { kind: 'act', name: 'idle' });
    S.emit('actorHandedOff', { cast: cue.cast, cue: cue.id ?? '', pedId: p.id, after: cue.after });
    return p.id;
  }

  /** Brownout (narrative N2): signals inside the circle go dark (all-way stop) or come back. */
  setSignalPower(area: { x: number; z: number; radius: number }, powered: boolean) {
    this.net.g.junctions.forEach((j, i) => { if (Math.hypot(j.x - area.x, j.z - area.z) <= area.radius) { if (powered) this.net.dark.delete(i); else this.net.dark.add(i); } });
  }

  /**
   * Camera for spawn placement (optional, per frame or when it turns): with it, traffic also spawns close
   * by where the camera isn't looking, so the near field is full from the first frame after a turn-around.
   * forward is any horizontal direction; fovDeg the horizontal field of view.
   */
  setView(x: number, z: number, fwdX: number, fwdZ: number, fovDeg = 75, fadeDist = 60) {
    const l = Math.hypot(fwdX, fwdZ) || 1;
    this.core.view = { x, z, dx: fwdX / l, dz: fwdZ / l, cosHalf: Math.cos((fovDeg / 2) * Math.PI / 180), fade: fadeDist };
  }
  /**
   * Static sidewalk obstacles pedestrians step around (engine street furniture: mailboxes, newsstands,
   * trash baskets, call boxes, phone booths, sign posts...). Replaces the previous list; the sim's own
   * hydrants are always included. r = footprint radius (m).
   */
  setObstacles(list: { x: number; z: number; r: number }[]) {
    const S = this.core;
    S.obsBase = [...this.hydrantObs, ...list]; S.obstacles = [...S.obsBase];
    S.obsGrid.clear(); S.obstacles.forEach((o, i) => S.obsGrid.add(o.x, o.z, i));
  }
  private hydrantObs: { x: number; z: number; r: number }[] = [];
  setClock(minutesSinceMidnight: number): void { this.minute = ((minutesSinceMidnight % 1440) + 1440) % 1440; }
  setWeather(w: 'clear' | 'overcast' | 'rain'): void { this.weather = w; }
  /** Optional hook: spawn-probability multiplier (0..1) by place, e.g. per district. */
  setDensityHook(fn: ((x: number, z: number, kind: 'vehicle' | 'ped') => number) | null) { this.densityHook = fn; }
  /**
   * The same as setDensityHook as plain data (works across a worker boundary): accept probability by area,
   * the last matching box wins, 1 outside all of them. `vehicle`/`ped` default to `both`.
   */
  setDensityAreas(areas: { minX: number; maxX: number; minZ: number; maxZ: number; both?: number; vehicle?: number; ped?: number }[] | null) {
    if (!areas || !areas.length) { this.densityHook = null; return; }
    const list = areas.slice();
    this.densityHook = (x, z, kind) => {
      for (let i = list.length - 1; i >= 0; i--) { const a = list[i]; if (x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ) return (kind === 'vehicle' ? a.vehicle : a.ped) ?? a.both ?? 1; }
      return 1;
    };
  }
  /** Register more archetypes after load (content hot reload). */
  registerArchetypes(defs: ArchetypeDef[]) { if (this.core) this.core.reg.register(defs); else this.pendingArchetypes.push(...defs); }

  /** Stop lines of signalized approaches with their current state (debug view). */
  debugStopLines(out: { x: number; z: number; state: 'green' | 'yellow' | 'red' | 'dark' }[] = []) {
    out.length = 0;
    for (const s of this.stopLines) {
      const st = this.net.laneSignal(s.lane, this.core.t);
      out.push({ x: s.x, z: s.z, state: st === Sig.Green ? 'green' : st === Sig.Yellow ? 'yellow' : st === Sig.Red ? 'red' : 'dark' });
    }
    return out;
  }

  /** Wildlife counters and raw animals (tests/debug). */
  debugWildlife() { return { startles: this.wild.startles, scatters: this.wild.scatters, feeders: this.wild.feeders, groups: this.wild.groupCount, animals: this.wild.allAnimals() }; }
  /** Raw internal agents, for tests and debug tools only. */
  debugAgents(): { vehicles: readonly Vehicle[]; peds: readonly Ped[]; core: SimCore } { return { vehicles: this.core.vehicles, peds: this.core.peds, core: this.core }; }
}
