# Engine handoff (branch `claude/tenderloin-74-engine-qi54lt`)

Written 2026-11-27 because usage was about to run out. Everything below is committed and pushed.

## Done (this session, newest first)
- **Night and street level (WIP commit, unmeasured as a whole):**
  - storefront spill pools on the sidewalk in front of 916 shop doors;
  - placeholder marquees on the Deuce (11 doors on W 42nd between 7th and 8th Aves; DOOR flag 4);
  - denser street lights (avenues every 27 m, side streets every 34 m);
  - lit-window colour spread (incandescent, fluorescent, TV, curtains) and a lower lit fraction;
  - night bloom threshold and blue-hour cool fill with a grade tweak (`PostFX.setTimeOfDay`).
- **Shot rig:** JPEG q85 ≤1600 px; lookmetrics bands by time of day (day, blue, night); the dusk slot is
  now 20:50 (sunset on 21 June 1974 is about 20:27 EDT).
- **Golden and night exposure, city-glow fill, varied lit windows (74fc13e).** Worn asphalt (93f49b0).
- **Trees and parks (04f49be):** 524 park trees, 334 street trees, benches, lamps, railings, paved park
  paths.
- **Doors on every building with frontage (ec4d054):** the DoorRec contract; interiors replaces them at
  its merge.
- **Facade data fixes (00ce718):** overlap clipping, floor sanity, AC units on the shared grid
  (`src/shared/facade.ts`).
- **Noon lighting (1e7ef74)**, the window-lights flicker fix (c9678a3, `npm run test:windows`), and
  landmark display names plus the brands test.
- **Phone:** the viewport fix (`npm run test:viewport`), load time (`npm run test:load`), the perf
  report, `?bench=1`, adaptive DPR and the props/detail split.

## In flight: Phase 3 tuning (latest measurements, `shots/phase3tune*`)
- **A 23:00 night: PASS** (p50 17).
- **A 20:50 blue hour: FAIL.** p50 15 (band 20–60) and no cool saturation. The blue fill is too weak,
  or the grade still desaturates it, so look at `PostFX.setTimeOfDay` and `Atmosphere` blue-hour
  hemi/fog.
- **D 19:30 golden: FAIL.** p50 25 and grey highs (#a7a9a9). At midsummer 19:30 the sun is 9° up, so
  the Herald Square canyon needs brighter sky fill. Raise hemi day intensity while golden < 1, and check
  the sky colour.
- **Noon (`shots/phase3`, before the asphalt change):** E and H in band; A and D dark (asphalt now
  fixed, re-shoot); G and I bright from sky-heavy frames. Highlights are too bright and cream; the sky
  has an elliptical clear patch from the SkyMesh cloud layer.
- **Next steps:**
  1. Fix blue hour and 19:30 as above, and re-shoot with
     `npx tsx tools/shots/capture.ts --phase phase3 --webgl --quality high --views A,D,E,G,H,I`.
  2. Run `python3 tools/shots/compare.py shots/phase3`.
  3. Write the Phase 3 critique in PROGRESS.md and send the set to oversight. Include one wide A and
     one wide D shot with placeholder cars (sim `?sim=1` debug boxes, after the sim merge).
  4. Oversight items still open: denser street-level sources (car headlights come with sim and
     vehicles), a little bloom on lit windows (High only), and the sky colour and cloud ellipse.

## In flight: sim merge (NOT on the branch yet)
- A local trial merge of `origin/claude/nice-sagan-2jh4m2` @ 0447d43 was clean apart from
  `package.json` scripts (keep both blocks). The sim's root `ENGINE_REQUESTS.md` should move to
  `docs/requests/sim.md`. `npm run test:sim` PASSED and `npm test` and the typecheck were clean on the
  merged tree.
- **To redo:**
  1. `git merge --no-ff origin/claude/nice-sagan-2jh4m2`, resolve `package.json`, and
     `git mv ENGINE_REQUESTS.md docs/requests/sim.md`.
  2. Run `npm run test:sim`, `npm test` and `npm run test:viewport`, then `npm run test:load` (load
     budgets: title ≤15 s, new game → playable ≤3 s), plus a `?sim=1` smoke test.
  3. Commit and push. Merge order after that: vehicles, characters, UI, gameplay, interiors, audio
     (see ENGINE_RESPONSES).

## Waiting on the user (via oversight)
- A phone perf report with Low Power Mode off, opened with `?hud=1&bench=1` (bench table).

## Process notes
- **Headless:** SwiftShader frames take about 1.5–2.5 s. Headless WebGPU loses its device on large
  frames, so WebGPU look and timing need a real GPU.
- **Don't rebuild `dist/` during a capture.** The rig serves `dist/` through `vite preview` on a fresh
  port.
- **ENGINE_REQUESTS checks:** `tools/dev/requests.sh`; answer in ENGINE_RESPONSES.md.
