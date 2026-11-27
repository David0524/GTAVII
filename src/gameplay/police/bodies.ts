/**
 * Bodies. A crime only counts if witnessed, but a body left lying is witnessed eventually. Someone finds it
 * and calls it in, as a homicide with no description, unless a witness already reported the killing.
 * How soon depends on where it lies: a busy sidewalk at noon in about a minute, an empty alley at 3 a.m.
 * in most of an hour. Moving a body is how you buy time: carry it (anyone who sees that calls it in, as
 * `body_seen`), drop it somewhere quiet, or put it in a trunk. A trunk body is found if the car is towed or
 * searched, and then the report has the car.
 */
export type BodyPlace = 'open' | 'carried' | 'trunk' | 'hidden';
export interface Body { id: string; x: number; z: number; killer: string | null; place: BodyPlace; car: string | null; diedAt: number; discoverAt: number; found: boolean }

/**
 * Seconds until a body in the open is found. `crowd` is 0..1 (passers-by nearby), `light` 0..1 (1 = day).
 * A hiding spot (an interiors marker: a cellar, a dumpster, a boiler room) isn't found by passers-by at all.
 */
export const DISCOVERY = { busy: 45, empty: 1500, nightMul: 2, indoorsMul: 1.6 } as const;
export function discoveryDelay(crowd: number, light: number, indoors = false) {
  const base = DISCOVERY.busy + (1 - Math.min(1, Math.max(0, crowd))) * (DISCOVERY.empty - DISCOVERY.busy);
  return base * (light < 0.4 ? DISCOVERY.nightMul : 1) * (indoors ? DISCOVERY.indoorsMul : 1);
}

export class Bodies {
  readonly list = new Map<string, Body>();
  add(id: string, x: number, z: number, killer: string | null, now: number, delay: number) {
    const b: Body = { id, x, z, killer, place: 'open', car: null, diedAt: now, discoverAt: now + delay, found: false };
    this.list.set(id, b); return b;
  }
  nearest(x: number, z: number, r = 2) {
    let best: Body | null = null, bd = r;
    for (const b of this.list.values()) { if (b.found || (b.place !== 'open' && b.place !== 'hidden')) continue; const d = Math.hypot(b.x - x, b.z - z); if (d <= bd) { bd = d; best = b; } }
    return best;
  }
  carried() { return [...this.list.values()].find((b) => b.place === 'carried') ?? null; }
  pickUp(id: string) { const b = this.list.get(id); if (!b || b.found || (b.place !== 'open' && b.place !== 'hidden')) return false; b.place = 'carried'; b.car = null; return true; }
  /** Put it down where you stand: the clock restarts for that spot. */
  drop(id: string, x: number, z: number, now: number, delay: number, hidden = false) {
    const b = this.list.get(id); if (!b || b.place !== 'carried') return false;
    b.x = x; b.z = z; b.place = hidden ? 'hidden' : 'open'; b.discoverAt = hidden ? Infinity : now + delay; return true;
  }
  stow(id: string, car: string) { const b = this.list.get(id); if (!b || b.place !== 'carried') return false; b.place = 'trunk'; b.car = car; b.discoverAt = Infinity; return true; }
  inCar(car: string) { return [...this.list.values()].filter((b) => b.place === 'trunk' && b.car === car && !b.found); }
  /** Bodies found by passers-by now (each once). */
  due(now: number) {
    const out: Body[] = [];
    for (const b of this.list.values()) if (!b.found && b.place === 'open' && now >= b.discoverAt) { b.found = true; out.push(b); }
    return out;
  }
  /** A car's trunk is opened by the police or the pound: anything in it is found. */
  openTrunk(car: string) { const out = this.inCar(car); for (const b of out) b.found = true; return out; }
  serialize() { return [...this.list.values()].map((b) => ({ ...b, discoverAt: Number.isFinite(b.discoverAt) ? b.discoverAt : -1 })); }
  restore(d: ReturnType<Bodies['serialize']>) { this.list.clear(); for (const b of d ?? []) this.list.set(b.id, { ...b, discoverAt: b.discoverAt < 0 ? Infinity : b.discoverAt }); }
}
