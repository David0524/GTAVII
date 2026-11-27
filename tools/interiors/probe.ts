/** Debug probe: build one interior in Node and print cells, models and collider heights.  npx tsx tools/interiors/probe.ts <kind> [n] */
import fs from 'node:fs';
import path from 'node:path';
import { decodeIndex, type WireIndex } from '../../src/interiors/indexFormat';
import { buildInterior } from '../../src/interiors/build';
import { readChunk } from '../../src/shared/chunkFormat';
import { KINDS } from '../../src/interiors/catalog';
const ROOT = path.resolve(import.meta.dirname, '../..');
const idx = decodeIndex(JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/interiors/index.json'), 'utf8')) as WireIndex, (k) => (KINDS as Record<string, { hours?: [string, string] }>)[k]?.hours);
const kind = process.argv[2] ?? 'hero', n = +(process.argv[3] ?? 0);
const list = idx.buildings.flatMap((b) => b.units.filter((u) => u.kind === kind).map((u) => ({ b, u })));
const step = Math.max(1, Math.floor(list.length / 30)), pick = list[(n * step) % list.length];
const buf = fs.readFileSync(path.join(ROOT, `public/data/chunks/${pick.b.i}_${pick.b.j}.bin`));
const rec = readChunk(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)).buildings.find((x) => x.id === pick.b.id);
const ring = rec ? Array.from(rec.rings[0], (v, k) => v + ((k % 2 ? pick.b.j : pick.b.i) + 0.5) * 200) : null;
const r = buildInterior({ unit: pick.u, building: pick.b, quality: 'low', ring, street: '' });
for (const c of r.cells) {
  const cols = r.colliders.filter((q) => q.c[0] > c.box[0] && q.c[0] < c.box[3] && q.c[2] > c.box[2] && q.c[2] < c.box[5] && q.c[1] > c.box[1] - 0.1 && q.c[1] < c.box[4] && q.h[0] < 2 && q.h[2] < 2);
  console.log(c.name.padEnd(22), 'floor', c.box[1].toFixed(2), 'furniture colliders', cols.length, cols.length ? 'min y ' + Math.min(...cols.map((q) => q.c[1] - q.h[1])).toFixed(2) : '');
}
console.log('models', r.models.map((m) => `${m.key}@${m.y.toFixed(2)} cell ${r.cells[m.cell].name}`));
