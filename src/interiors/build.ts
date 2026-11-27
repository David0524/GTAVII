/**
 * Interior build entry point (worker-safe): unit record -> generator -> bake -> BuiltInterior.
 */
import { Kit } from './kit/Kit';
import type { UnitRec } from './indexFormat';
import type { BuiltInterior, MeshArrays } from './spec';
import { bake } from './bake';
import { makeCtx, type BuildingInfo, type GenCtx } from './gen/common';
import { GENERATORS, genGenericShop } from './gen/registry';
import { dressCells } from './kit/wear';
import { KINDS } from './catalog';

export interface BuildRequest {
  unit: UnitRec;
  building: BuildingInfo;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  /** footprint outer ring, world x/z interleaved */
  ring: number[] | null;
  street: string;
}

export function buildInterior(req: BuildRequest): BuiltInterior {
  const t0 = performance.now();
  const u = req.unit;
  const k = new Kit(u.seed, u.id, req.quality);
  // footprint into unit-local coordinates
  let ring: Float64Array | null = null;
  if (req.ring) {
    ring = new Float64Array(req.ring.length);
    for (let i = 0; i < req.ring.length; i += 2) {
      const dx = req.ring[i] - u.ox, dz = req.ring[i + 1] - u.oz;
      ring[i] = dx * u.ux + dz * u.uz; ring[i + 1] = dx * u.nx + dz * u.nz;
    }
  }
  const ctx: GenCtx = makeCtx(k, u, req.building, req.quality, ring, req.street);
  (GENERATORS[u.kind] ?? genGenericShop)(ctx);
  if (u.kind !== 'hero') dressCells(k); // heroes are hand-dressed
  const cells = k.finishCells();
  const t1 = performance.now();
  // bounds
  const box: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const c of cells) for (let a = 0; a < 3; a++) { box[a] = Math.min(box[a], c.box[a]); box[a + 3] = Math.max(box[a + 3], c.box[a + 3]); }
  bake(cells, k.lights, k.portals, { quality: req.quality, occluders: k.occluders, bounds: box });
  // door leaves get a flat ambient light (they move, so they can't be baked in place)
  for (const d of k.doors) fillLight(d.mesh, 0.35);
  for (const m of k.movers) fillLight(m.mesh, 0.8);
  const t2 = performance.now();
  let verts = 0, tris = 0;
  for (const c of cells) for (const m of [c.opaque, c.glass]) if (m) { verts += m.position.length / 3; tris += m.index.length / 3; }
  let volume = 0; for (const c of cells) volume += (c.box[3] - c.box[0]) * (c.box[4] - c.box[1]) * (c.box[5] - c.box[2]);
  return {
    id: u.id, kind: u.kind, buildingId: req.building.id,
    frame: { ox: u.ox, oy: u.y, oz: u.oz, ux: u.ux, uz: u.uz, nx: u.nx, nz: u.nz },
    cells, portals: k.portals, colliders: k.colliders, doors: k.doors, slots: k.slots, markers: k.markers, lights: k.lights, movers: k.movers, art: k.art, traversal: k.traversal,
    volume: Math.round(volume), reverb: u.kind === 'hero' ? 'hall' : KINDS[u.kind].reverb, box,
    stats: { verts, tris, genMs: +(t1 - t0).toFixed(2), bakeMs: +(t2 - t1).toFixed(2), cells: cells.length },
  };
}
function fillLight(m: MeshArrays, v: number) { for (let i = 0; i < m.light.length; i += 4) { m.light[i] = v; m.light[i + 1] = v * 0.9; m.light[i + 2] = v * 0.75; m.light[i + 3] = 0.3; } }

/** Transferable buffers of a built interior (for postMessage). */
export function transferables(b: BuiltInterior): ArrayBuffer[] {
  const out: ArrayBuffer[] = [];
  const add = (m: MeshArrays | null) => { if (m) out.push(m.position.buffer as ArrayBuffer, m.normal.buffer as ArrayBuffer, m.color.buffer as ArrayBuffer, m.uv.buffer as ArrayBuffer, m.pat.buffer as ArrayBuffer, m.light.buffer as ArrayBuffer, m.index.buffer as ArrayBuffer); };
  for (const c of b.cells) { add(c.opaque); add(c.glass); }
  for (const d of b.doors) add(d.mesh);
  for (const m of b.movers) add(m.mesh);
  return out;
}
