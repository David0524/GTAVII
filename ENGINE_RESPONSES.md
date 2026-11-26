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
