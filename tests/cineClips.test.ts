import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { clipLibrary } from '../tools/ui/cineClips';

// Every clip a cutscene layout names must exist in the characters library (cs.* performance clips may be pending).
test('cutscene layouts reference only known clips', (t) => {
  const lib = clipLibrary();
  if (!lib.size) { t.skip('characters clip library not available (branch not fetched)'); return; }
  const dir = path.resolve(import.meta.dirname, '../content/cutscenes/layout');
  const unknown: string[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')))
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/"clip":\s*"([^"]+)"/g))
      if (!lib.has(m[1]) && !m[1].startsWith('cs.')) unknown.push(`${f}: ${m[1]}`);
  assert.deepEqual(unknown, []);
});
