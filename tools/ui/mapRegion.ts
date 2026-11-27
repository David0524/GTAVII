/**
 * Bakes public/map/region.json: the land around the playable sheet for the map's regional zoom-out (GTA-style "the
 * world beyond"). Land only; water is the map's background. NYC shoreline from NYC Open Data Borough Boundaries
 * (gthc-hcne, DCP; clipped to the shoreline), New Jersey from US Census cartographic boundaries (cb_2023 county 500k,
 * public domain). Projected with the game's own geo.project, clipped to a window, simplified.
 *   npx tsx tools/ui/mapRegion.ts   (inputs in data/region/, git-ignored; see docs/licenses/ASSETS.md)
 * Inputs (fetch once):
 *   curl -o data/region/nyc_boroughs.geojson https://data.cityofnewyork.us/resource/gthc-hcne.geojson
 *   curl -O https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_county_500k.zip, unzip, then extract the NJ/NY
 *   counties (34003,34013,34017,34031,34039 + NYC) to data/region/census_counties.json as [{geoid,name,rings:[[lon,lat]...]}]
 */
import fs from 'node:fs';
import path from 'node:path';
import { project } from '../../src/shared/geo';

const ROOT = path.resolve(import.meta.dirname, '../..');
const WIN = { minX: -9000, maxX: 8000, minZ: -11000, maxZ: 7000 }; // metres around the sheet
const TOL = 12; // Douglas-Peucker tolerance, m

type P = [number, number];
function dp(pts: P[], tol: number): P[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st: [number, number][] = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop()!; let md = 0, mi = -1;
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dz - (pts[i][1] - az) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
/** Closed rings: first == last makes every chord zero-length, so simplify the two halves separately. */
function dpRing(pts: P[], tol: number): P[] {
  if (pts.length < 8) return pts;
  const m = pts.length >> 1;
  return [...dp(pts.slice(0, m + 1), tol).slice(0, -1), ...dp(pts.slice(m), tol)];
}
/** Sutherland–Hodgman against the window rectangle (rings stay closed polygons). */
function clip(ring: P[]): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p[0] >= WIN.minX, (a, b) => { const t = (WIN.minX - a[0]) / (b[0] - a[0]); return [WIN.minX, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[0] <= WIN.maxX, (a, b) => { const t = (WIN.maxX - a[0]) / (b[0] - a[0]); return [WIN.maxX, a[1] + t * (b[1] - a[1])]; }],
    [(p) => p[1] >= WIN.minZ, (a, b) => { const t = (WIN.minZ - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), WIN.minZ]; }],
    [(p) => p[1] <= WIN.maxZ, (a, b) => { const t = (WIN.maxZ - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), WIN.maxZ]; }],
  ];
  let out = ring;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[(i + inp.length - 1) % inp.length], b = inp[i];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
}
const area = (r: P[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

const land: { name: string; rings: number[][] }[] = [];
function add(name: string, lonlatRings: [number, number][][]) {
  const rings: number[][] = [];
  for (const rr of lonlatRings) {
    const r = clip(dpRing(rr.map(([lon, lat]) => project(lon, lat)), TOL));
    if (r.length < 3 || area(r) < 4000) continue;
    rings.push(r.flatMap(([x, z]) => [Math.round(x), Math.round(z)]));
  }
  if (rings.length) land.push({ name, rings });
}
const nyc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/region/nyc_boroughs.geojson'), 'utf8'));
for (const f of nyc.features) for (const poly of f.geometry.coordinates) add(f.properties.boroname, poly);
const nj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/region/census_counties.json'), 'utf8')) as { geoid: string; name: string; rings: [number, number][][] }[];
for (const c of nj) if (c.geoid.startsWith('34')) add(`${c.name} County, NJ`, c.rings);

// labels: water and places a 1974 New Yorker would name, placed by lon/lat
const L = (text: string, lon: number, lat: number, kind: 'water' | 'boro' | 'place', rot = 0) => { const [x, z] = project(lon, lat); return { text, x: Math.round(x), z: Math.round(z), kind, rot }; };
const labels = [
  L('Hudson River', -74.0145, 40.7585, 'water', -62), L('East River', -73.9655, 40.7385, 'water', -62),
  L('New Jersey', -74.048, 40.776, 'boro'), L('Queens', -73.925, 40.748, 'boro'), L('Brooklyn', -73.958, 40.700, 'boro'), L('Manhattan', -73.975, 40.775, 'boro'),
  L('Hoboken', -74.031, 40.745, 'place'), L('Weehawken', -74.021, 40.770, 'place'), L('Jersey City', -74.055, 40.722, 'place'),
  L('Long Island City', -73.946, 40.746, 'place'), L('Greenpoint', -73.951, 40.728, 'place'),
  L('Central Park', -73.9665, 40.7812, 'place'), L('Upper West Side', -73.979, 40.787, 'place'), L('Upper East Side', -73.957, 40.773, 'place'),
  L('Greenwich Village', -74.0005, 40.7335, 'place'), L('Lower East Side', -73.986, 40.716, 'place'), L('Downtown', -74.009, 40.708, 'place'),
  L('Roosevelt Island', -73.9505, 40.7615, 'place'),
];
const out = { attribution: 'NYC Open Data: Borough Boundaries (DCP) · US Census Bureau cartographic boundaries', window: WIN, land, labels };
const file = path.join(ROOT, 'public/map/region.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`region.json ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${land.length} land pieces, ${land.reduce((s, l) => s + l.rings.reduce((a, r) => a + r.length / 2, 0), 0)} points`);
