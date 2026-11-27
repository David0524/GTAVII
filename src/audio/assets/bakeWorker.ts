/// <reference lib="webworker" />
/** Bakes procedural one-shots off the main thread. */
import { BAKERS } from '../synth/bake';

self.onmessage = (e: MessageEvent<{ id: number; family: string; seed: number; sr: number }>) => {
  const { id, family, seed, sr } = e.data;
  const b = BAKERS[family];
  if (!b) { (self as unknown as Worker).postMessage({ id, error: `unknown family ${family}` }); return; }
  const t0 = performance.now();
  const data = b.bake(seed, sr);
  (self as unknown as Worker).postMessage({ id, data, ms: performance.now() - t0 }, [data.buffer]);
};
