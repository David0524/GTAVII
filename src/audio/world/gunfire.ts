/**
 * Gunfire (combat backlog): the shot, its travel time, the street canyon's echoes, the long tail and the HDR
 * window. The canyon echo is the signature: every shot is followed by discrete slapbacks from the real
 * facades around the shooter (image sources from the same building data the reverb uses), then flutter
 * between parallel walls, the long return from the buildings at the end of the block, and the FDN tail.
 *
 *  - Direct: `gun.<tier>` at the muzzle, delayed by distance / 343 m/s (a far shot is heard after its flash),
 *    air absorption and occlusion from the voice manager, category `gunfire`.
 *  - Echoes: first-order images across the left/right facades and the block-end walls, second order across
 *    the opposite facade, more orders where the canyon flutters. Each is a positional voice at its image
 *    position (so it comes from the wall's direction), delayed by its extra path, attenuated by the
 *    facade's coverage (`gL`/`gR`/`gF`/`gB` from CanyonAnalyzer) and by order. Up to 8 on High, 4 on Low.
 *  - HDR window: the ambience and radio buses dip 3-8 dB by how loud the shot is at the listener, hold
 *    0.25 s and recover over ~1 s. Shots stay loud without raising the integrated level; the TP limiter
 *    (torture-tested) catches the rest.
 *  - Also: near misses (`bulletPass`, a whiz when a trajectory passes within 4 m of the listener),
 *    impacts by material with ricochets, pump/dry-fire/reload foley.
 */
import type { Env } from '../env';
import type { Vec3 } from '../config';
import type { CanyonState } from '../acoustics/canyon';
import { setTimeoutAudio } from './ambience';

export type GunTier = 'cheap' | 'service' | 'magnum' | 'shotgun' | 'auto';
export type Material = 'brick' | 'metal' | 'wood' | 'glass' | 'dirt' | 'concrete' | 'car';
const C = 343;
const FAMILY: Record<GunTier, string> = { cheap: 'gun.cheap', service: 'gun.service', magnum: 'gun.magnum', shotgun: 'gun.shotgun', auto: 'gun.service' };
/** Relative source level by tier (dB, applied as gain): the pocket pistol is quieter, the shotgun loudest. */
const LEVEL_DB: Record<GunTier, number> = { cheap: -5, service: 0, magnum: 2, shotgun: 3, auto: -1 };

interface Plane { n: [number, number]; d: number }
interface Image { p: Vec3; g: number; order: number; first: Plane; last: Plane }
export interface ShotReport { tier: GunTier; distance: number; delay: number; echoes: { delay: number; gain: number; order: number }[]; hdrDb: number }

export class Gunfire {
  stats = { shots: 0, echoes: 0, blocked: 0, whiz: 0, impacts: 0, lastShot: null as ShotReport | null };
  private lastWhiz = -1; private lastShotT = -1;
  constructor(private env: Env, private hdr: (db: number) => void) {}

  /** Image sources for a shot at s in canyon c (2D in x/z; the height stays the muzzle's). */
  images(s: Vec3, c: CanyonState, maxN: number): Image[] {
    const nR: [number, number] = [-c.az, c.ax], nL: [number, number] = [c.az, -c.ax], ax: [number, number] = [c.ax, c.az];
    // Plane = {p : dot(p - s, n) = d}; mirror q across it.
    const mirror = (q: Vec3, n: [number, number], d: number): Vec3 => { const k = 2 * (d - ((q[0] - s[0]) * n[0] + (q[2] - s[2]) * n[1])); return [q[0] + k * n[0], q[1], q[2] + k * n[1]]; };
    const refl = (g: number) => Math.min(0.85, g * 1.15); // facade coverage -> reflection gain (brick/stone ~0.9 absorbs little)
    const L = { n: nL, d: c.dL, g: refl(c.gL) }, R = { n: nR, d: c.dR, g: refl(c.gR) };
    const F = { n: ax, d: c.dF }, B = { n: [-ax[0], -ax[1]] as [number, number], d: c.dB };
    const out: Image[] = [];
    // First order: both facades and the two block ends (the end walls are partial: cross-streets open them).
    for (const w of [L, R]) if (w.g > 0.05 && w.d < 150) out.push({ p: mirror(s, w.n, w.d), g: w.g, order: 1, first: w, last: w });
    if (c.gF > 0.03 && c.dF < 150) out.push({ p: mirror(s, F.n, F.d), g: refl(c.gF), order: 1, first: F, last: F });
    if (c.gB > 0.03 && c.dB < 150) out.push({ p: mirror(s, B.n, B.d), g: refl(c.gB), order: 1, first: B, last: B });
    // Higher orders between the parallel facades (the canyon's flutter): alternate L/R.
    const orders = c.flutter > 0.2 ? 4 : 2;
    for (const first of [L, R]) {
      let q = s, g = 1, w = first;
      for (let k = 1; k <= orders; k++) {
        if (w.g <= 0.05 || w.d >= 150) break;
        q = mirror(q, w.n, w.d); g *= w.g;
        if (k >= 2) out.push({ p: q, g, order: k, first, last: w });
        w = w === L ? R : L;
      }
    }
    return out.sort((a, b) => b.g - a.g).slice(0, maxN);
  }

