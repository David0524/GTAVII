/**
 * The city's ambience, driven by place, the clock, the weather and the power state.
 *
 *  Beds (non-positional or listener-relative):
 *    roar      the whole city far away (level and brightness follow traffic and hour)
 *    hum       transformers, ballasts and neon (60 Hz family); drops out in a brownout
 *    wind      light summer gusts in the canyons
 *    walla x2  crowd on the left and right sidewalks, placed from the canyon measurement
 *    kids      walla in child mode in the nearest park, daytime
 *    rain      modal rain with surfaces from the surroundings; drips continue after rain stops
 *  Point emitters (streamed in and out by distance, capped per kind):
 *    subway gratings, steam, window AC units, neon buzz, window radios
 *  Scheduled events (Poisson, rates from the clock and district):
 *    distant sirens moving through the grid, horns, garment-district carts and dock bangs,
 *    jackhammers, birds and pigeons, ship horns from the Hudson at night, aircraft, garbage
 *    trucks before dawn, thunder, Sunday church bells, Fourth of July fireworks, signal relays.
 */
import type { Env } from '../env';
import type { Voice, SourceGraph } from '../core/voices';
import type { Vec3 } from '../config';
import { Subway, type Grating } from './subway';
import { CURVE, curve } from './cityMap';
import { Style } from '../../shared/chunkFormat';
import { PoiKind } from '../../shared/chunkFormat';
import { gratingSource, steamSource, acUnitSource, humSource, roarSource, windSource, workletSource, sirenSource, aircraftSource, type GratingHandle, type RoarHandle } from '../synth/live';
import { Rng } from '../worklets/dsp';
import { heightAt as gh } from '../../shared/terrain';
import type { RadioSystem } from '../radio/radio';

type EmitterKind = 'grating' | 'steam' | 'ac' | 'neon' | 'radio';
interface Emitter { kind: EmitterKind; x: number; y: number; z: number; seed: number; ref?: Grating; voice?: Voice; station?: string; bar?: boolean; nx?: number; nz?: number; dripT?: number }
const KIND_RADIUS: Record<EmitterKind, number> = { grating: 75, steam: 70, ac: 45, neon: 32, radio: 55 };
const KIND_CAP: Record<EmitterKind, number> = { grating: 6, steam: 3, ac: 8, neon: 4, radio: 2 };

interface Mix { avenue: number; park: number; garment: number; fur: number; eighth: number; deuce: number; herald: number; night: number; dark: number; enclosure: number }

export class Ambience {
  subway: Subway;
  private emitters: Emitter[] = [];
  private grid = new Map<number, Emitter[]>();
  private active = new Set<Emitter>();
  private beds: Record<string, { v: Voice; node?: AudioWorkletNode | null }> = {};
  mix: Mix = { avenue: 0, park: 0, garment: 0, fur: 0, eighth: 0, deuce: 0, herald: 0, night: 0, dark: 0, enclosure: 0 };
  private mixT = 0; private fieldT = 0;
  private timers: Record<string, number> = {};
  private rng = new Rng(7411);
  private dripLevel = 0; private canvas = 0;
  private lastPower: string = 'on';
  private signalPhase: { x: number; z: number; off: number }[] = [];
  private parkCentroids: { x: number; z: number }[] = [];
  stats = { emitters: 0, activeEmitters: 0, events: {} as Record<string, number> };

  constructor(private env: Env, region: { minZ: number; maxZ: number }, private radio: RadioSystem | null) {
    this.subway = new Subway(env.map, env.geo.streets, region);
    this.place();
  }

