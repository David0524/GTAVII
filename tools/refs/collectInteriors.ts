/**
 * Interior photo reference collector, Manhattan 1900-1977. APPENDS kind:'interior' entries to
 * references/catalog.json and writes downscaled JPEGs (<= 960 px) to references/img/. Existing entries are untouched.
 * Public-domain / "no known restrictions" sources only; each entry records its rights statement:
 *   1. Library of Congress HABS/HAER/HALS (collection "hh"), rights read per item (item JSON rights_information)
 *   2. DOCUMERICA (US EPA, US Government work) via Wikimedia Commons, Manhattan and NYC categories
 *   3. Library of Congress Gottscho-Schleisner Collection (collection "gsc"), rights read per item
 * Needs ImageMagick `convert` on PATH for the downscale.
 *   npx tsx tools/refs/collectInteriors.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { RefEntry } from './collect.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const OUT = path.join(ROOT, 'references');
export const IMG = path.join(OUT, 'img');
export const CATALOG = path.join(OUT, 'catalog.json');
export const UA = 'Tenderloin74ReferenceResearch/0.1 (game art reference; one request per ~1.5 s)';
const GAP_MS = 1600; // minimum spacing between request starts (>= 1.5 s)
const CAP = 106; // stop once this many interior entries exist (120 candidates reviewed, 14 rejected)
const YEAR_MIN = 1900;
const YEAR_MAX = 1977;
/** Ids reviewed by hand and rejected as not interiors (kept out on re-runs). */
const SKIP_IDS = new Set<string>([
  // rejected on contact-sheet review: outdoor plazas, rooftops and storefronts that matched interior words
  'documerica_555522', 'documerica_555523', 'documerica_551634', 'documerica_551635', 'documerica_551636', 'documerica_551637',
  'documerica_551638', 'documerica_551639', 'documerica_551640', 'documerica_549913', 'documerica_548383', 'documerica_555935',
  'loc_gs_2018725843', 'loc_gs_2018735725',
]);

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastStart = 0;
export async function get(url: string, tries = 4): Promise<Response> {
  for (let k = 0; k < tries; k++) {
    const wait = lastStart + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastStart = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r && r.ok) return r;
    console.log(`  retry ${k + 1} ${r?.status ?? 'network'} ${url.slice(0, 90)}`);
    await sleep(3000 * (k + 1));
  }
  throw new Error(`failed ${url}`);
}
export const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70);
export const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const yearOf = (s: string) => parseInt(s.match(/\b(1[89]\d\d)\b/)?.[1] ?? '0');
export const inRange = (date: string) => { const y = yearOf(date); return y >= YEAR_MIN && y <= YEAR_MAX; };

/** Topic labels. A candidate is kept only if at least one label matches its title (plus subjects where given). */
export const TOPICS: Record<string, RegExp> = {
  hotel_lobby: /hotel|hostelry|\binn\b/i,
  office_lobby: /office|lobby|elevator|corporate|company|exchange|board ?room|skyscraper|building interior/i,
  tenement_hall: /tenement|walk-?up|stair|hallway|hall\b|corridor|landing/i,
  sro_room: /hotel room|rooming|bedroom|single room|\bSRO\b/i,
  bar: /\bbar\b|saloon|tavern|lounge|cocktail|\bpub\b|grill room/i,
  diner: /diner|cafeteria|luncheonette|lunch counter|counter|automat|coffee shop|soda fountain|drug ?store/i,
  restaurant: /restaurant|dining|banquet|kitchen|\bcafe\b|oyster|steak|grill/i,
  shop: /shop|store|bakery|butcher|barber|salon|boutique|showroom|market|grocery|newsstand|pharmacy/i,
  church: /church|cathedral|chapel|synagogue|sanctuary|nave|temple/i,
  cinema: /theat|cinema|movie|auditorium|music hall|opera|playhouse|ballroom|vaudeville/i,
  loft: /\bloft|studio|workshop|factory|warehouse|garment/i,
  subway: /subway|turnstile|token booth|station|platform|\bIRT\b|\bBMT\b/i,
  apartment: /apartment|\bflat\b|living room|parlou?r|kitchen|\bhome\b|residen|dwelling|bedroom/i,
  bank: /banking hall|\bbank\b|teller|vault/i,
  // pass 3 (precinct / hospital / co-op / luxury apartment hero interiors)
  precinct: /police|precinct|station house|squad room|detective|booking|fingerprint|mug ?shot|jail|\bcell\b|lock-?up|patrol|sergeant/i,
  hospital: /hospital|emergency room|\bward\b|nurse|nurses|gurney|stretcher|clinic|triage|bellevue|infirmary|patient|medical center|operating room/i,
  coop_apartment: /co-?op|cooperative|penn south|housing project|public housing|housing development|sewing machine|kitchenette|working woman|union/i,
  luxury_apartment: /penthouse|doorman|luxury|park avenue|madison avenue|fifth avenue|grand piano|\blibrary\b|\bstudy\b|drawing room|living room|duplex|town ?house/i,
};
export const topicsFor = (t: string) => Object.entries(TOPICS).filter(([, re]) => re.test(t)).map(([k]) => k);

