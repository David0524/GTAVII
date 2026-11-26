# PROGRESS: Tenderloin '74 engine & city

## Design pillar: "small map, very interactive" (user)
Density per block beats area. Most shopfronts are enterable, most roofs reachable, and every
block has something to do. The playable area is the dense story core: mid-block 21st/22nd to
43rd/44th Sts, and 9th/10th to Madison/Park Aves, about 2.3 km². A full-detail 200 m buffer
and low-detail shells keep Times Square, the rail yards and the skyline visible beyond the
edge.

Source of truth across sessions. Read this first; update it last.

## Status
| Phase | State |
|---|---|
| 1. Scaffold, data pipeline, untextured city, Flatiron spawn | **Done** (see critique below), plus landscape mobile support (added on request) |
| 2. Walkable player, camera, collision (+ local saves, period UI) | **Done** (critique below) |
| UI pass (title, HUD, pause, map, settings) | **Done**, shots in `shots/phase2/ui/`; **handed to the UI and cinematics stream** at the freeze commit |
| 3. Rendering pipeline + facade generation | **Next** (after integrating stream milestones) |
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
- **Real terrain** (user decision): a height field from footprint `ground_elevation`,
  exposed only through `src/shared/terrain.ts` `heightAt()`, so all streams agree.
- **Three.js 0.187.0 and Rapier 0.21.0, pinned exactly.** WebGPU is used when `navigator.gpu`
  exists; `?webgl=1` forces WebGL2.
- **Mobile:** landscape only, with a floating left stick, a right-thumb look area and big buttons
  on the right edge. Portrait shows a rotate prompt. Fullscreen plus orientation lock where
  supported (not iOS). Phones default to the Low preset with DPR capped at 1.5. All gameplay
  reads `Input` actions, so later controllers get touch for free.

## Phase 2 (player, camera, collision, saves): engineering calls
- **Physics:** Rapier (WASM) with a fixed 60 Hz step and render interpolation.
  - City collision is static trimeshes built from each chunk's LOD0 render geometry, so
    collision always matches what you see. They're created and destroyed within 320 m of the
    player.
  - Trade-off: no convex decomposition, so the trimeshes are fine for kinematic characters
    but dynamic props will need simplified colliders (Phase 4/5).
- **Player:** a Rapier kinematic character controller on a 1.84 m capsule.
  - Walk, run and sprint at 1.5, 3.4 and 6.0 m/s; partial stick walks; sprint is held.
  - Autostep 0.4 m (curbs and stoops), snap to ground on the hills, jump apex about 1.1 m.
  - Jumping at a ledge 0.45–1.9 m high climbs it instead (raycast detection plus a timed
    vault).
  - The player waits on the spot until colliders exist under it, so it never falls through
    streaming ground.
- **Body:** a `StandInBody` implementing the characters stream's `setLocomotion` contract
  structurally. It gets swapped for their `Character` on merge.
- **Party:** three narrative leads with per-lead position, money, inventory and wardrobe
  (N5). The switch UI and presentation come in Phase 7.
- **Cameras:**
  - over-the-shoulder orbit with a collision spring arm (pulls in instantly, eases out) and
    wheel zoom;
  - photo/free camera on P, R3 or the CAM button;
  - the screenshot rig uses `?cam=` (photo mode); `?at=x,z,deg` starts on foot elsewhere.
- **Controls:** Standard (default), Classic and Left-handed presets.
- **Verified headless** at a fixed 60 Hz:
  - a 3 s walk covers 9.7 m; jump apex 1.0 m;
  - walking into the Empire State Building stops at its wall;
  - climbs 1.2 and 1.8 m ledges, refuses 2.6 m, auto-steps 0.3 m.
- **Local saves** (user decision: local profiles now):
  - versioned schema and migrations, with a fixture per version (`tests/save-fixtures/`,
    `npm test`);
  - IndexedDB, with the blob put and pointer flip in one atomic, durable transaction;
  - `navigator.storage.persist()` requested;
  - profiles per device, 6 manual slots, a 3-deep autosave ring every 90 s, plus an
    autosave on visibility-hidden and pagehide;
  - checksummed (SHA-256) export and import;
  - an iOS "not installed" eviction note;
  - settings stay per device.
  - **Accounts and cloud sync are PENDING the user's go-ahead.** The `SaveStore` interface
    is ready for a cloud backend.
  - Verified in a real browser: save, reload, resume at the same spot; export and import;
    tamper rejected; the autosave ring rotates.
