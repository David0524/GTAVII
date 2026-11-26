import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import { wrapAngle } from '../core/vec';
import type { WorldQuery } from '../core/world';
import { radiusOf, type Crime, type CrimeKind } from './crime';
import { merge, observe, type Appearance, type Description } from './description';
import type { AgentPort, LightAt, PedSnapshot } from './ports';

/**
 * Witnesses. A crime only counts if someone sees or hears it.
 *   perception → shock → (flee | run to report | bystander) → calling → report filed → released.
 * 1974: no cell phones. Reporting means running to a red police call box or a payphone (a dime and a
 * longer call), or flagging down a patrol car. The player can stop a report by catching the witness
 * first (intimidate or pay them), by breaking the call box, or by simply not being where they say.
 */
export interface ReportPoint { id: string; kind: 'callbox' | 'payphone'; x: number; z: number; broken: boolean }
export type WitnessState = 'shock' | 'flee' | 'toReport' | 'calling' | 'filed' | 'silenced' | 'bystander' | 'dead';
export interface Witness {
  ped: string; perp: string; crimes: Set<number>; kinds: CrimeKind[]; desc: Description; saw: boolean;
  lastSeen: [number, number]; lastSeenT: number; crimeAt: [number, number];
  state: WitnessState; t: number; nerve: number; target: { kind: 'callbox' | 'payphone' | 'unit'; id: string; x: number; z: number } | null;
  shockFor: number; fleeFor: number; attempts: number;
}
export interface FiledReport { witness: string; perp: string; kinds: CrimeKind[]; desc: Description; lastKnown: [number, number]; crimeAt: [number, number]; via: 'callbox' | 'payphone' | 'unit'; unit?: string; time: number }
export interface WitnessEvents extends Record<string, unknown> {
  witnessed: { ped: string; crime: number; saw: boolean; dist: number };
  heading: { ped: string; to: 'callbox' | 'payphone' | 'unit'; id: string; x: number; z: number };
  calling: { ped: string; via: 'callbox' | 'payphone' | 'unit'; id: string; duration: number };
  filed: FiledReport;
  silenced: { ped: string; how: 'intimidated' | 'paid' };
  panicked: { ped: string };
}

export const SIGHT_DAY = 48, SIGHT_NIGHT = 24, FOV = (150 * Math.PI) / 180, CALL_TIME = { callbox: 6, payphone: 12, unit: 4 }, MAX_REPORTERS = 6;
const ARRIVE = 1.6, FLAG_RANGE = 70, THINK = 0.2;

export class Witnesses extends Emitter<WitnessEvents> {
  readonly list = new Map<string, Witness>();
  readonly points = new Map<string, ReportPoint>();
  private acc = 0;
  time = 0;
  stats = { perceptionMs: 0, thinkMs: 0 };

  constructor(private port: AgentPort, private world: WorldQuery, private rng: Rng, private light: LightAt = () => 1,
    private units: () => { id: string; x: number; z: number; available: boolean }[] = () => []) { super(); }

  addPoint(p: ReportPoint) { this.points.set(p.id, p); }
  setBroken(id: string, b: boolean) { const p = this.points.get(id); if (!p) return; p.broken = b; if (b) for (const w of this.list.values()) if (w.target?.id === id && (w.state === 'toReport' || w.state === 'calling')) this.route(w, this.port.ped(w.ped)); }

