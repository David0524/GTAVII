/**
 * Interiors workstream: public entry (contract in docs/briefs/INTERIORS_BRIEF.md).
 *
 *   const interiors = createInteriors({ quality, content: { interiors, places } });
 *   await interiors.ready;                       // index loaded (doorsForChunk is valid after this)
 *   scene.add(interiors.object);
 *   // per frame:
 *   interiors.update(dt, playerPos, worldClock, camera);   // camera enables portal culling
 *   interiors.colliders(physics.world);
 *
 * Additions beyond the brief's contract (requested in ENGINE_REQUESTS.md):
 *   ready: Promise<void>, update(..., camera), exteriorHidden, ensure(id), facadeOpenings(), stats.
 */
import { Interiors, type InteriorsOpts } from './runtime/Interiors';

export { Interiors };
export type { DoorRec } from './indexFormat';
export { facadeOpenings, groundCeiling, unitEra } from './facade';
export function createInteriors(opts: InteriorsOpts): Interiors { return new Interiors(opts); }
