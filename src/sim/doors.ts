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
interface Door extends DoorRec { edge: number; s: number; sx: number; sz: number; tx: number; tz: number; from: number; to: number; nextExit: number }

const tmp = [0, 0, 0, 0];

export class Doors {
  private doors = new Map<string, Door>();
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
      this.doors.set(d.id, { ...d, edge, s: bs, sx, sz, tx, tz, from, to, nextExit: S.t + S.rng.range(5, 60) });
    }
  }
  clear(ids?: string[]) { if (!ids) this.doors.clear(); else for (const id of ids) this.doors.delete(id); }
  get count() { return this.doors.size; }

  private open(d: Door) { return !d.locked && inWindow(this.S.minute, d.from, d.to); }

  /** Interiors hands an occupant to the street: they appear at the threshold and walk off. */
  exitFromDoor(doorId: string, archetypeId?: string): number {
    const S = this.S, d = this.doors.get(doorId); if (!d) return -1;
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
      // people coming out
      if (S.t >= d.nextExit) {
        d.nextExit = S.t + S.rng.range(25, 90) / Math.max(0.2, dens);
        if (S.peds.length < S.maxPeds) this.exitFromDoor(d.id);
      }
    }
    // passers-by stepping in: a few checks per step, ~1 per door every couple of minutes by day
    if (S.rng.chance(dt * 0.5 * dens)) {
      const p = S.peds[S.rng.int(Math.max(1, S.peds.length))];
      if (p && p.alive && !p.goal && !p.cop2 && p.state === 'walk' && ['walker', 'commuter', 'loiterer', 'worker'].includes(p.arch.behaviour)) {
        let best: Door | null = null, bd = 50;
        for (const d of this.doors.values()) { const dd = Math.hypot(d.sx - p.x, d.sz - p.z); if (dd < bd && this.open(d)) { bd = dd; best = d; } }
        if (best) this.enterDoor(p, best.id);
      }
    }
  }
}
