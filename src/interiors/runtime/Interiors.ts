/**
 * Interiors runtime: streams interiors in around the player (built in workers), portal-culls them,
 * animates doors, keeps Rapier colliders in sync, answers inside()/slots()/markers(), and applies
 * area power (brownouts). No loading screens: an interior is resident before you reach its door.
 */
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { decodeIndex, unitDoor, facadeDoorRec, isCoreKind, type BuildingIdx, type DoorRec, type IndexFile, type UnitRec, type WireIndex } from '../indexFormat';
import { KINDS, isOpen } from '../catalog';
import type { BuiltInterior, MeshArrays, DoorOut } from '../spec';
import type { WorkerReq, WorkerRes } from '../worker';
import { createGlassMaterial, createInteriorMaterial, type InteriorLook } from './material';

export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export interface InteriorsOpts { quality: Quality; content: { interiors: unknown; places: unknown }; baseUrl?: string; workers?: number }
export interface PowerState { area: string; state: 'on' | 'dim' | 'off' }

const STREAM_IN = 30, STREAM_OUT = 48, MAX_LIVE = 24;

interface LiveDoor { out: DoorOut; obj: THREE.Object3D; open: number; target: number; collider: RAPIER.Collider | null; locked: boolean }
interface Live {
  id: string; unit: UnitRec; b: BuildingIdx; built: BuiltInterior;
  group: THREE.Group; matrix: THREE.Matrix4; inv: THREE.Matrix4;
  cells: { opaque: THREE.Mesh; glass: THREE.Mesh | null; visible: boolean }[];
  doors: LiveDoor[];
  look: InteriorLook;
  colliders: RAPIER.Collider[] | null;
  requestedAt: number; readyAt: number;
}

export class Interiors {
  readonly object = new THREE.Group();
  readonly ready: Promise<void>;
  index!: IndexFile;
  private units = new Map<string, { b: BuildingIdx; u: UnitRec }>();
  private byChunk = new Map<string, { b: BuildingIdx; u: UnitRec }[]>();
  private doorCache = new Map<string, DoorRec[]>();
  private facadeByChunk = new Map<string, BuildingIdx[]>();
  private live = new Map<string, Live>();
  private pending = new Map<string, { seq: number; at: number }>();
  private workers: Worker[] = []; private busy: number[] = []; private queue: string[] = []; private seq = 0;
  private seqToId = new Map<number, string>();
  private mat = createInteriorMaterial(); private glass = createGlassMaterial();
  private power: PowerState[] = [];
  private world: RAPIER.World | null = null;
  private clockMin = 12 * 60;
  private base: string;
  camera: THREE.Camera | null = null;
  /** debug / measurement */
  stats = { live: 0, pending: 0, built: 0, buildMsAvg: 0, buildMsMax: 0, streamMsAvg: 0, streamMsMax: 0, visibleCells: 0, drawCalls: 0, cullMs: 0, colliders: 0 };
  /** true when the camera is inside an interior and no street portal is in view (engine may cull the exterior) */
  exteriorHidden = false;
  readonly onBuilt = new Set<(id: string, b: BuiltInterior) => void>();

  constructor(readonly opts: InteriorsOpts) {
    this.object.name = 'interiors';
    this.base = opts.baseUrl ?? (import.meta.env?.BASE_URL ?? '/') + 'data/';
    this.ready = this.load();
  }

  private async load() {
    const w = (await (await fetch(this.base + 'interiors/index.json')).json()) as WireIndex;
    this.index = decodeIndex(w, (k) => (KINDS as Record<string, { hours?: [string, string] }>)[k]?.hours);
    for (const b of this.index.buildings) if (b.facadeDoors.length) { const fd = b.facadeDoors[0]; const key = `${Math.floor(fd.x / 200)}_${Math.floor(fd.z / 200)}`; (this.facadeByChunk.get(key) ?? this.facadeByChunk.set(key, []).get(key)!).push(b); }
    for (const b of this.index.buildings) for (const u of b.units) {
      this.units.set(u.id, { b, u });
      const ci = Math.floor((u.ox + u.ux * u.door.t) / 200), cj = Math.floor((u.oz + u.uz * u.door.t) / 200);
      const key = `${ci}_${cj}`; (this.byChunk.get(key) ?? this.byChunk.set(key, []).get(key)!).push({ b, u });
    }
    const n = Math.max(1, Math.min(this.opts.workers ?? (this.opts.quality === 'low' ? 1 : 2), (navigator.hardwareConcurrency || 4) - 1));
    for (let k = 0; k < n; k++) {
      const wk = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
      wk.onmessage = (ev: MessageEvent<WorkerRes>) => this.onWorker(k, ev.data);
      this.workers.push(wk); this.busy.push(0);
    }
  }

