import type { V3 } from './vec';

/**
 * What the gameplay core needs from the physical world. The test scene implements it with the
 * engine's Rapier world plus analytic prop/vehicle shapes; headless tests implement it with boxes.
 * Materials drive bullet penetration and impact effects.
 */
export type Material = 'brick' | 'concrete' | 'metal_thin' | 'metal_thick' | 'glass' | 'wood' | 'plaster' | 'flesh' | 'cloth' | 'asphalt' | 'water';

export interface RayHit { t: number; material: Material; /** world-shape id (prop id, vehicle id, 'city') */ id: string; normal?: V3; /** thickness of the struck panel along the ray, metres (for penetration) */ thickness?: number }

export interface WorldQuery {
  /** First hit along a unit ray from o within max metres. */
  ray(o: V3, d: V3, max: number, ignore?: string): RayHit | null;
  /** Ground height (road surface) at x,z. */
  ground(x: number, z: number): number;
}

/** Penetration resistance per material, in "power" units consumed per metre of thickness. Infinity = stops everything. */
export const RESIST: Record<Material, number> = {
  brick: Infinity, concrete: Infinity, metal_thick: Infinity, asphalt: Infinity, water: 40,
  metal_thin: 8, // a car door (skin, window regulator, trim; 3.5 cm effective) costs 0.28 power: handguns go through both doors, buckshot doesn't
  glass: 25, wood: 18, plaster: 9, flesh: 4, cloth: 1,
};
export const DEFAULT_THICKNESS: Record<Material, number> = {
  brick: 0.3, concrete: 0.3, metal_thick: 0.05, asphalt: 1, water: 1, metal_thin: 0.035, glass: 0.006, wood: 0.04, plaster: 0.08, flesh: 0.25, cloth: 0.01,
};

/** A simple box-world for tests and the flat test lot. */
export interface BoxShape { id: string; c: V3; h: V3; yaw: number; material: Material; thickness?: number }
