/**
 * Live sources built from native Web Audio nodes (cheap, run on the audio thread) and the
 * worklet processors. Each builder returns a SourceGraph the VoiceManager can start, stop,
 * Doppler-shift and dispose; live parameters are pushed through the returned handle.
 */
import type { SourceGraph } from '../core/voices';
import { ENGINE_PROFILES } from '../worklets/engineProfile';
import { Rng } from '../worklets/dsp';

export interface Noise { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer; white2: AudioBuffer; brown2: AudioBuffer }

/** Shared looping noise tables (2.5 s each, decorrelated pairs for stereo beds). */
export function makeNoise(ctx: BaseAudioContext): Noise {
  const mk = (kind: 'white' | 'pink' | 'brown', seed: number) => {
    const n = Math.round(ctx.sampleRate * 2.5); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0); const r = new Rng(seed);
    let b0 = 0, b1 = 0, b2 = 0, y = 0;
    for (let i = 0; i < n; i++) {
      const w = r.bi();
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.1; }
      else { y = 0.997 * y + 0.04 * w; d[i] = y * 1.4; }
    }
    // Crossfade the loop seam.
    const f = Math.round(ctx.sampleRate * 0.05); for (let i = 0; i < f; i++) { const a = i / f; d[n - f + i] = d[n - f + i] * (1 - a) + d[i] * a; }
    return b;
  };
  return { white: mk('white', 11), pink: mk('pink', 12), brown: mk('brown', 13), white2: mk('white', 14), brown2: mk('brown', 15) };
}
export const noiseBytes = (n: Noise) => Object.values(n).reduce((s, b: AudioBuffer) => s + b.length * 4, 0);

class Graph implements SourceGraph {
  output: GainNode;
  srcs: AudioScheduledSourceNode[] = []; nodes: AudioNode[] = []; worklets: AudioWorkletNode[] = [];
  pitchFn: ((p: number) => void) | null = null;
  constructor(private ctx: BaseAudioContext) { this.output = ctx.createGain(); this.nodes.push(this.output); }
  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; this.nodes.push(g); return g; }
  filter(type: BiquadFilterType, f: number, q = 0.7, gainDb = 0) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gainDb; this.nodes.push(b); return b; }
  loop(buf: AudioBuffer, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; this.srcs.push(s); return s; }
  osc(type: OscillatorType | PeriodicWave, f: number) { const o = this.ctx.createOscillator(); if (type instanceof PeriodicWave) o.setPeriodicWave(type); else o.type = type; o.frequency.value = f; this.srcs.push(o); return o; }
  shaper(k: number) { const w = this.ctx.createWaveShaper(); const c = new Float32Array(1025); for (let i = 0; i < 1025; i++) { const x = (i / 512 - 1) * k; c[i] = Math.tanh(x) / Math.tanh(k); } w.curve = c; this.nodes.push(w); return w; }
  worklet(name: string, opts: AudioWorkletNodeOptions) { const w = new AudioWorkletNode(this.ctx, name, opts); this.worklets.push(w); return w; }
  start(when: number, offset: number) { for (const s of this.srcs) { if (s instanceof AudioBufferSourceNode && s.buffer) s.start(when, s.loop ? offset % s.buffer.duration : offset); else s.start(when); } }
  stop(when: number) { for (const s of this.srcs) try { s.stop(when); } catch { /* */ } for (const w of this.worklets) w.port.postMessage('stop'); }
  dispose() {
    for (const s of this.srcs) { try { s.stop(); } catch { /* not started */ } try { s.disconnect(); } catch { /* */ } }
    for (const n of this.nodes) try { n.disconnect(); } catch { /* */ }
    for (const w of this.worklets) { try { w.port.postMessage('stop'); w.disconnect(); } catch { /* */ } w.port.onmessage = null; }
    this.srcs = []; this.nodes = []; this.worklets = [];
  }
  setPitch(p: number) { this.pitchFn?.(p); }
}

