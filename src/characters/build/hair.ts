/**
 * Hair: shell layers over MakeHuman's long-hair helper (scalp to mid-back), cut and shaped per
 * period style; facial hair and eyebrows as short shells on the face; lashes from the lash
 * helper cards. One alpha-tested draw (see render/materials.ts, hair material).
 */
import type { Appearance, HairStyle } from '../body/appearance';
import { JOINT_INDEX as JI } from '../rig';
import { clipSurface, type Field } from './clip';
import { PART } from './fields';
import type { FaceFrame } from './face';
import { faceMasks } from './face';
import type { GarmentCtx } from './garments';
import { lin } from './garments';
import { KIND, MeshBuilder, mergeSkin, type GeoArrays } from './MeshBuilder';
import { buildCards, CARD_STYLES, cardHairline, headMap } from './hairCards';

type V3 = [number, number, number];
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

interface StyleShape {
  /** Lowest hair point at the back/sides (m relative to the eye line; negative = below). */
  length: number;
  /** Shell thickness at a vertex given (up 0..1, front 0..1, side 0..1). */
  thick: (up: number, front: number, side: number) => number;
  /** Fringe/hairline: how far the hair comes down the forehead (m above the brow). */
  fringe: number;
  density: number;
  /** Strand noise frequency (higher = finer/curlier). */
  freq: number;
  layers: number;
  /** Afro-style volume: target radius beyond the scalp (m), applied radially from the head centre. */
  sphere?: number;
}
const STYLES: Record<HairStyle, StyleShape> = {
  bald: { length: 0.0, thick: () => 0.002, fringe: 0.08, density: 0.25, freq: 900, layers: 1 },
  buzz: { length: -0.01, thick: () => 0.003, fringe: 0.045, density: 0.9, freq: 700, layers: 2 },
  short: { length: -0.035, thick: (u) => 0.006 + 0.008 * u, fringe: 0.045, density: 1, freq: 420, layers: 5 },
  sidePart: { length: -0.03, thick: (u, f) => 0.007 + 0.012 * u + 0.006 * f * u, fringe: 0.05, density: 1, freq: 380, layers: 6 },
  slick: { length: -0.04, thick: (u) => 0.005 + 0.007 * u, fringe: 0.06, density: 1, freq: 520, layers: 4 },
  combOver: { length: -0.03, thick: (u) => 0.003 + 0.004 * u, fringe: 0.07, density: 0.55, freq: 600, layers: 3 },
  pompadour: { length: -0.04, thick: (u, f) => 0.008 + 0.012 * u + 0.03 * f * u, fringe: 0.055, density: 1, freq: 380, layers: 7 },
  shag: { length: -0.11, thick: (u, _f, s) => 0.014 + 0.016 * u + 0.008 * s, fringe: 0.012, density: 0.95, freq: 300, layers: 8 },
  earLength: { length: -0.07, thick: (u, _f, s) => 0.012 + 0.012 * u + 0.006 * s, fringe: 0.02, density: 1, freq: 320, layers: 7 },
  feathered: { length: -0.1, thick: (u, f, s) => 0.016 + 0.018 * u + 0.012 * s + 0.006 * f, fringe: 0.03, density: 0.95, freq: 300, layers: 8 },
  curlyMid: { length: -0.05, thick: (u) => 0.015 + 0.01 * u, fringe: 0.04, density: 1, freq: 1500, layers: 8, sphere: 0.04 },
  afro: { length: -0.105, thick: () => 0.01, fringe: 0.04, density: 1, freq: 2200, layers: 10, sphere: 0.07 },
  afroShort: { length: -0.035, thick: () => 0.008, fringe: 0.045, density: 1, freq: 2600, layers: 6, sphere: 0.025 },
  longStraight: { length: -0.36, thick: (u, _f, s) => 0.008 + 0.006 * u + 0.006 * s, fringe: 0.05, density: 1, freq: 260, layers: 7 },
  bob: { length: -0.1, thick: (u, _f, s) => 0.012 + 0.012 * u + 0.012 * s, fringe: 0.02, density: 1, freq: 300, layers: 7 },
  ponytail: { length: -0.05, thick: (u) => 0.006 + 0.006 * u, fringe: 0.055, density: 1, freq: 360, layers: 5 },
  braid: { length: -0.05, thick: (u) => 0.006 + 0.005 * u, fringe: 0.055, density: 1, freq: 500, layers: 5 },
  updo: { length: -0.03, thick: (u, f) => 0.012 + 0.03 * u * (1 - f * 0.6), fringe: 0.05, density: 1, freq: 400, layers: 7 },
  // set and sprayed: soft, dense volume (low-frequency noise; the roller bumps are geometry)
  setCurls: { length: -0.06, thick: (u, _f, s) => 0.022 + 0.018 * u + 0.008 * s, fringe: 0.035, density: 1.6, freq: 220, layers: 6 },
  cornrows: { length: -0.04, thick: () => 0.004, fringe: 0.05, density: 1, freq: 120, layers: 3 },
  flip: { length: -0.13, thick: (u, _f, s) => 0.014 + 0.014 * u + 0.012 * s, fringe: 0.03, density: 1, freq: 300, layers: 7 },
};

