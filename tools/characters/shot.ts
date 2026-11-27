/**
 * Screenshot helper for the ?characters=1 scenes (headless Chromium, SwiftShader WebGL2).
 *   npx tsx tools/characters/shot.ts --url "/?characters=1&scene=lineup" --out shots/characters/x.png [--w 1600 --h 900] [--wait 4000]
 * Starts a Vite dev server on a free port unless --base is given.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(import.meta.dirname, '../..');
const urls = arg('url', '/?characters=1').split('|');
const outs = arg('out', 'shots/characters/test.png').split('|');
const W = +arg('w', '1600'), H = +arg('h', '900');
let base = arg('base', '');
let server: ReturnType<typeof spawn> | null = null;
if (!base) {
  const port = 5600 + Math.floor(Math.random() * 300);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  base = `http://localhost:${port}`;
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('vite did not start')), 60000);
    server!.stdout!.on('data', (d: Buffer) => { if (/Local:/.test(d.toString())) { clearTimeout(t); res(); } });
  });
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (let i = 0; i < urls.length; i++) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const logs: string[] = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const u = urls[i].includes('webgl') ? urls[i] : urls[i] + (urls[i].includes('?') ? '&' : '?') + 'webgl=1';
    await page.goto(base + u, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => (window as any).__CHAR?.ready, null, { timeout: +arg('timeout', '240000') }).catch((e) => { console.log('timeout; logs:', logs.join('\n')); throw e; });
    await page.waitForTimeout(+arg('wait', '1500'));
    const out = path.resolve(ROOT, outs[i] ?? outs[0]);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out, timeout: 180000 });
    const report = await page.evaluate(() => (window as any).__CHAR?.report ?? null);
    if (report) fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(report, null, 2));
    console.log('shot', out, report ? JSON.stringify(report).slice(0, 400) : '');
    for (const l of logs.filter((l) => !/\[(debug|log)\]/.test(l) || /CHAR/.test(l)).slice(0, 30)) console.log('  ', l);
    await page.close();
  }
} finally {
  await browser.close();
  server?.kill();
}
