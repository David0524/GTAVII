/**
 * Runtime side of the parametric human: loads public/characters/body.bin and evaluates a body
 * (macro params + local modifiers) into vertex positions, joint positions and landmarks.
 * Pure data (no three.js), so it can run in a worker.
 */
import { readContainer } from '../format';
import { macroTargetWeights, type MacroParams } from './macro';

export interface BodyDesc {
  macro: MacroParams;
  /** Local modifiers by key (see BodyModel.localKeys), each -1..1 (paired) or 0..1 (single). */
  locals?: Record<string, number>;
  /** Target stature in metres (uniform scale after the shape is built). */
  stature?: number;
}

export interface BodyShape {
  /** Compact vertex positions (numSrc × 3), metres, soles at y = 0, facing +Z. */
  pos: Float32Array;
  /** Rest joint positions (numJoints × 3). */
  joints: Float32Array;
  landmarks: Record<string, [number, number, number]>;
  height: number;
}

interface LocalDef { name: string; count: number; scale: number; offset: number }
const NEG = /-(decr|in|down|backward|less|min|compress|concave|narrow|small|uncommon|close)$/;
const OPP: Record<string, string> = { decr: 'incr', in: 'out', down: 'up', backward: 'forward', less: 'more', min: 'max', compress: 'uncompress', concave: 'convex', narrow: 'wide', small: 'big', uncommon: 'ideal', close: 'far' };

export class BodyModel {
  readonly meta: any;
  readonly numSrc: number;
  readonly numSplit: number;
  readonly basePos: Float32Array;
  readonly splitSrc: Uint16Array;
  readonly splitUV: Float32Array;
  readonly splitGroup: Uint8Array;
  readonly skinJ: Uint8Array;
  readonly skinW: Uint8Array;
  readonly limbSeg: Uint8Array;
  readonly limbT: Uint8Array;
  readonly limbA: Uint8Array;
  readonly groups: string[];
  private readonly P: Float32Array;
  private readonly b16: Int16Array;
  private readonly b8: Int8Array;
  private readonly bScale: Float32Array;
  private readonly K: number;
  private readonly K16: number;
  private readonly localIdx: Uint16Array;
  private readonly localD: Int8Array;
  private readonly locals = new Map<string, LocalDef>();
  /** key → [negative target, positive target] (either may be absent). */
  readonly localKeys = new Map<string, [string | null, string | null]>();
  private readonly blobs: Map<string, ArrayBufferView>;
  private static readonly warned = new Set<string>();

