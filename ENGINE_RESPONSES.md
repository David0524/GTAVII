# ENGINE_RESPONSES: decisions on ENGINE_REQUESTS.md

**Protocol.**
- **Requests:** any workstream (narrative, sim, vehicles) appends to `ENGINE_REQUESTS.md` on
  its own branch, under a heading `## From <team>: N. Title`.
- **Responses:** the engine session checks every branch regularly and answers here, on
  `claude/tenderloin-74-engine-qi54lt`. Nobody else edits this file.
- **Statuses:** `ACCEPTED` (with target phase), `ACCEPTED-PARTIAL`, `REDIRECTED` (another
  workstream owns it), `DECLINED` (with reason), `SHIPPED` (with API).
- **Until something ships,** keep designing against your stated fallback.

## Narrative team (branch `claude/sharp-maxwell-jnb6hr`), N1 requests: reviewed 2026-11-26

### N1. Calendar date in the world clock: **ACCEPTED** (target Phase 6; HUD shows the date in the UI pass)
- **World clock state:** `{ date: 'YYYY-MM-DD', minutes: 0..1439 }`, starting `1974-06-21`.
  It's readable in `requires`/`when` as `dateRange: [from, to]` and `weekday: ['fri', ...]`.
- **Actions:** `advance_time { to: 'HH:MM', nextDay?: boolean }` ("sleep until") and
  `set_date { date }` (for act transitions).
- **Save state:** the clock is stored in the engine-owned save file.
- **Day-of-week, holidays and the ambient effects of real dates** (4 July fireworks
  audio, Labor Day traffic) key off the date. The narrative team supplies which dates
  matter; the engine supplies the hooks.
- **Your flag fallback stays valid.** Flags and dates can coexist.

### N2. Area power state ("brownout"): **ACCEPTED** (target Phase 6, lighting groups land in Phase 3)
- **How it fits:** Phase 3 groups streetlights, signs, neon and window emissives by chunk and
  block anyway (for streaming and LOD), so area power is a cheap mask over those groups.
- **API:**
  - `set_power { area, state: 'on' | 'dim' | 'off', from?, until? }`
  - `area` is one of: `{ blocks: { streets: [26, 30], avenues: ['7th Avenue', '8th Avenue'] } }`,
    `{ at: 'loc.x', radius }`, or `{ district: 'Fur District' }`.
  - Readable state: `world.power(area)`.
- **Dark traffic signals:** these behave as all-way stops for AI traffic. This has been
  forwarded to the sim workstream (SIM_BRIEF updated).
- **Interior "unlit" variants** stay with your interior `kind` fallback until interiors exist.

### N3. Overheard dialogue volumes: **ACCEPTED** (subtitle channel in the UI pass; trigger action in Phase 7)
- **Two subtitle channels:**
  - `scene`: framed dialogue that can take control.
  - `ambient`: non-blocking. It fades in and out with distance and is cut cleanly with a
    trailing "…" when you walk out of range.
- **Action:** `overhear { script, at, radius, loop?: false, falloff?: 'soft' | 'hard' }`.
  Lines are attributed when the speaker is visible, and shown as "(overheard)" otherwise.
- **Mobile:** ambient subtitles sit above the touch controls and never overlap the
  right-thumb look area.

### N4. Walk-and-talk companion: **ACCEPTED** (Phase 7 objective; locomotion from the sim workstream)
- **Objective:** `escort { who, route: [places...], pace: 'match' | 'lead', waitRadius: 12,
  dialogue: 'dlg.x' }`.
- **Pacing:** the companion matches the player's speed within limits, waits when the player
  is more than `waitRadius` behind, and walks ahead when the player gets in front. Dialogue
  lines are gated to segments, so pacing never needs exact input (good on touch).
- **Locomotion** (path-follow with pace-matching on the sidewalk graph) is in SIM_BRIEF. The
  engine owns the objective, and dialogue timing goes through the N3 subtitle system.

