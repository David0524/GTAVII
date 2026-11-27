import { assignPursuit, type RoleAssignment, type SuspectMotion } from '../police/pursuit';
import type { AgentCommand, AgentPort, PedSnapshot } from '../police/ports';
import type { Police, Unit } from '../police/police';
import type { Cars } from '../cars/theft';
import { tiredMul } from '../player/stamina';

/**
 * Adapter: gameplay ⇄ the sim stream's real API (claude/nice-sagan-2jh4m2, src/sim/index.ts), typed
 * structurally so gameplay never imports sim internals (brief rule). Three jobs:
 *  1. Pedestrians: AgentCommand → setGoal / kill (sim answer to ENGINE_REQUESTS 8.1–8.3).
 *  2. Police: every gameplay unit gets a sim police agent. Gameplay decides (reports, recognition,
 *     bribes, arrests) and sets each unit's target/pace; the sim walks the sidewalks and drives the lanes
 *     (one-ways, sirens, box-in, roadblocks) and we copy positions back. Cop stamina caps maxSpeed.
 *  3. Car theft: takeVehicle → a gameplay car record; the owner steps out and runs after you (sim),
 *     and reports the plate soon after (gameplay).
 */
export interface SimPedView { id: number; archetype: string; x: number; y: number; z: number; yaw: number; speed: number; state: string; variant: number; nerve: number }
export interface SimPoliceView { id: number; kind: 'foot' | 'car'; x: number; z: number; yaw: number; speed: number; mode: string; siren: boolean; agentId: number }
export type SimPedGoal = { kind: 'goto' | 'follow' | 'escort' | 'flee' | 'flagDownCar' | 'act'; name?: string; duration?: number; until?: number; urgent?: boolean; x?: number; z?: number; speed?: number };
export type SimPoliceGoal =
  | { kind: 'patrol'; around: [number, number]; radius: number; maxSpeed?: number }
  | { kind: 'goto'; x: number; z: number; urgent?: boolean; maxSpeed?: number }
  | { kind: 'search'; x: number; z: number; radius: number; maxSpeed?: number }
  | { kind: 'pursue'; target: string; maxSpeed?: number }
  | { kind: 'boxIn'; target: string; maxSpeed?: number }
  | { kind: 'roadblock'; x: number; z: number; yaw?: number; maxSpeed?: number };
export interface SimLike {
  readonly peds: readonly SimPedView[];
  readonly police?: readonly SimPoliceView[];
  setGoal(pedId: number, goal: SimPedGoal | null): boolean;
  kill?(pedId: number, bodySeconds?: number): boolean;
  /** `respondTo`: the sim starts the car on a free lane about 24 s of siren driving out (x/z ignored). */
  spawnPolice?(o: { kind: 'foot' | 'car'; x: number; z: number; precinct?: string; siren?: boolean; respondTo?: { x: number; z: number } }): number;
  setPoliceGoal?(id: number, goal: SimPoliceGoal): boolean;
  setSiren?(id: number, on: boolean): void;
  despawnPolice?(id: number): boolean;
  takeVehicle?(vehicleId: number): { ownerPedId: number; vclass: string; variant: number; x: number; z: number; yaw: number } | null;
  /** Street vendors (sim fb337dc): commands to the vendor's people, and notices the sim animates. */
  vendorCommand?(id: string, c: { type: 'flee' | 'cower'; x?: number; z?: number }): void;
  /** sim memory.ts (39af2cb): the street remembers what the player did; the block's standing decays (~15 min half-life). */
  remember?(kind: SimMemKind, x: number, z: number, opts?: { witnessR?: number; pedId?: number }): void;
  reputation?(x: number, z: number): { score: number; last: SimMemKind | null; ago: number };
  vendorNotice?(n: { kind: 'cartOverturned' | 'vendorSale' | 'monteFolded'; vendor: string; good?: string }): void;
  /** Ped hand-off: released peds are gameplay's (moved each frame) until reclaimed (then `pedCalmed`). */
  releasePed?(pedId: number): boolean;
  moveReleasedPed?(pedId: number, x: number, z: number, yaw: number, speed: number): void;
  reclaimPed?(pedId: number): void;
  /** A short act on a ped (e.g. 'shove'); false for dead or released peds. */
  pedAct?(pedId: number, act: string, duration?: number): boolean;
  /** Real lane-graph junctions (2+ named streets), nearest first; armYaw = each approach road's yaw pointing away. */
  nearestIntersections?(x: number, z: number, radius: number, max?: number): { id: string; x: number; z: number; dist: number; signal: boolean; streets: string[]; armYaw: number[] }[];
  /** Parking (sim): the rule at a kerb now, and registering a parked car for enforcement (ticketIssued / towDispatched / vehicleTowed). */
  parkingRule?(x: number, z: number, minute?: number, dow?: number): unknown;
  registerParkedCar?(id: string, x: number, z: number): void;
  /** Responders (sim claude/nice-sagan-2jh4m2): spawn 150–250 m out, run with sirens, work the scene, leave. */
  dispatch?(role: 'ambulance' | 'fire', x: number, z: number): number[];
  /** Player cab: callCab → cabReady {cabId,x,z,kerb}; boardCab drives the legal route (cabTurnAhead, cabRideArrived); leaveCab releases it; cabGaveUp after 90 s. */
  callCab?(x: number, z: number): number;
  boardCab?(cabId: number, dest: { x: number; z: number }): boolean;
  leaveCab?(cabId: number): void;
  on(type: string, cb: (e: any) => void): void;
  emit(e: any): void;
}

