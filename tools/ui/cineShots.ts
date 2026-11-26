/**
 * Captures frames of a cutscene in the real game: one per shot midpoint plus the blend into gameplay.
 *   npx tsx tools/ui/cineShots.ts [m01_opening] [--size phone|desktop]
 * Seeks the paused timeline, waits for streaming, screenshots; then plays the last 3 s live and
 * captures frames across the hand-back to prove there's no cut and no black frame.
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--')) ?? 'm01_opening';
const size = args.includes('--size') ? args[args.indexOf('--size') + 1] : 'desktop';
const OUT = path.join(ROOT, 'shots/cine', id);
fs.mkdirSync(OUT, { recursive: true });
const opts = size === 'phone'
  ? { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  : { viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 };

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${base}/?title=0&quality=${size === 'phone' ? 'low' : 'high'}&play=${id}&cinepause=1${size === 'phone' ? '&touch=1' : ''}`);
  await page.waitForFunction(() => (window as any).__T74?.ui?.cinema?.tl, null, { timeout: 240_000 });
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => { const c = (window as any).__T74.ui.cinema; return { starts: c.tl.shotStart, durs: c.scene.shots.map((s: any) => s.durationSec), ids: c.scene.shots.map((s: any) => s.id), dur: c.tl.duration }; });
  const frames: [string, number][] = info.ids.map((sid: string, i: number) => [`${String(i + 1).padStart(2, '0')}_${sid}`, info.starts[i] + info.durs[i] * 0.55]);
  frames.splice(1, 0, ['01b_s1_title', 3.2]);
  for (const [name, t] of frames) {
    await page.evaluate((tt) => (window as any).__T74.ui.cinema.seek(tt), t);
    await page.evaluate(() => (window as any).__T74.whenIdle());
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `${name}_${size}.png`) });
    console.log(`${name} @ ${t.toFixed(1)} s`);
  }
  // live blend out: seek 3 s before the end, play, capture through the hand-back
  await page.evaluate((d) => { const c = (window as any).__T74.ui.cinema; c.seek(d - 3); c.setPaused(false); }, info.dur);
  let after = 0;
  for (let k = 0; k < 40 && after < 3; k++) {
    await page.waitForTimeout(700);
    if (await page.evaluate(() => (window as any).__T74.ui.state === 'play')) after++;
    const st = await page.evaluate(() => { const u = (window as any).__T74.ui; return `${u.state} t=${u.cinema.t.toFixed(2)}`; });
    await page.screenshot({ path: path.join(OUT, `90_blend_${k}_${size}.png`) });
    console.log(`blend ${k}: ${st}`);
    if (after === 1) await page.screenshot({ path: path.join(OUT, `99_gameplay_after_blend_${size}.png`) });
  }
  if (errs.length) console.log('ERRORS', errs);
  await browser.close();
});
process.exit(0);
