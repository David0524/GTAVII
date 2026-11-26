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
