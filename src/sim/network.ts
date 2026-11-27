/**
 * Runtime view of the lane graph: cached arc lengths, signal timing, adjacency, spatial lookups.
 */
import { cumLengths, sampleAt } from './geom';
import { JuncFlag, LinkKind, RoadFlag, WalkKind, type LaneGraph } from './laneFormat';

export const enum Sig { Green = 0, Yellow = 1, Red = 2, None = 3 }

export class Network {
  readonly cum: Float32Array[];
  readonly len: Float32Array;
  /** Lane link ids per road (all directions). */
  readonly roadLanes: number[][];
  /** Lane link ids per lane group, index = laneIndex. */
  readonly groups = new Map<number, number[]>();
  /** Walk adjacency: per node, list of [edge, otherNode]. */
  readonly walkAdj: [number, number][][];
  readonly walkLen: Float32Array;
  readonly walkCum: Float32Array[];
  /** Junction phase start times within the cycle. */
  private phaseStart: number[][];
  /** Lane ids per spatial cell (25 m), from lane sample points. */
  private laneCells = new Map<number, number[]>();
  private walkCells = new Map<number, number[]>();
  readonly laneIds: number[] = [];
  readonly sidewalkIds: number[] = [];
  readonly crosswalkOfJunctionArm = new Map<number, number>();
  /** Incoming lanes (that end) at junction j via arm k: key j*16+k. */
  readonly approachLanes = new Map<number, number[]>();

  constructor(readonly g: LaneGraph) {
    this.cum = g.links.map((l) => cumLengths(l.pts));
    this.len = new Float32Array(this.cum.map((c) => c[c.length - 1] || 0.01));
    this.roadLanes = g.roads.map(() => []);
    g.links.forEach((l, i) => {
      if (l.kind !== LinkKind.Lane) return;
      this.laneIds.push(i);
      this.roadLanes[l.owner].push(i);
      const grp = this.groups.get(l.group) ?? []; grp[l.laneIndex] = i; this.groups.set(l.group, grp);
      const key = l.endJ * 16 + l.endArm;
      (this.approachLanes.get(key) ?? this.approachLanes.set(key, []).get(key)!).push(i);
      const c = this.cum[i], o = [0, 0, 0, 0];
      for (let s = 0; s <= c[c.length - 1]; s += 10) { sampleAt(l.pts, c, s, o); this.addCell(this.laneCells, o[0], o[1], i); }
    });
    this.walkAdj = g.walkNodes.map(() => []);
    this.walkCum = g.walkEdges.map((e) => cumLengths(e.pts));
    this.walkLen = new Float32Array(this.walkCum.map((c) => c[c.length - 1] || 0.01));
    g.walkEdges.forEach((e, i) => {
      this.walkAdj[e.a].push([i, e.b]); this.walkAdj[e.b].push([i, e.a]);
      if (e.kind === WalkKind.Sidewalk) {
        this.sidewalkIds.push(i);
        const c = this.walkCum[i], o = [0, 0, 0, 0];
        for (let s = 0; s <= c[c.length - 1]; s += 8) { sampleAt(e.pts, c, s, o); this.addCell(this.walkCells, o[0], o[1], i); }
      } else this.crosswalkOfJunctionArm.set(e.owner * 16 + e.arm, i);
    });
    this.phaseStart = g.junctions.map((j) => { let t = 0; return j.phases.map((p) => { const s = t; t += p.green + p.yellow + p.allRed; return s; }); });
  }

  private addCell(m: Map<number, number[]>, x: number, z: number, id: number) {
    const k = cellKey(x, z, 25); const l = m.get(k) ?? m.set(k, []).get(k)!;
    if (l[l.length - 1] !== id) l.push(id);
  }
  lanesNear(x: number, z: number, r: number, out: Set<number>) { cellsAround(this.laneCells, x, z, r, 25, out); return out; }
  sidewalksNear(x: number, z: number, r: number, out: Set<number>) { cellsAround(this.walkCells, x, z, r, 25, out); return out; }

