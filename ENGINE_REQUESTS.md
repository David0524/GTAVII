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

## From narrative: 8. Mission-contract extensions used by the N4 specs
Each extension the Act 1 missions (`content/missions/*.json`) use beyond the draft contract,
with a fallback. Validation is in `narrative/tools/content.py`.
| Extension | Shape | Why | Fallback |
|---|---|---|---|
| Per-lead relationships | `rewards.relationships` and dialogue `setRelationships`: `{ "char.<lead>/char.<npc>": delta }` | P4 with three leads; gates at +3 and −3 (N3 §5) | Store the composite keys as-is in the existing `relationships` map |
| `evade` objective | `{ type: 'evade', from: [ids], breakDistanceM, safeZones: [interior/loc ids] }` | Escapes solved by route knowledge (two-door buildings), not speed (M8, M9) | `goto` the safe zone with `timeLimitSec`; timer fail means caught |
| Fail types `spotted` and `caught` | `{ type: 'spotted', by, withinM }`, `{ type: 'caught' }` | Tails and escapes | `target_lost` and `timer` |
| Photo with two subjects | `photo { subject, with, minScreenFraction }` | "Photograph who he's meeting" (M5, M8) | Single-subject photo of `subject` |
| `start.type: 'auto'` | Starts when `requires` is met and the player is the `playAs` lead (with an optional `cut`) | Openers and lead introductions (M1, M6, M8, M9) | A `talk` start with the giver standing at the start point |
| Mission metadata | `playAs`, `switchPoints`, `date`, `number`, `chapter`, `durationMin`, `pillars` | Switching (accepted N5), the clock (N1), pacing QA | Ignore the fields you don't use |
| `requires.weekday` and `requires.dateRange` | Per the accepted N1 response | Sunday club night (M6), story dates | Flags |
| `rewards.items`, `rewards.act` | Inventory items; act transition (M9 sets act 2) | Evidence items; act changes | `setFlags` (`flag.act2_started`) |
| `escort.dialogue` as a list | One script per route leg | Segment-gated walk-and-talk (accepted N4) | Chain of goto objectives |
| Conditional objectives | objective `if: "flag.x"` (or `"!flag.x"`); the engine skips objectives whose condition is false | Branch-dependent steps (M21 copy vs steal; M29's four outcomes) | Split into variant missions with `requires.flags` |
| Optional objectives with their own rewards | objective `optional: true`, `onComplete: { setFlags, relationships, items }` | Optional photographs that become corroboration for Branch B2 (M13, M27) | Mandatory objectives |
| `requires.missionsDone` | list of mission ids that must be `done` | M26 needs M23, M24 and M25 (open order in Act 3) | Flags set by each mission |

## From narrative: 9. Side-activity schema (`content/activities.json`)
- **What:** A repeatable-activity runner. Each activity has:
  - `id`, `title`, `lead` (a lead id or a list), `unlockedBy`, `acts`, and `when { time, weather }`;
  - a `start` (talk, enter_vehicle, enter_interior or auto);
  - a `loop` of objective templates (the same objective types as missions) with
    `{placeholders}`;
  - a `pool` of rows keyed by placeholder name, one row drawn per loop;
  - `payout`, `cooldownMin` and `vehicles`.
- **Why:** The brief's 15–30 side activities (cab fares, garment deliveries, newspaper runs,
  photo jobs, races on the 1974 one-ways). 20 are written: 7 for Teddy, 5 for Delphine,
  4 for Nick and 4 for any lead.
- **Extras:**
  - Race objectives carry `race: { rival, oneWaysEnforced: true }`; wrong-way driving
    forfeits the race.
  - Brownout Relief starts only when `world.power(area)` is dim or off.
- **Fallback:** Each activity is expanded into short generated missions (one per pool row)
  with `requires.timeWindow`, unlocked by `unlockedBy`.