/** HABS/HAER and Gottscho titles: interior words, and not exterior/plan/drawing words. */
const LOC_INTERIOR = /interior|lobby|room|hall\b|stair|lounge|\bbar\b|dining|kitchen|ballroom|auditorium|theat|foyer|vestibule|ceiling|mezzanine|corridor|elevator|sanctuary|nave|apartment|loft|parlou?r|store|shop|banking|saloon|tavern|cafe|diner|counter|booth|balcony|chapel|church|hotel|tenement|hallway|restaurant|cinema|lunch|office|\bbank\b|staircase|gallery|boardroom|cafeteria|subway|platform|station|showroom|barber|bakery|drug/i;
export const LOC_EXTERIOR = /exterior|fa[cç]ade|elevation|perspective|streetscape|street view|sidewalk|aerial|roof|\bplan\b|section|drawing|sketch|\bsheet\b|site plan|\bmap\b|landscape|overall view|general view|from (the )?street|cornice|steeple|tower|signage|storefront|store front|garden|grounds/i;
export const NYC_LOC = /New York County|Manhattan|New York, N\.?\s?Y|New York City|New York \(State\)--New York|--New York\b/i;
export const NOT_NYC = /Queens|Brooklyn|Kings County|Bronx|Richmond|Staten|Long Island|Westchester|Nassau|Bayside|Yonkers|Buffalo|Rochester|Albany|Syracuse|Cumberland|New Jersey|Hudson County/i;

/** DOCUMERICA titles: interior-type subjects; street/outdoor words excluded (contact sheet checked by hand). */
const DOC_INTERIOR = /apartment|\bflat\b|kitchen|living room|bedroom|\bshop|\bstore\b|diner|restaurant|cafeteria|subway|turnstile|token|\bbar\b|tavern|saloon|office|hallway|hall\b|lobby|stair|tenement|interior|inside|barber|bakery|counter|theat|church|factory|loft|\broom\b|laundromat|grocery|newsstand|elevator|\bbank\b|classroom|lunch|salon|hospital|booth|station|\bcafe\b|pool hall|bowling|nursery|school/i;
const DOC_EXCLUDE = /sidewalk|storefront|store ?front|outside|exterior|aerial|bridge|harbor|ferry|boat|\bpark\b|pier|traffic|street scene|in front of|elevated|\bbus\b|\bcars?\b|truck|skyline|parade|rally|demonstrat|STATEN|BROOKLYN|QUEENS|BRONX|LONG ISLAND|JERSEY|VERRAZANO|\(cropped\)|\(restored\)|\(\d{8,}\)/i;

export const IMG_FAIL: string[] = [];

export interface Candidate {
  id: string; title: string; date: string; author: string; place: string; topics: string[];
  source: string; archive: string; rights: string; imgUrl: string;
}

