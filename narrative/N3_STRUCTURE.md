# Tenderloin '74: Story Structure (Phase N3)

> Builds on `N1_STORY_BIBLE.md` (premise, leads, rotation) and `N2_CAST.md` (who). This file
> sets **what happens, in what order, with which consequences**. Flags are documented in
> `content/FLAGS.md`, and mission data lives in `content/missions/` (N4).
> Creative calls are mine under the user's "All your calls" and are logged in
> NARRATIVE_PROGRESS.md.

## 1. Shape

| | Act 1 "Dusk" | Act 2 "Heat" | Act 3 "Resignation" | Epilogue "October" |
|---|---|---|---|---|
| Dates (1974) | Fri 21 Jun – Thu 4 Jul | Fri 5 Jul – Wed 7 Aug | Thu 8 Aug – Mon 2 Sep | Tue 1 Oct |
| Missions | 1–9 | 10–21 | 22–32 | free roam |
| Chapters | 1–3 | 4–7 | 8–10 | — |
| Leads playable | Teddy, then Delphine (M6) | + Nick (M15) | all three | all three |
| Target play time | ~1 h 50 m | ~2 h 50 m | ~2 h 40 m | open |
| Turn | Teddy says yes | The ledger is copied or stolen | Who gets the ledger | The world remembers |

There are 32 story missions, each 8–20 minutes long (median about 13), for roughly 7.5 hours of
critical path. Side activities (N4) add about 6–10 hours.

### Chapters
| Ch | Title | Missions | Dramatic job |
|---|---|---|---|
| 1 | The Walk | 1–3 | The district, the offer, the grid |
| 2 | Paper | 4–6 | The surcharge, the face from 1971, the club |
| 3 | Yes | 7–9 | Teddy takes the job. His first envelope is Delphine's. |
| 4 | Bagman | 10–12 | Collections across the trades; Calloway's wire (Branch A) |
| 5 | Contact Prints | 13–15 | Delphine's file; the vaults; the first brownout brings in Nick |
| 6 | Cold Storage | 16–18 | Nick's squeeze; the lease; all three inside the vault |
| 7 | Carbon | 19–21 | Hollis dies; the ledger. End of Act 2. |
| 8 | The Address | 22–25 | Resignation night; everyone sells everyone; the truth about 1971 |
| 9 | Fire Watch | 26–28 | The arson stopped; exposure; the march |
| 10 | Labor Day | 29–32 | The ledger (Branch B); last load; the lease; the finale |

## 2. Main mission chain

Time windows are in-game. Weather: **C** = clear, **O** = overcast, **R** = summer rain,
**any** = no requirement. "Unlocks" lists the story missions only; side activities are in N4.

