# ENGINE_REQUESTS: from the gameplay team

Headings follow the engine protocol (`## From gameplay: N. Title`). Answers go in `ENGINE_RESPONSES.md`
on the engine branch. Each request gives what, why, and the fallback gameplay uses until it ships.
Gameplay lives in `src/gameplay/` on `claude/gameplay-74`; the integration contract is the one in
`docs/briefs/GAMEPLAY_BRIEF.md`, plus the additions listed in request 1.

**Answers to other streams' requests addressed to gameplay**
- **Narrative 11 (lead combat stats): ACCEPTED (provisional)**, with the mapping and the Payroll
  change sent to narrative on 2026-11-26. It will be recorded in `src/gameplay/data/leads` when
  narrative's content is merged.
- **Narrative 13 (systems content):** accepted as the source. Gameplay converts dollar prices to
  cents on load and adopts the `precinct.*` ids. Still needed: precinct area polygons.

## From gameplay: 1. Wire `Gameplay` into the main game (integration milestone)
- **What:** construct `new Gameplay({ quality, content })` in `main.ts` and call `update(dt)` once
  per frame after physics. Bind it with:
  - `bindPlayer` (the active lead's controller);
  - `bindWorld(new RapierWorldQuery(physics))` (in `src/gameplay/scene/`; it excludes
    gameplay-owned colliders);
  - `bindSim(sim)` and `bindVehicles(vehicles)`.
- **Contract additions beyond the brief:**
  - methods: `bindWorld`, `setFlags`, `heatClear()`, `setEssential(id)`, `moveMul()`,
    `canSprint()`, `hud()`, the input commands (request 3), `serialize`/`deserialize`;
  - events: `copKilled`, `essentialKilled`, `cleared`, `radio`, `witness`, `police`, `bark`,
    `impact`, `geyser`, `tyreShot`, `notice`, `money`, `wear`, `ring`, `call`.
- **Units:** money is integer **cents** everywhere in gameplay; `police.bribe(copId, cents)`.
- **Fallback:** the `?gameplay=1` test scene is the integration reference.

## From gameplay: 2. A gameplay section in the versioned save
- **What:** store `gameplay: unknown` (the result of `serialize()`) and pass it back to
  `deserialize()`. Gameplay owns the shape and its migrations (`src/gameplay/save.ts`, currently
  v3). Your draft per-character shape (N5: money in dollars, `inventory: string[]`, `wardrobe`)
  is accepted as **v1** and migrated (fixture: `src/gameplay/tests/fixtures/save_v1.json`).
- **Suggest:** move per-lead money, inventory and wardrobe out of the engine's `Party` into
  gameplay's section, so there's one owner.
- **Fallback:** headless round-trip tests.

## From gameplay: 3. Combat input actions and a combat touch context
- **What:** new `ButtonAction`s: `aim`, `fire`, `reload`, `cover`, `blindFire`, `melee` (tap
  light, hold heavy), `guard` (tap dodge, hold block), `grab`, `weaponNext`, `lockPrev`,
  `lockNext`, `limb`, `intimidate`.
  - **Pad, Standard preset:** LT aim/block, RT fire/attack, RB cover, X reload, B dodge,
    LB weapon, D-pad left/right lock cycle, Y interact.
  - **Mouse:** RMB aim/block, LMB fire/attack (hold = heavy).
  - **Keys:** R reload, C cover, X blind fire, Z dodge, G grab, Tab lock cycle, T limb,
    B intimidate, E interact, 1–7 weapons.
  - **Touch combat context:** AIM (lock-on), FIRE, ◀ ▶, HEAD/BODY/LEGS (shown while locked),
    COVER, RELOAD, GUARD, GRAB, WPN, BLIND, THREAT, USE.
  - **Settings keys:** `aimAssist` (off|low|standard|strong) and `unlimitedSprint`
    (accessibility).
- **Why:** the brief's touch rule (lock-on, no precise aim), and the settings roadmap reserved
  the combat keys.
- **Fallback:** the test scene reads raw keys and pad buttons itself and adds its own touch
  layer.

## From gameplay: 4. Minimap overlay layer
- **What:** `minimap.addLayer((ctx, toMap: (x, z) => [u, v], scale) => void)` drawn after the
  streets.
- **Why:** the diegetic police UI is sight cones and search circles on the minimap.
- **Fallback:** a radar canvas in the test scene (`Overlays.drawRadar`) shows exactly what the
  layer would draw.

## From gameplay: 5. Surface materials on city colliders
- **What:** a material tag per collider triangle range or per building: `brick`, `concrete`,
  `glass` (storefront band), `wood`, `metal_thin` (roll-down gates), `plaster` (interior
  partitions). Expose it through `castRayAndGetNormal`, via `collider.userData` or a
  handle → material map.
- **Why:** bullet penetration (thin walls, storefront glass), impact FX and audio.
- **Fallback:** walls read as brick and ground as asphalt (`RapierWorldQuery`).

## From gameplay: 6. Street furniture as data: call boxes, payphones, hydrants, meters, mailboxes, newsstands, trash cans
- **What:** POIs per chunk with position and heading, using the 1974 placement rules:
  - red police call boxes at most avenue corners and about every second side-street corner;
  - booth payphones near subway entrances and corners;
  - hydrants about every 75 m, mailboxes at corners;
  - meters along commercial curbs, newsstands at avenue corners.

  Gameplay instantiates the breakable props and their colliders from them.
- **Why:** witnesses need real call boxes to run to everywhere, not just on the test block.
- **Fallback:** gameplay can generate them deterministically from `streets.json`
  intersections. This is a stopgap I'll write if this isn't scheduled.

## From gameplay: 7. Reel-change presentations: hospital, booking, bail
- **What:** the N5 reel-change cut, reused for three things:
  - hospital discharge: a title card with the hospital name and the bill;
  - booking: a mugshot flash plus the property clerk;
  - a bail-out character switch.

  Gameplay emits `wasted` and `arrested` with everything to show (`hospital`, `bill`, `paid`,
  `debt`, `confiscated`, `fine`, `hoursLost`) and expects `advance_time(hoursLost)` from the
  engine clock.
- **Fallback:** the HUD title card in the test scene.

## From gameplay: 8. To sim (relay): behaviour control and police agents
The sim's `setGoal`/`perceive`/`gunfire` hooks (sim message, 2026-11-26) cover most of this.
Gameplay's `AgentPort` maps onto them:
- `goto` → `setGoal(id, {kind:'goto', x, z, speed})`;
- `flee` → `setGoal(id, {kind:'flee', x, z})`;
- flag down a car → `flagDownCar`;
- `release` → `setGoal(id, null)`.

Still needed:
1. An **action goal** `{kind:'act', name: 'use_callbox' | 'use_payphone' | 'cower' | 'hands_up' | 'die', duration?}`
   (the agent holds still and the crowd renderer plays it).
2. A per-ped `nerve` 0..1 from the archetype (bravery: who reports, who freezes).
3. `kill(pedId)` so the sim stops simulating a dead ped and leaves the body for N seconds.
4. **Police agents** (sim's queue), in these shapes:
   - `spawnPolice({kind:'foot'|'car', x, z, precinct}) → id`
   - `setPoliceGoal(id, {kind:'patrol'|'goto'|'search'|'pursue'|'boxIn'|'roadblock', x?, z?, target?})`
   - events `arrived`, `lostSight`, `tired {id, stamina}`

   Gameplay keeps the decisions (reports, recognition, bribes, arrest); the sim does the
   locomotion and driving.
5. Children never become witnesses or combat targets: gameplay already skips `child: true`
   peds. Please expose that flag on `PedView`.

## From gameplay: 9. To characters (relay): the combat animation set
Wanted actions for `Character.play`:
- **Guns:** `aim_pistol`, `aim_long`, `fire_*`, `reload_revolver_loader`,
  `reload_revolver_single`, `reload_pump_shell`, `reload_pistol_mag`, `jam_clear`.
- **Cover:** `cover_low_idle`/`peek`/`blindfire`, `cover_high_idle`/`peek_l`/`peek_r`.
- **Melee:** `melee_jab`, `melee_hook`, `melee_kick`, `melee_swing_light`/`heavy` (bat, pipe,
  nightstick), `melee_stab`, `block`, `parry`, `dodge_l`/`r`/`b`, `grab`, `grabbed_struggle`,
  `knee`, `shove`, `throw`, `stagger`, `knockdown`, `getup`.
- **Reactions:** `hit_head`/`torso`/`arm_l`/`arm_r`/`leg_l`/`leg_r`, `death_*`, `limp`
  locomotion (a 0..1 blend from `Gameplay.healthSys.effects`), `wounded_crawl`.
- **People:** `hands_up`, `surrender_kneel`, `cuffed`, `cower`, `use_callbox`, `use_payphone`,
  `flag_down`, `point`.

Melee windups are gameplay-timed (NPCs: windup × 1.2 + 0.22 s), so clips should scale to the
`duration` gameplay passes. Ragdoll: blend on death and knockdown when you have it.

## From gameplay: 10. To vehicles (relay): impact event shape, tyres, trunks, plates
- **`impact` event shape:** `{ vehicleId, speed (m/s), dv (m/s, this vehicle's velocity change), ped?, occupant?, driver?, prop? }`.
  Gameplay turns this into pedestrian, occupant and prop damage, plus hit-and-run crimes.
- **Tyres:** `damageTyre(wheel)`, because gameplay resolves tyre hits from its batched shots.
- **Also wanted:** `trunk` storage ids, and `plate` as a visible, swappable part (string from
  `src/gameplay/appearance.ts plateFor`, 1974 NY "ABC-123").

## From gameplay: 11. To audio (relay): gameplay event list
All of these carry a position:
- `shot {weapon}` and `impact {material, penetrated}`; noise radii are in
  `src/gameplay/data/defaults.ts`;
- `bark {bark}`;
- `radio {text}`: dispatch chatter, the main heat cue;
- `melee {kind}`;
- `geyser {on}`: water bed;
- `propBroken {type}`: glass, the papers, a period alarm bell on storefront glass;
- `ring` (payphone);
- `police {kind: 'pursuit' | 'stop' | ...}`: whistle, "Hold it!".

Every one of these has a subtitle or visual equivalent in the HUD.

## From gameplay: 12. A package script for the headless suite
- **What:** in `package.json`, `"test:gameplay": "tsx --test src/gameplay/tests/*.test.ts"` and
  `"bench:gameplay": "tsx tools/gameplay/bench.ts"`.
- **Why:** it's a shared file I can't edit.
- **Fallback:** run them with `npx`.

## From gameplay: 13. To interiors (relay): what gameplay reads from `inside()` and `markers()`
- **Each frame, while the player is inside:**
  `setContext({ indoors: true, indoorsPublic: kind ∈ {diner, shop, bar, lobby, cinema}, hiding: <player at a 'hiding' marker> })`.
  - Searching cops work their way into public interiors after `INDOOR_CHECK` (8 s) nearby.
  - Private interiors and hiding spots keep the player out of sight.
  - Reports cool ×2 while the player is indoors.
- **Markers gameplay will consume:**
  - `shopCounter` → `shops` (an interior's `shopId`);
  - `register` and `safe` → economy robbery;
  - `payphone` → `addReportPoint({kind:'payphone'})`;
  - `wardrobe` → `atHome` for changing;
  - `stash` → `inv.toStash`/`fromStash`;
  - `bed` → `sleep()`;
  - `hiding` → `hiding: true`;
  - `door` pairs → pursuit through buildings (Delphine's Disappear: a two-door building breaks line of sight).
- **Fallback:** the test scene sets these flags by hand.

## From gameplay: 14. To the UI chat (relay): the gameplay calls behind each screen
| Screen | Calls |
|---|---|
| HUD | `hud()`: hp, armor, injuries, bleeding, weapon, rounds, reload, spread, lock and limb, cover, money, outfit, running witnesses, encounter. `stamina()`, `intox()`, `concealment()`. |
| Pockets / weapon selector | `inv.of(lead)`, `concealment()` (hidden / visible / bagged per weapon), `equip`, `holster`, `use` |
| Shops | `shops.listing(shop)`, `buy`, `sell`, `sellPrice`, `buyOutfit`; diners `eatAt` |
| Wardrobe / closet | `wardrobe.owned`, `wearing`, `changeOutfit(id)` (only at home or straight out of a store) |
| Encounter | `police.bribe(copId, cents)` → accepted/refused/insulted; `surrender(true)` |
| Custody (after `arrested`) | `outcomes.custody.options`: desk / lawyer / bail / night; `release(how, byLead?)` |
| Cars | `ownership.lot`/`classifieds`, `inspect`, `offer` (sold/counter/walk/broke), `sell`, `rentGarage`, `payTickets`, `release` (pound) |
| Payphone | `phones.place(lead, phone, 'service' \| contact)`, `answer` |
| Sleep / wait | `canSleep()` → reason; `sleep(hour)`; `wait(hours)` |
| Stats / completion | `stats.of(lead)`, `stats.totals()`, `stats.accuracy()`, `stats.checklist()` |
| Fast travel | `cabTo(x, z)`, `enterSubway(jump?)`, `rideSubwayTo(x, z)` |
