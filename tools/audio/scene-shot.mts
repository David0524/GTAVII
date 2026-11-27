/** Screenshot of the ?audio=1 test scene (npx tsx tools/audio/scene-shot.mts) -> shots/audio/test_scene.png. */
import { createServer } from 'vite';
import { chromium } from 'playwright';
const server = await createServer({ server: { port: 5195, host: '127.0.0.1', hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' }); await server.listen();
const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
const errs: string[] = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('http://127.0.0.1:5195/?audio=1&quality=high');
await p.waitForSelector('#ats-gate:text("TAP TO START AUDIO")', { timeout: 90000 });
await p.click('#ats-gate');
await p.waitForTimeout(6000);
await p.getByRole('button', { name: 'rain', exact: true }).click(); await p.getByRole('button', { name: 'passing car', exact: true }).click();
await p.waitForTimeout(4000);
await p.screenshot({ path: 'shots/audio/test_scene.png' });
console.log(errs.join('\n') || 'no errors');
console.log(await p.evaluate(() => document.querySelector('#ats pre')?.textContent));
await b.close(); await server.close();
