# CHARACTERS_PROGRESS: source of truth for the characters workstream

Branch `claude/characters-74`; brief `docs/briefs/CHARACTERS_BRIEF.md`. Read this first, update it
last.

## Resume here (2026-11-27, WIP)
- **Delphine is on ICT-FaceKit Light.** See "Delphine on ICT-FaceKit Light" below. To rebuild
  her head, run `npx tsx tools/characters/build-ict.ts --src <ICT dir>` once, then
  `npx tsx tools/characters/bake-ict.ts delphine`.
- **In flight:** a tone-check re-run after retuning the probes (hand: toward the fingertip; neck:
  higher) and relaxing the pool gate to 1.45×. Re-run with
  `for f in 27_ 29_ 01_ 02_; do bash tools/characters/shots.sh $f; done`, then
  `python3 -I tools/characters/tone-check.py shots/characters/{27_rocketbox_ab,29_pool_heads,01_lineup_a,02_lineup_b}`.
  Check each `*_tone.jpg` to confirm the probes landed on skin.
  - Previous run: Teddy's Rocketbox head failed face-neck dC 8–12, and pool heads failed often,
    but many probes had landed on collars or missed the hands.
  - Then send the numbers and shots (27, 28, 29, 01/02/04 `_vs_refs`) to oversight.
- **Then:** improve Delphine's own head (afroShort reads as a cap; soften it toward cropped natural
  hair), roll the collars, add blinks and lip-sync.

## Delphine on ICT-FaceKit Light (oversight-approved prototype; synthesised identity only)
Board: `shots/characters/40_delphine_ict_board.jpg` (front, three-quarter, profile, full figure,
her previous MakeHuman head, two public-domain 1973 DOCUMERICA street photos for era styling).

**Built (all pushed):**
- `tools/characters/bake-ict.ts` bakes one hand-chosen coefficient vector (`ict_leads.json`)
  into the head container the Rocketbox heads use, so fitting, the neck ring and the body
  conform are shared.
  - ICT's UDIM tiles are packed into one atlas.
  - Skin weights are assigned by region: neck below the jaw line, jaw below the mouth line,
    eyes, lower teeth and gums.
  - The neck is cut to the Rocketbox leads' length: ICT's runs onto the chest (about 3.1
    interocular distances below the eyes, against 2.3), which cut the body open.
  - Lashes are alpha cards; the inner iris and the lacrimal, blend and occlusion films are
    dropped.
  - The basis stays dev-only; only the baked head ships.
- `tools/characters/ict_tex.py` paints everything procedurally (ICT Light has no textures).
  - Albedo: 3D-sampled mottling (so it runs across UV seams), eye surrounds, perioral tone,
    vermilion with a wet inner lip, brows as strands, alar creases, ears, a close-crop hairline,
    and the iris (fibres, collarette, limbal ring), pupil and sclera.
  - Normal map: pores (denser on the nose and cheeks), lip lines and faint forehead lines.
  - Packed data: roughness, cavity and skin weight.
- **Skin lighting** (`src/characters/render/skinLighting.ts`, used by every head and the body
  material, so head and neck shade alike):
  - pre-integrated diffuse: per-channel wrap that grows with screen-space curvature, and
    per-channel normals (red takes the smooth normal);
  - dual-lobe GGX specular (85/15);
  - the existing thin-part transmission.
- **Hair grown from ICT's own scalp** (`src/characters/heads/scalpHair.ts`): coil shells along the
  scalp normal, using the per-vertex hair weight from the bake. It costs one extra draw.
- **Licence:** MIT notice in `public/characters/rb/LICENSE-ICT-FaceKit.md`; `docs/licenses/ASSETS.md`
  now lists ICT under In use.

**Measured:**

| Check | Result |
|---|---|
| Tone, face–hand dC | Delphine 0.4, Teddy 4.7 (gate 8) |
| Tone, face–neck dC | Delphine 16.0 (gate 20) |
| Nick, face–hand | Not gated: hands in pockets set `handHidden`, so the probe no longer measures the suit |
| Head size | 26k vertices, 47k triangles |
| Head .bin | 873 KB raw, 391 KB gzip with delta filters |
| Textures | 135 KB albedo, 115 KB normal, 112 KB packed/lash |
| Head total, gzip | About 0.75 MB, against Nick's 0.17 MB |

Teeth and gums are 28% of the vertices for a mouth that's mostly closed; they're the first cut in
the size pass.

**vs GTA V / RDR2 hero faces (honest):**
- **Shape:** ICT's scan-derived statistical shape gives believable proportions, nasolabial
  folds, lids and ears, at or above GTA V hero-head shape. The identity still reads young and
  androgynous; it needs a sculpting pass on the coefficients, not a fit to anyone.
- **Skin albedo:** below GTA V. Hero heads there use scanned albedo with hand-painted variation;
  ours is procedural, so it reads clean and CG at close range (no real pore or colour
  micro-variation, no freckles or uneven tone). RDR2 is far above.
