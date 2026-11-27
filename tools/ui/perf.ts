/**
 * HUD + minimap CPU per frame (budget: <= 0.5 ms on mobile Low). Real rAF frames in the lab with the
 * mock player walking and turning, under Chrome CPU throttling (1x and 4x; 4x approximates a mid-range
 * phone). Headless Chromium with SwiftShader: Canvas2D rasterises on the CPU here, which is pessimistic
 * vs a phone GPU. Reports p50/p95/max of ui.update() wall time per frame.
 *   npx tsx tools/ui/perf.ts
 */
import { chromium } from 'playwright';
import { withServer } from './shots';

const CASES = [
  { name: 'walk, quiet', q: 'screen=hud&walk=1&spin=1&discover=some' },
  { name: 'walk, pursuit (cones + radio)', q: 'screen=hud&walk=1&spin=1&discover=some&heat=pursuit' },
  { name: 'walk, all places known', q: 'screen=hud&walk=1&spin=1&discover=all' },
];
const pct = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const rows: string[] = [];
  for (const rate of [1, 4]) for (const c of CASES) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${base}/uilab.html?${c.q}&touch=1`);
    await page.waitForFunction(() => (window as any).__UI);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { (window as any).__UI.samples.length = 0; });
    await page.waitForTimeout(6000);
    const s: number[] = await page.evaluate(() => [...(window as any).__UI.samples]);
    const mm = await page.evaluate(() => { const m = (window as any).__UI.ui.hud.minimap.cost; return `${m.drawn} drawn / ${m.skipped} skipped`; });
    rows.push(`| ${rate}x | ${c.name} | ${s.length} | ${pct(s, 0.5).toFixed(3)} | ${pct(s, 0.95).toFixed(3)} | ${Math.max(...s).toFixed(2)} | ${mm} |`);
    console.log(rows[rows.length - 1]);
    await ctx.close();
  }
  console.log('\n| CPU throttle | case | frames | p50 ms | p95 ms | max ms | minimap redraws |\n|---|---|---|---|---|---|---|\n' + rows.join('\n'));
  await browser.close();
});
process.exit(0);
