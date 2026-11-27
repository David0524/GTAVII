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
- **Free music and voice (user decision 2026-11-26, about 16:00 UTC, in this audio session).** After I
  asked for the music and voice sources with options and costs, the user's exact words were:
  *"Use free methods for now. Means you may have to generate speech locally."* Music is generated live per song seed in the
  worklet (deterministic, so stations can be joined mid-song). Speech is rendered offline with eSpeak
  NG: formant synthesis means no real person's voice is imitated and no model licence is involved,
  and keeping it a build step keeps GPL code out of the shipped game. Files are keyed by
  hash(speaker|emotion|text) so edits fall back to the placeholder voice instead of breaking. Cost:
  about 34 MB of encoded speech, so the renders are **not committed** (see below). Casting reads the pronouns in the narrative's own
  cast descriptions, never names; 6 named characters with no cast entry get a neutral voice until
  narrative adds them; overrides in `tools/audio/casting.json`.

## vs GTA V / VI / RDR2 (audio row of docs/briefs/REFERENCE_GAMES.md)
Behaviour and quality only; nothing is copied. Caveat: I can't play or listen to these games. The
reference column is general knowledge of how they behave, not a measured comparison. GTA VI is too new
for me to describe its audio reliably, so it isn't characterised below.

| Area | What the references do | Where we match | Where we fall short, and the plan |
|---|---|---|---|
| Ambience layering by block and time | Dense, hand-authored beds per district and hour; constant small one-shots; weather and time shift everything | Beds and events driven by real district data, clock curves, weekday/date, weather and power; dozens of emitter types placed from the map | Sound design is synthesised, not recorded; far fewer unique one-shots. Plan: the mix pass under way, then more event families per district |
| Footsteps by surface | Many surfaces, shoes, speeds; clean animation sync | 12 surfaces + traversal foley, kerb and grating auto-detected | Synthesised cloth/body foley is thin; no shoe types; sync waits on characters' events (request 9) |
| Gunfire and canyon echo | Signature tails and slapback in city streets | Built: per-shot image-source echoes from the real facades, travel time, HDR window; echo timing measured (26/26) | Synthesised shots are cleaner than recordings; few mechanical layers |
| Vehicle engines | Recorded, multi-layer engines with loads, gears, backfires | Procedural per-cylinder engines with real firing orders, load, gears, Doppler, LOD to traffic beds | Cleaner and more "synthetic" than recordings, especially at steady mid revs. Plan: add mechanical noise layers and per-class variation |
| Crowd walla | Recorded crowds with intelligible fragments and reactions | Density-driven formant walla on both sidewalks, kids in parks, narrative barks on horns/collisions | Formant babble is clearly synthetic up close; speech is eSpeak (placeholder tier) |
| Police dispatch | Radio chatter as a key cue | Built: stitched scanner from build-time fragments, driven by gameplay's radio/police/copKilled events; officer-down sequence with alert and siren surge | eSpeak fragments sound robotic; scanner is non-positional only (no car/cop radios yet) |
| Mix and ducking | Strong dynamic mixing; dialogue always clear; music ducks | Dialogue sidechain ducking, category mixing desk, loudness profiles, TP limiter, measured −16/−23 LUFS sessions, HDR window on gunfire | The HDR window covers gunfire only; explosions and crashes should use it too |
| Score cues | Adaptive score and radio | Procedural period instrumentals exist | Radio stations paused by the user; no adaptive score yet |

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
1. **Speech is a placeholder tier, not final.** eSpeak NG lines are intelligible but robotic (formant
   synthesis); nobody should mistake them for shipped voice quality. The crowd walla's formant
   "mumble" is fine as distant texture only.
2. **Placeholder radio music** is deliberately plain. It waits on your music decision.
3. **Horns** are oscillator-based. A real 1970s disc horn has a rougher, beating, nonlinear
   buzz; ours is cleaner and more "electronic", especially solo and up close.
4. **Engines at steady mid revs** can turn buzzy/periodic. The pulse-and-waveguide model gets idle
   lope and burble right but lacks the turbulence and mechanical chaos of a real worn V8 at 2,500 rpm.
