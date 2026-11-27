/**
 * Player driving (docs/HANDOFF_WIRING.md; gameplay contract §1, vehicles brief).
 *
 *  - Getting in: `use` near a car. Candidates are your own spawned cars, sim traffic (a carjack: the sim hands the
 *    car over with takeVehicle and the owner gives chase), and parked cars (sim.parkedCars). Gameplay decides the
 *    method from its theft rules (keys / unlocked / smash / carjack) and reports the crimes; a hot-wire follows
 *    when needed. The visual car becomes a physics Vehicle with the same model, paint and variant.
 *  - Driving: Input gas/brake/steer (pad triggers, touch pedals, WASD), handbrake on jump; the DriverAssist on touch
 *    and pad. A chase camera writes director.gameplay. The lead sits in the driver's seat (Character.setSeat).
 *  - Each frame: sim sees a vehicle actor; gameplay gets setContext({vehicle, speed, vehicleYaw}) and impacts
 *    through bindVehicles; audio has the engine attached; the hero ring upgrades the car's mesh.
 *  - Getting out: `use` below 3 m/s. The car stays where you left it (engine off, handbrake on).
 */
import * as THREE from 'three/webgpu';
import RAPIER from '../shared/rapier';
import type { Physics } from '../physics/Physics';
import type { Input } from '../input/Input';
import type { PlayerController } from '../player/PlayerController';
import type { Simulation } from '../sim';
import type { Gameplay } from '../gameplay';
import { DriverAssist, TOUCH_DEFAULTS, PAD_DEFAULTS, updateHeroRing, HERO_RING, type Vehicle, type VehicleFactory, type VehicleClass } from '../vehicles';
import { heightAt } from '../shared/terrain';

type Quality = 'low' | 'medium' | 'high' | 'ultra';
export interface ParkedRef { id: number; vclass: string; variant: number; x: number; z: number; yaw: number }
interface Owned { v: Vehicle; vclass: string; detachAudio?: () => void }

export interface DrivingDeps {
  quality: Quality; physics: Physics; scene: THREE.Object3D; input: Input; player: PlayerController;
  camera: THREE.PerspectiveCamera; factory: VehicleFactory; sim: Simulation | null;
  gameplay: () => Gameplay | null;
  lead: () => string;
  /** parked cars currently drawn (engine list); the one taken is hidden through `takenParked` */
  parked: () => readonly ParkedRef[];
  attachAudio?: (v: Vehicle, vclass: string) => (() => void) | undefined;
  /** seat the lead (Character.setSeat) or stand it up (null) */
  seat: (m: THREE.Matrix4 | null) => void;
}

const ENTER_R = 3.2, GET_OUT_SPEED = 3;

export class Driving {
  /** the car being driven, or null on foot */
  car: Owned | null = null;
  readonly cars: Owned[] = [];
  readonly takenParked = new Set<number>();
  private assist: DriverAssist;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3(); private camInit = false;
  private tmp = new THREE.Vector3(); private fwd = new THREE.Vector3();
  lastEnter = '';

  constructor(private d: DrivingDeps) {
    this.assist = new DriverAssist(d.input.isTouch ? TOUCH_DEFAULTS : PAD_DEFAULTS);
  }

  /** gameplay.bindVehicles target: impacts and destructions of every physics car */
  readonly binding = { on: (type: 'impact' | 'destroyed', cb: (e: unknown) => void) => { (this.listeners[type] ??= []).push(cb); } };
  private emit(type: string, e: unknown) { for (const cb of this.listeners[type] ?? []) cb(e); }

  get driving() { return this.car !== null; }

  /** What `use` would do on foot near a car (for the prompt), or null. */
  nearestCar(): { kind: 'own' | 'traffic' | 'parked'; label: string } | null {
    const c = this.candidate(); if (!c) return null;
    return { kind: c.kind, label: c.kind === 'traffic' ? 'Take the car' : 'Get in' };
  }

