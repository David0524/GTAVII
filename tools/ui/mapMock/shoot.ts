/** Renders the three map mockups (tools/ui/mapMock/mock.html) at phone landscape @2x.  npx tsx tools/ui/mapMock/shoot.ts [A B C] */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'shots/map'); fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2); const pageArg = args.find((a) => a.endsWith('.html'));
const dirs = pageArg ? ['page'] : args.length ? args : ['A', 'B', 'C'];
const VW = Number(process.env.VW ?? 844), VH = Number(process.env.VH ?? 390);
const PORT = 5207;
const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 400 && !/Local:/.test(log); i++) await new Promise((r) => setTimeout(r, 250));
if (!/Local:/.test(log)) console.log('vite:', log.slice(-400));
try {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  for (const d of dirs) {
    const t0 = Date.now();
    await page.goto(pageArg ? `http://localhost:${PORT}/${pageArg}` : `http://localhost:${PORT}/tools/ui/mapMock/mock.html?dir=${d}`);
    await page.waitForFunction(() => (window as any).__MOCK_READY, null, { timeout: 180_000 });
    await page.screenshot({ path: path.join(OUT, pageArg ? path.basename(pageArg).replace(/\.html.*$/, '.png') : `mock_${d}.png`), fullPage: !!pageArg });
    console.log(`mock_${d}.png ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { srv.kill(); } }
