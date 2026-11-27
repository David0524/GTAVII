/**
 * ?characters=1 test scenes (deterministic: ?t= simulates that many seconds at 60 Hz before the
 * capture; without it the scene runs live).
 *   scene=lineup  page=0|1   20 seeded pedestrians (10 per page) on a turntable (?yaw=deg)
 *   scene=leads   act=1..3   the three leads
 *   scene=course  shot=walkrun|curb|stairs|slope|turn|hail|ledge   locomotion course with foot IK
 *   scene=slide              foot-sliding measurement at three crowd speeds (report only)
 *   scene=crowd   n=400 quality=high|low                           crowd stress test + timings
 *   scene=move  the movement course (MOVEMENT.md): stand-in controller, traversals, steps
 *   zoom=1, lod=n, seed=n, dbg=n|nobump
 */
import * as THREE from 'three/webgpu';
import { normalGeometry, attribute, vec3, vec2, float, texture, uv } from 'three/tsl';
import { createRenderer } from '../../engine/renderer';
import { createCharacterFactory, type CharacterFactory, type Character } from '../index';
import { characterMaterial, surfaceNodes, skinMaps } from '../render/materials';
import type { AgentView } from '../crowd/CrowdRenderer';
import { hash2 } from '../util/rng';
import { generateAppearance } from '../body/appearance';
import { tintFor } from '../heads/rocketbox';
import type { WeaponKind } from '../build/weapons';

const qp = new URLSearchParams(location.search);
const num = (k: string, d: number) => (qp.has(k) ? +qp.get(k)! : d);
// ?t= captures are meant to repeat exactly: seed Math.random (animator idle phases etc.)
if (qp.has('t')) { let s = 0x9e3779b9 ^ num('rseed', 1); Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

const weaponTest = new Map<Character, { at?: [number, number, number]; crouch?: boolean; fire?: boolean }>();

export async function runCharactersTest() {
  const scene = qp.get('scene') ?? 'lineup';
  const { renderer, backend } = await createRenderer(document.getElementById('app')!, 1);
  const world = new THREE.Scene();
  world.background = new THREE.Color(0x2a2522);
  world.fog = new THREE.Fog(0x2a2522, 60, 260);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 400);
  // late-afternoon light: warm key, cool sky fill, back rim
  if (scene !== 'street') { // the street scene uses the engine's atmosphere
  world.add(new THREE.HemisphereLight(0xc8d2e6, 0x4a3c30, 1.25));
  const sun = new THREE.DirectionalLight(0xffe8cc, 2.6); sun.position.set(4, 7, 6); world.add(sun);
  const rim = new THREE.DirectionalLight(0xc0d0ff, 1.0); rim.position.set(-5, 3, -6); world.add(rim);
  }
  const quality = (qp.get('quality') ?? 'high') as 'low' | 'high';
  const factory = await createCharacterFactory({ quality, renderer: qp.has('noktx') ? undefined : renderer });
  if (qp.get('dbg') === 'n') { const mm = characterMaterial(); mm.colorNode = normalGeometry.mul(0.5).add(0.5); mm.normalNode = null; }
  if (qp.get('dbg') === 'skin2') { const mm = characterMaterial(); const u = attribute('uv1', 'vec3'); mm.colorNode = texture(skinMaps.strip, vec2(u.x, float(1).sub(u.y).add(5).div(18))).rgb.sub(0.5).mul(6).add(0.5); mm.normalNode = null; }
  if (qp.get('dbg') === 'skin3') { const mm = characterMaterial(); mm.colorNode = texture(skinMaps.strip, uv()).rgb; mm.normalNode = null; }
  if (qp.get('dbg') === 'uv1') { const mm = characterMaterial(); mm.colorNode = attribute('uv1', 'vec3').mul(vec3(1, 1, 1 / 18)); mm.normalNode = null; }
  if (qp.get('dbg') === 'skin') { const mm = characterMaterial(); mm.colorNode = surfaceNodes().skinDet; mm.normalNode = null; }
  if (qp.get('dbg') === 'fabric') { const mm = characterMaterial(); mm.colorNode = surfaceNodes().detail; mm.normalNode = null; }
  if (qp.get('dbg') === 'nobump') characterMaterial().normalNode = null;
  factory.setClimate({ heat: 0.7 });
  const report: any = { backend, scene, note: 'Headless timings are SwiftShader software rendering (no GPU): CPU-side numbers are meaningful, frame times are not.' };
  let tick: (dt: number) => void = () => {};
  if (scene === 'lineup' || scene === 'leads' || scene === 'shoes' || scene === 'hair' || scene === 'rocketbox' || scene === 'vendors' || scene === 'weapons') tick = await lineup(world, camera, factory, scene, report);
  else if (scene === 'course' || scene === 'slide') tick = course(world, camera, factory, report, scene === 'slide');
  else if (scene === 'crowd') tick = crowd(world, camera, factory, report);
  else if (scene === 'street') tick = await (await import('./StreetTest')).street(world, camera, factory, report, qp);
  else if (scene === 'move') tick = (await import('./MoveCourse')).moveCourse(world, camera, factory, report, qp);
  else if (scene === 'ict') tick = await (await import('./IctTest')).ictScene(world, camera, report, qp);
  const simT = qp.has('t') ? num('t', 0) : -1;
  const frameMs: number[] = [];
  if (simT >= 0) {
    const steps = Math.round(simT * 60);
    for (let i = 0; i < steps; i++) tick(1 / 60);
    if (report.waitFor) { await report.waitFor(tick); delete report.waitFor; }
    renderer.render(world, camera); // warm-up (shader compile)
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); tick(1 / 60); renderer.render(world, camera); frameMs.push(performance.now() - t0); }
    report.renderMsSoftware = frameMs;
    // static capture: stop rendering so the headless screenshot isn't starved by software frames
    requestAnimationFrame(() => { renderer.render(world, camera); (window as any).__CHAR = { ready: true, report }; });
  } else {
    const clock = new THREE.Timer();
    renderer.setAnimationLoop((t) => { clock.update(t); tick(Math.min(0.05, clock.getDelta())); renderer.render(world, camera); });
    (window as any).__CHAR = { ready: true, report };
  }
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  document.getElementById('loading')?.remove();
}

