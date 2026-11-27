# Interior prop candidates: free 3D models (scouting pass, 2026-11-27)

Scope: PROP_SET.md priority A, plus B where found. Gate (FREE_ASSETS rules): CC0, public domain or CC-BY 4.0 only. No NC, ND, editorial or personal-use. No brand marks (any model that shows one is flagged "strip"). Nothing was downloaded into the repo; thumbnails only were fetched (scratch dir) to judge shape era.

## Method and licence evidence
- **Poly Haven** (522 models via `api.polyhaven.com/assets?t=models`, then `/info/<id>` for tris). Licence: https://polyhaven.com/license states "Our assets are all licensed as CC0" (checked 2026-11-27, including 3D models). No per-model licence field exists in the API, so every PH row below is CC0 by that blanket statement. Files via `/files/<id>` (glTF with textures, plus FBX and Blend). Texture sets run 4k/8k, PBR (diffuse, normal, ARM/rough/metal). Tri counts are the API `polycount`. Budget note: 8k sets need downsizing to 1k-2k for web, and the glTF must be re-exported with KTX2.
- **Sketchfab** (`api.sketchfab.com/v3/search?type=models&license=cc0|by&downloadable=true`, then `/v3/models/<uid>` for the licence slug). Slugs seen: `cc0` ("CC0 Public Domain") and `by` ("CC Attribution"). Sketchfab's `by` slug is the current CC BY 4.0 licence; the API label does not print the version, so confirm the version on the model page when a model is adopted (see doubts). Downloads (glTF/GLB, USDZ, source) require a free Sketchfab login: do that by hand at adoption time, never scripted. Each uploader keeps the right to change the licence, so re-check the date.
- **Smithsonian Open Access 3D**: NOT scouted directly. `api.si.edu` returned 429 with the public DEMO_KEY and the 3D API root 404'd; a real key is needed. The only Smithsonian items surfaced (via Sketchfab, CC0) are museum scans of pre-1900 furniture at 100k-150k tris (e.g. Cooper Hewitt "Armchair With Slip Seat", 150k): poor period fit and too heavy. Skipped.
- Request politeness: at least 1 s between requests, User-Agent `GTAVII-asset-scout/1.0 (game research)`, no logins.

Period-fit scale: good = shape plausible in a 1974 Manhattan room. ok = plausible with a retexture or small edit. poor = wrong era/style.