| # | Id | Lead | Date | Window | Wx | Min | Pillars | What happens | Unlocks |
|---|---|---|---|---|---|---|---|---|---|
| 1 | mission.dusk_on_broadway | T | 21 Jun | 20:15–21:45 | C | 12 | P2 P4 | Spawn at the Flatiron prow. Mayhew walks Teddy up Broadway and makes the offer; Teddy refuses. The night desk begins. | 2 |
| 2 | mission.night_desk | T | 22 Jun | 21:00–23:30 | any | 10 | P3 P5 | Hub tutorial. The sale notice, Prentiss's "welcome", Hollis on 11, Carmen on the phone. | 3 |
| 3 | mission.hack | T | 24 Jun | 19:00–23:00 | any | 14 | P2 P3 | Delroy lends his cab. Three fares on the 1974 one-ways; Navarro at Herald Square. | 4, activity.cab_fares |
| 4 | mission.surcharge | T | 26 Jun | 07:00–15:00 | C/O | 15 | P1 P3 | A day job for Feld. Racks with Dwayne; the Carriers' envelope at Baek's; Augie remembers Teddy. | 5 |
| 5 | mission.contact_sheet | T | 28 Jun | 12:20–14:30 | C/O | 13 | P1 P2 | Tail Lisle to lunch and photograph the face from 1971. Then the Hotel Pennsylvanian lobby, and Mayhew. | 6 |
| 6 | mission.the_club | **D** | 30 Jun | 18:00–22:30 | any | 12 | P1 P3 P4 | **Delphine introduced.** Payout night at Rita's bar; Claudette's turn. Brannock raises the tax. | 7 |
| 7 | mission.yes | T | 1 Jul | 16:00–21:00 | any | 11 | P4 P5 | Vacate notices; dinner at Carmen's; Kearney's desk; the Shamrock Rail. Teddy says yes. | 8 |
| 8 | mission.back_stairs | D | 2 Jul | 21:00–01:00 | any | 10 | P1 P2 | First photograph of Brannock collecting. The sweep; escape by the Arden's back stairs. | 9 |
| 9 | mission.independence_day | **T+D** | 4 Jul | 20:00–23:30 | C | 18 | P1 P4 | Teddy collects at Earl's stand, then from Delphine. She tails her own money. Lonnie's crew hits the handover, and they lose them in Penn Station. **End of Act 1.** | 10 |
| 10 | mission.five_am | T | 8 Jul | 04:30–08:00 | any | 13 | P3 P1 | Dawn collections in the Flower District. Moretti refuses; Baek's second refusal. | 11 |
| 11 | mission.tax_day | D | 10 Jul | 15:00–20:00 | any | 12 | P1 P2 | Moving the club's money under Brannock's watch; Bauer's office; Lonnie's tail. | 12 |
| 12 | mission.lunch_counter | T+D | 15 Jul | 12:20–14:00 | any | 14 | P4 | Calloway at the Herald Square lunch counter. **Branch A: wear the wire or burn it.** Delphine watches from two stools down. | 13 |
| 13 | mission.contact_prints | D | 17 Jul | 22:00–03:00 | O/R | 13 | P1 | Building the file on Wurtz's unit: Earl's ledger, Ricky's leak, Bauer's nerves. | 14 |
| 14 | mission.cold_room | T | 18 Jul | 11:00–15:00 | C | 12 | P1 P3 | Fur District collections; the vaults mapped; Mayhew rattled by a name. | 15 |
| 15 | mission.brownout | **N** | 19 Jul | 21:00–01:00 | C (hot) | 15 | P5 P3 | **Nick introduced.** The first brownout: the vault compressors stop. Ice trucks, favours, and Teddy at the door to collect. | 16 |
| 16 | mission.margin_call | N | 22 Jul | 09:00–14:30 | any | 14 | P1 P5 | Whitlock's bank, Kallis's offer, the Baeks' bid, Lisle's paper. | 17 |
| 17 | mission.the_lease | D+N | 24 Jul | 16:00–19:00 | any | 13 | P4 P1 | Delphine walks into Nick's office about W 37th St. Two bankers, one table. **Midpoint.** | 18 |
| 18 | mission.cold_storage | **T+D+N** | 26 Jul | 22:00–03:00 | O | 20 | P1 P5 P4 | The second brownout. Nick's insurance job; Teddy's collection; Delphine's photographs. Yiannis's count. | 19 |
| 19 | mission.rewiring | T | 29 Jul | 13:00–19:00 | C (hot) | 12 | P5 P4 | The Corwin's power is cut. Mr. Hollis is found (off screen). Grief in the lobby. | 20 |
| 20 | mission.partners_meeting | N | 1 Aug | 10:00–13:00 | any | 12 | P1 | In Lisle's office Nick sees the ledger and his own name everywhere. Marjorie's look. | 21 |
| 21 | mission.carbon_copy | T+N | 6 Aug | 19:00–23:00 | any | 18 | P1 P2 | Copy the ledger (Branch A: wire) or steal it (Branch A: burned). Marjorie, Bernard, Delroy. **End of Act 2.** | 22 |
| 22 | mission.the_address | **T+D+N** | 8 Aug | 20:30–00:30 | O | 16 | P4 P5 | The resignation is on every radio. Three short scenes, one per lead, as the syndicate panics. Mayhew learns about the wire or the theft. | 23, 24, 25 |
| 23 | mission.shoebox | D | 12 Aug | 21:00–02:00 | R | 18 | P1 P2 P4 | **Below Thirty-Fourth (the subway mission).** Delphine carries the club money underground: the Herald Square token booth, the half-abandoned 33rd Street passage (rats, dead lights), a platform fight with Brannock as a train arrives, one stop on the local, then Hanyang House and Tina's confession. | 26 |
| 24 | mission.flip | N | 14 Aug | 11:00–16:00 | any | 13 | P4 | Calloway offers Nick a deal. Augie squeezed; Villalba's betrayal. | 26 |
| 25 | mission.the_car | T | 16 Aug | 22:00–01:00 | R | 14 | P4 | Mayhew's car, W 35th St, the same spot as 1971. The truth. Kearney's list. | 26 |
| 26 | mission.fire_watch | T+D | 20 Aug | 23:00–05:00 | O | 18 | P5 P4 | Stake out the Corwin against Prentiss's arson plan. Gus, Manny and Inez decide which side they're on. | 27 |
| 27 | mission.exposure | D+N | 22 Aug | 20:00–00:30 | any | 15 | P1 P4 | Wurtz squeezes the club and the showroom at once. The Penn Station locker. Tina chooses. | 28 |
| 28 | mission.the_march | **T+D+N** | 23 Aug | 10:00–13:00 | C | 15 | P5 P3 | Tenants, operators, florists and merchants march from the Corwin to Herald Square. | 29 |
| 29 | mission.the_ledger | T | 28 Aug | 18:00–22:00 | any | 14 | P4 P1 | **Branch B: who gets the ledger.** | 30, 31 |
| 30 | mission.closing | N | 30 Aug | 10:00–15:00 | any | 13 | P4 P5 | Nick decides the Corwin's fate in front of Odessa. | 32 |
| 31 | mission.lease | D | 31 Aug | 14:00–18:00 | any | 12 | P4 P1 | The beauty shop, or the club, on Delphine's terms. | 32 |
| 32 | mission.labor_day | **T+D+N** | 2 Sep | 21:00–01:00 | C | 20 | all | Finale: three converging runs from the Garment District to the Flatiron prow. | epilogue |

