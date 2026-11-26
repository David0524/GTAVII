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
CPU numbers come from this container's CPU: Node/V8 for the offline harnesses, headless Chromium for
the scenes. Rendering here is SwiftShader **software**, so GPU frame times can't be measured.
Real-device numbers are still needed (the user tests on an iPhone).

**Heroes (LOD0)**
- Triangles: about 16.8k main + 2.3k hair on average (max 19.3k + 3.9k); Teddy is 17.3k. 2 draws.
- Per-frame update: **0.044 ms avg, 0.057 ms p95** (walking, foot IK on a 0.15 m curb, look-at;
  `tools/characters/scratch/cpu.ts` harness). Budget 0.3 ms.
- Build at spawn: about 80–110 ms (assemble) + 9 ms (evaluate), main thread.

**Crowd LODs (triangles):** LOD1 (near ring) about 7.2k + 1.4k hair; LOD2 about 4.1k; LOD3 about 1.8k.

**Crowd: 400 agents, High (`19_crowd_400_high`, 145 measured frames)**
- `setAgents` CPU: **0.40 ms avg, 1.2 ms p95** (budget 1.5 ms), including 10 near-ring
  characters.
- 74 draws, about 544k triangles in view (10 near, 46 mid, 158 far, 186 culled); atlas 33
  templates, half-float.

**Crowd: 120 agents, Low (`20_crowd_120_low`)**
- `setAgents` CPU: **0.18 ms avg, 0.5 ms p95**.
- 18 draws, about 94k triangles; 12 templates; near ring of 2 at LOD2.

**Foot sliding** (`npx tsx tools/characters/measure-sliding.ts`; ankle drift while planted, 3 bodies
× 3 crowd speeds):

| Speed | Raw stride match (no IK lock: instanced crowds) | Near characters (IK lock) |
|---|---|---|
| 0.8 m/s | 30–110 mm/s | 1–7 mm/s |
| 1.3 m/s | 110–165 mm/s | 9–14 mm/s |
| 1.75 m/s | 160–210 mm/s | 17–23 mm/s |

- Most of the raw figure is heel and toe roll inside the source clip's broad contact windows; the
  signed (net) drift averages near zero after calibration (`STRIDE_CAL` in Animator).
- Instanced crowds have no IK, so they show the raw figure. It reads at mid and far distance;
  a tighter contact-window measure is next.

**Downloads**
- High: body.bin 6.9 MiB + anims.bin 1.0 MiB = **7.9 MiB** (budget 15).
- **Mobile Low: body_low.bin 0.95 MiB + anims.bin 1.0 MiB = 1.95 MiB** (budget 6). It keeps only
  the far-LOD vertices, 32 shape components and no expressions; Low uses LOD2 for heroes and the
  near ring.

## Critique of the lineup and leads (honest)
Shots: `shots/characters/01_lineup_a_vs_refs.png` and `02_lineup_b_vs_refs.png` show 20 seeded
pedestrians above the DOCUMERICA photos the wardrobe tables came from. `04`–`09` are the leads,
including close-ups. Locomotion frames are `10`–`17`; crowds are `19` and `20`.

**What reads as 1974**
- **Silhouettes and cuts:**
  - high-rise flared trousers with real hem flare, and A-line knee skirts;
  - wide flat shirt collars, wide ties (10–12 cm), short-sleeve dress shirts on men;
  - striped knit tops, a pink pantsuit, pinstripe suits;
  - straw and felt hats on older men, set curls on older women, afros.
  These match the photos (551651, 548399, 551646, 551658).
- **Palette:** camel, rust, navy, cream, mustard, brown and charcoal with occasional red and pink,
  no modern neons. Prints are mostly tonal, matching the photos' mostly sober colour with a few
  loud accents.
- **The street mix:**
  - a full range of skin tones, builds and ages (18–90, adults only), with no single default face;
  - variety comes from continuous parameters, never caricature.
- **The leads** follow the narrative sheets:
  - Teddy: pale khaki short-sleeve shirt, brown slacks, black oxfords, 1.75 m, soft middle;
  - Delphine: oxblood dress, 1.78 m, cropped natural hair;
  - Nick: midnight-blue suit, wide silk tie, cordovan loafers, iron-grey hair, 1.68 m, heavy.
- **Motion:**
  - walk, run and hail-a-cab read clearly, and the relaxed idle has hanging arms;
  - curb and stair foot IK keeps both feet on their surfaces (12, 13);
  - planted feet don't slide on near characters (1–23 mm/s).

**What reads as a modern game, not a 35 mm photo of 1974**
1. **Cloth has no folds.** Garments are offset shells of the body, so nothing creases, bags or
   hangs. The photos are full of drag lines, baggy trouser seats, rolled sleeves and jacket
   drape. Torso smoothing ("drape") removes printed anatomy but adds no folds. *Next:* wrinkle
   normal maps driven by joint angles (elbow, knee, waist), and a hanging-hem offset for
   jackets and coats.
2. **Faces are smooth and same-y up close.**
   - There's no texture detail beyond procedural pores and wrinkles, the eye area is dark, and
     lashes are a solid line.
   - The lineup reads as a cast of mannequins in good clothes.
   - *Next:* per-face albedo variation (blotchiness, shadow under the eyes, lip edges), an
     eyelid/wet-line strip, blinks, and stronger asymmetry and age sculpting.
3. **Hair aliases.** Shells speckle without TAA, and straight hair is helmet-like. Afros and set
   curls are best. *Next:* card strands for long and straight styles, and alpha-to-coverage.
4. **Everyone stands the same way.** It's one relaxed idle. The photos show hands in pockets,
   arms folded, weight on one hip, newspapers under arms and leaning. The pocket and
   behind-the-back idles exist, but their hand placement isn't right yet, so they're off.
5. **Shoes are chunky.** The rounded-last approach reads as a shoe at street distance but is
   bulbous up close. Heels don't tilt the foot, and sandals render as closed shoes.
6. **Small geometry defects:**
   - collars are flat triangles;
   - lapels are ribbon panels;
   - skin can show at the trouser waistband under a tucked shirt;
   - skirts and dress panels split at the hips in a long stride.
7. **The lighting is a neutral test rig.** The real look depends on the engine's 1970s grade,
   grain and halation; nothing here is graded.

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
