/**
 * Assembles one character's meshes from (body model, appearance, outfit, LOD):
 *   main draw: skin (with covered regions removed), eyes, teeth, garments, trims, shoes,
 *              hats, glasses and hand-held props — one material, one draw call;
 *   hair draw: scalp/hair shells, long-hair curtains, facial hair, brows and lashes.
 * Pure data; runs on the main thread or in a worker.
 */
import type { BodyModel, BodyShape } from '../body/BodyModel';
import type { Appearance } from '../body/appearance';
import type { Outfit } from '../wardrobe/outfit';
import { JOINT_INDEX as JI } from '../rig';
import { computeFields, PART, type Fields } from './fields';
import { faceFrame, faceMasks, type FaceFrame } from './face';
import { garmentPieces, emitPiece, fabricMat, lin, type GarmentCtx, type PieceSpec } from './garments';
import { KIND, MeshBuilder, type GeoArrays, type MatData } from './MeshBuilder';
import { buildHair, scalpField } from './hair';
import { buildAccessories } from './accessories';

export interface Assembled {
  main: GeoArrays;
  hair: GeoArrays | null;
  /** Rest joints after the shoe lift (feed these to the skeleton). */
  joints: Float32Array;
  lift: number;
  face: FaceFrame;
  stats: { tris: number; verts: number; hairTris: number; ms: number };
}

const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** lod: 0 hero, 1 near crowd, 2 mid, 3 far. ultraSkin uses the full-resolution skin at LOD0 (cutscenes). */
export function assemble(model: BodyModel, shape: BodyShape, app: Appearance, outfit: Outfit, lod: number, ultraSkin = false): Assembled {
  const t0 = performance.now();
  const F = computeFields(model, shape);
  const ff = faceFrame(shape, F);
  const ctx: GarmentCtx = { model, shape, F, outfit, lod };
  const mb = new MeshBuilder();
  const P = shape.pos;
  const { pieces, trims } = garmentPieces(ctx);
  const shoe = shoePiece(F, shape, outfit);
  const all = [...pieces, shoe.piece];

  // --- which skin is hidden under opaque garments ---
  const covered = new Uint8Array(F.n);
  for (const p of all) {
    if (!p.hides) continue;
    const margin = p.hideMargin ?? 0.012;
    for (let k = 0; k < F.n; k++) if (!covered[k] && p.fields.every((f) => f(k) >= margin)) covered[k] = 1;
  }

  // --- skin ---
  const skinBase = lin(app.skin.tone);
  const masks = [0, 0, 0, 0, 0, 0, 0];
  const bodyIdx = model.indices('body', Math.min(4, lod + (ultraSkin ? 0 : 1)));
  const used = new Int32Array(model.numSplit).fill(-1);
  const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
  const legsVisibleSock = outfit.bottom.kind !== 'skirt' && outfit.bottom.kind !== 'shorts' && outfit.socks;
  const shoeTop = shoe.top;
  const age01 = app.age / 90;
  const stubble = app.sex >= 0.5 ? (app.facialHair === 'none' ? 0.35 : 0.6) : 0;
  const scalp = scalpField({ ...ctx, face: ff, app });
  const hairLin = lin(app.hair.color);
  const skinVert = (s: number) => {
    let v = used[s];
    if (v >= 0) return v;
    const k = model.splitSrc[s];
    for (let c = 0; c < 4; c++) { sj[c] = model.skinJ[k * 4 + c]; sw[c] = model.skinW[k * 4 + c] / 255; }
    faceMasks(k, P, F, ff, masks);
    const leg = F.part[k] === PART.legL || F.part[k] === PART.legR;
    let m: MatData;
    if (leg && legsVisibleSock && F.legS[k] > shoeTop - 0.35 && F.legS[k] <= shoeTop + 0.05) {
      m = { cA: lin(outfit.socks!), cB: lin(outfit.socks!), m0: [9, 0.004, 0.85, 0], m1: [KIND.cloth, 0.1, 0.1, 0] };
    } else if (leg && outfit.hosiery > 0) {
      m = { cA: skinBase, cB: lin('#6a4a38'), m0: [0, 0, 0, 0], m1: [KIND.hosiery, outfit.hosiery, app.skin.melanin, 0] };
    } else {
      const red = app.skin.redness * (F.part[k] === PART.head ? 1 : 0.5);
      const sc = Math.min(1, Math.max(0, scalp(k) / 0.012)) * (1 - app.hair.thinning * 0.6);
      const tone = sc > 0 ? skinBase.map((c, i) => c + (hairLin[i] * 0.7 - c) * sc * 0.85) as [number, number, number] : skinBase;
      m = { cA: tone, cB: [red, app.skin.freckles, app.skin.ageSpots], m0: [masks[0], masks[1], masks[2] * stubble, masks[5]], m1: [KIND.skin, app.skin.melanin, age01, app.skin.sheen] };
    }
    v = mb.vertex([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], null, sj, sw, m, [masks[3], masks[6]]);
    used[s] = v;
    return v;
  };
  const skinStart = mb.count, skinI0 = mb.indexCount;
  for (let i = 0; i < bodyIdx.length; i += 3) {
    const a = bodyIdx[i], b = bodyIdx[i + 1], c = bodyIdx[i + 2];
    if (covered[model.splitSrc[a]] && covered[model.splitSrc[b]] && covered[model.splitSrc[c]]) continue;
    mb.tri(skinVert(a), skinVert(b), skinVert(c));
  }
  smoothSkinNormals(mb, model, used, F, skinStart, skinI0);

  mb.slot = 0;
  // --- eyes and teeth ---
  if (lod <= 2) {
    eyes(model, shape, app, lod, mb);
    if (lod <= 1) teeth(model, shape, app, lod, mb);
  }

  // --- garments, trims, shoes ---
  for (const p of all) emitPiece(ctx, mb, p);
  if (lod <= 1) for (const tr of trims) tr(mb);

  // --- hats, glasses, props ---
  mb.slot = 5;
  buildAccessories({ ...ctx, face: ff, app }, mb);

  const hair = lod <= 3 ? buildHair({ ...ctx, face: ff, app, covered }) : null;

  // --- shoe sole lift ---
  const lift = shoe.lift;
  mb.translate(lift);
  const joints = Float32Array.from(shape.joints);
  for (let j = 0; j < joints.length; j += 3) if (j > 0) joints[j + 1] += lift;
  const main = mb.finish();
  if (hair) for (let i = 1; i < hair.position.length; i += 3) hair.position[i] += lift;
  return { main, hair, joints, lift, face: ff, stats: { tris: main.triangleCount, verts: main.vertexCount, hairTris: hair?.triangleCount ?? 0, ms: performance.now() - t0 } };
}

