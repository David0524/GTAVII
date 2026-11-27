# ENGINE_REQUESTS

Requests from workstreams to the engine session. Answers go in `ENGINE_RESPONSES.md` on the
engine branch. Format: `## From <team>: N. Title` with what, why and the fallback we use until it ships.

## From audio: 1. Wire the AudioSystem into the game loop
- **What:** in `src/main.ts` (engine-owned), construct `new AudioSystem({ quality: quality.name })`
  from `src/audio/index.ts`; after `world.load()`, call `audio.load({ streets })` (it reads the chunk
  files itself unless you pass parsed `ChunkData[]` as `chunks`); every frame call
  `audio.update(dt, { position, forward, up, velocity })` from the camera (velocity = camera
  position delta / dt, used for Doppler). `unlock()` arms itself on the first user gesture, but please
  also call it from your own "tap to start"/first-input handler. Pause menu: `audio.suspend()` /
  `audio.resume()`. Backgrounding, bfcache and iOS interruptions are handled inside.
- **Why:** the brief's integration contract; the engine owns `main.ts`.
- **Fallback:** the `?audio=1` test scene (one guarded line in `main.ts`, already on my branch).

## From audio: 2. Audio settings keys in `src/settings/Settings.ts`
- **What:** add `volMaster`, `volAmbience`, `volSfx`, `volDialogue`, `volRadio`, `volUi` (0..1,
  default 1; the engine applies a squared taper internally), `loudnessProfile: 'mobile' | 'homeTheatre'`
  (default `'mobile'`; -16 vs -23 LUFS), `audioIgnoreSilentSwitch: boolean` (default `false`; iOS only:
  when true the game plays even with the ring/silent switch on), and `radioSubtitles: boolean`
  (default `false`). Map them to `setBusVolume(bus, v)`, `setLoudnessProfile(p)`,
  `setIgnoreSilentSwitch(on)` via `settings.subscribe`.
- **Why:** user volumes per bus are in the brief; loudness profile and silent-switch behaviour are
  user choices, not mine.
- **Fallback:** all buses at 1, mobile profile, silent switch respected.

## From audio: 3. World state feeds
- **What:** call `setClock(minutes, date)` from the world clock (N1), `setWeather(w)` from weather,
  `setPower(area, state)` from N2, and `setInterior(kind | null)` on interior enter/exit (the
  narrative `kind`s: diner, sro, bar, precinct, loft, cinema, shop; plus subway, stairwell).
  For the Interiors stream's `inside(x, y, z) -> { kind, roomVolume }`: call
  `setInterior(kind, { blend, roomVolume })` every frame near a door, where `blend` goes 0 → 1 as the
  player passes through the doorway (street sound filtered through the door, then fading; room
  tone and reverb fade in); `rooftop` is treated as open air (no muffling).
  `setPower` takes `'all'`, a district id (`garment`, `fur`, `flower`, `eighth`, `deuce`, `herald`)
  or `'x,z,radius'`. If you'd rather pass your N2 area object (`{ blocks }`, `{ at, radius }`,
  `{ district }`) I'll accept it as-is; tell me which.
- **Why:** ambience, AC units, neon and signal relays, subway service and the city hum all follow
  these.
- **Fallback:** the clock stays at 17:30 on 1974-06-21, clear weather, power on, outdoors.

## From audio: 4. Lightning is audio-led: please flash the sky on `audio.on('lightning')`
- **What:** in rain the audio system schedules thunder and first emits
  `'lightning' { distance, delay, near }`; thunder arrives `delay` seconds later (distance/343).
  Please flash the sky/clouds on that event (visual equivalent, per the never-audio-only rule).
  If you would rather own lightning, call `audio.play('thunder', at, { near })` instead and I'll
  turn the internal scheduler off.
- **Fallback:** thunder without a flash (ambience only, carries no information).

## From audio: 5. Subtitle channels in the UI
- **What:** `audio.dialogue.on('subtitle', e)` gives `{ id, speaker, text, duration, channel, overheard?, at? }`
  with `channel` = `scene | ambient | radio | phone`; `audio.dialogue.on('subtitleEnd', e)` gives
  `{ id, cut, text? }` where `cut: true` means the overheard line was cut as the player walked away
  (render the trailing "…", N3). `audio.on('radioSubtitle', e)` carries DJ/news lines for the car
  radio (behind `radioSubtitles`). `dialogue.play()` resolves only after the line has been on screen
  for its reading time (~15 chars/s, never under 1.2 s).
- **Why:** N3 and the narrative rule that nothing is audio-only.
- **Fallback:** the test scene draws its own subtitles.

## From audio: 6. Content paths for dialogue and radio
- **What:** I fetch dialogue from `${BASE_URL}content/dialogue/<script>.json` (the narrative format)
  and will read station definitions from `${BASE_URL}content/radio/stations.json` (schema in
  `src/audio/radio/stations.ts`). Please serve `content/` at that path (copy to `public/` at build
  time), or tell me to take scripts through `audio.dialogue.registerScript(json)` from your loader.
- **Fallback:** a missing line plays as `[missing line script/id]` (subtitle shows it), and the four
  PLACEHOLDER stations run.

