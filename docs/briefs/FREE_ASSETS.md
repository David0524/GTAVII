# Free assets and open-source tech: $0 budget (user decision, 2026-11-27)

> User: "I don't want to spend money. If you can find free assets online, github repos, skills, etc, go
> find those and implement them. I want the look to be GTA6 level. RDR2/GTA5 at worst, but this should be
> really good."

**Budget is $0.** No paid assets, stores or scans. Everything comes from free sources with a licence
that allows commercial use **and** shipping the files inside a web game. The 3D Scan Store option is off the table.

## Licence gate (every chat, every asset, no exceptions)
- Allowed: CC0, public domain, MIT, BSD, Apache-2.0, zlib, OFL or GUST Font License (fonts), CC-BY 4.0 (attribution goes in Credits).
- Not allowed: NC (non-commercial), ND, "editorial only", "personal use", research-only, GPL code shipped
  to the client (GPL tools used only at build time are fine), and any "may not redistribute raw files" clause.
- Read the actual LICENSE file before using anything (not a README badge or a listing site), and record it in
  `docs/licenses/ASSETS.md` (source URL, licence, date, files, attribution text).
- No real brands, logos or likenesses of real people. Scans of real private people need a release.
  Strip badges and logos from any model.

## Candidate sources by stream (scout, verify the licence, then implement)
These are starting points I believe are free; each one needs verifying. Go beyond this list.

**Engine: rendering (open-source tech)**
- three.js r187 built-in TSL nodes: GTAO, SSR, TRAA/TAA, bloom, DoF, SSGI (where available), and the
  official three.js TreeGenerator addon page (check it).
- three-gpu-pathtracer (MIT): bake GI lightmaps and irradiance probes **offline** for the static city, so the phone
  gets path-traced bounce light for free at runtime.
- N8AO (MIT), realism-effects (MIT: SSGI, TRAA, motion blur), pmndrs/postprocessing (zlib), three-mesh-bvh (MIT).
- meshoptimizer (MIT), KTX2/Basis Universal (Apache-2.0) for size and GPU memory.
- Poly Haven HDRIs (CC0) for sky and reflection reference and IBL.

**Engine and interiors: materials and props**
- Poly Haven textures and models (CC0), ambientCG (CC0), cgbookcase (CC0), Share Textures (CC0),
  3dtextures.me (CC0, check). Smithsonian Open Access 3D (CC0) for period objects.
- Sketchfab and Objaverse, filtered to CC0 or CC-BY only (check each model, and strip brands).

**Trees**
- ez-tree by Dan Greenheck (MIT code; bark textures CC0 from ambientCG; check the leaf textures' licence).

**Characters**
- Rocketbox (MIT, already in use) and MakeHuman/MPFB CC0 assets (in use).
- ICT-FaceKit (USC ICT morphable face model): check its LICENSE. If it's permissive, it could give
  scan-quality, diverse heads with expression blendshapes. Not confirmed.
- MetaHuman: free, but whether it can ship outside Unreal is **unconfirmed** (the official page says "any engine",
  and the EULA wording is disputed). The user can check the licence page while logged into their free Epic account.
  Don't use it until that's confirmed in writing.
- Hair: card generators and CC0 hair textures; skin: CC0 skin detail maps.
- Mocap: CMU Graphics Lab (free use), 100STYLE (CC-BY 4.0, check); lip-sync: Rhubarb (MIT, build time).

**Vehicles**
- Our own generator stays (no real car designs). Use CC0 PBR materials (chrome, rubber, vinyl, glass dirt),
  CC0 decals and grime. Period photos for shape only.

**Audio**
- Freesound (filter CC0), Sonniss GDC bundles (royalty-free game audio; check the licence), BBC Sound Effects
  (RemArc licence is **non-commercial**, so not allowed). Self-recorded or synthesised sounds stay preferred.

**UI**
- Fonts: OFL or GUST (TeX Gyre), licence text bundled. Icons: CC0 or MIT sets (Tabler, Lucide, Phosphor). Map art: our own renders.

## Done-means
Each stream reports: what it adopted (with licence proof), before/after shots, phone cost, and a
"vs GTA V / VI / RDR2" note. The target stays: **GTA VI look, RDR2/GTA V at worst.**
