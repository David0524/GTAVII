/**
 * Vertical buildings: walk-up tenements and SROs (street door -> vestibule -> hall -> dog-leg stair
 * up every floor -> roof bulkhead), loft buildings (freight lobby, stair, open loft floors), and
 * apartment lobbies. Roofs are tar beaches with bulkheads, chimneys, TV antennas, pigeon coops and
 * water tanks: the chase-and-escape network.
 */
import { M, type Mat, tint } from '../kit/materials';
import * as P from '../kit/props';
import { type GenCtx, WALL_T, fitRect, revealBox, bayWindowSpans, floorWindowY } from './common';
import { coreLayout, shopRoofHatch, type CoreLayout } from '../layout';
import { facadeOpenings } from '../facade';

interface VStyle { wall: Mat; floor: Mat; groundFloor: Mat; ceil: Mat; tread: Mat; stringer: Mat; rail: Mat; door: Mat; bulbI: number }
function vstyle(c: GenCtx, kind: 'tenement' | 'sro' | 'loft' | 'apartment'): VStyle {
  const r = c.r;
  if (kind === 'loft') return { wall: r.pick([M.brickPainted, tint(M.plasterGreen, '#7f8a6a'), M.plasterCream]), floor: M.planksWorn, groundFloor: M.concrete, ceil: M.ceilingPlaster, tread: M.steel, stringer: M.paintDarkGreen, rail: M.paintDarkGreen, door: M.paintGrey, bulbI: 1.6 };
  if (kind === 'apartment') return { wall: r.pick([M.plasterCream, M.wallpaper, tint(M.plasterCream, '#d4c6a0')]), floor: M.terrazzo, groundFloor: M.terrazzo, ceil: M.ceilingPlaster, tread: M.terrazzo, stringer: M.marble, rail: M.chrome, door: M.woodDark, bulbI: 1.8 };
  return { wall: r.pick([M.dadoTenement, M.dadoHall, tint(M.dadoTenement, '#c2b48a')]), floor: r.pick([M.lino, M.hexWhite, M.linoGreen]), groundFloor: M.hexWhite, ceil: r.chance(0.6) ? M.tin : M.ceilingPlaster, tread: r.pick([M.woodDark, M.marble, M.steel]), stringer: M.paintBrown, rail: M.woodDark, door: r.pick([M.woodDark, M.paintBrown, tint(M.paintDarkGreen, '#3a4a3a')]), bulbI: 1.9 };
}

/** The street door wall of a core unit: door + transom with reveals and a street portal. */
function coreFacade(c: GenCtx, cell: number, L: CoreLayout, wall: Mat, frame: Mat, doorMat: Mat, glazed = true) {
  const { k, unit: u } = c;
  const fo = facadeOpenings(u, c.b.year, c.b.fh);
  const H = L.fh;
  k.wall(0, WALL_T, u.w, WALL_T, 0, H, wall, 1, fo.map((q) => ({ s0: q.s0, s1: q.s1, y0: q.y0, y1: Math.min(q.y1, H - 0.05) })));
  for (const q of fo) revealBox(k, q.s0, q.s1, q.y0, Math.min(q.y1, H - 0.05), frame, q.y0 > 0.01);
  const d = fo.find((q) => q.kind === 'door')!, t = fo.find((q) => q.kind === 'transom');
  if (t) k.box(t.s0, t.y0, 0.06, t.s1, Math.min(t.y1, H - 0.05), 0.075, M.glass, { glass: true, occlude: false });
  k.portalRect(cell, -1, d.s0, 0, d.s1, 0, 0, d.y1);
  k.door(`${u.id}:street`, d.s0, 0, 0.12, d.s1 - d.s0, d.y1, 0, -1, { street: true, glazed, locked: u.locked, cellA: cell, cellB: -1, mat: doorMat });
}

