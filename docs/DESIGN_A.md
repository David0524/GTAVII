# Design language "A": a late-2020s game UI, immersed in 1974 New York

> User, 2026-11-27: "Let's go with A. Let's make sure the rest of the UI is designed similarly. It should still feel
> like a late 2020s video game while still being immersive to 70s NYC. Avoid the Claude-looking visuals. It shouldn't feel AI."

The **map** is direction A: an aerial render of our own city with fog of war. **Everything else** follows the
same idea: the live world is the backdrop, the UI is a confident, restrained layer over it, and the 1970s come
from **content and art direction**: our renders, period paper where it's diegetic, and the 1974 grade and type.
No kitsch.

The bar is current AAA open-world menus (GTA VI, RDR2, the Ghost / The Last of Us generation). It's a quality
bar only, and nothing is copied: no layouts, wording, icons or type.

## 1. Surfaces
- **World first:** menus sit over the held game frame, graded: desaturated, warm, darkened about 55%, with a 9 px blur. HUD sits over the live frame.
- **Panels:**
  - flat near-black `#0c0c0b`: 82% for content panels, 70% for bands, 92% for focus surfaces;
  - **square corners** (0 px; 2 px only on touch buttons);
  - no outline boxes, no drop shadows, no frosted glass on panels.
- **Separation** comes from value and a **1 px hairline** (`--hair`, cream at 16%), never from card stacks.
- **Diegetic paper** appears only as an object (the newspaper, tickets, the ledger page, the matchbook), shown straight on, with print-correct type. It is never a UI panel.

## 2. Colour
- **Ink:**
  - cream `#f2ede3` on dark (never pure white), dim at 62%, faint at 38%;
  - **one accent: transit amber `#e8a317`** (NYCTA PMS 109 transfer yellow), for selection, the route, the active tab and new things only;
  - **red `#c8361f`** for danger, heat and wanted only;
  - **green `#3f8f5a`** for money gained only.
- **The 1974 grade** lives in imagery and the world (Kodachrome warmth, lifted blacks), not in tinted UI chrome.

## 3. Type (all free licences; logged in docs/licenses/ASSETS.md)
| Role | Face | Setting |
|---|---|---|
| **Voice:** titles, big numbers, headings | **Libre Franklin** 800–900 (Franklin Gothic class: the 1970s New York tabloid and ad gothic) | Sentence case, tight (−0.015em), large: 28–56 px desktop, 22–34 px phone |
| **Labels:** tabs, section heads, keys | **T74 Heros Cn** 700 (transit-sign condensed) | Caps, +0.12em, 10–12 px |
| **Text:** rows, descriptions, values | **T74 Heros** 400/700 | 12–15 px, 1.35 leading; tabular figures for money and time |
| Diegetic print only | T74 Schola (newspaper body), T74 Cursor (typed forms), Libre Franklin (headlines) | As the object would have it |

Hierarchy comes from **size and weight contrast**: one huge Franklin heading against small condensed labels. It
never comes from colour or boxes.

## 4. Grid and composition
- **Desktop:** a 12-column grid with 32 px margins. Content is **left-weighted and asymmetric**: a 4–5-column list/detail column on the left, the world or imagery owning the right. **Phone landscape:** 8 columns with 16 px plus safe-area margins.
- **Density is real:** rows of label plus right-aligned value at 30–34 px row height. No sparse grids of identical tiles.
- **One hero element per screen**, the thing you came for: a big number, the map, a render of the car.

## 5. Icons
- **Our own drawings** on a 24 px grid: **1.75 px stroke, square caps, mitred joins**, optically balanced, and period-specific where it matters (a globe lamp for the subway, a candlestick phone for payphones, a fedora for contacts).
- **UI icons are line-only**, in cream; the accent marks the active one.
- **Map blips:**
  - a solid glyph silhouette in cream with a 2 px dark halo, **no circles**;
  - colour by meaning only (amber story, red danger, blue police);
  - **landmarks** are distinct building silhouettes on a small plinth line, larger than blips.

## 6. Motion (purposeful; `reduceMotion` turns it into fades)
- **Screens:** a mask wipe left to right, 240 ms, `cubic-bezier(.2,.7,.1,1)`, with content following 40 ms later.
- **Selection:** the amber bar slides (transform) in 140 ms. Tabs cross-fade in 120 ms with an 8 px shift.
- **Toasts:** they slide in from the left edge on an amber rule, stay 4 s, then retract.
- **Mission cards:** a black band wipes across the frame, the Franklin headline types in by weight, then the money ticks up.

## 7. Not AI-looking (oversight's rules, as checks every screen must pass)
1. No rounded-card dashboards, no default system/Inter-style voice, no gradient blobs, no glassmorphism.
2. No identical icons in identical circles, no evenly spaced everything, no beige on beige.
3. Real content density and specific copy (street names, prices in 1974 dollars, names), never lorem-style filler.
4. Asymmetry and scale contrast are deliberate. Every screen has one hero.
5. Imperfection only where diegetic (paper wear, a pencil mark), never as a texture on the chrome.
