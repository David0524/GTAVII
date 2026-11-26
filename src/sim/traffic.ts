/**
 * Vehicle agents: IDM car-following along lanes and junction connectors, signals (no right on
 * red: a red is a red for every movement), junction conflict + yield rules, don't-block-the-box,
 * lane changes (mandatory for routes/stops, discretionary around slow or stopped vehicles),
 * and the 1974 period behaviours: double-parked trucks, cabs cutting to the curb for fares,
 * buses at stops, horns.
 */
import { sampleAt } from './geom';
import { LinkFlag, LinkKind, RoadFlag, Turn, type Link } from './laneFormat';
import { Sig } from './network';
import type { SimCore, Vehicle, Hail } from './state';
import { vehDensity } from './state';
import type { VehicleKind, ArchetypeRt } from './archetypes';
import type { VehicleClass } from '../shared/traffic';
import { edgeDistance, EDGE } from '../shared/bounds';
import { policeConnector, policeVehicleTick } from './police';
import { destConnector, rideBehaviour, rideStopStarted, rideTurnCallout, responderLeave, serviceBehaviour, serviceStopStarted } from './service';

/** Body length/width by shared vehicle class (src/shared/traffic.ts). */
const DIMS: Record<VehicleClass, [number, number]> = {
  sedan: [5.4, 2.0], hardtop: [5.3, 2.0], compact: [4.6, 1.8], wagon: [5.6, 2.0], taxi: [5.3, 2.0], police: [5.4, 2.0],
  bus: [12.0, 2.6], box_truck: [8.0, 2.5], step_van: [6.5, 2.3], garbage: [9.0, 2.5],
  // engine roster additions: the sim doesn't spawn these yet (emergency/service traffic is next); sizes for when it does
  ambulance: [5.8, 2.1], fire_engine: [10.0, 2.5], ladder_truck: [14.0, 2.5], mail_truck: [5.6, 2.2], ice_cream: [6.0, 2.2],
  motorcycle: [2.2, 0.8], police_motorcycle: [2.3, 0.9], bicycle: [1.8, 0.6],
};
/** Sim-side spawn mix inside each driver kind (models are the vehicles workstream's job). */
function pickClass(S: SimCore, kind: VehicleKind, arch?: ArchetypeRt): VehicleClass {
  if ((kind === 'service' || kind === 'emergency') && arch?.def.vclass) return arch.def.vclass as VehicleClass;
  const r = S.rng.next();
  if (kind === 'cab') return 'taxi';
  if (kind === 'bus') return 'bus';
  if (kind === 'truck') return S.minute < 9 * 60 && r < 0.12 ? 'garbage' : r < 0.68 ? 'box_truck' : 'step_van';
  return r < 0.55 ? 'sedan' : r < 0.75 ? 'hardtop' : r < 0.87 ? 'wagon' : 'compact';
}
const tmp = [0, 0, 0, 0], tmp2 = [0, 0, 0, 0];
const B_MAX = 8; // emergency braking, m/s^2

// ------------------------------------------------------------------ helpers
export function linkOf(S: SimCore, l: number): Link { return S.net.g.links[l]; }

function occInsert(S: SimCore, v: Vehicle) {
  const list = S.occ[v.link];
  if (!list.length) S.occDirty.push(v.link);
  let i = 0; while (i < list.length && list[i].s < v.s) i++;
  list.splice(i, 0, v);
}
function occRemove(S: SimCore, v: Vehicle) {
  const list = S.occ[v.link]; const i = list.indexOf(v); if (i >= 0) list.splice(i, 1);
}
export function rebuildOcc(S: SimCore) {
  for (const l of S.occDirty) S.occ[l].length = 0;
  S.occDirty.length = 0;
  for (const v of S.vehicles) { const list = S.occ[v.link]; if (!list.length) S.occDirty.push(v.link); list.push(v); }
  for (const l of S.occDirty) S.occ[l].sort((a, b) => a.s - b.s || a.id - b.id);
}

/** Point at arc distance d ahead (d<0: behind) of the vehicle's position along its path. */
function pathPoint(S: SimCore, v: Vehicle, d: number, out: number[]) {
  const net = S.net;
  let link = v.link, s = v.s + d;
  for (let k = 0; k < 3; k++) {
    if (s > net.len[link]) {
      const L = net.g.links[link];
      const nx = L.kind === LinkKind.Lane ? (link === v.link && v.next >= 0 ? v.next : L.next[0]) : L.next[0];
      if (nx === undefined || nx < 0) break;
      s -= net.len[link]; link = nx;
    } else if (s < 0) {
      if (link !== v.link || v.prevLink < 0) break;
      link = v.prevLink; s += net.len[link];
    } else break;
  }
  const cl = Math.max(0, Math.min(net.len[link], s));
  sampleAt(net.g.links[link].pts, net.cum[link], cl, out);
  const extra = s - cl; out[0] += out[2] * extra; out[1] += out[3] * extra;
}

/** World position of a vehicle (centre of the chord between its axles), including lateral offset and lane-change blend. */
export function placeVehicle(S: SimCore, v: Vehicle) {
  const net = S.net;
  const ax = v.len * 0.35;
  pathPoint(S, v, ax, tmp); const fx0 = tmp[0], fz0 = tmp[1];
  pathPoint(S, v, -ax, tmp2);
  let dx = fx0 - tmp2[0], dz = fz0 - tmp2[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
  let x = (fx0 + tmp2[0]) / 2 - dz * v.lat, z = (fz0 + tmp2[1]) / 2 + dx * v.lat;
  if (v.lcT < 1 && v.lcFrom >= 0) {
    const r = net.len[v.lcFrom] / net.len[v.link];
    sampleAt(net.g.links[v.lcFrom].pts, net.cum[v.lcFrom], v.s * r, tmp2);
    sampleAt(net.g.links[v.link].pts, net.cum[v.link], v.s, tmp);
    const e = v.lcT * v.lcT * (3 - 2 * v.lcT);
    x = tmp2[0] + (tmp[0] - tmp2[0]) * e; z = tmp2[1] + (tmp[1] - tmp2[1]) * e;
  }
  v.x = x; v.z = z; v.yaw = Math.atan2(-dx, -dz) + (v.state === 'roadblock' ? Math.PI / 2 : 0);
}

/** Connector chosen by default from a lane: matching turn, else straight, else first. */
function defaultConn(S: SimCore, lane: number, turn: number): number {
  const L = linkOf(S, lane);
  let best = L.next[0], bs = -1;
  for (const c of L.next) {
    const C = linkOf(S, c); let sc = C.turn === turn ? 3 : C.turn === Turn.Straight ? 2 : 1;
    if (S.closedRoads.has(linkOf(S, C.next[0]).owner)) sc -= 2;
    if (sc > bs) { bs = sc; best = c; }
  }
  return best;
}

function chooseRoute(S: SimCore, v: Vehicle) {
  const L = linkOf(S, v.link);
  if (L.kind !== LinkKind.Lane) { v.next = -1; v.want = -1; return; }
  if (v.dest && !v.cop) {
    const cn = destConnector(S, v);
    if (cn >= 0) { v.want = cn; v.next = S.srcLane[cn] === v.link ? cn : defaultConn(S, v.link, linkOf(S, cn).turn); rideTurnCallout(S, v); return; }
  }
  if (v.cop && v.cop.mode !== 'idle') {
    const cn = policeConnector(S, v);
    if (cn >= 0) { v.want = cn; v.next = S.srcLane[cn] === v.link ? cn : defaultConn(S, v.link, linkOf(S, cn).turn); return; }
  }
  const grp = S.net.groups.get(L.group)!;
  const opts: number[] = [], w: number[] = [];
  let total = 0;
  for (const lane of grp) for (const c of linkOf(S, lane).next) {
    const C = linkOf(S, c);
    let p = C.turn === Turn.Straight ? 0.7 : 0.15;
    if (v.kind === 'bus') p = (C.turn === Turn.Straight ? 0.97 : 0.015) * (linkOf(S, C.next[0]).laneIndex === 0 ? 6 : 1);
    // spread straight choices over the lanes; small preference for keeping the current lane
    p /= C.turn === Turn.Straight ? grp.length : 1;
    if (lane === v.link) p *= 1.6;
    if (S.closedRoads.has(linkOf(S, C.next[0]).owner)) p *= 0.001;
    opts.push(c); w.push(p); total += p;
  }
  let r = S.rng.next() * total, pick = opts[0];
  for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) { pick = opts[i]; break; } }
  v.want = pick;
  v.next = S.srcLane[pick] === v.link ? pick : defaultConn(S, v.link, linkOf(S, pick).turn);
}

