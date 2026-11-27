# Grand Central Terminal interior: plan (hero interior, the biggest in the game)

Status: **plan only.** The build starts after the PBR foundation (ENGINE_REQUESTS 9) lands, so it is made once at the GTA V bar.
Player-facing name: TBD by narrative under the landmark rename rules (as with "Empire Estate Building"). Docs use the real name as a reference.
**Tenant names:** every business in the terminal gets an invented name from narrative. The lower-level restaurant (the real "Oyster Bar") is referred to here as **the vaulted seafood restaurant**; the Guastavino tile room itself is architecture and stays. The same applies to every newsstand, shoeshine, cigar, liquor, telegraph and lunch-counter tenant, and the balcony display brand: no real names or logos, only art slots routed through narrative's queue.

## 1974 truth (to verify against period photos before modelling)
- Penn Central era (railroad bankrupt since 1970). The building is grimy and under-maintained, the year before the landmark fight over the tower scheme.
- **Main Concourse**, about 84 × 37 m with a vault about 38 m high: the celestial ceiling is near-black with tar and tobacco smoke (it was cleaned 1996-98), and the constellations are barely readable. There are big arched windows on the east and west ends with catwalks inside the glass, and the floor is Tennessee marble, worn into paths.
- **Information booth** at the centre with its four-faced brass and opal-glass clock; the spiral stair to the lower level is inside the booth.
- **Ticket windows** in bronze grilles, with era departure boards above the gates and train gates with track numbers and destination slats. Board type (manual slats vs split-flap) to be verified from photos.
- **East balcony**: a giant backlit photo display. **Our own invented brand and imagery, never the real one.** The west balcony is dark, with offices and storage.
- **Ramps** to the lower level (dining concourse) and the **whispering-gallery arches** (Guastavino tile) outside the **vaulted seafood restaurant** (invented name TBD). Its vaulted tile room is period-sensitive: research says it closed in 1972 and reopened in 1974, to be verified, which could be a story beat (shuttered vs freshly reopened).
- **Main waiting room** (now Vanderbilt Hall): long benches, chandeliers, homeless sleepers (adults only), commuters waiting.
- Newsstands, shoeshine stands, a cigar counter, Western Union and telephone banks, lockers, a liquor store, and the passages to the hotels and office buildings (Graybar, Lexington).
- **Links**: the 42nd St shuttle platforms and the Lexington Ave line platforms, by passage and stairs.

## Split with the engine (ENGINE_REQUESTS 11)
| Engine | Interiors |
|---|---|
| Shell geometry: the concourse vault, walls, windows, balconies and exterior, at landmark quality | Interior content: booth, clock, ticket windows, boards, gates, newsstands, benches, signage art slots, lockers, phones, seafood restaurant and whispering-gallery dressing, waiting room |
| Lighting volume: sun shafts through the east and west windows, GI probes for a 38 m volume, volumetric haze | Practicals: chandeliers, booth and clock glow, display backlight, board lamps, as `LightOut` |
| Streaming of a mega-interior (always resident when within about 150 m; LOD of the vault from outside through the windows) | Cells and portals for the sub-rooms, occupancy slots and crowd density by hour, markers (payphones, lockers, hide spots, stash, deposit-box-style lockers), traversal (stairs, ramps, catwalk ladders) |
| Subway platforms and tunnels (if the subway workstream owns them) | Passages and connecting stairs, plus the handoff portal to the platforms |

## Build order (after PBR)
1. Reference pass: about 40 period photos (LoC, NARA, PD), concourse at rush hour, booth, boards, waiting room, ramps, the restaurant's tile vaults, balconies. Score them on a reference board.
2. Blockout at true scale from the footprint and survey drawings (HABS has documented the terminal: check its drawings for dimensions and rights).
3. Concourse hero props at RDR2-station density: booth and clock, gates, ticket windows, boards.
4. Lower level, seafood restaurant, whispering gallery, waiting room.
5. Crowd slots (rush-hour density, waiting sleepers) with sim; subway links.
6. Shot board vs references and vs the bar, plus phone frame time.

## vs GTA V / VI / RDR2
- **What the reference does:** RDR2's Saint Denis station is a dense, lit, crowded hero interior with no loading at the door. Hand-dressed vendors and benches, light shafts, period signage and NPC routines make it feel lived in. GTA V has no comparable enterable landmark hall; its stations are closed or loading-screened. GTA VI trailers show dense crowd interiors (malls, clubs).
- **Where we can match:** seamless entry from the street through real doors with no loading screen; period accuracy; crowd density from sim slots by hour.
- **Risks and shortfalls:** a 38 m vault on a phone needs the engine's probe GI and volumetrics. A crowd of hundreds indoors needs sim LOD (impostors). The ceiling's soot and gold-leaf constellations need a dedicated material. Plan: get the engine's budget for the volume before modelling, and impostor crowds beyond 30 m.