5. **Birds** (FM chirps) are cartoonish if you listen for them. They stay quiet in the mix.
6. **Traffic sectors** at distance can read as filtered noise "wash" rather than discrete cars.
   Distant traffic is mostly that in reality too; mid-distance pass-bys are thin because only the
   nearest 6 (High) / 2 (Low) cars are full engines.

## Measurements (`npm run audio:test`, 60 s per run, 132-chunk map, radio off, after mix pass 1–2; all assertions passed)
Generated 2026-11-27T02:48:06.522Z. Headless Chromium OfflineAudioContext in a CPU-only container: timings are CPU-only, not device numbers.

Meter self-test: 1 kHz at −23 dBFS reads -22.99 LUFS; fs/4 sine true peak -0.17 dBTP. Limiter torture (impulses ×4, +12 dB bursts, fs/4 sines, 20 kHz sweep): -1.46 dBTP out, 0 safety clamps.

| Scene | Preset / profile | Integrated LUFS (ffmpeg) | True peak dBTP | Short-term max | LRA LU | Limiter >1 dB / max GR | Real voices max / cap | update ms p50 / p95 / p99 / max | Leaked nodes | NaN / denormals |
|---|---|---|---|---|---|---|---|---|---|---|
| herald_rush | high / mobile | -15.75 (-15.8) | -1.50 | -11.6 | 6.8 | 1.0 % / -3.0 dB | 37 / 64 | 0.30 / 0.90 / 1.90 / 29.1 | 0 (of 447 wired) | 0 / 0 |
| side_3am | high / mobile | -26.20 (-26.2) | -10.80 | -22.0 | 6.3 | 0.0 % / 0.0 dB | 13 / 64 | 0.10 / 0.30 / 0.60 / 6.4 | 0 (of 132 wired) | 0 / 0 |
| eighth_rain | high / mobile | -15.45 (-15.5) | -1.50 | -12.0 | 6.1 | 0.0 % / -1.0 dB | 30 / 64 | 0.30 / 0.80 / 1.50 / 6.0 | 0 (of 323 wired) | 0 / 0 |
| herald_rush | high / homeTheatre | -22.66 (-22.7) | -1.50 | -17.0 | 10.2 | 0.0 % / -0.8 dB | 37 / 64 | 0.30 / 0.70 / 1.60 / 6.2 | 0 (of 447 wired) | 0 / 0 |
| side_3am | high / homeTheatre | -35.28 (-35.3) | -19.79 | -31.1 | 6.3 | 0.0 % / 0.0 dB | 13 / 64 | 0.10 / 0.30 / 0.50 / 4.0 | 0 (of 132 wired) | 0 / 0 |
| eighth_rain | high / homeTheatre | -22.73 (-22.7) | -4.76 | -17.1 | 9.3 | 0.0 % / 0.0 dB | 30 / 64 | 0.20 / 0.70 / 1.40 / 18.2 | 0 (of 323 wired) | 0 / 0 |
| herald_rush | low / mobile | -16.71 (-16.7) | -2.54 | -14.6 | 3.5 | 0.0 % / 0.0 dB | 24 / 24 | 0.20 / 0.60 / 1.40 / 4.0 | 0 (of 313 wired) | 0 / 0 |

| Session (scenes back to back) | Integrated LUFS | Target | True peak dBTP | LRA LU |
|---|---|---|---|---|
| high/mobile | -16.28 | −16 ±1 | -1.50 | 15.0 |
| high/homeTheatre | -23.05 | −23 ±1 | -1.50 | 18.7 |

