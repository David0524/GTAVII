/**
 * Stage 2: turn data/raw/* into public/data/{world.json, streets.json, skyline.bin, chunks/*.bin}.
 * Deterministic: same raw inputs -> byte-identical outputs (seeded hashing only, no Math.random).
 */
import fs from 'node:fs';
import path from 'node:path';
import { union, intersect, difference, bufferLines } from './clip.ts';
import { CHUNK_SIZE, GRID_ROTATION_DEG, REGION, project, chunkKey } from '../../src/shared/geo.ts';
import {
  BuildingFlag, GroundKind, PoiKind, Style, writeChunk, ByteWriter, PaintKind,
  type WBuilding, type WGround, type WPoi, type WPaint,
} from '../../src/shared/chunkFormat.ts';
import { RAW, OUT, ROOT, ensureDir, log } from './common.ts';
import { dateBuilding, osmYear, type Dating } from './dating.ts';
import { buildTerrain, encodeTerrain, rejected as terrainRejected } from './terrain.ts';
import {
  AVENUE_DIRECTION_1974, HERO_NAMES, HERO_POINTS, CUTOFF_YEAR, RESTORED_BUILDINGS, SKYLINE_ADDITIONS, TWO_WAY_STREETS, roadwayWidth,
} from './era1974.ts';

type P = [number, number];
type Poly = P[][]; // outer + holes
const FT = 0.3048;

// ------------------------------------------------------------------ helpers
function hash(n: number, salt = 0) {
  let h = (n ^ 0x9e3779b9 ^ (salt * 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function ringArea(r: P[]) { let a = 0; for (let k = 0, n = r.length; k < n; k++) { const [x1, z1] = r[k], [x2, z2] = r[(k + 1) % n]; a += x1 * z2 - x2 * z1; } return a / 2; }
function polyArea(p: Poly) { return Math.abs(ringArea(p[0])) - p.slice(1).reduce((s, h) => s + Math.abs(ringArea(h)), 0); }
function centroid(r: P[]) { let x = 0, z = 0; const n = r.length; for (const p of r) { x += p[0]; z += p[1]; } return [x / n, z / n] as P; }
function bbox(rings: P[][]) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const r of rings) for (const [x, z] of r) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }
  return { minX: a, minZ: b, maxX: c, maxZ: d };
}
function pointInRing(p: P, r: P[]) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPoly(p: P, poly: Poly) { return pointInRing(p, poly[0]) && !poly.slice(1).some((h) => pointInRing(p, h)); }
/** Drop closing duplicate, collapse near-duplicates, enforce winding (outer CCW in x/z math sense, holes CW). */
function cleanPoly(poly: Poly): Poly | null {
  const out: Poly = [];
  for (let k = 0; k < poly.length; k++) {
    let r = poly[k].slice();
    if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
    r = r.filter((p, i) => { const q = r[(i + r.length - 1) % r.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05; });
    if (r.length < 3 || Math.abs(ringArea(r)) < 0.5) { if (k === 0) return null; continue; }
    const ccw = ringArea(r) > 0;
    if ((k === 0) !== ccw) r.reverse();
    out.push(r);
  }
  return out;
}
const rectPoly = (minX: number, minZ: number, maxX: number, maxZ: number): Poly => [[[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]];
const inRegion = ([x, z]: P, m = 0) => x >= REGION.minX - m && x <= REGION.maxX + m && z >= REGION.minZ - m && z <= REGION.maxZ + m;

// ------------------------------------------------------------------ load raw
log('loading raw data');
const footprints = JSON.parse(fs.readFileSync(path.join(RAW, 'footprints.geojson'), 'utf8')).features as any[];
const skylineRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'skyline.geojson'), 'utf8')).features as any[];
const plutoRows = JSON.parse(fs.readFileSync(path.join(RAW, 'pluto.json'), 'utf8')) as any[];
const osm = JSON.parse(fs.readFileSync(path.join(RAW, 'osm.json'), 'utf8')).elements as any[];

const pluto = new Map<string, any>();
for (const r of plutoRows) pluto.set(String(Math.round(parseFloat(r.bbl))), r);

// Snap to 1 cm: keeps polygon-clipping's sweep line numerically robust and matches the chunk quantisation.
const snap = (p: P): P => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
const nodes = new Map<number, P>();
for (const e of osm) if (e.type === 'node') nodes.set(e.id, snap(project(e.lon, e.lat)));
const ways = osm.filter((e) => e.type === 'way' && e.nodes && e.tags);
const wayPts = (w: any): P[] => w.nodes.map((id: number) => nodes.get(id)).filter(Boolean);

// OSM outlines carrying a NYC BIN: their start_date is a third, hand-curated dating source.
const osmByBin = new Map<string, any>();
for (const w of ways) { const b = w.tags['nycdoitt:bin']; if (b && (w.tags.building || w.tags['building:part'])) { const prev = osmByBin.get(b); if (!prev || (!prev.start_date && w.tags.start_date)) osmByBin.set(b, w.tags); } }
for (const e of osm) if (e.type === 'relation' && e.tags?.['nycdoitt:bin'] && !osmByBin.has(e.tags['nycdoitt:bin'])) osmByBin.set(e.tags['nycdoitt:bin'], e.tags);

interface AuditRow { bin: string; address: string; name: string; pluto: number; footprint: number; osm: number; heightM: number; x: number; z: number; d: Dating }
const audit: AuditRow[] = [];

// ------------------------------------------------------------------ measure grid rotation (sanity check)
{
  let sx = 0, sz = 0;
  for (const w of ways) if (w.tags.name === '5th Avenue' && w.tags.highway) {
    const p = wayPts(w); for (let k = 1; k < p.length; k++) { const dx = p[k][0] - p[k - 1][0], dz = p[k][1] - p[k - 1][1]; const s = dz > 0 ? -1 : 1; sx += dx * s; sz += dz * s; }
  }
  const residual = (Math.atan2(sx, -sz) * 180) / Math.PI;
  log(`Fifth Ave residual angle vs grid -Z: ${residual.toFixed(3)} deg (GRID_ROTATION_DEG=${GRID_ROTATION_DEG})`);
}

