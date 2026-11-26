/** WAV writing (float32 for analysis, 16-bit with TPDF dither for listening) and a 48k->32k resampler. */
import { writeFileSync } from 'node:fs';

export function writeWavFloat(path: string, L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length, data = n * 2 * 4, b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(data, 40);
  for (let i = 0; i < n; i++) { b.writeFloatLE(L[i], 44 + i * 8); b.writeFloatLE(R[i], 48 + i * 8); }
  writeFileSync(path, b);
}

export function writeWav16(path: string, L: Float32Array, R: Float32Array, sr: number) {
  const n = L.length, data = n * 4, b = Buffer.alloc(44 + data);
  b.write('RIFF', 0); b.writeUInt32LE(36 + data, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(data, 40);
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const q = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32767 + (rnd() - rnd()))));
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(L[i]), 44 + i * 4); b.writeInt16LE(q(R[i]), 46 + i * 4); }
  writeFileSync(path, b);
}

/** Rational 2/3 resampler (48k -> 32k): zero-stuff x2, Kaiser low-pass at 15 kHz, keep every 3rd. */
export function resample48to32(x: Float32Array): Float32Array {
  const N = 96, h = new Float64Array(N), c = (N - 1) / 2, fc = 15000 / 96000, beta = 8;
  const i0 = (v: number) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (v / (2 * k)) ** 2; s += t; } return s; };
  let sum = 0; for (let n = 0; n < N; n++) { const t = n - c; h[n] = (t === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * t) / (Math.PI * t)) * i0(beta * Math.sqrt(1 - (t / c) ** 2)) / i0(beta); sum += h[n]; }
  for (let n = 0; n < N; n++) h[n] = (h[n] / sum) * 2;
  const outLen = Math.floor(x.length * 2 / 3); const y = new Float32Array(outLen);
  for (let m = 0; m < outLen; m++) {
    const up = m * 3; let s = 0;
    for (let k = 0; k < N; k++) { const j = up - k; if (j < 0) break; if (j % 2 === 0) { const xi = j / 2; if (xi < x.length) s += h[k] * x[xi]; } }
    y[m] = s;
  }
  return y;
}
