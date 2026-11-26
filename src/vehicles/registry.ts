/**
 * Registry: shared VehicleClass (src/shared/traffic.ts) -> concrete model + paint, from the
 * sim's stable per-agent variant seed. Every class resolves to at least one model.
 */
import type { VehicleClass } from '../shared/traffic';
import { MODEL_BY_ID } from './models';
import { variantOf } from './assets';
import { rng } from './gen/builder';

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
};

export function resolve(vclass: VehicleClass, variant: number): { modelId: string; paint: string } {
  const opts = CLASS_MODELS[vclass];
  if (!opts) throw new Error(`no vehicle model for class "${vclass}"`);
  let pick = opts[0][0];
  if (opts.length > 1) {
    const total = opts.reduce((a, o) => a + o[1], 0);
    let x = rng((variant * 2654435761) >>> 0)() * total;
    for (const [id, w] of opts) { if ((x -= w) <= 0) { pick = id; break; } }
  }
  const spec = MODEL_BY_ID.get(pick)!;
  return { modelId: pick, paint: '#' + variantOf(spec, variant).paint.toString(16).padStart(6, '0') };
}
