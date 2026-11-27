# VEHICLES_PROGRESS: Tenderloin '74 vehicles workstream

This file is the source of truth for the vehicles workstream: read it first, update it last.
Brief: `docs/briefs/VEHICLES_BRIEF.md`. Branch: `claude/youthful-newton-py223e`, based on
`claude/tenderloin-74-engine-qi54lt`.

## Session 6: item 0, base model fidelity (oversight review of visual_dents)
- **Hero LOD0** for the player car and the near ring (`updateHeroRing`, `HERO_RING`): low/phone
  = player only, medium +1, high/ultra +3 within 30 m, with hysteresis at 38 m. At most one
  promotion per frame.
  - `generate(..., { hero: true })`: every surface grid is refined by a chord-scaled
    Catmull-Rom spline in both directions (`GeoBuilder.sub`, `densify()`). Short spans keep
    short tangents, so crisp character lines stay crisp and nothing overshoots.
  - **Wheels:** 48 segments. The tyre is real geometry: rounded shoulders, two circumferential
    grooves, 24 staggered tread blocks, a moulded bead ring and a blank raised lettering band.
    Full covers have a 24-flute ring, a domed cap and a medallion; hubcaps get lug nuts.
    Whitewalls are proud of the sidewall.
  - **Panel gaps as geometry:** hood shut lines (both fender edges and the cowl), a deck-lid
    rectangle on notchbacks, and door seams following the body (10 points).
  - **Details:** door handles with a pull cup and lock barrel; invented relief badges (bevelled
    chrome crest with a chevron on the hood and deck, three-bar fender emblems); a 3-spoke
    steering wheel; a gauge cluster with chrome bezels, faces, ticks and needles; a centre
    stack; a cabin shell (door cards, armrests, floor, transmission hump, firewall).
  - `Vehicle.setHero(on)` swaps body, hood and wheel geometry and **replays the dents** (now
    logged in body space).
- **Budgets (triangles)** from the "hero frame" cost measurement:

  | LOD | Use | Triangles |
  | --- | --- | --- |
  | Hero | player + near ring | cars 39–41k, trucks 29–37k, bus 43k |
  | LOD0 | standard | 6–9k |
  | LOD1 | | 1.5–2.7k |
  | LOD2 | box | — |

  - Hero generation: 65–205 ms per model (Node). First swap in the browser: 0.4–1.7 s under
    SwiftShader, including the upload.
  - **That is a hitch.** Plan: generate hero meshes in a worker or idle time at spawn
    (`factory.preload`).
  - In view, a hero car adds about 20–28k triangles to the frame.
  - Phone: the player's car only, so +40k triangles on an iPhone 17 Pro tier — affordable
    (scenes there run around 1–2M). Not benchmarked on a device: this container has no GPU.
- **Glass:** cracks now radiate from the impact point, in the pane's own plane (per-pane `hit`
  uniform).
  - Laminated windscreen and back light: a spider web (about 17 spokes, rings, a crushed core).
  - Tempered side glass: dice cracking that spreads from the hit.
  - Bumped so the cracks catch light. Restored saves crack from the pane centre.
  - "Refraction" is only the bump and highlight: the glass has no screen-space refraction.
- **Dents near the arches are clamped.** There is no deformation inside the arch opening plus a
  6 cm lip, with full deformation 20 cm beyond it. No tearing, and the wheel stays outside.
  Shot: `hero_dent_arch.jpg`.
- **MOVEMENT.md anchors:** `vehicle.movementAnchors()` returns, in world space:
  - **doors** (per seat): stand point and yaw, handle, hinge, seat pose, carjack stand point,
    throw direction, locked flag;
  - **surfaces** (hood, roof, deck, cargo tops) as oriented boxes with their top height and
    kind: `vault` (0.5–1.2 m), `climb` (1.2–2.2 m) or `none`.
  - Example: the sedan's hood is 0.82 m (vault), its roof 1.36 m (climb) and its deck 0.87 m
    (vault). Bus and box-truck roofs are `none`.
- **Rig:** `renderer.info` was never reset with the loop paused, so triangle and draw counts
  from `renderOnce()` were running totals. `renderOnce()` now resets it. **Earlier traffic
  draw and triangle numbers in this file may be inflated.**
- **Shots:**
  - `hero_vs_standard.jpg`
  - `hero_details.jpg`
  - `hero_glass.jpg`
  - `hero_dent_arch.jpg`
  - `hero_classes_vs_period.jpg`: big sedan vs DOCUMERICA 549851, taxi vs 549869, box truck vs
    554299, bus vs 549921, wheel and hubcap vs 555907 (shape only).

- **Shape pass 1** (`ModelSpec.shape`): the side is no longer a slab. Two new loft rows give:
  - a rocker tuck (sill width 0.86–0.89);
  - a convex lower side (`round`);
  - tumblehome toward the belt (0.965–0.976);
  - a fender-top peak over the front fender;
  - a rear-quarter hip swell over the rear wheel (1–2%, strongest on the Tiverton coupe).
  - Set on the Bancroft family (sedan, patrol, cab, wagon), the Tiverton, the Ferris and the
    Fareway.
  - Cost: standard LOD0 is now 8.5–9.6k triangles for cars (about 20% over the ≈8k guide);
    LOD1 is 1.6–2.0k.
  - Against 549851 the big sedan now reads as curved sheet metal. The taxi still has a tall,
    upright greenhouse and flatter arches than the 549869 cab: shape pass 2.
- **Queued after item 0 (oversight, user decision):** street-vendor carts as physics props
  (docs/briefs/STREET_VENDORS.md, fbaf7d2): hot-dog with umbrella, pretzel/knish, ices, nut
  roaster, fruit, flower, shoeshine stand, and a coffee van. They push, tip over and spill
  goods, with invented branding and the same LOD chain as the cars.

- **Licence plates are period-correct now.** Checked against Wikipedia's New York plate table
  (the 1973–80 base row):
  - embossed dark-blue serial on reflective orange;
  - a border line, with "NEW YORK" centred at the bottom;
  - **no slogan.** "THE EMPIRE STATE" was a 1951–54 and 2001–10 slogan, and it is removed;
  - a bordered sticker spot at the bottom right that New York never used (revalidation was a
    windshield decal).
  - Serials follow the base: `123-ABC` / `12-ABC`, numbers 51–999.
  - Commercial vehicles use the same base: their 1974 legend isn't verified, so nothing invented.
