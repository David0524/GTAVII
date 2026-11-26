/**
 * Service and emergency traffic, and player cab rides.
 *
 *  - Mail trucks stop mid-block at the kerb with hazards (15-30 s), block after block.
 *  - The summer soft-serve truck crawls the side streets chiming; where people are about it pulls in
 *    for half a minute or so and a few passers-by walk over.
 *  - Ambulances and fire engines are dispatched (Gameplay/Narrative: `dispatch()`; plus occasional ambient
 *    ambulance runs) with sirens on, run reds carefully like police, work the scene with hazards, then
 *    leave with the siren off and despawn out of range like any car.
 *  - Player cab rides: `callCab` sends the nearest free cab to the kerb by the player; it waits
 *    (`cabReady`); `boardCab` drives the fare to a destination by the legal shortest route, calling out
 *    each turn ahead (`cabTurnAhead`, for "Call Your Turns"); `cabRideArrived` at the kerb; `leaveCab`.
 */
import { projectOnPoly } from './geom';
import { LinkFlag, LinkKind, Turn, WalkKind } from './laneFormat';
import type { SimCore, Vehicle, Hail, CopState } from './state';
import { makeVehicle } from './traffic';
import { nearestLane, responderStart, routeConnectorTo, routeCost, setCopGoalCar } from './police';
import { setPedGoal } from './peds';
import type { VehicleClass } from '../shared/traffic';

// ------------------------------------------------------------------ service stops (mail, soft-serve)
export function serviceBehaviour(S: SimCore, v: Vehicle, dt: number) {
  const net = S.net, L = net.g.links[v.link];
  if (L.kind !== LinkKind.Lane || v.state !== 'drive') return;
  v.svcT -= dt;
  const len = net.len[v.link];
  if (v.vclass === 'ice_cream' && Math.floor(S.t / 15) !== Math.floor((S.t - dt) / 15)) S.emit('iceCreamChime', { id: v.id, x: v.x, z: v.z });
  if (v.svcT > 0 || v.stopLink >= 0 || len < 50 || len - v.s < 30) return;
  const lane0 = net.groups.get(L.group)![0];
  if (!(net.g.links[lane0].flags & LinkFlag.RightKerbRoom)) return;
  if (v.vclass === 'mail_truck') {
    v.stopLink = lane0; v.stopAt = Math.min(net.len[lane0] - 15, v.s * (net.len[lane0] / len) + 20); v.stopKind = 'mail'; v.kerb = 1;
  } else if (v.vclass === 'ice_cream' && !net.isAvenue(L.owner)) {
    let people = 0;
    S.pGrid.query(v.x, v.z, 30, (i) => { if (S.peds[i].alive && S.peds[i].state !== 'dead') people++; });
    if (people >= 3) { v.stopLink = lane0; v.stopAt = Math.min(net.len[lane0] - 15, v.s * (net.len[lane0] / len) + 15); v.stopKind = 'icecream'; v.kerb = 1; }
    else v.svcT = 8;
  }
}

/** A service vehicle just pulled in at the kerb. */
export function serviceStopStarted(S: SimCore, v: Vehicle) {
  if (v.stopKind === 'mail') { v.dwell = S.rng.range(15, 30); S.emit('mailStop', { id: v.id, x: v.x, z: v.z }); }
  if (v.stopKind === 'icecream') {
    v.dwell = S.rng.range(35, 70);
    S.emit('iceCreamStop', { id: v.id, x: v.x, z: v.z });
    let n = 0;
    S.pGrid.query(v.x, v.z, 25, (i) => {
      const p = S.peds[i];
      if (n >= 3 || !p.alive || p.goal || p.cop2 || p.state !== 'walk' || (p.arch.behaviour !== 'walker' && p.arch.behaviour !== 'loiterer')) return;
      if (!S.rng.chance(0.45)) return;
      setPedGoal(S, p, { kind: 'goto', x: v.x, z: v.z, until: S.t + v.dwell }); n++;
    });
  }
  v.svcT = S.rng.range(20, 60);
}

// ------------------------------------------------------------------ emergency dispatch
const ROLE_CLASS: Record<string, VehicleClass[]> = { ambulance: ['ambulance'], fire: ['fire_engine', 'ladder_truck'] };

