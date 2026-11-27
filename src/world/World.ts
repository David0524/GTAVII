import * as THREE from 'three/webgpu';
import type { ChunkRequest, ChunkResponse } from './chunkWorker';
import type { ChunkMeshes, MeshArrays } from './meshBuilder';
import type { QualitySettings } from '../engine/quality';
import { heightAt, terrainLoaded } from '../shared/terrain';
import { createFacadeMaterial } from '../render/FacadeMaterial';
import { createGroundMaterial } from '../render/GroundMaterial';
import { loadReport } from '../engine/debug/LoadReport';
import { streetLightUniforms } from './StreetLights';
import { facadeUniforms } from '../render/FacadeMaterial';
import { uv, vec2, vec3, float, length, sub, smoothstep, fract, floor, vertexColor } from 'three/tsl';

export interface WorldManifest {
  region: { minX: number; maxX: number; minZ: number; maxZ: number };
  chunkSize: number;
  gridRotationDeg: number;
  chunks: { i: number; j: number; key: string; bytes: number; buildings: number; maxHeight: number }[];
  spawn: { x: number; z: number; heading: number };
  /** name/short are display names from content/landmarks.json (never raw OSM names); id is the stable key. */
  heroes: { id: string; name: string; short: string; ids: number[]; x: number; z: number; height: number }[];
  attribution: string;
  stats: Record<string, number>;
}

type ChunkState = {
  key: string; cx: number; cz: number; info: WorldManifest['chunks'][number];
  status: 'idle' | 'loading' | 'ready';
  group?: THREE.Group; lod0?: THREE.Group; lod1?: THREE.Mesh; props?: THREE.Mesh; detail?: THREE.Mesh[];
  lod: -1 | 0 | 1;
};

