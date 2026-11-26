/**
 * Device-agnostic menu focus: keyboard arrows / gamepad d-pad + left stick move focus, confirm activates,
 * left/right adjust value rows, back closes. Mouse and touch just click. Elements opt in with
 * class "t74-focusable"; value rows provide data-dec / data-inc behaviour via handlers.
 */
import type { Input } from '../input/Input';

export interface NavItem { el: HTMLElement; activate?: () => void; dec?: () => void; inc?: () => void }

export class MenuNav {
  items: NavItem[] = [];
  index = 0;
  private stickHold = 0;

  constructor(private input: Input) {}

  set(items: NavItem[], keepIndex = false) {
    this.items = items;
    if (!keepIndex) this.index = 0;
    this.index = Math.min(this.index, Math.max(0, items.length - 1));
    items.forEach((it, i) => {
      it.el.classList.add('t74-focusable');
      it.el.onmouseenter = () => this.focus(i);
      it.el.onclick = (e) => { e.stopPropagation(); this.focus(i); it.activate?.(); };
    });
    this.paint();
  }

  focus(i: number) { this.index = i; this.paint(); }
  private paint() {
    this.items.forEach((it, i) => it.el.classList.toggle('is-focus', i === this.index));
    this.items[this.index]?.el.scrollIntoView?.({ block: 'nearest' });
  }

  /** Returns 'back' if the player asked to leave this menu. */
  update(dt: number): 'back' | null {
    const inp = this.input;
    // left stick as d-pad with repeat
    const sy = -inp.move.y, sx = inp.move.x;
    let dy = 0, dx = 0;
    if (Math.abs(sy) > 0.6 || Math.abs(sx) > 0.6) {
      this.stickHold -= dt;
      if (this.stickHold <= 0) { if (Math.abs(sy) > Math.abs(sx)) dy = Math.sign(sy); else dx = Math.sign(sx); this.stickHold = this.stickHold < -1 ? 0.09 : 0.28; }
    } else this.stickHold = 0;
    if (inp.pressed('navUp')) dy = -1;
    if (inp.pressed('navDown')) dy = 1;
    if (inp.pressed('navLeft')) dx = -1;
    if (inp.pressed('navRight')) dx = 1;
    if (dy && this.items.length) this.focus((this.index + dy + this.items.length) % this.items.length);
    const cur = this.items[this.index];
    if (dx < 0) cur?.dec?.();
    if (dx > 0) cur?.inc?.();
    if (inp.pressed('confirm')) cur?.activate?.();
    if (inp.pressed('back')) return 'back';
    return null;
  }
}
