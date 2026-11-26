import * as THREE from 'three/webgpu';
import './ui/theme.css';
import { createRenderer } from './engine/renderer';
import { qualityFromUrl } from './engine/quality';
import { World } from './world/World';
import { loadSkyline } from './world/Skyline';
import { Atmosphere } from './world/Atmosphere';
import { FlyCamera } from './camera/FlyCamera';
import { OrbitCamera } from './camera/OrbitCamera';
import { DebugHud, FrameStats } from './ui/DebugHud';
import { Minimap, type StreetRec } from './ui/Minimap';
import { unproject } from './shared/geo';
import { SIDEWALK_H } from './world/meshBuilder';
import { loadTerrain, heightAt } from './shared/terrain';
import { Input } from './input/Input';
import { TouchControls } from './ui/TouchControls';
import { promptStrip, PROMPT_CSS } from './ui/Prompts';
import { buildReport, mountReportButton } from './ui/PerfReport';
import { Physics } from './physics/Physics';
import RAPIER from '@dimforge/rapier3d-compat';
import { PlayerController } from './player/PlayerController';
import { StandInBody, type PlayerBody } from './player/StandInBody';
import { Party } from './player/Party';
import { SaveManager, iosEvictionRisk } from './save/SaveManager';
import type { SaveData } from './save/schema';
import { worldClock, clockLabel } from './world/Clock';
import { Hud } from './ui/Hud';
import { PauseMenu } from './ui/PauseMenu';
import { TitleScreen } from './ui/TitleScreen';
import { Locator } from './world/Districts';
import { settings } from './settings/Settings';

/**
 * URL parameters (all optional):
 *   quality=low|medium|high|ultra   webgl=1 (force WebGL2 backend)   hud=0|1   minimap=0   touch=1
 *   cam=x,y,z,yawDeg,pitchDeg        start in photo (free) camera at this pose (screenshot rig)
 *   at=x,z,headingDeg                start on foot at this point instead of the Flatiron spawn
 *   title=0                          skip the title screen (implied by cam= and at=)
 */
type Mode = 'onfoot' | 'photo';
type Screen = 'title' | 'play' | 'paused';

