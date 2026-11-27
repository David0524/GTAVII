/**
 * Pennington General emergency room (content barks: "Pennington General!", "Pennington's on Ninth"), 9th Ave & W 26th St.
 * A city hospital ER in 1974 (grade WORN): ambulance doors off the street, triage window and desk, a waiting room of
 * bolted plastic-and-chrome seats with a TV on a bracket, a curved nurses' station, six curtained bays on ceiling
 * tracks with gurneys and IV poles, a trauma room under a big surgical lamp. Gameplay: the respawn point after death
 * ("You're out. Hospital bill's in the envelope."), bed markers per bay, hide spots, a payphone, the cashier window.
 * References (pass 3, references/contact/pass3_hospital.jpg): curved nurses' station (loc_2018730393), ward curtain
 * tracks (loc_2026168461), tile wards and iron beds (loc_2006678922/-923), corridors (documerica_558171).
 */
import { M, tint } from '../../kit/materials';
import type { Kit, V3 } from '../../kit/Kit';
import * as P from '../../kit/props';
import * as G from '../../kit/propsGap';
import { type GenCtx, WALL_T, PARTY, fitRect } from '../common';
import { coreFacade } from '../vertical';
import { coreLayout } from '../../layout';

const TILE = tint(M.subway, '#d6d8c8');            // glazed wall tile to dado height
const PAINT = tint(M.plasterGreen, '#b8c4ae');     // hospital green above
const CURTAIN = { c: [0.62, 0.7, 0.66], pat: 24, p: 0, wear: 0.4 } as const;

/** Gurney: steel frame on casters, thin vinyl mattress, a folded sheet. Long axis along frame z. */
function gurney(k: Kit, x: number, z: number, yaw: number) {
  const f = { x, z, yaw };
  G.bb(k, f, -0.33, 0.62, -0.95, 0.33, 0.7, 0.95, M.steel, 0.02);
  G.bb(k, f, -0.31, 0.7, -0.92, 0.31, 0.78, 0.92, tint(M.vinylBrown, '#4a5a5a'), 0.03);
  G.bb(k, f, -0.29, 0.78, 0.45, 0.29, 0.82, 0.85, tint(M.enamelWhite, '#e8e4d8'), 0.02);
  for (const [lx, lz] of [[-0.28, -0.85], [0.28, -0.85], [-0.28, 0.85], [0.28, 0.85]]) { const [wx, wz] = P.toWorld(f, lx, lz); k.cyl(wx, 0.08, wz, 0.016, 0.54, M.chrome, 6); k.cyl(wx, 0, wz, 0.045, 0.08, M.rubber, 8); }
  k.collider({ c: [x, 0.4, z], h: [0.34, 0.4, 0.96], yaw, cover: true });
}
function ivPole(k: Kit, x: number, z: number) {
  k.cyl(x, 0, z, 0.22, 0.03, M.chrome, 5); k.cyl(x, 0.03, z, 0.012, 1.9, M.chrome, 6, { top: false });
  k.tube([x - 0.12, 1.92, z], [x + 0.12, 1.92, z], 0.008, M.chrome, 5);
  k.bbox(x + 0.1, 1.75, z, 0.05, 0.08, 0.02, 0, { c: [0.85, 0.88, 0.86], pat: 0, p: 0, wear: 0.1 } as never, 0.01, { glass: true });
}
/** Ceiling curtain track around three sides of a bay and the drawn curtain panels (one side left open). */
function curtainBay(k: Kit, x0: number, z0: number, x1: number, z1: number, H: number, openSide: 'z0' | 'z1') {
  const y = H - 0.3, cur = CURTAIN as never;
  const pts: V3[] = openSide === 'z0' ? [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]] : [[x0, y, z1], [x0, y, z0], [x1, y, z0], [x1, y, z1]];
  for (let q = 0; q < 3; q++) k.tube(pts[q], pts[q + 1], 0.012, M.chrome, 5);
  // curtains on the two side runs, gathered in folds (alternating offsets), 0.25 m above the floor
  for (const [a, b] of [[pts[0], pts[1]], [pts[2], pts[3]]] as [V3, V3][]) {
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]), n = Math.max(3, Math.round(L / 0.3));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, off = (i % 2 ? 0.05 : -0.05);
      const nx = (b[2] - a[2]) / L, nz = -(b[0] - a[0]) / L;
      const p0: V3 = [a[0] + (b[0] - a[0]) * t0 + nx * off, 0.25, a[2] + (b[2] - a[2]) * t0 + nz * off];
      const p1x = a[0] + (b[0] - a[0]) * t1 - nx * off, p1z = a[2] + (b[2] - a[2]) * t1 - nz * off;
      k.quad(p0, [p1x - p0[0], 0, p1z - p0[2]], [0, y - 0.28, 0], [nx, 0, nz], cur);
      k.quad([p1x, 0.25, p1z], [p0[0] - p1x, 0, p0[2] - p1z], [0, y - 0.28, 0], [-nx, 0, -nz], cur);
    }
  }
}

