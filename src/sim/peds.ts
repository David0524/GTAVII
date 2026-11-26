/**
 * Pedestrian agents on the sidewalk walk graph: path-space local avoidance (ORCA-lite: keep
 * right, slow behind, sidestep oncoming, separation), crosswalks with WALK/DON'T WALK and gap
 * checks, 1974 jaywalking (against the light and mid-block), loiter spots, vendors, beat cops,
 * subway entrances, cab hails, bus stops, and flee/cower reactions to threats.
 */
import { projectOnPoly, sampleAt } from './geom';
import { JuncFlag, SpotKind, WalkKind } from './laneFormat';
import type { SimCore, Ped, PedGoal } from './state';
import { pedDensity } from './state';
import type { ArchetypeRt } from './archetypes';
import { edgeDistance, EDGE } from '../shared/bounds';

const tmp = [0, 0, 0, 0];
const SIDEWALK_Y = 0.15;

function edgePoint(S: SimCore, p: Ped) {
  const e = S.net.g.walkEdges[p.edge];
  sampleAt(e.pts, S.net.walkCum[p.edge], p.s, tmp);
  const fx = tmp[2] * p.dir, fz = tmp[3] * p.dir;
  // lat is in edge frame (+ = right of the edge polyline direction)
  p.x = tmp[0] - tmp[3] * p.lat; p.z = tmp[1] + tmp[2] * p.lat;
  return [fx, fz] as const;
}

function placeOnEdge(S: SimCore, p: Ped) {
  const [fx, fz] = edgePoint(S, p);
  if (Math.hypot(p.x - p.px, p.z - p.pz) > 0.01) p.yaw = Math.atan2(-fx, -fz);
  const e = S.net.g.walkEdges[p.edge];
  if (e.kind === WalkKind.Crosswalk) {
    const L = S.net.walkLen[p.edge];
    p.onRoad = p.s > 0.9 && p.s < L - 0.9; p.y = p.onRoad ? 0 : SIDEWALK_Y;
  } else { p.onRoad = false; p.y = SIDEWALK_Y; }
}

// ------------------------------------------------------------------ spawning
function newPed(S: SimCore, arch: ArchetypeRt, edge: number, s: number): Ped {
  const half = S.net.g.walkEdges[edge].half;
  const p: Ped = {
    id: S.nextId++, arch, variant: S.rng.int(8), alive: true, edge, s, dir: S.rng.chance(0.5) ? 1 : -1,
    lat: S.rng.range(-half, half) * 0.8, latGoal: 0, speed: arch.walkSpeed * S.rng.range(0.85, 1.15) * (S.weather === 'rain' ? 1.15 : 1), v: 0,
    state: 'walk', timer: 0, node: -1, prevEdge: -1, x: 0, z: 0, y: SIDEWALK_Y, yaw: 0, px: 0, pz: 0, pyaw: 0,
    tx: 0, tz: 0, toEdge: -1, toS: 0, spot: -1, goalSpot: -1, jayCd: S.rng.range(1, 10), hailCd: S.rng.range(5, 60), hail: null,
    fleeX: 0, fleeZ: 0, onRoad: false, jaywalking: false, then: '', fleeSpeed: 0, cop: arch.behaviour === 'beat_cop', goal: null, path: [], nerve: Math.max(0, Math.min(1, arch.nerve + S.rng.range(-0.15, 0.15))), cop2: null, actName: '', actPrev: '', doorId: '',
  };
  p.latGoal = S.rng.range(0.1, 0.6) * half;
  return p;
}

function addPed(S: SimCore, p: Ped) {
  placeOnEdge(S, p);
  p.px = p.x; p.pz = p.z; p.pyaw = p.yaw;
  S.peds.push(p); S.pedById.set(p.id, p); S.stats.spawnedP++;
}

