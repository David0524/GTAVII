/**
 * Street vendors (STREET_VENDORS.md; types, hours and places from narrative's content/vendors.json).
 *
 * A logical layer like wildlife: every sidewalk spot near the focus has, per day, a deterministic chance of
 * hosting one vendor type (by spot kind, district and hour); the vendor exists only while the player is near.
 *  - Life cycle: a cart is pushed in along the sidewalk at opening time (`arriving` → `open`), packs up and
 *    is pushed away at closing (`closing` → `leaving`); a vendor met mid-shift is simply there. Rain closes
 *    ices and flowers, puts the hot-dog umbrella up and brings out the umbrella peddlers.
 *  - Trade: passers-by join a short queue (more at lunch, coffee at dawn), are served one at a time, walk on
 *    carrying what they bought and sometimes drop the wrapper (`litter`). Vendors call out (`vendorCall`).
 *  - Reactions: gunfire/threats → the vendor ducks behind the cart (steady nerves) or runs; reckless driving
 *    past the cart → `vendorShout`; a cop near an unlicensed peddler → packs up and moves on; a cop near a
 *    monte game → the lookout calls it and the crew bolts (`monteScatter`).
 *  - Gameplay: `vendorSpawned {id, kind, pedId, x, z, cart}` / `vendorGone {id, reason}`; commands
 *    (`flee`, `cower`) and notices (`cartOverturned`, `vendorSale`, `monteFolded`) come in through
 *    Simulation.vendorCommand / vendorNotice. Adults only.
 */
import { inWindow, parseTime, type ArchetypeRt } from './archetypes';
import { sampleAt } from './geom';
import { SpotKind, WalkKind } from './laneFormat';
import type { SimCore, Ped } from './state';
import { despawnPed, spawnPedNear } from './peds';

export type VendorKind = 'hot_dog' | 'pretzel_knish' | 'italian_ice' | 'nut_roaster' | 'coffee_cart' | 'fruit_stand' | 'flower_stand' | 'newsstand' | 'shoeshine' | 'peddler' | 'monte';

interface KindDef {
  hours: [string, string];
  spots: SpotKind[];
  /** districts (archetype area names) where it's common; `only`: nowhere else */
  areas: string[]; only?: boolean;
  /** chance per eligible spot per day (inside its districts) */
  base: number;
  licensed: boolean;
  /** cart/stand prop for the engine/vehicles (null: carried goods only) */
  prop: string | null;
  /** pushed in and out (carts) vs set up in place (stands, blankets) */
  pushed: boolean;
  queue: number; serve: [number, number];
  /** goods sold to ambient customers (menu keys from content/vendors.json) */
  goods: string[];
  /** chance a passer-by stops (per pass, before time-of-day multipliers) */
  pull: number;
  rain: 'close' | 'umbrella' | 'more' | 'same';
  crew?: number;
  archetype: string;
}