function toGeometry(m: MeshArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  if (m.uv) g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  if (m.facade) g.setAttribute('facade', new THREE.BufferAttribute(m.facade, 4));
  if (m.wallAO) g.setAttribute('wallAO', new THREE.BufferAttribute(m.wallAO, 2));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Chunk streaming: a worker pool fetches + parses + meshes chunks; the main thread only
 * uploads buffers. Each chunk has LOD0 (buildings + ground) and LOD1 (tall shells only).
 * Visibility is chosen by XZ distance from the camera; frustum culling is per chunk mesh.
 */
export class World {
  readonly root = new THREE.Group();
  /** Chunk lifecycle hooks (physics colliders, later: props, audio emitters). */
  readonly onChunkReady = new Set<(c: { key: string; ox: number; oz: number; parts: THREE.BufferGeometry[] }) => void>();
  readonly onChunkUnload = new Set<(key: string) => void>();
  manifest!: WorldManifest;
  private chunks = new Map<string, ChunkState>();
  private workers: Worker[] = [];
  private busy: number[] = []; // jobs in flight per worker
  private static readonly IN_FLIGHT = 3;
  private queue: string[] = [];
  private pendingCount = 0;
  readonly buildingMat = createFacadeMaterial();
  readonly groundMat = createGroundMaterial();
  readonly propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  /** Storefront spill on the sidewalk: additive, warm, radial falloff from the door; on with the street lights. */
  readonly spillMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const d = length(sub(uv(), vec2(0.5, 0.0)).mul(vec2(1.0, 0.85)));
    m.colorNode = vertexColor().mul(float(1).sub(smoothstep(0.0, 0.9, d)).pow(1.6)).mul(streetLightUniforms.lightsOn).mul(0.55);
    return m;
  })();
  /** Marquee bulb bands: rows of round bulbs on a dark band, a slow chase; faint by day, bright at night. */
  readonly marqueeMat = (() => {
    const m = new THREE.MeshBasicNodeMaterial();
    const g = uv().mul(vec2(36, 5));
    const cell = fract(g).sub(0.5), bulb = float(1).sub(smoothstep(0.18, 0.3, length(cell)));
    const chase = smoothstep(0.55, 1.0, fract(floor(g.x).mul(0.25).sub(facadeUniforms.time.mul(1.2))));
    const on = streetLightUniforms.lightsOn.mul(0.85).add(0.15);
    m.colorNode = vec3(0.06, 0.05, 0.04).add(vertexColor().mul(bulb).mul(on).mul(float(1.4).add(chase.mul(1.2))));
    return m;
  })();
  /** Debug/bench: mesh names to hide in every chunk ('buildings' | 'ground' | 'props' | 'lod1'). */
  readonly debugHide = new Set<string>();
  stats = { ready: 0, lod0: 0, lod1: 0, loading: 0, parseMsTotal: 0, failed: 0 };

  constructor(private quality: QualitySettings, private base = import.meta.env.BASE_URL + 'data/') {
    this.root.name = 'world';
  }

  async load() {
    const r = await fetch(this.base + 'world.json');
    this.manifest = await r.json();
    const S = this.manifest.chunkSize;
    for (const c of this.manifest.chunks) {
      this.chunks.set(c.key, { key: c.key, cx: (c.i + 0.5) * S, cz: (c.j + 0.5) * S, info: c, status: 'idle', lod: -1 });
    }
    const n = Math.max(1, Math.min(this.quality.maxWorkers, (navigator.hardwareConcurrency || 4) - 1));
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL('./chunkWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<ChunkResponse>) => this.onWorker(k, ev.data);
      this.workers.push(w); this.busy.push(0);
    }
    this.root.add(this.buildTerrainBase());
  }

  /**
   * Terrain base: a coarse heightfield under the whole city and 3 km beyond (heights clamp at the
   * data edge), a little below road level. Hides any gap at the modelled-region edge and reads as
   * distant ground; a huge flat plane catches the rest of the horizon.
   */
  private buildTerrainBase(): THREE.Object3D {
    const g = new THREE.Group(); g.name = 'terrainBase';
    const R = this.manifest.region, pad = 3000, step = terrainLoaded() ? 40 : 1000;
    const x0 = R.minX - pad, z0 = R.minZ - pad, nx = Math.ceil((R.maxX - R.minX + 2 * pad) / step), nz = Math.ceil((R.maxZ - R.minZ + 2 * pad) / step);
    const geo = new THREE.PlaneGeometry(nx * step, nz * step, nx, nz).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k) + x0 + (nx * step) / 2, z = pos.getZ(k) + z0 + (nz * step) / 2;
      pos.setXYZ(k, x, heightAt(x, z) - 0.35, z);
    }
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1 });
    g.add(new THREE.Mesh(geo, mat));
    const far = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), mat);
    far.position.y = -12; far.name = 'farGround';
    g.add(far);
    return g;
  }

  /** Called every frame (cheap): decide desired LOD per chunk, enqueue loads, swap visibility. */
  update(camPos: THREE.Vector3) {
    const { lod0Radius, lod1Radius } = this.quality;
    const S = this.manifest.chunkSize;
    const want: { key: string; d: number }[] = [];
    let lod0 = 0, lod1 = 0;
    for (const c of this.chunks.values()) {
      const dx = Math.max(Math.abs(camPos.x - c.cx) - S / 2, 0);
      const dz = Math.max(Math.abs(camPos.z - c.cz) - S / 2, 0);
      const d = Math.hypot(dx, dz);
      const target: -1 | 0 | 1 = d <= lod0Radius ? 0 : d <= lod1Radius ? 1 : -1;
      if (target !== -1 && c.status === 'idle') want.push({ key: c.key, d });
      if (c.status === 'ready') {
        if (target === -1 && d > lod1Radius * 1.25) { this.unload(c); continue; }
        this.setLod(c, target);
        if (c.props) c.props.visible = d <= this.quality.propsRadius;
        if (c.detail) for (let q = 0; q < 4; q++) { // quadrant boxes: 100 m, centred +-50 m from the chunk centre
          const qx = c.cx + (q & 1 ? 50 : -50), qz = c.cz + (q & 2 ? 50 : -50);
          const qd = Math.hypot(Math.max(Math.abs(camPos.x - qx) - 50, 0), Math.max(Math.abs(camPos.z - qz) - 50, 0));
          c.detail[q].visible = qd <= this.quality.detailRadius && !this.debugHide.has('props');
        }
        if (this.debugHide.size && c.group) c.group.traverse((o) => { if (this.debugHide.has(o.name)) o.visible = false; else if (o.name === 'buildings' || o.name === 'ground') o.visible = true; });
        if (this.debugHide.has('lod1') && c.lod1) c.lod1.visible = false;
        if (c.lod === 0) lod0++; else if (c.lod === 1) lod1++;
      }
    }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) { const c = this.chunks.get(w.key)!; c.status = 'loading'; this.queue.push(w.key); }
    this.pump();
    this.stats.lod0 = lod0; this.stats.lod1 = lod1;
    this.stats.loading = this.queue.length + this.pendingCount;
  }

  /** Undo debugHide: show chunk meshes again and let setLod re-apply LOD visibility next update. */
  clearDebugHide() {
    this.debugHide.clear();
    for (const c of this.chunks.values()) {
      if (!c.group) continue;
      c.group.traverse((o) => { if (o.name === 'buildings' || o.name === 'ground') o.visible = true; });
      c.lod = -1 as -1 | 0 | 1; if (c.lod0) c.lod0.visible = false; if (c.lod1) c.lod1.visible = false;
    }
  }

  /** True once every chunk the current camera wants is resident. */
  get idle() { return this.queue.length === 0 && this.pendingCount === 0; }

  /** Chunks whose box lies within r of (x,z): how many exist and how many are resident. Gates the title
   *  and the first view on the NEAR city only; everything else keeps streaming behind play. */
  progressNear(x: number, z: number, r: number): { ready: number; total: number } {
    const S = this.manifest.chunkSize; let ready = 0, total = 0;
    for (const c of this.chunks.values()) {
      const dx = Math.max(Math.abs(x - c.cx) - S / 2, 0), dz = Math.max(Math.abs(z - c.cz) - S / 2, 0);
      if (Math.hypot(dx, dz) > r) continue;
      total++; if (c.status === 'ready') ready++;
    }
    return { ready, total };
  }

  private pump() {
    for (let round = 0; round < World.IN_FLIGHT; round++) for (let k = 0; k < this.workers.length && this.queue.length; k++) {
      if (this.busy[k] > round) continue;
      const key = this.queue.shift()!;
      this.busy[k]++; this.pendingCount++;
      const c = this.chunks.get(key)!;
      const req: ChunkRequest = { key, url: new URL(`${this.base}chunks/${key}.bin`, location.href).href, terrainUrl: new URL(`${this.base}terrain.bin`, location.href).href, chunkSize: this.manifest.chunkSize, i: c.info.i, j: c.info.j };
      this.workers[k].postMessage(req);
    }
  }

  private onWorker(k: number, msg: ChunkResponse) {
    this.busy[k] = Math.max(0, this.busy[k] - 1); this.pendingCount = Math.max(0, this.pendingCount - 1);
    if (!msg.ok) { console.warn('chunk failed', msg.key, msg.error); this.stats.failed++; const c = this.chunks.get(msg.key); if (c) c.status = 'idle'; this.pump(); return; }
    this.stats.parseMsTotal += msg.parseMs;
    const t0 = performance.now();
    this.install(msg.mesh);
    loadReport.chunkReady(msg.parseMs, performance.now() - t0);
    this.pump();
  }

  private install(m: ChunkMeshes) {
    const c = this.chunks.get(m.key);
    if (!c || c.status !== 'loading') return;
    const group = new THREE.Group(); group.name = `chunk_${m.key}`;
    group.position.set(c.cx, 0, c.cz);
    const lod0 = new THREE.Group();
    const b = new THREE.Mesh(toGeometry(m.buildings), this.buildingMat); b.name = 'buildings';
    const g = new THREE.Mesh(toGeometry(m.ground), this.groundMat); g.name = 'ground';
    b.castShadow = b.receiveShadow = true; g.receiveShadow = true;
    const pr = new THREE.Mesh(toGeometry(m.props), this.propMat); pr.name = 'props'; pr.castShadow = true; pr.receiveShadow = true;
    const detail = m.detail.map((d) => { const dm = new THREE.Mesh(toGeometry(d), this.propMat); dm.name = 'detail'; dm.castShadow = true; dm.receiveShadow = true; return dm; });
    const lights: THREE.Mesh[] = [];
    if (m.spill.index.length) { const sm = new THREE.Mesh(toGeometry(m.spill), this.spillMat); sm.name = 'spill'; sm.renderOrder = 2; lights.push(sm); }
    if (m.marquee.index.length) { const mm = new THREE.Mesh(toGeometry(m.marquee), this.marqueeMat); mm.name = 'marquee'; lights.push(mm); }
    lod0.add(b, g, pr, ...detail, ...lights);
    const lod1 = new THREE.Mesh(toGeometry(m.buildingsLod1), this.buildingMat); lod1.name = 'lod1';
    group.add(lod0, lod1);
    lod0.visible = false; lod1.visible = false;
    Object.assign(c, { group, lod0, lod1, props: pr, detail, status: 'ready', lod: -1 });
    group.userData = { chunk: m.key, stats: m.stats };
    this.root.add(group);
    this.stats.ready++;
    for (const cb of this.onChunkReady) cb({ key: m.key, ox: c.cx, oz: c.cz, parts: [b.geometry, g.geometry, pr.geometry] }); // detail props get no colliders (AC units, fire escapes)
  }

  private setLod(c: ChunkState, lod: -1 | 0 | 1) {
    if (c.lod === lod || !c.group) return;
    c.lod0!.visible = lod === 0;
    c.lod1!.visible = lod === 1;
    c.lod = lod;
  }

  private unload(c: ChunkState) {
    if (!c.group) return;
    c.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.root.remove(c.group);
    Object.assign(c, { group: undefined, lod0: undefined, lod1: undefined, props: undefined, detail: undefined, status: 'idle', lod: -1 });
    this.stats.ready--;
    for (const cb of this.onChunkUnload) cb(c.key);
  }
}
