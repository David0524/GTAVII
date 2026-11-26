import * as THREE from 'three/webgpu';
import { SLOTS, type Slot } from './gen/builder';
import { trafficSlotColor, type Quality } from './gen/materials';
import { getAsset, variantOf } from './assets';
import type { ModelSpec } from './gen/spec';
import { MODEL_BY_ID } from './models';

export interface TrafficInstance { modelId: string; variant: number; x: number; y: number; z: number; yaw: number; brake: boolean }

/**
 * Split a grouped vehicle geometry into three draw-call-friendly parts:
 *  - paint (tinted per instance via instanceColor)
 *  - fixed (vertex-coloured: chrome, glass, tyres, second colour, ...)
 *  - tail (lamps; instanceColor carries the brake state)
 */
function splitForInstancing(spec: ModelSpec, g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
  const idx = g.index!;
  const out = { paint: [] as number[], fixed: [] as number[], fixedCol: [] as number[], tail: [] as number[] };
  const roofFixed = typeof spec.roofColor === 'number' ? spec.roofColor : spec.roofColor === 'paint2' ? spec.paint2 ?? 0xffffff : null;
  const c = new THREE.Color();
  const push = (arr: number[], i: number) => arr.push(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  for (const grp of g.groups) {
    const slot = SLOTS[grp.materialIndex!] as Slot;
    let target: 'paint' | 'fixed' | 'tail';
    let col: number | null = null;
    if (slot === 'paint' || (slot === 'roof' && roofFixed === null)) target = 'paint';
    else if (slot === 'taillamp') target = 'tail';
    else {
      target = 'fixed';
      col = slot === 'paint2' ? spec.paint2 ?? 0xdddddd : slot === 'roof' ? roofFixed! : trafficSlotColor(slot) ?? 0x888888;
    }
    if (col !== null) c.setHex(col).convertSRGBToLinear();
    for (let k = grp.start; k < grp.start + grp.count; k++) {
      const i = idx.getX(k);
      push(out[target], i);
      if (target === 'fixed') out.fixedCol.push(c.r, c.g, c.b);
    }
  }
  const mk = (a: number[], col?: number[]) => {
    const geo = new THREE.BufferGeometry();
    const p: number[] = [], n: number[] = [];
    for (let i = 0; i < a.length; i += 6) { p.push(a[i], a[i + 1], a[i + 2]); n.push(a[i + 3], a[i + 4], a[i + 5]); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    if (col) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  };
  return { paint: mk(out.paint), fixed: mk(out.fixed, out.fixedCol), tail: mk(out.tail) };
}

/** Body + wheels merged into one geometry so a whole car is three instanced draws. */
function withWheels(spec: ModelSpec, lod: 1 | 2): THREE.BufferGeometry {
  const a = getAsset(spec, { vinyl: 'none', whitewall: false, wheelStyle: spec.wheelStyle });
  if (lod === 2) return a.lod2;
  const g = a.lod1;
  const parts: THREE.BufferGeometry[] = [g.body.clone()];
  for (const w of g.wheels) {
    const wg = (w.side > 0 ? g.wheelR : g.wheelL).clone();
    wg.translate(w.x, w.y, w.z);
    if (w.dual) { const w2 = wg.clone(); w2.translate(-w.side * (spec.tireW + 0.04), 0, 0); parts.push(w2); }
    parts.push(wg);
  }
  return mergeGrouped(parts);
}
/** Merge indexed geometries keeping material groups (same slot indices). */
function mergeGrouped(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nrm: number[] = [];
  const bySlot = new Map<number, number[]>();
  let base = 0;
  for (const g of gs) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i)); }
    for (const grp of g.groups) {
      let l = bySlot.get(grp.materialIndex!); if (!l) bySlot.set(grp.materialIndex!, (l = []));
      for (let k = grp.start; k < grp.start + grp.count; k++) l.push(base + g.index!.getX(k));
    }
    base += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  const all: number[] = [];
  for (const [mi, l] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) { out.addGroup(all.length, l.length, mi); all.push(...l); }
  out.setIndex(all);
  return out;
}

interface ModelBatch { paint: THREE.InstancedMesh; fixed: THREE.InstancedMesh; tail: THREE.InstancedMesh; n: number }

