/**
 * Builds EVERY interior in the index (Node, single thread, desktop CPU) and reports failures and
 * per-kind cost. Not a phone measurement: phones are ~3-5x slower per core.
 *   npx tsx tools/interiors/stress.ts [low|high] [limit]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readChunk } from '../../src/shared/chunkFormat';
import { decodeIndex, type WireIndex } from '../../src/interiors/indexFormat';
import { buildInterior } from '../../src/interiors/build';
import { KINDS } from '../../src/interiors/catalog';
const ROOT = path.resolve(import.meta.dirname, '../..');
const q = (process.argv[2] ?? 'low') as 'low' | 'high'; const limit = +(process.argv[3] ?? 1e9);
const idx = decodeIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/interiors/index.json'), 'utf8')) as WireIndex, (k) => (KINDS as Record<string, { hours?: [string, string] }>)[k]?.hours);
const rings = new Map<string, Map<number, number[]>>();
const ringOf = (i: number, j: number, id: number) => {
  const key = `${i}_${j}`; let m = rings.get(key);
  if (!m) { const b = fs.readFileSync(path.join(ROOT, `public/data/chunks/${key}.bin`)); const c = readChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); m = new Map(); for (const r of c.buildings) m.set(r.id, Array.from(r.rings[0], (v, k) => v + ((k % 2 ? j : i) + 0.5) * 200)); rings.set(key, m); }
  return m.get(id) ?? null;
};
const per: Record<string, { n: number; ms: number[]; tris: number[]; cells: number[]; slots: number; markers: number; fail: number }> = {};
let n = 0; const fails: string[] = [];
for (const b of idx.buildings) for (const u of b.units) {
  if (n++ >= limit) break;
  const s = (per[u.kind] ??= { n: 0, ms: [], tris: [], cells: [], slots: 0, markers: 0, fail: 0 });
  try {
    const t0 = performance.now();
    const r = buildInterior({ unit: u, building: b, quality: q, ring: ringOf(b.i, b.j, b.id), street: '' });
    s.ms.push(performance.now() - t0); s.tris.push(r.stats.tris); s.cells.push(r.cells.length); s.slots += r.slots.length; s.markers += r.markers.length; s.n++;
  } catch (e) { s.fail++; if (fails.length < 20) fails.push(`${u.id} ${u.kind}: ${(e as Error).message}`); }
}
const pct = (a: number[], p: number) => { const x = [...a].sort((m, k) => m - k); return x[Math.min(x.length - 1, Math.floor(p * x.length))] ?? 0; };
const rows = Object.entries(per).sort((a, b) => b[1].n - a[1].n).map(([k, s]) => ({ kind: k, n: s.n, fail: s.fail, msP50: +pct(s.ms, 0.5).toFixed(1), msP95: +pct(s.ms, 0.95).toFixed(1), msMax: +pct(s.ms, 1).toFixed(1), trisP50: pct(s.tris, 0.5), trisP95: pct(s.tris, 0.95), cellsP50: pct(s.cells, 0.5), slotsAvg: +(s.slots / Math.max(1, s.n)).toFixed(1), markersAvg: +(s.markers / Math.max(1, s.n)).toFixed(1) }));
console.table(rows); console.log('failures:', fails);
fs.mkdirSync(path.join(ROOT, 'docs/interiors'), { recursive: true });
fs.writeFileSync(path.join(ROOT, `docs/interiors/stress_${q}.json`), JSON.stringify({ quality: q, note: 'Node single thread, desktop container CPU; not phone numbers', rows, fails }, null, 1));
