/**
 * Original 1970s-style subway car ("Pell Type 7", invented builder; registry in
 * docs/VEHICLE_REGISTRY.md): painted steel, three double doors a side, longitudinal benches,
 * poles, grab rails and straps, fluorescent strips, a car-card ad strip, and period graffiti
 * outside and in. Runs on rails (no Rapier vehicle physics): the sim owns the schedule and
 * calls setState({ s, doorsOpen }) each frame; cars are kinematic bodies so characters can ride.
 */
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { GeoBuilder, type Slot } from '../gen/builder';
import { createMaterialSet, type MaterialSet, type Quality } from '../gen/materials';
import { paintCarSide, paintInterior, paintCarCards } from './graffiti';

export const CAR = {
  L: 15.5, W: 2.68, floorY: 1.12, cantY: 3.0, roofY: 3.55, sillY: 1.95, winTopY: 2.75,
  doors: [-4.6, 0, 4.6], doorW: 1.27, doorTop: 2.95, bogieZ: 5.4, gap: 0.9,
};
const HW = CAR.W / 2;

interface Segment { z0: number; z1: number }
function wallSegments(): Segment[] {
  const out: Segment[] = [];
  let z = -CAR.L / 2;
  for (const d of CAR.doors) { out.push({ z0: z, z1: d - CAR.doorW / 2 }); z = d + CAR.doorW / 2; }
  out.push({ z0: z, z1: CAR.L / 2 });
  return out;
}

