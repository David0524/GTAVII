/**
 * Device-agnostic input. Keyboard/mouse and touch both write into one action state;
 * gameplay code (fly cam now, character + vehicle controllers later) only reads actions.
 *
 *   move  : x = strafe right (+), y = forward (+), magnitude 0..1 (analog on touch)
 *   look  : accumulated yaw/pitch deltas in radians since last consume()
 *   rise/sink/sprint : held buttons
 *   pressed(action)  : edge-triggered buttons (jump, use/enter vehicle, photo, map)
 */
export type ButtonAction = 'rise' | 'sink' | 'sprint' | 'jump' | 'use' | 'photo' | 'map';

export class Input {
  readonly move = { x: 0, y: 0 };
  readonly look = { yaw: 0, pitch: 0 };
  private held = new Set<ButtonAction>();
  private edges = new Set<ButtonAction>();
  private keys = new Set<string>();
  /** Analog move written by the touch stick; combined with keys each frame. */
  readonly touchMove = { x: 0, y: 0 };
  readonly touchHeld = new Set<ButtonAction>();
  isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  lookSensitivity = 0.0022;
  wheel = 0;

  private static KEYMAP: Record<string, ButtonAction> = {
    KeyE: 'rise', Space: 'jump', KeyQ: 'sink', ControlLeft: 'sink', ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyF: 'use', KeyP: 'photo', KeyM: 'map',
  };

  constructor(private dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) { const a = Input.KEYMAP[e.code]; if (a) this.edges.add(a); }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.touchHeld.clear(); this.touchMove.x = this.touchMove.y = 0; });
    dom.addEventListener('click', () => { if (!this.isTouch && document.pointerLockElement !== dom) dom.requestPointerLock?.(); });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.dom) return;
      this.addLook(-e.movementX * this.lookSensitivity, -e.movementY * this.lookSensitivity);
    });
    dom.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  addLook(dyaw: number, dpitch: number) { this.look.yaw += dyaw; this.look.pitch += dpitch; }
  tap(a: ButtonAction) { this.edges.add(a); }

  /** Call once per frame before gameplay reads the state. */
  poll() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    x += this.touchMove.x; y += this.touchMove.y;
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    this.move.x = x; this.move.y = y;
    this.held.clear();
    for (const [code, a] of Object.entries(Input.KEYMAP)) if (k.has(code)) this.held.add(a);
    for (const a of this.touchHeld) this.held.add(a);
  }
  isHeld(a: ButtonAction) { return this.held.has(a); }
  pressed(a: ButtonAction) { const p = this.edges.has(a); this.edges.delete(a); return p; }
  consumeLook() { const l = { ...this.look }; this.look.yaw = this.look.pitch = 0; return l; }
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  endFrame() { this.edges.clear(); }
}