## From audio: 7. Forward to vehicles: rpm, load and event payloads
- **What:** `attachVehicle({ id, rpm, load, position, speed?, velocity?, on? }, profile)`: please
  have `Vehicle` expose `rpm` (engine rev/min) and `load` (0..1 throttle-ish) getters, and give
  `skid` events `{ intensity 0..1, speed m/s, position: [x,y,z] }` and `impact` events
  `{ impulse N·s, speed m/s, position }`. Profiles: `v8_big`, `v8_small`, `i6_worn`, `i4_compact`,
  `diesel_bus`, `diesel_truck`, `v8_truck` (or pass a vehicle class and I map it).
- **Fallback:** I estimate rpm/load from speed through a 3-speed automatic model (the same one used
  for AI traffic), and impacts from a default impulse.

## From audio: 8. Forward to sim: event payloads
- **What:** I consume `honk { vehicleId, x, y, z, duration? }`, `collision { x, y, z, impulse?, a?, b? }`,
  `nearMiss { x, y, z, a? }`, `hail { x, y, z, pedId? }`. Optional, nice to have:
  `signal { x, z, group, phase }` on phase changes (relay clicks in the controller cabinets) and the
  `busStop` state on buses (door hiss) — the latter already matches the contract's `state`.
- **Fallback:** fields are parsed defensively; relay clicks run on my own 90 s cycle per signal POI.

## From audio: 9. Forward to characters: footstep event shape
- **What:** animation `footstep` events as `{ position: [x,y,z], surface?, intensity 0..1, run?, who }`
  (`who: 'player'` or the character id) — passed to `audio.footstep(e)`. Surface is optional:
  I derive grating/asphalt/concrete/park/interior from the world when it's absent. For lip-sync,
  I can publish per-line syllable timings from the placeholder voice (and amplitude envelopes once
  real voice files exist) if that helps; say which.
- **Fallback:** procedural steps for the nearest pedestrians from their sim speed; none for the
  player until the event exists.

## From audio: 10. Data bug: modern OSM part heights on 1974 stand-ins (Eighth Ave, 40th–42nd)
- **What:** chunk buildings with `flags = StandIn | OsmPart` carry modern tower heights on
  period stand-ins: ids 3171–3174 (year 1883, 8 floors, 227–319 m) at about (-835, -1450), the east
  side of Eighth Ave at W 40th–41st, which is the 2007 tower's parts; and 4258/4259 (1932, 2 floors,
  157–168 m) and 4262 (1904, 4 floors, 183 m) around W 42nd. Probably the OSM `building:part`
  replacement runs after the post-1974 stand-in substitution, so parts of a removed tower survive.
- **Why:** visible skyline anachronism; for audio, the canyon measurement there sees 230–320 m
  walls, so Eighth Ave at 41st gets far too much reflection energy.
- **Fallback:** none on my side (I use the chunk data as-is). Found by the canyon ray debug view
  in `?audio=1`.

## From audio: 11. Build step for rendered speech (user approved build-time rendering, 2026-11-26)
- **What:** in the deploy build, run `npm run audio:voices:build` before `vite build`, with the
  narrative `content/` present at `public/content` (copy it in first).
  - No system packages: eSpeak NG is the npm WASM build and ffmpeg is `ffmpeg-static`, both
    devDependencies, GPL-3.0, build-time only, never bundled (verified against the production bundle).
  - **Cache:** renders are keyed by hash(speaker|emotion|text|voice) in `node_modules/.cache/t74-voices/`,
    which Vercel's build cache restores between builds, so a typical build only renders changed lines;
    the step then copies the current lines into `public/audio/voice/` (ignored by git).
  - **Never fails the build** (`--soft`): if content is missing, the WASM or ffmpeg can't load, or a line
    fails, it logs a warning and exits 0; anything not rendered plays the placeholder voice.
  - Measured (4 cores, CPU-only): cold cache 223 s; warm cache after a fresh checkout 1 s; missing
    content exits 0 with a warning.
    Deployed output 38 MB (Opus + AAC), fetched per line on demand.
- **Why:** keeps ~35 MB per narrative revision out of git, keeps GPL code out of the shipped game, and
  keeps preview deploys fast across branches.
- **Fallback:** without renders, lines play the formant placeholder voice with correct subtitle timing.

## From audio: 12. Street vendors: just bind the sim (updated after sim fb337dc)
- **What:** nothing vendor-specific for most vendors. `audio.bindSim(sim)` (request 1) now also listens to the
  sim's vendor events and reads `sim.vendorViews`:
  - lifecycle and position: vendorSpawned, vendorOpened, vendorGone, and pushed carts from the views;
  - calls: vendorCall, vendorShout, monteScatter;
  - sales: vendorServed, vendorAct serve;
  - knock-overs: vendorAct right_cart, which is the sim's answer to the `cartOverturned` notice;
  - reactions: vendorCower, vendorFled, vendorRecovered.
- Also from the bound sim: pedBumped, pedGotUp, litter (sidewalk reactions); nothing to wire.
- **Two optional extras:**
  - Physics: when a cart tips, call `audio.vendor` handles' `knockOver(impulse)` for impulse-scaled crashes. A duplicate within 2 s of the sim's report is ignored.
  - Ice-cream truck: the sim doesn't own it. Use `const h = audio.vendor(id, 'ice_cream_truck', at)` with `h.move(at, speed)` and `h.remove()`.
- **Why:** audio can't see vendors otherwise. Cost: ≤3 looping voices near the listener; `vendor_corner` scene
  update p95 0.8 ms on High.
- **Fallback:** without a bound sim, no vendor audio (nothing breaks).
