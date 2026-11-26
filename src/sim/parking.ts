/**
 * Kerbside rules, enforcement, tows and street cleaning (owning cars: HOMES_AND_CARS brief).
 *
 * Rules are deterministic from the street graph (no data on 1974 signage exists at block level, so
 * these are period-typical, not historical claims):
 *  - Alternate-side street cleaning on side streets: each kerb has two days a week (Mon/Thu, Tue/Fri or
 *    Wed/Sat) and a window (08:00-11:00 or 11:00-14:00), picked by hashing the street and side.
 *    Avenues are swept at night and have no alternate-side rule.
 *  - Avenues: no standing 07:00-10:00 and 16:00-19:00 on weekdays (tow-away).
 *  - Bus stops: no standing within 15 m (tow-away). Hydrants: no parking within 4.6 m (15 ft; tow-away).
 *    Corners: no standing within 6 m of a crosswalk.
 * Fines are tiers ('minor' | 'major'); the Economy stream owns the money.
 *
 * Enforcement: the engine registers parked cars it cares about (the player's) with registerParkedCar.
 * A traffic agent walks over and writes a ticket (`ticketIssued`); a tow-away violation left for 5
 * sim-minutes (or any violation 30 minutes after a ticket) brings a tow truck (`towDispatched`,
 * `vehicleTowed`). Street sweepers work the kerbs whose cleaning window is on.
 */
import { hash2, projectOnPoly, sampleAt } from './geom';
import type { SimCore, CopState, Vehicle } from './state';
import { makeVehicle } from './traffic';
import { nearestLane, setCopGoalCar } from './police';
import { setPedGoal, spawnPedNear } from './peds';

export interface ParkingRule {
  allowed: boolean; towAway: boolean; fine: 'none' | 'minor' | 'major';
  reasons: string[]; street: string; road: number; side: number;
  /** alternate-side schedule of this kerb, if any */
  cleaning: { days: number[]; from: number; to: number } | null;
}
export interface ParkedCar { id: string; x: number; z: number; since: number; ticketedAt: number; towId: number; agent: number }

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const tmp = [0, 0, 0, 0];

export class Parking {
  dow = 5; // 1974-06-21 was a Friday
  readonly cars = new Map<string, ParkedCar>();
  private sweepT = 5;
  tickets = 0; tows = 0;

  constructor(private S: SimCore) {}

  /** Kerb (sidewalk edge) nearest a point: road, side, arc position. */
  private kerb(x: number, z: number) {
    const net = this.S.net;
    let best = -1, bd = 25, bs = 0;
    for (const e of net.sidewalksNear(x, z, 25, new Set())) { const p = projectOnPoly(net.g.walkEdges[e].pts, x, z); if (p.d < bd) { bd = p.d; best = e; bs = p.s; } }
    return best < 0 ? null : { edge: best, s: bs, road: net.g.walkEdges[best].owner, side: net.g.walkEdges[best].side };
  }

  cleaning(road: number, side: number): { days: number[]; from: number; to: number } | null {
    const net = this.S.net;
    if (net.isAvenue(road)) return null;
    const name = net.roadName(road);
    if (!/Street$/.test(name)) return null;
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    h = (h ^ (side > 0 ? 0x9e37 : 0x79b9)) >>> 0;
    const pairs = [[1, 4], [2, 5], [3, 6]];
    return { days: pairs[h % 3], from: h % 2 ? 8 * 60 : 11 * 60, to: h % 2 ? 11 * 60 : 14 * 60 };
  }

