/**
 * Radio: stations that keep playing in game time whether or not anyone is listening.
 *
 * Each station has a cursor (current segment and elapsed time) advanced every update by the
 * game's dt, so stepping out of the car and back in lands later in the same song. Segments are
 * generated deterministically from the station seed: tracks, DJ links, ad breaks, and a news
 * bulletin queued when the game clock passes the top of the hour (picked by in-game date, N1).
 *
 * Audio is only synthesised for stations someone can hear: a "feed" per audible station (music +
 * speech) that fans out to speakers: the car radio (non-positional, radio bus, dash-speaker EQ,
 * AM narrower than FM) and positional window/shop radios (small-speaker EQ, ambience bus).
 * Changing station plays tuning static (AM crackle and heterodyne whistles, FM hiss).
 */
import type { Env } from '../env';
import type { SourceGraph, Voice } from '../core/voices';
import { PLACEHOLDER_STATIONS, type StationDef, type SpeechDef } from './stations';
import { Rng } from '../worklets/dsp';
import { syllableScript, speakerVoice } from '../dialogue/voice';
import type { VoiceLibrary } from '../dialogue/voiceLibrary';

interface Segment { kind: 'track' | 'link' | 'ad' | 'news'; dur: number; seed: number; style: number; bpm: number; speech?: SpeechDef; trackId?: string; file?: string }
interface Cursor { idx: number; seg: Segment; t: number; rng: Rng; newsPending: boolean; lastHour: number; sinceAd: number }
interface Feed { out: GainNode; music: AudioWorkletNode; voice: AudioWorkletNode; nodes: AudioNode[]; refs: number; idleT: number; segIdx: number; speech?: AudioBufferSourceNode | null }

export class RadioSystem {
  stations: StationDef[];
  private cursors = new Map<string, Cursor>();
  private feeds = new Map<string, Feed>();
  private carStation: string | null = null;
  private carVoice: Voice | null = null;
  private staticVoice: Voice | null = null;
  private time = 0;
  onSubtitle: ((e: { speaker: string; text: string; duration: number; channel: 'radio'; id: string }) => void) | null = null;

  constructor(private env: Env, defs?: StationDef[]) {
    this.stations = [];
    this.setStations(defs && defs.length ? defs : PLACEHOLDER_STATIONS);
  }

  /** Replace the station list (e.g. once content/radio.json has loaded). Keeps the car tuned if the id survives. */
  setStations(defs: StationDef[]) {
    const car = this.carStation; if (car) this.setStation(null);
    for (const f of this.feeds.values()) { for (const n of f.nodes) try { n.disconnect(); } catch { /* */ } f.voice.port.postMessage({ cmd: 'dispose' }); }
    this.feeds.clear(); this.cursors.clear();
    this.stations = defs;
    for (const s of this.stations) {
      const rng = new Rng(hashStr(s.id));
      const c: Cursor = { idx: 0, seg: null as unknown as Segment, t: rng.next() * 120, rng, newsPending: false, lastHour: -1, sinceAd: 0 };
      c.seg = this.nextSegment(s, c); this.cursors.set(s.id, c);
    }
    if (car && defs.some((d) => d.id === car)) this.setStation(car);
  }

  /** Lines tagged with a date air only on that date; tagged with a context only while it holds. */
  private eligible(list: SpeechDef[]) {
    const [x, , z] = this.env.vm.listener.position; const date = this.env.clock.date;
    const ctx = new Set<string>(); if (this.env.power(x, z) !== 'on') ctx.add('brownout'); if (this.env.weather.kind === 'rain') ctx.add('rain'); if (this.env.clock.hour < 5 || this.env.clock.hour >= 22) ctx.add('night');
    const ok = list.filter((l) => (!l.date || l.date === date) && (!l.context || ctx.has(l.context)));
    const special = ok.filter((l) => l.date || l.context);
    return special.length && this.env.rng.next() < 0.6 ? special : ok.length ? ok : list.filter((l) => !l.date && !l.context);
  }

  get currentStation() { return this.carStation; }

  private nextSegment(s: StationDef, c: Cursor): Segment {
    const r = c.rng; c.idx++;
    if (c.newsPending && s.news) {
      c.newsPending = false;
      const list = s.news.byDate?.[this.env.clock.date] ?? this.eligible(s.news.generic); const sp = list[(r.next() * list.length) | 0];
      return { kind: 'news', dur: this.speechDur(sp), seed: r.u32(), style: 0, bpm: 0, speech: sp };
    }
    if (!s.tracks.length || (c.sinceAd > 3 && s.ads.length && r.next() < 0.5)) {
      const pool = s.tracks.length ? s.ads : [...this.eligible(s.links), ...s.ads]; const sp = pool[(r.next() * pool.length) | 0];
      c.sinceAd = 0; return { kind: s.ads.includes(sp) ? 'ad' : 'link', dur: this.speechDur(sp), seed: r.u32(), style: 0, bpm: 0, speech: sp };
    }
    if (s.links.length && r.next() < 0.3) { const el = this.eligible(s.links); const sp = el[(r.next() * el.length) | 0]; return { kind: 'link', dur: this.speechDur(sp), seed: r.u32(), style: 0, bpm: 0, speech: sp }; }
    const tr = s.tracks[(r.next() * s.tracks.length) | 0]; c.sinceAd++;
    return { kind: 'track', dur: tr.durationSec, seed: hashStr(tr.id), style: tr.style, bpm: tr.bpm, trackId: tr.id, file: tr.file };
  }

