/**
 * Signal heads for the engine's traffic-signal props (ENGINE_REQUESTS "From sim" 9).
 *
 * The sim decides which junctions are signalised (OSM traffic_signals POIs plus synthesized ones at real
 * grid crossings), so the engine should place heads from this list, not from the raw POIs: a head where
 * the sim has no signal would show a light the cars ignore.
 *
 *  - `signalHeads()` is static (call once after load): one vehicle head per signalised approach arm and
 *    one pedestrian head at each end of each signalised crosswalk.
 *  - `signalStates(out)` fills a Uint8Array, one byte per head, each frame (pure function of sim time,
 *    so it can't drift from what the cars do). Brownouts (`setSignalPower`) read as dark.
 */
import { WalkKind } from './laneFormat';
import type { Network } from './network';
import { Sig } from './network';

export const enum SignalState {
  Dark = 0, Red = 1, Yellow = 2, Green = 3,
  DontWalk = 4, DontWalkFlash = 5, Walk = 6,
}

export interface SignalHead {
  /** index into the signalStates array */
  index: number;
  kind: 'vehicle' | 'ped';
  junction: number;
  arm: number;
  /** vehicle: kerb corner on the right of the approach at the stop line; ped: crosswalk end */
  x: number; z: number;
  /** vehicle: the other corner of the approach (one-way avenues also had far-left heads) */
  altX?: number; altZ?: number;
  /** yaw the lenses face (towards approaching drivers / across the crosswalk); heading = (-sin yaw, -cos yaw) */
  faceYaw: number;
  /** stop line centre of the approach (vehicle heads) */
  stopX?: number; stopZ?: number;
  /** street the head governs */
  street: string;
}

const PED_SPEED = 1.3;

export function buildSignalHeads(net: Network): SignalHead[] {
  const g = net.g, out: SignalHead[] = [];
  g.junctions.forEach((J, j) => {
    if (!net.isSignalled(j)) return;
    J.arms.forEach((A, k) => {
      if (A.phase < 0) return;
      const street = net.roadName(A.road);
      const cwId = net.crosswalkOfJunctionArm.get(j * 16 + k);
      const cw = cwId !== undefined && g.walkEdges[cwId].kind === WalkKind.Crosswalk ? g.walkEdges[cwId] : null;
      // vehicle head: from the approach lanes that end here
      const lanes = net.approachLanes.get(j * 16 + k) ?? [];
      if (lanes.length) {
        let sx = 0, sz = 0, dx = 0, dz = 0;
        for (const l of lanes) {
          const p = g.links[l].pts, n = p.length;
          sx += p[n - 2]; sz += p[n - 1];
          const ex = p[n - 2] - p[n - 4], ez = p[n - 1] - p[n - 3], el = Math.hypot(ex, ez) || 1;
          dx += ex / el; dz += ez / el;
        }
        sx /= lanes.length; sz /= lanes.length;
        const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
        const rx = -dz, rz = dx; // right of travel
        let x: number, z: number, ax: number, az: number;
        if (cw) {
          const p = cw.pts, n = p.length;
          const e0 = [p[0], p[1]], e1 = [p[n - 2], p[n - 1]];
          const r0 = (e0[0] - sx) * rx + (e0[1] - sz) * rz;
          [x, z] = r0 > 0 ? e0 : e1; [ax, az] = r0 > 0 ? e1 : e0;
        } else {
          const w = g.links[lanes[0]].width * lanes.length / 2 + 3.4;
          x = sx + rx * w; z = sz + rz * w; ax = sx - rx * w; az = sz - rz * w;
        }
        out.push({ index: out.length, kind: 'vehicle', junction: j, arm: k, x, z, altX: ax, altZ: az, faceYaw: Math.atan2(dx, dz), stopX: sx, stopZ: sz, street });
      }
      // pedestrian heads at both ends of the crosswalk across this arm, facing across
      if (cw) {
        const p = cw.pts, n = p.length;
        const ends: [number, number, number, number][] = [[p[0], p[1], p[n - 2], p[n - 1]], [p[n - 2], p[n - 1], p[0], p[1]]];
        for (const [x, z, ox, oz] of ends) {
          // lenses face the people waiting at the other end: heading from the far end towards this one
          out.push({ index: out.length, kind: 'ped', junction: j, arm: k, x, z, faceYaw: Math.atan2(-(x - ox), -(z - oz)) + Math.PI, street });
        }
      }
    });
  });
  return out;
}

export function writeSignalStates(net: Network, heads: SignalHead[], t: number, out: Uint8Array) {
  const g = net.g;
  for (const h of heads) {
    if (!net.isSignal(h.junction)) { out[h.index] = SignalState.Dark; continue; }
    const ph = g.junctions[h.junction].arms[h.arm].phase;
    const s = net.phaseState(h.junction, ph, t);
    if (h.kind === 'vehicle') { out[h.index] = s === Sig.Green ? SignalState.Green : s === Sig.Yellow ? SignalState.Yellow : SignalState.Red; continue; }
    if (s !== Sig.Red) { out[h.index] = SignalState.DontWalk; continue; }
    const cw = net.crosswalkOfJunctionArm.get(h.junction * 16 + h.arm)!;
    const cross = net.walkLen[cw] / PED_SPEED;
    out[h.index] = net.timeToGreen(h.junction, ph, t) >= cross + 2 ? SignalState.Walk : SignalState.DontWalkFlash;
  }
}
