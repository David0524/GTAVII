/**
 * Web Worker entry for the sim. Engine side:
 *   const worker = new Worker(new URL('./sim/sim.worker.ts', import.meta.url), { type: 'module' });
 *   const sim = new RemoteSimulation(worker as unknown as Port, { seed, maxVehicles, maxPeds, baseUrl });
 *   await sim.load();  // then per frame: sim.setView(...); sim.setExternalActors([...]); sim.update(dt, focus)
 * Terrain: the worker loads it itself through `loadTerrain` (same URL as the main thread).
 */
import { Simulation } from './index';
import { serveSimulation, type Port } from './remote';

serveSimulation(self as unknown as Port, (opts) => new Simulation(opts));
