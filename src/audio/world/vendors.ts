/**
 * Street vendors (docs/briefs/STREET_VENDORS.md): the griddle and the steam pot on the hot-dog
 * cart, the nut roaster, the Italian-ice hand bell, an ice-cream truck's chime (an original motif,
 * never a known truck tune), change on the counter, the shoeshine rag, cart wheels on the
 * pavement and the crash when a cart goes over. Calls are narrative's `barks/vendor_calls` pool
 * (context = vendor type) spoken with the build-time voices.
 *
 * Sim-driven (sim fb337dc, src/sim/vendors.ts): `bindSim` listens to vendorSpawned / vendorOpened / vendorGone,
 * vendorCall (barks.vendor_calls), vendorShout, monteScatter, vendorServed, vendorCower / vendorFled,
 * vendorAct (right_cart = the cart just went over; serve = a player sale) and vendorRecovered, and reads cart
 * positions and open state from `sim.vendorViews` every frame (pushed carts rattle). When the sim drives,
 * call timing is the sim's. `audio.vendor(id, type, at)` stays for things the sim doesn't own (the ice-cream
 * truck, scripted scenes); its handle also takes a physics impulse for a knock-over.
 * Cost: at most a few looping voices within 45 m; everything else is scheduled one-shots.
 */
import type { Env } from '../env';
import type { Vec3 } from '../config';
import type { Voice } from '../core/voices';
import { bufferSource } from '../synth/live';

/** Types from content/vendors.json, plus the ice-cream truck from the brief. */
export type VendorType = 'hot_dog' | 'pretzel_knish' | 'italian_ice' | 'nut_roaster' | 'coffee_cart' | 'fruit_stand' | 'flower_stand' | 'newsstand' | 'shoeshine' | 'peddler' | 'monte' | 'ice_cream_truck';

interface LoopSpec { family: string; gain: number; rate?: number }
interface TypeSpec {
  /** Bark context in barks/vendor_calls.json (null: silent type). */
  call: string | null;
  /** Mean seconds between calls while someone is near. */
  callEvery: number;
  loops: LoopSpec[];
  /** Periodic one-shot signature: family, mean interval (s), gain. */
  fx?: { family: string; every: number; gain: number; burst?: number };
  /** Has wheels (pushed carts rattle when moved; carts spill when knocked over). */
  cart: boolean;
}

const TYPES: Record<VendorType, TypeSpec> = {
  hot_dog: { call: 'hot_dog', callEvery: 35, cart: true, loops: [{ family: 'vendor.steam', gain: 0.3 }, { family: 'vendor.sizzle', gain: 0.26 }] },
  pretzel_knish: { call: 'pretzel', callEvery: 40, cart: true, loops: [{ family: 'vendor.roaster', gain: 0.25, rate: 0.8 }] },
  italian_ice: { call: 'ice', callEvery: 45, cart: true, loops: [], fx: { family: 'vendor.bell', every: 28, gain: 0.35 } },
  nut_roaster: { call: 'nuts', callEvery: 40, cart: true, loops: [{ family: 'vendor.roaster', gain: 0.5 }] },
  coffee_cart: { call: 'coffee', callEvery: 30, cart: true, loops: [{ family: 'vendor.steam', gain: 0.12, rate: 1.15 }] },
  fruit_stand: { call: 'fruit', callEvery: 60, cart: false, loops: [] },
  flower_stand: { call: 'flowers', callEvery: 60, cart: false, loops: [] },
  newsstand: { call: 'news', callEvery: 45, cart: false, loops: [], fx: { family: 'paper.crumple', every: 12, gain: 0.2 } },
  shoeshine: { call: 'shine', callEvery: 55, cart: false, loops: [], fx: { family: 'vendor.rag', every: 9, gain: 0.3, burst: 4 } },
  peddler: { call: 'peddler', callEvery: 40, cart: false, loops: [] },
  monte: { call: 'monte', callEvery: 22, cart: false, loops: [] },
  ice_cream_truck: { call: null, callEvery: 0, cart: false, loops: [], fx: { family: 'vendor.chime', every: 9, gain: 0.45 } },
};
const LOOP_IN = 40, LOOP_OUT = 50, ACTIVE = 70, CALL_RANGE = 30;
/** Never two vendor calls closer together than this (seconds), city-wide. */
const CALL_GAP = 5;

