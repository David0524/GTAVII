/**
 * Tier A: the Hotel Corwin (content/interiors.json interior.corwin_lobby, with children floor 11,
 * basement and Teddy's room 9F from content/homes.json). An SRO in a 1909 eleven-storey
 * building on W 31st St: grade WORN. Hand-directed on top of the kit.
 *
 * contains (lobby): desk behind glass, mailboxes, room-key board, lobby chairs, elevator, desk phone
 * contains (floor 11): corridor, room 1104 (Odessa), room 1112 (Hollis), shared bathroom, window to the Empire State
 * 9F portrait: footlocker table, face-down academy photo, expired hack licence in the mirror,
 *              Saint Christopher on a nail, broken window AC with a towel, Carmen's tupperware, hot plate and one pan
 */
import { M, tint, type Mat } from '../../kit/materials';
import * as P from '../../kit/props';
import type { Kit } from '../../kit/Kit';
import { type GenCtx, WALL_T, PARTY, fitRect } from '../common';
import { coreFacade, stairTower } from '../vertical';
import { towerLayout } from '../../layout';

/** Empire State Building (world.json hero) for the 11th-floor window. */
const ESB = { x: -131.4, z: -861.1 };
const NICOTINE = tint(M.plasterCream, '#c8b07a');
const HALL_WALL = tint(M.dadoHall, '#bfae84');

