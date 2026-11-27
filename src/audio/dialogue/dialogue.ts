/**
 * Dialogue and bark playback with subtitle timing.
 *
 *  play(script, line, at?, opts?)  scene dialogue: keys the duckers (radio -11 dB, ambience -5 dB),
 *                                  'scene' subtitle channel, resolves when the line has been heard
 *                                  and is readable (never sooner than the reading time).
 *  overhear({script, at, radius})  narrative N3: positional, 'ambient' channel, does not duck,
 *                                  fades with distance, and is cut cleanly with a trailing "…"
 *                                  (subtitleEnd {cut:true}) when the listener walks out of range.
 *  bark(text, at, speaker)         short positional lines from NPCs (optional subtitle).
 *  filter 'phone' | 'radio'        1974 telephone (carbon mic, 300-3400 Hz, a little hum and grit)
 *                                  and radio-speaker treatment for calls and broadcasts.
 *
 * Voice source: recorded files from audio/manifest.json `voice` entries when present, otherwise the
 * PLACEHOLDER formant voice (dialogue/voice.ts). Lines come from registered scripts or are fetched
 * from content/dialogue/<id>.json (the narrative format: {id, lines:[{id, speaker, emotion, text}]}).
 */
import type { Env } from '../env';
import type { SourceGraph, Voice } from '../core/voices';
import type { Vec3 } from '../config';
import { syllableScript, speakerVoice, readingTime, type SpeakerVoice } from './voice';
import { hash } from '../vehicles/vehicles';
import type { VoiceLibrary } from './voiceLibrary';

export interface Line { id: string; speaker?: string; emotion?: string; text?: string; if?: string; choices?: unknown[] }
export interface Script { id: string; lines: Line[] }
export type Channel = 'scene' | 'ambient' | 'radio' | 'phone';
export interface SubtitleEvent { id: string; speaker: string; text: string; duration: number; channel: Channel; overheard?: boolean; at?: Vec3 }
export interface SubtitleEndEvent { id: string; cut: boolean; text?: string }

let lineSerial = 0;

export class DialogueSystem {
  private scripts = new Map<string, Script>();
  private handlers: { subtitle: ((e: SubtitleEvent) => void)[]; subtitleEnd: ((e: SubtitleEndEvent) => void)[] } = { subtitle: [], subtitleEnd: [] };
  private overheard: { at: Vec3; radius: number; cancel: () => void; voice: Voice | null }[] = [];
  speakers: Record<string, Partial<SpeakerVoice>> = {};
  stats = { lines: 0, cut: 0, placeholder: 0, rendered: 0, barks: 0 };
  /** Rendered speech; null = placeholder voice only. */
  lib: VoiceLibrary | null = null;
  /** false = never fetch content/ (hermetic tests); registered scripts still work. */
  contentEnabled = true;

  constructor(private env: Env, private baseUrl: string) {}

  registerScript(s: Script) { this.scripts.set(s.id, s); }
  on(type: 'subtitle' | 'subtitleEnd', cb: (e: any) => void) { (this.handlers[type] as ((e: unknown) => void)[]).push(cb); }
  private fire<K extends keyof DialogueSystem['handlers']>(type: K, e: Parameters<DialogueSystem['handlers'][K][number]>[0]) { for (const h of this.handlers[type]) (h as (x: unknown) => void)(e); }