export const VENDOR_KINDS: Record<VendorKind, KindDef> = {
  hot_dog: { hours: ['10:00', '22:00'], spots: [SpotKind.Corner], areas: ['herald square', 'penn station', '42nd street', 'times square', 'madison square', 'bryant park'], base: 0.085, licensed: true, prop: 'cart_hot_dog', pushed: true, queue: 5, serve: [7, 12], goods: ['hot_dog.frank', 'hot_dog.frank_with_kraut_or_onions', 'hot_dog.soda', 'hot_dog.knish'], pull: 0.08, rain: 'umbrella', archetype: 'npc.cart_vendor' },
  pretzel_knish: { hours: ['09:00', '20:00'], spots: [SpotKind.Subway, SpotKind.Corner], areas: ['bryant park', 'herald square', 'penn station'], base: 0.085, licensed: true, prop: 'cart_pretzel', pushed: true, queue: 3, serve: [5, 9], goods: ['pretzel_knish.hot_pretzel', 'pretzel_knish.potato_knish', 'pretzel_knish.kasha_knish'], pull: 0.06, rain: 'same', archetype: 'npc.cart_vendor' },
  italian_ice: { hours: ['12:00', '21:00'], spots: [SpotKind.Corner], areas: ['chelsea', 'madison square', 'bryant park'], only: true, base: 0.204, licensed: true, prop: 'cart_ices', pushed: true, queue: 4, serve: [4, 8], goods: ['italian_ice.small_ice', 'italian_ice.large_ice', 'italian_ice.rainbow_three_flavours'], pull: 0.07, rain: 'close', archetype: 'npc.cart_vendor' },
  nut_roaster: { hours: ['11:00', '23:00'], spots: [SpotKind.Corner], areas: ['times square', 'herald square', '42nd street'], only: true, base: 0.17, licensed: true, prop: 'cart_nuts', pushed: true, queue: 3, serve: [5, 9], goods: ['nut_roaster.cashews_bag', 'nut_roaster.peanuts_bag', 'nut_roaster.almonds_bag'], pull: 0.05, rain: 'umbrella', archetype: 'npc.cart_vendor' },
  coffee_cart: { hours: ['05:00', '10:00'], spots: [SpotKind.Storefront, SpotKind.Corner], areas: ['garment district', 'flower district'], only: true, base: 0.102, licensed: true, prop: 'cart_coffee', pushed: true, queue: 6, serve: [4, 7], goods: ['coffee_cart.coffee', 'coffee_cart.buttered_roll', 'coffee_cart.danish'], pull: 0.12, rain: 'umbrella', archetype: 'npc.cart_vendor' },
  fruit_stand: { hours: ['07:00', '20:00'], spots: [SpotKind.Storefront], areas: ['chelsea', 'eighth avenue strip'], only: true, base: 0.03, licensed: true, prop: 'stand_fruit', pushed: false, queue: 2, serve: [8, 15], goods: ['fruit_stand.apple', 'fruit_stand.banana', 'fruit_stand.bag_of_cherries'], pull: 0.04, rain: 'same', archetype: 'npc.grocer' },
  flower_stand: { hours: ['08:00', '19:00'], spots: [SpotKind.Storefront, SpotKind.Corner], areas: ['madison square', 'penn station', 'flower district'], only: true, base: 0.102, licensed: true, prop: 'stand_flowers', pushed: false, queue: 2, serve: [10, 20], goods: ['flower_stand.carnation', 'flower_stand.bunch_of_daisies', 'flower_stand.dozen_roses'], pull: 0.025, rain: 'close', archetype: 'npc.flower_seller' },
  newsstand: { hours: ['05:00', '23:00'], spots: [SpotKind.Subway, SpotKind.Corner], areas: [], base: 0.085, licensed: true, prop: 'stand_news', pushed: false, queue: 2, serve: [3, 6], goods: ['newsstand.newspaper', 'newsstand.magazine', 'newsstand.cigarettes', 'newsstand.candy_bar'], pull: 0.06, rain: 'same', archetype: 'npc.news_vendor' },
  shoeshine: { hours: ['07:00', '20:00'], spots: [SpotKind.Storefront], areas: ['penn station', '42nd street', 'herald square'], only: true, base: 0.015, licensed: true, prop: 'stand_shoeshine', pushed: false, queue: 1, serve: [60, 110], goods: ['shoeshine.shine'], pull: 0.02, rain: 'close', archetype: 'npc.shoeshine' },
  peddler: { hours: ['10:00', '22:00'], spots: [SpotKind.Corner, SpotKind.Subway, SpotKind.Storefront], areas: ['times square', 'herald square', 'penn station'], only: true, base: 0.119, licensed: false, prop: 'peddler_case', pushed: false, queue: 2, serve: [6, 14], goods: ['peddler.watch', 'peddler.sunglasses', 'peddler.trinket', 'peddler.record'], pull: 0.03, rain: 'more', archetype: 'npc.peddler' },
  monte: { hours: ['11:00', '23:00'], spots: [SpotKind.Corner, SpotKind.Storefront], areas: ['42nd street', 'times square', 'herald square'], only: true, base: 0.2, licensed: false, prop: 'monte_box', pushed: false, queue: 0, serve: [0, 0], goods: [], pull: 0.1, rain: 'close', crew: 3, archetype: 'npc.monte_dealer' },
};
const KIND_LIST = Object.keys(VENDOR_KINDS) as VendorKind[];

export type VendorState = 'arriving' | 'open' | 'serving' | 'closing' | 'leaving' | 'cower' | 'fled' | 'righting' | 'released';
export interface VendorView {
  id: string; kind: VendorKind; pedId: number; crew: number[]; state: VendorState;
  /** cart/stand prop (engine/vehicles); `prop` null for carried goods */
  prop: string | null; cartX: number; cartZ: number; cartYaw: number;
  open: boolean; umbrella: boolean; queue: number;
  /** stable per vendor: pick the brand/umbrella copy from narrative's list with it */
  variant: number;
  /** peddler's line today (watches / umbrellas / ...) */
  goods: string;
}

interface Vendor {
  id: string; kind: VendorKind; def: KindDef; spot: number;
  /** the stall's place on the sidewalk graph: edge, arc position, cart offset toward the kerb */
  edge: number; s: number; kl: number;
  x: number; z: number; yaw: number; cx: number; cz: number; cyaw: number;
  ped: Ped | null; crew: Ped[]; state: VendorState; timer: number;
  queue: Ped[]; serving: Ped | null; nextCall: number; shoutCd: number;
  closeAt: number; variant: number; goods: string; licensed: boolean;
  watchers: Ped[]; reopenT: number;
}

