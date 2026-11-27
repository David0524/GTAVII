/**
 * Parked cars in the kerb parking lanes (VISUAL_BAR "parked cars on every kerb"; requests item 5).
 *
 * Static: the engine instances them through the vehicles traffic renderer; they never move. They're the
 * sim's so the kerb rules and the cars agree, and so sim traffic can use the gaps:
 *  - a slot every ~6.3 m along each kerb-side lane whose parking lane is on roadway ground (lanes.ts kerb
 *    room), clear of the corners;
 *  - empty where `Parking.rule` says no (hydrants, bus stops, corners, avenue rush-hour no-standing, the
 *    alternate-side cleaning window) — the same rules the traffic agents ticket by;
 *  - otherwise occupied ~88% (busier at night), deterministic per slot and day; class/variant by slot.
 * Traffic uses `occupied(lane, s0, s1)`: siren gutter runs, pull-overs and kerb stops only where there's a gap
 * (otherwise cabs and vans stop at the lane edge: double-parked, 1974-style).
 */
import { LinkFlag, LinkKind } from './laneFormat';
import { sampleAt } from './geom';
import type { SimCore } from './state';
import type { Parking } from './parking';
import type { VehicleClass } from '../shared/traffic';

export interface ParkedCar { x: number; z: number; yaw: number; vclass: VehicleClass; variant: number; len: number; wid: number; lane: number; s: number; side: 1 | -1 }

interface Slot { s: number; x: number; z: number; yaw: number; vclass: VehicleClass; variant: number; len: number; wid: number; h: number }
interface LaneSlots { side: 1 | -1; slots: Slot[]; bucket: number; occ: Uint8Array }

const PITCH = 6.3, END_CLEAR = 8;
const CLASSES: [VehicleClass, number, number, number][] = [ // class, weight, len, wid
  ['sedan', 0.34, 5.4, 2.0], ['hardtop', 0.22, 5.3, 2.0], ['compact', 0.15, 4.6, 1.8], ['wagon', 0.12, 5.6, 2.0],
  ['taxi', 0.04, 5.3, 2.0], ['step_van', 0.05, 6.5, 2.3], ['box_truck', 0.04, 8.0, 2.5], ['motorcycle', 0.04, 2.2, 0.8],
];
const tmp = [0, 0, 0, 0];
function hash(a: number, b: number) { let h = (Math.imul(a | 0, 2246822519) ^ Math.imul(b | 0, 3266489917)) >>> 0; h = Math.imul(h ^ (h >>> 15), 668265263) >>> 0; return (h ^ (h >>> 13)) >>> 0; }

export class ParkedCars {
  private lanes = new Map<number, LaneSlots[]>();

  constructor(private S: SimCore, private parking: Parking) {}

  /** Kerb sides of lane l that have a parking lane: right (lane 0), and left on one-ways (last lane);
   *  a single-lane one-way street has both. */
  private sidesOf(l: number): (1 | -1)[] {
    const g = this.S.net.g, L = g.links[l];
    if (L.kind !== LinkKind.Lane) return [];
    const R = g.roads[L.owner];
    if (g.names[R.name] === '') return [];
    const out: (1 | -1)[] = [];
    if (L.laneIndex === 0 && (L.flags & LinkFlag.RightKerbRoom)) out.push(1);
    if (R.oneway !== 0 && L.laneIndex === L.laneCount - 1 && (L.flags & LinkFlag.LeftKerbRoom)) out.push(-1);
    return out;
  }

  private build(l: number, side: 1 | -1): LaneSlots | null {
    const net = this.S.net, L = net.g.links[l], len = net.len[l];
    if (len < 2 * END_CLEAR + PITCH) return null;
    const lat = side * (L.width / 2 + 1.2);
    const slots: Slot[] = [];
    let k = 0;
    for (let s = END_CLEAR + PITCH / 2; s <= len - END_CLEAR - PITCH / 2; s += PITCH, k++) {
      sampleAt(L.pts, net.cum[l], s, tmp);
      const x = tmp[0] - tmp[3] * lat, z = tmp[1] + tmp[2] * lat; // right of travel = (-dz, dx)
      const h = hash(l * 131 + k + (side < 0 ? 7919 : 0), 7741);
      let r = (h % 10000) / 10000, ci = 0;
      for (; ci < CLASSES.length - 1; ci++) { if (r < CLASSES[ci][1]) break; r -= CLASSES[ci][1]; }
      const [vclass, , cl, cw] = CLASSES[ci];
      slots.push({ s, x, z, yaw: Math.atan2(-tmp[2], -tmp[3]), vclass, variant: hash(h, 31) & 0x3fffffff, len: cl, wid: cw, h });
    }
    return { side, slots, bucket: -1, occ: new Uint8Array(slots.length) };
  }

  private kerbs(l: number): LaneSlots[] {
    let ks = this.lanes.get(l);
    if (ks === undefined) { ks = this.sidesOf(l).map((sd) => this.build(l, sd)).filter((x): x is LaneSlots => !!x); this.lanes.set(l, ks); }
    // occupancy is re-evaluated per quarter hour and day (cleaning windows, no-standing hours)
    const S = this.S, bucket = this.parking.dow * 96 + Math.floor(S.minute / 15);
    for (const ls of ks) if (ls.bucket !== bucket) {
      ls.bucket = bucket;
      const night = S.minute < 6 * 60 || S.minute >= 20 * 60, fill = night ? 0.93 : 0.86;
      ls.slots.forEach((sl, i) => {
        const roll = (hash(sl.h, this.parking.dow + 11) % 10000) / 10000;
        ls.occ[i] = roll < fill && this.parking.rule(sl.x, sl.z).allowed ? 1 : 0;
      });
    }
    return ks;
  }

  /** Is any parked car beside lane l (either kerb it has) between s0 and s1 (m along the lane)? `side`: only that kerb. */
  occupied(l: number, s0: number, s1: number, side?: 1 | -1): boolean {
    for (const ls of this.kerbs(l)) {
      if (side && ls.side !== side) continue;
      for (let i = 0; i < ls.slots.length; i++) {
        const sl = ls.slots[i];
        if (ls.occ[i] && sl.s + sl.len / 2 > s0 && sl.s - sl.len / 2 < s1) return true;
      }
    }
    return false;
  }

  /** Arc position of the rear of the next parked car ahead of s on that kerb of lane l (Infinity if none). */
  nextAhead(l: number, s: number, side: 1 | -1): number {
    let best = Infinity;
    for (const ls of this.kerbs(l)) {
      if (ls.side !== side) continue;
      for (let i = 0; i < ls.slots.length; i++) { const sl = ls.slots[i]; const rear = sl.s - sl.len / 2; if (ls.occ[i] && sl.s + sl.len / 2 > s && rear < best) best = rear; }
    }
    return best;
  }

  /** Parked cars within r of (x, z). */
  near(x: number, z: number, r: number): ParkedCar[] {
    const net = this.S.net, out: ParkedCar[] = [];
    for (const l of net.lanesNear(x, z, r + 10, new Set())) {
      for (const ls of this.kerbs(l)) ls.slots.forEach((sl, i) => {
        if (!ls.occ[i] || Math.hypot(sl.x - x, sl.z - z) > r) return;
        out.push({ x: sl.x, z: sl.z, yaw: sl.yaw, vclass: sl.vclass, variant: sl.variant, len: sl.len, wid: sl.wid, lane: l, s: sl.s, side: ls.side });
      });
    }
    return out;
  }
}
