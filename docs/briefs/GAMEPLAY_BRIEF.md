# Brief: gameplay systems (combat, damage, police, items, economy) for "Tenderloin '74"

You're a parallel workstream on a browser open-world crime game set in Manhattan's Tenderloin,
summer 1974 (three.js 0.187.0 WebGPU/WebGL2, TypeScript, Vite, Rapier
`@dimforge/rapier3d-compat` 0.21.0, landscape mobile + desktop + gamepad). Other streams:
- **engine:** city, player controller, camera, UI, saves, integration;
- **narrative:** story, missions, all written content;
- **sim:** ambient traffic and pedestrians;
- **vehicles:** car models and driving physics;
- **characters:** bodies, wardrobe and animation;
- **audio:** all sound.

**You own the rules of play: health and damage, combat and weapons, the police response,
items, inventory, money, shops and the player's wardrobe, and breakable props.**

**The user's decisions:**
- Combat: *"Full open world and missions like a GTA game."* Combat and gunplay are central to
  missions and free roam.
- Police: witnesses, call boxes and bribes (below), **not** a wanted-star meter.

The quality bar is a 2031 AAA open world. The feel of hitting, shooting, getting hurt and being
chased has to be weighty, readable and fair, on a phone as well as with a pad.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch. This brief lives
   on `claude/awesome-keller-i9tmmu` (oversight); copy it to `docs/briefs/GAMEPLAY_BRIEF.md` on
   your branch in your first commit.
2. Read the following:
   - `PROGRESS.md` and `ENGINE_RESPONSES.md`, including the save system and E-notices;
   - `docs/CONTROLS.md` and `docs/research/CONTROLS_AND_SETTINGS_REFERENCE.md`;
   - `docs/STYLE_GUIDE.md` and `docs/briefs/BOUNDARIES.md`, since roadblocks are boundary layer 2;
   - `src/shared/` (geo, traffic, bounds, terrain);
   - the other briefs in `docs/briefs/`;
   - on the narrative branch `claude/sharp-maxwell-jnb6hr`: `NARRATIVE_BRIEF.md` (content
     rules), `narrative/N1_STORY_BIBLE.md`, `narrative/N3_STRUCTURE.md`, `content/` (missions,
     cast, places).
3. Keep `docs/GAMEPLAY_PROGRESS.md` as your source of truth: done, next, decisions, known
   issues. Read it at the start of every session and update it at the end.
4. Ask the user before major architectural decisions or before cutting any scoped feature.

## Hard rules
- **Everything is original.**
  - Firearms are period-typical generic designs: snub revolver, service revolver, semi-auto
    pistol, pump shotgun, sawn-off, hunting rifle, a rare submachine gun.
  - **No real manufacturer names, model names, logos or exact replicas.** Invented names go in
    `docs/WEAPON_REGISTRY.md` with trademark checks, the same way the vehicles registry works.
- **Genre conventions, not copies.** Use the open-world crime genre's grammar (missions, chases,
  shootouts, heists), but don't recreate any existing game's specific systems, UI, missions or
  signature mechanics. In particular: no wanted stars, no spray-shop respray, no copied HUD.
  Where an existing game has an obvious solution, find the 1974 version.
- **The content rules in NARRATIVE_BRIEF apply:**
  - no torture as gameplay;
  - no violence against minors (there are none in combat spaces, and the sim must never put
    children in a firefight);
  - no functional real-world weapon or crime instructions, even in in-world text.
- **No harm to the player's reputation for free:** collateral damage has consequences (police
  heat and witnesses) instead of being silently ignored.

## Scope
1. **Health, damage and death**
   - Health for the player and NPCs, with **injury regions** (legs make you limp, arms add sway,
     the head is lethal), bleeding that a bandage or a diner stops, and slow partial
     regeneration. A police-issue vest exists as a rare item.
   - Fall, vehicle-impact and fire damage use the vehicles chat's `impact` events and the
     engine's physics.
   - **Being wasted:** you wake up at an invented hospital and pay a bill. Being **arrested**:
     you go to a precinct and lose weapons unless your lawyer or a payoff gets them back, with
     consequences through the narrative's flags. Both are fast on mobile and never lose more
     than the last checkpoint's progress.