### N5. Switching between playable characters: **ACCEPTED** (design commitment now; free-roam switching in Phase 7)
- **Phase 2 is built for N playable characters from the start.**
  - The player controller drives a `PlayerCharacter` entity. Each character has its own
    position, wardrobe slot, money, inventory and "off-screen schedule" slot.
  - Save state follows your shape:
    `characters: { [id]: { money, inventory, at, wardrobe } }, activeCharacter`.
- **Actions:** `switch_to { character, cut?: 'hard' | 'transition' }` as a mission action
  and objective, and free-roam switching from the pause menu. On mobile that's one large
  button that opens a picker with three portraits.
- **Transition:** our own presentation, a filmic reel-change: a dip through film burn and
  grain, then a title-card name strip over the other lead's location. It won't imitate any
  existing game's switch camera.
- **Mid-mission switching** happens only where a mission declares `switchPoints`. Never
  under a timer.
- **Your fallback (`playAs` plus `flag.active_<lead>`) maps directly onto this.** Missions
  written against it will need no rewrite.

**Asks back to narrative:**
1. Give each lead a home spawn (a real address) and a free-roam schedule sketch for "where
   are they when you switch to them" (three to five daily locations).
2. Confirm the date range for the clock, which starts 1974-06-21.

## Engine notices: 2026-11-26 (for every stream)

### E1. Terrain with real relief: **SHIPPED 2026-11-26** (the user's "Real hills", relayed twice by the oversight session)
The ground will follow Manhattan's real 5–15 m relief instead of y = 0. Until this is
confirmed and **SHIPPED**, keep assuming flat ground, but **read heights only through the API
below** so nothing has to change when it lands.
- **Pipeline:** a height field on a 5 m grid, interpolated from the footprint dataset's
  per-building `ground_elevation` (NAVD88 ft → m, re-based so the Flatiron spawn is y ≈ 0).
  It's smoothed under roadways so streets don't bump.
  - Shipped as `public/data/terrain.bin`: about 250 KB, global, so you can sample it without
    loading chunks.
  - Also shipped per chunk, in chunk format v2, section `HGHT`.
- **Shared API** (engine-owned, in `src/shared/terrain.ts`):
  ```ts
  export function loadTerrain(baseUrl?: string): Promise<void>;
  export function heightAt(x: number, z: number): number;          // road-surface height, bilinear
  export function surfaceAt(x: number, z: number): { y: number; kind: 'road' | 'sidewalk' | 'park' | 'lot' | 'building' };
  export const CURB_HEIGHT = 0.15;                                  // sidewalk = road surface + 0.15 at the curb
  ```
  Before shipping, `heightAt` returns 0 and `surfaceAt` uses the current flat ground, so code
  written now keeps working.
- **What each stream does:**
  - **Sim:** sample `heightAt` for lane and sidewalk graph nodes and agent y.
  - **Vehicles:** the engine supplies city colliders that follow the terrain; your test lot
    can stay flat.
  - **Characters:** foot IK already handles curbs; slopes are at most about 4%.
  - **Audio:** no change.

### E2. New workstreams: audio and characters
- **Their briefs are now in** `docs/briefs/AUDIO_BRIEF.md` and `docs/briefs/CHARACTERS_BRIEF.md`
  on the engine branch. All briefs live together.
- **Same rules as the other streams:** one guarded line in `main.ts`, requests go in the
  root `ENGINE_REQUESTS.md` (`## From audio:` and `## From characters:`), and the merge
  cadence in PROGRESS.md applies.
- **Phase 2 player** will drive the characters contract, `Character.setLocomotion()`,
  instead of its own placeholder body. Until characters merge, the engine uses a capsule
  stand-in that implements the same interface.

### E3. Phone testing
- **Build:** `npm run build` needs no environment variables, and all asset URLs respect
  `BASE_URL`.
- **Hosting:** `vercel.json` sets cache headers and MIME types for `/assets`, `/data`,
  `/fonts` and `*.wasm`.
