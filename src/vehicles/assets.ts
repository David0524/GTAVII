import * as THREE from 'three/webgpu';
import { generate, type GeneratedModel } from './gen/body';
import { addDamageMorphs } from './gen/morphs';
import { GeoBuilder, rng } from './gen/builder';
import { strHash } from './gen/rng';
import { unpackModel, type PackedModel } from './geoTransfer';
import type { ModelSpec } from './gen/spec';

export interface Variant {
  seed: number;
  paint: number; metallic: boolean;
  vinyl: 'none' | 'full' | 'landau'; vinylColor: number;
  whitewall: boolean; wheelStyle: ModelSpec['wheelStyle'];
  dirt: number;
}

const VINYLS = [0xe6e1d2, 0x141414, 0x3a281a, 0xb8a684, 0x141414, 0xe6e1d2];

/** Deterministic variant from an integer: paint, trim level, vinyl roof, wheels, grime. */
export function variantOf(spec: ModelSpec, variant: number): Variant {
  const r = rng((variant * 977 + strHash(spec.id)) >>> 0);
  const paint = spec.palette[Math.floor(r() * spec.palette.length)];
  const metallic = r() < spec.metallicChance;
  const car = spec.cls === 'sedan' || spec.cls === 'coupe' || spec.cls === 'compact' || spec.cls === 'wagon';
  const hasVinyl = r() < spec.vinylChance;
  let vinylColor = VINYLS[Math.floor(r() * VINYLS.length)];
  if (Math.abs(vinylColor - paint) < 0x101010) vinylColor = VINYLS[(VINYLS.indexOf(vinylColor) + 1) % VINYLS.length];
  const whitewall = spec.whitewall ? r() < 0.8 : car && r() < 0.1;
  let wheelStyle = spec.wheelStyle;
  if (car && spec.wheelStyle === 'fullcover' && r() < 0.3) wheelStyle = 'hubcap';
  const dirt = spec.cls === 'taxi' ? 0.35 + r() * 0.45 : spec.cls === 'garbage' ? 0.7 + r() * 0.3 : 0.12 + r() * 0.55;
  return { seed: variant, paint, metallic, vinyl: hasVinyl ? (spec.cls === 'coupe' ? 'landau' : 'full') : 'none', vinylColor, whitewall, wheelStyle, dirt };
}

export interface ModelAsset {
  spec: ModelSpec;
  lod0: GeneratedModel;
  lod1: GeneratedModel;
  /** Box impostor (paint / glass / rubber / paint2 slots). */
  lod2: THREE.BufferGeometry;
}

const cache = new Map<string, ModelAsset>();

/** Geometry depends only on the trim options, not on paint, so it is shared across variants. */
export function getAsset(spec: ModelSpec, v: Pick<Variant, 'vinyl' | 'whitewall' | 'wheelStyle'>): ModelAsset {
  const key = `${spec.id}|${v.vinyl}|${v.whitewall ? 1 : 0}|${v.wheelStyle}`;
  let a = cache.get(key);
  if (a) return a;
  const lod0 = generate(spec, { lod: 0, ...v });
  addDamageMorphs(lod0.body, lod0, strHash(spec.id) % 97);
  if (lod0.hood) addDamageMorphs(lod0.hood, lod0, strHash(spec.id) % 97);
  for (const bg of [lod0.bumperF, lod0.bumperR, ...lod0.doors.map((d) => d.geo), lod0.trunkLid?.geo ?? null]) if (bg) addDamageMorphs(bg, lod0, strHash(spec.id) % 97);
  const lod1 = generate(spec, { lod: 1, ...v }); // keeps the whitewalls: LOD1 must read like LOD0 across the crossfade
  a = { spec, lod0, lod1, lod2: impostor(spec, lod0) };
  cache.set(key, a);
  return a;
}

const heroCache = new Map<string, GeneratedModel>();
type TrimKey = Pick<Variant, 'vinyl' | 'whitewall' | 'wheelStyle'>;
const heroKey = (spec: ModelSpec, v: TrimKey) => `${spec.id}|${v.vinyl}|${v.whitewall ? 1 : 0}|${v.wheelStyle}`;

