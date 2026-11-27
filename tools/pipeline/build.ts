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
  type WBuilding, type WGround, type WPoi, type WPaint, type DoorRecC, type DoorStyle,
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

// Overlap pass (user report 2026-11-26, iPhone: "the building is weird"). Footprints from different sources
// can overlap in volume (758 pairs): both drew walls and window grids in the same place, and the grids fought.
// Taller buildings win: each lower building that a taller one covers from its base up is clipped by it.
// Exact duplicates vanish; partial overlaps leave the lower building's real remainder.
{
  const GRID = 50, index = new Map<string, number[]>();
  const add = (k: number) => { const bb = bbox(buildings[k].poly); for (let gx = Math.floor(bb.minX / GRID); gx <= Math.floor(bb.maxX / GRID); gx++) for (let gz = Math.floor(bb.minZ / GRID); gz <= Math.floor(bb.maxZ / GRID); gz++) { const key = `${gx},${gz}`; (index.get(key) ?? index.set(key, []).get(key)!).push(k); } };
  buildings.forEach((_b, k) => add(k));
  const order = buildings.map((_b, k) => k).sort((a, b) => buildings[b].height - buildings[a].height || polyArea(buildings[b].poly) - polyArea(buildings[a].poly));
  const rank = new Map(order.map((k, r) => [k, r]));
  let clipped = 0, removed = 0, pieces = 0; const drop = new Set<number>(); const extra: Bldg[] = [];
  for (const k of order) {
    const b = buildings[k]; const bb = bbox(b.poly); const cutters: Poly[] = []; const seen = new Set<number>();
    for (let gx = Math.floor(bb.minX / GRID); gx <= Math.floor(bb.maxX / GRID); gx++) for (let gz = Math.floor(bb.minZ / GRID); gz <= Math.floor(bb.maxZ / GRID); gz++) for (const o of index.get(`${gx},${gz}`) ?? []) {
      if (o === k || seen.has(o) || drop.has(o) || rank.get(o)! > rank.get(k)!) continue; seen.add(o);
      const a = buildings[o];
      if (a.minHeight > b.minHeight + 1) continue; // a starts above b's base: clipping would leave a hole under it
      if (Math.min(a.height, b.height) <= Math.max(a.minHeight, b.minHeight) + 1) continue; // no vertical overlap
      const ob = bbox(a.poly); if (ob.maxX <= bb.minX || ob.minX >= bb.maxX || ob.maxZ <= bb.minZ || ob.minZ >= bb.maxZ) continue;
      cutters.push(a.poly);
    }
    if (!cutters.length) continue;
    const before = polyArea(b.poly);
    const rest = difference([b.poly], cutters).map((q) => cleanPoly(q)).filter((q): q is Poly => !!q && polyArea(q) >= 4).sort((x, y) => polyArea(y) - polyArea(x));
    const after = rest.reduce((sum, q) => sum + polyArea(q), 0);
    if (after > before - 0.5) continue; // touching only
    if (!rest.length) { drop.add(k); removed++; continue; }
    clipped++; b.poly = rest[0];
    for (const q of rest.slice(1)) { extra.push({ ...b, id: nextId++, poly: q, name: undefined, flags: b.flags & ~BuildingFlag.Hero }); pieces++; }
  }
  const kept = buildings.filter((_b, k) => !drop.has(k));
  buildings.length = 0; buildings.push(...kept, ...extra);
  log(`overlap pass: ${clipped} buildings clipped by taller neighbours, ${removed} duplicates removed, ${pieces} split pieces`);
}

