/**
 * Police agents: locomotion only. Gameplay owns the decisions (reports, recognition, bribes, arrests,
 * stamina); it calls spawnPolice / setPoliceGoal and reads PoliceView back for its sight cones.
 *
 *  Cars drive the lane graph with a planned route (Dijkstra over lane groups). With the siren on they
 *  run reds carefully (slow to a crawl, go only when no crossing traffic or pedestrians are in the
 *  way) and civilians pull over for them. They never drive against a one-way: the lane graph has no
 *  wrong-way lanes, so pursuits stay period-legal and readable.
 *  Modes: patrol (cruise inside a radius), goto (urgent or not), search (slow cruise to random points
 *  in a radius), pursue (keep routing to a moving target), boxIn (close on the target and stop next to
 *  it), roadblock (stop across the street and close every lane of that direction).
 *  Foot cops walk the sidewalk graph (urgent = cross against the light when traffic allows) and use the
 *  same modes; Gameplay passes maxSpeed for stamina.
 */
import { sampleAt } from './geom';
import { LinkKind } from './laneFormat';
import type { SimCore, CopState, Vehicle, Ped, Actor } from './state';
import { despawnVehicle, makeVehicle } from './traffic';
import { despawnPed, setPedGoal, spawnPedNear } from './peds';

export type PoliceGoal =
  | { kind: 'patrol'; around: [number, number]; radius: number; maxSpeed?: number }
  | { kind: 'goto'; x: number; z: number; urgent?: boolean; maxSpeed?: number }
  | { kind: 'search'; x: number; z: number; radius: number; maxSpeed?: number }
  | { kind: 'pursue'; target: string; maxSpeed?: number }
  | { kind: 'boxIn'; target: string; maxSpeed?: number }
  | { kind: 'roadblock'; x: number; z: number; yaw?: number; maxSpeed?: number };
export interface PoliceView { id: number; kind: 'foot' | 'car'; x: number; z: number; yaw: number; speed: number; mode: string; siren: boolean; agentId: number }

const tmp = [0, 0, 0, 0];

