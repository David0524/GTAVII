import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { ModelAsset, Variant } from './assets';
import { createMaterialSet, type MaterialSet, type Quality } from './gen/materials';
import { buildDecals } from './gen/decals';
import { VehiclePhysics, type DriveInput } from './physics';
import { Emitter } from './effects';
import { ZONES, type Zone } from './gen/morphs';

export type VehicleEventType = 'skid' | 'impact' | 'destroyed' | 'damage';
export interface SkidEvent { speed: number; wheels: { index: number; x: number; y: number; z: number; slip: number; locked: boolean; spinning: boolean }[] }
export interface ImpactEvent { speedChange: number; impulse: number; point: THREE.Vector3; normal: THREE.Vector3; zone: Zone; damage: number; other: RAPIER.Collider | null }
export interface DamageEvent { damage: number; stage: DamageStage; zones: Record<Zone, number> }
export type DamageStage = 'intact' | 'dented' | 'battered' | 'smoking' | 'burning' | 'destroyed';

/** LOD switch distances (m) per quality. */
const LOD_DIST: Record<Quality, [number, number]> = { low: [14, 70], medium: [28, 120], high: [40, 160], ultra: [60, 220] };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/**
 * One drivable vehicle: generated mesh + raycast physics + damage. Implements the engine
 * contract in docs/briefs/VEHICLES_BRIEF.md; extra methods are optional conveniences.
 */
export class Vehicle {
  readonly object = new THREE.Group();
  readonly physics: VehiclePhysics;
  readonly mats: MaterialSet;
  readonly modelId: string;
  /** Zone damage 0..1 (drives the morph targets). */
  readonly zones: Record<Zone, number> = { front: 0, rear: 0, left: 0, right: 0 };
  damage = 0;
  stage: DamageStage = 'intact';
  /** Last physics step cost (ms), for the budget readout. */
  stepMs = 0;