Act 3's order is open between M23, M24 and M25: the player can do them in any order. M26
needs all three done.

## 2b. Combat rework (26 Nov 2026)
User: *"Full open world and missions like a GTA game."*
- **Every mission now has an action beat.** The full list is the `COMBAT` tables in
  `narrative/tools/build_act1_missions.py` and `build_act23_missions.py`.
- **Action starts in M1** with the stick-up at the night desk.
- **Missions at the 20-minute cap** (M18, M32) convert existing steps instead of adding time.
- **Non-lethal is always available to Teddy** (his arc: how often he reaches for the gun he
  gave up).
- **Police are fully lethal everywhere.** The user, verbatim: *"Fully lethal everywhere"* and
  *"No you can kill cops during missions. That's normal. Consider how GTA handles these
  things."* Killing a cop feeds the heat system and is never a fail state or a story branch.
- **"Lose the police":** objectives marked `requireNoHeat` (drop-offs, safe interiors, scenes
  after a fight) make the player lose the police first.
- **Characters the plot needs are `essential` per mission.** The mission fails with "<Name>
  died" only while their arc needs them; they're never made invulnerable. See
  `narrative/tools/conventions.py`.
- **Mission durations in the table above are the originals.** The current values are in
  `content/missions/*.json`, and `narrative/N7_PREPASS.md` gives the totals.
- **M23 is now the subway mission** (user: *"Maybe a mission in the subways"*).

## 3. Branch points (approved)

