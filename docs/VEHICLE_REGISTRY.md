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
| Tarrant | Tarrant Motor & Engineering Co., Melbourne, early car builder | **Calder** (motorcycles) |
| Brannock | A well-known trademark (shoe-measuring device), though not a vehicle maker | **Calder** |
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
| Halloran Truck | Medium-duty trucks and chassis, emergency and service bodies | Work-truck brand |
| Calder Motor Cycle Co. | Motorcycles (road and police) | Searched: no motorcycle maker of that name found |
| Wexford Cycle Works | Bicycles and carrier trikes | Searched: no bicycle brand found |
| Pell Railcar Works | Subway cars | Searched: no railcar builder found. Avoids "Car & Foundry" naming and real R-contract numbers |

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

### Added in session 3
| id | Name | Class | Era plausibility | Notes / originality |
|---|---|---|---|---|
| `medic` | Halloran Medic 3 Modular Ambulance | Ambulance | Van cab with a modular box, a period twin-beacon light bar, box-corner beacons, an orange band | Lettering is "AMBULANCE" only, with no service name or star-of-life artwork |
| `pumper` | Halloran Cab-Forward Pumper | Fire engine | 1970s cab-forward apparatus with chrome compartment doors, a side ladder, an extended front bumper, a bell, a red and white cab | Door shield reads "FIRE DEPT. / ENGINE nn": generic, with no crest or real department |
| `ladder` | Halloran Rear-Mount Aerial Ladder | Ladder truck | Single-chassis rear-mount aerial on a turntable, ladder over the cab | Not a tractor-drawn tiller (a possible later addition) |
| `courier` | Halloran Courier Right-Hand-Drive Mail Van | Mail truck | Right-hand drive like period mail vans, with an open walk-in door | Plain white with "MAIL" and a blue band. No postal-service name, eagle, or red-white-blue chevrons |
| `scoop` | Halloran Walk-In Soft-Serve Truck | Ice-cream truck | Walk-in body with a service window, awning and roof cone sign | Cream and pink, no face or character, "Soft Ice Cream". Any jingle is the audio stream's and must be original |
| `calder650` | Calder Twin 650 | Motorcycle | 1970s standard: parallel twin, round headlamp, chrome fenders, twin shocks | Generic period layout |
| `calder_patrol` | Calder Patrol 650 | Police motorcycle | Fairing, saddlebags, beacon on a mast | White and black, no department marks |
| `wexford_roadster` | Wexford Roadster | Messenger bicycle | Diamond frame, rack, flat bars | |
| `wexford_carrier` | Wexford Carrier Trike | Delivery tricycle | Front box between two wheels | |
| subway car | Pell Type 7 | Subway car | 1970s painted-steel car: three double doors a side, longitudinal orange benches, poles, straps, fluorescent strips | Not a replica of any R-contract car: no fluted stainless sides, no specific end design, no real line or route bullets on the sign |

**Graffiti.** All generated tags are invented from syllables. A blocklist keeps famous real
1970s writers' and crews' names out. The narrative stream supplies the canonical tag set
through `setGraffitiTags()`. Car-card ads are invented, with no real products or brands.

## Lettering and decals
- **Taxi rate card:** a generic 1970s format, in the project's OFL period fonts. The roof sign
  says "TAXI".
- **Destination signs:** generic routes such as "34 CROSSTOWN" and "6 AVENUE UPTOWN". Route
  numbers are not trademarks, and no operator name is used.
- **Plates:** generic period plates, dark blue characters on goldenrod with "NEW YORK". State
  names are public facts. Exact 1974 colours: **(verify)**. Plate numbers are random.
- **Delivery fleet names:** invented local businesses ("DIMARCO BAKERY", "KOVAC BROS. MOVERS",
  ...) with fictional phone numbers in the period exchange style.
