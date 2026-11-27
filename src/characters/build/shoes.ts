/**
 * Shoes: a per-type generator. Each shoe is lofted around the wearer's own (measured) foot:
 *   upper   — superellipse cross-sections along the foot from heel cup to toe; the collar
 *             (top line) and throat are cut per style, with a rolled inner lip;
 *   sole    — insole, welt and sole edge following the plan outline, a shank under the arch,
 *             and the forefoot sole (toe spring);
 *   heel    — a separate tapered block (stacked men's heel, women's block/kitten heel) or a
 *             wedge (clogs);
 *   details — toe caps, wingtip brogue lines, lace facings and laces with a bow, loafer apron
 *             seam and saddle strap, sneaker overlays and toe bumper, sandal and platform straps.
 * Heeled shoes pitch the foot in the bind pose (plantar-flexed about the ankle, toes kept flat),
 * so the body stands on the heel; the whole figure is lifted onto the soles afterwards.
 * Generic period styles only; no brands, logos or trade dress.
 */
import type { BodyModel, BodyShape } from '../body/BodyModel';
import type { Outfit, ShoesDesc } from '../wardrobe/outfit';
import { JOINT_INDEX as JI } from '../rig';
import { PART, type Fields } from './fields';
import { fabricMat, type PieceSpec } from './garments';
import { KIND, MeshBuilder, type MatData } from './MeshBuilder';

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
type V3 = [number, number, number];

interface Style {
  /** Toe extension beyond the foot (m), plan toe shape and toe-box height above the insole (m). */
  toeExt: number; toe: 'round' | 'almond' | 'square' | 'blunt'; toeBox: number;
  /** Collar heights above the insole (m): back of the heel cup and the low point at the side. */
  back: number; side: number;
  /** Throat: fraction of the shoe length where the opening closes over the vamp. */
  throat: number;
  /** Lace facings (fractions of length) or null. */
  laces: [number, number] | null;
  /** Upper material kind; sole kind and how the heel is made. */
  upperKind: number; soleKind: number; heelTaper: number; wedge: boolean;
  welt: number; shank: number;
  /** Superellipse exponent of the cross-section (higher = boxier). */
  n: number;
  /** Which lengthwise ranges of the upper exist (sandals and mules); null = all. */
  bands: [number, number][] | null;
  /** Ankle strap (sandals, strap platforms). */
  ankleStrap: boolean;
  /** Boot shaft top on the leg chain (legS), or 0. */
  shaft: number;
}

function styleOf(s: ShoesDesc): Style {
  const base: Style = { toeExt: 0.014, toe: 'round', toeBox: 0.034, back: 0.06, side: 0.044, throat: 0.42, laces: null, upperKind: KIND.leather, soleKind: KIND.leather, heelTaper: 0.96, wedge: false, welt: 0.004, shank: 0.007, n: 2.6, bands: null, ankleStrap: false, shaft: 0 };
  switch (s.kind) {
    case 'oxford': return { ...base, laces: [0.42, 0.62], toe: 'round', n: 2.8 };
    case 'wingtip': return { ...base, laces: [0.42, 0.62], toe: 'round', welt: 0.005, n: 2.8 };
    case 'loafer': return { ...base, throat: 0.5, back: 0.052, side: 0.04, toe: 'blunt', toeBox: 0.032 };
    case 'sneaker': return { ...base, laces: [0.38, 0.66], toeExt: 0.01, toeBox: 0.04, upperKind: KIND.cloth, soleKind: KIND.rubber, welt: 0.003, shank: 0.016, back: 0.062, side: 0.05, n: 2.3, heelTaper: 1 };
    case 'workBoot': return { ...base, throat: 0.3, laces: [0.42, 0.62], toeExt: 0.016, toeBox: 0.046, soleKind: KIND.rubber, welt: 0.006, shank: 0.012, back: 0.1, side: 0.1, n: 2.3, shaft: s.shaft ?? 1.72 };
    case 'boot': return { ...base, toe: s.heel > 0.04 ? 'almond' : 'round', toeExt: 0.016, back: 0.1, side: 0.1, throat: 0.3, shaft: s.shaft ?? 1.75, heelTaper: s.heel > 0.04 ? 0.7 : 0.95 };
    case 'platform': return { ...base, throat: 0.56, back: 0.055, side: 0.036, toe: 'round', toeBox: 0.038, toeExt: 0.012, welt: 0.003, heelTaper: 0.85, ankleStrap: !!s.strap };
    case 'pump': return { ...base, throat: 0.66, back: 0.05, side: 0.022, toe: 'almond', toeExt: 0.022, toeBox: 0.026, welt: 0.0015, shank: 0.005, heelTaper: 0.5, n: 2.4 };
    case 'slipOn': return { ...base, throat: 0.58, back: 0.045, side: 0.032, toe: 'round', toeBox: 0.03, toeExt: 0.01, welt: 0.002, n: 2.4 };
    case 'sandal': return { ...base, throat: 1, back: 0.03, side: 0.02, toeExt: 0.006, toeBox: 0.02, welt: 0.002, bands: [[0, 0.2], [0.62, 0.7]], ankleStrap: true };
    case 'clog': return { ...base, throat: 0.45, back: 0, side: 0, toeBox: 0.04, toe: 'round', wedge: true, welt: 0.004, bands: [[0.45, 1]], n: 2.3 };
  }
}

/** Heel rise of the insole above the forefoot insole (m). */
export function heelRise(s: ShoesDesc) { return Math.max(0, s.heel - s.sole); }

/**
 * Plantar-flex both feet about the ankle so the heel sits `rise` above the ball (linear-blend
 * skinned with the body's own weights: foot rotates, the toes stay flat), returning a new shape.
 */
