/**
 * Headless offline render harness (?audio=offline). tools/audio/render.ts drives it through
 * Playwright: window.__T74AUDIO.render(id, opts) renders a scenario into an OfflineAudioContext,
 * stepping the simulation and AudioSystem.update() every 768 samples (16 ms of audio time, a
 * 62.5 fps frame; suspend points must sit on 128-sample render quanta) and returns the PCM plus
 * the checks the test asserts on.
 */
import { AudioSystem } from '../index';
import { MockSim } from './mockSim';
import { SCENARIOS } from './scenarios';
import { CityMap } from '../world/cityMap';
import type { StreetRec } from '../acoustics/geometry';
import type { QualityName, LoudnessProfile } from '../config';
import { AUDIO_PRESETS } from '../config';
import { GROUPS } from '../assets/bank';

// ---- connection bookkeeping (independent of the engine's own disposal code)
const live = new Map<AudioNode, number>();
const created = { n: 0 };
const oc = AudioNode.prototype.connect as (...a: unknown[]) => unknown;
const od = AudioNode.prototype.disconnect as (...a: unknown[]) => unknown;
(AudioNode.prototype as unknown as { connect: unknown }).connect = function (this: AudioNode, ...a: unknown[]) { if (!live.has(this)) created.n++; live.set(this, (live.get(this) ?? 0) + 1); return oc.apply(this, a); };
(AudioNode.prototype as unknown as { disconnect: unknown }).disconnect = function (this: AudioNode, ...a: unknown[]) {
  if (a.length === 0) live.delete(this); else { const c = (live.get(this) ?? 1) - 1; if (c <= 0) live.delete(this); else live.set(this, c); }
  return od.apply(this, a);
};

function b64(buf: ArrayBuffer): string {
  const u = new Uint8Array(buf); let s = ''; const CH = 0x8000;
  for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, Array.from(u.subarray(i, i + CH)));
  return btoa(s);
}

export async function render(id: string, o: { quality?: QualityName; seconds?: number; profile?: LoudnessProfile; sr?: number; solo?: string; only?: string } = {}) {
  const sc = SCENARIOS.find((s) => s.id === id)!; const seconds = o.seconds ?? 60, sr = o.sr ?? 48000, quality = o.quality ?? 'high';
  live.clear(); created.n = 0;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
  const sys = new AudioSystem({ quality, context: ctx });
  await sys.whenReady();
  const streets: StreetRec[] = await fetch('/data/streets.json').then((r) => r.json());
  await sys.load({ streets });
  // Deterministic tests: make every sound group resident up front.
  await Promise.all(Object.keys(GROUPS).map((g) => sys.debug.bank.loadGroup(g)));
  if (o.profile) sys.setLoudnessProfile(o.profile);
  if (o.only) { const keep = new RegExp(o.only); sys.debug.vm.mute = { test: (n: string) => !keep.test(n) } as RegExp; }
  if (o.solo) for (const b of ['radio', 'dialogue', 'sfx', 'ambience', 'ui'] as const) if (b !== o.solo) sys.setBusVolume(b, 0);
  sys.setClock(sc.clock.minutes, sc.clock.date); sys.setWeather(sc.weather);
  if (sc.weather === 'rain') { sys.debug.env.weather.rain = 1; sys.debug.env.weather.wet = 1; }
  const map = new CityMap(streets);
  const st = sc.start(map);
  const preset = AUDIO_PRESETS[quality];
  const sim = new MockSim(streets, 1974, quality === 'low' ? 40 : 150, quality === 'low' ? 120 : 400);
  sim.density = sc.traffic; sim.pedDensity = sc.peds;
  for (let k = 0; k < 900; k++) sim.update(0.1, { x: st.x, z: st.z }, sc.clock.minutes / 60); // warm up 90 s
  sys.bindSim(sim);
  const step = 768 / sr; const frames = Math.floor(seconds / step) - 1;
  let x = st.x, z = st.z, maxReal = 0, maxTotal = 0; const voiceLog: number[] = [];
  const listener = () => ({ position: [x, 1.65, z] as [number, number, number], forward: [st.dx, 0, st.dz] as [number, number, number], up: [0, 1, 0] as [number, number, number], velocity: [st.dx * sc.walk, 0, st.dz * sc.walk] as [number, number, number] });
  let minutes = sc.clock.minutes;
  const tick = () => {
    x += st.dx * sc.walk * step; z += st.dz * sc.walk * step; minutes += step / 60;
    sim.update(step, { x, z }, minutes / 60);
    sys.setClock(minutes, sc.clock.date);
    sys.update(step, listener());
    const v = sys.stats.voices; maxReal = Math.max(maxReal, v.real ?? 0); maxTotal = Math.max(maxTotal, v.total ?? 0);
  };
  for (let k = 1; k <= frames; k++) {
    const t = k * step;
    void ctx.suspend(t).then(() => { tick(); if (k % 62 === 0) voiceLog.push(sys.stats.voices.real ?? 0); for (const e of sc.events ?? []) if (Math.abs(e.t - t) < step / 2) sys.play(e.play, e.offset ? [x + e.offset[0], 1, z + e.offset[1]] : undefined, e.params); return ctx.resume(); });
  }
  sys.update(step, listener());
  const t0 = performance.now();
  const buf = await ctx.startRendering();
  const renderMs = performance.now() - t0;
  const stats = sys.stats;
  const timing = sys.timing.samples.slice().sort((a, b) => a - b);
  const pct = (p: number) => timing[Math.min(timing.length - 1, Math.floor(timing.length * p))];
  // Unload and count what's still wired.
  const connectedBefore = live.size;
  sys.dispose(false);
  const leaked = [...live.keys()].map((n) => n.constructor.name);
  // Output sanity.
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let nan = 0, sub = 0, peak = 0;
  for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) { const v = ch[i]; if (!Number.isFinite(v)) nan++; else { const a = Math.abs(v); if (a !== 0 && a < 1.1754944e-38) sub++; if (a > peak) peak = a; } }
  const inter = new Float32Array(L.length * 2); for (let i = 0; i < L.length; i++) { inter[i * 2] = L[i]; inter[i * 2 + 1] = R[i]; }
  return {
    id, title: sc.title, quality, profile: o.profile ?? 'mobile', sr, seconds, renderMs, pcm: b64(inter.buffer),
    checks: { nan, subnormals: sub, samplePeak: peak, maxRealVoices: maxReal, voiceCap: preset.voices, maxTotalVoices: maxTotal, connectedBeforeUnload: connectedBefore, leakedNodes: leaked.length, leakedTypes: leaked.slice(0, 20), nodesCreated: created.n, limiter: stats.mixer },
    timing: { frames: timing.length, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: timing[timing.length - 1], mean: timing.reduce((a, b) => a + b, 0) / Math.max(1, timing.length) },
    stats: { ...stats, voices: stats.voices, voiceLog },
  };
}

