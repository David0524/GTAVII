import * as THREE from 'three/webgpu';
import './ui/theme.css';
import { bootUi } from './ui';
import type { UiHost, StreetRec } from './shared/uiHost';
import { Emitter, type UiEvents } from './shared/uiEvents';
import { createRenderer } from './engine/renderer';
import { qualityFromUrl } from './engine/quality';
import { World } from './world/World';
import { loadSkyline } from './world/Skyline';
import { Atmosphere } from './world/Atmosphere';
import { FlyCamera } from './camera/FlyCamera';
import { OrbitCamera } from './camera/OrbitCamera';
import { CameraDirector } from './camera/CameraDirector';
import { DebugHud, FrameStats } from './engine/debug/DebugHud';
import { unproject } from './shared/geo';
import { SIDEWALK_H } from './world/meshBuilder';
import { loadTerrain, heightAt } from './shared/terrain';
import { Input } from './input/Input';
import { loadReport } from './engine/debug/LoadReport';
import { buildReport, mountReportButton } from './engine/debug/PerfReport';
import { Physics } from './physics/Physics';
import RAPIER from '@dimforge/rapier3d-compat';
import { PlayerController } from './player/PlayerController';
import { StandInBody, type PlayerBody } from './player/StandInBody';
import { Party } from './player/Party';
import { SaveManager } from './save/SaveManager';
import type { SaveData } from './save/schema';
import { worldClock, clockLabel, tickClock, setTime } from './world/Clock';
import { buildStreetLights, streetLightUniforms } from './world/StreetLights';
import { Locator } from './world/Districts';
import { settings } from './settings/Settings';
import { facadeUniforms } from './render/FacadeMaterial';
import { PostFX, postUniforms } from './render/PostFX';

/**
 * URL parameters (all optional):
 *   quality=low|medium|high|ultra   webgl=1 (force WebGL2 backend)   hud=0|1   minimap=0   touch=1
 *   cam=x,y,z,yawDeg,pitchDeg        start in photo (free) camera at this pose (screenshot rig)
 *   at=x,z,headingDeg                start on foot at this point instead of the Flatiron spawn
 *   title=0                          skip the title screen (implied by cam= and at=)
 */
type Mode = 'onfoot' | 'photo';

