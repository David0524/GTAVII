/**
 * Every ground-level road has a sidewalk on both sides (user report 2026-11-27: "Park Ave has no sidewalks
 * and weird light post placement"; cause: divided avenue carriageways buffered at full avenue width, and the
 * viaduct paved at ground level). Samples a point 1.5 m beyond each kerb every 10 m along both sides of every
 * named, ground-level street inside the region (15 m clear of junctions and ends) and checks the ground
 * polygon there is not roadway. Elevated / tunnel ways (streets.json `g`) are exempt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { readChunk, GroundKind } from '../src/shared/chunkFormat';

export function roadShareBesideKerbs(dataDir: string, nameFilter?: RegExp) {
  const world = JSON.parse(fs.readFileSync(path.join(dataDir, 'world.json'), 'utf8'));
  const S = world.chunkSize as number;
  const streets = JSON.parse(fs.readFileSync(path.join(dataDir, 'streets.json'), 'utf8')) as { n?: string; w: number; g?: number; p: number[] }[];
  const chunks = new Map<string, ReturnType<typeof readChunk>>();
  const chunkAt = (x: number, z: number) => {
    const i = Math.floor(x / S), j = Math.floor(z / S), key = `${i}_${j}`;
    if (!chunks.has(key)) { const f = path.join(dataDir, 'chunks', `${key}.bin`); chunks.set(key, fs.existsSync(f) ? readChunk(new Uint8Array(fs.readFileSync(f)).buffer) : (null as never)); }
    return { c: chunks.get(key), ox: (i + 0.5) * S, oz: (j + 0.5) * S };
  };
  const inRing = (x: number, z: number, r: Float32Array) => { let ins = false; for (let a = 0, b = r.length / 2 - 1; a < r.length / 2; b = a++) { const xa = r[2 * a], za = r[2 * a + 1], xb = r[2 * b], zb = r[2 * b + 1]; if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) ins = !ins; } return ins; };
  const kindAt = (x: number, z: number) => {
    const { c, ox, oz } = chunkAt(x, z); if (!c) return -1;
    for (const g of c.ground) if (inRing(x - ox, z - oz, g.rings[0]) && !g.rings.slice(1).some((h) => inRing(x - ox, z - oz, h))) return g.kind;
    return -2; // not covered (building footprint)
  };
  const R = world.region;
  // junction points (shared vertices) to keep samples away from crossings
  const vkey = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`; const deg = new Map<string, number>();
  for (const s of streets) for (let k = 0; k < s.p.length; k += 2) deg.set(vkey(s.p[k], s.p[k + 1]), (deg.get(vkey(s.p[k], s.p[k + 1])) ?? 0) + 1);
  const junctions: [number, number][] = [...deg.entries()].filter(([, d]) => d > 1).map(([k]) => k.split(',').map(Number) as [number, number]);
  const nearJ = (x: number, z: number) => junctions.some(([a, b]) => Math.abs(a - x) < 15 && Math.abs(b - z) < 15 && Math.hypot(a - x, b - z) < 15 + 12);
  // Divided avenues are mapped as paired one-way carriageways (Park Ave South: two ways 12 m apart, one 22 m
  // roadway). A sample off one carriageway's inner kerb lands on its pair: that is correct, not a missing sidewalk.
  const segDist = (x: number, z: number, p: number[], k: number) => { const ax = p[k - 2], az = p[k - 1], bx = p[k], bz = p[k + 1]; const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)); return Math.hypot(x - ax - dx * t, z - az - dz * t); };
  const onPairedCarriageway = (x: number, z: number, self: typeof streets[0]) => streets.some((o) => o !== self && o.n === self.n && !o.g && (() => { for (let k = 2; k < o.p.length; k += 2) if (segDist(x, z, o.p, k) < o.w / 2 + 0.5) return true; return false; })());
  let n = 0, road = 0; const bad = new Map<string, number>();
  for (const s of streets) {
    if (!s.n || s.g || (nameFilter && !nameFilter.test(s.n))) continue;
    for (let k = 2; k < s.p.length; k += 2) {
      const ax = s.p[k - 2], az = s.p[k - 1], bx = s.p[k], bz = s.p[k + 1]; const L = Math.hypot(bx - ax, bz - az); if (L < 30) continue;
      const ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let t = 15; t < L - 15; t += 10) for (const side of [-1, 1]) {
        const x = ax + ux * t - uz * side * (s.w / 2 + 1.5), z = az + uz * t + ux * side * (s.w / 2 + 1.5);
        if (x < R.minX + 20 || x > R.maxX - 20 || z < R.minZ + 20 || z > R.maxZ - 20 || nearJ(x, z) || onPairedCarriageway(x, z, s)) continue;
        const kd = kindAt(x, z); if (kd === -1) continue;
        n++; if (kd === GroundKind.Road) { road++; bad.set(s.n, (bad.get(s.n) ?? 0) + 1); }
      }
    }
  }
  return { samples: n, roadShare: n ? road / n : 0, worst: [...bad.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) };
}

test('every ground-level road has sidewalk (not roadway) beside both kerbs', () => {
  const r = roadShareBesideKerbs(path.resolve(import.meta.dirname, '../public/data'));
  assert.ok(r.samples > 1000, `too few samples: ${r.samples}`);
  assert.ok(r.roadShare < 0.03, `roadway beside kerbs in ${(r.roadShare * 100).toFixed(1)}% of samples; worst: ${JSON.stringify(r.worst)}`);
});

test('Park Avenue has sidewalks on both sides', () => {
  const r = roadShareBesideKerbs(path.resolve(import.meta.dirname, '../public/data'), /^Park Avenue/);
  assert.ok(r.samples > 20, `too few Park Ave samples: ${r.samples}`);
  assert.ok(r.roadShare < 0.05, `Park Ave roadway beside kerbs in ${(r.roadShare * 100).toFixed(1)}%`);
});