export type SimMemKind = 'helped' | 'tipped' | 'bumped' | 'knockdown' | 'reckless' | 'theft' | 'robbed' | 'assault' | 'gunfire' | 'killed';
export const simPedNumber = (id: string) => { const n = Number(id.startsWith('ped:') ? id.slice(4) : id); return Number.isFinite(n) ? n : undefined; };
const pedId = (id: string) => Number(id.startsWith('ped:') ? id.slice(4) : id);

/** seconds out of sight that still count as contact: a car round a corner is still being chased */
export const CORNER_GRACE = 4;
/** 1. Pedestrian port over setGoal/kill. */
export function simAgentPort(sim: SimLike): AgentPort {
  const snap = (p: SimPedView): PedSnapshot => ({ id: `ped:${p.id}`, x: p.x, y: p.y, z: p.z, yaw: p.yaw, alive: p.state !== 'dead', nerve: p.nerve });
  return {
    peds: () => sim.peds.map(snap),
    ped: (id) => { const n = pedId(id); const p = sim.peds.find((q) => q.id === n); return p ? snap(p) : undefined; },
    command: (id, c: AgentCommand) => {
      const n = pedId(id);
      switch (c.type) {
        case 'goto': sim.setGoal(n, { kind: 'goto', x: c.x, z: c.z, speed: c.pace === 'run' ? 4.6 : 1.5, urgent: c.pace === 'run' }); break;
        case 'flee': sim.setGoal(n, { kind: 'flee', x: c.fromX, z: c.fromZ }); break;
        case 'cower': sim.setGoal(n, { kind: 'act', name: 'cower' }); break;
        case 'anim': if (c.name === 'die') { if (sim.kill) sim.kill(n); else sim.setGoal(n, { kind: 'act', name: 'die' }); } else if (c.name === 'flag_down') sim.setGoal(n, { kind: 'flagDownCar' }); else sim.setGoal(n, { kind: 'act', name: c.name }); break;
        case 'face': break; // the sim turns agents itself
        case 'release': sim.setGoal(n, null); break;
      }
    },
  };
}

/** 2. Police mirror. Call `update()` every frame after `Gameplay.update`. */
export class PoliceMirror {
  private agentOf = new Map<string, number>();
  private lastGoal = new Map<string, string>();
  /** Pursuit roles for this frame (unit id → role), recomputed by `update` when a suspect motion is supplied. */
  roles = new Map<string, RoleAssignment>();
  constructor(private sim: SimLike, private police: Police, private player: () => string = () => 'player', private suspect?: () => SuspectMotion | null) { police.externalMovement = !!sim.spawnPolice; }

