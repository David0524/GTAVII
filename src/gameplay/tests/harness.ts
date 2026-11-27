import { Gameplay } from '../index';
import { StandInSim } from '../testing/StandInSim';
import { Rng } from '../core/rng';
import type { V3 } from '../core/vec';

/** Headless rig: Gameplay + stand-in sim + a movable player. */
export function rig(lead = 'char.teddy_arce', opts: { quality?: 'low' | 'high' } = {}) {
  const g = new Gameplay({ quality: opts.quality ?? 'high', content: { items: null, shops: null, weapons: null } });
  const sim = new StandInSim(new Rng(99));
  const pos: V3 = [0, 0, 0];
  const dir: V3 = [0, 0, -1];
  g.bindPlayer({ id: 'player', lead, position: () => pos, aim: () => ({ origin: [pos[0], pos[1] + 1.55, pos[2]], dir }) });
  g.bindSim(sim);
  const events: { t: number; type: string; e: any }[] = [];
  for (const k of ['wasted', 'arrested', 'crimeWitnessed', 'reportFiled', 'shot', 'hit', 'propBroken', 'witness', 'police', 'radio', 'bark', 'notice', 'melee'] as const) g.on(k, (e) => events.push({ t: g.now, type: k, e }));
  const step = (secs: number, dt = 1 / 30, each?: () => void) => { for (let t = 0; t < secs - 1e-9; t += dt) { sim.update(dt); g.update(dt); each?.(); } };
  const until = (pred: () => boolean, max = 600, dt = 1 / 30) => { for (let t = 0; t < max; t += dt) { sim.update(dt); g.update(dt); if (pred()) return t; } return -1; };
  const has = (type: string, kind?: string) => events.some((x) => x.type === type && (!kind || x.e.kind === kind));
  return { g, sim, pos, dir, events, step, until, has };
}
