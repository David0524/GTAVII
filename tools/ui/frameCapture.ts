/**
 * Clean game frames (no UI) for the lab's ?bg= backdrop, so menus are reviewed over the real world.
 *   npx tsx tools/ui/frameCapture.ts   ->  shots/ui/frame_<size>.png
 */
import { chromium, devices } from 'playwright';
import path from 'node:path';
import { withServer } from './shots';
const ROOT = path.resolve(import.meta.dirname, '../..');
await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [size, opts] of [['desktop', { viewport: { width: 1600, height: 900 } }], ['phone', { ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]] as const) {
    const ctx = await browser.newContext(opts); const p = await ctx.newPage();
    // a street view up Broadway at golden hour, no title
    await p.goto(`${base}/?title=0&quality=high&time=19:10&cam=4,1.7,-35,12,4`);
    await p.waitForFunction('window.__T74 && window.__T74.whenIdle', null, { timeout: 600_000 });
    await p.evaluate('window.__T74.whenIdle()');
    await p.addStyleTag({ content: 'body > *:not(#app):not(canvas) { display: none !important; } #app > *:not(canvas) { display: none !important; }' });
    await p.waitForTimeout(3000);
    await p.screenshot({ path: path.join(ROOT, `shots/ui/frame_${size}.png`), timeout: 180_000 });
    console.log('frame', size);
    await ctx.close();
  }
  await browser.close();
});
process.exit(0);
