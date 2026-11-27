/**
 * Vehicle audio.
 *  - Attached vehicles (player and scripted): full procedural engine, road/tyre noise, skids and
 *    impacts from the vehicle's own events when it exposes `on()`.
 *  - Sim traffic: the nearest few get a full engine (rpm/load estimated from speed and
 *    acceleration through a period 3-speed automatic); everyone else folds into four traffic
 *    mass sectors around the listener (granular engine cloud + road and wet-tyre noise).
 *  - Sim events: honk (period horn per class), collision (impact scaled by impulse, glass),
 *    nearMiss (tyre squeal and often a horn), hail (two-finger whistle).
 *  - Sim light bits: Siren -> a siren on that car; Brake at walking pace -> brake squeal sometimes;
 *    bus 'busStop' state -> door hiss. Loose manhole covers clank under passing wheels.
 */
import { setTimeoutAudio } from '../world/ambience';
import type { Env } from '../env';
import type { Voice } from '../core/voices';
import type { Vec3 } from '../config';
import { VehicleLights, type TrafficVehicleView } from '../../shared/traffic';
import { CLASS_ENGINE, ENGINE_PROFILES } from '../worklets/engineProfile';
import { engineSource, hornSource, sirenSource, skidSource, workletSource, type EngineHandle, type SkidHandle } from '../synth/live';
import { Rng } from '../worklets/dsp';
import { CURVE, curve } from '../world/cityMap';
import { heightAt as gh } from '../../shared/terrain';

export interface AttachedVehicle { id: string; rpm: () => number; load: () => number; position: () => Vec3; speed?: () => number; velocity?: () => Vec3; on?: (type: string, cb: (e: any) => void) => void }
export interface SimLike { on(type: string, cb: (e: any) => void): void; vehicles: readonly unknown[]; peds: readonly unknown[] }

const HORN_FOR: Record<string, string> = { sedan: 'car', hardtop: 'car', wagon: 'car', compact: 'compact', taxi: 'taxi', police: 'car', bus: 'bus', box_truck: 'truck', step_van: 'car', garbage: 'truck' };
const GEARS = [2.45, 1.45, 1.0];

interface TrafficEngine { id: number; voice: Voice; h: EngineHandle | null; gear: number; rpm: number; load: number; lastSpeed: number; pos: Vec3; vel: Vec3; vclass: string; siren?: Voice; seen: number }

export class VehicleAudio {
  private attached = new Map<string, { v: AttachedVehicle; voice: Voice; h: () => EngineHandle | null; vel: Vec3; last: Vec3 | null; skid?: { voice: Voice; level: number; h: () => SkidHandle | null }; prof: string }>();
  private sim: SimLike | null = null;
  private engines = new Map<number, TrafficEngine>();
  private sectors: { v: Voice; node: AudioWorkletNode | null; dir: [number, number] }[] = [];
  private rng = new Rng(3131);
  private manholes: [number, number][] = [];
  private manholeGrid = new Map<number, number[]>();
  private manholeCool = new Map<number, number>();
  private busState = new Map<number, string>();
  private brakeCool = new Map<number, number>();
  stats = { fullEngines: 0, simVehicles: 0, honks: 0, collisions: 0, nearMiss: 0, hails: 0, manholes: 0, hornChains: 0, roadRage: 0, fenderBenders: 0 };

  constructor(private env: Env) {
    // Loose manhole covers along the avenue lanes (deterministic).
    const r = new Rng(77);
    for (const s of env.geo.streets) {
      if (!/Avenue|Broadway/.test(s.n)) continue;
      for (let k = 0; k + 3 < s.p.length; k += 2) {
        const x1 = s.p[k], z1 = s.p[k + 1], x2 = s.p[k + 2], z2 = s.p[k + 3], L = Math.hypot(x2 - x1, z2 - z1);
        for (let t = r.next() * 40; t < L; t += 40 + r.next() * 40) {
          const off = r.range(-s.w / 3, s.w / 3); const mx = x1 + (x2 - x1) * t / L - (z2 - z1) / L * off, mz = z1 + (z2 - z1) * t / L + (x2 - x1) / L * off;
          const k = mkey(mx, mz); let a = this.manholeGrid.get(k); if (!a) this.manholeGrid.set(k, (a = [])); a.push(this.manholes.length); this.manholes.push([mx, mz]);
        }
      }
    }
  }

