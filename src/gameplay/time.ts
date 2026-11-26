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
  timeAdvanced: { hours: number; fromDay: number; fromMinutes: number; toDay: number; toMinutes: number; how: 'sleep' | 'wait' | 'custody' | 'hospital' | 'mission' };
  autosave: { reason: 'sleep'; day: number };
  rested: { lead: string; quality: number };
}
export type CantSleep = 'mission' | 'police' | 'pursuit' | 'notHome' | null;

export class TimeKeeper extends Emitter<TimeEvents> {
  clock: Clock = { day: 0, minutes: 21 * 60, tempF: 84, heatwave: false };
  inMission = false;
  setClock(c: Partial<Clock>) { Object.assign(this.clock, c); }

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