- **No generation hitch.** Hero meshes are built in a Web Worker (`heroWorker.ts`): 46–153 ms
  per model off the main thread, then handed back as transferred buffers.
  - `setHero(true)` only swaps once the mesh is ready; until then it requests it and returns
    false. `vehicle.prefetchHero()` is called at spawn for the player. With no Worker, generation
    falls back to an idle callback.
  - The swap itself is cheap on the CPU (a steady hero frame is 1.5 ms CPU, the same as standard).
  - Under SwiftShader the first draw after a swap takes 0.3–1 s. That is the software GPU
    uploading the new buffers and the morph texture, which a real GPU does in milliseconds.
    Not measurable here.
  - Plan: warm the upload when the worker delivers (engine: `renderer.compileAsync` or an
    off-screen draw).

- **$0 / free assets (FREE_ASSETS.md):** four CC0 ambientCG materials, logged in
  `docs/licenses/ASSETS.md` with the licence-page quote.
  - Rubber004 → tyres; Leather026 → vinyl roofs and seats; Metal009 (roughness) → chrome wear;
    SurfaceImperfections003 → rain-run dirt streaks on paint and road film on glass, scaled by
    the car's dirt.
  - Six greyscale 512² JPEGs, 396 KB in total, sampled triplanar in body space.
  - Off on low (phone) quality: about 3 samples × 2 maps per material on desktop.
  - The generator stays: no real car designs.

- **Bus shape pass (CT-40, against DOCUMERICA 549921):** rounded front corners in plan
  (cornerF 0.5), a deeply bowed (0.24 m) and raked "fishbowl" windscreen, a slightly sloped lower
  front, and a gentle side tuck.
  - The front and centre doors are now real two-leaf glazed doors: aluminium frames, upper and
    lower glass with a mid-rail, a rubber centre seal, a recessed opening and a step well,
    reaching the side-window line.
  - LOD0 is 10.1k triangles.
  - Still short of the photo: a flatter lower front, no chrome bumper band, no wipers or mirror
    arms.
- **Vendor props, ids from Sim** (fb337dc): cart_hot_dog, cart_pretzel, cart_ices, cart_nuts,
  cart_coffee, stand_fruit, stand_flowers, stand_news, stand_shoeshine, peddler_case, monte_box.
  - Positions come from `sim.vendorViews`; a hit sends gameplay `cartHit`.
  - The engine side is docs/requests/sim.md item 13.

- **Interior rework:**
  - **Layout.** The cabin is now laid out from the driver's H-point. Seats moved back to about
    0.95 m behind the windshield base (they were 0.4–0.6 m), so `seatPose` changed for the
    Bancroft family, the Tiverton, the Ferris and the Fareway. The steering wheel sits 0.42 m
    ahead of the hip, the dash face 0.6 m ahead, the seat back just behind, and the rear bench
    one row (0.95 m) back.
  - **The painted belt deck over the cabin is gone.** It hid the seats and dash from outside the
    glass.
  - **Hero cabin:** dash with a padded lip and a glovebox line; gauges on the dash face; a radio
    and heater panel; pedals and a column shift; pleated bench tops; door cards with armrests,
    pulls and window cranks; floor and transmission hump; firewall; rear-view mirror.
  - Shot: `hero_interior.jpg` (over the shoulder, and through the side glass).
- **Vendor-cart notes from Sim** (63099eb):
  - `cart_coffee` is a pushcart (0.8 × 1.4, urn and roll tray). A van would be a separate
    `van_coffee` id, parked in the kerb lane.
  - Righting: Sim emits `cartRighted {id}` 6–10 s after `cartOverturned`; that's the cue for
    `props.right(id)`. The cart then goes to `leaving` (kinematic).
  - Sim uses the footprints above for pedestrian avoidance (kiosk 1.15 m, monte box 0.3 m).

