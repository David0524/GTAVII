/**
 * Game-loop wiring smoke shot (HANDOFF_WIRING): built game, photo camera, waits for streaming and the sim,
 * lets traffic run, then shoots and prints sim / traffic counts.
 *   npx vite build && npx tsx tools/dev/wireSmoke.ts out.jpg "at=-8,-30,14" [&extra=params]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
// view: "cam=x,y,z,yaw,pitch&camrel=1" (photo camera) or "at=x,z,heading" (on foot, third-person camera)
const out = process.argv[2] ?? 'wire.jpg', view = process.argv[3] ?? 'cam=-8,1.7,-30,14,6&camrel=1', extra = process.argv[4] ?? '';
const PORT = await new Promise<number>((res) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } };
for (let k = 0; k < 120; k++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const logs: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(240_000);
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`http://localhost:${PORT}/?webgl=1&quality=low&time=12:30&timescale=0&${view}${extra}`);
  await page.waitForFunction(() => (window as any).__T74);
  await page.evaluate(() => (window as any).__T74.whenIdle());
  await page.waitForFunction(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'sim')); await page.waitForFunction(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'characters'));
  await page.waitForTimeout(12_000); // a few headless frames of traffic
  const info = await page.evaluate(() => { const T = (window as any).__T74; return { cars: T.sim?.vehicles.length, peds: T.sim?.peds.length, simMs: T.sim?.lastUpdateMs, draws: T.renderer.info.render.drawCalls, marks: T.load.marks.map(([n, t]: [string, number]) => `${n} ${(t / 1000).toFixed(1)}`).join(' | ') }; });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: out, type: 'jpeg', quality: 85 });
} finally { await browser.close(); stop(); }
console.log(logs.slice(-20).join('\n'));
