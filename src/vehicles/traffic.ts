import * as THREE from 'three/webgpu';
import { SLOTS, type Slot } from './gen/builder';
import { trafficSlotColor, type Quality } from './gen/materials';
import { getAsset, variantOf } from './assets';
import type { ModelSpec } from './gen/spec';
import { MODEL_BY_ID } from './models';
import { BIKE_BY_ID, buildBike, type BikeSpec } from './twowheel/bikes';
import { resolve } from './registry';
import { VehicleLights, type TrafficInstance } from '../shared/traffic';
import { shadowBake, groundPlane, shadowMaterial, headPoolGeometry, groundLightMats, groundLightLevel, type Footprint, type LightCandidate } from './lighting';

/**
 * Split a grouped vehicle geometry into three draw-call-friendly parts:
 *  - paint (tinted per instance via instanceColor)
 *  - fixed (vertex-coloured: chrome, glass, tyres, second colour, ...)
 *  - tail (lamps; instanceColor carries the brake state)
 */
interface SplitOpts { paint2?: number; roofColor?: ModelSpec['roofColor']; signWhite: boolean }
function splitForInstancing(spec: SplitOpts, g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position'), nrm = g.getAttribute('normal');
  const idx = g.index!;
  const out = { paint: [] as number[], fixed: [] as number[], fixedCol: [] as number[], tail: [] as number[], head: [] as number[], sign: [] as number[], vinyl: [] as number[] };
  const roofFixed = typeof spec.roofColor === 'number' ? spec.roofColor : spec.roofColor === 'paint2' ? spec.paint2 ?? 0xffffff : null;
  const c = new THREE.Color();
  const push = (arr: number[], i: number) => arr.push(pos.getX(i), pos.getY(i), pos.getZ(i), nrm.getX(i), nrm.getY(i), nrm.getZ(i));
  for (const grp of g.groups) {
    const slot = SLOTS[grp.materialIndex!] as Slot;
    let target: 'paint' | 'fixed' | 'tail' | 'head' | 'sign' | 'vinyl';
    let col: number | null = null;
    if (slot === 'paint' || (slot === 'roof' && roofFixed === null)) target = 'paint';
    else if (slot === 'vinyl') target = 'vinyl'; // per-instance colour: vinyl, or the paint when the car has none
    else if (slot === 'taillamp') target = 'tail';
    else if (slot === 'headlamp') target = 'head';
    else if (slot === 'white' && spec.signWhite) target = 'sign'; // taxi roof light box / beacons
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
  return { paint: mk(out.paint), fixed: mk(out.fixed, out.fixedCol), tail: mk(out.tail), head: mk(out.head), sign: mk(out.sign), vinyl: mk(out.vinyl) };
}

/** A two-wheeler's LOD1 parts merged (frame, steering assembly, wheels) for instancing. */
function bikeGeometry(b: BikeSpec): THREE.BufferGeometry {
  const g = buildBike(b, 1);
  const parts: THREE.BufferGeometry[] = [g.body.clone(), g.steer.clone()];
  for (const w of g.wheels) { const wg = g.wheel.clone(); wg.translate(w.x, w.y, w.z); parts.push(wg); }
  if (g.beacon) {
    const bc = g.beacon.clone();
    for (const grp of bc.groups) if (SLOTS[grp.materialIndex!] === 'taillamp') grp.materialIndex = SLOTS.indexOf('white');
    parts.push(bc);
  }
  return mergeGrouped(parts);
}

/** Body + wheels merged into one geometry so a whole car is three instanced draws. */
function withWheels(spec: ModelSpec, lod: 1 | 2): THREE.BufferGeometry {
  // models that come with vinyl roofs carry the vinyl panel; cars without one get it painted (per instance)
  const vinyl = spec.vinylChance > 0 ? (spec.cls === 'coupe' ? 'landau' : 'full') : 'none';
  const a = getAsset(spec, { vinyl, whitewall: false, wheelStyle: spec.wheelStyle });
  if (lod === 2) return a.lod2;
  const g = a.lod1;
  const parts: THREE.BufferGeometry[] = [g.body.clone()];
  if (g.beacon) { // police roof beacon: route its red lens to the 'sign' part (via the otherwise unused white slot)
    const bc = g.beacon.clone();
    for (const grp of bc.groups) if (SLOTS[grp.materialIndex!] === 'taillamp') grp.materialIndex = SLOTS.indexOf('white');
    parts.push(bc);
  }
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

interface ModelBatch {
  vinyl: THREE.InstancedMesh | null;
  paint: THREE.InstancedMesh; fixed: THREE.InstancedMesh; tail: THREE.InstancedMesh; head: THREE.InstancedMesh; sign: THREE.InstancedMesh | null;
  /** Contact shadow (one quad per car); ground light pools (own counts: only cars with lamps lit). */
  shadow: THREE.InstancedMesh; pool: THREE.InstancedMesh; brake: THREE.InstancedMesh; tailGlow: THREE.InstancedMesh;
  meshes: THREE.InstancedMesh[]; n: number; np: number; nb: number; nt: number;
}
interface ModelDims { minZ: number; maxZ: number; halfW: number; headY: number }

/**
 * Visual-only traffic: per model and LOD, three InstancedMeshes. No physics bodies.
 * Pass the camera position to setInstances to get LOD selection (else everything is LOD1).
 */
export class TrafficRenderer {
  readonly object = new THREE.Group();
  private batches = new Map<string, [ModelBatch, ModelBatch]>();
  private dims = new Map<string, ModelDims>();
  private shadowMats: THREE.Material[] = [];
  private resolveCache = new Map<string, { modelId: string; paint: THREE.Color; vinyl: THREE.Color }>();
  private lampCols = {
    brake: new THREE.Color(0xff2a10).multiplyScalar(2.2), tailRun: new THREE.Color(0xc01808), tailOff: new THREE.Color(0x4a0806),
    reverse: new THREE.Color(0xffffff).multiplyScalar(1.6), amber: new THREE.Color(0xff9a20).multiplyScalar(2),
    headOn: new THREE.Color(0xfff0cc).multiplyScalar(2), headOff: new THREE.Color(0x8a8780),
    signOn: new THREE.Color(0xfff2d0).multiplyScalar(1.8), signOff: new THREE.Color(0xc8c4b8),
    beacon: new THREE.Color(0xff2010).multiplyScalar(3), beaconOff: new THREE.Color(0x5a0a08),
  };
  private mats: { paint: THREE.Material; fixed: THREE.Material; lamp: THREE.Material; vinyl: THREE.Material };
  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _p = new THREE.Vector3(); private _s = new THREE.Vector3(1, 1, 1); private _y = new THREE.Vector3(0, 1, 0);
  /** Distance (m) beyond which the box impostor is used. */
  lod2Distance: number;
  lastMs = 0;

  constructor(readonly maxInstances: number, quality: Quality) {
    this.object.name = 'vehicle-traffic';
    this.lod2Distance = quality === 'low' ? 60 : quality === 'medium' ? 110 : 160;
    this.mats = {
      paint: new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.1 }),
      fixed: new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
      lamp: new THREE.MeshBasicNodeMaterial({}),
      vinyl: new THREE.MeshStandardNodeMaterial({ roughness: 0.78, metalness: 0 }),
    };
  }

  private batch(modelId: string, lod: 0 | 1): ModelBatch {
    let b = this.batches.get(modelId);
    if (!b) {
      const spec = MODEL_BY_ID.get(modelId);
      const bike = BIKE_BY_ID.get(modelId);
      if (!spec && !bike) throw new Error(`unknown vehicle model ${modelId}`);
      let fp: Footprint, headY = 0.7;
      if (spec) {
        const a = getAsset(spec, { vinyl: 'none', whitewall: false, wheelStyle: spec.wheelStyle }).lod0;
        fp = { halfW: a.halfW, minZ: a.minZ, maxZ: a.maxZ, wheels: a.wheels.map((w) => ({ x: w.x, z: w.z, r: w.r, w: w.dual ? spec.tireW * 2 + 0.04 : spec.tireW })) };
        if (a.lamps.head.length) headY = a.lamps.head.reduce((s, p) => s + p[1], 0) / a.lamps.head.length;
      } else {
        const g = buildBike(bike!, 1);
        fp = { halfW: g.halfW * 0.55, minZ: g.minZ, maxZ: g.maxZ, wheels: g.wheels.map((w) => ({ x: w.x, z: w.z, r: bike!.wheelR, w: bike!.tireW + 0.04 })) };
        headY = 0.85;
      }
      this.dims.set(modelId, { minZ: fp.minZ, maxZ: fp.maxZ, halfW: fp.halfW, headY });
      const bake = shadowBake('traffic:' + modelId, fp);
      const smat = shadowMaterial(bake.tex);
      this.shadowMats.push(smat);
      const shadowGeo = groundPlane(bake.w, bake.l, bake.cz);
      const poolGeo = headPoolGeometry(fp.minZ, fp.halfW);
      const glowGeo = groundPlane(fp.halfW * 2 + 1.6, 2.6, fp.maxZ + 0.6);
      const gm = groundLightMats();
      const mk = (lodLevel: 1 | 2): ModelBatch => {
        const parts = spec
          ? splitForInstancing({ paint2: spec.paint2, roofColor: spec.roofColor, signWhite: spec.cls !== 'icecream' && (spec.cls === 'taxi' || !!getAsset(spec, { vinyl: 'none', whitewall: false, wheelStyle: spec.wheelStyle }).lod1.beacon) }, withWheels(spec, lodLevel))
          : splitForInstancing({ paint2: bike!.paint2, signWhite: !!bike!.police }, bikeGeometry(bike!));
        const im = (geo: THREE.BufferGeometry, mat: THREE.Material, colored: boolean) => {
          const m = new THREE.InstancedMesh(geo, mat, this.maxInstances);
          m.count = 0; m.frustumCulled = false;
          if (colored) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxInstances * 3), 3);
          m.castShadow = lodLevel === 1;
          this.object.add(m);
          return m;
        };
        const paint = im(parts.paint, this.mats.paint, true), fixed = im(parts.fixed, this.mats.fixed, false);
        paint.name = 'traffic-paint';
        const tail = im(parts.tail, this.mats.lamp, true), head = im(parts.head, this.mats.lamp, true);
        const sign = parts.sign.getAttribute('position').count ? im(parts.sign, this.mats.lamp, true) : null;
        const vinyl = parts.vinyl.getAttribute('position').count ? im(parts.vinyl, this.mats.vinyl, true) : null;
        const flat = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const m = im(geo, mat, false); m.castShadow = false; m.renderOrder = -1; return m; };
        const shadow = flat(shadowGeo, smat);
        const pool = flat(poolGeo, gm.head), brake = flat(glowGeo, gm.brake), tailGlow = flat(glowGeo, gm.tail);
        return { paint, fixed, tail, head, sign, vinyl, shadow, pool, brake, tailGlow, meshes: [paint, fixed, tail, head, shadow, ...(sign ? [sign] : []), ...(vinyl ? [vinyl] : [])], n: 0, np: 0, nb: 0, nt: 0 };
      };
      b = [mk(1), mk(2)];
      this.batches.set(modelId, b);
    }
    return b[lod];
  }

  private resolved(vclass: TrafficInstance['vclass'], variant: number) {
    const k = vclass + ':' + variant;
    let r = this.resolveCache.get(k);
    if (!r) {
      const x = resolve(vclass, variant);
      const spec = MODEL_BY_ID.get(x.modelId);
      const v = spec ? variantOf(spec, variant) : null;
      const paint = new THREE.Color(x.paint);
      r = { modelId: x.modelId, paint, vinyl: v && v.vinyl !== 'none' ? new THREE.Color(v.vinylColor) : paint };
      this.resolveCache.set(k, r);
    }
    return r;
  }

  /** Instances follow the shared contract (src/shared/traffic.ts); light bits drive the lamp parts. */
  setInstances(list: readonly TrafficInstance[], camera?: THREE.Vector3, lit?: { litHead: Set<string>; litRear: Set<string> }) {
    const t0 = performance.now();
    for (const pair of this.batches.values()) for (const b of pair) { b.n = 0; b.np = 0; b.nb = 0; b.nt = 0; }
    const pools = groundLightLevel() > 0.02;
    let idx = -1;
    const d2 = this.lod2Distance * this.lod2Distance;
    const blink = Math.floor(t0 / 380) % 2 === 0;
    const L = this.lampCols;
    for (const it of list) {
      idx++;
      const r = this.resolved(it.vclass, it.variant);
      const far = camera ? (it.x - camera.x) ** 2 + (it.z - camera.z) ** 2 > d2 : false;
      const b = this.batch(r.modelId, far ? 1 : 0);
      if (b.n >= this.maxInstances) continue;
      this._q.setFromAxisAngle(this._y, it.yaw);
      this._m.compose(this._p.set(it.x, it.y, it.z), this._q, this._s);
      const i = b.n++;
      for (const m of b.meshes) m.setMatrixAt(i, this._m);
      b.paint.setColorAt(i, r.paint);
      b.vinyl?.setColorAt(i, r.vinyl);
      const lt = it.lights;
      if (pools) {
        const key = 'traffic:' + idx;
        if (lt & VehicleLights.Head && !lit?.litHead.has(key)) b.pool.setMatrixAt(b.np++, this._m);
        if (!lit?.litRear.has(key)) {
          if (lt & VehicleLights.Brake) b.brake.setMatrixAt(b.nb++, this._m);
          else if (lt & VehicleLights.Head) b.tailGlow.setMatrixAt(b.nt++, this._m);
        }
      }
      const flash = blink && (lt & (VehicleLights.Hazard | VehicleLights.IndicatorLeft | VehicleLights.IndicatorRight)) !== 0;
      b.tail.setColorAt(i, flash ? L.amber : lt & VehicleLights.Brake ? L.brake : lt & VehicleLights.Reverse ? L.reverse : lt & VehicleLights.Head ? L.tailRun : L.tailOff);
      b.head.setColorAt(i, lt & VehicleLights.Head ? L.headOn : L.headOff);
      if (b.sign) {
        const police = MODEL_BY_ID.get(r.modelId)?.cls !== 'taxi'; // emergency beacons (cars and police bikes) follow the Siren bit
        b.sign.setColorAt(i, police ? (lt & VehicleLights.Siren && blink ? L.beacon : L.beaconOff) : lt & VehicleLights.RoofLight ? L.signOn : L.signOff);
      }
    }
    for (const pair of this.batches.values()) for (const b of pair) {
      for (const m of b.meshes) {
        m.count = b.n;
        if (b.n) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        m.visible = b.n > 0;
      }
      for (const [m, n] of [[b.pool, b.np], [b.brake, b.nb], [b.tailGlow, b.nt]] as [THREE.InstancedMesh, number][]) {
        m.count = n; m.visible = n > 0;
        if (n) m.instanceMatrix.needsUpdate = true;
      }
    }
    this.lastMs = performance.now() - t0;
  }

  /**
   * Real-light requests for traffic near the camera (headlamps on, or braking), for CarLightPool.
   * Keys are 'traffic:<index in list>'; pass the pool back to setInstances to hide their ground pools.
   */
  lightCandidates(list: readonly TrafficInstance[], camera: THREE.Vector3, radius = 45): LightCandidate[] {
    const out: LightCandidate[] = [];
    const r2 = radius * radius;
    list.forEach((it, i) => {
      const lt = it.lights;
      if (!(lt & (VehicleLights.Head | VehicleLights.Brake))) return;
      const d2 = (it.x - camera.x) ** 2 + (it.z - camera.z) ** 2;
      if (d2 > r2) return;
      const r = this.resolved(it.vclass, it.variant);
      this.batch(r.modelId, 0);
      const d = this.dims.get(r.modelId)!;
      const s = Math.sin(it.yaw), c = Math.cos(it.yaw);
      const at = (z: number, y: number) => new THREE.Vector3(it.x + s * z, it.y + y, it.z + c * z);
      out.push({
        key: 'traffic:' + i, dist2: d2,
        head: lt & VehicleLights.Head ? { pos: at(d.minZ - 0.05, d.headY), target: at(d.minZ - 14, d.headY - 1.0) } : null,
        rear: { pos: at(d.maxZ + 0.35, 0.55), brake: !!(lt & VehicleLights.Brake) },
      });
    });
    return out;
  }

  dispose() {
    for (const pair of this.batches.values()) for (const b of pair) for (const m of [...b.meshes, b.pool, b.brake, b.tailGlow]) { m.geometry.dispose(); m.dispose(); }
    for (const m of this.shadowMats) m.dispose();
    Object.values(this.mats).forEach((m) => m.dispose());
    this.object.removeFromParent();
  }
}
