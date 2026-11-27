/**
 * Period props with no acceptable free model (docs/interiors/PROP_CANDIDATES.md "gaps"): built here from bevelled boxes,
 * smooth lofts and tubes so their edges catch light. Frames follow props.ts: x right, z away from the user-facing side
 * (front toward -z), y up. References: Gottscho-Schleisner 1950s kitchens and baths, HABS tenement bathrooms,
 * DOCUMERICA 1973 flats.
 */
import { type Kit, type V3 } from './Kit';
import { M, type Mat, tint } from './materials';
import { toWorld, type Frame } from './props';

/** Bevelled box in a prop frame. */
export function bb(k: Kit, f: Frame, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Mat, r = 0.012, o: Parameters<Kit['bbox']>[9] = {}) {
  const [wx, wz] = toWorld(f, (x0 + x1) / 2, (z0 + z1) / 2);
  k.bbox(wx, (y0 + y1) / 2, wz, (x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2, f.yaw, mat, r, o);
}
const W = (f: Frame, x: number, y: number, z: number): V3 => { const [wx, wz] = toWorld(f, x, z); return [wx, y, wz]; };
/** Superellipse ring (rounded rectangle when e > 2) in a frame at height y; outward winding for Kit.loft. */
function ring(f: Frame, cx: number, cz: number, rx: number, rz: number, y: number, n = 20, e = 2.6): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = -Math.sin(a);
    const px = Math.sign(c) * Math.pow(Math.abs(c), 2 / e) * rx, pz = Math.sign(s) * Math.pow(Math.abs(s), 2 / e) * rz;
    out.push(W(f, cx + px, y, cz + pz));
  }
  return out;
}

// ---------------------------------------------------------------- kitchen dinette (1950s chrome and formica)
/** Chrome tube-frame dinette chair with a buttoned vinyl seat and back pad (Gottscho 1950s kitchens). */
export function dinetteChair(k: Kit, f: Frame, seat: Mat = M.vinylRed) {
  const tr = 0.011, seg = 7;
  for (const sx of [-1, 1]) {
    const x = sx * 0.19;
    // one continuous bent tube per side: front leg, seat rail, back leg rising into the back post
    k.tube(W(f, x, 0, -0.2), W(f, x, 0.43, -0.19), tr, M.chrome, seg);
    k.tube(W(f, x, 0.43, -0.19), W(f, x, 0.43, 0.17), tr, M.chrome, seg);
    k.tube(W(f, x, 0, 0.22), W(f, x, 0.43, 0.17), tr, M.chrome, seg);
    k.tube(W(f, x, 0.43, 0.17), W(f, x, 0.88, 0.22), tr, M.chrome, seg);
  }
  k.tube(W(f, -0.19, 0.06, 0.21), W(f, 0.19, 0.06, 0.21), tr * 0.8, M.chrome, seg); // rear stretcher
  bb(k, f, -0.215, 0.43, -0.215, 0.215, 0.5, 0.19, seat, 0.025);                     // seat pad
  bb(k, f, -0.2, 0.62, 0.17, 0.2, 0.85, 0.215, seat, 0.02);                          // back pad
  k.collider({ c: [f.x, 0.25, f.z], h: [0.22, 0.25, 0.22], yaw: f.yaw, breakable: 'chair' });
}
/** Formica dinette table with a ribbed chrome edge band and four chrome tube legs. */
export function dinetteTable(k: Kit, f: Frame, w = 1.0, d = 0.75, top: Mat = M.formicaCream) {
  const h = 0.76;
  bb(k, f, -w / 2, h - 0.03, -d / 2, w / 2, h, d / 2, top, 0.006, { collide: 'cover', breakable: 'table' });
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (sx) bb(k, f, sx * w / 2 - (sx > 0 ? 0.004 : -0.004) - 0.004, h - 0.035, -d / 2, sx * w / 2 + (sx > 0 ? 0.004 : -0.004), h + 0.002, d / 2, M.chrome, 0.003);
    else bb(k, f, -w / 2, h - 0.035, sz * d / 2 - 0.004, w / 2, h + 0.002, sz * d / 2 + 0.004, M.chrome, 0.003);
  }
  bb(k, f, -w / 2 + 0.06, h - 0.1, -d / 2 + 0.06, w / 2 - 0.06, h - 0.03, d / 2 - 0.06, tint(M.paintGrey, '#5a5650'), 0.005); // apron
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.tube(W(f, sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.08)), W(f, sx * (w / 2 - 0.08), h - 0.1, sz * (d / 2 - 0.07)), 0.014, M.chrome, 8);
}