- **Street-vendor props (STREET_VENDORS.md, Sim's ids):** `src/vehicles/props/`, via
  `factory.createVendorProps(world, scene)`.
  - **API:** `sync(sim.vendorViews)` before the step; `update(dt)` after it; `on('cartHit' |
    'tipped' | 'spill')`; `right(id)` (on Sim's `cartRighted`); `shove(id, from, impulse, byId)`
    for characters; `anchors(id)` for the vendor stand point, three queue points and the push
    handle, with facing yaws.
  - **Props:** cart_hot_dog (striped umbrella, steam table, condiment bottles, spoked wheel,
    steam), cart_pretzel (glass display case), cart_ices (tubs, syrup bottles, umbrella),
    cart_nuts (brass roaster drum, chimney, coal glow, steam), cart_coffee (a pushcart per Sim:
    two urns, a roll case, steam), stand_fruit (three tiers of crates, awning), stand_flowers
    (stepped bench of buckets, awning), stand_news (fixed kiosk, magazine racks, paper stacks),
    stand_shoeshine (raised chair on a drawer box, footrests), peddler_case (attaché on a stand),
    monte_box.
  - **Branding:** invented brand panels from `VENDOR_BRANDS`, picked by `variant`, for Narrative
    to edit.
  - **Rendering:** the car materials (grime, CC0 textures), FadeLOD LOD0/LOD1/culled, and a
    contact shadow.
  - **Physics:**
    - Rapier bodies, kinematic while `arriving`/`leaving` and dynamic otherwise; a hit locks a
      cart out of Sim's control until `right()` or a new push cycle.
    - Vehicle contacts above 1 m/s emit `cartHit {id, prop, by: driverId, byVehicle, speed}`.
    - The car's momentum is handed over (the kinematic case).
    - Hits over 10 mph roll the cart over sideways, across its narrow base. Pitching it end over
      end was absorbed by the ground contact.
    - Hits over 3 m/s spill goods as small dynamic bodies (franks, cans, pretzels, cups, cones,
      rolls, fruit, bunches, papers, tins, watches, cards, bottles), instanced per kind,
      240 live at most, each lasting 60 s.
  - **Test:** a 21 mph sidewalk hit on the hot-dog cart gave `cartHit`, a 13-item spill and
    `tipped`. Shot: `vendors.jpg`. Test lot: `&mode=vendors`.
  - **Not done yet:** `van_coffee`; instancing of parked carts (each cart is about 6 draws);
    vendor-cart lights at night.

- **Bus details:**
  - A chrome front bumper with a deeper wrap.
  - Chrome bands across the headlamp line and under the windscreen.
  - Transit-style mirrors on long chrome arms from the front corners, reaching out and forward
    to a head at about 2.2 m.
- **Windscreen wipers on every vehicle** (LOD0): two arms parked along the base, with rubber
  blades and pivots. Bus and truck arms are longer.
- LOD0 triangles: bus 10.3k, cars 8.4–9.5k.

### vs GTA V / VI / RDR2 (vehicles)
- **What the references do:**
  - GTA V player cars are high-poly hero meshes with full interiors and working gauges.
  - Damage is vertex deformation everywhere. Doors, hoods and bumpers hang and fall off.
    Windows shatter into falling shards. Tyres burst and leave rims that spark.
  - Paint carries dirt layers. The cars sit in the world's reflections.
  - GTA VI (trailers) adds wet surfaces, ray-traced reflections and dense, varied traffic.
  - RDR2's wagons model visible mechanics and accumulate mud.
- **Where we match:** round wheels with tread and sidewall geometry, wheel covers and
  whitewalls; local dents that hold at the arches; radial safety-glass cracks; contact
  shadows; headlights that light the road; wet paint with beads; no LOD pops; dirt grime; burn
  stages; a nearest-cars LOD policy like GTA's.
- **Where we fall short:**
  1. **Sheet-metal shape.** Next to the period photos our bodies read boxy and flat-sided. The
     real cars have tumblehome, fender peaks, swept quarters, deep bumpers and heavy chrome
     sections. This is the spec and loft design, not polygon count: hero smoothing can't add
     curvature the spec doesn't describe.
  2. **Interior.** A cramped layout (seat, wheel and dash spacing are wrong) and boxy forms.
  3. **No detachable parts** (hood, door, bumper) and no glass shards.
  4. **No real world reflections:** an env map only, until the engine's probes or SSR land.
  5. **No tyre lettering, no rim sparks.**
- **Plan, in order:**
  1. A shape pass per class against the period photos: tumblehome profile, fender-peak and
     belt crease, quarter sweep, bumper sections.
  2. An interior rework: proper H-point layout, sculpted dash and door cards.
  3. Detachable bumper, hood and doors with hinge physics.
  4. Glass shard particles.
  5. Wire paint, chrome and glass to the engine probes when they exist.

## Session 5b: visual bar 6, 7, 8 (surface detail, wet paint, LOD crossfade) + a shading bug
- **The vertical shading bands on every car's sides were a real bug, now fixed:**
  - Loft stations are unevenly spaced (1 cm next to 40 cm around the arches and lamps).
  - Area-weighted vertex normals made each belt-line vertex lean toward whichever neighbour
    was wider. Normals alternated station to station, which read as stripes in the reflections.
  - `angleWeightedNormals()` (gen/builder.ts) now builds the normals for every generated mesh and
    after every dent. Side rows also keep a fixed order at every station: they used to drop rows
    at the arches, which twisted the quads.
  - Visible in `visual_detail.jpg` (bottom right) and the new turntables.
- **6, normal detail.** TSL bump maps, faded out with distance so they don't shimmer:
  - paint: orange peel, plus metallic flake on metallic variants;
  - chrome: pitting in the roughness and the bump;
  - grilles: egg-crate bars;
  - vinyl roofs: pebbled grain;
  - tyres: a new `tyre` material on the wheels (`mats.wheelArray`), with tread blocks and grooves
    on the crown and fine rings and dust on the sidewall.
  - Wheels now have 18 segments at LOD0 (was 14). LOD1 wheels have 10 segments, a cover disc
    and whitewalls, so LOD1 reads like LOD0.
- **7, wet paint.** `setWetness(w)` now darkens the paint and the dirt, sharpens the clearcoat
  (roughness 0.12 → 0.03) and raises water beads, which are stronger on upward faces and absent on
  dirt. The glass already had rain streaks. Shot: `visual_wet.jpg`.
- **8, no LOD pops.** `FadeLOD` (src/vehicles/fadeLod.ts) replaces THREE.LOD for bodies and wheels.
  - 10% hysteresis band.
  - 0.35 s screen-space dither crossfade: a per-object `lodFade` uniform read by a `maskNode` in
    every vehicle material. The outgoing and incoming levels show complementary pixels, so there
    are no holes.
  - Camera cuts (more than 0.25 s since the last update, or a jump of 2 levels) switch instantly.
  - Only the view camera drives it. Engine: call `setVehicleViewCamera(camera)`. Without it,
    shadow-pass cameras flipped the levels, which hid whole cars in the first try.
  - Off on low quality, where an always-on discard costs early-z on tiled phone GPUs; that path
    keeps the hysteresis only. Shot: `visual_lod_fade.jpg`.
- **Budgets (triangles):**
  - LOD0: 6.1k (courier) to 8.8k (Bancroft), CT-40 bus 9.1k. The rounder wheels cost 480 per car.
    Bancroft and the bus are now about 10% over the ≈8k target.
  - LOD1: 1.5–2.0k for cars, 2.7k for the bus. Whitewalls and wheel covers are back, so LOD1
    matches LOD0 through the fade.

**Critique, honest:**
- Tyre tread reads only in grazing light. In shadow under the arch it is black on black, as in
  life.
- The egg-crate bump is subtle next to the modelled vertical bars on the Tiverton grille.
- Metallic flake needs a sunny close-up to show. SwiftShader shots under-sell all three.
- LOD1 still has opaque glass (no cabin) and no side trim strip, so the dissolve is visible as a
  glass-darkness change at 40 m.
- Traffic instances switch LOD1→box at 160 m with no fade. A per-instance dither would need an
  instance attribute: next.

## Session 5: visual bar (VISUAL_BAR.md): contact shadows, lights that light, local dents
Gap list sent to oversight: 1 reflections (partial), 2 damage deformation (partial), 3 interiors
(done, basic), 4 lights cast light (missing), 5 contact shadows (missing), 6 normal detail
(partial), 7 wetness (partial), 8 LOD pops (at risk), 9 parked cars (sim/engine). This session
closes **5, 4 and 2**. 6, 7 and 8 are next.

- **Contact shadows (5)** are in `src/vehicles/lighting.ts`:
  - Each model bakes a footprint texture once: a soft rounded rectangle under the body plus a
    tight dark patch under every tyre (dual rears count wider).
  - The quad lies on the plane through the wheel contacts (mean point and normal), turned to the
    heading. It fades with height when airborne and when the car rolls over.
  - Every simulated car and bike gets one, and every traffic instance (one instanced quad per
    model batch). Cost: one transparent draw per car, or per model for traffic.
  - Shot: `visual_contact_shadows.jpg` (off/on).
- **Lights that cast light (4):**
  - `CarLightPool` is a fixed pool of SpotLights (headlights) and PointLights (brake/tail glow).
    Unused lights sit at intensity 0, so the light count and the shaders never change.
  - `updateCarLights(pool, cars, camera, extraCandidates)` hands the lights to the player first,
    then to the nearest cars with lamps on, traffic included via
    `traffic.lightCandidates()`.
  - Budget (`LIGHT_BUDGET`): low (phone) 1 spot and 1 glow; medium 3/2; high 6/4; ultra 8/6. The
    first spot casts a 512² shadow on high and ultra only.
  - Every other car with lamps on draws cheap **additive ground pools**: a low-beam wedge, and a
    brake or tail glow. Cars that hold a real light skip their pools.
  - `setGroundLightLevel(night)` sets the time of day and scales the pools and the real lights.
    The scene's sun is not physically scaled, so at noon the car lights are off (they would
    otherwise paint visible pools on sunlit concrete). **The engine's time of day should call it.**
  - Test lot: `&night=1` or `__VEH.setNight(f)`.
  - Shots: `visual_night_lights.jpg` (chase view with the real beam vs emissive only, oncoming
    beam, brake glow) and `visual_night_traffic.jpg` (150 cars).
- **Local dents (2):** `vehicle.dent(worldPoint, metres, radius)`.
  - It works on a copy-on-write clone of the shared body (and hood) geometry, on top of the four
    zone morphs. The crater falls off smoothly and has crumple noise, pushing toward the body
    core with the vertical damped, so cars crumple rather than flatten.
  - Wall and car contacts queue dents along the impact episode, applied at most every 80 ms, not
    on low quality. `applyHit({type:'impact'})` dents at the hit point. `repair()` restores the
    shared geometry.
  - Cost: **3.4 ms per dent** on the CPU (5.2k vertices, mostly computeVertexNormals). Rate-limited
    so it can't run every frame; on phones it is off. Next: renormalise only the touched faces.
  - Shot: `visual_dents.jpg`.
- **Fixed a shot-rig bug:** the crumple close-up launched the car 6 m short of the wall, so earlier
  close-ups showed an undamaged car. `damage_crumple_closeup.jpg` now shows the real crumple.

**Critique, honest:**
- The headlight beam is a single spot per car, aimed as a low beam (hitting the road about 9–14 m
  out). It reads well head-on, but the chase view only shows a short pool. No volumetric haze and
  no lens flare yet; that belongs to the engine's post stack.
- At night the test lot has no street lights, so the frames are darker than any real 1974 street;
  the city's lamps will carry the ambient.
- The traffic ground pools are flat additive decals: they don't wrap kerbs or light walls.
  Acceptable past about 45 m, where they are used.
- Frame-time cost of 6–8 forward lights can't be measured here (SwiftShader). The budget table is
  the guard. On phones: one spot and one glow.

## Session 4: after the usage reset (engine-independent gaps)
- **Merged** the engine at adb6373. The engine accepted request 7, so the registry now resolves
  every shared class: the emergency vehicles, mail, ice cream, motorcycle, police motorcycle
  and bicycle (messenger 80%, carrier trike 20%).
- **The traffic renderer instances two-wheelers:** frame, steering assembly and wheels merged
  at LOD1; the police bike's beacon follows the Siren bit.
- **Interiors visible through the glass** (passenger cars, LOD0):
  - bench seats with headrests, upholstered in a period colour chosen by the variant;
  - a dash with a padded top, a steering wheel and column, a parcel shelf and a headliner.
  - Per-pane glass is tinted and see-through at opacity 0.58. Cracked glass goes milky and
    shattered glass opens. LOD1/LOD2 keep opaque glass because they have no cabin.
- **Wheels:**
  - full covers with a rolled lip, a concentric groove and a domed centre cap;
  - wider period whitewalls.
  - A lathe winding bug had made dished truck hubs render hollow from outside. Wheel lathes now
    take an explicit inboard point. High-sill vehicles get a back disc.
- **Brightwork on trucks and emergency vehicles:** black window surrounds, door shut lines and
  handles. Subway windows get rubber gaskets.
- **Rapier:** the engine's `src/shared/rapier.ts` has **not landed yet**. All vehicles imports go
  through `src/vehicles/rapier.ts`, so the switch is a one-line change.
- **Budget:** the sedan's LOD0 is now about 8.3k triangles (whitewalls, covers, cabin), 4% over
  the ≈8k target. Every other model is within 5.2–7.9k.

## Session 3c: touch driving (user decision: analog gas and brake pedals by default)
- **Physics:**
  - Torque-converter **idle creep**: 2.3 mph with no pedals; any brake holds the car.
  - **Park** via `setParked()`.
  - **Reverse needs a firm brake** (over 0.6) held at a standstill for 0.5 s, so a light thumb
    hold at a red light just holds.
  - Assist counter-steer goes through `steerExtra` (radians) and bypasses the speed-sensitive
    reduction.
- **`DriverAssist`** (`src/vehicles/assist.ts`, pure, 4 Node tests): pedal response curves,
  steering smoothing, a speed-sensitive ratio, yaw-stabilisation counter-steer with a throttle
  lift, and auto-accelerate with a cruise governor. Touch defaults: assist on at 0.6,
  auto-accelerate off.
- **Measured (Bancroft, scripted thumb inputs):**
  - A 20% thumb on the gas gives 3.3 mph and 30% gives 6.3 mph (fine creeping).
  - A gentle stop from 30 mph at 45% brake takes 4.2 s and 89 ft with no lock-up. Holding there
    5 s doesn't select reverse; a firm hold does.
  - Full lock in parking: 4.9 m radius.
- **Wet tail-out slides** (handbrake and full lock, then hands off), heading change after 2.5 s:

  | case | assist off | assist on |
  |---|---|---|
  | Bancroft at 40 mph | 63° (still rotating) | 17° (stopped rotating) |
  | Tiverton at 45 mph | 69° | 31° (stopped rotating) |
  | Bancroft at 50 mph | 81° | 62° |
  | Ferris at 40 mph | 87° | 63° |

  The harsh cases are reduced, not saved: the assist is deliberately light. Its strength is a
  setting.
- **Honest:** a first version measured slip at the centre of mass and fought ordinary cornering
  (a feedback loop). It was replaced by yaw-rate stabilisation, which only acts on rotation
  beyond what the steering asks for.

## Session 3b: look pass against the references (oversight review of the lineup)
**Fresh comparison:** `shots/vehicles/lineup_vs_references.jpg`. Each render is now framed like
its photo: the Tiverton as in 549851, the Bancroft cab as in 554331, the CT-40 as in 549921.

**Checked before changing anything:**
- **Dimensions were already period-correct.** The Bancroft is 5.75 m overall, 2.0 m wide, with
  a 1.62 m track and 1.39 m height, against 1973–74 full-size cars at roughly 5.6–5.8 m, 2.0 m
  and 1.37–1.40 m. The "short and upright" read came mostly from wide-angle framing and from
  missing brightwork. So the only proportion change is the sedan roof, 3 cm lower with a
  slightly longer roof line.
- **The PMREM street environment was already on in the test lot.** It was too low-contrast to
  read in chrome, so it has been retuned.

**Changed:**
- **Brightwork:** chrome window surrounds and belt mouldings (black trim on police cars),
  chrome wheel-lip mouldings, door shut lines, and door handles on every passenger car.
- **Arches:** clean vertical cut-outs with no inward tuck, which removes the dark smudge over
  the wheels.
- **Materials:** glossier clearcoat (0.75, roughness 0.12), finer vinyl grain, and an
  environment with a bright sky band and a mid-tone street, so hubcaps and bumpers read as
  chrome.
- **Budget:** LOD0 stays within the brief at 6.5–8.0k triangles per car. The trim tubes were
  coarsened to fit.

**Follow-up polish (oversight's second review):**
- Arches have 8 stations per side instead of 6; the flat runs have fewer.
- A crisp upper character line just below the belt catches a highlight, and there is one
  fewer crown point.
- Round headlamps are dome lenses over a chrome reflector, in a glassy material instead of
  flat white.
- Fareway taxi: a lower nose, a low wide egg-crate grille level with the lamps, and a thin
  wrap-around chrome bumper, as on the cabs in 554331.
- LOD0 is now 6.7–8.0k per car, with the bus at 8.4k.

**Still short of the photos (honest):**
- **No film grade or grain yet.** That's the engine post stack, and it's the biggest remaining
  difference in mood. The references are warm and low-contrast; our renders are clean and grey.
- **Shoulder highlights are weak.** The photographed cars show a strong reflected highlight
  along the fender crease. Our body sides are close to flat, so the highlight is weak. Next:
  a sharper upper character line with a slight tumblehome.
- **Taxi front (Fareway):** addressed in the follow-up. The Bancroft cab keeps the sedan front.
- **Missing details:** no interiors or people, and the glass is opaque, so nobody visible
  behind the windscreen as in 549851. Hood creases and the long hood centre crease seen on the
  cab in 554331 are also missing.
- **The test-lot set is bare** next to dense period streets. That's the city's job, not the
  vehicles'.

## Session 3: the user's "Yes all of it" (2026-11-26)
The user confirmed the scope relayed by the oversight session: condition and breakdowns, the
damage API, theft, ownership, and the new roster. Everything below is built and measured, and the
numbers are in `shots/vehicles/report.json`.

### What was built
- **Trim tiers × condition** (`src/vehicles/state.ts`, pure and Node-tested).
  - Tiers: economy, standard, luxury, police (heavy-duty package) and commercial.
  - Condition comes from the variant seed: mileage, shocks, tyres, alignment pull, brakes, tired
    engine, radiator, battery.
  - Period upgrades: radial tyres, heavy-duty suspension, a four-barrel carburettor, the
    police-package engine.
  - Garage actions: `install()` / `uninstall()`, `service()`, `respray()`, `setTrim()`. These
    retune the physics live.
- **Police out-run the average civilian car:** police reach 0–60 in 9.0–9.2 s with a 107–112 mph
  top speed. Civilian Bancrofts take 11.9–19.3 s and top out at 76–89 mph, depending on trim and
  wear.
- **1974 failure modes** (`EngineSystems`): coolant temperature with steam and power loss, vapour
  lock after a hot stop, a flooded carburettor (clear it by flooring the throttle), a weak battery
  with push starts, misfires and backfires, brake fade, and fuel (about 13 mpg cruising, with a
  sputter then stall when empty).
  - Each mode can be forced (`forceFailure()`) or suppressed (`failureRate = 0`) by missions.
  - Calibration, in August stop-and-go traffic: a healthy car sits at 88–98 °C, a worn radiator
    boils over after about 8 minutes (cruising cools it), and a holed radiator boils over in about
    3 minutes.
- **The damage API** is `applyHit({ point, normal, impulse, type, source })`. The contract
  already uses `damage` for the damage number, so the method can't share the name.
  - It resolves glass per pane (cracked, then shattered), tyres (flat: the car runs on the rim
    and pulls), radiator (starts the overheating clock), engine (power, smoke), fuel tank (leak,
    rare fire) and lamps, and leaves bullet holes.
  - A bent front pulls. Flat front tyre: 4.4 m drift over 3 s hands-off at 40 mph.
  - Rams credit the attacker: `impact` events carry `attackerId`, `attackerDriverId`,
    `otherVehicleId` and `closingSpeed`. A test ram credited the right vehicle and driver.
- **Weather:** rain on oily asphalt is worst in the first minutes. Braking from 40 mph: 86 ft
  dry, 148 ft in early rain, 119 ft later in the rain, 93 ft on radials.
- **Theft and ownership:**
  - locks, keys left in, slim jim, window smash (a loud event), hot-wire, and ignition with auto
    crank;
  - `entryPoints()` for doors, windows, dash, trunk and hood;
  - rear seats plus `windowPose()` for drive-bys;
  - visible, swappable plates;
  - a trunk with capacity and metadata;
  - `serialize()` → JSON → `factory.restore()` reproduces the car exactly (0 diffs, about
    1.3 KB, identical physics).
- **Roster:**
  - the `bancroft_cab` sedan taxi;
  - an ambulance, a cab-forward pumper, a rear-mount aerial ladder truck, a right-hand-drive mail
    van and a soft-serve truck;
  - the Calder 650 and Patrol motorcycles, the Wexford messenger bicycle and the carrier trike;
  - the Pell Type 7 subway car with 1970s graffiti, interior and sliding doors.
- **Two-wheelers:** the body is held upright and the lean is visual (42° at the limit). Too much
  steering or a hard hit causes a lowside, highside or impact crash. A `crash` event hands the
  rider to the characters stream with their pre-impact velocity.
  - Top speeds: Calder 650 93 mph (0–30 in 1.6 s), messenger bicycle 17 mph, trike 14 mph.
- **Subway:** a rail-driven train with kinematic cars and sliding door colliders. The sim drives
  `setState({ s, doorsOpen })`. A 4-car update costs 0.008 ms.

### Budgets (headless SwiftShader; CPU numbers are valid)
- Car update plus world step: about 0.03 ms. Bike update: about 0.003 ms.
- Traffic, 150 instances: 0.08 ms. Draw calls are up to about 5 per model per LOD, because of
  the new head and sign lamp parts.

### Honest critique
- **Physics:**
  - Two-wheelers don't simulate balance. That's deliberate for phones, but they can't do
    wheelies or stoppies and won't fall at a standstill.
  - The trike doesn't lean or tip.
  - Subway cars aren't in the traffic renderer, and two-wheelers aren't either.
- **Subway interior:**
  - The interior is lit, but the window glass is opaque, so you can't see out from inside (fine
    in tunnels, wrong in stations).
  - Graffiti tags are syllable-generated placeholders until the narrative stream supplies its tag
    set.
- **Damage:**
  - Bullet holes are flat discs.
  - Glass shatters to a dark opening rather than falling out.
  - A fuel-tank fire is a probability, not a simulated leak and ignition.
- **Ladder truck:** a rear-mount aerial, not NYC's iconic tractor-drawn tiller.
- **Plates:** 1974 New York plate colours still need checking.
- **Shots:** the systems sheet's theft frame shows the unsmashed side.
- **Not done:** an in-car radio (the user said not now).

## Session 2: engine merge and integration (2026-11-26)
- **Merged** `claude/tenderloin-74-engine-qi54lt` at a24eda4 with a merge commit. The only
  conflict was package.json; the test lot was ported to `Input.poll(dt)`.
- **Traffic contract:** `createTrafficRenderer().setInstances(readonly TrafficInstance[])` now
  follows `src/shared/traffic.ts`.
  - `resolve(vclass, variant)` lives in `src/vehicles/registry.ts`. Every class resolves, and
    the variant seed picks the model (taxi: 70% Bancroft cab, 30% Fareway) and the paint.
  - Light bits drive emissive instanced parts: head, brake, reverse and tail running lamps;
    hazard and indicators blink amber on the tail lamps; the taxi roof light; the police
    beacon (Siren). Each model now has up to 5 instanced draws per LOD.
- **Style guide applied:**
  - taxi yellow `#e3a92a`, plus the STYLE_GUIDE car tokens (brown, maroon, cream, avocado,
    harvest gold, ageing white) and truck red in the palettes;
  - 1973 rate-card text;
  - a new `bancroft_cab` model, because period cabs were mostly ordinary full-size sedans.
- **Hills in the test lot:** a 12 m crowned street (2.5% crown) west of the grid, with an 8%
  climb to a 6 m crest, a 12% descent, and a 5% cross-fall parking section. Measured with the
  `hill` API on `window.__VEH`:

  | test | Bancroft | B-60 box truck |
  |---|---|---|
  | Climb to crest at 0.7 throttle | 10.9 s, 40 mph at the crest | 12.6 s, 28 mph |
  | Parked on 12%, handbrake on | 0.08 m settle, then holds | 0.08 m |
  | 5% cross-fall, handbrake on | 0.05 m drift, 1° lean | 0.03 m drift |
  | 35 mph panic stop down 12% | 74 ft | 82 ft |

  **Known behaviour:** holding the foot brake at a standstill engages reverse, which is the
  game convention, so on a hill the car backs up. Park with the handbrake. Released on 12%,
  the car rolls back slowly (1.5 mph after 3 s), because engine braking at idle is generous.
  That's acceptable but not tuned.
- **Audio hooks:** `Vehicle.rpm`, `Vehicle.load` (0..1) and `Vehicle.gear` (−1 = reverse).
- **Engine requests** moved to the root `ENGINE_REQUESTS.md` (`## From vehicles: N.` format).
  Items the engine already answered were dropped; `docs/ENGINE_REQUESTS.md` was deleted.
- **Relayed by the oversight session, not yet started, waiting for the user to confirm scope:**
  - bullet damage API, and an attacker id on impacts;
  - trim tier × condition physics, period failure modes (overheating, vapour lock, flooding,
    weak battery), damage that changes handling;
  - theft entry points, trunks and plates;
  - maintenance upgrades;
  - roster additions: motorcycles, bicycles, ambulance, fire engine and ladder truck, mail
    truck, ice-cream truck, graffiti subway cars;
  - two-wheeler physics.

## Status (session 1)
| Area | State |
|---|---|
| Procedural generator (`src/vehicles/gen/`) | **Done, v1.** One loft generator builds every body: sedans, coupe, wagon, taxi, bus, trucks |
| Roster (10 models, all invented) | **Done.** Registry in `docs/VEHICLE_REGISTRY.md` |
| LODs | LOD0 5.6–7.6k tris (bus 9.0k). LOD1 1.1–1.5k (bus 2.1k). LOD2 is a 72-tri box. **Both are over the brief's targets for the bus, and LOD1 is over ~1k for most models** |
| Materials (TSL node) | Clearcoat paint with a dirt mask, chrome, glass with rain streaks and cracking, rubber, vinyl, woodgrain, emissive lamps. **Rain streaks are implemented but not yet checked visually** |
| Physics | **Done, v1.** Custom raycast suspension on a Rapier body, bias-ply tyre curve, lock-up and wheelspin, 3-speed automatic, weight transfer emerges from soft springs |
| Skid events, tyre marks | **Done**, with an optional `SkidMarks` helper |
| Collision → damage | **Done.** Contact-impulse sensing into 4 morph zones, then stages intact → dented → battered → smoking → burning → destroyed |
| Damage visuals | Bent panels (morph targets), popped hood, cracked glass, broken lamps, steam/smoke, fire with light, burnt shell. **Detaching wheels not done** (stretch goal) |
| Traffic instancing | **Done.** 3 instanced draws per model per LOD, with per-instance paint and brake state |
| Test scene `?vehicles=1` | **Done.** Lot, grid of 20 m blocks with 0.15 m curbs, crash wall, posts, ramp, parked cars |
| Shots and measurements | **Done** with `npm run build && npm run shots:vehicles` → `shots/vehicles/` |

## Architecture
```
src/vehicles/
  index.ts          createVehicleFactory() — the integration contract (spawn, traffic renderer, preload)
  models.ts         the 10 ModelSpecs (shape + physics parameters)
  assets.ts         variantOf(spec, n) (paint/vinyl/wheels/grime) and the geometry cache per trim
  Vehicle.ts        contract object: setInput/update/seatPose/on/dispose + damage, lights, fx
  physics.ts        VehiclePhysics: raycast wheels, tyres, transmission, contact-impulse sampling
  traffic.ts        TrafficRenderer: instanced visual proxies
  effects.ts        world-space smoke/fire sprite emitters
  SkidMarks.ts      optional tyre-mark ring buffer fed by 'skid' events
  gen/builder.ts    GeoBuilder: indexed triangles per material slot, grids with auto winding, sweeps, lathes
  gen/spec.ts       ModelSpec / PhysicsSpec types
  gen/body.ts       generate(): loft body + greenhouse + cargo + grille/lamps/bumpers/trim/extras + wheels + colliders
  gen/morphs.ts     4 damage morph targets (front/rear/left/right), baked with normals
  gen/materials.ts  per-vehicle MaterialSet (TSL), shared trim materials
  gen/decals.ts     canvas lettering (rate card, POLICE, roof sign, destination sign, fleet names)
  testlot/TestLot.ts  ?vehicles=1 scene, chase cam, HUD, window.__VEH automation API
tools/shots/vehicles.ts  screenshot + metrics rig
```
- **How the generator works.** The body is a loft of cross-sections along the length:
  - Plan width has rounded corners. The bottom profile rises over the wheel arches (or stays
    at hub height for fender skirts). The top profile gives hood, cowl and deck heights.
  - Each section has crisp creases at the shoulder.
  - The greenhouse is a (u, v) patch. u runs from A to C pillar and v from belt to roof. Bands
    along u become glass, pillar, opera window, door opening or blank panel.
  - Windshield and backlight are bowed patches, and the roof is crowned.
  - Trucks add cargo modules (box, or packer with hopper). Everything goes into one indexed
    geometry with one group per material slot, so one car is one mesh with up to about 16 draws.
- **Variants.** `variant` is a seed. It picks paint from the model's period palette, metallic,
  vinyl roof and colour, whitewalls, wheel covers and grime. Geometry is cached per trim
  combination, so 100 variants of a model share a few geometries.
- **Damage.** Rapier contact impulses on the chassis colliders (read each step through
  `contactPairsWith`, so no engine event queue is needed) are turned into Δv.
  - Δv over 1.6 m/s accumulates severity, which is assigned to a zone by the local contact point.
  - Severity drives the morph influences and the total damage.
  - Thresholds: 0.35 battered (lamps break when their zone is over 0.35, hood pops when front
    is over 0.45, glass cracks when total is over 0.4). 0.65 smoking, with power cut. 0.95
    burning, which becomes destroyed after 10 s.

## Decisions (and why)
- **Custom raycast suspension instead of Rapier's `DynamicRayCastVehicleController`.** The
  brief allowed either. The custom version gives control over the bias-ply slip curve, brake
  lock-up (no ABS in 1974), the wheelspin state, the skid metric, and three rays per wheel so
  0.15 m curbs ride up smoothly instead of snagging. It costs about 0.02 ms per vehicle per
  step.
- **Tyre forces.** Longitudinal force acts at the contact patch, giving full dive and squat
  with no anti-dive geometry, as in the period. Lateral force acts 0.1 m above it, standing in
  for a low roll centre.
- **Brakes are strong enough to lock** at full pedal (0.95 g capacity, 68% front). A keyboard
  panic stop skids, as a 1974 car without ABS would. Partial analog brake does not lock.
- **Holding brake at a standstill engages reverse.** Negative throttle also works. This is
  documented in `index.ts`.
- **Impact sensing reads contact impulses** rather than requiring an EventQueue, so the engine
  can step the world however it likes.
- **Traffic proxies use LOD1 and LOD2 geometry split three ways**: paint (instance colour),
  fixed parts (vertex colour), and tail lamps (instance colour carries brake state). That
  makes 3 draws per model per LOD.
- **Name clearance:** four candidate names matched real historic makers and were replaced
  (see the registry).

## Measurements (honest: headless Chromium in a container, WebGL2 via SwiftShader software rendering)
Physics and CPU timings come from the browser's JS engine and mean something. Frame times do
**not** (software rasteriser), so none are quoted. Everything is in `shots/vehicles/report.json`.

**Physics cost** per vehicle per 60 Hz step: `update()` 0.015–0.020 ms, and `update()` +
`world.step()` (one car on the lot) 0.026–0.031 ms. The budget is under 0.5 ms.

**Traffic `setInstances()` CPU:**
- 150 instances: 0.06 ms average, 0.2 ms p95. Budget is 1.5 ms on High.
- 40 instances: 0.03 ms. Mobile Low budget.

**Driving numbers** (flat asphalt, full throttle/brake, scripted; from `metrics` in the rig):

| model | 0–30 mph | 0–60 mph | top mph | 60–0 ft | dive° | squat° | roll° @ lat g |
|---|---|---|---|---|---|---|---|
| Bancroft sedan | 4.2 s | 11.9 s | 91 | 185 | 3.0 | 1.8 | 6.4 @ 0.77 |
| Bancroft Patrol | 3.9 | 10.2 | 100 | 178 | 1.8 | 0.9 | 2.8 @ 0.87 |
| Tiverton coupe | 4.3 | 11.3 | 96 | 185 | 2.9 | 1.7 | 6.3 @ 0.74 |
| Ferris compact | 4.1 | 18.0 | 68 | 182 | 2.2 | 1.2 | 4.2 @ 0.81 |
| Homestead wagon | 4.5 | 12.8 | 87 | 185 | 3.0 | 2.0 | 6.3 @ 0.74 |
| Fareway taxi | 4.3 | 12.6 | 86 | 182 | 2.1 | 1.3 | 4.3 @ 0.76 |
| CT-40 bus | 11.6 | — | 49 | 220 | 0.4 | 0.3 | 1.9 @ 0.51 |
| B-60 box truck | 5.6 | 33.8 | 63 | 186 | 0.9 | 0.5 | 2.4 @ 0.63 |
| Walk-In step van | 5.2 | 31.5 | 62 | 174 | 1.5 | 0.9 | 2.9 @ 0.72 |
| B-80 refuse truck | 7.9 | — | 53 | 209 | 1.2 | 0.9 | 2.7 @ 0.62 |

Period road tests of 1973–74 full-size cars generally quote 0–60 in about 10–12 s and 60–0 in
about 160–190 ft. These numbers sit in that range by design, not by citation; treat them as
tuning targets.

**30 mph wall impact** (Bancroft, 13.41 m/s into the static crash wall): one impact event,
Δv 13.3 m/s, zone front. Result: front zone 0.88, total damage 0.44, stage "battered". The
hood pops, headlamps break, glass cracks, and the radiator steams. Two more hits take it to
smoking and then burning.

## Shots (`shots/vehicles/`)
- `turntable_<id>.jpg`: four views per model. `turntable_all.jpg` is the roster contact sheet,
  and `variants_bancroft.jpg` shows 8 variants.
- `lineup_street.jpg` and `lineup_vs_references.jpg`: every model parked on the block street,
  next to DOCUMERICA photos 549851, 554331 and 549921.
- `drive_skids.jpg`: wheelspin launch, locked-wheel panic stop, handbrake turn, power-on tail
  slide, nose dive (side view) and body roll (front view), with tyre marks.
- `damage_stages.jpg`: intact, then the 30 mph wall hit, side hit, smoking, burning and burnt
  out. `damage_crumple_closeup.jpg` shows a taxi after a 30 mph hit.
- `traffic_150.jpg`: 150 instanced proxies on the block grid.

## Critique: against the references
**What reads right:**
- Proportions: long hoods and decks, low belts, thin pillars, big chrome bumpers, and 5-mph
  bumpers on the newest cars.
- Next to DOCUMERICA 549851 and 554331, the Bancroft and Fareway silhouettes, with their
  wheel-to-body ratio and greenhouse share, sit comfortably among the photographed sedans and
  cabs.
- The yellow-cab mass (yellow body, roof sign, rate card) gives the right "sea of taxis" read
  from above (`traffic_150.jpg`).
- The bus has a roller destination sign, split flat windshield, posts and livery band.
  Compared with photo 549921 it reads as a 1970s city transit bus without being that bus.
- Trucks: the ribbed aluminium box, packer body and walk-in van all read at street distance.

**What doesn't (yet):**
- **Too clean and too CG.** The references are grainy, warm, low-contrast 35mm. Paint has a
  dirt mask, but there is no film grade, grain or halation yet (engine post stack). Grime is
  noise, not streaks or rust.
- **Body surfaces are slab-like.** Missing pieces:
  - Door seams, door handles and wheel-arch lips.
  - Side-glass chrome frames on sedans; the drip rails are there.
  - Hood ornaments are skipped on purpose.

  Fender tops are flat where real cars had a crowned fender line.
- **Glass is opaque dark.** There is no interior, so you can't see seats or people as you can
  in 549851. Interiors would need a cheap interior card.
- **Damage is zone-level.** All the glass cracks together, a side hit dents the whole flank
  rather than one door, and the burnt shell keeps bright chrome and intact tyres.
- **Triangle budget.** LOD1 is about 1.2–1.5k, over the "≈1k" target. The bus is 9k at LOD0
  and 2.1k at LOD1. The next step is to fold small parts into the body loft at LOD1.
- **Traffic proxies** don't spin their wheels, show no indicators, and share one second colour
  per model.
- **Turn signals:** only hazards exist, because left and right indicator lamps share one
  material.
- **WebGPU path untested.** Every shot is WebGL2 on SwiftShader.

## Critique: against the originality rule
- **No real names, badges, crests or fleet names.** Four candidate names that matched historic
  makers were swapped out (see the registry).
- **The taxi** deliberately avoids Checker cues: no rounded '50s fenders, no checker band, a
  1970s sedan body.
- **The bus** avoids the GM "fishbowl" cues: flat split windshield, no curved one-piece glass,
  no upper-rear louvres. The livery is invented.
- **Risk to watch:** the Bancroft and Homestead use the generic 1970s Detroit full-size
  template. That's the brief's intent, but anyone tuning front ends should keep grille and lamp
  combinations generic. Don't tune toward a specific photo's car.

## Known issues / TODO (next session)
- [ ] Get LOD1 to about 1k: merge lamp and grille boxes into the loft cap and use 6-segment
      wheels. Bus LOD0 to 8k.
- [ ] Door seams and handles as normal-only detail, plus side-glass frames, fender crowns and
      arch lips.
- [ ] Per-window glass damage, and separate left and right indicator materials.
- [ ] Detachable wheels (stretch), and burnt-shell tyres and chrome.
- [ ] Cheap interiors (seat and dash silhouettes, a driver on a card) behind lighter glass.
- [ ] Check rain streaks visually once the engine has weather. The uniform is `setWetness()`.
- [ ] Verify the WebGPU backend on real hardware, and measure real frame cost of 150 proxies.
- [ ] Swap the test lot for the city's colliders (engine), and tune curb behaviour on real
      geometry.
- [ ] Engine asks are in the root `ENGINE_REQUESTS.md`; check `ENGINE_RESPONSES.md` each session.

## How to run
- `npm run dev`, then open `/?vehicles=1`. Optional parameters: `&model=<id>&variant=<n>`,
  `&mode=turntable|lineup|traffic`, `&quality=low|…|ultra`, `&webgl=1`.
- Keys: WASD/arrows drive, Space handbrake, F next model, V next variant, H lights, B beacon,
  C camera, R reset, 1–4 dent a zone, 5 runs the 30 mph crash test.
- Touch: the stick drives, plus BRAKE, HAND, NEXT and CAM buttons.
- `npm run build && npm run shots:vehicles [-- --only turntable,lineup,drive,damage,traffic,metrics] [--models a,b]`