/** Skin normals computed in compact space (welded across UV seams), then gathered. */
function smoothSkinNormals(mb: MeshBuilder, model: BodyModel, used: Int32Array, F: Fields, from: number, i0: number) {
  // the body's LOD0 compact normals are smooth and seam-free; use them directly
  const N = F.normals.get('body')!;
  void i0;
  const arr = (mb as unknown as { nrm: { a: Float32Array } }).nrm.a;
  for (let s = 0; s < used.length; s++) {
    const v = used[s]; if (v < from) continue;
    const k = model.splitSrc[s];
    arr[v * 3] = N[k * 3]; arr[v * 3 + 1] = N[k * 3 + 1]; arr[v * 3 + 2] = N[k * 3 + 2];
  }
}

function shoePiece(F: Fields, shape: BodyShape, outfit: Outfit): { piece: PieceSpec; lift: number; top: number } {
  const s = outfit.shoes;
  const P = shape.pos;
  const top = s.kind === 'boot' || s.kind === 'workBoot' ? 1.82 : s.kind === 'pump' || s.kind === 'slipOn' ? 2.1 : s.kind === 'sneaker' ? 2.0 : 2.04;
  const isLeg = (k: number) => F.part[k] === PART.legL || F.part[k] === PART.legR;
  const sole = s.sole;
  const kind = s.kind === 'sneaker' || s.kind === 'sandal' ? KIND.cloth : KIND.leather;
  const fab = { color: s.color, color2: s.color2, pattern: 'solid' as const, scale: 0.02, rough: kind === KIND.leather ? 0.42 : 0.85, sheen: kind === KIND.leather ? 0.35 : 0, fade: s.wear * 0.4, dirt: s.wear };
  // heel point (back of the foot) for the heel block
  const piece: PieceSpec = {
    surface: 'body', fabric: fab, kind, hem: 0.004, hides: true, hideMargin: 0.004, slot: 4,
    fields: [(k) => (isLeg(k) ? (F.legS[k] - top) * 0.45 : -1)],
    offset: (k) => 0.004 + (F.legS[k] > 2.75 ? 0.004 : 0) + (s.kind === 'workBoot' || s.kind === 'boot' ? 0.003 : 0),
    // the shoe "last": the foot smoothed into one rounded volume (no toes), pinned at the ankle
    basePos: shoeLast(F, shape, top, s.kind),
    disp: (k, out) => {
      const yy = P[k * 3 + 1];
      out[0] = 0; out[2] = 0;
      // sole: push the underside down; the whole figure is lifted by `sole` afterwards
      out[1] = -sole * sm(0.035, 0.0, yy);
      // toes: slightly longer, squarer box
      if (F.legS[k] > 2.85) out[2] = 0.006;
    },
    dust: () => 0.6,
  };
  return { piece, lift: sole, top };
}