function floor(world: THREE.Scene, size = 60, color = 0x4c4642) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardNodeMaterial({ color, roughness: 0.92 }));
  f.rotation.x = -Math.PI / 2; world.add(f);
}

// ------------------------------------------------------------------------------------------------
async function lineup(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, scene: string, report: any) {
  floor(world);
  const chars: Character[] = [];
  const zoom = qp.get('zoom');
  if (scene === 'rocketbox') {
    // Faces A/B: each lead with its altered Rocketbox-based head beside the same lead with our
    // generated head; then (pool=1) generated pedestrians with their matched pool heads.
    const act = num('act', 1);
    if (!qp.has('pool')) for (const hero of ['char.teddy_arce', 'char.delphine_moore', 'char.nick_varelas']) {
      // Delphine's candidate head isn't preloaded as a lead (no matching base); load it to compare
      // h_<lead>=<head id>: a candidate head for that lead (ICT boards for sign-off); our hair cards
      // unless the head grows its own
      const short = hero.split('.')[1].split('_')[0], hid = qp.get(`h_${short}`) ?? (short === 'delphine' ? qp.get('dhead') ?? 'lead_delphine' : null);
      const he = hid ? factory.heads?.index.find((h) => h.id === hid) : null;
      const cand = he && factory.heads ? { rbHead: await factory.heads.load(he.id), ourHair: !he.ownHair } : {};
      chars.push(factory.spawn(world, { seed: 1, hero, act, overrides: { hat: null, ...cand, ...(qp.has('rbhair') ? { ourHair: false } : {}), ...JSON.parse(qp.get('ov') ?? '{}') } }));
      chars.push(factory.spawn(world, { seed: 1, hero, act, overrides: { hat: null, rbHead: false } }));
    }
    if (qp.has('pool') && !qp.has('heads')) {
      chars.length = 0;
      const heads = factory.heads!;
      const used = new Set<string>();
      for (let i = 0, s = 0; chars.length < num('n', 8) && s < 400; s++) {
        const seed = hash2(4100, s), a = generateAppearance(seed);
        const id = heads.pick(a, used); if (!id) continue;
        used.add(id);
        const asset = await heads.load(id);
        chars.push(factory.spawn(world, { seed, overrides: { hat: null, rbHead: asset, headTint: tintFor(asset, a.skin.tone) } }));
        i++;
      }
    }
    if (qp.has('heads')) {
      // given pool heads (heads=ict: every ICT pool head), each on a generated pedestrian that fits
      // its tag (sex, age band, a hairstyle its scalp shells can show)
      for (const c of chars) c.object.removeFromParent();
      chars.length = 0;
      const heads = factory.heads!;
      const want = qp.get('heads') === 'ict' ? heads.pool.filter((h) => h.id.startsWith('ict_')).map((h) => h.id) : qp.get('heads')!.split(',');
      for (const [k, id] of want.entries()) {
        const e = heads.pool.find((h) => h.id === id); if (!e?.tag) continue;
        const others = new Set(heads.pool.map((h) => h.id).filter((x) => x !== id));
        let seed = 0, a = null as ReturnType<typeof generateAppearance> | null;
        for (let s = 0; s < 4000; s++) {
          const q = generateAppearance(hash2(7300 + k * 31, s)), cat = /afro/.test(q.hair.style) ? 'curly' : q.hair.style === 'bald' || q.hair.style === 'buzz' ? 'bald' : '';
          // (bald is rare in generation: any short-haired man of the band stands in, styled bald below)
          const catOk = cat === e.tag.hair || (e.tag.hair === 'bald' && q.hair.style === 'short');
          if (!catOk) continue;
          // the same gate the crowd uses (sex, age, ancestry, tone after tint): only this head may pass
          const qq = e.tag.hair === 'bald' ? { ...q, hair: { ...q.hair, style: 'bald' as const } } : q;
          if (heads.pick(qq, others) === id) { seed = hash2(7300 + k * 31, s); a = q; break; }
        }
        if (!a) { console.warn('no pedestrian for', id); continue; }
        const asset = await heads.load(id);
        const hair = e.tag.hair === 'bald' && !/bald|buzz/.test(a.hair.style) ? { hair: { style: 'bald' } } : {};
        chars.push(factory.spawn(world, { seed, overrides: { hat: null, glasses: null, rbHead: asset, headTint: tintFor(asset, a.skin.tone), ...hair } }));
      }
    }
    report.heads = chars.map((c) => ({ hero: c.desc.hero, head: (c.desc.overrides?.rbHead as any)?.id ?? null, tris: c.stats.tris, draws: c.stats.draws, style: c.appearance.hair.style, meshes: (c as any).meshes?.map((m: any) => m.name || m.geometry?.index?.count / 3) }));
  } else if (scene === 'hair') {
    // every hair style on a head; women's and men's styles on matching seeds; hats off
    const styles = (qp.get('styles') ?? 'short,sidePart,slick,combOver,pompadour,feathered,shag,earLength,bob,flip,longStraight,ponytail,braid,updo,setCurls,afro,afroShort,curlyMid,cornrows,buzz').split(',');
    const W = ['bob', 'flip', 'longStraight', 'ponytail', 'braid', 'updo', 'setCurls'];
    styles.forEach((style, i) => {
      const female = W.includes(style) || (style === 'shag' || style === 'feathered' || style === 'afro') && i % 2 === 1;
      const old = style === 'combOver' || style === 'setCurls';
      let seed = 900 + i * 53;
      for (let s = 0; s < 400; s++) { const a = generateAppearance(hash2(seed, s)); if ((a.sex < 0.5) === female && (old ? a.age > 50 : a.age < 45) && (style.startsWith('afro') || style === 'cornrows' || style === 'curlyMid' ? a.hair.texture > 0.7 : a.hair.texture < 0.5)) { seed = hash2(seed, s); break; } }
      const hair: Record<string, unknown> = { style };
      if (style === 'combOver') Object.assign(hair, { thinning: 0.8, recession: 0.7 });
      if (style !== 'combOver') Object.assign(hair, { thinning: 0, recession: female ? 0 : 0.2 });
      chars.push(factory.spawn(world, { seed, overrides: { hair, hat: null, glasses: null, facialHair: 'none' } }));
    });
  } else if (scene === 'shoes') {
    // every shoe type, on a seeded man/woman pair per type, bare legs for women so the heel pitch reads
    const kinds = (qp.get('kinds') ?? 'oxford,wingtip,loafer,sneaker,workBoot,boot,platform,pump,slipOn,sandal,clog').split(',');
    const W = ['pump', 'slipOn', 'sandal', 'clog'];
    kinds.forEach((kind, i) => {
      const shoes: Record<string, unknown> = { kind };
      if (kind === 'pump') Object.assign(shoes, { heel: 0.06, sole: 0.01 });
      if (kind === 'platform') Object.assign(shoes, { heel: 0.1, sole: 0.045, color2: '#c8b090', strap: true });
      if (kind === 'boot') Object.assign(shoes, { heel: 0.05, sole: 0.012, shaft: 1.18 });
      if (kind === 'workBoot') Object.assign(shoes, { heel: 0.025, sole: 0.02, shaft: 1.72, color: '#6a4a2a' });
      if (kind === 'sneaker') Object.assign(shoes, { color: '#2a3a6a', color2: '#d8d2c4', heel: 0.025, sole: 0.02 });
      if (kind === 'clog') Object.assign(shoes, { heel: 0.05, sole: 0.03 });
      if (kind === 'sandal') Object.assign(shoes, { heel: 0.03, sole: 0.012, color: '#8a5a34' });
      const female = W.includes(kind) || kind === 'boot' || kind === 'platform' && i % 2 === 0;
      // pick a seed of the right sex
      let seed = 500 + i * 37;
      for (let s = 0; s < 200; s++) { const a = generateAppearance(hash2(seed, s)); if ((a.sex < 0.5) === female && a.age < 55) { seed = hash2(seed, s); break; } }
      const ov: Record<string, unknown> = { shoes };
      if (female) Object.assign(ov, { bottom: { kind: 'skirt', length: 0, flare: 0.06 }, dress: false, outer: null, hosiery: 0 });
      else Object.assign(ov, { outer: null });
      chars.push(factory.spawn(world, { seed, overrides: ov }));
    });
  } else if (scene === 'vendors') {
    // street vendors (sim archetypes): one of each, wardrobe presets from src/characters/wardrobe/outfit.ts
    const ids = ['cart_vendor', 'grocer', 'flower_seller', 'news_vendor', 'shoeshine', 'peddler', 'monte_dealer', 'monte_shill', 'monte_lookout'];
    // &anims=1: one work/customer clip per figure (posing check), looped; &t= picks the moment
    const clips = qp.get('clips')?.split(',') ?? ['vendor_serve', 'vendor_call', 'duck_cart', 'right_cart', 'shine_shoes', 'deal_cards', 'queue', 'watch', 'eat_walk'];
    ids.forEach((id, i) => {
      const c = factory.spawn(world, { seed: num('seed', 7) * 101 + i * 13, archetype: `npc.${id}` });
      if (id === 'monte_lookout') c.animator.setIdle('idle_pockets');
      if (qp.has('anims') && clips[i]) void c.animator.play(clips[i], { loop: true, blendIn: 0.01 }).catch(() => {});
      if (qp.has('anims') && clips[i]) c.holdProp(clips[i] === 'sweep' ? 'broom' : clips[i] === 'play_cards' ? 'cards' : clips[i] === 'exchange_details' ? 'notepad' : null);
      chars.push(c);
    });
    if (qp.has('anims')) report.vendorClips = clips;
  } else if (scene === 'weapons') {
    // firearms (weaponRig.ts): every weapon holstered, drawn, aimed (level, high, low), crouched,
    // in high cover and mid-recoil; &t= picks the moment (draws finish by 0.8 s; shots fire at 1.5 s)
    const S: { kind: WeaponKind; how: 'holster' | 'ready' | 'aim'; at?: [number, number, number]; crouch?: boolean; cover?: 'low' | 'high'; fire?: boolean }[] = [
      { kind: 'revolver', how: 'holster' }, { kind: 'revolver', how: 'ready' }, { kind: 'revolver', how: 'aim', at: [0, 1.5, 6] },
      { kind: 'pistol', how: 'aim', at: [1.5, 3.2, 5] }, { kind: 'snub', how: 'aim', at: [0, 0.3, 4], crouch: true },
      { kind: 'shotgun', how: 'holster' }, { kind: 'shotgun', how: 'ready' }, { kind: 'shotgun', how: 'aim', at: [0, 1.4, 8], fire: true },
      { kind: 'sawnoff', how: 'aim', at: [-1, 1.2, 5] }, { kind: 'pistol', how: 'aim', at: [2, 1.5, 6], cover: 'high' },
    ];
    const only = qp.get('w')?.split(',').map(Number);
    S.forEach((w, i) => {
      if (only && !only.includes(i)) return;
      const c = factory.spawn(world, { seed: 1, hero: qp.get('hero') ?? 'char.teddy_arce' });
      c.setWeapon(w.kind);
      if (w.how !== 'holster') void c.draw();
      if (w.cover) c.setCover({ height: w.cover, side: 'l' });
      weaponTest.set(c, w);
      chars.push(c);
    });
  } else if (scene === 'leads') {
    const act = num('act', 1);
    // review shots: each lead in their own idle (relaxed weight shift, hands behind, hands in pockets)
    const idles: Record<string, string> = { 'char.teddy_arce': 'idle_relaxed', 'char.delphine_moore': 'idle_relaxed', 'char.nick_varelas': 'idle_pockets' };
    for (const hero of ['char.teddy_arce', 'char.delphine_moore', 'char.nick_varelas']) { const c = factory.spawn(world, { seed: 1, hero, act }); c.animator.setIdle(idles[hero]); chars.push(c); }
  } else {
    const page = num('page', 0), per = num('n', 10), seed0 = num('seed', 1974);
    // what players see on Medium and above: close pedestrians wear matched Rocketbox heads (rb=0: ours)
    const used = new Set<string>();
    for (let i = 0; i < per; i++) {
      const seed = hash2(seed0, page * per + i);
      const a = generateAppearance(seed), heads = num('rb', 1) && factory.heads;
      const id = heads ? heads.pick(a, used) : null;
      if (heads && id) { used.add(id); const asset = await heads.load(id); chars.push(factory.spawn(world, { seed, overrides: { rbHead: asset, headTint: tintFor(asset, a.skin.tone) } })); }
      else chars.push(factory.spawn(world, { seed }));
    }
  }
  const n = chars.length;
  const gap = scene === 'leads' ? 1.1 : scene === 'shoes' ? 0.5 : 0.85;
  if (scene === 'hair') {
    const per = num('cols', n), rowsN = Math.ceil(n / per);
    chars.forEach((c, i) => { const col = i % per, row = Math.floor(i / per); c.object.position.set((col - (per - 1) / 2) * 0.42, -row * 0.42 + (rowsN - 1) * 0.21, -row * 0.001); });
    if (zoom === 'head') chars.forEach((c, i) => { c.object.position.set(0, 0, 0); c.object.visible = i === num('focus', 0); });
  } else chars.forEach((c, i) => { c.object.position.set(zoom ? 0 : (i - (n - 1) / 2) * gap, 0, 0); c.object.visible = !zoom || i === num('focus', 0); });
  const yaw = THREE.MathUtils.degToRad(num('yaw', 0));
  const spin = qp.has('spin');
  if (zoom === 'hand') { camera.fov = 30; camera.updateProjectionMatrix(); camera.position.set(0.6, 0.95, 1.1); camera.lookAt(0.2, 0.8, 0); }
  else if (zoom === 'shoe') { camera.fov = 24; camera.updateProjectionMatrix(); camera.position.set(0.75, 0.22, 0.7); camera.lookAt(0.03, 0.06, 0.04); }
  else if (zoom === 'feet') { camera.fov = 30; camera.updateProjectionMatrix(); camera.position.set(0.5, 0.35, 1.3); camera.lookAt(0, 0.08, 0); }
  else if (zoom === 'head') { const hy = (chars[num('focus', 0)]?.appearance.stature ?? 1.7) - 0.13; camera.fov = 24; camera.position.set(0, hy + 0.06, 1.0); camera.lookAt(0, hy, 0); camera.updateProjectionMatrix(); }
  else if (zoom) { camera.position.set(0, num('cy', 1.5), 1.7); camera.lookAt(0, num('ty', 1.4), 0); }
  else if (scene === 'hair') { camera.fov = 22; camera.position.set(0, 1.56, 0.5 + n * 0.42); camera.lookAt(0, 1.52, 0); camera.updateProjectionMatrix(); }
  else if (scene === 'shoes') { const d = 0.6 + n * 0.32; camera.fov = 22; camera.position.set(0, 0.45, d); camera.lookAt(0, 0.1, 0); camera.updateProjectionMatrix(); }
  else { const w = n * gap; camera.fov = 26; camera.position.set(0, 1.2, Math.max(5.5, w * 1.12 + 1.5)); camera.lookAt(0, 0.92, 0); camera.updateProjectionMatrix(); }
  report.people = chars.map((c) => ({ seed: c.desc.seed, hero: c.desc.hero, sex: c.appearance.sex, age: c.appearance.age, hair: c.appearance.hair.style, facialHair: c.appearance.facialHair, top: c.outfit.top.kind, bottom: c.outfit.bottom.kind, outer: c.outfit.outer?.kind ?? null, shoes: c.outfit.shoes.kind, hat: c.outfit.hat?.kind ?? null, props: c.outfit.props, tris: c.stats.tris, draws: c.stats.draws, buildMs: +c.stats.buildMs.toFixed(1) }));
  let t = 0;
  return (dt: number) => {
    t += dt;
    for (const c of chars) {
      const w = weaponTest.get(c);
      if (w?.at && t > 0.7) { const cy = Math.cos(yaw), sy = Math.sin(yaw); c.setAim(new THREE.Vector3(c.object.position.x + w.at[0] * cy + w.at[2] * sy, w.at[1], c.object.position.z - w.at[0] * sy + w.at[2] * cy)); }
      if (w?.fire && t - dt < 1.5 && t >= 1.5) c.fire();
      c.setLocomotion({ velocity: [0, 0, 0], grounded: true, heading: yaw + (spin ? t * 0.6 : 0), mode: w?.crouch ? 'crouch' : 'walk' });
      c.update(dt);
    }
    report.updateMs = chars.map((c) => +c.lastUpdateMs.toFixed(3));
    if (qp.has('armprobe')) report.arm = chars.map((c) => { const o = c.object.position, r = (n: string) => c.jointWorld(n).sub(o).toArray().map((x) => +x.toFixed(3)); return { sh: r(`upperarm_${qp.get('armprobe')}`), el: r(`lowerarm_${qp.get('armprobe')}`), wr: r(`hand_${qp.get('armprobe')}`), head: r('Head') }; });
    if (weaponTest.size) report.weapons = chars.map((c) => ({ state: c.weaponState, ...c.weaponDebug() }));
    report.toneProbes = toneProbes(chars, camera);
  };
}

