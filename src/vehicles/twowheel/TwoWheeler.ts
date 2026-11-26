import * as THREE from 'three/webgpu';
import RAPIER from '../rapier';
import { createMaterialSet, type MaterialSet, type Quality } from '../gen/materials';
import { drawPlate } from '../gen/decals';
import { rng } from '../gen/rng';
import type { DriveInput } from '../physics';
import { buildBike, type BikeSpec, type BikeGeometry } from './bikes';
import { GROUPS } from '../../shared/physicsGroups';
import { WHEEL_RAY_GROUPS } from '../physics';

export interface CrashEvent {
  vehicleId: string;
  cause: 'impact' | 'lowside' | 'highside' | 'shot';
  /** World-space rider hand-off for the characters stream's ragdoll. */
  riderPosition: THREE.Vector3; riderVelocity: THREE.Vector3;
  speed: number;
  source: string | null;
}
export interface TwoWheelerSave {
  v: 1; kind: 'twoWheeler'; id: string; modelId: string; variant: number; paint: number; plate: string;
  damage: number; crashed: boolean; flat: boolean[]; mileage: number;
  pose: { x: number; y: number; z: number; qx: number; qy: number; qz: number; qw: number };
}

const G = 9.81;
const RIDER_KG = 78;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
let nextId = 1;
const geoCache = new Map<string, [BikeGeometry, BikeGeometry]>();
function geometry(s: BikeSpec): [BikeGeometry, BikeGeometry] {
  let g = geoCache.get(s.id);
  if (!g) geoCache.set(s.id, (g = [buildBike(s, 0), buildBike(s, 1)]));
  return g;
}

/**
 * Motorcycles, bicycles and the carrier trike. Balance is not simulated as an inverted pendulum
 * (unplayable on a phone); the body is kept upright by locking roll and pitch, while yaw follows
 * bicycle kinematics limited by tyre grip. Lean and pitch are visual, from the cornering and
 * suspension state. Losing grip or a hard hit makes it crash: rotations unlock, the machine falls,
 * and a 'crash' event hands the rider to the characters stream's ragdoll.
 */
export class TwoWheeler {
  readonly id: string;
  readonly object = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly mats: MaterialSet;
  readonly modelId: string;
  readonly input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  speed = 0;
  damage = 0;
  crashed = false;
  mileage = 0;
  plate: string;
  paint: number;
  driverId: string | null = null;
  readonly flat: boolean[];
  stepMs = 0;
  /** Visual lean (rad, + = right) and steer angle (rad). */
  lean = 0; steerAngle = 0;

  private listeners = new Map<string, Set<(e: unknown) => void>>();
  private visual = new THREE.Group(); // lean & pitch
  private steerNode = new THREE.Group();
  private wheelNodes: { pivot: THREE.Object3D; spin: THREE.Object3D; front: boolean }[] = [];
  private spin = 0; private slipT = 0; private t = 0;
  private beaconMat: THREE.MeshStandardNodeMaterial | null = null;
  private lights = { head: false, beacon: false };
  private g: BikeGeometry;
  private plateTex: THREE.CanvasTexture | null = null;
  private contactJ = 0; private prevSpeed = 0; private prevVel = new THREE.Vector3();