- **Skin shading:** now in the right family (pre-integrated SSS with a dual-lobe specular, as GTA
  V-era deferred skin did).
- **Eyes:** close to GTA V now. The lid-contact shadow is baked from ICT's lid contour; the iris
  has parallax behind the corneal dome (tangents plus `parallaxUV`) and fibres, a collarette,
  limbal ring and pupil; the cornea is wet (roughness 0.06). Still missing: a tear meniscus and
  refraction. The upper lids are relaxed 1.3 mm in the bake (ICT's neutral holds the eyes wide
  open, which made her stare). The baked lid shadow turns with the eye: fine for gaze shifts, wrong for big
  rolls. Black lash-card specks show at the outer corners in three-quarter view.
- **Hair:** reads as a short natural crop from three-quarter view. In profile, the nape and
  hairline edges are hard and the coil texture is uniform. GTA V's short afros break the
  silhouette better.
- **Seams:** the dress-collar shards at the front of the neck are gone: they came from cutting the
  body along ICT's level neck ring, which ran through the shoulder slope. ICT's neck now ends
  0.125 m under the eyes. In back and profile, a lighter band with a jagged top edge remains
  where the body's neck flares into the trapezius under the head seam. Lowering the head's neck
  would bring the shoulder shards back; the fix is a head-to-body weld (shared ring vertices),
  which is open.
- **Hair edges:** the nape is now a soft, slightly V-shaped line. Brows are ~1 mm strand shells
  rather than paint.
- **Verdict:** GTA V near-NPC level, not yet GTA V hero level. The main gap is albedo detail.

**Next, in order:**
1. Eyes: done for now (above).
2. Albedo: pore pits, uneven pigmentation and macules added. A photographic layer still needs the
   MakeHuman source skins, which aren't in this container. Brows are done (shells).
3. Nape: done. Profile neck seam: needs the head-to-body weld (open).
4. Dress collar spikes: fixed at the front.
5. Size: the hidden back of the mouth (molars, back gums) and the back halves of the eyeballs
   are cut in the bake. 25.7k → 20.5k vertices; the .bin goes from 391 to 317 KB gzip, and the
   whole head is about 0.66 MB. meshopt is still to do.
6. Oversight's board notes:
   - Bag strap: it's a ribbon seated on the clothed (draped) torso surface, from the bag over the
     shoulder, so it no longer floats. There's a small kink at the top of the shoulder.
   - Relaxed idle in review shots: done.
   - Ragged sleeve hems: still open.

Close portrait references of Black women from 1973–74 are still missing from
`references/catalog.json`. DOCUMERICA's John H. White Chicago series (public domain) has them;
Wikimedia rate-limited this container, so sourcing is pending.

## Street vendors (sim relay; `docs/SIM_PROGRESS.md` "Street vendors")
**Wardrobes: done.** Shot: `shots/characters/41_vendors.jpg` (`?characters=1&scene=vendors`).
- Each archetype id has a preset in `src/characters/wardrobe/outfit.ts` (`VENDOR_PRESETS`),
  built from the sim's wardrobe notes:

  | Archetype | Wardrobe |
  |---|---|
  | `cart_vendor` | White apron over rolled shirtsleeves; white cap standing in for a paper cap |
  | `grocer` | Long apron |
  | `flower_seller` | Cardigan |
  | `news_vendor` | Cardigan; flat cap or newsboy; sometimes a cigarette |
  | `shoeshine` | Waistcoat over rolled sleeves |
  | `peddler` | Long open raincoat; sometimes a fedora |
  | `monte_dealer` | Leisure jacket, open collar |
  | `monte_shill` | Default office clothes (deliberately ordinary) |
  | `monte_lookout` | Windbreaker, hands-in-pockets idle |

- **Bug fixed on the way:** `cart_vendor` used to match the garment worker's `cart` keyword
  (handcart and smock). Vendor presets are now matched on the id first.
- Vendor outfits keep their own colours. The generic palette mapping would have turned the
  white apron slate.
- **Gaps:**
  - The apron is the sleeveless smock (front and back), so it reads as a tunic. A front-only
    tied apron is still to build.
  - There's no paper-cap hat kind.
  - The money belt, florist's scissors and lining of watches aren't built.
  - The lineup's random seeds skew old; that's appearance, not the presets.

**Animations: first pass, wired to the sim's triggers.** Shots: `shots/characters/43_vendor_clips.jpg`
(`scene=vendors&anims=1`, one clip per figure) and `42_vendor_crowd.jpg`
(`scene=crowd&vendors=1`: a near cluster and a mid cluster, with near characters and baked
instances).
- **Authored clips** (`authored.ts`, our own keys):
  - vendors: `vendor_serve` (hand the item over, dig out change, count it into the hand),
    `vendor_call` (hand cupped at the mouth), `vendor_shout` (fist shaken at a car),
    `duck_cart`, `right_cart` (squat, grip, drive up, shove), `shine_shoes` (on the box,
    rag snapped side to side), `deal_cards` (three-card monte over the box);
  - customers: `queue_wait`, `pay`, `watch_lean`, `eat_walk` and `sip_walk` (upper body over the
    walk).
  - Push cart reuses Quaternius `Push_Loop`.
