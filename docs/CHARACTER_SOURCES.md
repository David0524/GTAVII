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
| `public/characters/skins_{hi,lo}.webp` | 150 KiB / 21 KiB | `tools/characters/build-skins.py` | MakeHuman default skins, detail only (§7) | CC0 1.0 |
| `public/characters/rb/*` | 0.83 MiB leads + 5.5 MiB near-ring pool (on demand; none on Low) | `tools/characters/build-rocketbox.ts` | Microsoft Rocketbox adult heads (§6) | MIT (notice shipped) |

Everything else is generated at runtime by our own code (fabric *relief* uses the §5 maps, skin detail the §7 maps; faces close to the camera are §6 heads): garments, shoes, hats, glasses,
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

## 6. Microsoft Rocketbox (MIT): lead heads and the near-ring pool
- **What:** heads (skin, eyes, teeth, eyelashes and hair cards; WebP colour, normal and opacity
  textures) of **adult** avatars only. The library's `Children` folder is never used.
  - **Near-ring pool** (Medium and above, people close to the camera): 30 heads, `Female_Adult_01–05,
    07–09, 12–15, 17`, `Female_Party_01`, `Male_Adult_01–06, 08–13, 15–17, 20` (512² textures,
    about 5.5 MiB in all, fetched on demand only when a pedestrian needs one). Excluded: heads whose
    mesh includes headwear implausible on 1974 Midtown streets (hijab, burqa, keffiyeh, hood up),
    and the three leads' bases (no pedestrian shares a lead's base face).
  - **Leads** (1024² textures, 0.83 MiB for all three): `lead_teddy` from `Male_Adult_07`,
    `lead_delphine` from `Female_Adult_11`, `lead_nick` from `Male_Adult_14`.
- **Source:** https://github.com/microsoft/Microsoft-Rocketbox (fetched 2026-11-26; blobless
  sparse clone, HEAD of `master`).
- **Licence:** the repository's `LICENSE.md` is MIT; the README says "November 2020 License
  Update: The library of avatars is now released under MIT License" (the older 2020 announcement
  said research and academic use; the MIT update supersedes it). MIT permits redistribution in a
  web game provided the copyright and permission notice ship with it, so a copy is at
  `public/characters/rb/LICENSE-Rocketbox.md` and `index.json` names the licence. Full text:

```
MIT License

Copyright (c) 2020 Microsoft

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
- **Edits (all heads):** head piece extracted by bone dominance; units to metres; bones remapped
  to our rig; vertices welded and quantised; textures resized from 2048² TGA to WebP. At runtime
  each head is fitted to our skeleton (interocular distance, eye midpoint), its skin tone is moved
  toward the generated body's (tint clamped to ±25%), and our body's neck is cut along the head's
  neck edge and conformed to it.
- **Likeness: the leads are altered so each is its own character.** None of the three is a stock
  Rocketbox face:
  - landmark-driven feature deformations, all listed in `tools/characters/rb_leads.json`:
    - Teddy: nose widened and lengthened, jaw broadened, cheeks lowered, inner brows lowered;
    - Delphine: cheekbones raised and widened, eyes set wider, nose wider and less projecting, jaw
      narrowed and lengthened, lower lip fuller;
    - Nick: jaw and masseters widened, nose enlarged, brow ridge heavier, outer brows lowered.
  - Lab colour transfer of skin and hair to each character's appearance sheet (Teddy `#b98a67`,
    hair `#1c1814`; Delphine `#5a3825`, hair `#141010`; Nick `#c8a17e`, hair `#7a7570`).
  - Hair:
    - Delphine: the base's slicked-back hair, with its bun compressed onto the skull and the
      bun's cards removed;
    - Teddy: the base's own short crop (it matches his sheet, a near-black side parting);
    - Nick: our generated strand cards, because his base is bald.
  - Rocketbox avatars are generic library characters, not scans of named public people; the edits
    above are there so that the leads aren't recognisably any library avatar either.
- **Files:** `public/characters/rb/<id>.bin` and `<id>_{c,n,o}.webp` (`c` colour, `n` normal, `o`
  hair/lash opacity), `index.json` (ids, tags, measured skin colour, lead flags),
  `LICENSE-Rocketbox.md`. Built by `tools/characters/build-rocketbox.ts --pool --leads` (texture
  steps in `rb_tex.py`).

## 7. MakeHuman default skins (CC0): skin detail for every body
- **What:** the 18 default MakeHuman skins (young, middle-aged and old; African, Asian and
  Caucasian; female and male), 2048² diffuse maps on the MakeHuman base-mesh UVs (which are our
  body's UVs).
- **Source:** the MakeHuman system assets package (`makehuman_system_assets_cc0.zip`, the same
  CC0 package as §1), folder `skins/<age>_<ancestry>_<sex>/`.
- **Licence:** CC0 1.0. Each skin's `.mhmat` file states it was "explicitly released as CC0 in
  september 2020".
- **Edits:** each map is divided by its own median colour, so only detail is kept (pores, lips,
  brows, freckles, ageing, nail beds) while our generator's skin tone still sets the colour.
  - High: 18 tiles of 384² in one strip, `skins_hi.webp`, 150 KiB.
  - Low: 6 tiles of 256², averaged over ancestry, `skins_lo.webp`, 21 KiB.
  - Built by `tools/characters/build-skins.py`.
- **Files:** `public/characters/skins_hi.webp`, `public/characters/skins_lo.webp`.

## 4. Tooling (not shipped)
- three 0.187.0 (MIT) is used inside the build scripts for maths.
- Playwright (Apache-2.0) is used for screenshots.
- No new npm dependencies were added.
