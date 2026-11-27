/**
 * Interior references, pass 2: fills gaps (sro_room, tenement_hall, diner, loft, derelict/worn condition exemplars).
 * Reuses the helpers of collectInteriors.ts (rate limit >= 1.5 s, honest UA, rights read per item, <= 960 px JPEG).
 * Two steps, so every kept image is viewed before it enters the catalog:
 *   npx tsx tools/refs/collectInteriors2.ts search <out.json>            queries LoC (gsc, fsa, nclc, ppmsc, hh, all) + Commons DOCUMERICA, lists candidates
 *   npx tsx tools/refs/collectInteriors2.ts stage <cands.json> <ids.txt> <dir>   downloads the chosen ids (rights checked) into <dir> for viewing
 *   npx tsx tools/refs/collectInteriors2.ts commit <cands.json> <decisions.json> <stageDir>
 *        decisions: { id: { topics: string[], condition: 0-4, reviewed: string } }; appends to catalog.json, copies jpgs to references/img/
 * Append only: existing catalog entries are never touched.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RefEntry } from './collect.ts';
import { get, locSearch, locItem, inRange, NYC_LOC, NOT_NYC, parseCommonsMeta, IMG, CATALOG, loadCatalog } from './collectInteriors.ts';

const LOC_QUERIES: Record<string, string[]> = {
  sro_room: ['New York hotel room', 'New York rooming house', 'New York boarding house room', 'New York bedroom tenement', 'New York furnished room', 'New York lodging house', 'New York flophouse', 'Bowery lodging', 'New York hall bedroom', 'Orchard Street apartment', 'New York welfare hotel'],
  tenement_hall: ['New York tenement hall', 'New York tenement stair', 'New York tenement hallway', 'Orchard Street stair hall', 'New York tenement stairs', 'New York tenement landing', 'New York tenement interior', 'New York tenement entrance hall', 'New York tenement room'],
  diner: ['New York diner', 'New York lunch counter', 'New York luncheonette', 'New York cafeteria', 'New York automat', 'New York coffee shop', 'New York soda fountain', 'New York lunch room', 'New York quick lunch', 'New York sandwich shop', 'New York restaurant counter'],
  loft: ['New York garment loft', 'New York sweatshop', 'New York factory interior', 'New York garment workers', 'New York loft', 'New York workroom', 'New York clothing factory', 'New York tailor shop', 'New York dressmaking', 'New York needle trades', 'New York studio loft', 'New York shop workers sewing', 'New York finishing garments tenement'],
  condition: ['New York abandoned interior', 'New York vacant apartment', 'New York slum interior', 'New York dilapidated room'],
};
const COLLECTIONS: Record<string, string[]> = {
  sro_room: ['nclc', 'hh', ''], tenement_hall: ['nclc', 'hh', ''], diner: ['gsc', 'fsa', ''], loft: ['gsc', 'fsa', 'nclc', ''], condition: ['hh', ''],
};
const COMMONS_QUERIES = ['DOCUMERICA welfare hotel', 'DOCUMERICA New York tenement interior', 'DOCUMERICA New York apartment interior', 'DOCUMERICA Manhattan abandoned building', 'DOCUMERICA New York slum housing', 'DOCUMERICA Harlem apartment', 'DOCUMERICA New York bedroom', 'DOCUMERICA New York kitchen', 'DOCUMERICA New York hallway', 'DOCUMERICA New York burned out', 'DOCUMERICA New York vandalized', 'DOCUMERICA New York stairway', 'DOCUMERICA New York rooming house', 'DOCUMERICA Lower East Side apartment', 'DOCUMERICA New York lunch counter', 'DOCUMERICA New York diner', 'DOCUMERICA New York restaurant', 'DOCUMERICA New York loft', 'DOCUMERICA New York factory', 'DOCUMERICA New York garment', 'DOCUMERICA New York housing', 'DOCUMERICA Bronx apartment interior', 'DOCUMERICA New York room'];

interface Cand { id: string; kind: 'loc' | 'commons'; title: string; date: string; creator: string; item: string; img: string; gap: string; co: string }

/** QUERIES=<json file {gap: [queries]}> runs only those LoC queries (no Commons) and merges into an existing <out.json>. */
async function search(outFile: string) {
  const extra = process.env.QUERIES ? (JSON.parse(fs.readFileSync(process.env.QUERIES, 'utf8')) as Record<string, string[]>) : null;
  const seen = new Map<string, Cand>(fs.existsSync(outFile) && extra ? (JSON.parse(fs.readFileSync(outFile, 'utf8')) as Cand[]).map((c) => [c.id, c]) : []);
  for (const [gap, qs] of Object.entries(extra ?? LOC_QUERIES)) {
    for (const q of qs) for (const co of COLLECTIONS[gap] ?? ['gsc', 'fsa', 'nclc', 'hh', '']) {
      const hits = await locSearch(co, q, 1).catch(() => []);
      for (const h of hits) {
        if (!inRange(h.created) || /drawing|sketch|plan/i.test(h.medium)) continue;
        const tNYC = NYC_LOC.test(h.title) || /\bN\.\s?Y\.|New York|Manhattan|Orchard|Elizabeth St|Bowery|Mulberry|Hester|Ludlow|Allen St|Eldridge|Delancey|Rivington|Houston St/i.test(h.title);
        if (!tNYC || NOT_NYC.test(h.title)) continue;
        const id = `loc_${h.pk.replace(/[^\w]/g, '_')}`;
        if (!seen.has(id)) seen.set(id, { id, kind: 'loc', title: h.title, date: h.created, creator: h.creator, item: h.itemUrl, img: h.imgUrl, gap, co: co || 'all' });
      }
      console.log(`${gap} "${q}" [${co || 'all'}]: ${hits.length} hits, ${seen.size} kept`);
    }
  }
  for (const q of extra ? [] : COMMONS_QUERIES) {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srnamespace=6&srlimit=50&format=json`;
    const d = (await (await get(url)).json().catch(() => ({}))) as any;
    for (const r of d?.query?.search ?? []) {
      const f = String(r.title);
      if (!/\.jpe?g$/i.test(f) || !/DOCUMERICA|NARA/i.test(f + q) || /\(cropped\)|\(restored\)/i.test(f)) continue;
      const nara = f.match(/NARA - (\d+)/)?.[1];
      const id = `documerica_${nara ?? f.replace(/\W+/g, '_').slice(0, 50)}`;
      if (!seen.has(id)) seen.set(id, { id, kind: 'commons', title: f.replace(/^File:/, '').replace(/ - NARA - \d+.*$/, '').replace(/\.jpe?g$/i, ''), date: '', creator: '', item: `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.replace(/ /g, '_'))}`, img: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/^File:/, ''))}?width=960`, gap: 'condition', co: 'commons' });
    }
    console.log(`commons "${q}": ${seen.size} kept`);
  }
  fs.writeFileSync(outFile, JSON.stringify([...seen.values()], null, 1));
  console.log('candidates', seen.size);
}