// ------------------------------------------------------------------ lane-group routing
interface GroupGraph { succ: Map<number, { to: number; len: number }[]>; mid: Map<number, [number, number]>; lanes: number[][] }
const graphs = new WeakMap<object, GroupGraph>();
function groupGraph(S: SimCore): GroupGraph {
  let G = graphs.get(S.net);
  if (G) return G;
  const net = S.net;
  G = { succ: new Map(), mid: new Map(), lanes: [] };
  for (const [g, lanes] of net.groups) {
    const l0 = lanes[0];
    const set = new Map<number, number>();
    for (const l of lanes) for (const c of net.g.links[l].next) { const t = net.g.links[net.g.links[c].next[0]].group; set.set(t, net.len[l0] + net.len[c]); }
    G.lanes.push(lanes);
    G.succ.set(g, [...set].map(([to, len]) => ({ to, len })));
    sampleAt(net.g.links[l0].pts, net.cum[l0], net.len[l0] / 2, tmp);
    G.mid.set(g, [tmp[0], tmp[1]]);
  }
  graphs.set(S.net, G);
  return G;
}
/** Lane nearest to a point, with arc position. */
export function nearestLane(S: SimCore, x: number, z: number): { lane: number; s: number; d: number } {
  const net = S.net;
  let best = -1, bs = 0, bd = Infinity;
  const cand = net.lanesNear(x, z, 60, new Set());
  const pool = cand.size ? cand : new Set(net.laneIds);
  for (const l of pool) {
    const p = net.g.links[l].pts, cum = net.cum[l];
    for (let k = 2; k < p.length; k += 2) {
      const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; best = l; bs = cum[(k >> 1) - 1] + t * Math.sqrt(l2); }
    }
  }
  return { lane: best, s: bs, d: bd };
}
/** Expected siren travel time (s) from a lane group to the lane group nearest (gx,gz). */
export function sirenTimeTo(S: SimCore, fromGroup: number, gx: number, gz: number): number {
  const goal = nearestLane(S, gx, gz);
  if (goal.lane < 0) return Infinity;
  const to = S.net.g.links[goal.lane].group;
  const path = routeGroups(S, fromGroup, to, true);
  if (!path.length) return Infinity;
  let t = 0;
  for (let i = 1; i < path.length; i++) t += sirenCost(S, path[i], S.net.len[S.net.groups.get(path[i])![0]]);
  return t;
}
/** A free lane spot whose siren travel time to (x,z) is close to `targetSec` (a unit already on patrol nearby). */
export function responderStart(S: SimCore, x: number, z: number, targetSec = 24): { lane: number; s: number } | null {
  let best: { lane: number; s: number } | null = null, bd = Infinity;
  for (let tries = 0; tries < 40; tries++) {
    const a = S.rng.next() * Math.PI * 2, r = S.rng.range(80, 260);
    const near = nearestLane(S, x + Math.cos(a) * r, z + Math.sin(a) * r);
    if (near.lane < 0 || near.d > 45) continue;
    const len = S.net.len[near.lane];
    if (len < 20) continue; // too short to start on (stubs between close junctions)
    const s = Math.max(6, Math.min(len - 10, near.s));
    if (S.occ[near.lane].some((o) => Math.abs(o.s - s) < o.len / 2 + 9)) continue;
    sampleAt(S.net.g.links[near.lane].pts, S.net.cum[near.lane], s, tmp);
    if (S.vehicles.some((o) => Math.hypot(o.x - tmp[0], o.z - tmp[1]) < o.len / 2 + 7)) continue;
    const t = sirenTimeTo(S, S.net.g.links[near.lane].group, x, z) + (len - s) / 15;
    const dev = Math.abs(t - targetSec);
    if (dev < bd) { bd = dev; best = { lane: near.lane, s }; }
    if (dev < 4) break;
  }
  return best;
}
/** Driving distance (m) along the legal shortest route between two lane groups (Infinity if unreachable). */
export function routeCost(S: SimCore, from: number, to: number): number {
  const path = routeGroups(S, from, to);
  if (!path.length) return Infinity;
  let d = 0; for (const g of path) d += S.net.len[S.net.groups.get(g)![0]];
  return d;
}
/** Expected traversal time (s) of a lane group for a siren unit: length at speed, plus queues it must
 *  gutter-run past and a few seconds per signalised junction it must check before crossing. */
function sirenCost(S: SimCore, g: number, len: number): number {
  const net = S.net, lanes = net.groups.get(g)!, L = net.g.links[lanes[0]];
  let queued = 0;
  for (const l of lanes) for (const w of S.occ[l]) if (w.v < 2) queued++;
  const gutter = (net.g.roads[L.owner].flags & 4) === 0; // links have no parking lane to run in
  // a stopped queue head at the line: a siren unit coming out of the gutter waits beside it until it moves
  let head = 0;
  for (const l of lanes) { const h = S.occ[l][S.occ[l].length - 1]; if (h && h.v < 1 && net.len[l] - h.s < h.len / 2 + 3) head = 1; }
  return len / (L.speed * 1.2) + queued * (gutter ? 0.4 : 2.5) + (net.isSignal(L.endJ) ? 4 : 1) + head * (net.isSignal(L.endJ) ? 10 : 3);
}
/** Group path from `from` to `to` (inclusive), or [] if unreachable. `siren`: weigh by expected time. */
function routeGroups(S: SimCore, from: number, to: number, siren = false): number[] {
  if (from === to) return [from];
  const G = groupGraph(S);
  const dist = new Map<number, number>([[from, 0]]), via = new Map<number, number>(), done = new Set<number>();
  const open = [from];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (dist.get(open[i])! < dist.get(open[bi])!) bi = i;
    const u = open.splice(bi, 1)[0];
    if (u === to) break;
    if (done.has(u)) continue; done.add(u);
    for (const { to: w, len } of G.succ.get(u) ?? []) {
      const nd = dist.get(u)! + (siren ? sirenCost(S, w, len) : len);
      if (nd < (dist.get(w) ?? Infinity)) { dist.set(w, nd); via.set(w, u); open.push(w); }
    }
  }
  if (!via.has(to)) return [];
  const path = [to];
  for (let g = to; g !== from;) { g = via.get(g)!; path.unshift(g); }
  return path;
}

