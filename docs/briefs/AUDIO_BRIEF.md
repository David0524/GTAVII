# Brief: audio (city soundscape, vehicles, radio, dialogue playback) for "Tenderloin '74"

You're a parallel workstream on a browser open-world game set in Manhattan's Tenderloin, summer
1974 (three.js 0.187.0 WebGPU/WebGL2, TypeScript, Vite, landscape mobile + desktop + gamepad).
The engine session owns rendering, the city, the player, the UI and integration. The narrative
session owns story and all written content. The sim session owns traffic and pedestrian agents;
the vehicles session owns car models and driving physics; the characters session owns people.
**You own everything the player hears: the engine that plays it, the mix, and the original sound
content.**

The quality bar is a 2031 AAA open world. Sound is half of how a city feels: if it's thin, the
city is dead no matter how it looks. The target is a gritty 1970s crime film: sodium-vapour
nights, heat, steam and subway rumble under the gratings.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch. This brief lives
   on `claude/awesome-keller-i9tmmu` (oversight); copy it to `docs/briefs/AUDIO_BRIEF.md` on
   your branch in your first commit.
2. Read `PROGRESS.md`, `ENGINE_RESPONSES.md`, `docs/CONTROLS.md`, `docs/briefs/SIM_BRIEF.md`,
   `docs/briefs/VEHICLES_BRIEF.md`, `NARRATIVE_BRIEF.md` (dialogue, barks and radio formats; the
   "never put required information only in audio" rule), `src/shared/geo.ts`,
   `src/shared/chunkFormat.ts` and `src/settings/Settings.ts`. Also read `docs/STYLE_GUIDE.md`
   once it exists.
3. Keep `docs/AUDIO_PROGRESS.md` as your source of truth: done, next, decisions, known issues.
   Read it at the start of every session and update it at the end.
4. Ask the user before major architectural decisions, before choosing a music or voice source,
   and before cutting any scoped feature.

## Hard rules: original, licensed, provenance tracked
- **No real recorded music, no commercial sample libraries, no ripped game or film audio.** Use
  only your own synthesis, your own procedural content, or CC0 / public-domain recordings.
- Every file gets a row in `docs/AUDIO_SOURCES.md`: file, source URL, author, licence, date
  fetched and any edits made. CC-BY is allowed only with attribution captured there. Anything
  with an unclear licence is out.
- **No imitation of real people's voices,** real stations' jingles or call signs, or real
  advertisers. Station names, DJs, ads and songs are invented (the narrative team writes the
  text; you build the system and the sound).
