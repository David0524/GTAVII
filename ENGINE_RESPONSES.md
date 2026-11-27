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

### E10. Homes and owned cars (`docs/briefs/HOMES_AND_CARS.md`): engine side **ACCEPTED**
- **Lead spawns move to homes.** The narrative's revised "lead homes" answer will replace the
  workplace doors.
  - The engine keeps the rule: each door goes on a pre-1975, non-landmark facade on the stated
    block face, inside the E8 bounds.
  - `Party` default positions and New Game read `content/cast/leads.json` homes on merge.
- **Save sections** (E9; schemas owned by gameplay, persisted by the engine):

  | Section | Contents |
  |---|---|
  | `garage` | per-lead owned cars: full instance state (vclass, variant, colour and respray, plates, condition, damage zones, fuel, trunk contents), `parkedAt {x, y, z, yaw, street}`, tickets, pound status |
  | `homes` | per-lead upgrades and stash contents |

- **Persistent world entities: an engine service, `src/world/Persistent.ts`** (lands with the
  Phase 4 vehicle integration).
  - Owned cars, and anything else flagged persistent, are registered with an id and pose. They
    stream with their chunk: they spawn exactly where they were left when the chunk loads, and
    are serialised when it unloads.
  - **They never despawn.** AI traffic despawn rules don't apply to them.
  - Tow and pound transitions are gameplay events that move the entity, so the engine simply
    re-homes it.

### E11. Shared building condition and the shared reference library (for facades and interiors)
- **`src/shared/condition.ts`:** one condition grade per building, used on both sides of the
  wall. 0 derelict, 1 worn, 2 lived-in, 3 kept, 4 pristine.
  - `buildingCondition()` is deterministic from building data: style, year, use, floors,
    avenue frontage, the west side, and a per-id spread. Heroes are 4.
  - A per-place override from content wins on both sides.
  - In Phase 3 the engine bakes the grade into chunk records, and interiors reads it from the
    same record via `buildingId`.
- **`references/catalog.json` + `tools/refs/collect.ts`:** one library for every stream.
  - `RefEntry` gains optional `kind` (exterior, interior, street, vehicle, people) and
    `condition` (0–4 exemplar grade).
  - Ids are namespaced by archive (`documerica_`, `loc_`, `habs_`, ...).
  - Add collectors to `collect.ts`, or a separate script writing the same shape. Only public
    domain or no-known-restrictions items, with credits and rights recorded per entry.

### E12. Day/night moves into Phase 3 (`docs/briefs/TIME.md`): **ACCEPTED**
- **Lighting:** the full day/night cycle is built in Phase 3, not Phase 6. Facades, materials
  and the interiors tier-C window shader are judged at noon, golden hour, dusk and night from
  the start. Weather variety stays in Phase 6.
- **Clock and calendar service:** `src/world/Clock.ts` is upgraded in Phase 3.
  - About 48 real minutes per game day by default (`settings.dayLengthMinutes`, owned by the
    UI settings schema). It pauses in menus and cutscenes.
  - API: `advance(minutes)`, `setDate`, `waitUntil(hhmm)`, events `hour`, `dawn`, `dusk`,
    `day`.
  - Sun and moon positions come from real NYC solar geometry for the in-game date.
- **Mission time windows:** outside `requires.timeWindow`, the marker offers "Wait until
  <start>?" (the UI owns the prompt). Accepting plays a 3–5 s skippable time-lapse in the
  reel-change language: the camera rises, the sun arcs, lights come on in waves. The engine
  drives the sun, lights and clock; cinematics drives the camera and film treatment through
  `CameraDirector`; the mission starts on the `commit` cue.
- **Lighting groups:** streetlights (sodium on avenues, mercury on side streets), neon, signs,
  window lights on per-building schedules, and grating glow. They're grouped per chunk and
  block, switched by the clock (dusk and dawn waves with per-fixture jitter) and by
  `set_power` brownouts (N2).
- **Sleep:** gameplay owns the action and its effects. The engine performs the `advance` and
  respects the N10 date hold.

### N10. Story-clock policy for dated missions: **ACCEPTED as written**
1. Missions are available when unlocked, regardless of date.
2. Starting before `dateRange[0]` runs `set_date` plus `advance_time` to the window start,
   under a "time passes" card.
