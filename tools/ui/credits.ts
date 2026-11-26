/**
 * Builds public/data/ui/licences.json: the full licence text of every third-party component that
 * ships in the game (runtime npm dependencies, fonts), read from the files themselves so the
 * credits screen can never drift from what's bundled. Run after dependency or font changes:
 *   npx tsx tools/ui/credits.ts
 * The human-written credits (people, datasets, attributions) live in src/ui/data/credits.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const out: { name: string; version: string; licence: string; text: string }[] = [];
for (const dep of Object.keys(pkg.dependencies)) {
  const dir = path.join(ROOT, 'node_modules', dep);
  const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const lf = fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  if (!lf) throw new Error(`no licence file in ${dep}`);
  out.push({ name: dep, version: p.version, licence: p.license, text: fs.readFileSync(path.join(dir, lf), 'utf8').trim() });
}
out.push({ name: 'Fonts: TeX Gyre Heros, Heros Cn, Schola, Cursor (subsets renamed T74 …), by B. Jackowski and J. M. Nowacki (GUST e-foundry)', version: 'latin subsets', licence: 'GUST Font License (LPPL 1.3c)', text: fs.readFileSync(path.join(ROOT, 'public/fonts/GUST-FONT-LICENSE.txt'), 'utf8').trim() });
out.push({ name: 'Font: Libre Franklin, The Libre Franklin Project Authors', version: 'latin subset, weights 500–900', licence: 'OFL-1.1', text: fs.readFileSync(path.join(ROOT, 'public/fonts/OFL-LibreFranklin.txt'), 'utf8').trim() });
fs.mkdirSync(path.join(ROOT, 'public/data/ui'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'public/data/ui/licences.json'), JSON.stringify(out));
console.log(out.map((o) => `${o.name}@${o.version} ${o.licence} (${o.text.length} chars)`).join('\n'));
