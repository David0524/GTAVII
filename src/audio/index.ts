/**
 * Tenderloin '74 audio: public entry point (integration contract from docs/briefs/AUDIO_BRIEF.md).
 *
 * The engine owns one AudioSystem. Call `unlock()` from the first user gesture (it also arms
 * itself on the first gesture anyway), `load()` once with the world data (or nothing: it fetches
 * the chunks and streets itself), then `update(dt, listener)` every frame.
 *
 * Extensions beyond the brief's contract are additive and optional (see ENGINE_REQUESTS.md):
 * `opts.context` (offline rendering), `setLoudnessProfile`, `footstep`, `dialogue.overhear`,
 * `dialogue.on('subtitleEnd')`, `on('lightning')`, `stats`, `dispose`.
 */
import { AUDIO_PRESETS, type BusId, type LoudnessProfile, type QualityName, type Vec3, type Category } from './config';
import { AudioRuntime } from './core/runtime';
import { Mixer } from './core/mixer';
import { VoiceManager, type Listener } from './core/voices';
import { AcousticGeometry, type StreetRec } from './acoustics/geometry';
import { CanyonAnalyzer, interiorReverb, lerpReverb, OUTDOOR_KINDS } from './acoustics/canyon';
import { RoomTone } from './world/roomTone';
import { AssetBank, GROUPS } from './assets/bank';
import { makeNoise, noiseBytes, bufferSource, type Noise } from './synth/live';
import { CityMap, weekday } from './world/cityMap';
import { Ambience, runAudioTimers, clearAudioTimers, setTimeoutAudio } from './world/ambience';
import { VehicleAudio, type AttachedVehicle, type SimLike } from './vehicles/vehicles';
import { Footsteps } from './world/footsteps';
import { RadioSystem } from './radio/radio';
import type { StationDef } from './radio/stations';
import { stationsFromNarrative } from './radio/narrative';
import { DialogueSystem, runAudioSleepers, type Script } from './dialogue/dialogue';
import { VoiceLibrary } from './dialogue/voiceLibrary';
import { Rng } from './worklets/dsp';
import { readChunk, type ChunkData } from '../shared/chunkFormat';
import { REGION } from '../shared/geo';
import { loadTerrain } from '../shared/terrain';
import type { Env, OneShotOpts, Power, Weather } from './env';

export type { Vec3, BusId, QualityName };

const AMBIENT_CATS = new Set<Category>(['animal', 'emitter', 'subway', 'weather', 'bed']);

export class AudioSystem {
  readonly quality = AUDIO_PRESETS.high;
  readonly runtime: AudioRuntime;
  private mixer!: Mixer;
  private vm!: VoiceManager;
  private geo = new AcousticGeometry();
  private canyon!: CanyonAnalyzer;
  private bank!: AssetBank;
  private noise!: Noise;
  private env!: Env;
  private ambience: Ambience | null = null;
  private vehicles!: VehicleAudio;
  private footsteps: Footsteps | null = null;
  private sim: SimLike | null = null;
  private power = new Map<string, Power>();
  private canyonT = 0; private preloadT = 0;
  private weatherTarget: Weather = 'clear';
  private listeners: Record<string, ((e: any) => void)[]> = {};
  private baseUrl: string;
  private loaded = false;
  private customStations = false;
  private useContent = true;
  private voiceLib: VoiceLibrary | null = null;
  private ready: Promise<void>;
  radio!: { setStation(id: string | null): void; readonly stations: readonly { id: string; name: string }[]; readonly system: RadioSystem };
  dialogue!: { play(scriptId: string, lineId: string, at?: Vec3, opts?: { filter?: 'phone' | 'radio' }): Promise<void>; on(type: 'subtitle' | 'subtitleEnd', cb: (e: any) => void): void; overhear: DialogueSystem['overhear']; registerScript(s: Script): void; bark: DialogueSystem['bark']; readonly system: DialogueSystem };
  readonly timing = { updateMs: 0, updateMaxMs: 0, frames: 0, sumMs: 0, samples: [] as number[], parts: {} as Record<string, number>, partsMax: {} as Record<string, number> };

  constructor(opts: { quality: QualityName; baseUrl?: string; context?: BaseAudioContext; stations?: StationDef[]; content?: boolean; /** Radio stations (paused by the user): default false. */ radio?: boolean }) {
    this.quality = AUDIO_PRESETS[opts.quality] ?? AUDIO_PRESETS.high;
    this.baseUrl = opts.baseUrl ?? (import.meta.env?.BASE_URL ?? '/');
    this.runtime = new AudioRuntime({ context: opts.context as AudioContext | OfflineAudioContext | undefined, latencyHint: this.quality.latencyHint });
    this.customStations = !!opts.stations?.length || opts.content === false;
    this.useContent = opts.content !== false;
    this.ready = this.runtime.ready.then(() => { this.build(opts.stations); this.radio.system.enabled = opts.radio === true; });
  }

