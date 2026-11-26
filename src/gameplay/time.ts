import { Emitter } from './core/events';

/**
 * Gameplay's side of the clock (TIME.md). The engine owns the clock and calendar; it calls
 * `setClock` every frame (or on change) and asks gameplay before and after a skip:
 *   canSleep / canWait  → "can't sleep now" rules (mission, active search, pursuit)
 *   sleep / wait        → world effects of the skipped hours, then `timeAdvanced` for the
 *                         economy (income, rent, tickets, restocks) and `autosave` after a sleep.
 * Rest quality: a heatwave night without an air conditioner restores less.
 */
export interface Clock { day: number; minutes: number; date?: string; tempF: number; heatwave: boolean }
export interface TimeEvents extends Record<string, unknown> {
  timeAdvanced: { hours: number; fromDay: number; fromMinutes: number; toDay: number; toMinutes: number; how: 'sleep' | 'wait' | 'custody' | 'hospital' | 'mission' | 'live' };
  autosave: { reason: 'sleep'; day: number };
  rested: { lead: string; quality: number };
}
export type CantSleep = 'mission' | 'police' | 'pursuit' | 'notHome' | null;

export class TimeKeeper extends Emitter<TimeEvents> {
  clock: Clock = { day: 0, minutes: 21 * 60, tempF: 84, heatwave: false };
  inMission = false;
  /** Live play: game minutes the engine's clock has moved that the world hasn't been told about yet. */
  private liveMinutes = 0;
  /** Batch size for live `timeAdvanced` (5 game minutes = 10 real seconds): tills, interest and restocks tick in play. */
  static LIVE_STEP = 5;
  /** One setClock moving more than this many game minutes is a set, not live play. */
  static LIVE_MAX_JUMP = 120;
  /**
   * The engine's clock feed. Forward movement in live play is reported as `timeAdvanced {how:'live'}` in
   * small batches, so business income, loans, the number and the calendar run while you play, not only on
   * sleep/wait. A backwards jump (a load, a debug set) moves the clock without effects.
   */
  setClock(c: Partial<Clock>) {
    const from = { ...this.clock }, before = from.day * 1440 + from.minutes;
    Object.assign(this.clock, c);
    if (c.minutes === undefined && c.day === undefined) return;
    // the engine may send only minutes: a small wrap past midnight is the next day
    if (c.day === undefined && c.minutes! < from.minutes && from.minutes - c.minutes! > 12 * 60) this.clock.day = from.day + 1;
    const moved = this.clock.day * 1440 + this.clock.minutes - before;
    // a load, a debug set or a jump the engine made itself is a SET, not play: no effects (skips go through sleep/wait)
    if (moved <= 0 || moved > TimeKeeper.LIVE_MAX_JUMP) { this.liveMinutes = 0; return; }
    this.liveMinutes += moved;
    if (this.liveMinutes < TimeKeeper.LIVE_STEP) return;
    const span = this.liveMinutes; this.liveMinutes = 0;
    const start = this.clock.day * 1440 + this.clock.minutes - span;
    this.emit('timeAdvanced', { hours: span / 60, fromDay: Math.floor(start / 1440), fromMinutes: start % 1440, toDay: this.clock.day, toMinutes: this.clock.minutes, how: 'live' });
  }

  /** Minutes to reach `hour` (0–23) from now, rolling to tomorrow if needed. */
  until(hour: number) { const now = this.clock.minutes, t = hour * 60; return t > now ? t - now : 24 * 60 - now + t; }

  /** Advance the clock by `hours` and tell the world. Returns the advanced minutes. */
  advance(hours: number, how: TimeEvents['timeAdvanced']['how']) {
    const from = { ...this.clock };
    let m = this.clock.minutes + Math.round(hours * 60);
    while (m >= 24 * 60) { m -= 24 * 60; this.clock.day++; }
    this.clock.minutes = m;
    this.emit('timeAdvanced', { hours, fromDay: from.day, fromMinutes: from.minutes, toDay: this.clock.day, toMinutes: m, how });
    return Math.round(hours * 60);
  }
}

/** Rest quality 0..1: a heatwave night without air conditioning (HOMES_AND_CARS upgrade) restores 60%. */
export function restQuality(heatwave: boolean, hasAC: boolean) { return heatwave && !hasAC ? 0.6 : 1; }
