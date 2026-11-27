/**
 * Map redesign, direction A/C base: an orthographic top-down render of OUR city (rooftops, streets, parks),
 * baked as tiles from the running engine and stitched. North-up in world axes (-z up), like the map.
 *   npx tsx tools/ui/mapAerial.ts [x0 z0 x1 z1] [mPerPx]
 * Output: shots/map/aerial_raw.png (+ tiles). Offline bake for mockups; a shipping version would bake LOD tiles in the build.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/map'); fs.mkdirSync(path.join(OUT, 'tiles'), { recursive: true });
const a = process.argv.slice(2).map(Number);
const [X0, Z0, X1, Z1] = a.length >= 4 ? a : [-1000, -1000, 250, 120];
const MPP = a[4] || 0.5;                // metres per pixel
const TILE_M = 400, TILE_PX = Math.round(TILE_M / MPP);
const nx = Math.ceil((X1 - X0) / TILE_M), nz = Math.ceil((Z1 - Z0) / TILE_M);

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: TILE_PX, height: TILE_PX }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  const cx0 = X0 + TILE_M / 2, cz0 = Z0 + TILE_M / 2;
  await page.goto(`${base}/?title=0&quality=high&post=0&time=15:40&cam=${cx0},90,${cz0},0,-89`);
  await page.waitForFunction(() => (window as any).__T74?.whenIdle, null, { timeout: 300_000 });
  await page.evaluate(() => { document.body.classList.add('map-bake'); const s = document.createElement('style'); s.textContent = 'body > *:not(#app) { display: none !important; }'; document.head.appendChild(s); });
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const cx = X0 + (i + 0.5) * TILE_M, cz = Z0 + (j + 0.5) * TILE_M;
    const t0 = Date.now();
    // stream around the tile: a low camera over its centre (full-detail LODs), then wait for idle
    await page.evaluate(([x, z]) => (window as any).__T74.setCamera(x, 90, z, 0, -89), [cx, cz]);
    await page.evaluate(() => (window as any).__T74.whenIdle());
    // swap the frame's camera for an orthographic one straight down, for two frames, then grab the canvas
    await page.evaluate(([x, z, half]) => {
      const T = (window as any).__T74, THREE = T.THREE, r = T.renderer;
      const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2000);
      cam.position.set(x, 900, z); cam.up.set(0, 0, -1); cam.lookAt(x, 0, z); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      if (!r.__origRender) r.__origRender = r.render;
      r.render = function (scene: unknown) { return r.__origRender.call(r, scene, cam); };
      if (T.scene.fog) { T.__fog = [T.scene.fog.near, T.scene.fog.far]; T.scene.fog.near = 1e5; T.scene.fog.far = 1e6; }
    }, [cx, cz, TILE_M / 2]);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res)))));
    const file = path.join(OUT, 'tiles', `t_${j}_${i}.png`);
    await page.screenshot({ path: file, timeout: 240_000, animations: 'disabled', caret: 'initial' });
    await page.evaluate(() => { const T = (window as any).__T74; T.renderer.render = T.renderer.__origRender; if (T.__fog) { T.scene.fog.near = T.__fog[0]; T.scene.fog.far = T.__fog[1]; } });
    console.log(`tile ${j},${i} @ ${cx},${cz}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await browser.close();
});
// stitch rows then columns
const rows: string[] = [];
for (let j = 0; j < nz; j++) {
  const row = path.join(OUT, 'tiles', `row_${j}.png`);
  execFileSync('convert', [...Array.from({ length: nx }, (_, i) => path.join(OUT, 'tiles', `t_${j}_${i}.png`)), '+append', row]);
  rows.push(row);
}
execFileSync('convert', [...rows, '-append', path.join(OUT, 'aerial_raw.png')]);
fs.writeFileSync(path.join(OUT, 'aerial_raw.json'), JSON.stringify({ x0: X0, z0: Z0, mPerPx: MPP, w: nx * TILE_PX, h: nz * TILE_PX }));
console.log(`aerial_raw.png ${nx * TILE_PX}×${nz * TILE_PX} px, origin ${X0},${Z0}, ${MPP} m/px`);
