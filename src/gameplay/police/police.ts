import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import { inPoly, wrapAngle } from '../core/vec';
import type { WorldQuery } from '../core/world';
import type { PrecinctDef } from '../data/schema';
import { MAX_HEAT, reportSeverity, SEVERITY, type CrimeKind } from './crime';
import { describeText, match, merge, observe, type Appearance, type Description } from './description';
import type { FiledReport } from './witnesses';
import { makeStamina, stepStamina, tiredMul, type StaminaState } from '../player/stamina';

/**
 * Police knowledge and response. No wanted meter: the police know what witnesses told them.
 *  - Reports live per precinct (house). Each has a merged description, a last-known location, a heat
 *    (severity) that decays, and the units working it.
 *  - Response escalates with heat: foot post → radio car → converging sector cars → plainclothes and
 *    roadblocks → (rarely) the helicopter. A precinct on the pad (payoffs) responds slower, escalates
 *    less and forgets faster.
 *  - Units search from the last-known position with sight cones. Seeing someone who fits the
 *    description builds recognition; at full recognition they stop you. Change clothes, ditch the car,
 *    swap plates, get indoors or underground, and the description stops fitting.
 *  - Any cop can be offered a bribe. Honest cops and investigators can't be bought; trying makes it worse.
 */
export type UnitKind = 'foot' | 'radio_car' | 'sector_car' | 'plainclothes' | 'roadblock' | 'helicopter';
export type UnitState = 'post' | 'enroute' | 'search' | 'suspicious' | 'approach' | 'encounter' | 'pursuit' | 'arrest' | 'leave' | 'roadblock' | 'combat' | 'down';
export interface Unit {
  id: string; kind: UnitKind; precinct: string; report: number | null;
  x: number; z: number; yaw: number; state: UnitState; t: number;
  /** 0 = honest; else the share of the time this cop takes money */
  corrupt: number; investigator: boolean;
  recog: number; lastSeen: [number, number] | null; lostFor: number; searchPts: [number, number][]; searchFor: number;
  bribeAttempts: number; ownDesc: Description | null; speed: number; sight: number; fov: number;
  /** ambient beat post (foot post / parked car): where the unit goes back to; null for dispatched units */
  post: [number, number] | null;
  /** foot cops tire in a chase (and radio for backup when they do) */
  stamina: StaminaState; calledBackup: boolean;
}
export interface Report {
  id: number; precinct: string; kinds: CrimeKind[]; heat: number; description: Description; lastKnown: [number, number]; crimeAt: [number, number];
  age: number; sinceSighting: number; units: string[]; sources: number; perp: string; spawned: Partial<Record<UnitKind, number>>; pending: { kind: UnitKind; at: number }[];
  /** crimes already counted (several witnesses to one gunshot add one shots-fired, not five) */
  crimeIds: Set<number>;
}
export interface SuspectCtx { id: string; pos: [number, number, number]; appearance: Appearance; speed: number; weaponDrawn: boolean; bleeding: boolean; indoors: boolean; subway: boolean; inVehicle: boolean; surrendered: boolean; oddLook?: boolean }

export interface PoliceEvents extends Record<string, unknown> {
  reportFiled: { report: Report; via: string; merged: boolean };
  dispatched: { unit: Unit; report: Report };
  spotted: { unit: string; suspect: string; match: number };
  stop: { unit: string; suspect: string };
  pursuit: { unit: string; suspect: string };
  lost: { unit: string; report: number; at: [number, number] };
  arrested: { suspect: string; unit: string; precinct: string; heat: number; kinds: CrimeKind[] };
  radio: { precinct: string; text: string; at: [number, number] };
  bribe: { unit: string; cents: number; result: 'accepted' | 'refused' | 'insulted' };
  roadblock: { unit: string; x: number; z: number; yaw: number; report: number };
  standDown: { unit: string };
  cleared: { report: number; precinct: string; why: 'decay' | 'bribe' | 'arrest' };
  engage: { unit: string; suspect: string };
  investigate: { unit: string; at: [number, number] };
}

export const TIER_HEAT = [0.5, 1.8, 2.8, 3.8, 4.8] as const;
export const DECAY = 1 / 60;                         // heat per second, unwatched
export const OFFICER_DOWN_DECAY = 0.12;              // a dead cop is remembered ~8x longer
export const STOP_MATCH = 0.55, LOSE_TIME = { foot: 12, car: 18 } as const;
const SPEC: Record<UnitKind, { delay: number; speed: number; fast: number; sight: number; fov: number; search: number }> = {
  foot: { delay: 15, speed: 1.6, fast: 4.6, sight: 35, fov: 140, search: 45 },
  radio_car: { delay: 25, speed: 8, fast: 15, sight: 45, fov: 120, search: 90 },
  sector_car: { delay: 35, speed: 8, fast: 16, sight: 45, fov: 120, search: 90 },
  plainclothes: { delay: 60, speed: 7, fast: 14, sight: 40, fov: 130, search: 150 },
  roadblock: { delay: 45, speed: 14, fast: 16, sight: 55, fov: 160, search: 240 },
  helicopter: { delay: 90, speed: 30, fast: 35, sight: 130, fov: 360, search: 180 },
};
const THINK = 0.2;