  // ------------------------------------------------------------------ placement (load time)
  private place() {
    const { geo, map } = this.env;
    for (const g of this.subway.gratings) this.addEmitter({ kind: 'grating', x: g.x, y: 0.05, z: g.z, seed: g.seed, ref: g });
    // Steam: a few Con Edison vents in avenue roadways (deterministic picks of intersections).
    geo.intersections.forEach((it, k) => { if (/Avenue|Broadway/.test(it.a + it.b) && k % 9 === 4) this.addEmitter({ kind: 'steam', x: it.x + 5, y: 0.1, z: it.z + 4, seed: k }); });
    // Window AC units on residential and hotel facades that face a street.
    for (let bi = 0; bi < geo.buildings.length; bi++) {
      const b = geo.buildings[bi];
      const residential = b.style === Style.Tenement || (b.use >= 1 && b.use <= 4) || b.style === Style.PrewarOffice;
      if (!residential || b.floors < 3) continue;
      const r = new Rng(bi * 2654435761); const ring = b.ring; const n = ring.length / 2;
      for (let k = 0; k < n; k++) {
        const x1 = ring[k * 2], z1 = ring[k * 2 + 1], x2 = ring[((k + 1) % n) * 2], z2 = ring[((k + 1) % n) * 2 + 1];
        const L = Math.hypot(x2 - x1, z2 - z1); if (L < 7) continue;
        const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2; const ns = geo.nearestStreet(mx, mz, 22); if (!ns) continue;
        let nx = (z2 - z1) / L, nz = -(x2 - x1) / L; if ((mx - b.x) * nx + (mz - b.z) * nz < 0) { nx = -nx; nz = -nz; }
        const count = Math.floor(L / 9);
        for (let c = 0; c < count; c++) {
          if (r.next() > (b.style === Style.Tenement ? 0.4 : 0.22)) continue;
          const t = r.next(); const fl = 1 + Math.floor(r.next() * Math.min(b.floors - 1, 9));
          this.addEmitter({ kind: 'ac', x: x1 + (x2 - x1) * t + nx * 0.4, y: fl * 3.3 + 1.2, z: z1 + (z2 - z1) * t + nz * 0.4, seed: r.u32(), nx, nz });
          if (r.next() < 0.08) this.addEmitter({ kind: 'radio', x: x1 + (x2 - x1) * t + nx * 0.2, y: fl * 3.3 + 1.5, z: z1 + (z2 - z1) * t + nz * 0.2, seed: r.u32() });
        }
      }
      // Neon over storefronts on Eighth Ave and the Deuce.
      const d = map.districts(b.x, b.z);
      if ((d.eighth > 0.5 || d.deuce > 0.5) && b.floors <= 6 && r.next() < 0.6) {
        const ns = geo.nearestStreet(b.x, b.z, 30);
        if (ns) {
          this.addEmitter({ kind: 'neon', x: b.x + (ns.px - b.x) * 0.8, y: 4, z: b.z + (ns.pz - b.z) * 0.8, seed: bi });
          // Bars and grind-house lobbies with the door propped open: jukebox/radio bleed at street level.
          if (r.next() < 0.45) this.addEmitter({ kind: 'radio', bar: true, x: b.x + (ns.px - b.x) * 0.7, y: 1.5, z: b.z + (ns.pz - b.z) * 0.7, seed: bi * 7 + 1 });
        }
      }
    }
    for (const p of geo.pois) if (p.kind === PoiKind.Signal) this.signalPhase.push({ x: p.x, z: p.z, off: ((p.x * 0.013 + p.z * 0.0071) % 1 + 1) % 1 });
    for (const pk of geo.parks) { let x = 0, z = 0; const n = pk.ring.length / 2; for (let k = 0; k < n; k++) { x += pk.ring[k * 2]; z += pk.ring[k * 2 + 1]; } if (n) this.parkCentroids.push({ x: x / n, z: z / n }); }
    this.stats.emitters = this.emitters.length;
  }
  private key(x: number, z: number) { return Math.floor(x / 50) * 100003 + Math.floor(z / 50); }
  /** Emitter y is given above local ground; seat it on the terrain. */
  private addEmitter(e: Emitter) { e.y += gh(e.x, e.z); this.emitters.push(e); const k = this.key(e.x, e.z); let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(e); }
  emitterCounts() { const c: Record<string, number> = {}; for (const e of this.emitters) c[e.kind] = (c[e.kind] ?? 0) + 1; return c; }