/**
 * Screen positions (0..1) of skin probes per visible character, for tools/characters/tone-check.py:
 * cheek (below the left eye), side of the neck (between jaw and neck base) and the back of the
 * right hand. Offsets are in the character's own frame.
 */
function toneProbes(chars: Character[], camera: THREE.PerspectiveCamera) {
  const v = new THREE.Vector3(), q = new THREE.Quaternion();
  const scr = (p: THREE.Vector3) => { const s = p.clone().project(camera); return [+(s.x * 0.5 + 0.5).toFixed(4), +(0.5 - s.y * 0.5).toFixed(4)]; };
  return chars.filter((c) => c.object.visible).map((c) => {
    c.object.getWorldQuaternion(q);
    const off = (p: THREE.Vector3, x: number, y: number, z: number) => p.clone().add(v.set(x, y, z).applyQuaternion(q));
    const eye = c.jointWorld('eye_l');
    const head = c.jointWorld('Head'), neck = c.jointWorld('neck_01');
    const mid = head.clone().lerp(neck, 0.55);
    const hand = c.jointWorld('hand_r').lerp(c.jointWorld('middle_01_r'), 0.6);
    return { hero: c.desc.hero ?? null, seed: c.desc.seed, rb: (c.desc.overrides?.rbHead as any)?.id ?? null, tone: c.appearance.skin.tone,
      cheek: scr(off(eye, 0.006, -0.03, 0.01)), neck: scr(off(mid, 0.03, 0, 0.035)), hand: scr(hand),
      // hands in pockets: nothing to measure (the probe would land on the garment)
      handHidden: /pockets/.test(c.animator.idleName) };
  });
}

