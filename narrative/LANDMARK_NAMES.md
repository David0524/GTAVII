# Landmark names: sound-alike renames (DECIDED 26 Nov 2026: oversight set, see content/landmarks.json)

**User decision (relayed by oversight, verbatim):** "Rename but that's a silly rename. They should be kinda similar to the actual name. Look how GTA does it."

**Rules applied:**

- Each name is a cheeky cousin of the original: a real word swapped or a pun, never a one-letter tweak.
- No logos, wordmarks, colour trade dress or slogans. For example, the Garden's "World's Most Famous Arena" line and the hotel's famous phone number stay out.
- Plain place names stay real: Herald Square, Penn Station, Madison Square (the park), Bryant Park, Flatiron, Times Square, 42nd Street and the avenues.
- Subway station names stay as they were signed in 1974. Station names count as place names.

**How the searches were done:** a web search on the exact phrase (standard mode, Nov 2026). "Clear" means no business, building or mark of that exact name turned up. This is a screening search, not a USPTO clearance; a full USPTO search on the picked names is required before ship.

★ = recommended.

---

## 1. Macy's (Herald Square department store)
Current in-game name: *Baxter & Lowe*. Oversight says this is too far from the original.

| Option | Why | Search |
|---|---|---|
| ★ **Lacy's** | Rhymes, one word swapped for another real word, with a wink at the lingerie floor. Rooftop letters read as an instant echo: "LACY'S · HERALD SQUARE". | Clear as a store name. Only unrelated "Lacy" makers (clothing, greetings) came up, none in retail services. |
| **Maisie's** | Sounds almost the same, and a woman's name fits a 1974 store. | Clear as a department store (only small boutiques and cafes in Australia). It's the closest sound-alike, so the most risk of confusion. |
| **Racy's** | Satirical take on a 1974 Midtown store: "Racy's — Where Herald Square Gets Dressed." | Not searched yet. Run it if picked. |

## 2. Metropolitan Life Insurance Company Tower (Madison Ave & E 23rd, the clock tower)

| Option | Why | Search |
|---|---|---|
| ★ **Metropolitan Lifeline Tower** | One word stretched. An insurer selling you a "lifeline" fits the corruption theme. Short form: "the Lifeline Tower". | Clear (only MetLife itself and unrelated medical-alert companies). |
| **Megalopolitan Life Tower** | A bigger-is-better jab. Reads as a parody at a glance. | Clear (no such company found). |
| **Metro Mutual Life Tower** | Flatter period-insurer sound. Safest legally, least funny. | Not searched yet. "Mutual" names are crowded in insurance, so it needs care. |

## 3. New York Life Building (Madison Ave & E 26th, gold pyramid roof)

| Option | Why | Search |
|---|---|---|
| ★ **New York Lifelong Building** | Keeps the shape of the name and adds a wry promise. "The Lifelong" under its gold hat. | Clear. |
| **Gotham Life Building** | Period-flavoured nickname for the city. | Clear as a life insurer. A P&C "Gotham Insurance Co." and a "Gotham Brokerage" exist, and "Gotham" is also a comics trademark area, so it's the weaker option. |
| **New York Afterlife Building** | The broadest satire. Funny on a sign, but may grate in serious scenes. | Not searched yet. |

## 4. Madison Square Garden (Seventh–Eighth Aves, W 31st–33rd, over Penn Station)
Dialogue already says "the Garden" in most places, which works with any option.

| Option | Why | Search |
|---|---|---|
| ★ **Madison Round Garden** | The 1968 building is literally round, and the old name sits on a building that isn't on Madison Square at all; this joke plays on both. "MADISON ROUND GARDEN — FRIDAY: 'IRON' EDDIE MALLORY". | Clear (the search engine only returned the real name). |
| **Penn Square Garden** | Names where it actually is. Reads as a real arena name. | Clear for an NYC venue. Unrelated Penn Squares exist in Philadelphia, Lancaster and an Oklahoma mall. |
| **Manhattan Square Garden** | Plain evocation. Least funny. | Not searched yet. |

## 5. Hotel Pennsylvania (Seventh Ave & W 33rd)
This is a heavy rename: about 29 references across missions M6, M15 and M27, the side jobs, archetypes and the bible.

| Option | Why | Search |
|---|---|---|
| ★ **Hotel Pennsylvanian** | One suffix keeps it instantly recognisable while reading as a different, grander-sounding house. | Partial hit: *The Pennsylvanian* is a Pittsburgh apartment and event building, a different city and use. It's low risk but worth a USPTO look. |
| **Hotel Keystone** | Pennsylvania's nickname. The evocation runs through the state, not the words. Clean. | Clear (no NYC hotel of that name). |
| **Hotel Pennsbury** | Old-money ring. | Pennsbury Inn (Chadds Ford, PA) and the Pennsbury Suites at a Philadelphia hotel exist, so it's weaker. |

## 6. Empire State Building (Fifth Ave & W 34th)
Its owner actively enforces the name, so pick the most clearly distinguishable option. This name appears on the skyline, in tourist barks, in Odessa's window, and in the M1 walk and offer scene.

| Option | Why | Search |
|---|---|---|
| ★ **Empire Estate Building** | One added syllable turns it into a real-estate joke, which fits a game about who owns the city. Barks read naturally: "the Empire Estate". | Clear (only the unrelated Empire Building at 71 Broadway). |
| **Imperial State Building** | Swaps the word for a synonym. Grand and period-right. | Clear. Note that London's *Empress State Building* exists, so don't drift toward "Empress". |
| ~~Umpire State Building~~ | Rejected: it's a known gag from a classic studio cartoon. | — |

