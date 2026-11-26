# Art sources (shared log)

One log for every third-party asset in the game: what it is, where it came from, its licence, what
we changed and where it is used. Required by `docs/briefs/ART_ASSETS.md`. Streams request
additions through ENGINE_REQUESTS, and the engine owns this file. Only CC0 or equally permissive
sources are allowed without the user's approval.

## Characters: fabric scans (characters request 4; full record in `docs/CHARACTER_SOURCES.md` §5)
Files: `public/characters/fabric_{a,b}_{hi,lo}.webp`.
- **Licence:** CC0 1.0 (https://polyhaven.com/license): no attribution required; credited here anyway.
- **Assets** (1k `Displacement` PNGs from the Poly Haven API, fetched 2026-11-26; scans by colormass, processed by Rico Cilliers):

| Channel | Asset | URL | Used for |
|---|---|---|---|
| a.R | Poly Wool Herringbone | https://polyhaven.com/a/poly_wool_herringbone | suitings, tweeds, checks, plaids |
| a.G | Denim Fabric | https://polyhaven.com/a/denim_fabric | jeans and denim jackets |
| a.B | Cotton Jersey | https://polyhaven.com/a/cotton_jersey | knits and rib |
| b.R | Stretch Poplin | https://polyhaven.com/a/stretch_poplin | shirting, blouses, plain cloth |
| b.G | Ribbed Corduroy | https://polyhaven.com/a/ribbed_corduroy | reserved (corduroy) |
| b.B | Brown Leather | https://polyhaven.com/a/brown_leather | leather grain (shoes, belts, jackets) |

- **Edits:** resampled to 512² / 256², high-passed (periodic Gaussian, σ = 1/64 of the tile, so
  the tiles stay seamless) to remove the swatches' own undulation, contrast-normalised, packed
  into RGB and saved as WebP (q85). Sampled triplanar in bind space at the scans' real size
  (0.27 m tile) as bump height; colour still comes from our procedural patterns.



## Interiors stream

Every external asset the interiors stream uses, with its licence. **Interiors currently ship no
textures, meshes or images.** All geometry and patterns are generated (see `src/interiors/kit/`
and `src/interiors/runtime/material.ts`).

### Planned (per docs/briefs/ART_ASSETS.md)
- **CC0 photoscanned materials** (Poly Haven, ambientCG): plaster, linoleum, hex and subway tile,
  terrazzo, marble, wood floors, enamel paint, rust. These go through the engine's shared material
  library, not a second one. The interior uber-material will sample them by pattern id and blend
  them by condition grade. Each entry will be listed here with its URL and CC0 statement.
- **Generated art** (posters, menus, packaging, shop signs, pinned photos): interiors expose **art
  slots** (`BuiltInterior.art`, and `Interiors.artSlots(id)` in world space). Each slot has an id,
  a use (`menu | poster | sign | photo | packaging | calendar | notice`), a width and height in
  metres (the aspect follows) and a facing. The prompt packs target slots by use and aspect.

### Reference photos (not shipped in game; art reference only)
Interior references are appended to the shared `references/catalog.json` (rights per entry):
Library of Congress HABS/HAER (public domain), DOCUMERICA (public domain) and Gottscho-Schleisner
(no known restrictions).