// ------------------------------------------------------------------------------------------------
/** Course geometry: flat street, a 0.15 m curb, 6 stairs of 0.17 m, a 10% slope, a 1 m ledge. */
function courseGround(x: number, z: number): { y: number; surface: string } {
  if (z > -2 && z < 2 && x >= 2 && x < 6) return { y: 0.15, surface: 'concrete' }; // sidewalk past the curb at x=2
  if (z > -2 && z < 2 && x >= 8 && x < 8 + 6 * 0.3) return { y: Math.floor((x - 8) / 0.3 + 1) * 0.17, surface: 'stone' }; // stairs
  if (z > -2 && z < 2 && x >= 8 + 1.8 && x < 13) return { y: 1.02, surface: 'stone' };
  if (z >= 4 && z < 8) return { y: Math.max(0, (x - 2) * 0.1), surface: 'asphalt' }; // slope lane
  if (z <= -4 && z > -6 && x >= 4 && x < 5) return { y: 1.0, surface: 'brick' }; // ledge block
  return { y: 0, surface: 'asphalt' };
}
function courseMeshes(world: THREE.Scene) {
  floor(world, 80, 0x3a3634);
  const mat = new THREE.MeshStandardNodeMaterial({ color: 0x8a8278, roughness: 0.85 });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m = mat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); world.add(b); };
  box(4, 0.15, 4, 4, 0.075, 0); // sidewalk + curb
  for (let i = 0; i < 6; i++) box(0.3, (i + 1) * 0.17, 4, 8 + i * 0.3 + 0.15, ((i + 1) * 0.17) / 2, 0);
  box(3.2, 1.02, 4, 8 + 1.8 + 1.6, 0.51, 0);
  const slope = new THREE.Mesh(new THREE.PlaneGeometry(30, 4), new THREE.MeshStandardNodeMaterial({ color: 0x4a4440, roughness: 0.9 }));
  slope.rotation.x = -Math.PI / 2; slope.rotation.order = 'YXZ';
  const ang = Math.atan(0.1);
  slope.geometry.rotateX(-Math.PI / 2); slope.rotation.set(0, 0, ang); slope.position.set(2 + 15 * Math.cos(ang), 15 * Math.sin(ang), 6); world.add(slope);
  box(1, 1, 2, 4.5, 0.5, -5, new THREE.MeshStandardNodeMaterial({ color: 0x7a3b2c, roughness: 0.9 }));
}

