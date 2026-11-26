# UI_PROGRESS: UI, map and cinematics

Source of truth for the UI & Cinematics stream (branch `claude/ui-cinematics`, from
`claude/tenderloin-74-engine-qi54lt`). Read first, update last. Brief:
`docs/briefs/UI_CINEMATICS_BRIEF.md`; feature lines marked "UI chat" in `docs/briefs/FEATURE_AUDIT.md`.

## Hand-off
- **Agreed** (ENGINE_RESPONSES "UI & Cinematics: ui 1–5"). Freeze point `c3db008`; `src/ui/**` and
  `src/settings/Settings.ts` are this stream's. DebugHud and PerfReport stay engine-owned
  (`src/engine/debug/`).
- **Proposed shared contracts:** `src/shared/uiHost.ts` (queries) and `src/shared/uiEvents.ts`
  (events). Once merged they're engine-owned.
- **One-commit `main.ts` refactor:** done. It builds a `UiHost` adapter plus `bootUi()` and
  `ui.update()`, and is awaiting the engine's review at merge.
- **Input.ts:** one bindings patch (`settings.bindings`, defaults unchanged) plus the actions
  `inventory`, `weaponSelect`, `skip` and `waypoint`.
- **Save:** a `ui` section v1 (discovery, waypoint, annotations, papers read, achievements,
  cutscenes seen). Fixture: `tests/save-fixtures/ui.v1.json`.