- **Never require audio for information:** every gameplay-relevant sound has a visual or
  subtitle equivalent (the narrative brief's mobile rule).

## Scope
1. **Audio engine** (`src/audio/`), on the Web Audio API with AudioWorklet where it helps:
   - Mix buses: master, music/radio, dialogue, SFX, ambience, UI. Each has a user volume (send
     the Settings keys to the engine as a request), plus sidechain ducking: dialogue ducks radio
     and ambience.
   - Voice manager with priorities, virtual voices and stealing, and distance and occlusion
     culling. Hard voice caps per quality preset.
   - 3D positional audio with a listener that follows the camera, distance curves per category,
     and Doppler for vehicles.
   - **Street-canyon acoustics:** early reflections and reverb derived from street width and
     building heights at the listener's position (data is already in the chunks), plus a short
     slapback in narrow streets, open air in the parks and the bigger room of avenue
     intersections. Interiors get their own reverb profile per `kind` (diner, SRO lobby, bar,
     precinct…).
   - Cheap occlusion and obstruction: line-of-sight checks against building footprints, with a
     low-pass filter when blocked.
   - Streaming of compressed assets (provide AAC/MP4 alongside Opus; check Safari playback) with
     a memory budget and preload by area.
   - **iOS/Safari unlock** on the first user gesture, plus suspend and resume on app
     background, phone calls and the silent switch, with no stuck or doubled audio afterwards.
2. **Ambience from the world data:**
   - Layered beds by area and time: the avenue roar, side-street quiet, park birds and kids,
     Garment District daytime clatter (handcarts, loading docks), Eighth Ave nights.
   - Point emitters placed from chunk POIs: subway gratings with rumble and air push when a
     train passes, signals clicking, steam vents, window AC units dripping and rattling, distant
     sirens bouncing off the canyons, radios out of windows.
   - Driven by the clock, the weather (rain on cars, awnings and puddles; thunder) and the
     narrative N2 brownout state (the city's hum drops out).
3. **Vehicle audio:**
   - Procedural or granular engine sound driven by RPM and load from the vehicles session's
     `Vehicle`. Big-block V8 burble, worn six-cylinder, diesel bus and truck, garbage-truck
     compactor.
   - Tyre squeal from `skid` events, impacts scaled by impulse from `impact` events, horns
     (several period horn types), brake squeal, door slams and the bus door hiss.
   - The traffic mass: an aggregate of the sim's vehicles instead of 150 separate engines
     (granular or LOD, so only the nearest few are fully simulated).
4. **Reaction audio:** the sim's `honk`, `collision`, `nearMiss` and `hail` events, plus
   pedestrian footsteps by surface and crowd walla by density. Footsteps for the player and
   characters come from the characters session's animation events (send a request for the
   event shape).
5. **Radio** (in vehicles, and from shop and window sources in the world):
   - A station framework: playlists, DJ links, invented ads, top-of-hour news bulletins keyed to
     the in-game date (narrative request N1), and tuning static when changing station.
   - Stations play in "real time", so they continue while you're out of the car.
   - **Music source is a user decision. Ask before building content.** Options: procedurally
     generated period-style instrumentals, original tracks the user commissions or supplies, or
     CC0/public-domain material. Ship the system with placeholder beds until then.
6. **Dialogue and bark playback:**
   - Plays narrative dialogue and barks by id, with subtitle timing events for the engine UI.
   - Supports narrative request N3, overheard dialogue (positional, fades with distance, stops
     cleanly when the player walks away).
   - Positional speech from moving NPCs, and phone and radio filtering for calls.
   - **Voice source is a user decision.** Until then, use a clearly marked placeholder (for
     example a "mumble" synth or browser TTS) behind the same API.
7. **UI sounds:** menus, the map, the character switch (the narrative switch uses a film
   reel-change cut, so it needs a matching sound), and pickups.

## Integration contract (the engine session wires it in; ask for changes via ENGINE_REQUESTS)
```ts
// src/audio/index.ts
export class AudioSystem {
  constructor(opts: { quality: 'low' | 'medium' | 'high' | 'ultra'; baseUrl?: string });
  unlock(): Promise<void>;                               // call from the first user gesture
  load(world: { chunks: unknown; streets: unknown }): Promise<void>;
  update(dt: number, listener: { position: [number, number, number]; forward: [number, number, number]; up: [number, number, number]; velocity: [number, number, number] }): void;
  setBusVolume(bus: 'master' | 'radio' | 'dialogue' | 'sfx' | 'ambience' | 'ui', v: number): void;
  setClock(minutesSinceMidnight: number, date?: string): void; setWeather(w: 'clear' | 'overcast' | 'rain'): void;
  setPower(area: string, state: 'on' | 'dim' | 'off'): void;
  setInterior(kind: string | null): void;
  attachVehicle(v: { id: string; rpm: () => number; load: () => number; position: () => [number, number, number] }, profile: string): () => void;
  bindSim(sim: { on(type: string, cb: (e: any) => void): void; vehicles: readonly unknown[]; peds: readonly unknown[] }): void;
  play(event: string, at?: [number, number, number], params?: Record<string, number>): void;   // one-shots
  radio: { setStation(id: string | null): void; readonly stations: readonly { id: string; name: string }[] };
  dialogue: { play(scriptId: string, lineId: string, at?: [number, number, number]): Promise<void>; on(type: 'subtitle', cb: (e: { speaker: string; text: string; duration: number }) => void): void };
  suspend(): void; resume(): void;
}
```
- Provide a test scene behind `?audio=1`: a listener you can drive along a real street with
  an on-screen bus meter and voice count, plus buttons for rain, brownout, sirens and a passing
  car.
- The only edit you may make to `src/main.ts` is one guarded line. Don't change any other shared
  file. Requests for the engine go in the root `ENGINE_REQUESTS.md` under
  `## From audio: N. Title` (what, why, fallback). Answers appear in `ENGINE_RESPONSES.md` on the
  engine branch: check it each session.

## Budgets
- **Main thread:** ≤ 1 ms per frame on High and ≤ 1.5 ms on mobile Low. Heavy DSP runs in the
  audio thread (AudioWorklet).
- **Voices:** about 64 real voices on High and about 24 on mobile Low, with virtual voices
  above that.
- **Memory:** ≤ 60 MB decoded on High and ≤ 25 MB on mobile. First playable audio within
  **2 MB** of download.
- **Loudness:** target about −16 LUFS integrated on mobile and −23 LUFS for a "home theatre"
  option, with true peak ≤ −1 dBTP. Measure with an offline render, not by ear.
- Measure and report real numbers. Headless timings here are CPU-only; label them as such.

## Done means
- A headless `OfflineAudioContext` test renders 60 s from three listener positions (Herald
  Square at rush hour, a side street at 3 a.m., Eighth Ave at night in rain). It asserts
  loudness and true-peak targets, no clipping, no NaN or denormal blow-ups, voice caps held and
  zero leaked nodes after unload.
- The WAV renders are committed under `shots/audio/` (small) with an honest critique in
  AUDIO_PROGRESS.md: what sounds like 1974 and what sounds like a tech demo.
- A real-device checklist for iOS Safari and Android Chrome (unlock, backgrounding, the silent
  switch, Bluetooth latency) that the user can run on their phone.
- AUDIO_SOURCES.md is complete, with every file accounted for.
