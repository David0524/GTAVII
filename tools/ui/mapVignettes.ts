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
// id, x, z, building height (m), view bearing (degrees: 0 = camera south of it, 90 = east, 180 = north): the iconic side
const LM: [string, number, number, number, number][] = [
  ['flatiron', 5.7, 19.3, 87, 170], ['macys', -477.8, -951.7, 45, 200], ['kelsey', -710.9, -4.1, 45, 330], ['nylife', 225.1, -313.2, 187, 60],
  ['empire', -131.4, -861.1, 381, 20], ['garden', -788.6, -742.1, 45, 330], ['lifeline', 222.3, -75.2, 213, 60],
];
const only = process.argv.slice(2);

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 520, height: 640 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  const [, x0, z0, h0] = LM[0] as [string, number, number, number, number];
  await page.goto(`${base}/?title=0&quality=high&time=15:40&cam=${x0 - 120},${h0},${z0 + 160},-37,-12`);
  await page.waitForFunction(() => (window as any).__T74?.whenIdle, null, { timeout: 300_000 });
  await page.addStyleTag({ content: 'body > *:not(#app) { display: none !important; }' });
  for (const [id, x, z, h, bearing] of LM) {
    if (only.length && !only.includes(id)) continue;
    const t0 = Date.now();
    // far enough back that the whole building reads as a silhouette, raised so it stands above its neighbours
    const d = Math.max(230, h * 2.1), cy = h * 0.9 + 55, ty = h * 0.48;
    const b = bearing * Math.PI / 180, cx = x + Math.sin(b) * d, cz = z + Math.cos(b) * d;
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
  execFileSync('convert', [src, '-colorspace', 'Gray', '-blur', '0x0.6', '-canny', '0x1.4+10%+28%', '-negate', '-morphology', 'Erode', 'Disk:0.7', tmp('edge')]);
  // tone: three flat washes (an engraver's light, mid and shadow), well under the line
  execFileSync('convert', [src, '-colorspace', 'Gray', '-blur', '0x1.5', '-level', '10%,85%', '-posterize', '3', tmp('tone')]);
  execFileSync('convert', [tmp('tone'), '-fill', 'white', '-colorize', '62%', tmp('edge'), '-compose', 'Multiply', '-composite', tmp('mix')]);
  const [w, h] = execFileSync('identify', ['-format', '%w %h', src]).toString().split(' ').map(Number);
  execFileSync('convert', ['-size', `${w}x${h}`, 'radial-gradient:white-black', '-level', '35%,85%', tmp('fade')]);
  // alpha = darkness × fade; colour = sepia ink
  execFileSync('convert', [tmp('mix'), '-negate', tmp('fade'), '-compose', 'Multiply', '-composite', tmp('alpha')]);
  execFileSync('convert', ['-size', `${w}x${h}`, 'xc:#2b2118', tmp('alpha'), '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', '-trim', '+repage', dst]);
}
