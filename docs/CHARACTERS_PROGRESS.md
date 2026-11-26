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
| Garments | Cut from body/helper surfaces; collars rebuilt (stand/fold/fall, worn over lapels without a tie), plackets and buttons, jacket buttons; trouser legs are straight tubes with a tilted hem that breaks on the shoe; offsets layered relative to the shirt |
| Shoes | Per-type generator (`build/shoes.ts`): oxford, wingtip, loafer, sneaker, work boot, boot, platform, pump, slip-on, sandal, clog; lofted around the wearer's measured foot; welts, shanks, heel blocks, wedges, laces, brogue lines, aprons, straps; heels pitch the foot in the bind pose |
| Hair | Strand cards (alpha-to-coverage) for 14 straight/wavy styles, combed by per-style geodesic flow fields over a radial head map, on solid volume shells; clumped Worley shells for afros and curls; set-curl bumps; ponytail/braid/bun pieces; crowds keep the opaque outer shell |
| Skin, cloth, hair materials | TSL: SSS approximation, procedural patterns, wear/sweat; CC0 Poly Haven fabric scans as triplanar bump detail (wool, denim, jersey, poplin, corduroy, leather) |
| Animation | Animator (blend space with stride warp, layers, posture, lean), foot IK with locking, look-at, hand IK, seat pose, events |
| Heroes | Teddy, Delphine and Nick from the narrative appearance sheets (7fffd4f), wardrobe sets per act |
| Crowd | GPU-instanced templates (baked half-float bone atlas), LOD2/LOD3, a worker-built near ring of full characters, per-agent colour variation, hand carts |
| Test scenes | `?characters=1&scene=lineup|leads|course|slide|crowd|shoes|hair|street` (deterministic with `&t=`); `street` runs the crowd on a real street of the engine's city. All shots: `bash tools/characters/shots.sh` |
| Integration | API in `src/characters/index.ts`; engine wiring requested in ENGINE_REQUESTS ("From characters: 3") |

