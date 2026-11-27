# Cutscene performance tracks: the actor-track contract (UI & cinematics ⇄ characters)

**Status:** **agreed** with characters on 2026-11-27 (their notes are folded in below). It was proposed by UI & cinematics. Oversight asked for it to cover:
- clip ids and blends;
- IK targets;
- look-at;
- expression and viseme tracks;
- prop attach.

**Bar** (REFERENCE_GAMES.md): GTA V and RDR2 cutscenes are full-body performances with faces, eyes that land on the other actor, hands that hold real props, and lips on the line. We copy nothing; this is the data that lets us get there.

## Who owns what
- **Narrative** writes the script (`content/cutscenes/<id>.json`): blocking, beats, dialogue refs, and emotion per line.
- **UI & cinematics** owns the format, the `?cine=` tool that authors it, and the layout files (`content/cutscenes/layout/<id>.layout.json`), where every track below lives.
- **Characters** owns:
  - the clips and performance captures (`public/characters/anims.bin` plus cutscene packs);
  - the expression set and the viseme set;
  - lip-sync data from voice audio;
  - how a resolved frame is applied to a body (`ActorHost.perform`).

## The data (per shot, per actor), in the layout file
`shot.actors[id]` may be the old key array (still valid) or an **ActorTrack**:

```jsonc
"mayhew": {
  "keys":   [{ "t": 0, "x": 12.4, "z": -301.2, "heading": 1.57 }, { "t": 3.2, "x": 14.0, "z": -306.8, "heading": 1.40 }],
  "clips":  [{ "t": 0,   "clip": "walk_relaxed", "blend": 0.3, "loop": true },
             { "t": 3.0, "clip": "cs.m01.mayhew_wave", "blend": 0.25, "layer": "upper" },
             { "t": 3.2, "clip": "idle_talk_a", "blend": 0.4, "loop": true }],
  "look":   [{ "t": 0.5, "at": { "actor": "teddy" }, "blend": 0.4 },
             { "t": 4.1, "at": "camera", "weight": 0.6, "blend": 0.2 }],
  "ik":     [{ "t": 2.0, "chain": "hand_r", "at": { "actor": "teddy", "joint": "upperarm_l" }, "blend": 0.25 },
             { "t": 2.8, "chain": "hand_r", "at": null, "blend": 0.3 }],
  "expr":   [{ "t": 0, "name": "smile", "w": 0.7, "blend": 0.3 }, { "t": 4.0, "name": "brow_raise", "w": 0.5, "blend": 0.15 }],
  "lips":   "auto",
  "props":  [{ "t": 0, "prop": "sportcoat_folded", "attach": "hand_l", "offset": [0, -0.05, 0.02], "rot": [0, 90, 0] },
             { "t": 3.5, "prop": "sportcoat_folded", "attach": null }]
}
```

