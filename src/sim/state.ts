/** Internal agent and world state shared by the traffic and pedestrian modules. */
import type { ArchetypeRegistry, ArchetypeRt, VehicleKind } from './archetypes';
import type { Rng } from './geom';
import type { AgentGrid, Network } from './network';
import type { BusStop } from './laneFormat';
import type { VehicleClass } from '../shared/traffic';

export interface Vehicle {
  id: number; kind: VehicleKind; vclass: VehicleClass; lights: number; arch: ArchetypeRt; variant: number; alive: boolean;
  link: number; prevLink: number; s: number; v: number; acc: number; len: number; wid: number;
  /** Chosen connector at the end of the current lane (always one of links[link].next); -1 on a connector. */
  next: number;
  /** Desired connector (may start from a sibling lane: triggers a mandatory lane change). */
  want: number;
  v0f: number; T: number; aMax: number; bComf: number; s0: number;
  state: string; dwell: number;
  lat: number; latTarget: number; passable: boolean;
  lcFrom: number; lcT: number; lcCd: number;
  stopT: number; waitT: number; honkCd: number; greenWait: number; force: boolean; pullT: number; atLine: boolean;
  /** lane group a cab was on when it claimed a hail on the next block */
  hailFrom: number;
  /** time a routed vehicle has held at the line (on green) waiting to merge into its turn lane */
  laneWaitT: number;
  cop: CopState | null; owner: number;
  /** which kerb a curb stop pulls to: +1 right (normal), -1 left (one-way streets) */
  kerb: number;
  /** generic destination routing (player cab rides) */
  dest: { x: number; z: number } | null;
  /** player cab ride: pickup -> waiting -> riding -> arrived */
  ride: { phase: 'pickup' | 'waiting' | 'riding' | 'arrived'; t: number } | null;
  /** service vehicles: next timed stop / chime; special role (street sweeper) */
  svcT: number; svcRole: string;
  x: number; z: number; yaw: number; px: number; pz: number; pyaw: number;
  fare: boolean; fareT: number; hail: Hail | null; stopAt: number; stopLink: number; stopKind: string;
  dpDone: boolean; busServed: number; blockedBy: string;
  /** last most-constraining obstacle (debug) */
  why: string;
}

export interface Ped {
  id: number; arch: ArchetypeRt; variant: number; alive: boolean;
  edge: number; s: number; dir: number; lat: number; latGoal: number;
  speed: number; v: number;
  state: string; timer: number; node: number; prevEdge: number;
  x: number; z: number; y: number; yaw: number; px: number; pz: number; pyaw: number;
  /** Free-movement target (jaywalk, stepping to a spot, boarding). */
  tx: number; tz: number; toEdge: number; toS: number;
  spot: number; goalSpot: number; jayCd: number; hailCd: number; hail: Hail | null;
  fleeX: number; fleeZ: number; onRoad: boolean; jaywalking: boolean;
  /** What to do when a free move arrives: attach | loiter | vanish | hail | waitBus | flee | vendor */
  then: string; fleeSpeed: number; cop: boolean;
  goal: PedGoal | null; path: number[];
  /** 0..1 courage (gameplay: who runs to a call box, who freezes) */
  nerve: number; actName: string; actPrev: string; doorId: string;
  /** police officer state (src/sim/police.ts) */
  cop2: CopState | null;
}

export interface Hail { ped: number; road: number; side: number; x: number; z: number; claimedBy: number; t: number }
export interface Actor { id: string; x: number; z: number; vx: number; vz: number; radius: number; kind: 'player' | 'vehicle'; /** emergency siren on: civilians pull over */ siren?: boolean }
/** Police locomotion state for a foot cop or a police car (decisions stay with Gameplay). */
export interface CopState {
  id: number; kind: 'foot' | 'car'; role?: 'police' | 'ambulance' | 'fire' | 'tow'; precinct: string; mode: 'patrol' | 'goto' | 'search' | 'pursue' | 'boxIn' | 'roadblock' | 'idle';
  x: number; z: number; cx: number; cz: number; radius: number; yaw: number; target: string | null; urgent: boolean; siren: boolean; maxSpeed: number;
  route: number[]; arrived: boolean; stuckT: number; blockIds: number;
  /** passed the scene at speed with no room on that block: pull in on the next one */
  pullInNext?: boolean;
}

