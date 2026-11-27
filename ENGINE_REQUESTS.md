# ENGINE_REQUESTS

Requests from workstreams to the engine. Answers go in `ENGINE_RESPONSES.md` (engine-owned).

## From interiors: 1. Cut the facade (and its collider) where interiors say
**Why:** today every building is a closed extrusion with a closed trimesh collider, so no door
can be walked through and no shop window can be seen into.
**Ask:** in `meshBuilder.extrude()` (render and collision come from the same geometry), cut
rectangular holes in the outer-ring walls at the openings the interiors module reports.
- API (shipped on `claude/interiors-tenderloin`): `facadeOpenings(unit, year, fh)` in
  `src/interiors/facade.ts`, and the edge-matched helper `shellOpenings(building, x0, z0, x1, z1)`
  in `src/interiors/test/testShell.ts`, which returns `{ s0, s1, y0, y1 }` spans along a footprint
  edge in metres (absolute y). That file is a working reference implementation: it is the engine's
  extrude with the wall split around the openings. The engine can copy the loop.
- Openings sit at the facade line (z = 0 in unit space). The interior supplies its own reveals
  0–0.3 m deep, glass, door leaves and frames, so the engine only removes wall area.
- Data: `public/data/interiors/index.json` (1.5 MB raw, ~0.5 MB gzip) lists every unit by
  `buildingId`; the worker can load it once next to `terrain.bin`.
**Fallback until shipped:** the `?interiors=1` test scene builds its own shells around the test block.

## From interiors: 2. Cut roof hatches
Stairs and ship's ladders climb through the roof into a bulkhead. The engine's roof polygon and
its collider must have a hole at each hatch: `roofHatchesWorld(building)` in
`src/interiors/layout.ts` returns world x/z rings. The bulkhead (walls, door, tar cap) and roof
dressing are drawn by interiors. Without the hole, the roof trimesh blocks the stair and stops
the player.

## From interiors: 3. Contract additions (backwards compatible)
- `ready: Promise<void>`: the door index loads asynchronously. Await it before building chunk
  meshes so `doorsForChunk()` is populated.
- `update(dt, player, clock, camera?)`: the camera enables portal culling (interior draws cost 0
  unless a street portal is on screen).
- `exteriorHidden: boolean`: true when the camera is inside and no street portal is visible. The
  engine may then skip city chunks, sky and far LOD that frame. Suggested: hide LOD1 and all
  chunks beyond 60 m.
- `inside()` also returns `reverb` and `cell` (for the audio stream).
- `ensure(id)`: build an interior on demand (missions, previews).
- `DoorRec` adds `width`, `height` and `windows` (for frames, signage and handles).

## From interiors: 4. Lighting for characters indoors
The interior material is unlit (baked lamp + window light, scaled per interior by power state),
so the sun never leaks through walls. Characters and vehicles use scene lights and will look
sun-lit indoors. **Ask:** when `inside()` is non-null, dim the sun/hemi contribution on characters
(or give their materials a per-object light scale). Interiors can supply
`lightAt(x, y, z) -> rgb` from the bake on request.

## From interiors: 5. Moving platforms (elevators)
The Corwin elevator needs to carry the player (lobby to the 11th floor, seamlessly).
**Ask:** a hook on `PlayerController` to add a kinematic platform delta per fixed step (or to
parent the capsule to a moving body). Fallback: stairs only, plus an elevator that "arrives"
with its doors closed while the floor below streams out.

## From interiors: 6. Facade window data for Tier C
The window shader (rooms behind non-enterable windows) is a material function the engine applies
to facade window quads. It needs per-window attributes: building use, floor index, condition and
a stable window id (hash). It also needs uniforms for clock minutes and area power. Integration
proposal follows with the shader (Phase 3 facade work).

## From interiors: 7. Water tanks and roof clutter
Roof dressing streams with the interior (within 30 m), but wooden water tanks are skyline
features visible from far away. **Ask:** the engine draws the far-LOD tank (one instanced
cylinder + cone) from `roofFeatures(buildingId)`, which interiors will export. Interiors swaps in
its detailed one near the roof.

## From interiors: 6b. Tier C hook for `src/render/FacadeMaterial.ts` (concrete proposal)
`src/interiors/windowRooms.ts` exports `interiorRoomNode({ wuv, id, use, floor, cond, minutes, power, daylight, n?, t? })`.
It is a pure TSL node: no textures and no extra vertex attributes. It returns the radiance seen through the glass: the room
(by use, hour and power), the shade at a random drop, TV flicker, a ceiling-fan shadow, an occasional figure crossing, and an
AC unit in about one window in six. Every input already exists in FacadeMaterial per window cell:
```ts
// inside the window cell (upperMask), FacadeMaterial.ts:
const wuv = vec2(fu.sub(float(0.5).sub(halfW)).div(winFrac), fv.sub(sill).div(head.sub(sill)));
const room = interiorRoomNode({ wuv, id: rnd, use: useAttr /* or style-derived: resid ? 2 : 5 */, floor: floorIdx, cond,
  minutes: facadeUniforms.minutes, power: areaPower /* 0 | 0.45 | 1 */, daylight: float(1).sub(facadeUniforms.night) });
// near LOD only (lodFade < 1); far LOD keeps the current averaged emission
const tierC = select(boarded.or(inStore), vec3(0), room).mul(float(1).sub(lodFade));
m.emissiveNode = select(isRoof, vec3(0), mix(emissiveWin, tierC.add(emissiveWin.mul(lodFade)), upperMask).mul(winMask).mul(facadeUniforms.litScale));
```
- **Needs from the engine:** a `minutes` uniform (or hour) next to `night`; per-area `power` (N2 brownouts); and, ideally,
  PLUTO `use` per building (chunk records already have it). Without `use`, style 1/6 = residential and others = office
  works.
