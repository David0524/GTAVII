/**
 * Hats, glasses and hand-held props: procedural meshes bound rigidly to a joint (head or hand),
 * merged into the main draw. Generic shapes only: no brands, logos or real insignia.
 */
import type { Appearance } from '../body/appearance';
import type { HatDesc } from '../wardrobe/outfit';
import { JOINT_INDEX as JI } from '../rig';
import { PART } from './fields';
import type { FaceFrame } from './face';
import { fabricMat, lin, type GarmentCtx } from './garments';
import { KIND, MeshBuilder, type MatData } from './MeshBuilder';

export interface AccCtx extends GarmentCtx { face: FaceFrame; app: Appearance }

type V3 = [number, number, number];

/** Surface of revolution around a vertical axis: profile [radiusScale, y] (radius scales x/z half-extents). */
function lathe(mb: MeshBuilder, c: V3, rx: number, rz: number, profile: [number, number][], seg: number, m: MatData, joint: number, shape?: (a: number, r: number, y: number) => [number, number, number]) {
  const base = mb.count, i0 = mb.indexCount;
  const sj = [joint, 0, 0, 0], sw = [1, 0, 0, 0];
  for (const [r, y] of profile) for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    let px = Math.sin(a) * rx * r, pz = Math.cos(a) * rz * r, py = y;
    if (shape) { const d = shape(a, r, y); px += d[0]; py += d[1]; pz += d[2]; }
    mb.vertex([c[0] + px, c[1] + py, c[2] + pz], null, sj, sw, m, [i / seg, y]);
  }
  const w = seg + 1;
  for (let p = 0; p + 1 < profile.length; p++) for (let i = 0; i < seg; i++) {
    const a = base + p * w + i, b = a + 1, d = a + w, e = d + 1;
    mb.tri(a, d, b); mb.tri(b, d, e);
  }
  mb.computeNormals(base, mb.count, i0);
}

/** Front visor: a crescent from the hat band forward, drooping by `droop` at the tip. Double-sided. */
function visor(mb: MeshBuilder, c: V3, rx: number, rz: number, len: number, y0: number, droop: number, m: MatData, joint: number) {
  const sj = [joint, 0, 0, 0], sw = [1, 0, 0, 0];
  const seg = 12;
  for (const side of [1, -1]) {
    const base = mb.count, i0 = mb.indexCount;
    for (let i = 0; i <= seg; i++) {
      const a = -1.1 + (i / seg) * 2.2;
      const inner: V3 = [c[0] + Math.sin(a) * rx, c[1] + y0, c[2] + Math.cos(a) * rz];
      const ext = len * Math.cos(a * 1.25);
      const outer: V3 = [c[0] + Math.sin(a) * (rx + ext * 0.6), c[1] + y0 + droop * Math.max(0, Math.cos(a)) + side * 0.0015, c[2] + Math.cos(a) * (rz + ext)];
      mb.vertex(inner, null, sj, sw, m); mb.vertex(outer, null, sj, sw, m);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; if (side > 0) { mb.tri(a, a + 2, a + 1); mb.tri(a + 1, a + 2, a + 3); } else { mb.tri(a, a + 1, a + 2); mb.tri(a + 1, a + 3, a + 2); } }
    mb.computeNormals(base, mb.count, i0);
  }
}

function headExtents(ctx: AccCtx, atY: number): { hx: number; hz: number; cz: number } {
  const P = ctx.shape.pos, F = ctx.F;
  let hx = 0, zmin = 1e9, zmax = -1e9;
  for (let k = 0; k < F.n; k++) {
    if (F.part[k] !== PART.head) continue;
    if (Math.abs(P[k * 3 + 1] - atY) > 0.012) continue;
    hx = Math.max(hx, Math.abs(P[k * 3] - ctx.face.headCenter[0])); zmin = Math.min(zmin, P[k * 3 + 2]); zmax = Math.max(zmax, P[k * 3 + 2]);
  }
  if (!hx) return { hx: 0.075, hz: 0.095, cz: ctx.face.headCenter[2] };
  return { hx, hz: (zmax - zmin) / 2, cz: (zmax + zmin) / 2 };
}