2. **Combat**
   - **Melee:** fists, kicks, grapples, environmental shoves, and period weapons (bat, pipe,
     knife, bottle, nightstick). Timing-based but readable, with a parry or dodge.
   - **Firearms:** recoil, spread, reload, ammo, and a tight sound and feel pipeline (the audio
     session's canyon echo makes 1974 gunfire distinctive). Hit reactions and ragdoll blend
     with the characters chat; damage falloff; penetration through car doors and thin walls.
   - **Cover:** contextual cover on curbs, cars, stoops and newsstands. Blind fire.
   - **Aiming:**
     - Pad: soft lock and free aim.
     - Mouse: free aim with a setting for aim assist.
     - Touch: lock-on with target cycling, tapping for limbs, and assisted fire. **No mission may
       require precise free aim on touch** (the narrative mobile rule).
   - **Driving combat:** shooting from vehicles, shooting out tyres (using the vehicles chat's
     damage) and ramming.
   - **Enemy combat AI:** gangs, hoods and corrupt cops. They use cover, flank, suppress, shout
     callouts (barks via audio), retreat on low morale, and give up or flee instead of always
     fighting to the death.
   - **Each lead plays differently.** The narrative chat is reworking the leads for combat; agree
     the stat split with it. As a starting point: Teddy is an ex-cop with good revolver handling;
     Delphine is fast and evasive with strong melee and escapes; Nick is a poor shot who hires
     muscle (companion AI) and pays his way out.
3. **Police: witnesses, call boxes, bribes** (the user's chosen system)
   - **A crime only counts if someone sees or hears it.** Witnesses (sim pedestrians and
     drivers) form a **description**: clothing colours, build, which lead, the vehicle's colour
     and class, and a partial plate.
   - In 1974 there are no cell phones, so witnesses **run to the nearest red police call box**
     or a payphone, or flag down a patrol car. Stop them before they report, intimidate them,
     or lose them.
   - Police knowledge is a set of **reports per precinct** that decay over time. Each report has
     a description, a last-known location and a severity.
   - Response escalates by severity: a foot post checks it out; radio cars cruise the area;
     several sector cars converge; plainclothes cops; roadblocks at choke points (reuse the
     boundary blockers); a rare helicopter for the worst incidents.
   - **Breaking the description:** change clothes (the wardrobe system), ditch or swap the car,
     change plates at a chop shop (not a spray-shop copy), hide indoors, or get off the street
     by subway.
   - **Bribes and the pad:**
     - Any cop can be offered a bribe in an encounter, with a chance based on their
       corruptibility and the severity.
     - **Precinct payoffs** made through the story and side activities lower response and report
       decay on that precinct's turf.
     - Investigators and honest cops can't be bought, and trying makes it worse.
     - This ties directly to the story's payoff theme; work it out with the narrative chat.
   - **The UI is diegetic and minimal,** with no stars:
     - a period police-radio chatter cue (audio);
     - minimap sightlines and search cones from the cops' last known position;
     - an "overheard description" subtitle ("…white male, tan leisure suit, green sedan…").
4. **Items, inventory and economy**
   - An item registry schema (`content/items/*.json`, written by narrative) covering weapons,
     ammo, consumables, keys, evidence, photos (Delphine's instant camera) and money.
   - **Per-lead inventory** and money in the engine's versioned save. Agree your save section
     with the engine chat.
   - **Shops** with 1974 prices: diners and food (they heal), clothing stores, pawnshops and
     fences (illicit weapons), the hardware store, the newsstand, the liquor store. Shop content
     and prices come from narrative; you build the shop UI flow in the engine's UI style
     (`docs/STYLE_GUIDE.md`).
   - **Player wardrobe:** buy clothes, store outfits at each lead's home, change outfits. It's
     built on the characters chat's wardrobe generator. Outfits feed directly into witness
     descriptions.
   - **Payphones and phone calls** stand in for a cell phone: mission calls, an answering service
     at the Corwin hotel, and calling a contact.
5. **Breakable world props:**
   - fire hydrants that geyser when hit (they pair with the audio water bed);
   - newsstands that scatter papers;
   - phone booths, mailboxes, parking meters, trash cans and storefront glass, and the red
     call boxes themselves.

   Use instanced physics props with destruction states, and agree instancing and streaming with
   the engine. Destruction is witnessed and reported.

## Integration contract (the engine session wires it in; ask for changes via ENGINE_REQUESTS)
```ts
// src/gameplay/index.ts
export class Gameplay {
  constructor(opts: { quality: 'low' | 'medium' | 'high' | 'ultra'; content: { items: unknown; shops: unknown; weapons: unknown } });
  update(dt: number): void;
  // Wiring to other systems (all event-based; no direct imports of other streams' internals)
  bindPlayer(p: { id: string; lead: string; position(): [number, number, number]; aim(): { origin: [number, number, number]; dir: [number, number, number] } }): void;
  bindSim(sim: { on(type: string, cb: (e: any) => void): void; emit(e: any): void; peds: readonly unknown[]; vehicles: readonly unknown[] }): void;
  bindVehicles(v: { on(type: 'impact' | 'destroyed', cb: (e: any) => void): void }): void;
  health: { get(id: string): { hp: number; injuries: string[] }; damage(id: string, d: { amount: number; region?: string; source?: string; type: 'bullet' | 'melee' | 'impact' | 'fire' | 'fall' }): void };
  police: { readonly reports: readonly { precinct: string; severity: number; description: Record<string, unknown>; lastKnown: [number, number]; age: number }[]; bribe(copId: string, amount: number): 'accepted' | 'refused' | 'insulted' };
  inventory: { of(lead: string): { money: number; items: { id: string; qty: number }[] }; give(lead: string, id: string, qty?: number): void; take(lead: string, id: string, qty?: number): boolean };
  on(type: 'wasted' | 'arrested' | 'crimeWitnessed' | 'reportFiled' | 'shot' | 'hit' | 'propBroken', cb: (e: any) => void): void;
  serialize(): unknown; deserialize(s: unknown): void;   // your section of the engine save
}
```
- Provide a test scene behind `?gameplay=1`:
  - a 1974 shooting lot and a melee yard;
  - one real city block with witnesses, a call box, a patrol car and a precinct response you
    can trigger;
  - a shop counter;
  - debug overlays for police reports and witness sightlines.
- The only edit you may make to `src/main.ts` is one guarded line. Don't change any other shared
  file. Requests for the engine go in the root `ENGINE_REQUESTS.md` under
  `## From gameplay: N. Title`. Answers appear in `ENGINE_RESPONSES.md`.
- **Who owns what at the seams:**
  - **Sim** owns ambient pedestrians and traffic, including fleeing. You own witness memory,
    reporting runs and the police **response** AI, built as sim agent behaviours via its API or
    requests to it.
  - **Characters** owns the animations: aim, fire, reload, melee, hit, death, surrender. You
    request the set from it.
  - **Audio** owns the sounds. You emit the events.
  - **Narrative** owns the item, weapon, shop, gang and precinct content and the mission specs.

## Budgets
- **Combat:** 12 active combatants on High within ≤ 1.5 ms CPU; 6 on mobile Low.
- **Police and witness bookkeeping:** ≤ 0.3 ms per frame.
- **Projectile and hitscan queries** are batched against the engine's physics.
- Measure and report real numbers; headless timings here are CPU-only, so label them as such.

## Done means
- A headless test suite covers:
  - damage, injury and regeneration maths;
  - the witness → call box → report → response → decay → bribe → clear path;
  - inventory and money round-trips through save and load (including a migration fixture);
  - the shop buy and sell invariants.
- Recorded test-scene frames: a shootout behind cover, a melee exchange, a witness running to a
  call box, a patrol response, a bribe accepted and refused, breaking a description by changing
  clothes, a hydrant geyser.
- Touch-only playthrough notes showing every combat action is possible without precise aim.
- An honest critique in GAMEPLAY_PROGRESS.md: what feels 2031 and what feels like a prototype.