  /**
   * Is this echo's path open? The first leg leaves the shooter toward its first wall; the last leg runs from the
   * last reflection point (where the listener->image line meets the last wall) to the listener. A building on
   * either leg (the shooter round a corner or indoors, the listener behind a corner) blocks the echo; the
   * image itself always sits "behind" its wall, so it can't be tested directly.
   */
  private open(s: Vec3, l: Vec3, im: Image): boolean {
    const g = this.env.geo, f = im.first;
    const fx = s[0] + (f.d - 0.6) * f.n[0], fz = s[2] + (f.d - 0.6) * f.n[1];
    if (g.crossings(s[0], s[2], fx, fz, 3.5, 1) > 0) return false;
    const w = im.last, ex = im.p[0] - l[0], ez = im.p[2] - l[2];
    // Plane of the last wall in world terms: dot(p - s, n) = d. Solve along l + u (image - l).
    const den = ex * w.n[0] + ez * w.n[1]; if (Math.abs(den) < 1e-6) return false;
    const u = (w.d - ((l[0] - s[0]) * w.n[0] + (l[2] - s[2]) * w.n[1])) / den; if (u <= 0 || u >= 1) return false;
    const px = l[0] + u * ex - 0.6 * w.n[0], pz = l[2] + u * ez - 0.6 * w.n[1];
    return g.crossings(px, pz, l[0], l[2], 3.5, 1) === 0;
  }

