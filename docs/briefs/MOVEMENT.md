# Movement and character physics (user decision, 2026-11-27)

> User: "Make sure we have character physics like climbing, stepping on a curb without having to jump,
> and other things like that. Continue to reference the GTA games and RDR2. Also reference 1970s NYC."

**Bar:** on-foot movement that feels like GTA V / GTA VI / RDR2: weighty, grounded, never floaty,
never snagging. Reference games are a **feel and quality bar only**; copy no animations, assets or code.
1970s NYC sets *what* you move through: high granite kerbs, stoops, fire escapes, subway stairs,
sidewalk cellar doors, scaffolding, chain-link fences, garbage piles, crowded sidewalks.

## Owners
- **Engine** (`src/player/PlayerController.ts`, Rapier): collision, stepping, slopes, climb, vault and
  traversal *detection*, root motion, physics state, ragdoll bodies.
- **Characters**: animations, blending, foot and hand IK, procedural layers, the motion test course and the feel.
- **Gameplay**: cover, combat movement, stamina, injury and drunk states, the rules of what's allowed when.
- **Interiors / engine data**: traversal markup on fire escapes, ladders, scaffolds, fences and roofs.
- **Sim**: NPCs use the same stepping and stairs, and react to the player's bumps.

## Already in (engine)
- Kinematic controller with autostep of 0.40 m (kerbs and stoop steps, no jump needed), snap to ground,
  climbable slopes up to 50°.
- Jump; jump at a 0.45–1.9 m ledge climbs it (raycast ledge detection).

## Required set

### Ground
- Kerbs, stoops and stairs taken in stride with **foot IK** planting each foot. The body dips and recovers
  slightly on steps; no pop. Stairs use a stair gait; running up subway stairs works.
- Slopes: speed and lean change with the real terrain hills; slide on steep slopes.
- Starts, stops and pivots with momentum (RDR2-like weight): plant-and-turn at a run, skid stops, and
  turn-in-place when idle. Mobile mode can tighten it slightly so touch never feels sluggish.
- Walk, jog, run, sprint (stamina), crouch and sneak, strafe when aiming. Analog stick speed maps to gait.
- Sidewalk crowd navigation: shoulder-brush and push past NPCs, with stumble reactions both ways.
  Bumping hard knocks NPCs down.

### Traversal (one context button: "climb/vault")
- **Vault** low obstacles of 0.5–1.2 m (railings, car hoods, newsstand counters, hydrants, trash cans) at
  speed, without stopping.
- **Climb** ledges of 1.2–2.2 m (walls, dumpsters, stoop walls, truck beds), with a hand-plant animation.
- **Chain-link fence climb** and drop over the top (common in 1970s lots and yards).
- **Fire escapes:** jump to and pull down the drop ladder, climb ladders, run the stairs, get onto
  windowsills, reach roofs. Drop from the lowest platform.
- **Ladders and scaffolding** (sidewalk sheds), **subway stairs** and the **turnstile vault** (fare
  evasion, which police notice).
- **Roof-to-roof jumps** with a run-up; ledge grab on a near miss.
- **Drops:** a hang-drop from ledges; fall damage by height, with a roll on landing at moderate heights.
- **Swimming** is out of scope (no water in the map), unless the map gains a waterfront later.

### Physical reactions
- **Ragdoll** blended with animation (Euphoria-like feel): hit by cars, shot, falling and
  stumbling. Get-up animations from front and back.
- Stumbles on kerbs when sprinting badly, when hit, or when drunk.
- Doors: push through swing doors and shoulder-barge locked ones (gameplay rules).

### Vehicles on foot
- Enter and exit animations per door side; carjack pull-outs; jumping out of a moving car, with a ragdoll roll.
- Climb onto car roofs and hoods (vault target).

### Camera
- Third-person camera with smooth collision in tight 1970s alleys, shoulder swap, and look-behind.
- The camera rises and pulls back on climbs and falls.

## How it's checked
- The characters chat's locomotion test course gains every item above: kerb, stoop, subway stairs,
  railing, car hood, chain-link fence, fire escape with a drop ladder, scaffold, roof gap and turnstile.
- Each item gets a pass video or a frame strip (JPEG) and an automated test where possible (no snagging,
  no tunnelling, no stuck states after 1,000 randomised runs).
- Feel review against the bar: a written comparison to GTA V / VI and RDR2 on-foot behaviour (input latency,
  stop distance, turn radius, step smoothness), plus touch play on the iPhone.
