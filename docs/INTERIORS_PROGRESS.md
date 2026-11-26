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

## Next
1. Hero: Corwin lobby + 11th floor (room 1104, room 1112, shared bath, window to the Empire
   State), Teddy's room 9F.
2. Walk-in sequences: diner, bar, loft, tenement to roof, Corwin.
3. Tier C shader with an engine integration proposal.
4. Condition grades (shared `condition.ts`) driving materials and wear; interior reference library.
5. The new requirements from oversight: subway stations and tunnels, lead homes, hospital ER,
   booking room and holding cell, garages and car lots, economy `upgradeLevel`, nav graph export
   for police pursuit.
