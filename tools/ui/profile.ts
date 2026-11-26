/** CPU profile of the lab (self time by function). npx tsx tools/ui/profile.ts "screen=hud&walk=1..." */
import { chromium } from 'playwright';
import { withServer } from './shots';
await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${base}/uilab.html?${process.argv[2] ?? 'screen=hud&walk=1&spin=1&discover=some&touch=1'}`);
  await page.waitForFunction(() => (window as any).__UI);
  await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);
  if (process.argv[3]) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.argv[3]) });
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(5000);
  const { profile } = await cdp.send('Profiler.stop') as any;
  const self = new Map<string, number>(); const total = profile.samples.length;
  const byId = new Map(profile.nodes.map((n: any) => [n.id, n]));
  const counts = new Map<number, number>(); for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
  for (const [id, c] of counts) { const n: any = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + c); }
  console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, c]) => `${(c / total * 100).toFixed(1)}%  ${k}`).join('\n'));
  await browser.close();
});
process.exit(0);
