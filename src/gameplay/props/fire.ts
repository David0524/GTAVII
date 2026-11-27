import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';

/**
 * Fire (FEATURE_AUDIT): molotovs, car fires and arson. A fire is a disc with fuel; while it burns it
 * sets people inside it alight (Health 'fire' → burning), heats nearby flammable things until they
 * catch (newsstands, trash cans, wooden crates, cars), and shrinks as fuel runs out. Someone calls it in:
 * the fire department arrives after FIRE_RESPONSE s and puts out what's left near them.
 * No in-world instructions anywhere (narrative content rule 6): a molotov is an item, not a recipe.
 */
export interface Fire { id: string; x: number; z: number; radius: number; fuel: number; source: string; by: string | null; t: number }
export interface Flammable { id: string; x: number; z: number; ignite: number; heat: number; burning: boolean; kind: 'wood' | 'paper' | 'car' | 'cloth' }
export interface FireEvents extends Record<string, unknown> {
  ignited: { fire: Fire };
  spread: { from: string; to: string };
  out: { id: string; by: 'fuel' | 'engine' };
  reported: { fire: string; at: [number, number] };
  engines: { at: [number, number]; eta: number };
}
/** Seconds of exposure before a thing catches, by material. */
const IGNITE: Record<Flammable['kind'], number> = { paper: 1.5, cloth: 2.5, wood: 5, car: 12 };
const FUEL: Record<string, number> = { molotov: 14, car: 90, paper: 25, wood: 45, cloth: 20, arson: 60 };
export const FIRE_RESPONSE = 90, ENGINE_WORK = 40, SPREAD_RANGE = 2.5;

export class FireSystem extends Emitter<FireEvents> {
  readonly fires = new Map<string, Fire>();
  readonly fuel = new Map<string, Flammable>();
  private seq = 1; time = 0;
  private engines: { at: [number, number]; arrive: number }[] = [];
  constructor(private rng: Rng) { super(); }

  addFlammable(id: string, x: number, z: number, kind: Flammable['kind']) { this.fuel.set(id, { id, x, z, ignite: IGNITE[kind], heat: 0, burning: false, kind }); }
  start(x: number, z: number, source: 'molotov' | 'car' | 'arson' | Flammable['kind'], by: string | null, radius = source === 'molotov' ? 2.4 : 1.8): Fire {
    const f: Fire = { id: `fire${this.seq++}`, x, z, radius, fuel: FUEL[source] ?? 20, source, by, t: 0 };
    this.fires.set(f.id, f); this.emit('ignited', { fire: f });
    // a fire on a busy street is called in quickly (a box alarm or a shout); engines are dispatched
    if (!this.engines.some((e) => Math.hypot(e.at[0] - x, e.at[1] - z) < 60)) {
      const eta = FIRE_RESPONSE * this.rng.range(0.8, 1.2);
      this.engines.push({ at: [x, z], arrive: this.time + eta });
      this.emit('reported', { fire: f.id, at: [x, z] }); this.emit('engines', { at: [x, z], eta });
    }
    return f;
  }
  /** Is (x,z) inside a burning area? Returns the fire or null. */
  at(x: number, z: number) { for (const f of this.fires.values()) if (Math.hypot(f.x - x, f.z - z) < f.radius * Math.min(1, f.fuel / 6 + 0.4)) return f; return null; }

  update(dt: number) {
    this.time += dt;
    for (const f of [...this.fires.values()]) {
      f.t += dt; f.fuel -= dt;
      if (f.fuel <= 0) { this.fires.delete(f.id); this.emit('out', { id: f.id, by: 'fuel' }); continue; }
      // heat flammables nearby
      for (const m of this.fuel.values()) {
        if (m.burning) continue;
        const d = Math.hypot(m.x - f.x, m.z - f.z);
        if (d > f.radius + SPREAD_RANGE) { m.heat = Math.max(0, m.heat - dt * 0.5); continue; }
        m.heat += dt * (1 - d / (f.radius + SPREAD_RANGE) * 0.6);
        if (m.heat >= m.ignite) { m.burning = true; const nf = this.start(m.x, m.z, m.kind, f.by); this.emit('spread', { from: f.id, to: m.id }); void nf; }
      }
    }
    // engines arrive and work the fires near them
    for (const e of this.engines) {
      if (this.time < e.arrive) continue;
      for (const f of [...this.fires.values()]) if (Math.hypot(f.x - e.at[0], f.z - e.at[1]) < 60) { f.fuel -= (f.fuel / ENGINE_WORK + 0.5) * dt * 4; if (f.fuel <= 0) { this.fires.delete(f.id); this.emit('out', { id: f.id, by: 'engine' }); } }
    }
    this.engines = this.engines.filter((e) => this.time < e.arrive + ENGINE_WORK * 3);
  }
}
