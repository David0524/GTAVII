/**
 * ?characters=1&scene=street — the crowd on a real street of the engine's city (read-only use of the
 * world, terrain and atmosphere modules; nothing in them is changed). Agents walk both sidewalks of
 * the street nearest the spawn, standing actions mixed in, until the sim's AgentView feed is merged.
 *   n=400 (agents)  along=110 (half-length, m)  time=13:30  quality=high|low
 */
import * as THREE from 'three/webgpu';
import { World } from '../../world/World';
import { Atmosphere } from '../../world/Atmosphere';
import { loadTerrain, heightAt } from '../../shared/terrain';
import { SIDEWALK_H } from '../../world/meshBuilder';
import { qualityFromUrl } from '../../engine/quality';
import { setTime } from '../../world/Clock';
import type { CharacterFactory } from '../index';
import type { AgentView } from '../crowd/CrowdRenderer';
import { hash2 } from '../util/rng';

interface StreetRec { n: string; c: string; w: number; o: number; p: number[] }

export async function street(scene: THREE.Scene, camera: THREE.PerspectiveCamera, factory: CharacterFactory, report: any, qp: URLSearchParams) {
  const num = (k: string, d: number) => (qp.has(k) ? Number(qp.get(k)) : d);
  const quality = qualityFromUrl();
  const base = import.meta.env.BASE_URL + 'data/';
  await loadTerrain();
  const world = new World(quality);
  await world.load();
  scene.add(world.root);
  setTime(qp.get('time') ?? '13:30');
  const atmosphere = new Atmosphere(scene);
  atmosphere.envEnabled = false;
  const streets = (await fetch(base + 'streets.json').then((r) => r.json())) as StreetRec[];
  // the longest straight-ish named street segment near the spawn
  const sp = world.manifest.spawn;
  let best: { a: [number, number]; b: [number, number]; w: number; d: number; name: string } | null = null;
  for (const s of streets) {
    if (!s.n || !/primary|secondary|tertiary|residential/.test(s.c)) continue;
    for (let i = 0; i + 3 < s.p.length; i += 2) {
      const a: [number, number] = [s.p[i], s.p[i + 1]], b: [number, number] = [s.p[i + 2], s.p[i + 3]];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 60) continue;
      const t = Math.max(0, Math.min(1, ((sp.x - a[0]) * (b[0] - a[0]) + (sp.z - a[1]) * (b[1] - a[1])) / (L * L)));
      const d = Math.hypot(sp.x - (a[0] + (b[0] - a[0]) * t), sp.z - (a[1] + (b[1] - a[1]) * t)) - L * 0.05;
      if (!best || d < best.d) best = { a, b, w: s.w, d, name: s.n };
    }
  }
  if (!best) throw new Error('street scene: no street near the spawn');
  const L = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
  const dir = [(best.b[0] - best.a[0]) / L, (best.b[1] - best.a[1]) / L], lat = [dir[1], -dir[0]];
  const mid = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
  const half = Math.min(num('along', 110), L / 2 - 2);
  const swOff = best.w / 2 + 2.4; // sidewalk centre line
  const ground = (x: number, z: number) => ({ y: heightAt(x, z) + SIDEWALK_H, surface: 'concrete' });
  factory.setGround(ground);
  report.street = { name: best.name, width: best.w, length: +L.toFixed(1), usedHalfLength: +half.toFixed(1) };

  const n = num('n', 400);
  const cr = factory.createCrowdRenderer(n);
  scene.add(cr.object);
  (cr as any).setCamera(camera);
  const states = ['walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'walk', 'talk', 'wait', 'smoke', 'read', 'hail', 'lean'];
  const agents: (AgentView & { s: number; side: number; lane: number; dirSign: number })[] = [];
  for (let i = 0; i < n; i++) {
    const h = (k: number) => (hash2(i, k) % 100000) / 100000;
    const side = h(1) < 0.5 ? -1 : 1;
    const state = states[Math.floor(h(2) * states.length)];
    const dirSign = h(3) < 0.5 ? 1 : -1;
    const lane = (h(5) - 0.5) * 2.6 + (state === 'lean' || state === 'wait' ? side * 1.4 : 0);
    const archetype = h(4) < 0.05 ? 'beat_cop' : h(4) < 0.12 ? 'worker_handcart' : h(4) < 0.16 ? 'vendor' : h(4) < 0.6 ? 'commuter' : 'shopper';
    const a = { id: i + 1, archetype, variant: hash2(i, 99), x: 0, y: 0, z: 0, yaw: 0, speed: state === 'walk' ? 0.8 + h(7) * 1.0 : 0, state, s: (h(6) - 0.5) * 2 * half, side, lane, dirSign };
    agents.push(a);
  }
  const place = (a: (typeof agents)[number]) => {
    const o = a.side * swOff + a.lane;
    a.x = mid[0] + dir[0] * a.s + lat[0] * o; a.z = mid[1] + dir[1] * a.s + lat[1] * o;
    a.y = ground(a.x, a.z).y;
    const yawAlong = Math.atan2(dir[0] * a.dirSign, dir[1] * a.dirSign);
    a.yaw = a.speed > 0 ? yawAlong : yawAlong + (a.state === 'lean' ? Math.PI / 2 * a.side : 0);
  };
  agents.forEach(place);
  // camera on the sidewalk, eye height, looking down the street
  const cs = num('cs', -half * 0.55), co = swOff * num('cside', 1) - 1.0;
  const cx = mid[0] + dir[0] * cs + lat[0] * co, cz = mid[1] + dir[1] * cs + lat[1] * co;
  camera.fov = num('fov', 50); camera.near = 0.15; camera.far = 3000; camera.updateProjectionMatrix();
  camera.position.set(cx, ground(cx, cz).y + num('cy', 1.65), cz);
  const tx = cx + dir[0] * 40 - lat[0] * swOff * 0.6, tz = cz + dir[1] * 40 - lat[1] * swOff * 0.6;
  camera.lookAt(tx, ground(tx, tz).y + 1.3, tz);

  const cpu: number[] = [];
  let frames = 0;
  report.waitFor = async (tick: (dt: number) => void) => {
    // stream the city around the camera, then let the near ring build
    for (let i = 0; i < 600 && !(world.idle && i > 10); i++) { world.update(camera.position); await new Promise((r) => setTimeout(r, 50)); }
    cpu.length = 0; frames = 0;
    for (let i = 0; i < 150; i++) tick(1 / 60);
    const measured = { ...report.crowd };
    for (let i = 0; i < 300; i++) {
      tick(1 / 60);
      await new Promise((r) => setTimeout(r, 50));
      if (i > 20 && (cr as any).pendingBuilds === 0 && (cr as any).stats.near > 0) break;
    }
    report.crowd = { ...measured, nearAtCapture: (cr as any).stats.near };
  };
  return (dt: number) => {
    world.update(camera.position);
    const light = atmosphere.update();
    void light;
    atmosphere.followFocus(camera.position.x, camera.position.y, camera.position.z);
    for (const a of agents) {
      if (a.speed > 0) { a.s += a.speed * a.dirSign * dt; if (a.s > half) a.s -= 2 * half; if (a.s < -half) a.s += 2 * half; }
      place(a);
    }
    const t0 = performance.now();
    cr.setAgents(agents);
    cpu.push(performance.now() - t0);
    frames++;
    if (frames > 30) {
      const w = cpu.slice(30).sort((x, y) => x - y);
      report.crowd = { agents: n, ...(cr as any).stats, cpuAvgMs: +(w.reduce((x, y) => x + y, 0) / w.length).toFixed(3), cpuP95Ms: +w[Math.floor(w.length * 0.95)].toFixed(3), framesMeasured: w.length };
    }
  };
}
