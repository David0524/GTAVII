/**
 * Wildlife: pigeon flocks and rat swarms (user: "Definitely should be some pigeons and rats").
 *
 * Flocks and swarms are activated per wildlife place (lanes.bin 'WILD') near the focus only (LOD),
 * sized deterministically per place and hour, weighted by the `npc.pigeon_flock` / `npc.rat_swarm`
 * archetypes (density day/night, schedule). Output is one WildlifeView per animal so the renderer can
 * instance them; nothing is simulated beyond the activation radius.
 *
 * Pigeons peck and shuffle around their spot, burst up when someone runs through them, a car brushes
 * the kerb, the player gets close, or a gun goes off; they arc up to a nearby ledge or rooftop coop,
 * perch, and drift back down later. Old men feed them in the parks by day.
 * Rats skitter around kerbside trash and subway entrances (mostly at night), and vanish from
 * footsteps and headlights. Startle, never damage.
 */
import { heightAt, CURB_HEIGHT } from '../shared/terrain';
import { hash2, sampleAt } from './geom';
import { WalkKind } from './laneFormat';
const tmp4 = [0, 0, 0, 0];
import { WildKind, type WildSpot } from './laneFormat';
import type { SimCore, Ped } from './state';
import type { ArchetypeRt } from './archetypes';
import { spawnPedNear } from './peds';

export interface WildlifeView {
  id: number; species: 'pigeon' | 'rat' | 'cat' | 'dog';
  x: number; y: number; z: number; yaw: number; speed: number;
  /** pigeon: peck | walk | fly | perch ; rat/cat: scurry | dash | flee ; dog: trot | sniff | flee */
  state: string; variant: number;
}

interface Animal {
  id: number; variant: number; state: string;
  x: number; y: number; z: number; yaw: number; speed: number;
  px: number; py: number; pz: number; pyaw: number;
  tx: number; tz: number; timer: number;
  // flight (quadratic bezier from f to e via c)
  fx: number; fy: number; fz: number; cx: number; cy: number; cz: number; ex: number; ey: number; ez: number;
  u: number; dur: number; delay: number; hidden: boolean;
}
interface Group {
  spot: number; kind: number; animals: Animal[];
  /** pigeons: index of the place they currently sit on (home or a ledge) */
  at: number; mode: 'ground' | 'air' | 'perch'; timer: number;
  cx: number; cz: number; feeder: number; hour: number; cat?: boolean;
}

/** A stray dog trotting the sidewalk graph. */
interface Dog extends Animal { edge: number; s: number; dir: number; lat: number }

const PIGEON_R = 110, RAT_R = 55;
const groundY = (x: number, z: number) => heightAt(x, z) + CURB_HEIGHT;

export class Wildlife {
  readonly views: WildlifeView[] = [];
  private groups = new Map<number, Group>();
  private scanT = 0;
  private nextId = 1;
  startles = 0; scatters = 0; feeders = 0;
  private ledges: number[];

  constructor(private S: SimCore, private spots: WildSpot[], private maxBirds: number, private maxRats: number) {
    this.ledges = spots.map((_, i) => i).filter((i) => spots[i].kind === WildKind.PigeonLedge || spots[i].kind === WildKind.PigeonCoop);
  }

  private arch(id: string): ArchetypeRt | undefined { return this.S.reg.list.find((a) => a.def.id === id); }
  private isPigeon(k: number) { return k <= WildKind.PigeonCoop; }
  private counts() { let b = 0, r = 0; for (const g of this.groups.values()) if (this.isPigeon(g.kind)) b += g.animals.length; else r += g.animals.length; return [b, r]; }

  private spotY(i: number) { const w = this.spots[i]; return w.y > 0 ? heightAt(w.x, w.z) + w.y : groundY(w.x, w.z); }

