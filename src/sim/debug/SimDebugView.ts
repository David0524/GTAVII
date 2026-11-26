/**
 * Debug view for the ambient sim, behind ?sim=1. Generic placeholder bodies only:
 * instanced boxes for vehicles, capsules for pedestrians, lane/sidewalk lines and
 * signal heads at the stop lines. Rendering stays out of the sim itself.
 *
 *   ?sim=1            run the sim around the camera
 *   ?simlanes=0       hide lane / walk-graph lines
 *   ?simseed=N        RNG seed
 *   ?simclock=HH:MM   time of day for density (default 18:30)
 *   ?simweather=rain  clear | overcast | rain
 */
import * as THREE from 'three/webgpu';
import { Simulation, type ArchetypeDef } from '../index';
import { qualityFromUrl } from '../../engine/quality';
import { LinkKind, WalkKind } from '../laneFormat';
import { heightAt } from '../../shared/terrain';

const CLASS_COLOR: Record<string, number> = { taxi: 0xe2b318, police: 0x22324f, bus: 0x3f7a55, box_truck: 0x7a5a3a, step_van: 0x9a8f7a, garbage: 0x4f5a3a };
const CLASS_H: Record<string, number> = { sedan: 1.4, hardtop: 1.35, compact: 1.35, wagon: 1.45, taxi: 1.5, police: 1.5, bus: 3.1, box_truck: 3.0, step_van: 2.7, garbage: 3.2 };
const DIMS: Record<string, [number, number]> = { sedan: [5.4, 2.0], hardtop: [5.3, 2.0], compact: [4.6, 1.8], wagon: [5.6, 2.0], taxi: [5.3, 2.0], police: [5.4, 2.0], bus: [12, 2.6], box_truck: [8, 2.5], step_van: [6.5, 2.3], garbage: [9, 2.5] };
const CAR_TINTS = [0x5b6770, 0x7d3b2f, 0x2f4b6b, 0x8a8170, 0x3e5a3a, 0x9a9a92, 0x4a3b5c, 0x6b5a2e];
const ORANGE = new THREE.Color(0xff7a1a), RED = new THREE.Color(0xff2a2a);
const SIG_COLOR = { green: 0x2fe07a, yellow: 0xffc21a, red: 0xff3b30 };

/** Narrative content archetypes, if the content/ folder exists (Vite glob; empty otherwise). */
function contentArchetypes(): ArchetypeDef[] {
  const mods = import.meta.glob('/content/npc_archetypes/*.json', { eager: true, import: 'default' }) as Record<string, ArchetypeDef>;
  return Object.values(mods);
}

