/// <reference path="./worklet-env.d.ts" />
/**
 * All AudioWorklet processors in one module (one addModule() round-trip, one network fetch).
 * Heavy per-sample DSP lives here, on the audio rendering thread, so the main thread only
 * pushes a handful of parameters per frame.
 *
 *   t74-engine   procedural combustion engine (firing pulses -> exhaust waveguides -> muffler)
 *   t74-traffic  aggregate traffic mass for one sector (engine-grain cloud + road and wet tyre noise)
 *   t74-rain     modal rain: Minnaert bubbles, metal pings, canvas thumps, pavement ticks, drips
 *   t74-walla    crowd babble from N formant talkers (also kids in parks)
 *   t74-voice    placeholder dialogue voice: one formant talker following a syllable script
 *   t74-fdn      8-line feedback-delay-network late reverb with continuous RT60/size/damping
 *   t74-early    listener-centric street-canyon early reflections and flutter (slapback)
 *   t74-duck     sidechain ducker (input 0 program, input 1 key)
 *   t74-limiter  lookahead true-peak limiter (4x oversampled peak detection)
 *   t74-static   radio tuning static (AM crackle and heterodyne whistles, FM hiss)
 *   t74-music    PLACEHOLDER radio music beds (until the user chooses a music source)
 */
import { Rng, Pink, Brown, OnePole, Biquad, Mode, Delay, Allpass, Smooth, VOWELS, TAU, flush, clamp } from './dsp';
import type { EngineProfile } from './engineProfile';

const SR = sampleRate;

// ====================================================================================== engine
class EngineProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    { name: 'rpm', defaultValue: 700, minValue: 0, maxValue: 9000, automationRate: 'k-rate' as const },
    { name: 'load', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
    { name: 'pitch', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' as const },
    { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' as const },
  ];
  private p: EngineProfile; private rng: Rng; private pink: Pink;
  private pos = 0; private next = 0; private jit: Float32Array;
  private pulses: Float32Array; // per pipe 3 slots: [n, W, A, noiseAmt] * 3 * 2
  private pipes: Delay[]; private pipeLp: OnePole[];
  private muf1 = new OnePole(); private muf2 = new OnePole(); private dc = new OnePole(20, SR);
  private res: Biquad[]; private intakeBp = new Biquad(); private knockBp = new Biquad(); private tickHp = new OnePole(3000, SR);
  private rpm = new Smooth(700, 40, SR); private load = new Smooth(0.2, 60, SR); private gain = new Smooth(0, 30, SR);
  private lopeT = 0; private blowPh = 0; private knockE = 0; private tickE = 0; private alive = true;
  private blockCount = 0;
  constructor(opts: { processorOptions: { profile: EngineProfile; seed: number } }) {
    super();
    this.p = opts.processorOptions.profile;
    this.rng = new Rng(opts.processorOptions.seed); this.pink = new Pink(this.rng);
    this.jit = new Float32Array(this.p.cylinders);
    this.pulses = new Float32Array(2 * 3 * 4);
    this.pipes = [new Delay(Math.ceil((2 * this.p.pipeLen[0] / 343) * SR * 2.2)), new Delay(Math.ceil((2 * this.p.pipeLen[1] / 343) * SR * 2.2))];
    this.pipeLp = [new OnePole(2500, SR), new OnePole(2200, SR)];
    this.res = this.p.resonances.map(([f, q, g]) => new Biquad().set('peak', f, q, SR, g));
    this.knockBp.set('bp', 2600, 3, SR);
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; };
    this.newCycle();
  }
  private newCycle() {
    const p = this.p;
    for (let k = 0; k < p.cylinders; k++) this.jit[k] = this.rng.bi() * p.rough * 0.25 / p.cylinders;
    // Cam lope: a slow random walk in pulse strength, strongest at idle.
    this.lopeT = this.lopeT * 0.6 + this.rng.bi() * 0.4;
  }
  private fire(k: number, rpm: number, load: number) {
    const p = this.p;
    if (p.misfire > 0 && this.rng.next() < p.misfire * (1.2 - load)) return;
    const idleW = clamp(1 - (rpm - p.idle) / 900, 0, 1);
    const lope = 1 + p.lope * idleW * this.lopeT;
    let A = p.level * (0.22 + 0.78 * Math.pow(load, 0.8)) * (0.45 + 0.55 * rpm / p.redline) * lope * (1 + this.rng.bi() * p.rough);
    let noise = p.pulseNoise;
    if (load < 0.08 && rpm > p.idle * 1.6 && this.rng.next() < p.overrun) { A *= 2.6; noise = 0.9; } // overrun crackle
    const interval = (60 / rpm) * (p.strokes / 2) / p.cylinders * SR;
    const W = clamp(interval * p.pulseWidth, SR * 0.0006, SR * 0.012);
    const pipe = p.bank[k];
    const base = pipe * 12;
    let slot = 0, oldest = -1;
    for (let s = 0; s < 3; s++) { const n = this.pulses[base + s * 4]; const w = this.pulses[base + s * 4 + 1]; if (n >= w) { slot = s; oldest = -2; break; } if (n > oldest) { oldest = n; slot = s; } }
    const o = base + slot * 4;
    this.pulses[o] = 0; this.pulses[o + 1] = W; this.pulses[o + 2] = A; this.pulses[o + 3] = noise;
    this.knockE += p.knock * (0.6 + 0.4 * (1 - load)) * (0.7 + 0.3 * this.rng.next());
    this.tickE += p.mech * (0.3 + 0.7 * rpm / p.redline);
  }
  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const out = outputs[0][0]; if (!out) return this.alive;
    const p = this.p;
    const tRpm = clamp(params.rpm[0], p.idle * 0.5, p.redline * 1.05), tLoad = params.load[0], pitch = params.pitch[0], tGain = this.alive ? params.gain[0] : 0;
    if ((this.blockCount++ & 7) === 0) {
      const r = this.rpm.v / p.redline;
      const mc = (p.muffler[0] + (p.muffler[1] - p.muffler[0]) * Math.pow(this.load.v, 0.7)) * (0.7 + 0.4 * r);
      this.muf1.set(mc, SR); this.muf2.set(mc * 1.4, SR);
      this.intakeBp.set('bp', 250 + 1400 * r, 1.4, SR);
    }
    const d0 = (2 * p.pipeLen[0] / 343) * SR / pitch, d1 = (2 * p.pipeLen[1] / 343) * SR / pitch;
    for (let i = 0; i < out.length; i++) {
      const rpm = this.rpm.step(tRpm), load = this.load.step(tLoad), g = this.gain.step(tGain);
      const inc = (rpm / 60) / (p.strokes / 2) / SR * pitch;
      this.pos += inc;
      if (this.pos >= 1) { this.pos -= 1; this.next = 0; this.newCycle(); }
      while (this.next < p.cylinders && this.pos >= p.firing[this.next] + this.jit[this.next]) { this.fire(this.next, rpm, load); this.next++; }
      // Exhaust excitation per pipe.
      let e0 = 0, e1 = 0;
      for (let s = 0; s < 6; s++) {
        const o = s * 4; const n = this.pulses[o], W = this.pulses[o + 1];
        if (n >= W) continue;
        const x = n / W; const sh = Math.sin(Math.PI * x); const v = this.pulses[o + 2] * (sh * sh * Math.exp(-3 * x) + this.pulses[o + 3] * this.rng.bi() * (1 - x) * 0.6);
        if (s < 3) e0 += v; else e1 += v;
        this.pulses[o] = n + 1;
      }
      const y0 = e0 - p.pipeFb * this.pipeLp[0].lp(this.pipes[0].read(d0));
      const y1 = e1 - p.pipeFb * this.pipeLp[1].lp(this.pipes[1].read(d1));
      this.pipes[0].push(flush(y0)); this.pipes[1].push(flush(y1));
      let x = this.muf2.lp(this.muf1.lp(y0 + y1 * 0.92));
      for (let r = 0; r < this.res.length; r++) x = this.res[r].run(x);
      // Intake roar and mechanical noise.
      const cyc = Math.abs(Math.sin(this.pos * Math.PI * p.cylinders));
      x += this.intakeBp.run(this.pink.next()) * p.intake * load * (rpm / p.redline) * (0.5 + cyc);
      if (this.tickE > 1e-4) { x += this.tickHp.hp(this.rng.bi()) * this.tickE * 0.25; this.tickE *= 0.996; }
      if (this.knockE > 1e-4) { x += this.knockBp.run(this.rng.bi()) * this.knockE * 0.9; this.knockE *= 0.993; }
      if (p.blower > 0) {
        this.blowPh += (rpm / 60) * p.blowerRatio / SR * pitch; if (this.blowPh > 1) this.blowPh -= 1;
        const rr = rpm / p.redline;
        x += (Math.sin(TAU * this.blowPh) + 0.4 * Math.sin(2 * TAU * this.blowPh + 0.3) + 0.15 * Math.sin(3 * TAU * this.blowPh)) * p.blower * rr * rr * (0.4 + 0.6 * load) * 0.12;
      }
      x = this.dc.hp(x);
      const d = p.drive; x = Math.tanh(x * d) / d;
      out[i] = x * g;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return this.alive || this.gain.v > 1e-4;
  }
}
registerProcessor('t74-engine', EngineProcessor);

