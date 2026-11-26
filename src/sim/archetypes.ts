/**
 * NPC archetype runtime. Consumes the `content/npc_archetypes/*.json` slot schema from
 * NARRATIVE_BRIEF.md:
 *   { id, behaviour: walker|loiterer|vendor|commuter|driver|beat_cop|worker, palette[], wardrobe,
 *     props[], schedule[{from,to,area,activity}], density{day,night}, barks }
 * Optional extension (ignored by the narrative schema, honoured here): `params` with
 *   walkSpeed (m/s), jaywalk (0..1), hail (0..1, chance per minute to hail a cab), patience (s before honking),
 *   aggression (0..1), and for drivers `vehicle`: car|cab|truck|bus (else inferred from props).
 * Areas are named districts (table below), intersections ("W 34th St & 6th Ave") or a street name.
 */
import type { Network } from './network';

export type Behaviour = 'walker' | 'loiterer' | 'vendor' | 'commuter' | 'driver' | 'beat_cop' | 'worker' | 'critter';
export type VehicleKind = 'car' | 'cab' | 'truck' | 'bus';
export interface ArchetypeDef {
  id: string; behaviour: Behaviour; palette?: string[]; wardrobe?: string; props?: string[];
  schedule?: { from: string; to: string; area?: string; activity?: string }[];
  density?: { day?: number; night?: number }; barks?: string;
  params?: { walkSpeed?: number; jaywalk?: number; hail?: number; patience?: number; aggression?: number };
  vehicle?: VehicleKind;
}
export interface ArchetypeRt {
  def: ArchetypeDef; index: number; behaviour: Behaviour; vehicle: VehicleKind | null;
  walkSpeed: number; jaywalk: number; hail: number; patience: number; aggression: number;
  windows: { from: number; to: number; area: Area | null; activity: string }[];
}

