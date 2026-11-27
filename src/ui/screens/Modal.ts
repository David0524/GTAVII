/**
 * Modal screen base for in-play overlays (shop counter, lead picker, weapon selector, dialogue
 * choices). Owns its MenuNav; closes on back/pause; the HUD hides while one is open.
 */
import type { Input } from '../../input/Input';
import { MenuNav, type NavItem } from '../MenuNav';
import { glyph } from '../Prompts';

export class Modal {
  readonly root = document.createElement('div');
  readonly nav: MenuNav;
  open = false;
  onClose?: () => void;
  static current: Modal | null = null;

  constructor(protected input: Input, cls: string) {
    this.nav = new MenuNav(input);
    this.root.className = `u-screen ${cls}`;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }
  protected show() {
    Modal.current?.hide(true);
    Modal.current = this; this.open = true; this.root.style.display = ''; this.root.classList.add('modal-open');
    if (document.pointerLockElement) document.exitPointerLock?.();
  }
  hide(silent = false) {
    if (!this.open) return;
    this.open = false; this.root.style.display = 'none'; this.root.classList.remove('modal-open');
    if (Modal.current === this) Modal.current = null;
    if (!silent) this.onClose?.();
  }
  setNav(items: NavItem[], keep = false) { this.nav.set(items, keep); }
  /** Footer prompts that follow the active device. */
  footer(extra: [string, string][] = []): string {
    const st = this.input.promptStyle;
    if (st === 'touch') return extra.length ? extra.map(([, l]) => `<span>${l}</span>`).join('') : '';
    return [[glyph('confirm', st), 'Select'], [glyph('back', st), 'Back'], ...extra].map(([g, l]) => `<span>${g} ${l}</span>`).join('');
  }
  update(dt: number) {
    if (!this.open) return;
    if (this.input.pressed('pause')) { this.hide(); return; }
    if (this.nav.update(dt) === 'back') this.back();
  }
  protected back() { this.hide(); }
}