// ====================================================================================== traffic mass
function makeTable(heavy: boolean): Float32Array {
  // Single-cycle "engine at distance" waveform: firing fundamental plus a rough harmonic stack.
  const n = 2048, t = new Float32Array(n), r = new Rng(heavy ? 77 : 33);
  const amps: number[] = []; for (let k = 1; k <= 24; k++) amps.push((heavy ? 1.1 : 1) / Math.pow(k, heavy ? 0.9 : 1.15) * (0.6 + 0.8 * r.next()));
  let peak = 0;
  for (let i = 0; i < n; i++) { let v = 0; for (let k = 0; k < amps.length; k++) v += amps[k] * Math.sin(TAU * (k + 1) * i / n + k * 1.7); t[i] = v; peak = Math.max(peak, Math.abs(v)); }
  for (let i = 0; i < n; i++) t[i] /= peak;
  return t;
}
const TABLE_CAR = makeTable(false), TABLE_HEAVY = makeTable(true);
class TrafficProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = ['density', 'speed', 'heavy', 'wet', 'gain'].map((name) => ({ name, defaultValue: name === 'gain' ? 1 : 0, minValue: 0, maxValue: 40, automationRate: 'k-rate' as const }));
  private rng: Rng; private pink: Pink;
  private g = new Float32Array(10 * 7); // per grain: phase, freq, dfreq, env t, dur, amp, heavy
  private untilNext = 0; private road = new OnePole(); private road2 = new OnePole(); private wetBp = new Biquad(); private engLp = new OnePole(900, SR);
  private sm = { d: new Smooth(0, 300, SR), s: new Smooth(0, 300, SR), w: new Smooth(0, 500, SR), gain: new Smooth(0, 50, SR) };
  private alive = true;
  constructor(opts: { processorOptions: { seed: number } }) {
    super(); this.rng = new Rng(opts.processorOptions.seed); this.pink = new Pink(this.rng); this.wetBp.set('bp', 4200, 0.7, SR);
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const out = outputs[0][0]; if (!out) return this.alive;
    const D = params.density[0], S = params.speed[0], H = clamp(params.heavy[0], 0, 1), Wt = clamp(params.wet[0], 0, 1), G = this.alive ? params.gain[0] : 0;
    this.road.set(250 + S * 45, SR); this.road2.set(400 + S * 60, SR);
    const dt = out.length / SR;
    this.untilNext -= dt;
    if (this.untilNext <= 0 && D > 0.02) {
      this.untilNext = this.rng.exp(D * 1.6);
      for (let k = 0; k < 10; k++) {
        const o = k * 7; if (this.g[o + 3] < this.g[o + 4]) continue;
        const heavy = this.rng.next() < H ? 1 : 0;
        const rpm = heavy ? this.rng.range(550, 1900) : this.rng.range(700, 2400) * (0.5 + 0.5 * clamp(S / 12, 0, 1.4));
        const cyl = heavy ? 6 : 8;
        this.g[o] = this.rng.next(); this.g[o + 1] = rpm / 60 * cyl / 2; this.g[o + 2] = this.rng.bi() * 0.15;
        this.g[o + 3] = 0; this.g[o + 4] = this.rng.range(1.5, 5.5); this.g[o + 5] = this.rng.range(0.4, 1) * (heavy ? 1.4 : 1); this.g[o + 6] = heavy;
        break;
      }
    }
    const roadAmp = Math.sqrt(D) * Math.pow(clamp(S / 13, 0, 1.6), 1.4) * 0.5;
    for (let i = 0; i < out.length; i++) {
      const d = this.sm.d.step(D), wt = this.sm.w.step(Wt), gg = this.sm.gain.step(G);
      let eng = 0;
      for (let k = 0; k < 10; k++) {
        const o = k * 7; const t = this.g[o + 3], dur = this.g[o + 4]; if (t >= dur) continue;
        const x = t / dur; const env = Math.sin(Math.PI * x); const f = this.g[o + 1] * (1 + this.g[o + 2] * x);
        let ph = this.g[o] + f / SR; if (ph >= 1) ph -= 1; this.g[o] = ph;
        const tab = this.g[o + 6] ? TABLE_HEAVY : TABLE_CAR;
        eng += tab[(ph * 2048) | 0] * env * env * this.g[o + 5];
        this.g[o + 3] = t + 1 / SR;
      }
      const pn = this.pink.next();
      const road = this.road2.lp(this.road.lp(pn)) * roadAmp * 2.2;
      const wet = this.wetBp.run(this.rng.bi()) * wt * Math.sqrt(d) * clamp(S / 10, 0, 1.5) * 0.1;
      out[i] = (this.engLp.lp(eng) * 0.16 * Math.min(1, Math.sqrt(d + 0.05)) + road + wet) * gg;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return this.alive || this.sm.gain.v > 1e-4;
  }
}
registerProcessor('t74-traffic', TrafficProcessor);

