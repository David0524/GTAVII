# Design: chases, arrests, death, inventory, car theft, vehicle and gun quality

**Owner:** Gameplay. **Partners:** Vehicles, Sim, Characters, Interiors, Engine, Audio, Narrative.
Written by the oversight session after the user asked: *"What do police chases look like? Arrests?
What happens when you die? Inventories. Stealing cars. Car physics and drivability based on
quality. Gun quality."* This builds on the user's police decision (witnesses, call boxes, bribes,
no wanted stars) and on ECONOMY.md. **Period truth is the design lever:** 1974 police have radios
but no computers, cars have no immobilisers, and guns are revolvers and shotguns. That gives
these systems their own character instead of copying other games.

---
## 1. Police chases

### What the police know
- Police act on **reports** (per precinct) holding a **description** (clothes, build, lead, car
  colour and class, partial plate) and a last-known position. Units **don't know where you are
  unless one of them sees you.** Dispatch is by radio, with a delay of a few seconds between a
  sighting and the other units hearing it.
- Severity sets the response: a foot post checks it out; radio cars cruise the sector; several
  cars converge; plainclothes; Emergency Service trucks and roadblocks; a helicopter (very rare,
  for the worst cases only).

### Phases (shown through the world, not a meter)
1. **Spotted:** a cop matches your description or sees a crime. They shout, their whistle blows,
   and the radio crackles "unit in pursuit".
2. **Pursuit:** units with eyes on you chase; others head for your last call-out and set up
   **roadblocks** at avenue intersections and boundary blockers. Sirens show where they are.
