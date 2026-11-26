/**
 * Headless screenshots of the ambient sim debug view (?sim=1).
 *   npm run build && npm run shots:sim [-- --webgl] [--quality high] [--settle 12]
 * Writes shots/sim/*.png and shots/sim/report.json (sim update ms measured in the page; CPU-only container).
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const quality = arg('quality', 'high');
const settle = +arg('settle', '12');
const forceWebGL = args.includes('--webgl');
const ROOT = path.resolve(import.meta.dirname, '../..');
const outDir = path.join(ROOT, 'shots', 'sim');
fs.mkdirSync(outDir, { recursive: true });
const look = (from: [number, number, number], to: [number, number, number]) => {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const yaw = (Math.atan2(-dx, -dz) * 180) / Math.PI, pitch = (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
  return `${from.join(',')},${yaw.toFixed(2)},${pitch.toFixed(2)}`;
};
// Street centrelines from public/data/streets.json (medians): 5th Ave x=-19, 6th Ave x=-330, 7th Ave x=-605,
// 23rd St z=-32, 34th St z=-909, 42nd St z=-1548. Herald Square = Broadway x 6th Ave at 34th/35th.
const VIEWS = [
  // cameras sit above street centrelines so they never start inside a building
  { name: '01_herald_square', cam: look([-250, 42, -909], [-350, 0, -935]) },
  { name: '02_flatiron_spawn', cam: look([-19, 30, 95], [0, 0, -35]) },
  { name: '03_42nd_and_7th', cam: look([-605, 34, -1455], [-600, 0, -1550]) },
  { name: '04_herald_square_street_level', cam: look([-330, 1.7, -850], [-345, 1.5, -960]) },
];

async function main() {
  const port = 4174;
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const report: any[] = [];
  try {
    for (const v of VIEWS) {
      const q = new URLSearchParams({ quality, sim: '1', hud: '0', minimap: '0', ...(forceWebGL ? { webgl: '1' } : {}), cam: v.cam });
      await page.goto(`http://localhost:${port}/?${q}`);
      await page.waitForFunction(() => (window as any).__T74 && (window as any).__T74SIM?.ready, null, { timeout: 180_000 });
      await page.evaluate(() => (window as any).__T74.whenIdle());
      await page.waitForTimeout(settle * 1000);
      const stats = await page.evaluate(() => {
        const s = (window as any).__T74SIM; const ms = [...s.ms].sort((a: number, b: number) => a - b);
        return { simTime: s.sim.time, vehicles: s.sim.vehicles.length, peds: s.sim.peds.length, updateMsAvg: ms.reduce((a: number, b: number) => a + b, 0) / ms.length, updateMsP95: ms[Math.floor(ms.length * 0.95)], frameMs: (window as any).__T74.frames.summary().avg, stats: { ...s.sim.stats }, events: s.events };
      });
      await page.screenshot({ path: path.join(outDir, `${v.name}.png`) });
      report.push({ view: v.name, cam: v.cam, ...stats });
      console.log(v.name, `veh ${stats.vehicles} peds ${stats.peds} sim ${stats.simTime.toFixed(1)} s update ${stats.updateMsAvg.toFixed(2)} ms`);
    }
  } finally {
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ note: 'Headless SwiftShader in a CPU-only container; frame times are the software rasteriser, sim update ms are real JS time on this CPU.', quality, report, logs: logs.slice(-40) }, null, 2));
    await browser.close(); server.kill();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
