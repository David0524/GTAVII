/**
 * Door hand-off between the street and interiors (INTERIORS_BRIEF: doorsForChunk / slots).
 *
 * The sim doesn't import the interiors stream; the engine feeds door records with `setDoors` (from
 * `doorsForChunk` for chunks near the player). Each door attaches to the nearest sidewalk band.
 *  - Door traffic: passers-by (walkers, commuters, shoppers, loiterers) sometimes step in through an
 *    open door near them: they walk to the kerb spot in front of it, step to the threshold and leave the
 *    street (`pedEnteredDoor {doorId, pedId, archetype}`; interiors/characters fill a slot).
 *  - People come out: open doors near the focus emit occupants now and then (`pedExitedDoor`), more by
 *    day, more on busy blocks.
 *  - Interiors can push an occupant out (`exitFromDoor(doorId, archetypeId?)`) or pull a street ped in
 *    (`enterDoor(pedId, doorId)`).
 */
import { inWindow, parseTime, type ArchetypeRt } from './archetypes';
import { projectOnPoly, sampleAt } from './geom';
import { WalkKind } from './laneFormat';
import type { SimCore, Ped } from './state';
import { pedDensity } from './state';
import { setPedGoal, spawnPedNear } from './peds';

export interface DoorRec { id: string; x: number; z: number; yaw?: number; kind?: string; locked?: boolean; hours?: [string, string] }
interface Door extends DoorRec { edge: number; s: number; sx: number; sz: number; tx: number; tz: number; from: number; to: number; nextExit: number; rate: DoorRate; burstLeft: number; lastBurst: number }

const tmp = [0, 0, 0, 0];

/**
 * Door traffic by interior kind (DoorRec.kind; rates from the interiors session). exitSec: mean seconds
 * between occupants coming out while open (`rush` replaces it 07:30–09:30 and 17:00–18:30, `evening`
 * after 17:00). enterP: chance a passer-by steps in. burst: every `every` minutes from `from`, `n`
 * people come out together (screenings, services, meetings). hints: archetype ids for who comes out.
 * Residential kinds take no strangers in (only `enterDoor` from interiors).
 */
export interface DoorRate { exitSec: number; enterP: number; rush?: number; evening?: number; burst?: { every: number; from: number; n: [number, number] }; hints?: string[]; residents?: boolean }
const R = (exitSec: number, enterP: number, extra: Partial<DoorRate> = {}): DoorRate => ({ exitSec, enterP, ...extra });
export const DOOR_RATES: Record<string, DoorRate> = {
  diner: R(30, 0.06, { hints: ['npc.commuter', 'npc.shopper'] }), coffee_shop: R(30, 0.06, { hints: ['npc.commuter', 'npc.shopper'] }), deli: R(30, 0.06, { hints: ['npc.commuter', 'npc.worker_handcart'] }),
  bodega: R(25, 0.08, { hints: ['npc.shopper', 'npc.loiterer'] }), newsstand: R(25, 0.08, { hints: ['npc.commuter', 'npc.shopper'] }),
  bar: R(60, 0.04, { evening: 25, hints: ['npc.loiterer', 'npc.commuter'] }), liquor: R(70, 0.03, { hints: ['npc.loiterer'] }), pawn: R(120, 0.02, { hints: ['npc.loiterer'] }),
  barber: R(150, 0.015), beauty: R(150, 0.015, { hints: ['npc.shopper'] }), laundromat: R(90, 0.03, { hints: ['npc.shopper'] }),
  shoe_repair: R(140, 0.02), tailor: R(140, 0.02), florist: R(140, 0.02, { hints: ['npc.shopper'] }), hardware: R(140, 0.02, { hints: ['npc.worker_handcart'] }),
  clothing: R(100, 0.02, { hints: ['npc.shopper'] }), garment_showroom: R(100, 0.02, { hints: ['npc.worker_handcart', 'npc.commuter'] }), fur_showroom: R(100, 0.02, { hints: ['npc.worker_handcart', 'npc.commuter'] }),
  pool_hall: R(120, 0.02, { hints: ['npc.loiterer'] }), gym: R(120, 0.02, { hints: ['npc.loiterer'] }),
  cinema_lobby: R(40, 0.03, { burst: { every: 120, from: 12 * 60, n: [10, 20] }, hints: ['npc.loiterer', 'npc.commuter'] }),
  tenement: R(90, 0.01, { residents: true }), apartment_lobby: R(90, 0.01, { residents: true }), sro: R(70, 0.01, { residents: true }),
  office_lobby: R(120, 0.02, { rush: 20, hints: ['npc.commuter'] }), hotel_lobby: R(60, 0.02, { hints: ['npc.commuter'] }),
  garage: R(180, 0, { hints: ['npc.commuter'] }),
  church: R(300, 0.01, { burst: { every: 24 * 60, from: 11 * 60 + 15, n: [15, 30] } }), union_hall: R(200, 0.01, { burst: { every: 24 * 60, from: 19 * 60 + 30, n: [10, 25] } }),
};
const DEFAULT_RATE = R(60, 0.03);
const rush = (m: number) => (m >= 450 && m < 570) || (m >= 1020 && m < 1110);

