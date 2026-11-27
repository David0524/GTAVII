/** Bake every movement-set family, check it, and write a listening montage to shots/audio/movement_foley.wav. */
import { BAKERS } from '../../src/audio/synth/bake';
const MOVEMENT = Object.keys(BAKERS).filter((k) => /^(step\.(granite|subwaytile|stoop|iron|rung|gravel)|fence\.|foley\.)/.test(k));
import { writeWav16 } from './wav';
import ffmpegPath from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const sr = 44100, gap = Math.round(sr * 0.35); const parts: Float32Array[] = []; let bad = 0;
for (const fam of MOVEMENT) {
  for (let v = 0; v < 2; v++) {
    const x = BAKERS[fam].bake(1000 + v * 7919 + fam.length, sr);
    let peak = 0, nan = 0, ss = 0; for (const s of x) { if (!Number.isFinite(s)) nan++; else { peak = Math.max(peak, Math.abs(s)); ss += s * s; } }
    if (nan || peak > 1 || peak < 0.05) bad++;
    if (v === 0) console.log(`${fam.padEnd(16)} ${(x.length / sr).toFixed(2)} s  peak ${peak.toFixed(2)}  rms ${(10 * Math.log10(ss / x.length + 1e-12)).toFixed(1)} dB  nan ${nan}`);
    parts.push(x, new Float32Array(gap));
  }
}
const n = parts.reduce((a, b) => a + b.length, 0), m = new Float32Array(n); let o = 0; for (const p of parts) { m.set(p, o); o += p.length; }
// Review previews stay small (<= 1 MB): render to a temp WAV, commit Opus.
const tmp = join(tmpdir(), 't74-foley.wav'); writeWav16(tmp, m, m, sr);
spawnSync(ffmpegPath as unknown as string, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-c:a', 'libopus', '-b:a', '96k', 'shots/audio/movement_foley.ogg']); rmSync(tmp);
console.log(`${MOVEMENT.length} families, ${bad} bad; montage ${(n / sr).toFixed(1)} s`); if (bad) process.exit(1);
