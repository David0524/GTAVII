# Game-loop wiring after the integration sprint (engine), started 2026-11-27

**Status 2026-11-27: steps 1–7 WIRED and pushed.** The board, critique and "vs GTA" notes are in
docs/WIRING_BOARD.md. Load test passes. The deploy build serves content/ and renders speech.
Remaining items are listed under "Not wired yet" in the board. Park Ave South median: data pass
(board item 3).
All 7 streams are merged (sim 0fcb5ce). Wire them into main.ts in this order. Each step is its own commit
with typecheck, npm test, and a headless smoke shot.
1. **Camera report** (oversight and UI): UiHost `player()` gets
   `heading: mode === 'onfoot' ? player.heading : fly.yaw`. Give the stand-in capsule a facing cue
   until step 4 replaces it.
2. **Sim:** `new Simulation({...})` (see src/sim/debug/SimDebugView.ts for the options).
   - Every frame: `update(dt, focus)`, `setView(camX, camZ, fwdX, fwdZ, fovDeg)`,
     `setExternalActors([{ player… }])`, `setClock(worldClock.minutes)`.
   - Once: `setObstacles(furniture)`.
   - Low preset density 40/120 (sim 10 asks for 90/240 if the phone bench allows).
3. **Vehicles:** `factory.createTrafficRenderer().setInstances(sim.vehicles)` (see the vehicles
   brief and docs/requests/vehicles.md).
4. **Characters:** `createCharacterFactory({quality})`; the player body from `player.loco()`;
   `crowd.setAgents(sim.peds)`. This removes the capsule.
5. **Signals:** the heads from `sim.signalHeads()` (sim 9) replace the POI-based poles in
   StreetFurniture. Lens state comes from `sim.signalStates(out)`.
6. **Gameplay:** `new Gameplay({quality, content})`, with bindPlayer, bindWorld(new
   RapierWorldQuery(physics)), bindSim, bindVehicles; `update(dt)` after physics; the save section;
   talkables (gameplay 15).
   - Mission and trigger runtime (UI 024acfa, gameplay ba2e825):
     - `discover` events carry `notify: content.discoveryNotify ?? 'silent'`, and `mission: <id>`
       when the place belongs to the running mission (the "Added to map" fix).
     - Call `g.missionBegin(id)` at mission start.
     - On completion or failure, emit `missionEnd { result: 'passed' | 'failed', title, reason?, cash?,
       lines: g.missionLines() }`. UI's MissionCard renders it.
   - Traversal hint: `UiHost.traversal?()` (UI 6.3) comes from gameplay's traversal system once it
     is bound, else from the engine's ledge probe.
7. **Audio:** the AudioSystem plus world feeds (docs/requests/audio.md items 1 and 3).

**Queued (low priority, UI 2c508fb + vehicles e046440):** add
`UiHost.carThumb?(model, angle)` → `renderThumbnailBlob(renderer, model.id, model.paint ?? null, angle,
{ variant: model.variant })` from src/vehicles/thumbnail.ts. Fill `CarView.model` and
`LotView.cars[].model` from the save. Do this at the next UI + vehicles merge.

**Sim 5 parkedCars:** accepted, and the sim stream is shipping `parkedCars(x, z, r)`. The engine
instances the results as static cars.

Then: the touch-only combined run, the integrated board (Park Ave top-down and mid-block views, wide
A and D with cars, street-sign accuracy against 1970s photos), deploy, and the note to oversight.

**After that:** the FREE_ASSETS plan (docs/briefs/FREE_ASSETS.md on awesome-keller):
- three-gpu-pathtracer (MIT) baking GI lightmaps and probes offline;
- r187 TSL GTAO, SSR, TRAA and SSGI on desktop;
- Poly Haven, ambientCG and cgbookcase CC0 scans;
- ez-tree (MIT) for block B;
- meshopt and KTX2.

Verify each LICENSE file and log it in docs/licenses/ASSETS.md.

**glTF loading (oversight relay, interiors fa1c25c):** under WebGPU builds, GLTFLoader can pull in a
second copy of three.js. Every stream must load models the same way. Either:
- alias `three` to `three/webgpu` in vite.config, or
- share interiors' GLB reader from src/shared.

Decide this before the first CC0 asset lands. Interiors' props also need the shared lighting
foundation (interiors request 9) to stop looking pasted in.

## Interiors hookup design (engine, started 2026-11-27)
**Constraint:** interiors stream only units whose door is within 30 m (`STREAM_IN`; unload at 48 m).
Cutting chunk walls everywhere would show the void behind every storefront beyond that.

**Design:**
1. **Cuts.** The chunk worker loads `public/data/interiors/index.json` once.
   `buildChunk(…, openings?)` takes a per-edge hook that wraps interiors' `facadeOpenings` (the loop
   from `shellOpenings` in testShell.ts). `extrude` splits outer-ring walls around the openings in the
   LOD0 mesh only. Collision comes from the same mesh, so the door holes are walkable.
2. **Plugs.** For each opening, the worker also emits a quad into a per-chunk "storefront plug"
   mesh, set 0.25 m inside the facade line. It carries attributes: unit id hash, kind
   (door / window / transom), lit flag.
   - Day: the material is dark glass with a sky reflection term.
   - Night: an uneven warm lit-room card (interior-mapping parallax on Medium and above) replaces
     today's flat storefront glow. This fixes board item 2.
   - When an interior goes live (`Interiors.onBuilt`), its plugs hide through a per-chunk visibility
     bitmask (a uniform texture); they show again on unload.
3. **Runtime.** `createInteriors({quality, content})` in main, after the title.
   - Per frame: `update(dt, player, clock, camera)` and `colliders(physics.world)`.
   - `exteriorHidden` skips LOD1 and chunks beyond 60 m.
   - `gameplay.bindDoors({ doorsForChunk, open })`.
   - `audio.setInterior(inside()?.kind ?? null, …)`.
4. **Roof hatches** (interiors request 2) come later, with traversal (MOVEMENT).
5. **Tests:** a chunk test proves openings cut the wall area and that plugs match the openings.
   Shots: inside a diner and an SRO, and a street view at night.