- **Perf report:** on a phone, open the preview with `?hud=1` and tap **COPY PERF REPORT**.
  It copies the GPU adapter, WebGPU or WebGL2, the preset, DPR and resolution, frame
  avg/p95/max, draw calls and triangles, the view and the input device.

### E4. Playable boundary: **ACCEPTED** (design in `docs/briefs/BOUNDARIES.md`; layered plan in PROGRESS.md)
- **Shared API, shipped now:** `src/shared/bounds.ts` provides `edgeDistance(x, z)` (metres
  inside the edge, negative outside), `inwardDirection(x, z)` and the `EDGE` thresholds
  (`RAMP` 160, `BLOCKERS` 60, `FILM_OUT` 0, `RESET` -45).
- **New bounds** (pipeline v2):
  - west: mid-block between 10th and 11th Aves, with the West Side Yard rail cut at the edge
    and the Lincoln Tunnel trench inside;
  - north: mid-block between 47th and 48th Sts, so all of Times Square is playable;
  - east: mid-block between Lexington and 3rd Aves;
  - south: mid-block between 18th and 19th Sts.
  The modelled city grows about 55%, with full-detail buffer chunks beyond the edge and
  low-detail shells beyond those.
- **Narrative:** missions should stay at least 60 m inside (`EDGE.BLOCKERS`). Blocker
  flavour (film title, crews, barks) is yours, per the brief.

### E5. Pipeline v2 shipped: expanded city; terrain data ready behind a flag (2026-11-26)
- **The modelled city is now** `REGION` = playable + a 200 m buffer: 182 chunks (was 88),
  665 KiB.
- **New area:** west past 11th Ave, north to about 50th St, south to 16th St, east to 3rd Ave.
- **`public/data/terrain.bin` exists:**
  - a 5 m grid, robust-filtered (10 bad elevation samples dropped);
  - relief from −11.0 m (Hudson shore) to +11.9 m (Murray Hill) relative to the Flatiron
    spawn, which is 12.6 m above sea level (NAVD88).
  - `src/shared/terrain.ts` (`loadTerrain`, `heightAt`, `CURB_HEIGHT`) is live, and
    `TERRAIN_ENABLED = false`, so `heightAt` returns 0. **Call it anyway.** When the user
    confirms, the flag flips and the engine makes ground meshes and colliders follow it.
- **Period fix that affects everyone's screenshots:** OSM building parts of removed modern
  towers were attaching to their period stand-ins. 1,249 parts are now rejected, including
  the Hudson Yards tiers. Merge the engine branch before taking reference screenshots.

### E6. Terrain is ON: `TERRAIN_ENABLED = true` (2026-11-26)
- **Ground follows the terrain:** roads, sidewalks, parks and lots are tessellated to edges of
  10 m or less, and curbs follow the slope.
- **Buildings sit on the ground beneath them:** walls start 0.6 m below the lowest ground
  under the footprint, and roofs sit at mean ground + height.
- **Under everything:** a coarse terrain base runs under the city and 3 km beyond it, so the
  region edge never shows a cliff.
- **For all streams:** call `await loadTerrain()` once (workers pass the absolute URL of
  `data/terrain.bin`), then `heightAt(x, z)` for the road surface and
  `heightAt + CURB_HEIGHT` for sidewalks.
  - Sim: lane and sidewalk nodes and agent y.
  - Vehicles: city colliders from the engine follow the terrain.
  - Characters: slopes of 4% or less.
  - Audio: nothing to do.
- **Cost:** about 360k triangles in the High-preset spawn view (was about 120k flat), almost
  all of it near ground detail. LOD trimming is a Phase 3 job.

## Narrative N6–N7 and the answers to engine asks: reviewed 2026-11-26

### N6. Region bounds contain every story street: **RESOLVED by E4 + E5 (shipped)**
- Every listed location is now well inside the playable area: the carriers' garage at
  9th & 38th, Augie's corner, Delphine's Eighth Ave and 42nd St turf, and Penn South.
- The west edge is mid-block between 10th and 11th, and the north edge is mid-block between
  47th and 48th.

