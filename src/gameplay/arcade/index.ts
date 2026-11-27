/**
 * The Deuce arcade's machines: coins, free games and each cabinet's high-score card.
 * 1974 prices: pinball 25¢ a game, or 2 for 25¢ on the older tables; the gallery 10¢. A replay on the
 * pinball is a credit left on that machine. High scores are kept per machine (top five, with three
 * initials) and saved with gameplay's section.
 */
import { Emitter } from '../core/events';
import { Rng } from '../core/rng';
import { Pinball } from './pinball';
import { Gallery } from './gallery';

export type MachineKind = 'pinball' | 'gallery';
export interface MachineDef { id: string; name: string; kind: MachineKind; price: number; playsPerCoin: number }
export const MACHINES: MachineDef[] = [
  { id: 'arcade.night_owl', name: 'Night Owl', kind: 'pinball', price: 25, playsPerCoin: 1 },
  { id: 'arcade.dead_eye', name: 'Dead-Eye Gallery', kind: 'gallery', price: 10, playsPerCoin: 1 },
];
export interface HighScore { initials: string; score: number; day: number }
export interface ArcadeEvents extends Record<string, unknown> {
  coin: { machine: string; lead: string; cents: number };
  highScore: { machine: string; lead: string; score: number; rank: number };
  freeGame: { machine: string };
}
export type Game = Pinball | Gallery;

export class Arcade extends Emitter<ArcadeEvents> {
  readonly defs = new Map(MACHINES.map((m) => [m.id, m]));
  /** credits on each machine (replays and the second play of a 2-for-25¢ coin) */
  credits = new Map<string, number>();
  scores = new Map<string, HighScore[]>();
  private seq = 0;
  constructor(private spend: (lead: string, cents: number) => boolean, private day: () => number = () => 0, private seed = 74) {
    super();
    // the cards come with the operator's own scores on them
    for (const m of MACHINES) this.scores.set(m.id, m.kind === 'pinball'
      ? [{ initials: 'SAL', score: 88000, day: -1 }, { initials: 'RJK', score: 61500, day: -1 }, { initials: 'DEE', score: 42000, day: -1 }, { initials: 'MOE', score: 23300, day: -1 }, { initials: 'LOU', score: 9100, day: -1 }]
      : [{ initials: 'ACE', score: 4800, day: -1 }, { initials: 'TNT', score: 3900, day: -1 }, { initials: 'KID', score: 3100, day: -1 }, { initials: 'BEV', score: 2200, day: -1 }, { initials: 'PAT', score: 1400, day: -1 }]);
  }
  /** Start a game: uses a credit on the machine if there is one, else drops a coin. */
  play(lead: string, machine: string): Game | null {
    const m = this.defs.get(machine); if (!m) return null;
    const c = this.credits.get(machine) ?? 0;
    if (c > 0) this.credits.set(machine, c - 1);
    else {
      if (!this.spend(lead, m.price)) return null;
      this.emit('coin', { machine, lead, cents: m.price });
      if (m.playsPerCoin > 1) this.credits.set(machine, (this.credits.get(machine) ?? 0) + m.playsPerCoin - 1);
    }
    const rng = new Rng(this.seed * 1000 + this.seq++);
    return m.kind === 'pinball' ? new Pinball(rng) : new Gallery(rng);
  }
  /** Call when a game ends: banks replays as credits and enters a high score. Returns the rank (1..5) or 0. */
  finish(lead: string, machine: string, game: Game, initials = '???'): number {
    if (game instanceof Pinball && game.credits > 0) { this.credits.set(machine, (this.credits.get(machine) ?? 0) + game.credits); this.emit('freeGame', { machine }); }
    const card = this.scores.get(machine)!;
    const rank = card.filter((s) => s.score >= game.score).length + 1;
    if (rank > 5) return 0;
    card.splice(rank - 1, 0, { initials: initials.toUpperCase().slice(0, 3).padEnd(3, ' '), score: game.score, day: this.day() });
    card.length = 5;
    this.emit('highScore', { machine, lead, score: game.score, rank });
    return rank;
  }
  serialize() { return { credits: Object.fromEntries(this.credits), scores: Object.fromEntries(this.scores) }; }
  restore(s: ReturnType<Arcade['serialize']>) {
    this.credits = new Map(Object.entries(s.credits ?? {}));
    for (const [k, v] of Object.entries(s.scores ?? {})) if (this.defs.has(k)) this.scores.set(k, v);
  }
}
