/**
 * Subway: a logical layer over the street entrances (the engine/interiors own any underground geometry).
 *
 *  - Stations are clusters of the mapped subway entrances (lanes.bin spots), assigned to a line by the
 *    avenue they sit on. LINES is a plain table the narrative team can correct for 1974 service; names
 *    are the generic trunk lines, not route letters.
 *  - Trains run a deterministic timetable: a pure function of the clock (headway by time of day, run
 *    time between stations from distance), both directions. No train state, so any station's next
 *    arrivals can be answered instantly (gameplay: cops boarding at the next station during a chase).
 *  - Platform crowds per station and direction fill with riders going underground (commuters entering,
 *    an ambient rate by time of day) and empty when a train boards them; alighting riders surface from
 *    the station's entrances. Events (only for stations near the focus): trainArriving, trainDeparted.
 */
import { SpotKind } from './laneFormat';
import type { SimCore } from './state';
import { pedDensity } from './state';

/** Trunk lines by the avenue their stations sit under (editable; narrative verifies 1974 service). */
export const LINES: { key: string; name: string; avenue: RegExp; speed: number }[] = [
  { key: 'eighth', name: 'Eighth Avenue line', avenue: /^8th Avenue$/, speed: 10 },
  { key: 'seventh', name: 'Seventh Avenue line', avenue: /^7th Avenue$/, speed: 10 },
  { key: 'sixth', name: 'Sixth Avenue line', avenue: /^(6th Avenue|Avenue of the Americas)$/, speed: 10 },
  { key: 'broadway', name: 'Broadway line', avenue: /^Broadway$/, speed: 10 },
  { key: 'lexington', name: 'Lexington Avenue line', avenue: /^(Lexington Avenue|Park Avenue South|Park Avenue)$/, speed: 11 },
  // PATH (Hudson tubes) runs under 6th Avenue too; its entrances are split off the IND by CANON below
  { key: 'path', name: 'PATH', avenue: /^$/, speed: 12 },
];

/**
 * Canonical 1974 stops (narrative content/subway.json, joined on line + cross street). Entrance clusters
 * snap to the stop on their line within 2 streets and take its name; clusters of one stop merge (long
 * platforms). `complex` marks free-transfer groups shown as one place on the map.
 */
export const CANON: Record<string, { st: number; name: string; complex?: string }[]> = {
  eighth: [{ st: 23, name: '23rd St' }, { st: 34, name: '34th St–Penn Station' }, { st: 42, name: '42nd St–Port Authority Bus Terminal' }],
  seventh: [{ st: 23, name: '23rd St' }, { st: 28, name: '28th St' }, { st: 34, name: '34th St–Penn Station' }, { st: 42, name: 'Times Square–42nd St', complex: 'times_sq' }],
  sixth: [{ st: 23, name: '23rd St' }, { st: 34, name: '34th St–Herald Square', complex: 'herald_sq' }, { st: 42, name: '42nd St' }],
  broadway: [{ st: 23, name: '23rd St' }, { st: 28, name: '28th St' }, { st: 34, name: '34th St–Herald Square', complex: 'herald_sq' }, { st: 42, name: 'Times Square–42nd St', complex: 'times_sq' }],
  lexington: [{ st: 23, name: '23rd St' }, { st: 28, name: '28th St' }, { st: 33, name: '33rd St' }],
  path: [{ st: 33, name: '33rd St' }],
};
/** 6th Avenue entrances between these cross streets are the PATH's, not the IND's. */
const PATH_RANGE: [number, number] = [29, 33];
const DWELL = 25; // s at each station

export interface Station { id: number; name: string; line: string; lineName: string; x: number; z: number; entrances: { x: number; z: number }[]; order: number; crossStreet: number; complex?: string }
export interface TrainCall { line: string; dir: 'uptown' | 'downtown'; inSec: number }

export function headway(minute: number): number {
  const h = minute / 60;
  if (h < 6) return 20 * 60; if (h < 7) return 8 * 60; if (h < 9.5) return 4 * 60; if (h < 16) return 6 * 60; if (h < 19) return 4 * 60; if (h < 23) return 8 * 60; return 12 * 60;
}

export class Subway {
  readonly stations: Station[] = [];
  /** riders waiting, [uptown, downtown] per station */
  private crowd: [number, number][] = [];
  private lastPhase: number[][] = [];
  private exits: { st: number; n: number; t: number }[] = [];
  arrivals = 0; boarded = 0; alighted = 0;

