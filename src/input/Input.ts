/**
 * Device-agnostic input. Keyboard/mouse, touch and gamepads (Xbox / PlayStation / generic) all write
 * into one action state; gameplay code (fly cam now, character + vehicle controllers later) reads actions.
 *
 *   move      : x = strafe right (+), y = forward (+), magnitude 0..1 (analog on stick/touch)
 *   vertical  : -1..1 analog up/down (fly cam: RT/LT, E/Q)
 *   gas/brake : 0..1 analog pedals (pad RT/LT, touch pedals by thumb position, keys W/S as 1); the
 *               driving context (Phase 4) reads these. Touch UI writes touchPedals (TOUCH_CONTROLS.md).
 *   look      : yaw/pitch deltas in radians since last consume(); stick look is rate-based with a response curve
 *   isHeld / pressed : buttons by action name
 *   activeDevice     : last device the player touched; drives button-prompt glyphs and touch-UI visibility
 *
 * Default gamepad layout follows the open-world conventions players already know (see
 * docs/CONTROLS.md); contexts for on-foot and vehicle are added with those phases.
 */
import { GamepadState, Btn, type PadFamily } from './Gamepad';
import { settings } from '../settings/Settings';

export type ButtonAction =
  | 'rise' | 'sink' | 'sprint' | 'jump' | 'use' | 'photo' | 'map' | 'hud' | 'pause'
  | 'confirm' | 'back' | 'navUp' | 'navDown' | 'navLeft' | 'navRight' | 'tabPrev' | 'tabNext'
  // UI stream (ENGINE_RESPONSES ui 3): pockets, weapon selector, cutscene skip (hold), map waypoint
  | 'inventory' | 'weaponSelect' | 'skip' | 'waypoint'
  // camera (CAMERA_SPEC): look behind (hold), shoulder swap
  | 'lookBehind' | 'shoulderSwap'
  // combat (gameplay contract §3): aim / fire (mouse buttons, pad triggers on foot), reload, melee, cover, lock-on
  | 'aim' | 'fire' | 'reload' | 'melee' | 'cover' | 'lock';
export type Device = 'kbm' | 'touch' | PadFamily;

const KEYMAP: Record<string, ButtonAction> = {
  KeyE: 'rise', Space: 'jump', KeyQ: 'sink', ControlLeft: 'sink', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyF: 'use', KeyP: 'photo', KeyM: 'map', F3: 'hud', Backquote: 'hud', Escape: 'pause',
  Enter: 'confirm', Backspace: 'back', ArrowUp: 'navUp', ArrowDown: 'navDown', ArrowLeft: 'navLeft', ArrowRight: 'navRight',
  BracketLeft: 'tabPrev', BracketRight: 'tabNext',
  KeyI: 'inventory', Tab: 'weaponSelect', KeyX: 'waypoint', KeyB: 'lookBehind', KeyC: 'shoulderSwap',
  Mouse0: 'fire', Mouse2: 'aim', KeyR: 'reload', KeyV: 'melee', KeyT: 'lock',
};
/** Keys that also trigger a second action (a key may serve gameplay and a context like cutscenes). */
const KEY_EXTRA: Record<string, ButtonAction[]> = { Space: ['skip'], Enter: ['skip'], KeyQ: ['cover'] };

/** Default keyboard binding per action (derived from KEYMAP; the settings screen shows and edits these). */
export const DEFAULT_KEYS: Partial<Record<ButtonAction, string[]>> = {};
for (const [code, a] of Object.entries(KEYMAP)) (DEFAULT_KEYS[a] ??= []).push(code);
for (const [code, as] of Object.entries(KEY_EXTRA)) for (const a of as) (DEFAULT_KEYS[a] ??= []).push(code);
/** Actions the player may rebind (menu navigation stays fixed so a bad binding can always be undone). */
export const REBINDABLE: ButtonAction[] = ['sprint', 'jump', 'use', 'photo', 'map', 'pause', 'inventory', 'weaponSelect', 'waypoint', 'skip', 'rise', 'sink', 'hud', 'lookBehind', 'shoulderSwap', 'aim', 'fire', 'reload', 'melee', 'cover', 'lock'];

/** Effective code -> actions map: defaults, with any action the player rebound taking only its new keys. */
function buildKeymap(bindings: Record<string, { keys: string[]; pad: number[] }>): Map<string, ButtonAction[]> {
  const m = new Map<string, ButtonAction[]>();
  for (const [a, codes] of Object.entries(DEFAULT_KEYS) as [ButtonAction, string[]][]) {
    const b = bindings[a];
    for (const code of b && b.keys.length ? b.keys : codes) { const l = m.get(code) ?? []; if (!l.includes(a)) l.push(a); m.set(code, l); }
  }
  return m;
}

/** Gamepad button -> actions per preset (docs/CONTROLS.md). A button may serve gameplay and menus;
 *  context decides which action is read. Menu navigation is identical across presets. */
