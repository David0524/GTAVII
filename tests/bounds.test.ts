import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYABLE, PLAYABLE_CORE, PLAYABLE_ANNEX, edgeDistance, inwardDirection, inPlayable } from '../src/shared/bounds';

// brute-force reference: signed distance to the union of the two rectangles, sampled on a 1 m outline
function refDist(x: number, z: number) {
  const rects = [PLAYABLE_CORE, PLAYABLE_ANNEX];
  const inside = rects.some((r) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ);
  const onBoundary = (px: number, pz: number) => rects.some((r) => px >= r.minX && px <= r.maxX && pz >= r.minZ && pz <= r.maxZ)
    && !rects.some((r) => px > r.minX + 0.01 && px < r.maxX - 0.01 && pz > r.minZ + 0.01 && pz < r.maxZ - 0.01)
    && !(px === 213 && pz > PLAYABLE_CORE.minZ && pz < PLAYABLE_ANNEX.maxZ); // the seam (where core and annex meet) is not an edge
  let best = Infinity;
  for (const r of rects) for (const [ax, az, bx, bz] of [[r.minX, r.minZ, r.maxX, r.minZ], [r.maxX, r.minZ, r.maxX, r.maxZ], [r.maxX, r.maxZ, r.minX, r.maxZ], [r.minX, r.maxZ, r.minX, r.minZ]]) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let k = 0; k <= n; k++) { const px = ax + (bx - ax) * k / n, pz = az + (bz - az) * k / n; if (onBoundary(px, pz)) best = Math.min(best, Math.hypot(x - px, z - pz)); }
  }
  return inside ? best : -best;
}

test('union bounding box', () => {
  assert.deepEqual({ ...PLAYABLE }, { minX: -1292, maxX: 470, minZ: -1755, maxZ: 92 });
});

test('containment: core, annex, the corner the box adds but the union does not', () => {
  assert.ok(inPlayable(0, 0));
  assert.ok(inPlayable(330, -1630)); // Grand Central concourse
  assert.ok(!inPlayable(330, -1000)); // Murray Hill: inside the box, outside the union
  assert.ok(!inPlayable(100, -1720)); // north of the core, west of the annex
  assert.ok(inPlayable(213, -1600)); // on the seam
});

test('edgeDistance matches a brute-force union distance', () => {
  for (const [x, z] of [[0, 0], [200, -1600], [213, -1600], [230, -1600], [330, -1630], [460, -1700], [480, -1700], [300, -1400], [220, -1490], [205, -1690], [150, -1700], [-1300, -100], [100, 200], [330, -1000]]) {
    assert.ok(Math.abs(edgeDistance(x, z) - refDist(x, z)) < 0.6, `${x},${z}: ${edgeDistance(x, z)} vs ${refDist(x, z)}`);
  }
  // the seam is not an edge: well inside the terminal is far from any edge
  assert.ok(edgeDistance(214, -1600) > 70); // 74 m to the core's NE corner, not 1 m to the seam
});

test('inwardDirection points into the union', () => {
  for (const [x, z] of [[480, -1700], [330, -1000], [150, -1700], [-1350, 0], [0, 150], [460, -1600], [0, -1660], [250, -1520]]) {
    const [dx, dz] = inwardDirection(x, z);
    assert.ok(Math.abs(Math.hypot(dx, dz) - 1) < 1e-9);
    assert.ok(edgeDistance(x + dx * 5, z + dz * 5) > edgeDistance(x, z), `${x},${z} → ${dx},${dz}`);
  }
});
