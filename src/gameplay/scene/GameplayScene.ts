import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { createRenderer } from '../../engine/renderer';
import { qualityFromUrl } from '../../engine/quality';
import { World } from '../../world/World';
import { loadSkyline } from '../../world/Skyline';
import { Atmosphere } from '../../world/Atmosphere';
import { OrbitCamera } from '../../camera/OrbitCamera';
import { Input } from '../../input/Input';
import { Btn } from '../../input/Gamepad';
import { TouchControls } from '../../ui/TouchControls';
import { Physics } from '../../physics/Physics';
import { PlayerController } from '../../player/PlayerController';
import { loadTerrain, heightAt, CURB_HEIGHT } from '../../shared/terrain';
import { Gameplay } from '../index';
import { StandInSim } from '../testing/StandInSim';
import { Rng } from '../core/rng';
import { rayCapsule, type V3 } from '../core/vec';
import { humanoidHitbox } from '../combat/ballistics';
import type { PropType } from '../props/props';
import { RapierWorldQuery } from './RapierWorldQuery';
import { Body, bodyColor, carMesh, Fx, PropMeshes, type Pose } from './Visuals';
import { Hud, btn, el } from './Hud';
import { Overlays } from './Overlays';
import { plateFor } from '../appearance';

/**
 * `?gameplay=1` — the gameplay test scene (brief: "your own test scene first; the engine chat wires it in").
 * Stations (top bar or keys F5–F8):
 *   LOT   a 1974 parking lot with cars, crates and street furniture: shootouts, cover, blind fire, tyres
 *   YARD  a walled yard behind it: melee (parry, dodge, grapple, shove into walls)
 *   BLOCK the real W 31st St between 7th and 8th Aves (the station house block): witnesses, two red call
 *         boxes, a payphone, a beat cop, a parked radio car, breakable props, the precinct response
 *   SHOP  a counter at the lot: diner, drugstore, hardware, newsstand, liquor, pawnshop, fence, clothier,
 *         plus the lead's closet (home wardrobe)
 * Params: lead=teddy|delphine|nick, overlays=0, touch=1, quality=…, webgl=1, station=lot|yard|block|shop
 * Controls: docs/GAMEPLAY_PROGRESS.md "Controls". Window hook for the recorder: window.__GP.
 */
const LOT = { x: 1500, z: 900 };
const BLOCK = { minX: -868, maxX: -616, zN: -673.5, zS: -658.5, centre: -666 };
const LEADS: Record<string, string> = { teddy: 'char.teddy_arce', delphine: 'char.delphine_moore', nick: 'char.nick_varelas' };
type Station = 'lot' | 'yard' | 'block' | 'shop';

