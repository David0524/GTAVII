# Brief: vehicles (original 1970s designs + driving physics) for "Tenderloin '74"

You're a parallel workstream on a browser open-world game set in Manhattan, summer 1974 (three.js
WebGPU 0.187.0, TypeScript, Vite, Rapier `@dimforge/rapier3d-compat` 0.21.0). The engine session
owns the city, the player, rendering, the UI and integration. **You own the vehicles: their look
and how they drive.**

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch.
2. Read `PROGRESS.md`, `docs/STYLE_GUIDE.md` (if present) and the photo references in
   `references/` (`catalog.json` has the credits). These are real 1973–74 photographs of these
   exact streets. Study the cars, cabs, trucks and buses in them.
3. Keep `docs/VEHICLES_PROGRESS.md` as your source of truth, read at the start and updated at
   the end of every session.
4. Ask the user before major architectural decisions or before cutting any scoped feature.

## Hard rule: everything is original
- **No real makes, models, logos, badges or trademarks.**
- **No recognisable replicas** of specific real vehicles: not a renamed Checker Marathon, a GM
  "fishbowl" bus, a Cadillac, or anything like them.
- **Capture the era's design language, not specific products.**
  - Long hoods, full-width chrome bumpers, quad round or rectangular headlights, vinyl tops.
  - Opera windows, hardtops without B-pillars, wide whitewalls or hubcaps, and fender skirts on
    luxury cars.
  - 5-mph bumpers arrive in 1973–74.
  - Earth-tone paint: avocado, harvest gold, rust, bronze metallic, cream, brown, white.
- Invent manufacturer and model names with period flavour, and keep a registry in
  `docs/VEHICLE_REGISTRY.md` (name, class, era-plausibility note, trademark search done).

## Roster (minimum)
Each vehicle is parametric, so one generator yields many variants:
- **Full-size 4-door sedan,** with a police variant (period two-tone with generic markings and
  a bubble light; no real department crest).
- **2-door personal-luxury hardtop.**
- **Compact sedan.**
- **Station wagon** with woodgrain.
- **Yellow taxi:** an original body with roof light and door fare decals in period style. No
  checkerboard band and no real fleet names.
- **City bus:** an original design with period livery and a destination sign.
- **Box delivery truck** and **step van.**
- **Garbage truck.**

## Modelling
- **A procedural generator** (`src/vehicles/gen/`) that builds low-poly but well-proportioned
  bodies from parameters: wheelbase, overhangs, beltline, greenhouse, roof shape, grille,
  lamps, bumpers, trim. Art direction over polygon count; the target look is a gritty 1970s
  crime film shot on 35mm.
- **LODs:** LOD0 ≈ 4–8k triangles, LOD1 ≈ 1k, LOD2 = a box impostor. Instancing-friendly:
  variants via per-instance colour and material params.
- **Materials:** PBR via three.js node materials (TSL-compatible, since the renderer is
  WebGPU with a WebGL2 fallback).
  - Paint with clearcoat and a dirt and dust mask.
  - Chrome, glass with rain-streak support, rubber.
  - Emissive head, tail and indicator lights. A brake-light flag is exposed.
- **Damage states:**
  - Bent panels via vertex morph zones (front, rear, sides).
  - Popped hood, broken glass and lamps, smoke stage, fire stage. Wheels detach later
    (stretch goal).

## Physics
- **Rapier raycast vehicle** (or a custom raycast suspension on a rigid body):
  - Per-wheel suspension, tyre slip curves, weight transfer, handbrake.
  - Skid detection that emits events (for audio and tyre marks).
  - 1970s handling: soft and wallowy, with body roll, nose dive under braking and squat
    under acceleration.
- **Collision response** feeds the damage states.
- **Develop on your own test scene** (`?vehicles=1`): a flat lot plus a grid of 20 m blocks
  with curbs at 0.15 m. The engine session will swap in the city's colliders.

## Integration contract
```ts
// src/vehicles/index.ts
export function createVehicleFactory(opts: { quality: 'low' | 'medium' | 'high' | 'ultra' }): VehicleFactory;
interface VehicleFactory {
  models: readonly { id: string; class: string; displayName: string }[];
  spawn(world: RAPIER.World, scene: THREE.Object3D, modelId: string, pose: { x: number; y: number; z: number; yaw: number }, variant?: number): Vehicle;
  /** Visual-only instanced proxies for AI traffic far from the player (no physics body). */
  createTrafficRenderer(maxInstances: number): { setInstances(list: { modelId: string; variant: number; x: number; y: number; z: number; yaw: number; brake: boolean }[]): void; object: THREE.Object3D };
}
interface Vehicle {
  setInput(i: { throttle: number; brake: number; steer: number; handbrake: boolean }): void; // -1..1 / 0..1
  update(dt: number): void; readonly object: THREE.Object3D; readonly body: RAPIER.RigidBody;
  readonly speed: number; readonly damage: number; seatPose(seat: 'driver' | 'passenger'): THREE.Matrix4;
  on(type: 'skid' | 'impact' | 'destroyed', cb: (e: any) => void): void; dispose(): void;
}
```
- **Input is device-agnostic.** The engine's `src/input/Input.ts` maps keyboard, gamepad and
  touch (landscape mobile) to actions, and you take `setInput` values only.
- **Don't edit shared files** except one guarded line in `src/main.ts` for your test scene. Put
  requests for the engine in `docs/ENGINE_REQUESTS.md`.

## Budgets
- **Player vehicle:** physics under 0.5 ms per frame.
- **AI traffic:** 150 instanced visual vehicles under 1.5 ms CPU on High; 40 on mobile Low.
- **Measure honestly.** Headless numbers in this container are software-rendered, so label
  them as such.

## Done means
- Turntable screenshots of every model, plus a "period street" lineup next to matching
  reference photos.
- Driving test videos or frames: a skid, a 30 mph impact, the damage stages.
- An honest critique in VEHICLES_PROGRESS.md against the references and the originality rule.