## Seating
| Item (pri) | Candidate | Source URL | Licence | Formats / tris | Period fit | Notes |
|---|---|---|---|---|---|---|
| Bentwood café chair (A) | Bentwood chair (ValeGoG) | https://sketchfab.com/3d-models/bentwood-chair-e76cb526238a493c90255ad4a900f83d | `by` (Sketchfab) | glTF via login / 7,024 | good: classic Thonet No.14 profile | Only decent bentwood found. Check texture quality on download (no tags, thumbnail soft). |
| Wooden kitchen chair, spindle/slat back (A) | Painted Wooden Chair 02 | https://polyhaven.com/a/painted_wooden_chair_02 | CC0 (PH) | glTF, FBX, Blend / 1,246 | good: ladder-back schoolhouse/kitchen chair, chipped paint | Cheap, PBR 4k. Pair with next for a mismatched set. |
| | Painted Wooden Chair 01 | https://polyhaven.com/a/painted_wooden_chair_01 | CC0 (PH) | glTF / 724 | good: white slat back, peeling | 8k tex, downsize. |
| | Wooden Chair 01 | https://polyhaven.com/a/WoodenChair_01 | CC0 (PH) | glTF / 19,992 | poor: gothic carved | Reject (style and cost). |
| Chrome-and-vinyl dinette chair (A) | none acceptable | n/a | n/a | n/a | n/a | Only modern table sets (snowvy `by`, 2,676 tris, "modern" tag) found. Gap. |
| Swivel counter stool (A) | Diner Stool (Textured) (aidenpain) | https://sketchfab.com/3d-models/diner-stool-textured-bfccfc8c6ec549eb9e6864d2a849111b | `by` | glTF via login / 6,144 | good: chrome pedestal, round cushion | Substance-painted PBR. Best fit. |
| | Diner stool (elise.moncourier) | https://sketchfab.com/3d-models/diner-stool-13cdf33ecbed484c8864d28fe57f97f1 | `by` | glTF via login / 3,500 | ok: chrome frame, backrest, yellow seat | Backrest is more 1980s-retro; recolour. |
| Bar stool (B) | Metal Stool 01 / 03 | https://polyhaven.com/a/metal_stool_01 , https://polyhaven.com/a/metal_stool_03 | CC0 (PH) | glTF / 8,334, 6,576 | good: wood-top ring stool, industrial backed stool | Bars, workshops. 03 has footring-less backrest. |
| Club armchair, upholstered (A) | Vintage Club Armchair (noobozkurt) | https://sketchfab.com/3d-models/vintage-club-armchair-ea69870f27734162b54cd09931e9defa | `cc0` | glTF via login / 29,651 | good (by title and tags: leather club); thumbnail did not render, unverified | CC0, but heavy; decimate. Verify shape on download. |
| | Old Armchair (MaX3Dd) | https://sketchfab.com/3d-models/old-armchair-c20f084f29bd440197a18b4c750f69eb | `by` | glTF via login / 2,588 | good: low-poly leather club chair | Thumbnail shows a worn leather chair; cheap. |
| | Arm Chair 01 | https://polyhaven.com/a/ArmChair_01 | CC0 (PH) | glTF / 5,626 | ok: Louis-XV bergère, grey fabric | Older styling, fine for an old widow's flat, not a lobby. |
| 1940s-60s sofa (A) | Sofa 02 | https://polyhaven.com/a/sofa_02 | CC0 (PH) | glTF / 2,728 | good: tufted dark leather loveseat | Lobby/club feel. |
| | Vintage Leather Sofa (mkky) | https://sketchfab.com/3d-models/vintage-leather-sofa-989808a86faf415cb249e7d19be26b6b | `by` | glTF via login / 35,541 | ok: Chesterfield | Heavy; Chesterfield read as lawyer/club lobby. |
| | Sofa 03 / Sofa 01 | https://polyhaven.com/a/sofa_03 , https://polyhaven.com/a/Sofa_01 | CC0 (PH) | glTF / 8,004, 4,101 | ok: carved/Louis-XV style | Pre-war parlour only. No rolled-arm 1940s found. |
| Diner booth (B) | none | n/a | n/a | n/a | n/a | Gap (build from kit with proper seat mesh). |
| Church pew / long bench (B) | Painted Wooden Bench | https://polyhaven.com/a/painted_wooden_bench | CC0 (PH) | glTF / 630 | ok: small settle bench with high back | Scale up and lengthen for pews. |
| Barber chair (B) | Barber Shop Chair 01 | https://polyhaven.com/a/BarberShopChair_01 | CC0 (PH) | glTF / 4,280 | good: tufted leather, brass; c. 1900-1920 chair still in use in 1974 old shops | Spec asked porcelain base; this is brass. No visible brands. |
| Steel folding chair (B) | Old Metal Folding Chair (MaX3Dd) | https://sketchfab.com/3d-models/old-metal-folding-chair-bc526e9ae4954ecf82c9caf35d8e6bdd | `by` | glTF via login / 1,282 | good | Cheapest. |
| | Metal Folding Chair (jn930194) / Old Metal Folding Chair (CurlyFryWhy) | https://sketchfab.com/3d-models/metal-folding-chair-7a99fce4bdbd40e1b2949cdeb39a8fba , https://sketchfab.com/3d-models/old-metal-folding-chair-f3d95d69401945fda7a355679868f169 | `by` | glTF via login / 2,172, 14,116 | good | CurlyFryWhy is padded, worn. |
| Office swivel chair (B) | none acceptable | n/a | n/a | n/a | poor | Candidates (Sam54123 16,894 tris) are modern 5-star gas-lift. Gap. |