| Scene | Octave bands 63..8k (dB) | L/R correlation | Bank MB (budget) | Mean update parts (ms) |
|---|---|---|---|---|
| herald_rush (high) | -24.2 / -23.3 / -23.8 / -25.6 / -28.6 / -32.9 / -37.9 / -44.1 | 0.547 | 46.7 (58), evicted 0, streamed 4 | canyon 0.018, radio 0.005, ambience 0.109, vehicles 0.081, footsteps 0.030, voices 0.199 |
| side_3am (high) | -33.8 / -33.3 / -34.2 / -36.7 / -40.4 / -45 / -50.8 / -57.9 | 0.397 | 46.7 (58), evicted 0, streamed 4 | canyon 0.014, radio 0.003, ambience 0.037, vehicles 0.027, footsteps 0.004, voices 0.058 |
| eighth_rain (high) | -24.3 / -23.3 / -24 / -25.9 / -28.4 / -30.9 / -34 / -38.5 | 0.745 | 46.7 (58), evicted 0, streamed 4 | canyon 0.016, radio 0.003, ambience 0.089, vehicles 0.056, footsteps 0.016, voices 0.163 |
| herald_rush (low) | -24.6 / -24.7 / -25.2 / -26.4 / -29 / -33 / -38.1 / -44.3 | 0.573 | 22.6 (23), evicted 21, streamed 4 | canyon 0.015, radio 0.002, ambience 0.073, vehicles 0.040, footsteps 0.011, voices 0.126 |

Failures: none

Mix pass (2026-11-27), from `tools/audio/stems.ts` on three diagnostic scenes (not in the pass/fail suite):
| Scene | Layer | Before | After |
|---|---|---|---|
| Bryant Park noon | crowd | −39.9 LUFS | −24.6 |
| Bryant Park noon | traffic beds / horns | −21.5 / −21.5 | −26.0 / −24.3 |
| Garment District 10 a.m. | carts + dock bangs | −31.9 | −26.2 |
| Garment District 10 a.m. | horns | −15.6 | −16.7 (mock sim honks constantly in queues; the real sim sets the rate) |
| Brownout night | electrical hum layer | — | −46 (drops out as designed) |

Reading the numbers honestly:
- **Main-thread budget:** Herald Square on High runs p95 0.9–1.2 ms across the last three runs (0.9–1.0 on
  the 132-chunk map): **at or just over the 1 ms budget**. Low stays at 0.8 ms (budget 1.5). The same code varies by
  about 0.3 ms between runs on this shared container. The voice manager is the largest part (see the parts
  column); that's the next optimisation. There is still one first-frame spike per run from voice promotions.
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

## Paused: radio stations (user instruction relayed by oversight, 2026-11-26 16:31)
"Don't do radio stations right now." The code stays, but **station playback is off by default**
(`new AudioSystem({ radio: true })` or `?radio=1` turns it on): `setStation()` is ignored and window,
bar and jukebox radios are silent. My commit wiring the narrative's 4 stations to procedural music
(16:41) was finished just before the pause reached me; nothing further will be added until it lifts.

## Voice renders are a build artefact, rendered at build time (user-approved, 2026-11-26)
User, in this chat: "Approved: (a) add @echogarden/espeak-ng-emscripten@0.3.5 and ffmpeg-static@5.3.0 as
devDependencies, build-time only, never shipped; (b) rewrite claude/audio-tenderloin-74 history to drop
public/audio/voice/, pushed with --force-with-lease."
- `npm run audio:voices` renders with eSpeak NG compiled to WASM plus `ffmpeg-static`: no system packages,
  so it runs on Vercel. Neither tool is imported by game code; checked: the production bundle contains
  neither. Licence handling in AUDIO_SOURCES.md.
- Measured (4 cores, CPU-only): cold cache 223–237 s for 1,428 lines (93.9 min of speech); warm cache
  after a fresh checkout (the Vercel case, cache in `node_modules/.cache/t74-voices/`) 1 s. Deploy uses
  `npm run audio:voices:build` (`--soft`): missing content or a tool failure logs a warning and exits 0. Deployed output 38 MB (Opus 13.0 MB + AAC 18.4 MB + manifest), fetched per line.
- Branch history rewritten and force-pushed (5f076a2 → 5497fca): no commit contains `public/audio/voice/`;
  engine commits kept their hashes; the engine session was told.
- The WASM build takes no SSML, so emotion is applied as rate, pitch and level offsets (was SSML prosody).

