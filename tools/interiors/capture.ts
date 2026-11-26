/**
 * Interiors capture rig (headless Chromium, SwiftShader software GL: timings are NOT real-GPU numbers).
 *   npm run build && npx tsx tools/interiors/capture.ts gallery diner 0-29 [--quality high] [--t 14:00]
 *   npx tsx tools/interiors/capture.ts url "<query string>" out.png
 *   npx tsx tools/interiors/capture.ts walk <name>        (scripted walk-in sequences, see WALKS)
 * Output: shots/interiors/...
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const quality = opt('quality', 'high'), t = opt('t', '14:00'), port = +opt('port', '4174');
const W = +opt('w', '1280'), H = +opt('h', '720');

async function withPage<T>(fn: (p: Page) => Promise<T>): Promise<T> {
  const server = spawn(path.join(ROOT, 'node_modules/.bin/vite'), ['preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  try { return await fn(page); } finally { await browser.close(); try { process.kill(-server.pid!, 'SIGTERM'); } catch { server.kill(); } }
}
const url = (q: string) => `http://localhost:${port}/?interiors=1&webgl=1&quality=${quality}&t=${t}&${q}`;

async function shot(page: Page, q: string, file: string, settle = 600) {
  await page.goto(url(q));
  await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
  if (!q.includes('gallery')) await page.evaluate(() => (window as any).__INT.whenIdle());
  await page.waitForTimeout(settle);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
  return page.evaluate(() => { const d = (window as any).__INT; return { label: d.gallery?.label, stats: d.interiors?.stats, draws: d.renderer.info.render.drawCalls, tris: d.renderer.info.render.triangles }; });
}

async function main() {
  const [mode, a, b] = args;
  if (mode === 'gallery') {
    // one page load per kind; interiors are swapped in-page (__INT.show)
    const kinds = a === 'all' ? ['diner', 'coffee_shop', 'bar', 'deli', 'bodega', 'liquor', 'barber', 'beauty', 'pawn', 'laundromat', 'shoe_repair', 'tailor', 'newsstand', 'clothing', 'hardware', 'florist', 'garment_showroom', 'fur_showroom', 'pool_hall', 'gym', 'cinema_lobby', 'tenement', 'sro', 'apartment_lobby', 'office_lobby', 'hotel_lobby', 'loft', 'garage', 'church', 'union_hall'] : a.split(',');
    const [lo, hi] = (b ?? '0-29').split('-').map(Number);
    const view = opt('view', 'door');
    await withPage(async (page) => {
      for (const kind of kinds) {
        await page.goto(url(`gallery=${kind}&n=${lo}&view=${view}`));
        await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
        const meta: unknown[] = [];
        for (let n = lo; n <= (hi ?? lo); n++) {
          const r = await page.evaluate(([k, i, v]) => (window as any).__INT.show(k, i, v), [kind, n, view] as [string, number, string]);
          await page.waitForTimeout(250);
          const file = path.join(ROOT, `shots/interiors/gallery/${kind}/${view === 'door' ? '' : view + '_'}${String(n).padStart(2, '0')}.png`);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file });
          meta.push({ n, ...(r as object) });
        }
        fs.writeFileSync(path.join(ROOT, `shots/interiors/gallery/${kind}/meta${view === 'door' ? '' : '_' + view}.json`), JSON.stringify(meta, null, 1));
        console.log(kind, 'done', meta.length);
      }
    });
  } else if (mode === 'walk') {
    // walk <unitId> <startX,startZ> : frames from 8 m outside to 4 m inside along the door axis
    const [sx, sz] = (b ?? '').split(',').map(Number);
    await withPage(async (page) => {
      await page.goto(url(`at=${sx},${sz},0`));
      await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
      await page.evaluate(() => (window as any).__INT.whenIdle());
      const dir = path.join(ROOT, `shots/interiors/walkin/${a.replace(/[^a-z0-9_.]/gi, '_')}`); fs.mkdirSync(dir, { recursive: true });
      const log: unknown[] = [];
      for (const d of [8, 5, 3, 1.5, 0.5, -0.5, -1.5, -3, -5]) {
        await page.evaluate(([id, dist]) => (window as any).__INT.walkTo(id, dist), [a, d] as [string, number]);
        await page.waitForTimeout(900);
        const st = await page.evaluate(() => { const t = (window as any).__INT; const p = t.player.pos; return { inside: t.interiors.inside(p.x, p.y, p.z), live: t.interiors.stats.live, visCells: t.interiors.stats.visibleCells, draws: t.renderer.info.render.drawCalls, extHidden: t.interiors.exteriorHidden }; });
        const f = path.join(dir, `d${String(d).replace('-', 'm').replace('.', 'p')}.png`); await page.screenshot({ path: f }); log.push({ d, ...st }); console.log(d, JSON.stringify(st));
      }
      fs.writeFileSync(path.join(dir, 'log.json'), JSON.stringify(log, null, 1));
    });
  } else if (mode === 'climb') {
    // climb <unitId> <startX,startZ>: street -> lobby -> each floor's landing (markers) -> roof
    const [sx, sz] = (b ?? '').split(',').map(Number);
    await withPage(async (page) => {
      await page.goto(url(`at=${sx},${sz},0`));
      await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
      await page.evaluate(() => (window as any).__INT.whenIdle());
      const dir = path.join(ROOT, `shots/interiors/climb/${a}`); fs.mkdirSync(dir, { recursive: true });
      await page.evaluate((id) => (window as any).__INT.walkTo(id, 6), a); await page.waitForTimeout(800); await page.screenshot({ path: path.join(dir, '0_street.png') });
      await page.evaluate((id) => (window as any).__INT.walkTo(id, -2.5), a); await page.waitForTimeout(800); await page.screenshot({ path: path.join(dir, '1_lobby.png') });
      const marks = await page.evaluate((id) => (window as any).__INT.interiors.markers(id).filter((m: any) => (m.type === 'hide' && /under stair/.test(m.name)) || (m.type === 'spawn' && m.name === 'roof')), a) as { x: number; y: number; z: number; name: string }[];
      let n = 2;
      for (const m of marks) {
        await page.evaluate(([x, y, z]) => { const t = (window as any).__INT; t.player.teleport(x, y + 0.05, z, t.orbit.yaw); t.orbit.snap({ x, y, z }, t.orbit.yaw); }, [m.x, m.y, m.z]);
        await page.waitForTimeout(700);
        const st = await page.evaluate(() => { const t = (window as any).__INT; const p = t.player.pos; return { y: +p.y.toFixed(1), inside: t.interiors.inside(p.x, p.y, p.z)?.cell ?? 'outside', vis: t.interiors.stats.visibleCells }; });
        await page.screenshot({ path: path.join(dir, `${n++}_${m.name.replace(/\W+/g, '_')}.png`) }); console.log(m.name, JSON.stringify(st));
      }
    });
  } else if (mode === 'grades') {
    // grades <kind> <n>: the same interior at condition 0..4
    await withPage(async (page) => {
      await page.goto(url(`gallery=${a}&n=${b ?? 0}`));
      await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
      for (let g = 0; g <= 4; g++) {
        await page.evaluate(([k, i, gg]) => (window as any).__INT.show(k, i, 'door', gg), [a, +(b ?? 0), g] as [string, number, number]);
        await page.waitForTimeout(300);
        const f = path.join(ROOT, `shots/interiors/grades/${a}_${b ?? 0}_g${g}.png`); fs.mkdirSync(path.dirname(f), { recursive: true }); await page.screenshot({ path: f });
      }
    });
  } else if (mode === 'tierc') {
    // tierc <cam>: frame time with the Tier C window mesh on vs off (SwiftShader: relative cost only)
    await withPage(async (page) => {
      await page.goto(url(`cam=${a}`));
      await page.waitForFunction(() => (window as any).__INT?.ready, null, { timeout: 180_000 });
      await page.evaluate(() => (window as any).__INT.whenIdle());
      const out: Record<string, unknown> = {};
      await page.evaluate(() => (window as any).__INT.renderer.setAnimationLoop(null));
      for (const on of [true, false, true, false]) {
        const st = await page.evaluate(async (v) => {
          const t = (window as any).__INT; t.tierCMesh.visible = v;
          const r = t.renderer, gl = r.backend?.gl as WebGL2RenderingContext | undefined, px = new Uint8Array(4);
          const times: number[] = [];
          for (let i = 0; i < 12; i++) { const t0 = performance.now(); r.render(t.scene, t.camera); gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - t0); }
          times.sort((x, y) => x - y);
          return { medianMs: +times[6].toFixed(1), minMs: +times[0].toFixed(1), windows: t.windows, draws: r.info.render.drawCalls, finish: !!gl };
        }, on);
        out[`${on ? 'on' : 'off'}_${Object.keys(out).length}`] = st; console.log(on ? 'tierC on ' : 'tierC off', JSON.stringify(st));
      }
      fs.writeFileSync(path.join(ROOT, 'docs/interiors/tierC_cost_swiftshader.json'), JSON.stringify({ note: 'SwiftShader software GL in a headless container, 1280x720. Relative only, not GPU ms.', cam: a, ...out }, null, 1));
    });
  } else if (mode === 'url') {
    await withPage(async (page) => { const r = await shot(page, a, path.resolve(ROOT, b)); console.log(r); });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
