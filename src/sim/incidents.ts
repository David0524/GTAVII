/**
 * Ambient traffic incidents (oversight gap list item 3; vs GTA V/VI's street life):
 *
 *  - Fender-benders: in stop-and-go traffic a follower taps the car ahead. Both stop with hazards on in the
 *    kerb lane of a multi-lane street (traffic squeezes past in the other lanes), and the two drivers get out
 *    and stand between the bumpers on the kerb side: `inspect` -> `argue` (and, with hot heads, `shove`)
 *    -> back in the cars, which drive on. Events: `fenderBender {a, b, x, z, drivers, until}`,
 *    `incidentAct {incident, id, act}`, `fenderBenderEnd {incident}`. Placed in view (35-140 m from the focus)
 *    at most every couple of minutes, daytime and evening only.
 *  - Road rage: an aggressive driver held up behind a double-parked truck, an accident or a blocked lane leans
 *    on the horn, shouts or gestures out of the window, and sometimes forces his way into the next lane.
 *    Event `roadRage {id, x, z, act: leanOnHorn | shout | gesture | forceIn, target}` plus a long honk.
 *  - Horn chains: a honk at a green light or a blockage sets off the impatient drivers behind it, one after
 *    another (each `honk` carries `chain` and `chainDepth`); `hornChain {chain, x, z, length}` once three
 *    have joined in, so audio can play it as one chorus.
 *  - Double-parked delivery trucks (traffic.ts periodBehaviour) are the other lane blocker; they feed road rage
 *    and horn chains here.
 */
import type { SimCore, Vehicle, Ped } from './state';
import { LinkKind } from './laneFormat';
import { sampleAt } from './geom';
import { honk } from './traffic';
import { spawnPedNear, despawnPed, setPedGoal } from './peds';

interface Incident { id: number; a: Vehicle; b: Vehicle; drivers: Ped[]; t0: number; until: number; phase: number; x: number; z: number }
interface ChainHonk { v: Vehicle; at: number; chain: number; depth: number }

const tmp = [0, 0, 0, 0];

export class Incidents {
  private list: Incident[] = [];
  private nextId = 1;
  private nextCheck = 0;
  /** earliest sim time the next fender-bender may happen */
  private nextBender = 90;
  private rageCd = new Map<number, number>();
  private pending: ChainHonk[] = [];
  private chains = new Map<number, { n: number; x: number; z: number; announced: boolean; t: number }>();
  private nextChain = 1;
  stats = { fenderBenders: 0, roadRage: 0, hornChains: 0, chainHonks: 0 };
  /** mean seconds between fender-benders near the player (gameplay/tests can tune; 0 = off) */
  benderEvery = 150;

  constructor(private S: SimCore) {}

  get active() { return this.list.map((i) => ({ id: i.id, a: i.a.id, b: i.b.id, x: i.x, z: i.z, until: i.until, drivers: i.drivers.map((p) => p.id) })); }

  /** traffic.ts calls this on every honk: join or start a chain and wake up the drivers queued behind. */
  onHonk(v: Vehicle, reason: string): { chain: number; depth: number } {
    const S = this.S;
    let chain = 0, depth = 0;
    const own = (v as any)._chain as { c: number; d: number; t: number } | undefined;
    if (own && S.t - own.t < 1.5) { chain = own.c; depth = own.d; }
    if (!chain && (reason === 'green' || reason === 'blocked' || reason === 'rage' || (reason === 'queue' && v.stopT > 12))) {
      chain = this.nextChain++; depth = 0;
      this.chains.set(chain, { n: 1, x: v.x, z: v.z, announced: false, t: S.t });
    }
    if (chain && depth < 6) {
      // the cars behind in this lane (and the lane beside it) that have been waiting join in, a beat apart
      const net = S.net, grp = net.groups.get(net.g.links[v.link].group);
      const lanes = grp ?? [v.link];
      let k = 0;
      for (const l of lanes) for (const w of S.occ[l]) {
        if (w === v || w.state !== 'drive' || w.v > 1 || w.cop || w.honkCd > 0 || (w as any)._chain?.c === chain) continue;
        const behind = v.s - w.s;
        if (behind < 2 || behind > 26) continue;
        if (w.stopT < 2 || !S.rng.chance(0.25 + w.arch.aggression * 0.4)) continue;
        (w as any)._chain = { c: chain, d: depth + 1, t: S.t + 3 };
        this.pending.push({ v: w, at: S.t + S.rng.range(0.35, 1.3) * (1 + k * 0.4), chain, depth: depth + 1 });
        if (++k >= 3) break;
      }
    }
    return { chain, depth };
  }