  private build(stations?: StationDef[]) {
    const ctx = this.runtime.ctx; const q = this.quality;
    this.mixer = new Mixer(ctx, q);
    this.vm = new VoiceManager(ctx, this.mixer, this.geo, q);
    this.canyon = new CanyonAnalyzer(this.geo, q.canyonRays);
    this.noise = makeNoise(ctx);
    this.bank = new AssetBank(ctx, q.memoryMB * 1024 * 1024 - noiseBytes(this.noise), this.baseUrl, q.variants);
    const env: Env = {
      ctx, vm: this.vm, bank: this.bank, noise: this.noise, geo: this.geo, map: null as unknown as CityMap, canyon: this.canyon, q, rng: new Rng(1974),
      clock: { minutes: 17 * 60 + 30, date: '1974-06-21', hour: 17.5, weekday: 5 },
      weather: { kind: 'clear', rain: 0, wet: 0 },
      power: (x, z) => this.powerAt(x, z),
      interior: null,
      traffic: { near: 0, avenue: 0, heavy: 0, speed: 0, fromSim: false },
      peds: { near: 0, fromSim: false },
      emit: (type, e) => { for (const cb of this.listeners[type] ?? []) cb(e); },
      oneShot: (family, o) => this.oneShot(family, o),
      live: true,
    };
    this.env = env;
    this.vehicles = new VehicleAudio(env);
    const radio = new RadioSystem(env, stations);
    const dlg = new DialogueSystem(env, this.baseUrl); dlg.contentEnabled = this.useContent;
    this.voiceLib = new VoiceLibrary(ctx, this.baseUrl); dlg.lib = this.voiceLib; radio.voices = this.voiceLib;
    radio.onSubtitle = (e) => env.emit('radioSubtitle', e);
    // Reaction barks from the narrative's bark pools (content/barks/*.json), positional, subtitled as overheard.
    (this.listeners.bark ??= []).push((e: { pool?: string; context?: string; at?: Vec3; delay?: number }) => {
      if (!e.pool || !e.context || !e.at) return; const at = e.at;
      setTimeoutAudio(env, e.delay ?? 0, () => { void dlg.barkFrom(e.pool!, e.context!, at, `npc.${e.pool}`, true); });
    });
    this.radio = { setStation: (id) => radio.setStation(id), get stations() { return radio.stations.map((s) => ({ id: s.id, name: s.name })); }, system: radio };
    this.dialogue = { play: (s, l, at, o) => dlg.play(s, l, at, o), on: (t, cb) => dlg.on(t, cb), overhear: (o) => dlg.overhear(o), registerScript: (s) => dlg.registerScript(s), bark: (t, at, sp, sub) => dlg.bark(t, at, sp, sub), system: dlg };
  }

  /** Resolve once worklets are loaded and the mix graph exists (load() awaits this). */
  whenReady() { return this.ready; }

  unlock(): Promise<void> { return this.runtime.unlock(); }

  async load(world: { chunks?: unknown; streets?: unknown } = {}): Promise<void> {
    await this.ready;
    const t0 = performance.now();
    let chunks = Array.isArray(world.chunks) ? (world.chunks as ChunkData[]) : null;
    let streets = Array.isArray(world.streets) ? (world.streets as StreetRec[]) : null;
    const data = this.baseUrl + 'data/';
    if (!streets) streets = await fetch(data + 'streets.json').then((r) => r.json());
    if (!chunks) {
      const man = await fetch(data + 'world.json').then((r) => r.json()) as { chunks: { key: string }[] };
      chunks = await Promise.all(man.chunks.map((c) => fetch(`${data}chunks/${c.key}.bin`).then((r) => r.arrayBuffer()).then(readChunk)));
    }
    // Pre-warm the HRTF database (Chrome loads it on the first HRTF panner: ~15 ms we don't want mid-game).
    if (this.quality.hrtf > 0) { const pn = this.runtime.ctx.createPanner(); pn.panningModel = 'HRTF'; pn.disconnect(); }
    await loadTerrain(data + 'terrain.bin'); // ground heights for emitters and events (no-op when terrain is off)
    this.geo.build(chunks, streets!);
    this.env.map = new CityMap(streets!);
    await this.voiceLib?.init(this.useContent);
    // Narrative radio content if the engine serves content/ (else the PLACEHOLDER stations stay).
    if (!this.customStations) {
      try { const r = await fetch(this.baseUrl + 'content/radio.json'); if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { const defs = stationsFromNarrative(await r.json()); if (defs.length) this.radio.system.setStations(defs); } } catch { /* no content */ }
    }
    await this.bank.init();
    await Promise.all([this.bank.loadGroup('boot'), this.bank.loadGroup('power'), this.bank.loadGroup('traffic'), this.bank.loadGroup('movement')]);
    this.ambience = new Ambience(this.env, REGION, this.radio.system);
    this.footsteps = new Footsteps(this.env, this.ambience.subway.gratings);
    this.roomTone = new RoomTone(this.env, this.radio.system);
    this.ambience.start(); this.vehicles.start();
    if (this.sim) this.vehicles.bindSim(this.sim);
    this.loaded = true;
    this.loadStats.loadMs = performance.now() - t0;
  }
  readonly loadStats = { loadMs: 0 };

