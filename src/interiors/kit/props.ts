/**
 * Period prop library (1974): every prop is built from kit primitives in its own frame
 * (x right, z forward/away from the user-facing side, y up), placed at (x,z) with a yaw.
 * No modern fixtures (STYLE_GUIDE §10): incandescent and fluorescent light only, rotary
 * phones, mechanical registers, console TVs, chrome-and-vinyl seating.
 */
import { type Kit, type BoxOpts, F } from './Kit';
import { M, type Mat, tint, hex } from './materials';

export interface Frame { x: number; z: number; yaw: number }
/** Box in a prop frame (axis-aligned in the frame). */
export function pbox(k: Kit, f: Frame, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Mat, o: BoxOpts = {}) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const wx = f.x + cx * c + cz * s, wz = f.z - cx * s + cz * c;
  const q = ((f.yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  if (q < 1e-4 || Math.PI / 2 - q < 1e-4) {
    // axis aligned: use the tessellating box
    const swap = Math.abs(Math.sin(f.yaw)) > 0.5, hx = (swap ? z1 - z0 : x1 - x0) / 2, hz = (swap ? x1 - x0 : z1 - z0) / 2;
    k.box(wx - Math.abs(hx), y0, wz - Math.abs(hz), wx + Math.abs(hx), y1, wz + Math.abs(hz), mat, { ...o, faces: o.faces === undefined ? undefined : rotFaces(o.faces, f.yaw) });
  } else k.obox(wx, (y0 + y1) / 2, wz, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, f.yaw, mat, o);
}
function rotFaces(m: number, yaw: number) {
  const q = Math.round(((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 2)) % 4;
  let out = m & (F.NY | F.PY);
  // rotation by +90deg about y maps local +x -> world -z ... (x' = x c + z s, z' = -x s + z c with yaw=90: x' = z, z' = -x)
  const map = [[F.NX, F.PX, F.NZ, F.PZ], [F.PZ, F.NZ, F.NX, F.PX], [F.PX, F.NX, F.PZ, F.NZ], [F.NZ, F.PZ, F.PX, F.NX]][q];
  if (m & F.NX) out |= map[0]; if (m & F.PX) out |= map[1]; if (m & F.NZ) out |= map[2]; if (m & F.PZ) out |= map[3];
  return out;
}
export function pcyl(k: Kit, f: Frame, x: number, y: number, z: number, r: number, h: number, mat: Mat, seg = 10, o: BoxOpts & { top?: boolean; r1?: number } = {}) {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  k.cyl(f.x + x * c + z * s, y, f.z - x * s + z * c, r, h, mat, seg, o);
}
export const toWorld = (f: Frame, x: number, z: number): [number, number] => {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [f.x + x * c + z * s, f.z - x * s + z * c];
};

// ---------------------------------------------------------------- seating
export function stool(k: Kit, x: number, z: number, seat: Mat = M.vinylRed, h = 0.72) {
  k.cyl(x, 0, z, 0.2, 0.03, M.chrome, 10);
  k.cyl(x, 0.03, z, 0.035, h - 0.1, M.chrome, 6, { top: false });
  k.cyl(x, h - 0.08, z, 0.19, 0.08, seat, 12);
  k.collider({ c: [x, h / 2, z], h: [0.18, h / 2, 0.18], yaw: 0 });
}
export function chair(k: Kit, f: Frame, mat: Mat = M.wood, seat: Mat = mat) {
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) pbox(k, f, lx - 0.02, 0, lz - 0.02, lx + 0.02, 0.45, lz + 0.02, mat, { occlude: false });
  pbox(k, f, -0.23, 0.45, -0.23, 0.23, 0.49, 0.23, seat, { breakable: 'chair' });
  pbox(k, f, -0.22, 0.49, 0.19, 0.22, 0.92, 0.23, mat, { occlude: false });
  k.collider({ c: [f.x, 0.25, f.z], h: [0.22, 0.25, 0.22], yaw: f.yaw, breakable: 'chair' });
}
export function chromeChair(k: Kit, f: Frame, seat: Mat = M.vinylRed) {
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) pbox(k, f, lx - 0.012, 0, lz - 0.012, lx + 0.012, 0.44, lz + 0.012, M.chrome, { occlude: false });
  pbox(k, f, -0.22, 0.44, -0.22, 0.22, 0.5, 0.22, seat);
  pbox(k, f, -0.2, 0.58, 0.18, 0.2, 0.86, 0.24, seat, { occlude: false });
  pbox(k, f, -0.2, 0.5, 0.2, -0.18, 0.62, 0.22, M.chrome, { occlude: false }); pbox(k, f, 0.18, 0.5, 0.2, 0.2, 0.62, 0.22, M.chrome, { occlude: false });
  k.collider({ c: [f.x, 0.25, f.z], h: [0.22, 0.25, 0.22], yaw: f.yaw, breakable: 'chair' });
}
/** Diner/bar booth: two benches facing each other with a table, along local x width w (~1.2). Frame z points along the booth's length. */
export function booth(k: Kit, f: Frame, len: number, seat: Mat, table: Mat = M.formicaRed) {
  const w = 1.15;
  for (const side of [-1, 1]) {
    const z0 = side < 0 ? 0 : len - 0.55, z1 = side < 0 ? 0.55 : len;
    pbox(k, f, -w / 2, 0, z0, w / 2, 0.44, z1, M.woodDark, { collide: 'cover' });
    pbox(k, f, -w / 2 + 0.02, 0.44, z0 + 0.006, w / 2 - 0.02, 0.5, z1 - 0.006, seat, { faces: F.ALL & ~F.NY });
    const bz0 = side < 0 ? 0 : len - 0.14, bz1 = side < 0 ? 0.14 : len;
    pbox(k, f, -w / 2 + 0.004, 0.5, bz0 + (side < 0 ? 0.004 : 0), w / 2 - 0.004, 1.15, bz1 - (side < 0 ? 0 : 0.004), seat, { collide: 'cover', faces: F.ALL & ~F.NY });
    pbox(k, f, -w / 2, 1.15, bz0 - 0.01, w / 2, 1.2, bz1 + 0.01, M.woodDark, { faces: F.ALL & ~F.NY });
  }
  pbox(k, f, -w / 2 + 0.05, 0.72, 0.62, w / 2 - 0.05, 0.75, len - 0.62, table, { collide: true });
  pbox(k, f, -0.04, 0, len / 2 - 0.04, 0.04, 0.72, len / 2 + 0.04, M.chrome, { occlude: false });
  // napkin dispenser, sugar, ketchup
  pbox(k, f, -0.45, 0.75, len / 2 - 0.06, -0.33, 0.88, len / 2 + 0.06, M.chrome);
  k.cyl(toWorld(f, -0.25, len / 2)[0], 0.75, toWorld(f, -0.25, len / 2)[1], 0.03, 0.13, M.glass, 6);
  k.cyl(toWorld(f, -0.17, len / 2 + 0.03)[0], 0.75, toWorld(f, -0.17, len / 2 + 0.03)[1], 0.025, 0.17, M.paintRed, 6);
}
export function bench(k: Kit, f: Frame, len: number, mat: Mat = M.wood) {
  pbox(k, f, 0, 0.42, -0.2, len, 0.47, 0.2, mat, { collide: true });
  for (const lx of [0.1, len - 0.1]) pbox(k, f, lx - 0.04, 0, -0.18, lx + 0.04, 0.42, 0.18, mat, { occlude: false });
}
export function armchair(k: Kit, f: Frame, mat: Mat = M.fabricBrown) {
  pbox(k, f, -0.42, 0, -0.4, 0.42, 0.42, 0.4, mat, { collide: 'cover' });
  pbox(k, f, -0.42, 0.42, 0.22, 0.42, 0.95, 0.4, mat);
  pbox(k, f, -0.42, 0.42, -0.4, -0.3, 0.65, 0.22, mat); pbox(k, f, 0.3, 0.42, -0.4, 0.42, 0.65, 0.22, mat);
}
export function sofa(k: Kit, f: Frame, len = 2, mat: Mat = M.fabricPlaid) {
  pbox(k, f, -len / 2, 0.08, -0.42, len / 2, 0.44, 0.42, mat, { collide: 'cover' });
  pbox(k, f, -len / 2, 0.44, 0.2, len / 2, 0.9, 0.42, mat);
  pbox(k, f, -len / 2, 0.44, -0.42, -len / 2 + 0.16, 0.68, 0.2, mat); pbox(k, f, len / 2 - 0.16, 0.44, -0.42, len / 2, 0.68, 0.2, mat);
  for (const lx of [-len / 2 + 0.06, len / 2 - 0.06]) pbox(k, f, lx - 0.03, 0, -0.38, lx + 0.03, 0.08, 0.38, M.woodDark, { occlude: false });
}

