# Controls and Settings Reference (modern Rockstar open-world baseline)

> Purpose: a scoping and inspiration reference for **Tenderloin '74**. It describes what a
> current-generation Rockstar open-world game offers in controls and settings, so we can decide
> what to build. Everything here is paraphrased. We copy no Rockstar names, text, icons or menu
> wording into the game, and our own menus use our own labels.
>
> Research date: **2026-11-26**. Author: research pass for the controls/UI workstream.

## Confidence labels used throughout

| Label | Meaning |
|---|---|
| **C** = CONFIRMED (GTA VI) | Stated by Rockstar Support, or by at least two independent post-launch outlets that read the shipped game's menus. The source is given. |
| **R** = REPORTED (GTA VI) | Found in only one post-launch guide, or sources disagree. Probably right, but check before relying on it. |
| **I** = INFERRED (GTA V / RDR2) | Not documented for GTA VI. Taken from the GTA V (PC / PS5 / Xbox Series) or Red Dead Redemption 2 baseline. |
| **n/a** | Does not exist on that platform. For example, GTA VI has no PC version, so it has no keyboard and mouse layout. |

---

## 1. Status: what is actually known about GTA VI

- **It released.** GTA VI launched on **November 19, 2026** on PS5 and Xbox Series X|S
  (**C**). Reviews went live on Nov 18 and it scored about 99 on Metacritic. PSN had sign-in
  outages on launch night. *Sources: Al Jazeera, 2026-11-19; LatinTimes; Boston Globe.*
- **No PC version has been announced** (**C**, as of launch coverage). **So GTA VI has no
  keyboard and mouse layout.** Every KB/M entry in this document comes from GTA V PC (**I**).
- **GTA Online for VI** is reported for 2027 (Bloomberg via PCGamesN). It doesn't matter for us.
- **Official settings documentation.** Rockstar Support published "How to change Grand Theft
  Auto VI settings", updated **2026-11-18**. It lists the tabs: **Control Scheme, Controller,
  Gameplay (Combat / Movement / Accessibility), Display (Display / Visual Effects / High-Contrast
  Shaders), UI, Camera, Audio, Account**, with **Restore Default / Restore All** at the bottom.
  The support page returned HTTP 503 when we tried to fetch it, so we know its contents only
  through a Player.One summary dated 2026-11-18 (**C** for the tab structure).
- **Item-level settings lists** come from post-launch guides that read the shipped menus. The
  main one is DayOne/playday.one, "All in-game options in GTA 6" (2026-11-18, Xbox), backed up
  by games.gg's accessibility guide (2026-11-19), Beebom's controller-settings guide
  (2026-11-20, PS5) and Engadget (2026-11-19). Notebookcheck's per-tab counts match the DayOne
  list closely: **25 Gameplay/accessibility, 12 Display, ~70 UI, 24 Camera, 14 Audio.** Our
  count from DayOne is 25 / 12 / 67 / 24 / 13+1. So the item list below is **C** at tab level
  and **mostly C** per item. Where only one guide reports something, it is marked **R**.
- **Default controller layout** comes from wikily.gg (2026-11-18, modified 11-25, "read from the
  game's own menus"), Beebom and a pre-launch Dexerto report (2026-09-01, from a Rockstar North
  visit). The headline change from GTA V, confirmed by all three: **sprint moved to L3/LS click,
  jump moved to the A/✕ button, and the car handbrake moved to A/✕**. This frees RB/R1 for
  drive-by fire. A **Classic** scheme restores the GTA V face-button layout, and there is also a
  **Left-Handed** scheme (**C**).
- **Accessibility review.** We found **no Can I Play That review of GTA VI** as of 2026-11-26.
  Their RDR2 deaf-gamer review (2019) praised the game overall but called it an accessibility
  "nightmare" for deaf players, mainly because of its subtitles. GTA VI's settings are a large
  jump over that. Some pre-launch articles (GTAIntel, iTechGuides, Oct 2026) say "nothing
  confirmed". That is now out of date.
- **First person.** GTA VI launched **without a full first-person mode** (**C**, several
  outlets). It has a first-person **phone display** option (**C**, Camera > Comfort). An "aim +
  RS click" closer look is reported (**R**, Engadget). A first-person driving camera glitch has
  been reported (unofficial).
- **Character switching** between the two leads is **story-gated**, not a free switch wheel
  (**R**, from GamesRadar and Shacknews pre-launch interviews). No switching binding has been
  documented.

Known gaps: no official PDF manual was found. We have no verified mapping for radio station
change, horn vs nitrous details, aircraft yaw, bikes, swimming or parachute. These show up as
diagrams in the in-game Control Scheme preview (On Foot, Aiming, Melee, Land/Water Vehicles,
Aircraft, Bicycle, Swimming, Parachute), but no outlet transcribed them reliably.

---

## 2. Default controls per context

Columns: **Xbox** / **PlayStation** are GTA VI defaults where known (GTA V where marked **I**).
**KB/M** is always GTA V PC (**I**), because GTA VI has no PC version.