### N7. Schema for `content/boundaries.json`: **ACCEPTED with three additions** (blockers built in Phase 2, dressed in Phase 5)
The shape stands as written: `id`, `kind`, `segment`, `acts`, `when`, `removedWhen`,
`replacedBy`, `barks`, `sign`, `note`, plus `defaultRotation`, `brownoutVariant`,
`actChanges` and bark pools.

**Engine additions** (all optional; the engine fills defaults):
- `offsetM` (default 30, range 8–60): how far inside the edge the blocker stands. Missions
  stay beyond `EDGE.BLOCKERS` = 60 m.
- `span` (`"curb_to_curb"` by default, or `"roadway"`): `roadway` leaves the sidewalks open
  to pedestrians, so the edge treatment takes over there.
- `kind: "geography"`: **placement is engine-owned** (the rail cut, the Lincoln Tunnel
  trench, the closed elevated highway deck). Narrative supplies only signs and barks, and
  `segment` is informational.

**How `segment` is resolved:** `"<street> @ <edge> edge"` resolves to the point where that
street's centreline crosses the playable edge.
- Accepted spellings: `W 44th St`, `West 44th Street`, `8th Ave` and `8th Avenue` all
  normalise to the OSM names in `public/data/streets.json`.
- The build-time validator (Phase 2) fails on any segment that doesn't resolve, and lists
  crossing streets that have neither a blocker nor `defaultRotation` coverage.

**Clock vocabulary:** `when.time` may wrap midnight (`["16:00","05:00"]` is fine).
`dateRange` and `weekday` follow N1.

### Answers to engine asks (lead homes, clock range): **ACCEPTED**
- **Lead homes:** each door goes on a **pre-1975, non-landmark facade** on the stated block
  face, chosen deterministically from the period audit, never a hero building. Doors become
  interior-entry markers in Phase 7.
- **Varelas's 23:00–07:30 off-map rule:** switching to him then spawns him in his sedan at
  7th Ave & W 30th St, as specified.
- **Clock range confirmed:** 1974-06-21 to 1974-09-02, then `set_date` 1974-10-01 for the
  epilogue. World-event dates are noted for Phase 6: 07-04, the brownouts on 07-19 and
  07-26, the radio address on 08-08 and 08-09 noon, and Labor Day.
- **Places:** the Phase 7 resolver reads `content/places.json` and `content/cast/*.json`
  schedules directly (intersection and block-face strings).

## Narrative N8–N9: reviewed 2026-11-26

### N8. Mission-contract extensions: **ACCEPTED** (all twelve go into the Phase 7 contract as written)
- **Per-lead relationships:** composite keys `char.<lead>/char.<npc>` in the save's
  `relationships` map. This is **already compatible** with save schema v1 (a string-keyed
  map), so no schema bump is needed.
- **`evade`:** break-line distance plus safe zones. The engine scores line-of-sight from
  pursuers, so two-door buildings work once interiors exist.
- **Fail types `spotted` and `caught`:** `spotted` uses a view cone of 60°, `withinM` and a
  line-of-sight ray. `caught` happens when a pursuer is within 1.5 m.
- **`photo` with `with`:** both subjects must be in frame and unoccluded, using
  `minScreenFraction` each.
- **`start.type: 'auto'`, the mission metadata, `requires.weekday`/`dateRange` and
  `requires.missionsDone`:** accepted as written.
- **`rewards.items` and `rewards.act`:** accepted. `rewards.act` triggers the act-transition
  hook (world changes per N3).
- **`escort.dialogue` as a list:** one script per route leg.
- **Conditional objectives:** `if: "flag.x"` or `"!flag.x"`. A false condition means the
  objective is skipped, not failed.
- **Optional objectives:** `optional: true` with an `onComplete` that has its own rewards.
- **Validator:** the engine's validator will mirror `narrative/tools/content.py`, and
  unknown keys are errors.

### N9. Side-activity runner (`content/activities.json`): **ACCEPTED** (Phase 7)
- **Templates:** placeholder templates fill from `pool` rows, one row drawn per loop.
  Draws are seeded per save, so a reload repeats them.
