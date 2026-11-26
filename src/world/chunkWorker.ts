/// <reference lib="webworker" />
import { readChunk } from '../shared/chunkFormat';
import { buildChunk, type ChunkMeshes, type MeshArrays } from './meshBuilder';
import { loadTerrain, heightAt } from '../shared/terrain';

export interface ChunkRequest { key: string; url: string; chunkSize: number; terrainUrl: string; i: number; j: number }
export type ChunkResponse = { ok: true; mesh: ChunkMeshes; parseMs: number } | { ok: false; key: string; error: string };

const transfer = (m: MeshArrays) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer, ...(m.uv ? [m.uv.buffer] : []), ...(m.facade ? [m.facade.buffer] : [])];

self.onmessage = async (ev: MessageEvent<ChunkRequest>) => {
  const { key, url, chunkSize, terrainUrl, i, j } = ev.data;
  try {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = readChunk(await res.arrayBuffer());
    await loadTerrain(terrainUrl);
    const ox = (i + 0.5) * chunkSize, oz = (j + 0.5) * chunkSize;
    const mesh = buildChunk(data, chunkSize, (x, z) => heightAt(ox + x, oz + z), ox);
    const msg: ChunkResponse = { ok: true, mesh, parseMs: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, [...transfer(mesh.buildings), ...transfer(mesh.ground), ...transfer(mesh.buildingsLod1), ...transfer(mesh.props)] as Transferable[]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, key, error: String(e) } satisfies ChunkResponse);
  }
};