// ------------------------------------------------------------------ spawning
export function spawnVehicles(S: SimCore, budget: number, full: boolean) {
  const { net } = S;
  const target = Math.round(S.maxVehicles * vehDensity(S.minute) * (S.weather === 'rain' ? 0.85 : 1));
  let n = S.vehicles.length;
  const [rIn, rOut] = S.ringV;
  for (let tries = 0; n < target && tries < budget * 6 && budget > 0; tries++) {
    const lane = net.laneIds[S.rng.int(net.laneIds.length)];
    const L = net.g.links[lane], len = net.len[lane];
    if (len < 16) continue;
    const s = S.rng.range(6, len - 9);
    sampleAt(L.pts, net.cum[lane], s, tmp);
    const d = Math.hypot(tmp[0] - S.focus.x, tmp[1] - S.focus.z);
    if (d > rOut || (!full && d < rIn)) continue;
    if (S.densityHook && S.rng.next() > S.densityHook(tmp[0], tmp[1], 'vehicle')) continue;
    const road = net.g.roads[L.owner];
    const arch = S.reg.pick((a) => a.behaviour === 'driver' && (a.vehicle !== 'bus' || (road.flags & RoadFlag.BusRoute) !== 0), tmp[0], tmp[1], S.minute, S.rng.next());
    if (!arch) continue;
    const kind = arch.vehicle!;
    // the city thickens toward the playable edge (BOUNDARIES layer 3): spawn acceptance ramps up
    const ramp = Math.max(0, Math.min(1, 1 - edgeDistance(tmp[0], tmp[1]) / EDGE.RAMP));
    if (!full && S.rng.next() > 0.45 + 0.55 * ramp) continue;
    const vclass = pickClass(S, kind, arch);
    const [vl] = DIMS[vclass];
    if (kind === 'bus' && L.laneIndex !== 0 && L.laneCount > 2) continue;
    // free space on the lane
    let ok = true;
    for (const o of S.occ[lane]) if (Math.abs(o.s - s) < (o.len + vl) / 2 + 6) { ok = false; break; }
    if (ok) for (const o of S.vehicles) if (Math.hypot(o.x - tmp[0], o.z - tmp[1]) < (o.len + vl) / 2 + 3) { ok = false; break; }
    if (!ok) continue;
    makeVehicle(S, kind, vclass, arch, lane, s); n++; budget--;
    S.stats.spawnedV++;
  }
}

/** Create and register a vehicle on a lane (ambient spawns, police, scripted). */
export function makeVehicle(S: SimCore, kind: VehicleKind, vclass: VehicleClass, arch: ArchetypeRt, lane: number, s: number): Vehicle {
  const L = S.net.g.links[lane];
  const [vl, vw] = DIMS[vclass];
  const ag = arch.aggression;
  const v: Vehicle = {
    id: S.nextId++, kind, vclass, lights: 0, arch, variant: S.rng.int(1 << 30), alive: true,
    link: lane, prevLink: -1, s, v: L.speed * 0.6, acc: 0, len: vl, wid: vw, next: -1, want: -1,
    v0f: (kind === 'bus' || kind === 'truck' ? 0.85 : 0.92 + 0.2 * ag) * S.rng.range(0.92, 1.08),
    T: kind === 'cab' ? 0.9 : kind === 'bus' ? 1.6 : 1.3 - 0.4 * ag, aMax: kind === 'bus' || kind === 'truck' ? 1.1 : 1.8 + ag * 0.6,
    bComf: 2.4, s0: kind === 'cab' ? 1.5 : 2.0,
    state: 'drive', dwell: 0, lat: 0, latTarget: 0, passable: false, lcFrom: -1, lcT: 1, lcCd: S.rng.range(0, 1),
    stopT: 0, waitT: 0, honkCd: S.rng.range(0, 4), greenWait: 0, force: false, pullT: 0, atLine: false, hailFrom: -1, laneWaitT: 0, cop: null, owner: -1, kerb: 1, dest: null, ride: null, svcT: S.rng.range(10, 40), svcRole: '',
    x: 0, z: 0, yaw: 0, px: 0, pz: 0, pyaw: 0,
    fare: kind === 'cab' && S.rng.chance(0.5), fareT: S.rng.range(30, 160), hail: null, stopAt: -1, stopLink: -1, stopKind: '',
    dpDone: kind !== 'truck' || !S.rng.chance(0.45), busServed: -1, blockedBy: '', why: '',
  };
  if (vclass === 'ice_cream') v.v0f = 0.5;
  chooseRoute(S, v);
  placeVehicle(S, v); v.px = v.x; v.pz = v.z; v.pyaw = v.yaw;
  S.vehicles.push(v); occInsert(S, v);
  S.stats.spawnedV++;
  return v;
}

export function despawnVehicle(S: SimCore, v: Vehicle) {
  v.alive = false; occRemove(S, v);
  if (v.hail) { v.hail.claimedBy = -1; v.hail = null; }
  S.stats.despawnedV++;
}

