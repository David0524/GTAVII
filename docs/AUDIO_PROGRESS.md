# AUDIO_PROGRESS: Tenderloin '74 audio workstream

Source of truth across sessions. Read this first; update it last.
Branch: `claude/audio-tenderloin-74` (from `claude/tenderloin-74-engine-qi54lt`). Brief: `docs/briefs/AUDIO_BRIEF.md`.

## Status
| Area | State |
|---|---|
| Engine: buses, ducking, TP limiter, loudness profiles, voices, 3D, Doppler | **Done**, measured |
| Street-canyon acoustics from footprints, interiors, occlusion + corner diffraction | **Done**, measured |
| iOS/Safari unlock, background/interrupt/bfcache handling | **Done in code; needs the real-device checklist** (`docs/AUDIO_DEVICE_CHECKLIST.md`) |
| Streaming (Opus/WebM + AAC/MP4), memory budget, area preload | **Done** (thunder streamed; everything else baked in a worker) |
| Ambience (beds, gratings + real subway lines, AC, steam, neon, signals, sirens, window/bar radios, birds, kids, garment district, weather, brownout, calendar events) | **Done, first pass** |
| Vehicles (procedural engines, traffic mass, horns, skids, impacts, brakes, doors, compactor, manholes) | **Done, first pass** (driven by a mock sim until sim/vehicles merge) |
| Reactions (honk, collision, nearMiss, hail), footsteps by surface, crowd walla | **Done, first pass** |
| Radio framework (real-time stations, news by date, static, speakers) | **Done**; music = **procedural period-style instrumentals** (soul/disco, salsa, easy strings, jazz), narrative's 4 stations wired |
| Dialogue/barks, subtitle timing, overheard N3, phone/radio filters | **Done**; voice = **eSpeak NG rendered offline** for all 1,428 narrative lines (dialogue, barks, DJ patter); formant mumble only as fallback |
| UI sounds (menus, map, reel-change switch, pickups, phone) | **Done** |
| Offline test, WAVs, report | **Done** — `npm run audio:test` → `shots/audio/` |
| Engine wiring | Requested (ENGINE_REQUESTS.md "From audio" 1–10); my only `main.ts` change is the guarded `?audio` line |

## How to run
- `npm run dev`, open `/?audio=1` — interactive test scene (map, meters, buttons). `?quality=low` for the phone preset.
- `npm run audio:test` — headless 60 s renders from three listener positions, all assertions, WAVs + `shots/audio/report.json`. ~5 min CPU.
- `npx tsx tools/audio/stems.ts --only herald_rush` — per-bus stems with loudness and octave balance (mix work).
- `npm run audio:bake` — re-encode the streamed assets (thunder) to Opus and AAC + manifest.

## Architecture
```
src/audio/
  index.ts            AudioSystem: the brief's contract + additive extensions
  config.ts           quality presets (voices, engines, HRTF count, FDN size, budgets), distance curves, MIX_DB desk, loudness profiles
  env.ts              shared state object handed to subsystems (no globals)
  core/runtime.ts     AudioContext lifecycle: worklet load, iOS unlock, suspend/resume on hide/pagehide/freeze/interrupt
  core/mixer.ts       buses -> duckers (dialogue keys radio -11 dB, ambience -5 dB) -> exterior filter -> master -> trim -> bus compressor -> TP limiter
  core/voices.ts      VoiceManager: real/virtual voices, priority x audibility scoring, stealing, promotion budget, distance/air/occlusion/diffraction, sends, Doppler
  acoustics/geometry.ts  footprint edges in a 16 m grid (ray casts, LOS), parks, street centrelines + intersections
  acoustics/canyon.ts    10 Hz canyon measurement -> early reflections + FDN params; interior profiles by kind
  worklets/processors.ts all AudioWorklet DSP (engine, traffic, rain, walla, voice, FDN, early, ducker, limiter, static, placeholder music)
  synth/bake.ts       baked one-shots (pure TS; runs in a worker at load and in Node for the asset build)
  synth/live.ts       native-node sources (horns, sirens, skids, gratings, steam, AC, hum, roar, wind, aircraft) + engine graph
  assets/bank.ts      sound bank: groups, worker baking, streaming with codec choice, memory budget + LRU eviction
  world/cityMap.ts    avenue/street positions from streets.json, districts, clock curves, weekday
  world/subway.ts     1974 subway lines under the real streets, trains by headway, grating response
  world/ambience.ts   beds, point-emitter streaming, scheduled events (sirens, carts, birds, thunder, bells, fireworks...)
  world/footsteps.ts  surfaces, external footstep events, procedural ped steps
  vehicles/vehicles.ts attached vehicles, traffic LOD + sectors, sim events, drivetrain model
  radio/              stations (PLACEHOLDER defs), real-time scheduler, feeds, speakers, tuning static
  dialogue/           playback, subtitles, overhear (N3), barks, placeholder voice
  test/               ?audio=1 scene, offline harness, scenarios, mock sim (test-only)
tools/audio/          render.ts (the test), loudness.ts (BS.1770-4 + TP), wav.ts, stems.ts, bake.ts, scene-shot.mts
```