function course(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any, slideOnly: boolean) {
  courseMeshes(world);
  factory.setGround(courseGround);
  const shot = qp.get('shot') ?? 'curb';
  const ch = factory.spawn(world, { seed: num('seed', 12345) });
  const footsteps: any[] = [];
  ch.on('footstep', (e) => footsteps.push({ foot: e.foot, surface: e.surface, x: +e.position.x.toFixed(2), y: +e.position.y.toFixed(3) }));
  report.footsteps = footsteps;
  // scripted paths per shot: position along x at a speed profile
  let x = 0, z = 0, heading = Math.PI / 2, t = 0;
  const speedAt = (tt: number): number => {
    switch (shot) {
      case 'walkrun': return tt < 1.5 ? 1.3 : Math.min(5.5, 1.3 + (tt - 1.5) * 2.2);
      case 'turn': return 0;
      case 'hail': return 0;
      case 'ledge': return 0;
      default: return 1.3;
    }
  };
  if (shot === 'curb') x = -1.5;
  if (shot === 'stairs') x = 5.2;
  if (shot === 'slope') { x = 3; z = 6; }
  if (shot === 'walkrun') x = -14;
  if (shot === 'ledge') { x = 4.5; z = -3.6; heading = Math.PI; }
  if (shot === 'hail') void ch.play('hail_cab');
  if (shot === 'ledge') void ch.play('climb_ledge');
  // camera framing per shot
  const frame = () => {
    if (shot === 'walkrun') { camera.position.set(x - 1, 1.4, 7); camera.lookAt(x, 0.9, 0); }
    else if (shot === 'turn' || shot === 'hail') { camera.position.set(2.2, 1.5, 3.2); camera.lookAt(0, 1.0, 0); }
    else if (shot === 'ledge') { camera.position.set(8, 1.8, -1); camera.lookAt(4.5, 0.9, -4.5); }
    else { camera.fov = 38; camera.updateProjectionMatrix(); camera.position.set(x + 0.3, 0.75, z + 3.6); camera.lookAt(x, 0.5, z); }
  };
  // foot sliding: world drift of each foot while its contact is planted
  const slide = { l: { last: null as THREE.Vector3 | null, drift: 0, time: 0 }, r: { last: null as THREE.Vector3 | null, drift: 0, time: 0 } };
  const speeds = [0.8, 1.3, 1.75];
  let speedIdx = 0, slideT = 0;
  const slideReport: any[] = [];
  if (slideOnly) { x = -20; }
  return (dt: number) => {
    t += dt;
    let v = speedAt(t);
    if (slideOnly) {
      v = speeds[speedIdx]; slideT += dt;
      if (slideT > 6) {
        slideReport.push({ speed: v, driftMmPerPlantedSecond: { l: +((slide.l.drift / Math.max(1e-3, slide.l.time)) * 1000).toFixed(1), r: +((slide.r.drift / Math.max(1e-3, slide.r.time)) * 1000).toFixed(1) } });
        report.footSliding = slideReport;
        slide.l = { last: null, drift: 0, time: 0 }; slide.r = { last: null, drift: 0, time: 0 };
        speedIdx = Math.min(speeds.length - 1, speedIdx + 1); slideT = 0;
      }
    }
    if (shot === 'turn') heading += dt * 1.6;
    x += Math.sin(heading) * v * dt; z += Math.cos(heading) * v * dt;
    const g = courseGround(x, z);
    ch.object.position.set(x, g.y, z);
    ch.setLocomotion({ velocity: [Math.sin(heading) * v, 0, Math.cos(heading) * v], grounded: true, heading, mode: v > 4 ? 'sprint' : v > 2 ? 'run' : 'walk' });
    ch.update(dt);
    if (slideOnly && slideT > 1.5) {
      for (const side of ['l', 'r'] as const) {
        const p = ch.jointWorld(`ball_${side}`);
        const s = slide[side];
        if (ch.animator.planted[side]) { if (s.last) { s.drift += Math.hypot(p.x - s.last.x, p.z - s.last.z); s.time += dt; } s.last = p.clone(); } else s.last = null;
      }
    }
    frame();
    report.updateMs = +ch.lastUpdateMs.toFixed(3);
    report.pos = [+x.toFixed(2), +z.toFixed(2)];
  };
}