// ------------------------------------------------------------------ buildings
interface Bldg {
  id: number; poly: Poly; height: number; minHeight: number; year: number; use: number; floors: number;
  style: number; flags: number; name?: string; bin?: string;
}
const buildings: Bldg[] = [];
const lots: Poly[] = []; // stand-in parking lots
let nextId = 1;
const stats = { footprints: 0, removedPost1974: 0, standIns: 0, parkingLots: 0, osmParts: 0, restored: 0, heroes: 0, noYear: 0, groundedParts: 0, notBuildings: 0, droppedModernParts: 0, orphanBuildings: 0, orphanStandIns: 0, partsOnStandIns: 0 };

function classify(year: number, use: number, floors: number, height: number, bldgclass: string): number {
  const cls = bldgclass?.[0] ?? '';
  if ('MNPQUWY'.includes(cls) && cls) return Style.Civic;
  if (floors <= 3 && height < 14) return Style.LowCommercial;
  if (year >= 1946) return Style.Postwar;
  if (height > 80 && year >= 1916) return Style.SetbackTower;
  if (use <= 4 && floors <= 7) return Style.Tenement; // residential
  if (year < 1900 && floors <= 8) return Style.CastIronLoft;
  if (cls === 'O' || cls === 'H') return Style.PrewarOffice;
  if (use === 6 || use === 5 || cls === 'E' || cls === 'K') return floors >= 8 ? Style.MasonryLoft : Style.CastIronLoft;
  return year < 1932 ? Style.MasonryLoft : Style.PrewarOffice;
}

function standIns(poly: Poly, seed: number, use: number) {
  // Plausible 1970s fabric in place of a post-1974 building: slice big footprints into
  // lot-width strips along their long grid axis; each strip becomes a tenement, loft, taxpayer or parking lot.
  const area = polyArea(poly);
  const bb = bbox(poly);
  const spanX = bb.maxX - bb.minX, spanZ = bb.maxZ - bb.minZ;
  const pieces: Poly[] = [];
  if (area < 900) pieces.push(poly);
  else {
    const alongX = spanX >= spanZ;
    const len = alongX ? spanX : spanZ;
    let t = 0, k = 0;
    while (t < len - 0.1) {
      const w = Math.min(len - t, 7.6 * (1 + Math.floor(hash(seed, k) * 4))); // 25, 50, 75, 100 ft lots
      const strip = alongX ? rectPoly(bb.minX + t, bb.minZ - 1, bb.minX + t + w, bb.maxZ + 1) : rectPoly(bb.minX - 1, bb.minZ + t, bb.maxX + 1, bb.minZ + t + w);
      for (const p of intersect([poly], [strip])) { const c = cleanPoly(p); if (c) pieces.push(c); }
      t += w; k++;
    }
  }
  pieces.forEach((p, k) => {
    const r = hash(seed, 100 + k);
    const a = polyArea(p);
    if (r < 0.18 && a > 150) { lots.push(p); stats.parkingLots++; return; }
    let floors: number, style: number, year: number;
    if (r < 0.55) { floors = 4 + Math.floor(hash(seed, 200 + k) * 3); style = Style.Tenement; year = 1885 + Math.floor(hash(seed, 300 + k) * 30); }
    else if (r < 0.85) { floors = 7 + Math.floor(hash(seed, 200 + k) * 8); style = hash(seed, 400 + k) < 0.3 ? Style.CastIronLoft : Style.MasonryLoft; year = style === Style.CastIronLoft ? 1880 + Math.floor(hash(seed, 300 + k) * 18) : 1902 + Math.floor(hash(seed, 300 + k) * 25); }
    else { floors = 1 + Math.floor(hash(seed, 200 + k) * 2); style = Style.LowCommercial; year = 1920 + Math.floor(hash(seed, 300 + k) * 30); }
    buildings.push({ id: nextId++, poly: p, height: floors * 3.5 + 1.2, minHeight: 0, year, use: use || 4, floors, style, flags: BuildingFlag.StandIn });
    stats.standIns++;
  });
}

for (const f of footprints) {
  const pr = f.properties;
  const geom = f.geometry;
  if (!geom) continue;
  const polys: Poly[] = (geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates]).map((pg: any) => pg.map((r: any) => r.map(([lon, lat]: number[]) => snap(project(lon, lat)))));
  const heightFt = parseFloat(pr.height_roof);
  for (const raw of polys) {
    const poly = cleanPoly(raw);
    if (!poly) continue;
    if (!inRegion(centroid(poly[0]))) continue;
    stats.footprints++;
    const lot = pluto.get(pr.mappluto_bbl ?? '') ?? pluto.get(pr.base_bbl ?? '');
    const use = parseInt(lot?.landuse ?? '0') || 0;
    let height = Number.isFinite(heightFt) && heightFt > 0 ? heightFt * FT : 10;
    const o = osmByBin.get(pr.bin ?? '');
    const d = dateBuilding({
      bin: pr.bin, featureCode: pr.feature_code, status: pr.last_status_type, heightM: height,
      pluto: parseInt(lot?.yearbuilt ?? '0') || 0, footprint: parseInt(pr.construction_year ?? '0') || 0, osm: osmYear(o?.start_date), osmName: o?.name,
    });
    const c0 = centroid(poly[0]);
    audit.push({ bin: pr.bin ?? '', address: lot?.address ?? '', name: d.name ?? o?.name ?? '', pluto: parseInt(lot?.yearbuilt ?? '0') || 0, footprint: parseInt(pr.construction_year ?? '0') || 0, osm: osmYear(o?.start_date), heightM: +height.toFixed(1), x: +c0[0].toFixed(0), z: +c0[1].toFixed(0), d });
    if (d.rule === '0') { stats.notBuildings++; continue; }
    if (d.rule === '5' && d.keep) stats.noYear++;
    if (!d.keep) { stats.removedPost1974++; standIns(poly, parseInt(pr.doitt_id ?? pr.objectid) || nextId, use); continue; }
    const year = d.year;
    if (d.heightOverride) height = d.heightOverride;
    const floors = d.heightOverride ? Math.round(d.heightOverride / 3.8) : Math.max(1, Math.round(parseFloat(lot?.numfloors ?? '0') || height / 3.6));
    if (polyArea(poly) < 4 && height < 3) continue; // sheds, kiosks
    buildings.push({
      id: nextId++, poly, height, minHeight: 0, year, use, floors, flags: 0,
      style: classify(year, use, floors, height, lot?.bldgclass ?? ''), bin: pr.bin,
    });
  }
}

