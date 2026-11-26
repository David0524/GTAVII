# PROGRESS: Tenderloin '74 engine & city

Source of truth across sessions. Read this first; update it last.

## Status
| Phase | State |
|---|---|
| 1. Scaffold, data pipeline, untextured city, Flatiron spawn | **Done** (see critique below), plus landscape mobile support (added on request) |
| 2. Walkable player, camera, collision | Next |
| 3. Rendering pipeline + facade generation | — |
| 4. Vehicles & driving | — |
| 5. Traffic, pedestrians, audio | — |
| 6. Weather, day/night, polish, optimisation | — |
| 7. Hook APIs + docs for the narrative team | Contract drafted in NARRATIVE_BRIEF.md; implementation pending |

## Architecture
```
tools/pipeline/   fetch.ts (raw downloads) -> build.ts (chunks); era1974.ts = all period corrections; clip.ts = Clipper wrapper
tools/shots/      capture.ts: headless Playwright rig, fixed viewpoints, frame-time report -> shots/<phase>/
public/data/      world.json (manifest, spawn, heroes, stats), streets.json (centrelines + 1974 one-ways),
                  skyline.bin (instanced distant towers + WTC), chunks/<i>_<j>.bin (T74C binary, 200 m chunks)
src/shared/       geo.ts (grid-aligned world frame, projection), chunkFormat.ts (binary reader/writer, used by both sides)
src/engine/       renderer.ts (WebGPU -> WebGL2 fallback), quality.ts (presets)
src/world/        World.ts (streaming, LOD, worker pool), chunkWorker.ts, meshBuilder.ts (extrusion/earcut/curbs),
                  Skyline.ts, Atmosphere.ts (sky, sun by true compass bearing, haze)
src/input/        Input.ts: device-agnostic actions (keyboard/mouse and touch both write here)
src/camera/       FlyCamera.ts (Phase 1 debug cam; becomes photo-mode base)
src/ui/           DebugHud.ts, Minimap.ts (from real streets), TouchControls.ts (landscape mobile)
```
Planned for later phases: `src/player/` (Rapier character), `src/vehicles/`, `src/sim/` (traffic/peds),
`src/audio/`, `src/render/` (TSL post stack, facade materials), `src/hooks/` (mission/trigger/spawn/interior/
archetype/save APIs), `content/` (owned by the narrative team).

## Decisions (and why)
- **The world is aligned to the Manhattan grid** (rotated 29.11° from true north, re-measured
  every build). Avenues run along Z and streets along X. This makes chunks, lanes, the minimap and
  stand-in slicing trivial. The sun uses true compass bearings via `TRUE_NORTH`.
- **Chunks store semantic data, not meshes.** They hold footprints with height/year/use/style,
  ground polygons and POIs, and meshes are built in a worker at load. Phase 3 facade generation
  can then change without rebuilding data. The whole city is 307 KiB (88 chunks).
- **Ground model:** everything that isn't roadway is raised sidewalk (0.15 m), and roads are
  buffered centrelines cut out of it. Curbs fall out of the polygon edges, and sidewalks
  automatically meet the real building lines.
- **Clipper (integer) instead of polygon-clipping.** The latter threw robustness errors on real
  data.
- **OSM `building:part` replaces the NYC footprint for towers** when the parts cover at least
  30% of it, which gives real setbacks (e.g. Empire State, 11 tiers plus mast). A podium is
  kept up to the lowest part base.
- **Flat terrain for now.** Real relief here is about 5–15 m. Adding it later means one height
  per ground vertex from the footprint `ground_elevation` field. **Needs your call before
  Phase 2** (collision depends on it).
- **Three.js 0.187.0 and Rapier 0.21.0, pinned exactly.** WebGPU is used when `navigator.gpu`
  exists; `?webgl=1` forces WebGL2.
- **Mobile:** landscape only, with a floating left stick, a right-thumb look area and big buttons
  on the right edge. Portrait shows a rotate prompt. Fullscreen plus orientation lock where
  supported (not iOS). Phones default to the Low preset with DPR capped at 1.5. All gameplay
  reads `Input` actions, so later controllers get touch for free.