## Movement foley set (MOVEMENT.md, 2026-11-27)
Self-made (baked synthesis, logged in AUDIO_SOURCES.md), preloaded as group `movement` (~0.5 MB decoded):
- Surfaces (`audio.footstep({ surface })`, aliases accepted: kerb/curb, tar/roof, fire_escape/metal,
  ladder…): granite kerb (also auto-detected at the sidewalk edge), subway tile (also inside `subway`),
  wood stoop, fire-escape iron, ladder rung, gravel roof tar.
- Actions (`audio.foley(action, at, intensity)`): vault, climb, land, roll, ragdoll, cloth, fence
  (chain-link rattle). Intensity scales level and lowers pitch for heavy hits.
- Check: `npx tsx tools/audio/foley-check.ts` (no NaN, peaks in range) writes `shots/audio/movement_foley.ogg`.
- Honest note: synthesised foley is credible for metal, stone and gravel; cloth and body thuds are the
  weakest (they read as "filtered noise" up close).

## $0 budget / free-assets licence gate (user decision relayed by oversight, 2026-11-27)
Audio already meets it: every shipped sound is self-made, and the GPL tools (eSpeak NG WASM, ffmpeg-static)
run only at build time and are absent from the production bundle. Licences are logged in docs/licenses/ASSETS.md.
Freesound (CC0 / CC-BY) and Sonniss GDC sounds are allowed through the gate. I'd only reach for them where synthesis
is weakest (cloth and body foley, crowd close-ups, gunfire transients), reading each licence first and adding a row
before any file lands. BBC Sound Effects is out (non-commercial).

## Traffic incidents (sim f9148be, 2026-11-27)
All wired in `vehicles.ts` from the bound sim. Sounds are self-made; the new `impact.fender` bake is a chrome-bumper clank and ring, a sheet-metal crumple and a few falling bits.
- **`honk` with chain/chainDepth:**
  - followers in a chain give short impatient toots, sometimes doubled;
  - `reason: 'rage'` leans on the horn for 1.6–3 s;
  - only the first driver in a chain may also shout out of the window.
- **`hornChain` (3+ drivers):** the chorus builds with 2–6 more horns of mixed classes, each further back down the line and joining 0.25–0.6 s apart.
- **`roadRage`:**
  - shout/gesture → a line;
  - forceIn → tyre chirp and a line;
  - leanOnHorn → sometimes a line after the long honk;
  - shove → cloth, a body knock and a line.
- **`fenderBender`:** the crunch (sometimes a lamp lens tinkles), then two doors as the drivers get out.
  `incidentAct`: inspect, argue and exchangeDetails → lines; stagger → cloth; enterCar → the door.
- **Lines:** narrative's `road_rage` pool (in; 36 lines, 12 of them `argue`). The two drivers in an incident speak with two voices:
  road_rage and fender_bender are rendered twice (`npc.<pool>` m3 and `npc.<pool>.b` m6/f3 in casting.json), and odd ped ids take the second.
  If a context is ever missing, the line falls back to the driver's own pool (the bark event's `fallback` field).
  Verified: every line in the scene came from road_rage, with both voices trading in the argument, 0 misses.
- **Check:** `render.ts --only incidents_7th --content` (7th Ave at W 36th, 5:15 p.m.) runs a chain of 3 plus the chorus, road rage, a fender-bender with the argument and the drivers leaving, all passing.
  - 6 lines on High, 7 on Low; 0 misses.
  - Integrated −12.8 LUFS: a deliberately busy rush-hour scene; it's a diagnostic, not in the session target.
  - Excerpt: `shots/audio/incidents_7th.ogg`.
- **vs GTA V / VI / RDR2:** GTA's horn chains and road rage are a signature of its streets. We match the behaviours (chains, chorus, rage, fender-benders with arguments), driven by the sim's real incidents. The lines are eSpeak, and the horns are synthesised period horns.

