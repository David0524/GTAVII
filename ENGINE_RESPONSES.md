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

### E1. Terrain with real relief: **PROPOSED, waiting for the user to confirm directly** (relayed through the oversight session)
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
