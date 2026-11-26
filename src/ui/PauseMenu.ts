/**
 * Pause menu: MAP · SAVES · SETTINGS · CONTROLS · CREDITS. Fully navigable by keyboard, gamepad (LB/RB tabs,
 * d-pad/stick, A confirm, B back, left/right adjusts values) and touch/mouse.
 */
import type { Input } from '../input/Input';
import { MenuNav, type NavItem } from './MenuNav';
import { settings, DEFAULTS, type SettingsData } from '../settings/Settings';
import { StreetMap } from './StreetMap';
import type { StreetRec } from './Minimap';
import type { SaveManager } from '../save/SaveManager';
import { downloadText } from '../save/SaveManager';
import { MANUAL_SLOTS, AUTO_SLOTS } from '../save/SaveStore';
import { glyph } from './Prompts';
import { escapeHtml } from './Hud';

type Tab = 'map' | 'saves' | 'settings' | 'controls' | 'credits';
const TABS: [Tab, string][] = [['map', 'MAP'], ['saves', 'SAVES'], ['settings', 'SETTINGS'], ['controls', 'CONTROLS'], ['credits', 'CREDITS']];

type Row =
  | { group: string }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'choice'; options: [string, string][] }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'bool' }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'range'; min: number; max: number; step: number; fmt?: (v: number) => string }
  | { label: string; help?: string; kind: 'button'; run: () => void };

export class PauseMenu {
  readonly root = document.createElement('div');
  private tabsEl = document.createElement('div');
  private body = document.createElement('div');
  private foot = document.createElement('div');
  private nav: MenuNav;
  private tab: Tab = 'map';
  open = false;
  readonly map: StreetMap;
  onClose?: () => void;
  onToast?: (msg: string) => void;
  onLoaded?: () => void;