## Status
| Area | State |
|---|---|
| Map discovery (user requirement) | **Done.** 284 places (narrative story places, 188 real subway entrances in 22 stations, flagged placeholders). Channels: sight, enter, tip, overheard, news, call, card, mission, start. Shady places never reveal by sight; collectibles are absent until found; "new" marks clear after you look; saved. 7 tests. |
| Minimap | **Done.** Tiled print of the street guide; deckled paper edge at the boundary; heading-up or north-up; discovered pictograms (upright) with red pencil rings; filters; police cones, units and search area; pencilled route; objective star pinned to the rim; zoom with speed. Layers are composited by CSS transform, so nothing is rasterised per frame. |
| Pencilled route (no GPS) | **Done.** A* on the real centrelines; on foot ignores one-ways and avoids expressways; by car honours the 1974 one-way table. Turn call-outs like "Left on Thirty-Fourth · 300 ft" are labelled with who's calling them. 3 tests. |
| Pause map (main hub) | **Done.** Full-bleed folding street guide (invented publisher Hollis & Crane): 4×3 folds, creases, paper grain, coffee ring, cartouche, and the coverage edge with the city beyond printed but greyed and hatched. Cartographic label placement (priorities, collision avoidance, leaders, zoom-dependent sets). Legend doubles as filters (an icon rail on phones). Taped info cards say how you found each place. Pencil waypoint and route, the player's own pencil marks, an "Ours" stamp on owned property. |
| HUD | **Done.** Objective line (≤ 40 chars enforced), cash with deltas, weapon with rounds and **concealment state**, diegetic health (red edge vignette, bandage tags), heat-exhaustion warmth, stamina strip, clock and date, neighbourhood reveal, discovery notes, route call-outs, prompts, and subtitles (scene and ambient). **Police heat via radio lines and minimap only (no stars).** Every element is On / Dynamic / Off. |
| Gameplay screens | **Done against mock data:** pockets with concealment, weapon selector (concealment-aware ring), shop counter (buy/sell, fence), newspaper (front page, results, the daily number with betting, the chop list as a mimeo sheet, ads that pencil places onto the map), business ledger (trend, book, the pad, trouble, upgrades, buy), record (stats, checklist, achievements), lead picker (three portraits, one big button, bail-out mode), dialogue choices (≤ 4, untimed, or a fuse ≥ 6 s; "Relax timers" disables fuses). |
| Front end | **Done.** Film-look title (the engine's, kept and extended), profiles (create, rename, delete with confirm, up to 4) and save slots, **74 settings + full remapping** (keyboard and controller per action, conflict swap, per-action and global reset, presets kept as bundles). Every setting says whether it's live or waits on another stream. Accessibility: text size, colour-blind palettes, high contrast, reduced flashing and motion, subtitle background, names and colours, captions toggle. Credits list every attribution and the **full licence text** of every bundled component (generated from `node_modules` and the font OFL). |
| Cinematics runtime | **Done.** Data timelines (`content/cutscenes/*.json`): Catmull-Rom camera with per-key easing, lens to FOV on 35 mm film geometry, period zooms, rack-focus data, lens-scaled handheld, gate weave, letterbox (2.39:1), grain, vignette, cards, subtitles, actor blocking across cuts, timed cues to the engine, choice holds, hold-to-skip, pause on touch. Seamless in and out via CameraDirector (`toGameplay` lands exactly on the live gameplay pose, then hands back with no blend and no black frame). 7 tests. |
| Cutscene tool `?cine=` | **Done.** Script panel, scrub timeline (keys, dialogue bars, cues), fly camera with K to key, lens/focus/stop/roll, focus-on-actor, actor marks clicked onto the street, shot ops, validation, film-look preview, JSON export and local autosave. |
| M1 opening | **Built with the tool** from narrative's shot list: 7 shots, 46 s, ending on the spawn shot and handing back to gameplay with the objective cue. New game plays it automatically. Frames: `shots/cine/m01_opening/`; the tool at work: `shots/cine/tool/`. |
| TIME screens, HOMES_AND_CARS screens | In progress (a Sonnet helper builds them to spec; reviewed before merge). |

## Architecture
```
src/shared/uiHost.ts, uiEvents.ts   contracts (proposed; engine-owned once merged)
src/ui/index.ts                     bootUi/createUi: state machine (title|play|paused|cutscene), wiring, toasts, iOS note
src/ui/host/MockHost.ts             full mock host (lab, screenshots, tests)
src/ui/map/                         grid (street names -> world), places, Discovery, Route (A*), MapModel,
                                    ink (paper, pencil, stamps), pictograms, labels (placement), MiniMap, FoldingMap
src/ui/hud/                         GameHud, radio (heat lines)
src/ui/screens/                     PauseHub (tabs), MapScreen, Pockets, Newspaper, Business, Record, Overlays
                                    (shop, leads, weapons, choices), SettingsTab, FrontTabs (saves, credits), Modal
src/ui/save/uiSection.ts            the 'ui' save section
src/settings/Settings.ts            single store, 74 keys + bindings (UI-owned)
src/cinematics/                     schema, Timeline (pure), CinematicPlayer, content loader, tool/CineTool
tools/ui/                           places.ts, credits.ts (data builders); shots, gameShots, cineShots, cineTool,
                                    touchRun, perf, profile, probe (rigs)
uilab.html + src/ui/lab/            every UI surface against the mock host, optionally over the real city
```

## Decisions (and why)
- **DOM/CSS for the chrome, Canvas2D for the maps.** Typography quality, accessibility (zoom,
  text scale, screen readers) and touch hit-testing are free in the DOM; the maps need custom ink.
- **The minimap never rasterises per frame.** Base tiles and the world overlay are canvases
  rotated by a CSS transform (the GPU compositor does it); pictograms, player, star and N are DOM
  elements. Each frame writes a few transforms.
- **One place catalogue, generated.** `tools/ui/places.ts` resolves narrative's intersection
  strings and reads subway entrances from chunk data. Generic businesses are deterministic,
  invented **placeholders**, flagged on the info card until interiors and narrative name the real
  ones.
- **The cutscene file has two layers.** Narrative writes the script layer and the tool writes the
  layout layer. Free text goes into `notes`, and the runtime reads only structured fields.
- **Seamless blend:** the last shot keys `toGameplay`, so its final pose *is* the gameplay pose.
  FOV is restored to the pre-cutscene value (the director doesn't blend FOV; I told the engine).
- **Settings honesty:** 46 of 74 keys are live today; the rest say which stream they wait on.

## Performance (measured; honest)
HUD + minimap, `ui.update()` wall time per frame, real rAF frames in the lab, the player walking
and turning, 844×390 at DPR 2, headless Chromium with SwiftShader (CPU raster; pessimistic for
canvas). `tools/ui/perf.ts`, timer resolution 0.1 ms.

| CPU | case | p50 | p95 | max |
|---|---|---|---|---|
| 1× (container core) | quiet | 0.2 ms | 0.5 ms | 1.7 ms |
| 1× | pursuit (cones, radio) | 0.2 | 0.5 | 1.9 |
| 1× | all 284 places known | 0.2 | 0.4 | 1.1 |
| 4× throttle (≈ mid phone) | quiet | 0.6 | 1.9 | 5.7 |
| 4× | pursuit | 0.7 | 1.7 | 5.0 |
| 4× | all places known | 0.9 | 2.2 | 5.3 |

- **Budget ≤ 0.5 ms on mobile Low:**
  - **Met at 1×.**
  - **Not met at 4×:** p50 is 0.6–0.9 ms, about 1.5× over.
- **The journey there:**
  - It started at p50 1.9 ms and p95 4–5 ms at 4×, with 15–30 ms spikes from tile rendering.
  - Fixes in order: removed forced layout; CSS-composited map layers; a spatial index for places;
    idle-time tile prefetch; DOM HUD at 30 Hz; host polling at 4 Hz.
- **Next steps:**
  - Measure on a real phone (`?hud=1` perf report).
  - If it's still over, move tile rendering to an OffscreenCanvas worker and batch pictogram
    transforms.
- **Menus open in < 100 ms:** the pause hub opens in one frame in the lab. The map's first draw
  is 15–40 ms under SwiftShader (vector streets); not yet measured on device.
- **UI assets:** fonts 0.36 MB (engine's); `places.json` 70 KB; `licences.json` 17 KB. No images
  (paper, pictograms and stamps are procedural). **Well under 3 MB.**

## "Done means"
- [x] HUD, minimap and pause map on a phone in landscape and on desktop:
  - mock: `shots/ui/`;
  - in game: `shots/ui/game/`.
  Before and after discovery: `map_before_*`, `map_after_*`, `hud_flat_*`.
- [x] Every gameplay screen working against mock data (`shots/ui/*`; lab: `uilab.html?screen=…`).
- [x] M1's opening built with the tool from narrative's script, captured as frames, blending into
  gameplay (`shots/cine/m01_opening/`, `shots/cine/tool/`).
- [x] Touch-only run through every menu: 26 steps, taps only, no page errors
  (`tools/ui/touchRun.ts`, `shots/ui/touch/`). It caught and fixed a real bug (the hub opened from
  the title was drawn under it).
- [x] Honest critique: below.

## Critique against the 2031 bar
**What holds up:**
- **The map language is the strongest piece and it's ours:**
  - a period street guide you pencil yourself;
  - discovery that never dumps icons;
  - a route drawn in graphite;
  - real cartographic type placement.

  No game's map looks like this.
- **The HUD is rightly sparse:** heat is radio text plus cones, concealment is legible, and the
  minimap hides when you stand still.
- **Systems are honest and tested:** the save section, settings that say when they aren't wired
  yet, licence texts pulled from the bundle, and 30 unit tests.
- **The cutscene pipeline is real:** narrative writes, the tool lays out, the runtime blends into
  play without a cut.

**What doesn't (yet):**
- **Cutscenes are blocked with capsule stand-ins.** Insert shots like s4 (the medal) are
  meaningless until the characters stream lands bodies, faces and hands. There's no lip-sync, no
  animation cues beyond walk/idle, and no lighting overrides.
- **No DoF exists yet:** rack focus is data only until the engine's Phase 3 post stack exposes
  `post.set`. Grain and weave are a DOM and camera approximation, not the TSL grade.
- **The city behind the UI is still untextured Phase 2 boxes.** A HUD over flat shading can't read
  as 2031 regardless of the UI.
- **Pictograms and stamps are good at small sizes but basic at large ones.** A period sign
  painter's hand-drawn set would raise them.
- **Lead portraits are silhouettes;** they need character renders.
- **Perf on phones is still about 1.5× over budget at 4× throttle** (above).
- **The map's first draw redraws vector streets:** fine on desktop, unmeasured on low-end phones.
- **Two engine gaps:**
  - gameplay data is still mock (no inventory, heat or objectives from the real game yet);
  - `uilab.html` isn't in the production build, because `vite.config` is engine-owned. To use it
    on a phone, run it in dev mode.

## Requests and coordination
- ENGINE_REQUESTS ui 1–5: accepted.
- **Narrative:**
  - the cutscene format was sent (script and layout layers, choice holds);
  - asked for a `discovery` field in places.json and a voice pool for passenger call-outs.
- **Oversight relays applied:**
  - radio stations paused (police-radio heat text stays);
  - map fixes (labels, full-bleed, printed-only landmarks, greyed beyond bounds);
  - legibility plates for the clock and the title tagline.