  /** Rendered speech for DJ/news/ad lines (emotion 'radio' in the render). */
  voices: VoiceLibrary | null = null;
  private speechDur(sp: SpeechDef) { return (this.voices?.duration(sp.speaker, 'radio', sp.text) ?? syllableScript(sp.text, 'neutral', speakerVoice(sp.speaker)).duration) + 0.6; }

  /** In-car station (null = off). */
  setStation(id: string | null) {
    if (id === this.carStation) return;
    const env = this.env; const prev = this.carStation; this.carStation = id;
    const st = id ? this.stations.find((s) => s.id === id) : null;
    // Tuning static between stations.
    if (prev !== null || id !== null) {
      const am = (st?.band ?? 'AM') === 'AM'; let node: AudioWorkletNode | null = null; const dur = id ? 0.55 : 0.18;
      this.staticVoice?.stop(0.02);
      this.staticVoice = env.vm.play({ name: 'radio.static', bus: 'radio', category: 'ui', priority: 9, duration: dur, gain: 0.5, pinned: true,
        build: (ctx) => { const g = this.staticGraph(ctx); node = g.node; const s = g.graph; const o = s.start.bind(s); s.start = (w, off) => { const p = node!.parameters; p.get('am')!.value = am ? 1 : 0; p.get('sweep')!.value = 0.7; p.get('amount')!.setValueAtTime(0.9, w); p.get('amount')!.setValueAtTime(0.9, w + dur * 0.6); p.get('amount')!.linearRampToValueAtTime(0, w + dur); o(w, off); }; return s; } });
    }
    this.carVoice?.stop(0.08); this.carVoice = null;
    if (!st) return;
    this.carVoice = env.vm.play({ name: `radio.car.${st.id}`, bus: 'radio', category: 'radio', priority: 9, loop: true, gain: 0.9, pinned: true,
      build: (ctx) => this.speaker(ctx, st.id, st.band === 'AM' ? 'car-am' : 'car-fm', 0.3) });
  }