async function main() {
  loadReport.mark('main');
  const params = new URLSearchParams(location.search);
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);
  loadReport.mark('renderer');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 30000);
  const atmosphere = new Atmosphere(scene);
  if (params.has('ao')) facadeUniforms.aoStrength.value = Number(params.get('ao'));
  // sky IBL: opt-in until verified against the look target; ?env=<intensity> (the raw sky is ~20x brighter than the fill)
  atmosphere.envEnabled = params.has('env') && params.get('env') !== '0';
  if (atmosphere.envEnabled) atmosphere.envIntensity = Number(params.get('env')) || 0.05;
  if (quality.shadows && params.get('shadows') !== '0') atmosphere.enableShadows(renderer, quality.name === 'high' || quality.name === 'ultra' ? 2048 : 1024);

  const [physics] = await Promise.all([Physics.create(), loadTerrain()]);
  loadReport.mark('physics+terrain');
  const world = new World(quality);
  await world.load();
  loadReport.mark('manifest');
  scene.add(world.root);
  world.onChunkReady.add((c) => physics.addChunk(c));
  world.onChunkUnload.add((k) => physics.removeChunk(k));
  const base = import.meta.env.BASE_URL + 'data/';
  const [skyline, streets] = await Promise.all([
    loadSkyline(base + 'skyline.bin'),
    fetch(base + 'streets.json').then((r) => r.json() as Promise<StreetRec[]>),
  ]);
  scene.add(skyline);
  const streetLights = buildStreetLights(streets);
  scene.add(streetLights);
  loadReport.mark('streets+lights');

  // ---------------------------------------------------------------- input
  const input = new Input(renderer.domElement);
  // touch: the UI's TouchLayout (src/ui/touch) is built by createUi when input.isTouch
  if (input.isTouch || params.has('touch')) { input.isTouch = true; document.body.classList.add('touch'); }

  // ---------------------------------------------------------------- player + cameras
  const { spawn } = world.manifest;
  const at = params.get('at')?.split(',').map(Number);
  const start = at ? { x: at[0], z: at[1], heading: THREE.MathUtils.degToRad(at[2] ?? 0) } : spawn;
  const startY = heightAt(start.x, start.z) + SIDEWALK_H;
  const party = new Party({ x: start.x, y: startY, z: start.z, heading: start.heading });
  const player = new PlayerController(physics, start.x, startY, start.z, start.heading);
  const body: PlayerBody = new StandInBody();
  scene.add(body.object);
  // Gameplay cameras write into director.gameplay; the director owns the real camera (cutscene hand-off).
  const director = new CameraDirector(camera);
  const orbit = new OrbitCamera(director.gameplay, input, physics, player.collider);
  orbit.snap({ x: start.x, y: startY, z: start.z }, start.heading);
  const fly = new FlyCamera(director.gameplay, input);
  let mode: Mode = 'onfoot';
  const camParam = params.get('cam');
  if (camParam) {
    const [x, y0, z, yaw, pitch] = camParam.split(',').map(Number);
    const y = params.has('camrel') ? y0 + heightAt(x, z) + SIDEWALK_H : y0; // ?camrel=1: y is height above the ground
    fly.set(x, y, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch || 0));
    mode = 'photo';
  }
  const setMode = (m: Mode) => {
    if (m === mode) return;
    if (m === 'photo') { const e = new THREE.Euler().setFromQuaternion(director.gameplay.quaternion, 'YXZ'); fly.set(director.gameplay.position.x, director.gameplay.position.y, director.gameplay.position.z, e.y, e.x); }
    else orbit.snap(player.pos, orbit.yaw);
    mode = m;
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

  // ---------------------------------------------------------------- HUD, minimap, report
  const hud = new DebugHud(document.body);
  // ?hud=1 forces the debug HUD on (phone testing), ?hud=0 forces it off; default: on for desktop, off for touch.
  // Debug HUD is a developer overlay: off unless ?hud=1 (F3 / D-pad up toggles it in play).
  if (params.get('hud') !== '1') hud.toggle(false);

  // Viewport sync. The canvas fills #app via CSS; every frame we compare its real client size (and the
  // device pixel ratio) with what the renderer was last sized to, and resize on any change. Resize events
  // alone are not enough on iOS Safari: on rotation it can fire 'resize' with the pre-rotation
  // innerWidth and no follow-up event, leaving a portrait-width frame on a landscape screen (bug report
  // 2026-11-26, iPhone landscape: 3D covered the left ~45% only).
  const view = renderer.domElement; view.classList.add('t74-view');
  let lastW = 0, lastH = 0, lastDpr = 0, lastFov = -1;
  const onResize = (force = false) => {
    const w = view.clientWidth || window.innerWidth, h = view.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1, fov = settings.get('fov');
    if (!force && w === lastW && h === lastH && dpr === lastDpr && fov === lastFov) return;
    if (dpr !== lastDpr && lastDpr) renderer.setPixelRatio(Math.min(dpr, matchMedia('(pointer: coarse)').matches ? 1.5 : 2) * quality.pixelRatio);
    lastW = w; lastH = h; lastDpr = dpr; lastFov = fov;
    camera.aspect = w / h;
    // Keep the horizontal field of view sane on very wide phone screens (19.5:9 landscape).
    camera.fov = fov - (camera.aspect > 2 ? 8 : 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); // CSS owns the element size; this sets the drawing buffer + viewport
  };
  window.addEventListener('resize', () => onResize());
  window.addEventListener('orientationchange', () => onResize());
  window.visualViewport?.addEventListener('resize', () => onResize());
  // The canvas's own layout size: fires on any change, whatever window events iOS does or doesn't send.
  new ResizeObserver(() => onResize()).observe(view);
  onResize(true);
  // Per-frame safety net. It only DETECTS a change; the resize itself runs as a separate task, never
  // inside the frame callback (resizing the WebGPU canvas mid-frame broke rendering).
  let resizeQueued = false;
  const checkSize = () => {
    if (resizeQueued || (view.clientWidth === lastW && view.clientHeight === lastH && (window.devicePixelRatio || 1) === lastDpr)) return;
    resizeQueued = true; setTimeout(() => { resizeQueued = false; onResize(); }, 0);
  };
  settings.subscribe((_s, k) => { if (k === 'fov') onResize(true); });

  // ?time=HH:MM sets the clock (screenshot rig), ?timescale=0 freezes it; ?night= overrides window lighting.
  if (params.has('time')) setTime(params.get('time')!);
  if (params.has('timescale')) worldClock.scale = Number(params.get('timescale'));
  const nightOverride = params.has('night') ? Number(params.get('night')) : null;
  if (params.has('lit')) facadeUniforms.litScale.value = Number(params.get('lit'));
  // Film-look post stack (bloom, halation, tonemap, 1974 grade, grain); ?post=0 renders raw.
  const postfx = params.get('post') === '0' ? null : new PostFX(renderer, scene, camera, quality);
  const frames = new FrameStats();
  const clock = new THREE.Timer();
  let hudT = 0, frameCount = 0, syncT = 0, titleReady = false, heldFrames = 0, heldW = 0, heldH = 0;
  const uiRef: { ui?: Awaited<ReturnType<typeof bootUi>> } = {};
  const debug = {
    backend, quality: quality.name, frames, world, renderer, scene, camera, load: loadReport, physics, player, party, input, RAPIER, director, THREE, get saves() { return saves; },
    get mode() { return mode; }, setMode, get screen() { return uiRef.ui?.state ?? 'loading'; }, get ui() { return uiRef.ui; },
    /** Resolves when every chunk the current view wants is resident and has been drawn once. */
    whenIdle: () => new Promise<void>((res) => { const t = () => (world.idle && frameCount > 3 && (mode === 'photo' || player.active || uiRef.ui?.state === 'title') ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => { setMode('photo'); fly.set(x, y, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)); },
  };
  (window as unknown as { __T74: typeof debug }).__T74 = debug;
  const report = mountReportButton(() => buildReport({
    renderer, backend, quality: quality.name, frames, world, device: input.activeDevice,
    view: `${camera.position.x.toFixed(0)},${camera.position.y.toFixed(0)},${camera.position.z.toFixed(0)} ${mode}`,
  }));
  report.show(hud.visible);
  document.getElementById('loading')?.remove();

  // ---------------------------------------------------------------- UI (UI & Cinematics stream: one host, one update)
  // The UI reads the game only through this UiHost (src/shared/uiHost.ts). Gameplay, sim and narrative
  // replace the placeholder answers below as they merge (health, inventory, heat, objectives, shops...).
  const locator = new Locator(streets);
  let loc = { district: '', crossing: '' }, locT = 0, frozen = false;
  let objective: { text: string } | null = null;
  const uiEvents = new Emitter<UiEvents>();
  const LEAD_STYLE: Record<string, { colour: string; tagline: string }> = {
    'char.teddy_arce': { colour: '#c79a3c', tagline: 'Night desk, Hotel Corwin' }, 'char.delphine_moore': { colour: '#b2302a', tagline: 'Eighth Avenue' }, 'char.nick_varelas': { colour: '#2e4a6b', tagline: 'Varelas & Co., furs' },
  };
  const placeAt = () => { const p = player.pos; player.active = false; orbit.snap(p, player.heading); mode = 'onfoot'; };
  const host: UiHost = {
    input, saves, streets, baseUrl: import.meta.env.BASE_URL, heroes: world.manifest.heroes,
    player: () => { const p = mode === 'onfoot' ? body.object.position : camera.position; return { x: p.x, z: p.z, yaw: mode === 'onfoot' ? orbit.yaw : fly.yaw, speed: mode === 'onfoot' ? Math.hypot(player.vel.x, player.vel.z) : 0, inVehicle: false, lead: party.activeId }; },
    clock: () => ({ date: worldClock.date, minutes: worldClock.minutes, weather: worldClock.weather }),
    party: () => [...party.leads.values()].map((l) => ({ id: l.id, name: l.displayName, short: l.displayName, tagline: LEAD_STYLE[l.id]?.tagline ?? '', colour: LEAD_STYLE[l.id]?.colour ?? '#c79a3c', cash: l.money, where: l.id === party.activeId ? loc.crossing : 'Elsewhere in the city', available: true })),
    health: () => ({ hp: 100, max: 100, injuries: [], stamina: 1, staminaMax: 1, heatExhaustion: 0 }),
    inventory: (lead = party.activeId) => { const l = party.leads.get(lead) ?? party.active; return { lead: l.id, cash: l.money, savings: 0, outfit: { name: 'Everyday clothes', hides: 'jacket', description: '' }, items: [] }; },
    heat: () => ({ phase: 'none', cones: [], units: [] }),
    objective: () => objective,
    location: () => loc,
    shop: () => null, newspaper: () => null, businesses: () => [], completion: () => [], achievements: () => [],
    stats: () => [{ group: 'Time', label: 'Play time', value: `${Math.floor(performance.now() / 60000)} min this session` }],
    act: (a) => {
      if (a.kind === 'switchLead') {
        storeActiveLead(); if (!party.switchTo(a.lead)) return { ok: false, text: 'Not available' };
        const t = party.active.at; player.teleport(t.x, t.y, t.z, t.heading); placeAt(); uiEvents.emit('lead', { id: a.lead }); return { ok: true };
      }
      if (a.kind === 'waypoint') return { ok: true };
      return { ok: false, text: 'Not in the game yet' };
    },
    on: (k, cb) => uiEvents.on(k, cb),
    camera: director, scene,
    freezePlayer: (f) => { frozen = f; },
    playerVisible: (v) => { body.object.visible = v; },
    commit: (cue, data) => {
      // Phase 7's mission runtime takes these over; until then the objective cue sets the HUD line.
      const d = data as { text?: string } | undefined;
      if (cue === 'mission.objective' && d?.text) { objective = { text: d.text }; uiEvents.emit('objective', objective); }
    },
    prompts: () => (mode === 'onfoot' ? [['sprint', 'Sprint'], ['jump', 'Jump · climb'], ['map', 'Map'], ['inventory', 'Pockets']] : [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['photo', 'Back to player']]),
    newGame: () => { loadReport.mark('new-game'); const y = heightAt(spawn.x, spawn.z) + SIDEWALK_H; player.teleport(spawn.x, y, spawn.z, spawn.heading); placeAt(); },
    continueGame: async () => {
      const last = await saves.latest().catch(() => null);
      if (!last) { host.newGame!(); return true; }
      try { await saves.load(last.slot); mode = 'onfoot'; return true; } catch { return false; }
    },
  };
  const ui = await bootUi(host, { title: !skipTitle }); uiRef.ui = ui;
  if (!skipTitle) mode = 'photo';
  // title-screen camera: slow drift past the Flatiron at dusk
  const flat = world.manifest.heroes.find((h) => h.name === 'Flatiron Building') ?? { x: 0, z: 0 };
  let titleT = 0;
  const TITLE_RADIUS = 300; // m around the title camera's target
  let shaderWarm: Promise<void> | null = null, shadersReady = false;
  const attributionEl = document.getElementById('attribution');

  // ---------------------------------------------------------------- loop
  renderer.setAnimationLoop((t) => {
    const cpu0 = performance.now();
    clock.update(t);
    const rawDt = clock.getDelta(); loadReport.frame(rawDt * 1000);
    const dt = Math.min(rawDt, 0.1);
    frames.push(dt * 1000);
    facadeUniforms.time.value += dt;
    input.poll(dt);
    if (ui.state === 'title') {
      titleT += dt;
      const a = -0.35 + titleT * 0.018, r = 150;
      fly.set(flat.x + Math.sin(a) * r, 26 + Math.sin(titleT * 0.05) * 4, flat.z - 40 - Math.cos(a) * r, 0, 0);
      director.gameplay.lookAt(flat.x, 34, flat.z);
      // Gate the title on the first view only (chunks around the Flatiron + compiled shaders); the rest of
      // the city keeps streaming behind the menu and play (engine adb6373: load bug 2026-11-26).
      const near = world.progressNear(flat.x, flat.z - 40, TITLE_RADIUS);
      ui.titleProgress(near.total ? (near.ready / near.total) * (shadersReady ? 1 : 0.92) : 0);
      if (!shaderWarm && near.ready > 0) {
        shaderWarm = (renderer as unknown as { compileAsync(s: THREE.Object3D, c: THREE.Camera): Promise<void> }).compileAsync(scene, camera)
          .catch(() => undefined).then(() => { shadersReady = true; loadReport.mark('shaders'); });
        setTimeout(() => { shadersReady = true; }, 8000); // never block the menu on a slow/failed warm-up
      }
      if (near.ready === near.total && shadersReady && frameCount > 3 && !titleReady) { titleReady = true; loadReport.mark('title-ready'); console.info('[T74 load]\n' + loadReport.text()); void saves.latest().then((l) => ui.titleReady(l ? l.label : null)); }
    }
    ui.update(dt);
    const playing = ui.state === 'play' && !ui.paused;
    if (attributionEl) attributionEl.style.display = ui.state === 'title' || playing ? '' : 'none';
    if (playing && input.pressed('hud')) { hud.toggle(); report.show(hud.visible); }
    if (playing && input.pressed('photo')) setMode(mode === 'onfoot' ? 'photo' : 'onfoot');
    if (playing && input.pressed('jump')) jumpLatch = true;
    if (playing && mode === 'onfoot' && player.active) saves.tick(dt);
    if (frozen) jumpLatch = false;
    if (playing) tickClock(dt); // the clock pauses in menus, the title and cutscenes
    const light = atmosphere.update();
    atmosphere.updateEnvironment(renderer);
    facadeUniforms.night.value = nightOverride ?? light.night;
    streetLightUniforms.lightsOn.value = light.lightsOn;
    renderer.toneMappingExposure = light.exposure;
    { const f = mode === 'onfoot' ? body.object.position : camera.position; atmosphere.followFocus(f.x, f.y, f.z); }
    postUniforms.bloomStrength.value = 0.12 + 0.38 * light.lightsOn;

    // physics colliders stream around the player; the player waits until the ground under it exists
    if ((syncT -= dt) <= 0) { physics.sync(player.pos.x, player.pos.z, world.manifest.chunkSize); syncT = 0.2; }
    if (!player.active && physics.readyAround(player.pos.x, player.pos.z, world.manifest.chunkSize)) { player.active = true; if (ui.state === 'play') loadReport.mark('playable'); }

    if (!playing && ui.state !== 'title' && ui.state !== 'cutscene') {
      // paused: world frozen, camera holds
    } else if (mode === 'onfoot') {
      physics.update(dt, (h) => { if (!frozen) player.fixedUpdate(h, input, orbit.yaw, jumpLatch); jumpLatch = false; });
      const rp = player.renderPos(physics.alpha);
      body.object.position.set(rp.x, rp.y, rp.z);
      body.setLocomotion(player.loco());
      body.update(dt);
      orbit.update(dt, rp);
    } else if (ui.state === 'title') {
      physics.update(dt, () => { jumpLatch = false; });
    } else {
      physics.update(dt, () => { jumpLatch = false; });
      fly.update(dt);
    }
    input.endFrame();
    director.update(dt);
    world.update(mode === 'onfoot' ? body.object.position : camera.position);
    checkSize(); // cheap: two clientWidth reads; catches every size change the events miss
    // A menu over the game (pause hub, shop, any modal) holds the last frame instead of re-rendering the
    // city behind it: same picture, a fraction of the GPU and battery (and the canvas keeps its last
    // presented frame). Render again on any resize, which clears the drawing buffer.
    const hold = ui.hub.open || (ui.state === 'play' && ui.paused) || (ui.state === 'cutscene' && ui.cinema.paused);
    const vw = view.width, vh = view.height;
    if (!hold || heldFrames < 2 || vw !== heldW || vh !== heldH) { if (postfx) postfx.render(); else renderer.render(scene, camera); }
    heldFrames = hold ? heldFrames + 1 : 0; heldW = vw; heldH = vh;
    if (frameCount === 0) loadReport.mark('first-frame');
    loadReport.frameCpu(performance.now() - cpu0);
    frameCount++;

    const p = mode === 'onfoot' ? body.object.position : camera.position;
    if ((locT -= dt) <= 0) { locT = 0.5; loc = { district: locator.district(p.x, p.z), crossing: locator.intersection(p.x, p.z) }; streetLabel = loc.crossing; }
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
        `near ${loc.crossing}  ui ${ui.state}  hud ${ui.hud.cost.frame.toFixed(2)} ms  minimap ${ui.hud.minimap.cost.draw.toFixed(2)} ms\n` +
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