  // ------------------------------------------------------------------ beds
  start() {
    const { vm, noise } = this.env;
    let roar: RoarHandle | null = null;
    this.beds.roar = { v: vm.play({ name: 'bed.roar', bus: 'ambience', category: 'bed', priority: 6, loop: true, gain: 1, build: (ctx) => (roar = roarSource(ctx, noise)) }) };
    void roar;
    this.beds.hum = { v: vm.play({ name: 'bed.hum', bus: 'ambience', category: 'bed', priority: 3, loop: true, gain: 0, build: (ctx) => humSource(ctx, noise) }) };
    this.beds.wind = { v: vm.play({ name: 'bed.wind', bus: 'ambience', category: 'bed', priority: 2, loop: true, gain: 0, build: (ctx) => windSource(ctx, noise, 5) }) };
    const worklet = (name: string, key: string, ch: number, opts: Record<string, unknown>, at?: () => Vec3) => {
      const holder: { v: Voice; node?: AudioWorkletNode | null } = { v: null as unknown as Voice, node: null };
      holder.v = vm.play({ name: `bed.${key}`, bus: 'ambience', category: at ? 'crowd' : 'weather', priority: 4, loop: true, gain: 0, at, occlude: false, wet: 1.2,
        build: (ctx) => { const s = workletSource(ctx, name, ch, opts); holder.node = s.node; return s.graph; } });
      this.beds[key] = holder;
    };
    const side = (sgn: number) => (): Vec3 => {
      const l = this.env.vm.listener.position, c = this.env.canyon.state; const d = Math.max(3, Math.min(sgn < 0 ? c.dL : c.dR, 14) - 2.5);
      // Perpendicular to the street axis; listener-relative so the crowd stays on the sidewalks.
      const x = l[0] - c.az * d * sgn, z = l[2] + c.ax * d * sgn; return [x, gh(x, z) + 1.75, z];
    };
    worklet('t74-walla', 'wallaL', 2, { seed: 21, talkers: this.env.q.wallaTalkers }, side(-1));
    worklet('t74-walla', 'wallaR', 2, { seed: 22, talkers: this.env.q.wallaTalkers }, side(1));
    worklet('t74-walla', 'kids', 2, { seed: 23, talkers: Math.max(4, this.env.q.wallaTalkers - 2) }, () => { const p = this.nearestPark(); return [p.x, gh(p.x, p.z) + 1.35, p.z]; });
    worklet('t74-rain', 'rain', 2, { seed: 24 });
  }

  private nearestPark() {
    const [x, , z] = this.env.vm.listener.position; let best = { x: x + 300, z }, bd = Infinity;
    for (const p of this.parkCentroids) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
    return best;
  }

  private setParam(key: string, name: string, v: number) {
    const b = this.beds[key]; if (!b?.v.src || !b.node) return;
    b.node.parameters.get(name)?.setTargetAtTime(v, this.env.ctx.currentTime, 0.3);
  }

  private updateMix() {
    const { geo, map, canyon, clock } = this.env;
    const [x, , z] = this.env.vm.listener.position;
    const d = map.districts(x, z); const c = canyon.state;
    const ns = geo.nearestStreet(x, z, 60);
    const avenue = ns && (ns.street.w >= 17 || /Avenue|Broadway/.test(ns.street.n)) ? Math.max(0, 1 - ns.d / 40) : 0;
    const park = Math.max(0, 1 - geo.parkDistance(x, z, 120) / 70);
    const h = clock.hour;
    const target: Mix = { avenue, park, garment: d.garment, fur: d.fur, eighth: d.eighth, deuce: d.deuce, herald: d.herald, night: curve(CURVE.night, h), dark: curve(CURVE.dark, h), enclosure: 1 - c.openness };
    const k = 0.35; for (const key of Object.keys(target) as (keyof Mix)[]) this.mix[key] += (target[key] - this.mix[key]) * k;
    // Awnings and shopfront canvas within 20 m (low commercial frontage).
    let cv = 0; for (const b of geo.buildingsNear(x, z, 22)) if (b.style === Style.LowCommercial || b.use === 5) cv++;
    this.canvas = Math.min(1, cv / 4);
  }

  // ------------------------------------------------------------------ emitters
  private updateField() {
    const [lx, ly, lz] = this.env.vm.listener.position;
    const want = new Map<EmitterKind, { e: Emitter; d: number }[]>();
    const R = 80, k0x = Math.floor((lx - R) / 50), k1x = Math.floor((lx + R) / 50), k0z = Math.floor((lz - R) / 50), k1z = Math.floor((lz + R) / 50);
    for (let i = k0x; i <= k1x; i++) for (let j = k0z; j <= k1z; j++) {
      const a = this.grid.get(i * 100003 + j); if (!a) continue;
      for (const e of a) {
        const d = Math.hypot(e.x - lx, e.y - ly, e.z - lz); const r = KIND_RADIUS[e.kind] * (this.active.has(e) ? 1.15 : 1);
        if (d > r || !this.enabled(e)) continue;
        let l = want.get(e.kind); if (!l) want.set(e.kind, (l = [])); l.push({ e, d });
      }
    }
    const keep = new Set<Emitter>();
    for (const [kind, l] of want) { l.sort((a, b) => a.d - b.d); for (const { e } of l.slice(0, KIND_CAP[kind])) keep.add(e); }
    for (const e of this.active) if (!keep.has(e)) { e.voice?.stop(0.6); e.voice = undefined; this.active.delete(e); }
    for (const e of keep) if (!this.active.has(e)) { this.spawn(e); this.active.add(e); }
    this.stats.activeEmitters = this.active.size;
  }