  step(dt: number) {
    const S = this.S;
    // delayed chain honks
    if (this.pending.length) {
      const due = this.pending.filter((h) => h.at <= S.t);
      this.pending = this.pending.filter((h) => h.at > S.t);
      for (const h of due) {
        if (!h.v.alive) continue;
        (h.v as any)._chain = { c: h.chain, d: h.depth, t: S.t };
        h.v.honkCd = 0;
        honk(S, h.v, 'chain', Math.min(1, 0.5 + h.depth * 0.12));
        this.stats.chainHonks++;
        const c = this.chains.get(h.chain);
        if (c) { c.n++; if (c.n >= 3 && !c.announced) { c.announced = true; this.stats.hornChains++; S.emit('hornChain', { chain: h.chain, x: c.x, z: c.z, length: c.n }); } }
      }
    }
    for (const [k, c] of this.chains) if (S.t - c.t > 20) this.chains.delete(k);
    for (const inc of this.list) this.tickIncident(inc);
    this.list = this.list.filter((i) => i.phase < 9);
    if (S.t < this.nextCheck) return;
    this.nextCheck = S.t + 1;
    this.roadRage();
    if (this.benderEvery > 0 && S.t >= this.nextBender && this.list.length < 2) this.tryFenderBender();
    void dt;
  }

  /** Force one now near (x, z) if a suitable pair is in traffic there (tests, missions); returns its id or 0. */
  stage(x?: number, z?: number): number { return this.tryFenderBender(x, z, true); }

  private tryFenderBender(fx?: number, fz?: number, forced = false): number {
    const S = this.S, net = S.net;
    const h = S.minute / 60;
    if (!forced && (h < 7 || h > 22)) return 0;
    const cx = fx ?? S.focus.x, cz = fz ?? S.focus.z;
    let best: [Vehicle, Vehicle] | null = null, bestScore = -Infinity;
    for (const v of S.vehicles) {
      if (!v.alive || v.state !== 'drive' || v.cop || v.kind === 'bus' || v.kind === 'service' || v.ride || v.v < 0.8 || v.v > 6 || v.lcT < 1) continue;
      const L = net.g.links[v.link];
      if (L.kind !== LinkKind.Lane || L.laneIndex !== 0 || (net.groups.get(L.group)?.length ?? 1) < 2) continue;
      if (v.s < 12 || net.len[v.link] - v.s < 25) continue;
      const d = Math.hypot(v.x - cx, v.z - cz);
      if (d < 35 || d > 140) continue;
      // the car right in front, slower or braking, almost touching
      let lead: Vehicle | null = null;
      for (const w of S.occ[v.link]) if (w !== v && w.s > v.s && (!lead || w.s < lead.s)) lead = w;
      if (!lead || lead.state !== 'drive' || lead.cop || lead.kind === 'bus' || lead.ride || lead.lcT < 1) continue;
      const gap = lead.s - v.s - (lead.len + v.len) / 2;
      if (gap > 4.5 || gap < 1.8 || lead.v > v.v + 0.5) continue; // a pace between the bumpers: room for the two drivers
      const score = -Math.abs(d - 70) + S.rng.next() * 10;
      if (score > bestScore) { bestScore = score; best = [lead, v]; }
    }
    if (!best) { if (!forced) this.nextBender = S.t + 10; return 0; }
    const [a, b] = best;
    const dur = S.rng.range(40, 75);
    for (const v of [a, b]) { v.state = 'incident'; v.v = 0; v.acc = 0; v.dwell = Infinity; v.passable = false; v.latTarget = 0; }
    const seam = (a.s - a.len / 2 + b.s + b.len / 2) / 2;
    const L = net.g.links[a.link];
    sampleAt(L.pts, net.cum[a.link], Math.max(0, seam), tmp);
    const off = Math.max(a.wid, b.wid) / 2 - 0.2; // kerb side of the kerb lane (+lat = right), by the corners of the bumpers
    const px = tmp[0] - tmp[3] * off, pz = tmp[1] + tmp[2] * off;
    const inc: Incident = { id: this.nextId++, a, b, drivers: [], t0: S.t, until: S.t + dur, phase: 0, x: px, z: pz };
    // the drivers: one from each car, facing each other across the seam
    for (const [v, along] of [[a, 0.55], [b, -0.55]] as [Vehicle, number][]) {
      const arch = S.reg.pick((q) => q.behaviour === 'walker' || q.behaviour === 'commuter', px, pz, S.minute, S.rng.next());
      if (!arch) continue;
      const p = spawnPedNear(S, px, pz, arch, 25); if (!p) continue;
      setPedGoal(S, p, { kind: 'act', name: 'inspect', duration: Infinity });
      p.x = px + tmp[2] * along; p.z = pz + tmp[3] * along; p.px = p.x; p.pz = p.z; p.onRoad = true; p.y = 0;
      p.yaw = Math.atan2(-tmp[2] * along, -tmp[3] * along) + Math.PI; p.pyaw = p.yaw;
      (p as any).incidentCar = v.id;
      inc.drivers.push(p);
    }
    this.list.push(inc);
    this.stats.fenderBenders++;
    this.nextBender = S.t + this.benderEvery * S.rng.range(0.6, 1.4);
    S.emit('fenderBender', { incident: inc.id, a: a.id, b: b.id, x: px, z: pz, drivers: inc.drivers.map((p) => p.id), until: inc.until });
    honk(S, a, 'collision', 1);
    return inc.id;
  }

