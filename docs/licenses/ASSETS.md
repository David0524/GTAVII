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
