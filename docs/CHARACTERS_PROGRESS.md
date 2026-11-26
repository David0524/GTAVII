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
| Faces | **User decision: Rocketbox for leads and nearby people.** Leads wear altered Rocketbox-based heads (feature deformations, recolour); the near ring (Medium+) gets matched pool heads (30); distant crowds and Low keep our heads; every body has MakeHuman CC0 skin detail |
| Heroes | Teddy, Delphine and Nick from the narrative appearance sheets (7fffd4f), wardrobe sets per act; 2 draws each |
| Crowd | GPU-instanced templates (baked half-float bone atlas), LOD2/LOD3, a worker-built near ring of full characters, per-agent colour variation, hand carts |
| Test scenes | `?characters=1&scene=lineup|leads|course|slide|crowd|shoes|hair|street|rocketbox` (deterministic with `&t=`); `street` runs the crowd on a real street of the engine's city. All shots: `bash tools/characters/shots.sh` |
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
Real-device numbers are still needed (the user tests on an iPhone). Every shot and its JSON report
is reproducible with `bash tools/characters/shots.sh` (URLs listed there).

**Heroes (LOD0)**, after Block A (shoes, hair cards, buttons):
- Triangles: main about 17.8k (shoes about 3.3–4.5k of it) + hair 2.2k (afro) to 7.6k (long
  straight, bob) = **20–25.4k**, within the 20–30k budget. 2 draws.
- Per-frame update: **0.05–0.09 ms avg, 0.06 ms p95** (`tools/characters/scratch/cpu.ts`). Budget 0.3 ms.
- Build at spawn: about 45–170 ms (assemble; card hair and the shoe loft added about 30 ms), main thread.

**Pedestrians (LOD1, lineup):** 9.0–10.5k triangles including hair, 2 draws.
**Crowd LODs:** LOD2 about 3.4–4.5k (shoes about 0.3–0.7k); LOD3 about 1.5–2.3k (shoes about 150–380).

**Crowd: 400 agents, High (`19_crowd_400_high`, 145 frames, measured with nothing else running)**
- `setAgents` CPU: **0.39 ms avg, 1.1 ms p95** (budget 1.5 ms), including 10 near-ring characters.
- 74 draws, about 554k triangles in view (10 near, 46 mid, 158 far, 186 culled); 33 templates.
- (A run during other CPU load measured 0.63/1.4 ms; the clean number is the one above.)

**Crowd: 120 agents, Low (`20_crowd_120_low`)**
- `setAgents` CPU: **0.20 ms avg, 0.5 ms p95**. 18 draws, about 96k triangles; near ring of 2 at LOD2.

**Crowd on a real street (engine city, West 22nd Street at 13:30, `24`–`26`)**
- 140 agents, eye level, High: **0.46 ms avg, 1.4 ms p95**, 65 draws, 368k tris.
- 400 agents from 6 m, High: **0.43 ms avg, 0.9 ms p95**, 65 draws, 760k tris (158 mid-LOD in view).
- 120 agents, Low: **0.24 ms avg, 0.9 ms p95**, 25 draws, 224k tris.

**Foot sliding** (`npx tsx tools/characters/measure-sliding.ts`; ankle drift while planted, 3 bodies
× 3 crowd speeds; re-measured after heeled shoes pitch the foot):

| Speed | Raw stride match (no IK lock: instanced crowds) | Near characters (IK lock) |
|---|---|---|
| 0.8 m/s | 30–110 mm/s | 1–7 mm/s |
| 1.3 m/s | 110–165 mm/s | 8–17 mm/s |
| 1.75 m/s | 160–210 mm/s | 17–28 mm/s |

**Downloads** (re-measured after the faces block)
- **High:** body 6.9 + anims 0.97 + fabric maps 0.26 + skin detail 0.15 = 8.28 MiB at start, plus
  the three lead heads, 0.83 MiB, preloaded = **9.12 MiB**. The near-ring pool, 30 heads of 79–342
  KiB (mean 187), loads only on demand; if every one of them were fetched, the worst case is
  **14.59 MiB** (budget 15). In practice the 10-person near ring needs 10–20 heads per area.
