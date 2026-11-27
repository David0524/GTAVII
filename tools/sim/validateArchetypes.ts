/**
 * Validate narrative NPC archetypes against the sim runtime.
 *   npm run sim:validate            (reads content/npc_archetypes/*.json)
 * Checks the schema from NARRATIVE_BRIEF.md, that every schedule area resolves to a real place,
 * and prints how each archetype will spawn at a few times of day. Exit code 1 on errors.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Simulation, BUILTIN_ARCHETYPES, validateArchetype, type ArchetypeDef } from '../../src/sim/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const dir = path.join(ROOT, 'content/npc_archetypes');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [];
const defs: ArchetypeDef[] = [];
const errors: string[] = [];
for (const f of files) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const one of Array.isArray(d) ? d : [d]) { const e = validateArchetype(one); if (e.length) errors.push(...e.map((x) => `${f}: ${x}`)); else defs.push(one); }
  } catch (e) { errors.push(`${f}: ${(e as Error).message}`); }
}
const fetchBinary = async (p: string) => { const b = fs.readFileSync(path.join(ROOT, 'public/data', p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const sim = new Simulation({ seed: 1, maxVehicles: 1, maxPeds: 1, fetchBinary, archetypes: defs });
await sim.load();
errors.push(...sim.archetypeWarnings);
console.log(`${files.length} content files, ${defs.length} archetypes loaded (+${BUILTIN_ARCHETYPES.length} built-in defaults)`);
for (const a of sim.archetypes) console.log(`  ${a.id.padEnd(28)} ${a.behaviour.padEnd(9)} day ${a.density?.day ?? '-'} night ${a.density?.night ?? '-'} ${(a.schedule ?? []).map((w) => `${w.from}-${w.to}${w.area ? ' @' + w.area : ''}`).join(', ')}`);
if (errors.length) { console.error(`\n${errors.length} problem(s):\n  ${errors.join('\n  ')}`); process.exit(1); }
console.log('OK');