// PLUTO lots with no footprint at all: buildings the footprint dataset is missing, towers too new to be
// in it yet, and today's vacant/parking lots. Each gets its 1974 treatment inside a lot rectangle built
// from PLUTO frontage x depth, oriented to its address street, minus any building already there.
{
  const usedBbl = new Set<string>();
  for (const f of footprints) { usedBbl.add(f.properties.mappluto_bbl); usedBbl.add(f.properties.base_bbl); }
  const near = (minX: number, minZ: number, maxX: number, maxZ: number) => buildings.filter((b) => { const bb = bbox(b.poly); return bb.maxX > minX && bb.minX < maxX && bb.maxZ > minZ && bb.minZ < maxZ; }).map((b) => b.poly);
  for (const r of plutoRows) {
    const bbl = String(Math.round(parseFloat(r.bbl)));
    if (usedBbl.has(bbl) || !r.latitude) continue;
    const [cx, cz] = project(parseFloat(r.longitude), parseFloat(r.latitude));
    if (!inRegion([cx, cz])) continue;
    const yr = parseInt(r.yearbuilt ?? '0') || 0, lu = parseInt(r.landuse ?? '0') || 0, fl = Math.round(parseFloat(r.numfloors ?? '0') || 0);
    const front = (parseFloat(r.lotfront) || 0) * FT, depth = (parseFloat(r.lotdepth) || 0) * FT;
    const row = (decision: string, keep: boolean, rule: string) => audit.push({ bin: `lot:${bbl}`, address: r.address ?? '', name: '', pluto: yr, footprint: 0, osm: 0, heightM: fl * 3.8, x: Math.round(cx), z: Math.round(cz), d: { keep, year: yr, rule, reason: decision, flagged: false } });
    if (lu === 9 || front < 4 || depth < 4 || front * depth < 40) { row('no-footprint lot skipped (open space or no lot dimensions)', false, 'L0'); continue; }
    const alongZ = !/STREET/.test(r.address ?? '') || /AVENUE|BROADWAY|PLAZA|SQUARE/.test(r.address ?? '');
    const hx = (alongZ ? depth : front) / 2, hz = (alongZ ? front : depth) / 2;
    const rect = rectPoly(cx - hx, cz - hz, cx + hx, cz + hz);
    const free = difference([rect], near(cx - hx, cz - hz, cx + hx, cz + hz)).map(cleanPoly).filter((p): p is Poly => !!p && polyArea(p) > 40);
    const freeArea = free.reduce((a, p) => a + polyArea(p), 0);
    if (freeArea < 0.3 * front * depth) { row('no-footprint lot already covered by neighbours', false, 'L0'); continue; }
    const seed = parseInt(bbl.slice(-6));
    if (yr > 0 && yr <= CUTOFF_YEAR && fl > 0) {
      for (const p of free) buildings.push({ id: nextId++, poly: p, height: fl * 3.8 + 1, minHeight: 0, year: yr, use: lu, floors: fl, style: classify(yr, lu, fl, fl * 3.8, r.bldgclass ?? ''), flags: 0 });
      stats.orphanBuildings++; row(`built ${yr}, ${fl} floors per PLUTO but missing from footprints: modelled from lot`, true, 'L1');
    } else if (yr > CUTOFF_YEAR || lu === 11) {
      for (const p of free) standIns(p, seed, lu); stats.orphanStandIns++;
      row(yr > CUTOFF_YEAR ? `built ${yr} (too new for footprints): period stand-in` : 'vacant today: period stand-in', false, 'L2');
    } else if (lu === 10) {
      lots.push(...free); stats.parkingLots++; row('parking lot today: kept as 1974 parking lot', false, 'L3');
    } else row('no-footprint lot, no 1974 evidence: left open', false, 'L0');
  }
}

// Restored 1974 buildings
for (const r of RESTORED_BUILDINGS) {
  const [cx, cz] = project(r.lon, r.lat);
  const poly = rectPoly(cx - r.sizeX / 2, cz - r.sizeZ / 2, cx + r.sizeX / 2, cz + r.sizeZ / 2);
  // remove anything overlapping today's (cleared) site
  for (let k = buildings.length - 1; k >= 0; k--) { if (pointInPoly(centroid(buildings[k].poly[0]), poly)) buildings.splice(k, 1); }
  buildings.push({ id: nextId++, poly: cleanPoly(poly)!, height: r.height, minHeight: 0, year: r.year, use: r.use, floors: r.floors, style: Style.PrewarOffice, flags: BuildingFlag.Restored, name: r.name });
  stats.restored++;
}