- **Mobile Low:** body_low 0.95 + anims 0.97 + fabric maps 0.07 + skin detail 0.02 = **2.01 MiB**
  (budget 6; oversight's target was about 2 MiB). No Rocketbox heads on Low.

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

## Rocketbox evaluation (user-approved, via oversight; superseded by the faces block below)
**Question:** would Microsoft Rocketbox avatars close the realism gap? (`27_rocketbox_ab`,
`28_rocketbox_faces_ab`; scene `?characters=1&scene=rocketbox`.)
- **Licence:** MIT (repo `LICENSE.md`; README "November 2020 License Update"). Redistributable in
  a web game with the notice shipped. Full text in `docs/CHARACTER_SOURCES.md` §6. Adults only; the
  library's `Children` folder was never fetched.
- **What was built:** the head (skin, eyes, teeth, lashes and hair cards) of three adults
  (Male_Adult_12, Male_Adult_03, Female_Adult_11), fitted onto our parametric body by eye
  midpoint and interocular distance, skinned to our Head/jaw/eyes/neck, the body's skin tone set
  from the face texture, dressed in our 1974 wardrobe. Each stands beside the same seed, outfit and
  tone with our own head.
- **Result: the faces are far better.** Real eyes with wet highlights, visible ageing (Male_03),
  photographic skin, believable hairlines. Our heads read as mannequins next to them. The gap is
  almost entirely the face's *texture* (2K photographic albedo and normal maps); the geometry is
  low (about 3k triangles per head versus our full-resolution head).

| | Rocketbox head (hybrid) | Our head |
|---|---|---|
| Triangles (LOD1 pedestrian, whole person) | 8.2k–9.6k | 9.4k–10.3k |
| Draws | 2 (no cards) or 3 (hair/lash cards) | 2 |
| Download per head | 0.72 / 1.20 / 1.61 MB (0.3–0.5 MB possible: 512² opacity, quantised mesh) | 0 (generated) |
| Build | 50–185 ms (same assembly; our hair skipped) | 105–170 ms |
| Blinks, jaw, lips | facial bones exist (unused yet) | jaw + expression targets |

**Recommendation: hybrid for the near ring, not a switch; the leads stay ours. This is the
user's decision (base-mesh choices are theirs).**
- **Don't switch.** Rocketbox is about 40 fixed adult bodies wearing baked modern clothes, with
  no body morphs. A switch would lose the parametric variety (build, age, height) and the garment
  system, which is cut from MakeHuman's topology and helpers.
- **Hybrid (Rocketbox heads on our bodies) for the near ring and close pedestrians:**
  - a large visual gain;
  - CPU unchanged;
  - about 0.5–1 MB per head on High (a pool of 12–16 heads is about 6–12 MB, inside the 15 MB High
    budget);
  - Low keeps our heads (Low stays at 1.99 MiB).
  - **Costs to fix first:**
    - a texture array or atlas to get back to 2 draws;
    - matching body skin to the face (the tone is sampled, but the albedo detail doesn't
      continue onto the neck and hands; the seam hides under collars, not under crew necks);
    - only about 40 faces, so repeats in a long session;
    - hats were sized for our heads.
- **The leads stay ours** (or need bespoke textures): their faces come from narrative appearance
  sheets, and Rocketbox faces are fixed. *Risk to flag:* Rocketbox faces are artist-made, and we
  can't verify that none resembles a real person, which the brief forbids for anything we ship.
- **Cheaper parallel route** (suggested next, not done): MakeHuman's own CC0 skin textures (and
  our own baked albedo/normal detail) map onto our existing UVs. That would close part of the gap
  for everyone, including Low and the leads, without a second asset family.

## Faces block (user decision: "Rocketbox for leads + nearby people")
Shots: `27_rocketbox_ab` (each lead: Rocketbox-based head beside our head), `28a`–`28f` (head
close-ups of the same), `29_pool_heads` (generated pedestrians with matched pool heads), `30_neck_seam`,
leads `04`–`09` and the street `24`–`26` (near-ring heads); the leads beside the references:
`04_leads_act1_vs_refs`.

