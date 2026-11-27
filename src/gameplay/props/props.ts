import { Emitter } from '../core/events';
import type { Box } from '../core/boxworld';
import type { Material } from '../core/world';
import type { V3 } from '../core/vec';

/**
 * Breakable street furniture. Each prop has hit points and destruction stages; damage comes from
 * bullets (surface hits), melee slams, and vehicle impacts. Breaking one is vandalism, which the
 * witness system treats like any other crime. Special consequences:
 *  - hydrant: geysers for GEYSER_TIME s (water knocks pedestrians back; audio water bed; wet street)
 *  - newsstand: scatters papers (particles) and closes the stand's shop
 *  - phone_booth: its payphone stops working; call_box: witnesses can't report from it
 *  - parking_meter: drops a few coins
 *  - storefront_glass: shatters (and a period alarm bell rings: a louder crime)
 * Broken props reset after RESET_TIME s when the player is > RESET_DIST m away (streaming-friendly).
 */
export type PropType = 'hydrant' | 'newsstand' | 'phone_booth' | 'mailbox' | 'parking_meter' | 'trash_can' | 'storefront_glass' | 'call_box';
export interface PropDef { hp: number; material: Material; half: V3; stages: number; cover: 'low' | 'high' | null; bulletMul: number; impactMul: number }
export const PROP_DEFS: Record<PropType, PropDef> = {
  hydrant: { hp: 110, material: 'metal_thick', half: [0.2, 0.42, 0.2], stages: 2, cover: null, bulletMul: 0.35, impactMul: 1 }, // bullets at 0.35×; slams into it count fully (a wrench-opening action is a TODO)
  newsstand: { hp: 120, material: 'wood', half: [1.4, 1.2, 0.8], stages: 3, cover: 'high', bulletMul: 0.6, impactMul: 1.2 },
  phone_booth: { hp: 110, material: 'metal_thin', half: [0.5, 1.15, 0.5], stages: 3, cover: 'high', bulletMul: 0.7, impactMul: 1.2 },
  mailbox: { hp: 140, material: 'metal_thick', half: [0.32, 0.6, 0.27], stages: 2, cover: 'low', bulletMul: 0.35, impactMul: 1 },
  parking_meter: { hp: 60, material: 'metal_thick', half: [0.1, 0.65, 0.1], stages: 2, cover: null, bulletMul: 0.5, impactMul: 1.5 },
  trash_can: { hp: 50, material: 'metal_thin', half: [0.3, 0.45, 0.3], stages: 2, cover: 'low', bulletMul: 0.8, impactMul: 2 },
  storefront_glass: { hp: 20, material: 'glass', half: [2.2, 1.3, 0.03], stages: 2, cover: null, bulletMul: 3, impactMul: 3 },
  call_box: { hp: 70, material: 'metal_thick', half: [0.18, 0.75, 0.18], stages: 2, cover: null, bulletMul: 0.5, impactMul: 1.4 },
};
export const GEYSER_TIME = 90, RESET_TIME = 600, RESET_DIST = 180;

export interface Prop { id: string; type: PropType; x: number; y: number; z: number; yaw: number; hp: number; stage: number; brokenAt: number; effect: number }
export interface PropEvents extends Record<string, unknown> {
  damaged: { id: string; type: PropType; hp: number; stage: number };
  broken: { id: string; type: PropType; at: V3; by: string | null; cause: string };
  geyser: { id: string; at: V3; on: boolean };
  coins: { id: string; at: V3; cents: number };
  reset: { id: string; type: PropType };
}

export class Props extends Emitter<PropEvents> {
  readonly list = new Map<string, Prop>();
  time = 0;
  add(p: Omit<Prop, 'hp' | 'stage' | 'brokenAt' | 'effect'>) {
    const d = PROP_DEFS[p.type];
    const prop: Prop = { ...p, hp: d.hp, stage: 0, brokenAt: -1, effect: 0 };
    this.list.set(p.id, prop); return prop;
  }
  get(id: string) { return this.list.get(id); }
  isBroken(id: string) { const p = this.list.get(id); return !!p && p.stage >= PROP_DEFS[p.type].stages - 1; }

  damage(id: string, amount: number, cause: 'bullet' | 'melee' | 'impact' | 'fire', by: string | null = null) {
    const p = this.list.get(id); if (!p) return false;
    const d = PROP_DEFS[p.type];
    if (p.stage >= d.stages - 1) return false;
    const mul = cause === 'bullet' ? d.bulletMul : cause === 'impact' ? d.impactMul : 1;
    p.hp = Math.max(0, p.hp - amount * mul);
    const ns = p.hp <= 0 ? d.stages - 1 : Math.min(d.stages - 2, Math.floor((1 - p.hp / d.hp) * (d.stages - 1)));
    if (ns !== p.stage) {
      p.stage = ns;
      this.emit('damaged', { id, type: p.type, hp: p.hp, stage: ns });
      if (ns === d.stages - 1) {
        p.brokenAt = this.time;
        const at: V3 = [p.x, p.y, p.z];
        this.emit('broken', { id, type: p.type, at, by, cause });
        if (p.type === 'hydrant') { p.effect = GEYSER_TIME; this.emit('geyser', { id, at, on: true }); }
        if (p.type === 'parking_meter') this.emit('coins', { id, at, cents: 10 * (1 + (Math.abs(hash(id)) % 6)) });
        return true;
      }
    }
    return false;
  }

  update(dt: number, player: [number, number]) {
    this.time += dt;
    for (const p of this.list.values()) {
      if (p.effect > 0) { p.effect -= dt; if (p.effect <= 0 && p.type === 'hydrant') this.emit('geyser', { id: p.id, at: [p.x, p.y, p.z], on: false }); }
      if (p.brokenAt >= 0 && this.time - p.brokenAt > RESET_TIME && Math.hypot(p.x - player[0], p.z - player[1]) > RESET_DIST) {
        p.hp = PROP_DEFS[p.type].hp; p.stage = 0; p.brokenAt = -1; p.effect = 0;
        this.emit('reset', { id: p.id, type: p.type });
      }
    }
  }

  /** Collision/occlusion boxes for the BoxWorld dynamic layer (broken glass/booths stop blocking). */
  boxes(): Box[] {
    const out: Box[] = [];
    for (const p of this.list.values()) {
      const d = PROP_DEFS[p.type];
      const gone = p.stage >= d.stages - 1 && (p.type === 'storefront_glass' || p.type === 'trash_can');
      out.push({ id: p.id, c: [p.x, p.y + d.half[1], p.z], h: d.half, yaw: p.yaw, material: d.material, enabled: !gone });
    }
    return out;
  }
  /** Water push for geysers: returns a push vector for an agent at (x,z) or null. */
  geyserPush(x: number, z: number): [number, number] | null {
    for (const p of this.list.values()) {
      if (p.type !== 'hydrant' || p.effect <= 0) continue;
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < 2.2 && d > 0.01) return [(dx / d) * (2.2 - d) * 2, (dz / d) * (2.2 - d) * 2];
    }
    return null;
  }
  serialize() { return [...this.list.values()].filter((p) => p.stage > 0).map((p) => ({ id: p.id, hp: p.hp, stage: p.stage, age: this.time - p.brokenAt })); }
  deserialize(d: ReturnType<Props['serialize']>) {
    for (const s of d ?? []) { const p = this.list.get(s.id); if (!p) continue; p.hp = s.hp; p.stage = s.stage; p.brokenAt = s.age >= 0 ? this.time - s.age : -1; }
  }
}
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
