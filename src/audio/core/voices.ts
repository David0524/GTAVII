/**
 * Voice management: every sound in the world is a Voice. Only the most audible N (per quality
 * preset) own real audio nodes; the rest are virtual (tracked, positioned, timed, but silent and
 * costing nothing on the audio thread). Voices are promoted, demoted and stolen every frame by
 * score = audibility x priority weight. Real voices get distance curves per category, air
 * absorption, occlusion/diffraction from the acoustic geometry, a reverb send that grows with
 * distance and occlusion, and Doppler for moving sources.
 */
import { CURVES, MIX_GAIN, SPEED_OF_SOUND, airCutoff, distanceGain, type AudioQuality, type BusId, type Category, type Vec3 } from '../config';
import type { Mixer } from './mixer';
import type { AcousticGeometry } from '../acoustics/geometry';

type Bus = Exclude<BusId, 'master'>;

export interface SourceGraph {
  output: AudioNode;
  start(when: number, offset: number): void;
  stop(when: number): void;
  dispose(): void;
  setPitch?(p: number): void;
}

export interface VoiceOptions {
  name: string;
  bus: Bus;
  category: Category;
  /** 0..10; breaks ties and protects important voices (dialogue 9, player vehicle 8, ambience beds 3). */
  priority?: number;
  gain?: number;
  at?: Vec3 | (() => Vec3);
  vel?: () => Vec3;
  loop?: boolean;
  /** One-shot length in seconds (required for one-shots, ignored for loops). */
  duration?: number;
  build: (ctx: BaseAudioContext) => SourceGraph;
  occlude?: boolean;
  doppler?: boolean;
  /** Dialogue that must not duck the radio (overheard / ambient speech). */
  unkeyed?: boolean;
  /** Multiplier on the category's reverb send. */
  wet?: number;
  /** One-shots built from buffers can restart mid-way when promoted; synth one-shots cannot. */
  resumable?: boolean;
  /** Never virtualise (counts against the cap; used for the master radio feed and UI). */
  pinned?: boolean;
  onEnd?: () => void;
  /** Start this many seconds from now, sample-accurately (sound propagation delay, echoes). */
  delay?: number;
}

let nextId = 1;

export class Voice {
  readonly id = nextId++;
  src: SourceGraph | null = null;
  t0: number; gain: number; stopped = false; stopAt = Infinity; audibility = 0; score = 0;
  dist = 0; occGain = 1; occLp = 20000; occCheckedAt = -1; app: Vec3 = [0, 0, 0]; pathLen = 0; pitch = 1;
  chain: { lp?: BiquadFilterNode; g: GainNode; pan?: PannerNode; send: GainNode; lg: number; ls: number; llp: number; px: number; py: number; pz: number } | null = null;
  constructor(readonly o: VoiceOptions, now: number) { this.t0 = now + Math.max(0, o.delay ?? 0); this.gain = o.gain ?? 1; }
  get positional() { return !!this.o.at; }
  pos(): Vec3 | null { const a = this.o.at; return !a ? null : typeof a === 'function' ? a() : a; }
  setGain(g: number) { this.gain = g; }
  /** Fade out and end. Safe to call more than once. */
  stop(fade = 0.08) { if (!this.stopped) { this.stopped = true; this.stopAt = fade; } }
}

export interface Listener { position: Vec3; forward: Vec3; up: Vec3; velocity: Vec3 }

/**
 * The HRTF panner adds processing latency that equal-power panning doesn't (measured ~5.8 ms in Chromium). Echoes and
 * direct sounds can be panned differently, so delayed voices that get HRTF start early by this much. Measured once at
 * load by rendering an impulse through both panners offline (works in every browser; 0 if it can't be measured).
 */
export async function measureHrtfLatency(sr: number): Promise<number> {
  try {
    const peakAt = async (model: PanningModelType) => {
      const c = new OfflineAudioContext(1, 4096, sr); const b = c.createBuffer(1, 64, sr); b.getChannelData(0)[0] = 1;
      const s = c.createBufferSource(); s.buffer = b; const p = c.createPanner(); p.panningModel = model; p.distanceModel = 'linear'; p.rolloffFactor = 0;
      p.positionX.value = 0; p.positionY.value = 0; p.positionZ.value = -1; s.connect(p).connect(c.destination); s.start(0);
      const d = (await c.startRendering()).getChannelData(0); s.disconnect(); p.disconnect(); let m = 0, at = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); at = i; } return at;
    };
    const lat = ((await peakAt('HRTF')) - (await peakAt('equalpower'))) / sr;
    return lat > 0 && lat < 0.05 ? lat : 0;
  } catch { return 0; }
}

