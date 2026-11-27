import * as THREE from 'three/webgpu';
import RAPIER from '../rapier';
import { createMaterialSet, type MaterialSet, type Quality } from '../gen/materials';
import { FadeLOD } from '../fadeLod';
import { Emitter } from '../effects';
import { vehicleOfCollider } from '../Vehicle';
import { shadowBake, groundPlane, shadowMaterial, glowTexture, additiveMaterial, groundLightLevel } from '../lighting';
import { GROUPS, G, groups } from '../../shared/physicsGroups';
import { VENDOR_SPECS, GOODS, buildVendorProp, type VendorPropId, type VendorPropSpec, type GoodsKind } from './vendorModels';
import { brandFor, type VendorBrand } from './brands';

/**
 * One entry of sim.vendorViews (sim, claude/nice-sagan-2jh4m2). `id` is the stall instance
 * (what cartHit reports); `prop` is the prop kind. State 'arriving' / 'leaving' = being pushed.
 */
export interface VendorView {
  id: string;
  prop: VendorPropId;
  cartX: number; cartZ: number; cartYaw: number;
  open: boolean;
  umbrella: boolean;
  variant: number;
  state: string;
}
export interface CartHitEvent { id: string; prop: VendorPropId; by: string | null; byVehicle?: string; speed: number }
export interface CartTippedEvent { id: string; prop: VendorPropId; position: THREE.Vector3 }
/** A shoved (not tipped) cart came to rest somewhere new: sim moves its queue (vendorCartMoved). */
export interface CartMovedEvent { id: string; prop: VendorPropId; x: number; z: number; yaw: number }
type EventMap = { cartHit: CartHitEvent; tipped: CartTippedEvent; spill: { id: string; count: number }; cartMoved: CartMovedEvent };

const LOD_DIST: Record<Quality, number> = { low: 18, medium: 30, high: 40, ultra: 55 };
const MAX_GOODS = 240;
const GOODS_LIFE = 60;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

interface Item {
  view: VendorView;
  spec: VendorPropSpec;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  object: THREE.Group;
  lod: FadeLOD;
  meshes: THREE.Mesh[];
  mats: MaterialSet;
  panels: THREE.Mesh[];
  panelTex: THREE.CanvasTexture | null;
  shadow: THREE.Mesh;
  shadowMat: THREE.MeshBasicNodeMaterial;
  /** Practical light (hot-dog and nut carts had a bare bulb): emissive bulb + ground glow. */
  bulb: { mesh: THREE.Mesh; mat: THREE.MeshStandardNodeMaterial; glow: THREE.Mesh; glowMat: THREE.MeshBasicNodeMaterial } | null;
  steam: Emitter | null;
  geoKey: string;
  brand: VendorBrand;
  stripes: number;
  kinematic: boolean;
  /** Hit by something: stop following the sim until righted or a new push cycle begins. */
  hitLock: boolean;
  tipped: boolean;
  spilled: number;
  lastMoving: boolean;
  hitCooldown: number;
  /** Last rest position reported (cartMoved) or placed by the sim. */
  rest: { x: number; z: number; yaw: number };
  restT: number;
  groundY: number;
}
interface Good { kind: GoodsKind; body: RAPIER.RigidBody; age: number }

/**
 * Street-vendor props as physics objects: pushable, knock-over, goods spill as debris.
 *   const props = factory.createVendorProps(world, scene);
 *   per frame: props.sync(sim.vendorViews); world.step(); props.update(dt);
 *   props.on('cartHit', (e) => gameplay.cartHit(e));  sim cartRighted -> props.right(id)
 */
export class VendorProps {
  readonly object = new THREE.Group();
  private items = new Map<string, Item>();
  private goods: Good[] = [];
  private goodsMeshes = new Map<GoodsKind, THREE.InstancedMesh>();
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private listeners = new Map<keyof EventMap, Set<(e: never) => void>>();
  private t = 0;

  constructor(private world: RAPIER.World, private scene: THREE.Object3D, readonly quality: Quality) {
    this.object.name = 'vendor-props';
    scene.add(this.object);
  }

