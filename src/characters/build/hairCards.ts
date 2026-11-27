/**
 * Strand-card hair (hero and near LODs). Cards are thin strips combed over the head along a
 * per-style 3D flow field, kept off the body by a radial "head map" (scalp, face, neck,
 * shoulders and back as seen from the head centre), and shaded with a procedural strand
 * alpha (alpha-to-coverage under MSAA; alpha-tested otherwise).
 *
 * Styles are period cuts described by flow + volume + cut line, not copies of anyone's look:
 * combed-back, side part, pompadour, comb-over, feathered, shag, ear-length, bob (ends under),
 * flip (ends out), long straight, ponytail, braid, updo (with a bun shell).
 */
import type { Appearance, HairStyle } from '../body/appearance';
import { JOINT_INDEX as JI } from '../rig';
import { PART } from './fields';
import type { FaceFrame } from './face';
import type { GarmentCtx } from './garments';
import { lin } from './garments';
import { KIND, type MeshBuilder } from './MeshBuilder';
import { Rng } from '../util/rng';

type V3 = [number, number, number];
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Styles drawn with cards (the rest stay shells: afros, curls, cornrows, buzz, bald). */
export const CARD_STYLES = new Set<HairStyle>(['short', 'sidePart', 'slick', 'combOver', 'pompadour', 'shag', 'earLength', 'feathered', 'longStraight', 'bob', 'ponytail', 'braid', 'updo', 'flip']);

export interface HeadMap {
  c: V3;
  /** Surface distance from the centre in a direction (m). */
  R: (d: V3) => number;
  /** Point at a direction with an offset above the surface. */
  at: (d: V3, off: number) => V3;
}

/** Radial map of everything hair must stay outside of (head, neck, shoulders, upper back). */
export function headMap(ctx: GarmentCtx & { face: FaceFrame }): HeadMap {
  const { model, shape, F, face: ff } = ctx;
  const P = shape.pos;
  const c: V3 = [ff.headCenter[0], ff.headCenter[1], ff.headCenter[2]];
  const NA = 96, NE = 72, e0 = -1.5, e1 = Math.PI / 2;
  const R = new Float32Array(NA * NE).fill(-1);
  const neckY = shape.joints[JI.neck_01 * 3 + 1];
  const bin = (x: number, y: number, z: number) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2], r = Math.hypot(dx, dy, dz) || 1;
    const az = Math.atan2(dx, dz), el = Math.asin(dy / r);
    const a = Math.floor(((az + Math.PI) / (2 * Math.PI)) * NA) % NA, e = clamp(Math.floor(((el - e0) / (e1 - e0)) * NE), 0, NE - 1);
    return [a * NE + e, r] as const;
  };
  const add = (k: number) => { const [b, r] = bin(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); if (r > R[b]) R[b] = r; };
  // the scalp helper (only its scalp part; below the neck it's a cape for long hair)
  const hairT = F.tris('helper-hair', 0), seen = new Set<number>();
  for (const k of hairT) if (!seen.has(k)) { seen.add(k); if (P[k * 3 + 1] > neckY + 0.02) add(k); }
  for (let k = 0; k < F.n; k++) {
    const p = F.part[k];
    if (p === PART.head || p === PART.neck || p === PART.torso || ((p === PART.armL || p === PART.armR) && F.armS[k] < 0.45)) add(k);
  }
  void model;
  // fill holes, then a gentle blur (with a margin so the blur never cuts into the body)
  for (let it = 0; it < 40; it++) {
    let missing = 0;
    for (let a = 0; a < NA; a++) for (let e = 0; e < NE; e++) {
      const b = a * NE + e; if (R[b] >= 0) continue;
      let s = 0, n = 0;
      for (const [da, de] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const aa = (a + da + NA) % NA, ee = e + de; if (ee < 0 || ee >= NE) continue; const v = R[aa * NE + ee]; if (v >= 0) { s += v; n++; } }
      if (n) R[b] = s / n; else missing++;
    }
    if (!missing) break;
  }
  for (let pass = 0; pass < 2; pass++) {
    const S = Float32Array.from(R);
    for (let a = 0; a < NA; a++) for (let e = 0; e < NE; e++) {
      let mx = 0, s = 0, n = 0;
      for (let da = -1; da <= 1; da++) for (let de = -1; de <= 1; de++) { const ee = e + de; if (ee < 0 || ee >= NE) continue; const v = S[((a + da + NA) % NA) * NE + ee]; s += v; n++; mx = Math.max(mx, v); }
      R[a * NE + e] = Math.max(s / n, mx - 0.004);
    }
  }
  const Rd = (d: V3) => {
    const az = Math.atan2(d[0], d[2]), el = Math.asin(clamp(d[1], -1, 1));
    const fa = ((az + Math.PI) / (2 * Math.PI)) * NA - 0.5, fe = clamp(((el - e0) / (e1 - e0)) * NE - 0.5, 0, NE - 1.001);
    const a0 = Math.floor(fa), ua = fa - a0, e0i = Math.floor(fe), ue = fe - e0i;
    const g = (a: number, e: number) => R[(((a % NA) + NA) % NA) * NE + e];
    return (g(a0, e0i) * (1 - ua) + g(a0 + 1, e0i) * ua) * (1 - ue) + (g(a0, e0i + 1) * (1 - ua) + g(a0 + 1, e0i + 1) * ua) * ue + 0.002;
  };
  return { c, R: Rd, at: (d, off) => { const r = Rd(d) + off; return [c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r]; } };
}

