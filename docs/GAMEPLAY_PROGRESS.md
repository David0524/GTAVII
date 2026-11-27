# GAMEPLAY_PROGRESS: combat, damage, police, items, economy

This is the source of truth for the gameplay stream: branch `claude/gameplay-74`, brief
`docs/briefs/GAMEPLAY_BRIEF.md`. The oversight session also assigned `CORE_SYSTEMS.md`,
`ECONOMY.md`, `FEATURE_AUDIT.md` (gameplay lines), `HOMES_AND_CARS.md` and `TIME.md`, all copied
into `docs/briefs/`. Read this first each session and update it last.

## How to run
| What | Command |
|---|---|
| Headless suite (104 tests, about 60 s) | `npx tsx --test src/gameplay/tests/*.test.ts` |
| CPU bench (writes `shots/gameplay/bench.json`) | `npx tsx tools/gameplay/bench.ts` |
| Test scene | `npm run dev`, then `/?gameplay=1` (`&station=lot\|yard\|block\|shop`, `&lead=teddy\|delphine\|nick`, `&touch=1`, `&overlays=0`) |
| Recorded frames | `npm run build && npx tsx tools/gameplay/record.ts [--only a,b] [--skip c]` → `shots/gameplay/*.png` plus `frames.json` (a note and the live game state per frame) |

`ENGINE_REQUESTS.md` lists the engine requests (12 so far, including relays to sim, characters,
vehicles and audio).

## Architecture
`src/gameplay/` is a **headless core** (no three.js or DOM; deterministic with a seeded `Rng`)
plus a thin test scene.