export function genCorwin(c: GenCtx) {
  const { k, unit: u, r } = c;
  const H = 4.2;
  const L = towerLayout(u, c.b);
  const x0 = PARTY, x1 = u.w - PARTY, zl = L.zs - 0.15;
  const lobby = k.cell('corwin_lobby', [x0, 0, WALL_T, x1, H, zl], 0);
  coreFacade(c, lobby, { ...L, fh: H }, NICOTINE, tint(M.chrome, '#8a7a5a'), M.woodDark, true);
  k.room(x0, WALL_T, x1, zl, 0, H, { floor: tint(M.hexWhite, '#c9bfa6'), wall: NICOTINE, ceiling: M.tin, wallZ1: HALL_WALL }, {}, { skip: ['z0', 'z1'] });
  // back wall left of the stair tower (the tower draws its own front)
  k.wall(L.x0 - 0.15, zl, x0, zl, 0, H, HALL_WALL, 1);
  // --- desk behind glass: counter along the right wall, glass to 2.4 m with a pass-through, key board behind
  const cx = Math.min(L.x0 - 0.4, x1 - 2.3), cz0 = WALL_T + 1.6, cz1 = Math.min(zl - 1.0, cz0 + 3.6);
  k.box(cx - 0.6, 0, cz0, cx, 1.05, cz1, M.paneling, { collide: 'cover' });
  k.box(cx - 0.75, 1.05, cz0 - 0.05, cx + 0.05, 1.09, cz1 + 0.05, M.woodDark);
  k.box(cx - 0.62, 1.09, cz0, cx - 0.6, 2.45, cz1, M.glass, { glass: true, occlude: false });
  k.box(cx - 0.64, 2.45, cz0, cx - 0.58, 2.6, cz1, M.woodDark, { occlude: false });
  k.collider({ c: [cx - 0.61, 1.75, (cz0 + cz1) / 2], h: [0.03, 0.7, (cz1 - cz0) / 2], yaw: 0 });
  k.box(cx - 0.6, 1.09, cz0 - 0.02, x1, 2.6, cz0, M.paneling, { collide: true }); // cage end wall
  k.box(cx - 0.68, 1.09, (cz0 + cz1) / 2 - 0.25, cx - 0.56, 1.11, (cz0 + cz1) / 2 + 0.25, M.steel, { occlude: false }); // pass-through tray
  // room-key board: 11 rows of hooks + tags
  const kb = { x: x1 - 0.02, z: (cz0 + cz1) / 2, yaw: Math.PI / 2 };
  P.pbox(k, kb, -1.3, 1.2, -0.02, 1.3, 2.4, 0.02, M.woodDark, { occlude: false });
  for (let row = 0; row < 11; row++) for (let col = 0; col < 12; col++) if (r.chance(0.7)) P.pbox(k, kb, -1.2 + col * 0.2, 1.27 + row * 0.1, -0.035, -1.15 + col * 0.2, 1.34 + row * 0.1, -0.02, r.chance(0.6) ? tint(M.chrome, '#b08a4a') : M.paper, { occlude: false });
  // desk phone, register book, a bell, a small fan, the clerk
  k.box(cx - 0.5, 1.09, cz0 + 0.4, cx - 0.28, 1.19, cz0 + 0.62, M.black);
  k.box(cx - 0.55, 1.09, cz0 + 1.0, cx - 0.2, 1.12, cz0 + 1.4, tint(M.paper, '#7a2a24'));
  k.cyl(cx - 0.7, 1.09, cz1 - 0.4, 0.05, 0.05, tint(M.chrome, '#b08a4a'), 8);
  k.slot('desk_clerk', (cx + x1) / 2, 0, (cz0 + cz1) / 2, Math.PI / 2);
  k.marker('shop', cx - 1.2, 0, (cz0 + cz1) / 2, 'front desk (rooms by the week)');
  k.marker('register', cx - 0.3, 1.1, cz1 - 0.6, 'cash drawer');
  k.marker('payphone', cx - 0.4, 1.1, cz0 + 0.5, 'desk phone');
  // --- mailboxes on the left wall, lobby chairs, a standing ashtray, a sagging palm
  P.mailboxes(k, { x: x0 + 0.02, z: WALL_T + 1.2, yaw: -Math.PI / 2 }, 12, 6);
  for (let q = 0; q < 3; q++) { P.armchair(k, { x: x0 + 0.55, z: WALL_T + 3.6 + q * 1.05, yaw: -Math.PI / 2 }, r.pick([M.vinylBrown, M.vinylGreen, tint(M.vinylRed, '#6a2a24')])); }
  k.slot('resident_lobby', x0 + 0.55, 0.42, WALL_T + 4.65, -Math.PI / 2);
  k.marker('wait', x0 + 0.55, 0.42, WALL_T + 3.6, 'lobby chair');
  k.cyl(x0 + 0.6, 0, WALL_T + 6.9, 0.16, 0.7, M.steel, 10, { collide: true });
  // --- elevator: brass cage gate look, floor dial, an OUT OF ORDER card (stairs carry the story until request 5 ships)
  const ex = Math.max(x0 + 1.2, L.x0 - 1.6);
  P.elevatorDoors(k, { x: ex, z: zl - 0.02, yaw: 0 }, 1.1, 2.25, tint(M.chrome, '#7a6a42'));
  for (let q = 0; q < 9; q++) k.box(ex - 0.5 + q * 0.125, 0.05, zl - 0.09, ex - 0.49 + q * 0.125, 2.2, zl - 0.07, tint(M.chrome, '#7a6a42'), { occlude: false });
  k.box(ex - 0.15, 1.3, zl - 0.1, ex + 0.15, 1.5, zl - 0.095, M.sign, { occlude: false });
  // light: two flickering tubes and a dim globe, tired grade
  P.fluorescent(k, (x0 + x1) / 2, WALL_T + 2.2, H, 1.22, 3.2, Math.PI / 2, 0);
  P.fluorescent(k, cx - 0.3, (cz0 + cz1) / 2, H, 1.22, 2.4, 0, 1); // the clerk's tube flickers
  P.globeLight(k, (x0 + x1) / 2, zl - 2.2, H, 2.6);
  P.globeLight(k, x0 + 1.2, WALL_T + 5, H, 2.0);
  P.radiator(k, { x: x0 + 0.02, z: zl - 1.6, yaw: -Math.PI / 2 }, 0.9);
  k.marker('spawn', u.door.t, 0, WALL_T + 1.4, 'Corwin lobby');
  // --- the stair to every floor; floors 9 (index 8) and 11 (index 10) are open
  const top = L.floors - 1, nine = Math.min(8, top - 1);
  const stairs = stairTower(c, L, lobby, [nine, top]);
  corridor(c, L, stairs[nine], nine, '9', [{ label: '9F', open: true, dress: teddy }]);
  corridor(c, L, stairs[top], top, `${L.floors}`, [{ label: `${L.floors}04`, open: true, dress: (kk, rc, y) => tenant(kk, rc, y, 'Odessa') }, { label: `${L.floors}12`, open: true, dress: (kk, rc, y) => tenant(kk, rc, y, 'Hollis') }], true);
  k.use(lobby);
}

