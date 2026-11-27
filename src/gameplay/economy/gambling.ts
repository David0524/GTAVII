import { Rng } from '../core/rng';
import { clamp, hash32 } from './types';

/**
 * Gambling maths. Every game is negative expected value for an average player; the house edge is
 * stated exactly next to each game and asserted by the tests. All bets are in integer cents and the
 * functions are pure given an `Rng`, so a seed replays exactly.
 */

// ---------------------------------------------------------------------------------------------
// The daily number: pick 000-999, drawn from the day's racetrack results.
// Pays 600:1 (profit of 600 x stake on a win, stake lost otherwise).
//   EV per $1 = (1/1000)(+600) + (999/1000)(-1) = -0.399   => house edge 39.9%
export const NUMBER_SPACE = 1000;
export const NUMBER_PAYS = 600;
/** Exact edge: 1 - E[total return] where a win returns stake x (600 + 1) with p = 1/1000. = 0.399 */
export const NUMBER_EDGE = 1 - (NUMBER_PAYS + 1) / NUMBER_SPACE;
/** The day's number: a stand-in for "the last three digits of the track handle" (day-deterministic). */
export function drawNumber(day: number, seed = 74): number { return new Rng(hash32(seed, day, 0x6e75)).int(0, NUMBER_SPACE - 1); }
/** Net cents for a number bet. */
export const numberNet = (stake: number, pick: number, drawn: number) => (pick === drawn ? stake * NUMBER_PAYS : -stake);

