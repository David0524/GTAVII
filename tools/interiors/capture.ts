/**
 * Interiors capture rig (headless Chromium, SwiftShader software GL: timings are NOT real-GPU numbers).
 *   npm run build && npx tsx tools/interiors/capture.ts gallery diner 0-29 [--quality high] [--t 14:00]
 *   npx tsx tools/interiors/capture.ts url "<query string>" out.png
 *   npx tsx tools/interiors/capture.ts walk <name>        (scripted walk-in sequences, see WALKS)
 * Output: shots/interiors/...
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const quality = opt('quality', 'high'), t = opt('t', '14:00'), port = +opt('port', '4174');
const W = +opt('w', '1280'), H = +opt('h', '720');

async function withPage<T>(fn: (p: Page) => Promise<T>): Promise<T> {
  const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  try { return await fn(page); } finally { await browser.close(); try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill(); } }
}
const url = (q: string) => `http://localhost:${port}/?interiors=1&webgl=1&quality=${quality}&t=${t}&${q}`;

async function shot(page: Page, q: string, file: string, settle = 600) {
  await page.goto(url(q));
  await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
  if (!q.includes('gallery')) await page.evaluate(() => (window as any).__INT.whenIdle());
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return page.evaluate(() => { const d = (window as any).__INT; return { label: d.gallery?.label, stats: d.interiors?.stats, draws: d.renderer.info.render.drawCalls, tris: d.renderer.info.render.triangles }; });
}

async function main() {
  const [mode, a, b] = args;
  if (mode === 'gallery') {
    const [lo, hi] = (b ?? '0-29').split('-').map(Number);
    await withPage(async (page) => {
      const meta: unknown[] = [];
      for (let n = lo; n <= (hi ?? lo); n++) {
        const file = path.join(ROOT, `shots/interiors/gallery/${a}/${String(n).padStart(2, '0')}.png`);
        const r = await shot(page, `gallery=${a}&n=${n}`, file, 300);
        console.log(a, n, r.label?.split('\n')[0]); meta.push({ n, ...r });
      }
      fs.writeFileSync(path.join(ROOT, `shots/interiors/gallery/${a}/meta.json`), JSON.stringify(meta, null, 1));
    });
  } else if (mode === 'url') {
    await withPage(async (page) => { const r = await shot(page, a, path.resolve(ROOT, b)); console.log(r); });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
