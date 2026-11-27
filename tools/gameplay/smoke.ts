/** Quick look at the ?gameplay=1 scene: npx tsx tools/gameplay/smoke.ts [station] [out.png] */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const station = process.argv[2] ?? 'lot';
const out = process.argv[3] ?? 'smoke.png';
const extra = process.argv[4] ?? ''; // e.g. '&content=narrative'
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'pipe' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs: string[] = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
const t0 = Date.now(); const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);
await page.goto(`http://localhost:4174/?gameplay=1&webgl=1&quality=low&station=${station}${extra}`);
try {
  await page.waitForFunction(() => (window as any).__GP, null, { timeout: 90000 }); log('scene up');
  await Promise.race([page.evaluate(() => (window as any).__GP.ready()), page.waitForTimeout(60000)]); log('ready');
  await page.waitForTimeout(1500);
} catch (e) { logs.push(String(e)); }
log('shooting'); await page.screenshot({ path: out, timeout: 120000 }); log('shot');
console.log(await page.evaluate(() => JSON.stringify((window as any).__GP?.timings())));
console.log(logs.slice(-30).join('\n'));
await browser.close(); server.kill();
