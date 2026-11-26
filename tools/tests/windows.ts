/**
 * Regression test: lit windows must not change as the camera turns (user report 2026-11-26, iPhone:
 * "the window lights bug out as you look around").
 *
 * A fixed camera at night yaws in small steps. Pure rotation maps every pixel of frame k+1 to a pixel of
 * frame k (a homography), so lit-window pixels should stay lit after re-projection. Measured per pair:
 * the share of lit pixels in frame k+1 whose re-projected position in frame k (+-2 px) is not lit.
 * Lit = warm bright emissive (R high, B low): window lamps, not the sky or mercury street lamps.
 * Clock frozen (?timescale=0), post stack off (no grain or bloom), TV flicker tolerated by the threshold.
 *
 *   npx vite build && npx tsx tools/tests/windows.ts [--dist dir]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = await new Promise<number>((res) => { const srv = net.createServer(); srv.listen(0, () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => res(p)); }); });
const distArg = process.argv.indexOf('--dist');
const DIST = distArg > 0 ? path.resolve(process.argv[distArg + 1]) : null;
const W = 960, H = 540, FOV = 60; // vertical fov at this aspect (no wide-screen adjustment below 2:1)
const STEP = 4; // degrees per step
const N = Number(process.env.WIN_STEPS ?? 7);
const LIMIT = 0.03; // at most 3% of lit pixels may change state between steps
const CAMS = (process.env.WIN_CAM ? [0] : [0, 1]).map((i) => [
  { name: 'madison-sq-north', x: 25, y: 12, z: -150, yaw: 150 },
  { name: 'broadway-30s', x: -230, y: 20, z: -760, yaw: 20 },
][i]);

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock', ...(DIST ? ['--outDir', DIST] : [])], { cwd: ROOT, stdio: 'ignore', detached: true });
  const stop = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } };
  for (let k = 0; k < 120; k++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up */ } await new Promise((r) => setTimeout(r, 500)); }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let fail = 0;
  try {
    for (const cam of CAMS) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      // hide every DOM overlay (clock, place reveal, prompts): only the 3D frame is measured
      await page.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'body > *:not(#app) { display: none !important }'; document.head.appendChild(st); });`);
      page.setDefaultTimeout(300_000);
      await page.goto(`http://localhost:${PORT}/?webgl=1&quality=high&fresh=1&title=0&hud=0&minimap=0&post=0&shadows=0&time=22:30&timescale=0&camrel=1&cam=${cam.x},${cam.y},${cam.z},${cam.yaw},0`);
      await page.waitForFunction(() => (window as any).__T74);
      await page.evaluate(() => (window as any).__T74.whenIdle());
      const masks: Uint8Array[] = []; const yaws: number[] = [];
      for (let s = 0; s < N; s++) {
        await page.evaluate(([c, yaw]) => (window as any).__T74.setCamera(c.x, (window as any).__T74.camera.position.y, c.z, yaw, 0), [cam, cam.yaw + s * STEP] as const);
        await page.evaluate(() => (window as any).__T74.whenIdle());
        await page.waitForTimeout(300);
        const cam3 = await page.evaluate(() => { const c = (window as any).__T74.camera; const e = new (window as any).__T74.THREE.Euler().setFromQuaternion(c.quaternion, 'YXZ'); return { yaw: e.y, pitch: e.x, x: c.position.x, y: c.position.y, z: c.position.z }; });
        yaws.push(cam3.yaw); if (process.env.WIN_DEBUG) console.log('  cam', JSON.stringify(cam3));
        const shot = await page.screenshot(); const b64 = shot.toString('base64');
        if (process.env.WIN_SHOTS) (await import('node:fs')).writeFileSync(path.join(process.env.WIN_SHOTS, `${cam.name}_${s}.png`), shot);
        const m = await page.evaluate(async (b) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b; await img.decode();
          const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, img.width, img.height).data; const out: number[] = new Array(img.width * img.height);
          for (let i = 0; i < out.length; i++) { const r = d[i * 4], gg = d[i * 4 + 1], bb = d[i * 4 + 2]; out[i] = r > 120 && r > bb * 1.5 && gg > 60 ? 1 : 0; }
          return out;
        }, b64);
        masks.push(Uint8Array.from(m));
      }
      // re-project frame k+1 into frame k for a pure yaw of STEP degrees
      const f = (H / 2) / Math.tan((FOV * Math.PI) / 360), d = (STEP * Math.PI) / 180;
      // the engine's yaw sign convention is detected on the first pair (whichever direction re-projects better)
      const compare = (a: Uint8Array, b: Uint8Array, d: number) => {
        let lit = 0, changed = 0;
        for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
          if (!b[y * W + x]) continue;
          const vx = x - W / 2, vy = y - H / 2, vz = f;
          const rx = vx * Math.cos(d) + vz * Math.sin(d), rz = -vx * Math.sin(d) + vz * Math.cos(d);
          if (rz <= 0) continue;
          const px = Math.round((rx / rz) * f + W / 2), py = Math.round((vy / rz) * f + H / 2);
          if (px < 3 || px >= W - 3 || py < 3 || py >= H - 3) continue;
          lit++;
          let hit = false; for (let oy = -2; oy <= 2 && !hit; oy++) for (let ox = -2; ox <= 2; ox++) if (a[(py + oy) * W + px + ox]) { hit = true; break; }
          if (!hit) changed++;
        }
        return { lit, r: lit ? changed / lit : 0 };
      };
      const sign = compare(masks[0], masks[1], d).r <= compare(masks[0], masks[1], -d).r ? 1 : -1;
      let worst = 0;
      for (let s = 0; s + 1 < N; s++) {
        const { lit, r } = compare(masks[s], masks[s + 1], sign * d); worst = Math.max(worst, r);
        console.log(`  ${cam.name} step ${s}->${s + 1}: lit px ${lit}, changed ${(r * 100).toFixed(1)}%`);
      }
      const ok = worst <= LIMIT; if (!ok) fail++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${cam.name}: worst ${(worst * 100).toFixed(1)}% of lit window pixels changed per ${STEP} deg (limit ${LIMIT * 100}%)`);
      await page.close();
    }
  } finally { await browser.close(); stop(); }
  process.exit(fail ? 1 : 0);
}
main();
