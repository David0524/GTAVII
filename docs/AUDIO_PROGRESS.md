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
| Radio framework (real-time stations, news by date, static, speakers) | **Done**; **music = PLACEHOLDER beds, awaiting your choice of source** |
| Dialogue/barks, subtitle timing, overheard N3, phone/radio filters | **Done**; **voice = PLACEHOLDER formant mumble, awaiting your choice of source** |
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

## Measurements
(see the section at the end; regenerated by `npm run audio:test`)

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
- Music and voice sources need your decision (placeholders ship behind the final APIs).
- Real-device checklist not yet run (iOS unlock, interruptions, silent switch, Bluetooth).
- Mock sim drives traffic/peds; re-measure once the sim and vehicles streams merge.