type Dress = (k: Kit, rc: [number, number, number, number], y0: number) => void;
/** SRO corridor on floor f off the stair door: rooms both sides, numbered; listed rooms open and dressed. */
function corridor(c: GenCtx, L: ReturnType<typeof towerLayout>, stairCell: number, f: number, floorLabel: string, open: { label: string; open: boolean; dress: Dress }[], bathAndView = false) {
  const { k, unit: u, r } = c;
  const y0 = f * L.fh, H = Math.min(3.0, L.fh - 0.25);
  const dx0 = L.x0 + 0.2;
  const cz1 = L.zs - 0.15, cz0 = cz1 - 1.6;
  // corridor runs from the stair door along -x as far as the footprint allows
  const rc = fitRect(c.ring, [dx0 - 1, cz0, L.x1, cz1], [-30, cz0, L.x1, cz1], [], 0.3);
  const cx0 = rc[0];
  const cell = k.cell(`floor${floorLabel}_corridor`, [cx0, y0, cz0, L.x1, y0 + H, cz1], f);
  k.portalRect(stairCell, cell, dx0, cz1, dx0 + 0.9, cz1, y0, y0 + 2.1);
  // rooms in front (z < cz0) and behind (z > cz1, left of the stair tower), 3.0 m wide
  // the view window: back wall (local +z) when the tower lies more inward than sideways, else the corridor end wall
  const esbLx0 = (ESB.x - u.ox) * u.ux + (ESB.z - u.oz) * u.uz, esbLz0 = (ESB.x - u.ox) * u.nx + (ESB.z - u.oz) * u.nz;
  const viewBack = bathAndView && esbLz0 > Math.abs(esbLx0) * 0.6;
  // measured (docs/interiors/corwin_sightline.txt): the tower's upper shaft clears the neighbours only from the north face's
  // west half; the Broadway (east) end is blocked by taller neighbours. So the bay sits at the corridor end away from Broadway.
  const bayAtLeft = esbLx0 > 0;
  type Room = { label: string; rc: [number, number, number, number]; front: boolean; door: number };
  const rooms: Room[] = [];
  let n = 1;
  const front = fitRect(c.ring, [cx0, cz0 - 3, L.x1, cz0], [cx0, WALL_T, L.x1, cz0], [], 0.25);
  for (let x = front[2]; x - 2.9 >= front[0]; x -= 3.0) rooms.push({ label: `${floorLabel}${String(n++).padStart(2, '0')}`, rc: [x - 3.0 + 0.06, Math.max(WALL_T, front[1]), x - 0.06, cz0], front: true, door: x - 1.0 });
  const back = fitRect(c.ring, [cx0, cz1, L.x0 - 0.3, cz1 + 2.5], [cx0, cz1, L.x0 - 0.3, cz1 + 4.0], [], 0.25);
  const bx0 = back[0] + (viewBack && bayAtLeft ? 1.8 : 0), bx1 = back[2] - (viewBack && !bayAtLeft ? 1.8 : 0);
  if (back[3] - back[1] > 2.4) for (let x = bx0; x + 2.9 <= bx1; x += 3.0) rooms.push({ label: `${floorLabel}${String(n++).padStart(2, '0')}`, rc: [x + 0.06, cz1, x + 3.0 - 0.06, back[3]], front: false, door: x + 1.0 });
  // assign the story labels: requested labels replace the generic ones (9F is a letter on the 9th floor)
  for (let q = 0; q < open.length && q < rooms.length; q++) {
    const want = open[q].label; const at = /\d{2}$/.test(want) ? Math.min(rooms.length - 1, Math.max(0, parseInt(want.slice(-2), 10) - 1)) : Math.min(rooms.length - 1, 5);
    const free = (i: number) => !open.slice(0, q).some((o) => o.label === rooms[i].label);
    let i = at; while (!free(i) && i > 0) i--;
    rooms[i].label = want;
  }
  const bath = bathAndView && rooms.length > 3 ? [...rooms].reverse().find((q) => !open.some((o) => o.label === q.label)) ?? null : null;
  if (bath) bath.label = 'BATH';
  // corridor shell: walls with door openings on both sides
  const opsFront = rooms.filter((q) => q.front).map((q) => ({ s0: q.door - 0.45 - cx0, s1: q.door + 0.45 - cx0, y0, y1: y0 + 2.05, depth: 0.12 }));
  const opsBack = rooms.filter((q) => !q.front).map((q) => ({ s0: L.x1 - (q.door + 0.45), s1: L.x1 - (q.door - 0.45), y0, y1: y0 + 2.05, depth: 0.12 }));
  opsBack.push({ s0: L.x1 - (dx0 + 0.9), s1: L.x1 - dx0, y0, y1: y0 + 2.1, depth: 0 });
  const viewOps: { s0: number; s1: number; y0: number; y1: number }[] = [];
  // the corridor-end window: on the end wall that faces the Empire State (local x direction)
  const esbLx = (ESB.x - u.ox) * u.ux + (ESB.z - u.oz) * u.uz;
  const viewAtLeft = esbLx < 0;
  if (bathAndView && !viewBack) viewOps.push({ s0: 0.2, s1: 1.4, y0: y0 + 0.75, y1: y0 + 2.45 });
  // back-wall bay: a 1.5 m window in the corridor's back wall at the end nearest the tower
  const bayX0 = bayAtLeft ? cx0 + 0.15 : L.x0 - 1.75, bayX1 = bayX0 + 1.5;
  if (viewBack) opsBack.push({ s0: L.x1 - bayX1, s1: L.x1 - bayX0, y0, y1: y0 + 2.45, depth: 0.12 });
  k.floor(cx0, cz0, L.x1, cz1, y0, tint(M.lino, '#6a5a44'));
  k.box(cx0, y0 - 0.25, cz0, L.x1, y0, cz1, M.concrete, { collide: true, faces: 0b000100 });
  k.ceiling(cx0, cz0, L.x1, cz1, y0 + H, M.ceilingPlaster);
  k.wall(cx0, cz0, L.x1, cz0, y0, y0 + H, HALL_WALL, 1, opsFront);
  k.wall(L.x1, cz1, cx0, cz1, y0, y0 + H, HALL_WALL, 1, opsBack);
  k.wall(cx0, cz1, cx0, cz0, y0, y0 + H, HALL_WALL, 1, viewAtLeft ? viewOps : []);
  k.wall(L.x1, cz0, L.x1, cz1, y0, y0 + H, HALL_WALL, 1, viewAtLeft ? [] : viewOps);
  if (viewBack) {
    // a short passage north from the corridor to the exterior wall, window at its end
    const pr = fitRect(c.ring, [bayX0, cz1, bayX1, cz1 + 0.5], [bayX0, cz1, bayX1, cz1 + 24], [], 0.15);
    const pz1 = Math.max(cz1 + 0.6, pr[3]);
    const pc = k.cell(`floor${floorLabel}_view`, [bayX0, y0, cz1, bayX1, y0 + H, pz1], f);
    k.portalRect(cell, pc, bayX1, cz1, bayX0, cz1, y0, y0 + 2.45);
    k.room(bayX0, cz1, bayX1, pz1, y0, y0 + H, { floor: tint(M.lino, '#6a5a44'), wall: HALL_WALL, ceiling: M.ceilingPlaster }, { z0: [{ s0: 0, s1: 1.5, y0, y1: y0 + 2.45 }], z1: [{ s0: 0.15, s1: 1.35, y0: y0 + 0.75, y1: y0 + 2.45, depth: 0.25 }] });
    k.portalRect(pc, -1, bayX1 - 0.15, pz1, bayX0 + 0.15, pz1, y0 + 0.75, y0 + 2.45);
    k.box(bayX0 + 0.15, y0 + 0.75, pz1 + 0.12, bayX1 - 0.15, y0 + 2.45, pz1 + 0.13, M.glass, { glass: true, occlude: false });
    k.box(bayX0 + 0.1, y0 + 0.72, pz1 - 0.2, bayX1 - 0.1, y0 + 0.76, pz1 + 0.1, M.woodDark, { occlude: false });
    k.box((bayX0 + bayX1) / 2 - 0.02, y0 + 0.75, pz1 + 0.1, (bayX0 + bayX1) / 2 + 0.02, y0 + 2.45, pz1 + 0.14, M.enamelCream, { occlude: false });
    P.radiator(k, { x: bayX0 + 0.3, z: pz1 - 0.2, yaw: 0 }, 0.9);
    P.bareBulb(k, (bayX0 + bayX1) / 2, (cz1 + pz1) / 2, y0 + H, 0.8);
    k.marker('prop', (bayX0 + bayX1) / 2, y0, pz1 - 0.5, 'window to the Empire State');
    k.marker('wait', (bayX0 + bayX1) / 2, y0, pz1 - 0.5, 'the window at the end of the hall');
    k.use(cell);
  } else if (bathAndView) {
    const wx = viewAtLeft ? cx0 : L.x1, sgn = viewAtLeft ? 1 : -1;
    k.portalRect(cell, -1, wx, cz0 + 0.2, wx, cz0 + 1.4, y0 + 0.75, y0 + 2.45);
    k.box(wx - 0.01, y0 + 0.75, cz0 + 0.2, wx + 0.01, y0 + 2.45, cz0 + 1.4, M.glass, { glass: true, occlude: false });
    k.box(wx + sgn * 0.02, y0 + 0.78, cz0 + 0.3, wx + sgn * 0.25, y0 + 0.82, cz0 + 1.3, M.woodDark, { occlude: false });
    k.marker('prop', wx + sgn * 0.6, y0, cz0 + 0.8, 'window to the Empire State');
    k.marker('wait', wx + sgn * 0.6, y0, cz0 + 0.8, 'the window at the end of the hall');
  }
  for (let x = cx0 + 1.5; x < L.x1; x += 4) P.bareBulb(k, x, (cz0 + cz1) / 2, y0 + H, r.chance(0.2) ? 0.3 : 1.0);
  P.payphone(k, { x: L.x1 - 0.02, z: (cz0 + cz1) / 2, yaw: Math.PI / 2 }, `hall phone, floor ${floorLabel}`);
  k.marker('hide', cx0 + 0.4, y0, cz1 - 0.3, 'linen closet');
  k.marker('stash', cx0 + 0.3, y0 + 2.6, cz0 + 0.3, 'loose ceiling tile');
  // doors and rooms
  for (const q of rooms) {
    const story = open.find((o) => o.label === q.label);
    const isOpen = !!story || (q === bath);
    const hx = q.front ? q.door + 0.45 : q.door - 0.45, hz = q.front ? cz0 + 0.03 : cz1 - 0.03;
    k.door(`${u.id}:room${q.label}`, hx, y0, hz, 0.9, 2.05, q.front ? Math.PI : 0, q.front ? -1 : -1, { locked: !isOpen, cellA: cell, cellB: -1, mat: tint(M.paintBrown, '#5a3a2a'), key: `key.corwin.${q.label}` });
    k.box(q.door - 0.1, y0 + 2.12, (q.front ? cz0 + 0.015 : cz1 - 0.015) - 0.005, q.door + 0.1, y0 + 2.22, (q.front ? cz0 + 0.015 : cz1 - 0.015) + 0.005, tint(M.chrome, '#b08a4a'), { occlude: false });
    if (!isOpen) continue;
    const rcell = k.cell(`room_${q.label}`, [q.rc[0], y0, q.rc[1], q.rc[2], y0 + H, q.rc[3]], f);
    const dz = q.front ? q.rc[3] : q.rc[1];
    k.portalRect(cell, rcell, q.door - 0.45, dz, q.door + 0.45, dz, y0, y0 + 2.05);
    const roomOps = { s0: q.front ? q.door - 0.45 - q.rc[0] : q.rc[2] - (q.door + 0.45), s1: q.front ? q.door + 0.45 - q.rc[0] : q.rc[2] - (q.door - 0.45), y0, y1: y0 + 2.05 };
    const atFacade = q.front && q.rc[1] <= WALL_T + 0.3;
    const win = { s0: 1.0, s1: 2.0, y0: y0 + 0.85, y1: y0 + 2.35 };
    if (q === bath) {
      k.room(q.rc[0], q.rc[1], q.rc[2], q.rc[3], y0, y0 + H, { floor: M.hexWhite, wall: M.subway, ceiling: M.ceilingPlaster }, q.front ? { z1: [{ ...roomOps, s0: q.rc[2] - (q.door + 0.45), s1: q.rc[2] - (q.door - 0.45) }] } : { z0: [roomOps] });
      bathroom(k, q.rc, y0);
    } else {
      // front rooms: door in the z1 wall (runs from x1 to x0), window in z0 (facade); back rooms: door in z0, airshaft window in z1
      const ops = q.front ? { z1: [{ ...roomOps, s0: q.rc[2] - (q.door + 0.45), s1: q.rc[2] - (q.door - 0.45) }], ...(atFacade ? { z0: [win] } : {}) } : { z0: [roomOps], z1: [{ s0: (q.rc[2] - q.rc[0]) - 2.0, s1: (q.rc[2] - q.rc[0]) - 1.0, y0: win.y0, y1: win.y1 }] };
      k.room(q.rc[0], q.rc[1], q.rc[2], q.rc[3], y0, y0 + H, { floor: tint(M.planksWorn, '#4a3424'), wall: r.pick([NICOTINE, tint(M.wallpaper, '#9a8460'), tint(M.plasterGreen, '#8a9070')]), ceiling: M.ceilingPlaster }, ops);
      if (atFacade) { k.portalRect(rcell, -1, q.rc[0] + win.s0, q.rc[1], q.rc[0] + win.s1, q.rc[1], win.y0, win.y1); k.box(q.rc[0] + win.s0, win.y0, q.rc[1] - 0.02, q.rc[0] + win.s1, win.y1, q.rc[1] - 0.01, M.glass, { glass: true, occlude: false }); }
      story!.dress(k, q.rc, y0);
    }
    P.bareBulb(k, (q.rc[0] + q.rc[2]) / 2, (q.rc[1] + q.rc[3]) / 2, y0 + H, 1.0);
    k.use(cell);
  }
  k.use(stairCell);
}

