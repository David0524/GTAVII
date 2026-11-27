# ENGINE_REQUESTS

Requests to the engine session. Each stream appends under its own `## From <stream>: N. Title`
headings (what, why, fallback). Answers go in `ENGINE_RESPONSES.md`.

## From sim: 1. Wire the sim into the main loop
- **What:** one `Simulation` (`src/sim/index.ts`) with the quality preset's counts (High 150/400,
  Low 40/120 at least; see item 10 for the visual bar); call `update(dt, focus)` each frame with the
  player position and `setView(camX, camZ, fwdX, fwdZ, fovDeg)` with the camera; feed
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
- **Update (VISUAL_BAR: "parked cars on every kerb"):** the sim can supply the positions instead, so the
  kerb rules and the parked cars agree (gaps at hydrants, bus stops, corners, no-standing avenues at rush
  hour, the alternate-side cleaning side empty in its window). Proposed: `sim.parkedCars(x, z, r)` →
  `{ x, z, yaw, vclass, variant }[]`, deterministic per place and day, as static instances (no per-frame
  sim cost). The sim's kerb uses (cab pickups, siren gutter runs, service stops) then move to the gaps.
  Say if you'd rather place them yourselves; otherwise the sim does it next.

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
- **Status:** shipped by the engine (84f71af); the sim now spawns `tow_truck` and `street_sweeper`.

## From sim: 9. Traffic-signal heads synced to the sim (Phase 3 block A)
- **What:** place signal heads from `sim.signalHeads()` (static, call once after load) and colour them
  from `sim.signalStates(out?: Uint8Array)` each frame (one byte per head, `SignalState`: 0 dark,
  1 red, 2 yellow, 3 green; pedestrian heads 4 DON'T WALK, 5 flashing DON'T WALK, 6 WALK).
  - Vehicle heads, one per signalised approach: `x,z` is the kerb corner on the right of the approach
    at the stop line, `altX,altZ` the other corner (one-way avenues also had far-side/left heads),
    `faceYaw` the way the lenses face (towards approaching drivers; heading = (−sin, −cos)), `stopX,stopZ`
    the stop-line centre, `street` the street it governs.
  - Pedestrian heads at both ends of each signalised crosswalk, facing across.
  - 280 vehicle and 956 pedestrian heads at 149 junctions.
- **Why:** the sim signalises OSM `traffic_signals` junctions plus grid crossings it synthesizes, so
  placing heads from the POIs alone would leave signals the cars obey without heads (and vice versa).
  States are a pure function of sim time, so heads can't drift from what traffic does; brownouts
  (`setSignalPower`) read as dark.
- **Fallback:** none needed; the existing `debugStopLines()` (renamed from the old debug-only
  `signalStates`) still feeds `?sim=1`.

## From sim: 10. Density budgets for the visual bar ("a street must never look empty")
- **What:** pass `setView` every frame (item 1) and use at least High 150/400 and Low 40/120; the sim
  now spreads the budget at a target density around the focus (one vehicle per ~13 m of lane, a
  pedestrian per ~2 m of sidewalk at rush hour), so a smaller budget shrinks the populated disc rather
  than thinning the street. Measured within 60 m (test `density`): rush hour at Herald Square, High 30
  vehicles and 97 pedestrians, Low 13 and 56; midday Times Square, High 47 and 151.
- **Why:** before this, the same budget was spread over a fixed 260 m ring and only ~5 vehicles were
  within 60 m of the camera at rush hour.
- **Ask:** if the phone frame budget allows, raise Low to 90/240: below ~90 vehicles the populated disc
  hits its 110 m floor and the near field thins (13 vs 30 within 60 m). Far traffic beyond the disc
  (long avenue views) needs impostors or LOD cars on your side; the sim can expose lane flow per avenue
  for that if useful.