export async function runGameplayScene() {
  const params = new URLSearchParams(location.search);
  const quality = qualityFromUrl();
  const app = document.getElementById('app')!;
  const { renderer, backend } = await createRenderer(app, quality.pixelRatio);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 30000);
  new Atmosphere(scene);
  // test-scene fill so the stand-ins read in every frame (the engine's Phase 3 lighting replaces this)
  scene.add(new THREE.HemisphereLight(0xe6d2b8, 0x2e171d, 1.1));
  const [physics] = await Promise.all([Physics.create(), loadTerrain()]);
  const world = new World(quality);
  await world.load();
  scene.add(world.root);
  world.onChunkReady.add((c) => physics.addChunk(c));
  world.onChunkUnload.add((k) => physics.removeChunk(k));
  loadSkyline(import.meta.env.BASE_URL + 'data/skyline.bin').then((s) => scene.add(s)).catch(() => {});

  const input = new Input(renderer.domElement);
  if (input.isTouch || params.has('touch')) { input.isTouch = true; new TouchControls(input, [{ label: 'JUMP', action: 'jump', hold: true }, { label: 'RUN', action: 'sprint', hold: true }]); document.body.classList.add('touch'); }

  // ---------------------------------------------------------------- gameplay core
  const g = new Gameplay({ quality: quality.name, content: { items: null, shops: null, weapons: null } });
  const rq = new RapierWorldQuery(physics);
  g.bindWorld(rq);
  const sim = new StandInSim(new Rng(74));
  sim.groundY = (x, z) => heightAt(x, z) + CURB_HEIGHT;
  g.bindSim(sim);
  g.light = () => 1;

  const lotY = heightAt(LOT.x, LOT.z);
  const lead = LEADS[params.get('lead') ?? 'teddy'] ?? LEADS.teddy;
  const player = new PlayerController(physics, LOT.x, lotY + 0.05, LOT.z + 8, 0);
  rq.excluded.add(player.collider.handle);
  const pbody = new Body(bodyColor('player'));
  scene.add(pbody.root);
  const orbit = new OrbitCamera(camera, input, physics, player.collider);
  orbit.snap(player.pos, 0);
  let aimPoint = new THREE.Vector3();
  const muzzle = (): V3 => { const r = [Math.cos(orbit.yaw), -Math.sin(orbit.yaw)]; return [player.pos.x + r[0] * 0.22, player.pos.y + 1.45, player.pos.z + r[1] * 0.22]; };
  g.bindPlayer({
    id: 'player', lead,
    position: () => [player.pos.x, player.pos.y, player.pos.z],
    aim: () => { const o = muzzle(); const d = new THREE.Vector3(aimPoint.x - o[0], aimPoint.y - o[1], aimPoint.z - o[2]).normalize(); return { origin: o, dir: [d.x, d.y, d.z] }; },
  });
  g.policeSys.placeName = (x, z) => (Math.abs(z - BLOCK.centre) < 60 && x > BLOCK.minX - 40 && x < BLOCK.maxX + 40 ? (x < -745 ? 'West 31st and Eighth' : 'West 31st and Seventh') : 'the lot on the East Side');
  g.policeSys.project = (x, z) => inBlockArea(x, z) ? [clamp(x, BLOCK.minX - 10, BLOCK.maxX + 10), clamp(z, BLOCK.zN + 1, BLOCK.zS - 0.5)] : [x, z];
  g.policeSys.spawnAt = (kind, near, pct) => inBlockArea(near[0], near[1]) ? [pct.station[0], BLOCK.zS - 0.8] : [near[0] + (kind === 'foot' ? 60 : 120), near[1] + 40];
  g.policeSys.chokepoints = (n) => inBlockArea(n[0], n[1]) ? [{ x: BLOCK.minX - 8, z: BLOCK.centre, yaw: Math.PI / 2 }, { x: BLOCK.maxX + 8, z: BLOCK.centre, yaw: -Math.PI / 2 }] : [{ x: n[0] + 40, z: n[1], yaw: Math.PI / 2 }, { x: n[0] - 40, z: n[1], yaw: -Math.PI / 2 }];

  // ---------------------------------------------------------------- static colliders for gameplay boxes
  const addCollider = (c: V3, h: [number, number, number], yaw: number) => {
    const d = RAPIER.ColliderDesc.cuboid(h[0], h[1], h[2]).setTranslation(c[0], c[1], c[2]).setRotation(quatY(yaw));
    const col = physics.world.createCollider(d); rq.excluded.add(col.handle); return col;
  };
  const meshes = new THREE.Group(); scene.add(meshes);
  const mat = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
  const box = (c: V3, h: [number, number, number], yaw: number, color: number, o?: Partial<THREE.MeshStandardMaterialParameters>) => { const m = new THREE.Mesh(new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2), mat(color, o)); m.position.set(...c); m.rotation.y = yaw; m.castShadow = m.receiveShadow = true; meshes.add(m); return m; };
  const cover = (id: string, c: V3, h: [number, number, number], yaw: number, color: number, material: 'brick' | 'concrete' | 'wood' | 'metal_thick' = 'wood') => { g.addCover(id, c, h, yaw, material); addCollider(c, h, yaw); box(c, h, yaw, color); };
  const cars = new Map<string, THREE.Group>();
  const car = (id: string, x: number, y: number, z: number, yaw: number, color: number, police = false) => {
    g.addCar(id, x, y, z, yaw);
    const m = carMesh(color, police); m.position.set(x, y, z); m.rotation.y = yaw; scene.add(m); cars.set(id, m);
    addCollider([x, y + 0.75, z], [1.0, 0.7, 2.7], yaw);
    return m;
  };
  const propDefs: { id: string; type: PropType; x: number; y: number; z: number; yaw: number }[] = [];
  const prop = (id: string, type: PropType, x: number, y: number, z: number, yaw = 0) => { g.addProp(id, type, x, y, z, yaw); propDefs.push({ id, type, x, y, z, yaw }); const b = g.world.get(id)!; if (type !== 'storefront_glass') addCollider(b.c, b.h as [number, number, number], yaw); };

  // ---------------------------------------------------------------- LOT (and YARD, SHOP)
  {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(150, 0.4, 90), mat(0x3a2f2c, { roughness: 0.95 }));
    slab.position.set(LOT.x + 30, lotY - 0.2, LOT.z - 10); slab.receiveShadow = true; meshes.add(slab);
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(75, 0.2, 45).setTranslation(LOT.x + 30, lotY - 0.2, LOT.z - 10));
    // faded bay lines
    for (let i = -6; i <= 6; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 5), mat(0xb8ad94, { roughness: 1 })); l.position.set(LOT.x + i * 3, lotY + 0.01, LOT.z - 26); meshes.add(l); }
    const Y = lotY;
    car('car_p', LOT.x, Y, LOT.z - 2.5, Math.PI / 2, 0x6b6b3a);
    car('car_e1', LOT.x - 9, Y, LOT.z - 27, 0, 0x4a1f22);
    car('car_e2', LOT.x + 10, Y, LOT.z - 25, 0.3, 0xd8cdb4);
    car('car_x', LOT.x + 16, Y, LOT.z - 6, Math.PI / 2, 0xc79a3c);
    const crates: [number, number][] = [[-4, -22], [3, -21], [-14, -15], [14, -15], [-7, -11], [7, -12], [0, -16], [-18, -6]];
    crates.forEach(([x, z], i) => cover(`crate${i}`, [LOT.x + x, Y + 0.55, LOT.z + z], [0.7, 0.55, 0.7], 0.2 * i, 0x8a6a40));
    cover('wall_l', [LOT.x - 24, Y + 1.1, LOT.z - 14], [0.3, 1.1, 8], 0, 0x7a3b2c, 'brick');
    cover('stoop', [LOT.x + 22, Y + 0.45, LOT.z - 16], [2.0, 0.45, 1.2], 0, 0xb59a7a, 'concrete');
    prop('lot_news', 'newsstand', LOT.x - 12, Y, LOT.z - 1, 0);
    prop('lot_hyd', 'hydrant', LOT.x + 6, Y, LOT.z + 4);
    prop('lot_mail', 'mailbox', LOT.x - 5, Y, LOT.z + 3);
    prop('lot_can1', 'trash_can', LOT.x + 9, Y, LOT.z - 1);
    prop('lot_meter1', 'parking_meter', LOT.x + 3, Y, LOT.z + 5);
    prop('lot_booth', 'phone_booth', LOT.x - 18, Y, LOT.z + 4);
    prop('lot_glass', 'storefront_glass', LOT.x + 26, Y, LOT.z + 6, 0);
    box([LOT.x + 26, Y + 1.6, LOT.z + 6.6], [2.4, 1.6, 0.5], 0, 0x7a3b2c);
    // YARD: brick-walled, east of the lot
    const YX = LOT.x + 70, YZ = LOT.z - 10;
    cover('yard_n', [YX, Y + 1.5, YZ - 12], [12, 1.5, 0.3], 0, 0x7a3b2c, 'brick');
    cover('yard_s', [YX, Y + 1.5, YZ + 12], [12, 1.5, 0.3], 0, 0x7a3b2c, 'brick');
    cover('yard_e', [YX + 12, Y + 1.5, YZ], [0.3, 1.5, 12], 0, 0x7a3b2c, 'brick');
    prop('yard_can', 'trash_can', YX + 5, Y, YZ + 9);
    prop('yard_hyd', 'hydrant', YX - 6, Y, YZ - 10);
    // SHOP counter + closet
    box([LOT.x - 30, Y + 0.55, LOT.z + 12], [2.5, 0.55, 0.5], 0, 0x5a3326);
    box([LOT.x - 30, Y + 2.2, LOT.z + 13], [2.6, 0.35, 0.05], 0, 0xefe3c4, { emissive: 0x403020 });
    box([LOT.x - 36, Y + 1.0, LOT.z + 13], [0.8, 1.0, 0.4], 0, 0x4a3020); // the closet
  }

  // ---------------------------------------------------------------- BLOCK: W 31st St, 7th–8th Aves (real city)
  const blockY = (x: number, z: number) => heightAt(x, z) + CURB_HEIGHT;
  {
    const S = BLOCK.zS + 0.6; // south sidewalk, near the curb
    const props: [string, PropType, number, number][] = [
      ['b_box8', 'call_box', BLOCK.minX + 6, S], ['b_box7', 'call_box', BLOCK.maxX - 6, BLOCK.zN - 0.6],
      ['b_booth', 'phone_booth', -760, S + 1.6], ['b_hyd', 'hydrant', -705, S], ['b_hyd2', 'hydrant', -820, BLOCK.zN - 0.6],
      ['b_news', 'newsstand', -640, S + 1.8], ['b_mail', 'mailbox', -846, S + 0.3], ['b_can', 'trash_can', -728, S],
    ];
    for (const [id, t, x, z] of props) prop(id, t, x, blockY(x, z), z, 0);
    for (let i = 0; i < 6; i++) { const x = -800 + i * 9; prop(`b_meter${i}`, 'parking_meter', x, blockY(x, S), S - 0.2); }
    // storefront glass on the building line (found by ray once colliders exist; placed lazily)
    for (let i = 0; i < 10; i++) { const x = -850 + i * 8, z = BLOCK.zS - 0.6 - 2.2; sim.add(`ped${i}`, x, z, { yaw: i % 2 ? Math.PI / 2 : -Math.PI / 2 }); }
    sim.bounds = [BLOCK.minX + 4, BLOCK.maxX - 4, BLOCK.zS - 1.1, BLOCK.zS + 2.5];
    for (const p of sim.peds) { p.z = BLOCK.zS + 1.2; p.home = [p.x, p.z]; }
  }
  const propMeshes = new PropMeshes(propDefs); scene.add(propMeshes.root);
  // the precinct's beat cop and a parked radio car on the block (Midtown Central's station house is on this block)
  const beat = g.registerPolice('foot', 'pct.midtown_central', -812, BLOCK.zS + 1.5, { corrupt: 0.7 });
  beat.yaw = Math.PI / 2;
  car('b_radio', -735, heightAt(-735, BLOCK.zS - 2.3), BLOCK.zS - 2.3, -Math.PI / 2, 0x1f2a44, true);
  car('b_sedan', -690, heightAt(-690, BLOCK.zN + 2.2), BLOCK.zN + 2.2, Math.PI / 2, 0x5a3326);
  car('b_cab', -780, heightAt(-780, BLOCK.zN + 2.2), BLOCK.zN + 2.2, Math.PI / 2, 0xe3a92a);
  const parkedRadio = g.registerPolice('radio_car', 'pct.midtown_central', -735, BLOCK.zS - 2.3, { corrupt: 0 });
  parkedRadio.yaw = -Math.PI / 2; parkedRadio.state = 'search'; parkedRadio.searchFor = -1e9; parkedRadio.speed = 0;
  (parkedRadio as any).parked = true;

  // ---------------------------------------------------------------- bodies, FX, overlays, HUD
  const fx = new Fx(); scene.add(fx.root);
  const overlays = new Overlays(g, camera); scene.add(overlays.root);
  overlays.setEnabled(params.get('overlays') !== '0');
  const hud = new Hud();
  const bodies = new Map<string, Body>();
  const copCars = new Map<string, THREE.Group>();
  const bodyFor = (id: string, color: number, cop = false) => { let b = bodies.get(id); if (!b) { b = new Body(color, { cop }); bodies.set(id, b); scene.add(b.root); } return b; };

  // ---------------------------------------------------------------- stations
  let station: Station = 'lot';
  const go = (s: Station) => {
    station = s; g.setContext({ atHome: false });
    const at = s === 'lot' ? [LOT.x, LOT.z + 8, 0] : s === 'yard' ? [LOT.x + 62, LOT.z - 10, -Math.PI / 2] : s === 'shop' ? [LOT.x - 30, LOT.z + 9.5, Math.PI] : [-780, BLOCK.zS + 1.6, Math.PI / 2];
    const y = s === 'block' ? blockY(at[0], at[1]) + 0.05 : lotY + 0.05;
    player.teleport(at[0], y, at[1], at[2]); orbit.snap(player.pos, at[2]);
    if (g.pc.cover) g.toggleCover(null);
    for (const b of hud.nav.children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.s === s);
  };
  for (const s of ['lot', 'yard', 'block', 'shop'] as Station[]) { const b = btn(s, '', () => go(s)); b.dataset.s = s; hud.nav.appendChild(b); }
  hud.nav.appendChild(btn('overlays', '', () => overlays.setEnabled(!overlays.enabled)));

  // ---------------------------------------------------------------- input → gameplay
  const touch = input.isTouch;
  g.setContext({ device: touch ? 'touch' : 'mouse', assist: 'standard' });
  const isMelee = () => g.reg.weapon(g.pc.weapon).class === 'melee';
  let fireHeldAt = -1, aimHeld = false;
  const pressFire = () => { if (isMelee()) { fireHeldAt = g.now; } else g.setFiring(true); };
  const releaseFire = () => { if (isMelee()) { if (fireHeldAt >= 0) g.meleeAttack(g.now - fireHeldAt > 0.32 ? 'heavy' : 'light'); fireHeldAt = -1; } else g.setFiring(false); };
  const pressAim = () => { aimHeld = true; if (isMelee()) g.block(true); else g.setAiming(true); };
  const releaseAim = () => { aimHeld = false; g.block(false); g.setAiming(false); };
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; if (e.button === 0) pressFire(); if (e.button === 2) pressAim(); });
  window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') return; if (e.button === 0) releaseFire(); if (e.button === 2) releaseAim(); });
  const moveDir = (): [number, number] => { const fx = -Math.sin(orbit.yaw), fz = -Math.cos(orbit.yaw), rx = Math.cos(orbit.yaw), rz = -Math.sin(orbit.yaw); return [fx * input.move.y + rx * input.move.x, fz * input.move.y + rz * input.move.x]; };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.code;
    if (k === 'KeyR') g.reload();
    if (k === 'KeyC') g.toggleCover(moveDir());
    if (k === 'KeyX') g.setBlindFire(true);
    if (k === 'KeyZ') { const d = moveDir(); g.dodge(d[0] || d[1] ? d : [Math.cos(orbit.yaw), -Math.sin(orbit.yaw)]); }
    if (k === 'KeyG') grab();
    if (k === 'KeyT') { const l = ['torso', 'head', 'legs'] as const; g.setLimb(l[(l.indexOf(g.aimer.limb) + 1) % 3]); }
    if (k === 'Tab') { e.preventDefault(); g.cycleLock(1); }
    if (k === 'KeyB') intimidate();
    if (k === 'KeyH') g.use('item.bandage');
    if (k === 'KeyO') overlays.setEnabled(!overlays.enabled);
    if (k === 'KeyE') interact();
    if (/^Digit[1-7]$/.test(k)) { const ws = g.inv.weapons(lead); const w = ws[+k.slice(5) - 1]; if (w) g.equip(w); }
    if (k === 'F5') go('lot'); if (k === 'F6') go('yard'); if (k === 'F7') go('block'); if (k === 'F8') go('shop');
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyX') g.setBlindFire(false); });
  const grab = () => { const f = g.melee.fighters.get('player'); if (f?.state === 'grappling') { const d = moveDir(); g.grappleAction(d[0] || d[1] ? 'shove' : 'knee', d[0] || d[1] ? d : undefined); } else if (f?.state === 'grappled') g.struggle(); else g.meleeAttack('grapple'); };
  const intimidate = () => { const w = nearestWitness(7); if (w) hud.say('notice', g.intimidate(w) === 'silenced' ? 'They back off. They saw nothing.' : 'They panic and run.', 3); };
  const nearestWitness = (r: number) => { let best: string | null = null, bd = r; for (const w of g.witnesses.list.values()) { const p = sim.peds.find((q) => q.id === w.ped); if (!p) continue; const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z); if (d < bd && w.state !== 'filed' && w.state !== 'silenced') { bd = d; best = w.ped; } } return best; };

  // touch combat layer
  if (touch) {
    const tb = (label: string, down: () => void, up?: () => void, big = false) => {
      const b = el('button', big ? 'big' : '') as HTMLButtonElement; b.textContent = label;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.setPointerCapture(e.pointerId); b.classList.add('on'); down(); });
      const u = (e: Event) => { e.stopPropagation(); b.classList.remove('on'); up?.(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u);
      hud.touch.appendChild(b); return b;
    };
    tb('◀', () => g.cycleLock(-1)); tb('▶', () => g.cycleLock(1));
    tb('AIM', () => { if (isMelee()) { pressAim(); return; } if (g.aimer.locked) { g.aimer.release(); g.setAiming(false); } else { g.setAiming(true); g.lockOn(); } }, () => { if (isMelee()) releaseAim(); }, true);
    tb('FIRE', pressFire, releaseFire, true);
    tb('COVER', () => g.toggleCover(moveDir())); tb('RELOAD', () => g.reload());
    tb('GUARD', () => { pressAim(); guardAt = g.now; }, () => { releaseAim(); if (g.now - guardAt < 0.18) { const d = moveDir(); g.dodge(d[0] || d[1] ? d : [Math.cos(orbit.yaw), -Math.sin(orbit.yaw)]); } });
    tb('GRAB', grab); tb('WPN', () => g.cycleWeapon(1)); tb('USE', interact); tb('BLIND', () => g.setBlindFire(true), () => g.setBlindFire(false)); tb('THREAT', intimidate);
    for (const l of ['head', 'torso', 'legs'] as const) { const b = el('button', '') as HTMLButtonElement; b.textContent = l === 'torso' ? 'BODY' : l.toUpperCase(); b.dataset.l = l; b.addEventListener('pointerdown', (e) => { e.stopPropagation(); g.setLimb(l); }); hud.limbs.appendChild(b); }
  }
  let guardAt = 0;

  // ---------------------------------------------------------------- interactions: shop, closet, phones, encounters
  const shopList = ['shop.test_diner', 'shop.test_pharmacy', 'shop.test_hardware', 'shop.test_newsstand', 'shop.test_liquor', 'shop.test_pawn', 'shop.test_fence'];
  (g.reg.shops as Map<string, any>).set('shop.test_clothier', { id: 'shop.test_clothier', name: 'Clothier (test)', kind: 'clothing', markup: 1, buyback: 0, stock: [] });
  let shopTab = 0;
  const openShop = () => {
    const P = hud.panel; P.innerHTML = ''; P.style.display = 'block';
    const tabs = el('div', ''); tabs.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-bottom:6px';
    [...shopList, 'shop.test_clothier', 'closet'].forEach((s, i) => { const b = btn(s === 'closet' ? 'closet' : g.reg.shops.get(s)!.kind, i === shopTab ? 'y' : '', () => { shopTab = i; openShop(); }); b.style.minHeight = '30px'; b.style.padding = '3px 6px'; tabs.appendChild(b); });
    P.appendChild(tabs);
    const id = [...shopList, 'shop.test_clothier', 'closet'][shopTab];
    const h = el('h3', ''); P.appendChild(h);
    if (id === 'closet') {
      h.textContent = 'Closet (home)'; g.setContext({ atHome: true });
      for (const o of g.wardrobe.owned(lead)) { const def = g.reg.outfits.get(o)!; const line = el('div', 'line'); line.append(span(def.name + (g.wardrobe.wearing(lead) === o ? ' ✓' : '')), btn('wear', 'y', () => { g.changeOutfit(o); openShop(); })); P.appendChild(line); }
    } else if (id === 'shop.test_clothier') {
      h.textContent = 'Clothier';
      for (const o of g.reg.outfits.values()) { if (o.leads && !o.leads.includes(lead)) continue; if (g.wardrobe.owned(lead).includes(o.id)) continue; const line = el('div', 'line'); line.append(span(o.name), span(`$${(o.price / 100).toFixed(2)}`, 'price'), btn('buy & wear', 'y', () => { const r = g.shops.buyOutfit(lead, id, o.id); if (r.ok) g.changeOutfit(o.id, true); toast(r.ok ? `Bought ${o.name}` : `Can't: ${r.reason}`); openShop(); })); P.appendChild(line); }
    } else {
      const s = g.reg.shops.get(id)!; h.textContent = s.name;
      for (const it of g.shops.listing(id)) {
        const line = el('div', 'line');
        line.append(span(`${it.name}${it.qty >= 0 ? ` (${it.qty})` : ''}`), span(`$${(it.price / 100).toFixed(2)}`, 'price'), btn(s.kind === 'diner' ? 'eat' : 'buy', 'y', () => { const ok = s.kind === 'diner' ? g.eatAt(id, it.item) : g.shops.buy(lead, id, it.item).ok; toast(ok ? `${s.kind === 'diner' ? 'Ate' : 'Bought'} ${it.name}` : "Can't afford it or it's gone"); openShop(); }));
        P.appendChild(line);
      }
      if (s.buyback > 0) for (const it of g.inventory.of(lead).items) { const p = g.shops.sellPrice(id, it.id); if (p === null) continue; const line = el('div', 'line'); line.append(span(`sell ${g.reg.item(it.id).name} ×${it.qty}`), span(`$${(p / 100).toFixed(2)}`, 'price'), btn('sell', '', () => { g.shops.sell(lead, id, it.id, 1); openShop(); })); P.appendChild(line); }
    }
    P.appendChild(btn('close', 'r', () => { P.style.display = 'none'; g.setContext({ atHome: false }); }));
  };
  const span = (t: string, cls = '') => { const s = el('span', cls); s.textContent = t; return s; };
  function interact() {
    const p = player.pos;
    if (Math.hypot(p.x - (LOT.x - 30), p.z - (LOT.z + 11)) < 4.5) return openShop();
    const ring = g.phones.pending.find((c) => c.ringing);
    if (ring) { const ph = g.phones.phones.get(ring.ringing!)!; if (Math.hypot(ph.x - p.x, ph.z - p.z) < 3) { g.phones.answer(lead, ph.id); return; } }
    const ph = g.phones.nearest(p.x, p.z, 2.5);
    if (ph) { const r = g.phones.place(lead, ph.id, 'service'); toast(r.ok ? `Answering service: ${r.messages?.length ? r.messages.map((m) => `call from ${m.from}`).join(', ') : 'no messages'}` : r.reason === 'no_dime' ? 'No dime.' : 'Out of order.'); return; }
    if (Math.hypot(p.x - (LOT.x - 36), p.z - (LOT.z + 12)) < 3) { shopTab = shopList.length + 1; return openShop(); }
  }
  const toast = (t: string) => hud.say('notice', t, 3);
  // encounter panel
  let encUnit: string | null = null;
  const showEncounter = (unit: string | null) => {
    if (unit === encUnit) return; encUnit = unit;
    const E = hud.enc; E.innerHTML = ''; E.style.display = unit ? 'block' : 'none';
    if (!unit) return;
    const u = g.policeSys.units.get(unit)!;
    E.append(Object.assign(el('div', 'who'), { textContent: u.kind === 'plainclothes' ? 'PLAINCLOTHES' : 'PATROLMAN' }), Object.assign(el('div', 'say'), { textContent: '"Hold it right there. Hands where I can see them."' }));
    const b = el('div', 'btns');
    b.append(btn('comply', '', () => { g.surrender(true); }));
    for (const c of [1000, 2500, 5000, 10000]) b.append(btn(`offer $${c / 100}`, 'y', () => { const r = g.police.bribe(unit, c); hud.say('bark', r === 'accepted' ? '"I didn\'t see nothing. Get lost."' : r === 'refused' ? '"That\'s it? Try again, or turn around."' : '"You trying to buy me? Hands on the car!"', 4); }));
    b.append(btn('run', 'r', () => showEncounter(null)));
    E.appendChild(b);
  };

  // ---------------------------------------------------------------- gameplay events → presentation
  g.on('shot', (e) => { if (e.player) { fx.muzzle(e.origin); } else fx.muzzle(e.origin); });
  g.on('impact', (e) => fx.impact(e.point, e.material, undefined));
  g.on('hit', (e) => { if (e.shooter === 'player') hud.hit(!!e.killed); const b = bodies.get(e.target) ?? (e.target === 'player' ? pbody : null); if (b) b.flinch = 0.3; if (e.target === 'player') input.rumble(0.6, 0.3, 120); if (e.point && !e.melee) fx.burst(e.point, { n: 5, color: 0x4a0c0c, speed: 1.2, life: 0.4, size: 0.035 }); });
  g.on('propBroken', (e) => { const p = propDefs.find((d) => d.id === e.id)!; propMeshes.set(e.id, e.type, p, 9); if (e.type === 'newsstand') fx.papers(e.at); if (e.type === 'storefront_glass' || e.type === 'phone_booth') fx.glass(e.at); });
  g.props.on('damaged', (e) => { const p = propDefs.find((d) => d.id === e.id)!; propMeshes.set(e.id, e.type, p, e.stage); });
  g.props.on('reset', (e) => { const p = propDefs.find((d) => d.id === e.id)!; propMeshes.set(e.id, e.type, p, 0); });
  g.on('pickup', (e) => { fx.coins(e.at); toast(`+${e.cents}¢ from the meter`); });
  g.on('radio', (e) => { const near = [...g.policeSys.units.values()].some((u) => Math.hypot(u.x - player.pos.x, u.z - player.pos.z) < 45) || station === 'block'; if (near) hud.say('radio', e.text, 6); });
  const BARK: Record<string, string> = { spotted: 'There he is!', reloading: 'Reloading!', flanking: "I'm going round!", cover_me: 'Cover me!', man_down: "They got Sal!", behind_cover: "He's behind the car!", surrender: "Okay, okay! I'm done!", run: 'Forget this!', charge: 'Get him!', hit: 'Agh!', cease: 'Fall back!', police: 'Police! Drop it!', lost_him: 'Where\'d he go?' };
  g.on('bark', (e) => { if (Math.hypot(e.at[0] - player.pos.x, e.at[2] - player.pos.z) < 50 && e.bark !== 'hit') hud.say('bark', `"${BARK[e.bark] ?? e.bark}"`, 2.5); });
  g.on('witness', (e) => { if (e.kind === 'heading') hud.say('notice', `Someone's running for the ${e.to === 'callbox' ? 'call box' : e.to === 'unit' ? 'patrol car' : 'payphone'}.`, 3.5); });
  g.on('police', (e) => { if (e.kind === 'stop') hud.say('bark', '"Hey — you. Hold it."', 3); if (e.kind === 'pursuit' && e.suspect === 'player') hud.say('bark', '"Stop! Police!"', 3); if (e.kind === 'lost') hud.say('notice', 'They lost you.', 3); });
  g.on('notice', (e) => { if (e.kind === 'surrendered') hud.say('notice', 'He gives up.', 2.5); if (e.kind === 'fled') hud.say('notice', 'He runs.', 2.5); });
  g.on('ring', () => hud.say('notice', 'A payphone is ringing nearby.', 4));
  g.on('wear', (e) => toast(`Changed: ${g.wardrobe.look(e.lead).headline}`));
  g.on('wasted', async (e) => {
    await hud.titleCard(e.hospital.name.toUpperCase(), `Discharged six hours later.\nBill $${(e.bill / 100).toFixed(2)} · paid $${(e.paid / 100).toFixed(2)}${e.debt ? ` · you owe $${(e.debt / 100).toFixed(2)}` : ''}`);
    go(station === 'block' ? 'block' : 'lot');
  });
  g.on('arrested', async (e) => {
    showEncounter(null);
    await hud.titleCard(g.policeSys.pct(e.precinct).name.toUpperCase(), `Booked, a night in the tank, released at seven.\nFine $${(e.fine / 100).toFixed(2)}${e.confiscated.length ? `\nHeld in the property room: ${e.confiscated.map((i: any) => g.reg.item(i.id).name).join(', ')}` : ''}`);
    go('block');
  });
  g.on('geyser', (e) => { if (e.on) geysers.add(e.id); else geysers.delete(e.id); });
  const geysers = new Set<string>();

  // ---------------------------------------------------------------- frame loop
  const clock = new THREE.Timer();
  let frame = 0, jumpLatch = false, hudT = 0;
  const stats = { gp: [] as number[], frame: [] as number[] };
  const fakeInput = { move: { x: 0, y: 0 }, isHeld: (a: string) => (a === 'sprint' ? input.isHeld('sprint') && g.canSprint() : input.isHeld(a as any)) } as unknown as Input;
  const onResize = () => { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect > 2 ? 52 : 60; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); };
  window.addEventListener('resize', onResize); onResize();
  const cam = { override: null as null | { pos: V3; look: V3 } };
  let lastRecoil = 0;
  document.getElementById('loading')?.remove();
  go((params.get('station') as Station) ?? 'lot');

  renderer.setAnimationLoop((t) => {
    clock.update(t);
    const dt = Math.min(clock.getDelta(), 0.1);
    const f0 = performance.now();
    input.poll(dt);
    if (input.pressed('jump')) jumpLatch = true;
    // pad combat mapping
    const pad = input.pad;
    if (pad.connected) {
      g.setContext({ device: 'pad' });
      if (pad.lt > 0.4 && !aimHeld) pressAim(); else if (pad.lt <= 0.4 && aimHeld) releaseAim();
      if (pad.pressed(Btn.RB)) g.toggleCover(moveDir());
      if (pad.pressed(Btn.X)) g.reload();
      if (pad.pressed(Btn.B)) { const d = moveDir(); g.dodge(d[0] || d[1] ? d : [Math.cos(orbit.yaw), -Math.sin(orbit.yaw)]); }
      if (pad.pressed(Btn.LB)) g.cycleWeapon(1);
      if (pad.pressed(Btn.Left)) g.cycleLock(-1); if (pad.pressed(Btn.Right)) g.cycleLock(1);
      if (pad.rt > 0.5 && !(g.pc.firing || fireHeldAt >= 0)) pressFire(); else if (pad.rt <= 0.5 && (g.pc.firing || fireHeldAt >= 0)) releaseFire();
    }
    if (input.pressed('use')) interact();

    // aim assist (pad soft lock / mouse friction) adjusts the camera before it moves
    const cf = camera.getWorldDirection(new THREE.Vector3());
    if (g.pc.aiming && g.pc.device !== 'touch') {
      const a = g.aimer.assist([camera.position.x, camera.position.y, camera.position.z], [cf.x, cf.y, cf.z], g.aimTargets(), g.pc.assist, false, g.pc.device === 'pad' ? 'pad' : 'mouse', dt);
      orbit.yaw += a.nudgeYaw; orbit.pitch += a.nudgePitch;
      if (a.rateMul < 1) { input.look.yaw *= a.rateMul; input.look.pitch *= a.rateMul; }
    }
    // touch lock: the camera eases toward the locked target
    if (g.pc.device === 'touch' && g.aimer.locked) {
      const tgt = g.aimTargets().find((x) => x.id === g.aimer.locked);
      if (tgt) { const want = Math.atan2(-(tgt.chest[0] - player.pos.x), -(tgt.chest[2] - player.pos.z)); orbit.yaw += Math.atan2(Math.sin(want - orbit.yaw), Math.cos(want - orbit.yaw)) * Math.min(1, dt * 6); }
    }
    // recoil kicks the camera
    const gun = g.currentGun();
    if (gun) { const r = gun.recoil; if (r > lastRecoil) orbit.pitch += ((r - lastRecoil) * Math.PI) / 180 * 0.6; lastRecoil = r; }

    // movement: injuries, cover, guard
    const mm = g.moveMul();
    fakeInput.move.x = input.move.x * mm; fakeInput.move.y = input.move.y * mm;
    if (g.pc.cover) {
      // slide along the cover face; pushing away from it leaves cover
      const c = g.pc.cover, tx = -c.nz, tz = c.nx;
      const [mx, mz] = moveDir();
      const along = mx * tx + mz * tz, away = mx * c.nx + mz * c.nz;
      if (away > 0.7) g.toggleCover(null);
      else {
        const want = { x: c.x + tx * along * 0.0, z: c.z };
        void want;
        const lr = along;
        const rx = Math.cos(orbit.yaw), rz = -Math.sin(orbit.yaw);
        const sx = tx * lr, sz = tz * lr;
        fakeInput.move.x = (sx * rx + sz * rz) * 0.5; fakeInput.move.y = (sx * -Math.sin(orbit.yaw) + sz * -Math.cos(orbit.yaw)) * 0.5;
        // keep hugging the cover: pull toward the face
        const dx = c.x - player.pos.x, dz = c.z - player.pos.z, dn = dx * c.nx + dz * c.nz;
        if (Math.abs(dn) > 0.15) { player.pos.x += c.nx * dn * Math.min(1, dt * 8); player.pos.z += c.nz * dn * Math.min(1, dt * 8); }
        // re-claim the nearest point as we slide
        const nb = g.cover.near(player.pos.x, player.pos.z, null, 1.2);
        if (nb && nb.obj === c.obj && nb !== c) { g.cover.claim(nb, 'player'); g.pc.cover = nb; }
      }
    }
    const meleeState = g.melee.fighters.get('player')?.state ?? 'idle';
    if (meleeState === 'stagger' || meleeState === 'down' || meleeState === 'grappled' || g.pc.surrendered) { fakeInput.move.x = fakeInput.move.y = 0; }
    // pushes from melee (dodges, knockback)
    physics.update(dt, (h) => { player.fixedUpdate(h, fakeInput, orbit.yaw, jumpLatch); jumpLatch = false; });
    g.setContext({ speed: Math.hypot(player.vel.x, player.vel.z) });
    if (g.pc.aiming || g.pc.firing || g.pc.cover || fireHeldAt >= 0) player.heading = orbit.yaw;

    // camera
    const aimingCam = g.pc.aiming && !isMelee();
    orbit.distance += ((aimingCam ? 2.1 : 4.4) - orbit.distance) * Math.min(1, dt * 10);
    orbit.shoulder += ((aimingCam ? 0.75 : 0.38) - orbit.shoulder) * Math.min(1, dt * 10);
    const rp = player.renderPos(physics.alpha);
    orbit.update(dt, rp);
    if (cam.override) { camera.position.set(...cam.override.pos); camera.lookAt(...cam.override.look); }
    // aim point: camera centre ray against the gameplay world and bodies
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    const co: V3 = [camera.position.x, camera.position.y, camera.position.z], cd: V3 = [fwd.x, fwd.y, fwd.z];
    const wh = g.world.ray(co, cd, 250);
    let best = wh ? wh.t : 120;
    for (const hb of g.hitboxes()) { if (hb.id === 'player') continue; for (const p of hb.parts) { const tt = rayCapsule(co, cd, p.a, p.b, p.r); if (tt > 0 && tt < best) best = tt; } }
    aimPoint.set(co[0] + cd[0] * best, co[1] + cd[1] * best, co[2] + cd[2] * best);

    // sim + gameplay
    sim.update(dt);
    // geysers push people
    for (const p of sim.peds) { const push = g.props.geyserPush(p.x, p.z); if (push) { p.x += push[0] * dt; p.z += push[1] * dt; } }
    const gpt = performance.now();
    g.update(dt);
    stats.gp.push(performance.now() - gpt); if (stats.gp.length > 600) stats.gp.shift();
    // melee pushes onto the player controller
    for (const e of pushes.splice(0)) if (e.id === 'player') player.teleport(player.pos.x + e.dx, player.pos.y, player.pos.z + e.dz, player.heading);
    for (const id of geysers) if (frame % 2 === 0) { const p = propDefs.find((d) => d.id === id)!; fx.geyser([p.x, p.y, p.z]); }

    // tracers
    for (const r of g.lastShots) { const o = r.shot.origin; fx.tracer([o[0], o[1], o[2]], r.actorHits[0]?.point ?? r.surfaces.at(-1)?.point ?? r.end); }

    // ------------------------------------------------ presentation sync
    pbody.root.position.set(rp.x, rp.y, rp.z); pbody.root.rotation.y = player.heading;
    pbody.speed = Math.hypot(player.vel.x, player.vel.z);
    pbody.pose = poseOfPlayer(meleeState);
    pbody.update(dt);
    // AI agents
    const live = new Set<string>();
    for (const a of g.ai.agents.values()) {
      live.add(a.id);
      const b = bodyFor(a.id, bodyColor(a.faction), a.faction === 'police' || a.faction === 'corrupt_cop');
      b.root.position.set(a.pos[0], a.pos[1], a.pos[2]); b.root.rotation.y = a.yaw;
      b.speed = Math.hypot(a.vel[0], a.vel[1]);
      const ms = g.melee.fighters.get(a.id)?.state;
      b.pose = !a.alive ? 'dead' : a.state === 'surrender' ? 'handsUp' : ms === 'windup' ? 'windup' : ms === 'active' ? 'strike' : ms === 'stagger' ? 'stagger' : ms === 'down' ? 'down' : ms === 'grappled' ? 'grapple' : a.state === 'peek' || a.state === 'suppress' ? 'aim' : a.stance === 'crouch' ? 'crouch' : b.speed > 3 ? 'run' : b.speed > 0.2 ? 'walk' : 'idle';
      b.update(dt);
    }
    // police units not in combat
    for (const u of g.policeSys.units.values()) {
      if (u.state === 'combat') { const cm = copCars.get(u.id); if (cm) { /* the car stays where he left it */ } continue; }
      live.add(u.id);
      if (u.kind === 'foot' || u.kind === 'plainclothes' && false) {
        const b = bodyFor(u.id, bodyColor('police'), true);
        const y = inBlockArea(u.x, u.z) ? blockY(u.x, u.z) : lotY;
        b.root.position.set(u.x, y, u.z); b.root.rotation.y = u.yaw; b.speed = u.speed;
        const dead = g.healthSys.state(u.id)?.dead;
        b.pose = dead ? 'dead' : u.state === 'encounter' ? 'aim' : u.speed > 3 ? 'run' : u.speed > 0.2 ? 'walk' : 'idle';
        b.update(dt);
      } else if (u.kind !== 'helicopter') {
        let cm = copCars.get(u.id);
        if (!cm) { cm = (u as any).parked ? cars.get('b_radio')! : carMesh(u.kind === 'plainclothes' ? 0x4a4038 : 0x1f2a44, u.kind !== 'plainclothes'); if (!(u as any).parked) scene.add(cm); copCars.set(u.id, cm); }
        if (!(u as any).parked) { const y = inBlockArea(u.x, u.z) ? heightAt(u.x, u.z) : lotY; cm.position.set(u.x, y, u.z); cm.rotation.y = u.yaw; }
        const bub = cm.getObjectByName('bubble') as THREE.Mesh | undefined;
        if (bub) (bub.material as THREE.MeshStandardMaterial).emissiveIntensity = ['enroute', 'pursuit', 'approach'].includes(u.state) ? (Math.sin(frame * 0.5) > 0 ? 4 : 0.2) : 0.5;
      }
    }
    for (const [id, cm] of copCars) if (!g.policeSys.units.has(id) && !(cm === cars.get('b_radio'))) { scene.remove(cm); copCars.delete(id); }
    // pedestrians
    for (const p of sim.peds) {
      live.add(p.id);
      const b = bodyFor(p.id, bodyColor('civilian', p.variant));
      b.root.position.set(p.x, p.y, p.z); b.root.rotation.y = p.yaw; b.speed = p.speed;
      const dead = !p.alive || g.healthSys.state(p.id)?.dead; if (dead && p.alive) sim.kill(p.id);
      b.pose = dead ? 'dead' : p.state === 'cower' ? 'cower' : p.anim === 'use_callbox' || p.anim === 'use_payphone' ? 'call' : p.anim === 'flag_down' ? 'handsUp' : p.speed > 3 ? 'run' : p.speed > 0.2 ? 'walk' : 'idle';
      b.update(dt);
    }
    for (const [id, b] of bodies) if (!live.has(id)) { scene.remove(b.root); bodies.delete(id); }

    // HUD
    const H = g.hud()!;
    hud.set(H, g.reg.lead(lead).name);
    const lockT = g.aimer.locked ? g.aimTargets().find((x) => x.id === g.aimer.locked) : null;
    hud.lock(lockT ? project(lockT.chest) : null, g.aimer.limb);
    hud.limbs.style.display = touch && g.aimer.locked ? 'flex' : 'none';
    for (const b of hud.limbs.children) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.l === g.aimer.limb);
    const runner = H.witnesses.find((w) => w.state === 'toReport' || w.state === 'calling');
    if (runner) { const p = sim.peds.find((q) => q.id === runner.ped); if (p) hud.witness(edgeProject([p.x, p.y + 2.1, p.z]), runner.state === 'calling' ? 'ON THE CALL BOX' : 'WITNESS'); } else hud.witness(null, '');
    showEncounter(H.encounter && (H.encounter.state === 'encounter' || H.encounter.state === 'approach') ? H.encounter.unit : null);
    const near = nearPrompt();
    hud.showPrompt(near);
    hud.update(dt); fx.update(dt);
    if ((hudT -= dt) <= 0) { hudT = 0.1; overlays.update(new THREE.Vector3(rp.x, rp.y, rp.z), orbit.yaw); }
    world.update(new THREE.Vector3(rp.x, rp.y, rp.z));
    if (frame % 12 === 0) physics.sync(player.pos.x, player.pos.z, world.manifest.chunkSize);
    if (!player.active && (station !== 'block' || physics.readyAround(player.pos.x, player.pos.z, world.manifest.chunkSize))) player.active = true;
    input.endFrame();
    renderer.render(scene, camera);
    stats.frame.push(performance.now() - f0); if (stats.frame.length > 600) stats.frame.shift();
    frame++;
  });

  const pushes: { id: string; dx: number; dz: number }[] = [];
  g.melee.on('push', (e) => pushes.push(e));

  function poseOfPlayer(ms: string): Pose {
    const h = g.healthSys.state('player');
    if (h?.dead) return 'dead';
    if (g.pc.surrendered) return 'handsUp';
    if (ms === 'windup') return 'windup'; if (ms === 'active') return 'strike'; if (ms === 'stagger') return 'stagger'; if (ms === 'down') return 'down';
    if (ms === 'grappling' || ms === 'grappled') return 'grapple';
    if (g.melee.fighters.get('player')?.blocking) return 'block';
    if (g.pc.cover && !g.pc.peek && g.pc.cover.height === 'low') return 'crouch';
    if ((g.pc.aiming || g.pc.firing) && !isMelee()) return 'aim';
    const s = Math.hypot(player.vel.x, player.vel.z); return s > 3 ? 'run' : s > 0.2 ? 'walk' : 'idle';
  }
  function nearPrompt(): string | null {
    const p = player.pos;
    if (Math.hypot(p.x - (LOT.x - 30), p.z - (LOT.z + 11)) < 4.5) return `${touch ? 'USE' : 'E'} · shop counter`;
    if (Math.hypot(p.x - (LOT.x - 36), p.z - (LOT.z + 12)) < 3) return `${touch ? 'USE' : 'E'} · closet (change clothes)`;
    const ph = g.phones.nearest(p.x, p.z, 2.5); if (ph) return `${touch ? 'USE' : 'E'} · payphone (10¢)`;
    if (g.pc.cover) return touch ? 'COVER to leave · BLIND to fire over' : 'C leave cover · hold X blind fire · RMB peek';
    const f = g.melee.fighters.get('player'); if (f?.state === 'grappling') return touch ? 'GRAB: knee · stick+GRAB: shove' : 'G knee · move+G shove';
    const w = nearestWitness(7); if (w) return `${touch ? 'THREAT' : 'B'} · lean on the witness`;
    return null;
  }
  function project(p: V3) { const v = new THREE.Vector3(...p).project(camera); if (v.z > 1) return null; return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; }
  function edgeProject(p: V3) {
    const v = new THREE.Vector3(...p).project(camera);
    const behind = v.z > 1; let x = v.x, y = v.y; if (behind) { x = -x; y = -y; }
    const m = Math.max(Math.abs(x), Math.abs(y));
    const onScreen = !behind && m <= 0.92;
    if (!onScreen) { x = (x / m) * 0.9; y = (y / m) * 0.85; }
    return { x: ((x + 1) / 2) * innerWidth, y: ((1 - y) / 2) * innerHeight, ang: onScreen ? Math.PI : Math.atan2(x, y) };
  }

  // ---------------------------------------------------------------- recorder / tester hook
  const director = {
    g, sim, player, orbit, camera, cam, stats, hud, go, overlays, fx, backend,
    get station() { return station; },
    ready: () => new Promise<void>((res) => { const t = () => (world.idle && frame > 10 && player.active ? requestAnimationFrame(() => requestAnimationFrame(() => res())) : setTimeout(t, 50)); t(); }),
    wait: (s: number) => new Promise<void>((res) => setTimeout(res, s * 1000)),
    timings: () => { const a = (xs: number[]) => xs.reduce((p, c) => p + c, 0) / Math.max(1, xs.length); const p95 = (xs: number[]) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length * 0.95)] ?? 0; return { gameplayAvg: a(stats.gp), gameplayP95: p95(stats.gp), frameAvg: a(stats.frame), frameP95: p95(stats.frame), combat: g.timings }; },
    setCam: (pos: V3 | null, look?: V3) => { cam.override = pos ? { pos, look: look! } : null; },
    face: (yaw: number, pitch = -0.12) => { orbit.yaw = yaw; orbit.pitch = pitch; player.heading = yaw; },
    aimAt: (p: V3) => { const yaw = Math.atan2(-(p[0] - player.pos.x), -(p[2] - player.pos.z)); orbit.yaw = yaw; player.heading = yaw; const d = Math.hypot(p[0] - player.pos.x, p[2] - player.pos.z); orbit.pitch = Math.atan2(p[1] - (player.pos.y + 1.6), d) - 0.02; },
    teleport: (x: number, z: number, yaw = 0) => { const y = inBlockArea(x, z) ? blockY(x, z) : lotY; player.teleport(x, y + 0.05, z, yaw); orbit.snap(player.pos, yaw); },
    spawnCrew: (n: number, o: { faction?: 'gang' | 'hood' | 'corrupt_cop'; at?: [number, number]; weapons?: (string | null)[]; melee?: string } = {}) => {
      const at = o.at ?? [LOT.x, LOT.z - 30]; const ids: string[] = [];
      for (let i = 0; i < n; i++) { const id = `crew${frame}_${i}`; const ws = o.weapons ?? ['weapon.pistol', 'weapon.snub', 'weapon.pump', 'weapon.pistol', 'weapon.smg']; if (g.spawnCombatant({ id, faction: o.faction ?? 'gang', squad: `sq${frame}`, pos: [at[0] - (n - 1) * 1.6 + i * 3.2, lotY, at[1]], weapon: ws[i % ws.length], melee: o.melee ?? 'weapon.bat', ammo: 60, leader: i === 0 })) ids.push(id); }
      for (const id of ids) g.ai.alert(id, [player.pos.x, player.pos.z], 'player');
      return ids;
    },
    plates: () => plateFor('b_sedan'),
    blockY, lotY, LOT, BLOCK, propDefs, humanoidHitbox,
  };
  (window as unknown as { __GP: typeof director }).__GP = director;
}

function inBlockArea(x: number, z: number) { return x > BLOCK.minX - 60 && x < BLOCK.maxX + 60 && z > BLOCK.zN - 40 && z < BLOCK.zS + 40; }
function clamp(x: number, a: number, b: number) { return x < a ? a : x > b ? b : x; }
function quatY(yaw: number) { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }
