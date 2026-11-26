/**
 * Pursuit tactics: who does what when several units chase one suspect. Gameplay decides the roles, and
 * the sim drives them (integration/simAdapter.ts PoliceMirror). These are 1974 tactics: no spike strips,
 * no PIT. Radio cars tail, crowd the suspect at a light, and cut ahead to the next corner.
 *
 *  - tail     the car with eyes on the suspect keeps them in sight and calls the turns on the radio
 *  - box      the second car closes in to pin the suspect, but only when they are slowed (traffic, a light, a
 *             wreck). Boxing at speed is how patrolmen died, and the department knew it.
 *  - cutoff   the others race to the intersection ahead on the projected route (from the chokepoints
 *             the engine supplies). They don't stack: one car per corner.
 *  - foot     foot officers run the suspect down; if the suspect is on foot, cars cut off the
 *             block ahead instead of driving onto the sidewalk.
 * When nobody has eyes on the suspect, every car searches along the projected route from the last sighting.
 */
export type PursuitRole = 'tail' | 'box' | 'cutoff' | 'foot' | 'search';
export interface PursuitUnit { id: string; car: boolean; x: number; z: number; seesSuspect: boolean }
export interface SuspectMotion { x: number; z: number; vx: number; vz: number; inVehicle: boolean }
export interface RoleAssignment { id: string; role: PursuitRole; to?: [number, number] }
type Choke = (near: [number, number]) => { x: number; z: number; yaw: number }[];

/** Below this speed (m/s) a vehicle suspect counts as slowed, so boxing is allowed. */
export const BOX_SPEED = 4.5;
/** How far ahead (seconds of travel) cut-off cars aim, clamped to a city-block range. */
export const LEAD_SECONDS = 12;
export const LEAD_MIN = 60, LEAD_MAX = 260;

/** Point ahead on the suspect's track. */
export function projectAhead(s: SuspectMotion, seconds = LEAD_SECONDS): [number, number] {
  const sp = Math.hypot(s.vx, s.vz);
  if (sp < 0.5) return [s.x, s.z];
  const d = Math.min(LEAD_MAX, Math.max(LEAD_MIN, sp * seconds));
  return [s.x + (s.vx / sp) * d, s.z + (s.vz / sp) * d];
}

export function assignPursuit(units: readonly PursuitUnit[], s: SuspectMotion, chokepoints: Choke): RoleAssignment[] {
  const out: RoleAssignment[] = [];
  const speed = Math.hypot(s.vx, s.vz);
  const dist = (u: PursuitUnit) => Math.hypot(u.x - s.x, u.z - s.z);
  const contact = units.some((u) => u.seesSuspect);
  const ahead = projectAhead(s);
  for (const u of units) if (!u.car) out.push({ id: u.id, role: 'foot' });
  const cars = units.filter((u) => u.car).sort((a, b) => Number(b.seesSuspect) - Number(a.seesSuspect) || dist(a) - dist(b));
  if (!contact) {
    // lost them: spread along the projected route (nearest car to the near point, the next further out)
    const pts: [number, number][] = [[s.x, s.z], ahead, [2 * ahead[0] - s.x, 2 * ahead[1] - s.z]];
    cars.forEach((u, i) => out.push({ id: u.id, role: 'search', to: pts[Math.min(i, pts.length - 1)] }));
    return out;
  }
  // corners ahead: chokepoints in front of the suspect (positive dot with heading), nearest to the projected point first
  const hx = speed > 0.5 ? s.vx / speed : 0, hz = speed > 0.5 ? s.vz / speed : 0;
  const corners = chokepoints([s.x, s.z])
    .filter((c) => speed < 0.5 || (c.x - s.x) * hx + (c.z - s.z) * hz > -20) // ahead or to the side (parallel streets), never behind
    .sort((a, b) => Math.hypot(a.x - ahead[0], a.z - ahead[1]) - Math.hypot(b.x - ahead[0], b.z - ahead[1]));
  let i = 0;
  if (s.inVehicle) {
    if (cars[i]) out.push({ id: cars[i++].id, role: 'tail' });
    if (cars[i]) out.push({ id: cars[i].id, role: speed < BOX_SPEED ? 'box' : 'tail' }), i++;
  }
  // a suspect on foot gets no tail car (the foot cops have them); every car cuts off a corner, one per corner
  let c = 0;
  for (; i < cars.length; i++) {
    const corner = corners[c++];
    out.push(corner ? { id: cars[i].id, role: 'cutoff', to: [corner.x, corner.z] } : { id: cars[i].id, role: 'tail' });
  }
  return out;
}
