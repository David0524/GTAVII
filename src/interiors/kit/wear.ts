/**
 * Condition-grade storytelling for furniture and rooms (shared scale, src/shared/condition.ts: 0 derelict .. 4 pristine).
 * Every random choice here draws from Kit.wr, a stream separate from layout, so one interior keeps its plan at every
 * grade and only its story changes.
 *
 * References (references/catalog.json): DOCUMERICA 1973-74 (welfare hotels, Lower East Side flats: taped vinyl, mismatched
 * chairs, cartons, bare mattresses, newspapers on the floor); Gottscho-Schleisner 1939-41 (kept/pristine: lace
 * antimacassars, linen, potted palms, rugs, cut flowers).
 *
 *   derelict  overturned and broken chairs, cushions gone, bare mattress, scattered newsprint, bottles, a sheet of plywood
 *   worn      tape over split vinyl, stuffing showing, mismatched chairs, cartons, newspaper stacks, a mop bucket
 *   lived_in  the odd carton or paper stack, a coffee ring
 *   kept      antimacassars, tablecloths, a potted plant and a rug
 *   pristine  as kept, plus throw cushions, cut flowers and a second plant
 */
import { type Kit } from './Kit';
import { M, type Mat, tint } from './materials';
import { pbox, pcyl, toWorld, type Frame } from './props';

export const W = {
  tape: { c: [0.62, 0.61, 0.58], pat: 13, p: 1, wear: 0.5 } as Mat,           // grey duct tape (chrome pattern, matte variant)
  stuffing: { c: [0.82, 0.76, 0.6], pat: 24, p: 0, wear: 0.7 } as Mat,
  lace: { c: [0.92, 0.9, 0.84], pat: 24, p: 1, wear: 0.1 } as Mat,
  linen: { c: [0.9, 0.88, 0.82], pat: 24, p: 0, wear: 0.1 } as Mat,
  cardboard: { c: [0.6, 0.47, 0.32], pat: 25, p: 0, wear: 0.6 } as Mat,
  leaf: { c: [0.25, 0.36, 0.18], pat: 24, p: 1, wear: 0.2 } as Mat,
  deadLeaf: { c: [0.42, 0.36, 0.2], pat: 24, p: 1, wear: 0.6 } as Mat,
  terracotta: { c: [0.6, 0.35, 0.23], pat: 0, p: 0, wear: 0.4 } as Mat,
  bottleGreen: { c: [0.2, 0.33, 0.2], pat: 0, p: 0, wear: 0.2 } as Mat,
  bottleBrown: { c: [0.35, 0.2, 0.1], pat: 0, p: 0, wear: 0.2 } as Mat,
  ticking: { c: [0.74, 0.7, 0.6], pat: 24, p: 1, wear: 0.9 } as Mat,
  trashBag: { c: [0.1, 0.1, 0.1], pat: 14, p: 0, wear: 0.3 } as Mat,
  plywood: { c: [0.66, 0.55, 0.38], pat: 26, p: 0, wear: 0.6 } as Mat,
  rug: [
    { c: [0.42, 0.18, 0.16], pat: 22, p: 0, wear: 0.4 } as Mat,
    { c: [0.22, 0.27, 0.36], pat: 22, p: 1, wear: 0.4 } as Mat,
    { c: [0.46, 0.38, 0.24], pat: 22, p: 0, wear: 0.4 } as Mat,
  ],
  flower: [{ c: [0.8, 0.2, 0.2], pat: 0, p: 0, wear: 0 } as Mat, { c: [0.92, 0.82, 0.3], pat: 0, p: 0, wear: 0 } as Mat, { c: [0.9, 0.86, 0.84], pat: 0, p: 0, wear: 0 } as Mat],
};

/** Chance by grade, 0..4. */
export const byGrade = (k: Kit, p: readonly [number, number, number, number, number]) => k.wr.chance(p[k.grade]);

/**
 * Seat-top wear on a rectangle (frame coords, y = seat top): grey tape crosses over splits (worn), torn vinyl with
 * stuffing showing (derelict). Returns true if something was drawn.
 */
