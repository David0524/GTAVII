/**
 * Discovery notifications (user feedback, 2026-11-27): routine places are silent; content tagged notify:'toast' gets one
 * "Added to map" note; bursts merge; nothing off-mission while a mission runs.  npx tsx tools/ui/notifyCheck.ts [--port N]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const OUT = path.resolve(import.meta.dirname, '../../shots/ui/notify'); fs.mkdirSync(OUT, { recursive: true });
const results: string[] = []; let fails = 0;
const check = (n: string, ok: boolean, x = '') => { results.push(`${ok ? '✓' : '✗'} ${n}${x ? ` (${x})` : ''}`); if (!ok) fails++; console.log(results.at(-1)); };
await withServer(async (base) => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${base}/uilab.html?screen=hud&city=0&waypoint=0&discover=none`);
  await page.waitForFunction(() => (window as any).__UI?.model);
  await page.waitForTimeout(1500);
  const notes = () => page.evaluate(() => [...document.querySelectorAll('.u-note')].map((n) => (n as HTMLElement).innerText.replace(/\s+/g, ' ').trim()));
  const reveal = (ids: string[], via = 'tip') => page.evaluate(([ids, via]) => { const w = window as any; for (const id of ids as string[]) { const pl = w.__UI.model.places.find((q: any) => q.id === id); const v = pl?.reveal.find((r: string) => r !== 'mission') ?? via; w.__UI.model.discovery.reveal(id, v); } }, [ids, via] as const);
  await page.evaluate(() => { (window as any).__UI.host.obj = null; });
  const before = (await notes()).length;
  await reveal(['ui.food.1', 'ui.bar.2', 'ui.shop.3']);
  await page.waitForTimeout(800);
  check('routine places are silent', (await notes()).length === before, JSON.stringify(await notes()));
  await reveal(['loc.bail_bonds']); await page.waitForTimeout(800);
  const n1 = await notes();
  console.log('notes after tagged reveal:', JSON.stringify(n1));
  check('a tagged place gets one "Added to map" note', n1.length === before + 1 && /ADDED TO MAP/i.test(n1.at(-1) ?? '') && /Bail/i.test(n1.at(-1) ?? ''), n1.at(-1));
  await page.screenshot({ path: path.join(OUT, 'one.png') });
  await reveal(['loc.lawyer_office', 'loc.poole_shine', 'loc.galloway_lot']); await page.waitForTimeout(800);
  check('a burst waits while one is showing', (await notes()).length === before + 1);
  await page.waitForTimeout(6000);
  const n2 = await notes();
  console.log('notes after burst:', JSON.stringify(n2));
  check('then merges into one note', /3 places/.test(n2.at(-1) ?? ''), n2.at(-1));
  await page.screenshot({ path: path.join(OUT, 'merged.png') });
  // during a mission: held unless it's that mission's
  await page.evaluate(() => { const w = window as any; w.__UI.host.obj = { text: 'Walk up Broadway with Mayhew', mission: 'm01' }; });
  await page.waitForTimeout(6000);
  const c0 = (await notes()).length;
  await reveal(['loc.lisle_luncheonette']); await page.waitForTimeout(1500);
  check('held during a mission', (await notes()).length <= c0);
  await page.evaluate(() => { (window as any).__UI.host.obj = null; }); await page.waitForTimeout(1500);
  check('shown once the mission ends', /Lisle|luncheonette/i.test((await notes()).join(' ')), (await notes()).at(-1));
  check('no "pencil" wording anywhere on screen', !/pencil/i.test(await page.evaluate(() => document.body.innerText)));
  await b.close();
});
fs.writeFileSync(path.join(OUT, 'RESULT.txt'), results.join('\n') + `\n${fails ? `${fails} FAILED` : 'all passed'}\n`);
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