  // ------------------------------------------------------------------ contract
  doorsForChunk(i: number, j: number): readonly DoorRec[] {
    const key = `${i}_${j}`; let d = this.doorCache.get(key);
    if (!d) {
      d = (this.byChunk.get(key) ?? []).map(({ b, u }) => unitDoor(u, b));
      for (const b of this.facadeByChunk.get(key) ?? []) b.facadeDoors.forEach((fd, k) => d!.push(facadeDoorRec(fd, b, k)));
      this.doorCache.set(key, d);
    }
    return d;
  }
  unit(id: string) { return this.units.get(id); }
  allUnits() { return this.units.values(); }

  update(dt: number, player: { x: number; y: number; z: number }, clock: { minutes: number; date: string }, camera?: THREE.Camera) {
    if (!this.index) return;
    if (camera) this.camera = camera;
    this.clockMin = clock.minutes;
    const now = performance.now();
    // 1. stream: units whose door is within STREAM_IN of the player (nearby chunks only)
    const ci = Math.floor(player.x / 200), cj = Math.floor(player.z / 200);
    const want: { id: string; d: number }[] = [];
    for (let a = ci - 1; a <= ci + 1; a++) for (let c = cj - 1; c <= cj + 1; c++) for (const { b, u } of this.byChunk.get(`${a}_${c}`) ?? []) {
      const dx = u.ox + u.ux * u.door.t - player.x, dz = u.oz + u.uz * u.door.t - player.z;
      const d = Math.hypot(dx, dz) - (Math.abs(player.y - u.y) > 6 ? 0 : 0);
      if (d < STREAM_IN) want.push({ id: u.id, d });
      void b;
    }
    want.sort((p, q) => p.d - q.d);
    for (const w of want.slice(0, MAX_LIVE)) if (!this.live.has(w.id) && !this.pending.has(w.id) && !this.queue.includes(w.id)) this.queue.push(w.id);
    // drop queued items that went out of range, keep nearest first
    this.queue = this.queue.filter((id) => want.some((w) => w.id === id)).sort((p, q) => (want.find((w) => w.id === p)!.d - want.find((w) => w.id === q)!.d));
    this.pump();
    // 2. unload far ones (never the one we're in)
    const inside = this.inside(player.x, player.y, player.z);
    for (const L of this.live.values()) {
      const dx = L.unit.ox + L.unit.ux * L.unit.door.t - player.x, dz = L.unit.oz + L.unit.uz * L.unit.door.t - player.z;
      if (Math.hypot(dx, dz) > STREAM_OUT && inside?.interiorId !== L.id && !this.insideBox(L, player)) this.unload(L);
    }
    // 3. doors, lights by clock/power
    for (const L of this.live.values()) this.tickInterior(L, dt, player);
    // 4. portal culling
    const t0 = performance.now();
    if (this.camera) this.cull(this.camera);
    this.stats.cullMs = performance.now() - t0;
    this.stats.live = this.live.size; this.stats.pending = this.pending.size + this.queue.length;
    void now;
  }

  colliders(world: RAPIER.World) {
    this.world = world;
    let n = 0;
    for (const L of this.live.values()) {
      if (!L.colliders) L.colliders = this.makeColliders(L, world);
      n += L.colliders.length + L.doors.filter((d) => d.collider).length;
    }
    this.stats.colliders = n;
  }