export function seatWear(k: Kit, f: Frame, x0: number, z0: number, x1: number, z1: number, y: number): boolean {
  const g = k.grade, w = k.wr;
  if (g >= 2 && !(g === 2 && w.chance(0.08))) return false;
  if (g === 1 && !w.chance(0.55)) return false;
  if (g === 0 && !w.chance(0.8)) return false;
  const cx = w.range(x0 + (x1 - x0) * 0.25, x1 - (x1 - x0) * 0.25), cz = w.range(z0 + (z1 - z0) * 0.25, z1 - (z1 - z0) * 0.25);
  const L = Math.min(x1 - x0, z1 - z0) * w.range(0.35, 0.6);
  if (g === 0 && w.chance(0.6)) {
    // split vinyl: a ragged tear with stuffing showing
    pbox(k, f, cx - L / 2, y, cz - L * 0.18, cx + L / 2, y + 0.006, cz + L * 0.18, W.stuffing, { occlude: false });
    pbox(k, f, cx - L * 0.3, y + 0.004, cz - L * 0.3, cx + L * 0.1, y + 0.012, cz + L * 0.05, W.stuffing, { occlude: false });
  } else {
    // tape: one strip, or a cross over a long split
    pbox(k, f, cx - L / 2, y, cz - 0.025, cx + L / 2, y + 0.004, cz + 0.025, W.tape, { occlude: false });
    if (w.chance(0.5)) pbox(k, f, cx - 0.025, y + 0.002, cz - L / 2, cx + 0.025, y + 0.006, cz + L / 2, W.tape, { occlude: false });
  }
  return true;
}

/** Lace antimacassar draped over a chair back top edge (frame coords; back top at y, back plane at z0..z1). */
export function antimacassar(k: Kit, f: Frame, x0: number, x1: number, y: number, z0: number, z1: number) {
  if (k.grade < 3) return;
  pbox(k, f, x0, y, z0 - 0.005, x1, y + 0.006, z1 + 0.005, W.lace, { occlude: false });
  pbox(k, f, x0, y - 0.22, z0 - 0.011, x1, y, z0 - 0.005, W.lace, { occlude: false });
}

/** Tablecloth (kept/pristine) or table clutter (worn/derelict) on a table top at y, frame-local rect. */
export function tableDressing(k: Kit, f: Frame, w: number, d: number, y: number) {
  const g = k.grade, r = k.wr;
  if (g >= 3 && w >= 0.55 && d >= 0.55) {
    pbox(k, f, -w / 2 - 0.04, y, -d / 2 - 0.04, w / 2 + 0.04, y + 0.006, d / 2 + 0.04, W.linen, { occlude: false });
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (sz) pbox(k, f, -w / 2 - 0.04, y - 0.18, sz * (d / 2 + 0.04) - 0.003, w / 2 + 0.04, y + 0.006, sz * (d / 2 + 0.04) + 0.003, W.linen, { occlude: false });
      else pbox(k, f, sx * (w / 2 + 0.04) - 0.003, y - 0.18, -d / 2 - 0.04, sx * (w / 2 + 0.04) + 0.003, y + 0.006, d / 2 + 0.04, W.linen, { occlude: false });
    }
    if (g >= 4 || r.chance(0.4)) { // bud vase with a stem or two
      pcyl(k, f, 0, y + 0.006, 0, 0.035, 0.16, M.glass, 8, { r1: 0.025 });
      pcyl(k, f, 0.01, y + 0.16, 0, 0.03, 0.05, r.pick(W.flower), 6);
    }
    return;
  }
  if (g <= 1 && r.chance(g === 0 ? 0.8 : 0.65)) {
    // a glass ashtray of butts, and a folded paper or a coffee cup
    const ax = r.range(-w / 2 + 0.12, w / 2 - 0.12), az = r.range(-d / 2 + 0.12, d / 2 - 0.12);
    pcyl(k, f, ax, y, az, 0.07, 0.025, M.glass, 8);
    for (let q = 0; q < 4; q++) pcyl(k, f, ax + r.range(-0.04, 0.04), y + 0.02, az + r.range(-0.04, 0.04), 0.006, 0.012, W.stuffing, 4);
    if (r.chance(0.6)) pbox(k, f, -w / 2 + 0.06, y, -0.12, -w / 2 + 0.4, y + 0.01, 0.12, M.newsprint, { occlude: false });
    else pcyl(k, f, -ax * 0.6, y, -az * 0.6, 0.04, 0.09, M.porcelain, 8);
  } else if (g === 2 && r.chance(0.25)) pcyl(k, f, r.range(-w / 4, w / 4), y, r.range(-d / 4, d / 4), 0.04, 0.09, M.porcelain, 8);
}