- **Known:**
  - The bundle is 5.2 MB because rapier3d-compat inlines its WASM. Move to the non-compat
    build with a separate `.wasm` file for caching (perf pass).
  - Save labels need the street name, so they're blank when the minimap is off.

## Pipeline v2 (expanded bounds and terrain data)
- **City:** 182 chunks covering the new playable bounds (`src/shared/bounds.ts`) plus a 200 m
  buffer.
- **Terrain is ON:** real relief, −11 to +12 m around the spawn, from 5 m grid data.
  - The user said "Real hills", relayed through the oversight session.
  - Ground is tessellated by longest-edge bisection to 10 m or less; buildings sit on the
    lowest ground beneath them; a coarse terrain base runs under everything.
  - Triangle count is about 360k in the High-preset spawn view.
  - Colliders follow the terrain in Phase 2.
- **Period fix:** OSM parts can no longer re-attach to stand-ins (1,249 rejected).
- **Rule 2c:** start-vs-completion year ambiguity is now resolved in favour of the city's
  completion year.

## Period accuracy (done after Phase 1, on request)
Every building is now dated from three sources (PLUTO, footprint, OSM), with ordered conflict
rules, height-for-era sanity checks and reviewed manual rulings. Lots with no footprint get
1974 treatments, modern OSM parts are dropped, and the skyline is dated the same way (the Pan
Am Building has been added). The method, results and the list of 46 flagged rows are in
`docs/PERIOD_AUDIT.md`, and `docs/period_audit.csv` has one row per building.
Remaining limits: rooftop additions on old buildings (only 1107 Broadway is corrected), and
stand-ins that are period-typical rather than the exact lost building.

## Phase 2 critique (screenshots: `shots/phase2/`, render set via WebGL2/SwiftShader; UI set in `shots/phase2/ui/`)
**What works:**
- **Movement.** You can walk the real streets on the real hills, and the collision tests pass:
  - you stop at walls;
  - curbs and stoops are auto-stepped;
  - ledges of 1.2 and 1.8 m are climbed, and 2.6 m is refused.
- **Camera.** The over-the-shoulder camera keeps buildings out of the line to the player.
- **Saves.** They survive reloads, export and import with a checksum, and rotate through
  the autosave ring.
- **The UI reads as period and premium:**
  - the poster title with its marquee;
  - the amber clock radio;
  - the Fraunces location reveal, using real 1974 district names, at the real intersection;
  - the folding 1974 street map that ends at the paper's edge;
  - full controller, keyboard and touch navigation, with a landscape phone layout.

**What doesn't (honestly):**
- **The player is a capsule.** That's correct per scope, but it makes every on-foot shot read
  as a prototype. Fixing it means merging the characters stream.
- **No turn-in-place or animation blending,** so heading snaps feel floaty at low speed.
- **Camera control is basic.** There's no auto-recentre behind the player while moving and no
  separate on-foot/vehicle sensitivity yet (both are on the settings roadmap).
- **Some viewpoints are poor.** The on-foot Herald Square shot faced a wall because of the rig's
  heading choice; the rig is fixed for next time.
- **Ground geometry is heavy:** about 360k triangles in the High-preset spawn view. That's fine
  on desktop, but it needs Phase 3 LOD for phones.
- **The bundle is 5.2 MB** because the Rapier WASM is inlined.
- **Parking lots z-fought with the sidewalk on slopes** (speckling in shot 11). Fixed after the
  capture by raising lots to 4 cm.
- **The west edge (Hudson) still reads as fog over a void,** and the rail cut isn't modelled.
  This is boundary Layers 0 and 1, scheduled.
- **No real-GPU numbers yet.** Every frame time here is software rendering, so the user's
  phone or Vercel tests with COPY PERF REPORT are the first real data.

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

## Planned: playable boundary (user requirement: no invisible walls; design in docs/briefs/BOUNDARIES.md)
| Layer | What | When |
|---|---|---|
| 0 | Expand the modelled city and set playable bounds mid-block: 10th–11th Aves west, 47th–48th Sts north. Use the real 1974 barriers: Penn Central rail cut, Lincoln Tunnel trench. The shared API `src/shared/bounds.ts` (`edgeDistance`, `inwardDirection`, `EDGE`) is published now. | Pipeline v2 (next, together with terrain if confirmed) |
| 1 | Low-detail shells about 1.5 km beyond the edge, Hudson and East Rivers, New Jersey, Queens and Brooklyn silhouettes | Pipeline v2 plus Phase 3 |
| 2 | Period blockers with real colliders: film shoot, utility trench with steam stack, water-main break, police barricade, block party | Phase 2 colliders, then Phase 5 dressing |
| 3 | Gridlock and crowd ramp near the edge (sim stream, via `edgeDistance`) | Phase 5 |
| 4 | "The reel runs out": grain, weave and light leak build up, then a leader countdown and a reel-change cut back to a safe pose facing inward. Shares its presentation with the character switch. | Phase 3 post stack, Phase 6 polish |
| Map | The pause map is a 1974 folding street map that ends at the paper's edge | UI pass |

