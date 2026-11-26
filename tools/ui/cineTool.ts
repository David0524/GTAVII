/**
 * Drives the ?cine= tool like a person would, to lay out / refine a scene and export it:
 * open the scene, go to a shot, fly the camera to a mark, set the lens, key it, export via the tool's
 * Export button (captured download) and write it to content/cutscenes/<id>.json. Screenshots the tool.
 *   npx tsx tools/ui/cineTool.ts m01_opening
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const id = process.argv[2] ?? 'm01_opening';
const OUT = path.join(ROOT, 'shots/cine/tool'); fs.mkdirSync(OUT, { recursive: true });

/** The session: [shot, local time, camera position, look-at, lens, focus, stop]. Re-blocking s1's crane over
 *  the park and s5's over-the-shoulder after reviewing the first frames. */
const MARKS: [string, number, [number, number, number], [number, number, number], number, number, number][] = [
  ['s1', 0, [112, 122, -205], [0, 36, 0], 40, 230, 8],
  ['s1', 5, [88, 72, -165], [0, 24, -8], 40, 180, 8],
  ['s1', 9, [58, 27, -118], [-2, 10, -22], 40, 110, 5.6],
  // OTS: 1.3 m behind Teddy along his facing, 0.45 m to his right, so his shoulder sits ~20° off-axis at frame left
  ['s5', 0, [-0.8, 1.74, -19.1], [-22, 1.45, -31.5], 50, 20, 2.8],
  ['s5', 5.6, [-0.82, 1.74, -19.12], [-12, 1.5, -26.5], 50, 9, 2.8],
];

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}/?title=0&quality=high&cine=${id}`);
  await page.waitForFunction(() => (window as any).__CINE?.scene, null, { timeout: 240_000 });
  await page.evaluate((i) => { try { localStorage.removeItem(`t74.cine.${i}`); } catch { /* */ } }, id);
  await page.evaluate(() => (window as any).__T74.whenIdle());
  for (const [shot, t, pos, look, lens, focus, stop] of MARKS) {
    await page.evaluate(({ shot, t, pos, look, lens, focus, stop }) => {
      const c = (window as any).__CINE; const i = c.scene.shots.findIndex((s: any) => s.id === shot);
      c.gotoShot(i, t);
      const d = [look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]], L = Math.hypot(d[0], d[1], d[2]);
      c.fly.pos.set(pos[0], pos[1], pos[2]); c.fly.yaw = Math.atan2(-d[0], -d[2]); c.fly.pitch = Math.asin(d[1] / L);
      c.fly.lens = lens; c.fly.focus = focus; c.fly.fStop = stop;
      c.update(0); c.keyCamera();
    }, { shot, t, pos, look, lens, focus, stop });
    console.log(`keyed ${shot} @ ${t}s`);
  }
  // look at the result in the tool: s5 mid-shot, with the timeline and script visible
  await page.evaluate(() => { const c = (window as any).__CINE; c.gotoShot(c.scene.shots.findIndex((s: any) => s.id === 's5'), 2.5); c.update(0); c.render(); });
  await page.evaluate(() => (window as any).__T74.whenIdle()); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `tool_${id}_s5.png`) });
  await page.evaluate(() => { const c = (window as any).__CINE; c.gotoShot(0, 6); c.update(0); c.render(); });
  await page.evaluate(() => (window as any).__T74.whenIdle()); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `tool_${id}_s1.png`) });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.ct-export')]);
  const file = path.join(ROOT, 'content/cutscenes', `${id}.json`);
  await dl.saveAs(file);
  const errsInFile = await page.evaluate(() => (window as any).__CINE.errors);
  console.log(`exported -> ${path.relative(ROOT, file)} (validation: ${errsInFile.length ? errsInFile.join('; ') : 'ok'})`);
  if (errs.length) console.log('ERRORS', errs);
  await browser.close();
});
process.exit(0);