// OSM building:part replacement (setbacks on towers) and hero tagging
{
  const GRID = 50;
  const index = new Map<string, number[]>();
  buildings.forEach((b, k) => {
    const bb = bbox(b.poly);
    for (let gx = Math.floor(bb.minX / GRID); gx <= Math.floor(bb.maxX / GRID); gx++)
      for (let gz = Math.floor(bb.minZ / GRID); gz <= Math.floor(bb.maxZ / GRID); gz++) {
        const key = `${gx},${gz}`; (index.get(key) ?? index.set(key, []).get(key)!).push(k);
      }
  });
  const findContaining = (p: P) => (index.get(`${Math.floor(p[0] / GRID)},${Math.floor(p[1] / GRID)}`) ?? []).filter((k) => pointInPoly(p, buildings[k].poly));

  for (const hp of HERO_POINTS) for (const k of findContaining(project(hp.lon, hp.lat))) { buildings[k].flags |= BuildingFlag.Hero; buildings[k].name = hp.name; stats.heroes++; }
  const partsFor = new Map<number, { poly: Poly; height: number; minHeight: number }[]>();
  for (const w of ways) {
    const t = w.tags;
    const pts = wayPts(w);
    if (pts.length < 4) continue;
    if (t.name && HERO_NAMES.includes(t.name) && (t.building || t['building:part'] || t.leisure === 'stadium')) {
      for (const k of findContaining(centroid(pts))) if (!buildings[k].name) { buildings[k].flags |= BuildingFlag.Hero; buildings[k].name = t.name; stats.heroes++; }
    }
    if (!t['building:part'] || t['building:part'] === 'no') continue;
    if (osmYear(t.start_date) > CUTOFF_YEAR) { stats.droppedModernParts++; continue; } // e.g. a later rooftop addition
    const h = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.6 : NaN);
    if (!Number.isFinite(h)) continue;
    const minH = parseFloat(t.min_height) || (parseFloat(t['building:min_level']) ? parseFloat(t['building:min_level']) * 3.6 : 0);
    const poly = cleanPoly([pts]);
    if (!poly) continue;
    const host = findContaining(centroid(poly[0]));
    if (host.length !== 1) continue;
    // Never attach OSM parts to a stand-in or restored building: those parts describe the modern
    // building that was removed (e.g. Hudson Yards tower tiers landing on a 1910 loft stand-in).
    if (buildings[host[0]].flags & (BuildingFlag.StandIn | BuildingFlag.Restored)) { stats.partsOnStandIns++; continue; }
    (partsFor.get(host[0]) ?? partsFor.set(host[0], []).get(host[0])!).push({ poly, height: h, minHeight: minH });
  }
  const replaced = new Set<number>();
  const added: Bldg[] = [];
  for (const [k, parts] of partsFor) {
    const b = buildings[k];
    const distinct = new Set(parts.map((p) => Math.round(p.height))).size;
    if (process.env.DEBUG_BLDG && b.name === process.env.DEBUG_BLDG) log("debug", b.name, parts.length, distinct, polyArea(b.poly), parts.map((p) => [p.height, p.minHeight, polyArea(p.poly).toFixed(0)]));
    const fpArea = polyArea(b.poly);
    const cover = polyArea(union(parts.map((p) => p.poly))[0] ?? [[]]) / fpArea;
    if (parts.length < 2 || distinct < 2 || cover < 0.3) continue;
    replaced.add(k);
    // Podium: when the parts don't reach the ground everywhere (e.g. tagged only with min_level),
    // keep the real footprint up to the lowest part base.
    const groundCover = parts.filter((p) => p.minHeight === 0).reduce((s, p) => s + polyArea(p.poly), 0) / fpArea;
    if (groundCover < 0.9) {
      const podium = Math.min(...parts.filter((p) => p.minHeight > 0).map((p) => p.minHeight), b.height);
      added.push({ ...b, id: nextId++, height: podium, minHeight: 0, flags: b.flags | BuildingFlag.OsmPart });
    }
    const mine: Bldg[] = parts.map((p) => ({ ...b, id: nextId++, poly: p.poly, height: p.height, minHeight: p.minHeight, flags: b.flags | BuildingFlag.OsmPart }));
    const all = [...mine, ...added.filter((a) => a.bin === b.bin && a.minHeight === 0 && a.flags & BuildingFlag.OsmPart)];
    // No floating parts: if nothing beneath a raised part reaches its base (e.g. the lower tiers are
    // mapped as an OSM relation we skip), drop its base onto the highest supporting top, or the ground.
    for (const m of mine) {
      if (m.minHeight <= 0) continue;
      const c = centroid(m.poly[0]);
      const support = all.filter((o) => o !== m && o.height <= m.minHeight + 1 && pointInPoly(c, o.poly)).reduce((h, o) => Math.max(h, o.height), 0);
      if (support < m.minHeight - 1) { m.minHeight = support; stats.groundedParts++; }
    }
    added.push(...mine); stats.osmParts += mine.length;
  }
  const kept = buildings.filter((_, k) => !replaced.has(k));
  buildings.length = 0; buildings.push(...kept, ...added);
  log(`osm parts: ${replaced.size} footprints replaced by ${added.length} parts`);
}

