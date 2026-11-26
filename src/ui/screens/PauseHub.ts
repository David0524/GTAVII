/**
 * The pause hub: the folding map is the main menu (brief §3). Tabs along the top like the index
 * tabs of a datebook: MAP · POCKETS · PAPER · BUSINESS · RECORD · SAVES · SETTINGS. Keyboard,
 * gamepad (LB/RB tabs, d-pad, A/B) and touch all work; every target is >= 44 px on touch.
 */
import type { Input } from '../../input/Input';
import { MenuNav, type NavItem } from '../MenuNav';
import { glyph } from '../Prompts';
import { esc } from '../util';

export interface Tab {
  id: string; label: string;
  el: HTMLElement;
  /** Called each time the tab becomes active; hands back its focusable items. */
  open(setNav: (items: NavItem[], keep?: boolean) => void): void;
  update?(dt: number): void;
  /** Return true if the tab consumed 'back' (e.g. closed a card). */
  back?(): boolean;
  close?(): void;
  hint?: string;
}

export class PauseHub {
  readonly root = document.createElement('div');
  private tabsEl = document.createElement('div');
  private body = document.createElement('div');
  private foot = document.createElement('div');
  readonly nav: MenuNav;
  private tabs: Tab[] = [];
  active = '';
  open = false;
  onClose?: () => void;

  constructor(private input: Input) {
    this.nav = new MenuNav(input);
    this.root.className = 't74-screen t74-pause u-hub';
    this.tabsEl.className = 't74-tabs';
    this.body.className = 'u-hubbody';
    this.foot.className = 't74-foot';
    this.root.append(this.tabsEl, this.body, this.foot);
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  add(t: Tab) { this.tabs.push(t); t.el.style.display = 'none'; this.body.appendChild(t.el); }

  private only: string[] | null = null;
  /** Open on a tab. `only` limits the visible tabs (the title screen shows saves/settings/credits only). */
  show(tab = this.active || this.tabs[0]?.id, only: string[] | null = null) {
    this.only = only;
    this.open = true; this.root.style.display = '';
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.select(tab);
  }
  hide() { this.open = false; this.root.style.display = 'none'; this.tabs.find((t) => t.id === this.active)?.close?.(); this.onClose?.(); }

  select(id: string) {
    const prev = this.tabs.find((t) => t.id === this.active);
    if (prev && prev.id !== id) { prev.close?.(); prev.el.style.display = 'none'; }
    const t = this.tabs.find((x) => x.id === id) ?? this.tabs[0];
    this.active = t.id; t.el.style.display = '';
    const st = this.input.promptStyle;
    this.tabsEl.innerHTML = `<span class="brand">Tenderloin '74</span>` + this.visible.map((x) => `<button data-t="${x.id}" class="${x.id === t.id ? 'active' : ''}">${esc(x.label)}</button>`).join('') +
      (st === 'touch' ? '' : `<span class="hint">${glyph('tabPrev', st)} ${glyph('tabNext', st)}</span>`) + `<button class="resume">${this.only ? 'BACK' : 'RESUME'} ✕</button>`;
    this.tabsEl.querySelectorAll<HTMLElement>('button[data-t]').forEach((b) => b.addEventListener('click', () => this.select(b.dataset.t!)));
    this.tabsEl.querySelector('.resume')!.addEventListener('click', () => this.hide());
    this.tabsEl.querySelector('button.active')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    t.open((items, keep) => this.nav.set(items, keep));
    this.foot.innerHTML = st === 'touch'
      ? `<span>Tap to choose</span>${t.hint ? `<span>${t.hint}</span>` : ''}`
      : `<span>${glyph('confirm', st)} Select</span><span>${glyph('back', st)} Back</span><span>${glyph('pause', st)} Resume</span>${t.hint ? `<span>${t.hint}</span>` : ''}`;
  }

  update(dt: number) {
    if (!this.open) return;
    if (this.input.pressed('tabPrev')) this.cycle(-1);
    if (this.input.pressed('tabNext')) this.cycle(1);
    if (this.input.pressed('pause')) { this.hide(); return; }
    const t = this.tabs.find((x) => x.id === this.active);
    t?.update?.(dt);
    if (this.nav.update(dt) === 'back' && !t?.back?.()) this.hide();
  }
  private get visible() { return this.only ? this.tabs.filter((t) => this.only!.includes(t.id)) : this.tabs; }
  private cycle(d: number) { const v = this.visible, i = v.findIndex((t) => t.id === this.active); this.select(v[(i + d + v.length) % v.length].id); }
}
