/**
 * Built interior: what the worker returns for one interior (pure data, transferable).
 *
 * Local frame: x along the frontage (unit u), z into the building (unit n), y up from the
 * ground-floor level. World = origin + u*x + up*y + n*z. The runtime places the group with that
 * basis (three.js handles the mirrored case when u x n points down).
 */
export interface MeshArrays {
  position: Float32Array; normal: Float32Array; color: Float32Array; uv: Float32Array;
  /** x pattern id, y pattern param, z grime/wear 0..1, w emissive strength */
  pat: Float32Array;
  /** rgb baked lamp irradiance, a baked window (sky/street) light */
  light: Float32Array;
  index: Uint32Array;
}
export interface CellOut {
  id: number;
  name: string;
  /** local AABB [minX,minY,minZ,maxX,maxY,maxZ] */
  box: [number, number, number, number, number, number];
  opaque: MeshArrays;
  glass: MeshArrays | null;
  /** floor index (0 ground) for power/brownout groups and debug */
  level: number;
  /** outdoor cell (roof dressing): visible whenever the interior is resident and in range, not via portals */
  outdoor?: boolean;
}
/** A rectangular opening between two cells (or a cell and the street, b = -1). Local coords. */
export interface PortalOut {
  a: number; b: number;
  /** 4 corners, counter-clockwise seen from cell a */
  pts: [number, number, number][];
}
export interface ColliderOut {
  /** cuboid: centre, half extents, yaw about local y (radians), optional pitch about local x for ramps */
  c: [number, number, number]; h: [number, number, number]; yaw: number; pitch?: number;
  /** cover objects for combat (counters, booths, pillars) */
  cover?: boolean;
  /** breakable prop class for the gameplay contract */
  breakable?: 'glass' | 'bottle' | 'chair' | 'table';
}
export interface DoorOut {
  id: string;
  /** hinge position (local), leaf width/height, closed yaw (local), swing sign */
  hinge: [number, number, number]; w: number; h: number; yaw: number; swing: 1 | -1;
  locked: boolean; cellA: number; cellB: number;
  /** street door (on the facade) */
  street: boolean;
  /** glazed upper panel */
  glazed: boolean;
  /** door leaf mesh in the leaf's own frame (hinge at origin, leaf along +x) */
  mesh: MeshArrays;
  /** key item id that unlocks it (keys are inventory items) */
  key?: string;
}
/** yaw = heading in the interior's local frame, 0 = facing local -z (engine heading convention). */
export interface SlotOut { id: string; role: string; x: number; y: number; z: number; yaw: number; hours?: [string, string] }
/** Gameplay/economy/time hooks. register/safe = robbery; burglary = apartment/office loot; stash = hidden storage;
 *  bed/wait = sleep or pass time; tv = playback surface; service = barber/tailor service point; deposit_box = bank. */
export type MarkerType = 'shop' | 'register' | 'safe' | 'burglary' | 'stash' | 'hide' | 'payphone' | 'wardrobe' | 'bed' | 'wait' | 'tv' | 'service' | 'deposit_box' | 'spawn' | 'prop';
export interface MarkerOut { id: string; type: MarkerType; x: number; y: number; z: number; name?: string }
/** A surface the generated-art packs can fill (menu, poster, sign, photo, packaging, calendar). Local frame, facing (nx,nz). */
export interface ArtSlotOut { id: string; use: 'menu' | 'poster' | 'sign' | 'photo' | 'packaging' | 'calendar' | 'notice'; w: number; h: number; x: number; y: number; z: number; nx: number; nz: number }
export interface LightOut { x: number; y: number; z: number; color: [number, number, number]; intensity: number; kind: 'bulb' | 'tube' | 'neon' | 'window'; cell: number; flicker?: number }
export interface MoverOut {
  /** vertical elevator cab: shaft position (local x,z), stops (local y), cab size */
  id: string; x: number; z: number; stops: number[]; w: number; d: number; yaw: number;
  mesh: MeshArrays;
}

/**
 * Traversal markup (ENGINE_REQUESTS "From interiors: 10", proposed contract, MOVEMENT.md). Mirrors the proposed shared
 * type until the engine places it in src/shared; coordinates here are interior-local (the runtime maps them to world).
 */
export type TraversalKind = 'drop_ladder' | 'ladder' | 'fe_platform' | 'fe_stair' | 'sill' | 'ledge' | 'roof_gap' | 'hatch' | 'vault' | 'fence';
export interface TraversalMark {
  kind: TraversalKind;
  a: [number, number, number]; b: [number, number, number];
  n?: [number, number]; w?: number; h?: number;
  /** 1 locked, 2 noisy (police notice), 4 one-way down */
  flags?: number;
}
export interface BuiltInterior {
  id: string;
  kind: string;
  buildingId: number;
  frame: { ox: number; oy: number; oz: number; ux: number; uz: number; nx: number; nz: number };
  cells: CellOut[];
  portals: PortalOut[];
  colliders: ColliderOut[];
  doors: DoorOut[];
  slots: SlotOut[];
  markers: MarkerOut[];
  lights: LightOut[];
  movers: MoverOut[];
  art: ArtSlotOut[];
  traversal: TraversalMark[];
  /** interior volume (m^3) and reverb class for the audio stream */
  volume: number; reverb: string;
  /** local AABB of everything */
  box: [number, number, number, number, number, number];
  stats: { verts: number; tris: number; genMs: number; bakeMs: number; cells: number };
}
