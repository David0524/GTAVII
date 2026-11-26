# CHARACTER_SOURCES: every character asset, where it came from, its licence and our edits

Rule (CHARACTERS_BRIEF): assets must be original, CC0, or clearly licensed for redistribution in a
web game. Nothing below is "use in project only". No program code from any source is used.
Only the derived binaries in `public/characters/` are shipped; raw downloads live in
`data/raw/characters/` (gitignored) and are never committed.

## Shipped files

| File | Size | Built by | Derived from | Licence of the inputs |
|---|---|---|---|---|
| `public/characters/body.bin` | 6.9 MiB | `tools/characters/build-body.ts` | MakeHuman base mesh, morph targets, default skeleton joint groups, default skin weights | CC0 1.0 (MakeHuman assets) |
| `public/characters/anims.bin` | 0.97 MiB | `tools/characters/build-anims.ts` | Quaternius Universal Animation Library 1 and 2, Standard tier (39 clips) | CC0 1.0 |
| `public/characters/body_low.bin` | 0.95 MiB | `tools/characters/build-low.ts` | subset of `body.bin` (Low quality) | CC0 1.0 (MakeHuman assets) |
| `public/characters/fabric_{a,b}_{hi,lo}.webp` | 275 KiB (hi, 512²) / 74 KiB (lo, 256²) | see §5 | Poly Haven displacement maps, high-passed and channel-packed | CC0 1.0 |

Everything else is generated at runtime by our own code (fabric *relief* uses the §5 maps): garments, shoes, hats, glasses,
props, hair, eyeballs, skin and cloth shading, the authored animation clips, the crowd bake.

## 1. MakeHuman assets (CC0)
- **Files used:** `makehuman/data/3dobjs/base.obj`, `makehuman/data/rigs/default.mhskel`,
  `makehuman/data/rigs/default_weights.mhw` (raw.githubusercontent.com, repository
  `makehumancommunity/makehuman`, branch `master`), and `makehuman/data/targets.npz` from the
  PyPI wheel `makehuman-1.3.2-py3-none-any.whl`.
- **Licence:** the repository's `LICENSE.md`, section C, "The license for the bundled assets":
  the base mesh and proxies, targets and modifiers, textures, clothes, poses and expressions
  are "released under CC0 1.0 Universal". Section D states that the project claims nothing
  over output made from them. The source *code* is AGPL and **none of it is used**: our
  readers (`tools/characters/lib/io.ts`), macro-weight formulation
  (`src/characters/body/macro.ts`) and everything else are our own.
  - https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md
  - https://creativecommons.org/publicdomain/zero/1.0/
- **Our edits:**
  - kept the body, the tights/skirt/long-hair fitting helpers, eye, teeth and lash helpers; dropped
    the genital and tongue helpers;
  - converted decimetres to metres;
  - compressed the macro (sex/age/muscle/weight/height/proportions/ancestry) space into a
    64-component PCA basis fitted to 600 sampled bodies (holdout error: median 0.6 mm, max 3.2 mm);
  - kept 356 local targets (face, measurements, limbs, asymmetry, expressions) quantised to
    int8, and merged symmetric left/right pairs;
  - remapped the 163-bone skeleton's weights onto our 56-joint rig;
  - built five body LODs and four helper LODs with our own quadric simplifier.

## 2. Quaternius Universal Animation Library 1 and 2 (CC0)
- **Files used:** `Universal Animation Library[Standard].zip` →
  `Unreal-Godot/UAL1_Standard.glb` and `UAL1_Standard_RM.glb`; `Universal Animation Library
  2[Standard].zip` → `Unreal-Godot/UAL2_Standard.glb` and `UAL2_Standard_RM.glb`.
  - Downloaded free from https://quaternius.itch.io/universal-animation-library and
    https://quaternius.itch.io/universal-animation-library-2. Pack pages:
    https://quaternius.com/packs/universalanimationlibrary.html and
    https://quaternius.com/packs/universalanimationlibrary2.html.
- **Licence text (License.txt inside both zips, verbatim):**
  ```
  License:
  CC0 1.0 Universal (CC0 1.0)
  Public Domain Dedication
  https://creativecommons.org/publicdomain/zero/1.0/
  Models by @Quaternius
  ```