export class Doors {
  private doors = new Map<string, Door>();
  /** Rate table (interiors can replace or extend entries with `setRates`). */
  rates: Record<string, DoorRate> = { ...DOOR_RATES };
  setRates(t: Record<string, Partial<DoorRate>>) { for (const [k, v] of Object.entries(t)) this.rates[k] = { ...(this.rates[k] ?? DEFAULT_RATE), ...v }; for (const d of this.doors.values()) d.rate = this.rates[d.kind ?? ''] ?? DEFAULT_RATE; }
  entered = 0; exited = 0;

  constructor(private S: SimCore) {}

  set(list: DoorRec[]) {
    const S = this.S, net = S.net;
    for (const d of list) {
      // nearest sidewalk band within 10 m
      let edge = -1, bd = 10, bs = 0;
      for (const e of net.sidewalksNear(d.x, d.z, 10, new Set())) { if (net.g.walkEdges[e].kind !== WalkKind.Sidewalk) continue; const p = projectOnPoly(net.g.walkEdges[e].pts, d.x, d.z); if (p.d < bd) { bd = p.d; edge = e; bs = p.s; } }
      if (edge < 0) continue;
      const E = net.g.walkEdges[edge];
      bs = Math.max(0.5, Math.min(net.walkLen[edge] - 0.5, bs));
      sampleAt(E.pts, net.walkCum[edge], bs, tmp);
      const sx = tmp[0], sz = tmp[1];
      // threshold: stop 0.4 m short of the door point, on the sidewalk side
      const dl = Math.hypot(d.x - sx, d.z - sz) || 1;
      const tx = d.x - ((d.x - sx) / dl) * 0.4, tz = d.z - ((d.z - sz) / dl) * 0.4;
      const from = d.hours ? parseTime(d.hours[0]) : 0, to = d.hours ? parseTime(d.hours[1]) : 1440;
      const rate = this.rates[d.kind ?? ''] ?? DEFAULT_RATE;
      this.doors.set(d.id, { ...d, edge, s: bs, sx, sz, tx, tz, from, to, rate, nextExit: S.t + S.rng.range(0.2, 1.5) * rate.exitSec, burstLeft: 0, lastBurst: -1 });
    }
  }
  clear(ids?: string[]) { if (!ids) this.doors.clear(); else for (const id of ids) this.doors.delete(id); }
  get count() { return this.doors.size; }

  private open(d: Door) { return !d.locked && inWindow(this.S.minute, d.from, d.to); }