## Tables and work surfaces
| Item (pri) | Candidate | Source URL | Licence | Formats / tris | Period fit | Notes |
|---|---|---|---|---|---|---|
| Chrome-edged formica dinette table (A) | none acceptable | n/a | n/a | n/a | n/a | Gap. |
| Wooden kitchen table, enamel top (A) | Painted Wooden Table | https://polyhaven.com/a/painted_wooden_table | CC0 (PH) | glTF / 600 | good: trestle, painted | Very cheap. |
| | Dining Table (cloth-covered) | https://polyhaven.com/a/dining_table | CC0 (PH) | glTF / 1,048 | good: gingham cloth, tenement | Cloth baked in. |
| | Wooden Table 01 | https://polyhaven.com/a/WoodenTable_01 | CC0 (PH) | glTF / 952 | ok | |
| Round pedestal café table (B) | Round Wooden Table 01 | https://polyhaven.com/a/round_wooden_table_01 | CC0 (PH) | glTF / 8,640 | good: turned pedestal, 3-foot | |
| | Side Table Tall 01 | https://polyhaven.com/a/side_table_tall_01 | CC0 (PH) | glTF / 6,408 | ok | |
| Steel tanker desk (A) | Metal Office Desk | https://polyhaven.com/a/metal_office_desk | CC0 (PH) | glTF / 6,898 | good: grey steel, linoleum-style top, paired drawer pedestals | Best fit; 8k tex. |
| | Metal Desk (7ASSAN) | https://sketchfab.com/3d-models/metal-desk-d7585fb0086748808ee0a8ed0803efdb | `by` | glTF via login / 470 | ok: green steel desk, cheap | |
| Oak office desk (B) | none | n/a | n/a | n/a | n/a | Gap. |
| Garment cutting table (B) | none | n/a | n/a | n/a | n/a | Plank trestle tables exist (snowvy Dinning Table, 1,300 `by`) but weak. Gap. |
| Pool table (B) | Pool Table Traditional (fizyman) | https://sketchfab.com/3d-models/pool-table-traditional-e0b938c0c2e74eb794a49ebde2543977 | `by` | glTF via login / 24,266 | good: turned legs, green felt, hanging lamp | Heavy-ish. |
| | Pool Table (Badboy17Aiden) | https://sketchfab.com/3d-models/pool-table-4dcb0e9d6802443fb4f8ea8ff79c2dc4 | `by` | glTF via login / 7,066 | ok: red felt, cue and balls | Recolour felt green. |

## Storage and fixtures
| Item (pri) | Candidate | Source URL | Licence | Formats / tris | Period fit | Notes |
|---|---|---|---|---|---|---|
| Steel filing cabinet 4-drawer (A) | File Cabinet (LtxxwSibeRia) | https://sketchfab.com/3d-models/file-cabinet-f0742791a0ea432db1f432c24de83867 | `by` | glTF via login / 2,228 | good: grey steel vertical 4-drawer | Best. |
| | Old Filing Cabinet (mikelkel2) | https://sketchfab.com/3d-models/old-filing-cabinet-89729ff6718840d6a10e5ea20d6904ce | `by` | glTF via login / 3,642 | ok: it is a multi-drawer card index | Useful as precinct records. |
| | Filing Cabinets (toomanydemons) | https://sketchfab.com/3d-models/filing-cabinets-7ef1ca295ff14af2abcbe0ae0168a241 | `by` | glTF via login / 7,351 | ok: trashed set with paper | Scene-dressing. |
| Dresser / bureau (A) | Old Dresser (slls666) | https://sketchfab.com/3d-models/old-dresser-3ee2cb9b3d9d441ea2e99e6c801ee0b8 | `by` | glTF via login / 39,383 | good: plain 2-drawer wood chest; heavy | Decimate. |
| | Antique Dresser (DarrenMcnerney3D) | https://sketchfab.com/3d-models/antique-dresser-0a46621504c24197b5653608f474f73b | `by` | glTF via login / 12,234 | ok: painted 3-drawer chest | Nightstand scale. |
| | Painted Wooden Cabinet | https://polyhaven.com/a/painted_wooden_cabinet | CC0 (PH) | glTF / 2,227 | good: enamelled kitchen cabinet, 2 drawers + doors | Kitchen, not bedroom. |
| Wardrobe / armoire (A) | Antique Wooden Wardrobe (kuuttisiitonen) | https://sketchfab.com/3d-models/antique-wooden-wardrobe-a3c221e5504d40a8ba019f8f1bf5ab0e | `by` | glTF via login / 2,432 | good: plain 2-door | Cheap. |
| | wardrobe antique (lagesnpiet) | https://sketchfab.com/3d-models/wardrobe-antique-b003c56eb67e487d93c7cdc83497a5ba | `by` | glTF via login / 1,832 | good: panelled armoire | |
| Iron or brass bed frame (A) | Old Bed Frame | https://polyhaven.com/a/old_bed_frame | CC0 (PH) | glTF / 49,990 | good: iron frame, wire springs | Heavy tris (spring mesh); decimate or bake. Rust condition ties to worn grades. |
| Footlocker / steamer trunk (A) | Vintage Steamer Trunk (ctorre) | https://sketchfab.com/3d-models/vintage-steamer-trunk-78d7b6f1e70041c498663b4a4145c559 | `by` | glTF via login / 11,587 | good | Travel stickers/labels in texture: inspect for real brands, strip. |
| | Vintage Suitcase | https://polyhaven.com/a/vintage_suitcase | CC0 (PH) | glTF / 16,474 | good: green hard case with stickers | Check sticker texts. |
| | Metal Toolbox | https://polyhaven.com/a/metal_toolbox | CC0 (PH) | glTF / 14,228 | ok | Small-prop stash. |
| Shelving, steel and wood (B) | Worn Metal Rack | https://polyhaven.com/a/worn_metal_rack | CC0 (PH) | glTF / 6,372 | good: green painted steel shelving | |
| | Wooden Bookshelf Worn | https://polyhaven.com/a/wooden_bookshelf_worn | CC0 (PH) | glTF / 10,106 | good | |
| | Painted Wooden Shelves / Shelf 01 | https://polyhaven.com/a/painted_wooden_shelves , https://polyhaven.com/a/Shelf_01 | CC0 (PH) | glTF / 524, 182 | ok | Very cheap. |
| Glass display case (B), mailbox bank (B), coat rack (C) | none | n/a | n/a | n/a | n/a | Gaps. |
| Cast-iron column radiator (A) | Old Radiator (thethieme) | https://sketchfab.com/3d-models/old-radiator-8a1a2e0263aa401591c1e87d824a79ef | `by` | glTF via login / 7,534 | good: white painted column radiator | Best. |
| | Rusty Radiator (loxfear) | https://sketchfab.com/3d-models/rusty-radiator-37aedf976c6c4264a122f30562ca2aac | `by` | glTF via login / 6,609 | good: cast iron, cloth draped | Worn variant. |
| Clawfoot tub, pedestal sink, high-tank toilet (A) | Old Dirty Pedestal Sink (RenendStudio) | https://sketchfab.com/3d-models/old-dirty-pedestal-sink-low-poly-pbr-4a9095d3540144c7bd8bcefe0de2a227 | `by` | glTF via login / 2,110 | good: pedestal sink | Sink only. Tub and high-tank toilet: none found (only modern toilets and high-poly scans). Gap for those two. |
| Enamel gas range (A) | Gas Stove (longtail) | https://sketchfab.com/3d-models/gas-stove-056ccf898f9e49acb6e3e370deabf184 | `by` | glTF via login / 2,530 | ok: Soviet-style 4-burner enamel, rusted | Shape fine, "abandoned" texture; re-texture. |
| | Electric Stove | https://polyhaven.com/a/electric_stove | CC0 (PH) | glTF / 13,914 | ok: white range, oven window | Electric, but 1970s range shape; panel shows a small brand mark: strip. |
| Rounded-top refrigerator (A) | 1950's era Refrigerator (Planetrix23) | https://sketchfab.com/3d-models/1950s-era-refrigerator-c982b423e6f74f839fad1493e498c477 | `by` | glTF via login / 1,170 | good: rounded teal 2-door | Check handle badge for brand. |

