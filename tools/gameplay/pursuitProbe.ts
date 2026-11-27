/**
 * Pursuit on real streets (gameplay-owned): the built game, take a stopped traffic car (a witnessed carjack),
 * drive off with held keys, and sample the police every second: units, states, pursuit roles, distances, the
 * player's phase, reports. Prints a JSON report and a per-second table; shots at the start, middle and end.
 *
 *   npx vite build && npx tsx tools/gameplay/pursuitProbe.ts [seconds=60] [outDir=shots/gameplay/pursuit]
 *   env DRIVE="KeyW:20,KeyW+KeyD:2,KeyW:20" (key combos and seconds, in order; the rest of the time: no keys)
 *   env AT="x,z,headingDeg" spawn (default: the main game's spawn)
 *   env CRIME="carjack" (what gets the police after you: the carjack itself, or 'shots' for shots fired from the car)
 *
 * Honest numbers: SwiftShader runs the game at a few fps, so the probe reports the frame rate and game seconds next
 * to wall seconds; physics and sim step in game time.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SECONDS = +(process.argv[2] ?? 60);
const OUT = path.resolve(ROOT, process.argv[3] ?? 'shots/gameplay/pursuit');
const DRIVE = (process.env.DRIVE ?? 'KeyW:25,KeyW+KeyA:1.5,KeyW:25').split(',').map((s) => { const [k, t] = s.split(':'); return { keys: k.split('+'), secs: +t }; });
const AT = process.env.AT ? `&at=${process.env.AT}` : '';
const CRIME = process.env.CRIME ?? 'carjack';
fs.mkdirSync(OUT, { recursive: true });

const PORT = await new Promise<number>((res) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock'], { cwd: ROOT, stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-server.pid!, 'SIGTERM'); } catch { /* gone */ } };
for (let k = 0; k < 120; k++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors: string[] = [];

// one sample of the world, in the page
const SAMPLE = `(() => {
  const T = window.__T74, g = T.gameplay?.g; if (!g) return null;
  const p = T.player.pos, car = T.driving?.car?.v;
  const at = car ? car.object.position : p;
  const units = [...g.policeSys.units.values()].map((u) => ({ id: u.id, kind: u.kind, state: u.state, d: Math.round(Math.hypot(u.x - at.x, u.z - at.z)), sees: u.lostFor === 0 && !!u.lastSeen, role: g.mirror?.roles?.get(u.id)?.role ?? null }));
  return { gameT: +g.now.toFixed(1), driving: !!car, speed: car ? +car.speed.toFixed(1) : 0, pos: [Math.round(at.x), Math.round(at.z)],
    phase: g.policeSys.phase('player'), reports: g.policeSys.reports.length, heat: g.policeSys.reportFor('player')?.heat ?? 0,
    simCops: (T.sim.police ?? []).length, units, hp: Math.round(g.health.get('player')?.hp ?? 0) };
})()`;

const report: any = { seconds: SECONDS, drive: DRIVE, crime: CRIME, samples: [] as any[] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(300_000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?webgl=1&quality=low&time=12:30${AT}&title=0`);
  await page.waitForFunction(() => (window as any).__T74);
  await page.evaluate(() => (window as any).__T74.whenIdle());
  await page.waitForFunction(() => (window as any).__T74.gameplay?.g, null, { timeout: 300_000 });
  await page.waitForTimeout(12000); // traffic gets going
  // walk up to the nearest stopped or slow traffic car and take it
  const took = await page.evaluate(() => {
    const T = (window as any).__T74, p = T.player.pos;
    const cands = T.sim.vehicles.filter((v: any) => v.speed < 5 && v.vclass !== 'police' && v.vclass !== 'bus').sort((a: any, b: any) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const v of cands.slice(0, 10)) {
      const side = [Math.cos(v.yaw), -Math.sin(v.yaw)];
      T.player.teleport(v.x - side[0] * 1.6, p.y, v.z - side[1] * 1.6, v.yaw);
      if (T.driving.tryEnter()) return { ok: true, car: v.vclass, at: [Math.round(v.x), Math.round(v.z)], method: T.driving.lastEnter };
    }
    return { ok: false, near: cands.length };
  });
  report.took = took;
  console.log('took', JSON.stringify(took));
  if (!took.ok) throw new Error('no car could be taken');
  if (CRIME === 'shots') await page.evaluate(() => { const g = (window as any).__T74.gameplay.g; g.crime('shots_fired', { noise: 120 }); });
  const t0 = Date.now(); let fps = 0;
  const frames0 = await page.evaluate(() => (window as any).__T74.renderer.info.render.frame);
  // the drive script: hold key combos for their seconds, sampling every wall second
  const plan: { at: number; keys: string[] }[] = []; let acc = 0; for (const d of DRIVE) { plan.push({ at: acc, keys: d.keys }); acc += d.secs; } plan.push({ at: acc, keys: [] });
  let held: string[] = [];
  for (let s = 0; s <= SECONDS; s++) {
    const want = [...plan].reverse().find((p) => p.at <= s)!.keys;
    for (const k of held) if (!want.includes(k)) await page.keyboard.up(k);
    for (const k of want) if (!held.includes(k)) await page.keyboard.down(k);
    held = want;
    const smp = await page.evaluate(SAMPLE);
    if (smp) { (smp as any).wall = Math.round((Date.now() - t0) / 1000); report.samples.push(smp); console.log('sample', JSON.stringify(smp)); }
    if (s === 0 || s === Math.round(SECONDS / 2) || s === SECONDS) await page.screenshot({ path: path.join(OUT, `pursuit_${String(s).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 80 });
    await page.waitForTimeout(Math.max(0, t0 + (s + 1) * 1000 - Date.now()));
  }
  for (const k of held) await page.keyboard.up(k);
  const frames1 = await page.evaluate(() => (window as any).__T74.renderer.info.render.frame);
  fps = (frames1 - frames0) / ((Date.now() - t0) / 1000);
  report.fps = +fps.toFixed(1);
} finally { await browser.close(); stop(); }

