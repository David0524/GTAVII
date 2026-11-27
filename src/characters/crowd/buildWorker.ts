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
import { fitHead, neckProfileData, headFaceExtents } from '../heads/rocketbox';

let model: BodyModel | null = null;
self.onmessage = async (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'init') { model = await BodyModel.load(m.url); (self as unknown as Worker).postMessage({ type: 'ready' }); return; }
  if (m.type === 'build' && model) {
    const appearance = generateAppearance(m.seed);
    const outfit = generateOutfit(m.seed ^ 0x5bd1e995, { sex: appearance.sex, age: appearance.age, archetype: m.archetype });
    const shape = model.evaluate({ ...appearance.body, stature: appearance.stature });
    // a Rocketbox head (near ring, Medium+): assemble headless and return what the main thread needs to fit it
    const fit = m.head ? fitHead({ meta: m.head }, shape.joints) : null;
    const asm = assemble(model, shape, appearance, outfit, m.lod, false, fit ? { headCutY: fit.cutY, headRing: fit.ringY, headRingR: fit.ringR, headAxis: fit.neckAxis, headFace: headFaceExtents({ meta: m.head }, fit) } : {});
    const transfer: Transferable[] = [];
    for (const g of [asm.main, asm.hair]) if (g) for (const v of Object.values(g)) if (ArrayBuffer.isView(v)) transfer.push(v.buffer);
    const head = fit ? { joints: Float32Array.from(shape.joints), neck: neckProfileData(shape.pos, shape.joints, fit.neckBottom - 0.012, fit.neckBottom + 0.08) } : null;
    (self as unknown as Worker).postMessage({ type: 'built', id: m.id, asm, appearance, outfit, head }, transfer);
  }
};
