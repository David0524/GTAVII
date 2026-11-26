# Design: touch controls (on foot, combat, driving)

The user: *"I think our controls may be messy. Especially for driving and shooting."* This design is
based on a cited survey of mobile games: the GTA mobile ports, Gangstar Vegas, MadOut2, Call of Duty
Mobile, PUBG Mobile, Free Fire, Fortnite mobile, Genshin Impact, Asphalt 9, Real Racing 3 and Mario
Kart Tour. User decisions: **analog gas and brake pedals are the driving default** (auto-accelerate
is a setting), and the **UI chat owns the touch layout end to end.**

## What the research says (sources are in the oversight report)
- The best schemes **assist by default and let experts opt out**: CoD Mobile's Simple fire mode,
  Fortnite's Auto Fire, Asphalt's TouchDrive, Mario Kart Tour's auto-accelerate and smart steering.
- **Lock-on and tap-to-target beat free aim on touch** (Gangstar, the GTA ports' auto-lock). No
  targeting at all was criticised (Chinatown Wars).
- **Contextual buttons:** show only what this state needs (Free Fire and PUBG show fire buttons
  only while scoped).
- **Layout editors are near-universal** (CoD, Fortnite, PUBG, the Rockstar ports). Genshin
  lacking one draws complaints.
- **Tilt is never the default** ("awful", PocketGamer on Asphalt).
- **Driving is the weak point of every mobile open-world crime game** ("awful", "sloppy and
  stiff", "never completely tight"). Doing it well sets us apart.

## Layout: at most 6 visible elements per state, left thumb moves, right thumb acts
**On foot**
| Element | Zone | Notes |
|---|---|---|
| Floating move stick | Left | Push to the rim to sprint (stamina applies) |
| Look drag area | Right, the rest of the screen | Gyro off by default |
| **Context action** (large) | Right | One button: talk, door, pick up, enter vehicle, take cover, pay off a cop. Its label changes with context, and it replaces separate buttons |
| Jump / climb | Right | |
| Weapon | Right | Only when you have one. Tap to draw or holster; hold for the wheel (only what your outfit conceals) |
| Menu / map | Top corner | Small, inside the safe area |

**Combat** (when a weapon is drawn or you're under fire)
| Element | Zone | Notes |
|---|---|---|
| Move stick | Left | |
| **Fire** (large) | Right | Default **auto-fire when on target**; options: tap anywhere or dedicated button |
| Aim drag and **tap-to-lock** | Right area | Tap an enemy to lock on, swipe to switch target, soft aim assist |
| Cover / roll | Right | Contextual: cover near cover, roll otherwise |
| Reload / swap | Right | Tap to reload, swipe to swap |
| (Context action) | Right | Only when relevant (surrender, take a hostage, pick up a dropped gun) |

**Driving**
| Element | Zone | Notes |
|---|---|---|
| **Analog steering stick** | Left | Light steering assist on by default (smoothing, counter-steer help); stick, arrows or tilt in settings |
| **Gas pedal** (large) | Right | **Analog: slide your thumb up the pedal for more throttle.** Precise creeping, stopping at lights, parking |
| Brake / reverse | Right | Analog the same way; hold at a stop to reverse |
| Handbrake | Right | Hold to slide |
| Exit / horn | Right | Tap to exit (the same spot as on-foot "enter"); long-press for the horn |
| Drive-by fire | Right | Only when armed. Auto-aim to the side you're looking |
The camera auto-follows; drag on empty screen to look around, and it springs back.

## Rules
- Buttons sit in the thumb zones, inside the safe-area insets (notch and home indicator), with
  targets of at least 48 px and the primary buttons bigger.
- **Stable positions across states:** the context, enter and exit spot and the fire and gas spot
  don't move, so muscle memory carries over.
- Transitions animate (about 150 ms), never pop; a button that's leaving fades out.
- Haptics: light taps for lock-on, reload and impacts (where supported), with a toggle.
- Everything still maps to the same Input actions, so pad and keyboard are unaffected.

## Settings
Layout editor per state (move, resize, opacity, reset, presets); fire mode (auto, tap anywhere or
button); aim assist strength; gyro aim (off, aiming only, always; it turns aim assist off, as
Fortnite does); steering mode (stick, arrows, tilt) and assist on/off; **auto-accelerate (off by
default)**; sensitivity per state; haptics; a left-handed mirror; button scale; hold vs toggle.

## Owners
- **UI:** owns the touch layout, the states and transitions, the layout editor and the settings
  screens.
- **Engine:** Input actions, including analog pedal values, and safe areas.
- **Gameplay:** lock-on, aim assist and the auto-fire rules.
- **Vehicles:** pedal mapping and steering assist in the physics.
- **Characters:** the cover and roll animations that the context button triggers.

## Done means
Phone-landscape screenshots of all three states, plus the layout editor; a touch-only run through
an on-foot → fight → steal a car → drive → park sequence in the test scenes; and an honest critique.