function bathroom(k: Kit, rc: [number, number, number, number], y0: number) {
  const [x0, z0, x1, z1] = rc;
  k.box(x0 + 0.1, y0, z1 - 0.8, x0 + 1.75, y0 + 0.6, z1 - 0.1, M.porcelain, { collide: 'cover' }); // clawfoot-era tub as a box
  for (let q = 0; q < 2; q++) { const x = x1 - 0.5 - q * 0.9; k.box(x - 0.42, y0, z0 + 0.1, x - 0.4, y0 + 1.9, z0 + 1.3, M.paintGrey, { occlude: false }); k.box(x - 0.2, y0, z0 + 0.15, x + 0.2, y0 + 0.42, z0 + 0.6, M.porcelain, { collide: true }); }
  P.sink(k, { x: x0 + 0.5, z: z0 + 0.35, yaw: Math.PI });
  P.mirror(k, { x: x0 + 0.5, z: z0 + 0.02, yaw: Math.PI }, 0.45, 0.6, y0 + 1.2);
  k.marker('hide', x1 - 0.5, y0, z0 + 0.6, 'toilet stall');
}

/** A tenant's room: iron bed, sink, dresser, chair, hot plate; named for markers. */
function tenant(k: Kit, rc: [number, number, number, number], y0: number, who: string) {
  const [x0, z0, x1, z1] = rc, r = k.rng;
  P.bed(k, { x: x0 + 0.55, z: z0 + 0.3, yaw: 0 }, 0.95, Math.min(1.95, z1 - z0 - 1.4), r.pick([M.fabricRust, M.fabricOlive, tint(M.fabricCamel, '#9a8a6a')]));
  P.sink(k, { x: x1 - 0.35, z: z1 - 0.9, yaw: Math.PI / 2 });
  P.dresser(k, { x: x1 - 0.55, z: z0 + 0.35, yaw: Math.PI }, 0.9);
  P.chair(k, { x: x0 + 1.8, z: z1 - 1.2, yaw: 0 });
  k.marker('prop', (x0 + x1) / 2, y0, (z0 + z1) / 2, `${who}'s room`);
  k.marker('burglary', x1 - 0.55, y0, z0 + 0.6, `${who}'s dresser`);
  k.slot(`resident_${who.toLowerCase()}`, x0 + 1.8, y0, z1 - 1.2, Math.PI);
  if (who === 'Hollis') { k.box(x1 - 0.8, y0 + 0.95, z0 + 0.2, x1 - 0.45, y0 + 1.15, z0 + 0.35, M.woodDark); k.marker('prop', x1 - 0.6, y0 + 1.0, z0 + 0.3, "Hollis's radio"); }
}

