/**
 * Facade grid shared by the facade shader (window cells), the props (AC units, fire escapes) and, later,
 * doors and sign slots, so everything seats on the same window grid (user report 2026-11-26: AC units
 * floated off the windows because props counted bays from each wall's start while the shader counts them
 * along the whole outline).
 *   u = distance along the outer ring, continuous from vertex 0 (the shader's uv.x)
 *   v = height above the building's mean ground (the shader's uv.y)
 */
export function floorHeight(height: number, minHeight: number, floors: number): number {
  const h = height - minHeight;
  return floors > 0 ? Math.min(5.6, Math.max(2.9, h / floors)) : 3.5;
}
/** Window bay width by style (must match FacadeMaterial's `bay`). */
export function bayWidth(style: number): number {
  return style === 9 ? 1.55 : style === 10 ? 1.8 : style === 11 ? 2.4 : style === 1 ? 2.6 : style === 2 || style === 3 ? 3.3 : style === 6 ? 1.9 : 2.45;
}
/** Window sill as a fraction of the floor (must match FacadeMaterial's `sill`). */
export function sillFrac(style: number): number { return style === 2 || style === 3 ? 0.2 : 0.3; }