  constructor(private S: SimCore) {
    const net = S.net, g = net.g;
    const ents = g.spots.filter((s) => s.kind === SpotKind.Subway);
    // which line: the avenue road nearest each entrance (within 45 m)
    const lineOf = (x: number, z: number): number => {
      let best = -1, bd = 45;
      for (const l of net.lanesNear(x, z, 45, new Set())) {
        const name = net.roadName(g.links[l].owner);
        const li = LINES.findIndex((L) => L.avenue.test(name));
        if (li < 0) continue;
        const p = g.links[l].pts; let d = Infinity;
        for (let k = 0; k < p.length; k += 2) d = Math.min(d, Math.hypot(p[k] - x, p[k + 1] - z));
        if (d < bd) { bd = d; best = li; }
      }
      return best;
    };
    const tagged = ents.map((e) => ({ x: e.x, z: e.z, line: lineOf(e.x, e.z) })).filter((e) => e.line >= 0);
    // cluster along each line: entrances within 140 m of a station's first entrance join it
    for (const e of tagged.sort((a, b) => a.line - b.line || a.z - b.z || a.x - b.x)) {
      const st = this.stations.find((s) => s.line === LINES[e.line].key && Math.abs(s.z - e.z) < 140 && Math.abs(s.x - e.x) < 90);
      if (st) { st.entrances.push({ x: e.x, z: e.z }); const n = st.entrances.length; st.x += (e.x - st.x) / n; st.z += (e.z - st.z) / n; }
      else this.stations.push({ id: this.stations.length, name: '', line: LINES[e.line].key, lineName: LINES[e.line].name, x: e.x, z: e.z, entrances: [{ x: e.x, z: e.z }], order: 0, crossStreet: 0 });
    }
    // snap clusters to the canonical stops; merge fragments of one stop; drop clusters with no stop
    const merged: Station[] = [];
    for (const c of this.stations) {
      let line = c.line;
      const n = this.crossStreet(c.x, c.z);
      if (line === 'sixth' && n >= PATH_RANGE[0] && n <= PATH_RANGE[1]) line = 'path';
      const canon = (CANON[line] ?? []).reduce<{ st: number; name: string; complex?: string } | null>((b, q) => (Math.abs(q.st - n) <= 2 && (!b || Math.abs(q.st - n) < Math.abs(b.st - n)) ? q : b), null);
      if (!canon) continue;
      const L = LINES.find((q) => q.key === line)!;
      const into = merged.find((m) => m.line === line && m.crossStreet === canon.st);
      if (into) { into.entrances.push(...c.entrances); const k = into.entrances.length; into.x = into.entrances.reduce((a, e) => a + e.x, 0) / k; into.z = into.entrances.reduce((a, e) => a + e.z, 0) / k; }
      else merged.push({ ...c, id: merged.length, line, lineName: L.name, name: canon.name, crossStreet: canon.st, complex: canon.complex, entrances: [...c.entrances] });
    }
    this.stations.length = 0; this.stations.push(...merged);
    // order along each line (downtown = larger z)
    for (const L of LINES) this.stations.filter((s) => s.line === L.key).sort((a, b) => b.z - a.z).forEach((s, i) => { s.order = i; });
    this.crowd = this.stations.map(() => [S.rng.range(5, 25), S.rng.range(5, 25)]);
    this.lastPhase = this.stations.map(() => [-1, -1]);
  }

  /** Number of the nearest numbered cross street (0 if none within 120 m). */
  private crossStreet(x: number, z: number): number {
    const net = this.S.net;
    let best = 0, bd = 120;
    for (const l of net.lanesNear(x, z, 120, new Set())) {
      const name = net.roadName(net.g.links[l].owner);
      const m = /^(?:East|West) (\d+)(?:st|nd|rd|th) Street$/.exec(name); if (!m) continue;
      const p = net.g.links[l].pts; let d = Infinity;
      for (let k = 0; k < p.length; k += 2) d = Math.min(d, Math.hypot(p[k] - x, p[k + 1] - z));
      if (d < bd) { bd = d; best = +m[1]; }
    }
    return best;
  }

  private offsets: [number, number][] = [];
  private stopOffset(st: Station, dir: 0 | 1): number {
    if (!this.offsets[st.id]) this.offsets[st.id] = [this.computeOffset(st, 0), this.computeOffset(st, 1)];
    return this.offsets[st.id][dir];
  }
  /** Seconds into the headway cycle when a train in `dir` is at station st (dwell start). */
  private computeOffset(st: Station, dir: 0 | 1): number {
    const L = LINES.find((q) => q.key === st.line)!;
    const sts = this.stations.filter((s) => s.line === st.line).sort((a, b) => b.z - a.z);
    // cumulative run time from the downtown end (uptown trains) or the uptown end (downtown trains)
    let t = 0;
    const seq = dir === 0 ? sts : [...sts].reverse();
    for (let i = 0; i < seq.length; i++) {
      if (seq[i] === st) break;
      t += Math.hypot(seq[i + 1].x - seq[i].x, seq[i + 1].z - seq[i].z) / L.speed + DWELL;
    }
    return t + (dir === 1 ? 97 : 0) + st.line.length * 31; // stagger lines and directions
  }