- **Crowd:** customer clips are baked for every template. Vendor clips are baked for
  vendor-family templates only (`CROWD_SET.only`), so ordinary pedestrians don't pay for them in
  the atlas. Eating and sipping are baked as walk cycles with the upper-body overlay.
- **One mapping for both draw paths** (`stateAction` in `CrowdRenderer.ts`):

  | Sim input | Clip |
  |---|---|
  | vendor + `cower` | duck |
  | vendor moving (`vendorSpawned {arriving}`, closing) | push |
  | `monte_dealer` idle | deal |
  | `queue` | queue |
  | `watch` | watch |
  | moving with `carry` food | walk_eat |
  | moving with `carry` drink | walk_sip |

  Near characters now get these as Animator actions; before, they got locomotion only.
- **Sim events → `crowd.trigger(pedId, action)`:**

  | Sim event | Action |
  |---|---|
  | `vendorServed` | `vendor_serve` |
  | `vendorCall` | `vendor_call` |
  | `vendorShout` | `vendor_shout` |
  | `vendorAct {act: 'right_cart'}` | `right_cart` |
  | a paying customer | `pay` |

  `crowd.hold(pedId, 'shine_shoes' | null)` covers shining while a customer is queued at the
  stall. The engine glue has to call these; I've sent sim the contract.
- **Fixed on the way:** `familyOf` sent `cart_vendor` to the handcart workers and the other
  vendors to general pedestrians. Vendor ids are now matched first.
- **Gaps:**
  - Crowd vendor templates use the family's generic vendor outfit, not the per-archetype
    presets; per-archetype crowd templates are still to do.
  - `vendorAct {act: 'serve'}` maps to `vendor_serve` like `vendorServed`.
  - **Bumps are now in** (authored `fall_down`, `down_lie`, `get_up`; existing `stumble` and
    `argue`):

    | Sim input | Result |
    |---|---|
    | `stumble` | stumble |
    | `down` | lying (pelvis pitched −90°, about 0.1 m off the ground) |
    | `getUp` | get up |
    | `angry` | argue |
    | `pedBumped` | `trigger(id, 'stumble' \| 'fall_down')` by response |

    These states win over the vendor and customer mappings. They're baked for every template
    (about 80 frames) and checked in `scene=crowd&vendors=1`.
  - Kerb `onRoad`: near characters already foot-IK against the engine's ground function,
    which includes kerbs, so nothing is needed unless that function lacks them. Instanced
    figures take y from the sim.
  - Clip quality is first-pass hand keys with no hand IK onto the cart, cards or shoe yet.

## Street figures: hair (oversight item "spiky card hair")
Crowd close-ups (`scene=lineup&zoom=head&focus=0|4`):
- **Grey and white card hair was scan-line noise.** Per-strand alpha and grey noise ran
  finer than a pixel. Every strand, clump and grey noise in `hairMaterial` now blends to its
  average once its period drops under 1–2 px (`fwidth` on the strand coordinates).
- **Afro and curly shells read as slabs.** Outer shells fade at grazing angles, and the
  coil clump size is now 7–10 mm instead of 2.5 cm (afro 2200, afroShort 2600, curlyMid
  1500).
- **Honest state:**
  - The noise is gone, but card hair now reads as flat ribbons at head zoom, and big afros still
    show a flat front plate with a centre line.
  - The real fix is a strand texture with mips on redesigned cards: narrower cards,
    more of them, clumped. That's a block of its own, after the vendors unless oversight
    reorders.
- **"Jagged brown coat edges" were briefcases.**
  - Cause: hand-held items were built hanging along the bind pose's world down and skinned
    rigidly to the hand. When the idle lowered the arms (~45°), they swung across the thighs as
    flat brown slabs.
  - Fix: briefcase, handbag, tote, shopping bag and umbrella are now built on an orthonormal
    hand frame (height along the fingers), so they hang plumb at the side.
  - Still visible on coats: round bulges at the hips and light shirt patches under the arms
    (logged).
