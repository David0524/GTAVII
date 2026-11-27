/**
 * Character load time on an emulated phone (Playwright Pixel 7 profile, throttled network).
 *   npx tsx tools/characters/loadtime.ts [--base http://localhost:5701] [--down 12] [--rtt 70]
 * Measures navigation -> window.__CHAR.ready for scene=leads at quality=low and high, plus the bytes
 * the characters module fetched. Headless Chromium renders with SwiftShader (CPU), so shader compile
 * and frame times are pessimistic; the network part (bytes / bandwidth + RTTs) is what transfers to
 * a real phone. Down/up in Mbit/s; the default ~12/4 Mbit/s with 70 ms RTT is a middling 4G link.
 */
import { chromium, devices } from 'playwright';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = arg('base', 'http://localhost:5701'), down = +arg('down', '12'), rtt = +arg('rtt', '70');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const quality of ['low', 'high']) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rtt, downloadThroughput: (down * 1e6) / 8, uploadThroughput: (4e6) / 8 });
  let charBytes = 0, allBytes = 0;
  cdp.on('Network.loadingFinished', (e: any) => { allBytes += e.encodedDataLength; });
  const urls = new Map<string, string>();
  cdp.on('Network.responseReceived', (e: any) => urls.set(e.requestId, e.response.url));
  cdp.on('Network.loadingFinished', (e: any) => { if (/\/characters\//.test(urls.get(e.requestId) ?? '')) charBytes += e.encodedDataLength; });
  const t0 = Date.now();
  await page.goto(`${base}/?characters=1&scene=leads&quality=${quality}&t=1&webgl=1`, { waitUntil: 'load', timeout: 600000 });
  await page.waitForFunction(() => (window as any).__CHAR?.ready, null, { timeout: 600000 });
  const t = (Date.now() - t0) / 1000;
  const net = (charBytes * 8) / (down * 1e6);
  console.log(JSON.stringify({ quality, down_Mbps: down, rtt_ms: rtt, ready_s: +t.toFixed(1), characterBytes_MB: +(charBytes / 1e6).toFixed(2), allBytes_MB: +(allBytes / 1e6).toFixed(2), characterTransfer_s_at_link: +net.toFixed(1) }));
  await ctx.close();
}
await browser.close();
