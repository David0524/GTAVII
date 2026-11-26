/**
 * Headless audio test (npm run audio:test). Starts Vite, opens ?audio=offline in Chromium, renders
 * 60 s from each listener scenario through an OfflineAudioContext, measures it here in Node
 * (BS.1770-4 loudness, 4x true peak), cross-checks with ffmpeg's ebur128 when available, writes
 * 20 s listening excerpts to shots/audio/*.wav and everything to shots/audio/report.json, and
 * asserts the brief's targets. Timings are CPU-only (headless container, no audio device).
 *
 *   --seconds N   render length (default 60)      --only ID   one scenario
 *   --no-ht       skip the home-theatre pass       --no-low    skip the Low-preset pass
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measure, selfTest, octaveBands, correlation, type Loudness } from './loudness';
import { writeWav16, writeWavFloat, resample48to32 } from './wav';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k: string) => args.includes(`--${k}`);
const SECONDS = +opt('seconds', '60');
const ONLY = opt('only', '');
const OUT = 'shots/audio';
const TARGET = { mobile: -16, homeTheatre: -23, tol: 1.0, tpMax: -1.0 };
// Per-scene windows (LUFS, mobile profile). A city is not equally loud at 3 a.m. and at rush hour;
// the session (all three scenes back to back) is what must sit on the -16 target.
const WINDOWS: Record<string, [number, number]> = { herald_rush: [-17.5, -12.5], side_3am: [-30, -19], eighth_rain: [-19, -13] };

type Res = { id: string; title: string; quality: string; profile: string; sr: number; renderMs: number; pcm: string; checks: any; timing: any; stats: any };

function decode(b64: string, sr: number) {
  const buf = Buffer.from(b64, 'base64'); const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[i * 2]; R[i] = f[i * 2 + 1]; }
  return { L, R, sr };
}

function ffmpeg(L: Float32Array, R: Float32Array, sr: number): { I: number; TP: number } | null {
  const p = join(tmpdir(), `t74-${process.pid}-${Math.random().toString(36).slice(2)}.wav`); writeWavFloat(p, L, R, sr);
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
    const s: string = r.stderr ?? '';
    const sum = s.slice(s.lastIndexOf('Summary:'));
    const I = /I:\s+(-?[\d.]+) LUFS/.exec(sum), TP = /Peak:\s+(-?[\d.]+) dBFS/.exec(sum.slice(sum.indexOf('True peak')));
    return I ? { I: +I[1], TP: TP ? +TP[1] : NaN } : null;
  } catch { return null; }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const st = selfTest();
  console.log(`loudness self-test: 1 kHz @ -23 dBFS -> ${st.lufs.toFixed(2)} LUFS; fs/4 sine TP ${st.tp.toFixed(2)} dBTP ${st.ok ? 'OK' : 'FAIL'}`);
  const server = await createServer({ server: { port: 5199, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
  await server.listen();
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const logs: string[] = []; page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); }); page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto('http://127.0.0.1:5199/?audio=offline');
  await page.waitForFunction(() => (window as any).__T74AUDIO?.ready, null, { timeout: 120000 });
  let report_limiter: any = null;
  const report_music: any[] = [];
  for (const [style, name, bpm] of [[0, 'soul', 104], [1, 'easy', 80], [2, 'jazz', 132], [3, 'salsa', 96]] as const) {
    const m = await page.evaluate(([s, b]) => (window as any).__T74AUDIO.renderMusic(s, 1974 + s, b, 20), [style, bpm] as const);
    const { L, R } = decode(m.pcm, m.sr); const lm = measure(L, R, m.sr);
    writeWav16(`${OUT}/music_${name}.wav`, resample48to32(L), resample48to32(R), 32000);
    report_music.push({ style: name, bpm, lufs: lm.integrated, truePeak: lm.truePeak, nan: m.nan, realtimeFactor: m.realtimeFactor });
    console.log(`music ${name}: ${lm.integrated.toFixed(1)} LUFS, TP ${lm.truePeak.toFixed(1)}, ${m.realtimeFactor.toFixed(0)}x realtime (one feed, CPU-only)`);
  }
  const ids: string[] = await page.evaluate(() => (window as any).__T74AUDIO.scenarios);
  {
    const lt = await page.evaluate(() => (window as any).__T74AUDIO.limiterTest());
    const { L, R } = decode(lt.pcm, lt.sr); const m = measure(L, R, lt.sr);
    report_limiter = { truePeak: m.truePeak, samplePeak: m.samplePeak, safetyClamps: lt.clamps };
    console.log(`limiter torture (+12 dB impulses, bursts, fs/4 sines, 20 kHz sweep): TP ${m.truePeak.toFixed(2)} dBTP, safety clamps ${lt.clamps}`);
  }
  const runs: { id: string; profile: string; quality: string }[] = [];
  for (const id of ids) if (!ONLY || id === ONLY) runs.push({ id, profile: 'mobile', quality: 'high' });
  if (!flag('no-ht')) for (const id of ids) if (!ONLY || id === ONLY) runs.push({ id, profile: 'homeTheatre', quality: 'high' });
  if (!flag('no-low')) runs.push({ id: ONLY || 'herald_rush', profile: 'mobile', quality: 'low' });

  const report: any = { limiter: null as any, generated: new Date().toISOString(), note: 'Headless Chromium OfflineAudioContext in a CPU-only container: timings are CPU-only, not device numbers.', selfTest: st, seconds: SECONDS, runs: [], session: {}, failures: [], consoleErrors: [] };
  const sessions: Record<string, { L: Float32Array[]; R: Float32Array[] }> = {};
  for (const r of runs) {
    process.stdout.write(`render ${r.id} [${r.quality}/${r.profile}] ... `);
    const t0 = Date.now();
    const res: Res = await page.evaluate(([id, o]) => (window as any).__T74AUDIO.render(id, o), [r.id, { seconds: SECONDS, profile: r.profile, quality: r.quality }] as const);
    const { L, R, sr } = decode(res.pcm, res.sr);
    const m: Loudness = measure(L, R, sr);
    const ff = ffmpeg(L, R, sr);
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s wall, ${m.integrated.toFixed(2)} LUFS, TP ${m.truePeak.toFixed(2)} dBTP${ff ? ` (ffmpeg ${ff.I.toFixed(1)} / ${ff.TP.toFixed(1)})` : ''}, voices max ${res.checks.maxRealVoices}/${res.checks.voiceCap}, update p95 ${res.timing.p95.toFixed(3)} ms`);
    const key = `${r.quality}/${r.profile}`; (sessions[key] ??= { L: [], R: [] }); sessions[key].L.push(L); sessions[key].R.push(R);
    if (r.profile === 'mobile' && r.quality === 'high') {
      const a = Math.floor(sr * Math.min(10, SECONDS / 3)), b = Math.min(L.length, a + sr * 20);
      writeWav16(`${OUT}/${r.id}.wav`, resample48to32(L.subarray(a, b)), resample48to32(R.subarray(a, b)), 32000);
    }
    const { pcm: _p, ...rest } = res; void _p;
    report.runs.push({ ...rest, loudness: m, ffmpeg: ff, octaves: octaveBands(L, R, sr), correlation: +correlation(L, R).toFixed(3) });
    // Assertions.
    const fail = (msg: string) => report.failures.push(`${r.id} [${key}]: ${msg}`);
    if (m.truePeak > TARGET.tpMax) fail(`true peak ${m.truePeak.toFixed(2)} dBTP > ${TARGET.tpMax}`);
    if (m.clipped > 0) fail(`${m.clipped} clipped samples`);
    if (res.checks.nan) fail(`${res.checks.nan} NaN/Inf samples`);
    if (res.checks.subnormals) fail(`${res.checks.subnormals} denormal samples`);
    if (res.checks.limiter?.nans) fail(`limiter saw ${res.checks.limiter.nans} NaN inputs`);
    if (res.checks.maxRealVoices > res.checks.voiceCap) fail(`voice cap exceeded ${res.checks.maxRealVoices} > ${res.checks.voiceCap}`);
    if (res.checks.leakedNodes) fail(`${res.checks.leakedNodes} nodes still connected after unload: ${res.checks.leakedTypes.join(',')}`);
    if (r.profile === 'mobile' && r.quality === 'high' && WINDOWS[r.id]) { const [lo, hi] = WINDOWS[r.id]; if (m.integrated < lo || m.integrated > hi) fail(`integrated ${m.integrated.toFixed(2)} LUFS outside scene window [${lo}, ${hi}]`); }
    if (ff && Math.abs(ff.I - m.integrated) > 0.5) fail(`loudness meter disagrees with ffmpeg: ${m.integrated.toFixed(2)} vs ${ff.I}`);
  }
  for (const [key, s] of Object.entries(sessions)) {
    if (s.L.length < 2) continue;
    const cat = (a: Float32Array[]) => { const n = a.reduce((x, y) => x + y.length, 0), o = new Float32Array(n); let k = 0; for (const x of a) { o.set(x, k); k += x.length; } return o; };
    const m = measure(cat(s.L), cat(s.R), 48000);
    report.session[key] = m;
    const tgt = key.endsWith('homeTheatre') ? TARGET.homeTheatre : TARGET.mobile;
    console.log(`session ${key}: ${m.integrated.toFixed(2)} LUFS integrated (target ${tgt} +-${TARGET.tol}), TP ${m.truePeak.toFixed(2)} dBTP, LRA ${m.lra.toFixed(1)} LU`);
    if (Math.abs(m.integrated - tgt) > TARGET.tol) report.failures.push(`session ${key}: ${m.integrated.toFixed(2)} LUFS, target ${tgt} +-${TARGET.tol}`);
  }
  report.consoleErrors = logs.slice(0, 50);
  report.limiter = report_limiter; report.music = report_music;
  for (const m of report_music) if (m.nan || m.truePeak > 0) report.failures.push(`music ${m.style}: nan ${m.nan}, TP ${m.truePeak.toFixed(1)}`);
  if (report_limiter && report_limiter.truePeak > TARGET.tpMax) report.failures.push(`limiter torture true peak ${report_limiter.truePeak.toFixed(2)} dBTP`);
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
  await browser.close(); await server.close();
  if (!st.ok) report.failures.push('loudness meter self-test failed');
  if (report.failures.length) { console.log(`\nFAILED (${report.failures.length}):\n  ${report.failures.join('\n  ')}`); process.exit(1); }
  console.log('\nall audio checks passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
