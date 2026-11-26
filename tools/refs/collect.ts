/**
 * Period photo reference collector. Builds references/catalog.json + references/img/*.jpg
 * from public-domain / no-known-restrictions archives only:
 *   - DOCUMERICA (US EPA, 1971-77; US Government work, public domain) via Wikimedia Commons category pages
 *   - Library of Congress, U.S. News & World Report Magazine Photograph Collection ("No known restrictions")
 * Images are downscaled thumbnails (<= 960 px) kept as art reference. Every entry records author, date,
 * source page and rights statement. Requests are serialised and rate-limited.
 *   npx tsx tools/refs/collect.ts
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'references');
const IMG = path.join(OUT, 'img');
const UA = 'Tenderloin74ReferenceResearch/0.1 (game art reference; one request per ~1.5 s)';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string, tries = 4): Promise<Response> {
  for (let k = 0; k < tries; k++) {
    await sleep(1500 + k * 3000);
    const r = await fetch(url, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r && r.ok) return r;
    console.log(`  retry ${k + 1} ${r?.status} ${url.slice(0, 90)}`);
  }
  throw new Error(`failed ${url}`);
}
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 70);

/**
 * Shared reference library format (engine facades + interiors + any stream). Streams add sources by
 * appending collectors below or their own script that writes the same RefEntry shape into
 * references/catalog.json (ids are namespaced by archive: documerica_, loc_, habs_ ...).
 *   kind      : 'exterior' | 'interior' | 'street' | 'vehicle' | 'people'   (what the image is mainly of)
 *   condition : 0..4 on the shared scale in src/shared/condition.ts, when an image is used as a grade exemplar
 */
export interface RefEntry {
  id: string; file: string; title: string; date: string; author: string; place: string;
  topics: string[]; source: string; archive: string; rights: string;
  kind?: 'exterior' | 'interior' | 'street' | 'vehicle' | 'people';
  condition?: 0 | 1 | 2 | 3 | 4;
}

/** What each reference is for. A file is kept only if its title matches at least one topic. */
const TOPICS: Record<string, RegExp> = {
  district: /42ND STREET|42nd Street|SIXTH AVENUE|6th Avenue|SEVENTH AVENUE|GARMENT|HERALD SQUARE|MACY|BROADWAY AT|PENNSYLVANIA STATION|BRYANT PARK|MIDTOWN|47TH STREET|LEXINGTON AVENUE IN MIDTOWN|TIMES SQUARE|35TH STREET/i,
  traffic_cars: /TRAFFIC|CAB|TAXI|CAR\b|CARS|TRUCK|BUS\b|PARKING|DOUBLE PARKED|VEHICLE/i,
  street_life: /SIDEWALK|SUPER|BLOCK PARTY|LINE UP|PEDESTRIAN|JAYWALK|CROWD|LUNCH|STORE|SHOP|FLOWERSHOP|BOOTHS|VENDOR/i,
  grime: /LITTER|TRASH|GRAFFITI|EMPTY LOT|VACANT|ABANDONED|DEFACED|GARBAGE|SMOG/i,
  skyline: /SKYLINE|WORLD TRADE|EMPIRE STATE|BUILDINGS OF MANHATTAN|CANYON/i,
  transit: /SUBWAY|ELEVATED|STATION|AMTRAK|ESCALATOR/i,
};
const EXCLUDE = /CENTRAL PARK|BATTERY PARK|STATEN ISLAND|LINCOLN CENTER|HARBOR|PIER|FERRY|BRIDGE|RIVER|TUNNEL|CRUISE|FOLK|QUILT|FARMER|GARDEN|ROSES|CRAB APPLE|FERTILIZER|SEWAGE|SHEEP|LOOM|WEAVING|AERIAL|BICYCL|FRISBEE|KICKBALL|FOOTBALL|BOATING|PENTHOUSE|TERRACE|172ND|LABORATORY|SEA WALL|SUTTON|ALICE|BENCH PAINTING|RHODODENDRON|125TH|HARLEM|AVENUE D|REIS PARK|UNITED NATIONS|WASHINGTON SQUARE/i;

