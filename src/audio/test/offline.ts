/**
 * Headless offline render harness (?audio=offline). tools/audio/render.ts drives it through
 * Playwright: window.__T74AUDIO.render(id, opts) renders a scenario into an OfflineAudioContext,
 * stepping the simulation and AudioSystem.update() every 768 samples (16 ms of audio time, a
 * 62.5 fps frame; suspend points must sit on 128-sample render quanta) and returns the PCM plus
 * the checks the test asserts on.
 */
import { AudioSystem, type GunTier, type Material, type ShotReport } from '../index';
import { MockSim } from './mockSim';
import { SCENARIOS, type Scenario } from './scenarios';
import { CityMap } from '../world/cityMap';
import type { StreetRec } from '../acoustics/geometry';
import type { QualityName, LoudnessProfile } from '../config';
import { AUDIO_PRESETS } from '../config';
import { GROUPS } from '../assets/bank';
import { heightAt } from '../../shared/terrain';

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

export async function render(id: string, o: { quality?: QualityName; seconds?: number; profile?: LoudnessProfile; sr?: number; solo?: string; only?: string; /** Replace the scenario's events. */ events?: Scenario['events']; /** Listener stands still. */ still?: boolean; /** Load narrative content and rendered voices (dispatch, barks). */ content?: boolean } = {}) {
  const base = SCENARIOS.find((s) => s.id === id)!;
  const sc: Scenario = { ...base, events: o.events ?? base.events, walk: o.still ? 0 : base.walk }; const seconds = o.seconds ?? 60, sr = o.sr ?? 48000, quality = o.quality ?? 'high';
  live.clear(); created.n = 0;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(seconds * sr), sampleRate: sr });
  const sys = new AudioSystem({ quality, context: ctx, content: !!o.content }); // hermetic by default: no narrative content fetched
  await sys.whenReady();
  const streets: StreetRec[] = await fetch('/data/streets.json').then((r) => r.json());
  await sys.load({ streets });
  // Deterministic tests: make every sound group resident up front.
  await Promise.all(Object.keys(GROUPS).map((g) => sys.debug.bank.loadGroup(g)));
  if (o.profile) sys.setLoudnessProfile(o.profile);
  if (o.only) { const keep = new RegExp(o.only); sys.debug.vm.mute = { test: (n: string) => !keep.test(n) } as RegExp; }
  if (o.solo) for (const b of ['radio', 'dialogue', 'sfx', 'ambience', 'ui'] as const) if (b !== o.solo) sys.setBusVolume(b, 0);
  sys.setClock(sc.clock.minutes, sc.clock.date); sys.setWeather(sc.weather);
  if (sc.power) sys.setPower('all', sc.power);
  if (sc.weather === 'rain') { sys.debug.env.weather.rain = 1; sys.debug.env.weather.wet = 1; }
  const map = new CityMap(streets);
  const st = sc.start(map);
  const preset = AUDIO_PRESETS[quality];
  const sim = new MockSim(streets, 1974, quality === 'low' ? 40 : 150, quality === 'low' ? 120 : 400);
  sim.density = sc.traffic; sim.pedDensity = sc.peds;
  for (let k = 0; k < 900; k++) sim.update(0.1, { x: st.x, z: st.z }, sc.clock.minutes / 60); // warm up 90 s
  sys.bindSim(sim);
  // Vendors: sim-owned types arrive through the mock sim's events and views (the same path as the real sim,
  // src/sim/vendors.ts); the ice-cream truck, which the sim doesn't own, through the direct handle.
  const truck = new Map<string, ReturnType<typeof sys.vendor>>(); const pushing = new Set<string>();
  for (const v of sc.vendors ?? []) {
    const vx = st.x + v.offset[0], vz = st.z + v.offset[1];
    if (v.type === 'ice_cream_truck') { truck.set(v.id, sys.vendor(v.id, v.type, [vx, heightAt(vx, vz), vz])); continue; }
    sim.vendorViews.push({ id: v.id, kind: v.type, state: 'open', cartX: vx, cartZ: vz, open: true });
    sim.fire('vendorSpawned', { id: v.id, kind: v.type, pedId: -1, x: vx, z: vz - 0.8, cart: { prop: 'cart', x: vx, z: vz, yaw: 0 }, arriving: false });
  }
  const vendorEvent = (e: string, p?: Record<string, number>) => {
    const [, id, act] = e.split(':'); if (truck.has(id)) return;
    if (act === 'sale') sim.fire('vendorServed', { id, kind: '', pedId: -1, good: '' });
    else if (act === 'call') sim.fire('vendorCall', { id, kind: '', pedId: -1, x: 0, z: 0, bark: 'barks.vendor_calls' });
    else if (act === 'knockOver') { sim.fire('vendorAct', { id, pedId: -1, act: 'right_cart' }); const w = sim.vendorViews.find((q) => q.id === id); if (w) { w.open = false; w.state = 'righting'; } void p; }
    else if (act === 'righted') { sim.fire('cartRighted', { id }); const w = sim.vendorViews.find((q) => q.id === id); if (w) { w.open = true; w.state = 'open'; } }
    else if (act === 'move') pushing.add(id); else if (act === 'stop') pushing.delete(id);
  };
  /** Fire a raw sim event at an offset from the listener's start (bumps, litter, monte scatter). Strings in params: none needed. */
  const simEvent = (type: string, off: [number, number] = [0, 0], p: Record<string, number> = {}) => {
    const KINDS = ['brush', 'stumble', 'knockdown'], RESP = ['none', 'annoyed', 'angry', 'frightened'];
    sim.fire(type, { id: 'test', x: st.x + off[0], z: st.z + off[1], kind: KINDS[p.kind ?? 0], response: RESP[p.response ?? 0], archetype: 'npc.garment_pushboy', dirX: 1, dirZ: 0, by: 'ped', byPlayer: !!p.byPlayer });
  };
  // Combat events: 'gun:<tier>', 'hit:<material>', 'whiz' (a round passing ~1.5 m from the listener), 'gunfoley:<kind>'.
  const shots: (ShotReport & { t: number })[] = [];
  const combatEvent = (e: string, at: [number, number, number], t: number) => {
    const [kind, arg] = e.split(':');
    if (kind === 'gun') { const r = sys.gunshot(at, arg as GunTier, e.endsWith(':click') ? { family: 'test.click' } : {}); if (r) shots.push({ ...r, t }); }
    else if (kind === 'hit') sys.bulletImpact(at, arg as Material);
    else if (kind === 'gunfoley') sys.gunFoley(arg as 'pump', at);
    else if (kind === 'whiz') sys.bulletPass(at, [x + 1.5 * st.dz, 1.6, z - 1.5 * st.dx]);
  };
  // Gameplay events for the dispatch scanner, through bindGameplay exactly as gameplay's emitter delivers them.
  const gpH = new Map<string, ((e: unknown) => void)[]>(); sys.bindGameplay({ on: (t, cb) => { gpH.set(t, [...(gpH.get(t) ?? []), cb]); } });
  const gp = (t: string, e: unknown) => { for (const cb of gpH.get(t) ?? []) cb(e); };
  const dispatchLog: { t: number; text: string; speaker: string; duration: number; urgent: boolean }[] = [];
  sys.on('dispatch', (e) => dispatchLog.push({ t: +ctx.currentTime.toFixed(2), ...e }));
  const gpEvent = (name: string, at: [number, number]) => {
    const place = sys.placeName(at[0], at[1]);
    if (name === 'report') { gp('reportFiled', { id: 1 }); gp('radio', { precinct: 'precinct.midtown_central', at, text: `Midtown Central, shots fired at ${place}. …Male, thirties, medium build, tan leisure suit, green sedan, plate starting 4K, may be armed…` }); }
    else if (name === 'dispatched') gp('police', { kind: 'dispatched', unit: 'unit.7', report: 1 });
    else if (name === 'pursuit') { gp('police', { kind: 'pursuit', unit: 'unit.7', suspect: 'player' }); gp('radio', { precinct: 'precinct.midtown_central', at, text: `All units Midtown Central, in pursuit at ${place}. …Male, tan leisure suit…` }); }
    else if (name === 'lost') gp('police', { kind: 'lost', unit: 'unit.7', report: 1, at });
    else if (name === 'copKilled') gp('copKilled', { id: 'cop.3', by: 'player', at: [at[0], 0, at[1]], precinct: 'precinct.midtown_central' });
    else if (name === 'cleared') gp('police', { kind: 'cleared', report: 1, precinct: 'precinct.midtown_central', why: 'decay' });
  };
  const step = 768 / sr; const frames = Math.floor(seconds / step) - 1;
  let x = st.x, z = st.z, maxReal = 0, maxTotal = 0; const voiceLog: number[] = [];
  const listener = () => ({ position: [x, heightAt(x, z) + 1.8, z] as [number, number, number], forward: [st.dx, 0, st.dz] as [number, number, number], up: [0, 1, 0] as [number, number, number], velocity: [st.dx * sc.walk, 0, st.dz * sc.walk] as [number, number, number] });
  let minutes = sc.clock.minutes;
  const tick = () => {
    x += st.dx * sc.walk * step; z += st.dz * sc.walk * step; minutes += step / 60;
    sim.update(step, { x, z }, minutes / 60);
    for (const w of sim.vendorViews) if (pushing.has(w.id)) w.cartX += 1.1 * step;
    sys.setClock(minutes, sc.clock.date);
    sys.update(step, listener());
    const v = sys.stats.voices; maxReal = Math.max(maxReal, v.real ?? 0); maxTotal = Math.max(maxTotal, v.total ?? 0);
  };
  for (let k = 1; k <= frames; k++) {
    const t = k * step;
    void ctx.suspend(t).then(() => { tick(); if (k % 62 === 0) voiceLog.push(sys.stats.voices.real ?? 0); for (const e of sc.events ?? []) if (Math.floor(e.t / step) === k) /* exactly one frame per event (|e.t - t| < step/2 missed half-step times) */ e.play.startsWith('vendor:') ? vendorEvent(e.play, e.params) : e.play.startsWith('sim:') ? simEvent(e.play.slice(4), e.offset, e.params) : e.play.startsWith('gp:') ? gpEvent(e.play.slice(3), [x + (e.offset?.[0] ?? 0), z + (e.offset?.[1] ?? 0)]) : /^(gun|hit|whiz|gunfoley)/.test(e.play) ? combatEvent(e.play, [x + (e.offset?.[0] ?? 0), heightAt(x + (e.offset?.[0] ?? 0), z + (e.offset?.[1] ?? 0)) + 1.4, z + (e.offset?.[1] ?? 0)], t) : sys.play(e.play, e.offset ? [x + e.offset[0], 1, z + e.offset[1]] : undefined, e.params); return ctx.resume(); });
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
    stats: { ...stats, voices: stats.voices, voiceLog }, shots, dispatchLog,
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

/** One generated song straight from the music worklet (no radio speaker), for listening and CPU cost. */
export async function renderMusic(style: number, seed: number, bpm: number, seconds = 20, sr = 48000) {
  const ctx = new OfflineAudioContext(2, sr * seconds, sr);
  const sys = new AudioSystem({ quality: 'high', context: ctx, content: false }); await sys.whenReady();
  const n = new AudioWorkletNode(ctx, 't74-music', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  n.connect(ctx.destination); n.port.postMessage({ cmd: 'track', seed, bpm, style, offset: 0, gain: 1, dur: 180 });
  // Chrome doesn't deliver worklet port messages while an offline render runs flat out: pause at the
  // first quantum so the 'track' message lands (real-time contexts deliver it immediately).
  let pausedMs = 0;
  void ctx.suspend(128 / sr).then(async () => { const t = performance.now(); await new Promise((r) => setTimeout(r, 50)); pausedMs = performance.now() - t; await ctx.resume(); });
  const t0 = performance.now(); const out = await ctx.startRendering(); const ms = performance.now() - t0 - pausedMs;
  n.port.postMessage({ cmd: 'dispose' }); n.disconnect(); sys.dispose(false);
  const L = out.getChannelData(0), R = out.getChannelData(1); const inter = new Float32Array(L.length * 2); let nan = 0;
  for (let i = 0; i < L.length; i++) { inter[i * 2] = L[i]; inter[i * 2 + 1] = R[i]; if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) nan++; }
  return { pcm: b64(inter.buffer), sr, renderMs: ms, realtimeFactor: (seconds * 1000) / ms, nan };
}

export function startOffline() {
  (window as unknown as { __T74AUDIO: unknown }).__T74AUDIO = { render, limiterTest, renderMusic, scenarios: SCENARIOS.filter((s) => !s.extra).map((s) => s.id), extras: SCENARIOS.filter((s) => s.extra).map((s) => s.id), ready: true };
  document.getElementById('loading')?.remove();
  document.body.insertAdjacentHTML('beforeend', '<pre id="t74a" style="color:#ccc;padding:20px">audio offline harness ready</pre>');
}