  update() {
    const sim = this.sim; if (!sim.spawnPolice || !sim.setPoliceGoal || !sim.police) return;
    const views = new Map(sim.police.map((v) => [v.id, v]));
    this.roles.clear();
    const s = this.suspect?.();
    if (s) {
      // chasers: units in pursuit, plus cars already rolling to this chase on the radio call (they get corners ahead
      // instead of driving to where he was a minute ago). Contact survives a corner: CORNER_GRACE seconds unseen.
      const live = this.police.units; const pursuing = [...live.values()].filter((u) => u.state === 'pursuit');
      const reports = new Set(pursuing.map((u) => u.report).filter((r): r is number => r !== null));
      const chasers = [...live.values()].filter((u) => u.kind !== 'helicopter' && u.kind !== 'roadblock' && (u.state === 'pursuit' || (u.state === 'enroute' && u.kind.endsWith('car') && u.report !== null && reports.has(u.report))));
      for (const a of assignPursuit(chasers.map((u) => ({ id: u.id, car: u.kind.endsWith('car'), x: u.x, z: u.z, seesSuspect: u.state === 'pursuit' && u.lostFor < CORNER_GRACE })), s, this.police.chokepoints)) this.roles.set(a.id, a);
    }
    for (const u of this.police.units.values()) {
      if (u.kind === 'helicopter' || u.state === 'combat' || u.state === 'down') { this.drop(u.id); continue; }
      let id = this.agentOf.get(u.id);
      if (id === undefined) {
        const car = u.kind.endsWith('car') || u.kind === 'roadblock' || u.kind === 'plainclothes';
        // a dispatched car comes in from out of sight with the siren on; gameplay already spent the dispatch delay
        const scene = u.target ?? this.police.reports.find((r) => r.id === u.report)?.lastKnown ?? null;
        const responding = car && u.state === 'enroute' && u.kind !== 'plainclothes' && scene;
        id = sim.spawnPolice({ kind: car ? 'car' : 'foot', x: u.x, z: u.z, precinct: u.precinct, siren: u.state === 'enroute' || u.state === 'pursuit', ...(responding ? { respondTo: { x: scene![0], z: scene![1] } } : {}) });
        if (id < 0) continue; // no room in the sim: gameplay keeps the unit abstract this frame
        this.agentOf.set(u.id, id);
      }
      const goal = this.goalFor(u);
      const key = JSON.stringify(goal);
      if (this.lastGoal.get(u.id) !== key) { sim.setPoliceGoal(id, goal); this.lastGoal.set(u.id, key); sim.setSiren?.(id, ['enroute', 'pursuit', 'approach'].includes(u.state) && u.kind !== 'foot'); }
      const v = views.get(id);
      if (v) { u.x = v.x; u.z = v.z; u.yaw = v.yaw; u.speed = v.speed; }
    }
    for (const [uid] of this.agentOf) if (!this.police.units.has(uid)) this.drop(uid);
  }
  private goalFor(u: Unit): SimPoliceGoal {
    const max = u.kind === 'foot' || u.kind === 'plainclothes' ? (u.pace ?? 4.6) * tiredMul(u.stamina) : undefined;
    const t = u.target ?? [u.x, u.z];
    switch (u.state) {
      case 'post': return { kind: 'patrol', around: u.post ?? [u.x, u.z], radius: 12, maxSpeed: 1.4 };
      case 'search': return { kind: 'search', x: t[0], z: t[1], radius: 40, maxSpeed: max };
      case 'enroute': { const r = this.roles.get(u.id); if (r?.role === 'cutoff' && r.to) return { kind: 'goto', x: r.to[0], z: r.to[1], urgent: true }; if (r?.role === 'tail' || r?.role === 'box') return { kind: 'pursue', target: this.player(), maxSpeed: max }; return { kind: 'goto', x: t[0], z: t[1], urgent: true, maxSpeed: max }; }
      case 'pursuit': {
        const r = this.roles.get(u.id);
        if (r?.role === 'box') return { kind: 'boxIn', target: this.player(), maxSpeed: max };
        if (r?.role === 'cutoff' && r.to) return { kind: 'goto', x: r.to[0], z: r.to[1], urgent: true };
        if (r?.role === 'search' && r.to) return { kind: 'search', x: r.to[0], z: r.to[1], radius: 60, maxSpeed: max };
        return { kind: 'pursue', target: this.player(), maxSpeed: max };
      }
      case 'approach': return { kind: 'pursue', target: this.player(), maxSpeed: u.kind === 'foot' ? 2.2 : 6 };
      case 'roadblock': return { kind: 'roadblock', x: u.x, z: u.z, yaw: u.yaw };
      case 'suspicious': case 'encounter': case 'arrest': return { kind: 'goto', x: u.x, z: u.z, maxSpeed: 0.5 };
      default: return { kind: 'goto', x: t[0], z: t[1], urgent: false, maxSpeed: max };
    }
  }
  private drop(uid: string) { const id = this.agentOf.get(uid); if (id !== undefined) { this.sim.despawnPolice?.(id); this.agentOf.delete(uid); this.lastGoal.delete(uid); } }
}

/** 3. Steal a sim car: it leaves the sim, gameplay keeps the record; the owner reports it shortly. */
export function stealSimCar(sim: SimLike, cars: Cars, vehicleId: number, colours: readonly string[], lead: string) {
  const t = sim.takeVehicle?.(vehicleId); if (!t) return null;
  const id = `sim:${vehicleId}`;
  const c = cars.add({ id, vclass: t.vclass, colour: colours[t.variant % colours.length], x: t.x, z: t.z, locked: false, keysIn: true, driver: null });
  c.stolenBy = lead; c.stolenAt = cars.time; c.discoverAt = cars.time + 20; // the owner is right there
  return { car: id, owner: `ped:${t.ownerPedId}`, ...t };
}
