# Brief: interiors (enterable buildings at city scale) for "Tenderloin '74"

You're a parallel workstream on a browser open-world crime game set in Manhattan's Tenderloin,
summer 1974 (three.js 0.187.0 WebGPU/WebGL2 with TSL, TypeScript, Vite, Rapier 0.21.0, landscape
mobile + desktop + gamepad). The engine session owns the city, the facades, streaming, rendering,
the player, the UI and integration. **You own what's behind the doors.**

**The user's requirement:** *"many buildings should be able to be entered."* Not 3–4 per act.
Enough that a player who tries a random door on a random block is often rewarded. The quality bar
is a 2031 AAA open world: going inside is seamless, with no loading screen and no fade, and the
city keeps living through the windows.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch. This brief lives
   on `claude/awesome-keller-i9tmmu` (oversight); copy it to `docs/briefs/INTERIORS_BRIEF.md` on
   your branch in your first commit.
2. Read the following:
   - `PROGRESS.md`, `ENGINE_RESPONSES.md` and `docs/STYLE_GUIDE.md`;
   - `src/shared/` (chunkFormat: each building has year, use, style and floors; geo; terrain;
     bounds);
   - `src/world/` (meshBuilder, World streaming);
   - `docs/PERIOD_AUDIT.md`;
   - the photo references in `references/`;
   - the other briefs in `docs/briefs/`, especially GAMEPLAY (shops, robberies, hiding indoors,
     police searches) and CHARACTERS (occupants);
   - on the narrative branch `claude/sharp-maxwell-jnb6hr`: `content/interiors.json` (the
     story's interiors, with `contains` lists) and `content/places.json`.
3. Keep `docs/INTERIORS_PROGRESS.md` as your source of truth: done, next, decisions, known
   issues. Read it at the start of every session and update it at the end.
4. Ask the user before major architectural decisions or before cutting any scoped feature.

## Three tiers (all required)
1. **Tier A: hero interiors** (about 20–30). These are the story's places from
   `content/interiors.json`: the Hotel Corwin lobby and floors, the Arden's lobby bar and back
   stairs, the precinct house, the fur-vault cold storage, the hotel ballroom, the trucking
   garage, the leads' homes, the Deuce cinema and arcade.
   - Hand-directed layouts, built from your kit with bespoke dressing and story props.
   - Every item in the `contains` list must be present and placed with intent.
2. **Tier B: generated enterable buildings** (hundreds). A generator turns any building's data
   (use, year, floors, footprint and street frontage) into a period-correct interior of the
   right type:
   - diners and coffee shops, bars and taverns, delis and bodegas, liquor stores, barbers,
     pawnshops, newsstand kiosks, laundromats, shoe repair, tailors;
   - garment-district showrooms and loft workshops (cutting tables, rolling racks, freight
     elevators);
   - walk-up tenement and SRO stairwells and hallways, with some apartment doors open;
   - office lobbies with elevator banks;
   - hotel lobbies, cinema lobbies, churches, union halls, pool halls, gyms with a boxing ring;
   - **stairwells to rooftops** (water towers, tar beaches, pigeon coops, fire escapes), which
     are essential for chases and escapes.

   Ground floors of commercial buildings are mostly enterable when open (`hours`). Residential
   buildings are enterable as far as the lobby, the stairwell and the roof, with a few unlocked
   apartments. Layouts are deterministic per building id and never repeat obviously side by
   side. Period accuracy follows the STYLE_GUIDE anachronism checklist: no 1980s+ fixtures.
3. **Tier C: every other window is alive.** An interior-mapped (parallax) window shader gives
   every non-enterable window a room behind it, by use and floor:
   - lit or unlit by time of day and the narrative's brownout state;
   - blinds, curtains, a TV glow, a ceiling fan, a figure passing now and then;
   - AC units in the windows.

   Build it as a material feature in the engine's Phase 3 facade work. Agree the integration via
   ENGINE_REQUESTS; the engine owns the facade pipeline.

## Seamless entry
- **Doors sit on the real facade:** pick door positions from the street frontage and footprint
  edges, at grade on the terrain (`heightAt`), with steps where the ground falls away. Shopfronts
  get display windows you can see into, and from inside you see the live street out.
- **No loading screen and no fade.** Stream an interior when the player comes within about 30 m
  of its door. Use portal culling so the interior costs nothing until you look in, and the
  exterior is portal-culled while you're inside.
- **Lighting:** the interior lighting of the period (incandescent, fluorescent tubes, neon spill
  through windows), the exterior light falling in, and darkness during brownouts.
- **Audio hooks:** emit the interior `kind` and room size for the audio session's reverb.
- **Physics:** colliders for the player, cover objects for gameplay combat, breakable props
  (bottles, glass, chairs) through the gameplay contract, and locked and unlocked doors (keys are
  inventory items; Teddy's thing is keys).

## Occupants and use
- Interiors declare **occupant slots**: a counterman, a barber, customers, residents on a stoop
  inside, a desk clerk behind glass. The sim and characters fill them, with archetypes, hours and
  density driven by `hours` and the clock.
- **Gameplay hooks:**
  - shop counters (the gameplay chat's shop UI);
  - robbable cash registers and back offices;
  - hiding spots that break witness line of sight;
  - police search behaviour inside buildings;
  - payphones;
  - wardrobe and safehouse points in the leads' homes.
- **Mission hooks:** `enter_interior` objectives, spawn points, and named props and markers for
  narrative missions.

## Integration contract (the engine session wires it in; ask for changes via ENGINE_REQUESTS)
```ts
// src/interiors/index.ts
export function createInteriors(opts: { quality: 'low' | 'medium' | 'high' | 'ultra'; content: { interiors: unknown; places: unknown } }): Interiors;
interface Interiors {
  /** Door list for a chunk (generated + hero), so the engine can place frames, signage and handles on facades. */
  doorsForChunk(i: number, j: number): readonly { id: string; buildingId: number; x: number; y: number; z: number; yaw: number; kind: string; locked: boolean; hours?: [string, string] }[];
  update(dt: number, player: { x: number; y: number; z: number }, clock: { minutes: number; date: string }): void;   // streams interiors in/out
  readonly object: THREE.Object3D;                       // added to the scene by the engine
  colliders(world: RAPIER.World): void;                  // keeps physics in sync with what's streamed
  inside(x: number, y: number, z: number): { interiorId: string; kind: string; roomVolume: number } | null;
  slots(interiorId: string): readonly { id: string; role: string; x: number; y: number; z: number; yaw: number }[];
  markers(interiorId: string): readonly { id: string; type: 'shop' | 'register' | 'hide' | 'payphone' | 'wardrobe' | 'spawn' | 'prop'; x: number; y: number; z: number }[];
  setPower(area: string, state: 'on' | 'dim' | 'off'): void;
}
```
- Provide a test scene behind `?interiors=1`:
  - a street block where every door works;
  - a generator gallery that cycles 30 seeded interiors per type;
  - the Corwin lobby and the 11th floor as the first hero interiors;
  - debug overlays for portals, streaming and the collider view.
- The only edit you may make to `src/main.ts` is one guarded line. Don't change any other shared
  file. Requests for the engine go in the root `ENGINE_REQUESTS.md` under
  `## From interiors: N. Title`. Answers appear in `ENGINE_RESPONSES.md`.

## Budgets
- An interior streams in **< 150 ms** on mobile Low and never hitches the frame (build in a
  worker, like the chunks).
- Active interior cost ≤ 150 draws and ≤ 1 ms CPU on High; ≤ 60 draws on mobile Low.
- Tier C window shader: ≤ 0.3 ms GPU on High at 1080p. Measure it on the user's phone through
  the Vercel build's `?hud=1` perf report.
- Download: the generated interiors' kit (meshes, materials and atlases) ≤ 12 MB on High and
  ≤ 5 MB on mobile Low. Generate geometry, don't ship it.
- Measure and report real numbers; headless timings here are software-rendered, so label them as
  such.

## Done means
- A **coverage report:** the share of buildings in the playable bounds with an enterable ground
  floor (target ≥ 40% of commercial frontage), a reachable roof (target ≥ 25% of buildings), and
  windows with Tier C interiors (100%).
- Walk-in frames from street to interior with no visible pop or fade, for: a diner, a bar, a
  garment loft, a tenement stairwell up to the roof, the Corwin lobby, and the 11th floor with
  its window onto the Empire State.
- A generator gallery of 30 interiors per type, next to period reference photos, with an honest
  critique of what reads as 1974 and what reads as a modern asset kit.
- Streaming and portal timing at street level, plus phone numbers from the user's device.

## Addendum: reference-driven interiors, from worn out to beautiful (user requirement)
The user: *"Ensure interiors use references too. Some will be older/worn down while some will be
beautiful."*
- **Build an interior reference library** the way the engine built the exterior one
  (`tools/refs/collect.ts`, `references/catalog.json`):
  - Public-domain sources first: the **Library of Congress HABS/HAER collections** (measured
    photos of NYC lobbies, hotels, churches, theatres, lofts), **NARA DOCUMERICA** interiors (SROs,
    diners, workplaces, 1971–77), and the public-domain items in the NYPL Digital Collections.
  - Commit only public-domain images, with full credits. Anything else is study-only: note
    the source URL in the catalogue, but don't commit the file.
  - Tag every reference by interior type, period and **condition grade**.
- **A condition spectrum with 5 grades,** each with a reference board and a material and wear
  recipe:
  1. **Derelict:** shuttered, collapsing plaster, debris, boarded windows.
  2. **Worn down:** the SRO and tenement norm. Peeling paint over earlier paint, water stains,
     cracked linoleum, nicotine yellowing, flickering tubes, chicken-wire glass, a radiator
     painted 20 times.
  3. **Kept up:** clean but tired. Diners, union halls, shops.
  4. **Well-to-do:** wood panelling, carpet, brass, newer fixtures.
  5. **Beautiful:** marble, terrazzo, coffered ceilings, crystal, gilt, polished brass, stained
     glass. Pre-war lobbies, hotel ballrooms, churches, a grand library reading room, an Art Deco
     tower lobby, Nick's apartment.
- **What sets the grade:** the building's year, use and size (from the chunk data), the block's
  social geography (`narrative/N1_STORY_BIBLE.md`), the owner, and the **story act** (the Corwin
  decays or is restored depending on choices; Nick's apartment loses furniture if repossessed).
  Mix grades **within** buildings too: a gorgeous 1910 lobby with a worn-out 1974 elevator, a grand
  ballroom with a stained carpet.
- **Beautiful hero interiors are a priority, not an afterthought.** Within the bounds, consider:
  the Hotel Pennsylvania ballroom (story), a grand Fifth Avenue library reading room, an Art Deco
  tower lobby, churches in the district, the department-store floor (invented "Baxter & Lowe"),
  and old banking halls. Use invented names where trademarks apply (narrative's registry).
- **Done means gains:** a **side-by-side board** for each condition grade (our interior next to
  its reference), and an honest critique of how well the worn grades read as truly lived-in and
  the beautiful ones as truly beautiful.