/** Downscale to <= 960 px JPEG with ImageMagick; the raw download is removed afterwards. */
export async function saveImage(imgUrl: string, id: string): Promise<boolean> {
  const raw = path.join(IMG, `.raw_${id}`);
  const dest = path.join(IMG, `${id}.jpg`);
  try {
    const r = await get(imgUrl);
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    execFileSync('convert', [raw, '-auto-orient', '-resize', '960x960>', '-strip', '-quality', '85', dest], { stdio: 'ignore' });
    return true;
  } catch (err) {
    console.log('  image failed', id, String(err).slice(0, 120));
    IMG_FAIL.push(id);
    return false;
  } finally {
    if (fs.existsSync(raw)) fs.unlinkSync(raw);
  }
}

export function loadCatalog(): RefEntry[] {
  return fs.existsSync(CATALOG) ? JSON.parse(fs.readFileSync(CATALOG, 'utf8')) : [];
}

/** Appends one candidate, downloading its image first. Returns true if added. */
async function commit(catalog: RefEntry[], have: Set<string>, c: Candidate): Promise<boolean> {
  if (have.has(c.id) || SKIP_IDS.has(c.id)) return false;
  if (!c.topics.length) return false;
  if (!(await saveImage(c.imgUrl, c.id))) return false;
  const entry: RefEntry = {
    id: c.id, file: `img/${c.id}.jpg`, title: c.title, date: c.date, author: c.author, place: c.place,
    topics: c.topics, source: c.source, archive: c.archive, rights: c.rights, kind: 'interior',
  };
  catalog.push(entry); have.add(c.id);
  fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
  console.log('  +', entry.id, entry.date, entry.topics.join(','), '|', entry.title.slice(0, 70));
  return true;
}
const interiorCount = (catalog: RefEntry[]) => catalog.filter((e) => e.kind === 'interior').length;

// ---------- 1 + 3) Library of Congress (HABS/HAER/HALS "hh", Gottscho-Schleisner "gsc") ----------

export interface LocHit { pk: string; title: string; created: string; creator: string; subjects: string[]; itemUrl: string; imgUrl: string; medium: string }

export async function locSearch(co: string, q: string, pages = 2): Promise<LocHit[]> {
  const out: LocHit[] = [];
  for (let p = 1; p <= pages; p++) {
    const url = `https://www.loc.gov/pictures/search/?q=${encodeURIComponent(q)}&co=${co}&fo=json&c=100&sp=${p}`;
    const d = (await (await get(url)).json()) as { results?: any[] };
    const rows = d.results ?? [];
    for (const r of rows) {
      const img = r.image?.full ?? '';
      if (!img || !r.pk || !r.links?.item) continue;
      out.push({
        pk: String(r.pk), title: clean(String(r.title ?? '')), created: String(r.created_published_date ?? ''),
        creator: String(Array.isArray(r.creator) ? r.creator.join('; ') : r.creator ?? ''),
        subjects: Array.isArray(r.subjects) ? r.subjects : [], itemUrl: String(r.links.item),
        imgUrl: img.startsWith('//') ? `https:${img}` : img, medium: String(r.medium ?? ''),
      });
    }
    if (rows.length < 100) break;
  }
  return out;
}

/** Item JSON: rights_information and unrestricted flag, place and creator. Null if not "no known restrictions". */
export async function locItem(itemUrl: string) {
  const d = (await (await get(`${itemUrl.replace(/\/?$/, '/')}?fo=json`)).json()) as any;
  const it = d.item ?? {};
  const rights = clean(String(it.rights_information ?? ''));
  if (d.unrestricted !== true || !/No known restrictions/i.test(rights)) return null;
  const places = Array.isArray(it.place) ? it.place.map((p: any) => String(p.title)) : [];
  const creators = Array.isArray(it.creators) ? it.creators.map((c: any) => String(c.title)) : [];
  return { rights, places, creators };
}

