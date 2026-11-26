# ENGINE_REQUESTS

Requests to the engine session. Each stream appends under its own `## From <stream>: N. Title`
headings (what, why, fallback). Answers go in `ENGINE_RESPONSES.md`.

## From sim: 1. Wire the sim into the main loop
- **What:** one `Simulation` (`src/sim/index.ts`) with the quality preset's counts (High 150/400,
  Low 40/120); call `update(dt, focus)` each frame with the player/camera position; feed
  `sim.vehicles` (`TrafficVehicleView[]`) to the vehicles renderer and `sim.peds` (`PedView[]`) to characters.
- **Why:** the sim produces agents only; rendering and physics mapping are engine/vehicles/characters jobs.
- **Fallback:** `?sim=1` runs it from `SimDebugView` with placeholder bodies (one guarded line in `main.ts`).

## From sim: 2. Feed external actors every frame
- **What:** `setExternalActors([...])` with the player (on foot `radius≈0.4, kind:'player'`; driving
  `radius≈1.3, kind:'vehicle'`) and scripted mission vehicles, with velocities.
- **Why:** traffic brakes/honks, peds dodge, `collision` / `nearMiss` events fire.
- **Fallback:** none needed for ambient life; agents just ignore the player.

## From sim: 3. Clock and weather
- **What:** call `setClock(minutesSinceMidnight)` and `setWeather()` when they change.
- **Why:** density curves, headlights and archetype schedules read them.
- **Fallback:** sim default 18:30, clear.

## From sim: 4. Audio for sim events
- **What:** horns from `honk {x, z, kind, reason, intensity}` with spatial rate-limiting (heavy traffic
  emits several per second), `hail` shouts, bus doors on `busStop`, crowd panic on `threat`.
- **Fallback:** silent events.

## From sim: 5. Parked cars in the parking lanes
- **What:** parked-car props along both kerbs of named streets (the lane graph reserves a 2.4 m
  parking lane), leaving gaps at bus stops (`graph.busStops`) and corners, where cabs and buses pull in.
- **Fallback:** empty kerb lanes (looks too clean for 1974).

## From sim: 6. Terrain data without fetch (workers and Node)
- **What:** a `setTerrainData(buf: ArrayBuffer)` in `src/shared/terrain.ts` next to `loadTerrain()`.
- **Why:** the headless sim test and a future sim worker already have the bytes; `loadTerrain` only fetches.
- **Fallback:** the test passes `terrainUrl` as a base64 `data:` URL (works in Node fetch).

## From sim: 7. Real-device sim timing
- **What:** open `?sim=1` on a desktop GPU and a phone and read the HUD (`update … ms avg/p95`).
- **Why:** this container is CPU-only; budget is ≤ 2 ms main thread.
- **Fallback:** move the sim to a worker (it has no DOM/three.js dependency).

## From sim: 8. Vehicle classes for tow trucks and street sweepers
- **What:** add `tow_truck` and `street_sweeper` to `VEHICLE_CLASSES` in `src/shared/traffic.ts`.
- **Why:** parking enforcement tows cars and sanitation sweepers run the alternate-side schedule.
- **Fallback:** the sim uses `box_truck` (tow) and `garbage` (sweeper) with `state` 'onScene'/'drive'.
