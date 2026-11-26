import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import type { ModelSpec } from './gen/spec';
import type { GeneratedModel } from './gen/body';

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }

export interface WheelState {
  /** Local mount (hardpoint) and wheel geometry. */
  hp: THREE.Vector3; r: number; front: boolean; side: 1 | -1; dual: boolean;
  restLen: number; k: number; c: number;
  len: number; prevLen: number; contact: boolean;
  load: number; steer: number;
  spin: number; omega: number;
  /** Slip speed (m/s) at the contact patch; > ~2 is an audible skid. */
  slip: number; locked: boolean; spinning: boolean;
  point: THREE.Vector3; normal: THREE.Vector3;
  /** Collider the wheel is resting on (for surface queries). */
  ground: RAPIER.Collider | null;
}

const G = 9.81;
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();
const _hp = new THREE.Vector3(), _o = new THREE.Vector3(), _f = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _cp = new THREE.Vector3(), _imp = new THREE.Vector3(), _bf = new THREE.Vector3();
const vec = (v: THREE.Vector3) => ({ x: v.x, y: v.y, z: v.z });

/**
 * Raycast vehicle on a Rapier rigid body. Soft springs, light damping and a high centre of mass
 * give the 1970s wallow (roll, dive, squat) as emergent behaviour rather than faked animation.
 * Call `step(dt)` once per physics step, before or after world.step() (it applies impulses that
 * the next world.step() integrates).
 */
export class VehiclePhysics {
  readonly body: RAPIER.RigidBody;
  readonly colliders: RAPIER.Collider[] = [];
  readonly wheels: WheelState[] = [];
  readonly input: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  readonly mass: number;
  /** Signed speed along the vehicle's forward axis (m/s). */
  speed = 0;
  rpm = 800; gear = 1; reverse = false;
  /** 0..1 engine load (effective throttle incl. shift torque cut), for audio. */
  load = 0;
  /** 0..1 engine power multiplier (damage). */
  power = 1;
  private shiftT = 0; private revT = 0; private steerNow = 0;
  private ray: RAPIER.Ray;
  private zF: number; private zR: number;

