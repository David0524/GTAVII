# Interior furniture and prop set (1974 Manhattan): the list to scout free models for

FREE_ASSETS.md: $0 budget, licence gate CC0, PD, CC-BY 4.0 (credited). Every adopted asset is logged in docs/licenses/ASSETS.md.
Period rule: an object must plausibly exist in a 1974 Manhattan room. Most furniture there was made 1900-1970, so
period-plausible pieces are often older than 1974. Nothing post-1974 (STYLE_GUIDE anachronism list): no digital
displays, no plastic monobloc chairs, no LED or compact fluorescent lamps, no modern logos. Brands are stripped.

Priority: **A** hero rooms first (Corwin, homes) · **B** high-count Tier B · **C** nice to have.
Per item: the box primitive it replaces (src/interiors/kit/props.ts) and the variants needed for condition grades
(derelict/worn materials come from texture wear masks, not separate models, unless the shape changes).

## Seating
| Item | Pri | Replaces | Notes and variants |
|---|---|---|---|
| Bentwood café chair | A | `chair` | 1900-60s staple of diners, bars and homes |
| Wooden kitchen chair (spindle back) | A | `chair` | tenements; mismatched sets |
| Chrome-and-vinyl dinette chair | A | `chromeChair` | 1950s, tears and tape at worn |
| Swivel counter stool (chrome pedestal) | A | `stool` | diners and lunch counters |
| Bar stool (wood or chrome, footring) | B | `stool` | bars |
| Club armchair (upholstered, skirted) | A | `armchair` | lobbies and homes; antimacassar |
| 1940s-60s sofa (rolled arm or mid-century) | A | `sofa` | homes and lobbies |
| Diner booth (bench pair) | B | `booth` | kit-built shell OK; needs a proper upholstered seat mesh |
| Church pew or long bench | B | `bench` | church, waiting rooms |
| Barber chair (hydraulic, porcelain base) | B | `barberChair` | barber |
| Steel folding chair | B | n/a | union halls, back rooms, cops |
| Office swivel chair (wood or steel tanker) | B | n/a | offices, precinct |

## Tables and work surfaces
| Item | Pri | Replaces | Notes |
|---|---|---|---|
| Chrome-edged formica dinette table | A | `table` | kitchens and diners |
| Round pedestal café table | B | `table` | bars and cafés |
| Wooden kitchen table (enamel top) | A | `table` | tenements |
| Steel tanker desk (1950s) | A | `desk` | offices, precinct, hotel desk |
| Oak office desk | B | `desk` | older offices |
| Workbench | C | n/a | shoe repair, hardware back |
| Garment cutting table | B | `cuttingTable` | lofts |
| Pool table | B | `poolTable` | pool halls |

## Storage and fixtures
| Item | Pri | Replaces | Notes |
|---|---|---|---|
| Steel filing cabinet (4-drawer) | A | `fileCabinet` | offices |
| Dresser or bureau (veneer) | A | `dresser` | bedrooms |
| Wardrobe or armoire | A | n/a | SRO rooms (wardrobe marker) |
| Iron or brass bed frame | A | `bed` | tenements and SRO |
| Footlocker or steamer trunk | A | n/a | Teddy's room (stash) |
| Steel shelving, wooden shop shelving | B | `shelves` | shops |
| Glass display case | B | `displayCase` | jewellers, pawn, deli |
| Mailbox bank (brass) | B | `mailboxes` | lobbies |
| Coat rack and hat stand | C | `coatRack` | |
| Radiator (cast iron column) | A | `radiator` | everywhere |
| Clawfoot bathtub, pedestal sink, high-tank toilet | A | `sink` | bathrooms |
| Enamel gas range (1940s-50s) | A | n/a | kitchens |
| Rounded-top refrigerator (1950s) | A | n/a | kitchens |

## Lighting (incandescent and fluorescent only)
| Item | Pri | Replaces |
|---|---|---|
| Schoolhouse pendant (opal globe) | A | `globeLight`, `pendant` |
| Enamel warehouse pendant | B | `pendant` |
| Bare bulb with pull chain | A | `bareBulb` |
| Fluorescent wraparound fixture | B | `fluorescent` |
| Brass chandelier | B | `chandelier` |
| Table and floor lamps (fabric shade) | A | n/a |
| Ceiling fan (1930s) | C | `ceilingFan` |

## Appliances and electronics (pre-1974)
| Item | Pri | Replaces |
|---|---|---|
| Console TV (wood cabinet) and portable TV (rabbit ears) | A | `consoleTV` |
| Tube radio, transistor radio | A | n/a |
| Rotary desk phone, wall payphone | A | `payphone` |
| Mechanical cash register | A | `register` |
| Typewriter (manual) | A | n/a |
| Jukebox (generic, 1950s-60s) | B | `jukebox` |
| Cigarette machine | B | `cigaretteMachine` |
| Washer and dryer (coin-op) | B | `washer` |
| Sewing machine (treadle or industrial) | B | `sewingMachine` |
| Electric fan (oscillating) | B | n/a |
| Window AC unit (1960s) | B | n/a (kit box now) |

## Small props (clutter that tells the story)
Ashtrays, glass bottles (beer, liquor, milk), coffee cups and saucers, enamel pots, cans (labels stripped and
re-textured), newspapers and magazines (art slots), cardboard cartons, paper bags, typewriter, ledger books,
wall clock, alarm clock, crucifix and framed pictures (art slots), potted plants, umbrellas, shoes, hats on hooks,
suitcases, a footlocker, tools, a mop and bucket, trash cans (steel), garbage bags, mattress, blankets.

## Materials (CC0 scans, through the engine library: ENGINE_REQUESTS 9)
Plaster (painted, peeling), hex mosaic tile, subway tile, terrazzo, checker and plain linoleum, oak planks
(good and worn), carpet (two weaves), pressed tin, acoustic tile, painted brick, wood panelling, formica, vinyl,
chrome and brushed steel, enamel, fabric (two weaves), concrete, marble (Grand Central), Guastavino tile.