/** Height of the hairline at an azimuth (front hairline, temples, sideburns, above the ears, nape). */
export function hairlineY(ff: FaceFrame, app: Appearance, fringe: number): (az: number) => number {
  const s = ff.eyeDist / 0.064;
  const eyeY = (ff.eyeL[1] + ff.eyeR[1]) / 2;
  const rec = app.hair.recession;
  const front = ff.browY + fringe * s;
  return (az) => {
    const a = Math.abs(az);
    const temple = front + rec * 0.055 * s * sm(0.15, 0.75, a) - 0.004 * s * sm(0.3, 0.7, a);
    const sideburn = eyeY + 0.004 * s;
    const ear = eyeY + 0.022 * s;
    const nape = eyeY - 0.085 * s;
    if (a < 0.75) return temple;
    if (a < 1.15) return temple + (sideburn - temple) * sm(0.75, 1.15, a);
    if (a < 1.4) return sideburn + (ear - sideburn) * sm(1.15, 1.4, a);
    if (a < 2.05) return ear;
    return ear + (nape - ear) * sm(2.05, 2.5, a);
  };
}

interface CardStyle {
  /** World flow direction at a root/point (unit not required). p is relative to the head centre. */
  flow: (p: V3, root: V3, u: number) => V3;
  /** Card length range (m). */
  len: [number, number];
  /** Lowest point (absolute y) as a function of azimuth; cards stop there. */
  cut: (az: number) => number;
  /** Volume: max lift above the surface (m) at a root (relative position). */
  vol: (root: V3) => number;
  /** Lift profile along the card (0 root … 1 tip) → fraction of vol. */
  lift: (t: number, root: V3) => number;
  /** Fringe height above the brow (m) for the hairline. */
  fringe: number;
  width: number;
  /** Lateral wave amplitude (m) and wavelength (m) for wavy textures. */
  wave: number;
  count: number;
}

/**
 * Flow fields are blends of geodesic "attractors": at a point d on the head, the direction toward
 * a target direction t is t − (t·d)d. Targets are chosen never to be near-antipodal to the
 * points they apply to (front hair goes up over the crown, back hair goes down to the nape).
 */
type Attract = [V3, number][];
function geo(d: V3, ts: Attract): V3 {
  const o: V3 = [0, 0, 0];
  for (const [t, w] of ts) {
    if (w <= 0) continue;
    const td = t[0] * d[0] + t[1] * d[1] + t[2] * d[2];
    const g: V3 = [t[0] - td * d[0], t[1] - td * d[1], t[2] - td * d[2]];
    const l = Math.hypot(g[0], g[1], g[2]) || 1;
    o[0] += (g[0] / l) * w; o[1] += (g[1] / l) * w; o[2] += (g[2] / l) * w;
  }
  return o;
}