/** Teddy Arce, room 9F (content/homes.json portrait; act 1 state). Eight by ten, window onto an airshaft. */
function teddy(k: Kit, rc: [number, number, number, number], y0: number) {
  const [x0, z0, x1, z1] = rc;
  P.bed(k, { x: x0 + 0.55, z: z0 + 0.25, yaw: 0 }, 0.95, Math.min(1.95, z1 - z0 - 1.3), tint(M.fabricOlive, '#5a5a3a'));
  // army footlocker as a table, with the nightstick inside (act 1)
  const fx = x0 + 1.6, fz = z1 - 0.9;
  k.box(fx - 0.45, y0, fz - 0.25, fx + 0.45, y0 + 0.42, fz + 0.25, tint(M.paintDarkGreen, '#3a4a32'), { collide: 'cover' });
  k.box(fx - 0.4, y0 + 0.42, fz - 0.22, fx - 0.1, y0 + 0.44, fz + 0.02, M.paper); // academy photo, face down
  k.artSlot('photo', fx - 0.25, y0 + 0.445, fz - 0.1, 0.25, 0.2, 0, 0);
  k.artSlot('calendar', x0 + 0.03, y0 + 1.5, z0 + 2.0, 0.3, 0.45, 1, 0);
  k.marker('stash', fx, y0 + 0.2, fz, 'footlocker (nightstick, act 1)');
  // mirror with the expired hack licence tucked in it, Saint Christopher on a nail
  P.mirror(k, { x: x1 - 0.02, z: z1 - 1.0, yaw: Math.PI / 2 }, 0.4, 0.55, y0 + 1.3);
  k.box(x1 - 0.045, y0 + 1.33, z1 - 1.12, x1 - 0.04, y0 + 1.43, z1 - 0.98, tint(M.paper, '#d8c86a'), { occlude: false });
  k.box(x0 + 0.02, y0 + 1.6, z0 + 1.2, x0 + 0.03, y0 + 1.66, z0 + 1.26, tint(M.chrome, '#b08a4a'), { occlude: false });
  // broken window AC with a towel in it, on the airshaft window sill
  k.box(x1 - 2.0, y0 + 0.85, z1 - 0.3, x1 - 1.2, y0 + 1.25, z1 + 0.05, M.enamelCream, { collide: true });
  k.box(x1 - 1.9, y0 + 1.1, z1 - 0.32, x1 - 1.3, y0 + 1.22, z1 - 0.28, tint(M.fabricRust, '#c9a24a'), { occlude: false });
  // shelf: Carmen's tupperware (washed, never returned), hot plate and one pan
  k.box(x1 - 0.9, y0 + 0.9, z0 + 0.05, x1 - 0.05, y0 + 0.93, z0 + 0.4, M.woodDark);
  k.box(x1 - 0.8, y0 + 0.93, z0 + 0.1, x1 - 0.55, y0 + 1.0, z0 + 0.3, tint(M.enamelWhite, '#d8d0b0'));
  k.box(x1 - 0.45, y0 + 0.93, z0 + 0.1, x1 - 0.15, y0 + 0.99, z0 + 0.35, M.black);
  k.cyl(x1 - 0.3, y0 + 0.99, z0 + 0.22, 0.11, 0.05, M.steel, 10);
  k.marker('bed', x0 + 1.0, y0 + 0.55, z0 + 1.2, "Teddy's bed (save / sleep)");
  k.marker('wardrobe', x1 - 0.4, y0, z0 + 1.2, 'nail and hanger rail');
  k.marker('prop', x1 - 0.3, y0 + 1.0, z0 + 0.22, 'hot plate (food)');
  k.marker('spawn', (x0 + x1) / 2, y0, z1 - 0.6, 'home: Corwin 9F');
}
export type { Mat };