async function habsSource(catalog: RefEntry[], have: Set<string>) {
  const queries = ['New York interior', 'New York lobby', 'New York hotel lobby', 'New York hotel interior', 'Manhattan interior',
    'Manhattan lobby', 'New York theater interior', 'New York cinema interior', 'New York church interior', 'New York tenement stair',
    'New York bar interior', 'New York restaurant interior', 'New York bank interior', 'New York loft interior', 'New York store interior',
    'New York office lobby', 'New York elevator lobby', 'New York stairway', 'New York apartment interior', 'New York room interior',
    'New York subway station', 'New York diner', 'New York saloon', 'New York dining room', 'New York ballroom', 'New York auditorium'];
  const seen = new Map<string, LocHit>();
  for (const q of queries) {
    const hits = await locSearch('hh', q).catch((err) => { console.log('  hh fail', q, String(err)); return []; });
    for (const h of hits) if (!seen.has(h.pk)) seen.set(h.pk, h);
    console.log(`habs "${q}": ${hits.length} hits, ${seen.size} unique`);
  }
  const cands = [...seen.values()].filter((h) =>
    /\.photos\./.test(h.pk) && !/drawing|sketch|sheet/i.test(h.medium) && inRange(h.created) &&
    NYC_LOC.test(h.title) && !NOT_NYC.test(h.title) && LOC_INTERIOR.test(h.title) && !LOC_EXTERIOR.test(h.title));
  console.log(`habs: ${seen.size} unique, ${cands.length} interior candidates in 1900-1977 Manhattan`);
  for (const h of cands) {
    if (interiorCount(catalog) >= CAP) break;
    const id = `habs_${h.pk.replace(/^.*\.photos\./, '')}`;
    if (have.has(id)) continue;
    const item = await locItem(h.itemUrl).catch((err) => { console.log('  item fail', h.pk, String(err).slice(0, 80)); return null; });
    if (!item) { console.log('  no-rights/skip', h.pk); continue; }
    const placeFromTitle = h.title.includes(' - ') ? h.title.split(' - ').pop()! : '';
    const place = /New York|Manhattan/.test(placeFromTitle) ? clean(placeFromTitle) : item.places.join('; ') || 'Manhattan, New York';
    const topics = [...new Set([...topicsFor(h.title), ...topicsFor(h.subjects.join(' '))])];
    await commit(catalog, have, {
      id, title: h.title, date: h.created, author: item.creators.join('; ') || h.creator || 'Historic American Buildings Survey',
      place, topics: topics.length ? topics : ['interior'],
      source: h.itemUrl, archive: 'Library of Congress, Historic American Buildings Survey / Historic American Engineering Record (HABS/HAER/HALS)',
      rights: item.rights, imgUrl: h.imgUrl,
    });
  }
}

async function gottschoSource(catalog: RefEntry[], have: Set<string>) {
  const queries = ['New York restaurant', 'New York hotel lobby', 'New York hotel interior', 'New York store interior', 'New York shop interior',
    'New York office interior', 'New York lobby', 'New York bar', 'New York diner', 'New York cafeteria', 'New York bank interior',
    'New York theatre interior', 'New York church interior', 'New York apartment interior', 'New York dining room', 'New York showroom',
    'Manhattan interior', 'New York lounge', 'New York barber shop', 'New York drug store'];
  const seen = new Map<string, LocHit>();
  for (const q of queries) {
    const hits = await locSearch('gsc', q).catch((err) => { console.log('  gsc fail', q, String(err)); return []; });
    for (const h of hits) if (!seen.has(h.pk)) seen.set(h.pk, h);
    console.log(`gsc "${q}": ${hits.length} hits, ${seen.size} unique`);
  }
  const cands = [...seen.values()].filter((h) =>
    inRange(h.created) && NYC_LOC.test(h.title) && !NOT_NYC.test(h.title) && LOC_INTERIOR.test(h.title) && !LOC_EXTERIOR.test(h.title));
  console.log(`gsc: ${seen.size} unique, ${cands.length} interior candidates in 1900-1977 New York City`);
  for (const h of cands) {
    if (interiorCount(catalog) >= CAP) break;
    const id = `loc_gs_${h.pk}`;
    if (have.has(id)) continue;
    const item = await locItem(h.itemUrl).catch((err) => { console.log('  item fail', h.pk, String(err).slice(0, 80)); return null; });
    if (!item) { console.log('  no-rights/skip', h.pk); continue; }
    if (item.places.length && !item.places.some((p: string) => /New York/.test(p) && !NOT_NYC.test(p))) { console.log('  not NYC', h.pk); continue; }
    const topics = [...new Set([...topicsFor(h.title), ...topicsFor(h.subjects.join(' '))])];
    await commit(catalog, have, {
      id, title: h.title, date: h.created, author: item.creators.join('; ') || h.creator || 'Gottscho-Schleisner, Inc.',
      place: item.places.join('; ') || 'New York, N.Y.', topics: topics.length ? topics : ['interior'],
      source: h.itemUrl, archive: 'Library of Congress, Gottscho-Schleisner Collection (Prints and Photographs Division)',
      rights: item.rights, imgUrl: h.imgUrl,
    });
  }
}

