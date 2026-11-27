/** Run a JS expression in the lab and print the result: npx tsx tools/ui/probe.ts "<query>" "<expr>" */
import { chromium } from 'playwright';
import { withServer } from './shots';
await withServer(async (base) => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 844, height: 390 } });
  p.on('pageerror', (e) => console.log('pageerror', e));
  await p.goto(`${base}/uilab.html?${process.argv[2]}`);
  await p.waitForFunction(() => (window as any).__UI);
  await p.waitForTimeout(1500);
  console.log(JSON.stringify(await p.evaluate(process.argv[3]), null, 1));
  await b.close();
});
process.exit(0);
