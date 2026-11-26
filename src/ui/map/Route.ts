/**
 * Pencilled route (no GPS in 1974): shortest path over the real street centrelines.
 * On foot, one-ways don't matter and expressways are off limits; by car, the 1974 one-way table in
 * streets.json is honoured. turns() lists the call-outs ("left on West 34th") that a passenger lead
 * or a cabbie reads out (Audio + Narrative voice them; the HUD shows them too, since no information
 * may be audio-only).
 */
import type { StreetRec } from './grid';

export type RouteMode = 'foot' | 'car';
interface Edge { to: number; len: number; street: number; fwd: boolean }

const Q = 2; // quantise vertices to 0.5 m so shared OSM nodes merge

export class RouteGraph {
  readonly nx: number[] = []; readonly nz: number[] = [];
  private adj: Edge[][] = [];
  private key = new Map<string, number>();
  private cellIdx = new Map<string, number[]>();

  constructor(readonly streets: StreetRec[]) {
    streets.forEach((s, si) => {
      const foot = !/motorway|trunk/.test(s.c);
      for (let k = 2; k < s.p.length; k += 2) {
        const a = this.node(s.p[k - 2], s.p[k - 1]), b = this.node(s.p[k], s.p[k + 1]);
        if (a === b) continue;
        const len = Math.hypot(s.p[k] - s.p[k - 2], s.p[k + 1] - s.p[k - 1]);
        // fwd: travelling a->b follows the polyline direction. s.o: 0 two-way, 1 one-way along, -1 against.
        this.adj[a].push({ to: b, len, street: foot ? si : ~si, fwd: true });
        this.adj[b].push({ to: a, len, street: foot ? si : ~si, fwd: false });
      }
    });
  }
  private node(x: number, z: number) {
    const k = `${Math.round(x * Q)},${Math.round(z * Q)}`;
    let i = this.key.get(k);
    if (i === undefined) {
      i = this.nx.length; this.key.set(k, i); this.nx.push(x); this.nz.push(z); this.adj.push([]);
      const ck = `${Math.floor(x / 50)},${Math.floor(z / 50)}`; const c = this.cellIdx.get(ck) ?? []; c.push(i); this.cellIdx.set(ck, c);
    }
    return i;
  }
  get nodeCount() { return this.nx.length; }

  nearestNode(x: number, z: number, mode: RouteMode): number {
    let best = -1, bd = Infinity;
    for (let r = 0; r < 6 && best < 0; r++) {
      const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (const n of this.cellIdx.get(`${cx + i},${cz + j}`) ?? []) {
        if (!this.adj[n].some((e) => this.usable(e, mode))) continue;
        const d = Math.hypot(this.nx[n] - x, this.nz[n] - z); if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }
  private usable(e: Edge, mode: RouteMode) {
    const si = e.street < 0 ? ~e.street : e.street;
    if (mode === 'foot') return e.street >= 0;
    const o = this.streets[si].o;
    return !o || (o > 0) === e.fwd;
  }

  /** A*: returns the polyline (x,z pairs) and the street index per segment, or null. */
  find(ax: number, az: number, bx: number, bz: number, mode: RouteMode): { pts: number[]; streets: number[]; length: number } | null {
    const s = this.nearestNode(ax, az, mode), t = this.nearestNode(bx, bz, mode);
    if (s < 0 || t < 0) return null;
    const N = this.nx.length, g = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Int32Array(N).fill(-1);
    const heap = new MinHeap(); g[s] = 0; heap.push(s, 0);
    const tx = this.nx[t], tz = this.nz[t];
    while (heap.size) {
      const u = heap.pop();
      if (u === t) break;
      for (const e of this.adj[u]) {
        if (!this.usable(e, mode)) continue;
        const ng = g[u] + e.len;
        if (ng < g[e.to]) { g[e.to] = ng; prev[e.to] = u; via[e.to] = e.street < 0 ? ~e.street : e.street; heap.push(e.to, ng + Math.hypot(this.nx[e.to] - tx, this.nz[e.to] - tz)); }
      }
    }
    if (!Number.isFinite(g[t])) return null;
    const nodes: number[] = [], streets: number[] = [];
    for (let n = t; n >= 0; n = prev[n]) { nodes.push(n); if (prev[n] >= 0) streets.push(via[n]); }
    nodes.reverse(); streets.reverse();
    const pts: number[] = [ax, az];
    for (const n of nodes) pts.push(this.nx[n], this.nz[n]);
    pts.push(bx, bz);
    return { pts, streets, length: g[t] };
  }
}

export interface Turn { atM: number; dir: 'left' | 'right' | 'bear left' | 'bear right'; onto: string; x: number; z: number }

/** Turn call-outs where the route changes street by more than 25°. */
export function turns(route: { pts: number[]; streets: number[] }, streets: StreetRec[]): Turn[] {
  const out: Turn[] = [];
  let along = 0;
  // route.pts = [start, n0, n1, ..., nk, end]; segment i (n_i -> n_{i+1}) has street streets[i]
  for (let i = 1; i < route.streets.length; i++) {
    const p = route.pts;
    const ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * i + 2], bz = p[2 * i + 3], cx = p[2 * i + 4], cz = p[2 * i + 5];
    along += Math.hypot(bx - ax, bz - az);
    const a = streets[route.streets[i - 1]].n, b = streets[route.streets[i]].n;
    if (!b || a === b) continue;
    const h1 = Math.atan2(bz - az, bx - ax), h2 = Math.atan2(cz - bz, cx - bx);
    let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) < 0.44) continue;
    // world: x east, z south; turning toward +angle (clockwise on screen with z down) is a right turn
    const dir = d > 0 ? (d > 1.1 ? 'right' : 'bear right') : (d < -1.1 ? 'left' : 'bear left');
    if (out.length && out[out.length - 1].onto === b) continue;
    out.push({ atM: Math.round(along), dir, onto: b, x: bx, z: bz });
  }
  return out;
}

