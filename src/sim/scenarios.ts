/**
 * Ambient scenarios (oversight gap list item 4; RDR2's ambient vignettes): small sets of people doing something
 * on the street, placed out of sight around the focus by time of day and weather, ending on their own.
 *
 *  - stoop: 1-3 neighbours sitting on a stoop (afternoon/evening; more on warm evenings).   act `sitStoop`
 *  - cards: a card game on a crate by a stoop, 3-4 players and a watcher (afternoon/evening, dry).  act `playCards`, `watch`
 *  - hydrant: an open hydrant on a hot afternoon (>= 85 F), adults cooling off in the spray on the sidewalk;
 *    prop `hydrant_spray` aimed at the street.   act `cooloff`, `watch`   (adults only: the spawn tables have no children)
 *  - drunk: at night a walker staggers (slow, weaving; PedView state `drunk`), or one sits slumped in a doorway.  act `slumped`
 *  - sweep: shop owners sweeping the sidewalk in front of their store in the morning.   act `sweep` (moves a little)
 *
 * Views: `Simulation.scenarioViews` -> `{id, kind, x, z, heading, prop, peds}` for props (crate + cards, broom,
 * hydrant spray). Events: `scenarioStart` / `scenarioEnd {id, kind, x, z}`. People are ordinary peds in `act:<name>`
 * who walk off when the scenario ends (or are despawned out of sight when the player is far away).
 */
import type { SimCore, Ped } from './state';
import { hiddenSpawn } from './state';
import { SpotKind } from './laneFormat';
import { projectOnPoly, sampleAt } from './geom';
import { despawnPed, rejoinSidewalk, setPedGoal, spawnPedNear } from './peds';
import type { ArchetypeRt } from './archetypes';

export type ScenarioKind = 'stoop' | 'cards' | 'hydrant' | 'drunk' | 'sweep';
export interface ScenarioView { id: number; kind: ScenarioKind; x: number; z: number; heading: number; prop: string; peds: number[] }
interface Scenario extends ScenarioView { until: number; spot: number; t0: number; base?: { x: number; z: number; tx: number; tz: number } }

const tmp = [0, 0, 0, 0];

export class Scenarios {
  private list: Scenario[] = [];
  private nextId = 1;
  private nextCheck = 0;
  private byKind = new Map<number, number[]>();
  private drunks = new Map<number, { until: number; speed: number }>();
  /** degrees Fahrenheit (gameplay/weather sets it; drives the open hydrants) */
  tempF = 75;
  started: Record<string, number> = {};
  views: ScenarioView[] = [];

  constructor(private S: SimCore, private hydrants: (x: number, z: number, r: number) => { x: number; z: number }[]) {
    S.net.g.spots.forEach((sp, i) => { (this.byKind.get(sp.kind) ?? this.byKind.set(sp.kind, []).get(sp.kind)!).push(i); });
  }

  /** how many of each kind we want around the focus right now */
  private wanted(): Record<ScenarioKind, number> {
    const S = this.S, h = S.minute / 60, dry = S.weather !== 'rain', warm = this.tempF >= 70;
    return {
      stoop: dry && h >= 11 && h < 22.5 ? (h >= 17 && warm ? 5 : 3) : 0,
      cards: dry && h >= 13 && h < 22 ? (warm ? 2 : 1) : 0,
      hydrant: S.weather === 'clear' && this.tempF >= 85 && h >= 11.5 && h < 20 ? 1 : 0,
      drunk: h >= 22 || h < 4 ? 3 : 0,
      sweep: h >= 6.5 && h < 10 ? 3 : 0,
    };
  }

  step(dt: number) {
    const S = this.S;
    for (const sc of this.list) this.tick(sc, dt);
    for (const [id, d] of this.drunks) {
      const p = S.pedById.get(id);
      if (!p || !p.alive) { this.drunks.delete(id); continue; }
      if (S.t > d.until || p.state === 'flee') { p.speed = d.speed; this.drunks.delete(id); continue; }
      if (p.state === 'walk') { const half = S.net.g.walkEdges[p.edge].half; p.latGoal = Math.sin(S.t * 0.9 + id) * half * 0.55; }
    }
    if (S.t >= this.nextCheck) {
      this.nextCheck = S.t + 2;
      // retire: ended, or far behind the player and out of sight
      for (const sc of this.list) {
        const d = Math.hypot(sc.x - S.focus.x, sc.z - S.focus.z);
        if (S.t > sc.until) this.end(sc, false);
        else if (d > 190 && hiddenSpawn(S, sc.x, sc.z, 30)) this.end(sc, true);
      }
      this.list = this.list.filter((sc) => sc.until >= 0);
      const want = this.wanted();
      for (const kind of Object.keys(want) as ScenarioKind[]) {
        const have = this.list.filter((sc) => sc.kind === kind && Math.hypot(sc.x - S.focus.x, sc.z - S.focus.z) < 170).length;
        if (have < want[kind]) this.start(kind);
      }
    }
    this.views = this.list.map(({ id, kind, x, z, heading, prop, peds }) => ({ id, kind, x, z, heading, prop, peds }));
  }