  private staticGraph(ctx: BaseAudioContext) {
    const out = ctx.createGain(); const w = new AudioWorkletNode(ctx, 't74-static', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] }); w.connect(out);
    const graph: SourceGraph = { output: out, start() {}, stop() {}, dispose() { w.port.postMessage('dispose'); try { w.disconnect(); out.disconnect(); } catch { /* */ } } };
    return { graph, node: w };
  }

  /** Positional speaker for a world radio (window, shop, bar). */
  worldSpeaker(ctx: BaseAudioContext, stationId: string, kind: 'window' | 'shop' | 'bar') { return this.speaker(ctx, stationId, kind, 0); }

  private speaker(ctx: BaseAudioContext, stationId: string, kind: 'car-am' | 'car-fm' | 'window' | 'shop' | 'bar', fadeIn: number): SourceGraph {
    const feed = this.feed(ctx, stationId); feed.refs++;
    const nodes: AudioNode[] = [];
    const f = (type: BiquadFilterType, hz: number, q = 0.7, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = q; b.gain.value = g; nodes.push(b); return b; };
    const input = ctx.createGain(); nodes.push(input);
    const out = ctx.createGain(); nodes.push(out); out.gain.value = 0;
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * (kind.startsWith('car') ? 1.4 : 2.2)) / Math.tanh(kind.startsWith('car') ? 1.4 : 2.2); } sh.curve = curve; nodes.push(sh);
    const chain: AudioNode[] = kind === 'car-am' ? [f('highpass', 150), f('lowpass', 3600, 0.9), f('peaking', 1300, 1, 4), sh]
      : kind === 'car-fm' ? [f('highpass', 90), f('lowpass', 9500, 0.7), f('peaking', 2500, 1, 2), sh]
        : kind === 'bar' ? [f('highpass', 200), f('lowpass', 2500, 1), sh, f('peaking', 800, 1, 3)]
          : [f('highpass', 380, 1), f('lowpass', 3200, 1.2), f('peaking', 1500, 2, 6), sh];
    let n: AudioNode = input; for (const c of chain) { n.connect(c); n = c; } n.connect(out);
    feed.out.connect(input);
    let disposed = false;
    return {
      output: out,
      start: (w) => { out.gain.setValueAtTime(0, w); out.gain.linearRampToValueAtTime(1, w + Math.max(0.01, fadeIn)); },
      stop: () => { /* chain gain fade handled by the voice */ },
      dispose: () => { if (disposed) return; disposed = true; try { feed.out.disconnect(input); } catch { /* */ } for (const x of nodes) try { x.disconnect(); } catch { /* */ } feed.refs--; },
    };
  }

  private feed(ctx: BaseAudioContext, id: string): Feed {
    let f = this.feeds.get(id); if (f) { f.idleT = 0; return f; }
    const out = ctx.createGain(); out.gain.value = 0.9;
    const music = new AudioWorkletNode(ctx, 't74-music', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const st = this.stations.find((s) => s.id === id)!;
    const sv = speakerVoice(st.links[0]?.speaker ?? id);
    const voice = new AudioWorkletNode(ctx, 't74-voice', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { seed: hashStr(id), f0: sv.f0, scale: sv.scale, range: 0.3 } });
    const vg = ctx.createGain(); vg.gain.value = 1.6; voice.connect(vg).connect(out); music.connect(out);
    f = { out, music, voice, nodes: [out, music, voice, vg], refs: 0, idleT: 0, segIdx: -1 };
    this.feeds.set(id, f);
    this.cue(id, f);
    return f;
  }

  /** Point a feed at its station's current segment (joining mid-way when needed). */
  private cue(id: string, f: Feed) {
    const c = this.cursors.get(id)!; f.segIdx = c.idx; const s = c.seg;
    try { f.speech?.stop(); f.speech?.disconnect(); } catch { /* */ } f.speech = null;
    if (s.kind === 'track') { f.music.port.postMessage({ cmd: 'track', seed: s.seed, bpm: s.bpm, style: s.style, offset: c.t, gain: 1, dur: s.dur }); f.voice.port.postMessage({ cmd: 'stop' }); }
    else {
      f.music.port.postMessage({ cmd: 'stop' });
      const sp = s.speech!; const v = speakerVoice(sp.speaker); const { script, duration: pd } = syllableScript(sp.text, s.kind === 'ad' ? 'happy' : 'neutral', v);
      const rendered = this.voices?.duration(sp.speaker, 'radio', sp.text); const duration = rendered ?? pd;
      if (rendered !== undefined && this.voices) {
        f.voice.port.postMessage({ cmd: 'stop' });
        const startedAt = this.env.ctx.currentTime, seg = f.segIdx;
        void this.voices.get(sp.speaker, 'radio', sp.text, 3).then((buf) => {
          if (!buf || f.segIdx !== seg || !this.feeds.has(id)) return;
          const src = this.env.ctx.createBufferSource(); src.buffer = buf; const g = this.env.ctx.createGain(); g.gain.value = 1.3; src.connect(g).connect(f.out);
          src.onended = () => { try { src.disconnect(); g.disconnect(); } catch { /* */ } };
          const off = c.t + (this.env.ctx.currentTime - startedAt); if (off < buf.duration) { src.start(0, off); f.speech = src; }
        });
      } else f.voice.port.postMessage({ cmd: 'say', script: script.filter((x) => x.t >= c.t).map((x) => ({ ...x, t: x.t - c.t })) });
      if (id === this.carStation && c.t < 0.5) this.onSubtitle?.({ speaker: sp.speaker, text: sp.text, duration: Math.max(1.2, duration - c.t), channel: 'radio', id: sp.id });
    }
  }

  update(dt: number) {
    this.time += dt;
    const hour = Math.floor(this.env.clock.minutes / 60);
    for (const s of this.stations) {
      const c = this.cursors.get(s.id)!;
      if (c.lastHour !== -1 && hour !== c.lastHour) c.newsPending = !!s.news;
      c.lastHour = hour;
      c.t += dt;
      let guard = 0;
      while (c.t >= c.seg.dur && guard++ < 50) { c.t -= c.seg.dur; c.seg = this.nextSegment(s, c); }
      const f = this.feeds.get(s.id);
      if (f) {
        if (f.segIdx !== c.idx) this.cue(s.id, f);
        if (f.refs <= 0 && (f.idleT += dt) > 3) { for (const n of f.nodes) try { n.disconnect(); } catch { /* */ } f.voice.port.postMessage({ cmd: 'dispose' }); f.music.port.postMessage({ cmd: 'stop' }); this.feeds.delete(s.id); }
      }
    }
  }

  nowPlaying(id: string) { const c = this.cursors.get(id); return c ? { kind: c.seg.kind, t: c.t, dur: c.seg.dur, track: c.seg.trackId, speech: c.seg.speech?.id } : null; }
  getState() { return { time: this.time, cursors: [...this.cursors].map(([k, c]) => [k, c.idx, c.t]) }; }
  get activeFeeds() { return this.feeds.size; }

  dispose() {
    this.carVoice?.stop(0.02); this.staticVoice?.stop(0.02);
    for (const f of this.feeds.values()) { for (const n of f.nodes) try { n.disconnect(); } catch { /* */ } f.voice.port.postMessage({ cmd: 'dispose' }); }
    this.feeds.clear();
  }
}


function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
