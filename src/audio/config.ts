/** Audio quality presets, buses, categories and distance curves. One place to tune the mix. */
export type Vec3 = [number, number, number];
export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export type BusId = 'master' | 'radio' | 'dialogue' | 'sfx' | 'ambience' | 'ui';
export const BUSES: readonly Exclude<BusId, 'master'>[] = ['radio', 'dialogue', 'sfx', 'ambience', 'ui'];

export interface AudioQuality {
  name: QualityName;
  /** Hard cap on real (playing) voices; above this, voices go virtual. */
  voices: number;
  /** Vehicles with a full procedural engine synth; the rest fold into the traffic mass. */
  engines: number;
  /** Nearest N positional voices use HRTF panning (the rest equal-power). */
  hrtf: number;
  fdnLines: 4 | 8;
  /** Line-of-sight/diffraction checks per frame (round-robin over emitters). */
  occlusionPerFrame: number;
  canyonRays: number;
  wallaTalkers: number;
  /** Decoded audio memory budget (MB): baked one-shots + streamed assets. */
  memoryMB: number;
  /** Variants baked per one-shot family at load. */
  variants: number;
  latencyHint: AudioContextLatencyCategory;
  /** Voices that may be promoted (nodes built) per frame; spreads node-construction cost. */
  promotionsPerFrame: number;
}

export const AUDIO_PRESETS: Record<QualityName, AudioQuality> = {
  low: { name: 'low', promotionsPerFrame: 3, voices: 24, engines: 2, hrtf: 0, fdnLines: 4, occlusionPerFrame: 4, canyonRays: 12, wallaTalkers: 5, memoryMB: 25, variants: 3, latencyHint: 'balanced' },
  medium: { name: 'medium', promotionsPerFrame: 4, voices: 40, engines: 4, hrtf: 2, fdnLines: 8, occlusionPerFrame: 6, canyonRays: 16, wallaTalkers: 7, memoryMB: 40, variants: 4, latencyHint: 'interactive' },
  high: { name: 'high', promotionsPerFrame: 6, voices: 64, engines: 6, hrtf: 6, fdnLines: 8, occlusionPerFrame: 10, canyonRays: 24, wallaTalkers: 10, memoryMB: 60, variants: 6, latencyHint: 'interactive' },
  ultra: { name: 'ultra', promotionsPerFrame: 8, voices: 96, engines: 8, hrtf: 12, fdnLines: 8, occlusionPerFrame: 16, canyonRays: 32, wallaTalkers: 12, memoryMB: 80, variants: 8, latencyHint: 'interactive' },
};

/** Loudness profiles: integrated target and the true-peak ceiling the limiter enforces. */
export const LOUDNESS = {
  /** Phones/laptops: gentle 2:1 bus compression above -18 dBFS (the node adds ~+5 dB makeup), then the TP limiter. */
  mobile: { lufs: -16, ceilingDbtp: -1.5, trimDb: -3.7, comp: { threshold: -18, ratio: 2, knee: 10, attack: 0.012, release: 0.25 } },
  /** Full dynamic range (compressor bypassed: ratio 1). */
  homeTheatre: { lufs: -23, ceilingDbtp: -1.5, trimDb: -8.9, comp: { threshold: 0, ratio: 1, knee: 0, attack: 0.012, release: 0.25 } },
} as const;
export type LoudnessProfile = keyof typeof LOUDNESS;

export type Category =
  | 'vehicle' | 'horn' | 'siren' | 'tyre' | 'impact' | 'footstep' | 'voice' | 'crowd' | 'emitter' | 'subway' | 'radio' | 'weather' | 'bed' | 'ui' | 'animal' | 'gunfire';

/** Distance curves: gain = ref / (ref + roll * (d - ref)) above ref, faded to 0 over the last 20% before max. */
export const CURVES: Record<Category, { ref: number; max: number; roll: number; wet: number }> = {
  vehicle: { ref: 4, max: 260, roll: 0.55, wet: 0.35 },
  horn: { ref: 5, max: 700, roll: 0.4, wet: 0.5 },
  siren: { ref: 8, max: 1800, roll: 0.9, wet: 0.6 },
  tyre: { ref: 4, max: 300, roll: 0.55, wet: 0.4 },
  impact: { ref: 5, max: 400, roll: 0.5, wet: 0.5 },
  /** Gunshots carry for blocks; a lot of what you hear at range is the canyon, so the wet send is high. */
  gunfire: { ref: 3, max: 2500, roll: 0.35, wet: 0.8 },
  footstep: { ref: 1.5, max: 40, roll: 1.3, wet: 0.35 },
  voice: { ref: 1.5, max: 45, roll: 1.15, wet: 0.3 },
  /** A sidewalk of people is a line source, not a point: shallow roll-off. */
  crowd: { ref: 6, max: 90, roll: 0.7, wet: 0.35 },
  emitter: { ref: 2, max: 90, roll: 1.1, wet: 0.4 },
  subway: { ref: 3, max: 110, roll: 1.0, wet: 0.5 },
  radio: { ref: 2, max: 60, roll: 1.15, wet: 0.35 },
  animal: { ref: 3, max: 150, roll: 0.9, wet: 0.4 },
  weather: { ref: 1, max: 1e9, roll: 0, wet: 0.2 },
  bed: { ref: 1, max: 1e9, roll: 0, wet: 0.15 },
  ui: { ref: 1, max: 1e9, roll: 0, wet: 0 },
};

/**
 * The mixing desk: category trims in dB applied to every voice. Calibrated against the stems tool
 * (tools/audio/stems.ts) so that, at rush hour on Herald Square, nearby traffic and horns sit over
 * the city bed the way they do on location recordings of busy avenues (horns ~10 dB over the street
 * Leq at 30 m), and the crowd reads clearly on the sidewalks.
 */
export const MIX_DB: Record<Category, number> = {
  vehicle: 14, horn: 12, siren: 3, tyre: 9, impact: 9, footstep: 8, voice: 0, crowd: -1, emitter: 6, subway: 8, radio: 4, animal: 6, weather: 0, bed: 0, ui: 0, gunfire: 8,
};
export const MIX_GAIN = Object.fromEntries(Object.entries(MIX_DB).map(([k, v]) => [k, Math.pow(10, v / 20)])) as Record<Category, number>;

export const SPEED_OF_SOUND = 343;

export function distanceGain(cat: Category, d: number): number {
  const c = CURVES[cat];
  if (c.roll === 0) return 1;
  if (d >= c.max) return 0;
  const g = d <= c.ref ? 1 : c.ref / (c.ref + c.roll * (d - c.ref));
  const fadeStart = c.max * 0.8;
  return d > fadeStart ? g * (1 - (d - fadeStart) / (c.max - fadeStart)) : g;
}

/** Air absorption as a low-pass cutoff (Hz) for distance d (m): about 6 kHz at 300 m in humid summer air. */
export function airCutoff(d: number): number {
  return Math.max(900, 20000 * Math.exp(-d / 250));
}
