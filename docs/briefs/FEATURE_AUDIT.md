# Open-world crime genre: complete feature audit for Tenderloin '74

The user asked: *"Really try to consider everything that GTA does."* This is the master checklist
of what players expect from the genre's flagship games, each line mapped to our 1974 version and
an owning stream. **Originality rule:** match the genre's breadth, never copy a specific game's
named systems, UI, missions, characters or signature mechanics. Where the genre has a modern
convenience (GPS, a cell phone, wanted stars), we find the **1974 version**. That's our identity.

Status: ✅ designed/assigned · 🆕 newly assigned here · ❓ user decision.

## Moving around
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Walk, run, sprint, jump, climb, vault | Rapier controller; ledge climb; vaults over hoods and railings | Engine + Characters | ✅ |
| **Stamina** | Sprint drains it; **the 1974 summer heat drains it faster**; it recovers when you walk; fitness grows with use; cops tire too. An accessibility toggle for unlimited sprint | Gameplay | 🆕 |
| Swimming | No water in the map; the rivers are horizon scenery. Water-main floods are wading depth | n/a | ✅ |
| Ragdoll and stumbles | Hit reactions and ragdoll blend | Characters + Gameplay | ✅ |
| Crouch and stealth | **Sneak, crouch, stealth takedowns, hiding in crowds** (Delphine's lane), noise from footsteps and guns | Gameplay | 🆕 |
| Fire escapes and rooftops | Stairwells to roofs, fire-escape climb and drop, roof-to-roof gaps | Interiors + Characters | ✅ |

## Vehicles
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Cars, taxis, buses, trucks | The original 1970s roster | Vehicles | ✅ |
| **Motorcycles and bicycles** | Period motorcycles (original designs), messenger bicycles, a delivery tricycle | Vehicles | 🆕 |
| **Emergency vehicles** | Ambulance (to the hospital), **fire engine and ladder truck** (fires happen), mail truck, a summer **soft-serve truck** (original, no brand jingle), the **mounted police horse** (a real Midtown unit) | Vehicles + Sim | 🆕 |
| Boats, planes | Out of scope for the map; the police helicopter only, as rare escalation | Gameplay | ✅ |
| Car customisation | Period-only upgrades and repairs at garages; paint and plates at chop shops | Vehicles + Gameplay | ✅ |
| Radio in cars | Original stations | Audio | ✅ |
| **Riding as a passenger / fast travel** | **Hail a cab and ride** (skip the trip or watch the city go by), **ride the subway** between stations | Gameplay + Sim + Engine | 🆕 |
| Cinematic driving camera | Auto-cruise to a waypoint in cinematic view (already planned) | Engine | ✅ |

## Navigation and map
| Feature | Our version | Owner | Status |
|---|---|---|---|
| **Minimap with discovery** | Icons appear **as you discover things**, not all at once (see "Map discovery" below) | UI chat | 🆕 |
| Pause map | The 1974 folding street map, annotated in pencil as you learn the city | UI chat | ✅ |
| **Waypoints and route** (no GPS in 1974) | Set a pencil waypoint on the map; the route shows as **a pencilled line on the minimap**. In cars a passenger lead or a cabbie can **call out turns** ("left on Thirty-Fourth"); signage helps | UI chat + Audio + Narrative | 🆕 |
| Fast travel | Cabs and the subway (above) | Gameplay | 🆕 |

## Map discovery (user requirement)
- Start with only the streets, your lead's home and the mission markers.
- Icons are **revealed by:** walking or driving past (a shop you saw open), entering it, an NPC tip,
  an overheard conversation, a newspaper ad, a phone call, a business card item, missions.
- **Shady places only appear once introduced:** fences, the chop shop, card games, the numbers
  drop, gun sellers.
- **Categories and filters:** food, clothes, shops, garages, payphones, call boxes, subway,
  services (barber, tailor, bank, hospital), crime contacts, jobs, side quests (stranger marks),
  businesses for sale, your properties, safehouses.
- The style is pencil marks, stamps and a coffee ring on the folding map; the minimap uses small
  period pictograms. Collectibles are **never** shown until found (optional hint items).
- Discovery state goes in the save; "new" marks fade after you look.

## Combat, police, consequences
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Weapons, melee, cover, lock-on | GAMEPLAY_BRIEF + CORE_SYSTEMS | Gameplay | ✅ |
| Weapon wheel or select | A mobile-first selector constrained by **what you can conceal** | UI chat + Gameplay | 🆕 |
| Wanted system | **Witnesses, call boxes, bribes, precinct reports** (no stars) | Gameplay | ✅ |
| Chases, arrests, death | CORE_SYSTEMS | Gameplay | ✅ |
| Fire | Fires from molotovs, car fires and arson; they spread to props; fire engines respond | Gameplay + Vehicles + Sim | 🆕 |

## The living city
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Traffic, pedestrians, schedules | SIM_BRIEF | Sim | ✅ |
| **Wildlife** | **Pigeons** (GPU flocks on ledges, sidewalks and coops; they scatter at running, cars and gunfire; old men feeding them in the parks), **rats** (subway tracks, alleys, garbage, they scatter from light), stray cats and dogs, the mounted police horse | Sim (behaviour) + Characters (bodies, animation) | 🆕 |
| Random events | Street encounters (CORE/ECONOMY/N4b) | Gameplay + Narrative | ✅ |
| Day and night, weather | **The full day/night cycle (TIME.md)**: missions with day or night windows skip time on start; sleep in your bed; heat haze, thunderstorms, rain, fog, brownouts | Engine + Gameplay + UI | 🆕 |
| Hydrants, steam, garbage | Opened hydrants spraying the street, steam stacks, garbage piles; sanitation trucks | Sim + Engine + Gameplay | ✅ |
| Graffiti | **1970s subway and wall graffiti** (original tags) that changes by act | Engine (decals) + Narrative (tags) | ✅ |

## Things to do (beyond missions and jobs)
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Activities and minigames | Pool, cards, OTB, the daily number, fight bets (ECONOMY) | Gameplay | ✅ |
| **Arcade games** | The Deuce arcade: playable **original** pinball and electro-mechanical games (a 1974 arcade is pre-video-boom; a few early video games, all original) | Gameplay | 🆕 |
| **Cinema and TV** | Watch invented films at the Deuce (short, original reels in the film look); **TV in bars and apartments** showing invented 1974 shows, the news, a ball game | Engine + Narrative + Audio | 🆕 |
| Eating and drinking | Diners heal; bars; **drunk effects** (camera sway, slurred controls, modest and short) | Gameplay | 🆕 |
| **Barbers and tailors** | **Haircuts, sideburns, moustaches and beards** per lead; tailoring | Characters + Gameplay | 🆕 |
| Tattoos | **Tattooing was illegal in NYC in 1974**, so an underground tattoo parlour is a period-true hidden place | Characters + Narrative + Interiors | 🆕 |
| Gym and boxing | A boxing gym: train strength and stamina; amateur bouts | Gameplay | 🆕 |
| Photo mode | Planned, plus Delphine's in-world camera | Engine | ✅ |
| Collectibles | With story payoffs (N4b) | Narrative + Gameplay | ✅ |

## Progression
| Feature | Our version | Owner | Status |
|---|---|---|---|
| **Skills per lead** | Stamina, strength, shooting, driving, stealth, lockwork. They improve with use and **start different per lead** | Gameplay | 🆕 |
| Relationships | Per-lead relationships, bail-outs, lending | Narrative + Gameplay | ✅ |
| Money, property | ECONOMY | Gameplay | ✅ |
| Stats and completion | A stats page (distance, arrests, bribes paid, fares…) and a **completion checklist** | UI chat + Gameplay | 🆕 |
| Achievements | An in-game list (original names) | UI chat | 🆕 |

## Story presentation
| Feature | Our version | Owner | Status |
|---|---|---|---|
| **Cutscenes** | In-engine cinematics in the 35 mm film look, authored as data timelines, seamless in and out of gameplay, skippable, subtitled | UI & Cinematics chat (runtime and tools) + Narrative (scripts and shot lists) + Characters (performance, faces) + Audio | 🆕 |
| Phone calls | Payphones and the Corwin's answering service | Gameplay + Narrative | ✅ |
| Character switching | The reel-change cut | Engine | ✅ |
| Mission replay, checkpoints, skip after repeated fails | Mission runtime | Engine | 🆕 |

## Front end and platform
| Feature | Our version | Owner | Status |
|---|---|---|---|
| Title screen, menus, loading | The film-look title, period typography; no loading screens in play | UI chat | 🆕 |
| Settings (about 50) and remapping | CONTROLS.md roadmap | UI chat | ✅ |
| Accessibility | Subtitles, colour-blind modes, hold/toggle, unlimited sprint, aim assist, skip timers | UI chat + Gameplay | ✅ |
| Saves and profiles | Local versioned saves (cloud later) | Engine | ✅ |
| Credits, legal, attributions | ODbL, CC0/CC-BY credits screen | UI chat | 🆕 |
| Online or multiplayer | Not planned | ❓ user | ❓ |
| Cheats | Not planned (the assist settings cover it); ask the user | ❓ user | ❓ |

## The subway (user requirement)
- **Real 1974 stations inside the bounds** (the chunks already hold subway-entrance POIs):
  - 23rd St on the Broadway–7th Ave, Broadway and 6th/8th Ave lines;
  - 28th St;
  - 34th St–Penn Station;
  - 34th St–Herald Square;
  - 42nd St–Times Square and 42nd St–8th Ave (Port Authority);
  - PATH at 33rd St.

  The narrative chat verifies the 1974 line names; use generic period signage.
- **Stations are interiors:** stairs, token booths (a 35¢ token), turnstiles to jump (a witnessed
  crime), mezzanines, platforms, tiled walls, and **graffiti-covered trains** (original tags,
  the iconic 1970s look), rats on the tracks, the third rail (lethal), and tunnels between
  stations.
- **Trains run** on a schedule (Sim), with original 1970s-style subway cars (Vehicles). Ride
  them for fast travel or a getaway; fights on a moving train; cops board at the next station.
- **At least one story mission and several side pieces underground** (Narrative). The setting
  has to be unique to the subway: tunnels, moving trains, the token booth, the train yard
  beyond the map as a horizon.
- Owners: **Interiors** (stations and tunnels), **Vehicles** (train cars), **Sim** (train
  schedule, platform crowds, rats), **Audio** (train screech, rumble through gratings),
  **Narrative** (missions), **Gameplay** (fare evasion, getaways, third-rail hazard).
