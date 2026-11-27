/**
 * Touch controls (TOUCH_CONTROLS.md) on a phone in landscape, against the lab's scripted touch host:
 * every state, real thumb drags (CDP touch events, so the page sees pointerType "touch"), the analog
 * pedals, tap-to-lock, a flick to switch targets, the layout editor and the left-handed mirror.
 * Each step asserts what the game would receive (Input values, gameplay calls) and screenshots.
 *   npx tsx tools/ui/touchControls.ts
 */
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './shots';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'shots/ui/touchcontrols'); fs.mkdirSync(OUT, { recursive: true });
const log: string[] = []; let n = 0, fails = 0;

await withServer(async (base) => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs: string[] = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`${base}/uilab.html?screen=hud&touch=1&city=${process.argv.includes('--city') ? 1 : 0}&waypoint=0`);
  await page.waitForFunction(() => (window as any).__UI?.ui?.touch, null, { timeout: 120_000 });
  await page.evaluate(() => (window as any).__UI.ready);
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);

  const shot = async (name: string) => { await page.waitForTimeout(260); await page.screenshot({ path: path.join(OUT, `${String(++n).padStart(2, '0')}_${name}.png`) }); };
  const check = (name: string, ok: boolean, detail = '') => { log.push(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`); if (!ok) fails++; };
  const state = () => page.evaluate(() => { const u = (window as any).__UI; return { ...u.ui.touch.state, log: u.host.touchLog.slice(), move: { ...u.input.touchMove }, held: [...u.input.touchHeld] }; });
  const box = async (id: string) => (await page.locator(`.tc-id-${id}`).boundingBox())!;
  const centre = async (id: string) => { const b = await box(id); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  // pointer events are delivered on the next animation frame: wait one before reading state
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number, id = 1) => { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] }); await page.waitForTimeout(40); };
  async function drag(from: { x: number; y: number }, to: { x: number; y: number }, opts: { steps?: number; hold?: boolean; ms?: number } = {}) {
    await touch('touchStart', from.x, from.y); const k = opts.steps ?? 6;
    for (let i = 1; i <= k; i++) { await touch('touchMove', from.x + (to.x - from.x) * i / k, from.y + (to.y - from.y) * i / k); await page.waitForTimeout((opts.ms ?? 120) / k); }
    if (!opts.hold) await touch('touchEnd', to.x, to.y);
  }
  async function tapAt(p: { x: number; y: number }) { await touch('touchStart', p.x, p.y); await page.waitForTimeout(60); await touch('touchEnd', p.x, p.y); await page.waitForTimeout(120); }
  const visible = (ids: string[]) => page.evaluate((ids) => ids.filter((id) => !document.querySelector(`.tc-id-${id}`)!.classList.contains('off')), ids);
  const ALL = ['jump', 'fire', 'gas', 'ctx', 'weapon', 'cover', 'brake', 'reload', 'handbrake', 'driveby', 'steerL', 'steerR', 'menu'];

  // ---- on foot
  await page.waitForTimeout(600);
  let v = await visible(ALL); check('on foot shows ctx, jump, weapon, menu', ['ctx', 'jump', 'weapon', 'menu'].every((x) => v.includes(x)) && v.length === 4, v.join(','));
  check('context label from gameplay', (await page.locator('.tc-id-ctx').innerText()).includes('Steal car'));
  await shot('foot');
  await page.evaluate(() => { (window as any).__UI.host.travKind = 'climb'; }); await page.waitForTimeout(400);
  check('traversal: the jump button relabels (Jump -> Climb)', (await page.locator('.tc-id-jump').textContent())!.trim() === 'Climb');
  await shot('foot_climb');
  await page.evaluate(() => { (window as any).__UI.host.travKind = null; }); await page.waitForTimeout(400);
  check('traversal gone: back to Jump', (await page.locator('.tc-id-jump').textContent())!.trim() === 'Jump');
  await drag({ x: 150, y: 290 }, { x: 160, y: 225 }, { hold: true });
  let s = await state(); check('stick: forward walk', s.move.y > 0.6 && Math.abs(s.move.x) < 0.3, `y=${s.move.y.toFixed(2)}`);
  await shot('foot_stick');
  await touch('touchMove', 160, 170); s = await state(); check('stick past the rim sprints', s.held.includes('sprint'));
  await touch('touchEnd', 160, 170); s = await state(); check('release stops', s.move.x === 0 && s.move.y === 0 && !s.held.includes('sprint'));
  // look on the right: a drag turns the camera (addLook), no lock outside combat
  await drag({ x: 560, y: 200 }, { x: 500, y: 200 });

  // ---- steal a car -> driving (tap the context button)
  await tapAt(await centre('ctx')); await page.waitForTimeout(400);
  s = await state(); check('context: steal car -> driving', s.mode === 'drive', s.mode);
  v = await visible(ALL); check('driving shows gas, brake, hand brake, exit, drive-by, menu', ['gas', 'brake', 'handbrake', 'ctx', 'driveby', 'menu'].every((x) => v.includes(x)) && !v.includes('jump'), v.join(','));
  const ctxFoot = await centre('ctx');
  await shot('drive');
  const gas = await box('gas');
  await drag({ x: gas.x + gas.width / 2, y: gas.y + gas.height - 8 }, { x: gas.x + gas.width / 2, y: gas.y + gas.height * 0.3 }, { hold: true });
  s = await state(); check('gas pedal is analog (slide up = more)', s.pedals.gas > 0.6 && s.pedals.gas < 0.8, `gas=${s.pedals.gas.toFixed(2)}`);
  // steer with the left thumb while the right holds the gas (two touches)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: gas.x + gas.width / 2, y: gas.y + gas.height * 0.3, id: 1 }, { x: 170, y: 300, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: gas.x + gas.width / 2, y: gas.y + gas.height * 0.3, id: 1 }, { x: 200, y: 260, id: 2 }] });
  await page.waitForTimeout(60);
  s = await state(); check('steering is horizontal only, with gas held', s.steer > 0.4 && s.move.y === 0 && s.pedals.gas > 0.6, `steer=${s.steer.toFixed(2)} y=${s.move.y}`);
  await shot('drive_gas_and_steer');
  await touch('touchEnd', 0, 0);
  s = await state(); check('lifting both thumbs: no gas, no steer', s.pedals.gas === 0 && s.steer === 0);
  const brake = await box('brake');
  await drag({ x: brake.x + brake.width / 2, y: brake.y + brake.height - 6 }, { x: brake.x + brake.width / 2, y: brake.y + brake.height * 0.75 }, { hold: true });
  s = await state(); check('light brake (hold at a light)', s.pedals.brake > 0.15 && s.pedals.brake < 0.4, `brake=${s.pedals.brake.toFixed(2)}`);
  await touch('touchMove', brake.x + brake.width / 2, brake.y + 4); s = await state(); check('firm brake (reverse at a stop)', s.pedals.brake > 0.9);
  await shot('drive_brake');
  await touch('touchEnd', 0, 0);
  await tapAt(await centre('handbrake')); s = await state(); check('hand brake', s.log.includes('handbrake:true') && s.log.includes('handbrake:false'));
  check('exit sits where enter was (stable slot)', JSON.stringify(await centre('ctx')) === JSON.stringify(ctxFoot));
  // park: exit
  await tapAt(await centre('ctx')); await page.waitForTimeout(400);
  s = await state(); check('context: get out -> on foot', s.mode === 'foot', s.mode);

  // ---- fight: draw the weapon -> combat
  await tapAt(await centre('weapon')); await page.waitForTimeout(400);
  s = await state(); check('weapon tap draws -> combat', s.mode === 'combat', s.mode);
  v = await visible(ALL); check('combat shows fire, cover, reload, context', ['fire', 'cover', 'reload', 'ctx'].every((x) => v.includes(x)) && !v.includes('weapon'), v.join(','));
  const fireAt = await centre('fire'), jumpWasAt = fireAt;
  await page.evaluate(() => (window as any).__UI.ui.update(0.016));
  await shot('combat');
  const tgt = await page.evaluate(() => { const l = (window as any).__UI.host.touch.lockables(); return l[1]; });
  await tapAt({ x: tgt.x + 14, y: tgt.y - 10 }); await page.waitForTimeout(200);
  s = await state(); check('tap near an enemy locks it (56 px)', s.log.includes(`lock:${tgt.id}`));
  await shot('combat_locked');
  // a flick is ~100 ms: raw events, no per-event waits
  for (const [type, x] of [['touchStart', 620], ['touchMove', 660], ['touchMove', 700], ['touchMove', 725], ['touchEnd', 725]] as const) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: 182, id: 1 }] }); await page.waitForTimeout(18); }
  await page.waitForTimeout(60);
  s = await state(); check('flick switches target', s.log.some((l: string) => l.startsWith('swipe:1')));
  await touch('touchStart', fireAt.x, fireAt.y); await page.waitForTimeout(150); await touch('touchEnd', fireAt.x, fireAt.y);
  s = await state(); check('fire button press and release', s.log.includes('fire:true') && s.log.includes('fire:false'));
  await tapAt(await centre('reload')); s = await state(); check('reload', s.log.includes('reload'));
  const rl = await centre('reload'); await drag(rl, { x: rl.x - 50, y: rl.y }); s = await state(); check('swipe on reload swaps weapon', s.log.some((l: string) => l.startsWith('swap:')));
  await tapAt(await centre('cover')); s = await state(); check('cover', s.log.includes('cover'));

  // ---- layout editor
  await page.evaluate(() => (window as any).__UI.ui.touch.edit(() => {}));
  await shot('editor_foot');
  const jb = await centre('jump');
  check('jump shares the fire slot', Math.abs(jb.x - jumpWasAt.x) < 1 && Math.abs(jb.y - jumpWasAt.y) < 1, `${jb.x},${jb.y} vs ${jumpWasAt.x},${jumpWasAt.y}`);
  await drag(jb, { x: jb.x - 40, y: jb.y - 30 });
  const lay = await page.evaluate(() => (window as any).__UI.ui.touch && JSON.parse(localStorage.getItem('t74.settings.v1') ?? '{}').touchLayout);
  check('drag moves and saves the control', lay?.foot?.jump && Math.abs(lay.foot.jump.dx - 40) <= 2 && Math.abs(lay.foot.jump.dy - 30) <= 2, JSON.stringify(lay?.foot?.jump));
  await page.locator('.tc-edit button', { hasText: '+' }).tap();
  await page.locator('.tc-edit button', { hasText: 'Driving' }).tap();
  await shot('editor_drive');
  await page.locator('.tc-edit button', { hasText: 'On foot' }).tap();
  await page.locator('.tc-edit button', { hasText: /^Reset/ }).tap();
  await page.locator('.tc-edit button', { hasText: 'Done' }).tap();
  await page.waitForTimeout(250); // controls glide back over 150 ms
  const after = await centre('jump'); check('reset restores the slot', Math.abs(after.x - jumpWasAt.x) < 1);

  // ---- left-handed mirror, driving
  await page.evaluate(() => { const u = (window as any).__UI; u.host.touchMode = 'drive'; import(/* @vite-ignore */ '/src/settings/Settings.ts' as string).then((m) => m.settings.set('touchLeftHanded', true)); });
  await page.waitForTimeout(500);
  const g2 = await centre('gas'); check('left-handed: pedals move to the left', g2.x < 200, `gas x=${g2.x}`);
  await shot('drive_lefthanded');
  await page.evaluate(() => import(/* @vite-ignore */ '/src/settings/Settings.ts' as string).then((m) => m.settings.set('touchLeftHanded', false)));

  // ---- iPhone: no element fullscreen -> the button opens the Add to Home Screen card (forced with ?ios=1)
  await page.goto(`${base}/uilab.html?screen=hud&touch=1&city=0&waypoint=0&ios=1`);
  await page.waitForFunction(() => (window as any).__UI?.ui?.touch, null, { timeout: 120_000 }); await page.waitForTimeout(600);
  await page.locator('.t74-fs').tap();
  const card = page.locator('.u-installcard');
  check('iPhone: fullscreen button opens the install card', await card.isVisible());
  const txt = await card.innerText();
  check('card: Safari steps, Add to Home Screen', /Share in the toolbar/.test(txt) && /Add to Home Screen/.test(txt), txt.replace(/\s+/g, ' ').slice(0, 90));
  await shot('ios_install_card');
  await card.locator('.ic-ok').tap();
  check('card closes', !(await card.isVisible()));

  const cost = await page.evaluate(() => (window as any).__UI.ui.touch.cost.frame);
  log.push(`touch layer update: ${cost.toFixed(3)} ms (EMA, headless)`);
  if (errs.length) { log.push(`PAGE ERRORS: ${errs.join(' | ')}`); fails++; }
  await browser.close();
});
fs.writeFileSync(path.join(OUT, 'RESULT.txt'), log.join('\n') + '\n');
console.log(log.join('\n')); console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
