# Design: map boundaries without invisible walls

**Owner:** engine (implementation and region). Contributions from narrative, sim, audio and
characters are listed at the end. Written by the oversight session at the user's request: *"a
creative way to have the map boundaries not just be invisible walls."*

> **Superseded bounds (user decision):** the design intent is *"small map, very interactive"*. The
> playable area is the dense story core: mid-block 21st–22nd St to mid-block 43rd–44th St, Madison–Park
> Ave to mid-block 9th–10th Ave (about 2.3 km²). Times Square and the rail yards sit beyond the edge as
> layer-1 scenery. The layers below still apply; the Layer 0 expansion is replaced by this.

## The problem today
The region is about **W 18th St to W 44th St, Third Ave to Eighth Ave** (`world.json`
`region`). Past it is a dark plane with floating towers (PROGRESS: "wall then void"). Worse:
- **The west edge is Eighth Avenue and the north edge cuts Times Square in half.** Eighth Ave
  and 42nd St are Delphine Moore's turf, and Times Square in 1974 is the district's most famous
  place. An edge must never run down a street the story uses.
- Nothing currently stops a player or a vehicle. There's only void.

## Principle
**The player should never feel a wall, see a "return to the area" message, or be teleported
without a reason they can see in the world.** The edge is handled in layers, each one catching
what the previous one missed. Most players only ever meet layers 1–2.

## Layer 0: put the edges where the city already has edges
Move the region one or two blocks out so every edge falls **mid-block, beyond the last street
the story uses**, and on a real 1974 barrier wherever one exists:
- **West, to about Ninth/Tenth Ave.** The Penn Central rail yards (W 30th–33rd, 10th–12th Aves)
  are a real sunken cut, and the Lincoln Tunnel approach ramps (Dyer Ave, W 30s–40s) are a real
  trench. Beyond them is the **West Side Highway, closed after the December 1973 collapse at
  Gansevoort St**: a rusting elevated deck you can see but not use. These are physical, period-
  accurate and visually striking.
- **North, to about 47th St,** so Times Square is whole. The bow-tie becomes the north frontier,
  heavily populated, with the edge in the side streets beyond it.
- **East, at about Second/Third Ave:** dense blocks, mid-block cut.
- **South, at about 14th–18th St:** mid-block cut.

The data pipeline already fetches beyond the region, so this is mostly a bounds change plus the
low-detail shells TODO. **The engine decides the exact bounds against the cost.**

## Layer 1: the world keeps going (visually)
Past the playable edge, the city continues as low-detail shells (already a TODO), then the
Hudson, the East River, Jersey and the boroughs on the horizon. Streets that cross the edge stay
lit with traffic flowing far down them (impostors). From inside, it should never look like the
map ends.

## Layer 2: period reasons the street is closed (diegetic blockers)
Where a street crosses the edge, close it with something that **belongs to 1974 New York**,
varied so it never looks like a pattern:
- **A film shoot.** NYC in 1974 was full of location crime-picture shoots, and it rhymes with our
  35 mm look:
  - Grip trucks, arc lights and a dolly track across the street.
  - Production assistants with bullhorns turn you back: "Picture's up! Hold it right there, pal!"
  - An invented film title on the slate.
  - At night it's the best-lit block in the city.
- **Street opened by the utility (an invented name, not a real company):**
  - A trench with steel plates and sawhorses stencilled with an invented city agency.
  - The orange-and-white steam chimney venting.
  - A broke city's "work suspended" sign, a nod to the fiscal crisis.
- **A water-main break:** a flooded block, a geyser from an opened hydrant.
- **A police barricade:** a cordoned street with a beat cop waving people off. In a chase it
  becomes a roadblock.
- **A street fair or block party, at weekends:** tables and a bandstand across the street. It's
  passable on foot, but the crowd thickens into layer 3.
- **Real geography:** the rail-yard fence and cut, the tunnel trench, the dead highway deck.

Blockers carry real colliders and read as obstacles; nobody ever hits an invisible plane.
Rotate them by time of day, day of week and act.

## Layer 3: the city thickens
- **Traffic:** in the last block before the edge the sim ramps density into a real **gridlock
  jam** of honking, double-parked, bumper-to-bumper cars, which is extremely 1974. The cars are
  real agents with real colliders. Driving out means sitting in traffic, and players turn around
  on their own.
- **On foot:** pedestrian density and loiterers ramp up near the edge, with crowds gathered at
  the film shoot or barricade, rubbernecking.

## Layer 4: the reel runs out (last resort, should almost never fire)
If something gets past every physical layer (a physics launch, a glitch, a debug camera), it's
**the end of the film reel**, in the same visual language as the character-switch reel-change
cut:
1. Past the edge, grain swells, the gate starts to weave, the colour fades towards magenta, and
   a light leak burns in from the frame edge, increasing with distance. The audio stays in the
   world: projector clatter rises underneath the city sound.
2. Past a second threshold, the film runs out: a flash of white leader and the countdown
   leader "3… 2…", then a **reel-change cut** back to the nearest safe street pose just inside
   the edge, facing inward. A vehicle comes back with it, at walking speed.
3. There's no text, no death and no penalty.

The hard collision backstop exists only far behind layer 4, as a safety net.

## Map and minimap
The pause map is a **1974 folding street map** (an invented publisher, cream paper, fold
creases). The playable area is the printed sheet; past it, the paper simply ends at its edge.
The minimap fades to paper texture at the edge instead of showing void.

## Growth
The edges are designed to move. Later acts or expansions can open the next district (Hell's
Kitchen, Times Square north, Chelsea and the Village) by taking down a blocker, for example
when the film shoot wraps.

## Rules for every stream
- No invisible walls in normal play. No "leaving the area" text. No teleport without layer-4
  cover.
- **Narrative:** no mission, tail or chase routed within one block of an edge. Chases that head
  for an edge end on a layer-2 roadblock or a layer-3 jam.
- **Mobile:** none of this needs precise input. Turning players back has to work for someone
  holding the stick forward.

## Who does what
- **Engine:** decides the region bounds (layer 0) and builds the shells and horizon (layer 1),
  the blocker set and placement (layer 2), the reel-runout post effect and the safe-pose return
  (layer 4), and the map styling. It also gives the other streams an `edgeDistance(x, z)` query
  (metres inside the playable edge) in `src/shared/`.
- **Narrative:** the invented film title, crew and PA barks, utility and agency names, the
  barricade cop barks, block-party flavour, and which blockers appear in which act. Keep
  missions off the edges.
- **Sim:** density and gridlock ramp and crowd ramp from `edgeDistance`, no lanes or spawns
  beyond the edge, and roadblock behaviour for chases.
- **Audio:** the edge soundscapes (bullhorns, generators, jackhammers, hydrant spray, the
  block-party band) and the layer-4 projector bed and leader beeps.
- **Characters:** archetypes and actions for film-crew PAs, utility workers and barricade cops,
  including a "wave off" animation.
