/**
 * Where does New Game → playable go? Same flow as tools/tests/loadtime.ts, with a CDP CPU profile from
 * title-ready to playable and a long-task log; prints self time by script and by function, and the marks.
 *   npx vite build && npx tsx tools/dev/loadProfile.ts [out.cpuprofile]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = await new Promise<number>((res) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } };
for (let k = 0; k < 120; k++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const has = (n: string) => `(window.__T74?.load.marks ?? []).some(([m]) => m === '${n}')`;
try {
  const page = await browser.newPage({ viewport: { width: 932, height: 430 } });
  page.setDefaultTimeout(240_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await page.goto(`http://localhost:${PORT}/?webgl=1&quality=low&fresh=1`);
  await page.waitForFunction(has('title-ready'));
  await cdp.send('Profiler.start');
  await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith('New game'))!.click());
  await page.waitForFunction(`${has('playable')} || ${has('cutscene')}`);
  for (let k = 0; k < 20 && !(await page.evaluate(has('playable'))); k++) { await page.keyboard.down('Enter'); await page.waitForTimeout(4000); await page.keyboard.up('Enter'); await page.waitForTimeout(500); }
  await page.waitForFunction(has('playable'));
  const { profile } = await cdp.send('Profiler.stop') as { profile: any };
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(profile));
  // self time per node = samples hitting it × interval
  const dt = new Map<number, number>();
  for (let k = 0; k < profile.samples.length; k++) dt.set(profile.samples[k], (dt.get(profile.samples[k]) ?? 0) + (profile.timeDeltas[k + 1] ?? 0) / 1000);
  const byFn = new Map<string, number>(), byUrl = new Map<string, number>();
  for (const n of profile.nodes) {
    const t = dt.get(n.id) ?? 0; if (!t) continue;
    const cf = n.callFrame, url = (cf.url || '(native)').replace(/.*\/assets\//, '');
    const fn = `${cf.functionName || '(anon)'} ${url}:${cf.lineNumber}`;
    byFn.set(fn, (byFn.get(fn) ?? 0) + t); byUrl.set(url, (byUrl.get(url) ?? 0) + t);
  }
  const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000).toFixed(2).padStart(7)} s  ${k}`).join('\n');
  console.log('--- self time by script\n' + top(byUrl, 12) + '\n--- self time by function\n' + top(byFn, 30));
  console.log(await page.evaluate(() => (window as any).__T74.load.text()));
  // frame timeline: cumulative frame end times (s) with durations, to see how many frames each phase spans
  console.log('--- frames (ms) after title-ready\n' + await page.evaluate(() => { const L = (window as any).__T74.load; const tr = L.marks.find(([n]: [string]) => n === 'title-ready')[1]; let t = 0; const out: string[] = []; for (const f of L.frames) { t += f; if (t > tr - 50) out.push(`${(t / 1000).toFixed(1)}:${f.toFixed(0)}`); } return out.join(' '); }));
} finally { await browser.close(); stop(); }
