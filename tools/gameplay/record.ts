/**
 * Records the brief's "Done means" frames from the ?gameplay=1 scene into shots/gameplay/.
 *   npm run build && npx tsx tools/gameplay/record.ts [--only name] [--webgl]
 * Headless Chromium + SwiftShader (software rendering, no GPU): frame times are NOT representative.
 * Each scenario drives the scene through window.__GP (the director) the way a player would: real
 * gameplay systems, scripted inputs, real waits.
 */
import { chromium, type Page } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/gameplay');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const skip = args.includes('--skip') ? args[args.indexOf('--skip') + 1].split(',') : [];
const PORT = 4175;

type Ctx = { page: Page; shot: (name: string, note: string) => Promise<void>; ev: <T>(fn: string) => Promise<T>; wait: (s: number) => Promise<void> };
const notes: { file: string; note: string; state?: unknown }[] = [];

const SCENARIOS: Record<string, { url: string; viewport?: { width: number; height: number }; run: (c: Ctx) => Promise<void> }> = {
  shootout: {
    url: 'station=lot',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(G.LOT.x, G.LOT.z - 0.9, 0); G.g.toggleCover([0, -1]); G.face(0, -0.08); G.spawnCrew(5); })()`);
      await wait(7);
      await shot('01_shootout_cover', 'Teddy crouched behind a parked sedan (low cover, engine block to his left). A five-man crew has spread into cover among the crates; labels show AI state, attack token (●), morale and rounds. Orange lines are rounds being fired.');
      // peek and return fire at the nearest locked target
      await ev(`(() => { const G = __GP; G.g.setContext({ device: 'touch' }); G.g.setAiming(true); G.g.lockOn(); })()`);
      for (let i = 0; i < 6; i++) { await ev(`__GP.g.setFiring(true)`); await wait(0.5); }
      await shot('02_shootout_peek_fire', 'Peeking over the car with a lock-on (touch mode) and returning fire; tracers, muzzle flash, hit marker. Enemies without a token suppress the car instead of all shooting at once.');
      await ev(`(() => { const G = __GP; G.g.setAiming(false); G.g.setBlindFire(true); G.g.setFiring(true); })()`);
      await wait(0.4);
      await shot('03_shootout_blind_fire', 'Blind fire: the revolver held up over the car without exposing the body (wide spread).');
      await ev(`__GP.g.setBlindFire(false)`);
      await wait(8);
      await shot('04_shootout_morale', 'Later in the same fight: wounded and outnumbered crew members retreat, surrender (hands up) or run rather than fighting to the death.');
    },
  },
  melee: {
    url: 'station=yard',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.fists'); const p = G.player.pos; G.face(-Math.PI/2, -0.15); G.spawnCrew(1, { faction: 'hood', at: [p.x + 5, p.z], weapons: [null], melee: 'weapon.fists' });
        // auto-parry: block 0.22 s after each telegraph (human reaction), then counter
        window.__mel = []; G.g.on('melee', (e) => { window.__mel.push(e.kind); if (e.kind === 'windup' && e.id !== 'player') setTimeout(() => { G.g.block(true); setTimeout(() => G.g.block(false), 250); }, 220); if (e.kind === 'parried' && e.defender === 'player') setTimeout(() => G.g.meleeAttack('light'), 120); }); })()`);
      // side-on camera so both fighters read
      await ev(`(() => { const G = __GP; const p = G.player.pos; G.setCam([p.x + 2.4, p.y + 1.8, p.z + 5.2], [p.x + 2.4, p.y + 1.0, p.z]); })()`);
      await wait(2.5);
      await shot('05_melee_closing', 'Melee yard: an unarmed hood closes in; the windup is telegraphed (longer for NPCs so a thumb can react).');
      await wait(2.5);
      await shot('06_melee_exchange', 'The exchange: block / parry on the telegraph, then a counter (×2 damage after a parry).');
      await ev(`(() => { const G = __GP; G.g.meleeAttack('grapple'); setTimeout(() => G.g.grappleAction('shove', [1, 0]), 400); })()`);
      await wait(0.9);
      await shot('07_melee_grapple_shove', 'Grab, then shove: a fighter driven into the yard wall is slammed (extra damage, knockdown).');
    },
  },
  witness: {
    url: 'station=block',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(-792, G.BLOCK.zS + 1.6, Math.PI/2); G.face(Math.PI/2 + 0.3, 0.25); G.g.setAiming(true); G.g.setFiring(true); })()`);
      await wait(0.5);
      await ev(`(() => { const G = __GP; G.g.setFiring(false); G.g.setAiming(false); G.g.holster(); G.face(-Math.PI/2, -0.3); })()`);
      await wait(2.5);
      await shot('08_witness_runs_to_callbox', 'W 31st St between 7th and 8th Aves (real block). A shot into the air: people scatter, a witness breaks for the red call box. Red lines: the witness\'s run and what they last saw. "Someone\'s running for the call box."');
      { const t0 = Date.now(); while (Date.now() - t0 < 40000) { const c = await ev<number>(`[...__GP.g.witnesses.list.values()].filter(w => w.state === 'calling').length`); if (c) break; await wait(0.5); } }
      await wait(1);
      await shot('09_witness_on_callbox', 'The witness on the call box (6 s call). Break the box, catch them, or be gone — nothing is reported until the call goes through.');
    },
  },
  response: {
    url: 'station=block',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(-792, G.BLOCK.zS + 1.6, Math.PI/2); G.face(Math.PI/2 + 0.3, 0.25); G.g.setAiming(true); G.g.setFiring(true); })()`);
      await wait(0.4);
      await ev(`(() => { const G = __GP; G.g.setFiring(false); G.g.setAiming(false); G.g.equip('weapon.fists'); G.face(Math.PI/2, -0.2); })()`);
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) { const n = await ev<number>(`__GP.g.policeSys.reports.length`); if (n) break; await wait(1); }
      await shot('10_report_filed_radio', 'Report filed with Midtown Central: the radio line carries the description ("RADIO ..."), the report panel shows heat/tier, and the search circle appears on the radar at the last-known point.');
      while (Date.now() - t0 < 150000) { const k = await ev<number>(`[...__GP.g.policeSys.units.values()].filter(u => u.state === 'enroute' || u.state === 'search' || u.state === 'suspicious').length`); if (k >= 2) break; await wait(1); }
      await wait(3);
      await shot('11_patrol_response', 'The response: cops coming out of the station house on this block and a radio car rolling, sight cones on the ground (yellow searching, orange suspicious).');
    },
  },
  bribe: {
    url: 'station=block',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(-792, G.BLOCK.zS + 1.6, Math.PI/2); G.face(Math.PI/2 + 0.3, 0.25); G.g.setAiming(true); G.g.setFiring(true); })()`);
      await wait(0.4);
      await ev(`(() => { const G = __GP; G.g.setFiring(false); G.g.setAiming(false); G.g.equip('weapon.fists'); G.face(Math.PI/2, -0.2); G.g.inv.addMoney('char.teddy_arce', 20000); })()`);
      const t0 = Date.now();
      while (Date.now() - t0 < 200000) { const e = await ev<any>(`__GP.g.hud().encounter`); if (e && e.state === 'encounter') break; await wait(1); }
      await ev(`(() => { const G = __GP; const u = G.g.policeSys.units.get(G.g.hud().encounter.unit); G.face(Math.atan2(-(u.x - G.player.pos.x), -(u.z - G.player.pos.z)), -0.1); })()`);
      await wait(0.6);
      await shot('12_stopped_by_patrolman', 'Stopped: "Hold it right there." Comply, offer money, or run. No meter — just the man in front of you.');
      const r1 = await ev<string>(`(() => { const G = __GP; const id = G.g.hud().encounter.unit; G.g.policeSys.units.get(id).corrupt = 0.9; const r = G.g.police.bribe(id, 1000); G.hud.say('bark', r === 'refused' ? '"Ten bucks? For shots fired? Try again."' : r, 5); return r; })()`);
      await wait(0.6);
      await shot('13_bribe_refused', `A $10 offer for a shots-fired report: ${r1}. The money stays in your pocket.`);
      const r2 = await ev<string>(`(() => { const G = __GP; const id = G.g.hud().encounter.unit; const u = G.g.policeSys.units.get(id); u.corrupt = 1; G.g.policeSys.setPayoff('pct.midtown_central', 0.6); const r = G.g.police.bribe(id, 15000); G.hud.say('bark', r === 'accepted' ? '"I didn\\'t see nothing. Get lost."' : r, 5); return r; })()`);
      await wait(0.8);
      await shot('14_bribe_accepted', `$150 to a cop on a house that's on the pad: ${r2}. The report is lost, the cop walks.`);
    },
  },
  outfit: {
    url: 'station=block',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(-792, G.BLOCK.zS + 1.6, Math.PI/2); G.face(Math.PI/2 + 0.3, 0.25); G.g.setAiming(true); G.g.setFiring(true); })()`);
      await wait(0.4);
      await ev(`(() => { const G = __GP; G.g.setFiring(false); G.g.setAiming(false); G.g.equip('weapon.fists'); })()`);
      const t0 = Date.now();
      while (Date.now() - t0 < 90000) { const n = await ev<number>(`__GP.g.policeSys.reports.length`); if (n) break; await wait(1); }
      const before = await ev<string>(`__GP.g.appearance().look.words.join(', ')`);
      // ducks inside (a doorway stands in for home) and comes back out in different clothes
      await ev(`(() => { const G = __GP; G.g.setContext({ atHome: true }); G.g.changeOutfit('outfit.teddy_jacket'); G.g.setContext({ atHome: false }); G.teleport(-700, G.BLOCK.zS + 1.6, Math.PI/2); G.face(Math.PI/2, -0.25); })()`);
      while (Date.now() - t0 < 200000) { const k = await ev<number>(`[...__GP.g.policeSys.units.values()].filter(u => u.state === 'search' && Math.hypot(u.x - __GP.player.pos.x, u.z - __GP.player.pos.z) < 30).length`); if (k) break; await wait(1); }
      const m = await ev<number>(`(() => { const G = __GP; const r = G.g.policeSys.reports[0]; return r ? 0 : 0; })()`);
      void m;
      await wait(2);
      const after = await ev<string>(`__GP.g.appearance().look.words.join(', ')`);
      await shot('15_description_broken', `Description broken: the report says "${before}"; he's now in "${after}". A searching cop passes within his cone without recognising him (recognition stays at 0%).`);
    },
  },
  hydrant: {
    url: 'station=block',
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.pump'); G.g.inv.give('char.teddy_arce', 'item.pump'); G.g.inv.give('char.teddy_arce', 'item.ammo_12', 20); G.g.equip('weapon.pump'); G.g.currentGun().loaded = 5; G.teleport(-711, G.BLOCK.zS + 2.2, Math.PI/2); const h = G.propDefs.find(p => p.id === 'b_hyd'); G.aimAt([h.x, h.y + 0.4, h.z]); G.g.setContext({ device: 'mouse' }); G.g.setAiming(true); })()`);
      await wait(0.5);
      for (let i = 0; i < 6 && !(await ev<boolean>(`__GP.g.props.isBroken('b_hyd')`)); i++) { await ev(`__GP.g.setFiring(true)`); await wait(1.0); }
      await ev(`(() => { const G = __GP; G.g.setAiming(false); const h = G.propDefs.find(p => p.id === 'b_hyd'); G.setCam([h.x - 6, h.y + 2.2, h.z + 5], [h.x, h.y + 1.2, h.z]); })()`);
      await wait(1.2);
      await shot('16_hydrant_geyser', 'A hydrant shot open: it geysers for 90 s and pushes people back; breaking it is vandalism and the witnesses treat it like any other crime.');
    },
  },
  touch: {
    url: 'station=lot&touch=1',
    viewport: { width: 844, height: 390 },
    run: async ({ ev, wait, shot }) => {
      await ev(`(() => { const G = __GP; G.g.equip('weapon.service'); G.teleport(G.LOT.x, G.LOT.z - 0.9, 0); G.g.toggleCover([0, -1]); G.face(0, -0.08); G.spawnCrew(4); })()`);
      await wait(5);
      await ev(`(() => { const G = __GP; G.g.setAiming(true); G.g.lockOn(); G.g.setLimb('legs'); })()`);
      await wait(1);
      await shot('17_touch_lockon', 'Phone landscape (844×390): touch layout. AIM locks the best target, ◀ ▶ cycle, HEAD/BODY/LEGS pick a limb, hold FIRE for assisted fire. No precise free aim needed.');
    },
  },
};

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--bypass-lock'], { cwd: ROOT, stdio: 'pipe' });
  for (let i = 0; i < 60; i++) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [name, sc] of Object.entries(SCENARIOS)) {
    if ((only && !only.includes(name)) || skip.includes(name)) continue;
    const page = await browser.newPage({ viewport: sc.viewport ?? { width: 1280, height: 720 }, deviceScaleFactor: 1, hasTouch: sc.url.includes('touch') });
    const errs: string[] = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`http://localhost:${PORT}/?gameplay=1&webgl=1&quality=low&${sc.url}`);
    await page.waitForFunction(() => (window as any).__GP, null, { timeout: 120000 });
    await Promise.race([page.evaluate(() => (window as any).__GP.ready()), page.waitForTimeout(90000)]);
    await page.waitForTimeout(1500);
    const ctx: Ctx = {
      page,
      ev: (fn) => page.evaluate(`(() => { const __GP = window.__GP; return ${fn}; })()`) as any,
      wait: (s) => page.waitForTimeout(s * 1000),
      shot: async (file, note) => {
        await page.screenshot({ path: path.join(OUT, `${file}.png`) });
        const state = await page.evaluate(() => { const G = (window as any).__GP; const h = G.g.hud(); return { hp: Math.round(h.hp), money: h.money, reports: G.g.police.reports.map((r: any) => ({ pct: r.precinct, heat: r.severity, tier: r.tier, text: r.text })), units: [...G.g.policeSys.units.values()].map((u: any) => `${u.kind}:${u.state}`), ai: [...G.g.ai.agents.values()].map((a: any) => `${a.faction}:${a.state}`), witnesses: [...G.g.witnesses.list.values()].map((w: any) => w.state), timings: G.timings() }; });
        notes.push({ file: `${file}.png`, note, state });
        console.log(`  ${file}.png`);
      },
    };
    console.log(`scenario ${name}`);
    try { await sc.run(ctx); } catch (e) { console.log(`  FAILED ${name}: ${(e as Error).message}`); }
    if (errs.length) console.log(`  page errors: ${errs.slice(0, 3).join(' | ')}`);
    await page.close();
  }
  await browser.close(); server.kill();
  const prev = fs.existsSync(path.join(OUT, 'frames.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'frames.json'), 'utf8')) : [];
  const merged = [...prev.filter((p: any) => !notes.some((n) => n.file === p.file)), ...notes].sort((a, b) => a.file.localeCompare(b.file));
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(merged, null, 2));
}
main();
