/**
 * Map redesign, direction A: an orthographic top-down bake of OUR city from the running engine. v2 renders TWO passes
 * per 400 m tile from the same ortho camera:
 *   (a) colour at a high sun (screenshot of the canvas, shadows off, exposure lifted: tar roofs must not go black),
 *   (b) height: scene.overrideMaterial = a basic node material writing world-space Y, rendered to a float
 *       render target (no MSAA, no tone map, no sRGB: exact metres), read back and saved as uint16.
 * The tiles are stitched and graded by tools/ui/mapComposite.py, which also cuts the tile pyramid.
 *
 *   npx tsx tools/ui/mapAerial.ts --bounds -1412,-1794,333,212 --mpp 0.5 --engine /tmp/eng-bake --port 5201 \
 *       [--time 13:30] [--out shots/map/v2] [--exposure 2.4] [--only j,i;j,i] [--force]
 * Output (OUT = shots/map/v2): col_{j}_{i}.png, hgt_{j}_{i}.u16 (little-endian uint16, row 0 = north),
 * bake.json {x0,z0,mPerPx,tileM,tilePx,nx,nz,hMin,hRange,time}. Height decode: metres = q / 65535 * hRange + hMin.
 * Resumable: existing tiles are skipped unless --force. A failed tile is retried (3 attempts, fresh page) and
 * the run exits non-zero if any tile still fails. The engine dir is a separate checkout (vite refuses two dev
 * servers in one directory) with node_modules symlinked; bounds are arguments so the bake can be re-run when
 * the playable area widens.
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k: string) => args.includes(`--${k}`);

const [X0, Z0, X1, Z1] = arg('bounds', '-1412,-1794,333,212').split(',').map(Number);
const MPP = Number(arg('mpp', '0.5'));
const ENGINE = path.resolve(arg('engine', '/tmp/eng-bake'));
const PORT = Number(arg('port', '5201'));
const TIME = arg('time', '13:30');
const EXPOSURE = Number(arg('exposure', '2.4'));
const OUT = path.resolve(ROOT, arg('out', 'shots/map/v2'));
const only = arg('only', '').split(';').filter(Boolean).map((s) => s.split(',').map(Number));
const TILE_M = 400, TILE_PX = Math.round(TILE_M / MPP);
const nx = Math.ceil((X1 - X0) / TILE_M), nz = Math.ceil((Z1 - Z0) / TILE_M);
// height range stored in the u16 tiles (world Y, metres): Empire State tip is ~ 381 m + base
const H_MIN = -30, H_RANGE = 530;
fs.mkdirSync(OUT, { recursive: true });

async function startServer(): Promise<() => void> {
  const srv = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ENGINE, stdio: 'pipe', detached: true });
  let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
  for (let i = 0; i < 120 && !/Local:/.test(log); i++) await new Promise((r) => setTimeout(r, 250));
  if (!/Local:/.test(log)) throw new Error('vite did not start:\n' + log);
  return () => { try { process.kill(-srv.pid!, 'SIGTERM'); } catch { srv.kill(); } };
}

async function openPage(base: string, cx: number, cz: number) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: TILE_PX, height: TILE_PX }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(`${base}/?title=0&quality=high&post=0&time=${TIME}&timescale=0&cam=${cx},90,${cz},0,-89`);
  await page.waitForFunction(() => (window as any).__T74?.whenIdle, null, { timeout: 300_000 });
  await page.evaluate(() => { const s = document.createElement('style'); s.textContent = 'body > *:not(#app) { display: none !important; }'; document.head.appendChild(s); });
  // one-off setup: the sun's shadow map only follows a 160 m window, so it would stamp a square of shadow into each tile. Off.
  await page.evaluate(() => {
    const T = (window as any).__T74;
    T.scene.traverse((o: any) => { if (o.isDirectionalLight) o.castShadow = false; });
  });
  return { browser, page };
}

async function bakeTile(page: Page, j: number, i: number) {
  const cx = X0 + (i + 0.5) * TILE_M, cz = Z0 + (j + 0.5) * TILE_M;
  await page.evaluate(([x, z]) => (window as any).__T74.setCamera(x, 90, z, 0, -89), [cx, cz]);
  await page.evaluate(() => (window as any).__T74.whenIdle());
  // ---- (a) colour: ortho camera straight down, far fog, lifted exposure, patched into every render call
  await page.evaluate(([x, z, half, exposure]) => {
    const T = (window as any).__T74, THREE = T.THREE, r = T.renderer;
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 1, 2000);
    cam.position.set(x, 900, z); cam.up.set(0, 0, -1); cam.lookAt(x, 0, z); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
    T.__cam = cam;
    if (!r.__origRender) r.__origRender = r.render;
    r.render = function (scene: unknown) { r.toneMappingExposure = exposure; return r.__origRender.call(r, scene, cam); };
    if (T.scene.fog) { T.__fog = [T.scene.fog.near, T.scene.fog.far]; T.scene.fog.near = 1e5; T.scene.fog.far = 1e6; }
  }, [cx, cz, TILE_M / 2, EXPOSURE]);
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(res)))));
  const colFile = path.join(OUT, `col_${j}_${i}.png`);
  await page.screenshot({ path: colFile + '.tmp.png', timeout: 240_000, animations: 'disabled', caret: 'initial' });
  fs.renameSync(colFile + '.tmp.png', colFile);
  // ---- (b) height: override material -> float render target, read back
  const b64: string = await page.evaluate(async ([px, hMin, hRange]) => {
    const T = (window as any).__T74, THREE = T.THREE, r = T.renderer, scene = T.scene;
    const TSL = THREE.TSL;
    if (!T.__hmat) {
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = TSL.vec4(TSL.positionWorld.y, 0, 0, 1);
      m.toneMapped = false; m.fog = false; m.side = THREE.DoubleSide; m.transparent = false;
      T.__hmat = m;
    }
    if (!T.__rt || T.__rt.width !== px) {
      T.__rt = new THREE.RenderTarget(px, px, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true, samples: 0, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    }
    const saved = { ov: scene.overrideMaterial, bg: scene.background, env: scene.environment, rt: r.getRenderTarget(), cc: new THREE.Color(), ca: r.getClearAlpha(), vis: [] as any[] };
    r.getClearColor(saved.cc);
    // hide the sky dome / twilight shell (huge, would never clip against the ortho far plane in every backend)
    scene.traverse((o: any) => { if (o.isMesh && o.visible && o.geometry && (o.geometry.boundingSphere?.radius ?? (o.geometry.computeBoundingSphere(), o.geometry.boundingSphere.radius)) * Math.max(o.scale.x, 1) > 5000) { saved.vis.push(o); o.visible = false; } });
    let data: Float32Array | null = null;
    try {
      for (let k = 0; k < 2; k++) { // first pass lets the pipeline compile; keep the second
        scene.overrideMaterial = T.__hmat; scene.background = null; scene.environment = null;
        r.setRenderTarget(T.__rt); r.setClearColor(0x000000, 0);
        r.__origRender.call(r, scene, T.__cam);
        r.setRenderTarget(saved.rt); scene.overrideMaterial = saved.ov; scene.background = saved.bg; scene.environment = saved.env; r.setClearColor(saved.cc, saved.ca);
        data = await r.readRenderTargetPixelsAsync(T.__rt, 0, 0, px, px);
      }
    } finally {
      r.setRenderTarget(saved.rt); scene.overrideMaterial = saved.ov; scene.background = saved.bg; scene.environment = saved.env; r.setClearColor(saved.cc, saved.ca);
      for (const o of saved.vis) o.visible = true;
      r.render = r.__origRender; // restored below by the caller's cleanup too
    }
    const out = new Uint16Array(px * px);
    let mn = 1e9, mx = -1e9;
    for (let n = 0; n < px * px; n++) { const row = Math.floor(n / px), colm = n - row * px; const h = data![((px - 1 - row) * px + colm) * 4]; mn = Math.min(mn, h); mx = Math.max(mx, h); out[n] = Math.max(0, Math.min(65535, Math.round((h - hMin) / hRange * 65535))); }
    T.__hstat = [mn, mx];
    const u8 = new Uint8Array(out.buffer); let s = ''; const CH = 0x8000;
    for (let n = 0; n < u8.length; n += CH) s += String.fromCharCode.apply(null, u8.subarray(n, n + CH) as any);
    return btoa(s);
  }, [TILE_PX, H_MIN, H_RANGE]);
  const stat = await page.evaluate(() => (window as any).__T74.__hstat);
  const hFile = path.join(OUT, `hgt_${j}_${i}.u16`);
  fs.writeFileSync(hFile + '.tmp', Buffer.from(b64, 'base64'));
  fs.renameSync(hFile + '.tmp', hFile);
  // ---- restore everything
  await page.evaluate(() => { const T = (window as any).__T74; T.renderer.render = T.renderer.__origRender; if (T.__fog) { T.scene.fog.near = T.__fog[0]; T.scene.fog.far = T.__fog[1]; } });
  return stat as [number, number];
}

const todo: [number, number][] = [];
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  if (only.length && !only.some(([a, b]) => a === j && b === i)) continue;
  if (!flag('force') && fs.existsSync(path.join(OUT, `col_${j}_${i}.png`)) && fs.existsSync(path.join(OUT, `hgt_${j}_${i}.u16`))) continue;
  todo.push([j, i]);
}
fs.writeFileSync(path.join(OUT, 'bake.json'), JSON.stringify({ x0: X0, z0: Z0, mPerPx: MPP, tileM: TILE_M, tilePx: TILE_PX, nx, nz, hMin: H_MIN, hRange: H_RANGE, time: TIME, exposure: EXPOSURE }));
console.log(`bake ${X0},${Z0} .. ${X1},${Z1} @ ${MPP} m/px: ${nx}x${nz} tiles, ${todo.length} to do, time ${TIME}, engine ${ENGINE}`);
const stop = await startServer();
const base = `http://localhost:${PORT}`;
const t00 = Date.now();
const failed: string[] = [];
try {
  let ctx: Awaited<ReturnType<typeof openPage>> | null = null;
  for (const [j, i] of todo) {
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      const t0 = Date.now();
      try {
        if (!ctx) ctx = await openPage(base, X0 + (i + 0.5) * TILE_M, Z0 + (j + 0.5) * TILE_M);
        const st = await bakeTile(ctx.page, j, i);
        console.log(`tile ${j},${i} (attempt ${attempt}): ${((Date.now() - t0) / 1000).toFixed(1)} s, height ${st[0].toFixed(1)}..${st[1].toFixed(1)} m`);
        ok = true;
      } catch (e) {
        console.log(`tile ${j},${i} attempt ${attempt} FAILED: ${String(e).split('\n')[0]}`);
        try { await ctx?.browser.close(); } catch { /* */ }
        ctx = null;
      }
    }
    if (!ok) failed.push(`${j},${i}`);
  }
  try { await ctx?.browser.close(); } catch { /* */ }
} finally { stop(); }
console.log(`done in ${((Date.now() - t00) / 60000).toFixed(1)} min${failed.length ? '; FAILED: ' + failed.join(' ') : ''}`);
process.exit(failed.length ? 1 : 0);