  update(dt: number, listener: Listener): void {
    if (!this.loaded) return;
    const t0 = performance.now();
    const env = this.env;
    // Nothing schedules while the context is not running (backgrounded, interrupted, locked).
    env.live = this.runtime.running;
    if (!env.live) return;
    dt = Math.min(dt, 0.1);
    runAudioTimers(this.runtime.ctx); runAudioSleepers(this.runtime.ctx);
    this.vm.listener = listener;
    // Weather smoothing: rain ramps over ~15 s; roads stay wet ~15 min after.
    const w = env.weather; const target = this.weatherTarget === 'rain' ? 1 : 0;
    w.rain += (target - w.rain) * Math.min(1, dt / 15); if (w.rain < 1e-3) w.rain = 0;
    w.wet = Math.max(w.rain, w.wet - dt / 900); w.kind = this.weatherTarget;
    // Canyon acoustics at 10 Hz.
    let tc = performance.now();
    if ((this.canyonT -= dt) <= 0) {
      this.canyonT = 0.1;
      const s = this.canyon.analyze(listener.position[0], listener.position[2]);
      const I = this.interior;
      if (I.kind && I.blend > 0) this.mixer.setReverb(lerpReverb(this.canyon.toReverb(s), interiorReverb(I.kind, I.volume), I.blend), 0.15);
      else this.mixer.setReverb(this.canyon.toReverb(s), 0.5);
    }
    if ((this.preloadT -= dt) <= 0) { this.preloadT = 2; this.preload(); }
    { const n = performance.now(); this.timing.parts.canyon = (this.timing.parts.canyon ?? 0) + n - tc; this.timing.partsMax.canyon = Math.max(this.timing.partsMax.canyon ?? 0, n - tc); tc = n; }
    const P = this.timing.parts; let tp = performance.now();
    const PM = this.timing.partsMax; const lap = (k: string) => { const n = performance.now(); P[k] = (P[k] ?? 0) + n - tp; PM[k] = Math.max(PM[k] ?? 0, n - tp); tp = n; };
    this.radio.system.update(dt); lap('radio');
    this.ambience?.update(dt); lap('ambience');
    this.vehicles.update(dt); lap('vehicles');
    this.footsteps?.update(dt, this.sim ? this.sim.peds : null); this.roomTone?.update(dt); lap('footsteps');
    this.vm.update(listener, dt); lap('voices');
    const ms = performance.now() - t0;
    this.timing.updateMs = ms; this.timing.updateMaxMs = Math.max(this.timing.updateMaxMs, ms); this.timing.frames++; this.timing.sumMs += ms;
    if (this.timing.samples.length < 20000) this.timing.samples.push(ms);
  }

  /** Area preload: decide which sound groups the listener's surroundings need. */
  private preload() {
    const m = this.ambience?.mix; if (!m) return;
    const want: string[] = [];
    if (m.garment + m.fur > 0.15) want.push('garment');
    if (m.park > 0.1 || this.env.clock.hour < 9) want.push('park');
    if (this.weatherTarget !== 'clear') want.push('rain');
    if (m.night > 0.2) want.push('night');
    if (this.env.interior) want.push('interior');
    if (this.env.clock.weekday === 0 || this.env.clock.date.endsWith('-07-04')) want.push('calendar');
    for (const g of want) if (!this.bank.groupsLoaded.has(g)) void this.bank.loadGroup(g);
  }

  setBusVolume(bus: BusId, v: number) { this.mixer?.setBusVolume(bus, v); }
  setLoudnessProfile(p: LoudnessProfile) { this.mixer?.setLoudness(p); }
  setIgnoreSilentSwitch(on: boolean) { this.runtime.setIgnoreSilentSwitch(on); }

