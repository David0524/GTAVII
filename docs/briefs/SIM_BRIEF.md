# Brief: ambient simulation (traffic AI + pedestrian AI) for "Tenderloin '74"

You're a parallel workstream on a browser open-world game set in Manhattan, summer 1974 (three.js
WebGPU, TypeScript, Vite). The engine session owns rendering, the city, the player, the UI and
integration. The narrative session owns story and content. **You own the ambient simulation:
traffic and pedestrians as generic agents.** No story, no named characters, no lore.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch.
2. Read `PROGRESS.md`, `DATA_SOURCES.md`, `NARRATIVE_BRIEF.md` (the NPC archetype slot schema is
   there), `src/shared/geo.ts` (world frame) and `src/shared/chunkFormat.ts`.
3. Keep `docs/SIM_PROGRESS.md` as your source of truth: done, next, decisions, known issues.
   Read it at the start of every session and update it at the end.
4. Ask the user before major architectural decisions or before cutting any scoped feature.

## What already exists (use it, don't rebuild it)
- **`public/data/streets.json`:** every drivable centreline, `{ n: name, c: OSM class, w: roadway width m,
  o: oneway (+1 = polyline order, -1 = reverse, 0 = two-way), p: [x,z,...] }`. These are **1974
  directions** (Fifth southbound, Sixth northbound, Seventh southbound, Eighth northbound, Broadway
  southbound; 23rd/34th/42nd two-way).
- **Chunk files `public/data/chunks/*.bin`:** POIs (`PoiKind.Signal` = traffic signals,
  `PoiKind.SubwayEntrance`) and ground polygons (`GroundKind.Sidewalk/Road/Park/Lot`).
  Read them with `readChunk()`.
- **World frame:** metres, +X = crosstown east, −Z = uptown, +Y up. Sidewalk top is
  y = 0.15, roads are y = 0.
- **`world.json`:** region bounds, chunk index, spawn point, landmark list.

## Scope
1. **Lane graph build step** (`tools/pipeline/lanes.ts`, `npm run data:lanes` → `public/data/lanes.bin`):
   - Lanes from roadway width (~3.3 m lanes plus a parking lane each side where wide enough).
   - Intersections with turn connectors, from `streets.json`.
   - Signal groups from the Signal POIs.
   - Crosswalks and a sidewalk walk graph from sidewalk polygon edges and corners.
   - Deterministic, documented, and stored in a compact binary file, like the chunks.
2. **Traffic:**
   - Agents follow lanes and obey the 1974 one-ways.
   - Signal phases with avenue progression (the "green wave" up the avenues). **No right on red**
     (NYC rule).
   - Car-following (IDM or similar), lane changes, gap acceptance at turns, yielding to
     pedestrians in crosswalks.
   - Period behaviour: double-parked delivery trucks blocking a lane, cabs cutting to the curb
     to pick up and drop off, horn-happy impatience (emit events; audio is someone else's job),
     buses stopping at stops.
   - Spawning and despawning in a ring around a focus point; density by time of day and
     district (hooks only; the clock comes later).
3. **Pedestrians:**
   - Walk the sidewalk graph with simple local avoidance (RVO/ORCA-lite).
   - Wait at crosswalks, plus some **jaywalking**, which was very 1974.
   - Loiter spots (stoops, storefronts, subway entrances) and enter/exit points for subway
     entrances.
   - Flee or scatter reactions to a threat event at a point.
4. **NPC archetype slots:** consume the `content/npc_archetypes/*.json` schema from
   `NARRATIVE_BRIEF.md` (behaviour, schedule, density, props, barks id). The narrative team
   writes the content; you implement the runtime that honours it. Ship 4–6 neutral built-in
   archetypes (commuter, worker with handcart, shopper, loiterer, beat cop, vendor) as
   defaults and test data.
5. **External actors:** an API for the player (on foot or driving) and scripted vehicles to be
   obstacles agents react to: brake, swerve, honk, flee.

## Integration contract (keep to it; the engine session wires it in)
```ts
// src/sim/index.ts
export interface AgentView { id: number; kind: 'car' | 'cab' | 'truck' | 'bus' | 'ped'; archetype: string;
  x: number; y: number; z: number; yaw: number; speed: number; state: string; variant: number }
export class Simulation {
  constructor(opts: { seed: number; maxVehicles: number; maxPeds: number; baseUrl?: string });
  load(): Promise<void>;                        // lanes.bin + chunk POIs
  update(dt: number, focus: { x: number; z: number }): void;   // fixed internal timestep, deterministic for a given seed
  readonly vehicles: readonly AgentView[]; readonly peds: readonly AgentView[];
  setExternalActors(actors: { id: string; x: number; z: number; vx: number; vz: number; radius: number; kind: 'player' | 'vehicle' }[]): void;
  emit(event: { type: 'threat' | 'blockLane' | 'closeStreet'; x: number; z: number; radius?: number; until?: number }): void;
  on(type: 'honk' | 'collision' | 'nearMiss' | 'hail', cb: (e: any) => void): void;
  setClock(minutesSinceMidnight: number): void; setWeather(w: 'clear' | 'overcast' | 'rain'): void;
}
```
- **Rendering stays out of the sim.** Provide `src/sim/debug/SimDebugView.ts` that draws
  agents as instanced placeholder boxes and capsules (generic bodies only), lane lines and
  signal states, behind `?sim=1`.
- Your only edit to `src/main.ts` is one guarded line that calls an `attachSimDebug(scene,
  camera)` you export. Don't change any other shared file. If you need something from the
  engine, write it in `docs/ENGINE_REQUESTS.md`.
- No Rapier dependency. Agents are kinematic, and the engine maps them to physics later.

## Budgets
- **High preset:** 150 vehicles + 400 pedestrians within **≤ 2 ms per frame** on the main
  thread. Move the sim to a worker if needed.
- **Mobile Low preset:** 40 vehicles + 120 pedestrians within ≤ 2 ms.
- Measure and report real numbers. Headless timings in this container are CPU-only; label
  them as such.

## Done means
- A deterministic headless test that runs 10 simulated minutes and asserts zero agents
  off-lane or off-sidewalk, zero wrong-way driving, zero red-light running, and no deadlock
  (gridlock auto-resolves).
- Playwright screenshots with `?sim=1` at Herald Square, the Flatiron spawn and 42nd St &
  Seventh Ave, plus an honest critique in SIM_PROGRESS.md.
- Generic placeholder bodies only. No real brands. Nothing narrative.
