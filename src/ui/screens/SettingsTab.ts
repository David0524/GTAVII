/**
 * Settings (about 75 options plus remapping), grouped like a period instruction booklet. Every row
 * says whether it's live today or waits on another stream ("Applies when audio lands"), so nothing
 * pretends to work. Per-group "Restore defaults". Remapping: keyboard and controller per action,
 * with conflict swap and per-action reset; menu navigation is not rebindable, so a bad binding can
 * always be undone. Layout presets (Standard / Classic / Left-handed) stay as named bundles.
 */
import type { Input, ButtonAction } from '../../input/Input';
import { DEFAULT_KEYS, REBINDABLE, PAD_PRESETS } from '../../input/Input';
import { settings, DEFAULTS, type SettingsData } from '../../settings/Settings';
import { CONSUMER } from '../settings/uiSettings';
import type { NavItem } from '../MenuNav';
import type { Tab } from './PauseHub';
import { esc } from '../util';

type Row =
  | { group: string; keys?: (keyof SettingsData)[] }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'choice'; options: [string | number, string][] }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'bool' }
  | { key: keyof SettingsData; label: string; help?: string; kind: 'range'; min: number; max: number; step: number; fmt?: (v: number) => string };

/** Keys whose consumer reads them today. Everything else shows "Applies when … lands". */
const WIRED = new Set<keyof SettingsData>([
  'controlPreset', 'buttonPrompts', 'padLookSensitivity', 'padLookCurve', 'padDeadzone', 'padInvertY', 'padVibration', 'padVibrationStrength',
  'mouseSensitivity', 'mouseInvertY', 'touchLookSensitivity', 'fov', 'hud', 'subtitles', 'subtitleScale', 'bindings',
  'hudMinimap', 'hudObjective', 'hudCash', 'hudWeapon', 'hudClock', 'hudRadio', 'hudStamina', 'hudInjuries', 'hudLocation', 'hudDiscovery', 'hudTurns', 'hudPrompts',
  'minimapOrientation', 'minimapSize', 'subtitleMode', 'subtitleBackground', 'subtitleSpeakerNames', 'subtitleSpeakerColours',
  'textScale', 'colourMode', 'highContrast', 'reduceFlashing', 'reduceMotion', 'cutsceneLetterbox', 'filmGrain', 'units', 'clock24', 'safeZone', 'mapIconSize', 'touchButtonSize', 'touchOpacity', 'touchLeftHanded', 'skipTimers',
  'haptics', 'touchAimSensitivity', 'touchDriveLookSensitivity', 'steerMode',
]);
const WAITS: Record<string, string> = { audio: 'audio lands', gameplay: 'gameplay lands', engine: 'the engine wires it', post: 'the Phase 3 film grade lands', vehicles: 'driving lands in the game', input: 'the input layer supports it', ui: 'the UI wires it' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const M3: [string, string][] = [['on', 'On'], ['dynamic', 'Dynamic'], ['off', 'Off']];
export const ROWS: Row[] = [
  { group: 'Controls', keys: ['controlPreset', 'buttonPrompts', 'sprintMode', 'aimMode', 'holdDelay', 'tapAssist'] },
  { key: 'controlPreset', label: 'Controller layout', help: 'Standard: sprint L3, jump A/✕. Classic: sprint A/✕, jump X/□. Left-handed swaps the sticks.', kind: 'choice', options: [['standard', 'Standard'], ['classic', 'Classic'], ['lefthanded', 'Left-handed']] },
  { key: 'buttonPrompts', label: 'Button prompts', kind: 'choice', options: [['auto', 'Automatic'], ['xbox', 'Xbox style'], ['playstation', 'PlayStation style'], ['keyboard', 'Keyboard']] },
  { key: 'sprintMode', label: 'Sprint', kind: 'choice', options: [['hold', 'Hold'], ['toggle', 'Toggle']] },
  { key: 'aimMode', label: 'Aim', kind: 'choice', options: [['hold', 'Hold'], ['toggle', 'Toggle']] },
  { key: 'holdDelay', label: 'Hold delay', help: 'How long a "hold" takes', kind: 'range', min: 0, max: 2.5, step: 0.25, fmt: pct },
  { key: 'tapAssist', label: 'Tap assist', help: 'Any "tap repeatedly" can be held instead', kind: 'bool' },
  { group: 'Controller', keys: ['padLookSensitivity', 'padLookCurve', 'padDeadzone', 'padInvertY', 'padVibration', 'padVibrationStrength'] },
  { key: 'padLookSensitivity', label: 'Look sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
  { key: 'padLookCurve', label: 'Look response curve', help: 'Higher = finer control near the centre', kind: 'range', min: 1, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) },
  { key: 'padDeadzone', label: 'Stick dead zone', kind: 'range', min: 0.05, max: 0.35, step: 0.01, fmt: pct },
  { key: 'padInvertY', label: 'Invert look', kind: 'bool' },
  { key: 'padVibration', label: 'Vibration', kind: 'bool' },
  { key: 'padVibrationStrength', label: 'Vibration strength', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { group: 'Mouse and touch', keys: ['mouseSensitivity', 'mouseInvertY', 'touchLookSensitivity', 'touchButtonSize', 'touchOpacity', 'touchLeftHanded'] },
  { key: 'mouseSensitivity', label: 'Mouse sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
  { key: 'mouseInvertY', label: 'Invert look (mouse)', kind: 'bool' },
  { key: 'touchLookSensitivity', label: 'Touch look sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
  { key: 'touchButtonSize', label: 'Touch button size', kind: 'range', min: 0.8, max: 1.5, step: 0.1, fmt: pct },
  { key: 'touchOpacity', label: 'Touch button opacity', kind: 'range', min: 0.3, max: 1, step: 0.1, fmt: pct },
  { key: 'touchLeftHanded', label: 'Left-handed touch layout', help: 'Buttons on the left, stick on the right', kind: 'bool' },
  { group: 'Touch controls', keys: ['fireMode', 'aimAssist', 'gyroAim', 'touchAimSensitivity', 'steerMode', 'steerAssist', 'steerAssistStrength', 'autoAccelerate', 'touchDriveLookSensitivity', 'haptics'] },
  { key: 'fireMode', label: 'Firing', help: 'Automatic fires when your sights are on a locked target', kind: 'choice', options: [['auto', 'Automatic'], ['tap', 'Tap anywhere'], ['button', 'Fire button']] },
  { key: 'gyroAim', label: 'Gyro aim', help: 'Tilt the phone to fine-tune aim. Turns aim assist off.', kind: 'choice', options: [['off', 'Off'], ['aim', 'While aiming'], ['always', 'Always']] },
  { key: 'touchAimSensitivity', label: 'Aim sensitivity', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
  { key: 'steerMode', label: 'Steering', help: 'Stick: slide left and right. Arrows: two buttons. Tilt: turn the phone.', kind: 'choice', options: [['stick', 'Stick'], ['arrows', 'Arrows'], ['tilt', 'Tilt']] },
  { key: 'steerAssist', label: 'Steering assist', help: 'Smooths steering and helps catch slides', kind: 'bool' },
  { key: 'steerAssistStrength', label: 'Steering assist strength', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { key: 'autoAccelerate', label: 'Auto-accelerate', help: 'The car drives itself forward; the brake slows, stops and reverses', kind: 'bool' },
  { key: 'touchDriveLookSensitivity', label: 'Look while driving', kind: 'range', min: 0.2, max: 3, step: 0.1, fmt: pct },
  { key: 'haptics', label: 'Haptics', help: 'Light taps on lock-on, reload and impacts (where the phone supports it)', kind: 'bool' },
  { group: 'Camera and comfort', keys: ['fov', 'cameraShake', 'headBob', 'onFootFollow', 'vehicleFollow', 'motionBlur', 'filmGrain', 'cutsceneLetterbox'] },
  { key: 'fov', label: 'Field of view', kind: 'range', min: 50, max: 90, step: 1, fmt: (v) => `${v}°` },
  { key: 'cameraShake', label: 'Camera shake', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { key: 'headBob', label: 'Camera bob', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { key: 'onFootFollow', label: 'On-foot follow speed', kind: 'range', min: 0.1, max: 1, step: 0.1, fmt: pct },
  { key: 'vehicleFollow', label: 'Driving follow speed', kind: 'range', min: 0.1, max: 1, step: 0.1, fmt: pct },
  { key: 'motionBlur', label: 'Motion blur', kind: 'bool' },
  { key: 'filmGrain', label: 'Film grain', help: 'The 35 mm grain. Never drawn over text.', kind: 'range', min: 0, max: 1, step: 0.1, fmt: pct },
  { key: 'cutsceneLetterbox', label: 'Letterbox in cutscenes', kind: 'bool' },
  { group: 'Display', keys: ['qualityPreset', 'resolutionScale', 'fpsCap', 'brightness', 'safeZone'] },
  { key: 'qualityPreset', label: 'Picture quality', kind: 'choice', options: [['auto', 'Automatic'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] },
  { key: 'resolutionScale', label: 'Resolution scale', kind: 'range', min: 0.5, max: 1, step: 0.05, fmt: pct },
  { key: 'fpsCap', label: 'Frame-rate cap', kind: 'choice', options: [[30, '30'], [60, '60'], [0, 'Unlimited']] },
  { key: 'brightness', label: 'Brightness', kind: 'range', min: 0.7, max: 1.3, step: 0.05, fmt: pct },
  { key: 'safeZone', label: 'Screen edge margin', help: 'Pull the HUD in from the edges (TVs that crop)', kind: 'range', min: 0.9, max: 1, step: 0.01, fmt: pct },
  { group: 'HUD', keys: ['hud', 'hudMinimap', 'hudObjective', 'hudCash', 'hudWeapon', 'hudClock', 'hudRadio', 'hudStamina', 'hudInjuries', 'hudLocation', 'hudDiscovery', 'hudTurns', 'hudPrompts'] },
  { key: 'hud', label: 'HUD', help: 'Master switch', kind: 'bool' },
  { key: 'hudMinimap', label: 'Minimap', help: 'Dynamic: shows while you move, are hunted or have a route', kind: 'choice', options: M3 },
  { key: 'hudObjective', label: 'Objective line', kind: 'choice', options: M3 },
  { key: 'hudCash', label: 'Cash on hand', help: 'Dynamic: when it changes or you stand still', kind: 'choice', options: M3 },
  { key: 'hudWeapon', label: 'Weapon and concealment', help: 'Always shown when your gun is printing or in sight', kind: 'choice', options: M3 },
  { key: 'hudClock', label: 'Clock and date', kind: 'choice', options: M3 },
  { key: 'hudRadio', label: 'Police radio lines', help: 'The heat, as dispatch chatter (also voiced)', kind: 'choice', options: M3 },
  { key: 'hudStamina', label: 'Breath (stamina)', kind: 'choice', options: M3 },
  { key: 'hudInjuries', label: 'Injury tags', kind: 'choice', options: M3 },
  { key: 'hudLocation', label: 'Neighbourhood names', kind: 'choice', options: M3 },
  { key: 'hudDiscovery', label: '"Pencilled in" notes', kind: 'choice', options: M3 },
  { key: 'hudTurns', label: 'Route call-outs', kind: 'choice', options: M3 },
  { key: 'hudPrompts', label: 'Button prompts', kind: 'choice', options: M3 },
  { group: 'Map', keys: ['minimapOrientation', 'minimapSize', 'mapIconSize', 'units', 'clock24'] },
  { key: 'minimapOrientation', label: 'Minimap turns with you', kind: 'choice', options: [['heading', 'Yes'], ['north', 'North up']] },
  { key: 'minimapSize', label: 'Minimap size', kind: 'choice', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']] },
  { key: 'mapIconSize', label: 'Map symbols', kind: 'choice', options: [['normal', 'Normal'], ['large', 'Large']] },
  { key: 'units', label: 'Distances', kind: 'choice', options: [['imperial', 'Feet and miles'], ['metric', 'Metres']] },
  { key: 'clock24', label: '24-hour clock', kind: 'bool' },
  { group: 'Subtitles', keys: ['subtitles', 'subtitleMode', 'subtitleScale', 'subtitleBackground', 'subtitleSpeakerNames', 'subtitleSpeakerColours', 'captions'] },
  { key: 'subtitles', label: 'Subtitles', kind: 'bool' },
  { key: 'subtitleMode', label: 'Show', kind: 'choice', options: [['all', 'Everything, overheard too'], ['scene', 'Conversations only'], ['off', 'Nothing']] },
  { key: 'subtitleScale', label: 'Size', kind: 'range', min: 0.8, max: 1.8, step: 0.1, fmt: pct },
  { key: 'subtitleBackground', label: 'Background', kind: 'choice', options: [['shadow', 'Shadow'], ['solid', 'Solid'], ['none', 'None']] },
  { key: 'subtitleSpeakerNames', label: 'Speaker names', kind: 'bool' },
  { key: 'subtitleSpeakerColours', label: 'Speaker colours', kind: 'bool' },
  { key: 'captions', label: 'Sound captions', help: '[siren, two blocks east]', kind: 'bool' },
  { group: 'Accessibility', keys: ['textScale', 'colourMode', 'highContrast', 'reduceFlashing', 'reduceMotion', 'menuNarration', 'unlimitedSprint', 'aimAssist', 'skipTimers'] },
  { key: 'textScale', label: 'Text size', kind: 'choice', options: [[0.9, 'Small'], [1, 'Normal'], [1.15, 'Large'], [1.3, 'Extra large']] },
  { key: 'colourMode', label: 'Colour-blind palette', help: 'Hidden/printing/visible and police markings switch to safe colours and shapes', kind: 'choice', options: [['off', 'Off'], ['protan', 'Protanopia'], ['deutan', 'Deuteranopia'], ['tritan', 'Tritanopia']] },
  { key: 'highContrast', label: 'High-contrast UI', kind: 'bool' },
  { key: 'reduceFlashing', label: 'Reduce flashing', help: 'No pulsing vignettes, muzzle-flash and siren strobes damped', kind: 'bool' },
  { key: 'reduceMotion', label: 'Reduce UI motion', kind: 'bool' },
  { key: 'menuNarration', label: 'Read menus aloud', help: 'Uses the browser\'s voice', kind: 'bool' },
  { key: 'unlimitedSprint', label: 'Unlimited sprint', kind: 'bool' },
  { key: 'aimAssist', label: 'Aim assist', kind: 'choice', options: [['strong', 'Strong'], ['standard', 'Standard'], ['low', 'Low'], ['off', 'Off']] },
  { key: 'skipTimers', label: 'Relax timers', help: 'Timed sections wait for you; dialogue choices never time out', kind: 'bool' },
  { group: 'Sound', keys: ['volMaster', 'volEffects', 'volMusic', 'volDialogue', 'volRadio', 'volUi', 'monoAudio', 'radioOnEntry'] },
  { key: 'volMaster', label: 'Master volume', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'volEffects', label: 'Effects', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'volMusic', label: 'Score', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'volDialogue', label: 'Dialogue', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'volRadio', label: 'Car radio and TV', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'volUi', label: 'Menus', kind: 'range', min: 0, max: 1, step: 0.05, fmt: pct },
  { key: 'monoAudio', label: 'Mono', kind: 'bool' },
  { key: 'radioOnEntry', label: 'Car radio when you get in', kind: 'choice', options: [['last', 'Last station'], ['on', 'Always on'], ['off', 'Off']] },
  { group: 'Game', keys: ['dayLengthMinutes'] },
  { key: 'dayLengthMinutes', label: 'Length of a day', help: 'Real minutes per day in the city', kind: 'range', min: 24, max: 96, step: 6, fmt: (v) => `${v} min` },
];
export const SETTING_COUNT = ROWS.filter((r) => 'key' in r).length;

const PAD_NAMES = ['A / ✕', 'B / ○', 'X / □', 'Y / △', 'LB / L1', 'RB / R1', 'LT / L2', 'RT / R2', 'View / Create', 'Menu / Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
const ACTION_NAMES: Partial<Record<ButtonAction, string>> = {
  sprint: 'Sprint', jump: 'Jump · climb', use: 'Use · enter · talk', photo: 'Free camera · photo', map: 'Map', pause: 'Pause', inventory: 'Pockets', weaponSelect: 'Weapon selector',
  waypoint: 'Pencil a waypoint (map)', skip: 'Skip cutscene (hold)', rise: 'Free camera up', sink: 'Free camera down', hud: 'Developer overlay',
};
const keyName = (c: string) => c.replace(/^Key/, '').replace(/^Digit/, '').replace('Left', ' (left)').replace('Right', ' (right)').replace('Backquote', '`').replace('BracketLeft', '[').replace('BracketRight', ']');

export class SettingsTab implements Tab {
  id = 'settings'; label = 'SETTINGS';
  el = document.createElement('div');
  private view: 'options' | 'remap' = 'options';
  private listening: { action: ButtonAction; device: 'keys' | 'pad' } | null = null;
  private setNav: (i: NavItem[], keep?: boolean) => void = () => {};
  onToast?: (t: string) => void;
  extraButtons: [string, () => void][] = [];

  constructor(private input: Input) {
    this.el.className = 'u-scroll u-settings';
    window.addEventListener('keydown', (e) => {
      if (!this.listening || this.listening.device !== 'keys') return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') this.bind(this.listening.action, 'keys', e.code); else { this.listening = null; this.render(); }
    }, true);
  }
  open(setNav: (items: NavItem[], keep?: boolean) => void) { this.setNav = setNav; this.render(); }
  update() {
    if (this.listening?.device === 'pad') {
      for (let b = 0; b < 17; b++) if (this.input.pad.pressed(b as never) && b !== 9) { this.bind(this.listening.action, 'pad', b); return; }
    }
  }

  private bind(action: ButtonAction, device: 'keys' | 'pad', code: string | number) {
    const all = structuredClone(settings.get('bindings'));
    const cur = (a: ButtonAction) => all[a] ?? { keys: [...(DEFAULT_KEYS[a] ?? [])], pad: [] };
    // conflict: another rebindable action already uses it -> swap
    for (const other of REBINDABLE) {
      if (other === action) continue;
      const o = cur(other);
      if (device === 'keys' && o.keys.includes(code as string)) { o.keys = o.keys.filter((k) => k !== code).concat(cur(action).keys.slice(0, 1)); all[other] = o; this.onToast?.(`Swapped with ${ACTION_NAMES[other]}`); }
    }
    const me = cur(action);
    if (device === 'keys') me.keys = [code as string]; else me.pad = [code as number];
    all[action] = me;
    settings.set('bindings', all);
    this.listening = null; this.render();
  }

  private render() {
    const items: NavItem[] = [];
    this.el.innerHTML = `<div class="np-pages"><button data-v="options" class="${this.view === 'options' ? 'on' : ''}">Options · ${SETTING_COUNT}</button><button data-v="remap" class="${this.view === 'remap' ? 'on' : ''}">Buttons and keys</button></div>`;
    this.el.querySelectorAll<HTMLElement>('.np-pages button').forEach((b) => items.push({ el: b, activate: () => { this.view = b.dataset.v as 'options' | 'remap'; this.render(); } }));
    const wrap = document.createElement('div'); wrap.className = 't74-rows st-rows'; this.el.appendChild(wrap);
    if (this.view === 'options') this.options(wrap, items); else this.remap(wrap, items);
    for (const [l, fn] of this.extraButtons) { const b = document.createElement('div'); b.className = 't74-row btn'; b.innerHTML = `<div class="k">${esc(l)}</div><div class="v">›</div>`; wrap.appendChild(b); items.push({ el: b, activate: fn }); }
    this.setNav(items, true);
  }

  private options(wrap: HTMLElement, items: NavItem[]) {
    for (const r of ROWS) {
      if ('group' in r) {
        const g = document.createElement('div'); g.className = 't74-group st-group'; g.innerHTML = `<span>${esc(r.group)}</span>`;
        if (r.keys) { const b = document.createElement('button'); b.className = 'st-reset'; b.textContent = 'Restore defaults'; g.appendChild(b); items.push({ el: b, activate: () => { settings.reset(r.keys); this.onToast?.(`${r.group}: defaults restored`); this.render(); } }); }
        wrap.appendChild(g); continue;
      }
      const el = document.createElement('div'); el.className = 't74-row';
      const live = WIRED.has(r.key);
      const consumer = CONSUMER[r.key] ?? 'ui';
      el.innerHTML = `<div class="k">${esc(r.label)}${r.help ? `<small>${esc(r.help)}</small>` : ''}${live ? '' : `<small class="wait">Applies when ${WAITS[consumer]}</small>`}</div><div class="v"></div>`;
      const v = el.querySelector('.v') as HTMLElement;
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
      // touch: tap left half to decrease, right half to increase on ranges/choices
      el.addEventListener('pointerup', (e) => { if (r.kind === 'bool') return; const rc = el.getBoundingClientRect(); if (e.pointerType === 'touch') { e.stopPropagation(); step(e.clientX < rc.left + rc.width * 0.55 ? -1 : 1); } });
      paint(); wrap.appendChild(el);
      items.push({ el, activate: () => { if (r.kind === 'bool' || this.input.activeDevice !== 'touch') step(1); }, dec: () => step(-1), inc: () => step(1) });
    }
    void DEFAULTS;
  }

  private remap(wrap: HTMLElement, items: NavItem[]) {
    const b = settings.get('bindings');
    const preset = PAD_PRESETS[settings.get('controlPreset')];
    wrap.insertAdjacentHTML('beforeend', '<p class="hint" style="margin:4px 0 10px">Choose a key or button, then press the new one. Esc cancels. Menu navigation (arrows, Enter, A/B) stays fixed so you can always get back here.</p>');
    const head = document.createElement('div'); head.className = 'st-remap head'; head.innerHTML = '<span>Action</span><span>Keyboard</span><span>Controller</span><span></span>'; wrap.appendChild(head);
    for (const a of REBINDABLE) {
      const keys = b[a]?.keys.length ? b[a].keys : DEFAULT_KEYS[a] ?? [];
      const pads = b[a]?.pad.length ? b[a].pad : preset.filter(([, x]) => x === a).map(([btn]) => btn as number);
      const row = document.createElement('div'); row.className = 'st-remap';
      const lk = this.listening?.action === a && this.listening.device === 'keys', lp = this.listening?.action === a && this.listening.device === 'pad';
      row.innerHTML = `<span>${esc(ACTION_NAMES[a] ?? a)}${b[a] ? ' <i>changed</i>' : ''}</span>`;
      const kb = document.createElement('button'); kb.className = `st-bind${lk ? ' listen' : ''}`; kb.innerHTML = lk ? 'Press a key…' : keys.map((k) => `<span class="t74-key">${esc(keyName(k))}</span>`).join(' ') || '—';
      const pb = document.createElement('button'); pb.className = `st-bind${lp ? ' listen' : ''}`; pb.textContent = lp ? 'Press a button…' : pads.map((p) => PAD_NAMES[p]).join(', ') || '—';
      const rs = document.createElement('button'); rs.className = 'st-reset'; rs.textContent = 'Default';
      row.append(kb, pb, rs); wrap.appendChild(row);
      items.push({ el: kb, activate: () => { this.listening = { action: a, device: 'keys' }; this.render(); } });
      items.push({ el: pb, activate: () => { this.listening = { action: a, device: 'pad' }; this.render(); } });
      items.push({ el: rs, activate: () => { const all = structuredClone(settings.get('bindings')); delete all[a]; settings.set('bindings', all); this.render(); } });
    }
    const all = document.createElement('div'); all.className = 't74-row btn'; all.innerHTML = '<div class="k">Restore every binding</div><div class="v">↺</div>'; wrap.appendChild(all);
    items.push({ el: all, activate: () => { settings.set('bindings', {}); this.onToast?.('Bindings restored'); this.render(); } });
  }
}