/** Send responders to a scene from 150-250 m away. Returns vehicle ids. */
export function dispatchResponders(S: SimCore, role: 'ambulance' | 'fire', x: number, z: number): number[] {
  const ids: number[] = [];
  const archId = role === 'fire' ? 'npc.fire_driver' : 'npc.emt_driver';
  const arch = S.reg.list.find((a) => a.def.id === archId);
  if (!arch) return ids;
  for (const vclass of ROLE_CLASS[role]) {
    {
      const st = responderStart(S, x, z, vclass === 'ladder_truck' ? 32 : 24);
      if (!st) continue;
      const near = { lane: st.lane }, s = st.s;
      const v = makeVehicle(S, 'emergency', vclass, arch, near.lane, s);
      const c: CopState = { id: v.id, kind: 'car', role, precinct: '', mode: 'idle', x, z, cx: x, cz: z, radius: 0, yaw: 0, target: null, urgent: true, siren: true,
        maxSpeed: 18, route: [], arrived: false, stuckT: 0, blockIds: 0 };
      v.cop = c;
      setCopGoalCar(S, c, v, { kind: 'goto', x: x + S.rng.range(-6, 6), z: z + S.rng.range(-6, 6), urgent: true });
      ids.push(v.id);
      S.emit('dispatched', { id: v.id, role, vclass, x, z });
    }
  }
  return ids;
}

/** Responder finished at the scene: siren off, back into traffic (despawns out of range). */
export function responderLeave(S: SimCore, v: Vehicle) {
  const c = v.cop!;
  c.mode = 'idle'; c.siren = false; c.urgent = false;
  v.state = 'drive'; v.dwell = 0; v.latTarget = 0;
  S.emit('responderLeft', { id: v.id, role: c.role });
}

// ------------------------------------------------------------------ player cab rides
/** Nearest free cab heads for the kerb by (x,z). Returns the cab id or -1. */
export function callCab(S: SimCore, x: number, z: number): number {
  const net = S.net;
  let edge = -1, bd = 30;
  for (const e of net.sidewalksNear(x, z, 30, new Set())) { const d = projectOnPoly(net.g.walkEdges[e].pts, x, z).d; if (d < bd) { bd = d; edge = e; } }
  if (edge < 0) return -1;
  const E = net.g.walkEdges[edge];
  if (E.kind !== WalkKind.Sidewalk) return -1;
  // the free cab with the shortest legal drive to the caller's kerb (one-way loops make straight-line distance a poor guide)
  const oneway = net.g.roads[E.owner].oneway !== 0;
  const goalLane = net.roadLanes[E.owner].find((l) => oneway || net.g.links[l].dir === E.side);
  if (goalLane === undefined) return -1;
  const goalG = net.g.links[goalLane].group;
  let cab: Vehicle | null = null, cd = Infinity;
  for (const v of S.vehicles) {
    if (!v.alive || v.kind !== 'cab' || v.fare || v.hail || v.ride || v.state !== 'drive' || Math.hypot(v.x - x, v.z - z) > 600) continue;
    const L = net.g.links[v.link];
    const lane = L.kind === LinkKind.Lane ? v.link : L.next[0];
    const d = routeCost(S, net.g.links[lane].group, goalG) - (L.kind === LinkKind.Lane ? v.s : 0);
    if (d < cd) { cd = d; cab = v; }
  }
  if (!cab) return -1;
  const h: Hail = { ped: -1, road: E.owner, side: E.side, x, z, claimedBy: cab.id, t: S.t };
  cab.hail = h; cab.hailFrom = -1; cab.ride = { phase: 'pickup', t: S.t }; cab.dest = { x, z };
  if (S.net.g.links[cab.link].kind === LinkKind.Lane) { const cn = destConnector(S, cab); if (cn >= 0) { cab.want = cn; if (S.srcLane[cn] === cab.link) cab.next = cn; } }
  S.emit('cabCalled', { cabId: cab.id, x, z });
  return cab.id;
}

export function boardCab(S: SimCore, cabId: number, dest: { x: number; z: number }): boolean {
  const v = S.vehicles.find((w) => w.id === cabId && w.alive);
  if (!v?.ride || v.ride.phase !== 'waiting') return false;
  v.ride = { phase: 'riding', t: S.t }; v.fare = true; v.hail = null; v.dest = { ...dest };
  v.stopLink = -1; v.stopAt = -1; v.dwell = 0; // pulls out on the next step
  S.emit('cabDeparted', { cabId, x: v.x, z: v.z, dest });
  return true;
}