function styleFor(style: HairStyle, ff: FaceFrame, app: Appearance, neckY: number): CardStyle {
  const s = ff.eyeDist / 0.064;
  const eyeY = (ff.eyeL[1] + ff.eyeR[1]) / 2, chinY = ff.chin[1], mouthY = ff.mouth[1];
  const r = ff.headRadius;
  const part = app.hair.parting * 0.028 * s;
  const L = app.hair.length, V = app.hair.volume;
  const sgn = (x: number) => (x >= 0 ? 1 : -1);
  const nape = eyeY - 0.075 * s;
  const unit = (p: V3): V3 => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };
  const CROWN: V3 = [0, 0.55, -0.83], NAPE: V3 = [0, -0.92, -0.38], DOWN: V3 = [0, -1, 0];
  /** Combed back: over the crown from the front, down to the nape behind. */
  const combed = (p: V3): V3 => { const d = unit(p); const b = sm(0.3 * r, -0.3 * r, p[2]); return geo(d, [[CROWN, 1 - b], [NAPE, b]]); };
  /** Falling: down the sides and back, away from the part. */
  const falling = (p: V3, spread: number): V3 => {
    const d = unit(p), side: V3 = [sgn(p[0] - part), -0.9, -0.15];
    // in front of the ears the hair is swept off the face to the side, then falls
    const face = sm(0.2 * r, 0.7 * r, p[2]) * sm(-0.1 * r, 0.3 * r, p[1]);
    return geo(d, [[side, spread + face * 1.5], [[sgn(p[0] - part), -0.3, -0.45], face], [DOWN, (1 - spread * 0.5) * (1 - face)], [NAPE, 0.3 * sm(0, -0.6 * r, p[2])]]);
  };
  const base = { fringe: 0.05, width: 0.016, wave: 0.0015 + app.hair.texture * 0.004, count: 420 };
  const frontTop = (root: V3) => root[2] > 0.45 * r && root[1] > 0.1 * r;
  switch (style) {
    case 'slick': return { ...base, fringe: 0.06, flow: combed, len: [0.1, 0.17], cut: () => nape, vol: () => 0.004 * V, lift: (t) => Math.sin(Math.PI * Math.min(1, t * 1.4)) * 0.7 + 0.3, count: 340 };
    case 'short': return { ...base, fringe: 0.045, flow: (p) => { const d = unit(p); const c = combed(p); return [c[0] + sgn(p[0] - part) * 0.25 * Math.max(0, d[1]), c[1], c[2]]; }, len: [0.05, 0.09], cut: () => nape + 0.01, vol: () => 0.007 * V, lift: (t) => 0.5 + 0.5 * Math.sin(Math.PI * t), count: 380 };
    case 'sidePart': return {
      ...base, fringe: 0.05,
      flow: (p, root) => {
        const big = sgn(-part || 1); // hair sweeps from the part across the top to the far side
        const onBig = (root[0] - part) * big > 0 || Math.abs(root[0] - part) < 0.004;
        const d = unit(p), back = sm(0.1 * r, -0.4 * r, p[2]);
        return geo(d, [[[big * (onBig ? 1 : -1), -0.15, -0.35], 1 - back], [NAPE, back + sm(0.2 * r, -0.4 * r, p[1]) * 0.5]]);
      },
      len: [0.08, 0.15], cut: () => nape, vol: (root) => (0.008 + 0.008 * sm(0, r, root[2])) * V, lift: (t) => 0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.2)), count: 400,
    };
    case 'pompadour': return {
      ...base, fringe: 0.055, flow: combed,
      len: [0.1, 0.17], cut: () => nape, vol: (root) => (0.006 + 0.03 * sm(0.1 * r, 0.8 * r, root[2]) * sm(-0.2 * r, 0.4 * r, root[1])) * V,
      lift: (t, root) => (root[2] > 0.35 * r ? Math.sin(Math.PI * Math.min(1, t * 1.15)) : 0.4 + 0.6 * Math.sin(Math.PI * t)), count: 420,
    };
    case 'combOver': {
      // a low side part; the long side is combed flat across the thinning top
      const side = app.hair.parting >= 0 ? 1 : -1, px = side * 0.055 * s;
      return {
        ...base, fringe: 0.07, width: 0.01, wave: 0.0008, count: 200,
        flow: (p, root) => ((root[0] - px) * side < 0 && root[1] > 0.1 * r ? geo(unit(p), [[[-side, -0.1, -0.2], 1]]) : combed(p)),
        len: [0.08, 0.2], cut: () => nape, vol: () => 0.003, lift: () => 0.6,
      };
    }
    case 'feathered': return {
      ...base, fringe: 0.035,
      flow: (p, root) => {
        const d = unit(p), out = sgn(p[0] - part);
        // front: winged back and out from the face; then falling to the collar
        const fr = sm(0, 0.5 * r, root[2]);
        return geo(d, [[[out, -0.35, -0.5], fr], [CROWN, (1 - fr) * sm(0, 0.5 * r, p[1])], [DOWN, 0.6 * sm(0.1 * r, -0.5 * r, p[1])], [NAPE, (1 - fr) * 0.5]]);
      },
      len: [0.14 * L, 0.24 * L], cut: () => neckY - 0.01, vol: (root) => (0.012 + 0.012 * sm(0, r, Math.abs(root[0]))) * V, lift: (t) => 0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, t * 1.3)), count: 440,
    };
    case 'shag': return {
      ...base, fringe: 0.012,
      flow: (p, root) => (frontTop(root) ? geo(unit(p), [[[0, -0.6, 1], 1]]) : falling(p, 0.3)),
      len: [0.12 * L, 0.26 * L],
      cut: (az) => (Math.abs(az) < 0.6 ? ff.browY + 0.002 : Math.abs(az) < 1.6 ? mouthY - 0.01 : neckY - 0.03),
      vol: (root) => (0.01 + 0.01 * sm(0.2 * r, 0.9 * r, root[1])) * V, lift: (t) => 0.55 + 0.45 * Math.sin(Math.PI * t), count: 460,
    };
    case 'earLength': return {
      ...base, fringe: 0.02,
      flow: (p, root) => (frontTop(root) ? geo(unit(p), [[[sgn(-part || 1) * 0.8, -0.5, 0.5], 1]]) : falling(p, 0.2)),
      len: [0.1 * L, 0.18 * L], cut: (az) => (Math.abs(az) < 0.6 ? ff.browY + 0.01 : Math.abs(az) < 1.9 ? mouthY + 0.01 : neckY + 0.01),
      vol: () => 0.01 * V, lift: (t) => 0.5 + 0.5 * Math.sin(Math.PI * t), count: 420,
    };
    case 'bob': return {
      ...base, fringe: app.hair.parting === 0 ? 0.012 : 0.03,
      flow: (p, root) => (app.hair.parting === 0 && frontTop(root) ? geo(unit(p), [[[0, -0.6, 1], 1]]) : falling(p, 0.45)),
      len: [0.12, 0.28], cut: (az) => (app.hair.parting === 0 && Math.abs(az) < 0.55 ? ff.browY + 0.004 : chinY - 0.005),
      vol: () => 0.014 * V, lift: (t) => (t < 0.8 ? 0.6 + 0.4 * Math.sin(Math.PI * t / 0.8) : 0.6 * (1 - (t - 0.8) / 0.2) + 0.1), count: 460, wave: 0.001,
    };
    case 'flip': return {
      ...base, fringe: 0.03, flow: (p) => falling(p, 0.45),
      len: [0.16, 0.32], cut: () => neckY - 0.02, vol: () => 0.016 * V, lift: (t) => (t < 0.75 ? 0.6 + 0.3 * Math.sin(Math.PI * t / 0.75) : 0.6 + 2.4 * ((t - 0.75) / 0.25) ** 2), count: 460,
    };
    case 'longStraight': return {
      ...base, fringe: 0.05, flow: (p) => falling(p, 0.6),
      len: [0.3 * L, 0.48 * L], cut: () => neckY - 0.28 * L, vol: () => 0.01 * V, lift: (t) => 0.5 + 0.3 * Math.sin(Math.PI * t), count: 400, width: 0.02,
    };
    case 'ponytail':
    case 'braid': {
      const tie = unit([0, 0.05, -1]);
      return { ...base, fringe: 0.055, flow: (p) => geo(unit(p), [[tie, 1]]), len: [0.04, 0.2], cut: () => nape, vol: () => 0.004, lift: () => 0.6, count: 340, width: 0.014 };
    }
    case 'updo': {
      const bun = unit([0, 0.55, -0.75]);
      return { ...base, fringe: 0.05, flow: (p) => geo(unit(p), [[bun, 1]]), len: [0.04, 0.2], cut: () => nape, vol: () => 0.006 * V, lift: () => 0.6, count: 340, width: 0.014 };
    }
    default: return { ...base, flow: combed, len: [0.06, 0.1], cut: () => nape, vol: () => 0.006, lift: () => 0.6 };
  }
}