export function pitchFeet(model: BodyModel, shape: BodyShape, rise: number): BodyShape {
  if (rise < 0.003) return shape;
  const pos = Float32Array.from(shape.pos), joints = Float32Array.from(shape.joints);
  const landmarks = { ...shape.landmarks };
  for (const s of ['l', 'r'] as const) {
    const jf = JI[`foot_${s}`], jb = JI[`ball_${s}`];
    const A: V3 = [joints[jf * 3], joints[jf * 3 + 1], joints[jf * 3 + 2]];
    const B: V3 = [joints[jb * 3], joints[jb * 3 + 1], joints[jb * 3 + 2]];
    const H = shape.landmarks[`heel_${s}`], T = shape.landmarks[`toe_tip_${s}`];
    let ax = [T[0] - H[0], T[2] - H[2]]; const al = Math.hypot(ax[0], ax[1]) || 1; ax = [ax[0] / al, ax[1] / al];
    const rot = (p: ArrayLike<number>, th: number): V3 => {
      const d = [p[0] - A[0], p[1] - A[1], p[2] - A[2]];
      const dt = d[0] * ax[0] + d[2] * ax[1], dl = d[0] * ax[1] - d[2] * ax[0];
      const c = Math.cos(th), sn = Math.sin(th);
      const t2 = dt * c + d[1] * sn, y2 = -dt * sn + d[1] * c;
      return [A[0] + ax[0] * t2 + ax[1] * dl, A[1] + y2, A[2] + ax[1] * t2 - ax[0] * dl];
    };
    // real contact points: lowest heel vertex behind the ankle, lowest forefoot vertex under the ball
    const tOf = (k: number) => (shape.pos[k * 3] - A[0]) * ax[0] + (shape.pos[k * 3 + 2] - A[2]) * ax[1];
    const tB = (B[0] - A[0]) * ax[0] + (B[2] - A[2]) * ax[1];
    let hk = -1, bk = -1;
    for (let k = 0; k < model.numSrc; k++) {
      let wf = 0, wb = 0;
      for (let c = 0; c < 4; c++) { const j = model.skinJ[k * 4 + c], w = model.skinW[k * 4 + c] / 255; if (j === jf) wf += w; else if (j === jb) wb += w; }
      if (wf + wb < 0.5) continue;
      const t = tOf(k), y = shape.pos[k * 3 + 1];
      if (t < -0.02 && wf > 0.5 && (hk < 0 || y < shape.pos[hk * 3 + 1])) hk = k;
      if (Math.abs(t - tB) < 0.015 && (bk < 0 || y < shape.pos[bk * 3 + 1])) bk = k;
    }
    const Hc: V3 = hk >= 0 ? [shape.pos[hk * 3], shape.pos[hk * 3 + 1], shape.pos[hk * 3 + 2]] : [H[0], 0, H[2]];
    const Bc: V3 = bk >= 0 ? [shape.pos[bk * 3], shape.pos[bk * 3 + 1], shape.pos[bk * 3 + 2]] : [B[0], 0, B[2]];
    const riseAt = (th: number) => { const h = rot(Hc, th); const b = rot(B, th); return h[1] - (Bc[1] + b[1] - B[1]); };
    let lo = 0, hi = 0.9;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (riseAt(m) < rise) lo = m; else hi = m; }
    const th = (lo + hi) / 2;
    const Bn = rot(B, th), dB = [Bn[0] - B[0], Bn[1] - B[1], Bn[2] - B[2]];
    for (let k = 0; k < model.numSrc; k++) {
      let wf = 0, wb = 0;
      for (let c = 0; c < 4; c++) { const j = model.skinJ[k * 4 + c], w = model.skinW[k * 4 + c] / 255; if (j === jf) wf += w; else if (j === jb) wb += w; }
      if (wf + wb === 0) continue;
      const p = [shape.pos[k * 3], shape.pos[k * 3 + 1], shape.pos[k * 3 + 2]];
      const r = rot(p, th);
      for (let c = 0; c < 3; c++) pos[k * 3 + c] = p[c] + wf * (r[c] - p[c]) + wb * dB[c];
    }
    joints[jb * 3] = Bn[0]; joints[jb * 3 + 1] = Bn[1]; joints[jb * 3 + 2] = Bn[2];
    landmarks[`heel_${s}`] = rot(H, th);
    landmarks[`toe_tip_${s}`] = [T[0] + dB[0], T[1] + dB[1], T[2] + dB[2]];
  }
  return { ...shape, pos, joints, landmarks };
}

/** Small local mesh with per-part outward hints (fixes winding, computes normals), emitted skinned. */
class Sub {
  p: number[] = []; h: number[] = []; m: MatData[] = []; uv: number[] = []; t: number[] = []; n: number[] | null = null; an: (V3 | null)[] = [];
  add(p: ArrayLike<number>, hint: ArrayLike<number>, m: MatData, uv: [number, number] = [0, 0], analytic: V3 | null = null) { this.an.push(analytic); this.p.push(p[0], p[1], p[2]); this.h.push(hint[0], hint[1], hint[2]); this.m.push(m); this.uv.push(uv[0], uv[1]); return this.p.length / 3 - 1; }
  quad(a: number, b: number, c: number, d: number) { this.t.push(a, b, c, a, c, d); }
  tri(a: number, b: number, c: number) { this.t.push(a, b, c); }
  /** Orient triangles to the hints, compute smooth normals (or keep analytic ones). */
  finish() {
    const P = this.p, H = this.h, T = this.t;
    const N = new Float64Array(P.length);
    for (let i = 0; i < T.length; i += 3) {
      const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const hx = H[a] + H[b] + H[c], hy = H[a + 1] + H[b + 1] + H[c + 1], hz = H[a + 2] + H[b + 2] + H[c + 2];
      if (nx * hx + ny * hy + nz * hz < 0) { const s = T[i + 1]; T[i + 1] = T[i + 2]; T[i + 2] = s; nx = -nx; ny = -ny; nz = -nz; }
      for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; }
    }
    const out: number[] = [];
    for (let v = 0; v < P.length; v += 3) {
      let x = N[v], y = N[v + 1], z = N[v + 2];
      const a = this.an[v / 3]; if (a) { x = a[0]; y = a[1]; z = a[2]; }
      const l = Math.hypot(x, y, z);
      if (l < 1e-12) { x = H[v]; y = H[v + 1]; z = H[v + 2]; }
      const l2 = Math.hypot(x, y, z) || 1;
      out.push(x / l2, y / l2, z / l2);
    }
    this.n = out;
  }
  emit(mb: MeshBuilder, skin: (p: ArrayLike<number>, j: number[], w: number[]) => void) {
    if (!this.n) this.finish();
    const base = mb.count, j = [0, 0, 0, 0], w = [0, 0, 0, 0];
    for (let v = 0; v < this.p.length / 3; v++) {
      const p = [this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]];
      skin(p, j, w);
      mb.vertex(p, [this.n![v * 3], this.n![v * 3 + 1], this.n![v * 3 + 2]], j, w, this.m[v], [this.uv[v * 2], this.uv[v * 2 + 1]]);
    }
    for (let i = 0; i < this.t.length; i += 3) mb.tri(base + this.t[i], base + this.t[i + 1], base + this.t[i + 2]);
  }
}

