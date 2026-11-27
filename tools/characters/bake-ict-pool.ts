/**
 * Bakes the ICT near-ring pool (tools/characters/ict_pool.json):
 *   npx tsx tools/characters/bake-ict-pool.ts [name ...]
 * 1. the topology source `_topo` (ICT's neutral) is baked with --pool and simplified once;
 * 2. each identity is baked with --pool (same vertex set) and lightened in place with that
 *    simplification (ict-lod.ts --topo ict__topo --inplace), so every pool head shares one topology;
 * 3. the topology source's files and index entry are removed (it never ships).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const D = import.meta.dirname, OUT = path.resolve(D, '../../public/characters/rb');
const spec = JSON.parse(fs.readFileSync(path.join(D, 'ict_pool.json'), 'utf8'));
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(spec.heads).filter((k) => k !== '_topo');
const tsx = (...a: string[]) => execFileSync('npx', ['tsx', ...a], { stdio: ['ignore', 'pipe', 'inherit'], cwd: path.resolve(D, '../..') }).toString().trim().split('\n').slice(-1)[0];
const TRIS = String(spec.defaults?.lodTris ?? 10000);

fs.rmSync(path.join(OUT, 'ict_pool_topo.bin'), { force: true }); // rewritten by the first head
console.log(tsx(path.join(D, 'bake-ict.ts'), '_topo', '--pool'));
for (const n of names) {
  console.log(tsx(path.join(D, 'bake-ict.ts'), n, '--pool'));
  console.log(tsx(path.join(D, 'ict-lod.ts'), `ict_${n}`, TRIS, '--topo', 'ict__topo', '--inplace', '--shared', 'ict_pool_topo'));
}
for (const f of fs.readdirSync(OUT)) if (f.startsWith('ict__topo')) fs.rmSync(path.join(OUT, f));
const idxFile = path.join(OUT, 'index.json'), index = JSON.parse(fs.readFileSync(idxFile, 'utf8'));
index.heads = index.heads.filter((h: any) => !h.id.startsWith('ict__topo'));
fs.writeFileSync(idxFile, JSON.stringify(index, null, 1));
const pool = index.heads.filter((h: any) => h.id.startsWith('ict_'));
console.log('ICT pool', pool.length, 'heads, mean KB', (pool.reduce((s: number, h: any) => s + h.bytes, 0) / pool.length / 1024).toFixed(0));
