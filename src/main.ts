import * as THREE from 'three/webgpu';
import { createRenderer } from './engine/renderer';
import { qualityFromUrl } from './engine/quality';
import { World } from './world/World';
import { loadSkyline } from './world/Skyline';
import { Atmosphere } from './world/Atmosphere';
import { FlyCamera } from './camera/FlyCamera';
import { DebugHud, FrameStats } from './ui/DebugHud';
import { Minimap, type StreetRec } from './ui/Minimap';
import { unproject } from './shared/geo';
import { SIDEWALK_H } from './world/meshBuilder';
import { Input } from './input/Input';
import { TouchControls } from './ui/TouchControls';
import { promptStrip, PROMPT_CSS } from './ui/Prompts';

/**
 * URL parameters (all optional):
 *   quality=low|medium|high|ultra   webgl=1 (force WebGL2 backend)   hud=0   minimap=0
 *   cam=x,y,z,yawDeg,pitchDeg        (override the spawn camera; used by the screenshot rig)
 */
async function main() {
  const params = new URLSearchParams(location.search);
  if (params.has('audio')) return void import('./audio/test/entry').then((m) => m.startAudioTest(params)); // audio workstream test scene / offline harness
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.3, 30000);
  new Atmosphere(scene);

  const world = new World(quality);
  await world.load();
  scene.add(world.root);
  const base = import.meta.env.BASE_URL + 'data/';
  const [skyline, streets] = await Promise.all([
    loadSkyline(base + 'skyline.bin'),
    fetch(base + 'streets.json').then((r) => r.json() as Promise<StreetRec[]>),
  ]);
  scene.add(skyline);

  const input = new Input(renderer.domElement);
  if (input.isTouch || params.has('touch')) {
    input.isTouch = true;
    new TouchControls(input, [
      { label: 'UP', action: 'rise', hold: true },
      { label: 'FAST', action: 'sprint', hold: true },
      { label: 'DOWN', action: 'sink', hold: true },
      { label: 'HUD', action: 'hud', hold: false },
    ]);
    document.body.classList.add('touch');
  }
  const fly = new FlyCamera(camera, input);
  const { spawn } = world.manifest;
  const camParam = params.get('cam');
  if (camParam) {
    const [x, y, z, yaw, pitch] = camParam.split(',').map(Number);
    fly.set(x, y, z, THREE.MathUtils.degToRad(yaw), THREE.MathUtils.degToRad(pitch || 0));
  } else {
    fly.set(spawn.x, SIDEWALK_H + 1.65, spawn.z, spawn.heading, THREE.MathUtils.degToRad(4));
  }

  const hud = new DebugHud(document.body);
  if (params.get('hud') === '0' || (input.isTouch && !params.has('hud'))) { hud.visible = false; hud.el.style.display = 'none'; }
  const minimap = params.get('minimap') === '0' ? null : new Minimap(document.body, streets, world.manifest.region, world.manifest.heroes);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    // Keep the horizontal field of view sane on very wide phone screens (19.5:9 landscape).
    camera.fov = camera.aspect > 2 ? 52 : 60;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const frames = new FrameStats();
  const clock = new THREE.Timer();
  let hudT = 0, streetName = '', streetT = 0, frameCount = 0;
  const debug = {
    backend, quality: quality.name, frames, world, renderer, scene, camera,
    /** Resolves when every chunk the current view wants is resident and has been drawn once. */
    whenIdle: () => new Promise<void>((res) => { const t = () => (world.idle && frameCount > 3 ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => fly.set(x, y, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)),
  };
  (window as unknown as { __T74: typeof debug }).__T74 = debug;
  document.getElementById('loading')?.remove();

  // Controls hint (follows the active device) and controller connect/disconnect toasts.
  const style = document.createElement('style'); style.textContent = PROMPT_CSS; document.head.appendChild(style);
  const hint = document.createElement('div');
  Object.assign(hint.style, { position: 'fixed', right: '14px', bottom: '30px', color: '#e6dcc6', font: '12px Archivo, ui-sans-serif, sans-serif', textShadow: '0 1px 3px #000', pointerEvents: 'none', zIndex: '4' });
  document.body.appendChild(hint);
  const renderHint = () => {
    const d = input.activeDevice;
    hint.style.display = d === 'touch' ? 'none' : '';
    hint.innerHTML = d === 'kbm'
      ? promptStrip(input, [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['hud', 'Debug']]) + '<span style="opacity:.7">WASD move · mouse look · wheel speed</span>'
      : promptStrip(input, [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['hud', 'Debug']]);
  };
  renderHint();
  input.onDeviceChange(renderHint);
  const toast = (msg: string) => {
    const t = document.createElement('div'); t.textContent = msg;
    Object.assign(t.style, { position: 'fixed', top: '14px', left: '50%', transform: 'translateX(-50%)', padding: '8px 14px', background: '#0d0b09dd', color: '#efe6d0', borderLeft: '3px solid #e8b92e', font: '600 13px Archivo, sans-serif', letterSpacing: '.04em', zIndex: '30', transition: 'opacity .4s' });
    document.body.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 2600);
  };
  window.addEventListener('gamepadconnected', (e) => { toast(`Controller connected · ${input.pad.family === 'playstation' ? 'PlayStation' : input.pad.family === 'xbox' ? 'Xbox' : 'Gamepad'} layout`); input.rumble(0.4, 0.6, 180); void e; });
  window.addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));

  renderer.setAnimationLoop((t) => {
    clock.update(t);
    const dt = Math.min(clock.getDelta(), 0.1);
    frames.push(dt * 1000);
    input.poll(dt);
    if (input.pressed('hud')) hud.toggle();
    fly.update(dt);
    input.endFrame();
    world.update(camera.position);
    renderer.render(scene, camera);
    frameCount++;

    const p = camera.position;
    if ((streetT -= dt) <= 0 && minimap) { streetName = minimap.nearestStreet(p.x, p.z); streetT = 0.5; }
    minimap?.draw(p.x, p.z, fly.yaw);
    if ((hudT -= dt) <= 0) {
      hudT = 0.25;
      const s = frames.summary();
      const info = renderer.info.render;
      const [lon, lat] = unproject(p.x, p.z);
      hud.set(
        `TENDERLOIN '74  phase 1  [${backend.toUpperCase()} | ${quality.name}]\n` +
        `frame ${s.avg.toFixed(2)} ms avg  ${s.p95.toFixed(2)} p95  (${s.fps.toFixed(0)} fps)\n` +
        `draws ${info.drawCalls}  tris ${(info.triangles / 1000).toFixed(0)}k\n` +
        `chunks lod0 ${world.stats.lod0}  lod1 ${world.stats.lod1}  loading ${world.stats.loading}\n` +
        `pos ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}  ${lat.toFixed(5)}, ${lon.toFixed(5)}\n` +
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
