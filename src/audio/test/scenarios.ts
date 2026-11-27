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
  /** Diagnostic only (mix work, stems tool); not part of the pass/fail suite or the loudness session. */
  extra?: boolean;
  power?: 'dim' | 'off';
  /** Street vendors placed relative to the start point (x, z offsets in m); events 'vendor:<id>:<sale|knockOver|move>'. */
  vendors?: { id: string; type: import('../world/vendors').VendorType; offset: [number, number] }[];
}

export const SCENARIOS: Scenario[] = [
  { id: 'herald_rush', title: 'Herald Square, Friday 5:40 p.m. rush hour', clock: { minutes: 17 * 60 + 40, date: '1974-06-21' }, weather: 'clear', traffic: 1, peds: 1,
    start: (m) => ({ x: m.x('6th Avenue') - 60, z: m.z(34) + 11.5, dx: 1, dz: 0 }), walk: 1.3 },
  { id: 'side_3am', title: 'West 29th St between 7th and 8th, Saturday 3 a.m.', clock: { minutes: 3 * 60, date: '1974-06-22' }, weather: 'clear', traffic: 0.14, peds: 0.04,
    start: (m) => ({ x: (m.x('7th Avenue') + m.x('8th Avenue')) / 2 - 40, z: m.z(29) + 8.5, dx: 1, dz: 0 }), walk: 1.1 },
  { id: 'eighth_rain', title: 'Eighth Ave at W 41st St, Friday 11:15 p.m., rain', clock: { minutes: 23 * 60 + 15, date: '1974-06-21' }, weather: 'rain', traffic: 0.6, peds: 0.4,
    start: (m) => ({ x: m.x('8th Avenue') + 12, z: m.z(41) + 30, dx: 0, dz: -1 }), walk: 1.2 },
  { id: 'bryant_noon', title: 'Bryant Park, Tuesday noon', clock: { minutes: 12 * 60 + 5, date: '1974-06-25' }, weather: 'clear', traffic: 0.85, peds: 0.9, extra: true,
    start: (m) => ({ x: (m.x('6th Avenue') + m.x('5th Avenue')) / 2 - 40, z: (m.z(40) + m.z(42)) / 2, dx: 1, dz: 0 }), walk: 1.1 },
  { id: 'garment_10am', title: 'W 37th St between 7th and 8th, Wednesday 10 a.m.', clock: { minutes: 10 * 60, date: '1974-06-26' }, weather: 'clear', traffic: 0.8, peds: 0.8, extra: true,
    start: (m) => ({ x: (m.x('7th Avenue') + m.x('8th Avenue')) / 2 - 50, z: m.z(37) + 8.5, dx: 1, dz: 0 }), walk: 1.2 },
  { id: 'brownout_night', title: 'W 31st St near 7th, Saturday 10:30 p.m., brownout', clock: { minutes: 22 * 60 + 30, date: '1974-06-22' }, weather: 'clear', traffic: 0.5, peds: 0.4, extra: true, power: 'off',
    start: (m) => ({ x: m.x('7th Avenue') - 60, z: m.z(31) + 8.5, dx: 1, dz: 0 }), walk: 1.1 },
  { id: 'vendor_corner', title: 'W 34th St at 7th Ave, Thursday 12:30 p.m., vendors', clock: { minutes: 12 * 60 + 30, date: '1974-06-27' }, weather: 'clear', traffic: 0.8, peds: 0.8, extra: true,
    start: (m) => ({ x: m.x('7th Avenue') - 45, z: m.z(34) + 9, dx: 1, dz: 0 }), walk: 1.0,
    vendors: [
      { id: 'dogs', type: 'hot_dog', offset: [22, 1.5] }, { id: 'nuts', type: 'nut_roaster', offset: [38, 2] }, { id: 'shine', type: 'shoeshine', offset: [12, 3] },
      { id: 'ice', type: 'italian_ice', offset: [55, 1.5] }, { id: 'news', type: 'newsstand', offset: [30, 3.5] }, { id: 'truck', type: 'ice_cream_truck', offset: [70, -9] },
    ],
    events: [{ t: 6, play: 'vendor:dogs:call' }, { t: 14, play: 'vendor:nuts:call' }, { t: 18, play: 'vendor:dogs:sale' }, { t: 22, play: 'vendor:dogs:call' }, { t: 23, play: 'vendor:shine:call' }, { t: 26, play: 'vendor:dogs:sale' }, { t: 34, play: 'vendor:nuts:move' }, { t: 41, play: 'vendor:dogs:knockOver', params: { impulse: 700 } }, { t: 49, play: 'vendor:dogs:righted' }, { t: 52, play: 'vendor:nuts:stop' },
      { t: 10, play: 'sim:litter', offset: [12, 1] }, { t: 29, play: 'sim:pedBumped', offset: [31, 1], params: { kind: 2, response: 2 } }, { t: 32, play: 'sim:pedGotUp', offset: [33, 1] },
      { t: 36, play: 'sim:pedBumped', offset: [37, 0.5], params: { kind: 1, response: 1, byPlayer: 1 } }, { t: 47, play: 'sim:monteScatter', offset: [50, 3] }, { t: 16, play: 'sim:pedGreets', offset: [18, 1], params: { context: 0 } }, { t: 44, play: 'sim:pedGreets', offset: [46, 1], params: { context: 1 } }] },
  { id: 'shootout_8th', title: 'W 39th St east of Eighth Ave, Friday 11:20 p.m., gunfire', clock: { minutes: 23 * 60 + 20, date: '1974-06-21' }, weather: 'clear', traffic: 0.5, peds: 0.3, extra: true,
    start: (m) => ({ x: m.x('8th Avenue') + 40, z: m.z(39) + 8, dx: 1, dz: 0 }), walk: 0.8,
    events: [
      { t: 5, play: 'gun:service', offset: [12, -6] }, { t: 9, play: 'gun:cheap', offset: [25, -3] }, { t: 14, play: 'gun:magnum', offset: [60, -4] },
      { t: 20, play: 'gun:shotgun', offset: [30, -5] }, { t: 20.7, play: 'gunfoley:pump', offset: [30, -5] },
      ...[0, 0.11, 0.22, 0.33, 0.44].map((d) => ({ t: 26 + d, play: 'gun:auto', offset: [40, -7] as [number, number] })),
      { t: 33, play: 'gun:service', offset: [200, 0] }, { t: 38, play: 'whiz', offset: [30, 0] }, { t: 38.15, play: 'hit:brick', offset: [-3, 6] },
      { t: 40, play: 'hit:metal', offset: [4, -6] }, { t: 41, play: 'hit:glass', offset: [-2, 7] }, { t: 44, play: 'gunfoley:dry', offset: [1, 0] }, { t: 45, play: 'gunfoley:reload', offset: [1, 0] },
      { t: 50, play: 'gun:magnum', offset: [450, 0] },
    ] },
  { id: 'heat_8th', title: 'Eighth Ave at W 33rd St, Saturday 9:40 p.m., police heat (dispatch)', clock: { minutes: 21 * 60 + 40, date: '1974-06-22' }, weather: 'clear', traffic: 0.6, peds: 0.4, extra: true,
    start: (m) => ({ x: m.x('8th Avenue') + 12, z: m.z(33) - 20, dx: 0, dz: 1 }), walk: 1.4,
    events: [
      { t: 2, play: 'gp:report', offset: [-30, 10] }, { t: 9, play: 'gp:dispatched' }, { t: 16, play: 'gp:pursuit', offset: [0, 20] }, { t: 26, play: 'gp:heat4', offset: [0, 30] }, { t: 30, play: 'gp:lost', offset: [0, 40] },
      { t: 38, play: 'gp:copKilled', offset: [5, 25] }, { t: 58, play: 'gp:cleared' },
    ] },
];