/** Apartment behind a hall door: railroad-flat kitchen + front room, fitted to the footprint. */
function apartment(c: GenCtx, side: 'x0' | 'x1', zDoor: number, y0: number, fh: number, hallCell: number, L: CoreLayout, label: string, avoid: [number, number, number, number][]): boolean {
  const { k, r } = c;
  const sx = side === 'x0' ? -1 : 1;
  const wallX = side === 'x0' ? L.x0 - 0.12 : L.x1 + 0.12;
  const seed: [number, number, number, number] = side === 'x0' ? [wallX - 2.5, zDoor - 1.2, wallX, zDoor + 1.2] : [wallX, zDoor - 1.2, wallX + 2.5, zDoor + 1.2];
  const max: [number, number, number, number] = side === 'x0' ? [wallX - 7, WALL_T, wallX, L.ze + 4] : [wallX, WALL_T, wallX + 7, L.ze + 4];
  const rc = fitRect(c.ring, seed, max, avoid);
  const w = rc[2] - rc[0], d = rc[3] - rc[1];
  if (w < 2.8 || d < 3.2) return false;
  avoid.push(rc);
  const H = fh - 0.25;
  const cell = k.cell(`apt_${label}`, [rc[0], y0, rc[1], rc[2], y0 + H, rc[3]], Math.round(y0 / fh));
  const wallMat = r.pick([M.wallpaper, M.wallpaperGreen, M.plasterCream, M.plasterBlue, M.plasterYellow, tint(M.wallpaper, '#b49a7a')]);
  // door opening in the hall-side wall of the apartment
  const hallSide = side === 'x0' ? 'x1' : 'x0';
  const op = { s0: 0, s1: 0, y0: y0, y1: y0 + 2.05 };
  // room() edges: x1 edge runs +z from rc[1]; x0 edge runs -z from rc[3]
  const ops: { x0?: { s0: number; s1: number; y0: number; y1: number }[]; x1?: { s0: number; s1: number; y0: number; y1: number }[]; z0?: { s0: number; s1: number; y0: number; y1: number }[] } = {};
  if (hallSide === 'x1') ops.x1 = [{ ...op, s0: zDoor - 0.45 - rc[1], s1: zDoor + 0.45 - rc[1] }];
  else ops.x0 = [{ ...op, s0: rc[3] - (zDoor + 0.45), s1: rc[3] - (zDoor - 0.45) }];
  // windows: on the facade if the flat reaches it, else a rear/airshaft window on the far wall
  const atFacade = rc[1] <= WALL_T + 0.3;
  const winOps: { s0: number; s1: number; y0: number; y1: number }[] = [];
  { const [wy0, wy1] = floorWindowY(c, Math.round(y0 / fh)); for (const [a0, a1] of bayWindowSpans(c, rc[0], rc[2])) winOps.push({ s0: a0 - rc[0], s1: a1 - rc[0], y0: Math.max(y0 + 0.3, wy0), y1: Math.min(y0 + fh - 0.35, wy1) }); }
  if (atFacade) ops.z0 = winOps;
  k.room(rc[0], rc[1], rc[2], rc[3], y0, y0 + H, { floor: r.pick([M.planksWorn, M.lino, M.linoGreen]), wall: wallMat, ceiling: M.ceilingPlaster }, ops);
  if (atFacade) for (const q of winOps) {
    k.portalRect(cell, -1, rc[0] + q.s0, rc[1], rc[0] + q.s1, rc[1], q.y0, q.y1);
    k.box(rc[0] + q.s0, q.y0, rc[1] - 0.02, rc[0] + q.s1, q.y1, rc[1] - 0.01, M.glass, { glass: true, occlude: false });
    // window shade pulled to a random height, sash bar
    const sh = r.range(0.1, 0.8);
    k.box(rc[0] + q.s0, q.y1 - (q.y1 - q.y0) * sh, rc[1] + 0.02, rc[0] + q.s1, q.y1, rc[1] + 0.03, r.pick([tint(M.paper, '#d9c99a'), tint(M.paper, '#a8a08a'), tint(M.fabricRust, '#9a5a3a')]), { occlude: false });
    k.box(rc[0] + q.s0, (q.y0 + q.y1) / 2 - 0.03, rc[1] - 0.03, rc[0] + q.s1, (q.y0 + q.y1) / 2 + 0.03, rc[1] + 0.02, M.enamelCream, { occlude: false });
    if (r.chance(0.18)) k.box(rc[0] + q.s0 + 0.1, q.y0, rc[1] - 0.25, rc[0] + q.s1 - 0.1, q.y0 + 0.42, rc[1] + 0.35, M.enamelCream, { collide: true }); // window AC unit
  }
  k.portalRect(hallCell, cell, wallX, zDoor - 0.45, wallX, zDoor + 0.45, y0, y0 + 2.05);
  // furnishing: kitchen corner near the door (tub with cover board, sink, stove, fridge), front room beyond
  const kx = side === 'x0' ? rc[2] - 0.4 : rc[0] + 0.4;
  const along = (z: number) => z;
  const kz = Math.min(rc[3] - 0.9, zDoor + 1.0);
  k.box(kx - 0.35 * -sx - 0.35, y0, along(kz), kx + 0.35 * -sx + 0.35, y0 + 0.9, along(kz) + 0.65, M.enamelWhite, { collide: 'cover' }); // stove/sink base
  k.box(kx - 0.36, y0 + 0.9, kz, kx + 0.36, y0 + 0.93, kz + 0.65, M.black, { occlude: false });
  if (r.chance(0.6)) { k.box(rc[0] + 0.2, y0, rc[3] - 0.8, rc[0] + 1.75, y0 + 0.62, rc[3] - 0.1, M.porcelain, { collide: 'cover' }); k.box(rc[0] + 0.18, y0 + 0.62, rc[3] - 0.82, rc[0] + 1.77, y0 + 0.66, rc[3] - 0.08, M.planks); } // tub with cover board
  k.box(rc[2] - 0.8, y0, rc[3] - 0.75, rc[2] - 0.1, y0 + 1.55, rc[3] - 0.1, M.enamelWhite, { collide: 'cover' }); // fridge
  P.table(k, { x: (rc[0] + rc[2]) / 2, z: rc[3] - 1.6, yaw: 0 }, 0.9, 0.7, r.pick([M.formicaCream, M.formicaTeal, M.formicaRed]), 0.75, M.chrome);
  P.chromeChair(k, { x: (rc[0] + rc[2]) / 2 - 0.6, z: rc[3] - 1.6, yaw: Math.PI / 2 }, M.vinylRed);
  if (d > 5) {
    const tvOn = r.chance(0.6);
    P.sofa(k, { x: (rc[0] + rc[2]) / 2, z: rc[1] + 1.0, yaw: Math.PI }, Math.min(2, w - 0.8), r.pick([M.fabricPlaid, M.fabricOlive, M.fabricBrown, M.vinylBrown]));
    P.consoleTV(k, { x: (rc[0] + rc[2]) / 2, z: rc[1] + 3.0, yaw: Math.PI }, tvOn);
    if (w > 3.5) P.armchair(k, { x: rc[0] + 0.7, z: rc[1] + 2.2, yaw: -Math.PI / 2 }, M.fabricRust);
    k.box(rc[0] + 0.6, y0 + 0.003, rc[1] + 1.6, rc[2] - 0.6, y0 + 0.012, rc[1] + 3.6, r.pick([M.carpetRed, M.carpetGreen]), { occlude: false });
  }
  P.radiator(k, { x: rc[0] + 0.3, z: rc[1] + (atFacade ? 0.1 : 1.5), yaw: 0 }, 0.8);
  P.bareBulb(k, (rc[0] + rc[2]) / 2, (rc[1] + rc[3]) / 2, y0 + H, 1.3);
  k.slot('resident', (rc[0] + rc[2]) / 2, y0, rc[3] - 2.3, Math.PI);
  k.marker('hide', rc[0] + 0.5, y0, rc[3] - 0.5, 'closet');
  k.marker('burglary', rc[2] - 0.5, y0, rc[3] - 1.2, 'kitchen drawer / coffee can');
  if (d > 5) k.marker('tv', (rc[0] + rc[2]) / 2, y0 + 0.45, rc[1] + 3.0, 'console TV');
  k.marker('wait', (rc[0] + rc[2]) / 2, y0 + 0.44, rc[1] + 1.0, 'sofa');
  k.use(hallCell);
  return true;
}