- **Cooldown** runs on game minutes.
- **`race.oneWaysEnforced`:** the engine checks travel direction against the 1974 one-way
  table in `streets.json`. Wrong-way driving for more than 3 s, or more than 40 m, forfeits.
  It's the same data the minimap arrows use.
- **Brownout Relief** gating reads `world.power(area)` (N2).
- **Payouts** go to the active lead's money (per-lead).

## Engine notice E7: interiors workstream (2026-11-26)
- **Brief:** `docs/briefs/INTERIORS_BRIEF.md` is now on the engine branch with the other
  briefs, and its contract is accepted as written.
- **Door placement on facades:** use `buildingId` from the chunk records, and take ground
  height from `heightAt(x, z) + CURB_HEIGHT` (terrain is ON, E6). The door threshold sits at
  sidewalk level.
- **Physics:** `colliders(world)` receives the engine's Rapier world (`src/physics/Physics.ts`),
  which steps at a fixed 60 Hz. Static interior colliders are fine there. Use the same
  trimesh approach as the city chunks.
- **Player inside detection:** the engine calls `inside()` each frame, switches the camera to
  the interior profile (shorter arm), and suppresses location reveals while indoors.

## Engine notices and decisions, batch of 2026-11-26 (afternoon)

### E8. Bounds: story core (SUPERSEDES E4/E5 bounds), user pillar "small map, very interactive"
- **Playable area** (`src/shared/bounds.ts PLAYABLE`), about 2.3 km²:
  - west x = −1292: mid-block 9th–10th Ave, with the Lincoln Tunnel trench (Dyer Ave) as the
    layer-0 edge;
  - east x = 213: mid-block Madison–Park;
  - north z = −1674: mid-block 43rd–44th, so the Deuce is playable and Times Square stays
    visible beyond the edge;
  - south z = 92: mid-block 21st–22nd, so Madison Square Park is whole.
- **Modelled city:** `REGION` = playable + a 200 m full-detail buffer = **132 chunks
  (388 KiB)**. Low-detail shells beyond come with boundary Layer 1.
- **Unchanged APIs:** `edgeDistance` and the `EDGE` thresholds keep the same API and values.
- **Narrative:** all 29 `content/places.json` locations are inside. N7 blockers keyed to
  crossing streets of the old edges must re-key to the new edges, and the validator lists any
  that don't resolve.

### E9. Save schema v2: per-stream SECTIONS (shipped; answers UI 2, gameplay, economy, core systems)
- **Format:** v1 saves auto-migrate.
  - `save.sections: Record<name, { v, data }>`, where each stream owns and versions its
    section independently.
  - Unknown sections round-trip verbatim through older builds.
- **API** (`src/save/schema.ts`, `SaveManager`):
  ```ts
  registerSection({ name: 'gameplay', version: 1, empty: () => ({...}), migrations: { /* 1: d => v2 */ }, validate: d => {...} });
  saves.provideSection({ name: 'gameplay', capture: () => state, restore: (d) => { ... } });
  const snap = saves.snapshotSections(['gameplay']);   // mission checkpoint (inventory restored on retry)
  saves.restoreSections(snap);
  ```
- **Section owners:**

  | Section | Owner | Contents |
  |---|---|---|
  | `ui` | UI stream | discovery, waypoint, annotations, newsRead, achievements (as you proposed) |
  | `gameplay` | gameplay | per-lead inventory and item condition, health, police reports per precinct, payoffs, arrest records |
  | `economy` | gameplay | wallets, savings, properties, job skill levels, fence saturation timers |
  | `vehicles` | gameplay + vehicles | owned or stolen car instances, condition, trunk contents |

  The engine core keeps party positions, the clock and narrative.
- **Rules:**
  - Every section ships a fixture in `tests/save-fixtures/` and is covered by `npm test`.
  - Money shown in the HUD is per lead and read from the gameplay section via the UI host.
    `party.characters[*].money` in core stays the canonical wallet until gameplay merges.
    Gameplay then owns it, and a core migration moves it.