/** Neutral defaults and test data. Generic bodies only; nothing narrative. */
export const BUILTIN_ARCHETYPES: ArchetypeDef[] = [
  { id: 'npc.commuter', behaviour: 'commuter', palette: ['#3a3f4b', '#7a6a55', '#c9c2b0'], wardrobe: 'Office clothes, jacket over the arm in the heat', props: ['newspaper'],
    schedule: [{ from: '07:00', to: '10:00', activity: 'commute' }, { from: '16:30', to: '19:30', activity: 'commute' }, { from: '10:00', to: '16:30', activity: 'errand' }],
    density: { day: 0.9, night: 0.15 }, barks: 'barks.commuter', params: { walkSpeed: 1.55, jaywalk: 0.45, hail: 0.08 } },
  { id: 'npc.worker_handcart', behaviour: 'worker', palette: ['#5b5246', '#8c7f6a'], wardrobe: 'Work shirt, apron, cap', props: ['handcart'],
    schedule: [{ from: '07:00', to: '18:00', area: 'Garment District', activity: 'work' }],
    density: { day: 0.5, night: 0.02 }, barks: 'barks.worker', params: { walkSpeed: 1.1, jaywalk: 0.55 } },
  { id: 'npc.shopper', behaviour: 'walker', palette: ['#a0522d', '#d2b48c', '#556b2f'], wardrobe: 'Summer dress or slacks, shopping bag', props: ['shopping_bag'],
    schedule: [{ from: '09:30', to: '20:00', activity: 'shop' }], density: { day: 0.8, night: 0.1 }, barks: 'barks.shopper', params: { walkSpeed: 1.25, jaywalk: 0.25, hail: 0.12 } },
  { id: 'npc.loiterer', behaviour: 'loiterer', palette: ['#2f2f2f', '#6b4f3a'], wardrobe: 'Undershirt or open collar, slacks', props: [],
    density: { day: 0.35, night: 0.5 }, barks: 'barks.loiterer', params: { walkSpeed: 1.0, jaywalk: 0.6 } },
  { id: 'npc.beat_cop', behaviour: 'beat_cop', palette: ['#1f2a44', '#c0c0c0'], wardrobe: 'Generic dark-blue patrol uniform, cap', props: ['nightstick'],
    density: { day: 0.12, night: 0.1 }, barks: 'barks.beat_cop', params: { walkSpeed: 1.0, jaywalk: 0 } },
  { id: 'npc.vendor', behaviour: 'vendor', palette: ['#e8e2d0', '#8b0000'], wardrobe: 'White apron, paper hat', props: ['vendor_cart'],
    schedule: [{ from: '08:00', to: '21:00', activity: 'sell' }], density: { day: 0.25, night: 0.03 }, barks: 'barks.vendor' },
  { id: 'npc.pigeon_feeder', behaviour: 'loiterer', palette: ['#5a5348', '#3c3a36', '#8a8070'], wardrobe: 'Old man, overcoat even in summer, paper bag of bread crumbs', props: ['bread_bag'],
    schedule: [{ from: '08:00', to: '18:00', activity: 'feed pigeons' }], density: { day: 0.03, night: 0 }, barks: 'barks.park', params: { walkSpeed: 0.8, jaywalk: 0.2 } },
  // Wildlife (behaviour 'critter': flocks and swarms run by src/sim/wildlife.ts, not as pedestrians)
  { id: 'npc.pigeon_flock', behaviour: 'critter', palette: ['#8C8C8C', '#4B0082'], wardrobe: 'Pigeons', schedule: [{ from: '05:00', to: '21:00', activity: 'loiter' }], density: { day: 0.5, night: 0 } },
  { id: 'npc.rat_swarm', behaviour: 'critter', palette: ['#3B3B3B'], wardrobe: 'Rats', schedule: [{ from: '00:00', to: '24:00', activity: 'loiter' }], density: { day: 0.1, night: 0.4 } },
  // Drivers (vehicle archetypes)
  { id: 'npc.driver_private', behaviour: 'driver', vehicle: 'car', density: { day: 1, night: 0.6 }, barks: 'barks.driver', params: { patience: 6, aggression: 0.4 } },
  { id: 'npc.cab_driver', behaviour: 'driver', vehicle: 'cab', props: ['cab'], density: { day: 0.8, night: 1 }, barks: 'barks.cabbie', params: { patience: 3, aggression: 0.8 } },
  { id: 'npc.delivery_driver', behaviour: 'driver', vehicle: 'truck', props: ['truck'], schedule: [{ from: '05:00', to: '19:00', area: 'Garment District', activity: 'deliver' }],
    density: { day: 0.45, night: 0.08 }, barks: 'barks.trucker', params: { patience: 5, aggression: 0.5 } },
  { id: 'npc.bus_driver', behaviour: 'driver', vehicle: 'bus', props: ['bus'], density: { day: 0.12, night: 0.05 }, barks: 'barks.bus', params: { patience: 8, aggression: 0.2 } },
];

const BEHAVIOURS: Behaviour[] = ['walker', 'loiterer', 'vendor', 'commuter', 'driver', 'beat_cop', 'worker', 'critter'];
const DEFAULT_SPEED: Record<Behaviour, number> = { walker: 1.3, loiterer: 1.0, vendor: 1.0, commuter: 1.5, driver: 0, beat_cop: 1.0, worker: 1.1, critter: 0 };
const DEFAULT_JAY: Record<Behaviour, number> = { walker: 0.3, loiterer: 0.5, vendor: 0.2, commuter: 0.45, driver: 0, beat_cop: 0, worker: 0.5, critter: 0 };

export function parseTime(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`bad time "${s}"`);
  if (+m[1] === 24 && +m[2] === 0) return 1440; // "24:00" = end of day
  return (+m[1] % 24) * 60 + +m[2];
}
/** Is minute-of-day t inside [from, to) (wrapping past midnight)? */
export function inWindow(t: number, from: number, to: number) { return from <= to ? t >= from && t < to : t >= from || t < to; }

/** Validate one archetype JSON; returns a list of problems (empty = ok). */
export function validateArchetype(d: any): string[] {
  const e: string[] = [];
  if (typeof d?.id !== 'string' || !/^npc\.[a-z0-9_]+$/.test(d.id)) e.push(`id must be "npc.snake_case" (got ${JSON.stringify(d?.id)})`);
  if (!BEHAVIOURS.includes(d?.behaviour)) e.push(`${d?.id}: behaviour must be one of ${BEHAVIOURS.join('|')}`);
  for (const w of d?.schedule ?? []) { try { parseTime(w.from); parseTime(w.to); } catch (x) { e.push(`${d?.id}: ${(x as Error).message}`); } }
  for (const k of ['day', 'night'] as const) if (d?.density?.[k] !== undefined && !(d.density[k] >= 0 && d.density[k] <= 1)) e.push(`${d?.id}: density.${k} must be 0..1`);
  return e;
}

