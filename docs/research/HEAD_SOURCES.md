# Realistic head sources: licence and coverage research (2026-11-27)

**Why:** the adult Microsoft Rocketbox library (MIT) has no woman who reads as Black and only three
Black men, so Delphine and Black women in the near ring would get weaker faces than everyone
else. The user's answer (via oversight): **"Find more sources first."** We don't ship an uneven
quality bar.

**Requirements for every source:**
- the licence allows redistribution inside a commercial web game, with modification (CC0, CC-BY,
  MIT and similar, or an explicit game licence; no NC, ND or research-only terms);
- adults only;
- realism comparable to Rocketbox;
- **no identifiable real person** unless a model release covering games is documented.

Points not verified are marked as such. Licence quotes come from the pages cited. Some pages
refused automated fetches, so their text is quoted from search indexes and needs a human read
before any decision.

## Verdict
**No free source with an unambiguous licence fills the gap at Rocketbox quality.** The options,
in order:

| Route | Coverage | Licence status | Integration | Money |
|---|---|---|---|---|
| **Epic MetaHuman** (generated faces, UE 5.6+) | Any ethnicity, sex and adult age: authored by us | Since mid-2025 MetaHumans are "Non-Engine Products" usable in other engines ([CG Channel](https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/), [EULA](https://www.unrealengine.com/en-US/eula)). **Unverified:** whether shipping extractable meshes and textures in a browser is allowed. Needs written confirmation from Epic | Medium–high: unrelated topology and UVs; heavy facial rig reduced to jaw/neck; export via UE or Maya | Free under US$1M a year revenue (Unreal EULA) |
| **3D Scan Store "Retopologised" heads** (Ten24, UK) | "Black" tag: 30 heads (about 9 women, only 1 woman in the Retopologised range); "Asian": 32; "Hispanic"/"Latino": 0; "Elderly": 2 | Game use explicitly allowed (Business Commercial Single Project). Not allowed: standalone redistribution, character makers, open-source release ([terms](https://www.3dscanstore.com/terms-and-conditions-licensing)). **Model releases not mentioned:** ask before buying | Low–medium: all Retopologised heads share point order and UVs, so rig and map once; bake 16K maps down to 1–2K | About £227 (about US$290) per head at list including the commercial licence; **20–40 heads ≈ £4.5k–£9.1k**; bulk discount on request |
| **MakeHuman CC0 skins** (system 18 + community packs) | Black, East Asian and white × both sexes × 3 ages; community extras (Indian, "Eurasian", African middle-aged male) | CC0 ([system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), [skins01](https://static.makehumancommunity.org/assets/assetpacks/skins01.html), [skins02](https://static.makehumancommunity.org/assets/assetpacks/skins02.html)) | Very low (our topology; already integrated as detail) | Free, but **below Rocketbox realism** (parametric faces, generic textures) |

**Recommendation** (for the user; these are money and licence decisions):
1. Ask Epic in writing whether MetaHuman-derived head meshes and textures may ship in a browser
   game, where they're technically extractable.
2. If they say yes, author the missing population in MetaHuman and build one
   MetaHuman-to-our-skeleton conversion. Coverage becomes complete, at the cost of integration
   work rather than money.
3. If they say no, buy about 20–30 3D Scan Store Retopologised heads, prioritising Black women,
   older people and Puerto Rican and Dominican-reading faces. Get written confirmation of signed
   game-use model releases first, and keep the purchased assets out of any public repository.
   Coverage gaps remain (few Latino or elderly scans in the catalogue), which a custom scan quote
   could close.
4. Keep MakeHuman CC0 skins for distant crowds and Low (as now).

## Coverage gaps today (Rocketbox + MakeHuman CC0)
- Black women of every age: none at Rocketbox quality.
- Black men: three, none old.
- Puerto Rican and Dominican people (Afro-Latino and mixed phenotypes), both sexes.
- Older Chinese people, and older women generally.
- Not audited: whether Rocketbox's Southern European (Italian, Greek) and Jewish faces cover
  those groups; recolouring covers tone, not face shape.

## Rejected (one line each)
- **Sketchfab CC0/CC-BY heads:**
  - the realistic scans are raw photogrammetry of private real people with no release stated
    (for example "Jared Head Scan", "Nils Head Scan"), often 0.2–3M triangles with no eyes or teeth;
  - the "African" hits are wood carvings;
  - the realistic sculpts are single generic heads with no diversity value;
  - the Lee Perry-Smith head is a single white man.
- **Meta Multiface:** CC-BY-NC 4.0, real people. **Ava-256 / Goliath:** research datasets of
  real people with no game release.
- **FaceScape:** "internal, non-commercial research … purposes only". **FaMoS / TEMPEH:**
  commercial use and redistribution prohibited. **NeRSemble, BU-3DFE, Florence, FaceWarehouse,
  NoW, LYHM:** real research participants with no game release (some licences not verified;
  rejected regardless).
- **Ready Player Me:** shut down on 31 Jan 2026; stylised anyway. **VRoid:** stylised.
- **Mixamo:** raw character files may not be redistributed; low realism.
- **MB-Lab:** generated models default to AGPL-3.
- **Human Generator:** games only if the product "cannot be extracted"; web assets can be.
- **Renderpeople:** §4.3(b) forbids making the 3D data easy to download or extract, which a web
  game can't satisfy without their written consent; the terms say nothing on model releases.
- **Reallusion Character Creator:** web export allowed, but the game FAQ wasn't retrievable.
  Forum guidance bars extraction and character-customisation systems; would need written
  confirmation.
- **Daz 3D:** per-product Interactive License, which not all products offer. **Humano3D:** no
  games without a custom licence. **AXYZ:** game use needs an Extended licence; archviz figures,
  not head-grade.
- **Avatar SDK / MetaPerson:** built from photos of real users; no redistribution terms found.
- **Rocketbox forks:** none add heads.
- **Triplegangers, Texturing.xyz:** blocked automated access; licence and price unverified.

## Custom scanning
- Ten24 (3D Scan Store, 120-camera rig), Triplegangers and AXYZ scanning services offer custom
  work.
- None publishes a per-head price or lead time, so quotes are needed. No estimate given, to
  avoid guessing.
