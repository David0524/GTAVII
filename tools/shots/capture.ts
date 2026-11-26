/**
 * Headless screenshot rig: serves the built game, visits fixed viewpoints, waits for
 * streaming to settle, captures PNGs + frame-time stats into shots/<phase>/.
 *   npm run build && npm run shots -- --phase phase1 [--webgl] [--quality high]
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const phase = arg('phase', 'phase1');
const quality = arg('quality', 'high');
const forceWebGL = args.includes('--webgl');
const ROOT = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(ROOT, 'shots', phase);
fs.mkdirSync(outDir, { recursive: true });
const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8'));
const hero = (n: string) => world.heroes.find((h: any) => h.name === n);
const look = (from: [number, number, number], to: [number, number, number]) => {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  return `${from.join(',')},${yaw.toFixed(2)},${pitch.toFixed(2)}`;
};
const streets = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/streets.json'), 'utf8')) as { n: string; p: number[] }[];
/** Nearest point on a named street centreline to (x,z): keeps viewpoints in the roadway, never inside a building. */
const on = (name: string, x: number, z: number, y = 1.8): [number, number, number] => {
  let best = Infinity, out: [number, number, number] = [x, y, z];
  for (const s of streets) if (s.n === name) for (let k = 2; k < s.p.length; k += 2) {
    const ax = s.p[k - 2], az = s.p[k - 1], dx = s.p[k] - ax, dz = s.p[k + 1] - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < best) { best = d; out = [+px.toFixed(1), y, +pz.toFixed(1)]; }
  }
  if (!Number.isFinite(best)) throw new Error(`street not found: ${name}`);
  return out;
};
const esb = hero('Empire State Building'), macys = hero("Macy's"), msg = hero('Madison Square Garden'), chelsea = hero('Hotel Chelsea'), flat = hero('Flatiron Building');

/** Phase 3 judged set (PROGRESS.md look target): matched to reference frames A-D, each at four times of day. */
const P3_TIMES = ['12:30', '19:30', '20:14', '23:00'];
const P3_VIEWS: { name: string; cam: string; ref?: string }[] = [
  { name: 'A_42nd_west_of_7th', cam: (() => { const c = on('West 42nd Street', -700, -1550, 1.7); return `${c[0]},${c[1]},${c[2]},90,3`; })(), ref: 'documerica_554297' },
  { name: 'B_6th_and_32nd_uptown', cam: (() => { const c = on('6th Avenue', -300, -790, 1.7); return `${c[0] + 6},${c[1]},${c[2]},0,4`; })(), ref: 'documerica_554293' },
  { name: 'C_garment_canyon_37th', cam: (() => { const c = on('West 37th Street', -760, -1200, 1.7); return `${c[0]},${c[1]},${c[2]},90,6`; })(), ref: 'documerica_549867' },
  { name: 'D_herald_square', cam: (() => { const c = on('Broadway', macys.x + 40, macys.z + 170, 1.7); return `${c[0]},${c[1]},${c[2]},12,5`; })(), ref: 'documerica_549869' },
  { name: 'E_flatiron_from_madison_sq', cam: '25,1.7,-150,173.5,10' },
  { name: 'F_spawn_up_broadway', cam: '-8,1.7,-30,14,6' },
];

/** Fixed viewpoints. 'spawn' uses the game's own spawn logic (no cam param). */
const VIEWS: { name: string; cam?: string; at?: string }[] = [
  { name: '01_spawn_flatiron_up_broadway' }, // on foot, third person, at the game's own spawn
  { name: '02_flatiron_from_madison_sq', cam: look([25, 1.8, -150], [flat.x, 30, flat.z]) },
  { name: '03_empire_state_from_fifth', cam: look(on('5th Avenue', esb.x, esb.z + 380), [esb.x, 160, esb.z]) },
  { name: '04_herald_square', cam: look(on('Broadway', macys.x, macys.z + 200), [macys.x, 25, macys.z]) },
  { name: '05_penn_msg_seventh_ave', cam: look(on('7th Avenue', msg.x, msg.z + 160), [msg.x, 20, msg.z]) },
  { name: '06_hotel_chelsea_23rd', cam: look(on('West 23rd Street', chelsea.x + 90, chelsea.z), [chelsea.x, 22, chelsea.z]) },
  { name: '07_aerial_overview_north', cam: look([350, 420, 650], [-250, 0, -800]) },
  { name: '08_downtown_skyline_wtc', cam: look([-60, 140, 260], [-1800, 120, 4200]) },
  { name: '09_onfoot_herald_square', at: `${on('Broadway', macys.x, macys.z + 150)[0] + 8},${on('Broadway', macys.x, macys.z + 150)[2]},15` },
  { name: '10_onfoot_42nd_and_seventh', at: '-560,-1520,90' },
  { name: '11_aerial_hells_kitchen_rail_cut', cam: look([-900, 380, -400], [-1550, 0, -780]) },
  { name: '12_terrain_34th_toward_hudson', cam: look(on('East 34th Street', 380, -905, 14), [-900, 2, -905]) },
];

async function main() {
  const port = 4173;
  const p3 = phase === 'phase3';
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const report: any[] = [];
  const list = p3 ? P3_VIEWS.flatMap((v) => P3_TIMES.map((t) => ({ name: `${v.name}_${t.replace(':', '')}`, cam: v.cam, at: undefined as string | undefined, time: t }))) : VIEWS.map((v) => ({ ...v, time: undefined as string | undefined }));
  page.setDefaultTimeout(600000);
  for (const v of list) {
    const q = new URLSearchParams({ quality, fresh: '1', title: '0', hud: p3 ? '0' : '1', ...(p3 ? { minimap: '0', camrel: '1', timescale: '0' } : {}), ...(v.time ? { time: v.time } : {}), ...(forceWebGL ? { webgl: '1' } : {}), ...(v.cam ? { cam: v.cam } : {}), ...(v.at ? { at: v.at } : {}) });
    await page.goto(`http://localhost:${port}/?${q}`);
    await page.waitForFunction(() => (window as any).__T74, null, { timeout: 120_000 });
    await page.evaluate(() => (window as any).__T74.whenIdle());
    // Measure steady-state frame times for 3 s after streaming settles.
    await page.evaluate(() => (window as any).__T74.frames.reset());
    await page.waitForTimeout(3000);
    const stats = await page.evaluate(() => {
      const t = (window as any).__T74; const s = t.frames.summary(); const i = t.renderer.info.render;
      return { backend: t.backend, ...s, drawCalls: i.drawCalls, triangles: i.triangles, chunks: { ...t.world.stats } };
    });
    const file = path.join(outDir, `${v.name}.png`);
    await page.screenshot({ path: file });
    report.push({ view: v.name, cam: v.cam ?? 'spawn', ...stats });
    console.log(v.name, `${stats.backend} avg ${stats.avg.toFixed(1)} ms p95 ${stats.p95.toFixed(1)} draws ${stats.drawCalls} tris ${stats.triangles}`);
  }
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ quality, forceWebGL, date: new Date().toISOString(), ua: await page.evaluate(() => navigator.userAgent), views: report, logs: logs.slice(0, 200) }, null, 2));
  await browser.close();
  server.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