// ------------------------------------------------------------------ targets
function actorPos(S: SimCore, id: string | null): Actor | null {
  if (!id) return null;
  return S.actors.find((a) => a.id === id || (id === 'player' && a.kind === 'player')) ?? null;
}
function goalPoint(S: SimCore, c: CopState): [number, number] {
  if ((c.mode === 'pursue' || c.mode === 'boxIn') && c.target) { const a = actorPos(S, c.target); if (a) return [a.x, a.z]; }
  return [c.x, c.z];
}
function pickInRadius(S: SimCore, c: CopState, cx: number, cz: number) {
  const a = S.rng.next() * Math.PI * 2, r = Math.sqrt(S.rng.next()) * c.radius;
  c.x = cx + Math.cos(a) * r; c.z = cz + Math.sin(a) * r; c.arrived = false; c.route = [];
}

// ------------------------------------------------------------------ cars
/** Connector a police car takes at the end of its current lane (route following), or -1 for default. */
export function policeConnector(S: SimCore, v: Vehicle): number {
  const c = v.cop!, L = S.net.g.links[v.link];
  if (L.kind !== LinkKind.Lane || c.mode === 'idle') return -1;
  const [gx, gz] = goalPoint(S, c);
  const r = routeConnectorTo(S, v, gx, gz);
  c.route = r.path;
  return r.conn;
}

/** Connector at the end of v's current lane on the shortest legal route to (gx,gz); -1 when already on the goal block. */
export function routeConnectorTo(S: SimCore, v: Vehicle, gx: number, gz: number, goalGroup = -1): { conn: number; path: number[] } {
  const siren = !!v.cop?.siren;
  const net = S.net, L = net.g.links[v.link];
  if (L.kind !== LinkKind.Lane) return { conn: -1, path: [] };
  if (goalGroup < 0) { const goal = nearestLane(S, gx, gz); if (goal.lane < 0) return { conn: -1, path: [] }; goalGroup = net.g.links[goal.lane].group; }
  const path = routeGroups(S, L.group, goalGroup, siren);
  if (path.length < 2) return { conn: -1, path };
  const nextG = path[1];
  // prefer a connector from the current lane, else any lane of the group (forces a lane change)
  let best = -1;
  for (const lane of net.groups.get(L.group)!) for (const cn of net.g.links[lane].next) {
    if (net.g.links[net.g.links[cn].next[0]].group !== nextG) continue;
    if (lane === v.link) return { conn: cn, path };
    if (best < 0) best = cn;
  }
  return { conn: best, path };
}