// ------------------------------------------------------------------ junction permission
function vehiclesBeforePoint(S: SimCore, link: number, sPoint: number, margin: number): boolean {
  for (const w of S.occ[link]) if (w.s - w.len / 2 < sPoint + margin) return true;
  return false;
}

/** Free road (m) from the start of lane `out` to the first vehicle, looking through short lanes into the
 *  next junction when its light is green (a 3 m stub between two junctions must not hold a car in the box). */
function roomFrom(S: SimCore, out: number, t: number): number {
  const net = S.net;
  const first = S.occ[out][0];
  if (first) return first.s - first.len / 2;
  const len = net.len[out];
  if (len > 14) return len;
  if (net.laneSignal(out, t) === Sig.Red || net.laneSignal(out, t) === Sig.Yellow) return len;
  let best = 0;
  for (const c of net.g.links[out].next) {
    const fc = S.occ[c][0];
    if (fc) { best = Math.max(best, fc.s - fc.len / 2); continue; }
    const tl = net.g.links[c].next[0], ft = S.occ[tl][0];
    best = Math.max(best, net.len[c] + (ft ? ft.s - ft.len / 2 : net.len[tl]));
  }
  return len + best;
}

/** For a police car running a red with its siren: anything physically in the way inside the junction? */
function sirenBlocked(S: SimCore, v: Vehicle): string {
  const net = S.net, c = v.next;
  if (c < 0) return '';
  const C = net.g.links[c];
  for (const cf of C.conflicts) if (vehiclesBeforePoint(S, cf.link, cf.sOther, v.wid + 1.0)) return 'conflict';
  for (const cf of C.conflicts) { // vehicles about to enter on green: let them clear first
    const src = S.srcLane[cf.link];
    for (const w of S.occ[src]) if (w.next === cf.link && net.len[src] - w.s < 12 && w.v > 2) return 'yield';
  }
  for (const cr of C.crossings) { const peds = S.onWalk.get(cr.walkEdge); if (peds?.length) { sampleAt(C.pts, net.cum[c], cr.s, tmp); for (const p of peds) if (Math.hypot(p.x - tmp[0], p.z - tmp[1]) < 4.5) return 'peds'; } }
  return '';
}

/** May vehicle v (on a lane, approaching its stop line) enter its chosen connector now? */
function canEnter(S: SimCore, v: Vehicle, t: number): string {
  const net = S.net, c = v.next;
  if (c < 0) return '';
  const C = net.g.links[c], out = C.next[0];
  // don't block the box: room on the exit lane
  if (!v.force) {
    let room = roomFrom(S, out, t);
    for (const w of S.occ[c]) if (w !== v) room = Math.min(room, -1); // someone still on my connector: car-following handles, but keep a queue
    if (room < v.len + 1.5 && ((S.occ[out][0]?.v ?? 0) < 3)) return 'box';
  }
  // conflicting movements already in the junction
  for (const cf of C.conflicts) if (vehiclesBeforePoint(S, cf.link, cf.sOther, v.wid + 1.0)) return 'conflict';
  // pedestrians on crosswalks this connector crosses
  for (const cr of C.crossings) {
    const peds = S.onWalk.get(cr.walkEdge);
    if (!peds?.length) continue;
    sampleAt(C.pts, net.cum[c], cr.s, tmp);
    for (const p of peds) if (Math.hypot(p.x - tmp[0], p.z - tmp[1]) < 4.5) return 'peds';
  }
  // yield to approaching higher-priority movements (permissive left turns, unsignalized junctions)
  if (!v.force) for (const cf of C.conflicts) {
    const O = net.g.links[cf.link];
    const allWay = net.dark.has(C.owner); // brownout: every approach is equal, first stopped goes first
    if (!allWay && O.prio < C.prio) continue;
    const src = S.srcLane[cf.link];
    const sig = net.laneSignal(src, t);
    if (sig === Sig.Red) continue;
    for (const w of S.occ[src]) {
      if (w.next !== cf.link || w.state !== 'drive') continue;
      // only defer to a vehicle that is moving or free to go; yielding to someone who is itself held deadlocks
      if (w.v < 1 && w.blockedBy !== '') continue;
      const dEnd = net.len[src] - w.s;
      const tta = dEnd / Math.max(w.v, 0.5);
      if (tta > 4 || dEnd > 45) continue;
      if (allWay && !w.atLine) continue; // at a dead signal only vehicles that have stopped count
      if ((!allWay && O.prio > C.prio) || w.waitT > v.waitT + 0.01 || (Math.abs(w.waitT - v.waitT) <= 0.01 && w.id < v.id)) return 'yield';
    }
  }
  return '';
}

/** Rear-most vehicle on a link, including vehicles still blending out of it after a lane change. */
function firstOn(S: SimCore, link: number): { s: number; len: number; v: number; passable: boolean } | null {
  let best: { s: number; len: number; v: number; passable: boolean } | null = S.occ[link][0] ?? null;
  for (const w of S.lcList) if (w.lcFrom === link && w.lcT < 0.8) {
    const ws = w.s * (S.net.len[link] / S.net.len[w.link]);
    if (!best || ws < best.s) best = { s: ws, len: w.len, v: w.v, passable: false };
  }
  return best;
}

// ------------------------------------------------------------------ IDM
function idm(v: Vehicle, v0: number, gap: number, vLead: number): number {
  const free = 1 - Math.pow(Math.max(v.v, 0) / Math.max(v0, 0.1), 4);
  if (gap === Infinity) return v.aMax * free;
  const ss = v.s0 + Math.max(0, v.v * v.T + (v.v * (v.v - vLead)) / (2 * Math.sqrt(v.aMax * v.bComf)));
  const g = Math.max(gap, 0.05);
  return v.aMax * (free - (ss / g) * (ss / g));
}

export interface Obs { gap: number; vl: number; why: string; hard: number }

