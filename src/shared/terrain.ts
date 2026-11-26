/**
 * Terrain height API: engine-owned shared contract (ENGINE_RESPONSES E1).
 * All streams read ground height ONLY through heightAt(), so turning real relief on is a data/flag
 * change, not a code change. While TERRAIN_ENABLED is false the world is flat (y = 0 road surface).
 * Sidewalks/park surfaces sit CURB_HEIGHT above the road surface at the curb.
 */
export const TERRAIN_ENABLED = true; // real relief (user confirmed "Real hills"); false = flat city
export const CURB_HEIGHT = 0.15;

let grid: { cell: number; nx: number; nz: number; minX: number; minZ: number; h: Int16Array } | null = null;

/** url defaults to `${BASE_URL}data/terrain.bin`; workers pass an absolute URL. */
export async function loadTerrain(url?: string): Promise<void> {
  if (!TERRAIN_ENABLED || grid) return;
  const r = await fetch(url ?? `${import.meta.env?.BASE_URL ?? '/'}data/terrain.bin`);
  if (!r.ok) return;
  grid = decodeTerrain(await r.arrayBuffer());
}

export function decodeTerrain(buf: ArrayBuffer) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x48343754) throw new Error('bad terrain magic');
  const cell = dv.getUint16(6, true) / 100, nx = dv.getUint16(8, true), nz = dv.getUint16(10, true);
  return { cell, nx, nz, minX: dv.getFloat32(12, true), minZ: dv.getFloat32(16, true), h: new Int16Array(buf, 28, nx * nz) };
}

export function terrainLoaded() { return grid !== null; }

/** Road-surface height (m) at world x,z; bilinear; 0 when terrain is disabled or not loaded. */
export function heightAt(x: number, z: number): number {
  const g = grid;
  if (!g) return 0;
  const fx = Math.min(Math.max((x - g.minX) / g.cell, 0), g.nx - 1.001), fz = Math.min(Math.max((z - g.minZ) / g.cell, 0), g.nz - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const k = j * g.nx + i, h = g.h;
  return ((h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + g.nx] * (1 - tx) + h[k + g.nx + 1] * tx) * tz) / 100;
}