- **Cost:** measured in SwiftShader only (no GPU here). One ray–box intersection plus about 15 hash and noise evaluations per window
  pixel, run only where the window mask covers the pixel and only at near LOD. The brief's ≤0.3 ms GPU at 1080p needs a phone
  or desktop GPU run via `?hud=1`.
- **Demo:** `?interiors=1&t=21:30` shows it on the test block (`createWindowRoomMaterial`, same node).

## From interiors: 8. ART_SOURCES entries
Interiors ships no third-party assets yet. Our notes on the planned CC0 materials, the art slots fed by narrative's prompt
queue and the interior reference photos are in `docs/interiors/ART_NOTES.md`. Please add the relevant lines to
`docs/ART_SOURCES.md` when the first interior asset lands. Narrative's six Corwin art slots (commit c88da12) are the first ones.

## From interiors: 9. Shared PBR material library, probes, SSAO and reflection probes for interiors (VISUAL_BAR)
Interiors move from an unlit, vertex-baked material to the engine's lit PBR path. The engine owns these pieces and interiors consume them. Please define:
- **Material library**: where it lives (proposal `public/materials/` with `src/shared/materials.ts` as the manifest), the format (KTX2/Basis texture arrays, 1K on Low and 2K on High; albedo, normal and an ORM pack of AO, roughness and metal), and the texture budget per tier. Interiors need about 20 sets: plaster (painted, peeling), hex tile, subway tile, terrazzo, checker lino, plain lino, oak planks (good, worn), carpet (two weaves), tin ceiling, acoustic tile, painted brick, wood panelling, formica, vinyl, chrome or brushed steel, enamel, fabric (two weaves), concrete. Each needs a CC0 source with its licence logged.
- **Material API**: a node-material factory interiors can call per surface class with a texture-array layer index plus per-vertex tint, wear, grime and wet masks. Interiors keep their procedural pattern logic as masks over the PBR layers.
- **Indirect light**: either (a) lightmaps, where interiors emit a second UV set and bake in the worker as today but to a texture atlas per interior; or (b) per-cell irradiance probes (SH9) supplied by the interior, sampled by the engine's lit material. Interiors propose (b) as the default, since it suits streaming and the worker bake already has the data, with (a) on desktop High.
- **Direct light**: the engine's clustered or forward+ local lights. Interiors will hand over at most 2 shadowed and 8 unshadowed lights per visible cell, using the existing `LightOut` list.
- **Sun and sky through windows**: the engine's sun direction and sky colour per frame. Interiors provide window portals (already in `PortalOut`) so the engine, or the interior material, can cast sun patches with frame shadows that follow time of day.
- **SSAO/GTAO** enabled inside interiors, and **reflection probes**: one box-projected cubemap per room, captured at build time and supplied by interiors with its box, if the engine's probe system accepts runtime-supplied probes.
Until this is defined, interiors keep the current path and do content work.

## From interiors: 10. Traversal markup contract (MOVEMENT.md)
Interiors own traversal markup on fire escapes, interior stairs, roof access and roof-to-roof gaps. The engine's PlayerController detects and executes it. Proposed shared type (engine to place it, e.g. `src/shared/traversal.ts`):
```ts
export type TraversalKind =
  | 'drop_ladder'   // fire-escape ladder: pull-down at the lowest platform (a = bottom when lowered, b = platform top)
  | 'ladder'        // fixed ladder or ship's ladder (a = bottom, b = top; n = facing the climber)
  | 'fe_platform'   // fire-escape balcony walk surface (box), with rail height
  | 'fe_stair'      // fire-escape stair flight between platforms (a -> b)
  | 'sill'          // window sill a climber can stand or hang on (segment a -> b, n out of the wall)
  | 'ledge'         // grabbable edge: parapet, cornice, roof edge (segment a -> b, n outward)
  | 'roof_gap'      // jumpable gap between roofs (a = take-off edge midpoint, b = landing, width, drop)
  | 'hatch'         // roof hatch or bulkhead door (interior <-> roof)
  | 'vault'         // low obstacle 0.5-1.2 m (railing, counter, turnstile)
  | 'fence';        // chain-link fence 1.8-3 m (climb over)
export interface TraversalMark {
  kind: TraversalKind;
  a: [number, number, number]; b: [number, number, number];   // world metres
  n?: [number, number];                                       // outward or facing normal (x, z)
  w?: number; h?: number;                                     // width; rail or obstacle height
  building?: number; unit?: string;                           // ownership for streaming
  flags?: number;                                             // 1 locked, 2 noisy (police notice), 4 one-way down
}
```
- **Delivery**: per chunk, beside the interiors index (`public/data/interiors/traversal/<i>_<j>.json`), loaded with the chunk. Inside interiors, the built interior adds its own stairs, ladders and hatches at build time through `BuiltInterior.traversal` in the same type.
- **Fire escapes**: who builds the geometry? The facade work owns exterior fire-escape meshes. Interiors propose generating the placement (which buildings, which facade, platform per floor at the shared floorHeight, a drop ladder over the sidewalk or yard) in the index builder from building data and period rules (tenements and lofts of 5 or more floors, 1900-1940, street or rear facade). We publish the marks, and the engine builds meshes from the same marks, so collision and visuals agree.
- **Roof gaps**: computed in the index builder from adjacent roof heights (gap of 4 m or less, drop of 6 m or less), plus parapet ledges along every roof edge we make reachable.
Please confirm or amend the type and the ownership of fire-escape meshes.