  /** Next trains at a station (both directions), soonest first. */
  nextTrains(stationId: number, n = 4): TrainCall[] {
    const st = this.stations[stationId]; if (!st) return [];
    const hw = headway(this.S.minute), t = this.S.t, out: TrainCall[] = [];
    for (const dir of [0, 1] as const) {
      const off = this.stopOffset(st, dir);
      let next = Math.ceil((t - off) / hw) * hw + off;
      for (let k = 0; k < n; k++, next += hw) out.push({ line: st.line, dir: dir === 0 ? 'uptown' : 'downtown', inSec: next - t });
    }
    return out.sort((a, b) => a.inSec - b.inSec).slice(0, n);
  }

  /**
   * Exact train time between two stations on the same line: the direction you'd ride and the seconds from
   * departing `from` (end of its dwell) to arriving at `to`. Null if they're on different lines.
   * Uptown = towards -z; `order` counts up from the downtown end.
   */
  trainTravel(fromId: number, toId: number): { dir: 'uptown' | 'downtown'; sec: number } | null {
    const a = this.stations[fromId], b = this.stations[toId];
    if (!a || !b || a.line !== b.line || a === b) return null;
    const dir: 0 | 1 = b.z < a.z ? 0 : 1;
    return { dir: dir === 0 ? 'uptown' : 'downtown', sec: this.stopOffset(b, dir) - this.stopOffset(a, dir) - DWELL };
  }

  platformCrowd(stationId: number) { const c = this.crowd[stationId]; return c ? { uptown: Math.round(c[0]), downtown: Math.round(c[1]) } : null; }

  /** Nearest station to a point, or -1. */
  stationNear(x: number, z: number, r = 150): number {
    let best = -1, bd = r;
    for (const s of this.stations) for (const e of s.entrances) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = s.id; } }
    return best;
  }

  /** A ped went down the stairs (commuters, scripted riders). */
  riderEntered(x: number, z: number) {
    const st = this.stationNear(x, z, 40); if (st < 0) return;
    this.crowd[st][this.S.rng.int(2)] += 1;
  }

  step(dt: number) {
    const S = this.S, hw = headway(S.minute), dens = pedDensity(S.minute);
    for (const st of this.stations) {
      // ambient riders arriving on the platform
      for (const d of [0, 1]) this.crowd[st.id][d] = Math.min(400, this.crowd[st.id][d] + dt * 0.25 * dens);
      const near = Math.hypot(st.x - S.focus.x, st.z - S.focus.z) < 450;
      for (const dir of [0, 1] as const) {
        const off = this.stopOffset(st, dir);
        const ph = Math.floor((S.t - off) / hw), inCycle = (S.t - off) - ph * hw;
        if (ph !== this.lastPhase[st.id][dir] && inCycle >= 0 && inCycle < DWELL + dt) {
          this.lastPhase[st.id][dir] = ph;
          // train in: board (car capacity ~ 10 cars) and alight a share that rises at rush hours
          const board = Math.min(this.crowd[st.id][dir], 1000);
          this.crowd[st.id][dir] -= board; this.boarded += board; this.arrivals++;
          const alight = Math.round((6 + 30 * dens) * (0.6 + 0.8 * S.rng.next()));
          this.alighted += alight;
          if (near) {
            S.emit('trainArriving', { station: st.id, name: st.name, line: st.line, dir: dir === 0 ? 'uptown' : 'downtown', boarded: Math.round(board), alighting: alight });
            // a handful surface at the entrances over the next 25 s (the rest go elsewhere underground)
            this.exits.push({ st: st.id, n: Math.min(8, Math.round(alight / 6)), t: S.t });
          }
        }
        if (near && inCycle >= DWELL && inCycle < DWELL + dt) S.emit('trainDeparted', { station: st.id, name: st.name, line: st.line, dir: dir === 0 ? 'uptown' : 'downtown' });
      }
    }
    // riders coming up the stairs
    for (const ex of this.exits) {
      if (ex.n <= 0 || S.t - ex.t < 8) continue;
      if (S.rng.chance(dt * 0.6) && S.peds.length < S.maxPeds) {
        const st = this.stations[ex.st], e = st.entrances[S.rng.int(st.entrances.length)];
        S.spawnPedAt(e.x, e.z, 'subwayExit'); ex.n--;
      }
    }
    this.exits = this.exits.filter((e) => e.n > 0 && S.t - e.t < 60);
  }
}
