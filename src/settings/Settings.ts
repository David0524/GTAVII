/**
 * Player settings (UI-owned since the hand-off): about 75 keys plus the bindings table.
 * Player settings: typed defaults, persisted to localStorage (per device, a convenience only;
 * the game works if storage is unavailable), with change subscriptions. The pause-menu settings
 * screen edits this object; systems read it live.
 */
export type Mode3 = 'on' | 'dynamic' | 'off';
/** Aim assist strength (gameplay's setAssist levels; the old 'partial'/'full' values migrate to standard/strong). */
export type AimAssist = 'off' | 'low' | 'standard' | 'strong';
/** Per touch state, per element: offset from the default slot (CSS px at scale 1) and a size multiplier. */
export type TouchLayoutData = Record<string, Record<string, { dx: number; dy: number; s: number }>>;
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
  // ---- UI & Cinematics stream additions (keys above keep their names and meanings) ----
  // HUD elements (On / Dynamic / Off)
  hudMinimap: Mode3; hudObjective: Mode3; hudCash: Mode3; hudWeapon: Mode3; hudClock: Mode3; hudRadio: Mode3;
  hudStamina: Mode3; hudInjuries: Mode3; hudLocation: Mode3; hudDiscovery: Mode3; hudTurns: Mode3; hudPrompts: Mode3;
  // map
  minimapOrientation: 'heading' | 'north'; minimapSize: 'small' | 'medium' | 'large'; mapIconSize: 'normal' | 'large';
  // subtitles and captions
  subtitleMode: 'off' | 'scene' | 'all'; subtitleBackground: 'none' | 'shadow' | 'solid'; subtitleSpeakerNames: boolean; subtitleSpeakerColours: boolean; captions: boolean;
  // accessibility
  textScale: number; colourMode: 'off' | 'protan' | 'deutan' | 'tritan'; highContrast: boolean; reduceFlashing: boolean; reduceMotion: boolean;
  sprintMode: 'hold' | 'toggle'; aimMode: 'hold' | 'toggle'; holdDelay: number; tapAssist: boolean; unlimitedSprint: boolean; aimAssist: AimAssist;
  skipTimers: boolean; menuNarration: boolean;
  // camera and comfort
  cameraShake: number; headBob: number; filmGrain: number; motionBlur: boolean; onFootFollow: number; vehicleFollow: number; cutsceneLetterbox: boolean;
  // audio (read by the audio stream)
  volMaster: number; volEffects: number; volMusic: number; volDialogue: number; volRadio: number; volUi: number; monoAudio: boolean; radioOnEntry: 'last' | 'on' | 'off';
  // display
  brightness: number; safeZone: number; qualityPreset: 'auto' | 'low' | 'medium' | 'high' | 'ultra'; resolutionScale: number; fpsCap: 30 | 60 | 0;
  // units
  units: 'imperial' | 'metric'; clock24: boolean;
  // touch layout
  touchButtonSize: number; touchOpacity: number; touchLeftHanded: boolean;
  // touch controls (docs/briefs/TOUCH_CONTROLS.md): fire mode, gyro, steering, pedals, haptics, per-state sensitivity, layout edits
  fireMode: 'auto' | 'tap' | 'button'; gyroAim: 'off' | 'aim' | 'always';
  steerMode: 'stick' | 'arrows' | 'tilt'; steerAssist: boolean; steerAssistStrength: number; autoAccelerate: boolean;
  haptics: boolean; touchAimSensitivity: number; touchDriveLookSensitivity: number; touchLayout: TouchLayoutData;
  // remapping: action -> keyboard codes / gamepad button indices
  bindings: Record<string, { keys: string[]; pad: number[] }>;
  // gameplay: real minutes per in-game day (TIME brief / ENGINE_RESPONSES E12)
  dayLengthMinutes: number;
}

export const DEFAULTS: SettingsData = {
  controlPreset: 'standard',
  padLookSensitivity: 1, padLookCurve: 1.8, padDeadzone: 0.14, padInvertY: false, padVibration: true, padVibrationStrength: 0.8,
  mouseSensitivity: 1, mouseInvertY: false, touchLookSensitivity: 1,
  fov: 60, hud: true, subtitles: true, subtitleScale: 1, buttonPrompts: 'auto',
  hudMinimap: 'on', hudObjective: 'on', hudCash: 'dynamic', hudWeapon: 'dynamic', hudClock: 'dynamic', hudRadio: 'on',
  hudStamina: 'dynamic', hudInjuries: 'dynamic', hudLocation: 'on', hudDiscovery: 'on', hudTurns: 'on', hudPrompts: 'dynamic',
  minimapOrientation: 'heading', minimapSize: 'medium', mapIconSize: 'normal',
  subtitleMode: 'all', subtitleBackground: 'shadow', subtitleSpeakerNames: true, subtitleSpeakerColours: true, captions: false,
  textScale: 1, colourMode: 'off', highContrast: false, reduceFlashing: false, reduceMotion: false,
  sprintMode: 'hold', aimMode: 'hold', holdDelay: 1, tapAssist: false, unlimitedSprint: false, aimAssist: 'standard', skipTimers: false, menuNarration: false,
  cameraShake: 1, headBob: 0.6, filmGrain: 1, motionBlur: true, onFootFollow: 0.6, vehicleFollow: 0.8, cutsceneLetterbox: true,
  volMaster: 1, volEffects: 0.9, volMusic: 0.8, volDialogue: 1, volRadio: 0.85, volUi: 0.7, monoAudio: false, radioOnEntry: 'last',
  brightness: 1, safeZone: 1, qualityPreset: 'auto', resolutionScale: 1, fpsCap: 60,
  units: 'imperial', clock24: false,
  touchButtonSize: 1, touchOpacity: 0.8, touchLeftHanded: false,
  fireMode: 'auto', gyroAim: 'off', steerMode: 'stick', steerAssist: true, steerAssistStrength: 0.6, autoAccelerate: false,
  haptics: true, touchAimSensitivity: 1, touchDriveLookSensitivity: 1, touchLayout: {},
  bindings: {},
  dayLengthMinutes: 48,
};

const KEY = 't74.settings.v1';
type Listener = (s: SettingsData, changed: keyof SettingsData) => void;

class SettingsStore {
  readonly data: SettingsData = structuredClone(DEFAULTS);
  private listeners = new Set<Listener>();
  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SettingsData>;
        for (const k of Object.keys(DEFAULTS) as (keyof SettingsData)[]) {
          if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) (this.data as unknown as Record<string, unknown>)[k] = saved[k];
        }
        // v1 aim assist values
        const aa = this.data.aimAssist as string; if (aa === 'partial') this.data.aimAssist = 'standard'; else if (aa === 'full') this.data.aimAssist = 'strong';
      }
    } catch { /* private mode / blocked storage: defaults */ }
  }
  get<K extends keyof SettingsData>(k: K): SettingsData[K] { return this.data[k]; }
  set<K extends keyof SettingsData>(k: K, v: SettingsData[K]) {
    if (this.data[k] === v && typeof v !== 'object') return;
    this.data[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.data, k);
  }
  reset(keys?: (keyof SettingsData)[]) { for (const k of keys ?? (Object.keys(DEFAULTS) as (keyof SettingsData)[])) this.set(k, structuredClone(DEFAULTS[k]) as never); }
  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
}

export const settings = new SettingsStore();