## Lighting
| Item (pri) | Candidate | Source URL | Licence | Formats / tris | Period fit | Notes |
|---|---|---|---|---|---|---|
| Schoolhouse pendant, opal globe (A) / enamel warehouse pendant (B) | Hanging Industrial Lamp | https://polyhaven.com/a/hanging_industrial_lamp | CC0 (PH) | glTF / 9,530 | good: enamel shade, cage; warehouse | No opal globe: make the globe procedurally. |
| | Bar Ceiling Light (mark-peters) | https://sketchfab.com/3d-models/bar-ceiling-light-2048px2-2ba27702aabe4d37822956a2b7bf43d8 | `by` | glTF via login / 8,296 | ok: brass cylinder pendant | |
| Bare bulb with pull chain (A) | Pull Chain Light Socket + Lightbulb 01 | https://polyhaven.com/a/pull_chain_light_socket , https://polyhaven.com/a/lightbulb_01 | CC0 (PH) | glTF / 10,902 + 4,372 | good: porcelain fitting, filament bulb | Bulb is clear glass with visible filament. Combine. |
| Fluorescent wraparound (B) | Mounted Fluorescent Lights | https://polyhaven.com/a/mounted_fluorescent_lights | CC0 (PH) | glTF / 17,820 | ok: bare tubes only | Add own housing. |
| | Caged Hanging Light | https://polyhaven.com/a/caged_hanging_light | CC0 (PH) | glTF / 22,893 | good: caged fluorescent, chain hung | Heavy. |
| Brass chandelier (B) | Chandelier 01 / 02 | https://polyhaven.com/a/Chandelier_01 , https://polyhaven.com/a/Chandelier_02 | CC0 (PH) | glTF / 26,860, 21,514 | good: brass arms, fabric shades | Heavy; LOD. |
| Table and floor lamps, fabric shade (A) | Floor Lamp (bilgehan.korkmaz) | https://sketchfab.com/3d-models/floor-lamp-33eb258d9873435690254cfbb0ea46ec | `by` | glTF via login / 3,732 | good: shaded standard lamp | |
| | 1920s Standing Floor Lamps (Mad_Lobster_Workshop) | https://sketchfab.com/3d-models/1920s-standing-floor-lamps-type-a-ca1cf1c435ec4012b9b6d5128333ad83 | `by` | glTF via login / 59,406 | good | Heavy: split and decimate. |
| | Desk Lamp Arm 01 | https://polyhaven.com/a/desk_lamp_arm_01 | CC0 (PH) | glTF / 25,710 | ok: orange anglepoise, 1960s-70s | Heavy; office use. |
| Ceiling fan (C) | Ceiling Fan | https://polyhaven.com/a/ceiling_fan | CC0 (PH) | glTF / 16,356 | poor: black modern blades | Gap for a 1930s fan. |

