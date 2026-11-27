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
import { ThirdPersonCamera } from './camera/ThirdPersonCamera'; // UI-written, engine-reviewed and owned (CAMERA_SPEC); replaces OrbitCamera
import { CameraDirector } from './camera/CameraDirector';
import { DebugHud, FrameStats } from './engine/debug/DebugHud';
import { unproject } from './shared/geo';
import { SIDEWALK_H } from './world/meshBuilder';
import { loadTerrain, heightAt } from './shared/terrain';
import { Input, type ButtonAction } from './input/Input';
import { loadReport } from './engine/debug/LoadReport';
import { AdaptiveResolution } from './engine/AdaptiveResolution';
import { Parks } from './world/Parks';
import { StreetFurniture } from './world/StreetFurniture';
import { SignalHeads } from './world/SignalHeads';
import { createGameplay, type GameplayGlue } from './engine/GameplayGlue';
import { createAudio } from './engine/AudioGlue';
import { createInteriors, type Interiors } from './interiors';
import { Driving } from './engine/Driving';
import { createMissions } from './engine/MissionGlue';
import type { MissionRuntime } from './mission/MissionRuntime';
import { Bench } from './engine/debug/Bench';
import { buildReport, mountReportButton, perfSamples } from './engine/debug/PerfReport';
import { Physics } from './physics/Physics';
import RAPIER from './shared/rapier';
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
import { Simulation, type ArchetypeDef } from './sim';
import { createCharacterFactory, type CharacterFactory } from './characters';
import { createVehicleFactory, CarLightPool, updateCarLights, setGroundLightLevel, setVehicleViewCamera } from './vehicles';

/**
 * URL parameters (all optional):
 *   quality=low|medium|high|ultra   webgl=1 (force WebGL2 backend)   hud=0|1   minimap=0   touch=1
 *   cam=x,y,z,yawDeg,pitchDeg        start in photo (free) camera at this pose (screenshot rig)
 *   at=x,z,headingDeg                start on foot at this point instead of the Flatiron spawn
 *   title=0                          skip the title screen (implied by cam= and at=)
 *   debug=1                          developer tools: the free-camera toggle (P) and its key hints
 *   sim=0                            no ambient traffic / pedestrians (sim=1 is the sim stream's debug view)
 */
type Mode = 'onfoot' | 'photo';