const MENU_PAD: [Btn, ButtonAction][] = [
  [Btn.A, 'confirm'], [Btn.B, 'back'], [Btn.Up, 'navUp'], [Btn.Down, 'navDown'], [Btn.Left, 'navLeft'], [Btn.Right, 'navRight'],
  [Btn.LB, 'tabPrev'], [Btn.RB, 'tabNext'], [Btn.Menu, 'pause'], [Btn.View, 'map'], [Btn.Up, 'hud'],
  [Btn.Down, 'inventory'], [Btn.LB, 'weaponSelect'], [Btn.A, 'skip'], [Btn.X, 'waypoint'],
  [Btn.Right, 'shoulderSwap'], // L3/R3 (CAMERA_SPEC's proposal) are sprint/photo in the presets; D-pad Right in gameplay
];

/** Preset bundle with the player's per-action pad overrides applied (an overridden action keeps only its new buttons). */
function padMap(preset: [Btn, ButtonAction][], bindings: Record<string, { keys: string[]; pad: number[] }>): [Btn, ButtonAction][] {
  const out = preset.filter(([, a]) => !(bindings[a]?.pad.length));
  for (const [a, b] of Object.entries(bindings)) for (const btn of b.pad) out.push([btn as Btn, a as ButtonAction]);
  return out;
}
export const PAD_PRESETS: Record<'standard' | 'classic' | 'lefthanded', [Btn, ButtonAction][]> = {
  standard: [[Btn.L3, 'sprint'], [Btn.A, 'jump'], [Btn.Y, 'use'], [Btn.R3, 'photo'], [Btn.X, 'reload'], [Btn.B, 'melee'], [Btn.RB, 'cover'], ...MENU_PAD],
  classic: [[Btn.A, 'sprint'], [Btn.X, 'jump'], [Btn.Y, 'use'], [Btn.R3, 'photo'], [Btn.B, 'reload'], [Btn.RB, 'melee'], [Btn.Down, 'cover'], ...MENU_PAD],
  // left-handed: same face buttons as standard; sticks (and stick clicks) are swapped in poll()
  lefthanded: [[Btn.R3, 'sprint'], [Btn.A, 'jump'], [Btn.Y, 'use'], [Btn.L3, 'photo'], [Btn.X, 'reload'], [Btn.B, 'melee'], [Btn.LB, 'cover'], ...MENU_PAD],
};

const MAX_YAW_RATE = 2.8; // rad/s at full stick, sensitivity 1
const MAX_PITCH_RATE = 1.9;

export class Input {
  readonly move = { x: 0, y: 0 };
  vertical = 0;
  readonly look = { yaw: 0, pitch: 0 };
  readonly pad = new GamepadState();
  activeDevice: Device;
  private deviceListeners = new Set<(d: Device) => void>();
  private held = new Set<ButtonAction>();
  private edges = new Set<ButtonAction>();
  private keys = new Set<string>();
  private trigHeld = { lt: false, rt: false };
  /** Analog move written by the touch stick; combined with keys/pad each frame. */
  readonly touchMove = { x: 0, y: 0 };
  readonly touchHeld = new Set<ButtonAction>();
  /** Analog pedal values written by the touch driving UI (0..1 from thumb position on each pedal). */
  readonly touchPedals = { gas: 0, brake: 0 };
  gas = 0;
  brake = 0;
  /** Vehicles request 12 naming: throttle = gas (0..1); steer = move.x (-1..1). */
  get throttle() { return this.gas; }
  get steer() { return this.move.x; }
  isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  wheel = 0;
  private keymap = buildKeymap(settings.get('bindings'));
  private padmap: [Btn, ButtonAction][] = [];
  private padPreset = '';