  private async script(id: string): Promise<Script | null> {
    if (this.scripts.has(id)) return this.scripts.get(id)!;
    if (!this.contentEnabled) return null;
    // Narrative files are named without the 'dlg.' namespace (dlg.m01_lobby -> m01_lobby.json).
    for (const name of [id.replace(/^dlg\./, ''), id]) {
      try { const r = await fetch(`${this.baseUrl}content/dialogue/${name}.json`); if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) { const s = await r.json(); this.scripts.set(id, s); return s; } } catch { /* offline */ }
    }
    return null;
  }

  /** Build the voice for one line. Returns the voice, its duration and a way to cut it. */
  private speak(line: Line, o: { at?: Vec3 | (() => Vec3); unkeyed: boolean; filter?: 'phone' | 'radio'; gain?: number; onDone: () => void }, buf: AudioBuffer | null = null) {
    const speaker = line.speaker ?? 'unknown'; const sv = speakerVoice(speaker, this.speakers);
    const ph = syllableScript(line.text ?? '', line.emotion, sv); const script = ph.script;
    const duration = buf ? buf.duration : ph.duration;
    if (buf) this.stats.rendered++; else this.stats.placeholder++;
    const filter = o.filter; const env = this.env;
    const voice = env.vm.play({ name: `dlg.${line.id}`, bus: 'dialogue', category: 'voice', priority: o.unkeyed ? 6 : 9, duration: duration + 0.3, gain: o.gain ?? 1, at: o.at, occlude: !!o.at, unkeyed: o.unkeyed, pinned: !o.at,
      onEnd: o.onDone,
      build: (ctx) => {
        if (buf) {
          // Rendered speech (eSpeak NG, normalised to -20 LUFS offline); same speaker filters as the placeholder.
          const src = ctx.createBufferSource(); src.buffer = buf; const out = ctx.createGain(); out.gain.value = 1.4; const nodes: AudioNode[] = [src, out];
          let n: AudioNode = src; for (const x of speakerChain(ctx, filter, nodes)) { n.connect(x); n = x; } n.connect(out);
          return { output: out, start: (w, off) => src.start(w, Math.min(off, buf.duration)), stop: (w) => { try { src.stop(w); } catch { /* */ } }, dispose: () => { try { src.stop(); } catch { /* */ } for (const x of nodes) try { x.disconnect(); } catch { /* */ } }, setPitch: (p) => { src.playbackRate.value = p; } };
        }
        const w = new AudioWorkletNode(ctx, 't74-voice', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { seed: hash(speaker + line.id), f0: sv.f0, scale: sv.scale, range: sv.range } });
        const out = ctx.createGain(); out.gain.value = 1.8; const nodes: AudioNode[] = [w, out];
        { let n: AudioNode = w; for (const x of speakerChain(ctx, filter, nodes)) { n.connect(x); n = x; } n.connect(out); }
        const graph: SourceGraph = {
          output: out,
          start: (_when, offset) => { w.port.postMessage({ cmd: 'say', script: script.filter((s) => s.t >= offset).map((s) => ({ ...s, t: s.t - offset })) }); },
          stop: () => { w.port.postMessage({ cmd: 'stop' }); },
          dispose: () => { w.port.postMessage({ cmd: 'dispose' }); for (const x of nodes) try { x.disconnect(); } catch { /* */ } },
        };
        return graph;
      }, resumable: true });
    return { voice, duration };
  }

  /** Scene dialogue. Resolves when the line is done and has been on screen long enough to read. */
  async play(scriptId: string, lineId: string, at?: Vec3, opts: { filter?: 'phone' | 'radio'; channel?: Channel } = {}): Promise<void> {
    const s = await this.script(scriptId);
    const line = s?.lines.find((l) => l.id === lineId) ?? { id: lineId, speaker: 'unknown', text: `[missing line ${scriptId}/${lineId}]` };
    if (!line.text) return;
    this.stats.lines++;
    const id = `${scriptId}/${lineId}#${++lineSerial}`;
    const buf = this.lib ? await this.lib.get(line.speaker ?? '', line.emotion, line.text, 2) : null;
    if (s && this.lib) { const i = s.lines.indexOf(line as Line); if (i >= 0) this.lib.prefetch(s.lines.slice(i + 1, i + 4)); }
    return new Promise((resolve) => {
      const t0 = this.env.ctx.currentTime;
      const { duration } = this.speak(line, { at, unkeyed: false, filter: opts.filter, onDone: () => {
        const remain = readingTime(line.text!) - (this.env.ctx.currentTime - t0);
        const end = () => { this.fire('subtitleEnd', { id, cut: false }); resolve(); };
        if (remain > 0) void sleepAudio(this.env, remain).then(end); else end();
      } }, buf);
      this.fire('subtitle', { id, speaker: line.speaker ?? '', text: line.text!, duration: Math.max(duration, readingTime(line.text!)), channel: opts.channel ?? (opts.filter === 'phone' ? 'phone' : 'scene'), at });
    });
  }

  /** N3: overheard conversation. Returns a handle; lines play in order while the listener is in range. */
  overhear(o: { script: string; at: Vec3; radius: number; loop?: boolean; falloff?: 'soft' | 'hard' }) {
    const env = this.env; let cancelled = false; let current: Voice | null = null; let currentId = '';
    const entry = { at: o.at, radius: o.radius, cancel: () => { cancelled = true; }, voice: null as Voice | null };
    this.overheard.push(entry);
    const run = async () => {
      const s = await this.script(o.script); if (!s) return;
      this.lib?.prefetch(s.lines);
      do {
        for (const line of s.lines) {
          if (cancelled) return; if (!line.text) continue;
          // Wait until the listener is in range before starting the next line.
          while (!cancelled && this.dist(o.at) > o.radius) await sleepAudio(env, 0.25);
          if (cancelled) return;
          const id = `${o.script}/${line.id}#${++lineSerial}`; currentId = id;
          const buf = this.lib ? await this.lib.get(line.speaker ?? '', line.emotion, line.text, 1.5) : null;
          if (cancelled) return;
          const done = new Promise<void>((res) => {
            const { voice, duration } = this.speak(line, { at: o.at, unkeyed: true, gain: o.falloff === 'hard' ? 1.2 : 1, onDone: () => res() }, buf);
            current = voice; entry.voice = voice;
            this.fire('subtitle', { id, speaker: line.speaker ?? '', text: line.text!, duration: Math.max(duration, readingTime(line.text!)), channel: 'ambient', overheard: true, at: o.at });
          });
          // Watch for the listener leaving: cut cleanly with a trailing ellipsis.
          let cut = false;
          const watch = (async () => { while (!cancelled && current && !current.stopped && env.vm.voices.includes(current)) { if (this.dist(o.at) > o.radius * 1.12) { cut = true; current.stop(0.25); this.stats.cut++; break; } await sleepAudio(env, 0.1); } })();
          await done; await watch;
          this.fire('subtitleEnd', { id, cut, text: cut ? `${line.text!.slice(0, Math.max(8, Math.round(line.text!.length * 0.6)))}…` : undefined });
          current = null; entry.voice = null;
          if (!cut) await sleepAudio(env, 0.35);
        }
      } while (o.loop && !cancelled);
    };
    void run();
    return { stop: () => { cancelled = true; current?.stop(0.25); if (currentId) this.fire('subtitleEnd', { id: currentId, cut: true }); this.overheard = this.overheard.filter((e) => e !== entry); } };
  }

  /** Bark pools from content/barks/<pool>.json ({ id, lines: [{ context, emotion, text }] }). */
  private pools = new Map<string, Promise<{ lines: { context?: string; emotion?: string; text: string }[] } | null>>();
  private poolFetch(pool: string) {
    const name = pool.replace(/^barks\./, '');
    let p = this.pools.get(name);
    if (!p && !this.contentEnabled) p = Promise.resolve(null);
    if (!p) { p = fetch(`${this.baseUrl}content/barks/${name}.json`).then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null)).catch(() => null); this.pools.set(name, p); }
    return p;
  }
  /** A random line of `context` from a bark pool, spoken at `at` (no-op if the pool or context is missing). */
  async barkFrom(pool: string, context: string, at: Vec3 | (() => Vec3), speaker = `npc.${pool.replace(/^barks\./, '')}`, subtitle = true, emotions?: readonly string[]): Promise<boolean> {
    const p = await this.poolFetch(pool); const lines = p?.lines.filter((l) => l.context === context && (!emotions || emotions.includes(l.emotion ?? ""))) ?? [];
    if (!lines.length) return false;
    const l = lines[(this.env.rng.next() * lines.length) | 0];
    const buf = this.lib ? await this.lib.get(speaker, l.emotion, l.text, 0.8) : null; // a bark that comes late is worse than a placeholder
    this.bark(l.text, at, speaker, subtitle, l.emotion, buf); this.stats.barks++;
    return true;
  }

  /** NPC bark: short positional line (archetype barks come from the narrative's barks files). */
  bark(text: string, at: Vec3 | (() => Vec3), speaker = 'npc', subtitle = false, emotion = 'neutral', buf: AudioBuffer | null = null) {
    const line: Line = { id: `bark${++lineSerial}`, speaker, text, emotion };
    const { duration } = this.speak(line, { at, unkeyed: true, gain: 0.9, onDone: () => {} }, buf);
    if (subtitle) this.fire('subtitle', { id: line.id, speaker, text, duration: Math.max(duration, readingTime(text)), channel: 'ambient', overheard: true, at: typeof at === 'function' ? at() : at });
  }

  private dist(p: Vec3) { const l = this.env.vm.listener.position; return Math.hypot(p[0] - l[0], p[2] - l[2]); }
  dispose() { for (const o of this.overheard) o.cancel(); this.overheard = []; }
}