// ====================================================================================== rain
class RainProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = ['intensity', 'puddle', 'metal', 'canvas', 'pavement', 'leaves', 'drips', 'gain'].map((name) => ({ name, defaultValue: name === 'gain' ? 1 : 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' as const }));
  private rng: Rng; private pink: Pink; private modes: Mode[] = []; private pans = new Float32Array(96);
  private clickE = new Float32Array(32); private clickPan = new Float32Array(32); private clickHp = new OnePole(2500, SR); private clickDecay = new Float32Array(32);
  private washL = new Biquad(); private washR = new Biquad(); private washLp = new OnePole(7000, SR); private nextDrop = 0; private nextDrip = 0;
  private alive = true; private sm = new Smooth(0, 800, SR);
  constructor(opts: { processorOptions: { seed: number } }) {
    super(); this.rng = new Rng(opts.processorOptions.seed); this.pink = new Pink(this.rng);
    for (let i = 0; i < 96; i++) this.modes.push(new Mode());
    this.washL.set('bp', 2600, 0.5, SR); this.washR.set('bp', 3100, 0.5, SR);
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; };
  }
  private mode(freq: number, decay: number, amp: number, pan: number, chirp = 0) {
    for (let i = 0; i < this.modes.length; i++) if (!this.modes[i].alive) { this.modes[i].start(freq, decay, amp, SR, chirp); this.pans[i] = pan; return; }
  }
  private click(amp: number, pan: number, decayMs: number) {
    for (let i = 0; i < 32; i++) if (this.clickE[i] < 1e-4) { this.clickE[i] = amp; this.clickPan[i] = pan; this.clickDecay[i] = Math.exp(-1 / (decayMs * 0.001 * SR)); return; }
  }
  private drop(w: { puddle: number; metal: number; canvas: number; pavement: number; leaves: number }, total: number) {
    const r = this.rng; const near = Math.pow(r.next(), 2.2); const amp = 0.05 + 0.95 * near; const pan = r.bi();
    let u = r.next() * total;
    if ((u -= w.puddle) < 0) {
      // Minnaert bubble (van den Doel): f ~ 3.26 kHz/r(mm), short rising chirp; only ~1/4 of drops trap a bubble.
      this.click(amp * 0.35, pan, 0.4);
      if (r.next() < 0.28) { const rad = r.range(0.9, 3.2); const f = 3260 / rad; const dec = 1 / (0.043 * f + 0.0014 * Math.pow(f, 1.5)) * 1.4; this.mode(f, dec, amp * 0.5 * Math.pow(rad / 3, 0.6), pan, 0.12 / dec); }
    } else if ((u -= w.metal) < 0) {
      this.click(amp * 0.5, pan, 0.25);
      const f0 = r.range(700, 2600); this.mode(f0, r.range(0.03, 0.09), amp * 0.22, pan); this.mode(f0 * r.range(1.5, 2.8), r.range(0.02, 0.05), amp * 0.14, pan);
    } else if ((u -= w.canvas) < 0) {
      this.mode(r.range(120, 260), r.range(0.012, 0.025), amp * 0.55, pan); this.click(amp * 0.18, pan, 1.5);
    } else if ((u -= w.pavement) < 0) {
      this.click(amp * 0.45, pan, r.range(0.2, 0.7));
    } else {
      this.click(amp * 0.25, pan, r.range(1, 3)); this.mode(r.range(1800, 4200), 0.006, amp * 0.1, pan);
    }
  }
  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const L = outputs[0][0], R = outputs[0][1] ?? outputs[0][0]; if (!L) return this.alive;
    const I = clamp(params.intensity[0], 0, 1);
    const w = { puddle: params.puddle[0], metal: params.metal[0], canvas: params.canvas[0], pavement: params.pavement[0], leaves: params.leaves[0] };
    const total = w.puddle + w.metal + w.canvas + w.pavement + w.leaves + 1e-6;
    const drips = params.drips[0], G = this.alive ? params.gain[0] : 0;
    const rate = I * I * 2600 + I * 200; // drops per second audible
    for (let i = 0; i < L.length; i++) {
      const g = this.sm.step(G);
      this.nextDrop -= 1 / SR;
      while (rate > 1 && this.nextDrop <= 0) { this.drop(w, total); this.nextDrop += this.rng.exp(rate); }
      this.nextDrip -= 1 / SR;
      if (drips > 0 && this.nextDrip <= 0) {
        // Slow fat drips off fire escapes and AC units: big bubbles in puddles, plinks on metal.
        const pan = this.rng.bi(); const f = this.rng.range(500, 1300);
        this.mode(f, 0.06, 0.25 * drips, pan, 2.5); this.click(0.15 * drips, pan, 0.6);
        this.nextDrip = this.rng.exp(drips * 3.5 * (0.3 + I));
      }
      let l = 0, r = 0;
      for (let k = 0; k < this.modes.length; k++) { const m = this.modes[k]; if (!m.alive) continue; const v = m.run(); const p = this.pans[k]; l += v * (1 - p) * 0.5; r += v * (1 + p) * 0.5; }
      let cl = 0, cr = 0;
      for (let k = 0; k < 32; k++) { const e = this.clickE[k]; if (e < 1e-4) continue; const n = this.rng.bi() * e; const p = this.clickPan[k]; cl += n * (1 - p) * 0.5; cr += n * (1 + p) * 0.5; this.clickE[k] = e * this.clickDecay[k]; }
      const pn = this.pink.next();
      const wash = this.washLp.lp(pn) * I * 0.55;
      l += this.clickHp.hp(cl) * 0.8 + this.washL.run(wash + this.rng.bi() * 0.03 * I);
      r += cr * 0.8 + this.washR.run(wash + this.rng.bi() * 0.03 * I);
      L[i] = flush(l) * g * 0.6; R[i] = flush(r) * g * 0.6;
    }
    return this.alive || this.sm.v > 1e-4;
  }
}
registerProcessor('t74-rain', RainProcessor);

