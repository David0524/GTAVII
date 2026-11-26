/**
 * World clock (narrative N1). Phase 1-2: a frozen dusk on the opening night; Phase 6 drives time of day,
 * lighting and weather from it. Dates are the in-world calendar (1974-06-21 .. 1974-09-02, epilogue 10-01).
 */
export const worldClock = {
  date: '1974-06-21',
  minutes: 20 * 60 + 14, // 8:14 PM
  weather: 'clear' as 'clear' | 'overcast' | 'rain',
  scale: 0, // game minutes per real second; 0 = frozen until Phase 6
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function clockLabel(c = worldClock) {
  const d = new Date(`${c.date}T12:00:00Z`);
  const h = Math.floor(c.minutes / 60), m = c.minutes % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