  on<K extends keyof EventMap>(type: K, cb: (e: EventMap[K]) => void) {
    let s = this.listeners.get(type); if (!s) this.listeners.set(type, (s = new Set()));
    s.add(cb as (e: never) => void);
    return () => s!.delete(cb as (e: never) => void);
  }
  private emit<K extends keyof EventMap>(type: K, e: EventMap[K]) { this.listeners.get(type)?.forEach((cb) => (cb as (x: EventMap[K]) => void)(e)); }

  get count() { return this.items.size; }
  get liveGoods() { return this.goods.length; }

  // ------------------------------------------------------------------ sim sync
  /** Create / update / remove props from the sim's views (call before world.step). */
  sync(views: readonly VendorView[]) {
    const seen = new Set<string>();
    for (const v of views) {
      if (!VENDOR_SPECS[v.prop]) continue;
      seen.add(v.id);
      let it = this.items.get(v.id);
      if (!it) it = this.create(v);
      it.view = v;
      this.refreshVisuals(it);
      const moving = v.state === 'arriving' || v.state === 'leaving';
      if (moving && !it.lastMoving) it.hitLock = false; // a new push cycle: follow the sim again
      it.lastMoving = moving;
      if (it.spec.fixed) continue;
      if (moving && !it.hitLock) {
        if (!it.kinematic) this.setKinematic(it, true);
        it.groundY = this.ground(v.cartX, v.cartZ);
        _q.setFromAxisAngle(_v.set(0, 1, 0), v.cartYaw);
        it.body.setNextKinematicTranslation({ x: v.cartX, y: it.groundY, z: v.cartZ });
        it.rest = { x: v.cartX, z: v.cartZ, yaw: v.cartYaw };
        it.body.setNextKinematicRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
      } else if (it.kinematic) this.setKinematic(it, false); // parked: a dynamic body at rest
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { this.destroy(it); this.items.delete(id); }
  }

  /** After world.step(): contacts -> hits, tip-over, spilled goods, visuals. */
  update(dt: number) {
    this.t += dt;
    for (const it of this.items.values()) {
      it.hitCooldown -= dt;
      this.detectHits(it);
      // tipped over: spill everything once
      const r = it.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      const up = _v.set(0, 1, 0).applyQuaternion(_q).y;
      if (!it.tipped && up < 0.55 && !it.spec.fixed) {
        it.tipped = true;
        this.spill(it, 1);
        const p = it.body.translation();
        this.emit('tipped', { id: it.view.id, prop: it.view.prop, position: new THREE.Vector3(p.x, p.y, p.z) });
      }
      // a shoved cart that stayed upright and came to rest somewhere new: tell the sim
      const p = it.body.translation();
      if (it.hitLock && !it.tipped && !it.spec.fixed) {
        const lv = it.body.linvel();
        it.restT = Math.hypot(lv.x, lv.y, lv.z) < 0.05 ? it.restT + dt : 0;
        if (it.restT > 0.5 && Math.hypot(p.x - it.rest.x, p.z - it.rest.z) > 0.25) {
          const f = _s.set(0, 0, 1).applyQuaternion(_q);
          const yaw = Math.atan2(f.x, f.z);
          it.rest = { x: p.x, z: p.z, yaw };
          this.emit('cartMoved', { id: it.view.id, prop: it.view.prop, x: p.x, z: p.z, yaw });
        }
      }
      // visuals follow the body
      it.object.position.set(p.x, p.y, p.z);
      it.object.quaternion.copy(_q);
      // contact shadow on the ground under the prop, faded when it is lifted or on its side
      const yaw = Math.atan2(2 * (_q.w * _q.y + _q.x * _q.z), 1 - 2 * (_q.y * _q.y + _q.z * _q.z));
      it.shadow.position.set(p.x, it.groundY + 0.012, p.z);
      it.shadow.rotation.set(0, yaw, 0);
      it.shadowMat.opacity = Math.max(0, Math.min(1, (up - 0.3) / 0.6)) * Math.max(0, 1 - (p.y - it.groundY) / 1.5);
      if (it.bulb) {
        // lit after dark while the stall is open and standing (the bulb dies when it tips over)
        const night = groundLightLevel();
        const on = it.view.open && !it.tipped ? night : 0;
        it.bulb.mat.emissiveIntensity = on * 6;
        it.bulb.glow.visible = on > 0.02;
        it.bulb.glow.position.set(p.x, it.groundY + 0.014, p.z);
        it.bulb.glowMat.color.setRGB(1.0, 0.72, 0.4).multiplyScalar(0.42 * on);
      }
      if (it.steam) {
        const hot = it.view.open && !it.tipped;
        const sp = it.object.localToWorld(_v.set(0, it.spec.h + 0.1, it.view.prop === 'cart_nuts' ? -0.38 : -0.2));
        it.steam.darkness = 0;
        it.steam.update(dt, sp, hot ? 4 : 0, new THREE.Vector3());
      }
    }
    // goods: write instances, fade and remove old ones
    const counts = new Map<GoodsKind, number>();
    this.goods = this.goods.filter((g) => {
      g.age += dt;
      if (g.age > GOODS_LIFE) { this.world.removeRigidBody(g.body); return false; }
      return true;
    });
    for (const g of this.goods) {
      const mesh = this.goodsMesh(g.kind);
      const i = counts.get(g.kind) ?? 0;
      counts.set(g.kind, i + 1);
      const t = g.body.translation(), q = g.body.rotation();
      const k = g.age > GOODS_LIFE - 1 ? Math.max(0.01, GOODS_LIFE - g.age) : 1;
      _m.compose(_v.set(t.x, t.y, t.z), _q.set(q.x, q.y, q.z, q.w), _s.set(k, k, k));
      mesh.setMatrixAt(i, _m);
    }
    for (const [kind, mesh] of this.goodsMeshes) { mesh.count = counts.get(kind) ?? 0; mesh.instanceMatrix.needsUpdate = true; }
  }

  /** A character shoves a prop (from = where they stand). Above ~1.5 m/s it counts as a hit. */
  shove(id: string, from: { x: number; z: number }, impulse: number, byId: string | null = null) {
    const it = this.items.get(id);
    if (!it || it.spec.fixed) return;
    const p = it.body.translation();
    const d = _v.set(p.x - from.x, 0, p.z - from.z).normalize();
    if (it.kinematic) this.setKinematic(it, false);
    it.hitLock = true;
    it.body.applyImpulseAtPoint({ x: d.x * impulse, y: 0, z: d.z * impulse }, { x: p.x, y: p.y + it.spec.h * 0.75, z: p.z }, true);
    const speed = impulse / it.spec.mass;
    if (speed > 1.5) {
      this.emit('cartHit', { id, prop: it.view.prop, by: byId, speed });
      if (speed > 3) this.spill(it, 0.4);
    }
  }

  /** The vendor stood it back up (sim cartRighted): upright, at rest, goods restocked. */
  right(id: string) {
    const it = this.items.get(id);
    if (!it || it.spec.fixed) return;
    const r = it.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const f = _v.set(0, 0, 1).applyQuaternion(_q);
    const yaw = Math.atan2(f.x, f.z);
    const p = it.body.translation();
    it.groundY = this.ground(p.x, p.z);
    _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    it.body.setTranslation({ x: p.x, y: it.groundY, z: p.z }, true);
    it.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    it.body.setLinvel({ x: 0, y: 0, z: 0 }, true); it.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    it.tipped = false; it.spilled = 0; it.hitLock = false;
  }

  /** Character anchors in world space: where the vendor stands, the queue, the push handle. */
  anchors(id: string) {
    const it = this.items.get(id);
    if (!it) return null;
    const { w, l } = it.spec;
    it.object.updateMatrixWorld();
    const W = (x: number, y: number, z: number) => it.object.localToWorld(new THREE.Vector3(x, y, z));
    const facing = (x: number, z: number) => { const a = W(0, 0, 0), b2 = W(x, 0, z); return Math.atan2(b2.x - a.x, b2.z - a.z); };
    return {
      vendor: W(-w / 2 - 0.45, 0, 0), vendorYaw: facing(1, 0),
      queue: [0.6, 1.3, 2.0].map((d) => W(w / 2 + d, 0, 0)), queueYaw: facing(-1, 0),
      handle: W(0, 0.95, l / 2 + 0.12), pushYaw: facing(0, -1),
    };
  }

  dispose() {
    for (const it of this.items.values()) this.destroy(it);
    this.items.clear();
    for (const g of this.goods) this.world.removeRigidBody(g.body);
    this.goods = [];
    for (const m of this.goodsMeshes.values()) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    for (const g of this.geoCache.values()) g.dispose();
    this.object.removeFromParent();
  }

  // ------------------------------------------------------------------ internals
  private ground(x: number, z: number): number {
    const hit = this.world.castRay(new RAPIER.Ray({ x, y: 6, z }, { x: 0, y: -1, z: 0 }), 12, true, undefined, groups(0xffff, G.WORLD));
    return hit ? 6 - hit.timeOfImpact : 0;
  }

  private geometry(spec: VendorPropSpec, lod: 0 | 1, open: boolean, umbrella: boolean, stripes = 1) {
    const key = `${spec.id}|${lod}|${open ? 1 : 0}|${umbrella ? 1 : 0}|${stripes}`;
    let g = this.geoCache.get(key);
    if (!g) {
      g = buildVendorProp(spec, lod, open, umbrella, stripes);
      this.geoCache.set(key, g);
    }
    return { g, key };
  }

  private create(v: VendorView): Item {
    const spec = VENDOR_SPECS[v.prop];
    const brand = brandFor(v.prop, v.variant);
    // umbrella / awning stripes in the brand's colours (Narrative's umbrellaLook)
    const st = brand.stripes ?? [spec.canvas[v.variant % spec.canvas.length]];
    const mats = createMaterialSet(this.quality, {
      paint: spec.paint[v.variant % spec.paint.length], paint2: spec.paint2, roof: st.length >= 3 ? st[2] : st[1] ?? 0xf0ece0, metallic: false,
      vinyl: st[0], dirt: 0.35 + (v.variant % 3) * 0.1, seat: 0x6a1a1a,
    });
    const object = new THREE.Group();
    object.name = `vendor:${v.prop}`;
    const lod = new FadeLOD();
    const nStripes = Math.min(3, st.length);
    const l0 = new THREE.Mesh(this.geometry(spec, 0, v.open, v.umbrella, nStripes).g, mats.array);
    const l1 = new THREE.Mesh(this.geometry(spec, 1, v.open, v.umbrella, nStripes).g, mats.array);
    l0.castShadow = l1.castShadow = true; l0.receiveShadow = true;
    lod.addLevel(l0, 0); lod.addLevel(l1, LOD_DIST[this.quality]); lod.addLevel(new THREE.Object3D(), LOD_DIST[this.quality] * 4);
    object.add(lod);
    this.object.add(object);
    // brand panels on both long sides
    const panels: THREE.Mesh[] = [];
    let panelTex: THREE.CanvasTexture | null = null;
    if (spec.panel) {
      panelTex = new THREE.CanvasTexture(drawBrand(brand.lines, spec.paint2));
      panelTex.colorSpace = THREE.SRGBColorSpace; panelTex.anisotropy = 4;
      const pm = new THREE.MeshStandardNodeMaterial({ map: panelTex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      for (const sx of [1, -1]) {
        if (sx < 0 && (v.prop === 'stand_news' || v.prop.startsWith('stand_'))) continue;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(spec.panel.w, spec.panel.h), pm);
        const [px, py, pz] = spec.panel.pos;
        m.position.set(px * sx, py, pz);
        m.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
        object.add(m); panels.push(m);
      }
    }
    // contact shadow (world space, follows the body on the ground)
    const bake = shadowBake('vendor:' + spec.id, { halfW: spec.w / 2, minZ: -spec.l / 2, maxZ: spec.l / 2, wheels: [] });
    const shadowMat = shadowMaterial(bake.tex);
    const shadow = new THREE.Mesh(groundPlane(bake.w, bake.l, bake.cz), shadowMat);
    shadow.renderOrder = -1;
    this.object.add(shadow);
    // physics
    const gy = this.ground(v.cartX, v.cartZ);
    _q.setFromAxisAngle(_v.set(0, 1, 0), v.cartYaw);
    const bd = (spec.fixed ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.4).setAngularDamping(0.6).setCanSleep(true))
      .setTranslation(v.cartX, gy, v.cartZ).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w });
    const body = this.world.createRigidBody(bd);
    const cd = RAPIER.ColliderDesc.cuboid(spec.w / 2, spec.h / 2, spec.l / 2).setTranslation(0, spec.h / 2, 0)
      .setFriction(spec.wheeled ? 0.25 : 0.7).setRestitution(0.05).setCollisionGroups(GROUPS.prop)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    if (!spec.fixed) cd.setMass(spec.mass);
    const collider = this.world.createCollider(cd, body);
    const steam = ['cart_hot_dog', 'cart_nuts', 'cart_coffee'].includes(v.prop) ? new Emitter(this.scene, 'smoke', 14) : null;
    let bulb: Item['bulb'] = null;
    if (v.prop === 'cart_hot_dog' || v.prop === 'cart_nuts') {
      const mat = new THREE.MeshStandardNodeMaterial({ color: 0xfff2d0, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.2 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), mat);
      // under the umbrella on its pole (hot dog), on the chimney bracket (nuts); a cord up to it
      mesh.position.set(v.prop === 'cart_hot_dog' ? -spec.w / 2 + 0.22 : 0.0, v.prop === 'cart_hot_dog' ? 1.78 : 1.5, v.prop === 'cart_hot_dog' ? 0 : -0.38);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.25, 4), new THREE.MeshStandardNodeMaterial({ color: 0x111111 }));
      cord.position.set(0, 0.14, 0); mesh.add(cord);
      object.add(mesh);
      const glowMat = additiveMaterial(glowTexture(), 0x000000);
      const glow = new THREE.Mesh(groundPlane(4.4, 4.4, 0), glowMat);
      glow.renderOrder = -1; glow.visible = false;
      this.object.add(glow);
      bulb = { mesh, mat, glow, glowMat };
    }
    const it: Item = {
      view: v, spec, body, collider, object, lod, meshes: [l0, l1], mats, panels, panelTex, shadow, shadowMat, steam, bulb,
      geoKey: `${v.open}|${v.umbrella}`, brand, stripes: nStripes, rest: { x: v.cartX, z: v.cartZ, yaw: v.cartYaw }, restT: 0, kinematic: false, hitLock: false, tipped: false, spilled: 0, lastMoving: false, hitCooldown: 0, groundY: gy,
    };
    this.items.set(v.id, it);
    return it;
  }

  private refreshVisuals(it: Item) {
    const key = `${it.view.open}|${it.view.umbrella}`;
    if (key === it.geoKey) return;
    it.geoKey = key;
    it.meshes[0].geometry = this.geometry(it.spec, 0, it.view.open, it.view.umbrella, it.stripes).g;
    it.meshes[1].geometry = this.geometry(it.spec, 1, it.view.open, it.view.umbrella, it.stripes).g;
  }

  private setKinematic(it: Item, on: boolean) {
    it.kinematic = on;
    it.body.setBodyType(on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
  }

  private detectHits(it: Item) {
    if (it.hitCooldown > 0) return;
    this.world.contactPairsWith(it.collider, (other) => {
      if (it.hitCooldown > 0) return;
      const veh = vehicleOfCollider(other);
      if (!veh) return;
      const vl = veh.body.linvel(), cl = it.body.linvel();
      const speed = Math.hypot(vl.x - cl.x, vl.y - cl.y, vl.z - cl.z);
      if (speed < 1.0) return;
      it.hitCooldown = 0.6;
      this.emit('cartHit', { id: it.view.id, prop: it.view.prop, by: veh.driverId, byVehicle: veh.id, speed });
      if (it.spec.fixed) { this.spill(it, Math.min(1, speed / 8)); return; }
      const wasKinematic = it.kinematic;
      if (wasKinematic) this.setKinematic(it, false);
      it.hitLock = true;
      // the car saw a kinematic (immovable) cart this step: hand over its momentum as an impulse,
      // applied high so the cart tips rather than slides
      const p = it.body.translation();
      const share = Math.min(1, veh.physics.mass / (veh.physics.mass + it.spec.mass)) * 1.3;
      const j = it.spec.mass * speed * (wasKinematic ? share : 0.35);
      _v.set(vl.x - cl.x, 0, vl.z - cl.z).normalize();
      it.body.applyImpulseAtPoint({ x: _v.x * j, y: j * 0.15, z: _v.z * j }, { x: p.x, y: p.y + it.spec.h * 0.8, z: p.z }, true);
      // a bumper at hood height catches a tall, narrow cart above its centre of mass. Carts fall
      // over sideways (across their narrow base), so roll it about its own long axis, toward the
      // side the impact pushes it (stronger the faster the hit); hits below ~10 mph only shove
      if (speed > 4.5) {
        const r = it.body.rotation();
        _q.set(r.x, r.y, r.z, r.w);
        const ax = _s.set(0, 0, 1).applyQuaternion(_q); // long axis (world)
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
        const sgn = Math.sign(side.dot(_v)) || (Math.random() < 0.5 ? -1 : 1);
        const tip = it.spec.mass * it.spec.h * Math.min(1.6, speed / 5) * 2.6 * -sgn;
        it.body.applyTorqueImpulse({ x: ax.x * tip, y: (Math.random() - 0.5) * 20, z: ax.z * tip }, true);
      }
      if (speed > 3) this.spill(it, Math.min(1, speed / 10));
    });
  }

  /** Throw a fraction of the prop's goods off it as small dynamic bodies. */
  private spill(it: Item, frac: number) {
    const total = it.spec.goods.reduce((s, g) => s + g.n, 0);
    const want = Math.round(total * frac) - it.spilled;
    if (want <= 0) return;
    let n = 0;
    const lv = it.body.linvel();
    it.object.updateMatrixWorld();
    for (const g of it.spec.goods) {
      const k = Math.max(1, Math.round((g.n / total) * want));
      for (let i = 0; i < k && n < want; i++, n++) {
        if (this.goods.length >= MAX_GOODS) { const old = this.goods.shift()!; this.world.removeRigidBody(old.body); }
        const def = GOODS[g.kind];
        const lp = _v.set(g.at[0] + (Math.random() - 0.5) * 2 * g.spread[0], g.at[1] + 0.05, g.at[2] + (Math.random() - 0.5) * 2 * g.spread[1]);
        const wp = it.object.localToWorld(lp);
        const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(wp.x, wp.y, wp.z)
          .setLinvel(lv.x * 0.8 + (Math.random() - 0.5) * 2.4, 1 + Math.random() * 2, lv.z * 0.8 + (Math.random() - 0.5) * 2.4)
          .setAngvel({ x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 })
          .setLinearDamping(0.2).setAngularDamping(0.8).setCanSleep(true));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(...def.half).setMass(def.mass).setFriction(0.8).setRestitution(0.15)
          .setCollisionGroups(groups(G.PROP, G.WORLD | G.PROP | G.VEHICLE)), body);
        this.goods.push({ kind: g.kind, body, age: 0 });
      }
    }
    it.spilled += n;
    if (n) this.emit('spill', { id: it.view.id, count: n });
  }

  private goodsMesh(kind: GoodsKind) {
    let m = this.goodsMeshes.get(kind);
    if (!m) {
      const def = GOODS[kind];
      m = new THREE.InstancedMesh(def.geo(), new THREE.MeshStandardNodeMaterial({ color: def.color, roughness: 0.6 }), MAX_GOODS);
      m.count = 0; m.castShadow = true; m.frustumCulled = false; m.name = `goods:${kind}`;
      this.object.add(m);
      this.goodsMeshes.set(kind, m);
    }
    return m;
  }

  private destroy(it: Item) {
    this.world.removeRigidBody(it.body);
    it.object.removeFromParent(); it.shadow.removeFromParent();
    it.shadow.geometry.dispose(); it.shadowMat.dispose();
    it.mats.dispose(); it.panelTex?.dispose();
    for (const p of it.panels) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
    it.steam?.dispose();
    if (it.bulb) { it.bulb.mesh.geometry.dispose(); it.bulb.mat.dispose(); it.bulb.glow.removeFromParent(); it.bulb.glow.geometry.dispose(); it.bulb.glowMat.dispose(); }
  }
}

/** Invented brand panel: two lines of hand-painted-sign lettering on the accent colour. */
function drawBrand(lines: string[], accent: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d')!;
  const col = '#' + accent.toString(16).padStart(6, '0');
  g.fillStyle = '#f0e8d4'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = col; g.lineWidth = 10; g.strokeRect(6, 6, 500, 148);
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
  const [a, b] = lines;
  g.font = `bold ${b ? 64 : 84}px "League Gothic", "Arial Narrow", Impact, sans-serif`;
  g.fillText(a, 256, b ? 58 : 82, 480);
  if (b) { g.font = '600 30px Archivo, Helvetica, Arial, sans-serif'; g.fillStyle = '#2a2420'; g.fillText(b, 256, 120, 470); }
  return c;
}