export function leaveCab(S: SimCore, cabId: number): boolean {
  const v = S.vehicles.find((w) => w.id === cabId && w.alive);
  if (!v?.ride) return false;
  v.ride = null; v.fare = false; v.dest = null; v.hail = null; v.stopLink = -1; v.stopAt = -1;
  if (v.state === 'curb') v.dwell = 4; // let the passenger get out before the cab pulls away
  return true;
}

/** Per-step ride logic (called from the cab's period behaviour). */
export function rideBehaviour(S: SimCore, v: Vehicle) {
  const r = v.ride!, net = S.net, L = net.g.links[v.link];
  if (r.phase === 'waiting' && S.t - r.t > 90) { S.emit('cabGaveUp', { cabId: v.id }); leaveCab(S, v.id); return; }
  // close to the caller but the one-ways won't bring the cab to their kerb: pull over at the nearest reachable kerb
  // (cabReady reports where; the player walks a few steps, as people did)
  if (r.phase === 'pickup' && v.hail && v.state === 'drive' && v.stopLink < 0 && L.kind === LinkKind.Lane && Math.hypot(v.x - v.hail.x, v.z - v.hail.z) < 60) {
    const lane0 = net.groups.get(L.group)![0], len0 = net.len[lane0];
    const sNow = v.s * (len0 / net.len[v.link]);
    const p = projectOnPoly(net.g.links[lane0].pts, v.hail.x, v.hail.z).s;
    const at = Math.max(p, sNow + 10);
    if (at < len0 - 6) { v.stopLink = lane0; v.stopAt = at; v.stopKind = 'pickup'; v.kerb = 1; }
  }
  if (r.phase !== 'riding' || L.kind !== LinkKind.Lane || v.state !== 'drive' || v.stopLink >= 0) return;
  // arrived on the destination block: pull in at the kerb on the destination's side
  const goal = nearestLane(S, v.dest!.x, v.dest!.z);
  if (goal.lane < 0 || net.g.links[goal.lane].group !== L.group) return;
  const grp = net.groups.get(L.group)!;
  const side = projectOnPoly(L.pts, v.dest!.x, v.dest!.z).side; // +1 right of travel
  const left = side < 0 && net.g.roads[L.owner].oneway !== 0;
  const lane = left ? grp[grp.length - 1] : grp[0];
  const sHere = goal.s * (net.len[lane] / net.len[goal.lane]);
  const sNow = v.s * (net.len[lane] / net.len[v.link]);
  if (sHere - sNow < 8) return; // overshot: go round the block (routing keeps aiming at the destination)
  v.stopLink = lane; v.stopAt = Math.min(net.len[lane] - 6, sHere); v.stopKind = 'rideEnd'; v.kerb = left ? -1 : 1;
}

/** Ride cab reached a kerb stop (pickup or destination). */
export function rideStopStarted(S: SimCore, v: Vehicle) {
  const r = v.ride!;
  v.dwell = Infinity;
  if (v.stopKind === 'pickup') { r.phase = 'waiting'; r.t = S.t; S.emit('cabReady', { cabId: v.id, x: v.x, z: v.z, kerb: v.kerb }); }
  else if (v.stopKind === 'rideEnd') { r.phase = 'arrived'; r.t = S.t; S.emit('cabRideArrived', { cabId: v.id, x: v.x, z: v.z }); }
}

/** Ride cab chose the connector at the end of its lane: call the turn ("left on Thirty-Fourth"). */
export function rideTurnCallout(S: SimCore, v: Vehicle) {
  if (v.ride?.phase !== 'riding' || v.next < 0) return;
  const C = S.net.g.links[v.next];
  if (C.turn === Turn.Straight) return;
  const street = S.net.roadName(S.net.g.links[C.next[0]].owner);
  S.emit('cabTurnAhead', { cabId: v.id, dir: C.turn === Turn.Left ? 'left' : 'right', street, distance: S.net.len[v.link] - v.s });
}

/** Destination routing for ride cabs (and any vehicle with `dest`). */
export function destConnector(S: SimCore, v: Vehicle): number {
  // going to pick someone up: aim for the lane group that runs along the caller's kerb
  if (v.ride?.phase === 'pickup' && v.hail) {
    const h = v.hail, oneway = S.net.g.roads[h.road].oneway !== 0;
    const lane = S.net.roadLanes[h.road].find((l) => oneway || S.net.g.links[l].dir === h.side);
    if (lane !== undefined) return routeConnectorTo(S, v, h.x, h.z, S.net.g.links[lane].group).conn;
  }
  return routeConnectorTo(S, v, v.dest!.x, v.dest!.z).conn;
}