// ---- worker pipeline: hero meshes are built off the main thread, never during a frame
let worker: Worker | null | undefined;
const pending = new Map<string, Promise<GeneratedModel>>();
const waiters = new Map<string, { resolve: (g: GeneratedModel) => void; reject: (e: unknown) => void }>();
/** Worker generation times (ms), for the budget report. */
export const heroGenTimes: number[] = [];
function heroWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker !== 'undefined' ? new Worker(new URL('./heroWorker.ts', import.meta.url), { type: 'module' }) : null;
    worker?.addEventListener('message', (e: MessageEvent<{ key: string; packed?: PackedModel; ms?: number; error?: string }>) => {
      const w = waiters.get(e.data.key); if (!w) return;
      waiters.delete(e.data.key);
      if (e.data.error || !e.data.packed) { pending.delete(e.data.key); w.reject(e.data.error); return; }
      const g = unpackModel(e.data.packed);
      heroCache.set(e.data.key, g);
      if (e.data.ms) heroGenTimes.push(e.data.ms);
      w.resolve(g);
    });
  } catch { worker = null; }
  return worker;
}
/** The hero mesh if it has been built, else null (and nothing is generated). */
export function heroModelIfReady(spec: ModelSpec, v: TrimKey): GeneratedModel | null { return heroCache.get(heroKey(spec, v)) ?? null; }
/**
 * Build the hero mesh in the background: in a Web Worker where available, otherwise in an idle
 * callback. Call at spawn / when a car approaches; promote it (setHero) once the promise resolves.
 */
export function requestHeroModel(spec: ModelSpec, v: TrimKey): Promise<GeneratedModel> {
  const key = heroKey(spec, v);
  const have = heroCache.get(key);
  if (have) return Promise.resolve(have);
  let p = pending.get(key);
  if (p) return p;
  const w = heroWorker();
  p = new Promise<GeneratedModel>((resolve, reject) => {
    if (w) { waiters.set(key, { resolve, reject }); w.postMessage({ key, specId: spec.id, v: { vinyl: v.vinyl, whitewall: v.whitewall, wheelStyle: v.wheelStyle } }); }
    else {
      const run = () => { try { resolve(getHeroModel(spec, v)); } catch (e) { reject(e); } };
      const ric = (globalThis as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback;
      if (ric) ric(run); else setTimeout(run, 0);
    }
  });
  pending.set(key, p);
  return p;
}

/** Hero LOD0, generated synchronously on this thread (tools / tests; the game uses requestHeroModel). */
export function getHeroModel(spec: ModelSpec, v: TrimKey): GeneratedModel {
  const key = heroKey(spec, v);
  let g = heroCache.get(key);
  if (g) return g;
  g = generate(spec, { lod: 0, hero: true, ...v });
  addDamageMorphs(g.body, g, strHash(spec.id) % 97);
  if (g.hood) addDamageMorphs(g.hood, g, strHash(spec.id) % 97);
  for (const bg of [g.bumperF, g.bumperR, ...g.doors.map((d) => d.geo), g.trunkLid?.geo ?? null]) if (bg) addDamageMorphs(bg, g, strHash(spec.id) % 97);
  heroCache.set(key, g);
  return g;
}

function impostor(spec: ModelSpec, g: GeneratedModel): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const zc = (z0: number, z1: number) => (z0 + z1) / 2;
  const mid = spec.sF + spec.wheelbase / 2;
  const cabEnd = spec.L - mid;
  b.box('paint', 0, (spec.sillY + spec.beltY) / 2, zc(g.minZ, cabEnd), g.halfW * 2, spec.beltY - spec.sillY, cabEnd - g.minZ);
  const gh = spec.gh;
  b.box('glass', 0, (spec.beltY + gh.roofY) / 2, zc(gh.sA0 - mid, gh.sC0 - mid) + 0.1, gh.roofHalfW * 2 + 0.1, gh.roofY - spec.beltY, (gh.sC0 + gh.sC1) / 2 - (gh.sA0 + gh.sA1) / 2);
  for (const c of (spec.cargo ?? []).filter((k) => !k.dressing)) b.box(c.slot === 'paint' ? 'paint' : 'paint2', 0, (c.y0 + c.y1) / 2, zc(c.s0 - mid, c.s1 - mid), c.hw * 2, c.y1 - c.y0, c.s1 - c.s0);
  for (const w of g.wheels) b.box('rubber', w.x, w.r, w.z, spec.tireW, w.r * 2, w.r * 2);
  return b.build();
}

export function clearAssetCache() {
  for (const a of cache.values()) {
    for (const g of [a.lod0, a.lod1]) { g.body.dispose(); g.hood?.dispose(); g.wheelR.dispose(); g.wheelL.dispose(); g.beacon?.dispose(); }
    a.lod2.dispose();
  }
  cache.clear();
}
