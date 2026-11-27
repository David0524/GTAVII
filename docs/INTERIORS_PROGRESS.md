# INTERIORS_PROGRESS: what's behind the doors

Source of truth for the interiors workstream (branch `claude/interiors-tenderloin`). Read it
first and update it last.

## Status
| Item | State |
|---|---|
| Door/frontage index for every building (`tools/interiors/buildIndex.ts`) | **Done**; coverage below |
| Kit, baked lighting, TSL uber-material, worker builds | **Done** (v1) |
| Tier B generators (30 kinds) | **Done** (v1). Every kind builds; 0 failures over all ~11,000 units |
| Streaming (30 m), portal culling, doors, colliders, power, slots, markers | **Done** (v1). Shown in the test scene |
| `?interiors=1` test scene (street block with facade cuts, gallery, overlays) | **Done** (v1) |
| Tier A heroes | **Hotel Corwin v1 done** (lobby, fire stair to roof, Teddy's 9F with the act 1 portrait, 11th-floor rooms 1104/1112, shared bath, a window to the Empire State checked by sightline). Other heroes next |
| Tier C window shader | **v1 done** (`src/interiors/windowRooms.ts`), shown on test-block facades. Engine integration pending (request 6). GPU cost not measured (no GPU here) |
| Reference library (interiors) + 5-grade condition boards | **v1:** 96 reviewed interior references in the shared `references/catalog.json`. Grades 0–4 are implemented (see the grade board); side-by-side boards against references are next |
| Subway stations and tunnels, homes, hospital, booking room | Not started (new requirements) |
| Walk-in frame sequences | **v1 done:** diner, bar, loft, tenement to roof, Corwin lobby, Corwin 11th-floor window (`docs/interiors/*.png`). Phone numbers are pending the user's device |

## Coverage (measured, `docs/interiors/coverage.json`; playable bounds from `src/shared/bounds.ts` after the shrink)
| Metric | Value | Target |
|---|---|---|
| Commercial frontage (PLUTO use 4/5/6/7/10) with an enterable unit | **73.5%** (38.0 of 51.7 km) | ≥ 70% (oversight, superseding the brief's 40%) |
| Ground buildings with a reachable roof | **54.0%** (1,656 of 3,067) | ≥ 50% (superseding 25%) |
| Ground buildings with any enterable door | 75.8% | — |
| Units in bounds | 6,637 (4,623 shops, 2,014 cores) | — |
| Tier C windows | shader built; 100% of street-facing upper windows on test shells. City-wide needs the engine facade pipeline | 100% |
Not yet verified: "unlocked apartments on every residential block" and "a gameplay hook on
every block". Both need a per-block report.

Roofs are reached by: tenement, SRO, loft and apartment stair cores (≤ 16 floors), fire-stair
towers in office and hotel lobbies (≤ 14 floors), and a ship's ladder in the back room of deep
shops in buildings of 3 floors or fewer.

## Build cost (measured, `docs/interiors/stress_low.json`)
Node, one thread, desktop container CPU, every unit in the index. **These are not phone
numbers**; expect phones to be roughly 3–5× slower.
- Low quality: p50 2–50 ms by kind. The worst p95 values are union hall 82 ms, pool hall 62 ms,
  bar 47 ms and liquor 28 ms (after goods were simplified on Low).
- Triangle counts at p50 range from 1.5k (apartment lobby) to 16k (union hall).
- In the headless SwiftShader browser, about 11 interiors resident at the Corwin block took a
  worker build average of 146 ms (max 428 ms) and 1.8 s from request to ready. That's
  software-rendered and CPU-starved; real devices are pending.

## Architecture
```
tools/interiors/buildIndex.ts  frontage probe (sidewalk/plaza beside an edge, nearest OSM street), collinear-edge merge,
                               bays, kinds by PLUTO use, style and 1974 district, two-pass depth fit, doors, hours, roofs
public/data/interiors/index.json  compact wire format (src/interiors/indexFormat.ts)
src/interiors/facade.ts        facadeOpenings(): the one definition of door/alcove/window/transom holes
src/interiors/layout.ts        stair core and tower layouts, roof hatches (shared with the engine)
src/interiors/kit/             Kit (tessellated walls with openings, boxes, stairs with ramp colliders, doors, portals,
                               lights, slots, markers), materials (period palette), props (period prop library)
src/interiors/gen/             common (shop shell), food, retail, vertical (tenement/SRO/loft/apartment, roof,
                               fire tower, ship's ladder), halls (lobbies, garage, church, union hall, cinema, upstairs)
src/interiors/bake.ts          per-vertex lamp rgb + window light, portal-gated, occupancy shadows and AO, one-bounce fill
src/interiors/runtime/         material.ts (TSL, procedural patterns, filtered), Interiors.ts (stream/cull/doors/physics)
src/interiors/worker.ts        builds off the main thread
src/interiors/test/            testScene.ts (?interiors=1), testShell.ts (reference facade cut)
tools/interiors/capture.ts     gallery and screenshot rig; stress.ts builds every unit
```

## Decisions
- **The index is precomputed; interiors are generated at runtime.** Doors must be known before
  chunk meshes exist (to cut facades), and coverage has to be measurable offline. Geometry is
  generated in a worker, and nothing is shipped but a 1.5 MB index.
- **Unlit, baked interior material.** Interiors use no scene lights. Lamp and window light are
  baked per vertex in the worker; uniforms scale them for opening hours, brownouts (dim flicker,
  off) and time of day. This is cheap on mobile and the sun can't leak through walls. The cost is
  that characters need an indoor light scale (request 4).
- **Portal culling by cells.** Each room and floor is a cell. Street portals face outward, and
  culling recurses with screen-rect clipping. Roof dressing is an "outdoor" cell.
- **Doors open automatically when unlocked.** Street doors lock outside hours, and residential
  street doors are about 40% unlocked (period buzzers were often broken). Apartment doors carry a
  `key.<unit>.<label>` id for inventory keys.
- **Upper-floor windows in halls, apartments and lofts look out through the engine facade's
  culled back face.** No facade hole is needed for looking out; Tier C covers looking in.

## Known issues (honest)
- Showroom and clothing rails read as solid striped walls at the door view (racks too dense).
- Cinemas are too dark; stair halls are dim from the door. Exposure needs a pass against
  references.
- Some prop faces z-fight (fixed for booths; needs a sweep).
- Bars and taverns are generic: no tin-ceiling and back-bar variety yet, and no brand-free period
  signage set.
- Office and hotel elevators are decorative (except the planned Corwin elevator, request 5).
- No interior reference library yet, so the period critique is from knowledge, not from boards.
- Coverage counts unit width against frontage length; corner overlap is not double counted.

## Evidence (headless SwiftShader; layout and visuals only, no performance claims)
- `docs/interiors/gallery_v1_allkinds.png`: one seeded interior of each of the 30 kinds, viewed from the door.
- `docs/interiors/walkin_diner_bar_loft_v1.png`: 8 m → 1.5 m → threshold → 3 m inside. Interiors are resident and visible
  through display windows at 8 m (streaming starts at 30 m), so nothing pops.
- `docs/interiors/walkin_corwin_v1.png`, `docs/interiors/corwin_11th_window_esb_v1.png`: the Empire State's setback shaft is
  framed in the 11th-floor window. Sightline data: `docs/interiors/corwin_sightline.txt` (clear above 150 m from the north face's
  west half only).
- `docs/interiors/climb_tenement_to_roof_v1.png`: street → lobby → floors 1–4 → roof (`inside()` reports the right cell at every stop).
- `docs/interiors/tierC_night_vs_brownout_v1.png`: 21:30 normal power vs `setPower('all','off')`.

## Gallery critique v1 (honest)
Reads as 1974:
- the storefront grammar: recessed glazed entries, display beds, transoms, mullions;
- diner counters with chrome stools, booths and menu boards; tenement halls with two-tone dado, bare bulbs and dog-leg stairs;
- tin ceilings in older units, fluorescent remodels in newer ones;
- through the window, AC units, blinds at random drops and dark offices at night.

Reads as a modern kit or is wrong:
- Surfaces are too clean and flat: the wear is noise, not decals (no water stains, peeling paint or nicotine gradients).
- Props are boxy (stools, booths and chairs are boxes and cylinders), and there's no signage text.
- Rails at the showroom door read as walls. Cinemas are too dark.
- The lighting is plausible, but there's no bounce colour and no specular on linoleum or chrome beyond a fake environment term.
- Nothing has been compared to period interior photos yet: there are no interior references in `references/`. Building
  the HABS and DOCUMERICA interior library is the next step before any "looks right" claim.

## Interior reference library v1 (`tools/refs/collectInteriors.ts`, collected by a helper, reviewed by hand)
- 96 interior entries:
  - **Gottscho-Schleisner** (LOC, "no known restrictions on publication"): 1930s–60s restaurants, bars, hotel and office lobbies, all condition 3;
  - **DOCUMERICA** (public domain): subway in 1973–74, condition 1;
  - **HABS** (no known restrictions on US Government images): 451/455 Madison Ave rooms, condition 4.
- Each entry is tagged by topic, condition (0–4) and a `reviewed` note. Rejected:
  - 14 outdoor or storefront shots;
  - 10 near-duplicate carved-panel close-ups.
- **Gaps:** SRO rooms, tenement halls, diners and lunch counters, walk-up stairwells, garment lofts and worn or derelict
  grades are missing. Those are exactly what the Corwin and most of Tier B need. Next searches: DOCUMERICA housing and
  "welfare hotel" sets, HABS tenement documentation (97 Orchard St), and NYPL public-domain items.
- **Caveat:** HABS rights say "images copied from other sources may be restricted". The 8 HABS items kept are HABS
  survey photographs dated 1962–1977, not copies from other sources.

## Grade and Corwin boards v1–v2 (against references)
- `docs/interiors/grades_vs_refs_v1.png`: the same diner at grades 0–4 above reference exemplars (1, 3 and 4; there are no 0 or 2
  exemplars yet).
  - **Verdict:** the steps read, but too subtly. In the references, grade 3 is chandeliers, columns, patterned carpet and
    linen, and grade 4 is carved panelling and coffered ceilings. Our recipe changes colour, stains and mouldings but
    not the furniture, fixtures or ceiling. Next: grade-driven fixture and furniture sets (chandeliers and pendants vs
    bare bulbs, linen vs formica, carpet vs linoleum, panelling vs paint) and a derelict set (boarded windows, stripped
    fixtures).
- `docs/interiors/corwin_vs_ref_lobby_v2.png`: the Corwin lobby rebuilt against the Aberdeen Hotel lobby (17 W 32nd St,
  1941, a block away). It now has the recessed desk window with pigeonholes and a 1970s wire grille, square columns,
  uplight bowl pendants (one dead), a patterned carpet with a threadbare path, sofas and lamp tables, a picture and a pale
  patch where one hung, and the mailbox bank and clock on the back wall.
  - **Verdict:** the plan and fixtures now match the period. Still flat: no carpet pattern detail at distance, vinyl aliasing,
    no pattern on the bowl undersides. The ceiling cove and cornice are missing. Exposure is darker than the reference by
    design (1974 worn vs 1941 new), but it may be too dark on a real display.

- `docs/interiors/walkin_corwin_v2.png`: the walk-in with lobby v2. The interior is resident at 8 m (15 live); the street door swings
  open as you approach; inside you see the desk window grille, sofas and lamp table. 16 cells visible, 76 draws, headless.
- `docs/interiors/grades_board_v2.png`: grade-driven fixtures. Derelict rooms are dark, boarded and lit by bare bulbs; pristine rooms get chandeliers,
  panelling and linen.
- Tier C: `interiorRoomNode()` is ready for FacadeMaterial (request 6b).

## Art slots in the narrative prompt queue
- Six Corwin slots are queued (narrative commit c88da12, `assets/prompts/sources/interiors.json`); files arrive as `int_<id>.png`, to ingest to `art/interiors/<id>.png`.
- **Ingest TODO:** draw the July 1974 date grid in-engine on `teddy_calendar` (the generated image has an empty grid; 1 July 1974 was a Monday).
- The notice text uses "MGMT." to match the Corwin's exterior sign.

## Tier C cost (honest)
- `docs/interiors/tierC_cost_swiftshader.json`: 17,373 windows on the test block at 21:30, 1280×720, render plus a forced readback,
  median of 12 frames. With Tier C: 994 and 1,048 ms. Without: 1,026 and 1,016 ms. The difference is inside SwiftShader's
  run-to-run noise (about ±5%), so this proves nothing about GPU cost. The engine's new `lodFade` (a 4 → 1.5 px bay fade) widens
  the near-LOD band, so the brief's ≤0.3 ms at 1080p still needs a real GPU: the Vercel build with `?hud=1` on the user's
  phone, or any desktop GPU.

## Sim door hand-off
- Street ↔ interior traffic per kind lives in the sim (`src/sim/doors.ts` on claude/nice-sagan-2jh4m2, from our table). It's tunable at
  runtime through `sim.setDoorRates()`.
- Interiors' side, still to wire: on `pedEnteredDoor`, fill a slot by role in resident interiors; offer `exitFromDoor`
  candidates from slots. Residential doors never take passers-by.

## Every building has a door (user feedback via oversight)
- **Assertion:** `buildIndex.ts` throws unless 100% of ground buildings in bounds have at least one door. Result: **3,072 / 3,072**.
  The enterable share is unchanged: 75.9% of buildings, 73.6% of commercial frontage, 53.9% with roofs.
- **Locked or decorative entrances** (`kind: 'facade_only'`, `locked: true`, `enterable: false`) for the 742 buildings with no enterable
  unit, plus freight or service doors on long frontage the units leave bare. Each sits on its real frontage at sidewalk height
  from `heightAt`.
- **Period styles** (`DoorRec.style`): stoop (with rise) on walk-up tenements; vestibule on apartment, SRO, loft and hero entrances;
  brass double doors on office and hotel towers, revolving on 1920s–50s towers of 15+ floors at grade 3+; freight on lofts;
  church; garage; boarded at grade 0. Shops get `nightGate` for a roll-down gate outside hours.
- **Honest caveat:** 576 buildings in bounds have no street frontage. 158 get a rear door onto a yard or lot. The other 418
  are hemmed in on every side by other footprints (back buildings, split lots). They get `style: 'internal'` with
  `via: <adjoining building id>`, so nothing is drawn into a wall. **Visible street or yard entrances: 2,654 of 3,072 (86.4%);
  the remaining 13.6% are reached through a neighbour.**

- Back buildings (`internal` doors): oversight confirmed that no alley or areaway geometry is needed. Story places resolve only to buildings
  with street frontage, so none of them carries a mission.
- Furniture form v2: the shared sofa and armchair props now have skirts, tapered legs, piped cushions and rolled arms
  (`Kit.tube`). They're used by every lobby, apartment and hotel generator (`docs/interiors/armchair_v2.png`).

## Aligned with the engine's pipeline and facade grid (E16)
- **Index regenerated** on the engine's new building ids: 3,078 ground buildings, every one with a door (assertion holds). Enterable: 75.4%
  of buildings, 72.9% of commercial frontage, 54.7% with roofs. The Corwin still resolves to 1255 Broadway.
- **Shared floor height:** `floorHeight()` from `src/shared/facade.ts` sets every building's `fh`.
- **Upper-floor windows** in apartments, lofts, tenement halls and Corwin rooms now sit on the engine's bay grid
  (`bayWidth`, `sillFrac`, plus FacadeMaterial's window fraction). Each unit stores `ringU`/`ringDir`, its position along the outer
  ring from vertex 0, which is the facade shader's u. Checked: 1,587 sampled window centres sit mid-bay, 0 off-grid. Whether they
  line up with the engine's drawn windows is verified only at merge, since both use the same chunk ring.

## Next
1. Hero: Corwin lobby + 11th floor (room 1104, room 1112, shared bath, window to the Empire
   State), Teddy's room 9F.
2. Walk-in sequences: diner, bar, loft, tenement to roof, Corwin.
3. Tier C shader with an engine integration proposal.
4. Condition grades (shared `condition.ts`) driving materials and wear; interior reference library.
5. The new requirements from oversight: subway stations and tunnels, lead homes, hospital ER,
   booking room and holding cell, garages and car lots, economy `upgradeLevel`, nav graph export
   for police pursuit.

## Resume note (condition-grade furniture, in progress)
- Done: `src/interiors/kit/wear.ts` (seat tape/tears, mismatched chairs, broken/fallen chairs, missing cushions, antimacassars, tablecloths/vases, ashtrays; `dressCells` post-pass adds grade clutter: cartons, bottles, trash bags, plywood, mattresses, papers at 0-1; rugs and plants at 3-4). Kit.wr is a separate wear RNG so layouts stay identical across grades. Stress: 0 failures.
- Board: docs/interiors/grades_board_v3_furniture.jpg (rows: tenement apt cell, diner 3, bar 1; columns grade 0..4). Honest critique: bar reads best (g0 papers/debris and empty bulbs, g1-2 tape/mismatch, g4 tablecloths, vases, carpet). Diner: mismatched stools read at g0/g1; clutter is thin in big open shops. Tenement: the `cell:apt_` camera lands in a long apartment that reads as a corridor; potted plants still read as spidery shapes (need leaf blades, not tubes); derelict rows are too dark to read the clutter (lamp 0.55 + dying lamps) - add a daylight/window spill check before judging g0.
- Next (was): capture `grades` boards (tenement `cell:apt_`, diner 3, bar 1) as JPEG beside references, critique, tune; then review the pass-2 reference helper output (tools/refs/collectInteriors2.ts, uncommitted until reviewed).

## Gap list against docs/briefs/VISUAL_BAR.md (2026-11-27, judged on grades_board_v3_furniture.jpg)
Honest verdict: interiors are **well below the GTA V floor** today. Layout, content density and grade storytelling are the strong part; rendering is the gap.

| Bar item | Interiors today | Gap / plan |
|---|---|---|
| PBR photoscan/CC0 materials (albedo, normal, roughness, AO) | Unlit uber material, procedural patterns from vertex colour; no normal or roughness maps | **Major.** Move to lit PBR node material fed by the engine's shared CC0 library (texture arrays: plaster, tile, terrazzo, wood, vinyl, carpet, brick, tin, linoleum), procedural patterns kept as masks and wear layers |
| Physically based lighting, HDR, filmic tonemap | Baked per-vertex lamp and window light, output unlit into the engine's tonemap | Bake to lightmaps (second UV) or per-cell irradiance probes instead of vertex colour; keep the bake as indirect, let a few real lights per room light the PBR material directly |
| Light through windows following the sun | Window light baked as a constant term, portal-gated | Window sun patches as projected light (sun direction from engine) with shadowing through window frames; brightness by time of day already wired via the `window` uniform |
| Contact shadows / AO in every corner | Baked corner AO plus hemisphere AO per vertex (coarse, tessellation-limited) | Use the engine's SSAO/GTAO in interiors; lightmap AO at texel density, not vertex density |
| Dynamic shadows from characters and props | None (engine request 4 open) | Shadowed local lights (one or two per visible room) and character contact shadows; depends on engine 4 |
| Reflections (glass, chrome, wet floors, mirrors) | Chrome and mirror are patterns only | Per-room reflection probe (box-projected cubemap captured at build time), SSR from the engine |
| Furniture form | Box primitives plus tubes; plants read as spidery | Hero props as authored or CC0 meshes (chairs, stools, booths, registers, plants, beds), kit primitives only for architecture; bevels or normals on every box edge |
| Decals: grime, wear, stains | Procedural wear in the shader, ceiling water stains | Decal layer (grime, scuffs, posters, graffiti at derelict) projected on walls and floors |
| Readable derelict grade | Too dark to read (lamp 0.55 plus dying lamps) | Daylight through windows and grime-lit exposure, not a dimmer; tune once lighting is PBR |
| Phone frame time | Unmeasured on device (SwiftShader only) | Measure on iPhone 17 Pro once the PBR path exists |

The first three rows are an architecture change to the interior renderer (from unlit baked vertex light to lit PBR with lightmaps and probes, sharing engine materials). Raised with oversight before starting it, since it touches the engine's lighting pipeline and the material library.

## Reference pass 2 (2026-11-27)
44 entries added (catalog 211 -> 255), all viewed by the helper and contact sheets reviewed by me (references/contact/pass2_*.jpg): sro_room 9, tenement_hall 5, diner 15, loft 13, plus 2 tenement rooms. All LoC "No known restrictions", stored verbatim. Mostly 1908-1940 (Hine/NCLC homework rooms, FSA 1938 stair halls, Gottscho cafeterias incl. the Garden Cafeteria at 50th and 8th). Gaps that remain: grade 0 has one exemplar (266 Elizabeth St collapsed hall); no 1970s SRO or welfare-hotel rooms; DOCUMERICA on Commons is nearly all exterior, NARA API returned HTML only; HABS 97 Orchard St items are 1980+.

## Traversal markup (MOVEMENT.md, ENGINE_REQUESTS 10)
BuiltInterior.traversal now carries roof hatches (bulkhead doors, locked flag) and roof-edge ledges along every reachable roof's footprint edge (outward normals); `Interiors.traversal(id)` returns them in world space. Stress over all units: 2,101 hatches, 17,703 ledges, 0 failures. Next: fire-escape placement and roof gaps in the index builder once the engine confirms the type and mesh ownership.

## vs GTA V / VI / RDR2 (REFERENCE_GAMES.md; behaviour and quality only, nothing copied)
Judged on grades_board_v3_furniture.jpg, the Corwin walk-ins and the coverage report.

| Axis | What the reference does | Where we match | Where we fall short | Plan |
|---|---|---|---|---|
| Interior density and storytelling clutter | RDR2: every enterable room is a hand-dressed story (personal effects, mess that tells who lives there). GTA V: few enterable buildings, but those are dense. GTA VI (trailers): more enterables, with lived-in clutter | Breadth already beats GTA V: 100% of ground buildings have a door, about 73% of commercial frontage is enterable, and grade clutter tells derelict-to-pristine. The Corwin rooms carry character-specific props (Teddy's footlocker, photos, calendar) | Clutter is generic and sparse in large shops; there are no personal effects per occupant in Tier B, and the props are primitive boxes, so the read is "dressed set", not RDR2's "someone lives here" | Per-occupant dressing sets (job, age, vice) driven by sim residents; real CC0 or modelled props replace the boxes (oversight sequence step 3); a clutter density target per m² by grade |
| Lighting quality | RDR2: lamp-lit interiors with strong window shafts, GI bounce, deep contact shadow, warm/cool contrast. GTA V: baked lighting plus dynamic lights, with reflections on floors | Warm lamp pools, window light gated by portals, one-bounce fill, and grade-driven dying lamps give the right mood direction | Unlit vertex-baked material: no normal or roughness response, no sun shafts, no dynamic shadows, coarse AO, no reflections. Derelict reads as underexposed, not atmospheric. Well below the floor | ENGINE_REQUESTS 9 (PBR library, probes, SSAO, reflection probes), then the renderer conversion with sun through windows following time of day |
| Entry and exit transitions | RDR2 and GTA V: seamless doors for most interiors; GTA V uses loading cuts for some missions | Seamless: real facade doors, streaming at 30 m, portal culling, no loading screens anywhere | Door animation and hand IK are not in yet; the exterior facade cut is pending the engine merge (request 1); exterior-to-interior exposure adaptation is unverified | Engine merge of the facade cuts; ask characters for door-push animations; check the eye-adaptation curve at a door at noon once on the PBR path |
- Fire escapes and roof gaps (index builder, `public/data/interiors/traversal/<i>_<j>.json`, 94 chunk files, 1.8 MB raw): 991 street-front fire escapes, on walk-up tenements and lofts of 4-8 floors built 1867-1940, with about 15% left bare. Marks: 4,231 platforms, 4,231 sills, 3,240 stair flights, 991 gooseneck roof ladders, and 991 drop ladders 2.5-5.3 m long, flagged noisy. 1,130 roof gaps of 0.75-4 m (median 1.75 m), landing between 0.6 m higher and 6 m lower (median 1.0 m down). The engine builds the fire-escape meshes from these marks (oversight ruling). Not yet checked: overlap with facade doors and signage, and rear-yard fire escapes.

## Grand Central Terminal (user decision 2026-11-27)
Plan in docs/interiors/GRAND_CENTRAL_PLAN.md: 1974 content list, engine/interiors split (ENGINE_REQUESTS 11), build order, vs RDR2 Saint Denis station. The build waits on the PBR foundation.

## Free-asset scouting (FREE_ASSETS.md, $0)
- docs/interiors/PROP_SET.md: the period prop list (priorities A/B/C). docs/interiors/PROP_CANDIDATES.md: about 85 candidates judged.
  - A: 24 of 26 items have an acceptable free model. B: about 15 of 24.
  - Best sources: Poly Haven (CC0) and Sketchfab CC0/CC-BY. Spot-checked: Poly Haven ids resolve via its API (caged_hanging_light 22.9k tris, ceiling_fan, desk_lamp_arm_01); Sketchfab "Bentwood chair" and "Diner Stool" are CC Attribution and downloadable.
- Gaps, to be modelled procedurally with bevels and normals: dinette chair and table, clawfoot tub, high-tank toilet, console TV, wall payphone, opal globe, booth, tanker chair, display case, mailbox bank, cigarette machine, coin-op washer, window AC.
- Blockers needing the user's free accounts:
  - Sketchfab downloads require a logged-in account.
  - Smithsonian Open Access needs a free api.data.gov key.
- Before adoption: confirm the CC-BY version (4.0) on each Sketchfab model page, strip brand marks (listed in the candidates file), and log each in docs/licenses/ASSETS.md.
- **CC0 prop pipeline (Poly Haven, no account):** tools/interiors/fetchProps.ts downloads 18 models (the hero-room picks from PROP_CANDIDATES), downsizes textures to 512 px JPEG, and packs each into one GLB in public/models/interiors/ (6.0 MB total, 600-16k tris each). It writes src/interiors/props/manifest.json (bounds computed through the node TRS) and the ledger rows in docs/licenses/ASSETS.md (CC0 1.0, polyhaven.com/license, checked 2026-11-27).
  - Generators place models with `Kit.model(key, x, y, z, yaw)`, carried in `BuiltInterior.models`. The runtime parents each model to its cell mesh, so portal culling hides it with the cell. `src/interiors/runtime/models.ts` is a small GLB reader on three/webgpu, because GLTFLoader would pull in a second copy of three.js.
  - First use: a slat-back chair in Teddy's room 9F (docs/interiors/first_cc0_model_corwin_v1.png).
  - Honest critique: the model reads as pasted in. Its lit PBR material is far brighter than the baked room around it, and the interim point lights from `cellLights` don't match the bake. This is the expected seam until the engine's PBR and probe foundation (request 9) lights the rooms and the props with the same lights.
  - To verify: the facing offset per model, and scale (`kitchen_table` is 0.96 m high, so it needs about 0.8× scale; `suitcase` bounds are 1.6 m wide, so check its scale before use).