// Global no-floating pass: every raised part (minHeight > 0) must be supported across its whole footprint,
// not just at its centroid. Sample the centroid and points near each vertex against ALL buildings; lower the
// base onto the weakest support (or the ground) so nothing hangs in the air (found: 1912 parts at 6th & 34th).
{
  const GRID = 50, index = new Map<string, number[]>();
  buildings.forEach((b, k) => { const bb = bbox(b.poly); for (let gx = Math.floor(bb.minX / GRID); gx <= Math.floor(bb.maxX / GRID); gx++) for (let gz = Math.floor(bb.minZ / GRID); gz <= Math.floor(bb.maxZ / GRID); gz++) { const key = `${gx},${gz}`; (index.get(key) ?? index.set(key, []).get(key)!).push(k); } });
  const supportAt = (p: P, self: number, below: number) => {
    let best = 0;
    for (const k of index.get(`${Math.floor(p[0] / GRID)},${Math.floor(p[1] / GRID)}`) ?? []) {
      if (k === self) continue; const o = buildings[k];
      if (o.height <= below + 1.5 && o.height > best && pointInPoly(p, o.poly)) best = o.height;
    }
    return best;
  };
  let lowered = 0;
  buildings.forEach((b, k) => {
    if (b.minHeight <= 0) return;
    const c = centroid(b.poly[0]);
    const samples: P[] = [c, ...b.poly[0].map(([x, z]) => [x + (c[0] - x) * 0.15, z + (c[1] - z) * 0.15] as P)];
    const weakest = Math.min(...samples.map((pt) => supportAt(pt, k, b.minHeight)));
    if (weakest < b.minHeight - 1.5) { b.minHeight = weakest; lowered++; }
  });
  stats.groundedParts += lowered;
  log(`no-floating pass: ${lowered} raised parts lowered onto their real support`);
}

// ------------------------------------------------------------------ streets (centrelines, 1974 directions)
const DRIVABLE = new Set(['motorway', 'motorway_link', 'trunk', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'residential', 'unclassified', 'living_street']);
interface Street { name: string; cls: string; width: number; oneway: number; pts: P[]; changed?: boolean }
const streets: Street[] = [];
const dirStats: Record<string, number> = {};
for (const w of ways) {
  const t = w.tags;
  let hw = t.highway;
  // Broadway plazas (2008-2010) were roadway in 1974.
  if (hw === 'pedestrian' && t.name === 'Broadway' && t.area !== 'yes') hw = 'secondary';
  if (!DRIVABLE.has(hw) || t.area === 'yes' || t.tunnel === 'yes' || t.layer && parseInt(t.layer) < 0) continue;
  const pts = wayPts(w);
  if (pts.length < 2 || !pts.some((p) => inRegion(p, 120))) continue;
  const name = t.name ?? '';
  // Direction in polyline order: +1 forward, -1 reverse, 0 two-way.
  let oneway = t.oneway === 'yes' || t.oneway === '1' ? 1 : t.oneway === '-1' ? -1 : 0;
  const era = AVENUE_DIRECTION_1974[name];
  let changed = false;
  if (era) {
    const dz = pts[pts.length - 1][1] - pts[0][1]; // negative => polyline runs uptown
    const runsNorth = dz < 0;
    // Two-way avenues keep OSM's tagging: divided carriageways are mapped as paired one-way ways.
    if (era.dir !== 'two') { const want = (era.dir === 'north') === runsNorth ? 1 : -1; changed = want !== oneway; oneway = want; }
  } else if (TWO_WAY_STREETS.test(name)) { changed = oneway !== 0; oneway = 0; }
  if (changed) dirStats[name] = (dirStats[name] ?? 0) + 1;
  streets.push({ name, cls: hw, width: roadwayWidth(name, hw), oneway, pts, changed });
}
log(`streets: ${streets.length}; 1974 direction overrides applied to`, dirStats);

// ------------------------------------------------------------------ ground polygons (per chunk)
const roadLines = streets.map((s) => ({ pts: s.pts, half: s.width / 2, bb: bbox([s.pts]) }));

// ------------------------------------------------------------------ road paint (1974 NYC markings)
// White dashed lane lines (10 ft dash / 30 ft gap) between lanes, double yellow on two-way streets,
// crosswalks as two parallel white lines (period style, not today's ladder bars). Dashes stop short of
// intersections. Strokes are split into <= 20 m pieces and assigned to chunks by midpoint.
const paintStrokes: WPaint[] = [];
{
  const key = (p: P) => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;
  const nodeUse = new Map<string, { p: P; legs: { dir: P; width: number }[] }>();
  for (const s of streets) s.pts.forEach((p, k) => {
    const e = nodeUse.get(key(p)) ?? nodeUse.set(key(p), { p, legs: [] }).get(key(p))!;
    for (const nb of [s.pts[k - 1], s.pts[k + 1]]) if (nb) { const dx = nb[0] - p[0], dz = nb[1] - p[1], L = Math.hypot(dx, dz) || 1; e.legs.push({ dir: [dx / L, dz / L], width: s.width }); }
  });
  const junctions = [...nodeUse.values()].filter((n) => n.legs.length >= 3);
  const jIndex = new Map<string, P[]>();
  for (const j of junctions) { const k = `${Math.floor(j.p[0] / 40)},${Math.floor(j.p[1] / 40)}`; (jIndex.get(k) ?? jIndex.set(k, []).get(k)!).push(j.p); }
  const nearJunction = (x: number, z: number, r: number) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of jIndex.get(`${Math.floor(x / 40) + a},${Math.floor(z / 40) + b}`) ?? []) if (Math.hypot(q[0] - x, q[1] - z) < r) return true; return false; };
  const DASH = 3.05, GAP = 9.15;
  for (const s of streets) {
    if (s.cls === 'motorway' || s.cls === 'motorway_link') continue;
    const lanes = Math.max(1, Math.round(s.width / 3.4)), laneW = s.width / lanes;
    const offsets: [number, number][] = []; // [offset, kind]
    if (s.oneway === 0) {
      offsets.push([-0.15, PaintKind.Yellow], [0.15, PaintKind.Yellow]);
      for (let k = 1; k < lanes / 2; k++) { offsets.push([k * laneW, PaintKind.LaneDash], [-k * laneW, PaintKind.LaneDash]); }
    } else for (let k = 1; k < lanes; k++) offsets.push([-s.width / 2 + k * laneW, PaintKind.LaneDash]);
    for (const [off, kind] of offsets) {
      let along = 0;
      for (let k = 1; k < s.pts.length; k++) {
        const a = s.pts[k - 1], b = s.pts[k]; const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz); if (L < 0.5) continue;
        const ux = dx / L, uz = dz / L, nx = -uz * off, nz = ux * off;
        const step = kind === PaintKind.Yellow ? 20 : DASH + GAP;
        for (let t = kind === PaintKind.Yellow ? 0 : (DASH + GAP) - (along % (DASH + GAP)); t < L; t += step) {
          const t1 = Math.min(L, t + (kind === PaintKind.Yellow ? 20 : DASH));
          const p0: P = [a[0] + ux * t + nx, a[1] + uz * t + nz], p1: P = [a[0] + ux * t1 + nx, a[1] + uz * t1 + nz];
          const mid: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
          if (!inRegion(mid) || nearJunction(mid[0], mid[1], s.width / 2 + 9)) continue;
          paintStrokes.push({ kind, width: 0.11, pts: [p0, p1] });
        }
        along += L;
      }
    }
  }
  // crosswalks: two parallel lines across each leg, set back past the cross street's curb
  for (const j of junctions) {
    if (!inRegion(j.p)) continue;
    const maxW = Math.max(...j.legs.map((l) => l.width));
    for (const leg of j.legs) {
      const half = leg.width / 2, nx = -leg.dir[1], nz = leg.dir[0];
      for (const d of [maxW / 2 + 1.2, maxW / 2 + 4.2]) {
        const cx = j.p[0] + leg.dir[0] * d, cz = j.p[1] + leg.dir[1] * d;
        paintStrokes.push({ kind: PaintKind.CrosswalkLine, width: 0.3, pts: [[cx - nx * half, cz - nz * half], [cx + nx * half, cz + nz * half]] });
      }
    }
  }
  log(`road paint: ${paintStrokes.length} strokes, ${junctions.length} junctions`);
}
const parks: Poly[] = [];
const PARK_TAGS = (t: any) => t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.leisure === 'playground';
for (const w of ways) {
  if (!PARK_TAGS(w.tags)) continue;
  const pts = wayPts(w); if (pts.length < 4) continue;
  const poly = cleanPoly([pts]); if (poly && pts.some((p) => inRegion(p, 50))) parks.push(poly);
}