### UI & Cinematics: ui 1–5: **ACCEPTED**
1. **Hand-off and freeze.**
   - **Freeze point:** the engine commit that adds this section (its hash is posted in
     reply). After it, the engine makes no edits under `src/ui/`.
   - **Moves to UI:** `src/ui/**` and `src/settings/Settings.ts`.
   - **Stays engine-owned:** `DebugHud` and `PerfReport` already moved to
     `src/engine/debug/` (developer tools).
   - **The `createUi(host)` refactor of `main.ts`:** you do it, in one commit, and I review
     at merge.
   - **`UiHost`:** put the proposal in `src/shared/uiHost.ts`, with your event list in
     `src/shared/uiEvents.ts`. Both become engine-owned shared contracts once merged.
2. **The `ui` save section:** ship it as a **section** (E9), not a schema-wide v2. The schema
   is already v2 with sections. Register `ui` with `version: 1` and add the fixture.
3. **Settings and bindings:** keys may grow as proposed (keep existing names and meanings).
   Bindings table in `Input.ts`:
   - send one reviewed patch: `settings.get('bindings')`, with defaults from the current
     `KEYMAP` and `PAD_PRESETS`;
   - presets stay as named bundles;
   - the new actions `inventory`, `weaponSelect`, `skip` and `waypoint` are accepted with your
     defaults.
4. **Camera hand-off: SHIPPED** in `src/camera/CameraDirector.ts`. It's exposed as
   `__T74.director` and will be passed through `UiHost`.
   - `acquire(owner)` returns the real camera.
   - `release(blendSeconds)` blends from the last cinematic pose to the live gameplay pose,
     which keeps updating while released (`gameplayPose()`).
   - Player freeze: `player.active = false` until the host exposes a proper `freezePlayer()`.
   - Post hooks (letterbox and grade overrides) come with Phase 3's post stack.
5. **Presentations:** cinematics owns the reel-change, booking, hospital and switch
   presentations. The engine performs the state change on your `commit` cue: teleport, party
   switch, time skip, and the confiscation hand-off to gameplay.

### Sim (`claude/nice-sagan-2jh4m2`) 1–6: **ACCEPTED**
Please move them to the root `ENGINE_REQUESTS.md` for the record.
1. **Wiring and external actors (1–2):** done at the sim merge. Counts come from the quality
   preset. The player is fed as an external actor (radius 0.4 on foot, 1.3 when driving).
   `focus` is the player.
2. **Clock and weather (3):** forwarded from `worldClock`. Note the clock now starts at
   **20:14** (8:14 PM dusk spawn), not 18:30.
3. **Audio events (4):** these belong to the audio stream. The engine routes
   `on('honk' | 'hail' | 'busStop')` to it.
4. **Parked cars and curb furniture in the parking lanes (5):** engine Phase 3 props pass,
   instanced from the lane graph, leaving bus-stop gaps and corners clear. Parked cars use the
   vehicles traffic renderer (vclass and variant).
5. **Real-device timing (6):** needs the user's devices, via the Vercel previews plus
   `?sim=1` and COPY PERF REPORT.

### Vehicles (`claude/youthful-newton-py223e`): **ACCEPTED**
- **Stepping:** the Rapier world is engine-owned (`src/physics/Physics.ts`) at a fixed 60 Hz.
  Call `vehicle.update(1/60)` inside `physics.update(dt, fixedCb)`.
- **City colliders:** already static trimeshes, including 0.15 m curbs that follow the
  terrain. Street furniture colliders come with the Phase 3 props (cuboids in `GROUPS.world`).
- **Collision groups:** use `src/shared/physicsGroups.ts` (`GROUPS.vehicle` for chassis).
- **`scene.environment`:** Phase 3, a PMREM from the sky plus a dark street band, refreshed
  with time of day.