## Decisions (and why)
- **Everything is synthesised; no samples at all.** It satisfies the provenance rules trivially,
  keeps first-playable audio tiny, and makes every sound parametric (variation, period types, LOD).
  The cost is realism in a few families (see critique). Recorded CC0 material can still slot in
  through the bank's manifest with a row in AUDIO_SOURCES.md.
- **Heavy DSP in one AudioWorklet module**; main thread only schedules and sets parameters.
- **Reverb is a parametric FDN + listener-centric early-reflection taps, not convolution**, so the
  canyon measurement can morph it continuously as you walk (convolution would need crossfaded IR
  banks). Interiors reuse it with fixed profiles.
- **Corner diffraction** through the nearest visible intersections (a sound round the block comes
  from the corner, longer and duller) instead of only low-passing occluded sources.
- **Traffic LOD:** nearest N vehicles (6 High, 2 Low) get full engines; the rest drive four sector
  beds around the listener (granular), weighted by whether they're in the listener's canyon.
- **Loudness:** a mixing-desk table of category trims, then per-profile trim → bus compressor
  (mobile 2:1 above −18 dBFS; home theatre bypassed) → lookahead true-peak limiter at −1.5 dBTP.
  Targets are met on the "session" (all three scenes back to back), not per scene: 3 a.m. on a
  side street must be much quieter than rush hour.
- **Lightning is audio-led** (emits `lightning` with the delay before thunder) so the visual comes
  first, per the never-audio-only rule (requested from the engine).
- **Settings, wiring, world state and the never-audio-only UI** are engine-owned; requested.
- **Free music and voice (user decision 2026-11-26).** Music is generated live per song seed in the
  worklet (deterministic, so stations can be joined mid-song). Speech is rendered offline with eSpeak
  NG: formant synthesis means no real person's voice is imitated and no model licence is involved,
  and keeping it a build step keeps GPL code out of the shipped game. Files are keyed by
  hash(speaker|emotion|text) so edits fall back to the placeholder voice instead of breaking. Cost:
  34 MB of encoded speech in the repo (Opus + AAC). Casting reads the pronouns in the narrative's own
  cast descriptions, never names; 6 named characters with no cast entry get a neutral voice until
  narrative adds them; overrides in `tools/audio/casting.json`.

## Honest critique of the renders (`shots/audio/*.wav`)
**Read this first:** I can't hear. This critique comes from measurements (stems per bus and per
voice group, octave balance, loudness range, correlation) and from what each synthesis method is
known to do. Your ears on the WAVs and in `?audio=1` overrule it.

What should already read as 1974 Midtown:
- **The space.** Reflections and reverb come from the real footprints. Narrow side streets get the
  flutter slapback between parallel facades, avenues are wider and later, and parks open up. Sounds
  round a corner arrive from the corner, duller and later. This is the most "AAA" part and costs
  little.
- **Rain.** Modal rain (Minnaert bubbles, pings on car roofs, thumps on awnings) is the best
  procedural rain method known. It keeps dripping for minutes after the rain stops.
- **The traffic body at rush hour:** a dense, horn-punctuated avenue (1974 honking was constant),
  with buses' two-stroke howl and the V8 burble of near cars. Wet roads hiss.
- **Night layers:** the electrical hum that drops out in a brownout, window AC units rattling and
  dripping, steam, gratings breathing when a train passes under the real line, ship horns off the
  Hudson, a siren wandering the grid with the canyons bouncing it.

What will sound like a tech demo (worst first):
1. **Placeholder voice and crowd walla.** Formant "mumble" is plainly synthetic up close; it's fine
   as distant crowd texture but not as speech. It waits on your voice decision.
2. **Placeholder radio music** is deliberately plain. It waits on your music decision.
3. **Horns** are oscillator-based. A real 1970s disc horn has a rougher, beating, nonlinear
   buzz; ours is cleaner and more "electronic", especially solo and up close.
