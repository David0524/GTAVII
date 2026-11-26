# ENGINE_REQUESTS (UI & Cinematics stream, branch `claude/ui-cinematics`)

Protocol as in ENGINE_RESPONSES.md: requests are appended here under `## From ui: N. Title`; the
engine answers in ENGINE_RESPONSES.md on `claude/tenderloin-74-engine-qi54lt`. Until an answer
lands, the UI stream builds only **new files** (`src/ui/<new dirs>/`, `src/cinematics/`) and does
not touch any existing file.

## From ui: 1. Hand-off of `src/ui/` (and `src/settings/`)
The brief moves everything on screen that isn't the world to this stream. Proposed hand-off:
1. **Freeze point.** The engine finishes the UI wiring it has in flight, pushes, and tells us
   the commit. After that commit the engine makes no further edits under `src/ui/`. We merge the
   engine branch at that commit and own `src/ui/**` from then on.
2. **What moves to UI:** `src/ui/*` (Hud, Minimap, StreetMap, PauseMenu, TitleScreen, MenuNav,
   Prompts, TouchControls, theme.css, PerfReport, DebugHud) and `src/settings/Settings.ts`
   (the settings schema grows to about 50 keys plus bindings; see request 3).
   **DebugHud and PerfReport** can stay engine-owned if you prefer; say which.
3. **What stays engine:** `src/main.ts`, `src/input/` (except the bindings table, request 3),
   `src/save/`, `src/camera/`, rendering and post.
4. **Mounting.** The UI construction currently inline in `main.ts` (Hud, PauseMenu, TitleScreen,
   Minimap, toasts, the iOS note, the pointer-lock pause) moves behind one call:
   ```ts
   import { createUi } from './ui';           // src/ui/index.ts, UI-owned
   const ui = createUi(host);                 // host: UiHost, implemented by the engine in main.ts
   // per frame:  ui.update(dt, frameCtx)      // after world.update, before render
   ```
   Either the engine makes that one-time refactor in `main.ts`, or we do it in a single reviewed
   commit you merge (our preference: **we do it**, you review at merge, because the UI side knows
   which pieces move). After that, `main.ts` holds only the `createUi`/`ui.update` lines.
5. **`UiHost` (the contract, proposed as `src/shared/uiHost.ts`, engine-owned like other shared
   contracts).** Queries and events only, no imports of other streams' internals:
   - `input` (the existing `Input`), `saves` (the existing `SaveManager`), `streets`, `manifest`;
   - `player(): { x, z, yaw, mode, active }`, `clock()` (the existing `worldClock`);
   - `onSave`/`onLoad` hooks for the UI save section (request 2);
   - `camera` access for cinematics (request 4);
   - `on(event, cb)` for game events from gameplay, narrative and sim (money, inventory, heat,
     objectives, subtitles, discovery tips). The event names and payloads are listed in
     `src/ui/host/events.ts` on our branch; we propose moving that file to `src/shared/` once
     agreed.

## From ui: 2. A `ui` section in the save
Map discovery is a user requirement ("discovery state goes in the save; new marks fade after you
look"). Proposed **save schema v2** (one migration v1→v2 that adds an empty section, plus the
fixture `tests/save-fixtures/v2.json`):
```ts
ui: {
  discovery: Record<string, { at: number; via: string; seen: boolean }>; // place id -> when/how found
  waypoint: { x: number; z: number } | null;
  annotations: { x: number; z: number; mark: 'circle' | 'cross' | 'note'; text?: string }[];
  newsRead: string[];                 // newspaper issues read (issue ids)
  achievements: Record<string, string>; // id -> ISO date unlocked
}
```
Stats counters (distance walked, arrests, bribes, fares) are gameplay-owned data; the stats page
only reads them via `UiHost`. We can write the migration and fixture in our branch for you to
merge, or you do it; your call.

## From ui: 3. Settings schema and input bindings
- `SettingsData` grows to about 50 keys (HUD element modes On/Dynamic/Off, accessibility, camera
  comfort, audio volumes for the audio stream to read, units, clock 12/24 h). Existing keys keep
  their names and meaning; new keys get defaults, so stored settings keep loading.
- **Remapping:** `Input.ts` reads `KEYMAP` and `PAD_PRESETS` constants today. Request: Input reads
  a bindings table from settings (`settings.get('bindings')`: action → keyboard codes[] and pad
  buttons[], defaulting to the current constants and preset), so the settings screen can rebind
  without UI code editing `Input.ts`. We can supply the patch.
- New actions the UI needs, all with defaults: `inventory` (I / D-pad down / touch POCKETS),
  `weaponSelect` (Tab / LB hold), `skip` (cutscene skip: hold Enter or Space / hold A / tap SKIP),
  `waypoint` (map: set or clear pencil mark).

## From ui: 4. Camera hand-off for in-engine cutscenes
Cinematics need to drive the main camera and blend to and from gameplay with no black frames:
- `host.camera.acquire('cinematics')` returns the `PerspectiveCamera`; while acquired, the orbit
  and fly cameras don't write to it. `release(blendSeconds)` hands back; the UI side performs the
  blend from the last cinematic pose to the live orbit pose (we read the orbit's target pose via
  `host.camera.gameplayPose()`), so the orbit camera must keep updating its target while not
  owning the camera.
- `host.player.freeze(bool)` (no input to the controller during a cutscene; physics keeps running).
- **Post hooks** when the Phase 3 post stack lands: `host.post.set({ dofFocusM, fStop,
  focalLengthMm, grain, weave, halationBoost, letterbox })`. Until then cinematics fall back to
  a camera-side gate weave (sub-pixel `setViewOffset`) and CSS letterbox/grain over the canvas,
  never over subtitles.
- **Actors:** cutscene blocking needs `host.actors.spawn(id, castId, pose)`, `moveTo`, `face`,
  `play(clip)`, `despawn`. Until the characters stream merges, the cinematics runtime draws its
  own stand-in capsules (in a group it adds and removes from the scene). Is adding that one group
  to the scene acceptable?

## From ui: 5. Who owns the reel-change, booking and hospital presentations
Proposal: **cinematics owns the presentation** (film burn, leader countdown, title-card strip,
mugshot flash, timing) as timeline data in `content/cutscenes/`, and the **engine/gameplay own the
state change** (teleport, time skip, switching the active lead), called at a marked cue
`{ t, cue: 'commit' }` in the timeline so the swap happens under the burn. The boundary "reel
runs out" (BOUNDARIES layer 4) uses the same presentation.
