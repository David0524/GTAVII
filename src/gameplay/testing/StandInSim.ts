import type { AgentCommand } from '../police/ports';
import type { Rng } from '../core/rng';

/**
 * Stand-in for the sim stream's pedestrians, implementing the SimBinding the Gameplay facade expects
 * (peds list, on/emit, plus `command` — the behaviour-control API requested from sim). Used by the
 * headless tests and the ?gameplay=1 scene until the real sim merges. Kinematic, deterministic,
 * walks on a plane (or a sidewalk strip when `lanes` are given). Generic bodies only.
 */
export interface StandInPed { id: string; x: number; y: number; z: number; yaw: number; speed: number; state: string; alive: boolean; nerve: number; archetype: string; variant: number; cmd: AgentCommand | null; home: [number, number]; wanderT: number; anim: string | null }

export class StandInSim {
  peds: StandInPed[] = [];
  vehicles: unknown[] = [];
  private ls = new Map<string, Set<(e: any) => void>>();
  /** sidewalk strips the ambient wander stays on: [minX, maxX, minZ, maxZ] */
  bounds: [number, number, number, number] | null = null;
  groundY = (_x: number, _z: number) => 0;
  constructor(private rng: Rng) {}

  add(id: string, x: number, z: number, o: Partial<StandInPed> = {}) {
    const p: StandInPed = { id, x, y: this.groundY(x, z), z, yaw: o.yaw ?? 0, speed: 0, state: 'walk', alive: true, nerve: o.nerve ?? this.rng.range(0.2, 0.9), archetype: o.archetype ?? 'commuter', variant: o.variant ?? this.rng.int(0, 999), cmd: null, home: [x, z], wanderT: 0, anim: null, ...o };
    this.peds.push(p); return p;
  }
  on(type: string, cb: (e: any) => void) { let s = this.ls.get(type); if (!s) this.ls.set(type, (s = new Set())); s.add(cb); }
  emit(e: any) {
    if (e?.type === 'threat') for (const p of this.peds) { if (!p.alive || p.cmd) continue; if (Math.hypot(p.x - e.x, p.z - e.z) < (e.radius ?? 30)) { p.state = 'flee'; p.cmd = { type: 'flee', fromX: e.x, fromZ: e.z }; p.wanderT = 6; } }
    for (const cb of this.ls.get(e?.type) ?? []) cb(e);
  }
  command(id: string, c: AgentCommand) {
    const p = this.peds.find((q) => q.id === id); if (!p) return;
    if (c.type === 'anim' && c.name === 'die') { p.alive = false; p.state = 'dead'; p.cmd = null; return; }
    if (c.type === 'release') { p.cmd = null; p.anim = null; p.state = 'walk'; return; }
    if (c.type === 'anim') { p.anim = c.name; p.state = c.name; p.cmd = c; return; }
    if (c.type === 'cower') { p.state = 'cower'; p.cmd = c; return; }
    p.cmd = c; p.anim = null; p.state = c.type === 'goto' ? (c.pace === 'run' ? 'run' : 'walk') : c.type;
  }
  kill(id: string) { const p = this.peds.find((q) => q.id === id); if (p) { p.alive = false; p.state = 'dead'; } }

  update(dt: number) {
    for (const p of this.peds) {
      if (!p.alive) { p.speed = 0; continue; }
      const c = p.cmd;
      let tx: number | null = null, tz = 0, sp = 0;
      if (!c) {
        // ambient wander around home
        p.wanderT -= dt;
        if (p.wanderT <= 0) { p.wanderT = this.rng.range(3, 8); const a = this.rng.next() * Math.PI * 2, r = this.rng.range(2, 10); (p as any)._w = [p.home[0] + Math.cos(a) * r, p.home[1] + Math.sin(a) * r]; }
        const w = (p as any)._w as [number, number] | undefined; if (w) { tx = w[0]; tz = w[1]; sp = 1.3; }
      } else if (c.type === 'goto') { tx = c.x; tz = c.z; sp = c.pace === 'run' ? 4.6 : 1.5; }
      else if (c.type === 'flee') { const dx = p.x - c.fromX, dz = p.z - c.fromZ, L = Math.hypot(dx, dz) || 1; tx = p.x + (dx / L) * 5; tz = p.z + (dz / L) * 5; sp = 4.8; p.wanderT -= dt; if (p.wanderT <= 0 && p.state === 'flee' && L > 40) { p.cmd = null; p.state = 'walk'; } }
      else if (c.type === 'face') { p.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z)); }
      if (tx !== null) {
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const s = Math.min(d, sp * dt);
          p.x += (dx / d) * s; p.z += (dz / d) * s; p.yaw = Math.atan2(-dx, -dz); p.speed = s / dt;
          if (this.bounds && !c) { p.x = Math.min(this.bounds[1], Math.max(this.bounds[0], p.x)); p.z = Math.min(this.bounds[3], Math.max(this.bounds[2], p.z)); }
        } else p.speed = 0;
      } else p.speed = 0;
      p.y = this.groundY(p.x, p.z);
    }
  }
}