  private listeners = new Map<VehicleEventType, Set<(e: unknown) => void>>();
  private bodyMesh: THREE.Mesh;
  private hoodPivot: THREE.Group | null = null;
  private hoodAngle = 0;
  private wheelObjs: { lod: THREE.LOD; pivot: THREE.Object3D }[] = [];
  private beacon: THREE.Mesh | null = null;
  private beaconMat: THREE.MeshStandardNodeMaterial | null = null;
  private decals: ReturnType<typeof buildDecals>;
  private smoke: Emitter; private fire: Emitter; private fireLight: THREE.PointLight | null = null;
  private burnT = 0; private episode = { dv: 0, applied: 0, quiet: 1, emitted: false };
  private contact = { impulse: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), other: null as RAPIER.Collider | null };
  private lights = { head: false, hazard: false, beacon: false };
  private brakeOverride: boolean | null = null;
  private t = 0;
  private headBroken = false; private tailBroken = false;
  private lod: THREE.LOD;

  constructor(world: RAPIER.World, readonly scene: THREE.Object3D, readonly asset: ModelAsset, readonly variant: Variant, pose: { x: number; y: number; z: number; yaw: number }, quality: Quality) {
    const spec = asset.spec;
    this.modelId = spec.id;
    this.object.name = `vehicle:${spec.id}`;
    this.mats = createMaterialSet(quality, {
      paint: variant.paint, paint2: spec.paint2, roof: spec.roofColor ?? 'paint', metallic: variant.metallic, vinyl: variant.vinylColor, dirt: variant.dirt,
    });
    const g0 = asset.lod0, g1 = asset.lod1;
    // ---- LOD0
    const lod0 = new THREE.Group();
    this.bodyMesh = new THREE.Mesh(g0.body, this.mats.array);
    this.bodyMesh.castShadow = true; this.bodyMesh.receiveShadow = true;
    this.bodyMesh.updateMorphTargets();
    lod0.add(this.bodyMesh);
    if (g0.hood) {
      this.hoodPivot = new THREE.Group();
      this.hoodPivot.position.set(...g0.hoodPivot);
      const hm = new THREE.Mesh(g0.hood, this.mats.array);
      hm.position.set(-g0.hoodPivot[0], -g0.hoodPivot[1], -g0.hoodPivot[2]);
      hm.castShadow = true; hm.updateMorphTargets();
      this.hoodPivot.add(hm);
      lod0.add(this.hoodPivot);
    }
    this.decals = buildDecals(g0.decals, variant.seed, spec.cls === 'bus' ? 'bus' : spec.cls === 'garbage' ? 'garbage' : 'other');
    lod0.add(this.decals.group);
    if (g0.beacon) {
      this.beaconMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a0e0a, emissive: 0xff2010, emissiveIntensity: 0.1, roughness: 0.2 });
      const chrome = this.mats.bySlot.chrome;
      const arr = this.mats.array.map((m) => (m === this.mats.bySlot.taillamp ? this.beaconMat! : m === chrome ? chrome : m));
      this.beacon = new THREE.Mesh(g0.beacon, arr);
      lod0.add(this.beacon);
    }
    // ---- LOD1 / LOD2
    const lod1 = new THREE.Mesh(g1.body, this.mats.array);
    lod1.castShadow = true;
    if (g1.beacon) lod1.add(new THREE.Mesh(g1.beacon, this.mats.array));
    const lod2 = new THREE.Mesh(asset.lod2, this.mats.array);
    const [d1, d2] = LOD_DIST[quality];
    this.lod = new THREE.LOD();
    this.lod.addLevel(lod0, 0); this.lod.addLevel(lod1, d1); this.lod.addLevel(lod2, d2);
    this.object.add(this.lod);

    // ---- physics (before wheels: wheel pivots follow the suspension state)
    this.physics = new VehiclePhysics(world, spec, g0, pose);

    // ---- wheels (LOD'd separately; hidden at LOD2 where the impostor has box wheels)
    for (const w of g0.wheels) {
      const pivot = new THREE.Object3D();
      pivot.rotation.order = 'YXZ';
      const mk = (geo: THREE.BufferGeometry) => {
        const grp = new THREE.Group();
        const offs = w.dual ? [-(spec.tireW / 2 + 0.02), spec.tireW / 2 + 0.02] : [0];
        for (const o of offs) {
          const m = new THREE.Mesh(geo, this.mats.array);
          m.position.x = o * w.side;
          m.castShadow = true;
          grp.add(m);
        }
        return grp;
      };
      const wl = new THREE.LOD();
      wl.addLevel(mk(w.side > 0 ? g0.wheelR : g0.wheelL), 0);
      wl.addLevel(mk(w.side > 0 ? g1.wheelR : g1.wheelL), d1);
      wl.addLevel(new THREE.Object3D(), d2);
      pivot.add(wl);
      pivot.position.set(w.x, w.y, w.z);
      this.object.add(pivot);
      this.wheelObjs.push({ lod: wl, pivot });
    }

    // ---- effects in world space
    this.smoke = new Emitter(scene, 'smoke', 30);
    this.fire = new Emitter(scene, 'fire', 24);
    scene.add(this.object);
    this.sync();
  }

  get body() { return this.physics.body; }
  get speed() { return this.physics.speed; }

  setInput(i: DriveInput) {
    const inp = this.physics.input;
    inp.throttle = i.throttle; inp.brake = i.brake; inp.steer = i.steer; inp.handbrake = i.handbrake;
  }

  on(type: VehicleEventType, cb: (e: unknown) => void) {
    let s = this.listeners.get(type);
    if (!s) this.listeners.set(type, (s = new Set()));
    s.add(cb);
    return () => s!.delete(cb);
  }
  private emit(type: VehicleEventType, e: unknown) { this.listeners.get(type)?.forEach((cb) => cb(e)); }

  /** Optional: headlights / hazard flashers / police beacon. */
  setLights(o: Partial<{ head: boolean; hazard: boolean; beacon: boolean }>) { Object.assign(this.lights, o); }
  /** Optional: force the brake lights (AI parked etc.); null = follow the brake input. */
  set brakeLight(v: boolean | null) { this.brakeOverride = v; }
  get brakeLight(): boolean { return this.brakeOverride ?? (this.physics.input.brake > 0.05 && !this.physics.reverse); }
  /** Optional: 0..1 surface wetness (rain streaks on the glass). */
  setWetness(w: number) { this.mats.u.wet.value = w; }

  seatPose(seat: 'driver' | 'passenger'): THREE.Matrix4 {
    const s = this.asset.spec.seats[seat];
    this.object.updateMatrixWorld();
    return new THREE.Matrix4().makeTranslation(s[0], s[1], s[2]).premultiply(this.object.matrixWorld);
  }

  /** Apply damage to a zone directly (scripted crashes, tests). `sev` ~1 = a 30 mph hit. */
  applyDamage(zone: Zone, sev: number) {
    this.zones[zone] = Math.min(1, this.zones[zone] + sev * 0.9);
    const neighbours: Zone[] = zone === 'front' || zone === 'rear' ? ['left', 'right'] : ['front', 'rear'];
    for (const n of neighbours) this.zones[n] = Math.min(1, this.zones[n] + sev * 0.12);
    this.damage = Math.min(1, this.damage + sev * 0.45);
    this.refreshDamage();
  }

  repair() {
    for (const z of ZONES) this.zones[z] = 0;
    this.damage = 0; this.burnT = 0; this.stage = 'intact'; this.headBroken = this.tailBroken = false;
    this.mats.u.burnt.value = 0; this.mats.u.cracked.value = 0; this.physics.power = 1; this.hoodAngle = 0;
    this.refreshDamage();
  }

  private refreshDamage() {
    const infl = this.bodyMesh.morphTargetInfluences!;
    ZONES.forEach((z, i) => { infl[i] = this.zones[z]; });
    const hood = this.hoodPivot?.children[0] as THREE.Mesh | undefined;
    if (hood?.morphTargetInfluences) ZONES.forEach((z, i) => { hood.morphTargetInfluences![i] = this.zones[z]; });
    if (this.zones.front > 0.35) this.headBroken = true;
    if (this.zones.rear > 0.35) this.tailBroken = true;
    if (this.damage > 0.4 || Math.max(this.zones.front, this.zones.left, this.zones.right) > 0.6) this.mats.u.cracked.value = 1;
    const prev = this.stage;
    if (this.stage !== 'destroyed') {
      this.stage = this.damage >= 0.95 ? 'burning' : this.damage >= 0.65 ? 'smoking' : this.damage >= 0.35 ? 'battered' : this.damage > 0.05 ? 'dented' : 'intact';
    }
    this.physics.power = this.stage === 'destroyed' ? 0 : this.damage > 0.8 ? 0.55 : this.damage > 0.6 ? 0.8 : 1;
    if (prev !== this.stage) this.emit('damage', { damage: this.damage, stage: this.stage, zones: { ...this.zones } } satisfies DamageEvent);
  }

  /** Advance one physics step: read contacts from the last world.step(), apply forces, sync visuals. */
  update(dt: number) {
    const t0 = performance.now();
    this.t += dt;
    const ph = this.physics;
    if (this.stage === 'destroyed') { ph.input.throttle = 0; }

    // ---------------------------------------------------- impacts (contact impulses from last step)
    ph.sampleContacts(this.contact);
    const dvStep = this.contact.impulse / ph.mass;
    if (dvStep > 0.3) {
      if (this.episode.quiet > 0.2) { this.episode.dv = 0; this.episode.applied = 0; this.episode.emitted = false; }
      this.episode.quiet = 0;
      this.episode.dv += dvStep;
      const sev = Math.max(0, this.episode.dv - 1.6) / 12;
      const delta = sev - this.episode.applied;
      if (delta > 0.002) {
        this.episode.applied = sev;
        const zone = this.zoneOf(this.contact.point);
        if (this.stage !== 'destroyed') this.applyDamage(zone, delta);
        if (!this.episode.emitted && this.episode.dv > 2) {
          this.episode.emitted = true;
          this.emit('impact', { speedChange: this.episode.dv, impulse: this.contact.impulse, point: this.contact.point.clone(), normal: this.contact.normal.clone(), zone, damage: this.damage, other: this.contact.other } satisfies ImpactEvent);
        }
      }
    } else this.episode.quiet += dt;

    // ---------------------------------------------------- drive
    ph.step(dt);

    // ---------------------------------------------------- skids
    let skid: SkidEvent | null = null;
    ph.wheels.forEach((w, i) => {
      if (w.contact && w.slip > 2) {
        (skid ??= { speed: ph.speed, wheels: [] }).wheels.push({ index: i, x: w.point.x, y: w.point.y, z: w.point.z, slip: w.slip, locked: w.locked, spinning: w.spinning });
      }
    });
    if (skid) this.emit('skid', skid);

    this.sync();
    this.updateLightsAndFx(dt);
    this.stepMs = performance.now() - t0;
  }

  private zoneOf(p: THREE.Vector3): Zone {
    _v.copy(p);
    this.object.worldToLocal(_v);
    const g = this.asset.lod0;
    const zc = (g.minZ + g.maxZ) / 2, hl = (g.maxZ - g.minZ) / 2;
    const fz = (_v.z - zc) / hl, fx = _v.x / g.halfW;
    if (Math.abs(fz) > 0.62 && Math.abs(fz) * 1.1 > Math.abs(fx)) return fz < 0 ? 'front' : 'rear';
    return fx > 0 ? 'right' : 'left';
  }

  private sync() {
    const b = this.physics.body;
    const t = b.translation(), r = b.rotation();
    this.object.position.set(t.x, t.y, t.z);
    this.object.quaternion.set(r.x, r.y, r.z, r.w);
    this.physics.wheels.forEach((w, i) => {
      const o = this.wheelObjs[i].pivot;
      o.position.set(w.hp.x, w.hp.y - w.len, w.hp.z);
      o.rotation.set(-w.spin, -w.steer, 0);
    });
  }

  private updateLightsAndFx(dt: number) {
    const ph = this.physics;
    const m = this.mats.bySlot;
    const alive = this.stage !== 'destroyed';
    const blink = Math.floor(this.t * 1.6) % 2 === 0;
    (m.headlamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && !this.headBroken && this.lights.head ? 1.6 : 0;
    (m.headlamp as THREE.MeshStandardNodeMaterial).color.setHex(this.headBroken ? 0x2a2a28 : 0xe8e4d8);
    const brake = alive && this.brakeLight;
    (m.taillamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = this.tailBroken || !alive ? 0 : brake ? 2.4 : this.lights.head ? 0.3 : 0;
    (m.indicator as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && this.lights.hazard && blink ? 3 : 0;
    (m.reverse as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && ph.reverse ? 2 : 0;
    for (const l of this.decals.lit) (l as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && this.lights.head ? 1.2 : 0;
    if (this.beaconMat) {
      const phase = (this.t * 2.4) % 1;
      this.beaconMat.emissiveIntensity = alive && this.lights.beacon ? (phase < 0.35 ? 6 : 0.3) : 0.05;
      if (this.beacon) this.beacon.rotation.y = this.t * 8;
    }

    // hood: pops above 45% front damage, flutters with the body's vertical motion
    if (this.hoodPivot) {
      const target = this.zones.front > 0.45 ? 0.06 + this.zones.front * 0.05 : 0;
      const lv = ph.body.linvel();
      this.hoodAngle += (target - this.hoodAngle) * Math.min(1, dt * 6);
      this.hoodPivot.rotation.x = this.hoodAngle + (target > 0 ? Math.sin(this.t * 23) * 0.012 * Math.min(1, Math.abs(ph.speed) / 10) + lv.y * 0.01 : 0);
    }

    // smoke & fire from the engine bay
    const g = this.asset.lod0;
    const bay = _v.set(0, g.height * 0.62, g.minZ + 0.9);
    if (this.asset.spec.cls === 'bus') bay.set(0, 1.4, g.maxZ - 1.2); // rear engine
    this.object.localToWorld(bay);
    const lv = ph.body.linvel();
    const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    let smokeRate = 0;
    if (this.stage === 'smoking') { smokeRate = 6 + (this.damage - 0.65) * 40; this.smoke.darkness = THREE.MathUtils.clamp((this.damage - 0.65) / 0.3, 0, 1); }
    else if (this.zones.front > 0.6 && this.stage === 'battered') { smokeRate = 4; this.smoke.darkness = 0; } // radiator steam
    if (this.stage === 'burning' || this.stage === 'destroyed') { smokeRate = this.stage === 'burning' ? 14 : 3; this.smoke.darkness = 1; }
    this.smoke.update(dt, bay, smokeRate, vel);
    const burning = this.stage === 'burning';
    this.fire.update(dt, bay, burning ? 28 : 0, vel);
    if (burning) {
      if (!this.fireLight) { this.fireLight = new THREE.PointLight(0xff7a2a, 0, 12, 2); this.object.add(this.fireLight); }
      this.fireLight.position.set(0, g.height * 0.7, g.minZ + 0.9);
      this.fireLight.intensity = 30 + Math.sin(this.t * 31) * 8 + Math.sin(this.t * 13) * 6;
      this.burnT += dt;
      this.mats.u.burnt.value = Math.min(1, this.burnT / 10);
      if (this.burnT > 10) {
        this.stage = 'destroyed';
        this.physics.power = 0;
        this.emit('destroyed', { modelId: this.modelId, position: this.object.position.clone() });
        this.emit('damage', { damage: this.damage, stage: this.stage, zones: { ...this.zones } } satisfies DamageEvent);
      }
    } else if (this.fireLight) { this.fireLight.removeFromParent(); this.fireLight.dispose(); this.fireLight = null; }
  }

  /** Teleport (tests / respawn). */
  setPose(p: { x: number; y: number; z: number; yaw: number }) {
    const b = this.physics.body;
    _q.setFromAxisAngle(_v.set(0, 1, 0), p.yaw);
    b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    b.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.sync();
  }

  dispose() {
    this.object.removeFromParent();
    this.smoke.dispose(); this.fire.dispose();
    this.decals.dispose();
    this.mats.dispose();
    this.beaconMat?.dispose();
    this.physics.dispose();
    this.listeners.clear();
  }
}