/** Walks the path ahead and returns the most constraining obstacle(s); also returns hard stop limit (s on current link). */
export function lookAhead(S: SimCore, v: Vehicle, t: number, out: Obs) {
  const net = S.net;
  out.gap = Infinity; out.vl = 0; out.why = ''; out.hard = Infinity;
  const L = net.g.links[v.link], len = net.len[v.link];
  const reach = Math.max(35, v.v * 5 + 15);
  const consider = (gap: number, vl: number, why: string) => { if (gap < out.gap || (gap === out.gap && vl < out.vl)) { out.gap = gap; out.vl = vl; out.why = why; } };
  // same link leader
  const list = S.occ[v.link];
  let passSlow = Infinity, passing = 0;
  if (v.wid <= 2.1) for (const w of list) if (w.passable && w !== v && w.s - v.s > -(w.len + v.len) / 2 - 1.5 && w.s - v.s < 30) passing = -Math.max(0, L.width / 2 - v.wid / 2 - 0.5);
  for (const w of list) if (w !== v && w.s > v.s) {
    if (w.passable && v.wid <= 2.1) {
      const tgt = -Math.max(0, L.width / 2 - v.wid / 2 - 0.5);
      if (w.s - v.s < 30) { passing = tgt; if (v.lat <= tgt + 0.1) { if (w.s - v.s < 16) passSlow = 3; continue; } }
    }
    consider(w.s - v.s - (w.len + v.len) / 2, w.v, w.state === 'drive' ? 'queue' : w.state);
    out.hard = Math.min(out.hard, w.s - (w.len + v.len) / 2 - 0.3);
    break;
  }
  if (passing < 0) v.latTarget = passing;
  else if (v.state === 'drive' && v.latTarget < 0) v.latTarget = 0;
  if (passSlow < Infinity && v.v > passSlow) consider(Math.max(4, v.v * 2), passSlow, 'passing');
  // while blending out of a lane, its vehicles ahead still matter
  if (v.lcT < 0.8 && v.lcFrom >= 0) {
    const ms = v.s * (net.len[v.lcFrom] / len);
    for (const w of S.occ[v.lcFrom]) if (w.s > ms) { consider(w.s - ms - (w.len + v.len) / 2, w.v, 'queue'); out.hard = Math.min(out.hard, (w.s - (w.len + v.len) / 2 - 0.3) * (len / net.len[v.lcFrom])); break; }
  }
  // vehicles still blending out of this lane (lane change in progress) remain obstacles here
  for (const w of S.lcList) if (w !== v && w.lcFrom === v.link && w.lcT < 0.8) {
    const ws = w.s * (net.len[v.link] / net.len[w.link]);
    if (ws > v.s) { consider(ws - v.s - (w.len + v.len) / 2, w.v, 'queue'); out.hard = Math.min(out.hard, ws - (w.len + v.len) / 2 - 0.3); }
  }
  // lane blocks
  for (const b of S.blocks) if (b.link === v.link && b.s > v.s) { consider(b.s - v.s - v.len / 2 - 1, 0, 'blocked'); out.hard = Math.min(out.hard, b.s - v.len / 2 - 1); }
  // curb / bus stop target
  if (v.stopLink === v.link && v.stopAt > v.s - 0.5) consider(v.stopAt - v.s + v.s0, 0, 'stopping');
  if (L.kind === LinkKind.Lane) {
    const dEnd = len - v.s;
    const stopS = len - v.len / 2 - 0.4;
    let must = '';
    const sig = net.laneSignal(v.link, t);
    const siren = !!v.cop?.siren;
    if (siren && (sig === Sig.Red || sig === Sig.Yellow)) {
      // emergency: crawl up to the line and go only when no crossing traffic or pedestrians are in the way
      if (dEnd < 25) { const c = sirenBlocked(S, v); if (c) must = c; else consider(Math.max(0.5, dEnd - v.len / 2), 3.0, 'siren'); }
    } else if (sig === Sig.Red) must = 'red';
    else if (sig === Sig.Yellow && dEnd - v.len / 2 > (v.v * v.v) / (2 * 3.5) + 1) must = 'red';
    // routed vehicles hold at the line until they've merged into the lane for their turn (25 s at most)
    if (!must && (v.dest || v.cop) && v.want >= 0 && S.srcLane[v.want] !== v.link && dEnd < 15 && v.laneWaitT < 25
      && net.g.links[S.srcLane[v.want]].group === L.group) { must = 'laneWait'; if (v.v < 0.3) v.laneWaitT += 1 / 30; }
    if (net.dark.has(L.endJ)) { // dead signal = all-way stop: come to a full stop at the line first
      if (dEnd - v.len / 2 < 3 && v.v < 0.3) v.atLine = true;
      if (!v.atLine) must = 'stopSign';
    }
    if (!must && dEnd < Math.max(18, (v.v * v.v) / (2 * v.bComf) + 10)) must = canEnter(S, v, t);
    if (must) {
      consider(dEnd - v.len / 2 - 0.4, 0, must);
      out.hard = Math.min(out.hard, Math.max(stopS, v.s));
      v.blockedBy = must;
    } else v.blockedBy = '';
    // look through the connector and onto the exit lane
    if (v.next >= 0 && dEnd < reach) {
      let off = dEnd;
      const c = v.next, cl = net.len[c];
      const lc = S.occ[c];
      if (lc.length) { const w = lc[0]; consider(off + w.s - (w.len + v.len) / 2, w.v, 'queue'); }
      else {
        off += cl;
        const w = firstOn(S, net.g.links[c].next[0]);
        if (w && off < reach && !w.passable) consider(off + w.s - (w.len + v.len) / 2, w.v, 'queue');
      }
    }
  } else {
    // on a connector: exit lane
    const w = firstOn(S, L.next[0]);
    if (w && !w.passable) consider(len - v.s + w.s - (w.len + v.len) / 2, w.v, 'queue');
    // pedestrians at crossing points ahead (they may have stepped out after we entered)
    for (const cr of L.crossings) {
      if (cr.s < v.s + v.len / 2 - 0.5) continue;
      const peds = S.onWalk.get(cr.walkEdge); if (!peds?.length) continue;
      sampleAt(L.pts, net.cum[v.link], cr.s, tmp);
      for (const p of peds) if (Math.hypot(p.x - tmp[0], p.z - tmp[1]) < 3.2) { consider(cr.s - v.s - v.len / 2 - 2.0, 0, 'peds'); break; }
    }
  }
  // corridor: jaywalkers, pedestrians in the road, external actors
  const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
  const front = v.len / 2, corr = Math.min(22, 4 + v.v * 2.2);
  const cx = v.x + fx * (corr / 2), cz = v.z + fz * (corr / 2);
  S.pGrid.query(cx, cz, corr / 2 + front + 2, (pi) => {
    const p = S.peds[pi]; if (!p.onRoad) return;
    const rx = p.x - v.x, rz = p.z - v.z, ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
    if (ahead > -v.len / 2 && ahead < front + corr && side < v.wid / 2 + 0.8) { consider(Math.max(0, ahead - front - 1.2), 0, 'ped'); if (ahead - front < 1.5) out.hard = Math.min(out.hard, v.s); }
  });
  for (const a of S.actors) {
    const rx = a.x - v.x, rz = a.z - v.z, ahead = rx * fx + rz * fz, side = Math.abs(rx * fz - rz * fx);
    if (ahead > 0 && ahead < front + corr + 6 && side < v.wid / 2 + a.radius + 0.4) {
      const avl = a.vx * fx + a.vz * fz;
      consider(ahead - front - a.radius - 1.0, Math.max(0, avl), a.kind === 'player' ? 'player' : 'actor');
    }
  }
}

