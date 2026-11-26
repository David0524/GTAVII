/**
 * ITU-R BS.1770-4 / EBU R128 measurement (independent of the engine's limiter code):
 *  - K-weighting (pre-filter shelf + RLB high-pass, 48 kHz coefficients from the standard),
 *  - integrated loudness with 400 ms blocks / 75 % overlap, -70 LUFS absolute and -10 LU relative gates,
 *  - momentary (400 ms) and short-term (3 s) maxima, loudness range (LRA, EBU Tech 3342),
 *  - true peak by 4x oversampling (Kaiser-windowed sinc, 32 taps per phase; finer than the
 *    standard's 12-tap example filter).
 * Validated by selfTest() against the EBU Tech 3341 calibration signal, and cross-checked against
 * ffmpeg's ebur128 filter in tools/audio/render.ts.
 */

const K48 = { s1b: [1.53512485958697, -2.69169618940638, 1.19839281085285], s1a: [-1.69065929318241, 0.73248077421585], s2b: [1, -2, 1], s2a: [-1.99004745483398, 0.99007225036621] };

function biquad(x: Float32Array, b: number[], a: number[]): Float64Array {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function kweight(x: Float32Array, sr: number): Float64Array {
  if (sr !== 48000) throw new Error('K-weighting coefficients here are for 48 kHz');
  const a = biquad(x, K48.s1b, K48.s1a); return biquad(Float32Array.from(a), K48.s2b, K48.s2a);
}

/** Per-block mean-square sums over channels (G = 1 for L and R). */
function blocks(chs: Float64Array[], sr: number, winS: number, hopS: number): number[] {
  const win = Math.round(winS * sr), hop = Math.round(hopS * sr), n = chs[0].length; const out: number[] = [];
  // prefix sums of squares per channel
  const pre = chs.map((c) => { const p = new Float64Array(c.length + 1); for (let i = 0; i < c.length; i++) p[i + 1] = p[i] + c[i] * c[i]; return p; });
  for (let s = 0; s + win <= n; s += hop) { let z = 0; for (const p of pre) z += (p[s + win] - p[s]) / win; out.push(z); }
  return out;
}
const lufs = (z: number) => -0.691 + 10 * Math.log10(z + 1e-30);

export interface Loudness { integrated: number; momentaryMax: number; shortTermMax: number; lra: number; truePeak: number; samplePeak: number; clipped: number }

export function measure(L: Float32Array, R: Float32Array, sr = 48000): Loudness {
  const kl = kweight(L, sr), kr = kweight(R, sr);
  const zb = blocks([kl, kr], sr, 0.4, 0.1);
  const abs = zb.filter((z) => lufs(z) > -70);
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / Math.max(1, abs.length)) - 10;
  const gated = abs.filter((z) => lufs(z) > rel);
  const integrated = lufs(gated.reduce((a, b) => a + b, 0) / Math.max(1, gated.length));
  const momentaryMax = Math.max(...zb.map(lufs));
  const st = blocks([kl, kr], sr, 3, 0.1).map(lufs);
  const shortTermMax = st.length ? Math.max(...st) : -Infinity;
  // LRA: short-term values gated at -70 abs and -20 LU relative, 10th..95th percentile.
  const stAbs = st.filter((v) => v > -70); const stRelGate = 10 * Math.log10(stAbs.reduce((a, v) => a + Math.pow(10, v / 10), 0) / Math.max(1, stAbs.length)) - 20;
  const stG = stAbs.filter((v) => v > stRelGate).sort((a, b) => a - b);
  const lra = stG.length > 1 ? stG[Math.floor(stG.length * 0.95)] - stG[Math.floor(stG.length * 0.1)] : 0;
  let sp = 0, clipped = 0; for (const c of [L, R]) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > sp) sp = a; if (a >= 0.9999) clipped++; }
  return { integrated, momentaryMax, shortTermMax, lra, truePeak: 20 * Math.log10(Math.max(truePeak(L), truePeak(R)) + 1e-12), samplePeak: 20 * Math.log10(sp + 1e-12), clipped };
}