export interface VendorHandle {
  /** A sale: change on the counter. */
  sale(): void;
  /** Cart knocked over (impulse in N·s scales the crash); the cooking stops and the vendor shouts. */
  knockOver(impulse?: number): void;
  /** Cart righted / stand reopened. */
  reopen(): void;
  /** New position; speed (m/s) > 0.3 rattles the wheels. */
  move(at: Vec3, speed?: number): void;
  /** The vendor reacts to danger nearby (gunfire, a wreck): one scared or angry line. */
  react(kind: 'danger' | 'traffic'): void;
  remove(): void;
}

interface Vendor { simDriven?: boolean; id: string; type: VendorType; spec: TypeSpec; at: Vec3; speed: number; open: boolean; loops: Voice[]; nextCall: number; nextFx: number; burst: number; rattleT: number }

/** The parts of the sim's VendorView audio reads. */
export interface VendorViewLike { id: string; kind: string; state: string; cartX: number; cartZ: number; open: boolean }
export interface VendorSim { on(type: string, cb: (e: any) => void): void; vendorViews?: readonly VendorViewLike[] }

export type Bark = (pool: string, context: string, at: () => Vec3, emotions?: readonly string[]) => Promise<boolean>;

export class Vendors {
  private list = new Map<string, Vendor>();
  private lastCall = -1e9;
  private handles = new Map<string, VendorHandle>();
  private sim: VendorSim | null = null;
  private lastSpill = new Map<string, number>();
  stats = { vendors: 0, loops: 0, calls: 0, sales: 0, spills: 0 };

  constructor(private env: Env, private bark: Bark) {}

  add(id: string, type: VendorType, at: Vec3): VendorHandle {
    const spec = TYPES[type] ?? TYPES.peddler; this.remove(id);
    const now = this.env.ctx.currentTime, r = this.env.rng;
    const v: Vendor = { id, type, spec, at: [...at] as Vec3, speed: 0, open: true, loops: [], nextCall: now + r.range(3, spec.callEvery || 10), nextFx: now + r.range(1, spec.fx?.every ?? 10), burst: 0, rattleT: 0 };
    this.list.set(id, v); this.stats.vendors = this.list.size;
    if (!this.env.bank.groupsLoaded.has('vendors')) void this.env.bank.loadGroup('vendors');
    const pos = () => v.at;
    const h: VendorHandle = {
      sale: () => { this.stats.sales++; this.env.oneShot('vendor.change', { category: 'emitter', at: [v.at[0], v.at[1] + 0.9, v.at[2]], gain: 0.5, rate: r.range(0.95, 1.05), priority: 5 }); },
      knockOver: (impulse = 400) => {
        const t = this.env.ctx.currentTime; if (t - (this.lastSpill.get(id) ?? -1e9) < 2) return; this.lastSpill.set(id, t); // physics and the sim notice may both report it
        const k = Math.max(0.3, Math.min(1, impulse / 800)); this.stats.spills++;
        this.env.oneShot('vendor.spill', { category: 'impact', at: [v.at[0], v.at[1] + 0.4, v.at[2]], gain: 0.4 + 0.6 * k, rate: 1.05 - 0.1 * k, priority: 7 });
        if (v.spec.cart) this.env.oneShot('cart.rattle', { category: 'impact', at: pos, gain: 0.5 * k, rate: 1.2, priority: 5 });
        v.open = false; this.stopLoops(v);
        void this.bark('vendor_calls', 'any', pos, ['furious', 'angry']); // the shout lands as soon as its render streams in
        this.lastCall = this.env.ctx.currentTime;
      },
      reopen: () => { v.open = true; },
      move: (p, speed = 0) => { v.at[0] = p[0]; v.at[1] = p[1]; v.at[2] = p[2]; v.speed = speed; },
      react: (kind) => { if (this.env.ctx.currentTime - this.lastCall < 1.5) return; this.lastCall = this.env.ctx.currentTime; void this.bark('vendor_calls', 'any', pos, kind === 'danger' ? ['scared'] : ['angry']); },
      remove: () => this.remove(id),
    };
    this.handles.set(id, h);
    return h;
  }