// ====================================================================================== talkers
/** One formant talker: glottal source -> three formant resonators, syllables with onsets. */
class Talker {
  f0 = 120; f0Target = 120; base = 120; range = 0.2; ph = 0; env = 0; envTarget = 0;
  fr = [new Biquad(), new Biquad(), new Biquad()]; f = [520, 1190, 2390]; ft = [520, 1190, 2390];
  fric = 0; fricBp = new Biquad(); fricF = 4000; scale = 1; breath = 0.08; pan = 0; tilt = new OnePole(2600, SR);
  prev = 0; updateCounter = 0;
  constructor(public rng: Rng) {}
  voice(child: boolean, female: boolean) {
    const r = this.rng;
    this.base = child ? r.range(240, 360) : female ? r.range(165, 245) : r.range(88, 140);
    this.scale = child ? 1.28 : female ? 1.14 : 1;
    this.f0 = this.f0Target = this.base;
  }
  setVowel(v: number, stress: number) {
    const fm = VOWELS[v % VOWELS.length];
    for (let k = 0; k < 3; k++) this.ft[k] = fm[k] * this.scale * (1 + this.rng.bi() * 0.04);
    this.envTarget = 0.5 + 0.5 * stress;
    this.f0Target = this.base * (1 + this.range * (stress - 0.3));
  }
  sample(): number {
    // Formant retune every 32 samples (cheap and smooth enough).
    if ((this.updateCounter++ & 31) === 0) {
      for (let k = 0; k < 3; k++) { this.f[k] += (this.ft[k] - this.f[k]) * 0.18; this.fr[k].set('bp', this.f[k], k === 0 ? 6 : k === 1 ? 9 : 11, SR); }
      this.f0 += (this.f0Target - this.f0) * 0.1;
    }
    this.env += (this.envTarget - this.env) * 0.0025;
    this.ph += (this.f0 * (1 + this.rng.bi() * 0.006)) / SR;
    let src = 0;
    if (this.ph >= 1) { this.ph -= 1; }
    const oq = 0.6; const x = this.ph;
    const gl = x < oq ? Math.sin((Math.PI * x) / oq) * (x / oq) : 0; // asymmetric open phase, abrupt closure
    src = gl - this.prev; this.prev = gl;
    src = this.tilt.lp(src * 8) + this.rng.bi() * this.breath;
    const v = this.fr[0].run(src) * 1.0 + this.fr[1].run(src) * 0.55 + this.fr[2].run(src) * 0.3;
    let fr = 0;
    if (this.fric > 1e-4) { fr = this.fricBp.run(this.rng.bi()) * this.fric; this.fric *= 0.9985; }
    return v * this.env * 2.2 + fr * 0.35;
  }
  consonant(kind: number) {
    this.fricF = kind === 0 ? 5200 : kind === 1 ? 2600 : 7000;
    this.fricBp.set('bp', this.fricF * (this.scale > 1.2 ? 1.2 : 1), 2, SR); this.fric = kind === 2 ? 0.25 : 0.5;
  }
}