// ------------------------------------------------------------------ assign to chunks & write
ensureDir(path.join(OUT, 'chunks'));
for (const f of fs.readdirSync(path.join(OUT, 'chunks'))) fs.unlinkSync(path.join(OUT, 'chunks', f));
const i0 = Math.floor(REGION.minX / CHUNK_SIZE), i1 = Math.floor((REGION.maxX - 1e-6) / CHUNK_SIZE);
const j0 = Math.floor(REGION.minZ / CHUNK_SIZE), j1 = Math.floor((REGION.maxZ - 1e-6) / CHUNK_SIZE);
const chunkBuildings = new Map<string, Bldg[]>();
for (const b of buildings) {
  const c = centroid(b.poly[0]);
  const key = chunkKey(Math.floor(c[0] / CHUNK_SIZE), Math.floor(c[1] / CHUNK_SIZE));
  (chunkBuildings.get(key) ?? chunkBuildings.set(key, []).get(key)!).push(b);
}

const toLocal = (poly: Poly, ox: number, oz: number): [number, number][][] => poly.map((r) => r.map(([x, z]) => [x - ox, z - oz] as [number, number]));
const signals: P[] = [], entrances: P[] = [];
for (const e of osm) if (e.type === 'node' && e.tags) {
  if (e.tags.highway === 'traffic_signals') signals.push(nodes.get(e.id)!);
  else if (e.tags.railway === 'subway_entrance') entrances.push(nodes.get(e.id)!);
}

