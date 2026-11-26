/**
 * Procedural period-style instrumentals (user decision 2026-11-26: free methods). Each "song" is
 * generated deterministically from a seed: key, progression, form (intro / A A B A / outro), tempo
 * feel, and a motif that is reused and varied so a song has an identity you can recognise. All
 * instruments are synthesised here (no samples):
 *
 *   drums   kick, snare, hats, ride, brushes, rim/clave, congas, cowbell, shaker
 *   bass    electric (fingered) or upright, with pluck envelopes
 *   keys    FM electric piano (Rhodes-like), piano montuno, vibraphone
 *   guitar  Karplus-Strong chops through an auto-wah
 *   strings detuned-saw ensemble with slow swells
 *   brass   saw stabs with an opening filter
 *   lead    breathy saw/sine lead (sax/flute-ish) with vibrato
 *
 * Styles: 0 Philly soul / early disco, 1 easy listening (strings), 2 jazz combo, 3 salsa.
 * Bus: gentle tape saturation, wow/flutter, stereo placement. The radio speaker chain does the rest.
 * Seeking: everything is a function of (seed, step), so a station joined mid-song starts in place.
 */
import { Rng, TAU, flush } from './dsp';

const SR = sampleRate;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const RIDE = [3150, 4370, 5230, 6890];
/** Per-style output trims measured with tools/audio/loudness.ts so every style lands near -19 LUFS. */
const STYLE_GAIN = [-3.4, 2.3, 0, 3.8].map((db) => Math.pow(10, db / 20));

type Kind = 'kick' | 'snare' | 'hat' | 'ohat' | 'ride' | 'brush' | 'rim' | 'conga' | 'congaHi' | 'bell' | 'shaker' | 'bass' | 'upright' | 'ep' | 'piano' | 'vibe' | 'pluck' | 'pad' | 'brass' | 'lead';

/** One synth voice slot (preallocated; the pool never allocates while playing). */
class V {
  on = false; kind: Kind = 'kick'; t = 0; dur = 0; f = 440; amp = 0; pan = 0;
  ph = new Float64Array(4); mph = 0; env = 0; y1 = 0; y2 = 0; aux = 0;
  ks = new Float32Array(4096); ksLen = 0; ksIdx = 0; ksPrev = 0;
}

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10] };
type Chord = { deg: number; q: 'maj7' | 'm7' | '7' | 'm9' | 'maj' | 'm' | '6' };
const PROGS: Record<number, Chord[][]> = {
  0: [[{ deg: 1, q: 'm7' }, { deg: 4, q: '7' }, { deg: 0, q: 'maj7' }, { deg: 5, q: 'm7' }], [{ deg: 0, q: 'm9' }, { deg: 3, q: 'm7' }, { deg: 0, q: 'm9' }, { deg: 3, q: 'm7' }], [{ deg: 0, q: 'maj7' }, { deg: 3, q: 'maj7' }, { deg: 2, q: 'm7' }, { deg: 5, q: 'm7' }]],
  1: [[{ deg: 0, q: 'maj7' }, { deg: 5, q: 'm7' }, { deg: 1, q: 'm7' }, { deg: 4, q: '7' }], [{ deg: 0, q: '6' }, { deg: 3, q: 'maj7' }, { deg: 2, q: 'm7' }, { deg: 4, q: '7' }]],
  2: [[{ deg: 1, q: 'm7' }, { deg: 4, q: '7' }, { deg: 0, q: 'maj7' }, { deg: 0, q: 'maj7' }], [{ deg: 0, q: 'maj7' }, { deg: 5, q: '7' }, { deg: 1, q: 'm7' }, { deg: 4, q: '7' }]],
  3: [[{ deg: 0, q: 'm' }, { deg: 3, q: 'm' }, { deg: 4, q: '7' }, { deg: 3, q: 'm' }], [{ deg: 0, q: 'maj' }, { deg: 3, q: 'maj' }, { deg: 4, q: '7' }, { deg: 3, q: 'maj' }]],
};
const QUAL: Record<Chord['q'], number[]> = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], m9: [0, 3, 7, 10, 14], maj: [0, 4, 7, 12], m: [0, 3, 7, 12], '6': [0, 4, 7, 9] };

interface Section { name: 'intro' | 'A' | 'B' | 'outro'; bars: number }

