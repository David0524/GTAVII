/**
 * Gunfire timing check: are the canyon echoes where the image-source model puts them, and is the travel time
 * right? Each case fires one shot with the click test source (`test.click`, 0.3 ms) in place of the gun, with only
 * that family audible, the listener standing still on W 39th St east of Eighth Ave (scene shootout_8th). Every
 * scheduled arrival (direct = d/343 s after the trigger, then each echo) must show a peak within -0.5/+1.5 ms that
 * stands 6 dB over the 4 ms before it. The constant output latency (limiter lookahead and panner) is measured on
 * the direct arrival. Arrivals within 1.5 ms of an earlier one can't be told apart and aren't scored.
 *
 *   npx tsx tools/audio/gun-check.ts
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';

const CASES: { tier: string; off: [number, number] }[] = [
  { tier: 'service', off: [30, -5] }, { tier: 'magnum', off: [80, -4] }, { tier: 'shotgun', off: [15, -6] }, { tier: 'cheap', off: [150, -3] }, { tier: 'service', off: [-60, -4] },
];

async function main() {
  const server = await createServer({ server: { port: 5198, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' }); await server.listen();
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://127.0.0.1:5198/?audio=offline');
  await p.waitForFunction(() => (window as any).__T74AUDIO?.ready);
  let fails = 0, totalScored = 0, totalFound = 0, ctrlN = 0, ctrlHits = 0; const T0 = 0.5;
  for (const c of CASES) {
    const res = await p.evaluate(([e]) => (window as any).__T74AUDIO.render('shootout_8th', { seconds: 2.5, still: true, only: '^test\\.click', events: [e] }),
      [{ t: T0, play: `gun:${c.tier}:click`, offset: c.off }] as const);
    const shot = res.shots[0]; if (!shot) { console.log(`${c.tier}: no shot fired`); fails++; continue; }
    const buf = Buffer.from(res.pcm, 'base64'); const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const sr = res.sr, n = f.length / 2; const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.max(Math.abs(f[i * 2]), Math.abs(f[i * 2 + 1]));
    const maxIn = (a: number, b2: number) => { let m = 0; for (let i = Math.max(0, Math.floor(a * sr)); i < Math.min(n, Math.ceil(b2 * sr)); i++) m = Math.max(m, x[i]); return m; };
    let lastRatio = 0;
    const peakNear = (t: number) => { const pk = maxIn(t - 0.0005, t + 0.0015), bg = maxIn(t - 0.0045, t - 0.0005) + 1e-9; lastRatio = pk / bg; return pk / bg > 1.6 ? pk : 0; }; // >= 4 dB rise; the control below measures how often that happens by chance
    const step = 768 / sr, trig = Math.floor(T0 / step) * step;
    const arr = [{ what: 'direct', t: trig + shot.delay }, ...shot.echoes.map((q: { delay: number; order: number; gain: number }, i: number) => ({ what: `echo${i + 1} (order ${q.order}, g ${q.gain})`, t: trig + shot.delay + q.delay }))];
    // Output latency: first sample above 30% of the direct's peak at or after the prediction.
    const pkD = maxIn(arr[0].t, arr[0].t + 0.02); let lat = 0; for (let i = Math.floor(arr[0].t * sr); i < arr[0].t * sr + 0.02 * sr; i++) if (x[i] > 0.3 * pkD) { lat = i / sr - arr[0].t; break; }
    for (const a of arr) a.t += lat;
    const times = arr.map((a) => a.t);
    let found = 0, scored = 0; const lines: string[] = [];
    for (const a of arr) {
      if (a.what === 'direct') continue;
      if (a.t > n / sr - 0.05) continue;
      if (times.some((u) => u < a.t && a.t - u < 0.0015)) { lines.push(`    ${a.what.padEnd(26)} +${((a.t - arr[0].t) * 1000).toFixed(1)} ms  (within 1.5 ms of another arrival; not scored)`); continue; }
      scored++; const pk = peakNear(a.t); if (pk) found++;
      // Control: the same test 7 ms later, where nothing is scheduled (skipped if an arrival is near).
      const tc = a.t + 0.007; if (!times.some((u) => Math.abs(u - tc) < 0.005)) { ctrlN++; if (peakNear(tc)) ctrlHits++; }
      lines.push(`    ${a.what.padEnd(26)} +${((a.t - arr[0].t) * 1000).toFixed(1)} ms  ${pk ? `found, ${(20 * Math.log10(pk / pkD)).toFixed(1)} dB re direct` : `NOT FOUND (peak/background ${(20 * Math.log10(lastRatio)).toFixed(1)} dB, peak ${(20 * Math.log10(maxIn(a.t - 0.0005, a.t + 0.0015) / pkD)).toFixed(1)} dB re direct)`}`);
    }
    totalScored += scored; totalFound += found;
    const ok = found === scored; if (!ok) fails++;
    console.log(`${c.tier.padEnd(8)} at ${shot.distance.toFixed(0).padStart(3)} m: travel ${(shot.delay * 1000).toFixed(0)} ms (+${(lat * 1000).toFixed(1)} ms output latency), ${arr.length - 1} echoes, ${found}/${scored} separable found, HDR ${shot.hdrDb} dB  ${ok ? 'OK' : 'FAIL'}`);
    for (const l of lines) console.log(l);
  }
  await b.close(); await server.close();
  console.log(`echoes found ${totalFound}/${totalScored}; control (no arrival scheduled) false positives ${ctrlHits}/${ctrlN}`);
  if (ctrlHits > Math.max(1, ctrlN * 0.1)) { console.log('detector too permissive'); fails++; }
  if (fails) { console.log(`${fails} case(s) failed`); process.exit(1); }
  console.log('gunfire timing checks passed');
}
main().catch((e) => { console.error(e); process.exit(1); });