### Branch A: the wire (M12, Teddy)
Calloway offers protection, a clean record and a September promise she can't keep.

| | A1: wear the wire (`flag.branch_a_wire`) | A2: burn it (`flag.branch_a_burned`) |
|---|---|---|
| Relationships | Calloway +2, Navarro +1 | Calloway −3, Mayhew +1, Wurtz +1 |
| M21 | **Copy** the ledger at night with Marjorie's help and return it unnoticed | **Steal** the original. Lisle knows by morning, and Act 3 starts hot. |
| M22 | Mayhew finds the wire and panics; he's more likely to confess in M25 | Mayhew is told Teddy is "one of us now" and is afraid of him |
| Act 3 world | Navarro shadows Teddy as protection; Calloway's car is on his block | Plainclothes tails Teddy in Act 3 (an ambient "watched" state); Calloway treats him as a target |
| Endings | Testimony is open to Teddy himself | Testimony is open only if Nick flipped in M24 (`flag.nick_flipped`) |

### Branch B: the ledger (M29, Teddy)
The outlets are deliberately opposed (this fixes the overlap flagged in N2):
- **Calloway** can prosecute, but she needs a live witness who will testify (Teddy wearing
  the wire, or Nick after flipping), and her funding ends in September. Choosing her means
  someone takes the stand.
