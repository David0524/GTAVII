# ENGINE_REQUESTS (vehicles stream, branch `claude/youthful-newton-py223e`)

Format per ENGINE_RESPONSES.md: `## From vehicles: N. Title` with what, why and fallback.
Status as of the engine merge at a24eda4. Already answered by the engine, so **not** requested:
- **Rapier ownership and fixed 60 Hz stepping:** `src/physics/Physics.ts`. Vehicles plug into
  the `fixed(h)` callback, which runs before `world.step()`.
- **City colliders that follow the terrain:** E6 and the Phase 2 trimesh chunks. Wheels raycast
  any non-sensor collider, and chassis contacts feed damage. No event queue is needed.

## From vehicles: 1. Vehicle input context (driving actions)
- **What:** a vehicle context in `src/input/Input.ts`:
  - analog `throttle` 0..1 and `brake` 0..1 (gamepad triggers; W/S on keyboard);
  - `steer` −1..1 (left stick; A/D);
  - buttons `handbrake`, `horn`, `headlights`, `exitVehicle`, `lookBehind`;
  - touch: stick plus BRAKE and HAND buttons.
- **Why:** `Vehicle.setInput({ throttle, brake, steer, handbrake })` needs analog values. The
  on-foot `move` vector loses trigger analog.
- **Fallback:** the test lot maps `move.y` to throttle/brake, `move.x` to steer and `jump` to
  handbrake. Keyboard braking is binary, so it always locks the wheels.

## From vehicles: 2. Reflection environment (`scene.environment`)
- **What:** a PMREM environment for the city, built from the sky plus a dark street band, and
  updated when the time of day changes.
- **Why:** chrome, clearcoat paint and glass look dead without reflections.
- **Fallback:** the test lot builds its own (`streetEnvironment()` in
  `src/vehicles/testlot/TestLot.ts`). The engine can copy it.

## From vehicles: 3. Driving camera and enter/exit hand-off
- **What:** a chase camera owned by the engine, plus enter and exit: player to seat and back.
- **Why:** the vehicle side already provides what this needs:
  - `vehicle.seatPose('driver' | 'passenger')`
  - `vehicle.object`
  - `vehicle.speed`
  - the asset extents in `vehicle.asset.lod0` (`minZ`, `maxZ`, `height`), for framing.
- **Fallback:** the test lot's chase, hood and orbit cameras.

## From vehicles: 4. Engine-sound data for the audio stream (tracking only)
- **What:** nothing for the engine to build. This records that `Vehicle` now exposes `rpm`,
  `load` (0..1) and `gear` (−1 = reverse) for the audio workstream, alongside the `skid` event
  (per-wheel slip in m/s, locked/spinning) and the `impact` event (Δv, zone).
- **Fallback:** n/a.

## From vehicles: 5. Bloom and post for lamp emissives (nice to have)
- **What:** bloom, the film grade and grain from STYLE_GUIDE §1, applied to the vehicles.
- **Why:** brake, beacon and roof lights use emissive intensity 2–6 and are meant to glow.
  Vehicles look too clean without the grade.
- **Fallback:** none needed; it just looks flatter.

## From vehicles: 6. Tyre-mark decals (nice to have)
- **What:** an engine decal system fed by the `skid` event, or adopt `src/vehicles/SkidMarks.ts`
  (one draw call, 3,000-quad ring buffer).
- **Fallback:** add `SkidMarks.mesh` to the scene and call `skidMarks.add(e)` on each skid
  event.

## From vehicles: 7. New shared vehicle classes in `src/shared/traffic.ts`
- **What:** add `ambulance`, `fire_engine`, `ladder_truck`, `mail_truck`, `ice_cream`,
  `motorcycle`, `police_motorcycle` and `bicycle` to `VEHICLE_CLASSES`.
- **Why:** these are the user's roster additions (FEATURE_AUDIT, all confirmed by the user).
  The sim needs them to spawn emergency responses, mail rounds, the summer soft-serve route and
  messengers.
- **Fallback:** `resolve()` already accepts the first five through `PROPOSED_CLASS_MODELS` in
  `src/vehicles/registry.ts`. Two-wheelers aren't in the traffic renderer yet; the sim can spawn
  them with `factory.spawnBike()`.

## From vehicles: 8. Save sections for owned vehicles
- **What:** a save section holding an array of `VehicleSave`, from `vehicle.serialize()`, and
  `TwoWheelerSave`, from `bike.serialize()`. On load, pass them to `factory.restore()` and
  `factory.restoreBike()`.
- **Why:** the user wants to buy and own cars. A save covers model, variant, trim, condition,
  mileage, damage, components, upgrades, respray, plate, trunk contents, fuel, engine state,
  locks and keys, and the exact pose. The round trip is verified exact in `shots/vehicles/report.json`
  (`systems.saveRoundTrip`), and a car is about 1.3 KB of JSON.
- **Fallback:** gameplay can keep the JSON in its own section.

## From vehicles: 9. Rider hand-off and moving platforms
- **What:**
  1. `TwoWheeler` emits `crash` with `riderPosition` and `riderVelocity` (the pre-impact
     velocity). The characters stream should spawn the ragdoll from it.
  2. Subway cars are kinematic bodies (`kinematicPositionBased`), so the player controller needs
     moving-platform support to ride them (inherit the platform's velocity).
- **Fallback:**
  1. The test lot just logs the crash.
  2. Characters can parent to `train.cars[i].group` while seated.

## From vehicles: 10. Subway track data
- **What:** the sim or interiors stream supplies the track centreline per line
  (`train.setTrack(points)` at rail-top height) and drives `train.setState({ s, doorsOpen, lights })`.
- **Fallback:** the test lot's `mode=subway` runs a straight demo track with a dwell and run cycle.

## From vehicles: 11. Naming note: `vehicle.applyHit(hit)`, not `vehicle.damage(hit)`
- **What:** the brief's contract already defines `readonly damage: number` on `Vehicle`, so the
  gameplay hit entry point is `applyHit({ point, normal, impulse, type: 'bullet' | 'impact' | 'fire', source })`.
  It returns `{ component }`.
- **Related:**
  - `impact` events now carry `vehicleId`, `otherVehicleId`, `attackerId`, `attackerDriverId`
    (set `vehicle.driverId`) and `closingSpeed`.
  - `component`, `engine` and `theft` events are new.
- **Fallback:** n/a. Please relay this to the gameplay stream.

## From vehicles: 12. Analog pedal axes for touch and pad (TOUCH_CONTROLS.md)
- **What:** `Input` exposes analog `throttle` and `brake` 0..1 from the UI's touch pedals (thumb
  position on the pedal) and from pad triggers, plus `steer` −1..1. Settings keys go in the UI's
  settings store: `steerAssist` (on for touch), `steerAssistStrength` (0.6), `autoAccelerate`
  (off) and `autoCruise` (m/s).
- **Why:** the user chose analog gas and brake pedals as the touch default. `DriverAssist`
  (`src/vehicles/assist.ts`) shapes them: pedal curves, steering smoothing, a speed-sensitive
  ratio, counter-steer by yaw stabilisation with a throttle lift, and auto-accelerate with a
  cruise governor.
- **Fallback:** the test lot maps `move.y` to throttle and brake. `?assist=1` turns the assist
  on, and `?auto=1` turns on auto-accelerate.
- **Usage:** `vehicle.setInput(assist.apply(rawPedals, vehicle, dt))` each fixed step. Call
  `vehicle.setParked(true)` when the driver gets out with the engine running; the automatic
  creeps otherwise.
