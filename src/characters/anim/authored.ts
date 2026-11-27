/**
 * Hand-keyed clips authored in code (our own work, no third-party data): civilian idles,
 * 1974 street ambient actions, talk gestures by emotion, reactions and locomotion pieces the
 * Quaternius library doesn't have (turn-in-place, strafe, shuffle, cower).
 *
 * Keys are Euler offsets (degrees, XYZ) from the rig's rest A-pose, per joint, in the parent's
 * frame (rest frames are identity-oriented, so +X pitches forward/down for the spine, +Z raises
 * the left arm, −Z the right). Keys are interpolated with smooth (cubic Hermite) easing.
 */
import { NUM_JOINTS, JOINT_INDEX as JI } from '../rig';
import type { AnimLibrary, Clip, ClipInfo } from './AnimLibrary';

type Euler = [number, number, number];
export interface Key { t: number; j: Record<string, Euler>; pelvis?: [number, number, number]; ease?: 'smooth' | 'linear' }
export interface ClipDef {
  name: string; duration: number; loop: boolean; keys: Key[];
  /** Joints this clip drives when layered (undefined = all keyed + a default body). */
  mask?: string[];
  /** Constant offsets applied to every key (a base posture). */
  base?: Record<string, Euler>;
  speed?: number;
  contacts?: ClipInfo['contacts'];
  events?: { t: number; type: string; data?: any }[];
}

const D = Math.PI / 180;
function quatFromEuler(x: number, y: number, z: number, out: Float32Array, o: number) {
  const c1 = Math.cos(x / 2), s1 = Math.sin(x / 2), c2 = Math.cos(y / 2), s2 = Math.sin(y / 2), c3 = Math.cos(z / 2), s3 = Math.sin(z / 2);
  out[o] = s1 * c2 * c3 + c1 * s2 * s3; out[o + 1] = c1 * s2 * c3 - s1 * c2 * s3; out[o + 2] = c1 * c2 * s3 + s1 * s2 * c3; out[o + 3] = c1 * c2 * c3 - s1 * s2 * s3;
}

/** Relaxed standing posture from the A-pose: arms down at the sides, soft elbows, curled fingers. */
export const RELAXED: Record<string, Euler> = {
  clavicle_l: [0, 0, -4], clavicle_r: [0, 0, 4],
  upperarm_l: [2, -32, -40], upperarm_r: [2, 32, 40], // solved by FK: wrist beside the thigh, palm to the leg (tools/characters/scratch/palm.ts)
  lowerarm_l: [6, 50, 0], lowerarm_r: [6, -50, 0],
  hand_l: [10, 0, -10], hand_r: [10, 0, 10],
  ...handShape('l', 'relaxed'), ...handShape('r', 'relaxed'),
  spine_01: [1, 0, 0], neck_01: [-2, 0, 0],
  thigh_l: [0, 0, -1.5], thigh_r: [0, 0, 1.5],
};
function fingers(side: 'l' | 'r', curl: number): Record<string, Euler> {
  const o: Record<string, Euler> = {};
  const sgn = side === 'l' ? -1 : 1;
  for (const f of ['index', 'middle', 'ring', 'pinky']) {
    o[`${f}_01_${side}`] = [0, 0, sgn * curl * 0.8]; o[`${f}_02_${side}`] = [0, 0, sgn * curl * 1.1]; o[`${f}_03_${side}`] = [0, 0, sgn * curl * 0.7];
  }
  o[`thumb_01_${side}`] = [0, sgn * 10, 0]; o[`thumb_02_${side}`] = [0, 0, sgn * curl * 0.4];
  return o;
}
/**
 * Hand shapes. relaxed: the natural cascade (index straightest, pinky most curled, thumb resting
 * beside the index); grip: wrapped round a handle; pinch: a cigarette between index and middle.
 */
export function handShape(side: 'l' | 'r', shape: 'relaxed' | 'grip' | 'pinch'): Record<string, Euler> {
  const sgn = side === 'l' ? -1 : 1;
  const o: Record<string, Euler> = {};
  const curls: Record<string, [number, number, number]> = shape === 'grip'
    ? { index: [62, 78, 40], middle: [66, 82, 42], ring: [70, 84, 44], pinky: [74, 86, 46] }
    : shape === 'pinch'
      ? { index: [14, 12, 6], middle: [18, 14, 8], ring: [55, 70, 35], pinky: [60, 72, 38] }
      : { index: [10, 14, 6], middle: [14, 18, 8], ring: [18, 22, 10], pinky: [22, 26, 12] };
  for (const [f, c] of Object.entries(curls)) { o[`${f}_01_${side}`] = [0, 0, sgn * c[0]]; o[`${f}_02_${side}`] = [0, 0, sgn * c[1]]; o[`${f}_03_${side}`] = [0, 0, sgn * c[2]]; }
  const thumb = shape === 'grip' ? [30, 35] : [12, 10];
  o[`thumb_01_${side}`] = [0, sgn * thumb[0], 0]; o[`thumb_02_${side}`] = [0, 0, sgn * thumb[1]]; o[`thumb_03_${side}`] = [0, 0, sgn * 8];
  return o;
}
const merge = (...m: Record<string, Euler>[]) => {
  const o: Record<string, Euler> = {};
  for (const x of m) for (const [k, v] of Object.entries(x)) o[k] = o[k] ? [o[k][0] + v[0], o[k][1] + v[1], o[k][2] + v[2]] : [...v];
  return o;
};

export function buildClip(def: ClipDef, fps = 30): Clip {
  const frames = Math.max(2, Math.round(def.duration * fps) + 1);
  const rot = new Float32Array(frames * NUM_JOINTS * 4);
  const pel = new Float32Array(frames * 3);
  const keys = def.keys.slice().sort((a, b) => a.t - b.t);
  const jointsUsed = new Set<string>();
  for (const k of keys) for (const n of Object.keys(k.j)) jointsUsed.add(n);
  for (const n of Object.keys(def.base ?? {})) jointsUsed.add(n);
  const e: Euler = [0, 0, 0];
  for (let f = 0; f < frames; f++) {
    const t = Math.min(def.duration, f / fps);
    // find surrounding keys (wrapping for loops)
    let i1 = keys.findIndex((k) => k.t > t);
    let a = keys[keys.length - 1], b = keys[0], u = 0;
    if (i1 === -1) { a = keys[keys.length - 1]; b = def.loop ? keys[0] : a; const span = def.loop ? def.duration - a.t + keys[0].t : 1; u = def.loop ? (t - a.t) / Math.max(1e-4, span) : 0; }
    else if (i1 === 0) { a = def.loop ? keys[keys.length - 1] : keys[0]; b = keys[0]; const span = def.loop ? def.duration - a.t + b.t : 1; u = def.loop ? (t + def.duration - a.t) / Math.max(1e-4, span) : 1; }
    else { a = keys[i1 - 1]; b = keys[i1]; u = (t - a.t) / Math.max(1e-4, b.t - a.t); }
    const s = (b.ease ?? 'smooth') === 'linear' ? u : u * u * (3 - 2 * u);
    for (let j = 0; j < NUM_JOINTS; j++) {
      const o = (f * NUM_JOINTS + j) * 4;
      rot[o + 3] = 1;
    }
    for (const n of jointsUsed) {
      const j = JI[n]; if (j === undefined) continue;
      const va = a.j[n] ?? [0, 0, 0], vb = b.j[n] ?? [0, 0, 0], bs = def.base?.[n] ?? [0, 0, 0];
      for (let c = 0; c < 3; c++) e[c] = (bs[c] + va[c] + (vb[c] - va[c]) * s) * D;
      quatFromEuler(e[0], e[1], e[2], rot, (f * NUM_JOINTS + j) * 4);
    }
    const pa = a.pelvis ?? [0, 0, 0], pb = b.pelvis ?? [0, 0, 0];
    for (let c = 0; c < 3; c++) pel[f * 3 + c] = pa[c] + (pb[c] - pa[c]) * s;
  }
  let mask: Uint8Array | null = null;
  if (def.mask) { mask = new Uint8Array(NUM_JOINTS); for (const n of def.mask) if (JI[n] !== undefined) mask[JI[n]] = 255; }
  return {
    info: { name: def.name, duration: def.duration, frames, fps, loop: def.loop, speed: def.speed ?? 0, travel: [0, 0, 0], contacts: def.contacts ?? { l: [[0, 1]], r: [[0, 1]] }, events: def.events },
    rot, pelvis: pel, mask, pelvisRelative: true,
  };
}

