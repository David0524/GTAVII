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
import * as THREE from 'three/webgpu';
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
  update(dt: number, ctx: { minutes: number; raining: boolean; sprinting: boolean; device: 'touch' | 'pad' | 'mouse'; inCar?: boolean }): void;
  health(): HealthView;
  heat(): HeatView;
  /** label for the context button, or null */
  context(): string | null;
  doContext(): void;
  /** combat input on foot (contract §3); returns whether the player is aiming (camera + facing) */
  combat(i: { aim: boolean; fire: boolean; reload: boolean; melee: boolean; cover: boolean; lock: boolean; move: [number, number] }): boolean;
  /** audio 13: gunfire, bullet passes and impacts to audio; shots to the sim (peds/vendors react) */
  bindAudio(a: { gunshot(at: [number, number, number], tier: string, o?: { indoors?: boolean }): unknown; bulletPass(from: [number, number, number], to: [number, number, number]): void; bulletImpact(at: [number, number, number], m: string): void }, indoors: () => boolean): void;
  lastMs: number;
}

/**
 * Gameplay's content (module + narrative JSON) is network-only work: no GPU, a few small parses. Started at
 * boot it loads during the title instead of queueing behind frames after it (headless: ~25 s of waits).
 */
let contentP: Promise<Awaited<ReturnType<typeof import('../gameplay/scene/narrativeContent')['loadNarrativeContent']>> | null> | null = null;
export function prefetchGameplayContent() {
  return contentP ??= import('../gameplay/scene/narrativeContent').then((m) => { loadReport.mark('gameplay-imported'); return m.loadNarrativeContent(); }).catch((e) => { console.warn('gameplay content', e); return null; });
}

export async function createGameplay(o: { quality: Quality; physics: Physics; player: PlayerController; lead: () => string; camera: THREE.Camera; sim: Simulation | null; saves: SaveManager }): Promise<GameplayGlue> {
  loadReport.mark('gameplay-start');
  const narrative = await prefetchGameplayContent();
  loadReport.mark('gameplay-content');
  if (narrative?.warnings.length) console.info(`[gameplay] content from ${narrative.source}: ${narrative.warnings.length} warnings`);
  const g = new Gameplay({ quality: o.quality, content: narrative ? (narrative.content as never) : { items: null, shops: null, weapons: null } });
  loadReport.mark('gameplay-core');
  if (narrative?.content.vendors) g.loadVendorContent(narrative.content.vendors);
  const rq = new RapierWorldQuery(o.physics);
  rq.excluded.add(o.player.collider.handle);
  g.bindWorld(rq);
  if (o.sim) g.bindSim(o.sim as never);
  const dir = new THREE.Vector3();
  const bind = () => g.bindPlayer({
    id: 'player', lead: o.lead(),
    position: () => [o.player.pos.x, o.player.pos.y, o.player.pos.z],
    // aim along the camera's view from chest height (combat input arrives with request 3)
    aim: () => { o.camera.getWorldDirection(dir); return { origin: [o.player.pos.x, o.player.pos.y + 1.45, o.player.pos.z], dir: [dir.x, dir.y, dir.z] }; },
  });
  bind();
  o.saves.provideSection({ name: 'gameplay', capture: () => g.serialize(), restore: (d) => { if (d) g.deserialize(d); } });

  let boundLead = o.lead(), aiming = false, firing = false;
  const glue: GameplayGlue = {
    g, lastMs: 0,
    update(dt, ctx) {
      const t0 = performance.now();
      if (o.lead() !== boundLead) { boundLead = o.lead(); bind(); }
      g.setClock({ minutes: ctx.minutes });
      // in a car, Driving sets speed/vehicle itself
      g.setContext(ctx.inCar ? { raining: ctx.raining, device: ctx.device } : { speed: Math.hypot(o.player.vel.x, o.player.vel.z), sprinting: ctx.sprinting, raining: ctx.raining, device: ctx.device });
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
      // the phase pursuit and gameplay's HUD use (none / spotted / pursuit / lost / searching / cooling)
      const phase = g.policeSys.phase('player') as HeatView['phase'];
      const units = [...g.policeSys.units.values()].filter((u) => u.state !== 'down' && u.state !== 'post');
      return {
        phase,
        cones: phase === 'none' ? [] : units.map((u) => ({ x: u.x, z: u.z, dir: u.yaw, spread: u.fov, r: u.sight, seeing: u.lastSeen !== null && u.lostFor === 0 })),
        units: units.map((u) => ({ x: u.x, z: u.z, kind: u.kind === 'foot' ? 'foot' as const : 'car' as const, seeing: u.lostFor === 0 && u.lastSeen !== null })),
      };
    },
    // "Say hello · Hold [F] Mouth off" (glyph from the device gameplay was told about)
    context() { return g.contextPrompt(); },
    doContext() { g.doContextAction(null); },
    combat(i) {
      if (i.aim !== aiming) { aiming = i.aim; g.setAiming(i.aim); }
      if (i.fire !== firing) { firing = i.fire; g.setFiring(i.fire); }
      if (i.reload) g.reload();
      if (i.melee) g.meleeAttack('light');
      if (i.cover) g.toggleCover(i.move);
      if (i.lock) g.lockOn();
      return aiming || firing;
    },
    bindAudio(a, indoors) {
      // weapon → audio tier (audio 13). Gameplay may add an audioTier field to weapon defs; until then, by id
      const tier = (w: string) => /shotgun|coach|pump/.test(w) ? 'shotgun' : /magnum|357|\.44|python/.test(w) ? 'magnum' : /smg|tommy|thompson|grease|mac|auto/.test(w) ? 'auto' : /saturday|\.22|\.25|derringer|junk|zip/.test(w) ? 'cheap' : 'service';
      g.on('shot', (e: { origin: [number, number, number]; dir: [number, number, number]; weapon: string }) => {
        a.gunshot(e.origin, tier(e.weapon), { indoors: indoors() });
        const to: [number, number, number] = [e.origin[0] + e.dir[0] * 60, e.origin[1] + e.dir[1] * 60, e.origin[2] + e.dir[2] * 60];
        a.bulletPass(e.origin, to);
        o.sim?.emit({ type: 'gunfire', x: e.origin[0], z: e.origin[2] });
      });
      g.on('impact', (e: { point: [number, number, number]; material: string }) => {
        const m = /metal|car/.test(e.material) ? 'car' : /glass/.test(e.material) ? 'glass' : /wood/.test(e.material) ? 'wood' : /concrete|asphalt/.test(e.material) ? 'concrete' : /dirt|soil/.test(e.material) ? 'dirt' : 'brick';
        a.bulletImpact(e.point, m);
      });
    },
  };
  return glue;
}