  constructor(private dom: HTMLElement) {
    this.activeDevice = this.isTouch ? 'touch' : 'kbm';
    settings.subscribe((_s, k) => { if (k === 'bindings') { this.keymap = buildKeymap(settings.get('bindings')); this.padPreset = ''; } if (k === 'controlPreset') this.padPreset = ''; });
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) for (const a of this.keymap.get(e.code) ?? []) this.edges.add(a);
      this.keys.add(e.code);
      if (e.code === 'F3' || e.code === 'Escape' || e.code === 'Tab') e.preventDefault();
      this.setDevice('kbm');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touchHeld.clear(); this.touchMove.x = this.touchMove.y = 0; this.touchPedals.gas = this.touchPedals.brake = 0; });
    dom.addEventListener('click', () => { if (this.activeDevice === 'kbm' && document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      const k = 0.0022 * settings.get('mouseSensitivity');
      this.addLook(-e.movementX * k, -e.movementY * k * (settings.get('mouseInvertY') ? -1 : 1));
      this.setDevice('kbm');
    });
    // mouse buttons as keys ('Mouse0' fire, 'Mouse2' aim) while the pointer is locked to the game
    dom.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== dom) return;
      const code = `Mouse${e.button}`; if (!this.keys.has(code)) for (const a of this.keymap.get(code) ?? []) this.edges.add(a);
      this.keys.add(code); this.setDevice('kbm');
    });
    window.addEventListener('mouseup', (e) => this.keys.delete(`Mouse${e.button}`));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.setDevice('touch'); });
    this.pad.onConnect = (fam) => this.setDevice(fam);
    this.pad.onDisconnect = () => this.setDevice(this.isTouch ? 'touch' : 'kbm');
  }

  onDeviceChange(cb: (d: Device) => void) { this.deviceListeners.add(cb); return () => this.deviceListeners.delete(cb); }
  private setDevice(d: Device) {
    if (d === this.activeDevice) return;
    this.activeDevice = d;
    if (d !== 'kbm' && document.pointerLockElement === this.dom) document.exitPointerLock?.();
    for (const l of this.deviceListeners) l(d);
  }
  /** Which glyph set prompts should use (respects the settings override). */
  get promptStyle(): 'xbox' | 'playstation' | 'keyboard' | 'touch' {
    const o = settings.get('buttonPrompts');
    if (o !== 'auto') return o;
    const d = this.activeDevice;
    return d === 'kbm' ? 'keyboard' : d === 'touch' ? 'touch' : d === 'playstation' ? 'playstation' : 'xbox';
  }

  addLook(dyaw: number, dpitch: number) { this.look.yaw += dyaw; this.look.pitch += dpitch; }
  tap(a: ButtonAction) { this.edges.add(a); }

  /** Call once per frame before gameplay reads the state. */
  poll(dt: number) {
    const s = settings.data;
    this.pad.poll(s.padDeadzone);
    if (this.pad.active) this.setDevice(this.pad.family);
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const lefty = s.controlPreset === 'lefthanded';
    const ls = lefty ? this.pad.rs : this.pad.ls, rs = lefty ? this.pad.ls : this.pad.rs;
    x += this.touchMove.x + ls[0];
    y += this.touchMove.y - ls[1];
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    this.move.x = x; this.move.y = y;

    // Stick look: rate-based, response curve keeps fine aim near centre and fast turns at the rim.
    const [rx, ry] = rs;
    const mag = Math.hypot(rx, ry);
    if (mag > 0) {
      const curved = Math.pow(mag, s.padLookCurve) / mag;
      this.addLook(-rx * curved * MAX_YAW_RATE * s.padLookSensitivity * dt, -ry * curved * MAX_PITCH_RATE * s.padLookSensitivity * dt * (s.padInvertY ? -1 : 1));
    }

    this.held.clear();
    for (const code of k) for (const a of this.keymap.get(code) ?? []) this.held.add(a);
    for (const a of this.touchHeld) this.held.add(a);
    if (this.padPreset !== s.controlPreset) { this.padPreset = s.controlPreset; this.padmap = padMap(PAD_PRESETS[s.controlPreset] ?? PAD_PRESETS.standard, s.bindings); }
    for (const [b, a] of this.padmap) { if (this.pad.down(b)) this.held.add(a); if (this.pad.pressed(b)) this.edges.add(a); }
    // pad triggers: aim (LT) and fire (RT) on foot; the driving context reads them as pedals instead (gas/brake)
    if (this.pad.lt > 0.5) { if (!this.trigHeld.lt) this.edges.add('aim'); this.held.add('aim'); }
    if (this.pad.rt > 0.5) { if (!this.trigHeld.rt) this.edges.add('fire'); this.held.add('fire'); }
    this.trigHeld.lt = this.pad.lt > 0.5; this.trigHeld.rt = this.pad.rt > 0.5;

    const kv = (this.held.has('rise') || this.held.has('jump') ? 1 : 0) - (this.held.has('sink') ? 1 : 0);
    this.vertical = Math.max(-1, Math.min(1, kv + this.pad.rt - this.pad.lt));
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    this.gas = clamp01(Math.max(this.pad.rt, this.touchPedals.gas, k.has('KeyW') || k.has('ArrowUp') ? 1 : 0));
    this.brake = clamp01(Math.max(this.pad.lt, this.touchPedals.brake, k.has('KeyS') || k.has('ArrowDown') ? 1 : 0));
  }
  isHeld(a: ButtonAction) { return this.held.has(a); }
  pressed(a: ButtonAction) { const p = this.edges.has(a); this.edges.delete(a); return p; }
  consumeLook() { const l = { ...this.look }; this.look.yaw = this.look.pitch = 0; return l; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.edges.clear(); }

  /** Feedback rumble scaled by the player's settings. */
  rumble(strong: number, weak: number, ms: number) {
    const s = settings.data; if (!s.padVibration) return;
    this.pad.rumble(strong * s.padVibrationStrength, weak * s.padVibrationStrength, ms);
  }
}