export class MusicEngine {
  private pool: V[] = Array.from({ length: 40 }, () => new V());
  private rng = new Rng(1);
  // song
  seed = 1; style = 0; bpm = 100; root = 45; mode: number[] = SCALES.minor; swing = 0.5;
  private progA: Chord[] = []; private progB: Chord[] = []; private form: Section[] = []; private formBars = 0;
  private motif: { step: number; deg: number; len: number }[] = []; private motifB: { step: number; deg: number; len: number }[] = [];
  private voicing: number[] = [60, 64, 67, 71];
  // transport
  t = 0; private lastStep = -1; on = false; gain = 0; private g = 0;
  // bus
  private wow = 0; private lpL = 0; private lpR = 0; private hpL = 0; private hpR = 0; private hpxL = 0; private hpxR = 0;

  start(seed: number, bpm: number, style: number, offset: number, gain = 1, durationSec = 210) {
    this.seed = seed; this.style = style; this.bpm = bpm; this.t = offset; this.on = true; this.gain = gain; this.lastStep = -1;
    const r = new Rng(seed * 2654435761);
    this.root = 40 + ((r.next() * 9) | 0);
    this.mode = style === 3 ? (r.next() < 0.6 ? SCALES.minor : SCALES.major) : style === 0 ? (r.next() < 0.5 ? SCALES.dorian : SCALES.major) : SCALES.major;
    const progs = PROGS[style] ?? PROGS[0];
    this.progA = progs[(r.next() * progs.length) | 0];
    this.progB = progs[(r.next() * progs.length) | 0];
    if (style === 3 && this.mode === SCALES.minor) { this.progA = PROGS[3][0]; this.progB = PROGS[3][0]; }
    if (style === 3 && this.mode === SCALES.major) { this.progA = PROGS[3][1]; this.progB = PROGS[3][1]; }
    this.swing = style === 2 ? 0.64 : style === 0 ? 0.53 : 0.5;
    // Form sized to the track length.
    const barS = (60 / bpm) * 4; const total = Math.max(8, Math.round(durationSec / barS));
    this.form = [{ name: 'intro', bars: 4 }]; let used = 4;
    const cyc: Section['name'][] = ['A', 'A', 'B', 'A'];
    for (let k = 0; used < total - 8; k++) { const b = 8; this.form.push({ name: cyc[k % 4], bars: b }); used += b; }
    this.form.push({ name: 'outro', bars: Math.max(4, total - used) });
    this.formBars = this.form.reduce((s, x) => s + x.bars, 0);
    // Motif: a 2-bar rhythmic/melodic cell in scale degrees.
    const cell = (density: number) => { const m: { step: number; deg: number; len: number }[] = []; let deg = (r.next() * 5) | 0; for (let s = 0; s < 32; s += r.next() < 0.5 ? 2 : style === 1 ? 4 : 1) { if (r.next() < density) { deg += r.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]); deg = Math.max(-2, Math.min(9, deg)); m.push({ step: s, deg, len: r.pick([1, 2, 2, 3, 4]) }); } } return m; };
    this.motif = cell(style === 1 ? 0.5 : 0.38); this.motifB = cell(style === 1 ? 0.45 : 0.3);
  }
  stop() { this.gain = 0; }

  private section(bar: number): { s: Section; barIn: number } {
    let b = ((bar % this.formBars) + this.formBars) % this.formBars;
    for (const s of this.form) { if (b < s.bars) return { s, barIn: b }; b -= s.bars; }
    return { s: this.form[0], barIn: 0 };
  }
  private chordAt(bar: number): Chord { const { s } = this.section(bar); const p = s.name === 'B' ? this.progB : this.progA; return p[bar % p.length]; }
  private degNote(deg: number, oct: number) { const sc = this.mode; const o = Math.floor(deg / sc.length); return this.root + 12 * (oct + o) + sc[((deg % sc.length) + sc.length) % sc.length]; }

  private voice(kind: Kind, f: number, amp: number, dur: number, pan = 0): V | null {
    let v = this.pool.find((x) => !x.on);
    if (!v) { v = this.pool.reduce((a, b) => (a.t > b.t ? a : b)); }
    v.on = true; v.kind = kind; v.t = 0; v.dur = dur; v.f = f; v.amp = amp; v.pan = pan; v.ph.fill(0); v.mph = 0; v.env = 0; v.y1 = v.y2 = 0; v.aux = 0;
    if (kind === 'pluck') { v.ksLen = Math.max(2, Math.min(4095, Math.round(SR / f))); for (let i = 0; i < v.ksLen; i++) v.ks[i] = this.rng.bi(); v.ksIdx = 0; v.ksPrev = 0; }
    return v;
  }

  /** Voice leading: pick the inversion of the chord closest to the previous voicing. */
  private lead(c: Chord): number[] {
    const pcs = QUAL[c.q].slice(0, 4).map((i) => (this.degNote(c.deg, 0) + i) % 12);
    const prev = this.voicing; const out: number[] = [];
    for (const pc of pcs) { let best = 60, bd = 99; for (let n = 52; n <= 76; n++) if (n % 12 === pc) { const d = Math.min(...prev.map((p) => Math.abs(p - n))); if (d < bd) { bd = d; best = n; } } out.push(best); }
    out.sort((a, b) => a - b); this.voicing = out; return out;
  }

  private onStep(step: number) {
    const st = this.style, bar = Math.floor(step / 16), s16 = step % 16;
    const { s, barIn } = this.section(bar);
    if (s.name === 'outro' && barIn >= s.bars - 1 && s16 === 15) return;
    this.rng = new Rng((this.seed * 7919 + step * 104729) >>> 0);
    const r = this.rng; const c = this.chordAt(bar); const nextC = this.chordAt(bar + 1);
    const intro = s.name === 'intro', B = s.name === 'B', fill = barIn === s.bars - 1 && s16 >= 12;
    const bassRoot = 28 + (((this.degNote(c.deg, 0) - 28) % 12) + 12) % 12; // E1..D#2
    if (s16 === 0) { // new chord: pads, strings
      const vo = this.lead(c);
      if (st === 1 || (st === 0 && !intro) || (st === 3 && B)) for (const n of vo) this.voice('pad', mtof(n), st === 1 ? 0.07 : 0.045, (60 / this.bpm) * 4 * 1.05, (n % 3) - 1);
    }
    const beat = s16 % 4 === 0;
    if (st === 0) { // Philly soul / early disco
      const disco = this.seed % 2 === 0;
      if (!intro || barIn >= 2) {
        if (disco ? beat : s16 === 0 || s16 === 10 || (s16 === 7 && r.next() < 0.4)) this.voice('kick', 55, 1, 0.3);
        if (s16 === 4 || s16 === 12) this.voice('snare', 190, 0.55, 0.2, 0.1);
        if (fill && s16 % 2 === 1) this.voice('snare', 220, 0.3, 0.12, -0.2);
        if (disco && s16 % 4 === 2) this.voice('ohat', 0, 0.22, 0.18, 0.3); else if (s16 % 2 === 0) this.voice('hat', 0, 0.13, 0.05, 0.3);
        // octave bass
        const pat = [0, 12, 0, 12, 0, 0, 12, 0, 0, 12, 0, 12, 0, 0, 12, 7];
        if (disco ? s16 % 2 === 0 : [0, 3, 6, 8, 10, 14].includes(s16)) this.voice('bass', mtof(bassRoot + (disco ? pat[s16] : s16 === 14 ? 7 : 0)), 0.55, 0.22);
        // wah guitar chops on the 16ths, accented offbeats
        if ((s16 % 2 === 1 || s16 % 4 === 2) && r.next() < 0.8) { const vo = this.voicing; this.voice('pluck', mtof(vo[(s16 >> 1) % vo.length] + 12), s16 % 4 === 2 ? 0.28 : 0.14, 0.12, -0.5); }
        if (s16 === 6 || s16 === 14) for (const n of this.voicing) this.voice('ep', mtof(n), 0.07, 0.35, 0.4);
      } else if (s16 % 4 === 0) for (const n of this.voicing) this.voice('ep', mtof(n), 0.08, 0.9, 0.4);
      if (B && s16 === 14 && barIn % 2 === 1) for (const n of this.voicing) this.voice('brass', mtof(n + 12), 0.06, 0.25, 0.2);
    } else if (st === 1) { // easy listening
      if (!intro) {
        if (beat) this.voice('brush', 0, s16 === 4 || s16 === 12 ? 0.22 : 0.12, 0.25, 0.2);
        if (s16 === 0 || s16 === 8) this.voice('upright', mtof(bassRoot + (s16 === 8 ? 7 : 0)), 0.5, 0.7);
      }
      if (intro && s16 % 2 === 0) { const vo = this.voicing; this.voice('pluck', mtof(vo[(s16 >> 1) % vo.length] + 12), 0.12, 0.6, ((s16 >> 1) % 3) - 1); } // harp-ish arpeggio
    } else if (st === 2) { // jazz combo, swung
      if (s16 === 0 || s16 === 4 || s16 === 6 || s16 === 8 || s16 === 12 || s16 === 14) this.voice('ride', 0, s16 % 4 === 0 ? 0.16 : 0.1, 0.5, 0.35);
      if (s16 === 4 || s16 === 12) this.voice('hat', 0, 0.08, 0.04, 0.35);
      if (beat) { // walking bass
        const tones = QUAL[c.q]; const target = this.degNote(nextC.deg, 0);
        const n = s16 === 12 ? target - 1 - 12 * Math.round((target - 1 - bassRoot) / 12) : bassRoot + tones[(s16 / 4) % tones.length] % 12;
        this.voice('upright', mtof(Math.max(28, Math.min(48, n))), 0.6, 0.4);
      }
      if ((s16 === 6 || s16 === 11 || (s16 === 2 && r.next() < 0.3)) && r.next() < 0.6) for (const n of this.voicing) this.voice('ep', mtof(n), 0.06, 0.3, -0.3);
    } else { // salsa: son clave 2-3, tumbao, montuno, congas, campana
      const twoSide = bar % 2 === 0;
      if (twoSide ? s16 === 4 || s16 === 8 : s16 === 0 || s16 === 6 || s16 === 12) this.voice('rim', 2500, 0.25, 0.06, 0.4);
      if (!intro || barIn >= 2) {
        if (beat) this.voice('bell', 0, s16 === 0 ? 0.2 : 0.13, 0.15, -0.3);
        if (s16 === 6 || s16 === 12) { const nr = this.degNote(nextC.deg, 0); this.voice('bass', mtof(Math.max(30, Math.min(46, nr - 24 + (s16 === 12 ? 7 : 0)))), 0.6, 0.35); }
        if (s16 === 14 || s16 === 15) this.voice('conga', 0, 0.3, 0.15, 0.5); else if (s16 === 6 || s16 === 7) this.voice('congaHi', 0, 0.25, 0.12, 0.6); else if (s16 % 2 === 0) this.voice('conga', 0, 0.08, 0.06, 0.5);
        this.voice('shaker', 0, s16 % 4 === 2 ? 0.06 : 0.035, 0.05, -0.5);
      }
      // piano montuno: syncopated octave pattern
      const mont = [0, 3, 6, 8, 10, 13];
      if (mont.includes(s16)) { const vo = this.voicing; const n = vo[mont.indexOf(s16) % vo.length]; this.voice('piano', mtof(n), 0.16, 0.2, -0.1); this.voice('piano', mtof(n + 12), 0.1, 0.2, -0.1); }
      if (B && (s16 === 14 || s16 === 2) && r.next() < 0.7) for (const n of this.voicing) this.voice('brass', mtof(n + 12), 0.07, 0.18, 0.25);
    }
    // Melody from the motif (not in intro), varied in B and with octave lifts on repeats.
    if (!intro && s.name !== 'outro') {
      const cell = B ? this.motifB : this.motif; const pos = (barIn % 2) * 16 + s16;
      for (const m of cell) if (m.step === pos) {
        const lift = barIn >= 4 && !B ? 1 : 0;
        const n = this.degNote(m.deg + lift, 1) + 12; const dur = (60 / this.bpm / 4) * m.len * 1.1;
        this.voice(st === 1 ? 'vibe' : 'lead', mtof(n), st === 1 ? 0.12 : 0.09, dur, 0.15);
      }
    }
    if (fill && st !== 2 && s16 === 15) this.voice('ohat', 0, 0.15, 0.3, 0.3);
  }

  /** Render one block of stereo samples. */
  render(L: Float32Array, R: Float32Array) {
    const stepDur = 60 / this.bpm / 4;
    for (let i = 0; i < L.length; i++) {
      this.g += ((this.on ? this.gain : 0) - this.g) * 0.0005;
      if (this.g < 1e-5 && !this.on) { L[i] = 0; R[i] = 0; continue; }
      this.t += 1 / SR;
      // Swing: delay odd 16ths.
      const raw = this.t / stepDur; const pair = Math.floor(raw / 2), within = raw - pair * 2;
      const sw = this.swing * 2; const step = pair * 2 + (within < sw ? 0 : 1);
      if (step !== this.lastStep) { this.lastStep = step; if (this.on) this.onStep(step); }
      this.wow += 1 / SR; const wf = 1 + 0.0012 * Math.sin(TAU * 0.6 * this.wow) + 0.0004 * Math.sin(TAU * 7.3 * this.wow); // tape wow/flutter
      let l = 0, r = 0;
      for (let k = 0; k < this.pool.length; k++) {
        const v = this.pool[k]; if (!v.on) continue;
        const x = this.synth(v, wf);
        const p = v.pan; l += x * (1 - p) * 0.5; r += x * (1 + p) * 0.5;
        v.t += 1 / SR;
      }
      // Bus: tape-ish saturation, gentle tilt, DC block.
      l = Math.tanh(l * 1.3) * 0.8; r = Math.tanh(r * 1.3) * 0.8;
      this.lpL += (l - this.lpL) * 0.55; this.lpR += (r - this.lpR) * 0.55;
      this.hpL = 0.995 * (this.hpL + this.lpL - this.hpxL); this.hpxL = this.lpL; this.hpR = 0.995 * (this.hpR + this.lpR - this.hpxR); this.hpxR = this.lpR;
      const sg = STYLE_GAIN[this.style] ?? 1;
      L[i] = flush(this.hpL) * this.g * sg; R[i] = flush(this.hpR) * this.g * sg;
    }
  }

  private synth(v: V, wf: number): number {
    const t = v.t, r = this.rng;
    const end = (rel: number) => { if (t > v.dur + rel) { v.on = false; return 0; } return t < v.dur ? 1 : 1 - (t - v.dur) / rel; };
    switch (v.kind) {
      case 'kick': { if (t > 0.35) { v.on = false; return 0; } const f = 48 + 110 * Math.exp(-t * 28); v.ph[0] += f / SR; return Math.sin(TAU * v.ph[0]) * Math.exp(-t * 9) * v.amp + (t < 0.003 ? r.bi() * 0.3 * v.amp : 0); }
      case 'snare': { if (t > 0.3) { v.on = false; return 0; } v.ph[0] += v.f / SR; const n = r.bi(); v.y1 += (n - v.y1) * 0.6; return (Math.sin(TAU * v.ph[0]) * Math.exp(-t * 30) * 0.5 + (n - v.y1) * Math.exp(-t * 16)) * v.amp; }
      case 'hat': case 'ohat': { const d = v.kind === 'hat' ? 60 : 12; if (t > 0.5) { v.on = false; return 0; } const n = r.bi(); const hp = n - v.y1; v.y1 = n; const hp2 = hp - v.y2; v.y2 = hp; return hp2 * Math.exp(-t * d) * v.amp * 0.5; }
      case 'ride': {
        if (t > 1.2) { v.on = false; return 0; }
        let x = 0; for (let k = 0; k < 4; k++) { v.ph[k] += RIDE[k] / SR; x += Math.sign(Math.sin(TAU * v.ph[k])); }
        const n = r.bi(); const hp = n - v.y1; v.y1 = n;
        return (x * 0.08 + hp * 0.5) * Math.exp(-t * 4) * v.amp;
      }
      case 'brush': { if (t > 0.4) { v.on = false; return 0; } const n = r.bi(); v.y1 += (n - v.y1) * 0.25; return v.y1 * Math.sin(Math.PI * Math.min(1, t / 0.25)) * v.amp; }
      case 'rim': { if (t > 0.08) { v.on = false; return 0; } v.ph[0] += v.f / SR; return Math.sin(TAU * v.ph[0]) * Math.exp(-t * 70) * v.amp; }
      case 'conga': case 'congaHi': { if (t > 0.4) { v.on = false; return 0; } const f = (v.kind === 'conga' ? 190 : 260) * (1 + 0.2 * Math.exp(-t * 40)); v.ph[0] += f / SR; return (Math.sin(TAU * v.ph[0]) * Math.exp(-t * 14) + (t < 0.004 ? r.bi() * 0.4 : 0)) * v.amp; }
      case 'bell': { if (t > 0.3) { v.on = false; return 0; } v.ph[0] += 545 / SR; v.ph[1] += 812 / SR; return (Math.sign(Math.sin(TAU * v.ph[0])) + Math.sign(Math.sin(TAU * v.ph[1]))) * 0.3 * Math.exp(-t * 18) * v.amp; }
      case 'shaker': { if (t > 0.08) { v.on = false; return 0; } const n = r.bi(); const hp = n - v.y1; v.y1 = n; return hp * Math.sin(Math.PI * t / 0.08) * v.amp; }
      case 'bass': case 'upright': {
        const e = end(0.06); if (!v.on) return 0; v.ph[0] += v.f * wf / SR;
        const s = Math.sin(TAU * v.ph[0]), saw = 2 * (v.ph[0] % 1) - 1;
        const raw = v.kind === 'bass' ? s * 0.8 + saw * 0.35 * Math.exp(-t * 12) : s + 0.25 * Math.sin(2 * TAU * v.ph[0]) * Math.exp(-t * 6);
        v.y1 += (raw - v.y1) * (v.kind === 'bass' ? 0.25 : 0.15);
        return v.y1 * Math.exp(-t * (v.kind === 'bass' ? 2.5 : 3.5)) * Math.min(1, t * 400) * e * v.amp;
      }
      case 'ep': case 'piano': case 'vibe': {
        const e = end(v.kind === 'vibe' ? 0.6 : 0.25); if (!v.on) return 0;
        v.ph[0] += v.f * wf / SR; v.mph += v.f * (v.kind === 'vibe' ? 4 : 1) * wf / SR;
        const idx = (v.kind === 'piano' ? 2.2 : v.kind === 'vibe' ? 0.6 : 1.4) * Math.exp(-t * (v.kind === 'piano' ? 6 : 4));
        const trem = v.kind === 'vibe' ? 1 + 0.25 * Math.sin(TAU * 5.5 * t) : 1;
        return Math.sin(TAU * v.ph[0] + idx * Math.sin(TAU * v.mph)) * Math.exp(-t * (v.kind === 'piano' ? 3 : 1.6)) * Math.min(1, t * 300) * trem * e * v.amp;
      }
      case 'pluck': { // Karplus-Strong with an auto-wah (band-pass swept by the pluck envelope)
        if (t > v.dur + 0.1) { v.on = false; return 0; }
        const i0 = v.ksIdx, i1 = (i0 + 1) % v.ksLen; const y = 0.5 * (v.ks[i0] + v.ks[i1]) * 0.994; v.ks[i0] = flush(y); v.ksIdx = i1;
        const fc = 500 + 2200 * Math.exp(-t * 14); const w = TAU * fc / SR, q = 0.18; // state-variable band-pass
        const hp = y - v.y1 - q * v.y2; v.y2 += w * hp; v.y1 += w * v.y2;
        return v.y2 * 2.5 * (t < v.dur ? 1 : 1 - (t - v.dur) / 0.1) * v.amp;
      }
      case 'pad': {
        const e = end(0.8); if (!v.on) return 0; let x = 0;
        for (let k = 0; k < 3; k++) { v.ph[k] += v.f * (1 + (k - 1) * 0.004) * wf / SR; x += 2 * (v.ph[k] % 1) - 1; }
        v.y1 += (x - v.y1) * 0.06; v.y2 += (v.y1 - v.y2) * 0.06;
        return v.y2 * Math.min(1, t / 0.45) * e * v.amp;
      }
      case 'brass': {
        const e = end(0.08); if (!v.on) return 0; v.ph[0] += v.f * wf / SR; v.ph[1] += v.f * 1.003 / SR;
        const x = (2 * (v.ph[0] % 1) - 1) + (2 * (v.ph[1] % 1) - 1); const cut = 0.05 + 0.35 * Math.min(1, t / 0.05) * Math.exp(-t * 4);
        v.y1 += (x - v.y1) * cut; return v.y1 * Math.min(1, t * 150) * e * v.amp;
      }
      case 'lead': {
        const e = end(0.12); if (!v.on) return 0; const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t) * Math.min(1, t * 3);
        v.ph[0] += v.f * vib * wf / SR; const x = (2 * (v.ph[0] % 1) - 1) * 0.6 + Math.sin(TAU * v.ph[0]) * 0.6 + r.bi() * 0.06;
        v.y1 += (x - v.y1) * 0.12; return v.y1 * Math.min(1, t / 0.04) * e * v.amp;
      }
    }
    return 0;
  }
}
