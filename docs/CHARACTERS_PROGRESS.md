# CHARACTERS_PROGRESS: source of truth for the characters workstream

Branch `claude/characters-74`; brief `docs/briefs/CHARACTERS_BRIEF.md`. Read this first, update it
last.

## Status (2026-11-26)
| Area | State |
|---|---|
| Asset sources | **Decided by the user:** MakeHuman CC0 base mesh/targets/rig, and Quaternius UAL 1+2 (CC0) plus our own procedural clips. Details in `docs/CHARACTER_SOURCES.md` |
| Reference study | `docs/WARDROBE_1974.md`: 65 photos with usable people, about 230 readable figures |
| Parametric body + face | Done (first pass): macro PCA space, 356 local targets, 5 body LODs, stature scaling, adults only |
| 1974 wardrobe generator | Done (first pass): men's/women's tables from the doc, uniforms (generic), archetype hooks (palette/wardrobe/props), outfit description data for gameplay |
| Garments / shoes / hats / glasses / props / hair | Done (first pass): cut from body/helper surfaces with clean hems, layer offsets, hidden skin removed |
| Skin, cloth, hair materials | Done (first pass, TSL): SSS approximation, procedural patterns, wear/sweat, shell hair |
| Animation | Animator (blend space with stride warp, layers, posture, lean), foot IK with locking, look-at, hand IK, seat pose, events |
| Heroes | Teddy, Delphine and Nick from the narrative appearance sheets (7fffd4f), wardrobe sets per act |
| Crowd | GPU-instanced templates (baked half-float bone atlas), LOD2/LOD3, a worker-built near ring of full characters, per-agent colour variation, hand carts |
| Test scenes | `?characters=1&scene=lineup|leads|course|slide|crowd` (deterministic with `&t=`) |
| Integration | API in `src/characters/index.ts`; engine wiring requested in ENGINE_REQUESTS ("From characters: 3") |

## Architecture
```
tools/characters/  build-body.ts (MakeHuman → body.bin)  build-anims.ts (UAL → anims.bin)  shot.ts (screenshots)
                   lib/ io.ts (zip/npy/obj/glb readers), linalg.ts (Jacobi eigen), simplify.ts (QEM LODs)
src/characters/    rig.ts (56 joints, UAL names), format.ts (T74X container), index.ts (factory API)
  body/            BodyModel (evaluate shape), macro.ts, appearance.ts (who someone is), skeleton.ts
  wardrobe/        outfit.ts (1974 generator), palette.ts, describe.ts (witness/shop data)
  build/           fields.ts (limb/height/azimuth fields), clip.ts (iso-line cutting), garments.ts,
                   face.ts (landmarks + masks), hair.ts, accessories.ts, assemble.ts, MeshBuilder.ts
  render/          materials.ts (character + hair TSL), meshes.ts
  anim/            AnimLibrary.ts (sampling/blending), authored.ts (hand-keyed clips), Animator.ts, IK.ts
  crowd/           CrowdRenderer.ts, bake.ts, crowdMaterial.ts, buildWorker.ts
  Character.ts, heroes.ts, test/CharactersTest.ts
```

## Decisions (and why)
- **Garments are cut from the body's own surfaces** (the body skin for tight layers at close LODs, the
  tights helper far away, and the skirt helper for skirts and coat tails), using scalar-field
  iso-lines. Every garment vertex is a weighted blend of body vertices, so clothes follow every
  morph and pose exactly, with no separate rigging and no poke-through from mismatched skinning.
  Covered skin is deleted.
- **Rest frames are identity-oriented.** Clips store local rotations against that, so one clip fits
  every body; only bone offsets change with the morphs.
- **The macro body space is stored as PCA of sampled bodies** (64 components), not as raw targets.
  PCA over the raw targets had 25 mm errors; sampled bodies have a 3 mm maximum.
- **Stride warp instead of only playback rate.** Cadence follows human gait data
  (walk ≈ 0.55 + 0.27·v cycles/s); leg swing is scaled to match, and planted feet are IK-locked.
- **Crowds share one material pipeline.** All per-person variety lives in per-vertex data and
  per-instance tints, so there's no per-character shader compile.
- **Main thread vs worker:** near-ring characters build in a worker (25–90 ms each). Hero builds
  are synchronous at spawn (about 80–120 ms; move to a worker before gameplay spawns heroes
  mid-scene).