/** Pelvis offsets in authored clips are relative; the runtime adds the body's pelvis height. */
const UPPER = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'jaw', 'eye_l', 'eye_r', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r',
  ...['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].flatMap((k) => [`${f}_0${k}_l`, `${f}_0${k}_r`]))];
const ARM_R = ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r', ...['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((f) => [1, 2, 3].map((k) => `${f}_0${k}_r`))];
const ARM_L = ARM_R.map((n) => n.replace(/_r$/, '_l'));
export const MASKS = { upper: UPPER, armR: ARM_R, armL: ARM_L, head: ['neck_01', 'Head', 'eye_l', 'eye_r', 'jaw'] };

// ------------------------------------------------------------------------------------------------
export function authoredClips(): ClipDef[] {
  const R = RELAXED;
  const defs: ClipDef[] = [];
  // --- idles: weight shifts, breathing, fidgets ----------------------------------------------
  defs.push({
    name: 'idle_relaxed', duration: 6, loop: true, base: R,
    keys: [
      { t: 0, j: { spine_02: [0, 0, 0], spine_03: [0.6, 0, 0], neck_01: [0, 0, 0] }, pelvis: [0, 0, 0] },
      { t: 1.5, j: { spine_02: [0.5, 1, 0.8], spine_03: [1.4, 0, 0], thigh_l: [0, 0, 1.5], calf_r: [4, 0, 0], neck_01: [0, 3, 0] }, pelvis: [0.012, -0.004, 0] },
      { t: 3.0, j: { spine_02: [0, 0, 0], spine_03: [0.6, 0, 0], neck_01: [0, -2, 0] }, pelvis: [0, 0, 0] },
      { t: 4.5, j: { spine_02: [0.5, -1, -0.8], spine_03: [1.4, 0, 0], thigh_r: [0, 0, -1.5], calf_l: [4, 0, 0], neck_01: [2, -4, 0] }, pelvis: [-0.012, -0.004, 0] },
    ],
  });
  defs.push({
    name: 'idle_pockets', duration: 5, loop: true,
    base: merge(R, { upperarm_l: [10, 12, 6], upperarm_r: [10, -12, -6], lowerarm_l: [0, -35, -10], lowerarm_r: [0, 35, 10], hand_l: [0, -30, -10], hand_r: [0, 30, 10], spine_03: [3, 0, 0], neck_01: [4, 0, 0] }),
    keys: [{ t: 0, j: {}, pelvis: [0, 0, 0] }, { t: 2.5, j: { spine_02: [0, 2, 1], neck_01: [0, 6, 0] }, pelvis: [0.01, -0.003, 0] }],
  });
  defs.push({
    name: 'idle_hands_behind', duration: 5, loop: true,
    base: merge(R, { upperarm_l: [-18, 10, 10], upperarm_r: [-18, -10, -10], lowerarm_l: [0, -40, 30], lowerarm_r: [0, 40, -30], spine_03: [-2, 0, 0] }),
    keys: [{ t: 0, j: {} }, { t: 2.5, j: { neck_01: [3, -8, 0], spine_02: [0, -3, 0] } }],
  });
  defs.push({
    name: 'idle_heat', duration: 5, loop: true, // heat-slumped: shoulders down, head forward, weight on one hip
    base: merge(R, { spine_01: [4, 0, 2], spine_02: [4, 0, 0], spine_03: [5, 0, 0], neck_01: [8, 0, 0], clavicle_l: [3, 0, -6], clavicle_r: [3, 0, 6], thigh_l: [0, 0, 3], calf_r: [8, 0, 0] }),
    keys: [{ t: 0, j: {}, pelvis: [0.015, -0.01, 0] }, { t: 2.5, j: { neck_01: [2, 6, 0], spine_03: [1, 0, 0] }, pelvis: [0.018, -0.012, 0] }],
  });
  // --- ambient actions (loiter spots) ----------------------------------------------------------
  defs.push({
    name: 'smoke', duration: 7, loop: true, mask: MASKS.upper, base: R,
    events: [{ t: 1.7, type: 'contact', data: { hand: 'r', what: 'mouth' } }],
    keys: [
      { t: 0, j: { upperarm_r: [-8, 0, 30], lowerarm_r: [0, 70, 0], hand_r: [0, 0, 20] } },
      { t: 1.2, j: { upperarm_r: [-40, -10, 10], lowerarm_r: [0, 125, 0], hand_r: [10, 0, 30], neck_01: [-3, 0, 0] } },
      { t: 2.6, j: { upperarm_r: [-40, -10, 10], lowerarm_r: [0, 125, 0], hand_r: [10, 0, 30], neck_01: [-6, 0, 0], spine_03: [-1, 0, 0] } },
      { t: 3.6, j: { upperarm_r: [-8, 0, 30], lowerarm_r: [0, 70, 0], hand_r: [0, 0, 20], neck_01: [-8, 10, 0] } },
      { t: 6, j: { upperarm_r: [-5, 0, 32], lowerarm_r: [0, 65, 0], hand_r: [0, 0, 18], neck_01: [0, 4, 0] } },
    ],
  });
  defs.push({
    name: 'light_up', duration: 3.2, loop: false, mask: MASKS.upper, base: R,
    events: [{ t: 1.4, type: 'contact', data: { hand: 'both', what: 'lighter' } }],
    keys: [
      { t: 0, j: {} },
      { t: 0.8, j: { upperarm_r: [-45, -15, 10], lowerarm_r: [0, 120, 0], upperarm_l: [-45, 15, -10], lowerarm_l: [0, -120, 0], neck_01: [12, 0, 0], spine_03: [4, 0, 0] } },
      { t: 2.2, j: { upperarm_r: [-45, -15, 10], lowerarm_r: [0, 122, 0], upperarm_l: [-42, 15, -10], lowerarm_l: [0, -118, 0], neck_01: [10, 0, 0], spine_03: [4, 0, 0] } },
      { t: 3.2, j: { upperarm_r: [-10, 0, 28], lowerarm_r: [0, 70, 0] } },
    ],
  });
  defs.push({
    name: 'read_paper', duration: 6, loop: true, mask: MASKS.upper,
    base: merge(R, { upperarm_l: [-38, 25, 22], upperarm_r: [-38, -25, -22], lowerarm_l: [0, -70, 0], lowerarm_r: [0, 70, 0], hand_l: [0, 0, 20], hand_r: [0, 0, -20], spine_03: [6, 0, 0], neck_01: [20, 0, 0], ...fingers('l', 40), ...fingers('r', 40) }),
    keys: [{ t: 0, j: { Head: [0, -6, 0] } }, { t: 2.8, j: { Head: [3, 6, 0] } }, { t: 3.2, j: { Head: [0, -6, 0] } }, { t: 5.8, j: { Head: [3, 6, 0] } }],
  });
  defs.push({
    name: 'lean_wall', duration: 6, loop: true, // back against a wall: pelvis forward, shoulders back, one foot crossed
    base: merge(R, { spine_01: [-6, 0, 0], spine_02: [-4, 0, 0], thigh_r: [8, 0, -10], calf_r: [22, 0, 0], foot_r: [-10, 0, 0], neck_01: [4, 0, 0], upperarm_l: [-8, 0, 4], upperarm_r: [-8, 0, -4] }),
    keys: [{ t: 0, j: {}, pelvis: [0, -0.02, 0.06] }, { t: 3, j: { neck_01: [0, 12, 0] }, pelvis: [0, -0.022, 0.06] }],
  });
  defs.push({
    name: 'fan_heat', duration: 1.2, loop: true, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: { upperarm_r: [-50, -20, 10], lowerarm_r: [0, 110, 0], hand_r: [0, -20, 0], neck_01: [-4, 0, 0] } },
      { t: 0.3, j: { upperarm_r: [-50, -20, 10], lowerarm_r: [0, 110, 0], hand_r: [0, 25, 0], neck_01: [-4, 0, 0] } },
      { t: 0.6, j: { upperarm_r: [-50, -20, 10], lowerarm_r: [0, 110, 0], hand_r: [0, -20, 0], neck_01: [-5, 0, 0] } },
      { t: 0.9, j: { upperarm_r: [-50, -20, 10], lowerarm_r: [0, 110, 0], hand_r: [0, 25, 0], neck_01: [-4, 0, 0] } },
    ],
  });
  defs.push({
    name: 'hail_cab', duration: 2.6, loop: false, mask: MASKS.upper, base: R,
    events: [{ t: 0.6, type: 'hail' }],
    keys: [
      { t: 0, j: {} },
      { t: 0.5, j: { clavicle_r: [0, 0, 10], upperarm_r: [-30, -10, -118], lowerarm_r: [-25, 0, 0], hand_r: [0, 0, -10], ...fingers('r', -15), neck_01: [-4, -15, 0], spine_02: [0, -8, 3] } },
      { t: 0.9, j: { clavicle_r: [0, 0, 12], upperarm_r: [-30, -10, -132], lowerarm_r: [-15, 0, 0], hand_r: [0, 15, -10], ...fingers('r', -15), neck_01: [-4, -18, 0], spine_02: [0, -8, 3] } },
      { t: 1.3, j: { clavicle_r: [0, 0, 10], upperarm_r: [-30, -10, -118], lowerarm_r: [-25, 0, 0], hand_r: [0, -15, -10], ...fingers('r', -15), neck_01: [-4, -18, 0], spine_02: [0, -8, 3] } },
      { t: 1.9, j: { clavicle_r: [0, 0, 12], upperarm_r: [-30, -10, -132], lowerarm_r: [-15, 0, 0], hand_r: [0, 15, -10], ...fingers('r', -15), neck_01: [-4, -18, 0], spine_02: [0, -8, 3] } },
      { t: 2.6, j: {} },
    ],
  });
  defs.push({
    name: 'sit_stoop', duration: 6, loop: true, // sitting on a stoop step (~0.35 m): knees high, forearms on knees
    base: merge(R, { thigh_l: [-95, 0, -8], thigh_r: [-95, 0, 8], calf_l: [100, 0, 0], calf_r: [100, 0, 0], foot_l: [-5, 0, 0], foot_r: [-5, 0, 0],
      spine_01: [10, 0, 0], spine_02: [10, 0, 0], spine_03: [8, 0, 0], neck_01: [-6, 0, 0],
      upperarm_l: [-30, 20, 10], upperarm_r: [-30, -20, -10], lowerarm_l: [0, -60, 10], lowerarm_r: [0, 60, -10] }),
    keys: [{ t: 0, j: {}, pelvis: [0, -0.5, -0.08] }, { t: 3, j: { neck_01: [0, 12, 0], spine_03: [2, 0, 0] }, pelvis: [0, -0.5, -0.08] }],
    contacts: { l: [[0, 1]], r: [[0, 1]] },
  });
  defs.push({
    name: 'vendor_work', duration: 4, loop: true, mask: MASKS.upper, base: R,
    events: [{ t: 1.0, type: 'contact', data: { hand: 'both', what: 'counter' } }, { t: 3.0, type: 'contact', data: { hand: 'r', what: 'counter' } }],
    keys: [
      { t: 0, j: { spine_01: [8, 0, 0], spine_02: [10, 0, 0], upperarm_l: [-40, 10, 0], upperarm_r: [-40, -10, 0], lowerarm_l: [0, -50, 0], lowerarm_r: [0, 50, 0], neck_01: [15, 0, 0] } },
      { t: 1.0, j: { spine_01: [14, 0, 0], spine_02: [14, 0, 0], upperarm_l: [-55, 10, 0], upperarm_r: [-55, -10, 0], lowerarm_l: [0, -30, 0], lowerarm_r: [0, 30, 0], neck_01: [18, 0, 0] } },
      { t: 2.0, j: { spine_01: [6, -10, 0], spine_02: [6, -10, 0], upperarm_r: [-30, -30, 0], lowerarm_r: [0, 70, 0], neck_01: [5, -20, 0] } },
      { t: 3.0, j: { spine_01: [12, 0, 0], spine_02: [12, 0, 0], upperarm_r: [-60, -5, 0], lowerarm_r: [0, 25, 0], neck_01: [16, 0, 0] } },
    ],
  });
  // --- street vendors and their customers (sim: docs/SIM_PROGRESS.md "Street vendors") ------------
  defs.push({ // vendorServed: hand the item over, dig change out of the apron, count it into the hand
    name: 'vendor_serve', duration: 3, loop: false, mask: MASKS.upper, base: R,
    events: [{ t: 0.6, type: 'handoff', data: { hand: 'r' } }, { t: 2.4, type: 'handoff', data: { hand: 'r', what: 'change' } }],
    keys: [
      { t: 0, j: {} },
      { t: 0.6, j: { upperarm_r: [-55, -5, 8], lowerarm_r: [0, 40, 0], ...fingers('r', 35), spine_03: [6, 0, 0], neck_01: [8, 0, 0] } },
      { t: 1.2, j: { upperarm_r: [-20, 0, 15], lowerarm_r: [0, 60, 0] } },
      { t: 1.7, j: { upperarm_l: [8, 5, 2], lowerarm_l: [0, -45, 0], hand_l: [0, 0, -15], ...fingers('l', 50), neck_01: [14, 6, 0], spine_03: [4, 0, 0] } },
      { t: 2.1, j: { upperarm_l: [-30, 12, -6], lowerarm_l: [0, -75, 0], upperarm_r: [-30, -12, 6], lowerarm_r: [0, 75, 0], ...fingers('l', 45), neck_01: [16, 0, 0] } },
      { t: 2.4, j: { upperarm_r: [-50, -5, 8], lowerarm_r: [0, 45, 0], upperarm_l: [-25, 10, -4], lowerarm_l: [0, -70, 0], neck_01: [8, 0, 0], spine_03: [5, 0, 0] } },
      { t: 3, j: {} },
    ],
  });
  defs.push({ // vendorCall: hand cupped at the mouth, head up, calling the wares down the block
    name: 'vendor_call', duration: 2.4, loop: false, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: {} },
      { t: 0.4, j: { upperarm_r: [-42, -12, 10], lowerarm_r: [0, 128, 0], hand_r: [10, 0, 30], ...fingers('r', 25), neck_01: [-10, -12, 0], spine_03: [-3, 0, 0], jaw: [12, 0, 0] } },
      { t: 1.2, j: { upperarm_r: [-42, -12, 10], lowerarm_r: [0, 130, 0], hand_r: [10, 0, 30], ...fingers('r', 25), neck_01: [-12, 10, 0], spine_03: [-4, 0, 0], jaw: [6, 0, 0] } },
      { t: 1.8, j: { upperarm_r: [-42, -12, 10], lowerarm_r: [0, 128, 0], hand_r: [10, 0, 30], ...fingers('r', 25), neck_01: [-10, 0, 0], jaw: [14, 0, 0] } },
      { t: 2.4, j: {} },
    ],
  });
  defs.push({ // vendorShout: at a car that cut too close: fist up and shaking, body turned to it
    name: 'vendor_shout', duration: 2, loop: false, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: {} },
      { t: 0.3, j: { upperarm_r: [-40, -10, -95], lowerarm_r: [-30, 20, 0], ...fingers('r', 85), spine_02: [0, -12, 0], neck_01: [-6, -20, 0], jaw: [14, 0, 0] } },
      { t: 0.6, j: { upperarm_r: [-40, -10, -105], lowerarm_r: [-10, 20, 0], ...fingers('r', 85), spine_02: [0, -12, 0], neck_01: [-6, -20, 0], jaw: [8, 0, 0] } },
      { t: 0.9, j: { upperarm_r: [-40, -10, -95], lowerarm_r: [-30, 20, 0], ...fingers('r', 85), spine_02: [0, -12, 0], neck_01: [-6, -20, 0], jaw: [14, 0, 0] } },
      { t: 1.3, j: { upperarm_r: [-40, -10, -100], lowerarm_r: [-20, 20, 0], ...fingers('r', 85), spine_02: [0, -10, 0], neck_01: [-4, -18, 0], jaw: [6, 0, 0] } },
      { t: 2, j: {} },
    ],
  });
  defs.push({ // cower (vendor): crouched behind the cart, hands on its edge, peering over
    name: 'duck_cart', duration: 2, loop: true, base: R,
    keys: [
      { t: 0, j: { thigh_l: [-65, 0, -10], thigh_r: [-65, 0, 10], calf_l: [115, 0, 0], calf_r: [115, 0, 0], foot_l: [-30, 0, 0], foot_r: [-30, 0, 0], spine_01: [18, 0, 0], spine_02: [12, 0, 0], spine_03: [6, 0, 0], neck_01: [-12, 0, 0],
        upperarm_l: [-70, 15, -5], upperarm_r: [-70, -15, 5], lowerarm_l: [0, -40, 0], lowerarm_r: [0, 40, 0], ...fingers('l', 50), ...fingers('r', 50) }, pelvis: [0, -0.44, -0.08] },
      { t: 1, j: { thigh_l: [-65, 0, -10], thigh_r: [-65, 0, 10], calf_l: [115, 0, 0], calf_r: [115, 0, 0], foot_l: [-30, 0, 0], foot_r: [-30, 0, 0], spine_01: [18, 0, 0], spine_02: [12, 0, 0], spine_03: [6, 0, 0], neck_01: [-16, 10, 0],
        upperarm_l: [-70, 15, -5], upperarm_r: [-70, -15, 5], lowerarm_l: [0, -40, 0], lowerarm_r: [0, 40, 0], ...fingers('l', 50), ...fingers('r', 50) }, pelvis: [0, -0.45, -0.08] },
    ],
  });
  defs.push({ // vendorAct right_cart: squat, grip the low edge, drive up through the legs and shove it upright
    name: 'right_cart', duration: 3, loop: false, base: R,
    events: [{ t: 1.0, type: 'contact', data: { hand: 'both', what: 'cart' } }, { t: 2.2, type: 'release', data: { hand: 'both' } }],
    keys: [
      { t: 0, j: {} },
      { t: 1.0, j: { thigh_l: [-70, 0, -12], thigh_r: [-70, 0, 12], calf_l: [100, 0, 0], calf_r: [100, 0, 0], foot_l: [-20, 0, 0], foot_r: [-20, 0, 0], spine_01: [30, 0, 0], spine_02: [15, 0, 0], neck_01: [-10, 0, 0],
        upperarm_l: [-60, 10, 0], upperarm_r: [-60, -10, 0], lowerarm_l: [0, -15, 0], lowerarm_r: [0, 15, 0], ...fingers('l', 70), ...fingers('r', 70) }, pelvis: [0, -0.38, -0.12] },
      { t: 1.7, j: { thigh_l: [-30, 0, -8], thigh_r: [-30, 0, 8], calf_l: [45, 0, 0], calf_r: [45, 0, 0], foot_l: [-10, 0, 0], foot_r: [-10, 0, 0], spine_01: [20, 0, 0], spine_02: [8, 0, 0], neck_01: [-6, 0, 0],
        upperarm_l: [-85, 10, 0], upperarm_r: [-85, -10, 0], lowerarm_l: [0, -20, 0], lowerarm_r: [0, 20, 0], ...fingers('l', 70), ...fingers('r', 70) }, pelvis: [0, -0.15, -0.05] },
      { t: 2.2, j: { spine_01: [6, 0, 0], upperarm_l: [-80, 10, 0], upperarm_r: [-80, -10, 0], lowerarm_l: [0, -10, 0], lowerarm_r: [0, 10, 0], thigh_r: [-15, 0, 0], calf_r: [20, 0, 0] }, pelvis: [0, -0.03, 0.04] },
      { t: 3, j: {} },
    ],
  });
  defs.push({ // shoeshine: on a low box at the customer's foot, rag snapped side to side across the toe
    name: 'shine_shoes', duration: 1.2, loop: true,
    base: merge(R, { thigh_l: [-95, 0, -14], thigh_r: [-95, 0, 14], calf_l: [120, 0, 0], calf_r: [120, 0, 0], foot_l: [-10, 0, 0], foot_r: [-10, 0, 0], spine_01: [28, 0, 0], spine_02: [16, 0, 0], spine_03: [8, 0, 0], neck_01: [10, 0, 0],
      ...fingers('l', 60), ...fingers('r', 60) }),
    keys: [
      { t: 0, j: { upperarm_l: [-55, 30, -10], upperarm_r: [-55, -10, 18], lowerarm_l: [0, -45, 0], lowerarm_r: [0, 45, 0], spine_02: [16, 8, 0] }, pelvis: [0, -0.58, -0.1] },
      { t: 0.3, j: { upperarm_l: [-55, 10, -18], upperarm_r: [-55, -30, 10], lowerarm_l: [0, -45, 0], lowerarm_r: [0, 45, 0], spine_02: [16, -8, 0] }, pelvis: [0, -0.58, -0.1] },
      { t: 0.6, j: { upperarm_l: [-55, 30, -10], upperarm_r: [-55, -10, 18], lowerarm_l: [0, -45, 0], lowerarm_r: [0, 45, 0], spine_02: [16, 8, 0] }, pelvis: [0, -0.58, -0.1] },
      { t: 0.9, j: { upperarm_l: [-55, 10, -18], upperarm_r: [-55, -30, 10], lowerarm_l: [0, -45, 0], lowerarm_r: [0, 45, 0], spine_02: [16, -8, 0] }, pelvis: [0, -0.58, -0.1] },
    ],
    contacts: { l: [[0, 1]], r: [[0, 1]] },
  });
  defs.push({ // three-card monte: bent over the cardboard box, quick hands moving the three cards about
    name: 'deal_cards', duration: 1.6, loop: true,
    base: merge(R, { thigh_l: [-30, 0, -10], thigh_r: [-30, 0, 10], calf_l: [50, 0, 0], calf_r: [50, 0, 0], spine_01: [14, 0, 0], spine_02: [10, 0, 0], spine_03: [5, 0, 0], neck_01: [18, 0, 0],
      lowerarm_l: [0, -55, 0], lowerarm_r: [0, 55, 0], ...fingers('l', 30), ...fingers('r', 30) }),
    keys: [
      { t: 0, j: { upperarm_l: [-55, 20, -5], upperarm_r: [-50, -10, 10], hand_l: [0, 0, 10] }, pelvis: [0, -0.1, -0.04] },
      { t: 0.25, j: { upperarm_l: [-48, 8, 8], upperarm_r: [-58, -24, -6], hand_r: [0, 0, -12] }, pelvis: [0, -0.1, -0.04] },
      { t: 0.5, j: { upperarm_l: [-58, 24, -8], upperarm_r: [-48, -6, 12] }, pelvis: [0, -0.1, -0.04] },
      { t: 0.8, j: { upperarm_l: [-50, 12, 4], upperarm_r: [-55, -18, 2], neck_01: [18, 8, 0] }, pelvis: [0, -0.1, -0.04] },
      { t: 1.05, j: { upperarm_l: [-56, 22, -6], upperarm_r: [-50, -8, 10], neck_01: [14, -10, 0] }, pelvis: [0, -0.1, -0.04] },
      { t: 1.3, j: { upperarm_l: [-48, 10, 6], upperarm_r: [-58, -22, -4] }, pelvis: [0, -0.1, -0.04] },
    ],
    contacts: { l: [[0, 1]], r: [[0, 1]] },
  });
  defs.push({ // customer in a queue: weight shifts, a look past the person ahead, a glance at the watch
    name: 'queue_wait', duration: 7, loop: true, base: R,
    keys: [
      { t: 0, j: { spine_03: [0.6, 0, 0] }, pelvis: [0, 0, 0] },
      { t: 1.8, j: { spine_02: [0, 2, 2], neck_01: [-2, 12, 0], thigh_l: [0, 0, 2], calf_r: [5, 0, 0] }, pelvis: [0.014, -0.005, 0] },
      { t: 3.2, j: { spine_03: [0.6, 0, 0], neck_01: [0, 0, 0] }, pelvis: [0, 0, 0] },
      { t: 4.4, j: { upperarm_l: [-30, 20, -10], lowerarm_l: [0, -110, 20], hand_l: [0, -40, 0], neck_01: [22, 6, 0] }, pelvis: [-0.01, -0.003, 0] },
      { t: 5.4, j: { neck_01: [4, -6, 0] }, pelvis: [-0.012, -0.004, 0] },
    ],
  });
  defs.push({ // pay at the stall: reach out with the money, take the item back
    name: 'pay', duration: 2, loop: false, mask: MASKS.upper, base: R,
    events: [{ t: 0.7, type: 'handoff', data: { hand: 'r', what: 'money' } }, { t: 1.4, type: 'handoff', data: { hand: 'r', what: 'item' } }],
    keys: [
      { t: 0, j: {} },
      { t: 0.7, j: { upperarm_r: [-50, -5, 8], lowerarm_r: [0, 40, 0], ...fingers('r', 30), neck_01: [8, 0, 0], spine_03: [4, 0, 0] } },
      { t: 1.1, j: { upperarm_r: [-30, 0, 12], lowerarm_r: [0, 60, 0] } },
      { t: 1.4, j: { upperarm_r: [-48, -5, 8], lowerarm_r: [0, 45, 0], ...fingers('r', 60) } },
      { t: 2, j: { upperarm_r: [-12, 0, 25], lowerarm_r: [0, 85, 0], ...fingers('r', 60) } },
    ],
  });
  defs.push({ // monte crowd: leaning in, hands on the thighs, head following the cards
    name: 'watch_lean', duration: 4, loop: true,
    base: merge(R, { spine_01: [7, 0, 0], spine_02: [5, 0, 0], spine_03: [3, 0, 0], neck_01: [12, 0, 0], thigh_l: [-12, 0, -4], thigh_r: [-12, 0, 4], calf_l: [18, 0, 0], calf_r: [18, 0, 0],
      upperarm_l: [-22, 10, 4], upperarm_r: [-22, -10, -4], lowerarm_l: [0, -25, 0], lowerarm_r: [0, 25, 0] }),
    keys: [
      { t: 0, j: { Head: [0, -8, 0] }, pelvis: [0, -0.04, -0.04] },
      { t: 0.8, j: { Head: [2, 6, 0] }, pelvis: [0, -0.04, -0.04] },
      { t: 1.5, j: { Head: [0, -4, 0] }, pelvis: [0, -0.04, -0.04] },
      { t: 2.6, j: { Head: [3, 8, 0], neck_01: [16, 0, 0] }, pelvis: [0, -0.045, -0.05] },
      { t: 3.4, j: { Head: [0, 0, 0] }, pelvis: [0, -0.04, -0.04] },
    ],
  });
  defs.push({ // eating on the go (PedView.carry frank/pretzel): bite every few steps, layered on the walk
    name: 'eat_walk', duration: 4, loop: true, mask: MASKS.upper,
    base: merge(R, { upperarm_r: [-12, 0, 22], lowerarm_r: [0, 85, 0], hand_r: [0, 0, 15], ...fingers('r', 55) }),
    events: [{ t: 1.4, type: 'contact', data: { hand: 'r', what: 'mouth' } }],
    keys: [
      { t: 0, j: {} },
      { t: 1.0, j: { upperarm_r: [-38, -10, 12], lowerarm_r: [0, 125, 0], hand_r: [10, 0, 25], neck_01: [6, 0, 0] } },
      { t: 1.6, j: { upperarm_r: [-38, -10, 12], lowerarm_r: [0, 125, 0], hand_r: [10, 0, 25], neck_01: [8, 0, 0], jaw: [6, 0, 0] } },
      { t: 2.2, j: {} },
    ],
  });
  defs.push({ // drinking on the go (coffee): cup held up at chest height, a sip
    name: 'sip_walk', duration: 5, loop: true, mask: MASKS.upper,
    base: merge(R, { upperarm_r: [-20, 0, 18], lowerarm_r: [0, 95, 0], hand_r: [0, 0, 0], ...fingers('r', 50) }),
    keys: [
      { t: 0, j: {} },
      { t: 1.4, j: { upperarm_r: [-40, -12, 10], lowerarm_r: [0, 128, 0], hand_r: [-15, 0, 10], neck_01: [-8, 0, 0] } },
      { t: 2.2, j: { upperarm_r: [-40, -12, 10], lowerarm_r: [0, 128, 0], hand_r: [-20, 0, 10], neck_01: [-10, 0, 0] } },
      { t: 3.0, j: {} },
    ],
  });
  // --- bumps (sim MOVEMENT: stumble / down / getUp / angry, pedBumped) -----------------------------
  // lying = the whole body pitched back 90° about the pelvis (legs forward along the ground), pelvis
  // dropped to ~0.1 m; arms out to the sides, head lifted a little off the ground
  const LIE = { pelvis: [-90, 0, 0] as Euler, thigh_l: [-4, 0, -6] as Euler, thigh_r: [-4, 0, 6] as Euler, calf_l: [12, 0, 0] as Euler, calf_r: [6, 0, 0] as Euler, foot_l: [20, 0, 0] as Euler, foot_r: [20, 0, 0] as Euler,
    upperarm_l: [0, 0, 55] as Euler, upperarm_r: [0, 0, -55] as Euler, lowerarm_l: [0, -15, 0] as Euler, lowerarm_r: [0, 15, 0] as Euler, neck_01: [18, 0, 0] as Euler };
  const LIE_P: [number, number, number] = [0, -0.84, -0.05];
  defs.push({ // knocked down (pedBumped response 'fall'): a stagger back, then down on the back
    name: 'fall_down', duration: 0.9, loop: false, base: R,
    keys: [
      { t: 0, j: {} },
      { t: 0.35, j: { pelvis: [-25, 0, 0], spine_01: [10, 0, 0], spine_02: [10, 0, 0], neck_01: [20, 0, 0], upperarm_l: [-40, 20, 50], upperarm_r: [-40, -20, -50], thigh_l: [-30, 0, 0], calf_l: [40, 0, 0], calf_r: [25, 0, 0] }, pelvis: [0, -0.3, -0.12] },
      { t: 0.9, j: LIE, pelvis: LIE_P },
    ],
  });
  defs.push({ // down: lying, winded; breath and a slow head turn
    name: 'down_lie', duration: 3, loop: true, base: R,
    keys: [
      { t: 0, j: LIE, pelvis: LIE_P },
      { t: 1.5, j: { ...LIE, neck_01: [24, 12, 0], spine_02: [2, 0, 0], upperarm_r: [-20, 0, -45], lowerarm_r: [0, 40, 0] }, pelvis: LIE_P },
    ],
  });
  defs.push({ // getUp: roll up to sitting, a hand down, onto a crouch, stand (non-looping)
    name: 'get_up', duration: 2.4, loop: false, base: R,
    keys: [
      { t: 0, j: LIE, pelvis: LIE_P },
      { t: 0.7, j: { pelvis: [-15, 0, 0], spine_01: [25, 0, 0], spine_02: [15, 0, 0], neck_01: [10, 0, 0], thigh_l: [-80, 0, -8], thigh_r: [-60, 0, 8], calf_l: [110, 0, 0], calf_r: [70, 0, 0],
        upperarm_r: [20, 0, -25], lowerarm_r: [0, 10, 0], upperarm_l: [-30, 10, 20], lowerarm_l: [0, -40, 0] }, pelvis: [0, -0.78, -0.12] },
      { t: 1.5, j: { spine_01: [35, 0, 0], spine_02: [15, 0, 0], neck_01: [-5, 0, 0], thigh_l: [-70, 0, -10], thigh_r: [-75, 0, 10], calf_l: [110, 0, 0], calf_r: [115, 0, 0], foot_l: [-25, 0, 0], foot_r: [-25, 0, 0],
        upperarm_l: [-40, 10, 10], upperarm_r: [-40, -10, -10], lowerarm_l: [0, -30, 0], lowerarm_r: [0, 30, 0] }, pelvis: [0, -0.48, -0.1] },
      { t: 2.4, j: {} },
    ],
  });
  // --- cars (engine: seat callback). In place, relative to the SEATED root (setSeat): the character
  // starts/ends standing outside the driver's door, which is on its left (+x). End/start pose matches
  // the drive clip (pelvis 0.36 m below rest, 0.3 m back). ~1.2 s each.
  const SIT = { thigh_l: [-85, 0, -6] as Euler, thigh_r: [-85, 0, 6] as Euler, calf_l: [85, 0, 0] as Euler, calf_r: [85, 0, 0] as Euler, spine_01: [-4, 0, 0] as Euler, upperarm_l: [-45, 10, 10] as Euler, upperarm_r: [-45, -10, -10] as Euler, lowerarm_l: [0, -55, 0] as Euler, lowerarm_r: [0, 55, 0] as Euler };
  const SIT_P: [number, number, number] = [0, -0.36, -0.3];
  const enterKeys: Key[] = [
    { t: 0, j: {}, pelvis: [0.45, 0, 0.05] },
    { t: 0.35, j: { pelvis: [0, 70, 0], thigh_r: [-20, 0, 0], calf_r: [30, 0, 0], neck_01: [0, -20, 0] }, pelvis: [0.4, -0.04, 0] },
    { t: 0.75, j: { pelvis: [0, 70, 0], spine_01: [18, 0, 0], spine_02: [12, 0, 0], neck_01: [14, -30, 0], thigh_l: [-75, 0, -8], thigh_r: [-75, 0, 8], calf_l: [80, 0, 0], calf_r: [80, 0, 0], upperarm_l: [-20, 0, 20], lowerarm_l: [0, -30, 0] }, pelvis: [0.14, -0.33, -0.2] },
    { t: 1.2, j: SIT, pelvis: SIT_P },
  ];
  defs.push({ name: 'car_enter_l', duration: 1.2, loop: false, base: R, keys: enterKeys });
  defs.push({ name: 'car_exit_l', duration: 1.2, loop: false, base: R, keys: enterKeys.slice().reverse().map((k) => ({ ...k, t: +(1.2 - k.t).toFixed(3) })) });
  defs.push({ // carjack victim: yanked out of the driver's seat by the collar, stumbles, ends standing hunched ~1 m out
    name: 'pulled_out', duration: 1.6, loop: false, base: R,
    keys: [
      { t: 0, j: SIT, pelvis: SIT_P },
      { t: 0.25, j: { ...SIT, spine_01: [0, 0, 25], spine_02: [0, 0, 15], neck_01: [-10, 0, 10], upperarm_l: [-60, 20, 70], upperarm_r: [-80, -20, -40], lowerarm_l: [0, -30, 0], lowerarm_r: [0, 70, 0] }, pelvis: [0.25, -0.3, -0.2] },
      { t: 0.6, j: { pelvis: [0, 30, 20], spine_01: [10, 0, 20], thigh_l: [-40, 0, 0], thigh_r: [-60, 0, 0], calf_l: [50, 0, 0], calf_r: [70, 0, 0], upperarm_l: [-30, 20, 80], upperarm_r: [-70, -20, -60], neck_01: [-15, 15, 0] }, pelvis: [0.6, -0.18, -0.02] },
      { t: 1.0, j: { pelvis: [0, 40, 0], spine_01: [28, 0, 0], spine_02: [12, 0, 0], thigh_r: [-35, 0, 0], calf_r: [40, 0, 0], upperarm_l: [-40, 20, 30], upperarm_r: [-40, -20, -30], neck_01: [10, 0, 0] }, pelvis: [0.9, -0.1, 0.05] },
      { t: 1.6, j: { pelvis: [0, 60, 0], spine_01: [14, 0, 0], spine_02: [8, 0, 0], neck_01: [-4, -25, 0], upperarm_l: [-60, 25, 10], upperarm_r: [-60, -25, -10], lowerarm_l: [0, -90, 0], lowerarm_r: [0, 90, 0] }, pelvis: [1.0, -0.04, 0.05] },
    ],
  });
  // --- talking gestures by emotion (layered over idles; amplitude scales with intensity) --------
  const talk = (name: string, amp: number, dur: number, lean: number, headNod: number) => defs.push({
    name, duration: dur, loop: true, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: { upperarm_r: [-15 * amp, -5, 25], lowerarm_r: [0, 55 * amp, 0], hand_r: [0, 0, -10 * amp], spine_03: [lean, 0, 0], neck_01: [0, 0, 0] } },
      { t: dur * 0.25, j: { upperarm_r: [-30 * amp, -15, 20], lowerarm_r: [0, 80 * amp, 0], hand_r: [-15 * amp, 0, -25 * amp], upperarm_l: [-10 * amp, 5, -30], lowerarm_l: [0, -40 * amp, 0], spine_03: [lean + 2, 3, 0], neck_01: [headNod, 6, 0] } },
      { t: dur * 0.5, j: { upperarm_r: [-12 * amp, -5, 28], lowerarm_r: [0, 50 * amp, 0], upperarm_l: [-25 * amp, 15, -20], lowerarm_l: [0, -75 * amp, 0], hand_l: [15 * amp, 0, 25 * amp], spine_03: [lean, -3, 0], neck_01: [-headNod, -4, 0] } },
      { t: dur * 0.75, j: { upperarm_r: [-28 * amp, -10, 22], lowerarm_r: [0, 70 * amp, 0], hand_r: [10 * amp, 0, -20 * amp], upperarm_l: [-12 * amp, 5, -30], lowerarm_l: [0, -45 * amp, 0], spine_03: [lean + 1, 0, 0], neck_01: [headNod * 0.5, 2, 0] } },
    ],
  });
  talk('talk:neutral', 0.6, 3.2, 1, 3);
  talk('talk:wry', 0.5, 3.6, -1, 4);
  talk('talk:warm', 0.7, 3.4, 3, 4);
  talk('talk:sad', 0.35, 4.2, 6, 6);
  talk('talk:nervous', 0.8, 2.2, 3, 2);
  talk('talk:happy', 0.9, 2.6, 0, 5);
  talk('talk:angry', 1.4, 1.8, 5, 8);
  talk('talk:afraid', 0.7, 2.0, 7, 3);
  defs.push({ // arguing: big two-handed chops, leaning in
    name: 'argue', duration: 2.4, loop: true, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: { upperarm_r: [-50, -20, 10], lowerarm_r: [0, 90, 0], upperarm_l: [-30, 10, -20], lowerarm_l: [0, -60, 0], spine_02: [6, 5, 0], spine_03: [6, 0, 0], neck_01: [-6, 0, 0] } },
      { t: 0.5, j: { upperarm_r: [-25, -10, 25], lowerarm_r: [0, 60, 0], hand_r: [-25, 0, 0], upperarm_l: [-55, 20, -10], lowerarm_l: [0, -90, 0], spine_02: [8, -5, 0], spine_03: [8, 0, 0], neck_01: [6, 0, 0] } },
      { t: 1.1, j: { upperarm_r: [-65, -30, -10], lowerarm_r: [0, 40, 0], hand_r: [0, 0, -20], upperarm_l: [-60, 30, 10], lowerarm_l: [0, -40, 0], hand_l: [0, 0, 20], spine_02: [2, 0, 0], spine_03: [-4, 0, 0], neck_01: [-10, 0, 0] } },
      { t: 1.7, j: { upperarm_r: [-35, -10, 20], lowerarm_r: [0, 85, 0], hand_r: [-20, 0, 0], upperarm_l: [-20, 10, -25], lowerarm_l: [0, -55, 0], spine_02: [9, 8, 0], spine_03: [7, 0, 0], neck_01: [8, 5, 0] } },
    ],
  });
  // --- reactions ------------------------------------------------------------------------------
  defs.push({
    name: 'flinch', duration: 0.9, loop: false, base: R,
    keys: [
      { t: 0, j: {} },
      { t: 0.12, j: { spine_02: [-6, 0, 0], spine_03: [-8, 0, 0], neck_01: [-8, 0, 0], upperarm_l: [-55, 30, 0], upperarm_r: [-55, -30, 0], lowerarm_l: [0, -110, 0], lowerarm_r: [0, 110, 0], calf_l: [10, 0, 0], calf_r: [10, 0, 0] }, pelvis: [0, -0.04, -0.03] },
      { t: 0.9, j: {} },
    ],
  });
  defs.push({
    name: 'cower', duration: 2, loop: true, base: R,
    keys: [
      { t: 0, j: { thigh_l: [-60, 0, -10], thigh_r: [-60, 0, 10], calf_l: [110, 0, 0], calf_r: [110, 0, 0], foot_l: [-30, 0, 0], foot_r: [-30, 0, 0], spine_01: [25, 0, 0], spine_02: [20, 0, 0], spine_03: [15, 0, 0], neck_01: [25, 0, 0],
        upperarm_l: [-120, 30, -20], upperarm_r: [-120, -30, 20], lowerarm_l: [0, -130, 0], lowerarm_r: [0, 130, 0] }, pelvis: [0, -0.42, -0.1] },
      { t: 1, j: { thigh_l: [-60, 0, -10], thigh_r: [-60, 0, 10], calf_l: [110, 0, 0], calf_r: [110, 0, 0], foot_l: [-30, 0, 0], foot_r: [-30, 0, 0], spine_01: [26, 0, 0], spine_02: [21, 0, 0], spine_03: [16, 2, 0], neck_01: [26, 0, 0],
        upperarm_l: [-118, 30, -20], upperarm_r: [-118, -30, 20], lowerarm_l: [0, -128, 0], lowerarm_r: [0, 128, 0] }, pelvis: [0, -0.43, -0.1] },
    ],
  });
  defs.push({ // rubbernecking: idle with craned neck and a hand to the face
    name: 'rubberneck', duration: 4, loop: true, base: R,
    keys: [
      { t: 0, j: { neck_01: [-8, 0, 0], Head: [-6, 0, 0], spine_03: [-3, 0, 0], upperarm_r: [-40, -20, 10], lowerarm_r: [0, 125, 0], hand_r: [0, 0, 20] } },
      { t: 2, j: { neck_01: [-10, 6, 0], Head: [-8, 4, 0], spine_03: [-4, 3, 0], upperarm_r: [-42, -20, 10], lowerarm_r: [0, 128, 0], hand_r: [0, 0, 20] } },
    ],
  });
  defs.push({ // stumble on a hit/trip: a lurch with flailing arms (non-looping)
    name: 'stumble', duration: 1.1, loop: false, base: R,
    keys: [
      { t: 0, j: {} },
      { t: 0.2, j: { spine_01: [15, 0, 6], spine_02: [12, 0, 4], upperarm_l: [-40, 20, 50], upperarm_r: [-30, -20, -40], lowerarm_l: [0, -40, 0], lowerarm_r: [0, 40, 0], thigh_l: [-30, 0, 0], calf_l: [40, 0, 0] }, pelvis: [0, -0.06, 0.05] },
      { t: 0.6, j: { spine_01: [8, 0, -3], upperarm_l: [-20, 10, 20], upperarm_r: [-50, -20, -30], thigh_r: [-35, 0, 0], calf_r: [45, 0, 0] }, pelvis: [0, -0.04, 0.04] },
      { t: 1.1, j: {} },
    ],
  });
  // --- boundary roles: wave off / turn back (film-crew PA, utility crew, barricade cop) ----------
  defs.push({
    name: 'wave_off', duration: 2.4, loop: true, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: { upperarm_r: [-70, -30, -20], lowerarm_r: [0, 20, 0], hand_r: [0, 0, -20], ...fingers('r', -10), neck_01: [-3, -10, 0], spine_02: [0, -6, 0] } },
      { t: 0.6, j: { upperarm_r: [-60, 40, 10], lowerarm_r: [0, 30, 0], hand_r: [0, 0, -30], ...fingers('r', -10), neck_01: [-3, 8, 0], spine_02: [0, 8, 0] } },
      { t: 1.2, j: { upperarm_r: [-70, -30, -20], lowerarm_r: [0, 20, 0], hand_r: [0, 0, -20], ...fingers('r', -10), neck_01: [-3, -10, 0], spine_02: [0, -6, 0] } },
      { t: 1.8, j: { upperarm_r: [-60, 40, 10], lowerarm_r: [0, 30, 0], hand_r: [0, 0, -30], ...fingers('r', -10), neck_01: [-3, 8, 0], spine_02: [0, 8, 0] } },
    ],
  });
  defs.push({ // bullhorn: left hand holds it to the mouth, right arm sweeps
    name: 'wave_off_bullhorn', duration: 2.4, loop: true, mask: MASKS.upper, base: R,
    keys: [
      { t: 0, j: { upperarm_l: [-55, 30, 15], lowerarm_l: [0, -125, 0], hand_l: [0, 0, -15], upperarm_r: [-70, -30, -20], lowerarm_r: [0, 20, 0], neck_01: [-4, 0, 0] } },
      { t: 1.2, j: { upperarm_l: [-55, 30, 15], lowerarm_l: [0, -125, 0], hand_l: [0, 0, -15], upperarm_r: [-55, 45, 15], lowerarm_r: [0, 30, 0], neck_01: [-4, 5, 0] } },
    ],
  });
  // --- locomotion pieces ----------------------------------------------------------------------
  // turn in place: two small steps (one cycle = 90°; the controller rotates the root)
  defs.push({
    name: 'turn_step', duration: 0.9, loop: true, base: R, speed: 0,
    contacts: { l: [[0.5, 1]], r: [[0, 0.5]] },
    events: [{ t: 0.25, type: 'footstep', data: { foot: 'l' } }, { t: 0.7, type: 'footstep', data: { foot: 'r' } }],
    keys: [
      { t: 0, j: { thigh_l: [-14, 0, -4], calf_l: [26, 0, 0], foot_l: [-8, 0, 0], spine_02: [0, 4, 0] }, pelvis: [0, -0.01, 0] },
      { t: 0.3, j: { thigh_l: [0, 0, 0], calf_l: [0, 0, 0] }, pelvis: [0, 0, 0] },
      { t: 0.45, j: { thigh_r: [-14, 0, 4], calf_r: [26, 0, 0], foot_r: [-8, 0, 0], spine_02: [0, -4, 0] }, pelvis: [0, -0.01, 0] },
      { t: 0.75, j: { thigh_r: [0, 0, 0], calf_r: [0, 0, 0] }, pelvis: [0, 0, 0] },
    ],
  });
  // strafe left (sidestep cycle); the runtime mirrors it for right
  defs.push({
    name: 'strafe_l', duration: 1.0, loop: true, base: R, speed: 0.9,
    contacts: { l: [[0.5, 0.95]], r: [[0, 0.45]] },
    keys: [
      { t: 0, j: { thigh_l: [-8, 0, 18], calf_l: [16, 0, 0], foot_l: [0, 0, -14], thigh_r: [0, 0, 2], spine_02: [0, 0, -2] }, pelvis: [0.05, -0.012, 0] },
      { t: 0.25, j: { thigh_l: [0, 0, 8], thigh_r: [0, 0, 6] }, pelvis: [0.0, -0.018, 0] },
      { t: 0.5, j: { thigh_l: [0, 0, -3], thigh_r: [-8, 0, -4], calf_r: [16, 0, 0], foot_r: [0, 0, 2], spine_02: [0, 0, 2] }, pelvis: [-0.04, -0.01, 0] },
      { t: 0.75, j: { thigh_l: [0, 0, 6], thigh_r: [0, 0, 4] }, pelvis: [0.0, -0.016, 0] },
    ],
  });
  defs.push(...traversalClips(R));
  return defs;
}