## Concourse build spec (ready for when the PBR foundation lands)
Dimensions are approximate, from published figures, to be checked against the HABS survey drawings before blockout.

**Cells (portal graph).** Each sub-space is a cell, so culling keeps the phone budget:
| Cell | Size (m) | Notes |
|---|---|---|
| `concourse` | 84 × 37 × 38 | Engine shell; interiors place the content |
| `balcony_e`, `balcony_w` | 37 × 12, at +6 m | East holds the backlit display (invented brand) |
| `ramps_n`, `ramps_s` | | Down to `lower_concourse` (dining level) |
| `waiting_room` | 62 × 21 | Benches, chandeliers |
| `whisper_gallery` | | Guastavino vault outside the seafood restaurant |
| `restaurant` | | Vaulted tile room |
| `passage_lex` | | To the Lexington platforms |
| `passage_shuttle` | | To the 42nd St shuttle |
| `gates_n` | | Train gates along the north wall |

**Content list (interiors).**
- Information booth: octagonal brass and marble, clerks' windows, the four-faced opal clock (a lofted globe build with face art slots), spiral stair down.
- About 28 ticket windows in bronze grilles with "NEXT WINDOW" cards (art slots).
- Departure boards over the gates, with destinations as art slots, names invented where not geographic.
- Gate signs with track numbers.
- Newsstands, shoeshine stands, a cigar counter, telephone banks of 12 booths, lockers (stash and deposit markers), benches (waiting room).
- Lost-and-found window, a police booth, liquor and drugstore fronts, the Western Union-style counter (invented name).

**Markers and slots.**
- Payphones in every booth.
- Lockers as stash markers.
- Benches as sleepers: wait and bed markers (adults only).
- Commuter crowd slots by hour: rush 07:30–09:30 and 16:30–18:30 at the highest density.
- Police patrol route.
- Hide spots behind the booth and in the ramp alcoves.

**Light.** Practicals as `LightOut`: chandeliers in the waiting room and ramps, the booth glow, board lamps, the display backlight. Sun shafts and probes are engine.

**Budget target (phone, Low).**
- Content draw calls at most 120 in view, with instanced benches, booths and lockers.
- Content tris at most 400k in view.
- Real local lights at most 16; the rest baked into probes.
- Crowd impostors beyond 30 m.

**Steps.**
1. Reference pass, about 40 photos.
2. Blockout from HABS.
3. Booth and clock hero.
4. Ticket windows and gates.
5. Lower level, restaurant and whispering gallery.
6. Waiting room.
7. Passages and platforms handoff.
8. Crowds with sim.
9. Board vs references, vs RDR2 Saint Denis, and phone timing.


## Tenants and content hooks (narrative, content/businesses.json)
- **Name:** the terminal keeps its real name, "Grand Central Terminal" (a public place name, agreed with oversight and UI).
- **Tenants (all invented):**
  - The Concourse Oyster Room: the vaulted seafood restaurant. It has `dateVariants`: open but tired until 31 Jul 1974; from Aug–Sep shuttered, with dark vaults and the sign "CLOSED · REOPENING THIS FALL UNDER NEW MANAGEMENT".
  - Trackside News (concourse newsstand).
  - Gate Thirty Shine (shoeshine by the upper gates).
  - Eastbound Cigar & Pipe (Lexington passage).
  - Last Train Liquors (lower level).
  - Atlas Wire Telegrams (south side of the concourse).
  - The Commuter's Counter (lunch counter on the dining concourse).
  - Platform Flowers (kiosk).
  - The Halcyon Color Window (balcony display).
- **Content that uses the space:**
  - M24: concourse clock and the whispering arches.
  - Whispering Corner side quest: booth and arches, Thursdays 17:40.
  - Pickpocket variant: slots tv.gc_clock_crowd, tv.gc_redcap_cart, tv.gc_ramp, tv.gc_shuttle_turnstiles.
  - Archetypes: npc.gc_redcap, npc.gc_commuter.
  - These ids become slots and markers in the build.

- **Art (narrative queue, assets/prompts/sources/interiors_gc.json, 23 entries `int.gc.*`):**
  - Board slats and gate plates are generated blank; the renderer sets the copy in the period font from content/grand_central.json (24 board rows, New Haven / Harlem / Hudson destinations, time format "5:52", tracks 15–42).
  - The clock dial is opal glass with numerals, no hands (hands are drawn in the build) and no maker's name.
  - Six exact-text ticket cards (two fare notices flagged as unverified flavour).
  - Oyster Room open sign plus the CLOSED card; locker plate "INSERT 25¢ · TURN KEY · 24 HOURS"; phone door "TELEPHONE".