  static async load(url: string): Promise<BodyModel> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`characters: ${url} ${r.status}`);
    return new BodyModel(await r.arrayBuffer());
  }

  constructor(buf: ArrayBuffer) {
    const c = readContainer(buf);
    this.meta = c.meta; this.blobs = c.blobs;
    const b = <T>(n: string) => { const x = c.blobs.get(n); if (!x) throw new Error(`body.bin: missing ${n}`); return x as unknown as T; };
    this.numSrc = c.meta.numSrc; this.numSplit = c.meta.numSplit; this.groups = c.meta.groups;
    this.basePos = b('basePos'); this.splitSrc = b('splitSrc'); this.splitUV = b('splitUV'); this.splitGroup = b('splitGroup');
    this.skinJ = b('skinJ'); this.skinW = b('skinW'); this.limbSeg = b('limbSeg'); this.limbT = b('limbT'); this.limbA = b('limbA');
    this.P = b('macroP'); this.b16 = b('basis16'); this.b8 = b('basis8'); this.bScale = b('basisScale');
    this.K = c.meta.macro.K; this.K16 = c.meta.macro.K16;
    this.localIdx = b('localIdx'); this.localD = b('localD');
    let off = 0;
    for (const d of c.meta.locals as { name: string; count: number; scale: number }[]) { this.locals.set(d.name, { ...d, offset: off }); off += d.count; }
    // Paired targets are addressed by their positive name ("…-incr", "…-up", "…-out", "…-forward");
    // a negative value applies the opposite target.
    for (const name of this.locals.keys()) {
      const m = NEG.exec(name);
      const key = m ? name.slice(0, m.index) + '-' + OPP[m[1]] : name;
      const e = this.localKeys.get(key) ?? [null, null];
      if (m) e[0] = name; else e[1] = name;
      this.localKeys.set(key, e);
    }
  }

  /** Finest LOD stored for a group (the Low download drops the close LODs). */
  minLod(group: string): number { const a = this.meta.availableLods?.[group] as number[] | undefined; return a && a.length ? Math.min(...a) : 0; }

  /** Triangle indices (split-vertex space) for a group at a LOD (0 = full). */
  indices(group: string, lod: number): Uint16Array {
    const g = this.groups.indexOf(group);
    const exact = this.blobs.get(`idx_${g}_${lod}`) as Uint16Array | undefined;
    if (exact) return exact;
    // reduced downloads (body_low.bin) carry only some LODs: use the nearest available one (finer first)
    const avail = (this.meta.availableLods?.[group] as number[] | undefined) ?? [];
    const pick = avail.filter((l) => l >= lod).sort((a, b) => a - b)[0] ?? avail.sort((a, b) => b - a)[0];
    return (pick !== undefined ? this.blobs.get(`idx_${g}_${pick}`) : undefined) as Uint16Array ?? new Uint16Array(0);
  }

  evaluate(desc: BodyDesc): BodyShape {
    const { numSrc: N, K, K16 } = this;
    const D = N * 3;
    const pos = Float32Array.from(this.basePos);
    // macro: coefficients from target weights, then the PCA basis
    const w = macroTargetWeights(desc.macro);
    const coef = new Float32Array(K);
    for (let i = 0; i < w.length; i++) { const wi = w[i]; if (wi > 1e-6) for (let k = 0; k < K; k++) coef[k] += wi * this.P[i * K + k]; }
    for (let k = 0; k < K; k++) {
      const s = coef[k] * this.bScale[k];
      if (Math.abs(s) < 1e-9) continue;
      if (k < K16) { const o = k * D; const b = this.b16; for (let d = 0; d < D; d++) pos[d] += s * b[o + d]; }
      else { const o = (k - K16) * D; const b = this.b8; for (let d = 0; d < D; d++) pos[d] += s * b[o + d]; }
    }
    // locals
    for (const [key, v] of Object.entries(desc.locals ?? {})) {
      if (!v) continue;
      const pair = this.localKeys.get(key);
      if (!pair) { if (!BodyModel.warned.has(key)) { BodyModel.warned.add(key); console.warn(`characters: unknown body modifier ${key}`); } continue; }
      const name = v < 0 ? pair[0] : pair[1];
      if (name) this.applyLocal(pos, name, Math.abs(v));
    }
    // ground the soles
    let minY = Infinity;
    for (let i = 1; i < D; i += 3) if (pos[i] < minY) minY = pos[i];
    for (let i = 1; i < D; i += 3) pos[i] -= minY;
    // uniform stature scale (head top regressed below)
    if (desc.stature) {
      const top = this.meta.landmarks.head_top as number[];
      let hy = 0; for (const i of top) hy += pos[i * 3 + 1] / top.length;
      const s = desc.stature / hy;
      for (let d = 0; d < D; d++) pos[d] *= s;
    }
    // joints
    const J = this.meta.joints as { name: string; parent: number; reg: number[] }[];
    const joints = new Float32Array(J.length * 3);
    const cen = (ids: number[], out: Float32Array | number[], o: number) => { for (let c = 0; c < 3; c++) { let s = 0; for (const i of ids) s += pos[i * 3 + c]; out[o + c] = s / ids.length; } };
    J.forEach((j, i) => { if (j.reg.length) cen(j.reg, joints, i * 3); });
    // root: on the ground under the pelvis
    joints[0] = joints[3]; joints[1] = 0; joints[2] = joints[5];
    const landmarks: Record<string, [number, number, number]> = {};
    for (const [k, ids] of Object.entries(this.meta.landmarks as Record<string, number[]>)) { const o = [0, 0, 0]; cen(ids, o, 0); landmarks[k] = o as [number, number, number]; }
    return { pos, joints, landmarks, height: landmarks.head_top[1] };
  }

  applyLocal(pos: Float32Array, name: string, amount: number) {
    const d = this.locals.get(name);
    if (!d) return;
    const s = d.scale * amount;
    for (let i = 0; i < d.count; i++) {
      const k = this.localIdx[d.offset + i] * 3, q = (d.offset + i) * 3;
      pos[k] += this.localD[q] * s; pos[k + 1] += this.localD[q + 1] * s; pos[k + 2] += this.localD[q + 2] * s;
    }
  }
}