## Known issues / TODO
- [x] Terrain decided: real relief (shipped in pipeline v2).
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

## Phase 3 look target (the bar Phase 3 shots are judged against)
**The goal:** a frame grab from the game should sit next to these 1973 photographs and read as
the same city, filmed on the same stock, with a 2031 open-world game's density of detail.

**Reference frames** (`references/img/`, public-domain DOCUMERICA; credits in
`references/catalog.json`):

| # | Frame | What it pins down |
|---|---|---|
| A | `documerica_554297` (42nd St west of Seventh, Aug 1973) | Low warm sun on west faces, marquee panels with chasing bulbs, scaffolding, long sedans, rose-brown cast |
| B | `documerica_554293` (Sixth Ave & 32nd St) | Street-level clutter: neon script, blade signs, box trucks, police scooter, soot on cornices, the cab's yellow |
| C | `documerica_549867` (Garment District canyon) | A dark street floor under a bright sky slot, haze, handcarts, trucks double-parked, depth falling into warm grey |
| D | `documerica_549869` (Herald Square traffic) | Saturation budget: only taxi yellow and truck red sing, everything else muted; chrome highlights; dense traffic |

**Grade targets** (STYLE_GUIDE §1, measured from 87 photos). Phase 3 shots are measured with
the same script (`tools/refs/lookmetrics.py`, to be added in Phase 3). Each shot's numbers must
land in these bands:
- **Tones:** shadow average near `#2e171d` (warm maroon, within ±12 per channel); midtone
  average in the brown-rose family `#794d44` (±20); highlight average near cream `#d1b59e`
  (±20).
- **Luma:** p2 ≤ 20, p50 between 50 and 80 (low-key), p98 between 200 and 235 (nothing
  clipped to white).
- **Saturation:** at least 70% of saturated pixels in red-orange-yellow (hue 0–60° plus
  330–360°). Saturated blue/green 10% or less (dusk sky excepted, in a sky-masked variant).

**What "done" looks like:**
- **Facades:**
  - Every building's walls show its era and use. Tenements get brick with stoops and fire
    escapes, cast-iron lofts their columns and big windows, masonry lofts their piers and
    spandrels, prewar offices their limestone base, and setback towers their crowns.
  - Window rhythm comes from real height and floors, and window rooms come from the
    interiors tier-C shader.
  - Roofs carry water towers, bulkheads and parapets. AC units are in roughly one window in
    six.
  - Ground floors have storefronts with awnings, roll-down gates and period signage (invented
    names).
  - Heroes (Flatiron, Empire State, Met Life, Penn/MSG, the Herald Square store, Hotel
    Chelsea) are hand-modelled and recognisable in silhouette at 1 km.
- **Ground:** asphalt patches and seams, faded lane paint and crosswalks, manholes with steam,
  granite curbs with chipped edges, sidewalk slab joints, gratings, and a wet variant with
  screen-space reflections.
- **Wear:** soot streaks under every ledge, darker ground floors, curbside litter and bagged
  trash, graffiti (act-keyed), potholes, cracked curbs, scaffolding sheds.
- **Lighting:**
  - Dusk: a low sun with cascaded shadows, warm on west faces.
  - Night: sodium on the avenues and mercury on side streets, neon blooming into haze, lit
    windows (incandescent, TV-blue, fluorescent).
  - An environment map so chrome and glass read.
- **Post:** filmic tonemap, split-tone, hue-selective saturation, halation, grain, a light
  vignette, TAA, GTAO, bloom. Each is toggleable per preset.
- **Budget:** a High preset hitting 60 fps at 1080p on a mid-range GPU, and Medium hitting
  30 fps on a laptop. Proven on the user's devices with COPY PERF REPORT, not in this
  container.

**Shot list for judging:** the Phase 2 rig viewpoints, re-shot, placed side by side with frames
A–D at matching angles: 42nd St & 7th, Sixth Ave & 32nd, a Garment District side street, and
Herald Square.