- **Nora Finch** can publish fast, but her editor won't run it without **two independent
  corroborations** (any two of: Marjorie's carbons, Kearney's Christmas list, Wurtz's locker,
  or Delphine's photo file with 3+ prints). Her editor's conflict (his brother-in-law is a
  silent partner in Lisle's hotels) must also be neutralised. Delphine's photos of that
  meeting, from M27, do that.

| Option | Requires | Sets | Ending |
|---|---|---|---|
| B1: the prosecutor | `flag.branch_a_wire` OR `flag.nick_flipped` | `flag.ledger_to_prosecutor` | **Testimony** |
| B2: the tenants and the press | 2+ corroborations AND `flag.editor_neutralised` | `flag.ledger_to_press` | **The Ledger Goes Public** |
| B3: keep it | always | `flag.ledger_kept` | **The New Pad** |
| B4: burn it | always (the fallback if B1 and B2 are closed) | `flag.ledger_burned` | **Ashes** |

B4 is the consequence for a player who closed both doors. It's not a punishment screen. It's a
complete, bleak ending: Lisle wins quietly, the Corwin empties by October, and the three
leads survive with what they personally saved.

### Lead resolutions (not branches)
These don't change which missions exist. They set epilogue states, and they're shown as
choices in M27, M30 and M31.
- **Tina (M27, Delphine):** stays (`flag.tina_stays`) if Delphine forgave her in M23
  (`flag.delphine_forgave_tina`). (The relationship alternative was dropped in N5 to keep
  the rule legible.)
  Otherwise she leaves the city (`flag.tina_gone`). She survives either way.
- **The Corwin (M30, Nick):**
  - **Sold on** to Lisle's investors (`flag.corwin_sold_on`): always available.
  - **Kept** as an SRO under Nick (`flag.corwin_kept`): requires Nick's finances saved.
    That means either `flag.baek_bought_building` (M16/M30) or the insurance money from M18
    (`flag.vault_claim_paid`), but not both double pledges exposed.
  - **Given** for $1 to an invented non-profit, the West Midtown Housing Council, so it stays
    housing (`flag.corwin_to_council`): requires Nick's relationship with Odessa at least +2.
    This is the non-transactional bond flagged in N2, built through M28 and the M30 lobby
    scene, so his warmest act is unprofitable.
- **The lease (M31, Delphine):** takes the shop (`flag.delphine_shop`, which requires her
  relationship with Nick at least +1 and the club's count settled, `flag.club_count_settled`),
  or keeps the club moving and merges it with Mi-sook's kye as a joint credit club
  (`flag.club_merged_kye`, which requires her relationship with Mi-sook at least +1).
  Otherwise the club continues as before.

## 4. Endings

The ending is set by Branch B. Each lead's epilogue state comes from the resolutions above.
The final shot is always the Flatiron prow at dusk, but **who is standing there and facing
which way** changes.

| Ending | Lisle | Wurtz | Mayhew | The Corwin (default; Nick's choice can override) | Teddy | Final shot |
|---|---|---|---|---|---|---|
| **Testimony** | Indicted | Suspended, then indicted | Co-operates | Saved (the council or Nick keeps it) | Testifies; leaves the district for the length of the trial | Teddy faces downtown: leaving |
| **The Ledger Goes Public** | Disgraced, not indicted (yet) | Unit disbanded | Retires early | Saved by public pressure | Stays at the desk, unprotected | Teddy faces up Broadway, as at the start |
| **The New Pad** | Bought off by Teddy's leverage | Pays Teddy now | Teddy's bagman | Safe, because Teddy owns the men who'd empty it | Moves into Lisle's luncheonette stool | Teddy in the back seat of a car going up Broadway. The man from 1971 is now him. |
| **Ashes** | Untouched | Untouched | Promoted | Emptied by October | Back at the hack stand | The prow is empty; Teddy is seen from a cab window |

Delphine's and Nick's epilogue rooms (the shop or the club; the firm, the Corwin and Eleni)
appear in free roam in every ending, as set by their resolutions.

## 5. Relationship mechanics (P4: "Owed, not owned")

- **Storage:** one value per lead–character pair, from −5 to +5. Seeds are each lead's
  outgoing edge weight in `content/cast`. If a lead has no edge to someone, the seed is the
  other character's edge weight to that lead, or 0 if neither exists.
- **Changes:** mission `rewards.relationships` and dialogue-choice `setRelationships`
  adjust it, usually by ±1 and at most ±3 for betrayals. Changes are always shown as a short
  line ("Delphine will remember that.").
- **Gates:**
  - **+3 (loyal):** takes a risk for the lead in a mission. Examples: Manny unlocks the
    service door in M26; Marcus holds the back stairs in M23; Yiannis gives the true count in
    M18.
  - **+1 or +2 (friendly):** extra information. For example, Delroy's tip about Lisle's
    weekend drive in M21.
  - **−3 (hostile):** betrays the lead at that mission's crux. For example, Villalba tips off
    Augie in M24; Gus does Prentiss's bidding in M26.
- **Engine:** save state needs relationships per lead. That's ENGINE_REQUESTS
  "From narrative: 8". The fallback uses composite keys `"char.<lead>/char.<npc>"` in the
  existing `relationships` map.

## 6. Mayhew's secret, seeded early (fix from the N2 critique)
| Mission | Seed |
|---|---|
| M1 | On the walk, Mayhew avoids W 35th St: "Not that way, kid. Not tonight." |
| M5 | Teddy photographs Lisle at lunch and recognises the face from the back seat. Then he photographs Lisle **with Mayhew** in the Hotel Pennsylvanian lobby. |
| M7 | Teddy may show Mayhew the photo (`flag.mayhew_saw_photo`). If he does, Mayhew stops calling him "kid". |
| M14 | In the Fur District Teddy says Lisle's name, and Mayhew drops his toothpick. |
| M21 | The ledger's oldest page is dated autumn 1971 and has Mayhew's initials. |
| M25 | The car, W 35th St: the whole truth. |

## 7. How the open world changes between acts

| Aspect | Act 1 | Act 2 | Act 3 | Epilogue (October) |
|---|---|---|---|---|
| Default free-roam time | Dusk and night (long June dusks) | Hot afternoons; nights | Hazy days; late nights | Cool evenings |
| Weather mix (C/O/R) | 70 / 20 / 10 | 40 / 35 / 25, with afternoon storms | 40 / 40 / 20, heavy haze | 60 / 30 / 10 |
| Power | Normal | **Brownout nights 19 and 26 Jul** (Fur District and W 28th–34th); dim nights randomly after 26 Jul | Dim nights continue through mid-Aug | Normal |
| Closed streets (story) | — | W 30th St (6th–7th) taped off after M18 (insurance investigators); Corwin scaffolding on W 31st | Herald Square route closed during M28 (10:00–13:00, 23 Aug); fire engines on W 31st during M26 (Prentiss's men pull a false alarm to empty the lobby). M26 can't end in a fire: failing restarts at the checkpoint | Depends on the ending (§4) |
| Edge blockers | `content/boundaries.json` Act 1 set | Water main at the east edge; second film unit at the south edge; first "work suspended" signs | The film wraps and the west trench is abandoned; "work suspended" signs everywhere | Trenches still open |
| New ambient NPCs | Tourists at Herald Square; buyers in the Garment District | More plainclothes on Eighth Ave (+50% `npc.plainclothes`); ice trucks; insurance adjusters on W 30th | Tenant picketers outside the Corwin and two other hotels; radio crowds on 8–9 Aug; process servers | Fewer Garment District pushboys (runaway shops); fur buyers back for the season |
| Graffiti and posters (text in N6) | Faded political posters; "subway art" tags | Tenant posters "WE LIVE HERE"; vacate notices on doors | "WHO OWNS THE TENDERLOIN?" stencils; Corwin bedsheet banners. | By ending: "CORWIN STAYS" (saved) or "FOR CONVERSION" hoardings (Ashes) |
| Shuttered businesses | — | Moretti's truck idle (sabotage) until M10 or N4 | Feld Frocks dark if Feld left (`flag.feld_left`); Lucky Quarter Amusements boarded if Bauer was burned (`flag.bauer_burned`) | Varelas & Co. or Kallis (whoever lost); the Baeks' new sign if they bought |
| Newspapers (N6) | Weekly, quiet | Heat, brownouts, the city's cash | The resignation; "HOTEL KING'S LAWYER" (if B2) | The budget gap (real, [S3]) and the ending's headline |

## 8. Mobile and pacing notes for every mission
- There's a checkpoint at least every 5 minutes. Every mission over 12 minutes has three or
  more checkpoints.
- Every chase or tail has a **route-knowledge solution**: using a 1974 one-way against the
  pursuer, or a building with two doors (Penn Station, the Arden's back stairs, the Hotel
  Pennsylvania, the department store).
- There are no timed choices under 6 seconds. Branch A and Branch B are untimed.
- Joint missions put `switchPoints` only at safe beats, never under a timer.
- Missions stay at least 60 m inside the playable edge (`EDGE.BLOCKERS`). Outward chases end
  on a blocker or a jam.

## 9. Phase N3 self-critique
- **Pillars:** every mission lists at least two. P2 is weakest in Act 3, where the scenes are
  dialogue-heavy (M22, M24, M29). N4 must give each of them a movement section that uses the
  grid: the radio crowds on 8 Aug, the route to Calloway, the drive to the paper.
- **Branch honesty:** A changes M21, M22, Act 3 ambient behaviour and ending availability. B
  sets the ending. Both persist through flags. The lead resolutions are labelled as
  resolutions, so they aren't sold as extra branches.
- **Risk: B2's corroboration bar may be too high for casual players.** Four sources are
  available and two are needed. Kearney's list (M25) and Delphine's photo file (M8, M13, M27)
  are on the critical path, so a player who completes every mission always has two. B2 can
  only close if the player skipped optional photo objectives. That's intended, but it must be
  signposted in M27.
- **Content:** Hollis's death is off screen. The arson is prevented or fails without
  casualties. The "Ashes" ending has no deaths. Sex work and drugs stay contextual. The real
  presidential resignation is only background.
- **Mobile:** M18 and M32 are the longest missions (20 min) and need four or more checkpoints
  each.