/** Mismatched replacement seat material for worn/derelict rooms (the chair somebody dragged in). */
export function mismatch(k: Kit, mat: Mat): Mat {
  if (k.grade >= 2 || !k.wr.chance(k.grade === 0 ? 0.4 : 0.28)) return mat;
  return k.wr.pick([M.vinylGreen, M.vinylBrown, M.vinylOrange, M.wood, tint(M.vinylRed, '#6a3a2a'), M.fabricOlive]);
}

/** A chair lying on its back, legs toward -z of the frame (derelict / after a fight). */
export function fallenChair(k: Kit, f: Frame, mat: Mat = M.wood) {
  pbox(k, f, -0.22, 0, 0.0, 0.22, 0.04, 0.44, mat, { occlude: false });                  // back, flat on the floor
  pbox(k, f, -0.23, 0, -0.04, 0.23, 0.46, 0.0, mat, { occlude: false });                 // seat, standing on edge
  for (const lx of [-0.2, 0.2]) for (const ly of [0.06, 0.42]) pbox(k, f, lx - 0.02, ly - 0.02, -0.49, lx + 0.02, ly + 0.02, -0.04, mat, { occlude: false });
  const [wx, wz] = toWorld(f, 0, 0); k.collider({ c: [wx, 0.2, wz], h: [0.24, 0.2, 0.3], yaw: f.yaw });
}

// ---------------------------------------------------------------- room dressing post-pass

type Box6 = [number, number, number, number, number, number];
interface Cand { x0: number; z0: number; x1: number; z1: number }

/** Is the floor rect free of occluders, colliders, door swings and portals in this cell's floor band? */
function free(k: Kit, cell: number, fy: number, q: Cand, doorPad = 1.1): boolean {
  const hit = (b: Box6) => b[0] < q.x1 && b[3] > q.x0 && b[2] < q.z1 && b[5] > q.z0 && b[1] < fy + 1.2 && b[4] > fy + 0.02;
  for (const o of k.occluders) if (hit(o as Box6)) return false;
  for (const c of k.colliders) {
    const r = Math.abs(c.h[0] * Math.cos(c.yaw)) + Math.abs(c.h[2] * Math.sin(c.yaw)), s = Math.abs(c.h[0] * Math.sin(c.yaw)) + Math.abs(c.h[2] * Math.cos(c.yaw));
    if (c.h[0] > 6 || c.h[2] > 6) continue; // walls / floors are not furniture
    if (hit([c.c[0] - r, c.c[1] - c.h[1], c.c[2] - s, c.c[0] + r, c.c[1] + c.h[1], c.c[2] + s])) return false;
  }
  const cx = (q.x0 + q.x1) / 2, cz = (q.z0 + q.z1) / 2;
  for (const d of k.doors) if (Math.abs(d.hinge[1] - fy) < 1.5 && Math.hypot(d.hinge[0] - cx, d.hinge[2] - cz) < d.w + doorPad) return false;
  for (const p of k.portals) {
    if (p.a !== cell && p.b !== cell) continue;
    const ys = p.pts.map((v) => v[1]);
    if (Math.min(...ys) > fy + 1.5 || Math.max(...ys) < fy) continue;
    const px = p.pts.reduce((s, v) => s + v[0], 0) / p.pts.length, pz = p.pts.reduce((s, v) => s + v[2], 0) / p.pts.length;
    const half = Math.max(...p.pts.map((v) => Math.hypot(v[0] - px, v[2] - pz)));
    if (Math.hypot(px - cx, pz - cz) < half + 0.8) return false;
  }
  return true;
}

