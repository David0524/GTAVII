/**
 * Checks every cutscene layout's clip references against the characters clip library (their branch first, so this
 * runs before the merge): Quaternius UAL clips by source name (tools/characters/build-anims.ts CLIPS) plus their
 * authored clips (src/characters/anim/authored.ts). `cs.<scene>.<actor>_<name>` performance clips are reported as
 * pending until characters ships them.
 *   npx tsx tools/ui/cineClips.ts            (exit 1 on any unknown clip)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const BRANCH = 'origin/claude/characters-74';
const read = (f: string) => { try { return execSync(`git show ${BRANCH}:${f}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : ''; } };

export function clipLibrary(): Set<string> {
  const lib = new Set<string>();
  const build = read('tools/characters/build-anims.ts');
  const block = build.match(/const CLIPS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
  for (const m of block.matchAll(/'([A-Za-z0-9_]+)'/g)) if (!m[1].endsWith('.glb') && m[1] !== 'A_TPose') lib.add(m[1]);
  for (const m of read('src/characters/anim/authored.ts').matchAll(/name: '([a-z0-9_]+)'/g)) lib.add(m[1]);
  return lib;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const lib = clipLibrary();
  if (!lib.size) { console.error('no clip library found (fetch the characters branch)'); process.exit(2); }
  const dir = path.join(ROOT, 'content/cutscenes/layout');
  let bad = 0, pending = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const j = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of j.matchAll(/"clip":\s*"([^"]+)"/g)) {
      if (lib.has(m[1])) continue;
      if (m[1].startsWith('cs.')) { pending++; console.log(`${f}: ${m[1]} (performance clip, pending from characters)`); continue; }
      bad++; console.log(`${f}: UNKNOWN clip ${m[1]}`);
    }
  }
  console.log(`${lib.size} clips in the library; ${bad} unknown, ${pending} pending`);
  process.exit(bad ? 1 : 0);
}
