# Brief: UI, map and cinematics for "Tenderloin '74"

You're a parallel workstream on a browser open-world crime game set in Manhattan's Tenderloin,
summer 1974 (three.js 0.187.0 WebGPU/WebGL2 with TSL, TypeScript, Vite; landscape mobile, desktop
and gamepad). The engine session owns the city, rendering, the player controller, saves and
integration; it currently also owns UI, which moves to you. **You own everything on screen that
isn't the world (the HUD, the minimap and map, menus, settings, every gameplay screen) and the
in-engine cutscene system.**

Read `docs/briefs/FEATURE_AUDIT.md` first: every line marked "UI chat" or "UI & Cinematics chat"
is yours. The quality bar is a 2031 AAA open world in the 35 mm, 1974 film look. Period
typography and print design, diegetic wherever possible, and mobile-first.

## Start here
1. Branch from `claude/tenderloin-74-engine-qi54lt` and work on your own branch. This brief and
   FEATURE_AUDIT.md live on `claude/awesome-keller-i9tmmu` (oversight); copy both into
   `docs/briefs/` on your branch in your first commit.
2. Read the following:
   - `PROGRESS.md`, `ENGINE_RESPONSES.md` and `docs/STYLE_GUIDE.md` (typography, palette, the
     film grade);
   - `public/fonts/` (period fonts already licensed);
   - `docs/CONTROLS.md` and `docs/research/CONTROLS_AND_SETTINGS_REFERENCE.md` (the settings
     roadmap);
   - `src/ui/` (DebugHud, Minimap, Prompts, TouchControls), `src/input/` and
     `src/settings/`;
   - all briefs in `docs/briefs/` (BOUNDARIES, ECONOMY, CORE_SYSTEMS, GAMEPLAY, INTERIORS);
   - on the narrative branch `claude/sharp-maxwell-jnb6hr`: `content/` (missions, dialogue,
     places) and `NARRATIVE_BRIEF.md` (the mobile rules: objective text ≤ 40 chars, choices
     ≤ 4, no timed choices under 6 s, no info only in audio).
3. Keep `docs/UI_PROGRESS.md` as your source of truth. Read it at the start and update it at the
   end of every session.
4. Coordinate with the engine chat: it is handing `src/ui/` to you. Agree the hand-off in
   ENGINE_REQUESTS before editing any existing file.
5. Ask the user before major architectural decisions or before cutting any scoped feature.

## Scope
1. **HUD:** minimal, period and contextual. Health and injuries shown diegetically, cash on hand,
   the active weapon and its concealment, the objective line, subtitles, police heat **through
   radio and minimap cues only (no stars)**, and stamina. Each element can be set to On,
   Dynamic or Off.
2. **Minimap with discovery** (a user requirement, see FEATURE_AUDIT "Map discovery"):
   - icons appear as the player discovers places, never all at once, with "new" marks;
   - category filters;
   - police search cones;
   - the pencilled route line (no GPS in 1974);
   - the paper-texture edge at the boundary.
3. **The pause map:** the 1974 folding street map (an invented publisher), with pencil
   annotations, stamps and a legend; waypoints; discovered places with info cards; your
   properties. It's the game's main menu hub.
4. **Gameplay screens:**
   - the "pat down your pockets" inventory with concealment;
   - the weapon selector constrained by concealment;
   - shop counters;
   - the newspaper (weekly results, the daily number, the chop list, headlines);
   - business management;
   - the stats page, completion checklist and achievements;
   - the bail-out and lead-switch picker (three portraits, one large button);
   - the dialogue choice buttons.
5. **Front end:** the title screen in the film look, profiles and save slots (on the engine's
   SaveStore), settings (about 50, plus full remapping, layout presets and accessibility),
   credits with every licence and attribution (ODbL, CC0 and CC-BY sources from all streams),
   the iOS "add to Home Screen to keep saves" prompt.
6. **Cinematics system:**
   - In-engine cutscenes as **data timelines** (`content/cutscenes/*.json`): camera shots with
     lens and focal length, dolly, crane and handheld moves, character blocking and animation
     cues, dialogue lines, audio cues, lighting overrides, film effects.
   - The 35 mm language: anamorphic-feel framing, rack focus, period zooms, grain, gate weave.
   - **Seamless in and out of gameplay** (the camera blends to and from the player's camera, with
     no black frames).
   - Skippable, subtitled, letterboxed, and pausable on mobile.
   - A small **in-browser authoring tool** behind `?cine=1`: scrub the timeline, place cameras,
     preview, export the JSON. The narrative chat writes the scripts and shot lists, and you or
     it lay them out with the tool.
   - The reel-change cut, booking and hospital presentations: agree with the engine which side
     owns them.

## Integration
- Code lives in `src/ui/` (after the hand-off) and `src/cinematics/`.
- Read game state through events and queries from gameplay, engine and narrative; never import
  other streams' internals.
- Requests go in the root `ENGINE_REQUESTS.md` under `## From ui: N. Title`.

## Budgets
- HUD and minimap ≤ 0.5 ms CPU per frame on mobile Low.
- Menus open in under 100 ms.
- UI assets (fonts, paper textures, pictograms) ≤ 3 MB.
- Cutscene playback holds the gameplay frame budget.

## Done means
- Screenshots of the HUD, minimap (before and after discovery) and pause map on a phone in
  landscape and on desktop.
- Every gameplay screen working against mock data.
- The cinematic tool used to build M1's opening scene from the narrative script, captured as
  frames, with a seamless blend into gameplay.
- A touch-only run through every menu.
- An honest critique against the 2031 bar.