// ---------------------------------------------------------------------------------------------
// Off-track betting: pari-mutuel win pool with a 17% take.
// A winning $s on horse i pays s * (1 - take) * (pool_total) / (pool_i), the stake included.
// If the public's money matches the true win chances (q_i = p_i), EV per $1 = 0.83 => edge 17%.
// A bettor can only beat that where the crowd's shares q_i are far off the true chances p_i
// (longshots are over-bet by the crowd; see `publicShares`), and even then the take eats the edge.
export const OTB_TAKE = 0.17;
export interface Race { true: number[]; pool: number[] }
/** A field of `n` horses with true win chances from form. */
export function makeRace(rng: Rng, n = 6): Race {
  const strength = Array.from({ length: n }, () => Math.exp(rng.gauss() * 0.6));
  const sum = strength.reduce((a, b) => a + b, 0);
  const p = strength.map((s) => s / sum);
  return { true: p, pool: publicShares(p, rng).map((q) => q * 500000) };  // a $5,000 win pool spread by the crowd's shares
}
/** The crowd over-bets longshots (favourite-longshot bias) with noise: q ~ p^0.9. Sums to 1. */
export function publicShares(p: number[], rng: Rng): number[] {
  const w = p.map((x) => Math.pow(x, 0.9) * (1 + rng.gauss() * 0.08));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
/** Total return (stake included) per winning bet of `stake` on horse i, after the player's own money joins the pool. */
export function otbReturn(r: Race, i: number, stake: number, take = OTB_TAKE): number {
  const total = r.pool.reduce((a, b) => a + b, 0) + stake;
  return stake * (1 - take) * total / (r.pool[i] + stake);
}
/** Exact expected return per cent staked on horse i. */
export function otbExpected(r: Race, i: number, stake: number, take = OTB_TAKE): number {
  return r.true[i] * otbReturn(r, i, stake, take) / stake;
}
/** Run the race; returns the winner. */
export function runRace(r: Race, rng: Rng): number {
  let u = rng.next();
  for (let i = 0; i < r.true.length; i++) { u -= r.true[i]; if (u < 0) return i; }
  return r.true.length - 1;
}
/** Net cents for a win bet. */
export function otbNet(r: Race, i: number, stake: number, rng: Rng): number {
  const w = runRace(r, rng);
  return w === i ? Math.round(otbReturn(r, i, stake)) - stake : -stake;
}

// ---------------------------------------------------------------------------------------------
// Backroom cards (a stake-per-hand table game against the room, house takes a 5% rake off winnings).
// P(win a hand) = 0.5 + 0.0006 * (skill - 50), skill 0..100 (reading tells).
//   EV per $1 = p(1 - rake) - (1 - p) = 1.95p - 1
//   average player (skill 50): p = 0.5  -> EV = -2.5%   (slightly negative)
//   skill 100: p = 0.53 -> EV = +3.35%;  skill 0: p = 0.47 -> EV = -8.35%
// so the great reader grinds a little profit and the average player slowly bleeds.
export const CARD_RAKE = 0.05;
export const cardWinProb = (skill: number) => clamp(0.5 + 0.0006 * (skill - 50), 0.35, 0.65);
export const cardEv = (skill: number) => cardWinProb(skill) * (1 - CARD_RAKE) - (1 - cardWinProb(skill));
/** Play up to `hands` hands at `stake`, stopping when the cash can't cover another. Returns net cents. */
export function playCards(cash: number, stake: number, hands: number, skill: number, rng: Rng): { net: number; played: number } {
  let c = cash, played = 0;
  const p = cardWinProb(skill);
  for (let h = 0; h < hands && c >= stake; h++, played++) c += rng.chance(p) ? Math.round(stake * (1 - CARD_RAKE)) : -stake;
  return { net: c - cash, played };
}

// ---------------------------------------------------------------------------------------------
// Pool for money: even stakes, the winner takes the pot less a 3% rack fee.
// P(win) is Elo-like in (skill - rating): 1 / (1 + 10^((rating - skill)/30)).
//   EV per $1 = p * 0.94 - (1 - p) = 1.94p - 1   => at equal rating, EV = -3%; skill edge pays.
export const POOL_FEE = 0.03;
export const poolWinProb = (skill: number, rating: number) => 1 / (1 + Math.pow(10, (rating - skill) / 30));
export const poolEv = (skill: number, rating: number) => { const p = poolWinProb(skill, rating); return p * (2 * (1 - POOL_FEE) - 1) - (1 - p); };
export function playPool(stake: number, skill: number, rating: number, rng: Rng): number {
  return rng.chance(poolWinProb(skill, rating)) ? Math.round(stake * (1 - 2 * POOL_FEE)) : -stake;
}

// ---------------------------------------------------------------------------------------------
// Fight bets with odds. Fighter ratings give the true win chance p = 1 / (1 + 10^((rb - ra)/25)).
// The book quotes each side at implied probability q_i = 1.08 * p_i (an 8% overround), so a win on
// side i pays stake * (1/q_i - 1) profit. Betting blind, EV per $1 = p_i/q_i - 1 = 1/1.08 - 1 = -7.4%.
export const FIGHT_OVERROUND = 1.08;
export interface Bout { a: number; b: number }
export const fightProbA = (b: Bout) => 1 / (1 + Math.pow(10, (b.b - b.a) / 25));
/** Decimal odds offered on a side (1.0 = even money returns the stake only). */
export const fightOdds = (b: Bout, side: 'a' | 'b') => 1 / (FIGHT_OVERROUND * (side === 'a' ? fightProbA(b) : 1 - fightProbA(b)));
export function fightNet(bout: Bout, side: 'a' | 'b', stake: number, rng: Rng): number {
  const winsA = rng.chance(fightProbA(bout));
  return (winsA === (side === 'a')) ? Math.round(stake * (fightOdds(bout, side) - 1)) : -stake;
}
export const fightEv = (bout: Bout, side: 'a' | 'b') => { const p = side === 'a' ? fightProbA(bout) : 1 - fightProbA(bout); return p * (fightOdds(bout, side) - 1) - (1 - p); };
export function makeBout(rng: Rng): Bout { return { a: 60 + rng.int(0, 30), b: 60 + rng.int(0, 30) }; }

// ---------------------------------------------------------------------------------------------
/** A runner's book of pending daily-number bets, settled when the next day's number is drawn. */
export interface NumberBet { lead: string; pick: number; stake: number; day: number }
