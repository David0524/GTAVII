/**
 * Dev tool for mix work: render a scenario with only one bus, or only one group of voices,
 * audible, and print its loudness and octave balance.
 *
 *   npx tsx tools/audio/stems.ts --only herald_rush [--seconds 30] [--buses] [--groups 're1,re2']
 *
 * Default groups: roar, traffic sectors, crowd, near engines, horns, emitters/beds, one-shots, all.
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { measure, octaveBands } from './loudness';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const SECONDS = +opt('seconds', '20'), ONLY = opt('only', '');
const GROUPS = opt('groups', '').split(',').filter(Boolean);
const DEFAULT_GROUPS = ['^bed\\.roar', '^traffic\\.sector', '^bed\\.(walla|kids)', '^traffic\\.\\d', '^horn', '^(em|bed\\.(hum|wind|rain))', '^(siren|step|bird|cart|dock|signal|manhole|whistle|chirp|impact|glass|brake|bus|thunder|truck|jack|ship|drip)', '.'];

async function main() {
  const server = await createServer({ server: { port: 5197, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' }); await server.listen();
  const b = await chromium.launch(); const p = await b.newPage(); await p.goto('http://127.0.0.1:5197/?audio=offline');
  await p.waitForFunction(() => (window as any).__T74AUDIO?.ready);
  const ids: string[] = await p.evaluate(() => [...(window as any).__T74AUDIO.scenarios, ...(window as any).__T74AUDIO.extras]);
  const runs: { label: string; o: Record<string, unknown> }[] = args.includes('--buses')
    ? ['', 'ambience', 'sfx', 'dialogue', 'radio'].map((solo) => ({ label: solo || 'mix', o: solo ? { solo } : {} }))
    : (GROUPS.length ? GROUPS : DEFAULT_GROUPS).map((g) => ({ label: g, o: { only: g } }));
  console.log(`${'scenario'.padEnd(13)} ${'stem'.padEnd(34)}  LUFS   TP   Mmax |  63  125  250  500   1k   2k   4k   8k`);
  for (const id of ids) {
    if (ONLY && id !== ONLY) continue;
    for (const r of runs) {
      const res = await p.evaluate(([i, o]) => (window as any).__T74AUDIO.render(i, o), [id, { seconds: SECONDS, content: args.includes('--content'), ...r.o }] as const);
      const buf = Buffer.from(res.pcm, 'base64'); const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      const n = f.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = f[i * 2]; R[i] = f[i * 2 + 1]; }
      const skip = 9600; const m = measure(L.subarray(skip), R.subarray(skip)); const oc = octaveBands(L, R);
      console.log(`${id.padEnd(13)} ${r.label.slice(0, 34).padEnd(34)} ${m.integrated.toFixed(1).padStart(6)} ${m.truePeak.toFixed(1).padStart(5)} ${m.momentaryMax.toFixed(1).padStart(6)} | ${Object.values(oc).map((v) => v.toFixed(0).padStart(4)).join(' ')}`);
    }
  }
  await b.close(); await server.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