  private candidate(): { kind: 'own'; o: Owned } | { kind: 'traffic'; id: number; vclass: string; variant: number; x: number; z: number; yaw: number } | { kind: 'parked'; p: ParkedRef } | null {
    const p = this.d.player.pos; let best: ReturnType<Driving['candidate']> = null, bd = ENTER_R;
    for (const o of this.cars) { const q = o.v.object.position, dd = Math.hypot(q.x - p.x, q.z - p.z) - 1; if (dd < bd) { bd = dd; best = { kind: 'own', o }; } }
    for (const v of this.d.sim?.vehicles ?? []) {
      const dd = Math.hypot(v.x - p.x, v.z - p.z) - 1.2;
      if (dd < bd && v.speed < 6 && v.vclass !== 'police' && v.vclass !== 'bus') { bd = dd; best = { kind: 'traffic', id: v.id, vclass: v.vclass, variant: v.variant, x: v.x, z: v.z, yaw: v.yaw }; }
    }
    for (const q of this.d.parked()) {
      if (this.takenParked.has(q.id)) continue;
      const dd = Math.hypot(q.x - p.x, q.z - p.z) - 1.2; if (dd < bd) { bd = dd; best = { kind: 'parked', p: q }; }
    }
    return best;
  }

  /** `use` on foot: try to get into the nearest car. Returns true if the player is now driving. */
  tryEnter(): boolean {
    const c = this.candidate(); if (!c) return false;
    let owned: Owned, id: string, vclass: string, driver: string | null = null;
    if (c.kind === 'own') { owned = c.o; id = owned.v.id; vclass = owned.vclass; }
    else {
      const src = c.kind === 'traffic' ? c : c.p;
      vclass = src.vclass;
      if (c.kind === 'traffic') {
        const took = this.d.sim?.takeVehicle(c.id); if (!took) return false;
        driver = took.ownerPedId >= 0 ? `ped:${took.ownerPedId}` : 'npc';
      } else this.takenParked.add(c.p.id);
      const { modelId } = this.d.factory.resolve(vclass as VehicleClass, src.variant);
      const pose = { x: src.x, y: heightAt(src.x, src.z) + 0.05, z: src.z, yaw: src.yaw };
      const v = this.d.factory.spawn(this.d.physics.world, this.d.scene, modelId, pose, src.variant);
      owned = { v, vclass }; this.cars.push(owned); id = v.id; this.wire(v);
      owned.detachAudio = this.d.attachAudio?.(v, vclass);
    }
    // gameplay's theft rules: register the car once, pick the method, report crimes
    const g = this.d.gameplay();
    if (g) {
      const lead = this.d.lead();
      if (!g.cars.cars.get(id)) g.cars.add({ id, vclass, colour: `#${(owned.v as unknown as { paint?: number }).paint?.toString(16) ?? '777777'}`, driver, x: owned.v.object.position.x, z: owned.v.object.position.z, ...(driver ? { locked: false } : {}) });
      const methods = g.cars.methods(id, lead);
      const method = methods.includes('keys') ? 'keys' : methods.includes('carjack') ? 'carjack' : methods.includes('unlocked') ? 'unlocked' : 'smash';
      const res = g.enterCar(id, method as never);
      this.lastEnter = method;
      if (res && 'ok' in res && !res.ok) return false;
      if (res && (res as { needsHotwire?: boolean }).needsHotwire) { g.hotwire(); owned.v.hotwire(); }
      if (method === 'smash') owned.v.breakWindow('left');
    }
    owned.v.ignition(true, { key: true });
    owned.v.isPlayer = true; (owned.v as unknown as { driverId?: string }).driverId = 'player';
    owned.v.setParked(false);
    this.car = owned; this.camInit = false;
    this.d.player.collider.setEnabled(false); this.d.player.active = false;
    return true;
  }

