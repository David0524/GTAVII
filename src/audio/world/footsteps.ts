/**
 * Footsteps. Player and named characters: from the characters workstream's animation events
 * (`footstep(e)`; shape requested in ENGINE_REQUESTS). Ambient pedestrians: the nearest few walk
 * with procedurally timed steps from their sim speed (cadence 1.6 + 0.25*v Hz) until the
 * character renderer emits real events. Surface from the world: steel over subway gratings,
 * asphalt on the roadway, concrete on sidewalks, earth in parks; interiors by kind.
 */
import type { Env } from '../env';
import type { Vec3 } from '../config';
import type { Grating } from './subway';
import { Rng } from '../worklets/dsp';

export type Surface = 'concrete' | 'asphalt' | 'grating' | 'park' | 'wood' | 'tile';
interface PedLike { id: number; x: number; y: number; z: number; speed: number }

const INTERIOR_SURFACE: Record<string, Surface> = { diner: 'tile', sro: 'tile', bar: 'wood', precinct: 'tile', loft: 'wood', cinema: 'wood', shop: 'tile', subway: 'concrete', stairwell: 'concrete' };

export class Footsteps {
  private phase = new Map<number, number>();
  private gratingGrid = new Map<number, Grating[]>();
  private rng = new Rng(55);
  stats = { steps: 0, external: 0 };

  constructor(private env: Env, gratings: Grating[]) {
    for (const g of gratings) { const k = this.key(g.x, g.z); let a = this.gratingGrid.get(k); if (!a) this.gratingGrid.set(k, (a = [])); a.push(g); }
  }
  private key(x: number, z: number) { return Math.floor(x / 20) * 100003 + Math.floor(z / 20); }

  surfaceAt(x: number, z: number): Surface {
    if (this.env.interior) return INTERIOR_SURFACE[this.env.interior] ?? 'tile';
    const a = this.gratingGrid.get(this.key(x, z)); if (a) for (const g of a) if (Math.abs(g.x - x) < 1.2 && Math.abs(g.z - z) < 2.2) return 'grating';
    if (this.env.geo.inPark(x, z)) return 'park';
    const ns = this.env.geo.nearestStreet(x, z, 40);
    if (ns && ns.d < ns.street.w / 2) return 'asphalt';
    return 'concrete';
  }

  /** External footstep event (player/characters). Unknown fields are tolerated. */
  footstep(e: { position?: Vec3; x?: number; y?: number; z?: number; surface?: string; intensity?: number; run?: boolean; who?: string }) {
    const p: Vec3 = e.position ?? [e.x ?? 0, e.y ?? 0, e.z ?? 0];
    const surf = (e.surface as Surface) ?? this.surfaceAt(p[0], p[2]);
    this.stats.external++;
    this.step(p, surf, e.intensity ?? (e.run ? 1 : 0.7), e.who === 'player' ? 7 : 4);
  }

  private step(p: Vec3, surf: Surface, intensity: number, priority: number) {
    this.stats.steps++;
    this.env.oneShot(`step.${surf}`, { category: 'footstep', gain: 0.45 * intensity, at: [p[0], Math.max(0.05, p[1]), p[2]], priority, rate: this.rng.range(0.94, 1.06) });
  }

  /** Procedural steps for the nearest ambient pedestrians. */
  update(dt: number, peds: readonly unknown[] | null) {
    if (!peds || !this.env.live) return;
    const [lx, , lz] = this.env.vm.listener.position;
    const K = this.env.q.name === 'low' ? 2 : this.env.q.name === 'medium' ? 3 : 5;
    const near: { p: PedLike; d: number }[] = [];
    for (const q of peds as PedLike[]) { const d = Math.hypot(q.x - lx, q.z - lz); if (d < 16 && q.speed > 0.3) near.push({ p: q, d }); }
    near.sort((a, b) => a.d - b.d);
    for (const { p } of near.slice(0, K)) {
      const cad = 1.6 + p.speed * 0.25; let ph = (this.phase.get(p.id) ?? this.rng.next()) + cad * dt;
      if (ph >= 1) { ph -= 1; this.step([p.x, p.y, p.z], this.surfaceAt(p.x, p.z), Math.min(1, 0.4 + p.speed * 0.25), 3); }
      this.phase.set(p.id, ph);
    }
    if (this.phase.size > 200) this.phase.clear();
    let n = 0; for (const q of peds as PedLike[]) if (Math.abs(q.x - lx) < 25 && Math.abs(q.z - lz) < 25) n++;
    this.env.peds.near = Math.min(1, n / 18); this.env.peds.fromSim = true;
  }
}