/** "Left on Thirty-Fourth" style call-out text (period speech: numbers as words). */
export function callout(t: Turn): string {
  const st = t.onto.match(/^(?:West|East) (\d+)(?:st|nd|rd|th) Street$/);
  const av = t.onto.match(/^(\d+)(?:st|nd|rd|th) Avenue$/);
  const what = st ? numberWord(+st[1]) : av ? `${numberWord(+av[1])} Avenue` : t.onto;
  return `${t.dir[0].toUpperCase()}${t.dir.slice(1)} on ${what}`;
}
const ONES = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty'];
const TENTH = ['', '', 'Twentieth', 'Thirtieth', 'Fortieth', 'Fiftieth'];
function numberWord(n: number) { if (n < 20) return ONES[n]; const t = Math.floor(n / 10), o = n % 10; return o ? `${TENS[t]}-${ONES[o]}` : TENTH[t]; }

class MinHeap {
  private k: number[] = []; private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const k = this.k, v = this.v; k.push(key); v.push(val); let i = k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= v[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v, top = k[0], lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      k[0] = lk; v[0] = lv; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < k.length && v[l] < v[m]) m = l; if (r < k.length && v[r] < v[m]) m = r; if (m === i) break; [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m; }
    }
    return top;
  }
}

/** Narrative's call-out pool (content/barks/route_calls.json): lines with {street}/{avenue} slots, tagged
 *  by voice. Picks a line that agrees with the turn (direction word and street vs avenue), so a voiced
 *  line can never contradict the call-out the HUD prints. Returns null when no line fits. */
export interface CallLine { context: string; text: string; emotion?: string }
export function voicedCallout(t: Turn, voice: string, pool: CallLine[], seed = 0): string | null {
  const isAve = /Avenue$|^Broadway$/.test(t.onto), dir = t.dir.includes('left') ? 'left' : 'right', other = dir === 'left' ? 'right' : 'left';
  const name = callout(t).replace(/^.*? on /, '');
  const ok = pool.filter((l) => l.context === voice && new RegExp(`\\b${dir}\\b`, 'i').test(l.text) && !new RegExp(`\\b${other}\\b`, 'i').test(l.text)
    && (isAve ? l.text.includes('{avenue}') : l.text.includes('{street}')));
  if (!ok.length) return null;
  return ok[Math.abs(seed) % ok.length].text.replace('{street}', name).replace('{avenue}', name);
}