  private enabled(e: Emitter): boolean {
    const p = this.env.power(e.x, e.z), h = this.env.clock.hour;
    if (e.kind === 'ac') return p !== 'off' && (h > 10 || h < 2 || (e.seed % 3 === 0)); // hot June: most units run afternoon to late night
    if (e.kind === 'neon') return p === 'on' && curve(CURVE.dark, h) > 0.3;
    if (e.kind === 'radio' && !this.radio?.enabled) return false;
    if (e.kind === 'radio' && e.bar) return !!this.radio && p !== 'off' && curve(CURVE.night, h) > 0.3;
    if (e.kind === 'radio') return !!this.radio && (h > 17 || h < 1.5) && (p !== 'off' || e.seed % 4 === 0); // some are battery transistors
    return true;
  }

  private spawn(e: Emitter) {
    const { vm, noise } = this.env; const at: Vec3 = [e.x, e.y, e.z];
    const sag = this.env.power(e.x, e.z) === 'dim' ? 0.93 : 1;
    let build: (ctx: BaseAudioContext) => SourceGraph; let gain = 1; let cat: 'subway' | 'emitter' | 'radio' = 'emitter';
    switch (e.kind) {
      case 'grating': build = (ctx) => gratingSource(ctx, noise, e.seed); cat = 'subway'; gain = 1; break;
      case 'steam': build = (ctx) => steamSource(ctx, noise, e.seed); gain = 0.5; break;
      case 'ac': build = (ctx) => acUnitSource(ctx, noise, e.seed, sag); gain = 0.35; break;
      case 'neon': build = (ctx) => humSource(ctx, noise); gain = 0.3; break;
      case 'radio': {
        const st = this.radio!.stations[e.seed % this.radio!.stations.length]; e.station = st.id;
        build = (ctx) => this.radio!.worldSpeaker(ctx, st.id, e.bar ? 'bar' : 'window'); gain = e.bar ? 0.7 : 0.45; cat = 'radio'; break;
      }
    }
    e.voice = vm.play({ name: `em.${e.kind}`, bus: 'ambience', category: cat, priority: e.kind === 'grating' ? 5 : 3, loop: true, gain, at, occlude: true, build });
  }

  // ------------------------------------------------------------------ scheduled events
  private every(key: string, ratePerSec: number, dt: number): boolean {
    if (ratePerSec <= 0) return false;
    if (this.timers[key] === undefined) this.timers[key] = this.rng.exp(ratePerSec);
    if ((this.timers[key] -= dt) > 0) return false;
    this.timers[key] = this.rng.exp(ratePerSec);
    this.stats.events[key] = (this.stats.events[key] ?? 0) + 1;
    return true;
  }
  private around(minD: number, maxD: number, y = 1.5): Vec3 {
    const [x, , z] = this.env.vm.listener.position; const a = this.rng.next() * Math.PI * 2, d = this.rng.range(minD, maxD);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; return [px, gh(px, pz) + y, pz];
  }