  /** Hydrants along a kerb: one every ~70 m, deterministic. Positions are on the kerb edge of the sidewalk. */
  hydrantsNear(x: number, z: number, r: number): { x: number; z: number }[] {
    const net = this.S.net, out: { x: number; z: number }[] = [];
    for (const e of net.sidewalksNear(x, z, r + 10, new Set())) {
      const E = net.g.walkEdges[e], L = net.walkLen[e];
      const start = 8 + (hash2(E.pts[0], E.pts[1]) % 50);
      for (let s = start; s < L - 6; s += 70) {
        sampleAt(E.pts, net.walkCum[e], s, tmp);
        const lr = -E.side * (E.half + 0.6); // kerb side of the band
        const hx = tmp[0] - tmp[3] * lr, hz = tmp[1] + tmp[2] * lr;
        if (Math.hypot(hx - x, hz - z) <= r) out.push({ x: hx, z: hz });
      }
    }
    return out;
  }

  rule(x: number, z: number, minute = this.S.minute, dow = this.dow): ParkingRule {
    const S = this.S, net = S.net;
    const k = this.kerb(x, z);
    if (!k) return { allowed: false, towAway: false, fine: 'none', reasons: ['not at a kerb'], street: '', road: -1, side: 0, cleaning: null };
    const reasons: string[] = []; let tow = false, major = false;
    const weekday = dow >= 1 && dow <= 5;
    if (net.isAvenue(k.road) && weekday && ((minute >= 7 * 60 && minute < 10 * 60) || (minute >= 16 * 60 && minute < 19 * 60))) { reasons.push('no standing (rush hour)'); tow = true; }
    const cl = this.cleaning(k.road, k.side);
    if (cl && cl.days.includes(dow) && minute >= cl.from && minute < cl.to) reasons.push(`street cleaning ${cl.days.map((d) => DAY[d]).join('/')} ${hhmm(cl.from)}-${hhmm(cl.to)}`);
    for (const bs of S.net.g.busStops) { const sp = S.net.g.spots[bs.spot]; if (Math.hypot(sp.x - x, sp.z - z) < 15) { reasons.push('no standing (bus stop)'); tow = true; major = true; break; } }
    if (this.hydrantsNear(x, z, 4.6).length) { reasons.push('hydrant'); tow = true; major = true; }
    if (k.s < 6 || k.s > net.walkLen[k.edge] - 6) reasons.push('no standing (corner)'); // sidewalk edges end at the corners
    return { allowed: reasons.length === 0, towAway: tow, fine: reasons.length === 0 ? 'none' : major || tow ? 'major' : 'minor', reasons, street: net.roadName(k.road), road: k.road, side: k.side, cleaning: cl };
  }

  // ---------------------------------------------------------------- enforcement
  register(id: string, x: number, z: number) { this.cars.set(id, { id, x, z, since: this.S.t, ticketedAt: -1, towId: -1, agent: -1 }); }
  unregister(id: string) { this.cars.delete(id); }

  step(dt: number) {
    const S = this.S;
    for (const c of this.cars.values()) {
      const r = this.rule(c.x, c.z);
      if (r.allowed) { c.since = S.t; continue; }
      // a traffic agent comes to write the ticket
      if (c.ticketedAt < 0 && c.agent < 0 && S.t - c.since > 20) {
        let agent = S.peds.find((p) => p.alive && p.arch.def.id === 'npc.traffic_agent' && !p.goal && Math.hypot(p.x - c.x, p.z - c.z) < 200);
        if (!agent) { const a = S.reg.list.find((q) => q.def.id === 'npc.traffic_agent'); const p = a ? spawnPedNear(S, c.x + 60, c.z, a, 60) : null; if (p) agent = p; }
        if (agent) { c.agent = agent.id; setPedGoal(S, agent, { kind: 'goto', x: c.x, z: c.z, speed: 1.3, until: S.t + 240 }); }
      }
      if (c.agent >= 0 && c.ticketedAt < 0) {
        const p = S.pedById.get(c.agent);
        if (!p || !p.alive) c.agent = -1;
        else if ((Math.hypot(p.x - c.x, p.z - c.z) < 6 || (p.state === 'hold' && Math.hypot(p.x - c.x, p.z - c.z) < 15)) && p.state !== 'act') {
          setPedGoal(S, p, { kind: 'act', name: 'write_ticket', duration: 20 });
          c.ticketedAt = S.t; c.agent = -1; this.tickets++;
          S.emit('ticketIssued', { carId: c.id, reasons: r.reasons, fine: r.fine, street: r.street });
        }
      }
      // the tow
      const towDue = c.towId < 0 && ((r.towAway && S.t - c.since > 300) || (c.ticketedAt >= 0 && S.t - c.ticketedAt > 1800));
      if (towDue) { c.towId = this.dispatchTow(c); if (c.towId >= 0) S.emit('towDispatched', { carId: c.id, truckId: c.towId }); }
    }
    // tows that have hooked up and pulled away
    for (const c of [...this.cars.values()]) {
      if (c.towId < 0) continue;
      const v = S.vehicles.find((w) => w.id === c.towId);
      if (!v || !v.alive) { c.towId = -1; continue; }
      if (v.cop?.arrived && v.state !== 'onScene') { this.cars.delete(c.id); this.tows++; S.emit('vehicleTowed', { carId: c.id, truckId: v.id, to: 'pound' }); }
    }
    if ((this.sweepT -= dt) <= 0) { this.sweepT = 20; this.sweepers(); }
  }