/** Limiter torture: impulses, +12 dB square bursts and near-Nyquist sines through the master chain. */
export async function limiterTest(sr = 48000) {
  const sys = new AudioSystem({ quality: 'high', context: new OfflineAudioContext(2, sr * 6, sr) });
  await sys.whenReady();
  const ctx = sys.context; const n = sr * 6; const b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t < 1) d[i] = (i % 4800 === 0) ? 4 : 0;                                    // isolated full-scale x4 impulses
      else if (t < 2) d[i] = Math.sign(Math.sin(2 * Math.PI * 110 * t)) * 4 * (Math.sin(2 * Math.PI * 3 * t) > 0 ? 1 : 0.05); // gated +12 dB square
      else if (t < 4) d[i] = 3 * Math.sin(2 * Math.PI * (sr / 4) * t + Math.PI / 4 + c);   // fs/4 sine: inter-sample peaks
      else d[i] = 2.5 * Math.sin(2 * Math.PI * (11000 + 9000 * (t - 4) / 2) * t);           // rising sweep to 20 kHz
    }
  }
  const s = ctx.createBufferSource(); s.buffer = b; s.connect(sys.debug.mixer.busIn.sfx); s.start(0);
  const out = await (ctx as OfflineAudioContext).startRendering();
  const L = out.getChannelData(0), R = out.getChannelData(1); const inter = new Float32Array(n * 2); for (let i = 0; i < n; i++) { inter[i * 2] = L[i]; inter[i * 2 + 1] = R[i]; }
  const st = sys.stats.mixer; sys.dispose(false);
  return { pcm: b64(inter.buffer), sr, clamps: st.clips };
}

export function startOffline() {
  (window as unknown as { __T74AUDIO: unknown }).__T74AUDIO = { render, limiterTest, scenarios: SCENARIOS.map((s) => s.id), ready: true };
  document.getElementById('loading')?.remove();
  document.body.insertAdjacentHTML('beforeend', '<pre id="t74a" style="color:#ccc;padding:20px">audio offline harness ready</pre>');
}