/** Per-step police car behaviour (called before the vehicle's period behaviour). Returns true if it handled the vehicle. */
export function policeVehicleTick(S: SimCore, v: Vehicle, dt: number): boolean {
  const c = v.cop!, net = S.net, L = net.g.links[v.link];
  if (c.mode === 'roadblock' && v.state === 'roadblock') return true;
  const [gx, gz] = goalPoint(S, c);
  const d = Math.hypot(gx - v.x, gz - v.z);
  // speed: urgent with siren runs faster than traffic; maxSpeed caps (gameplay)
  const base = c.mode === 'search' ? 0.6 : c.urgent || c.mode === 'pursue' || c.mode === 'boxIn' ? 1.35 : 0.95;
  v.v0f = Math.min(base, c.maxSpeed / Math.max(1, L.speed));
  // stuck reporting
  c.stuckT = v.v < 0.3 ? c.stuckT + dt : 0;
  if (c.stuckT > 8) { c.stuckT = -20; S.emit('policeBlocked', { id: c.id }); }
  if (L.kind !== LinkKind.Lane) return false;
  if (c.mode === 'pursue' || c.mode === 'boxIn') {
    if (c.mode === 'boxIn' && d < 9 && v.v < 3) { v.state = 'boxIn'; v.dwell = Infinity; arrive(S, c); }
    return false;
  }
  // close enough (goto): pull in right here
  if ((c.mode === 'goto' || c.mode === 'roadblock') && !c.arrived && d < 45 && v.stopLink !== v.link) {
    const at = v.s + Math.max(4, v.v * v.v / 5);
    if (at < net.len[v.link] - 4) { v.stopLink = v.link; v.stopAt = at; v.stopKind = 'police'; }
    else if (L.kind === LinkKind.Lane && net.len[v.link] - 4 > v.s + 2) { v.stopLink = v.link; v.stopAt = net.len[v.link] - 4; v.stopKind = 'police'; } // brake hard to the end of the block
    else if (v.v < 2 && L.kind === LinkKind.Lane) { v.stopLink = v.link; v.stopAt = v.s; v.stopKind = 'police'; } // no room ahead: this is the spot
    else c.pullInNext = true;
  }
  // carried over from the previous block: pull in at the start of this one
  if (c.pullInNext && L.kind === LinkKind.Lane && v.stopLink !== v.link && !c.arrived) {
    c.pullInNext = false;
    const at = Math.max(v.s + 3, Math.min(8, net.len[v.link] - 4));
    if (at < net.len[v.link] - 2) { v.stopLink = v.link; v.stopAt = at; v.stopKind = 'police'; }
  }
  if ((c.mode === 'goto' || c.mode === 'roadblock') && !c.arrived && v.stopLink === v.link && v.s >= v.stopAt - 3 && v.v < 1) {
    v.stopLink = -1; v.stopAt = -1; v.v = 0;
    if (c.mode === 'roadblock') startRoadblock(S, v);
    else { v.state = 'onScene'; v.dwell = c.role === 'ambulance' ? S.rng.range(40, 80) : c.role === 'fire' ? S.rng.range(120, 240) : c.role === 'tow' ? S.rng.range(20, 30) : Infinity; v.latTarget = v.lat; } // stay put: the kerb may already be taken
    arrive(S, c);
    return false;
  }
  // arrival on the goal's lane group: stop at the nearest point of the lane (goto/roadblock), or pick a new point (patrol/search)
  const goal = nearestLane(S, gx, gz);
  if (goal.lane >= 0 && net.g.links[goal.lane].group === L.group && !c.arrived) {
    const sHere = goal.s * (net.len[v.link] / net.len[goal.lane]);
    if (c.mode === 'patrol' || c.mode === 'search') {
      if (Math.abs(sHere - v.s) < 12 || sHere < v.s) { arrive(S, c); pickInRadius(S, c, c.cx, c.cz); }
      return false;
    }
    // stop at the goal point; if we entered the block already past it (but close), pull in just ahead
    // (the scene may be inside a park or a block: the nearest kerb of the goal block counts as on scene)
    const target = sHere > v.s + 2 ? sHere : d < 140 ? v.s + 8 : -1;
    if (target > 0 && target < net.len[v.link] - 4 && v.stopLink !== v.link) { v.stopLink = v.link; v.stopAt = target; v.stopKind = 'police'; }
    const sGoal = v.stopLink === v.link ? v.stopAt : sHere;
    if (v.stopLink === v.link && v.s >= sGoal - 3 && v.v < 1) {
      v.stopLink = -1; v.stopAt = -1; v.v = 0;
      if (c.mode === 'roadblock') startRoadblock(S, v);
      else { v.state = 'onScene'; v.dwell = c.role === 'ambulance' ? S.rng.range(40, 80) : c.role === 'fire' ? S.rng.range(120, 240) : c.role === 'tow' ? S.rng.range(20, 30) : Infinity; v.latTarget = v.lat; } // stay put: the kerb may already be taken
      arrive(S, c);
    }
  }
  return false;
}

function arrive(S: SimCore, c: CopState) {
  if (c.arrived) return;
  c.arrived = true;
  if (!c.role || c.role === 'police') S.emit('policeArrived', { id: c.id });
  else S.emit('responderArrived', { id: c.id, role: c.role });
}