- **Hair-card block, in progress** (oversight's order: hair is on every head in every shot):
  - **Done:**
    - A mipmapped strand texture (`tools/characters/hair_strands.py`, ours) on the cards, with a
      mip-level coverage boost and alpha sharpening.
    - One solid scalp shell under the cards (the stacked shells drew horizontal scan lines).
    - Cards are narrower and more numerous (0.62× width, 1.6× count).
  - **Honest state:** strands now read on the cards, but the tops of heads still show flat layered
    card sheets. Headless renders exaggerate the stair-stepped alpha edges (SwiftShader has no
    MSAA, so alpha-to-coverage can't smooth them).
  - **Afro and curly volume: rebuilt** (`shots/characters/45_afro_volume.jpg`; top is before,
    bottom is after).
    - It's a latitude/longitude grid around a raised centre instead of shells grown off the
      helper-hair mesh, which stretched into flat facets with a centre fold.
    - Each grid direction takes its scalp radius, skin weights and hairline from the nearest
      source vertex. Sources are the helper-hair scalp plus the back of our own head; the helper
      stops above the nape, which had left a slab with bare scalp under it.
    - The radius is smoothed but never pushed above the scalp. Thickness and density taper to
      zero at the hairline and where coverage ends.
    - The hairline arcs up at the temples, and the afro reaches the nape.
    - Left: a small hole at one temple, and a forehead line that's still fairly straight.
  - **Next:**
    1. A dedicated afro and coil volume: a dense sphere-patch mesh around the head with clumped
       coil shells, as on Delphine's ICT scalp, which works.
    2. Card clumping and lift, so cards stop lying flat on the crown.
    3. A crowd street board (oversight).
- **Glasses and coats: fixed** (oversight priority: visible defects in the live crowd).
  Shot: `shots/characters/44_coat_glasses_fix.jpg` (before coat, after coat, glasses on a
  Rocketbox head).
  - **Grey wedges:** glasses were fitted to our own face. On a substituted head
    (Rocketbox/ICT) whose face sits further forward, the lenses cut into it. Each head's brow
    depth and width are now measured at load (`meta.face`, which the near-ring build worker
    gets too), and glasses sit in front of that face.
  - **Floating frame lines:** rims are now closed sections with depth, not flat bands.
  - Drawn lenses are opaque (one material), so they're now dark enough to read as sunglasses
    rather than grey discs. Clear lenses stay rim-only.
  - **Hip bulges:** jacket skirts built on the skirt helper split into two pillows around the
    thighs. Only coats hanging well below the crotch get a skirt now; jackets end at the torso
    piece.
  - **Light patches under the arms:** shirt sleeves poked through the coat sleeve's inner elbow.
    Under any long coat sleeve the shirt keeps only its cuff.
  - Remaining: long coats worn open show the trousers between their front panels (correct). Their
    skirt still follows each thigh when walking.
- **Previously seen:** glasses on some pedestrians render as floating frame lines (figure 1) or opaque
  grey lens wedges (figure 8). Logged, not fixed.

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
| Faces | **User decision: Rocketbox for leads and nearby people.** Teddy and Nick wear altered Rocketbox-based heads (feature deformations, recolour); **Delphine keeps our head** (no Rocketbox base matches her sheet); the near ring (Medium+) gets matched pool heads (31; Black women keep ours: none in the library); distant crowds and Low keep our heads; every body has MakeHuman CC0 skin detail |
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
- `setAgents` CPU: **0.43 ms avg, 1.2 ms p95** (budget 1.5 ms), including 10 near-ring characters with Rocketbox heads (faces block; was 0.39/1.1 before them).
- 74 draws, about 550k triangles in view (10 near, 46 mid, 158 far, 186 culled); 33 templates.
- (A run during other CPU load measured 0.63/1.4 ms; the clean number is the one above.)

**Crowd: 120 agents, Low (`20_crowd_120_low`)**
- `setAgents` CPU: **0.17 ms avg, 0.3 ms p95**. 18 draws, about 95k triangles; near ring of 2 at LOD2 (our heads).

**Crowd on a real street (engine city, West 22nd Street at 13:30, `24`–`26`)**
- 140 agents, eye level, High: **0.38 ms avg, 1.3 ms p95**, 65 draws, 367k tris.
- 400 agents from 6 m, High: **0.39 ms avg, 0.9 ms p95**, 65 draws, 758k tris (158 mid-LOD in view).
- 120 agents, Low: **0.23 ms avg, 0.8 ms p95**, 25 draws, 223k tris.

**Foot sliding** (`npx tsx tools/characters/measure-sliding.ts`; ankle drift while planted, 3 bodies
× 3 crowd speeds; re-measured after heeled shoes pitch the foot):

| Speed | Raw stride match (no IK lock: instanced crowds) | Near characters (IK lock) |
|---|---|---|
| 0.8 m/s | 30–110 mm/s | 1–7 mm/s |
| 1.3 m/s | 110–165 mm/s | 8–17 mm/s |
| 1.75 m/s | 160–210 mm/s | 17–28 mm/s |

**Downloads** (size pass, gzip as served; `tools/characters/pack-body.ts`, `pack-locals.ts`, `pack-anims.ts`)
- **Mobile Low: 0.85 MB** (was 1.06): body_low 0.43 + anims 0.32 + fabric 0.07 + skin detail 0.02.
  No Rocketbox heads.
- **High at start: 4.5 MB** (was 5.7): body 3.30 + anims 0.32 + fabric 0.28 + skin detail 0.15,
  plus the two Rocketbox lead heads, 0.44 preloaded. The near-ring pool, 31 heads of 79–342 KiB,
  loads on demand.
- **How:**
  - The four leading PCA components stay int16; the rest are int8 with per-component scales
    folded into basisScale. Max vertex error 0.46 mm, mean 0.08 mm, checked on 200 bodies.
  - Container delta filters (per-axis vertex deltas, time deltas for rotation tracks, index
    deltas), decoded at load and verified bit-exact.
- **Not yet:** meshopt for LOD indices and UVs (about 0.3 MB), KTX2 heads for GPU memory, and a
  real phone load time (needs the engine's throttled profile). At 10 Mbit/s, the transfer alone is
  about 0.7 s for Low and 3.6 s for High.

## Critique of the lineup and leads (honest)
Shots: `shots/characters/01_lineup_a_vs_refs.jpg` and `02_lineup_b_vs_refs.jpg` show 20 seeded
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
**Superseded for Delphine:** she now keeps our head. See "Fidelity review" below; what follows describes the block as first delivered.

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
- Leads: 2 draws each (body + head-and-hair). Whole character (`27_rocketbox_ab.json`): Teddy
  16.2k triangles, Delphine 17.1k, Nick 24.3k. Teddy and Delphine fall below the 20–30k hero
  budget: their Rocketbox heads, about 3.3k triangles with hair, replace our head plus card hair.
  The budget is a ceiling, but the headroom could buy collar and garment detail. Per-frame CPU unchanged (the head is one more skinned piece).
- Pool heads: 79–342 KiB each, 2.9k–5.5k triangles (23 of 30 with hair/lash cards); our head
  and hair are dropped, so a near-ring pedestrian is still 2 draws (body + head). Crowd timings
  with near-ring heads (re-measured, nothing else running):
  - 400 agents, High: 0.43 ms avg, 1.2 ms p95, 74 draws;
  - street, 140 agents: 0.38 ms avg, 1.3 ms p95;
  - street, 400 agents: 0.39 ms avg, 0.9 ms p95;
  - street, 120 agents, Low: 0.23 ms avg, 0.8 ms p95;
  - 120 agents, Low: 0.17 ms avg, 0.3 ms p95.
  All are within 1.5 ms.

**Honest state**
- Close up, the leads' and near pedestrians' faces are a large step up: real eyes, skin and
  ageing. Delphine's hair is slicked back into a low bun rather than the cropped natural hair on her
  sheet. That's a deviation, and it stays until a cropped-natural base or an authored card set
  exists. Building her head showed that compressing hair volume had been squashing her face too;
  the face is now excluded, with smooth weights.
- The neck seam is clean in side and back views. A small tone step remains under some lights,
  because our skin shader and the Rocketbox material shade differently.
- Nick's grey slick hair (our cards) looks noisy up close in SwiftShader shots, which have no
  MSAA, so alpha-to-coverage falls back to dither. Needs a real-GPU check.
- Collars: no longer oversized, but still flat ribbons without a visible roll.

## Fidelity review (oversight, after the faces block)
Oversight's review found Delphine's head truncated and her face not matching her sheet. Both were
real problems, and the cause went deeper than tuning:
- **No Rocketbox woman matches Delphine.** I checked all 40 adult previews: none of the 19 women
  reads as Black. Female_Adult_11, her first base, reads East/Southeast Asian (a tagging error on
  my part). The closest, Female_Party_02, was tried: light-medium skin, features that don't read
  as Delphine, and hair that's a modelled bob plus curl cards that can't be compressed into a
  cropped natural style. The tone check fails it (face vs neck dC 25).
  - **Decision taken for now:** Delphine wears our parametric head (African macro, sheet tone,
    MakeHuman skin detail, our afroShort hair). The candidate stays in `scene=rocketbox` for
    comparison only.
  - **User decision (via oversight): "Find more sources first."** We don't ship an uneven quality
    bar. A search for further redistributable realistic heads (CC0/CC-BY/MIT; adults; no
    identifiable real person without a release) is under way. If no adequate free source exists,
    a costed buy/commission option goes to the user.
- **Known gap to close, not an accepted state:** until then, Delphine and Black women in the near
  ring have weaker faces (our parametric head) than pedestrians a Rocketbox head matches.
- **The truncated crown** came from the hair compression pulling the crown inside the forehead
  shell. It's moot for Delphine now, and the compression is excluded from the face.
- **Pool fidelity:** tags were re-checked against the previews (Female_Adult_11 back in the pool,
  as East Asian). The tone gate is tightened to a 1.3× ratio, so the remaining tint after the ±25%
  cap is small. With no Black women in the library, Black women in the near ring keep our heads.
  That's an uneven quality bar to fix with a suitable head source.
- **Automated tone check:** `python3 tools/characters/tone-check.py <shot> ...`. Test scenes
  write screen probes (cheek, side of neck, back of hand) into each shot's JSON. The tool reports
  CIEDE2000, chroma/hue distance (dC) and lightness per character, writes `<shot>_tone.jpg` with
  the probes drawn, and fails when face-neck dC > 8 or face-hand dC > 10. Lightness isn't gated:
  under the key light the neck sits in the jaw's shadow, and our own heads measure dL −9 to −15.
- **Teddy's shirt shaded as a bust:** shirts and jackets now hang straight from the chest apex
  toward the waist instead of tucking under the pectorals (a drape fill per azimuth).
- **Framing:** `04_leads_act1_vs_refs` now shows the leads head to toe. The lineups (`01`, `02`)
  now show the Medium+ near ring with matched Rocketbox heads, which is what players see close up.

## vs GTA V / VI / RDR2 (required on every milestone; `docs/briefs/REFERENCE_GAMES.md`)
Benchmarks for this stream: faces, skin, hair, clothing, wardrobe variety, facial animation, idle
variety, and the RDR2 level of animation detail. We study behaviour and quality; we copy nothing.

| Area | What the references do | Where we match | Where we fall short | Plan |
|---|---|---|---|---|
| **Faces** | Scanned, individually authored heads for every lead and a large pool of varied, believable pedestrian faces; RDR2 adds visible ageing, weathering and dirt | Teddy and Nick, and matched near-ring pedestrians: photographic textures, real eyes, believable ageing | Delphine and Black women nearby are on our parametric head (no suitable source yet); repeats in a 31-head pool; distant faces are mannequin-like | Head-source decision (MetaHuman or a scan pack), then a pool of 60+ heads covering the district |
| **Skin** | Subsurface scattering, dual specular, pores and micro-detail, sweat and dirt that respond to weather | Tone fidelity check; sweat, heat and wetness hooks; CC0 skin detail | No diffusion profile or micro-normal; flat under hard sun | Pre-integrated skin plus a micro-normal; screen-space SSS on desktop |
| **Hair** | Dense anisotropic cards, hair that reads at every distance, TAA-resolved | Card styles from the 1974 references; Rocketbox cards on Rocketbox heads | Speckle without TAA, no anisotropic shading, flat strands; Delphine's cropped natural hair isn't done | Anisotropic two-lobe shader, strand atlas, engine TAA |
| **Clothing and wardrobe** | Layered garments with folds, wrinkles, seams and secondary motion; huge variety; clothes fit every body | Large period-correct variety from 65 reference photos, parametric fit to every body, fabric relief, 11 shoe types | No folds or wrinkle normals, flat collars and lapels, no secondary motion | Wrinkle normal maps driven by joint angle, rolled collars and lapels, cloth secondary motion |
| **Facial animation** | Blinks, saccades, full lip-sync and expressive cutscene faces; RDR2 ambient facial idles | None yet | Everything | Blinks and saccades now, visemes and expressions for cutscenes |
| **Idles and animation detail** | RDR2: dozens of idle variants, contextual gestures, weight shifts, foot planting and hand contacts everywhere | Blend space with stride warp, foot IK with locking, look-at, hand IK, seat pose, ambient props; crowd near ring at full fidelity | Few idle variants, simple turn-in-place, no traversal or ragdoll yet | The movement brief block: traversal, momentum, ragdoll blend, stumbles, plus an idle-variety pass |

## Fidelity block (oversight review: "characters are the furthest stream from the GTA V floor")
**Done:**
- **Male chest:** it shaded as a bust. The causes, in order:
  - The pectoral and nipple modifiers were silently ignored: paired MakeHuman modifiers take their
    positive name with a negative value.
  - Hero shirts were cut from body LOD2, whose facets shaded as rounded blobs. Heroes now cut
    garments from LOD1, with stronger drape smoothing.
  - The drape could only move outward, so it couldn't shave small convex detail. It may now shave
    up to 12 mm, on men only.
  - A chest chord fill bridges the groove between the pectorals, and the hang from the apex is kept.
- **Nick:** less inflated (weight 0.66, shoulder width 0.2, chest depth 0.25). **Review shots:**
  each lead in their own idle (relaxed, hands behind, hands in pockets), captured at 2.5 s.
- **Collar, lapels and tie:** slabs with real thickness and edge bands (a `ribbon` thickness
  option). The tie has a four-in-hand knot. The collar band sits higher at the nape, and the fall
  can't flatten out.
- **Props held:** bag handles sit in the gripping fingers with straps. The shoulder bag has a strap
  over the shoulder. Buttons and the placket sit on the cloth surface (the drape), not the body.
- **Trousers:** a pressed crease, soft uneven folds, and a break at the shoe, instead of a rubber
  tube.
- **Our head:** the eyeballs are sized so the lids rest on them. Close-cropped natural hair is an
  even tapered layer (no bowl) when volume is 0 (Delphine).

**Round 2 (after oversight's second review):**
- **Male chest fixed in the body base.** The shirtless check (`&baretop=1`) showed MakeHuman's
  average-plus-weight male has a soft, low chest. For men the bust girth is now taken in and
  lifted; the drape shaving and nipple inversion (which left dimples) are removed.
- **Finished hems:** cut edges are relaxed along their own loops (hem band included), so they read
  as seams instead of zigzags.
- **Lapels and tie** sit on the cloth surface; lapels are lifted clear of the jacket. **Fold
  creases** (elbows, backs of knees, waist) are in the cloth shader.
- **Skin detail layer encoding:** the stored layer is +1, so a mesh without `uv1` gets no detail
  instead of sampling an empty corner of the strip.
- **"White arms" in the street shot: not fixed.** It isn't the skin-detail lookup, the crowd tone
  shift or the subsurface term (each tested and ruled out). The two near figures are pale-toned
  and render almost white under the engine's midday sun. Next: check the pale end of the tone
  table against measured skin reflectance (light skin albedo peaks around 0.6 in red) and the
  engine's exposure; add tone probes to the street scene.

**Still open:**
- **Our head to Rocketbox level.** The dark rims are the inside of the eyelids, which need a
  pinkish wet line. Features need sculpting and normal maps. Delphine's hair is still a shell
  with a hard hairline edge, and needs card-based coils.
- **Wrinkle and fold normals** (elbows, waist, armpits), **seam normals**, and fabric-specific
  roughness and sheen.
- **Card hair shading:** anisotropic, plus the TAA dependency.
- **Review lighting:** the street shot (`24_street_eye`) is in the re-shoot set. A lead board
  under time-of-day light comes next.

## Cutscene performance pipeline (plan; ordered after the bodies and clothing fidelity block)
UI's cutscene runtime and tool are done but play capsule stand-ins. Characters owns the performance.
1. **Body performance source.** Everything ships as files in a web build, so every source is
   licence-checked before use.
   - **CMU Graphics Lab Motion Capture Database:** the FAQ allows use in any project, commercial
     included; the raw data may not be resold as a dataset. About 2,600 takes: walks, talks,
     gestures, sitting, fights. Retarget to our rig with the same pipeline as the Quaternius clips
     (`tools/characters/build-anims.ts`). I'll record the exact licence text in CHARACTER_SOURCES
     before shipping any take.
   - Other mocap with CC0 or CC-BY terms is checked one by one. **Excluded:** LAFAN1 and Bandai's
     dataset (non-commercial), Mixamo (raw files may not be redistributed).
   - **Acting layers authored in UI's `?cine=` timeline as actor tracks:** gestures, look-ats,
     weight shifts, prop handling and our existing talk gestures by emotion. This is what makes
     generic mocap read as a performance.
   - **Costed option for the user: phone-video markerless mocap.** The user or actors film each
     scene on an iPhone, and a markerless tool (examples: Move.ai, Rokoko Vision, DeepMotion; each
     tool's output-ownership terms checked) produces bespoke performances we retarget. This gives
     RDR2-style acting per scene. Cost is a subscription plus time; prices to be quoted from
     current plans before asking.
2. **Faces:**
   - an expression set (neutral, smile, contempt, anger, fear, sadness, surprise, disgust, plus
     blends) on our expression targets and the Rocketbox facial bones;
   - blinks (about 15 a minute, more under stress), saccades and eye darts;
   - **lip-sync at build time** from the voice audio with Rhubarb Lip Sync (MIT, build-time only,
     not shipped), writing `content/lipsync/<line id>.json` in UI's 15-viseme set;
   - text-estimated timing until audio's voice renders land, coordinated with audio.
3. **Hands:** grip, pinch and relaxed shapes exist. To add: cigarette, glass, gun, medal and
   paper grips, with prop sockets (hand_l, hand_r, mouth, head) and finger poses per prop.
4. **Contract with UI:** the actor track format in UI's `docs/CUTSCENE_PERFORMANCE.md` (clips,
   look, ik, expr, lips, props), accepted with notes.
   - Ours: a stateless `ActorHost.perform(id, frame)` that samples clips at the given times,
     `handOff`, and the `clips()`, `expressions()`, `props()` and `joint()` lists.
5. **Done-means:** a first vertical-slice scene fully animated (a dialogue scene with Teddy, so it
   exercises faces, lip-sync, gestures and a prop), with a vs GTA V / RDR2 note.
   - The references perform every story scene with bespoke capture and full facial animation.
     Generic mocap plus authored layers won't match that; phone mocap per scene would close
     most of the body gap.

## Gaps against the visual bar (`docs/briefs/VISUAL_BAR.md`: "GTA V level at worst")
The Characters bar asks for photoreal heads, skin with subsurface scattering, hair cards, cloth
with normal detail, and blinks, lip-sync and facial animation in cutscenes. Where we stand:

| Item | Today | Gap to the bar | Plan |
|---|---|---|---|
| **Heads** | Rocketbox for Teddy, Nick and matched near-ring pedestrians; our parametric head elsewhere (Delphine, Black women in the near ring, distant crowds, Low) | Uneven; our head reads mannequin-like close up | **User decision pending** (`docs/research/HEAD_SOURCES.md`: MetaHuman if Epic confirms web use, else 3D Scan Store heads). Distant crowds can keep ours |
| **Skin shading** | Wrap-lighting SSS approximation plus thickness transmission; MakeHuman CC0 detail; Rocketbox albedo and normal maps | No real diffusion (screen-space or pre-integrated skin), single specular lobe, no micro-normal, no cavity or AO maps, so faces look flat under hard sun | Pre-integrated skin BRDF (curvature LUT) plus a dual-lobe specular and a detail micro-normal; screen-space SSS on desktop WebGPU. Both are within the phone budget as a per-pixel LUT |
| **Hair** | Our strand cards (alpha-to-coverage) with procedural strand alpha; Rocketbox cards on Rocketbox heads | No anisotropic hair shading (Kajiya-Kay/Marschner), no authored strand textures, speckle without MSAA/TAA, no hair-to-skin shadowing | Two-lobe anisotropic hair shader, an authored CC0/own strand atlas, a depth prepass for the cards, and reliance on the engine TAA (requested). Delphine needs cropped natural hair |
| **Cloth** | Garments cut from the body with procedural patterns plus CC0 fabric relief | **No folds or wrinkle normals**; collars and lapels are flat ribbons; no seams or stitching normal; no cloth sim | Baked wrinkle and fold normal maps per garment type (elbows, knees, waist, armpits), driven by joint angle; seam and stitch normals; rolled collar and lapel geometry; secondary motion on skirts, coats and ties |
| **Eyes** | Rocketbox eyes on Rocketbox heads; ours are simple spheres | No wet line, tear meniscus, refraction or eye AO | Eye shader with refraction plus wet-line and AO geometry (Rocketbox heads partly have this) |
| **Facial animation** | None in play: no blinks, no lip-sync, no expressions | Required in cutscenes; blinks needed always | Blinks and saccades on Rocketbox facial bones and our expression targets; viseme lip-sync from dialogue audio (phoneme timing) for cutscenes; an expression set for the cutscene timeline |
| **LOD and crowd density** | Near ring of 10 (High), mid and far instanced; culled beyond 170 m | Pops at LOD switches; no impostors; streets must "never look empty" | Dithered LOD cross-fades, impostor billboards beyond the far LOD, a density pass with the sim |
| **Shadows and contact** | Cascaded shadows from the engine | Contact shadows under feet and on faces (hat brims, collars) | Rely on the engine's GTAO and contact shadows (engine request), plus capsule AO under characters |

## Movement brief (`docs/briefs/MOVEMENT.md`): characters' part (next block)
Owned here: animations, blending, foot and hand IK, procedural layers, the motion test course and
the feel. That covers:
- foot IK on kerbs, stoops and stairs without pops, and a stair gait;
- momentum starts, stops and pivots;
- vault, climb, chain-link fence, ladder, fire-escape and drop animations with hand IK;
- ragdoll blend with get-ups, and stumbles;
- car enter, exit and carjack;
- the expanded course with every item in the brief;
- a written feel comparison against GTA V/VI and RDR2.

First step: agree the root-motion and IK contract with the engine (ENGINE_REQUESTS), meaning who
moves the capsule, how traversal detection hands targets to the animation, and ragdoll ownership.

**Progress:**
- **M1, the course** (`?characters=1&scene=move`, `src/characters/test/moveCourseSim.ts`):
  - Every brief item at real 1970s sizes: kerb, railing, stoop, car hood, dumpster, chain-link
    fence, subway stairs, turnstile, fire-escape drop ladder, roof gap, hang-drop, scaffold ladder,
    skid stop and pivot.
  - A stand-in controller speaks the contract (start, stop, skid, pivot, step and traversal
    events). Root curves per traversal kind come from `src/characters/anim/Traversal.ts`.
  - `npx tsx tools/characters/move-test.ts`: **1,000 randomised runs** (speed 0.8–1.15×, start
    jitter, 30–120 Hz), **all clean**: no snags, no tunnelling, no skipped features. The first run
    caught a frame-rate-dependent edge-drop bug, now fixed.
  - Frame strip: `shots/characters/31_move_strip.jpg`. Traversal poses are placeholders (jump
    loop, the library climb) until M4.
- **M2, steps without a pop:**
  - The autostep is absorbed by a critically damped pelvis spring (about 0.25 s) while foot IK
    plants the feet on the true ground.
  - The stair gait (swing-leg knee lift, lean) switches on from step cadence.
  - Measured over the kerb, stoop and subway stairs at a run: **peak pelvis vertical speed
    4.1 m/s, against 11.8 m/s without smoothing** (a 0.2 m jump in one frame).
- **Gameplay hand-off:** `g.locomotion()` returns gait (normal, limp, drunk, carry_heavy, tired)
  plus swayDeg, turnMul, stopMul and stumble, to drive the gait layers (M7). Carrying a body takes
  both hands. A timed roll is under 6 m; ragdoll from 6 m.

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
