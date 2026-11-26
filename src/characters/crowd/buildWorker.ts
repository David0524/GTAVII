/// <reference lib="webworker" />
/**
 * Builds characters off the main thread (body evaluation + garment assembly take 25–90 ms).
 * Messages: {type:'init', url} → {type:'ready'}; {type:'build', id, seed, archetype, lod, heat}
 * → {type:'built', id, asm, appearance, outfit} with the geometry buffers transferred.
 */
import { BodyModel } from '../body/BodyModel';
import { generateAppearance } from '../body/appearance';
import { generateOutfit } from '../wardrobe/outfit';
import { assemble } from '../build/assemble';

let model: BodyModel | null = null;
self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') { model = await BodyModel.load(m.url); (self as unknown as Worker).postMessage({ type: 'ready' }); return; }
  if (m.type === 'build' && model) {
    const appearance = generateAppearance(m.seed);
    const outfit = generateOutfit(m.seed ^ 0x5bd1e995, { sex: appearance.sex, age: appearance.age, archetype: m.archetype });
    const shape = model.evaluate({ ...appearance.body, stature: appearance.stature });
    const asm = assemble(model, shape, appearance, outfit, m.lod);
    const transfer: Transferable[] = [];
    for (const g of [asm.main, asm.hair]) if (g) for (const v of Object.values(g)) if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
    (self as unknown as Worker).postMessage({ type: 'built', id: m.id, asm, appearance, outfit }, transfer);
  }
};