4. **Engines at steady mid revs** can turn buzzy/periodic. The pulse-and-waveguide model gets idle
   lope and burble right but lacks the turbulence and mechanical chaos of a real worn V8 at 2,500 rpm.
5. **Birds** (FM chirps) are cartoonish if you listen for them. They stay quiet in the mix.
6. **Traffic sectors** at distance can read as filtered noise "wash" rather than discrete cars.
   Distant traffic is mostly that in reality too; mid-distance pass-bys are thin because only the
   nearest 6 (High) / 2 (Low) cars are full engines.

## Measurements (`npm run audio:test`, 60 s per run; all assertions passed)
Generated 2026-11-26T15:43:27.337Z. Headless Chromium OfflineAudioContext in a CPU-only container: timings are CPU-only, not device numbers.

Meter self-test: 1 kHz at −23 dBFS reads -22.99 LUFS; fs/4 sine true peak -0.17 dBTP. Limiter torture (impulses ×4, +12 dB bursts, fs/4 sines, 20 kHz sweep): -1.46 dBTP out, 0 safety clamps.

| Scene | Preset / profile | Integrated LUFS (ffmpeg) | True peak dBTP | Short-term max | LRA LU | Limiter >1 dB / max GR | Real voices max / cap | update ms p50 / p95 / p99 / max | Leaked nodes | NaN / denormals |
|---|---|---|---|---|---|---|---|---|---|---|
| herald_rush | high / mobile | -14.27 (-14.3) | -1.50 | -11.2 | 5.0 | 0.0 % / -0.9 dB | 39 / 64 | 0.30 / 0.80 / 1.60 / 15.9 | 0 (of 403 wired) | 0 / 0 |
| side_3am | high / mobile | -24.79 (-24.8) | -7.42 | -18.2 | 10.2 | 0.0 % / 0.0 dB | 13 / 64 | 0.10 / 0.30 / 0.80 / 3.8 | 0 (of 132 wired) | 0 / 0 |
| eighth_rain | high / mobile | -15.29 (-15.3) | -1.50 | -12.7 | 4.9 | 0.0 % / -0.2 dB | 39 / 64 | 0.30 / 0.70 / 1.50 / 7.7 | 0 (of 401 wired) | 0 / 0 |
| herald_rush | high / homeTheatre | -21.48 (-21.5) | -4.41 | -16.7 | 8.2 | 0.0 % / 0.0 dB | 39 / 64 | 0.30 / 0.70 / 1.70 / 5.5 | 0 (of 403 wired) | 0 / 0 |
| side_3am | high / homeTheatre | -34.22 (-34.2) | -16.34 | -27.5 | 10.3 | 0.0 % / 0.0 dB | 13 / 64 | 0.10 / 0.30 / 0.60 / 5.0 | 0 (of 132 wired) | 0 / 0 |
| eighth_rain | high / homeTheatre | -23.15 (-23.2) | -5.40 | -19.7 | 6.6 | 0.0 % / 0.0 dB | 39 / 64 | 0.30 / 0.60 / 1.40 / 3.6 | 0 (of 401 wired) | 0 / 0 |
| herald_rush | low / mobile | -16.15 (-16.2) | -1.50 | -13.0 | 4.9 | 0.0 % / -0.7 dB | 24 / 24 | 0.20 / 0.60 / 1.20 / 3.8 | 0 (of 346 wired) | 0 / 0 |

| Session (scenes back to back) | Integrated LUFS | Target | True peak dBTP | LRA LU |
|---|---|---|---|---|
| high/mobile | -15.39 | −16 ±1 | -1.50 | 15.8 |
| high/homeTheatre | -22.78 | −23 ±1 | -4.41 | 18.9 |

| Scene | Octave bands 63..8k (dB) | L/R correlation | Bank MB (budget) | Mean update parts (ms) |
|---|---|---|---|---|
| herald_rush (high) | -23.2 / -22 / -22.2 / -23.7 / -26.6 / -30.8 / -36 / -42.5 | 0.666 | 38.1 (58), evicted 0, streamed 4 | canyon 0.016, radio 0.004, ambience 0.083, vehicles 0.065, footsteps 0.027, voices 0.169 |
| side_3am (high) | -32.9 / -31.9 / -32.5 / -34.7 / -38.1 / -42.4 / -47.6 / -54.3 | 0.535 | 38.1 (58), evicted 0, streamed 4 | canyon 0.012, radio 0.003, ambience 0.041, vehicles 0.030, footsteps 0.004, voices 0.050 |
| eighth_rain (high) | -23.8 / -23 / -23.9 / -25.9 / -28.6 / -31.2 / -34.4 / -38.9 | 0.719 | 38.1 (58), evicted 0, streamed 4 | canyon 0.014, radio 0.003, ambience 0.082, vehicles 0.063, footsteps 0.013, voices 0.147 |
| herald_rush (low) | -23.6 / -23.8 / -24.6 / -25.9 / -28.3 / -31.8 / -36.4 / -42.5 | 0.681 | 22.6 (23), evicted 4, streamed 4 | canyon 0.012, radio 0.004, ambience 0.079, vehicles 0.037, footsteps 0.010, voices 0.115 |

