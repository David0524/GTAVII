import * as THREE from 'three/webgpu';
import RAPIER from './rapier';
import { G, groups } from '../shared/physicsGroups';
import { heroModelIfReady, requestHeroModel, type ModelAsset, type Variant } from './assets';
import type { GeneratedModel } from './gen/body';
import { createMaterialSet, type MaterialSet, type Quality } from './gen/materials';
import { buildDecals, drawPlate } from './gen/decals';
import { VehiclePhysics, type DriveInput } from './physics';
import { Emitter } from './effects';
import { ZONES, type Zone } from './gen/morphs';
import { SLOTS, angleWeightedNormals, pw } from './gen/builder';
import { FadeLOD } from './fadeLod';
import { shardsFor } from './shards';
import { shadowBake, groundPlane, shadowMaterial, headPoolGeometry, groundLightMats, groundLightLevel, type LightCandidate, type Lightable } from './lighting';
import { CLASS_MODELS, PROPOSED_CLASS_MODELS } from './registry';
import {
  type TrimTier, type Condition, type Upgrade, type Components, type Security, type Trunk, type TrunkItem, type GlassPane,
  type VehicleSave, type EngineEventType, type FailureKind,
  effectivePhysics, conditionGrade, newComponents, initialState, trunkCapacity, trunkAdd, trunkRemove, EngineSystems, tankLitres, TRIM,
} from './state';

export type VehicleEventType = 'skid' | 'impact' | 'destroyed' | 'damage' | 'engine' | 'component' | 'theft';
export interface SkidEvent { speed: number; wheels: { index: number; x: number; y: number; z: number; slip: number; locked: boolean; spinning: boolean }[] }
export interface ImpactEvent {
  vehicleId: string;
  speedChange: number; impulse: number; point: THREE.Vector3; normal: THREE.Vector3; zone: Zone; damage: number; other: RAPIER.Collider | null;
  /** Other vehicle in the collision (null for walls, posts, the ground). */
  otherVehicleId: string | null;
  /** Vehicle judged to have rammed (the one driving into the contact harder), or null. */
  attackerId: string | null;
  /** Driver ids (set by gameplay via vehicle.driverId), for crediting rams to characters. */
  attackerDriverId: string | null;
  closingSpeed: number;
}
export interface DamageEvent { damage: number; stage: DamageStage; zones: Record<Zone, number>; source: string | null }
export interface ComponentEvent { vehicleId: string; kind: 'glass' | 'tyre' | 'radiator' | 'engine' | 'fuelTank' | 'lamp' | 'part'; detail: string; source: string | null; point?: THREE.Vector3 }
export interface TheftEvent { vehicleId: string; kind: 'unlock' | 'slimJim' | 'windowSmash' | 'hotwire' | 'lock'; loud: boolean; position: THREE.Vector3 }
export interface EngineEvent { vehicleId: string; type: EngineEventType; temp: number }
export type DamageStage = 'intact' | 'dented' | 'battered' | 'smoking' | 'burning' | 'destroyed';
export type SeatId = 'driver' | 'passenger' | 'rearLeft' | 'rearRight';

/** A hit from gameplay (bullets, rams scripted by missions, fire). Point/normal in world space. */
export interface Hit {
  point: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  /** N·s for impacts; for bullets an energy-ish scale (default 1 = a .38 round). */
  impulse?: number;
  type: 'bullet' | 'impact' | 'fire';
  /** Who caused it (character or vehicle id). */
  source?: string | null;
}

export interface VehicleInit {
  id?: string;
  /** Restore a saved car exactly (see serialize()). */
  save?: VehicleSave;
  /** Start with the engine running (default true; parked traffic should pass false). */
  running?: boolean;
}

/** LOD switch distances (m) per quality. */
const LOD_DIST: Record<Quality, [number, number]> = { low: [14, 70], medium: [28, 120], high: [40, 160], ultra: [60, 220] };

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
let nextId = 1;
function vclassOf(modelId: string): string {
  for (const [c, opts] of [...Object.entries(CLASS_MODELS), ...Object.entries(PROPOSED_CLASS_MODELS)]) if (opts.some(([id]) => id === modelId)) return c;
  return 'sedan';
}
/** Collider handle -> vehicle, for attributing rams. */
const OWNER = new Map<number, Vehicle>();
export function vehicleOfCollider(c: RAPIER.Collider | null | undefined): Vehicle | null { return c ? OWNER.get(c.handle) ?? null : null; }

const MAX_HOLES = 48;
const smoothstep01 = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** How many cars besides the player get the hero mesh, per quality (phones: the player only). */
export const HERO_RING: Record<Quality, number> = { low: 0, medium: 1, high: 3, ultra: 3 };
/**
 * Give the hero mesh to the player car (priority via isPlayer) and the nearest `n` others within
 * 30 m, with hysteresis (a car leaves the ring past 38 m or when it drops two places).
 */
export function updateHeroRing(cars: readonly Vehicle[], cam: THREE.Vector3, n: number) {
  // hero meshes come from a worker (setHero returns false until ready); swapping one costs a
  // geometry upload, so promote at most one car per call
  let budget = 1;
  const ranked = cars.filter((c) => !c.isPlayer).map((c) => ({ c, d: c.object.position.distanceTo(cam) })).sort((a, b) => a.d - b.d);
  for (const c of cars) if (c.isPlayer && !c.isHero && budget > 0 && c.setHero(true)) budget--;
  ranked.forEach(({ c, d }, i) => {
    if (c.isHero) { if (d > 38 || i >= n + 1) c.setHero(false); }
    else if (d < 30 && i < n && budget > 0 && c.setHero(true)) budget--;
  });
}

/**
 * One drivable vehicle: generated mesh + raycast physics + damage + per-instance state.
 * Implements the engine contract in docs/briefs/VEHICLES_BRIEF.md and the vehicles parts of
 * CORE_SYSTEMS §5–6 and HOMES_AND_CARS §2 (gameplay branch).
 */
export class Vehicle implements Lightable {
  readonly id: string;
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

  // ---- per-instance state (persisted)
  trim: TrimTier;
  condition: Condition;
  upgrades: Upgrade[] = [];
  readonly components: Components;
  readonly security: Security;
  readonly trunk: Trunk;
  readonly engine: EngineSystems;
  plate: string;
  paint: number | null = null;
  /** Character currently driving (set by gameplay), credited in impact events. */
  driverId: string | null = null;
  /** Start the engine automatically when the driver presses the throttle (if keys or hot-wired). */
  autoStart = true;
  /** Missions: suppress random failures during scripted moments (0 = never fail on its own). */
  set failureRate(v: number) { this.engine.failureRate = v; }
  get failureRate() { return this.engine.failureRate; }

  private listeners = new Map<VehicleEventType, Set<(e: unknown) => void>>();
  private bodyMesh: THREE.Mesh;
  private hoodPivot: THREE.Group | null = null;
  private hoodAngle = 0;
  private wheelObjs: { lod: THREE.LOD; pivot: THREE.Object3D; spin: THREE.Object3D }[] = [];
  private beaconMat: THREE.MeshStandardNodeMaterial | null = null;
  private decals: ReturnType<typeof buildDecals>;
  private plateMeshes: THREE.Mesh[] = [];
  private plateTex: THREE.CanvasTexture | null = null;
  private holes: THREE.InstancedMesh;
  private holeN = 0;
  private smoke: Emitter; private fire: Emitter; private fireLight: THREE.PointLight | null = null;
  private burnT = 0; private fireHeat = 0;
  private episode = { dv: 0, applied: 0, quiet: 1, emitted: false };
  private contact = { impulse: 0, point: new THREE.Vector3(), normal: new THREE.Vector3(), other: null as RAPIER.Collider | null };
  private lights = { head: false, hazard: false, beacon: false };
  private brakeOverride: boolean | null = null;
  private t = 0;
  private lod: THREE.LOD;
  private weather = { wet: 0, rainMinutes: 999 };
  private crankCooldown = 0;
  private lastSource: string | null = null;
  // ---- ground: contact shadow + cheap light pools, laid on the road under the wheels
  private ground = new THREE.Group();
  private shadowMesh: THREE.Mesh;
  private shadowMat: THREE.MeshBasicNodeMaterial;
  private headPool: THREE.Mesh;
  private rearPool: THREE.Mesh;
  private groundY = 0; private rideH = -1;
  private real = { head: false, rear: false };
  private cand: LightCandidate = { key: '', head: null, rear: null, dist2: 0 };
  private candHead = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private candRear = { pos: new THREE.Vector3(), brake: false };
  // ---- local dents (copy-on-write clone of the shared body geometry)
  private dentGeo: { body: THREE.BufferGeometry; hood: THREE.BufferGeometry | null } | null = null;
  private dentCooldown = 0;
  private pendingDent: { p: THREE.Vector3; amount: number } | null = null;