/** Find a free spot hugging a wall of the cell box. Returns frame (z axis pointing away from the wall into the room). */
function wallSpot(k: Kit, cell: number, b: Box6, w: number, d: number, tries = 14): Frame | null {
  const r = k.wr, fy = b[1], ins = 0.06;
  for (let t = 0; t < tries; t++) {
    const side = r.int(0, 3);
    let q: Cand, f: Frame;
    if (side === 0 || side === 2) {
      if (b[3] - b[0] < w + 0.4) continue;
      const x = r.range(b[0] + w / 2 + 0.15, b[3] - w / 2 - 0.15);
      const z = side === 0 ? b[2] + ins + d / 2 : b[5] - ins - d / 2;
      q = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }; f = { x, z, yaw: side === 0 ? Math.PI : 0 };
    } else {
      if (b[5] - b[2] < w + 0.4) continue;
      const z = r.range(b[2] + w / 2 + 0.15, b[5] - w / 2 - 0.15);
      const x = side === 1 ? b[3] - ins - d / 2 : b[0] + ins + d / 2;
      q = { x0: x - d / 2, x1: x + d / 2, z0: z - w / 2, z1: z + w / 2 }; f = { x, z, yaw: side === 1 ? -Math.PI / 2 : Math.PI / 2 };
    }
    if (free(k, cell, fy, q)) { k.occluders.push([q.x0, fy, q.z0, q.x1, fy + 0.3, q.z1]); return f; }
  }
  return null;
}
/** Any free spot on the open floor (scattered papers, a fallen chair). */
function floorSpot(k: Kit, cell: number, b: Box6, w: number, d: number, tries = 10): Frame | null {
  const r = k.wr, fy = b[1];
  for (let t = 0; t < tries; t++) {
    if (b[3] - b[0] < w + 0.6 || b[5] - b[2] < d + 0.6) return null;
    const x = r.range(b[0] + w / 2 + 0.3, b[3] - w / 2 - 0.3), z = r.range(b[2] + d / 2 + 0.3, b[5] - d / 2 - 0.3);
    const q = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 };
    if (free(k, cell, fy, q, 0.6)) { k.occluders.push([q.x0, fy, q.z0, q.x1, fy + 0.2, q.z1]); return { x, z, yaw: r.range(0, Math.PI * 2) }; }
  }
  return null;
}