## Workstreams and integration cadence
| Stream | Branch | Brief | Owns |
|---|---|---|---|
| Engine (this session, integration owner) | `claude/tenderloin-74-engine-qi54lt` | this file | rendering, city and pipeline, player and cameras (incl. the camera director), physics, saves (core plus the section registry), mission runtime (Phase 7), integration, shared contracts in `src/shared/` |
| Narrative | `claude/sharp-maxwell-jnb6hr` | NARRATIVE_BRIEF.md | `narrative/`, `content/`, side quests |
| Sim (traffic and pedestrian AI) | `claude/nice-sagan-2jh4m2` | docs/briefs/SIM_BRIEF.md | `src/sim/`, the lane pipeline |
| Vehicles | `claude/youthful-newton-py223e` | docs/briefs/VEHICLES_BRIEF.md | `src/vehicles/` |
| Characters | `claude/characters-74` | docs/briefs/CHARACTERS_BRIEF.md | `src/characters/` |
| Audio | (oversight branch brief) | docs/briefs/AUDIO_BRIEF.md | `src/audio/` |
| Interiors | `claude/interiors-tenderloin` | docs/briefs/INTERIORS_BRIEF.md | `src/interiors/` (tiers A/B; tier C window shader inside the engine's Phase 3 facade material) |
| Gameplay systems | (new) | docs/briefs/GAMEPLAY_BRIEF.md, ECONOMY.md, CORE_SYSTEMS.md | combat, police, items, money, economy, its own save sections |
| UI, map and cinematics | `claude/ui-cinematics` | docs/briefs/UI_CINEMATICS_BRIEF.md | **all of `src/ui/` and `src/settings/` after the freeze commit**, plus the cutscene system (`src/cinematics/`) |
| Oversight | `claude/awesome-keller-i9tmmu` | — | cross-stream checks, briefs, the user's decisions |

**Session directory** (for direct coordination with send_message; contracts still go through
ENGINE_REQUESTS and ENGINE_RESPONSES, and the oversight session is copied on contract changes):

| Stream | Session |
|---|---|
| Engine | `session_01H4ZSJ5agLRKP5qS2okvyAK` |
| Narrative | `session_01H4ZSJ7VbJSVZUhFqooiSvX` |
| Sim | `session_01H4ZSJ7ZFKbq3mXVPBgLaXc` |
| Vehicles | `session_01H4ZSJ51q9zJhE3T3n4Hw3M` |
| Audio | `session_01H4ZSJ6zQP5er585qGhpRft` |
| Characters | `session_01H4ZSJ9HHC3JhC3uZj5pVfG` |
| Gameplay | `session_01H4ZSJ7ih6pW16fwcDhuHtD` |
| Interiors | `session_01H4ZSJ8LAo9NuN9usWP4Dn3` |
| UI & cinematics | `session_01H4ZSJ9Htu5DPCDMJHKesiQ` |
| Oversight | `session_01H4ZSJ99NBvPVUNdV2re88V` |

**Master feature checklist:** [docs/briefs/FEATURE_AUDIT.md](docs/briefs/FEATURE_AUDIT.md), with an owner for every line.

**`package.json`:** scripts are kept alphabetical. Streams add only their own `<stream>:*`
scripts, never reorder existing lines, and the engine resolves conflicts at merge.

**Merge rules (into the engine branch):**
1. **When merges happen:** at each stream's "done means" milestone, and otherwise
   **twice a week** (Monday and Thursday) for content-only streams such as narrative.
   An early merge happens on request when another stream needs the code.
2. **Gate before merging:**
   - `npm run typecheck` and `npm run build` pass on the merged result;
   - the stream's own headless tests pass;
   - no edits to engine-owned files beyond the one allowed guarded line in `src/main.ts`;
   - no real brands or trademarks (the oversight session's scan).
3. **How:** a merge commit (no squash, no rebase of other streams' history). Conflicts in
   shared files are resolved by the engine, and the stream is notified.
4. **Shared contracts** (`src/shared/*`) change only through ENGINE_REQUESTS.md and
   ENGINE_RESPONSES.md. After a change, every stream is told to merge the engine branch.
5. **Downstream:** streams merge the engine branch into theirs at least weekly and whenever a
   shared contract changes.

## Narrative team
`NARRATIVE_BRIEF.md` is the prompt and brief for the story/characters/missions team, including
the draft hook contract the engine will implement in Phase 7.
