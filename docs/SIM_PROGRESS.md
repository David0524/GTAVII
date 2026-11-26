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
| Integration contract (`src/sim/index.ts`) | **Done**, exactly as briefed plus optional extras |
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

Result: 247 junctions (204 signalized), 1137 lanes, 1506 connectors, 2093 conflicts, 598 walk nodes,
1034 walk edges (514 crosswalks), 2992 spots, 74 bus stops.

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
- Spawning in a ring around the focus (High: 0.6–2.6 × 10² m; Low: 0.6–1.6 × 10² m), density by
  time of day × weather × optional `setDensityHook`; despawn beyond the ring; gridlock fallback:
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
Exactly as in the brief. Optional extras (no breaking changes): `SimOptions.archetypes`,
`SimOptions.fetchBinary` (Node), `time`, `stats`, `lastUpdateMs`, `graph`, `network`,
`registerArchetypes()`, `setDensityHook()`, `signalStates()`, `debugAgents()`, `archetypeWarnings`.
Events: `honk {id,x,z,kind,archetype,reason,intensity}`, `collision`, `nearMiss`, `hail`, plus
`jaywalk`, `doubleParked`, `pickup`, `dropoff`, `cabAlight`, `busStop`, `busDepart`, `alight`,
`subwayExit`, `subwayEnter`, `dodge`, `hailAnswered`. `emit({type:'blockLane'|'closeStreet', until})`
takes `until` in sim seconds (`sim.time`); default now + 60 s.

## Test results (`docs/sim_test_report.json`, seed 1974; also passes with seed 7)
10 simulated minutes, focus touring Flatiron → Herald Square → 42nd St & 7th Ave, with a threat, a
blocked lane, a closed street, the player walking a sidewalk and a scripted car driving through
everything. Checked every other step against geometry independent of the sim:

| Check | Result |
|---|---|
| vehicles off roadway ground / off their lane band | 0 / 0 |
| wrong-way (lane vs 1974 one-way, heading vs lane) | 0 |
| red-light running (stop line crossed on red) | 0 |
| vehicle-vehicle overlap (oriented boxes) | 0 |
| peds inside buildings / on roadway when not crossing | 0 / 0 |
| peds inside a moving vehicle | 0 |
| deadlock: longest non-dwelling stop | 144 s (spill-back queue at 6th Ave/42nd; limit 180 s) |
| network-wide flow | moving fraction ≥ 0.15 always, 0.49 average |
| determinism (two runs, same seed) | identical hashes |

Activity in 10 min: 2158 lane changes, 442 crosswalk crossings, 44 jaywalks, 19 double-parks,
74 hails → 7 pickups, 19 drop-offs, 1 bus stop served, 5088 honks, 71 gridlock-fallback despawns
(53 in spill-back queues far from the focus).

## Performance (honest)
Headless Node 22, **CPU only, single thread, this container** (no GPU), per fixed step:
- **High (150 vehicles + 400 peds): 0.88 ms avg, 1.22 ms p95**, 16.6 ms max (the max is the
  full-ring refill when the focus teleports between tour stops).
- **Mobile Low (40 + 120): 0.17 ms avg, 0.37 ms p95.**
- In the headless browser (`shots/sim/report.json`) the HUD reads ~2.4–3.4 ms per `update()` call,
  but that is Chrome sharing the CPU with the SwiftShader software rasteriser, and up to three
  fixed steps per frame at ~100 ms frames. Needs a real-device measurement; if High exceeds 2 ms
  there, the sim is self-contained (no DOM, no three.js) and can move to a worker as-is.

## Decisions (and why)
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
- **Too few buses serve stops** (1 in 10 min) and **cabs answer few hails** (7 of 74): the hail
  has to be on the cab's current block, on its kerb side, 18–110 m ahead. Needs a dispatch-style
  search over the next blocks. Bus routes are street-name based, not real route numbers.
- **Horns are frequent** (~3.4 per vehicle per minute in heavy 17:30 traffic). Period-plausible,
  but the audio side should rate-limit spatially; the sim emits intensity/reason to help.
- **Spill-back jams at Madison Square** (Broadway/Fifth split) at peak density are realistic but
  heavy; the gridlock fallback quietly despawns far-away stuck queues (71 in 10 min).
- **Walk graph gaps**: 160 corner candidates and 44 kerb paths fail validation (buildings flush to
  the kerb, Park Ave median, plazas), so a few blocks have a sidewalk only on one side.
- **Region edge**: streets are clipped at the REGION boundary, so edge blocks have fewer exits.
- Permissive left turns only; no turn-arrow phases. Side streets are not coordinated, only avenues.
- Street-level shot shows a truck right at the camera: the camera rig stands in the roadway.

## Known issues / next
- [ ] Real-hardware timing (desktop + phone); move to a worker if High > 2 ms on device.
- [ ] Cab dispatch over the next 2–3 blocks; bus route ids and denser stop service.
- [ ] Parked-car props for the parking lanes (engine) and kerb gaps at hydrants/bus stops.
- [ ] Walk graph: fall back to a narrower band or a kerb-hugging path where buildings meet the kerb.
- [ ] Turn-arrow phases where 1974 practice had them; pedestrian countdown is implicit.
- [ ] Clock-driven schedules once the engine clock exists (`setClock` already honoured).
- [ ] Spatial-hash spot lookup (spots are sampled randomly, fine at current counts).
