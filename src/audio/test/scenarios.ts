/**
 * Listener scenarios shared by the offline render test and the ?audio=1 test scene. Positions are
 * resolved from real street centrelines (CityMap), not typed coordinates.
 */
import type { CityMap } from '../world/cityMap';
import type { Weather } from '../env';

export interface Scenario {
  id: string; title: string;
  clock: { minutes: number; date: string }; weather: Weather;
  traffic: number; peds: number;
  /** Start point and walking direction (unit x,z) at `walk` m/s. */
  start: (m: CityMap) => { x: number; z: number; dx: number; dz: number };
  walk: number;
  events?: { t: number; play: string; params?: Record<string, number>; offset?: [number, number] }[];
}

export const SCENARIOS: Scenario[] = [
  { id: 'herald_rush', title: 'Herald Square, Friday 5:40 p.m. rush hour', clock: { minutes: 17 * 60 + 40, date: '1974-06-21' }, weather: 'clear', traffic: 1, peds: 1,
    start: (m) => ({ x: m.x('6th Avenue') - 60, z: m.z(34) + 11.5, dx: 1, dz: 0 }), walk: 1.3 },
  { id: 'side_3am', title: 'West 29th St between 7th and 8th, Saturday 3 a.m.', clock: { minutes: 3 * 60, date: '1974-06-22' }, weather: 'clear', traffic: 0.14, peds: 0.04,
    start: (m) => ({ x: (m.x('7th Avenue') + m.x('8th Avenue')) / 2 - 40, z: m.z(29) + 8.5, dx: 1, dz: 0 }), walk: 1.1 },
  { id: 'eighth_rain', title: 'Eighth Ave at W 41st St, Friday 11:15 p.m., rain', clock: { minutes: 23 * 60 + 15, date: '1974-06-21' }, weather: 'rain', traffic: 0.6, peds: 0.4,
    start: (m) => ({ x: m.x('8th Avenue') + 12, z: m.z(41) + 30, dx: 0, dz: -1 }), walk: 1.2 },
];
