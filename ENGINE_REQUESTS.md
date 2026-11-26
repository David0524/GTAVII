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