| Track | Meaning |
|---|---|
| `keys` | The root path, as today: `t, x, z, heading`, plus an optional `y`. Feet follow the ground unless `y` is given. |
| `clips` | Clip ids from the characters library. A key starts the clip at `t`, cross-fading over `blend` seconds. `layer`: `full` (default), `upper` (spine and up, over the lower body) or `additive` (the delta from the clip's first frame, added over the base). `speed` defaults to 1. `loop` defaults to the clip's own flag. **`cs.<scene>.<actor>_<name>`** are cutscene performance clips; with `"root": true` the clip's own root track drives the actor, and the layout's `keys` become an **offset** applied to that root motion (place and turn the whole performance; don't re-key the path). |
| `look` | Look-at for the eyes, head and spine (characters' existing look-at chain). `at` takes `{ actor, joint? }` (default `Head`; any joint name `host.joint()` knows), `"camera"`, `[x, y, z]`, or `null` to release. `weight` 0–1. |
| `ik` | `chain` is `hand_l`, `hand_r`, `foot_l` or `foot_r`. `at` is a point, `{ actor, joint }` or `{ prop }`; `null` releases. Hand contacts on another actor (a shoulder grab, a handshake) are authored once on one actor. |
| `expr` | Named expression weights from characters' set. Each key holds until the next key for that name. Blink and saccade layers always run, unless `"blinks": false` is set on the track. |
| `lips` | `"auto"`: visemes come from the lip-sync file of each dialogue line this actor speaks in the shot, timed by the shot's dialogue timing. Alternatively, a list `{ t, v, w }` to hand-key, or `"off"`. |
| `props` | Attach `prop` to a socket (`hand_l`, `hand_r`, `mouth` for a cigarette, `head` for a hat; `host.props()` lists the props), or `null` to drop it in place. `offset` is in metres in the socket's frame; `rot` is in degrees. Prop ids are owned by characters (hand props) and gameplay (weapons and items). |

**Cast hand-off** (in `cast` in the layout): `"after": "despawn" | "companion" | "ambient" | "player"`, default `despawn`. At cutscene end (played or skipped), `ActorHost.handOff(id, after, pose)` turns the cinematic body into the live entity in place, with no despawn. If the host has no `handOff`, cinematics fires the commit cue `actor.handoff { id, cast, after, pose }` so the engine or sim can spawn the live one at that exact pose. **This fixes "Mayhew vanishes at the blend"** (M1's cast has `mayhew: after: companion`).

## Viseme and expression sets (characters to confirm; the names are the contract)
- **Visemes (15):** `sil PP FF TH DD kk CH SS nn RR aa E I O U`. This is the common industry set, so text-to-phoneme and audio aligners map onto it.
- **Visemes, the lip-sync file shape and text-estimated timing are confirmed by characters.**
- **Expressions (starter list; characters will confirm it once mapped to their expression targets and the Rocketbox facial bones):** `smile`, `smirk`, `frown`, `brow_raise`, `brow_furrow`, `squint`, `eyes_wide`, `sneer`, `jaw_clench`, `lip_press`, `pout`, `cheek_puff`, `disgust`, `fear`, `sad`, `blink_l`, `blink_r`. Characters may rename or extend the list. The tool reads the list from the host, so there are no hard-coded names on my side.
- **Lip-sync files:** `content/lipsync/<dialogue line id>.json` = `{ "line": "dlg.m01.l5", "visemes": [[t, "aa", w], ...], "src": "aligner@version" }`, generated by characters from the voice audio. Until there is audio, characters can generate them from text with a timing estimate so scenes are never mute-mouthed.

## Characters' side (agreed)
- `perform(id, frame)` is stateless: a "performance" path in their Animator bypasses its state machine and samples the clips at the given times.
- `handOff(id, after, pose)`: the live character takes over the same body in place.
- The mocap source and faces are owned by characters:
  - motion from CMU (licence-checked) plus procedural acting layers, with phone markerless mocap costed as an option;
  - faces get blinks, saccades, an expression set and visemes, on their heads and the Rocketbox facial bones.
- **Timing:** their `perform()` follows their current bodies-and-clothing fidelity block. Until then, the stand-ins show the look-at and the lips.

## Runtime: deterministic and scrubbable
Each frame, cinematics resolves every track at the playhead `t` into an **ActorFrame** and calls `ActorHost.perform(id, frame)`. Nothing is event-driven, so scrubbing the tool backwards and forwards lands on the same pose every time.

```ts
interface ActorFrame {
  root: { x: number; y?: number; z: number; heading: number };
  clips: { clip: string; time: number; weight: number; layer: 'full' | 'upper' | 'additive'; root?: boolean }[]; // weights sum to 1 per layer
  look: { at: [number, number, number] | null; weight: number };        // resolved to a world point
  ik: Partial<Record<'hand_l' | 'hand_r' | 'foot_l' | 'foot_r', { at: [number, number, number]; weight: number }>>;
  expr: Record<string, number>;
  visemes: Record<string, number>;                                    // at most two non-zero (cross-fade)
  props: { prop: string; attach: string; offset?: [number, number, number]; rot?: [number, number, number] }[];
  blinks: boolean;
}
```

The `ActorHost` gains these, all optional: older hosts still work with `pose()`:
- `perform?(id, frame)`;
- `handOff?(id, after, pose)`;
- `clips?(): { id, duration, loop }[]`, `expressions?(): string[]` and `props?(): string[]`, which feed the tool's pickers;
- `joint?(id, joint): [x, y, z] | null`, which resolves `{ actor, joint }` targets.

## The tool (`?cine=`)
A **Performance** panel for the selected actor, with one lane per track on the scrub timeline. For each track:
- **Clip:** add at the playhead (the picker lists the host's clips), then set blend, layer, speed and loop.
- **Look:** click an actor or the camera, or click the street for a point.
- **IK:** pick a chain, then click a joint on another actor or a point.
- **Expr:** pick from the host's set, then set weight and blend.
- **Props:** pick a prop and a socket.
- **Lips:** auto, keyed or off, with the viseme lane drawn from the lip-sync file.

Keys can be dragged on their lanes and deleted with Del. Validation flags unknown clip, expression or prop ids against the host lists, a look or IK aimed at an actor not in the cast, overlapping blends, and missing lip-sync files for spoken lines.

## vs GTA V / VI / RDR2
- **What the reference does:**
  - performance-captured bodies and faces;
  - eye lines that hold on the scene partner;
  - hand contact and props that never float;
  - lips matched to every line;
  - NPCs that walk out of the cutscene into play with no pop (RDR2 especially).
- **Where we match (on paper):** every one of those has a track or a hand-off here, and the data is scrubbable and deterministic, like any proper editor timeline.
- **Where we fall short:**
  - there's no real mocap: performances are library clips plus authored cutscene clips, and the face is a small expression set plus visemes, not a scanned face rig;
  - on phones, faces in mid shots will read; extreme close-ups won't match RDR2.
- **Plan:** characters' pipeline decides the clip source; we frame around the face rig's limits (fewer ECUs, more two-shots and profiles, which suits the 1970s film grammar anyway).