function freeSpot(S: SimCore, x: number, z: number, r: number, kinds: number[]): number {
  const g = S.net.g;
  let best = -1, bd = r;
  // spots are not spatially indexed (few thousand); sample deterministically
  for (let k = 0; k < 40; k++) {
    const i = S.rng.int(g.spots.length), sp = g.spots[i];
    if (S.spotOwner[i] >= 0 || !kinds.includes(sp.kind)) continue;
    const d = Math.hypot(sp.x - x, sp.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function goFree(p: Ped, x: number, z: number, then: string) { p.state = 'free'; p.tx = x; p.tz = z; p.then = then; }

export function spawnPeds(S: SimCore, budget: number, full: boolean) {
  const net = S.net, g = net.g;
  const target = Math.round(S.maxPeds * pedDensity(S.minute) * (S.weather === 'rain' ? 0.6 : 1));
  const [rIn, rOut] = S.ringP;
  let n = S.peds.length;
  for (let tries = 0; n < target && tries < budget * 6 && budget > 0; tries++) {
    const edge = net.sidewalkIds[S.rng.int(net.sidewalkIds.length)];
    const len = net.walkLen[edge];
    if (len < 4) continue;
    const s = S.rng.range(1, len - 1);
    sampleAt(g.walkEdges[edge].pts, net.walkCum[edge], s, tmp);
    const d = Math.hypot(tmp[0] - S.focus.x, tmp[1] - S.focus.z);
    if (d > rOut || (!full && d < rIn)) continue;
    if (S.densityHook && S.rng.next() > S.densityHook(tmp[0], tmp[1], 'ped')) continue;
    // crowds thicken toward the playable edge (BOUNDARIES layer 3)
    const ramp = Math.max(0, Math.min(1, 1 - edgeDistance(tmp[0], tmp[1]) / EDGE.RAMP));
    if (!full && S.rng.next() > 0.5 + 0.5 * ramp) continue;
    const arch = S.reg.pick((a) => a.behaviour !== 'driver' && a.behaviour !== 'critter', tmp[0], tmp[1], S.minute, S.rng.next());
    if (!arch) continue;
    const p = newPed(S, arch, edge, s);
    if (arch.behaviour === 'vendor') {
      const sp = freeSpot(S, tmp[0], tmp[1], 60, [SpotKind.Storefront, SpotKind.Corner]);
      if (sp < 0) continue;
      const spot = g.spots[sp];
      p.edge = spot.edge; p.s = Math.min(spot.s, net.walkLen[spot.edge]); p.spot = sp; S.spotOwner[sp] = p.id;
      addPed(S, p); p.state = 'vendor'; p.x = spot.x; p.z = spot.z; p.px = p.x; p.pz = p.z; p.yaw = p.pyaw = spot.heading; p.onRoad = false;
    } else if (arch.behaviour === 'commuter' && S.rng.chance(0.25)) {
      // emerge from a subway entrance
      const sp = freeSpot(S, tmp[0], tmp[1], 120, [SpotKind.Subway]);
      if (sp < 0) { addPed(S, p); }
      else {
        const spot = g.spots[sp];
        p.edge = spot.edge; p.s = Math.min(spot.s, net.walkLen[spot.edge]);
        addPed(S, p); p.x = p.px = spot.x; p.z = p.pz = spot.z;
        const e = g.walkEdges[p.edge]; sampleAt(e.pts, net.walkCum[p.edge], p.s, tmp);
        p.toEdge = p.edge; p.toS = p.s; goFree(p, tmp[0], tmp[1], 'attach');
        S.emit('subwayExit', { id: p.id, x: spot.x, z: spot.z });
      }
    } else {
      addPed(S, p);
      if (arch.behaviour === 'loiterer' || (arch.behaviour === 'commuter' && S.rng.chance(0.4))) assignGoal(S, p);
    }
    n++; budget--;
  }
}

function assignGoal(S: SimCore, p: Ped) {
  const kinds = p.arch.behaviour === 'commuter' ? [SpotKind.Subway] : p.arch.behaviour === 'loiterer' ? [SpotKind.Stoop, SpotKind.Storefront, SpotKind.Corner, SpotKind.Subway] : [SpotKind.BusStop];
  p.goalSpot = freeSpot(S, p.x, p.z, 220, kinds);
}

/** A ped appears at the kerb nearest (x,z): cab drop-offs, bus alighting. */
export function spawnPedAt(S: SimCore, x: number, z: number, reason: string) {
  const near = S.net.sidewalksNear(x, z, 20, new Set());
  let best = -1, bd = 15, bs = 0;
  for (const e of near) { const pr = projectOnPoly(S.net.g.walkEdges[e].pts, x, z); if (pr.d < bd) { bd = pr.d; best = e; bs = pr.s; } }
  if (best < 0) return;
  const arch = S.reg.pick((a) => a.behaviour === 'walker' || a.behaviour === 'commuter', x, z, S.minute, S.rng.next());
  if (!arch) return;
  const p = newPed(S, arch, best, Math.max(0.1, Math.min(bs, S.net.walkLen[best] - 0.1)));
  addPed(S, p);
  S.emit(reason, { id: p.id, x: p.x, z: p.z });
}

/** A ped of a given archetype on the sidewalk nearest (x,z) (wildlife feeders, scripted spawns). */
export function spawnPedNear(S: SimCore, x: number, z: number, arch: ArchetypeRt, r: number): Ped | null {
  const near = S.net.sidewalksNear(x, z, r, new Set());
  let best = -1, bd = r, bs = 0;
  for (const e of near) { const pr = projectOnPoly(S.net.g.walkEdges[e].pts, x, z); if (pr.d < bd) { bd = pr.d; best = e; bs = pr.s; } }
  if (best < 0) return null;
  const p = newPed(S, arch, best, Math.max(0.1, Math.min(bs, S.net.walkLen[best] - 0.1)));
  p.lat = 0; addPed(S, p);
  return p;
}

export function despawnPed(S: SimCore, p: Ped) {
  p.alive = false;
  if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1;
  if (p.hail) { const i = S.hails.indexOf(p.hail); if (i >= 0 && p.hail.claimedBy < 0) S.hails.splice(i, 1); else p.hail.ped = -1; p.hail = null; }
}

// ------------------------------------------------------------------ traffic gap checks
function trafficClearForCrosswalk(S: SimCore, walkEdge: number, pedWait = 0): boolean {
  const net = S.net, e = net.g.walkEdges[walkEdge];
  // a siren coming: nobody steps off the kerb (those already crossing finish)
  if (S.sirens.length) { const mx = (e.pts[0] + e.pts[e.pts.length - 2]) / 2, mz = (e.pts[1] + e.pts[e.pts.length - 1]) / 2; for (const sv of S.sirens) if (Math.hypot(sv.x - mx, sv.z - mz) < 40) return false; }
  for (const c of S.crossConns.get(walkEdge) ?? []) if (S.occ[c].length) return false;
  const lanes = net.approachLanes.get(e.owner * 16 + e.arm) ?? [];
  for (const l of lanes) for (const v of S.occ[l]) if (net.len[l] - v.s < 35 && v.v > 1) return false;
  // vehicles about to turn through it from other arms; and a car that has waited at the line for a
  // while gets to go (New York drivers nudge through a stream of walkers; it also prevents starvation)
  const J = net.g.junctions[e.owner];
  const xc = S.crossConns.get(walkEdge) ?? [];
  for (let k = 0; k < J.arms.length; k++) for (const l of net.approachLanes.get(e.owner * 16 + k) ?? []) for (const v of S.occ[l]) {
    if (v.next < 0 || !xc.includes(v.next)) continue;
    const dEnd = net.len[l] - v.s;
    if (dEnd < (pedWait > 20 ? 10 : 25) && v.v > 0.5) return false;
    if (dEnd < v.len / 2 + 4 && v.waitT > 6 && v.waitT > pedWait && net.laneSignal(l, S.t) !== 2 /* not red */) return false;
  }
  return true;
}

function trafficClearMidblock(S: SimCore, road: number, x: number, z: number): boolean {
  for (const l of S.net.roadLanes[road]) for (const v of S.occ[l]) {
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < 45 && (v.v > 0.5 || d < 8)) {
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      if ((x - v.x) * fx + (z - v.z) * fz > -4) return false; // approaching or alongside
    }
  }
  return true;
}

function copNear(S: SimCore, x: number, z: number): boolean {
  let near = false;
  S.pGrid.query(x, z, 30, (i) => { if (S.peds[i].cop) near = true; });
  return near;
}

/** Would stepping `look` metres along (fx,fz) put this ped against a vehicle body? Peds in the road stop rather than walk into cars. */
function vehicleInWay(S: SimCore, x: number, z: number, fx: number, fz: number, look: number): boolean {
  let hit = false;
  const qx = x + fx * look, qz = z + fz * look;
  S.vGrid.query(qx, qz, 8, (i) => {
    if (hit) return;
    const v = S.vehicles[i];
    if (!v.alive) return;
    const vx = -Math.sin(v.yaw), vz = -Math.cos(v.yaw);
    for (const f of [0.5, 1]) {
      const px = x + (qx - x) * f - v.x, pz = z + (qz - z) * f - v.z;
      // moving cars get a generous margin; a stopped car (often waiting for us) only blocks if we'd walk into it
      const m = v.v > 0.3 ? 0.6 : 0.2;
      if (Math.abs(px * vx + pz * vz) < v.len / 2 + m + (v.v > 0.3 ? v.v * 0.6 : 0) && Math.abs(px * vz - pz * vx) < v.wid / 2 + m) { hit = true; return; }
    }
  });
  return hit;
}

// ------------------------------------------------------------------ navigation
function chooseNext(S: SimCore, p: Ped, node: number, arrivedVia: number): number {
  const net = S.net, adj = net.walkAdj[node];
  const n = net.g.walkNodes[node];
  let best = -1, bw = -Infinity;
  // arrival direction
  const ae = net.g.walkEdges[arrivedVia];
  const other = ae.a === node ? net.g.walkNodes[ae.b] : net.g.walkNodes[ae.a];
  const ax = n.x - other.x, az = n.z - other.z, al = Math.hypot(ax, az) || 1;
  const goal = p.goalSpot >= 0 ? net.g.spots[p.goalSpot] : null;
  for (const [e, o] of adj) {
    if (e === arrivedVia && adj.length > 1) continue;
    const on = net.g.walkNodes[o];
    const dx = on.x - n.x, dz = on.z - n.z, dl = Math.hypot(dx, dz) || 1;
    const straight = (ax * dx + az * dz) / (al * dl);
    let w: number;
    if (p.state === 'flee') w = Math.hypot(on.x - p.fleeX, on.z - p.fleeZ) - Math.hypot(n.x - p.fleeX, n.z - p.fleeZ) + S.rng.next() * 3;
    else {
      w = Math.log(1.6 + straight) + S.rng.next() * 1.2;
      const isCross = net.g.walkEdges[e].kind === WalkKind.Crosswalk;
      if (isCross) w += Math.log(p.cop ? 0.35 : 0.7);
      if (goal) w += (Math.hypot(n.x - goal.x, n.z - goal.z) - Math.hypot(on.x - goal.x, on.z - goal.z)) / 15 + (e === goal.edge ? 3 : 0);
      // stay near the focus: discourage walking out of the ring
      const dNow = Math.hypot(n.x - S.focus.x, n.z - S.focus.z), dNext = Math.hypot(on.x - S.focus.x, on.z - S.focus.z);
      if (dNext > S.ringP[1] * 0.9 && dNext > dNow) w -= 1.5;
    }
    if (w > bw) { bw = w; best = e; }
  }
  return best < 0 ? arrivedVia : best;
}

function enterEdge(S: SimCore, p: Ped, e: number, fromNode: number) {
  const E = S.net.g.walkEdges[e];
  if (S.net.g.walkEdges[p.edge]?.kind === WalkKind.Crosswalk) leaveCrosswalk(S, p);
  p.prevEdge = p.edge; p.edge = e;
  p.dir = E.a === fromNode ? 1 : -1;
  p.s = p.dir > 0 ? 0 : S.net.walkLen[e];
  p.lat = Math.max(-E.half, Math.min(E.half, p.lat));
  if (E.kind === WalkKind.Sidewalk) S.footCount[E.owner]++;
  if (E.kind === WalkKind.Crosswalk) { (S.onWalk.get(e) ?? S.onWalk.set(e, []).get(e)!).push(p); S.stats.crossings++; p.lat = 0; }
}
function leaveCrosswalk(S: SimCore, p: Ped) {
  const l = S.onWalk.get(p.edge); if (l) { const i = l.indexOf(p); if (i >= 0) l.splice(i, 1); }
  p.jaywalking = false;
}

function arriveNode(S: SimCore, p: Ped) {
  const net = S.net, E = net.g.walkEdges[p.edge];
  const node = p.dir > 0 ? E.b : E.a;
  p.node = node;
  let next = -1;
  if (p.goal) {
    if (p.path.length && !net.walkAdj[node].some(([e]) => e === p.path[0])) replan(S, p, node);
    if (p.path.length) next = p.path.shift()!;
    else { goalLegDone(S, p, node); if (!p.goal) next = chooseNext(S, p, node, p.edge); else if (p.path.length) next = p.path.shift()!; else { p.state = 'hold'; p.v = 0; return; } }
  }
  if (next < 0) next = chooseNext(S, p, node, p.edge);
  let N = net.g.walkEdges[next];
  if (N.kind === WalkKind.Crosswalk && p.state === 'flee' && !trafficClearForCrosswalk(S, next)) {
    // even panicking, people don't run into moving traffic: keep to the sidewalk
    let alt = -1, bd = -Infinity;
    for (const [e, o] of net.walkAdj[node]) if (net.g.walkEdges[e].kind === WalkKind.Sidewalk) {
      const on = net.g.walkNodes[o], d = Math.hypot(on.x - p.fleeX, on.z - p.fleeZ);
      if (d > bd) { bd = d; alt = e; }
    }
    if (alt < 0) { if (E.kind === WalkKind.Crosswalk) leaveCrosswalk(S, p); p.state = 'cower'; p.timer = 2; return; }
    next = alt; N = net.g.walkEdges[next];
  }
  if (N.kind === WalkKind.Crosswalk && p.state !== 'flee') {
    const crossT = net.walkLen[next] / Math.max(0.8, p.speed);
    const sig = (net.g.junctions[N.owner].flags & JuncFlag.Signal) !== 0;
    if ((sig ? net.walkAllowed(N.owner, N.arm, S.t, crossT) || !!p.goal?.urgent : true) && trafficClearForCrosswalk(S, next)) { enterEdge(S, p, next, node); return; }
    if (E.kind === WalkKind.Crosswalk) leaveCrosswalk(S, p);
    p.state = 'waitCross'; p.toEdge = next; p.timer = 0; p.v = 0;
    return;
  }
  // beat cop pauses at corners now and then
  if (p.cop && !p.goal && S.rng.chance(0.25)) { p.state = 'pause'; p.timer = S.rng.range(4, 14); p.toEdge = next; p.v = 0; if (E.kind === WalkKind.Crosswalk) leaveCrosswalk(S, p); return; }
  enterEdge(S, p, next, node);
}

// ------------------------------------------------------------------ main step
export function stepPeds(S: SimCore, dt: number) {
  const net = S.net, g = net.g;
  for (let i = 0; i < S.peds.length; i++) {
    const p = S.peds[i];
    if (!p.alive) continue;
    p.px = p.x; p.pz = p.z; p.pyaw = p.yaw;
    p.jayCd -= dt; p.hailCd -= dt;
    if (p.goal?.until !== undefined && S.t > p.goal.until && p.state !== 'dead') setPedGoal(S, p, null);
    switch (p.state) {
      case 'dead': p.v = 0; if ((p.timer -= dt) <= 0) { despawnPed(S, p); S.stats.despawnedP++; } break;
      case 'act': // gameplay action (call box, payphone, hands up...): hold still, the crowd renderer animates
        p.v = 0;
        if ((p.timer -= dt) <= 0) { p.state = p.actPrev === 'free' ? 'free' : 'walk'; p.actName = ''; p.goal = null; }
        break;
      case 'hold': { // scripted goal reached / escort waiting: stand, face the target, resume when told
        p.v = 0;
        if (p.goal?.kind === 'escort' || p.goal?.kind === 'follow') { const sp = goalSpeed(S, p); if (sp > 0.05 && p.path.length) { const E = g.walkEdges[p.edge]; enterEdge(S, p, p.path.shift()!, p.dir > 0 ? E.b : E.a); p.state = 'walk'; } }
        if (p.goal?.kind === 'follow' && (p.goal.replanT = (p.goal.replanT ?? 0) - dt) <= 0) { p.goal.replanT = 2; const E = g.walkEdges[p.edge]; replan(S, p, p.dir > 0 ? E.b : E.a); }
        break;
      }
      case 'feed': // pigeon feeder on his bench spot; walks back to the sidewalk when done
        p.timer -= dt; p.v = 0;
        if (p.timer <= 0) { const e = g.walkEdges[p.edge]; sampleAt(e.pts, net.walkCum[p.edge], p.s, tmp); p.toEdge = p.edge; p.toS = p.s; goFree(p, tmp[0], tmp[1], 'attach'); }
        break;
      case 'vendor': case 'loiter': case 'hail': case 'waitBus': case 'cower': case 'pause': {
        p.timer -= dt; p.v = 0;
        if (p.state === 'hail' && p.hail && p.hail.claimedBy >= 0) p.timer = Math.max(p.timer, 2); // wait for the cab
        if (p.timer <= 0 && p.state !== 'vendor') {
          if (p.state === 'pause') { const E = g.walkEdges[p.edge]; enterEdge(S, p, p.toEdge, p.dir > 0 ? E.b : E.a); p.state = 'walk'; break; }
          if (p.hail) { const k = S.hails.indexOf(p.hail); if (k >= 0) S.hails.splice(k, 1); p.hail = null; }
          if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1;
          p.spot = -1; p.goalSpot = -1;
          const e = g.walkEdges[p.edge]; sampleAt(e.pts, net.walkCum[p.edge], p.s, tmp);
          p.toEdge = p.edge; p.toS = p.s; goFree(p, tmp[0], tmp[1], 'attach');
        }
        break;
      }
      case 'waitCross': {
        p.timer += dt; p.v = 0;
        const N = g.walkEdges[p.toEdge];
        const crossT = net.walkLen[p.toEdge] / Math.max(0.8, p.speed);
        const sig = (g.junctions[N.owner].flags & JuncFlag.Signal) !== 0;
        const clear = trafficClearForCrosswalk(S, p.toEdge, p.timer);
        let go = clear && (!sig || net.walkAllowed(N.owner, N.arm, S.t, crossT));
        if (!go && clear && sig && p.jayCd <= 0) {
          p.jayCd = 1;
          if (S.rng.chance(p.arch.jaywalk * 0.12 * (S.weather === 'rain' ? 1.5 : 1)) && !copNear(S, p.x, p.z)) { go = true; p.jaywalking = true; S.stats.jaywalks++; S.emit('jaywalk', { id: p.id, x: p.x, z: p.z }); }
        }
        if (go) { const j = p.jaywalking; p.state = 'walk'; enterEdge(S, p, p.toEdge, p.node); p.jaywalking = j; }
        else if (p.timer > 120) { // give up: take any sidewalk instead
          const alt = S.net.walkAdj[p.node].find(([e]) => g.walkEdges[e].kind === WalkKind.Sidewalk && e !== p.toEdge);
          if (alt) { p.state = 'walk'; enterEdge(S, p, alt[0], p.node); } else p.timer = 0;
        }
        break;
      }
      case 'free': {
        const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
        const sp = p.then === 'flee' ? p.fleeSpeed : p.jaywalking ? p.speed * 1.3 : p.speed;
        p.v = sp;
        if (d < sp * dt + 0.05) {
          p.x = p.tx; p.z = p.tz;
          const then = p.then; p.then = '';
          if (then === 'attach' || then === 'flee') {
            p.edge = p.toEdge; p.s = Math.max(0, Math.min(net.walkLen[p.edge], p.toS)); p.lat = 0; p.state = then === 'flee' ? 'flee' : 'walk';
            if (p.jaywalking) { p.jaywalking = false; p.dir = S.rng.chance(0.5) ? 1 : -1; }
            placeOnEdge(S, p);
          } else if (then === 'enterDoor') { S.doorStepIn?.(p); despawnPed(S, p); S.stats.despawnedP++; }
          else if (then === 'vanish') { despawnPed(S, p); S.stats.despawnedP++; S.emit('subwayEnter', { id: p.id, x: p.x, z: p.z }); }
          else if (then === 'loiter') { p.state = 'loiter'; p.timer = S.rng.range(20, 120) * (S.minute > 20 * 60 || S.minute < 5 * 60 ? 2 : 1); p.yaw = g.spots[p.spot].heading; }
          else if (then === 'feed') { p.state = 'feed'; p.timer = S.rng.range(240, 600); }
          else if (then === 'waitBus') { p.state = 'waitBus'; p.timer = S.rng.range(60, 240); p.yaw = g.spots[p.spot].heading; }
          else if (then === 'hail') {
            p.state = 'hail'; p.timer = S.rng.range(45, 100); // people wait a while for a cab
            const E = g.walkEdges[p.edge];
            p.hail = { ped: p.id, road: E.owner, side: E.side, x: p.x, z: p.z, claimedBy: -1, t: S.t };
            S.hails.push(p.hail); S.stats.hails++;
            S.emit('hail', { id: p.id, x: p.x, z: p.z, archetype: p.arch.def.id });
          }
        } else if (p.jaywalking && vehicleInWay(S, p.x, p.z, dx / d, dz / d, 0.6 + sp * 0.6)) {
          p.v = 0; // wait for the car to pass
        } else {
          p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; p.yaw = Math.atan2(-dx, -dz);
        }
        if (p.jaywalking) { p.onRoad = true; p.y = 0; } else { p.onRoad = false; p.y = SIDEWALK_Y; }
        break;
      }
      default: walk(S, p, dt);
    }
  }
}

function walk(S: SimCore, p: Ped, dt: number) {
  const net = S.net, g = net.g, E = g.walkEdges[p.edge];
  const flee = p.state === 'flee';
  if (flee) { p.timer -= dt; if (p.timer <= 0) { p.state = 'walk'; } }
  let want = flee ? p.fleeSpeed : p.speed * (p.onRoad ? 1.15 : 1);
  if (p.goal && !flee) want = goalSpeed(S, p);
  // local frame
  sampleAt(E.pts, net.walkCum[p.edge], p.s, tmp);
  const fx = tmp[2] * p.dir, fz = tmp[3] * p.dir;
  const half = E.kind === WalkKind.Crosswalk ? 1.2 : E.half;
  let speed = want;
  let myRight = p.lat * p.dir; // my lateral offset to my right
  let goalR = p.latGoal;       // keep to the right
  const rad = p.arch.def.props?.includes('handcart') ? 0.8 : 0.4;
  S.pGrid.query(p.x, p.z, 2.4, (j) => {
    const q = S.peds[j]; if (q === p || !q.alive) return;
    const rx = q.x - p.x, rz = q.z - p.z;
    const ahead = rx * fx + rz * fz, side = rx * -fz + rz * fx; // + = to my right
    const d = Math.hypot(rx, rz);
    if (d < 0.6 && d > 1e-3) myRight -= (side >= 0 ? 1 : -1) * (0.6 - d) * 0.5; // separation
    if (ahead > 0 && ahead < 2.4 && Math.abs(side) < 0.75 + rad) {
      const qf = (q.x - q.px) * fx + (q.z - q.pz) * fz;
      if (qf < 0) goalR = Math.min(half, Math.max(goalR, side + 0.85)); // oncoming: sidestep right
      else if (q.v < 0.2) { goalR = side > 0 ? side - 0.85 : side + 0.85; speed = Math.min(speed, 0.6); } // standing person: step around, never queue behind
      else if (q.v < speed && ahead < 1.3) speed = Math.min(speed, Math.max(0, q.v)); // follow slower ped
    }
  });
  for (const a of S.actors) {
    const rx = a.x - p.x, rz = a.z - p.z, ahead = rx * fx + rz * fz, side = rx * -fz + rz * fx;
    if (ahead > 0 && ahead < 3 && Math.abs(side) < 0.6 + a.radius) goalR = Math.max(-half, Math.min(half, side > 0 ? side - a.radius - 0.7 : side + a.radius + 0.7));
  }
  goalR = Math.max(-half, Math.min(half, goalR));
  myRight += Math.sign(goalR - myRight) * Math.min(Math.abs(goalR - myRight), dt * 0.9);
  const endRoom = Math.min(p.s, net.walkLen[p.edge] - p.s); // corners: taper the band to the path
  const halfHere = E.kind === WalkKind.Sidewalk ? Math.min(half, Math.max(0, endRoom * 0.6)) : half;
  myRight = Math.max(-halfHere, Math.min(halfHere, myRight));
  p.lat = myRight * p.dir;
  if (p.onRoad && vehicleInWay(S, p.x, p.z, fx, fz, 0.6 + p.v * 0.6)) { speed = 0; p.v = 0; }
  p.v += Math.sign(speed - p.v) * Math.min(Math.abs(speed - p.v), dt * (p.onRoad ? 4 : 2));
  p.s += p.dir * p.v * dt;
  const len = net.walkLen[p.edge];
  if (p.goal?.kind === 'goto' && p.goal.edge === p.edge && !p.path.length && Math.abs(p.s - (p.goal.s ?? -9)) < 0.8) {
    placeOnEdge(S, p); p.state = 'hold'; p.v = 0; S.emit('goalReached', { id: p.id, x: p.x, z: p.z });
    if (p.goal.then === 'subway') { const tx = p.goal.x!, tz = p.goal.z!; p.goal = null; goFree(p, tx, tz, 'vanish'); }
    else if (p.goal.then === 'door' && p.goal.doorId) { const id = p.goal.doorId; p.goal = null; S.doorArrived?.(p, id); }
    return;
  }
  if (p.s >= len || p.s <= 0) { p.s = Math.max(0, Math.min(len, p.s)); placeOnEdge(S, p); arriveNode(S, p); placeOnEdge(S, p); return; }
  placeOnEdge(S, p);
  if (flee || E.kind !== WalkKind.Sidewalk || p.goal) return;
  // reached the goal spot?
  if (p.goalSpot >= 0) {
    const sp = g.spots[p.goalSpot];
    if (sp.edge === p.edge && Math.abs(sp.s - p.s) < 1.0) {
      if (S.spotOwner[p.goalSpot] >= 0) { p.goalSpot = -1; return; }
      p.spot = p.goalSpot; S.spotOwner[p.spot] = p.id;
      goFree(p, sp.x, sp.z, sp.kind === SpotKind.Subway && p.arch.behaviour === 'commuter' ? 'vanish' : sp.kind === SpotKind.BusStop ? 'waitBus' : 'loiter');
      return;
    }
  }
  // decisions, ~once a second
  if (p.jayCd > 0) return;
  p.jayCd = 1;
  const road = E.owner;
  // hail a cab
  if (p.arch.hail > 0 && p.hailCd <= 0 && S.rng.chance(p.arch.hail / 60 * (S.weather === 'rain' ? 3 : 1)) && p.s > 6 && p.s < len - 6) {
    p.hailCd = 120;
    // step to the kerb edge of the walking band: the road is on the opposite side of E.side
    sampleAt(E.pts, net.walkCum[p.edge], p.s, tmp);
    const lr = -E.side * E.half;
    p.toEdge = p.edge; p.toS = p.s;
    goFree(p, tmp[0] - tmp[3] * lr, tmp[1] + tmp[2] * lr, 'hail');
    return;
  }
  // mid-block jaywalk across to the opposite sidewalk
  if (E.opposite >= 0 && p.s > 8 && p.s < len - 8 && p.arch.jaywalk > 0) {
    const avenue = net.isAvenue(road);
    const ch = p.arch.jaywalk * 0.015 * (avenue ? 0.3 : 1) * (S.weather === 'rain' ? 1.5 : 1);
    if (S.rng.chance(ch) && !copNear(S, p.x, p.z) && trafficClearMidblock(S, road, p.x, p.z)) {
      const O = g.walkEdges[E.opposite];
      const pr = projectOnPoly(O.pts, p.x, p.z);
      if (pr.s > 2 && pr.s < net.walkLen[E.opposite] - 2 && pr.d < g.roads[road].width + 2 * (g.roads[road].sidewalk * 0.42 + 0.5) + 1.5) {
        sampleAt(O.pts, net.walkCum[E.opposite], pr.s, tmp);
        p.toEdge = E.opposite; p.toS = pr.s; p.jaywalking = true; p.onRoad = true;
        goFree(p, tmp[0], tmp[1], 'attach'); S.stats.jaywalks++;
        S.emit('jaywalk', { id: p.id, x: p.x, z: p.z, midblock: true });
      }
    }
  }
  // wandering walkers occasionally pick a bus stop / loiter goal
  if (p.goalSpot < 0 && S.rng.chance(p.arch.behaviour === 'loiterer' ? 0.05 : p.arch.behaviour === 'walker' ? 0.004 : 0)) assignGoal(S, p);
}

/** Threat at a point: flee or cower. */
export function threaten(S: SimCore, x: number, z: number, r: number) {
  const net = S.net, g = net.g;
  for (const p of S.peds) {
    if (!p.alive || p.state === 'dead' || p.state === 'act' || p.cop2) continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > r * 1.6) continue;
    if (p.hail) { const k = S.hails.indexOf(p.hail); if (k >= 0 && p.hail.claimedBy < 0) S.hails.splice(k, 1); p.hail = null; }
    p.fleeX = x; p.fleeZ = z; p.fleeSpeed = S.rng.range(3.4, 4.6); p.timer = S.rng.range(6, 12);
    if (d < r * 0.6 && S.rng.chance(0.2) && p.state !== 'free' && !p.onRoad) { p.state = 'cower'; p.timer = S.rng.range(4, 8); continue; }
    if (p.state === 'waitCross' || p.state === 'pause') { p.state = 'flee'; continue; }
    if (p.state === 'free') { p.then = p.then === 'attach' ? 'flee' : p.then === 'vanish' ? 'vanish' : 'flee'; if (p.then === 'flee' && p.toEdge < 0) p.toEdge = p.edge; continue; }
    if (p.state === 'vendor' || p.state === 'loiter' || p.state === 'hail' || p.state === 'waitBus' || p.state === 'cower' || p.state === 'feed') {
      if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1;
      p.spot = -1; p.goalSpot = -1;
      const e = g.walkEdges[p.edge]; sampleAt(e.pts, net.walkCum[p.edge], p.s, tmp);
      p.toEdge = p.edge; p.toS = p.s; goFree(p, tmp[0], tmp[1], 'flee');
      continue;
    }
    // on an edge: run away along it
    p.state = 'flee';
    const E = g.walkEdges[p.edge];
    const A = g.walkNodes[E.a], B = g.walkNodes[E.b];
    p.dir = Math.hypot(B.x - x, B.z - z) > Math.hypot(A.x - x, A.z - z) ? 1 : -1;
  }
}

/** Fast external vehicles: peds in their path jump aside. */
export function dodgeActors(S: SimCore) {
  for (const a of S.actors) {
    const sp = Math.hypot(a.vx, a.vz);
    if (a.kind !== 'vehicle' || sp < 3) continue;
    const ux = a.vx / sp, uz = a.vz / sp;
    S.pGrid.query(a.x + ux * 6, a.z + uz * 6, 8, (i) => {
      const p = S.peds[i];
      if (!p.alive || p.state === 'flee' || p.state === 'cower') return;
      const rx = p.x - a.x, rz = p.z - a.z, ahead = rx * ux + rz * uz, side = Math.abs(rx * uz - rz * ux);
      if (ahead > 0 && ahead / sp < 1.5 && side < a.radius + 1.5) {
        if (p.state === 'walk' || p.state === 'waitCross' || p.state === 'pause') {
          p.state = 'flee'; p.fleeX = a.x; p.fleeZ = a.z; p.fleeSpeed = 4.5; p.timer = S.rng.range(2, 4);
          const E = S.net.g.walkEdges[p.edge], A = S.net.g.walkNodes[E.a], B = S.net.g.walkNodes[E.b];
          p.dir = Math.hypot(B.x - a.x - a.vx, B.z - a.z - a.vz) > Math.hypot(A.x - a.x - a.vx, A.z - a.z - a.vz) ? 1 : -1;
          S.emit('dodge', { id: p.id, x: p.x, z: p.z, actor: a.id });
        }
      }
    });
  }
}

// ------------------------------------------------------------------ scripted goals (gameplay / narrative hooks)
/** Nearest walk node to a point. */
export function nearestNode(S: SimCore, x: number, z: number): number {
  const g = S.net.g;
  let best = 0, bd = Infinity;
  for (let i = 0; i < g.walkNodes.length; i++) { const n = g.walkNodes[i], d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
/** Shortest edge path on the walk graph (Dijkstra; ~1k nodes). Crosswalks cost a little extra. */
export function walkPath(S: SimCore, from: number, to: number): number[] {
  const net = S.net, N = net.g.walkNodes.length;
  const dist = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[from] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const [e, o] of net.walkAdj[u]) {
      const w = bd + net.walkLen[e] * (net.g.walkEdges[e].kind === WalkKind.Crosswalk ? 1.3 : 1);
      if (w < dist[o]) { dist[o] = w; via[o] = e; }
    }
  }
  const path: number[] = [];
  for (let n = to; n !== from && via[n] >= 0;) { const e = via[n]; path.unshift(e); const E = net.g.walkEdges[e]; n = E.a === n ? E.b : E.a; }
  return path;
}
function goalTarget(S: SimCore, p: Ped): { x: number; z: number; vx: number; vz: number } | null {
  const G = p.goal!;
  if (G.kind === 'escort' || G.kind === 'follow') {
    const id = G.target ?? 'player';
    if (typeof id === 'string') { const a = S.actors.find((x) => x.id === id || (id === 'player' && x.kind === 'player')); return a ? { x: a.x, z: a.z, vx: a.vx, vz: a.vz } : null; }
    const q = S.pedById.get(id); return q ? { x: q.x, z: q.z, vx: (q.x - q.px) * 30, vz: (q.z - q.pz) * 30 } : null;
  }
  return null;
}
function replan(S: SimCore, p: Ped, node: number) {
  const G = p.goal!;
  let tx = G.x ?? p.x, tz = G.z ?? p.z;
  if (G.kind === 'escort' && G.waypoints) { const w = G.waypoints[G.segment ?? 0]; tx = w.x; tz = w.z; }
  if (G.kind === 'follow') { const t = goalTarget(S, p); if (t) { tx = t.x; tz = t.z; } }
  if (G.kind === 'goto') {
    if (G.edge === undefined) { // the sidewalk spot nearest the target
      let be = -1, bd = 40, bs = 0;
      for (const e of S.net.sidewalksNear(tx, tz, 40, new Set())) { const pr = projectOnPoly(S.net.g.walkEdges[e].pts, tx, tz); if (pr.d < bd) { bd = pr.d; be = e; bs = pr.s; } }
      G.edge = be; G.s = bs;
    }
    if (G.edge >= 0) {
      const E = S.net.g.walkEdges[G.edge];
      if (node === E.a || node === E.b) { p.path = [G.edge]; return; }
      const pa = walkPath(S, node, E.a), pb = walkPath(S, node, E.b);
      const la = pa.reduce((a, e) => a + S.net.walkLen[e], 0) + G.s!, lb = pb.reduce((a, e) => a + S.net.walkLen[e], 0) + S.net.walkLen[G.edge] - G.s!;
      p.path = [...(la <= lb ? pa : pb), G.edge];
      return;
    }
  }
  p.path = walkPath(S, node, nearestNode(S, tx, tz));
}
function goalLegDone(S: SimCore, p: Ped, node: number) {
  const G = p.goal!;
  if (G.kind === 'escort' && G.waypoints) {
    const seg = G.segment ?? 0;
    S.emit('escortProgress', { id: p.id, segment: seg, of: G.waypoints.length });
    if (seg + 1 < G.waypoints.length) { G.segment = seg + 1; replan(S, p, node); return; }
    S.emit('escortDone', { id: p.id }); return; // stays in 'hold' with the goal until cleared
  }
  if (G.kind === 'follow') { G.replanT = 0; return; }
  if (G.kind === 'goto') S.emit('goalReached', { id: p.id, x: p.x, z: p.z });
}
/** Escort pace matching: wait when the lead falls behind, lead when ahead, else match their speed. */
function goalSpeed(S: SimCore, p: Ped): number {
  const G = p.goal!;
  const base = G.speed ?? p.speed;
  if (G.kind !== 'escort' && G.kind !== 'follow') return base;
  const t = goalTarget(S, p);
  if (!t) return base;
  const d = Math.hypot(t.x - p.x, t.z - p.z), wait = G.waitRadius ?? 8, max = G.maxSpeed ?? 2.2;
  if (G.kind === 'follow') return d < 2.5 ? 0 : Math.min(max, d > 8 ? max : Math.hypot(t.vx, t.vz) + 0.3);
  if (d > wait) return 0;
  const wp = G.waypoints?.[G.segment ?? 0];
  const leadAhead = wp ? Math.hypot(t.x - wp.x, t.z - wp.z) < Math.hypot(p.x - wp.x, p.z - wp.z) : false;
  if (leadAhead) return Math.min(max, base * 1.4);
  return Math.max(0.8, Math.min(max, Math.hypot(t.vx, t.vz)));
}
export function setPedGoal(S: SimCore, p: Ped, goal: PedGoal | null) {
  if (p.state === 'dead') return;
  p.goal = goal; p.path = [];
  if (!goal) { if (p.state === 'hold') p.state = 'walk'; if (p.state === 'act') { p.state = p.actPrev === 'free' ? 'free' : 'walk'; p.actName = ''; } return; }
  if (goal.kind === 'act') {
    if (goal.name === 'die') { killPed(S, p, goal.duration ?? 120); return; }
    p.actPrev = p.state === 'free' ? 'free' : 'walk'; p.state = 'act'; p.actName = goal.name ?? 'idle'; p.timer = goal.duration ?? Infinity; p.v = 0;
    return;
  }
  if (goal.kind === 'flee') { threatenOne(S, p, goal.x ?? p.x, goal.z ?? p.z, goal.speed); p.goal = null; return; }
  if (goal.kind === 'flagDownCar') {
    const E = S.net.g.walkEdges[p.edge];
    if (E.kind !== WalkKind.Sidewalk) { p.goal = null; return; }
    sampleAt(E.pts, S.net.walkCum[p.edge], p.s, tmp);
    const lr = -E.side * E.half; p.toEdge = p.edge; p.toS = p.s; p.goal = null;
    goFree(p, tmp[0] - tmp[3] * lr, tmp[1] + tmp[2] * lr, 'hail'); return;
  }
  if (goal.kind === 'escort') goal.segment = 0;
  if (p.state !== 'walk' && p.state !== 'hold') {
    // leave spots / waiting states and get back on the path first
    if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1;
    p.spot = -1; p.goalSpot = -1;
    if (p.state !== 'free') { const e = S.net.g.walkEdges[p.edge]; sampleAt(e.pts, S.net.walkCum[p.edge], p.s, tmp); p.toEdge = p.edge; p.toS = p.s; goFree(p, tmp[0], tmp[1], 'attach'); }
  }
  const E = S.net.g.walkEdges[p.edge];
  replan(S, p, p.dir > 0 ? E.b : E.a);
  if (p.state === 'hold') p.state = 'walk';
}
function threatenOne(S: SimCore, p: Ped, x: number, z: number, speed?: number) {
  p.fleeX = x; p.fleeZ = z; p.fleeSpeed = speed ?? S.rng.range(3.4, 4.6); p.timer = S.rng.range(6, 12);
  if (p.state === 'walk' || p.state === 'waitCross' || p.state === 'pause' || p.state === 'hold') {
    p.state = 'flee';
    const E = S.net.g.walkEdges[p.edge], A = S.net.g.walkNodes[E.a], B = S.net.g.walkNodes[E.b];
    p.dir = Math.hypot(B.x - x, B.z - z) > Math.hypot(A.x - x, A.z - z) ? 1 : -1;
  }
}

/** Gunfire: panic that scales with distance. Close: cower or flee hard; mid: flee; far: hurry away. */
export function gunfire(S: SimCore, x: number, z: number, loudness: number) {
  for (const p of S.peds) {
    if (!p.alive || p.goal || p.cop2 || p.state === 'dead') continue;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > loudness) continue;
    const f = 1 - d / loudness; // 1 at the muzzle, 0 at the edge of hearing
    if (S.rng.next() > 0.25 + 0.75 * f) continue;
    if (f > 0.75 && !p.onRoad && p.state !== 'free' && S.rng.chance(0.35)) { p.state = 'cower'; p.timer = S.rng.range(5, 12); continue; }
    if (p.state === 'vendor' || p.state === 'loiter' || p.state === 'hail' || p.state === 'waitBus' || p.state === 'feed') threaten(S, x, z, 0.1 + d / 1.6 + 0.01);
    else threatenOne(S, p, x, z, 2.2 + 2.6 * f);
  }
}

/** Stop simulating a ped and leave the body for `bodySeconds` (gameplay). */
export function killPed(S: SimCore, p: Ped, bodySeconds: number) {
  if (p.hail) { const k = S.hails.indexOf(p.hail); if (k >= 0) S.hails.splice(k, 1); p.hail = null; }
  if (p.spot >= 0 && S.spotOwner[p.spot] === p.id) S.spotOwner[p.spot] = -1;
  p.goal = null; p.path = []; p.state = 'dead'; p.v = 0; p.timer = bodySeconds; p.jaywalking = false;
}