// ---------------------------------------------------------------- tables & counters
export function table(k: Kit, f: Frame, w: number, d: number, top: Mat = M.formicaCream, h = 0.75, legs: Mat = M.chrome) {
  pbox(k, f, -w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, top, { collide: 'cover', breakable: 'table' });
  if (w < 0.9 && d < 0.9) { pbox(k, f, -0.035, 0, -0.035, 0.035, h - 0.03, 0.035, legs, { occlude: false }); pbox(k, f, -0.25, 0, -0.25, 0.25, 0.02, 0.25, legs); }
  else for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pbox(k, f, lx * (w / 2 - 0.06) - 0.025, 0, lz * (d / 2 - 0.06) - 0.025, lx * (w / 2 - 0.06) + 0.025, h - 0.03, lz * (d / 2 - 0.06) + 0.025, legs, { occlude: false });
}
/** Long counter with a kick plate and an overhanging top; front face toward -z of the frame. */
export function counter(k: Kit, f: Frame, len: number, o: { h?: number; d?: number; top?: Mat; front?: Mat; kick?: Mat; overhang?: number } = {}) {
  const h = o.h ?? 1.0, d = o.d ?? 0.6, oh = o.overhang ?? 0.22;
  pbox(k, f, 0, 0, 0.08, len, 0.12, d, o.kick ?? M.chrome);
  pbox(k, f, 0, 0.12, 0, len, h - 0.04, d, o.front ?? M.formicaRed, { collide: 'cover' });
  pbox(k, f, -0.03, h - 0.04, -oh, len + 0.03, h, d + 0.02, o.top ?? M.formicaCream);
  pbox(k, f, -0.03, h - 0.07, -oh, len + 0.03, h - 0.04, -oh + 0.025, M.chrome, { occlude: false });
}
export function register(k: Kit, f: Frame, y: number) {
  // mechanical cash register: a stepped chrome-and-enamel body with a key bank and pop-up flags
  pbox(k, f, -0.2, y, -0.2, 0.2, y + 0.15, 0.2, M.paintGrey);
  pbox(k, f, -0.18, y + 0.15, -0.05, 0.18, y + 0.35, 0.2, M.chrome);
  pbox(k, f, -0.17, y + 0.15, -0.19, 0.17, y + 0.22, -0.05, M.black);
  pbox(k, f, -0.14, y + 0.35, 0.02, 0.14, y + 0.43, 0.08, M.sign);
  const [wx, wz] = toWorld(f, 0, 0); k.marker('register', wx, y + 0.3, wz);
}
export function payphone(k: Kit, f: Frame, label = 'payphone') {
  // wall-mounted three-slot coin phone in a shallow aluminium hood
  pbox(k, f, -0.32, 1.0, -0.02, 0.32, 1.95, 0.0, M.steel, { occlude: false });
  pbox(k, f, -0.32, 1.0, -0.32, -0.3, 1.95, 0, M.steel, { occlude: false }); pbox(k, f, 0.3, 1.0, -0.32, 0.32, 1.95, 0, M.steel, { occlude: false });
  pbox(k, f, -0.12, 1.15, -0.14, 0.12, 1.6, -0.02, M.black);
  pbox(k, f, -0.1, 1.42, -0.16, 0.1, 1.5, -0.14, M.steel);
  pbox(k, f, 0.09, 1.25, -0.2, 0.14, 1.52, -0.13, M.black);
  pbox(k, f, -0.32, 0.95, -0.34, 0.32, 1.0, 0, M.steel);
  const [wx, wz] = toWorld(f, 0, -0.4); k.marker('payphone', wx, 0, wz, label);
}
export function stoolsAlong(k: Kit, x0: number, z: number, x1: number, step = 0.62, seat: Mat = M.vinylRed, h = 0.72) {
  for (let x = x0; x <= x1 + 1e-6; x += step) stool(k, x, z, seat, h);
}