  constructor(private world: RAPIER.World, readonly spec: ModelSpec, gen: GeneratedModel, pose: { x: number; y: number; z: number; yaw: number }) {
    const p = spec.physics;
    this.mass = p.mass;
    _q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
    const bd = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pose.x, pose.y, pose.z)
      .setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w })
      .setLinearDamping(0.01).setAngularDamping(0.35)
      .setCcdEnabled(true).setCanSleep(true);
    this.body = world.createRigidBody(bd);
    const fronts = gen.wheels.filter((w) => w.front), rears = gen.wheels.filter((w) => !w.front);
    this.zF = fronts[0].z; this.zR = rears[0].z;
    const comZ = this.zR + p.frontWeight * (this.zF - this.zR);
    const L = gen.maxZ - gen.minZ, W = gen.halfW * 2, H = gen.height * 0.8;
    const inertia = { x: (p.mass / 12) * (H * H + L * L) * 0.8, y: (p.mass / 12) * (W * W + L * L) * 0.8, z: (p.mass / 12) * (W * W + H * H) * 0.75 };
    gen.colliders.forEach((c, i) => {
      const cd = RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz).setTranslation(c.cx, c.cy, c.cz)
        .setFriction(0.3).setRestitution(0.05)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      // NB: collider mass properties are expressed in the collider's own frame
      if (i === 0) cd.setMassProperties(p.mass, { x: -c.cx, y: p.comY - c.cy, z: comZ - c.cz }, inertia, { x: 0, y: 0, z: 0, w: 1 });
      else cd.setMass(0);
      this.colliders.push(world.createCollider(cd, this.body));
    });

    for (const w of gen.wheels) {
      const share = (w.front ? p.frontWeight : 1 - p.frontWeight) / 2;
      const mw = p.mass * share;
      const f = w.front ? p.freqF : p.freqR;
      const k = mw * (2 * Math.PI * f) ** 2;
      const staticComp = (mw * G) / k;
      const c = 2 * p.zeta * Math.sqrt(k * mw);
      const hpY = w.r + p.travel;
      this.wheels.push({
        hp: new THREE.Vector3(w.x, hpY, w.z), r: w.r, front: w.front, side: w.side, dual: w.dual,
        restLen: p.travel + staticComp, k, c, len: p.travel, prevLen: p.travel, contact: false,
        load: 0, steer: 0, spin: 0, omega: 0, slip: 0, locked: false, spinning: false,
        point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), ground: null,
      });
    }
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  /** Engine torque curve (fraction of peak) for a lazy big-displacement engine. */
  private torqueAt(rpm: number) {
    const p = this.spec.physics;
    const x = rpm / p.peakRpm;
    if (rpm > p.redline) return 0;
    return x < 1 ? 0.62 + 0.38 * x : Math.max(0.2, 1 - 0.55 * (x - 1) * (x - 1) * 1.6);
  }

  step(dt: number) {
    const p = this.spec.physics;
    const body = this.body;
    const t = body.translation(), r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _fw.set(0, 0, -1).applyQuaternion(_q);
    _rt.set(1, 0, 0).applyQuaternion(_q);
    const lv = body.linvel();
    _v.set(lv.x, lv.y, lv.z);
    this.speed = _v.dot(_fw);
    const speedAbs = Math.abs(this.speed);

    // ---------------------------------------------------------- input & direction logic
    let thr = THREE.MathUtils.clamp(this.input.throttle, -1, 1), brk = THREE.MathUtils.clamp(this.input.brake, 0, 1);
    if (thr < 0) { brk = Math.max(brk, 0); if (this.speed < 1) { this.reverse = true; } }
    if (!this.reverse) {
      if (speedAbs < 0.6 && brk > 0.1 && thr <= 0.05) { this.revT += dt; if (this.revT > 0.25) this.reverse = true; } else this.revT = 0;
    } else {
      if (thr > 0.1 && this.speed > -0.6) { this.reverse = false; this.revT = 0; }
    }
    let drive = 0, brake = brk;
    if (this.reverse) { drive = Math.max(brk, -thr); brake = Math.max(0, thr); }
    else drive = Math.max(0, thr);
    if (drive > 0 || brake > 0 || Math.abs(this.input.steer) > 0.01) body.wakeUp();

    // ---------------------------------------------------------- steering (slow, speed-sensitive)
    const target = this.input.steer * p.maxSteer / (1 + speedAbs / 22);
    const rate = p.steerRate * (Math.abs(target) < Math.abs(this.steerNow) ? 1.6 : 1);
    this.steerNow += THREE.MathUtils.clamp(target - this.steerNow, -rate * dt, rate * dt);
    const wb = Math.abs(this.zR - this.zF);
    const tr = Math.abs(this.wheels[0].hp.x * 2);
    const tanD = Math.tan(this.steerNow);

    // ---------------------------------------------------------- engine / automatic transmission
    const drivenV = this.speed;
    const R = this.wheels[this.wheels.length - 1].r;
    const ratio = (this.reverse ? p.reverseRatio : p.gears[this.gear - 1]) * p.finalDrive;
    const coupled = (Math.abs(drivenV) / R) * ratio * 60 / (2 * Math.PI);
    const stall = Math.min(p.redline * 0.5, p.peakRpm * 0.85);
    const free = 700 + drive * (stall - 700);
    this.rpm = THREE.MathUtils.lerp(this.rpm, Math.max(coupled, free * THREE.MathUtils.clamp(1 - coupled / stall, 0, 1) + coupled * 0.6, 650), Math.min(1, dt * 8));
    const tr2 = 1 + 0.9 * THREE.MathUtils.clamp(1 - coupled / stall, 0, 1); // converter multiplication
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (!this.reverse && this.shiftT === 0) {
      const upAt = p.redline * (0.55 + 0.38 * drive);
      if (coupled > upAt && this.gear < p.gears.length) { this.gear++; this.shiftT = 0.45; }
      else if (this.gear > 1) {
        const lower = coupled * p.gears[this.gear - 2] / p.gears[this.gear - 1];
        if (coupled < p.peakRpm * 0.45 || (drive > 0.9 && lower < p.redline * 0.8)) { this.gear--; this.shiftT = 0.45; }
      }
    }
    if (this.reverse) this.gear = 1;
    const torque = p.torque * this.torqueAt(Math.max(coupled, 900)) * this.power;
    let driveForce = drive * torque * tr2 * ratio * 0.85 / R * (this.shiftT > 0.2 ? 0.45 : 1);
    this.load = drive * (this.shiftT > 0.2 ? 0.45 : 1) * this.power;
    if (this.reverse) driveForce = -driveForce;
    // engine braking when off the throttle
    const engBrake = drive < 0.05 && speedAbs > 1 ? Math.sign(this.speed) * Math.min(0.035 * p.mass * G, 6 * speedAbs * ratio) : 0;

    // ---------------------------------------------------------- per-wheel suspension + tyres
    const nDriven = this.wheels.filter((w) => !w.front).length;
    const comps: number[] = [];
    for (const w of this.wheels) {
      // wheel steer (Ackermann)
      // steer > 0 turns right; the inner wheel turns more (Ackermann)
      w.steer = w.front && Math.abs(tanD) > 1e-4 ? Math.atan(wb / (wb / tanD - w.side * tr / 2)) : 0;
      // hardpoint world
      _hp.copy(w.hp).applyQuaternion(_q).add(_o.set(t.x, t.y, t.z));
      // steered forward in world
      _f.set(-Math.sin(-w.steer), 0, -Math.cos(-w.steer)).applyQuaternion(_q);
      // three rays along the patch; keep the one that puts the wheel highest
      let best = Infinity; w.ground = null;
      const maxT = w.restLen + w.r + 0.1;
      for (const d of [-0.55, 0, 0.55]) {
        const off = d * w.r;
        this.ray.origin = { x: _hp.x + _f.x * off, y: _hp.y + _f.y * off, z: _hp.z + _f.z * off };
        this.ray.dir = { x: -_up.x, y: -_up.y, z: -_up.z };
        const hit = this.world.castRayAndGetNormal(this.ray, maxT, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, body);
        if (!hit) continue;
        const centerDist = hit.timeOfImpact - Math.sqrt(Math.max(0, w.r * w.r - off * off));
        if (centerDist < best) { best = centerDist; _n.set(hit.normal.x, hit.normal.y, hit.normal.z); w.ground = hit.collider; }
      }
      w.prevLen = w.len;
      if (best <= w.restLen) {
        w.contact = true; w.len = Math.max(0, best); w.normal.copy(_n);
      } else { w.contact = false; w.len = w.restLen; w.ground = null; }
      comps.push(w.restLen - w.len);
    }
    // anti-roll per axle
    const ar = (i: number, j: number) => (comps[i] - comps[j]) * p.antiRoll * this.wheels[i].k;
    const arF = [ar(0, 1), -ar(0, 1)], arR = this.wheels.length > 3 ? [ar(2, 3), -ar(2, 3)] : [0, 0];

    const mEff = p.mass / this.wheels.length;
    this.wheels.forEach((w, i) => {
      w.slip = 0; w.locked = false; w.spinning = false;
      if (!w.contact) { w.load = 0; w.omega *= 0.995; if (this.input.handbrake && !w.front) w.omega = 0; w.spin += w.omega * dt; return; }
      const compVel = (w.prevLen - w.len) / dt;
      let fs = w.k * (w.restLen - w.len) + (compVel > 0 ? w.c : w.c * 1.5) * compVel;
      if (w.len < 0.02) fs += w.k * 6 * (0.02 - w.len) + w.c * 2 * Math.max(0, compVel);
      fs += (w.front ? arF : arR)[i % 2];
      fs = Math.max(0, fs);
      w.load = fs * Math.max(0.2, _up.dot(w.normal));
      _hp.copy(w.hp).applyQuaternion(_q).add(_o.set(t.x, t.y, t.z));
      _imp.copy(_up).multiplyScalar(fs * dt);
      body.applyImpulseAtPoint(vec(_imp), vec(_hp), true);

      // contact frame
      _f.set(-Math.sin(-w.steer), 0, -Math.cos(-w.steer)).applyQuaternion(_q);
      _f.addScaledVector(w.normal, -_f.dot(w.normal)).normalize();
      _s.crossVectors(_f, w.normal).normalize();
      _cp.copy(_hp).addScaledVector(_up, -(w.len + w.r));
      w.point.copy(_cp);
      const pv = body.velocityAtPoint(vec(_cp));
      _bf.set(pv.x, pv.y, pv.z);
      const vLong = _bf.dot(_f), vLat = _bf.dot(_s);
      const Fz = w.load;
      const limit = p.muPeak * Fz, slide = p.muSlide * Fz;

      // longitudinal demand
      const driven = !w.front;
      const fDrive = driven ? (driveForce - engBrake) / nDriven : 0;
      const bShare = w.front ? p.brakeBias : 1 - p.brakeBias;
      const fBrakeMax = brake * p.brakeForce * p.mass * G * bShare / 2;
      const hand = this.input.handbrake && !w.front;
      let Fx: number, Fy: number;
      const lockBrake = fBrakeMax > limit * 0.98 && Math.abs(vLong) > 1.2;
      const planar = Math.hypot(vLong, vLat);
      if ((hand && planar > 0.4) || lockBrake) {
        // locked wheel: friction opposes the whole slip velocity (no steering while locked)
        w.locked = true;
        const sc = planar > 1e-3 ? slide / planar : 0;
        Fx = -vLong * sc; Fy = -vLat * sc;
        if (planar < 2) { Fx = THREE.MathUtils.clamp(-vLong * mEff / dt, -slide, slide); Fy = THREE.MathUtils.clamp(-vLat * mEff / dt, -slide, slide); }
        w.slip = planar; w.omega = 0;
      } else {
        // brakes: below ~1 m/s act as a hold that cannot reverse the car
        let fBrake = 0;
        if (fBrakeMax > 0 || hand) {
          const hold = THREE.MathUtils.clamp(-vLong * mEff / dt, -(fBrakeMax || slide), fBrakeMax || slide);
          fBrake = Math.abs(vLong) < 1 ? hold : -Math.sign(vLong) * fBrakeMax;
        }
        const roll = -Math.sign(vLong) * Math.min(Math.abs(vLong) * 40, 0.013 * Fz);
        Fx = fDrive + fBrake + roll;
        // lateral: simplified Pacejka on slip angle, never more than what stops the slide this step
        const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 0.6));
        let fy = p.muPeak * Fz * Math.sin(p.tyreC * Math.atan(p.tyreB * Math.abs(alpha)));
        fy = Math.min(fy, Math.abs(vLat) * mEff / dt);
        Fy = -Math.sign(vLat) * fy;
        const tot = Math.hypot(Fx, Fy);
        if (tot > limit) {
          const sc = slide / tot;
          if (Math.abs(Fx) > limit * 0.9 && driven && fDrive * Math.sign(Fx) > 0) w.spinning = true;
          Fx *= sc; Fy *= sc;
          w.slip = Math.max(Math.abs(vLat), w.spinning ? 4 + (Math.abs(fDrive) - limit) / Math.max(1, limit) * 8 : 0);
        } else w.slip = Math.abs(alpha) > 0.18 && planar > 3 ? Math.abs(vLat) * 0.7 : 0;
        const roll2 = vLong / w.r;
        w.omega = w.spinning ? roll2 + Math.sign(fDrive) * w.slip / w.r : roll2;
      }
      w.spin += w.omega * dt;
      // longitudinal force at the contact patch (full dive/squat, no anti-dive geometry in 1974);
      // lateral force slightly above it, standing in for a low roll centre
      _imp.copy(_f).multiplyScalar(Fx * dt);
      body.applyImpulseAtPoint(vec(_imp), vec(_cp), true);
      _imp.copy(_s).multiplyScalar(Fy * dt);
      _cp.addScaledVector(_up, 0.1);
      body.applyImpulseAtPoint(vec(_imp), vec(_cp), true);
    });

    // aero drag
    const sp = _v.length();
    if (sp > 0.5) {
      const fd = 0.5 * 1.2 * p.cdA * sp * sp;
      _imp.copy(_v).multiplyScalar(-fd * dt / sp);
      body.applyImpulse(vec(_imp), true);
    }
  }

  /** Total contact impulse on the chassis from the last world.step(), with its strongest point. */
  sampleContacts(out: { impulse: number; point: THREE.Vector3; normal: THREE.Vector3; other: RAPIER.Collider | null }) {
    out.impulse = 0; out.other = null;
    let best = 0;
    for (const c of this.colliders) {
      this.world.contactPairsWith(c, (other) => {
        if (other.parent()?.handle === this.body.handle) return;
        this.world.contactPair(c, other, (m, flipped) => {
          let j = 0;
          const n = m.numContacts();
          for (let i = 0; i < n; i++) j += m.contactImpulse(i);
          if (j <= 0) return;
          out.impulse += j;
          if (j > best) {
            best = j; out.other = other;
            const nn = m.normal(); out.normal.set(nn.x, nn.y, nn.z).multiplyScalar(flipped ? -1 : 1);
            const sp = m.numSolverContacts() > 0 ? m.solverContactPoint(0) : null;
            if (sp) out.point.set(sp.x, sp.y, sp.z);
            else { const tt = this.body.translation(); out.point.set(tt.x, tt.y, tt.z); }
          }
        });
      });
    }
    return out;
  }

  dispose() { this.world.removeRigidBody(this.body); }
}
