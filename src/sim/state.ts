/** Internal agent and world state shared by the traffic and pedestrian modules. */
import type { ArchetypeRegistry, ArchetypeRt, VehicleKind } from './archetypes';
import type { Rng } from './geom';
import type { AgentGrid, Network } from './network';
import type { BusStop } from './laneFormat';

export interface Vehicle {
  id: number; kind: VehicleKind; arch: ArchetypeRt; variant: number; alive: boolean;
  link: number; prevLink: number; s: number; v: number; acc: number; len: number; wid: number;
  /** Chosen connector at the end of the current lane (always one of links[link].next); -1 on a connector. */
  next: number;
  /** Desired connector (may start from a sibling lane: triggers a mandatory lane change). */
  want: number;
  v0f: number; T: number; aMax: number; bComf: number; s0: number;
  state: string; dwell: number;
  lat: number; latTarget: number; passable: boolean;
  lcFrom: number; lcT: number; lcCd: number;
  stopT: number; waitT: number; honkCd: number; greenWait: number; force: boolean;
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
}

export interface Hail { ped: number; road: number; side: number; x: number; z: number; claimedBy: number; t: number }
export interface Actor { id: string; x: number; z: number; vx: number; vz: number; radius: number; kind: 'player' | 'vehicle' }
export interface Block { link: number; s: number; until: number }
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
  /** lane -> connectors that feed it */
  preds: number[][];
  /** walk edge -> connectors that cross it */
  crossConns: Map<number, number[]>;
  spawnPedAt(x: number, z: number, reason: string): void;
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