// summary: when the first unit appeared, first sighting, roles seen, closest approach, phase timeline
const S = report.samples as any[];
const first = (f: (x: any) => boolean) => S.find(f)?.gameT ?? null;
const phases: string[] = []; for (const x of S) if (phases.at(-1) !== x.phase) phases.push(x.phase);
const roles = new Set<string>(); for (const x of S) for (const u of x.units) if (u.role) roles.add(u.role);
report.summary = {
  fps: report.fps, gameSeconds: S.length ? +(S.at(-1).gameT - S[0].gameT).toFixed(1) : 0,
  firstReport: first((x) => x.reports > 0), firstUnit: first((x) => x.units.length > 0), firstSighting: first((x) => x.units.some((u: any) => u.sees)),
  maxUnits: Math.max(0, ...S.map((x) => x.units.length)), closest: Math.min(Infinity, ...S.flatMap((x) => x.units.map((u: any) => u.d))),
  roles: [...roles], phases, topSpeed: Math.max(0, ...S.map((x) => x.speed)), distance: S.length ? Math.round(Math.hypot(S.at(-1).pos[0] - S[0].pos[0], S.at(-1).pos[1] - S[0].pos[1])) : 0,
  errors: errors.slice(0, 5),
};
fs.writeFileSync(path.join(OUT, 'pursuit.json'), JSON.stringify(report, null, 1));
console.log('wall game  drv  spd  phase      rep  units (kind:state:role@dist, * = sees)');
for (const x of S) console.log(`${String(x.wall).padStart(4)} ${String(x.gameT).padStart(5)} ${x.driving ? 'car' : 'foot'} ${String(x.speed).padStart(5)} ${x.phase.padEnd(10)} ${String(x.reports).padStart(3)}  ${x.units.map((u: any) => `${u.kind}:${u.state}${u.role ? ':' + u.role : ''}@${u.d}${u.sees ? '*' : ''}`).join(' ')}`);
console.log(JSON.stringify(report.summary, null, 1));
