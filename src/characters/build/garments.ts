/**
 * Garment geometry: turns an Outfit into cut, offset, hemmed shells on the body's helper
 * surfaces, plus procedural trims (shirt collars, lapels, ties, belts). All pieces are skinned
 * by blending the body's own weights, so they follow every morph and every pose.
 */
import type { BodyModel, BodyShape } from '../body/BodyModel';
import type { Outfit, Fabric, OuterDesc } from '../wardrobe/outfit';
import { hexToRgb, toLinear } from '../wardrobe/palette';
import { JOINT_INDEX as JI } from '../rig';
import { PART, type Fields } from './fields';
import { clipSurface, boundaryEdges, type Field } from './clip';
import { KIND, MeshBuilder, mergeSkin, type MatData } from './MeshBuilder';

export const PATTERN_ID: Record<string, number> = { solid: 0, stripeH: 1, stripeV: 2, pinstripe: 3, plaid: 4, check: 5, houndstooth: 6, paisley: 7, floral: 8, rib: 9, tweed: 10, denim: 11, geometric: 12 };
export const lin = (hex: string) => toLinear(hexToRgb(hex));

export function fabricMat(f: Fabric, kind: number = KIND.cloth, sweat = 0): MatData {
  return { cA: lin(f.color), cB: lin(f.color2), m0: [PATTERN_ID[f.pattern] ?? 0, f.scale, f.rough, f.sheen], m1: [kind, f.fade, f.dirt, sweat] };
}

export interface PieceSpec {
  surface: 'helper-tights' | 'helper-skirt' | 'body';
  fields: Field[];
  offset: (k: number) => number;
  fabric: Fabric;
  kind?: number;
  /** Hem band depth (m) on every cut edge; 0 = none. */
  hem: number;
  /** Covering opaque garment that hides the body skin underneath. */
  hides: boolean;
  /** Per-vertex extra dirt (hem dust) 0..1. */
  dust?: (k: number) => number;
  sweat?: (k: number) => number;
  /** Margin inside the cut used when hiding body skin (m). */
  hideMargin?: number;
  /** Extra displacement in rest space. */
  disp?: (k: number, out: number[]) => void;
  /** Crowd tint slot (see MeshBuilder.slot). */
  slot?: number;
  /** Replacement base positions (e.g. a smoothed shoe last) for some compact vertices. */
  basePos?: Map<number, [number, number, number]>;
}

