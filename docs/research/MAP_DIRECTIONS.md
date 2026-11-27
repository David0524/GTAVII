# Map redesign: three directions (user: "Redesign the map. I don't like how it looks. Consider how GTA and RDR2 maps look.")

**These are mockups for the user to pick from. Nothing is built into the game until a direction is chosen.**

**The frame:**
- the same frame in every direction: phone landscape (844×390 @2x), Chelsea at the bottom to Herald Square at the top;
- a walking route from the Flatiron to Lacy's;
- discovered ground (23rd St, Chelsea, up Eighth Avenue to the Garden, and Madison Square) next to undiscovered ground (the Garment Center and Herald Square);
- the legend open, with a waypoint card.

**Real data throughout:**
- our streets;
- the places catalogue: one marker per subway station, and payphones filtered off in the legend;
- our route graph and our label placer, which keeps type clear of icons, the route and the chrome;
- the city render in A and C is **an orthographic render of our own city from the engine** (`tools/ui/mapAerial.ts`).

The mockup code is in `tools/ui/mapMock/`. The shots are in `docs/research/map_directions/`: `map_A.jpg`, `map_B.jpg`, `map_C.jpg`, and `board_ABC.jpg` side by side.

## What was wrong with the current map (oversight's read, which I agree with)
- It reads as a flat web-app vector map: uniform blocks, white roads and a default sans.
- There's no sense of the 3D city: no height, parks or roofs.
- An icon collided with the CHELSEA label, and the coverage note collided with the credit.
- The chrome is generic: a fat icon rail, and chunky ME / ERASE ROUTE buttons.

## The three directions
| | A · Aerial | B · Period atlas | C · Hybrid print |
|---|---|---|---|
| **Base** | Our city rendered straight down (rooftops, water tanks, street furniture, parks, shadows), graded to the 1974 film look (desaturated, warm), with roads lifted slightly so the grid reads | An inked 1974 street atlas on paper: double-ruled streets with a slight hand wobble, sand washes for blocks, brick pink for buildings (traced from our render's roofs), green for parks, paper grain and foxing | Our aerial render printed as a single-ink 45° halftone on cream stock, with streets printed clean over the screen and paper grain darkening at the edges |
| **Undiscovered** | A dark haze over the render (the city is there, you just haven't been) | Paper with only the pencilled construction grid. **The ink and washes fill in as you discover**, with a ragged ink-bleed edge | Plain paper: the plate isn't printed there yet, so the halftone fades to nothing, leaving the street hairlines |
| **Landmarks** | Distinct silhouette glyphs (wedge, spire, arena, clock tower) in dark discs | **Ink vignettes**: small drawings of our landmarks in oblique projection, with a hatched shadow side, window ticks, a gilded pyramid, a clock face and the prow. Each sits by its spot with a hairline leader and its name lettered beneath | The same silhouette glyphs, printed in ink on paper discs |
| **Route** | Bold taxi-yellow GPS line with a dark casing | A red crayon line with a slight wobble | Taxi-yellow (a second ink) with an ink casing |
| **Type** | Heros Condensed caps with dark halos; districts as spaced caps | Schola italic, lettered like an atlas; districts in spaced roman caps | Heros Condensed caps with paper halos |
| **Chrome** | Slim dark translucent UI layer: a legend list with counts and toggles, round icon buttons, a key-hint footer | The legend becomes the atlas's own printed index (ink on paper), with one decorative gesture: a compass | Same UI layer as A |
| **Phone cost (full build)** | Baked tiles at 2–3 zoom levels: about 1.5–3 MB of WebP for the playable area. Drawing costs nothing (tiles plus a vector overlay) | Vector-only plus small textures: about 200 KB. The paper and washes are generated once into a cached tile | Baked halftone tiles: smaller than A (1-bit plus paper), about 0.8–1.5 MB |
| **Risk** | Least period character; looks most like GTA | Labour: landmark vignettes for every hero building, and hand-lettering quality | The halftone can look noisy when zoomed in; the screen ruling must be tuned per zoom level |

## vs GTA V / VI / RDR2 (REFERENCE_GAMES.md)
- **GTA V and VI:**
  - **What the reference does:** the map is a top-down render of the game world, muted so blips and the GPS line read. It has a compact legend, clean blips and a bold route, smooth zoom, and minimal chrome.
  - **Where we match:** A does the same with our own render, our route and our blips. Its undiscovered haze is closer to RDR2.
  - **Where we fall short:** smooth zoom needs tile LODs, which is the full-build cost above. Our blip set is smaller.
- **RDR2:**
  - **What the reference does:** a painterly period map on paper with ink linework, lettered names, illustrated landmarks, fog of war, and an in-world feel.
  - **Where we match:** B covers each of these: the ink, washes, lettering, vignettes and ink filling in as you discover.
  - **Note on the vignettes:** I first tried tracing engine renders of the landmarks (`tools/ui/mapVignettes.ts`), but our current models aren't distinctive enough to read at this size. The mockup vignettes are drawn in code instead; a full build would have them drawn properly (ART_ASSETS route).
  - **Where we fall short:** RDR2's map is hand-painted by artists. Our washes and ink are procedural plus processed renders, so they're convincing at phone size but won't match it at full screen on a TV.
- **C** is ours rather than borrowed from either game: GTA's readability, with 1974 print production (halftone, two inks, stock).

## Fixes common to all three
- **Collisions:**
  - one placer for icons, the route, chrome boxes and the credit, so labels never sit under icons, the route, the legend, buttons or the credit;
  - icons de-clutter at this zoom (one per station, and clustering under 13 px).
- **Undiscovered areas are shown,** not hidden: known landmarks still show in undiscovered ground (seen from a distance), and tips show as dashed "?" markers.
- **The ODbL credit** is a small chip beside the legend, out of every label's way.
- **Slimmer chrome:**
  - a 206 px legend list replaces the icon rail plus legend;
  - two 34 px round buttons replace ME / ERASE ROUTE;
  - one key-hint footer.