/**
 * The shoe "last": every foot vertex is projected onto a rounded box cross-section per slice
 * along the foot (heel → toe), so toes disappear into one smooth toe box.
 */
function shoeLast(F: Fields, shape: BodyShape, top: number, kind: string): Map<number, [number, number, number]> {
  const P = shape.pos, L = shape.landmarks;
  const out = new Map<number, [number, number, number]>();
  for (const side of ['l', 'r'] as const) {
    const part = side === 'l' ? PART.legL : PART.legR;
    const heel = L[`heel_${side}`], toe = L[`toe_tip_${side}`];
    const ax = [toe[0] - heel[0], 0, toe[2] - heel[2]];
    const len = Math.hypot(ax[0], ax[2]) || 0.25;
    ax[0] /= len; ax[2] /= len;
    const lat = [ax[2], 0, -ax[0]];
    const NB = 24, t0 = -0.3, t1 = 1.1;
    const lo = new Float32Array(NB).fill(1e9), hi = new Float32Array(NB).fill(-1e9), up = new Float32Array(NB).fill(0);
    const ids: number[] = [];
    for (let k = 0; k < F.n; k++) {
      if (F.part[k] !== part || F.legS[k] < top - 0.2) continue;
      const d = [P[k * 3] - heel[0], P[k * 3 + 1], P[k * 3 + 2] - heel[2]];
      const t = (d[0] * ax[0] + d[2] * ax[2]) / len, l = d[0] * lat[0] + d[2] * lat[2];
      const b = Math.min(NB - 1, Math.max(0, Math.floor(((t - t0) / (t1 - t0)) * NB)));
      lo[b] = Math.min(lo[b], l); hi[b] = Math.max(hi[b], l); up[b] = Math.max(up[b], d[1]);
      ids.push(k);
    }
    // fill + smooth the slice profiles
    for (let b = 0; b < NB; b++) if (lo[b] > hi[b]) { const p = b > 0 ? b - 1 : b + 1; lo[b] = lo[p]; hi[b] = hi[p]; up[b] = up[p]; }
    const sm3 = (a: Float32Array) => a.map((v, i) => (a[Math.max(0, i - 1)] + v * 2 + a[Math.min(NB - 1, i + 1)]) / 4);
    const LO = sm3(sm3(lo)), HI = sm3(sm3(hi)), UP = sm3(sm3(up));
    const n = kind === 'sneaker' || kind === 'workBoot' ? 2.4 : 3.0; // superellipse exponent (boxier for dress shoes)
    for (const k of ids) {
      const d = [P[k * 3] - heel[0], P[k * 3 + 1], P[k * 3 + 2] - heel[2]];
      const t = (d[0] * ax[0] + d[2] * ax[2]) / len, l = d[0] * lat[0] + d[2] * lat[2];
      const fb = Math.min(NB - 1.001, Math.max(0, ((t - t0) / (t1 - t0)) * NB - 0.5));
      const b0 = Math.floor(fb), u = fb - b0;
      const lw = LO[b0] + (LO[b0 + 1] - LO[b0]) * u, hw2 = HI[b0] + (HI[b0 + 1] - HI[b0]) * u, hh2 = UP[b0] + (UP[b0 + 1] - UP[b0]) * u;
      const cx = (lw + hw2) / 2, hw = (hw2 - lw) / 2 + 0.003;
      const hh = Math.max(0.02, hh2) / 2, cy = hh;
      // rounded toe
      const toeR = t > 0.88 ? Math.sqrt(Math.max(0.05, 1 - ((t - 0.88) / 0.2) ** 2)) : 1;
      const th = Math.atan2((d[1] - cy) / hh, (l - cx) / hw);
      const c = Math.cos(th), s2 = Math.sin(th);
      const nl = cx + hw * toeR * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const ny = cy + hh * (s2 > 0 ? toeR : 1) * Math.sign(s2) * Math.pow(Math.abs(s2), 2 / n);
      const w = sm(top - 0.15, top + 0.1, F.legS[k]) * sm(0.15, 0.45, t);
      const along = t * len;
      const np = [heel[0] + ax[0] * along + lat[0] * nl, ny, heel[2] + ax[2] * along + lat[2] * nl];
      out.set(k, [P[k * 3] + (np[0] - P[k * 3]) * w, P[k * 3 + 1] + (np[1] - P[k * 3 + 1]) * w, P[k * 3 + 2] + (np[2] - P[k * 3 + 2]) * w]);
    }
  }
  return out;
}

