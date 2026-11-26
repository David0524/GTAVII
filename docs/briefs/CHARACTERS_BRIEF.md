# Brief: characters (people, 1974 wardrobe, animation, crowds) for "Tenderloin '74"

You're a parallel workstream on a browser open-world game set in Manhattan's Tenderloin, summer
1974 (three.js 0.187.0 WebGPU/WebGL2 with TSL node materials, TypeScript, Vite, Rapier
`@dimforge/rapier3d-compat` 0.21.0, landscape mobile + desktop + gamepad). The engine session
owns rendering, the city, the player controller, the camera, the UI and integration. The
narrative session owns story, the cast and the NPC archetype content. The sim session owns where
pedestrians walk and what they decide; the vehicles session owns cars. **You own how people look
and move: bodies, faces, hair, period wardrobe, animation, and the crowd renderer.**

The quality bar is a 2031 AAA open world. People are what players look at most, and stiff or
samey crowds break a city instantly. The target is a gritty 1970s crime film shot on 35 mm:
sweat, polyester, worn shoes, heat-slumped posture, a city of every age, build and background.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch. This brief lives
   on `claude/awesome-keller-i9tmmu` (oversight); copy it to `docs/briefs/CHARACTERS_BRIEF.md` on
   your branch in your first commit.
2. Read `PROGRESS.md`, `ENGINE_RESPONSES.md`, `docs/CONTROLS.md`, `docs/briefs/SIM_BRIEF.md`
   (`AgentView`, the archetypes and escort locomotion), `NARRATIVE_BRIEF.md` (the archetype
   schema with palette, wardrobe and props; the content rules), and the narrative branch
   `claude/sharp-maxwell-jnb6hr` for the leads and cast as they land. Also read
   `docs/STYLE_GUIDE.md` once it exists.
3. **Study the photo references** in `references/` (`catalog.json` has the credits). They're
   real 1971–77 photographs. Record what people actually wore, carried and how they stood, and
   note it in `docs/WARDROBE_1974.md` with the reference ids it came from.
4. Keep `docs/CHARACTERS_PROGRESS.md` as your source of truth: done, next, decisions, known
   issues. Read it at the start of every session and update it at the end.
5. Ask the user before major architectural decisions, before choosing an animation or base-mesh
   source, and before cutting any scoped feature.

## Hard rules
- **No likeness of real people.** No celebrities, no actors, no real 1974 public figures, and
  no recognisable characters from films or other games.
- **No real brands or logos** on clothing or props.
- **Assets must be original, CC0 or clearly licensed for redistribution in a web game.** Keep
  `docs/CHARACTER_SOURCES.md` with the file, source, licence and edits for each asset.
  - Mixamo and similar "use-in-project only" licences are a risk for a web build that ships the
    raw files. Raise it with the user before relying on them.
  - Prefer your own procedural or parametric generation plus CC0 animation libraries.
- **Represent 1974 New York respectfully and accurately.** It was a city of Black, Puerto Rican,
  Dominican, Chinese, Jewish, Irish, Italian, Greek and many other communities. Get variety
  through skin tone, build, age, hair and dress, never through caricature. The narrative team's
  rules on sensitive subjects apply: nothing sexual, no minors in adult contexts, people written
  and shown as people.

## Scope
1. **Parametric human** (`src/characters/body/`): one rig and topology family with morph
   parameters (height, build, weight, age, posture, sex, and body shape for the full range) and
   a face generator (skull, nose, jaw, brow, ears, ageing, skin detail). Skin uses a
   subsurface-approximation material in TSL with tone and wrinkle and pore detail. Hair is card
   or shell based, in period styles: afros, pompadours, feathered cuts, sideburns, moustaches,
   comb-overs, set curls, headscarves, cornrows. Eyes have specular and a believable wet line.
