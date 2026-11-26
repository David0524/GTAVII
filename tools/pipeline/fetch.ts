/**
 * Stage 1: download raw source data into data/raw/ (gitignored).
 * Re-running is idempotent: existing files are kept unless --force is passed.
 * Every request is deterministic (fixed bbox, fixed fields) so the build is reproducible;
 * data/raw/manifest.json records fetch times and byte sizes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { RAW, ensureDir, log, regionBBox } from './common.ts';

const FORCE = process.argv.includes('--force');
const UA = 'tenderloin74-data-pipeline/0.1 (reproducible build script)';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function get(url: string, init: RequestInit = {}, timeoutMs = 180_000): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal, headers: { 'User-Agent': UA, ...(init.headers ?? {}) } });
  } finally { clearTimeout(t); }
}

const manifest: Record<string, unknown> = {};
function save(name: string, body: string, meta: Record<string, unknown>) {
  fs.writeFileSync(path.join(RAW, name), body);
  manifest[name] = { ...meta, bytes: Buffer.byteLength(body), fetchedAt: new Date().toISOString() };
  log(`saved ${name} (${(Buffer.byteLength(body) / 1e6).toFixed(2)} MB)`);
}
function have(name: string) { return !FORCE && fs.existsSync(path.join(RAW, name)); }

/** NYC Building Footprints (NYC Open Data 5zhs-2jue): polygons, roof height, construction year, BIN, BBL. */
async function fetchFootprints(name: string, bb: { w: number; s: number; e: number; n: number }, where = '') {
  if (have(name)) return log(`skip ${name}`);
  const all: unknown[] = [];
  const PAGE = 20000;
  for (let off = 0; ; off += PAGE) {
    const q = new URLSearchParams({
      $where: `within_box(the_geom, ${bb.n}, ${bb.w}, ${bb.s}, ${bb.e})${where}`,
      $limit: String(PAGE), $offset: String(off), $order: 'objectid',
    });
    const url = `https://data.cityofnewyork.us/resource/5zhs-2jue.geojson?${q}`;
    const r = await get(url);
    if (!r.ok) throw new Error(`footprints ${r.status}: ${await r.text()}`);
    const gj = (await r.json()) as { features: unknown[] };
    all.push(...gj.features);
    log(`${name}: +${gj.features.length}`);
    if (gj.features.length < PAGE) break;
  }
  save(name, JSON.stringify({ type: 'FeatureCollection', features: all }), { source: 'NYC Open Data 5zhs-2jue', bbox: bb, where });
}

/** NYC PLUTO tax lots (NYC Open Data 64uk-42ks): year built, land use, building class, floors. */
async function fetchPluto(bb: { w: number; s: number; e: number; n: number }) {
  const name = 'pluto.json';
  if (have(name)) return log(`skip ${name}`);
  const fields = 'bbl,address,yearbuilt,yearalter1,yearalter2,numfloors,numbldgs,landuse,bldgclass,lotarea,bldgarea,latitude,longitude';
  const q = new URLSearchParams({
    $select: fields,
    $where: `borough='MN' AND latitude between ${bb.s} and ${bb.n} AND longitude between ${bb.w} and ${bb.e}`,
    $limit: '50000',
  });
  const r = await get(`https://data.cityofnewyork.us/resource/64uk-42ks.json?${q}`);
  if (!r.ok) throw new Error(`pluto ${r.status}: ${await r.text()}`);
  const body = await r.text();
  save(name, body, { source: 'NYC Open Data 64uk-42ks (PLUTO)', bbox: bb });
}

/** OpenStreetMap: everything needed for streets, parks, rail, and building parts. */
async function fetchOSM(bb: { w: number; s: number; e: number; n: number }) {
  const name = 'osm.json';
  if (have(name)) return log(`skip ${name}`);
  const b = `${bb.s},${bb.w},${bb.n},${bb.e}`;
  const query = `[out:json][timeout:170];
(
  way["highway"](${b});
  way["building"](${b});
  way["building:part"](${b});
  relation["building"](${b});
  relation["type"="building"](${b});
  way["leisure"](${b});
  way["landuse"](${b});
  way["railway"](${b});
  way["amenity"](${b});
  node["highway"="traffic_signals"](${b});
  node["railway"="subway_entrance"](${b});
  way["area:highway"](${b});
);
(._;>;);
out body;`;
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      log(`overpass: ${ep}`);
      const r = await get(ep, { method: 'POST', body: new URLSearchParams({ data: query }) }, 200_000);
      if (!r.ok) { log(`  -> HTTP ${r.status}`); continue; }
      const body = await r.text();
      if (!body.startsWith('{')) { log('  -> non-JSON reply'); continue; }
      return save(name, body, { source: 'OpenStreetMap via Overpass', endpoint: ep, bbox: bb, query });
    } catch (e) { log(`  -> ${(e as Error).message}`); }
  }
  // Fallback: OSM editing API /map in small tiles (merged + deduplicated). Same data, slower.
  log('overpass unavailable; falling back to OSM API tiles');
  const nodes = new Map<number, unknown>(), ways = new Map<number, unknown>(), rels = new Map<number, unknown>();
  const STEP = 0.006;
  for (let lat = bb.s; lat < bb.n; lat += STEP) {
    for (let lon = bb.w; lon < bb.e; lon += STEP) {
      const box = [lon, lat, Math.min(lon + STEP, bb.e), Math.min(lat + STEP, bb.n)].map((v) => v.toFixed(6)).join(',');
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await get(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${box}`).catch(() => null);
        if (r && r.ok) {
          const j = (await r.json()) as { elements: { type: string; id: number }[] };
          for (const el of j.elements) (el.type === 'node' ? nodes : el.type === 'way' ? ways : rels).set(el.id, el);
          log(`  tile ${box}: ${j.elements.length} elements`);
          break;
        }
        log(`  tile ${box}: retry (${r?.status})`);
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  const elements = [...nodes.values(), ...ways.values(), ...rels.values()];
  save(name, JSON.stringify({ elements }), { source: 'OpenStreetMap API 0.6 /map (tiled fallback)', bbox: bb });
}

async function main() {
  ensureDir(RAW);
  const mf = path.join(RAW, 'manifest.json');
  if (fs.existsSync(mf)) Object.assign(manifest, JSON.parse(fs.readFileSync(mf, 'utf8')));
  const bb = regionBBox(80);
  log('region bbox', bb);
  await fetchFootprints('footprints.geojson', bb);
  // Distant skyline: tall buildings (>60 m roof) across lower/midtown Manhattan for the horizon layer.
  await fetchFootprints('skyline.geojson', { w: -74.03, s: 40.69, e: -73.94, n: 40.80 }, ' AND height_roof > 197');
  await fetchPluto(bb);
  await fetchOSM(bb);
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