  constructor(private world: RAPIER.World, readonly scene: THREE.Object3D, readonly spec: BikeSpec, readonly variant: number, pose: { x: number; y: number; z: number; yaw: number }, quality: Quality, init: { id?: string; save?: TwoWheelerSave } = {}) {
    const save = init.save;
    this.id = save?.id ?? init.id ?? `bike${nextId++}`;
    this.modelId = spec.id;
    const r = rng((variant + 11) * 7919);
    this.paint = save?.paint ?? spec.palette[Math.floor(r() * spec.palette.length)];
    this.plate = save?.plate ?? `${Math.floor(r() * 9000 + 1000)}-M${'ABCDEFGHJK'[Math.floor(r() * 10)]}`;
    this.mats = createMaterialSet(quality, { paint: this.paint, paint2: spec.paint2, roof: 'paint', metallic: false, vinyl: 0x141414, dirt: 0.25 + r() * 0.4 });
    const [g0] = geometry(spec);
    this.g = g0;
    this.flat = save ? [...save.flat] : g0.wheels.map(() => false);

    // ---- visuals: object (body frame) -> visual (lean/pitch about the ground line) -> parts
    this.object.name = `bike:${spec.id}`;
    this.object.add(this.visual);
    this.visual.add(new THREE.Mesh(g0.body, this.mats.array));
    this.steerNode.position.set(...g0.steerPivot);
    const sm = new THREE.Mesh(g0.steer, this.mats.array);
    sm.position.set(-g0.steerPivot[0], -g0.steerPivot[1], -g0.steerPivot[2]);
    this.steerNode.add(sm);
    this.visual.add(this.steerNode);
    for (const w of g0.wheels) {
      const pivot = new THREE.Object3D(), spinN = new THREE.Object3D();
      spinN.add(new THREE.Mesh(g0.wheel, this.mats.array));
      pivot.add(spinN);
      pivot.position.set(w.x, w.y, w.z);
      // single front wheels hang from the steering assembly
      if (w.front && spec.cls !== 'tricycle') { pivot.position.sub(new THREE.Vector3(...g0.steerPivot)); this.steerNode.add(pivot); } else this.visual.add(pivot);
      this.wheelNodes.push({ pivot, spin: spinN, front: w.front });
    }
    if (g0.beacon) {
      this.beaconMat = new THREE.MeshStandardNodeMaterial({ color: 0x8a0e0a, emissive: 0xff2010, emissiveIntensity: 0.1, roughness: 0.2 });
      this.visual.add(new THREE.Mesh(g0.beacon, this.mats.array.map((m) => (m === this.mats.bySlot.taillamp ? this.beaconMat! : m))));
    }
    if (g0.plate) {
      this.plateTex = new THREE.CanvasTexture(drawPlate(this.plate));
      this.plateTex.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.1), new THREE.MeshStandardNodeMaterial({ map: this.plateTex, roughness: 0.45 }));
      pm.position.set(...g0.plate.pos); pm.lookAt(g0.plate.pos[0], g0.plate.pos[1], g0.plate.pos[2] + 1);
      this.visual.add(pm);
    }
    this.object.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

    // ---- physics: upright body (roll & pitch locked), box collider, rider mass included
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pose.x, pose.y, pose.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .enabledRotations(false, true, false).setLinearDamping(0.02).setAngularDamping(1.5).setCcdEnabled(true).setCanSleep(true));
    const len = g0.maxZ - g0.minZ;
    const cd = RAPIER.ColliderDesc.cuboid(g0.halfW * 0.6, 0.35, len / 2 - 0.05).setTranslation(0, 0.65, 0).setFriction(0.5).setRestitution(0.05).setCollisionGroups(GROUPS.vehicle);
    cd.setMassProperties(spec.mass + RIDER_KG, { x: 0, y: 0.1, z: 0 }, { x: 40, y: 40, z: 15 }, { x: 0, y: 0, z: 0, w: 1 });
    this.collider = world.createCollider(cd, this.body);
    if (save) this.applySave(save);
    scene.add(this.object);
    this.sync();
  }

  on(type: 'crash' | 'skid' | 'impact' | 'damage' | 'destroyed', cb: (e: unknown) => void) {
    let s = this.listeners.get(type); if (!s) this.listeners.set(type, (s = new Set())); s.add(cb);
    return () => s!.delete(cb);
  }
  private emit(type: string, e: unknown) { this.listeners.get(type)?.forEach((cb) => cb(e)); }
  setInput(i: DriveInput) { Object.assign(this.input, i); }
  setLights(o: Partial<{ head: boolean; beacon: boolean }>) { Object.assign(this.lights, o); }
  seatPose(seat: 'driver' | 'passenger') {
    const s = this.spec.seats[seat] ?? this.spec.seats.driver;
    this.object.updateMatrixWorld();
    return new THREE.Matrix4().makeTranslation(s[0], s[1], s[2]).premultiply(this.visual.matrixWorld);
  }

  /** Bullets: a tyre goes flat (and a moving bike goes down), or it's body damage. */
  applyHit(hit: { point: { x: number; y: number; z: number }; type: 'bullet' | 'impact' | 'fire'; source?: string | null; impulse?: number }) {
    this.object.updateMatrixWorld();
    const lp = this.object.worldToLocal(_v.set(hit.point.x, hit.point.y, hit.point.z));
    let comp = 'body';
    this.g.wheels.forEach((w, i) => { if (Math.hypot(lp.y - w.y, lp.z - w.z) < this.spec.wheelR * 1.1 && Math.abs(lp.x - w.x) < 0.2) { this.flat[i] = true; comp = 'tyre'; } });
    this.damage = Math.min(1, this.damage + (hit.type === 'bullet' ? 0.05 : 0.2));
    if (comp === 'tyre' && Math.abs(this.speed) > 6 && !this.crashed) this.crash(this.spec.cls === 'motorcycle' ? 'highside' : 'lowside', hit.source ?? null);
    this.emit('damage', { vehicleId: this.id, damage: this.damage, component: comp, source: hit.source ?? null });
    return { component: comp };
  }

  /** Put it back on its wheels (rider picks the bike up). */
  rightUp() {
    if (!this.crashed) return;
    this.crashed = false;
    const t = this.body.translation();
    const yaw = new THREE.Euler().setFromQuaternion(this.object.quaternion, 'YXZ').y;
    _q.setFromAxisAngle(_v.set(0, 1, 0), yaw);
    this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.body.setTranslation({ x: t.x, y: t.y + 0.3, z: t.z }, true);
    this.body.setEnabledRotations(false, true, false, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  private crash(cause: CrashEvent['cause'], source: string | null) {
    if (this.crashed) return;
    this.crashed = true;
    // the rider keeps the pre-impact velocity (thrown over the bars into whatever stopped the bike)
    const pv = this.prevVel;
    const seat = new THREE.Vector3().setFromMatrixPosition(this.seatPose('driver'));
    this.emit('crash', { vehicleId: this.id, cause, riderPosition: seat, riderVelocity: new THREE.Vector3(pv.x, pv.y + (cause === 'highside' ? 3 : 1), pv.z), speed: pv.length(), source } satisfies CrashEvent);
    // let it fall: unlock rotations, tip toward the lean side
    this.body.setEnabledRotations(true, true, true, true);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
    const side = this.lean >= 0 ? 1 : -1;
    this.body.applyTorqueImpulse({ x: fwd.x * side * -40, y: 0, z: fwd.z * side * -40 }, true);
    this.lean = 0; this.visual.rotation.set(0, 0, 0);
  }

  update(dt: number) {
    const t0 = performance.now();
    this.t += dt;
    const s = this.spec, body = this.body;
    const tr = body.translation(), rot = body.rotation();
    _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(_q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(_q);
    const lv = body.linvel();
    const vel = new THREE.Vector3(lv.x, lv.y, lv.z);
    this.speed = vel.dot(fwd);
    const m = s.mass + RIDER_KG;

    // ---- impacts (contact impulses from the last step)
    let J = 0;
    this.world.contactPairsWith(this.collider, (other) => this.world.contactPair(this.collider, other, (man) => { for (let i = 0; i < man.numContacts(); i++) J += man.contactImpulse(i); }));
    // a hit shows up as contact impulse and/or a sudden loss of speed in one step
    const drop = this.prevSpeed - vel.length();
    this.prevSpeed = vel.length();
    const dv = Math.max(J / m, J > 0 ? drop : 0);
    this.contactJ = J;
    if (dv > (s.cls === 'motorcycle' ? 3.0 : 2.4) && !this.crashed) {
      this.damage = Math.min(1, this.damage + dv * 0.04);
      this.emit('impact', { vehicleId: this.id, speedChange: dv, damage: this.damage });
      this.crash('impact', null);
    }
    if (this.crashed) { this.sync(); this.stepMs = performance.now() - t0; return; }
    this.prevVel.copy(vel);

    // ---- ground: per-wheel rays hold ride height (no roll/pitch on the body)
    let grounded = 0, sumH = 0, hF = 0, hR = 0;
    for (const w of this.g.wheels) {
      const o = new THREE.Vector3(w.x, 0.8, w.z).applyQuaternion(_q).add(_v.set(tr.x, tr.y, tr.z));
      const hit = this.world.castRay(new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: 0, y: -1, z: 0 }), 1.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, WHEEL_RAY_GROUPS, undefined, body);
      if (hit) { const gy = o.y - hit.timeOfImpact; grounded++; sumH += gy; if (w.front) hF = gy; else hR = gy; }
    }
    if (grounded) {
      const target = sumH / grounded;
      const err = target - tr.y;
      const k = m * 120, c = m * 18;
      body.applyImpulse({ x: 0, y: Math.max(0, k * err - c * lv.y + m * G) * dt, z: 0 }, true);
    }
    const onGround = grounded > 0 && Math.abs((sumH / Math.max(1, grounded)) - tr.y) < 0.25;
    const anyFlat = this.flat.some(Boolean);

    // ---- longitudinal
    const thr = Math.max(0, this.input.throttle), brk = Math.max(this.input.brake, this.input.handbrake ? 0.6 : 0);
    let Fx = 0;
    if (onGround) {
      const v = Math.abs(this.speed);
      const drive = thr * Math.min(s.launchForce, s.power / Math.max(v, 1.5)) * (1 - this.damage * 0.5);
      const reverse = this.input.throttle < -0.05 && this.speed < 0.5 && s.cls === 'motorcycle' ? -0.12 * s.launchForce : 0; // walking it back
      const brakeF = brk * s.brakeG * m * G * (v > 0.3 ? Math.sign(this.speed) : 0);
      const hold = v <= 0.3 && brk > 0 ? -this.speed * m / dt : 0;
      const drag = 0.5 * 1.2 * s.cdA * this.speed * Math.abs(this.speed) + Math.sign(this.speed) * Math.min(Math.abs(this.speed) * 20, (anyFlat ? 0.08 : 0.006) * m * G);
      Fx = drive + reverse - brakeF + hold - drag;
      const lim = s.mu * m * G * (anyFlat ? 0.5 : 1);
      if (Math.abs(Fx) > lim) { Fx = Math.sign(Fx) * lim; this.emit('skid', { vehicleId: this.id, speed: this.speed, wheels: [{ index: 1, x: tr.x, y: tr.y, z: tr.z, slip: 3, locked: brk > 0.5, spinning: thr > 0.5 }] }); }
    }

    // ---- steering & yaw (bicycle kinematics), grip-limited
    const v = this.speed;
    this.steerAngle += ((this.input.steer * s.maxSteer) / (1 + Math.abs(v) / 4.5) - this.steerAngle) * Math.min(1, dt * 6);
    let yawRate = onGround ? (v * Math.tan(this.steerAngle)) / s.wheelbase : body.angvel().y;
    const latDemand = Math.abs(v * yawRate) / G;
    const grip = s.mu * (anyFlat ? 0.5 : 1);
    if (latDemand > grip) {
      yawRate *= grip / latDemand;
      this.slipT += dt;
      this.emit('skid', { vehicleId: this.id, speed: v, wheels: [{ index: 0, x: tr.x, y: tr.y, z: tr.z, slip: (latDemand - grip) * 8, locked: false, spinning: false }] });
      if (s.lean && (latDemand > grip * 1.6 || this.slipT > 1.0) && Math.abs(v) > 6) this.crash('lowside', null);
    } else this.slipT = Math.max(0, this.slipT - dt);
    if (onGround) body.setAngvel({ x: 0, y: -yawRate, z: 0 }, true);

    // ---- lateral grip: kill sideways velocity up to the tyre limit
    if (onGround) {
      const vLat = vel.dot(right);
      const maxJ = grip * m * G * dt;
      const jLat = THREE.MathUtils.clamp(-vLat * m, -maxJ, maxJ);
      body.applyImpulse({ x: fwd.x * Fx * dt + right.x * jLat, y: 0, z: fwd.z * Fx * dt + right.z * jLat }, true);
    }

    // ---- visuals: lean into the turn, pitch from wheel heights, wheel spin
    const leanTarget = s.lean ? THREE.MathUtils.clamp(Math.atan2(v * yawRate, G), -0.8, 0.8) : THREE.MathUtils.clamp(-v * yawRate * 0.01, -0.05, 0.05);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 5);
    this.spin += (v / s.wheelR) * dt;
    this.mileage += Math.abs(v) * dt / 1609.34;
    void hF; void hR;
    this.sync();
    if (this.beaconMat) this.beaconMat.emissiveIntensity = this.lights.beacon ? ((this.t * 2.4) % 1 < 0.35 ? 6 : 0.3) : 0.05;
    (this.mats.bySlot.headlamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = this.lights.head ? 1.6 : 0;
    (this.mats.bySlot.taillamp as THREE.MeshStandardNodeMaterial).emissiveIntensity = brk > 0.05 ? 2.2 : this.lights.head ? 0.3 : 0;
    this.stepMs = performance.now() - t0;
  }

  private sync() {
    const tr = this.body.translation(), r = this.body.rotation();
    this.object.position.set(tr.x, tr.y, tr.z);
    this.object.quaternion.set(r.x, r.y, r.z, r.w);
    // lean about the ground line (rotate around z through y = 0)
    this.visual.rotation.set(0, 0, this.crashed ? 0 : -this.lean);
    // steer about the head axis
    const ax = this.g.steerAxis;
    this.steerNode.quaternion.setFromAxisAngle(_v.set(ax[0], ax[1], ax[2]), -this.steerAngle);
    for (const [i, w] of this.wheelNodes.entries()) {
      w.spin.rotation.x = -this.spin;
      w.pivot.scale.y = this.flat[i] ? 0.85 : 1;
      if (this.spec.cls === 'tricycle' && w.front) w.pivot.rotation.y = -this.steerAngle;
    }
  }

  setPose(p: { x: number; y: number; z: number; yaw: number }) {
    _q.setFromAxisAngle(_v.set(0, 1, 0), p.yaw);
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true); this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.sync();
  }

  serialize(): TwoWheelerSave {
    const t = this.body.translation(), r = this.body.rotation();
    return { v: 1, kind: 'twoWheeler', id: this.id, modelId: this.modelId, variant: this.variant, paint: this.paint, plate: this.plate, damage: this.damage, crashed: this.crashed, flat: [...this.flat], mileage: this.mileage, pose: { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w } };
  }
  private applySave(s: TwoWheelerSave) {
    this.damage = s.damage; this.mileage = s.mileage;
    this.body.setTranslation({ x: s.pose.x, y: s.pose.y, z: s.pose.z }, true);
    this.body.setRotation({ x: s.pose.qx, y: s.pose.qy, z: s.pose.qz, w: s.pose.qw }, true);
    if (s.crashed) { this.crashed = true; this.body.setEnabledRotations(true, true, true, true); }
  }
  get lastContactImpulse() { return this.contactJ; }

  dispose() {
    this.object.removeFromParent();
    this.mats.dispose(); this.beaconMat?.dispose(); this.plateTex?.dispose();
    this.world.removeRigidBody(this.body);
    this.listeners.clear();
  }
}