// ------------------------------------------------------------------ lane changes
function gapsOn(S: SimCore, lane: number, s: number, me: Vehicle): [number, number, Vehicle | null, Vehicle | null] {
  let ahead = Infinity, behind = Infinity, lead: Vehicle | null = null, foll: Vehicle | null = null;
  for (const w of S.occ[lane]) {
    if (w === me) continue;
    const d = w.s - s;
    if (d >= 0) { const g = d - (w.len + me.len) / 2; if (g < ahead) { ahead = g; lead = w; } }
    else { const g = -d - (w.len + me.len) / 2; if (g < behind) { behind = g; foll = w; } }
  }
  return [ahead, behind, lead, foll];
}

function tryLaneChange(S: SimCore, v: Vehicle, toLane: number, aggressive: boolean): boolean {
  const net = S.net;
  const s2 = v.s * (net.len[toLane] / net.len[v.link]);
  const slowRouted = (v.dest || v.cop) && v.v < 2;
  if (s2 < 3 || s2 > net.len[toLane] - (slowRouted ? v.len / 2 + 0.5 : 6)) return false;
  for (const b of S.blocks) if (b.link === toLane && Math.abs(b.s - s2) < 10) return false;
  let [ahead, behind, , foll] = gapsOn(S, toLane, s2, v);
  // vehicles still in the junction, about to enter the target lane from behind
  if (s2 < 45) for (const c of S.preds[toLane]) for (const w of S.occ[c]) {
    const g = s2 + (net.len[c] - w.s) - (w.len + v.len) / 2;
    if (g < behind) { behind = g; foll = w; }
  }
  const needA = aggressive ? 2.0 : 3 + v.v * 0.4;
  const needB = aggressive ? Math.max(2.0, (foll?.v ?? 0) * 0.35) : Math.max(3, (foll?.v ?? 0) * 0.9);
  if (ahead < needA || behind < needB) return false;
  // vehicles in the lane we leave that are alongside or just ahead would overlap during the blend
  for (const w of S.occ[v.link]) if (w !== v && Math.abs(w.s - v.s) < (w.len + v.len) / 2 + 1) return false;
  for (const w of S.lcList) if (w !== v && w.lcFrom === toLane && Math.abs(w.s - s2) < (w.len + v.len) / 2 + 2) return false;
  occRemove(S, v);
  v.lcFrom = v.link; v.lcT = 0; v.link = toLane; v.s = s2; v.prevLink = -1;
  occInsert(S, v);
  S.lcList.push(v);
  S.stats.laneChanges++;
  if (foll && behind < (foll.v * foll.v) / 8 + 2) { // cut someone off
    foll.v = Math.min(foll.v, Math.max(0, foll.v - 3));
    honk(S, foll, 'cutOff', 0.9);
  }
  // keep the route consistent: next must start from the current lane
  if (v.want >= 0 && S.srcLane[v.want] === v.link) v.next = v.want;
  else v.next = defaultConn(S, v.link, v.want >= 0 ? net.g.links[v.want].turn : Turn.Straight);
  return true;
}

function laneChangeLogic(S: SimCore, v: Vehicle, obs: Obs) {
  const net = S.net, L = net.g.links[v.link];
  if (L.kind !== LinkKind.Lane || v.state !== 'drive' || v.lcT < 1 || L.laneCount < 2) return;
  const dEnd = net.len[v.link] - v.s;
  const routed = !!(v.dest || v.cop);
  if (Math.abs(v.lat) > 0.2) return; // still pulling out from the kerb (or passing): finish that first
  // no lane changes into the stop-line queue / junction mouth; routed vehicles (ride cabs, police,
  // responders) may still squeeze over slowly right up to the line rather than miss their turn
  if (dEnd < (routed && v.v < 3 ? 4 : 12)) { if (!(routed && dEnd >= 4 && v.v < 3)) return; }
  // cabs, aggressive drivers, and buses pulling in to their stop (buses muscle in) accept tight gaps
  const aggressive = v.kind === 'cab' || v.arch.aggression > 0.7 || (v.kind === 'bus' && v.stopLink >= 0);
  // mandatory: curb lane for stops, desired turn lane
  let target = -1;
  if (v.pullT > 0 && L.right >= 0) { if (tryLaneChange(S, v, L.right, true)) return; }
  if (v.stopLink >= 0 && v.stopLink !== v.link && net.g.links[v.stopLink].group === L.group) target = v.stopLink;
  else if (v.want >= 0 && S.srcLane[v.want] !== v.link && net.g.links[S.srcLane[v.want]].group === L.group) target = S.srcLane[v.want];
  if (target >= 0) {
    const step = net.g.links[target].laneIndex > L.laneIndex ? L.left : L.right;
    if (step >= 0 && tryLaneChange(S, v, step, aggressive || dEnd < 40)) return;
    if (dEnd < 22 && v.want >= 0 && S.srcLane[v.want] !== v.link && target === S.srcLane[v.want] && (!routed || v.laneWaitT > 20)) v.want = v.next; // give up the turn
    return;
  }
  // discretionary: stuck behind slow/stopped vehicle (not at the light)
  const blocked = (obs.why === 'queue' || obs.why === 'doubleParked' || obs.why === 'busStop' || obs.why === 'curb' || obs.why === 'blocked' || obs.why === 'stopping')
    && obs.gap < 30 && obs.vl < Math.max(2, v.v * 0.6) && dEnd > 30;
  if (!blocked) return;
  const myGap = obs.gap;
  for (const cand of [L.left, L.right]) {
    if (cand < 0) continue;
    const s2 = v.s * (net.len[cand] / net.len[v.link]);
    const [ahead] = gapsOn(S, cand, s2, v);
    if (ahead > myGap + 8 && tryLaneChange(S, v, cand, aggressive)) return;
  }
}

// ------------------------------------------------------------------ horns
export function honk(S: SimCore, v: Vehicle, reason: string, intensity: number) {
  if (v.honkCd > 0) return;
  v.honkCd = 4 + S.rng.next() * 6 * (1 - v.arch.aggression * 0.6);
  S.stats.honks++;
  S.emit('honk', { id: v.id, x: v.x, z: v.z, kind: v.kind, archetype: v.arch.def.id, reason, intensity });
}