// clutter pieces, each in a wall frame (z away from the wall; the wall is at +z... the frame's -z faces the room)
function cartons(k: Kit, f: Frame) {
  const r = k.wr, n = r.int(1, 3);
  let y = 0;
  for (let q = 0; q < n; q++) { const s = r.range(0.32, 0.5), h = r.range(0.26, 0.4); const o = r.range(-0.05, 0.05); pbox(k, f, -s / 2 + o, y, -s / 2 + o, s / 2 + o, y + h, s / 2 + o, q % 2 ? tint(W.cardboard, '#8a7050') : W.cardboard, { collide: q === 0 }); y += h; if (r.chance(0.4)) break; }
}
function paperStack(k: Kit, f: Frame) { const h = k.wr.range(0.1, 0.45); pbox(k, f, -0.2, 0, -0.15, 0.2, h, 0.15, M.newsprint, { collide: h > 0.3 }); pbox(k, f, -0.21, h, -0.16, 0.19, h + 0.01, 0.14, M.newsprint); }
function bottles(k: Kit, f: Frame) {
  const r = k.wr, n = r.int(2, 5);
  for (let q = 0; q < n; q++) {
    const [x, z] = toWorld(f, r.range(-0.25, 0.25), r.range(-0.15, 0.15)), m = r.chance(0.5) ? W.bottleGreen : W.bottleBrown;
    if (r.chance(0.3)) k.obox(x, 0.035, z, 0.12, 0.035, 0.035, r.range(0, 3), m); // lying down
    else { k.cyl(x, 0, z, 0.035, 0.2, m, 6); k.cyl(x, 0.2, z, 0.035, 0.08, m, 6, { r1: 0.013 }); }
  }
}
function mopBucket(k: Kit, f: Frame) {
  const [x, z] = toWorld(f, 0, 0);
  k.cyl(x, 0, z, 0.17, 0.3, M.paintGrey, 10, { collide: true }); k.cyl(x, 0.29, z, 0.165, 0.01, tint(M.paintGrey, '#4a463c'), 10);
  const [hx, hz] = toWorld(f, 0.05, 0.12); k.tube([hx, 0.05, hz], [hx + 0.02, 1.4, hz + 0.02], 0.014, M.wood, 6);
}
function trashBag(k: Kit, f: Frame) { const [x, z] = toWorld(f, 0, 0); k.cyl(x, 0, z, 0.26, 0.45, W.trashBag, 9, { r1: 0.18 }); k.cyl(x, 0.45, z, 0.08, 0.1, W.trashBag, 6, { r1: 0.02 }); }
function mattress(k: Kit, f: Frame) { pbox(k, f, -0.45, 0, -0.95, 0.45, 0.16, 0.95, W.ticking, { collide: true }); }
function plywood(k: Kit, f: Frame) { const [x, z] = toWorld(f, 0, 0.02); k.obox(x, 0.9, z, 0.55, 0.9, 0.01, f.yaw, W.plywood, { collide: true }); }
function plant(k: Kit, f: Frame, tall: boolean) {
  const r = k.wr, [x, z] = toWorld(f, 0, 0), dead = k.grade <= 1;
  k.cyl(x, 0, z, 0.17, 0.32, W.terracotta, 10, { r1: 0.21, collide: true });
  k.cyl(x, 0.3, z, 0.19, 0.01, M.paintBrown, 10);
  const h = tall ? r.range(1.0, 1.4) : r.range(0.5, 0.8), n = tall ? 14 : 9, leaf = dead ? W.deadLeaf : W.leaf;
  k.cyl(x, 0.3, z, 0.02, h * 0.7, M.woodDark, 5, { top: false });
  // arching fronds (two tube segments: up-and-out, then out-and-down), drooping flat when dead
  for (let q = 0; q < n; q++) {
    const a = (q / n) * Math.PI * 2 + r.range(-0.3, 0.3), L = r.range(0.35, 0.6) * (tall ? 1 : 0.7);
    const y0 = 0.3 + h * r.range(0.55, 0.8), ca = Math.cos(a), sa = Math.sin(a);
    const mid: [number, number, number] = [x + ca * L * 0.45, y0 + (dead ? 0.02 : L * 0.35), z + sa * L * 0.45];
    const tip: [number, number, number] = [x + ca * L, y0 - (dead ? L * 0.5 : L * 0.05), z + sa * L];
    k.tube([x, y0, z], mid, 0.04, leaf, 5); k.tube(mid, tip, 0.03, leaf, 5);
  }
}
function rug(k: Kit, b: Box6) {
  const w = Math.min(3.2, (b[3] - b[0]) * 0.55), d = Math.min(2.3, (b[5] - b[2]) * 0.5);
  if (w < 1.2 || d < 0.9) return;
  const cx = (b[0] + b[3]) / 2, cz = (b[2] + b[5]) / 2, m = k.wr.pick(W.rug);
  k.box(cx - w / 2, b[1] + 0.004, cz - d / 2, cx + w / 2, b[1] + 0.012, cz + d / 2, m, { occlude: false, faces: 8 | 1 | 2 | 16 | 32 });
}
function papersScattered(k: Kit, b: Box6, n: number) {
  for (let q = 0; q < n; q++) { const f = floorSpot(k, -1, b, 0.4, 0.3, 3); if (!f) continue; const [x, z] = toWorld(f, 0, 0); k.obox(x, b[1] + 0.003, z, k.wr.range(0.14, 0.28), 0.002, k.wr.range(0.1, 0.2), f.yaw, M.newsprint); }
}

