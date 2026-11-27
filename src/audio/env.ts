/** Shared state handed to every audio subsystem (one object, no globals). */
import type { AudioQuality, BusId, Category, Vec3 } from './config';
import type { VoiceManager, Voice } from './core/voices';
import type { AssetBank } from './assets/bank';
import type { Noise } from './synth/live';
import type { AcousticGeometry } from './acoustics/geometry';
import type { CityMap } from './world/cityMap';
import type { CanyonAnalyzer } from './acoustics/canyon';
import type { Rng } from './worklets/dsp';

export type Weather = 'clear' | 'overcast' | 'rain';
export type Power = 'on' | 'dim' | 'off';

export interface OneShotOpts { bus?: Exclude<BusId, 'master'>; category?: Category; gain?: number; rate?: number; priority?: number; at?: Vec3 | (() => Vec3); vel?: () => Vec3; wet?: number; doppler?: boolean }

export interface Env {
  ctx: BaseAudioContext;
  vm: VoiceManager;
  bank: AssetBank;
  noise: Noise;
  geo: AcousticGeometry;
  map: CityMap;
  canyon: CanyonAnalyzer;
  q: AudioQuality;
  rng: Rng;
  clock: { minutes: number; date: string; hour: number; weekday: number };
  weather: { kind: Weather; rain: number; wet: number };
  power(x: number, z: number): Power;
  interior: string | null;
  /** Ambient-traffic level 0..1 at the listener from the sim (or the clock fallback). */
  traffic: { near: number; avenue: number; heavy: number; speed: number; fromSim: boolean };
  peds: { near: number; fromSim: boolean };
  emit(type: string, e: unknown): void;
  oneShot(family: string, o?: OneShotOpts): Voice | null;
  /** Gate for anything that schedules: false while the context is suspended or the game is paused. */
  live: boolean;
  /** 0..1 how much the listener is in a park (set by the ambience mix). */
  parkWeight?: number;
}