// ---------------------------------------------------------------- shelving & goods
/** Wall shelving unit with procedural goods (cans, boxes, bottles) across `len`, depth d, facing -z of frame. */
export function shelves(k: Kit, f: Frame, len: number, o: { h?: number; d?: number; levels?: number; goods?: 'cans' | 'bottles' | 'boxes' | 'mixed' | 'shoes' | 'folded' | 'hardware' | 'jars'; mat?: Mat; fill?: number } = {}) {
  const h = o.h ?? 2.1, d = o.d ?? 0.4, lv = o.levels ?? 5, mat = o.mat ?? M.woodDark, goods = o.goods ?? 'mixed', fill = o.fill ?? 0.85;
  pbox(k, f, 0, 0, 0, len, h, 0.03 + d, mat, { faces: F.NZ | F.PY | F.NX | F.PX, collide: true, occlude: true });
  const r = k.rng;
  for (let l = 0; l < lv; l++) {
    const y = 0.12 + (l * (h - 0.25)) / lv;
    pbox(k, f, 0.01, y - 0.025, -0.0, len - 0.01, y, d, mat, { occlude: false });
    let x = 0.04;
    while (x < len - 0.1) {
      if (r.next() > fill) { x += r.range(0.1, 0.4); continue; }
      const kind = goods === 'mixed' ? r.pick(['cans', 'boxes', 'bottles', 'jars'] as const) : goods;
      const col = goodsColour(r.next(), kind);
      if (k.low && (kind === 'cans' || kind === 'jars' || kind === 'bottles')) {
        // Low: a row of goods becomes one block with the same silhouette height
        const n = r.int(2, 6), ww = n * (kind === 'bottles' ? 0.085 : 0.08), hh = kind === 'bottles' ? 0.27 : 0.13;
        pbox(k, f, x, y, d * 0.25, Math.min(len - 0.05, x + ww), y + hh, d * 0.7, col, { occlude: false }); x += ww + 0.02;
      } else if (kind === 'cans' || kind === 'jars') {
        const rad = kind === 'cans' ? 0.038 : 0.045, hh = kind === 'cans' ? 0.12 : 0.14, n = r.int(2, 6);
        for (let q = 0; q < n && x < len - 0.1; q++, x += rad * 2.1) { const [wx, wz] = toWorld(f, x + rad, d * 0.45); k.cyl(wx, y, wz, rad, hh, col, 7, { top: true }); }
      } else if (kind === 'bottles') {
        const n = r.int(2, 5);
        for (let q = 0; q < n && x < len - 0.1; q++, x += 0.085) { const [wx, wz] = toWorld(f, x + 0.04, d * 0.45); k.cyl(wx, y, wz, 0.036, 0.2, col, 7, { top: false, glass: col === M.glass }); k.cyl(wx, y + 0.2, wz, 0.014, 0.08, col, 5); }
      } else if (kind === 'shoes') {
        pbox(k, f, x, y, d * 0.2, x + 0.28, y + 0.1, d * 0.8, col); x += 0.32;
      } else if (kind === 'folded') {
        const hh = r.range(0.08, 0.3); pbox(k, f, x, y, d * 0.15, x + 0.36, y + hh, d * 0.9, col); x += 0.4;
      } else if (kind === 'hardware') {
        const ww = r.range(0.08, 0.3), hh = r.range(0.06, 0.25); pbox(k, f, x, y, d * 0.2, x + ww, y + hh, d * 0.85, col); x += ww + 0.03;
      } else {
        const ww = r.range(0.1, 0.32), hh = r.range(0.12, Math.min(0.34, (h - 0.25) / lv - 0.05)); pbox(k, f, x, y, d * 0.1, x + ww, y + hh, d * 0.9, col); x += ww + 0.02;
      }
    }
  }
}
const PACK = ['#b2302a', '#e3a92a', '#d8cdb4', '#3c4a63', '#6b6b3a', '#c79a3c', '#8e4a2e', '#efe3c4', '#2f5e3a', '#a44030', '#5a3326', '#d9d4c8'].map((c) => tint(M.paper, c));
const BOTTLE = ['#5a3a1a', '#2e4a2a', '#7a5a2a', '#9fb0aa', '#3a2414', '#b08a4a'].map((c) => tint(M.glass, c));
function goodsColour(r: number, kind: string): Mat {
  if (kind === 'bottles') return BOTTLE[Math.floor(r * BOTTLE.length)];
  if (kind === 'shoes') return [M.black, M.paintBrown, M.woodDark, tint(M.paper, '#7a5a3a')][Math.floor(r * 4)];
  if (kind === 'folded') return [M.fabricBrown, M.fabricRust, M.fabricCamel, M.fabricPlaid, M.fabricDenim, M.fabricOlive, M.enamelWhite][Math.floor(r * 7)];
  return PACK[Math.floor(r * PACK.length)];
}

