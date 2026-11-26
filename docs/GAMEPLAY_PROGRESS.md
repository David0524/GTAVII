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

## Measured performance (CPU-only, headless Node in this container, no GPU, no rendering)
`shots/gameplay/bench.json` (avg / p95 / p99 / max, ms per frame, 3,480 frames):
| Case | Avg | p95 | p99 | Max | Budget |
|---|---|---|---|---|---|
| 12 combatants, High | 0.067 | 0.185 | 0.443 | 3.0 | ≤ 1.5 ms ✔ (rare single-frame spikes) |
| 6 combatants, Low (×3 phone estimate) | 0.022 (≈0.07) | 0.043 | 0.245 | 1.6 | ✔ |
| Police and witnesses, 400 peds | 0.067 | 0.179 | 0.491 | 4.2 | ≤ 0.3 ms avg ✔, p99 over |
| Police and witnesses, 120 peds | 0.025 | 0.066 | 0.206 | 1.4 | ✔ |

This rerun is uncontended, after stealth, fire, stats, crowd cover and concealment were added
(about +0.02–0.04 ms on average over the first run). Known waste:
- `crowdAt` scans every pedestrian each frame;
- `concealment()` is recomputed several times per frame.

Both are cheap to cache.
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
- **The economy is in, but the balance is provisional.** Measured against a reference of $150
  per real hour of missions:
  - **Rates:**
    - best legal job: cab, 0.44×;
    - best crime: the chop list, 0.71×;
    - property: 0.28–0.31×.
  - **Exploits are bounded:** robbing the same register again pays $87, then $23 over the next
    ten; fencing ten fur lots to one fence gets $536 against $1,440 at full price.
  - **The 20-hour run:** cash goes from $365 to $1,275, peaking at $1,782 before a $1,100
    newsstand purchase.
  - **My reservation:** the targets are partly met through long attempt cycles. A chop delivery
    counts about 57 game hours, roughly 1.9 real hours. In play that would feel slow.
    - The rebalance: raise the mission reference once narrative's mission pay is settled
      (missions currently pay almost nothing), shorten the cycles to the real time an attempt
      takes, and let supply caps (pools, the weekly list, fence saturation) do the bounding.
    - Business payback, at 5–10 game weeks, is longer than a 20-hour playthrough. It needs a
      decision on whether property is late-game.
  - **Wired into `Gameplay`:** `g.economy.attempt(lead, activity)`. Its crimes go through the
    witness system, and it's saved in gameplay's section. It isn't in the test scene's UI yet.
- **Content is placeholder:** gameplay's own invented weapons, shops and prices run unless
  narrative's adapter content is passed in. The adapter works on a snapshot, but the scene
  doesn't load narrative's files yet.
- **Perf is CPU-only and partly contended:**
  - the clean bench meets budgets with margin;
  - rare single-frame spikes (JIT/GC) are unexplained beyond that;
  - there's no phone measurement yet.