/** Rights/place check, then download to the staging dir (named <id>.jpg) and write <id>.json metadata for commit. */
async function stage(candFile: string, idsFile: string, dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const cands = new Map((JSON.parse(fs.readFileSync(candFile, 'utf8')) as Cand[]).map((c) => [c.id, c]));
  const ids = fs.readFileSync(idsFile, 'utf8').split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const c = cands.get(id);
    if (!c || fs.existsSync(path.join(dir, `${id}.json`))) continue;
    let meta: any;
    if (c.kind === 'loc') {
      const it = await locItem(c.item).catch(() => null);
      if (!it) { console.log('NO-RIGHTS/skip', id); continue; }
      meta = { rights: it.rights, place: it.places.join('; ') || 'New York, N.Y.', author: it.creators.join('; ') || c.creator, date: c.date };
      if (it.places.length && it.places.some((p: string) => NOT_NYC.test(p)) && !it.places.some((p: string) => /Manhattan|New York County/.test(p))) { console.log('not NYC', id, it.places); continue; }
    } else {
      const html = await (await get(c.item)).text().catch(() => '');
      if (!/PD-USGov|public domain/i.test(html)) { console.log('NOT PD', id); continue; }
      const m = parseCommonsMeta(html);
      meta = { rights: 'Public domain (work of the US federal government, EPA DOCUMERICA project)', place: 'New York City', author: m.author, date: m.date };
      if (m.date && !inRange(m.date)) { console.log('date out', id, m.date); continue; }
    }
    try {
      const raw = path.join(dir, `.raw_${id}`);
      fs.writeFileSync(raw, Buffer.from(await (await get(c.img)).arrayBuffer()));
      execFileSync('convert', [raw, '-auto-orient', '-resize', '960x960>', '-strip', '-quality', '85', path.join(dir, `${id}.jpg`)], { stdio: 'ignore' });
      fs.unlinkSync(raw);
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta));
      console.log('staged', id, meta.date, '|', c.title.slice(0, 70));
    } catch (e) { console.log('image failed', id, String(e).slice(0, 80)); }
  }
}

function commit(candFile: string, decFile: string, dir: string) {
  const cands = new Map((JSON.parse(fs.readFileSync(candFile, 'utf8')) as Cand[]).map((c) => [c.id, c]));
  const dec = JSON.parse(fs.readFileSync(decFile, 'utf8')) as Record<string, { topics: string[]; condition: 0 | 1 | 2 | 3 | 4; reviewed: string; title?: string }>;
  const catalog = loadCatalog(); const have = new Set(catalog.map((e) => e.id));
  for (const [id, d] of Object.entries(dec)) {
    const c = cands.get(id); if (!c || have.has(id)) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8'));
    fs.copyFileSync(path.join(dir, `${id}.jpg`), path.join(IMG, `${id}.jpg`));
    const isLoc = c.kind === 'loc';
    const entry: RefEntry & { reviewed: string } = {
      id, file: `img/${id}.jpg`, title: d.title ?? c.title, date: meta.date || c.date, author: meta.author, place: meta.place, topics: d.topics,
      source: c.item, rights: meta.rights, kind: 'interior', condition: d.condition, reviewed: d.reviewed,
      archive: isLoc ? `Library of Congress, Prints and Photographs Division (collection ${c.co})` : `US National Archives, DOCUMERICA, via Wikimedia Commons`,
    };
    catalog.push(entry); have.add(id);
  }
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  console.log('catalog now', catalog.length);
}

const [mode, a, b, c] = process.argv.slice(2);
if (mode === 'search') await search(a);
else if (mode === 'stage') await stage(a, b, c);
else if (mode === 'commit') commit(a, b, c);
else console.log('usage: search <out.json> | stage <cands> <ids.txt> <dir> | commit <cands> <decisions.json> <dir>');
