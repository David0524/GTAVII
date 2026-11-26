# Vehicle registry: Tenderloin '74

Every make and model here is invented. Shapes follow 1968–74 American design language: long
hoods, full-width chrome, quad lamps, vinyl roofs, opera windows, and 5-mph bumpers on the newest
cars. Each design is built from generator parameters (`src/vehicles/models.ts`), not traced from
any production vehicle.

**Trademark check (what was actually done):** informal web searches on 2026-11-26 for each
make name as a vehicle manufacturer, and each model name as a car model. This is **not** a USPTO
or legal clearance. Names that matched a real (even long-defunct) vehicle maker were replaced:

| Rejected | Why | Replaced by |
|---|---|---|
| Bramwell | Real US car brand, 1904–05 (Springfield, Ohio) | **Halloran** |
| Kessler | Kessler Motor Co., Detroit, 1917 (engines and cars) | **Corrigan** |
| Brennan | Brennan Motor Mfg. Co., Syracuse, built cars 1902–08 | **Garrity** |
| "Metro" (bus model) | The Flxible Metro was a real 1980s transit bus | **CT-40** |

Names avoided at design time because they were real model names: Regent, Statesman, Concours,
Sovereign, Marquette, Pacer, Lark, Medallion, Country Squire, Fleetline, Routemaster, Citiliner.

## Makes
| Make | Kind | Period flavour |
|---|---|---|
| Ostrander Motor Car Co. | Full-line Detroit-style maker | Old-money surname, like the big three's founder brands |
| Delacorte | Luxury division | French-sounding prestige name, typical of 1970s personal-luxury marketing |
| Whitcomb | Economy / compact division | Plain Yankee surname for thrifty cars |
| Garrity Cab Mfg. | Purpose-built taxi maker | Fleet-oriented maker, which New York cabs of the era had |
| Corrigan Coach | Transit bus builder | Industrial coachbuilder |
| Halloran Truck | Medium-duty trucks and chassis | Work-truck brand |

## Models
| id | Name | Class | Era plausibility | Notes / originality |
|---|---|---|---|---|
| `bancroft` | Ostrander Bancroft 4-Door | Full-size sedan | 1973–74: 5-mph front bumper, chrome rear bumper, quad round lamps, egg-crate grille, pillared sedan | Generic three-box proportions; no specific grille or lamp signature copied |
| `bancroft_patrol` | Ostrander Bancroft Patrol | Police sedan | Black body with white doors and roof, single "gumball" beacon, A-pillar spotlight, dog-dish hubcaps | Text is only "POLICE" plus a unit number; no crest, department name or real scheme |
| `tiverton` | Delacorte Tiverton Hardtop Coupe | 2-door personal luxury | 1972–74: long hood, stand-up vertical grille, quad rectangular lamps, opera window, landau vinyl, fender skirts, wire covers, whitewalls | The proportions are of the genre; the grille/lamp/roof combination is not any one car's |
| `bancroft_cab` | Ostrander Bancroft Taxi | Taxi (fleet sedan) | STYLE_GUIDE §6: most 1973 cabs were ordinary full-size sedans in yellow with a roof light box and door rate decals (1973 format: 60¢ first 1/5 mile, 10¢ each additional 1/5 mile) | No checker band, no fleet name. Registry `taxi` resolves here 70% of the time and to the Fareway 30% |
| `ferris` | Whitcomb Ferris Compact Sedan | Compact | 1968–74: dual 7" round lamps, horizontal grille, small chrome bumpers | Deliberately plain |
| `homestead` | Ostrander Homestead Wagon | Station wagon | Woodgrain side panel, roof rack, vertical tail lamps | Shares the Bancroft front clip, as period wagons did |
| `fareway` | Garrity Fareway Cab | Taxi | Upright greenhouse for headroom, 5-mph bumpers, roof light, door rate card | **Not** a Checker-style body: no rounded '50s fenders and no checker band; yellow is the only cab cue |
| `ct40` | Corrigan CT-40 Transit Coach | 40-ft city bus | Flat split windshield, roller destination sign, side windows with posts, rear engine louvres | **Not** a "fishbowl": no curved one-piece windshield or louvred upper rear. Livery is teal, cream and orange (invented); operator reads "CITY TRANSIT" |
| `b60` | Halloran B-60 Van Body Truck | Box delivery truck | Conventional cab, dual round lamps, painted bumper, ribbed aluminium box, dual rear wheels | Fleet lettering comes from an invented business list |
| `walkin` | Halloran Walk-In 10 Step Van | Step van | Stubby nose, flat split windshield, open walk-in door, boxy body | Generic multi-stop van form |
| `b80` | Halloran B-80 Rear-Loader Refuse Truck | Garbage truck | B-60-style cab with a rear-loader packer body and hopper | Reads "CITY SANITATION" only; no department name or seal |

## Lettering and decals
- **Taxi rate card:** a generic 1970s format, in the project's OFL period fonts. The roof sign
  says "TAXI".
- **Destination signs:** generic routes such as "34 CROSSTOWN" and "6 AVENUE UPTOWN". Route
  numbers are not trademarks, and no operator name is used.
- **Delivery fleet names:** invented local businesses ("DIMARCO BAKERY", "KOVAC BROS. MOVERS",
  ...) with fictional phone numbers in the period exchange style.
