/**
 * UI view onto the single settings store (src/settings/Settings.ts, UI-owned since the hand-off):
 * per-key consumers (so the settings screen can say honestly what is live) and document-level
 * accessibility application.
 */
import { settings, type SettingsData } from '../../settings/Settings';

export type { Mode3 } from '../../settings/Settings';
export type Consumer = 'ui' | 'engine' | 'audio' | 'gameplay' | 'input' | 'post';
export type UiSettingsData = SettingsData;
export const uiSettings = settings;

export const CONSUMER: Partial<Record<keyof SettingsData, Consumer>> = {
  hudMinimap: 'ui', hudObjective: 'ui', hudCash: 'ui', hudWeapon: 'ui', hudClock: 'ui', hudRadio: 'ui', hudStamina: 'ui', hudInjuries: 'ui', hudLocation: 'ui', hudDiscovery: 'ui', hudTurns: 'ui', hudPrompts: 'ui',
  minimapOrientation: 'ui', minimapSize: 'ui', mapIconSize: 'ui',
  subtitleMode: 'ui', subtitleBackground: 'ui', subtitleSpeakerNames: 'ui', subtitleSpeakerColours: 'ui', captions: 'ui',
  textScale: 'ui', colourMode: 'ui', highContrast: 'ui', reduceFlashing: 'ui', reduceMotion: 'ui',
  sprintMode: 'input', aimMode: 'input', holdDelay: 'input', tapAssist: 'input', unlimitedSprint: 'gameplay', aimAssist: 'gameplay', skipTimers: 'gameplay', menuNarration: 'ui',
  cameraShake: 'engine', headBob: 'engine', filmGrain: 'post', motionBlur: 'post', onFootFollow: 'engine', vehicleFollow: 'engine', cutsceneLetterbox: 'ui',
  volMaster: 'audio', volEffects: 'audio', volMusic: 'audio', volDialogue: 'audio', volRadio: 'audio', volUi: 'audio', monoAudio: 'audio', radioOnEntry: 'audio',
  brightness: 'post', safeZone: 'ui', qualityPreset: 'engine', resolutionScale: 'engine', fpsCap: 'engine',
  units: 'ui', clock24: 'ui', touchButtonSize: 'ui', touchOpacity: 'ui', touchLeftHanded: 'ui', bindings: 'input', dayLengthMinutes: 'engine',
  controlPreset: 'input', padLookSensitivity: 'input', padLookCurve: 'input', padDeadzone: 'input', padInvertY: 'input', padVibration: 'input', padVibrationStrength: 'input',
  mouseSensitivity: 'input', mouseInvertY: 'input', touchLookSensitivity: 'input', fov: 'engine', hud: 'ui', subtitles: 'ui', subtitleScale: 'ui', buttonPrompts: 'ui',
};

/** Applies the global accessibility settings to the document (text scale, contrast, colour mode, motion). */
export function applyGlobalUiSettings() {
  const s = settings.data, r = document.documentElement;
  r.style.setProperty('--ui-scale', String(s.textScale));
  r.style.setProperty('--safe-zone', String(s.safeZone));
  r.style.setProperty('--sub-scale', String(s.subtitleScale));
  r.dataset.contrast = s.highContrast ? 'high' : '';
  r.dataset.colour = s.colourMode;
  r.dataset.motion = s.reduceMotion ? 'reduce' : '';
}
