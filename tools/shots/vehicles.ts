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
const only = new Set(arg('only', 'turntable,lineup,drive,damage,traffic,metrics').split(','));
const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots', 'vehicles');
fs.mkdirSync(OUT, { recursive: true });
const prevReport = fs.existsSync(path.join(OUT, 'report.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8')) : {};
const report: Record<string, unknown> = { ...prevReport, date: new Date().toISOString(), note: 'Headless Chromium; WebGL2 via SwiftShader (software). CPU/physics timings meaningful, frame times are not.' };

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const window: any;

async function sheet(page: Page, shots: Buffer[], cols: number, w: number, h: number, file: string, labels: string[] = []) {
  const prev = page.viewportSize()!;
  await page.setViewportSize({ width: w * cols, height: h * Math.ceil(shots.length / cols) });
  const cells = shots.map((s, i) => `<div style="position:relative"><img style="display:block;width:${w}px;height:${h}px" src="data:image/png;base64,${s.toString('base64')}">` +
    (labels[i] ? `<div style="position:absolute;left:8px;top:6px;font:600 14px/1.2 sans-serif;color:#f0e8d8;text-shadow:0 1px 3px #000">${labels[i]}</div>` : '') + '</div>');
  await page.setContent(`<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(${cols},${w}px)">${cells.join('')}</body>`);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
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
    const models: { id: string; displayName: string }[] = (await page.evaluate(() => window.__VEH.factory.models)).filter((m: { id: string }) => !pick || pick.split(',').includes(m.id));

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
        await sheet(page, shots, 2, 800, 450, `turntable_${m.id}.png`);
        all.push(shots[0]); labels.push(m.displayName);
        tris[m.id] = await page.evaluate(() => { const a = window.__VEH.player.asset; const t = (g: any) => (g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0); return { lod0: a.lod0.tris, lod1: a.lod1.tris, lod2: t(a.lod2) }; });
        console.log('turntable', m.id);
      }
      await sheet(page, all, 4, 480, 270, 'turntable_all.png', labels);
      // variants of the sedan: paint, vinyl roof, wheel covers, grime
      const vars: Buffer[] = [];
      for (let v = 0; v < 8; v++) {
        await page.evaluate((v: number) => { const V = window.__VEH; V.setModel('bancroft', v); V.player.setLights({ head: false }); V.simulate(0.6); }, v);
        await camRel(page, [4.2, 1.5, -5.4]);
        vars.push(await snap(page));
      }
      await sheet(page, vars, 4, 400, 225, 'variants_bancroft.png', [...Array(8)].map((_, i) => `variant ${i}`));
      report.triangles = tris;
    }

    // ------------------------------------------------------------------ period street lineup
    if (only.has('lineup')) {
      await open(page, 'mode=lineup&quality=high');
      await page.evaluate(() => window.__VEH.simulate(1.5));
      const shots: Buffer[] = [];
      const cams: [number, number, number, number, number, number, number][] = [
        [0.6, 1.45, -82, 3.6, 0.9, -55, 38], // down the curb lane, eye level, longish lens
        [-1.2, 1.6, -38, 3.8, 0.9, -24, 40], // middle of the line (trucks and bus)
        [-2.5, 7, -30, 3.4, 0.4, -60, 48], // from a second-floor window
      ];
      for (const c of cams) { await page.evaluate((c: number[]) => window.__VEH.setCamera(...c), c); shots.push(await snap(page)); }
      await sheet(page, shots, 3, 640, 360, 'lineup_street.png');
      // side by side with reference photos (public domain, references/catalog.json)
      const refs = ['documerica_549851.jpg', 'documerica_554331.jpg', 'documerica_549921.jpg'].map((f) => fs.readFileSync(path.join(ROOT, 'references/img', f)));
      await sheet(page, [shots[0], refs[0], shots[1], refs[1], shots[2], refs[2]], 2, 640, 420, 'lineup_vs_references.png',
        ['render: lineup (eye level)', 'ref: DOCUMERICA 549851 (public domain)', 'render: lineup', 'ref: DOCUMERICA 554331 (taxis, Lexington Ave)', 'render: from above', 'ref: DOCUMERICA 549921 (bus)']);
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
      await sheet(page, frames, 3, 640, 360, 'drive_skids.png', labels);
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
      await sheet(page, frames, 3, 640, 360, 'damage_stages.png', labels);
      // close-up of the crumple from the front three-quarter
      await page.evaluate(() => { const V = window.__VEH; V.setModel('fareway', 1, { x: 36, z: 30, yaw: -Math.PI / 2 }); V.setAuto({ throttle: 0, brake: 0, steer: 0, handbrake: false }); V.simulate(0.4); V.player.body.setLinvel({ x: 13.41, y: 0, z: 0 }, true); V.simulate(1.0); V.player.setPose({ x: 30, y: 0.2, z: 30, yaw: Math.PI / 2 }); V.simulate(0.6); });
      const close: Buffer[] = [];
      await camRel(page, [3.8, 1.5, -5.5], 40, 0.35); close.push(await snap(page));
      await camRel(page, [-3.8, 1.5, -5.5], 40, 0.35); close.push(await snap(page));
      await sheet(page, close, 2, 640, 360, 'damage_crumple_closeup.png', ['taxi after a 30 mph wall hit', 'other side']);
      console.log('damage');
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
          return { instances: V.scene.getObjectByName('vehicle-traffic').children.reduce((s: number, m: any) => s + (m.visible ? m.count : 0), 0) / 3, setInstancesMsAvg: t.reduce((a, b) => a + b, 0) / t.length, setInstancesMsP95: t[Math.floor(t.length * 0.95)] };
        });
        await page.waitForTimeout(500);
        const draw = await page.evaluate(() => { window.__VEH.renderOnce(); const i = window.__VEH.renderer.info.render; return { drawCalls: i.drawCalls, triangles: i.triangles }; });
        res[`${q}_${n}`] = { ...r, ...draw };
        if (q === 'high') fs.writeFileSync(path.join(OUT, 'traffic_150.png'), await snap(page));
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