### 2.1 On foot

| Action | Xbox | PlayStation | KB/M (GTA V PC) | Confidence / source |
|---|---|---|---|---|
| Move | LS | LS | W A S D | C (wikily) |
| Look / camera | RS | RS | Mouse | C (wikily) |
| Sprint | LS click (L3) | L3 | Left Shift (hold) | C, changed from GTA V's tap-A (Dexerto, Beebom, wikily). GTA V and Classic: tap/hold A / ✕ |
| Walk/jog/run by stick deflection | LS | LS | Left Alt / Caps toggles walk (I) | C: Gameplay > Movement Speed sets the full-stick gait |
| Jump / climb / vault | A | ✕ | Space | C (wikily, Beebom). Classic: X / □ |
| Crouch / stealth / rest (hold) | B (hold B = rest) | ○ | Left Ctrl | C (wikily, Beebom). Classic: L3 |
| Melee | X | □ | R / Left mouse when unarmed (I) | C. Classic: B / ○ |
| Take cover | RB | R1 | Q | C (wikily) |
| Holster / weapon loadout wheel | LB tap = holster, hold = loadout wheel | L1 | Tab (hold) for wheel | C. RB/R1 switches the wheel's Weapons/Items tabs (wikily) |
| Aim | LT (hold; Press option exists) | L2 | Right mouse | C. Gameplay > Accessibility > Aiming: Hold/Press |
| Fire | RT | R2 | Left mouse | C |
| Reload | (B in GTA V; not documented for VI) | ○ (GTA V) | R | I |
| Scope zoom | D-pad up while aiming | D-pad up | Mouse wheel | R (wikily) |
| Interact / talk | Y (interact); hold LT near a person = talk | △; hold L2 | E | C for Y/△. Interact Hold/Press option. "Talk" R |
| Enter vehicle | Y | △ | F | C (Exit = Y in vehicle; enter is the same in GTA V) |
| Focus (look at point of interest) | LS+RS click, or View (setting) | L3+R3 / touchpad | (n/a) | C, Accessibility > Focus option |
| Look behind | RS click | R3 | C | C (wikily) |
| Closer look ("first-person-ish") | Hold LT + RS click | L2 + R3 | (V cycles to first person in GTA V) | R (Engadget). Full first person is **I** (GTA V only) |
| Camera view cycle | View (if set to Camera) | Touchpad | V | C: "View Button: Map or Camera" setting |
| Phone | D-pad up | D-pad up | Up arrow | C |
| Quick menus (radio, quick nav, partner menu, app) | Hold D-pad directions | Hold D-pad | (I) Q radio wheel, M interaction | R (wikily). D-pad Hold vs Hold & Release option is C |
| Nearby locations (slow time, mark GPS) | Hold D-pad down | Hold D-pad down | (n/a) | R (games.gg) |
| Map | View (default) | Touchpad | M / P (pause map) | C |
| Pause | Menu | Options | Esc | C |
| Special ability / character switch | n/a (not documented) | — | Caps Lock / Left Alt (GTA V) | I, GTA V only |

### 2.2 Driving (cars; boats share this layout in GTA VI)

