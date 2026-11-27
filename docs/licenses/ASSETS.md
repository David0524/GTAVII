# Asset licences (shared log; one section per stream)

Rule (docs/briefs/FREE_ASSETS.md, user decision of 2026-11-27): **$0 budget**. Every third-party asset must:
- allow redistribution inside a commercial web game where files ship and can be extracted (CC0, CC-BY, MIT or equivalent; no NC, ND or research-only terms);
- be adults-only where it's people;
- show no identifiable real person without a documented release.

Each entry: source, exact licence, the key clause, what we use it for, status.

## Characters (claude/characters-74)
Full records with edits are in `docs/CHARACTER_SOURCES.md`; the head-source research is in `docs/research/HEAD_SOURCES.md`.

### In use

| Asset | Licence | Key clause (source) | Used for |
|---|---|---|---|
| MakeHuman system assets (base mesh, targets, rig, weights, 18 default skins, eyes and teeth) | CC0 1.0 | each .mhmat: "explicitly released as CC0 in september 2020"; makehumancommunity.org asset pages list CC0 | every body; skin detail for all tiers; Delphine's face micro-detail (the high-pass of `skins/young_african_female`, mapped onto her ICT head by 3 landmarks; licence re-verified 2026-11-27 in the .mhmat: "explicitly released as CC0 in september 2020") |
| Quaternius Universal Animation Library 1 and 2 | CC0 1.0 | quaternius.com: "CC0" | locomotion and action clips |
| Poly Haven fabric scans (6) | CC0 1.0 | polyhaven.com/license: "CC0" | cloth relief maps |
| ICT-FaceKit "Light" (USC ICT) | MIT | github.com/ICT-VGL/ICT-FaceKit LICENSE: "Permission is hereby granted, free of charge... to use, copy, modify, merge, publish, distribute, sublicense, and/or sell"; notice shipped in `public/characters/rb/LICENSE-ICT-FaceKit.md` | Delphine's head (`lead_delphine`): one synthesised identity baked by `tools/characters/bake-ict.ts`; the basis is dev-only and never ships; textures are procedural (ours). Synthesised identities only, never fitted to photos of real people. The separately licensed "Full ICT Face Model" is not used. |
| Microsoft Rocketbox (adult heads) | MIT | repo LICENSE.md "Permission is hereby granted, free of charge... to deal in the Software without restriction"; notice shipped in `public/characters/rb/LICENSE-Rocketbox.md` | Teddy and Nick heads, near-ring heads |

### Approved to adopt (passes the gate)

| Asset | Licence | Key clause (source) | Plan |
|---|---|---|---|
| CMU Graphics Lab Motion Capture Database | free use | mocap.cs.cmu.edu FAQ: "may be copied, modified, or redistributed without permission"; home: "may include this data in commercially-sold products, but you may not resell this data directly" | cutscene body performance (retargeted); never sold as an animation pack |
| 100STYLE | CC BY 4.0 | ianxmason.com/100style: "licensed under a Creative Commons Attribution 4.0 International License" | locomotion styles; credit required |
| ACCAD Open Motion Project files | CC BY 3.0 | accad.osu.edu motion-lab system-data page | supplementary mocap; credit required |

### To verify before use

| Asset | Status |
|---|---|
| Blender Human Base Meshes | listed CC0; page not readable by our tools, so verify on blender.org |
| "Hair Galore" alpha textures (OpenGameArt) | listed CC0; verify on the page. No tight-coil textures |
| FLAME 2023 Open | CC-BY with extra content clauses (no pornographic, defamatory or misleading use); needs a legal read; low-poly, no teeth or textures |
| Rokoko free mocap | commercial use OK; raw redistribution unverified |
| MetaHuman | **not used** (user may check the EULA); proprietary terms |

### Rejected (one line each)
- FLAME (pre-Open), Basel Face Model, LYHM, FaceScape, HiFi3D++, NPHM: research or non-commercial only.
- SFU MoCap, Bandai Namco motion sets, LAFAN1, AMASS, Motorica: non-commercial or no redistribution.
- Mixamo: raw redistribution barred.
- Lee Perry-Smith head and Sketchfab CC-BY scans: identifiable real people with no game release.
- Renderpeople, Human Generator, Reallusion: anti-extraction clauses.
- 3D Scan Store: paid (user: $0).
