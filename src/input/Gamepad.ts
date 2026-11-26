/**
 * Gamepad layer over the browser Gamepad API ("standard" mapping): Xbox, PlayStation (DualShock 4,
 * DualSense) and generic XInput pads. Handles hot-plug, family detection (for button glyphs),
 * radial dead zones with rescale, response curves, button edges, and dual-rumble vibration.
 *
 * Standard mapping indices:
 *   0 A/Cross  1 B/Circle  2 X/Square  3 Y/Triangle  4 LB/L1  5 RB/R1  6 LT/L2  7 RT/R2
 *   8 View/Create  9 Menu/Options  10 L3  11 R3  12 Up 13 Down 14 Left 15 Right  16 Guide/PS
 */
export type PadFamily = 'xbox' | 'playstation' | 'generic';
export const enum Btn { A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, LT = 6, RT = 7, View = 8, Menu = 9, L3 = 10, R3 = 11, Up = 12, Down = 13, Left = 14, Right = 15, Home = 16 }

export function padFamily(id: string): PadFamily {
  const s = id.toLowerCase();
  if (/054c|dualsense|dualshock|playstation|wireless controller|ps[345]/.test(s)) return 'playstation';
  if (/045e|xbox|xinput|microsoft/.test(s)) return 'xbox';
  return 'generic';
}

/** Radial dead zone with rescale so output starts at 0 just outside the zone and reaches 1 at the rim. */
export function radial(x: number, y: number, dz: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

export class GamepadState {
  connected = false;
  family: PadFamily = 'generic';
  id = '';
  index = -1;
  readonly ls: [number, number] = [0, 0];
  readonly rs: [number, number] = [0, 0];
  lt = 0; rt = 0;
  private now: boolean[] = new Array(17).fill(false);
  private prev: boolean[] = new Array(17).fill(false);
  /** True if any input moved this frame (used to switch the active device / prompt glyphs). */
  active = false;
  private pad: Gamepad | null = null;
  onConnect?: (family: PadFamily, id: string) => void;
  onDisconnect?: () => void;

  constructor() {
    window.addEventListener('gamepadconnected', (e) => this.adopt((e as GamepadEvent).gamepad));
    window.addEventListener('gamepaddisconnected', (e) => {
      if ((e as GamepadEvent).gamepad.index !== this.index) return;
      this.connected = false; this.index = -1; this.pad = null; this.onDisconnect?.();
      this.adoptFirst();
    });
  }

  private adopt(g: Gamepad) {
    if (this.connected && this.index !== g.index) return; // first connected pad drives the game
    const fresh = !this.connected;
    this.connected = true; this.index = g.index; this.id = g.id; this.family = padFamily(g.id); this.pad = g;
    if (fresh) this.onConnect?.(this.family, g.id);
  }
  private adoptFirst() { for (const g of navigator.getGamepads?.() ?? []) if (g && g.connected) { this.adopt(g); break; } }

  /** Read the pad once per frame. Some browsers only expose pads after a button press. */
  poll(deadzone: number) {
    if (!this.connected) this.adoptFirst();
    const g = this.connected ? navigator.getGamepads?.()[this.index] : null;
    [this.prev, this.now] = [this.now, this.prev];
    this.active = false;
    if (!g) { this.now.fill(false); this.ls[0] = this.ls[1] = this.rs[0] = this.rs[1] = this.lt = this.rt = 0; return; }
    this.pad = g;
    for (let i = 0; i < 17; i++) {
      const b = g.buttons[i];
      this.now[i] = !!b && (b.pressed || b.value > 0.5);
      if (this.now[i] !== this.prev[i]) this.active = true;
    }
    this.lt = g.buttons[6]?.value ?? 0; this.rt = g.buttons[7]?.value ?? 0;
    const [lx, ly] = radial(g.axes[0] ?? 0, g.axes[1] ?? 0, deadzone);
    const [rx, ry] = radial(g.axes[2] ?? 0, g.axes[3] ?? 0, deadzone);
    this.ls[0] = lx; this.ls[1] = ly; this.rs[0] = rx; this.rs[1] = ry;
    if (lx || ly || rx || ry || this.lt > 0.1 || this.rt > 0.1) this.active = true;
  }

  down(b: Btn) { return this.now[b]; }
  pressed(b: Btn) { return this.now[b] && !this.prev[b]; }
  released(b: Btn) { return !this.now[b] && this.prev[b]; }

  /** Dual-rumble where supported (Chromium; DualSense/Xbox over USB/Bluetooth). Silently no-ops elsewhere. */
  rumble(strong: number, weak: number, ms: number) {
    const act = (this.pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    act?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
  }
}