  /** A gunshot at `at` (muzzle). `indoors`: the shooter is inside (no street echoes; the interior reverb does it). */
  shot(at: Vec3, tier: GunTier = 'service', o: { indoors?: boolean; suppressEchoes?: boolean; /** Test only: replace the shot with another family (gun-check uses a click). */ family?: string } = {}): ShotReport {
    const env = this.env, l = env.vm.listener.position;
    const d = Math.hypot(at[0] - l[0], at[1] - l[1], at[2] - l[2]);
    const gain = Math.pow(10, LEVEL_DB[tier] / 20), fam = o.family ?? FAMILY[tier], delay = d / C;
    const rate = o.family ? 1 : tier === 'auto' ? env.rng.range(1.02, 1.08) : env.rng.range(0.97, 1.03);
    env.oneShot(fam, { category: 'gunfire', at, gain, rate, priority: 9, delay });
    const rep: ShotReport = { tier, distance: d, delay, echoes: [], hdrDb: 0 };
    if (!o.indoors && !o.suppressEchoes && !env.interior) {
      // Analyse the canyon at the shooter without disturbing the listener's reverb state.
      const keep = env.canyon.state, keepRays = env.canyon.lastRays.slice(); const c = env.canyon.analyze(at[0], at[2], 24); env.canyon.state = keep; env.canyon.lastRays = keepRays;
      let maxN = env.q.name === 'low' ? 4 : env.q.name === 'medium' ? 6 : 8;
      // Rapid fire: the canyon smears a burst together anyway; later rounds get the strongest few echoes only.
      const now = env.ctx.currentTime; if (now - this.lastShotT < 0.3) maxN = Math.min(maxN, 3); this.lastShotT = now;
      for (const im of this.images(at, c, maxN * 2)) {
        if (rep.echoes.length >= maxN) break;
        if (!this.open(at, l, im)) { this.stats.blocked++; continue; }
        const path = Math.hypot(im.p[0] - l[0], im.p[1] - l[1], im.p[2] - l[2]);
        const ed = path / C; if (ed - delay < 0.012) continue; // fused with the direct sound (precedence effect)
        // Echoes lose highs at each bounce (rate drop is a cheap tilt) on top of the voice manager's air absorption.
        env.oneShot(fam, { category: 'gunfire', at: im.p, gain: gain * im.g, rate: o.family ? 1 : rate * (1 - 0.03 * im.order), priority: 7, delay: ed, wet: 1.3, occlude: false });
        rep.echoes.push({ delay: +(ed - delay).toFixed(4), gain: +im.g.toFixed(3), order: im.order });
      }
      this.stats.echoes += rep.echoes.length;
    }
    // HDR window: deeper for close, loud shots. Timed to the shot's arrival.
    const loud = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(1, d / 8)) / Math.log10(60))) * gain; // 1 at <=8 m, 0 by ~480 m
    if (loud > 0.08) { rep.hdrDb = +(-3 - 5 * loud).toFixed(1); const db = rep.hdrDb; if (delay < 0.02) this.hdr(db); else setTimeoutAudio(env, delay, () => this.hdr(db)); }
    this.stats.shots++; this.stats.lastShot = rep;
    return rep;
  }

  /** A round's flight from `from` to `to`: if it passes within 4 m of the listener, a whiz at the closest point. */
  bulletPass(from: Vec3, to: Vec3) {
    const l = this.env.vm.listener.position;
    const v = [to[0] - from[0], to[1] - from[1], to[2] - from[2]], L2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2] || 1;
    const t = Math.max(0, Math.min(1, ((l[0] - from[0]) * v[0] + (l[1] - from[1]) * v[1] + (l[2] - from[2]) * v[2]) / L2));
    const p: Vec3 = [from[0] + v[0] * t, from[1] + v[1] * t, from[2] + v[2] * t];
    const d = Math.hypot(p[0] - l[0], p[1] - l[1], p[2] - l[2]);
    const now = this.env.ctx.currentTime;
    if (d > 4 || now - this.lastWhiz < 0.08) return; this.lastWhiz = now; this.stats.whiz++;
    // The round (~260 m/s for a .38) arrives before the report from the muzzle.
    this.env.oneShot('bullet.whiz', { category: 'impact', at: p, gain: 0.5 * (1 - d / 5), rate: this.env.rng.range(0.9, 1.1), priority: 8, delay: Math.sqrt(L2) * t / 260 });
  }

  /** A bullet hit at `at` by material; hard surfaces sometimes ricochet. */
  impact(at: Vec3, material: Material = 'brick') {
    const fam = material === 'glass' ? 'glass' : material === 'metal' || material === 'car' ? 'impact.metal' : material === 'wood' ? 'impact.wood' : material === 'dirt' ? 'impact.dirt' : 'impact.brick';
    this.stats.impacts++;
    this.env.oneShot(fam, { category: 'impact', at, gain: material === 'glass' ? 0.5 : 0.6, rate: this.env.rng.range(0.92, 1.08), priority: 6 });
    if ((material === 'brick' || material === 'concrete' || material === 'metal' || material === 'car') && this.env.rng.next() < 0.3)
      this.env.oneShot('bullet.ricochet', { category: 'impact', at, gain: 0.4, rate: this.env.rng.range(0.9, 1.1), priority: 6 });
  }

  /** Weapon handling foley at the shooter: 'pump' | 'dry' | 'reload'. */
  foley(kind: 'pump' | 'dry' | 'reload', at: Vec3) { this.env.oneShot(`gun.${kind}`, { category: 'footstep', at, gain: 0.6, priority: 7 }); }
}
