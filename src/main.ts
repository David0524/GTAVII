import * as THREE from 'three/webgpu';
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

/**
 * URL parameters (all optional):
 *   quality=low|medium|high|ultra   webgl=1 (force WebGL2 backend)   hud=0|1   minimap=0   touch=1
 *   cam=x,y,z,yawDeg,pitchDeg        start in photo (free) camera at this pose (screenshot rig)
 *   at=x,z,headingDeg                start on foot at this point instead of the Flatiron spawn
 */
type Mode = 'onfoot' | 'photo';

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
  if (input.isTouch || params.has('touch')) {
    input.isTouch = true;
    new TouchControls(input, [
      { label: 'JUMP', action: 'jump', hold: true },
      { label: 'RUN', action: 'sprint', hold: true },
      { label: 'CAM', action: 'photo', hold: false },
      { label: 'HUD', action: 'hud', hold: false },
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

  // ---------------------------------------------------------------- HUD, minimap, report
  const hud = new DebugHud(document.body);
  // ?hud=1 forces the debug HUD on (phone testing), ?hud=0 forces it off; default: on for desktop, off for touch.
  if (params.get('hud') === '0' || (input.isTouch && params.get('hud') !== '1')) hud.toggle(false);
  const minimap = params.get('minimap') === '0' ? null : new Minimap(document.body, streets, world.manifest.region, world.manifest.heroes);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    // Keep the horizontal field of view sane on very wide phone screens (19.5:9 landscape).
    camera.fov = camera.aspect > 2 ? 52 : 60;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize); onResize();

  const frames = new FrameStats();
  const clock = new THREE.Timer();
  let hudT = 0, streetName = '', streetT = 0, frameCount = 0, syncT = 0;
  const debug = {
    backend, quality: quality.name, frames, world, renderer, scene, camera, physics, player, party, input, RAPIER,
    get mode() { return mode; }, setMode,
    /** Resolves when every chunk the current view wants is resident and has been drawn once. */
    whenIdle: () => new Promise<void>((res) => { const t = () => (world.idle && frameCount > 3 && (mode === 'photo' || player.active) ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => { setMode('photo'); fly.set(x, y, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)); },
  };
  (window as unknown as { __T74: typeof debug }).__T74 = debug;
  const report = mountReportButton(() => buildReport({
    renderer, backend, quality: quality.name, frames, world, device: input.activeDevice,
    view: `${camera.position.x.toFixed(0)},${camera.position.y.toFixed(0)},${camera.position.z.toFixed(0)} ${mode}`,
  }));
  report.show(hud.visible);
  document.getElementById('loading')?.remove();

  // Controls hint (follows the active device and mode) and controller connect/disconnect toasts.
  const style = document.createElement('style'); style.textContent = PROMPT_CSS; document.head.appendChild(style);
  const hint = document.createElement('div');
  Object.assign(hint.style, { position: 'fixed', right: '14px', bottom: '30px', color: '#e6dcc6', font: '12px Archivo, ui-sans-serif, sans-serif', textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '4' });
  document.body.appendChild(hint);
  function renderHint() {
    const d = input.activeDevice;
    hint.style.display = d === 'touch' ? 'none' : '';
    const items: Parameters<typeof promptStrip>[1] = mode === 'onfoot'
      ? [['sprint', 'Sprint'], ['jump', 'Jump / climb'], ['photo', 'Free cam'], ['hud', 'Debug']]
      : [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['photo', 'Back to player']];
    hint.innerHTML = promptStrip(input, items) + (d === 'kbm' ? `<span style="opacity:.7">WASD move · mouse look${mode === 'photo' ? ' · wheel speed' : ' · wheel zoom'}</span>` : '');
  }
  renderHint();
  input.onDeviceChange(renderHint);
  const toast = (msg: string) => {
    const t = document.createElement('div'); t.textContent = msg;
    Object.assign(t.style, { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', padding: '8px 14px', background: '#0d0b09dd', color: '#efe6d0', borderLeft: '3px solid #e8b92e', font: '600 13px Archivo, sans-serif', letterSpacing: '.04em', zIndex: '30', transition: 'opacity .4s' });
    document.body.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
  };
  window.addEventListener('gamepadconnected', () => { toast(`Controller connected · ${input.pad.family === 'playstation' ? 'PlayStation' : input.pad.family === 'xbox' ? 'Xbox' : 'Gamepad'} layout`); input.rumble(0.4, 0.6, 180); });
  window.addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));

  // ---------------------------------------------------------------- loop
  renderer.setAnimationLoop((t) => {
    clock.update(t);
    const dt = Math.min(clock.getDelta(), 0.1);
    frames.push(dt * 1000);
    input.poll(dt);
    if (input.pressed('hud')) { hud.toggle(); report.show(hud.visible); }
    if (input.pressed('photo')) setMode(mode === 'onfoot' ? 'photo' : 'onfoot');
    if (input.pressed('jump')) jumpLatch = true;

    // physics colliders stream around the player; the player waits until the ground under it exists
    if ((syncT -= dt) <= 0) { physics.sync(player.pos.x, player.pos.z, world.manifest.chunkSize); syncT = 0.2; }
    if (!player.active && physics.readyAround(player.pos.x, player.pos.z, world.manifest.chunkSize)) player.active = true;

    if (mode === 'onfoot') {
      physics.update(dt, (h) => { player.fixedUpdate(h, input, orbit.yaw, jumpLatch); jumpLatch = false; });
      const rp = player.renderPos(physics.alpha);
      body.object.position.set(rp.x, rp.y, rp.z);
      body.setLocomotion(player.loco());
      body.update(dt);
      orbit.update(dt, rp);
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
    minimap?.draw(p.x, p.z, yaw);
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
