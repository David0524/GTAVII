/**
 * Adapters from the gameplay and vehicles streams to UiHost.touch (TOUCH_CONTROLS.md). Structural types
 * only, matching the shapes those streams published (gameplay 1c2d4c5 "UI contract for TOUCH_CONTROLS.md";
 * vehicles b934f05 / 0272776 DriverAssist), so nothing here imports another stream's internals. The engine
 * wires them at integration; gameplay's ?gameplay=1 scene and vehicles' TestLot can use them directly.
 *
 *   const touch = combineTouch(gameplayTouch(g, project), vehiclesTouch(vehicleCtl));
 *   const host = { ...uiHost, touch };
 */
import type { TouchHost, TouchMode, TouchContext } from '../../shared/uiHost';

type V3 = [number, number, number];
type Dir = { x: number; z: number };

/** What gameplay exposes (claude/gameplay-74, docs/GAMEPLAY_PROGRESS.md). */
export interface GameplayTouchLike {
  touchMode(): TouchMode;
  armed(): boolean;
  contextAction(): (TouchContext & { target?: string }) | null;
  doContextAction(moveDir?: Dir): void;
  lockables(): { id: string; chest: V3; threat?: number }[];
  aimer: { locked: string | null };
  lockTarget(id: string | null): void;
  swipeLock(dir: 1 | -1): void;
  setFiring(on: boolean): void;
  reload(): void;
  swapWeapon(dir: 1 | -1): void;
  coverLabel(): string;
  coverOrRoll(moveDir?: Dir): void;
  drawWeapon(): void;
  setContext(c: { fireMode?: 'auto' | 'tap' | 'button'; gyro?: boolean }): void;
  setAssist(level: 'off' | 'low' | 'standard' | 'strong'): void;
}

export function gameplayTouch(g: GameplayTouchLike, project: (x: number, y: number, z: number) => { x: number; y: number } | null): TouchHost {
  return {
    mode: () => g.touchMode(),
    armed: () => g.armed(),
    context: () => { const c = g.contextAction(); return c ? { kind: c.kind, label: c.label } : null; },
    doContext: (d) => g.doContextAction(d),
    lockables: () => g.lockables().map((l) => ({ id: l.id, x: l.chest[0], y: l.chest[1], z: l.chest[2], threat: l.threat })),
    locked: () => g.aimer.locked,
    lockTarget: (id) => g.lockTarget(id),
    swipeLock: (d) => g.swipeLock(d),
    project,
    setFiring: (on) => g.setFiring(on),
    reload: () => g.reload(),
    swapWeapon: (d) => g.swapWeapon(d),
    coverLabel: () => g.coverLabel(),
    coverOrRoll: (d) => g.coverOrRoll(d),
    drawWeapon: () => g.drawWeapon(),
    configure: (c) => { g.setContext({ fireMode: c.fireMode, gyro: c.gyro !== 'off' }); g.setAssist(c.gyro !== 'off' ? 'off' : c.aimAssist); },
  };
}

/** What the driving side exposes: the player's DriverAssist (assist.configure, 0272776) and the car. */
export interface VehiclesTouchLike {
  assist: { configure(s: { steerAssist?: boolean; steerAssistStrength?: number; autoAccelerate?: boolean }): void };
  /** Held hand brake goes into DriverAssist.apply's input as handbrake: true/false. */
  setHandbrake(on: boolean): void;
  horn(on: boolean): void;
  driveBy?(on: boolean): void;
}

/** Only the driving calls; mode, context (exit) and the rest come from gameplay. */
export function vehiclesTouch(v: VehiclesTouchLike): Partial<TouchHost> {
  return {
    handbrake: (on) => v.setHandbrake(on),
    horn: (on) => v.horn(on),
    driveBy: v.driveBy ? (on) => v.driveBy!(on) : undefined,
    configure: (c) => v.assist.configure({ steerAssist: c.steerAssist, steerAssistStrength: c.steerAssistStrength, autoAccelerate: c.autoAccelerate }),
  };
}

/** Gameplay is the base; vehicles add the driving calls; configure fans out to both. */
export function combineTouch(base: TouchHost, ...extra: Partial<TouchHost>[]): TouchHost {
  const out: TouchHost = { ...base };
  const configs = [base.configure, ...extra.map((e) => e.configure)].filter(Boolean) as NonNullable<TouchHost['configure']>[];
  for (const e of extra) for (const [k, v] of Object.entries(e)) if (v !== undefined && k !== 'configure') (out as unknown as Record<string, unknown>)[k] = v;
  out.configure = (c) => { for (const f of configs) f(c); };
  return out;
}