## Police dispatch (heat backlog, 2026-11-27)
The scanner lives in `world/dispatch.ts`. Its text and vocabulary are in `dialogue/dispatchText.ts`. API: `audio.bindGameplay(gp)`, `audio.dispatchSay(text)`,
`audio.officerDown([x, z])`, `audio.placeName(x, z)`; subtitles come from `on('dispatch')`. Engine wiring is ENGINE_REQUESTS "From audio: 14".
- **Why stitched:** whole lines can't be rendered ahead of time.
  - Gameplay's radio calls are free text built at runtime: precinct, crime, place, and the witness description.
  - Narrative's police_radio lines are templates (`{street}`, `{avenue}`…).
  - So the build renders a vocabulary instead, with four registers (Central calm and urgent, the cars calm and urgent/breathless): about 800 fragments each.
    It covers gameplay's fixed phrases, crime words, narrative's template fragments and slot vocabularies (police_radio `audio.slots`), precinct names, every street on the map, subject, clothing, vehicle, direction and item words, numbers 0–99, and single letters for plates (narrative's convention: "K-L-four").
    Every word that appears in a phrase is also rendered on its own, as the fallback.
  - At runtime the text is normalised (numbers and ordinals to words, plates spelled), then segmented into the longest phrase available, else single words.
  - Anything outside the vocabulary becomes a burst of garble on air; the subtitle keeps the full text.
- **On air:** one half-duplex channel.
  - One transmission at a time, queued by priority; stale chatter is dropped.
  - Each transmission is a squelch kerchunk, the fragments (30 ms joins, 160 ms breaths at commas) and a squelch tail.
  - A static bed runs under it, through a 320 Hz–3 kHz band with a presence bump and light clipping.
  - Each radio car's voice sits slightly differently.
  - Who speaks follows radio procedure: "Central to all cars…" is Central; "Central, car six…" is that car calling in.
- **Narrative's dispatch set (6c8dcb1, 46 lines):**
  - Each line's `voice` (dispatcher or car) picks the speaker. Emotions urgent, breathless and alarmed use the urgent register.
  - Slots are filled truthfully:
    - street/avenue from `placeName`;
    - crime from the open report;
    - sex, build, clothes, car and plate from the witness description gameplay files with `reportFiled`;
    - direction from narrative's slot list.

    A line needing a slot we can't fill is skipped.
  - The same line isn't repeated within 90 s.
  - Car numbers are spoken digit by digit ("car one-four"), and hyphenated tokens are spoken part by part.
  - The tone shift: narrative's `hot` set (dced70bc) plays three times in the 90 s after officer down, and as the idle chatter while the channel is hot.
    Its `sergeant` voice is a fifth register (older, slower; only his own lines' fragments are rendered, 34 files). In the heat_8th scene: 0 garbled, 0 misses.
  - Heat tiers: `reportFiled.severity` → gameplay's `tierOf` → each rising tier puts a `heat1`–`heat5` call on the air. Tiers 4–5 make the channel hot.
  - Context mapping:
    - dispatched → `responding`/`ack`;
    - pursuit → `pursuit_car` if the description has a vehicle, else `pursuit_foot`;
    - cleared → `all_clear`/`cooldown`/`bribe_heard`;
    - tour changes (8 a.m., 4 p.m., midnight) → `shift`.
- **Events:**
  - gameplay `radio` → Central speaks it, in the urgent register for shots, shootings, homicides and pursuits;
  - `police` dispatched → a car acknowledges; pursuit → a car calls it in; lost, investigate and cleared → narrative's lines, with `{street}`/`{avenue}` filled from `placeName`; roadblock → a car reports it;
  - idle chatter while a report is open;
  - the brownout call once per outage.
- **Officer down (`copKilled`):**
  - the band clears for it;
  - an alert of three 1.2 kHz pips (an original pattern), then Central urgent with narrative's "officer down" line;
  - then narrative's cop_killed radio sequence, with car voices for car lines;
  - three cars answering "on the way", and a surge of three sirens;
  - for 90 s the channel stays hot: urgent register and busier chatter. This is the "tone shift".
- **Measured (`render.ts --only heat_8th --content`):** Eighth Ave at W 33rd St, 9:40 p.m. The scene runs report (tier 2) → dispatched → pursuit → heat tier 4 → lost → officer down → cleared.
  - 11 transmissions; every fragment was found in the vocabulary (0 garbled, coverage 1.0); voice library 0 misses; Central's report goes out before the cars answer.
  - The scanner measures −21.2 LUFS while talking against a −15.2 LUFS street (stems tool), so it's clear without masking the world.
  - Excerpt: `shots/audio/heat_8th.ogg`.
- **Cost:** about 3,600 extra fragments (5,028 voice files in all); the voice deploy grows from 31 to 50 MB (Opus 20.7 + AAC 29.6), fetched per fragment on demand into the 6 MB decoded LRU.
  The new fragments rendered in about 110 s on a cold cache; a warm cache takes about 1 s.
- **Honest limits:**
  - Stitched eSpeak words sound clipped and robotic, more like a 1970s scanner than an actor, which partly suits the radio.
  - Descriptions need gameplay to use `audio.placeName`; until then its placeholder place names ("the lot on the East Side") still fall inside the vocabulary.
  - Real clothing and garment words come from gameplay's wardrobe data, which audio can't read at build time, so the colour and garment lists are curated. A word outside them garbles.
- **vs GTA V / VI / RDR2:**
  - GTA V's police scanner is the reference: concatenated recorded phrases (area, crime, suspect description, vehicle), with squelch and radio filtering.
  - We match the structure (concatenation, description, place, squelch, escalation) and drive it from real gameplay state.
  - We fall short on voice quality: GTA's fragments are recorded actors.
  - Plan: real voice talent or a better free TTS when the voice decision changes, and positional radios in police cars and on cops.

## Gunfire (combat backlog, 2026-11-27)
`world/gunfire.ts`; API: `audio.gunshot(at, tier)`, `audio.bulletPass(from, to)`, `audio.bulletImpact(at, material)`,
`audio.gunFoley('pump'|'dry'|'reload', at)`. All sounds self-made (AUDIO_SOURCES.md); the `combat` group is preloaded (~4 MB decoded).
- **Tiers (invented period guns):**
  - `cheap`: pocket .22/.25, thin and snappy, −5 dB;
  - `service`: .38 revolver, the reference level;
  - `magnum`: more body and sub, +2 dB;
  - `shotgun`: 12-gauge pump, longest and widest blast, +3 dB;
  - `auto`: each round of a burst.

  Each shot is an N-wave crack, a falling-band gas burst, a damped "boom", the action's click and a gas tail.
  After one balance pass, octave energy in the first 300 ms is broadband from 250 Hz to 8 kHz (within about 8 dB) with the tier's low body below that. The first bake was 15–20 dB short in the mids.
- **Travel time:** the sound starts distance / 343 m/s after the trigger, so a shot at 450 m is heard 1.3 s after its flash.
- **The canyon echo (signature):** image sources from the real facades around the shooter (the reverb's CanyonAnalyzer at 24 rays on every preset):
  - first order off both facades and the block-end walls;
  - higher orders between parallel facades (up to 4 where the canyon flutters);
  - each echo is a positional voice at its image position, delayed by its extra path and attenuated by facade coverage and order;
  - up to 8 echoes on High, 6 on Medium, 4 on Low; rapid fire keeps the strongest 3 per later round;
  - each echo's path is line-of-sight checked on its first leg (shooter to first wall) and its last leg (last reflection point to listener), so shooters indoors or round a corner don't get street echoes;
  - the FDN gets a high wet send for the long tail.
- **HDR window:** ambience and radio dip 3–8 dB by the shot's loudness at the listener, hold 0.25 s, recover over about 1 s (`mixer.hdr`), timed to the shot's arrival.
- **Engine fix found here:** voices can now start at a future time to the sample (`delay`), used for travel time and echoes.
  Chromium's HRTF panner adds about 6 ms that equal-power panning doesn't, which skewed a direct sound against its echoes.
  The latency is now measured at load (impulse through both panners, offline; 6.35 ms in Chromium), and delayed HRTF voices start that much early.
- **Checks:**
  - `npx tsx tools/audio/gun-check.ts` (timing, measured on the output): each shot is replaced by a 0.3 ms click.
    - 26/26 separable predicted arrivals were found within −0.5/+1.5 ms across 5 shots at 16–150 m.
    - In a control (the same test 7 ms off any arrival), the detector fired 2 times out of 21, so it isn't just finding peaks everywhere.
    - Constant output latency is about 7.8 ms (limiter lookahead plus panner).
  - `render.ts --only shootout_8th`: W 39th St east of 8th Ave at 11:20 p.m., all tiers at 13–450 m, a burst, whiz, impacts and foley (excerpt `shots/audio/shootout_8th.ogg`).
    - High/mobile: −15.8 LUFS, max momentary −6.2, TP −1.50 dBTP, limiter peak reduction 0.8 dB, 50/64 voices, p95 0.6 ms.
    - Home theatre: −22.8 LUFS, TP −3.6.
    - Low: −18.5 LUFS, 24/24 voices.
    - The main suite is unchanged (−16.28 / −23.05).
  - `foley-check.ts combat`: 13 families, none bad (`shots/audio/combat.ogg`).
- **vs GTA V / VI / RDR2:**
  - The references' gunfire is recorded, layered by distance, with authored city tails; RDR2 is the benchmark for echo across terrain.
  - We match the structure: travel time, distance layers via air absorption, and a per-shot ducking window.
  - Our echoes come from the actual building geometry around the shooter, and their timing is measured.
  - We fall short on the source sound: synthesised shots are cleaner and less "dirty" than recordings, and there are no per-gun mechanical layers beyond one click.
  - Plan: add a supersonic crack for magnum rounds passing the listener, and casings and shell drops.

## Street vendors (STREET_VENDORS.md, 2026-11-27)
All sounds are self-made bakes, logged in AUDIO_SOURCES.md. Group `vendors` (3.2 MB decoded on every preset: variants capped per sound, loops one variant with rate jitter) loads when the first vendor registers.
- **Sim-driven (sim fb337dc):** `bindSim` maps the sim's vendor events onto the handles:
  - vendorSpawned / vendorOpened / vendorGone, and cart positions from `vendorViews` (cooking starts once the cart is set up; pushed carts rattle);
  - vendorCall → a call (the sim times them; audio applies the 30 m range and 5 s gap);
  - vendorShout → an angry line; monteScatter → the lookout's alarmed line;
  - vendorServed / vendorAct serve → change; vendorAct right_cart → the knock-over;
  - vendorCower / vendorFled → a scared line; vendorRecovered → reopen; cartRighted (6–10 s after a tip) → a clank, then reopen.
  The test scene drives these through the mock sim's events, the same path as the real sim.
- **Sidewalk reactions (sim 66e9453, `world/crowdReactions.ts`):**
  - pedBumped: body foley by kind (a coat brush; a stumble with scuffs; a knockdown onto the pavement).
    It also plays a line from the pedestrian's own bark pool (archetype → `barks` in content/npc_archetypes), context
    `collision`, matched to the response: angry → angry; annoyed → annoyed/brisk; frightened → startled/hurt/worried.
    It falls back to any collision line. At most one bump line every 3 s, half of brushes are silent, within 25 m.
    Bumps with `byPlayer: true` (confirmed by sim 554d254: every bump today is player contact) always speak, reach 35 m and wait only 1 s.
  - pedGreets (sim 39af2cb): a line from the ped's own pool by context (greet, greet_known, antagonize, fear, complain,
    player_running). Within 20 m, at most one every 4 s (shared with bump lines). Missing contexts fall back: greet_known → greet, antagonize → complain, fear → collision.
  - Verified with content on (`render.ts --only vendor_corner --content`): 2 bump lines and 2 greetings were spoken with rendered voices, 0 misses, 9 rendered barks.
    That closes the earlier gap where bump lines had only been checked hermetically.
  - pedGotUp: cloth and scuffs. litter: a new self-made `paper.crumple` (also the newsstand's page sound).
  - monteScatter: the lookout's shout, then four sets of running feet fanning out.
  - Signal chirps: not added, since 1974 NYC had no accessible pedestrian signals (agreeing with sim's note).
- **API:** `audio.vendor(id, type, at)` returns a handle: `sale()`, `knockOver(impulse)`, `reopen()`, `move(at, speed)`,
  `react('danger'|'traffic')`, `remove()`. Wiring is ENGINE_REQUESTS "From audio: 12".
- **Per type (from content/vendors.json):**
  - hot dog: steam pot and onions on the griddle (two loops);
  - nut roaster and pretzel/knish: roaster drum;
  - coffee: steam;
  - Italian ice: hand bell;
  - newsstand: paper rustle;
  - shoeshine: bursts of rag snaps;
  - ice-cream truck: an original chime motif from the roof speaker. It is not any real truck tune.
  - Pushed carts rattle on the pavement, faster with speed.
  - A knock-over plays the crash, tray clang, rolling cans and thudding produce. The cooking loops stop, and the vendor shouts a furious or angry line.
- **Calls:** narrative's `barks/vendor_calls.json` (commit 664cb18 on their branch), by vendor type. They go through
  `barkFrom` (now with an emotion filter) and the build-time voices, and are subtitled as overheard.
  Within 30 m only, with at most one vendor call city-wide every 5 s so corners don't become a shouting match.
- **Check:** `npx tsx tools/audio/foley-check.ts vendors` checks for no NaN, peaks in range and loop seams ≤ 4× the average sample step (measured 0.25–2.9×). It writes `shots/audio/vendors.ogg` (0.8 MB, loops played three times so any seam is audible).
  `npx tsx tools/audio/render.ts --only vendor_corner` (20 s excerpt: `shots/audio/vendor_corner.ogg`) runs the scene at W 34th and 7th Ave: six vendors, two sales, a pushed cart, and a knock-over at 41 s.
  - High: −14.3 LUFS, TP −1.50, 39/64 voices, update p95 0.8 ms.
  - Low: −15.7 LUFS, 24/24 voices, p95 0.7 ms.
  - No NaN, no leaks.
- **Mix (stems tool, 60 s walk past the carts, after one level pass):**
  - The street mix is −14.3 LUFS (max momentary −4.7).
  - The hot-dog cart's loops peak at −21.5 LUFS momentary as you pass it: audible under the avenue, as on a real corner.
  - The roaster is −26.1 (it was −34, inaudible, before the pass).
  - The cart crash and rattles peak at −15.2.
  - The full main suite still passes, with sessions unchanged: −16.28 / −23.05 LUFS, TP −1.50.
- **Fixed while testing:** the offline scenario event matcher skipped events at exact half-frame times. The knock-over at 41 s never fired. Events now land on exactly one frame.
- **vs GTA V / VI / RDR2:** the references' vendors are mostly visual set dressing with generic crowd barks; RDR2's
  camp and town vendors have recorded sizzle and chatter. We match the layering (cooking loop, signature sound,
  call, sale, crash) and tie calls to the real vendor type. We fall short on the sounds themselves: synthesised
  sizzle and steam are believable at a few metres, but the bell and coins are clean modal synthesis, cleaner than recordings.
  The eSpeak calls are clearly placeholder-tier voices.

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

- **Music cost:** one station feed renders at 7–10× realtime in headless Chromium (about 10–14 % of one
  core, CPU-only). Fine on desktop; heavy on phones, so Low should cap world radios to one feed.

## Known issues / next
- eSpeak speech is intelligible but robotic; music is credible as period radio filler, not as hits. Both are swappable behind the same APIs.
- Re-run `npm run audio:voices` whenever narrative text changes (needs `apt-get install espeak-ng`).
- Real-device checklist not yet run (iOS unlock, interruptions, silent switch, Bluetooth).
- Mock sim drives traffic/peds; re-measure once the sim and vehicles streams merge.