/** Taubin λ|μ smoothing over the compact vertices of a surface region (no shrinkage). */
export function taubin(P: Float32Array, tris: Uint32Array, inRegion: (k: number) => boolean, iters: number, pin?: (k: number) => boolean): Map<number, [number, number, number]> {
  const adj = new Map<number, Set<number>>();
  for (let i = 0; i < tris.length; i += 3) for (let c = 0; c < 3; c++) {
    const a = tris[i + c], b = tris[i + (c + 1) % 3];
    if (!inRegion(a) || !inRegion(b)) continue;
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  }
  const cur = new Map<number, [number, number, number]>();
  for (const k of adj.keys()) cur.set(k, [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
  for (let it = 0; it < iters * 2; it++) {
    const f = it % 2 === 0 ? 0.5 : -0.53;
    const next = new Map<number, [number, number, number]>();
    for (const [k, nb] of adj) {
      const p = cur.get(k)!;
      if (pin?.(k)) { next.set(k, p); continue; }
      const m = [0, 0, 0];
      for (const n of nb) { const q = cur.get(n)!; m[0] += q[0]; m[1] += q[1]; m[2] += q[2]; }
      const l = nb.size;
      next.set(k, [p[0] + f * (m[0] / l - p[0]), p[1] + f * (m[1] / l - p[1]), p[2] + f * (m[2] / l - p[2])]);
    }
    for (const [k, v] of next) cur.set(k, v);
  }
  return cur;
}

export interface GarmentCtx {
  model: BodyModel; shape: BodyShape; F: Fields; outfit: Outfit; lod: number;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Builds the garment piece list for an outfit. */
export function garmentPieces(ctx: GarmentCtx): { pieces: PieceSpec[]; trims: ((mb: MeshBuilder) => void)[] } {
  const { shape, F, outfit } = ctx;
  const P = shape.pos;
  const Y = (k: number) => P[k * 3 + 1];
  const y = F.y;
  const pieces: PieceSpec[] = [];
  const trims: ((mb: MeshBuilder) => void)[] = [];
  const isArm = (k: number) => F.part[k] === PART.armL || F.part[k] === PART.armR;
  const isLeg = (k: number) => F.part[k] === PART.legL || F.part[k] === PART.legR;
  const isHead = (k: number) => F.part[k] === PART.head;
  // fields (metres-ish; ≥ 0 inside)
  const ARM_M = 0.3, LEG_M = 0.45;
  const sleeve = (s: number): Field => (k) => (isArm(k) ? (s - F.armS[k]) * ARM_M : isLeg(k) || isHead(k) ? -1 : 1);
  const noArms: Field = (k) => (isArm(k) ? (F.armS[k] < 0.02 ? (0.02 - F.armS[k]) * ARM_M : -1) : 1);
  const legHem = (s: number): Field => (k) => (isLeg(k) ? (s - F.legS[k]) * LEG_M : isArm(k) || isHead(k) ? -1 : 1);
  const above = (yy: number): Field => (k) => Y(k) - yy;
  const below = (yy: number): Field => (k) => yy - Y(k);
  const noLegs: Field = (k) => (isLeg(k) ? Math.min(-0.001, (y.crotch + 0.02 - Y(k))) : 1);
  /** Neckline: depth at the front (m), back height above the neck joint. */
  const neckline = (front: number, back = 0.0, width = 1.6): Field => (k) => {
    const c = Math.max(0, Math.cos(F.az[k]));
    const fr = Math.pow(c, width);
    return y.neck + back - fr * (front + back) - Y(k) + (isHead(k) ? -1 : 0);
  };
  const sweatMask = (k: number) => {
    // underarms, centre back and chest (heat), stronger on the torso
    const a = Math.abs(F.az[k]);
    let s = 0;
    if (F.part[k] === PART.torso) {
      s += smooth(y.shoulder - 0.2, y.shoulder - 0.08, Y(k)) * (1 - smooth(y.shoulder - 0.03, y.shoulder + 0.02, Y(k))) * smooth(1.1, 1.5, a) * (1 - smooth(1.7, 2.0, a));
      s += smooth(2.5, 3.0, a) * smooth(y.waist, y.chest, Y(k)) * 0.8;
      s += (1 - smooth(0, 0.4, a)) * smooth(y.chest - 0.1, y.chest, Y(k)) * (1 - smooth(y.chest + 0.05, y.neck, Y(k))) * 0.5;
    }
    if (isArm(k) && F.armS[k] < 0.25) s += (1 - F.armS[k] / 0.25) * smooth(1.2, 2.2, Math.abs(F.az[k])) * 0.6;
    return Math.min(1, s) * outfit.sweat;
  };
  // Drape: shirts and jackets hang off the shoulders and chest instead of printing every muscle.
  // Their base surface is a Taubin-smoothed copy of the torso (close LODs only; arms stay exact so cuffs cut cleanly).
  // Smoothing may only move cloth outwards (bridge hollows); convex shapes stay, so the shell
  // never sinks inside the body and skin can't show through.
  const drape = ctx.lod <= 2 ? (() => {
    const sm = taubin(P, F.tris('body', Math.min(4, ctx.lod + 2)), (k) => F.part[k] === PART.torso || F.part[k] === PART.neck, 12, (k) => F.part[k] === PART.neck);
    const Nb = F.normals.get('body')!;
    for (const [k, q] of sm) {
      const d = (q[0] - P[k * 3]) * Nb[k * 3] + (q[1] - P[k * 3 + 1]) * Nb[k * 3 + 1] + (q[2] - P[k * 3 + 2]) * Nb[k * 3 + 2];
      const out = Math.max(0, d);
      sm.set(k, [P[k * 3] + Nb[k * 3] * out, P[k * 3 + 1] + Nb[k * 3 + 1] * out, P[k * 3 + 2] + Nb[k * 3 + 2] * out]);
    }
    return sm;
  })() : undefined;

  // ---- top ---------------------------------------------------------------------------------------
  const t = outfit.top;
  const topHem = outfit.dress ? y.waist - 0.02 : t.tucked ? y.waist - 0.07 : Math.max(y.crotch + 0.05, y.hip - 0.07);
  const neckFront = t.collar === 'v' ? 0.16 : t.collar === 'scoop' ? 0.09 : t.collar === 'crew' || t.collar === 'mock' ? 0.035 : t.collar === 'polo' ? 0.05 + t.open * 0.03 : 0.04 + t.open * 0.035;
  const neckBack = t.collar === 'mock' ? 0.05 : t.collar === 'spread' || t.collar === 'polo' ? 0.025 : 0.0;
  const topOff = 0.005 + t.fit * 0.7;
  pieces.push({
    surface: 'helper-tights', fabric: t.fabric, hem: 0.004, hides: true, slot: 1, basePos: drape,
    fields: [neckline(neckFront, neckBack), sleeve(t.sleeve), above(topHem), noLegs],
    offset: (k) => topOff + (isArm(k) ? t.fit * 0.6 + smooth(0, 1.0, F.armS[k]) * 0.004 : t.fit * (0.5 + 0.5 * smooth(y.waist, y.chest, Y(k)))),
    sweat: sweatMask,
  });
  if (t.collar === 'spread' || t.collar === 'polo') trims.push((mb) => (mb.slot = 1, shirtCollar(ctx, mb, t.fabric, t.collarPoint * (t.collar === 'polo' ? 0.7 : 1), topOff + t.fit + 0.002, neckBack)));
  if (t.collar === 'mock') trims.push((mb) => (mb.slot = 1, neckBand(ctx, mb, t.fabric, topOff + 0.004, 0.05)));

  // ---- bottom ------------------------------------------------------------------------------------
  const b = outfit.bottom;
  const waistTop = y.waist + b.rise + (outfit.dress ? 0.01 : 0);
  if (b.kind === 'skirt') {
    const hemY = y.knee - b.length;
    const top = outfit.dress ? y.waist + 0.02 : waistTop;
    pieces.push({
      surface: 'helper-skirt', fabric: outfit.dress ? t.fabric : b.fabric, hem: 0.004, hides: false, slot: outfit.dress ? 1 : 2,
      fields: [below(top), above(hemY)],
      offset: (k) => 0.006 + b.fit + b.flare * Math.pow(Math.max(0, (y.hip - Y(k)) / Math.max(0.2, y.hip - hemY)), 1.3),
      dust: (k) => smooth(hemY + 0.15, hemY, Y(k)) * 0.4,
    });
  } else {
    const hemS = b.kind === 'shorts' ? b.length : b.length;
    pieces.push({
      surface: 'helper-tights', fabric: b.fabric, hem: 0.005, hides: true, slot: 2,
      fields: [below(waistTop), noArms, legHem(hemS)],
      offset: (k) => {
        const base = 0.006 + b.fit;
        if (!isLeg(k)) return base + (Y(k) < y.hip ? 0.004 : 0);
        const s = F.legS[k];
        return base + 0.004 * smooth(0, 0.3, s) + b.flare * Math.pow(smooth(1.0, 2.05, s), 1.4) + (b.kind === 'shorts' ? 0.01 : 0);
      },
      dust: (k) => (isLeg(k) ? smooth(1.6, 2.1, F.legS[k]) : 0),
      sweat: (k) => (F.part[k] === PART.torso ? sweatMask(k) * 0.4 : 0),
    });
  }
  if (b.belt && !outfit.dress) {
    const bt = waistTop - 0.004, bb = waistTop - 0.036;
    pieces.push({ surface: 'helper-tights', fabric: b.belt, kind: KIND.leather, slot: 5, hem: 0.003, hides: false, fields: [below(bt), above(bb), noArms, noLegs], offset: () => 0.006 + b.fit + 0.004 });
  }

  // ---- outer layer -------------------------------------------------------------------------------
  const o = outfit.outer;
  if (o) addOuter(ctx, o, pieces, trims, { sleeve, noLegs, above, below, neckline, sweatMask, isArm, topOff: topOff + t.fit + 0.006, drape });

  // ---- tie ---------------------------------------------------------------------------------------
  if (outfit.tie && !(o && o.open < 0.5 && o.lapel === 0)) trims.push((mb) => (mb.slot = 5, tie(ctx, mb, outfit.tie!, topOff + t.fit + 0.004)));
  return { pieces, trims };
}

function addOuter(ctx: GarmentCtx, o: OuterDesc, pieces: PieceSpec[], trims: ((mb: MeshBuilder) => void)[], h: {
  sleeve: (s: number) => Field; noLegs: Field; above: (y: number) => Field; below: (y: number) => Field; neckline: (f: number, b?: number, w?: number) => Field; sweatMask: (k: number) => number; isArm: (k: number) => boolean; topOff: number; drape?: Map<number, [number, number, number]>;
}) {
  const { F, shape } = ctx;
  const P = shape.pos, y = F.y;
  const Y = (k: number) => P[k * 3 + 1];
  const buttonY = y.waist + (o.kind === 'trench' || o.kind === 'overcoat' ? 0.02 : 0.05);
  const gorgeY = y.neck - 0.06;
  const hemY = y.waist - o.length;
  const knit = o.kind === 'cardigan';
  const wedge = o.lapel > 0 || knit || o.kind === 'smock' || o.kind === 'uniformJacket' || o.kind === 'workJacket' || o.kind === 'windbreaker' || o.kind === 'leather';
  /** Half-angle of the front opening at height yy (radians on the torso). */
  const openAngle = (yy: number) => {
    if (!wedge) return 0;
    if (yy >= buttonY) {
      const tt = Math.min(1, (yy - buttonY) / Math.max(0.05, gorgeY - buttonY));
      return (o.lapel > 0 || knit ? 0.06 + tt * 0.42 : 0.02 + tt * 0.05) + o.open * 0.12;
    }
    // below the button: cutaway on suit jackets, straight on coats, hanging open when unbuttoned
    const below = Math.min(1, (buttonY - yy) / 0.3);
    return o.open > 0.5 ? 0.2 + below * 0.1 : o.kind === 'suitJacket' || o.kind === 'sportCoat' || o.kind === 'leisureJacket' ? 0.03 + below * 0.35 : 0.015;
  };
  const front: Field = (k) => (h.isArm(k) ? 1 : Math.abs(F.az[k]) - openAngle(Y(k)));
  const off = h.topOff + (knit ? 0.002 : 0.006);
  const thick = o.kind === 'overcoat' || o.kind === 'trench' ? 0.006 : 0.004;
  const sleeveS = Math.min(o.sleeve, 1.94);
  pieces.push({
    surface: 'helper-tights', fabric: o.fabric, hem: thick, hides: true, slot: 3, basePos: h.drape, kind: o.kind === 'leather' ? KIND.leather : KIND.cloth,
    fields: [h.neckline(0.02, 0.035), h.sleeve(sleeveS), h.above(Math.max(y.crotch + 0.04, Math.min(hemY, y.waist - 0.04))), h.noLegs, front],
    offset: (k) => off + (h.isArm(k) ? 0.002 + 0.003 * Math.min(1, F.armS[k]) : 0.004 * smooth(y.waist, y.chest, Y(k)) + 0.006 * (1 - smooth(y.waist - 0.1, y.waist + 0.05, Y(k)))),
    sweat: (k) => h.sweatMask(k) * 0.5,
  });
  if (hemY < y.waist - 0.04) {
    // tails / coat skirt from the skirt helper, overlapping the torso piece at the waist
    pieces.push({
      surface: 'helper-skirt', fabric: o.fabric, hem: thick, hides: false, slot: 3, kind: o.kind === 'leather' ? KIND.leather : KIND.cloth,
      fields: [h.below(y.waist - 0.0), h.above(hemY), front],
      offset: (k) => off + 0.012 + Math.max(0, (y.hip - Y(k))) * (o.kind === 'trench' ? 0.1 : 0.06),
      dust: (k) => smooth(hemY + 0.2, hemY, Y(k)) * 0.5,
    });
  }
  if (o.belted) {
    pieces.push({ surface: 'helper-tights', fabric: o.fabric, hem: 0.003, hides: false, slot: 3, fields: [h.below(y.waist + 0.02), h.above(y.waist - 0.02), h.noLegs, front, (k) => (h.isArm(k) ? -1 : 1)], offset: () => off + 0.012 });
  }
  if (o.lapel > 0) trims.push((mb) => (mb.slot = 3, lapels(ctx, mb, o, off + 0.004, buttonY, gorgeY, openAngle)));
}

// --- trims ---------------------------------------------------------------------------------------
/** Radial map of the torso (tights helper) for placing trims on the body surface. */
function torsoRadius(ctx: GarmentCtx) {
  const { F, shape } = ctx;
  const P = shape.pos, J = shape.joints;
  const NB = 48, y0 = F.y.crotch, y1 = F.y.neck + 0.08, NY = 40;
  const r = new Float32Array(NB * NY);
  const T = F.tris('helper-tights', 0);
  const used = new Set<number>(T);
  const cx = J[JI.spine_02 * 3], cz = J[JI.spine_02 * 3 + 2];
  for (const k of used) {
    if (F.part[k] !== PART.torso && F.part[k] !== PART.neck) continue;
    const yy = P[k * 3 + 1]; if (yy < y0 || yy > y1) continue;
    const a = Math.atan2(P[k * 3] - cx, P[k * 3 + 2] - cz);
    const bi = Math.floor(((a / (2 * Math.PI) + 1) % 1) * NB), yi = Math.min(NY - 1, Math.floor(((yy - y0) / (y1 - y0)) * NY));
    const d = Math.hypot(P[k * 3] - cx, P[k * 3 + 2] - cz);
    r[yi * NB + bi] = Math.max(r[yi * NB + bi], d);
  }
  // fill holes by neighbour averaging
  for (let it = 0; it < 6; it++) for (let yi = 0; yi < NY; yi++) for (let bi = 0; bi < NB; bi++) {
    if (r[yi * NB + bi] > 0) continue;
    let s = 0, n = 0;
    for (const [dy, db] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const yy = yi + dy, bb = (bi + db + NB) % NB; if (yy < 0 || yy >= NY) continue; const v = r[yy * NB + bb]; if (v > 0) { s += v; n++; } }
    if (n) r[yi * NB + bi] = s / n;
  }
  /** Surface point at (height, azimuth) pushed out by `off`. */
  const at = (yy: number, a: number, off: number): [number, number, number] => {
    const fy = Math.min(NY - 1.001, Math.max(0, ((yy - y0) / (y1 - y0)) * NY - 0.5));
    const fb = (((a / (2 * Math.PI) + 1) % 1) * NB - 0.5 + NB) % NB;
    const y0i = Math.floor(fy), b0 = Math.floor(fb), ty = fy - y0i, tb = fb - b0;
    const g = (yi: number, bi: number) => r[Math.min(NY - 1, yi) * NB + (bi % NB)];
    const rr = (g(y0i, b0) * (1 - tb) + g(y0i, b0 + 1) * tb) * (1 - ty) + (g(y0i + 1, b0) * (1 - tb) + g(y0i + 1, b0 + 1) * tb) * ty;
    const d = rr + off;
    return [cx + Math.sin(a) * d, yy, cz + Math.cos(a) * d];
  };
  return { at };
}
const torsoSkin = (ctx: GarmentCtx, yy: number, outJ: number[], outW: number[]) => {
  const J = ctx.shape.joints;
  const levels: [number, number][] = [[JI.pelvis, J[JI.pelvis * 3 + 1]], [JI.spine_01, J[JI.spine_01 * 3 + 1]], [JI.spine_02, J[JI.spine_02 * 3 + 1]], [JI.spine_03, J[JI.spine_03 * 3 + 1]], [JI.neck_01, J[JI.neck_01 * 3 + 1]]];
  let i = 0; while (i < levels.length - 2 && yy > levels[i + 1][1]) i++;
  const t = Math.min(1, Math.max(0, (yy - levels[i][1]) / (levels[i + 1][1] - levels[i][1])));
  mergeSkin([levels[i][0], levels[i + 1][0]], [1 - t, t], outJ, outW);
};

/** Builds a quad-strip ribbon: rows of points (each row = [outer…inner]) skinned along the torso. */
function ribbon(ctx: GarmentCtx, mb: MeshBuilder, rows: [number, number, number][][], m: MatData, flip = false) {
  const base = mb.count, i0 = mb.indexCount;
  const sj: number[] = [0, 0, 0, 0], sw: number[] = [0, 0, 0, 0];
  for (const row of rows) for (const p of row) { torsoSkin(ctx, p[1], sj, sw); mb.vertex(p, null, sj, sw, m); }
  const w = rows[0].length;
  for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c + 1 < w; c++) {
    const a = base + r * w + c, b = a + 1, d = a + w, e = d + 1;
    if (flip) { mb.tri(a, d, b); mb.tri(b, d, e); } else { mb.tri(a, b, d); mb.tri(b, e, d); }
  }
  mb.computeNormals(base, mb.count, i0);
}

function shirtCollar(ctx: GarmentCtx, mb: MeshBuilder, f: Fabric, point: number, off: number, backH: number) {
  const tr = torsoRadius(ctx);
  const y = ctx.F.y;
  const m = fabricMat(f);
  // band around the back of the neck, then two long spread points falling onto the chest
  for (const side of [1, -1]) {
    const rows: [number, number, number][][] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // 0 = centre back … 1 = collar point
      const a = side * (Math.PI - u * (Math.PI - 0.12));
      const baseY = y.neck + backH - u * 0.02;
      const fold = u < 0.75 ? 0.035 : 0.035 + (u - 0.75) / 0.25 * point * 0.75; // collar leaf length
      const inner = tr.at(baseY, a, off + 0.004);
      const outerY = baseY - fold * (u < 0.75 ? 1 : 0.85);
      const spread = u > 0.6 ? (u - 0.6) * 0.25 * side : 0;
      // the leaf lies on the neck/collarbone, only the points reach the chest
      const onChest = 0.85 + 0.15 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 1.5);
      const neckPt = tr.at(baseY, a + spread, off + 0.012);
      const chestPt = tr.at(outerY, a + spread, off + 0.008);
      const outer: [number, number, number] = [neckPt[0] + (chestPt[0] - neckPt[0]) * onChest, outerY, neckPt[2] + (chestPt[2] - neckPt[2]) * onChest];
      rows.push([outer, inner]);
    }
    ribbon(ctx, mb, rows, m, side < 0);
  }
}