  constructor(private input: Input, streets: StreetRec[], heroes: { name: string; x: number; z: number }[], private saves: SaveManager) {
    this.nav = new MenuNav(input);
    this.map = new StreetMap(streets, heroes, input);
    this.root.className = 't74-screen t74-pause t74-grain';
    this.tabsEl.className = 't74-tabs';
    this.body.className = 't74-body';
    this.foot.className = 't74-foot';
    this.root.append(this.tabsEl, this.body, this.foot);
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  show(tab: Tab = this.tab) {
    this.open = true; this.root.style.display = '';
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.select(tab);
  }
  hide() { this.open = false; this.root.style.display = 'none'; this.onClose?.(); }

  private select(tab: Tab) {
    this.tab = tab;
    const st = this.input.promptStyle;
    this.tabsEl.innerHTML = `<span class="brand">Tenderloin '74</span>` + TABS.map(([t, l]) => `<button data-t="${t}" class="${t === tab ? 'active' : ''}">${l}</button>`).join('') +
      (st === 'touch' ? '' : `<span class="hint">${glyph('tabPrev', st)} ${glyph('tabNext', st)}</span>`) +
      `<button class="resume">RESUME ✕</button>`;
    this.tabsEl.querySelectorAll('button[data-t]').forEach((b) => b.addEventListener('click', () => this.select((b as HTMLElement).dataset.t as Tab)));
    this.tabsEl.querySelector('.resume')!.addEventListener('click', () => this.hide());
    this.body.innerHTML = '';
    if (tab === 'map') this.buildMap();
    if (tab === 'saves') void this.buildSaves();
    if (tab === 'settings') this.buildSettings();
    if (tab === 'controls') this.buildControls();
    if (tab === 'credits') this.buildCredits();
    this.foot.innerHTML = st === 'touch'
      ? `<span>Tap to select · ‹ › to change values</span>${tab === 'map' ? '<span>Drag to pan · pinch to zoom</span>' : ''}`
      : `<span>${glyph('confirm', st)} Select</span><span>${glyph('back', st)} Back</span><span>${glyph('pause', st)} Resume</span>` +
        (tab === 'map' ? `<span>${st === 'keyboard' ? 'Drag to pan · wheel to zoom' : 'Right stick to pan · triggers to zoom'}</span>` : '');
  }

  update(dt: number) {
    if (!this.open) return;
    if (this.input.pressed('tabPrev')) this.cycle(-1);
    if (this.input.pressed('tabNext')) this.cycle(1);
    if (this.input.pressed('pause')) { this.hide(); return; }
    if (this.tab === 'map') this.map.update(dt);
    if (this.nav.update(dt) === 'back') this.hide();
  }
  private cycle(d: number) { const i = TABS.findIndex(([t]) => t === this.tab); this.select(TABS[(i + d + TABS.length) % TABS.length][0]); }

  // ------------------------------------------------------------ MAP
  private buildMap() {
    const wrap = document.createElement('div'); wrap.className = 't74-mapwrap';
    wrap.style.height = 'calc(100% - 4px)';
    this.body.style.padding = '0'; this.body.style.overflow = 'hidden';
    wrap.appendChild(this.map.canvas);
    const legend = document.createElement('div'); legend.className = 't74-legend';
    legend.innerHTML = '▲ You are here<br>● Landmark<br>► One-way (1974)';
    wrap.appendChild(legend);
    this.body.appendChild(wrap);
    this.map.centerOnPlayer();
    const center = document.createElement('button'); center.textContent = 'CENTER ON ME';
    Object.assign(center.style, { position: 'absolute', right: '12px', bottom: '12px', all: 'unset' });
    center.style.cssText += 'position:absolute;right:12px;bottom:12px;padding:8px 12px;background:#140c0d;color:#efe3c4;font:400 15px "League Gothic";letter-spacing:.2em;cursor:pointer';
    wrap.appendChild(center);
    this.nav.set([{ el: center, activate: () => this.map.centerOnPlayer() }]);
  }

  // ------------------------------------------------------------ SAVES
  private async buildSaves() {
    this.body.style.padding = ''; this.body.style.overflow = '';
    const s = this.saves;
    const metas = new Map((await s.store.listSlots(s.profile.id)).map((m) => [m.slot, m]));
    const profiles = await s.store.listProfiles();
    const items: NavItem[] = [];
    const wrap = document.createElement('div'); wrap.className = 't74-rows';
    const addGroup = (t: string) => { const g = document.createElement('div'); g.className = 't74-group'; g.textContent = t; wrap.appendChild(g); };
    addGroup(`Profile · ${s.profile.name}${s.store.kind === 'memory' ? ' · (storage unavailable: saves last this session only)' : ''}`);
    const profRow = document.createElement('div'); profRow.className = 't74-row btn';
    profRow.innerHTML = `<div class="k">Switch profile<small>${profiles.map((p) => escapeHtml(p.name)).join(' · ')}</small></div><div class="v">${profiles.length} / 4</div>`;
    wrap.appendChild(profRow);
    items.push({ el: profRow, activate: async () => {
      const i = profiles.findIndex((p) => p.id === s.profile.id);
      if (profiles.length < 4 && i === profiles.length - 1) { const p = await s.store.createProfile(`Player ${profiles.length + 1}`); await s.switchProfile(p.id); this.onToast?.(`New profile · ${p.name}`); }
      else { await s.switchProfile(profiles[(i + 1) % profiles.length].id); this.onToast?.(`Profile · ${s.profile.name}`); }
      void this.buildSaves();
    } });
    const slotRow = (slot: string, title: string, canSave: boolean) => {
      const m = metas.get(slot);
      const el = document.createElement('div'); el.className = 't74-slot';
      el.innerHTML = `<div class="id">${title}</div><div class="lbl">${m ? escapeHtml(m.label) : '<span style="opacity:.5">Empty</span>'}${m ? `<small>${new Date(m.savedAt).toLocaleString()} · ${Math.floor(m.playtimeSec / 60)} min played</small>` : ''}</div><div class="acts"></div>`;
      const acts = el.querySelector('.acts')!;
      const btn = (label: string, fn: () => void) => { const b = document.createElement('button'); b.textContent = label; acts.appendChild(b); items.push({ el: b, activate: fn }); };
      if (canSave) btn('SAVE', async () => { await s.save(slot); this.onToast?.('Saved'); void this.buildSaves(); });
      if (m) btn('LOAD', async () => { try { await s.load(slot); this.onToast?.(`Loaded · ${m.label}`); this.onLoaded?.(); this.hide(); } catch (e) { this.onToast?.(String((e as Error).message)); } });
      if (m) btn('EXPORT', async () => { const f = await s.exportSlot(slot); if (f) { downloadText(f.name, f.text); this.onToast?.('Exported save file'); } });
      if (canSave) btn('IMPORT', () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { const f = inp.files?.[0]; if (!f) return; try { await s.importToSlot(await f.text(), slot); this.onToast?.('Imported save'); void this.buildSaves(); } catch (e) { this.onToast?.(String((e as Error).message)); } };
        inp.click();
      });
      wrap.appendChild(el);
    };
    addGroup('Saves');
    for (let i = 1; i <= MANUAL_SLOTS; i++) slotRow(`manual-${i}`, `SLOT ${i}`, true);
    slotRow('quick', 'QUICK', true);
    addGroup('Autosaves (every 90 s and when you leave)');
    for (let i = 1; i <= AUTO_SLOTS; i++) slotRow(`auto-${i}`, `AUTO ${i}`, false);
    this.body.innerHTML = ''; this.body.appendChild(wrap);
    this.nav.set(items, true);
  }