const tmp = [0, 0, 0, 0];
function hash(a: number, b: number) { let h = (Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return (h ^ (h >>> 16)) >>> 0; }

export class Vendors {
  private list = new Map<string, Vendor>();
  /** spot -> vendor kind chosen for today (or null), per day */
  private plan = new Map<number, VendorKind | null>();
  private planDay = -1;
  private scanT = 0;
  /** spots closed for the rest of the day (overturned cart, chased off) */
  private closed = new Map<number, number>();
  views: VendorView[] = [];
  private obsDirty = false;
  sales = 0; scatters = 0; movedOn = 0; calls = 0;

  constructor(private S: SimCore, private dayOf: () => number) {}

  private kindFor(spot: number): VendorKind | null {
    const day = this.dayOf();
    if (day !== this.planDay) { this.plan.clear(); this.planDay = day; }
    if (this.plan.has(spot)) return this.plan.get(spot)!;
    const S = this.S, sp = S.net.g.spots[spot];
    let pick: VendorKind | null = null;
    const r = (hash(spot * 31 + day, 977) % 100000) / 100000;
    let acc = 0;
    for (const k of KIND_LIST) {
      const d = VENDOR_KINDS[k];
      if (!d.spots.includes(sp.kind)) continue;
      const inArea = d.areas.some((a) => { const A = S.reg.areas.resolve(a); return A ? sp.x >= A.minX && sp.x <= A.maxX && sp.z >= A.minZ && sp.z <= A.maxZ : false; });
      if (d.only && !inArea) continue;
      let p = d.base * (inArea ? 1 : 0.35) * (sp.kind === SpotKind.Subway && (k === 'newsstand' || k === 'pretzel_knish') ? 2.5 : 1);
      if (sp.kind === SpotKind.Storefront && d.spots[0] !== SpotKind.Storefront) p *= 0.25; // mid-block: there are many more of these
      acc += p;
      if (r < acc) { pick = k; break; }
    }
    this.plan.set(spot, pick);
    return pick;
  }

  /** Is the kind trading now (hours with a per-spot jitter, weather)? */
  private trading(k: VendorKind, spot: number): boolean {
    const d = VENDOR_KINDS[k], S = this.S;
    const j = (hash(spot, this.dayOf() + 7) % 41) - 20; // ±20 min
    if (!inWindow(S.minute, parseTime(d.hours[0]) + j, parseTime(d.hours[1]) + j)) return false;
    if (S.weather === 'rain' && d.rain === 'close') return false;
    return true;
  }

  private arch(id: string, fallback: string): ArchetypeRt | undefined {
    const L = this.S.reg.list;
    return L.find((a) => a.def.id === id) ?? L.find((a) => a.def.id === fallback);
  }

  step(dt: number) {
    if ((this.scanT -= dt) <= 0) { this.scanT = 2; this.scan(); }
    const n0 = this.list.size;
    for (const v of [...this.list.values()]) this.tick(v, dt);
    if (this.list.size !== n0) this.obsDirty = true;
    if (this.obsDirty) { // carts and stands are sidewalk obstacles for everyone else
      this.obsDirty = false;
      const S = this.S, carts: { x: number; z: number; r: number }[] = [];
      for (const v of this.list.values()) if (v.def.prop && v.state !== 'arriving' && v.state !== 'leaving') carts.push({ x: v.cx, z: v.cz, r: v.kind === 'monte' ? 0.4 : 0.75 });
      S.obstacles = [...S.obsBase, ...carts];
      S.obsGrid.clear(); S.obstacles.forEach((o, i) => S.obsGrid.add(o.x, o.z, i));
    }
    this.customers(dt);
    this.writeViews();
  }

  private scan() {
    const S = this.S, f = S.focus, g = S.net.g, R = S.ringP[1];
    // drop vendors far away (they carry on off-screen; we just stop simulating them)
    for (const v of [...this.list.values()]) if (Math.hypot(v.x - f.x, v.z - f.z) > R + 25 && v.state !== 'released') this.remove(v, '');
    if (!g.spots.length) return;
    for (let i = 0; i < g.spots.length; i++) {
      const sp = g.spots[i];
      if (Math.abs(sp.x - f.x) > R || Math.abs(sp.z - f.z) > R || Math.hypot(sp.x - f.x, sp.z - f.z) > R) continue;
      const k = this.kindFor(i); if (!k) continue;
      const id = `vendor:${i}`;
      const cl = this.closed.get(i);
      if (cl !== undefined && S.t < cl) continue;
      const v = this.list.get(id);
      const trading = this.trading(k, i);
      if (!v && trading) {
        // a loiterer standing on the spot steps aside for the stall
        const own = S.spotOwner[i];
        if (own >= 0) { const q = S.pedById.get(own); if (q && q.vendor) continue; if (q) { if (q.state === 'free' && q.then === 'loiter') { q.then = 'attach'; q.toEdge = q.edge; q.toS = q.s; } q.spot = -1; if (q.state === 'loiter') q.timer = 0; } S.spotOwner[i] = -1; }
        // arriving only in the first minutes of the shift (otherwise the stall is simply there)
        const j = (hash(i, this.dayOf() + 7) % 41) - 20, from = parseTime(VENDOR_KINDS[k].hours[0]) + j;
        const justOpened = ((S.minute - from + 1440) % 1440) < 12 && VENDOR_KINDS[k].pushed;
        this.create(i, k, justOpened);
      } else if (v && !trading && (v.state === 'open' || v.state === 'serving')) { v.state = 'closing'; v.timer = 15; }
    }
  }

  private copNear(x: number, z: number, r: number, footOnly = false): { x: number; z: number } | null {
    const S = this.S; let cop: { x: number; z: number } | null = null;
    S.pGrid.query(x, z, r, (i) => { const q = S.peds[i]; if (!cop && q && q.alive && (q.cop || q.cop2) && Math.hypot(q.x - x, q.z - z) < r) cop = { x: q.x, z: q.z }; });
    if (!cop && !footOnly) for (const w of S.vehicles) if (w.alive && w.cop && (!w.cop.role || w.cop.role === 'police') && Math.hypot(w.x - x, w.z - z) < r) { cop = { x: w.x, z: w.z }; break; }
    return cop;
  }

  private create(spot: number, kind: VendorKind, arrive: boolean) {
    const S = this.S, g = S.net.g, net = S.net, sp = g.spots[spot], def = VENDOR_KINDS[kind];
    if (!def.licensed && this.copNear(sp.x, sp.z, 20, true)) return; // nobody sets up a game under a cop's nose
    const E = g.walkEdges[sp.edge];
    if (!E || E.kind !== WalkKind.Sidewalk) return;
    const elen = net.walkLen[sp.edge];
    if (elen < 14) return; // a sliver of sidewalk at a corner: no room for a stall
    const s = Math.max(5, Math.min(elen - 5, sp.s)); // clear of the corner, where the band tapers
    sampleAt(E.pts, net.walkCum[sp.edge], s, tmp);
    const dx = tmp[2], dz = tmp[3];
    // the walking band's centre sits `pathOff` in from the kerb (lanes.ts): carts stand ~0.8 m in from the
    // kerb, the vendor behind on the building side facing the kerb; a monte box sits mid-band
    const kerb = -E.side; // sign toward the kerb across the band
    const road = g.roads[E.owner], pathOff = Math.max(1.0, Math.min(2.4, road.sidewalk * 0.42));
    const kl = kind === 'monte' ? 0 : Math.max(0, pathOff - 0.8);
    const cx = tmp[0] - dz * kerb * kl, cz = tmp[1] + dx * kerb * kl;
    const vx = cx + dz * kerb * 1.0, vz = cz - dx * kerb * 1.0;
    const toKerbYaw = Math.atan2(-(cx - vx), -(cz - vz));
    const arch = this.arch(def.archetype, 'npc.vendor');
    if (!arch) return;
    const p = spawnPedNear(S, vx, vz, arch, 12);
    if (!p) return;
    const variant = hash(spot, 4242) % 1000;
    const goods = kind === 'peddler' ? (S.weather === 'rain' ? 'umbrellas' : ['watches', 'sunglasses', 'trinkets', 'records'][variant % 4]) : '';
    const v: Vendor = {
      id: `vendor:${spot}`, kind, def, spot, edge: sp.edge, s, kl, x: vx, z: vz, yaw: toKerbYaw, cx, cz, cyaw: Math.atan2(-dx, -dz),
      ped: p, crew: [], state: 'open', timer: 0, queue: [], serving: null, nextCall: S.t + S.rng.range(5, 25), shoutCd: 0,
      closeAt: 0, variant, goods, licensed: def.licensed, watchers: [], reopenT: 0,
    };
    p.vendor = v.id; p.spot = spot; S.spotOwner[spot] = p.id;
    if (arrive) {
      // pushed in from ~35 m back along the sidewalk
      const back = Math.max(0, s - 35 * (hash(spot, 9) % 2 ? 1 : -1));
      sampleAt(E.pts, net.walkCum[sp.edge], Math.min(net.walkLen[sp.edge], back), tmp);
      p.x = p.px = tmp[0]; p.z = p.pz = tmp[1];
      v.state = 'arriving';
    } else {
      p.x = p.px = vx; p.z = p.pz = vz; p.yaw = p.pyaw = toKerbYaw;
    }
    p.state = 'vendor'; p.v = 0; p.timer = Infinity; p.onRoad = false;
    // monte: dealer + shills around the box, a lookout up the block
    if (kind === 'monte') {
      const shill = this.arch('npc.monte_shill', 'npc.loiterer'), look = this.arch('npc.monte_lookout', 'npc.loiterer');
      const ls = Math.max(1, Math.min(elen - 1, s + (s < elen / 2 ? 9 : -9))); // lookout up the block, on the sidewalk
      sampleAt(E.pts, net.walkCum[sp.edge], ls, tmp);
      const spots: [number, number, ArchetypeRt | undefined][] = [
        [cx + dx * 1.1, cz + dz * 1.1, shill], [cx - dx * 1.1, cz - dz * 1.1, shill],
        [tmp[0], tmp[1], look],
      ];
      for (const [x, z, a] of spots) {
        if (!a) continue;
        const q = spawnPedNear(S, x, z, a, 12); if (!q) continue;
        q.x = q.px = x; q.z = q.pz = z; q.state = 'vendor'; q.v = 0; q.timer = Infinity; q.vendor = v.id;
        q.yaw = q.pyaw = Math.atan2(-(cx - x), -(cz - z));
        v.crew.push(q);
      }
      v.crew[v.crew.length - 1] && (v.crew[v.crew.length - 1].yaw = Math.atan2(dx, dz)); // lookout watches the street
    }
    this.list.set(v.id, v);
    this.obsDirty = true;
    S.emit('vendorSpawned', { id: v.id, kind, pedId: p.id, crew: v.crew.map((q) => q.id), x: vx, z: vz, cart: def.prop ? { prop: def.prop, x: cx, z: cz, yaw: v.cyaw } : null, licensed: v.licensed, goods, variant, arriving: arrive });
  }

  private remove(v: Vendor, reason: string) {
    const S = this.S;
    for (const q of [v.ped, ...v.crew, ...v.queue, ...v.watchers]) if (q && q.alive && q.vendor === v.id) q.vendor = undefined;
    for (const q of v.queue) if (q.alive && q.state === 'queue') q.timer = 0;
    for (const q of v.watchers) if (q.alive && q.state === 'watch') q.timer = 0;
    if (S.spotOwner[v.spot] === v.ped?.id) S.spotOwner[v.spot] = -1;
    for (const q of [v.ped, ...v.crew]) if (q && q.alive && (q.state === 'vendor' || q.state === 'free')) despawnPed(S, q);
    this.list.delete(v.id);
    if (reason) S.emit('vendorGone', { id: v.id, kind: v.kind, reason });
  }

  /** Walk a vendor ped back onto the sidewalk graph as an ordinary pedestrian (fled, moved on). */
  private release(q: Ped, flee: boolean, fromX = q.x, fromZ = q.z) {
    const S = this.S, net = S.net;
    q.vendor = undefined;
    if (q.spot >= 0 && S.spotOwner[q.spot] === q.id) S.spotOwner[q.spot] = -1;
    q.spot = -1;
    const e = net.g.walkEdges[q.edge]; sampleAt(e.pts, net.walkCum[q.edge], q.s, tmp);
    q.toEdge = q.edge; q.toS = q.s; q.state = 'free'; q.tx = tmp[0]; q.tz = tmp[1]; q.then = flee ? 'flee' : 'attach';
    if (flee) { q.fleeX = fromX; q.fleeZ = fromZ; q.fleeSpeed = S.rng.range(3.6, 4.8); q.timer = S.rng.range(6, 12); }
  }

  private tick(v: Vendor, dt: number) {
    const S = this.S, p = v.ped;
    if (v.state === 'released') return;
    if (!p || !p.alive || (p.vendor !== v.id && v.state !== 'fled')) { this.remove(v, Math.hypot(v.x - S.focus.x, v.z - S.focus.z) > S.ringP[1] ? '' : 'gone'); return; }
    switch (v.state) {
      case 'arriving': { // pushing the cart in
        const dx = v.x - p.x, dz = v.z - p.z, d = Math.hypot(dx, dz), sp = 1.0;
        if (d < 0.15) { p.x = v.x; p.z = v.z; p.yaw = v.yaw; v.state = 'open'; this.obsDirty = true; S.emit('vendorOpened', { id: v.id, kind: v.kind }); }
        else { p.x += (dx / d) * Math.min(d, sp * dt); p.z += (dz / d) * Math.min(d, sp * dt); p.yaw = Math.atan2(-dx, -dz); p.v = sp; }
        break;
      }
      case 'open': case 'serving': {
        p.v = 0; p.x = v.x; p.z = v.z;
        if (v.state === 'open' && v.queue.length && v.queue[0].state === 'queue') { v.serving = v.queue[0]; v.state = 'serving'; v.timer = S.rng.range(v.def.serve[0], v.def.serve[1]); p.yaw = v.yaw; }
        if (v.state === 'serving') {
          if (!v.serving || !v.serving.alive || v.serving.state !== 'queue') { v.serving = null; v.state = 'open'; v.queue = v.queue.filter((q) => q.alive && q.state === 'queue'); break; }
          if ((v.timer -= dt) <= 0) this.sell(v);
        }
        // calls when people are about
        if (S.t >= v.nextCall && v.kind !== 'monte') {
          v.nextCall = S.t + S.rng.range(15, 40);
          let near = 0; S.pGrid.query(v.x, v.z, 15, (i) => { const q = S.peds[i]; if (q && q.alive && !q.vendor) near++; });
          if (near >= 2) { this.calls++; S.emit('vendorCall', { id: v.id, kind: v.kind, pedId: p.id, x: v.x, z: v.z, bark: 'barks.vendor_calls' }); }
        }
        this.copCheck(v);
        this.trafficCheck(v, dt);
        if (v.kind === 'monte') this.monteCrowd(v);
        break;
      }
      case 'righting': if ((v.timer -= dt) <= 0) { v.state = 'closing'; v.timer = 10; this.closed.set(v.spot, S.t + 2 * 3600); } break;
      case 'closing': {
        for (const q of v.queue) if (q.alive && q.state === 'queue') q.timer = 0;
        v.queue = [];
        if ((v.timer -= dt) <= 0) {
          if (v.def.pushed) { v.state = 'leaving'; v.timer = 40; }
          else { this.remove(v, 'closed'); }
        }
        break;
      }
      case 'leaving': { // pushing the cart away along the sidewalk, then gone
        const E = S.net.g.walkEdges[p.edge], dir = hash(v.spot, 3) % 2 ? 1 : -1;
        sampleAt(E.pts, S.net.walkCum[p.edge], Math.max(0, Math.min(S.net.walkLen[p.edge], S.net.g.spots[v.spot].s + dir * 40)), tmp);
        const dx = tmp[0] - p.x, dz = tmp[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.3 || (v.timer -= dt) <= 0) { this.remove(v, 'closed'); break; }
        p.x += (dx / d) * dt; p.z += (dz / d) * dt; p.yaw = Math.atan2(-dx, -dz); p.v = 1;
        break;
      }
      case 'cower': { // behind the cart
        p.v = 0;
        if ((v.timer -= dt) <= 0) { p.state = 'vendor'; p.x = v.x; p.z = v.z; v.state = 'open'; S.emit('vendorRecovered', { id: v.id }); }
        break;
      }
      case 'fled': { // the vendor ran; the stall stays shut for a while and the record goes
        if ((v.timer -= dt) <= 0) { this.closed.set(v.spot, S.t + 1800); this.remove(v, 'fled'); }
        break;
      }
    }
    // keep the stall's cart position for the queue; the cart follows the vendor while pushed
    if (v.state === 'arriving' || v.state === 'leaving') { const f = 1.2; v.cx = p.x - Math.sin(p.yaw) * f; v.cz = p.z - Math.cos(p.yaw) * f; v.cyaw = p.yaw; }
  }

  private sell(v: Vendor) {
    const S = this.S, q = v.serving!;
    const good = v.def.goods.length ? v.def.goods[S.rng.int(v.def.goods.length)] : '';
    q.carry = good.split('.')[1] ?? good; q.carryUntil = S.t + S.rng.range(25, 60); q.buyCd = S.t + 600;
    q.vendor = undefined; q.timer = 0; // back to walking next step
    v.queue = v.queue.filter((x) => x !== q && x.alive && x.state === 'queue');
    v.serving = null; v.state = 'open'; this.sales++;
    S.emit('vendorServed', { id: v.id, kind: v.kind, pedId: q.id, good });
    // the rest shuffle up
    this.placeQueue(v);
  }

  /** A point on the stall's sidewalk, `along` metres from it (toward mid-block), `lat` toward the kerb. */
  private onStallSidewalk(v: Vendor, along: number, lat: number): [number, number] {
    const net = this.S.net, E = net.g.walkEdges[v.edge], len = net.walkLen[v.edge];
    const dir = v.s < len / 2 ? 1 : -1; // grow toward the middle of the block, never round the corner
    const s = Math.max(1, Math.min(len - 1, v.s + dir * along));
    sampleAt(E.pts, net.walkCum[v.edge], s, tmp);
    const kerb = -E.side, l = Math.max(-E.half, Math.min(v.kl, lat));
    return [tmp[0] - tmp[3] * kerb * l, tmp[1] + tmp[2] * kerb * l];
  }
  private queueSlot(v: Vendor, i: number): [number, number] {
    return this.onStallSidewalk(v, 1.3 + i * 0.85, Math.max(0, v.kl - 0.5));
  }
  private placeQueue(v: Vendor) {
    v.queue.forEach((q, i) => {
      if (!q.alive) return;
      const [x, z] = this.queueSlot(v, i);
      if (q.state === 'queue') { q.state = 'free'; q.then = 'queue'; }
      q.tx = x; q.tz = z;
    });
  }

  /** Ambient passers-by join queues (lunch and dawn rushes); monte draws a small crowd. */
  private customers(dt: number) {
    const S = this.S, h = S.minute / 60;
    for (const v of this.list.values()) {
      if (v.state !== 'open' && v.state !== 'serving') continue;
      if (v.kind === 'monte') continue;
      if (v.queue.length >= v.def.queue) continue;
      const rush = v.kind === 'coffee_cart' ? (h >= 6 && h < 9 ? 3 : 1) : (h >= 11.5 && h < 14 ? 2.5 : h >= 17 && h < 19 ? 1.6 : 1);
      S.pGrid.query(v.x, v.z, 7, (i) => {
        if (v.queue.length >= v.def.queue) return;
        const q = S.peds[i];
        if (!q || !q.alive || q.vendor || q.goal || q.cop2 || q.state !== 'walk' || (q.buyCd ?? 0) > S.t || q.onRoad || q.edge !== v.edge) return; // same stretch of sidewalk (no cutting corners)
        if (!['walker', 'commuter', 'loiterer', 'worker'].includes(q.arch.behaviour)) return;
        if (!S.rng.chance(v.def.pull * rush * dt * 2)) return;
        q.buyCd = S.t + 300; q.vendor = v.id;
        v.queue.push(q);
        const [x, z] = this.queueSlot(v, v.queue.length - 1);
        q.toEdge = q.edge; q.toS = q.s; q.state = 'free'; q.tx = x; q.tz = z; q.then = 'queue';
      });
    }
  }

  private monteCrowd(v: Vendor) {
    const S = this.S;
    v.watchers = v.watchers.filter((q) => q.alive && q.state === 'watch' || q.state === 'free' && q.then === 'watch');
    if (v.watchers.length >= 4) return;
    S.pGrid.query(v.cx, v.cz, 9, (i) => {
      if (v.watchers.length >= 4) return;
      const q = S.peds[i];
      if (!q || !q.alive || q.vendor || q.goal || q.cop2 || q.state !== 'walk' || (q.buyCd ?? 0) > S.t || q.onRoad || q.edge !== v.edge) return; // same stretch of sidewalk (no cutting corners)
      if (!S.rng.chance(0.02)) return;
      q.buyCd = S.t + 400; q.vendor = v.id;
      // in a loose bunch beside the box along the sidewalk (never out into the street)
      const [tx, tz] = this.onStallSidewalk(v, S.rng.range(1.2, 2.4), S.rng.range(-0.5, 0.5));
      q.toEdge = q.edge; q.toS = q.s; q.state = 'free'; q.tx = tx; q.tz = tz; q.then = 'watch';
      v.watchers.push(q);
    });
    for (const q of v.watchers) if (q.state === 'watch') q.yaw = Math.atan2(-(v.cx - q.x), -(v.cz - q.z));
  }

  /** Police near unlicensed trade: peddlers pack up and move on; monte crews bolt. */
  private copCheck(v: Vendor) {
    if (v.licensed) return;
    const S = this.S, R = v.kind === 'monte' ? 25 : 15;
    const lookout = v.kind === 'monte' ? v.crew[v.crew.length - 1] ?? v.ped! : v.ped!;
    const cop = this.copNear(lookout.x, lookout.z, R);
    // a peddler only packs up when the cop lingers (a passing beat cop sometimes looks the other way)
    if (!cop || !S.rng.chance(v.kind === 'monte' ? 0.02 : 0.08)) return; // ~0.6 s for the lookout to call it
    const c = cop as { x: number; z: number };
    if (v.kind === 'monte') {
      this.scatters++;
      S.emit('monteScatter', { id: v.id, x: v.cx, z: v.cz, lookout: lookout.id });
      for (const q of [v.ped!, ...v.crew]) if (q.alive) this.release(q, true, c.x, c.z);
      for (const q of v.watchers) if (q.alive) { q.vendor = undefined; if (q.state === 'watch') q.timer = 0; }
      this.closed.set(v.spot, S.t + 3600);
      this.list.delete(v.id);
      S.emit('vendorGone', { id: v.id, kind: v.kind, reason: 'police' });
    } else {
      this.movedOn++;
      S.emit('peddlerMovedOn', { id: v.id, x: v.x, z: v.z });
      for (const q of v.queue) if (q.alive) { q.vendor = undefined; if (q.state === 'queue') q.timer = 0; }
      this.release(v.ped!, false);
      this.closed.set(v.spot, S.t + 1800);
      this.list.delete(v.id);
      S.emit('vendorGone', { id: v.id, kind: v.kind, reason: 'movedOn' });
    }
  }

  /** Someone tearing past the cart: the vendor shouts after them. */
  private trafficCheck(v: Vendor, dt: number) {
    const S = this.S;
    if ((v.shoutCd -= dt) > 0) return;
    for (const a of S.actors) {
      const sp = Math.hypot(a.vx, a.vz);
      if (a.kind === 'vehicle' && sp > 11 && Math.hypot(a.x - v.cx, a.z - v.cz) < 7) { v.shoutCd = 20; S.emit('vendorShout', { id: v.id, at: a.id, x: v.x, z: v.z }); return; }
    }
  }

  /** Gunfire / threat near the stall (called from threaten()). */
  onThreat(x: number, z: number, r: number) {
    const S = this.S;
    for (const v of this.list.values()) {
      if (!v.ped || v.state === 'released' || v.state === 'fled' || v.state === 'leaving') continue;
      const d = Math.hypot(v.x - x, v.z - z); if (d > r * 1.6) continue;
      if (v.kind === 'monte') { // the game's over
        for (const q of [v.ped, ...v.crew]) if (q.alive) this.release(q, true, x, z);
        this.list.delete(v.id); this.closed.set(v.spot, S.t + 3600);
        S.emit('vendorGone', { id: v.id, kind: v.kind, reason: 'fled' }); continue;
      }
      for (const q of v.queue) if (q.alive) { q.vendor = undefined; if (q.state === 'queue') q.timer = 0; }
      v.queue = []; v.serving = null;
      if (v.ped.nerve > 0.5 || (v.def.prop && S.rng.chance(0.5))) { // duck behind the cart
        v.state = 'cower'; v.timer = S.rng.range(8, 16); v.ped.state = 'cower';
        v.ped.x = v.x + (v.x - v.cx) * 0.3; v.ped.z = v.z + (v.z - v.cz) * 0.3;
        S.emit('vendorCower', { id: v.id });
      } else {
        v.state = 'fled'; v.timer = 40; this.release(v.ped, true, x, z);
        S.emit('vendorFled', { id: v.id });
      }
    }
  }

  // ---------------------------------------------------------------- gameplay
  command(id: string, cmd: { type: 'flee' | 'cower'; x?: number; z?: number }): boolean {
    const v = this.list.get(id); if (!v || !v.ped) return false;
    const x = cmd.x ?? v.x + 3, z = cmd.z ?? v.z;
    if (cmd.type === 'cower') { v.state = 'cower'; v.timer = 12; v.ped.state = 'cower'; return true; }
    v.state = 'fled'; v.timer = 40; this.release(v.ped, true, x, z); return true;
  }
  notice(n: { kind: string; vendor: string; good?: string }): boolean {
    const S = this.S, v = this.list.get(n.vendor); if (!v || !v.ped) return false;
    if (n.kind === 'cartOverturned') { v.state = 'righting'; v.timer = S.rng.range(6, 10); for (const q of v.queue) if (q.alive && q.state === 'queue') q.timer = 0; v.queue = []; S.emit('vendorAct', { id: v.id, pedId: v.ped.id, act: 'right_cart' }); return true; }
    if (n.kind === 'vendorSale') { S.emit('vendorAct', { id: v.id, pedId: v.ped.id, act: 'serve', good: n.good ?? '' }); return true; }
    if (n.kind === 'monteFolded') {
      for (const q of [v.ped, ...v.crew]) if (q.alive) this.release(q, false);
      for (const q of v.watchers) if (q.alive) { q.vendor = undefined; if (q.state === 'watch') q.timer = 0; }
      this.list.delete(v.id); this.closed.set(v.spot, S.t + 3 * 3600);
      S.emit('vendorGone', { id: v.id, kind: v.kind, reason: 'folded' }); return true;
    }
    return false;
  }
  /** A vendor ped handed to gameplay (brawl) / given back. */
  setReleased(pedId: number, released: boolean) {
    for (const v of this.list.values()) if (v.ped?.id === pedId) { v.state = released ? 'released' : 'open'; if (!released) { v.ped.state = 'vendor'; v.ped.x = v.x; v.ped.z = v.z; v.ped.vendor = v.id; } }
  }

  get count() { return this.list.size; }
  byKind() { const o: Record<string, number> = {}; for (const v of this.list.values()) o[v.kind] = (o[v.kind] ?? 0) + 1; return o; }

  private writeViews() {
    const out = this.views; out.length = 0;
    for (const v of this.list.values()) {
      out.push({
        id: v.id, kind: v.kind, pedId: v.ped?.id ?? -1, crew: v.crew.map((q) => q.id), state: v.state, prop: v.def.prop,
        cartX: v.cx, cartZ: v.cz, cartYaw: v.cyaw, open: v.state === 'open' || v.state === 'serving',
        umbrella: v.def.rain === 'umbrella' && (this.S.weather === 'rain' || v.kind === 'hot_dog'), queue: v.queue.length, variant: v.variant, goods: v.goods,
      });
    }
  }
}
