# Gameplay ↔ engine contract (what to wire, in the order the engine is wiring it)

`src/gameplay/index.ts` exports `Gameplay`; everything below is a method or event on it. Gameplay never imports
engine, sim, vehicles or UI code: it only sees what you bind and what you call. Money is integer cents everywhere.
Headless suite: `npm run test:gameplay` (158 tests, about 3.5 s, exits 0 with a TAP summary).

## 0. Boot
```ts
const g = new Gameplay({ quality, content: { items, shops, weapons, vendors? } }); // nulls = gameplay's placeholders
g.bindWorld(worldQuery);          // raycasts against your Rapier world (RapierWorldQuery in scene/)
g.bindSim(simulation);            // sim: peds, police mirror, cabs, subway, parking, vendors, bumps, responders
g.bindPlayer({ id: 'player', lead: 'char.teddy_arce', position: () => [x, y, z], aim: () => ({ origin, dir }) });
g.bindVehicles(vehicles);         // §1
g.bindDoors(interiors); g.bindTalk(missionRuntime); g.bindSubway(sim) // optional; bindSim binds subway itself
```
Each frame: `g.setClock({ minutes, day?, tempF?, heatwave? })` (live play advances the economy itself), then
`g.setContext({...})` (below), then `g.update(dt)`. Read `g.hud()` for the HUD, and `g.on(event, cb)` for events.

`setContext` fields (send what changed): `vehicle: {id, vclass, colour} | null`, `speed` (m/s), `sprinting`,
`crouch`, `indoors`, `indoorsPublic`, `hiding`, `subway`, `atHome`, `raining`, `tempF`, `device: 'touch'|'pad'|'kbm'`,
`fireMode`, `gyro`, `carrying: 'none'|'bag'|'crate'|'body'`, `cuffed`, `vehicleYaw`.

## 1. Player driving (being wired now)
`bindVehicles({ on(type: 'impact' | 'destroyed', cb) })`. The **impact** shape is one event per contact:
`{ vehicleId, speed (m/s, relative), dv? (m/s, occupant's change), ped?, occupant?, driver?, prop? }`
- `ped` + `speed`: pedestrian struck → `pedestrianImpactDamage(speed)` (30 mph is lethal); if `driver` is the player:
  `hit_and_run` (or `homicide`), witnessed.
- `occupant` + `dv`: crash damage inside (1974: no airbags).
- `prop` + `speed`: hydrants, meters, newsstands break; a **vendor cart** prop (from sim's `vendorSpawned.cart.prop`)
  goes over (`cartHit` → `vendorNotice cartOverturned` to sim, audio keys off it).
- `destroyed {vehicleId}` → `notice`.
- **Pedestrians:** sim peds are kinematic, so the physics car never touches them. Gameplay checks the player's car
  footprint itself each frame (5.4 × 2.0 m around the player position, facing `vehicleYaw`, at `speed` ≥ 2 m/s) against
  sim peds: nothing to send. A `ped` impact from the engine is still accepted; one strike per ped per 2 s either way.
- **Sim traffic:** sim's `collision {vehicle, actor, speed}` with `actor: 'player'` is a pedestrian strike on foot, and
  in the car (sim traffic is kinematic too) an occupant crash at half the closing speed, unless the physics car
  reported a crash in the same 0.3 s. Event `notice {kind: 'trafficCrash'}`.
Getting in and out: `g.enterCar(id, 'keys'|'unlocked'|'slimjim'|'smash'|'hotwire'|'carjack')` returns time, noise and
crimes (gameplay reports them); `g.exitCar()` (registers your own car with sim parking). While driving, set
`setContext({ vehicle: {...}, speed })` each frame: the police see the car (descriptions match plate, colour, class).
Pursuit tactics drive sim police cars through `PoliceMirror` (built in `bindSim`); nothing extra to wire.

Sim memory: if sim has `remember`/`reputation` (memory.ts), gameplay reports the player's crimes and kindnesses
itself and reads the block standing for vendors; nothing for the engine to wire.

## 2. Mission runtime (next)
- `g.missionBegin(id)` at start; `g.missionLines()` at the end → up to 3 `{label, value}` for UI's `missionEnd.lines`
  (Time, Witnesses, Heat). Cash and title are yours.
- "Lose the police" gate: `g.heatClear()`; event `cleared`. Mission-fail hooks: events `copKilled {id, by}`,
  `essentialKilled {id}` (mark with `g.setEssential(id)`), `wasted`, `arrested`.
- Chases: `g.setChaseTarget(id, { catchDistanceM, lawful, noBolt })` / `clearChaseTarget(id)`; finish on
  `tackle {target, hit, quarry}` or `notice {kind: 'caught' | 'restrained' | 'quarryLoaded'}`.
- Talk: `bindTalk({ nearestTalkable(x, z, r), talk(id) })` puts mission givers on the one context button.
- Combatants for scripted fights: `g.spawnCombatant({ id, faction, squad, pos, weapon, melee?, hp?, ammo? })`.

## 3. Combat input (after)
One context button: `g.contextAction()` → `{kind, label, target}` (or listen to `context`); `g.doContextAction(moveDir)`.
Aim and fire: `setAiming(on)`, `setFiring(on)`, `setBlindFire(on)`, `reload()`, `clearJam()`, `setLimb('head'|'body'|'legs')`.
Lock-on: `lockOn()`, `cycleLock(±1)` / `swipeLock(±1)`, `lockTarget(id)`, `lockables()` (world points to project).
Weapons: `equip(id)`, `holster()`, `drawWeapon()`, `swapWeapon(±1)`, `weaponList()`. Cover: `toggleCover(moveDir)`.
Melee: `meleeAttack('light'|'heavy')`, `block(on)`, `dodge(dir)`, `grappleAction('shove'|'knee'|'throw', dir)`,
`struggle()`, `takedown()`, `tackle()`. Other: `surrender(on)`, `throwMolotov(target)`.
Touch helpers: `touchMode()`, `armed()`, `coverLabel()`, `coverOrRoll(moveDir)`, `setAssist(level)`. `moveDir` is
`{x, z}` or `[x, z]`. The UI's `gameplayTouch(g, project)` (src/ui/touch/adapters.ts) accepts `Gameplay` as is.
Heat for the UI: `g.policeSys.phase(playerId)` is the phase pursuit and the HUD use.

## 4. Movement rules (MOVEMENT.md)
`canMove(action)` → `{ok, reason}` before a traversal; `traversed(action, metres)` after (stamina);
`landed(heightM, rolled)` on landing; `locomotion()` per frame (speed, sway, turn, stop, stumble multipliers and the
gait layer); `fell(id, dropM)` for any other actor; `stumbling` while sprawled after a missed tackle.

## 5. Save
`g.serialize()` / `g.deserialize(raw)`: gameplay's section (v4 with migrations from v1).

## Events (all via `g.on`)
`wasted, arrested, released, crimeWitnessed, reportFiled, shot, hit, melee, propBroken, impact, bark, radio, witness,
police, money, pickup, ring, call, wear, geyser, tyreShot, notice, copKilled, essentialKilled, cleared, fire, context,
cab, tackle`. `notice {kind}` carries the small things (vendorSale, cartOverturned, shovedBack, brawl, caught,
landing, barge, traversal, ...): treat as silent unless UI decides otherwise.