/**
 * Traversal clips (docs/briefs/MOVEMENT.md), our own keys. Each is authored at a nominal 1 s
 * (ladder: one climbing cycle) and played at whatever speed fills the traversal's duration
 * (anim/Traversal.ts); the root path comes from the controller, so pelvis keys are small
 * posture offsets only. Hands are pulled onto the obstacle by hand IK during each kind's
 * contact windows, so the arm keys only need to bring them near.
 */
function traversalClips(R: Record<string, Euler>): ClipDef[] {
  const grip = { ...handShape('l', 'grip'), ...handShape('r', 'grip') };
  const crouchLand = { thigh_l: [-75, 0, -6], thigh_r: [-75, 0, 6], calf_l: [105, 0, 0], calf_r: [105, 0, 0], foot_l: [-20, 0, 0], foot_r: [-20, 0, 0], spine_01: [22, 0, 0], spine_02: [12, 0, 0], upperarm_l: [-35, -10, 25], upperarm_r: [-35, 10, -25], lowerarm_l: [0, 40, 0], lowerarm_r: [0, -40, 0] } as Record<string, Euler>;
  return [
    // speed vault over a rail or a car hood: plant both hands, tuck the knees, swing the legs
    // through to the side, land running
    { name: 'vault', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { spine_01: [10, 0, 0], thigh_l: [-25, 0, 0], calf_l: [35, 0, 0], upperarm_l: [-40, -10, 10], upperarm_r: [-30, 10, -10] } },
      { t: 0.22, j: { ...grip, spine_01: [32, 0, 0], spine_02: [14, 0, 0], neck_01: [-14, 0, 0], upperarm_l: [-78, -5, 18], upperarm_r: [-78, 5, -18], lowerarm_l: [0, 25, 0], lowerarm_r: [0, -25, 0], thigh_l: [-55, 0, 0], calf_l: [80, 0, 0], thigh_r: [-20, 0, 0], calf_r: [50, 0, 0] }, pelvis: [0, -0.04, 0] },
      { t: 0.45, j: { ...grip, spine_01: [26, 0, -10], spine_02: [10, 0, -6], upperarm_l: [-70, -5, 22], upperarm_r: [-60, 5, -10], lowerarm_l: [0, 15, 0], thigh_l: [-80, 0, 25], calf_l: [95, 0, 0], thigh_r: [-75, 0, 30], calf_r: [100, 0, 0] }, pelvis: [0.05, -0.02, 0] },
      { t: 0.7, j: { spine_01: [14, 0, -4], upperarm_l: [-30, -10, 30], upperarm_r: [-20, 10, -20], thigh_l: [-40, 0, 6], calf_l: [45, 0, 0], thigh_r: [-10, 0, 0], calf_r: [30, 0, 0] }, pelvis: [0.02, -0.03, 0] },
      { t: 1, j: {} },
    ] },
    // climb onto a 1.2-2.2 m ledge: reach, hands on top, hop, chest over, knee up, stand
    { name: 'climb', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { spine_01: [-4, 0, 0], upperarm_l: [-120, -10, 10], upperarm_r: [-120, 10, -10], lowerarm_l: [0, 20, 0], lowerarm_r: [0, -20, 0] } },
      { t: 0.18, j: { ...grip, spine_01: [4, 0, 0], neck_01: [-10, 0, 0], upperarm_l: [-160, -5, 15], upperarm_r: [-160, 5, -15], lowerarm_l: [0, 30, 0], lowerarm_r: [0, -30, 0], thigh_l: [-30, 0, 0], calf_l: [60, 0, 0], thigh_r: [-10, 0, 0], calf_r: [30, 0, 0] }, pelvis: [0, 0, -0.06] },
      { t: 0.45, j: { ...grip, spine_01: [40, 0, 0], spine_02: [20, 0, 0], neck_01: [-20, 0, 0], upperarm_l: [-40, -10, 25], upperarm_r: [-40, 10, -25], lowerarm_l: [0, 95, 0], lowerarm_r: [0, -95, 0], thigh_l: [-100, 0, -5], calf_l: [125, 0, 0], thigh_r: [-20, 0, 0], calf_r: [60, 0, 0] }, pelvis: [0, -0.05, -0.04] },
      { t: 0.7, j: { spine_01: [30, 0, 0], spine_02: [12, 0, 0], upperarm_l: [-15, -10, 25], upperarm_r: [-15, 10, -25], lowerarm_l: [0, 40, 0], lowerarm_r: [0, -40, 0], thigh_l: [-70, 0, 0], calf_l: [90, 0, 0], thigh_r: [-90, 0, 0], calf_r: [115, 0, 0] }, pelvis: [0, -0.12, 0] },
      { t: 1, j: {} },
    ] },
    // chain-link fence: jump on, two scramble cycles, leg over the top, drop, land
    { name: 'fence', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { upperarm_l: [-120, -5, 10], upperarm_r: [-100, 5, -10], thigh_l: [-40, 0, 0], calf_l: [60, 0, 0] } },
      { t: 0.12, j: { ...grip, upperarm_l: [-165, -5, 15], upperarm_r: [-130, 5, -15], lowerarm_l: [0, 30, 0], lowerarm_r: [0, -60, 0], thigh_l: [-60, 0, -10], calf_l: [90, 0, 0], thigh_r: [-30, 0, 10], calf_r: [60, 0, 0], spine_01: [8, 0, 0] } },
      { t: 0.27, j: { ...grip, upperarm_l: [-130, -5, 15], upperarm_r: [-165, 5, -15], lowerarm_l: [0, 60, 0], lowerarm_r: [0, -30, 0], thigh_l: [-30, 0, -10], calf_l: [60, 0, 0], thigh_r: [-60, 0, 10], calf_r: [90, 0, 0], spine_01: [8, 0, 0] } },
      { t: 0.42, j: { ...grip, upperarm_l: [-165, -5, 15], upperarm_r: [-130, 5, -15], lowerarm_l: [0, 30, 0], lowerarm_r: [0, -60, 0], thigh_l: [-60, 0, -10], calf_l: [90, 0, 0], thigh_r: [-30, 0, 10], calf_r: [60, 0, 0], spine_01: [8, 0, 0] } },
      { t: 0.58, j: { ...grip, upperarm_l: [-80, -5, 20], upperarm_r: [-80, 5, -20], lowerarm_l: [0, 40, 0], lowerarm_r: [0, -40, 0], thigh_l: [-90, 0, 45], calf_l: [100, 0, 0], thigh_r: [-20, 0, 5], calf_r: [50, 0, 0], spine_01: [25, 0, 10] }, pelvis: [0.06, 0, 0] },
      { t: 0.72, j: { upperarm_l: [-110, -5, 30], upperarm_r: [-110, 5, -30], thigh_l: [-30, 0, 0], calf_l: [40, 0, 0], thigh_r: [-30, 0, 0], calf_r: [40, 0, 0], spine_01: [5, 0, 0] } },
      { t: 0.86, j: crouchLand, pelvis: [0, -0.18, 0] },
      { t: 1, j: {} },
    ] },
    // ladder: one climbing cycle (opposite hand and foot), looped by rung
    { name: 'ladder', duration: 1, loop: true, base: R, speed: 0, keys: [
      { t: 0, j: { ...grip, spine_01: [6, 0, 0], neck_01: [-12, 0, 0], upperarm_l: [-165, -5, 12], upperarm_r: [-120, 5, -12], lowerarm_l: [0, 20, 0], lowerarm_r: [0, -70, 0], thigh_l: [-25, 0, -4], calf_l: [40, 0, 0], thigh_r: [-70, 0, 4], calf_r: [95, 0, 0] } },
      { t: 0.5, j: { ...grip, spine_01: [6, 0, 0], neck_01: [-12, 0, 0], upperarm_l: [-120, -5, 12], upperarm_r: [-165, 5, -12], lowerarm_l: [0, 70, 0], lowerarm_r: [0, -20, 0], thigh_l: [-70, 0, -4], calf_l: [95, 0, 0], thigh_r: [-25, 0, 4], calf_r: [40, 0, 0] } },
      { t: 1, j: { ...grip, spine_01: [6, 0, 0], neck_01: [-12, 0, 0], upperarm_l: [-165, -5, 12], upperarm_r: [-120, 5, -12], lowerarm_l: [0, 20, 0], lowerarm_r: [0, -70, 0], thigh_l: [-25, 0, -4], calf_l: [40, 0, 0], thigh_r: [-70, 0, 4], calf_r: [95, 0, 0] } },
    ] },
    // fire-escape drop ladder: jump, catch the bottom rung with both hands, pull it down
    { name: 'ladder_pull', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { thigh_l: [-40, 0, 0], calf_l: [70, 0, 0], thigh_r: [-40, 0, 0], calf_r: [70, 0, 0], upperarm_l: [-60, -5, 10], upperarm_r: [-60, 5, -10] }, pelvis: [0, -0.12, 0] },
      { t: 0.3, j: { ...grip, upperarm_l: [-175, -5, 8], upperarm_r: [-175, 5, -8], lowerarm_l: [0, 10, 0], lowerarm_r: [0, -10, 0], thigh_l: [-10, 0, 0], calf_l: [30, 0, 0], thigh_r: [-10, 0, 0], calf_r: [30, 0, 0] } },
      { t: 0.65, j: { ...grip, upperarm_l: [-120, -5, 10], upperarm_r: [-120, 5, -10], lowerarm_l: [0, 70, 0], lowerarm_r: [0, -70, 0], spine_01: [12, 0, 0], thigh_l: [-30, 0, 0], calf_l: [50, 0, 0], thigh_r: [-30, 0, 0], calf_r: [50, 0, 0] }, pelvis: [0, -0.08, 0] },
      { t: 1, j: { ...grip, upperarm_l: [-160, -5, 12], upperarm_r: [-130, 5, -12], lowerarm_l: [0, 20, 0], lowerarm_r: [0, -60, 0] } },
    ] },
    // hang from a ledge before letting go (hang-drop)
    { name: 'hang', duration: 1, loop: true, base: R, speed: 0, keys: [
      { t: 0, j: { ...grip, upperarm_l: [-172, -5, 6], upperarm_r: [-172, 5, -6], lowerarm_l: [0, 8, 0], lowerarm_r: [0, -8, 0], neck_01: [-15, 0, 0], thigh_l: [-8, 0, 0], thigh_r: [-4, 0, 0], calf_l: [12, 0, 0], calf_r: [8, 0, 0] } },
      { t: 1, j: { ...grip, upperarm_l: [-172, -5, 6], upperarm_r: [-172, 5, -6], lowerarm_l: [0, 8, 0], lowerarm_r: [0, -8, 0], neck_01: [-15, 0, 0], thigh_l: [-4, 0, 0], thigh_r: [-8, 0, 0], calf_l: [8, 0, 0], calf_r: [12, 0, 0] } },
    ] },
    // drop and land: arms up for balance in the air, absorb, stand
    { name: 'drop_land', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { upperarm_l: [-60, -10, 40], upperarm_r: [-60, 10, -40], thigh_l: [-25, 0, 0], calf_l: [35, 0, 0], thigh_r: [-15, 0, 0], calf_r: [25, 0, 0] } },
      { t: 0.55, j: { upperarm_l: [-70, -10, 45], upperarm_r: [-70, 10, -45], thigh_l: [-30, 0, 0], calf_l: [40, 0, 0], thigh_r: [-30, 0, 0], calf_r: [40, 0, 0] } },
      { t: 0.7, j: crouchLand, pelvis: [0, -0.22, 0] },
      { t: 1, j: {} },
    ] },
    // running jump across a roof gap: take-off, knees up in flight, legs reach for the landing
    { name: 'roof_jump', duration: 1, loop: false, base: R, keys: [
      { t: 0, j: { thigh_l: [-70, 0, 0], calf_l: [40, 0, 0], thigh_r: [25, 0, 0], calf_r: [70, 0, 0], upperarm_l: [40, -10, 10], upperarm_r: [-90, 10, -10], spine_01: [12, 0, 0] } },
      { t: 0.35, j: { thigh_l: [-65, 0, 0], calf_l: [85, 0, 0], thigh_r: [-55, 0, 0], calf_r: [95, 0, 0], upperarm_l: [-100, -10, 25], upperarm_r: [-100, 10, -25], spine_01: [18, 0, 0] } },
      { t: 0.8, j: { thigh_l: [-55, 0, 0], calf_l: [35, 0, 0], thigh_r: [-45, 0, 0], calf_r: [30, 0, 0], upperarm_l: [-70, -10, 30], upperarm_r: [-70, 10, -30], spine_01: [10, 0, 0] } },
      { t: 0.9, j: crouchLand, pelvis: [0, -0.15, 0] },
      { t: 1, j: {} },
    ] },
  ];
}

/** Adds every authored clip to the library. */
export function registerAuthored(lib: AnimLibrary) {
  for (const d of authoredClips()) lib.add(buildClip(d));
}