export interface HairCtx extends GarmentCtx { face: FaceFrame; app: Appearance; covered: Uint8Array }

/** Scalp coverage field for skin tinting under the hair (≥ 0 under hair). */
export function scalpField(ctx: Omit<HairCtx, 'covered'>): (k: number) => number {
  const { shape, app, face: ff } = ctx;
  const P = shape.pos;
  const st = STYLES[app.hair.style];
  const hc = ff.headCenter;
  const eyeY = (ff.eyeL[1] + ff.eyeR[1]) / 2;
  const s = ff.eyeDist / 0.064;
  if (app.hair.style === 'bald') return () => -1;
  return (k) => {
    if (ctx.F.part[k] !== PART.head) return -1;
    const yy = P[k * 3 + 1];
    const fr = Math.max(0, (P[k * 3 + 2] - hc[2]) / (ff.headRadius * 0.9));
    const sd = Math.min(1, Math.abs(P[k * 3] - hc[0]) / (ff.headRadius * 0.85));
    // the tint stops 2 cm short of the shells' hairline so it never shows as a smudge below the hair
    const fringeY = ff.browY + (Math.max(st.fringe, 0.03) + 0.02) * s + app.hair.recession * 0.05 * s * (0.4 + sd);
    const frontCut = fr > 0.35 ? yy - fringeY + (1 - fr) * 0.02 : 1;
    const earCut = sd > 0.75 && fr < 0.6 ? yy - (eyeY + 0.015 * s) : 1;
    return Math.min(frontCut, earCut, yy - (eyeY - 0.02 * s));
  };
}

