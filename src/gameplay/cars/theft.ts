import { Emitter } from '../core/events';
import type { Rng } from '../core/rng';
import type { CrimeKind } from '../police/crime';
import { plateFor } from '../appearance';

/**
 * Stealing cars, 1974: no immobilisers (CORE_SYSTEMS §5). Gameplay keeps a record per car it cares
 * about (parked cars near the player, the leads' own cars, cars the player has driven); the vehicles
 * stream owns the physics, doors and dash.
 *
 * Entry methods (time × the lead's lockwork multiplier, noise, crime):
 *   unlocked  0 s, silent          keys left in  0 s, silent
 *   slim jim  ~3 s, quiet, a timing minigame that can fail (retry)    — Teddy is fast
 *   smash     instant, LOUD (glass): witnesses hear it
 *   hot-wire  ~5 s under the dash, needed without keys; can stall in the heat
 *   carjack   instant, the driver is a witness who may fight, flee or run for a call box
 * After it's gone: the owner discovers it (a carjacked owner at once, a parked car's owner some
 * minutes later) and the theft report carries the plate, colour and class, no driver description
 * unless someone saw. The car stays HOT until the plates are swapped, it's sold off the chop list,
 * or the report cools.
 */
export type EntryMethod = 'unlocked' | 'keys' | 'slimjim' | 'smash' | 'hotwire' | 'carjack';
export interface CarRecord {
  id: string; vclass: string; colour: string; condition: number;
  owner: string;                 // 'npc' or a lead id
  locked: boolean; keysIn: boolean; driver: string | null; // driver ped id when occupied
  plateGen: number;              // swaps at a chop shop bump this
  stolenBy: string | null; stolenAt: number; reportedAt: number; discoverAt: number;
  trunk: Map<string, number>;
  x: number; z: number;
}
export interface Entry { ok: boolean; seconds: number; noise: number; crimes: CrimeKind[]; needsHotwire: boolean; failed?: boolean; stalled?: boolean }
export interface TheftEvents extends Record<string, unknown> {
  stolen: { car: string; by: string; method: EntryMethod; at: [number, number] };
  ownerReport: { car: string; plate: string; colour: string; vclass: string; at: [number, number]; sawDriver: boolean };
  driverReacts: { car: string; driver: string; reaction: 'fight' | 'flee' | 'callbox' };
}

export const ENTRY: Record<EntryMethod, { seconds: number; noise: number; crimes: CrimeKind[] }> = {
  unlocked: { seconds: 0, noise: 0, crimes: ['theft'] },
  keys: { seconds: 0, noise: 0, crimes: ['theft'] },
  slimjim: { seconds: 3, noise: 4, crimes: ['theft'] },
  smash: { seconds: 0.4, noise: 40, crimes: ['theft', 'vandalism'] },
  hotwire: { seconds: 5, noise: 6, crimes: [] },
  carjack: { seconds: 1.2, noise: 25, crimes: ['carjack'] },
};
export const DISCOVER_MIN = 10 * 60, DISCOVER_MAX = 60 * 60; // game seconds before a parked car's owner notices

export class Cars extends Emitter<TheftEvents> {
  readonly cars = new Map<string, CarRecord>();
  time = 0;
  constructor(private rng: Rng) { super(); }

  add(c: Partial<CarRecord> & { id: string; vclass: string; colour: string }): CarRecord {
    const r: CarRecord = { condition: 0.7, owner: 'npc', locked: this.rng.chance(0.55), keysIn: this.rng.chance(0.06), driver: null, plateGen: 0, stolenBy: null, stolenAt: -1, reportedAt: -1, discoverAt: -1, trunk: new Map(), x: 0, z: 0, ...c };
    this.cars.set(r.id, r); return r;
  }
  plate(id: string) { const c = this.cars.get(id); return c ? plateFor(c.id, c.plateGen) : ''; }

  /** Which methods make sense for this car right now (UI shows them). */
  methods(id: string, lead: string): EntryMethod[] {
    const c = this.cars.get(id); if (!c) return [];
    if (c.owner === lead) return ['keys'];
    if (c.driver) return ['carjack'];
    const m: EntryMethod[] = [];
    if (!c.locked) m.push(c.keysIn ? 'keys' : 'unlocked'); else m.push('slimjim', 'smash');
    return m;
  }

