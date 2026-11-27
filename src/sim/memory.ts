/**
 * NPC memory of the player and greetings (REFERENCE_GAMES: the RDR2 level of NPC memory and greetings).
 *
 *  - Block memory: every block (sidewalk-side road id, `Simulation.blockAt`) keeps a decaying reputation of the
 *    player from what happened there: helped/tipped raise it; bumped, knocked down, reckless driving, theft,
 *    robbery, assault, gunfire and killings lower it (half-life ~15 sim minutes).
 *  - Personal memory: people who saw it (within the event's witness radius) remember what the player did,
 *    for about ten minutes.
 *  - Greetings: when the player passes close in front of someone, now and then (most New Yorkers say nothing)
 *    they react from what they know: recall a favour, antagonise (steady nerves) or flinch and keep away
 *    (shaky nerves), complain on a block with a bad reputation, or greet in passing on a friendly one.
 *    Event `pedGreets {id, pool, context, mood, recall, x, z}`: `pool` is the archetype's bark set
 *    (narrative's barks.*), `context` one of greet | greet_known | antagonize | fear | complain |
 *    player_running.
 *  - Sources: the sim records player bumps, gunfire, kills and robbed vendors itself; gameplay reports the rest
 *    with `Simulation.remember(kind, x, z, opts)`.
 */
import type { SimCore, Ped } from './state';

export type MemKind = 'helped' | 'tipped' | 'bumped' | 'knockdown' | 'reckless' | 'theft' | 'robbed' | 'assault' | 'gunfire' | 'killed';
const WEIGHT: Record<MemKind, number> = { helped: 3, tipped: 1.5, bumped: -0.4, knockdown: -1.2, reckless: -1, theft: -2, robbed: -4, assault: -4, gunfire: -3, killed: -6 };
const WITNESS_R: Record<MemKind, number> = { helped: 12, tipped: 8, bumped: 8, knockdown: 15, reckless: 20, theft: 20, robbed: 20, assault: 25, gunfire: 70, killed: 40 };
const HALF_LIFE = 900; // s
const PERSONAL = 600; // s

interface BlockMem { score: number; t: number; last: MemKind; lastT: number }

export class Memory {
  private blocks = new Map<number, BlockMem>();
  private nextGreet = 0;
  greetings = 0;

  constructor(private S: SimCore, private blockAt: (x: number, z: number) => number) {}

  remember(kind: MemKind, x: number, z: number, opts: { witnessR?: number; pedId?: number } = {}) {
    const S = this.S, b = this.blockAt(x, z);
    if (b >= 0) {
      const m = this.blocks.get(b) ?? { score: 0, t: S.t, last: kind, lastT: S.t };
      m.score = this.decayed(m) + WEIGHT[kind]; m.t = S.t; m.last = kind; m.lastT = S.t;
      this.blocks.set(b, m);
    }
    const r = opts.witnessR ?? WITNESS_R[kind];
    S.pGrid.query(x, z, r, (i) => {
      const p = S.peds[i];
      if (!p || !p.alive || p.cop2 || Math.hypot(p.x - x, p.z - z) > r) return;
      // the worst thing they saw sticks (a favour doesn't erase a shooting)
      if (!p.memKind || S.t - (p.memT ?? -1e9) > PERSONAL || WEIGHT[kind] < WEIGHT[p.memKind as MemKind]) { p.memKind = kind; p.memT = S.t; }
    });
    if (opts.pedId !== undefined) { const p = S.pedById.get(opts.pedId); if (p) { p.memKind = kind; p.memT = S.t; } }
  }

  private decayed(m: BlockMem) { return m.score * Math.pow(0.5, (this.S.t - m.t) / HALF_LIFE); }

  /** The player's standing on the block at (x,z): score (negative = bad) and the last thing remembered there. */
  reputation(x: number, z: number) {
    const b = this.blockAt(x, z), m = b >= 0 ? this.blocks.get(b) : undefined;
    if (!m) return { score: 0, last: null as MemKind | null, ago: Infinity };
    return { score: +this.decayed(m).toFixed(2), last: m.last, ago: this.S.t - m.lastT };
  }

  /** People who saw what the player did keep away from them (walk avoidance uses this). */
  fearful(p: Ped): boolean {
    if (!p.memKind || this.S.t - (p.memT ?? -1e9) > PERSONAL) return false;
    return WEIGHT[p.memKind as MemKind] <= -3 && p.nerve < 0.55;
  }

  step(dt: number) {
    const S = this.S;
    if (S.t < this.nextGreet) return;
    this.nextGreet = S.t + 0.5;
    const pl = S.actors.find((a) => a.kind === 'player'); if (!pl) return;
    const sp = Math.hypot(pl.vx, pl.vz);
    S.pGrid.query(pl.x, pl.z, 4, (i) => {
      const p = S.peds[i];
      if (!p || !p.alive || p.cop2 || (p.greetCd ?? 0) > S.t || !['walk', 'loiter', 'vendor', 'waitCross', 'hail', 'waitBus', 'queue'].includes(p.state)) return;
      const dx = pl.x - p.x, dz = pl.z - p.z, d = Math.hypot(dx, dz); if (d > 3.5 || d < 0.3) return;
      p.greetCd = S.t + 45;
      const personal = p.memKind && S.t - (p.memT ?? -1e9) < PERSONAL ? (p.memKind as MemKind) : null;
      const rep = this.reputation(p.x, p.z).score;
      let context = '', mood = '';
      if (personal && WEIGHT[personal] > 0) { context = 'greet_known'; mood = 'grateful'; }
      else if (personal && WEIGHT[personal] < 0) {
        if (p.nerve >= 0.55 || p.arch.aggression > 0.6) { context = 'antagonize'; mood = 'angry'; }
        else { context = 'fear'; mood = 'scared'; }
      } else if (rep <= -3) { context = S.rng.chance(0.5) ? 'complain' : 'fear'; mood = context === 'fear' ? 'wary' : 'sour'; }
      else if (sp > 4 && S.rng.chance(0.25)) { context = 'player_running'; mood = 'annoyed'; }
      else if (rep >= 2.5 && S.rng.chance(0.5)) { context = 'greet'; mood = 'friendly'; }
      else if (S.rng.chance(0.08)) { context = 'greet'; mood = S.minute < 11 * 60 ? 'brisk' : 'neutral'; } // most say nothing
      if (!context) return;
      this.greetings++;
      if (context === 'fear' && p.state === 'walk') p.v *= 0.4; // a hesitation as the player passes
      if (context === 'antagonize' || context === 'greet_known' || context === 'greet') p.yaw = Math.atan2(dx, dz) + Math.PI; // a look at the player
      S.emit('pedGreets', { id: p.id, pool: p.arch.def.barks ?? `barks.${p.arch.def.id.replace(/^npc\./, '')}`, context, mood, recall: personal, archetype: p.arch.def.id, x: p.x, z: p.z });
    });
    void dt;
  }
}
