/// <reference lib="webworker" />
import { readChunk } from '../shared/chunkFormat';
import { buildChunk, type ChunkMeshes, type MeshArrays } from './meshBuilder';
import { loadTerrain, heightAt } from '../shared/terrain';
import { loadOpenings, edgeOpenings } from './openings';

/** interiorsUrl: interiors' unit index; when set, facades are cut at doors and storefronts (plugs fill them). */
export interface ChunkRequest { key: string; url: string; chunkSize: number; terrainUrl: string; i: number; j: number; interiorsUrl?: string }
export type ChunkResponse = { ok: true; mesh: ChunkMeshes; parseMs: number } | { ok: false; key: string; error: string };

const transfer = (m: MeshArrays) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.index.buffer, ...(m.uv ? [m.uv.buffer] : []), ...(m.facade ? [m.facade.buffer] : []), ...(m.wallAO ? [m.wallAO.buffer] : [])];

self.onmessage = async (ev: MessageEvent<ChunkRequest>) => {
  const { key, url, chunkSize, terrainUrl, i, j, interiorsUrl } = ev.data;
  try {
    const t0 = performance.now();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = readChunk(await res.arrayBuffer());
    await Promise.all([loadTerrain(terrainUrl), interiorsUrl ? loadOpenings(interiorsUrl) : undefined]);
    const ox = (i + 0.5) * chunkSize, oz = (j + 0.5) * chunkSize;
    const mesh = buildChunk(data, chunkSize, (x, z) => heightAt(ox + x, oz + z), ox, { oz, openings: interiorsUrl ? edgeOpenings : undefined });
    const msg: ChunkResponse = { ok: true, mesh, parseMs: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, [...transfer(mesh.buildings), ...transfer(mesh.ground), ...transfer(mesh.buildingsLod1), ...transfer(mesh.props), ...mesh.detail.flatMap(transfer), ...transfer(mesh.spill), ...transfer(mesh.marquee), ...transfer(mesh.plugs)] as Transferable[]);
  } catch (e) {
    (self as unknown as Worker).postMessage({ ok: false, key, error: String(e) } satisfies ChunkResponse);
  }
};
