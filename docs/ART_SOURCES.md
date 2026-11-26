# ART_SOURCES: interiors

Every external asset the interiors stream uses, with its licence. **Interiors currently ship no
textures, meshes or images.** All geometry and patterns are generated (see `src/interiors/kit/`
and `src/interiors/runtime/material.ts`).

## Planned (per docs/briefs/ART_ASSETS.md)
- **CC0 photoscanned materials** (Poly Haven, ambientCG): plaster, linoleum, hex and subway tile,
  terrazzo, marble, wood floors, enamel paint, rust. These go through the engine's shared material
  library, not a second one. The interior uber-material will sample them by pattern id and blend
  them by condition grade. Each entry will be listed here with its URL and CC0 statement.
- **Generated art** (posters, menus, packaging, shop signs, pinned photos): interiors expose **art
  slots** (`BuiltInterior.art`, and `Interiors.artSlots(id)` in world space). Each slot has an id,
  a use (`menu | poster | sign | photo | packaging | calendar | notice`), a width and height in
  metres (the aspect follows) and a facing. The prompt packs target slots by use and aspect.

## Reference photos (not shipped in game; art reference only)
Interior references are appended to the shared `references/catalog.json` (rights per entry):
Library of Congress HABS/HAER (public domain), DOCUMERICA (public domain) and Gottscho-Schleisner
(no known restrictions).