function neckBand(ctx: GarmentCtx, mb: MeshBuilder, f: Fabric, off: number, h: number) {
  const tr = torsoRadius(ctx), y = ctx.F.y;
  const rows: [number, number, number][][] = [];
  for (let i = 0; i <= 24; i++) { const a = -Math.PI + (i / 24) * 2 * Math.PI; rows.push([tr.at(y.neck + h, a, off - 0.004), tr.at(y.neck - 0.01, a, off)]); }
  ribbon(ctx, mb, rows, fabricMat(f), true);
}

function lapels(ctx: GarmentCtx, mb: MeshBuilder, o: OuterDesc, off: number, buttonY: number, gorgeY: number, openAngle: (y: number) => number) {
  const tr = torsoRadius(ctx);
  const m = fabricMat(o.fabric);
  const y = ctx.F.y;
  for (const side of [1, -1]) {
    const rows: [number, number, number][][] = [];
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const yy = buttonY + (gorgeY - buttonY) * u;
      const edge = openAngle(yy) * side;
      // lapel width profile: grows from the button to a peak at ~75%, then the notch
      const w = o.lapel * (u < 0.8 ? Math.pow(u / 0.8, 0.8) : 1 - (u - 0.8) / 0.2 * 0.55);
      const r = 0.15;
      const inner = tr.at(yy, edge, off + 0.002);
      const outer = tr.at(yy - w * 0.15, edge + side * (w / r), off + 0.003);
      rows.push([outer, inner]);
    }
    // collar continues around the back
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      const a = side * (openAngle(gorgeY) + u * (Math.PI - openAngle(gorgeY)));
      rows.push([tr.at(y.neck - 0.035 + u * 0.01, a, off + 0.006), tr.at(y.neck + 0.01, a, off)]);
    }
    ribbon(ctx, mb, rows, m, side > 0);
  }
}