  setClock(minutesSinceMidnight: number, date?: string) {
    const c = this.env?.clock; if (!c) return;
    c.minutes = ((minutesSinceMidnight % 1440) + 1440) % 1440; c.hour = c.minutes / 60;
    if (date) { c.date = date; c.weekday = weekday(date); }
  }
  setWeather(w: Weather) { this.weatherTarget = w; if (this.env && w === 'rain' && this.env.weather.rain === 0) this.env.weather.rain = 0.02; }

  /** area: 'all', a district id ('garment','fur','flower','eighth','deuce','herald') or 'x,z,radius'. */
  setPower(area: string, state: Power) { if (state === 'on') this.power.delete(area); else this.power.set(area, state); }
  private powerAt(x: number, z: number): Power {
    if (!this.power.size) return 'on';
    let worst: Power = 'on';
    const rank = { on: 0, dim: 1, off: 2 } as const;
    for (const [area, st] of this.power) {
      let inside = false;
      if (area === 'all') inside = true;
      else if (/^-?\d/.test(area)) { const [ax, az, r] = area.split(',').map(Number); inside = Math.hypot(x - ax, z - az) <= r; }
      else { const d = this.env.map.districts(x, z) as Record<string, number>; const k = area.toLowerCase().replace(/ district$/, '').replace(/eighth avenue|8th avenue/, 'eighth'); inside = (d[k] ?? 0) > 0.5; }
      if (inside && rank[st] > rank[worst]) worst = st;
    }
    return worst;
  }

  /**
   * Interior acoustics. `blend` (0..1) lets the engine fade through a doorway: 0 = still the street,
   * 1 = inside (default 1 when kind is set). `roomVolume` (m^3) scales the room's reverb.
   */
  setInterior(kind: string | null, opts: { blend?: number; roomVolume?: number } = {}) {
    const env = this.env; if (!env) return;
    const blend = kind ? Math.max(0, Math.min(1, opts.blend ?? 1)) : 0;
    this.interior = { kind, blend, volume: opts.roomVolume };
    const outdoor = !!kind && OUTDOOR_KINDS.has(kind);
    env.interior = kind && blend >= 0.5 && !outdoor ? kind : null;
    const a = outdoor ? 0 : blend;
    this.mixer.setExterior(a);
    this.vm.insideGain = 1 - 0.7 * a; this.vm.insideLp = 20000 * Math.pow(700 / 20000, a);
    this.roomTone?.set(kind, blend);
    if (kind) void this.bank.loadGroup('interior');
    this.canyonT = 0; // re-blend the reverb now
  }
  private interior: { kind: string | null; blend: number; volume?: number } = { kind: null, blend: 0 };
  private roomTone: RoomTone | null = null;

  attachVehicle(v: AttachedVehicle, profile: string): () => void { return this.vehicles.attach(v, profile); }

  bindSim(sim: SimLike) { this.sim = sim; if (this.loaded) this.vehicles.bindSim(sim); }

  /** Footstep from the characters' animation events (player or NPC). */
  footstep(e: Parameters<Footsteps['footstep']>[0]) { this.footsteps?.footstep(e); }

  /**
   * Traversal foley (docs/briefs/MOVEMENT.md): 'vault' | 'climb' | 'land' | 'roll' | 'ragdoll' | 'cloth' | 'fence'.
   * `intensity` 0..1 (e.g. landing speed, impact impulse) scales level and slightly lowers pitch for heavy hits.
   */
  foley(action: 'vault' | 'climb' | 'land' | 'roll' | 'ragdoll' | 'cloth' | 'fence', at: Vec3, intensity = 0.7) {
    const fam = action === 'fence' ? 'fence.rattle' : `foley.${action}`; const k = Math.max(0, Math.min(1, intensity));
    this.oneShot(fam, { category: action === 'ragdoll' ? 'impact' : 'footstep', at, gain: 0.35 + 0.65 * k, rate: 1.06 - 0.12 * k, priority: 7 });
  }

  /** Engine events out: 'lightning' {distance, delay, near} (flash the sky), 'radioSubtitle', 'bark'. */
  on(type: 'lightning' | 'radioSubtitle' | 'bark', cb: (e: any) => void) { (this.listeners[type] ??= []).push(cb); }