export function tierOf(effHeat: number) { let t = 0; for (const h of TIER_HEAT) if (effHeat >= h) t++; return t; }
export function needs(tier: number, officerDown = false): Partial<Record<UnitKind, number>> {
  const n: Partial<Record<UnitKind, number>> = {};
  if (officerDown) return { foot: 2, radio_car: 2, sector_car: 4, plainclothes: 2, roadblock: 4, helicopter: 1 }; // the officer-down surge
  if (tier >= 1) n.foot = 1;
  if (tier >= 2) n.radio_car = 1;
  if (tier >= 3) n.sector_car = 2;
  if (tier >= 4) { n.plainclothes = 1; n.roadblock = 2; }
  if (tier >= 5) n.helicopter = 1;
  return n;
}
/** Cents a corrupt cop expects to look the other way at a given heat. */
export const expectedBribe = (heat: number) => Math.round(1000 * Math.max(1, heat) ** 2);

export class Police extends Emitter<PoliceEvents> {
  readonly reports: Report[] = [];
  readonly units = new Map<string, Unit>();
  readonly payoff = new Map<string, number>();
  private nextReport = 1; private nextUnit = 1; private acc = 0;
  time = 0;
  stats = { thinkMs: 0 };
  /** Where a responding unit appears (out of sight, on the street grid). Scene/engine overrides. */
  spawnAt: (kind: UnitKind, near: [number, number], pct: PrecinctDef) => [number, number] = (_k, near, pct) => {
    const dx = near[0] - pct.station[0], dz = near[1] - pct.station[1], L = Math.hypot(dx, dz) || 1, r = Math.min(L, 220);
    return [near[0] - (dx / L) * r, near[1] - (dz / L) * r];
  };
  /** Chokepoints for roadblocks around a point (intersections ~250 m out). */
  chokepoints: (near: [number, number]) => { x: number; z: number; yaw: number }[] = (n) => [{ x: n[0] + 250, z: n[1], yaw: Math.PI / 2 }, { x: n[0] - 250, z: n[1], yaw: -Math.PI / 2 }, { x: n[0], z: n[1] + 250, yaw: 0 }, { x: n[0], z: n[1] - 250, yaw: Math.PI }];
  /** Snap a point the police want to walk/drive to onto somewhere they can go (street/sidewalk). Scene/engine overrides. */
  project: (x: number, z: number) => [number, number] = (x, z) => [x, z];
  /** Arrests on record for this perp in this house (repeat offenders are made faster and start hotter). */
  priorsOf: (perp: string, precinct: string) => number = () => 0;
  /** Seconds between one unit's call-out and the others acting on it (1974 radio). */
  relayDelay = 3;
  private relays: { at: number; r: number; pos: [number, number, number]; who: string }[] = [];
  placeName: (x: number, z: number) => string = (x, z) => `${x.toFixed(0)}, ${z.toFixed(0)}`;
  /** Lead-specific: how good they are at buying people. */
  bribeSkill: (suspect: string) => number = () => 0;

  constructor(private precincts: readonly PrecinctDef[], private world: WorldQuery, private rng: Rng) { super(); }

