/**
 * Build check (user decision 2026-11-26): real brand / trademarked landmark names must never reach a
 * player-visible label. The denylist is generated from content/landmarks.json (`real` + aliases, the
 * names the registry replaces). Player-visible data scanned: world.json (heroes and every string), the
 * street names in streets.json, and the district names. A hit fails the test.
 * Matching is case-insensitive on word boundaries and refuses a longer word after the match, so the
 * sound-alike "Hotel Pennsylvanian" does not trip "Hotel Pennsylvania". Aliases of 3 letters or fewer
 * (MSG, ESB, WTC) are matched only as whole upper-case words.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/landmarks.json'), 'utf8')).landmarks as { real: string; aliases?: string[]; name: string }[];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "['’]?");
const deny = reg.flatMap((l) => [l.real, ...(l.aliases ?? [])]).filter((n) => !/^the\s/i.test(n) || n.split(' ').length > 2);
const patterns = deny.map((n) => (n.length <= 3 ? new RegExp(`\\b${esc(n)}\\b`) : new RegExp(`\\b${esc(n)}(?![a-z])`, 'i')));

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'id') strings(x, out); // ids are internal keys, never displayed
  return out;
}
function hits(label: string, list: string[]) {
  const bad: string[] = [];
  for (const s of list) for (const re of patterns) if (re.test(s)) bad.push(`${label}: "${s}" matches ${re}`);
  return bad;
}

test('landmark registry: sound-alikes are not themselves denied', () => {
  assert.deepEqual(hits('registry name', reg.map((l) => l.name)), []);
});

test('no real brand names in player-visible data', () => {
  const world = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/world.json'), 'utf8'));
  const { attribution: _a, stats: _s, ...visible } = world; // attribution is the required OSM/NYC credit line
  const streets = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/streets.json'), 'utf8')) as { n?: string }[];
  const districts = fs.readFileSync(path.join(ROOT, 'src/world/Districts.ts'), 'utf8').match(/'[^']+'/g) ?? [];
  const bad = [...hits('world.json', strings(visible)), ...hits('streets.json', streets.map((s) => s.n ?? '')), ...hits('Districts.ts', districts)];
  assert.deepEqual(bad, []);
});