export class VoiceManager {
  /** Seconds of extra latency in the HRTF panner (see measureHrtfLatency). */
  hrtfLatency = 0;
  voices: Voice[] = [];
  private graveyard: { at: number; v: { src: SourceGraph; chain: Voice['chain'] } }[] = [];
  private rr = 0;
  listener: Listener = { position: [0, 1.7, 0], forward: [0, 0, -1], up: [0, 1, 0], velocity: [0, 0, 0] };
  stats = { real: 0, virtual: 0, total: 0, peakReal: 0, stolen: 0, promoted: 0, demoted: 0, occlusionChecks: 0, updateMs: 0 };
  /** Extra gain on outdoor positional voices while the listener is inside (walls). */
  insideGain = 1; insideLp = 20000;
  /** Debug/test: voices whose name matches are kept but silenced (stem rendering). */
  mute: RegExp | null = null;

  constructor(private ctx: BaseAudioContext, private mixer: Mixer, private geo: AcousticGeometry | null, private q: AudioQuality) {}

  play(o: VoiceOptions): Voice {
    const v = new Voice(o, this.ctx.currentTime);
    this.voices.push(v);
    return v;
  }

  private lastL = new Float64Array(9).fill(NaN);
  private setListener(l: Listener) {
    this.listener = l;
    const q = this.lastL; const v = [...l.position, ...l.forward, ...l.up];
    let moved = false; for (let i = 0; i < 9; i++) if (Math.abs(v[i] - q[i]) > 1e-3 || q[i] !== q[i]) { moved = true; q[i] = v[i]; }
    if (!moved) return;
    const L = this.ctx.listener; const [x, y, z] = l.position, [fx, fy, fz] = l.forward, [ux, uy, uz] = l.up;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz; L.upX.value = ux; L.upY.value = uy; L.upZ.value = uz;
    } else {
      (L as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(x, y, z);
      (L as unknown as { setOrientation(...a: number[]): void }).setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /** Line of sight, else the shortest open path round a street corner, else through the block. */
  private propagate(v: Voice, s: Vec3) {
    const g = this.geo, [lx, , lz] = this.listener.position;
    this.stats.occlusionChecks++;
    v.app = s; v.pathLen = Math.hypot(s[0] - lx, s[2] - lz); v.occGain = 1; v.occLp = 20000;
    if (!g || !v.o.occlude) return;
    if (g.crossings(lx, lz, s[0], s[2], 3.5, 1) === 0) return;
    let best = Infinity, bc: { x: number; z: number } | null = null;
    for (const c of this.cornerCache) {
      const p = Math.hypot(c.x - lx, c.z - lz) + Math.hypot(s[0] - c.x, s[2] - c.z);
      if (p >= best || p > v.pathLen * 2.5 + 40) continue;
      if (g.crossings(c.x, c.z, s[0], s[2], 3.5, 1) === 0) { best = p; bc = c; }
    }
    if (bc) {
      const d1x = bc.x - lx, d1z = bc.z - lz, L1 = Math.hypot(d1x, d1z) || 1;
      const d2x = s[0] - bc.x, d2z = s[2] - bc.z, L2 = Math.hypot(d2x, d2z) || 1;
      const cos = (d1x * d2x + d1z * d2z) / (L1 * L2); const bend = Math.acos(Math.max(-1, Math.min(1, cos))) / (Math.PI / 2); // 0 straight .. 2 reversed
      v.occGain = Math.pow(10, -(3 + 8 * Math.min(bend, 1.5)) / 20);
      v.occLp = Math.max(900, 6000 - 3600 * Math.min(bend, 1.3));
      v.pathLen = best;
      v.app = [lx + (d1x / L1) * best, s[1], lz + (d1z / L1) * best];
    } else {
      v.occGain = Math.pow(10, -24 / 20); v.occLp = 380; // through a building
    }
  }

  /** Intersections visible from the listener, refreshed a few times a second. */
  private cornerCache: { x: number; z: number }[] = [];
  private cornerT = 0;
  private refreshCorners() {
    const g = this.geo; if (!g) return;
    const [lx, , lz] = this.listener.position; this.cornerCache.length = 0;
    for (const c of g.intersections) {
      const d = Math.hypot(c.x - lx, c.z - lz); if (d > 260) continue;
      if (g.crossings(lx, lz, c.x, c.z, 3.5, 1) === 0) this.cornerCache.push(c);
      if (this.cornerCache.length >= 10) break;
    }
  }

  update(l: Listener, dt: number) {
    const t0 = performance.now();
    const now = this.ctx.currentTime;
    this.setListener(l);
    // Dispose finished fades.
    for (let i = this.graveyard.length - 1; i >= 0; i--) if (now >= this.graveyard[i].at) { this.kill(this.graveyard[i].v); this.graveyard.splice(i, 1); }
    if ((this.cornerT -= dt) <= 0) { this.cornerT = 0.25; this.refreshCorners(); }
    const [lx, ly, lz] = l.position;
    // Expire and score.
    let checks = 0; const nPos = this.voices.length;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      const age = now - v.t0;
      if (v.stopped && v.stopAt !== Infinity) { this.demote(v, v.stopAt); this.voices.splice(i, 1); v.o.onEnd?.(); continue; }
      if (!v.o.loop && v.o.duration !== undefined && age >= v.o.duration) { this.demote(v, 0.02); this.voices.splice(i, 1); v.o.onEnd?.(); continue; }
      const p = v.pos();
      let att = 1;
      if (p) {
        const c = CURVES[v.o.category];
        const rough = Math.hypot(p[0] - lx, p[1] - ly, p[2] - lz);
        if (rough < c.max && (v.occCheckedAt < 0 || (checks < this.q.occlusionPerFrame && ((this.rr + i) % Math.max(1, Math.ceil(nPos / this.q.occlusionPerFrame)) === 0)))) {
          this.propagate(v, p); v.occCheckedAt = now; checks++;
        } else if (v.occCheckedAt < 0 || rough >= c.max) { v.app = p; v.pathLen = rough; }
        else if (v.occGain === 1) { v.app = p; v.pathLen = rough; }
        v.dist = rough;
        att = distanceGain(v.o.category, Math.max(v.pathLen, rough)) * v.occGain * this.insideGain;
      }
      v.audibility = v.gain * MIX_GAIN[v.o.category] * att;
      v.score = v.o.pinned ? 1e9 : v.audibility * (1 + (v.o.priority ?? 5) / 5);
    }
    this.rr++;
    // Choose real voices.
    const sorted = this.voices.slice().sort((a, b) => b.score - a.score);
    const cap = this.q.voices; let real = 0, hrtfLeft = this.q.hrtf, promos = this.q.promotionsPerFrame;
    for (const v of sorted) {
      const want = real < cap && v.audibility > 0.0004;
      if (want) {
        real++;
        if (!v.src) {
          if (!v.o.loop && v.o.duration !== undefined && !v.o.resumable && now - v.t0 > 0.12) continue; // a synth one-shot that missed its start stays virtual
          if (promos-- <= 0 && !v.o.pinned) continue; // budget: the rest promote next frame
          this.promote(v, hrtfLeft > 0 && v.positional && v.dist < 60);
          if (v.chain?.pan?.panningModel === 'HRTF') hrtfLeft--;
        } else if (v.chain?.pan?.panningModel === 'HRTF') hrtfLeft--;
        this.applyParams(v, dt);
      } else if (v.src) { this.demote(v, 0.05); this.stats.stolen += real >= cap ? 1 : 0; }
    }
    this.stats.real = real; this.stats.total = this.voices.length; this.stats.virtual = this.voices.length - real;
    this.stats.peakReal = Math.max(this.stats.peakReal, real);
    this.stats.updateMs = performance.now() - t0;
  }

  private promote(v: Voice, hrtf: boolean) {
    const ctx = this.ctx; const now = ctx.currentTime;
    const src = v.o.build(ctx);
    const g = ctx.createGain(); g.gain.value = 0;
    const send = ctx.createGain(); send.gain.value = 0;
    let lp: BiquadFilterNode | undefined, pan: PannerNode | undefined;
    const busIn = v.o.unkeyed ? this.mixer.dialogueUnkeyed : this.mixer.busIn[v.o.bus];
    if (v.positional) {
      lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6; lp.frequency.value = 20000;
      pan = ctx.createPanner(); pan.panningModel = hrtf ? 'HRTF' : 'equalpower'; pan.distanceModel = 'linear'; pan.refDistance = 1; pan.maxDistance = 1e5; pan.rolloffFactor = 0;
      const a = v.app; pan.positionX.value = a[0]; pan.positionY.value = a[1]; pan.positionZ.value = a[2];
      src.output.connect(lp).connect(g).connect(pan).connect(busIn);
      lp.connect(send);
    } else {
      src.output.connect(g).connect(busIn);
      src.output.connect(send);
    }
    send.connect(this.mixer.sendIn[v.o.bus]);
    v.src = src; v.chain = { lp, g, pan, send, lg: -1, ls: -1, llp: -1, px: NaN, py: NaN, pz: NaN };
    // A delayed voice panned with HRTF starts early by the panner's latency so it lines up with equal-power voices.
    const t0 = hrtf && v.t0 > now ? Math.max(now, v.t0 - this.hrtfLatency) : v.t0; // never skip an attack that's already due
    const offset = Math.max(0, now - t0);
    src.start(Math.max(now, t0), offset);
    this.stats.promoted++;
  }

  private demote(v: Voice, fade: number) {
    if (!v.src || !v.chain) return;
    const now = this.ctx.currentTime;
    v.chain.g.gain.cancelScheduledValues(now); v.chain.g.gain.setValueAtTime(v.chain.g.gain.value, now); v.chain.g.gain.linearRampToValueAtTime(0, now + fade);
    v.chain.send.gain.cancelScheduledValues(now); v.chain.send.gain.setTargetAtTime(0, now, fade / 3);
    try { v.src.stop(now + fade + 0.02); } catch { /* */ }
    this.graveyard.push({ at: now + fade + 0.05, v: { src: v.src, chain: v.chain } });
    v.src = null; v.chain = null; this.stats.demoted++;
  }

  private kill(x: { src: SourceGraph; chain: Voice['chain'] }) {
    try { x.src.dispose(); } catch { /* */ }
    const c = x.chain; if (!c) return;
    for (const n of [c.lp, c.g, c.pan, c.send]) if (n) try { n.disconnect(); } catch { /* */ }
  }

  private applyParams(v: Voice, dt: number) {
    const c = v.chain!; const now = this.ctx.currentTime;
    let gain = this.mute && this.mute.test(v.o.name) ? 0 : v.gain * MIX_GAIN[v.o.category], wet = CURVES[v.o.category].wet * (v.o.wet ?? 1);
    if (v.positional) {
      const d = Math.max(v.pathLen, v.dist);
      gain *= distanceGain(v.o.category, d) * v.occGain * this.insideGain;
      const lpHz = Math.min(airCutoff(d), v.occLp, this.insideLp);
      if (Math.abs(lpHz - c.llp) > c.llp * 0.02) { c.lp!.frequency.setTargetAtTime(lpHz, now, 0.05); c.llp = lpHz; }
      // Only touch AudioParams when something audible changed (each call crosses into the engine).
      const a = v.app;
      if (Math.abs(a[0] - c.px) + Math.abs(a[1] - c.py) + Math.abs(a[2] - c.pz) > 0.03) { c.pan!.positionX.value = a[0]; c.pan!.positionY.value = a[1]; c.pan!.positionZ.value = a[2]; c.px = a[0]; c.py = a[1]; c.pz = a[2]; }
      // More reverb for far and for occluded sources (less direct, same room).
      const ref = CURVES[v.o.category].ref;
      wet *= Math.min(2.5, 1 + Math.log2(Math.max(1, d / ref)) * 0.18) * (v.occGain < 0.99 ? 1.6 : 1);
      if (v.o.doppler && v.src?.setPitch && v.o.vel) {
        const p = v.pos()!; const [lx, ly, lz] = this.listener.position; const dd = Math.max(0.5, v.dist);
        const ux = (p[0] - lx) / dd, uy = (p[1] - ly) / dd, uz = (p[2] - lz) / dd;
        const sv = v.o.vel(), lv = this.listener.velocity;
        const vs = sv[0] * ux + sv[1] * uy + sv[2] * uz, vl = lv[0] * ux + lv[1] * uy + lv[2] * uz;
        const target = Math.max(0.75, Math.min(1.33, (SPEED_OF_SOUND + vl) / (SPEED_OF_SOUND + vs)));
        v.pitch += (target - v.pitch) * Math.min(1, dt * 12);
        v.src.setPitch(v.pitch);
      }
    }
    if (Math.abs(gain - c.lg) > Math.max(0.0005, c.lg * 0.01)) { c.g.gain.setTargetAtTime(gain, now, 0.03); c.lg = gain; }
    const sg = gain * wet; if (Math.abs(sg - c.ls) > Math.max(0.0005, c.ls * 0.02)) { c.send.gain.setTargetAtTime(sg, now, 0.05); c.ls = sg; }
  }

  /** Stop everything immediately and release all nodes (used by unload and tests). */
  disposeAll() {
    for (const v of this.voices) if (v.src) this.kill({ src: v.src, chain: v.chain });
    for (const gy of this.graveyard) this.kill(gy.v);
    this.voices = []; this.graveyard = [];
  }
}