// ------------------------------------------------------------------ period behaviours
function periodBehaviour(S: SimCore, v: Vehicle, dt: number) {
  const net = S.net, L = net.g.links[v.link];
  if (v.ride) rideBehaviour(S, v);
  if (v.kind === 'service') serviceBehaviour(S, v, dt);
  const len = net.len[v.link];
  // double-parked delivery truck
  if (v.kind === 'truck' && !v.dpDone && v.state === 'drive' && L.kind === LinkKind.Lane && L.laneIndex === 0 && !(L.flags & LinkFlag.BusStop)
    && v.s > 15 && v.s < len - 30 && S.minute > 5 * 60 && S.minute < 20 * 60 && v.lcT >= 1 && S.rng.chance(0.05 * dt)) {
    v.dpDone = true; v.state = 'doubleParked'; v.v = 0;
    const narrow = L.width < 5;
    v.dwell = narrow ? S.rng.range(10, 22) : S.rng.range(25, 80);
    v.passable = L.width >= 5;
    v.latTarget = v.passable ? (L.width - v.wid) / 2 - 0.2 : 0.4;
    S.stats.doubleParks++;
    S.emit('doubleParked', { id: v.id, x: v.x, z: v.z, until: S.t + v.dwell });
  }
  // cab: drop off a fare
  if (v.kind === 'cab' && v.fare && !v.ride && v.state === 'drive') {
    v.fareT -= dt;
    if (v.fareT < 0 && v.stopLink < 0 && L.kind === LinkKind.Lane && len - v.s > 45) {
      const lane0 = net.groups.get(L.group)![0];
      v.stopLink = lane0; v.stopAt = Math.min(net.len[lane0] - 15, v.s * (net.len[lane0] / len) + 25); v.stopKind = 'dropoff';
    }
  }
  // cab: answer hails on this block, or on a block it can turn or continue into (cabbies cruise for fares)
  if (v.kind === 'cab' && !v.fare && v.state === 'drive' && L.kind === LinkKind.Lane && v.stopLink < 0) {
    const grp = net.groups.get(L.group)!, lane0 = grp[0];
    const sNow = v.s * (net.len[lane0] / len);
    const stopHere = (h: Hail): boolean => {
      // right kerb from the kerb lane; on one-way streets the left kerb from the leftmost lane
      const left = h.side !== L.dir, lane = left ? grp[grp.length - 1] : lane0;
      const p = projectS(S, lane, h.x, h.z);
      if (p - v.s * (net.len[lane] / len) < 5 || p > net.len[lane] - 6) return false;
      h.claimedBy = v.id; v.hail = h; v.stopLink = lane; v.stopAt = p; v.stopKind = 'pickup'; v.kerb = left ? -1 : 1;
      return true;
    };
    void sNow;
    if (v.hail) {
      // a hail claimed from the previous block: stop if it's on this one, else let it go
      const h = v.hail;
      if (v.ride) { if (kerbOK(S, h, L)) stopHere(h); /* else keep driving toward the caller (dest routing) */ }
      else if (L.group === v.hailFrom) { /* still approaching the turn toward the fare: keep the claim */ }
      else if (kerbOK(S, h, L)) { if (!stopHere(h)) { h.claimedBy = -1; v.hail = null; } }
      else { // one more block to go? re-route, else give the fare up
        const via = hailVia(S, L.group, h, 1);
        if (via >= 0) { v.want = via; v.hailFrom = L.group; if (S.srcLane[via] === v.link) v.next = via; } else { h.claimedBy = -1; v.hail = null; }
      }
    } else for (const h of S.hails) {
      if (Math.hypot(h.x - v.x, h.z - v.z) > 170) continue;
      if (h.claimedBy >= 0) {
        // a cab right on the hail's block beats one still approaching from the next block
        const other = h.claimedBy === v.id ? null : S.vehicles.find((w) => w.id === h.claimedBy);
        if (!(other && other.stopLink < 0 && kerbOK(S, h, L))) continue;
        if (!stopHere(h)) continue;
        other.hail = null; other.hailFrom = -1;
        S.emit('hailAnswered', { cab: v.id, ped: h.ped, x: h.x, z: h.z }); break;
      }
      if (kerbOK(S, h, L)) { if (stopHere(h)) { S.emit('hailAnswered', { cab: v.id, ped: h.ped, x: h.x, z: h.z }); break; } continue; }
      // within two blocks: route toward the hail's road, on the hail's kerb side
      const via = hailVia(S, L.group, h, 2);
      if (via < 0) continue;
      h.claimedBy = v.id; v.hail = h; v.want = via; v.hailFrom = L.group;
      if (S.srcLane[via] === v.link) v.next = via;
      S.emit('hailAnswered', { cab: v.id, ped: h.ped, x: h.x, z: h.z });
      break;
    }
  }
  // bus stop ahead on this block
  if (v.kind === 'bus' && v.state === 'drive' && v.stopLink < 0 && L.kind === LinkKind.Lane) {
    const lane0 = net.groups.get(L.group)![0];
    const L0 = net.g.links[lane0];
    if (L0.flags & LinkFlag.BusStop && v.busServed !== lane0) {
      const bs = S.busStopOf.get(lane0)!;
      if (bs.s > v.s * (net.len[lane0] / len) + 3) { v.stopLink = lane0; v.stopAt = bs.s; v.stopKind = 'bus'; }
      else v.busServed = lane0;
    }
  }
  // reached a curb stop?
  if (v.stopLink === v.link && v.state === 'drive' && v.s >= v.stopAt - 3 && v.v < 1.0
    && S.occ[v.link].some((w) => w !== v && (w.state !== 'drive' || w.lat > 0.3) && Math.abs(w.s - v.s) < (w.len + v.len) / 2 + 3)) {
    if (v.hail) { v.hail.claimedBy = -1; v.hail = null; }
    v.stopLink = -1; v.stopAt = -1; if (v.kind === 'bus') v.busServed = v.link;
  } else if (v.stopLink === v.link && v.state === 'drive' && v.s >= v.stopAt - 3 && v.v < 1.0) {
    if (v.stopKind === 'bus') { v.state = 'busStop'; v.dwell = S.rng.range(10, 18); v.latTarget = Math.min(1.6, (L.width - v.wid) / 2 + 1.0); S.stats.busStops++; v.busServed = v.link; S.onBusStop(S.busStopOf.get(v.link)!.spot, v); S.emit('busStop', { id: v.id, x: v.x, z: v.z, stop: S.busStopOf.get(v.link)?.spot }); }
    else {
      v.state = 'curb'; v.dwell = v.stopKind === 'pickup' ? S.rng.range(5, 9) : S.rng.range(4, 7); v.latTarget = v.kerb * ((L.width - v.wid) / 2 + 1.5);
      if (v.ride) rideStopStarted(S, v);
      else if (v.kind === 'service') serviceStopStarted(S, v);
      else S.emit(v.stopKind, { id: v.id, x: v.x, z: v.z, kerb: v.kerb });
    }
    v.v = 0;
  } else if (v.stopLink >= 0 && v.stopLink !== v.link && net.g.links[v.stopLink].group !== L.group) {
    // left the block without reaching it
    if (v.hail) { v.hail.claimedBy = -1; v.hail = null; }
    v.stopLink = -1; v.stopAt = -1;
  } else if (v.stopLink === v.link && v.s > v.stopAt + 3) { if (v.hail) { v.hail.claimedBy = -1; v.hail = null; } v.stopLink = -1; }
}

/** Can a cab on lane L pick up this hail from a kerb? Right kerb always; left kerb on one-way streets. */
function kerbOK(S: SimCore, h: Hail, L: Link): boolean {
  return h.road === L.owner && (h.side === L.dir || S.net.g.roads[L.owner].oneway !== 0);
}