  inside(x: number, y: number, z: number): { interiorId: string; kind: string; roomVolume: number; reverb: string; cell: string } | null {
    const p = new THREE.Vector3();
    for (const L of this.live.values()) {
      p.set(x, y + 0.9, z).applyMatrix4(L.inv);
      for (const c of L.built.cells) {
        const b = c.box;
        if (p.x >= b[0] && p.x <= b[3] && p.y >= b[1] - 0.2 && p.y <= b[4] && p.z >= b[2] && p.z <= b[5])
          return { interiorId: L.id, kind: L.unit.kind, roomVolume: Math.round((b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2])), reverb: L.built.reverb, cell: c.name };
      }
    }
    return null;
  }

  slots(interiorId: string) {
    const L = this.live.get(interiorId); if (!L) return [];
    const hy = this.frameYaw(L);
    return L.built.slots.map((s) => { const v = new THREE.Vector3(s.x, s.y, s.z).applyMatrix4(L.matrix); return { id: s.id, role: s.role, x: v.x, y: v.y, z: v.z, yaw: this.toWorldHeading(L, s.yaw, hy) }; });
  }
  /** All marker types are in spec.ts MarkerType (brief contract plus economy/time/burglary additions). */
  markers(interiorId: string) {
    const L = this.live.get(interiorId); if (!L) return [];
    return L.built.markers.map((m) => { const v = new THREE.Vector3(m.x, m.y, m.z).applyMatrix4(L.matrix); return { id: m.id, type: m.type, x: v.x, y: v.y, z: v.z, name: m.name }; });
  }
  /** Art slots (generated posters, menus, photos) in world space. */
  artSlots(interiorId: string) {
    const L = this.live.get(interiorId); if (!L) return [];
    const f = L.built.frame;
    return L.built.art.map((a) => { const v = new THREE.Vector3(a.x, a.y, a.z).applyMatrix4(L.matrix); return { ...a, x: v.x, y: v.y, z: v.z, nx: f.ux * a.nx + f.nx * a.nz, nz: f.uz * a.nx + f.nz * a.nz }; });
  }
  /** Traversal marks (roof hatches, roof-edge ledges; MOVEMENT.md, ENGINE_REQUESTS 10) in world space. */
  traversal(interiorId: string) {
    const L = this.live.get(interiorId); if (!L) return [];
    const f = L.built.frame, w = (p: [number, number, number]): [number, number, number] => { const v = new THREE.Vector3(...p).applyMatrix4(L.matrix); return [v.x, v.y, v.z]; };
    return (L.built.traversal ?? []).map((t) => ({ ...t, a: w(t.a), b: w(t.b), n: t.n ? [f.ux * t.n[0] + f.nx * t.n[1], f.uz * t.n[0] + f.nz * t.n[1]] as [number, number] : undefined }));
  }
  /** Ensure an interior is built (missions, previews); resolves when resident. */
  ensure(id: string): Promise<BuiltInterior> {
    const L = this.live.get(id); if (L) return Promise.resolve(L.built);
    if (!this.pending.has(id) && !this.queue.includes(id)) this.queue.unshift(id);
    this.pump();
    return new Promise((res) => { const f = (bid: string, b: BuiltInterior) => { if (bid === id) { this.onBuilt.delete(f); res(b); } }; this.onBuilt.add(f); });
  }

  /** area: 'all' | 'building:<id>' | 'interior:<id>' | 'chunk:<i>_<j>' | 'district:<name>' | 'rect:x0,z0,x1,z1' */
  setPower(area: string, state: 'on' | 'dim' | 'off') {
    this.power = this.power.filter((p) => p.area !== area);
    if (!(area === 'all' && state === 'on')) this.power.push({ area, state });
    if (area === 'all' && state === 'on') this.power = [];
  }
  powerAt(b: BuildingIdx, u: UnitRec): 'on' | 'dim' | 'off' {
    let s: 'on' | 'dim' | 'off' = 'on';
    for (const p of this.power) {
      const [k, v] = p.area.split(':');
      let hit = k === 'all';
      if (k === 'building') hit = +v === b.id;
      else if (k === 'interior') hit = v === u.id;
      else if (k === 'chunk') hit = v === `${b.i}_${b.j}`;
      else if (k === 'district') hit = v === b.district;
      else if (k === 'rect') { const [x0, z0, x1, z1] = v.split(',').map(Number); hit = u.ox >= Math.min(x0, x1) && u.ox <= Math.max(x0, x1) && u.oz >= Math.min(z0, z1) && u.oz <= Math.max(z0, z1); }
      if (hit) s = p.state;
    }
    return s;
  }

  dispose() { for (const L of [...this.live.values()]) this.unload(L); for (const w of this.workers) w.terminate(); }

  // ------------------------------------------------------------------ streaming
  private pump() {
    for (let k = 0; k < this.workers.length && this.queue.length; k++) {
      if (this.busy[k]) continue;
      const id = this.queue.shift()!; const e = this.units.get(id); if (!e) continue;
      const seq = ++this.seq; this.busy[k] = seq; this.pending.set(id, { seq, at: performance.now() }); this.seqToId.set(seq, id);
      const { b, u } = e;
      const msg: WorkerReq = {
        seq, chunkUrl: new URL(`${this.base}chunks/${b.i}_${b.j}.bin`, location.href).href,
        req: { unit: u, building: { id: b.id, use: b.use, style: b.style, year: b.year, floors: b.floors, fh: b.fh, top: b.top, gAvg: b.gAvg, district: b.district, roof: b.roof, address: b.address, cond: b.cond }, quality: this.opts.quality, street: this.index.streets[u.street] ?? '' },
      };
      this.workers[k].postMessage(msg);
    }
  }
  private onWorker(k: number, r: WorkerRes) {
    this.busy[k] = 0;
    const id = this.seqToId.get(r.seq); this.seqToId.delete(r.seq);
    const p = id ? this.pending.get(id) : undefined;
    if (id) this.pending.delete(id);
    if (!r.ok) { console.warn('interior build failed', id, r.error); this.pump(); return; }
    if (id && p && !this.live.has(id)) {
      const t0 = performance.now();
      this.install(id, r.built, p.at);
      const up = performance.now() - t0;
      this.stats.built++;
      const ms = performance.now() - p.at;
      this.stats.streamMsAvg += (ms - this.stats.streamMsAvg) / this.stats.built; this.stats.streamMsMax = Math.max(this.stats.streamMsMax, ms);
      this.stats.buildMsAvg += (r.ms - this.stats.buildMsAvg) / this.stats.built; this.stats.buildMsMax = Math.max(this.stats.buildMsMax, r.ms);
      void up;
    }
    this.pump();
  }

  private install(id: string, built: BuiltInterior, requestedAt: number) {
    const e = this.units.get(id)!; const f = built.frame;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.ux, 0, f.uz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.nx, 0, f.nz)).setPosition(f.ox, f.oy, f.oz);
    const group = new THREE.Group(); group.name = `interior_${id}`; group.matrixAutoUpdate = false; group.matrix.copy(m); group.matrixWorldNeedsUpdate = true;
    const look: InteriorLook = { lampPower: 1, lampTint: new THREE.Color(1, 1, 1), window: new THREE.Color(0.6, 0.6, 0.6), ambient: 0.015, flicker: 0 };
    const cells = built.cells.map((c) => {
      const opaque = new THREE.Mesh(geom(c.opaque), this.mat); opaque.name = `cell_${c.name}`; opaque.userData.interior = look; opaque.matrixAutoUpdate = false;
      group.add(opaque);
      let glass: THREE.Mesh | null = null;
      if (c.glass) { glass = new THREE.Mesh(geom(c.glass), this.glass); glass.userData.interior = look; glass.renderOrder = 2; glass.matrixAutoUpdate = false; group.add(glass); }
      return { opaque, glass, visible: true };
    });
    const doors: LiveDoor[] = built.doors.map((d) => {
      const obj = new THREE.Group(); obj.position.set(d.hinge[0], d.hinge[1], d.hinge[2]); obj.rotation.y = d.yaw;
      const [solid, glazing] = splitDoor(d.mesh);
      const dm = new THREE.Mesh(geom(solid), this.mat); dm.userData.interior = look; obj.add(dm);
      if (glazing) { const gm = new THREE.Mesh(geom(glazing), this.glass); gm.userData.interior = look; gm.renderOrder = 2; obj.add(gm); }
      group.add(obj);
      return { out: d, obj, open: 0, target: 0, collider: null, locked: d.locked };
    });
    this.object.add(group); group.updateMatrixWorld(true);
    const L: Live = { id, unit: e.u, b: e.b, built, group, matrix: m, inv: m.clone().invert(), cells, doors, look, colliders: null, requestedAt, readyAt: performance.now() };
    this.live.set(id, L);
    if (this.world) L.colliders = this.makeColliders(L, this.world);
    for (const cb of this.onBuilt) cb(id, built);
  }
  private unload(L: Live) {
    if (L.colliders && this.world) for (const c of L.colliders) this.world.removeCollider(c, false);
    for (const d of L.doors) if (d.collider && this.world) this.world.removeCollider(d.collider, false);
    L.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
    this.object.remove(L.group);
    this.live.delete(L.id);
  }
  private insideBox(L: Live, p: { x: number; y: number; z: number }) {
    const v = new THREE.Vector3(p.x, p.y + 0.5, p.z).applyMatrix4(L.inv); const b = L.built.box;
    return v.x >= b[0] - 1 && v.x <= b[3] + 1 && v.z >= b[2] - 1 && v.z <= b[5] + 1 && v.y >= b[1] - 1 && v.y <= b[4] + 1;
  }

  // ------------------------------------------------------------------ physics
  private makeColliders(L: Live, world: RAPIER.World): RAPIER.Collider[] {
    const out: RAPIER.Collider[] = [];
    for (const c of L.built.colliders) {
      const { pos, quat } = this.worldBox(L, c.c, c.yaw, c.pitch ?? 0);
      const desc = RAPIER.ColliderDesc.cuboid(c.h[0], c.h[1], c.h[2]).setTranslation(pos.x, pos.y, pos.z).setRotation(quat).setFriction(0.8);
      const col = world.createCollider(desc); (col as unknown as { userData?: unknown }).userData = { interior: L.id, cover: !!c.cover, breakable: c.breakable };
      out.push(col);
    }
    return out;
  }
  /** Local cuboid pose -> world, handling mirrored frames (cuboids are symmetric, so flip an axis). */
  private worldBox(L: Live, c: [number, number, number], yaw: number, pitch: number) {
    const local = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')).setPosition(c[0], c[1], c[2]);
    const w = L.matrix.clone().multiply(local);
    const ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(); w.extractBasis(ax, ay, az);
    if (ax.clone().cross(ay).dot(az) < 0) az.negate();
    const rot = new THREE.Matrix4().makeBasis(ax.normalize(), ay.normalize(), az.normalize());
    const quat = new THREE.Quaternion().setFromRotationMatrix(rot);
    return { pos: new THREE.Vector3().setFromMatrixPosition(w), quat };
  }

  // ------------------------------------------------------------------ per-frame interior state
  private tickInterior(L: Live, dt: number, player: { x: number; y: number; z: number }) {
    const pw = this.powerAt(L.b, L.unit);
    const open = isOpen(L.unit.hours, this.clockMin);
    const shop = !isCoreKind(L.unit.kind);
    const m = this.clockMin;
    const day = Math.max(0, Math.min(1, (Math.min(m - 5 * 60, 20 * 60 - m)) / 90)); // 0 night .. 1 day (dawn ~05-06:30, dusk ~18:30-20)
    // lamps: on while open (shops), always (cores); a dim night light in closed shops; brownout states
    let lamp = shop ? (open ? 1 : 0.12) : (m > 23 * 60 || m < 6 * 60 ? 0.75 : 1);
    if (pw === 'dim') lamp *= 0.45; else if (pw === 'off') lamp = 0;
    L.look.lampPower = lamp; L.look.flicker = pw === 'dim' ? 1 : 0;
    // window light: daylight (warm, low-key per STYLE_GUIDE) or night street light (sodium)
    const dayC = new THREE.Color(0.95, 0.86, 0.72).multiplyScalar(1.6), nightC = new THREE.Color(0.32, 0.2, 0.1).multiplyScalar(pw === 'off' ? 0.35 : 1);
    L.look.window.copy(nightC).lerp(dayC, day);
    L.look.ambient = 0.004 + day * 0.02;
    // doors: open automatically for the player when unlocked; street doors also lock out of hours
    const pl = new THREE.Vector3(player.x, player.y, player.z).applyMatrix4(L.inv);
    for (const d of L.doors) {
      d.locked = d.out.locked || (d.out.street && shop && !open);
      const hx = d.out.hinge[0] + Math.cos(d.out.yaw) * d.out.w / 2, hz = d.out.hinge[2] - Math.sin(d.out.yaw) * d.out.w / 2;
      const near = Math.hypot(pl.x - hx, pl.z - hz) < 1.7 && Math.abs(pl.y - d.out.hinge[1]) < 1.5;
      d.target = near && !d.locked ? 1 : 0;
      const prev = d.open;
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 2.4);
      if (d.open !== prev) d.obj.rotation.y = d.out.yaw + d.out.swing * easeDoor(d.open) * 1.7;
      // collider only while (nearly) closed
      if (this.world) {
        const shut = d.open < 0.08;
        if (shut && !d.collider) {
          const c: [number, number, number] = [hx, d.out.hinge[1] + d.out.h / 2, hz];
          const { pos, quat } = this.worldBox(L, c, d.out.yaw, 0);
          d.collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(d.out.w / 2, d.out.h / 2, 0.05).setTranslation(pos.x, pos.y, pos.z).setRotation(quat));
        } else if (!shut && d.collider) { this.world.removeCollider(d.collider, false); d.collider = null; }
      }
    }
  }
  private frameYaw(L: Live) { return Math.atan2(-L.built.frame.nx, -L.built.frame.nz); }
  private toWorldHeading(L: Live, localYaw: number, _hy: number) {
    // local heading dir: (-sin y, -cos y) in local x/z -> world via u/n
    const lx = -Math.sin(localYaw), lz = -Math.cos(localYaw), f = L.built.frame;
    const wx = f.ux * lx + f.nx * lz, wz = f.uz * lx + f.nz * lz;
    return Math.atan2(-wx, -wz);
  }

  // ------------------------------------------------------------------ portal culling
  private cull(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const cam = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    let vis = 0, draws = 0, anyInsideHidesExterior = false;
    for (const L of this.live.values()) {
      const local = cam.clone().applyMatrix4(L.inv);
      const visible = new Set<number>();
      let start = -1;
      for (const c of L.built.cells) { const b = c.box; if (local.x >= b[0] - 0.05 && local.x <= b[3] + 0.05 && local.y >= b[1] - 0.05 && local.y <= b[4] + 0.05 && local.z >= b[2] - 0.05 && local.z <= b[5] + 0.05) { start = c.id; break; } }
      const mvp = vp.clone().multiply(L.matrix);
      let streetVisible = false;
      const walk = (cell: number, rect: Rect, depth: number) => {
        visible.add(cell);
        if (depth > 8) return;
        for (const p of L.built.portals) {
          const other = p.a === cell ? p.b : p.b === cell ? p.a : -2;
          if (other === -2) continue;
          const r = portalRect(p.pts, mvp, local);
          if (!r) continue;
          const ir = intersect(rect, r); if (!ir) continue;
          if (other === -1) { streetVisible = true; continue; }
          if (visible.has(other) && depth > 0) continue;
          walk(other, ir, depth + 1);
        }
      };
      if (start >= 0) {
        walk(start, { x0: -1, y0: -1, x1: 1, y1: 1 }, 0);
        if (!streetVisible) anyInsideHidesExterior = true;
      } else {
        // from outside: through street portals that face the camera
        for (const p of L.built.portals) {
          if (p.b !== -1) continue;
          const r = portalRect(p.pts, mvp, local); if (!r) continue;
          walk(p.a, r, 1);
        }
      }
      for (const c of L.cells) {
        const id = L.cells.indexOf(c), on = visible.has(id) || !!L.built.cells[id].outdoor;
        c.opaque.visible = on; if (c.glass) c.glass.visible = on; c.visible = on;
        if (on) { vis++; draws += 1 + (c.glass ? 1 : 0); }
      }
      const anyVis = visible.size > 0;
      for (const d of L.doors) { d.obj.visible = anyVis; if (anyVis) draws += d.obj.children.length; }
    }
    this.exteriorHidden = anyInsideHidesExterior;
    this.stats.visibleCells = vis; this.stats.drawCalls = draws;
  }
}

