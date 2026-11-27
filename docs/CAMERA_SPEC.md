# Third-person camera: spec (MOVEMENT.md, VISUAL_BAR.md)

**Bar:** GTA V/VI and RDR2 on-foot cameras. That is a feel bar only; nothing is copied. The setting is 1970s Midtown:
- narrow alleys between tenements, fire-escape canyons and sidewalk sheds;
- low stoops and subway stairwells;
- crowds that brush the lens.

**Starting point:** today's engine camera is `src/camera/OrbitCamera.ts`.
- **Collision:** one centre ray. It pulls in instantly and eases out at 3/s.
- **Framing:** fixed right shoulder 0.75 m, arm 5.6 m, pitch clamp −1.1..0.75.
- **Follow:** smoothing of 16/s horizontal and 10/s vertical.

## Ownership (proposed; ENGINE_REQUESTS "From ui: 6")
- **Engine owns the code** (`src/camera/*`). The camera reads physics (rays), the player controller's state (climbing, falling, gait) and `CameraDirector` ownership. Those are engine internals.
- **UI & cinematics owns this spec, the inputs and the settings.**
  - Touch gestures: look-behind and shoulder swap.
  - Pad and keyboard bindings: the rebindable `lookBehind` and `shoulderSwap` actions.
  - The settings that tune it: `fov`, `onFootFollow`, `cameraShake`, `headBob`, plus a new `shoulderDefault` (left/right).
  - The touch layer already routes look drags through `Input.addLook`.
- **Cinematics** keeps using `CameraDirector` acquire and release. The gameplay camera keeps updating its proxy while a cinematic owns the real camera, so the hand-back blend lands on a live pose.
- **Offer:** if the engine's queue is full, I can write it as one new file (`src/camera/ThirdPersonCamera.ts`) behind the same interface as `OrbitCamera`, for the engine to review and merge. It touches nothing else.

## Behaviour

### 1. Collision in tight spaces (no clipping, no popping)
- **Probe:** a sphere cast (radius 0.22 m) along the arm, plus two side rays (±0.35 m at the camera end). Corners and fire-escape rails then don't slip between rays.
- **Pull-in** is immediate, to the nearest hit minus 0.2 m. **Ease-out** goes back at 2.5 m/s, and only after 0.25 s clear. This stops "breathing" past railings.
- **Minimum arm** 0.6 m. Below 1.0 m the player model fades to 40% opacity (a dither) so the lens never sits inside the body.
- **Alley mode:** when both side probes hit within 1.6 m (a 1970s alley or a stoop well), the shoulder offset shrinks toward 0.25 m and the pitch biases up 6°. You see over the player, not into the brick.
- **Ignore list:** small props (trash cans, hydrants, newsstand counters, pedestrians) don't pull the camera in. Only static world and parked cars do. People brush the lens and fade at under 0.5 m.

### 2. Shoulder swap
- **Input:** an action `shoulderSwap`: pad R3 (Standard preset), keyboard `C` (rebindable); touch is a two-finger tap on the look area.
- **Swap time** is 0.22 s ease-in-out on the lateral offset only. Yaw and pitch don't change.
- **Automatic swap:** when the near shoulder is blocked by a wall within 0.8 m for over 0.4 s while walking along it, the camera swaps. It never swaps while aiming, and swaps back only when the player swaps.
- **Aiming:** the shoulder tightens to 0.45 m with a 1.45 m arm, and FOV −10°. This blends over 0.18 s.

### 3. Look-behind
- **Input:** an action `lookBehind`: pad hold on L3 (or a hold binding), keyboard hold `B`; touch is a quick downward flick on the look area. Release returns.
- **The flip** is 0.18 s ease-out of yaw +180° around the player. Collision runs every frame during the flip, so walls never appear between.
- **Driving:** the camera looks out of the rear window; the touch layer's drive look drag also springs back (TOUCH_CONTROLS.md).

### 4. Rise and pull-back on climbs and falls
- **Climb or vault start** (engine state `climbing`):
  - the target rises with the hands, not the feet: target height = max(feet + 1.5, hand height + 0.2);
  - the arm extends +0.8 m and the pitch biases down 8°, so the ledge top and the next surface are in frame;
  - this blends in over 0.25 s and out over 0.4 s after mantle.
- **Fire escapes and ladders:** the arm extends +1.2 m and the pitch biases −12° (looking up the stack). Lateral follow loosens to 8/s, so rungs don't jitter the frame.
- **Falling:**
  - after 0.35 s of free fall (over about 0.6 m), the camera lags vertically (kv 10 → 4) and pulls back +1.0 m;
  - it tilts down 10° toward the landing;
  - on landing it takes a 0.12 s dip sized by impact speed, scaled by `cameraShake`;
  - a roll on landing keeps the arm until the roll ends.
- **Drops and hang-drops:** the camera holds height for 0.2 s, then follows. You see the drop before you take it.

### 5. Gait and speed
- **Arm length by speed:** walk 5.2 m, jog 5.6 m, sprint 6.4 m, with FOV +6° at sprint. Blended at 1.5/s.
- **Mobile:** follow smoothing tightens by 15% (TOUCH_CONTROLS.md: touch must never feel sluggish).
- **Head bob** is off by default on the camera (`headBob` 0.6 applies to the body only). Sprint shake is gated by `cameraShake`.

### 6. Accessibility and comfort
- `onFootFollow` scales the smoothing rates (0.1–1). `cameraShake` scales landing dips and the sprint FOV kick.
- With `reduceMotion` on: no FOV kicks, no landing dip, and the look-behind becomes a 0.3 s ease.
- The FOV setting is horizontal-safe on 19.5:9 phones (already handled in main.ts).

## Acceptance (frame strips as JPEG, per MOVEMENT.md "How it's checked")
- **No clipping:**
  - a 1,000-step random walk through the alley and stoop course;
  - camera-in-geometry checks via a point test against colliders: **zero**.
- **No pop:**
  - arm length never changes by more than 0.6 m in a frame, except an instant pull-in;
  - the frame strip shows corners and fire-escape rails.
- **Timings:** shoulder swap, look-behind and climb framing, each measured on the test course against the numbers above.
- **Phone:** the camera update stays ≤ 0.15 ms per frame on the mobile Low profile; the sphere cast plus 2 rays is cheaper than per-object checks.