/** Glass-fronted display case / counter (pawn, deli, bakery), goods inside. */
export function displayCase(k: Kit, f: Frame, len: number, o: { h?: number; d?: number; goods?: 'jewelry' | 'deli' | 'pastry' | 'watches' | 'candy' | 'cigars'; base?: Mat } = {}) {
  const h = o.h ?? 1.0, d = o.d ?? 0.65, base = o.base ?? M.woodDark;
  pbox(k, f, 0, 0, 0, len, 0.55, d, base, { collide: 'cover' });
  pbox(k, f, 0, 0.55, 0.02, len, 0.58, d - 0.02, M.paper);
  // glass front (sloped look via a front pane + top pane), chrome edges
  pbox(k, f, 0, 0.58, 0, len, h, 0.012, M.glass, { glass: true, occlude: false });
  pbox(k, f, 0, h - 0.012, 0, len, h, d, M.glass, { glass: true, occlude: false });
  pbox(k, f, 0, 0.58, d - 0.04, len, h, d, base, { occlude: false });
  for (const x of [0, len - 0.03]) pbox(k, f, x, 0.55, 0, x + 0.03, h, d, M.chrome, { occlude: false });
  k.collider({ c: [toWorld(f, len / 2, d / 2)[0], h / 2, toWorld(f, len / 2, d / 2)[1]], h: [len / 2, h / 2, d / 2], yaw: f.yaw, cover: true, breakable: 'glass' });
  const r = k.rng, g = o.goods ?? 'jewelry';
  for (let x = 0.08; x < len - 0.12; x += r.range(0.12, 0.28)) {
    if (g === 'deli') { pbox(k, f, x, 0.58, 0.15, x + 0.22, 0.58 + r.range(0.06, 0.16), 0.5, r.pick([tint(M.paper, '#b0574a'), tint(M.paper, '#c9a27a'), tint(M.paper, '#e8d7b0'), tint(M.paper, '#8a4a3a')])); x += 0.12; }
    else if (g === 'pastry') { const [wx, wz] = toWorld(f, x + 0.1, 0.32); k.cyl(wx, 0.58, wz, 0.1, 0.06, r.pick([tint(M.paper, '#c99a5a'), tint(M.paper, '#e0c9a0'), tint(M.paper, '#7a3a2a')]), 10); }
    else if (g === 'candy' || g === 'cigars') { pbox(k, f, x, 0.58, 0.1, x + 0.16, 0.62, 0.55, r.pick(PACK)); }
    else { pbox(k, f, x, 0.58, 0.2, x + 0.1, 0.6, 0.35, r.pick([M.chrome, tint(M.chrome, '#c9a24a'), M.black])); }
  }
}

