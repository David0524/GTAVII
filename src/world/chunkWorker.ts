/// <reference lib="webworker" />
import { readChunk } from '../shared/chunkFormat';
import { buildChunk, type ChunkMeshes, type MeshArrays } from './meshBuilder';

export interface ChunkRequest { key: string; url: string; chunkSize: number }
export type ChunkResponse = { ok: true; mesh: ChunkMeshes; parseMs: number } | { ok: false; key: string; error: string };

const transfer = (m: MeshArrays) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer];

self.onmessage = async (ev: MessageEvent<ChunkRequest>) => {
  const { key, url, chunkSize } = ev.data;
  try {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = readChunk(await res.arrayBuffer());
    const mesh = buildChunk(data, chunkSize);
    const msg: ChunkResponse = { ok: true, mesh, parseMs: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, [...transfer(mesh.buildings), ...transfer(mesh.ground), ...transfer(mesh.buildingsLod1)] as Transferable[]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, key, error: String(e) } satisfies ChunkResponse);
  }
};