  private dispatchTow(c: ParkedCar): number {
    const S = this.S;
    const arch = S.reg.list.find((a) => a.def.id === 'npc.tow_driver');
    if (!arch) return -1;
    for (let tries = 0; tries < 12; tries++) {
      const a = S.rng.next() * Math.PI * 2, r = S.rng.range(120, 220);
      const near = nearestLane(S, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
      if (near.lane < 0 || near.d > 20) continue;
      const s = Math.max(6, Math.min(S.net.len[near.lane] - 10, near.s));
      if (S.occ[near.lane].some((o) => Math.abs(o.s - s) < o.len / 2 + 7)) continue;
      const v: Vehicle = makeVehicle(S, 'service', 'box_truck', arch, near.lane, s); // TODO: 'tow_truck' class (ENGINE_REQUESTS sim 8)
      const cs: CopState = { id: v.id, kind: 'car', role: 'tow', precinct: '', mode: 'idle', x: c.x, z: c.z, cx: c.x, cz: c.z, radius: 0, yaw: 0, target: null,
        urgent: false, siren: false, maxSpeed: 12, route: [], arrived: false, stuckT: 0, blockIds: 0 };
      v.cop = cs;
      setCopGoalCar(S, cs, v, { kind: 'goto', x: c.x, z: c.z });
      return v.id;
    }
    return -1;
  }

  /** Keep a street sweeper or two on kerbs whose cleaning window is on, near the focus. */
  private sweepers() {
    const S = this.S, net = S.net;
    const active = S.vehicles.filter((v) => v.alive && v.svcRole === 'sweeper').length;
    if (active >= 2) return;
    const arch = S.reg.list.find((a) => a.def.id === 'npc.street_sweeper');
    if (!arch) return;
    for (const l of net.lanesNear(S.focus.x, S.focus.z, S.ringV[0], new Set())) {
      const L = net.g.links[l];
      if (L.laneIndex !== 0 || net.len[l] < 60) continue;
      const side = L.dir; // kerb lane sweeps the right kerb (road side == travel dir)
      const cl = this.cleaning(L.owner, side);
      if (!cl || !cl.days.includes(this.dow) || S.minute < cl.from || S.minute >= cl.to) continue;
      const s = 10;
      if (S.occ[l].some((o) => Math.abs(o.s - s) < o.len / 2 + 8)) continue;
      const v = makeVehicle(S, 'service', 'garbage', arch, l, s); // TODO: 'street_sweeper' class (ENGINE_REQUESTS sim 8)
      v.svcRole = 'sweeper'; v.v0f = 0.25; v.latTarget = 0.6;
      S.emit('sweeperOut', { id: v.id, street: net.roadName(L.owner) });
      return;
    }
  }
}

function hhmm(m: number) { return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
