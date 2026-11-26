# Engine requests from the vehicles workstream

The vehicles code changes only one shared file: a single guarded line in `src/main.ts` that
loads the `?vehicles=1` test scene. Everything below is for the engine session to decide.

## Needed for integration
1. **Rapier world ownership and stepping.** Call `await RAPIER.init()` once. Step the world at a
   **fixed 60 Hz** with an accumulator, and call `vehicle.update(1/60)` once per step (before or
   after `world.step()`; both work). The tyre model is tuned at 60 Hz; variable dt works but
   handles worse.
2. **City colliders.** Wheels are raycast against any non-sensor collider, so curbs just need to
   exist as geometry (cuboids or trimesh of the 0.15 m sidewalk edge). Chassis contacts with
   static colliders feed the damage system automatically, so no event queue is needed.
   - Please give lamp posts, hydrants and mailboxes colliders. Sensors are ignored by the wheels.
3. **`scene.environment`.** Chrome, glass and clearcoat look dead without a reflection
   environment. The test lot builds a small PMREM "street" equirect (`streetEnvironment()` in
   `src/vehicles/testlot/TestLot.ts`). The city should provide its own, ideally from the sky plus
   a dark street band.
4. **Input mapping (`src/input/Input.ts`).** Driving needs these actions: throttle (analog
   0..1), brake/reverse (analog 0..1), steer (analog −1..1), handbrake (button), headlights,
   horn, enter/exit. The test lot currently reads `move.y`, `move.x`, and `jump` as the
   handbrake. For touch, the brief's layout works: stick to steer and throttle, plus BRAKE and
   HAND buttons. Gamepad triggers should map to throttle and brake.
5. **Camera.** The chase camera lives in the test lot, so the engine should own the real one.
   `vehicle.seatPose('driver')` gives the first-person seat matrix.

## Nice to have
- **Bloom** for lamp emissives. Brake and beacon lamps use emissive intensity 2–6, which is
  meant to glow.
- **Shadows:** vehicles set `castShadow`. The test lot uses one 2k directional map that follows
  the car.
- **Tyre marks:** `SkidMarks` (one draw call, 3,000-quad ring buffer) is optional. It can be
  replaced by an engine decal system fed from the `skid` event (per-wheel world positions plus
  slip).
- **Audio hooks:** the `skid` event (slip m/s per wheel, locked/spinning flags), `impact` (Δv,
  zone), `physics.rpm` and `physics.gear` are exposed for engine sound.
- **A WebGPU check on real hardware.** Every vehicle screenshot so far is WebGL2 on SwiftShader.

## Build note
Rapier's compat build inlines its WASM, so the test-lot chunk is about 4.4 MB (1.7 MB gzip).
Once the engine imports Rapier in the main bundle, the vehicles code adds about 100 KB.