| Action | Xbox | PlayStation | KB/M (GTA V PC) | Confidence / source |
|---|---|---|---|---|
| Steer | LS | LS | A / D | C |
| Accelerate (analog) | RT | R2 | W | C |
| Brake / reverse (analog) | LT | L2 | S | C |
| Handbrake | A | ✕ | Space | C (moved from GTA V's RB/R1) |
| Horn / nitrous | LS click | L3 | E | C (wikily). Nitrous Hold/Press option is C |
| Headlights | B (tap); hold D-pad left = vehicle features (lights, trunk) | ○ | H | R. Sources conflict (wikily vs games.gg). Classic: "headlights/duck" moved |
| Turn signals | D-pad left / right (tap) | D-pad L/R | (none in GTA V) | C (two guides). New compared with GTA V |
| Exit vehicle | Y | △ | F | C |
| Radio station | Hold D-pad → radio menu (direction unverified) | same | Q wheel; . / , next/prev station | R for VI. GTA V pad: D-pad left tap = next station, hold = wheel (I) |
| Look behind | RS click (GTA V) | R3 | C | I (only on-foot is documented for VI) |
| Camera height / cinematic camera | Hold D-pad down → camera menu (3 heights + cinematic) | same | R = cinematic, V = cycle (GTA V) | R (Engadget, Beebom). Conflicts with "nearby locations" on the same input. GTA V pad: hold B/○ = cinematic (I) |
| Auto-drive to waypoint (cinematic cam only) | Hold B in cinematic cam; LT/RT = speed | Hold ○ | (n/a) | R (several guides). Setting: Restricted/Unrestricted is C |
| Drive-by aim / fire | LT = aim, RB fire (GTA V had LB aim + RB fire) | L2? / R1 | Mouse R / L | R. The handbrake move was explicitly to free "fire while driving" (Dexerto) |
| Phone (allows first-person view while driving) | D-pad up | D-pad up | Up arrow | C |
| Adaptive speed limiter (PS5 trigger resistance) | — | R2 resistance | — | R (Beebom) |
| Duck in car | (GTA V: A / ✕ hold; Classic moves it in VI) | — | Left Ctrl | I |

### 2.3 Other vehicles (brief; mostly GTA V baseline)

| Context | Key actions (pad) | KB/M (GTA V) | Confidence |
|---|---|---|---|
| Motorbike | RT/LT throttle/brake; LS lean fwd/back; A or X wheelie/stoppie in GTA V | W/S, Shift/Ctrl lean | I |
| Bicycle | Pedal (tap/hold face button), bunny hop. Classic remaps pedal and hop | Shift pedal, Space hop | C that a Bicycle diagram exists. Bindings I |
| Boats | Same as cars in VI; auto-drive works on boats | as car | C (wikily, games.gg) |
| Aircraft | RT/LT throttle up/down; LS pitch+roll; yaw on face buttons (X/B, □/○, *R*); Y exit. Landing gear = LS click in GTA V (I) | W/S throttle, A/D yaw, Num 4/6 roll, Num 8/5 pitch, G gear | R (VI, partial) / I |
| Swimming / parachute | Separate diagrams in VI; GTA V: A swim fast, X dive; parachute deploy A/X | Space/Shift | I |

### 2.4 Phone, menus, photo

| Action | Xbox | PlayStation | KB/M (GTA V) | Confidence |
|---|---|---|---|---|
| Open / close phone | D-pad up / B | D-pad up / ○ | Up arrow / Backspace | C (open); I (close) |
| Phone camera: shutter | RT | R2 | Enter / LMB | R (one guide) |
| Phone camera: front/rear (selfie) | RS click | R3 | (GTA V: Up arrow/ G) | R |
| Selfie: change pose / expression | D-pad up/down, left/right | same | — | R |
| Phone flashlight | LB | L1 | — | R |
| Full photo mode ("Photo Studio" in-game: DoF, aperture, filters, lighting; camera only, characters fixed) | Opened from pause menu | same | (GTA V: Rockstar Editor / Snapmatic) | C (several guides) |
| Pause menu tabs | LB/RB | L1/R1 | Q/E (GTA V) | I |
| Map zoom / pan / rotate (3D) | Triggers / LS / RS | same | Wheel / drag | I. "3D Map Rotation" invert setting is C |
| Waypoint | A on map | ✕ | Right-click / Enter | I |

### 2.5 Character switching / social

GTA VI: two leads, and switching is **story-gated**. Previews describe a zoom-out/zoom-in
transition. No free-switch binding is documented (**R**). GTA V: hold D-pad down + right stick
to pick a character (**I**). GTA VI has no online mode at launch (**C**). **Not relevant to us
for v1.**

---

## 3. Settings menus by category

Unless marked otherwise, everything in 3.1–3.8 is **GTA VI, C/R** from DayOne (2026-11-18),
cross-checked with games.gg, Beebom and Engadget. Section 3.9 is **I** (GTA V PC graphics,
because consoles don't expose graphics settings). "Default" is given where a source stated it.

### 3.1 Control Scheme
| Setting | Options | What it does |
|---|---|---|
| Control layout | Default / Classic / Left-Handed | Classic = GTA V face-button layout (A sprint, X jump, L3 crouch, B melee). Left-handed mirrors it |
| Layout preview | On Foot, Aiming, Melee, Land/Water Vehicles, Aircraft, Bicycle, Swimming, Parachute | Read-only diagrams for each context. **No free per-button remapping on console** (I: GTA V console also has none; the system-level remap is used instead) |

### 3.2 Controller
| Setting | Options / range | What it does |
|---|---|---|
| Look sensitivity (H / V separately) | 0–14, default 7 | Stick camera speed |
| Aim sensitivity (H / V separately) | 0–14, default 7 | Stick speed while aiming |
| Look acceleration | slider | Ramp-up when the stick is held at full |
| Aim acceleration | slider | Same, while aiming |
| Aim response curve | Standard / Linear / Precision / Aggressive | Stick-to-rotation mapping shape |
| Invert look | Default / Vertical / Horizontal / Both | Per-axis invert |
| Invert movement / 3D map rotation / aircraft | toggles | Separate invert for each context |
| Vibration & haptics strength | 0–10, default 10 | Rumble scale |
| Dead zone, left stick | 0–10, default 5 (Beebom says 4) | Inner dead zone |
| Dead zone, right stick | 0–10, default 5 (4) | Inner dead zone |
| View button / touchpad function | Map / Camera | Rebinds one button |
| Adaptive triggers resistance (PS5) | On/Off | R |
| Adaptive triggers vibration (PS5) | On/Off | R |
| Adaptive speed limiter (PS5) | On/Off | R. R2 resistance matched to traffic speed |
| Light-bar effect (PS5) | On/Off | R. Light bar reacts to game state (e.g. police lights) |

GTA V baseline extras (**I**): Targeting mode lives here in V. Third-person and first-person
look sensitivity are separate. Controller config presets (Standard / Alternate / Southpaw /
Southpaw Alternate). First-person control types.
**GTA V PC Keyboard/Mouse tab (I):** full per-action rebinding with primary and secondary keys
for every action, organised by context (on foot, vehicle, aircraft, ...). Mouse on-foot
sensitivity. Mouse aim sensitivity. Separate mouse steering modes for driving / flying / boats
(Off, Mouse, Mouse reverse). Mouse invert. Mouse input method (Raw / Direct). Mouse acceleration
off. Mouse look in first-person vehicle.

### 3.3 Gameplay
| Group | Setting | Options | What it does |
|---|---|---|---|
| Combat | Targeting | Lock-On / Partial (default) / Free Aim | Aim-assist tier. GTA V had 4 tiers: Assisted Full, Assisted Partial, Free Aim Assisted, Free Aim |
| | Aim assist strength | 0–4, default 4 | Reticle slowdown over targets. Separate from the targeting mode |
| | Shooting assist | On/Off | Close-range tracking |
| | Drive-by assist | On/Off | Auto-aim from vehicles |
| | Quick draw | On/Off | Faster weapon readiness (R: exact behaviour undocumented) |
| | Cover selection | Camera & Movement / Movement only | How the cover target is chosen |
| | Holster in vehicle | Automatic / Manual | |
| | Lock-on target switch | On/Off | R (Beebom) |
| Movement | Movement speed (full stick) | Walk / Fast walk / Jog / Run | Lets a full stick deflection run without clicking L3. Small deflection still walks |
| | Combat movement speed | Walk / Fast walk / Jog | Same, while aiming |
| | Stand & sprint | Off (default) / On | Whether sprinting stands you up from a crouch |
| Accessibility | Tap assist | Off / 2x / 3x / 4x / Hold | One press counts as N presses, or a hold replaces mashing (also in RDR2) |
| | Hold assist | Off–4x | Divides required hold times |
| | Hold delay | 0–250% in 25% steps | Lengthens the hold threshold to prevent accidental triggers |
| | Focus input | LS+RS / View | |
| | D-pad actions | Hold / Hold & Release | Radial menus confirm on release, or stay open |
| | Aiming | Hold / Press (toggle) | |
| | Interact | Hold / Press | |
| | Loadout | Hold / Hold & Release | Weapon wheel behaviour |
| | Fishing | Rotate / Hold / Pull | Alternative reel inputs |
| | Nitrous | Hold / Press | |
| | Simplified mini-games | Off/On | Exercising, hotwiring, basketball |
| | Auto drive | Restricted / Unrestricted | Restricted = only "safe" scenarios. Unrestricted = anywhere, collisions possible |
| | Auto-equip helmet | Off/On | |
| | Accessible combat | Off/On | Less enemy health, less damage taken (big balance change) |
| | Reduced vehicle damage | Off/On | |

Difficulty: **no difficulty selector** (C by absence; GTA V and RDR2 also have none). Difficulty
is handled through assists.

### 3.4 Display
| Group | Setting | Options | What it does |
|---|---|---|---|
| Display | HDR calibration | screen wizard | Peak/paper-white calibration |
| | Brightness calibration | screen wizard | "Barely visible logo" style (games.gg, R). GTA V/RDR2: slider plus reference image (I) |
| | Safe zone | slider | Pulls the HUD in from the TV edges |
| Visual effects | Player status effects intensity | 1–5, default 5 | Screen tint and blur from low health, intoxication etc. |
| | Hit effects intensity | 1–5, default 5 | |
| | Awareness effects intensity | slider | Screen-edge warnings for police and off-screen threats |
| | Motion blur strength | 3–10 (range as reported), default 3 | |
| | Dismemberment | Off (default) / On | |
| | Blood & gore | Low / Med / High (default) | |
| | Flashbang | Bright / Dark | Photosensitivity option |
| | Focus-trail colorblind mode | Off/On | |
| | Brightness reduction | Off/On | Limits flashes and bright spikes |
| High-contrast shaders | On/Off + per-group (player, allies, threats, interactables) colour/opacity | | Outlines/tints entity groups in a near-greyscale world (games.gg) |

### 3.5 UI / HUD (by far the largest tab, about 67–70 items)
| Group | Settings (options) |
|---|---|
| Scaling & readability | Language (12 options) · UI text size (S/M/L/XL) · Colour adjustments (Off / Protan / Deutan / Tritan) · Map blip size (Default/Large) · Minimap blip size · In-world marker size |
| Subtitles & captions | Subtitles (Off / Mission only / On) · Closed captions (Off / Non-speech / Environment / On) · Size (S/M/L) · Speaker names · Background (Off / Transparent / Solid) |
| Navigation | Minimap (On / Dynamic / Off) · Compass (On / Dynamic / Off) · GPS turn indicators (On / Highways / Off) · In-world markers (On / Objectives / Off) · Door markers (On / Dynamic / Off) · Interaction markers |
| Reticle | Persistent centre dot · Hit markers · Size · Shape (Complex / Simple / Dot / None) · Equipped-reticle visibility 1–10 · Aiming-reticle visibility 1–10 · Reticle messages · Projectile arc (4 modes) |
| Combat HUD | Weapon preview · Ammo · Threat indicators · Damage-region highlights |
| HUD notifications (each on/off) | Ticker feed · Criminal profile · Relationship · Help text · Reminder tips · Objective · Mission update · Phone notifications · Area discovery · Area names · Street names |
| Progress notifications | Master toggle + Weapons / Vehicles / Animals / Collections / Stunts / Basketball / Challenges / Map updates |
| Player & vehicle status | Player vitals · Wanted level · Heat indicators · Money · Vehicle name & status |
| Prompts | In-world prompts · Prompt visibility 1–10 (default 7) · Vehicle prompt (Off / Dynamic / On) · Mini-game UI · Bottom-right prompts · Prompt pinning |
| Activities | High scoreboard · Central messages · Activity timers & stats |
| Units | Distance (Metric/Imperial) · Weight · Temperature · Clock (12h/24h) |

"Dynamic" = shown only when relevant, e.g. when moving or on change. RDR2 pioneered this at
per-element granularity (Always / Dynamic / Off for each core, radar etc.) (**I**).

### 3.6 Camera
| Group | Setting | Range / default |
|---|---|---|
| On foot | Height (Low/Med/High) · Horizontal follow speed 1–10 · Vertical follow speed 1–10 | |
| Land & water vehicles | Height (all vehicles) · Driver H/V follow speed 1–10 (default 10) · Driver follow delay (default 0) · Passenger H/V follow 1–10 (default 4) · Passenger follow delay (default 10) | Separate driver and passenger tuning |
| Comfort | Camera preference · Weapon sway On/Off · Camera shake On/Off · Camera bob 0/1–10 (default 10) · Phone display (Default / First person) | Motion-sickness controls |
| Aircraft | H/V follow speed 1–10 (5) · Follow roll On/Off · Follow-roll speed (5) · Roll dead-zone range (10) | |
| Underwater | Horizontal follow speed (2) | |
| Cinematic | Kill-shot frequency 1–5 (3) · Vehicle-crash cam frequency 1–5 (3) · Idle camera On/Off | |

GTA V baseline (**I**): field of view sliders for first and third person. First person
on-foot/vehicle toggles (ragdoll, combat roll, cover, aim). Vehicle camera auto-centre. Bonnet
(hood) camera in first person. Camera height presets per vehicle class. RDR2 adds a Cinematic
camera option with letterbox on/off and "hide HUD in cinematic".

### 3.7 Audio
| Group | Setting | Options |
|---|---|---|
| Setup | Mono audio · Tinnitus reduction (removes the ear-ringing effect) · GPS voice (On/Tones/Voice/Off) · Mute licensed music (streamer-safe) · Vehicle radio on entry (Default/On/Off) · Controller speaker routing (PS5; police radio, phone, GPS) | |
| Volume | Master · SFX · UI · Dialogue · Music · Media (radio/TV) | 1–10 each, default 10 |
| Narration | Screen narration (menu text-to-speech, English only) · Audio descriptions (cutscenes) | Off/On |

GTA V baseline (**I**): output mode (Stereo / Headphones / Surround). Dialogue boost. Interactive
music. Self Radio (custom MP3s, PC). Radio station preference on entry.

### 3.8 Account / Online / Privacy / Save
- GTA VI **Account** tab: support QR, account link status, subscription boosts, credits, legal
  docs (C). No online multiplayer at launch.
- Save/Load (**I**, GTA V/RDR2): autosave with a notifier, manual save slots via in-world
  locations (safehouse bed) or the phone. RDR2 adds a pause-menu manual save and a separate
  autosave slot. GTA VI save UX is not documented in what we found.
- Privacy (**I**): telemetry/analytics opt-in, social club sharing. Not applicable to us beyond
  "no tracking".

### 3.9 Graphics (GTA V PC baseline, I — GTA VI on console exposes none)
- **Display:** display mode (fullscreen / windowed / borderless), resolution, aspect ratio,
  refresh rate, monitor, V-sync (off/on/half), pause on focus loss.
- **Quality:** FXAA, MSAA (off/2/4/8), TXAA, population density, population variety, distance
  scaling, texture, shader, shadow, reflection, reflection MSAA, water, particles, grass quality,
  soft shadows (sharp/soft/softer/softest/AMD/NVIDIA), post FX, motion blur strength, depth of
  field, anisotropic filtering, ambient occlusion, tessellation.
- **Advanced:** long shadows, high-resolution shadows, high-detail streaming while flying,
  extended distance scaling, extended shadow distance, frame scaling (resolution scale).
- **Enhanced (2025) build adds:** ray-traced shadows/reflections/GI, DLSS/FSR/XeSS upscalers,
  frame generation (I).
- Console GTA VI: Display tab only (HDR, safe zone). Console quality/performance modes were not
  confirmed in our sources.

### 3.10 Photo mode ("Photo Studio") options (R)
Reported: free camera within a radius, depth of field / focus, aperture, filters (about 17),
lighting rigs, frames/borders. **No time-of-day or weather change.** Characters cannot be moved
or posed; posing happens on the phone selfie camera (about 6 poses, about 7 expressions). RDR2
baseline (**I**): FOV, roll, exposure, contrast, saturation, vignette, grain, letterbox, pause
NPC/time, hide player, frame advance.

---

## 4. Patterns worth adopting

1. **Hold vs tap on one button.** Tap = primary action, hold = secondary/radial: LB tap
   holsters, hold opens the wheel. D-pad tap = signal, hold = menu. Make the hold threshold a
   **setting** (Hold Delay 0–250%) and let **Hold Assist** divide it. Every hold action should
   have a **Press/toggle** alternative (Aim, Interact, Loadout).
2. **Tap assist.** Any "mash" input gets a multiplier or a hold replacement. It's cheap if all
   mashes go through one helper.
3. **Context-sensitive reuse.** The same physical button means "the obvious verb here":
   Y/△ = interact, enter or exit. A/✕ = jump on foot, handbrake in a car. Prompt text changes
   with context.
4. **Ergonomic regrouping (VI vs V).** Sprint on L3 ends thumb-mashing. Handbrake on A frees the
   shoulders for aim/fire while driving. Turn signals on D-pad tap give "role-play" driving.
   **This affects our planned layout:** `docs/CONTROLS.md` currently follows the GTA V
   convention (A sprint, X jump, RB handbrake). Consider the modern scheme as default and the
   older one as a "Classic" preset.
5. **Layout presets instead of console remapping**, plus **full rebinding on KB/M** (GTA V PC).
   On the web, add pad remapping too. It is cheap because we already have an action layer.
6. **Movement-speed-by-stick setting.** A full stick runs without a click. This is good for
   touch too: push the stick to the rim to sprint, which we already do.
7. **Aim assist tiers** (Lock-on / Partial / Free) plus a separate strength slider plus separate
   "assist" toggles. Only relevant if the story team adds shooting.
8. **Stick tuning per stick:** separate dead zones (L/R), response-curve presets
   (Standard/Linear/Precision/Aggressive), separate **look vs aim** sensitivity, H/V split,
   acceleration ramp, per-context invert (look, movement, map, aircraft).
9. **Camera tuning per context:** separate on-foot, driver, passenger, aircraft and underwater
   follow speeds, delay and height. Comfort group: shake, bob, sway, motion blur, and an option
   to minimise auto-cinematic interruptions.
10. **Dynamic HUD elements.** Each element is On / Dynamic / Off. Notification families can be
    toggled one by one. "Mission only" subtitles. Closed captions graded by category.
11. **Visual accessibility built as shader parameters:** colourblind UI palettes (Protan / Deutan
    / Tritan), high-contrast entity outlines, brightness-spike reduction, text size presets with
    blip/marker scaling.
12. **Auto-drive to waypoint in cinematic camera.** It's an accessibility feature and also a
    "sightseeing" feature. It fits a 1974-Manhattan cruising game very well (taxi-ride feel).
13. **Glyphs follow the last used device.** This is implied by consoles and standard in Rockstar
    PC ports. We already do it. Keep KB/M prompts showing actual bound keys after rebinding.
14. **Vibration as a single 0–10 strength**, plus platform-specific extras. On the web, rumble
    is available through `vibrationActuator` in Chromium. Adaptive triggers and the light bar
    are not available on the web: out of scope.
15. **Restore defaults** for each tab and for everything.

---

## 5. Scope assessment for Tenderloin '74

Phases: **2** player+camera · **3** rendering · **4** vehicles · **5** traffic/peds/audio ·
**6** weather/day-night/polish · **7** narrative hooks. No combat or weapons are designed yet,
and there is no online mode.

### 5.1 Control contexts

| Context / action group | Priority | Phase | Touch: on-screen button needed? | Notes |
|---|---|---|---|---|
| On-foot move / look | Must | 2 | Floating L stick + R drag (exists) | |
| Sprint (+ "full stick = run" option) | Must | 2 | No. Stick to rim = sprint (exists) | Default to L3 (modern). A = Classic preset |
| Walk toggle / gait | Should | 2 | No (stick deflection) | |
| Jump / climb / vault | Must | 2 | **Yes** (JUMP) | |
| Crouch / stealth | Later | 7 | Yes, if added | Only if narrative needs stealth |
| Interact / talk / enter-exit vehicle | Must | 2 (interact), 4 (vehicle) | **Yes**, one contextual button whose label changes | Hold/Press option |
| Look behind | Should | 2 | Yes (small) or a swipe | |
| Camera cycle (near/far/first person) | Should | 2 | **Yes** (CAM) | First person is cheap for us; GTA VI lacks it |
| Map | Must | 2 | **Yes** (MAP) | |
| Pause / settings | Must | 2 | **Yes** (II) | |
| Phone / notebook | Later | 7 | Yes | Period device: payphones, notebook, pager-free 1974 → diegetic substitute |
| Photo mode | Should | 6 | Yes, in the pause menu | Fly-cam base exists |
| Melee / aim / fire / cover / weapon wheel / reload | **Out of scope until the story team decides** | 7+ | Would need 3–4 buttons | Reserve RT/LT/RB/LB, R/LMB/RMB/Q/Tab in the binding map |
| Driving: steer, accel, brake/reverse | Must | 4 | **Yes**: pedals (2 buttons) + steer stick or tilt | |
| Handbrake | Must | 4 | **Yes** | |
| Enter/exit vehicle | Must | 4 | Shared contextual button | |
| Horn | Must | 4 | **Yes** | Period flavour (NYC taxis) |
| Headlights | Should | 6 | Yes (small) | Matters once day-night exists |
| Turn signals | Later | 6 | No (auto, or skip) | Nice role-play touch |
| Radio next/prev + radio wheel | Should | 5 | **Yes** (RADIO tap = next) | Period stations need licensing or original music |
| Vehicle camera / cinematic cam | Should | 4 | Shared CAM button | |
| Look behind in vehicle | Should | 4 | Shared | |
| Auto-drive to waypoint | Later | 6 | Yes (in cinematic cam) | Needs traffic AI from Phase 5 |
| Drive-by | Out of scope | — | — | No combat |
| Bikes / boats / aircraft / swim | Out of scope (v1) | — | — | Maybe subway/ferry as scripted rides later |
| Character switch / online | Out of scope | — | — | |
| Menu navigation (D-pad/stick, A/B, LB/RB tabs) | Must | 2 | Native touch UI | |

### 5.2 Settings categories

| Category | Priority | Phase | Items for our v1 (suggested) |
|---|---|---|---|
| Controls: layout presets (Default / Classic / Left-handed) | Should | 2 | 3 presets |
| Controls: KB/M full rebinding | Must | 2 (on-foot), 4 (vehicle) | Primary + secondary key for each action |
| Controls: gamepad remap | Should | 4 | Per-action remap on the standard mapping |
| Gamepad tuning: look sens H/V, curve preset, L/R dead zones, invert per context, acceleration | Must (sens, curve, dead zones, invert Y) / Should (H/V split, accel) | 2 | Partly exists |
| Mouse: sensitivity, invert, raw/smoothing | Must | 2 | Exists |
| Touch: look sensitivity, button size/opacity, left-handed swap, steering mode (stick/tilt/buttons) | Must (sens, size) / Should (rest) | 2 / 4 | |
| Vibration on/off + strength | Must | 2 | Exists |
| Hold/press toggles, hold delay, tap assist | Should | 2 | Cheap if the action layer centralises it |
| Camera: on-foot height/follow speed, vehicle follow/delay, FOV, shake, bob, motion blur | Must (FOV, shake) / Should (rest) | 2 / 4 | |
| Display: brightness calibration, safe zone / UI scale, resolution scale, FPS cap, fullscreen | Must | 3 | |
| Graphics: quality preset + shadows, view distance, AO, AA, population density, post FX | Must (preset + 4–6 knobs) | 3 / 5 | Population density in Phase 5 |
| Audio: master/SFX/music/dialogue/radio/UI volumes, mono, radio-on-entry, mute licensed music | Must (volumes) / Should (rest) | 5 | |
| Subtitles: on/off/mission-only, size, background, speaker names, captions | Must | 5 (ambient dialogue) / 7 | Subtitle size exists |
| Language | Later | 7 | English only for v1 |
| HUD: minimap on/dynamic/off, compass, street names, area names, help text, notifications | Must (minimap, help text) / Should (rest) | 2 / 6 | "Dynamic" mode is cheap |
| Accessibility visuals: colourblind UI palette, text size, high contrast, flash reduction | Should | 6 | |
| Gameplay assists: auto-drive, reduced vehicle damage, simplified mini-games | Later | 6 / 7 | |
| Aim assist / combat settings | Out of scope | — | Reserve the schema key |
| Units (imperial default for 1974 NYC; metric option), 12/24h clock | Should | 6 | |
| Photo mode options (FOV, DoF, exposure, filters, hide HUD, freeze time) | Should | 6 | |
| Save/Load: autosave + 3 slots, settings persisted separately | Must (settings persist) / Should (game saves) | 2 / 7 | |
| Online/privacy/account | Out of scope | — | No telemetry |
| Restore defaults per tab / all | Must | 2 | |

### 5.3 Counts (for estimation)

- **GTA VI settings counted:** about **160** individual settings. Control Scheme 1 · Controller
  about 18 (incl. PS5 extras) · Gameplay 25 (+1 R) · Display 12 · UI 67 · Camera 24 · Audio 14 ·
  Account (links only). This matches Notebookcheck's 25/12/70/24/14.
- **GTA VI distinct bindable actions** (by context, counting shared buttons once per context):
  about **60–70** across on foot (about 22), aiming/melee (about 8), driving (about 14),
  aircraft/bike/swim/parachute (about 15), phone/photo (about 8). GTA V PC's rebind screen lists
  **about 150+** actions.
- **Our proposed v1:** about **28 bindable actions**. On foot 11: move, look, sprint, walk
  toggle, jump, interact/enter, look behind, camera cycle, map, pause, photo. Vehicle 12: steer,
  accelerate, brake/reverse, handbrake, horn, headlights, exit, radio next/prev/wheel, camera,
  look behind, cinematic. Menu 5: navigate, confirm, back, tab left/right. About **8–9 touch
  buttons** at once at most (JUMP, ACT, CAM, MAP, PAUSE on foot; GAS, BRAKE, HANDBRAKE, HORN,
  RADIO, LIGHTS in a car; the context button is shared).
- **Our proposed v1 settings:** about **45–55** (Controls about 14, Camera about 8, Display +
  Graphics about 12, Audio about 8, Subtitles/HUD about 10, Accessibility about 5), plus the
  rebind table.

---

## 6. Sources

GTA VI (post-launch unless noted):
- Rockstar Support, "How to change Grand Theft Auto VI settings" (updated 2026-11-18; 503 when
  fetched): https://support.rockstargames.com/articles/4jUHNdP22SmaKSF8DWqhXC/how-to-change-grand-theft-auto-vi-settings
- Player.One summary of that page (2026-11-18): https://www.player.one/gta-6-confirms-high-contrast-shaders-camera-comfort-settings-theyre-spread-across-different-164539
- DayOne, all in-game options (2026-11-18): https://playday.one/2026/11/18/all-in-game-options-in-gta-6/
- games.gg accessibility guide (2026-11-19): https://games.gg/grand-theft-auto-vi/guides/grand-theft-auto-6-accessibility-settings-guide/
- games.gg driving guide (2026-11-19/23): https://games.gg/grand-theft-auto-vi/guides/grand-theft-auto-6-driving-guide-controls-handling/
- Beebom controller settings (2026-11-20): https://beebom.com/gta-6-best-controller-settings/
- wikily.gg controls (2026-11-18, mod. 11-25): https://wikily.gg/gta-6/controls
- Engadget camera views (2026-11-19): https://www.engadget.com/2321960/gta-6-how-to-switch-camera-views/
- Dexerto control change (pre-launch, 2026-09-01): https://www.dexerto.com/gta/gta-6-makes-huge-change-to-iconic-controls-that-might-save-controllers-3404705/
- Notebookcheck, assist/option counts (not fetched, 403; counts from search snippet): https://notebookcheck.net/GTA-6-offsets-cheat-code-restrictions-with-more-easy-modes.1454752.0.html
- Auto-drive guides: https://beebom.com/how-to-auto-drive-in-gta-6/ , https://playday.one/2026/11/19/how-to-auto-drive-gta-6/
- Photo mode / selfie: https://beebom.com/gta-6-photo-mode/ , https://roonby.com/2026/11/19/gta-6-selfie-guide-how-to-take-photos-use-filters-and-access-photo-studio/amp/
- First person: https://www.keengamer.com/articles/guides/can-you-play-gta-6-in-first-person-mode/
- Character switching (pre-launch): https://www.gamesradar.com/games/grand-theft-auto/gta-6-wont-let-you-switch-between-lucia-and-jason-whenever-you-want-because-it-would-be-unnatural-for-story-progression/
- Launch/reviews: https://www.aljazeera.com/news/2026/11/19/grand-theft-auto-vi-launches-to-rave-reviews-after-13-year-wait

Baseline (GTA V / RDR2):
- GTA V PC keybind categories: https://www.gamepressure.com/gtav/pc-keybinds/z3764b
- GTA V controls overview: https://www.bisecthosting.com/blog/gta-v-controls-guide-pc-playstation-xbox-keyboard-mouse-gamepad
- RDR2 Tap Assist (Rockstar Support): https://support.rockstargames.com/en-US/articles/iHuafuI6D4LVge59s82oh/enabling-the-tap-assist-accessibility-settings-in-red-dead-redemption-2
- RDR2 accessibility: https://www.gamepressure.com/red-dead-redemption-2/accessibility/z110448 ,
  https://www.familygamingdatabase.com/accessibility/Red+Dead+Redemption+2 ,
  Can I Play That RDR2 review: https://caniplaythat.com/2019/02/19/deaf-game-review-red-dead-redemption-2/
- GTA V PC graphics and KB/M default keys are listed from the researcher's knowledge of the
  shipped PC menus (2015 to 2025 Enhanced). They were not re-verified page by page in this pass
  and are marked **I**.