/** Crowd walla: talkers alternate between phrases and pauses; density sets how many are active. */
class WallaProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = ['density', 'excite', 'child', 'gain'].map((name) => ({ name, defaultValue: name === 'gain' ? 1 : 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' as const }));
  private rng: Rng; private talkers: Talker[] = []; private state: Float32Array; private lp = [new OnePole(3500, SR), new OnePole(3500, SR)];
  private sm = new Smooth(0, 300, SR); private alive = true; private max: number; private norm = 2.2;
  constructor(opts: { processorOptions: { seed: number; talkers?: number } }) {
    super(); this.rng = new Rng(opts.processorOptions.seed); this.max = opts.processorOptions.talkers ?? 10;
    // per talker: active(0/1), timeToNextEvent, syllablesLeft
    this.state = new Float32Array(this.max * 3);
    this.norm = 2.2 * Math.sqrt(10 / this.max); // same crowd level whatever the preset's talker count
    for (let i = 0; i < this.max; i++) { const t = new Talker(this.rng); t.voice(false, this.rng.next() < 0.5); t.pan = this.rng.bi() * 0.9; this.talkers.push(t); this.state[i * 3 + 1] = this.rng.range(0, 2); }
    this.port.onmessage = (e) => { if (e.data === 'stop') this.alive = false; };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return this.alive;
    const dens = clamp(params.density[0], 0, 1), ex = clamp(params.excite[0], 0, 1), child = params.child[0] > 0.5, G = this.alive ? params.gain[0] : 0;
    const want = Math.round(dens * this.max);
    const dt = L.length / SR;
    for (let k = 0; k < this.max; k++) {
      const o = k * 3; const t = this.talkers[k];
      this.state[o + 1] -= dt;
      if (this.state[o + 1] > 0) continue;
      if (this.state[o + 2] > 0) {
        // next syllable
        this.state[o + 2]--; const stress = this.rng.next();
        t.setVowel((this.rng.next() * VOWELS.length) | 0, stress * (0.7 + 0.6 * ex));
        if (this.rng.next() < 0.55) t.consonant((this.rng.next() * 3) | 0);
        this.state[o + 1] = this.rng.range(0.11, 0.26) / (1 + ex * 0.3);
        if (this.state[o + 2] <= 0) t.envTarget = 0;
      } else if (k < want && this.rng.next() < 0.7) {
        if (child !== (t.scale > 1.2)) t.voice(child, this.rng.next() < 0.5);
        t.range = 0.15 + 0.35 * ex + (child ? 0.3 : 0);
        this.state[o + 2] = Math.round(this.rng.range(3, 14)); this.state[o + 1] = 0.01;
      } else {
        t.envTarget = 0; this.state[o + 1] = this.rng.range(0.4, 2.5);
      }
    }
    for (let i = 0; i < L.length; i++) {
      const g = this.sm.step(G);
      let l = 0, r = 0;
      for (let k = 0; k < this.max; k++) { const t = this.talkers[k]; if (t.env < 1e-3 && t.envTarget === 0 && t.fric < 1e-4) continue; const v = t.sample(); l += v * (1 - t.pan) * 0.5; r += v * (1 + t.pan) * 0.5; }
      L[i] = this.lp[0].lp(l) * g * this.norm; R[i] = this.lp[1].lp(r) * g * this.norm;
    }
    return this.alive || this.sm.v > 1e-4;
  }
}
registerProcessor('t74-walla', WallaProcessor);

/** Placeholder dialogue voice. Script: [{t, dur, vowel, stress, cons}] in seconds from start. */
interface Syl { t: number; dur: number; vowel: number; stress: number; cons: number }
class VoiceProcessor extends AudioWorkletProcessor {
  private rng: Rng; private talker: Talker; private script: Syl[] = []; private idx = 0; private t = 0; private playing = false; private lp = new OnePole(5000, SR); private hp = new OnePole(90, SR);
  constructor(opts: { processorOptions: { seed: number; f0: number; scale: number; range: number } }) {
    super(); const o = opts.processorOptions; this.rng = new Rng(o.seed); this.talker = new Talker(this.rng);
    this.talker.base = o.f0; this.talker.f0 = o.f0; this.talker.f0Target = o.f0; this.talker.scale = o.scale; this.talker.range = o.range; this.talker.breath = 0.05;
    this.port.onmessage = (e) => {
      const d = e.data as { cmd: string; script?: Syl[] };
      if (d.cmd === 'say' && d.script) { this.script = d.script; this.idx = 0; this.t = 0; this.playing = true; }
      else if (d.cmd === 'stop') { this.playing = false; this.script = []; this.talker.envTarget = 0; }
      else if (d.cmd === 'dispose') { this.disposed = true; }
    };
  }
  private disposed = false;
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0][0]; if (!out) return !this.disposed;
    for (let i = 0; i < out.length; i++) {
      if (this.playing) {
        this.t += 1 / SR;
        while (this.idx < this.script.length && this.t >= this.script[this.idx].t) {
          const s = this.script[this.idx++]; this.talker.setVowel(s.vowel, s.stress); if (s.cons >= 0) this.talker.consonant(s.cons);
          this.endAt = s.t + s.dur;
        }
        if (this.t > this.endAt) this.talker.envTarget = 0;
        if (this.idx >= this.script.length && this.t > this.endAt + 0.3) { this.playing = false; this.port.postMessage('done'); }
      }
      out[i] = this.hp.hp(this.lp.lp(this.talker.sample()));
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return !this.disposed;
  }
  private endAt = 0;
}
registerProcessor('t74-voice', VoiceProcessor);

// ====================================================================================== reverb (FDN)
const FDN_MS = [29.7, 37.1, 41.1, 43.7, 53.0, 59.3, 67.1, 73.3];
class FdnProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    { name: 'rt60', defaultValue: 1.2, minValue: 0.05, maxValue: 8, automationRate: 'k-rate' as const },
    { name: 'damp', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const },
    { name: 'size', defaultValue: 1, minValue: 0.3, maxValue: 2.5, automationRate: 'k-rate' as const },
    { name: 'predelay', defaultValue: 0.02, minValue: 0, maxValue: 0.25, automationRate: 'k-rate' as const },
    { name: 'gain', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' as const },
  ];
  private n: number; private lines: Delay[] = []; private len: Float64Array; private tgtLen: Float64Array; private fb: Float64Array; private lp: OnePole[] = [];
  private y: Float64Array; private pre: Delay; private ap: Allpass[]; private ph = 0; private g = new Smooth(1, 50, SR); private preS = new Smooth(0.02, 100, SR);
  private last = { rt: -1, damp: -1, size: -1 }; private dead = false;
  constructor(opts: { processorOptions: { lines?: number } }) {
    super(); this.n = opts.processorOptions?.lines === 4 ? 4 : 8;
    this.len = new Float64Array(this.n); this.tgtLen = new Float64Array(this.n); this.fb = new Float64Array(this.n); this.y = new Float64Array(this.n);
    for (let i = 0; i < this.n; i++) { this.lines.push(new Delay(Math.ceil(FDN_MS[i] * 2.6 * SR / 1000) + 64)); this.lp.push(new OnePole(8000, SR)); this.len[i] = FDN_MS[i] * SR / 1000; }
    this.pre = new Delay(Math.ceil(0.26 * SR));
    this.port.onmessage = (e) => { if (e.data === 'dispose') this.dead = true; };
    this.ap = [new Allpass(Math.round(0.00477 * SR), 0.62), new Allpass(Math.round(0.00359 * SR), 0.62), new Allpass(Math.round(0.01273 * SR), 0.55), new Allpass(Math.round(0.00931 * SR), 0.55)];
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const inL = inputs[0]?.[0], inR = inputs[0]?.[1] ?? inL; const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return !this.dead;
    const rt = params.rt60[0], damp = params.damp[0], size = params.size[0], n = this.n;
    if (rt !== this.last.rt || damp !== this.last.damp || size !== this.last.size) {
      this.last = { rt, damp, size };
      for (let i = 0; i < n; i++) {
        this.tgtLen[i] = FDN_MS[i] * size * SR / 1000;
        this.fb[i] = Math.pow(10, (-3 * this.tgtLen[i]) / (rt * SR));
        this.lp[i].set(1200 + 15000 * Math.pow(1 - damp, 1.6), SR);
      }
    }
    const G = params.gain[0], P = params.predelay[0];
    const norm = 1 / Math.sqrt(n), house = 2 / n;
    for (let i = 0; i < L.length; i++) {
      const x = inL ? (inL[i] + (inR ? inR[i] : inL[i])) * 0.5 : 0;
      this.pre.push(x);
      let d = this.pre.read(Math.max(1, this.preS.step(P) * SR));
      for (let a = 0; a < 4; a++) d = this.ap[a].run(d);
      // Slow modulation on two lines breaks up metallic ringing.
      this.ph += 1 / SR; const m0 = Math.sin(TAU * 0.31 * this.ph) * 0.0004 * SR, m1 = Math.sin(TAU * 0.43 * this.ph + 1) * 0.0003 * SR;
      let sum = 0;
      for (let k = 0; k < n; k++) {
        this.len[k] += (this.tgtLen[k] - this.len[k]) * 0.00005;
        const mod = k === 0 ? m0 : k === n / 2 ? m1 : 0;
        const v = this.lp[k].lp(this.lines[k].read(this.len[k] + mod)) * this.fb[k];
        this.y[k] = v; sum += v;
      }
      sum *= house;
      let l = 0, r = 0;
      for (let k = 0; k < n; k++) {
        const v = this.y[k];
        this.lines[k].push(flush(v - sum + (k & 1 ? -d : d) * norm));
        l += (k & 1 ? -v : v); r += (k & 2 ? -v : v);
      }
      const g = this.g.step(G);
      L[i] = l * norm * g; R[i] = r * norm * g;
    }
    return !this.dead;
  }
}
registerProcessor('t74-fdn', FdnProcessor);

// ====================================================================================== early reflections
/**
 * Listener-centric street-canyon early reflections. The main thread measures the distance and
 * height of the facades either side (from the chunk footprints) and sends them here; we place
 * first-order wall taps, the cross-street flutter (L-R-L ...) that makes narrow streets "slap",
 * and up to two end-wall taps (a building closing a T or the far side of an intersection).
 */
