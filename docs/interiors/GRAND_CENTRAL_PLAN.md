# Grand Central Terminal interior: plan (hero interior, the biggest in the game)

Status: **plan only.** The build starts after the PBR foundation (ENGINE_REQUESTS 9) lands, so it is made once at the GTA V bar.
Player-facing name: TBD by narrative under the landmark rename rules (as with "Empire Estate Building"). Docs use the real name as a reference.

## 1974 truth (to verify against period photos before modelling)
- Penn Central era (railroad bankrupt since 1970). The building is grimy and under-maintained, the year before the landmark fight over the tower scheme.
- **Main Concourse**, about 84 × 37 m with a vault about 38 m high: the celestial ceiling is near-black with tar and tobacco smoke (it was cleaned 1996-98), and the constellations are barely readable. There are big arched windows on the east and west ends with catwalks inside the glass, and the floor is Tennessee marble, worn into paths.
- **Information booth** at the centre with its four-faced brass and opal-glass clock; the spiral stair to the lower level is inside the booth.
- **Ticket windows** in bronze grilles, with era departure boards above the gates and train gates with track numbers and destination slats. Board type (manual slats vs split-flap) to be verified from photos.
- **East balcony**: a giant backlit photo display. **Our own invented brand and imagery, never the real one.** The west balcony is dark, with offices and storage.
- **Ramps** to the lower level (dining concourse) and the **whispering-gallery arches** (Guastavino tile) outside the **Oyster Bar**. Its vaulted tile room is period-sensitive: research says it closed in 1972 and reopened in 1974, to be verified, which could be a story beat (shuttered vs freshly reopened).
- **Main waiting room** (now Vanderbilt Hall): long benches, chandeliers, homeless sleepers (adults only), commuters waiting.
- Newsstands, shoeshine stands, a cigar counter, Western Union and telephone banks, lockers, a liquor store, and the passages to the hotels and office buildings (Graybar, Lexington).
- **Links**: the 42nd St shuttle platforms and the Lexington Ave line platforms, by passage and stairs.

## Split with the engine (ENGINE_REQUESTS 11)
| Engine | Interiors |
|---|---|
| Shell geometry: the concourse vault, walls, windows, balconies and exterior, at landmark quality | Interior content: booth, clock, ticket windows, boards, gates, newsstands, benches, signage art slots, lockers, phones, Oyster Bar and whispering-gallery dressing, waiting room |
| Lighting volume: sun shafts through the east and west windows, GI probes for a 38 m volume, volumetric haze | Practicals: chandeliers, booth and clock glow, display backlight, board lamps, as `LightOut` |
| Streaming of a mega-interior (always resident when within about 150 m; LOD of the vault from outside through the windows) | Cells and portals for the sub-rooms, occupancy slots and crowd density by hour, markers (payphones, lockers, hide spots, stash, deposit-box-style lockers), traversal (stairs, ramps, catwalk ladders) |
| Subway platforms and tunnels (if the subway workstream owns them) | Passages and connecting stairs, plus the handoff portal to the platforms |

## Build order (after PBR)
1. Reference pass: about 40 period photos (LoC, NARA, PD), concourse at rush hour, booth, boards, waiting room, ramps, Oyster Bar, balconies. Score them on a reference board.
2. Blockout at true scale from the footprint and survey drawings (HABS has documented the terminal: check its drawings for dimensions and rights).
3. Concourse hero props at RDR2-station density: booth and clock, gates, ticket windows, boards.
4. Lower level, Oyster Bar, whispering gallery, waiting room.
5. Crowd slots (rush-hour density, waiting sleepers) with sim; subway links.
6. Shot board vs references and vs the bar, plus phone frame time.

## vs GTA V / VI / RDR2
- **What the reference does:** RDR2's Saint Denis station is a dense, lit, crowded hero interior with no loading at the door. Hand-dressed vendors and benches, light shafts, period signage and NPC routines make it feel lived in. GTA V has no comparable enterable landmark hall; its stations are closed or loading-screened. GTA VI trailers show dense crowd interiors (malls, clubs).
- **Where we can match:** seamless entry from the street through real doors with no loading screen; period accuracy; crowd density from sim slots by hour.
- **Risks and shortfalls:** a 38 m vault on a phone needs the engine's probe GI and volumetrics. A crowd of hundreds indoors needs sim LOD (impostors). The ceiling's soot and gold-leaf constellations need a dedicated material. Plan: get the engine's budget for the volume before modelling, and impostor crowds beyond 30 m.