  start() {
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let i = 0; i < 4; i++) {
      const holder = { v: null as unknown as Voice, node: null as AudioWorkletNode | null, dir: dirs[i] };
      holder.v = this.env.vm.play({ name: `traffic.sector${i}`, bus: 'ambience', category: 'bed', priority: 6, loop: true, gain: 0,
        at: () => { const l = this.env.vm.listener.position; return [l[0] + holder.dir[0] * 30, l[1] - 0.6, l[2] + holder.dir[1] * 30]; }, occlude: false,
        build: (ctx) => { const s = workletSource(ctx, 't74-traffic', 1, { seed: 900 + i }); holder.node = s.node; return s.graph; } });
      this.sectors.push(holder);
    }
  }

  attach(v: AttachedVehicle, profile: string): () => void {
    const prof = ENGINE_PROFILES[profile] ? profile : CLASS_ENGINE[profile] ?? 'v8_small';
    let h: EngineHandle | null = null;
    const st: { v: AttachedVehicle; voice: Voice; h: () => EngineHandle | null; vel: Vec3; last: Vec3 | null; prof: string; skid?: { voice: Voice; level: number; h: () => SkidHandle | null } } = { v, voice: null as unknown as Voice, h: () => h, vel: [0, 0, 0], last: null, prof };
    st.voice = this.env.vm.play({ name: `veh.${v.id}`, bus: 'sfx', category: 'vehicle', priority: 8, loop: true, gain: 1, at: () => v.position(), vel: () => (v.velocity ? v.velocity() : st.vel), doppler: true, occlude: true,
      build: (ctx) => (h = engineSource(ctx, this.env.noise, prof, hash(v.id), 1)) });
    v.on?.('skid', (e) => this.onSkid(v.id, e));
    v.on?.('impact', (e) => this.impact(e?.position ?? v.position(), num(e?.impulse, num(e?.speed, 5) * 1500)));
    this.attached.set(v.id, st);
    return () => { st.voice.stop(0.3); st.skid?.voice.stop(0.1); this.attached.delete(v.id); };
  }

  private onSkid(id: string, e: any) {
    const st = this.attached.get(id); if (!st) return;
    const level = Math.max(0.2, Math.min(1, num(e?.intensity, num(e?.slip, 0.6))));
    if (!st.skid) {
      let h: SkidHandle | null = null;
      const voice = this.env.vm.play({ name: 'skid', bus: 'sfx', category: 'tyre', priority: 7, loop: true, gain: 1, at: () => st.v.position(), occlude: true, build: (ctx) => (h = skidSource(ctx, this.env.noise, hash(id) + 5)) });
      st.skid = { voice, level, h: () => h };
    }
    st.skid.level = Math.max(st.skid.level, level);
  }

  bindSim(sim: SimLike) {
    this.sim = sim;
    const pos = (e: any): Vec3 => { const x = num(e?.x, 0), z = num(e?.z, 0); return [x, num(e?.y, gh(x, z) + 1), z]; };
    const vclassOf = (e: any) => { const id = e?.vehicleId ?? e?.id ?? e?.a; const v = (sim.vehicles as TrafficVehicleView[]).find((q) => q.id === id); return v?.vclass ?? e?.vclass ?? 'sedan'; };
    const pool = (vc: string) => (vc === 'taxi' ? 'cab_driver' : vc === 'box_truck' || vc === 'garbage' || vc === 'step_van' ? 'truck_driver' : vc === 'police' ? 'beat_cop' : 'commuter');
    const near = (p: Vec3, r: number) => { const l = this.env.vm.listener.position; return Math.hypot(p[0] - l[0], p[2] - l[2]) < r; };
    sim.on('honk', (e) => {
      this.stats.honks++; const vc = vclassOf(e), p = pos(e);
      // Road rage leans on it; a horn-chain follower gives a short impatient toot or two; otherwise a normal tap.
      const rage = e?.reason === 'rage', depth = num(e?.chainDepth, 0);
      const dur = num(e?.duration, rage ? this.rng.range(1.6, 3) : depth > 0 ? this.rng.range(0.2, 0.6) : this.rng.range(0.25, 1.1));
      this.horn(vc, p, dur);
      if (depth > 0 && this.rng.next() < 0.35) setTimeoutAudio(this.env, dur + this.rng.range(0.12, 0.3), () => this.horn(vc, p, this.rng.range(0.15, 0.4))); // the double toot
      // 1974: the horn is often followed by an opinion through the open window (not from every car in a chain).
      if (depth === 0 && !rage && near(p, 30) && this.rng.next() < 0.3) this.env.emit('bark', { pool: pool(vc), context: 'horn', at: [p[0], gh(p[0], p[2]) + 1.3, p[2]], delay: 0.6 });
    });
    // A horn chain of 3+ drivers: the chorus builds behind the cars already honking (sim f9148be).
    sim.on('hornChain', (e) => {
      this.stats.hornChains++; const p = pos(e); if (!near(p, 220)) return;
      const n = Math.min(6, 2 + num(e?.length, 3));
      for (let k = 0; k < n; k++) setTimeoutAudio(this.env, 0.4 + k * this.rng.range(0.25, 0.6), () => {
        const a = this.rng.range(0, Math.PI * 2), d = 8 + k * this.rng.range(5, 9); // further back down the line each time
        this.horn(['sedan', 'taxi', 'hardtop', 'compact', 'box_truck'][this.rng.next() * 5 | 0], [p[0] + Math.cos(a) * d, p[1], p[2] + Math.sin(a) * d], this.rng.range(0.3, 1.4));
      });
    });
    // Road rage (shout | gesture | forceIn | leanOnHorn | shove): lines from narrative's road_rage pool when it exists, else the driver's own.
    const rageLine = (p: Vec3, ctx: string, fallbackPool: string, fallbackCtx: string, delay = 0.3) => {
      if (!near(p, 40)) return; const at: Vec3 = [p[0], gh(p[0], p[2]) + 1.4, p[2]];
      this.env.emit('bark', { pool: 'road_rage', context: ctx, at, delay, fallback: { pool: fallbackPool, context: fallbackCtx } });
    };
    sim.on('roadRage', (e) => {
      this.stats.roadRage++; const p = pos(e), vc = vclassOf(e), act = String(e?.act ?? '');
      if (act === 'forceIn') { this.tyreChirp(p, 0.6); rageLine(p, 'forceIn', pool(vc), 'horn', 0.8); }
      else if (act === 'shout' || act === 'gesture') rageLine(p, act, pool(vc), 'horn');
      else if (act === 'shove') { this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.5, priority: 5 }); this.env.oneShot('impact.light', { category: 'impact', at: p, gain: 0.25, rate: 1.4, priority: 5 }); rageLine(p, 'shove', 'street_tough', 'collision', 0.2); }
      else if (act === 'leanOnHorn' && this.rng.next() < 0.4) rageLine(p, 'horn', pool(vc), 'horn', 2.2);
    });
    // Fender-benders: the crunch, then the drivers get out and have it out on the kerb.
    sim.on('fenderBender', (e) => {
      this.stats.fenderBenders++; const p = pos(e); if (!near(p, 160)) return;
      this.env.oneShot('impact.fender', { category: 'impact', at: p, gain: 0.7, rate: this.rng.range(0.92, 1.06), priority: 7 });
      if (this.rng.next() < 0.3) this.env.oneShot('glass', { category: 'impact', at: p, gain: 0.25, rate: 1.3, priority: 5 }); // a lamp lens
      setTimeoutAudio(this.env, 1.2, () => this.env.oneShot('door.slam', { category: 'impact', at: p, gain: 0.45, priority: 4 }));
      setTimeoutAudio(this.env, 1.6, () => this.env.oneShot('door.slam', { category: 'impact', at: [p[0] + 4, p[1], p[2]], gain: 0.45, priority: 4 }));
    });
    sim.on('incidentAct', (e) => {
      const p = pos(e), act = String(e?.act ?? '');
      if (act === 'argue' || act === 'exchangeDetails' || act === 'inspect') rageLine(p, act === 'argue' ? 'argue' : act === 'inspect' ? 'inspect' : 'details', 'commuter', act === 'argue' ? 'collision' : 'complain', this.rng.range(0.2, 1.5));
      else if (act === 'stagger') this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.4, priority: 4 });
      else if (act === 'enterCar') this.env.oneShot('door.slam', { category: 'impact', at: p, gain: 0.45, rate: this.rng.range(0.95, 1.05), priority: 4 });
    });
    sim.on('collision', (e) => {
      this.stats.collisions++; const p = pos(e); this.impact(p, num(e?.impulse, num(e?.speed, 6) * 1400));
      if (near(p, 50)) this.env.emit('bark', { pool: pool(vclassOf(e)), context: 'collision', at: [p[0], 1.5, p[2]], delay: 1.2 });
    });
    sim.on('nearMiss', (e) => {
      this.stats.nearMiss++; const p = pos(e);
      this.tyreChirp(p, 0.7);
      if (this.rng.next() < 0.6) this.horn(vclassOf(e), p, this.rng.range(0.4, 1.4));
    });
    sim.on('hail', (e) => { this.stats.hails++; const p = pos(e); p[1] = gh(p[0], p[2]) + 1.85; this.env.oneShot('whistle.hail', { category: 'voice', gain: 0.8, at: p, priority: 5 }); this.env.emit('bark', { pool: 'commuter', context: 'hail', at: p, delay: 0.3 }); });
  }

  horn(vclass: string, at: Vec3, dur: number) {
    const kind = HORN_FOR[vclass] ?? 'car'; const seed = this.rng.u32(); const d = Math.max(0.15, Math.min(dur, 3));
    this.env.vm.play({ name: `horn.${kind}`, bus: 'sfx', category: 'horn', priority: 6, duration: d + 0.1, gain: 0.85, at, occlude: true, build: (ctx) => hornSource(ctx, this.env.noise, kind, seed, d) });
  }

  impact(at: Vec3, impulse: number) {
    const heavy = impulse > 9000; const g = Math.min(1, 0.35 + impulse / 20000);
    this.env.oneShot(heavy ? 'impact.heavy' : 'impact.light', { category: 'impact', gain: g, at, priority: 8 });
    if (heavy || impulse > 6000) this.env.oneShot('glass', { category: 'impact', gain: g * 0.7, at, priority: 7 });
    if (!heavy && !this.env.bank.has('impact.light')) void 0;
  }

  /** Short tyre squeal at a point (near misses, hard stops). */
  tyreChirp(at: Vec3, level: number) {
    const seed = this.rng.u32(); let h: SkidHandle | null = null; const dur = 0.5 + level * 0.6;
    this.env.vm.play({ name: 'chirp', bus: 'sfx', category: 'tyre', priority: 6, duration: dur, gain: 1, at, occlude: true,
      build: (ctx) => { h = skidSource(ctx, this.env.noise, seed); const s = h.start.bind(h); h.start = (w, o) => { const g = h!.output as GainNode; h!.setIntensity(level, 12); g.gain.setValueAtTime(1, w); g.gain.linearRampToValueAtTime(0, w + dur); s(w, o); }; return h; } });
  }

  /** Estimated rpm/load for an AI car from speed and acceleration (3-speed automatic). */
  private drivetrain(e: TrafficEngine, speed: number, dt: number) {
    const prof = ENGINE_PROFILES[CLASS_ENGINE[e.vclass] ?? 'v8_small'];
    const heavy = e.vclass === 'bus' || e.vclass === 'garbage' || e.vclass === 'box_truck';
    const accel = (speed - e.lastSpeed) / Math.max(dt, 1e-3); e.lastSpeed = speed;
    const wheelRpm = (speed / (2 * Math.PI * 0.36)) * 60 * (heavy ? 4.6 : 3.0);
    const up = prof.redline * (0.45 + 0.3 * Math.min(1, Math.max(0, accel / 2)));
    if (wheelRpm * GEARS[e.gear] > up && e.gear < 2) e.gear++;
    if (e.gear > 0 && wheelRpm * GEARS[e.gear - 1] < prof.redline * 0.38) e.gear--;
    const target = Math.max(prof.idle * (speed < 0.5 ? 1 : 1.1), wheelRpm * GEARS[e.gear] * 1.08); // torque-converter slip
    e.rpm += (target - e.rpm) * Math.min(1, dt * 6);
    const load = speed < 0.3 ? 0.12 : Math.max(0.04, Math.min(1, 0.25 + accel / 2.2 + speed / 60));
    e.load += (load - e.load) * Math.min(1, dt * 5);
  }

  update(dt: number) {
    const env = this.env, [lx, ly, lz] = env.vm.listener.position, now = env.ctx.currentTime;
    // Attached vehicles.
    for (const st of this.attached.values()) {
      const p = st.v.position();
      if (st.last && dt > 0) st.vel = [(p[0] - st.last[0]) / dt, (p[1] - st.last[1]) / dt, (p[2] - st.last[2]) / dt];
      st.last = [p[0], p[1], p[2]];
      const sp = st.v.speed ? st.v.speed() : Math.hypot(st.vel[0], st.vel[2]);
      st.h()?.set(st.v.rpm(), st.v.load(), sp, env.weather.wet);
      if (st.skid) {
        st.skid.level *= Math.exp(-dt / 0.15); st.skid.h()?.setIntensity(st.skid.level, sp);
        if (st.skid.level < 0.03) { st.skid.voice.stop(0.1); st.skid = undefined; }
      }
    }
    // Sim traffic: nearest few get full engines, the rest feed the sector beds.
    const sectorD = [0, 0, 0, 0], sectorS = [0, 0, 0, 0], sectorH = [0, 0, 0, 0];
    const K = Math.max(0, env.q.engines - this.attached.size);
    let near = 0, nearSpeed = 0, nearHeavy = 0;
    if (this.sim) {
      const list = this.sim.vehicles as TrafficVehicleView[];
      this.stats.simVehicles = list.length;
      const c = env.canyon.state;
      const cand: { v: TrafficVehicleView; d: number }[] = [];
      for (const v of list) {
        const dx = v.x - lx, dz = v.z - lz, d = Math.hypot(dx, dz);
        if (d < 70) cand.push({ v, d });
        if (d > 400) continue;
        // Same canyon (along the listener's street axis) is heard in full; other blocks through/around buildings.
        const perp = Math.abs(dx * -c.az + dz * c.ax);
        const w = (perp < Math.max(12, c.width * 0.6) ? 1 : 0.3) / (1 + (d / 35) ** 2);
        const s = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
        sectorD[s] += w; sectorS[s] += w * v.speed; if (v.vclass === 'bus' || v.vclass === 'box_truck' || v.vclass === 'garbage') sectorH[s] += w;
        if (d < 60) { near += 1 / (1 + d / 20); nearSpeed += v.speed; if (v.vclass === 'bus' || v.vclass === 'box_truck') nearHeavy++; }
        this.vehicleEvents(v, now, dt);
      }
      cand.sort((a, b) => a.d - b.d);
      const keep = new Set(cand.slice(0, K).map((c) => c.v.id));
      for (const [id, e] of this.engines) if (!keep.has(id) || now - e.seen > 0.5) { e.voice.stop(0.4); e.siren?.stop(0.4); this.engines.delete(id); }
      for (const { v } of cand.slice(0, K)) {
        let e = this.engines.get(v.id);
        if (!e) {
          const te: TrafficEngine = { id: v.id, voice: null as unknown as Voice, h: null, gear: 0, rpm: 700, load: 0.2, lastSpeed: v.speed, pos: [v.x, v.y + 0.5, v.z], vel: [0, 0, 0], vclass: v.vclass, seen: now };
          te.voice = env.vm.play({ name: `traffic.${v.id}`, bus: 'sfx', category: 'vehicle', priority: 5, loop: true, gain: v.vclass === 'bus' || v.vclass === 'garbage' ? 1.1 : 0.85, at: () => te.pos, vel: () => te.vel, doppler: true, occlude: true,
            build: (ctx) => (te.h = engineSource(ctx, env.noise, CLASS_ENGINE[v.vclass] ?? 'v8_small', v.variant ^ v.id, 1)) });
          this.engines.set(v.id, (e = te));
        }
        if (dt > 0 && e.seen < now) e.vel = [(v.x - e.pos[0]) / dt, 0, (v.z - e.pos[2]) / dt];
        e.seen = now; e.pos = [v.x, v.y + 0.5, v.z];
        this.drivetrain(e, v.speed, dt);
        if (e.voice.src) e.h?.set(e.rpm, e.load, v.speed, env.weather.wet);
        const siren = (v.lights & VehicleLights.Siren) !== 0;
        if (siren && !e.siren) { const seed = this.rng.u32(); const te = e; e.siren = env.vm.play({ name: 'siren.car', bus: 'sfx', category: 'siren', priority: 7, loop: true, gain: 0.9, at: () => te.pos, vel: () => te.vel, doppler: true, occlude: true, build: (ctx) => sirenSource(ctx, 'wail', seed) }); }
        if (!siren && e.siren) { e.siren.stop(0.3); e.siren = undefined; }
      }
    } else {
      // No sim bound: synthesise the traffic mass from the clock and the street we are on.
      const tr = curve(CURVE.traffic, env.clock.hour);
      const c = env.canyon.state; const av = /Avenue|Broadway/.test(c.street) ? 1 : 0.35;
      for (let s = 0; s < 4; s++) { const along = (s < 2 ? Math.abs(c.ax) : Math.abs(c.az)) > 0.7; sectorD[s] = tr * av * (along ? 1.6 : 0.5); sectorS[s] = sectorD[s] * (8 + 4 * av); sectorH[s] = sectorD[s] * 0.12; }
      near = tr * av; nearSpeed = 9; nearHeavy = 0.1;
    }
    this.stats.fullEngines = this.engines.size + this.attached.size;
    env.traffic.near = Math.min(1, near / 3); env.traffic.speed = near > 0 ? nearSpeed / Math.max(1, near * 3) : 0; env.traffic.heavy = nearHeavy; env.traffic.fromSim = !!this.sim;
    for (let s = 0; s < 4; s++) {
      const h = this.sectors[s]; if (!h) continue;
      const D = sectorD[s], S = D > 0 ? sectorS[s] / D : 0, Hh = D > 0 ? sectorH[s] / D : 0;
      // Inside a park the traffic is across lawns and trees: open, further, lower.
      const parkK = 1 - 0.45 * (env.parkWeight ?? 0);
      h.v.setGain(D > 0.005 ? Math.min(1.5, 0.7 + 0.3 * Math.sqrt(D)) * parkK : 0);
      if (h.v.src && h.node) {
        const t = env.ctx.currentTime, P = h.node.parameters;
        P.get('density')!.setTargetAtTime(Math.min(6, D * 2.2), t, 0.4); P.get('speed')!.setTargetAtTime(S, t, 0.5); P.get('heavy')!.setTargetAtTime(Hh, t, 0.5);
        P.get('wet')!.setTargetAtTime(env.weather.wet, t, 1); P.get('gain')!.setTargetAtTime(1, t, 0.2);
      }
    }
    void ly;
  }

  private vehicleEvents(v: TrafficVehicleView, now: number, _dt: number) {
    const env = this.env; const [lx, , lz] = env.vm.listener.position; const d = Math.hypot(v.x - lx, v.z - lz);
    if (d > 80) return;
    // Bus stop: door hiss when the bus enters 'busStop'.
    const prev = this.busState.get(v.id); if (prev !== v.state) { this.busState.set(v.id, v.state); if (v.vclass === 'bus' && v.state === 'busStop') env.oneShot('bus.door', { category: 'vehicle', gain: 0.8, at: [v.x, v.y + 1.5, v.z] }); }
    // Brake squeal at walking pace.
    if ((v.lights & VehicleLights.Brake) && v.speed > 0.4 && v.speed < 3 && (this.brakeCool.get(v.id) ?? 0) < now && this.rng.next() < 0.004) {
      this.brakeCool.set(v.id, now + 20); env.oneShot('brake.squeal', { category: 'tyre', gain: v.vclass === 'bus' ? 0.6 : 0.35, at: [v.x, v.y + 0.4, v.z] });
    }
    // Manhole covers.
    const cell = v.speed > 4 && d < 60 ? this.manholeGrid.get(mkey(v.x, v.z)) : undefined;
    if (cell) for (const i of cell) {
      const [mx, mz] = this.manholes[i]; if (Math.abs(mx - v.x) > 1.4 || Math.abs(mz - v.z) > 1.4) continue;
      if ((this.manholeCool.get(i) ?? 0) > now) continue; this.manholeCool.set(i, now + 1.2); this.stats.manholes++;
      env.oneShot('manhole.clank', { category: 'impact', gain: 0.25 + Math.min(0.4, v.speed / 30), at: [mx, gh(mx, mz), mz] });
    }
  }

  dispose() {
    for (const st of this.attached.values()) { st.voice.stop(0.05); st.skid?.voice.stop(0.05); }
    for (const e of this.engines.values()) { e.voice.stop(0.05); e.siren?.stop(0.05); }
    for (const s of this.sectors) s.v.stop(0.05);
    this.attached.clear(); this.engines.clear(); this.sectors = [];
  }
}

const mkey = (x: number, z: number) => Math.floor(x / 4) * 100003 + Math.floor(z / 4);
function num(v: unknown, d: number): number { return typeof v === 'number' && isFinite(v) ? v : d; }
export function hash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