// ------------------------------------------------------------------ areas
export interface Area { name: string; minX: number; maxX: number; minZ: number; maxZ: number }
/** Named districts as [west avenue, east avenue, south street, north street]. */
const DISTRICTS: Record<string, [string, string, number, number]> = {
  'garment district': ['9th Avenue', '6th Avenue', 34, 42],
  'flower district': ['7th Avenue', '6th Avenue', 26, 29],
  'fur district': ['8th Avenue', '7th Avenue', 27, 30],
  'herald square': ['7th Avenue', '5th Avenue', 33, 36],
  'times square': ['8th Avenue', '6th Avenue', 41, 44],
  '42nd street': ['8th Avenue', '5th Avenue', 41, 43],
  'eighth avenue strip': ['9th Avenue', '7th Avenue', 38, 44],
  'madison square': ['6th Avenue', 'Madison Avenue', 22, 26],
  'flatiron': ['6th Avenue', 'Park Avenue South', 19, 26],
  'penn station': ['8th Avenue', '7th Avenue', 31, 33],
  'chelsea': ['9th Avenue', '7th Avenue', 19, 29],
  'koreatown': ['6th Avenue', '5th Avenue', 31, 33],
  'bryant park': ['6th Avenue', '5th Avenue', 40, 42],
  'murray hill': ['Madison Avenue', '3rd Avenue', 34, 42],
  'tenderloin': ['7th Avenue', '5th Avenue', 23, 42],
};

export function normalizeStreet(s: string): string {
  let n = s.trim().replace(/\./g, '');
  n = n.replace(/^W(est)?\s+/i, 'West ').replace(/^E(ast)?\s+/i, 'East ');
  n = n.replace(/\s+St(reet)?$/i, ' Street').replace(/\s+Ave(nue)?$/i, ' Avenue');
  if (/^(Sixth Avenue|Avenue of the Americas)$/i.test(n)) n = '6th Avenue';
  const ord: Record<string, string> = { Fifth: '5th', Seventh: '7th', Eighth: '8th', Ninth: '9th', Third: '3rd' };
  n = n.replace(/^(Fifth|Seventh|Eighth|Ninth|Third) /, (_m, w) => `${ord[w]} `);
  return n;
}

export class AreaResolver {
  private aveX = new Map<string, number>();
  private streetZ = new Map<number, number>();
  constructor(net: Network) {
    const xs = new Map<string, number[]>(), zs = new Map<number, number[]>();
    net.g.roads.forEach((r) => {
      const name = net.g.names[r.name];
      const p = r.pts;
      for (let k = 0; k < p.length; k += 2) {
        if (/Avenue|Broadway/.test(name) && !/Street$/.test(name)) (xs.get(name) ?? xs.set(name, []).get(name)!).push(p[k]);
        const m = /^(?:East|West) (\d+)(?:st|nd|rd|th) Street$/.exec(name);
        if (m) (zs.get(+m[1]) ?? zs.set(+m[1], []).get(+m[1])!).push(p[k + 1]);
      }
    });
    const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1];
    for (const [k, v] of xs) this.aveX.set(k, med(v));
    for (const [k, v] of zs) this.streetZ.set(k, med(v));
  }
  private stZ(n: number): number | undefined {
    if (this.streetZ.has(n)) return this.streetZ.get(n);
    // interpolate/extrapolate at ~80 m per block
    const keys = [...this.streetZ.keys()].sort((a, b) => a - b);
    if (!keys.length) return undefined;
    const near = keys.reduce((b, k) => (Math.abs(k - n) < Math.abs(b - n) ? k : b), keys[0]);
    return this.streetZ.get(near)! - (n - near) * 80;
  }
  resolve(area: string | undefined): Area | null {
    if (!area) return null;
    const key = area.trim().toLowerCase();
    const d = DISTRICTS[key];
    if (d) {
      // avenues outside the data (e.g. 9th Ave) fall back to ~270 m beyond the other bound
      let x0 = this.aveX.get(d[0]), x1 = this.aveX.get(d[1]);
      if (x0 === undefined && x1 !== undefined) x0 = x1 - 400;
      if (x1 === undefined && x0 !== undefined) x1 = x0 + 400;
      const zS = this.stZ(d[2]), zN = this.stZ(d[3]);
      if (x0 === undefined || x1 === undefined || zS === undefined || zN === undefined) return null;
      return { name: area, minX: Math.min(x0, x1), maxX: Math.max(x0, x1), minZ: Math.min(zS, zN), maxZ: Math.max(zS, zN) };
    }
    const parts = area.split('&').map((p) => normalizeStreet(p));
    if (parts.length === 2) {
      const pick = (n: string): { x?: number; z?: number } => {
        if (this.aveX.has(n)) return { x: this.aveX.get(n) };
        const m = /^(?:East|West) (\d+)/.exec(n); if (m) return { z: this.stZ(+m[1]) };
        return {};
      };
      const a = pick(parts[0]), b = pick(parts[1]);
      const x = a.x ?? b.x, z = a.z ?? b.z;
      if (x !== undefined && z !== undefined) return { name: area, minX: x - 100, maxX: x + 100, minZ: z - 100, maxZ: z + 100 };
    }
    return null; // unknown area: treated as "anywhere" by the caller, and reported by validate
  }
}