const TAPS = 10;
class EarlyProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = ['dL', 'dR', 'gL', 'gR', 'dF', 'gF', 'dB', 'gB', 'flutter', 'gain'].map((name) => ({ name, defaultValue: name.startsWith('d') ? 10 : 0, minValue: 0, maxValue: 400, automationRate: 'k-rate' as const }));
  private buf = new Delay(Math.ceil(1.3 * SR)); private abs = new OnePole(5500, SR); private hp = new OnePole(180, SR);
  private d = new Float64Array(TAPS); private tg = new Float64Array(TAPS); private gl = new Float64Array(TAPS); private gr = new Float64Array(TAPS);
  private tgl = new Float64Array(TAPS); private tgr = new Float64Array(TAPS); private dead = false;
  constructor() { super(); this.port.onmessage = (e) => { if (e.data === 'dispose') this.dead = true; }; }
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const inL = inputs[0]?.[0], inR = inputs[0]?.[1] ?? inL; const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return !this.dead;
    const c = 343, s = SR / c;
    const dL = Math.max(1, params.dL[0]), dR = Math.max(1, params.dR[0]), gL = params.gL[0], gR = params.gR[0], fl = params.flutter[0], G = params.gain[0];
    const W = dL + dR;
    const sp = (path: number) => 8 / (8 + path); // spreading relative to a near (self) source
    const set = (k: number, path: number, g: number, pan: number) => { this.tg[k] = Math.min(path * s, 1.25 * SR); this.tgl[k] = g * (1 - pan) * 0.5 * G; this.tgr[k] = g * (1 + pan) * 0.5 * G; };
    set(0, 2 * dL, gL * sp(2 * dL), -0.8);
    set(1, 2 * dR, gR * sp(2 * dR), 0.8);
    const fl2 = gL * gR * fl;
    set(2, 2 * W, fl2 * sp(2 * W) * 1.6, -0.15);
    set(3, 2 * W + 0.7, fl2 * sp(2 * W) * 1.6, 0.15);
    set(4, 2 * W + 2 * dL, fl2 * gL * sp(2 * W + 2 * dL) * 1.8, -0.6);
    set(5, 2 * W + 2 * dR, fl2 * gR * sp(2 * W + 2 * dR) * 1.8, 0.6);
    set(6, 4 * W, fl2 * fl2 * sp(4 * W) * 2.2, 0);
    set(7, 4 * W + 2 * dL, fl2 * fl2 * gL * sp(4 * W) * 2, -0.4);
    set(8, 2 * Math.max(1, params.dF[0]), params.gF[0] * sp(2 * params.dF[0]), 0.1);
    set(9, 2 * Math.max(1, params.dB[0]), params.gB[0] * sp(2 * params.dB[0]), -0.1);
    for (let i = 0; i < L.length; i++) {
      const x = inL ? (inL[i] + (inR ? inR[i] : inL[i])) * 0.5 : 0;
      this.buf.push(this.hp.hp(this.abs.lp(x)));
      let l = 0, r = 0;
      for (let k = 0; k < TAPS; k++) {
        this.d[k] += (this.tg[k] - this.d[k]) * 0.0002;
        this.gl[k] += (this.tgl[k] - this.gl[k]) * 0.001; this.gr[k] += (this.tgr[k] - this.gr[k]) * 0.001;
        if (this.gl[k] + this.gr[k] < 1e-5) continue;
        const v = this.buf.read(Math.max(1, this.d[k])); l += v * this.gl[k]; r += v * this.gr[k];
      }
      L[i] = l; R[i] = r;
    }
    return !this.dead;
  }
}
registerProcessor('t74-early', EarlyProcessor);

// ====================================================================================== ducker
class DuckProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    { name: 'depth', defaultValue: -9, minValue: -40, maxValue: 0, automationRate: 'k-rate' as const },
    { name: 'threshold', defaultValue: -42, minValue: -90, maxValue: 0, automationRate: 'k-rate' as const },
    { name: 'attack', defaultValue: 0.04, minValue: 0.001, maxValue: 1, automationRate: 'k-rate' as const },
    { name: 'release', defaultValue: 0.6, minValue: 0.01, maxValue: 5, automationRate: 'k-rate' as const },
  ];
  private env = 0; private gdb = 0; private reportT = 0; private minG = 0; private dead = false;
  constructor() { super(); this.port.onmessage = (e) => { if (e.data === 'dispose') this.dead = true; }; }
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const pL = inputs[0]?.[0], pR = inputs[0]?.[1] ?? pL, kL = inputs[1]?.[0], kR = inputs[1]?.[1] ?? kL;
    const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return !this.dead;
    const depth = params.depth[0], thr = params.threshold[0];
    const ea = Math.exp(-1 / (0.01 * SR));
    const att = Math.exp(-1 / (params.attack[0] * SR)), rel = Math.exp(-1 / (params.release[0] * SR));
    for (let i = 0; i < L.length; i++) {
      const k = kL ? (kL[i] * kL[i] + (kR ? kR[i] * kR[i] : 0)) * 0.5 : 0;
      this.env = flush(k + ea * (this.env - k));
      const lev = 10 * Math.log10(this.env + 1e-12);
      const amt = clamp((lev - thr) / 10, 0, 1);
      const target = depth * amt;
      const a = target < this.gdb ? att : rel;
      this.gdb = target + a * (this.gdb - target);
      const g = Math.pow(10, this.gdb / 20);
      L[i] = (pL ? pL[i] : 0) * g; R[i] = (pR ? pR[i] : 0) * g;
      if (this.gdb < this.minG) this.minG = this.gdb;
    }
    if ((this.reportT += L.length) > SR / 8) { this.port.postMessage(this.minG); this.reportT = 0; this.minG = 0; }
    return !this.dead;
  }
}
registerProcessor('t74-duck', DuckProcessor);