  constructor(world: RAPIER.World, readonly scene: THREE.Object3D, readonly asset: ModelAsset, readonly variant: Variant, pose: { x: number; y: number; z: number; yaw: number }, readonly quality: Quality, init: VehicleInit = {}) {
    const spec = asset.spec;
    const save = init.save;
    this.id = save?.id ?? init.id ?? `veh${nextId++}`;
    this.modelId = spec.id;
    this.object.name = `vehicle:${spec.id}`;
    const st = initialState(spec, variant.seed);
    this.trim = save?.trim ?? st.trim;
    this.condition = save ? { ...save.condition } : st.condition;
    this.upgrades = save ? [...save.upgrades] : [];
    this.plate = save?.plate ?? st.plate;
    this.security = save ? { ...save.security } : st.security;
    this.trunk = save ? { capacity: save.trunk.capacity, items: save.trunk.items.map((i) => ({ ...i, meta: i.meta ? { ...i.meta } : undefined })) } : { capacity: trunkCapacity(spec), items: [] };
    this.components = save ? structuredClone(save.components) : newComponents(asset.lod0.wheels.length);
    this.engine = new EngineSystems(this.condition, { tankL: tankLitres(spec), fuel: st.fuel, cooling: TRIM[this.trim].cooling * (this.upgrades.includes('policeEngine') ? 1.2 : 1), seed: variant.seed * 31 + 7 });
    this.engine.on((type, info) => this.emit('engine', { vehicleId: this.id, type, temp: info?.temp ?? this.engine.temp } satisfies EngineEvent));

    const passenger = ['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi'].includes(spec.cls);
    const SEATS = [0x5a4632, 0x6a1e1e, 0x1f2a44, 0x2a2a2a, 0x8a7350, 0x3a4a2a];
    this.mats = createMaterialSet(quality, {
      paint: save?.paint ?? variant.paint, paint2: spec.paint2, roof: spec.roofColor ?? 'paint', metallic: variant.metallic, vinyl: variant.vinylColor, dirt: save?.dirt ?? variant.dirt,
      seat: SEATS[variant.seed % SEATS.length], seeThroughGlass: passenger,
    });
    // distant LODs have no cabin: they keep opaque glass
    const opaque = this.mats.array.map((mt, i) => (SLOTS[i].startsWith('glass') ? this.mats.bySlot.glass : mt));
    if (save?.paint != null) this.paint = save.paint;
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
      this.parts.hood = { mesh: hm, holder: this.hoodPivot, body: null, sag: 0 };
      lod0.add(this.hoodPivot);
    }
    for (const [name, geo] of [['bumperF', g0.bumperF], ['bumperR', g0.bumperR]] as const) {
      if (!geo) continue;
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(geo, this.mats.array);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.updateMorphTargets();
      holder.add(mesh); lod0.add(holder);
      this.parts[name] = { mesh, holder, body: null, sag: 0 };
    }
    if (g0.steering) {
      const st = g0.steering;
      this.steerPivot = new THREE.Group();
      this.steerPivot.position.set(...st.centre);
      this.steerAxis.set(...st.axis);
      this.steerMesh = new THREE.Mesh(st.geo, this.mats.array);
      this.steerMesh.position.set(-st.centre[0], -st.centre[1], -st.centre[2]);
      this.steerPivot.add(this.steerMesh); lod0.add(this.steerPivot);
    }
    g0.doors.forEach((d, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(...d.hinge);
      const mesh = new THREE.Mesh(d.geo, this.mats.array);
      mesh.position.set(-d.hinge[0], -d.hinge[1], -d.hinge[2]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.updateMorphTargets();
      pivot.add(mesh); lod0.add(pivot);
      const name = `door${i}`;
      this.parts[name] = { mesh, holder: pivot, body: null, sag: 0 };
      this.doors.push({ name, side: d.side, z0: d.z0, z1: d.z1, pivot, angle: 0, vel: 0, target: 0 });
    });
    this.decals = buildDecals(g0.decals, variant.seed, spec.cls === 'bus' ? 'bus' : spec.cls === 'garbage' ? 'garbage' : 'other');
    lod0.add(this.decals.group);
    if (g0.beacon) {
      this.beaconMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a0e0a, emissive: 0xff2010, emissiveIntensity: 0.1, roughness: 0.2 });
      const arr = this.mats.array.map((m) => (m === this.mats.bySlot.taillamp ? this.beaconMat! : m));
      lod0.add(new THREE.Mesh(g0.beacon, arr));
    }
    // plates (visible, swappable)
    {
      const commercial = !['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi'].includes(spec.cls);
      this.plateTex = new THREE.CanvasTexture(drawPlate(this.plate, { commercial }));
      this.plateTex.colorSpace = THREE.SRGBColorSpace; this.plateTex.anisotropy = 4;
      const pm = new THREE.MeshStandardNodeMaterial({ map: this.plateTex, roughness: 0.45, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      for (const p of g0.plates) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.305, 0.152), pm);
        m.position.set(...p.pos);
        m.lookAt(p.pos[0] + p.normal[0], p.pos[1] + p.normal[1], p.pos[2] + p.normal[2]);
        m.name = 'plate';
        lod0.add(m); this.plateMeshes.push(m);
      }
    }
    // bullet holes (instanced dark discs in body space)
    this.holes = new THREE.InstancedMesh(new THREE.CircleGeometry(0.012, 6), new THREE.MeshBasicNodeMaterial({ color: 0x0c0a09, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), MAX_HOLES);
    this.holes.count = 0; this.holes.frustumCulled = false;
    lod0.add(this.holes);
    // ---- LOD1 / LOD2
    const lod1 = new THREE.Mesh(g1.body, opaque);
    lod1.castShadow = true;
    if (g1.beacon) lod1.add(new THREE.Mesh(g1.beacon, this.mats.array));
    const lod2 = new THREE.Mesh(asset.lod2, opaque);
    const [d1, d2] = LOD_DIST[quality];
    this.lod = new FadeLOD();
    this.lod.addLevel(lod0, 0); this.lod.addLevel(lod1, d1); this.lod.addLevel(lod2, d2);
    this.object.add(this.lod);

    // ---- ground contact shadow + light pools
    {
      const fp = { halfW: g0.halfW, minZ: g0.minZ, maxZ: g0.maxZ, wheels: g0.wheels.map((w) => ({ x: w.x, z: w.z, r: w.r, w: w.dual ? spec.tireW * 2 + 0.04 : spec.tireW })) };
      const bake = shadowBake(spec.id, fp);
      this.shadowMat = shadowMaterial(bake.tex);
      this.shadowMesh = new THREE.Mesh(groundPlane(bake.w, bake.l, bake.cz), this.shadowMat);
      this.shadowMesh.renderOrder = -1; this.shadowMesh.name = 'contact-shadow';
      const gm = groundLightMats();
      this.headPool = new THREE.Mesh(headPoolGeometry(g0.minZ, g0.halfW), gm.head);
      this.rearPool = new THREE.Mesh(groundPlane(g0.halfW * 2 + 1.6, 2.6, g0.maxZ + 0.6), gm.tail);
      this.headPool.visible = this.rearPool.visible = false;
      this.ground.name = 'vehicle-ground';
      this.ground.add(this.shadowMesh, this.headPool, this.rearPool);
      scene.add(this.ground);
      this.cand.key = this.id;
    }

    // ---- physics (before wheels: wheel pivots follow the suspension state)
    this.physics = new VehiclePhysics(world, spec, g0, pose, effectivePhysics(spec.physics, this.trim, this.condition, this.upgrades));
    for (const c of this.physics.colliders) OWNER.set(c.handle, this);

    // ---- wheels: pivot (position, steer, flat squash) -> spin -> LOD
    for (const w of g0.wheels) {
      const pivot = new THREE.Object3D();
      const spin = new THREE.Object3D();
      const mk = (geo: THREE.BufferGeometry) => {
        const grp = new THREE.Group();
        const offs = w.dual ? [-(spec.tireW / 2 + 0.02), spec.tireW / 2 + 0.02] : [0];
        for (const o of offs) {
          const m = new THREE.Mesh(geo, this.mats.wheelArray);
          m.position.x = o * w.side;
          m.castShadow = true;
          grp.add(m);
        }
        return grp;
      };
      const wl = new FadeLOD();
      wl.addLevel(mk(w.side > 0 ? g0.wheelR : g0.wheelL), 0);
      wl.addLevel(mk(w.side > 0 ? g1.wheelR : g1.wheelL), d1);
      wl.addLevel(new THREE.Object3D(), d2);
      spin.add(wl); pivot.add(spin);
      pivot.position.set(w.x, w.y, w.z);
      this.object.add(pivot);
      this.wheelObjs.push({ lod: wl, pivot, spin });
    }

    // ---- effects in world space
    this.smoke = new Emitter(scene, 'smoke', 30);
    this.fire = new Emitter(scene, 'fire', 24);
    scene.add(this.object);

    // ---- restore / initial engine state
    if (save) this.applySave(save);
    else if (init.running !== false) { this.engine.running = true; this.engine.temp = 85; }
    this.refreshDamage(true);
    this.sync();
  }

  get body() { return this.physics.body; }
  get speed() { return this.physics.speed; }
  /** Engine rpm, 0..1 load, gear (-1 = reverse): for the audio workstream. */
  get rpm() { return this.physics.rpm; }
  get load() { return this.physics.load; }
  get gear() { return this.physics.reverse ? -1 : this.physics.gear; }
  get mileage() { return this.condition.mileage; }
  /** Shared 0–4 condition grade (derelict, worn, lived-in, kept, pristine). */
  get grade() { return conditionGrade(this.condition, this.damage); }
  get fuel() { return this.engine.fuel; }
  get temperature() { return this.engine.temp; }
  get engineRunning() { return this.engine.running; }

  /** Park: no creep, wheels held (call when the driver gets out with the engine running). */
  setParked(p: boolean) { this.physics.parked = p; }
  /**
   * Integration check: what is acting on this car right now. Lists every collider touching the
   * chassis (with its collision groups and whether it is a vehicle), the wheel states, and the
   * drivetrain modifiers. A car that accelerates slowly is usually being held by something
   * here (a character capsule left inside it, a kerb under the sills).
   */
  diagnose() {
    const ph = this.physics, world = ph.world;
    // real touching contacts only (contactPairsWith also lists pairs whose bounding boxes merely overlap,
    // which a chunk-sized trimesh always does)
    const contacts: { handle: number; membership: string; filter: string; isVehicle: boolean; fixed: boolean; points: number; depth: number; normal: number[]; y: number }[] = [];
    for (const c of ph.colliders) world.contactPairsWith(c, (o) => {
      world.contactPair(c, o, (m, flipped) => {
        const n = m.numContacts();
        if (!n) return;
        let depth = 0, y = 0;
        for (let i = 0; i < n; i++) { depth = Math.max(depth, -m.contactDist(i)); const p = m.localContactPoint1(i); if (p) y += p.y / n; }
        const nn = m.normal();
        const g = o.collisionGroups();
        contacts.push({ handle: o.handle, membership: '0x' + (g >>> 16).toString(16), filter: '0x' + (g & 0xffff).toString(16), isVehicle: !!vehicleOfCollider(o), fixed: o.parent()?.isFixed() ?? true,
          points: n, depth: +depth.toFixed(3), normal: [nn.x, nn.y, nn.z].map((x) => +((flipped ? -1 : 1) * x).toFixed(2)), y: +y.toFixed(2) });
      });
    });
    const t = ph.body.translation();
    return {
      id: this.id, model: this.modelId, mass: ph.mass, speed: ph.speed, rpm: ph.rpm, gear: ph.gear, reverse: ph.reverse, parked: ph.parked,
      bodyY: +t.y.toFixed(3), input: { ...ph.input }, power: ph.power, mods: { ...ph.mods },
      engine: { running: this.engine.running, power: this.engine.power, flooded: this.engine.flooded, temp: this.engine.temp, fuel: this.engine.fuel },
      wheels: ph.wheels.map((w) => ({
        contact: w.contact, len: +w.len.toFixed(3), load: Math.round(w.load), slip: +w.slip.toFixed(2), locked: w.locked, flat: w.flat,
        hitY: +w.point.y.toFixed(3), hitNormal: [w.normal.x, w.normal.y, w.normal.z].map((x) => +x.toFixed(2)), hitCollider: w.ground?.handle ?? null,
      })),
      chassisContacts: contacts,
    };
  }
  /**
   * Steering-wheel pose for character hand IK, in world space: rim centre, column axis (pointing at
   * the driver), the wheel's up (12 o'clock at straight-ahead), rim radius, the rim's current turn
   * (radians, same sign as the steer input, ~14:1 ratio) and the two grip points (10 and 2 o'clock,
   * turned with it). The modelled rim turns by the same amount, so hands stay on it.
   * Matches the modelled wheel in passenger cars; trucks and buses use the same layout from their seat.
   */
  steeringWheelPose() {
    const sp = this.asset.spec, d = sp.seats.driver;
    const passenger = ['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi'].includes(sp.cls);
    const local = passenger ? new THREE.Vector3(d[0], sp.beltY + 0.08, d[2] - 0.42) : new THREE.Vector3(d[0], d[1] + 0.32, d[2] - 0.45);
    const tilt = passenger ? -0.45 : -0.75; // buses and trucks: a flatter, bus-style wheel
    const qTilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
    const axisL = new THREE.Vector3(0, 0, 1).applyQuaternion(qTilt), upL = new THREE.Vector3(0, 1, 0).applyQuaternion(qTilt);
    const front = this.physics.wheels.filter((w) => w.front);
    const roadSteer = front.length ? front.reduce((a, w) => a + w.steer, 0) / front.length : 0;
    const turn = roadSteer * 14;
    const radius = passenger ? 0.19 : 0.24;
    this.object.updateMatrixWorld();
    const q = this.object.getWorldQuaternion(new THREE.Quaternion());
    const centre = this.object.localToWorld(local.clone());
    const axis = axisL.clone().applyQuaternion(q), up = upL.clone().applyQuaternion(q);
    const grip = (clock: number) => { // clock angle from 12 o'clock, clockwise as seen by the driver
      const a = clock + turn;
      const right = new THREE.Vector3().crossVectors(up, axis).normalize(); // driver's right (+x: the car faces -z)
      return centre.clone().addScaledVector(up, Math.cos(a) * radius).addScaledVector(right, Math.sin(a) * radius);
    };
    return { centre, axis, up, radius, turn, leftGrip: grip(-Math.PI / 3), rightGrip: grip(Math.PI / 3) };
  }
  /** Steering geometry for the driver assist. */
  get handling() { return { wheelbase: this.asset.spec.wheelbase, maxSteer: this.physics.p.maxSteer }; }

  setInput(i: DriveInput) {
    const inp = this.physics.input;
    inp.throttle = i.throttle; inp.brake = i.brake; inp.steer = i.steer; inp.handbrake = i.handbrake; inp.steerExtra = i.steerExtra ?? 0;
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
  /** Surface wetness 0..1 and minutes since the rain started (oily asphalt is slickest early). */
  setWetness(w: number, rainMinutes = 999) { this.mats.u.wet.value = w; this.weather.wet = w; this.weather.rainMinutes = rainMinutes; }
  /** Summer heat drives overheating; default 30 °C. */
  setAmbient(celsius: number) { this.engine.ambient = celsius; }

  // ============================================================ seats & entry points
  private seatLocal(seat: SeatId): THREE.Vector3 {
    const s = this.asset.spec.seats;
    if (seat === 'driver' || seat === 'passenger') return new THREE.Vector3(...s[seat]);
    const d = s.driver;
    return new THREE.Vector3((seat === 'rearLeft' ? -1 : 1) * Math.abs(d[0]), d[1], d[2] + 0.95);
  }
  /** Seats that exist on this model (two-door cars and trucks have no rear doors). */
  get seats(): SeatId[] {
    const c = this.asset.spec.cls;
    return ['sedan', 'police', 'compact', 'wagon', 'taxi'].includes(c) ? ['driver', 'passenger', 'rearLeft', 'rearRight'] : ['driver', 'passenger'];
  }
  seatPose(seat: SeatId): THREE.Matrix4 {
    const s = this.seatLocal(seat);
    this.object.updateMatrixWorld();
    return new THREE.Matrix4().makeTranslation(s.x, s.y, s.z).premultiply(this.object.matrixWorld);
  }
  /** Where to aim/shoot from a seat: the window opening, facing out (for drive-bys). */
  windowPose(seat: SeatId): THREE.Matrix4 {
    const s = this.seatLocal(seat);
    const side = s.x < 0 ? -1 : 1;
    const m = new THREE.Matrix4().makeRotationY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
    m.setPosition(side * (this.asset.lod0.halfW - 0.08), this.asset.spec.beltY + 0.25, s.z);
    this.object.updateMatrixWorld();
    return m.premultiply(this.object.matrixWorld);
  }
  /** World-space interaction points for the theft actions and boarding. */
  entryPoints() {
    this.object.updateMatrixWorld();
    const W = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(this.object.matrixWorld);
    const g = this.asset.lod0;
    const doors = this.seats.map((seat) => { const s = this.seatLocal(seat); const side = s.x < 0 ? -1 : 1; return { seat, side, door: W(side * (g.halfW + 0.55), 0.9, s.z), window: W(side * (g.halfW + 0.05), this.asset.spec.beltY + 0.2, s.z) }; });
    const d = this.seatLocal('driver');
    return { doors, dash: W(d.x * 0.6, d.y - 0.1, d.z - 0.55), trunk: W(0, this.asset.spec.beltY, g.maxZ + 0.5), hood: W(0, 1, g.minZ - 0.6) };
  }

  /**
   * Anchors for on-foot movement (docs/briefs/MOVEMENT.md), all in world space, refreshed per call:
   *  - doors: per seat, where to stand to open the door (on the ground, facing the car), the
   *    handle, the hinge edge, the seat, and where a carjacker stands to pull the occupant out
   *    (and the direction the victim is thrown);
   *  - surfaces: hood, roof, deck lid and cargo tops as oriented boxes with their top height and
   *    the traversal they allow: 'vault' (0.5–1.2 m), 'climb' (1.2–2.2 m) or 'none' (too high).
   *    Characters land on / vault over the box top; the physics collider is the car's own.
   */
  movementAnchors() {
    this.object.updateMatrixWorld();
    const M = this.object.matrixWorld;
    const W = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
    const q = new THREE.Quaternion().setFromRotationMatrix(M);
    const sp = this.asset.spec, g = this.asset.lod0, gh = sp.gh, mid = sp.sF + sp.wheelbase / 2;
    const ground = this.groundY; // mean wheel contact height (local y = 0 is the ground at rest)
    const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);
    const doors = this.seats.map((seat) => {
      const st = this.seatLocal(seat), side = st.x < 0 ? -1 : 1;
      const stand = W(side * (g.halfW + 0.45), 0, st.z + 0.15); stand.y = ground;
      const jack = W(side * (g.halfW + 0.75), 0, st.z + 0.35); jack.y = ground;
      const inward = new THREE.Vector3(-side, 0, 0).applyQuaternion(q);
      return {
        seat, side: side < 0 ? 'left' as const : 'right' as const,
        stand, standYaw: yawOf(inward.x, inward.z),
        handle: W(side * (g.halfW + 0.02), sp.beltY - 0.07, st.z + 0.45),
        hinge: W(side * g.halfW, sp.beltY - 0.2, st.z - 0.55),
        seatPose: this.seatPose(seat),
        carjack: { stand: jack, throwDir: new THREE.Vector3(side, 0, 0.4).normalize().applyQuaternion(q) },
        locked: this.security.locked,
        /** 0..1 door opening (null: no separate door on this model, e.g. trucks and buses). Drive it with setDoor(seat, x). */
        doorOpen: this.doorOpen(seat),
      };
    });
    const tops = (s: number) => pw(sp.top, s);
    const kind = (h: number) => { return h < 0.5 ? 'step' as const : h <= 1.2 ? 'vault' as const : h <= 2.2 ? 'climb' as const : 'none' as const; };
    const surfaces: { name: string; center: THREE.Vector3; halfExtents: THREE.Vector3; quaternion: THREE.Quaternion; top: number; kind: 'step' | 'vault' | 'climb' | 'none' }[] = [];
    const add = (name: string, s0: number, s1: number, top: number, hw: number) => {
      if (s1 - s0 < 0.25) return;
      surfaces.push({ name, center: W(0, top - 0.05, (s0 + s1) / 2 - mid), halfExtents: new THREE.Vector3(hw, 0.05, (s1 - s0) / 2), quaternion: q.clone(), top: ground + top, kind: kind(top) });
    };
    const hw = g.halfW * 0.92;
    if (!sp.cargo) add('hood', 0.1, gh.sA0 - 0.05, tops((0.1 + gh.sA0) / 2), hw);
    add('roof', gh.sA1 + 0.05, gh.sC1 - 0.05, gh.roofY + gh.crown, gh.roofHalfW);
    if (!sp.cargo && sp.cls !== 'wagon') add('deck', gh.sC0 + 0.1, sp.L - 0.08, tops((gh.sC0 + sp.L) / 2), hw);
    for (const c of sp.cargo ?? []) if (!c.dressing) add(`cargo:${c.kind}`, c.s0, c.s1, c.y1, c.hw);
    return { doors, surfaces };
  }

  // ============================================================ theft & ignition
  unlock(method: 'key' | 'slimJim' = 'key') {
    if (!this.security.locked) return;
    this.security.locked = false;
    this.emit('theft', { vehicleId: this.id, kind: method === 'key' ? 'unlock' : 'slimJim', loud: false, position: this.object.position.clone() } satisfies TheftEvent);
  }
  lock() { this.security.locked = true; this.emit('theft', { vehicleId: this.id, kind: 'lock', loud: false, position: this.object.position.clone() } satisfies TheftEvent); }
  /** Smash a window to get in: instant, loud (witnesses hear it). */
  breakWindow(pane: GlassPane = 'left') {
    this.setGlass(pane, 2, null);
    this.security.locked = false;
    this.emit('theft', { vehicleId: this.id, kind: 'windowSmash', loud: true, position: this.object.position.clone() } satisfies TheftEvent);
  }
  /** Hot-wire under the dash (the minigame is gameplay/characters'; this records success). */
  hotwire() { this.security.hotwired = true; this.emit('theft', { vehicleId: this.id, kind: 'hotwire', loud: false, position: this.object.position.clone() } satisfies TheftEvent); }
  get canStart() { return this.security.keysIn || this.security.hotwired; }
  /** Turn the key (or connect the wires). Returns false without keys/hot-wire. */
  ignition(on: boolean, opts: { key?: boolean } = {}) {
    if (!on) { this.engine.stop(); return true; }
    if (!(this.canStart || opts.key)) return false;
    if (opts.key) this.security.keysIn = true;
    this.engine.crank(this.physics.input.throttle);
    return true;
  }
  /** Missions: trigger a failure mode on cue. */
  forceFailure(kind: FailureKind) { this.engine.force(kind); }

  // ============================================================ trunk & plates
  trunkAdd(item: TrunkItem) { return trunkAdd(this.trunk, item); }
  trunkRemove(id: string, qty = 1) { return trunkRemove(this.trunk, id, qty); }
  /** Swap plates (chop shop). Visible immediately on both plates. */
  setPlate(text: string) {
    this.plate = text;
    if (this.plateTex) {
      const commercial = !['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi'].includes(this.asset.spec.cls);
      this.plateTex.image = drawPlate(text, { commercial });
      this.plateTex.needsUpdate = true;
    }
  }

  // ============================================================ garage: upgrades, respray, repair, tune
  install(u: Upgrade) { if (!this.upgrades.includes(u)) { this.upgrades.push(u); this.retune(); } }
  uninstall(u: Upgrade) { this.upgrades = this.upgrades.filter((x) => x !== u); this.retune(); }
  setTrim(t: TrimTier) { this.trim = t; this.retune(); }
  private retune() {
    const spec = this.asset.spec;
    this.physics.retune(effectivePhysics(spec.physics, this.trim, this.condition, this.upgrades));
    this.engine.cooling = TRIM[this.trim].cooling * (this.upgrades.includes('policeEngine') ? 1.2 : 1);
  }
  /** Body-shop respray (plates and the reported description stay the same). null = factory paint. */
  respray(hex: number | null) { this.paint = hex; this.mats.setPaint(hex ?? this.variant.paint); }
  /** Garage service: new shocks/tyres/brakes etc. Pass the parts to renew (default all wear items). */
  service(parts: (keyof Omit<Condition, 'mileage' | 'tyreType'>)[] = ['shocks', 'tyres', 'alignment', 'brakes', 'engine', 'radiator', 'battery']) {
    for (const p of parts) (this.condition as unknown as Record<string, number>)[p] = 0;
    this.engine.batteryCharge = 1; this.engine.coolant = 1;
    this.retune();
  }

  // ============================================================ damage
  /** Apply damage to a zone directly (scripted crashes, tests). `sev` ~1 = a 30 mph hit. */
  applyDamage(zone: Zone, sev: number, source: string | null = null) {
    if (source) this.lastSource = source;
    this.zones[zone] = Math.min(1, this.zones[zone] + sev * 0.9);
    const neighbours: Zone[] = zone === 'front' || zone === 'rear' ? ['left', 'right'] : ['front', 'rear'];
    for (const n of neighbours) this.zones[n] = Math.min(1, this.zones[n] + sev * 0.12);
    this.damage = Math.min(1, this.damage + sev * 0.45);
    this.checkPartLoss(zone, sev, source);
    const c = this.components;
    if (zone === 'front') {
      this.hurt('radiator', sev * 1.1, source); this.hurt('engine', sev * 0.3, source);
      if (this.zones.front > 0.35 && !c.headlamps) { c.headlamps = true; this.emit('component', { vehicleId: this.id, kind: 'lamp', detail: 'headlamps', source } satisfies ComponentEvent); }
      if (sev > 0.3) this.setGlass('front', Math.min(2, c.glass.front + 1) as 0 | 1 | 2, source);
    } else if (zone === 'rear') {
      this.hurt('fuelTank', sev * 0.4, source);
      if (this.zones.rear > 0.35 && !c.taillamps) { c.taillamps = true; this.emit('component', { vehicleId: this.id, kind: 'lamp', detail: 'taillamps', source } satisfies ComponentEvent); }
      if (sev > 0.35) this.setGlass('rear', 1, source);
    } else if (sev > 0.25) this.setGlass(zone, Math.min(2, c.glass[zone] + 1) as 0 | 1 | 2, source);
    this.refreshDamage();
  }

  /**
   * Gameplay damage entry point (bullets, scripted impacts, fire). Resolves what was hit from the
   * local hit point: glass panes, tyres, radiator, engine, fuel tank, lamps; bullet holes.
   */
  applyHit(hit: Hit): { component: string | null } {
    const src = hit.source ?? null;
    if (src) this.lastSource = src;
    this.object.updateMatrixWorld();
    const lp = this.object.worldToLocal(_v.set(hit.point.x, hit.point.y, hit.point.z)).clone();
    const g = this.asset.lod0, spec = this.asset.spec;
    if (hit.type === 'impact') {
      const sev = Math.max(0, (hit.impulse ?? 0) / this.physics.mass - 1.6) / 12;
      this.applyDamage(this.zoneOf(hit.point as THREE.Vector3), sev, src);
      if (sev > 0.01) this.dent(hit.point, Math.min(0.2, sev * 0.55), 0.45 + Math.min(0.45, sev * 3));
      return { component: 'body' };
    }
    if (hit.type === 'fire') {
      this.fireHeat += hit.impulse ?? 1;
      if (this.fireHeat > 6 && this.stage !== 'destroyed' && this.stage !== 'burning') { this.damage = Math.max(this.damage, 0.95); this.refreshDamage(); }
      return { component: 'fire' };
    }
    // ---- bullet
    const e = hit.impulse ?? 1;
    let comp: string | null = null;
    // tyres
    this.physics.wheels.forEach((w, i) => {
      if (comp) return;
      const cy = w.hp.y - w.len;
      if (Math.hypot(lp.x - w.hp.x, lp.y - cy, lp.z - w.hp.z) < w.r * 1.05 && Math.abs(lp.x) > Math.abs(w.hp.x) - spec.tireW) {
        comp = 'tyre';
        if (!this.components.tyresFlat[i]) { this.components.tyresFlat[i] = true; w.flat = true; this.emit('component', { vehicleId: this.id, kind: 'tyre', detail: `wheel${i}`, source: src, point: _v2.set(hit.point.x, hit.point.y, hit.point.z).clone() } satisfies ComponentEvent); }
      }
    });
    if (!comp && lp.y > spec.beltY - 0.02 && lp.y < spec.gh.roofY - 0.05) {
      // glass: which pane by where it struck
      const zc = (g.maxZ + g.minZ) / 2, ghF = spec.gh.sA0 - (spec.sF + spec.wheelbase / 2), ghR = spec.gh.sC0 - (spec.sF + spec.wheelbase / 2);
      const pane: GlassPane = lp.z < ghF + 0.45 ? 'front' : lp.z > ghR - 0.35 ? 'rear' : lp.x < 0 ? 'left' : 'right';
      void zc;
      const st = this.components.glass[pane];
      this.setGlass(pane, (st >= 1 ? 2 : 1) as 0 | 1 | 2, src, lp);
      comp = `glass:${pane}`;
    }
    if (!comp) {
      const frontAxle = g.wheels.find((w) => w.front)!.z, rearAxle = g.wheels.find((w) => !w.front)!.z;
      const engineFront = spec.cls !== 'bus';
      const inBay = engineFront ? lp.z < frontAxle + 0.5 && lp.y > 0.25 : lp.z > rearAxle;
      if (inBay) {
        if (engineFront && lp.z < frontAxle - 0.35) { this.hurt('radiator', 0.18 * e, src); comp = 'radiator'; }
        else { this.hurt('engine', 0.07 * e, src); comp = 'engine'; }
      } else if (lp.z > rearAxle - 0.2 && lp.y < 0.75 && spec.cls !== 'bus') {
        this.hurt('fuelTank', 0.22 * e, src); comp = 'fuelTank';
        // leaking tank + more rounds: rare ignition
        if (this.components.fuelTank < 0.5 && Math.random() < 0.12 * e && this.stage !== 'destroyed') { this.damage = Math.max(this.damage, 0.95); }
      }
    }
    // lamps
    if (!comp && lp.y < spec.beltY && lp.y > 0.3) {
      if (lp.z < g.minZ + 0.25 && !this.components.headlamps) { this.components.headlamps = true; comp = 'lamp'; }
      else if (lp.z > g.maxZ - 0.25 && !this.components.taillamps) { this.components.taillamps = true; comp = 'lamp'; }
      if (comp === 'lamp') this.emit('component', { vehicleId: this.id, kind: 'lamp', detail: lp.z < 0 ? 'headlamps' : 'taillamps', source: src } satisfies ComponentEvent);
    }
    // holes in the panels (not in glass or tyres)
    if (!comp?.startsWith('glass') && comp !== 'tyre') this.addHole(lp, hit.normal);
    this.damage = Math.min(1, this.damage + 0.008 * e);
    this.zones[this.zoneOf(hit.point as THREE.Vector3)] = Math.min(1, this.zones[this.zoneOf(hit.point as THREE.Vector3)] + 0.004);
    this.refreshDamage();
    return { component: comp ?? 'body' };
  }

  private addHole(lp: THREE.Vector3, nWorld?: { x: number; y: number; z: number }) {
    const i = this.holeN % MAX_HOLES; this.holeN++;
    const n = nWorld ? new THREE.Vector3(nWorld.x, nWorld.y, nWorld.z).applyQuaternion(this.object.quaternion.clone().invert()) : new THREE.Vector3(Math.sign(lp.x) || 1, 0, 0);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(0, 1, 0));
    m.setPosition(lp.x + n.x * 0.004, lp.y + n.y * 0.004, lp.z + n.z * 0.004);
    this.holes.setMatrixAt(i, m);
    this.holes.count = Math.min(MAX_HOLES, this.holeN);
    this.holes.instanceMatrix.needsUpdate = true;
  }

  private hurt(part: 'radiator' | 'engine' | 'fuelTank', amount: number, source: string | null) {
    const c = this.components;
    const before = c[part];
    c[part] = Math.max(0, c[part] - amount);
    if (before > 0.5 && c[part] <= 0.5 || before > 0 && c[part] === 0 || (before === 1 && c[part] < 1)) {
      this.emit('component', { vehicleId: this.id, kind: part, detail: c[part] === 0 ? 'destroyed' : c[part] < 0.5 ? 'badly damaged' : 'damaged', source } satisfies ComponentEvent);
    }
  }

  /** Rough centre of each pane in body space (the crack origin when no impact point is known). */
  private paneCentre(pane: GlassPane, out: THREE.Vector3) {
    const sp = this.asset.spec, gh = sp.gh, mid = sp.sF + sp.wheelbase / 2;
    const y = (sp.beltY + gh.roofY) / 2;
    if (pane === 'front') return out.set(0, y, (gh.sA0 + gh.sA1) / 2 - mid);
    if (pane === 'rear') return out.set(0, y, (gh.sC0 + gh.sC1) / 2 - mid);
    return out.set((pane === 'left' ? -1 : 1) * (this.asset.lod0.halfW - 0.08), y, (gh.sA1 + gh.sC1) / 2 - mid);
  }
  private setGlass(pane: GlassPane, state: 0 | 1 | 2, source: string | null, localPoint?: THREE.Vector3) {
    const prev = this.components.glass[pane];
    if (state <= prev) return;
    // the crack pattern radiates from the first hit on the pane
    if (prev === 0) { const h = this.mats.panes[pane].hit.value as THREE.Vector3; if (localPoint) h.copy(localPoint); else this.paneCentre(pane, h); }
    if (state === 2) {
      // shattered: tempered side glass bursts into cubes, a laminated windscreen sheds a few chips
      this.object.updateMatrixWorld();
      const at = this.object.localToWorld(this.paneCentre(pane, new THREE.Vector3()));
      const out = new THREE.Vector3(pane === 'left' ? -1 : pane === 'right' ? 1 : 0, 0, pane === 'front' ? -1 : pane === 'rear' ? 1 : 0).applyQuaternion(this.object.quaternion);
      shardsFor(this.scene).burst(at, out, this.physics.body.linvel(), this.groundY, pane === 'left' || pane === 'right' ? 70 : 18);
    }
    this.components.glass[pane] = state;
    this.mats.panes[pane].cracked.value = state >= 1 ? 1 : 0;
    this.mats.panes[pane].broken.value = state >= 2 ? 1 : 0;
    this.emit('component', { vehicleId: this.id, kind: 'glass', detail: `${pane}:${state === 2 ? 'shattered' : 'cracked'}`, source } satisfies ComponentEvent);
  }

  repair() {
    for (const z of ZONES) this.zones[z] = 0;
    this.damage = 0; this.burnT = 0; this.fireHeat = 0; this.stage = 'intact'; this.hoodAngle = 0;
    Object.assign(this.components, newComponents(this.physics.wheels.length));
    for (const w of this.physics.wheels) w.flat = false;
    for (const p of Object.values(this.mats.panes)) { p.cracked.value = 0; p.broken.value = 0; }
    this.engine.coolant = 1;
    this.mats.u.burnt.value = 0; this.mats.u.cracked.value = 0;
    this.holes.count = 0; this.holeN = 0;
    if (this.dentGeo) {
      this.dentGeo.body.dispose(); this.dentGeo.hood?.dispose();
      const base = this.baseGeo();
      this.bodyMesh.geometry = base.body;
      const hm = this.hoodPivot?.children[0] as THREE.Mesh | undefined;
      if (hm && base.hood) hm.geometry = base.hood;
      this.dentGeo = null;
    }
    this.dentLog.length = 0;
    this.pendingDent = null;
    this.reattachParts();
    this.refreshDamage();
  }

  private refreshDamage(silent = false) {
    const infl = this.bodyMesh.morphTargetInfluences!;
    ZONES.forEach((z, i) => { infl[i] = this.zones[z]; });
    const hood = this.hoodPivot?.children[0] as THREE.Mesh | undefined;
    if (hood?.morphTargetInfluences) ZONES.forEach((z, i) => { hood.morphTargetInfluences![i] = this.zones[z]; });
    for (const name of ['bumperF', 'bumperR', ...this.doors.map((d) => d.name)]) { const m = this.parts[name]?.mesh; if (m?.morphTargetInfluences) ZONES.forEach((z, i) => { m.morphTargetInfluences![i] = this.zones[z]; }); }
    this.physics.wheels.forEach((w, i) => { w.flat = this.components.tyresFlat[i]; });
    const prev = this.stage;
    if (this.stage !== 'destroyed') {
      this.stage = this.damage >= 0.95 ? 'burning' : this.damage >= 0.65 ? 'smoking' : this.damage >= 0.35 ? 'battered' : this.damage > 0.05 ? 'dented' : 'intact';
    }
    if (!silent && prev !== this.stage) this.emit('damage', { damage: this.damage, stage: this.stage, zones: { ...this.zones }, source: this.lastSource } satisfies DamageEvent);
  }

  // ============================================================ step
  /** Advance one physics step: read contacts from the last world.step(), apply forces, sync visuals. */
  update(dt: number) {
    const t0 = performance.now();
    this.t += dt;
    const ph = this.physics;

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
        const other = vehicleOfCollider(this.contact.other);
        const blame = this.blame(other);
        if (this.stage !== 'destroyed') this.applyDamage(zone, delta, blame.attackerDriverId ?? blame.attackerId);
        // local dent at the contact (accumulated over the episode, applied at most every 80 ms)
        const amt = Math.min(0.16, delta * 0.55);
        if (this.pendingDent) { this.pendingDent.amount += amt; this.pendingDent.p.lerp(this.contact.point, 0.3); }
        else this.pendingDent = { p: this.contact.point.clone(), amount: amt };
        if (!this.episode.emitted && this.episode.dv > 2) {
          this.episode.emitted = true;
          this.emit('impact', { vehicleId: this.id, speedChange: this.episode.dv, impulse: this.contact.impulse, point: this.contact.point.clone(), normal: this.contact.normal.clone(), zone, damage: this.damage, other: this.contact.other, otherVehicleId: other?.id ?? null, ...blame } satisfies ImpactEvent);
        }
      }
    } else this.episode.quiet += dt;
    this.dentCooldown -= dt;
    if (this.pendingDent && this.dentCooldown <= 0 && this.quality !== 'low') {
      const d = this.pendingDent; this.pendingDent = null;
      if (d.amount > 0.004) { this.dent(d.p, Math.min(0.2, d.amount), 0.45 + Math.min(0.45, d.amount * 3)); this.dentCooldown = 0.08; }
    }

    // ---------------------------------------------------- engine systems
    const inp = ph.input;
    if (this.stage === 'destroyed') { inp.throttle = 0; this.engine.running = false; }
    this.crankCooldown -= dt;
    if (this.autoStart && !this.engine.running && this.crankCooldown <= 0 && this.stage !== 'destroyed' && (inp.throttle > 0.1 || inp.throttle < -0.1) && this.canStart) {
      if (this.engine.batteryCharge <= 0.15 && Math.abs(ph.speed) > 3) this.engine.pushStart(Math.abs(ph.speed));
      else this.engine.crank(Math.abs(inp.throttle));
      this.crankCooldown = 2.2;
    }
    const brakePower = inp.brake * ph.p.brakeForce * ph.mass * 9.81 * Math.abs(ph.speed) / 1000;
    this.engine.update(dt, { rpm: ph.rpm, load: ph.load, speed: Math.abs(ph.speed), throttle: inp.throttle, brakePower, radiatorHealth: this.components.radiator, engineHealth: this.components.engine, fuelTankHealth: this.components.fuelTank });
    this.condition.mileage += Math.abs(ph.speed) * dt / 1609.34;

    // ---------------------------------------------------- handling modifiers: condition, damage, weather
    const radial = this.upgrades.includes('radialTyres') || this.condition.tyreType === 'radial';
    const w = this.weather.wet;
    const oil = w * Math.exp(-this.weather.rainMinutes / 6); // first minutes of a storm lift the oil
    ph.mods.mu = Math.max(0.35, 1 - w * (radial ? 0.12 : 0.22) * (1 + 0.6 * this.condition.tyres) - 0.18 * oil);
    ph.mods.brake = this.engine.brakeFade;
    const bentDir = Math.sign(this.zones.right - this.zones.left) || Math.sign(this.condition.alignment) || 1;
    const flatPull = this.components.tyresFlat.reduce((a, f, i) => a + (f && ph.wheels[i].front ? ph.wheels[i].side * 0.012 : 0), 0);
    ph.mods.steerBias = this.condition.alignment * 0.012 + Math.max(0, this.zones.front - 0.3) * 0.07 * bentDir + flatPull;
    ph.mods.engineOn = this.engine.running;
    const stagePower = this.stage === 'destroyed' ? 0 : this.damage > 0.8 ? 0.55 : this.damage > 0.6 ? 0.8 : 1;
    ph.power = this.engine.power * stagePower;

    // ---------------------------------------------------- drive
    ph.step(dt);

    // ---------------------------------------------------- skids
    let skid: SkidEvent | null = null;
    ph.wheels.forEach((wh, i) => {
      if (wh.contact && wh.slip > 2) {
        (skid ??= { speed: ph.speed, wheels: [] }).wheels.push({ index: i, x: wh.point.x, y: wh.point.y, z: wh.point.z, slip: wh.slip, locked: wh.locked, spinning: wh.spinning });
      }
    });
    if (skid) this.emit('skid', skid);

    this.sync();
    this.updateLightsAndFx(dt);
    this.updateGroundLights();
    this.updateParts(dt);
    shardsFor(this.scene).step(dt, this);
    this.stepMs = performance.now() - t0;
  }

  /** Who rammed whom: the vehicle driving into the contact harder. */
  private blame(other: Vehicle | null): { attackerId: string | null; attackerDriverId: string | null; closingSpeed: number } {
    if (!other) return { attackerId: null, attackerDriverId: null, closingSpeed: 0 };
    const a = this.physics.body.linvel(), b = other.physics.body.linvel();
    const pa = this.physics.body.translation(), pb = other.physics.body.translation();
    const d = _v2.set(pb.x - pa.x, 0, pb.z - pa.z).normalize();
    const va = a.x * d.x + a.z * d.z, vb = -(b.x * d.x + b.z * d.z);
    const att = va >= vb ? this : other;
    return { attackerId: att.id, attackerDriverId: att.driverId, closingSpeed: va + vb };
  }

  private zoneOf(p: { x: number; y: number; z: number }): Zone {
    _v.set(p.x, p.y, p.z);
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
      const o = this.wheelObjs[i];
      o.pivot.position.set(w.hp.x, w.hp.y - w.len, w.hp.z);
      o.pivot.rotation.set(0, -w.steer, 0);
      o.pivot.scale.y = w.flat ? 0.8 : 1;
      o.spin.rotation.x = -w.spin;
    });
    this.syncGround();
  }

  /** Lay the contact shadow and light pools on the road: mean wheel contact plane, body heading. */
  private syncGround() {
    const ws = this.physics.wheels;
    const b = this.physics.body;
    const t = b.translation();
    let n = 0, gy = 0;
    _n.set(0, 0, 0);
    for (const w of ws) if (w.contact) { n++; gy += w.point.y; _n.add(w.normal); }
    if (n) {
      gy /= n; _n.normalize();
      this.groundY = gy;
      const h = t.y - gy;
      this.rideH = this.rideH < 0 ? h : this.rideH + (h - this.rideH) * 0.05;
    } else _n.set(0, 1, 0);
    // airborne / rolled: fade with height above the last ground seen
    const lift = Math.max(0, t.y - this.groundY - Math.max(0, this.rideH));
    const up = _v2.set(0, 1, 0).applyQuaternion(this.object.quaternion);
    const upright = THREE.MathUtils.clamp((up.y - 0.3) / 0.5, 0, 1);
    this.shadowMat.opacity = Math.max(0, 1 - lift / 2.2) * (0.35 + 0.65 * upright);
    // basis: up = ground normal, forward = body -Z projected onto the ground
    const f = _v.set(0, 0, -1).applyQuaternion(this.object.quaternion);
    f.addScaledVector(_n, -f.dot(_n));
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    const r = _v3.crossVectors(f, _n).normalize();
    _m.makeBasis(r, _n, f.negate());
    this.ground.quaternion.setFromRotationMatrix(_m);
    // under the body origin, on the plane through the contacts
    const gyHere = n ? gy : this.groundY;
    this.ground.position.set(t.x, gyHere + 0.012, t.z);
  }

  // ============================================================ lights (see lighting.ts)
  /** Real-light request for the CarLightPool: headlamp centre + aim, rear glow. */
  lightCandidate(cam: THREE.Vector3): LightCandidate | null {
    const alive = this.stage !== 'destroyed';
    const headOn = alive && this.lights.head && !this.components.headlamps;
    const brake = alive && this.brakeLight && !this.components.taillamps;
    const tail = alive && this.lights.head && !this.components.taillamps;
    if (!headOn && !brake && !tail) return null;
    const g = this.asset.lod0;
    const c = this.cand;
    if (headOn) {
      const hs = g.lamps.head;
      let y = 0.7;
      if (hs.length) y = hs.reduce((a, p) => a + p[1], 0) / hs.length;
      this.object.localToWorld(this.candHead.pos.set(0, y, g.minZ - 0.05));
      this.object.localToWorld(this.candHead.target.set(0, y - 1.0, g.minZ - 14));
      c.head = this.candHead;
    } else c.head = null;
    if (brake || tail) {
      this.object.localToWorld(this.candRear.pos.set(0, 0.55, g.maxZ + 0.35));
      this.candRear.brake = brake;
      c.rear = this.candRear;
    } else c.rear = null;
    c.dist2 = this.object.position.distanceToSquared(cam);
    c.priority = this.driverId === 'player' || this.isPlayer ? 1 : 0;
    return c;
  }
  /** Set by gameplay / the test lot so the player's car always gets real light first. */
  isPlayer = false;
  setRealLights(head: boolean, rear: boolean) { this.real.head = head; this.real.rear = rear; this.updateGroundLights(); }
  private updateGroundLights() {
    const night = groundLightLevel();
    const alive = this.stage !== 'destroyed';
    const headOn = alive && this.lights.head && !this.components.headlamps;
    const brake = alive && this.brakeLight && !this.components.taillamps;
    const tail = alive && this.lights.head && !this.components.taillamps;
    this.headPool.visible = night > 0.02 && headOn && !this.real.head;
    this.rearPool.visible = night > 0.02 && (brake || tail) && !this.real.rear;
    const gm = groundLightMats();
    this.rearPool.material = brake ? gm.brake : gm.tail;
  }

  // ============================================================ local dents
  /**
   * Push the body in around a world-space point (on top of the zone morphs): a crater of
   * `amount` metres falling off over `radius`, with a little crumple noise. The shared asset
   * geometry is cloned on the first dent so other cars of the same model stay straight.
   */
  dent(point: { x: number; y: number; z: number }, amount: number, radius = 0.55) {
    this.object.updateMatrixWorld();
    const lp = this.object.worldToLocal(_v.set(point.x, point.y, point.z));
    const d = { x: lp.x, y: lp.y, z: lp.z, amount, radius, seed: this.variant.seed * 13.1 + this.dentLog.length * 7.7 };
    this.dentLog.push(d);
    return this.applyDent(d);
  }

  /** Base (undented) body/hood geometry for the current detail level. */
  private baseGeo() {
    const h = this.hero;
    return { body: h ? h.body : this.asset.lod0.body, hood: h ? h.hood : this.asset.lod0.hood };
  }

  private applyDent(dd: { x: number; y: number; z: number; amount: number; radius: number; seed: number }) {
    if (!this.dentGeo) {
      const base = this.baseGeo();
      const body = base.body.clone();
      this.bodyMesh.geometry = body;
      let hood: THREE.BufferGeometry | null = null;
      const hm = this.hoodPivot?.children[0] as THREE.Mesh | undefined;
      if (hm && base.hood) { hood = base.hood.clone(); hm.geometry = hood; }
      this.dentGeo = { body, hood };
    }
    const { amount, radius, seed } = dd;
    const g = this.asset.lod0;
    // push toward the body's core (horizontal mostly: cars crumple, they don't flatten)
    const core = _v2.set(0, g.height * 0.45, (g.minZ + g.maxZ) / 2);
    const dirAt = (x: number, y: number, z: number, out: THREE.Vector3) => out.set(core.x - x, (core.y - y) * 0.35, core.z - z).normalize();
    // the wheel arches hold their shape (the wheels stay outside the dent): no deformation within
    // the arch opening plus a 4 cm lip, full deformation 24 cm beyond it
    const arches = g.wheels.map((w) => ({ z: w.z, y: w.y, r: w.r, side: w.side }));
    const archHold = (x: number, y: number, z: number) => {
      let k = 1;
      for (const a of arches) {
        if (x * a.side < 0.2) continue;
        const dyz = Math.hypot(y - a.y, z - a.z);
        k = Math.min(k, smoothstep01((dyz - (a.r + 0.06)) / 0.2));
      }
      return k;
    };
    const one = (geo: THREE.BufferGeometry) => {
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const r2 = radius * radius;
      const d = _v3;
      let moved = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const dx = x - dd.x, dy = y - dd.y, dz = z - dd.z;
        const q = dx * dx + dy * dy + dz * dz;
        if (q > r2) continue;
        const f = 1 - Math.sqrt(q) / radius;
        const hold = archHold(x, y, z);
        if (hold <= 0) continue;
        const crumple = 0.75 + 0.5 * Math.sin(x * 23.7 + seed) * Math.sin(y * 19.3 - seed) * Math.sin(z * 17.9 + seed * 0.5);
        dirAt(x, y, z, d);
        const k = amount * f * f * (3 - 2 * f) * crumple * hold;
        pos.setXYZ(i, x + d.x * k, y + d.y * k, z + d.z * k);
        moved++;
      }
      if (moved) { pos.needsUpdate = true; angleWeightedNormals(geo); }
      return moved;
    };
    let moved = one(this.dentGeo.body);
    if (this.dentGeo.hood) moved += one(this.dentGeo.hood); // hood geometry is authored in body space
    return moved;
  }

  // ============================================================ hero detail (player + near ring)
  private hero: GeneratedModel | null = null;
  get isHero() { return !!this.hero; }
  /**
   * Swap LOD0 to the hero mesh (smooth curvature, 48-segment wheels with tread geometry, ~40k
   * tris) or back. Dents are replayed on the new mesh. Use updateHeroRing() rather than calling
   * this directly.
   */
  setHero(on: boolean): boolean {
    if (on === !!this.hero) return true;
    if (on) {
      // never generate on the frame: use the mesh only once the worker has delivered it
      const ready = heroModelIfReady(this.asset.spec, this.variant);
      if (!ready) { void requestHeroModel(this.asset.spec, this.variant).catch(() => undefined); return false; }
      this.hero = ready;
    } else this.hero = null;
    const g = this.hero ?? this.asset.lod0;
    if (this.dentGeo) { this.dentGeo.body.dispose(); this.dentGeo.hood?.dispose(); this.dentGeo = null; }
    this.bodyMesh.geometry = g.body;
    this.bodyMesh.updateMorphTargets();
    const hm = this.hoodPivot?.children[0] as THREE.Mesh | undefined;
    if (hm && g.hood) { hm.geometry = g.hood; hm.updateMorphTargets(); }
    for (const name of ['bumperF', 'bumperR'] as const) { const p = this.parts[name], ng = g[name]; if (p && ng) { p.mesh.geometry = ng; p.mesh.updateMorphTargets(); } }
    this.doors.forEach((d, i) => { const p = this.parts[d.name], ng = g.doors[i]?.geo; if (p && ng) { p.mesh.geometry = ng; p.mesh.updateMorphTargets(); } });
    if (this.steerMesh && g.steering) this.steerMesh.geometry = g.steering.geo;
    this.wheelObjs.forEach((o, i) => {
      const w = this.asset.lod0.wheels[i];
      const lvl = o.lod.levels[0].object;
      lvl.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).geometry = w.side > 0 ? g.wheelR : g.wheelL; });
    });
    for (const d of this.dentLog) this.applyDent(d);
    this.refreshDamage(true);
    return true;
  }
  /** Start building this car's hero mesh in the background (e.g. at spawn for the player). */
  prefetchHero() { return requestHeroModel(this.asset.spec, this.variant); }
  private dentLog: { x: number; y: number; z: number; amount: number; radius: number; seed: number }[] = [];

  // ============================================================ detachable parts (hood, bumpers)
  private parts: Record<string, { mesh: THREE.Mesh; holder: THREE.Object3D; body: RAPIER.RigidBody | null; sag: number } | undefined> = {};
  /** Doors (LOD0 passenger cars): open amount 0..1 (1 = ~70°), animated toward `target`. */
  private doors: { name: string; side: 1 | -1; z0: number; z1: number; pivot: THREE.Group; angle: number; vel: number; target: number }[] = [];
  private prevVel = new THREE.Vector3();
  private steerPivot: THREE.Group | null = null;
  private steerMesh: THREE.Mesh | null = null;
  private steerAxis = new THREE.Vector3(0, 0, 1);
  private partDebris: { mesh: THREE.Mesh; body: RAPIER.RigidBody }[] = [];
  /** Parts currently off the car. */
  get detachedParts(): string[] { return [...(this.components.detached ?? [])]; }
  /**
   * Knock a part off: it becomes a physics body (debris) that keeps the dents and paint it had.
   * `push` (world, m/s) adds to the car's velocity. Returns false if already off or not present.
   */
  detachPart(name: 'hood' | 'bumperF' | 'bumperR' | `door${number}`, push?: { x: number; y: number; z: number }, source: string | null = null): boolean {
    const part = this.parts[name];
    const list = (this.components.detached ??= []);
    if (!part || list.includes(name)) return false;
    list.push(name);
    this.object.updateMatrixWorld();
    const mesh = part.mesh;
    const geo = mesh.geometry;
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3()), half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    // debris copy in world space (the car's own mesh just hides, so repair() is trivial)
    const debris = new THREE.Mesh(geo, this.mats.array);
    debris.morphTargetInfluences = mesh.morphTargetInfluences ? [...mesh.morphTargetInfluences] : undefined;
    debris.castShadow = true;
    mesh.matrixWorld.decompose(debris.position, debris.quaternion, debris.scale);
    mesh.visible = false;
    // the plate rides on its bumper
    if (name !== 'hood') for (const pm of this.plateMeshes) if ((pm.position.z < 0) === (name === 'bumperF')) pm.visible = false;
    this.scene.add(debris);
    const lv = this.physics.body.linvel();
    const p = push ?? { x: 0, y: 0, z: 0 };
    const world = this.physics.world;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(debris.position.x, debris.position.y, debris.position.z)
      .setRotation({ x: debris.quaternion.x, y: debris.quaternion.y, z: debris.quaternion.z, w: debris.quaternion.w })
      .setLinvel(lv.x * 0.9 + p.x + (Math.random() - 0.5), lv.y + 1.5 + p.y + Math.random(), lv.z * 0.9 + p.z + (Math.random() - 0.5))
      .setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 4, z: (Math.random() - 0.5) * 6 })
      .setLinearDamping(0.1).setAngularDamping(0.4).setCanSleep(true));
    // debris hits the world and props, not cars (it starts inside this car's chassis collider).
    // It joins the PROJECTILE membership so wheel rays (WORLD|VEHICLE|PROP) roll over it instead of
    // perching the car on a flat hood.
    world.createCollider(RAPIER.ColliderDesc.cuboid(Math.max(0.03, half.x), Math.max(0.025, half.y), Math.max(0.03, half.z)).setTranslation(c.x, c.y, c.z)
      .setMass(name === 'hood' ? 22 : name.startsWith('door') ? 30 : 14).setFriction(0.6).setRestitution(0.2).setCollisionGroups(groups(G.PROJECTILE, G.WORLD | G.PROP)), body);
    this.partDebris.push({ mesh: debris, body });
    this.emit('component', { vehicleId: this.id, kind: 'part', detail: name, source, point: debris.position.clone() } satisfies ComponentEvent);
    return true;
  }
  // ---- doors: the engine's enter / exit / carjack animations drive these
  private doorFor(seat: SeatId) {
    const sl = this.seatLocal(seat), side = sl.x < 0 ? -1 : 1;
    let best: (typeof this.doors)[number] | null = null, bd = Infinity;
    for (const d of this.doors) if (d.side === side && !this.components.detached?.includes(d.name)) {
      const dz = sl.z < d.z0 ? d.z0 - sl.z : sl.z > d.z1 ? sl.z - d.z1 : 0;
      if (dz < bd) { bd = dz; best = d; }
    }
    return best;
  }
  /** Swing a seat's door toward `open` (0 closed … 1 wide, ~70°). Returns false if the car has no such door (or it is gone). */
  setDoor(seat: SeatId, open: number): boolean {
    const d = this.doorFor(seat);
    if (!d) return false;
    d.target = Math.max(0, Math.min(1, open));
    return true;
  }
  /** Current opening of a seat's door (0..1); null when there is none. */
  doorOpen(seat: SeatId): number | null { const d = this.doorFor(seat); return d ? d.angle : null; }
  /** Every door shut (e.g. after the engine's enter animation). */
  closeAllDoors() { for (const d of this.doors) d.target = 0; }
  private updateDoors(dt: number) {
    const lv = this.physics.body.linvel();
    const vel = _v4.set(lv.x, lv.y, lv.z);
    // car acceleration in its own frame: braking (+z, the car faces -z) swings front-hinged doors open,
    // cornering throws the outer door open; airflow at speed blows them shut
    const acc = vel.clone().sub(this.prevVel).divideScalar(Math.max(1e-3, dt)).applyQuaternion(_q.copy(this.object.quaternion).invert());
    this.prevVel.copy(vel);
    const speed = Math.abs(this.physics.speed);
    for (const d of this.doors) {
      if (this.components.detached?.includes(d.name)) continue;
      const zone = d.side > 0 ? 'right' : 'left';
      const unlatched = this.zones[zone] > 0.55;
      if (unlatched) {
        const push = Math.max(0, acc.z) * 0.12 + Math.max(0, -d.side * acc.x) * 0.1 - speed * speed * 0.0012;
        d.vel += (push - d.angle * 1.5 - d.vel * 1.2) * dt * 6;
        d.angle = Math.max(0, Math.min(1.05, d.angle + d.vel * dt));
        if (d.angle === 0 || d.angle === 1.05) d.vel *= -0.3; // bang against the frame / the stop
      } else {
        // animated by the engine (enter / exit), or shut
        const k = Math.min(1, dt * 5);
        d.angle += (d.target - d.angle) * k;
        d.vel = 0;
      }
      d.pivot.rotation.y = d.side * d.angle * 1.22;
    }
  }

  /** Bumpers sag with their zone's damage, then come off; the hood flies on a hard front hit. */
  private updateParts(dt: number) {
    this.updateDoors(dt);
    if (this.steerPivot) {
      // the rim turns with the road wheels (~14:1); positive steer turns it clockwise as the driver sees it
      const front = this.physics.wheels.filter((w) => w.front);
      const turn = front.length ? (front.reduce((a, w) => a + w.steer, 0) / front.length) * 14 : 0;
      this.steerPivot.quaternion.setFromAxisAngle(this.steerAxis, -turn);
    }
    for (const [name, zone] of [['bumperF', 'front'], ['bumperR', 'rear']] as const) {
      const part = this.parts[name];
      if (!part || this.components.detached?.includes(name)) continue;
      const z = this.zones[zone];
      const target = Math.max(0, (z - 0.5) / 0.3);
      part.sag += (target - part.sag) * Math.min(1, dt * 4);
      // one end drops (the side that took it), the bar twists down
      const side = Math.sign(this.zones.right - this.zones.left) || 1;
      part.holder.rotation.set((zone === 'front' ? 1 : -1) * part.sag * 0.08, 0, side * part.sag * 0.1);
      part.holder.position.y = -part.sag * 0.06;
    }
    for (const d of this.partDebris) {
      const t = d.body.translation(), r = d.body.rotation();
      d.mesh.position.set(t.x, t.y, t.z); d.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
  private checkPartLoss(zone: Zone, sev: number, source: string | null) {
    const fwd = _v4.set(0, 0, zone === 'front' ? -1 : 1).applyQuaternion(this.object.quaternion);
    if (zone === 'front' || zone === 'rear') {
      const name = zone === 'front' ? 'bumperF' : 'bumperR';
      if (this.zones[zone] > 0.82 || sev > 0.55) this.detachPart(name, { x: fwd.x * 1.5, y: 0.5, z: fwd.z * 1.5 }, source);
    }
    if (zone === 'front' && (this.zones.front > 0.9 || sev > 0.7)) this.detachPart('hood', { x: fwd.x * 0.5, y: 3, z: fwd.z * 0.5 }, source);
    if ((zone === 'left' || zone === 'right') && (this.zones[zone] > 0.88 || sev > 0.6)) {
      const side = zone === 'right' ? 1 : -1;
      const out = _v4.set(side, 0.2, 0).applyQuaternion(this.object.quaternion);
      const d = this.doors.find((x) => x.side === side && !this.components.detached?.includes(x.name));
      if (d) this.detachPart(d.name as `door${number}`, { x: out.x * 2, y: 0.8, z: out.z * 2 }, source);
    }
  }
  private reattachParts() {
    for (const d of this.partDebris) { this.physics.world.removeRigidBody(d.body); d.mesh.removeFromParent(); }
    this.partDebris = [];
    for (const pm of this.plateMeshes) pm.visible = true;
    for (const p of Object.values(this.parts)) if (p) { p.mesh.visible = true; p.sag = 0; if (p.holder !== this.hoodPivot) { p.holder.rotation.set(0, 0, 0); p.holder.position.set(0, 0, 0); } }
    if (this.components.detached) this.components.detached.length = 0;
    for (const d of this.doors) { d.angle = 0; d.vel = 0; d.target = 0; d.pivot.rotation.y = 0; }
  }

  private updateLightsAndFx(dt: number) {
    const ph = this.physics;
    const m = this.mats.bySlot;
    const c = this.components;
    const alive = this.stage !== 'destroyed';
    const blink = Math.floor(this.t * 1.6) % 2 === 0;
    (m.headlamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && !c.headlamps && this.lights.head ? 1.6 : 0;
    (m.headlamp as THREE.MeshStandardNodeMaterial).color.setHex(c.headlamps ? 0x2a2a28 : 0xd8dcdc);
    const brake = alive && this.brakeLight;
    (m.taillamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = c.taillamps || !alive ? 0 : brake ? 2.4 : this.lights.head ? 0.3 : 0;
    (m.indicator as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && this.lights.hazard && blink ? 3 : 0;
    (m.reverse as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && ph.reverse ? 2 : 0;
    for (const l of this.decals.lit) (l as THREE.MeshStandardNodeMaterial).emissiveIntensity = alive && this.lights.head ? 1.2 : 0;
    if (this.beaconMat) {
      const phase = (this.t * 2.4) % 1;
      this.beaconMat.emissiveIntensity = alive && this.lights.beacon ? (phase < 0.35 ? 6 : 0.3) : 0.05;
    }

    // hood: pops above 45% front damage, flutters with the body's vertical motion
    if (this.hoodPivot) {
      const target = this.zones.front > 0.45 ? 0.06 + this.zones.front * 0.05 : 0;
      const lv = ph.body.linvel();
      this.hoodAngle += (target - this.hoodAngle) * Math.min(1, dt * 6);
      this.hoodPivot.rotation.x = this.hoodAngle + (target > 0 ? Math.sin(this.t * 23) * 0.012 * Math.min(1, Math.abs(ph.speed) / 10) + lv.y * 0.01 : 0);
    }

    // smoke, steam & fire from the engine bay
    const g = this.asset.lod0;
    const bay = _v.set(0, g.height * 0.62, g.minZ + 0.9);
    if (this.asset.spec.cls === 'bus') bay.set(0, 1.4, g.maxZ - 1.2); // rear engine
    this.object.localToWorld(bay);
    const lv = ph.body.linvel();
    const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    let smokeRate = 0;
    this.smoke.darkness = 0;
    if (this.stage === 'smoking') { smokeRate = 6 + (this.damage - 0.65) * 40; this.smoke.darkness = THREE.MathUtils.clamp((this.damage - 0.65) / 0.3, 0, 1); }
    else if (this.engine.overheating || (this.components.radiator < 0.6 && this.engine.temp > 95)) { smokeRate = 3 + Math.max(0, this.engine.temp - 105) * 0.4; } // steam
    else if (this.components.engine < 0.5 && this.engine.running) { smokeRate = 3; this.smoke.darkness = 0.6; }
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
      this.engine.running = false;
      if (this.burnT > 10) {
        this.stage = 'destroyed';
        this.emit('destroyed', { vehicleId: this.id, modelId: this.modelId, position: this.object.position.clone(), source: this.lastSource });
        this.emit('damage', { damage: this.damage, stage: this.stage, zones: { ...this.zones }, source: this.lastSource } satisfies DamageEvent);
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

  // ============================================================ persistence
  /** Everything needed to rebuild this exact car (HOMES_AND_CARS §2). JSON-safe. */
  serialize(): VehicleSave {
    const t = this.physics.body.translation(), r = this.physics.body.rotation();
    return {
      v: 1, id: this.id, modelId: this.modelId, variant: this.variant.seed, vclass: vclassOf(this.modelId), grade: this.grade,
      trim: this.trim, condition: { ...this.condition }, upgrades: [...this.upgrades],
      paint: this.paint, dirt: this.mats.u.dirt.value as number, plate: this.plate,
      zones: { ...this.zones }, damage: this.damage, stage: this.stage, burnT: this.burnT,
      components: structuredClone(this.components),
      engine: this.engine.snapshot(),
      security: { ...this.security },
      trunk: { capacity: this.trunk.capacity, items: this.trunk.items.map((i) => ({ ...i, meta: i.meta ? { ...i.meta } : undefined })) },
      pose: { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w },
    };
  }

  private applySave(s: VehicleSave) {
    for (const z of ZONES) this.zones[z] = s.zones[z];
    this.damage = s.damage; this.stage = s.stage as DamageStage; this.burnT = s.burnT;
    this.engine.restore(s.engine);
    for (const pane of ['front', 'rear', 'left', 'right'] as GlassPane[]) {
      const st = s.components.glass[pane];
      this.mats.panes[pane].cracked.value = st >= 1 ? 1 : 0; this.mats.panes[pane].broken.value = st >= 2 ? 1 : 0;
      if (st) this.paneCentre(pane, this.mats.panes[pane].hit.value as THREE.Vector3);
    }
    for (const name of s.components.detached ?? []) {
      const p = this.parts[name as 'hood']; if (p) p.mesh.visible = false;
      if (name !== 'hood') for (const pm of this.plateMeshes) if ((pm.position.z < 0) === (name === 'bumperF')) pm.visible = false;
    }
    if (this.stage === 'destroyed') this.mats.u.burnt.value = 1; else if (this.stage === 'burning') this.mats.u.burnt.value = Math.min(1, this.burnT / 10);
    const b = this.physics.body;
    b.setTranslation({ x: s.pose.x, y: s.pose.y, z: s.pose.z }, true);
    b.setRotation({ x: s.pose.qx, y: s.pose.qy, z: s.pose.qz, w: s.pose.qw }, true);
  }

  dispose() {
    for (const c of this.physics.colliders) OWNER.delete(c.handle);
    this.object.removeFromParent();
    this.ground.removeFromParent();
    shardsFor(this.scene).release(this);
    for (const d of this.partDebris) { this.physics.world.removeRigidBody(d.body); d.mesh.removeFromParent(); }
    this.shadowMesh.geometry.dispose(); this.shadowMat.dispose();
    this.headPool.geometry.dispose(); this.rearPool.geometry.dispose();
    this.dentGeo?.body.dispose(); this.dentGeo?.hood?.dispose();
    this.smoke.dispose(); this.fire.dispose();
    this.decals.dispose();
    this.mats.dispose();
    this.beaconMat?.dispose();
    this.plateTex?.dispose();
    for (const p of this.plateMeshes) p.geometry.dispose();
    this.holes.geometry.dispose(); (this.holes.material as THREE.Material).dispose();
    this.physics.dispose();
    this.listeners.clear();
  }
}