export function buildAccessories(ctx: AccCtx, mb: MeshBuilder) {
  const { outfit, lod } = ctx;
  if (outfit.hat) hat(ctx, mb, outfit.hat);
  if (outfit.glasses && lod <= 2) glasses(ctx, mb);
  if (lod <= 2) for (const p of outfit.props) prop(ctx, mb, p);
}

function hat(ctx: AccCtx, mb: MeshBuilder, h: HatDesc) {
  const ff = ctx.face;
  const s = ff.eyeDist / 0.064;
  const volume = ctx.app.hair.style === 'afro' ? 0.05 : ctx.app.hair.style === 'setCurls' || ctx.app.hair.style === 'pompadour' ? 0.015 : 0.006;
  const bandY = ff.browY + 0.028 * s;
  const e = headExtents(ctx, bandY);
  const rx = e.hx + volume + 0.006, rz = e.hz + volume + 0.006;
  const c: V3 = [ff.headCenter[0], bandY, e.cz - 0.004];
  const m = fabricMat(h.fabric);
  const band = fabricMat({ ...h.fabric, color: '#2a2420', color2: '#2a2420', pattern: 'solid' });
  const J = JI.Head;
  const seg = ctx.lod === 0 ? 28 : ctx.lod === 1 ? 18 : 10;
  const tilt = (a: number, _r: number, y: number): V3 => [0, -Math.cos(a) * 0.012 * (y < 0.02 ? 1 : 0.5), 0];
  switch (h.kind) {
    case 'fedora': case 'straw': {
      const brim = h.kind === 'straw' ? 0.045 : 0.055;
      // brim (snap-brim: down at the front, up at the back)
      lathe(mb, c, rx, rz, [[1 + (brim / rx), -0.004], [1.0, 0.0], [1.0, 0.004], [1 + (brim / rx), 0.002]], seg, m, J, (a, r) => [0, (r > 1.05 ? 1 : 0) * (Math.cos(a) > 0 ? -0.012 : 0.01) * Math.abs(Math.cos(a)), 0]);
      lathe(mb, c, rx, rz, [[1.0, 0.0], [1.0, 0.03]], seg, band, J, tilt);
      lathe(mb, c, rx, rz, [[1.0, 0.03], [0.97, 0.08], [0.85, 0.11], [0.45, 0.105], [0.0, 0.09]], seg, m, J, (a, r, y) => [0, y > 0.09 ? -Math.max(0, Math.cos(a)) * 0.012 - (r < 0.6 ? 0.012 : 0) : 0, 0]);
      break;
    }
    case 'flatCap': case 'newsboy': {
      const puff = h.kind === 'newsboy' ? 1.12 : 1.02;
      lathe(mb, c, rx, rz, [[1.0, -0.005], [1.02 * puff, 0.025], [0.95 * puff, 0.05], [0.5, 0.065], [0, 0.066]], seg, m, J, (a, _r, y) => [0, 0, y > 0.02 ? Math.max(0, Math.cos(a)) * 0.03 : 0]);
      // bill
      visor(mb, c, rx, rz, 0.055, -0.002, -0.012, m, J);
      break;
    }
    case 'knit': case 'beret': {
      if (h.kind === 'beret') lathe(mb, [c[0] + 0.01, c[1] + 0.01, c[2]], rx * 1.15, rz * 1.15, [[0.92, -0.01], [1.05, 0.03], [0.6, 0.06], [0, 0.065]], seg, m, J);
      else lathe(mb, c, rx, rz, [[1.01, -0.015], [1.03, 0.03], [0.95, 0.07], [0.6, 0.11], [0, 0.12]], seg, m, J);
      break;
    }
    case 'sunHat':
      lathe(mb, c, rx, rz, [[1 + 0.095 / rx, -0.02], [1.0, 0.0], [1.0, 0.004], [1 + 0.095 / rx, -0.016]], seg, m, J);
      lathe(mb, c, rx, rz, [[1.0, 0.0], [0.95, 0.07], [0.5, 0.09], [0, 0.092]], seg, m, J);
      break;
    case 'headscarf':
      lathe(mb, [c[0], c[1] - 0.03, c[2] - 0.005], rx + 0.01, rz + 0.01, [[1.02, -0.02], [1.04, 0.03], [0.95, 0.08], [0.6, 0.12], [0, 0.13]], seg, m, J, (a, _r, y) => [0, Math.cos(a) > 0.6 && y < 0.04 ? 0.04 * (Math.cos(a) - 0.6) : 0, 0]);
      break;
    case 'policeCap': case 'peakedCap': {
      lathe(mb, c, rx, rz, [[1.0, -0.003], [1.0, 0.04]], seg, band, J, tilt);
      lathe(mb, c, rx, rz, [[1.0, 0.04], [1.18, 0.075], [1.2, 0.082], [0.6, 0.09], [0, 0.09]], seg, m, J);
      visor(mb, c, rx, rz, 0.055, -0.003, -0.02, fabricMat({ ...h.fabric, color: '#101010', color2: '#101010', rough: 0.25, sheen: 0.5 }, KIND.leather), J);
      // plain generic badge plate (no crest)
      lathe(mb, [c[0], c[1] + 0.045, c[2] + rz * 1.02], 0.012, 0.004, [[1, -0.012], [1, 0.012]], 8, { cA: lin('#a8946a'), cB: lin('#a8946a'), m0: [0, 0, 0.3, 0.8], m1: [KIND.metal, 0, 0, 0] }, J);
      break;
    }
    case 'hardHat':
      lathe(mb, c, rx + 0.012, rz + 0.012, [[1.25, -0.005], [1.2, 0.0], [1.04, 0.01], [1.02, 0.06], [0.75, 0.11], [0, 0.125]], seg, fabricMat(h.fabric, KIND.rubber), J);
      break;
  }
}