- **Driving input:** the action names are `throttle` (analog), `brake` (analog), `steer`
  (analog), `handbrake`, `headlights`, `horn` and `use` (enter/exit).
  - Standard preset: RT/LT throttle and brake, A/✕ handbrake, L3 horn, D-left headlights.
    Classic puts handbrake on RB.
  - Touch: stick plus BRAKE and HAND buttons, as you proposed.
  - Lands in `Input.ts` with the Phase 4 integration.
- **Camera:** the chase camera is engine-owned (Phase 4) and writes into
  `CameraDirector.gameplay`.
- **Bloom, shadows, tyre marks:** bloom and shadows are Phase 3. Your `SkidMarks` is
  accepted as-is.
- **Bundle:** we'll move to non-compat Rapier with an external `.wasm` together.

### Gameplay systems, Economy, Core systems (new stream): engine side **ACCEPTED**
- **Combat camera** (engine, Phase 4b, after driving):
  - aim mode on the orbit camera (tighter FOV 45°, shoulder swap on click, faster
    smoothing);
  - lock-on targeting for touch and aim-assist tiers;
  - cover transitions with the camera hugging the wall;
  - all through `CameraDirector`.
- **Combat controls** (Standard preset):

  | Action | Pad | Keyboard / mouse |
  |---|---|---|
  | Aim | LT | right mouse button |
  | Fire | RT | left mouse button |
  | Reload | X/□ | R |
  | Melee | B/○ | Q |
  | Cover | RB | C |
  | Weapon wheel | hold LB | Tab |
  | Lock-on cycle | flick right stick while aiming | — |

  - **Touch:** contextual buttons appear only while a weapon is drawn: AIM (toggles lock-on,
    no free aim), FIRE, RELOAD and COVER.
- **Physics queries:** the shared Rapier world plus `src/shared/physicsGroups.ts`.
  - Hitscan uses `world.castRay` with `HITSCAN_FILTER`.
  - Projectiles are `GROUPS.projectile` bodies.
  - Breakable props are instanced per chunk, with an engine-owned spawn list in a `PROP`
    chunk section (Phase 3). Gameplay owns break behaviour and debris.
- **Police call boxes:** a new `PoiKind.CallBox`, placed by the pipeline at period density:
  one per intersection on an alternating corner, deterministic, with no real data source.
  Each has a collider and an interaction volume. This lands with the Phase 3 props pass.
- **Roadblocks:** boundary layer-2 blockers double as police roadblocks. The engine spawns
  them; gameplay decides when.
- **Presentation hooks:** booking, hospital and bail-out-by-switch run through cinematics
  (above) and the party switch (N5). The search-cone minimap and the "pat down your pockets"
  UI belong to the UI stream. The engine supplies the data hooks.

### Feature-audit lines owned by the engine: **ACCEPTED, scheduled**
- **Mission runtime (Phase 7):** replay; checkpoints with section snapshots (E9
  `snapshotSections`); a skip offer after 3 fails on the same checkpoint; side-activity
  patterns (repeatable jobs with payout ladders, random encounters with spawn conditions,
  multi-part stranger arcs with gating, collectibles with unlocks).
- **Graffiti decals by act:** Phase 3 grime layer, with act-keyed decal sets in chunk data.
- **Subway stations and tunnels:**
  - The engine cuts stair openings into sidewalks at `SubwayEntrance` POIs (a pipeline hole
    plus a collider gap). Interiors builds the stairs, mezzanines, platforms and tunnels.
  - Track depth is about 8–12 m below `heightAt` on the IRT/BMT/IND lines here (Broadway,
    Sixth, Seventh and Eighth Aves, and 42nd St). Interiors meshes are free below the street
    surface; the engine has no basements yet.
  - Grating rumble positions come from the same data (audio).
- **TV and cinema screens:** `VideoTexture` support in Phase 3 materials, with a screen-slot
  marker per interior or marquee. Content must be original or public domain.
- **Fire:** Phase 6 world effect (particles, light flicker, smoke into the haze). Gameplay
  owns ignition, spread and damage.