## Appliances and electronics
| Item (pri) | Candidate | Source URL | Licence | Formats / tris | Period fit | Notes |
|---|---|---|---|---|---|---|
| Console TV and portable TV (A) | Television 01 | https://polyhaven.com/a/Television_01 | CC0 (PH) | glTF / 1,918 | ok: 1970s dial CRT portable, metal case | Shows a "VTECH" mark: strip, re-texture. No rabbit ears. |
| | Old Soviet Portable TV (soidev) | https://sketchfab.com/3d-models/old-soviet-portable-tv-5db1672fb31f41678c0e8c948c5247aa | `by` | glTF via login / 9,077 | ok: blue case, 60s-70s | Cyrillic branding on front: strip. |
| | Television 02 | https://polyhaven.com/a/television_02 | CC0 (PH) | glTF / 2,310 | poor: 1980s, remote-era | Reject. Wood-cabinet console TV: none (gap). |
| Tube radio (A) | Vintage Radio (Discovered) | https://sketchfab.com/3d-models/vintage-radio-d7d924cb3d1f4b229e2aa62dcee77fd3 | `by` | glTF via login / 31,764 | good: bakelite/wood tube radio | Heavy; check nameplate. |
| | Vintage Radio 1940s (ponchoguy) | https://sketchfab.com/3d-models/vintage-radio-7724f81ad4e043079b7bf4b16146c087 | `by` | glTF via login / 220,857 | good shape | "Admiral" brand and 220k tris: reject. |
| Transistor radio (A) | Radio Transistor (denluck) | https://sketchfab.com/3d-models/radio-transistor-0e556ef6b8564d4b819bda51ab175227 | `by` | glTF via login / 1,854 | good: 1960s-70s portable | v2 (b8700475) 4,302 tris. Cheap. |
| Rotary desk phone (A) | Antique 1930s Rotary Telephones (Mad_Lobster_Workshop) | https://sketchfab.com/3d-models/antique-1930s-rotary-telephones-c08787c11a494006afbc50a435e7c4c8 | `by` | glTF via login / 52,336 | good: black, red, grey desk sets (3 in one file) | Heavy; split. 1930s-50s shape still common in 1974. |
| Wall payphone (A) | Korean Public Payphone 01 | https://polyhaven.com/a/korean_public_payphone_01 | CC0 (PH) | glTF / 48,132 | poor: LCD display and keypad | Reject. Gap. |
| Mechanical cash register (A) | Cash Register 01 | https://polyhaven.com/a/CashRegister_01 | CC0 (PH) | glTF / 9,927 | good: 1920s-40s key register | Nameplate/drawer text ("TITCH BANKS" and lettering): check, strip. |
| | Cash register with a counting machine (Wirtualne Muzea Malopolski) | https://sketchfab.com/3d-models/cash-register-with-a-counting-machine-6b6ecc33993d49939bd4c7633c795577 | `cc0` | glTF via login / 104,587 | good: brass/nickel key register | Museum scan, heavy; maker marks to check. |
| Typewriter, manual (A) | 1930s style typewriter - w/o branding (KWojcik) | https://sketchfab.com/3d-models/1930s-style-typewriter-wo-branding-1d6009449fe84fd79454c4081eb743bf | `by` | glTF via login / 22,411 | good: black manual, unbranded | Best find. |
| Jukebox (B) | Jukebox (I_Live) | https://sketchfab.com/3d-models/jukebox-127cd1a00ca143af9db9cf4e58ddd956 | `by` | glTF via login / 3,580 | good: 1940s-50s arch top | Cheap. |
| | Jukebox (rescue3d) / Retro Jukebox (maxwellmccurry) | https://sketchfab.com/3d-models/jukebox-188e71ce378f4b6786054d9f74dd3a25 , https://sketchfab.com/3d-models/retro-jukebox-53363aaabb4c4c2dbbe0e1e8b2020737 | `by` | glTF via login / 12,413, 16,460 | ok | Neon/saturated colours; Wurlitzer-style marks possible. |
| Sewing machine (B) | Willoughsby Sewing Machine (KWojcik) | https://sketchfab.com/3d-models/willoughsby-sewing-machine-0d0e00e5735440efa86b5da2ea8498b1 | `by` | glTF via login / 17,970 | good: treadle | |
| | Vintage sewing machine (halilkantarci) | https://sketchfab.com/3d-models/vintage-sewing-machine-4f6c74f9f904439b8554078d1be14821 | `by` | glTF via login / 5,301 | good: industrial | |
| | Vintage Sewing Machine (Eryn_Noel) | https://sketchfab.com/3d-models/vintage-sewing-machine-8c6ea1ed6d7b42fdbf0fce21142fb846 | `by` | glTF via login / 14,856 | good: Singer-style | Singer-like gold decals: strip. |
| Electric fan, oscillating (B) | Oscillating Fan (AnsysLearn) | https://sketchfab.com/3d-models/oscillating-fan-e897cf9b5fd346b2823956843914ccd6 | `by` | glTF via login / 2,812 | ok: table fan | Metal-blade look reads 1950s; bland textures. |
| Cigarette machine (B), coin-op washer/dryer (B), window AC (B) | none | n/a | n/a | n/a | n/a | Gaps. |