  /** `use` while driving: get out when slow enough. Returns the door point, or null if still moving. */
  tryExit(): THREE.Vector3 | null {
    const o = this.car; if (!o || o.v.speed > GET_OUT_SPEED) return null;
    const door = o.v.entryPoints().doors.find((e) => e.seat === 'driver')?.door ?? o.v.object.position.clone();
    o.v.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: true }); o.v.ignition(false); o.v.setParked(true);
    o.v.isPlayer = false;
    this.car = null;
    this.d.seat(null);
    const y = heightAt(door.x, door.z) + 0.2;
    this.d.player.collider.setEnabled(true);
    this.d.player.teleport(door.x, y, door.z, o.v.object.rotation.y);
    this.d.gameplay()?.exitCar();
    return door;
  }

  /** Every fixed physics step (before world.step). */
  fixed(h: number) {
    const i = this.d.input;
    for (const o of this.cars) {
      if (o === this.car) {
        const raw = { throttle: i.gas, brake: i.brake, steer: i.move.x, handbrake: i.isHeld('jump') };
        o.v.setInput(i.activeDevice === 'kbm' ? raw : this.assist.apply(raw, o.v, h));
      } else o.v.setInput({ throttle: 0, brake: 1, steer: 0, handbrake: true });
      o.v.update(h);
    }
  }

  /** Every frame after physics: seat, player position, actors, gameplay context, camera, hero ring, despawn. */
  update(dt: number, night: number, cam: THREE.PerspectiveCamera) {
    const o = this.car;
    if (o) {
      const p = o.v.object.position;
      this.d.seat(o.v.seatPose('driver'));
      // the player stays with the car (streaming, physics colliders, the UI and sim focus read player.pos)
      this.d.player.teleport(p.x, p.y, p.z, o.v.object.rotation.y);
      o.v.setLights({ head: night > 0.25 });
      const g = this.d.gameplay();
      g?.setContext({ vehicle: { id: o.v.id, vclass: o.vclass, colour: `#${((o.v as unknown as { paint?: number }).paint ?? 0x777777).toString(16).padStart(6, '0')}` }, speed: o.v.speed, vehicleYaw: o.v.object.rotation.y });
      this.chase(dt, cam);
    }
    updateHeroRing(this.cars.map((c) => c.v), cam.position, HERO_RING[this.d.quality]);
    // cars left far behind go back to the pool
    for (let k = this.cars.length - 1; k >= 0; k--) {
      const c = this.cars[k]; if (c === this.car) continue;
      if (c.v.object.position.distanceTo(this.d.player.pos as unknown as THREE.Vector3) > 260) { c.detachAudio?.(); c.v.dispose(); this.cars.splice(k, 1); }
    }
  }

  /** Sim actor for the car being driven (replaces the on-foot player actor). */
  actor() {
    const o = this.car; if (!o) return null;
    const lv = o.v.body.linvel(), p = o.v.object.position;
    return { id: 'player', kind: 'vehicle' as const, x: p.x, z: p.z, vx: lv.x, vz: lv.z, radius: 2.6 };
  }

  /** Bridge one vehicle's events to gameplay (called for every spawned car). */
  wire(v: Vehicle) {
    v.on('impact', (e) => {
      const ev = e as { closingSpeed: number; speedChange: number; otherVehicleId: string | null };
      const mine = this.car?.v === v;
      this.emit('impact', { vehicleId: v.id, speed: ev.closingSpeed, dv: ev.speedChange, occupant: mine ? 'player' : undefined, driver: mine ? 'player' : undefined });
    });
    v.on('destroyed', () => this.emit('destroyed', { vehicleId: v.id }));
  }

  private chase(dt: number, cam: THREE.PerspectiveCamera) {
    const v = this.car!.v, p = v.object.position;
    this.fwd.set(0, 0, -1).applyQuaternion(v.object.quaternion); this.fwd.y = 0; this.fwd.normalize();
    const speed = v.speed, back = 6.2 + Math.min(2.5, speed * 0.06), up = 2.3 + Math.min(0.8, speed * 0.02);
    const want = this.tmp.copy(p).addScaledVector(this.fwd, -back); want.y = p.y + up;
    // keep walls out of the frame: pull in along the ray from the roof
    const roofY = p.y + 1.6, dx = want.x - p.x, dy = want.y - roofY, dz = want.z - p.z, L = Math.hypot(dx, dy, dz);
    const hit = this.d.physics.ray(p.x, roofY, p.z, dx / L, dy / L, dz / L, L, v.body.collider(0) as RAPIER.Collider);
    if (hit !== null) want.set(p.x + (dx / L) * Math.max(1.2, hit - 0.3), roofY + (dy / L) * Math.max(1.2, hit - 0.3), p.z + (dz / L) * Math.max(1.2, hit - 0.3));
    const look = new THREE.Vector3().copy(p).addScaledVector(this.fwd, 4 + speed * 0.15); look.y = p.y + 1.1;
    const k = this.camInit ? 1 - Math.exp(-dt * 6) : 1;
    this.camPos.lerp(want, k); this.camLook.lerp(look, this.camInit ? 1 - Math.exp(-dt * 9) : 1); this.camInit = true;
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
  }
}
