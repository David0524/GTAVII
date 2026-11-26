# ENGINE_REQUESTS: from the narrative team

Each request lists what we need, why, which mission needs it, and the fallback we design
against until it ships. The engine team owns all decisions here.

## 1. Calendar date in the world clock
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

## 2. Area power state ("brownout")
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

## 3. Overheard dialogue volumes (passive listening)
- **What:** A trigger action that plays a dialogue script as **ambient subtitles** when
  the player is within a radius, without freezing control or framing a camera. It
  should stop cleanly if the player walks away.
- **Why:** Witnessing (theme 5) and the brief's subway-grating overheard conversations.
  Several tail missions reward the player for listening in.
- **Needed by:** the Act 1 walk-and-talk up Broadway, the Act 2 tail missions, N6 ambient
  overheard talk.
- **Fallback:** Use `start_dialogue` on a small trigger volume with `once: true`, and
  accept that it takes control for a moment.

## 4. Walk-and-talk companion
- **What:** An objective type or spawn behaviour where an NPC walks a route with the
  player, waiting if the player falls behind and speeding up if the player is ahead.
  Dialogue lines play as both move.
- **Why:** The opening mission is a walk up Broadway with Mayhew. Its pacing must survive
  touch controls (mobile rule: no exact pacing required).
- **Needed by:** `mission.dusk_on_broadway` (the opener) and at least three later scenes.
- **Fallback:** A chain of `goto` objectives (Flatiron → W 26th → W 28th → W 31st St &
  Broadway), each starting a short dialogue on arrival, with the NPC re-spawned ahead at
  each stop.

## 5. Switching between playable characters
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

## 6. Region bounds must contain every story street (raised with the oversight session)
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
- **Status:** the user has confirmed the map is being expanded. Waiting on final bounds
  from the oversight/engine sessions.