## Period accuracy (done after Phase 1, on request)
Every building is now dated from three sources (PLUTO, footprint, OSM), with ordered conflict
rules, height-for-era sanity checks and reviewed manual rulings. Lots with no footprint get
1974 treatments, modern OSM parts are dropped, and the skyline is dated the same way (the Pan
Am Building has been added). The method, results and the list of 46 flagged rows are in
`docs/PERIOD_AUDIT.md`, and `docs/period_audit.csv` has one row per building.
Remaining limits: rooftop additions on old buildings (only 1107 Broadway is corrected), and
stand-ins that are period-typical rather than the exact lost building.

## Phase 1 critique (screenshots: `shots/phase1/`, WebGL2 via SwiftShader)
What works:
- The streets follow the real grid. The Flatiron's wedge reads correctly from Madison Square,
  and the Empire State Building has its real setbacks and mast.
- Madison Square Park and Bryant Park show up as green; the one-way arrows on the minimap match
  the 1974 table.
- The dusk sky, haze and warm low sun on west-facing walls already suggest the mood.
- The WTC twins appear on the downtown horizon.

What doesn't (expected for untextured, but noted honestly):
- Flat-shaded boxes have no window rhythm, cornices, roof clutter or materials. That's Phase 3.
- Shadow sides were near-black; the fill light has been raised. There are no shadows, AO or post
  yet.
- **The buffer edge reads as a wall then void.** Beyond the region, only towers over 60 m exist,
  so they float on a dark plane. Fix: extend low-detail footprint shells for about 1 km around
  the region (data already fetched in skyline.geojson if the height filter is lowered).
- No East or Hudson River and no distant boroughs, so the horizon is a flat plane.
- Three of the eight viewpoints initially placed the camera at a wall. The rig now snaps them
  to street centrelines.
- Small road artefacts: square-ended buffers at dead ends, and intersections without corner
  radii.

## Performance (honest)
- These numbers come from SwiftShader **software** rendering in a headless container (no GPU).
  At 1600×900 on the WebGL2 path, frames take about 100 ms. That's the CPU rasteriser, not the
  engine. The scene is cheap: 25–104 draw calls and 12k–120k triangles per view, and parsing
  plus meshing all 88 chunks takes about 860 ms in total across workers.
- WebGPU under headless SwiftShader fails `createBuffer(mappedAtCreation)` above about 39 KB.
  That's a SwiftShader/Dawn limit. **The WebGPU path is still unverified on real hardware**, and
  the first real-GPU run should confirm it.
- Real targets (60 fps High at 1080p, 30 fps Medium on a laptop) can't be measured here. I'll
  report real numbers once someone runs `npm run shots` on a GPU machine. The rig records them
  in `shots/<phase>/report.json`.

## Known issues / TODO
- [ ] Decide on terrain (see Decisions).
- [ ] Research the 46 flagged rows in docs/PERIOD_AUDIT.md (rooftop additions, 206 W 36th St undated towers).
- [ ] Low-detail shells for the buffer ring; rivers and distant boroughs on the horizon.
- [ ] Hero landmarks are still extrusions (hand models are Phase 3). Macy's is tagged; Penn
      Station has no building outline because it's underground.
- [ ] OSM multipolygon `building:part` relations are ignored (only ways are used).
- [ ] Side-street one-way directions are assumed unchanged since 1974.
- [ ] The Ninth/Lexington/Third Ave conversion dates are unverified.
- [ ] Check the WebGPU path on a real GPU (desktop Chrome, Safari 26, Android Chrome).
- [ ] Occlusion culling isn't implemented. Chunk frustum culling plus distance LOD is enough at
      current triangle counts; revisit in Phase 3.

## Next (Phase 2)
Rapier character controller (walk, run, jump, ledge climb) with colliders generated per chunk
from the same footprint data. Orbit and chase camera. Touch buttons swap to JUMP/USE/SPRINT.
Spawn on foot at the Flatiron.

## Narrative team
`NARRATIVE_BRIEF.md` is the prompt and brief for the story/characters/missions team, including
the draft hook contract the engine will implement in Phase 7.