| Module | What |
|---|---|
| `index.ts` | `Gameplay`: the brief's contract plus the additions in ENGINE_REQUESTS 1. It wires every system, translates events into crimes, batches shots per frame, and does save/load. |
| `health/Health.ts` | Six injury regions, bleeding (clotting, treatment), partial regeneration, a vest, fire, a max-HP penalty, and fall, vehicle and occupant damage curves |
| `combat/weapons.ts`, `ballistics.ts` | Guns (magazine, full or per-round interruptible reload, recoil, bloom, spread). Batched hitscan against capsule hitboxes and the world, with material penetration (car doors yes, brick no), tyres and near-miss suppression. |
| `combat/melee.ts` | Windup, active and recovery phases; light, heavy, kick and grapple (shove, knee, throw); block, parry (with a ×2 counter) and dodge i-frames; poise, stagger and knockdown; environmental slams. NPC telegraphs are 1.2× + 0.22 s, so a phone player can react. |
| `combat/cover.ts`, `aim.ts`, `ai.ts` | Cover points from objects; touch lock-on, pad soft-lock and mouse friction; enemy AI. The AI does utility decisions at 4 Hz and runs on attack tokens (2, +1 per 4 enemies, capped at 4): cover, peek, suppress (including pinning a hidden target), flank, advance, charge, retreat, surrender, flee. It has morale, barks, and aim error that tightens with tracking. |
| `police/witnesses.ts` | Perception: sight cone, LOS and light; hearing by noise × canyon. Witnesses go shock → flee or report → run to a call box, payphone or patrol car → call → file. They can be intimidated or paid, a broken call box reroutes them, and children are never used. |
| `police/description.ts` | Witness memory with per-field confidence, merging, matching, and radio phrasing |
| `police/police.ts` | Per-precinct reports, heat and tiers, decay, the pad (payoffs), and dispatch: foot, radio car, sector cars, plainclothes, roadblocks, helicopter. Units have beat posts, hearing, sight cones and recognition. A unit goes stop → encounter → pursuit → lost → search, and arrests. Bribes have three outcomes: accepted, refused or insulted. Also: officer-down (citywide, unbribable, slow), radio relay delay, foot cops who tire, priors, chase `phase()` and `elapse()`. |
| `items/*` | `inventory.ts`: money in cents, savings, stash, gun states, skills, stamina. Also `shop.ts` (invariant-safe), `wardrobe.ts`, `phone.ts` (payphones, ringing, answering service), `guns.ts` (tiers, condition, jams, concealment) and `registry.ts`. |
| `props/props.ts` | Breakable furniture with stages: a hydrant geyser, papers, glass, coins, call boxes and booths that stop working. Props reset after 10 min when unseen. |
| `police/pursuit.ts` | Pursuit roles across the units chasing one suspect: **tail**, the car with eyes on them; **box**, the second car, only when the suspect is slowed below 4.5 m/s; **cutoff**, the rest, one per intersection ahead of or beside the projected route, never behind. Intersections are real lane-graph junctions (the sim's `nearestIntersections`, more than 60 m out), with roadblocks placed 15 m out on the junction arm that faces the suspect (the sim parks the car broadside on the nearest lane); **foot**; and **search**, spread along the projected route once contact is lost. The facade builds `PoliceMirror` in `bindSim` and feeds it the player's smoothed velocity, so the sim drives these as `pursue` / `boxIn` / urgent `goto` / `search` goals. These are 1974 tactics: no spike strips, no PIT. |
| `arcade/*` | The Deuce arcade (FEATURE_AUDIT "Arcade games"), original machines with no real titles or tables. **Night Owl** is a 1974 electro-mechanical pinball: fixed-step 1/480 s physics, two flippers with surface velocity, three pop bumpers, slingshots that kick only from their rubber face, O-W-L rollovers that light the pops, a drop-target bank for the bonus multiplier, outlanes and inlanes, a tilt (3 nudges in 4 s), and a replay at 60,000. **Dead-Eye Gallery** is an EM rifle gallery: three chain belts, ducks/rabbits/owl, a gold bell for +10 s, 45 s or 30 shots. `Arcade` handles 1974 coins (25¢ pinball, 10¢ gallery), replay credits left on the machine, and a five-line high-score card per machine; it's saved. The scene draws the cabinets as a canvas overlay (`scene/ArcadeOverlay.ts`; F9/F10). Touch: screen halves flip, pull the plunger, swipe to nudge; drag to aim, lift to fire. |
| subway in a chase (`Gameplay.enterSubway` / `rideSubwayTo`, sim's subway layer) | **Seen going underground** (a unit in pursuit or spotting): the radio names the station and line, and free cars race the train to the next two stops each way. A car goes only if its siren-driving ETA beats the train: the sim's `nextTrains` wait, plus a 25 s dwell, plus `trainTravel`, falling back to 95 s a stop. Stops follow the sim's per-line `order`, not z. A complex (Herald Square, Times Square) is staked once, and each car watches the entrance it reaches first. The report gets the chaser's own description. While those cars watch (10 minutes), the report doesn't cool underground. Staked cars park across from the exit, facing the stairs, and stop a suspect who comes up there. **Unseen**, or past the window, the subway stays the escape it was: 3× cooling, and the chasers lose you. A ride now ages the reports without the sleep/wait reset that sent every unit home. Test: `police.test.ts`. |
| parking (sim's `parkingRule`) | When the sim's parking layer is present, the kerb's legality is the sim's: alternate side, hydrants, hours. `exitCar()` registers an owned car left at the kerb (`registerParkedCar`), and `parkingRuleAt(x, z)` gives the UI the rule. The sim's `ticketIssued` (`carId`, with `fine` minor $15 or major $25) and `vehicleTowed` feed gameplay's `Ownership`, which keeps the money side: the fines owed, the boot at three unpaid, the pound ($40 plus $5 a day) and garages. Gameplay's own alternate-side ticketing turns off, so nothing is ticketed twice. Test: `simAdapter.test.ts`. |
| `police/bodies.ts` | **Bodies.** A body left lying gets found and called in as a homicide with no description, unless a witness already reported the killing. Time to discovery: 45 s on a full sidewalk up to 25 min in an empty spot, ×2 at night, ×1.6 indoors. You can carry one (both hands, so the movement rules apply: no gun, no climbing, no car); anyone who sees that reports `body_seen` (severity 3.6). You can put it down somewhere quiet (the clock restarts there; a hiding-spot marker means passers-by never find it), or put it in a trunk (one per car). A trunk body is found when the car is towed or `searchTrunk`ed, and that report carries the car and plate, with the registered owner as the suspect. The context button shows Carry, Put down and Into the trunk. Saved. Test: `bodies.test.ts`. |
| `cars/theft.ts` | Car records: entry methods, owner reports with plate/colour/class, hot cars, plate swaps, respray, trunks |
| `cars/ownership.ts` | Buying cars: a weekly lot and classifieds with hidden condition, inspection, haggling. Also titles, selling, lending, alternate-side tickets, the boot, the pound, garages. |
| `props/fire.ts` | Firebombs, car and prop fires, spread by exposure, burning, arson as a crime, fire engines |
| `meta/stats.ts`, `meta/travel.ts` | Stats and completion feed for the UI chat; cab meter (1973 rates) and the subway (token or jump, breaking contact) |
| `economy/*` | Free-roam money (ECONOMY.md), built by a Sonnet helper against my contracts and reviewed by me: jobs (cab, garment rush, locksmith, photos, bail skips, tow), crime (registers, safes, burglary, pickpocketing, collections, hijacks, the chop list), fences with saturation, gambling (the number, OTB, cards, pool, fights), property with weekly trouble, Nick's loans, and a deterministic 20-hour simulation (`economy_sim.test.ts` → `shots/gameplay/economy_curve.json`) |
| `data/narrativeAdapter.ts` | Narrative's systems content → gameplay schema (dollars → cents, tiers, `precinct.*`, street-range precinct areas), tested on a snapshot |
| `outcomes.ts` | Hospital (capped bill, the attendants' cut, half the loose ammo, a max-HP penalty) and custody (the clerk takes illicit items and 20% of cash; desk, lawyer, bail by another lead, or a night in holding; records and retrieval) |
| `time.ts` | Sleep and wait rules, rest quality (heatwave without AC), world advance (reports cool, restocks, autosave) |
| `player/stamina.ts`, `skills.ts` | Heat-aware stamina with an exhaustion gate, fitness and an unlimited toggle; six skills that grow with use and have diminishing returns |
| `save.ts` | v4 with migrations from v1 (the engine's draft shape, in dollars) through v4; fixtures in `tests/fixtures/` |
| `data/schema.ts`, `defaults.ts` | Content schema plus validator; placeholder content until narrative's files merge (`docs/GAMEPLAY_CONTENT_SCHEMA.md`) |
| `scene/*` | The `?gameplay=1` test scene: Rapier world query, stand-in visuals and FX, HUD and touch layer, debug overlays and radar, director (`window.__GP`) |
| `testing/StandInSim.ts` | Stand-in pedestrians implementing the sim binding, until the sim's behaviour API merges |

## Done (against the brief's "Done means")
- **Headless suite (66 tests)** covering:
  - damage, injury and regeneration maths (`health.test.ts`);
  - the witness → call box → report → response → decay → bribe → clear path (`police.test.ts`,
    `officer.test.ts`);
  - inventory and money through save and load, with v1/v2 migration fixtures
    (`economy.test.ts`);
  - shop buy/sell invariants, fuzzed over 25 seeds × 300 transactions plus a profit-loop check
    on every stocked item;
  - beyond the brief: combat, AI, melee, CORE_SYSTEMS rules, cars, time, and touch-only play.
- **Beyond the brief (oversight docs):**
  - stealth: sneak, footstep noise, suspicion, takedowns;
  - fire;
  - car theft, hot cars and ownership;
  - drive-by arcs;
  - lead abilities: Payroll, Evidence, Disappear, Old Beat;
  - time: sleep, wait, world advance;
  - fast travel; drinking, the barber, the boxing gym;
  - stats and completion;
  - the narrative content adapter.
- **Recorded test-scene frames** in `shots/gameplay/` (SwiftShader, software rendering):
  shootout behind cover, peek-fire, blind fire, morale breaking, melee closing, exchange and
  grapple-shove, a witness running to the call box, a witness on the call box, the report and
  radio line, the patrol response, being stopped, a bribe refused, a bribe accepted, a
  description broken by a change of clothes, a hydrant geyser, and the touch lock-on layout.
  Notes and the live game state per frame are in `frames.json`.
- **Touch-only playthrough notes:** below, backed by `tests/touch.test.ts`, where the camera
  points at the sky the whole time.
- **Honest critique:** below.

## Touch-only playthrough notes
Every combat action has a large button. None needs a precise drag on the look area (the look area
only moves the camera).

| Action | Touch | Why no precise aim is needed |
|---|---|---|
| Lock a target | AIM | Locks the best visible threat in a 160° cone around where the camera faces (pitch ignored), else the best anywhere in range |
| Switch target | ◀ ▶ | Cycles by screen side |
| Pick a limb | HEAD / BODY / LEGS (shown while locked) | Assisted fire goes at the chosen point; spread and lead skill still apply |
| Shoot | hold FIRE | Assisted fire at the locked limb; auto-reload when empty |
| Cover / peek / blind fire | COVER; AIM to peek; hold BLIND | Cover snaps to the nearest point in the stick direction |
| Reload / clear a jam | RELOAD (and one tap on a jam) | — |
| Melee light / heavy | tap / hold FIRE with a melee weapon or fists | Melee auto-faces the nearest opponent in the arc |
| Block / parry / dodge | hold GUARD / press GUARD on the telegraph / tap GUARD | NPC windups are ≥ 0.37 s, so there's time to react |
| Grab, shove, knee | GRAB; stick + GRAB shoves | A shove into a wall, car or booth slams |
| Lean on a witness | THREAT | Within 7 m |
| Interact (shop, payphone, closet) | USE | — |

The headless proof (`touch.test.ts`):
- a three-man gunfight won from cover with lock-on and hold-FIRE only;
- target cycling across all three targets and a limb pick;
- a melee hit, a dodge and a block driven by buttons.

The camera direction is set straight up for all of it.

### Sim services (sim claude/nice-sagan-2jh4m2): responders and the real cab
- **Responders.**
  - A fire's `engines` call becomes `sim.dispatch('fire', x, z)`.
  - A filed report with someone hurt (shooting, homicide, assault with a weapon, officer down or assaulted, hit-and-run) becomes `sim.dispatch('ambulance', x, z)` at the crime. That's one ambulance per 80 m scene, and only after someone has called it in.
  - The sim's `dispatched`, `responderArrived` and `responderLeft` events are forwarded as `notice`.
- **Cab.**
  - `hailCab()` calls the sim's `callCab` and waits for `cabReady` (the UI walks the player to `cab.kerb`).
  - `boardCab(x, z)` starts the meter and sets the vehicle context to `cab:<id>`.
  - On `cabRideArrived`, the fare plus tip for the distance driven is paid. With fare only, the player gets no tip; with nothing, it's a `fare_evasion` crime.
  - `leaveCabNow()` gets out early and pays for the distance so far.
  - Events: `cab {kind: called | ready | boarded | turn | arrived | gaveUp}`. `turn` carries the sim's `cabTurnAhead`, for "Call Your Turns".
  - `cabTo()` (pay, then skip time) stays as the fast-travel fallback.
- **Tests:** `simAdapter.test.ts`.

### UI contract for TOUCH_CONTROLS.md (the UI chat owns the layout; gameplay owns these)
| Need | Query / command | Event |
|---|---|---|
| Tap an enemy to lock | `lockables()` → `{id, chest, head, legs, threat}[]` (world points; UI projects and hit-tests), then `lockTarget(id)` | — |
| Swipe to switch target | `swipeLock(+1 \| -1)` (= `cycleLock`) | — |
| Soft aim assist strength | `setAssist('off'\|'low'\|'standard'\|'strong')` | — |
| Gyro aim | `setContext({ gyro: true })` forces assist off; `setAssist` can't turn it back on while gyro is on | — |
| Fire mode | `setContext({ fireMode: 'auto' \| 'tap' \| 'button' })`. With `auto` (the touch default), a gun out and a visible locked target, it fires by itself. With `tap` or `button`, the UI calls `setFiring` | `shot` |
| One context button | `contextAction()` → `{kind, label, target?}` or null; `doContextAction(moveDir?)` performs it. Priority: surrender/payOff (cop encounter) > exit vehicle > pick up gun > takedown > answer phone > enter vehicle (keys/carjack/slim jim) > payphone > open hydrant > leave/take cover | `context` (fires only when it changes, checked 4×/s; `{kind:null}` when nothing applies) |

| UiHost.touch helpers (UI 425f04e) | `touchMode()` returns 'drive' in a vehicle, and 'combat' with a weapon drawn, when shot at or hit in the last 6 s, or with a hostile in sight within 35 m; otherwise 'foot'. Also: `armed()`, `weaponList()` (wheel), `swapWeapon(±1)`, `drawWeapon()` (toggle, remembers the last gun), `coverLabel()` → Cover/Leave/Roll, `coverOrRoll(moveDir)` | — |

Context labels are kept short enough for a button (≤ 14 chars): Pay off, Hands up, Pick up .38, Takedown, Answer, Get in, Carjack, Steal car, Phone 10¢, Open hydrant, Go in, Knock, Locked, Talk, Cover.

**Talk** and **door** are covered through bindings, ENGINE_REQUESTS 15.
- `bindTalk`: the engine's mission runtime gives named characters, who rank right after the car and phone actions.
- `bindDoors`: Interiors' `doorsForChunk`. An unlocked door gives Go in; a locked one gives Knock during its hours and Locked outside them. Doors rank above cover.
- Fallback: an ordinary sim ped within 2 m gives "Say something" (a bark), ranked last.

Tests: `touch.test.ts` (11 cases; the camera aims at the sky in all of them).

### Movement rules (MOVEMENT.md; `player/movement.ts`, `movement.test.ts`)
The engine detects traversal and moves the body, and characters animate it. Gameplay decides what's allowed, what it costs and what it does to you. The engine calls `g.canMove(action)` before it commits, `g.traversed(action, metres)` after (to pay the stamina), `g.landed(height, rolled)` on landing, and `g.locomotion()` every frame for its multipliers.

**Heights (m).** Up to 0.40 is autostep, no action: granite kerbs (0.15–0.25) and stoop steps. 0.5–1.2 is a vault, taken at speed. 1.2–2.2 is a climb, with a hand plant. Up to 3.6 is a chain-link fence.

**Stamina (points; a fit lead has 60–100).**
- Sprint drains 11/s (more in the heat).
- Each action costs:

  | Action | Cost |
  |---|---|
  | Vault | 6 |
  | Climb | 14 |
  | Fence | 18 |
  | Ladder or fire-escape stairs | 1.6 per metre |
  | Pull down a drop ladder | 4 |
  | Roof jump | 12 |
  | Turnstile vault | 5 |
  | Shoulder barge | 10 |
  | Dodge roll | 5 |
- A hang-drop and a crouch are free.
- An action you can't pay for is refused ("out of breath"); you can always let go of a ledge.

**What's allowed when** (the `reason` greys the UI button):

| State | Can't |
|---|---|
| Carrying a body (both hands) | sprint, vault, climb, fence, ladders, roof jumps, aim/fire, melee, roll, cover, barge, get in a car ("put it in the trunk") |
| Carrying a crate | vault, climb, ladders, aim/fire, melee (it can be set down behind cover) |
| Carrying a bag | roof jumps ("not with the bag"); everything else is fine, and the bag goes over a fence first |
| Broken leg (wear ≥ 1) | sprint, vault, climb, fence, roof jump, turnstile vault (ladders are arms) |
| Limp > 0.3 | roof jumps |
| Crippled arm | climb, fence, ladders |
| Tipsy (intox 0.3) | roof jumps |
| Drunk (0.6) | vault, fence |
| Legless (0.85) | sprint, climb, ladders |
| Hands up | everything but crouch and let go |
| Cuffed | everything but crouch |
| In cover | sprint |
| In a car | everything but aim/fire (drive-by) |

**Locomotion layers.** Speed multiplier:
- limp: 1 − 0.45 × limp;
- carrying: body 0.55, crate 0.75, bag 0.95;
- drink: up to −30% at legless;
- bleeding: 0.92.

Drink also brings sway of 1.5–7.5°, wider turns (up to −35%), longer stops (up to +80%), and a stumble chance per kerb or stair taken at a sprint (up to 60%, from drink, a limp or low breath). The gait layer for characters is normal, limp, drunk, carry_heavy or tired.

**Combat movement** (multiples of run speed):
- strafe while aiming 0.42;
- jog with a pistol, still firing, 0.62;
- cover shuffle 0.32;
- cover-to-cover dash 1.0;
- crouch walk 0.45;
- blind-fire spread ×2.6;
- sprinting drops aim, and there's no firing at a sprint.

**Cover by object** (existing, `cover.ts`): parked cars are low cover, and the engine block stops rounds. Stoop walls are low (masonry), mailboxes and trash cans low, newsstands and phone booths high (thin, penetrable). A kerb is only partial cover (0.3) when you're crouched or down, and AI never picks it.

**Landing** (`landed`):
- free below about 2.9 m;
- a timed roll halves the damage up to 6 m;
- fall damage goes to a leg: unrolled, a limp from about 4.4 m and a broken leg from about 6 m;
- ragdoll from 6 m;
- about 14 m (five storeys) is fatal.

**Doors** (`bargeDoor`): chance per attempt (scaled 0.6–1.4× by strength):

| Door | Chance |
|---|---|
| Interior | 0.6 |
| Apartment (deadbolt and chain) | 0.25 |
| Shop back door | 0.15 |
| Police lock (brace bar), steel | never |

An arm injury cuts the chance to 0.6×, drink to 0.8×. Each attempt takes 1.3 s. Somebody else's door is vandalism, heard at 18–30 m.

**Turnstile** (`vaultTurnstile`): fare evasion, noise 10 m. It's a crime only if seen: the clerk watches their own turnstiles (witness chance 0.9 within 15 m), and a transit cop makes it an immediate stop.

### The tackle (a foot-chase finisher; narrative's `finish: "tackle"`)
- **API:**
  - The mission runtime calls `setChaseTarget(id, {catchDistanceM, lawful})` and `clearChaseTarget(id)`.
  - Within reach of the quarry, the context button shows **Tackle** (top priority after a cop encounter); `tackle()` also works directly.
  - Events: `tackle {target, hit, quarry, chance}` and `notice {kind: 'caught'}`.
- **Values:**
  - Reach 2.4 m in a 60° cone; on touch, auto-align gives 2.9 m and a 120° cone.
  - Costs 12 stamina, hit or miss.
  - Hit chance: 85% at a run (≥ 3 m/s), 45% walking. Minus 25% if the quarry is pulling away; ±12% for strength; reduced by a limp, drink or exhaustion.
  - Non-lethal: 5 hp, never below 1. The quarry is down 4 s (pinned 3 s). A caught chase quarry stays down for the mission to resolve; anyone else gets up and runs.
  - A miss sprawls you for 0.9 s.
- **Heat:** a lawful quarry (a purse snatcher, a bail skip) is a citizen's arrest, no crime. A bystander is assault; a cop is assault on an officer.
- **Allowed:** not while carrying anything, not with a broken leg, not legless, not in cover.
- **Restrain (the follow-up, for skip_board):**
  - After a tackle, the context button reads **Restrain** within 2 m. It works on a downed chase quarry only, never a bystander.
  - The quarry gets up with hands bound (`surrender`) and walks a pace behind you at up to 2.2 m/s.
  - Near a car, the button reads **In the car** (`loadQuarry`), and the quarry rides with it.
  - Events: `notice {kind: 'restrained' | 'quarryLoaded'}`.
- **Breaking free:**
  - A quarry on foot tries to bolt at about 1.2% a second, scaled by bravery. That's 4× when the escort lags (more than 4 m) and 3× with a gun out or a fight on.
  - The one button becomes **Hold on!**: 4 presses within 1.5 s, the same on touch (a single mashed button, as narrative asked).
  - If you fail, they're loose and running, and a chase target again, so the tackle is back on the button.
  - Events: `notice {kind: 'breakFree' | 'heldOn' | 'brokeFree'}`. A quarry set with `noBolt` (a story walk) never tries.
- **Test:** `movement.test.ts`.

#### vs GTA V / VI / RDR2 (reference-games rule, 2026-11-27)
- **What the references do:**
  - GTA V ends foot chases with a melee press or a tackle when close, with a ragdoll tumble.
  - RDR2 has a dedicated tackle at a sprint and a hogtie or "subdue" follow-up, with a miss stumble, and it's lawful against bounties.
  - GTA VI is expected to keep both.
- **Where we match:** one press at reach ends the chase non-lethally. A miss has a cost (stumble and stamina). Touch gets auto-align. The legality is contextual: a lawful quarry is no crime, a bystander is assault, a cop is assault on an officer, decided by our witness system rather than a meter.
- **Where we fall short:**
  - Restrain, escort and breaking free are in. A bolting prisoner is a short mash rather than RDR2's full struggle-and-chase scene; the chase that follows is ours.
  - The dive and ragdoll are characters' and the engine's work and not built yet.
  - The quarry's speed is estimated from AI state, not measured.
- **Plan:**
  - Tune the bolt rate in a touch playtest. Characters build the struggle animation from the `breakFree` events.
  - Measure quarry velocity from the sim when its motion is available.
  - Characters own the dive, the tumble and the stumble animations (events above).

### Sidewalk bumps (sim's `pedBumped`)
- **Brush:** nothing.
- **Angry pedestrian:** shoves back 35% of the time, a 0.5 s stumble for the player (`notice {kind: 'shovedBack'}`).
- **Knockdown:** `reckless` (severity 0.6, a crime only if seen). The third knockdown inside 30 s is `assault`.
- **Ownership:** the sim plays the reactions and the get-up.
- **Brawlers** (sim's `releasePed` hand-off):
  - An angry pedestrian who shoves back twice inside 60 s squares up. So does a robbed vendor with nerve when you're unarmed: hot dog 50%, newsstand 35%, pretzel and fruit 30%, coffee 25%; peddlers and the monte crew run.
  - Gameplay takes the ped over as a 55 hp fist fighter and drives it each frame (`moveReleasedPed`).
  - The brawl ends when someone's down, the brawler runs or gives up, the player walks off (25 m), or after 30 s. Then the ped goes back to the sim (`reclaimPed`), and a vendor returns to their cart.
  - They started it, so fighting back isn't a crime.
- **Test:** `simAdapter.test.ts`.

#### vs GTA V / VI / RDR2
- **References:** GTA V's shoulder-barge sends pedestrians stumbling and swearing, and repeated shoving starts fights. RDR2's jostling is weightier, NPCs remember you, and it can escalate to a brawl or a report.
- **Where we match:** graded contact (brush, stumble, knockdown) with angry pushback, and heat only through witnesses, rising with repetition.
- **Where we fall short:** escalation to a fist fight is in (shoved twice), but there's no longer memory: a ped forgets you after 60 s, and bystanders don't join in, as they can in GTA V.
- **Plan:** a friend joining a brawl (a second release from the same group), and a per-block grudge that lasts the game day.

### Street vendors (STREET_VENDORS.md, user decision 2026-11-27; `economy/vendors.ts`, `vendors.test.ts`)
Sim places and plays the vendors; gameplay owns the interaction. Adults only, invented brands, 1974 prices.

- **Menus and prices are narrative's** (`content/vendors.json`, the single source; gameplay keeps no price list). `loadVendorContent(json)`, or the constructor's `content.vendors`, or the scene with `?content=narrative`. Gameplay owns only what a good does, keyed by `<vendor type>.<item slug>` (`EFFECTS` in `economy/vendors.ts`). `vendors.test.ts` asserts every effects row resolves to a vendors.json entry, and the reverse.
- **Effects** (examples, at narrative's prices):
  - frank 35¢: +6 hp;
  - knish 40¢: +8 hp;
  - small ice 25¢ / large ice 40¢: +12 / +18 stamina, and they cool you (sprint drains as at 80°F for a while on a heatwave day);
  - coffee 20¢: +12 stamina, sobers 0.08; tea: +8 stamina, sobers 0.04;
  - fruit: a little of both.
- **Carried goods:** flowers, the two evening papers and cigarettes; from the peddler, an umbrella (only sold in the rain), sunglasses, the "gold" watch (a mission prop), an 8-track and a pennant.
- **Shoeshine:** the file's 50¢ plus a 25¢ tip; shined shoes for the day (a grooming touch).
- **Robbing a cart:** small change for real heat. A full till is $6–$80 by kind (a hot-dog cart $18), refilling over 6 game hours. It's theft, or `assault_weapon` with a gun out; the vendor flees or cowers.
- **Carts knocked over:** at 3 m/s or more, by the player, a car or a chase. The cart spills (`notice cartOverturned` lists the goods) and is closed for 2 game hours. The player on foot commits vandalism; in a car, reckless.
- **Three-card monte** ("Find the lady"): $2–$20 a hand, and rigged, because the dealer palms the queen on a real bet. Catch the tell, the bent corner of the queen visible for 0.21–0.49 s during the 4 s deal (wider with stealth skill, narrower drunk), and you follow it to an even-money win. After two wins the dealer folds the box.
- **Context button:** "Buy" (the UI gets `notice vendorMenu`), "Shine 50¢" or "Find the lady".
- **Regulars and the sidewalk wire** (narrative's side.vendor_tipsters):
  - Three purchases at a cart make you a regular there; narrative's `flag.sidewalk_wire` makes you one everywhere. `vendorMenu().regular` offers the question.
  - `vendorTip(id)` gives the street's view within 600 m, once per vendor per game hour: beat posts, search cars, roadblocks and subway stakeouts as map hints `{at, kind, text}`.
  - If a report matches how you look, the vendor warns you instead: "They're asking about a man in a white shirt… Sounds a lot like you."
  - Tips, not money. Saved.
- **Saved:** tills and overturned carts.

#### vs GTA V / VI / RDR2
- **References:** GTA V's vendors are mostly ambient (hot-dog stands you can't really use, a few snack machines), and its street scams are scenery. RDR2's camps, stalls and general stores have real menus with stat effects and eating animations, and robbing a store is a full scenario. GTA VI is expected to deepen ambient commerce.
- **Where we match or exceed:** every cart is usable, with period menus and small, meaningful effects (heal, breath, cooling in the 1974 heatwave, sobering). A rigged hustle you can beat by skill is something neither reference has as a playable minigame. Robbing and knocking over carts go through the same witness heat as everything else.
- **Where we fall short:** no eating or shine animations yet (characters). The vendor's reaction to a robbery is a flee or cower command, not a scenario with pleading or a fight back. Vendors as tipsters and protection beats are narrative's side content, not wired yet.
- **Plan:** the vendor tipsters are in (regulars and heat hints); next, protection-racket beats on vendors for Nick. The vendor who fights back is in (brawler hand-off); give him the ladle once characters have a prop for it.

## Measured performance (CPU-only, headless Node in this container, no GPU, no rendering)
`shots/gameplay/bench.json` (avg / p95 / p99 / max, ms per frame, about 3,500 frames; rerun on 2026-11-26 after the crowd cache):
| Case | Avg | p95 | p99 | Max | Budget |
|---|---|---|---|---|---|
| 12 combatants, High (gameplay total) | 0.061 | 0.136 | 0.374 | 3.0 | ≤ 1.5 ms ✔ (rare single-frame spikes) |
| 6 combatants, Low (×3 phone estimate) | 0.025 (≈0.07) | 0.052 | 0.136 | 1.5 | ✔ |
| Police and witnesses, 400 peds | 0.020 | 0.078 | 0.231 | 1.0 | ≤ 0.3 ms avg ✔, p99 ✔ |
| Police and witnesses, 120 peds | 0.010 | 0.038 | 0.094 | 0.8 | ✔ |

**The crowd cache.**
- **Why:** `crowdAt` scanned every pedestrian on every `suspect()` call, about 24 µs with 400 peds. The player's crowd cover now refreshes at 4 Hz, which makes `suspect()` about 23 → 2.9 µs.
- **Measured back-to-back on the same machine, police with 400 peds:**
  - avg 0.048 → 0.020 ms;
  - p95 0.123 → 0.078 ms;
  - p99 0.305 → 0.231 ms.
- **Concealment:** I measured it at 0.8 µs a call, so it's left uncached; that waste turned out not to matter.
- **Caveats:**
  - These are desktop-container CPU timings.
  - The ×3 phone factor is an estimate, not a measurement.
  - The rare max spikes are single frames, at warm-up and when a crime's perception pass runs
    LOS rays for up to 24 candidates.
- **Not measured:** real-browser frame cost on a phone. In-browser timings in the scene under
  SwiftShader are dominated by software rendering, so they aren't representative. They're logged
  per frame in `frames.json`.
- The first bench run showed real problems, now fixed:
  - **every one of 400 pedestrians became a tracked witness** (p95 1.2 ms). It's now capped to
    the nearest candidates per crime, with heard-only witnesses limited;
  - **AI stopped shooting at a hidden player** (0.9 shots/s for 11 enemies). They now pin his
    cover.

## Decisions (and why)

- **No child characters anywhere** (user rule, relayed by oversight 2026-11-27). None exist or spawn: no sim ped, no stand-in ped, no content. Gameplay keeps a `child` guard purely as a safety net (dead code by design): a ped flagged `child` would get no hitbox, no melee, no impact damage, no body and no witness role. `bodies.test.ts` asserts no spawned ped is flagged `child`, and that the guard holds.

- **Money scale, user decision of 2026-11-26, relayed by oversight, verbatim: "Yes, but in GTA VI you can really rack up money. Like 10s of thousands".** Oversight added these terms:
  - everyday 1974 prices stay real;
  - missions pay hundreds to low thousands, and the big jobs $10k–$50k+;
  - street work stays modest, while risky crime scales with its risk;
  - property is re-priced: starters in the low thousands, mid $10–25k, big $50–150k+;
  - premium cars and luxuries are sinks worth chasing.

  Narrative set mission pay (f0a96c9; `rewards.moneyByLead`, with `moneyIf` for choice outcomes). Gameplay reads it through `economy/story.ts` and runs the simulation on it.
- **The headless core has no three.js:** tests run in Node and the engine can wire it into its
  own loop.
- **Money in integer cents:** 10¢ calls and 25¢ coffees; floats drift.
- **The head is lethal for NPCs, doubled for the player:** fair on a phone. Bleeding never kills
  the player (it stops at 10% hp as a warning); NPCs can bleed out.
- **NPC melee telegraphs = 1.2× + 0.22 s:** human reaction time on a touchscreen.
- **Attack tokens:** a squad can't all shoot you at once. The rest suppress or flank, and that's
  readable.
- **A crime counts once per report,** however many people saw it. A report merges accounts;
  severity doesn't multiply.
- **A gun in hand, or one too big for the outfit, is visible** and is reported as menacing. That
  makes clothes matter twice: description and concealment.
- **Officer-down** (user decision: "Fully lethal everywhere"):
  - always discovered after 45 s of radio silence, even unwitnessed (with no description);
  - citywide, can't be bribed or desk-dealt, decays at 0.12× the normal rate;
  - surge response;
  - no mission fail by itself, per the user's clarification. Missions fail on `essentialKilled`.
- **Lead stats:** narrative's proposal accepted (narrative 11) with the 1–10 → schema mapping
  sent to narrative. Payroll gives Nick cheaper bribes and a better roll, never a guarantee;
  honest cops stay honest.
- **Weapon names:**
  - "Tarrant" was renamed because it's too close to the historic maker Tranter;
  - "Ranger" was renamed because Winchester and others use it.

  See `docs/WEAPON_REGISTRY.md`.

## Next (milestone plan, including the oversight docs)
- **Rapier import point (ENGINE_RESPONSES E13).** Once `src/shared/rapier.ts` lands on the engine branch, switch the only two gameplay Rapier imports to it: `scene/GameplayScene.ts` and `scene/RapierWorldQuery.ts`. Two wasm instances can't share a physics world. The headless core imports no Rapier.
- **Swap the `?gameplay=1` touch buttons for the UI's `TouchLayout`.** Wait until the engine branch has merged `claude/ui-cinematics` (touch layer at 8ba6729 or later); merge order is engine → UI → gameplay, so gameplay must not merge the UI branch itself. The adapter is the UI chat's, with two corrections: `lockables: () => g.lockables().map((l) => ({ id: l.id, x: l.chest[0], y: l.chest[1], z: l.chest[2] }))`, because `chest` is a V3 tuple; and `locked: () => g.aimer.locked`, because it is already an id. `configure` maps to `g.setContext({ fireMode, gyro: c.gyro !== 'off' }); g.setAssist(c.aimAssist)`.
1. **Integration with the engine** (ENGINE_REQUESTS 1–3, 7, 12) and merging narrative's
   systems content. That means adapters for `content/items`, `shops.json`,
   `police/precincts.json` (dollars → cents, `precinct.*` ids) and the radio bark templates.
2. **Economy** (ECONOMY.md):
   - jobs, crime, gambling, property and loans runtime (a helper is building the module; I
     review balance);
   - the 20-hour headless money simulation against the hourly targets.
3. **Chases with the sim** (CORE_SYSTEMS §1), against sim's police agent API
   (ENGINE_REQUESTS 8):
   - foot chases on the walk graph, box-in, intersection blocks;
   - fire escapes and interiors (Interiors `markers`/`inside()`);
   - questioning witnesses, searching parked cars.
4. **Arrest presentation:** cuffs → back seat → booking reel-cut; a lawyer from the precinct
   payphone; the bail-out character switch (engine).
5. **Vehicles:** condition and failure modes fed to the vehicles API, shooting from cars
   (drive-by arcs), ramming damage, trunk UI.
6. **HOMES_AND_CARS:** buying cars (lot, classifieds, haggling), titles and plates,
   alternate-side tickets, the pound and the boot, garages, home upgrades (AC → rest quality).
7. **FEATURE_AUDIT lines:**
   - stealth: crouch, noise, takedowns, crowd hiding using `crowdCover`;
   - fire: molotovs, spread to props, fire engines;
   - fast travel: cabs and the subway (fare evasion as a witnessed crime, the third rail);
   - drunk effects, the boxing gym, barbers and tailors;
   - the stats and completion feed to the UI chat;
   - original arcade games last.
8. **Perf:** cut allocations in the AI/police think loops (the rare max spikes), and a
   real-phone measurement with `?gameplay=1&hud=1`.

## Arcade measurements (`arcade.test.ts`, deterministic bots)
- **Night Owl:** a simple flipping bot lasts 52 s and scores 42,060 a game (8 seeds). With no flipping it's 12 s and 861, so skill matters.
- **Drain mix:**
  - The first layout drained 77% of balls down the outlanes, because wall-huggers went straight in.
  - Fixes: an orbit-exit deflector, slanted rubbers above the outlanes, a narrow outlane with an inlane guide to each flipper, and slings that only kick from the face.
  - Now: 23% outlane, 75% between the flippers. That's harsh but fair for an EM table played by a crude bot.
- **Dead-Eye:** aimed play scores 2,425 at a 90% hit rate, against 525 for random shots.
- **Not measured:** feel on a real phone, which needs a playtest. The bot's flipper timing isn't a person's.

## Known issues
- The stand-in sim walks in straight lines; police cars in the test scene drive straight down
  the block. The real sim's lanes and walk graph fix this (ENGINE_REQUESTS 8).
- City colliders have no materials (all brick/asphalt), so storefront glass only exists where
  gameplay places a `storefront_glass` prop (ENGINE_REQUESTS 5).
- The parked radio car's collision box stays where it was parked if the unit drives off (test
  scene only).
- In the test scene the player capsule can clip into a car while sliding along cover. The slide
  pull-in needs a collision check.
- Overlay labels overlap when enemies bunch up (debug only).
- There are no animations: poses are rigid stand-ins (the characters stream owns them;
  ENGINE_REQUESTS 9).

## Honest critique (from the recorded frames and the headless runs, 2026-11-26)

### What already feels like a 2031 open world (the systems)
- **The police are knowledge, not a meter.**
  - Frames 08–11: one shot on W 31st St sends people scattering; one breaks for the call box, and
    you can watch the red line of their run.
  - The report says what they saw ("…male, thirties, medium build, white short-sleeve shirt,
    brown slacks, may be armed…"), and the radio says it back to you.
  - Units come out of the actual station house on that block, with sight cones on the ground.
  - Change the shirt and they walk past you (frame 15).
  - Nothing here is a copied mechanic, and it plays like 1974.
- **Bribes have texture.**
  - $10 for a shots-fired report is refused with a line, and $150 to a cop in a house on the pad
    makes the report vanish (frames 13–14).
  - An honest cop takes offence, and the report gets worse.
  - Nick's Payroll and Delphine's photo of a cop with his hand out are real rules, not flavour
    text.
- **Gunfights have intent.**
  - Frames 01–04: the crew spreads into cover, the non-token shooters suppress the car instead of
    all firing at once, one flanks, and they bark it.
  - Rounds come through the car door (the HUD shows him bleeding behind it), and the engine block
    is the safe spot.
  - Losing two men breaks the rest: one runs ("Forget this!"), one gives up.
- **The rules are consistent.**
  - A gun in hand or too big for your clothes is visible, and is reported as a gun seen.
  - Teddy in shirtsleeves can't hide a service revolver; a windbreaker can.
  - Five witnesses to one shot make one shots-fired report.
  - A dead cop is found by radio silence even when nobody saw it.
  - Several of these came out of bugs the frames exposed, and they're now covered by tests.
- **The fairness work is measurable:**
  - NPC melee telegraphs are long enough to parry on a phone (`ai.test`);
  - first shots from a new angle miss;
  - touch lock-on wins a fight with the camera pointed at the sky (`touch.test`).

### What still looks and feels like a prototype
- **Today's integrations are tested only against fakes.** That covers:
  - the pursuit roles (tail, box, corner cut-offs);
  - the sim's responders and the metered cab;
  - the touch-control hooks;
  - doors and talk.

  Every one passes against stand-ins with the published shapes. None has run with the real sim, UI or interiors code, because those branches aren't merged into the engine branch yet. Corner cut-offs use a ±250 m placeholder for intersections until sim provides real ones.
- **The arcade is played by bots, not people.** Night Owl's physics is plausible and skill shows in the numbers, but the cabinet art is a plain 2D canvas. Flipper feel on a phone (touch latency, flip strength) needs a human playtest.
- **The economy curve meets the user's "small early, big late" decision,** but no single lead reaches a mid-tier business in 20 hours. Whether that's right depends on playtests and narrative's mission pay.
- **Presentation is placeholder:**
  - capsule-and-box people with rigid poses, no animation, no ragdoll;
  - block-out cars; flat-shaded city; WebGL2 in software rendering.
  - Melee in particular reads poorly as stills (frame 06): without the characters stream's
    animations a parry is just a colour change, and *weighty* hits need hit-stop, camera
    impulse, sound and a stagger animation.
- **Locomotion of others is fake:**
  - the stand-in sim walks in straight lines;
  - police cars drive down the middle of the block and through parked cars;
  - foot cops don't use the sidewalk graph.

  Chases are only a centrepiece once the sim's police agents exist (ENGINE_REQUESTS 8).
- **Cameras:** the test scene's camera clips into the player and walls when he faces a cop at
  close range (frames 12–14, 16). The engine's camera work isn't mine, but encounters will need
  a framed two-shot.
- **The HUD is honest but busy:**
  - with debug overlays on, the labels overlap when enemies bunch up;
  - three stacked subtitles ("Someone's running for the call box." twice) should merge;
  - the encounter panel covers the cop it's about.
- **The diegetic police UI is half there:** the radio line and the witness marker work. The
  minimap cones live in a debug radar until the engine's minimap layer exists (ENGINE_REQUESTS 4).
- **The economy runs at the "tens of thousands" scale (user decision, above).** All figures come from the simulation on narrative's story pay (`economy_sim.test.ts` writes `shots/gameplay/economy_curve.json`).
  - **Missions:** $106,300 over an 8.7 h critical path, about $12.2k per real hour of mission play, in lumps:
    - the Cold Storage heist pays Nick $25k;
    - the finale pays each lead $6k;
    - the choice outcomes add up to +$40k.
  - **Free roam, per real hour (sustained, supply-limited):**
    - street work stays 1974-real: cab $65, garment $56, register $56, pickpocket $78;
    - risky crime scales: hijack $1,101, collections $837, burglary $597, safes $495, chop $230;
    - so missions are 11× the best crime (asserted below 0.25×).
  - **Property is priced by payback in real hours of play:**
    - newsstand $1,200 (3.6 h), laundromat $3,500 (6.3 h);
    - pool hall $10k (9.8 h), diner $16k (10.7 h);
    - Deuce arcade $50k (17.7 h), garage $65k (19.4 h), rooming house $90k (21.9 h), and Nick's supper club $150k (25.5 h), the last and dearest.
    - Weekly trouble scales with the business.
  - **Sinks:** a showroom with new cars ($7.8k coupe, $9.5k luxury sedan, $16.5k limousine), the tailor and a gold watch. Rent, clothes, guns and tokens stay at period prices.
  - **The 25 h run (narrative 0912179; seed 1974; asserted across 5 seeds, typical and best-choice play):**
    - Inputs:
      - story pay of $112,300 gross, with Act 1 front-loaded;
      - Brownout's $6k is a debt, repaid automatically from Nick's next income (Cold Storage);
      - 52 one-off side pieces ($42.9k in all; the $5k+ jobs open from Act 2, and their heat sometimes costs a bribe). A side-content player takes about half their free-roam turns on them, about 20–30 pieces in 25 h.
    - Results:
      - the starter at 1.3–3.3 h;
      - mid tier at 8.6 / 8.6 / 8.7 / 8.9 / 11.4 h;
      - with the best-paying choices, the Deuce arcade at 20.2–21.4 h; typical play buys nothing big before 18 h;
      - the story ends at about 22 h;
      - story-end net worth $114–125k in typical play, about $34–49k Teddy, $22–28k Delphine and $42–54k Nick (narrative b5dd122), after a premium car, suits and a watch.
  - **No runaway:** a free-roam-only grinder makes under 25% of what the story pays in the same 25 h.
  - **Wired into `Gameplay`:** `g.economy.attempt(lead, activity)`. Its crimes go through the
    witness system, and it's saved in gameplay's section. It isn't in the test scene's UI yet.
- **Content: placeholders by default; narrative's content on request.** `?gameplay=1&content=narrative` runs the scene on narrative's items, guns, shops and precincts through the adapter. It reads the real `/content` files once narrative's branch is merged, and gameplay's test snapshot until then; both load lazily. The snapshot matched narrative's latest files on 2026-11-26. Frames 18–19 show their shops, names and 1974 prices in the browser. Gameplay's archetype guns stay registered so NPC loadouts resolve. It isn't the default yet, because the recorded scenarios and the director script still use placeholder IDs.
- **Perf is CPU-only and partly contended:**
  - the clean bench meets budgets with margin;
  - rare single-frame spikes (JIT/GC) are unexplained beyond that;
  - there's no phone measurement yet.
