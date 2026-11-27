# Asset and tool licences

Licence gate: docs/briefs/FREE_ASSETS.md. Each stream appends its own section. For every entry, the
licence was checked by reading the actual LICENSE/COPYING file, not a badge or listing.

## Audio (audio stream, branch claude/audio-tenderloin-74)
Checked 2026-11-27. **No third-party audio is used.** Every shipped sound is self-made synthesis
(per-file ledger: docs/AUDIO_SOURCES.md and docs/AUDIO_SOURCES_VOICES.md). No Freesound, Sonniss, BBC or other
library files are in the build. If any are adopted later, each gets a row here first (Freesound: CC0 or CC-BY 4.0 only,
credited; Sonniss GDC bundles: only after reading the bundle licence for game use and web-build redistribution).

| What | Source | Licence (file read) | Files / where | Shipped to players? | Attribution |
|---|---|---|---|---|---|
| All baked one-shots, loops, engines, ambience, music, weather, vendor sounds | Own procedural synthesis (`src/audio/synth`, `src/audio/worklets`) | Project's own work | Generated in the browser at load; `public/audio/thunder.*` (own bakes, encoded) | Yes | None needed |
| Rendered speech (`public/audio/voice/`, build output, not in git) | Generated at build time by eSpeak NG from narrative's own lines | The audio is program output from our own text. eSpeak NG's code and voice data are GPL-3.0 and are **not** shipped (see next row). | `npm run audio:voices:build` | Yes (the audio only) | None needed; eSpeak NG credited in Credits as a courtesy |
| `@echogarden/espeak-ng-emscripten` 0.3.5 (eSpeak NG, WASM) | npm; source github.com/echogarden-project/espeak-ng | GPL-3.0 (`COPYING` in the package, read) | `tools/audio/voices.ts`, Node, build time only | **No.** Gate allows GPL tools at build time only; no `src/` import, absent from the production bundle (verified) | n/a |
| `ffmpeg-static` 5.3.0 (static ffmpeg binary) | npm | Wrapper `LICENSE` GPL-3.0; binary `ffmpeg.LICENSE` GPL-3.0 (both read) | `tools/audio/voices.ts`, `tools/audio/bake.ts`, `tools/audio/foley-check.ts`, separate process at build/dev time | **No** | n/a |

Not allowed for audio (gate): BBC Sound Effects (RemArc licence is non-commercial), any NC/ND or "no raw
redistribution" library, real recorded music, imitations of real voices, stations or jingles.

## UI, map and cinematics (UI stream, branch claude/ui-cinematics)
The date is the check date. Since 2026-11-27 the vehicle decals and street-sign blades also use the T74 faces and Libre Franklin (engine).

| Asset (shipped files) | Source | Licence | Checked | Attribution / notes |
|---|---|---|---|---|
| T74 Heros, Heros Cn, Schola, Cursor (`public/fonts/T74*.woff2`) | TeX Gyre, CTAN `fonts/tex-gyre` (GUST e-foundry) | GUST Font License (LPPL 1.3c) | 2026-11-26 | Renamed subsets, as the licence asks. **Not OFL**: this conflicts with FREE_ASSETS "OFL only" and is raised with the user for a decision (keep, or swap to OFL/Apache equivalents) |
| Libre Franklin (`public/fonts/LibreFranklin-500-900.woff2`) | github.com/google/fonts `ofl/librefranklin` | SIL OFL 1.1 | 2026-11-26 | Licence text in `public/fonts/OFL-LibreFranklin.txt` |
| Map pictograms, landmark glyphs, touch and HUD glyphs | Our own, drawn in code (`src/ui/map/pictograms.ts`, `src/ui/Prompts.ts`) | Ours | 2026-11-27 | No third-party icon set yet. If one is adopted, Tabler/Lucide (MIT) or Phosphor (MIT) per FREE_ASSETS, logged here |
| Title wordmark (`public/ui/wordmark.svg`) | Our own constructed lettering (`tools/ui/wordmark.py`) | Ours | 2026-11-26 | Not a font |
| Map street geometry, landmark and subway positions | OpenStreetMap, via the engine's `public/data` | ODbL 1.0 | 2026-11-27 | "Map data © OpenStreetMap contributors, ODbL" on the title footer, the map screen and Credits › Data sources |
| Building footprints and heights (in map renders) | NYC Open Data (Building Footprints, PLUTO), via the engine | NYC Open Data terms of use | 2026-11-27 | "NYC Open Data" beside the OSM credit |
| Map aerial tile pyramid (`public/map/aerial/{0-3}/*.webp`, `manifest.json`) | Our own engine renders (`tools/ui/mapAerial.ts` colour + height passes, graded by `tools/ui/mapComposite.py`) | Ours (derived from OSM and NYC Open Data below) | 2026-11-27 | Underlying geometry: OpenStreetMap contributors (ODbL 1.0) and NYC Open Data (building footprints, heights). Map screen shows "Map data © OpenStreetMap contributors, ODbL" and "NYC Open Data" |
| Map aerial renders (mockups; directions A and C) | Our own engine, rendered by `tools/ui/mapAerial.ts` | Ours (derived from the data above) | 2026-11-27 | Carries the same data credits |
| Cutscene and UI sounds | None shipped by this stream | — | — | Audio is the audio stream's |
| Reference images (period print, game UIs) | Listed in `docs/research/UI_REFERENCES.md` | Various ©, and public domain | 2026-11-26 | **Never committed or shipped**: links only |

