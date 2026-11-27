/**
 * Map redesign, direction B: landmark vignettes for the period atlas, drawn from OUR 3D landmarks.
 * Each landmark is captured from an elevated three-quarter view in the running engine, then turned into an
 * ink drawing (edges + ordered-dither tone, fading out at the edges) with ImageMagick. Original art from our own city.
 *   npx tsx tools/ui/mapVignettes.ts            -> shots/map/vig_<id>.png (transparent, sepia ink)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/map'); fs.mkdirSync(path.join(OUT, 'vig_raw'), { recursive: true });
// id, x, z, building height (m): the camera sits south-west and above, looking at ~45% of the height
const LM: [string, number, number, number][] = [
  ['flatiron', 5.7, 19.3, 87], ['macys', -477.8, -951.7, 45], ['kelsey', -710.9, -4.1, 45], ['nylife', 225.1, -313.2, 187],
  ['empire', -131.4, -861.1, 381], ['garden', -788.6, -742.1, 45], ['lifeline', 222.3, -75.2, 213],
];
const only = process.argv.slice(2);

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 520, height: 640 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  const [, x0, z0, h0] = LM[0];
  await page.goto(`${base}/?title=0&quality=high&time=15:40&cam=${x0 - 120},${h0},${z0 + 160},-37,-12`);
  await page.waitForFunction(() => (window as any).__T74?.whenIdle, null, { timeout: 300_000 });
  await page.addStyleTag({ content: 'body > *:not(#app) { display: none !important; }' });
  for (const [id, x, z, h] of LM) {
    if (only.length && !only.includes(id)) continue;
    const t0 = Date.now();
    const d = Math.max(140, h * 1.5), cy = h * 0.75 + 20, ty = h * 0.42;
    // from the south-west (+z is south, -x is west), looking north-east at the building
    const cx = x - d * 0.62, cz = z + d * 0.78;
    const yaw = Math.atan2(-(x - cx), -(z - cz)) * 180 / Math.PI, pitch = Math.atan2(ty - cy, Math.hypot(x - cx, z - cz)) * 180 / Math.PI;
    await page.evaluate(([a, b, c, ya, pi]) => (window as any).__T74.setCamera(a, b, c, ya, pi), [cx, cy, cz, yaw, pitch]);
    await page.evaluate(() => (window as any).__T74.whenIdle());
    await page.waitForTimeout(400);
    const raw = path.join(OUT, 'vig_raw', `${id}.png`);
    await page.screenshot({ path: raw, timeout: 240_000 });
    ink(raw, path.join(OUT, `vig_${id}.png`));
    console.log(`vig_${id}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
});

/** Photo → ink: Canny edges for the linework, an ordered dither for tone, both as sepia ink with alpha, faded by a soft oval. */
function ink(src: string, dst: string) {
  const tmp = (n: string) => path.join(OUT, 'vig_raw', `_${n}.png`);
  execFileSync('convert', [src, '-colorspace', 'Gray', '-canny', '0x1.2+8%+22%', '-negate', '-morphology', 'Erode', 'Disk:0.6', tmp('edge')]);
  execFileSync('convert', [src, '-colorspace', 'Gray', '-level', '8%,82%', '-ordered-dither', 'h6x6a', tmp('tone')]);
  // tone lightened so lines dominate; multiply the two
  execFileSync('convert', [tmp('tone'), '-fill', 'white', '-colorize', '55%', tmp('edge'), '-compose', 'Multiply', '-composite', tmp('mix')]);
  const [w, h] = execFileSync('identify', ['-format', '%w %h', src]).toString().split(' ').map(Number);
  execFileSync('convert', ['-size', `${w}x${h}`, 'radial-gradient:white-black', '-level', '35%,85%', tmp('fade')]);
  // alpha = darkness × fade; colour = sepia ink
  execFileSync('convert', [tmp('mix'), '-negate', tmp('fade'), '-compose', 'Multiply', '-composite', tmp('alpha')]);
  execFileSync('convert', ['-size', `${w}x${h}`, 'xc:#2b2118', tmp('alpha'), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', dst]);
}
