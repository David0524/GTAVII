# ENGINE_REQUESTS: from the narrative team

Headings follow the engine's protocol (`## From narrative: N. Title`). Responses live in
`ENGINE_RESPONSES.md` on the engine branch.

**Status as of 26 Nov 2026 (engine responses):**
| # | Status |
|---|---|
| 1 | ACCEPTED (Phase 6) |
| 2 | ACCEPTED (Phase 6) |
| 3 | ACCEPTED (Phase 7) |
| 4 | ACCEPTED (Phase 7) |
| 5 | ACCEPTED (Phase 7, design built in from Phase 2) |
| 6 | Resolved by E4 bounds |
| 7 | New |


Each request lists what we need, why, which mission needs it, and the fallback we design
against until it ships. The engine team owns all decisions here.

## From narrative: 1. Calendar date in the world clock
- **What:** A game calendar date (YYYY-MM-DD) alongside time of day, which narrative
  content can read in `requires` and `when` (for example `"dateRange": ["1974-07-05","1974-08-07"]`),
  and a hook to advance it, such as "sleep until next day" at the Corwin.
- **Why:** The story runs 21 Jun to 2 Sep 1974, plus 1 Oct. Newspapers change weekly,
  4 July and Labor Day are story beats, and the presidential resignation broadcasts on
  8–9 Aug.
- **Needed by:** every act transition, the weekly newspaper props (N6), the Act 3
  radio triggers.
- **Fallback:** Narrative tracks the date in flags (`flag.week_01` … `flag.week_11`,
  `flag.date_jul04`), set by story-mission rewards. The ambient world keys off those
  flags. This works, but the date can't advance in free roam.

## From narrative: 2. Area power state ("brownout")
- **What:** A trigger action that dims or disables streetlights, signs, traffic signals
  and window lights inside a named area (a block range or a landmark radius) for a time
  window, plus a readable state (`world.power[area] = "on|dim|off"`).
- **Why:** Act 2's brownout nights are a P5 set piece, and the fur-vault mission depends
  on compressors stopping.
- **Needed by:** Act 2 missions (Fur District heist, the Corwin power cut), ambient
  triggers on brownout nights.
- **Fallback:** Use overcast night weather. Scripted dialogue and HUD text state that the
  power is out. Interiors switch to an "unlit" variant through the interior marker's
  `kind`. Street lighting stays on, which is less atmospheric but playable.

## From narrative: 3. Overheard dialogue volumes (passive listening)
- **What:** A trigger action that plays a dialogue script as **ambient subtitles** when
  the player is within a radius, without freezing control or framing a camera. It
  should stop cleanly if the player walks away.
- **Why:** Witnessing (theme 5) and the brief's subway-grating overheard conversations.
  Several tail missions reward the player for listening in.
- **Needed by:** the Act 1 walk-and-talk up Broadway, the Act 2 tail missions, N6 ambient
  overheard talk.
- **Fallback:** Use `start_dialogue` on a small trigger volume with `once: true`, and
  accept that it takes control for a moment.

## From narrative: 4. Walk-and-talk companion
- **What:** An objective type or spawn behaviour where an NPC walks a route with the
  player, waiting if the player falls behind and speeding up if the player is ahead.
  Dialogue lines play as both move.
- **Why:** The opening mission is a walk up Broadway with Mayhew. Its pacing must survive
  touch controls (mobile rule: no exact pacing required).
- **Needed by:** `mission.dusk_on_broadway` (the opener) and at least three later scenes.
- **Fallback:** A chain of `goto` objectives (Flatiron → W 26th → W 28th → W 31st St &
  Broadway), each starting a short dialogue on arrival, with the NPC re-spawned ahead at
  each stop.

## From narrative: 5. Switching between playable characters
- **What:** Three playable characters (`char.teddy_arce`, `char.delphine_moore`,
  `char.nick_varelas`), each with their own position, wardrobe, money and inventory. We
  need:
  - a switch action in free roam (between missions), with the camera cutting to the
    other character wherever they are in their own daily schedule;
  - a scripted `switch_to` objective or action inside missions;
  - save state extended to per-character state, for example
    `"characters": { "char.x": { "money": 0, "inventory": [], "at": "..." } }`,
    plus `"activeCharacter"`.
- **Why:** The reviewer approved three converging leads introduced across the first half.
  There are 10 joint missions (M9, 12, 17, 18, 21, 22, 26, 27, 28, 32).
- **Mobile:** The switch should be one large button that opens a three-portrait picker
  (no hold or radial gestures). Mid-mission switches are only offered at safe points,
  never under a timer.
- **Fallback:** Switching happens only at mission boundaries. Each mission declares its
  `playAs` lead, and the narrative sets a `flag.active_<lead>` that the engine reads to
  pick the player spawn and wardrobe. In joint missions the other leads are
  companion NPCs. Money stays a single shared pot, and per-lead balances are tracked
  in flags for story purposes only.