const OS = 4, TP_TAPS = 32;
const POLY = (() => {
  const N = OS * TP_TAPS, h = new Float64Array(N), beta = 9, c = (N - 1) / 2;
  const i0 = (x: number) => { let s = 1, t = 1; for (let k = 1; k < 40; k++) { t *= (x / (2 * k)) ** 2; s += t; } return s; };
  for (let n = 0; n < N; n++) { const x = (n - c) / OS; const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); h[n] = sinc * i0(beta * Math.sqrt(Math.max(0, 1 - ((n - c) / c) ** 2))) / i0(beta); }
  const ph: Float64Array[] = []; for (let p = 0; p < OS; p++) { const f = new Float64Array(TP_TAPS); let s = 0; for (let k = 0; k < TP_TAPS; k++) { f[k] = h[p + k * OS]; s += f[k]; } for (let k = 0; k < TP_TAPS; k++) f[k] /= s; ph.push(f); }
  return ph;
})();
export function truePeak(x: Float32Array): number {
  let m = 0;
  for (let i = TP_TAPS; i < x.length; i++) {
    for (let p = 0; p < OS; p++) { const f = POLY[p]; let s = 0; for (let k = 0; k < TP_TAPS; k++) s += f[k] * x[i - k]; const a = Math.abs(s); if (a > m) m = a; }
  }
  return m;
}

/** EBU Tech 3341 case 1: stereo 1 kHz sine at -23 dBFS -> -23.0 LUFS (+-0.1). */
export function selfTest(): { lufs: number; tp: number; ok: boolean } {
  const sr = 48000, n = sr * 20; const a = Math.pow(10, -23 / 20); const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = a * Math.sin(2 * Math.PI * 1000 * i / sr);
  const m = measure(L, L.slice(), sr);
  // True-peak check: a 0 dBFS sine at fs/4 sampled at 45 degrees has sample peak -3.01 dB but true peak 0 dBTP.
  const s = new Float32Array(sr); for (let i = 0; i < sr; i++) s[i] = Math.sin(2 * Math.PI * (sr / 4) * i / sr + Math.PI / 4);
  const tp = 20 * Math.log10(truePeak(s));
  return { lufs: m.integrated, tp, ok: Math.abs(m.integrated + 23) < 0.1 && Math.abs(tp) < 0.2 };
}

/** Octave-band levels (dB re full-scale RMS, mid channel) at 63 Hz..8 kHz: a coarse tonal-balance check. */
export function octaveBands(L: Float32Array, R: Float32Array, sr = 48000): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fc of [63, 125, 250, 500, 1000, 2000, 4000, 8000]) {
    const a1 = Math.exp(-2 * Math.PI * fc * Math.SQRT2 / sr), a2 = Math.exp(-2 * Math.PI * fc / Math.SQRT2 / sr);
    let y1 = 0, y2 = 0, s = 0;
    for (let i = 0; i < L.length; i++) { const x = (L[i] + R[i]) * 0.5; y1 = x + a1 * (y1 - x); y2 = y1 + a2 * (y2 - y1); const b = y1 - y2; s += b * b; }
    out[fc >= 1000 ? `${fc / 1000}k` : `${fc}`] = +(10 * Math.log10(s / L.length + 1e-20)).toFixed(1);
  }
  return out;
}
/** Inter-channel correlation (1 = mono, 0 = fully decorrelated): a stereo-width check. */
export function correlation(L: Float32Array, R: Float32Array): number {
  let lr = 0, ll = 0, rr = 0; for (let i = 0; i < L.length; i++) { lr += L[i] * R[i]; ll += L[i] * L[i]; rr += R[i] * R[i]; }
  return lr / Math.sqrt(ll * rr + 1e-30);
}
