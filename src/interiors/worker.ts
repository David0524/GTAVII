/// <reference lib="webworker" />
/**
 * Interiors build worker: generation + baking off the main thread (like the engine's chunk worker).
 * Also caches chunk footprints so generators can fit upper floors to the real building outline.
 */
import { readChunk } from '../shared/chunkFormat';
import { buildInterior, transferables, type BuildRequest } from './build';

export interface WorkerReq { seq: number; req: Omit<BuildRequest, 'ring'>; chunkUrl: string | null }
export type WorkerRes = { seq: number; ok: true; built: ReturnType<typeof buildInterior>; ms: number } | { seq: number; ok: false; error: string };

const chunks = new Map<string, Promise<Map<number, number[]>>>();
function footprints(url: string, i: number, j: number) {
  let p = chunks.get(url);
  if (!p) {
    p = fetch(url).then((r) => r.arrayBuffer()).then((buf) => {
      const c = readChunk(buf); const ox = (i + 0.5) * 200, oz = (j + 0.5) * 200; const m = new Map<number, number[]>();
      for (const b of c.buildings) { const r = b.rings[0], a: number[] = []; for (let k = 0; k < r.length; k += 2) a.push(r[k] + ox, r[k + 1] + oz); m.set(b.id, a); }
      return m;
    });
    chunks.set(url, p);
    if (chunks.size > 24) chunks.delete(chunks.keys().next().value!);
  }
  return p;
}

self.onmessage = async (ev: MessageEvent<WorkerReq>) => {
  const { seq, req, chunkUrl } = ev.data;
  try {
    const t0 = performance.now();
    let ring: number[] | null = null;
    if (chunkUrl) { const m = /(-?\d+)_(-?\d+)\.bin/.exec(chunkUrl)!; ring = (await footprints(chunkUrl, +m[1], +m[2])).get(req.building.id) ?? null; }
    const built = buildInterior({ ...req, ring });
    const msg: WorkerRes = { seq, ok: true, built, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, transferables(built) as Transferable[]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ seq, ok: false, error: String((e as Error)?.stack ?? e) } satisfies WorkerRes);
  }
};
