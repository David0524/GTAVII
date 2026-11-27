/**
 * Face landmarks and masks, derived geometrically from the evaluated head (no UV dependence),
 * so they follow every face shape. Masks drive the skin shader (lips, brows, stubble, wrinkles)
 * and the facial hair shells.
 */
import type { BodyShape } from '../body/BodyModel';
import { JOINT_INDEX as JI } from '../rig';
import { PART, type Fields } from './fields';

export interface FaceFrame {
  eyeL: number[]; eyeR: number[]; eyeDist: number;
  noseTip: number[]; mouth: number[]; chin: number[]; headCenter: number[]; headRadius: number;
  browY: number;
}

export function faceFrame(shape: BodyShape, F: Fields): FaceFrame {
  const P = shape.pos, J = shape.joints;
  const eyeL = [J[JI.eye_l * 3], J[JI.eye_l * 3 + 1], J[JI.eye_l * 3 + 2]], eyeR = [J[JI.eye_r * 3], J[JI.eye_r * 3 + 1], J[JI.eye_r * 3 + 2]];
  const eyeDist = Math.hypot(eyeL[0] - eyeR[0], eyeL[1] - eyeR[1], eyeL[2] - eyeR[2]);
  const eyeY = (eyeL[1] + eyeR[1]) / 2;
  let nose = [0, 0, -1e9];
  let minY = 1e9, maxY = -1e9, cx = 0, cz = 0, cn = 0;
  for (let k = 0; k < F.n; k++) {
    if (F.part[k] !== PART.head) continue;
    const x = P[k * 3], yy = P[k * 3 + 1], z = P[k * 3 + 2];
    minY = Math.min(minY, yy); maxY = Math.max(maxY, yy); cx += x; cz += z; cn++;
    if (Math.abs(x) < 0.012 && yy < eyeY && yy > eyeY - eyeDist * 1.2 && z > nose[2]) nose = [x, yy, z];
  }
  // mouth: front-most point on the midline about 0.55 eye-distances below the nose tip
  const mouthY = nose[1] - eyeDist * 0.62;
  let mouth = [0, mouthY, -1e9], chin = [0, 1e9, 0];
  for (let k = 0; k < F.n; k++) {
    if (F.part[k] !== PART.head) continue;
    const x = P[k * 3], yy = P[k * 3 + 1], z = P[k * 3 + 2];
    if (Math.abs(x) < 0.006 && Math.abs(yy - mouthY) < eyeDist * 0.12 && z > mouth[2]) mouth = [0, yy, z];
    if (Math.abs(x) < 0.01 && z > nose[2] - eyeDist * 1.1 && yy < chin[1] && yy > nose[1] - eyeDist * 2.2) chin = [0, yy, z];
  }
  const headCenter = [cx / cn, (minY + maxY) / 2 + 0.02, cz / cn - 0.005];
  return { eyeL, eyeR, eyeDist, noseTip: nose, mouth, chin, headCenter, headRadius: (maxY - minY) / 2, browY: eyeY + eyeDist * 0.32 };
}

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Per-vertex face masks: [lips, brows, beard area, forehead lines, moustache, sideburn, crow's feet + nasolabial]. */
export function faceMasks(k: number, P: Float32Array, F: Fields, ff: FaceFrame, out: number[]) {
  out.fill(0);
  const part = F.part[k];
  if (part !== PART.head && part !== PART.neck) return;
  const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
  const s = ff.eyeDist / 0.064;
  const front = z - ff.headCenter[2];
  // lips: ellipse around the mouth on the front surface
  const lx = x / (0.026 * s), ly = (y - ff.mouth[1]) / (0.011 * s);
  out[0] = front > 0.04 * s ? 1 - sm(0.75, 1.1, Math.hypot(lx, ly)) : 0;
  // brows
  for (const e of [ff.eyeL, ff.eyeR]) {
    const bx = (x - e[0]) / (0.025 * s), by = (y - ff.browY + Math.abs(x - e[0]) * 0.12) / (0.0055 * s);
    if (front > 0.012 * s) out[1] = Math.max(out[1], (1 - sm(0.6, 1.1, Math.hypot(bx * (1 + 0.3 * Math.sign(x - e[0]) * Math.sign(e[0])), by))) * (1 - sm(0.8, 1.2, Math.abs(bx))));
  }
  // beard area: below the cheekbone line, above the neck crease, front and sides, minus lips
  const cheekLine = ff.noseTip[1] - 0.006 * s - Math.abs(x) * 0.25;
  const beard = sm(cheekLine + 0.004, cheekLine - 0.012 * s, y) * sm(ff.chin[1] - 0.055 * s, ff.chin[1] - 0.02 * s, y) * sm(-0.05 * s, -0.005, front + Math.abs(x) * 0.4);
  out[2] = Math.max(0, beard * (1 - out[0] * 1.5));
  // wrinkle region weights packed as one value: forehead / crow's feet / nasolabial
  const forehead = sm(ff.browY + 0.008 * s, ff.browY + 0.02 * s, y) * (1 - sm(ff.browY + 0.05 * s, ff.browY + 0.07 * s, y)) * (front > 0.045 * s ? 1 : 0);
  let crow = 0;
  for (const e of [ff.eyeL, ff.eyeR]) { const dx = Math.abs(x) - (Math.abs(e[0]) + 0.026 * s), dy = y - e[1]; crow = Math.max(crow, 1 - sm(0.004, 0.014 * s, Math.hypot(dx, dy))); }
  const nl = (() => { const t = (ff.noseTip[1] - y) / Math.max(1e-3, ff.noseTip[1] - ff.mouth[1]); if (t < 0 || t > 1.1) return 0; const lineX = (0.018 + 0.012 * t) * s; return 1 - sm(0.002, 0.007 * s, Math.abs(Math.abs(x) - lineX)); })() * (front > 0.04 * s ? 1 : 0);
  out[3] = forehead; out[6] = Math.max(crow, nl);
  // moustache: between nose base and upper lip
  const mx = x / (0.028 * s), my = (y - (ff.mouth[1] + 0.014 * s)) / (0.009 * s);
  out[4] = front > 0.035 * s ? (1 - sm(0.7, 1.1, Math.hypot(mx, my))) * (1 - out[0]) : 0;
  // sideburns: in front of the ear, from temple down to about the mouth line
  const side = Math.abs(x) - ff.headRadius * 0.62;
  out[5] = sm(-0.012, 0, side) * sm(ff.mouth[1] - 0.005, ff.mouth[1] + 0.015, y) * (1 - sm(ff.eyeL[1] + 0.01, ff.eyeL[1] + 0.03, y)) * sm(-0.03 * s, -0.005, front) * (1 - sm(0.035 * s, 0.05 * s, front));
}