/** One-shot (or looping) buffer playback. */
export function bufferSource(ctx: BaseAudioContext, buf: AudioBuffer, opts: { rate?: number; loop?: boolean; gain?: number } = {}) {
  const g = new Graph(ctx); const s = ctx.createBufferSource(); s.buffer = buf; s.loop = !!opts.loop; const r = opts.rate ?? 1; s.playbackRate.value = r; g.srcs.push(s);
  g.output.gain.value = opts.gain ?? 1; s.connect(g.output);
  g.pitchFn = (p) => { s.playbackRate.value = r * p; };
  return g;
}

// ------------------------------------------------------------------------------------ vehicles
export interface EngineHandle extends SourceGraph { set(rpm: number, load: number, speed: number, wet: number): void }
export function engineSource(ctx: BaseAudioContext, noise: Noise, profileId: string, seed: number, gain = 1): EngineHandle {
  const g = new Graph(ctx);
  const profile = ENGINE_PROFILES[profileId] ?? ENGINE_PROFILES.v8_small;
  const w = g.worklet('t74-engine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { profile, seed } });
  const eg = g.gain(gain * 0.9); w.connect(eg).connect(g.output);
  // Tyre/road roar and wet spray: dominate above ~40 km/h.
  const road = g.loop(noise.pink, 1); const rlp = g.filter('lowpass', 500, 0.5); const rg = g.gain(0); road.connect(rlp).connect(rg).connect(g.output);
  const spray = g.loop(noise.white, 1); const sbp = g.filter('bandpass', 4500, 0.6); const sg = g.gain(0); spray.connect(sbp).connect(sg).connect(g.output);
  const rpm = w.parameters.get('rpm')!, load = w.parameters.get('load')!, pitch = w.parameters.get('pitch')!;
  w.parameters.get('gain')!.value = 1;
  g.pitchFn = (p) => { pitch.value = p; road.playbackRate.value = p; };
  const h = g as unknown as EngineHandle;
  h.set = (r, l, speed, wet) => {
    const t = ctx.currentTime; rpm.value = r; load.value = l;
    const v = Math.min(speed / 25, 1.4);
    rg.gain.setTargetAtTime(v * v * 0.35, t, 0.1); rlp.frequency.setTargetAtTime(250 + speed * 35, t, 0.1);
    sg.gain.setTargetAtTime(wet * v * 0.05, t, 0.1);
  };
  return h;
}

/** Period horns: dual-tone vibrating-disc car horn, nasal single-tone, and air horns. */
const HORNS: Record<string, { f: number[]; q: number; drive: number; bp: number; breath: number }> = {
  car: { f: [415, 520], q: 2.5, drive: 3.5, bp: 1400, breath: 0 },
  taxi: { f: [470], q: 3, drive: 5, bp: 1700, breath: 0 },
  compact: { f: [560], q: 3, drive: 5, bp: 2000, breath: 0 },
  bus: { f: [212, 267], q: 1.8, drive: 2.5, bp: 900, breath: 0.08 },
  truck: { f: [156, 196, 248], q: 1.6, drive: 2.2, bp: 800, breath: 0.1 },
};
export function hornSource(ctx: BaseAudioContext, noise: Noise, kind: string, seed: number, dur: number) {
  const g = new Graph(ctx); const h = HORNS[kind] ?? HORNS.car; const r = new Rng(seed);
  const real = new Float32Array(16), imag = new Float32Array(16); for (let k = 1; k < 16; k++) imag[k] = (k % 2 ? 1 : 0.45) / k;
  const wave = ctx.createPeriodicWave(real, imag);
  const sum = g.gain(1 / h.f.length); const sh = g.shaper(h.drive); const bp = g.filter('peaking', h.bp, h.q, 9); const lp = g.filter('lowpass', 5000, 0.7);
  const oscs = h.f.map((f) => { const o = g.osc(wave, f * (1 + r.bi() * 0.015)); o.connect(sum); return o; });
  sum.connect(sh).connect(bp).connect(lp).connect(g.output);
  if (h.breath > 0) { const n = g.loop(noise.white); const nf = g.filter('bandpass', 1200, 1); const ng = g.gain(h.breath); n.connect(nf).connect(ng).connect(g.output); }
  // Attack/release envelope over the honk length.
  const env = g.output.gain; const base = g.output;
  const origStart = g.start.bind(g);
  g.start = (when, offset) => { env.setValueAtTime(0, when); env.linearRampToValueAtTime(0.5, when + 0.012); env.setValueAtTime(0.5, when + Math.max(0.02, dur - 0.05)); env.linearRampToValueAtTime(0, when + dur); origStart(when, offset); for (const o of g.srcs) try { o.stop(when + dur + 0.05); } catch { /* */ } };
  g.pitchFn = (p) => { for (const o of oscs) o.detune.value = 1200 * Math.log2(p); };
  void base;
  return g;
}

/** Electronic wail/yelp siren of the era (generic), through a horn-speaker band-pass. */
export function sirenSource(ctx: BaseAudioContext, mode: 'wail' | 'yelp' | 'hilo', seed: number) {
  const g = new Graph(ctx); const r = new Rng(seed);
  const o = g.osc('sawtooth', mode === 'hilo' ? 740 : 950);
  const lfo = g.osc(mode === 'hilo' ? 'square' : 'triangle', mode === 'wail' ? 0.17 + r.next() * 0.05 : mode === 'yelp' ? 3.2 : 0.9);
  const depth = g.gain(mode === 'hilo' ? 150 : 380); lfo.connect(depth).connect(o.frequency);
  const sh = g.shaper(2.5); const bp = g.filter('bandpass', 1300, 0.9); const lp = g.filter('lowpass', 3800, 0.7); const out = g.gain(0.5);
  o.connect(sh).connect(bp).connect(lp).connect(out).connect(g.output);
  g.pitchFn = (p) => { o.detune.value = 1200 * Math.log2(p); };
  return g;
}

export interface SkidHandle extends SourceGraph { setIntensity(x: number, speed: number): void }
export function skidSource(ctx: BaseAudioContext, noise: Noise, seed: number): SkidHandle {
  const g = new Graph(ctx); const r = new Rng(seed);
  const n = g.loop(noise.white); const bp = g.filter('bandpass', 1800, 7); const bp2 = g.filter('bandpass', 3100, 9);
  const o = g.osc('sawtooth', 800 + r.next() * 300); const ob = g.filter('bandpass', 900, 4); const og = g.gain(0.4);
  const jitter = g.osc('sine', 13); const jg = g.gain(35); jitter.connect(jg).connect(o.frequency);
  const mix = g.gain(0); n.connect(bp).connect(mix); n.connect(bp2).connect(mix); o.connect(ob).connect(og).connect(mix); mix.connect(g.output);
  const h = g as unknown as SkidHandle;
  h.setIntensity = (x, speed) => { const t = ctx.currentTime; mix.gain.setTargetAtTime(Math.min(1, x) * 1.2, t, 0.04); o.frequency.setTargetAtTime(650 + speed * 18, t, 0.1); bp.frequency.setTargetAtTime(1400 + speed * 25, t, 0.1); };
  g.pitchFn = (p) => { o.detune.value = 1200 * Math.log2(p); };
  return h;
}

// ------------------------------------------------------------------------------------ world emitters
export interface GratingHandle extends SourceGraph { set(rumble: number, air: number, screech: number): void }
/** Subway ventilation grating: rumble from below, the air push ahead of a train, flange squeal. */
export function gratingSource(ctx: BaseAudioContext, noise: Noise, seed: number): GratingHandle {
  const g = new Graph(ctx); const r = new Rng(seed);
  const b = g.loop(noise.brown, 0.9 + r.next() * 0.2); const lp = g.filter('lowpass', 160, 0.9); const res = g.filter('peaking', 55 + r.next() * 15, 2, 8); const rg = g.gain(0);
  b.connect(lp).connect(res).connect(rg).connect(g.output);
  // Rail joints: amplitude flutter on the rumble.
  const clack = g.osc('square', 4.5 + r.next()); const cg = g.gain(0); clack.connect(cg).connect(rg.gain);
  const p = g.loop(noise.pink, 1); const abp = g.filter('bandpass', 380, 0.6); const ag = g.gain(0); p.connect(abp).connect(ag).connect(g.output);
  const w = g.loop(noise.white2); const sbp = g.filter('bandpass', 2900 + r.next() * 700, 14); const so = g.osc('sine', 3100 + r.next() * 500); const sg = g.gain(0);
  w.connect(sbp).connect(sg); so.connect(sg); sg.connect(g.output);
  const h = g as unknown as GratingHandle;
  h.set = (rumble, air, screech) => {
    const t = ctx.currentTime; rg.gain.setTargetAtTime(rumble * 1.6, t, 0.15); cg.gain.setTargetAtTime(rumble * 0.6, t, 0.15);
    ag.gain.setTargetAtTime(air * 0.9, t, 0.2); sg.gain.setTargetAtTime(screech * 0.08, t, 0.1);
  };
  return h;
}

export function steamSource(ctx: BaseAudioContext, noise: Noise, seed: number) {
  const g = new Graph(ctx); const r = new Rng(seed);
  const n = g.loop(noise.pink, 0.95 + r.next() * 0.1); const hp = g.filter('highpass', 900, 0.7); const bp = g.filter('peaking', 2600 + r.next() * 800, 0.8, 6); const out = g.gain(0.6);
  const lfo = g.osc('sine', 0.21 + r.next() * 0.2); const lg = g.gain(0.18); lfo.connect(lg).connect(out.gain);
  n.connect(hp).connect(bp).connect(out).connect(g.output);
  return g;
}

/** Window AC unit: compressor hum, fan blade AM, and the loose-panel rattle. */
export function acUnitSource(ctx: BaseAudioContext, noise: Noise, seed: number, sag = 1) {
  const g = new Graph(ctx); const r = new Rng(seed);
  const real = new Float32Array(8), imag = new Float32Array(8); imag[1] = 1; imag[2] = 0.6; imag[3] = 0.25; imag[4] = 0.15;
  const hum = g.osc(ctx.createPeriodicWave(real, imag), 120 * sag * (1 + r.bi() * 0.003)); const hg = g.gain(0.05); hum.connect(hg).connect(g.output);
  const fan = g.loop(noise.pink, 0.9 + r.next() * 0.2); const fbp = g.filter('bandpass', 420 + r.next() * 300, 0.9); const fg = g.gain(0.45);
  const blade = g.osc('sine', (6 + r.next() * 4) * sag); const bg = g.gain(0.15); blade.connect(bg).connect(fg.gain);
  fan.connect(fbp).connect(fg).connect(g.output);
  const rat = g.loop(noise.white2); const rhp = g.filter('bandpass', 2400 + r.next() * 1500, 3); const rg = g.gain(0);
  const rl = g.osc('square', 2.5 + r.next() * 3); const rlg = g.gain(r.next() < 0.5 ? 0.12 : 0.03); rl.connect(rlg).connect(rg.gain);
  rat.connect(rhp).connect(rg).connect(g.output);
  return g;
}

/** Electrical hum of the city at night: transformers, ballasts and neon (60 Hz family). */
export function humSource(ctx: BaseAudioContext, noise: Noise) {
  const g = new Graph(ctx);
  const real = new Float32Array(32), imag = new Float32Array(32); for (let k = 1; k < 32; k++) imag[k] = (k % 2 === 0 ? 1 : 0.3) / Math.pow(k, 1.1);
  const o = g.osc(ctx.createPeriodicWave(real, imag), 60); const lp = g.filter('lowpass', 1800, 0.7); const og = g.gain(0.08);
  const n = g.loop(noise.white); const nb = g.filter('bandpass', 3200, 2); const ng = g.gain(0.015); const am = g.osc('sine', 120); const amg = g.gain(0.015); am.connect(amg).connect(ng.gain);
  o.connect(lp).connect(og).connect(g.output); n.connect(nb).connect(ng).connect(g.output);
  return g;
}

/** Whole-city roar: distant traffic, ventilation and harbour, two decorrelated channels. */
export interface RoarHandle extends SourceGraph { set(level: number, brightness: number): void }
export function roarSource(ctx: BaseAudioContext, noise: Noise): RoarHandle {
  const g = new Graph(ctx);
  const merger = ctx.createChannelMerger(2); g.nodes.push(merger);
  const chan = (buf: AudioBuffer, pbuf: AudioBuffer, ch: number, rate: number) => {
    const b = g.loop(buf, rate); const lp = g.filter('lowpass', 220, 0.6); const bg = g.gain(1.2);
    const p = g.loop(pbuf, rate * 1.01); const plp = g.filter('lowpass', 800, 0.5); const php = g.filter('highpass', 120, 0.5); const pg = g.gain(0.7);
    b.connect(lp).connect(bg).connect(merger, 0, ch); p.connect(plp).connect(php).connect(pg).connect(merger, 0, ch);
    return { plp, pg };
  };
  const a = chan(noise.brown, noise.pink, 0, 1), b = chan(noise.brown2, noise.white2, 1, 0.97);
  b.pg.gain.value = 0.18; b.plp.frequency.value = 600;
  merger.connect(g.output); g.output.gain.value = 0; // set() glides it up to level
  const h = g as unknown as RoarHandle;
  h.set = (level, bright) => { const t = ctx.currentTime; g.output.gain.setTargetAtTime(level, t, 0.8); a.plp.frequency.setTargetAtTime(500 + 900 * bright, t, 0.8); b.plp.frequency.setTargetAtTime(450 + 800 * bright, t, 0.8); };
  return h;
}

/** Light summer wind through the canyons: slow gusts of filtered noise. */
export function windSource(ctx: BaseAudioContext, noise: Noise, seed: number) {
  const g = new Graph(ctx); const r = new Rng(seed);
  const n = g.loop(noise.pink, 0.8); const bp = g.filter('bandpass', 350, 0.5); const out = g.gain(0.25);
  const gust = g.osc('sine', 0.07 + r.next() * 0.04); const gg = g.gain(0.2); gust.connect(gg).connect(out.gain);
  const sweep = g.osc('sine', 0.05); const sg = g.gain(150); sweep.connect(sg).connect(bp.frequency);
  n.connect(bp).connect(out).connect(g.output);
  return g;
}

/** Generic worklet source (rain, walla, traffic sectors, voice, music, static). */
export function workletSource(ctx: BaseAudioContext, name: string, channels: number, processorOptions: Record<string, unknown> = {}) {
  const g = new Graph(ctx);
  const w = g.worklet(name, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels], processorOptions });
  w.connect(g.output);
  return { graph: g as SourceGraph, node: w };
}

/** Low pass-by of a high airliner on approach (rumble with slow spectral sweep). */
export function aircraftSource(ctx: BaseAudioContext, noise: Noise, dur: number) {
  const g = new Graph(ctx);
  const b = g.loop(noise.brown); const lp = g.filter('lowpass', 300, 0.7); const p = g.loop(noise.pink); const bp = g.filter('bandpass', 700, 0.8); const pg = g.gain(0.3);
  const out = g.gain(0); b.connect(lp).connect(out); p.connect(bp).connect(pg).connect(out); out.connect(g.output);
  const s = g.start.bind(g);
  g.start = (when, off) => { const e = out.gain; e.setValueAtTime(0, when); e.linearRampToValueAtTime(0.8, when + dur * 0.45); e.linearRampToValueAtTime(0, when + dur); bp.frequency.setValueAtTime(900, when); bp.frequency.linearRampToValueAtTime(450, when + dur); s(when, off); };
  return g;
}