function glasses(ctx: AccCtx, mb: MeshBuilder) {
  const g = ctx.outfit.glasses!;
  const ff = ctx.face;
  const s = ff.eyeDist / 0.064;
  const J = JI.Head;
  const frameM: MatData = { cA: lin(g.frame), cB: lin(g.frame), m0: [0, 0, g.kind === 'aviator' || g.frame === '#b08a3a' || g.frame === '#9a9a98' ? 0.3 : 0.35, 0.6], m1: [g.kind === 'aviator' ? KIND.metal : KIND.leather, 0, 0, 0] };
  const lensM: MatData = { cA: lin(g.tint > 0.3 ? '#2a2a22' : '#b8c0c0'), cB: [0, 0, 0], m0: [g.tint, 0, 0.05, 0], m1: [KIND.lens, 0, 0, 0] };
  const w = 0.026 * g.scale * s, h = (g.kind === 'aviator' ? 0.024 : g.kind === 'catEye' ? 0.018 : 0.021) * g.scale * s;
  const thick = g.kind === 'horn' || g.kind === 'catEye' ? 0.0035 : 0.0016;
  const e = headExtents(ctx, ff.eyeL[1]);
  const zf = Math.max(ff.eyeL[2], ff.eyeR[2]) + 0.016 * s;
  const seg = ctx.lod === 0 ? 20 : 12;
  const sj = [J, 0, 0, 0], sw = [1, 0, 0, 0];
  for (const eye of [ff.eyeL, ff.eyeR]) {
    const cx = eye[0] + Math.sign(eye[0]) * 0.002, cy = eye[1] - 0.002;
    const pt = (a: number, grow: number): V3 => {
      let ry = h;
      if (g.kind === 'aviator') ry = h * (Math.sin(a) < 0 ? 1.15 : 0.8);
      if (g.kind === 'catEye' && Math.sin(a) > 0) ry = h * (1 + 0.35 * Math.max(0, Math.cos(a) * Math.sign(eye[0])));
      return [cx + Math.cos(a) * (w + grow), cy + Math.sin(a) * (ry + grow), zf - Math.abs(Math.cos(a)) * 0.006];
    };
    // rim as a flat ring band + lens disc
    const base = mb.count, i0 = mb.indexCount;
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; mb.vertex(pt(a, 0), null, sj, sw, frameM); mb.vertex(pt(a, thick), null, sj, sw, frameM); }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; mb.tri(a, a + 2, a + 1); mb.tri(a + 1, a + 2, a + 3); mb.tri(a, a + 1, a + 2); mb.tri(a + 1, a + 3, a + 2); }
    mb.computeNormals(base, mb.count, i0);
    // clear lenses are left out (an opaque material can't show the eye through them); tinted ones are drawn
    if (g.tint >= 0.25) {
      const lb = mb.count, li0 = mb.indexCount;
      const ctr = mb.vertex([cx, cy, zf - 0.001], [0, 0, 1], sj, sw, lensM);
      for (let i = 0; i <= seg; i++) mb.vertex(pt((i / seg) * Math.PI * 2, 0.0005), [0, 0, 1], sj, sw, lensM);
      for (let i = 0; i < seg; i++) { mb.tri(ctr, lb + 1 + i, lb + 2 + i); }
      void li0;
    }
    // temple arm back to the ear
    const side = Math.sign(eye[0]);
    const t0: V3 = [cx + side * (w + thick), cy + h * 0.3, zf - 0.006];
    const t1: V3 = [ff.headCenter[0] + side * (e.hx + 0.004), cy + 0.004, e.cz - e.hz * 0.15];
    const tb = mb.count, ti0 = mb.indexCount;
    for (const p of [t0, t1]) { mb.vertex(p, null, sj, sw, frameM); mb.vertex([p[0], p[1] - 0.004, p[2]], null, sj, sw, frameM); }
    mb.tri(tb, tb + 2, tb + 1); mb.tri(tb + 1, tb + 2, tb + 3); mb.tri(tb, tb + 1, tb + 2); mb.tri(tb + 1, tb + 3, tb + 2);
    mb.computeNormals(tb, mb.count, ti0);
  }
  // bridge
  const b0: V3 = [ff.eyeL[0] - w - 0.002, ff.eyeL[1] + h * 0.4, zf + 0.002], b1: V3 = [ff.eyeR[0] + w + 0.002, ff.eyeR[1] + h * 0.4, zf + 0.002];
  const bb = mb.count, bi0 = mb.indexCount;
  for (const p of [b0, b1]) { mb.vertex(p, null, sj, sw, frameM); mb.vertex([p[0], p[1] - thick * 1.5, p[2]], null, sj, sw, frameM); }
  mb.tri(bb, bb + 1, bb + 2); mb.tri(bb + 1, bb + 3, bb + 2); mb.tri(bb, bb + 2, bb + 1); mb.tri(bb + 1, bb + 2, bb + 3);
  mb.computeNormals(bb, mb.count, bi0);
}