export interface CardCtx extends GarmentCtx { face: FaceFrame; app: Appearance }

/** The hairline a card style uses (shared with the scalp shell under the cards). */
export function cardHairline(ctx: CardCtx): (az: number) => number {
  const neckY = ctx.shape.joints[JI.neck_01 * 3 + 1];
  return hairlineY(ctx.face, ctx.app, styleFor(ctx.app.hair.style, ctx.face, ctx.app, neckY).fringe);
}

/** Adds hair cards (and ponytail/braid/bun pieces) to mb. Returns the hairline function used. */
export function buildCards(ctx: CardCtx, mb: MeshBuilder, map: HeadMap): void {
  const { app, face: ff, shape, lod, outfit } = ctx;
  const style = app.hair.style;
  const J = shape.joints;
  const neckY = J[JI.neck_01 * 3 + 1], headY = J[JI.Head * 3 + 1], spineY = J[JI.spine_03 * 3 + 1];
  const st = styleFor(style, ff, app, neckY);
  const hl = hairlineY(ff, app, st.fringe);
  const rng = new Rng((app.seed ^ 0x9e3779b9) >>> 0);
  const c = map.c, r = ff.headRadius;
  const hatLine = outfit.hat ? ff.browY + 0.03 * (ff.eyeDist / 0.064) : Infinity;
  const thinCrown = app.hair.thinning > 0.6 && style !== 'combOver';
  const count = Math.round(st.count * (lod === 0 ? 1 : 0.42) * (style === 'combOver' ? 1 : 1 - app.hair.thinning * 0.35));
  const width = st.width * (lod === 0 ? 1 : 1.8);
  const segLen = lod === 0 ? 0.015 : 0.026;
  const col = lin(app.hair.color);
  const tip = col.map((x) => Math.min(1, x * 1.2 + 0.015)) as V3;
  const grey = app.hair.grey;
  const skin = (y: number, j: number[], w: number[]) => {
    // above the neck: the head; below: neck → upper spine (long hair follows the back)
    const a = sm(neckY + 0.03, headY + 0.01, y), b = sm(spineY - 0.02, neckY, y);
    j[0] = JI.Head; j[1] = JI.neck_01; j[2] = JI.spine_03; j[3] = 0;
    w[0] = a; w[1] = (1 - a) * b; w[2] = (1 - a) * (1 - b); w[3] = 0;
  };
  const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // ---- roots: stratified directions over the scalp inside the hairline -----------------------
  const roots: V3[] = [];
  let tries = 0;
  while (roots.length < count && tries++ < count * 40) {
    const z = rng.range(-1, 1), ph = rng.range(-Math.PI, Math.PI), q = Math.sqrt(1 - z * z);
    const d: V3 = [q * Math.sin(ph), z, q * Math.cos(ph)];
    if (d[1] < -0.45) continue;
    const p = map.at(d, 0);
    const az = Math.atan2(d[0], d[2]);
    if (p[1] < hl(az) - 0.002) continue;
    if (p[1] > hatLine) continue;
    if (thinCrown && d[1] > 0.72 && d[2] < 0.6) continue;
    if (style === 'combOver' && Math.abs(az) < 1.2 && p[1] > c[1] + 0.3 * r && rng.chance(0.75)) continue;
    roots.push(d);
  }
  // ---- grow each card ------------------------------------------------------------------------
  for (let ci = 0; ci < roots.length; ci++) {
    const d0 = roots[ci];
    const layer = Math.pow(rng.next(), 0.7);
    const len = rng.range(st.len[0], st.len[1]) * (0.85 + 0.3 * layer);
    const rootRel: V3 = [map.at(d0, 0)[0] - c[0], map.at(d0, 0)[1] - c[1], map.at(d0, 0)[2] - c[2]];
    const vol = st.vol(rootRel);
    const az0 = Math.atan2(d0[0], d0[2]);
    const cutY = st.cut(az0) - rng.range(0, 0.012);
    const wavePh = rng.range(0, Math.PI * 2), waveL = rng.range(0.03, 0.06);
    // integrate the flow on the head-map surface
    const pts: { p: V3; n: V3; t: number }[] = [];
    let d = d0, s = 0;
    const steps = Math.max(2, Math.ceil(len / 0.006));
    const ds = len / steps;
    for (let i = 0; i <= steps; i++) {
      const t = s / len;
      const off = 0.0015 + vol * layer * st.lift(t, rootRel) + layer * 0.0015;
      const p = map.at(d, off);
      pts.push({ p, n: d, t });
      if (p[1] < cutY && i > 1) break;
      // never across the eyes or cheeks (fringes stop at the brow)
      const azp = Math.atan2(p[0] - c[0], p[2] - c[2]);
      if (i > 1 && Math.abs(azp) < 0.95 && p[1] < ff.browY - 0.004) break;
      const rel: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      let f = st.flow(rel, rootRel, t);
      // project the flow onto the tangent plane of the radial direction
      const dn = f[0] * d[0] + f[1] * d[1] + f[2] * d[2];
      const fp: V3 = [f[0] - d[0] * dn, f[1] - d[1] * dn, f[2] - d[2] * dn];
      if (Math.hypot(fp[0], fp[1], fp[2]) < 0.05) break; // reached the attractor (ponytail tie, bun)
      f = norm(fp);
      const R = Math.hypot(rel[0], rel[1], rel[2]);
      d = norm([d[0] + (f[0] * ds) / R, d[1] + (f[1] * ds) / R, d[2] + (f[2] * ds) / R]);
      s += ds;
    }
    if (pts.length < 2) continue;
    // resample to the LOD's segment length
    const total = pts.length - 1;
    const nseg = Math.max(2, Math.min(total, lod === 0 ? 9 : 4, Math.round((total * ds) / segLen)));
    const rows: number[][] = [];
    const tLen = pts[total].t || 1;
    for (let i = 0; i <= nseg; i++) {
      const f = (i / nseg) * total, i0 = Math.min(total - 1, Math.floor(f)), u = f - i0;
      const p: V3 = [0, 1, 2].map((k) => pts[i0].p[k] + (pts[i0 + 1].p[k] - pts[i0].p[k]) * u) as V3;
      const n = norm([0, 1, 2].map((k) => pts[i0].n[k] + (pts[i0 + 1].n[k] - pts[i0].n[k]) * u) as V3);
      // tangent along the card, binormal across
      const a = pts[Math.max(0, i0)].p, b = pts[Math.min(total, i0 + 1)].p;
      const tg = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
      const bn = norm(cross(n, tg));
      const tt = i / nseg;
      const w = width * (1 - 0.55 * tt) * (0.8 + 0.4 * rng.next());
      const wv = st.wave * Math.sin(wavePh + (tt * len) / waveL * Math.PI * 2) * sm(0, 0.2, tt);
      const row: number[] = [];
      for (const side of [-0.5, 0.5]) {
        const q: V3 = [p[0] + bn[0] * (w * side + wv), p[1] + bn[1] * (w * side + wv), p[2] + bn[2] * (w * side + wv)];
        skin(q[1], sj, sw);
        // shading normal: the hair volume's (radial), tilted a little along the card
        const nn = norm([n[0] * 0.85 + bn[0] * side * 0.3, n[1] * 0.85 + bn[1] * side * 0.3, n[2] * 0.85 + bn[2] * side * 0.3]);
        row.push(mb.vertex(q, nn, sj, sw, { cA: col, cB: tip, m0: [layer, 1, (tt * pts[total].t) / tLen, app.hair.texture], m1: [KIND.hair, 4, grey, 0] }, [ci + side + 0.5, tt]));
      }
      rows.push(row);
    }
    for (let i = 0; i + 1 < rows.length; i++) { mb.tri(rows[i][0], rows[i + 1][0], rows[i + 1][1]); mb.tri(rows[i][0], rows[i + 1][1], rows[i][1]); }
  }
  // ---- ponytail / braid / bun --------------------------------------------------------------
  if (style === 'ponytail' || style === 'braid') {
    const tie = map.at(norm([0, 0.05, -1]), 0.006);
    const n = lod === 0 ? 18 : 8, segs = lod === 0 ? 10 : 5;
    const length = 0.22 * app.hair.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, rr = 0.012;
      const rows: number[][] = [];
      for (let k = 0; k <= segs; k++) {
        const t = k / segs;
        const twist = style === 'braid' ? Math.sin(t * 18 + i * 2.1) * 0.006 : 0;
        const spread = rr * (style === 'braid' ? 1 - 0.3 * t : 1 + 0.8 * Math.sin(Math.PI * t * 0.8));
        // hang down the back: keep outside the head map
        const y = tie[1] - t * length;
        const dir = norm([Math.sin(a) * spread, y - c[1], -0.95 * r - 0.02 * t]);
        const base = map.at(dir, 0.004 + Math.max(0, Math.cos(a)) * 0.004);
        const p: V3 = [base[0] + Math.sin(a) * spread * 0.4 + twist, base[1], base[2] + Math.cos(a) * spread * 0.6];
        skin(p[1], sj, sw);
        const nn = norm([Math.sin(a), 0.1, -Math.abs(Math.cos(a)) - 0.4]);
        const wv = 0.006 * (1 - 0.5 * t);
        const row: number[] = [];
        for (const side of [-0.5, 0.5]) {
          const q: V3 = [p[0] + Math.cos(a) * wv * side, p[1], p[2] - Math.sin(a) * wv * side];
          row.push(mb.vertex(q, nn, sj, sw, { cA: col, cB: tip, m0: [0.8, 1, t, app.hair.texture], m1: [KIND.hair, 4, grey, 0] }, [roots.length + i + side + 0.5, t]));
        }
        rows.push(row);
      }
      for (let k = 0; k + 1 < rows.length; k++) { mb.tri(rows[k][0], rows[k + 1][0], rows[k + 1][1]); mb.tri(rows[k][0], rows[k + 1][1], rows[k][1]); }
    }
  }
  if (style === 'updo') {
    // bun: a clumped shell sphere at the back of the crown
    const dir = norm([0, 0.55, -0.75]);
    const ctr = map.at(dir, 0.02);
    const rad = 0.035 * app.hair.volume;
    const nr = lod === 0 ? 10 : 6, ns = lod === 0 ? 14 : 8;
    for (const layer of [0, 1]) {
      const base = mb.count, i0 = mb.indexCount;
      for (let i = 0; i <= nr; i++) for (let j = 0; j <= ns; j++) {
        const th = (i / nr) * Math.PI, ph = (j / ns) * Math.PI * 2;
        const n: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        const rr = rad * (0.85 + 0.15 * layer);
        const q: V3 = [ctr[0] + n[0] * rr, ctr[1] + n[1] * rr * 0.8, ctr[2] + n[2] * rr];
        skin(q[1], sj, sw);
        mb.vertex(q, n, sj, sw, { cA: col, cB: tip, m0: [layer, 1, 500, app.hair.texture], m1: [KIND.hair, 0, grey, 0] }, [ph * rad, th * rad]);
      }
      const w = ns + 1;
      for (let i = 0; i < nr; i++) for (let j = 0; j < ns; j++) { const a = base + i * w + j; mb.tri(a, a + w, a + 1); mb.tri(a + 1, a + w, a + w + 1); }
      void i0;
    }
  }
}
