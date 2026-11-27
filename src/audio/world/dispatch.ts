/**
 * Police dispatch (the heat cue): "Central" and the radio cars on a 1974 two-way band, stitched from build-time
 * rendered fragments (dialogue/dispatchText.ts) through a radio chain with squelch, static and garble.
 *
 *  - One channel, half-duplex: one transmission at a time, queued, stale chatter dropped. A transmission is
 *    a squelch "kerchunk", the fragments (phrases, else words, plates in the APCO alphabet; ',' is a breath),
 *    garble for anything outside the vocabulary, and the squelch tail. The subtitle carries the full text.
 *  - Sources: gameplay's `radio` calls (free text, spoken by Central), `police` events (cars acknowledge,
 *    pursue, lose him; narrative's police_radio lines with {street}/{avenue} filled from the map), `copKilled`
 *    (officer down: an alert tone, Central urgent, narrative's cop_killed radio lines, a siren surge and a
 *    busier, urgent channel for 90 s: the "tone shift"), idle chatter while a report is open.
 *  - Heard non-positionally (the scanner the player's heat brings) at a modest level, unkeyed (it never ducks
 *    the world or the music). Positional radios in cars and on cops are a later layer.
 */
import type { Env } from '../env';
import type { Vec3 } from '../config';
import type { VoiceLibrary } from '../dialogue/voiceLibrary';
import type { SourceGraph } from '../core/voices';
import { segment, normalise, numberWords } from '../dialogue/dispatchText';

type Voice = 'central' | 'car';
interface Line { text: string; voice: Voice; urgent: boolean; car?: number; queuedAt: number; priority: number; alert?: boolean }
interface Item { buf: AudioBuffer; at: number; rate: number; gain: number; band?: boolean }
interface Bark { context: string; emotion?: string; text: string }

const SPEAKER: Record<Voice, string> = { central: 'dispatch.central', car: 'dispatch.car' };
const GAP = -0.045, PAUSE = 0.16, GARBLE = 0.24, STALE = 18;

/** A transmission: buffers at fixed offsets through one radio chain (start/offset-aware, so it can resume). */
class Transmission implements SourceGraph {
  output: GainNode; private nodes: AudioNode[] = []; private srcs: AudioBufferSourceNode[] = []; private input: GainNode;
  constructor(private ctx: BaseAudioContext, private items: Item[], private dur: number) {
    const f = (type: BiquadFilterType, hz: number, q = 0.7, g = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hz; b.Q.value = q; b.gain.value = g; this.nodes.push(b); return b; };
    const sh = ctx.createWaveShaper(); const c = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.5) / Math.tanh(2.5); } sh.curve = c; this.nodes.push(sh);
    this.input = ctx.createGain(); this.output = ctx.createGain(); this.nodes.push(this.input, this.output);
    // 1970s mobile FM radio: narrow band, a presence bump, light clipping from a hot mic.
    this.input.connect(f('highpass', 320, 0.8)).connect(f('lowpass', 3000, 0.9)).connect(f('peaking', 1700, 1.2, 5)).connect(sh).connect(this.output);
  }
  start(when: number, offset: number) {
    for (const it of this.items) {
      const end = it.at + it.buf.duration / it.rate; if (offset >= end) continue;
      const s = this.ctx.createBufferSource(); s.buffer = it.buf; s.playbackRate.value = it.rate;
      const g = this.ctx.createGain(); g.gain.value = it.gain; s.connect(g).connect(this.input); this.nodes.push(g);
      s.start(when + Math.max(0, it.at - offset), Math.max(0, offset - it.at) * it.rate); this.srcs.push(s);
    }
  }
  stop(when: number) { for (const s of this.srcs) try { s.stop(when); } catch { /* */ } }
  dispose() { for (const s of this.srcs) { try { s.stop(); } catch { /* */ } try { s.disconnect(); } catch { /* */ } } for (const n of this.nodes) try { n.disconnect(); } catch { /* */ } this.srcs = []; this.nodes = []; }
  get duration() { return this.dur; }
}