/** First connector from lane group `grp` on a path of <= depth blocks into the hail's road and kerb side, or -1. */
function hailVia(S: SimCore, grp: number, h: Hail, depth: number): number {
  const net = S.net;
  for (const lane of net.groups.get(grp)!) for (const c of net.g.links[lane].next) {
    const T = net.g.links[net.g.links[c].next[0]];
    if (kerbOK(S, h, T)) return c;
  }
  if (depth > 1) for (const lane of net.groups.get(grp)!) for (const c of net.g.links[lane].next) {
    const T = net.g.links[net.g.links[c].next[0]];
    if (hailVia(S, T.group, h, depth - 1) >= 0) return c;
  }
  return -1;
}

function projectS(S: SimCore, lane: number, x: number, z: number): number {
  const p = S.net.g.links[lane].pts, cum = S.net.cum[lane];
  let best = Infinity, bs = 0;
  for (let k = 2; k < p.length; k += 2) {
    const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (d < best) { best = d; bs = cum[(k >> 1) - 1] + t * Math.sqrt(l2); }
  }
  return bs;
}

function endDwell(S: SimCore, v: Vehicle) {
  const st = v.state;
  v.state = 'drive'; v.latTarget = 0; v.passable = false; v.kerb = 1;
  if (st === 'curb' && (v.ride || v.kind === 'service')) { v.stopLink = -1; v.stopAt = -1; v.stopKind = ''; return; }
  if (st === 'curb') {
    if (v.stopKind === 'pickup' && v.hail) {
      const p = S.pedById.get(v.hail.ped);
      if (p && p.alive) { p.alive = false; S.stats.boardings++; }
      const hi = S.hails.indexOf(v.hail); if (hi >= 0) S.hails.splice(hi, 1);
      v.hail = null; v.fare = true; v.fareT = S.rng.range(60, 200);
    } else if (v.stopKind === 'dropoff') { v.fare = false; S.stats.dropoffs++; S.spawnPedAt(v.x, v.z, 'cabAlight'); }
  }
  if (st === 'busStop') S.emit('busDepart', { id: v.id, x: v.x, z: v.z, stop: S.busStopOf.get(v.link)?.spot });
  v.stopLink = -1; v.stopAt = -1; v.stopKind = '';
}

// ------------------------------------------------------------------ lights (VehicleLights bits, src/shared/traffic.ts)
const L_HEAD = 1, L_BRAKE = 2, L_IND_L = 4, L_IND_R = 8, L_HAZARD = 16, L_ROOF = 64;
function updateLights(S: SimCore, v: Vehicle) {
  const net = S.net, L = net.g.links[v.link];
  let m = 0;
  if (S.minute < 6.5 * 60 || S.minute > 19.5 * 60 || S.weather !== 'clear') m |= L_HEAD;
  if (v.state === 'doubleParked') m |= L_HAZARD;
  else if (v.state === 'curb' || v.state === 'busStop') m |= v.dwell <= 1 ? (v.kerb < 0 ? L_IND_R : L_IND_L) : v.kind === 'cab' || v.kind === 'service' ? L_HAZARD : v.kerb < 0 ? L_IND_L : L_IND_R;
  else {
    if (v.acc < -0.6 || v.v < 0.2) m |= L_BRAKE;
    if (v.pullT > 0) m |= L_IND_R;
    if (v.lcT < 1 && v.lcFrom >= 0) m |= net.g.links[v.lcFrom].laneIndex > L.laneIndex ? L_IND_R : L_IND_L;
    else if (v.stopLink >= 0 && (v.stopLink !== v.link || v.stopAt - v.s < 40)) m |= L_IND_R;
    else if (L.kind === LinkKind.Lane && v.next >= 0 && net.len[v.link] - v.s < 45) { const t = net.g.links[v.next].turn; if (t === Turn.Left) m |= L_IND_L; else if (t === Turn.Right) m |= L_IND_R; }
    else if (L.kind === LinkKind.Connector && L.turn !== Turn.Straight) m |= L.turn === Turn.Left ? L_IND_L : L_IND_R;
  }
  if (v.vclass === 'taxi' && !v.fare) m |= L_ROOF;
  if (v.cop?.siren) m |= 128 | L_HEAD; // Siren bit (VehicleLights.Siren): light bar + siren audio
  if (v.state === 'onScene' || v.state === 'roadblock') m |= L_HAZARD;
  v.lights = m;
}

// ------------------------------------------------------------------ main step
const obs: Obs = { gap: Infinity, vl: 0, why: '', hard: Infinity };

