# UI references: real 1970–76 New York print (user feedback: "This looks very AI generated. Find real menu references")

Images are kept outside the repo, with rights listed per file. **PD** = public domain (DOCUMERICA / NARA); **©** = in
copyright, for internal reference only. Collected by a research helper and spot-checked; the full report is summarised here.

## What real 1974 NYC print looks like, and what our screens did instead
| Real (sources below) | What we built (to remove) |
|---|---|
| Clean white grounds. Yellowing on surviving copies is 50 years of ageing, not how it looked in 1974 | Aged cream "parchment" on every screen |
| Official graphics were strict Swiss modernism: Standard Medium or Helvetica, flush-left, on a module, black on white | Mixed retro display faces |
| Flat spot colours with a meaning: PMS 185 red for exit, 109 yellow for transfer, 354 green, 300 blue | Decorative red everywhere (stamps, price tags) |
| Newspapers were black ink only: huge condensed gothic heads, bold condensed italic decks, 9-column agate classifieds with reversed category bars | Red stamps and tinted papers |
| Maps were bright and flat: white sheet, blue water, grey or green parks, 2–3 route colours, a Helvetica legend box and a dense service column | Sepia "ink" map |
| Commercial signs were hand-painted sign-writer capitals, plastic marquee letters, lit panels and tinsel pennants | Rubber stamps, tape |
| Information is dense and stacked in ruled boxes and columns | Tilted, taped cards scattered across the screen |
| No typewriter faces on anything public; typewriter type appears only on forms someone filled in | Typewriter text everywhere |
| Wear is mild: fold lines, soft corners | Coffee stains, tape, distressed edges |

## Sources
- **NYCTA Graphics Standards Manual, 1970 (Unimark)**, https://archive.org/details/nycta-gs-manual (©, MTA). Standard
  Medium; signs silkscreened black on a light ground; plate modules of 1×1, 2×1, 4×1 and 6×1 ft with a black top band;
  exit signs white on red, transfer signs black on PMS 109 yellow; line discs in PMS 185, 165, 130, 354, 300/312 and 239.
- **Vignelli subway guide, 1972**, https://mapcollections.brooklynhistory.org/?p=1415 (©). Off-white sheet, routes bent at
  45° and 90°, Helvetica, warm grey parks.
- **Hagstrom "New York Subways", 1974**, https://mapcollections.brooklynhistory.org/?p=147 (©). White sheet, blue-grey
  water, hatched parks, one colour per division (IRT blue, BMT green, IND red), a Helvetica title box and a service column.
- **Daily News, 9 Aug 1974**, https://www.rarenewspapers.com/view/679326 (©). The house face is "Daily News Gothic":
  https://fontsinuse.com/uses/27531/citizens-alliance-to-save-new-york
- **Kingston Daily Freeman, 27 Aug 1974**, front page and classifieds, https://archive.org/details/kingston-daily-freeman-1974-08-27
- **DOCUMERICA (PD), by NARA id:**
  - 554309: an NYPD tow truck removing a parked Cadillac, 1973
  - 549871: a used-car lot banner, "SPOT CASH FOR YOUR CAR", hand-painted on maroon with tinsel pennants
  - 556675: a subway newsstand with a black-and-yellow "NEW YORK STATE LOTTERY" sign
  - 556816: the "HAMBURGERS" panel on red and white stripes, 42nd St subway
  - 556819: Grand Central turnstiles marked "out" in lowercase Helvetica
  - 548269: Bell "phone" signs in lowercase Helvetica
  - 549872 and 554297: 42nd St marquees in plastic letters
  - 554298 and 554307: Times Square painted billboards
  - 548397: gilded blackletter on a jeweller's window
  - 548268: a "Free Gifts" script card sign
- **The Anthora cup**, The Henry Ford THF197362: red on cream, mock-Greek lettering
- **OTB button, 1972**: green, with "NY Bets" in cream script

## Facts that constrain content
- **No image of a real 1970–76 NYC Parking Violations Bureau summons was found.** The helper-built "parking summons
  notice" screen is invented: it is not a reproduction and must not be presented as one (redesign or drop).
- **There was no legal daily number in 1974** (New York's legal Daily Number dates from 1980). The illegal numbers game
  used the last three digits of the racetrack handle printed in the papers. The New York State Lottery itself did exist in 1974.
- The 1979 Hertz subway map is too late for the setting.

## Game references: shipped AAA period games (all ©; linked, never committed)
These are the 23 screenshots checked, mainly from interfaceingame.com (RDR2, Mafia: The Old Country), gamepressure.com
(Mafia DE, Mafia III), gamesradar.com (L.A. Noire) and gtabase.com (GTA V). Not found: Mafia II DE, GTA IV, and a
verifiable GTA VI menu.

| Game, screen | What it actually does |
|---|---|
| RDR2 pause | Eight display words on a single torn red band over a desaturated live frame; small prompts bottom-right. No cards, no tilt |
| RDR2 catalogue and camp ledger | A book held in two hands, straight on. Period woodtype stays **inside the printed page**; controls, cash ("$91⁰⁵") and the purchase box are clean small-caps sans on dark translucent panels |
| RDR2 stable, satchel, stats, settings | Flat dark panels, ruled rows of label + right-aligned value, one thin red focus outline, "You cannot afford this item" in grey. Not paper |
| Mafia DE garage | The real 3D garage full screen; "GARAGE 21/36" in condensed caps; the car name is the one script element; a spec table with thin cream bars; one outlined "Drive" button |
| Mafia DE map | A flat printed-style map; one torn edge is the only decoration |
| Mafia III options and map | 1968 expressed by graphic design: one heavy display word ("GAME", "MAP"), a pipe-separated tab bar, yellow for money |
| Mafia: The Old Country, Carcyclopedia | Black field, one gold heading, a thin-line spec list, segmented bars |
| L.A. Noire notebook | Printed small-caps field labels filled in **by hand**; used entries struck through. Hints in plain sans outside the book |
| GTA V pause and interaction menu | One sans face throughout; dense two-column label/value list; the focused row inverted to white; script only as one header |

Written sources:
- Taylor Wright, Rockstar San Diego, on RDR2 (redlamp.org/work/rdr2/): menu motion is a subtle "shuffle", "easy to miss";
  the radar was kept minimal "to let players stay immersed"; meters fade in quiet moments.
- Jason Schreier, via TechRadar, on GTA VI: Rockstar tried "a million different things" for the weapon wheel and kept the familiar convention.

### The rules we take from both sets of references
1. Paper is an in-world **object, shown straight on**, never a floating, tilted card. There is no tape, no stamps and no scattered notes.
2. **Keep the artefact and the UI layer separate.** Period typography lives inside a reproduced object; the controls,
   cash and prompts around it are one clean sans on dark translucent panels.
3. Most screens aren't paper at all: a **dark flat panel or a narrow left column over the live world**.
4. **Two type roles per screen**: a display heading and one text face.
5. **One accent colour, used for meaning only** (selection, the player, wanted).
6. Prices and stats are **label + right-aligned value rows**, never price-tag graphics.
7. Focus is **one thin outline or an inverted row**: no glow, no stamp, no scale-up.
8. **One decorative gesture per screen, at most.**
9. Motion is subtle and functional.