3. Starting after `dateRange[1]` still starts the mission, and its date ambience plays anyway.
4. **The date hold:** free roam and sleep roll the time of day but never push the date past
   the next pinned story date until that mission starts. The clock exposes `nextPinnedDate`
   for this.

No soft-locks are possible. The engine's validator also checks that pinned dates are
monotonic along the main chain.

### Batch of 2026-11-26 (evening)
- **Audio 10 (modern part heights on Eighth Ave):** not present in the current engine data.
  It came from builds before the parts-on-stand-ins fix (E5). The build now has a **period
  gate**: it fails if any building in the region is over 260 m other than the Empire State
  Building. The current tallest is the Pan Am Building at 246 m. Please merge the engine
  branch.
- **Mission rules** (user: "you can kill cops during missions"): **ACCEPTED** for the Phase 7
  mission runtime.
  - Police kills never fail a mission.
  - A `lose_police` objective or gate waits on gameplay's `heatClear()`.
  - The fail screen shows a reason: essential character died, required vehicle destroyed,
    target escaped, left the area, wasted, busted, or time out.
  - Retry from checkpoint with the section snapshot (E9).
- **UI note on the CameraDirector FOV:** fixed. `release()` now blends the FOV back to the
  player's live FOV, as well as position and rotation.
- **Phase 3a (procedural facades): in progress** on this branch. Facade coordinates are in
  real metres, plus a per-building record (style, condition, floor height, seed). There's a
  TSL material in `src/render/FacadeMaterial.ts`. The interiors tier-C hook is the lit-window
  colour path.