const chunkIndex: any[] = [];
let totalBytes = 0;
const t0 = Date.now();
for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
  const minX = Math.max(i * CHUNK_SIZE, REGION.minX), maxX = Math.min((i + 1) * CHUNK_SIZE, REGION.maxX);
  const minZ = Math.max(j * CHUNK_SIZE, REGION.minZ), maxZ = Math.min((j + 1) * CHUNK_SIZE, REGION.maxZ);
  const ox = (i + 0.5) * CHUNK_SIZE, oz = (j + 0.5) * CHUNK_SIZE;
  const rect = rectPoly(minX, minZ, maxX, maxZ);
  const near = roadLines.filter((r) => r.bb.maxX + r.half > minX && r.bb.minX - r.half < maxX && r.bb.maxZ + r.half > minZ && r.bb.minZ - r.half < maxZ);
  const roads = intersect(bufferLines(near), [rect]);
  const parkHere = difference(intersect(union(parks), [rect]), roads);
  const lotsHere = lots.filter((l) => { const c = centroid(l[0]); return c[0] >= minX && c[0] < maxX && c[1] >= minZ && c[1] < maxZ; });
  const sidewalks = difference([rect], [...roads, ...parkHere]);
  const ground: WGround[] = [];
  const pushG = (kind: number, list: Poly[]) => { for (const p of list) { const c = cleanPoly(p); if (c) ground.push({ kind, rings: toLocal(c, ox, oz) }); } };
  pushG(GroundKind.Road, roads); pushG(GroundKind.Sidewalk, sidewalks); pushG(GroundKind.Park, parkHere); pushG(GroundKind.Lot, lotsHere);

  const bl = (chunkBuildings.get(chunkKey(i, j)) ?? []).map<WBuilding>((b) => ({
    id: b.id, year: b.year, use: b.use, style: b.style, floors: b.floors, flags: b.flags, height: b.height, minHeight: b.minHeight, rings: toLocal(b.poly, ox, oz),
  }));
  const inChunk = (p: P) => p[0] >= minX && p[0] < maxX && p[1] >= minZ && p[1] < maxZ;
  const pois: WPoi[] = [
    ...signals.filter(inChunk).map((p) => ({ kind: PoiKind.Signal, x: p[0] - ox, z: p[1] - oz, heading: 0 })),
    ...entrances.filter(inChunk).map((p) => ({ kind: PoiKind.SubwayEntrance, x: p[0] - ox, z: p[1] - oz, heading: 0 })),
  ];
  const paintHere = paintStrokes.filter((st) => { const m: P = [(st.pts[0][0] + st.pts[st.pts.length - 1][0]) / 2, (st.pts[0][1] + st.pts[st.pts.length - 1][1]) / 2]; return m[0] >= minX && m[0] < maxX && m[1] >= minZ && m[1] < maxZ; })
    .map((st) => ({ ...st, pts: st.pts.map(([x, z]) => [x - ox, z - oz] as [number, number]) }));
  const bytes = writeChunk(i, j, bl, ground, pois, paintHere);
  fs.writeFileSync(path.join(OUT, 'chunks', `${chunkKey(i, j)}.bin`), bytes);
  totalBytes += bytes.length;
  const maxH = bl.reduce((m, b) => Math.max(m, b.height), 0);
  chunkIndex.push({ i, j, key: chunkKey(i, j), bytes: bytes.length, buildings: bl.length, maxHeight: +maxH.toFixed(1) });
}
log(`wrote ${chunkIndex.length} chunks, ${(totalBytes / 1024).toFixed(0)} KiB total in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// ------------------------------------------------------------------ skyline layer (outside region)
const skylineAudit = { kept: 0, removed: 0, keptTall: [] as string[], removedTall: [] as string[] };
{
  const w = new ByteWriter();
  let count = 0;
  const countAt = w.o; w.u32(0);
  const emitBox = (cx: number, cz: number, sx: number, sz: number, rot: number, h: number) => {
    w.i16(Math.round(cx / 2)); w.i16(Math.round(cz / 2)); w.u16(Math.round(sx * 10)); w.u16(Math.round(sz * 10)); w.i16(Math.round(rot * 1000)); w.u16(Math.round(h * 10)); count++;
  };
  const plutoTall = new Map<string, any>();
  for (const r of JSON.parse(fs.readFileSync(path.join(RAW, 'pluto_tall.json'), 'utf8'))) plutoTall.set(String(Math.round(parseFloat(r.bbl))), r);
  for (const f of skylineRaw) {
    const pr = f.properties;
    if (!f.geometry) continue;
    const lot = plutoTall.get(pr.mappluto_bbl ?? '') ?? plutoTall.get(pr.base_bbl ?? '');
    const d = dateBuilding({ bin: pr.bin, featureCode: pr.feature_code, status: pr.last_status_type, heightM: parseFloat(pr.height_roof) * FT, pluto: parseInt(lot?.yearbuilt ?? '0') || 0, footprint: parseInt(pr.construction_year ?? '0') || 0 });
    skylineAudit[d.keep ? 'kept' : 'removed']++;
    if (!d.keep) { if (parseFloat(pr.height_roof) * FT > 150) skylineAudit.removedTall.push(`${lot?.address ?? pr.bin} ${(parseFloat(pr.height_roof) * FT).toFixed(0)} m: ${d.reason}`); continue; }
    if (parseFloat(pr.height_roof) * FT > 200) skylineAudit.keptTall.push(`${lot?.address ?? pr.bin} ${(parseFloat(pr.height_roof) * FT).toFixed(0)} m, ${d.year}`);
    const coords = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0];
    const ring: P[] = coords.map(([lon, lat]: number[]) => project(lon, lat));
    const c = centroid(ring);
    if (inRegion(c, -5)) continue;
    const bb = bbox([ring]);
    emitBox(c[0], c[1], bb.maxX - bb.minX, bb.maxZ - bb.minZ, 0, parseFloat(pr.height_roof) * FT);
  }
  for (const s of SKYLINE_ADDITIONS) {
    const [x, z] = project(s.lon, s.lat);
    if (inRegion([x, z])) continue; // now modelled in full detail (e.g. the Pan Am Building since pipeline v2)
    const sx = (s as { sizeX?: number }).sizeX ?? s.size, sz = (s as { sizeZ?: number }).sizeZ ?? s.size;
    emitBox(x, z, sx, sz, ((s.heading - GRID_ROTATION_DEG) * Math.PI) / 180, s.height);
  }
  w.setU32(countAt, count);
  fs.writeFileSync(path.join(OUT, 'skyline.bin'), w.bytes());
  log(`skyline: ${count} boxes`);
}

// ------------------------------------------------------------------ world manifest + streets
const flat = buildings.find((b) => b.name === 'Flatiron Building');
let spawn = { x: 0, z: 0, heading: 0 };
if (flat) {
  // North tip of the Flatiron = the vertex with minimum z; stand on the sidewalk 6 m north of it.
  const tip = flat.poly[0].reduce((m, p) => (p[1] < m[1] ? p : m));
  spawn = { x: +tip[0].toFixed(2), z: +(tip[1] - 3).toFixed(2), heading: 0 };
}
// Broadway's local bearing at the spawn, so the player faces up Broadway rather than up Fifth.
{
  let best: { d: number; dir: P } | null = null;
  for (const s of streets) if (s.name === 'Broadway') for (let k = 1; k < s.pts.length; k++) {
    const a = s.pts[k - 1], b = s.pts[k];
    const mid: P = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const d = Math.hypot(mid[0] - spawn.x, mid[1] - spawn.z);
    if (mid[1] < spawn.z && (!best || d < best.d)) { const dir: P = b[1] < a[1] ? [b[0] - a[0], b[1] - a[1]] : [a[0] - b[0], a[1] - b[1]]; best = { d, dir }; }
  }
  if (best) spawn.heading = +Math.atan2(-best.dir[0], -best.dir[1]).toFixed(4); // yaw: 0 = -Z (uptown), positive turns toward -X
}
// Terrain height field (always generated; runtime use is gated by TERRAIN_ENABLED in src/shared/terrain.ts)
{
  const t0t = Date.now();
  const terr = buildTerrain(footprints, [spawn.x, spawn.z]);
  fs.writeFileSync(path.join(OUT, 'terrain.bin'), encodeTerrain(terr));
  let lo = Infinity, hi = -Infinity;
  for (const v of terr.h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  log(`terrain: ${terr.nx}x${terr.nz} @ ${terr.cell} m, spawn NAVD88 ${terr.base.toFixed(1)} m, relief ${lo.toFixed(1)}..${hi.toFixed(1)} m, ${terrainRejected} outlier samples dropped (${((Date.now() - t0t) / 1000).toFixed(1)} s)`);
}
// Hero facade styles (hand-tuned treatments in FacadeMaterial / props)
const HERO_STYLE: Record<string, number> = {
  'Empire State Building': Style.HeroDeco, 'Flatiron Building': Style.HeroBeaux, 'Metropolitan Life Insurance Company Tower': Style.HeroBeaux,
  'New York Life Building': Style.HeroBeaux, 'Hotel Chelsea': Style.HeroChelsea,
};
for (const b of buildings) if (b.name && HERO_STYLE[b.name] !== undefined) b.style = HERO_STYLE[b.name];
const heroMap = new Map<string, { name: string; ids: number[]; x: number; z: number; height: number; area: number }>();
for (const b of buildings) if (b.flags & BuildingFlag.Hero && b.name) {
  const c = centroid(b.poly[0]); const a = polyArea(b.poly);
  const h = heroMap.get(b.name) ?? heroMap.set(b.name, { name: b.name, ids: [], x: 0, z: 0, height: 0, area: 0 }).get(b.name)!;
  h.ids.push(b.id); h.height = Math.max(h.height, +b.height.toFixed(1));
  if (b.minHeight === 0 && a > h.area) { h.area = a; h.x = +c[0].toFixed(1); h.z = +c[1].toFixed(1); }
}
const heroes = [...heroMap.values()].map(({ area: _a, ...h }) => h);
// Period regression gate (audio request 10): nothing in the modelled city may exceed 260 m except the
// Empire State Building. Modern tower heights leaking in (e.g. via OSM parts) fail the build.
{
  const offenders = buildings.filter((b) => b.height > 260 && b.name !== 'Empire State Building');
  if (offenders.length) {
    for (const o of offenders) log('PERIOD GATE FAIL', o.id, o.height.toFixed(0), 'm', o.year, centroid(o.poly[0]).map((v) => v.toFixed(0)).join(','));
    throw new Error(`period gate: ${offenders.length} building(s) taller than 260 m (see log)`);
  }
  log('period gate: ok (tallest non-ESB', Math.max(...buildings.filter((b) => b.name !== 'Empire State Building').map((b) => b.height)).toFixed(0), 'm)');
}
const world = {
  format: 'T74C', version: 1, generatedFrom: JSON.parse(fs.readFileSync(path.join(RAW, 'manifest.json'), 'utf8')),
  region: REGION, chunkSize: CHUNK_SIZE, gridRotationDeg: GRID_ROTATION_DEG,
  chunks: chunkIndex, spawn, heroes, stats: { ...stats, finalBuildings: buildings.length },
  attribution: '© OpenStreetMap contributors (ODbL) · NYC Open Data: Building Footprints, PLUTO (NYC DCP/DoITT)',
};
fs.writeFileSync(path.join(OUT, 'world.json'), JSON.stringify(world));
const r1 = (v: number) => Math.round(v * 10) / 10;
fs.writeFileSync(path.join(OUT, 'streets.json'), JSON.stringify(streets.map((s) => ({ n: s.name, c: s.cls, w: s.width, o: s.oneway, p: s.pts.flatMap(([x, z]) => [r1(x), r1(z)]) }))));
log('stats', world.stats);
log('spawn', spawn, 'heroes', heroes.map((h) => `${h.name} (${h.ids.length} parts, ${h.height} m)`));

// ------------------------------------------------------------------ period audit (committed: docs/period_audit.csv)
{
  const inReg = audit.filter((r) => inRegion([r.x, r.z]));
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = 'bin,address,name,pluto_year,footprint_year,osm_year,height_m,x,z,decision,rule,flagged,reason';
  const lines = inReg.sort((a, b) => b.heightM - a.heightM).map((r) => [r.bin, r.address, r.name, r.pluto || '', r.footprint || '', r.osm || '', r.heightM, r.x, r.z, r.d.keep ? 'keep' : 'remove', r.d.rule, r.d.flagged ? 'yes' : '', r.d.reason].map(esc).join(','));
  ensureDir(path.join(ROOT, 'docs'));
  fs.writeFileSync(path.join(ROOT, 'docs/period_audit.csv'), [head, ...lines].join('\n') + '\n');
  const by = (f: (r: AuditRow) => boolean) => inReg.filter(f).length;
  const summary = {
    footprintsInRegion: inReg.length,
    kept: by((r) => r.d.keep), removed: by((r) => !r.d.keep && r.d.rule !== '0'), notBuildings: by((r) => r.d.rule === '0'),
    flaggedForReview: by((r) => r.d.flagged), overrides: by((r) => r.d.rule === '1'),
    byRule: Object.fromEntries(['0', '1', '2', '2b', '2c', '3', '3b', '4', '5', 'L0', 'L1', 'L2', 'L3'].map((k) => [k, by((r) => r.d.rule === k)])),
    skyline: { kept: skylineAudit.kept, removed: skylineAudit.removed },
  };
  fs.writeFileSync(path.join(ROOT, 'docs/period_audit_summary.json'), JSON.stringify({ summary, skylineKeptOver200m: skylineAudit.keptTall.sort(), skylineRemovedOver150m: skylineAudit.removedTall.sort() }, null, 2));
  log('period audit', summary);
}
