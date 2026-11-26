/**
 * Vehicle screenshot + measurement rig (vehicles workstream). Serves the built game, drives the
 * ?vehicles=1 test lot through window.__VEH, writes PNG contact sheets and report.json to
 * shots/vehicles/.
 *   npm run build && npm run shots:vehicles [-- --only turntable,lineup,drive,damage,traffic,metrics]
 * Numbers are measured in headless Chromium (SwiftShader software GL when no GPU): physics/CPU
 * timings are meaningful, frame times are NOT.
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const only = new Set(arg('only', 'turntable,lineup,drive,damage,systems,bikes,subway,traffic,metrics').split(','));
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots', 'vehicles');
fs.mkdirSync(OUT, { recursive: true });
const prevReport = fs.existsSync(path.join(OUT, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8')) : {};
const report: Record<string, unknown> = { ...prevReport, date: new Date().toISOString(), note: 'Headless Chromium; WebGL2 via SwiftShader (software). CPU/physics timings meaningful, frame times are not.' };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const window: any;

/** Contact sheet, committed as JPEG (q85, at most 1600 px wide) to keep git history small. */
async function sheet(page: Page, shots: Buffer[], cols: number, w: number, h: number, file: string, labels: string[] = []) {
  const prev = page.viewportSize()!;
  if (w * cols > 1600) { const k = 1600 / (w * cols); w = Math.floor(w * k); h = Math.floor(h * k); }
  await page.setViewportSize({ width: w * cols, height: h * Math.ceil(shots.length / cols) });
  const cells = shots.map((s, i) => `<div style="position:relative"><img style="display:block;width:${w}px;height:${h}px;object-fit:cover" src="data:image/${s[0] === 0xff ? 'jpeg' : 'png'};base64,${s.toString('base64')}">` +
    (labels[i] ? `<div style="position:absolute;left:8px;top:6px;font:600 14px/1.2 sans-serif;color:#f0e8d8;text-shadow:0 1px 3px #000">${labels[i]}</div>` : '') + '</div>');
  await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">${cells.join('')}</body>`);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, type: 'jpeg', quality: 85 });
  await page.setViewportSize(prev);
}

