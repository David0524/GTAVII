/** Renders the three map mockups (tools/ui/mapMock/mock.html) at phone landscape @2x.  npx tsx tools/ui/mapMock/shoot.ts [A B C] */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'shots/map'); fs.mkdirSync(OUT, { recursive: true });
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B', 'C'];
const PORT = 5207;
const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
for (let i = 0; i < 400 && !/Local:/.test(log); i++) await new Promise((r) => setTimeout(r, 250));
if (!/Local:/.test(log)) console.log('vite:', log.slice(-400));
try {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
  for (const d of dirs) {
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}/tools/ui/mapMock/mock.html?dir=${d}`);
    await page.waitForFunction(() => (window as any).__MOCK_READY, null, { timeout: 180_000 });
    await page.screenshot({ path: path.join(OUT, `mock_${d}.png`) });
    console.log(`mock_${d}.png ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
} finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { srv.kill(); } }