  private events(dt: number) {
    const env = this.env, m = this.mix, h = env.clock.hour, wd = env.clock.weekday;
    const [lx, , lz] = env.vm.listener.position;
    // Distant sirens travelling the grid; the corner diffraction does the "bouncing off the canyons".
    if (this.every('siren', curve(CURVE.sirens, h) / 70, dt)) this.siren();
    // Garment District: carts, dock plates, rack wheels, on working weekdays.
    const garment = (m.garment + m.fur * 0.6) * curve(CURVE.garment, h) * (wd >= 1 && wd <= 5 ? 1 : wd === 6 ? 0.3 : 0);
    if (garment > 0.05) {
      if (this.every('cart', garment * 0.35, dt)) {
        const c = env.canyon.state, s = this.rng.next() < 0.5 ? -1 : 1, d = Math.max(3, Math.min(s < 0 ? c.dL : c.dR, 12) - 2), along = this.rng.range(-30, 30);
        const p0: Vec3 = [lx - c.az * d * s + c.ax * along, 0.5, lz + c.ax * d * s + c.az * along]; const v = 1.4 * (this.rng.next() < 0.5 ? -1 : 1);
        const t0 = env.ctx.currentTime;
        env.oneShot('cart.rattle', { category: 'emitter', gain: 0.7, at: () => { const t = env.ctx.currentTime - t0; return [p0[0] + c.ax * v * t, 0.5, p0[2] + c.az * v * t]; } });
      }
      if (this.every('dock', garment * 0.06, dt)) env.oneShot('dock.bang', { category: 'impact', gain: 0.6, at: this.around(25, 90, 1) });
    }
    if (this.every('jackhammer', (h > 7.5 && h < 16.5 && wd >= 1 && wd <= 5 ? 1 : 0) * 0.025, dt)) {
      const p = this.around(80, 220, 0.5); for (let k = 0; k < 4; k++) setTimeoutAudio(env, k * 3.6, () => env.oneShot('jackhammer', { category: 'impact', gain: 0.45, at: p }));
    }
    // Birds: sparrows and starlings in the parks, pigeons on ledges everywhere by day.
    const day = curve(CURVE.birds, h) * (env.weather.kind === 'rain' ? 0.15 : 1);
    if (this.every('sparrow', day * (0.15 + m.park * 1.8), dt)) env.oneShot(this.rng.next() < 0.75 ? 'bird.sparrow' : 'bird.starling', { category: 'animal', gain: 0.45, at: this.around(8, 40, this.rng.range(3, 9)), rate: this.rng.range(0.92, 1.08) });
    if (this.every('pigeon', (1 - curve(CURVE.dark, h)) * 0.06 * (env.weather.kind === 'rain' ? 0.3 : 1), dt)) env.oneShot('bird.pigeon', { category: 'animal', gain: 0.35, at: this.around(6, 25, this.rng.range(5, 14)) });
    // Night: ship horns from the Hudson piers.
    if (this.every('ship', m.night * 0.004, dt)) env.oneShot('ship.horn', { category: 'siren', gain: 0.5, at: [-2600, 5, lz + this.rng.range(-600, 600)], wet: 2 });
    // Aircraft high overhead (rare, quieter in rain).
    if (this.every('aircraft', (h > 6 && h < 23 ? 0.0035 : 0.0008), dt)) {
      const dur = 38; env.vm.play({ name: 'aircraft', bus: 'ambience', category: 'bed', priority: 2, duration: dur, gain: 0.25, build: (ctx) => aircraftSource(ctx, env.noise, dur) });
    }
    // Sanitation trucks before dawn.
    if (this.every('garbage', (h > 4 && h < 7.5 ? 0.012 : 0), dt)) env.oneShot('truck.compactor', { category: 'vehicle', gain: 0.75, at: this.around(30, 120, 1.2) });
    // Thunder (visual flash first: the engine gets 'lightning' with the delay to the thunder).
    if (env.weather.kind === 'rain' && this.every('thunder', 0.025 * env.weather.rain, dt)) {
      const near = this.rng.next() < 0.3, dist = near ? this.rng.range(400, 1200) : this.rng.range(2500, 7000);
      env.emit('lightning', { distance: dist, delay: dist / 343, near });
      setTimeoutAudio(env, dist / 343, () => env.oneShot(near ? 'thunder.near' : 'thunder.far', { category: 'weather', gain: near ? 0.42 : 0.28, priority: 6 }));
    }
    // Sunday church bells (generic bells; two real parish locations near Penn Station).
    if (wd === 0 && ((h > 8.75 && h < 9) || (h > 10.75 && h < 11))) {
      if (this.every('bell', 0.9, dt)) for (const [x, z] of [[env.map.x('8th Avenue') + 130, env.map.z(30) - 30], [env.map.x('6th Avenue') - 140, env.map.z(31) + 20]] as [number, number][]) env.oneShot('bell', { category: 'siren', gain: 0.5, at: [x, gh(x, z) + 30, z], wet: 1.5 });
    }
    // Fourth of July fireworks over the East River.
    if (env.clock.date.endsWith('-07-04') && h > 21.2 && h < 21.8 && this.every('firework', 1.5, dt)) env.oneShot('firework', { category: 'siren', gain: 0.8, at: [1600, 120, lz + this.rng.range(-800, 400)], wet: 2.2 });
    // Signal controller relays: each nearby signal steps phase twice per 90 s cycle.
    if (env.power(lx, lz) === 'on') {
      const t = (env.clock.minutes * 60) / 90; // game seconds / 90
      for (const s of this.signalPhase) {
        if (Math.abs(s.x - lx) > 25 || Math.abs(s.z - lz) > 25) continue;
        const ph = (t + s.off) % 1, prev = this.lastSig.get(s) ?? ph; this.lastSig.set(s, ph);
        if ((prev < 0.5 && ph >= 0.5) || prev > ph) env.oneShot('signal.click', { category: 'footstep', gain: 0.35, at: [s.x, gh(s.x, s.z) + 2.5, s.z] });
      }
    }
  }
  private lastSig = new Map<object, number>();