/** Static car shell + interior (doors excluded). */
function buildCar(lod: 0 | 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const box = (slot: Slot, x: number, y0: number, y1: number, z0: number, z1: number, t: number) => b.box(slot, x, (y0 + y1) / 2, (z0 + z1) / 2, t, y1 - y0, z1 - z0);
  // underframe, bogies, wheels
  b.box('under', 0, 0.85, 0, CAR.W - 0.12, 0.4, CAR.L - 0.6);
  for (const bz of [-CAR.bogieZ, CAR.bogieZ]) {
    b.box('trim', 0, 0.55, bz, 2.1, 0.3, 2.5);
    for (const az of [bz - 1.05, bz + 1.05]) for (const sx of [-1, 1]) b.add('trim', new THREE.CylinderGeometry(0.43, 0.43, 0.14, lod === 0 ? 14 : 8), new THREE.Matrix4().makeTranslation(sx * 0.72, 0.43, az).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
  }
  b.box('rubber', 0, CAR.floorY - 0.04, 0, CAR.W - 0.04, 0.08, CAR.L - 0.04);
  // side walls between doors: panels, piers, windows (outer 'paint', inner 'white' lining)
  for (const sx of [-1, 1]) {
    const xo = sx * (HW - 0.025), xi = sx * (HW - 0.065);
    const glass: Slot = sx > 0 ? 'glassR' : 'glassL';
    for (const sg of wallSegments()) {
      box('paint', xo, CAR.floorY, CAR.sillY, sg.z0, sg.z1, 0.05); box('white', xi, CAR.floorY, CAR.sillY, sg.z0, sg.z1, 0.02);
      box('paint', xo, CAR.winTopY, CAR.cantY, sg.z0, sg.z1, 0.05); box('white', xi, CAR.winTopY, CAR.cantY, sg.z0, sg.z1, 0.02);
      const len = sg.z1 - sg.z0, n = Math.max(1, Math.floor(len / 1.35));
      const winW = Math.min(1.05, (len - 0.25 * (n + 1)) / n), pier = (len - winW * n) / (n + 1);
      let z = sg.z0;
      for (let k = 0; k <= n; k++) {
        box('paint', xo, CAR.sillY, CAR.winTopY, z, z + pier, 0.05); box('white', xi, CAR.sillY, CAR.winTopY, z, z + pier, 0.02);
        z += pier;
        if (k < n) { box(glass, sx * (HW - 0.045), CAR.sillY, CAR.winTopY, z, z + winW, 0.03); z += winW; }
      }
    }
    // door headers above each opening
    for (const d of CAR.doors) { box('paint', xo, CAR.doorTop, CAR.cantY, d - CAR.doorW / 2, d + CAR.doorW / 2, 0.05); box('white', xi, CAR.doorTop, CAR.cantY, d - CAR.doorW / 2, d + CAR.doorW / 2, 0.02); }
  }
  // roof: outer arc (paint) and ceiling (white), lofted along the car
  const arc = (r0: number, y0: number, inset: number) => {
    const pts: [number, number][] = [];
    const n = lod === 0 ? 10 : 4;
    for (let i = 0; i <= n; i++) { const t = i / n, a = Math.PI * (1 - t); pts.push([Math.cos(a) * (HW - inset), y0 + Math.sin(a) * r0]); }
    return pts;
  };
  for (const [slot, pts] of [['paint', arc(CAR.roofY - CAR.cantY, CAR.cantY, 0)], ['white', arc(CAR.roofY - CAR.cantY - 0.12, CAR.cantY - 0.02, 0.07)]] as const) {
    b.grid([pts.map(([x, y]) => [x, y, -CAR.L / 2] as [number, number, number]), pts.map(([x, y]) => [x, y, CAR.L / 2] as [number, number, number])], slot, { facing: slot === 'paint' ? [0, 1, 0] : [0, -1, 0] });
  }
  // end walls with storm door, cab window, lamps (both ends)
  for (const e of [-1, 1]) {
    const z = e * (CAR.L / 2 - 0.03);
    box('paint', -HW + 0.4, CAR.floorY - 0.25, CAR.roofY - 0.05, z - 0.03, z + 0.03, CAR.W * 0.3); box('paint', HW - 0.4, CAR.floorY - 0.25, CAR.roofY - 0.05, z - 0.03, z + 0.03, CAR.W * 0.3);
    box('paint', 0, CAR.floorY - 0.25, CAR.floorY + 0.05, z - 0.03, z + 0.03, 0.8); box('paint', 0, CAR.doorTop - 0.05, CAR.roofY - 0.05, z - 0.03, z + 0.03, 0.8);
    box('trim', 0, CAR.floorY + 0.05, CAR.doorTop - 0.05, z - 0.02, z + 0.02, 0.76); // storm door
    box('glassF', 0, 2.05, 2.7, z + e * 0.03, z + e * 0.035, 0.4);
    for (const sx of [-1, 1]) {
      box('glassF', sx * (HW - 0.45), 2.0, 2.75, z + e * 0.03, z + e * 0.035, 0.55);
      b.box('headlamp', sx * 0.55, CAR.floorY - 0.1, z + e * 0.04, 0.16, 0.12, 0.03);
      b.box('taillamp', sx * 0.85, CAR.roofY - 0.25, z + e * 0.04, 0.1, 0.1, 0.03);
    }
    b.box('chrome', 0, CAR.floorY - 0.55, z + e * 0.25, 0.4, 0.2, 0.5); // coupler
  }
  // interior: benches between doors, poles, grab rails, straps, fluorescent strips
  for (const sx of [-1, 1]) for (const sg of wallSegments()) {
    const z0 = sg.z0 + 0.15, z1 = sg.z1 - 0.15;
    if (z1 - z0 < 0.6) continue;
    b.box('paint2', sx * (HW - 0.3), CAR.floorY + 0.42, (z0 + z1) / 2, 0.45, 0.06, z1 - z0); // seat pan
    b.box('paint2', sx * (HW - 0.1), CAR.floorY + 0.75, (z0 + z1) / 2, 0.06, 0.6, z1 - z0); // back
    b.box('under', sx * (HW - 0.3), CAR.floorY + 0.2, (z0 + z1) / 2, 0.4, 0.4, z1 - z0); // base
  }
  const pole = (x: number, z: number) => b.add('chrome', new THREE.CylinderGeometry(0.02, 0.02, CAR.cantY - CAR.floorY + 0.25, lod === 0 ? 8 : 4), new THREE.Matrix4().makeTranslation(x, (CAR.floorY + CAR.cantY + 0.25) / 2, z));
  for (const d of CAR.doors) { pole(0, d); for (const sx of [-1, 1]) for (const dz of [-1, 1]) pole(sx * (HW - 0.55), d + dz * (CAR.doorW / 2 + 0.12)); }
  for (const sx of [-1, 1]) {
    b.add('chrome', new THREE.CylinderGeometry(0.018, 0.018, CAR.L - 1, 6), new THREE.Matrix4().makeTranslation(sx * (HW - 0.55), 2.25, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    if (lod === 0) for (let z = -CAR.L / 2 + 0.8; z < CAR.L / 2 - 0.8; z += 0.45) {
      if (CAR.doors.some((d) => Math.abs(z - d) < CAR.doorW / 2)) continue;
      b.box('trim', sx * (HW - 0.55), 2.12, z, 0.02, 0.24, 0.02); // strap
      b.box('trim', sx * (HW - 0.55), 1.98, z, 0.02, 0.03, 0.12); // handle
    }
    b.box('reverse', sx * 0.55, CAR.roofY - 0.22, 0, 0.12, 0.03, CAR.L - 1.2); // fluorescent strip
  }
  return b.build();
}

function buildDoorLeaf(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const w = CAR.doorW / 2, h = CAR.doorTop - CAR.floorY;
  b.box('paint', 0, h * 0.27, 0, 0.04, h * 0.54, w - 0.01);
  b.box('paint', 0, h * 0.95, 0, 0.04, h * 0.1, w - 0.01);
  for (const dz of [-1, 1]) b.box('paint', 0, h * 0.72, dz * (w / 2 - 0.05), 0.04, h * 0.36, 0.1);
  b.box('glassL', 0, h * 0.72, 0, 0.02, h * 0.36, w - 0.2);
  b.box('rubber', 0, h / 2, 0, 0.05, h, 0.02);
  return b.build();
}

/** Plane with UVs cropped to [u0,u1]x[v0,v1] of a shared texture. */
function croppedPlane(w: number, h: number, u0: number, u1: number, v0: number, v1: number) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  return g;
}

interface CarRuntime { group: THREE.Group; doors: { mesh: THREE.Object3D; closedZ: number; dir: number; collider: RAPIER.Collider; sx: number }[]; body: RAPIER.RigidBody; s: number }

const shellCache: Partial<Record<0 | 1, THREE.BufferGeometry>> = {};
let leafGeo: THREE.BufferGeometry | null = null;

export class SubwayTrain {
  readonly object = new THREE.Group();
  readonly cars: CarRuntime[] = [];
  readonly mats: MaterialSet;
  private track: { pts: THREE.Vector3[]; cum: number[]; total: number } | null = null;
  private textures: THREE.Texture[] = [];
  private overlayMats: THREE.Material[] = [];
  private state = { s: 0, doorsOpen: 0, lights: true };

  constructor(private world: RAPIER.World, scene: THREE.Object3D, opts: { cars?: number; seed?: number; graffiti?: number; quality?: Quality } = {}) {
    const n = opts.cars ?? 4, seed = opts.seed ?? 1, cov = opts.graffiti ?? 0.8;
    // period dull grey paint, orange fiberglass seats
    this.mats = createMaterialSet(opts.quality ?? 'high', { paint: 0x8e8f8a, paint2: 0xd46a2a, roof: 'paint', metallic: false, vinyl: 0x141414, dirt: 0.7 });
    this.object.name = 'subway-train';
    shellCache[0] ??= buildCar(0); shellCache[1] ??= buildCar(1);
    leafGeo ??= buildDoorLeaf();
    for (let i = 0; i < n; i++) this.cars.push(this.makeCar(i, seed * 101 + i, cov, opts.quality ?? 'high'));
    scene.add(this.object);
  }

  private overlay(tex: THREE.Texture, transparent = true) {
    const m = new THREE.MeshStandardNodeMaterial({ map: tex, transparent, alphaTest: 0.05, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
    this.overlayMats.push(m);
    return m;
  }

  private makeCar(i: number, seed: number, cov: number, quality: Quality): CarRuntime {
    const group = new THREE.Group();
    group.name = `subway-car-${i}`;
    const lod = new THREE.LOD();
    lod.addLevel(new THREE.Mesh(shellCache[0], this.mats.array), 0);
    lod.addLevel(new THREE.Mesh(shellCache[1], this.mats.array), quality === 'low' ? 30 : 60);
    group.add(lod);
    // graffiti: one canvas per side; wall segments and door leaves crop their part of it
    const H0 = 0.95, H1 = CAR.cantY;
    const sideTex = [-1, 1].map((sx) => { const t = new THREE.CanvasTexture(paintCarSide(2048, 300, { seed: seed * 2 + (sx > 0 ? 1 : 0), coverage: cov })); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; this.textures.push(t); return t; });
    const inTex = new THREE.CanvasTexture(paintInterior(2048, 256, { seed, coverage: cov * 0.8 })); inTex.colorSpace = THREE.SRGBColorSpace; this.textures.push(inTex);
    const cards = new THREE.CanvasTexture(paintCarCards(2048, 96, seed)); cards.colorSpace = THREE.SRGBColorSpace; this.textures.push(cards);
    const u = (z: number) => (z + CAR.L / 2) / CAR.L;
    [-1, 1].forEach((sx, k) => {
      const mo = this.overlay(sideTex[k]), mi = this.overlay(inTex), mc = this.overlay(cards, false);
      for (const sg of wallSegments()) {
        const len = sg.z1 - sg.z0;
        const zc = (sg.z0 + sg.z1) / 2;
        // seen from outside, the canvas reads left to right: rear->front on the right side
        // (front = -z is the viewer's right), front->rear on the left side
        const [ua, ub] = sx > 0 ? [1 - u(sg.z0), 1 - u(sg.z1)] : [u(sg.z0), u(sg.z1)];
        const p = new THREE.Mesh(croppedPlane(len, H1 - H0, Math.min(ua, ub), Math.max(ua, ub), 0, 1), mo);
        // planes face outward (+x on the right, -x on the left)
        p.position.set(sx * (HW + 0.004), (H0 + H1) / 2, zc); p.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(p);
        const pin = new THREE.Mesh(croppedPlane(len, CAR.sillY - CAR.floorY + 0.8, Math.min(ua, ub), Math.max(ua, ub), 0, 1), mi);
        pin.position.set(sx * (HW - 0.078), CAR.floorY + (CAR.sillY - CAR.floorY + 0.8) / 2, zc); pin.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(pin);
        const pc = new THREE.Mesh(croppedPlane(len, 0.22, Math.min(ua, ub), Math.max(ua, ub), 0, 1), mc);
        pc.position.set(sx * (HW - 0.08), CAR.winTopY + 0.13, zc); pc.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
        group.add(pc);
      }
    });
    // kinematic body + colliders: floor, roof, ends, wall segments, sliding door leaves
    const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    const col = (hx: number, hy: number, hz: number, x: number, y: number, z: number) => this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.9), body);
    col(HW, 0.05, CAR.L / 2, 0, CAR.floorY - 0.05, 0);
    col(HW, 0.05, CAR.L / 2, 0, CAR.roofY - 0.1, 0);
    col(HW, (CAR.roofY - 0.3) / 2, 0.04, 0, (CAR.roofY - 0.3) / 2 + 0.3, -CAR.L / 2 + 0.04);
    col(HW, (CAR.roofY - 0.3) / 2, 0.04, 0, (CAR.roofY - 0.3) / 2 + 0.3, CAR.L / 2 - 0.04);
    col(HW - 0.1, 0.4, CAR.L / 2 - 0.3, 0, 0.75, 0); // underframe
    for (const sx of [-1, 1]) for (const sg of wallSegments()) col(0.03, (CAR.cantY - CAR.floorY) / 2, (sg.z1 - sg.z0) / 2, sx * (HW - 0.03), (CAR.cantY + CAR.floorY) / 2, (sg.z0 + sg.z1) / 2);
    const doors: CarRuntime['doors'] = [];
    for (const sx of [-1, 1]) for (const d of CAR.doors) for (const dir of [-1, 1]) {
      const zc = d + dir * CAR.doorW / 4;
      const leaf = new THREE.Mesh(leafGeo!, this.mats.array);
      leaf.position.set(sx * (HW - 0.06), CAR.floorY, zc);
      // the leaf carries its own crop of the side graffiti so it slides with the door
      const k = sx > 0 ? 1 : 0;
      const [ua, ub] = sx > 0 ? [1 - u(zc - CAR.doorW / 4), 1 - u(zc + CAR.doorW / 4)] : [u(zc - CAR.doorW / 4), u(zc + CAR.doorW / 4)];
      const v0 = (CAR.floorY - H0) / (H1 - H0), v1 = (CAR.doorTop - H0) / (H1 - H0);
      const gp = new THREE.Mesh(croppedPlane(CAR.doorW / 2 - 0.01, CAR.doorTop - CAR.floorY, Math.min(ua, ub), Math.max(ua, ub), v0, v1), this.overlay(sideTex[k]));
      gp.position.set(sx * 0.025, (CAR.doorTop - CAR.floorY) / 2, 0); gp.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      leaf.add(gp);
      group.add(leaf);
      const c = col(0.025, (CAR.doorTop - CAR.floorY) / 2, CAR.doorW / 4, sx * (HW - 0.06), (CAR.doorTop + CAR.floorY) / 2, zc);
      doors.push({ mesh: leaf, closedZ: zc, dir, collider: c, sx });
    }
    group.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.object.add(group);
    return { group, doors, body, s: 0 };
  }

  /** Track centreline at rail-top height (sim / interiors supply it; tunnels and stations follow it). */
  setTrack(points: { x: number; y: number; z: number }[]) {
    const pts = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.track = { pts, cum, total: cum[cum.length - 1] };
  }
  private at(s: number, out: THREE.Vector3) {
    const t = this.track!;
    const x = THREE.MathUtils.clamp(s, 0, t.total);
    let i = 1; while (i < t.cum.length - 1 && t.cum[i] < x) i++;
    const f = (x - t.cum[i - 1]) / Math.max(1e-6, t.cum[i] - t.cum[i - 1]);
    return out.lerpVectors(t.pts[i - 1], t.pts[i], f);
  }

  /** Sim drives this: head position along the track (m), doors 0 closed .. 1 open, car lights. */
  setState(s: { s: number; doorsOpen?: number; lights?: boolean }) { Object.assign(this.state, s); }

  update() {
    if (!this.track) return;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Quaternion(), m = new THREE.Matrix4();
    this.cars.forEach((car, i) => {
      const sc = this.state.s - CAR.L / 2 - i * (CAR.L + CAR.gap);
      this.at(sc - CAR.bogieZ, a); this.at(sc + CAR.bogieZ, b); // a = front bogie (further along), b = rear
      c.addVectors(a, b).multiplyScalar(0.5);
      // forward = toward the front bogie = local -Z
      m.lookAt(b, a, new THREE.Vector3(0, 1, 0));
      q.setFromRotationMatrix(m);
      car.group.position.copy(c); car.group.quaternion.copy(q);
      car.body.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z });
      car.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      // doors slide apart along the car
      const open = THREE.MathUtils.clamp(this.state.doorsOpen, 0, 1);
      for (const d of car.doors) {
        const z = d.closedZ + d.dir * open * (CAR.doorW / 2 - 0.04);
        d.mesh.position.z = z;
        d.collider.setTranslationWrtParent({ x: d.sx * (HW - 0.06), y: (CAR.doorTop + CAR.floorY) / 2, z });
      }
      car.s = sc;
    });
    (this.mats.bySlot.reverse as THREE.MeshStandardNodeMaterial).emissiveIntensity = this.state.lights ? 1.4 : 0;
    (this.mats.bySlot.headlamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = this.state.lights ? 1.6 : 0;
    (this.mats.bySlot.taillamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = 1.2;
  }

  dispose() {
    this.object.removeFromParent();
    for (const c of this.cars) this.world.removeRigidBody(c.body);
    for (const t of this.textures) t.dispose();
    for (const m of this.overlayMats) m.dispose();
    this.mats.dispose();
  }
}
