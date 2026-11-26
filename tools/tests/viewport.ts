/**
 * Regression test: the rendered frame must cover the whole screen after load, rotation and a URL-bar
 * resize on a phone (bug report 2026-11-26: iPhone landscape showed 3D on the left ~45% only).
 *
 * iPhone-class emulation (DPR 3, touch). Resize/orientation events are BLOCKED during the rotate and
 * resize steps to model iOS Safari's worst case (stale innerWidth, no follow-up event): the engine must
 * notice the size change by itself. Checks, per step:
 *   - drawing buffer == canvas client size x renderer pixel ratio (+-1 px), camera aspect matches;
 *   - the page background is painted magenta; >= 98% of columns and rows must contain non-magenta
 *     pixels, i.e. the frame reaches every edge (dark scene content cannot be mistaken for background).
 * Runs the WebGL2 path and the WebGPU path (the report says which backend actually ran). Headless
 * WebGPU runs on SwiftShader, which loses its device on larger frames (buffer limits) even with no
 * resize at all; when that happens the WebGPU coverage check is reported as not measurable and only the
 * size checks (CSS size, drawing buffer, camera aspect) are asserted. Coverage on WebGPU needs a real GPU.
 * Proven against the pre-fix build (b83317d~1): WebGL2 fails 3/4 steps, WebGPU size checks fail 3/4.
 *
 *   npx vite build && npx tsx tools/tests/viewport.ts      (serves dist/ on :4180)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
// a fresh free port every run: a leftover server from an earlier run must never answer for this one
const PORT = await new Promise<number>((res) => { const srv = net.createServer(); srv.listen(0, () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => res(p)); }); });
const distArg = process.argv.indexOf('--dist'); // serve another build, e.g. an old commit's, to prove the test catches the bug
const DIST = distArg > 0 ? path.resolve(process.argv[distArg + 1]) : null;
type Step = { name: string; w: number; h: number };
const STEPS_ALL: Step[] = [
  { name: 'load portrait', w: 430, h: 932 },
  { name: 'rotate to landscape', w: 932, h: 430 },
  { name: 'URL bar resize', w: 932, h: 380 },
  { name: 'rotate back', w: 430, h: 880 },
];
// VP_STEPS=1,2 runs a subset (e.g. start directly in landscape to separate 'resize' from 'big frame')
const STEPS = process.env.VP_STEPS ? process.env.VP_STEPS.split(',').map((i) => STEPS_ALL[Number(i)]) : STEPS_ALL;

async function main() {
  // own process group + --bypass-lock: a leftover preview from an earlier run must not block this one
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock', ...(DIST ? ['--outDir', DIST] : [])], { cwd: ROOT, stdio: 'ignore', detached: true });
  const stopServer = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* already gone */ } };
  for (let k = 0; k < 120; k++) { // wait until the preview server answers (up to 60 s)
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] });
  let failures = 0;
  try {
    for (const mode of (process.env.VP_MODES ?? 'webgl,webgpu').split(',') as ('webgl' | 'webgpu')[]) {
      const ctx = await browser.newContext({ viewport: { width: STEPS[0].w, height: STEPS[0].h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
      // A plain string, not a function: tsx/esbuild injects a __name() helper into compiled functions,
      // which does not exist in the page, so a function init script would throw and block nothing.
      await ctx.addInitScript(`
        const block = (e) => { if (window.__blockResize && !${process.env.VP_NOBLOCK ? 'true' : 'false'}) { window.__blocked = (window.__blocked || 0) + 1; e.stopImmediatePropagation(); } };
        window.addEventListener('resize', block, true);
        window.addEventListener('orientationchange', block, true);
        if (window.visualViewport) window.visualViewport.addEventListener('resize', block, true);
        document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'html,body,#app{background:#ff00ff!important}'; document.head.appendChild(st); });
      `);
      const page = await ctx.newPage();
      let deviceLost = false; // headless SwiftShader WebGPU loses its device on bigger frames (implementation buffer limits)
      page.on('pageerror', (e) => { if (/Instance dropped|createBuffer failed|external Instance reference/.test(e.message)) deviceLost = true; });
      if (process.env.VP_LOG) { page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [${m.type()}] ${m.text().slice(0, 300)}`); }); page.on('pageerror', (e) => console.log('  [pageerror]', e.message)); }
      page.setDefaultTimeout(600_000);
      const q = new URLSearchParams({ quality: 'low', fresh: '1', title: '0', hud: '0', minimap: '0', time: '12:30', timescale: '0', cam: '-8,1.7,-30,14,4', camrel: '1', ...Object.fromEntries(new URLSearchParams(process.env.VP_EXTRA ?? '')), ...(mode === 'webgl' ? { webgl: '1' } : {}) });
      await page.goto(`http://localhost:${PORT}/?${q}`);
      await page.waitForFunction(() => (window as any).__T74);
      await page.evaluate(() => (window as any).__T74.whenIdle());
      const backend = await page.evaluate(() => (window as any).__T74.backend);
      console.log(`[${mode}] bundle ${await page.evaluate(() => (document.querySelector('script[type=module]') as HTMLScriptElement)?.src.split('/').pop())}`);
      for (const [k, st] of STEPS.entries()) {
        if (k > 0) { await page.evaluate(() => { (window as any).__blockResize = true; }); await page.setViewportSize({ width: st.w, height: st.h }); }
        await page.waitForTimeout(Number(process.env.VP_WAIT ?? 1500)); // several frames
        const sizes = await page.evaluate(() => {
          const t = (window as any).__T74; const c = t.renderer.domElement as HTMLCanvasElement; const pr = t.renderer.getPixelRatio();
          return { blocked: (window as any).__blocked ?? 0, style: c.style.width, cw: c.clientWidth, ch: c.clientHeight, bw: c.width, bh: c.height, pr, aspect: t.camera?.aspect ?? null, iw: innerWidth, ih: innerHeight };
        });
        const buf = await page.screenshot();
        if (process.env.VP_SHOTS) (await import('node:fs')).writeFileSync(path.join(process.env.VP_SHOTS, `${mode}_${k}.png`), buf);
        const cover = await page.evaluate(async (b64) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data, W = img.width, H = img.height;
          const col = new Uint8Array(W), row = new Uint8Array(H);
          for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (!(d[i] > 230 && d[i + 1] < 30 && d[i + 2] > 230)) { col[x] = 1; row[y] = 1; } }
          let cs = 0, rs = 0; for (let x = 0; x < W; x += 2) cs += col[x]; for (let y = 0; y < H; y += 2) rs += row[y];
          return { cols: cs / Math.ceil(W / 2), rows: rs / Math.ceil(H / 2) };
        }, buf.toString('base64'));
        const okBuf = Math.abs(sizes.bw - Math.floor(sizes.cw * sizes.pr)) <= 1 && Math.abs(sizes.bh - Math.floor(sizes.ch * sizes.pr)) <= 1;
        const okCss = sizes.cw === st.w && sizes.ch === st.h;
        const okAspect = sizes.aspect == null || Math.abs(sizes.aspect - st.w / st.h) < 0.01;
        // Coverage needs a live device; sizes (CSS, drawing buffer, aspect) are asserted regardless.
        const coverMeasurable = !deviceLost;
        const okCover = !coverMeasurable || (cover.cols >= 0.98 && cover.rows >= 0.98);
        const ok = okBuf && okCss && okAspect && okCover;
        if (!ok) failures++;
        console.log(`${ok ? 'PASS' : 'FAIL'} [${mode}->${backend}] ${st.name} (resize events blocked ${sizes.blocked}, style ${sizes.style || 'css'}) ${st.w}x${st.h}: css ${sizes.cw}x${sizes.ch} buffer ${sizes.bw}x${sizes.bh} @${sizes.pr} aspect ${sizes.aspect?.toFixed(3)} ${coverMeasurable ? `cover cols ${(cover.cols * 100).toFixed(1)}% rows ${(cover.rows * 100).toFixed(1)}%` : 'cover NOT MEASURABLE (headless WebGPU device lost: SwiftShader limit; sizes still checked)'}`);
      }
      await ctx.close();
    }
  } finally { await browser.close(); stopServer(); }
  console.log(failures ? `${failures} FAILED` : 'viewport: all passed');
  process.exit(failures ? 1 : 0);
}
main();