// Floor sanity (same report: some windows looked ~3 m wide). Floor-to-floor height comes from height / floors,
// but source floor counts are sometimes wrong for the modelled height. Outside period-plausible ranges per
// style, floors are re-derived from the height and the style's typical floor-to-floor.
{
  const TYPICAL: Record<number, [number, number, number]> = { // [min, typical, max] metres
    0: [2.8, 3.5, 4.6], 1: [2.8, 3.2, 3.8], 2: [3.4, 4.4, 5.4], 3: [3.2, 4.0, 5.0], 4: [3.2, 3.8, 4.6], 5: [3.2, 3.7, 4.4],
    6: [2.7, 3.0, 3.8], 7: [3.0, 4.0, 5.5], 8: [3.0, 5.0, 9.0], 9: [3.3, 3.75, 4.2], 10: [3.3, 4.0, 4.8], 11: [3.2, 3.6, 4.2],
  };
  let fixed = 0;
  for (const b of buildings) {
    const [lo, typ, hi] = TYPICAL[b.style] ?? TYPICAL[0];
    const h = b.height - b.minHeight; const f = b.floors > 0 ? h / b.floors : 0;
    if (f < lo || f > hi) { b.floors = Math.max(1, Math.round(h / typ)); fixed++; }
  }
  log(`floor sanity: ${fixed} buildings re-derived floors from height (period floor-to-floor by style)`);
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

// ------------------------------------------------------------------ park paths, trees, park furniture
// User: "Also trees. Madison square park is bare". OSM here has no tree nodes, so trees are generated:
//  - parks: blue-noise sampled inside the real park polygons, clear of the real path layout (OSM footways),
//    mature London planes and elms (June canopy), denser and wilder in Bryant Park (1974: overgrown);
//  - street trees: sparse, residential side streets only (tenement frontage), none on the avenues (DOCUMERICA);
//  - furniture: benches and lamp posts along park paths, iron railings along park edges.
// Park paths become paved ground (GroundKind.Plaza) so lawns and walks read. Output: public/data/parks.json.
const parkUnion = union(parks);
const parkPathLines: { pts: P[]; half: number }[] = [];
for (const w of ways) {
  const hw = w.tags?.highway; if (hw !== 'footway' && hw !== 'path' && hw !== 'pedestrian' && hw !== 'steps') continue;
  const pts = wayPts(w); if (pts.length < 2 || !pts.some((p) => inRegion(p, 50))) continue;
  const insideShare = pts.filter((p) => parkUnion.some((q) => pointInPoly(p, q))).length / pts.length;
  if (insideShare >= 0.5) parkPathLines.push({ pts, half: hw === 'pedestrian' ? 2.5 : 1.6 });
}
const parkPaths = parkPathLines.length ? intersect(bufferLines(parkPathLines), parkUnion) : [];
const parksJson = { trees: [] as number[][], benches: [] as number[][], lamps: [] as number[][], rails: [] as number[][] };
{
  const rnd = (a: number, b: number) => { let h = Math.imul(Math.round(a * 10) ^ Math.imul(Math.round(b * 10), 0x27d4eb2d), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const inAny = (p: P, list: Poly[]) => list.some((q) => pointInPoly(p, q));
  const clearOfPaths = parkPathLines.length ? union(bufferLines(parkPathLines.map((l) => ({ ...l, half: l.half + 1.8 })))) : [];
  const pathBuf = parkPathLines.length ? union(bufferLines(parkPathLines)) : [];
  const bldIndex = new Map<string, number[]>(); const G = 50;
  buildings.forEach((b, k) => { const bb = bbox(b.poly); for (let gx = Math.floor(bb.minX / G); gx <= Math.floor(bb.maxX / G); gx++) for (let gz = Math.floor(bb.minZ / G); gz <= Math.floor(bb.maxZ / G); gz++) { const key = `${gx},${gz}`; (bldIndex.get(key) ?? bldIndex.set(key, []).get(key)!).push(k); } });
  const nearBld = (p: P) => bldIndex.get(`${Math.floor(p[0] / G)},${Math.floor(p[1] / G)}`) ?? [];
  const inBuilding = (p: P) => nearBld(p).some((k) => pointInPoly(p, buildings[k].poly));
  // park trees: jittered grid (blue-noise-like), spacing by park
  for (const park of parkUnion) {
    const bb = bbox(park); if (!inRegion([(bb.minX + bb.maxX) / 2, (bb.minZ + bb.maxZ) / 2], 50)) continue;
    const area = polyArea(park); if (area < 150) continue;
    const c = centroid(park[0]);
    const bryant = Math.hypot(c[0] + 1060, c[1] + 1420) < 220; // overgrown in 1974: denser
    const sp = bryant ? 7.5 : area > 8000 ? 9.5 : 11;
    for (let x = bb.minX + sp / 2; x < bb.maxX; x += sp) for (let z = bb.minZ + sp / 2; z < bb.maxZ; z += sp) {
      const p: P = [x + (rnd(x, z) - 0.5) * sp * 0.8, z + (rnd(z, x) - 0.5) * sp * 0.8];
      if (!pointInPoly(p, park) || inAny(p, clearOfPaths) || inBuilding(p) || rnd(p[0] * 3, p[1]) < 0.12) continue;
      const kind = rnd(p[1] * 7, p[0]) < (bryant ? 0.85 : 0.7) ? 0 : 1; // 0 London plane, 1 elm
      const h = (kind === 0 ? 15 : 17) + rnd(p[0], p[1] * 5) * 7, r = 4.5 + rnd(p[1], p[0] * 5) * 3.5;
      parksJson.trees.push([+p[0].toFixed(1), +p[1].toFixed(1), +h.toFixed(1), +r.toFixed(1), kind, 0]);
    }
    // railing along the park edge (gaps where paths leave the park)
    for (const ring of park) for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b2 = ring[(k + 1) % ring.length]; const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (L < 2) continue;
      const steps = Math.max(1, Math.round(L / 6));
      for (let q = 0; q < steps; q++) {
        const t0 = q / steps, t1 = (q + 1) / steps;
        const p0: P = [a[0] + (b2[0] - a[0]) * t0, a[1] + (b2[1] - a[1]) * t0], p1: P = [a[0] + (b2[0] - a[0]) * t1, a[1] + (b2[1] - a[1]) * t1];
        const m: P = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        if (inAny(m, pathBuf) || !inRegion(m)) continue;
        parksJson.rails.push([+p0[0].toFixed(2), +p0[1].toFixed(2), +p1[0].toFixed(2), +p1[1].toFixed(2)]);
      }
    }
  }
  // benches and lamps along park paths
  for (const l of parkPathLines) {
    let carry = 6, lampCarry = 12, side = 1;
    for (let k = 1; k < l.pts.length; k++) {
      const a = l.pts[k - 1], b2 = l.pts[k]; const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (L < 0.5) continue;
      const ux = (b2[0] - a[0]) / L, uz = (b2[1] - a[1]) / L, nx = -uz, nz = ux;
      for (let t = carry; t < L; t += 12) {
        const off = l.half + 0.7, p: P = [a[0] + ux * t + nx * off * side, a[1] + uz * t + nz * off * side];
        if (inAny(p, parkUnion) && !inBuilding(p) && inRegion(p)) parksJson.benches.push([+p[0].toFixed(2), +p[1].toFixed(2), +Math.atan2(nx * side, nz * side).toFixed(3)]);
        side = -side; carry = t + 12 - L;
      }
      if (carry < 0) carry = 6;
      for (let t = lampCarry; t < L; t += 26) {
        const p: P = [a[0] + ux * t + nx * (l.half + 0.4), a[1] + uz * t + nz * (l.half + 0.4)];
        if (inAny(p, parkUnion) && inRegion(p)) parksJson.lamps.push([+p[0].toFixed(2), +p[1].toFixed(2)]);
        lampCarry = t + 26 - L;
      }
      if (lampCarry < 0) lampCarry = 12;
    }
  }
  // street trees: sparse, residential side streets (tenement frontage within 12 m), none on avenues
  let street = 0;
  for (const st of streets) {
    if (!st.name || /Avenue|Broadway|Place|Plaza|Highway|Drive/.test(st.name) || st.cls === 'motorway') continue;
    for (const side of [-1, 1]) {
      let along = 0;
      for (let k = 1; k < st.pts.length; k++) {
        const a = st.pts[k - 1], b2 = st.pts[k]; const L = Math.hypot(b2[0] - a[0], b2[1] - a[1]); if (L < 1) continue;
        const ux = (b2[0] - a[0]) / L, uz = (b2[1] - a[1]) / L, nx = -uz * side, nz = ux * side;
        for (let t = 14; t < L - 14; t += 9) {
          const block = Math.floor((along + t) / 70);
          if (rnd(block * 13 + side, st.pts[0][0] + st.pts[0][1]) > 0.35) continue; // ~1 block in 3 has trees
          const off = st.width / 2 + 1.0, p: P = [a[0] + ux * t + nx * off, a[1] + uz * t + nz * off];
          if (!inRegion(p) || inBuilding(p) || inAny(p, parkUnion)) continue;
          const probe: P = [p[0] + nx * 8, p[1] + nz * 8];
          if (!nearBld(probe).some((q) => buildings[q].style === 1 && pointInPoly(probe, buildings[q].poly))) continue; // tenement frontage
          if (rnd(p[0] * 11, p[1]) < 0.3) continue; // gaps: dead or missing trees
          const kind = rnd(p[1] * 3, p[0]) < 0.6 ? 0 : 2; // plane or honey locust, young and thin
          parksJson.trees.push([+p[0].toFixed(1), +p[1].toFixed(1), +(7 + rnd(p[0], p[1]) * 4).toFixed(1), +(2.2 + rnd(p[1], p[0]) * 1.6).toFixed(1), kind, rnd(p[0] * 5, p[1] * 5) < 0.4 ? 1 : 0]);
          street++;
        }
        along += L;
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'parks.json'), JSON.stringify(parksJson));
  log(`parks: ${parksJson.trees.length - street} park trees, ${street} street trees, ${parksJson.benches.length} benches, ${parksJson.lamps.length} lamps, ${parksJson.rails.length} railing spans, ${parkPaths.length} path polygons`);
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

// ------------------------------------------------------------------ wall occlusion bake (sky openness per wall)
// For every wall edge: cast three horizontal rays (-30, 0, +30 deg) from its midpoint along the outward
// normal; record the mean distance to the facing wall and the facing building's height. The facade shader
// turns (distance, height, own y) into the elevation angle of the facing skyline = canyon occlusion.
const AO_CELL = 25, AO_MAX = 127;
const aoGrid = new Map<string, { x0: number; z0: number; x1: number; z1: number; h: number }[]>();
for (const b of buildings) for (const r of b.poly) for (let k = 0; k < r.length; k++) {
  const a = r[k], c = r[(k + 1) % r.length];
  const e = { x0: a[0], z0: a[1], x1: c[0], z1: c[1], h: b.height };
  const ia0 = Math.floor(Math.min(a[0], c[0]) / AO_CELL), ia1 = Math.floor(Math.max(a[0], c[0]) / AO_CELL);
  const ja0 = Math.floor(Math.min(a[1], c[1]) / AO_CELL), ja1 = Math.floor(Math.max(a[1], c[1]) / AO_CELL);
  for (let ii = ia0; ii <= ia1; ii++) for (let jj = ja0; jj <= ja1; jj++) { const key = `${ii},${jj}`; (aoGrid.get(key) ?? aoGrid.set(key, []).get(key)!).push(e); }
}
function aoRay(px: number, pz: number, dx: number, dz: number): [number, number] {
  let best = AO_MAX, h = 0; const seen = new Set<object>();
  for (let t = 0; t <= AO_MAX + AO_CELL; t += AO_CELL / 2) {
    const key = `${Math.floor((px + dx * t) / AO_CELL)},${Math.floor((pz + dz * t) / AO_CELL)}`;
    for (const e of aoGrid.get(key) ?? []) {
      if (seen.has(e)) continue; seen.add(e);
      const ex = e.x1 - e.x0, ez = e.z1 - e.z0, den = dx * ez - dz * ex; if (Math.abs(den) < 1e-9) continue;
      const wx = e.x0 - px, wz = e.z0 - pz;
      const tt = (wx * ez - wz * ex) / den, s = (wx * dz - wz * dx) / den;
      if (tt > 0.05 && tt < best && s >= 0 && s <= 1) { best = tt; h = e.h; }
    }
    if (best < t) break;
  }
  return [best, h];
}
function wallAO(b: Bldg): [number, number][][] {
  return b.poly.map((r) => {
    let area = 0; for (let k = 0; k < r.length; k++) { const a = r[k], c = r[(k + 1) % r.length]; area += a[0] * c[1] - c[0] * a[1]; }
    return r.map((a, k) => {
      const c = r[(k + 1) % r.length]; const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz); if (L < 1e-3) return [AO_MAX, 0] as [number, number];
      let nx = dz / L, nz = -dx / L; if (!(area > 0)) { nx = -nx; nz = -nz; } // same convention as meshBuilder.extrude
      const mx = (a[0] + c[0]) / 2 + nx * 0.3, mz = (a[1] + c[1]) / 2 + nz * 0.3;
      let dSum = 0, hMax = 0;
      for (const ang of [-0.52, 0, 0.52]) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        const [d, h] = aoRay(mx, mz, nx * ca - nz * sa, nz * ca + nx * sa);
        dSum += d * Math.cos(ang); if (d < AO_MAX) hMax = Math.max(hMax, h);
      }
      return [dSum / 3, hMax] as [number, number];
    });
  });
}
{
  const t = Date.now(); let n = 0;
  for (const b of buildings) { (b as any).ao = wallAO(b); n++; }
  log(`wall occlusion baked for ${n} buildings in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

// ------------------------------------------------------------------ doors (one per building, on the street frontage)
// User: "not sure if we have doors in all the buildings". Every building gets a door on its longest wall that
// faces open space, centred on the facade grid's nearest bay (src/shared/facade.ts), in a period style by
// building type. Same fields as interiors' DoorRec; interiors' doorsForChunk replaces these at its merge.
const doorOf = new Map<number, DoorRecC>();
{
  const GRID = 50, index = new Map<string, number[]>();
  buildings.forEach((b, k) => { const bb = bbox(b.poly); for (let gx = Math.floor(bb.minX / GRID); gx <= Math.floor(bb.maxX / GRID); gx++) for (let gz = Math.floor(bb.minZ / GRID); gz <= Math.floor(bb.maxZ / GRID); gz++) { const key = `${gx},${gz}`; (index.get(key) ?? index.set(key, []).get(key)!).push(k); } });
  const open = (p: P) => !(index.get(`${Math.floor(p[0] / GRID)},${Math.floor(p[1] / GRID)}`) ?? []).some((k) => pointInPoly(p, buildings[k].poly));
  const rnd = (id: number, k: number) => { let h = Math.imul(id ^ (k * 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const DIMS: Record<string, [number, number]> = { shop: [1.0, 2.3], shop_recessed: [1.0, 2.3], stoop: [1.1, 2.5], vestibule: [1.1, 2.4], brass_double: [1.8, 2.7], revolving: [2.2, 2.6], freight: [3.0, 3.2], church: [1.8, 3.0] };
  const BAY: Record<number, number> = { 9: 1.55, 10: 1.8, 11: 2.4, 1: 2.6, 2: 3.3, 3: 3.3, 6: 1.9 };
  let n = 0;
  for (const b of buildings) {
    if (b.minHeight > 0 || polyArea(b.poly) < 20 || b.height < 2.5) continue;
    const r = b.poly[0]; const N = r.length;
    const along: number[] = [0]; for (let k = 0; k < N; k++) { const a = r[k], c = r[(k + 1) % N]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); along.push(along[k] + (L < 1e-3 ? 0 : L)); }
    let best = -1, bestL = 0, bn: P = [0, 0];
    for (let k = 0; k < N; k++) {
      const a = r[k], c = r[(k + 1) % N]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 3.2 || L <= bestL) continue;
      let nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L; const m: P = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      if (pointInRing([m[0] + nx * 0.4, m[1] + nz * 0.4], r)) { nx = -nx; nz = -nz; }
      if (!open([m[0] + nx * 4, m[1] + nz * 4]) || !open([m[0] + nx * 1.5, m[1] + nz * 1.5])) continue;
      best = k; bestL = L; bn = [nx, nz];
    }
    if (best < 0) continue;
    const st = b.style, big = b.height > 80;
    const style: DoorStyle = b.flags & BuildingFlag.Hero ? (b.name === 'Empire State Building' ? 'revolving' : 'brass_double')
      : st === 1 ? (rnd(b.id, 1) < 0.55 ? 'stoop' : 'vestibule')
      : st === 2 || st === 3 ? (rnd(b.id, 2) < 0.3 ? 'freight' : 'shop')
      : st === 4 || st === 5 ? (big && rnd(b.id, 3) < 0.4 ? 'revolving' : 'brass_double')
      : st === 6 ? 'brass_double' : st === 8 ? 'church' : rnd(b.id, 4) < 0.5 ? 'shop' : 'shop_recessed';
    const [w, h] = DIMS[style];
    const a = r[best], c = r[(best + 1) % N]; const L = bestL, ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L;
    const bay = BAY[st] ?? 2.45, mid = along[best] + L / 2;
    let sAlong = (Math.round(mid / bay - 0.5) + 0.5) * bay - along[best]; // centre of the nearest bay
    sAlong = Math.min(L - w / 2 - 0.3, Math.max(w / 2 + 0.3, sAlong));
    const x = a[0] + ux * sAlong, z = a[1] + uz * sAlong;
    // The Deuce (W 42nd St between 7th and 8th Aves, 1974: a row of grindhouse marquees): placeholder marquees
    // over doors facing 42nd St until sign slots land.
    const deuce = x > -881 && x < -605 && Math.abs(z + 1548) < 32 && Math.abs(bn[1]) > 0.7;
    doorOf.set(b.id, { buildingId: b.id, x, z, yaw: Math.atan2(-bn[0], -bn[1]), style: deuce && style !== 'revolving' ? 'shop' : style, width: w, height: h, rise: style === 'stoop' ? 0.75 : style === 'church' ? 0.45 : 0, nightGate: style === 'shop' || style === 'shop_recessed' || deuce, enterable: false, marquee: deuce });
    n++;
  }
  log(`doors: ${n} buildings got a street door`);
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
  const parkAll = difference(intersect(parkUnion, [rect]), roads);
  const pathsHere = parkPaths.length ? intersect(parkAll, parkPaths) : [];
  const parkHere = pathsHere.length ? difference(parkAll, pathsHere) : parkAll;
  const lotsHere = lots.filter((l) => { const c = centroid(l[0]); return c[0] >= minX && c[0] < maxX && c[1] >= minZ && c[1] < maxZ; });
  const sidewalks = difference([rect], [...roads, ...parkAll]);
  const ground: WGround[] = [];
  const pushG = (kind: number, list: Poly[]) => { for (const p of list) { const c = cleanPoly(p); if (c) ground.push({ kind, rings: toLocal(c, ox, oz) }); } };
  pushG(GroundKind.Road, roads); pushG(GroundKind.Sidewalk, sidewalks); pushG(GroundKind.Park, parkHere); pushG(GroundKind.Plaza, pathsHere); pushG(GroundKind.Lot, lotsHere);

  const bl = (chunkBuildings.get(chunkKey(i, j)) ?? []).map<WBuilding>((b) => ({
    id: b.id, year: b.year, use: b.use, style: b.style, floors: b.floors, flags: b.flags, height: b.height, minHeight: b.minHeight, rings: toLocal(b.poly, ox, oz), ao: (b as any).ao,
  }));
  const inChunk = (p: P) => p[0] >= minX && p[0] < maxX && p[1] >= minZ && p[1] < maxZ;
  const pois: WPoi[] = [
    ...signals.filter(inChunk).map((p) => ({ kind: PoiKind.Signal, x: p[0] - ox, z: p[1] - oz, heading: 0 })),
    ...entrances.filter(inChunk).map((p) => ({ kind: PoiKind.SubwayEntrance, x: p[0] - ox, z: p[1] - oz, heading: 0 })),
  ];
  const paintHere = paintStrokes.filter((st) => { const m: P = [(st.pts[0][0] + st.pts[st.pts.length - 1][0]) / 2, (st.pts[0][1] + st.pts[st.pts.length - 1][1]) / 2]; return m[0] >= minX && m[0] < maxX && m[1] >= minZ && m[1] < maxZ; })
    .map((st) => ({ ...st, pts: st.pts.map(([x, z]) => [x - ox, z - oz] as [number, number]) }));
  const doorsHere = bl.map((b) => doorOf.get(b.id)).filter((d): d is DoorRecC => !!d).map((d) => ({ ...d, x: d.x - ox, z: d.z - oz }));
  const bytes = writeChunk(i, j, bl, ground, pois, paintHere, doorsHere);
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
// Player-visible names come from the narrative registry (content/landmarks.json, user decision 2026-11-26):
// real brand / trademarked landmark names are replaced by sound-alikes; plain place names stay real.
// `real` is dev-only matching and never reaches world.json. Heroes get a stable id for engine lookups.
type Landmark = { id: string; real: string; aliases?: string[]; name: string; short?: string };
const LANDMARKS: Landmark[] = fs.existsSync(path.join(ROOT, 'content/landmarks.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'content/landmarks.json'), 'utf8')).landmarks : [];
const slug = (n: string) => 'lm.' + n.toLowerCase().replace(/building|the /g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const heroes = [...heroMap.values()].map(({ area: _a, name, ...h }) => {
  const lm = LANDMARKS.find((l) => l.real === name || l.aliases?.includes(name));
  return { id: lm?.id ?? slug(name), name: lm?.name ?? name, short: lm?.short ?? lm?.name ?? name, ...h };
});
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
