# ENGINE_REQUESTS: from the sim workstream

What the ambient sim needs from the engine session. Each item has a fallback that already works.

## 1. Wire the sim into the main loop (Phase 5)
- **What:** Construct one `Simulation` (`src/sim/index.ts`) with the quality preset's counts
  (High 150/400, Low 40/120), call `update(dt, focus)` once per frame with the player (or camera)
  position, and map `vehicles` / `peds` (`AgentView`) onto real bodies.
- **Fallback:** `?sim=1` runs it from `SimDebugView` with placeholder bodies (one guarded line in `main.ts`).

## 2. Feed external actors every frame
- **What:** `setExternalActors([...])` with the player (on foot: radius ~0.4, `kind: 'player'`; driving:
  vehicle radius ~1.3, `kind: 'vehicle'`) and any scripted mission vehicles, with velocities.
- **Why:** traffic brakes/honks for them, peds dodge, `collision`/`nearMiss` events fire.

## 3. Clock and weather
- **What:** call `setClock(minutesSinceMidnight)` and `setWeather()` when the world clock/weather change.
  Density curves and archetype schedules already read them. Default clock is 18:30 (the dusk spawn).

## 4. Audio for sim events
- **What:** play horns from `honk {x, z, kind, reason, intensity}` with spatial rate-limiting (heavy
  traffic produces several per second), plus `hail` whistles/shouts, bus kneel/doors on `busStop`.

## 5. Parked cars and kerb furniture in the parking lanes
- **What:** parked-car props along both kerbs (the lane graph reserves a 2.4 m parking lane on every
  named street) with gaps at bus stops (`graph.busStops`) and corners. Cabs and buses pull into
  this lane today, so props must leave the bus-stop gaps clear.

## 6. Real-device timing
- **What:** run `?sim=1` on a desktop GPU and a phone and read the HUD (`update … ms avg/p95`).
  If High exceeds 2 ms on device, the sim has no DOM/three.js dependency and can move into a
  worker unchanged (post `AgentView` arrays back each frame).