- **Clips used (39):**
  - UAL1: A_TPose, Idle_Loop, Idle_Talking_Loop, Walk_Loop, Walk_Formal_Loop, Jog_Fwd_Loop,
    Sprint_Loop, Crouch_Idle_Loop, Crouch_Fwd_Loop, Jump_Start, Jump_Loop, Jump_Land,
    Hit_Chest, Hit_Head, Push_Loop, Sitting_Enter, Sitting_Idle_Loop, Sitting_Exit,
    Sitting_Talking_Loop, Driving_Loop, Interact, PickUp_Table, Fixing_Kneeling, Roll,
    Death01, Punch_Jab, Punch_Cross;
  - UAL2: ClimbUp_1m, Consume, Hit_Knockback, Idle_FoldArms_Loop, Idle_No_Loop,
    Idle_Rail_Call, Idle_Rail_Loop, Idle_TalkingPhone_Loop, LayToIdle, Walk_Carry_Loop, Yes,
    OverhandThrow.
- **Our edits:**
  - retargeted onto our rig (a world-space delta from the source bind pose, with a per-bone
    alignment from their T-pose to our A-pose);
  - resampled to 30 fps and quantised to int16;
  - scaled the pelvis to our proportions;
  - measured root-motion speed and foot-contact phases from the `_RM` files;
  - root motion itself is discarded.
- **The mannequin meshes are not used.**

## 3. Original work (this workstream)
- **Authored clips (`src/characters/anim/authored.ts`), hand-keyed in code:**
  - idles: relaxed, hands in pockets, hands behind the back, heat slump;
  - ambient actions: smoke, light up, read the paper, lean on a wall, fan in the heat, hail a
    cab, sit on a stoop, vendor work;
  - talking gestures for 8 emotions, and argue;
  - reactions: flinch, cower, rubberneck, stumble;
  - locomotion: turn-in-place steps and strafe;
  - boundary roles: wave off, and wave off with a bullhorn.
- **Garments, shoes, hats, glasses, props and hair** are procedural geometry, built per person
  from the body surface.
- **Materials:** TSL shaders (skin subsurface approximation, 1970s fabric patterns, wear, hair
  shells).
- **Wardrobe frequencies and colours:** from `docs/WARDROBE_1974.md`, which studies the
  public-domain reference photos in `references/` (US National Archives, DOCUMERICA; credits in
  `references/catalog.json`). Those photos are references only and are not shipped by this
  workstream.

## 5. Poly Haven fabric scans (CC0)
- **Licence:** CC0 1.0 (https://polyhaven.com/license): no attribution required; credited here anyway.
- **Assets** (1k `Displacement` PNGs from the Poly Haven API, fetched 2026-11-26; scans by colormass, processed by Rico Cilliers):

| Channel | Asset | URL | Used for |
|---|---|---|---|
| a.R | Poly Wool Herringbone | https://polyhaven.com/a/poly_wool_herringbone | suitings, tweeds, checks, plaids |
| a.G | Denim Fabric | https://polyhaven.com/a/denim_fabric | jeans and denim jackets |
| a.B | Cotton Jersey | https://polyhaven.com/a/cotton_jersey | knits and rib |
| b.R | Stretch Poplin | https://polyhaven.com/a/stretch_poplin | shirting, blouses, plain cloth |
| b.G | Ribbed Corduroy | https://polyhaven.com/a/ribbed_corduroy | reserved (corduroy) |
| b.B | Brown Leather | https://polyhaven.com/a/brown_leather | leather grain (shoes, belts, jackets) |

- **Edits:** resampled to 512² / 256², high-passed (periodic Gaussian, σ = 1/64 of the tile, so
  the tiles stay seamless) to remove the swatches' own undulation, contrast-normalised, packed
  into RGB and saved as WebP (q85). Sampled triplanar in bind space at the scans' real size
  (0.27 m tile) as bump height; colour still comes from our procedural patterns.
- **Shared log:** `docs/briefs/ART_ASSETS.md` asks for `docs/ART_SOURCES.md`; that is a shared
  file, so the entry is requested in `ENGINE_REQUESTS.md` (characters 4) instead of edited here.

## 4. Tooling (not shipped)
- three 0.187.0 (MIT) is used inside the build scripts for maths.
- Playwright (Apache-2.0) is used for screenshots.
- No new npm dependencies were added.
