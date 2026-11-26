# Controls

The game plays on **keyboard and mouse**, **Xbox and PlayStation controllers** (any controller
the browser exposes with the standard Gamepad mapping), and **touch in landscape**. All devices
feed one action layer (`src/input/Input.ts`), so every gameplay system supports every device
automatically.
- **Switching devices:** pick up whichever device you like. On-screen prompts switch to its
  glyphs, and touch controls hide while a controller is in use.
- **Hot-plug:** controllers can be plugged in or out at any time, and a toast confirms it.
- **Vibration:** dual-rumble where the browser supports it (Chromium-based browsers over USB
  or Bluetooth).

## Phase 1 (free camera)
| Action | Keyboard / mouse | Xbox | PlayStation | Touch |
|---|---|---|---|---|
| Move | WASD | Left stick | Left stick | Left-thumb floating stick |
| Look | Mouse (click to capture) | Right stick | Right stick | Right-thumb drag |
| Up / down (analog on pads) | E / Q | RT / LT | R2 / L2 | UP / DOWN buttons |
| Fast | Shift | A or L3 | ✕ or L3 | FAST button, or stick pushed to the rim |
| Speed adjust | Mouse wheel | — | — | — |
| Debug HUD | F3 or ` | D-pad up | D-pad up | HUD button |
| Pause *(menu arrives with the UI pass)* | Esc | Menu | Options | — |

## Planned on-foot and vehicle layout (Phases 2 and 4)
These follow the conventions open-world players already have in their hands. The research
reference in `docs/research/` informs the full list.

| Action | Keyboard / mouse | Xbox | PlayStation |
|---|---|---|---|
| Sprint (tap or hold) | Shift | A | ✕ |
| Jump / climb | Space | X | □ |
| Enter / exit vehicle, interact | F | Y | △ |
| Map | M | View | Create |
| Photo mode | P | R3 | R3 |
| Accelerate / brake-reverse | W / S | RT / LT | R2 / L2 |
| Handbrake | Space | RB | R1 |
| Horn | E | L3 | L3 |

## Settings that already exist (`src/settings/Settings.ts`)
These are saved per device. The pause-menu settings screen will expose them.
- **Gamepad:** look sensitivity, response curve, radial dead zone, invert Y, vibration on/off
  and strength.
- **Mouse:** sensitivity, invert Y.
- **Touch:** look sensitivity.
- **Display:** FOV.
- **Interface:** HUD, subtitles and subtitle size, and button-prompt style (auto, Xbox,
  PlayStation or keyboard).

## Implementation notes
- **Stick look** is rate-based: up to 2.8 rad/s of yaw at sensitivity 1, with a power
  response curve (default 1.8) for fine control near the centre.
- **Dead zones** are radial with rescale (default 0.14), so diagonals aren't clipped.
- **Controller families** are recognised from the browser's controller id string:
  PlayStation by vendor 054c, DualSense or DualShock; Xbox by vendor 045e or XInput. Other
  controllers use Xbox-style prompts.
- **Button glyphs** are generic shapes and letters drawn in CSS/SVG. No console-maker logos.
- **Tested** in headless Chromium with simulated DualSense and Xbox controllers: stick
  movement, analog triggers, prompt switching and the connect rumble.