2. **1974 wardrobe generator** (`src/characters/wardrobe/`):
   - Layered garments fitted to the morphs: wide lapels, leisure suits, flared trousers,
     polyester shirts with big collars, cardigans, A-line dresses and midi skirts, wrap
     dresses, work clothes (garment-trade smocks, sanitation and transit uniforms), period
     police uniform (generic, no real crest), sneakers of the era (unbranded), platforms, worn
     wingtips.
   - Hats: fedoras on older men, caps, newsboys and headscarves.
   - Bags, newspapers, a lunch pail, a shopping cart and handcarts (the sim's "worker with
     handcart").
   - Materials show wear: sweat darkening in the heat, dust and stains, faded fabric, scuffs.
   - Implement the archetype schema's `palette`, `wardrobe` and `props` fields so the narrative
     team's archetypes drive generation directly.
3. **Hero characters:** the narrative leads (Teddy Arce, Delphine Moore, Nick Varelas) and key
   cast, built from the same generator with hand-tuned parameters and higher-detail LOD0.
   - Ask the narrative team for appearance sheets through the user, and file it as an
     ENGINE_REQUEST so it's tracked.
   - Per-character wardrobe sets per act (the narrative "playAs" and per-lead wardrobe request
     N5).
4. **Animation** (`src/characters/anim/`):
   - **Locomotion:** idle variants, walk at several speeds (shuffle, stroll, brisk), run,
     sprint, starts and stops, turn-in-place, strafe for the camera, stairs and curbs, jump,
     ledge climb (engine Phase 2 controller), fall and land, stumble on hit.
   - A blend space or motion-matching-lite driven by the controller's velocity and heading.
     Root motion is off: the engine's Rapier controller owns position.
   - **Procedural layers:** foot IK on the 0.15 m curbs and stairs, look-at with head and eyes,
     lean into turns and slopes (the user approved real terrain/hills), hand IK for doors,
     railings, steering wheels and the vehicles' `seatPose`.
   - **Ambient actions** for loiter spots: smoking and lighting up, reading the paper, leaning
     on a wall, sitting on a stoop, fanning in the heat, hailing a cab (it pairs with the sim's
     `hail` event), arguing with big gestures, vendor work.
   - **Talking:** gesture sets by emotion (the dialogue format's `emotion` tag) and basic
     lip-sync from audio or text timing.
   - **Reactions:** flinch, flee, cower, rubberneck at accidents. Physical-hit ragdoll is a
     stretch goal; agree it with the engine first.
   - Animation events (footstep with surface, hand-contact) for the audio session.
5. **Crowd renderer:** 400 pedestrians on High from the sim's `AgentView` list.
   - GPU skinning with instancing, or vertex-animation textures for far LODs.
   - LOD0 near the player, LOD1 at mid distance, an impostor or billboard far away.
   - Animation sampled from speed and state, so the walk cycle matches the agent's speed with
     no foot sliding.
   - Variety without repeats: the same face, outfit and colour combination never visible twice
     in one view.

## Integration contract (the engine session wires it in; ask for changes via ENGINE_REQUESTS)
```ts
// src/characters/index.ts
export interface CharacterDesc { seed: number; archetype?: string; hero?: string; act?: number; overrides?: Record<string, unknown> }
export function createCharacterFactory(opts: { quality: 'low' | 'medium' | 'high' | 'ultra'; baseUrl?: string }): Promise<CharacterFactory>;
interface CharacterFactory {
  spawn(scene: THREE.Object3D, desc: CharacterDesc): Character;
  createCrowdRenderer(maxInstances: number): {
    setAgents(list: readonly { id: number; archetype: string; variant: number; x: number; y: number; z: number; yaw: number; speed: number; state: string }[]): void;
    object: THREE.Object3D;
  };
}
interface Character {
  readonly object: THREE.Object3D;
  setLocomotion(s: { velocity: [number, number, number]; grounded: boolean; heading: number; mode: 'walk' | 'run' | 'sprint' | 'crouch' }): void;
  play(action: string, opts?: { loop?: boolean; blendIn?: number }): Promise<void>;   // 'hail_cab', 'sit_stoop', 'talk:angry', 'climb_ledge', ...
  lookAt(target: THREE.Vector3 | null): void;
  setSeat(pose: THREE.Matrix4 | null): void;            // vehicles seatPose
  setWardrobe(set: string): void;
  on(type: 'footstep' | 'contact', cb: (e: any) => void): void;
  update(dt: number): void; dispose(): void;
}
```
- Provide a test scene behind `?characters=1`:
  - a lineup of 20 seeded pedestrians and the three leads, with a turntable;
  - a locomotion test course with a curb, stairs, a slope and a ledge;
  - a 400-agent crowd stress test that replays a recorded sim walk if the sim isn't merged yet.
- The only edit you may make to `src/main.ts` is one guarded line. Don't change any other shared
  file. Requests for the engine go in the root `ENGINE_REQUESTS.md` under
  `## From characters: N. Title` (what, why, fallback). Answers appear in `ENGINE_RESPONSES.md`
  on the engine branch: check it each session.

## Budgets
- **Player and heroes:** LOD0 about 20–30k triangles and ≤ 2 draw calls with ≤ 0.3 ms CPU.
- **Crowds:** 400 pedestrians on High within **≤ 1.5 ms CPU** and a sensible GPU cost
  (report triangles and draws). Mobile Low: 120 pedestrians within ≤ 1.5 ms.
- **Download:** shared body, garment and animation data ≤ 15 MB on High and ≤ 6 MB on mobile
  Low. Generate procedurally where you can instead of shipping meshes.
- Measure and report real numbers. Headless timings here are software-rendered; label them as
  such.

## Done means
- Lineup screenshots of 20 seeded pedestrians next to matching reference photos, plus the three
  leads, with an honest critique of what reads as 1974 and what reads as a modern game.
- Locomotion frames: walk-to-run, a curb step with foot IK visible, stairs, a turn-in-place, a
  hail-a-cab, and no foot sliding at three crowd speeds.
- A crowd stress screenshot and timing report at 400 / 120 agents.
- CHARACTER_SOURCES.md is complete, with every asset accounted for.