  remove(id: string) { const v = this.list.get(id); if (!v) return; this.stopLoops(v); this.list.delete(id); this.handles.delete(id); this.lastSpill.delete(id); this.stats.vendors = this.list.size; }

  private stopLoops(v: Vendor) { for (const l of v.loops) l.stop(0.4); v.loops = []; }

  /** Listen to the sim's vendor events (see the header). Idempotent per sim. */
  bindSim(sim: VendorSim) {
    if (this.sim === sim) return; this.sim = sim;
    const y = (x: number, z: number) => this.ground(x, z);
    const h = (e: { id?: string }) => (e?.id ? this.handles.get(e.id) : undefined);
    sim.on('vendorSpawned', (e: { id: string; kind: VendorType; x: number; z: number; cart: { x: number; z: number } | null; arriving?: boolean }) => {
      const cx = e.cart?.x ?? e.x, cz = e.cart?.z ?? e.z; this.add(e.id, e.kind, [cx, y(cx, cz), cz]);
      const v = this.list.get(e.id)!; v.simDriven = true; if (e.arriving) v.open = false; // cooking starts when the cart is set up
    });
    sim.on('vendorOpened', (e) => { const v = this.list.get(e?.id); if (v) v.open = true; });
    sim.on('vendorGone', (e) => this.remove(e?.id));
    sim.on('vendorCall', (e: { id: string; kind: string }) => this.call(e.id));
    sim.on('vendorShout', (e) => h(e)?.react('traffic'));
    sim.on('vendorCower', (e) => h(e)?.react('danger'));
    sim.on('vendorFled', (e) => h(e)?.react('danger'));
    sim.on('vendorServed', (e) => h(e)?.sale());
    sim.on('vendorAct', (e: { id: string; act: string }) => { if (e.act === 'right_cart') h(e)?.knockOver(); else if (e.act === 'serve') h(e)?.sale(); });
    sim.on('vendorRecovered', (e) => h(e)?.reopen());
    // The lookout's warning, then the crew scatters (the monte box has no handle once the crew is gone).
    sim.on('monteScatter', (e: { id: string; x: number; z: number }) => {
      const at: Vec3 = [e.x, y(e.x, e.z) + 1.6, e.z]; this.lastCall = this.env.ctx.currentTime; this.stats.calls++;
      void this.bark('vendor_calls', 'monte', () => at, ['alarmed']);
    });
  }
  private ground(x: number, z: number) { return this.groundFn ? this.groundFn(x, z) : 0; }
  /** Terrain height (set by the facade once terrain is loaded). */
  groundFn: ((x: number, z: number) => number) | null = null;

  /** A sim-timed call: same 30 m range and city-wide gap as self-timed calls. */
  private call(id: string) {
    const v = this.list.get(id); if (!v || !v.spec.call || !v.open) return;
    const now = this.env.ctx.currentTime, [lx, , lz] = this.env.vm.listener.position;
    if (Math.hypot(v.at[0] - lx, v.at[2] - lz) > CALL_RANGE || now - this.lastCall < CALL_GAP) return;
    this.lastCall = now; this.stats.calls++; void this.bark('vendor_calls', v.spec.call, () => [v.at[0], v.at[1] + 1.6, v.at[2]]);
  }

