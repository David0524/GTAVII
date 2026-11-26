/**
 * Vehicles workstream: public entry point (integration contract from VEHICLES_BRIEF.md).
 *
 * Usage (engine side):
 *   await RAPIER.init();                       // once, engine-owned
 *   const vf = createVehicleFactory({ quality: 'high' });
 *   await vf.ready;                            // period fonts for decals (optional; falls back)
 *   const car = vf.spawn(world, scene, 'bancroft', { x, y: 0.05, z, yaw }, 3);
 *   // every physics step (fixed dt recommended, 60 Hz):
 *   car.setInput({ throttle, brake, steer, handbrake }); car.update(dt); world.step();
 *
 * Input ranges: throttle 0..1 (negative = reverse request), brake 0..1, steer -1 (left) .. 1 (right).
 * Holding brake at a standstill engages reverse automatically, as in most driving games.
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type * as THREE from 'three/webgpu';
import { MODELS, MODEL_BY_ID } from './models';
import { getAsset, variantOf } from './assets';
import { Vehicle } from './Vehicle';
import { TrafficRenderer, type TrafficInstance } from './traffic';
import { loadDecalFonts } from './gen/decals';
import type { Quality } from './gen/materials';

export type { Vehicle, VehicleEventType, SkidEvent, ImpactEvent, DamageEvent, DamageStage } from './Vehicle';
export type { TrafficInstance } from './traffic';
export { MODELS } from './models';

export interface VehicleFactory {
  models: readonly { id: string; class: string; displayName: string }[];
  /** Resolves when decal fonts are loaded (spawning before is fine; lettering uses fallbacks). */
  ready: Promise<void>;
  spawn(world: RAPIER.World, scene: THREE.Object3D, modelId: string, pose: { x: number; y: number; z: number; yaw: number }, variant?: number): Vehicle;
  /** Visual-only instanced proxies for AI traffic far from the player (no physics body). */
  createTrafficRenderer(maxInstances: number): { setInstances(list: TrafficInstance[], camera?: THREE.Vector3): void; object: THREE.Object3D; dispose(): void; lastMs: number };
  /** Build geometry ahead of time to avoid a hitch on first spawn. */
  preload(modelIds?: string[]): void;
}

export function createVehicleFactory(opts: { quality: Quality }): VehicleFactory {
  const q = opts.quality;
  return {
    models: MODELS.map((m) => ({ id: m.id, class: m.cls, displayName: m.displayName })),
    ready: loadDecalFonts(),
    spawn(world, scene, modelId, pose, variant = 0) {
      const spec = MODEL_BY_ID.get(modelId);
      if (!spec) throw new Error(`unknown vehicle model "${modelId}"`);
      const v = variantOf(spec, variant);
      return new Vehicle(world, scene, getAsset(spec, v), v, pose, q);
    },
    createTrafficRenderer(max) { return new TrafficRenderer(max, q); },
    preload(ids) {
      for (const id of ids ?? MODELS.map((m) => m.id)) {
        const spec = MODEL_BY_ID.get(id)!;
        getAsset(spec, variantOf(spec, 0));
      }
    },
  };
}
