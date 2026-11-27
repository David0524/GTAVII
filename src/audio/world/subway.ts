/**
 * Subway trains under the 1974 lines that cross the play area, and the sidewalk ventilation
 * gratings above them. The lines follow the real routes (IND Eighth Ave, IRT Seventh Ave south of
 * Times Square, IND Sixth Ave, BMT Broadway, IRT Lexington under Park Ave South/Park Ave, and the
 * Flushing line and shuttle under 42nd St), with headways by time of day. Gratings respond to
 * where the trains actually are: rumble as a train passes below, the air push ahead of it.
 */
import type { CityMap } from './cityMap';
import type { StreetRec } from '../acoustics/geometry';
import { Rng } from '../worklets/dsp';

export interface Line { id: string; pts: [number, number][]; len: number; cum: number[]; roadW: number }
export interface Grating { x: number; z: number; line: number; s: number; seed: number }
interface Train { line: number; dir: 1 | -1; s: number; v: number; screech: number }

const TRAIN_LEN = 155;

export class Subway {
  lines: Line[] = [];
  gratings: Grating[] = [];
  trains: Train[] = [];
  private spawnT: number[] = [];
  private rng = new Rng(1974);

  constructor(map: CityMap, streets: StreetRec[], region: { minZ: number; maxZ: number }) {
    const zN = region.minZ - 150, zS = region.maxZ + 150;
    const av = (name: string, z0: number, z1: number, w = 20): void => { const x = map.x(name); if (x !== undefined) this.add(`${name}`, [[x, z0], [x, z1]], w); };
    av('8th Avenue', zS, zN);
    av('7th Avenue', zS, map.z(42));
    av('6th Avenue', zS, zN);
    av('Park Avenue South', zS, map.z(42));
    // Broadway: chain the real centreline segments north to south.
    const bw = streets.filter((s) => s.n === 'Broadway');
    const pts: [number, number][] = [];
    for (const s of bw) for (let k = 0; k < s.p.length; k += 2) pts.push([s.p[k], s.p[k + 1]]);
    pts.sort((a, b) => a[1] - b[1]);
    const thin: [number, number][] = []; for (const p of pts) if (!thin.length || Math.hypot(p[0] - thin[thin.length - 1][0], p[1] - thin[thin.length - 1][1]) > 30) thin.push(p);
    if (thin.length > 1) this.add('Broadway', thin.filter((p) => p[1] > map.z(42) - 20), 15);
    const x7 = map.x('7th Avenue') ?? -605, xL = map.x('Park Avenue South') ?? 298;
    this.add('42nd St', [[x7, map.z(42)], [xL + 150, map.z(42)]], 18);
    // Gratings every ~24 m along each line, alternating sides of the roadway.
    this.lines.forEach((l, li) => {
      const r = new Rng(li * 31 + 7);
      for (let s = 12, side = 1; s < l.len; s += 18 + r.next() * 14, side = -side) {
        const [x, z, dx, dz] = this.at(li, s); const off = (l.roadW / 2 + 2.2) * side;
        this.gratings.push({ x: x - dz * off, z: z + dx * off, line: li, s, seed: (li * 1000 + s) | 0 });
      }
      this.spawnT.push(r.next() * 60);
    });
  }

  private add(id: string, pts: [number, number][], roadW: number) {
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    this.lines.push({ id, pts, len: cum[cum.length - 1], cum, roadW });
  }

  /** Point and unit tangent at arclength s on line li. */
  at(li: number, s: number): [number, number, number, number] {
    const l = this.lines[li]; s = Math.max(0, Math.min(l.len, s));
    let k = 1; while (k < l.cum.length - 1 && l.cum[k] < s) k++;
    const a = l.pts[k - 1], b = l.pts[k], seg = l.cum[k] - l.cum[k - 1] || 1, t = (s - l.cum[k - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  }

  /** Minutes between trains per direction (1974 service, roughly). */
  headway(hour: number) { return hour < 1 ? 12 : hour < 5.5 ? 20 : hour < 7 ? 8 : hour < 9.5 ? 4 : hour < 16 ? 8 : hour < 19 ? 4.5 : hour < 22 ? 8 : 12; }

  update(dt: number, hour: number, powered: boolean) {
    for (let li = 0; li < this.lines.length; li++) {
      if ((this.spawnT[li] -= dt) > 0) continue;
      this.spawnT[li] = (this.headway(hour) * 60) / 2 * (0.7 + this.rng.next() * 0.6); // both directions share the timer
      const dir: 1 | -1 = this.rng.next() < 0.5 ? 1 : -1;
      const l = this.lines[li];
      this.trains.push({ line: li, dir, s: dir > 0 ? -TRAIN_LEN - 100 : l.len + 100, v: (powered ? 10 : 4) + this.rng.next() * 5, screech: this.rng.next() < 0.3 ? this.rng.next() : 0 });
    }
    for (let i = this.trains.length - 1; i >= 0; i--) {
      const t = this.trains[i]; t.s += t.dir * t.v * dt;
      const l = this.lines[t.line];
      if (t.s < -TRAIN_LEN - 200 || t.s > l.len + TRAIN_LEN + 200) this.trains.splice(i, 1);
    }
  }

  /** What one grating hears right now: rumble (train below), air (push ahead / pull behind), flange screech. */
  gratingState(g: Grating): [number, number, number] {
    let rumble = 0, air = 0, screech = 0;
    for (const t of this.trains) {
      if (t.line !== g.line) continue;
      const head = t.s, tail = t.s - t.dir * TRAIN_LEN;
      const lo = Math.min(head, tail), hi = Math.max(head, tail);
      const d = g.s < lo ? lo - g.s : g.s > hi ? g.s - hi : 0;
      rumble = Math.max(rumble, Math.exp(-d / 45) * (0.5 + 0.5 * Math.min(1, t.v / 12)));
      const ahead = (g.s - head) * t.dir; // >0: train approaching this grating
      if (ahead > 0 && ahead < 140) air = Math.max(air, (1 - ahead / 140) * Math.min(1, t.v / 10));
      if (d === 0) screech = Math.max(screech, t.screech);
    }
    return [rumble, air, screech];
  }
}