export class Dispatch {
  private queue: Line[] = []; private busyUntil = 0; private speaking = false;
  private pools: Record<string, Bark[]> = {};
  private noise: AudioBuffer; private kerchunk: AudioBuffer; private tail: AudioBuffer; private alertTone: AudioBuffer;
  private hotUntil = 0; private openReports = new Set<number>(); private nextIdle = 0;
  contentEnabled = true;
  /** Scanner level: measured -22 LUFS while talking against a -14 LUFS street on the heat_8th scene (stems tool). */
  level = 0.26;
  stats = { transmissions: 0, fragments: 0, garbled: 0, dropped: 0, officerDown: 0, coverage: 1 };

  constructor(private env: Env, private lib: VoiceLibrary, private emit: (e: unknown) => void, private siren: () => void, private place: (x: number, z: number) => string, private baseUrl: string) {
    const ctx = env.ctx, sr = ctx.sampleRate, mk = (s: number, fn: (i: number, t: number) => number) => { const b = ctx.createBuffer(1, Math.round(s * sr), sr), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = fn(i, i / sr); return b; };
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    this.noise = mk(1.5, () => rnd() * 0.5);
    this.kerchunk = mk(0.14, (i, t) => (i < 40 ? rnd() * 0.9 : rnd() * 0.35 * Math.exp(-t / 0.05)));
    this.tail = mk(0.2, (_i, t) => rnd() * 0.45 * Math.min(1, t / 0.01) * Math.exp(-t / 0.09));
    // Officer-down alert: three short 1.2 kHz pips, an original pattern (not any real agency's tone).
    this.alertTone = mk(0.9, (_i, t) => { const k = Math.floor(t / 0.3), u = t - k * 0.3; return u < 0.18 ? Math.sin(2 * Math.PI * 1200 * t) * 0.6 * Math.min(1, u / 0.005, (0.18 - u) / 0.005) : 0; });
  }