  private walker(x: number, z: number, pred?: (a: ArchetypeRt) => boolean): ArchetypeRt | undefined {
    const S = this.S;
    return S.reg.pick((a) => (a.behaviour === 'walker' || a.behaviour === 'loiterer' || a.behaviour === 'commuter') && (!pred || pred(a)), x, z, S.minute, S.rng.next()) ?? undefined;
  }

  private place(sc: Scenario, x: number, z: number, yaw: number, act: string, arch?: ArchetypeRt): Ped | null {
    const S = this.S;
    const a = arch ?? this.walker(x, z); if (!a) return null;
    const p = spawnPedNear(S, x, z, a, 12); if (!p) return null;
    setPedGoal(S, p, { kind: 'act', name: act, duration: Infinity });
    p.x = x; p.z = z; p.px = x; p.pz = z; p.yaw = yaw; p.pyaw = yaw;
    sc.peds.push(p.id);
    return p;
  }

  /** a free spot of `kinds` 35-160 m from the focus, out of sight */
  private findSpot(kinds: number[]): number {
    const S = this.S, f = S.focus;
    let best = -1, bd = Infinity;
    for (const k of kinds) for (const i of this.byKind.get(k) ?? []) {
      const sp = S.net.g.spots[i], d = Math.hypot(sp.x - f.x, sp.z - f.z);
      if (d < 35 || d > 160 || S.spotOwner[i] >= 0 || this.list.some((sc) => sc.spot === i || Math.hypot(sc.x - sp.x, sc.z - sp.z) < 12)) continue;
      if (!hiddenSpawn(S, sp.x, sp.z, 30)) continue;
      const score = d + S.rng.next() * 60;
      if (score < bd) { bd = score; best = i; }
    }
    return best;
  }

