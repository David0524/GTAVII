/**
 * The sim in a Web Worker (or any message port): `serveSimulation` runs a real Simulation behind a port and
 * `RemoteSimulation` is its main-thread stand-in with the same view getters and call surface.
 *
 *  - Per frame the client posts `{dt, focus, view?, actors?}`; the host steps and answers with the views
 *    packed into typed arrays (transferred, not copied) plus a growing string table (classes, states,
 *    archetypes), the frame's events, and the small views (police, vendors) as plain objects.
 *  - Views on the client are the last snapshot received: one frame behind with a real worker, current with a
 *    synchronous in-memory port (Node tests).
 *  - Setters are fire-and-forget (`cmd`); queries return promises (`call`). Functions can't cross a worker:
 *    use `setDensityAreas` instead of `setDensityHook`.
 *  - Deterministic: the host is the same Simulation with the same seed and fixed step.
 */
import type { TrafficVehicleView, VehicleClass } from '../shared/traffic';
import type { WildlifeView } from './wildlife';
import type { PoliceView } from './police';
import type { VendorView } from './vendors';
import type { ScenarioView } from './scenarios';
import type { PedView, SimOptions } from './index';

export interface Port { postMessage(msg: unknown, transfer?: Transferable[]): void; onmessage: ((ev: { data: any }) => void) | null }

const VI = 5, VF = 5; // vehicles: ints id, vclass, lights, variant, state | floats x, y, z, yaw, speed
const PI_ = 6, PF = 6; // peds: ints id, archetype, state, variant, carry, onRoad | floats x, y, z, yaw, speed, nerve
const WI = 4, WF = 5; // wildlife: ints id, species, state, variant | floats x, y, z, yaw, speed

// ------------------------------------------------------------------ host
/** Serve a Simulation over `port` (call inside the worker with `self`). `make` builds it from the init options. */
export function serveSimulation(port: Port, make: (opts: SimOptions) => Promise<any> | any) {
  let sim: any = null;
  const strings = new Map<string, number>(); let sent = 0; const table: string[] = [];
  const id = (s: string) => { let i = strings.get(s); if (i === undefined) { i = table.length; strings.set(s, i); table.push(s); } return i; };
  let events: unknown[] = [];
  port.onmessage = async (ev) => {
    const m = ev.data;
    try {
      if (m.t === 'init') {
        sim = await make(m.opts);
        if (sim.load && !sim.ready) await sim.load();
        sim.on('*', (e: unknown) => events.push(e));
        port.postMessage({ t: 'ready', signalHeads: sim.signalHeads(), stations: sim.subwayStations?.() ?? [] });
      } else if (m.t === 'frame' && sim) {
        if (m.view) sim.setView(m.view.x, m.view.z, m.view.fx, m.view.fz, m.view.fov, m.view.fade);
        if (m.actors) sim.setExternalActors(m.actors);
        sim.update(m.dt, m.focus);
        const V: TrafficVehicleView[] = sim.vehicles, P: PedView[] = sim.peds, W: WildlifeView[] = sim.wildlife;
        const vi = new Int32Array(V.length * VI), vf = new Float32Array(V.length * VF);
        V.forEach((v, k) => { vi.set([v.id, id(v.vclass), v.lights, v.variant, id(v.state)], k * VI); vf.set([v.x, v.y, v.z, v.yaw, v.speed], k * VF); });
        const pi = new Int32Array(P.length * PI_), pf = new Float32Array(P.length * PF);
        P.forEach((p, k) => { pi.set([p.id, id(p.archetype), id(p.state), p.variant, id(p.carry ?? ''), p.onRoad ? 1 : 0], k * PI_); pf.set([p.x, p.y, p.z, p.yaw, p.speed, p.nerve], k * PF); });
        const wi = new Int32Array(W.length * WI), wf = new Float32Array(W.length * WF);
        W.forEach((w, k) => { wi.set([w.id, id(w.species), id(w.state), w.variant], k * WI); wf.set([w.x, w.y, w.z, w.yaw, w.speed], k * WF); });
        const sig: Uint8Array = sim.signalStates();
        const sigCopy = new Uint8Array(sig);
        const msg = {
          t: 'views', time: sim.time, strings: table.slice(sent), vi, vf, pi, pf, wi, wf, sig: sigCopy,
          police: sim.police, vendors: sim.vendorViews, scenarios: sim.scenarioViews, events,
        };
        sent = table.length; events = [];
        port.postMessage(msg, [vi.buffer, vf.buffer, pi.buffer, pf.buffer, wi.buffer, wf.buffer, sigCopy.buffer]);
      } else if (m.t === 'cmd' && sim) {
        sim[m.m](...m.a);
      } else if (m.t === 'call' && sim) {
        const v = await sim[m.m](...m.a);
        port.postMessage({ t: 'reply', id: m.id, v });
      }
    } catch (err) {
      if (m.t === 'call') port.postMessage({ t: 'reply', id: m.id, err: String(err) });
      else port.postMessage({ t: 'error', err: String((err as Error)?.stack ?? err) });
    }
  };
}

