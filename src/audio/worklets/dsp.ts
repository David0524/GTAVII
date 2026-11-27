/**
 * Small DSP building blocks shared by the AudioWorklet processors. Pure, allocation-free in the
 * per-sample path, and safe to import from the worklet bundle (no DOM, no Web Audio types).
 * Everything that has feedback flushes tiny values to zero, so silence never decays into
 * denormals (which are slow on x86 and are asserted against by the offline test).
 */

export const TAU = Math.PI * 2;
export const flush = (x: number) => (x > 1e-15 || x < -1e-15 ? x : 0);
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const dbToGain = (db: number) => Math.pow(10, db / 20);

/** xorshift32: deterministic, fast, good enough for audio noise and scheduling. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  u32() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s; }
  next() { return this.u32() / 4294967296; }
  bi() { return this.next() * 2 - 1; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  /** Exponential inter-arrival time for a Poisson process of `rate` events/s. */
  exp(rate: number) { return -Math.log(1 - this.next() * 0.999999) / Math.max(rate, 1e-6); }
  pick<T>(a: readonly T[]): T { return a[(this.next() * a.length) | 0]; }
}

/** Paul Kellet's economy pink noise filter over white noise. */
export class Pink {
  private b0 = 0; private b1 = 0; private b2 = 0;
  constructor(private rng: Rng) {}
  next() {
    const w = this.rng.bi();
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.18;
  }
}

/** Brown(ish) noise: leaky integrated white noise. */
export class Brown {
  private y = 0;
  constructor(private rng: Rng) {}
  next() { this.y = flush(0.995 * this.y + 0.05 * this.rng.bi()); return this.y * 2.2; }
}

export class OnePole {
  y = 0; a = 0;
  constructor(hz = 1000, sr = 48000) { this.set(hz, sr); }
  set(hz: number, sr: number) { this.a = Math.exp((-TAU * clamp(hz, 1, sr * 0.49)) / sr); }
  lp(x: number) { this.y = flush(x + this.a * (this.y - x)); return this.y; }
  hp(x: number) { return x - this.lp(x); }
}

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private z1 = 0; private z2 = 0;
  set(type: 'lp' | 'hp' | 'bp' | 'peak' | 'notch', f: number, q: number, sr: number, gainDb = 0) {
    const w = (TAU * clamp(f, 5, sr * 0.48)) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Math.max(q, 0.05));
    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else if (type === 'notch') { b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
    else { const A = Math.pow(10, gainDb / 40); b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * x + this.z1;
    this.z1 = flush(this.b1 * x - this.a1 * y + this.z2);
    this.z2 = flush(this.b2 * x - this.a2 * y);
    return y;
  }
  reset() { this.z1 = this.z2 = 0; }
}

/**
 * Two-pole resonator as a rotating phasor: excite() adds energy, run() advances. Used for
 * modal synthesis (rain pings, Minnaert bubbles) where hundreds can be alive at once.
 */
export class Mode {
  re = 0; im = 0; c = 1; s = 0; r = 0; amp = 0; alive = false; chirp = 0; w = 0;
  start(freq: number, decaySec: number, amp: number, sr: number, chirpPerSec = 0) {
    this.w = (TAU * freq) / sr; this.c = Math.cos(this.w); this.s = Math.sin(this.w);
    this.r = Math.exp(-1 / Math.max(decaySec * sr, 1)); this.re = 0; this.im = amp; this.alive = true;
    /** chirpPerSec: relative frequency rise per second (Minnaert bubbles rise as they shrink). */
    this.chirp = chirpPerSec > 0 ? 1 + chirpPerSec / sr : 0; this.amp = amp;
  }
  run() {
    if (!this.alive) return 0;
    if (this.chirp && this.w < 2.8) { this.w *= this.chirp; this.c = Math.cos(this.w); this.s = Math.sin(this.w); }
    const re = (this.re * this.c - this.im * this.s) * this.r;
    const im = (this.re * this.s + this.im * this.c) * this.r;
    this.re = re; this.im = im;
    if (Math.abs(im) + Math.abs(re) < 1e-6) { this.alive = false; this.re = this.im = 0; }
    return im;
  }
}

/** Circular delay line with linear-interpolated fractional reads. */
export class Delay {
  buf: Float32Array; w = 0; mask: number;
  constructor(maxSamples: number) {
    let n = 1; while (n < maxSamples + 2) n <<= 1;
    this.buf = new Float32Array(n); this.mask = n - 1;
  }
  push(x: number) { this.buf[this.w] = x; this.w = (this.w + 1) & this.mask; }
  /** d in samples (>= 1). */
  read(d: number) {
    const i = Math.floor(d), f = d - i;
    const a = this.buf[(this.w - i - 1 + this.buf.length) & this.mask];
    const b = this.buf[(this.w - i - 2 + this.buf.length) & this.mask];
    return a + (b - a) * f;
  }
}

/** Schroeder allpass for diffusion. */
export class Allpass {
  private d: Delay; constructor(private len: number, private g: number) { this.d = new Delay(len + 1); }
  run(x: number) { const z = this.d.read(this.len - 1); const v = flush(x + this.g * z); this.d.push(v); return z - this.g * v; }
}

/** Smooths k-rate parameter changes per sample (one-pole, ~`ms` time constant). */
export class Smooth {
  v: number; private a: number;
  constructor(v: number, ms: number, sr: number) { this.v = v; this.a = Math.exp(-1 / ((ms / 1000) * sr)); }
  step(target: number) { this.v = target + this.a * (this.v - target); return this.v; }
}

/** Vowel formants (F1, F2, F3 in Hz; adult male), a neutral set of English-like vowels. */
export const VOWELS: readonly [number, number, number][] = [
  [730, 1090, 2440], // a
  [530, 1840, 2480], // e
  [390, 1990, 2550], // i (lax)
  [570, 840, 2410], // o
  [440, 1020, 2240], // u (lax)
  [660, 1720, 2410], // ae
  [520, 1190, 2390], // schwa
];
