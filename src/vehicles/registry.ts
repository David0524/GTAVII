/**
 * Registry: shared VehicleClass (src/shared/traffic.ts) -> concrete model + paint, from the
 * sim's stable per-agent variant seed. Every class resolves to at least one model.
 */
import type { VehicleClass } from '../shared/traffic';
import { MODEL_BY_ID } from './models';
import { variantOf } from './assets';
import { rng } from './gen/builder';
import { BIKE_BY_ID } from './twowheel/bikes';

/** Weighted model choices per class. Taxis: mostly full-size sedans in yellow (STYLE_GUIDE §6). */
export const CLASS_MODELS: Record<VehicleClass, [string, number][]> = {
  sedan: [['bancroft', 1]],
  hardtop: [['tiverton', 1]],
  compact: [['ferris', 1]],
  wagon: [['homestead', 1]],
  taxi: [['bancroft_cab', 0.7], ['fareway', 0.3]],
  police: [['bancroft_patrol', 1]],
  bus: [['ct40', 1]],
  box_truck: [['b60', 1]],
  step_van: [['walkin', 1]],
  garbage: [['b80', 1]],
  // engine integration stopgap (sim request 8 classes added after the vehicles branch): vehicles to model these
  tow_truck: [['b60', 1]],
  street_sweeper: [['b80', 1]],
  ambulance: [['medic', 1]],
  fire_engine: [['pumper', 1]],
  ladder_truck: [['ladder', 1]],
  mail_truck: [['courier', 1]],
  ice_cream: [['scoop', 1]],
  motorcycle: [['calder650', 1]],
  police_motorcycle: [['calder_patrol', 1]],
  bicycle: [['wexford_roadster', 0.8], ['wexford_carrier', 0.2]],
};

/** Kept for compatibility: the request-7 classes are now in the shared contract (CLASS_MODELS). */
export const PROPOSED_CLASS_MODELS: Record<string, [string, number][]> = {};

export function resolve(vclass: VehicleClass | keyof typeof PROPOSED_CLASS_MODELS, variant: number): { modelId: string; paint: string } {
  const opts = (CLASS_MODELS as Record<string, [string, number][]>)[vclass] ?? PROPOSED_CLASS_MODELS[vclass];
  if (!opts) throw new Error(`no vehicle model for class "${vclass}"`);
  let pick = opts[0][0];
  if (opts.length > 1) {
    const total = opts.reduce((a, o) => a + o[1], 0);
    let x = rng((variant * 2654435761) >>> 0)() * total;
    for (const [id, w] of opts) { if ((x -= w) <= 0) { pick = id; break; } }
  }
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const bike = BIKE_BY_ID.get(pick);
  if (bike) return { modelId: pick, paint: hex(bike.palette[Math.floor(rng((variant + 11) * 7919)() * bike.palette.length)]) }; // same draw as TwoWheeler
  const spec = MODEL_BY_ID.get(pick)!;
  return { modelId: pick, paint: hex(variantOf(spec, variant).paint) };
}