// ====================================================================================== limiter
const OS = 4, TAPS_PER = 24;
const POLY: Float64Array = (() => {
  // Windowed-sinc 4x interpolator (Kaiser beta 7, 24 taps/phase), polyphase layout [phase][tap].
  const N = OS * TAPS_PER, h = new Float64Array(N), beta = 7;
  const i0 = (x: number) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  const c = (N - 1) / 2;
  for (let n = 0; n < N; n++) { const x = (n - c) / OS; const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); const w = i0(beta * Math.sqrt(1 - ((n - c) / c) ** 2)) / i0(beta); h[n] = sinc * w; }
  const out = new Float64Array(N);
  for (let p = 0; p < OS; p++) { let s = 0; for (let k = 0; k < TAPS_PER; k++) s += h[p + k * OS]; for (let k = 0; k < TAPS_PER; k++) out[p * TAPS_PER + k] = h[p + k * OS] / s; }
  return out;
})();
class LimiterProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = [
    { name: 'ceiling', defaultValue: -1.5, minValue: -24, maxValue: 0, automationRate: 'k-rate' as const },
    { name: 'release', defaultValue: 0.25, minValue: 0.01, maxValue: 3, automationRate: 'k-rate' as const },
  ];
  private la: number; private hist: Float64Array[] = [new Float64Array(TAPS_PER * 2), new Float64Array(TAPS_PER * 2)]; private hi = 0;
  private audio: Float32Array[]; private aw = 0; private alen: number;
  private req: Float64Array; private dq: Int32Array; private dqH = 0; private dqT = 0; private n = 0;
  private avg: Float64Array; private avgSum = 0; private avgW = 0; private gRel = 1;
  private reportN = 0; private minG = 1; private nans = 0; private clips = 0; private peakIn = 0; private gr1 = 0; private gr3 = 0; private total = 0; private minEver = 1;
  constructor() {
    super();
    this.la = Math.round(0.0015 * SR);
    this.alen = this.la * 2 + TAPS_PER + 8;
    this.audio = [new Float32Array(this.alen), new Float32Array(this.alen)];
    this.req = new Float64Array(this.la + 1); this.dq = new Int32Array(this.la + 2); this.avg = new Float64Array(this.la);
    this.avg.fill(1); this.avgSum = this.la;
    this.req.fill(1);
    this.port.onmessage = (e) => { if (e.data === 'dispose') this.dead = true; };
  }
  private dead = false;
  process(inputs: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const iL = inputs[0]?.[0], iR = inputs[0]?.[1] ?? iL; const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return !this.dead;
    const ceil = Math.pow(10, params.ceiling[0] / 20); const rel = Math.exp(-1 / (params.release[0] * SR));
    const la = this.la, delay = la + TAPS_PER / 2;
    for (let i = 0; i < L.length; i++) {
      let xl = iL ? iL[i] : 0, xr = iR ? iR[i] : 0;
      if (!(xl === xl) || !isFinite(xl)) { xl = 0; this.nans++; }
      if (!(xr === xr) || !isFinite(xr)) { xr = 0; this.nans++; }
      // True-peak estimate of the newest sample neighbourhood.
      const hi = this.hi; this.hist[0][hi] = xl; this.hist[0][hi + TAPS_PER] = xl; this.hist[1][hi] = xr; this.hist[1][hi + TAPS_PER] = xr;
      this.hi = (hi + 1) % TAPS_PER; const base = hi + TAPS_PER;
      let pk = 0;
      for (let ch = 0; ch < 2; ch++) {
        const h = this.hist[ch];
        for (let p = 0; p < OS; p++) {
          let s = 0; const o = p * TAPS_PER;
          for (let k = 0; k < TAPS_PER; k++) s += POLY[o + k] * h[base - k];
          const a = s < 0 ? -s : s; if (a > pk) pk = a;
        }
      }
      // No phase of an even-length interpolator lands exactly on the input samples: add the aligned sample itself.
      const al = this.hist[0][base - TAPS_PER / 2], ar = this.hist[1][base - TAPS_PER / 2];
      if (Math.abs(al) > pk) pk = Math.abs(al); if (Math.abs(ar) > pk) pk = Math.abs(ar);
      if (pk > this.peakIn) this.peakIn = pk;
      const r = pk > ceil ? ceil / pk : 1;
      // Sliding-window minimum (monotonic deque) over the last la+1 requirements.
      const idx = this.n;
      while (this.dqT > this.dqH && this.req[this.dq[(this.dqT - 1) % this.dq.length] % this.req.length] >= r) this.dqT--;
      this.req[idx % this.req.length] = r; this.dq[this.dqT % this.dq.length] = idx; this.dqT++;
      while (this.dq[this.dqH % this.dq.length] <= idx - (la + 1)) this.dqH++;
      const m = this.req[this.dq[this.dqH % this.dq.length] % this.req.length];
      // Moving average of the held minimum -> smooth attack that is never late.
      this.avgSum += m - this.avg[this.avgW]; this.avg[this.avgW] = m; this.avgW = (this.avgW + 1) % la;
      if (this.avgW === 0) { let s = 0; for (let k = 0; k < la; k++) s += this.avg[k]; this.avgSum = s; }
      const a = this.avgSum / la;
      this.gRel = a < this.gRel ? a : a + rel * (this.gRel - a);
      const g = Math.min(this.gRel, a);
      // Delay the audio so the gain lines up with the peak it was computed for.
      this.audio[0][this.aw] = xl; this.audio[1][this.aw] = xr;
      const rd = (this.aw - delay + this.alen) % this.alen; this.aw = (this.aw + 1) % this.alen;
      let ol = this.audio[0][rd] * g, or = this.audio[1][rd] * g;
      const cc = ceil * 1.0001;
      if (ol > cc || ol < -cc || or > cc || or < -cc) { this.clips++; ol = clamp(ol, -ceil, ceil); or = clamp(or, -ceil, ceil); }
      L[i] = ol; R[i] = or;
      if (g < this.minG) this.minG = g;
      if (g < 0.891) { this.gr1++; if (g < 0.708) this.gr3++; } if (g < this.minEver) this.minEver = g; this.total++;
      this.n++;
    }
    if ((this.reportN += L.length) >= SR / 4) {
      this.port.postMessage({ gr: 20 * Math.log10(this.minG), nans: this.nans, clips: this.clips, peakIn: this.peakIn, over1dB: this.gr1 / this.total, over3dB: this.gr3 / this.total, maxGrDb: 20 * Math.log10(this.minEver) });
      this.reportN = 0; this.minG = 1; this.peakIn = 0;
    }
    return !this.dead;
  }
}
registerProcessor('t74-limiter', LimiterProcessor);