export function contains(a: Area, x: number, z: number) { return x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ; }

export class ArchetypeRegistry {
  readonly list: ArchetypeRt[] = [];
  readonly warnings: string[] = [];
  constructor(private areas: AreaResolver) {}
  register(defs: ArchetypeDef[]) {
    for (const d of defs) {
      const errs = validateArchetype(d);
      if (errs.length) { this.warnings.push(...errs); continue; }
      const behaviour = d.behaviour;
      const vehicle: VehicleKind | null = behaviour !== 'driver' ? null
        : d.vehicle ?? ((['cab', 'truck', 'bus'] as VehicleKind[]).find((k) => d.props?.includes(k)) ?? 'car');
      const windows = (d.schedule ?? []).map((w) => {
        const area = this.areas.resolve(w.area);
        if (w.area && !area) this.warnings.push(`${d.id}: unknown area "${w.area}" (treated as anywhere)`);
        return { from: parseTime(w.from), to: parseTime(w.to), area, activity: w.activity ?? '' };
      });
      const rt: ArchetypeRt = {
        def: d, index: 0, behaviour, vehicle,
        walkSpeed: d.params?.walkSpeed ?? DEFAULT_SPEED[behaviour], jaywalk: d.params?.jaywalk ?? DEFAULT_JAY[behaviour],
        hail: d.params?.hail ?? 0, patience: d.params?.patience ?? 5, aggression: d.params?.aggression ?? 0.4, windows,
      };
      const existing = this.list.findIndex((a) => a.def.id === d.id);
      if (existing >= 0) { rt.index = existing; this.list[existing] = rt; } else { rt.index = this.list.length; this.list.push(rt); }
    }
  }
  /** Spawn weight of an archetype at a place and minute of day. */
  weight(a: ArchetypeRt, x: number, z: number, minute: number): number {
    const day = minute >= 6 * 60 && minute < 20 * 60;
    const dens = day ? a.def.density?.day ?? 0.5 : a.def.density?.night ?? 0.2;
    if (!a.windows.length) return dens;
    let best = 0;
    for (const w of a.windows) {
      if (!inWindow(minute, w.from, w.to)) continue;
      best = Math.max(best, !w.area || contains(w.area, x, z) ? 1 : 0.15);
    }
    return dens * best;
  }
  activity(a: ArchetypeRt, minute: number): string {
    for (const w of a.windows) if (inWindow(minute, w.from, w.to)) return w.activity;
    return '';
  }
  pick(filter: (a: ArchetypeRt) => boolean, x: number, z: number, minute: number, r: number): ArchetypeRt | null {
    let total = 0;
    for (const a of this.list) if (filter(a)) total += this.weight(a, x, z, minute);
    if (total <= 0) return null;
    let t = r * total;
    for (const a of this.list) if (filter(a)) { t -= this.weight(a, x, z, minute); if (t <= 0) return a; }
    return null;
  }
}