export function attachSimDebug(scene: THREE.Scene, camera: THREE.Camera) {
  const params = new URLSearchParams(location.search);
  const low = qualityFromUrl().name === 'low';
  const sim = new Simulation({
    seed: +(params.get('simseed') ?? 1974), maxVehicles: low ? 40 : 150, maxPeds: low ? 120 : 400,
    baseUrl: import.meta.env.BASE_URL + 'data/', archetypes: contentArchetypes(),
  });
  const clock = params.get('simclock');
  if (clock) { const [h, m] = clock.split(':').map(Number); sim.setClock(h * 60 + (m || 0)); }
  const w = params.get('simweather'); if (w === 'rain' || w === 'overcast' || w === 'clear') sim.setWeather(w);
  const root = new THREE.Group(); root.name = 'sim-debug'; scene.add(root);
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;right:8px;top:8px;z-index:20;font:11px/1.35 ui-monospace,monospace;color:#e8e2d0;background:rgba(10,10,12,.72);padding:6px 8px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(hud);
  const state = { ready: false, sim, ms: [] as number[], events: {} as Record<string, number> };
  (window as unknown as { __T74SIM: typeof state }).__T74SIM = state;
  for (const t of ['honk', 'hail', 'jaywalk', 'doubleParked', 'busStop', 'pickup', 'collision', 'nearMiss']) sim.on(t, () => { state.events[t] = (state.events[t] ?? 0) + 1; });

  sim.load().then(() => {
    const g = sim.graph, net = sim.network;
    // ---- static lines
    if (params.get('simlanes') !== '0') {
      const pos: number[] = [], col: number[] = [];
      const add = (pts: Float32Array, y: number, c: THREE.Color) => {
        for (let k = 2; k < pts.length; k += 2) { pos.push(pts[k - 2], heightAt(pts[k - 2], pts[k - 1]) + y, pts[k - 1], pts[k], heightAt(pts[k], pts[k + 1]) + y, pts[k + 1]); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      };
      const cLane = new THREE.Color(0x7aa7d9), cConn = new THREE.Color(0x3a5f86), cWalk = new THREE.Color(0x8c8270), cX = new THREE.Color(0xf0f0f0);
      g.links.forEach((l) => add(l.pts, 0.04, l.kind === LinkKind.Lane ? cLane : cConn));
      g.walkEdges.forEach((e) => add(e.pts, e.kind === WalkKind.Crosswalk ? 0.05 : 0.19, e.kind === WalkKind.Crosswalk ? cX : cWalk));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 }));
      lines.frustumCulled = false; root.add(lines);
    }
    void net;
    // ---- instanced bodies
    const maxV = 200, maxP = 450;
    const vMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), maxV);
    const pMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 1.15, 3, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), maxP);
    const sigs = sim.signalStates();
    const sMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }), sigs.length);
    for (const m of [vMesh, pMesh, sMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(m); }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    sigs.forEach((s, i) => { M.makeTranslation(s.x, heightAt(s.x, s.z) + 2.6, s.z); sMesh.setMatrixAt(i, M); sMesh.setColorAt(i, C.set(0xffffff)); });
    // instance colours must exist before the first render so the material compiles with them
    for (let i = 0; i < maxV; i++) vMesh.setColorAt(i, C.set(0xffffff));
    for (let i = 0; i < maxP; i++) pMesh.setColorAt(i, C.set(0xffffff));
    vMesh.count = 0; pMesh.count = 0;
    const palettes = new Map<string, number[]>();
    for (const a of sim.archetypes) palettes.set(a.id, (a.palette ?? []).map((h) => new THREE.Color(h).getHex()));
    state.ready = true;

    let last = performance.now(), hudT = 0;
    const loop = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      sim.update(dt, { x: camera.position.x, z: camera.position.z });
      state.ms.push(sim.lastUpdateMs); if (state.ms.length > 600) state.ms.shift();
      const vs = sim.vehicles;
      vMesh.count = Math.min(maxV, vs.length);
      for (let i = 0; i < vMesh.count; i++) {
        const v = vs[i], [len, wid] = DIMS[v.vclass], h = CLASS_H[v.vclass];
        Q.setFromAxisAngle(up, v.yaw); P.set(v.x, v.y + h / 2 + 0.05, v.z); S.set(wid, h, len);
        M.compose(P, Q, S); vMesh.setMatrixAt(i, M);
        C.set(CLASS_COLOR[v.vclass] ?? CAR_TINTS[v.variant % CAR_TINTS.length]);
        if (v.lights & 16 && Math.floor(now / 400) % 2) C.lerp(ORANGE, 0.6); // hazards blink
        else if (v.lights & 2) C.lerp(RED, 0.25); // brake
        vMesh.setColorAt(i, C);
      }
      const ps = sim.peds;
      pMesh.count = Math.min(maxP, ps.length);
      S.set(1, 1, 1);
      for (let i = 0; i < pMesh.count; i++) {
        const p = ps[i];
        const cower = p.state === 'cower';
        Q.setFromAxisAngle(up, p.yaw); P.set(p.x, p.y + (cower ? 0.35 : 0.67), p.z); S.set(1, cower ? 0.55 : 1, 1);
        M.compose(P, Q, S); pMesh.setMatrixAt(i, M);
        const pal = palettes.get(p.archetype) ?? [];
        C.set(pal.length ? pal[p.variant % pal.length] : 0xb0a89a);
        if (p.state === 'jaywalking') C.set(0xff4fa3); else if (p.state === 'flee') C.set(0xff2020);
        pMesh.setColorAt(i, C);
      }
      sim.signalStates(sigs).forEach((s, i) => sMesh.setColorAt(i, C.set(SIG_COLOR[s.state])));
      for (const m of [vMesh, pMesh, sMesh]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
      if ((hudT -= dt) <= 0) {
        hudT = 0.25;
        const ms = [...state.ms].sort((a, b) => a - b);
        const avg = ms.reduce((a, b) => a + b, 0) / Math.max(1, ms.length);
        const st = sim.stats;
        hud.textContent = `SIM  vehicles ${vs.length}  peds ${ps.length}\n` +
          `update ${avg.toFixed(2)} ms avg  ${(ms[Math.floor(ms.length * 0.95)] ?? 0).toFixed(2)} p95\n` +
          `honks ${st.honks}  hails ${st.hails}  jaywalks ${st.jaywalks}\n` +
          `double-parked ${st.doubleParks}  bus stops ${st.busStops}  fares ${st.boardings}`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }).catch((e) => { hud.textContent = `sim failed: ${(e as Error).message}`; console.error(e); });
  return sim;
}
