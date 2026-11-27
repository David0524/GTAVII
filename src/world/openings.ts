/**
 * Facade openings for the chunk builder (interiors request 1; docs/HANDOFF_WIRING.md, "Interiors hookup design").
 * Loads interiors' unit index once (in the chunk worker) and answers, per building edge, the wall spans to
 * remove: doors, recessed alcoves, display windows and transoms. Interiors' `facadeOpenings` is the single
 * source of truth, so the hole in the shell always matches the reveals inside.
 */
import { decodeIndex, type BuildingIdx, type WireIndex } from '../interiors/indexFormat';
import { facadeOpenings } from '../interiors/facade';

export interface Span { s0: number; s1: number; y0: number; y1: number; kind: 'door' | 'alcove' | 'window' | 'transom'; unit: string }
export type OpeningsFn = (buildingId: number, x0: number, z0: number, x1: number, z1: number) => Span[];

let byId: Map<number, BuildingIdx> | null = null;
let loading: Promise<void> | null = null;

export function loadOpenings(url: string): Promise<void> {
  return (loading ??= fetch(url).then((r) => (r.ok ? r.json() : null)).then((w: WireIndex | null) => {
    byId = new Map();
    if (!w) return;
    for (const b of decodeIndex(w, () => undefined).buildings) byId.set(b.id, b);
  }).catch(() => { byId = new Map(); }));
}

/** Test hook: install an index directly. */
export function setOpeningsIndex(buildings: BuildingIdx[]) { byId = new Map(buildings.map((b) => [b.id, b])); }

/** Spans along the edge (x0,z0)->(x1,z1), world coordinates; s in metres from (x0,z0), y absolute. */
export const edgeOpenings: OpeningsFn = (id, x0, z0, x1, z1) => {
  const b = byId?.get(id); if (!b || !b.units.length) return [];
  const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.5) return [];
  const out: Span[] = [];
  for (const u of b.units) {
    const ax = u.ox - x0, az = u.oz - z0;
    const along = (ax * dx + az * dz) / L, off = Math.abs(ax * dz - az * dx) / L;
    const cos = (u.ux * dx + u.uz * dz) / L;
    if (off > 0.08 || Math.abs(cos) < 0.999) continue; // the unit's frontage is not on this edge
    const dir = Math.sign(cos);
    for (const q of facadeOpenings(u, b.year, b.fh)) {
      const sa = along + dir * q.s0, sb = along + dir * q.s1;
      const s0 = Math.max(0.05, Math.min(sa, sb)), s1 = Math.min(L - 0.05, Math.max(sa, sb));
      if (s1 - s0 > 0.2) out.push({ s0, s1, y0: u.y + q.y0, y1: u.y + q.y1, kind: q.kind, unit: u.id });
    }
  }
  return out;
};
