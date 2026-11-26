/**
 * npm run audio:bake — render the long procedural one-shots offline and encode them for streaming:
 * Opus in WebM (Chrome, Firefox, Android, Safari 17+) and AAC-LC in MP4 (every Safari/iOS).
 * Output: public/audio/<family>.<variant>.{webm,m4a} + public/audio/manifest.json.
 * Source = this repository's own synthesis (src/audio/synth/bake.ts); see docs/AUDIO_SOURCES.md.
 */
import { BAKERS } from '../../src/audio/synth/bake';
import { mkdirSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STREAMED = ['thunder.near', 'thunder.far'];
const VARIANTS = 2, SR = 48000, OUT = 'public/audio';

function wav16(path: string, x: Float32Array, sr: number) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  writeFileSync(path, b);
}
const ff = (a: string[]) => { const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); };

mkdirSync(OUT, { recursive: true });
const manifest: Record<string, { variants: { opus: string; aac: string; bytesOpus: number; bytesAac: number; seed: number; seconds: number }[] }> = {};
for (const fam of STREAMED) {
  manifest[fam] = { variants: [] };
  for (let k = 0; k < VARIANTS; k++) {
    const seed = 1000 + k * 7919 + fam.length; // same seeds the runtime would bake
    const x = BAKERS[fam].bake(seed, SR);
    const tmp = join(tmpdir(), `t74-${fam}-${k}.wav`); wav16(tmp, x, SR);
    const opus = `audio/${fam}.${k}.webm`, aac = `audio/${fam}.${k}.m4a`;
    ff(['-i', tmp, '-c:a', 'libopus', '-b:a', '48k', '-vbr', 'on', '-application', 'audio', '-map_metadata', '-1', `public/${opus}`]);
    ff(['-i', tmp, '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-map_metadata', '-1', `public/${aac}`]);
    rmSync(tmp);
    manifest[fam].variants.push({ opus, aac, bytesOpus: statSync(`public/${opus}`).size, bytesAac: statSync(`public/${aac}`).size, seed, seconds: x.length / SR });
    console.log(`${fam} #${k}: ${(x.length / SR).toFixed(1)} s -> opus ${manifest[fam].variants[k].bytesOpus} B, aac ${manifest[fam].variants[k].bytesAac} B`);
  }
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
