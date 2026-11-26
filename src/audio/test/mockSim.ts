/**
 * TEST-ONLY stand-in for the sim workstream's Simulation, so audio can be developed and measured
 * before the real sim is merged. Vehicles drive the real 1974 one-ways from streets.json with
 * crude car-following, stops at a 90 s signal cycle, bus stops and impatient honking; pedestrians
 * walk the sidewalks. It honours the sim contract shapes (TrafficVehicleView, on(type, cb)).
 * Nothing here ships in the game.
 */
import type { TrafficVehicleView, VehicleClass } from '../../shared/traffic';
import { VehicleLights } from '../../shared/traffic';
import type { StreetRec } from '../acoustics/geometry';
import { Rng } from '../worklets/dsp';
import { heightAt } from '../../shared/terrain';

interface Car extends TrafficVehicleView { street: number; s: number; dir: 1 | -1; lane: number; target: number; stopT: number; honkCool: number; nextStop: number }
interface Ped { id: number; archetype: string; x: number; y: number; z: number; yaw: number; speed: number; state: string; variant: number; street: number; s: number; dir: 1 | -1; side: number }

const MIX: [VehicleClass, number][] = [['sedan', 36], ['taxi', 28], ['hardtop', 8], ['compact', 6], ['wagon', 4], ['bus', 4], ['box_truck', 8], ['step_van', 3], ['police', 2], ['garbage', 1]];

export class MockSim {
  vehicles: Car[] = [];
  peds: Ped[] = [];
  private handlers = new Map<string, ((e: unknown) => void)[]>();
  private rng: Rng; private nextId = 1; private time = 0;
  private lens: number[]; private cum: number[][];
  private drivable: number[];
  density = 1; pedDensity = 1;
  /** Spawn radius shrinks with the agent budget (Low: 40 cars) so near density stays comparable. */
  private radius: number; private pedRadius: number;

  constructor(private streets: StreetRec[], seed: number, private maxVehicles = 120, private maxPeds = 200) {
    this.rng = new Rng(seed);
    this.radius = 320 * Math.sqrt(maxVehicles / 150); this.pedRadius = 120 * Math.sqrt(maxPeds / 400);
    this.cum = streets.map((s) => { const c = [0]; for (let k = 2; k < s.p.length; k += 2) c.push(c[c.length - 1] + Math.hypot(s.p[k] - s.p[k - 2], s.p[k + 1] - s.p[k - 1])); return c; });
    this.lens = this.cum.map((c) => c[c.length - 1]);
    this.drivable = streets.map((_, i) => i).filter((i) => this.lens[i] > 30 && !/Tunnel/.test(streets[i].n) && streets[i].c !== 'living_street');
  }
  on(type: string, cb: (e: unknown) => void) { const a = this.handlers.get(type) ?? []; a.push(cb); this.handlers.set(type, a); }
  private emit(type: string, e: unknown) { for (const h of this.handlers.get(type) ?? []) h(e); }

  private at(i: number, s: number): [number, number, number, number] {
    const p = this.streets[i].p, c = this.cum[i]; s = Math.max(0, Math.min(this.lens[i], s));
    let k = 1; while (k < c.length - 1 && c[k] < s) k++;
    const seg = c[k] - c[k - 1] || 1, t = (s - c[k - 1]) / seg;
    const x0 = p[(k - 1) * 2], z0 = p[(k - 1) * 2 + 1], x1 = p[k * 2], z1 = p[k * 2 + 1];
    return [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, (x1 - x0) / seg, (z1 - z0) / seg];
  }

  private pickStreet(fx: number, fz: number, r: number): number {
    for (let tries = 0; tries < 40; tries++) {
      const i = this.drivable[(this.rng.next() * this.drivable.length) | 0];
      const [x, z] = this.at(i, this.rng.next() * this.lens[i]);
      if (Math.hypot(x - fx, z - fz) < r) return i;
    }
    return -1;
  }

  private spawnCar(fx: number, fz: number, hour: number) {
    const i = this.pickStreet(fx, fz, this.radius); if (i < 0) return;
    const st = this.streets[i]; const avenue = /Avenue|Broadway/.test(st.n);
    let r = this.rng.next() * 100, vclass: VehicleClass = 'sedan';
    for (const [c, w] of MIX) { if ((r -= w) < 0) { vclass = c; break; } }
    if (vclass === 'bus' && !avenue) vclass = 'sedan';
    if (vclass === 'garbage' && hour > 8 && hour < 22) vclass = 'box_truck';
    const dir: 1 | -1 = st.o === 0 ? (this.rng.next() < 0.5 ? 1 : -1) : (st.o as 1 | -1);
    const lanes = Math.max(1, Math.floor((st.w - 4) / 3.3));
    const s = this.rng.next() * this.lens[i];
    const car: Car = { id: this.nextId++, vclass, variant: this.rng.u32(), x: 0, y: 0, z: 0, yaw: 0, speed: 0, lights: VehicleLights.Head, state: 'drive', street: i, s, dir, lane: (this.rng.next() * lanes) | 0,
      target: (avenue ? 9 : 6.5) + this.rng.next() * 4 - (vclass === 'bus' || vclass === 'box_truck' ? 2 : 0), stopT: 0, honkCool: this.rng.range(5, 30), nextStop: s + dir * this.rng.range(100, 300) };
    car.speed = car.target * this.rng.next();
    this.place(car); this.vehicles.push(car);
  }
  private place(c: Car) {
    const st = this.streets[c.street]; const [x, z, dx, dz] = this.at(c.street, c.s);
    const off = (st.w / 2 - 1.8 - c.lane * 3.3) * (st.o === 0 ? 1 : 0.6) * c.dir; // right-hand side of travel
    c.x = x - dz * off; c.z = z + dx * off; c.y = heightAt(c.x, c.z); c.yaw = Math.atan2(dx * c.dir, -dz * c.dir);
  }

