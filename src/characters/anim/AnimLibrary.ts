/**
 * Clip storage and sampling (no three.js AnimationMixer: one flat pose buffer per character and
 * cheap nlerp blending keep the per-character cost to a few microseconds per joint).
 * A Pose is local joint rotations (x,y,z,w per joint) + the pelvis offset from the root.
 */
import { readContainer } from '../format';
import { NUM_JOINTS } from '../rig';

export interface ClipInfo {
  name: string; duration: number; frames: number; fps: number; loop: boolean;
  /** Ground speed of the source clip (m/s, on the neutral body) and its travel per playthrough. */
  speed: number; travel: number[];
  /** Normalised [start, end] foot-contact intervals, per foot. */
  contacts: { l: [number, number][]; r: [number, number][] };
}

export class Pose {
  readonly q = new Float32Array(NUM_JOINTS * 4);
  readonly pelvis = new Float32Array(3);
  constructor() { this.identity(); }
  identity() { this.q.fill(0); for (let j = 0; j < NUM_JOINTS; j++) this.q[j * 4 + 3] = 1; this.pelvis.fill(0); return this; }
  copy(p: Pose) { this.q.set(p.q); this.pelvis.set(p.pelvis); return this; }
}

/** A sampled clip, either retargeted (anims.bin) or authored procedurally (authored.ts). */
export interface Clip {
  info: ClipInfo;
  rot: Int16Array | Float32Array; // frames × joints × 4
  pelvis: Float32Array;           // frames × 3
  /** Joints this clip animates (others keep the base pose when layered). null = all. */
  mask: Uint8Array | null;
  /** Additive clips store deltas from the identity and are applied on top of a base. */
  additive?: boolean;
}

export class AnimLibrary {
  readonly clips: Clip[] = [];
  readonly byName = new Map<string, number>();
  restPelvisHeight = 0.92;

  static async load(url: string): Promise<AnimLibrary> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`characters: ${url} ${r.status}`);
    const lib = new AnimLibrary();
    lib.addContainer(await r.arrayBuffer());
    return lib;
  }

  addContainer(buf: ArrayBuffer) {
    const c = readContainer(buf);
    this.restPelvisHeight = c.meta.restPelvisHeight;
    (c.meta.clips as ClipInfo[]).forEach((info, i) => {
      this.add({ info, rot: c.blobs.get(`rot_${i}`) as Int16Array, pelvis: c.blobs.get(`pel_${i}`) as Float32Array, mask: null });
    });
  }

  add(clip: Clip): number {
    const i = this.clips.length;
    this.clips.push(clip);
    this.byName.set(clip.info.name, i);
    return i;
  }

  get(name: string): number {
    const i = this.byName.get(name);
    if (i === undefined) throw new Error(`characters: no clip ${name}`);
    return i;
  }

  /**
   * Accumulates clip `ci` at time t (seconds, wrapped if looping) into `acc` with weight w.
   * Call normalize() on the accumulator after all contributions.
   */
  accumulate(ci: number, t: number, w: number, acc: Pose, mask: Uint8Array | null = null) {
    if (w <= 0) return;
    const c = this.clips[ci];
    const { frames, fps, duration, loop } = c.info;
    let tt = loop ? ((t % duration) + duration) % duration : Math.min(Math.max(t, 0), duration);
    const fpos = Math.min(tt * fps, frames - 1);
    const f0 = Math.floor(fpos), f1 = loop ? (f0 + 1) % frames : Math.min(f0 + 1, frames - 1);
    const u = fpos - f0;
    const scale = c.rot instanceof Int16Array ? 1 / 32767 : 1;
    const r = c.rot, q = acc.q;
    const m = mask ?? c.mask;
    for (let j = 0; j < NUM_JOINTS; j++) {
      if (m && !m[j]) continue;
      const a = (f0 * NUM_JOINTS + j) * 4, b = (f1 * NUM_JOINTS + j) * 4;
      let ax = r[a] * scale, ay = r[a + 1] * scale, az = r[a + 2] * scale, aw = r[a + 3] * scale;
      let bx = r[b] * scale, by = r[b + 1] * scale, bz = r[b + 2] * scale, bw = r[b + 3] * scale;
      if (ax * bx + ay * by + az * bz + aw * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
      let x = ax + (bx - ax) * u, y = ay + (by - ay) * u, z = az + (bz - az) * u, ww = aw + (bw - aw) * u;
      const o = j * 4;
      // hemisphere-align with what's already accumulated
      if (q[o] * x + q[o + 1] * y + q[o + 2] * z + q[o + 3] * ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
      q[o] += x * w; q[o + 1] += y * w; q[o + 2] += z * w; q[o + 3] += ww * w;
    }
    const p = c.pelvis;
    for (let k = 0; k < 3; k++) acc.pelvis[k] += (p[f0 * 3 + k] + (p[f1 * 3 + k] - p[f0 * 3 + k]) * u) * w;
  }
}

/** Zero an accumulator (all-zero quaternions, so contributions add up). */
export function clearAcc(p: Pose) { p.q.fill(0); p.pelvis.fill(0); }

/** Normalise accumulated quaternions; joints with no contribution get the identity. */
export function normalizePose(p: Pose, totalWeight = 1) {
  const q = p.q;
  for (let j = 0; j < NUM_JOINTS; j++) {
    const o = j * 4;
    const l = Math.hypot(q[o], q[o + 1], q[o + 2], q[o + 3]);
    if (l < 1e-8) { q[o] = q[o + 1] = q[o + 2] = 0; q[o + 3] = 1; }
    else { q[o] /= l; q[o + 1] /= l; q[o + 2] /= l; q[o + 3] /= l; }
  }
  if (totalWeight > 0 && totalWeight !== 1) for (let k = 0; k < 3; k++) p.pelvis[k] /= totalWeight;
}

/** out = lerp(a, b, t) per joint (nlerp), optionally masked. */
export function blendPose(a: Pose, b: Pose, t: number, out: Pose, mask: Uint8Array | null = null) {
  for (let j = 0; j < NUM_JOINTS; j++) {
    const o = j * 4;
    if (mask && !mask[j]) { if (out !== a) { out.q[o] = a.q[o]; out.q[o + 1] = a.q[o + 1]; out.q[o + 2] = a.q[o + 2]; out.q[o + 3] = a.q[o + 3]; } continue; }
    const tt = mask ? t * (mask[j] / 255) : t;
    let bx = b.q[o], by = b.q[o + 1], bz = b.q[o + 2], bw = b.q[o + 3];
    if (a.q[o] * bx + a.q[o + 1] * by + a.q[o + 2] * bz + a.q[o + 3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
    const x = a.q[o] + (bx - a.q[o]) * tt, y = a.q[o + 1] + (by - a.q[o + 1]) * tt, z = a.q[o + 2] + (bz - a.q[o + 2]) * tt, w = a.q[o + 3] + (bw - a.q[o + 3]) * tt;
    const l = Math.hypot(x, y, z, w) || 1;
    out.q[o] = x / l; out.q[o + 1] = y / l; out.q[o + 2] = z / l; out.q[o + 3] = w / l;
  }
  for (let k = 0; k < 3; k++) out.pelvis[k] = a.pelvis[k] + (b.pelvis[k] - a.pelvis[k]) * t;
}