## Small props (not requested in depth; best CC0 hits on Poly Haven)
Alarm Clock 01 (13,006), Wall Clock (3,658; shows a Braun logo: strip), Mantel Clock 01 (29,742), Metal Trash Can (13,960: corrugated steel, good), Cardboard Box 01 (16,952), Trashbag (4,482), Wooden Bucket 01 (5,116), Pot Enamel 01 (11,416, good), Vintage Electric Kettle (14,838), Wine Bottles 01 (28,848; labels to re-texture), Cigarette Pack (7,582; reads "Kentucky Ace", fictional brand but strip), Potted Plant 01/02 (96k/70k: far too heavy), Fancy Picture Frame 01 (938), Book Encyclopedia Set 01 (67,306: heavy), Throw Pillows 01, Folding Wooden Stool, Ornate Mirror 01. All CC0 at https://polyhaven.com/a/<id>.

## Gaps (to be modelled procedurally)
Priority A: chrome-and-vinyl dinette chair; chrome-edged formica dinette table; clawfoot bathtub; high-tank toilet; wood-cabinet console TV; wall payphone; opal-globe schoolhouse shade (use the PH pendant for the fitting only).
Priority B: diner booth seat; office swivel chair (wood/steel tanker); oak office desk; garment cutting table; glass display case; brass mailbox bank; cigarette machine; coin-op washer/dryer; window AC; coat rack (C); 1930s ceiling fan (C).
Weak and likely rebuilt: sofas (no 1940s rolled-arm), fluorescent housing (tubes only), gas range (re-texture needed).

## Licence doubts
1. Sketchfab `by` = "CC Attribution" with no version in the API label. Sketchfab now issues CC BY 4.0, but older uploads could carry an earlier version; confirm "CC Attribution 4.0" on each adopted model page and record it.
2. Sketchfab downloads need a login. Do it manually at adoption, and keep the per-model page URL, uploader and date checked.
3. Museum scans (Wirtualne Muzea Malopolski, Smithsonian) are CC0 on Sketchfab but may have a different statement on the owner's own site; check before adoption. Not top picks.
4. Models with possible brand marks: PH Television_01 (VTECH), Wall Clock (Braun), CashRegister_01 (lettering), Cigarette Pack, electric_stove; Sketchfab Soviet TV, Singer-style sewing machine, jukeboxes, steamer trunk stickers. All need texture strip/re-texture. Smithsonian not checked (no API key).
5. AI-generated Sketchfab uploads (pattyflyingbear steamer trunks, "meshy") were excluded.

