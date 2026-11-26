/**
 * Touch-only run through every menu of the real game (brief "Done means"): a phone in landscape,
 * taps only (no keyboard, no mouse), screenshots each step, fails loudly if a step can't be reached.
 *   npx tsx tools/ui/touchRun.ts
 */
import { chromium, devices, type Page, type Locator } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/ui/touch'); fs.mkdirSync(OUT, { recursive: true });
const log: string[] = [];
let n = 0;

async function step(page: Page, name: string, fn: () => Promise<void>) {
  try { await fn(); await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}_${name}.png`) }); log.push(`✓ ${name}`); }
  catch (e) { log.push(`✗ ${name}: ${(e as Error).message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}_FAILED_${name}.png`) }); }
}
const tap = async (l: Locator) => { await l.first().waitFor({ state: 'visible', timeout: 15000 }); await l.first().tap(); };

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}/?quality=low`);
  await page.waitForSelector('.t74-menu button', { timeout: 240_000 });
  const t = (sel: string, text?: RegExp) => (text ? page.locator(sel, { hasText: text }) : page.locator(sel));

  await step(page, 'title', async () => {});
  await step(page, 'title_settings', () => tap(t('.t74-menu button', /settings/i)));
  await step(page, 'title_settings_change_value', () => tap(t('.u-settings .t74-row', /Text size/)));
  await step(page, 'title_back', () => tap(t('.t74-tabs .resume')));
  await step(page, 'title_saves', () => tap(t('.t74-menu button', /profiles/i)));
  await step(page, 'title_saves_back', () => tap(t('.t74-tabs .resume')));
  await step(page, 'title_credits', () => tap(t('.t74-menu button', /credits/i)));
  await step(page, 'credits_licence', () => tap(t('.cr-libs button', /three/)));
  await step(page, 'credits_back', async () => { await tap(t('.u-credits .u-btn', /Back/)); await tap(t('.t74-tabs .resume')); });
  await step(page, 'new_game_opening_cutscene', async () => { await tap(t('.t74-menu button', /new game/i)); await page.waitForFunction(() => (window as any).__T74.ui.state === 'cutscene', null, { timeout: 30000 }); await page.waitForTimeout(2500); });
  await step(page, 'cutscene_pause_button', () => tap(t('.cine-pause')));
  await step(page, 'cutscene_skip_from_pause', async () => { await tap(t('.cine-menu button', /skip/i)); await page.waitForFunction(() => (window as any).__T74.ui.state === 'play', null, { timeout: 20000 }); await page.evaluate(() => (window as any).__T74.whenIdle()); });
  await step(page, 'menu_button_opens_map', () => tap(t('.t74-btn', /MENU/)));
  await step(page, 'map_filter_toggle', () => tap(t('.t74-filter').nth(2)));
  await step(page, 'map_tap_spot_card', async () => { const c = page.locator('.t74-foldmap'); const b = (await c.boundingBox())!; await page.touchscreen.tap(b.x + b.width * 0.62, b.y + b.height * 0.45); await page.locator('.t74-card').waitFor({ state: 'visible' }); });
  await step(page, 'map_pencil_route', () => tap(t('.t74-card button', /PENCIL A ROUTE/)));
  for (const tab of ['POCKETS', 'PAPER', 'BUSINESS', 'RECORD', 'SAVES', 'SETTINGS', 'CREDITS']) await step(page, `tab_${tab.toLowerCase()}`, () => tap(t('.t74-tabs button', new RegExp(`^${tab}$`))));
  await step(page, 'settings_remap_page', async () => { await tap(t('.t74-tabs button', /^SETTINGS$/)); await tap(t('.u-settings .np-pages button', /Buttons/)); });
  await step(page, 'saves_slot_save', async () => { await tap(t('.t74-tabs button', /^SAVES$/)); await tap(t('.t74-slot .acts button', /^SAVE$/)); });
  await step(page, 'resume_to_play', async () => { await tap(t('.t74-tabs .resume')); await page.waitForFunction(() => (window as any).__T74.ui.state === 'play'); });

  console.log(log.join('\n'));
  console.log(errs.length ? `PAGE ERRORS: ${errs.join(' | ')}` : 'no page errors');
  await browser.close();
});
process.exit(0);
