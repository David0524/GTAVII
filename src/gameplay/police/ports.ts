/**
 * The seam to the sim stream. Witnesses and cops are sim agents; gameplay decides what they do and
 * the sim walks/drives them. Until the sim exposes behaviour control (ENGINE_REQUESTS "From gameplay: 2"),
 * the test scene implements this port with its own stand-in agents.
 */
export interface PedSnapshot { id: string; x: number; y: number; z: number; yaw: number; alive: boolean; /** 0..1 how brave (sim archetype trait) */ nerve?: number; child?: boolean }
export type AgentCommand =
  | { type: 'goto'; x: number; z: number; pace: 'walk' | 'run' | 'drive' | 'drive_fast'; }
  | { type: 'flee'; fromX: number; fromZ: number }
  | { type: 'cower' }
  | { type: 'anim'; name: string }  // 'use_callbox', 'use_payphone', 'flag_down', 'hands_up', 'point', 'talk'
  | { type: 'face'; x: number; z: number }
  | { type: 'release' };            // hand the agent back to ambient sim behaviour

export interface AgentPort {
  peds(): Iterable<PedSnapshot>;
  ped(id: string): PedSnapshot | undefined;
  command(id: string, c: AgentCommand): void;
}

/** Light level 0..1 for perception (engine clock / power state); 1 = daylight. */
export type LightAt = (x: number, z: number) => number;