/** Roof: bulkhead with a door, tar beach dressing. y = roof level (unit-local). */
function roofTop(c: GenCtx, L: CoreLayout, stairCell: number) {
  const { k, r } = c; const y = L.roofY;
  const bh = 2.5;
  // bulkhead cell (indoor), its door to the roof
  const bc = k.cell('bulkhead', [L.x0, y - 0.3, L.zs, L.x1, y + bh, L.ze], L.floors);
  const doorW = 0.9, dx = (L.x0 + L.x1) / 2 - doorW / 2;
  k.room(L.x0, L.zs, L.x1, L.ze, y, y + bh, { floor: M.concrete, wall: M.brickPainted, ceiling: M.ceilingPlaster }, { z0: [{ s0: dx - L.x0, s1: dx - L.x0 + doorW, y0: y, y1: y + 2.05, depth: 0.25 }] }, { collide: true });
  k.portalFloor(stairCell, bc, L.x0, L.zs + L.landing, L.x1, L.ze, y);
  k.portalRect(bc, -1, dx, L.zs, dx + doorW, L.zs, y, y + 2.05);
  k.door(`${c.unit.id}:roof`, dx, y, L.zs - 0.05, doorW, 2.05, 0, -1, { cellA: bc, cellB: -1, mat: tint(M.steel, '#5a5a52'), locked: r.chance(0.15) });
  P.bareBulb(k, (L.x0 + L.x1) / 2, (L.zs + L.ze) / 2, y + bh, 0.9);
  // outdoor roof cell: bulkhead exterior + dressing
  const oc = k.cell('roof', [L.x0 - 12, y - 0.5, -2, L.x1 + 12, y + 12, L.ze + 14], L.floors, true);
  const ext = tint(M.brick, '#5a3a2a'), t = 0.25;
  k.box(L.x0 - t, y - 0.05, L.zs - t, L.x1 + t, y + bh + 0.1, L.ze + t, ext, { faces: 0b111011 /* no bottom */, occlude: false });
  k.box(L.x0 - t - 0.05, y + bh + 0.1, L.zs - t - 0.05, L.x1 + t + 0.05, y + bh + 0.22, L.ze + t + 0.05, M.tar, { occlude: false });
  // the bulkhead exterior box's front face covers the door opening: cut it by drawing the front wall separately
  k.wall(L.x1 + t, L.zs - t, L.x0 - t, L.zs - t, y - 0.05, y + bh + 0.1, ext, 1, [{ s0: L.x1 + t - (dx + doorW), s1: L.x1 + t - dx, y0: y, y1: y + 2.05 }], { collide: false });
  k.marker('spawn', (L.x0 + L.x1) / 2, y, L.zs - 1.2, 'roof');
  k.marker('stash', L.x0 - 0.4, y, L.ze - 0.4, 'loose flashing by the bulkhead');
  const fr = k.rng;
  // dressing on the tar: chimney stack, TV antennas, vent pipes, a pigeon coop, beach chairs, clothesline, water tank
  const spots = [[-3.5, 1.5], [3.0, 2.5], [-2.5, 6.5], [4.5, 7.0], [0.5, 9.0], [-5.0, 4.0]].map(([ox, oz]) => [L.x0 + ox, L.zs + oz]);
  const inRoof = (x: number, z: number) => !c.ring || pointInRing(c.ring, x, z);
  const [chx, chz] = spots.find(([x, z]) => inRoof(x, z)) ?? [L.x0 - 1, L.zs + 1];
  k.box(chx - 0.5, y, chz - 0.35, chx + 0.5, y + 1.3, chz + 0.35, ext, { collide: true });
  for (let a = 0; a < fr.int(1, 3); a++) { const [x, z] = spots[(a + 1) % spots.length]; if (!inRoof(x, z)) continue; k.cyl(x, y, z, 0.02, 3.2, M.steel, 4, { top: false }); for (let b = 0; b < 5; b++) k.box(x - 0.6 + b * 0.05, y + 2.4 + b * 0.15, z - 0.01, x + 0.6 - b * 0.05, y + 2.42 + b * 0.15, z + 0.01, M.steel, { occlude: false }); }
  if (fr.chance(0.3)) { const [x, z] = spots[3]; if (inRoof(x, z)) { k.box(x - 1.2, y, z - 0.8, x + 1.2, y + 1.6, z + 0.8, M.planksWorn, { collide: true }); k.box(x - 1.15, y + 0.3, z - 0.82, x + 1.15, y + 1.4, z - 0.8, tint(M.steel, '#4a4a44'), { occlude: false }); k.slot('pigeon_keeper', x, y, z - 1.4, 0); } }
  if (fr.chance(0.6)) { const [x, z] = spots[1]; if (inRoof(x, z)) { for (const ox of [0, 0.8]) { k.box(x + ox, y + 0.1, z, x + ox + 0.55, y + 0.14, z + 1.5, tint(M.fabricRust, fr.pick(['#c9a24a', '#3c6a8a', '#b2302a'])), { occlude: false }); k.box(x + ox, y, z, x + ox + 0.55, y + 0.1, z + 0.05, M.chrome, { occlude: false }); } k.slot('sunbather', x + 0.3, y + 0.15, z + 0.7, 0); } }
  if (fr.chance(0.5)) { const [x, z] = spots[2]; if (inRoof(x, z)) { k.cyl(x - 2, y, z, 0.025, 1.9, M.steel, 4, { top: false }); k.cyl(x + 2, y, z, 0.025, 1.9, M.steel, 4, { top: false }); k.box(x - 2, y + 1.85, z - 0.005, x + 2, y + 1.86, z + 0.005, M.paper, { occlude: false }); for (let q = 0; q < 6; q++) k.box(x - 1.8 + q * 0.65, y + 1.2 + fr.range(0, 0.3), z - 0.01, x - 1.4 + q * 0.65, y + 1.85, z + 0.01, fr.pick([M.enamelWhite, M.fabricDenim, tint(M.fabricRust, '#d9c99a'), M.fabricPlaid]), { occlude: false }); } }
  if (L.floors >= 6 && fr.chance(0.55)) {
    // wooden water tank on a steel stand (cedar staves, conical roof)
    const [x, z] = spots.find(([sx, sz], i) => i > 3 && inRoof(sx, sz) && inRoof(sx + 1.6, sz + 1.6) && inRoof(sx - 1.6, sz - 1.6)) ?? [NaN, NaN];
    if (!Number.isNaN(x)) {
      for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) k.box(x + lx - 0.08, y, z + lz - 0.08, x + lx + 0.08, y + 3.2, z + lz + 0.08, M.steel, { collide: true });
      k.box(x - 1.5, y + 3.2, z - 1.5, x + 1.5, y + 3.35, z + 1.5, M.steel, { occlude: false });
      k.cyl(x, y + 3.35, z, 1.75, 3.6, tint(M.wood, '#6a5038'), 16, { top: false });
      for (const hy of [0.6, 1.6, 2.6, 3.4]) k.cyl(x, y + 3.35 + hy, z, 1.77, 0.06, M.steel, 16, { top: false });
      k.cyl(x, y + 6.95, z, 1.85, 0.9, tint(M.wood, '#5a4030'), 16, { r1: 0.15 });
    }
  }
  // roof light: the street glow is enough at night; nothing baked here
  void oc; void stairCell; k.use(bc);
}
function pointInRing(r: Float64Array, x: number, z: number) {
  let ins = false; const n = r.length / 2;
  for (let a = 0, b = n - 1; a < n; b = a++) { const xi = r[2 * a], zi = r[2 * a + 1], xj = r[2 * b], zj = r[2 * b + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; }
  return ins;
}

/** Tenement / SRO walk-up. */
export interface LoftPlan { f: number; side: 'x0' | 'x1'; rc: [number, number, number, number]; dz: number }
export function genTenement(c: GenCtx, sro = false, mode: 'tenement' | 'loft' = 'tenement', lofts: LoftPlan[] = []) {
  const { k, unit: u, r } = c;
  const L = coreLayout(u, c.b);
  const st = vstyle(c, mode === 'loft' ? 'loft' : sro ? 'sro' : 'tenement');
  const fw = L.flightW, half = L.fh / 2;
  const zFront = L.zs, zBackL = L.zs + L.landing + L.run;
  const avoid: [number, number, number, number][] = [[L.x0 - 0.15, 0, L.x1 + 0.15, L.ze + 0.15]];
  let prevCell = -1;
  const doors: string[] = 'ABCDEFGH'.split('');
  let openApts = 0;
  for (let f = 0; f < L.floors; f++) {
    const y0 = f * L.fh, top = f === L.floors - 1;
    const cell = k.cell(`floor${f}`, [L.x0, y0, WALL_T, L.x1, y0 + L.fh, L.ze], f);
    // floor plate: hall + front landing (ground floor: vestibule and hall)
    if (f === 0) {
      k.floor(L.x0, WALL_T, L.x1, L.zs + L.landing, 0, st.groundFloor);
      k.floor(L.x0, L.zs + L.landing, L.x1, L.ze, 0, M.concrete);
      coreFacade(c, cell, L, st.wall, M.woodDark, st.door);
      // vestibule: mailboxes, inner glazed door
      const vz = WALL_T + L.vest;
      const iw = 0.95, ix = (L.x0 + L.x1) / 2 - iw / 2;
      k.wall(L.x0, vz, L.x1, vz, 0, L.fh, st.wall, -1, [{ s0: ix - L.x0, s1: ix - L.x0 + iw, y0: 0, y1: 2.15 }], { collide: true });
      k.wall(L.x0, vz + 0.1, L.x1, vz + 0.1, 0, L.fh, st.wall, 1, [{ s0: ix - L.x0, s1: ix - L.x0 + iw, y0: 0, y1: 2.15 }], { collide: false });
      k.door(`${u.id}:inner`, ix, 0, vz + 0.05, iw, 2.15, 0, -1, { glazed: true, locked: u.locked && r.chance(0.5), cellA: cell, cellB: cell, mat: st.door });
      P.mailboxes(k, { x: L.x0 + 0.02, z: WALL_T + 0.3, yaw: -Math.PI / 2 }, Math.min(6, Math.floor((L.vest - 0.4) / 0.14)), 3);
      k.box(L.x1 - 0.06, 1.3, WALL_T + 0.6, L.x1 - 0.01, 1.6, WALL_T + 0.8, tint(M.chrome, '#b08a4a'), { occlude: false }); // buzzer panel
      k.slot('resident_stoop', (L.x0 + L.x1) / 2, 0, vz + 1.0, Math.PI);
    } else {
      // slab with the stair well open behind the front landing
      k.box(L.x0, y0 - 0.25, WALL_T, L.x1, y0, L.zs + L.landing, M.concrete, { collide: true, faces: 0b001100 });
      k.floor(L.x0, WALL_T, L.x1, L.zs + L.landing, y0 + 0.002, st.floor);
    }
    // ceiling under the next slab (hall part only)
    k.ceiling(L.x0, WALL_T, L.x1, L.zs + L.landing, y0 + L.fh - 0.25, st.ceil);
    // side walls, back wall, with apartment doors on upper floors
    const aptDoors: { side: 'x0' | 'x1'; z: number; open: boolean; label: string }[] = [];
    if (f > 0 && mode === 'tenement') {
      const hallZ0 = WALL_T + 0.6, hallZ1 = L.zs - 0.2;
      const zs = hallZ1 - hallZ0 > 3.2 ? [hallZ0 + 0.9, hallZ1 - 0.6] : [(hallZ0 + hallZ1) / 2];
      let n = 0;
      for (const side of ['x0', 'x1'] as const) for (const z of zs) {
        const label = `${f + 1}${doors[n++]}`;
        const wantOpen = openApts < 2 && r.chance(sro ? 0.12 : 0.16);
        const open = wantOpen && apartment(c, side, z, y0, L.fh, cell, L, label, avoid);
        if (open) openApts++;
        aptDoors.push({ side, z, open, label });
      }
    }
    const lp = lofts.filter((q) => q.f === f);
    const ops = (side: 'x0' | 'x1') => [
      ...aptDoors.filter((d) => d.side === side).map((d) => side === 'x1' ? { s0: d.z - 0.45 - WALL_T, s1: d.z + 0.45 - WALL_T, y0: y0, y1: y0 + 2.05, depth: 0.12 } : { s0: L.ze - (d.z + 0.45), s1: L.ze - (d.z - 0.45), y0: y0, y1: y0 + 2.05, depth: 0.12 }),
      ...lp.filter((q) => q.side === side).map((q) => side === 'x1' ? { s0: q.dz - 0.7 - WALL_T, s1: q.dz + 0.7 - WALL_T, y0, y1: y0 + 2.4, depth: 0.12 } : { s0: L.ze - (q.dz + 0.7), s1: L.ze - (q.dz - 0.7), y0, y1: y0 + 2.4, depth: 0.12 }),
    ];
    k.wall(L.x1, WALL_T, L.x1, L.ze, y0, y0 + L.fh, st.wall, 1, ops('x1'));
    k.wall(L.x0, L.ze, L.x0, WALL_T, y0, y0 + L.fh, st.wall, 1, ops('x0'));
    k.wall(L.x1, L.ze, L.x0, L.ze, y0, y0 + L.fh, st.wall, 1);
    if (f > 0) {
      // facade end of the upper hall: a window onto the street (engine facade has no hole here; its back face is culled)
      const sp = bayWindowSpans(c, L.x0, L.x1)[0] ?? [(L.x0 + L.x1) / 2 - 0.45, (L.x0 + L.x1) / 2 + 0.45];
      const [hy0, hy1] = floorWindowY(c, f);
      const wo = [{ s0: sp[0], s1: sp[1], y0: Math.max(y0 + 0.3, hy0), y1: Math.min(y0 + L.fh - 0.35, hy1), depth: WALL_T }];
      k.wall(0, WALL_T, u.w, WALL_T, y0, y0 + L.fh, st.wall, 1, wo.map((q) => ({ ...q, depth: 0 })));
      revealBox(k, wo[0].s0, wo[0].s1, wo[0].y0, wo[0].y1, st.wall, true);
      k.box(wo[0].s0, wo[0].y0, 0.06, wo[0].s1, wo[0].y1, 0.075, M.glass, { glass: true, occlude: false });
      k.portalRect(cell, -1, wo[0].s0, 0, wo[0].s1, 0, wo[0].y0, wo[0].y1);
    }
    for (const d of aptDoors) {
      const x = d.side === 'x1' ? L.x1 : L.x0;
      // door leaf: hinge on the near edge, closed along the wall
      const hz = d.side === 'x1' ? d.z - 0.45 : d.z + 0.45;
      k.door(`${u.id}:apt${d.label}`, x + (d.side === 'x1' ? -0.03 : 0.03), y0, hz, 0.9, 2.05, d.side === 'x1' ? -Math.PI / 2 : Math.PI / 2, 1, { locked: !d.open, cellA: cell, cellB: -1, mat: st.door, key: `key.${u.id}.${d.label}` });
      // brass numbers above the door
      k.box(x + (d.side === 'x1' ? -0.015 : 0), y0 + 2.12, d.z - 0.08, x + (d.side === 'x1' ? 0 : 0.015), y0 + 2.22, d.z + 0.08, tint(M.chrome, '#b08a4a'), { occlude: false });
    }
    // stair flights: A (front landing -> half landing, left half, +z), B (half landing -> next floor, right half, -z)
    const ya = y0, yb = y0 + half, yc = y0 + L.fh;
    k.stair(L.x0 + fw, zFront + L.landing, 0, 1, fw, ya, yb, st.tread, { run: L.run / Math.ceil(Math.round(L.fh / 0.19) / 2), stringer: st.stringer, rail: 'right', railMat: st.rail });
    k.box(L.x0, yb - 0.2, zBackL, L.x1, yb, L.ze, st.tread, { collide: true });
    k.box(L.x0, yb - 0.2, zBackL, L.x1, yb - 0.2, L.ze, M.ceilingPlaster, { faces: 0b000100, occlude: false });
    k.stair(L.x1 - fw, zBackL, 0, -1, fw, yb, yc, st.tread, { run: L.run / Math.ceil(Math.round(L.fh / 0.19) / 2), stringer: st.stringer, rail: 'right', railMat: st.rail });
    // newel post + bulb on the landing, half-landing window light
    k.box(L.x0 + fw - 0.06, ya, zFront + L.landing - 0.06, L.x0 + fw + 0.06, ya + 1.1, zFront + L.landing + 0.06, st.rail, { collide: true });
    P.bareBulb(k, (L.x0 + L.x1) / 2, (WALL_T + L.zs) / 2 + 0.5, y0 + L.fh - 0.25, st.bulbI * (r.chance(0.12) ? 0.25 : 1));
    if (r.chance(0.7)) P.bareBulb(k, (L.x0 + L.x1) / 2, (zBackL + L.ze) / 2, yb + 2.4 > yc + 1 ? yc : yb + 2.3, st.bulbI * 0.7);
    P.radiator(k, { x: L.x0 + 0.02, z: L.zs - 1.2, yaw: -Math.PI / 2 }, 0.6);
    if (f > 0 && r.chance(0.3)) P.trashCan(k, L.x1 - 0.35, L.zs - 0.4);
    if (prevCell >= 0) k.portalFloor(prevCell, cell, L.x0, L.zs + L.landing, L.x1, L.ze, y0);
    k.marker('hide', L.x1 - 0.4, y0, L.ze - 0.4, `under stair ${f}`);
    if (f === 0) k.marker('stash', L.x1 - 0.3, 0, L.ze - 0.3, 'behind the stair radiator');
    for (const q of lp) loftFloor(c, q.rc, y0, L, q.side, f, q.dz);
    if (top && L.roof) roofTop(c, L, cell);
    if (top && !L.roof) k.ceiling(L.x0, L.zs + L.landing, L.x1, L.ze, yc - 0.01, st.ceil);
    k.use(cell);
    prevCell = cell;
  }
  if (sro) k.slot('desk_clerk', (L.x0 + L.x1) / 2, 0, WALL_T + L.vest + 0.8, Math.PI);
}

/** Loft building: freight lobby, stair to every floor and the roof, open loft floors on 1-2 levels. */
export function genLoft(c: GenCtx) {
  const { unit: u, r } = c;
  const L = coreLayout(u, c.b);
  const avoid: [number, number, number, number][] = [[L.x0 - 0.15, 0, L.x1 + 0.15, L.ze + 0.15]];
  const plans: LoftPlan[] = [];
  for (let f = 1; f <= Math.min(2, L.floors - 1); f++) {
    for (const side of r.shuffle(['x0', 'x1'] as ('x0' | 'x1')[])) {
      const wallX = side === 'x0' ? L.x0 - 0.12 : L.x1 + 0.12;
      const seed: [number, number, number, number] = side === 'x0' ? [wallX - 3, L.zs - 3, wallX, L.zs] : [wallX, L.zs - 3, wallX + 3, L.zs];
      const rc = fitRect(c.ring, seed, side === 'x0' ? [wallX - 24, WALL_T, wallX, L.ze + 18] : [wallX, WALL_T, wallX + 24, L.ze + 18], avoid);
      if (rc[2] - rc[0] < 5 || rc[3] - rc[1] < 5) continue;
      plans.push({ f, side, rc, dz: Math.min(rc[3] - 1, Math.max(rc[1] + 0.9, L.zs - 1.4)) });
      break;
    }
  }
  genTenement(c, false, 'loft', plans);
}

function loftFloor(c: GenCtx, rc: [number, number, number, number], y0: number, L: CoreLayout, side: 'x0' | 'x1', f: number, dz: number) {
  const { k, r } = c; const H = L.fh - 0.25;
  const hall = k.cur;
  const cell = k.cell(`loft${f}`, [rc[0], y0, rc[1], rc[2], y0 + H, rc[3]], f);
  const wallX = side === 'x0' ? rc[2] : rc[0];
  const op = { y0, y1: y0 + 2.4 };
  const ops = side === 'x0' ? { x1: [{ ...op, s0: dz - 0.7 - rc[1], s1: dz + 0.7 - rc[1] }] } : { x0: [{ ...op, s0: rc[3] - (dz + 0.7), s1: rc[3] - (dz - 0.7) }] };
  const atFacade = rc[1] <= WALL_T + 0.3;
  const wins: { s0: number; s1: number; y0: number; y1: number }[] = [];
  { const [wy0, wy1] = floorWindowY(c, f); for (const [a0, a1] of bayWindowSpans(c, rc[0], rc[2])) wins.push({ s0: a0 - rc[0], s1: a1 - rc[0], y0: Math.max(y0 + 0.3, wy0), y1: Math.min(y0 + H - 0.2, wy1) }); }
  k.room(rc[0], rc[1], rc[2], rc[3], y0, y0 + H, { floor: M.planksWorn, wall: r.pick([M.brickPainted, M.plasterCream, tint(M.plasterGreen, '#9aa286')]), ceiling: M.ceilingPlaster }, { ...ops, ...(atFacade ? { z0: wins } : {}) });
  if (atFacade) for (const q of wins) { k.portalRect(cell, -1, rc[0] + q.s0, rc[1], rc[0] + q.s1, rc[1], q.y0, q.y1); k.box(rc[0] + q.s0, q.y0, rc[1] - 0.02, rc[0] + q.s1, q.y1, rc[1] - 0.01, M.glass, { glass: true, occlude: false }); }
  if (hall >= 0) { k.portalRect(hall, cell, wallX, dz - 0.7, wallX, dz + 0.7, y0, y0 + 2.4); k.use(hall); k.door(`${c.unit.id}:loft${f}`, side === 'x0' ? L.x0 + 0.03 : L.x1 - 0.03, y0, side === 'x0' ? dz + 0.7 : dz - 0.7, 1.4, 2.4, side === 'x0' ? Math.PI / 2 : -Math.PI / 2, 1, { cellA: hall, cellB: cell, mat: tint(M.steel, '#6a6a5a'), locked: !(r.chance(0.75)) }); k.use(cell); }
  // columns on a grid, fluorescent rows, work: sewing rows or cutting tables, rolling racks, bolts, a pressing table
  const W = rc[2] - rc[0], D = rc[3] - rc[1];
  for (let x = rc[0] + 5; x < rc[2] - 2; x += 5.5) for (let z = rc[1] + 5; z < rc[3] - 2; z += 5.5) k.cyl(x, y0, z, 0.18, H, M.paintGrey, 10, { collide: 'cover' });
  for (let x = rc[0] + 1.5; x < rc[2] - 1; x += 2.6) for (let z = rc[1] + 1.5; z < rc[3] - 1; z += 3.2) P.fluorescent(k, x, z, y0 + H, 2.4, 1.8, 0, r.chance(0.05) ? 1 : 0);
  const mode = r.pick(['sewing', 'cutting', 'mixed'] as const);
  if (mode !== 'cutting') for (let z = rc[1] + 1.6; z < rc[3] - 1.5; z += 1.5) for (let x = rc[0] + 1.2; x < rc[0] + W * (mode === 'mixed' ? 0.5 : 0.9); x += 1.25) {
    if (r.chance(0.1)) continue;
    // sewing machines face the windows; local frame +z -> table depth
    const ss = { x, z, yaw: Math.PI };
    k.box(x - 0.55, y0, z - 0.3, x + 0.55, y0 + 0.74, z + 0.3, M.woodLight, { collide: 'cover', faces: 0b111000 | 0b000011, occlude: false });
    void ss; P.sewingMachine(k, { x, z, yaw: Math.PI });
    if (r.chance(0.35)) k.slot('garment_worker', x, y0, z + 0.65, 0);
    k.light(x, y0 + 1.15, z, [1, 0.85, 0.65], 0.25, 'bulb');
  }
  if (mode !== 'sewing') { const len = Math.min(D - 3, 9); P.cuttingTable(k, { x: rc[0] + W * (mode === 'mixed' ? 0.62 : 0.3), z: rc[1] + 1.5, yaw: -Math.PI / 2 }, len); k.slot('cutter', rc[0] + W * 0.62 + 1.0, y0, rc[1] + 3, Math.PI / 2); }
  for (let q = 0; q < r.int(2, 6); q++) P.rollingRack(k, { x: rc[0] + r.range(1, W - 2.5), z: rc[3] - r.range(0.8, 2.5), yaw: r.pick([0, Math.PI / 2]) }, 1.5);
  P.payphone(k, { x: wallX + (side === 'x0' ? -0.02 : 0.02), z: dz + 1.6, yaw: side === 'x0' ? Math.PI / 2 : -Math.PI / 2 });
  // freight elevator gate (decorative) and a time clock by the door
  k.box(rc[0] + 0.2, y0, rc[3] - 0.08, rc[0] + 2.2, y0 + 2.3, rc[3] - 0.03, tint(M.steel, '#4a4a42'), { occlude: false });
  k.light(rc[0] + 1.2, y0 + 2.6, rc[3] - 0.6, [1, 0.8, 0.5], 0.6, 'bulb');
  k.marker('hide', rc[2] - 0.8, y0, rc[3] - 0.8, 'behind racks');
  k.use(hall >= 0 ? hall : cell);
}

/** Elevator apartment house lobby: marble, mirror, elevator, mailboxes, stair door. */
export function genApartmentLobby(c: GenCtx) {
  const { k, unit: u, r } = c;
  const L = coreLayout(u, c.b);
  const st = vstyle(c, 'apartment');
  const H = Math.min(4.2, L.fh * 1.15);
  const cell = k.cell('lobby', [L.x0, 0, WALL_T, L.x1, H, L.ze], 0);
  coreFacade(c, cell, { ...L, fh: H }, M.marble, M.chrome, tint(M.chrome, '#a8a49a'), true);
  k.room(L.x0, WALL_T, L.x1, L.ze, 0, H, { floor: st.floor, wall: st.wall, ceiling: st.ceil, wallZ1: M.marble }, {}, { skip: ['z0'] });
  P.elevatorDoors(k, { x: (L.x0 + L.x1) / 2, z: L.ze - 0.02, yaw: 0 }, Math.min(1.1, L.x1 - L.x0 - 1));
  P.mailboxes(k, { x: L.x1 - 0.02, z: WALL_T + 1.2, yaw: Math.PI / 2 }, 6, 4);
  P.mirror(k, { x: L.x0 + 0.02, z: (WALL_T + L.ze) / 2, yaw: -Math.PI / 2 }, 1.2, 1.4, 0.8);
  if (u.w > 4) { P.armchair(k, { x: L.x0 + 0.6, z: L.ze - 2.2, yaw: -Math.PI / 2 }, r.pick([M.vinylGreen, M.fabricCamel])); k.slot('doorman', L.x1 - 0.7, 0, WALL_T + 1.8, Math.PI / 2); }
  for (let z = WALL_T + 1.5; z < L.ze - 1; z += 2.5) P.globeLight(k, (L.x0 + L.x1) / 2, z, H, 1.8);
  k.marker('hide', L.x0 + 0.4, 0, L.ze - 0.5, 'stair door alcove');
}

export { coreFacade };

/**
 * Fire-stair tower (office and hotel lobbies): a stair compartment at the back corner, entered from the
 * lobby through a door, rising through every floor (locked floor doors) to a roof bulkhead.
 */
export function stairTower(c: GenCtx, L: CoreLayout, lobbyCell: number, open: number[] = []): number[] {
  const cells: number[] = [];
  const { k, unit: u } = c;
  const fw = L.flightW, half = L.fh / 2, zBackL = L.zs + L.landing + L.run;
  const wall = M.plasterCream, tread = M.concrete;
  const run = L.run / Math.ceil(Math.round(L.fh / 0.19) / 2);
  let prev = -1;
  for (let f = 0; f < L.floors; f++) {
    const y0 = f * L.fh;
    const cell = k.cell(`fire_stair${f}`, [L.x0, y0, L.zs, L.x1, y0 + L.fh, L.ze], f);
    const dx0 = L.x0 + 0.2, dx1 = dx0 + 0.9;
    // front wall (toward the lobby / floor) with the stair door, both faces
    k.wall(L.x1, L.zs, L.x0, L.zs, y0, y0 + L.fh, wall, 1, [{ s0: L.x1 - dx1, s1: L.x1 - dx0, y0, y1: y0 + 2.1, depth: 0.15 }]);
    k.wall(L.x0, L.zs - 0.15, L.x1, L.zs - 0.15, y0, y0 + L.fh, f === 0 ? M.marble : wall, -1, [{ s0: dx0 - L.x0, s1: dx1 - L.x0, y0, y1: y0 + 2.1 }], { collide: false });
    k.wall(L.x1, L.zs, L.x1, L.ze, y0, y0 + L.fh, wall, 1);
    k.wall(L.x0, L.ze, L.x0, L.zs, y0, y0 + L.fh, wall, 1);
    k.wall(L.x1, L.ze, L.x0, L.ze, y0, y0 + L.fh, wall, 1);
    if (f === 0) { k.floor(L.x0, L.zs, L.x1, L.zs + L.landing, 0, tread); k.portalRect(lobbyCell, cell, dx0, L.zs - 0.15, dx1, L.zs - 0.15, 0, 2.1); }
    else k.box(L.x0, y0 - 0.2, L.zs, L.x1, y0, L.zs + L.landing, tread, { collide: true, faces: 0b001100 });
    k.door(`${u.id}:fire${f}`, dx0, y0, L.zs - 0.07, 0.9, 2.1, 0, f === 0 ? -1 : 1, { cellA: cell, cellB: f === 0 ? lobbyCell : -1, locked: f > 0 && !open.includes(f), mat: tint(M.steel, '#5a5a52') });
    cells.push(cell);
    k.box(dx0, y0 + 2.2, L.zs - 0.18, dx0 + 0.35, y0 + 2.35, L.zs - 0.16, M.exitSign, { occlude: false });
    k.stair(L.x0 + fw, L.zs + L.landing, 0, 1, fw, y0, y0 + half, tread, { run, stringer: M.paintGrey, rail: 'right', railMat: M.paintGrey });
    k.box(L.x0, y0 + half - 0.2, zBackL, L.x1, y0 + half, L.ze, tread, { collide: true });
    k.stair(L.x1 - fw, zBackL, 0, -1, fw, y0 + half, y0 + L.fh, tread, { run, stringer: M.paintGrey, rail: 'right', railMat: M.paintGrey });
    P.bareBulb(k, (L.x0 + L.x1) / 2, L.zs + 0.5, y0 + L.fh - 0.2, 1.2);
    if (prev >= 0) k.portalFloor(prev, cell, L.x0, L.zs + L.landing, L.x1, L.ze, y0);
    if (f === L.floors - 1) roofTop(c, L, cell);
    prev = cell;
  }
  k.marker('hide', L.x1 - 0.4, 0, L.ze - 0.4, 'fire stair');
  k.use(lobbyCell);
  return cells;
}

/** Low taxpayer roof access: a steep two-lane switchback ship's stair in the back room up to a hatch bulkhead. */
export function shipLadder(c: GenCtx, backCell: number, H: number) {
  const { k, unit: u } = c;
  const [hx0, hz0, hx1, hz1] = shopRoofHatch(u);
  const roofY = Math.max(H + 0.5, c.b.top - u.y);
  const n = Math.max(2, Math.ceil(roofY / 2.05)); const rise = roofY / n;
  const lane = (hx1 - hx0) / 2, land = 0.55, runL = hz1 - hz0 - 2 * land;
  k.use(backCell);
  let prevCell = backCell;
  for (let q = 0; q < n; q++) {
    const y0 = q * rise; const a = q % 2 === 0;
    if (q > 0) {
      const cell = k.cell(`ladder${q}`, [hx0, y0 - 0.2, hz0, hx1, y0 + rise, hz1], q);
      k.wall(hx1, hz0, hx1, hz1, y0 - 0.2, y0 + rise, M.brickPainted, 1); k.wall(hx0, hz1, hx0, hz0, y0 - 0.2, y0 + rise, M.brickPainted, 1);
      k.wall(hx0, hz0, hx1, hz0, y0 - 0.2, y0 + rise, M.brickPainted, 1); k.wall(hx1, hz1, hx0, hz1, y0 - 0.2, y0 + rise, M.brickPainted, 1);
      k.portalFloor(prevCell, cell, hx0, hz0, hx1, hz1, y0); prevCell = cell;
    }
    // landing at the start end, flight to the other end
    if (a) { k.box(hx0, y0 - 0.12, hz1 - land, hx1, y0, hz1, M.steel, { collide: q > 0 }); k.stair(hx1, hz1 - land, 0, -1, lane, y0, y0 + rise, M.steel, { run: runL / Math.max(2, Math.round(rise / 0.19)), stringer: M.paintGrey, rail: 'left', railMat: M.steel, soffit: null }); }
    else { k.box(hx0, y0 - 0.12, hz0, hx1, y0, hz0 + land, M.steel, { collide: true }); k.stair(hx0 + lane, hz0 + land, 0, 1, lane, y0, y0 + rise, M.steel, { run: runL / Math.max(2, Math.round(rise / 0.19)), stringer: M.paintGrey, rail: 'left', railMat: M.steel, soffit: null }); }
  }
  // tiny bulkhead hut over the hatch, reusing the roof dressing
  const L: CoreLayout = { x0: hx0, x1: hx1, zs: hz0, ze: hz1, landing: land, run: runL, flightW: lane, floors: Math.max(1, c.b.floors), fh: roofY / Math.max(1, c.b.floors), roofY, vest: 0, stairs: true, roof: true };
  roofTop(c, L, prevCell);
  k.use(backCell);
}