  private siren() {
    const env = this.env; const g = env.geo; const [lx, , lz] = env.vm.listener.position;
    const cands = g.intersections.filter((i) => { const d = Math.hypot(i.x - lx, i.z - lz); return d > 250 && d < 900; });
    if (!cands.length) return;
    const it = cands[(this.rng.next() * cands.length) | 0]; const ns = g.nearestStreet(it.x, it.z, 20);
    const dx = ns ? ns.dx : 1, dz = ns ? ns.dz : 0, sp = this.rng.range(11, 17) * (this.rng.next() < 0.5 ? 1 : -1), dur = 35;
    const t0 = env.ctx.currentTime; const mode = (['wail', 'wail', 'yelp', 'hilo'] as const)[(this.rng.next() * 4) | 0];
    const pos = (): Vec3 => { const t = env.ctx.currentTime - t0; const x = it.x + dx * sp * t, z = it.z + dz * sp * t; return [x, gh(x, z) + 2, z]; };
    const seed = this.rng.u32();
    const v = env.vm.play({ name: 'siren', bus: 'sfx', category: 'siren', priority: 5, duration: dur, gain: 1.6, at: pos, vel: () => [dx * sp, 0, dz * sp], doppler: true, occlude: true, wet: 1.6,
      build: (ctx) => { const s = sirenSource(ctx, mode, seed); const o = s.start.bind(s); s.start = (w, off) => { s.output.gain.setValueAtTime(0, w); s.output.gain.linearRampToValueAtTime(1, w + 2); s.output.gain.setValueAtTime(1, w + dur - 4); s.output.gain.linearRampToValueAtTime(0, w + dur - 0.5); o(w, off); }; return s; } });
    void v;
  }