Failures: none

Reading the numbers honestly:
- **Main-thread budget:** p95 is 0.8 ms on High and 0.6 ms on Low, inside the 1 ms and 1.5 ms budgets.
  But p99 is 1.6 ms on High, and there is one 16 ms spike per run, from first-frame voice promotions.
  The HRTF warm-up and the promotion cap reduced it but haven't removed it. These are CPU-only
  numbers from headless Chromium; phones will be slower.
- **Memory:** the High preset decodes 38 MB of its 58 MB budget (plus 2.4 MB of noise tables). The
  Low preset runs at its 23 MB budget and evicts 4 groups when every group is forced resident,
  which is the LRU working as designed.
- **First playable audio:** about 152 KB of audio JS (55 KB gzipped) plus the world data the engine
  already loads (streets 87 KB, chunks 307 KB). Thunder streams as 50–63 KB Opus or 75–91 KB AAC.
  That is well under 2 MB.
- **Loudness:** the session sits at −15.4 LUFS on mobile and −22.8 on home theatre. The 3 a.m. side
  street is about 10 LU under rush hour, which is deliberate. The limiter rarely acts (under 0.1 %
  of the time above 1 dB of gain reduction); peaks are held by the bus compressor and the curves.
- **Coverage gaps in the test:** the scenarios are outdoors, so room tone and interior blends are
  covered by `?audio=1` only. The render ran before the last interior commit, so the WAVs don't
  exercise that code.

## Backlog relayed from the oversight session (2026-11-26; not in the original brief)
Recorded as scope additions to plan for; the brief's "done means" came first.
- **Combat (Gameplay stream):** period gunfire by invented model and tier (cheap guns sound cheap),
  canyon slapback/long echo as the signature, bullet impacts by material, ricochets, whizzes, melee,
  gun-jam click. Loudness plan: gunfire gets its own category with a short-term "HDR window" that
  ducks the world bed 4–8 dB for ~1 s after a shot (sidechain like dialogue), so shots stay loud
  without pushing the integrated level; the TP limiter already holds −1.5 dBTP (torture-tested).
- **Police/heat:** dispatch radio chatter as the main heat cue (tiers up to an "officer down" set with the band's tone shift, and response-surge sirens) (needs the voice decision; radio
  filter exists), units calling positions, sirens by escalation tier, police whistles, call-box
  alarm bells, cuffs, the radio-car door, civilians pulling over.
- **Vehicles+:** overheating (hiss, steam, ping/knock, sputter), misfires (the synth already has a
  misfire model), stall, struggling starter (vapour lock, flooding, weak battery), slim-jim,
  window-smash and hot-wire foley; motorcycles; bicycle bells; fire engines.
- **Edges/boundaries:** edge soundscapes (film-shoot generators and bullhorns, utility jackhammers
  and steam, hydrant spray, block-party band, gridlock honking) and the "reel runs out" layer
  (projector clatter rising, leader beeps, then the same reel-change cut as the character switch,
  which `ui.switch` already is), driven by the engine's `edgeDistance(x, z)`.
- **Interiors:** doorway transitions and room tone by kind — **done** (`setInterior(kind, { blend, roomVolume })`, `world/roomTone.ts`).
- **More world:** subway platforms (reverb profile `subway` exists), token booth, turnstiles; pigeon
  flock wing bursts, rat skitter; TV/cinema audio from screens; pinball/arcade; cabbie
  turn-by-turn callouts; winded breathing from stamina; fire crackle; crowd panic; hydrant geysers.
- **Cutscene mixing:** timeline cues from the UI & cinematics stream (snapshot API: duck world,
  hold radio, spot effects).

## Known issues / next
- eSpeak speech is intelligible but robotic; music is credible as period radio filler, not as hits. Both are swappable behind the same APIs.
- Re-run `npm run audio:voices` whenever narrative text changes (needs `apt-get install espeak-ng`).
- Real-device checklist not yet run (iOS unlock, interruptions, silent switch, Bluetooth).
- Mock sim drives traffic/peds; re-measure once the sim and vehicles streams merge.
