/**
 * World clock and calendar (narrative N1/N10, TIME.md). One game day ≈ 48 real minutes by default
 * (settings.dayLengthMinutes, UI-owned key). Pauses whenever the caller doesn't tick it (menus, cutscenes).
 * Dates run 1974-06-21 .. 1974-09-02, epilogue 1974-10-01. Free roam never pushes the date past
 * `nextPinnedDate` (the next dated story mission) until that mission starts (N10 date hold).
 *
 * Period detail: 1974 ran on year-round Daylight Saving Time (Emergency Daylight Saving Time Energy
 * Conservation Act, from 1974-01-06), so New York clocks were UTC-4 all summer.
 */
export const worldClock = {
  date: '1974-06-21',
  minutes: 20 * 60 + 14, // 8:14 PM EDT
  weather: 'clear' as 'clear' | 'overcast' | 'rain',
  /** Game minutes per real second. 1440 / (48 * 60) = 0.5 by default; 0 freezes the clock. */
  scale: 1440 / (48 * 60),
  /** Story date hold (N10): the day may roll over but the date never passes this until the mission starts. */
  nextPinnedDate: null as string | null,
};
export const UTC_OFFSET_HOURS_1974 = -4; // EDT, year-round in 1974

type ClockEvent = 'minute' | 'hour' | 'day' | 'dawn' | 'dusk';
const listeners = new Map<ClockEvent, Set<(c: typeof worldClock) => void>>();
export function onClock(ev: ClockEvent, cb: (c: typeof worldClock) => void) {
  (listeners.get(ev) ?? listeners.set(ev, new Set()).get(ev)!).add(cb);
  return () => listeners.get(ev)!.delete(cb);
}
const emit = (ev: ClockEvent) => listeners.get(ev)?.forEach((cb) => cb(worldClock));

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sub-minute accumulator: worldClock.minutes stays an integer (UI formats it directly). */
let frac = 0;
/** Fractional minutes (for smooth sun motion). */
export function exactMinutes() { return worldClock.minutes + frac; }

/** Advance game time by `gameMinutes` (also used by sleep / wait / time-lapse). */
export function advance(gameMinutes: number) {
  const before = worldClock.minutes;
  frac += gameMinutes;
  const whole = Math.floor(frac); frac -= whole;
  let m = before + whole;
  while (m >= 1440) {
    m -= 1440;
    const next = addDays(worldClock.date, 1);
    if (!worldClock.nextPinnedDate || next <= worldClock.nextPinnedDate) { worldClock.date = next; emit('day'); }
  }
  worldClock.minutes = m;
  if (Math.floor(m) !== Math.floor(before)) emit('minute');
  if (Math.floor(m / 60) !== Math.floor(before / 60)) emit('hour');
}

/** Real-time tick. Call only while gameplay runs (not in menus/cutscenes). */
export function tickClock(realSeconds: number) { if (worldClock.scale > 0) advance(realSeconds * worldClock.scale); }

/** Minutes until a given HH:MM (wraps to tomorrow). */
export function minutesUntil(hhmm: string) {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = h * 60 + mm; let d = t - worldClock.minutes; if (d < 0) d += 1440; return d;
}

export function setTime(hhmm: string) { const [h, m] = hhmm.split(':').map(Number); worldClock.minutes = h * 60 + (m || 0); frac = 0; emit('hour'); }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clockLabel(c = worldClock) {
  const d = new Date(`${c.date}T12:00:00Z`);
  const h = Math.floor(c.minutes / 60), m = Math.floor(c.minutes % 60);
  const h12 = ((h + 11) % 12) + 1;
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------------------------------------------------------------- solar geometry (NOAA approximation)
const RAD = Math.PI / 180;
export const NYC = { lat: 40.7484, lon: -73.9857 };

/** Sun azimuth (deg clockwise from true north) and elevation (deg) for a local 1974 clock time. */
export function sunPosition(date: string, localMinutes: number, lat = NYC.lat, lon = NYC.lon) {
  const utcMin = localMinutes - UTC_OFFSET_HOURS_1974 * 60;
  const d = new Date(`${date}T00:00:00Z`); d.setUTCMinutes(utcMin);
  const jd = d.getTime() / 86400000 + 2440587.5, n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lst = (gmst * 15 + lon) * RAD;
  const ha = lst - ra, phi = lat * RAD;
  const el = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha));
  return { azimuth: ((az / RAD) + 360) % 360, elevation: el / RAD };
}