## Vehicles

All the vehicle textures come from **ambientCG**. The licence was checked on 2026-11-27 at
https://docs.ambientcg.com/license/, which says: "All ambientCG assets are provided under the Creative
Commons CC0 1.0 Universal License… You can include the raw files in your project, for example a video
game."

Each file was converted to greyscale, resized to 512² and re-encoded as JPEG (q88).

| File (public/vehicles/tex/) | Source asset | Source map | Licence | Used for |
| --- | --- | --- | --- | --- |
| rubber_h.jpg | [Rubber004](https://ambientcg.com/view?id=Rubber004) | Displacement (1K-JPG) | CC0 1.0 | tyre micro-texture (bump) |
| rubber_r.jpg | Rubber004 | Roughness | CC0 1.0 | tyre roughness |
| leather_h.jpg | [Leather026](https://ambientcg.com/view?id=Leather026) | Displacement | CC0 1.0 | vinyl roof and seat grain (bump) |
| leather_r.jpg | Leather026 | Roughness | CC0 1.0 | vinyl and seat roughness |
| metal_r.jpg | [Metal009](https://ambientcg.com/view?id=Metal009) | Roughness | CC0 1.0 | chrome wear in the roughness |
| grime.jpg | [SurfaceImperfections003](https://ambientcg.com/view?id=SurfaceImperfections003) | Color | CC0 1.0 | dirt and rain-streak mask on paint and glass |

Optional credit (CC0 needs none): "Created using Rubber004, Leather026, Metal009 and
SurfaceImperfections003 from ambientCG.com, licensed under CC0 1.0 Universal."

Period photographs in `references/` are reference only (shape and colour) and are not shipped.

## Interiors: prop models (tools/interiors/fetchProps.ts)

| Key | Asset | Source | Licence | Checked | Files | Authors / attribution |
|---|---|---|---|---|---|---|
| kitchen_chair | Painted Wooden Chair 02 | https://polyhaven.com/a/painted_wooden_chair_02 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/kitchen_chair.glb | Kirill Sannikov (no attribution required) |
| kitchen_chair_b | Painted Wooden Chair 01 | https://polyhaven.com/a/painted_wooden_chair_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/kitchen_chair_b.glb | Kuutti Siitonen (no attribution required) |
| kitchen_table | Painted Wooden Table | https://polyhaven.com/a/painted_wooden_table | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/kitchen_table.glb | Kirill Sannikov (no attribution required) |
| cloth_table | Dining Table | https://polyhaven.com/a/dining_table | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/cloth_table.glb | Aron Łyczek (no attribution required) |
| kitchen_cabinet | Painted Wooden Cabinet | https://polyhaven.com/a/painted_wooden_cabinet | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/kitchen_cabinet.glb | Kirill Sannikov (no attribution required) |
| club_sofa | Sofa 02 | https://polyhaven.com/a/sofa_02 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/club_sofa.glb | Kirill Sannikov (no attribution required) |
| parlour_armchair | Arm Chair 01 | https://polyhaven.com/a/ArmChair_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/parlour_armchair.glb | Kirill Sannikov (no attribution required) |
| settle_bench | Painted Wooden Bench | https://polyhaven.com/a/painted_wooden_bench | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/settle_bench.glb | Kirill Sannikov (no attribution required) |
| cafe_table | Round Wooden Table 01 | https://polyhaven.com/a/round_wooden_table_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/cafe_table.glb | Ulan Cabanilla (no attribution required) |
| bar_stool | Metal Stool 01 | https://polyhaven.com/a/metal_stool_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/bar_stool.glb | Ulan Cabanilla (no attribution required) |
| steel_desk | Metal Office Desk | https://polyhaven.com/a/metal_office_desk | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/steel_desk.glb | Ulan Cabanilla (no attribution required) |
| steel_rack | Worn Metal Rack | https://polyhaven.com/a/worn_metal_rack | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/steel_rack.glb | Luca B (no attribution required) |
| barber_chair | Barber Shop Chair 01 | https://polyhaven.com/a/BarberShopChair_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/barber_chair.glb | Fernando Quinn (no attribution required) |
| bulb_socket | Pull Chain Light Socket | https://polyhaven.com/a/pull_chain_light_socket | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/bulb_socket.glb | Josh Dean (no attribution required) |
| bulb | Lightbulb 01 | https://polyhaven.com/a/lightbulb_01 | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/bulb.glb | Josh Dean (no attribution required) |
| enamel_pendant | Hanging Industrial Lamp | https://polyhaven.com/a/hanging_industrial_lamp | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/enamel_pendant.glb | Kuutti Siitonen (no attribution required) |
| suitcase | Vintage Suitcase | https://polyhaven.com/a/vintage_suitcase | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/suitcase.glb | Maximilian Schuster (no attribution required) |
| toolbox | Metal Toolbox | https://polyhaven.com/a/metal_toolbox | CC0 1.0 (https://polyhaven.com/license) | 2026-11-27 | public/models/interiors/toolbox.glb | Mateusz Sadek (no attribution required) |