| Line-level relationship conditions and effects | dialogue line `ifRelationship: { "char.<lead>/char.<npc>": ">=3" }`; line `setRelationships`; choice `confirm: "text"` (a confirm step for branch choices) | Gated lines (M18 Yiannis's true count); confirm steps on Branch A and B | Duplicate scripts selected by flags that missions set from relationship thresholds |
| Compound conditions on choices and lines | `requires: { all: [flags], any: [flags], none: [flags], atLeast: { n, of: [flags] }, relationship: { "char.<lead>/char.<npc>": ">=2" } }`; gated choices carry `disabledText` and are shown greyed with that reason | Branch B (M29: B1 needs the wire OR Nick's flip; B2 needs 2 of 4 corroborations AND the editor neutralised); lead resolutions (M30, M31) | Missions set summary flags (for example `flag.b1_open`) before the choice |

## From narrative: 10. Story-clock policy for dated missions (no soft-locks)
- **What:** 26 of 32 story missions have a single-day `requires.dateRange` (for example
  4 July, 8 August, Labor Day and so on). Proposed policy:
  1. A story mission becomes available when it's unlocked, whatever today's date is.
  2. When the player starts it, if the world date is **before** `dateRange[0]`, the engine
     runs `set_date(dateRange[0])` plus `advance_time` to the window's start (a "time passes"
     card).
  3. If the world date is **after** `dateRange[1]`, the mission still starts, and its
     date-specific ambient world (fireworks, radio address) plays anyway. Story dates are
     anchors, not deadlines.
  4. Free roam between missions never pushes the clock past the next story date. The day
     rolls over, but the date holds at the next story date until that mission starts.
- **Why:** The weekly papers, act worlds and real-date beats (4 July, 8–9 August, Labor Day)
  need the calendar, but a player who lingers must never miss the story.
- **Found by:** the N7 static pre-pass (`narrative/N7_PREPASS.md`).
- **Fallback:** Narrative widens every `dateRange` to its act's range, and missions set
  date-specific ambience through flags.

## From narrative: 11. Lead combat stats: ACCEPTED by Gameplay (provisional; tuning follows playtests)
User decision, verbatim: "Full open world and missions like a GTA game". Gameplay's mapping (`src/gameplay/data/schema.ts` LeadProfile on claude/gameplay-74):
- aim = 1.9 − 0.15 × skill;
- evasion = (10 − memorability) × 0.06;
- blend maps to crowdCover;
- Old Beat and Evidence never touch officer-down reports. Scale 1–10 except health.
| Lead | Health | Handgun | Shotgun | Melee | Sprint | Stamina | Driving | Blend | Memorability | Specials |
|---|---|---|---|---|---|---|---|---|---|---|
| Teddy | 100 | 8 | 6 | 6 (takedowns, disarms) | 5 | 5 | 6 | 4 | 6 | **Old Beat:** once a day, gets one report downgraded at Midtown Central if his relationship with Kearney is +2 or more. **Keys:** opens locks faster. |
| Delphine | 90 | 5 (snub-nose) | 2 | 8 (straight razor) | 9 | 8 | 3 | 9 | 3 | **Evidence:** a photo of a cop taking money cancels his report on her. **Disappear:** breaking pursuit in crowds or two-door buildings is faster. |
| Nick | 110 | 3 | 4 | 4 | 3 | 3 | 8 | 2 | 9 | **Payroll (as amended by Gameplay):** bribes and witness payoffs cost 35% less, +0.3 to every acceptance roll, and auto-success below heat 2. Honest cops and investigators can't be bought by anyone. **Muscle:** `hireMuscle`. |

## From narrative: 12. Combat objectives in the mission contract
- `combat`: `{ mode: 'takedown'|'melee'|'firefight'|'survive'|'defend'|'eliminate', targets: [{ archetype, count } | { character, lethal?: false }], nonLethalAllowed: true, weapons?: [item ids], cover?: [...], durationSec? (survive), tutorial? }`.
  Non-lethal is always allowed for Teddy (his arc). Story-critical characters carry
  `lethal: false`.
- `chase`: `{ target, catchDistanceM, vehicleAllowed }`. Catching the target is the goal; route
  shortcuts on 1974 one-ways are authored in `note`.
- Fail `player_down`: retry from the last checkpoint. The hospital and arrest flow belongs to
  Gameplay (CORE_SYSTEMS).
- **Mobile:** every combat objective is clearable with soft-lock aim on touch.
- **Fallback:** combat beats become `survive`-style timed objectives with scripted enemies.
- **Used by:** Act 1 (M1–M9) as of commit 40d2413+. Acts 2–3 are next.

## From narrative: 13. Systems content delivered for Gameplay, Interiors and UI (schemas proposed)
Written by `narrative/tools/build_systems.py`. The owning chats confirm or amend the shapes.
| File | For | Contents |
|---|---|---|
| `content/police/precincts.json` | Gameplay | 3 invented precincts on real blocks (Midtown Central, Madison Square, Bryant Park), each with a desk sergeant, corruptibility 0–5, story-flag payoff effects, and the honest officers (Kearney, Greer, Navarro; Fisk of Internal Affairs) |
| `content/cast_service.json` | Gameplay, Characters | 10 service characters: desk sergeants, IA detective, lawyer Maureen Kehoe, property clerk, bail bondsman, ER surgeon, doorman, car salesman, garage attendant |
| `content/items/{weapons,ammo,consumables,keys,evidence}.json` | Gameplay | Invented gun makers and models by tier (street, service, quality, melee) with 1974 prices; ammo; consumables; keys; evidence. Maker names are batch-checked (weak), so they need individual and USPTO checks |
| `content/shops.json` | Gameplay, UI | Diners, clothing (outfit changes defeat descriptions), pawn, hardware, newsstand, drugstore, liquor, licensed gun shop, with 1974 prices |
| `content/crews.json` | Gameplay, Sim | 7 crews and their territories (all adults; defined by trade) |
| `content/economy.json` | Gameplay | Money outside missions: hack fares, garment runs, locksmith call-outs, the tabloid photo desk, bail skips, fences, the chop shop, numbers, OTB, cards and pool, fight cards, businesses for sale (with trouble events), Nick's properties, the loan shark |
| `content/homes.json` | Interiors, Gameplay | One home per lead with portrait dressing by act (Teddy: Corwin 9F; Delphine: Penn South; Nick: Madison & E 37th), plus Carmen's and Odessa's homes |
| `content/cars.json` | Gameplay, Vehicles | A used lot, a showroom, newspaper classifieds (lemons and bargains), an insurer and garages. Makes come from the vehicles registry |
| `content/barks/{police_radio,combat,surrender,ambulance,sleep}.json` | Gameplay, Audio | Dispatch lines with `{placeholder}` description templates (the heat cue); combat, surrender and arrest lines; ER lines; sleep and wake lines |
| `content/dialogue/sys_bail_*` and `sys_lawyer_*` | Gameplay | Bail-out scenes for all six lead pairs (relationship +1 both ways) and a lawyer call for each lead |
| `content/interiors.json` | Interiors | Added home interiors and subway interiors; Tier A marked |
- **Lead homes changed:** Delphine is now at Penn South (W 27th St) and Nick at Madison Ave & E 37th St. Spawns are updated. The off-map night rule for Nick is no longer needed.

## From narrative: 14. Side-content specs (`content/side/`)
- `content/side/side_content.json`: 52 ranked pieces with hook, twist, systems, place, leads,
  acts, reward and mobile note.
- `content/side/<id>.json`: full specs for the 5 vertical-slice candidates, in mission format
  with `kind: "side"`, `leads` (a list) and `acts`.
- **New fields:**
  - `goto.routeCalledBy: "passenger"`: the no-GPS route, where an NPC calls out turns
    (UI chat: subtitle and HUD repeat).
  - `race.oneWaysEnforced` (already accepted in N9).
- **Ask:** Is the side-quest runner the mission runner with `kind: "side"`, or the activities
  runner (N9)? The narrative side works with either.

## From narrative: 12b. UPDATE to 12: mission conventions (supersedes its non-lethal wording)
The user, verbatim: "Fully lethal everywhere" and "No you can kill cops during missions. That's
normal. Consider how GTA handles these things". Applied to all 32 missions by
`narrative/tools/conventions.py`.
- **Cops are ordinary killable police in missions.** A kill feeds heat only. There's no
  `cop_killed` fail or branch.
- **Objective flag `requireNoHeat: true`:** if the player has heat, the engine inserts a
  **`lose_police`** objective ("Lose the police": break contact, then wait out the search)
  before this objective unlocks. It's set on drop-offs, safe interiors and the first scene
  after a fight.
- **Mission field `essential`:** `[{ character, reason: "died" }]`. Any of them dying fails the
  mission with "<Name> died". These are characters the mission's later steps need. They're
  never invulnerable.
- **Standard fails on every mission:** `player_down` (wasted), `busted` (arrested) and
  `essential_died`, plus mission-specific `vehicle_destroyed`, `target_lost` and `timer`.
  Retry from the checkpoint, and offer a skip after repeated failures.
- **Consequence content:**
  - `content/barks/cop_killed.json`: officer-down radio, Teddy's reactions and his
    non-lethal contrast, Delphine, Nick and the street;
  - `content/police/precincts.json` `copKilled`: precinct memory, relationship nudges and
    headline templates.

## From narrative: 15. Traversal markup for chase routes (MOVEMENT.md)
Chase and evade objectives now carry `traversal`: an ordered list of beats `{move, at, marker, note?}`. This field is separate from `route`, which is already used for vehicle routes. Moves come from MOVEMENT.md's required set (vault, climb, fence_climb, drop_ladder, fire_escape, roof_jump, hang_drop, ladder, scaffold, subway_stairs, turnstile_vault, car_hood, crowd_push, cellar_doors, stoop).
- **Engine / interiors data:** please place traversal markup at each `tv.*` marker below, so the quarry and the player's assist line up with real fixtures. If a fixture doesn't exist at that spot, the nearest equivalent within about 30 m is fine. Tell me the move and I'll adjust the text.
- **Gameplay / sim:** the quarry path-follows the beats in order and rubber-bands to stay within about 40 m. A missed roof jump catches the ledge or drops to the fire-escape landing below. `turnstile_vault` adds +1 heat only if a transit cop sees it.
- `checkpointAfterMarker` puts a mid-route checkpoint after that beat. Each objective's `barks` names its lead-line pool (`barks.traversal`).

| marker | move | where | used by |
|---|---|---|---|
| `tv.8th_38_sidewalk` | crowd_push | 8th Ave & W 38th St, the Saturday-night sidewalk | mission.back_stairs |
| `tv.w38_alley_cans` | vault | a garbage-can row at the alley mouth, W 38th St | mission.back_stairs |
| `tv.arden_fe_ladder` | drop_ladder | the Arden's rear fire escape: jump and pull the counterweighted ladder down | mission.back_stairs |
| `tv.arden_fe_stairs` | fire_escape | the Arden's fire escape, four landings up, past lit windows (an argument; a baby; a radio) | mission.back_stairs |
| `tv.w38_airshaft_gap` | roof_jump | the Arden's parapet to the lower walk-up next door, over a 2 m air shaft | mission.back_stairs |
| `tv.w38_watertank` | climb | a water-tank platform, to break line of sight | mission.back_stairs |
| `tv.arden_bulkhead` | hang_drop | into the back stairwell bulkhead: the Arden's back stairs | mission.back_stairs |
| `tv.8th_34_cab` | car_hood | a double-parked Checker cab on Eighth Ave at 34th | mission.independence_day |
| `tv.8th_33_newsstand` | vault | a shuttered newsstand counter at 33rd & Eighth | mission.independence_day |
| `tv.psg_sidewalk_shed` | scaffold | a sidewalk shed on the Eighth Ave side of the Penn Square Garden block: up and along the plank deck | mission.independence_day |
| `tv.psg_shed_end` | hang_drop | off the shed's end, into the crowd leaving the fireworks | mission.independence_day |
| `tv.penn_8th_stairs` | subway_stairs | down the Eighth Ave entrance at 33rd into the concourse | mission.independence_day |
| `tv.herald_turnstiles` | turnstile_vault | the IND turnstiles. Vault (fare evasion: +1 heat if a transit cop sees) or pay the 35¢ token and lose three seconds | mission.shoebox |
| `tv.passage_gate` | vault | a fallen 'PASSAGE CLOSED' sawhorse at the 33rd St gate | mission.shoebox |
| `tv.passage_fixtures` | climb | over a heap of dumped display fixtures from the shuttered shops | mission.shoebox |
| `tv.passage_sleepers` | crowd_push | through a sleeping-bag row by the dead lights (walk; don't run anyone over) | mission.shoebox |
| `tv.passage_hatch` | cellar_doors | a service hatch into the Penn IND mezzanine | mission.shoebox |
| `tv.w34_crowd` | crowd_push | the W 34th St shoppers outside Lacy's | mission.side_purse_snatch |
| `tv.w34_hotdog_cart` | vault | a hot-dog cart at Broadway | mission.side_purse_snatch |
| `tv.w34_bus` | car_hood | a stalled bus on 34th | mission.side_purse_snatch |
| `tv.w35_stoop` | stoop | up and over a stoop rail on W 35th | mission.side_purse_snatch |
| `tv.w32_tarbeach` | vault | over the sunbather's folding chairs and tar-paper blankets | mission.side_tar_beach |
| `tv.w32_plank` | roof_jump | a plank laid across the gap to the next roof (it bounces) | mission.side_tar_beach |
| `tv.w33_watertank` | ladder | up the steel ladder of a water tank, to see where he went | mission.side_tar_beach |
| `tv.w34_coop_gap` | roof_jump | a short gap to a lower roof with a pigeon coop (the birds explode upward) | mission.side_tar_beach |
| `tv.w35_fe` | fire_escape | down a fire escape to the W 35th St side | mission.side_tar_beach |
| `tv.w35_fe_drop` | drop_ladder | drop from the lowest platform; the ladder is rusted up | mission.side_tar_beach |
| `tv.w41_cellar` | cellar_doors | he bolts out through the sidewalk cellar doors of the pool hall | mission.side_skip_board |
| `tv.w41_lot_fence` | fence_climb | a chain-link fence into a rubble lot off W 41st | mission.side_skip_board |
| `tv.w41_lot_car` | vault | a burned-out car hulk in the lot | mission.side_skip_board |
| `tv.w40_fence` | fence_climb | the lot's back fence, onto W 40th | mission.side_skip_board |

## From narrative: 16. Systemic encounter triggers (`do.type: "encounter"`)
`content/triggers/enc_purse_snatch.json` is the first systemic chase. While no mission is running, inside `volume` (its `at` plus `alsoAt`, radius 120 m) and with the cooldown elapsed, the game spawns the spec (`mission.side_purse_snatch`) as an ambient encounter. It builds a 3–5 beat `traversal` route from nearby markup of the listed kinds within 150 m, instead of the authored route. Ignoring the encounter is fine. Bystanders use `barks.chase_bystander` (context = beat kind: cart, hood, crowd, window, roof, subway, lot, newsstand). M26 also gains objective `o8c`, a rooftop chase with `finish: "tackle"`; the tackle API is pending from Gameplay. New tv.* markers are listed by `traversal.markers()`: tv.w31_fe_ladder, tv.w31_fe_stairs, tv.w31_skylight, tv.w31_gap, tv.w31_setback, tv.w31_billboard.
- **Update (27 Nov):** tackle finishers now use Gameplay's API (commit b4f05e9): `finish: "tackle"` with `lawful: true` on purse_snatch, tar_beach, platform_dip, coop_thief and M26 o8c. Two more systemic encounter types:
  - `trigger.enc_platform_dip`: a pickpocket at the morning rush on the Penn IND, Herald Square and Times Square platforms;
  - `trigger.enc_coop_thief`: a pigeon thief on the W 29th–38th roofs in the late afternoon.

  New markers: tv.penn_ind_platform_crowd, tv.penn_ind_bench, tv.penn_ind_turnstiles, tv.w29_coop, tv.w29_gap, tv.w29_watertank, tv.w29_tank_drop. tv.penn_8th_stairs is reused.
