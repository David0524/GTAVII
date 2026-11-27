# Weapon registry (invented names, trademark checks)

Every firearm in the game is a **period-typical generic design under an invented maker and model
name**: no real manufacturers, model names, logos or exact replicas (GAMEPLAY_BRIEF hard rule). Stats
are game values chosen for feel; they aren't a real gun's specifications. Calibres (.38, 9 mm,
12-gauge, .30, .45) are generic period terms. No in-world text contains functional weapon
instructions (narrative content rule 6).

The placeholder names below are in `src/gameplay/data/defaults.ts`. Narrative's
`content/items/weapons.json` (maker × model × tier) replaces them on merge, and each of its names
gets the same check before it ships.

| Game id | Invented name | Class / family | Era note | Trademark / collision check (2026-11-26, web search) |
|---|---|---|---|---|
| `weapon.snub` | Corbell Pocket Five | snub revolver, 5-shot | A short-barrel 5-shot revolver is the period's classic off-duty and street gun | "Corbell" + firearms/revolver: no maker or mark found. **Renamed from "Tarrant"**, which reads too close to the historic British revolver maker Tranter. |
| `weapon.service` | Corbell Patrol Six | service revolver, 6-shot | The 1974 NYPD carried a 6-shot .38 service revolver (generic design, no real model) | Same maker check as above. |
| `weapon.pistol` | Orsolini Model 52 | semi-auto pistol, 8-round | A single-stack European-style pistol (generic) | "Orsolini" + pistol/firearms: no maker found (Italian makers listed were all different names). |
| `weapon.pump` | Bramwell Fieldpump | pump shotgun, 5 shells | A generic tube-fed pump | "Bramwell" gunmaker: none. A 19th-c. Sheffield metalworker "Bramwell Brownhill & Co." exists, with no firearms and no current mark. Low risk; keep "Bramwell Fieldpump" as one compound name. |
| `weapon.sawnoff` | Ashby coach gun, cut down | sawn-off double, 2 shells | A double-barrel cut down; "coach gun" is a generic term | "Ashby" + coach gun/shotgun maker: none found. |
| `weapon.rifle` | Whitcombe Hillsman | bolt hunting rifle, 4 rounds | A generic sporter | "Whitcombe" + rifle: none. **Renamed from "Ranger"**: Winchester and several others use "Ranger" for rifles. "Hillsman": none found. |
| `weapon.smg` | Vantine Mark II | submachine gun, 30 rounds (rare) | A WWII-surplus-style SMG (generic) | "Vantine" + SMG/firearms trademark: none (the nearest marks, VANTAGE and VANTA 9, are clearly distinct). |
| melee | ball bat, length of pipe, nightstick, folding knife, bottle, fists | melee | generic | n/a |

**Limits of this check:** web searches only. A USPTO TESS/TSDR search per name should be run before
release (filed with the oversight session's trademark scan).