  /** Junctions whose signals are unpowered (brownout): treated as all-way stops. */
  readonly dark = new Set<number>();
  isSignal(j: number) { return j >= 0 && (this.g.junctions[j].flags & JuncFlag.Signal) !== 0 && !this.dark.has(j); }
  /** Has signal hardware (even if currently dark from a brownout). */
  isSignalled(j: number) { return j >= 0 && (this.g.junctions[j].flags & JuncFlag.Signal) !== 0; }

  /** Signal state for a phase at time t (s). */
  phaseState(j: number, phase: number, t: number): Sig {
    const J = this.g.junctions[j];
    if (!(J.flags & JuncFlag.Signal) || phase < 0) return Sig.None;
    const tau = (((t - J.offset) % J.cycle) + J.cycle) % J.cycle;
    const st = this.phaseStart[j][phase], p = J.phases[phase];
    const d = tau - st;
    if (d >= 0 && d < p.green) return Sig.Green;
    if (d >= p.green && d < p.green + p.yellow) return Sig.Yellow;
    return Sig.Red;
  }
  /** Seconds until this phase next turns green (0 if green now). */
  timeToGreen(j: number, phase: number, t: number): number {
    const J = this.g.junctions[j];
    const tau = (((t - J.offset) % J.cycle) + J.cycle) % J.cycle;
    const st = this.phaseStart[j][phase], p = J.phases[phase];
    const d = tau - st;
    if (d >= 0 && d < p.green) return 0;
    return ((st - tau) % J.cycle + J.cycle) % J.cycle;
  }
  /** Signal state governing the stop line at the end of lane `l`. */
  laneSignal(l: number, t: number): Sig {
    const L = this.g.links[l];
    if (L.endJ < 0 || !this.isSignal(L.endJ)) return Sig.None;
    return this.phaseState(L.endJ, this.g.junctions[L.endJ].arms[L.endArm].phase, t);
  }
  /** Pedestrian signal for the crosswalk across arm k of junction j: may a ped START crossing now, given crossing time? */
  walkAllowed(j: number, arm: number, t: number, crossTime: number): boolean {
    if (!this.isSignal(j)) return true;
    const ph = this.g.junctions[j].arms[arm].phase;
    if (ph < 0) return true;
    if (this.phaseState(j, ph, t) !== Sig.Red) return false;
    // Turning traffic from other phases yields; just make sure we finish before our arm turns green.
    return this.timeToGreen(j, ph, t) >= crossTime + 2;
  }

  roadName(r: number) { return this.g.names[this.g.roads[r].name]; }
  isAvenue(r: number) { return (this.g.roads[r].flags & RoadFlag.Avenue) !== 0; }
}

export function cellKey(x: number, z: number, cs: number) { return ((Math.floor(x / cs) + 2048) << 12) | (Math.floor(z / cs) + 2048); }
export function cellsAround(m: Map<number, number[]>, x: number, z: number, r: number, cs: number, out: Set<number>) {
  const i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = m.get(((i + 2048) << 12) | (j + 2048)); if (l) for (const v of l) out.add(v); }
}

/** Uniform grid of agent indices rebuilt every step. */
export class AgentGrid {
  private cells = new Map<number, number[]>();
  private used: number[][] = [];
  constructor(readonly cs: number) {}
  clear() { for (const l of this.used) l.length = 0; this.used.length = 0; }
  add(x: number, z: number, id: number) {
    const k = cellKey(x, z, this.cs);
    let l = this.cells.get(k); if (!l) { l = []; this.cells.set(k, l); }
    if (!l.length) this.used.push(l);
    l.push(id);
  }
  query(x: number, z: number, r: number, cb: (id: number) => void) {
    const cs = this.cs, i0 = Math.floor((x - r) / cs), i1 = Math.floor((x + r) / cs), j0 = Math.floor((z - r) / cs), j1 = Math.floor((z + r) / cs);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = this.cells.get(((i + 2048) << 12) | (j + 2048)); if (l) for (let k = 0; k < l.length; k++) cb(l[k]); }
  }
}
