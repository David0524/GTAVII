# Landmark names: sound-alike renames (proposal; the user picks)

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
