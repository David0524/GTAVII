/**
 * UI screenshot + perf rig over uilab.html.
 *   npx tsx tools/ui/shots.ts [--only name,name] [--port 5199] [--out shots/ui]
 * Starts a Vite dev server, opens each shot at phone-landscape and/or desktop size, waits for the
 * lab (and the city, when ?city=1) to settle, runs optional page actions, and saves PNGs.
 * Perf mode (--perf): measures HUD+minimap CPU per frame with CPU throttling (mobile approximation).
 */
import { chromium, devices, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, arg('out', 'shots/ui'));
const PORT = Number(arg('port', '5199'));
const only = arg('only', '').split(',').filter(Boolean);
fs.mkdirSync(OUT, { recursive: true });

type Size = 'phone' | 'desktop';
export interface Shot { name: string; q: string; sizes?: Size[]; act?: (p: Page) => Promise<void>; wait?: number }

const PHONE = { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };

export async function withServer<T>(fn: (base: string) => Promise<T>): Promise<T> {
  const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 60 && !/Local:/.test(log); i++) await new Promise((r) => setTimeout(r, 250));
  try { return await fn(`http://localhost:${PORT}`); } finally { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { srv.kill(); } }
}

export async function capture(shots: Shot[]) {
  return withServer(async (base) => {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const results: Record<string, unknown> = {};
    for (const s of shots) {
      if (only.length && !only.includes(s.name)) continue;
      for (const size of s.sizes ?? ['phone', 'desktop']) {
        const ctx = await browser.newContext(size === 'phone' ? PHONE : DESKTOP);
        const page = await ctx.newPage();
        const errs: string[] = [];
        page.on('pageerror', (e) => errs.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
        const q = s.q + (size === 'phone' ? '&touch=1' : '');
        const t0 = Date.now();
        await page.goto(`${base}/uilab.html?${q}${/city=1/.test(q) ? '' : '&bg=frame'}`, { waitUntil: 'load' }); // menus judged over a real game frame
        await page.waitForFunction(() => (window as unknown as { __UI?: unknown }).__UI, null, { timeout: 120_000 });
        await page.evaluate(() => (window as unknown as { __UI: { ready: Promise<void> } }).__UI.ready);
        await page.evaluate(() => document.fonts.ready);
        if (s.act) await s.act(page);
        await page.waitForTimeout(s.wait ?? 900);
        const file = path.join(OUT, `${s.name}_${size}.png`);
        await page.screenshot({ path: file, timeout: 180_000 });
        results[`${s.name}_${size}`] = { ms: Date.now() - t0, errors: errs };
        console.log(`${s.name}_${size}: ${Date.now() - t0} ms${errs.length ? `  ERRORS: ${errs.join(' | ')}` : ''}`);
        await ctx.close();
      }
    }
    await browser.close();
    return results;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { SHOTS } = await import('./shotList');
  await capture(SHOTS);
  process.exit(0);
}