// ------------------------------------------------------------------------------------------------
/** Crowd stress test: replays a synthetic "recorded" sim walk (the sim isn't merged yet). */
function crowd(world: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any) {
  floor(world, 400, 0x3c3836);
  const n = num('n', 400);
  const cr = factory.createCrowdRenderer(n);
  world.add(cr.object);
  (cr as any).setCamera(camera);
  // sidewalks: 6 parallel 4 m-wide strips along Z, agents walk both ways; some stand (talk, smoke, wait, hail)
  const agents: AgentView[] = [];
  const states = ['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'talk', 'wait', 'smoke', 'read', 'hail', 'lean', 'sit'];
  for (let i = 0; i < n; i++) {
    const h = (k: number) => (hash2(i, k) % 100000) / 100000;
    const lane = Math.floor(h(1) * 6);
    const state = states[Math.floor(h(2) * states.length)];
    const moving = state === 'walk';
    const dir = h(3) < 0.5 ? 1 : -1;
    const archetype = h(4) < 0.06 ? 'beat_cop' : h(4) < 0.16 ? 'worker_handcart' : h(4) < 0.2 ? 'vendor' : h(4) < 0.6 ? 'commuter' : 'shopper';
    agents.push({ id: i + 1, archetype, variant: hash2(i, 99), x: (lane - 2.5) * 9 + (h(5) - 0.5) * 3, y: 0, z: (h(6) - 0.5) * 220, yaw: dir > 0 ? 0 : Math.PI, speed: moving ? 0.8 + h(7) * 1.1 : 0, state });
  }
  if (qp.has('vendors')) {
    // &vendors=1: a stall cluster in front of the camera (near ring + baked mid ring): a monte dealer
    // with a crowd leaning in, a cart vendor with a queue, a vendor ducking, eaters walking past
    const put = (i: number, archetype: string, x: number, z: number, yaw: number, state: string, speed = 0, carry = '') => Object.assign(agents[i], { archetype, x, z, yaw, state, speed, carry, y: 0 });
    let i = 0;
    for (const zc of [12, -6]) { // one cluster near (in the full-character ring), one at mid range (baked clips)
      put(i++, 'npc.monte_dealer', -2, zc, 0, 'vendor');
      for (let k = 0; k < 4; k++) put(i++, 'commuter', -2 + Math.cos(k * 1.3 + 0.4) * 0.9, zc + 0.9 + Math.sin(k * 1.3 + 0.4) * 0.5, Math.PI, 'watch');
      put(i++, 'npc.cart_vendor', 3, zc, Math.PI / 2, 'vendor');
      for (let k = 0; k < 3; k++) put(i++, 'shopper', 4.2 + k * 0.75, zc + 0.2, -Math.PI / 2, 'queue');
      put(i++, 'npc.grocer', 6.5, zc - 2, 0, 'cower');
      put(i++, 'commuter', 0.5, zc + 3, 0, 'walk', 1.1, 'frank');
      put(i++, 'shopper', 1.5, zc + 4, Math.PI, 'walk', 1.0, 'coffee');
      put(i++, 'commuter', -5, zc + 2, 0.5, 'down'); put(i++, 'shopper', -6.5, zc + 1, -0.5, 'getUp'); put(i++, 'commuter', -4, zc - 1.5, 0, 'angry');
    }
    report.vendorAgents = i;
  }
  camera.fov = 40; camera.updateProjectionMatrix();
  camera.position.set(num('cx', 3), num('cy', 3.2), num('cz', 24)); camera.lookAt(0, 1.2, -10);
  const cpu: number[] = [];
  let frames = 0;
  // near-ring characters are built in a worker: let them arrive before a static capture
  report.waitFor = async (tick: (dt: number) => void) => {
    cpu.length = 0; frames = 0;
    for (let i = 0; i < 150; i++) tick(1 / 60);
    const measured = { ...report.crowd };
    for (let i = 0; i < 300; i++) {
      tick(1 / 60);
      await new Promise((r) => setTimeout(r, 50));
      if (i > 20 && (cr as any).pendingBuilds === 0 && (cr as any).stats.near > 0) break;
    }
    report.crowd = { ...measured, nearAtCapture: (cr as any).stats.near, nearBuilds: (cr as any).stats.nearBuilds };
  };
  return (dt: number) => {
    for (const a of agents) {
      if (a.speed > 0) { a.z += Math.cos(a.yaw) * a.speed * dt; if (a.z > 110) a.z -= 220; if (a.z < -110) a.z += 220; }
    }
    const t0 = performance.now();
    cr.setAgents(agents);
    cpu.push(performance.now() - t0);
    frames++;
    const s = (cr as any).stats;
    if (frames > 30) {
      const w = cpu.slice(30).sort((a, b) => a - b);
      report.crowd = { agents: n, ...s, cpuAvgMs: +(w.reduce((a, b) => a + b, 0) / w.length).toFixed(3), cpuP95Ms: +w[Math.floor(w.length * 0.95)].toFixed(3), framesMeasured: w.length };
    }
  };
}