## 7. World Trade Center (skyline only; the towers were new in 1974)
This name appears in one shopper bark, the activity note, and a code comment in `src/world/Skyline.ts` (engine-owned; I'll flag it to them).

| Option | Why | Search |
|---|---|---|
| ★ **World Trading Towers** | One word changed. Reads as the twins. | Clear. |
| **Twin Trade Towers** | Descriptive. | Clear. |

## Other brands checked in my registries
- Department stores, papers, theatres, chains, guns, cars and shops are all already invented (see `content/BUSINESS_NAMES.md`). Under the new rule, invented names that echo nothing need not change.
- *Gimbels* appears only in a source citation in `subway.json`, not in player-facing text.
- *Port Authority* appears only in the signed station name "42nd St–Port Authority Bus Terminal", so it's treated as a place name.
- *Automat* is a generic word, not a brand.

## After the user picks
1. Write `content/landmarks.json` as one registry: `{id, realRef (dev only), name, short, sign, mapLabel, aliases}`.
2. Replace every hard-coded occurrence in the content and builders with the chosen names.
3. Rename ids where the old name is baked in.
4. The engine and UI read map labels, signage and reveals from that registry.

---

## 8. Hotel Chelsea (222 W 23rd St): DECIDED as Hotel Kelsey (26 Nov 2026)
Added after the UI chat found it among the world.json heroes. In 1974 it was the artists' and writers' hotel. It isn't named anywhere in narrative content yet, only as a world.json hero.

| Option | Why | Search |
|---|---|---|
| ★ **Hotel Kelsey** | Rhymes, like Lacy's: swapped for another real word, and it reads instantly on the red-brick facade. | Clear (no NYC or other hotel of that exact name found). |
| **Hotel Chelmsford** | Keeps the "Chel-" sound and the English-place-name origin (Chelsea is a London district; so is the Essex town). Sounds stuffier, which suits a joke on bohemians. | No hotel of that exact name. Chelmsford, England has many hotels named after the town, but none called "Hotel Chelmsford". |
| **Hotel Shelley** | A poet pun for the writers' hotel, with the Chel/Shel sound. | **Collision:** an operating *Hotel Shelley* exists in Miami Beach (Art Deco, Collins Ave). Same service class, so not recommended. |

Avoid *The Chelsean*, an operating hotel at 160 W 25th St.

---

## 9. The Pan Am Building (200 Park Ave, over Grand Central): DECIDED as Pan Amity ("Pan Amity World Airways"), 27 Nov 2026
The tower carries the airline's name on its roof, so the airline needs a sound-alike name. Grand Central stays a plain place name.

| Option | Why | Search (exact phrase, Nov 2026) |
|---|---|---|
| ★ **Pan Amity** ("Pan Amity World Airways") | The same pattern as Lacy's: the real name's sound with an extra real word, and a jet-age goodwill pun ("amity"). Instantly evocative and clearly not the original. | Clear: no airline found. |
| **Pan Global** | Plain and believable. | Clear for "Pan Global Airways/Airlines". Note that "Global Airlines" (UK, 2021) and "TransGlobal Airways" exist; that's a crowded word, so it's the weaker option. |
| **Pan Atlantica** | Period glamour, and it suggests the transatlantic routes. | Clear: no airline found. |

**Emblem brief:** a globe drawn as crossed curved meridian bands, with one swept wing crossing it diagonally, in deep sky blue and white. It's jet-age, and it's never a plain banded sphere like the real mark.

## 10. The Times Square tower (1974: Allied Chemical Tower)
**Amalgamated Chemical Tower**, with "AMALGAMATED" at the crown and the news zipper running Daily Ticker headlines. The search found no "Amalgamated Dye & Chemical" company. The name is evocative of the 1974 owner but distinct from it.

## Signage copy
All landmark signage is in `content/landmarks.json` → `signage` (slot, text, note). Image prompts are in `assets/prompts/sources/landmarks.json`. **Pre-ship USPTO list additions:** Pan Amity (or the pick), Amalgamated Chemical Tower, plus the banner line "A WHOLE CITY BLOCK OF EVERYTHING".

---

## 11. The 1930 Art Deco tower at Lexington & 42nd: DECIDED as Chrysalis Building (oversight pick, 27 Nov 2026)

| Option | Why | Search (exact phrase, Nov 2026) |
|---|---|---|
| ★ **Chrysalis Building** | The same pattern as Lacy's and the Empire Estate: the real name's sound swapped for a real word. A chrysalis is a shell something beautiful hatches from, which suits the crown. Instantly evocative and clearly different. | Clear: no building or company found. |
| **Crestler Building** | Closer in sound, with "crest" for the crown. | Clear: no building or company of that exact name (only Crestline and Crest construction firms). |
| **Chromecrest Building** | Descriptive: the stainless crown. The least punny and the least evocative. | Clear: no building of that name (a Chromer Building exists in Seattle). |

**Also decided in the same message:**
- **Grand Central**: keeps its real name. The display string is "Grand Central Terminal" in full and "Grand Central" as the short form and map label.
- **Pershing Square**: a plain place name, kept like Herald Square.
- **Pan Amity**: confirmed.