// ---------------------------------------------------------------- light fixtures (emissive geometry + bake light)
export function pendant(k: Kit, x: number, z: number, ceil: number, drop = 0.7, intensity = 2.2, shade: Mat = M.enamelCream) {
  k.cyl(x, ceil - drop + 0.18, z, 0.008, drop - 0.18, M.black, 4, { top: false });
  k.cyl(x, ceil - drop, z, 0.22, 0.18, shade, 12, { top: true, r1: 0.06 });
  k.cyl(x, ceil - drop - 0.005, z, 0.06, 0.04, M.bulb, 8);
  k.light(x, ceil - drop - 0.08, z, [1.0, 0.78, 0.5], intensity, 'bulb');
}
export function globeLight(k: Kit, x: number, z: number, ceil: number, intensity = 2.0) {
  k.cyl(x, ceil - 0.06, z, 0.12, 0.06, M.chrome, 10);
  k.cyl(x, ceil - 0.36, z, 0.14, 0.3, M.bulb, 10, { r1: 0.12 });
  k.light(x, ceil - 0.3, z, [1.0, 0.8, 0.55], intensity, 'bulb');
}
export function bareBulb(k: Kit, x: number, z: number, ceil: number, intensity = 1.2) {
  k.cyl(x, ceil - 0.08, z, 0.05, 0.08, M.porcelain, 8);
  k.cyl(x, ceil - 0.17, z, 0.035, 0.09, M.bulb, 8);
  k.light(x, ceil - 0.15, z, [1.0, 0.74, 0.45], intensity, 'bulb');
}
/** Two-tube fluorescent fixture (along x), cool-white with a slight green cast (period tubes). */
export function fluorescent(k: Kit, x: number, z: number, ceil: number, len = 1.22, intensity = 2.4, yaw = 0, flicker = 0) {
  const f: Frame = { x, z, yaw };
  pbox(k, f, -len / 2, ceil - 0.08, -0.15, len / 2, ceil, 0.15, M.enamelWhite, { occlude: false });
  pbox(k, f, -len / 2 + 0.04, ceil - 0.1, -0.1, len / 2 - 0.04, ceil - 0.08, -0.04, M.tube, { occlude: false });
  pbox(k, f, -len / 2 + 0.04, ceil - 0.1, 0.04, len / 2 - 0.04, ceil - 0.08, 0.1, M.tube, { occlude: false });
  if (Math.abs(Math.sin(yaw)) > 0.5) { k.light(x, ceil - 0.15, z - len * 0.3, [0.86, 0.95, 0.88], intensity / 2, 'bulb', flicker); k.light(x, ceil - 0.15, z + len * 0.3, [0.86, 0.95, 0.88], intensity / 2, 'bulb', flicker); }
  else k.light(x, ceil - 0.15, z, [0.86, 0.95, 0.88], intensity, 'tube', flicker);
}
/** Crystal-and-brass chandelier (pristine grade): a ring of candle bulbs and drops. */
export function chandelier(k: Kit, x: number, z: number, ceil: number, intensity = 3.0) {
  const brass = tint(M.chrome, '#b08a4a');
  k.cyl(x, ceil - 0.5, z, 0.012, 0.5, brass, 4, { top: false });
  k.cyl(x, ceil - 0.75, z, 0.08, 0.25, brass, 8, { r1: 0.04 });
  for (let a = 0; a < 6; a++) { const ca = Math.cos(a * 1.047) * 0.38, sa = Math.sin(a * 1.047) * 0.38; k.cyl(x + ca, ceil - 0.8, z + sa, 0.02, 0.05, brass, 6); k.cyl(x + ca, ceil - 0.75, z + sa, 0.025, 0.08, M.bulb, 6); k.cyl(x + ca * 0.8, ceil - 0.95, z + sa * 0.8, 0.012, 0.14, M.glass, 4, { glass: true }); }
  k.cyl(x, ceil - 0.82, z, 0.4, 0.015, brass, 16, { top: false });
  k.light(x, ceil - 0.8, z, [1.0, 0.82, 0.58], intensity, 'bulb');
}
export function ceilingFan(k: Kit, x: number, z: number, ceil: number) {
  k.cyl(x, ceil - 0.35, z, 0.015, 0.35, M.woodDark, 5, { top: false });
  k.cyl(x, ceil - 0.48, z, 0.1, 0.13, M.woodDark, 10);
  for (let b = 0; b < 4; b++) k.obox(x + Math.cos(b * Math.PI / 2 + 0.3) * 0.42, ceil - 0.44, z + Math.sin(b * Math.PI / 2 + 0.3) * 0.42, 0.36, 0.008, 0.07, -(b * Math.PI / 2 + 0.3), M.wood);
}
/** Neon sign facing the street, inside the display window: emissive tubes + light baked into the room. */
export function neonSign(k: Kit, x: number, y: number, z: number, w: number, mat: Mat = M.neonRed, facing: 1 | -1 = -1) {
  const r = k.rng, t = 0.012;
  // backing frame and a script-like zigzag of tube segments
  k.box(x - w / 2, y - 0.02, z, x + w / 2, y + 0.02, z + 0.02, M.black, { occlude: false });
  let px = x - w / 2 + 0.05, py = y + 0.15;
  while (px < x + w / 2 - 0.08) {
    const nx = px + r.range(0.04, 0.12), ny = y + 0.05 + r.range(0, 0.25);
    const L = Math.hypot(nx - px, ny - py), a = Math.atan2(ny - py, nx - px);
    k.quad([px, py, z - 0.03 * facing], [nx - px, ny - py, 0], [-Math.sin(a) * t * 2, Math.cos(a) * t * 2, 0], [0, 0, facing], mat, { tess: 9 });
    k.quad([px, py, z - 0.03 * facing], [nx - px, ny - py, 0], [-Math.sin(a) * t * 2, Math.cos(a) * t * 2, 0], [0, 0, -facing], mat, { tess: 9 });
    void L; px = nx; py = ny;
  }
  k.light(x, y + 0.15, z + 0.3, [mat.c[0], mat.c[1], mat.c[2]], 0.9, 'neon');
}