  /** Cart positions and open state from the sim's views (pushed carts move; speed from the frame delta). */
  private syncViews(dt: number) {
    const views = this.sim?.vendorViews; if (!views) return;
    for (const w of views) {
      const v = this.list.get(w.id); if (!v || !v.simDriven) continue;
      const d = Math.hypot(w.cartX - v.at[0], w.cartZ - v.at[2]);
      v.speed = dt > 0 && d < 5 ? v.speed * 0.8 + 0.2 * (d / dt) : 0;
      v.at[0] = w.cartX; v.at[2] = w.cartZ; if (d > 0.01) v.at[1] = this.ground(w.cartX, w.cartZ);
      v.open = w.open;
    }
  }

  update(dt: number) {
    if (!this.env.live) return;
    this.syncViews(dt);
    const now = this.env.ctx.currentTime, r = this.env.rng; const [lx, , lz] = this.env.vm.listener.position;
    let loops = 0;
    for (const v of this.list.values()) {
      const d = Math.hypot(v.at[0] - lx, v.at[2] - lz);
      // Cooking loops with hysteresis; the voice manager handles occlusion/virtualisation inside the ring.
      if (v.open && d < LOOP_IN && !v.loops.length && v.spec.loops.length) this.startLoops(v);
      else if (v.loops.length && (d > LOOP_OUT || !v.open)) this.stopLoops(v);
      loops += v.loops.length;
      if (d > ACTIVE) continue;
      // Wheels: pushed carts rattle at a rate set by speed.
      if (v.spec.cart && v.speed > 0.3) { v.rattleT -= dt; if (v.rattleT <= 0) { v.rattleT = 2.0 / Math.min(2, v.speed); this.env.oneShot('cart.rattle', { category: 'emitter', at: () => v.at, gain: Math.min(0.4, 0.15 + v.speed * 0.12), rate: 0.85 + v.speed * 0.1, priority: 4 }); } }
      if (!v.open) continue;
      const fx = v.spec.fx;
      if (fx && now >= v.nextFx) {
        this.env.oneShot(fx.family, { category: 'emitter', at: [v.at[0], v.at[1] + (v.type === 'ice_cream_truck' ? 2.4 : 1.0), v.at[2]], gain: fx.gain, rate: r.range(0.97, 1.03), priority: v.type === 'ice_cream_truck' ? 6 : 4 });
        if (fx.burst && v.burst <= 0) v.burst = fx.burst - 1;
        if (v.burst > 0) { v.burst--; v.nextFx = now + r.range(0.25, 0.4); } else v.nextFx = now + fx.every * r.range(0.6, 1.4);
      }
      if (v.spec.call && !v.simDriven && now >= v.nextCall) {
        v.nextCall = now + v.spec.callEvery * r.range(0.6, 1.5);
        if (d < CALL_RANGE && now - this.lastCall > CALL_GAP) { this.lastCall = now; this.stats.calls++; void this.bark('vendor_calls', v.spec.call, () => [v.at[0], v.at[1] + 1.6, v.at[2]]); }
      }
    }
    this.stats.loops = loops;
  }

  private startLoops(v: Vendor) {
    for (const l of v.spec.loops) {
      const buf = this.env.bank.get(l.family); if (!buf) { void this.env.bank.loadGroup('vendors'); return; }
      v.loops.push(this.env.vm.play({ name: `vendor.${v.id}.${l.family}`, bus: 'ambience', category: 'emitter', priority: 4, gain: l.gain * this.env.bank.gainOf(l.family), loop: true, at: () => [v.at[0], v.at[1] + 0.9, v.at[2]], occlude: true,
        build: (ctx) => bufferSource(ctx, buf, { rate: (l.rate ?? 1) * this.env.rng.range(0.97, 1.03), loop: true }) }));
    }
  }

  dispose() { for (const v of this.list.values()) this.stopLoops(v); this.list.clear(); }
}