3. **Lost contact:** when line of sight breaks, a **search area** grows from your last-known
   position. It shows on the minimap as fading search cones, and the radio relays guesses ("…last
   seen heading uptown on Seventh…").
4. **Searching:** units sweep streets, check parked cars that match, look into open interiors,
   and question witnesses (who may point the way).
5. **Cooling:** the report stays on file and decays over game time. Your description stays "hot"
   in that precinct until you change it or the report decays.

### How you get away
- **Break line of sight and stay out of it:** alleys, interiors, parking garages, rooftops, and
  the subway (a train leaving the station is a clean escape if you make it).
- **Change the description:** a different outfit (wardrobe), a different car, swapped plates (at
  a chop shop), dumping the hot car somewhere quiet.
- **Use the 1974 map:** cops break the one-ways with sirens on, but the traffic jams near the
  edges are for everyone; the hills and narrow streets favour light cars.
- **Pay:** at low severity, a cop who catches you can be bribed (corruptibility per cop; the
  precinct's place on the pad helps). Trying to bribe an honest cop raises the severity.

### Pursuit behaviour
- **Driving:** sirens and lights; they run reds and the wrong way down one-ways carefully. 1974
  tactics: **box you in, block intersections, ram at high severity only, set roadblocks with
  cars across the lanes.** No modern PIT manoeuvre as standard (it's not 1974 doctrine); ramming
  is a desperation move.
- **On foot:** cops chase on foot when you bail. They tire, call for backup from call boxes, cut
  corners using the sidewalk graph, follow you up fire escapes and through buildings, and lose
  you in crowds. Foot chases are a centrepiece, not a fallback.
- **Gunfire:** cops draw at a severity threshold, warn first, and shoot at an active threat. They
  stop firing when bystanders are in the line of fire (sim pedestrians). Shooting a cop pushes
  you to the top tier immediately, citywide.
- **Mobile readability:** big audio and visual cues (sirens, radio, search cones). No precise
  inputs needed to escape; knowing the route wins.

---
## 2. Arrests ("busted")
- **Surrender is a choice:** a hands-up action. Cops ask you to surrender when they have you
  cornered, stunned or tackled. Low severity lets you talk or bribe right there.
- **The arrest is shown, not a cut to black:** cuffs, the back seat of the radio car, then a
  short **booking sequence at the precinct** (a mugshot flash, prints, the property clerk
  bagging your stuff) as a reel-change cut, in the same film language as the character switch.
- **Getting out (the player picks one):**
  - **Bribe the desk sergeant** (only if this precinct is on the pad and severity is low enough).
  - **Call a lawyer** from the precinct payphone: costs money, gets you out fast, and gets your
    property back.
  - **Get bailed out by another lead:** switch to Delphine or Nick, who goes to the precinct and
    pays. This builds relationships, and they bring it up later.
  - **Spend the night in holding:** a time skip to morning. Free, but you lose the night (time-
    windowed missions and jobs are missed) and the property stays with the clerk.
- **What you lose:** illegal items (guns, stolen goods, burglary loot) and a share of cash on hand
  go to the **property clerk**. The lawyer or the bribe route gets them back; otherwise a
  **property-clerk retrieval** errand later, for a fee, with a chance some of it went missing.
- **Records:** each arrest is filed. Repeat offenders are recognised faster in that precinct
  (worse descriptions for you, higher starting severity), and the record decays slowly.
- **Missions:** if you're arrested in a mission, you retry from the checkpoint with the
  inventory as it was there. No double penalty.

---
## 3. Death ("wasted")
- An ambulance and the ER at an **invented hospital** (the narrative chat names it), shown with a
  short reel-change cut. You wake at its exit, some hours later.
- **The bill:** a share of the cash on hand (scaled to how bad it was, capped), and the
  **ambulance attendants may "lose" some of your cash** (period-true and funny). Savings are
  safe.
- **You keep your weapons and items,** but half the loose ammo is gone. Guns stay because the
  hospital doesn't take them; the police do (see arrests). That gives the two failure modes
  different texture.
- **Injury carry-over:** you leave bandaged, with reduced max health for a few minutes. A diner
  meal or rest at home clears it.
- **Missions:** retry from the checkpoint with the inventory restored to that checkpoint. Free
  roam keeps the consequences.
- The other leads are unaffected and can be switched to immediately.

---
## 4. Inventory (per lead, physical, period)
- **What you're wearing decides what you can carry.** Pockets hold cash, keys, small items and a
  **snub revolver**. A jacket or sport coat conceals a service revolver or pistol. A long coat
  conceals a sawn-off. A shotgun or rifle is **visible** unless it's in a bag or a car trunk.
  Visible weapons make witnesses report you and cops stop you. On a 95° summer day a long coat
  draws looks too.
- **Storage:** the car trunk (each car instance keeps its own contents), the safehouse stash
  at each lead's home, safety deposit boxes at the bank branch, and business back offices you
  own.
- **Money:** cash on hand (losable) versus savings (bank or safe, protected).
- **Item condition persists** (see guns); stolen goods are marked hot until fenced.
- **UI:** a radial or grid "pat down your pockets" view, mobile-first with large targets,
  showing concealment status per item.

---
## 5. Stealing cars (1974: no immobilisers)
Entry methods, each with its own risk, time and noise:
- **Unlocked:** common in 1974. Just get in.
- **Keys left in:** idling delivery trucks, cabs at a coffee stop, valet lots.
- **Slim jim:** a few seconds of a timing minigame, **quiet**. Teddy (keys and locks) is fast.
- **Break the window:** instant but **loud**, so nearby witnesses report you.
- **Hot-wire under the dash:** a short minigame (a simple drag-to-connect on mobile). Needed
  without keys. It can stall in the heat.
- **Carjack:** pull the driver out. Fastest and highest severity. The driver may fight, flee, run
  to a call box, or chase you on foot.
- **Tow it:** with a tow job or a stolen wrecker.

After the theft:
- The **owner reports it** (plate, colour, class). Cops who see the car recognise it. The car is
  **hot** until you swap plates at a chop shop, sell it on the wanted list, or the report decays.
- **Personal cars:** each lead has one (Nick's big sedan). A garage you own can store stolen
  cars, but they stay hot until papered.
- A stolen cab can take fares (risky: a passenger may recognise it's stolen).

---
## 6. Vehicle quality, condition and drivability
Every car instance has **class** (from `src/shared/traffic.ts`) × **trim tier** × **condition**:
- **Trim tier:** economy, standard, luxury, police (heavy-duty package), commercial. It sets
  power, weight, braking, suspension and steering feel. **Police cars out-run the average
  civilian car,** so a good getaway car is something you earn, steal or prepare.
- **Condition** (from the variant seed for traffic, persistent for owned cars): mileage, worn
  shocks (more wallow and bounce), bald or bias-ply tyres (less grip, terrible in rain), worn
  alignment (pulls to one side), brake fade, a tired engine (less power, misfires), a weak
  radiator.
- **1974 failure modes that make driving characterful:**
  - **overheating in the summer heat**: a temperature needle, steam, then power loss in
    stop-and-go traffic;
  - **vapour lock and stalling** after a hot stop;
  - a **flooded carburettor** on restart;
  - a battery that won't turn the engine over.

  All of them are readable and rare enough to be funny rather than frustrating, and they never
  happen in scripted mission moments unless they're designed in.
- **Damage changes handling:** a bent front end pulls; radiator hits start an overheating clock;
  a shot-out tyre goes flat and bumps on the rim; engine damage leads to smoke and lost power; a
  broken headlight at night matters.
- **Weather:** rain on oily 1974 asphalt is slick, especially in the first minutes of a storm.
- **Maintenance:** garages repair, tune and fit better tyres; a garage you own does it cheaply.
  Period upgrades only: better tyres, heavy-duty suspension, a bigger carburettor, a police-
  package engine (from a fence). No modern parts.

---
## 7. Gun quality
Every firearm instance has an **invented model** (registry, no real makes) × **quality tier** ×
**condition**:
- **Tiers:** cheap street guns (inaccurate, unreliable, cheap, easy to conceal), standard
  service-grade, and quality (accurate, reliable, expensive, rare).
- **Stats:** accuracy and spread, recoil, rate of fire, reload, **reliability (chance of a jam
  or misfire, worse in poor condition; clearing a jam is a quick, readable action, one tap on
  mobile)**, **concealability (size versus clothing)**, **noise (witness radius)**, damage
  falloff, and value at a fence.
- **Condition:** degrades with use, rain and dirt. **Clean and maintain at a safehouse** (a quick
  action) to restore reliability. Guns taken from enemies come in random condition.
- **Sources (period-true):** handguns in NYC under the Sullivan Act are illegal without a
  permit, so they come from **fences, the street, and enemies**. Long guns come from a sporting-
  goods counter with paperwork, or from fences. A **police service revolver** in your inventory is
  explosive if a cop finds it.
- **Modifications:** period only, for example sawing off a shotgun (more concealable, less
  range), grips. No modern attachments.

---
## Who does what
- **Gameplay:** pursuit and search state, police tactics AI (driving and foot), surrender, arrest
  and booking flow, bail and the property clerk, death and the hospital flow, inventory and
  concealment, theft mechanics and hot cars, gun instances, quality, jams and maintenance, and
  how vehicle condition feeds the vehicles API.
- **Vehicles:** trim tiers and condition parameters in physics; overheating, vapour lock, stall
  and flooding; damage-to-handling; police-package tuning; trunks; entry points (door, window,
  dash) for the theft actions; plates as a visible, swappable part.
- **Sim:** police cars and foot cops as pursuit agents (box-in, roadblocks, foot chase on the
  walk graph, tiring); cops recognising hot plates and descriptions on sight; car owners chasing
  or reporting; bystanders in the line of fire suppress police shots.
- **Characters:** hands-up and surrender, tackles, cuffing, being put into a car, slim jim,
  window smash, hot-wire under the dash, carjack pull-out and its variants, foot-chase vaults and
  fire-escape climbs, jam clearing, bandaged-injury locomotion.
- **Interiors:** the precinct booking room, holding cell and property clerk window (hero); the
  hospital ER exit (hero, invented name); cops pursuing through interiors; hiding spots that work
  during a search.
- **Engine:** the booking and hospital reel-change presentations, the search-cone minimap, the
  bail-out character switch, the pockets UI, inventory and records in the save.
- **Audio:** sirens by tier, radio dispatch chatter (the main heat cue), police whistles, foot-
  chase breathing, the overheating hiss and engine misfire, slim-jim and hot-wire foley, a gun
  jam click.
- **Narrative:** the invented hospital, the precincts' desk sergeants and corruptibility, the
  lawyer, the property clerk, booking and bail-out dialogue between leads, police radio lines
  and descriptions, and ambulance-attendant barks.
