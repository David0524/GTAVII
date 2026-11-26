/**
 * Player settings: typed defaults, persisted to localStorage (per device, a convenience only;
 * the game works if storage is unavailable), with change subscriptions. The pause-menu settings
 * screen edits this object; systems read it live.
 */
export interface SettingsData {
  // controls: gamepad
  controlPreset: 'standard' | 'classic' | 'lefthanded';
  padLookSensitivity: number; // 0.2..3
  padLookCurve: number; // response exponent 1 (linear)..3
  padDeadzone: number; // 0.05..0.35 radial
  padInvertY: boolean;
  padVibration: boolean;
  padVibrationStrength: number; // 0..1
  // controls: mouse/touch
  mouseSensitivity: number; // 0.2..3
  mouseInvertY: boolean;
  touchLookSensitivity: number; // 0.2..3
  // camera
  fov: number; // degrees, horizontal-fit handled by camera code
  // interface
  hud: boolean;
  subtitles: boolean;
  subtitleScale: number; // 0.8..1.6
  buttonPrompts: 'auto' | 'xbox' | 'playstation' | 'keyboard';
}

export const DEFAULTS: SettingsData = {
  controlPreset: 'standard',
  padLookSensitivity: 1, padLookCurve: 1.8, padDeadzone: 0.14, padInvertY: false, padVibration: true, padVibrationStrength: 0.8,
  mouseSensitivity: 1, mouseInvertY: false, touchLookSensitivity: 1,
  fov: 60, hud: true, subtitles: true, subtitleScale: 1, buttonPrompts: 'auto',
};

const KEY = 't74.settings.v1';
type Listener = (s: SettingsData, changed: keyof SettingsData) => void;

class SettingsStore {
  readonly data: SettingsData = { ...DEFAULTS };
  private listeners = new Set<Listener>();
  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SettingsData>;
        for (const k of Object.keys(DEFAULTS) as (keyof SettingsData)[]) {
          if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) (this.data as unknown as Record<string, unknown>)[k] = saved[k];
        }
      }
    } catch { /* private mode / blocked storage: defaults */ }
  }
  get<K extends keyof SettingsData>(k: K): SettingsData[K] { return this.data[k]; }
  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.data, k);
  }
  reset() { for (const k of Object.keys(DEFAULTS) as (keyof SettingsData)[]) this.set(k, DEFAULTS[k] as never); }
  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
}

export const settings = new SettingsStore();