## Draft licence ledger entries (for docs/licenses/ASSETS.md; date checked 2026-11-27; top pick per item)
Format: asset | source URL | licence | files to take | attribution text. PH entries are CC0 (no credit needed, credit anyway: "Model by <author>, polyhaven.com, CC0"). Sketchfab `by` entries must carry the credit and a change note ("modified: decimated, retextured, brand marks removed"). Authors for PH models are in each `/info/<id>` `authors` field and must be filled at adoption.

| Item | Asset | Source URL | Licence | Files | Attribution text |
|---|---|---|---|---|---|
| Bentwood chair | Bentwood chair | https://sketchfab.com/3d-models/bentwood-chair-e76cb526238a493c90255ad4a900f83d | CC BY 4.0 (verify) | GLB + textures | "Bentwood chair" by ValeGoG, CC BY 4.0, via Sketchfab |
| Kitchen chair | painted_wooden_chair_02 | https://polyhaven.com/a/painted_wooden_chair_02 | CC0 | glTF + 2k jpg | Painted Wooden Chair 02, Poly Haven, CC0 |
| Swivel stool | Diner Stool (Textured) | https://sketchfab.com/3d-models/diner-stool-textured-bfccfc8c6ec549eb9e6864d2a849111b | CC BY 4.0 (verify) | GLB | "Diner Stool (Textured)" by aidenpain, CC BY 4.0, via Sketchfab |
| Club armchair | Vintage Club Armchair | https://sketchfab.com/3d-models/vintage-club-armchair-ea69870f27734162b54cd09931e9defa | CC0 | GLB | Vintage Club Armchair by noobozkurt, CC0, via Sketchfab |
| Sofa | sofa_02 | https://polyhaven.com/a/sofa_02 | CC0 | glTF + 2k | Sofa 02, Poly Haven, CC0 |
| Barber chair | BarberShopChair_01 | https://polyhaven.com/a/BarberShopChair_01 | CC0 | glTF + 2k | Barber Shop Chair 01 by Fernando Quinn, Poly Haven, CC0 |
| Folding chair | Old Metal Folding Chair | https://sketchfab.com/3d-models/old-metal-folding-chair-bc526e9ae4954ecf82c9caf35d8e6bdd | CC BY 4.0 (verify) | GLB | "Old Metal Folding Chair" by MaX3Dd, CC BY 4.0, via Sketchfab |
| Kitchen table | painted_wooden_table | https://polyhaven.com/a/painted_wooden_table | CC0 | glTF + 2k | Painted Wooden Table, Poly Haven, CC0 |
| Café table | round_wooden_table_01 | https://polyhaven.com/a/round_wooden_table_01 | CC0 | glTF + 2k | Round Wooden Table 01, Poly Haven, CC0 |
| Tanker desk | metal_office_desk | https://polyhaven.com/a/metal_office_desk | CC0 | glTF + 2k | Metal Office Desk, Poly Haven, CC0 |
| Pool table | Pool Table Traditional | https://sketchfab.com/3d-models/pool-table-traditional-e0b938c0c2e74eb794a49ebde2543977 | CC BY 4.0 (verify) | GLB | "Pool Table Traditional" by fizyman, CC BY 4.0, via Sketchfab |
| Filing cabinet | File Cabinet | https://sketchfab.com/3d-models/file-cabinet-f0742791a0ea432db1f432c24de83867 | CC BY 4.0 (verify) | GLB | "File Cabinet" by LtxxwSibeRia, CC BY 4.0, via Sketchfab |
| Dresser | Old Dresser | https://sketchfab.com/3d-models/old-dresser-3ee2cb9b3d9d441ea2e99e6c801ee0b8 | CC BY 4.0 (verify) | GLB | "Old Dresser" by slls666, CC BY 4.0, via Sketchfab |
| Wardrobe | wardrobe antique | https://sketchfab.com/3d-models/wardrobe-antique-b003c56eb67e487d93c7cdc83497a5ba | CC BY 4.0 (verify) | GLB | "wardrobe antique" by lagesnpiet, CC BY 4.0, via Sketchfab |
| Bed | old_bed_frame | https://polyhaven.com/a/old_bed_frame | CC0 | glTF + 2k | Old Bed Frame, Poly Haven, CC0 |
| Trunk | Vintage Steamer Trunk | https://sketchfab.com/3d-models/vintage-steamer-trunk-78d7b6f1e70041c498663b4a4145c559 | CC BY 4.0 (verify) | GLB | "Vintage Steamer Trunk" by ctorre, CC BY 4.0, via Sketchfab |
| Shelving | worn_metal_rack | https://polyhaven.com/a/worn_metal_rack | CC0 | glTF + 2k | Worn Metal Rack, Poly Haven, CC0 |
| Radiator | Old Radiator | https://sketchfab.com/3d-models/old-radiator-8a1a2e0263aa401591c1e87d824a79ef | CC BY 4.0 (verify) | GLB | "Old Radiator" by thethieme, CC BY 4.0, via Sketchfab |
| Pedestal sink | Old Dirty Pedestal Sink | https://sketchfab.com/3d-models/old-dirty-pedestal-sink-low-poly-pbr-4a9095d3540144c7bd8bcefe0de2a227 | CC BY 4.0 (verify) | GLB | "Old Dirty Pedestal Sink" by RenendStudio, CC BY 4.0, via Sketchfab |
| Gas range | Gas Stove | https://sketchfab.com/3d-models/gas-stove-056ccf898f9e49acb6e3e370deabf184 | CC BY 4.0 (verify) | GLB | "Gas Stove" by longtail, CC BY 4.0, via Sketchfab |
| Refrigerator | 1950's era Refrigerator | https://sketchfab.com/3d-models/1950s-era-refrigerator-c982b423e6f74f839fad1493e498c477 | CC BY 4.0 (verify) | GLB | "1950's era Refrigerator" by Planetrix23, CC BY 4.0, via Sketchfab |
| Warehouse pendant | hanging_industrial_lamp | https://polyhaven.com/a/hanging_industrial_lamp | CC0 | glTF + 2k | Hanging Industrial Lamp, Poly Haven, CC0 |
| Bare bulb | pull_chain_light_socket + lightbulb_01 | https://polyhaven.com/a/pull_chain_light_socket | CC0 | glTF + 2k | Poly Haven, CC0 |
| Chandelier | Chandelier_01 | https://polyhaven.com/a/Chandelier_01 | CC0 | glTF + 2k | Chandelier 01, Poly Haven, CC0 |
| Floor lamp | Floor Lamp | https://sketchfab.com/3d-models/floor-lamp-33eb258d9873435690254cfbb0ea46ec | CC BY 4.0 (verify) | GLB | "Floor Lamp" by bilgehan.korkmaz, CC BY 4.0, via Sketchfab |
| Portable TV | Television_01 | https://polyhaven.com/a/Television_01 | CC0 | glTF + 2k (strip logo) | Television 01, Poly Haven, CC0 |
| Tube radio | Vintage Radio | https://sketchfab.com/3d-models/vintage-radio-d7d924cb3d1f4b229e2aa62dcee77fd3 | CC BY 4.0 (verify) | GLB | "Vintage Radio" by Discovered, CC BY 4.0, via Sketchfab |
| Transistor radio | Radio Transistor | https://sketchfab.com/3d-models/radio-transistor-0e556ef6b8564d4b819bda51ab175227 | CC BY 4.0 (verify) | GLB | "Radio Transistor" by denluck, CC BY 4.0, via Sketchfab |
| Rotary phone | Antique 1930s Rotary Telephones | https://sketchfab.com/3d-models/antique-1930s-rotary-telephones-c08787c11a494006afbc50a435e7c4c8 | CC BY 4.0 (verify) | GLB | "Antique 1930s Rotary Telephones" by Mad_Lobster_Workshop, CC BY 4.0, via Sketchfab |
| Cash register | CashRegister_01 | https://polyhaven.com/a/CashRegister_01 | CC0 | glTF + 2k (check lettering) | Cash Register 01, Poly Haven, CC0 |
| Typewriter | 1930s style typewriter - w/o branding | https://sketchfab.com/3d-models/1930s-style-typewriter-wo-branding-1d6009449fe84fd79454c4081eb743bf | CC BY 4.0 (verify) | GLB | "1930s style typewriter - w/o branding" by KWojcik, CC BY 4.0, via Sketchfab |
| Jukebox | Jukebox | https://sketchfab.com/3d-models/jukebox-127cd1a00ca143af9db9cf4e58ddd956 | CC BY 4.0 (verify) | GLB | "Jukebox" by I_Live, CC BY 4.0, via Sketchfab |
| Sewing machine | Willoughsby Sewing Machine | https://sketchfab.com/3d-models/willoughsby-sewing-machine-0d0e00e5735440efa86b5da2ea8498b1 | CC BY 4.0 (verify) | GLB | "Willoughsby Sewing Machine" by KWojcik, CC BY 4.0, via Sketchfab |