function tie(ctx: GarmentCtx, mb: MeshBuilder, t: Fabric & { width: number }, off: number) {
  const tr = torsoRadius(ctx), y = ctx.F.y;
  const m = fabricMat(t, KIND.cloth);
  const top = y.neck + 0.005, bottom = y.waist + 0.03;
  const rows: [number, number, number][][] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const yy = top + (bottom - top) * u;
    const w = (u < 0.05 ? 0.035 : 0.03 + (t.width - 0.03) * Math.pow(u, 0.7)) / 2;
    const r = 0.16;
    if (i === steps) { rows.push([tr.at(yy - w * 0.9, 0, off + 0.006), tr.at(yy - w * 0.9, 0, off + 0.006)]); continue; }
    rows.push([tr.at(yy, -w / r, off + 0.004 + u * 0.004), tr.at(yy, w / r, off + 0.004 + u * 0.004)]);
  }
  ribbon(ctx, mb, rows, m);
}

/** Emits one clipped piece into the builder; returns the fields used for hiding body skin. */
export function emitPiece(ctx: GarmentCtx, mb: MeshBuilder, p: PieceSpec) {
  const { model, shape, F } = ctx;
  // Close LODs cut tight garments from the (denser, smoother) body surface itself; far LODs
  // use the low-poly tights helper. Normals always come from the smooth LOD0 surface.
  const useBody = p.surface === 'helper-tights' && ctx.lod <= 2;
  const surface = useBody ? 'body' : p.surface;
  // body LODs: 0 full, 1 15k, 2 7k, 3 2.6k, 4 900 (character LOD n skins with body n+1)
  const tris = F.tris(surface, useBody ? Math.min(4, ctx.lod + 2) : surface === 'body' ? Math.min(4, ctx.lod + 1) : ctx.lod);
  const N = F.normals.get(surface)!;
  const res = clipSurface(tris, p.fields);
  const P = shape.pos;
  const offCache = new Map<number, number>();
  const offOf = (k: number) => { let o = offCache.get(k); if (o === undefined) { o = p.offset(k); offCache.set(k, o); } return o; };
  mb.slot = p.slot ?? 1;
  const base = mb.count, i0 = mb.indexCount;
  const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  const js: number[] = [], ws: number[] = [];
  const disp = [0, 0, 0];
  const resolve = (v: { ids: number[]; w: number[] }, extraOff: number) => {
    const pos = [0, 0, 0];
    js.length = 0; ws.length = 0;
    let dust = 0, sweat = 0;
    for (let i = 0; i < v.ids.length; i++) {
      const k = v.ids[i], w = v.w[i];
      const o = offOf(k) + extraOff;
      const bp = p.basePos?.get(k);
      for (let c = 0; c < 3; c++) pos[c] += ((bp ? bp[c] : P[k * 3 + c]) + N[k * 3 + c] * o) * w;
      if (p.disp) { p.disp(k, disp); for (let c = 0; c < 3; c++) pos[c] += disp[c] * w; }
      for (let c = 0; c < 4; c++) { const ww = model.skinW[k * 4 + c]; if (ww) { js.push(model.skinJ[k * 4 + c]); ws.push((ww / 255) * w); } }
      if (p.dust) dust += p.dust(k) * w;
      if (p.sweat) sweat += p.sweat(k) * w;
    }
    mergeSkin(js, ws, sj, sw);
    const m = fabricMat(p.fabric, p.kind ?? KIND.cloth, sweat);
    m.m1[2] = Math.min(1, p.fabric.dirt * (0.5 + dust) + dust * 0.25);
    return mb.vertex(pos, null, sj, sw, m);
  };
  const map = res.verts.map((v) => resolve(v, 0));
  for (let i = 0; i < res.tris.length; i += 3) mb.tri(map[res.tris[i]], map[res.tris[i + 1]], map[res.tris[i + 2]]);
  // hem bands: turn every cut edge inwards by the cloth thickness
  if (p.hem > 0) {
    const inner = new Map<number, number>();
    const innerOf = (vi: number) => { let j = inner.get(vi); if (j === undefined) { j = resolve(res.verts[vi], -p.hem); inner.set(vi, j); } return j; };
    for (const [a, b] of boundaryEdges(res.tris)) {
      const ia = innerOf(a), ib = innerOf(b);
      mb.tri(map[b], map[a], ia); mb.tri(map[b], ia, ib);
    }
  }
  mb.computeNormals(base, mb.count, i0);
  return res;
}