  async loadContent() {
    if (!this.contentEnabled) return;
    for (const f of ['police_radio', 'cop_killed']) {
      try { const r = await fetch(`${this.baseUrl}content/barks/${f}.json`); if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) this.pools[f] = (await r.json()).lines ?? []; } catch { /* offline */ }
    }
  }

  /** Queue a transmission. Central speaks gameplay's calls; cars answer. */
  say(text: string, o: { voice?: Voice; urgent?: boolean; car?: number; priority?: number; alert?: boolean; fallback?: Voice } = {}) {
    if (!text.trim()) return;
    // Who's talking follows radio procedure unless the caller says: "Central to all cars…" / "All units…" is Central;
    // "Central, car six…" or "Car 14, …" is a car calling in. A car that names itself keeps that number.
    const voice: Voice = o.voice ?? (/^(Central to|All )/i.test(text) ? 'central' : /^(Central,|Car )/i.test(text) ? 'car' : o.fallback ?? 'central');
    const named = text.match(/\bcar (\d+|[a-z]+(?:-[a-z]+)?)\b/i);
    const namedNo = named ? (/^\d+$/.test(named[1]) ? +named[1] : WORD_NO[named[1].toLowerCase()]) : undefined;
    o = { ...o, voice, car: voice === 'car' ? (named ? namedNo : o.car ?? (this.env.rng.range(3, 40) | 0)) : undefined };
    const now = this.env.ctx.currentTime;
    this.queue.push({ text, voice, urgent: !!o.urgent || now < this.hotUntil, car: o.car, queuedAt: now, priority: o.priority ?? (o.urgent ? 2 : 1), alert: o.alert });
    this.queue.sort((a, b) => b.priority - a.priority || a.queuedAt - b.queuedAt);
    while (this.queue.length > 5) { this.queue.pop(); this.stats.dropped++; }
  }

  /** A line from narrative's pool by context, with {street}/{avenue} filled; lines needing other fields are skipped. */
  sayPool(pool: string, context: string, at: [number, number] | null, o: { voice?: Voice; urgent?: boolean; car?: number; priority?: number; alert?: boolean } = {}) {
    const [street, avenue] = (at ? this.place(at[0], at[1]) : '').split(' and ');
    const ok = (this.pools[pool] ?? []).filter((l) => l.context === context && [...l.text.matchAll(/\{(\w+)\}/g)].every((m) => (m[1] === 'street' && street) || (m[1] === 'avenue' && avenue)));
    if (!ok.length) return false;
    const l = ok[(this.env.rng.next() * ok.length) | 0];
    this.say(l.text.replace('{street}', street ?? '').replace('{avenue}', avenue ?? ''), { ...o, urgent: l.emotion === 'urgent' || o.urgent, voice: undefined, fallback: o.voice });
    return true;
  }

  private sayPoolMatching(pool: string, context: string, re: RegExp, at: [number, number] | null, o: Parameters<Dispatch['sayPool']>[3]) {
    const keep = this.pools[pool]; this.pools[pool] = (keep ?? []).filter((l) => l.context !== context || re.test(l.text));
    try { return this.sayPool(pool, context, at, o); } finally { this.pools[pool] = keep; }
  }

  /** Officer down: the alert, Central urgent, the cop_killed radio sequence, sirens converging, a hot channel for 90 s. */
  officerDown(at: [number, number]) {
    this.stats.officerDown++; this.hotUntil = this.env.ctx.currentTime + 90;
    this.queue = this.queue.filter((l) => l.priority >= 3); // the band clears for this
    // Narrative's escalate lines include 'officer down'; prefer one of those, else say it plainly.
    const esc = (this.pools.police_radio ?? []).some((l) => l.context === 'escalate' && /officer down/i.test(l.text));
    if (!esc || !this.sayPoolMatching('police_radio', 'escalate', /officer down/i, at, { priority: 4, alert: true, urgent: true })) this.say(`Central to all cars, officer down, ${this.place(at[0], at[1])}. All units respond.`, { urgent: true, priority: 4, alert: true });
    const seq = (this.pools.cop_killed ?? []).filter((l) => l.context === 'radio');
    seq.slice(1).forEach((l, i) => setTimeout0(this.env, 6 + i * 9, () => this.say(l.text, { urgent: l.emotion !== 'grave', priority: 3 })));
    for (let k = 0; k < 3; k++) setTimeout0(this.env, 3 + k * 5 + this.env.rng.range(0, 3), () => this.siren());
    for (let k = 0; k < 3; k++) setTimeout0(this.env, 9 + k * 7, () => { const car = this.env.rng.range(3, 40) | 0; this.say(`Car ${car}, on the way.`, { voice: 'car', car, urgent: true, priority: 3 }); });
  }

  /** Gameplay's events (src/gameplay/index.ts): radio, police, copKilled, reportFiled. */
  bindGameplay(gp: { on(type: string, cb: (e: any) => void): void }) {
    gp.on('radio', (e: { text?: string; at?: [number, number] }) => { if (e?.text) this.say(e.text, { urgent: /officer down|shots fired|shooting|homicide|gunpoint|pursuit/i.test(e.text) }); });
    gp.on('copKilled', (e: { at?: Vec3 | [number, number] }) => { const a = e?.at; if (a) this.officerDown(a.length === 3 ? [a[0], (a as Vec3)[2]] : [a[0], a[1]]); });
    gp.on('reportFiled', (e: { id?: number }) => { if (typeof e?.id === 'number') this.openReports.add(e.id); });
    gp.on('police', (e: { kind: string; unit?: string; at?: [number, number]; why?: string; report?: number; x?: number; z?: number }) => {
      const car = carNo(e.unit), r = this.env.rng;
      switch (e.kind) {
        case 'dispatched': if (r.next() < 0.5) this.say(`Car ${car}, ${r.next() < 0.5 ? 'on the way' : 'ten-four'}.`, { voice: 'car', car }); break;
        case 'pursuit': this.say(`Central, car ${car}, in pursuit.`, { voice: 'car', car, urgent: true, priority: 2 }); break;
        case 'lost': this.sayPool('police_radio', 'lost', e.at ?? null, { voice: 'car', car }); break;
        case 'investigate': if (r.next() < 0.4) this.sayPool('police_radio', 'search', e.at ?? null, { voice: 'car', car }); break;
        case 'roadblock': this.say(`Central, car ${car}, roadblock at ${this.place(e.x ?? 0, e.z ?? 0)}.`, { voice: 'car', car }); break;
        case 'cleared': if (typeof e.report === 'number') this.openReports.delete(e.report); this.sayPool('police_radio', e.why === 'bribe' ? 'bribe_heard' : 'cooldown', null, { voice: e.why === 'bribe' ? 'car' : 'central', car }); break;
      }
    });
  }

  /** The brownout call (once per outage). */
  brownout() { this.sayPool('police_radio', 'brownout', null, { urgent: true, priority: 2 }); }

  update() {
    const now = this.env.ctx.currentTime;
    if (!this.env.live) return;
    // Idle chatter while a report is open (or the channel is hot).
    if ((this.openReports.size || now < this.hotUntil) && now >= this.nextIdle) { this.nextIdle = now + this.env.rng.range(25, 60); if (!this.queue.length) this.sayPool('police_radio', now < this.hotUntil ? 'search' : 'idle', null, { voice: this.env.rng.next() < 0.5 ? 'car' : 'central', car: this.env.rng.range(3, 40) | 0 }); }
    if (this.speaking || now < this.busyUntil || !this.queue.length) return;
    const line = this.queue.shift()!;
    if (now - line.queuedAt > STALE && line.priority < 3) { this.stats.dropped++; return; }
    this.speaking = true; void this.transmit(line).finally(() => { this.speaking = false; });
  }

  private async transmit(l: Line) {
    const sp = SPEAKER[l.voice], em = l.voice === 'central' && l.urgent ? 'urgent' : 'flat';
    const segs = segment(l.text, (f) => this.lib.duration(sp, em, f) !== undefined);
    const bufs = await Promise.all(segs.map((s) => (s.frag === ',' || !s.known ? Promise.resolve(null) : this.lib.get(sp, em, s.frag, 1.5))));
    const rate = l.voice === 'car' ? 0.94 + ((l.car ?? 7) % 9) * 0.015 : 1; // each car's radio and voice sit a little differently
    const items: Item[] = [{ buf: this.noise, at: 0, rate: 1, gain: 0.05 }];
    let t = 0;
    if (l.alert) { items.push({ buf: this.alertTone, at: t, rate: 1, gain: 0.5 }); t += 1.0; }
    items.push({ buf: this.kerchunk, at: t, rate: 1, gain: 0.5 }); t += 0.12;
    let known = 0, words = 0;
    segs.forEach((s, i) => {
      if (s.frag === ',') { t += PAUSE; return; }
      words++;
      const b = bufs[i];
      if (b) { items.push({ buf: b, at: t, rate, gain: 1 }); t += b.duration / rate + GAP; known++; this.stats.fragments++; }
      else { items.push({ buf: this.noise, at: t, rate: 1.6, gain: 0.35 }); t += GARBLE; this.stats.garbled++; } // garble: a burst of hiss where the words drop out
    });
    items.push({ buf: this.tail, at: t + 0.04, rate: 1, gain: 0.6 }); t += 0.28;
    // Static bed under the whole transmission (loop the noise buffer by stacking copies).
    for (let u = this.noise.duration; u < t; u += this.noise.duration) items.push({ buf: this.noise, at: u, rate: 1, gain: 0.05 });
    this.stats.coverage = words ? +(0.8 * this.stats.coverage + 0.2 * (known / words)).toFixed(3) : this.stats.coverage;
    const dur = t;
    this.env.vm.play({ name: 'dispatch', bus: 'dialogue', category: 'voice', priority: 8, unkeyed: true, pinned: true, gain: this.level, duration: dur, resumable: true,
      build: (ctx) => new Transmission(ctx, items, dur) });
    this.stats.transmissions++;
    this.emit({ text: l.text, speaker: l.voice === 'central' ? 'Central' : l.car !== undefined ? `Car ${l.car}` : 'Car', duration: dur, urgent: l.urgent, spoken: normalise(l.text) });
    this.busyUntil = this.env.ctx.currentTime + dur + this.env.rng.range(0.5, 1.4);
  }
}

const WORD_NO: Record<string, number> = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [numberWords(i), i]));
/** Unit ids → a stable radio car number (3-39). */
function carNo(id?: string) { let h = 0; for (const c of id ?? 'x') h = (h * 31 + c.charCodeAt(0)) >>> 0; return 3 + (h % 37); }
import { setTimeoutAudio } from './ambience';
function setTimeout0(env: Env, s: number, fn: () => void) { setTimeoutAudio(env, s, fn); }
