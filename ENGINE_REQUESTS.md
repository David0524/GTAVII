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
