# Game-loop wiring after the integration sprint (engine), started 2026-11-27
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
7. **Audio:** the AudioSystem plus world feeds (docs/requests/audio.md items 1 and 3).

Then: the touch-only combined run, the integrated board (Park Ave top-down and mid-block views, wide
A and D with cars, street-sign accuracy against 1970s photos), deploy, and the note to oversight.

**After that:** the FREE_ASSETS plan (docs/briefs/FREE_ASSETS.md on awesome-keller):
- three-gpu-pathtracer (MIT) baking GI lightmaps and probes offline;
- r187 TSL GTAO, SSR, TRAA and SSGI on desktop;
- Poly Haven, ambientCG and cgbookcase CC0 scans;
- ez-tree (MIT) for block B;
- meshopt and KTX2.

Verify each LICENSE file and log it in docs/licenses/ASSETS.md.