export function stepVehicles(S: SimCore, dt: number) {
  const net = S.net, t = S.t;
  S.sirens = S.vehicles.filter((w) => w.alive && w.cop?.siren).map((w) => ({ id: w.id, x: w.x, z: w.z, vx: -Math.sin(w.yaw) * w.v, vz: -Math.cos(w.yaw) * w.v }));
  S.lcList = S.lcList.filter((w) => w.alive && w.lcT < 1 && w.lcFrom >= 0);
  const rainF = S.weather === 'rain' ? 0.85 : 1;
  for (const v of S.vehicles) {
    if (!v.alive) continue;
    v.px = v.x; v.pz = v.z; v.pyaw = v.yaw;
    v.honkCd -= dt; v.lcCd -= dt;
    if (v.lcT < 1) v.lcT = Math.min(1, v.lcT + dt / 2.2);
    v.lat += Math.sign(v.latTarget - v.lat) * Math.min(Math.abs(v.latTarget - v.lat), dt * 1.4);
    const L = net.g.links[v.link];

    if (v.cop) policeVehicleTick(S, v, dt);
    if (v.state === 'onScene' && Number.isFinite(v.dwell) && (v.dwell -= dt) <= 0) responderLeave(S, v);
    if (v.state === 'roadblock' || v.state === 'onScene' || v.state === 'boxIn') { v.v = 0; v.acc = 0; v.lat += Math.sign(v.latTarget - v.lat) * Math.min(Math.abs(v.latTarget - v.lat), dt * 1.4); placeVehicle(S, v); updateLights(S, v); continue; }
    if (v.state === 'doubleParked' || v.state === 'curb' || v.state === 'busStop') {
      v.dwell -= dt; v.v = 0; v.acc = 0;
      if (v.dwell <= 0 && Math.abs(v.lat - v.latTarget) < 0.05) {
        // pull out only when nobody is alongside or closing in from behind in this lane
        let clear = true;
        for (const w of S.occ[v.link]) if (w !== v && w.s - v.s > -(w.len + v.len) / 2 - 10 && w.s - v.s < (w.len + v.len) / 2 + 1 && (w.passable === false)) { if (w.lat < -0.2 || w.s < v.s && w.v > 1) { clear = false; break; } }
        if (clear) endDwell(S, v); else v.dwell = 0.3;
      }
      placeVehicle(S, v); updateLights(S, v);
      continue;
    }
    lookAhead(S, v, t, obs);
    v.why = obs.why;
    // last block before the edge: bumper-to-bumper crawl (TODO: retune when bounds.ts shrinks)
    const ed = edgeDistance(v.x, v.z);
    const edgeF = ed < EDGE.BLOCKERS ? Math.max(0.12, ed / EDGE.BLOCKERS) : 1;
    const v0 = L.speed * v.v0f * rainF * edgeF;
    let a = idm(v, v0, obs.gap, obs.vl);
    // sirens: get out of the way. Kerb-lane cars pull into the parking lane and stop; cars in other lanes
    // slow and move right. Nobody stops in the junction mouth, and a siren that isn't moving is ignored
    // (otherwise a stuck police car would freeze everyone around it).
    v.pullT -= dt;
    const dEndP = net.len[v.link] - v.s;
    if (L.kind === LinkKind.Lane && !v.cop && dEndP > 15) for (const ac of [...S.actors, ...S.sirens]) {
      if (('siren' in ac && !ac.siren) || ac.id === v.id || Math.hypot(ac.vx, ac.vz) < 2) continue;
      const rx = ac.x - v.x, rz = ac.z - v.z, d = Math.hypot(rx, rz);
      if (d > 80) continue;
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw), ahead = rx * fx + rz * fz, avf = ac.vx * fx + ac.vz * fz;
      if ((ahead < 8 && avf > 1) || (ahead > 0 && avf < -1 && d < 60)) v.pullT = 2.5;
    }
    if (v.pullT > 0) {
      if (L.kind === LinkKind.Lane && L.laneIndex === 0 && v.state === 'drive') {
        a = Math.min(a, v.v > 0.2 ? -2.8 : 0); v.blockedBy = 'siren';
        // into the parking lane, unless something is parked or double-parked right there (then just stop)
        const kerbBusy = S.occ[v.link].some((w) => w !== v && (w.state !== 'drive' || w.passable) && Math.abs(w.s - v.s) < (w.len + v.len) / 2 + 4);
        if (!kerbBusy && v.latTarget >= 0) v.latTarget = (L.width - v.wid) / 2 + 1.1;
      }
      else if (v.v > 4) a = Math.min(a, -1.5); // slow down; laneChangeLogic moves right
    } else if (v.pullT > -0.1 && v.latTarget > 0 && v.state === 'drive') v.latTarget = 0;
    a = Math.max(-B_MAX, Math.min(v.aMax, a));
    let nv = Math.max(0, v.v + a * dt);
    let ds = v.v * dt + 0.5 * a * dt * dt;
    if (nv === 0 && ds < 0) ds = 0;
    ds = Math.max(0, ds);
    // hard limits: never pass a stop line on red, never overlap the leader
    if (v.s + ds > obs.hard) { ds = Math.max(0, obs.hard - v.s); nv = Math.min(nv, ds / dt); }
    v.acc = a; v.v = nv;
    v.s += ds;

    // impatience bookkeeping
    if (v.v < 0.3) { v.stopT += dt; v.waitT += dt; } else { v.stopT = 0; if (v.v > 2) v.waitT = 0; }
    if (v.v < 0.3 && obs.why && obs.why !== 'red' && obs.why !== 'box') {
      const pat = v.arch.patience * (v.kind === 'cab' ? 0.7 : 1);
      if (v.stopT > pat && obs.gap < 15) honk(S, v, obs.why === 'queue' ? 'queue' : obs.why, Math.min(1, v.stopT / (pat * 3)));
    }
    // green light, nobody moving ahead
    if (L.kind === LinkKind.Lane && net.laneSignal(v.link, t) === Sig.Green && v.v < 0.3 && obs.why === 'queue') {
      v.greenWait += dt; if (v.greenWait > 1.8) honk(S, v, 'green', 0.6);
    } else v.greenWait = 0;
    if (obs.why === 'ped' || obs.why === 'player') { if (v.v < 1 && v.stopT > 1.2) honk(S, v, obs.why, 0.8); }
    v.force = v.stopT > 75;

    // advance through links
    let guard = 0;
    while (v.s >= net.len[v.link] && guard++ < 4) {
      const cur = net.g.links[v.link];
      const rem = v.s - net.len[v.link];
      let nextLink: number;
      if (cur.kind === LinkKind.Lane) {
        nextLink = v.next >= 0 ? v.next : cur.next[0];
        if (net.laneSignal(v.link, t) === Sig.Red && !v.cop?.siren) S.stats.redLight++;
      } else nextLink = cur.next[0];
      occRemove(S, v);
      v.prevLink = v.link; v.link = nextLink; v.s = rem; v.lcFrom = -1; v.lcT = 1; v.atLine = false; v.laneWaitT = 0;
      occInsert(S, v);
      if (net.g.links[nextLink].kind === LinkKind.Lane) { chooseRoute(S, v); v.busServed = v.busServed === nextLink ? v.busServed : -1; }
      else v.next = -1;
    }
    // lane changes (staggered)
    if (v.lcCd <= 0) { v.lcCd = 0.5; laneChangeLogic(S, v, obs); }
    if (!v.cop) periodBehaviour(S, v, dt);
    else if (v.stopLink === v.link && v.stopAt >= 0) { /* police stop target handled by policeVehicleTick */ }
    placeVehicle(S, v); updateLights(S, v);
  }
}

/** Collisions / near misses with external actors; vehicle-vehicle overlap audit. */
export function vehicleContacts(S: SimCore, cooldown: Map<string, number>) {
  for (const v of S.vehicles) {
    if (!v.alive) continue;
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    for (const a of S.actors) {
      const rx = a.x - v.x, rz = a.z - v.z;
      const ahead = Math.abs(rx * fx + rz * fz), side = Math.abs(rx * fz - rz * fx);
      const key = `${v.id}:${a.id}`;
      if ((cooldown.get(key) ?? -1) > S.t) continue;
      const rel = Math.hypot(a.vx - fx * v.v, a.vz - fz * v.v);
      if (ahead < v.len / 2 + a.radius && side < v.wid / 2 + a.radius) {
        S.emit('collision', { vehicle: v.id, actor: a.id, x: v.x, z: v.z, speed: rel }); cooldown.set(key, S.t + 2);
        honk(S, v, 'collision', 1);
      } else if (ahead < v.len / 2 + a.radius + 1.2 && side < v.wid / 2 + a.radius + 1.0 && rel > 5) {
        S.emit('nearMiss', { vehicle: v.id, actor: a.id, x: v.x, z: v.z, speed: rel }); cooldown.set(key, S.t + 3);
        honk(S, v, 'nearMiss', 1);
      }
    }
  }
}

export { DIMS };
export type { Hail };
