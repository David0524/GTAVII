/**
 * Shared state behind the minimap and the folding map: the place catalogue + discovery, category
 * filters, the pencil waypoint and its route, and the player's own pencil annotations.
 * Serialises into the save's `ui` section (ENGINE_REQUESTS ui 2).
 */
import { Discovery, type DiscoveryState } from './Discovery';
import { RouteGraph, turns, type Turn, type RouteMode } from './Route';
import { CATEGORIES, FILTER_GROUPS, type FilterGroup, type Place, type PlacesFile } from './places';
import type { StreetRec } from './grid';
import { Explored } from './Explored';

export interface Annotation { x: number; z: number; mark: 'circle' | 'cross' | 'note'; text?: string }
export interface MapSave { discovery: DiscoveryState; explored?: string | null; waypoint: { x: number; z: number } | null; annotations: Annotation[] }

/** Fog-lift radii in metres. */
export const EXPLORE_FOOT_M = 70, EXPLORE_VEHICLE_M = 110, SIGHT_PLACE_M = 40;
const FILTER_KEY = 't74.ui.mapFilters';

export class MapModel {
  readonly discovery: Discovery;
  readonly graph: RouteGraph;
  /** Fog of war: ground the player has covered. Replaced by a fresh grid on load, so read it each frame. */
  explored = new Explored();
  private exploreT = 0;
  /** Last position the model saw (seeds the fog when an old save is migrated). */
  lastPos: { x: number; z: number } | null = null;
  waypoint: { x: number; z: number } | null = null;
  route: { pts: number[]; streets: number[]; length: number; mode: RouteMode } | null = null;
  turns: Turn[] = [];
  annotations: Annotation[] = [];
  filters = new Set<FilterGroup>(FILTER_GROUPS.map((f) => f.id));
  private routeFrom = { x: NaN, z: NaN };
  private routeT = 0;
  /** Changes whenever something drawn on the map changes (cheap dirty check for redraws). */
  version = 0;

  constructor(readonly places: Place[], readonly streets: StreetRec[]) {
    this.discovery = new Discovery(places);
    this.graph = new RouteGraph(streets);
    this.discovery.on(() => this.version++);
    this.discovery.onSight = (p) => { if (this.explored.mark(p.x, p.z, SIGHT_PLACE_M)) this.version++; };
    try { const f = JSON.parse(localStorage.getItem(FILTER_KEY) ?? 'null'); if (Array.isArray(f)) this.filters = new Set(f); } catch { /* defaults */ }
  }

  static async load(baseUrl: string, streets: StreetRec[]) {
    const f = await fetch(`${baseUrl}data/ui/places.json`).then((r) => r.json() as Promise<PlacesFile>);
    return new MapModel(f.places, streets);
  }

  private nearKey = -1;
  private nearGrid = new Map<string, Place[]>();
  /** Known, filter-visible places within r metres (cached 100 m grid, rebuilt when version changes). */
  knownNear(x: number, z: number, r: number): Place[] {
    const nk = this.version * 100000 + this.discovery.revision;
    if (this.nearKey !== nk) {
      this.nearKey = nk; this.nearGrid.clear();
      for (const p of this.discovery.known()) {
        if (!this.visible(p)) continue;
        const k = `${Math.floor(p.x / 100)},${Math.floor(p.z / 100)}`; const a = this.nearGrid.get(k) ?? []; a.push(p); this.nearGrid.set(k, a);
      }
    }
    const out: Place[] = [], n = Math.ceil(r / 100), cx = Math.floor(x / 100), cz = Math.floor(z / 100);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const p of this.nearGrid.get(`${cx + i},${cz + j}`) ?? []) if (Math.abs(p.x - x) <= r && Math.abs(p.z - z) <= r) out.push(p);
    return out;
  }

  visible(p: Place) { return this.discovery.isKnown(p.id) && this.filters.has(CATEGORIES[p.cat].group); }
  toggleFilter(g: FilterGroup) {
    if (this.filters.has(g)) this.filters.delete(g); else this.filters.add(g);
    try { localStorage.setItem(FILTER_KEY, JSON.stringify([...this.filters])); } catch { /* ignore */ }
    this.version++;
  }

  setWaypoint(at: { x: number; z: number } | null, from?: { x: number; z: number; inVehicle: boolean }) {
    this.waypoint = at; this.route = null; this.turns = []; this.version++;
    if (at && from) this.reroute(from.x, from.z, from.inVehicle);
  }

  /** Recompute the route from the player when they stray more than 35 m from it (at most twice a second). */
  update(dt: number, x: number, z: number, inVehicle: boolean) {
    this.lastPos = { x, z };
    if ((this.exploreT -= dt) <= 0) { this.exploreT = 0.5; if (this.explored.mark(x, z, inVehicle ? EXPLORE_VEHICLE_M : EXPLORE_FOOT_M)) this.version++; }
    if (!this.waypoint) return;
    if (Math.hypot(x - this.waypoint.x, z - this.waypoint.z) < 18) { this.setWaypoint(null); return; }
    this.routeT -= dt;
    const mode: RouteMode = inVehicle ? 'car' : 'foot';
    if (this.routeT > 0 && this.route && this.route.mode === mode) {
      if (Math.hypot(x - this.routeFrom.x, z - this.routeFrom.z) < 8) return;
      if (distToPolyline(this.route.pts, x, z) < 35) return;
    }
    this.reroute(x, z, inVehicle);
  }
  private reroute(x: number, z: number, inVehicle: boolean) {
    const w = this.waypoint!; const mode: RouteMode = inVehicle ? 'car' : 'foot';
    const r = this.graph.find(x, z, w.x, w.z, mode);
    this.route = r ? { ...r, mode } : null;
    this.turns = r ? turns(r, this.streets) : [];
    this.routeFrom = { x, z }; this.routeT = 0.5; this.version++;
  }

  serialize(): MapSave { return { discovery: this.discovery.serialize(), explored: this.explored.serialize(), waypoint: this.waypoint, annotations: this.annotations.map((a) => ({ ...a })) }; }
  deserialize(s: Partial<MapSave> | undefined) {
    this.discovery.deserialize(s?.discovery);
    this.explored = restoreExplored(s?.explored, this.discovery, this.lastPos);
    this.waypoint = s?.waypoint ?? null; this.route = null; this.annotations = s?.annotations ? [...s.annotations] : [];
    this.version++;
  }
}

/**
 * The grid from a save. `null` = a migrated v1 save: seed from what the player already knew (cells within
 * 90 m of every discovered place, 150 m of `at`) so old saves are not fully fogged. Absent or damaged = empty.
 */
export function restoreExplored(raw: string | null | undefined, discovery: Discovery, at: { x: number; z: number } | null): Explored {
  if (typeof raw === 'string') { try { return Explored.deserialize(raw); } catch { return new Explored(); } }
  const g = new Explored();
  if (raw === null) {
    for (const p of discovery.known()) g.mark(p.x, p.z, 90);
    if (at && Number.isFinite(at.x) && Number.isFinite(at.z)) g.mark(at.x, at.z, 150);
  }
  return g;
}

export function distToPolyline(p: number[], x: number, z: number) {
  let best = Infinity;
  for (let k = 2; k < p.length; k += 2) {
    const ax = p[k - 2], az = p[k - 1], dx = p[k] - ax, dz = p[k + 1] - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