// ---------------------------------------------------------------- helpers
interface Rect { x0: number; y0: number; x1: number; y1: number }
const intersect = (a: Rect, b: Rect): Rect | null => { const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) }; return r.x0 < r.x1 && r.y0 < r.y1 ? r : null; };
const _v = new THREE.Vector4();
/** Screen-space (NDC) bounds of a portal, or null if it faces away / is off screen. Conservative near the camera. */
function portalRect(pts: [number, number, number][], mvp: THREE.Matrix4, camLocal: THREE.Vector3): Rect | null {
  // portal plane distance from the camera: if the camera is very close and within the portal extent, use full screen
  const [a, b, , d] = pts;
  const ex = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), ey = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
  const n = ex.clone().cross(ey).normalize();
  const rel = camLocal.clone().sub(new THREE.Vector3(a[0], a[1], a[2]));
  const dist = rel.dot(n);
  const u = rel.dot(ex) / ex.lengthSq(), v = rel.dot(ey) / ey.lengthSq();
  if (Math.abs(dist) < 0.6 && u > -0.3 && u < 1.3 && v > -0.3 && v < 1.3) return { x0: -1, y0: -1, x1: 1, y1: 1 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = 0;
  for (const p of pts) {
    _v.set(p[0], p[1], p[2], 1).applyMatrix4(mvp);
    if (_v.w < 0.05) { behind++; continue; }
    const sx = _v.x / _v.w, sy = _v.y / _v.w;
    x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy);
  }
  if (behind === 4) return null;
  if (behind > 0) return { x0: -1, y0: -1, x1: 1, y1: 1 }; // straddles the camera plane: conservative
  return intersect({ x0, y0, x1, y1 }, { x0: -1, y0: -1, x1: 1, y1: 1 });
}
function geom(m: MeshArrays) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.normal, 3));
  g.setAttribute('color', new THREE.BufferAttribute(m.color, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(m.uv, 2));
  g.setAttribute('pat', new THREE.BufferAttribute(m.pat, 4));
  g.setAttribute('light', new THREE.BufferAttribute(m.light, 4));
  g.setIndex(new THREE.BufferAttribute(m.index, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
/** Door meshes carry glazing tagged pat.x = -1: split into solid + glass. */
function splitDoor(m: MeshArrays): [MeshArrays, MeshArrays | null] {
  const nv = m.position.length / 3; const isG = new Uint8Array(nv); let any = false;
  for (let v = 0; v < nv; v++) if (m.pat[v * 4] < -0.5) { isG[v] = 1; any = true; }
  if (!any) return [m, null];
  const pick = (g: number): MeshArrays => {
    const map = new Int32Array(nv).fill(-1); let c = 0; for (let v = 0; v < nv; v++) if (isG[v] === g) map[v] = c++;
    const sub = (a: Float32Array, k: number) => { const r = new Float32Array(c * k); for (let v = 0; v < nv; v++) if (map[v] >= 0) for (let q = 0; q < k; q++) r[map[v] * k + q] = a[v * k + q]; return r; };
    const idx: number[] = []; for (let t = 0; t < m.index.length; t += 3) if (isG[m.index[t]] === g) idx.push(map[m.index[t]], map[m.index[t + 1]], map[m.index[t + 2]]);
    const pat = sub(m.pat, 4); for (let q = 0; q < pat.length; q += 4) if (pat[q] < 0) pat[q] = 0;
    return { position: sub(m.position, 3), normal: sub(m.normal, 3), color: sub(m.color, 3), uv: sub(m.uv, 2), pat, light: sub(m.light, 4), index: new Uint32Array(idx) };
  };
  return [pick(0), pick(1)];
}
const easeDoor = (t: number) => t * t * (3 - 2 * t);
