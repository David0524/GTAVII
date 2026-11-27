import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readChunk } from '../src/shared/chunkFormat';
import { buildChunk, type MeshArrays } from '../src/world/meshBuilder';
import { decodeIndex, type WireIndex } from '../src/interiors/indexFormat';
import { setOpeningsIndex, edgeOpenings } from '../src/world/openings';

// Interiors hookup (docs/HANDOFF_WIRING.md): facades are cut where interiors' units open onto the street, the
// collider shares the render mesh (doors walkable), and every opening is filled by a plug quad.
const area = (m: MeshArrays, filter: (nx: number, ny: number) => boolean) => {
  let a = 0; const P = m.position, N = m.normal, I = m.index;
  for (let k = 0; k < I.length; k += 3) {
    const i0 = I[k] * 3, i1 = I[k + 1] * 3, i2 = I[k + 2] * 3;
    if (!filter(N[i0], N[i0 + 1])) continue;
    const ux = P[i1] - P[i0], uy = P[i1 + 1] - P[i0 + 1], uz = P[i1 + 2] - P[i0 + 2];
    const vx = P[i2] - P[i0], vy = P[i2 + 1] - P[i0 + 1], vz = P[i2 + 2] - P[i0 + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
};
const walls = (nx: number, ny: number) => Math.abs(ny) < 0.5;

test('facades are cut at interiors openings and plugs fill exactly the removed wall', () => {
  const idx = decodeIndex(JSON.parse(fs.readFileSync('public/data/interiors/index.json', 'utf8')) as WireIndex, () => undefined);
  setOpeningsIndex(idx.buildings);
  const world = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
  // the chunk with the most indexed units
  const count = new Map<string, number>();
  for (const b of idx.buildings) count.set(`${b.i}_${b.j}`, (count.get(`${b.i}_${b.j}`) ?? 0) + b.units.length);
  const key = [...count.entries()].sort((p, q) => q[1] - p[1])[0][0];
  const S = world.chunkSize as number;
  const data = readChunk(fs.readFileSync(`public/data/chunks/${key}.bin`).buffer as ArrayBuffer);
  const ox = (data.i + 0.5) * S, oz = (data.j + 0.5) * S;
  const plain = buildChunk(data, S, () => 0, ox);
  const cut = buildChunk(data, S, () => 0, ox, { oz, openings: edgeOpenings });
  const plugArea = area(cut.plugs, () => true);
  const removed = area(plain.buildings, walls) - area(cut.buildings, walls);
  assert.ok(cut.plugUnits.length > 10, `chunk ${key}: only ${cut.plugUnits.length} plug quads (building ids don't match the index?)`);
  // openings cut below ground (bottom = gMin - 0.6) are clipped, so removed <= plug area within 2 %
  assert.ok(Math.abs(removed - plugArea) / plugArea < 0.02, `removed ${removed.toFixed(1)} m² vs plugs ${plugArea.toFixed(1)} m²`);
  // the LOD1 shells stay closed
  assert.equal(area(cut.buildingsLod1, walls).toFixed(3), area(plain.buildingsLod1, walls).toFixed(3));
  // a door opening reaches the sidewalk: some plug quad starts at its unit's floor (y = u.y)
  assert.ok(cut.plugs.facade!.some((v, k) => k % 4 === 0 && v === 0), 'no door plugs');
});

test('edges without a unit frontage are not cut', () => {
  setOpeningsIndex([]);
  assert.deepEqual(edgeOpenings(1, 0, 0, 10, 0), []);
});
