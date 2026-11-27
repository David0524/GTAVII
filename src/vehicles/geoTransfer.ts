import * as THREE from 'three/webgpu';
import type { GeneratedModel } from './gen/body';

/** A BufferGeometry as plain transferable arrays (for the hero-mesh worker). */
export interface PackedGeometry {
  attrs: Record<string, { array: Float32Array; itemSize: number }>;
  index: Uint32Array | null;
  groups: { start: number; count: number; materialIndex: number }[];
  morph: Record<string, { array: Float32Array; itemSize: number }[]>;
  morphRelative: boolean;
}
type GeoKeys = 'body' | 'hood' | 'wheelR' | 'wheelL' | 'beacon' | 'bumperF' | 'bumperR';
const GEO_KEYS: GeoKeys[] = ['body', 'hood', 'wheelR', 'wheelL', 'beacon', 'bumperF', 'bumperR'];
export type PackedModel = Omit<GeneratedModel, GeoKeys> & Record<GeoKeys, PackedGeometry | null>;

export function packGeometry(g: THREE.BufferGeometry, transfer: ArrayBufferLike[]): PackedGeometry {
  const attrs: PackedGeometry['attrs'] = {};
  for (const [k, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array((a as THREE.BufferAttribute).array as ArrayLike<number>);
    attrs[k] = { array: arr, itemSize: a.itemSize }; transfer.push(arr.buffer);
  }
  const morph: PackedGeometry['morph'] = {};
  for (const [k, list] of Object.entries(g.morphAttributes)) {
    morph[k] = list.map((a) => { const arr = new Float32Array((a as THREE.BufferAttribute).array as ArrayLike<number>); transfer.push(arr.buffer); return { array: arr, itemSize: a.itemSize }; });
  }
  let index: Uint32Array | null = null;
  if (g.index) { index = new Uint32Array(g.index.array as ArrayLike<number>); transfer.push(index.buffer); }
  return { attrs, index, groups: g.groups.map((x) => ({ start: x.start, count: x.count, materialIndex: x.materialIndex ?? 0 })), morph, morphRelative: g.morphTargetsRelative };
}

export function unpackGeometry(p: PackedGeometry): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(p.attrs)) g.setAttribute(k, new THREE.BufferAttribute(a.array, a.itemSize));
  for (const [k, list] of Object.entries(p.morph)) (g.morphAttributes as Record<string, THREE.BufferAttribute[]>)[k] = list.map((a) => new THREE.BufferAttribute(a.array, a.itemSize));
  g.morphTargetsRelative = p.morphRelative;
  if (p.index) g.setIndex(new THREE.BufferAttribute(p.index, 1));
  for (const x of p.groups) g.addGroup(x.start, x.count, x.materialIndex);
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

export function packModel(m: GeneratedModel): { packed: PackedModel; transfer: ArrayBufferLike[] } {
  const transfer: ArrayBufferLike[] = [];
  const out: Record<string, unknown> = { ...m };
  for (const k of GEO_KEYS) out[k] = m[k] ? packGeometry(m[k]!, transfer) : null;
  out.doors = m.doors.map((d) => ({ ...d, geo: packGeometry(d.geo, transfer) }));
  out.steering = m.steering ? { ...m.steering, geo: packGeometry(m.steering.geo, transfer) } : null;
  return { packed: out as PackedModel, transfer };
}

export function unpackModel(p: PackedModel): GeneratedModel {
  const out: Record<string, unknown> = { ...p };
  for (const k of GEO_KEYS) out[k] = p[k] ? unpackGeometry(p[k]!) : null;
  out.doors = (p.doors as unknown as { geo: PackedGeometry }[]).map((d) => ({ ...d, geo: unpackGeometry(d.geo) }));
  const st = p.steering as unknown as { geo: PackedGeometry } | null;
  out.steering = st ? { ...st, geo: unpackGeometry(st.geo) } : null;
  return out as unknown as GeneratedModel;
}
