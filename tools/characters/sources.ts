/** Loads the raw MakeHuman (CC0 assets) data from data/raw/characters (see fetch.ts). */
import fs from 'node:fs';
import path from 'node:path';
import { parseObj, readNpy, readZip, type ObjMesh } from './lib/io.ts';

export const RAW = path.resolve(import.meta.dirname, '../../data/raw/characters');
/** MakeHuman units are decimetres; we work in metres. */
export const MH_SCALE = 0.1;

export interface Target { name: string; idx: Uint32Array; d: Int16Array /* xyz, ×1e-3 MH units */ }
export interface Sources {
  obj: ObjMesh;
  skel: { bones: Record<string, { head: string; tail: string; parent: string | null }>; joints: Record<string, number[]> };
  weights: Record<string, [number, number][]>;
  targets: Map<string, Target>;
}

export function loadSources(): Sources {
  const obj = parseObj(fs.readFileSync(path.join(RAW, 'base.obj'), 'utf8'));
  const skel = JSON.parse(fs.readFileSync(path.join(RAW, 'default.mhskel'), 'utf8'));
  const weights = JSON.parse(fs.readFileSync(path.join(RAW, 'default_weights.mhw'), 'utf8')).weights;
  const zip = readZip(fs.readFileSync(path.join(RAW, 'targets.npz')));
  const targets = new Map<string, Target>();
  for (const [name, buf] of zip) {
    if (!name.endsWith('.index.npy')) continue;
    const base = name.slice(0, -'.index.npy'.length);
    const vec = zip.get(base + '.vector.npy');
    if (!vec) continue;
    const i = readNpy(buf), v = readNpy(vec);
    const key = base.replace(/^targets\//, '');
    targets.set(key, { name: key, idx: Uint32Array.from(i.data as ArrayLike<number>), d: v.data as Int16Array });
  }
  return { obj, skel, weights, targets };
}
