# Engine handoff (branch `claude/tenderloin-74-engine-qi54lt`)

Written 2026-11-27 because usage was about to run out. Everything below is committed and pushed.

## Done (this session, newest first)
- **Night and street level (WIP commit, unmeasured as a whole):**
  - storefront spill pools on the sidewalk in front of 916 shop doors;
  - placeholder marquees on the Deuce (11 doors on W 42nd between 7th and 8th Aves; DOOR flag 4);
  - denser street lights (avenues every 27 m, side streets every 34 m);
  - lit-window colour spread (incandescent, fluorescent, TV, curtains) and a lower lit fraction;
  - night bloom threshold and blue-hour cool fill with a grade tweak (`PostFX.setTimeOfDay`).
- **Shot rig:** JPEG q85 ≤1600 px; lookmetrics bands by time of day (day, blue, night); the dusk slot is
  now 20:50 (sunset on 21 June 1974 is about 20:27 EDT).
- **Golden and night exposure, city-glow fill, varied lit windows (74fc13e).** Worn asphalt (93f49b0).
- **Trees and parks (04f49be):** 524 park trees, 334 street trees, benches, lamps, railings, paved park
  paths.
- **Doors on every building with frontage (ec4d054):** the DoorRec contract; interiors replaces them at
  its merge.
- **Facade data fixes (00ce718):** overlap clipping, floor sanity, AC units on the shared grid
  (`src/shared/facade.ts`).
- **Noon lighting (1e7ef74)**, the window-lights flicker fix (c9678a3, `npm run test:windows`), and
  landmark display names plus the brands test.
- **Phone:** the viewport fix (`npm run test:viewport`), load time (`npm run test:load`), the perf
  report, `?bench=1`, adaptive DPR and the props/detail split.

## In flight: Phase 3 tuning (latest measurements, `shots/phase3tune*`)
- **A 23:00 night: PASS** (p50 17).
- **A 20:50 blue hour: FAIL.** p50 15 (band 20–60) and no cool saturation. The blue fill is too weak,
  or the grade still desaturates it, so look at `PostFX.setTimeOfDay` and `Atmosphere` blue-hour
  hemi/fog.