  private start(kind: ScenarioKind) {
    const S = this.S, g = S.net.g;
    const sc: Scenario = { id: this.nextId, kind, x: 0, z: 0, heading: 0, prop: '', peds: [], until: S.t + S.rng.range(240, 600), spot: -1, t0: S.t };
    if (kind === 'drunk' && S.rng.chance(0.6)) {
      // a walker out of sight starts weaving home
      const cands = S.peds.filter((p) => p.alive && p.state === 'walk' && !p.goal && !p.cop2 && !p.vendor && !this.drunks.has(p.id) && hiddenSpawn(S, p.x, p.z, 30) && Math.hypot(p.x - S.focus.x, p.z - S.focus.z) < 150);
      if (!cands.length) return;
      const p = cands[S.rng.int(cands.length)];
      this.drunks.set(p.id, { until: S.t + S.rng.range(300, 900), speed: p.speed });
      p.speed *= 0.55;
      this.started.drunk = (this.started.drunk ?? 0) + 1;
      S.emit('scenarioStart', { id: 0, kind: 'drunk', x: p.x, z: p.z, peds: [p.id], walking: true });
      return;
    }
    if (kind === 'hydrant') {
      const f = S.focus;
      const hs = this.hydrants(f.x, f.z, 150).filter((h) => Math.hypot(h.x - f.x, h.z - f.z) > 35 && hiddenSpawn(S, h.x, h.z, 30) && !this.list.some((sc) => Math.hypot(sc.x - h.x, sc.z - h.z) < 30));
      if (!hs.length) return;
      const h = hs[S.rng.int(hs.length)];
      // the street side of the sidewalk here
      let be = -1, bd = 12, bs = 0;
      for (const e of S.net.sidewalksNear(h.x, h.z, 12, new Set())) { const pr = projectOnPoly(g.walkEdges[e].pts, h.x, h.z); if (pr.d < bd) { bd = pr.d; be = e; bs = pr.s; } }
      if (be < 0) return;
      const E = g.walkEdges[be]; sampleAt(E.pts, S.net.walkCum[be], bs, tmp);
      const kx = tmp[3] * E.side, kz = -tmp[2] * E.side; // unit vector toward the kerb
      sc.x = h.x; sc.z = h.z; sc.heading = Math.atan2(-kx, -kz); sc.prop = 'hydrant_spray';
      sc.until = S.t + S.rng.range(600, 1200);
      // the spray crosses the kerb into the gutter; people stand on the sidewalk in and around it
      const n = 3 + S.rng.int(3);
      for (let k = 0; k < n; k++) {
        const back = S.rng.range(0.8, Math.max(1, E.half * 1.6)), along = S.rng.range(-2.5, 2.5);
        const x = h.x - kx * back + tmp[2] * along, z = h.z - kz * back + tmp[3] * along;
        this.place(sc, x, z, Math.atan2(x - h.x, z - h.z), k < n - 1 ? 'cooloff' : 'watch');
      }
    } else {
      const kinds = kind === 'sweep' ? [SpotKind.Storefront] : kind === 'drunk' ? [SpotKind.Stoop, SpotKind.Storefront] : [SpotKind.Stoop];
      const i = this.findSpot(kinds); if (i < 0) return;
      const sp = g.spots[i], fx = -Math.sin(sp.heading), fz = -Math.cos(sp.heading), rx = fz, rz = -fx;
      sc.spot = i; S.spotOwner[i] = 1e9 + sc.id; sc.x = sp.x; sc.z = sp.z; sc.heading = sp.heading;
      const at = (f: number, r: number) => [sp.x + fx * f + rx * r, sp.z + fz * f + rz * r] as const;
      if (kind === 'stoop') {
        const n = 1 + S.rng.int(3);
        for (let k = 0; k < n; k++) { const [x, z] = at(0.15 + S.rng.range(0, 0.25), (k - (n - 1) / 2) * 0.75); this.place(sc, x, z, sp.heading + S.rng.range(-0.4, 0.4), 'sitStoop'); }
      } else if (kind === 'cards') {
        const [tx, tz] = at(1.2, 0); sc.x = tx; sc.z = tz; sc.prop = 'card_crate';
        const n = 3 + S.rng.int(2);
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2, x = tx + Math.cos(ang) * 0.75, z = tz + Math.sin(ang) * 0.75;
          this.place(sc, x, z, Math.atan2(x - tx, z - tz), 'playCards');
        }
        const [wx, wz] = at(1.4, 1.5); this.place(sc, wx, wz, Math.atan2(wx - tx, wz - tz), 'watch');
      } else if (kind === 'sweep') {
        const [x, z] = at(0.9, 0); sc.prop = 'broom'; sc.until = S.t + S.rng.range(120, 300);
        const p = this.place(sc, x, z, sp.heading + Math.PI / 2, 'sweep');
        if (p) sc.base = { x, z, tx: rx, tz: rz };
      } else { // drunk slumped in a doorway
        const [x, z] = at(0.3, 0); sc.until = S.t + S.rng.range(300, 900);
        this.place(sc, x, z, sp.heading, 'slumped');
      }
    }
    if (!sc.peds.length) { if (sc.spot >= 0) S.spotOwner[sc.spot] = -1; return; }
    this.nextId++;
    this.list.push(sc);
    this.started[kind] = (this.started[kind] ?? 0) + 1;
    S.emit('scenarioStart', { id: sc.id, kind, x: sc.x, z: sc.z, peds: sc.peds.slice(), prop: sc.prop });
  }

  private tick(sc: Scenario, dt: number) {
    const S = this.S;
    if (sc.kind === 'sweep' && sc.base) {
      // a slow push along the storefront and back
      const p = S.pedById.get(sc.peds[0]);
      if (p && p.alive && p.state === 'act') {
        const u = Math.sin((S.t - sc.t0) * 0.35) * 1.2;
        p.px = p.x; p.pz = p.z; p.x = sc.base.x + sc.base.tx * u; p.z = sc.base.z + sc.base.tz * u; p.v = Math.hypot(p.x - p.px, p.z - p.pz) / dt;
      }
    }
  }

  private end(sc: Scenario, despawn: boolean) {
    const S = this.S;
    for (const id of sc.peds) {
      const p = S.pedById.get(id); if (!p || !p.alive || p.state !== 'act') continue;
      if (despawn) despawnPed(S, p); else rejoinSidewalk(S, p);
    }
    if (sc.spot >= 0 && S.spotOwner[sc.spot] === 1e9 + sc.id) S.spotOwner[sc.spot] = -1;
    S.emit('scenarioEnd', { id: sc.id, kind: sc.kind, x: sc.x, z: sc.z });
    sc.until = -1;
  }

  isDrunk(id: number) { return this.drunks.has(id); }
}