export interface ShoePlan {
  /** Body vertex hidden inside a shoe (compact vertex index). */
  covers: (k: number) => boolean;
  /** Lift applied to the whole figure so the soles rest on y = 0. */
  lift: number;
  /** Boot shaft cut from the body surface (boots only). */
  shaft: PieceSpec | null;
  emit: (mb: MeshBuilder) => void;
  /** Legs above this chain coordinate show socks (when worn). */
  sockFrom: number;
}

interface Foot {
  side: 'l' | 'r'; med: number;
  H: V3; ax: [number, number];
  t0: number; tTip: number; len: number; tBall: number; tFoot: number;
  C: (t: number) => number; W: (t: number) => number; yb: (t: number) => number; h: (t: number) => number; hc: (t: number) => number; tThroat: number;
  ids: number[];
  /** Ankle strap ring (world points) or null. */
  ring: V3[] | null;
}

/** Plan both shoes for a (pitched) body. */
export function planShoes(model: BodyModel, shape: BodyShape, F: Fields, outfit: Outfit, lod: number): ShoePlan {
  const s = outfit.shoes, st = styleOf(s), P = shape.pos;
  const feet: Foot[] = [];
  let forefoot = 0;
  for (const side of ['l', 'r'] as const) {
    const part = side === 'l' ? PART.legL : PART.legR;
    const H = shape.landmarks[`heel_${side}`], T = shape.landmarks[`toe_tip_${side}`];
    const ax: [number, number] = [T[0] - H[0], T[2] - H[2]]; const al = Math.hypot(ax[0], ax[1]) || 1; ax[0] /= al; ax[1] /= al;
    const loc = (k: number) => { const dx = P[k * 3] - H[0], dz = P[k * 3 + 2] - H[2]; return [dx * ax[0] + dz * ax[1], dx * ax[1] - dz * ax[0], P[k * 3 + 1]]; };
    // + local l is the character's left (+X when facing +Z); the medial side is toward the midline
    const med = side === 'l' ? -1 : 1;
    const jf = JI[`foot_${side}`], jb = JI[`ball_${side}`];
    const footW = (k: number) => { let w = 0; for (let c = 0; c < 4; c++) { const j = model.skinJ[k * 4 + c]; if (j === jf || j === jb) w += model.skinW[k * 4 + c] / 255; } return w; };
    const ids: number[] = [];
    // (a few vertices between the feet carry the other leg's label: keep only those near this foot's axis)
    for (let k = 0; k < F.n; k++) if (F.part[k] === part && F.legS[k] >= 1.85 && Math.abs(loc(k)[1]) < 0.075) ids.push(k);
    const NB = 44, bt0 = -0.1, bt1 = 0.34, bw = (bt1 - bt0) / NB;
    const lo = new Float64Array(NB).fill(1e9), hi = new Float64Array(NB).fill(-1e9), bot = new Float64Array(NB).fill(1e9), top = new Float64Array(NB).fill(-1e9);
    let tmin = 1e9, tmax = -1e9;
    for (const k of ids) {
      const [t, l, y] = loc(k);
      const b = clamp(Math.floor((t - bt0) / bw), 0, NB - 1);
      if (F.legS[k] >= 1.97) { lo[b] = Math.min(lo[b], l); hi[b] = Math.max(hi[b], l); bot[b] = Math.min(bot[b], y); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
      if (footW(k) >= 0.6) top[b] = Math.max(top[b], y);
    }
    // fill empty bins from neighbours, then smooth
    const fill = (a: Float64Array, empty: (v: number) => boolean) => {
      for (let b = 0; b < NB; b++) if (empty(a[b])) { let d = 1; while (d < NB) { if (b - d >= 0 && !empty(a[b - d])) { a[b] = a[b - d]; break; } if (b + d < NB && !empty(a[b + d])) { a[b] = a[b + d]; break; } d++; } }
      return a.map((v, i) => (a[Math.max(0, i - 1)] + 2 * v + a[Math.min(NB - 1, i + 1)]) / 4);
    };
    const LO = fill(lo, (v) => v > 1e8), HI = fill(hi, (v) => v < -1e8), BOT = fill(bot, (v) => v > 1e8), TOP = fill(top, (v) => v < -1e8);
    const at = (a: Float64Array, t: number) => { const f = clamp((t - bt0) / bw - 0.5, 0, NB - 1.0001); const i = Math.floor(f), u = f - i; return a[i] + (a[i + 1] - a[i]) * u; };
    const Bj = shape.joints.slice(JI[`ball_${side}`] * 3, JI[`ball_${side}`] * 3 + 3);
    const tBall = (Bj[0] - H[0]) * ax[0] + (Bj[2] - H[2]) * ax[1];
    const t0 = tmin - 0.003, tTip = tmax + st.toeExt, len = tTip - t0;
    // insole line: heel seat → shank → ball → toe spring
    let ySeat = 1e9, yBall = 1e9;
    for (let t = tmin; t < tmin + 0.06; t += 0.005) ySeat = Math.min(ySeat, at(BOT, t));
    for (let t = tBall - 0.03; t <= tmax; t += 0.005) yBall = Math.min(yBall, at(BOT, t));
    ySeat -= 0.002; yBall -= 0.002;
    const tSeat = t0 + 0.075;
    const yb = (t: number) => t >= tBall ? yBall + 0.007 * ((t - tBall) / (tTip - tBall)) ** 2 : ySeat + (yBall - ySeat) * sm(tSeat, tBall, t);
    // plan outline
    const tTaper = Math.min(tmax - 0.035, tBall + 0.03);
    const rHeel = 0.032;
    const W0 = (t: number) => (at(HI, t) - at(LO, t)) / 2 + 0.004;
    const C0 = (t: number) => (at(HI, t) + at(LO, t)) / 2;
    const toeShape = (u: number) => {
      switch (st.toe) {
        case 'square': return Math.pow(Math.max(0, 1 - u ** 4), 0.25);
        case 'almond': return Math.pow(Math.max(0, 1 - u ** 1.6), 0.62);
        case 'blunt': return Math.pow(Math.max(0, 1 - u ** 2.6), 0.4);
        default: return Math.pow(Math.max(0, 1 - u ** 2.1), 0.5);
      }
    };
    const Wt = W0(tTaper), Ct = C0(tTaper), Wh = W0(t0 + rHeel + 0.01);
    const W = (t: number) => {
      if (t <= t0) return 0;
      if (t < t0 + rHeel) { const v = (t0 + rHeel - t) / rHeel; return Wh * Math.sqrt(Math.max(0, 1 - v * v)) * (1 - 0.06 * v); }
      if (t <= tTaper) return Math.max(W0(t), t < t0 + rHeel + 0.02 ? Wh : 0);
      const u = (t - tTaper) / (tTip - tTaper);
      const need = t < tmax ? W0(t) : 0; // never narrower than the toes
      return Math.max(Wt * toeShape(u), need * (1 - sm(0.6, 1, u)));
    };
    const C = (t: number) => {
      if (t <= tTaper) return C0(Math.max(t, t0 + rHeel + 0.01));
      const u = (t - tTaper) / (tTip - tTaper);
      return Ct + med * Wt * (st.toe === 'almond' ? 0.3 : 0.18) * sm(0, 1, u);
    };
    // dome height above the insole
    // measured instep: monotone (never rising) from the instep peak to the toe, then smoothed
    const NS = 64, hs = new Float64Array(NS + 1);
    for (let i = 0; i <= NS; i++) { const t = t0 + (len * i) / NS; hs[i] = at(TOP, clamp(t, tmin, tmax)) - yb(t) + 0.005; }
    let pk = Math.round(NS * 0.3); for (let i = Math.round(NS * 0.3); i <= Math.round(NS * 0.7); i++) if (hs[i] > hs[pk]) pk = i;
    for (let i = NS - 1; i > pk; i--) hs[i] = Math.max(hs[i], hs[i + 1]);
    // never rising toward the toe, and never dropping steeper than a real instep (~25°)
    for (let i = pk + 1; i <= NS; i++) hs[i] = Math.max(Math.min(hs[i], hs[i - 1]), hs[i - 1] - 0.47 * (len / NS));
    for (let pass = 0; pass < 3; pass++) { const c = Float64Array.from(hs); for (let i = 1; i < NS; i++) hs[i] = (c[i - 1] + 2 * c[i] + c[i + 1]) / 4; }
    const hMeas = (t: number) => { const f2 = clamp(((t - t0) / len) * NS, 0, NS - 1e-6), i = Math.floor(f2), u = f2 - i; return hs[i] + (hs[i + 1] - hs[i]) * u; };
    const hT = Math.max(st.toeBox, hMeas(tTaper) - 0.001);
    const h = (t: number) => {
      const meas = hMeas(t);
      if (t <= tTaper) return Math.max(0.02, meas);
      const u = (t - tTaper) / (tTip - tTaper);
      const toeMeas = t < tmax ? meas * (1 - sm(0.5, 1, u)) : 0;
      return Math.max(hT * Math.pow(Math.max(0, 1 - u ** 2.4), 0.45), toeMeas, 0.004);
    };
    // collar height above the insole: back → low side → up to the throat
    const tThroat = t0 + st.throat * len, tSide = t0 + 0.32 * (tThroat - t0) + 0.02, n = st.n;
    const ankleY = shape.joints[JI[`foot_${side}`] * 3 + 1];
    const hc = (t: number) => {
      if (st.shaft) return Math.min(h(t), t < tThroat ? ankleY + 0.05 - yb(t) : h(t));
      if (st.bands && t >= t0 + 0.5 * len) return h(t); // sandal vamp strap / clog vamp: closed over the top
      if (t >= tThroat) return h(t);
      if (t < tSide) return st.back + (st.side - st.back) * sm(t0, tSide, t);
      // throat: a U-shaped vamp line (plan offset ∝ √(distance to the throat point))
      const tU = Math.max(tSide, tThroat - 0.04);
      if (t < tU) return Math.min(h(t), st.side);
      const hS = h(tU), phS = Math.asin(Math.pow(clamp(st.side / hS, 0, 1), n / 2));
      const v = clamp((t - tU) / (tThroat - tU), 0, 1);
      const phA = Math.acos(Math.cos(phS) * Math.pow(1 - v, n / 4));
      return h(t) * Math.pow(Math.sin(phA), 2 / n);
    };
    // ankle strap: the leg's cross-section just above the ankle joint, inflated a little
    let ring: V3[] | null = null;
    if (st.ankleStrap) {
      const yS = ankleY + 0.004, NA = 28;
      let cx = 0, cz = 0, cn = 0;
      const sel = ids.filter((k) => Math.abs(P[k * 3 + 1] - yS) < 0.007 && F.legS[k] < 2.3);
      for (const k of sel) { cx += P[k * 3]; cz += P[k * 3 + 2]; cn++; }
      if (cn > 8) {
        cx /= cn; cz /= cn;
        const rad = new Float64Array(NA).fill(-1);
        for (const k of sel) { const a = Math.atan2(P[k * 3 + 2] - cz, P[k * 3] - cx), b = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NA) % NA; rad[b] = Math.max(rad[b], Math.hypot(P[k * 3] - cx, P[k * 3 + 2] - cz)); }
        for (let b = 0; b < NA; b++) if (rad[b] < 0) { let d = 1; while (rad[(b + d) % NA] < 0 && d < NA) d++; rad[b] = rad[(b + d) % NA]; }
        const r2 = rad.map((v, i) => (rad[(i + NA - 1) % NA] + 2 * v + rad[(i + 1) % NA]) / 4 + 0.006);
        ring = Array.from({ length: NA }, (_, i) => { const a = -Math.PI + ((i + 0.5) / NA) * 2 * Math.PI; return [cx + Math.cos(a) * r2[i], yS, cz + Math.sin(a) * r2[i]] as V3; });
      }
    }
    forefoot = Math.min(forefoot, yBall);
    feet.push({ side, med, H: [H[0], H[1], H[2]], ax, t0, tTip, len, tBall, tFoot: tmax, C, W, yb, h, hc, ids, ring, tThroat });
  }
  const ground = forefoot - s.sole; // sole bottom under the ball (pre-lift)
  const lift = -ground;

  // which body vertices are inside a shoe
  const covered = new Uint8Array(F.n);
  for (const f of feet) {
    for (const k of f.ids) {
      const dx = P[k * 3] - f.H[0], dz = P[k * 3 + 2] - f.H[2];
      const t = dx * f.ax[0] + dz * f.ax[1], y = P[k * 3 + 1];
      if (t < f.t0 - 0.01 || t > f.tTip) continue;
      const tt = clamp(t, f.t0 + 0.002, f.tTip);
      const inBand = !st.bands || st.bands.some(([a, b]) => tt >= f.t0 + a * f.len && tt <= f.t0 + b * f.len);
      if (s.kind === 'sandal') continue;
      if (inBand && y < f.yb(tt) + Math.min(f.hc(tt), f.h(tt)) - 0.006) covered[k] = 1;
    }
  }

  const shaft: PieceSpec | null = st.shaft ? {
    surface: 'body', fabric: { color: s.color, color2: s.color2, pattern: 'solid', scale: 0.02, rough: 0.45, sheen: 0, fade: s.wear * 0.4, dirt: s.wear * 0.6 } as any,
    kind: KIND.leather, hem: 0.004, hides: true, hideMargin: 0.004, slot: 4,
    fields: [(k) => (F.part[k] === PART.legL || F.part[k] === PART.legR ? (F.legS[k] - st.shaft) * 0.45 : -1), (k) => (2.12 - F.legS[k]) * 0.45],
    // stiff leather: stands off the leg, a little wider toward the top
    offset: (k) => 0.01 + 0.006 * sm(st.shaft + 0.25, st.shaft, F.legS[k]),
    dust: (k) => sm(st.shaft + 0.1, 2.05, F.legS[k]) * 0.6,
  } : null;

  // nearest body vertex (decimated foot) → skin weights for shoe vertices
  const cand = new Map<string, number[]>();
  {
    const tri = F.tris('body', 2), seen = new Set<number>();
    for (const k of tri) seen.add(k);
    for (const f of feet) cand.set(f.side, f.ids.filter((k) => seen.has(k) && F.legS[k] >= 1.9));
  }
  const skinFor = (side: string) => (p: ArrayLike<number>, j: number[], w: number[]) => {
    let best = 1e9, bk = 0;
    for (const k of cand.get(side)!) { const d = (P[k * 3] - p[0]) ** 2 + (P[k * 3 + 1] - p[1]) ** 2 + (P[k * 3 + 2] - p[2]) ** 2; if (d < best) { best = d; bk = k; } }
    for (let c = 0; c < 4; c++) { j[c] = model.skinJ[bk * 4 + c]; w[c] = model.skinW[bk * 4 + c] / 255; }
  };

  const emit = (mb: MeshBuilder) => {
    mb.slot = 4;
    for (const f of feet) buildShoe(f, s, st, lod, ground).emit(mb, skinFor(f.side));
  };
  return { covers: (k) => covered[k] === 1, lift, shaft, emit, sockFrom: 1.5 };
}

