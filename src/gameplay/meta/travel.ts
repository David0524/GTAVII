/**
 * Fast travel the 1974 way (FEATURE_AUDIT): hail a cab and ride (watch or skip), or take the subway.
 *  - Cab: the 1973 meter, 60¢ for the first 1/5 mile and 10¢ each 1/5 mile after (the door decals in
 *    STYLE_GUIDE §6), plus a tip. Midtown speed about 14 km/h door to door, so a skip advances the clock.
 *  - Subway: a 35¢ token (1972–75 fare). Jumping the turnstile is a crime if a token clerk or a transit
 *    cop sees it. Underground the police lose you (Police `subway` decay ×3); coming up at another
 *    station breaks contact cleanly.
 */
export const FIFTH_MILE = 321.9, CAB_FLAG = 60, CAB_STEP = 10, CAB_KMH = 14, TOKEN = 35, SUBWAY_KMH = 28;
/** Fare in cents for a ride of `meters` (rounded up to the next fifth of a mile, like the meter). */
export function cabFare(meters: number) { const fifths = Math.max(1, Math.ceil(meters / FIFTH_MILE)); return CAB_FLAG + CAB_STEP * (fifths - 1); }
/** Customary tip: about 20%, rounded to the nickel, at least a dime. */
export function cabTip(fare: number) { return Math.max(10, Math.round((fare * 0.2) / 5) * 5); }
/** Game minutes for a ride (Manhattan grid distance, not as the crow flies). */
export function rideMinutes(ax: number, az: number, bx: number, bz: number, kmh = CAB_KMH) { const m = Math.abs(bx - ax) + Math.abs(bz - az); return (m / 1000 / kmh) * 60; }
