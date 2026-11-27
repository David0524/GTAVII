/**
 * Game-loop wiring step 6 (docs/HANDOFF_WIRING.md): the gameplay core in the main game.
 *
 *  - content: narrative's systems content through gameplay's adapter (falls back to gameplay's snapshot);
 *  - binds: player (the active lead), world (Rapier city, the player capsule excluded), sim;
 *  - save: one `gameplay` section; gameplay owns its shape and migrations (src/gameplay/save.ts);
 *  - UiHost answers: health and police heat from gameplay;
 *  - the one context button (`use`) goes to gameplay's contextAction / doContextAction.
 * Doors (interiors doorsForChunk), vehicles (player driving) and talkables (mission runtime) bind when
 * those land in the main game; gameplay's own fallbacks cover them until then.
 */
import type * as THREE from 'three/webgpu';
import { Gameplay, type Quality } from '../gameplay';
import { RapierWorldQuery } from '../gameplay/scene/RapierWorldQuery';
import { registerSection } from '../save/schema';
import type { SaveManager } from '../save/SaveManager';
import type { Physics } from '../physics/Physics';
import type { PlayerController } from '../player/PlayerController';
import type { Simulation } from '../sim';
import type { HealthView, HeatView } from '../shared/uiHost';
import { loadReport } from './debug/LoadReport';

// gameplay versions its own blob (src/gameplay/save.ts migrate); the engine section is just a carrier
registerSection<unknown>({ name: 'gameplay', version: 1, migrations: {}, empty: () => null });

export interface GameplayGlue {
  g: Gameplay;
  /** after physics, while playing */
  update(dt: number, ctx: { minutes: number; raining: boolean; sprinting: boolean; device: 'touch' | 'pad' | 'mouse' }): void;
  health(): HealthView;
  heat(): HeatView;
  /** label for the context button, or null */
  context(): string | null;
  doContext(): void;
  lastMs: number;
}

export async function createGameplay(o: { quality: Quality; physics: Physics; player: PlayerController; lead: () => string; camera: THREE.Camera; sim: Simulation | null; saves: SaveManager }): Promise<GameplayGlue> {
  const narrative = await import('../gameplay/scene/narrativeContent').then((m) => m.loadNarrativeContent()).catch((e) => { console.warn('gameplay content', e); return null; });
  loadReport.mark('gameplay-content');
  if (narrative?.warnings.length) console.info(`[gameplay] content from ${narrative.source}: ${narrative.warnings.length} warnings`);
  const g = new Gameplay({ quality: o.quality, content: narrative ? (narrative.content as never) : { items: null, shops: null, weapons: null } });
  loadReport.mark('gameplay-core');
  if (narrative?.content.vendors) g.loadVendorContent(narrative.content.vendors);
  const rq = new RapierWorldQuery(o.physics);
  rq.excluded.add(o.player.collider.handle);
  g.bindWorld(rq);
  if (o.sim) g.bindSim(o.sim as never);
  const dir = new (await import('three/webgpu')).Vector3();
  const bind = () => g.bindPlayer({
    id: 'player', lead: o.lead(),
    position: () => [o.player.pos.x, o.player.pos.y, o.player.pos.z],
    // aim along the camera's view from chest height (combat input arrives with request 3)
    aim: () => { o.camera.getWorldDirection(dir); return { origin: [o.player.pos.x, o.player.pos.y + 1.45, o.player.pos.z], dir: [dir.x, dir.y, dir.z] }; },
  });
  bind();
  o.saves.provideSection({ name: 'gameplay', capture: () => g.serialize(), restore: (d) => { if (d) g.deserialize(d); } });

  let boundLead = o.lead();
  const glue: GameplayGlue = {
    g, lastMs: 0,
    update(dt, ctx) {
      const t0 = performance.now();
      if (o.lead() !== boundLead) { boundLead = o.lead(); bind(); }
      g.setClock({ minutes: ctx.minutes });
      g.setContext({ speed: Math.hypot(o.player.vel.x, o.player.vel.z), sprinting: ctx.sprinting, raining: ctx.raining, device: ctx.device });
      g.update(dt);
      glue.lastMs = performance.now() - t0;
    },
    health() {
      const h = g.hud(), st = g.stamina();
      if (!h) return { hp: 100, max: 100, injuries: [], stamina: 1, staminaMax: 1, heatExhaustion: 0 };
      const kindOf = (s: string): HealthView['injuries'][number]['kind'] => (/burn/.test(s) ? 'burn' : /graze/.test(s) ? 'graze' : /bruise|blunt/.test(s) ? 'bruise' : 'wound');
      return {
        hp: h.hp, max: h.maxHp,
        injuries: (h.injuries as unknown as string[]).map((s) => ({ region: String(s).split(':')[0], kind: kindOf(String(s)), bandaged: /bandaged/.test(String(s)) })),
        stamina: st?.value ?? 1, staminaMax: st?.max ?? 1, heatExhaustion: 0,
      };
    },
    heat() {
      const units = [...g.policeSys.units.values()].filter((u) => u.state !== 'down' && u.state !== 'post');
      const phase: HeatView['phase'] = units.some((u) => u.state === 'pursuit') ? 'pursuit' : units.some((u) => u.state === 'search') ? 'searching'
        : units.some((u) => u.state === 'approach' || u.state === 'encounter' || u.state === 'suspicious') ? 'spotted' : 'none';
      return {
        phase,
        cones: phase === 'none' ? [] : units.map((u) => ({ x: u.x, z: u.z, dir: u.yaw, spread: u.fov, r: u.sight, seeing: u.lastSeen !== null && u.lostFor === 0 })),
        units: units.map((u) => ({ x: u.x, z: u.z, kind: u.kind === 'foot' ? 'foot' as const : 'car' as const, seeing: u.lostFor === 0 && u.lastSeen !== null })),
      };
    },
    context() { const c = g.contextAction(); return c ? (c as { label?: string }).label ?? c.kind : null; },
    doContext() { g.doContextAction(null); },
  };
  return glue;
}