/** Stop across the street: the car turns broadside and every lane of this direction is closed just behind it. */
function startRoadblock(S: SimCore, v: Vehicle) {
  const net = S.net, L = net.g.links[v.link], grp = net.groups.get(L.group)!;
  v.state = 'roadblock'; v.dwell = Infinity; v.v = 0;
  // centre the car on the middle lane of its direction
  const mid = grp[Math.floor((grp.length - 1) / 2)];
  v.latTarget = 0; v.lat = 0;
  if (mid !== v.link) { const ratio = net.len[mid] / net.len[v.link]; const occ = S.occ[v.link]; const i = occ.indexOf(v); if (i >= 0) occ.splice(i, 1); v.s *= ratio; v.link = mid; v.prevLink = -1; S.occ[mid].push(v); S.occ[mid].sort((a, b) => a.s - b.s); }
  for (const lane of grp) {
    const s = v.s * (net.len[lane] / net.len[v.link]) - 4;
    S.blocks.push({ link: lane, s: Math.max(1, s), until: Infinity, owner: v.id });
  }
}
function clearRoadblock(S: SimCore, v: Vehicle) {
  S.blocks = S.blocks.filter((b) => b.owner !== v.id);
  if (v.state === 'roadblock' || v.state === 'onScene' || v.state === 'boxIn') { v.state = 'drive'; v.dwell = 0; v.latTarget = 0; }
}

// ------------------------------------------------------------------ foot cops
export function policePedTick(S: SimCore, p: Ped) {
  const c = p.cop2!;
  if (p.state === 'dead') return;
  const g = p.goal;
  if (c.mode === 'patrol' || c.mode === 'search') {
    if (!g || p.state === 'hold') {
      if (g) arrive(S, c);
      pickInRadius(S, c, c.cx, c.cz);
      setPedGoal(S, p, { kind: 'goto', x: c.x, z: c.z, speed: Math.min(c.maxSpeed, c.mode === 'search' ? 1.6 : 1.2), urgent: false });
    }
  } else if ((c.mode === 'goto' || c.mode === 'roadblock' || c.mode === 'boxIn') && g && p.state === 'hold') arrive(S, c);
}

/** A free place on a lane near (x,z): nearest lanes first, sliding along each lane up to ±40 m. */
function freeLaneSpot(S: SimCore, x: number, z: number): { lane: number; s: number } | null {
  const net = S.net;
  const lanes = [...net.lanesNear(x, z, 80, new Set())];
  const cand: { lane: number; s: number; d: number }[] = [];
  for (const l of lanes) {
    const p = net.g.links[l].pts, cum = net.cum[l];
    let bd = Infinity, bs = 0;
    for (let k = 2; k < p.length; k += 2) {
      const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < bd) { bd = d; bs = cum[(k >> 1) - 1] + t * Math.sqrt(l2); }
    }
    cand.push({ lane: l, s: bs, d: bd });
  }
  cand.sort((a, b) => a.d - b.d || a.lane - b.lane);
  for (const c of cand) {
    const len = net.len[c.lane];
    if (len < 14) continue;
    for (const off of [0, 8, -8, 16, -16, 24, -24, 32, -32, 40, -40]) {
      const s = c.s + off;
      if (s < 5 || s > len - 7) continue;
      let ok = true;
      for (const o of S.occ[c.lane]) if (Math.abs(o.s - s) < (o.len + 5.4) / 2 + 2.5) { ok = false; break; }
      if (!ok) continue;
      sampleAt(net.g.links[c.lane].pts, net.cum[c.lane], s, tmp);
      for (const o of S.vehicles) if (Math.hypot(o.x - tmp[0], o.z - tmp[1]) < (o.len + 5.4) / 2 + 1.5) { ok = false; break; }
      if (ok) return { lane: c.lane, s };
    }
  }
  return null;
}

