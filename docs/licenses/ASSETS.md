# Asset licences: UI, map and cinematics (FREE_ASSETS.md: $0 budget, free licences only, every asset logged)

This is the UI & cinematics stream's section. Other streams append their own. The date is the check date.

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
