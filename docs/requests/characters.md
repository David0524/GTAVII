# ENGINE_REQUESTS

Workstreams append requests here on their own branch under `## From <team>: N. Title`
(what, why, fallback). Answers appear in `ENGINE_RESPONSES.md` on the engine branch.

## From characters: 1. Appearance sheets for the cast (tracking)
- **What:** track the narrative team's appearance data as the source for hero characters.
  The leads and principals now have `appearance` blocks in `content/cast/*.json`
  (narrative commit 7fffd4f), and the leads are built from them in `src/characters/heroes.ts`.
  Still needed:
  - per-act wardrobe for the 12 principals in the same detail as the leads;
  - confirm that small personal props (Teddy's key ring and medal, Delphine's bracelet and
    camera bag, Nick's worry beads and signet ring) are wanted as visible props. They're
    noted but not modelled yet.
- **Why:** the brief asks for hero looks to come from narrative, never invented.
- **Fallback:** principals are generated from their `visual` block, with seeds fixed per
  character id.

## From characters: 2. Ground query for foot IK and footstep surfaces
- **What:** a cheap `groundAt(x, z) → { y, surface }` that includes curbs, steps and stoops,
  for `factory.setGround(fn)`. `surface` is one of asphalt, concrete, stone, brick, metal
  (grating), wood or water (puddle).
- **Why:**
  - foot IK on 0.15 m curbs and stairs;
  - footstep events with a surface for the audio workstream.
- **Fallback:** `heightAt(x, z) + CURB_HEIGHT` from `src/shared/terrain.ts`, with the surface
  defaulting to concrete. This needs to know whether a point is on a sidewalk or the roadway.

## From characters: 3. Wiring the character factory (integration)
- **What:**
  - call `createCharacterFactory({ quality })` once;
  - each frame, the player drives `Character.setLocomotion()` (velocity, grounded, heading,
    mode) from the Rapier controller and sets `object.position` to the capsule's feet, then
    calls `update(dt)`;
  - call `crowd.setAgents(sim.peds)` each frame, and `crowd.setCamera(camera)` once;
  - call `factory.setClimate({ heat, wetness })` from time of day and weather.
- **Why:** the brief says the engine chat wires it in. The test scene is `?characters=1`.
- **Fallback:** none needed; the test scenes exercise the API stand-alone.

## From characters: 4. Mirror the character fabric scans into ART_SOURCES.md
- **What:** add the six Poly Haven CC0 fabric scans listed in `docs/CHARACTER_SOURCES.md` §5
  (files `public/characters/fabric_{a,b}_{hi,lo}.webp`) to `docs/ART_SOURCES.md`.
- **Why:** `docs/briefs/ART_ASSETS.md` asks for one shared source log; this workstream may not
  edit shared files.
- **Fallback:** the full record (URLs, licence, edits) is already in `docs/CHARACTER_SOURCES.md`.

## From characters: 5. Root-motion and IK contract for the movement brief (please confirm or amend)
- **What:** a split of ownership for `docs/briefs/MOVEMENT.md`, so the controller and the animation
  can't fight each other. Proposed:
  1. **Free locomotion is capsule-driven** (GTA-style responsiveness).
     - The controller moves the capsule from input using acceleration, deceleration and turn-rate
       curves that characters supply as a tuning table (`characters.locomotionTuning`: walk, jog,
       run and sprint; start, stop and pivot times).
     - The animation matches the capsule by stride warping and plays start, stop, pivot and skid
       clips from events the controller emits (`start`, `stop`, `pivot` with angle, `skid`).
     - No root motion in free locomotion.
  2. **Steps, kerbs and stairs:** the controller keeps its autostep and snap (physics stays exact).
     - Characters smooth only the *visual* pelvis with a critically damped spring, and plant feet
       with foot IK via request 2's ground query, so a 0.4 m step dips and recovers without a pop.
     - Wanted from the engine: a `step` event `{ rise, position }` and a `stairs` flag when the
       ground under the capsule is a stair run (traversal markup or a mesh tag), to switch to a
       stair gait.
  3. **Traversal is detection by the engine, motion by the animation.**
     - The controller detects vault, climb, chain-link fence, ladder, drop ladder, hang-drop, roof gap
       and turnstile, and emits `traversal { kind, ledgePoint, ledgeNormal, height, topY, landingPoint }`.
     - Characters return a root-motion curve for that kind and height (sampled offsets over time) and
       hand-IK targets on the ledge, rung or rail.
     - The controller applies the curve to the capsule with collision off or shrunk, then hands
       control back on `traversalEnd`.
     - This replaces today's fixed 0.35 + 0.25·rise lerp in `stepClimb`.
  4. **Ragdoll:** the engine owns the Rapier bodies (from `src/shared/rapier.ts`).
     - Characters provide the body and joint definitions from the skeleton (capsule sizes, joint
       limits), the powered-ragdoll target pose each frame (animation-driven, with stiffness
       blended down on impact), and the get-up choice (front or back, from pelvis orientation) once
       the bodies settle.
  5. **Vehicles:** the engine provides per-door handle positions, seat transforms and the door hinge
     state. Characters play enter, exit and carjack clips with hand IK on the handle and drive the
     door angle through an event the engine applies.
- **Why:** the brief splits detection (engine) from animation and IK (characters). Without a
  contract, autostep pops, traversal lerps slide the feet, and ragdoll ownership is unclear.
- **Fallback:** until the engine adopts this, the characters test course drives a local stand-in
  controller with the same events, so the animation side can be built and measured on its own.