export function genHospitalER(c: GenCtx) {
  const { k, unit: u, r } = c;
  const H = 3.2;
  const x0 = PARTY, x1 = u.w - PARTY;
  const rc = fitRect(c.ring, [x0, WALL_T, x1, WALL_T + 4], [x0, WALL_T, x1, 24], [], 0.3);
  const zEnd = Math.max(WALL_T + 12, rc[3] > 0 ? rc[3] : u.d - 0.3), W = x1 - x0;
  const zWait = WALL_T + Math.min(6, (zEnd - WALL_T) * 0.33);     // waiting room depth
  const zHall1 = zWait + 2.2;                                      // corridor (nurses' station) behind it
  // ------------------------------------------------ waiting room + triage
  const wait = k.cell('er_waiting', [x0, 0, WALL_T, x1, H, zWait], 0);
  coreFacade(c, wait, { ...coreLayout(u, c.b), fh: H }, TILE, M.chrome, tint(M.steel, '#9a9a92'), true);
  k.room(x0, WALL_T, x1, zWait, 0, H, { floor: tint(M.lino, '#8a8270'), wall: PAINT, ceiling: M.acoustic }, {}, { skip: ['z0', 'z1'] });
  for (const [ax, az, bx, bz, nx, nz] of [[x0, WALL_T, x0, zWait, 1, 0], [x1, zWait, x1, WALL_T, -1, 0]] as number[][]) k.quad([ax + nx * 0.004, 0, az], [bx - ax, 0, bz - az], [0, 1.4, 0], [nx, 0, nz], TILE);
  // rows of bolted chrome-and-plastic seats facing the triage window, a TV on a wall bracket
  k.at(0, () => {
    for (let z = WALL_T + 1.2; z < zWait - 1.6; z += 1.1) for (let x = x0 + 0.6; x < x0 + W * 0.55; x += 0.55) G.dinetteChair(k, { x, z, yaw: Math.PI }, r.pick([M.vinylOrange, M.vinylGreen, tint(M.vinylOrange, '#c8902a')]));
  });
  k.box(x0 + 0.05, 2.2, zWait - 1.6, x0 + 0.45, 2.25, zWait - 1.2, M.steel, { occlude: false });
  k.at(2.25, () => P.consoleTV(k, { x: x0 + 0.3, z: zWait - 1.4, yaw: -Math.PI / 2 }, true));
  k.marker('tv', x0 + 0.3, 2.6, zWait - 1.4, 'waiting-room TV');
  // triage window and desk on the back wall's right half, cashier window beside it
  const tx0 = x0 + W * 0.6, tx1 = x1 - 0.3;
  k.at(0, () => G.bb(k, { x: (tx0 + tx1) / 2, z: zWait - 0.35, yaw: 0 }, -(tx1 - tx0) / 2, 0, -0.3, (tx1 - tx0) / 2, 1.05, 0.3, tint(M.formicaCream, '#d8d0b8'), 0.02, { collide: 'cover' }));
  k.box(tx0, 1.05, zWait - 0.08, tx1, 2.1, zWait - 0.07, M.glass, { glass: true, occlude: false });
  k.slot('triage_nurse', (tx0 + tx1) / 2, 0, zWait + 0.4, Math.PI);
  k.marker('service', (tx0 + tx1) / 2, 0, zWait - 0.9, 'triage (treatment for cash; the bill comes in an envelope)');
  k.marker('register', tx1 - 0.4, 1.05, zWait - 0.35, 'cashier window');
  k.artSlot('notice', (tx0 + tx1) / 2, 2.3, zWait - 0.06, 1.0, 0.3, 0, -1);
  k.at(0, () => G.wallPayphone(k, { x: x1 - 0.02, z: WALL_T + 1.2, yaw: Math.PI / 2 }, 'ER payphone'));
  k.marker('spawn', x0 + W * 0.3, 0, WALL_T + 1.0, 'respawn after death (Pennington General)');
  k.marker('wait', x0 + 0.9, 0.45, WALL_T + 1.2, 'waiting-room seats');
  for (let x = x0 + 1.5; x < x1; x += 3) P.fluorescent(k, x, (WALL_T + zWait) / 2, H, 1.22, 2.4, 0, r.chance(0.2) ? 1 : 0);
  // ------------------------------------------------ corridor with the nurses' station
  const hall = k.cell('er_hall', [x0, 0, zWait, x1, H, zHall1], 0);
  const doorX = x0 + W * 0.3;
  k.wall(x1, zWait, x0, zWait, 0, H, PAINT, -1, [{ s0: x1 - (doorX + 0.75), s1: x1 - (doorX - 0.75), y0: 0, y1: 2.2, depth: 0.15 }, { s0: x1 - tx1, s1: x1 - tx0, y0: 1.05, y1: 2.1, depth: 0.15 }]);
  k.wall(x0, zWait, x1, zWait, 0, H, PAINT, 1, [{ s0: doorX - 0.75 - x0, s1: doorX + 0.75 - x0, y0: 0, y1: 2.2 }, { s0: tx0 - x0, s1: tx1 - x0, y0: 1.05, y1: 2.1 }], { collide: true });
  k.portalRect(wait, hall, doorX - 0.75, zWait, doorX + 0.75, zWait, 0, 2.2);
  k.door(`${u.id}:swing_a`, doorX - 0.75, 0, zWait + 0.05, 0.75, 2.1, 0, 1, { cellA: wait, cellB: hall, glazed: true, mat: tint(M.steel, '#a8aca0') });
  k.door(`${u.id}:swing_b`, doorX + 0.75, 0, zWait + 0.05, 0.75, 2.1, Math.PI, -1, { cellA: wait, cellB: hall, glazed: true, mat: tint(M.steel, '#a8aca0') });
  k.floor(x0, zWait, x1, zHall1, 0, tint(M.lino, '#7a7a68')); k.ceiling(x0, zWait, x1, zHall1, H, M.acoustic);
  k.wall(x1, zWait, x1, zHall1, 0, H, PAINT, 1); k.wall(x0, zHall1, x0, zWait, 0, H, PAINT, 1);
  // curved nurses' station (a ring of bevelled counter segments), chart rack, a telephone
  const ncx = x0 + W * 0.65, ncz = zHall1 - 0.2;
  for (let q = 0; q < 7; q++) { const a = Math.PI * (0.1 + q * 0.8 / 6), sx = ncx + Math.cos(a) * 1.4, sz = ncz - Math.sin(a) * 0.9; k.bbox(sx, 0.55, sz, 0.32, 0.55, 0.12, Math.PI / 2 - a, tint(M.formicaCream, '#d0c8b0'), 0.02, { collide: 'cover' }); }
  k.slot('charge_nurse', ncx, 0, ncz - 0.1, 0);
  k.marker('service', ncx, 0, ncz - 1.4, "nurses' station");
  P.fluorescent(k, ncx, ncz - 0.4, H, 1.22, 2.6, Math.PI / 2);
  P.fluorescent(k, x0 + W * 0.25, (zWait + zHall1) / 2, H, 1.22, 2.2, Math.PI / 2);
  // ------------------------------------------------ treatment bays + trauma room
  const bays = k.cell('er_bays', [x0, 0, zHall1, x1, H, zEnd], 0);
  k.portalRect(hall, bays, x0, zHall1, x1, zHall1, 0, H);
  k.room(x0, zHall1, x1, zEnd, 0, H, { floor: tint(M.lino, '#8a8a78'), wall: TILE, ceiling: M.acoustic }, {}, { skip: ['z0'] });
  const traumaW = Math.min(4.2, W * 0.35), bx1 = x1 - traumaW - 0.15;
  const nBays = Math.max(2, Math.floor((bx1 - x0) / 2.3)), bw = (bx1 - x0) / nBays, bd = Math.min(3.0, (zEnd - zHall1) - 1.2);
  for (let q = 0; q < nBays; q++) {
    const a = x0 + q * bw, b = a + bw - 0.05, zb0 = zEnd - bd;
    curtainBay(k, a + 0.05, zb0, b, zEnd - 0.05, H, 'z0');
    k.at(0, () => gurney(k, (a + b) / 2, zEnd - bd / 2 - 0.1, 0));
    ivPole(k, b - 0.3, zEnd - 0.4);
    k.marker('bed', (a + b) / 2, 0.78, zEnd - bd / 2, `treatment bay ${q + 1}`);
    if (r.chance(0.5)) k.slot('patient', (a + b) / 2, 0.78, zEnd - bd / 2, 0);
    if (q === nBays - 1) k.marker('hide', (a + b) / 2, 0, zb0 + 0.3, 'behind a drawn curtain');
    P.fluorescent(k, (a + b) / 2, zEnd - bd / 2, H, 1.22, 2.0, Math.PI / 2, r.chance(0.15) ? 1 : 0);
  }
  // trauma room: half-glazed partition, the big round surgical lamp, a table, instrument trolley
  k.wall(bx1 + 0.15, zEnd, bx1 + 0.15, zHall1 + 0.6, 0, H, TILE, 1, [{ s0: 0.5, s1: (zEnd - zHall1 - 0.6) - 0.5, y0: 1.1, y1: 2.2 }]);
  k.wall(bx1 + 0.15, zHall1 + 0.6, bx1 + 0.15, zEnd, 0, H, TILE, -1, [{ s0: 0.5, s1: (zEnd - zHall1 - 0.6) - 0.5, y0: 1.1, y1: 2.2 }]);
  const tcx = bx1 + 0.15 + traumaW / 2, tcz = (zHall1 + zEnd) / 2 + 0.6;
  k.at(0, () => gurney(k, tcx, tcz, 0));
  k.cyl(tcx, H - 0.1, tcz, 0.05, 0.1, M.steel, 8); k.tube([tcx, H - 0.1, tcz], [tcx + 0.3, H - 0.7, tcz], 0.025, M.steel, 6);
  k.cyl(tcx + 0.3, H - 0.85, tcz, 0.36, 0.15, tint(M.enamelWhite, '#e0e0d8'), 16, { r1: 0.3 });
  k.cyl(tcx + 0.3, H - 0.86, tcz, 0.3, 0.01, M.bulb, 16);
  k.light(tcx + 0.2, H - 1.0, tcz, [1, 0.97, 0.9], 3.0, 'bulb');
  k.at(0, () => { G.bb(k, { x: tcx + 1.1, z: tcz - 0.4, yaw: 0 }, -0.3, 0.8, -0.2, 0.3, 0.83, 0.2, M.steel, 0.01); for (const [lx, lz] of [[-0.27, -0.17], [0.27, -0.17], [-0.27, 0.17], [0.27, 0.17]]) k.cyl(tcx + 1.1 + lx, 0, tcz - 0.4 + lz, 0.01, 0.8, M.chrome, 5); });
  k.marker('bed', tcx, 0.78, tcz, 'trauma room table');
  k.marker('stash', x1 - 0.4, 0, zEnd - 0.3, 'drug cabinet (locked)');
}
