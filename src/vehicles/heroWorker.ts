/// <reference lib="webworker" />
/**
 * Hero-mesh generation off the main thread (70–200 ms of CPU per model). Receives a model id and
 * trim options, posts back the packed geometry with its buffers transferred.
 */
import { MODEL_BY_ID } from './models';
import { generate } from './gen/body';
import { addDamageMorphs } from './gen/morphs';
import { packModel } from './geoTransfer';
import { strHash } from './gen/rng';

declare const self: DedicatedWorkerGlobalScope;
self.onmessage = (e: MessageEvent<{ key: string; specId: string; v: { vinyl: 'none' | 'full' | 'landau'; whitewall: boolean; wheelStyle: never } }>) => {
  const { key, specId, v } = e.data;
  try {
    const spec = MODEL_BY_ID.get(specId)!;
    const t0 = performance.now();
    const g = generate(spec, { lod: 0, hero: true, ...v });
    addDamageMorphs(g.body, g, strHash(spec.id) % 97);
    if (g.hood) addDamageMorphs(g.hood, g, strHash(spec.id) % 97);
  for (const bg of [g.bumperF, g.bumperR]) if (bg) addDamageMorphs(bg, g, strHash(spec.id) % 97);
    const { packed, transfer } = packModel(g);
    self.postMessage({ key, packed, ms: performance.now() - t0 }, transfer as Transferable[]);
  } catch (err) {
    self.postMessage({ key, error: String(err) });
  }
};
