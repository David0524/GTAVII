/**
 * Exact critically damped spring towards 0, stable at any dt (unlike explicit Euler, which diverges once
 * w*dt > 1). Returns [x, v] after dt. w: angular frequency (1/s); settle time is about 4/w.
 */
export function criticalSpring(x0: number, v0: number, w: number, dt: number): [number, number] {
  const e = Math.exp(-w * dt), c = v0 + w * x0;
  return [(x0 + c * dt) * e, (v0 - w * c * dt) * e];
}
