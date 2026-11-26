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
    // one page load per kind; interiors are swapped in-page (__INT.show)
    const kinds = a === 'all' ? ['diner', 'coffee_shop', 'bar', 'deli', 'bodega', 'liquor', 'barber', 'beauty', 'pawn', 'laundromat', 'shoe_repair', 'tailor', 'newsstand', 'clothing', 'hardware', 'florist', 'garment_showroom', 'fur_showroom', 'pool_hall', 'gym', 'cinema_lobby', 'tenement', 'sro', 'apartment_lobby', 'office_lobby', 'hotel_lobby', 'loft', 'garage', 'church', 'union_hall'] : a.split(',');
    const [lo, hi] = (b ?? '0-29').split('-').map(Number);
    const view = opt('view', 'door');
    await withPage(async (page) => {
      for (const kind of kinds) {
        await page.goto(url(`gallery=${kind}&n=${lo}&view=${view}`));
        await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
        const meta: unknown[] = [];
        for (let n = lo; n <= (hi ?? lo); n++) {
          const r = await page.evaluate(([k, i, v]) => (window as any).__INT.show(k, i, v), [kind, n, view] as [string, number, string]);
          await page.waitForTimeout(250);
          const file = path.join(ROOT, `shots/interiors/gallery/${kind}/${view === 'door' ? '' : view + '_'}${String(n).padStart(2, '0')}.png`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file });
          meta.push({ n, ...(r as object) });
        }
        fs.writeFileSync(path.join(ROOT, `shots/interiors/gallery/${kind}/meta${view === 'door' ? '' : '_' + view}.json`), JSON.stringify(meta, null, 1));
        console.log(kind, 'done', meta.length);
      }
    });
  } else if (mode === 'url') {
    await withPage(async (page) => { const r = await shot(page, a, path.resolve(ROOT, b)); console.log(r); });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