  /** Perception pass for a new crime. `perpPos` is the perpetrator's chest position. */
  crime(c: Crime, perp: Appearance & { evasion: number; pos: [number, number, number] }): Witness[] {
    const t0 = performanceNow();
    const R = Math.max(radiusOf(c), SIGHT_DAY);
    const out: Witness[] = [];
    let reporters = [...this.list.values()].filter((w) => w.crimes.has(c.id) && (w.state === 'toReport' || w.state === 'calling')).length;
    for (const p of this.port.peds()) {
      if (!p.alive || p.id === c.perp) continue;
      const dx = c.at[0] - p.x, dz = c.at[2] - p.z, dist = Math.hypot(dx, dz);
      if (dist > R) continue;
      const heard = dist <= radiusOf(c);
      const lit = this.light(p.x, p.z);
      const sight = SIGHT_NIGHT + (SIGHT_DAY - SIGHT_NIGHT) * lit;
      const facing = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - p.yaw)) <= FOV / 2;
      let saw = false;
      if (c.visible && dist <= sight && (facing || heard || p.id === c.victim)) saw = this.los(p, perp.pos);
      if (!saw && !heard) continue;
      const clarity = saw ? Math.max(0.15, (1 - dist / sight) * (0.55 + 0.45 * lit) * (1 - perp.evasion * 0.5) + (p.id === c.victim ? 0.25 : 0)) : 0;
      const desc = saw ? observe(perp, clarity, this.rng) : { clothes: [] };
      const kinds: CrimeKind[] = saw ? [c.kind] : [c.kind === 'shooting' || c.kind === 'homicide' || c.kind === 'officer_down' ? 'shots_fired' : c.kind];
      let w = this.list.get(p.id);
      if (w && w.state === 'silenced' && w.perp === c.perp) continue; // scared or paid off: they saw nothing
      if (w && w.state !== 'filed' && w.state !== 'silenced' && w.state !== 'dead' && w.perp === c.perp) {
        w.crimes.add(c.id); w.kinds.push(...kinds); w.desc = merge(w.desc, desc); w.saw ||= saw;
        if (saw) { w.lastSeen = [perp.pos[0], perp.pos[2]]; w.lastSeenT = this.time; }
      } else {
        const nerve = p.nerve ?? this.rng.range(0.15, 0.95);
        w = {
          ped: p.id, perp: c.perp, crimes: new Set([c.id]), kinds, desc, saw, lastSeen: [perp.pos[0], perp.pos[2]], lastSeenT: this.time, crimeAt: [c.at[0], c.at[2]],
          state: 'shock', t: 0, nerve, target: null, shockFor: this.rng.range(0.5, 1.5) * (1.3 - nerve * 0.5), fleeFor: 0, attempts: 0,
        };
        // Who reports: most do; the timid and those far away mostly just get clear. Children never do.
        const reports = !p.child && reporters < MAX_REPORTERS && this.rng.chance(saw ? 0.55 + nerve * 0.4 : 0.35 + nerve * 0.3);
        if (!reports) w.fleeFor = -1; // bystander after shock
        else reporters++;
        this.list.set(p.id, w);
        this.port.command(p.id, { type: 'cower' });
      }
      out.push(w);
      this.emit('witnessed', { ped: p.id, crime: c.id, saw, dist });
    }
    this.stats.perceptionMs = performanceNow() - t0;
    return out;
  }

  private los(p: PedSnapshot, target: [number, number, number]) {
    const o: [number, number, number] = [p.x, p.y + 1.6, p.z];
    const dx = target[0] - o[0], dy = target[1] - o[1], dz = target[2] - o[2], L = Math.hypot(dx, dy, dz) || 1;
    const h = this.world.ray(o, [dx / L, dy / L, dz / L], L - 0.3);
    return !h || h.material === 'glass';
  }

  /** Choose where to report: a nearby patrol car to flag down, else the nearest working call box/payphone,
   *  avoiding routes that pass close to the perpetrator. */
  private route(w: Witness, p: PedSnapshot | undefined) {
    if (!p) return;
    const perpX = w.lastSeen[0], perpZ = w.lastSeen[1];
    let best: Witness['target'] = null, bestCost = Infinity;
    for (const u of this.units()) {
      if (!u.available) continue;
      const d = Math.hypot(u.x - p.x, u.z - p.z);
      if (d < FLAG_RANGE && d < bestCost) { bestCost = d * 0.6; best = { kind: 'unit', id: u.id, x: u.x, z: u.z }; }
    }
    for (const r of this.points.values()) {
      if (r.broken) continue;
      const d = Math.hypot(r.x - p.x, r.z - p.z);
      // penalise points whose straight route passes near the perp
      const near = segPointDist(p.x, p.z, r.x, r.z, perpX, perpZ);
      const cost = d * (r.kind === 'payphone' ? 1.25 : 1) + (near < 10 ? 80 : 0);
      if (cost < bestCost) { bestCost = cost; best = { kind: r.kind, id: r.id, x: r.x, z: r.z }; }
    }
    w.target = best;
    if (!best) { w.state = 'bystander'; this.port.command(w.ped, { type: 'flee', fromX: perpX, fromZ: perpZ }); return; }
    w.state = 'toReport'; w.t = 0;
    this.port.command(w.ped, { type: 'goto', x: best.x, z: best.z, pace: 'run' });
    this.emit('heading', { ped: w.ped, to: best.kind, id: best.id, x: best.x, z: best.z });
  }

  /** Perp context each tick: where they are (for memory updates) and who they are near. */
  update(dt: number, perps: Map<string, { pos: [number, number, number]; appearance: Appearance; evasion: number }>, fileReport: (r: FiledReport) => void) {
    this.time += dt; this.acc += dt;
    for (const w of this.list.values()) w.t += dt;
    if (this.acc < THINK) return;
    const step = this.acc; this.acc = 0;
    const t0 = performanceNow();
    for (const w of [...this.list.values()]) {
      const p = this.port.ped(w.ped);
      if (!p || !p.alive) { if (w.state !== 'filed') w.state = 'dead'; this.list.delete(w.ped); continue; }
      const perp = perps.get(w.perp);
      // keep track of the perp while they can still see them
      if (perp && (w.state === 'toReport' || w.state === 'shock' || w.state === 'flee' || w.state === 'calling')) {
        const d = Math.hypot(perp.pos[0] - p.x, perp.pos[2] - p.z);
        if (d < SIGHT_DAY * 0.8 && this.los(p, perp.pos)) { w.lastSeen = [perp.pos[0], perp.pos[2]]; w.lastSeenT = this.time; }
      }
      switch (w.state) {
        case 'shock':
          if (w.t >= w.shockFor) {
            if (w.fleeFor < 0) { w.state = 'bystander'; this.port.command(w.ped, { type: 'flee', fromX: w.lastSeen[0], fromZ: w.lastSeen[1] }); w.t = 0; break; }
            // armed perp close by: get clear first, then report
            const close = perp && Math.hypot(perp.pos[0] - p.x, perp.pos[2] - p.z) < 14;
            if (close && w.nerve < 0.75) { w.state = 'flee'; w.fleeFor = this.rng.range(3, 6); w.t = 0; this.port.command(w.ped, { type: 'flee', fromX: perp!.pos[0], fromZ: perp!.pos[2] }); }
            else this.route(w, p);
          }
          break;
        case 'flee': if (w.t >= w.fleeFor) this.route(w, p); break;
        case 'toReport': {
          const tg = w.target!;
          if (tg.kind === 'unit') { const u = this.units().find((x) => x.id === tg.id); if (!u) { this.route(w, p); break; } tg.x = u.x; tg.z = u.z; this.port.command(w.ped, { type: 'goto', x: u.x, z: u.z, pace: 'run' }); }
          if (Math.hypot(tg.x - p.x, tg.z - p.z) <= ARRIVE + (tg.kind === 'unit' ? 2.5 : 0)) {
            w.state = 'calling'; w.t = 0;
            this.port.command(w.ped, { type: 'anim', name: tg.kind === 'callbox' ? 'use_callbox' : tg.kind === 'payphone' ? 'use_payphone' : 'flag_down' });
            this.emit('calling', { ped: w.ped, via: tg.kind, id: tg.id, duration: CALL_TIME[tg.kind] });
          } else if (w.t > 120) { w.state = 'bystander'; this.port.command(w.ped, { type: 'release' }); } // gave up
          break;
        }
        case 'calling': {
          const tg = w.target!;
          if (tg.kind !== 'unit' && this.points.get(tg.id)?.broken) { this.route(w, p); break; }
          if (w.t >= CALL_TIME[tg.kind]) {
            const r: FiledReport = { witness: w.ped, perp: w.perp, kinds: [...w.kinds], desc: w.desc, lastKnown: w.lastSeen, crimeAt: w.crimeAt, via: tg.kind, unit: tg.kind === 'unit' ? tg.id : undefined, time: this.time };
            w.state = 'filed'; w.t = 0;
            fileReport(r);
            this.emit('filed', r);
            this.port.command(w.ped, { type: 'release' });
          }
          break;
        }
        case 'bystander': case 'silenced': if (w.t > 20) { this.list.delete(w.ped); this.port.command(w.ped, { type: 'release' }); } break;
        case 'filed': if (w.t > 60) this.list.delete(w.ped); break;
      }
    }
    void step;
    this.stats.thinkMs = performanceNow() - t0;
  }

  /** Threaten a witness. Armed and close works better; fails on the brave, who then panic and run harder. */
  intimidate(ped: string, by: { armed: boolean; dist: number }): 'silenced' | 'panicked' | 'none' {
    const w = this.list.get(ped);
    if (!w || w.state === 'filed' || w.state === 'silenced' || by.dist > 7) return 'none';
    const p = (by.armed ? 0.85 : 0.45) * (1.15 - w.nerve) * (by.dist < 3 ? 1.1 : 0.85);
    if (this.rng.chance(p)) { w.state = 'silenced'; w.t = 0; this.port.command(ped, { type: 'cower' }); this.emit('silenced', { ped, how: 'intimidated' }); return 'silenced'; }
    w.nerve = Math.min(1, w.nerve + 0.2);
    if (w.state === 'shock' || w.state === 'flee' || w.state === 'bystander') this.route(w, this.port.ped(ped));
    this.emit('panicked', { ped });
    return 'panicked';
  }
  /** Pay a witness to forget. $5 is a coin flip for the timid; $20 buys most people. */
  pay(ped: string, cents: number): boolean {
    const w = this.list.get(ped);
    if (!w || w.state === 'filed' || w.state === 'silenced') return false;
    const p = Math.min(0.95, (cents / 2000) * (1.2 - w.nerve * 0.6));
    w.attempts++;
    if (w.attempts <= 2 && this.rng.chance(p)) { w.state = 'silenced'; w.t = 0; this.port.command(ped, { type: 'release' }); this.emit('silenced', { ped, how: 'paid' }); return true; }
    return false;
  }
  /** Witnesses of a given perp still able to report (for UI: "someone is running to a call box"). */
  active(perp?: string) { return [...this.list.values()].filter((w) => (!perp || w.perp === perp) && (w.state === 'toReport' || w.state === 'calling' || w.state === 'shock' || w.state === 'flee')); }
}

function segPointDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
const performanceNow = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