async function open(page: Page, query: string) {
  await page.goto(`http://localhost:4173/?vehicles=1&webgl=1&hud=0&${query}`, { timeout: 180000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__VEH, null, { timeout: 180000 });
  await page.evaluate(() => window.__VEH.pause());
}
const snap = async (page: Page) => Buffer.from((await page.evaluate(() => window.__VEH.capture())).split(',')[1], 'base64');

/** Camera relative to the player: [dx, y, dz] in the vehicle's frame, looking at its centre. */
async function camRel(page: Page, rel: [number, number, number], fov = 38, lookY = 0.45) {
  await page.evaluate(([rel, fov, lookY]: [number[], number, number]) => {
    const V = window.__VEH, o = V.player.object, g = V.player.asset.lod0;
    const zc = (g.maxZ + g.minZ) / 2;
    const c = o.localToWorld(new o.position.constructor(rel[0], rel[1], rel[2] + zc));
    const t = o.localToWorld(new o.position.constructor(0, g.height * lookY, zc));
    V.setCamera(c.x, c.y, c.z, t.x, t.y, t.z, fov);
  }, [rel, fov, lookY] as [number[], number, number]);
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 450 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  // tsx (esbuild keepNames) wraps functions passed to evaluate() in __name(); provide it in the page
  await page.addInitScript('window.__name = (f) => f;');
  try {
    await open(page, 'mode=turntable&quality=high');
    const pick = arg('models', '');
    const models: { id: string; displayName: string }[] = (await page.evaluate(() => window.__VEH.factory.models)).filter((m: { id: string; class: string }) => !['motorcycle', 'bicycle', 'tricycle'].includes(m.class) && (!pick || pick.split(',').includes(m.id)));

    // ------------------------------------------------------------------ turntables
    if (only.has('turntable')) {
      const all: Buffer[] = [], labels: string[] = [], tris: Record<string, unknown> = {};
      for (const m of models) {
        const shots: Buffer[] = [];
        for (const variant of [0]) {
          const got = await page.evaluate(([id, v]: [string, number]) => { const V = window.__VEH; V.setModel(id, v); V.player.setLights({ head: false }); V.simulate(1); return V.player.modelId; }, [m.id, variant] as [string, number]);
          if (got !== m.id) throw new Error(`setModel(${m.id}) gave ${got}`);
          const d = await page.evaluate(() => { const g = window.__VEH.player.asset.lod0; return Math.max(6.5, (g.maxZ - g.minZ) * 1.15); });
          for (const rel of [[d * 0.62, 1.6, -d * 0.78], [d, 1.2, 0], [-d * 0.62, 1.9, d * 0.78], [0, 1.3, -d]] as [number, number, number][]) {
            await camRel(page, rel);
            shots.push(await snap(page));
          }
        }
        await sheet(page, shots, 2, 800, 450, `turntable_${m.id}.jpg`);
        all.push(shots[0]); labels.push(m.displayName);
        tris[m.id] = await page.evaluate(() => { const a = window.__VEH.player.asset; const t = (g: any) => (g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0); return { lod0: a.lod0.tris, lod1: a.lod1.tris, lod2: t(a.lod2) }; });
        console.log('turntable', m.id);
      }
      await sheet(page, all, 4, 480, 270, 'turntable_all.jpg', labels);
      // variants of the sedan: paint, vinyl roof, wheel covers, grime
      const vars: Buffer[] = [];
      for (let v = 0; v < 8; v++) {
        await page.evaluate((v: number) => { const V = window.__VEH; V.setModel('bancroft', v); V.player.setLights({ head: false }); V.simulate(0.6); }, v);
        await camRel(page, [4.2, 1.5, -5.4]);
        vars.push(await snap(page));
      }
      await sheet(page, vars, 4, 400, 225, 'variants_bancroft.jpg', [...Array(8)].map((_, i) => `variant ${i}`));
      report.triangles = tris;
    }

    // ------------------------------------------------------------------ period street lineup
    if (only.has('lineup')) {
      await open(page, 'mode=lineup&quality=high');
      await page.evaluate(() => window.__VEH.simulate(1.5));
      const shots: Buffer[] = [];
      // framed like the reference photos: camera relative to a specific parked car (local frame)
      const framings: [string, number[]][] = [
        ['tiverton', [-2.7, 1.1, -3.8, 0.4, 0.7, 1.4, 52]], // 549851: low rear three-quarter, driver side, close
        ['bancroft_cab', [-1.6, 1.25, -5.2, 0.4, 0.7, 0.6, 48]], // 554331: cab front three-quarter from the lane
        ['ct40', [-2.2, 1.55, -9.5, 0.2, 1.6, -3.5, 50]], // 549921: bus front three-quarter at the stop
      ];
      for (const [id, c] of framings) {
        await page.evaluate(([id, c]: [string, number[]]) => {
          const V = window.__VEH; const v = V.parked.find((p: any) => p.modelId === id); const o = v.object;
          const a = o.localToWorld(new o.position.constructor(c[0], c[1], c[2])), t = o.localToWorld(new o.position.constructor(c[3], c[4], c[5]));
          V.setCamera(a.x, a.y, a.z, t.x, t.y, t.z, c[6]);
        }, [id, c] as [string, number[]]);
        shots.push(await snap(page));
      }
      await sheet(page, shots, 3, 640, 360, 'lineup_street.jpg');
      // side by side with reference photos (public domain, references/catalog.json)
      const refs = ['documerica_549851.jpg', 'documerica_554331.jpg', 'documerica_549921.jpg'].map((f) => fs.readFileSync(path.join(ROOT, 'references/img', f)));
      await sheet(page, [shots[0], refs[0], shots[1], refs[1], shots[2], refs[2]], 2, 640, 420, 'lineup_vs_references.jpg',
        ['render: Delacorte Tiverton, framed like 549851', 'ref: DOCUMERICA 549851 (public domain)', 'render: Bancroft cab, framed like 554331', 'ref: DOCUMERICA 554331 (taxis, Lexington Ave)', 'render: CT-40 bus, framed like 549921', 'ref: DOCUMERICA 549921 (bus)']);
      console.log('lineup');
    }

    // ------------------------------------------------------------------ driving: skid + handbrake
    if (only.has('drive')) {
      await open(page, 'mode=drive&quality=high');
      const frames: Buffer[] = [], labels: string[] = [];
      await page.evaluate(() => { const V = window.__VEH; V.setModel('fareway', 3, { x: -110, z: 160, yaw: 0 }); V.player.setLights({ head: true }); V.setAuto({ throttle: 1, brake: 0, steer: 0, handbrake: false }); V.simulate(5.5); });
      const seq: [string, any, number][] = [
        ['full-throttle launch: wheelspin marks', null, 0],
        ['panic stop from 40 mph: locked wheels', { throttle: 0, brake: 1, steer: 0, handbrake: false }, 1.0],
        ['handbrake turn', { throttle: 0.4, brake: 0, steer: 1, handbrake: true }, 0.9],
        ['power-on exit: tail slides', { throttle: 1, brake: 0, steer: -0.6, handbrake: false }, 1.2],
      ];
      for (const [label, input, secs] of seq) {
        if (input) await page.evaluate(([i, s]: [any, number]) => { const V = window.__VEH; V.setAuto(i); V.simulate(s); }, [input, secs] as [any, number]);
        await camRel(page, [7, 5, 9], 50, 0.2);
        frames.push(await snap(page));
        labels.push(`${label} — ${await page.evaluate(() => (Math.abs(window.__VEH.player.speed) * 2.237).toFixed(0))} mph`);
      }
      // the brake sequence again from a fresh run, from the side, to show nose dive
      await page.evaluate(() => { const V = window.__VEH; V.setModel('bancroft', 1, { x: -60, z: 40, yaw: -Math.PI / 2 }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.5); V.player.body.setLinvel({ x: 22, y: 0, z: 0 }, true); V.simulate(0.05); V.setAuto({ throttle: 0, brake: 1, steer: 0, handbrake: false }); V.simulate(0.45); });
      await camRel(page, [7, 1.0, 0], 40, 0.4); frames.push(await snap(page)); labels.push('nose dive under braking (side view)');
      await page.evaluate(() => { const V = window.__VEH; V.setModel('bancroft', 1, { x: -60, z: 40, yaw: 0 }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.5); V.player.body.setLinvel({ x: 0, y: 0, z: -14 }, true); V.simulate(0.05); V.setAuto({ throttle: 0.3, brake: 0, steer: 0.8, handbrake: false }); V.simulate(1.2); });
      await camRel(page, [0, 1.2, -9], 40, 0.4); frames.push(await snap(page)); labels.push('body roll in a 30 mph turn (front view)');
      // hills: crest of the 8% climb, parked on the 12% descent with the handbrake, crowned street
      await page.evaluate(() => { const V = window.__VEH, H = V.hill; V.setModel('bancroft_cab', 4, { x: H.x - 2, z: 70, yaw: 0 }); V.setAuto({ throttle: 0.7, brake: 0, steer: 0, handbrake: false }); V.simulate(9.2); });
      await camRel(page, [6, 1.2, 2], 40, 0.4); frames.push(await snap(page)); labels.push(`climbing the 8% grade — ${await page.evaluate(() => (window.__VEH.player.speed * 2.237).toFixed(0))} mph`);
      await page.evaluate(() => { const V = window.__VEH, H = V.hill; V.setModel('bancroft', 5, { x: H.x - 2.5, z: -70, yaw: Math.PI }); V.player.setPose({ x: H.x - 2.5, y: H.heightAt(H.x - 2.5, -70) + 0.4, z: -70, yaw: Math.PI }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: true }); V.simulate(3); });
      await camRel(page, [7, 1.3, 0], 40, 0.4); frames.push(await snap(page)); labels.push('parked on the 12% descent, handbrake on');
      await page.evaluate(() => { const V = window.__VEH, H = V.hill; V.setModel('fareway', 2, { x: H.x + 2.5, z: 140, yaw: Math.PI }); V.player.setPose({ x: H.x + 2.5, y: H.heightAt(H.x + 2.5, 140) + 0.4, z: 140, yaw: Math.PI }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: true }); V.simulate(2); });
      await camRel(page, [0, 1.4, -9], 40, 0.4); frames.push(await snap(page)); labels.push('parked on a crowned street with 5% cross-fall');
      await sheet(page, frames, 3, 640, 360, 'drive_skids.jpg', labels);
      console.log('drive');
    }

    // ------------------------------------------------------------------ damage: 30 mph wall + stages
    if (only.has('damage')) {
      await open(page, 'mode=drive&quality=high');
      const frames: Buffer[] = [], labels: string[] = [];
      await page.evaluate(() => { const V = window.__VEH; V.setModel('bancroft', 2, { x: 36, z: 30, yaw: -Math.PI / 2 }); V.player.setLights({ head: true }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.5); });
      const shotAt = async (label: string) => { await camRel(page, [-5.4, 1.8, -1.2], 44, 0.35); frames.push(await snap(page)); labels.push(label); };
      await shotAt('intact');
      const crash = await page.evaluate(() => {
        const V = window.__VEH, ev: any[] = [];
        V.player.on('impact', (e: any) => ev.push({ speedChange: +e.speedChange.toFixed(2), zone: e.zone, damage: +e.damage.toFixed(3) }));
        V.player.body.setLinvel({ x: 13.41, y: 0, z: 0 }, true);
        V.simulate(1.6);
        return { impacts: ev, ...V.stats() };
      });
      report.crash30mph = crash;
      await shotAt(`30 mph into the wall: ${crash.stage} (${(crash.damage * 100).toFixed(0)}%)`);
      await page.evaluate(() => { const V = window.__VEH; V.player.applyDamage('left', 0.5); V.simulate(1.2); });
      await shotAt('+ side hit: dented doors');
      await page.evaluate(() => { const V = window.__VEH; V.player.applyDamage('right', 0.45); V.simulate(2.5); });
      await shotAt(`smoking (${await page.evaluate(() => window.__VEH.player.stage)})`);
      await page.evaluate(() => { const V = window.__VEH; V.player.applyDamage('rear', 0.4); V.simulate(3); });
      await shotAt(`burning (${await page.evaluate(() => window.__VEH.player.stage)})`);
      await page.evaluate(() => window.__VEH.simulate(9));
      await shotAt(`burnt out (${await page.evaluate(() => window.__VEH.player.stage)})`);
      await sheet(page, frames, 3, 640, 360, 'damage_stages.jpg', labels);
      // close-up of the crumple from the front three-quarter
      await page.evaluate(() => { const V = window.__VEH; V.setModel('fareway', 1, { x: 36, z: 30, yaw: -Math.PI / 2 }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.4); V.player.body.setLinvel({ x: 13.41, y: 0, z: 0 }, true); V.simulate(1.0); V.player.setPose({ x: 30, y: 0.2, z: 30, yaw: Math.PI / 2 }); V.simulate(0.6); });
      const close: Buffer[] = [];
      await camRel(page, [3.8, 1.5, -5.5], 40, 0.35); close.push(await snap(page));
      await camRel(page, [-3.8, 1.5, -5.5], 40, 0.35); close.push(await snap(page));
      await sheet(page, close, 2, 640, 360, 'damage_crumple_closeup.jpg', ['taxi after a 30 mph wall hit', 'other side']);
      console.log('damage');
    }

    // ------------------------------------------------------------------ systems: bullets, heat, theft, respray, plates + measurements
    if (only.has('systems')) {
      await open(page, 'mode=drive&quality=high');
      const frames: Buffer[] = [], labels: string[] = [];
      const shot = async (label: string, rel: [number, number, number], lookY = 0.4, fov = 40) => { await camRel(page, rel, fov, lookY); frames.push(await snap(page)); labels.push(label); };
      await page.evaluate(() => { const V = window.__VEH; V.setModel('bancroft', 6, { x: -20, z: 40, yaw: 0 }); V.player.setLights({ head: false }); V.simulate(0.5);
        const g = V.player.asset.lod0, w = V.player.physics.wheels.find((x: any) => x.front && x.side < 0);
        for (let i = 0; i < 7; i++) V.shoot({ x: -1.0, y: 0.45 + (i % 3) * 0.12, z: -0.6 + i * 0.25 }); // door panel holes
        V.shoot({ x: -0.75, y: 1.15, z: 0.4 }); V.shoot({ x: -0.75, y: 1.1, z: 0.5 }); // left glass: crack then shatter
        V.shoot({ x: w.hp.x - 0.1, y: w.hp.y - w.len, z: w.hp.z }); // front-left tyre
        V.shoot({ x: 0, y: 1.15, z: g.minZ + 2.4 }); // windshield crack
        V.simulate(1); });
      await shot('bullets: door holes, shattered side glass, cracked windshield, flat front tyre', [-5.2, 1.4, -2.5]);
      await page.evaluate(() => { const V = window.__VEH; const g = V.player.asset.lod0; V.shoot({ x: 0, y: 0.55, z: g.minZ + 0.25 }); V.shoot({ x: 0.2, y: 0.6, z: g.minZ + 0.25 }); V.player.engine.temp = 121; V.player.engine.overheating = true; V.simulate(2.5); });
      await shot(`radiator holed: overheating, steam (${await page.evaluate(() => window.__VEH.player.engine.temp.toFixed(0))} °C)`, [3.5, 1.8, -6.5], 0.5);
      await page.evaluate(() => { const V = window.__VEH; V.setModel('fareway', 8, { x: -20, z: 40, yaw: 0 }); V.player.security.keysIn = false; V.player.lock(); V.simulate(0.3); V.player.breakWindow('left'); V.player.hotwire(); V.simulate(0.5); });
      await shot('theft: window smashed (loud), hot-wired', [-4.5, 1.5, -1.5]);
      await page.evaluate(() => { const V = window.__VEH; V.player.respray(0x1f2a40); V.player.setPlate('KFZ 219'); V.simulate(0.2); });
      await shot('chop shop: respray + new plates (description and plate history stay with gameplay)', [3.5, 1.2, 6.5], 0.3);
      await page.evaluate(() => { const V = window.__VEH; V.setModel('bancroft_patrol', 1, { x: -20, z: 40, yaw: 0 }); V.player.setLights({ beacon: true, head: true }); V.simulate(0.2); });
      await shot('police package: beacon, spotlight, HD suspension', [4.5, 1.6, -6], 0.4);
      await sheet(page, frames, 3, 640, 360, 'systems.jpg', labels);
      report.systems = await page.evaluate(() => {
        const V = window.__VEH, DT = 1 / 60, o: any = {};
        const run = (id: string, v: number) => { V.setModel(id, v, { x: -300, z: 1500, yaw: 0 }); V.player.failureRate = 0; V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.5); V.setAuto({ throttle: 1, brake: 0, steer: 0, handbrake: false }); let t = 0, t60 = 0, top = 0; while (t < 40) { V.simulate(DT); t += DT; if (!t60 && V.player.speed > 26.82) t60 = t; top = Math.max(top, V.player.speed); } return { variant: v, trim: V.player.trim, mileage: Math.round(V.player.mileage), t0_60s: +t60.toFixed(1), topMph: +(top * 2.237).toFixed(0) }; };
        o.police = [0, 1, 2].map((v) => run('bancroft_patrol', v));
        o.civilian = [0, 1, 2, 3, 4, 5].map((v) => run('bancroft', v));
        const stop = (wet: number, mins: number, radial: boolean) => { V.setModel('bancroft', 1, { x: -300, z: 1500, yaw: 0 }); if (radial) V.player.install('radialTyres'); V.player.setWetness(wet, mins); V.simulate(0.3); V.player.body.setLinvel({ x: 0, y: 0, z: -17.9 }, true); V.simulate(DT); const z0 = V.player.object.position.z; V.setAuto({ throttle: 0, brake: 1, steer: 0, handbrake: false }); let k = 0; while (k < 900 && Math.abs(V.player.speed) > 0.2) { V.simulate(DT); k++; } V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); return +(Math.abs(V.player.object.position.z - z0) * 3.281).toFixed(0); };
        o.brake40to0_ft = { dry: stop(0, 999, false), wetFirstMinutes: stop(1, 1, false), wetLater: stop(1, 30, false), wetRadials: stop(1, 30, true) };
        V.setModel('bancroft', 2, { x: -300, z: 1500, yaw: 0 }); V.player.condition.alignment = 0; V.simulate(0.5);
        const w = V.player.physics.wheels.find((x: any) => x.front && x.side > 0); V.shoot({ x: w.hp.x + 0.12, y: w.hp.y - w.len, z: w.hp.z });
        V.player.body.setLinvel({ x: 0, y: 0, z: -17.9 }, true); V.setAuto({ throttle: 0.35, brake: 0, steer: 0, handbrake: false }); const x0 = V.player.object.position.x; V.simulate(3); o.flatFrontRightDrift3s_m = +(V.player.object.position.x - x0).toFixed(2);
        V.setModel('tiverton', 4, { x: -300, z: 1500, yaw: 0 }); const A = V.player; V.simulate(0.5); A.applyDamage('left', 0.4, 'x'); V.shoot(); V.shoot(); A.install('hdSuspension'); A.respray(0x2c3a5a); A.setPlate('NIK 974'); A.trunkAdd({ id: 'briefcase', qty: 1, meta: { cash: 5000 } }); V.simulate(2);
        const s1 = A.serialize(), json = JSON.stringify(s1); const R = V.factory.restore(V.world, V.scene, JSON.parse(json)); const s2 = R.serialize();
        const diff: string[] = []; const cmp = (a: any, b: any, p: string) => { if (typeof a === 'number' && typeof b === 'number') { if (Math.abs(a - b) > 1e-4) diff.push(p); } else if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b || {})])) cmp(a[k], b?.[k], p + '.' + k); } else if (a !== b) diff.push(p); };
        cmp(s1, s2, 'save'); o.saveRoundTrip = { diffs: diff, bytes: json.length, physicsIdentical: JSON.stringify(R.physics.p) === JSON.stringify(A.physics.p) }; R.dispose();
        return o;
      });
      console.log('systems', JSON.stringify(report.systems));
    }

    // ------------------------------------------------------------------ two-wheelers
    if (only.has('bikes')) {
      await open(page, 'mode=drive&quality=high');
      const frames: Buffer[] = [], labels: string[] = [];
      const bikes: string[] = ['calder650', 'calder_patrol', 'wexford_roadster', 'wexford_carrier'];
      for (const id of bikes) for (const rel of [[2.4, 1.3, -2.8], [3.4, 1.0, 0], [-2.4, 1.6, 2.8]] as [number, number, number][]) {
        const d = await page.evaluate(([id, rel]: [string, number[]]) => { const V = window.__VEH; V.setAuto({ throttle: 0, brake: 1, steer: 0, handbrake: false }); for (const b of V.bikes.splice(0)) b.dispose(); const bk = V.rideBike(id, { x: 0, z: 30, yaw: 0 }, 1); V.simulate(0.6); const o = bk.object.position; V.setCamera(o.x + rel[0], rel[1], o.z + rel[2], o.x, 0.6, o.z, 40); return [V.capture(), bk.spec.displayName]; }, [id, rel] as [string, number[]]);
        frames.push(Buffer.from(d[0].split(',')[1], 'base64')); labels.push(d[1]);
      }
      const lean = await page.evaluate(() => { const V = window.__VEH; for (const b of V.bikes.splice(0)) b.dispose(); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); const bk = V.rideBike('calder650', { x: -300, z: 1500, yaw: 0 }, 2); V.simulate(0.3); bk.body.setLinvel({ x: 0, y: 0, z: -15 }, true); V.setAuto({ throttle: 0.4, brake: 0, steer: 0.45, handbrake: false }); V.simulate(1.2); const o = bk.object.position, f = new o.constructor(0, 0, -1).applyQuaternion(bk.object.quaternion); V.setCamera(o.x + f.x * 4.5, 1.0, o.z + f.z * 4.5, o.x, 0.7, o.z, 40); return [V.capture(), (bk.lean * 57.3).toFixed(0)]; });
      frames.push(Buffer.from(lean[0].split(',')[1], 'base64')); labels.push(`leaning ${lean[1]}° at 34 mph`);
      const crash = await page.evaluate(() => { const V = window.__VEH; V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); const bk = V.rideBike('calder650', { x: 40, z: 30, yaw: -Math.PI / 2 }, 3); let ev: any = null; bk.on('crash', (e: any) => (ev = e)); V.simulate(0.3); bk.body.setLinvel({ x: 12, y: 0, z: 0 }, true); V.simulate(2.5); const o = bk.object.position; V.setCamera(o.x - 4, 1.6, o.z - 3, o.x, 0.4, o.z, 45); return [V.capture(), ev ? `${ev.cause}, rider thrown at ${(ev.speed * 2.237).toFixed(0)} mph` : 'no crash']; });
      frames.push(Buffer.from(crash[0].split(',')[1], 'base64')); labels.push(`wall crash: ${crash[1]}`);
      await sheet(page, frames, 3, 480, 300, 'bikes.jpg', labels);
      report.bikes = await page.evaluate(() => {
        const V = window.__VEH, DT = 1 / 60, o: any = {};
        for (const id of ['calder650', 'calder_patrol', 'wexford_roadster', 'wexford_carrier']) {
          for (const b of V.bikes.splice(0)) b.dispose(); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false });
          const bk = V.rideBike(id, { x: -300, z: 1500, yaw: 0 }); V.simulate(0.5); V.setAuto({ throttle: 1, brake: 0, steer: 0, handbrake: false });
          let t = 0, t30 = 0, top = 0; while (t < 25) { V.simulate(DT); t += DT; if (!t30 && bk.speed > 13.41) t30 = t; top = Math.max(top, bk.speed); }
          const t1 = performance.now(); for (let k = 0; k < 600; k++) bk.update(DT);
          o[id] = { t0_30s: t30 ? +t30.toFixed(1) : null, topMph: +(top * 2.237).toFixed(0), updateMs: +((performance.now() - t1) / 600).toFixed(3) };
        }
        return o;
      });
      console.log('bikes', JSON.stringify(report.bikes));
    }

    // ------------------------------------------------------------------ subway
    if (only.has('subway')) {
      await open(page, 'mode=subway&quality=high');
      const frames: Buffer[] = [], labels: string[] = [];
      const cap = async (label: string, fn: () => string) => { frames.push(Buffer.from((await page.evaluate(fn)).split(',')[1], 'base64')); labels.push(label); };
      await cap('three-quarter, doors closed', () => { const V = window.__VEH; V.trainSim.t = 0; V.simulate(0.2); const c = V.train.cars[0].group.position; V.setCamera(c.x + 12, 2.2, c.z - 14, c.x - 4, 2, c.z, 45); return V.capture(); });
      await cap('side: whole-car pieces, throw-ups, tags', () => { const V = window.__VEH; const c = V.train.cars[1].group.position; V.setCamera(c.x, 1.8, c.z - 13, c.x, 2, c.z, 50); return V.capture(); });
      await cap('dwell: doors open (graffiti slides with the leaves)', () => { const V = window.__VEH; V.trainSim.t = 0; V.simulate(4); const c = V.train.cars[0].group.position; V.setCamera(c.x - 1, 1.9, c.z - 5, c.x - 1, 2, c.z, 55); return V.capture(); });
      await cap('interior: benches, poles, straps, fluorescents, car cards', () => { const V = window.__VEH; const g = V.train.cars[1].group; const a = g.localToWorld(new g.position.constructor(0.3, 2.3, -7.2)), t = g.localToWorld(new g.position.constructor(0, 1.9, 6)); V.setCamera(a.x, a.y, a.z, t.x, t.y, t.z, 62); return V.capture(); });
      await cap('cab end', () => { const V = window.__VEH; const g = V.train.cars[0].group; const a = g.localToWorld(new g.position.constructor(2.5, 2.2, -14)), t = g.localToWorld(new g.position.constructor(0, 2, -7)); V.setCamera(a.x, a.y, a.z, t.x, t.y, t.z, 45); return V.capture(); });
      await cap('running', () => { const V = window.__VEH; V.trainSim.t = 20; V.simulate(6); const c = V.train.cars[2].group.position; V.setCamera(c.x + 8, 1.6, c.z - 10, c.x - 5, 2, c.z, 50); return V.capture(); });
      await sheet(page, frames, 3, 640, 360, 'subway.jpg', labels);
      report.subway = await page.evaluate(() => { const V = window.__VEH; const t0 = performance.now(); for (let i = 0; i < 300; i++) V.train.update(); return { cars: V.train.cars.length, updateMs: +((performance.now() - t0) / 300).toFixed(3) }; });
      console.log('subway', JSON.stringify(report.subway));
    }

    // ------------------------------------------------------------------ traffic renderer
    if (only.has('traffic')) {
      const res: Record<string, unknown> = {};
      for (const [q, n] of [['high', 150], ['low', 40]] as const) {
        await open(page, `mode=traffic&quality=${q}&n=${n}`);
        const r = await page.evaluate(() => {
          const V = window.__VEH; const t: number[] = [];
          for (let k = 0; k < 120; k++) { V.moveTraffic(1 / 60); t.push(V.trafficMs()); }
          t.sort((a, b) => a - b);
          V.setCamera(-40, 30, 30, 0, 0, -60, 50);
          return { instances: V.scene.getObjectByName('vehicle-traffic').children.reduce((s: number, m: any) => s + (m.visible && m.name === 'traffic-paint' ? m.count : 0), 0), setInstancesMsAvg: t.reduce((a, b) => a + b, 0) / t.length, setInstancesMsP95: t[Math.floor(t.length * 0.95)] };
        });
        await page.waitForTimeout(500);
        const draw = await page.evaluate(() => { window.__VEH.renderOnce(); const i = window.__VEH.renderer.info.render; return { drawCalls: i.drawCalls, triangles: i.triangles }; });
        res[`${q}_${n}`] = { ...r, ...draw };
        if (q === 'high') { const img = await snap(page); await sheet(page, [img], 1, 800, 450, 'traffic_150.jpg'); }
      }
      report.traffic = res;
      console.log('traffic', res);
    }

    // ------------------------------------------------------------------ driving metrics + physics cost
    if (only.has('metrics')) {
      await open(page, 'mode=drive&quality=low');
      const ids = models.map((m) => m.id);
      report.driving = await page.evaluate((ids: string[]) => {
        const V = window.__VEH, DT = 1 / 60, out: Record<string, any> = {};
        const eul = () => { const e = new V.player.object.rotation.constructor().setFromQuaternion(V.player.object.quaternion, 'YXZ'); return { pitch: e.x * 57.3, roll: e.z * 57.3 }; };
        const fresh = (yaw = 0) => { V.setModel(id, 0, { x: -200, z: 1500, yaw }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.8); };
        let id = '';
        for (id of ids) {
          const r: any = {};
          fresh();
          V.setAuto({ throttle: 1, brake: 0, steer: 0, handbrake: false });
          let t = 0, t30 = 0, squat = 0, top = 0;
          while (t < 45) { V.simulate(DT); t += DT; if (!t30 && V.player.speed > 13.41) t30 = t; if (!r.t0_60s && V.player.speed > 26.82) r.t0_60s = +t.toFixed(1); squat = Math.max(squat, eul().pitch); top = Math.max(top, V.player.speed); }
          r.t0_30s = +t30.toFixed(1); r.topMph = +(top * 2.237).toFixed(0); r.squatDeg = +squat.toFixed(1);
          fresh(); V.player.body.setLinvel({ x: 0, y: 0, z: -26.82 }, true); V.simulate(DT);
          const z0 = V.player.object.position.z; let dive = 0, lock = 0; t = 0;
          V.player.on('skid', (e: any) => { if (e.wheels.some((w: any) => w.locked)) lock++; });
          V.setAuto({ throttle: 0, brake: 1, steer: 0, handbrake: false });
          while (t < 15 && V.player.speed > 0.2) { V.simulate(DT); t += DT; dive = Math.min(dive, eul().pitch); }
          r.brake60to0_ft = +(Math.abs(V.player.object.position.z - z0) * 3.281).toFixed(0); r.diveDeg = +(-dive).toFixed(1); r.lockedFrames = lock;
          fresh(); V.player.body.setLinvel({ x: 0, y: 0, z: -13.41 }, true); V.simulate(DT);
          V.setAuto({ throttle: 0.35, brake: 0, steer: 0.6, handbrake: false });
          let roll = 0, lat = 0;
          for (let k = 0; k < 240; k++) { V.simulate(DT); roll = Math.max(roll, Math.abs(eul().roll)); lat = Math.max(lat, Math.abs(V.player.body.angvel().y * V.player.speed) / 9.81); }
          r.rollDeg = +roll.toFixed(1); r.maxLatG = +lat.toFixed(2);
          // cost: player update alone, and update + world.step
          const t1 = performance.now(); for (let k = 0; k < 600; k++) V.player.update(DT); r.updateMs = +((performance.now() - t1) / 600).toFixed(3);
          const t2 = performance.now(); for (let k = 0; k < 600; k++) { V.player.update(DT); V.world.step(); } r.updatePlusWorldStepMs = +((performance.now() - t2) / 600).toFixed(3);
          out[id] = r;
        }
        return out;
      }, ids);
      console.log('metrics', report.driving);
    }
  } finally {
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
