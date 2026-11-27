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
  /** Tabs sharing a group collapse into one top-level tab with a secondary strip (Saves · Settings · Credits under System). */
  group?: string;
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
  private subEl = document.createElement('div');
  private lastInGroup = new Map<string, string>();
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
    this.subEl.className = 't74-subtabs';
    this.root.append(this.tabsEl, this.subEl, this.body, this.foot);
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
    if (t.group) this.lastInGroup.set(t.group, t.id);
    this.tabsEl.innerHTML = `<span class="brand">Tenderloin '74</span>` + this.entries.map((e) => `<button data-t="${e.id}" class="${(e.group ? t.group === e.group : e.id === t.id) ? 'active' : ''}">${esc(e.label)}</button>`).join('') +
      (st === 'touch' ? '' : `<span class="hint">${glyph('tabPrev', st)} ${glyph('tabNext', st)}</span>`) + `<button class="resume">${this.only ? 'BACK' : 'RESUME'} ✕</button>`;
    this.tabsEl.querySelectorAll<HTMLElement>('button[data-t]').forEach((b) => b.addEventListener('click', () => this.select(b.dataset.t!)));
    this.tabsEl.querySelector('.resume')!.addEventListener('click', () => this.hide());
    this.tabsEl.querySelector('button.active')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    // the group's own strip under the bar
    this.subEl.innerHTML = '';
    const members = t.group && !this.only ? this.visible.filter((x) => x.group === t.group) : [];
    this.subEl.style.display = members.length > 1 ? '' : 'none';
    for (const x of members) { const b = document.createElement('button'); b.textContent = x.label; b.className = x.id === t.id ? 'active' : ''; b.addEventListener('click', () => this.select(x.id)); this.subEl.appendChild(b); }
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
  /** Top-level bar entries: ungrouped tabs, plus one entry per group (opens its last-used member). Flat when `only` is set. */
  private get entries(): { id: string; label: string; group?: string }[] {
    if (this.only) return this.visible.map((t) => ({ id: t.id, label: t.label }));
    const out: { id: string; label: string; group?: string }[] = [], seen = new Set<string>();
    for (const t of this.visible) {
      if (!t.group) { out.push({ id: t.id, label: t.label }); continue; }
      if (seen.has(t.group)) continue; seen.add(t.group);
      out.push({ id: this.lastInGroup.get(t.group) ?? t.id, label: t.group, group: t.group });
    }
    return out;
  }
  /** LB/RB walk the top-level entries (a group counts once). */
  private cycle(d: number) {
    const e = this.entries, cur = this.tabs.find((t) => t.id === this.active);
    const i = e.findIndex((x) => (x.group ? x.group === cur?.group : x.id === this.active));
    this.select(e[(i + d + e.length) % e.length].id);
  }
}
