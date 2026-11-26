/**
 * Per-vertex body fields used to cut and shape garments, computed once per evaluated body.
 * Everything is in "compact vertex" space (all surfaces share it): body skin, the tights
 * helper (a body-hugging suit: shirts, trousers, jackets), the skirt helper (skirts, coat and
 * jacket tails) and the scalp cap (hair).
 */
import type { BodyModel, BodyShape } from '../body/BodyModel';
import { JOINT_INDEX as JI, JOINTS } from '../rig';

export const PART = { torso: 0, neck: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6 } as const;

export interface Fields {
  n: number;
  part: Uint8Array;
  /** Arm chain coordinate: 0 shoulder joint, 1 elbow, 2 wrist, 3 finger tips (−1 off-arm). */
  armS: Float32Array;
  /** Leg chain coordinate: 0 hip joint, 1 knee, 2 ankle, 3 toe tip (−1 off-leg). */
  legS: Float32Array;
  /** Azimuth around the body's vertical axis: 0 front, ±π back; + is the character's left. */
  az: Float32Array;
  /** Key heights (m) for this body. */
  y: { waist: number; hip: number; crotch: number; knee: number; ankle: number; neck: number; shoulder: number; chest: number; headTop: number };
  /** Compact-vertex normals per surface group (body, tights, skirt, hair). */
  normals: Map<string, Float32Array>;
  /** Compact triangle lists per surface group at a LOD. */
  tris: (group: string, lod: number) => Uint32Array;
}

export function computeFields(model: BodyModel, shape: BodyShape): Fields {
  const n = model.numSrc;
  const P = shape.pos, J = shape.joints;
  const jy = (name: string) => J[JI[name] * 3 + 1];
  const part = new Uint8Array(n), armS = new Float32Array(n).fill(-1), legS = new Float32Array(n).fill(-1), az = new Float32Array(n);
  const segName = JOINTS.map((j) => j.name);
  // spine axis x/z at a height, for azimuths
  const spine = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head'].map((s) => [J[JI[s] * 3], J[JI[s] * 3 + 1], J[JI[s] * 3 + 2]]);
  const axisAt = (y: number): [number, number] => {
    if (y <= spine[0][1]) return [spine[0][0], spine[0][2]];
    for (let i = 1; i < spine.length; i++) if (y <= spine[i][1]) { const t = (y - spine[i - 1][1]) / (spine[i][1] - spine[i - 1][1]); return [spine[i - 1][0] + (spine[i][0] - spine[i - 1][0]) * t, spine[i - 1][2] + (spine[i][2] - spine[i - 1][2]) * t]; }
    return [spine[5][0], spine[5][2]];
  };
  for (let k = 0; k < n; k++) {
    const seg = segName[model.limbSeg[k]];
    const t = (model.limbT[k] / 255) * 2 - 0.5;
    const side = seg.endsWith('_l') ? 0 : 1;
    if (/^(pelvis|spine_0\d|clavicle_)/.test(seg)) part[k] = PART.torso;
    else if (seg === 'neck_01') part[k] = PART.neck;
    else if (seg === 'Head') part[k] = PART.head;
    else if (/^(upperarm|lowerarm|hand)_/.test(seg)) {
      part[k] = side ? PART.armR : PART.armL;
      armS[k] = (seg.startsWith('upperarm') ? 0 : seg.startsWith('lowerarm') ? 1 : 2) + Math.min(1.2, Math.max(-0.2, t));
    } else if (/^(thigh|calf|foot|ball)_/.test(seg)) {
      part[k] = side ? PART.legR : PART.legL;
      legS[k] = seg.startsWith('thigh') ? Math.max(-0.2, t) : seg.startsWith('calf') ? 1 + t : seg.startsWith('foot') ? 2 + Math.min(0.7, Math.max(0, t) * 0.7) : 2.7 + Math.min(0.3, Math.max(0, t) * 0.3);
    }
    const [cx, cz] = axisAt(P[k * 3 + 1]);
    az[k] = Math.atan2(P[k * 3] - cx, P[k * 3 + 2] - cz);
  }
  const hipY = jy('thigh_l');
  const y = {
    waist: jy('spine_01') + 0.03, hip: hipY, crotch: hipY - 0.085 * (shape.height / 1.7), knee: jy('calf_l'), ankle: jy('foot_l'),
    neck: jy('neck_01'), shoulder: jy('upperarm_l'), chest: (jy('spine_03') + jy('neck_01')) / 2, headTop: shape.height,
  };
  // normals per surface (LOD0 topology; smooth)
  const normals = new Map<string, Float32Array>();
  const trisCache = new Map<string, Uint32Array>();
  const tris = (group: string, lod: number) => {
    const key = `${group}:${lod}`;
    let t = trisCache.get(key);
    if (!t) { const ix = model.indices(group, lod); t = new Uint32Array(ix.length); for (let i = 0; i < ix.length; i++) t[i] = model.splitSrc[ix[i]]; trisCache.set(key, t); }
    return t;
  };
  for (const g of ['body', 'helper-tights', 'helper-skirt', 'helper-hair']) {
    const N = new Float32Array(n * 3);
    const T = tris(g, 0);
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    for (let k = 0; k < n; k++) { const o = k * 3; const l = Math.hypot(N[o], N[o + 1], N[o + 2]); if (l > 0) { N[o] /= l; N[o + 1] /= l; N[o + 2] /= l; } }
    normals.set(g, N);
  }
  return { n, part, armS, legS, az, y, normals, tris };
}