// ---------------------------------------------------------------- appliances & fixtures
export function radiator(k: Kit, f: Frame, len = 0.9) {
  for (let x = 0; x < len; x += 0.07) pbox(k, f, x, 0.08, 0, x + 0.05, 0.7, 0.18, M.enamelCream, { occlude: false });
  pbox(k, f, 0, 0, 0.02, len, 0.08, 0.16, M.enamelCream, { occlude: false });
}
export function cigaretteMachine(k: Kit, f: Frame) {
  pbox(k, f, -0.35, 0, -0.25, 0.35, 1.6, 0.25, M.paintRed, { collide: 'cover' });
  pbox(k, f, -0.3, 0.75, -0.26, 0.3, 1.45, -0.25, M.glass, { glass: true, occlude: false });
  for (let c = 0; c < 8; c++) pbox(k, f, -0.28 + c * 0.07, 0.62, -0.28, -0.24 + c * 0.07, 0.7, -0.25, M.chrome, { occlude: false });
}
export function jukebox(k: Kit, f: Frame) {
  pbox(k, f, -0.42, 0, -0.3, 0.42, 1.0, 0.3, M.woodDark, { collide: 'cover' });
  pbox(k, f, -0.42, 1.0, -0.2, 0.42, 1.45, 0.3, M.chrome);
  pbox(k, f, -0.36, 0.6, -0.31, 0.36, 0.95, -0.3, tint(M.neonPink, '#ffb070', { e: 1.2 }), { occlude: false });
  pbox(k, f, -0.3, 1.05, -0.21, 0.3, 1.38, -0.2, M.glass, { glass: true, occlude: false });
  const [wx, wz] = toWorld(f, 0, -0.5); k.light(wx, 0.9, wz, [1.0, 0.6, 0.35], 0.5, 'neon');
}
export function cooler(k: Kit, f: Frame, len: number, o: { h?: number; goods?: 'beer' | 'soda' | 'milk' } = {}) {
  const h = o.h ?? 1.9;
  pbox(k, f, 0, 0, 0, len, h, 0.7, M.enamelWhite, { collide: true, faces: F.ALL });
  const doors = Math.max(1, Math.round(len / 0.75));
  for (let d = 0; d < doors; d++) {
    const x0 = (d * len) / doors + 0.05, x1 = ((d + 1) * len) / doors - 0.05;
    pbox(k, f, x0, 0.25, -0.012, x1, h - 0.25, 0, M.glass, { glass: true, occlude: false });
    pbox(k, f, x1 - 0.06, 0.9, -0.05, x1 - 0.04, 1.3, -0.012, M.chrome, { occlude: false });
    for (let l = 0; l < 4; l++) for (let x = x0 + 0.04; x < x1 - 0.05; x += 0.08) {
      const [wx, wz] = toWorld(f, x, 0.15);
      k.cyl(wx, 0.3 + l * 0.33, wz, 0.032, 0.22, k.rng.pick(o.goods === 'milk' ? [M.enamelWhite, M.paper] : [tint(M.glass, '#5a3a1a'), tint(M.glass, '#2e4a2a'), M.paintRed, tint(M.paper, '#e3a92a')]), 6, { top: false });
    }
  }
  pbox(k, f, 0.02, h - 0.22, -0.01, len - 0.02, h - 0.04, 0, tint(M.tube, '#ffffff', { e: 1.0 }), { occlude: false });
  const [wx, wz] = toWorld(f, len / 2, -0.4); k.light(wx, h - 0.2, wz, [0.85, 0.95, 0.95], 0.7, 'bulb');
}
export function sink(k: Kit, f: Frame) {
  pbox(k, f, -0.3, 0.7, -0.25, 0.3, 0.85, 0.22, M.porcelain);
  pbox(k, f, -0.04, 0, 0.0, 0.04, 0.7, 0.08, M.porcelain, { occlude: false });
  pbox(k, f, -0.03, 0.85, 0.12, 0.03, 1.0, 0.16, M.chrome, { occlude: false });
}
export function mirror(k: Kit, f: Frame, w: number, h: number, y: number) {
  pbox(k, f, -w / 2 - 0.04, y - 0.04, 0.0, w / 2 + 0.04, y + h + 0.04, 0.03, M.woodDark, { occlude: false });
  pbox(k, f, -w / 2, y, -0.005, w / 2, y + h, 0.0, M.mirror, { occlude: false });
}
export function wallClock(k: Kit, x: number, y: number, z: number, nx: number, nz: number) {
  const f: Frame = { x: x + nx * 0.02, z: z + nz * 0.02, yaw: Math.atan2(-nx, -nz) };
  pbox(k, f, -0.17, y - 0.17, -0.02, 0.17, y + 0.17, 0.02, M.enamelWhite, { occlude: false });
  pbox(k, f, -0.01, y, -0.025, 0.01, y + 0.12, -0.02, M.black, { occlude: false });
  pbox(k, f, -0.09, y - 0.01, -0.026, 0.0, y + 0.01, -0.02, M.black, { occlude: false });
}
export function trashCan(k: Kit, x: number, z: number) { k.cyl(x, 0, z, 0.22, 0.65, M.steel, 10, { top: false, collide: true }); }
export function coatRack(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.2, 0.03, M.woodDark, 8); k.cyl(x, 0.03, z, 0.025, 1.7, M.woodDark, 6);
  for (let a = 0; a < 4; a++) k.obox(x + Math.cos(a * 1.57) * 0.12, 1.65, z + Math.sin(a * 1.57) * 0.12, 0.12, 0.012, 0.012, -a * 1.57, M.woodDark);
  if (k.rng.chance(0.6)) k.obox(x + 0.12, 1.2, z, 0.06, 0.45, 0.22, 0, k.rng.pick([M.fabricCamel, M.fabricBrown, M.fabricPlaid]));
}
export function consoleTV(k: Kit, f: Frame, on: boolean) {
  pbox(k, f, -0.5, 0.08, -0.25, 0.5, 0.75, 0.25, M.wood, { collide: 'cover' });
  for (const lx of [-0.45, 0.45]) pbox(k, f, lx - 0.02, 0, -0.2, lx + 0.02, 0.08, 0.2, M.woodDark, { occlude: false });
  pbox(k, f, -0.3, 0.25, -0.26, 0.2, 0.68, -0.25, on ? M.tvGlow : tint(M.glass, '#2a3230'), { occlude: false });
  pbox(k, f, 0.25, 0.3, -0.26, 0.42, 0.65, -0.25, M.fabricBrown, { occlude: false });
  if (on) { const [wx, wz] = toWorld(f, -0.05, -0.9); k.light(wx, 0.5, wz, [0.6, 0.75, 1.0], 0.35, 'neon', 2); }
}
export function bed(k: Kit, f: Frame, w = 1.35, len = 1.95, spread: Mat = M.fabricRust) {
  pbox(k, f, -w / 2, 0, 0, w / 2, 0.35, len, M.steel, { collide: 'cover' });
  pbox(k, f, -w / 2 + 0.02, 0.35, 0.02, w / 2 - 0.02, 0.55, len - 0.02, spread);
  pbox(k, f, -w / 2 + 0.1, 0.55, 0.05, w / 2 - 0.1, 0.65, 0.4, M.enamelWhite);
  pbox(k, f, -w / 2, 0, -0.04, w / 2, 1.05, 0.0, M.steel, { occlude: false });
}
export function dresser(k: Kit, f: Frame, w = 1.0) {
  pbox(k, f, -w / 2, 0, 0, w / 2, 0.95, 0.48, M.wood, { collide: 'cover' });
  for (let d = 0; d < 3; d++) pbox(k, f, -w / 2 + 0.04, 0.08 + d * 0.29, -0.01, w / 2 - 0.04, 0.33 + d * 0.29, 0, M.woodDark, { occlude: false });
}
export function fileCabinet(k: Kit, f: Frame) {
  pbox(k, f, -0.23, 0, 0, 0.23, 1.32, 0.66, M.paintGrey, { collide: 'cover' });
  for (let d = 0; d < 4; d++) pbox(k, f, -0.2, 0.06 + d * 0.32, -0.01, 0.2, 0.34 + d * 0.32, 0, M.steel, { occlude: false });
}
export function desk(k: Kit, f: Frame, w = 1.5, d = 0.75, mat: Mat = M.steel, props = true) {
  pbox(k, f, -w / 2, 0.72, 0, w / 2, 0.76, d, mat === M.steel ? M.formicaCream : mat, { collide: 'cover', breakable: 'table' });
  pbox(k, f, -w / 2, 0, 0.02, -w / 2 + 0.42, 0.72, d - 0.02, mat, { occlude: true });
  pbox(k, f, w / 2 - 0.05, 0, 0.02, w / 2, 0.72, d - 0.02, mat, { occlude: false });
  pbox(k, f, -w / 2 + 0.42, 0.3, d - 0.03, w / 2 - 0.05, 0.72, d - 0.01, mat, { occlude: false });
  if (!props) return;
  const r = k.rng;
  // rotary phone, blotter, typewriter or papers, ashtray
  pbox(k, f, w / 2 - 0.35, 0.76, 0.1, w / 2 - 0.12, 0.86, 0.32, M.black);
  pbox(k, f, -0.3, 0.76, 0.15, 0.3, 0.765, 0.55, tint(M.paper, '#4a6a4a'));
  if (r.chance(0.6)) { pbox(k, f, -0.24, 0.76, 0.12, 0.24, 0.88, 0.45, M.paintGrey); pbox(k, f, -0.2, 0.88, 0.38, 0.2, 0.98, 0.42, M.black); }
  else for (let q = 0; q < r.int(1, 4); q++) pbox(k, f, -0.5 + q * 0.12, 0.76, 0.1, -0.28 + q * 0.12, 0.77 + r.range(0, 0.06), 0.4, M.paper);
  k.cyl(toWorld(f, -w / 2 + 0.2, 0.2)[0], 0.76, toWorld(f, -w / 2 + 0.2, 0.2)[1], 0.06, 0.025, M.glass, 8);
}
export function mailboxes(k: Kit, f: Frame, cols: number, rows: number) {
  pbox(k, f, 0, 1.0, 0, cols * 0.14 + 0.06, 1.0 + rows * 0.16 + 0.06, 0.06, tint(M.chrome, '#b08a4a'), { occlude: false });
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) pbox(k, f, 0.04 + c * 0.14, 1.04 + r * 0.16, -0.005, 0.15 + c * 0.14, 1.17 + r * 0.16, 0, tint(M.chrome, '#8a6a3a'), { occlude: false });
}
export function elevatorDoors(k: Kit, f: Frame, w = 1.1, h = 2.2, mat: Mat = tint(M.chrome, '#8a7a5a'), indicator = true) {
  pbox(k, f, -w / 2 - 0.15, 0, -0.05, w / 2 + 0.15, h + 0.18, 0, M.marble, { occlude: false });
  pbox(k, f, -w / 2, 0, -0.06, 0, h, -0.05, mat, { occlude: false }); pbox(k, f, 0.003, 0, -0.06, w / 2, h, -0.05, mat, { occlude: false });
  if (indicator) { pbox(k, f, -0.35, h + 0.22, -0.07, 0.35, h + 0.4, -0.05, tint(M.chrome, '#b08a4a'), { occlude: false }); pbox(k, f, -0.3, h + 0.25, -0.075, 0.3, h + 0.37, -0.07, tint(M.bulb, '#ffb060', { e: 0.8 }), { occlude: false }); }
  pbox(k, f, w / 2 + 0.25, 1.05, -0.07, w / 2 + 0.33, 1.25, -0.05, tint(M.chrome, '#b08a4a'), { occlude: false });
  k.collider({ c: [toWorld(f, 0, -0.03)[0], h / 2, toWorld(f, 0, -0.03)[1]], h: [w / 2 + 0.15, h / 2, 0.06], yaw: f.yaw });
}
export function poolTable(k: Kit, f: Frame) {
  const w = 1.4, l = 2.6;
  pbox(k, f, -w / 2, 0.62, -l / 2, w / 2, 0.8, l / 2, M.woodDark, { collide: 'cover' });
  pbox(k, f, -w / 2 + 0.12, 0.8, -l / 2 + 0.12, w / 2 - 0.12, 0.81, l / 2 - 0.12, M.baize);
  for (const [sx, sz, sw, sd] of [[-w / 2, -l / 2, w, 0.12], [-w / 2, l / 2 - 0.12, w, 0.12], [-w / 2, -l / 2, 0.12, l], [w / 2 - 0.12, -l / 2, 0.12, l]]) pbox(k, f, sx, 0.8, sz, sx + sw, 0.86, sz + sd, M.woodDark);
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pbox(k, f, lx * 0.55 - 0.07, 0, lz * 1.15 - 0.07, lx * 0.55 + 0.07, 0.62, lz * 1.15 + 0.07, M.woodDark, { occlude: false });
  const r = k.rng; for (let b = 0; b < r.int(3, 9); b++) { const [wx, wz] = toWorld(f, r.range(-0.5, 0.5), r.range(-1.1, 1.1)); k.cyl(wx, 0.81, wz, 0.028, 0.055, r.pick([M.enamelWhite, M.paintRed, tint(M.paper, '#e3a92a'), M.black, tint(M.paper, '#3c4a63')]), 6); }
}
export function rollingRack(k: Kit, f: Frame, len = 1.5, fill = 0.85) {
  for (const x of [0, len]) { pbox(k, f, x - 0.015, 0.1, -0.015, x + 0.015, 1.7, 0.015, M.chrome, { occlude: false }); pbox(k, f, x - 0.02, 0, -0.3, x + 0.02, 0.1, 0.3, M.chrome, { occlude: false }); }
  pbox(k, f, 0, 1.68, -0.015, len, 1.71, 0.015, M.chrome, { occlude: false });
  const r = k.rng, col = r.pick([M.fabricCamel, M.fabricRust, M.fabricBrown, M.fabricPlaid, M.fabricDenim, M.fabricOlive, tint(M.fabricBrown, '#c9b48a'), tint(M.fabricBrown, '#2a2a3a')]);
  for (let x = 0.05; x < len - 0.04; x += 0.05) if (r.next() < fill) pbox(k, f, x, r.range(0.55, 0.9), -0.24, x + 0.035, 1.66, 0.24, r.chance(0.8) ? col : r.pick([M.fabricRust, M.paper]), { occlude: false });
  k.collider({ c: [toWorld(f, len / 2, 0)[0], 0.85, toWorld(f, len / 2, 0)[1]], h: [len / 2, 0.85, 0.28], yaw: f.yaw, cover: true });
}
export function sewingMachine(k: Kit, f: Frame) {
  table(k, f, 1.1, 0.55, M.woodLight, 0.74, M.paintGrey);
  pbox(k, f, -0.25, 0.75, -0.08, 0.2, 0.83, 0.12, M.black); pbox(k, f, 0.1, 0.83, -0.06, 0.2, 1.05, 0.1, M.black); pbox(k, f, -0.25, 0.97, -0.05, 0.2, 1.05, 0.08, M.black);
  pbox(k, f, -0.05, 0.12, 0.05, 0.25, 0.3, 0.25, M.paintGrey);
  if (k.rng.chance(0.6)) pbox(k, f, -0.45, 0.75, -0.2, -0.1, 0.78, 0.2, k.rng.pick([M.fabricRust, M.fabricCamel, M.fabricDenim]));
}
export function cuttingTable(k: Kit, f: Frame, len: number) {
  pbox(k, f, 0, 0.86, -0.75, len, 0.92, 0.75, M.woodLight, { collide: 'cover', occlude: true });
  for (let x = 0.2; x < len; x += 1.6) for (const z of [-0.65, 0.65]) pbox(k, f, x - 0.05, 0, z - 0.05, x + 0.05, 0.86, z + 0.05, M.woodDark, { occlude: false });
  // layered fabric "lay" and paper markers, shears
  const r = k.rng; const layLen = len * r.range(0.4, 0.85);
  pbox(k, f, 0.15, 0.92, -0.65, layLen, 0.92 + r.range(0.03, 0.12), 0.65, r.pick([M.fabricCamel, M.fabricDenim, M.fabricRust, M.fabricOlive, M.fabricPlaid]));
  pbox(k, f, 0.15, 0.97, -0.6, layLen * 0.9, 0.975, 0.6, M.paper, { occlude: false });
  if (r.chance(0.7)) pbox(k, f, layLen + 0.2, 0.92, -0.1, layLen + 0.55, 0.96, 0.1, M.steel);
  // bolt rolls at the end
  for (let b = 0; b < r.int(1, 4); b++) { const [wx, wz] = toWorld(f, len - 0.3, -0.5 + b * 0.32); k.obox(wx, 1.05, wz, 0.12, 0.12, 0.75, f.yaw + Math.PI / 2, r.pick([M.fabricCamel, M.fabricDenim, M.fabricRust, M.fabricOlive])); }
}
export function dressForm(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.18, 0.03, M.black, 8); k.cyl(x, 0.03, z, 0.02, 0.9, M.black, 5, { top: false });
  k.cyl(x, 0.93, z, 0.13, 0.25, M.fabricCamel, 10, { r1: 0.17 }); k.cyl(x, 1.18, z, 0.17, 0.25, M.fabricCamel, 10, { r1: 0.12 });
  k.cyl(x, 1.43, z, 0.04, 0.08, M.woodDark, 6);
}
export function barberChair(k: Kit, f: Frame) {
  k.cyl(f.x, 0, f.z, 0.28, 0.05, M.chrome, 12); k.cyl(f.x, 0.05, f.z, 0.09, 0.42, M.chrome, 8);
  pbox(k, f, -0.3, 0.47, -0.3, 0.3, 0.62, 0.3, M.vinylRed, { collide: 'cover' });
  pbox(k, f, -0.28, 0.62, 0.18, 0.28, 1.25, 0.3, M.vinylRed);
  pbox(k, f, -0.12, 1.25, 0.2, 0.12, 1.4, 0.28, M.vinylRed);
  pbox(k, f, -0.33, 0.62, -0.25, -0.27, 0.8, 0.2, M.chrome); pbox(k, f, 0.27, 0.62, -0.25, 0.33, 0.8, 0.2, M.chrome);
  pbox(k, f, -0.15, 0.2, -0.55, 0.15, 0.24, -0.35, M.chrome);
}
export function washer(k: Kit, f: Frame, dryer = false) {
  pbox(k, f, -0.33, 0, -0.35, 0.33, 0.95, 0.35, M.enamelWhite, { collide: 'cover' });
  pbox(k, f, -0.33, 0.95, 0.15, 0.33, 1.15, 0.35, M.enamelWhite);
  if (dryer) { const [wx, wz] = toWorld(f, 0, -0.36); void wx; void wz; pbox(k, f, -0.24, 0.3, -0.36, 0.24, 0.78, -0.35, M.glass, { glass: true }); }
  else pbox(k, f, -0.28, 0.951, -0.3, 0.28, 0.955, 0.1, M.steel);
  pbox(k, f, -0.2, 1.02, 0.14, 0.2, 1.1, 0.15, M.chrome, { occlude: false });
}

export { hex };
