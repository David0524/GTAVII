import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import type { SkidEvent } from './Vehicle';

/**
 * Tyre marks from 'skid' events: a ring buffer of ground quads in one draw call.
 * Optional helper; the engine may replace it with its own decal system.
 */
export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array; private alpha: Float32Array;
  private head = 0;
  private last = new Map<string, { x: number; y: number; z: number; t: number }>();
  private t = 0;

  constructor(readonly maxQuads = 3000, readonly width = 0.2) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxQuads * 4 * 3);
    this.alpha = new Float32Array(maxQuads * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) { const v = i * 4; idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6); }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicNodeMaterial({ color: 0x0a0908, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    // opacity per vertex from the alpha attribute
    m.opacityNode = attribute('alpha', 'float');
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'skidmarks';
    this.mesh.renderOrder = 1;
  }

  /** Feed a vehicle's skid event; `key` separates vehicles. */
  add(e: SkidEvent, key = 'v') {
    for (const w of e.wheels) {
      const k = key + ':' + w.index;
      const prev = this.last.get(k);
      const cur = { x: w.x, y: w.y + 0.012, z: w.z, t: this.t };
      if (prev && this.t - prev.t < 0.12) {
        const dx = cur.x - prev.x, dz = cur.z - prev.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) continue;
        if (d < 3) this.quad(prev, cur, dx / d, dz / d, Math.min(0.85, 0.25 + w.slip * 0.06));
      }
      this.last.set(k, cur);
    }
  }

  private quad(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, dx: number, dz: number, alpha: number) {
    const hw = this.width / 2, nx = -dz * hw, nz = dx * hw;
    const i = this.head; this.head = (this.head + 1) % this.maxQuads;
    this.pos.set([a.x + nx, a.y, a.z + nz, a.x - nx, a.y, a.z - nz, b.x + nx, b.y, b.z + nz, b.x - nx, b.y, b.z - nz], i * 12);
    this.alpha.set([alpha, alpha, alpha, alpha], i * 4);
    const g = this.mesh.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('alpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) { this.t += dt; }
  clear() { this.pos.fill(0); this.alpha.fill(0); this.last.clear(); for (const n of ['position', 'alpha']) (this.mesh.geometry.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true; }
}
