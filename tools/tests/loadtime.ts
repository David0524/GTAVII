/**
 * Load-time budget test (bug report 2026-11-26: "?webgl=1 takes a very long time to load").
 *
 * Headless Chromium + SwiftShader (CPU rasteriser), WebGL2 backend, Low preset, 932x430 landscape at DPR 1:
 *   1. time to title-ready (menu shown),
 *   2. click "New game": time from the click until the player is live on the street ('playable').
 * Budgets are for this headless PROXY, where every frame costs ~1.5 s of software rendering (a phone GPU
 * renders the same frame in ~16-40 ms). Target on a mid-range phone: interactive < 5 s. The proxy limits
 * below fail the build on a regression of the old kind (title waited for ~114 chunks = 137 s here).
 *
 *   npx vite build && npx tsx tools/tests/loadtime.ts   (serves dist/ on :4182)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
// a fresh free port every run: a leftover server from an earlier run must never answer for this one
const PORT = await new Promise<number>((res) => { const srv = net.createServer(); srv.listen(0, () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => res(p)); }); });
const BUDGET = { titleReady: 15_000, newGameToFirstFrame: 3_000 }; // ms, headless proxy (first frame = cutscene or play)

async function main() {
  // own process group + --bypass-lock: a leftover preview from an earlier run must not block this one
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock'], { cwd: ROOT, stdio: 'ignore', detached: true });
  const stopServer = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* already gone */ } };
  for (let k = 0; k < 120; k++) { // wait until the preview server answers (up to 60 s)
    try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let fail = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 932, height: 430 } });
    page.setDefaultTimeout(180_000);
    await page.goto(`http://localhost:${PORT}/?webgl=1&quality=low&fresh=1`);
    await page.waitForFunction(() => (window as any).__T74?.load.marks.some(([n]: [string]) => n === 'title-ready'));
    // click via the DOM: Playwright's actionability wait (stable across 2 frames) costs ~15 s at 1.5 s/frame
    await page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith('New game'))!.click());
    // New Game opens the M1 opening cutscene (UI); its first frame is the responsiveness budget. Then hold
    // Enter to skip it (UI: hold-to-skip) and require play to start.
    await page.waitForFunction(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'playable' || n === 'cutscene'));
    if (await page.evaluate(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'cutscene'))) {
      // the skip is only accepted once the cutscene is running (its first frames load content): hold in bursts
      for (let k = 0; k < 15 && !(await page.evaluate(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'playable'))); k++) {
        await page.keyboard.down('Enter'); await page.waitForTimeout(4000); await page.keyboard.up('Enter'); await page.waitForTimeout(500);
      }
    }
    await page.waitForFunction(() => (window as any).__T74.load.marks.some(([n]: [string]) => n === 'playable'));
    const r = await page.evaluate(() => { const l = (window as any).__T74.load; return { marks: Object.fromEntries(l.marks), text: l.text() }; });
    console.log(r.text);
    for (const [k, lim] of Object.entries(BUDGET)) {
      const t = k === 'titleReady' ? r.marks['title-ready'] : (r.marks['cutscene'] ?? r.marks['playable']) - r.marks['new-game'];
      const ok = t <= lim; if (!ok) fail++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${k} ${(t / 1000).toFixed(1)} s (budget ${(lim / 1000).toFixed(0)} s headless proxy)`);
    }
  } finally { await browser.close(); stopServer(); }
  process.exit(fail ? 1 : 0);
}
main();