// ====================================================================================== tuning static
class StaticProcessor extends AudioWorkletProcessor {
  static parameterDescriptors = ['amount', 'sweep', 'am'].map((name) => ({ name, defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' as const }));
  private rng = new Rng(4242); private pink = new Pink(this.rng); private brown = new Brown(this.rng); private lp = new OnePole(3200, SR); private hp = new OnePole(300, SR);
  private wph = 0; private wf = 900; private crack = 0; private t = 0; private sm = new Smooth(0, 15, SR); private dead = false;
  constructor() { super(); this.port.onmessage = (e) => { if (e.data === 'dispose' || e.data === 'stop') this.dead = true; }; }
  process(_in: Float32Array[][], outputs: Float32Array[][], params: Record<string, Float32Array>) {
    const out = outputs[0][0]; if (!out) return !this.dead;
    const A = params.amount[0], S = params.sweep[0], am = params.am[0] > 0.5;
    for (let i = 0; i < out.length; i++) {
      const a = this.sm.step(A); this.t += 1 / SR;
      if (a < 1e-4) { out[i] = 0; continue; }
      let v: number;
      if (am) {
        if (this.rng.next() < 0.004) this.crack = this.rng.bi() * 0.9;
        this.crack *= 0.985;
        this.wf += (400 + 2600 * Math.abs(Math.sin(this.t * (1.3 + 6 * S))) - this.wf) * 0.001;
        this.wph += this.wf / SR; if (this.wph > 1) this.wph -= 1;
        v = this.lp.lp(this.pink.next() * 0.5 + this.brown.next() * 0.2 + this.crack) + Math.sin(TAU * this.wph) * 0.12 * (0.3 + S);
      } else {
        const flutter = 0.6 + 0.4 * Math.sin(this.t * TAU * (7 + 20 * S));
        v = this.hp.hp(this.rng.bi()) * 0.4 * flutter;
      }
      out[i] = v * a;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return !this.dead;
  }
}
registerProcessor('t74-static', StaticProcessor);

// ====================================================================================== PLACEHOLDER music
/**
 * PLACEHOLDER radio music. Not content: a deliberately plain generative bed (chords, bass, kit)
 * so the station framework, tuning, ducking and speaker filters can be built and measured
 * before the user picks a music source. Deterministic in (seed, time) so a station can be
 * joined mid-song at the right place.
 */
const SCALES: Record<string, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };
class MusicProcessor extends AudioWorkletProcessor {
  private on = false; private t = 0; private bpm = 100; private root = 45; private scale = SCALES.minor; private prog = [0, 3, 4, 0]; private style = 0; private seed = 1;
  private rng = new Rng(1); private padLp = [new OnePole(1400, SR), new OnePole(1400, SR)]; private bassLp = new OnePole(500, SR); private hatHp = new OnePole(6000, SR);
  private ph = new Float64Array(8); private kickPh = 0; private kickE = 0; private snE = 0; private hatE = 0; private lastStep = -1; private gain = new Smooth(0, 60, SR); private g = 0;
  private bpBass = 0; private bassE = 0; private bassNote = 45; private dead = false;
  constructor() {
    super();
    this.port.onmessage = (e) => {
      const d = e.data as { cmd: string; seed: number; bpm: number; style: number; offset: number; gain: number };
      if (d.cmd === 'track') {
        this.seed = d.seed; this.bpm = d.bpm; this.style = d.style; this.t = d.offset; this.on = true; this.g = d.gain ?? 1; this.lastStep = -1;
        const r = new Rng(d.seed); this.root = 40 + ((r.next() * 12) | 0); this.scale = r.pick([SCALES.minor, SCALES.major, SCALES.dorian]);
        this.prog = [0, r.pick([3, 5, 2]), r.pick([4, 3, 6]), r.pick([0, 4, 5])];
      } else if (d.cmd === 'stop') { this.g = 0; } else if (d.cmd === 'dispose') { this.dead = true; }
    };
  }
  private midi(n: number) { return 440 * Math.pow(2, (n - 69) / 12); }
  private deg(d: number, oct = 0) { const s = this.scale; const o = Math.floor(d / s.length); return this.root + 12 * (oct + o) + s[((d % s.length) + s.length) % s.length]; }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const L = outputs[0][0], R = outputs[0][1] ?? L; if (!L) return !this.dead;
    const spb = 60 / this.bpm, stepDur = spb / 4;
    for (let i = 0; i < L.length; i++) {
      const g = this.gain.step(this.on ? this.g : 0);
      if (g < 1e-4 && !this.on) { L[i] = 0; R[i] = 0; continue; }
      this.t += 1 / SR;
      const step = Math.floor(this.t / stepDur), bar = Math.floor(step / 16), s16 = step % 16;
      const chord = this.prog[bar % 4];
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.rng = new Rng((this.seed * 7919 + step * 104729) >>> 0);
        const st = this.style;
        if (st !== 2 ? s16 % 8 === 0 || (s16 === 10 && this.rng.next() < 0.5) : s16 % 4 === 0) { this.kickE = 1; this.kickPh = 0; }
        if (s16 % 8 === 4) this.snE = st === 2 ? 0.35 : 0.8;
        if (s16 % 2 === 0 || (st === 0 && this.rng.next() < 0.3)) this.hatE = 0.3 + 0.2 * this.rng.next();
        if (s16 % 4 === 0 || (st === 0 && s16 % 4 === 3 && this.rng.next() < 0.6)) { this.bassNote = this.deg(chord + (this.rng.next() < 0.25 ? 4 : 0), 0); this.bassE = 1; }
      }
      // pad: triad of the chord, two detuned saws per voice
      let pl = 0, pr = 0;
      for (let v = 0; v < 3; v++) {
        const f = this.midi(this.deg(chord + v * 2, 1));
        for (let dd = 0; dd < 2; dd++) { const k = v * 2 + dd; this.ph[k] += f * (dd ? 1.003 : 0.997) / SR; if (this.ph[k] > 1) this.ph[k] -= 1; const s = 2 * this.ph[k] - 1; if (dd) pr += s; else pl += s; }
      }
      const padAmp = 0.06 * (0.8 + 0.2 * Math.sin(TAU * this.t / (spb * 2)));
      pl = this.padLp[0].lp(pl) * padAmp; pr = this.padLp[1].lp(pr) * padAmp;
      this.bpBass += this.midi(this.bassNote) / SR; if (this.bpBass > 1) this.bpBass -= 1;
      this.bassE *= 0.99993;
      const bass = this.bassLp.lp(Math.tanh(Math.sin(TAU * this.bpBass) * 2.2)) * 0.22 * this.bassE;
      this.kickPh += (50 + 110 * this.kickE * this.kickE) / SR; this.kickE *= 0.9993;
      const kick = Math.sin(TAU * this.kickPh) * this.kickE * 0.35;
      this.snE *= 0.9985; const sn = (this.rng.bi() * 0.7 + Math.sin(TAU * 190 * this.t) * 0.3) * this.snE * 0.16;
      this.hatE *= 0.997; const hat = this.hatHp.hp(this.rng.bi()) * this.hatE * 0.07;
      const m = bass + kick + sn;
      L[i] = (pl + m + hat * 0.8) * g; R[i] = (pr + m + hat) * g;
    }
    return !this.dead;
  }
}
registerProcessor('t74-music', MusicProcessor);