// ---------------------------------------------------------------- bathroom (tenement / SRO)
/** Cast-iron clawfoot tub, enamel inside, painted outside, on four claw feet; long axis along frame x. */
export function clawfootTub(k: Kit, f: Frame, outer: Mat = tint(M.enamelWhite, '#d8d2c2')) {
  const L = 0.78, D = 0.36, base = 0.16, rim = 0.62;
  const body: V3[][] = [ring(f, 0, 0, L * 0.86, D * 0.78, base, 24, 2.4), ring(f, 0, 0, L * 0.95, D * 0.92, base + 0.15, 24, 2.6), ring(f, 0, 0, L, D, rim - 0.03, 24, 2.8)];
  k.loft(body, outer);
  // rolled rim and the enamel bowl inside (inner loft flipped so it faces inward)
  const rimR: V3[][] = [ring(f, 0, 0, L, D, rim - 0.03, 24, 2.8), ring(f, 0, 0, L + 0.018, D + 0.018, rim - 0.005, 24, 2.8), ring(f, 0, 0, L, D, rim + 0.012, 24, 2.8), ring(f, 0, 0, L - 0.04, D - 0.04, rim, 24, 2.8)];
  k.loft(rimR, M.enamelWhite);
  k.loft([ring(f, 0, 0, L - 0.04, D - 0.04, rim, 24, 2.8), ring(f, 0, 0, L - 0.1, D - 0.1, rim - 0.25, 24, 2.6), ring(f, 0.05, 0, L - 0.22, D - 0.17, base + 0.08, 24, 2.2)], M.enamelWhite, { flip: true, capEnd: false });
  // bowl floor
  k.loft([ring(f, 0.05, 0, L - 0.22, D - 0.17, base + 0.08, 24, 2.2), ring(f, 0.05, 0, 0.01, 0.01, base + 0.08, 24, 2)], M.enamelWhite, { flip: true });
  // claw feet
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [x, z] = toWorld(f, sx * (L - 0.16), sz * (D - 0.1));
    k.cyl(x, 0, z, 0.045, base + 0.02, tint(M.chrome, '#8a7a52'), 8, { r1: 0.03 });
    k.cyl(x, 0, z, 0.06, 0.03, tint(M.chrome, '#8a7a52'), 8);
  }
  // spout and twin taps at the foot end (+x)
  k.tube(W(f, L - 0.02, rim + 0.02, 0), W(f, L - 0.14, rim + 0.06, 0), 0.016, M.chrome, 8);
  for (const sz of [-0.09, 0.09]) { const [tx, tz] = toWorld(f, L - 0.04, sz); k.cyl(tx, rim, tz, 0.018, 0.07, M.chrome, 8); }
  k.collider({ c: [f.x, rim / 2, f.z], h: [L, rim / 2, D], yaw: f.yaw, cover: true });
}
/** High-tank pull-chain toilet: bowl on a pedestal, wooden seat, cast-iron tank high on the wall with a chain. Back to +z. */
export function highTankToilet(k: Kit, f: Frame) {
  const bowl = M.porcelain;
  k.loft([ring(f, 0, -0.05, 0.11, 0.14, 0, 16, 2), ring(f, 0, -0.07, 0.09, 0.12, 0.2, 16, 2), ring(f, 0, -0.08, 0.17, 0.23, 0.38, 16, 2.2)], bowl, { capEnd: false });
  k.loft([ring(f, 0, -0.08, 0.17, 0.23, 0.38, 16, 2.2), ring(f, 0, -0.08, 0.12, 0.17, 0.3, 16, 2.2)], bowl, { flip: true });
  bb(k, f, -0.18, 0.38, -0.33, 0.18, 0.41, 0.17, M.woodDark, 0.012);                                  // seat
  bb(k, f, -0.2, 1.9, 0.1, 0.2, 2.15, 0.27, tint(M.paintDarkGreen, '#3a3a32'), 0.02);                // high tank
  k.tube(W(f, 0, 1.9, 0.2), W(f, 0, 0.4, 0.13), 0.02, M.chrome, 8);                                    // flush pipe
  k.tube(W(f, 0.17, 1.9, 0.12), W(f, 0.17, 1.35, 0.1), 0.004, M.chrome, 4);                            // pull chain
  { const [hx, hz] = toWorld(f, 0.17, 0.1); k.cyl(hx, 1.28, hz, 0.018, 0.07, M.woodDark, 8); } // pull handle
  k.collider({ c: [f.x, 0.2, f.z], h: [0.2, 0.2, 0.25], yaw: f.yaw });
}
/** Wall payphone (single-slot 1960s-70s steel housing on a backboard, armoured cord, directory shelf). Wall at +z. */
export function wallPayphone(k: Kit, f: Frame, label = 'payphone') {
  bb(k, f, -0.3, 0.95, 0.0, 0.3, 2.0, 0.02, tint(M.steel, '#7a7a74'), 0.008);                         // backboard
  bb(k, f, -0.12, 1.2, -0.14, 0.12, 1.62, 0.0, M.steel, 0.02);                                         // housing
  bb(k, f, -0.1, 1.5, -0.145, 0.04, 1.57, -0.13, M.sign, 0.004);                                       // instruction card
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) bb(k, f, -0.065 + c * 0.04, 1.3 + r * 0.04, -0.15, -0.04 + c * 0.04, 1.325 + r * 0.04, -0.14, M.chrome, 0.003); // keypad buttons
  bb(k, f, 0.06, 1.58, -0.15, 0.1, 1.6, -0.14, M.black, 0.002);                                         // coin slot
  bb(k, f, 0.12, 1.28, -0.08, 0.17, 1.5, -0.03, M.black, 0.02);                                         // handset on its hook
  k.tube(W(f, 0.145, 1.28, -0.055), W(f, 0.1, 1.22, -0.1), 0.008, M.chrome, 5);                        // armoured cord
  bb(k, f, -0.25, 0.95, -0.28, 0.25, 0.98, 0.0, M.steel, 0.006);                                        // directory shelf
  const [wx, wz] = toWorld(f, 0, -0.3); k.marker('payphone', wx, 1.4, wz, label);
}
