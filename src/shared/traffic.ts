/**
 * Shared traffic contract between the sim workstream (produces agents) and the vehicles workstream
 * (renders and drives them). Engine-owned: change only via ENGINE_REQUESTS.md.
 *
 * Flow: Simulation.vehicles: TrafficVehicleView[]  ->  engine glue  ->  VehicleFactory.createTrafficRenderer().setInstances(...)
 * The sim never knows model ids; the vehicles registry resolves (vclass, variant) -> concrete model + paint.
 */

/** Canonical vehicle classes for 1974 Midtown traffic. Spawn weights are sim-side; models are vehicles-side. */
export const VEHICLE_CLASSES = [
  'sedan', // full-size 4-door (most common)
  'hardtop', // 2-door personal-luxury
  'compact',
  'wagon',
  'taxi',
  'police',
  'bus',
  'box_truck', // garment-district box trucks
  'step_van',
  'garbage',
  // Roster additions (vehicles request 7, FEATURE_AUDIT, user-confirmed). Two-wheelers are spawned via
  // factory.spawnBike() until the traffic renderer instances them.
  'ambulance',
  'fire_engine',
  'ladder_truck',
  'mail_truck',
  'ice_cream', // summer soft-serve route
  'motorcycle',
  'police_motorcycle',
  'bicycle', // messengers
] as const;
export type VehicleClass = (typeof VEHICLE_CLASSES)[number];

/** Light/state bits the renderer turns into emissives (and audio may read). */
export const enum VehicleLights {
  Head = 1, Brake = 2, IndicatorLeft = 4, IndicatorRight = 8, Hazard = 16, Reverse = 32, RoofLight = 64 /* taxi vacant */, Siren = 128,
}

/** One AI vehicle as produced by Simulation each tick. */
export interface TrafficVehicleView {
  id: number;
  vclass: VehicleClass;
  /** Stable per-agent seed: the vehicles registry derives model, paint, dirt and damage look from it. */
  variant: number;
  x: number; y: number; z: number; yaw: number;
  speed: number; // m/s
  /** Bitmask of VehicleLights. */
  lights: number;
  state: string; // sim-defined, e.g. 'drive' | 'queue' | 'doublePark' | 'pickup' | 'busStop'
}

/** What the vehicles traffic renderer consumes (a structural subset of TrafficVehicleView). */
export type TrafficInstance = Pick<TrafficVehicleView, 'vclass' | 'variant' | 'x' | 'y' | 'z' | 'yaw' | 'lights'>;