  /** Interiors hands an occupant to the street: they appear at the threshold and walk off. */
  exitFromDoor(doorId: string, archetypeId?: string): number {
    const S = this.S, d = this.doors.get(doorId); if (!d) return -1;
    const hints = d.rate.hints;
    if (!archetypeId && hints?.length && S.rng.chance(0.75)) archetypeId = hints[S.rng.int(hints.length)];
    const arch: ArchetypeRt | undefined = (archetypeId ? S.reg.list.find((a) => a.def.id === archetypeId) : undefined)
      ?? S.reg.pick((a) => a.behaviour === 'walker' || a.behaviour === 'commuter' || a.behaviour === 'loiterer', d.x, d.z, S.minute, S.rng.next()) ?? undefined;
    if (!arch) return -1;
    const p = spawnPedNear(S, d.sx, d.sz, arch, 3);
    if (!p) return -1;
    // start at the threshold and step out to the walking band
    p.x = p.px = d.tx; p.z = p.pz = d.tz; p.toEdge = d.edge; p.toS = d.s; p.state = 'free'; p.then = 'attach'; p.tx = d.sx; p.tz = d.sz;
    this.exited++;
    S.emit('pedExitedDoor', { doorId, pedId: p.id, archetype: arch.def.id, x: d.tx, z: d.tz });
    return p.id;
  }

  /** Send a street ped in through a door (interiors asked for an occupant, or a scripted errand). */
  enterDoor(p: Ped, doorId: string): boolean {
    const d = this.doors.get(doorId); if (!d || !this.open(d)) return false;
    setPedGoal(this.S, p, { kind: 'goto', x: d.sx, z: d.sz, then: 'door', doorId });
    return true;
  }

  /** Called when a ped reaches the kerb spot of its door: step in and leave the street. */
  arrived(p: Ped, doorId: string) {
    const d = this.doors.get(doorId); if (!d) return;
    p.state = 'free'; p.tx = d.tx; p.tz = d.tz; p.then = 'enterDoor'; p.doorId = doorId;
  }
  /** The threshold was reached. */
  stepIn(p: Ped) {
    this.entered++;
    this.S.emit('pedEnteredDoor', { doorId: p.doorId, pedId: p.id, archetype: p.arch.def.id });
  }

  step(dt: number) {
    const S = this.S, dens = pedDensity(S.minute);
    if (!this.doors.size) return;
    for (const d of this.doors.values()) {
      if (Math.hypot(d.x - S.focus.x, d.z - S.focus.z) > S.ringP[1] || !this.open(d)) continue;
      const r = d.rate;
      // bursts: a screening lets out, a service or a meeting ends
      if (r.burst && S.minute >= r.burst.from) {
        const k = Math.floor((S.minute - r.burst.from) / r.burst.every);
        if (k !== d.lastBurst && S.minute - r.burst.from - k * r.burst.every < 2) { d.lastBurst = k; d.burstLeft = r.burst.n[0] + S.rng.int(r.burst.n[1] - r.burst.n[0] + 1); }
      }
      if (d.burstLeft > 0 && S.rng.chance(dt * 1.5) && S.peds.length < S.maxPeds) { d.burstLeft--; this.exitFromDoor(d.id); }
      // people coming out
      if (S.t >= d.nextExit) {
        const mean = (r.rush !== undefined && rush(S.minute)) ? r.rush : (r.evening !== undefined && S.minute >= 1020) ? r.evening : r.exitSec;
        d.nextExit = S.t + mean * S.rng.range(0.5, 1.5) / Math.max(0.3, Math.min(1.5, 0.4 + dens));
        if (S.peds.length < S.maxPeds) this.exitFromDoor(d.id);
      }
    }
    // passers-by stepping in: each walker is checked about every 4 s; a ~10 m pass gets ~2 checks
    const n = Math.min(S.peds.length, Math.ceil(S.peds.length * dt * 0.25));
    for (let k = 0; k < n; k++) {
      const p = S.peds[S.rng.int(S.peds.length)];
      if (!p || !p.alive || p.goal || p.cop2 || p.state !== 'walk' || !['walker', 'commuter', 'loiterer', 'worker'].includes(p.arch.behaviour)) continue;
      for (const d of this.doors.values()) {
        if (Math.abs(d.sx - p.x) > 5 || Math.abs(d.sz - p.z) > 5) continue;
        const r = d.rate, pIn = r.residents ? 0 : (r.rush !== undefined && rush(S.minute) ? Math.max(r.enterP, 0.05) : r.enterP);
        if (this.open(d) && S.rng.chance(pIn / 2)) { this.enterDoor(p, d.id); break; }
      }
    }
  }
}