  /** Emit a siren on demand (test scene button, scripted events). */
  triggerSiren() { this.siren(); }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    const env = this.env;
    if ((this.mixT -= dt) <= 0) { this.mixT = 0.25; this.updateMix(); }
    const [lx, , lz] = env.vm.listener.position;
    const power = env.power(lx, lz);
    if (power !== this.lastPower) {
      if (power === 'off' || (power === 'dim' && this.lastPower === 'on')) env.oneShot('power.down', { category: 'bed', gain: power === 'off' ? 0.7 : 0.35, priority: 7 });
      else if (power === 'on') env.oneShot('power.up', { category: 'bed', gain: 0.4, priority: 7 });
      this.lastPower = power;
      for (const e of [...this.active]) { e.voice?.stop(0.3); e.voice = undefined; this.active.delete(e); } // respawn with new power state
    }
    this.subway.update(dt, env.clock.hour, power !== 'off');
    if ((this.fieldT -= dt) <= 0) { this.fieldT = 0.5; this.updateField(); }
    for (const e of this.active) {
      if (e.kind === 'grating' && e.voice?.src) { const [r, a, s] = this.subway.gratingState(e.ref!); (e.voice.src as GratingHandle).set(r, a, s); }
      // Condensate dripping off AC units onto the sidewalk below.
      else if (e.kind === 'ac' && env.live && (e.dripT = (e.dripT ?? this.rng.range(1, 6)) - dt) <= 0) {
        e.dripT = this.rng.range(2.5, 9);
        env.oneShot('drip', { category: 'emitter', gain: 0.5, at: [e.x + (e.nx ?? 0) * 0.3, 0.16, e.z + (e.nz ?? 0) * 0.3], rate: this.rng.range(0.9, 1.1) });
      }
    }
    const m = this.mix, h = env.clock.hour;
    const t = env.traffic, inside = env.interior ? 1 : 0;
    const pw = power === 'on' ? 1 : power === 'dim' ? 0.45 : 0;
    // Roar: whole-city bed. Brighter and louder by day, sags in a brownout (the city's hum drops out).
    const roarLvl = (0.06 + 0.12 * curve(CURVE.traffic, h) + 0.05 * m.avenue * t.near) * (0.75 + 0.25 * pw);
    const roarV = this.beds.roar.v; roarV.setGain(1);
    if (roarV.src) (roarV.src as RoarHandle).set(roarLvl, 0.35 + 0.4 * m.avenue + 0.25 * (1 - m.enclosure));
    this.beds.hum.v.setGain(pw * (0.12 + 0.35 * m.dark + 0.4 * (m.eighth + m.deuce) * m.night));
    this.beds.wind.v.setGain((0.12 + 0.3 * m.park + 0.15 * (1 - m.enclosure)) * (env.weather.kind === 'rain' ? 1.6 : env.weather.kind === 'overcast' ? 1.2 : 1));
    // Crowds: sim pedestrian count near the listener, else the clock curve by district.
    const peds = env.peds.fromSim ? env.peds.near : curve(CURVE.peds, h) * (0.35 + 0.5 * m.avenue + 0.6 * m.herald + 0.3 * m.garment * curve(CURVE.garment, h) + 0.7 * (m.eighth + m.deuce) * m.night);
    const rainK = 1 - 0.75 * env.weather.rain;
    const crowd = Math.min(1, peds) * rainK * (1 - m.park * 0.5);
    for (const k of ['wallaL', 'wallaR']) { this.beds[k].v.setGain(Math.min(1, 0.25 + crowd) * crowd * 1.1); this.setParam(k, 'density', Math.min(1, crowd * 1.2)); this.setParam(k, 'excite', Math.min(1, 0.2 + 0.6 * (m.eighth + m.deuce) * m.night + 0.2 * m.herald)); this.setParam(k, 'gain', 1); }
    const kidsOn = h > 9 && h < 19.5 && env.weather.kind !== 'rain' ? (env.clock.weekday === 0 || env.clock.weekday === 6 ? 1 : 0.6) : 0;
    this.beds.kids.v.setGain(kidsOn * 0.7); this.setParam('kids', 'density', 0.6); this.setParam('kids', 'child', 1); this.setParam('kids', 'excite', 0.8); this.setParam('kids', 'gain', 1);
    // Rain and its surfaces; after the rain, drips off fire escapes and AC units for minutes.
    const rain = env.weather.rain;
    this.dripLevel = rain > 0.05 ? Math.min(1, this.dripLevel + dt * 0.2) : this.dripLevel * Math.exp(-dt / 120);
    this.beds.rain.v.setGain(rain > 0.01 || this.dripLevel > 0.02 ? 0.6 : 0);
    this.setParam('rain', 'intensity', rain * (inside ? 0.6 : 1));
    this.setParam('rain', 'puddle', 1); this.setParam('rain', 'pavement', 1.2); this.setParam('rain', 'metal', 0.3 + 1.2 * m.avenue * t.near);
    this.setParam('rain', 'canvas', this.canvas * 1.5); this.setParam('rain', 'leaves', m.park * 2); this.setParam('rain', 'drips', this.dripLevel * (0.4 + 0.6 * m.enclosure)); this.setParam('rain', 'gain', 1);
    if (env.live) this.events(dt);
  }

  dispose() { for (const b of Object.values(this.beds)) b.v.stop(0.05); for (const e of this.active) e.voice?.stop(0.05); this.active.clear(); }
}

/** Delay in *audio* time (works under OfflineAudioContext, pauses while suspended). */
export function setTimeoutAudio(env: Env, delay: number, fn: () => void) { pendingAudio.push({ at: env.ctx.currentTime + delay, fn, ctx: env.ctx }); }
const pendingAudio: { at: number; fn: () => void; ctx: BaseAudioContext }[] = [];
export function runAudioTimers(ctx: BaseAudioContext) {
  for (let i = pendingAudio.length - 1; i >= 0; i--) if (pendingAudio[i].ctx === ctx && ctx.currentTime >= pendingAudio[i].at) { const p = pendingAudio[i]; pendingAudio.splice(i, 1); p.fn(); }
}
export function clearAudioTimers(ctx: BaseAudioContext) { for (let i = pendingAudio.length - 1; i >= 0; i--) if (pendingAudio[i].ctx === ctx) pendingAudio.splice(i, 1); }