async function main() {
  const params = new URLSearchParams(location.search);
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 30000);
  new Atmosphere(scene);

  const [physics] = await Promise.all([Physics.create(), loadTerrain()]);
  const world = new World(quality);
  await world.load();
  scene.add(world.root);
  world.onChunkReady.add((c) => physics.addChunk(c));
  world.onChunkUnload.add((k) => physics.removeChunk(k));
  const base = import.meta.env.BASE_URL + 'data/';
  const [skyline, streets] = await Promise.all([
    loadSkyline(base + 'skyline.bin'),
    fetch(base + 'streets.json').then((r) => r.json() as Promise<StreetRec[]>),
  ]);
  scene.add(skyline);

  // ---------------------------------------------------------------- input
  const input = new Input(renderer.domElement);
  let touch: TouchControls | null = null;
  if (input.isTouch || params.has('touch')) {
    input.isTouch = true;
    touch = new TouchControls(input, [
      { label: 'JUMP', action: 'jump', hold: true },
      { label: 'RUN', action: 'sprint', hold: true },
      { label: 'CAM', action: 'photo', hold: false },
      { label: 'MENU', action: 'pause', hold: false },
    ]);
    document.body.classList.add('touch');
  }

  // ---------------------------------------------------------------- player + cameras
  const { spawn } = world.manifest;
  const at = params.get('at')?.split(',').map(Number);
  const start = at ? { x: at[0], z: at[1], heading: THREE.MathUtils.degToRad(at[2] ?? 0) } : spawn;
  const startY = heightAt(start.x, start.z) + SIDEWALK_H;
  const party = new Party({ x: start.x, y: startY, z: start.z, heading: start.heading });
  const player = new PlayerController(physics, start.x, startY, start.z, start.heading);
  const body: PlayerBody = new StandInBody();
  scene.add(body.object);
  const orbit = new OrbitCamera(camera, input, physics, player.collider);
  orbit.snap({ x: start.x, y: startY, z: start.z }, start.heading);
  const fly = new FlyCamera(camera, input);
  let mode: Mode = 'onfoot';
  const camParam = params.get('cam');
  if (camParam) {
    const [x, y, z, yaw, pitch] = camParam.split(',').map(Number);
    fly.set(x, y, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch || 0));
    mode = 'photo';
  }
  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'photo') { const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); fly.set(camera.position.x, camera.position.y, camera.position.z, e.y, e.x); }
    else orbit.snap(player.pos, orbit.yaw);
    mode = m; renderHint();
  };
  let jumpLatch = false;

  // ---------------------------------------------------------------- saves (local profiles; cloud later)
  let narrativeState: SaveData['narrative'] = { act: 1, flags: {}, missions: {}, relationships: {} };
  let streetLabel = '';
  const storeActiveLead = () => { const a = party.active; a.at = { x: player.pos.x, y: player.pos.y, z: player.pos.z, heading: player.heading }; };
  const saves = await SaveManager.create({
    snapshot: () => {
      storeActiveLead();
      const characters: SaveData['party']['characters'] = {};
      for (const [id, l] of party.leads) characters[id] = { money: l.money, inventory: [...l.inventory], wardrobe: l.wardrobe, at: { ...l.at } };
      return { world: { date: worldClock.date, minutes: worldClock.minutes, weather: worldClock.weather }, party: { activeCharacter: party.activeId, characters }, narrative: narrativeState };
    },
    label: () => `${streetLabel || 'Manhattan'} — ${clockLabel()}`,
    apply: (s) => {
      worldClock.date = s.world.date; worldClock.minutes = s.world.minutes; worldClock.weather = s.world.weather;
      for (const [id, c] of Object.entries(s.party.characters)) {
        const l = party.leads.get(id);
        if (l) Object.assign(l, { money: c.money, inventory: [...c.inventory], wardrobe: c.wardrobe, at: { ...c.at } });
        else party.leads.set(id, { id, displayName: id.replace(/^char\./, ''), ...c, inventory: [...c.inventory], at: { ...c.at } });
      }
      party.switchTo(s.party.activeCharacter);
      narrativeState = s.narrative;
      const a = party.active.at;
      player.teleport(a.x, a.y, a.z, a.heading); player.active = false; // re-activates once colliders exist there
      orbit.snap(a, a.heading);
    },
  });
  const skipTitle = params.get('title') === '0' || params.has('cam') || params.has('at');
  let screen: Screen = skipTitle ? 'play' : 'title';

  // ---------------------------------------------------------------- HUD, minimap, report
  const hud = new DebugHud(document.body);
  // ?hud=1 forces the debug HUD on (phone testing), ?hud=0 forces it off; default: on for desktop, off for touch.
  // Debug HUD is a developer overlay: off unless ?hud=1 (F3 / D-pad up toggles it in play).
  if (params.get('hud') !== '1') hud.toggle(false);
  const minimap = params.get('minimap') === '0' ? null : new Minimap(document.body, streets, world.manifest.region, world.manifest.heroes);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    // Keep the horizontal field of view sane on very wide phone screens (19.5:9 landscape).
    camera.fov = settings.get('fov') - (camera.aspect > 2 ? 8 : 0);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize); onResize();
  settings.subscribe((_s, k) => { if (k === 'fov') onResize(); });

  const frames = new FrameStats();
  const clock = new THREE.Timer();
  let hudT = 0, streetName = '', streetT = 0, frameCount = 0, syncT = 0, titleReady = false;
  const debug = {
    backend, quality: quality.name, frames, world, renderer, scene, camera, physics, player, party, input, RAPIER, get saves() { return saves; },
    get mode() { return mode; }, setMode, get screen() { return screen; }, get hudUi() { return gameHud; }, get pause() { return pause; },
    /** Resolves when every chunk the current view wants is resident and has been drawn once. */
    whenIdle: () => new Promise<void>((res) => { const t = () => (world.idle && frameCount > 3 && (mode === 'photo' || player.active || screen === 'title') ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => { setMode('photo'); fly.set(x, y, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)); },
  };
  (window as unknown as { __T74: typeof debug }).__T74 = debug;
  const report = mountReportButton(() => buildReport({
    renderer, backend, quality: quality.name, frames, world, device: input.activeDevice,
    view: `${camera.position.x.toFixed(0)},${camera.position.y.toFixed(0)},${camera.position.z.toFixed(0)} ${mode}`,
  }));
  report.show(hud.visible);
  document.getElementById('loading')?.remove();

  // Game UI: HUD (clock, location reveals, subtitles, prompts), pause menu, title screen.
  const style = document.createElement('style'); style.textContent = PROMPT_CSS; document.head.appendChild(style);
  const gameHud = new Hud();
  const locator = new Locator(streets);
  let district = '', crossing = '', locT = 0;
  function renderHint() {
    const d = input.activeDevice;
    gameHud.prompts.style.display = d === 'touch' || screen !== 'play' ? 'none' : '';
    const items: Parameters<typeof promptStrip>[1] = mode === 'onfoot'
      ? [['sprint', 'Sprint'], ['jump', 'Jump · climb'], ['map', 'Map'], ['pause', 'Pause']]
      : [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['photo', 'Back to player']];
    gameHud.prompts.innerHTML = promptStrip(input, items);
  }
  const toast = (msg: string) => {
    const t = document.createElement('div'); t.textContent = msg;
    Object.assign(t.style, { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', padding: '8px 14px', background: '#0d0b09dd', color: '#efe6d0', borderLeft: '3px solid #e8b92e', font: '600 13px Archivo, sans-serif', letterSpacing: '.04em', zIndex: '30', transition: 'opacity .4s' });
    document.body.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
  };
  window.addEventListener('gamepadconnected', () => { toast(`Controller connected · ${input.pad.family === 'playstation' ? 'PlayStation' : input.pad.family === 'xbox' ? 'Xbox' : 'Gamepad'} layout`); input.rumble(0.4, 0.6, 180); });
  window.addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));

  const pause = new PauseMenu(input, streets, world.manifest.heroes, saves);
  pause.onToast = toast;
  pause.onLoaded = () => { mode = 'onfoot'; };
  const title = skipTitle ? null : new TitleScreen(input, async (c) => {
    if (c.kind === 'settings') { pause.show('settings'); return; }
    if (c.kind === 'credits') { pause.show('credits'); return; }
    if (c.kind === 'continue') {
      const last = await saves.latest().catch(() => null);
      if (last) { try { await saves.load(last.slot); } catch (e) { toast(`Could not load: ${(e as Error).message}`); return; } }
    } else {
      const y = heightAt(spawn.x, spawn.z) + SIDEWALK_H;
      player.teleport(spawn.x, y, spawn.z, spawn.heading); player.active = false; orbit.snap(player.pos, spawn.heading);
    }
    mode = 'onfoot'; title!.close(); screen = 'play'; district = ''; renderHint();
    gameHud.setVisible(true);
  });
  if (title) { gameHud.setVisible(false); mode = 'photo'; }
  pause.onClose = () => { if (screen === 'paused') { screen = 'play'; renderHint(); } };
  const setScreenForPause = () => { screen = 'paused'; renderHint(); };
  // Desktop: Esc releases the mouse before any key event reaches the page, so losing pointer lock
  // during play is the pause signal (standard PC behaviour).
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && screen === 'play' && !pause.open && input.activeDevice === 'kbm') {
      pause.map.player = { x: player.pos.x, z: player.pos.z, yaw: orbit.yaw }; pause.show(); setScreenForPause();
    }
  });
  renderHint();
  // title-screen camera: slow drift past the Flatiron at dusk
  const flat = world.manifest.heroes.find((h) => h.name === 'Flatiron Building') ?? { x: 0, z: 0 };
  let titleT = 0;
  const attributionEl = document.getElementById('attribution');
  const fsEl = document.querySelector('.t74-fs') as HTMLElement | null;

  // Quick save / load until the pause menu lands (UI pass): F5 / F9.
  window.addEventListener('keydown', async (e) => {
    if (e.code === 'F5') { e.preventDefault(); const m = await saves.save('quick'); toast(`Saved · ${m.label}`); }
    if (e.code === 'F9') { e.preventDefault(); const d = await saves.load('quick').catch((err) => { toast(String(err.message ?? err)); return null; }); if (d) toast(`Loaded · ${d.label}`); }
  });
  // iOS deletes site storage after ~7 days unvisited unless installed: gentle, dismissible, in-world note.
  const ios = iosEvictionRisk();
  if (ios.atRisk) {
    let snoozed = false; try { snoozed = Date.now() - Date.parse(localStorage.getItem('t74.iosNoteSnooze') ?? '0') < 3 * 86400000; } catch { /* ignore */ }
    const long = (ios.daysSinceLastVisit ?? 0) > 4;
    if (!snoozed || long) saves.onSaved.add(function once() {
      saves.onSaved.delete(once);
      const n = document.createElement('div');
      n.innerHTML = `<b style="font:600 13px 'League Gothic',sans-serif;letter-spacing:.12em">${long ? 'WELCOME BACK. KEEP YOUR SAVES SAFE' : 'A NOTE ABOUT SAVES'}</b><br>On iPhone and iPad, saves can be cleared after a week away.<br>Share → <i>Add to Home Screen</i> keeps them for good. <u style="cursor:pointer">Got it</u>`;
      Object.assign(n.style, { position: 'fixed', left: '50%', bottom: 'calc(18px + env(safe-area-inset-bottom))', transform: 'translateX(-50%) rotate(-1.2deg)', maxWidth: '360px', padding: '12px 14px', background: '#efe3c4', color: '#2e171d', font: "12px/1.45 'Courier Prime', monospace", boxShadow: '0 6px 18px #000a', zIndex: '40' });
      n.querySelector('u')!.addEventListener('click', () => { n.remove(); try { localStorage.setItem('t74.iosNoteSnooze', new Date().toISOString()); } catch { /* ignore */ } });
      document.body.appendChild(n);
    });
  }

  // ---------------------------------------------------------------- loop
  renderer.setAnimationLoop((t) => {
    clock.update(t);
    const dt = Math.min(clock.getDelta(), 0.1);
    frames.push(dt * 1000);
    input.poll(dt);
    if (screen === 'title') {
      titleT += dt;
      const a = -0.35 + titleT * 0.018, r = 150;
      fly.set(flat.x + Math.sin(a) * r, 26 + Math.sin(titleT * 0.05) * 4, flat.z - 40 - Math.cos(a) * r, 0, 0);
      camera.lookAt(flat.x, 34, flat.z);
      const wanted = world.stats.ready + world.stats.loading;
      title!.progress(wanted ? world.stats.ready / wanted : 0);
      if (world.idle && frameCount > 10) { if (!titleReady) { titleReady = true; void saves.latest().then((l) => title!.setReady(l ? l.label : null)); } }
      if (pause.open) pause.update(dt); else title!.update(dt);
    } else if (screen === 'paused' || pause.open) {
      pause.map.player = { x: player.pos.x, z: player.pos.z, yaw: mode === 'onfoot' ? orbit.yaw : fly.yaw };
      pause.update(dt);
    } else {
      if (input.pressed('pause')) { pause.map.player = { x: player.pos.x, z: player.pos.z, yaw: orbit.yaw }; pause.show(); setScreenForPause(); }
      else if (input.pressed('map')) { pause.map.player = { x: player.pos.x, z: player.pos.z, yaw: orbit.yaw }; pause.show('map'); setScreenForPause(); }
    }
    const playing = screen === 'play' && !pause.open;
    gameHud.setVisible(playing);
    if (attributionEl) attributionEl.style.display = screen === 'title' || playing ? '' : 'none';
    if (fsEl) fsEl.style.display = playing && input.activeDevice === 'touch' ? '' : 'none';
    if (touch) touch.root.style.display = playing && input.activeDevice === 'touch' ? '' : 'none';
    if (playing && input.pressed('hud')) { hud.toggle(); report.show(hud.visible); }
    if (playing && input.pressed('photo')) setMode(mode === 'onfoot' ? 'photo' : 'onfoot');
    if (playing && input.pressed('jump')) jumpLatch = true;
    if (playing && mode === 'onfoot' && player.active) saves.tick(dt);

    // physics colliders stream around the player; the player waits until the ground under it exists
    if ((syncT -= dt) <= 0) { physics.sync(player.pos.x, player.pos.z, world.manifest.chunkSize); syncT = 0.2; }
    if (!player.active && physics.readyAround(player.pos.x, player.pos.z, world.manifest.chunkSize)) player.active = true;

    if (!playing && screen !== 'title') {
      // paused: world frozen, camera holds
    } else if (mode === 'onfoot') {
      physics.update(dt, (h) => { player.fixedUpdate(h, input, orbit.yaw, jumpLatch); jumpLatch = false; });
      const rp = player.renderPos(physics.alpha);
      body.object.position.set(rp.x, rp.y, rp.z);
      body.setLocomotion(player.loco());
      body.update(dt);
      orbit.update(dt, rp);
    } else if (screen === 'title') {
      physics.update(dt, () => { jumpLatch = false; });
    } else {
      physics.update(dt, () => { jumpLatch = false; });
      fly.update(dt);
    }
    input.endFrame();
    world.update(mode === 'onfoot' ? body.object.position : camera.position);
    renderer.render(scene, camera);
    frameCount++;

    const p = mode === 'onfoot' ? body.object.position : camera.position;
    const yaw = mode === 'onfoot' ? orbit.yaw : fly.yaw;
    if ((streetT -= dt) <= 0 && minimap) { streetName = minimap.nearestStreet(p.x, p.z); streetT = 0.5; }
    if ((locT -= dt) <= 0) { locT = 0.5; district = locator.district(p.x, p.z); crossing = locator.intersection(p.x, p.z); streetLabel = crossing; }
    if (screen === 'play') gameHud.update(dt, district, crossing);
    if (minimap) { minimap.canvas.style.display = screen === 'play' && settings.get('hud') ? '' : 'none'; minimap.draw(p.x, p.z, yaw); }
    if ((hudT -= dt) <= 0) {
      hudT = 0.25;
      const s = frames.summary();
      const info = renderer.info.render;
      const [lon, lat] = unproject(p.x, p.z);
      hud.set(
        `TENDERLOIN '74  phase 2  [${backend.toUpperCase()} | ${quality.name}]\n` +
        `frame ${s.avg.toFixed(2)} ms avg  ${s.p95.toFixed(2)} p95  (${s.fps.toFixed(0)} fps)\n` +
        `draws ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
        `chunks lod0 ${world.stats.lod0}  lod1 ${world.stats.lod1}  loading ${world.stats.loading}  phys ${physics.stats.chunksWithColliders}\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  ${lat.toFixed(5)}, ${lon.toFixed(5)}\n` +
        `${mode}${mode === 'onfoot' ? `  ${player.mode} ${Math.hypot(player.vel.x, player.vel.z).toFixed(1)} m/s ${player.grounded ? 'grounded' : 'air'}${player.climbing ? ' climbing' : ''}${player.active ? '' : ' (waiting for ground)'}` : ''}  ${party.active.displayName}\n` +
        `near ${streetName}\n` +
        `input ${input.activeDevice}${input.pad.connected ? ` (${input.pad.id.slice(0, 40)})` : ''}`,
      );
    }
  });
}

main().catch((e) => {
  console.error(e);
  const el = document.getElementById('loading');
  if (el) el.textContent = `Failed to start: ${(e as Error).message}`;
});
