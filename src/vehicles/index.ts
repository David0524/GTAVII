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
import type RAPIER from './rapier';
import type * as THREE from 'three/webgpu';
import { MODELS, MODEL_BY_ID } from './models';
import { getAsset, variantOf } from './assets';
import { Vehicle, type VehicleInit } from './Vehicle';
import type { VehicleSave } from './state';
import { TwoWheeler, type TwoWheelerSave } from './twowheel/TwoWheeler';
import { BIKES, BIKE_BY_ID } from './twowheel/bikes';
export type { TwoWheeler, TwoWheelerSave, CrashEvent } from './twowheel/TwoWheeler';
export { BIKES } from './twowheel/bikes';
import { TrafficRenderer } from './traffic';
import { VendorProps } from './props/VendorProps';
import { resolve } from './registry';
import type { TrafficInstance, VehicleClass } from '../shared/traffic';
import { loadDecalFonts } from './gen/decals';
import type { Quality } from './gen/materials';

export type { Vehicle, VehicleEventType, SkidEvent, ImpactEvent, DamageEvent, DamageStage, ComponentEvent, TheftEvent, EngineEvent, Hit, SeatId, VehicleInit } from './Vehicle';
export { vehicleOfCollider, updateHeroRing, HERO_RING } from './Vehicle';
export type { VehicleSave, TrimTier, Condition, Upgrade, TrunkItem, FailureKind } from './state';
export { UPGRADES, TRIM } from './state';
export type { TrafficInstance, VehicleClass } from '../shared/traffic';
export { CLASS_MODELS } from './registry';
export { MODELS } from './models';
export { DriverAssist, TOUCH_DEFAULTS, PAD_DEFAULTS, type AssistSettings } from './assist';
export { VendorProps, type VendorView, type CartHitEvent, type CartTippedEvent, type CartMovedEvent } from './props/VendorProps';
export { VENDOR_SPECS, type VendorPropId } from './props/vendorModels';
export { brandFor, type VendorBrand } from './props/brands';
export { renderThumbnail, renderThumbnailBlob, type ThumbAngle, type ThumbOptions } from './thumbnail';
export { CarLightPool, updateCarLights, setGroundLightLevel, LIGHT_BUDGET, type LightCandidate, type Lightable } from './lighting';
import type { LightCandidate } from './lighting';
import { FadeLOD } from './fadeLod';
/** The camera the game renders with: LOD crossfades follow it (not shadow-map cameras). */
export function setVehicleViewCamera(camera: THREE.Camera) { FadeLOD.viewCamera = camera; }
export { setLodCrossfade } from './gen/materials';

export interface VehicleFactory {
  models: readonly { id: string; class: string; displayName: string }[];
  /** Resolves when decal fonts are loaded (spawning before is fine; lettering uses fallbacks). */
  ready: Promise<void>;
  spawn(world: RAPIER.World, scene: THREE.Object3D, modelId: string, pose: { x: number; y: number; z: number; yaw: number }, variant?: number, init?: VehicleInit): Vehicle;
  /** Rebuild a saved car exactly (vehicle.serialize() -> save -> restore). */
  restore(world: RAPIER.World, scene: THREE.Object3D, save: VehicleSave): Vehicle;
  /** Visual-only instanced proxies for AI traffic far from the player (no physics body). */
  /** Street-vendor carts and stands as physics props (sync with sim.vendorViews). */
  createVendorProps(world: RAPIER.World, scene: THREE.Object3D): VendorProps;
  createTrafficRenderer(maxInstances: number): {
    /** lit: the CarLightPool after assign(), so cars holding a real light skip their ground pools. */
    setInstances(list: readonly TrafficInstance[], camera?: THREE.Vector3, lit?: { litHead: Set<string>; litRear: Set<string> }): void;
    /** Real-light requests for nearby traffic (feed to updateCarLights' extra list). */
    lightCandidates(list: readonly TrafficInstance[], camera: THREE.Vector3, radius?: number): LightCandidate[];
    object: THREE.Object3D; dispose(): void; lastMs: number;
  };
  /** Registry: every VehicleClass resolves to >= 1 model; the variant seeds model choice, paint, dirt, dents. */
  resolve(vclass: VehicleClass, variant: number): { modelId: string; paint: string };
  /** Motorcycles, bicycles, the carrier trike (same driving contract; emits 'crash' for the rider ragdoll). */
  spawnBike(world: RAPIER.World, scene: THREE.Object3D, modelId: string, pose: { x: number; y: number; z: number; yaw: number }, variant?: number): TwoWheeler;
  restoreBike(world: RAPIER.World, scene: THREE.Object3D, save: TwoWheelerSave): TwoWheeler;
  /** Build geometry ahead of time to avoid a hitch on first spawn. */
  preload(modelIds?: string[]): void;
}

export function createVehicleFactory(opts: { quality: Quality }): VehicleFactory {
  const q = opts.quality;
  return {
    models: [...MODELS.map((m) => ({ id: m.id, class: m.cls as string, displayName: m.displayName })), ...BIKES.map((b) => ({ id: b.id, class: b.cls as string, displayName: b.displayName }))],
    ready: loadDecalFonts(),
    spawn(world, scene, modelId, pose, variant = 0, init) {
      const spec = MODEL_BY_ID.get(modelId);
      if (!spec) throw new Error(`unknown vehicle model "${modelId}"`);
      const v = variantOf(spec, variant);
      return new Vehicle(world, scene, getAsset(spec, v), v, pose, q, init);
    },
    restore(world, scene, save) {
      const spec = MODEL_BY_ID.get(save.modelId);
      if (!spec) throw new Error(`unknown vehicle model "${save.modelId}"`);
      const v = variantOf(spec, save.variant);
      return new Vehicle(world, scene, getAsset(spec, v), v, { x: save.pose.x, y: save.pose.y, z: save.pose.z, yaw: 0 }, q, { save });
    },
    createVendorProps(world, scene) { return new VendorProps(world, scene, q); },
    createTrafficRenderer(max) { return new TrafficRenderer(max, q); },
    spawnBike(world, scene, modelId, pose, variant = 0) {
      const spec = BIKE_BY_ID.get(modelId);
      if (!spec) throw new Error(`unknown two-wheeler "${modelId}"`);
      return new TwoWheeler(world, scene, spec, variant, pose, q);
    },
    restoreBike(world, scene, save) {
      const spec = BIKE_BY_ID.get(save.modelId)!;
      return new TwoWheeler(world, scene, spec, save.variant, { x: save.pose.x, y: save.pose.y, z: save.pose.z, yaw: 0 }, q, { save });
    },
    resolve,
    preload(ids) {
      for (const id of ids ?? MODELS.map((m) => m.id)) {
        const spec = MODEL_BY_ID.get(id)!;
        getAsset(spec, variantOf(spec, 0));
      }
    },
  };
}