- **No child characters anywhere** (binding rule from oversight/narrative): generation clamps age
  to at least 18.
- **Clear lenses aren't drawn** (an opaque material can't show the eye behind them); frames are
  drawn, and tinted lenses are opaque.

## Measurements
All in headless Chromium on this container's CPU. Rendering is SwiftShader **software**, so frame
times are not meaningful; CPU-side numbers are. See `shots/characters/*.json`.
- **Hero LOD0:**
  - about 16.8k triangles main + 2.3k hair on average (max 19.3k + 3.9k) in 2 draws;
  - build about 80 ms (assemble) + 9 ms (evaluate);
  - per-frame update see `04_leads_act1.json` (`updateMs`).
- **Crowd LODs (triangles):** LOD1 (near ring) about 7.2k + 1.4k hair; LOD2 about 4.1k;
  LOD3 about 1.8k.
- **Crowd, 400 agents (High):** CPU 0.34 ms avg and 1.0 ms p95 in `setAgents`, including 10
  near-ring characters; 74 draws; about 545k triangles in view. See
  `19_crowd_400_high.json` (final numbers there).
- **Crowd, 120 agents (Low):** see `20_crowd_120_low.json`.
- **Downloads:** body.bin 6.9 MiB + anims.bin 1.0 MiB = 7.9 MiB for High (budget 15).
  Mobile Low currently loads the same files (budget 6 MiB: **over**; see known issues).

## Known issues (honest)
- **Faces read as "game" faces:**
  - eyes are procedural spheres with no wet-line geometry (the wet look comes from specular only);
  - no eyelid blinking yet;
  - brows are short shells.
- **Hair shells alias** without TAA; long hair has no strand cards yet. Afros and set curls read
  best; straight long hair reads like a helmet.
- **Collars and lapels** are ribbon trims: OK at street distance, crude in close-up.
- **Sandals and heels:** sandals render as closed shoes; heels don't tilt the foot (no ankle pitch).
- **Skirts and coat tails** follow MakeHuman's helper weights: the legs poke through at long
  strides.
- **Low-quality download** needs its own reduced body file (LOD3 vertex subset and K=32
  components).
- **No impostors** past 170 m (High); agents beyond are culled.
- **The crowd near ring** builds over a few frames when someone walks into range (the instanced
  LOD shows meanwhile).
- **Animation:**
  - turn-in-place is a simple stepping layer;
  - strafe is authored and basic;
  - stairs rely on foot IK only (no step-up clip);
  - ledge climb is UAL ClimbUp_1m retargeted, not aligned to the ledge yet;
  - no ragdoll (a stretch goal; agree it with the engine).
- **Lip-sync and talking:** talk gestures exist; lip-sync is not done (jaw joint and expression
  targets are available).

## Next
1. Write the lineup critique against the reference photos (after captures). Then: a reduced
   Low download, impostors, a ledge-aligned climb, ankle pitch for heels, and lip-sync from
   text timing.
2. Consume `content/npc_archetypes/*.json` (53 archetypes). `npc.strip_worker` must vary in
   background and is never costumed or framed sexually.
3. **Scope added by oversight (backlog, in priority order):**
   - Boundary roles: film-crew PA, utility crew and barricade cop outfits, and wave-off
     (done: `wave_off`, `wave_off_bullhorn`).
   - Combat set: aims and recoil, reloads, melee, cover, hit reactions by region, limps,
     death/ragdoll blending, surrender, cuffing, firing from vehicles.
   - Chase, arrest and car theft: tackle, cuffing, back-seat placement, slim-jim, window
     smash, hot-wire, carjack variants, vaults, fire-escape ladders, gun jam, injured
     locomotion, believable concealment.
   - Animals: pigeons (VAT flocks), rats, cats, dogs, police horse with rider.
   - Cutscene performance: facial animation, lip-sync for close-ups, hand-off to the UI and
     cinematics timeline.
   - Grooming changes per lead (hair, sideburns, moustache, beard); tattoos.
   - Stamina locomotion (winded, hands on knees) and drunk locomotion.
   - At-home idles per lead: sleeping, hot plate, TV, changing, Nick's bills, Delphine
     sewing, Teddy cleaning a revolver.
   - Interiors: counters, booths, working behind counters, door opening, leaning in
     doorways, tight-space locomotion.