**What was built**
1. **Leads:** Teddy, Delphine and Nick get Rocketbox-based heads altered to their sheets, not
   stock faces (bases, edits and the likeness note: `CHARACTER_SOURCES.md` §6).
   - Landmark deformations (nose, jaw, cheeks, brows, eyes, lips), then Lab recolour of the skin
     and hair to the sheet hex.
   - **2 draws per lead:** the head is merged into the hair draw; the hair material gained a face
     branch.
   - Hair:
     - Delphine: her base's close hair, with the bun compressed onto the skull and its cards
       dropped. Our afroShort shell read as a cap over the Rocketbox skull.
     - Teddy: his base's own crop. Close up it clearly beats our cards, and it fits his sheet
       (near-black side parting).
     - Nick: our cards (his base is bald).
2. **Near ring (Medium and above):**
   - each near pedestrian gets a pool head matched by sex, age band, ancestry weights and hair
     category;
   - tint toward the body's tone, clamped to ±25%;
   - no duplicates among near or pending characters;
   - heads load on demand, and the body is built headless in the worker.
   - Variety comes from tint, our wardrobe, hats and props.
3. **Distant crowds and Low** keep our heads, with **MakeHuman CC0 skin detail** (lips,
   eyelids, brows, pores, ageing) on our UVs for every body:
   - High: 18 skins (age × sex × ancestry);
   - Low: 6, averaged over ancestry;
   - adds 0.15 MiB on High and 0.02 MiB on Low.
4. **Neck seam:**
   - Rocketbox necks are cut on a slant, higher at the nape. A level cut left gaps, and
     stretching the head onto our neck flared at the nape.
   - Now the head's neck edge (height and radius by angle, from its boundary loop) is measured at
     load. Our skin is cut along it and our neck conforms to its radius just below.
   - The last few centimetres of the head's neck take the body colour outright.
5. **Wardrobe fixes asked for in the same decision:**
   - fewer men in dramatic flares: big flares only for some men under 35, otherwise
     straight/slight;
   - older women's set curls: soft dense volume instead of white frizz;
   - shirt collars rebuilt again. The point length was being added to a 46 mm fall, giving
     18 cm leaves. Now the stand sits on the neck (not the trapezius), the fall hugs it, and it
     closes at the throat under a tie.

**Measured**
- Leads: 2 draws each (body + head-and-hair). Heads: Teddy 3.2k triangles, Delphine 3.4k (with
  their own hair cards), Nick 2.9k plus our hair cards; whole-character totals in
  `27_rocketbox_ab.json`. Per-frame CPU unchanged (the head is one more skinned piece).
- Pool heads: 79–342 KiB each, 2.9k–5.5k triangles (23 of 30 with hair/lash cards); our head
  and hair are dropped, so a near-ring pedestrian is still 2 draws (body + head). Crowd timings
  with near-ring heads: see Measurements (`19`, `24`–`26`).

**Honest state**
- Close up, the leads' and near pedestrians' faces are a large step up: real eyes, skin and
  ageing. Delphine's hair is close-cropped and pulled back rather than a natural crop; that's a
  deviation from her sheet, and it stays until a cropped-natural Rocketbox base or authored card
  set exists.
- The neck seam is clean in side and back views. A small tone step remains under some lights,
  because our skin shader and the Rocketbox material shade differently.
- Nick's grey slick hair (our cards) looks noisy up close in SwiftShader shots, which have no
  MSAA, so alpha-to-coverage falls back to dither. Needs a real-GPU check.
- Collars: no longer oversized, but still flat ribbons without a visible roll.

## Known issues (honest)
- **Faces** (our heads, distant crowds and Low): still mannequin-like close up; they're only seen
  at distance now. No blinks or lip-sync yet on any head (Rocketbox facial bones are there).
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
1. Faces block follow-ups: blinks and lip-sync on the Rocketbox facial bones; a real-GPU check
   of card hair; a cropped-natural option for Delphine. Then posture (pockets, contrapposto,
   folded arms), impostors, and a ledge-aligned climb.
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