- **D 19:30 golden: FAIL.** p50 25 and grey highs (#a7a9a9). At midsummer 19:30 the sun is 9° up, so
  the Herald Square canyon needs brighter sky fill. Raise hemi day intensity while golden < 1, and check
  the sky colour.
- **Noon (`shots/phase3`, before the asphalt change):** E and H in band; A and D dark (asphalt now
  fixed, re-shoot); G and I bright from sky-heavy frames. Highlights are too bright and cream; the sky
  has an elliptical clear patch from the SkyMesh cloud layer.
- **Next steps:**
  1. Fix blue hour and 19:30 as above, and re-shoot with
     `npx tsx tools/shots/capture.ts --phase phase3 --webgl --quality high --views A,D,E,G,H,I`.
  2. Run `python3 tools/shots/compare.py shots/phase3`.
  3. Write the Phase 3 critique in PROGRESS.md and send the set to oversight. Include one wide A and
     one wide D shot with placeholder cars (sim `?sim=1` debug boxes, after the sim merge).
  4. Oversight items still open: denser street-level sources (car headlights come with sim and
     vehicles), a little bloom on lit windows (High only), and the sky colour and cloud ellipse.

## Phase 3 block, required before Phase 3 is done (user report, 2026-11-27)
The user wrote: "There are no street signs/traffic lights. All the trees look the same (no branches)."
This block comes after the night and dusk fixes and before Phase 3 is called done.

**A. Street furniture**, placed from data and period-correct: research DOCUMERICA and other
public-domain 1970s photos per type; no real brands. Instanced, with chunk LOD and a draw and
triangle budget measured on the phone tier.
- **Traffic signals** at every OSM-signalled intersection (the POI Signal data already exists):
  1970s NYC heads and poles, with phases synced to the sim's signal state. Agree the interface with
  sim through ENGINE_REQUESTS.
- **Street-name signs** on corner poles in the 1974 colour scheme, with text through the sign/atlas
  system, legible at street level.
- **Streetlights** at period spacing (they also feed the night street-level light).
- **Small furniture:** hydrants, mailboxes, police and fire call boxes, phone booths, newsstands, trash
  baskets, parking meters, bus-stop signs. Call boxes are gameplay interactables, so check gameplay's
  contract (request 6, "street furniture as data").
- **Subway entrances:** kiosks and railings at the OSM subway entrances (POI SubwayEntrance exists).
- **Scaffolding and sidewalk sheds** where suitable.

**B. Trees with real branching.**
- Trunk and branch skeletons per species: London plane, honey locust, pin oak, ginkgo and Callery pear
  for 1974 street trees; bigger elms and planes in Madison Square and Bryant Park.
- Leaf cards and alpha-tested leaf clusters.
- Per-instance variation (seed, scale, lean, crown shape, hue), so no two neighbouring trees are
  identical.
- Wind sway in the vertex shader, and impostors/LOD at distance.
- Compare against park reference photos.

Deliver shots of both beside references, measured, as JPEG.

## In flight: sim merge (NOT on the branch yet)
- A local trial merge of `origin/claude/nice-sagan-2jh4m2` @ 0447d43 was clean apart from
  `package.json` scripts (keep both blocks). The sim's root `ENGINE_REQUESTS.md` should move to
  `docs/requests/sim.md`. `npm run test:sim` PASSED and `npm test` and the typecheck were clean on the
  merged tree.
- **To redo:**
  1. `git merge --no-ff origin/claude/nice-sagan-2jh4m2`, resolve `package.json`, and
     `git mv ENGINE_REQUESTS.md docs/requests/sim.md`.
  2. Run `npm run test:sim`, `npm test` and `npm run test:viewport`, then `npm run test:load` (load
     budgets: title ≤15 s, new game → playable ≤3 s), plus a `?sim=1` smoke test.
  3. Commit and push. Merge order after that: vehicles, characters, UI, gameplay, interiors, audio
     (see ENGINE_RESPONSES).

## Waiting on the user (via oversight)
- A phone perf report with Low Power Mode off, opened with `?hud=1&bench=1` (bench table).

## Process notes
- **Headless:** SwiftShader frames take about 1.5–2.5 s. Headless WebGPU loses its device on large
  frames, so WebGPU look and timing need a real GPU.
- **Don't rebuild `dist/` during a capture.** The rig serves `dist/` through `vite preview` on a fresh
  port.
- **ENGINE_REQUESTS checks:** `tools/dev/requests.sh`; answer in ENGINE_RESPONSES.md.

## Gap list against docs/briefs/VISUAL_BAR.md (user: "GTA V level at worst"), 2026-11-27
Status: **done**, **partial** or **missing**. Phone cost is my estimate for an iPhone 17 Pro, Low/phone
tier, at a 33 ms frame. Estimates are unmeasured until the bench (`?bench=1`) runs on the device.

### Lighting and post
| Item | Status | Plan | Phone cost |
|---|---|---|---|
| PBR lighting, time-of-day sky and sun, HDR, filmic tonemap, per-time grade | **partial**: real solar sky, ACES, 1974 grade, blue-hour/night switch; noon highlights and the sky colour still off | sky-only grade and haze, the SkyMesh cloud ellipse, per-time grade presets | ~0 |
| Cascaded soft shadows | **partial**: one 160 m PCF map following the player, off on Low | 2–3 cascades (CSM) on High; Low gets one 1k cascade within 60 m | 1.5–3 ms |
| Contact shadows / SSAO/GTAO everywhere | **partial**: baked canyon wall AO + sidewalk contact; no screen-space AO | GTAO half-res (High); Low: baked per-vertex AO extended to ground/props + car blob shadows | High 1–2 ms; Low ~0.2 ms |
| Probe GI (irradiance probes per block, time of day) | **missing** (hemi + baked occlusion only) | LightProbeGrid per chunk, relit from sun/sky SH each time-of-day step (cheap, no bake of geometry); WebGL2 path checked | ~0.3 ms sample; update amortised |
| SSR + reflection probes, wet streets, glass/car paint | **partial**: sky PMREM only (opt-in) | per-block box-projected reflection probes captured at load (low res), SSR on High/desktop, wet roads via roughness + probes on phone | probes ~0.2 ms; SSR 2–3 ms (desktop only) |
| Volumetric light/fog dawn-dusk-night | **missing** | height fog + faked light shafts (screen-space radial, 1/4 res) at golden/dusk; lamp halos via sprites | 0.5–1 ms |
| Bloom on practicals, subtle lens/grain | **done** (bloom/halation/grain High; night threshold) | bloom on Low with a 1/4-res single pass | 0.5 ms |
| Night: hundreds of local lights (clustered / forward+), emissive signage, headlights casting light | **partial**: 3-draw instanced fake lamps + additive pools + storefront spill; no real local lights | clustered forward+ in TSL (≤256 lights per view, culled per tile) for lamps, storefronts, headlights; keep pools as cheap fallback on Low | 2–4 ms (phone: 64 lights) |
| TAA so nothing shimmers | **missing** (FXAA only; window LOD fixes some shimmer) | TRAA node (three r18x) on High/desktop; phone: TAA at adaptive DPR if bench allows, else FXAA + pre-filtered shaders | 1–1.5 ms |

### World geometry and materials
| Item | Status | Plan | Phone cost |
|---|---|---|---|
| PBR photoscan/CC0 materials everywhere, wear/grime/wetness/decals | **missing** (procedural colour + noise; no textures) | ART_ASSETS step: CC0 brick/stone/terracotta/concrete/asphalt/granite sets as KTX2 arrays, triplanar under the procedural layout, condition-blended grime; decal instancing | memory ≤64 MB Low; ~1–2 ms shading |
| Facade depth: recesses, sills, lintels, cornices, fire escapes, parallax shopfronts, awnings, signage, AC, pipes, scaffolding | **partial**: flat walls + painted windows; real fire escapes, AC units, awnings, doors | geometry pass in the worker: window reveal insets (displaced inner quads per bay, near LOD only), cornice/sill/lintel extrusions per style, parallax interior mapping for shopfronts (interiors Tier C covers upper floors) | +30–60k tris near on Low (detail-radius gated) |
| Streets: kerb height, paint wear, manholes, patches, cracks, litter, puddles, steam | **partial**: kerbs, worn period paint, asphalt patches | decal instancing (manholes, cracks, litter, puddles), steam particles at vents | <0.5 ms |
| Street furniture + trees (blocks A and B) | **missing/partial** (see above) | as written above | budget per block A/B |
| Landmarks hand-detailed hero models | **missing** (hero styles in the shader only) | hero mesh pass: Flatiron, Empire Estate, Metropolitan Lifeline, Lacy's, Penn Sq Garden, Hotel Kelsey: modelled massing + cornice/crown geometry, built from public-domain drawings | +50k tris each, near only |

### Life, characters, vehicles, interiors
| Item | Status | Plan | Phone cost |
|---|---|---|---|
| Dense traffic and pedestrians, parked cars, pigeons/rats, moving steam/litter | **missing in the build** (the sim is ready, the merge is pending; the renderers come from the vehicles and characters streams) | sim merge, then vehicles (instanced traffic renderer) and characters (crowd) merges; parked cars from sim request 5 | sim 0.2 ms; renderers set by their streams' budgets |
| Characters (heads, skin, hair, cloth, faces) | owned by the characters stream | integration only | their budget |
| Vehicles (reflections, damage, interiors, lights casting light) | owned by the vehicles stream; engine supplies probes, clustered lights and env | integration + probes/lights above | their budget |
| Interiors at the same standard | owned by the interiors stream; engine supplies facade cuts, probes, lights | integration | their budget |

### Honest verdict
The current build sits below the floor. It is close on time-of-day lighting and the 1974 grade, and far
off on materials (no scans at all), facade depth, local lights, GI and reflections, and life (empty
streets until the sim, vehicles and characters merge).
The phone budget makes the full list hard at 30 fps. Clustered lights, GTAO, SSR and TAA together are
about 6–10 ms on the phone, on top of the city. The plan is therefore tiered: phone gets probes, baked
AO, decals, scans, facade depth, clustered lights capped at 64 and FXAA or TAA as the bench allows;
desktop gets everything.

### Phase 3 done-means (reworked against the bar)
Phase 3 is done when all of these hold:
1. The noon, golden, blue-hour and night boards for views A, D, E, G, H and I (plus wide A and D with
   cars) pass lookmetrics in their time bands. Oversight's rejection list also has to be clear: no
   flat-shaded street-level surface, no empty street, no missing contact shadow, no LOD pop.
2. CC0 scan materials are on facades and ground; facades have depth (reveals, cornices) near the
   camera; decals are in.
3. Blocks A (furniture, signals, signs) and B (branching trees) are in.
4. Probe GI and reflection probes are in. Clustered local lights are on at night.
5. TAA is on desktop and High; the phone decision is made from the bench.
6. The phone holds a stable 30 fps on the iPhone 17 Pro with Low Power Mode off, measured with
   `?bench=1`. Desktop holds 60.

Life (traffic and pedestrians), vehicles and characters reach the bar through the integration
milestones, not Phase 3, but Phase 3 shots with cars come from the sim trial.

## Shared rendering foundation, owned by the engine (oversight, 2026-11-27)
Interiors (moving to lit PBR), vehicles and characters all use the same pieces, so everything sits in
one world. They live in `src/render/shared/` and are owned by the engine; streams change them through
ENGINE_REQUESTS.

1. **Material library:** `src/render/shared/materials.ts`
   - `getMaterial(id: MatId, opts?)` returns a `MeshStandardNodeMaterial` built on CC0 scans.
     - Textures are KTX2 arrays, loaded lazily and cached, with a per-tier resolution: 512 on phone,
       1k on desktop.
     - Ids cover outdoor and indoor surfaces: brick-{red, buff, glazed}, brownstone, limestone,
       terracotta, cast-iron, asphalt-worn, concrete-sidewalk, granite-curb, tar-roof, enamel-paint,
       rust, plaster, linoleum, hex-tile, subway-tile, terrazzo, marble, wood-floor, wallpaper-*,
       car-paint, chrome, glass, rubber, fabric-*.
   - Common inputs per material:
     - **condition 0..4**, which drives grime, wear and peeling;
     - **wetness 0..1**, which darkens the albedo and lowers roughness;
     - a triplanar or UV mode;
     - a `tint`.
   - Sources are logged in `docs/ART_SOURCES.md`, and the memory budget (Low ≤64 MB) is enforced by
     the loader.
2. **Lighting:** `src/render/shared/lighting.ts`
   - `irradianceAt(x, y, z)`, plus a TSL node `probeIrradiance(positionWorld, normalWorld)`.
     Outdoors this is a `LightProbeGrid` per chunk (4 m vertical × 8 m horizontal), relit from
     sun/sky SH each time-of-day step.
   - `registerProbeVolume(bounds, bake)` for interiors: a room registers a small probe volume, baked
     once from its own lights and window light by time of day.
   - Lightmaps stay optional for static hero rooms. Their UV2 contract is written when the first one
     needs it.
3. **SSAO:** GTAO in the post stack on High and desktop. Phone uses baked per-vertex AO; meshes
   supply an `ao` attribute, and the engine provides `bakeVertexAO(geometry, occluders)` for
   interiors and props.
4. **Reflection probes:** `reflectionProbe(bounds, opts) → { texture, update() }`.
   - Box-projected, captured at load at 128 px on phone and 256 px on desktop; the engine adds a
     probe per street block.
   - Interiors call it per room. Vehicles and characters sample the nearest probe through
     `envAt(position)`.
   - SSR is layered on top on desktop and High.
5. **Clustered local lights:** `addLight({ pos, color, intensity, range, kind })` and `removeLight(id)`.
   Engine-managed forward+ lists, capped at 64 per view on phone and 256 on desktop, used by street
   lamps, storefronts, headlights and interior lamps.

**Order:** the material library and loader, then reflection probes with `envAt`, then the probe GI
grid, then GTAO, then clustered lights. Each one lands with a measured phone cost (`?bench=1` gains a
case per piece) and a before/after board.

## Movement and traversal (user brief, docs/briefs/MOVEMENT.md; the engine owns the controller side)
**Base:** the kinematic controller (Rapier), autostep 0.40 m, snap to ground, 50° slopes, jump, and a
0.45–1.9 m ledge climb from raycasts.

**Order of work (quality over speed; each step gets automated no-snag/no-stuck runs of 1,000
randomised attempts, plus a frame strip):**
1. **Locomotion core:**
   - momentum starts, stops and pivots: acceleration curves per gait, plant-turn, skid stop and
     turn-in-place; touch gets a slightly tighter tune;
   - analog-to-gait mapping, slope speed and lean, slides on steep slopes;
   - stair detection for a stair gait, with a body dip on steps exposed for characters.
2. **Detection layer:** a shared `TraversalProbe` that classifies what's ahead each fixed step:
   vaultable 0.5–1.2 m, climbable 1.2–2.2 m, ledge-grab at a gap, fence, ladder, drop. Shapecasts
   (capsule and box) against the city colliders and the markup below.
3. **Vault and climb:** a root-motion-driven state machine (vault, climb, mantle) with hand-plant
   points for IK. The capsule is moved along a curve; collisions are suspended only along the verified
   path.
4. **Drops and falls:** hang-drop, fall damage by height (gameplay owns the numbers), and a roll on
   landing at moderate heights.
5. **Markup-driven traversal:** chain-link fences, fire escapes (drop ladder, stairs, platforms,
   windowsills, roof), ladders, scaffolds, subway stairs, the turnstile vault, and roof-gap jumps with
   ledge grab.
6. **Crowd contact:** shoulder-brush and push-through against sim peds (velocity-limited
   capsule-capsule response), stumble events both ways, and hard knock-downs feeding the sim.
7. **Ragdoll bodies:** Rapier multibody ragdolls blended with animation (characters provide the
   skeleton and the blend). Triggers: car hits, shots, big falls and stumbles; get-up from front and
   back.
8. **Vehicle on-foot:** enter/exit alignment points per door side (vehicles provide them), the
   carjack pull-out, jumping out of a moving car with a ragdoll roll, and climbing on car roofs and
   hoods as vault targets.
9. **Camera:** smooth collision in alleys (the spring arm exists), shoulder swap, look-behind, and
   rise/pull-back on climbs and falls.

**Contracts to raise now (ENGINE_RESPONSES, "Movement contracts"):**
- **Traversal markup** (interiors, the engine pipeline, vehicles): `TraversalRec { id, kind:
  'ladder'|'dropLadder'|'fireEscapeStair'|'platform'|'fence'|'scaffold'|'ledge'|'turnstile'|'roofEdge',
  a: [x,y,z], b: [x,y,z], width, normal, flags }`. These are static line segments or quads in world
  space, delivered per chunk alongside colliders. Fire escapes come from the engine props (they
  already exist); interiors supply ladders, roof hatches and stairs; vehicles supply door points and
  roof/hood vault boxes.
- **Root motion and IK** (characters): the controller publishes
  `{ state, phase 0..1, velocity, grounded, stepUp: height, handTargets?, footTargets? }` every fixed
  step. Characters return the animation-driven root delta for the root-motion states (vault, climb,
  mantle, get-up) through `consumeRootMotion(): { dPos, dYaw }`. Foot IK uses the shared
  `groundAt(x, z)` (characters request 2).

## Decisions and queue as of 2026-11-27 03:00 (oversight and user), in priority order
0. **Every milestone report and board needs a "vs GTA V / VI / RDR2" section** (docs/briefs/REFERENCE_GAMES.md
   on awesome-keller): what the reference does, where we match, where we fall short, and the plan.
1. **Finish blue hour and D 19:30** (twilight dome, a899b96; re-measure in shots/phase3tune).
2. **Small fixes, before the sprint:**
   a. **Remove the always-on attribution overlay** (#attribution in index.html) from gameplay and
      cutscenes. ODbL credit moves to the title footer (small, engine) and to the full map and Credits
      screens (UI). Update DATA_SOURCES.md to say where it lives.
   b. **Park Avenue bug** (user report): no sidewalks and odd light posts. Check the map edge
      (Madison–Park) and the Park Ave South / Grand Central viaduct against sidewalk generation and
      furniture placement. Add a test: every road segment has a sidewalk on both sides unless
      flagged viaduct or ramp. Before and after shots.
3. **Integration sprint:** merge ALL streams in order, sim → vehicles → characters → UI → gameplay →
   interiors → audio. Each merge is verified:
   - every stream's tests, integrated shots, frame time, and a regression note;
   - a short note to oversight after each merge.

   Ask each chat to help with its conflicts (main.ts, ENGINE_REQUESTS, package.json); main.ts and
   engine-owned files stay authoritative. Then deploy for the user's phone.
   Items that land inside the sprint:
   - gameplay: TouchLayout, the shared Rapier import (`src/shared/rapier.ts`), talkables (req 15);
   - UI: `ThirdPersonCamera.ts` (47b4242, a drop-in for OrbitCamera with 8 tests), to be reviewed and
     wired (about 10 lines plus two ButtonActions). **Camera ruling: YES.** UI writes the file;
     the engine reviews it and keeps ownership of src/camera. Answer UI in ENGINE_RESPONSES.
4. **After the sprint, on the merged base:**
   - **Blocks A and B.** A is started: furniture (a899b96) is in but unverified, and signals sync to
     the sim's `signalStates()`. Then B, branching trees.
   - **The PBR/probe foundation.** Answer interiors request 9 in ENGINE_RESPONSES: KTX2 array packing,
     about 20 interior sets, per-cell lights (2 shadowed and 8 unshadowed), window-portal sun and sky.
   - **Movement.** The single traversal contract merges my `TraversalRec` with interiors'
     `TraversalMark` (req 10) in `src/shared/`. Fire-escape meshes are engine-owned and built from
     the marks (interiors data: `public/data/interiors/traversal/<i>_<j>.json`, 991 fire escapes and
     1,130 roof gaps).
     - **Gameplay movement rules** (87c07eb): `g.canMove(action)`, `g.traversed(action, m)`,
       `g.landed(h, rolled)`, `g.locomotion()` every frame.
     - **UI:** the `traversal?()` and `project?()` hooks in uiHost.
     - **Narrative request 15:** 31 `tv.*` markers for chase beats; place markup within about 30 m of
       each, or report the ones that can't host the move.
   - **Landmark signage sweep.** Copy is in narrative `content/landmarks.json → signage`.
     - Pan Amity Building: "PAN AMITY" rooftop letters plus a winged meridian-globe emblem.
     - Amalgamated Chemical Tower: crown letters plus a news zipper.
     - Lacy's: rooftop letters, banner, canopy, rosette.
     - Penn Square Garden marquee; Hotel Pennsylvanian rooftop neon; Hotel Kelsey vertical neon;
       entrance letters for Empire Estate, Lifeline and Lifelong.
     - Rooftop letters are extruded geometry, emissive at night. Emblems go through sign slots and the
       prompt queue. Send narrative the sign-slot table.
   - **Grand Central map extension (user decision), AFTER the sprint:**
     - Push the east bound just enough for Grand Central (about x 292, z -1619; 42nd–44th, Vanderbilt
       to Lexington), the Park Ave viaduct, Pershing Square and the Pan Amity base.
     - Update bounds.ts, the chunks, BOUNDARIES.md and DATA_SOURCES, and post the new PLAYABLE in
       ENGINE_RESPONSES. **Announce the planned numbers now.**
     - Hero exterior: the 42nd St facade, viaduct and ramps.
     - The engine owns the interior shell (Main Concourse, ramps, shuttle and Lexington connections),
       its lighting volume and streaming; interiors own the content.

## Integration sprint status (2026-11-27)
**Merged and verified on the engine branch.** Each merge ran typecheck, every stream's tests, its test
scene with 0 console errors, load and viewport where relevant, and a note to oversight.
- **vehicles** 648b139: registry stopgap for the tow and sweeper classes.
- **characters** 808010e: 17 MB of assets, which need a size pass before they're on by default on phones.
- **UI** 24a3439: UiHost/bootUi own title, pause and HUD. ThirdPersonCamera is wired (B look-behind,
  C or D-pad Right shoulder swap). The load test now skips the M1 intro with a held Enter.
- **gameplay** 2bb818f: `src/shared/rapier.ts` is the single Rapier import.
- **interiors** eb492d6: all index building ids match the current chunks.
- **audio** 122a189: the GPL build tools are verified absent from the bundle.

**Outstanding: sim.**
- Its verified candidate 0447d43 fails `test:sim` on the current street data (vehOverlap 5: an
  emergency vehicle changing lanes into a stopped car at −43.9, −148). Its head 50c7e24 is WIP.
- I asked the sim chat to merge the engine head, run `data:lanes` and `test:sim`, and fix it.
- Merge recipe: merge their fixed head, keep both `package.json` script blocks, run
  `git mv ENGINE_REQUESTS.md docs/requests/sim.md`, then `npm run data:lanes` and `npm run test:sim`,
  plus npm test, the load and viewport tests and a `?sim=1` smoke test.

**After the sim lands, game-loop wiring (one block on main.ts):**
- sim update and feeds (clock, terrain, external actors with siren);
- vehicles traffic renderer from `sim.vehicles`;
- characters: the player body from `player.loco()` and the crowd from `sim.peds`;
- gameplay: bindPlayer, bindWorld (RapierWorldQuery), bindSim, bindVehicles, the save section,
  talkables and TouchLayout;
- audio: AudioSystem and world feeds;
- signals synced to `sim.signalStates()`;
- then the touch-only combined run and integrated shots, followed by deploy.