  /**
   * One-shots by name: any baked/streamed family ('door.slam', 'ui.select', 'glass'...), or
   * 'horn' {kind}, 'impact' {impulse}, 'skid' {intensity}, 'siren', 'thunder' {near}, 'footstep'.
   */
  play(event: string, at?: Vec3, params: Record<string, number> = {}): void {
    if (!this.loaded) return;
    switch (event) {
      case 'horn': this.vehicles.horn(['sedan', 'taxi', 'bus', 'box_truck', 'compact'][params.kind ?? 0] ?? 'sedan', at ?? this.vm.listener.position, params.duration ?? 0.6); return;
      case 'impact': this.vehicles.impact(at ?? this.vm.listener.position, params.impulse ?? 5000); return;
      case 'skid': this.vehicles.tyreChirp(at ?? this.vm.listener.position, params.intensity ?? 0.8); return;
      case 'siren': this.ambience?.triggerSiren(); return;
      case 'thunder': { const near = (params.near ?? 0) > 0.5; void this.bank.loadGroup('rain').then(() => this.oneShot(near ? 'thunder.near' : 'thunder.far', { category: 'weather', gain: near ? 0.42 : 0.28 })); return; }
      case 'footstep': this.footstep({ position: at ?? this.vm.listener.position, intensity: params.intensity }); return;
    }
    if (!this.oneShot(event, { at, gain: params.gain, rate: params.rate })) {
      const g = Object.entries(GROUPS).find(([, f]) => f.includes(event))?.[0];
      if (g) void this.bank.loadGroup(g).then(() => this.oneShot(event, { at, gain: params.gain, rate: params.rate }));
      else if (!this.warned.has(event)) { this.warned.add(event); console.warn(`[audio] unknown event ${event}`); }
    }
  }
  private warned = new Set<string>();

  private oneShot(family: string, o: OneShotOpts = {}) {
    const buf = this.bank.get(family);
    if (!buf) { const g = Object.entries(GROUPS).find(([, f]) => f.includes(family))?.[0]; if (g) void this.bank.loadGroup(g); return null; }
    const rate = o.rate ?? 1; const cat = o.category ?? (family.startsWith('ui.') ? 'ui' : 'impact');
    const bus = o.bus ?? (cat === 'ui' ? 'ui' : AMBIENT_CATS.has(cat) ? 'ambience' : 'sfx');
    return this.vm.play({ name: family, bus, category: cat, priority: o.priority ?? (cat === 'ui' ? 10 : 5), gain: (o.gain ?? 1) * this.bank.gainOf(family), at: o.at, vel: o.vel, doppler: o.doppler, occlude: !!o.at, wet: o.wet,
      duration: buf.duration / rate, resumable: true, pinned: cat === 'ui', build: (ctx) => bufferSource(ctx, buf, { rate }) });
  }

  /** Schedule a callback in audio time (pauses with the context). */
  after(seconds: number, fn: () => void) { setTimeoutAudio(this.env, seconds, fn); }

  suspend(): void { this.runtime.suspend(); }
  resume(): void { this.runtime.resume(); }

  get stats() {
    return {
      state: this.runtime.state, voices: { ...this.vm?.stats }, mixer: { ...this.mixer?.stats }, bank: { ...this.bank?.stats, budget: this.bank?.budgetBytes, noiseBytes: this.noise ? noiseBytes(this.noise) : 0 },
      canyon: this.canyon?.state, mix: this.ambience?.mix, ambience: this.ambience?.stats, vehicles: this.vehicles?.stats, footsteps: this.footsteps?.stats,
      dialogue: this.dialogue?.system.stats, speech: this.voiceLib?.stats, radioFeeds: this.radio?.system.activeFeeds, geo: this.geo.stats, timing: { ...this.timing, samples: undefined }, load: this.loadStats,
      emitters: this.ambience?.emitterCounts(), outputLatency: (this.runtime.ctx as AudioContext).outputLatency ?? 0, baseLatency: (this.runtime.ctx as AudioContext).baseLatency ?? 0,
    };
  }
  get meters() { return this.mixer.enableMeters(); }
  get context() { return this.runtime.ctx; }
  get listenerState() { return this.vm.listener; }
  get canyonRays() { return this.canyon.lastRays; }
  get debug() { return { geo: this.geo, ambience: this.ambience, vm: this.vm, mixer: this.mixer, env: this.env, bank: this.bank }; }

  /** Release every node and listener. After this the instance is dead. */
  dispose(closeContext = true) {
    this.loaded = false;
    this.ambience?.dispose(); this.roomTone?.dispose(); this.vehicles?.dispose(); this.radio?.system.dispose(); this.dialogue?.system.dispose();
    this.vm?.disposeAll(); this.mixer?.dispose(); this.bank?.dispose();
    clearAudioTimers(this.runtime.ctx);
    if (closeContext) this.runtime.dispose();
  }
}