  private spawnPed(fx: number, fz: number) {
    const i = this.pickStreet(fx, fz, this.pedRadius); if (i < 0) return;
    const p: Ped = { id: this.nextId++, archetype: 'npc.commuter', x: 0, y: 0.15, z: 0, yaw: 0, speed: this.rng.range(1.05, 1.6), state: 'walk', variant: this.rng.u32(), street: i, s: this.rng.next() * this.lens[i], dir: this.rng.next() < 0.5 ? 1 : -1, side: this.rng.next() < 0.5 ? 1 : -1 };
    this.placePed(p); this.peds.push(p);
  }
  private placePed(p: Ped) { const st = this.streets[p.street]; const [x, z, dx, dz] = this.at(p.street, p.s); const off = (st.w / 2 + 2.4) * p.side; p.x = x - dz * off; p.z = z + dx * off; p.y = heightAt(p.x, p.z) + 0.15; }

  /** One sim step. `hour` scales density like the real sim's clock hook. */
  update(dt: number, focus: { x: number; z: number }, hour = 17.5) {
    this.time += dt;
    const want = Math.round(this.maxVehicles * this.density), wantP = Math.round(this.maxPeds * this.pedDensity);
    for (let n = 0; n < 6 && this.vehicles.length < want; n++) this.spawnCar(focus.x, focus.z, hour);
    for (let n = 0; n < 10 && this.peds.length < wantP; n++) this.spawnPed(focus.x, focus.z);
    // Index cars per street+dir+lane for following.
    const byLane = new Map<string, Car[]>();
    for (const c of this.vehicles) { const k = `${c.street}:${c.dir}:${c.lane}`; let a = byLane.get(k); if (!a) byLane.set(k, (a = [])); a.push(c); }
    for (const a of byLane.values()) a.sort((p, q) => (p.s - q.s) * p.dir);
    const cycle = 90;
    for (const a of byLane.values()) {
      for (let k = 0; k < a.length; k++) {
        const c = a[k]; const lead = a[k + 1];
        const st = this.streets[c.street]; const avenue = /Avenue|Broadway/.test(st.n);
        // Signal: avenues green for the first half of the cycle (offset by position: green wave), streets the second.
        const phase = ((this.time + (avenue ? -c.s / 12 : 0)) % cycle + cycle) % cycle / cycle;
        const red = avenue ? phase > 0.55 : phase < 0.5;
        const toBlock = 80 - (((c.s * c.dir) % 80) + 80) % 80;
        let target = c.target;
        if (red && toBlock < 14) target = Math.max(0, (toBlock - 4) * 0.8);
        if (c.stopT > 0) { c.stopT -= dt; target = 0; if (c.stopT <= 0) c.state = 'drive'; }
        else if (c.vclass === 'bus' && (c.nextStop - c.s) * c.dir < 0) { c.stopT = this.rng.range(10, 20); c.state = 'busStop'; c.nextStop = c.s + c.dir * this.rng.range(220, 320); }
        let gap = Infinity; if (lead) gap = Math.abs(lead.s - c.s) - 7;
        if (gap < 30) target = Math.min(target, Math.max(0, (gap - 2) * 0.6), lead.speed + gap * 0.15);
        const prev = c.speed;
        const acc = target > c.speed ? 1.6 : -4.5;
        c.speed = Math.max(0, acc > 0 ? Math.min(target, c.speed + acc * dt) : Math.max(target, c.speed + acc * dt));
        c.lights = VehicleLights.Head | (c.speed < prev - 0.01 ? VehicleLights.Brake : 0) | (c.vclass === 'taxi' && (c.variant & 1) ? VehicleLights.RoofLight : 0) | (c.vclass === 'police' && (c.variant % 29 === 0) ? VehicleLights.Siren : 0);
        c.state = c.stopT > 0 ? c.state : c.speed < 0.3 ? 'queue' : 'drive';
        c.s += c.dir * c.speed * dt; this.place(c);
        // 1974 impatience: honking in queues, taxis twice as often.
        if ((c.honkCool -= dt) <= 0) {
          c.honkCool = this.rng.range(8, 40);
          if (c.speed < 1.5 && this.rng.next() < (c.vclass === 'taxi' ? 0.5 : 0.25)) this.emit('honk', { vehicleId: c.id, x: c.x, y: c.y + 1, z: c.z, duration: this.rng.next() < 0.3 ? this.rng.range(0.8, 2) : this.rng.range(0.15, 0.5) });
        }
        if (Math.hypot(c.x - focus.x, c.z - focus.z) < 60 && c.speed > 6 && this.rng.next() < 0.002 * dt) this.emit('nearMiss', { x: c.x, y: c.y + 0.3, z: c.z, a: c.id });
      }
    }
    this.vehicles = this.vehicles.filter((c) => c.s >= -5 && c.s <= this.lens[c.street] + 5 && Math.hypot(c.x - focus.x, c.z - focus.z) < this.radius + 60);
    for (const p of this.peds) {
      p.s += p.dir * p.speed * dt; this.placePed(p);
      if (this.rng.next() < 0.00012 * dt) this.emit('hail', { x: p.x, y: 1.7, z: p.z, pedId: p.id });
    }
    this.peds = this.peds.filter((p) => p.s >= 0 && p.s <= this.lens[p.street] && Math.hypot(p.x - focus.x, p.z - focus.z) < this.pedRadius + 30);
  }
}