/** Scripted goal for one pedestrian (gameplay / narrative hooks). */
export interface PedGoal {
  kind: 'goto' | 'follow' | 'escort' | 'flee' | 'flagDownCar' | 'act';
  /** act: what the crowd renderer plays while the ped holds still (use_callbox, use_payphone, cower, hands_up, die, ...) */
  name?: string; duration?: number;
  /** sim time (s) when the goal lapses on its own */
  until?: number;
  /** urgent: cross against the light when traffic allows (police, panicked owners) */
  urgent?: boolean;
  /** goto: what to do on arrival ('subway' = go down the stairs and leave the street) */
  then?: 'subway' | 'door'; doorId?: string;
  x?: number; z?: number; speed?: number;
  /** follow/escort: external actor id (default 'player') or numeric agent id to pace against */
  target?: string | number;
  waypoints?: { x: number; z: number }[]; segment?: number;
  /** goto: the sidewalk edge and arc position nearest the target (walk to the exact spot, not just the corner) */
  edge?: number; s?: number;
  waitRadius?: number; maxSpeed?: number; replanT?: number;
}
export interface Block { link: number; s: number; until: number; owner?: number }
export interface Threat { x: number; z: number; r: number; until: number }

export interface Stats {
  redLight: number; wrongWay: number; vehCollisions: number; pedHits: number;
  spawnedV: number; despawnedV: number; spawnedP: number; despawnedP: number;
  stuckDespawn: number; honks: number; hails: number; boardings: number; dropoffs: number; busStops: number;
  doubleParks: number; jaywalks: number; crossings: number; laneChanges: number;
}

export interface SimCore {
  net: Network; rng: Rng; reg: ArchetypeRegistry;
  t: number; minute: number; weather: 'clear' | 'overcast' | 'rain';
  vehicles: Vehicle[]; peds: Ped[];
  occ: Vehicle[][]; occDirty: number[];
  pGrid: AgentGrid; vGrid: AgentGrid;
  /** peds currently on each crosswalk edge */
  onWalk: Map<number, Ped[]>;
  srcLane: Int32Array;
  actors: Actor[]; blocks: Block[]; threats: Threat[]; closedRoads: Map<number, number>;
  hails: Hail[]; spotOwner: Int32Array;
  focus: { x: number; z: number };
  maxVehicles: number; maxPeds: number;
  ringV: [number, number]; ringP: [number, number];
  densityHook: ((x: number, z: number, kind: 'vehicle' | 'ped') => number) | null;
  emit(type: string, e: Record<string, unknown>): void;
  stats: Stats; nextId: number;
  pedById: Map<number, Ped>;
  busStopOf: Map<number, BusStop>;
  /** vehicles with a lane change blend in progress */
  lcList: Vehicle[];
  /** police vehicles with sirens on this step (civilians pull over) */
  sirens: { id: number; x: number; z: number; vx: number; vz: number }[];
  /** lane -> connectors that feed it */
  preds: number[][];
  /** walk edge -> connectors that cross it */
  crossConns: Map<number, number[]>;
  /** peds entering each road's sidewalks since the last foot-traffic sample, and the rolling per-minute average */
  footCount: Float32Array; footAvg: Float32Array;
  spawnPedAt(x: number, z: number, reason: string): void;
  /** door hand-off hooks (src/sim/doors.ts) */
  doorArrived?(p: Ped, doorId: string): void; doorStepIn?(p: Ped): void;
  onBusStop(spot: number, v: Vehicle): void;
}

export function newStats(): Stats {
  return { redLight: 0, wrongWay: 0, vehCollisions: 0, pedHits: 0, spawnedV: 0, despawnedV: 0, spawnedP: 0, despawnedP: 0, stuckDespawn: 0, honks: 0, hails: 0, boardings: 0, dropoffs: 0, busStops: 0, doubleParks: 0, jaywalks: 0, crossings: 0, laneChanges: 0 };
}

/** Time-of-day density multipliers (minute of day -> 0..1). */
export function pedDensity(minute: number) {
  const h = minute / 60;
  if (h < 5) return 0.15; if (h < 6.5) return 0.3; if (h < 9.5) return 1.0; if (h < 16.5) return 0.85; if (h < 19.5) return 1.0; if (h < 22) return 0.65; return 0.35;
}
export function vehDensity(minute: number) {
  const h = minute / 60;
  if (h < 5) return 0.3; if (h < 6.5) return 0.5; if (h < 10) return 1.0; if (h < 16) return 0.85; if (h < 19.5) return 1.0; if (h < 23) return 0.7; return 0.45;
}
