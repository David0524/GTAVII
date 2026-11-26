/**
 * UI-owned settings (ENGINE_REQUESTS ui 3). Lives beside the engine's src/settings/Settings.ts (which
 * keeps its 15 keys) until the hand-off merges the two. Every key declares who reads it, so the
 * settings screen can say honestly which options are live today and which wait on another stream.
 * Persisted per device in localStorage; the game runs with defaults if storage is blocked.
 */
export type Mode3 = 'on' | 'dynamic' | 'off';
export type Consumer = 'ui' | 'engine' | 'audio' | 'gameplay' | 'input' | 'post';

export interface UiSettingsData {
  // HUD elements (On / Dynamic / Off)
  hudMinimap: Mode3; hudObjective: Mode3; hudCash: Mode3; hudWeapon: Mode3; hudClock: Mode3; hudRadio: Mode3;
  hudStamina: Mode3; hudInjuries: Mode3; hudLocation: Mode3; hudDiscovery: Mode3; hudTurns: Mode3; hudPrompts: Mode3;
  // map
  minimapOrientation: 'heading' | 'north'; minimapSize: 'small' | 'medium' | 'large'; mapIconSize: 'normal' | 'large';
  // subtitles and captions
  subtitleMode: 'off' | 'scene' | 'all'; subtitleBackground: 'none' | 'shadow' | 'solid'; subtitleSpeakerNames: boolean; subtitleSpeakerColours: boolean; captions: boolean;
  // accessibility
  textScale: number; colourMode: 'off' | 'protan' | 'deutan' | 'tritan'; highContrast: boolean; reduceFlashing: boolean; reduceMotion: boolean;
  sprintMode: 'hold' | 'toggle'; aimMode: 'hold' | 'toggle'; holdDelay: number; tapAssist: boolean; unlimitedSprint: boolean; aimAssist: 'off' | 'partial' | 'full';
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
  // remapping: action -> keyboard codes / gamepad button indices
  bindings: Record<string, { keys: string[]; pad: number[] }>;
}

export const UI_DEFAULTS: UiSettingsData = {
  hudMinimap: 'on', hudObjective: 'on', hudCash: 'dynamic', hudWeapon: 'dynamic', hudClock: 'dynamic', hudRadio: 'on',
  hudStamina: 'dynamic', hudInjuries: 'dynamic', hudLocation: 'on', hudDiscovery: 'on', hudTurns: 'on', hudPrompts: 'dynamic',
  minimapOrientation: 'heading', minimapSize: 'medium', mapIconSize: 'normal',
  subtitleMode: 'all', subtitleBackground: 'shadow', subtitleSpeakerNames: true, subtitleSpeakerColours: true, captions: false,
  textScale: 1, colourMode: 'off', highContrast: false, reduceFlashing: false, reduceMotion: false,
  sprintMode: 'hold', aimMode: 'hold', holdDelay: 1, tapAssist: false, unlimitedSprint: false, aimAssist: 'partial', skipTimers: false, menuNarration: false,
  cameraShake: 1, headBob: 0.6, filmGrain: 1, motionBlur: true, onFootFollow: 0.6, vehicleFollow: 0.8, cutsceneLetterbox: true,
  volMaster: 1, volEffects: 0.9, volMusic: 0.8, volDialogue: 1, volRadio: 0.85, volUi: 0.7, monoAudio: false, radioOnEntry: 'last',
  brightness: 1, safeZone: 1, qualityPreset: 'auto', resolutionScale: 1, fpsCap: 60,
  units: 'imperial', clock24: false,
  touchButtonSize: 1, touchOpacity: 0.8, touchLeftHanded: false,
  bindings: {},
};

/** Who reads each key (shown on the settings screen as "Applies when …" until wired). */
export const CONSUMER: Record<keyof UiSettingsData, Consumer> = {
  hudMinimap: 'ui', hudObjective: 'ui', hudCash: 'ui', hudWeapon: 'ui', hudClock: 'ui', hudRadio: 'ui', hudStamina: 'ui', hudInjuries: 'ui', hudLocation: 'ui', hudDiscovery: 'ui', hudTurns: 'ui', hudPrompts: 'ui',
  minimapOrientation: 'ui', minimapSize: 'ui', mapIconSize: 'ui',
  subtitleMode: 'ui', subtitleBackground: 'ui', subtitleSpeakerNames: 'ui', subtitleSpeakerColours: 'ui', captions: 'ui',
  textScale: 'ui', colourMode: 'ui', highContrast: 'ui', reduceFlashing: 'ui', reduceMotion: 'ui',
  sprintMode: 'input', aimMode: 'input', holdDelay: 'input', tapAssist: 'input', unlimitedSprint: 'gameplay', aimAssist: 'gameplay', skipTimers: 'gameplay', menuNarration: 'ui',
  cameraShake: 'engine', headBob: 'engine', filmGrain: 'post', motionBlur: 'post', onFootFollow: 'engine', vehicleFollow: 'engine', cutsceneLetterbox: 'ui',
  volMaster: 'audio', volEffects: 'audio', volMusic: 'audio', volDialogue: 'audio', volRadio: 'audio', volUi: 'audio', monoAudio: 'audio', radioOnEntry: 'audio',
  brightness: 'post', safeZone: 'ui', qualityPreset: 'engine', resolutionScale: 'engine', fpsCap: 'engine',
  units: 'ui', clock24: 'ui', touchButtonSize: 'ui', touchOpacity: 'ui', touchLeftHanded: 'ui', bindings: 'input',
};

const KEY = 't74.ui.settings.v1';
type Listener = (s: UiSettingsData, k: keyof UiSettingsData) => void;

class UiSettingsStore {
  readonly data: UiSettingsData = structuredClone(UI_DEFAULTS);
  private listeners = new Set<Listener>();
  constructor() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<UiSettingsData>;
        for (const k of Object.keys(UI_DEFAULTS) as (keyof UiSettingsData)[]) if (k in saved && typeof saved[k] === typeof UI_DEFAULTS[k]) (this.data as unknown as Record<string, unknown>)[k] = saved[k];
      }
    } catch { /* defaults */ }
  }
  get<K extends keyof UiSettingsData>(k: K): UiSettingsData[K] { return this.data[k]; }
  set<K extends keyof UiSettingsData>(k: K, v: UiSettingsData[K]) {
    if (this.data[k] === v) return;
    this.data[k] = v;
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* ignore */ }
    for (const l of this.listeners) l(this.data, k);
  }
  reset(group?: (keyof UiSettingsData)[]) { for (const k of group ?? (Object.keys(UI_DEFAULTS) as (keyof UiSettingsData)[])) this.set(k, structuredClone(UI_DEFAULTS[k]) as never); }
  subscribe(l: Listener) { this.listeners.add(l); return () => this.listeners.delete(l); }
}
export const uiSettings = new UiSettingsStore();

/** Applies the global accessibility settings to the document (text scale, contrast, colour mode, motion). */
export function applyGlobalUiSettings() {
  const s = uiSettings.data, r = document.documentElement;
  r.style.setProperty('--ui-scale', String(s.textScale));
  r.style.setProperty('--safe-zone', String(s.safeZone));
  r.dataset.contrast = s.highContrast ? 'high' : '';
  r.dataset.colour = s.colourMode;
  r.dataset.motion = s.reduceMotion ? 'reduce' : '';
}