/**
 * Visual-only traffic: per model and LOD, three InstancedMeshes. No physics bodies.
 * Pass the camera position to setInstances to get LOD selection (else everything is LOD1).
 */
export class TrafficRenderer {
  readonly object = new THREE.Group();
  private batches = new Map<string, [ModelBatch, ModelBatch]>();
  private colorCache = new Map<string, THREE.Color>();
  private mats: { paint: THREE.Material; fixed: THREE.Material; tail: THREE.Material };
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _p = new THREE.Vector3(); private _s = new THREE.Vector3(1, 1, 1); private _y = new THREE.Vector3(0, 1, 0);
  private brakeOn = new THREE.Color(0xff2a10).multiplyScalar(2.2); private brakeOff = new THREE.Color(0x4a0806);
  /** Distance (m) beyond which the box impostor is used. */
  lod2Distance: number;
  lastMs = 0;

  constructor(readonly maxInstances: number, quality: Quality) {
    this.object.name = 'vehicle-traffic';
    this.lod2Distance = quality === 'low' ? 60 : quality === 'medium' ? 110 : 160;
    this.mats = {
      paint: new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.1 }),
      fixed: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
      tail: new THREE.MeshBasicNodeMaterial({}),
    };
  }

  private batch(modelId: string, lod: 0 | 1): ModelBatch {
    let b = this.batches.get(modelId);
    if (!b) {
      const spec = MODEL_BY_ID.get(modelId);
      if (!spec) throw new Error(`unknown vehicle model ${modelId}`);
      const mk = (lodLevel: 1 | 2): ModelBatch => {
        const parts = splitForInstancing(spec, withWheels(spec, lodLevel));
        const im = (geo: THREE.BufferGeometry, mat: THREE.Material, colored: boolean) => {
          const m = new THREE.InstancedMesh(geo, mat, this.maxInstances);
          m.count = 0; m.frustumCulled = false;
          if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3);
          m.castShadow = lodLevel === 1;
          this.object.add(m);
          return m;
        };
        return { paint: im(parts.paint, this.mats.paint, true), fixed: im(parts.fixed, this.mats.fixed, false), tail: im(parts.tail, this.mats.tail, true), n: 0 };
      };
      b = [mk(1), mk(2)];
      this.batches.set(modelId, b);
    }
    return b[lod];
  }

  private paintOf(modelId: string, variant: number) {
    const k = modelId + ':' + variant;
    let c = this.colorCache.get(k);
    if (!c) { c = new THREE.Color(variantOf(MODEL_BY_ID.get(modelId)!, variant).paint); this.colorCache.set(k, c); }
    return c;
  }

  setInstances(list: TrafficInstance[], camera?: THREE.Vector3) {
    const t0 = performance.now();
    for (const pair of this.batches.values()) for (const b of pair) b.n = 0;
    const d2 = this.lod2Distance * this.lod2Distance;
    for (const it of list) {
      const far = camera ? (it.x - camera.x) ** 2 + (it.z - camera.z) ** 2 > d2 : false;
      const b = this.batch(it.modelId, far ? 1 : 0);
      if (b.n >= this.maxInstances) continue;
      this._q.setFromAxisAngle(this._y, it.yaw);
      this._m.compose(this._p.set(it.x, it.y, it.z), this._q, this._s);
      const i = b.n++;
      b.paint.setMatrixAt(i, this._m); b.fixed.setMatrixAt(i, this._m); b.tail.setMatrixAt(i, this._m);
      b.paint.setColorAt(i, this.paintOf(it.modelId, it.variant));
      b.tail.setColorAt(i, it.brake ? this.brakeOn : this.brakeOff);
    }
    for (const pair of this.batches.values()) for (const b of pair) {
      for (const m of [b.paint, b.fixed, b.tail]) {
        m.count = b.n;
        if (b.n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        m.visible = b.n > 0;
      }
    }
    this.lastMs = performance.now() - t0;
  }

  dispose() {
    for (const pair of this.batches.values()) for (const b of pair) for (const m of [b.paint, b.fixed, b.tail]) { m.geometry.dispose(); m.dispose(); }
    Object.values(this.mats).forEach((m) => m.dispose());
    this.object.removeFromParent();
  }
}