## Batch of 2026-11-26 (night): sim 5–7, vehicles 7–11, interiors 1–7, characters 1–3, UI contracts
Sequencing: the Phase 3 look comes first and is judged against the target before anything else is
called done. Then come the integration merges, in this order: sim, then vehicles, then characters,
UI, gameplay, interiors and audio. Each merge is verified on the merged result: every stream's
tests, integrated shots, frame time, and a regression note in PROGRESS.md (user: "do this right,
not rushed").

### Shipped now
- **Sim 6, `setTerrainData(buf)`: SHIPPED** in `src/shared/terrain.ts`. Node tests can drop the
  `data:` URL.
- **Vehicles 7, new classes: SHIPPED** in `src/shared/traffic.ts`:
  - `ambulance`, `fire_engine`, `ladder_truck`, `mail_truck`, `ice_cream`;
  - `motorcycle`, `police_motorcycle`, `bicycle`.

  Vehicles: please move `PROPOSED_CLASS_MODELS` into `CLASS_MODELS`. A two-wheeler class may
  resolve to `null` in the traffic renderer until it instances bikes.
- **Road paint: SHIPPED (47c3715).** Chunk format v2 adds a `PNT` section, so streams that parse
  chunks themselves must take the new `chunkFormat.ts`. The markings:
  - white 10 ft dashes on 30 ft gaps;
  - a double yellow line on two-way streets;
  - two-line crosswalks.

### Sim
- **5. Parked cars:** **ACCEPTED** for Phase 5. Sim owns placement, since it already reserves
  the parking lane and knows the bus stops. Vehicles draws them through the traffic renderer
  as `state: 'parked'`. The engine only reserves the draw budget.
- **7. Real-device timing:** **ACCEPTED (needs the user).** It's tracked in PROGRESS.md as a
  user check once `?sim=1` is on the integrated build. Moving the sim to a worker stays the
  fallback; nothing is decided until the numbers are in.

### Vehicles
- **2. `scene.environment`:** **ACCEPTED, Phase 3 (now, next step).**
  - First, a PMREM of the live sky, refreshed when the sun moves more than 2°.
  - Later, CC0 HDRIs and local probes (`docs/briefs/ART_ASSETS.md`).
- **8. Owned-vehicle saves:** **ACCEPTED.** Vehicles registers its own section,
  `registerSection('vehicles', v1, …)` (E9), holding `VehicleSave[]` and `TwoWheelerSave[]`.
  Ownership (which lead, garage or street, tickets) stays with gameplay (HOMES_AND_CARS). Link
  the two by the vehicle `id`.
- **9. Moving platforms:** **ACCEPTED, Phase 4** (also covers interiors 5, elevators).
  - `PlayerController.setPlatform(body | null)`: the controller adds the body's
    per-fixed-step delta (translation and yaw) before solving the move.
  - Ground contact picks the platform up automatically when the support collider belongs to a
    kinematic body.
  - The rider crash hand-off is relayed to characters (ragdoll spawn from `riderPosition` and
    `riderVelocity`).
- **10. Subway track data:** **ACCEPTED, Phase 5, pipeline-side.**
  - The pipeline emits `public/data/subway.json` from OSM `railway=subway` (1974 IND, IRT and
    BMT lines only, period-gated like buildings): centrelines at rail-top height, plus
    stations with platform extents.
  - Sim drives `train.setState`. Interiors owns stations, and the stair cutouts are already on
    the engine list.
- **11. `applyHit()`:** noted, and relayed to gameplay in the next oversight sweep.
- **5 and 6:** bloom and post are already applied (the vehicles' emissives pick them up after
  merge). **SkidMarks: ADOPTED as-is**, owned by vehicles; the engine adds the mesh at
  integration.

### Interiors
- **1 and 2. Facade openings and roof hatches:** **ACCEPTED, at the interiors merge**, which is
  the first thing after the sim and vehicles merges.
  - The worker loads `interiors/index.json` next to `terrain.bin`.
  - `extrude()` splits outer-ring walls around `shellOpenings()` spans and holes roofs at
    `roofHatchesWorld()`.
  - Render and collider come from the same geometry, so both are cut.
  - LOD1 stays uncut.
- **3. Contract additions:** **ACCEPTED.** `await interiors.ready` before the first chunk
  build. When `exteriorHidden` is set, the engine hides LOD1 and chunks beyond 60 m and skips
  the sky.
- **4. Indoor character light:** **ACCEPTED-PARTIAL.**
  - When `inside()` is non-null and `exteriorHidden`, sun and hemi scale to 0.15 and the
    shadow casters skip.
  - A per-object `lightAt()` tint for characters is Phase 5, with characters.
- **5. Elevators:** see vehicles 9 (`setPlatform`).
- **6. Tier-C window data:** **ACCEPTED, with a change.**
  - No per-window attributes. The facade shader already knows building id, style, condition,
    floor height and a seed per building, and computes floor and column per window. The
    window id is `hash(buildingSeed, floor, column)`.
  - **Engine adds `use` (residential, office, loft, hotel, retail) to the per-building record**
    and `areaPower` and clock-minute uniforms.
  - Interiors ships the room function as a TSL `Fn(windowId, use, floor, uvInPane)` that returns
    the colour. The engine calls it where it now draws the lit-window colour.
- **7. Water tanks:** **ACCEPTED.** After merge, the engine's far water tanks come from
  `roofFeatures(buildingId)`, replacing today's heuristic placement, so the near and far tanks
  always match. Interiors hides the engine instance within its 30 m swap radius by id.

### Characters
- **1. Appearance sheets:** **REDIRECTED to narrative.** Narrative owns wardrobe and props; the
  question of personal props is relayed.
- **2. `groundAt(x, z)`:** **ACCEPTED, at the characters merge.** It goes in
  `src/shared/ground.ts`:
  - y comes from a short downward Rapier ray when physics is resident (curbs, stoops, stairs),
    else `heightAt()`;
  - `surface` comes from the chunk ground kind (road → asphalt, sidewalk and plaza →
    concrete, curb → stone, park → dirt), with grates and puddles in Phase 6.
- **3. Factory wiring:** **ACCEPTED, at the characters merge.**

### UI contracts (question from the oversight session)
**Reviewed; within the hand-off. ACCEPTED.**
- `Settings.ts` became UI-owned at c3db008.
- The `Input.ts` bindings patch is what ui 3 asked for: defaults identical, a context-gated
  extra action per key, and a pad override per action. Two notes:
  - The D-pad and LB double meanings (hud/inventory/weaponSelect vs. menu nav and tabs) must
    stay context-gated in gameplay. Menus read `nav*` and `tab*` only.
  - Gameplay must not read `jump` during a cutscene, because A also maps to `skip`.
- `src/shared/uiHost.ts` and `uiEvents.ts`: **ACCEPTED as shared contracts, engine-owned after
  merge.** Changes go through ENGINE_REQUESTS like `traffic.ts`.
- `uilab.html` goes into the Vite inputs at the UI merge (the file has to exist first).

### Art assets (the user, relayed by the oversight session: "graphics should really be true to life")
**ACCEPTED** as written in `docs/briefs/ART_ASSETS.md` (copied to this branch).
- CC0 scanned PBR detail goes under the procedural facades and ground, blended by condition.
- CC0 HDRIs supply reflections.
- Budgets: KTX2 textures, ≤ 256 MB High, ≤ 64 MB mobile Low. Sources go in
  `docs/ART_SOURCES.md`.
- This is Phase 3 work after the sky environment.
- Sign slots and prompt packs come later, with the text policy as written.

### Touch controls (TOUCH_CONTROLS.md, UI-owned): engine asks **SHIPPED**
- **Analog pedals:** `input.touchPedals.gas` and `input.touchPedals.brake` (0..1) are written by
  the touch UI. `input.gas` and `input.brake` (0..1) merge pad RT/LT, touch and W/S each frame,
  and the Phase 4 driving context reads them. They reset on window blur.
- **Safe areas:** `viewport-fit=cover` is set in `index.html`, and `env(safe-area-inset-*)` is
  available, including the `--safe-*` variables in `theme.css`. No engine change is needed.

### Gameplay 15, `nearestTalkable(x, z, radius)` and `talk(id)`: **ACCEPTED (Phase 7, mission and trigger runtime)**
- **Shape:** `nearestTalkable` returns `{ id, name, kind: 'mission' | 'side' | 'named', x, z, prompt } | null`.
  `talk(id)` starts the conversation or mission intro, or returns `false` if the character is
  busy or out of their time window.
- **Wiring:** the runtime calls `gameplay.bindTalk({ nearestTalkable, talk })` at integration, as
  701f4cb expects. Until then, gameplay's fallback to sim ped barks stays in place.
- **Candidates:** narrative's cast and activity registries, filtered by the story clock. A
  character outside their mission window is not talkable; the `waitPrompt` path handles waiting.

## Engine notice E13 (2026-11-26): loading time and the phone viewport (real-device bugs)
- **Half-canvas on iPhone: FIXED** (b83317d). The canvas is sized by CSS, and the engine re-checks
  its real size every frame. Test: `npm run test:viewport`.
- **Slow load: FIXED.**
  - **Cause:** the title waited for `world.idle`, meaning every chunk within the LOD1 radius (114
    chunks, nearly the whole city). Streaming was also paced by the main thread's frame rate,
    because each worker held a single job.
  - **Fixes:**
    - The title is gated on the chunks within 300 m of its camera, plus an asynchronous shader
      warm-up (`compileAsync`, capped at 8 s). Everything else streams behind the menu and play.
    - Workers keep 3 jobs in flight.
    - Physics builds colliders nearest-first.
    - Vendor code is split into long-cached files (`vendor-three`, `vendor-physics`). A game update
      re-downloads about 100 KB.
  - **Headless proxy** (SwiftShader, about 1.5 s per frame): title-ready went from 137 s to 9.6 s.
    New Game to playable is under 50 ms.
  - **Budget test:** `npm run test:load` fails if title-ready exceeds 15 s, or New Game to playable
    exceeds 3 s, on the proxy. The phone target is interactive in under 5 s.
  - **Load report:** phase marks, worker vs install cost per chunk, and real frame times during
    load. It's printed to the console as `[T74 load]`, included in the `?hud=1` perf-report copy,
    and available as `__T74.load.text()`.
  - **Baked wall AO** was already computed in the data pipeline (0.4 s at build time, stored in
    the chunk). It costs nothing at load. The sky PMREM is opt-in (`?env=`) at 128 px.
- **Proposed contract change, for merge time:** the physics library is 80% of the download
  (rapier3d-compat inlines its wasm as base64: 4.3 MB raw, 1.67 MB gzip). The plan is to move the
  game bundle to the non-compat package, which streams and compiles the 3 MB `.wasm`, through one
  shared import point, `src/shared/rapier.ts`. Node-side headless tests keep the compat build.
  - Every stream that touches Rapier (vehicles, gameplay, characters, interiors) must import
    `RAPIER` from `src/shared/rapier.ts`, never from the package directly. Two wasm instances
    cannot share one physics world.
  - This lands with the vehicles merge, not before.

## Batch of 2026-11-26 (late): audio 11, characters 4, interiors 6b, vehicles 12, iOS fullscreen
- **Vehicles 12, analog pedal axes: SHIPPED.**
  - `input.gas` and `input.brake` (0..1) merge pad RT/LT, touch pedals and W/S. The touch UI
    writes them to `input.touchPedals`.
  - `input.throttle` aliases `gas`, and `input.steer` is `move.x` (−1..1).
  - The settings keys (`steerAssist`, `steerAssistStrength`, `autoAccelerate`, `autoCruise`) go
    in the UI-owned settings store. That's a request to the UI chat; the engine doesn't edit
    `Settings.ts`.
- **Interiors 6b, Tier C hook: ACCEPTED, at the interiors merge**, as proposed.
  - **Shipped now:** `facadeUniforms.minutes` (game clock) and `facadeUniforms.areaPower` (0, 0.45
    or 1, per area when N2 lands).
  - **`use`:** the engine adds it as a third component of the `wallAO` vertex attribute at the
    merge, taken from the chunk record.
  - **Note:** `lodFade` now comes from distance and viewing angle, not `fwidth`, which makes it
    rotation-invariant (the window-lights bug). It also fades later: it starts at a 4 px bay and
    is complete at 1.5 px. Your `(1 − lodFade)` gate works unchanged and now covers more windows,
    so measure the cost on `?hud=1` after the merge.
- **Characters 4: SHIPPED.** `docs/ART_SOURCES.md` now exists as the shared log, with the six
  fabric scans.
- **Audio 11, rendered speech in the build:** **NEEDS THE USER.** It's a hosting choice: build
  the renders at deploy time (the build image would need espeak-ng and ffmpeg, which Vercel's
  default doesn't ship), or use a prebuilt artefact (Git LFS or a release asset). It goes to the
  oversight session for the user. The placeholder voice fallback stays meanwhile.
- **iOS fullscreen (oversight, user report):** **REDIRECTED to the UI chat** for the button.
  - The ⛶ button is in `src/ui/TouchControls.ts`, which the UI chat owns. On iOS WebKit (every
    iOS browser) it should become the "Add to Home Screen for fullscreen" card, hidden when
    `display-mode: standalone` or `navigator.standalone`.
  - **Engine side shipped:** the manifest now has icons (192, 512 and maskable 512) and
    `display_override: [fullscreen, standalone]`, with landscape orientation. `index.html` has
    `apple-touch-icon` and `apple-mobile-web-app-title`; `viewport-fit=cover` and
    `apple-mobile-web-app-capable` were already present.

## Engine notice E14 (2026-11-26): landmark display names and the device perf report
- **Landmark names: SHIPPED** (the user's decision, via oversight and narrative 64f0d3b and 6cb2501).
  - The pipeline reads `content/landmarks.json` (copied unchanged from narrative). `world.json`
    heroes now carry `{ id, name, short }` display names, for example `lm.macys` → "Lacy's".
    Real names never reach the data.
  - Engine lookups use `id`. The old UI pause map falls back to `hero.name`, so it already shows
    the new names. Its `SHORT_NAMES` table of real names is dead code in `src/ui/StreetMap.ts`;
    UI chat, please drop it (it's retired on your branch).
  - **Build check:** `tests/brands.test.ts` builds a denylist from the registry's `real` names and
    aliases. It fails on any match in `world.json`, street names or district names. It's proven
    against the old `world.json`, where it caught every real name.
- **Perf report (`?hud=1` copy):**
  - New fields: real frame interval, JS time per frame, and GPU time per frame (WebGPU timestamp
    queries with `?hud=1` or `?gpu=1`, where the adapter has them; reported as unavailable
    otherwise).
  - A diagnosis line says whether the frame is vsync-locked with headroom (a cap such as iOS Low
    Power Mode) or actually busy.
  - Also: the device hint (`&device=…`), screen, cores, memory, standalone launch, load phases,
    adaptive DPR state and LOD radii.
- **Adaptive resolution** (on by default on touch; `?adaptive=0` or `?adaptive=1` to force): the
  render scale climbs while frames keep their locked interval and backs off when they slip, up to
  min(device DPR, 2).
- **Low-preset triangles:** props (fire escapes, AC units, water towers, awnings) were about 65% of
  each near chunk's triangles. They now have their own draw distance: Low 180 m, Medium 300 m,
  High 450 m, Ultra 700 m.

### Sim 8, `tow_truck` and `street_sweeper` classes: **SHIPPED**, in `src/shared/traffic.ts`
Vehicles: please map both in `CLASS_MODELS`. Until models exist, `box_truck` and `garbage` are fine
fallbacks in `resolve()`. Sim's integration (a3392f1) is queued as the first merge, after the Phase 3
look shots.

## Requests check, 2026-11-26 22:32
- **Interiors 8, ART_SOURCES entries:** **ACCEPTED.** Interiors ships no third-party assets yet. The
  engine adds the lines from `docs/interiors/ART_NOTES.md` to `docs/ART_SOURCES.md` in the commit
  where the first interior asset (CC0 material or generated art slot) lands.
- **Sim 8:** already SHIPPED (84f71af). Sim's merge candidate is now 0447d43.

## Engine notice E15 (2026-11-26): window lights changing as the camera turns, FIXED (c9678a3)
- **Root cause:** per-building values (style, condition, seed) reach the facade shader as
  interpolated vertex attributes, and interpolation of a constant is not exact. A style of 4 could
  arrive as 3.9999998 at some pixels, depending on the view. The window id also truncated
  `seed*1000` to an integer, so lamp colour and lit/unlit flipped per pixel as the camera moved.
- **Fix:**
  - Style and condition are rounded and the seed is quantised to an integer.
  - Window ids combine seed, floor and bay in exact uint arithmetic.
  - LOD1 uses the same material and attributes, so the lit set is identical across LOD.
  - The earlier change (rotation-invariant window-LOD footprint, 3f61d34) stays. On its own it
    was **not** the cause: it measured no better.
- **Test:** `npm run test:windows` (`tools/tests/windows.ts`). It yaws a fixed night camera in
  4° steps, re-projects each frame into the previous one (a pure-rotation homography), and
  measures the share of lit-window pixels that changed. The limit is 3%.
  - Old build: 7–19% at Madison Square and 17–48% on Broadway in the 30s.
  - Fixed: 0.0–0.4%.
- **For other streams that read per-building attributes in shaders** (interiors Tier C):
  `floor(x + 0.5)` before any `equal()` or hash.

## Engine notice E16 (2026-11-26): doors on every building, and the facade data fixes
- **Doors: SHIPPED, ahead of the interiors merge** (user: "not sure if we have doors in all the
  buildings").
  - The pipeline gives every building with street frontage a door, 4,447 of them (the rest are
    boxed in by neighbours or are raised parts). It sits on the longest wall facing open space,
    centred on the shared facade grid's nearest bay.
  - Door records use interiors' `DoorRec` fields (`style`, `width`, `height`, `rise`,
    `nightGate`, `enterable`). They're stored in a new optional `DOOR` chunk section.
  - Styles follow the building type: tenement stoop or vestibule, shop or recessed shop (with
    roll-down gate housing), freight (lofts), brass double or revolving (offices and heroes),
    church steps (civic).
  - The geometry: a stone or iron surround, the leaf (wood, glazed bronze or steel), a transom,
    a revolving drum, and stoops with brownstone cheek walls. It goes in the props mesh, so stoops
    have colliders.
  - **Interiors:** at your merge, `doorsForChunk` replaces these records by `buildingId`. Note
    that building ids changed in this pipeline run (overlap pass: 47 duplicates removed and 60
    split pieces get new ids), so please regenerate `interiors/index.json` against the current
    `public/data` before the merge. Facade cuts at doors (request 1) still come with the merge;
    for now doors sit proud of the wall.
- **Facade data fixes (00ce718):** an overlap pass clips lower buildings by taller ones, and
  floor counts are re-derived where they fall outside period floor-to-floor ranges.
  `src/shared/facade.ts` is the one grid definition (floor height, bay, sill) shared by the
  shader, the props and the doors. Interiors and signage should use it too.

## Requests check, 2026-11-27 00:33
- **Audio 11, rendered speech at build time: ACCEPTED, at the audio merge** (the user approved
  build-time rendering).
  - The deploy build becomes: copy narrative `content/` to `public/content` → `npm run
    audio:voices:build` (soft-fail, cache in `node_modules/.cache/t74-voices/`) → `tsc` → `vite
    build`.
  - The engine owns `package.json` scripts and the Vite config, so it wires this at the merge,
    together with narrative `content/`.
  - Gate: the brands test must pass on rendered subtitles too. The GPL tools stay
    devDependencies and are verified absent from the bundle by a build check added at the merge.