/** Sleep in audio time (pauses with the context; works offline). */
export function sleepAudio(env: Env, s: number): Promise<void> {
  return new Promise((res) => { const until = env.ctx.currentTime + s; const tick = () => { if (env.ctx.currentTime >= until || !env.live && env.ctx.currentTime >= until) res(); else waiters.push({ until, res, ctx: env.ctx }); }; tick(); });
}
const waiters: { until: number; res: () => void; ctx: BaseAudioContext }[] = [];
export function runAudioSleepers(ctx: BaseAudioContext) { for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].ctx === ctx && ctx.currentTime >= waiters[i].until) { const w = waiters[i]; waiters.splice(i, 1); w.res(); } }

/** Speaker treatment: none, a 1974 telephone (carbon mic, 300-3400 Hz, grit) or a radio speaker. */
function speakerChain(ctx: BaseAudioContext, filter: 'phone' | 'radio' | undefined, nodes: AudioNode[]): AudioNode[] {
  if (!filter) return [];
  const f = (type: BiquadFilterType, hz: number, q = 0.7, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = q; b.gain.value = g; nodes.push(b); return b; };
  const sh = ctx.createWaveShaper(); const c = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 3) / Math.tanh(3); } sh.curve = c; nodes.push(sh);
  return filter === 'phone' ? [f('highpass', 320, 0.9), f('lowpass', 3300, 1.1), f('peaking', 1800, 1.4, 7), sh] : [f('highpass', 180), f('lowpass', 4500), f('peaking', 1200, 1, 4), sh];
}
