/**
 * Performance tracks in the ?cine= tool (docs/CUTSCENE_PERFORMANCE.md), driven like a person would:
 * select Mayhew, author a look key and a face key through the panel buttons, check the lanes on the timeline,
 * the stand-in's head turning to its look target, and the Mayhew hand-off cue at the end of M1.
 *   npx tsx tools/ui/cinePerf.ts
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/cine/perf'); fs.mkdirSync(OUT, { recursive: true });
const results: string[] = []; let fails = 0;
const check = (name: string, ok: boolean, extra = '') => { results.push(`${ok ? '✓' : '✗'} ${name}${extra ? ` (${extra})` : ''}`); if (!ok) fails++; console.log(results[results.length - 1]); };

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e)));
  // SwiftShader frames take seconds: dispatch DOM clicks (the panel's handlers) instead of waiting on hit-tests
  const click = (sel: string) => page.$eval(sel, (el) => (el as HTMLElement).click());
  await page.goto(`${base}/?title=0&quality=low&cine=m01_opening`);
  await page.waitForFunction(() => (window as any).__CINE?.scene, null, { timeout: 240_000 });
  await page.evaluate(() => { try { localStorage.removeItem('t74.cine.m01_opening'); } catch { /* */ } });
  await page.evaluate(() => (window as any).__T74.whenIdle());
  // s6 at 5 s: the two of them face to face
  await page.evaluate(() => { const c = (window as any).__CINE; c.gotoShot(c.scene.shots.findIndex((s: any) => s.id === 's6'), 5); c.update(0); });
  await click('.ct-act[data-a="mayhew"]');
  check('performance panel opens for the selected actor', await page.locator('.ct-perf').isVisible());
  check('timeline shows six lanes', (await page.locator('.ct-track .pl').count()) === 6);
  const lookDots0 = await page.locator('.ct-track .pl').nth(1).locator('i').count();
  await click('.pf-lane[data-l="look"]');
  await click('.pf-tgt[data-a="camera"]'); // Mayhew glances to the lens at 5 s
  const lookDots1 = await page.locator('.ct-track .pl').nth(1).locator('i').count();
  check('a look key added from the panel shows on the Look lane', lookDots1 === lookDots0 + 1, `${lookDots0} → ${lookDots1}`);
  await click('.pf-lane[data-l="expr"]');
  await page.$eval('.pf-expr', (el) => { (el as HTMLSelectElement).value = 'brow_raise'; });
  await click('.pf-add');
  const tr = await page.evaluate(() => { const c = (window as any).__CINE; return c.scene.shots.find((s: any) => s.id === 's6').actors.mayhew; });
  check('the keys landed in the layout data at the playhead', tr.look.some((k: any) => k.at === 'camera' && Math.abs(k.t - 5) < 0.01) && tr.expr.some((k: any) => k.name === 'brow_raise' && Math.abs(k.t - 5) < 0.01));
  check('still valid after authoring', (await page.evaluate(() => (window as any).__CINE.errors.length)) === 0);
  // stand-in head turn: Teddy at s6 +4 looks at Mayhew, who is off his heading
  const head = await page.evaluate(() => {
    const c = (window as any).__CINE; c.gotoShot(c.scene.shots.findIndex((s: any) => s.id === 's6'), 4); c.update(0);
    const g = c.player.bodies.get('teddy'); return g.userData.head.rotation.y;
  });
  check('stand-in head turns toward its look target', Math.abs(head) > 0.05, `${head.toFixed(2)} rad`);
  await page.evaluate(() => (window as any).__T74.whenIdle()); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'tool_perf_panel.png') });
  // hand-off: stop the scene (as a skip) with commit captured
  const cue = await page.evaluate(() => {
    const c = (window as any).__CINE, h = c.player.host; let got: any = null; const prev = h.commit;
    h.commit = (cue: string, data: any) => { if (cue === 'actor.handoff') got = data; prev?.call(h, cue, data); };
    c.player.stop(true); h.commit = prev; return got;
  });
  check('Mayhew hands off as the companion at his last mark (actor.handoff cue)', !!cue && cue.id === 'mayhew' && cue.after === 'companion' && Number.isFinite(cue.pose.x), cue ? JSON.stringify(cue.pose) : 'no cue');
  if (errs.length) check('no page errors', false, errs.join(' | '));
  await browser.close();
});
fs.writeFileSync(path.join(OUT, 'RESULT.txt'), results.join('\n') + `\n${fails ? `${fails} FAILED` : 'all passed'}\n`);
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