/** Build one shoe (all parts) as one Sub mesh. */
function buildShoe(f: Foot, s: ShoesDesc, st: Style, lod: number, ground: number): Sub {
  const L = Math.min(3, lod), NU = [24, 12, 7, 4][L], NH = [7, 4, 3, 2][L];
  const detail = lod <= 1;
  const upperFab = { color: s.color, color2: s.color2, pattern: 'solid' as const, scale: 0.02, rough: st.upperKind === KIND.cloth ? 0.85 : s.kind === 'pump' && s.color === '#151314' ? 0.2 : 0.4, sheen: st.upperKind === KIND.cloth ? 0.15 : 0, fade: s.wear * 0.4, dirt: s.wear * 0.7 };
  const mUpper = fabricMat(upperFab, st.upperKind);
  const soleCol = st.soleKind === KIND.rubber ? s.color2 : s.kind === 'clog' ? '#8a6440' : s.kind === 'platform' ? s.color2 : '#2a2018';
  const mSole = fabricMat({ color: soleCol, color2: soleCol, pattern: 'solid', scale: 0.02, rough: st.soleKind === KIND.rubber ? 0.8 : 0.55, sheen: 0, fade: 0, dirt: Math.min(1, s.wear + 0.3) }, st.soleKind === KIND.rubber ? KIND.rubber : KIND.leather);
  const mInsole = fabricMat({ color: s.kind === 'clog' ? '#9a7450' : '#8a6a4a', color2: '#6a5038', pattern: 'solid', scale: 0.02, rough: 0.8, sheen: 0, fade: 0, dirt: s.wear * 0.8 }, KIND.leather);
  const dark = (m: MatData, k: number): MatData => ({ ...m, cA: m.cA.map((c) => c * k) as V3, cB: m.cB.map((c) => c * k) as V3 });
  const mSeam = dark(mUpper, 0.55);
  const mInside = fabricMat({ ...upperFab, color: st.upperKind === KIND.cloth ? s.color : '#6a5440', color2: '#4a3a2a', rough: 0.7 }, KIND.leather);
  const laceCol = s.kind === 'sneaker' ? '#e8e2d4' : s.kind === 'workBoot' ? '#6a4a2a' : '#1a1614';
  const mLace = fabricMat({ color: laceCol, color2: laceCol, pattern: 'solid', scale: 0.02, rough: 0.8, sheen: 0.1, fade: 0, dirt: s.wear * 0.5 }, KIND.cloth);

  const { H, ax } = f;
  const world = (t: number, l: number, y: number): V3 => [H[0] + ax[0] * t + ax[1] * l, y, H[2] + ax[1] * t - ax[0] * l];
  const n = st.n;
  const spow = (x: number, e: number) => Math.sign(x) * Math.pow(Math.abs(x), e);
  // upper surface point at (t, phi): phi 0 = local +l side at the insole, π/2 top, π = −l side
  const S = (t: number, phi: number, inset = 0): V3 => {
    const W = Math.max(0, f.W(t) - inset), hh = Math.max(0, f.h(t) - inset);
    const l = f.C(t) + W * spow(Math.cos(phi), 2 / n), y = f.yb(t) + hh * Math.pow(Math.max(0, Math.sin(phi)), 2 / n);
    return world(t, l, y);
  };
  const SN = (t: number, phi: number): V3 => {
    const e = 1e-4, a = S(t + e, phi), b = S(t - e, phi), c = S(t, phi + e), d = S(t, phi - e);
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let N: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const p = S(t, phi), ctr = world(t, f.C(t), f.yb(t) + f.h(t) * 0.3);
    const o = [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]];
    if (N[0] * o[0] + N[1] * o[1] + N[2] * o[2] < 0) N = [-N[0], -N[1], -N[2]];
    const l = Math.hypot(...N);
    if (l < 1e-12) return t > (f.t0 + f.tTip) / 2 ? (t > f.tTip - 1e-4 ? SN(f.tTip - 0.002, phi) : SN(t - 0.001, phi)) : SN(t + 0.001, phi);
    return [N[0] / l, N[1] / l, N[2] / l];
  };
  const tOf = (u: number) => f.t0 + (f.tTip - f.t0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  const inBand = (t: number) => !st.bands || st.bands.some(([a, b]) => t >= f.t0 + a * f.len - 1e-6 && t <= f.t0 + b * f.len + 1e-6);
  // rows: nonuniform u, plus exact band edges
  const ts: number[] = [];
  for (let i = 0; i <= NU; i++) ts.push(tOf(i / NU));
  if (st.bands) for (const [a, b] of st.bands) ts.push(f.t0 + a * f.len, f.t0 + b * f.len);
  if (s.kind === 'sneaker' && L <= 1) for (const fr of [0.15, 0.8]) ts.push(f.t0 + fr * f.len - 0.0006, f.t0 + fr * f.len + 0.0006);
  if (f.tThroat < f.tTip && L <= 1) { const nt = L === 0 ? 5 : 2; for (let i = 1; i <= nt; i++) ts.push(f.tThroat - 0.028 * (1 - i / nt) ** 2); }
  const tsU = [...new Set(ts.map((t) => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b);

  const sub = new Sub();
  const addA = (p: V3, nn: V3, m: MatData, uv: [number, number] = [0, 0]) => sub.add(p, nn, m, uv, nn);

  // two-tone zones painted per vertex (sneakers: suede toe cap and heel overlay, rubber toe bumper)
  const mOver = fabricMat({ ...upperFab, color: s.color2 === '#d8d2c4' ? '#c0b8a8' : s.color2, color2: s.color2, rough: 0.9 }, KIND.cloth);
  const zoneMat = (t: number, ph: number): MatData => {
    if (s.kind !== 'sneaker') return mUpper;
    void ph;
    if (t > f.t0 + 0.8 * f.len || t < f.t0 + 0.15 * f.len) return mOver;
    return mUpper;
  };
  // ---- upper: two halves (lateral 0..φa, medial π−φa..π) per row ----
  const half = NH;
  const rows: { L: number[]; R: number[]; t: number; open: boolean; band: boolean }[] = [];
  for (const t of tsU) {
    const hh = f.h(t), hc = Math.min(f.hc(t), hh);
    const frac = hh > 1e-4 ? clamp(hc / hh, 0, 1) : 1;
    const phA = Math.asin(Math.pow(frac, n / 2));
    const open = phA < Math.PI / 2 - 1e-3;
    const L: number[] = [], R: number[] = [];
    for (let i = 0; i <= half; i++) {
      const a = (i / half) * phA, b = Math.PI - (i / half) * phA;
      L.push(addA(S(t, a), SN(t, a), zoneMat(t, a), [t, a])); R.push(addA(S(t, b), SN(t, b), zoneMat(t, b), [t, b]));
    }
    rows.push({ L, R, t, open, band: inBand(t) });
  }
  for (let r = 0; r + 1 < rows.length; r++) {
    const A = rows[r], B = rows[r + 1];
    if (!(A.band && B.band && inBand((A.t + B.t) / 2))) continue;
    for (let i = 0; i < half; i++) { sub.quad(A.L[i], B.L[i], B.L[i + 1], A.L[i + 1]); sub.quad(A.R[i], B.R[i], B.R[i + 1], A.R[i + 1]); }
    // close over the top where neither row is open (the two halves meet at π/2)
    if (!A.open && !B.open) sub.quad(A.L[half], B.L[half], B.R[half], A.R[half]);
  }
  // rolled inner lip along open collar edges (and band edges)
  if (L <= 1) {
    for (const side of ['L', 'R'] as const) {
      let prev: number[] | null = null;
      for (const r of rows) {
        if (!(r.band && r.open)) { prev = null; continue; }
        const e = r[side][half];
        const p = sub.p.slice(e * 3, e * 3 + 3) as V3, nn = sub.an[e]!;
        const q: V3 = [p[0] - nn[0] * 0.0035, p[1] + 0.001, p[2] - nn[2] * 0.0035];
        const q2: V3 = [q[0], q[1] - 0.012, q[2]];
        const inward: V3 = [-nn[0], 0.3, -nn[2]];
        const i1 = sub.add(q, inward, mInside), i2 = sub.add(q2, [-nn[0], 0, -nn[2]], mInside);
        const cur = [e, i1, i2];
        if (prev) { sub.quad(prev[0], cur[0], cur[1], prev[1]); sub.quad(prev[1], cur[1], cur[2], prev[2]); }
        prev = cur;
      }
    }
  }

  // ---- sole: insole/welt top, edge, tread; shank under the arch; heel block ----
  // heel breast: the front face of the heel block (shorter seat on women's heels)
  const tBreast = f.t0 + (s.heel > 0.04 && s.kind !== 'platform' ? 0.23 : 0.27) * f.len;
  const soleBot = (t: number) => {
    if (st.wedge) return ground + 0.004 * sm(f.tBall, f.tTip, t) ** 2 * 3;
    const fore = f.yb(t) - s.sole; // follows the toe spring
    if (t >= f.tBall - 0.01) return fore;
    return Math.max(fore, f.yb(t) - st.shank - (t < tBreast ? 0 : (s.sole - st.shank) * sm(tBreast + 0.02, f.tBall - 0.01, t)));
  };
  const soleRows: { t: number; lat: number[]; medv: number[] }[] = [];
  const open = s.kind === 'sandal' || s.kind === 'clog' || s.kind === 'pump' || s.kind === 'slipOn' || s.kind === 'platform';
  const welt = st.welt;
  const sideHint = (t: number, sgn: number): V3 => { const d = world(t, sgn, 0); const o = world(t, 0, 0); return [d[0] - o[0], -0.2, d[2] - o[2]]; };
  for (const t of tsU) {
    const W = f.W(t), Cc = f.C(t), y0 = f.yb(t), yB = soleBot(t);
    const lat: number[] = [], medv: number[] = [];
    // the welt runs round the toe and heel too: push the outline past the upper's ends
    const te = t + welt * 1.2 * sm(f.tTip - 0.025, f.tTip, t) - welt * 0.8 * sm(f.t0 + 0.02, f.t0, t);
    for (const sgn of [1, -1]) {
      const arr = sgn === 1 ? lat : medv;
      const hint = sideHint(t, sgn);
      const Wl = W + welt;
      // profile (LOD-dependent): insole edge, welt top, welt edge, sole edge bottom, tread edge
      if (L <= 1 || open) arr.push(sub.add(world(te, Cc + sgn * Math.max(0, W - 0.002), y0 + 0.001), [0, 1, 0], mInsole));
      arr.push(sub.add(world(te, Cc + sgn * Wl, y0 + 0.001), [hint[0], 0.5, hint[2]], mSole));
      if (L === 0) arr.push(sub.add(world(te, Cc + sgn * Wl, y0 - 0.002), hint, mSole));
      if (L <= 1) arr.push(sub.add(world(te, Cc + sgn * Wl * 0.985, yB + 0.002), hint, mSole));
      arr.push(sub.add(world(te, Cc + sgn * Wl * 0.95, yB), [0, -1, 0], mSole));
    }
    soleRows.push({ t, lat, medv });
  }
  for (let r = 0; r + 1 < soleRows.length; r++) {
    const A = soleRows[r], B = soleRows[r + 1];
    const np = A.lat.length - 1;
    for (const k of ['lat', 'medv'] as const) for (let i = 0; i < np; i++) sub.quad(A[k][i], B[k][i], B[k][i + 1], A[k][i + 1]);
    // insole across (visible in open shoes/sandals) and tread across
    if (L <= 1 || open) sub.quad(A.lat[0], B.lat[0], B.medv[0], A.medv[0]);
    sub.quad(A.lat[np], B.lat[np], B.medv[np], A.medv[np]);
  }
  // close the sole edge at the toe and heel ends
  for (const R of [soleRows[0], soleRows[soleRows.length - 1]]) for (let i = 0; i < R.lat.length - 1; i++) sub.quad(R.lat[i], R.lat[i + 1], R.medv[i + 1], R.medv[i]);

  // heel block (not for wedges): top follows the outline behind the breast, tapers to the ground
  if (!st.wedge) {
    const hs = soleRows.filter((r) => r.t <= tBreast + 1e-6);
    const tb = tBreast;
    const ring: { top: V3; t: number; l: number }[] = [];
    for (const r of hs) ring.push({ t: r.t, l: f.C(r.t) + f.W(r.t) + welt * 0.6, top: [0, 0, 0] });
    ring.push({ t: tb, l: f.C(tb) + f.W(tb) + welt * 0.6, top: [0, 0, 0] });
    const back = [...hs].reverse();
    ring.push({ t: tb, l: f.C(tb) - f.W(tb) - welt * 0.6, top: [0, 0, 0] });
    for (const r of back) ring.push({ t: r.t, l: f.C(r.t) - f.W(r.t) - welt * 0.6, top: [0, 0, 0] });
    // centroid for taper
    const tc = f.t0 + (tb - f.t0) * 0.5 * (1 + (1 - st.heelTaper) * 0.5), lc = f.C(tc);
    const taper = st.heelTaper;
    const top: number[] = [], bot: number[] = [], botIn: number[] = [];
    const lift = s.kind === 'pump' || s.kind === 'boot' ? 0.008 : 0.006; // top lift (darker) at the ground
    for (const p of ring) {
      const yT = soleBot(Math.max(p.t, f.t0 + 0.001)) + 0.001;
      const tt = tc + (p.t - tc) * taper, ll = lc + (p.l - lc) * taper;
      const hint: V3 = (() => { const a = world(p.t, p.l, 0), o = world(tc, lc, 0); return [a[0] - o[0], 0, a[2] - o[2]]; })();
      top.push(sub.add(world(p.t, p.l, yT), hint, mSole));
      bot.push(sub.add(world(tt, ll, L <= 1 ? ground + lift : ground), hint, dark(mSole, 0.8)));
      if (L <= 1) botIn.push(sub.add(world(tt, ll, ground), hint, dark(mSole, 0.4)));
    }
    const m = ring.length;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      sub.quad(top[i], top[j], bot[j], bot[i]); if (L <= 1) sub.quad(bot[i], bot[j], botIn[j], botIn[i]);
    }
    const rb = L <= 1 ? botIn : bot;
    if (L <= 2) {
      const cB = sub.add(world(tc, lc, ground), [0, -1, 0], dark(mSole, 0.4));
      for (let i = 0; i < m; i++) { const j = (i + 1) % m; const a = sub.add(sub.p.slice(rb[i] * 3, rb[i] * 3 + 3), [0, -1, 0], dark(mSole, 0.4)), b = sub.add(sub.p.slice(rb[j] * 3, rb[j] * 3 + 3), [0, -1, 0], dark(mSole, 0.4)); sub.tri(cB, a, b); }
    }
  }

  // ---- details on the upper (ribbons following the surface) ----
  // details only where the upper exists and is closed over the top (or, for side work, below the collar)
  const onUpper = (t: number, ph: number) => {
    if (!inBand(t) || t <= f.t0 || t > f.tTip + 1e-6) return false;
    const hh = f.h(t), frac = hh > 1e-4 ? clamp(Math.min(f.hc(t), hh) / hh, 0, 1) : 1;
    if (frac >= 0.999) return true;
    const phA = Math.asin(Math.pow(frac, n / 2)) - 0.04;
    return ph <= phA || ph >= Math.PI - phA;
  };
  const ribbon = (ptsIn: [number, number][], width: number, off: number, m: MatData, closed = false) => {
    // resample so chords follow the surface (≤ 3 mm steps in t, ≤ 0.08 rad in φ)
    const pts0: [number, number][] = [];
    for (let i = 0; i < ptsIn.length; i++) {
      if (i === 0) { pts0.push(ptsIn[0]); continue; }
      const [ta, pa] = ptsIn[i - 1], [tb, pb] = ptsIn[i];
      const k = Math.max(1, Math.ceil(Math.max(Math.abs(tb - ta) / 0.003, Math.abs(pb - pa) / 0.08)));
      for (let j = 1; j <= k; j++) pts0.push([ta + (tb - ta) * (j / k), pa + (pb - pa) * (j / k)]);
    }
    // split into runs on the upper
    const runs: [number, number][][] = [[]];
    for (const p of pts0) { if (onUpper(p[0], p[1])) runs[runs.length - 1].push(p); else if (runs[runs.length - 1].length) runs.push([]); }
    if (runs.length > 1 || runs[0].length !== pts0.length) { for (const r of runs) if (r.length >= 2) ribbon(r, width, off, m); return; }
    const pts = pts0;
    if (pts.length < 2) return;
    const P = pts.map(([t, ph]) => { const p = S(t, ph), nn = SN(t, ph); return { p: [p[0] + nn[0] * off, p[1] + nn[1] * off, p[2] + nn[2] * off] as V3, n: nn }; });
    let prev: [number, number] | null = null, first: [number, number] | null = null;
    for (let i = 0; i < P.length; i++) {
      const a = P[Math.max(0, i - 1)].p, b = P[Math.min(P.length - 1, i + 1)].p;
      const tg = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], nn = P[i].n;
      let bx = nn[1] * tg[2] - nn[2] * tg[1], by = nn[2] * tg[0] - nn[0] * tg[2], bz = nn[0] * tg[1] - nn[1] * tg[0];
      const bl = Math.hypot(bx, by, bz) || 1; bx /= bl; by /= bl; bz /= bl;
      const p = P[i].p, w = width / 2;
      const i1 = addA([p[0] + bx * w, p[1] + by * w, p[2] + bz * w], nn, m), i2 = addA([p[0] - bx * w, p[1] - by * w, p[2] - bz * w], nn, m);
      if (prev) sub.quad(prev[0], i1, i2, prev[1]);
      else first = [i1, i2];
      prev = [i1, i2];
    }
    if (closed && prev && first) sub.quad(prev[0], first[0], first[1], prev[1]);
  };
  const T = (fr: number) => f.t0 + fr * f.len;
  const line = (t0: number, t1: number, ph0: number, ph1: number, nseg = 10): [number, number][] => Array.from({ length: nseg + 1 }, (_, i) => [t0 + (t1 - t0) * (i / nseg), ph0 + (ph1 - ph0) * (i / nseg)]);
  const arcAcross = (t: number, ph0: number, ph1: number, nseg = 10) => line(t, t, ph0, ph1, nseg);
  const PI = Math.PI;
  if (detail) {
    if (st.laces) {
      const [a, b] = st.laces.map(T);
      const gap = s.kind === 'workBoot' ? 0.2 : 0.16;
      // facings (eyelet stays) either side of the opening, then laces across
      for (const sg of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 8; i++) { const t = a + (b - a) * (i / 8); const sp = gap * (1 - 0.35 * (i / 8)); pts.push([t, PI / 2 + sg * (sp + 0.1)]); }
        ribbon(pts, 0.012, 0.0012, s.kind === 'sneaker' ? dark(mUpper, 0.85) : mSeam);
      }
      const nl = s.kind === 'workBoot' ? 5 : 4;
      for (let i = 0; i < nl; i++) {
        const fr = (i + 0.5) / nl, t = a + (b - a) * fr, sp = gap * (1 - 0.35 * fr) + 0.1;
        ribbon(arcAcross(t, PI / 2 - sp, PI / 2 + sp, 6), 0.0035, 0.0028, mLace);
      }
      // bow at the back of the lacing
      const tb = a + (b - a) * 0.08;
      for (const sg of [-1, 1]) ribbon([[tb, PI / 2], [tb + 0.004, PI / 2 + sg * 0.3], [tb + 0.016, PI / 2 + sg * 0.34], [tb + 0.012, PI / 2 + sg * 0.08], [tb, PI / 2]], 0.004, 0.0042, mLace);
      for (const sg of [-1, 1]) ribbon([[tb, PI / 2 + sg * 0.04], [tb + 0.03, PI / 2 + sg * 0.5]], 0.0035, 0.0045, mLace);
    }
    if (s.kind === 'oxford' || s.kind === 'workBoot') ribbon(arcAcross(T(0.83), 0.12, PI - 0.12, 14), 0.002, 0.0008, mSeam);
    if (s.kind === 'wingtip') {
      // toe cap "W": from the sole edge at mid-foot, sweeping forward to a point on top
      const tip = T(0.82), back = T(0.6);
      for (const sg of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([back + (tip - back) * Math.sin(u * PI / 2) - 0.012 * Math.sin(u * PI), PI / 2 + sg * (PI / 2 - 0.3) * (1 - u) ** 1.2]); }
        ribbon(pts, 0.0022, 0.0008, mSeam);
        ribbon(pts.map(([t, ph]) => [t - 0.006, ph]), 0.0014, 0.0008, mSeam); // brogue row
      }
      ribbon(arcAcross(T(0.62), 0.25, PI - 0.25, 10), 0.0015, 0.0008, mSeam);
    }
    if (s.kind === 'loafer') {
      // moccasin apron: a U-shaped raised seam over the vamp
      const a = T(0.52), b = T(0.92);
      const pts: [number, number][] = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16, ang = -PI / 2 + u * PI; pts.push([a + (b - a) * Math.cos(ang) ** 0.8 * 1, PI / 2 + 0.5 * Math.sin(ang)]); }
      ribbon(pts, 0.0025, 0.0012, mSeam);
      ribbon(arcAcross(T(0.505), 0.35, PI - 0.35, 10), 0.012, 0.0018, dark(mUpper, 0.9));
    }
    if (s.kind === 'sneaker') {
      // overlay stitch lines at the zone edges
      ribbon(arcAcross(T(0.8), 0.05, PI - 0.05, 16), 0.0016, 0.0008, dark(mOver, 0.7));
      ribbon(arcAcross(T(0.15), 0.05, PI - 0.05, 12), 0.0016, 0.0008, dark(mOver, 0.7));
    }
    if (s.kind === 'platform') ribbon(arcAcross(T(0.66), 0.15, PI - 0.15, 10), 0.002, 0.0008, mSeam);
  }
  if (f.ring && lod <= 2) {
    const R = f.ring, cx = R.reduce((a, p) => a + p[0], 0) / R.length, cz = R.reduce((a, p) => a + p[2], 0) / R.length;
    const ids = R.map((p) => { const o: V3 = [p[0] - cx, 0, p[2] - cz]; return [sub.add([p[0], p[1] + 0.006, p[2]], o, mUpper), sub.add([p[0], p[1] - 0.006, p[2]], o, mUpper)]; });
    for (let i = 0; i < ids.length; i++) { const j = (i + 1) % ids.length; sub.quad(ids[i][0], ids[j][0], ids[j][1], ids[i][1]); }
    // quarter strap down the back of the heel to the counter
    let bi = 0; for (let i = 0; i < R.length; i++) if ((R[i][0] - H[0]) * ax[0] + (R[i][2] - H[2]) * ax[1] < (R[bi][0] - H[0]) * ax[0] + (R[bi][2] - H[2]) * ax[1]) bi = i;
    const top = R[bi], bot = S(f.t0 + 0.004, Math.PI / 2 * 0.98, 0);
    const o: V3 = [top[0] - cx, 0, top[2] - cz]; const ol = Math.hypot(o[0], o[2]) || 1;
    const side: V3 = [-o[2] / ol * 0.006, 0, o[0] / ol * 0.006];
    const q = [top, bot].map((p) => [sub.add([p[0] + side[0], p[1], p[2] + side[2]], o, mUpper), sub.add([p[0] - side[0], p[1], p[2] - side[2]], o, mUpper)]);
    sub.quad(q[0][0], q[1][0], q[1][1], q[0][1]);
  }
  sub.finish();
  return sub;
}