## From narrative: 6. Region bounds must contain every story street (raised with the oversight session)
- **What:** Expand the playable region so that no story street is an edge street. The
  oversight session has asked the engine for about Ninth/Tenth Ave on the west and about
  47th St on the north (see `docs/BOUNDARIES.md` on `claude/awesome-keller-i9tmmu`).
- **Story locations at or past today's edges** (between Eighth and Ninth Aves; about 44th St):
  - `loc.carriers_garage`, W 38th St & 9th Ave: Augie Lomax and Héctor Villalba;
    missions 4, 14, 16, 20, 24, 30.
  - Augie's after-work corner at 9th Ave & W 39th St.
  - Delphine's whole turf: Eighth Ave from 34th to 42nd St and the 42nd St Deuce
    (`loc.arden_hotel` at W 39th & 8th, `loc.bauer_arcade` at W 42nd & 8th,
    `loc.eighth_ave_cafeteria` at 8th Ave & W 40th). Her escapes need blocks to the west.
  - Penn South, Eighth to Ninth Aves, W 23rd–29th (`loc.penn_south`, Carmen's home).
- **Needed by:** Delphine's solo missions (6, 8, 11, 13, 23, 31), every Garment District
  trucking mission, and the Labor Day finale.
- **Fallback until confirmed:** missions, tails and chases stay at least one block inside
  the current edges. Outward chases end on a layer-2 roadblock or a layer-3 jam
  (`content/boundaries.json`). If the expansion is refused, move `loc.carriers_garage` to
  W 37th St between Seventh and Eighth Aves and re-route Delphine's escapes eastward.
- **Status: RESOLVED by engine E4** (`src/shared/bounds.ts`, commit 444bcd4). West is
  mid-block 10th–11th Aves, north mid-block 47th–48th Sts, east mid-block Lexington–3rd,
  south mid-block 18th–19th. Every listed location is now inside, with about two avenues of
  room west of Eighth. Missions keep at least 60 m (`EDGE.BLOCKERS`) inside the new edges.
  The Lincoln Tunnel trench (Dyer Ave) is now inside the map, as chase terrain.

## From narrative: 7. Confirm the schema for `content/boundaries.json` (layer-2 blockers)
- **What:** Confirm or amend the shape the narrative team wrote for the blockers in
  `docs/briefs/BOUNDARIES.md`, before the engine builds them in Phase 2. Each blocker looks
  like this:
  `{ id, kind: film_shoot|utility_trench|water_main|police_barricade|block_party|geography,
  segment: "<real street> @ <west|north|east|south> edge", acts: [1,2,3], when?: { time?,
  weekday?, dateRange? }, removedWhen?: { flags }, replacedBy?, barks?, sign?, note }`.
  There's also a `defaultRotation` for crossing streets that aren't listed, a
  `brownoutVariant`, `actChanges`, and bark pools `barks.<id>: [{ emotion, text, context?, if?, once? }]`.
- **Why:** Segments are keyed by the street that crosses the edge (not coordinates), which
  matches how all narrative content refers to places. The `when` keys reuse the clock
  vocabulary from N1 (`dateRange`, `weekday`).
- **Fallback:** If the engine prefers a different shape, the narrative team will convert. The
  content is small (16 blockers and 78 barks).

## From narrative: answers to the engine's asks (ENGINE_RESPONSES N5)
1. **Lead home spawns** (block faces, not house numbers: we'd rather not pin invented
   businesses to real buildings' addresses). Please put each door on a pre-1975, non-landmark
   facade on that block face.
   | Lead | Home | Block face | Off-map fallback |
   |---|---|---|---|
   | `char.teddy_arce` | `loc.corwin_hotel` | W 31st St, Broadway–6th Ave, north side | — |
   | `char.delphine_moore` | `loc.arden_hotel` | 8th Ave & W 39th St, NE corner (door on W 39th) | — |
   | `char.nick_varelas` | `loc.varelas_loft` | W 30th St, 6th–7th Aves, north side | 23:00–07:30 he's off map (home): switching to him then spawns him in his sedan on 7th Ave & W 30th St, on his night drive |
   **Free-roam schedules** ("where are they when you switch to them"): the `schedule` array of
   each lead in `content/cast/leads.json` (5–7 entries covering 24 hours, each with a place id or
   intersection). `content/places.json` resolves every `loc.*` id to a real intersection or
   block face. Every non-lead also has a 24-hour schedule (`content/cast/*.json`) for the
   NPC system.
2. **Clock range confirmed:** 1974-06-21 (Fri) to 1974-09-02 (Mon, Labor Day), plus the
   epilogue on **1974-10-01** (`set_date` at the epilogue transition). Dates the narrative
   needs as world events: 1974-07-04 (holiday quiet, fireworks heard), the brownout nights
   1974-07-19 and 1974-07-26 (provisional, set in N3), 1974-08-08 evening (radio address,
   every radio), 1974-08-09 noon (resignation takes effect), 1974-09-02 (Labor Day).