function eyes(model: BodyModel, shape: BodyShape, app: Appearance, lod: number, mb: MeshBuilder) {
  // Our own eyeballs (UV spheres) sized from MakeHuman's eye helpers; iris faces +Z at rest and
  // the eye joints rotate them (look-at). Sclera, iris, pupil and the wet highlight are shaded.
  const P = shape.pos, J = shape.joints;
  const iris = lin(app.eyeColor);
  const sclera = lin(app.age > 60 ? '#d8cdb8' : '#e4dccf');
  const seg = lod === 0 ? 20 : 12, rings = lod === 0 ? 14 : 8;
  for (const [g, joint] of [['helper-l-eye', JI.eye_l], ['helper-r-eye', JI.eye_r]] as const) {
    const c = [J[joint * 3], J[joint * 3 + 1], J[joint * 3 + 2]];
    const idx = model.indices(g, 0);
    let r = 0; for (let i = 0; i < idx.length; i++) { const k = model.splitSrc[idx[i]]; r += Math.hypot(P[k * 3] - c[0], P[k * 3 + 1] - c[1], P[k * 3 + 2] - c[2]); }
    r = (r / idx.length) * 0.98;
    const base = mb.count;
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * Math.PI; // 0 = front (+Z)
      for (let j = 0; j <= seg; j++) {
        const ph = (j / seg) * Math.PI * 2;
        const d = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        // corneal bulge over the iris
        const bulge = th < 0.45 ? 0.08 * r * Math.cos((th / 0.45) * Math.PI / 2) : 0;
        mb.vertex([c[0] + d[0] * (r + bulge), c[1] + d[1] * (r + bulge), c[2] + d[2] * (r + bulge)], d, [joint, 0, 0, 0], [1, 0, 0, 0],
          { cA: iris, cB: sclera, m0: [th, 0.42, 0.15, 0.05], m1: [KIND.eye, 0, 0, 0] });
      }
    }
    const w = seg + 1;
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = base + i * w + j; mb.tri(a, a + w, a + 1); mb.tri(a + 1, a + w, a + w + 1); }
  }
}
// eyes: push indices one at a time (triangles come straight from the index list)
const pending: number[] = [];
function idxPush(mb: MeshBuilder, v: number) { pending.push(v); if (pending.length === 3) { mb.tri(pending[0], pending[1], pending[2]); pending.length = 0; } }

function teeth(model: BodyModel, shape: BodyShape, app: Appearance, lod: number, mb: MeshBuilder) {
  const P = shape.pos;
  const col = lin(app.age > 55 ? '#c8b894' : '#ddd2bc');
  for (const g of ['helper-upper-teeth', 'helper-lower-teeth']) {
    const idx = model.indices(g, lod);
    const map = new Map<number, number>();
    const base = mb.count, i0 = mb.indexCount;
    const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let i = 0; i < idx.length; i++) {
      const s = idx[i];
      let v = map.get(s);
      if (v === undefined) {
        const k = model.splitSrc[s];
        for (let c = 0; c < 4; c++) { sj[c] = model.skinJ[k * 4 + c]; sw[c] = model.skinW[k * 4 + c] / 255; }
        v = mb.vertex([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], null, sj, sw, { cA: col, cB: col, m0: [0, 0, 0.35, 0], m1: [KIND.teeth, 0, 0, 0] });
        map.set(s, v);
      }
      idxPush(mb, v);
    }
    mb.computeNormals(base, mb.count, i0);
  }
}

export { fabricMat };