/** Box helper in a joint's rest frame (axes given), rigidly skinned. */
function box(mb: MeshBuilder, c: V3, ax: V3, ay: V3, az: V3, hx: number, hy: number, hz: number, m: MatData, joint: number) {
  const sj = [joint, 0, 0, 0], sw = [1, 0, 0, 0];
  const corner = (sx: number, sy: number, sz: number): V3 => [0, 1, 2].map((i) => c[i] + ax[i] * hx * sx + ay[i] * hy * sy + az[i] * hz * sz) as V3;
  const faces: [V3, V3, V3, V3][] = [];
  const s = [-1, 1];
  for (const d of [0, 1, 2]) for (const sg of s) {
    const q: V3[] = [];
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [0, 0, 0]; p[d] = sg; p[(d + 1) % 3] = u; p[(d + 2) % 3] = v * sg; q.push(corner(p[0], p[1], p[2])); }
    faces.push(q as [V3, V3, V3, V3]);
  }
  for (const q of faces) {
    const b = mb.count, i0 = mb.indexCount;
    for (const p of q) mb.vertex(p, null, sj, sw, m);
    mb.tri(b, b + 1, b + 2); mb.tri(b, b + 2, b + 3);
    mb.computeNormals(b, mb.count, i0);
  }
}

function prop(ctx: AccCtx, mb: MeshBuilder, id: string) {
  const J = ctx.shape.joints;
  const jp = (n: string): V3 => [J[JI[n] * 3], J[JI[n] * 3 + 1], J[JI[n] * 3 + 2]];
  const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const handFrame = (side: 'l' | 'r') => {
    const h = jp(`hand_${side}`), mid = jp(`middle_01_${side}`), idx = jp(`index_01_${side}`), pk = jp(`pinky_01_${side}`);
    const along = nrm(sub(mid, h)), across = nrm(sub(idx, pk));
    const palm = nrm(cross(along, across));
    return { c: [h[0] + along[0] * 0.06, h[1] + along[1] * 0.06, h[2] + along[2] * 0.06] as V3, along, across, palm, joint: JI[`hand_${side}`] };
  };
  const paper: MatData = { cA: lin('#cfc8b4'), cB: lin('#3a3632'), m0: [0, 0.01, 0.9, 0], m1: [KIND.paper, 0.2, 0.2, 0] };
  const leather = (hex: string): MatData => ({ cA: lin(hex), cB: lin(hex), m0: [0, 0, 0.45, 0.3], m1: [KIND.leather, 0.1, 0.2, 0] });
  switch (id) {
    case 'newspaper': { // folded and tucked under the left arm, pressed to the ribs
      const sh = jp('upperarm_l'), el = jp('lowerarm_l');
      const down = nrm(sub(el, sh));
      const c: V3 = [sh[0] + down[0] * 0.13 - 0.035, sh[1] + down[1] * 0.13, sh[2] + down[2] * 0.13 + 0.01];
      box(mb, c, [0, 0, 1], down, [1, 0, 0], 0.15, 0.05, 0.007, paper, JI.upperarm_l);
      break;
    }
    case 'briefcase': {
      const f = handFrame('r');
      const down: V3 = [0, -1, 0];
      // handle in the curled fingers, the case hanging directly beneath it
      const g: V3 = [f.c[0] - f.along[0] * 0.012 + f.palm[0] * 0.016, f.c[1] - f.along[1] * 0.012 + f.palm[1] * 0.016, f.c[2] - f.along[2] * 0.012 + f.palm[2] * 0.016];
      box(mb, g, f.across, f.along, f.palm, 0.08, 0.01, 0.01, leather('#1e140e'), f.joint);
      box(mb, [g[0], g[1] - 0.035 - 0.15, g[2]], [0, 0, 1], down, [1, 0, 0], 0.21, 0.15, 0.05, leather('#3a2418'), f.joint);
      break;
    }
    case 'shoulderBag': { // over the left shoulder: strap down the side of the chest, the bag against the left hip
      const h = jp('thigh_l'), cl = jp('clavicle_l'), ua = jp('upperarm_l');
      const col = leather(ctx.app.seed % 3 === 0 ? '#6a3a22' : ctx.app.seed % 3 === 1 ? '#1e1a18' : '#c8b494');
      const bag: V3 = [h[0] + 0.115, h[1] + 0.07, h[2] + 0.015];
      box(mb, bag, [0, 0, 1], [0, 1, 0], [1, 0, 0], 0.11, 0.085, 0.035, col, JI.pelvis);
      // strap: bag top -> front of the shoulder -> over the top of the shoulder
      const pts: V3[] = [[bag[0] - 0.01, bag[1] + 0.085, bag[2] + 0.03], [ua[0] - 0.035, (ua[1] + bag[1]) / 2 + 0.06, ua[2] + 0.09], [(cl[0] + ua[0]) / 2, ua[1] + 0.06, ua[2] + 0.07], [(cl[0] + ua[0]) / 2, ua[1] + 0.085, ua[2] - 0.02]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1], d = sub(b, a), len = Math.hypot(d[0], d[1], d[2]);
        const ay = nrm(d), ax = nrm(cross(ay, [0, 0, 1])), az = cross(ax, ay);
        box(mb, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ax, ay, az, 0.016, len / 2, 0.003, leather('#2a1e16'), i === 0 ? JI.pelvis : JI.spine_03);
      }
      break;
    }
    case 'handbag': case 'tote': { // held by its handle in the left hand: handle in the curled fingers, straps down to the bag
      const f = handFrame('l');
      const big = id === 'tote';
      const hh = big ? 0.14 : 0.09, col = leather(ctx.app.seed % 3 === 0 ? '#6a3a22' : ctx.app.seed % 3 === 1 ? '#1e1a18' : '#c8b494');
      const g: V3 = [f.c[0] - f.along[0] * 0.012 + f.palm[0] * 0.016, f.c[1] - f.along[1] * 0.012 + f.palm[1] * 0.016, f.c[2] - f.along[2] * 0.012 + f.palm[2] * 0.016];
      box(mb, g, f.across, f.along, f.palm, 0.07, 0.008, 0.008, leather('#2a1e16'), f.joint);
      const top = g[1] - 0.05;
      for (const s of [-1, 1]) box(mb, [g[0] + f.across[0] * 0.03 * s, (g[1] + top) / 2, g[2] + f.across[2] * 0.03 * s], [0, 0, 1], [0, 1, 0], [1, 0, 0], 0.006, 0.05, 0.004, leather('#2a1e16'), f.joint);
      box(mb, [g[0], top - hh, g[2]], [0, 0, 1], [0, 1, 0], [1, 0, 0], big ? 0.16 : 0.12, hh, 0.045, col, f.joint);
      break;
    }
    case 'shoppingBag': case 'paperBag': {
      const f = handFrame('r');
      box(mb, [f.c[0], f.c[1] - 0.16, f.c[2]], [0, 0, 1], [0, 1, 0], [1, 0, 0], 0.13, 0.17, 0.07, { cA: lin('#a8845a'), cB: lin('#a8845a'), m0: [0, 0, 0.95, 0], m1: [KIND.paper, 0.1, 0.3, 0] }, f.joint);
      break;
    }
    case 'umbrella': { // closed, carried
      const f = handFrame('r');
      box(mb, [f.c[0], f.c[1] - 0.38, f.c[2] + 0.02], [1, 0, 0], [0, 1, 0], [0, 0, 1], 0.025, 0.4, 0.025, { cA: lin('#1a1818'), cB: lin('#1a1818'), m0: [0, 0, 0.6, 0.2], m1: [KIND.cloth, 0, 0.1, 0] }, f.joint);
      break;
    }
    case 'cigarette': {
      const f = handFrame('r');
      const p: V3 = [f.c[0] + f.along[0] * 0.03, f.c[1] + f.along[1] * 0.03, f.c[2] + f.along[2] * 0.03];
      box(mb, p, f.across, f.along, f.palm, 0.04, 0.0035, 0.0035, { cA: lin('#e8e2d6'), cB: lin('#c8a070'), m0: [0, 0, 0.9, 0], m1: [KIND.paper, 0, 0, 0] }, f.joint);
      break;
    }
    case 'nightstick': {
      const h = jp('pelvis');
      box(mb, [h[0] + 0.17, h[1] - 0.12, h[2] - 0.02], [0, 1, 0], [1, 0, 0], [0, 0, 1], 0.3, 0.017, 0.017, leather('#2a1e16'), JI.pelvis);
      break;
    }
    default: break; // handcart, shoppingCart, lunch pail: separate world objects (Character props)
  }
}