async function main() {
  if (new URLSearchParams(location.search).has('vehicles')) return void (await import('./vehicles/testlot/TestLot')).runTestLot(); // vehicles workstream test scene
  if (new URLSearchParams(location.search).has('characters')) { await (await import('./characters/test/CharactersTest')).runCharactersTest(); return; } // characters workstream test scene
  if (new URLSearchParams(location.search).has('interiors')) return void (await import('./interiors/test/testScene')).runInteriorsTest(); // interiors workstream test scene
  loadReport.mark('main');
  if (new URLSearchParams(location.search).has('gameplay')) return void (await import('./gameplay/scene/GameplayScene')).runGameplayScene(); // gameplay test scene (?gameplay=1)
  const params = new URLSearchParams(location.search);
  if (params.has('audio')) return void import('./audio/test/entry').then((m) => m.startAudioTest(params)); // audio workstream test scene / offline harness
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);
  loadReport.mark('renderer');
  const expMul = Number(params.get('exp') ?? 1) || 1; // ?exp=: exposure multiplier for look A/B
  const trackGpu = (params.get('hud') === '1' || params.get('gpu') === '1') && params.get('gpu') !== '0';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 30000);
  setVehicleViewCamera(camera); // vehicles' fade LOD switches by the render camera (not shadow or reflection passes)
  const atmosphere = new Atmosphere(scene);
  if (params.has('ao')) facadeUniforms.aoStrength.value = Number(params.get('ao'));
  // sky IBL: opt-in until verified against the look target; ?env=<intensity> (the raw sky is ~20x brighter than the fill)
  atmosphere.envEnabled = params.has('env') && params.get('env') !== '0';
  if (atmosphere.envEnabled) atmosphere.envIntensity = Number(params.get('env')) || 0.05;
  if (quality.shadows && params.get('shadows') !== '0') atmosphere.enableShadows(renderer, quality.name === 'high' || quality.name === 'ultra' ? 2048 : 1024);

  const [physics] = await Promise.all([Physics.create(), loadTerrain()]);
  loadReport.mark('physics+terrain');
  const world = new World(quality);
  // interiors hookup: facades cut at doors and storefronts, plugs fill them until an interior streams in; ?cuts=0 off
  world.interiorCuts = params.get('cuts') !== '0';
  if (world.interiorCuts) facadeUniforms.storeScale.value = 0; // the shops' light comes from the plugs and interiors
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
  const parks = new Parks(quality);
  await parks.load(base + 'parks.json').catch((e) => console.warn('parks', e));
  scene.add(parks.root);
  const furniture = new StreetFurniture(quality);
  await furniture.load(base + 'furniture.json').catch((e) => console.warn('furniture', e));
  scene.add(furniture.root);
  loadReport.mark('streets+lights');

  // ---------------------------------------------------------------- ambient sim (traffic, pedestrians, wildlife)
  // Loads in the background: the title and first frame never wait for lanes.bin. ?sim=1 keeps the sim
  // stream's own debug view (which runs its own Simulation), so the game's one is off there.
  const simOn = params.get('sim') !== '0' && params.get('sim') !== '1';
  const sim = simOn ? new Simulation({
    seed: 1974, maxVehicles: quality.name === 'low' ? 90 : 150, maxPeds: quality.name === 'low' ? 240 : 400, // sim 10: Low 90/240 (oversight: never empty in a screenshot); bench on the phone
    baseUrl: base, archetypes: Object.values(import.meta.glob('/content/npc_archetypes/*.json', { eager: true, import: 'default' }) as Record<string, ArchetypeDef>),
  }) : null;
  // Everything that brings new materials (signals, traffic, bodies, crowd) waits for the title: their shader
  // compiles otherwise land on the title's critical path (load test 2026-11-27: title-ready 25 s, a 12 s
  // first-frame hitch). They load and compile while the player reads the menu; with no title, at once.
  let releaseAfterTitle!: () => void;
  const afterTitle = new Promise<void>((r) => { releaseAfterTitle = r; });
  let simReady = false, simPaused = false;
  let signals: SignalHeads | null = null, sigBuf: Uint8Array = new Uint8Array(0);
  // Per-district density (oversight: busy blocks must read 1974-busy in view). The hook is an accept
  // probability, so this is budget-neutral: quiet residential districts thin out, leaving the pool
  // for Times Square, Herald Square and Broadway. Cached on a 25 m grid (the Locator is not free).
  const BUSY: Record<string, number> = { 'Times Square': 1, 'Herald Square': 1, Broadway: 1, 'Penn Station': 1, 'The Garment District': 0.95, 'Madison Square': 0.9, 'Bryant Park': 0.9, 'The Tenderloin': 0.85, 'The Fur District': 0.8, 'The Flower District': 0.8, Midtown: 0.85, Chelsea: 0.5, 'Murray Hill': 0.45, 'Kips Bay': 0.4, Gramercy: 0.4 };
  const densityCache = new Map<number, number>();
  const districtOf = new Locator(streets);
  sim?.setDensityHook((x, z, kind) => {
    const key = Math.floor(x / 25) * 100003 + Math.floor(z / 25);
    let m = densityCache.get(key);
    if (m === undefined) { m = BUSY[districtOf.district(x, z)] ?? 0.7; densityCache.set(key, m); }
    return kind === 'ped' ? m : Math.min(1, m + 0.15); // avenues carry through-traffic even past quiet blocks
  });
  sim?.load().then(() => afterTitle).then(() => {
    if (!sim) return;
    // the sim's signal heads replace the OSM poles: every lit head is one the cars obey
    signals = new SignalHeads(sim.signalHeads()); scene.add(signals.root); furniture.signalGroup.visible = false;
    sim.setObstacles([...furniture.obstacles(false), ...signals.obstacles()]);
    simReady = true; loadReport.mark('sim');
  }).catch((e) => console.warn('sim', e));
  // AI traffic: visual-only instanced cars fed from sim.vehicles. Real headlight spots only on High/Ultra:
  // every forward-lit material pays per light per fragment (the facades most of all); lower tiers keep the
  // emissive ground pools.
  let traffic: ReturnType<ReturnType<typeof createVehicleFactory>['createTrafficRenderer']> | null = null, carLights: CarLightPool | null = null;
  // Parked cars on every kerb (sim 5): the sim places them by its kerb rules (hydrants, bus stops, corners,
  // no-standing hours, street cleaning); a second, static traffic renderer draws them.
  type TrafficR = ReturnType<ReturnType<typeof createVehicleFactory>['createTrafficRenderer']>;
  let parked: TrafficR | null = null as TrafficR | null, parkedList: { id: number; vclass: string; variant: number; x: number; y: number; z: number; yaw: number; lights: number }[] = [];
  const parkedAt = { x: 1e9, z: 1e9, q: -1 };
  // player driving (engine/Driving.ts): created with the vehicle factory after the title
  let driving: Driving | null = null;
  let missions: MissionRuntime | null = null;
  if (sim) void afterTitle.then(() => {
    const vf = createVehicleFactory({ quality: quality.name });
    driving = new Driving({
      quality: quality.name, physics, scene, input, player, camera: director.gameplay as THREE.PerspectiveCamera, factory: vf, sim,
      gameplay: () => gp?.g ?? null, lead: () => party.activeId,
      parked: () => parkedList,
      attachAudio: (v, vclass) => audioGlue?.audio.attachVehicle({ id: v.id, rpm: () => v.rpm, load: () => v.load, speed: () => v.speed, position: () => { const p = v.object.position; return [p.x, p.y, p.z]; }, on: (t, cb) => v.on(t as never, cb) }, vclass),
      // seated (characters 396a88c): setSeat with the hip seat point starts the drive loop and places the root
      seat: (m) => { (body as unknown as { setSeat?: (m: THREE.Matrix4 | null, o?: { hip?: boolean }) => void }).setSeat?.(m, { hip: true }); },
      wheel: (w, steer) => { (body as unknown as { setWheel?: (w: unknown, s: number) => void }).setWheel?.(w, steer); },
    });
    traffic = vf.createTrafficRenderer(quality.name === 'low' ? 100 : 160);
    scene.add(traffic.object);
    const pr = vf.createTrafficRenderer(quality.name === 'low' ? 160 : 400);
    scene.add(pr.object); parked = pr;
    if (quality.name === 'high' || quality.name === 'ultra') carLights = new CarLightPool(scene, quality.name, false);
  });
  // ---------------------------------------------------------------- audio (wiring step 7); ?sound=0 leaves it out (?audio= is the audio test scene)
  const audioGlue = params.get('sound') === '0' ? null : createAudio({ quality: quality.name, streets, sim });
  // Pedestrians: the characters crowd renderer, fed from sim.peds (created with the factory).
  let crowd: ReturnType<CharacterFactory['createCrowdRenderer']> | null = null;
  afterTitle.then(() => createCharacterFactory({ quality: quality.name, renderer } as never)).then((f) => {
    chars = f;
    // feet and footstep surfaces: the real collision ground (kerbs, stoops), else the terrain
    f.setGround((x, z) => { const top = heightAt(x, z) + 2.5, d = physics.ray(x, top, z, 0, -1, 0, 4, player.collider); return { y: d === null ? heightAt(x, z) : top - d, surface: 'concrete' }; });
    const climate = () => { const h = worldClock.minutes / 60; f.setClimate({ heat: h > 11 && h < 18 ? 0.7 : 0.35, wetness: worldClock.weather === 'rain' ? 1 : 0 }); };
    climate(); setInterval(climate, 10_000);
    spawnLeadBody();
    if (sim) { crowd = f.createCrowdRenderer(quality.name === 'low' ? 240 : 400); scene.add(crowd.object); }
    loadReport.mark('characters');
  }).catch((e) => console.warn('characters', e));
  const simActors = [{ id: 'player', x: 0, z: 0, vx: 0, vz: 0, radius: 0.4, kind: 'player' as const }];

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
  // The stand-in shows until the characters factory resolves (it loads in the background, never gating
  // the title), then the active lead's real body replaces it. Lead switches respawn the body.
  let body: PlayerBody = new StandInBody();
  scene.add(body.object);
  let chars: CharacterFactory | null = null;
  const spawnLeadBody = () => {
    if (!chars) return;
    const old = body, vis = old.object.visible;
    const ch = chars.spawn(scene, { seed: 74, hero: party.activeId });
    ch.on('footstep', (e) => audioGlue?.footstep(e));
    body = ch;
    body.object.position.set(player.pos.x, player.pos.y, player.pos.z); body.object.rotation.y = player.heading; body.object.visible = vis;
    old.object.removeFromParent(); old.dispose();
  };
  // Gameplay cameras write into director.gameplay; the director owns the real camera (cutscene hand-off).
  const director = new CameraDirector(camera);
  const orbit = new ThirdPersonCamera(director.gameplay, input, physics, player.collider);
  const camTune = () => Object.assign(orbit.tune, { follow: settings.get('onFootFollow'), shake: settings.get('cameraShake'), reduceMotion: settings.get('reduceMotion'), mobile: document.body.classList.contains('touch') });
  camTune(); settings.subscribe(() => camTune());
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
      party.switchTo(s.party.activeCharacter); spawnLeadBody();
      narrativeState = s.narrative;
      const a = party.active.at;
      player.teleport(a.x, a.y, a.z, a.heading); player.active = false; // re-activates once colliders exist there
      orbit.snap(a, a.heading);
    },
  });
  // ---------------------------------------------------------------- gameplay core (wiring step 6)
  let gp: GameplayGlue | null = null;
  // ---------------------------------------------------------------- interiors (streamed within ~30 m of the player)
  let interiors: Interiors | null = null, insideKind: string | null = null, insideT = 0;
  if (world.interiorCuts) void afterTitle.then(async () => {
    const it = createInteriors({ quality: quality.name, content: { interiors: null, places: null } });
    it.onBuilt.add((id) => world.setInteriorLive(id, true));
    it.onUnloaded.add((id) => world.setInteriorLive(id, false));
    await it.ready;
    scene.add(it.object); interiors = it; loadReport.mark('interiors');
  }).catch((e) => console.warn('interiors', e));
  void afterTitle.then(() => createGameplay({ quality: quality.name, physics, player, lead: () => party.activeId, camera, sim, saves })
    .then((x) => {
      gp = x; loadReport.mark('gameplay');
      // the one context button: "Go in" / "Knock" / "Locked" at interiors' doors (gameplay 15)
      const bindVehicles = () => driving ? x.g.bindVehicles(driving.binding as never) : setTimeout(bindVehicles, 1000);
      bindVehicles();
      // the mission runtime: givers on the context button, fail on wasted/arrested
      const bindMissions = () => {
        if (!missions) return void setTimeout(bindMissions, 1000);
        const M = missions;
        x.g.bindTalk({ nearestTalkable: (px, pz, r) => M.nearestTalkable(px, pz, r), talk: (id) => M.talk(id) });
        x.g.on('wasted', () => M.fail('Wasted')); x.g.on('arrested', () => M.fail('Arrested'));
      };
      bindMissions();
      const bindDoors = () => interiors ? x.g.bindDoors({ doorsForChunk: (i, j) => interiors!.doorsForChunk(i, j) as never, chunkSize: 200 }) : setTimeout(bindDoors, 1000);
      bindDoors();
    }).catch((e) => console.warn('gameplay', e)));
  // the free camera is a developer tool (photo rig): its toggle and key hints only with ?debug=1 (oversight 2026-11-27)
  const devTools = params.get('debug') === '1';
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
    facadeUniforms.pixelAngle.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / Math.max(1, h * renderer.getPixelRatio());
  };
  window.addEventListener('resize', () => onResize());
  window.addEventListener('orientationchange', () => onResize());
  window.visualViewport?.addEventListener('resize', () => onResize());
  // The canvas's own layout size: fires on any change, whatever window events iOS does or doesn't send.
  new ResizeObserver(() => onResize()).observe(view);
  onResize(true);
  const adaptiveOn = params.get('adaptive') === '1' || (params.get('adaptive') !== '0' && matchMedia('(pointer: coarse)').matches);
  const basePr = renderer.getPixelRatio();
  const adaptive = adaptiveOn ? new AdaptiveResolution(basePr, basePr * 0.8, Math.max(basePr, Math.min(window.devicePixelRatio || 1, 2)), (pr) => {
    renderer.setPixelRatio(pr); onResize(true); // also refreshes the drawing buffer size and the window-LOD pixel angle
  }) : null;
  // ?bench=1: on-device A/B of each cost suspect (see engine/debug/Bench.ts); results go into the perf report
  const benchFlags = { noPost: false, noDom: false, noResolve: false };
  let lastGpuMs: number | null = null;
  const domHide = document.createElement('style'); domHide.textContent = 'body > *:not(#app):not(.t74-bench) { visibility: hidden !important }';
  const prFixed = (v: number) => ({ apply: () => { renderer.setPixelRatio(v); onResize(true); }, revert: () => { renderer.setPixelRatio(adaptive?.scale ?? basePr); onResize(true); } });
  const hideMesh = (n: string) => ({ apply: () => { world.debugHide.add(n); }, revert: () => { world.clearDebugHide(); } });
  const hideObj = (o: THREE.Object3D) => ({ apply: () => { o.visible = false; }, revert: () => { o.visible = true; } });
  const bench = params.get('bench') === '1' ? new Bench([
    { name: 'baseline', apply: () => {}, revert: () => {} },
    { name: 'post stack off', apply: () => { benchFlags.noPost = true; }, revert: () => { benchFlags.noPost = false; } },
    { name: 'DOM overlays hidden', apply: () => { benchFlags.noDom = true; document.head.appendChild(domHide); }, revert: () => { benchFlags.noDom = false; domHide.remove(); } },
    { name: 'gpu timing reads off', apply: () => { benchFlags.noResolve = true; }, revert: () => { benchFlags.noResolve = false; } },
    { name: 'dpr 1.0', ...prFixed(1.0) },
    { name: 'dpr 2.0', ...prFixed(Math.min(2, window.devicePixelRatio || 1)) },
    { name: 'no props', ...hideMesh('props') },
    { name: 'no near buildings', ...hideMesh('buildings') },
    { name: 'no ground', ...hideMesh('ground') },
    { name: 'no far shells (lod1)', ...hideMesh('lod1') },
    { name: 'no skyline', ...hideObj(skyline) },
    { name: 'no street lights', ...hideObj(streetLights) },
    { name: 'no trees + park dressing', ...hideObj(parks.root) },
    { name: 'no street furniture', ...hideObj(furniture.root) },
    { name: 'no crowd', apply: () => { if (crowd) crowd.object.visible = false; }, revert: () => { if (crowd) crowd.object.visible = true; } },
    { name: 'no parked cars', apply: () => { const t = parked as { object: THREE.Object3D } | null; if (t) t.object.visible = false; }, revert: () => { const t = parked as { object: THREE.Object3D } | null; if (t) t.object.visible = true; } },
    { name: 'no traffic', apply: () => { const t = traffic as { object: THREE.Object3D } | null; if (t) t.object.visible = false; }, revert: () => { const t = traffic as { object: THREE.Object3D } | null; if (t) t.object.visible = true; } },
    { name: 'sim paused', apply: () => { simPaused = true; }, revert: () => { simPaused = false; } },
    { name: 'baseline again', apply: () => {}, revert: () => {} },
  ]) : null;
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
    backend, quality: quality.name, frames, world, renderer, scene, camera, load: loadReport, physics, player, party, input, RAPIER, sim, get missions() { return missions; }, get driving() { return driving; }, get interiors() { return interiors; }, get audio() { return audioGlue?.audio; }, get gameplay() { return gp; }, get body() { return body; }, director, THREE, get saves() { return saves; },
    get mode() { return mode; }, setMode, get screen() { return uiRef.ui?.state ?? 'loading'; }, get ui() { return uiRef.ui; },
    /** Resolves when every chunk the current view wants is resident and has been drawn once. */
    whenIdle: () => new Promise<void>((res) => { const t = () => (world.idle && frameCount > 3 && (mode === 'photo' || player.active || uiRef.ui?.state === 'title') ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    setCamera: (x: number, y: number, z: number, yawDeg: number, pitchDeg = 0) => { setMode('photo'); fly.set(x, y, z, THREE.MathUtils.degToRad(yawDeg), THREE.MathUtils.degToRad(pitchDeg)); },
  };
  (window as unknown as { __T74: typeof debug }).__T74 = debug;
  const report = mountReportButton(() => buildReport({
    renderer, backend, quality: quality.name, frames, world, device: input.activeDevice,
    view: `${camera.position.x.toFixed(0)},${camera.position.y.toFixed(0)},${camera.position.z.toFixed(0)} ${mode}`,
    extra: [adaptive ? adaptive.describe() : 'adaptive dpr off', ...(bench ? [bench.text()] : []), `props radius ${quality.propsRadius} m · lod0 ${quality.lod0Radius} m · lod1 ${quality.lod1Radius} m`],
  }));
  report.show(hud.visible);
  document.getElementById('loading')?.remove();
  if (params.get('sim') === '1') import('./sim/debug/SimDebugView').then((m) => m.attachSimDebug(scene, camera));

  // ---------------------------------------------------------------- UI (UI & Cinematics stream: one host, one update)
  // The UI reads the game only through this UiHost (src/shared/uiHost.ts). Gameplay, sim and narrative
  // replace the placeholder answers below as they merge (health, inventory, heat, objectives, shops...).
  const locator = new Locator(streets);
  let loc = { district: '', crossing: '' }, locT = 0, frozen = false;
  let objective: { text: string; target?: { x: number; z: number; label?: string }; mission?: string } | null = null;
  const uiEvents = new Emitter<UiEvents>();
  const LEAD_STYLE: Record<string, { colour: string; tagline: string }> = {
    'char.teddy_arce': { colour: '#c79a3c', tagline: 'Night desk, Hotel Corwin' }, 'char.delphine_moore': { colour: '#b2302a', tagline: 'Eighth Avenue' }, 'char.nick_varelas': { colour: '#2e4a6b', tagline: 'Varelas & Co., furs' },
  };
  const placeAt = () => { const p = player.pos; player.active = false; orbit.snap(p, player.heading); mode = 'onfoot'; };
  const host: UiHost = {
    input, saves, streets, baseUrl: import.meta.env.BASE_URL, heroes: world.manifest.heroes,
    player: () => { const p = mode === 'onfoot' ? body.object.position : camera.position; return { x: p.x, z: p.z, yaw: mode === 'onfoot' ? orbit.yaw : fly.yaw, heading: mode === 'onfoot' ? player.heading : fly.yaw, speed: driving?.car ? driving.car.v.speed : mode === 'onfoot' ? Math.hypot(player.vel.x, player.vel.z) : 0, inVehicle: !!driving?.driving, lead: party.activeId }; },
    clock: () => ({ date: worldClock.date, minutes: worldClock.minutes, weather: worldClock.weather }),
    party: () => [...party.leads.values()].map((l) => ({ id: l.id, name: l.displayName, short: l.displayName, tagline: LEAD_STYLE[l.id]?.tagline ?? '', colour: LEAD_STYLE[l.id]?.colour ?? '#c79a3c', cash: l.money, where: l.id === party.activeId ? loc.crossing : 'Elsewhere in the city', available: true })),
    health: () => gp?.health() ?? { hp: 100, max: 100, injuries: [], stamina: 1, staminaMax: 1, heatExhaustion: 0 },
    inventory: (lead = party.activeId) => { const l = party.leads.get(lead) ?? party.active; return { lead: l.id, cash: l.money, savings: 0, outfit: { name: 'Everyday clothes', hides: 'jacket', description: '' }, items: [] }; },
    heat: () => gp?.heat() ?? { phase: 'none', cones: [], units: [] },
    objective: () => objective,
    location: () => loc,
    shop: () => null, newspaper: () => null, businesses: () => [], completion: () => [], achievements: () => [],
    stats: () => [{ group: 'Time', label: 'Play time', value: `${Math.floor(performance.now() / 60000)} min this session` }],
    act: (a) => {
      if (a.kind === 'switchLead') {
        storeActiveLead(); if (!party.switchTo(a.lead)) return { ok: false, text: 'Not available' };
        const t = party.active.at; player.teleport(t.x, t.y, t.z, t.heading); placeAt(); spawnLeadBody(); uiEvents.emit('lead', { id: a.lead }); return { ok: true };
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
    prompts: () => (driving?.driving ? [['use', driving.hotwiring ? 'Hot-wire' : 'Get out'], ['jump', 'Handbrake'], ['map', 'Map']] as [ButtonAction, string][] : mode === 'onfoot' ? [...(carPrompt ? [['use', carPrompt] as [ButtonAction, string]] : gpContext ? [['use', gpContext] as [ButtonAction, string]] : []), ['sprint', 'Sprint'], ['jump', 'Jump · climb'], ['map', 'Map'], ['inventory', 'Pockets']] : [['sprint', 'Fast'], ['rise', 'Up'], ['sink', 'Down'], ['photo', 'Back to player']].filter(() => devTools)) as [ButtonAction, string][],
    // a new game starts where narrative's opening does (spawns.json spawn.player_start: the Flatiron's north prow, facing uptown)
    newGame: () => {
      loadReport.mark('new-game');
      const p0 = missions?.resolve('Broadway & 5th Ave & E 23rd St'), s0 = p0 ? { x: p0.x, z: p0.z + 4, heading: 0 } : spawn;
      const y = heightAt(s0.x, s0.z) + SIDEWALK_H; player.teleport(s0.x, y, s0.z, s0.heading); placeAt();
    },
    continueGame: async () => {
      loadReport.mark('continue');
      const last = await saves.latest().catch(() => null);
      if (!last) { host.newGame!(); return true; }
      try { await saves.load(last.slot); mode = 'onfoot'; return true; } catch { return false; }
    },
  };
  const ui = await bootUi(host, { title: !skipTitle }); uiRef.ui = ui;
  if (skipTitle) releaseAfterTitle();
  // ---------------------------------------------------------------- mission runtime (Phase 7; engine/MissionGlue.ts)
  void afterTitle.then(() => {
    missions = createMissions({
      streets, heroes: world.manifest.heroes, ui: uiEvents,
      player: () => ({ x: player.pos.x, z: player.pos.z, lead: party.activeId, inCar: !!driving?.driving, interior: insideKind }),
      clock: () => ({ minutes: worldClock.minutes, date: worldClock.date }),
      state: () => narrativeState as never,
      setObjective: (o) => { objective = o; },
      addMoney: (cents) => { party.active.money += cents / 100; },
      waitTo: (t) => setTime(t),
      audioPlay: (script, line) => audioGlue?.audio.dialogue?.play(script, line),
      gameplay: () => gp?.g ?? null,
      spawnCast: (castId, x, y, z) => {
        if (!chars) return null;
        const ch = chars.spawn(scene, { seed: 7, hero: castId }); ch.object.position.set(x, y, z);
        const tick = setInterval(() => ch.update(0.1), 100);
        return () => { clearInterval(tick); ch.object.removeFromParent(); ch.dispose(); };
      },
    });
    loadReport.mark('missions');
  });
  if (!skipTitle) mode = 'photo';
  // title-screen camera: slow drift past the Flatiron at dusk
  const flat = world.manifest.heroes.find((h) => h.id === 'lm.flatiron') ?? { x: 0, z: 0 };
  let titleT = 0;
  let lastRenderT = -1e9;
  const TITLE_RADIUS = 300; // m around the title camera's target
  let shaderWarm: Promise<void> | null = null, shadersReady = false;
  const simFwd = new THREE.Vector3();
  // in-view spawns stay beyond this (sim fe9ba45); traffic dithers in over 0.4 s (vehicles 028f6e3), so it can be close
  const simFade = 45;
  let gpContext: string | null = null, ctxT = 0, carPrompt: string | null = null;

  // ---------------------------------------------------------------- loop
  renderer.setAnimationLoop((t) => {
    const cpu0 = performance.now();
    clock.update(t);
    const rawDt = clock.getDelta(); loadReport.frame(rawDt * 1000); if (frameCount > 0) perfSamples.interval.push(rawDt * 1000);
    if (adaptive && !(bench && !bench.done) && frameCount > 0 && (ui.state === 'play' || titleReady) && world.idle) adaptive.update(rawDt * 1000, rawDt);
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
      if (near.ready === near.total && shadersReady && frameCount > 3 && !titleReady) { titleReady = true; loadReport.mark('title-ready'); releaseAfterTitle(); console.info('[T74 load]\n' + loadReport.text()); void saves.latest().then((l) => ui.titleReady(l ? l.label : null)); }
    }
    ui.update(dt);
    if (ui.state === 'cutscene') loadReport.mark('cutscene');
    const playing = ui.state === 'play' && !ui.paused;
    // no data credit during play (user request): it lives on the title footer, the map screen and Credits › Data sources
    if (playing && input.pressed('hud')) { hud.toggle(); report.show(hud.visible); }
    if (playing && devTools && input.pressed('photo')) setMode(mode === 'onfoot' ? 'photo' : 'onfoot');
    if (playing && input.pressed('jump')) jumpLatch = true;
    if (playing && mode === 'onfoot' && player.active) saves.tick(dt);
    if (frozen) jumpLatch = false;
    if (playing) tickClock(dt); // the clock pauses in menus, the title and cutscenes
    const light = atmosphere.update();
    atmosphere.updateEnvironment(renderer);
    facadeUniforms.night.value = nightOverride ?? light.night;
    facadeUniforms.minutes.value = worldClock.minutes;
    parks.update(dt, camera.position);
    furniture.update(dt, camera.position);
    streetLightUniforms.lightsOn.value = light.lightsOn;
    renderer.toneMappingExposure = light.exposure * expMul;
    { const f = mode === 'onfoot' ? body.object.position : camera.position; atmosphere.followFocus(f.x, f.y, f.z); }
    postUniforms.bloomStrength.value = 0.12 + 0.38 * light.lightsOn;
    postfx?.setTimeOfDay(light.night, light.blueHour);

    // physics colliders stream around the player; the player waits until the ground under it exists
    if ((syncT -= dt) <= 0) { physics.sync(player.pos.x, player.pos.z, world.manifest.chunkSize); syncT = 0.2; }
    if (!player.active && physics.readyAround(player.pos.x, player.pos.z, world.manifest.chunkSize)) { player.active = true; }
    if (player.active && ui.state === 'play') loadReport.mark('playable'); // first frame with control (after any intro cutscene)

    if (!playing && ui.state !== 'title' && ui.state !== 'cutscene') {
      // paused: world frozen, camera holds
    } else if (mode === 'onfoot') {
      const inCar = !!driving?.driving;
      physics.update(dt, (h) => { if (!frozen && !inCar) player.fixedUpdate(h, input, orbit.yaw, jumpLatch); jumpLatch = false; driving?.fixed(h); });
      const rp = player.renderPos(physics.alpha);
      if (!inCar) { body.object.position.set(rp.x, rp.y, rp.z); body.setLocomotion(player.loco()); }
      driving?.update(dt, light.night, director.gameplay as THREE.PerspectiveCamera);
      body.update(dt);
      if (!inCar) {
        orbit.lookBehind = input.isHeld('lookBehind');
        if (input.pressed('shoulderSwap')) orbit.swapShoulder();
        orbit.update(dt, rp, player.loco());
      }
      // the one context button: in a car → get out; next to a car → get in; else gameplay's context
      if (playing && !frozen && input.pressed('use')) {
        if (inCar) { if (driving!.useInCar() === 'exited') { orbit.snap(player.pos, player.heading); } }
        else if (driving?.nearestCar() && driving.tryEnter()) { /* now driving */ }
        else if (gp && gpContext) gp.doContext();
      }
      if (gp && playing && !frozen) {
        gp.update(dt, { minutes: worldClock.minutes, raining: worldClock.weather === 'rain', sprinting: player.mode === 'sprint', device: input.isTouch ? 'touch' : input.activeDevice === 'kbm' ? 'mouse' : 'pad', inCar });
        if ((ctxT -= dt) <= 0) { ctxT = 0.2; gpContext = gp.context(); carPrompt = driving && !driving.driving ? driving.nearestCar()?.label ?? null : null; }
      }
    } else if (ui.state === 'title') {
      physics.update(dt, () => { jumpLatch = false; });
    } else {
      physics.update(dt, () => { jumpLatch = false; });
      fly.update(dt);
      // the lead stays where it was left (it would otherwise sit at the origin until the first on-foot frame)
      body.object.position.set(player.pos.x, player.pos.y, player.pos.z); body.object.rotation.y = player.heading;
    }
    input.endFrame();
    director.update(dt);
    world.update(mode === 'onfoot' ? body.object.position : camera.position);
    if (sim && simReady && !simPaused && (playing || ui.state === 'title')) {
      const f = mode === 'onfoot' ? body.object.position : camera.position;
      sim.setClock(worldClock.minutes); sim.setWeather(worldClock.weather);
      camera.getWorldDirection(simFwd); sim.setView(camera.position.x, camera.position.z, simFwd.x, simFwd.z, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect)), simFade);
      const a = simActors[0]; a.x = player.pos.x; a.z = player.pos.z; a.vx = player.vel.x; a.vz = player.vel.z;
      const carActor = driving?.actor();
      sim.setExternalActors(carActor ? [carActor] : mode === 'onfoot' ? simActors : []);
      sim.update(dt, f);
    }
    if (traffic && sim && simReady) {
      setGroundLightLevel(light.lightsOn);
      if (carLights) updateCarLights(carLights, driving?.cars.map((c) => c.v) ?? [], camera.position, traffic.lightCandidates(sim.vehicles, camera.position));
      traffic.setInstances(sim.vehicles, camera.position, carLights ?? undefined);
    }
    if (interiors && (playing || ui.state === 'title')) {
      const f = mode === 'onfoot' ? player.pos : camera.position;
      interiors.update(dt, f, worldClock, camera);
      interiors.colliders(physics.world);
      if ((insideT -= dt) <= 0) {
        insideT = 0.2;
        const ins = interiors.inside(f.x, f.y, f.z), k = ins?.kind ?? null;
        if (k !== insideKind) { insideKind = k; audioGlue?.interior(k, ins?.roomVolume); }
      }
    }
    if (missions && playing && !frozen) missions.update(dt);
    if (signals && sim) { sigBuf = sim.signalStates(sigBuf); signals.update(dt, sigBuf); }
    if (parked && sim && simReady) {
      const f = mode === 'onfoot' ? player.pos : camera.position, quarter = Math.floor(worldClock.minutes / 15);
      if (Math.hypot(f.x - parkedAt.x, f.z - parkedAt.z) > 100 || quarter !== parkedAt.q) {
        Object.assign(parkedAt, { x: f.x, z: f.z, q: quarter });
        const R = quality.name === 'low' ? 160 : 260;
        parkedList = sim.parkedCars(f.x, f.z, R).map((c) => ({ id: Math.round(c.x * 10) * 100003 + Math.round(c.z * 10), vclass: c.vclass as string, variant: c.variant, x: c.x, y: heightAt(c.x, c.z), z: c.z, yaw: c.yaw, lights: 0 }));
      }
      parked.setInstances((driving?.takenParked.size ? parkedList.filter((c) => !driving!.takenParked.has(c.id)) : parkedList) as never, camera.position);
    }
    if (crowd && sim && simReady) { crowd.setAgents(sim.peds); crowd.update?.(dt, camera); }
    checkSize(); // cheap: two clientWidth reads; catches every size change the events miss
    // A menu over the game (pause hub, shop, any modal) holds the last frame instead of re-rendering the
    // city behind it: same picture, a fraction of the GPU and battery (and the canvas keeps its last
    // presented frame). Render again on any resize, which clears the drawing buffer.
    const hold = ui.hub.open || (ui.state === 'play' && ui.paused) || (ui.state === 'cutscene' && ui.cinema.paused);
    audioGlue?.update(dt, camera, worldClock, hold);
    const vw = view.width, vh = view.height;
    // Battery on phones (engine): the title drift renders at 24 fps on touch devices.
    const capTitle = ui.state === 'title' && input.isTouch && frameCount > 3 && t - lastRenderT < 1000 / 24;
    if (!capTitle && (!hold || heldFrames < 2 || vw !== heldW || vh !== heldH)) { if (postfx && !benchFlags.noPost) postfx.render(); else renderer.render(scene, camera); lastRenderT = t; }
    heldFrames = hold ? heldFrames + 1 : 0; heldW = vw; heldH = vh;
    if (frameCount === 0) loadReport.mark('first-frame');
    loadReport.frameCpu(performance.now() - cpu0); perfSamples.cpu.push(performance.now() - cpu0);
    if (bench && frameCount > 0 && (ui.state === 'play' || mode === 'photo') && world.idle && (player.active || mode === 'photo')) bench.update(dt, rawDt * 1000, performance.now() - cpu0, lastGpuMs);
    if (trackGpu && !benchFlags.noResolve && frameCount % 6 === 0) {
      const be = renderer.backend as unknown as { trackTimestamp?: boolean };
      perfSamples.gpuAvailable = !!be.trackTimestamp;
      if (be.trackTimestamp) void renderer.resolveTimestampsAsync().then((ms) => { if (typeof ms === 'number' && ms > 0) { perfSamples.gpu.push(ms); lastGpuMs = ms; } }).catch(() => undefined);
    }
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
        (gp ? `gameplay ${gp.lastMs.toFixed(2)} ms  hp ${gp.g.hud()?.hp.toFixed(0) ?? '-'}  ctx ${gpContext ?? '-'}\n` : '') + (sim ? `sim ${simReady ? `${sim.vehicles.length} cars ${sim.peds.length} peds ${sim.lastUpdateMs.toFixed(2)} ms` : 'loading'}\n` : '') +
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
