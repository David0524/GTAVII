/**
 * Integration check of the UI inside the real game (index.html), not the lab:
 * title -> New game -> HUD on the street -> pause map -> pockets -> settings. Phone and desktop.
 *   npx tsx tools/ui/gameShots.ts [--out shots/ui/game]
 */
import { chromium, devices, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const OUT = path.join(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'shots/ui/game');
fs.mkdirSync(OUT, { recursive: true });
const PHONE = { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };

async function run(page: Page, size: string, base: string, errs: string[]) {
  const shot = async (n: string) => { await page.waitForTimeout(700); await page.screenshot({ path: path.join(OUT, `${n}_${size}.png`) }); console.log(`  ${n}_${size}`); };
  await page.goto(`${base}/?quality=low${size === 'phone' ? '&touch=1' : ''}`);
  await page.waitForFunction(() => (window as any).__T74?.ui?.state === 'title', null, { timeout: 180_000 });
  await page.waitForSelector('.t74-menu button', { timeout: 600_000 }) // the menu waits for the city to stream: ~145 s on headless SwiftShader since Phase 3;
  await page.evaluate(() => document.fonts.ready);
  await shot('01_title');
  await page.locator('.t74-menu button', { hasText: /new game/i }).click({ noWaitAfter: true, timeout: 120_000 });
  // New game opens on M1's scene: hold skip like a player would (Enter on desktop, the touch button on phones)
  await page.waitForFunction(() => (window as any).__T74.ui.state === 'cutscene', null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await shot('01b_opening_cutscene');
  if (size === 'phone') { const b = page.locator('.cine-skip'); const bb = (await b.boundingBox())!; await page.mouse.move(bb.x + 20, bb.y + 20); await b.dispatchEvent('pointerdown'); await page.waitForFunction(() => (window as any).__T74.ui.state === 'play', null, { timeout: 60_000 }); await b.dispatchEvent('pointerup'); }
  else { await page.keyboard.down('Enter'); await page.waitForFunction(() => (window as any).__T74.ui.state === 'play', null, { timeout: 60_000 }); await page.keyboard.up('Enter'); }
  await page.waitForFunction(() => (window as any).__T74.ui.state === 'play', null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__T74.whenIdle());
  await page.waitForTimeout(2500);
  await shot('02_hud_street');
  await page.evaluate(() => (window as any).__T74.ui.show('map'));
  await shot('03_pause_map');
  await page.evaluate(() => (window as any).__T74.ui.hub.select('settings'));
  await shot('04_settings');
  await page.evaluate(() => (window as any).__T74.ui.hub.select('saves'));
  await shot('05_saves');
  const h = await page.evaluate(() => { const u = (window as any).__T74.ui; return { hud: u.hud.cost.frame, mm: u.hud.minimap.cost.draw }; });
  console.log(`  ${size}: hud ${h.hud.toFixed(3)} ms, minimap ${h.mm.toFixed(3)} ms (EMA, headless SwiftShader CPU)`);
  if (errs.length) console.log(`  ERRORS ${size}:`, errs.join(' | '));
}

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [size, opts] of [['desktop', DESKTOP], ['phone', PHONE]] as const) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage(); const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    try { await run(page, size, base, errs); } catch (e) { console.log(`FAILED ${size}: ${(e as Error).message}`, errs); await page.screenshot({ path: path.join(OUT, `fail_${size}.png`) }); }
    await ctx.close();
  }
  await browser.close();
});
process.exit(0);