  // ---------------------------------------------------------------- activation (LOD)
  private scan() {
    const S = this.S, f = S.focus, hour = Math.floor(S.minute / 60);
    for (const [i, g] of this.groups) {
      const w = this.spots[g.spot], d = Math.hypot(w.x - f.x, w.z - f.z);
      const R = this.isPigeon(g.kind) ? PIGEON_R : RAT_R;
      if (d > R + 25 || (g.hour !== hour && d > 60)) this.drop(i, g);
    }
    let [birds, rats] = this.counts();
    // stray cats at the kerbside trash, mostly at night (key offset so they coexist with the rats)
    const night = S.minute < 6 * 60 || S.minute >= 20 * 60;
    for (let i = 0; i < this.spots.length; i++) {
      const w = this.spots[i]; if (w.kind !== WildKind.RatTrash) continue;
      const key = 1e6 + i; if (this.groups.has(key)) continue;
      if (Math.hypot(w.x - f.x, w.z - f.z) > RAT_R || rats >= this.maxRats) continue;
      const roll = (hash2(i * 3.1 + hour, w.z - w.x) % 10000) / 10000;
      if (roll >= (night ? 0.3 : 0.05)) continue;
      const g: Group = { spot: i, kind: WildKind.RatTrash, animals: [this.newAnimal({ spot: i, kind: WildKind.RatTrash } as Group, 0)], at: i, mode: 'ground', timer: 0, cx: w.x, cz: w.z, feeder: -1, hour, cat: true };
      this.groups.set(key, g); rats++;
    }
    const pa = this.arch('npc.pigeon_flock'), ra = this.arch('npc.rat_swarm');
    for (let i = 0; i < this.spots.length; i++) {
      if (this.groups.has(i)) continue;
      const w = this.spots[i], pigeon = this.isPigeon(w.kind);
      const d = Math.hypot(w.x - f.x, w.z - f.z);
      if (d > (pigeon ? PIGEON_R : RAT_R)) continue;
      const a = pigeon ? pa : ra; if (!a) continue;
      // deterministic per place and hour: the same corner has the same flock all hour
      const roll = (hash2(i * 7.3 + hour, w.x + w.z) % 10000) / 10000;
      let p = S.reg.weight(a, w.x, w.z, S.minute) * (S.weather === 'rain' ? 0.5 : 1);
      if (w.kind === WildKind.PigeonPark) p = Math.min(1, p * 1.6);
      if (roll >= p) continue;
      const h = hash2(w.z + hour, i);
      const n = pigeon ? (w.kind === WildKind.PigeonPark ? 6 + (h % 13) : w.kind === WildKind.PigeonCorner ? 3 + (h % 6) : 2 + (h % 5)) : 2 + (h % 4);
      if (pigeon ? birds + n > this.maxBirds : rats + n > this.maxRats) continue;
      const g: Group = { spot: i, kind: w.kind, animals: [], at: i, mode: w.y > 0 ? 'perch' : 'ground', timer: S.rng.range(20, 90), cx: w.x, cz: w.z, feeder: -1, hour };
      for (let k = 0; k < n; k++) g.animals.push(this.newAnimal(g, k));
      this.groups.set(i, g);
      if (pigeon) birds += n; else rats += n;
      // an old man with a bag of bread crumbs, by day, in the parks
      if (w.kind === WildKind.PigeonPark && S.minute > 8 * 60 && S.minute < 18 * 60 && h % 4 === 0) this.addFeeder(g);
    }
  }

  private newAnimal(g: Group, k: number): Animal {
    const S = this.S, w = this.spots[g.spot];
    const rad = g.kind === WildKind.PigeonPark ? 2.6 : g.kind === WildKind.PigeonLedge || g.kind === WildKind.PigeonCoop ? 0.8 : g.kind === WildKind.PigeonCorner ? 0.8 : 0.5;
    let x = w.x, z = w.z;
    if (g.kind === WildKind.PigeonLedge) { const along = (k - 2) * 0.45; x += Math.cos(w.heading) * along; z -= Math.sin(w.heading) * along; }
    else { const a = S.rng.next() * Math.PI * 2, r = Math.sqrt(S.rng.next()) * rad; x += Math.cos(a) * r; z += Math.sin(a) * r; }
    const y = this.spotY(g.spot);
    const yaw = g.kind === WildKind.PigeonLedge ? w.heading : S.rng.range(-Math.PI, Math.PI);
    return { id: this.nextId++, variant: S.rng.int(1 << 20), state: this.isPigeon(g.kind) ? (w.y > 0 ? 'perch' : 'peck') : 'scurry',
      x, y, z, yaw, speed: 0, px: x, py: y, pz: z, pyaw: yaw, tx: x, tz: z, timer: S.rng.range(0.3, 2),
      fx: 0, fy: 0, fz: 0, cx: 0, cy: 0, cz: 0, ex: 0, ey: 0, ez: 0, u: 0, dur: 1, delay: 0, hidden: !this.isPigeon(g.kind) && S.rng.chance(0.4) };
  }

