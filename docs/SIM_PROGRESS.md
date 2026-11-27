# SIM_PROGRESS: ambient traffic and pedestrian simulation

Source of truth for the sim workstream (brief: `docs/briefs/SIM_BRIEF.md`). Read it first; update it last.

## Status
| Scope item | State |
|---|---|
| 1. Lane graph build step (`npm run data:lanes` → `public/data/lanes.bin`) | **Done** |
| 2. Traffic: lanes, 1974 one-ways, signals + green wave, no right on red, IDM, lane changes, gap acceptance, ped yielding, period behaviour, spawn ring, density hooks | **Done** (first pass; see critique) |
| 3. Pedestrians: walk graph, local avoidance, crosswalks, jaywalking, loiter spots, subway entrances, flee/cower | **Done** (first pass) |
| 4. Archetype runtime for `content/npc_archetypes/*.json` + 10 neutral built-ins | **Done**; `npm run sim:validate` checks content |
| 5. External actors (player on foot/driving, scripted vehicles) | **Done**: brake, honk, swerve-by-lane-change, dodge, flee, collision/nearMiss events |
| Integration contract (`src/sim/index.ts`) | **Done** on the engine's shared contracts: `vehicles: TrafficVehicleView[]` (vclass, variant, lights) from `src/shared/traffic.ts`, `peds: PedView[]`, y from `src/shared/terrain.ts` `heightAt` (+ `CURB_HEIGHT` on sidewalks), lanes and spawns only inside `src/shared/bounds.ts` |
| Brief 5. Escort / companion locomotion (`escort(agentId, route, opts)`) | **Done** (pace-matching, `escortProgress`/`escortDone` events) |
| Brief 6. Dark signals (brownout → all-way stop) | **Done** (`setSignalPower(area, powered)`) |
| Boundaries layer 3 (city thickens at the edge) | **First pass**: spawn density ramps up over the last `EDGE.RAMP` m; traffic crawls bumper-to-bumper inside `EDGE.BLOCKERS`; no lanes/walk graph beyond the playable edge. Rubbernecking at blockers and chase roadblocks: not yet |
| Gameplay hooks | **First pass**: `perceive()`, `setGoal()` (goto/follow/escort/flee/flagDownCar), `emit({type:'gunfire'})` with distance-scaled panic, civilians pull over for `siren` actors. Police pursuit/foot-cop AI: not yet |
| Economy hook | `blockAt(x,z)` + `footTraffic(blockId)` rolling peds/min |
| Police agents (Gameplay spec) | **First pass**: `spawnPolice`, `setPoliceGoal` (patrol / goto / search / pursue / boxIn / roadblock), `setSiren`, `despawnPolice`, `police: PoliceView[]`, events `policeArrived`, `policeBlocked`. Plus `setGoal({kind:'act'})`, `nerve` on PedView, `kill()`, `takeVehicle()` → `vehicleStolen` |
| Emergency & service traffic, player cab rides | **First pass**: `dispatch('ambulance'|'fire', x, z)` (+ ambient ambulance runs), mail trucks, soft-serve truck; `callCab` / `boardCab` / `leaveCab` with `cabReady`, `cabTurnAhead`, `cabRideArrived`; left-kerb pickups on one-way streets |
| Parking enforcement, tows, street cleaning | **Done (first pass)**: `parkingRule(x,z,minute?,dow?)`, `hydrantsNear`, `setDay`, `registerParkedCar`/`unregisterParkedCar`; traffic agents ticket (`ticketIssued`), tow trucks tow (`towDispatched`, `vehicleTowed`), street sweepers run alternate-side windows (`sweeperOut`) |
| Subway schedule and platform crowds | **Done (first pass)**: 15 stations (narrative's canonical 1974 list + PATH 33rd St), `complex` for Herald Sq / Times Sq; deterministic timetable; `subwayStations`, `nextTrains`, `platformCrowd`, `stationNear`, `boardSubway`; events `trainArriving`, `trainDeparted`; riders surface from the stairs |
| Interiors door hand-off | **Done (first pass)**: `setDoors`/`clearDoors` (engine feeds interiors' `doorsForChunk`), passers-by step in (`pedEnteredDoor`), occupants come out (`pedExitedDoor`), `exitFromDoor(doorId, archetype?)`, `enterDoor(pedId, doorId)`; opening hours honoured; per-kind rates (`DOOR_RATES`, `setDoorRates`) |
| Signal heads for the engine's props (Phase 3 block A) | `signalHeads()` (static: vehicle heads per signalised approach, WALK/DON'T WALK heads at crosswalk ends) + `signalStates(out)` (one byte per head per frame); docs/requests/sim.md item 9 |
| Visual bar "Life": density near the camera | Density-targeted spawning + `setView`; test asserts agents within 60 m (rush hour Herald Square: High 30 vehicles / 97 peds, Low 13 / 56) |
| Movement brief (sim part) | Bump reactions (brush/stumble/knockdown, angry/frightened/annoyed), crowds part for a running player, `setObstacles` + hydrants, `PedView.onRoad`; adults only (test asserts no child archetype or pedestrian) |
| Cutscene → play hand-off | `handOff({cast, x, z, yaw, speed?, after: companion|stay|ambient})`: a live ped at exactly the cutscene's last pose, then companion follow / hold / ambient; `actorHandedOff`; test asserts pose error 0 and the follow (requests item 11) |
| Street vendors (STREET_VENDORS.md) | **First pass**: 11 narrative types placed by spot kind, district, hour and weather; carts pushed in/out; queues, sales, calls, litter; reactions (gunfire, reckless drivers, police move peddlers on, monte lookouts scatter the crew); gameplay commands/notices; `vendorViews`; test asserts per place and hour |
| Hand a ped to gameplay (brawls) | `releasePed` / `moveReleasedPed` / `reclaimPed` (`pedCalmed`) |
| Parked cars on every kerb | **Done**: `parkedCars(x, z, r)` (static, rule-aware, deterministic per place and day); traffic uses only the gaps; test asserts no vehicle ever touches a parked car |
| Street graph queries | `nearestIntersections(x, z, radius, max?)`: real junctions (2+ named streets) nearest first, with street names, signal flag and approach yaws (gameplay chokepoints) |
| Wildlife: pigeons and rats | **Done (first pass)**: `sim.wildlife: WildlifeView[]`, flocks/swarms near the focus only (LOD), driven by `npc.pigeon_flock` / `npc.rat_swarm` (behaviour `critter`) |
| Debug view `?sim=1` (`src/sim/debug/SimDebugView.ts`), one guarded line in `src/main.ts` | **Done** |
| Headless 10-minute deterministic test (`npm run test:sim`) | **Passing** (report: `docs/sim_test_report.json`) |
| Playwright screenshots (`npm run build && npm run shots:sim -- --webgl`) | **Done** (`shots/sim/`) |

## How to run
```bash
npm run data:lanes                 # rebuild public/data/lanes.bin from streets.json + chunks (~1 s, deterministic)
npm run test:sim                   # 10 sim-minutes at High + 2 at Low + determinism check (~4 min CPU)
npm run test:sim -- --minutes 2 --seed 7
npm run sim:validate               # validate content/npc_archetypes/*.json against the runtime
npm run dev   # then open  /?sim=1   (also ?simclock=08:15  ?simweather=rain  ?simlanes=0  ?simseed=N  ?quality=low)
npm run build && npm run shots:sim -- --webgl
```

## Architecture
```
tools/pipeline/lanes.ts      build step -> public/data/lanes.bin (T74L, 371 KiB)
src/sim/laneFormat.ts        T74L reader/writer + record types (shared by pipeline and runtime)
src/sim/geom.ts              polyline math, point-in-polygon, seeded PRNG (sfc32)
src/sim/network.ts           runtime graph: arc lengths, signal timing, adjacency, spatial cells, AgentGrid
src/sim/archetypes.ts        archetype schema, validation, built-ins, district/intersection area resolver, spawn weights
src/sim/state.ts             internal Vehicle / Ped / SimCore types, time-of-day density curves
src/sim/traffic.ts           vehicles: IDM, junction permission, lane changes, period behaviour, honks, contacts
src/sim/peds.ts              pedestrians: walking + avoidance, crosswalks, jaywalking, spots, hails, flee/dodge
src/sim/index.ts             Simulation facade (the integration contract)
src/sim/debug/SimDebugView.ts  ?sim=1 instanced boxes/capsules, lane + walk lines, signal heads, HUD
tools/sim/headless.ts        deterministic headless test with independent geometric checks
tools/sim/validateArchetypes.ts  narrative content validator
tools/shots/simShots.ts      Playwright screenshots of ?sim=1
```

### Lane graph (`lanes.bin`)
Built only from committed data (`streets.json` 1974 directions, chunk ground polygons, Signal and
SubwayEntrance POIs). Steps (all deterministic; per-place choices hash coordinates):
1. Split centrelines at shared vertices; keep only edges on the streamed ground (inside REGION).
2. Cluster intersection nodes joined by edges < 13 m (span ≤ 24 m) into one junction (divided Park
   Ave, Herald/Madison Square complexes); merge plain continuations of the same street.
3. Arms sorted by angle; sidewalk corners = intersection of the two kerb-offset lines (bisector
   fallback for near-straight, capped for acute wedges like the Flatiron); stop lines set back behind
   the crosswalk (corner projection + 2.5 m).
4. Lanes from roadway width: 2.4 m parking lane per kerb on named streets, travel lanes ≥ 3.0 m
   (avenues 5, Fifth 4, Broadway 3, 100-ft crosstown streets 2+2, side streets one 5.6 m lane).
   Lane 0 = kerb lane. Speeds: avenues 12.5 m/s, streets 9.5.
5. Connectors (cubic curves, validated to stay on roadway ground): straight i→min(i, n-1), right
   turns kerb→kerb, left turns from the leftmost lane. Conflicts precomputed: crossings, merges and
   "zones" where two paths come within 2.6 m (including diverging paths from the same lane).
6. Signals: OSM `traffic_signals` POIs snapped to junctions within 30 m (201), plus 4 synthesized at
   real named-street crossings with no POI. Arms grouped into phases by axis; 90 s cycle, avenue
   phase weighted 1.3×, 3 s yellow + 2 s all-red. **Green wave**: phase-0 offset = ∓z / 10 m/s along
   the one-way avenue of the junction (northbound avenues progress uptown, southbound downtown).
7. Walk graph: kerbside paths along both sides of every road, crosswalks between corners; every
   corner, path sample (0.25 m) and the usable lateral band (±half) is validated against chunk
   ground (no building, no roadway), at the stored int16-dm precision; largest component kept.
8. Spots: storefronts (avenues/commercial), stoops (residential side streets), corners, subway
   entrances (moved to the kerbside path if mapped on an island), bus stops (every other block on
   1974 bus streets, far side, kerb lane).
9. Traffic graph pruned to its largest strongly connected component at lane-group level; every
   surviving lane is guaranteed an exit (no dead ends anywhere).

Result (small story-core map, engine E8 `PLAYABLE`): 198 junctions (150 signalized: 148 from OSM POIs,
3 synthesized), 826 lanes, 1072 connectors, 1327 conflicts, 556 walk nodes, 972 walk edges (484
crosswalks), 2894 spots, 66 bus stops, plus wildlife places (248 park, 254 corner, 139 ledge, 95 coop
for pigeons; 629 kerbside trash, 108 subway for rats); lanes.bin 318 KiB.
Rebuild with `npm run data:lanes` whenever `bounds.ts`, `streets.json` or the chunks change.

### Traffic
- Fixed 1/30 s step, `update(dt)` accumulates (≤ 6 steps per call) and writes interpolated views.
- IDM car-following along the planned path (lane → connector → exit lane), including vehicles still
  blending out of a lane mid lane-change. Hard position limits make red-light running and overlap
  impossible even with numerical overshoot.
- **No right on red**: a red stops every movement from that approach; yellow = stop if comfortable.
- Junction permission at the stop line: signal, conflicting vehicles inside the junction (before
  the conflict zone end), pedestrians on crossed crosswalks, yield to higher-priority approaching
  vehicles that are moving or free to go (permissive lefts yield to oncoming; unsignalized:
  class rank, then waiting time, then id), and don't-block-the-box (room on the exit lane).
- Lane changes: mandatory (route turn lane, kerb lane for cab/bus stops), discretionary around slow
  or stopped vehicles; gap acceptance on target lane and vehicles about to enter it from the
  junction; cabs and aggressive archetypes accept tight gaps and the cut-off driver brakes + honks.
- Period behaviour: **double-parked delivery trucks** (kerb lane, 25–80 s; on single wide side-street
  lanes cars squeeze past at walking pace, narrow lanes queue and honk), **cabs** answer pedestrian
  hails on their block, cut to the kerb lane and into the parking lane to load, and drop fares off
  later, **buses** pull into stops and board waiting pedestrians/alight new ones, **horns** for
  queues, slow starters at green, cut-offs, pedestrians/player in the road (events only).
- Long vehicles (buses, trucks over 7 m) swing wide on tight turns: they treat neighbouring turn paths
  through the same junction (within 4.8 m) as conflicts and don't start a turn with someone at the line
  in the next lane; nobody changes lanes into the last 14 m beside a vehicle still turning out.
- Density-targeted spawning (VISUAL_BAR "Life"): the budget is spread at a target density around the
  focus, one vehicle per ~13 m of lane and a pedestrian per ~2 m of sidewalk at full density (× time of
  day × weather × optional `setDensityHook`). The populated radius is where the lane/sidewalk metres hold
  the budget (Herald Square on High: ~150 m for traffic, ~120 m for people; floors 110 m / 75 m), so a
  smaller budget shrinks the disc instead of thinning the street. Spawns go into under-filled 15–20 m
  bands, at the rim or anywhere beyond 20–30 m that the camera isn't looking (`setView`); despawn beyond
  the disc. Budget-neutral view bias: the fill target is ×1.4 inside the camera's cone, ×0.45 behind it, and
  with the pool full a car or person far behind the camera (out of sight) is recycled now and then so spawning
  can put it in view; in view, nothing appears closer than the fade distance (`setView(..., fovDeg, fadeDist)`). gridlock fallback:
  a vehicle stationary > 60 s while not at a red (and > 70 m from the focus, or > 150 s anywhere)
  is despawned. Signals are a pure function of time (no state), so the sim is deterministic.

### Pedestrians
- Edge-following with lateral offset inside the validated band; ORCA-lite in path space: keep
  right, sidestep oncoming, slow behind slower walkers, separation push; handcarts are wider.
- Crosswalks: WALK only when the arm's traffic is red and there is time to finish; unsignalized
  crossings need a traffic gap. **Jaywalking**: against the light when traffic allows (archetype
  tendency, more in rain, none near a beat cop) and mid-block across side streets.
- Peds in the roadway stop rather than step into a vehicle; vehicles see peds alongside their hood.
- Loiterers/commuters pick goal spots; vendors hold a storefront/corner; beat cops pause at corners;
  commuters emerge from and disappear into subway entrances; walkers hail cabs and wait at bus stops.
- `threat` → flee along the graph away from the point (never into moving traffic) or cower; fast
  external vehicles make peds dodge.

### Wildlife (`src/sim/wildlife.ts`)
- Places come from the build step: park ground (grid inside park polygons, 3.2 m clear all round),
  sidewalk corners, street-facing cornices of 9–40 m buildings (ledges), tenement rooftop coops,
  kerbside trash in front of shops/stoops, subway entrances.
- Groups activate within 110 m (pigeons) / 55 m (rats) of the focus, sized and rolled deterministically
  per place and hour from the archetype weight (density day/night × schedule; rain halves it).
  Caps: birds 0.5 × maxPeds, rats 0.15 × maxPeds (High 200/60, Low 60/18).
- Pigeons peck and shuffle; anyone running within ~4 m, the player close by, a fast car at the kerb,
  gunfire or a threat makes the flock burst up and arc (Bézier, staggered take-off) to the nearest
  ledge/coop 15–120 m away, perch 25–90 s and drift back down when it's quiet. Old men
  (`npc.pigeon_feeder`) sit by park flocks by day and the birds crowd their feet. Event `flockStartle`.
- Rats dash around trash and subway entrances, mostly at night, and vanish from footsteps and
  headlights, re-emerging later. Event `ratScatter`. Startle, never damage.
- Strays: lone cats at kerbside trash (rolled per place and hour, ~30% at night, 5% by day; they share
  the rat cap and the rat scurry/flee states, species `cat`). Stray dogs (max 3 on High, 1 on Low) trot
  the sidewalk graph, stop to sniff, and flee from runners, gunfire and the player; species `dog`.
- Mounted police: `npc.mounted_officer` (props `horse`) patrols Times Square, Herald Square and Penn
  Station 10:00–22:00 as a beat cop with a 1.1 m avoidance radius so crowds part around the horse.

### Siren priority and response times
Units with sirens (police, ambulance, fire) now get real priority, the way 1970s radio cars drove:
- **Gutter run:** past any queue they drive the empty parking lane, on the left kerb on one-way streets
  (traffic pulls to the right) and the right kerb on two-way streets; lane traffic stops and leans away.
- **Reds:** they slow to ~4 m/s and cross whenever nothing is physically in the way (crossing traffic,
  pedestrians on the crosswalk); no don't-block-the-box or yield rules; pedestrians don't step off the
  kerb with a siren within 40 m. They turn straight out of the gutter across stopped traffic.
- **Routing by expected time** (length at speed, queued cars, signals), not distance.
- **Starts** from "a unit already on patrol nearby": dispatch (and `spawnPolice({respondTo})`) picks a
  free lane spot ~24 s of siren driving away (32 s for the ladder truck).
- **On scene** within 45 m of the scene (scenes inside parks/blocks count from the nearest kerb).
- **Test assertion** (`docs/sim_test_report.json` `response`): first unit on scene after dispatch,
  rush hour (17:30) Herald Square 14.3 s and 42nd St & 7th Ave 15.0 s (target <= 60 s); off-peak
  (11:00) Herald Square 24.3 s and Flatiron 8.3 s (target <= 40 s). Also checked on seed 7.
- Gameplay owns pacing; numbers sent to them for confirmation.

### Police (`src/sim/police.ts`)
Gameplay keeps every decision (reports, recognition, bribes, arrests, stamina); the sim moves the agents.
- **Cars** route over lane groups (Dijkstra) and never drive against a one-way (the lane graph has no
  wrong-way lanes), so pursuits read as legal 1974 driving. With the siren on they crawl up to a red
  and go only when no crossing traffic or pedestrians are in the way (exempt from the red-light check
  only with the siren on); civilians ahead move right: kerb-lane cars pull into the parking lane and
  stop, others slow and change lanes right. A siren that isn't moving is ignored, so a stuck police
  car doesn't freeze the block.
- **Modes**: patrol/search pick points inside a radius (search cruises at 60 %); goto stops at the kerb
  with hazards (`onScene`); pursue keeps re-routing to the target's position; boxIn closes and stops
  next to the target; roadblock stops broadside on the middle lane and closes every lane of that
  direction 4 m behind it.
- **Foot cops** walk the sidewalk graph; urgent goals cross against the light when traffic allows;
  pursue = follow the target at `maxSpeed` (Gameplay's stamina cap).
- Response times: see "Siren priority" above (fixed; was minutes at rush hour).

### Emergency, service traffic and cab rides (`src/sim/service.ts`)
- **Responders** (`dispatch`): ambulance, or fire engine + ladder truck, spawn 150-250 m out on a free
  lane, run with sirens using police routing (careful reds, civilians pull over), work the scene with
  hazards (ambulance 40-80 s, fire 120-240 s), then leave with the siren off and despawn out of range.
  An ambient ambulance run happens every 2.5-5 sim-minutes. Events: dispatched, responderArrived,
  responderLeft. Honest: at rush hour a responder can need 3-6 minutes for a few blocks (one-way
  detours, heavy crossing traffic at Herald Square); Gameplay accepted this as period-true for police.
- **Mail trucks** (08:00-17:30) stop mid-block at the kerb with hazards, 15-30 s, block after block.
  **Soft-serve** (12:00-21:00) crawls side streets chiming every 15 s (`iceCreamChime`), pulls in where
  there are people and a few walkers and loiterers stroll over (`iceCreamStop`).
- **Player cab rides**: `callCab(x,z)` picks the free cab with the shortest *legal* drive (one-way loops
  make straight-line distance useless), routes it to the lane along the caller's kerb, and if the
  one-ways won't bring it there it pulls over at the nearest reachable kerb within ~60 m (`cabReady`
  reports where). `boardCab(id, dest)` drives the shortest legal route, emitting `cabTurnAhead {dir,
  street, distance}` at each turn (for "Call Your Turns"), and `cabRideArrived` at the kerb.
  Routed vehicles (ride cabs, police, responders) hold at the line to merge into their turn lane
  instead of missing the turn (up to 20 s of green), then take the long way round.
- **Hails**: cabs now also pick up from the left kerb on one-way streets (leftmost lane, pulls left).
- **Crosswalk starvation fix**: a car that has waited at the line more than 6 s gets a gap; pedestrians
  hold back for it (the Flatiron crossing could otherwise block turning cars for minutes).

### Parking, enforcement, tows, street cleaning (`src/sim/parking.ts`)
Period-typical rules derived deterministically from the street graph (block-level 1974 signage isn't
documented, so these are plausible rather than historical claims):
- alternate-side cleaning on side streets: each kerb gets two days (Mon/Thu, Tue/Fri, Wed/Sat) and a
  window (08-11 or 11-14) by hashing street and side; avenues have none (swept at night);
- avenues: no standing 07-10 and 16-19 on weekdays (tow-away); bus stops: no standing within 15 m
  (tow-away); hydrants every ~70 m of kerb, no parking within 4.6 m (tow-away), with
  `hydrantsNear(x, z, r)` so the engine places the props where the rules are; corners: no standing within 6 m.
- Fines are tiers ('minor' | 'major'); the Economy stream owns the money. Day of week via `setDay`
  (default Friday, 21 June 1974).
- A registered car in violation for 20 s gets a traffic agent walking down the same sidewalk to write a
  ticket; tow-away violations left 5 minutes (or any violation 30 minutes after a ticket) bring a tow
  truck that routes there, hooks up for 20-30 s and leaves (`vehicleTowed`). Street sweepers work kerbs
  whose cleaning window is on. The tow truck and sweeper use the `box_truck` / `garbage` classes until
  the vehicles stream adds `tow_truck` / `street_sweeper` (request below).
- Kerb room: the build step now checks that each kerb-side lane's parking lane is on roadway ground
  (577 of 590 are); siren gutter runs, pull-overs, cab pickups/drop-offs and service stops only use those.
- Pedestrian `goto` now walks to the exact kerb spot along the target sidewalk (not just the nearest
  corner), and crosswalk fairness compares how long the pedestrian and the waiting car have waited.

### Subway (`src/sim/subway.ts`)
A logical layer over the street entrances (underground geometry belongs to the engine/interiors).
- Stations: the 108 mapped entrances in bounds clustered by the avenue they sit on (within 140 m along
  it): 20 stations on the Eighth Avenue, Seventh Avenue, Sixth Avenue, Broadway and Lexington lines,
  then snapped to narrative's canonical 1974 stops (`CANON`, joined on line + cross street, within 2
  streets): fragments of long platforms merge (Penn, Times Square, 42nd St), 6th Avenue entrances at
  29th–33rd become PATH 33rd St (its own line, separate fare). 15 stations; `complex` marks the free
  transfers (`herald_sq`: Sixth + Broadway, `times_sq`: Seventh + Broadway). Lexington stops have no
  entrances inside the bounds. Each station carries `crossStreet` (number) and narrative's `contentId` (e.g. `station.herald_sq`, shared by a complex's lines).
