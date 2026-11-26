# Project: "Tenderloin '74": Narrative, Characters, Missions & World-Building Brief

You are the narrative team for a GTA-style open-world game that runs entirely
in the browser, on desktop and on phones held in landscape. A separate engine
team is building the city, the systems and the hook APIs you will plug into.
Your job is everything that makes the city mean something: story, characters,
missions, dialogue, and the texture of daily life. This is a multi-session
build. Keep NARRATIVE_PROGRESS.md as your source of truth. Read it at the
start of every session and update it at the end.

## Scope boundaries (important)
IN scope: story and structure, the cast, missions and side activities,
dialogue and barks, ambient world-building (invented businesses, signage
text, newspapers, radio, graffiti text, overheard talk), NPC archetype
definitions, and mission and trigger data that uses the engine's hooks.

OUT of scope: engine code, rendering, physics, city geometry, traffic and
pedestrian simulation, audio mixing, UI implementation. Do not edit `src/`
or `tools/`. If you need a capability the hooks don't provide, write a short
request in ENGINE_REQUESTS.md (what, why, which mission needs it, and a
fallback if it's refused), then design around the fallback until it ships.

## Setting (fixed by the engine; build on it, don't contradict it)
- Manhattan, summer 1974. The historic Tenderloin district runs from roughly
  23rd St to 42nd St between Fifth and Seventh Avenues. There's a playable
  buffer from about 19th St to 44th St and from Eighth/Ninth Ave across to
  Park Ave South.
- The city geometry is real: actual street grid, real building footprints
  and heights, and nothing built after 1974. Streets carry 1974 traffic
  directions: Fifth Ave southbound, Sixth Ave northbound, Seventh Ave
  southbound, Eighth Ave northbound, Broadway southbound; 23rd, 34th and
  42nd Streets are two-way.
- The landmarks are present and can be used as locations: the Flatiron
  Building, Empire State Building, Madison Square Park, Penn Station / Madison
  Square Garden (1968), Herald Square and the department store on it, the
  southern edge of Times Square and 42nd Street, Hotel Pennsylvania, Hotel
  Chelsea, Bryant Park, the Garment District, the Flower District, the Fur
  District, Koreatown-era 32nd St (pre-boom), and the Chelsea edge. The
  newly finished World Trade Center towers are visible downtown.
- The player starts on the sidewalk in front of the Flatiron Building at
  dusk, facing north up Broadway. Your opening should earn that shot.
- Visual tone is a gritty 1970s New York crime film shot on 35mm: sodium
  light, wet asphalt, steam, haze, neon in fog. Write toward that palette.
- Day/night cycle and three weathers: clear, overcast and summer rain.
  Missions may require a time window or a weather.

## Historical texture to draw on (research it; don't fake it)
Ground the world in what the period actually felt like, from primary and
reputable secondary sources: the city on the edge of the 1975 fiscal
crisis; the aftermath of the Knapp Commission (1970–72) and what it did to
how cops, informants and the street related to each other; the garment
trade and its trucks, pushcarts and loft sweatshops; the 42nd Street
grindhouses and the Eighth Avenue strip; single-room-occupancy hotels; the
transit system's decline; summer heat, blackouts and brownouts; the music on
the radio and coming out of bars; the immigrant and migrant communities who
lived and worked here. Keep a SOURCES section in NARRATIVE_PROGRESS.md for
every period claim that drives a story beat.

## Hard content rules
1. **Every character is original.** Don't depict, name or thinly disguise
   real people, living or dead: no real cops, criminals, politicians,
   celebrities or business owners. Real public institutions (NYPD, the
   Transit Authority, the city's newspapers as a category) may exist in the
   background, but no real individual within them appears or speaks. The
   same applies to real criminal organisations: invent your own crews.
2. **Invented businesses, brands and products only.** No real company names,
   logos, products, cars, songs, films or slogans. Real landmarks and street
   names are fine. Keep a running BUSINESS_NAMES.md registry (name, trade,
   address or block, era-plausibility note) so the engine can put names on
   signage. Names must not collide with real trademarks; search before you
   commit one.
3. **Mature but not exploitative.** It's a crime story, so violence,
   corruption, drugs and the sex trade can exist in the world. Treat the
   people involved with dignity and interiority, not as props or
   punchlines. Nothing sexual on screen. Nothing involving minors in any
   sexual, abusive or violent context. No torture-as-gameplay.
4. **Period prejudice is depicted, never endorsed.** Characters may hold
   1974 attitudes; the writing must not. Avoid slurs in dialogue (imply
   rather than print them). Give communities who were targeted in the period
   real voices, and write them through authentic research, not stereotype.
5. **No glorification of real tragedies.** Don't use real crimes, victims or
   disasters as mission material.
6. **No real-world harm.** No functional instructions for weapons, drugs or
   crimes, even in in-world documents.

## What to deliver (work in phases; finish each before moving on)
**Phase N1: Story bible.** Premise in one paragraph; the central dramatic
question; tone and themes; three to five pillars that every mission must
serve; the player character's situation and why they stay in the
Tenderloin; a map of the district's social geography (who controls, works
or lives where, by real block); a timeline of the summer of 1974 in-world,
separating real background events from invented ones.

**Phase N2: Cast.** A protagonist, 8–14 principal characters and
20–40 secondary ones. For each: id, name, age, origin, occupation,
want and need, secret, speech pattern (with three sample lines), home
block and haunts (real addresses or intersections), daily schedule (for the
NPC system), relationship edges to the others, and arc across the story.
Also write visual notes as a wardrobe and silhouette brief; the engine's
bodies are generic, so you specify palette, clothing and props.

**Phase N3: Story structure.** Acts, chapters and the main mission chain,
about 25–40 story missions at 8–20 minutes each. Include branching points
(two or three meaningful ones, with consequences that persist through save
state), the ending or endings, and how the open world changes between acts:
time of day, weather, closed streets, new ambient NPCs and graffiti, shuttered
businesses.

**Phase N4: Mission specs.** One file per mission, in the data format below:
giver, prerequisites, start trigger, objectives, fail states, checkpoints,
rewards, flags set, dialogue references, required time and weather,
locations by real intersection or landmark, the vehicles and NPC archetypes
used, and a mobile playability note. Also design 15–30 repeatable side
activities, such as cab fares, deliveries for the garment trade, newspaper
runs, photo assignments using the engine's photo mode, and street races
obeying 1974 one-ways.

**Phase N5: Dialogue.** All lines in the dialogue format, with speaker,
emotion tag, conditions, and choices (at most four). Every line must work as
a subtitle: no more than about 90 characters per line, and nothing that only
works as audio. Also write barks for pedestrians and drivers by archetype
(greetings, complaints, reactions to rain, car horns, collisions, the player
running past), at least 30 per core archetype.

**Phase N6: Ambient world.** The business name registry; neon and sign text;
newspaper front pages (invented mastheads) per in-game week that echo story
progress; radio station identities, DJ patter and invented song titles;
graffiti tags and slogans; posters and handbills; subway-grating overheard
conversations; and the contents of three or four enterable interiors per act
(a diner, an SRO lobby, a precinct house front desk, a loft workshop, a bar
or a cinema lobby).

**Phase N7: Integration.** Put everything under `content/` in the formats
below, validate it with the engine's schema checker once it exists, and
play through each mission headless with the engine's test hooks. Report
broken references, unreachable triggers and pacing problems.

## The engine contract (draft; the engine team owns it and ships it in engine Phase 7)
Design against these shapes now. Use real places, not coordinates: refer to
locations by landmark id, by intersection (`"W 31st St & 7th Ave"`) or by
address (`"222 W 23rd St"`), and the engine resolves them. Every id is
`snake_case` and namespaced (`char.`, `mission.`, `flag.`, `item.`, `loc.`).

```jsonc
// content/missions/<id>.json
{
  "id": "mission.example_delivery",
  "title": "string",
  "giver": "char.some_id",
  "requires": { "flags": ["flag.x"], "notFlags": [], "act": 1, "timeWindow": ["19:00", "02:00"], "weather": ["any"] },
  "start": { "type": "talk", "who": "char.some_id", "at": "loc.some_place" },
  "objectives": [
    { "id": "o1", "type": "goto",   "to": "W 34th St & 6th Ave", "radius": 15, "text": "Get to Herald Square" },
    { "id": "o2", "type": "enter_vehicle", "vehicle": "vehicle_role.cab" },
    { "id": "o3", "type": "deliver", "item": "item.package", "to": "loc.some_loft", "timeLimitSec": 300 },
    { "id": "o4", "type": "follow", "target": "char.x", "keepWithinM": 60 },
    { "id": "o5", "type": "enter_interior", "marker": "interior.diner_a" },
    { "id": "o6", "type": "photo", "subject": "char.x", "minScreenFraction": 0.1 },
    { "id": "o7", "type": "wait", "until": "21:30" },
    { "id": "o8", "type": "dialogue", "script": "dlg.example_scene" }
  ],
  "fail": [{ "type": "target_lost" }, { "type": "vehicle_destroyed" }, { "type": "timer" }],
  "checkpoints": ["o2", "o4"],
  "rewards": { "money": 40, "setFlags": ["flag.example_done"], "unlock": ["mission.next"] },
  "mobile": "Notes on touch playability (see rules below)"
}

// Triggers: content/triggers/<id>.json (ambient events, phone calls, side activities)
{ "id": "trigger.x", "volume": { "at": "loc.some_place", "radius": 20 }, "when": { "flags": [], "time": ["20:00", "23:00"], "weather": ["rain"] },
  "once": true, "do": [{ "type": "start_dialogue", "script": "dlg.x" }, { "type": "spawn", "spawn": "spawn.x" }] }

// Spawn points: content/spawns.json
{ "id": "spawn.x", "at": "W 28th St & Broadway", "side": "nw_corner", "heading": "uptown", "kind": "npc|vehicle|player", "archetype": "npc.x" }

// Interior entry markers: content/interiors.json (the engine places the door on the real facade)
{ "id": "interior.diner_a", "address": "string real address", "facade": "street|avenue", "name": "invented name", "kind": "diner|sro|bar|precinct|loft|cinema|shop", "hours": ["06:00","01:00"] }

// NPC archetype slots: content/npc_archetypes/<id>.json
{ "id": "npc.garment_cart_pusher", "behaviour": "walker|loiterer|vendor|commuter|driver|beat_cop|worker", "palette": ["#..."], "wardrobe": "text brief",
  "props": ["handcart"], "schedule": [{ "from": "07:00", "to": "18:00", "area": "Garment District", "activity": "work" }],
  "density": { "day": 0.6, "night": 0.1 }, "barks": "barks.garment" }

// Dialogue: content/dialogue/<id>.json
{ "id": "dlg.x", "lines": [ { "id": "l1", "speaker": "char.x", "emotion": "wry", "text": "≤ 90 chars", "if": "flag.y" },
  { "id": "c1", "choices": [ { "text": "short", "goto": "l5", "setFlags": ["flag.z"] } ] } ] }

// Save state: the engine owns the file; you own the flag namespace. Narrative state lives in:
{ "flags": { "flag.x": true }, "missions": { "mission.x": "locked|available|active|done|failed" }, "act": 1,
  "money": 0, "inventory": ["item.x"], "relationships": { "char.x": 0 } }
```

Keep flags minimal and documented in `content/FLAGS.md` (who sets each one,
who reads it, and what changes in the world because of it).

## Mobile-first mission design rules
The game must play well on a phone in landscape with touch controls: left
thumb on a floating move stick, right thumb dragging to look, and a few
large buttons on the right edge.
- No objective may require precise free-aim or rapid multi-button combos.
  Pursuits, tails and escapes should test route knowledge and timing, not
  twitch accuracy.
- Keep segments short: a checkpoint at least every five minutes of play,
  and missions that survive the app being backgrounded and resumed.
- Dialogue choices are at most four short options (about 40 characters
  each), shown as large buttons. No timed choices under six seconds.
- Objective text is 40 characters or fewer and names a real place ("Get to
  Penn Station, 7th Ave entrance") so it fits a phone HUD and teaches the
  map.
- Never rely on hover, right-click or keyboard-only inputs. Never put
  required information only in audio.
- Navigation uses the real grid. Write directions the way a 1974 New Yorker
  would give them ("two blocks downtown, east side of Seventh").

## Process
- At the end of each phase, write a short self-critique in
  NARRATIVE_PROGRESS.md against the pillars, the content rules and the
  mobile rules, then stop for review.
- Ask before cutting scope, before adding a branching point, and before
  any story beat that touches a sensitive real-world subject.
- Start by reading this brief, PROGRESS.md (engine status), DATA_SOURCES.md
  (what the city contains) and `public/data/world.json` (landmark list).
  Then propose your premise, three alternative loglines, the pillars, and a
  rough act structure, and begin Phase N1.
