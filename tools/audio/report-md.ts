/** Print shots/audio/report.json as the Markdown measurement tables used in docs/AUDIO_PROGRESS.md. */
import { readFileSync } from 'node:fs';

const r = JSON.parse(readFileSync('shots/audio/report.json', 'utf8'));
const f = (v: number, d = 1) => (typeof v === 'number' && isFinite(v) ? v.toFixed(d) : '—');
console.log(`Generated ${r.generated}. ${r.note}\n`);
console.log(`Meter self-test: 1 kHz at −23 dBFS reads ${f(r.selfTest.lufs, 2)} LUFS; fs/4 sine true peak ${f(r.selfTest.tp, 2)} dBTP. Limiter torture (impulses ×4, +12 dB bursts, fs/4 sines, 20 kHz sweep): ${f(r.limiter?.truePeak, 2)} dBTP out, ${r.limiter?.safetyClamps} safety clamps.\n`);
console.log('| Scene | Preset / profile | Integrated LUFS (ffmpeg) | True peak dBTP | Short-term max | LRA LU | Limiter >1 dB / max GR | Real voices max / cap | update ms p50 / p95 / p99 / max | Leaked nodes | NaN / denormals |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const x of r.runs) {
  const L = x.loudness, c = x.checks, t = x.timing, lim = c.limiter;
  console.log(`| ${x.id} | ${x.quality} / ${x.profile} | ${f(L.integrated, 2)} (${f(x.ffmpeg?.I)}) | ${f(L.truePeak, 2)} | ${f(L.shortTermMax)} | ${f(L.lra)} | ${f(lim.over1dB * 100)} % / ${f(lim.maxGrDb)} dB | ${c.maxRealVoices} / ${c.voiceCap} | ${f(t.p50, 2)} / ${f(t.p95, 2)} / ${f(t.p99, 2)} / ${f(t.max, 1)} | ${c.leakedNodes} (of ${c.connectedBeforeUnload} wired) | ${c.nan} / ${c.subnormals} |`);
}
console.log('\n| Session (scenes back to back) | Integrated LUFS | Target | True peak dBTP | LRA LU |\n|---|---|---|---|---|');
for (const [k, m] of Object.entries<any>(r.session)) console.log(`| ${k} | ${f(m.integrated, 2)} | ${k.endsWith('homeTheatre') ? '−23 ±1' : '−16 ±1'} | ${f(m.truePeak, 2)} | ${f(m.lra)} |`);
console.log('\n| Scene | Octave bands 63..8k (dB) | L/R correlation | Bank MB (budget) | Mean update parts (ms) |\n|---|---|---|---|---|');
for (const x of r.runs) {
  if (x.profile !== 'mobile') continue;
  const parts = x.stats.timing.parts, fr = x.timing.frames;
  console.log(`| ${x.id} (${x.quality}) | ${Object.values(x.octaves).join(' / ')} | ${x.correlation} | ${f(x.stats.bank.decodedBytes / 1048576)} (${f(x.stats.bank.budget / 1048576, 0)}), evicted ${x.stats.bank.evicted}, streamed ${x.stats.bank.streamed} | ${Object.entries<number>(parts).map(([k, v]) => `${k} ${(v / fr).toFixed(3)}`).join(', ')} |`);
}
console.log(`\nFailures: ${r.failures.length ? r.failures.join('; ') : 'none'}`);