// ---------- 2) DOCUMERICA via Wikimedia Commons ----------

export async function commonsCategory(cat: string, maxPages = 5): Promise<string[]> {
  const files = new Set<string>();
  let url = `https://commons.wikimedia.org/wiki/Category:${cat}`;
  for (let p = 0; p < maxPages && url; p++) {
    const html = await (await get(url)).text();
    for (const m of html.matchAll(/title="(File:[^"]+\.jpe?g)"/gi)) files.add(decode(m[1]));
    const next = html.match(/href="([^"]*filefrom=[^"]*)"[^>]*>next page/);
    url = next ? `https://commons.wikimedia.org${decode(next[1])}` : '';
  }
  return [...files];
}

/** Author and date from a Commons file page (information template rendered as label/value lines). */
export function parseCommonsMeta(html: string) {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).replace(/&#160;|&#8211;/g, ' ');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const after = (label: string) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] ?? '' : ''; };
  return { author: after('Author').replace(/\s*\(.*$/, '').slice(0, 60), date: after('Date').slice(0, 40) };
}

async function documericaSource(catalog: RefEntry[], have: Set<string>) {
  const files = new Set<string>();
  for (const cat of ['DOCUMERICA_photographs_of_Manhattan', 'DOCUMERICA_photographs_of_New_York_City']) {
    for (const f of await commonsCategory(cat)) files.add(f);
  }
  const cands = [...files].filter((f) => DOC_INTERIOR.test(f) && !DOC_EXCLUDE.test(f) && topicsFor(f).length);
  console.log(`commons: ${files.size} files, ${cands.length} interior candidates`);
  for (const f of cands) {
    if (interiorCount(catalog) >= CAP) break;
    const nara = f.match(/NARA - (\d+)/)?.[1];
    if (nara && have.has(`documerica_${nara}`)) continue;
    const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(f.replace(/ /g, '_'))}`;
    const html = await (await get(page)).text().catch(() => null);
    if (!html) { console.log('  skip', f); continue; }
    if (!/PD-USGov|public domain/i.test(html)) { console.log('  not PD', f.slice(0, 80)); continue; }
    const { author, date } = parseCommonsMeta(html);
    const title = f.replace(/^File:/, '').replace(/ - NARA - \d+.*$/, '').replace(/\.jpe?g$/i, '');
    await commit(catalog, have, {
      id: `documerica_${nara || slug(title)}`, title, date, author, place: 'Manhattan, New York City',
      topics: topicsFor(f), source: page,
      archive: `US National Archives, DOCUMERICA${nara ? ` (NAID ${nara})` : ''}, via Wikimedia Commons`,
      rights: 'Public domain (work of the US federal government, EPA DOCUMERICA project)',
      imgUrl: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/^File:/, ''))}?width=960`,
    });
  }
}

async function main() {
  fs.mkdirSync(IMG, { recursive: true });
  const catalog = loadCatalog();
  const have = new Set(catalog.map((e) => e.id));
  const before = interiorCount(catalog);

  await habsSource(catalog, have);
  console.log(`after HABS: ${interiorCount(catalog)} interiors`);
  await documericaSource(catalog, have);
  console.log(`after DOCUMERICA: ${interiorCount(catalog)} interiors`);
  await gottschoSource(catalog, have);
  console.log(`added ${interiorCount(catalog) - before}; catalog: ${catalog.length} references (${interiorCount(catalog)} interior)`);
  if (IMG_FAIL.length) console.log('image failures:', IMG_FAIL.join(', '));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