// ------------------------------------------------------------------ client
export class RemoteSimulation {
  readonly vehicles: TrafficVehicleView[] = [];
  readonly peds: PedView[] = [];
  readonly wildlife: WildlifeView[] = [];
  police: readonly PoliceView[] = [];
  vendorViews: readonly VendorView[] = [];
  scenarioViews: readonly ScenarioView[] = [];
  /** signal states (SignalState per head), the last snapshot */
  signals = new Uint8Array(0);
  signalHeads: readonly unknown[] = [];
  subwayStations: readonly unknown[] = [];
  time = 0;
  /** true once the host answered init */
  ready = false;
  private table: string[] = [];
  private listeners = new Map<string, ((e: any) => void)[]>();
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private nextId = 1;
  private view: { x: number; z: number; fx: number; fz: number; fov: number; fade: number } | null = null;
  private actors: unknown[] | null = null;
  private readyP: Promise<void>;
  /** frames posted but not answered yet (with a real worker: skip a post rather than queue them up) */
  private inFlight = 0;

  constructor(private port: Port, opts: Omit<SimOptions, 'fetchBinary'>) {
    let ok!: () => void; this.readyP = new Promise((r) => { ok = r; });
    port.onmessage = (ev) => {
      const m = ev.data;
      if (m.t === 'ready') { this.ready = true; this.signalHeads = m.signalHeads; this.subwayStations = m.stations; ok(); }
      else if (m.t === 'views') { this.inFlight = Math.max(0, this.inFlight - 1); this.apply(m); }
      else if (m.t === 'reply') { const p = this.pending.get(m.id); this.pending.delete(m.id); if (p) m.err ? p.rej(new Error(m.err)) : p.res(m.v); }
      else if (m.t === 'error') this.emitLocal('simError', { error: m.err });
    };
    port.postMessage({ t: 'init', opts });
  }
  /** Resolves when the host has loaded the lane graph and archetypes. */
  load(): Promise<void> { return this.readyP; }

  /** Same as Simulation.update: steps the host (asynchronously with a worker). */
  update(dt: number, focus: { x: number; z: number }) {
    if (!this.ready || this.inFlight > 1) return; // the worker is behind: drop this frame's post (the next one carries the time)
    this.inFlight++;
    this.port.postMessage({ t: 'frame', dt, focus, view: this.view, actors: this.actors });
    this.actors = null;
  }
  setView(x: number, z: number, fwdX: number, fwdZ: number, fovDeg = 75, fadeDist = 60) { this.view = { x, z, fx: fwdX, fz: fwdZ, fov: fovDeg, fade: fadeDist }; }
  setExternalActors(actors: unknown[]) { this.actors = actors.slice(); }
  on(type: string, cb: (e: any) => void) { (this.listeners.get(type) ?? this.listeners.set(type, []).get(type)!).push(cb); }