  // ------------------------------------------------------------ SETTINGS
  private rows(): Row[] {
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    return [
      { group: 'Controls' },
      { key: 'controlPreset', label: 'Controller layout', help: 'Standard: sprint L3, jump A/✕. Classic: sprint A/✕, jump X/□.', kind: 'choice', options: [['standard', 'Standard'], ['classic', 'Classic'], ['lefthanded', 'Left-handed']] },
      { key: 'buttonPrompts', label: 'Button prompts', kind: 'choice', options: [['auto', 'Automatic'], ['xbox', 'Xbox style'], ['playstation', 'PlayStation style'], ['keyboard', 'Keyboard']] },
      { key: 'padLookSensitivity', label: 'Controller look sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
      { key: 'padLookCurve', label: 'Look response curve', help: 'Higher = finer control near centre', kind: 'range', min: 1, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
      { key: 'padDeadzone', label: 'Stick dead zone', kind: 'range', min: 0.05, max: 0.35, step: 0.01, fmt: pct },
      { key: 'padInvertY', label: 'Invert look (controller)', kind: 'bool' },
      { key: 'padVibration', label: 'Vibration', kind: 'bool' },
      { key: 'padVibrationStrength', label: 'Vibration strength', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
      { key: 'mouseSensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
      { key: 'mouseInvertY', label: 'Invert look (mouse)', kind: 'bool' },
      { key: 'touchLookSensitivity', label: 'Touch look sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
      { group: 'Display' },
      { key: 'fov', label: 'Field of view', kind: 'range', min: 50, max: 90, step: 1, fmt: (v) => `${v}°` },
      { group: 'Interface' },
      { key: 'hud', label: 'HUD', kind: 'bool' },
      { key: 'subtitles', label: 'Subtitles', kind: 'bool' },
      { key: 'subtitleScale', label: 'Subtitle size', kind: 'range', min: 0.8, max: 1.6, step: 0.1, fmt: pct },
      { label: 'Restore defaults', kind: 'button', run: () => { settings.reset(); this.onToast?.('Settings restored'); this.buildSettings(); } },
    ];
  }

  private buildSettings() {
    this.body.style.padding = ''; this.body.style.overflow = '';
    const wrap = document.createElement('div'); wrap.className = 't74-rows';
    const items: NavItem[] = [];
    for (const r of this.rows()) {
      if ('group' in r) { const g = document.createElement('div'); g.className = 't74-group'; g.textContent = r.group; wrap.appendChild(g); continue; }
      const el = document.createElement('div'); el.className = `t74-row${r.kind === 'button' ? ' btn' : ''}`;
      const k = document.createElement('div'); k.className = 'k'; k.innerHTML = `${escapeHtml(r.label)}${r.help ? `<small>${escapeHtml(r.help)}</small>` : ''}`;
      const v = document.createElement('div'); v.className = 'v';
      el.append(k, v); wrap.appendChild(el);
      if (r.kind === 'button') { v.textContent = '↺'; items.push({ el, activate: r.run }); continue; }
      const key = r.key;
      const paint = () => {
        const val = settings.get(key) as unknown;
        if (r.kind === 'bool') v.textContent = val ? 'On' : 'Off';
        else if (r.kind === 'choice') v.textContent = r.options.find(([o]) => o === val)?.[1] ?? String(val);
        else v.textContent = r.fmt ? r.fmt(val as number) : String(val);
      };
      const step = (d: number) => {
        const cur = settings.get(key) as unknown;
        if (r.kind === 'bool') settings.set(key, !cur as never);
        else if (r.kind === 'choice') { const i = r.options.findIndex(([o]) => o === cur); settings.set(key, r.options[(i + d + r.options.length) % r.options.length][0] as never); }
        else { const n = Math.min(r.max, Math.max(r.min, Math.round(((cur as number) + d * r.step) / r.step) * r.step)); settings.set(key, +n.toFixed(3) as never); }
        paint();
      };
      paint();
      items.push({ el, activate: () => step(1), dec: () => step(-1), inc: () => step(1) });
      void DEFAULTS;
    }
    this.body.innerHTML = ''; this.body.appendChild(wrap);
    this.nav.set(items, true);
  }

  // ------------------------------------------------------------ CONTROLS
  private buildControls() {
    this.body.style.padding = ''; this.body.style.overflow = '';
    const st = this.input.promptStyle;
    const s = st === 'touch' ? 'keyboard' : st;
    const rows: [string, string][] = [
      ['Move', st === 'keyboard' ? 'W A S D' : st === 'touch' ? 'Left thumb' : 'Left stick'],
      ['Look', st === 'keyboard' ? 'Mouse' : st === 'touch' ? 'Right thumb' : 'Right stick'],
      ['Sprint (hold)', glyph('sprint', s)], ['Jump · climb a ledge', glyph('jump', s)], ['Interact · enter vehicle', glyph('use', s)],
      ['Free camera / photo', glyph('photo', s)], ['Map', glyph('map', s)], ['Pause', glyph('pause', s)],
      ['Quick save · load', st === 'keyboard' ? '<span class="t74-key">F5</span> <span class="t74-key">F9</span>' : 'Pause → Saves'],
    ];
    this.body.innerHTML = `<div class="t74-rows">${rows.map(([a, b]) => `<div class="t74-row btn"><div class="k">${a}</div><div class="v">${b}</div></div>`).join('')}</div>` +
      `<p style="max-width:760px;color:var(--dim);font-size:13px;margin-top:16px">Layout presets and per-device options are in Settings. Prompts follow whichever device you used last.</p>`;
    this.nav.set([]);
  }

  // ------------------------------------------------------------ CREDITS
  private buildCredits() {
    this.body.style.padding = ''; this.body.style.overflow = '';
    this.body.innerHTML = `<div class="t74-credits">
      <h3>THE CITY</h3>Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> (ODbL).
      Building footprints and PLUTO: NYC Open Data (NYC Office of Technology &amp; Innovation; NYC Department of City Planning).
      Buildings dated against 1974; later towers replaced with period stand-ins.
      <h3>PERIOD REFERENCE</h3>DOCUMERICA (US Environmental Protection Agency, 1971–77), US National Archives: public domain.
      <h3>TYPE</h3>Fraunces, League Gothic, Archivo, Courier Prime: SIL Open Font License.
      <h3>ENGINE</h3>three.js (MIT) · Rapier physics (Apache-2.0).
      <h3>NOTE</h3>Every business, brand and vehicle name in the game is invented.</div>`;
    this.nav.set([]);
  }
}