  private drop(i: number, g: Group) {
    if (g.feeder >= 0) { const p = this.S.pedById.get(g.feeder); if (p && p.state === 'feed') p.timer = 0; }
    this.groups.delete(i);
  }

  private addFeeder(g: Group) {
    const S = this.S, w = this.spots[g.spot];
    const arch = this.arch('npc.pigeon_feeder');
    if (!arch) return;
    const p: Ped | null = spawnPedNear(S, w.x, w.z, arch, 40);
    if (!p) return;
    // sits a little off the flock centre; the flock gathers round his feet
    const a = S.rng.next() * Math.PI * 2;
    p.tx = w.x + Math.cos(a) * 1.6; p.tz = w.z + Math.sin(a) * 1.6;
    p.state = 'free'; p.then = 'feed'; p.toEdge = p.edge; p.toS = p.s;
    g.feeder = p.id; g.cx = p.tx; g.cz = p.tz; this.feeders++;
  }

  // ---------------------------------------------------------------- startle sources
  private disturbance(x: number, z: number, r: number, rats: boolean): string {
    const S = this.S;
    let why = '';
    S.pGrid.query(x, z, r, (i) => {
      if (why) return;
      const p = S.peds[i]; if (!p.alive || p.id === this.feederOf(x, z)) return;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d > r) return;
      if (p.v > 2.2 || (rats && p.v > 0.4) || d < (rats ? 2.5 : 1.0)) why = 'ped';
    });
    if (why) return why;
    for (const a of S.actors) {
      const d = Math.hypot(a.x - x, a.z - z), sp = Math.hypot(a.vx, a.vz);
      if (d < r + 1 && (sp > 2 || d < (rats ? 4 : 2) || a.kind === 'vehicle')) return a.kind === 'player' ? 'player' : 'vehicle';
    }
    S.vGrid.query(x, z, r + 4, (i) => {
      if (why) return;
      const v = S.vehicles[i];
      const d = Math.hypot(v.x - x, v.z - z);
      if (rats && d < 9 && v.lights & 1) why = 'headlights';
      else if (d < r && v.v > 3) why = 'car';
    });
    return why;
  }
  private feederOf(x: number, z: number) { for (const g of this.groups.values()) if (g.feeder >= 0 && Math.hypot(g.cx - x, g.cz - z) < 4) return g.feeder; return -1; }

  /** Gunfire / threat: everything within range takes off or bolts. */
  alarm(x: number, z: number, r: number) {
    for (const g of this.groups.values()) {
      if (Math.hypot(g.cx - x, g.cz - z) > r) continue;
      if (this.isPigeon(g.kind)) this.takeOff(g, 'gunfire'); else this.scatter(g, 'gunfire');
    }
  }

  // ---------------------------------------------------------------- pigeons
  private takeOff(g: Group, cause: string) {
    const S = this.S;
    if (g.mode === 'air') return;
    const from = this.spots[g.at];
    // land on the nearest ledge/coop 15-120 m away (not the one we're on); else circle and come back
    let best = -1, bd = Infinity;
    for (const i of this.ledges) {
      if (i === g.at) continue;
      const w = this.spots[i], d = Math.hypot(w.x - from.x, w.z - from.z);
      if (d > 15 && d < 120 && d < bd) { bd = d; best = i; }
    }
    const target = cause === 'return' ? g.spot : best >= 0 ? best : g.at;
    const ty = this.spotY(target), tw = this.spots[target];
    for (const b of g.animals) {
      b.fx = b.x; b.fy = b.y; b.fz = b.z;
      const ox = S.rng.range(-1.8, 1.8), oz = S.rng.range(-1.8, 1.8);
      const sp = tw.y > 0 ? 0.4 : tw.kind === WildKind.PigeonPark ? 1 : 0.4;
      b.ex = tw.x + ox * sp; b.ez = tw.z + oz * sp; b.ey = tw.y > 0 ? ty : groundY(b.ex, b.ez);
      const dist = Math.hypot(b.ex - b.fx, b.ez - b.fz);
      const lift = target === g.at ? 14 : Math.max(6, dist * 0.35);
      b.cx = (b.fx + b.ex) / 2 + (target === g.at ? S.rng.range(-12, 12) : 0); b.cz = (b.fz + b.ez) / 2 + (target === g.at ? S.rng.range(-12, 12) : 0);
      b.cy = Math.max(b.fy, b.ey) + lift;
      b.u = 0; b.dur = Math.max(2.5, dist / 9 + 1.2); b.delay = cause === 'return' ? S.rng.range(0, 4) : S.rng.range(0, 0.35);
      b.state = 'fly';
    }
    g.mode = 'air'; g.at = target;
    if (cause !== 'return') { this.startles++; S.emit('flockStartle', { x: from.x, z: from.z, count: g.animals.length, cause }); }
  }

  private stepPigeons(g: Group, dt: number) {
    const S = this.S, w = this.spots[g.spot];
    if (g.mode === 'air') {
      let landed = 0;
      for (const b of g.animals) {
        if (b.delay > 0) { b.delay -= dt; landed += 0; continue; }
        b.u = Math.min(1, b.u + dt / b.dur);
        const u = b.u, a = (1 - u) * (1 - u), c = 2 * u * (1 - u), e = u * u;
        const nx = a * b.fx + c * b.cx + e * b.ex, ny = a * b.fy + c * b.cy + e * b.ey, nz = a * b.fz + c * b.cz + e * b.ez;
        b.speed = Math.hypot(nx - b.x, nz - b.z) / dt;
        if (Math.hypot(nx - b.x, nz - b.z) > 1e-3) b.yaw = Math.atan2(-(nx - b.x), -(nz - b.z));
        b.x = nx; b.y = ny; b.z = nz;
        if (b.u >= 1) { landed++; b.state = this.spots[g.at].y > 0 ? 'perch' : 'peck'; b.speed = 0; b.tx = b.x; b.tz = b.z; }
      }
      if (landed === g.animals.length) { g.mode = this.spots[g.at].y > 0 ? 'perch' : 'ground'; g.timer = S.rng.range(25, 90); }
      return;
    }
    const here = this.spots[g.at];
    const cx = g.at === g.spot ? g.cx : here.x, cz = g.at === g.spot ? g.cz : here.z;
    // disturbed?
    if (g.mode === 'ground') {
      const why = this.disturbance(cx, cz, g.kind === WildKind.PigeonPark ? 4 : 3.5, false);
      if (why) { this.takeOff(g, why); return; }
    }
    g.timer -= dt;
    if (g.mode === 'perch') {
      // drift back down to the home ground spot when it's quiet there
      if (g.timer <= 0 && w.y === 0 && g.at !== g.spot && !this.disturbance(g.cx, g.cz, 6, false)) this.takeOff(g, 'return');
      else if (g.timer <= 0) g.timer = 20;
      return;
    }
    const feeding = g.feeder >= 0;
    for (const b of g.animals) {
      b.timer -= dt;
      if (b.state === 'walk') {
        const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
        if (d < 0.05 || b.timer <= 0) { b.state = 'peck'; b.timer = S.rng.range(0.4, 2.2); b.speed = 0; }
        else { const sp = Math.min(feeding ? 0.7 : 0.45, d / dt); b.x += (dx / d) * sp * dt; b.z += (dz / d) * sp * dt; b.yaw = Math.atan2(-dx, -dz); b.speed = sp; b.y = groundY(b.x, b.z); }
      } else if (b.timer <= 0) {
        // shuffle to a new spot near the centre (closer round a feeder's feet)
        const rad = feeding ? 1.4 : g.kind === WildKind.PigeonPark ? 2.6 : 0.8;
        const a = S.rng.next() * Math.PI * 2, r = Math.sqrt(S.rng.next()) * rad;
        b.tx = cx + Math.cos(a) * r; b.tz = cz + Math.sin(a) * r;
        b.state = 'walk'; b.timer = 4;
      }
    }
  }

  // ---------------------------------------------------------------- rats
  private scatter(g: Group, cause: string) {
    const S = this.S, w = this.spots[g.spot];
    let any = false;
    for (const r of g.animals) {
      if (r.hidden || r.state === 'flee') continue;
      const a = S.rng.next() * Math.PI * 2;
      r.tx = w.x + Math.cos(a) * 0.45; r.tz = w.z + Math.sin(a) * 0.45; r.state = 'flee'; r.timer = S.rng.range(8, 25); any = true;
    }
    if (any) { this.scatters++; S.emit('ratScatter', { x: w.x, z: w.z, count: g.animals.length, cause }); }
  }

  private stepRats(g: Group, dt: number) {
    const S = this.S, w = this.spots[g.spot];
    const why = this.disturbance(w.x, w.z, g.cat ? 4 : 5, true);
    if (why) this.scatter(g, why);
    for (const r of g.animals) {
      r.timer -= dt;
      if (r.hidden) {
        if (r.timer <= 0 && !why) { r.hidden = false; r.state = 'scurry'; r.x = r.tx; r.z = r.tz; r.timer = S.rng.range(0.2, 1); }
        continue;
      }
      if (r.state === 'flee' || r.state === 'dash') {
        const dx = r.tx - r.x, dz = r.tz - r.z, d = Math.hypot(dx, dz), sp = r.state === 'flee' ? 3.5 : 2.2;
        if (d < sp * dt + 0.02) { if (r.state === 'flee') { r.hidden = true; r.speed = 0; } else { r.state = 'scurry'; r.timer = S.rng.range(0.3, 2.5); r.speed = 0; } }
        else { r.x += (dx / d) * sp * dt; r.z += (dz / d) * sp * dt; r.yaw = Math.atan2(-dx, -dz); r.speed = sp; }
      } else if (r.timer <= 0) {
        // short dash along the kerb / round the bags
        const a = S.rng.next() * Math.PI * 2, rad = S.rng.range(0.15, 0.4);
        r.tx = w.x + Math.cos(a) * rad; r.tz = w.z + Math.sin(a) * rad; r.state = 'dash';
      }
      r.y = groundY(r.x, r.z);
    }
  }

  // ---------------------------------------------------------------- tick + views
  private dogs: Dog[] = [];
  private stepDogs(dt: number) {
    const S = this.S, net = S.net, f = S.focus;
    const maxDogs = this.maxRats >= 40 ? 3 : 1;
    this.dogs = this.dogs.filter((d) => Math.hypot(d.x - f.x, d.z - f.z) < S.ringP[1] + 20);
    if (this.dogs.length < maxDogs && S.rng.chance(dt * 0.05)) for (let tries = 0; tries < 12; tries++) {
      const e = net.sidewalkIds[S.rng.int(net.sidewalkIds.length)];
      const E = net.g.walkEdges[e]; sampleAt(E.pts, net.walkCum[e], net.walkLen[e] / 2, tmp4);
      const dd = Math.hypot(tmp4[0] - f.x, tmp4[1] - f.z);
      if (dd > 30 && dd < S.ringP[0]) {
        const a = this.newAnimal({ spot: 0, kind: WildKind.RatTrash } as Group, 0);
        this.dogs.push({ ...a, edge: e, s: net.walkLen[e] / 2, dir: S.rng.chance(0.5) ? 1 : -1, lat: S.rng.range(-0.5, 0.5) * E.half, state: 'trot', hidden: false });
        break;
      }
    }
    for (const d of this.dogs) {
      d.px = d.x; d.py = d.y; d.pz = d.z; d.pyaw = d.yaw;
      d.timer -= dt;
      const scared = this.disturbance(d.x, d.z, 3, false);
      if (scared && d.state !== 'flee') { d.state = 'flee'; d.timer = S.rng.range(3, 6); }
      if (d.state === 'sniff') { d.speed = 0; if (d.timer <= 0) { d.state = 'trot'; d.timer = S.rng.range(5, 20); } }
      else {
        if (d.state === 'flee' && d.timer <= 0) d.state = 'trot';
        if (d.state === 'trot' && d.timer <= 0 && S.rng.chance(0.4)) { d.state = 'sniff'; d.timer = S.rng.range(2, 6); continue; }
        if (d.state === 'trot' && d.timer <= 0) d.timer = S.rng.range(5, 20);
        const sp = d.state === 'flee' ? 4 : 1.4;
        d.speed = sp; d.s += d.dir * sp * dt;
        const L = net.walkLen[d.edge];
        if (d.s >= L || d.s <= 0) {
          const E = net.g.walkEdges[d.edge], node = d.s >= L ? E.b : E.a;
          const opts = net.walkAdj[node].filter(([e2]) => e2 !== d.edge && net.g.walkEdges[e2].kind === WalkKind.Sidewalk);
          if (!opts.length) { d.dir = -d.dir; d.s = Math.max(0, Math.min(L, d.s)); }
          else { const [e2] = opts[S.rng.int(opts.length)]; const N = net.g.walkEdges[e2]; d.edge = e2; d.dir = N.a === node ? 1 : -1; d.s = d.dir > 0 ? 0 : net.walkLen[e2]; d.lat = Math.max(-N.half, Math.min(N.half, d.lat)); }
        }
      }
      const E = net.g.walkEdges[d.edge];
      sampleAt(E.pts, net.walkCum[d.edge], Math.max(0, Math.min(net.walkLen[d.edge], d.s)), tmp4);
      d.x = tmp4[0] - tmp4[3] * d.lat; d.z = tmp4[1] + tmp4[2] * d.lat; d.y = groundY(d.x, d.z);
      d.yaw = Math.atan2(-tmp4[2] * d.dir, -tmp4[3] * d.dir);
    }
  }

  step(dt: number) {
    this.stepDogs(dt);
    if ((this.scanT -= dt) <= 0) { this.scanT = 1; this.scan(); }
    for (const g of this.groups.values()) {
      for (const a of g.animals) { a.px = a.x; a.py = a.y; a.pz = a.z; a.pyaw = a.yaw; }
      if (this.isPigeon(g.kind)) this.stepPigeons(g, dt); else this.stepRats(g, dt);
    }
  }

  writeViews(alpha: number) {
    const out = this.views;
    let n = 0;
    for (const g of this.groups.values()) {
      const species = this.isPigeon(g.kind) ? 'pigeon' : g.cat ? 'cat' : 'rat';
      for (const a of g.animals) {
        if (a.hidden) continue;
        const o = out[n] ?? (out[n] = { id: 0, species: 'pigeon' as WildlifeView['species'], x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
        o.id = a.id; o.species = species; o.variant = a.variant; o.state = a.state; o.speed = a.speed;
        o.x = a.px + (a.x - a.px) * alpha; o.y = a.py + (a.y - a.py) * alpha; o.z = a.pz + (a.z - a.pz) * alpha; o.yaw = a.yaw;
        n++;
      }
    }
    for (const d of this.dogs) {
      const o = out[n] ?? (out[n] = { id: 0, species: 'dog', x: 0, y: 0, z: 0, yaw: 0, speed: 0, state: '', variant: 0 });
      o.id = d.id; o.species = 'dog'; o.variant = d.variant; o.state = d.state; o.speed = d.speed;
      o.x = d.px + (d.x - d.px) * alpha; o.y = d.py + (d.y - d.py) * alpha; o.z = d.pz + (d.z - d.pz) * alpha; o.yaw = d.yaw;
      n++;
    }
    out.length = n;
  }

  /** Debug/test access. */
  get groupCount() { return this.groups.size; }
  allAnimals() { const r: { species: string; a: Animal; ground: boolean }[] = []; for (const g of this.groups.values()) for (const a of g.animals) r.push({ species: this.isPigeon(g.kind) ? 'pigeon' : g.cat ? 'cat' : 'rat', a, ground: a.state !== 'fly' && a.state !== 'perch' && !a.hidden }); for (const d of this.dogs) r.push({ species: 'dog', a: d, ground: true }); return r; }
}