// ------------------------------------------------------------------ API helpers (used by Simulation)
export function spawnPolice(S: SimCore, opts: { kind: 'foot' | 'car'; x: number; z: number; precinct?: string; siren?: boolean; respondTo?: { x: number; z: number } }): { cop: CopState; agentId: number } | null {
  const c: CopState = { id: 0, kind: opts.kind, precinct: opts.precinct ?? '', mode: 'idle', x: opts.x, z: opts.z, cx: opts.x, cz: opts.z, radius: 0, yaw: 0, target: null,
    urgent: false, siren: !!opts.siren, maxSpeed: opts.kind === 'car' ? 20 : 4, route: [], arrived: false, stuckT: 0, blockIds: 0 };
  if (opts.kind === 'car') {
    const arch = S.reg.list.find((a) => a.def.id === 'npc.police_driver');
    if (!arch) return null;
    const spot = opts.respondTo ? responderStart(S, opts.respondTo.x, opts.respondTo.z) : freeLaneSpot(S, opts.x, opts.z);
    if (!spot) return null;
    const v = makeVehicle(S, 'police', 'police', arch, spot.lane, spot.s);
    v.cop = c; c.id = v.id;
    return { cop: c, agentId: v.id };
  }
  const arch = S.reg.list.find((a) => a.def.id === 'npc.police_officer');
  if (!arch) return null;
  const p = spawnPedNear(S, opts.x, opts.z, arch, 60);
  if (!p) return null;
  p.cop2 = c; p.cop = true; c.id = p.id;
  return { cop: c, agentId: p.id };
}

export function setCopGoal(S: SimCore, c: CopState, agent: Vehicle | Ped, goal: PoliceGoal) {
  c.arrived = false; c.route = []; c.stuckT = 0;
  c.maxSpeed = goal.maxSpeed ?? (c.kind === 'car' ? 20 : 4);
  c.urgent = goal.kind === 'goto' ? !!goal.urgent : goal.kind === 'pursue' || goal.kind === 'boxIn' || goal.kind === 'roadblock';
  c.target = goal.kind === 'pursue' || goal.kind === 'boxIn' ? goal.target : null;
  c.mode = goal.kind;
  if (goal.kind === 'patrol') { c.cx = goal.around[0]; c.cz = goal.around[1]; c.radius = goal.radius; }
  else if (goal.kind === 'search') { c.cx = goal.x; c.cz = goal.z; c.radius = goal.radius; }
  else if (goal.kind === 'goto' || goal.kind === 'roadblock') { c.x = goal.x; c.z = goal.z; c.radius = 0; c.yaw = goal.kind === 'roadblock' ? goal.yaw ?? 0 : 0; }
  if (c.kind === 'car') {
    const v = agent as Vehicle;
    clearRoadblock(S, v);
    v.stopLink = -1; v.stopAt = -1;
    if (goal.kind === 'patrol' || goal.kind === 'search') pickInRadius(S, c, c.cx, c.cz);
    const L = S.net.g.links[v.link];
    if (L.kind === LinkKind.Lane) { const cn = policeConnector(S, v); if (cn >= 0) { v.want = cn; if (S.srcLane[cn] === v.link) v.next = cn; } }
  } else {
    const p = agent as Ped;
    const speedCap = c.maxSpeed;
    if (goal.kind === 'pursue') setPedGoal(S, p, { kind: 'follow', target: goal.target, maxSpeed: Math.min(speedCap, 5), urgent: true });
    else if (goal.kind === 'boxIn') setPedGoal(S, p, { kind: 'follow', target: goal.target, maxSpeed: Math.min(speedCap, 5), urgent: true });
    else if (goal.kind === 'goto' || goal.kind === 'roadblock') setPedGoal(S, p, { kind: 'goto', x: goal.x, z: goal.z, speed: Math.min(speedCap, c.urgent ? 3.4 : 1.4), urgent: c.urgent });
    else setPedGoal(S, p, null); // patrol/search pick points in policePedTick
  }
}

export function removePolice(S: SimCore, agent: Vehicle | Ped, car: boolean) {
  if (car) { const v = agent as Vehicle; clearRoadblock(S, v); despawnVehicle(S, v); }
  else { const p = agent as Ped; p.cop2 = null; despawnPed(S, p); S.stats.despawnedP++; }
}

/** Car-only goal setter (responders reuse police routing). */
export function setCopGoalCar(S: SimCore, c: CopState, v: Vehicle, goal: PoliceGoal) { setCopGoal(S, c, v, goal); }