  precinctAt(x: number, z: number): PrecinctDef {
    for (const p of this.precincts) if (inPoly(x, z, p.area)) return p;
    let best = this.precincts[0], bd = Infinity;
    for (const p of this.precincts) { const d = Math.hypot(p.station[0] - x, p.station[1] - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  pct(id: string) { return this.precincts.find((p) => p.id === id)!; }
  payoffOf(pct: string) { return this.payoff.get(pct) ?? 0; }
  /** Story/side activity: set the pad level for a house (0..1). */
  setPayoff(pct: string, level: number) { this.payoff.set(pct, Math.max(0, Math.min(1, level))); }
  /** Pay into a house's pad: $250 = +0.5 (capped at 1). */
  pay(pct: string, cents: number) { this.setPayoff(pct, this.payoffOf(pct) + cents / 50000); }
  effHeat(r: Report) { return this.isCitywide(r) ? r.heat : r.heat * (1 - 0.35 * this.payoffOf(r.precinct)); }
  reportFor(perp: string) { return this.reports.filter((r) => r.perp === perp).sort((a, b) => b.heat - a.heat)[0] ?? null; }
  /** An officer-down report is known to every house (citywide), can't be bribed away and decays at OFFICER_DOWN_DECAY. */
  isCitywide(r: Report) { return r.kinds.includes('officer_down'); }

  /** A witness got through. Merge with a matching open report in the same house, or open a new one. */
  file(f: FiledReport): Report {
    const pct = this.precinctAt(f.crimeAt[0], f.crimeAt[1]);
    let r = this.reports.find((x) => x.precinct === pct.id && x.perp === f.perp && Math.hypot(x.crimeAt[0] - f.crimeAt[0], x.crimeAt[1] - f.crimeAt[1]) < 500);
    // NOTE: merging keys on the perp id for robustness; descriptions are merged so what police KNOW is still only what was reported.
    const merged = !!r;
    if (r) {
      f.kinds.forEach((k, i) => { const id = f.crimeIds?.[i]; if (id === undefined || !r!.crimeIds.has(id)) { r!.kinds.push(k); if (id !== undefined) r!.crimeIds.add(id); } });
      r.description = merge(r.description, f.desc); r.lastKnown = f.lastKnown; r.sources++; r.sinceSighting = 0;
      r.heat = Math.min(MAX_HEAT, Math.max(r.heat, reportSeverity(r.kinds) + 0.4 * Math.min(3, this.priorsOf(r.perp, r.precinct))));
    } else {
      r = { id: this.nextReport++, precinct: pct.id, kinds: [...f.kinds], heat: Math.min(MAX_HEAT, reportSeverity(f.kinds) + 0.4 * Math.min(3, this.priorsOf(f.perp, pct.id))), description: f.desc, lastKnown: f.lastKnown, crimeAt: f.crimeAt, age: 0, sinceSighting: 0, units: [], sources: 1, perp: f.perp, spawned: {}, pending: [], crimeIds: new Set(f.crimeIds ?? []) };
      this.reports.push(r);
    }
    this.emit('reportFiled', { report: r, via: f.via, merged });
    this.emit('radio', { precinct: pct.id, at: f.lastKnown, text: `${pct.name}, ${crimeWords(r.kinds)} at ${this.placeName(f.crimeAt[0], f.crimeAt[1])}. ${capital(describeText(r.description))}` });
    // flagged-down unit takes it immediately
    if (f.unit) { const u = this.units.get(f.unit); if (u && (u.state === 'search' || u.state === 'enroute' || u.state === 'leave')) this.assign(u, r, f.lastKnown); }
    this.plan(r);
    return r;
  }

  /** A cop saw it happen (crime inside a unit's sight): immediate pursuit with a near-perfect description. */
  witnessedByUnit(kind: CrimeKind, s: SuspectCtx, at: [number, number, number]): Unit | null {
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.units.values()) {
      if (u.state === 'down' || u.state === 'leave') continue;
      const d = Math.hypot(u.x - at[0], u.z - at[2]);
      if (d <= u.sight && d < bd && this.canSee(u, s.pos)) { bd = d; best = u; }
    }
    if (!best) return null;
    const r = this.file({ witness: best.id, perp: s.id, kinds: [kind], desc: observe(s.appearance, 0.95, this.rng), lastKnown: [s.pos[0], s.pos[2]], crimeAt: [at[0], at[2]], via: 'unit', unit: best.id, time: this.time });
    this.assign(best, r, [s.pos[0], s.pos[2]]);
    best.ownDesc = observe(s.appearance, 1, this.rng);
    this.setState(best, SEVERITY[kind] >= 3.5 ? 'combat' : 'pursuit');
    if (best.state === 'combat') this.emit('engage', { unit: best.id, suspect: s.id }); else this.emit('pursuit', { unit: best.id, suspect: s.id });
    return best;
  }

  /** Cops within earshot of gunfire (or a scream) go and look, even with no report and nothing seen. */
  heard(at: [number, number, number], radius: number) {
    for (const u of this.units.values()) {
      if (!['post', 'search', 'leave'].includes(u.state) || u.kind === 'roadblock') continue;
      if (Math.hypot(u.x - at[0], u.z - at[2]) > radius) continue;
      u.searchPts = [this.project(at[0], at[2])]; u.searchFor = 0;
      this.setState(u, 'enroute');
      this.emit('investigate', { unit: u.id, at: [at[0], at[2]] });
    }
  }
  /** Spawn a unit directly (test scene: a beat cop on the block, a parked patrol car). */
  addUnit(kind: UnitKind, pct: string, x: number, z: number, o: { corrupt?: number; investigator?: boolean; state?: UnitState } = {}): Unit {
    const sp = SPEC[kind];
    const u: Unit = {
      id: `cop${this.nextUnit++}`, kind, precinct: pct, report: null, x, z, yaw: 0, state: o.state ?? 'post', t: 0,
      corrupt: o.corrupt ?? this.rollCorrupt(pct, kind), investigator: o.investigator ?? kind === 'plainclothes',
      recog: 0, lastSeen: null, lostFor: 0, searchPts: [], searchFor: 0, bribeAttempts: 0, ownDesc: null, speed: 0, sight: sp.sight, fov: (sp.fov * Math.PI) / 180,
      post: (o.state ?? 'post') === 'post' ? [x, z] : null,
      stamina: makeStamina(kind === 'foot' || kind === 'plainclothes' ? this.rng.range(70, 110) : 1e6), calledBackup: false,
    };
    if (u.investigator) u.corrupt = 0;
    this.units.set(u.id, u);
    return u;
  }
  private rollCorrupt(pct: string, kind: UnitKind) {
    if (kind === 'plainclothes' || kind === 'helicopter') return 0;
    const p = this.pct(pct); const eff = Math.min(0.95, p.corruptibility + this.payoffOf(pct) * 0.3);
    return this.rng.chance(eff) ? this.rng.range(0.45, 1) : 0;
  }

  /** Schedule units the report's tier needs but doesn't have yet. */
  private plan(r: Report) {
    const want = needs(tierOf(this.effHeat(r)), this.isCitywide(r));
    const pct = this.pct(r.precinct);
    const slow = pct.responsiveness * (1 + 0.6 * this.payoffOf(r.precinct));
    for (const [k, n] of Object.entries(want) as [UnitKind, number][]) {
      const have = (r.spawned[k] ?? 0) + r.pending.filter((p) => p.kind === k).length;
      for (let i = have; i < n; i++) r.pending.push({ kind: k, at: this.time + SPEC[k].delay * slow * (1 + i * 0.35) });
    }
  }
  private dispatch(r: Report, kind: UnitKind) {
    const pct = this.pct(r.precinct);
    r.spawned[kind] = (r.spawned[kind] ?? 0) + 1;
    if (kind === 'roadblock') {
      const cps = this.chokepoints(r.lastKnown);
      const cp = cps[(r.spawned.roadblock! - 1) % cps.length];
      const u = this.addUnit('roadblock', pct.id, cp.x, cp.z, { state: 'roadblock' });
      u.yaw = cp.yaw; u.report = r.id; r.units.push(u.id);
      this.emit('roadblock', { unit: u.id, x: cp.x, z: cp.z, yaw: cp.yaw, report: r.id });
      this.emit('dispatched', { unit: u, report: r });
      return;
    }
    const [x, z] = this.project(...this.spawnAt(kind, r.lastKnown, pct));
    const u = this.addUnit(kind, pct.id, x, z, { state: 'enroute' });
    this.assign(u, r, r.lastKnown);
    this.emit('dispatched', { unit: u, report: r });
  }
  private assign(u: Unit, r: Report, at: [number, number]) {
    u.report = r.id; if (!r.units.includes(u.id)) r.units.push(u.id);
    u.searchPts = [at]; this.setState(u, 'enroute');
  }
  private setState(u: Unit, s: UnitState) { u.state = s; u.t = 0; }

  canSee(u: Unit, p: [number, number, number]) {
    const dx = p[0] - u.x, dz = p[2] - u.z, d = Math.hypot(dx, dz);
    if (d > u.sight) return false;
    if (u.fov < Math.PI * 2 - 1e-3 && Math.abs(wrapAngle(Math.atan2(-dx, -dz) - u.yaw)) > u.fov / 2) return false;
    if (u.kind === 'helicopter') return true;
    const eyeY = this.world.ground(u.x, u.z) + (u.kind === 'foot' ? 1.65 : 1.25);
    const o: [number, number, number] = [u.x, eyeY, u.z];
    const tx = p[0] - o[0], ty = p[1] - o[1], tz = p[2] - o[2], L = Math.hypot(tx, ty, tz) || 1;
    const h = this.world.ray(o, [tx / L, ty / L, tz / L], L - 0.4);
    return !h || h.material === 'glass';
  }

  update(dt: number, suspects: SuspectCtx[]) {
    this.time += dt; this.acc += dt;
    // movement every frame
    for (const u of this.units.values()) this.move(u, dt, suspects);
    // reports: decay, scheduled dispatches
    for (const r of [...this.reports]) {
      r.age += dt; r.sinceSighting += dt;
      const s = suspects.find((x) => x.id === r.perp);
      const chasing = r.units.some((id) => { const u = this.units.get(id); return u && (u.state === 'pursuit' || u.state === 'combat' || u.state === 'encounter'); });
      if (!chasing) {
        const hidden = s ? (s.subway ? 3 : s.indoors ? 2 : 1) : 1;
        const pad = this.isCitywide(r) ? 0 : this.payoffOf(r.precinct); // the pad doesn't cover a dead cop
        r.heat -= DECAY * (this.isCitywide(r) ? OFFICER_DOWN_DECAY : 1) * (1 + 1.5 * pad) * hidden * (r.sinceSighting > 60 ? 1.5 : 1) * dt;
      }
      for (const p of [...r.pending]) if (this.time >= p.at) { r.pending.splice(r.pending.indexOf(p), 1); if (tierOf(this.effHeat(r)) > 0) this.dispatch(r, p.kind); }
      if (r.heat < 0.3) this.clear(r, 'decay');
    }
    for (const q of [...this.relays]) if (this.time >= q.at) { this.relays.splice(this.relays.indexOf(q), 1); const r = this.reports.find((x) => x.id === q.r); if (r) this.applyRelay(r, q.pos); }
    if (this.acc < THINK) return;
    const step = this.acc; this.acc = 0;
    const t0 = now();
    for (const u of [...this.units.values()]) this.think(u, step, suspects);
    for (const r of this.reports) this.plan(r);
    this.stats.thinkMs = now() - t0;
  }

  clear(r: Report, why: 'decay' | 'bribe' | 'arrest') {
    const i = this.reports.indexOf(r); if (i < 0) return;
    this.reports.splice(i, 1);
    for (const id of r.units) { const u = this.units.get(id); if (u && u.state !== 'down') { u.report = null; this.setState(u, 'leave'); this.emit('standDown', { unit: id }); } }
    this.emit('cleared', { report: r.id, precinct: r.precinct, why });
  }

  private report(u: Unit) { return u.report === null ? null : this.reports.find((r) => r.id === u.report) ?? null; }

  private think(u: Unit, dt: number, suspects: SuspectCtx[]) {
    if (u.state === 'down' || u.state === 'combat') return;
    const r = this.report(u);
    if (u.state === 'leave') { if (u.t > 25) this.units.delete(u.id); return; }
    // a drawn gun in plain sight needs no description
    for (const s of suspects) {
      if (!s.weaponDrawn || s.indoors || ['pursuit', 'approach', 'encounter', 'arrest', 'leave', 'roadblock'].includes(u.state)) continue;
      if (Math.hypot(s.pos[0] - u.x, s.pos[2] - u.z) < 28 && this.canSee(u, s.pos)) { this.witnessedByUnit('menacing', s, s.pos); return; }
    }
    // look for anyone fitting a description this unit knows
    let seen = false;
    for (const s of suspects) {
      if (s.indoors || s.subway) continue;
      const desc = u.ownDesc ?? r?.description ?? null;
      const rep = r ?? this.reportFor(s.id);
      const d = desc ?? rep?.description;
      if (!d || !rep || (rep.precinct !== u.precinct && !r && !this.isCitywide(rep))) continue;
      if (!this.canSee(u, s.pos)) continue;
      seen = true;
      let m = match(d, s.appearance);
      if (u.ownDesc && (u.state === 'pursuit' || u.state === 'approach' || u.state === 'encounter')) m = 1; // still has eyes on them
      const odd = (s.weaponDrawn ? 0.3 : 0) + (s.speed > 5 ? 0.08 : 0) + (s.bleeding ? 0.12 : 0) + (s.oddLook ? 0.08 : 0);
      const fit = Math.min(1, m + odd * (m > 0.25 ? 1 : 0.3));
      if (fit >= 0.3) { rep.lastKnown = [s.pos[0], s.pos[2]]; rep.sinceSighting = 0; }
      const dist = Math.hypot(s.pos[0] - u.x, s.pos[2] - u.z);
      if (u.state === 'pursuit' || u.state === 'approach' || u.state === 'encounter') u.lastSeen = [s.pos[0], s.pos[2]];
      if (fit >= STOP_MATCH && (u.state === 'post' || u.state === 'search' || u.state === 'enroute' || u.state === 'suspicious' || u.state === 'roadblock')) {
        const rate = (1.6 - dist / u.sight) * fit * (u.kind === 'helicopter' ? 0.6 : 1) * (1 + 0.25 * Math.min(3, this.priorsOf(s.id, u.precinct)));
        u.recog = Math.min(1, u.recog + rate * dt);
        if (u.state !== 'suspicious' && u.state !== 'roadblock') { this.setState(u, 'suspicious'); this.emit('spotted', { unit: u.id, suspect: s.id, match: fit }); }
        if (u.recog >= 1) {
          u.lastSeen = [s.pos[0], s.pos[2]]; u.ownDesc = observe(s.appearance, 0.9, this.rng);
          if (u.report === null) { u.report = rep.id; rep.units.push(u.id); }
          if (u.kind === 'helicopter' || u.kind === 'roadblock') { this.emit('pursuit', { unit: u.id, suspect: s.id }); this.radioConverge(rep, s); }
          else { this.setState(u, 'approach'); this.emit('stop', { unit: u.id, suspect: s.id }); }
        }
      } else if (u.state === 'suspicious' && fit < 0.3) { u.recog = Math.max(0, u.recog - dt * 0.5); if (u.recog === 0) this.setState(u, u.report === null && u.post ? 'post' : 'search'); }
    }
    // lose track
    if (seen) u.lostFor = 0;
    if (u.state === 'pursuit' || u.state === 'approach') {
      if (!seen) u.lostFor += dt;
      const lim = u.kind === 'foot' ? LOSE_TIME.foot : LOSE_TIME.car;
      if (u.lostFor > lim && r) {
        this.emit('lost', { unit: u.id, report: r.id, at: u.lastSeen ?? r.lastKnown });
        this.emit('radio', { precinct: r.precinct, at: u.lastSeen ?? r.lastKnown, text: `${this.pct(r.precinct).name}, lost him around ${this.placeName(...(u.lastSeen ?? r.lastKnown))}. ${capital(describeText(u.ownDesc ?? r.description))}` });
        u.searchPts = [u.lastSeen ?? r.lastKnown]; u.searchFor = 0; u.recog = 0;
        this.setState(u, 'search');
      }
    }
    // encounter resolution
    const s = suspects[0];
    if (u.state === 'approach' && s && seen && Math.hypot(s.pos[0] - u.x, s.pos[2] - u.z) < (u.kind === 'foot' || u.kind === 'plainclothes' ? 4 : 6)) this.setState(u, 'encounter');
    if (u.state === 'encounter' && s) {
      const d = Math.hypot(s.pos[0] - u.x, s.pos[2] - u.z);
      if (d > 9 || s.speed > 4.2) {
        this.setState(u, 'pursuit'); this.emit('pursuit', { unit: u.id, suspect: s.id });
        if (r) { r.kinds.push('resisting'); r.heat = Math.min(MAX_HEAT, r.heat + 0.8); this.radioConverge(r, s); }
      } else if (u.t > 7 || s.surrendered) this.arrest(u, s);
    }
    if (u.state === 'pursuit' && s && seen && Math.hypot(s.pos[0] - u.x, s.pos[2] - u.z) < 1.8 && (s.speed < 1.2 || s.surrendered)) this.arrest(u, s);
    // searching: done after a while
    if (u.state === 'search') {
      u.searchFor += dt;
      const spec = SPEC[u.kind];
      if (u.searchFor > spec.search && (!r || r.sinceSighting > 30)) {
        if (u.post) { u.report = null; u.searchPts = []; this.setState(u, 'post'); } // back to the beat
        else { this.setState(u, 'leave'); this.emit('standDown', { unit: u.id }); }
      }
    }
  }

  /** A call-out reaches the other units after relayDelay seconds (radio, not telepathy). */
  private radioConverge(r: Report, s: SuspectCtx, who = '') {
    this.relays.push({ at: this.time + this.relayDelay, r: r.id, pos: [...s.pos] as [number, number, number], who });
    this.emit('radio', { precinct: r.precinct, at: [s.pos[0], s.pos[2]], text: `All units ${this.pct(r.precinct).name}, in pursuit at ${this.placeName(s.pos[0], s.pos[2])}. ${capital(describeText(r.description))}` });
  }
  private applyRelay(r: Report, pos: [number, number, number]) {
    for (const id of r.units) {
      const v = this.units.get(id);
      if (v && (v.state === 'search' || v.state === 'enroute' || v.state === 'suspicious' || v.state === 'post')) { v.searchPts = [this.project(pos[0], pos[2])]; v.ownDesc = v.ownDesc ?? r.description; this.setState(v, 'enroute'); }
    }
    // the house's posts in earshot of the radio join too
    for (const v of this.units.values()) if (v.state === 'post' && v.precinct === r.precinct && Math.hypot(v.x - pos[0], v.z - pos[2]) < 300) { v.report = r.id; r.units.push(v.id); v.searchPts = [this.project(pos[0], pos[2])]; this.setState(v, 'enroute'); }
  }

  private arrest(u: Unit, s: SuspectCtx) {
    const r = this.report(u) ?? this.reportFor(s.id);
    this.setState(u, 'arrest');
    this.emit('arrested', { suspect: s.id, unit: u.id, precinct: u.precinct, heat: r?.heat ?? 0, kinds: r ? [...r.kinds] : [] });
    if (r) this.clear(r, 'arrest');
  }

  private move(u: Unit, dt: number, suspects: SuspectCtx[]) {
    u.t += dt;
    const spec = SPEC[u.kind];
    let target: [number, number] | null = null, pace = spec.speed;
    const s = suspects[0];
    switch (u.state) {
      case 'enroute': target = u.searchPts[0] ?? null; pace = spec.fast; if (target && Math.hypot(target[0] - u.x, target[1] - u.z) < 4) { this.setState(u, 'search'); u.searchFor = 0; u.searchPts = []; } break;
      case 'post': {
        // a beat: stroll ±12 m around the post, looking about
        const home = u.post ?? [u.x, u.z];
        if (!u.searchPts.length) u.searchPts.push(this.project(home[0] + this.rng.range(-12, 12), home[1] + this.rng.range(-2, 2)));
        target = u.searchPts[0]; pace = u.kind === 'foot' ? 1.2 : 0;
        if (Math.hypot(target[0] - u.x, target[1] - u.z) < 1 || pace === 0) { if (u.t > 6) { u.searchPts.shift(); u.t = 0; } target = null; }
        break;
      }
      case 'search': {
        if (!u.searchPts.length) {
          const r = this.report(u); const c = r?.lastKnown ?? [u.x, u.z];
          const rad = Math.min(150, 25 + (r?.sinceSighting ?? 30) * 1.2);
          const a = this.rng.next() * Math.PI * 2, d = this.rng.range(0.3, 1) * rad;
          u.searchPts.push(this.project(c[0] + Math.cos(a) * d, c[1] + Math.sin(a) * d));
        }
        target = u.searchPts[0];
        if (Math.hypot(target[0] - u.x, target[1] - u.z) < 3) u.searchPts.shift();
        break;
      }
      case 'suspicious': if (s) { target = null; u.yaw = Math.atan2(-(s.pos[0] - u.x), -(s.pos[2] - u.z)); } break;
      case 'approach': if (s) { target = [s.pos[0], s.pos[2]]; pace = u.kind === 'foot' ? 2.2 : spec.speed * 0.6; } break;
      case 'encounter': if (s) u.yaw = Math.atan2(-(s.pos[0] - u.x), -(s.pos[2] - u.z)); break;
      case 'pursuit': {
        target = u.lastSeen; pace = spec.fast;
        if (u.kind === 'foot' || u.kind === 'plainclothes') {
          stepStamina(u.stamina, dt, 'sprint');
          pace *= tiredMul(u.stamina);
          if (u.stamina.exhausted && !u.calledBackup) {
            u.calledBackup = true;
            const r = this.report(u);
            if (r) { this.emit('radio', { precinct: u.precinct, at: [u.x, u.z], text: `${this.pct(u.precinct).name}, need assistance, foot pursuit at ${this.placeName(u.x, u.z)}.` }); if (s) this.radioConverge(r, s, u.id); }
          }
        }
        break;
      }
      case 'leave': { const p = this.pct(u.precinct); target = p.station; pace = spec.speed; break; }
    }
    if (u.state !== 'pursuit' && (u.kind === 'foot' || u.kind === 'plainclothes')) stepStamina(u.stamina, dt, u.speed > 2 ? 'walk' : 'idle');
    if (!target) { u.speed = 0; return; }
    const dx = target[0] - u.x, dz = target[1] - u.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { u.speed = 0; return; }
    const step = Math.min(d, pace * dt);
    u.x += (dx / d) * step; u.z += (dz / d) * step; u.speed = step / dt;
    u.yaw = Math.atan2(-dx, -dz);
  }

  /** Offer a bribe to a cop. `canPay(cents)` lets the caller check and take the money only on acceptance. */
  bribe(copId: string, cents: number, suspect: SuspectCtx | null, pay: (cents: number) => boolean, witnessesNear = 0): 'accepted' | 'refused' | 'insulted' {
    const u = this.units.get(copId);
    const res = (x: 'accepted' | 'refused' | 'insulted') => { this.emit('bribe', { unit: copId, cents, result: x }); return x; };
    if (!u || u.state === 'down' || u.state === 'leave') return res('refused');
    const r = this.report(u) ?? (suspect ? this.reportFor(suspect.id) : null);
    const heat = r?.heat ?? 0.8;
    if (u.corrupt <= 0 || u.investigator || heat >= 5.5 || (r && this.isCitywide(r)) || u.bribeAttempts >= 2) {
      if (r) { r.kinds.push('bribery_attempt'); r.heat = Math.min(MAX_HEAT, r.heat + SEVERITY.bribery_attempt); }
      if (suspect) { u.lastSeen = [suspect.pos[0], suspect.pos[2]]; u.lostFor = 0; }
      if (u.state !== 'combat') this.setState(u, 'pursuit');
      return res('insulted');
    }
    u.bribeAttempts++;
    const exp = expectedBribe(heat);
    if (cents < exp * 0.4) return res('refused');
    const p = Math.max(0, Math.min(0.97, u.corrupt * Math.min(1.4, cents / exp) + (suspect ? this.bribeSkill(suspect.id) : 0) + this.payoffOf(u.precinct) * 0.25 - witnessesNear * 0.08));
    if (!this.rng.chance(p)) return res('refused');
    if (!pay(cents)) return res('refused');
    if (r) { if (r.heat <= 4) this.clear(r, 'bribe'); else { r.heat -= 3; u.report = null; r.units = r.units.filter((x) => x !== u.id); } }
    this.setState(u, 'leave'); u.recog = 0; u.ownDesc = null;
    this.emit('standDown', { unit: u.id });
    return res('accepted');
  }

  /** Hours pass off-screen (sleep, custody, hospital): reports cool as if unwatched; everyone out searching has gone back. */
  elapse(seconds: number, hidden = 2) {
    for (const r of [...this.reports]) {
      const pad = this.isCitywide(r) ? 0 : this.payoffOf(r.precinct);
      r.heat -= DECAY * (this.isCitywide(r) ? OFFICER_DOWN_DECAY : 1) * (1 + 1.5 * pad) * hidden * 1.5 * seconds;
      r.age += seconds; r.sinceSighting += seconds; r.pending = [];
      if (r.heat < 0.3) this.clear(r, 'decay');
    }
    for (const u of [...this.units.values()]) {
      if (u.post) { u.x = u.post[0]; u.z = u.post[1]; u.report = null; u.recog = 0; u.ownDesc = null; u.stamina.value = u.stamina.max; u.stamina.exhausted = false; this.setState(u, 'post'); }
      else this.units.delete(u.id);
    }
    for (const r of this.reports) { r.units = []; r.spawned = {}; }
    this.relays.length = 0;
  }

  /** Where a chase stands, for HUD cues, audio and missions (CORE_SYSTEMS §1): read from the world, not a meter. */
  phase(perp: string): 'none' | 'spotted' | 'pursuit' | 'lost' | 'searching' | 'cooling' {
    const r = this.reportFor(perp);
    let spotted = false, pursuit = false, searching = false;
    for (const u of this.units.values()) {
      if (u.state === 'pursuit' || u.state === 'combat') pursuit = true;
      else if (u.state === 'approach' || u.state === 'encounter' || u.state === 'suspicious') spotted = true;
      else if (r && u.report === r.id && (u.state === 'search' || u.state === 'enroute')) searching = true;
    }
    if (pursuit) return 'pursuit';
    if (spotted) return 'spotted';
    if (!r) return 'none';
    if (searching) return r.sinceSighting < 30 ? 'lost' : 'searching';
    return 'cooling';
  }

  /** Contract view (Gameplay.police.reports). */
  view() {
    return this.reports.map((r) => ({ precinct: r.precinct, severity: +r.heat.toFixed(2), description: r.description as unknown as Record<string, unknown>, lastKnown: r.lastKnown, age: r.age, id: r.id, tier: tierOf(this.effHeat(r)), text: describeText(r.description) }));
  }

  serialize() {
    return { payoff: Object.fromEntries(this.payoff), reports: this.reports.map((r) => ({ id: r.id, precinct: r.precinct, kinds: r.kinds, heat: r.heat, description: r.description, lastKnown: r.lastKnown, crimeAt: r.crimeAt, age: r.age, perp: r.perp })), nextReport: this.nextReport };
  }
  deserialize(d: ReturnType<Police['serialize']>) {
    this.reports.length = 0; this.units.clear(); this.payoff.clear();
    for (const [k, v] of Object.entries(d?.payoff ?? {})) this.payoff.set(k, v);
    for (const r of d?.reports ?? []) this.reports.push({ ...r, sinceSighting: 120, units: [], sources: 1, spawned: {}, pending: [], crimeIds: new Set() });
    this.nextReport = d?.nextReport ?? 1;
  }
}

function crimeWords(k: CrimeKind[]) {
  const top = [...k].sort((a, b) => SEVERITY[b] - SEVERITY[a])[0];
  const W: Record<CrimeKind, string> = { weapon_seen: 'someone with a gun', vandalism: 'malicious mischief', reckless: 'a reckless driver', menacing: 'someone menacing people', resisting: 'someone resisting', bribery_attempt: 'a bribery attempt', assault: 'an assault', theft: 'a robbery', assault_weapon: 'an assault with a weapon', carjack: 'a car stolen at gunpoint', hit_and_run: 'a hit-and-run', shots_fired: 'shots fired', shooting: 'a shooting', assault_officer: 'an officer assaulted', homicide: 'a homicide', officer_down: 'officer down' };
  return W[top];
}
const capital = (s: string) => s.replace(/^…?(\w)/, (m, c) => m.replace(c, c.toUpperCase()));
const now = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
