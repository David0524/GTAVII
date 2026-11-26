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
import { LinkKind, type LaneGraph, readLaneGraph } from './laneFormat';
import { AgentGrid, Network, Sig } from './network';
import { despawnPed, dodgeActors, gunfire, setPedGoal, spawnPedAt, spawnPeds, stepPeds, threaten } from './peds';
import { newStats, type Actor, type Ped, type PedGoal, type SimCore, type Stats, type Vehicle } from './state';
export type { PedGoal } from './state';
import { Wildlife, type WildlifeView } from './wildlife';
export type { WildlifeView } from './wildlife';
import { despawnVehicle, honk, rebuildOcc, spawnVehicles, stepVehicles, vehicleContacts } from './traffic';

export type { ArchetypeDef } from './archetypes';
export { BUILTIN_ARCHETYPES, validateArchetype } from './archetypes';

/** @deprecated old name, kept for compatibility. */
export type AgentView = PedView;
/** Pedestrian view (contract). Vehicles use TrafficVehicleView from src/shared/traffic.ts. */
export interface PedView {
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
  /** Wall-clock ms spent in the last update() call. */
  lastUpdateMs = 0;
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
    const rOutV = Math.max(150, Math.min(300, 120 + this.opts.maxVehicles * 0.95));
    const rOutP = Math.max(80, Math.min(150, 60 + this.opts.maxPeds * 0.2));
    const core: SimCore = {
      net, rng: new Rng(this.opts.seed), reg, t: 0, minute: this.minute, weather: this.weather,
      vehicles: [], peds: [], occ: g.links.map(() => []), occDirty: [],
      pGrid: new AgentGrid(4), vGrid: new AgentGrid(8), onWalk: new Map(), srcLane,
      actors: [], blocks: [], threats: [], closedRoads: new Map(), hails: [], spotOwner: new Int32Array(g.spots.length).fill(-1),
      focus: { x: 0, z: 0 }, maxVehicles: this.opts.maxVehicles, maxPeds: this.opts.maxPeds,
      ringV: [rOutV * 0.6, rOutV], ringP: [rOutP * 0.6, rOutP], densityHook: this.densityHook,
      emit: (type, e) => this.fire(type, e), stats: newStats(), nextId: 1, pedById: new Map(),
      busStopOf: new Map(g.busStops.map((b) => [b.link, b])), crossConns, lcList: [], preds: g.links.map(() => []),
      footCount: new Float32Array(g.roads.length), footAvg: new Float32Array(g.roads.length),
      spawnPedAt: (x, z, reason) => spawnPedAt(core, x, z, reason),
      onBusStop: (spot, v) => {
        for (const p of core.peds) if (p.alive && p.state === 'waitBus' && p.spot === spot) { despawnPed(core, p); core.stats.boardings++; }
        const n = core.rng.int(3); for (let k = 0; k < n; k++) spawnPedAt(core, v.x, v.z, 'alight');
      },
    };
    g.links.forEach((l, i) => { if (l.kind === LinkKind.Connector) core.preds[l.next[0]].push(i); });
    this.core = core;
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
    stepPeds(S, h);
    vehicleContacts(S, this.contactCd);
    this.wild.step(h);
    // despawn
    const [, rV] = S.ringV, [, rP] = S.ringP;
    for (const v of S.vehicles) {
      if (!v.alive) continue;
      const d = Math.hypot(v.x - S.focus.x, v.z - S.focus.z);
      const dwelling = v.state !== 'drive';
      if (d > rV + 30) despawnVehicle(S, v);
      else if (!dwelling && v.blockedBy !== 'red' && ((v.stopT > 60 && d > 70) || v.stopT > 150)) { despawnVehicle(S, v); S.stats.stuckDespawn++; const k = `${v.blockedBy || 'queue'}`; this.stuckWhy[k] = (this.stuckWhy[k] ?? 0) + 1; if (this.stuckLog.length < 60) this.stuckLog.push(this.queueHead(v)); }
    }
    for (const p of S.peds) if (p.alive && !p.goal && Math.hypot(p.x - S.focus.x, p.z - S.focus.z) > rP + 20) { despawnPed(S, p); S.stats.despawnedP++; }
    // compact
    if (S.vehicles.some((v) => !v.alive)) S.vehicles = S.vehicles.filter((v) => v.alive);
    if (S.peds.some((p) => !p.alive)) {
      for (const p of S.peds) if (!p.alive) { S.pedById.delete(p.id); if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1; }
      S.peds = S.peds.filter((p) => p.alive);
      for (const [k, l] of S.onWalk) { const f = l.filter((p) => p.alive && p.edge === k); S.onWalk.set(k, f); }
    }
    if (this.contactCd.size > 500) for (const [k, t] of this.contactCd) if (t < S.t) this.contactCd.delete(k);
    spawnVehicles(S, 2, false);
    spawnPeds(S, 3, false);
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
    while (ps.length < S.peds.length) ps.push({ id: 0, archetype: '', x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
    ps.length = S.peds.length;
    S.peds.forEach((p, i) => {
      const o = ps[i];
      o.id = p.id; o.archetype = p.arch.def.id; o.x = p.px + (p.x - p.px) * alpha; o.z = p.pz + (p.z - p.pz) * alpha;
      // sidewalk top = road surface + kerb (src/shared/terrain.ts); in the roadway = road surface
      o.y = heightAt(o.x, o.z) + (p.y > 0 ? CURB_HEIGHT : 0);
      o.yaw = lerpYaw(p.pyaw, p.yaw); o.speed = p.v; o.variant = p.variant;
      o.state = p.state === 'free' ? (p.jaywalking ? 'jaywalking' : p.then === 'flee' ? 'flee' : 'stepping') : p.onRoad ? (p.jaywalking ? 'jaywalking' : 'crossing') : p.state;
    });
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

  emit(event: { type: 'threat' | 'blockLane' | 'closeStreet' | 'gunfire'; x: number; z: number; radius?: number; until?: number; loudness?: number }): void {
    const S = this.core, net = this.net;
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
  private fire(type: string, e: Record<string, unknown>) { const l = this.listeners.get(type); if (l) { e.type = type; e.t = this.core.t; for (const cb of l) cb(e); } }

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
  /** Brownout (narrative N2): signals inside the circle go dark (all-way stop) or come back. */
  setSignalPower(area: { x: number; z: number; radius: number }, powered: boolean) {
    this.net.g.junctions.forEach((j, i) => { if (Math.hypot(j.x - area.x, j.z - area.z) <= area.radius) { if (powered) this.net.dark.delete(i); else this.net.dark.add(i); } });
  }

  setClock(minutesSinceMidnight: number): void { this.minute = ((minutesSinceMidnight % 1440) + 1440) % 1440; }
  setWeather(w: 'clear' | 'overcast' | 'rain'): void { this.weather = w; }
  /** Optional hook: spawn-probability multiplier (0..1) by place, e.g. per district. */
  setDensityHook(fn: ((x: number, z: number, kind: 'vehicle' | 'ped') => number) | null) { this.densityHook = fn; }
  /** Register more archetypes after load (content hot reload). */
  registerArchetypes(defs: ArchetypeDef[]) { if (this.core) this.core.reg.register(defs); else this.pendingArchetypes.push(...defs); }

  /** Stop lines of signalized approaches with their current state (debug view). */
  signalStates(out: { x: number; z: number; state: 'green' | 'yellow' | 'red' | 'dark' }[] = []) {
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