  private act(inc: Incident, p: Ped, act: string) {
    if (!p.alive || p.state !== 'act') return;
    p.actName = act;
    this.S.emit('incidentAct', { incident: inc.id, id: p.id, act, x: p.x, z: p.z });
  }

  private tickIncident(inc: Incident) {
    const S = this.S, el = S.t - inc.t0;
    const gone = !inc.a.alive || !inc.b.alive || inc.a.state !== 'incident' || inc.b.state !== 'incident';
    if (inc.phase === 0 && el > 5) { inc.phase = 1; for (const p of inc.drivers) this.act(inc, p, 'argue'); }
    if (inc.phase === 1 && el > 14) {
      inc.phase = 2;
      const heat = (inc.a.arch.aggression + inc.b.arch.aggression) / 2;
      if (inc.drivers.length === 2 && S.rng.chance(0.2 + heat * 0.5)) {
        const [p, q] = S.rng.chance(0.5) ? inc.drivers : [inc.drivers[1], inc.drivers[0]];
        this.act(inc, p, 'shove'); this.act(inc, q, 'stagger');
        this.stats.roadRage++;
        S.emit('roadRage', { id: p.id, x: p.x, z: p.z, act: 'shove', target: q.id, incident: inc.id });
      }
    }
    if (inc.phase === 2 && el > 20) { inc.phase = 3; for (const p of inc.drivers) this.act(inc, p, S.rng.chance(0.5) ? 'argue' : 'exchangeDetails'); }
    if ((inc.phase === 3 && S.t > inc.until) || gone) {
      // back in the cars (the door hides the swap) and off they go
      for (const p of inc.drivers) if (p.alive) { S.emit('incidentAct', { incident: inc.id, id: p.id, act: 'enterCar', x: p.x, z: p.z, vehicle: (p as any).incidentCar }); despawnPed(S, p); }
      for (const v of [inc.a, inc.b]) if (v.alive && v.state === 'incident') v.dwell = v === inc.b ? 2.5 : 0; // the leader pulls away first
      S.emit('fenderBenderEnd', { incident: inc.id, x: inc.x, z: inc.z });
      inc.phase = 9;
    }
  }

  private roadRage() {
    const S = this.S;
    for (const v of S.vehicles) {
      if (!v.alive || v.state !== 'drive' || v.cop || v.v > 0.3 || v.stopT < 9 || v.arch.aggression < 0.55) continue;
      if ((this.rageCd.get(v.id) ?? -1) > S.t) continue;
      // what's holding him up: a double-parker, an accident or a lane block right ahead
      let target: Vehicle | null = null, best = 14;
      for (const w of S.occ[v.link]) { const d = w.s - v.s - (w.len + v.len) / 2; if (w !== v && d > -0.5 && d < best && (w.state === 'doubleParked' || w.state === 'incident' || w.state === 'curb')) { best = d; target = w; } }
      const blocked = !target && S.blocks.some((b) => b.link === v.link && b.s > v.s && b.s - v.s < 20);
      if (!target && !blocked) continue;
      if (!S.rng.chance(0.35)) { this.rageCd.set(v.id, S.t + 6); continue; }
      this.rageCd.set(v.id, S.t + S.rng.range(25, 45));
      const r = S.rng.next();
      const act = r < 0.4 ? 'leanOnHorn' : r < 0.7 ? 'shout' : r < 0.9 ? 'gesture' : 'forceIn';
      if (act === 'leanOnHorn' || act === 'forceIn') { v.honkCd = 0; honk(S, v, 'rage', 1); }
      if (act === 'forceIn') v.lcCd = 0; // tries the next lane now (aggressive lane change accepts tighter gaps)
      this.stats.roadRage++;
      S.emit('roadRage', { id: v.id, x: v.x, z: v.z, act, target: target?.id ?? -1, archetype: v.arch.def.id });
    }
    if (this.rageCd.size > 400) for (const [k, t] of this.rageCd) if (t < S.t) this.rageCd.delete(k);
  }
}