  /** Fire-and-forget setter on the host Simulation (setClock, setWeather, setDoors, setSiren, ...). */
  cmd(method: string, ...args: unknown[]) { this.port.postMessage({ t: 'cmd', m: method, a: args }); }
  /** A query on the host Simulation (parkedCars, nearestIntersections, spawnPolice, kill, ...): resolves with its result. */
  call<T = any>(method: string, ...args: unknown[]): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((res, rej) => { this.pending.set(id, { res, rej }); this.port.postMessage({ t: 'call', id, m: method, a: args }); });
  }

  private emitLocal(type: string, e: any) { const l = this.listeners.get(type); if (l) for (const cb of l) cb(e); const a = this.listeners.get('*'); if (a) for (const cb of a) cb(e); }

  private apply(m: any) {
    for (const s of m.strings) this.table.push(s);
    const T = this.table;
    this.time = m.time;
    const vn = m.vi.length / VI; const V = this.vehicles as TrafficVehicleView[];
    while (V.length < vn) V.push({ id: 0, vclass: 'sedan', variant: 0, x: 0, y: 0, z: 0, yaw: 0, speed: 0, lights: 0, state: '' });
    V.length = vn;
    for (let k = 0; k < vn; k++) { const o = V[k], a = k * VI, b = k * VF; o.id = m.vi[a]; o.vclass = T[m.vi[a + 1]] as VehicleClass; o.lights = m.vi[a + 2]; o.variant = m.vi[a + 3]; o.state = T[m.vi[a + 4]]; o.x = m.vf[b]; o.y = m.vf[b + 1]; o.z = m.vf[b + 2]; o.yaw = m.vf[b + 3]; o.speed = m.vf[b + 4]; }
    const pn = m.pi.length / PI_; const P = this.peds as PedView[];
    while (P.length < pn) P.push({ id: 0, archetype: '', nerve: 0, onRoad: false, carry: '', x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
    P.length = pn;
    for (let k = 0; k < pn; k++) { const o = P[k], a = k * PI_, b = k * PF; o.id = m.pi[a]; o.archetype = T[m.pi[a + 1]]; o.state = T[m.pi[a + 2]]; o.variant = m.pi[a + 3]; o.carry = T[m.pi[a + 4]]; o.onRoad = m.pi[a + 5] === 1; o.x = m.pf[b]; o.y = m.pf[b + 1]; o.z = m.pf[b + 2]; o.yaw = m.pf[b + 3]; o.speed = m.pf[b + 4]; o.nerve = m.pf[b + 5]; }
    const wn = m.wi.length / WI; const W = this.wildlife as WildlifeView[];
    while (W.length < wn) W.push({ id: 0, species: 'pigeon', x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
    W.length = wn;
    for (let k = 0; k < wn; k++) { const o = W[k], a = k * WI, b = k * WF; o.id = m.wi[a]; o.species = T[m.wi[a + 1]] as WildlifeView['species']; o.state = T[m.wi[a + 2]]; o.variant = m.wi[a + 3]; o.x = m.wf[b]; o.y = m.wf[b + 1]; o.z = m.wf[b + 2]; o.yaw = m.wf[b + 3]; o.speed = m.wf[b + 4]; }
    this.signals = m.sig; this.police = m.police; this.vendorViews = m.vendors; this.scenarioViews = m.scenarios ?? [];
    for (const e of m.events) this.emitLocal((e as any).type, e);
  }
}

/** Two in-memory ports wired back to back (synchronous): run host and client in one thread (tests, no-worker fallback). */
export function portPair(): [Port, Port] {
  const a: Port = { onmessage: null, postMessage: (msg) => b.onmessage?.({ data: msg }) };
  const b: Port = { onmessage: null, postMessage: (msg) => a.onmessage?.({ data: msg }) };
  return [a, b];
}