  /**
   * Attempt an entry. `lockMul` is the lead's skills.lockTime (Teddy ≈ 0.9, Nick ≈ 1.4); `tempF` makes
   * hot-wiring stall. Returns time taken, noise radius and crimes the caller reports through police.
   */
  enter(id: string, lead: string, method: EntryMethod, o: { lockMul?: number; tempF?: number; timing?: number } = {}): Entry {
    const c = this.cars.get(id);
    const no: Entry = { ok: false, seconds: 0, noise: 0, crimes: [], needsHotwire: false };
    if (!c || !this.methods(id, lead).includes(method) && method !== 'hotwire') return no;
    const lm = o.lockMul ?? 1, spec = ENTRY[method];
    const own = c.owner === lead;
    if (method === 'slimjim') {
      // timing minigame: `timing` 0..1 is how close to the sweet spot the player hit (headless: rolled)
      const t = o.timing ?? this.rng.next();
      if (Math.abs(t - 0.5) > 0.18 / lm) return { ...no, seconds: spec.seconds * lm, noise: spec.noise, failed: true };
      c.locked = false;
    }
    if (method === 'smash') c.locked = false;
    if (method === 'hotwire') {
      if (c.keysIn || own) return { ok: true, seconds: 0, noise: 0, crimes: [], needsHotwire: false };
      const stall = (o.tempF ?? 80) >= 88 && this.rng.chance(0.25);
      return { ok: !stall, stalled: stall, seconds: spec.seconds * lm, noise: spec.noise, crimes: [], needsHotwire: stall };
    }
    let reaction: 'fight' | 'flee' | 'callbox' | null = null;
    if (method === 'carjack' && c.driver) {
      const roll = this.rng.next(); reaction = roll < 0.2 ? 'fight' : roll < 0.6 ? 'flee' : 'callbox';
      this.emit('driverReacts', { car: id, driver: c.driver, reaction });
      c.driver = null;
    }
    if (!own) {
      c.stolenBy = lead; c.stolenAt = this.time;
      // a carjacked driver reports straight away; a parked car's owner finds it gone later
      c.discoverAt = method === 'carjack' ? this.time + 30 : this.time + this.rng.range(DISCOVER_MIN, DISCOVER_MAX);
      this.emit('stolen', { car: id, by: lead, method, at: [c.x, c.z] });
    }
    const needsHotwire = !own && !c.keysIn && method !== 'carjack';
    return { ok: true, seconds: spec.seconds * (method === 'slimjim' ? lm : 1), noise: spec.noise, crimes: own ? [] : [...spec.crimes], needsHotwire };
  }

  /** Game time passes: owners discover thefts and report the car. */
  update(dt: number) {
    this.time += dt;
    for (const c of this.cars.values()) {
      if (c.stolenBy && c.reportedAt < 0 && c.discoverAt >= 0 && this.time >= c.discoverAt) {
        c.reportedAt = this.time;
        this.emit('ownerReport', { car: c.id, plate: this.plate(c.id), colour: c.colour, vclass: c.vclass, at: [c.x, c.z], sawDriver: this.time - c.stolenAt < 60 });
      }
    }
  }
  /** Chop shop: new plates for a car (the reported plate no longer matches). */
  swapPlates(id: string) { const c = this.cars.get(id); if (!c) return false; c.plateGen++; return true; }
  /** Body shop respray: changes the colour, NOT the plates or what's already been reported. */
  respray(id: string, colour: string) { const c = this.cars.get(id); if (!c) return false; c.colour = colour; return true; }
  isHot(id: string) { const c = this.cars.get(id); return !!c && !!c.stolenBy && c.owner !== c.stolenBy; }
  serialize() { return [...this.cars.values()].filter((c) => c.owner !== 'npc' || c.stolenBy).map((c) => ({ ...c, trunk: [...c.trunk] })); }
  deserialize(d: ReturnType<Cars['serialize']>) { for (const c of d ?? []) this.cars.set(c.id, { ...c, trunk: new Map(c.trunk) }); }
}