async function commonsCategory(cat: string, maxPages = 3): Promise<string[]> {
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
function parseCommonsMeta(html: string) {
  const text = decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '\n')).replace(/&#160;|&#8211;/g, ' ');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const after = (label: string) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] ?? '' : ''; };
  return { author: after('Author').replace(/\s*\(.*$/, '').slice(0, 60), date: after('Date').slice(0, 40) };
}

async function commonsEntry(file: string): Promise<RefEntry | null> {
  const page = `https://commons.wikimedia.org/wiki/${encodeURIComponent(file.replace(/ /g, '_'))}`;
  const html = await (await get(page)).text();
  const { author, date } = parseCommonsMeta(html);
  const pd = /PD-USGov|public domain/i.test(html);
  if (!pd) return null;
  const title = file.replace(/^File:/, '').replace(/ - NARA - \d+.*$/, '').replace(/\.jpe?g$/i, '');
  const nara = file.match(/NARA - (\d+)/)?.[1] ?? '';
  return {
    id: `documerica_${nara || slug(title)}`, file: '', title, date, author,
    place: '', topics: [], source: page, archive: `US National Archives, DOCUMERICA${nara ? ` (NAID ${nara})` : ''}, via Wikimedia Commons`,
    rights: 'Public domain (work of the US federal government, EPA DOCUMERICA project)',
  };
}

async function locSearch(q: string): Promise<{ entry: RefEntry; img: string }[]> {
  const url = `https://www.loc.gov/pictures/search/?q=${encodeURIComponent(q)}&co=usnwr&fo=json&c=60`;
  const d = (await (await get(url)).json()) as { results: any[] };
  const out: { entry: RefEntry; img: string }[] = [];
  for (const r of d.results ?? []) {
    const date = String(r.created_published_date ?? '');
    const y = parseInt(date.match(/19[67]\d/)?.[0] ?? '0');
    if (y < 1970 || y > 1977) continue;
    const img = r.image?.full ?? r.image?.square ?? '';
    if (!img) continue;
    out.push({
      img: img.startsWith('//') ? `https:${img}` : img,
      entry: {
        id: `loc_${slug(r.pk ?? r.title)}`, file: '', title: String(r.title ?? '').replace(/^\[|\]$/g, ''), date, author: String(r.creator ?? 'U.S. News & World Report'),
        place: 'New York, N.Y.', topics: [], source: r.links?.item ?? '', archive: 'Library of Congress, U.S. News & World Report Magazine Photograph Collection',
        rights: 'No known restrictions on publication (LOC rights statement for this collection)',
      },
    });
  }
  return out;
}

function topicsFor(t: string) { return Object.entries(TOPICS).filter(([, re]) => re.test(t)).map(([k]) => k); }

async function download(url: string, dest: string) {
  const r = await get(url);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  fs.mkdirSync(IMG, { recursive: true });
  const catalogPath = path.join(OUT, 'catalog.json');
  const catalog: RefEntry[] = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : [];
  const have = new Set(catalog.map((e) => e.id));

  // 0) enrich entries collected before metadata parsing worked
  for (const e of catalog) if (e.id.startsWith('documerica_') && (!e.date || !e.author)) {
    const meta = parseCommonsMeta(await (await get(e.source)).text());
    Object.assign(e, meta); console.log('  enriched', e.id, meta.author, meta.date);
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  }

  // 1) DOCUMERICA Manhattan
  const files = await commonsCategory('DOCUMERICA_photographs_of_Manhattan');
  const picked = files.filter((f) => !/\(cropped\)|\(restored\)|\(\d{8,}\)/.test(f) && !EXCLUDE.test(f) && topicsFor(f).length);
  console.log(`commons: ${files.length} files, ${picked.length} relevant`);
  for (const f of picked) {
    const nara = f.match(/NARA - (\d+)/)?.[1];
    if (nara && have.has(`documerica_${nara}`)) continue;
    const e = await commonsEntry(f).catch((err) => { console.log('  skip', f, String(err)); return null; });
    if (!e || have.has(e.id)) continue;
    e.topics = topicsFor(f);
    e.file = `img/${e.id}.jpg`;
    await download(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(f.replace(/^File:/, ''))}?width=960`, path.join(OUT, e.file));
    catalog.push(e); have.add(e.id);
    console.log('  +', e.id, e.date, e.title.slice(0, 70));
    fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  }

  // 2) Library of Congress, U.S. News & World Report, 1970-77 New York street photography
  for (const q of ['new york street', 'new york city traffic', 'times square', 'new york store', 'new york taxi', 'new york subway', 'new york fashion street', 'new york police']) {
    const res = await locSearch(q).catch((err) => { console.log('  loc fail', q, String(err)); return []; });
    console.log(`loc "${q}": ${res.length} in 1970-77`);
    for (const { entry, img } of res.slice(0, 6)) {
      if (have.has(entry.id)) continue;
      entry.topics = [...new Set([...topicsFor(entry.title.toUpperCase()), q.split(' ').slice(-1)[0]])];
      entry.file = `img/${entry.id}.jpg`;
      try { await download(img, path.join(OUT, entry.file)); } catch { continue; }
      catalog.push(entry); have.add(entry.id);
      console.log('  +', entry.id, entry.date, entry.title.slice(0, 70));
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    }
  }
  console.log(`catalog: ${catalog.length} references`);
}
main().catch((e) => { console.error(e); process.exit(1); });