export function buildHair(ctx: HairCtx): GeoArrays | null {
  const { model, shape, F, app, face: ff, lod } = ctx;
  const mb = new MeshBuilder();
  const P = shape.pos;
  const st = STYLES[app.hair.style];
  const hat = ctx.outfit.hat;
  // hero/near LODs draw strand cards over a single scalp shell; crowds keep the shell stack
  const cards = lod <= 1 && CARD_STYLES.has(app.hair.style);
  // under cards: a solid scalp, a mid and an outer volume shell (the cards carry the strands)
  // under cards a single scalp shell: stacked mid/outer shells showed as horizontal scan lines at
  // grazing angles (their layer edges); the cards carry the volume
  const layerCount = cards ? 1 : Math.max(1, Math.round(st.layers * [1, 0.6, 0.35, 0.2][lod]));
  const cardHL = cards ? cardHairline(ctx) : null;
  const col = lin(app.hair.color);
  const tip = col.map((c) => Math.min(1, c * 1.25 + 0.02)) as [number, number, number];
  const hc = ff.headCenter;
  const eyeY = (ff.eyeL[1] + ff.eyeR[1]) / 2;
  const s = ff.eyeDist / 0.064;

  // ---- scalp / hair shells on the hair helper --------------------------------------------------
  if (app.hair.style !== 'bald' || app.hair.thinning < 0.95) {
    const cap = F.tris('helper-hair', Math.min(lod, 2));
    const Nh = F.normals.get('helper-hair')!;
    const front = (k: number) => Math.max(0, (P[k * 3 + 2] - hc[2]) / (ff.headRadius * 0.9));
    const up = (k: number) => Math.min(1, Math.max(0, (P[k * 3 + 1] - eyeY) / (ff.headRadius * 1.2)));
    const side = (k: number) => Math.min(1, Math.abs(P[k * 3] - hc[0]) / (ff.headRadius * 0.85));
    const rec = app.hair.recession;
    const hatLine = hat ? ff.browY + 0.03 * s : Infinity;
    // hairline: forehead (front), temples (recession), around the ears, the nape/length cut
    const hairline: Field = cardHL ? (k) => P[k * 3 + 1] - cardHL(Math.atan2(P[k * 3] - hc[0], P[k * 3 + 2] - hc[2])) : (k) => {
      const yy = P[k * 3 + 1], fr = front(k), sd = side(k);
      // natural hair (afro, curls): the hairline arcs up at the temples rather than a straight fringe cut
      const fringeY = ff.browY + st.fringe * s + rec * 0.05 * s * (0.4 + sd) + (st.sphere ? 0.03 * s * sd * sd : 0);
      const frontCut = fr > 0.35 ? yy - fringeY + (1 - fr) * 0.02 : 1;
      // ears: hair stays above/behind the ear unless the style is long
      const earCut = st.length > -0.06 && sd > 0.75 && fr > -0.1 && fr < 0.6 ? yy - (eyeY + 0.01 * s) : 1;
      const lenCut = yy - (eyeY + st.length * app.hair.length * s);
      return Math.min(frontCut, earCut, lenCut);
    };
    const crown: Field = (k) => {
      // balding crown for thinning > 0.6 (comb-over keeps a thin layer instead)
      if (app.hair.thinning < 0.6 || app.hair.style === 'combOver') return 1;
      const top = up(k) > 0.85 && front(k) > -0.2 ? -1 : 1;
      return top;
    };
    const fields = [hairline, crown];
    if (hat) fields.push((k) => (P[k * 3 + 1] < hatLine + 0.01 ? 1 : -1));
    const vol0 = app.hair.volume;
    if (st.sphere && vol0 > 0.1 && !hat) {
      // ---- afro / curly volume on its own dense grid ------------------------------------------
      // Shells grown off the helper-hair mesh stretched its coarse triangles into flat facets (with
      // a fold down the middle) once the volume passed a few cm. Here a latitude/longitude grid around
      // a raised centre takes, per direction, the scalp radius, skin weights and hairline from the
      // nearest helper vertex, and the layers grow radially into a smooth round mass with coil clumps.
      const c: V3 = [hc[0], hc[1] + 0.03, hc[2] - 0.025];
      // sources: the helper-hair scalp plus the back half of our own head (the helper stops above the
      // nape, which left the afro ending in a slab with bare scalp under it)
      const ids = [...new Set(Array.from(cap))];
      for (let k = 0; k < F.n; k++) if (F.part[k] === PART.head && P[k * 3 + 2] < hc[2] - 0.01 && P[k * 3 + 1] < eyeY + 0.02) ids.push(k);
      const dirOf = (k: number) => { const d = [P[k * 3] - c[0], P[k * 3 + 1] - c[1], P[k * 3 + 2] - c[2]]; const l = Math.hypot(d[0], d[1], d[2]) || 1; return { d: [d[0] / l, d[1] / l, d[2] / l], l }; };
      const pre = ids.map((k) => ({ k, ...dirOf(k) }));
      const NT = lod === 0 ? 40 : lod === 1 ? 26 : 16, NP = NT * 2;
      const grid: { k: number; l: number; d: number[]; hl: number }[] = [];
      for (let i = 0; i <= NT; i++) for (let j = 0; j < NP; j++) {
        const th = (i / NT) * Math.PI * 0.88, ph = (j / NP) * Math.PI * 2; // from the crown down to ~140°
        const d = [Math.sin(th) * Math.sin(ph), Math.cos(th), Math.sin(th) * Math.cos(ph)];
        let best = pre[0], bd = -2;
        for (const q of pre) { const dd = q.d[0] * d[0] + q.d[1] * d[1] + q.d[2] * d[2]; if (dd > bd) { bd = dd; best = q; } }
        // directions the helper doesn't reach (face, below the hairline) get no hair
        // where the helper's coverage ends (the nape, behind the ears) the hair thins out over the last
        // few degrees instead of stopping as a wall (it read as a floating helmet brim)
        const hlv = bd > 0.965 ? Math.min(hairline(best.k), crown(best.k), (bd - 0.965) * 1.5) : -1;
        grid.push({ k: best.k, l: best.l, d, hl: hlv });
      }
      // smooth the scalp radius across the grid: nearest-vertex picks jump between neighbours, which
      // stood out as flat sheets behind the ears
      const raw = grid.map((g) => g.l);
      for (let it = 0; it < 4; it++) {
        const ls = grid.map((g) => g.l);
        for (let i = 0; i <= NT; i++) for (let j = 0; j < NP; j++) {
          const a = i * NP + j; let sum = ls[a] * 2, n = 2;
          for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const ii = i + di; if (ii < 0 || ii > NT) continue; sum += ls[ii * NP + ((j + dj + NP) % NP)]; n++; }
          grid[a].l = sum / n;
        }
      }
      // never further out than the scalp itself (smoothing lifted the shells off the nape: a floating brim)
      grid.forEach((g, i) => { g.l = Math.min(g.l, raw[i]); });
      const R = ff.headRadius * 0.95 + st.sphere * vol0;
      for (let L = 0; L < layerCount; L++) {
        const h = layerCount === 1 ? 0.5 : L / (layerCount - 1);
        const base = mb.count;
        for (const g of grid) {
          const up = Math.max(0, g.d[1]), fr = Math.max(0, g.d[2]) * (1 - up);
          // outer radius: a rounded mass, fuller on top, pulled in over the face and at the hairline
          const outer = Math.max(g.l + 0.006, R * (0.92 + 0.12 * up) * (1 - 0.18 * fr));
          const taper = sm(0, 0.05, g.hl);
          const r = g.l + (outer - g.l) * taper * (0.08 + 0.92 * h) + 0.002;
          const pos: V3 = [c[0] + g.d[0] * r, c[1] + g.d[1] * r, c[2] + g.d[2] * r];
          const js2: number[] = [], ws2: number[] = [];
          for (let q = 0; q < 4; q++) { const ww = model.skinW[g.k * 4 + q]; if (ww) { js2.push(model.skinJ[g.k * 4 + q]); ws2.push(ww / 255); } }
          const sj2 = [0, 0, 0, 0], sw2 = [0, 0, 0, 0]; mergeSkin(js2, ws2, sj2, sw2);
          const u = Math.atan2(g.d[0], g.d[2]) * ff.headRadius, vv = Math.acos(Math.max(-1, Math.min(1, g.d[1]))) * ff.headRadius;
          mb.vertex(pos, g.d as V3, sj2, sw2, { cA: col, cB: tip, m0: [h, st.density * taper ** 0.7, st.freq, app.hair.texture], m1: [KIND.hair, 0, app.hair.grey, 2] }, [u, vv]);
        }
        for (let i = 0; i < NT; i++) for (let j = 0; j < NP; j++) {
          const a = i * NP + j, b = i * NP + (j + 1) % NP, cc = (i + 1) * NP + j, d = (i + 1) * NP + (j + 1) % NP;
          if (grid[a].hl < 0 && grid[b].hl < 0 && grid[cc].hl < 0 && grid[d].hl < 0) continue;
          if (Math.min(grid[a].hl, grid[b].hl, grid[cc].hl, grid[d].hl) < 0) continue; // nothing past the hairline (no brim over the forehead or cheeks)
          mb.tri(base + a, base + cc, base + b); mb.tri(base + b, base + cc, base + d);
        }
      }
    } else {
    const res = clipSurface(cap, fields);
    const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    const js: number[] = [], ws: number[] = [];
    const vol = app.hair.volume;
    for (let L = 0; L < layerCount; L++) {
      const h = cards ? 0 : layerCount === 1 ? 0.5 : L / (layerCount - 1);
      const base = mb.count, i0 = mb.indexCount;
      const map = res.verts.map((v) => {
        const pos = [0, 0, 0], nrm = [0, 0, 0];
        js.length = 0; ws.length = 0;
        let u = 0, vv = 0;
        for (let i = 0; i < v.ids.length; i++) {
          const k = v.ids[i], w = v.w[i];
          let th = st.thick(up(k), front(k), side(k)) * vol;
          if (app.hair.style === 'setCurls') {
            // set-and-sprayed rows of roller curls: a bumpy, rounded surface
            const uk = Math.atan2(P[k * 3] - hc[0], P[k * 3 + 2] - hc[2]) * ff.headRadius, vk = hc[1] + ff.headRadius - P[k * 3 + 1];
            th *= 0.7 + 0.55 * Math.abs(Math.sin((uk / 0.034) * Math.PI) * Math.sin((vk / 0.03) * Math.PI + (Math.floor(vk / 0.03) % 2) * 1.5));
          }
          let dir = [Nh[k * 3], Nh[k * 3 + 1], Nh[k * 3 + 2]];
          if (st.sphere && vol <= 0.1) {
            // close-cropped natural hair (a teeny-weeny afro): an even ~1 cm layer on the scalp that
            // tapers to nothing at the hairline: no bowl, no helmet edge
            th = (0.009 + 0.004 * up(k)) * sm(0, 0.03, hairline(k));
          } else if (st.sphere) {
            // afro: grow towards a rounded volume around the head centre
            // grown from a raised centre: up and out, not forward over the brow; rounded at the ears
            const d = [P[k * 3] - hc[0], P[k * 3 + 1] - (hc[1] + 0.035), P[k * 3 + 2] - (hc[2] - 0.02)];
            const l = Math.hypot(d[0], d[1], d[2]) || 1;
            d[1] = Math.max(d[1], -0.15 * l); // never grows downward over the face or ears
            dir = [d[0] / l, d[1] / l, d[2] / l];
            const fr = front(k) * (1 - up(k));
            th = Math.max(0, ff.headRadius * 0.95 + st.sphere * vol * (0.55 + 0.45 * up(k)) * (1 - 0.55 * fr) - l * 0.95) + 0.006;
            // rounded edge: the volume rises from zero at the hairline
            th *= 0.12 + 0.88 * sm(0, 0.045, hairline(k));
            const dl = Math.hypot(d[0], d[1], d[2]) || 1; dir = [d[0] / dl, d[1] / dl, d[2] / dl];
          }
          const o = th * (0.15 + 0.85 * h) * (cards ? 0.6 : 1);
          for (let c = 0; c < 3; c++) { pos[c] += (P[k * 3 + c] + dir[c] * o) * w; nrm[c] += Nh[k * 3 + c] * w; }
          for (let c = 0; c < 4; c++) { const ww = model.skinW[k * 4 + c]; if (ww) { js.push(model.skinJ[k * 4 + c]); ws.push((ww / 255) * w); } }
          // strand coordinates: around the head (u) and down from the crown (v), in metres
          u += Math.atan2(P[k * 3] - hc[0], P[k * 3 + 2] - hc[2]) * ff.headRadius * w;
          vv += (hc[1] + ff.headRadius - P[k * 3 + 1]) * w;
        }
        mergeSkin(js, ws, sj, sw);
        const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
        // under cards the scalp shell fades in over the first 12 mm inside the hairline (no hard edge)
        let soft = 1;
        if (cardHL) { let fy = 0; for (let i = 0; i < v.ids.length; i++) fy += hairline(v.ids[i]) * v.w[i]; soft = 0.35 + 0.65 * sm(0, 0.012, fy); }
        return mb.vertex(pos, [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl], sj, sw, {
          cA: col, cB: tip,
          // under cards the shells are the hair mass: dense, low-frequency, the cards carry the strands
          m0: [h, soft * st.density * (cardHL ? 3 : 1) * (app.hair.style === 'combOver' ? 0.6 : 1) * (1 - app.hair.thinning * 0.4), st.freq * (cardHL ? 0.35 : 1), app.hair.texture],
          // m1.w: 1 cornrows, 2 coily clumps (afro, curls)
          m1: [KIND.hair, 0, app.hair.grey, app.hair.style === 'cornrows' ? 1 : ['afro', 'afroShort', 'curlyMid'].includes(app.hair.style) ? 2 : 0],
        }, [u, vv]);
      });
      for (let i = 0; i < res.tris.length; i += 3) mb.tri(map[res.tris[i]], map[res.tris[i + 1]], map[res.tris[i + 2]]);
      void base; void i0;
    }
  }
  }

  if (cards) buildCards({ ...ctx, face: ff, app }, mb, headMap({ ...ctx, face: ff }));

  // ---- facial hair, brows (shells on the face) ---------------------------------------------------
  if (lod <= 2) {
    const fh = app.facialHair;
    const want = (m: number[]) => {
      const beard = fh === 'beard' ? m[2] : fh === 'goatee' ? m[2] * (1 - sm(0.025 * s, 0.035 * s, Math.abs(0))) : 0;
      const mous = fh === 'moustache' || fh === 'moustacheSideburns' || fh === 'horseshoe' || fh === 'beard' || fh === 'goatee' ? m[4] : 0;
      const side = fh === 'sideburns' || fh === 'moustacheSideburns' || fh === 'beard' ? m[5] : 0;
      return { beard: Math.max(beard, mous, side), brow: m[1] };
    };
    const masks = [0, 0, 0, 0, 0, 0, 0];
    const cache = new Map<number, { beard: number; brow: number }>();
    const mOf = (k: number) => { let r = cache.get(k); if (!r) { faceMasks(k, P, F, ff, masks); r = want(masks); if (fh === 'horseshoe') { const dx = Math.abs(P[k * 3]) - 0.024 * s; r.beard = Math.max(r.beard, masks[2] * sm(-0.004, 0.002, dx) * sm(ff.chin[1] - 0.005, ff.chin[1] + 0.02, P[k * 3 + 1])); } cache.set(k, r); } return r; };
    const bodyTris = F.tris('body', Math.min(4, lod + 1));
    const headTris: number[] = [];
    for (let i = 0; i < bodyTris.length; i += 3) if (F.part[bodyTris[i]] === PART.head || F.part[bodyTris[i]] === PART.neck) headTris.push(bodyTris[i], bodyTris[i + 1], bodyTris[i + 2]);
    const T = Uint32Array.from(headTris);
    const Nb = F.normals.get('body')!;
    const groups: { field: Field; th: number; layers: number; density: number; freq: number; color: [number, number, number]; sub: number }[] = [];
    if (fh !== 'none' && fh !== 'stubble') groups.push({ field: (k) => mOf(k).beard - 0.25, th: fh === 'beard' ? 0.012 : 0.006, layers: lod === 0 ? 4 : 2, density: 1, freq: 900, color: lin(app.facialHairColor), sub: 1 });
    if (false) groups.push({ field: (k) => mOf(k).brow - 0.45, th: 0.0018, layers: lod === 0 ? 3 : 2, density: 0.9, freq: 1400, color: lin(app.facialHairColor).map((c) => c * 0.85) as [number, number, number], sub: 2 });
    const sj = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    const js: number[] = [], ws: number[] = [];
    for (const g of groups) {
      const res = clipSurface(T, [g.field]);
      for (let L = 0; L < g.layers; L++) {
        const h = g.layers === 1 ? 0.5 : L / (g.layers - 1);
        const map = res.verts.map((v) => {
          const pos = [0, 0, 0], nrm = [0, 0, 0];
          js.length = 0; ws.length = 0;
          let u = 0, vv = 0;
          for (let i = 0; i < v.ids.length; i++) {
            const k = v.ids[i], w = v.w[i];
            const o = g.th * (0.1 + 0.9 * h);
            for (let c = 0; c < 3; c++) { pos[c] += (P[k * 3 + c] + Nb[k * 3 + c] * o) * w; nrm[c] += Nb[k * 3 + c] * w; }
            for (let c = 0; c < 4; c++) { const ww = model.skinW[k * 4 + c]; if (ww) { js.push(model.skinJ[k * 4 + c]); ws.push((ww / 255) * w); } }
            u += P[k * 3] * w; vv += -P[k * 3 + 1] * w;
          }
          mergeSkin(js, ws, sj, sw);
          const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
          return mb.vertex(pos, [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl], sj, sw, { cA: g.color, cB: g.color, m0: [h, g.density, g.freq, app.hair.texture], m1: [KIND.hair, g.sub, app.hair.grey, 0] }, [u, vv]);
        });
        for (let i = 0; i < res.tris.length; i += 3) mb.tri(map[res.tris[i]], map[res.tris[i + 1]], map[res.tris[i + 2]]);
      }
    }
  }

  // ---- lashes ------------------------------------------------------------------------------------
  if (lod <= 1) {
    const idx = model.indices('lashes', lod);
    const map = new Map<number, number>();
    const sj = [JI.Head, 0, 0, 0], sw = [1, 0, 0, 0];
    const base = mb.count, i0 = mb.indexCount;
    const lc = lin('#1a1412');
    for (let i = 0; i < idx.length; i += 3) {
      const tri = [0, 1, 2].map((c) => {
        const sIdx = idx[i + c];
        let v = map.get(sIdx);
        if (v === undefined) { const k = model.splitSrc[sIdx]; v = mb.vertex([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], null, sj, sw, { cA: lc, cB: lc, m0: [0.55, 0.62, 2600, 0], m1: [KIND.hair, 2, 0, 0] }, [model.splitUV[sIdx * 2], model.splitUV[sIdx * 2 + 1]]); map.set(sIdx, v); }
        return v;
      });
      mb.tri(tri[0], tri[1], tri[2]);
    }
    mb.computeNormals(base, mb.count, i0);
  }
  if (!mb.count) return null;
  return mb.finish();
}