## Architecture
```
tools/characters/  build-body.ts (MakeHuman → body.bin)  build-anims.ts (UAL → anims.bin)  shot.ts (screenshots)
                   lib/ io.ts (zip/npy/obj/glb readers), linalg.ts (Jacobi eigen), simplify.ts (QEM LODs)
src/characters/    rig.ts (56 joints, UAL names), format.ts (T74X container), index.ts (factory API)
  body/            BodyModel (evaluate shape), macro.ts, appearance.ts (who someone is), skeleton.ts
  wardrobe/        outfit.ts (1974 generator), palette.ts, describe.ts (witness/shop data)
  build/           fields.ts (limb/height/azimuth fields), clip.ts (iso-line cutting), garments.ts,
                   face.ts (landmarks + masks), hair.ts (shells), hairCards.ts (strand cards, head map),
                   shoes.ts (shoe generator, foot pitch), accessories.ts, assemble.ts, MeshBuilder.ts
  render/          materials.ts (character + hair TSL), meshes.ts
  anim/            AnimLibrary.ts (sampling/blending), authored.ts (hand-keyed clips), Animator.ts, IK.ts
  crowd/           CrowdRenderer.ts, bake.ts, crowdMaterial.ts, buildWorker.ts
  Character.ts, heroes.ts, test/CharactersTest.ts, test/StreetTest.ts (engine city, read-only)
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
- **Shoes are their own geometry, not a reshaped foot.** The foot is measured per slice and the
  shoe lofted around it (so it always encloses the foot), skinned by copying the nearest foot
  vertex's weights. A heel pitches the foot about the ankle in the bind pose with the body's own
  skin weights (toes stay flat), so animation and foot IK work unchanged on the pitched rest pose.
- **Hair flow uses geodesic attractors, not projected world directions.** Projecting "backward"
  onto the forehead's tangent plane leaves only "down", which combed hair over faces. Attractor
  targets are never near-antipodal to the roots they act on. Hair also never crosses the eyes
  (cards stop at the brow in front of the ears).
- **Full-length trousers stop following the foot below mid-calf:** the leg becomes a straight
  tube continuing the shin, calf-skinned, cut by a hem plane that is higher in front (the break
  on the vamp). This replaced hems cut along the leg chain, which wrapped onto the foot.
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

**Block A (oversight review of 2026-11-26), item by item: what changed, what still fails**
1. **Hair.** *Changed:* strand cards (alpha-to-coverage) for 14 straight and wavy styles, each
   combed by its own flow field (side part sweeping across the top, pompadour lift, feathered
   wings, bob ends under, flip ends out, ponytail/braid/bun pieces), on solid volume shells, with
   one hairline shared by cards, shells and the scalp tint (temples, sideburns, above the ears,
   nape). Afros and curls are clumped shells rising from the hairline; set curls have roller
   bumps. Hair never crosses the eyes. *Still fails:* at lineup distance the shells under the
   cards still speckle (no TAA in these captures); grey and white coily hair shows dark gaps at
   the silhouette; card strands are a procedural alpha, not authored strand textures, so close
   up they read as wisps rather than hair. A one-shot cards-only captured texture atlas is next.
2. **Garment construction.** *Changed:* collars are stand, fold and fall with the true leaf
   length, and are worn over the lapels without a tie (21 and 06: the 1974 open-collar look);
   shirt plackets and buttons; jacket and coat buttons; trouser legs are straight tubes below
   mid-calf with a hem plane that breaks on the shoe's vamp; flare is graded per garment; CC0
   fabric scans add weave relief. *Still fails:* still no cloth folds (drag lines, baggy seats,
   jacket drape); lapels are still ribbons (better than before, but no roll line or notch
   thickness); cuffs are a hem band, not a turned cuff; some light trousers pinch inward at the
   hem band; with a tie under a jacket, the collar points can z-fight the lapels.
3. **Shoes.** *Changed:* a per-type generator (21): oxford with toe cap, wingtip with brogue
   lines, loafer with apron and saddle, canvas sneaker with toe cap and heel overlay, work boot,
   boot (ankle or knee shaft), platform (with ankle strap), pump (U throat, block heel), slip-on,
   sandal (vamp and ankle straps, bare toes), clog (wedge). Heels pitch the foot in the bind
   pose. Foot sliding is unchanged (1–28 mm/s locked). *Still fails:* boot shafts are cut from
   the leg surface (tight, a little stocking-like); shoe leather is smooth (no creasing at the
   ball); laces are flat ribbons.
4. **Hands.** *Changed (previous commit):* relaxed curl on anatomical axes, FK-solved arm hang,
   props gripped (bag handles, briefcase, cigarette pinch), paper under the arm. *Still fails:*
   thumbs are stiff; no per-prop grip poses beyond relaxed/grip/pinch.
5. **Faces.** *Not started in this block:* the eye rims are still dark, skin is still plastic
   with no visible ageing, and there are no blinks. This is the next block.
6. **Posture.** *Not started in this block:* everyone still stands the same way (pockets,
   contrapposto and folded arms are next, after faces).
7. **Nick's suit.** *Changed:* the shirt fit and the jacket's stacked offsets are reduced (the
   sleeve sat about 5 cm off the arm; now about 2 cm). *Still fails:* padded shoulders are still
   rounded rather than square.

**Other honest notes**
- The `geometric` print had become concentric rings that read like a well-known retail logo; it
  is now a staggered diamond lattice.
- The lighting in the lineup and lead shots is a neutral test rig; `24`–`26` use the engine's own
  atmosphere on a real street (West 22nd Street at 13:30).

## Known issues (honest)
- **Faces** read as "game" faces: dark eye rims, no wet-line geometry, no blinks, little visible
  ageing (next block).
- **Hair:** shell speckle without TAA; procedural strand alpha on cards (no authored strand
  textures); grey coily hair shows dark gaps.
- **Cloth:** no folds; lapels are ribbons; boot shafts hug the leg.
- **Skirts and coat tails** follow MakeHuman's helper weights: the legs poke through at long
  strides.
- **No impostors** past 170 m (High); agents beyond are culled.
- **The crowd near ring** builds over a few frames when someone walks into range.
- **Animation:** turn-in-place is a simple stepping layer; strafe is basic; stairs rely on foot
  IK only; the ledge climb isn't aligned to the ledge; no ragdoll yet.
- **Lip-sync** isn't done (jaw joint and expression targets are available).
- **Hero builds** are synchronous at spawn (about 60–170 ms with cards and shoes); move them to
  the worker before gameplay spawns heroes mid-scene.

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
