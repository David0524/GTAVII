/**
 * Sidewalk reactions from the sim (sim 66e9453, src/sim/bump.ts and peds.ts):
 *  - `pedBumped {kind: brush|stumble|knockdown, response: angry|frightened|annoyed|none, x, z, dirX, dirZ, archetype}`:
 *    body foley by kind (a coat brush, a stumble's scuffs, a fall onto the pavement), and a line from the
 *    pedestrian's own bark pool (archetype -> `barks` in content/npc_archetypes), context `collision`, picked by
 *    response (angry -> angry; annoyed -> annoyed/brisk; frightened -> startled/hurt/worried/scared).
 *  - `pedGotUp {x, z}`: cloth and two scuffs.
 *  - `litter {x, z}`: a wrapper crumpled and dropped.
 *  - `monteScatter {x, z}`: after the lookout's shout (vendors.ts), the crew's running feet fanning out.
 * Everything is within earshot only (bumps 25 m, litter 12 m) and throttled so a crowd crush isn't a chorus.
 */
import type { Env } from '../env';
import type { Vec3 } from '../config';
import type { Footsteps } from './footsteps';
import { setTimeoutAudio } from './ambience';

type BarkFn = (pool: string, context: string, at: () => Vec3, emotions?: readonly string[]) => Promise<boolean>;
const BY_RESPONSE: Record<string, readonly string[]> = { angry: ['angry'], annoyed: ['annoyed', 'brisk'], frightened: ['startled', 'hurt', 'worried', 'scared'] };
/** Seconds between bump lines, city-wide. */
const LINE_GAP = 3;

export class CrowdReactions {
  private poolOf = new Map<string, Promise<string | null>>();
  private lastLine = -1e9;
  contentEnabled = true;
  ground: (x: number, z: number) => number = () => 0;
  stats = { bumps: 0, lines: 0, gotUp: 0, litter: 0, scatters: 0 };

  constructor(private env: Env, private steps: () => Footsteps | null, private bark: BarkFn, private baseUrl: string) {}

  private sim: unknown = null;
  bindSim(sim: { on(type: string, cb: (e: any) => void): void }) {
    if (this.sim === sim) return; this.sim = sim;
    sim.on('pedBumped', (e) => this.bumped(e));
    sim.on('pedGotUp', (e) => { if (!this.near(e, 25)) return; this.stats.gotUp++; const p = this.at(e, 0.6); this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.35, priority: 3 }); this.scuffs(p, 2, 0.5); });
    sim.on('litter', (e) => { if (!this.near(e, 12)) return; this.stats.litter++; this.env.oneShot('paper.crumple', { category: 'footstep', at: this.at(e, 0.3), gain: 0.3, rate: this.env.rng.range(0.9, 1.15), priority: 2 }); });
    sim.on('monteScatter', (e) => { if (!this.near(e, 40)) return; this.stats.scatters++; this.scatter(e.x, e.z); });
  }

  private near(e: { x?: number; z?: number }, r: number) {
    if (typeof e?.x !== 'number' || typeof e?.z !== 'number') return false;
    const l = this.env.vm.listener.position; return Math.hypot(e.x - l[0], e.z - l[2]) < r;
  }
  private at(e: { x: number; z: number }, h: number): Vec3 { return [e.x, this.ground(e.x, e.z) + h, e.z]; }

  /**
   * `byPlayer` (sim 554d254: every pedBumped is player contact today and carries `byPlayer: true` and `by: 'player'`; ped-on-ped brushes, if added, will say false): lines aimed
   * at the player are never dropped for brushes, carry 35 m and only wait 1 s, not the 3 s ambient gap.
   */
  private bumped(e: { kind?: string; response?: string; x: number; z: number; archetype?: string; byPlayer?: boolean; by?: string }) {
    const player = e.byPlayer === true || e.by === 'player';
    if (!this.near(e, player ? 35 : 25)) return; this.stats.bumps++;
    const p = this.at(e, 1.0), r = this.env.rng;
    if (e.kind === 'knockdown') { this.env.oneShot('foley.land', { category: 'footstep', at: this.at(e, 0.2), gain: 0.55, rate: 0.95, priority: 5 }); this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.45, priority: 4 }); }
    else if (e.kind === 'stumble') { this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.35, priority: 4 }); this.scuffs(p, 3, 0.75); }
    else this.env.oneShot('foley.cloth', { category: 'footstep', at: p, gain: 0.22, rate: r.range(1.0, 1.2), priority: 3 });
    const emotions = BY_RESPONSE[e.response ?? 'none']; if (!emotions || !e.archetype) return;
    const now = this.env.ctx.currentTime; if (now - this.lastLine < (player ? 1 : LINE_GAP) || (!player && e.kind === 'brush' && r.next() < 0.5)) return;
    this.lastLine = now;
    const head: Vec3 = [e.x, this.ground(e.x, e.z) + (e.kind === 'knockdown' ? 0.5 : 1.6), e.z];
    void this.poolFor(e.archetype).then(async (pool) => {
      if (!pool) return;
      // Prefer a line that matches the response; any collision line from their pool beats silence.
      const ok = (await this.bark(pool, 'collision', () => head, emotions)) || (await this.bark(pool, 'collision', () => head));
      if (ok) this.stats.lines++;
    });
  }

  /** A few quick scuffing steps around p (a stumble or getting up). */
  private scuffs(p: Vec3, n: number, intensity: number) {
    const fs = this.steps(); if (!fs) return;
    for (let k = 0; k < n; k++) setTimeoutAudio(this.env, 0.12 + k * this.env.rng.range(0.13, 0.2), () => fs.footstep({ position: [p[0] + this.env.rng.range(-0.3, 0.3), p[1] - 0.9, p[2] + this.env.rng.range(-0.3, 0.3)], intensity }));
  }

  /** The monte crew (dealer, shills, lookout) bolts in different directions at a run for ~3 s. */
  private scatter(x: number, z: number) {
    const fs = this.steps(); if (!fs) return; const r = this.env.rng;
    for (let c = 0; c < 4; c++) {
      const a = r.range(0, Math.PI * 2), sp = r.range(3.6, 4.8), cad = 1.6 + sp * 0.25, t0 = 0.6 + r.range(0, 0.5);
      for (let k = 0; k < Math.round(3 * cad); k++) { const t = k / cad; setTimeoutAudio(this.env, t0 + t, () => { const d = sp * t; fs.footstep({ x: x + Math.cos(a) * d, y: this.ground(x, z), z: z + Math.sin(a) * d, run: true }); }); }
    }
  }

  /** Archetype id ('npc.garment_pushboy') -> its bark pool name ('garment'), from content/npc_archetypes. */
  private poolFor(arch: string): Promise<string | null> {
    let p = this.poolOf.get(arch);
    if (!p) {
      const name = arch.replace(/^npc\./, '');
      p = !this.contentEnabled || !/^[a-z0-9_]+$/.test(name) ? Promise.resolve(null)
        : fetch(`${this.baseUrl}content/npc_archetypes/${name}.json`).then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? r.json() : null))
          .then((d: { barks?: string } | null) => (d?.barks ? d.barks.replace(/^barks\./, '') : null)).catch(() => null);
      this.poolOf.set(arch, p);
    }
    return p;
  }
}