- Timetable: a pure function of the clock. Headway 4 min at the rush hours, 6 midday, 8 evening,
  12-20 at night; run time between stations from distance at ~10 m/s plus 25 s dwell; both directions
  staggered. `trainTravel(from, to)` gives the exact ride time and direction (uptown = -z; `order` counts
  from the downtown end). `nextTrains(station)` answers instantly (cops can be sent to the next station ahead).
- Platforms: per station and direction, riders accumulate (people who go down the stairs plus an
  ambient rate by time of day) and board each train; alighting riders (more at rush hour) surface at
  the station's entrances near the focus (`subwayExit`). `boardSubway(pedId)` walks a ped to the
  nearest entrance and down. In the 10-min test: 76 train calls, 117 riders up the stairs.

### Doors (`src/sim/doors.ts`)
- Door records come from the engine (interiors' `doorsForChunk`); the sim doesn't import the
  interiors stream. Each door attaches to the nearest sidewalk band (within 10 m); peds walk to the
  kerb spot in front of it and step to a threshold 0.4 m in front of the door.
- Rates by interior kind (`DOOR_RATES`, from the interiors session; `setDoorRates` overrides): mean
  seconds between occupants coming out (rush-hour and evening variants), chance a passer-by within 5 m
  steps in, bursts (cinema screenings, church services, union meetings) and archetype hints for who
  comes out. Residential kinds (tenement, apartment lobby, SRO) never take strangers in. Locked doors and doors
  outside their hours are skipped.
- Interiors/characters can hand occupants over in both directions (`exitFromDoor`, `enterDoor`) to fill
  their slots. Test (40 stand-in doors of mixed kinds from storefront spots): 112 went in, 306 came out in 10 min.

### Archetypes
Runtime for the NARRATIVE_BRIEF slot schema. Built-ins: `npc.commuter`, `npc.worker_handcart`,
`npc.shopper`, `npc.loiterer`, `npc.beat_cop`, `npc.vendor` (peds) and `npc.driver_private`,
`npc.cab_driver`, `npc.delivery_driver`, `npc.bus_driver` (drivers). Content archetypes override
built-ins by id. Spawn weight = density(day 06–20 / night) × schedule (active window: 1 inside its
area, 0.15 outside; no window active: 0). Areas: named districts (Garment, Flower, Fur, Herald
Square, Times Square, 42nd Street, Eighth Avenue strip, Madison Square, Flatiron, Penn Station,
Chelsea, Koreatown, Bryant Park, Murray Hill, Tenderloin) resolved from real street/avenue
positions, or an intersection (`"W 34th St & 6th Ave"`, 100 m box). Optional `params`
(walkSpeed, jaywalk, hail, patience, aggression) and `vehicle` are honoured if present; drivers'
vehicle kind is otherwise taken from props (`cab`/`truck`/`bus`). `barks` ids are passed through on
events (`archetype` field) for the audio/dialogue side.

## Integration contract
As in the updated brief (`vehicles: TrafficVehicleView[]`, `peds: PedView[]`; `AgentView` kept as a
deprecated alias of `PedView`). Hooks: `perceive({x,z,loudness,visibility})`, `setGoal(pedId, goal)`,
`escort(pedId, route, {waitRadius,maxSpeed,target})`, `setSignalPower(area, powered)`,
`blockAt(x,z)`, `footTraffic(blockId)`, `emit({type:'gunfire', x, z, loudness})`, and actors with
`siren: true`. Optional extras: `SimOptions.archetypes`,
`SimOptions.fetchBinary` (Node), `time`, `stats`, `lastUpdateMs`, `graph`, `network`,
`registerArchetypes()`, `setDensityHook()`, `signalStates()`, `debugAgents()`, `archetypeWarnings`.
Events: `honk {id,x,z,kind,archetype,reason,intensity}`, `collision`, `nearMiss`, `hail`, plus
`jaywalk`, `doubleParked`, `pickup`, `dropoff`, `cabAlight`, `busStop`, `busDepart`, `alight`,
`subwayExit`, `subwayEnter`, `dodge`, `hailAnswered`, `escortProgress`, `escortDone`, `goalReached`. `emit({type:'blockLane'|'closeStreet', until})`
takes `until` in sim seconds (`sim.time`); default now + 60 s.

## Test results (`docs/sim_test_report.json`, seed 1974; earlier build also passed seed 7)
10 simulated minutes on the merged engine data (terrain on, E8 small story-core bounds), focus touring Flatiron →
Herald Square → 42nd St & 7th Ave. Scripted: a threat, a blocked lane, a closed street, a brownout
(dark signals for 130 s), gunfire, the player walking a sidewalk, a scripted car driving through
everything with its **siren on** for the middle third, and escort + goto goals on nearby peds.
Checked every other step against geometry independent of the sim:

| Check | Result |
|---|---|
| vehicles off roadway ground / off their lane band | 0 / 0 |
| wrong-way (lane vs 1974 one-way, heading vs lane) | 0 |
| red-light running (stop line crossed on red) | 0 |
| vehicle-vehicle overlap (oriented boxes) | 0 |
| peds inside buildings / on roadway when not crossing | 0 / 0 |
| peds inside a moving vehicle | 0 |
| any agent beyond the playable edge / non-finite or wild y | 0 / 0 |
| deadlock: longest non-dwelling stop | 93 s (limit 180 s) |
| network-wide flow | moving fraction ≥ 0.17 always, 0.48 average |
| wildlife: ground pigeons/rats inside buildings / on the roadway | 0 / 0 (peak 180 animals visible; 164 flock take-offs, 10 rat scatters, 2 park feeders) |
| determinism (two runs, same seed) | identical hashes |
| hooks | 3 escorts (3 waypoint progress events), 3 goto goals (2 reached in time), 142 witnesses returned by `perceive()` for the gunfire |

Activity in 10 min: 2037 lane changes, 1407 crosswalk crossings, 135 jaywalks, 11 double-parks,
43 hails → 5 pickups, 13 drop-offs, 1 bus stop served, 3770 honks, 59 gridlock-fallback despawns.

## Performance (honest)
Headless Node 22, **CPU only, single thread, this container** (no GPU), per fixed step:
- **High (150 vehicles + 400 peds + up to 200 birds/60 rats): 0.77 ms avg, 1.10 ms p95**, 22 ms max (the max is the
  full-ring refill when the focus teleports between tour stops).
- **Mobile Low (40 + 120 + wildlife): 0.17 ms avg, 0.31 ms p95.**
- In the headless browser (`shots/sim/report.json`) the HUD reads ~2.4–3.4 ms per `update()` call,
  but that is Chrome sharing the CPU with the SwiftShader software rasteriser, and up to three
  fixed steps per frame at ~100 ms frames. Needs a real-device measurement; if High exceeds 2 ms
  there, the sim is self-contained (no DOM, no three.js) and can move to a worker as-is.

## Decisions (and why)
- **Merged the engine branch (merge commit) and moved to its shared contracts** as requested via the
  control-panel chat: vehicle classes are picked sim-side (`sedan` most, `hardtop`/`wagon`/`compact`,
  `taxi` for cabs, `box_truck`/`step_van`/early-morning `garbage` for deliveries, `bus`); `lights`
  carries head (dusk/night/rain), brake (decelerating or stopped), indicators (turns, lane changes,
  kerb pulls, pull-over), hazards (double-parked, cab loading) and the vacant-taxi roof light.
- **Edge ramp is spawn-acceptance based**, so it redistributes the same budget toward the edge
  rather than adding agents; the last block crawls (desired speed × edgeDistance/BLOCKERS, ≥ 12 %).
- **Dark signals are an all-way stop**: full stop at the line, then first-stopped-goes-first.
- **Peds step around standing people** instead of queueing behind them (fixed corner pile-ups that
  also held turning cars); a stopped car only blocks a ped who would walk into it.
- **Very short lanes between close junctions** (e.g. W 44th St at Seventh/Broadway) count as part of the
  junction for don't-block-the-box: room is measured through them when the next light is green.
- **Signals synthesized where OSM has none** at real named-street crossings (4). Midtown grid
  intersections were all signalized in 1974; unsignalized junctions use priority rules.
- **Graph pruned to the strongly connected core** instead of edge sources/sinks: no dead ends,
  vehicles never need to vanish in view; spawning happens in a ring around the focus anyway.
- **Signals as a pure function of time** (cycle, offset, phase splits): deterministic, free to
  query for the debug view and for peds' WALK decisions, no per-junction state.
- **Peds in path space** (edge + lateral offset within a validated band) rather than free 2D
  steering: off-sidewalk is impossible by construction, avoidance is cheap.
- **Parking lane is not populated** with parked cars (that's rendering/props), but kerb stops use it.
- Did not use a worker yet: measured cost is under budget on this CPU.

## Critique (screenshots `shots/sim/`, WebGL2 via SwiftShader)
What works:
- Herald Square / 42nd & 7th: platoons queue at red heads and discharge on green; the green wave
  is visible as waves of moving traffic up Sixth and down Seventh; crosswalks and kerb paths line
  up with the streamed sidewalks; signal heads read clearly.
- The Flatiron spawn view shows the Broadway/Fifth/23rd complex with sensible connectors and
  pedestrians on both kerbs.

What doesn't (yet):
- **Placeholder bodies** are deliberately crude (boxes/capsules); vehicle off-tracking is a rigid
  chord between axles, which reads fine from above but a bus corner looks stiff at street level.
- **Cabs and buses (improved).** Cabs now answer hails on their block or route up to two blocks toward
  one, re-checking at each block; a cab already on the hail's block can take over a fare from one still
  approaching. Hailers wait 45–100 s. Buses favour the kerb lane, push in to reach their stop, stops sit
  18–40 m into the block, and there are more buses (density 0.35 day). Fixed-focus probe at Herald
  Square, 400 s: 52 hails → 31 claimed → 15 fares; 12 bus stops served by ~4 buses. In the 10-minute
  touring test (camera jumps, gunfire and threats cancel hails): 74 hails → 3 fares, 8 bus stops.
  Still thin: cabs only stop at the kerb on their right, so one-way streets lose half their hails.
- **Horns are frequent** (~3.4 per vehicle per minute in heavy 17:30 traffic). Period-plausible,
  but the audio side should rate-limit spatially; the sim emits intensity/reason to help.
- **Spill-back jams at Madison Square** (Broadway/Fifth split) at peak density are realistic but
  heavy; the gridlock fallback quietly despawns far-away stuck queues (71 in 10 min).
- **Walk graph gaps**: 160 corner candidates and 44 kerb paths fail validation (buildings flush to
  the kerb, Park Ave median, plazas), so a few blocks have a sidewalk only on one side.
- **Region edge**: streets are clipped at the REGION boundary, so edge blocks have fewer exits.
- Permissive left turns only; no turn-arrow phases. Side streets are not coordinated, only avenues.
- Street-level shot shows a truck right at the camera: the camera rig stands in the roadway.

## Movement (MOVEMENT.md, 2026-11-27): the sim's part
The engine owns bodies, stepping and ragdolls; characters own animation and IK; the sim decides where
NPCs go and how they react.
- **Done (no merge needed):**
  - Bump reactions to the player (`src/sim/bump.ts`): contact severity from closing speed × how head-on it
    is: **brush** (nudged aside, a check in their stride), **stumble** (pushed ~0.5 m, ~1 s), **knockdown**
    (down 2.5–4 s, then `getUp`). Response from nerve and aggression: **angry** (turns on the player and
    holds there 2–3.5 s; gameplay decides shove or fight), **frightened** (backs off at a jog) or
    **annoyed** (a look, carries on). They stay on the sidewalk band throughout. Events `pedBumped
    {id, kind, response, dirX, dirZ, by}` and `pedGotUp`; PedView.state shows `stumble`/`down`/`getUp`/`angry`.
  - Crowds part for a running player: pedestrians look further ahead the faster the player closes
    (3 m walking, up to 8 m at a sprint), so a sprint opens a lane and a careless one still clips people.
  - Obstacles: `setObstacles([{x, z, r}])` for the engine's street furniture (mailboxes, newsstands,
    trash baskets, call boxes, sign posts); the sim's own hydrants are always in. Pedestrians pick the
    nearer side that fits in the band and pass without stopping.
  - `PedView.onRoad`: flips at every kerb step (crosswalk entry/exit, jaywalking), for foot IK and the
    stair/kerb gait.
  - Test: the headless player now alternates walking and sprinting along a sidewalk; the test asserts
    brushes and stumbles/knockdowns happen, and every sidewalk/roadway check still holds.
- **Waits on the merge / other teams:**
  - Same stepping as the player: NPC heights already follow `heightAt` + `CURB_HEIGHT`; the visible step
    (foot IK, body dip) is characters' layer on the same controller rules. Stoops and subway stairs need
    the engine's stair geometry: peds currently vanish at the top step of a subway entrance and
    appear from doors at the threshold.
  - Ragdoll for knockdowns and vehicle hits: the engine's ragdoll; the sim holds the ped in `down` and
    gives the push direction.
  - NPC-on-NPC bumps in crushes (rush-hour corners): avoidance prevents overlap today; shoulder-brush
    animation between NPCs is a characters layer on `speed` + proximity.

- Junction safety under density: every vehicle checks its turn path is physically clear (catches odd
  junction geometry the build step's conflict zones miss); siren units keep their gutter line straight on
  until their rear clears the queue head, wait to turn across it, and cross traffic holds at the line for
  a waiting siren unit; nobody swings back from the kerb or gutter beside someone; cars never spawn on a
  pedestrian in the roadway; jaywalkers read a moving car's next 1.5 s. Lanes funnelling into fewer at
  one approach zipper (nearer the line goes first). Pedestrians with a goal pick the shorter way round
  from mid-block and walk straight to a target on the same block; followers ease in to ~2.5 m.

## vs GTA V / GTA VI / RDR2 (reference games; behaviour and quality only, nothing copied)
| Area | What the reference does | Where we match | Where we fall short | Plan |
|---|---|---|---|---|
| Ambient density | Streets full in every shot; budgets concentrate near the camera; far traffic via LOD | Density-targeted spawning around the camera, out-of-view spawns; ~30 cars / ~97 people within 60 m at rush hour on High | No far-field traffic beyond ~150 m; parked cars missing; Low is thinner | `parkedCars()`; engine impostor traffic for long avenues; ask for Low 90/240 |
| Pedestrian life | Scenarios (smokers, phone calls, vendors, arguments), varied routines, reacting to weather | Commuters, shoppers, loiterers, vendors, pigeon feeders, hailing cabs, bus and subway riders, door traffic by shop type, jaywalking | Few scenario variations; no rain behaviour beyond density (umbrellas, shelter in doorways) | Scenario spots from content (stoop sitters, card games, street preachers); rain: shelter under awnings |
| Reactions to the player | Bumps, insults, flee/fight, filming (VI), recognising repeat offences (RDR2 memory and greetings) | Bumps with brush/stumble/knockdown + angry/frightened/annoyed; witnesses, flee from gunfire, nerve | No memory of the player; no greetings; no escalating confrontations | Per-ped memory of recent incidents (who, what, where) for gameplay; greeting/insult barks on proximity by archetype |
| Traffic behaviour | Lane discipline, honking, impatience, crashes, road rage, emergency vehicles | Period one-ways, green waves, no right on red, honking, cabs cutting in, double-parking, buses, siren priority with gutter runs | No crashes/fender-benders or road rage; no motorcycles weaving | Minor collisions between NPC cars with argue-at-the-curb scenario; road-rage escalation tied to aggression |
| Police AI and pursuit | Units converge, box in, roadblocks, helicopters (V), search patterns | Pursue/boxIn/roadblock/search goals, cut-off at real intersections, subway stakeouts, first unit 13–28 s in the test | No helicopters (period: fewer), no PIT, foot chases simple | Foot-chase tactics (corner, cut through), radio-car relay timing with gameplay |

## Visual bar ("Life") gaps
VISUAL_BAR.md: dense traffic and pedestrians, parked cars on every kerb, a street must never look empty.
- **Near field:** met on High (see the density test). Low (40/120) is thinner (13 vehicles within 60 m
  at rush hour vs 34); asked the engine for 90/240 on phones if the frame budget allows.
- **Parked cars:** not yet. The kerb lanes are empty; the sim offers `parkedCars(x, z, r)` (rule-aware
  static instances) and will then move kerb uses (cab pickups, siren gutter runs) into the gaps.
- **Far field:** long avenue views beyond the populated disc (~150 m) are empty in the sim; that needs
  impostor/LOD traffic on the engine side.
- **Night:** 3 a.m. is deliberately thin (period-true), floor raised to 40% of peak traffic.
- **Cost:** denser near-field traffic made siren units wait at busy junctions; fixed by cross traffic
  holding for a waiting siren unit and dispatch costing a stopped queue head. First unit on scene in the
  test: 13–28 s on both seeds (caps 60 s rush hour / 40 s off-peak).

## Street vendors (STREET_VENDORS.md; sim leads the cross-stream plan)
Types, hours and places come from narrative's `content/vendors.json` (`VENDOR_KINDS` in `src/sim/vendors.ts`
mirrors them; brands and menus stay in content). Adults only.
- **Placement:** every sidewalk spot (corner, storefront, subway mouth) gets, per day, a deterministic chance
  of one vendor type from its spot kind and district: hot dogs at hotspot corners (Herald Sq, Penn, the
  Deuce, Madison Sq, Bryant Park), pretzels and newsstands at subway mouths, nut roasters around Times Sq and
  34th, coffee carts in the Garment and Flower Districts at dawn, ices by the parks and in Chelsea, fruit
  stands on the Eighth Avenue strip, flowers by Madison Sq and Penn, shoeshine near Penn and the Deuce,
  peddlers and three-card monte on the Deuce, Times Sq and 34th. Hours ±20 min per stall. Rain closes ices,
  flowers, shoeshine and monte, puts umbrellas up, and turns peddlers into umbrella sellers.
- **Life cycle:** carts are pushed in along the sidewalk in the first minutes of a shift and pushed away
  at closing; a stall met mid-shift is simply there. Carts are sidewalk obstacles everyone steps around.
- **Trade:** passers-by on the same stretch of sidewalk join a short queue (lunch ×2.5, coffee at dawn ×3),
  are served one at a time (`vendorServed`), walk on carrying it (`PedView.carry`) and sometimes drop the
  wrapper (`litter`). Vendors call out when people are about (`vendorCall`, bark set `barks.vendor_calls`).
- **Reactions:** gunfire/threats: the vendor ducks behind the cart (`vendorCower`) or runs (`vendorFled`,
  the stall shuts for 30 min); a car tearing past the cart: `vendorShout`; a cop lingering near an
  unlicensed peddler: packs up and moves on (`peddlerMovedOn`); a cop within ~25 m of a monte lookout: the
  crew bolts and the crowd breaks up (`monteScatter`). Nobody sets up a game under a foot cop's nose.
- **Monte crew:** dealer behind a cardboard box mid-sidewalk, two shills either side, a lookout up the
  block watching the street, and a loose crowd of passers-by drawn in (`watch` state).
- **Measured (test, seed 1974):** Herald Sq at lunch 6 types (hot dog, pretzel, newsstand, shoeshine,
  peddler, monte), ~70 sales in 3 min, queues up to 5, monte crowds up to ~8 and 4 scatters; the Deuce:
  monte, peddlers, pretzels; Garment District at 07:00: coffee carts with queues of 6, ~85 sales;
  nothing at 23:30.

**Interfaces agreed / proposed**
- **Gameplay** (proposal from gameplay, adopted): events `vendorSpawned {id, kind, pedId, crew, x, z, cart:
  {prop, x, z, yaw}, licensed, goods, variant}` and `vendorGone {id, kind, reason: closed | movedOn | police |
  fled | folded | gone}`; `kind` uses narrative's types. Vendor ids are stable strings (`vendor:<spot>`),
  with `pedId` (and `crew` for monte) for commands. Gameplay → sim: `vendorCommand(id, {type: flee|cower})`
  (robbed), `vendorNotice({kind: cartOverturned | vendorSale | monteFolded, vendor})`. `cartHit` comes from
  vehicles/engine physics to gameplay (sim carts are only props). Brawlers: `releasePed(pedId)` hands the
  ped's movement to gameplay (`moveReleasedPed` each frame) until `reclaimPed` (emits `pedCalmed`).
- **Engine / vehicles** (requests item 13): render `sim.vendorViews` (prop id, cart x/z/yaw, `open`,
  `umbrella`, `variant` → brand panel); carts as pushable / knock-over physics props when the player hits
  them (then gameplay's `cartOverturned`). Prop ids: cart_hot_dog, cart_pretzel, cart_ices, cart_nuts,
  cart_coffee, stand_fruit, stand_flowers, stand_news, stand_shoeshine, peddler_case, monte_box.
- **Characters:** vendor wardrobes (archetypes `npc.cart_vendor`, `npc.grocer`, `npc.flower_seller`,
  `npc.news_vendor`, `npc.shoeshine`, `npc.peddler`, `npc.monte_dealer`, `npc.monte_shill`,
  `npc.monte_lookout`) and work animations keyed on PedView.state and events: `vendor` (idle at the cart),
  push cart (state `vendor` while moving), serve and make change (`vendorServed`, `vendorAct serve`), call
  out (`vendorCall`), duck (`cower`), right the cart (`vendorAct right_cart`), shine shoes, deal cards;
  customers `queue` (wait, pay), `watch` (monte crowd), eating on the go (`carry`).
- **Narrative:** names, brands and barks already in content; the sim passes `variant` and `bark` ids.
- **Audio:** `vendorCall`, cart bell/sizzle near open carts, `monteScatter` shout, `vendorShout`.

**vs GTA V / GTA VI / RDR2**
- *Reference:* GTA V has hot-dog and burger stands you can buy from and blow up, but they're static props
  with a clerk; RDR2's camp and town vendors have routines, greet you and react to theft; GTA VI's trailers
  show dense, busy street commerce.
- *Where we match:* vendors that arrive, trade, queue customers, call out, react to danger and police, and
  leave on a schedule; a three-card monte crew with a working lookout (RDR2-like routine depth).
- *Where we fall short:* no vendor memory of the player (RDR2 greets and remembers), customers don't eat
  standing at the cart, no haggling, carts aren't physics props until vehicles/engine land them.
- *Plan:* per-vendor memory of the player (served, robbed, tipped) for barks; stand-and-eat scenarios at
  hot-dog carts; physics carts and spills via vehicles; protection-racket and permit beats with gameplay.

## Parked cars (VISUAL_BAR "parked cars on every kerb"; requests item 5)
- `sim.parkedCars(x, z, r)` → `{x, z, yaw, vclass, variant, len, wid, lane, s, side}[]`: a slot every ~6.3 m
  along each kerb whose parking lane is on roadway ground (both kerbs of one-lane one-way streets), clear of
  the corners; empty where `Parking.rule` says no; otherwise ~86% full by day, ~93% at night,
  deterministic per slot and day. The engine instances them through the traffic renderer and refreshes when
  the focus moves ~100 m or on the quarter hour (rules change with time).
- **Kerb rules (period):** Midtown avenues and the major crosstown streets (14th, 23rd, 34th, 42nd, 57th)
  are "No Standing 7 AM – 7 PM" on weekdays; side streets park solid; everything parks at night and at
  weekends; hydrants, bus stops and corners stay clear; alternate-side cleaning empties one side in its
  window. The same rules ticket and tow the player's car.
- **Traffic uses the gaps:** siren gutter runs only where the gutter is clear to the end of the block;
  civilians pull over for a siren only into a gap (otherwise they keep moving so it can follow); cab and
  service stops pull into a gap, or stop at the lane edge beside the parked cars (double-parked, 1974-style);
  anything out in the parking lane treats the parked cars as obstacles.
- **Emergency response with parked kerbs:** units on patrol start on the open corridors; side streets cost
  more to route through (nobody can get out of the way); a unit heading for a side-street scene stops on
  the nearest corridor within ~75 m; a unit stuck in traffic within sight of the scene (90 m; a block if
  it's wedged in a parked side street) stops and the crew goes on foot. First unit on scene in the test:
  13–28 s on both seeds.
- **Counts (Herald Square, 150 m):** ~75 by day (side streets), ~180 at night (every kerb).

## Grand Central (user decision; after the merge sprint)
The east edge moves to include Grand Central Terminal. Plan (requests item 12): the Park Avenue viaduct and
ramps as their own lane level (streets with grade `g` ≠ 0 are left out of the ground graph today, so they
can't make false junctions), taxi stands by the terminal, and rush-hour concourse crowds (adults only)
on the timetable, once the engine posts the new PLAYABLE and the concourse walkable area.

## Known issues / next
- [ ] Rush-hour gridlock margin: the longest standstill in the test is ~160 s at Herald Square / 34th St
      (deadlock cap 180 s) since the near field got denser; watch it after the integration pass.
- [ ] Park Avenue's divided carriageways get a default 3 m kerb band on both sides, including the mall
      side; the mall itself (planted medians, crossings at the cross streets) isn't modelled yet.
- [ ] Police vehicle agents (pursuit, box-in, roadblocks), foot cops on the walk graph, car-owner
      reactions, plate/description recognition: Gameplay will request these through ENGINE_REQUESTS.
- [ ] Edge layer 3 extras: rubbernecking at edge blockers, chase roadblocks; retune when bounds shrink.
- [x] Coordinator's order complete (police, responders + cabs, siren priority, parking/tow/sweepers,
      subway, Interiors doors, mounted police + strays). Next: the engine's integration pass.
- [ ] Mounted officer renders as a ped with a `horse` prop until the engine has a horse rig.
- [ ] Wildlife: rats on actual subway tracks need the engine's track geometry; pigeons don't yet react
      to the player's car specifically (only generic external vehicles).
- [ ] Real-hardware timing (desktop + phone); move to a worker if High > 2 ms on device.
- [ ] Cab dispatch over the next 2–3 blocks; bus route ids and denser stop service.
- [x] Parked cars (sim supplies them; engine instances).
- [ ] Rush-hour gridlock at Herald Square / West 34th: longest standstill in the test is up to ~179 s on seed 7 (cap 180).
- [ ] Walk graph: fall back to a narrower band or a kerb-hugging path where buildings meet the kerb.
- [ ] Turn-arrow phases where 1974 practice had them; pedestrian countdown is implicit.
- [ ] Clock-driven schedules once the engine clock exists (`setClock` already honoured).
- [ ] Spatial-hash spot lookup (spots are sampled randomly, fine at current counts).
