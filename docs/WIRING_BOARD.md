# Integrated board: game-loop wiring (2026-11-27)

The first look at all seven streams running together in `main.ts` (docs/HANDOFF_WIRING.md, steps 1–7).

**Capture:** headless Chromium on SwiftShader, WebGL2, Low preset, 1280×720 (`tools/dev/wireSmoke.ts`).
Low is the phone tier, so these frames are the floor, not the target look.
Shots are in `shots/wiring/`.

| Shot | What it shows |
|---|---|
| `onfoot_madison_sq.jpg` | On foot at E 23rd and 5th, 12:30. The lead's real body (no capsule), the crowd from the sim, traffic, and sim signal heads. |
| `A_42nd_noon.jpg` | W 42nd St west of 7th Ave, 12:30. Traffic in both directions, a bus, pedestrians on both sidewalks. |
| `D_herald_noon.jpg` | Broadway at Herald Square, 12:30. A sim signal head lit red facing the camera, a queue at the light. |
| `D_herald_2300.jpg` | The same view at 23:00. Taillights, a street-light pool, lit windows, storefront spill. |
| `park_ave_s_28th_top.jpg` | Park Ave South at E 28th, top-down. |

**Measured (Low, SwiftShader):**
- 34–40 cars and 51–130 pedestrians around the camera.
- Sim 1.3–2.7 ms per frame, gameplay 0.3 ms, audio 1.3 ms (20 real voices, no clipping, no NaNs).
- Load test: title 14.5 s against a 15 s budget; New Game to first frame 0 s.

## Honest critique

1. **The streets finally feel inhabited.**
   - Moving period cars with the right silhouettes, a bus, and pedestrians walking both sidewalks.
   - Signals the cars actually obey.
   - This is the biggest single step toward the look target so far.
2. **Storefronts at night read as flat beige panels.**
   - In `D_herald_2300.jpg`, the ground-floor glass on the right glows evenly with no interior, no
     signage and no falloff.
   - That is the facade shader's storefront term at night plus the spill meshes.
   - Fix it in the shared PBR/foundation pass: interior parallax or a dim lit-room card, mullions, and
     lower emission with a warmer, uneven spread.
3. **Park Ave South is a divided road; in 1974 it wasn't.**
   - OSM maps today's street as two one-way carriageways about 12 m apart (x≈286 and 298), and the
     gap renders as a concrete median.
   - Fix: a pipeline pass that merges same-name one-way pairs closer than 15 m into one two-way
     roadway, for Park Ave South only.
   - Park Avenue north of Grand Central did have planted medians in 1974; keep those.
   - Queued for the next data pass, with the sidewalks test extended to cover it.
4. **The shadowed sides of streets are too dark at noon** (D, right-hand facade). This is the known
   occlusion and fill balance item from VISUAL_BAR, for the probe/GI work in the FREE_ASSETS plan.
5. **Characters are lit flatly** next to the cars: no rim light or bounce. The shared lighting
   foundation covers this too (interiors request 9 asks for the same).
6. **Street-sign accuracy check: not done yet.** It needs 1970s reference photos for typeface,
   abbreviations, blade proportions and mounting. It is next on the list, with the landmark signage
   sweep.
7. **Fixed after oversight's review (1fe5e00):**
   - `onfoot_madison_sq.jpg` and `A_42nd_noon.jpg` are re-shot on the post-merge build. They show
     Design A: the aerial minimap with fog of war, the location wipe and the clock.
   - Free-camera key hints now only appear with `?debug=1`.
   - Low density is now 90/240. That gives 54–57 cars and 200–246 pedestrians around the camera, and
     sim cost rises to 3.4 ms headless, over the 2 ms budget. The phone bench decides.
   - Parked cars on every kerb wait on sim's `parkedCars()`.

## vs GTA V / GTA VI / RDR2

- **Population:**
  - GTA V's Low still fills its avenues. Here, 40 cars and about 120 pedestrians cover the near field
    on Low, which reads as a quiet weekday.
  - Sim 10 asks for 90/240 on phones; decide that with the on-device bench, now that `?bench=1` has
    "no traffic", "no crowd" and "sim paused" cases.
- **Traffic behaviour:** queueing at red lights and the bus are on par for the genre. GTA's tell is
  that cars react to the player (honks, swerves). The sim has honks and near misses, but nothing
  visual or audible is attached to them yet.
- **Night:**
  - GTA V's night streets are carried by layered emissive signage and wet-look ground.
  - We have the light sources (lamps, taillights, windows), but the storefronts (item 2) and the
    ground response (no reflections) are a generation behind.
  - RDR2's lesson applies: fewer, warmer, uneven lights beat uniform glow.
- **Bodies:** the leads now read as people at third-person distance, but the shading falls short
  of RDR2's skin and cloth response. That is the same lighting-foundation gap as item 5.

## Not wired yet (next)

- **Doors and interiors hookup:** `bindDoors`, facade cuts, Tier C.
- **Player driving:** `bindVehicles` and a stolen sim car.
- **Mission and trigger runtime:**
  - talkables;
  - `discover` events with `notify`/`mission`;
  - `missionEnd`, using gameplay's `missionBegin`/`missionLines`.
- **E17:** the Grand Central PLAYABLE annex.
- **The touch-only combined run on a phone.**