export type DressStyle = 'home' | 'shop' | 'hall' | 'work' | 'none';

/**
 * Post-pass after a generator: adds grade clutter to every indoor cell along free wall runs and open floor.
 * `style` by cell name: homes get mattresses and rugs, halls get only small items, shops get cartons.
 */
export function dressCells(k: Kit) {
  const prev = k.cur;
  for (const c of k.cells) {
    if (c.outdoor) continue;
    const b = c.box as Box6, h = b[4] - b[1], area = (b[3] - b[0]) * (b[5] - b[2]);
    if (h > 5.5 || area < 3) continue; // stair compartments and towers span floors
    const nm = c.name.toLowerCase();
    if (/stair|bulkhead|elev|shaft|vest|bath|closet|kitchen|ladder|auditorium/.test(nm)) continue;
    const style: DressStyle = /apt|room|teddy|tenant|home|bed|living|unit|sro|\d{3,4}/.test(nm) ? 'home' : /hall|corridor|lobby|landing|^floor/.test(nm) ? 'hall' : /back|store|office|work|loft/.test(nm) ? 'work' : 'shop';
    k.use(c.id);
    const g = k.grade, n = Math.max(1, Math.round(area / 14));
    const put = (w: number, d: number, fn: (f: Frame) => void) => { const f = wallSpot(k, c.id, b, w, d); if (f) k.at(b[1], () => fn(f)); }; // clutter is built from y = 0: lift onto this cell's floor
    if (g === 0) {
      for (let q = 0; q < n; q++) {
        const pick = k.wr.int(0, 5);
        if (pick === 0) put(0.6, 0.5, (f) => cartons(k, f));
        else if (pick === 1) put(0.6, 0.35, (f) => bottles(k, f));
        else if (pick === 2) put(0.6, 0.6, (f) => trashBag(k, f));
        else if (pick === 3 && style !== 'hall') put(1.15, 0.12, (f) => plywood(k, f));
        else if (pick === 4 && style === 'home') put(1.0, 2.0, (f) => mattress(k, f));
        else put(0.45, 0.35, (f) => paperStack(k, f));
      }
      if (style !== 'hall' && k.wr.chance(0.6)) { const f = floorSpot(k, c.id, b, 0.6, 0.8); if (f) { const m = k.wr.pick([M.wood, M.woodDark, M.chrome]); k.at(b[1], () => fallenChair(k, f, m)); } }
      papersScattered(k, b, Math.round(area / 5));
    } else if (g === 1) {
      for (let q = 0; q < n; q++) {
        const pick = k.wr.int(0, 4);
        if (pick === 0) put(0.6, 0.5, (f) => cartons(k, f));
        else if (pick === 1) put(0.45, 0.35, (f) => paperStack(k, f));
        else if (pick === 2 && style !== 'home') put(0.45, 0.45, (f) => mopBucket(k, f));
        else if (pick === 3) put(0.6, 0.35, (f) => bottles(k, f));
        else put(0.6, 0.6, (f) => trashBag(k, f));
      }
      if (k.wr.chance(0.3)) papersScattered(k, b, 2);
    } else if (g === 2) {
      if (k.wr.chance(0.35)) put(0.6, 0.5, (f) => (style === 'home' || k.wr.chance(0.5) ? paperStack(k, f) : cartons(k, f)));
    } else {
      if (style === 'home' || style === 'hall') { if (style === 'home' || k.wr.chance(0.5)) rug(k, b); }
      const plants = style === 'hall' ? (k.wr.chance(g >= 4 ? 0.7 : 0.4) ? 1 : 0) : g >= 4 ? (area > 20 ? 2 : 1) : k.wr.chance(0.6) ? 1 : 0;
      for (let q = 0; q < plants; q++) put(0.5, 0.5, (f) => plant(k, f, style !== 'home' || k.wr.chance(0.4)));
    }
  }
  k.use(prev);
}
