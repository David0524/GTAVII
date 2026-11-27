/**
 * Midtown Central station house (content/interiors.json interior.station_house_desk; W 31st St, 7th-8th Aves, south side).
 * Ground floor of a 1900s precinct house, 1974 (worn grade): the public room with the sergeant's raised desk behind a
 * brass rail, benches and the wanted board; a corridor behind the desk; the booking room (fingerprint stand, height
 * chart, mugshot camera, booking desk) with two holding cells; the muster room (roll-call lectern, folding chairs,
 * board); the property clerk's wire cage. Stairs up to the detectives' squad (door only, locked).
 * Gameplay: desk slot (Kearney), booking/cell markers for arrests (INTERIORS_BRIEF addendum), hide spots, payphone.
 * Grammar from HABS/LoC precinct and civic interiors (reference pass 3, references/contact/pass3_precinct.jpg).
 */
import { M, tint } from '../../kit/materials';
import * as P from '../../kit/props';
import * as G from '../../kit/propsGap';
import { type GenCtx, WALL_T, PARTY, fitRect } from '../common';
import { coreFacade } from '../vertical';
import { coreLayout } from '../../layout';

const GREEN = tint(M.dadoHall, '#9aa88a');        // institutional two-tone: green dado, cream above
const CREAM = tint(M.plasterCream, '#cfc6a4');

export function genStationHouse(c: GenCtx) {
  const { k, unit: u, r } = c;
  const H = 4.0;
  const x0 = PARTY, x1 = u.w - PARTY;
  // grow back from a small seed at the facade as far as the footprint allows (up to 22 m)
  const rc = fitRect(c.ring, [x0, WALL_T, x1, WALL_T + 4], [x0, WALL_T, x1, 22], [], 0.3);
  const zEnd = Math.max(WALL_T + 10, rc[3] > 0 ? rc[3] : u.d - 0.3), W = x1 - x0;
  const zDesk = WALL_T + Math.min(5.5, (zEnd - WALL_T) * 0.38);   // the desk line
  const zHall0 = zDesk + 1.6, zHall1 = zHall0 + 1.6;              // corridor behind the desk
  const xMid = x0 + W * 0.5;

  // ------------------------------------------------ public room
  const front = k.cell('precinct_front', [x0, 0, WALL_T, x1, H, zHall0], 0);
  coreFacade(c, front, { ...coreLayout(u, c.b), fh: H }, CREAM, M.woodDark, M.woodDark, true);
  k.room(x0, WALL_T, x1, zHall0, 0, H, { floor: tint(M.terrazzo, '#a89a82'), wall: CREAM, ceiling: M.tin }, {}, { skip: ['z0', 'z1'] });
  for (const [ax, bx] of [[x0, x1]]) { k.baseboard(ax, WALL_T + 0.01, bx, WALL_T + 0.01, 0, 1); }
  // the raised desk: platform, panelled front, brass rail, blotter, lamp, the big log
  const dx0 = x0 + W * 0.18, dx1 = x1 - W * 0.18;
  k.box(dx0 - 0.4, 0, zDesk, dx1 + 0.4, 0.45, zHall0 - 0.05, tint(M.planks, '#5a4430'), { collide: true });          // platform
  k.at(0, () => G.bb(k, { x: (dx0 + dx1) / 2, z: zDesk, yaw: 0 }, -(dx1 - dx0) / 2, 0, -0.1, (dx1 - dx0) / 2, 1.45, 0.55, M.paneling, 0.02, { collide: 'cover' }));
  k.at(0, () => G.bb(k, { x: (dx0 + dx1) / 2, z: zDesk, yaw: 0 }, -(dx1 - dx0) / 2 - 0.05, 1.45, -0.18, (dx1 - dx0) / 2 + 0.05, 1.5, 0.6, M.woodDark, 0.012));
  for (let x = dx0; x <= dx1 + 0.01; x += (dx1 - dx0) / 6) k.cyl(x, 1.5, zDesk - 0.14, 0.012, 0.32, tint(M.chrome, '#a08850'), 6);
  k.tube([dx0, 1.82, zDesk - 0.14], [dx1, 1.82, zDesk - 0.14], 0.016, tint(M.chrome, '#a08850'), 8);
  k.box((dx0 + dx1) / 2 - 0.5, 1.5, zDesk + 0.1, (dx0 + dx1) / 2 + 0.3, 1.51, zDesk + 0.5, tint(M.paper, '#cfc4a0'), { occlude: false }); // the blotter log
  k.cyl(dx1 - 0.4, 1.5, zDesk + 0.3, 0.06, 0.32, tint(M.enamelGreen, '#3a5a3a'), 8, { r1: 0.12 }); k.light(dx1 - 0.4, 1.75, zDesk + 0.3, [1, 0.88, 0.6], 0.6, 'bulb');
  k.slot('desk_sergeant', (dx0 + dx1) / 2, 0.45, zDesk + 0.9, Math.PI); // Kearney: faces the door
  k.marker('service', (dx0 + dx1) / 2, 0, zDesk - 0.8, 'the desk (report a crime / ask for a prisoner)');
  // gates through the rail at both ends, benches along the side walls, the wanted board, a payphone
  k.at(0, () => { P.bench(k, { x: x0 + 0.3, z: WALL_T + 1.2, yaw: Math.PI / 2 }, Math.min(3, zDesk - WALL_T - 1.6), M.woodDark); P.bench(k, { x: x1 - 0.3, z: WALL_T + 1.2 + Math.min(3, zDesk - WALL_T - 1.6), yaw: -Math.PI / 2 }, Math.min(3, zDesk - WALL_T - 1.6), M.woodDark); });
  k.box(x0 + 0.02, 1.2, WALL_T + 0.6, x0 + 0.04, 2.1, WALL_T + 1.9, tint(M.paper, '#b8ad8a'), { occlude: false });
  k.artSlot('notice', x0 + 0.05, 1.65, WALL_T + 1.25, 1.2, 0.85, 1, 0); // WANTED board
  k.at(0, () => G.wallPayphone(k, { x: x1 - 0.02, z: WALL_T + 0.9, yaw: Math.PI / 2 }, 'station house payphone'));
  k.marker('wait', x0 + 0.5, 0.45, WALL_T + 2.0, 'bench (complainants)');
  for (const fx of [x0 + W * 0.3, x0 + W * 0.7]) P.globeLight(k, fx, WALL_T + 1.8, H, 2.2);
  P.fluorescent(k, (dx0 + dx1) / 2, zDesk + 0.9, H, 1.22, 2.0, 0);

  // ------------------------------------------------ corridor behind the desk
  const hall = k.cell('precinct_hall', [x0, 0, zHall0, x1, H, zHall1], 0);
  k.portalRect(front, hall, x0, zHall0, x1, zHall0, 0, H);
  k.floor(x0, zHall0, x1, zHall1, 0, tint(M.lino, '#6a6250')); k.ceiling(x0, zHall0, x1, zHall1, H, M.ceilingPlaster);
  k.wall(x1, zHall0, x1, zHall1, 0, H, GREEN, 1); k.wall(x0, zHall1, x0, zHall0, 0, H, GREEN, 1);
  P.fluorescent(k, xMid, (zHall0 + zHall1) / 2, H, 1.22, 1.6, Math.PI / 2, r.chance(0.3) ? 1 : 0);
  // stairs to the squad room: a locked door at the corridor end
  k.door(`${u.id}:squad_stairs`, x1 - 0.1, 0, zHall0 + 0.35, 0.9, 2.1, Math.PI / 2, 1, { locked: true, cellA: hall, cellB: -1, mat: tint(M.paintBrown, '#4a3a2a'), key: 'key.precinct.squad' });
  // back wall with doors into booking (left), muster (right) and property (right, small)
  const rear0 = zHall1;
  const xBook1 = xMid, xProp0 = x1 - Math.min(3.0, W * 0.3);
  const dBook = x0 + 1.2, dMuster = xBook1 + 1.2, dProp = xProp0 + 0.7;
  k.wall(x1, zHall1, x0, zHall1, 0, H, GREEN, 1, [dProp, dMuster, dBook].map((d) => ({ s0: x1 - (d + 0.9), s1: x1 - d, y0: 0, y1: 2.1, depth: 0.15 })));

  // ------------------------------------------------ booking room + holding cells
  const book = k.cell('precinct_booking', [x0, 0, rear0, xBook1, H, zEnd], 0);
  k.portalRect(hall, book, dBook, rear0, dBook + 0.9, rear0, 0, 2.1);
  k.door(`${u.id}:booking`, dBook, 0, rear0 + 0.04, 0.9, 2.1, 0, 1, { cellA: hall, cellB: book, mat: tint(M.paintBrown, '#4a3a2a'), glazed: true });
  k.room(x0, rear0, xBook1, zEnd, 0, H, { floor: tint(M.lino, '#5e6250'), wall: GREEN, ceiling: M.acoustic }, {}, { skip: ['z0'] });
  const cellD = Math.min(2.4, (zEnd - rear0) * 0.4), zc = zEnd - cellD;          // two cells along the back wall
  const cw = (xBook1 - x0) / 2;
  for (let q = 0; q < 2; q++) {
    const a = x0 + q * cw, b = a + cw;
    // bar front with a hinged gate (tubes), a steel bench, a steel toilet
    for (let x = a + 0.08; x < b - 0.05; x += 0.12) k.tube([x, 0, zc], [x, 2.4, zc], 0.011, M.steel, 6);
    k.tube([a, 2.4, zc], [b, 2.4, zc], 0.02, M.steel, 6); k.tube([a, 1.1, zc], [b, 1.1, zc], 0.015, M.steel, 6);
    k.collider({ c: [(a + b) / 2, 1.2, zc], h: [cw / 2, 1.2, 0.03], yaw: 0 });
    if (q === 0) k.box(b - 0.03, 0, zc, b + 0.03, H, zEnd, GREEN, { collide: true });
    k.box(a + 0.1, 0.45, zEnd - 0.45, b - 0.1, 0.5, zEnd - 0.05, M.steel, { collide: 'cover' });
    k.at(0, () => G.highTankToilet(k, { x: b - 0.4, z: zEnd - 0.35, yaw: Math.PI }));
    k.marker('spawn', (a + b) / 2, 0, zc + cellD / 2, `holding cell ${q + 1}`);
    k.marker('wait', (a + b) / 2, 0.5, zEnd - 0.3, `cell ${q + 1} bench`);
  }
  // fingerprint stand, height chart, camera on a tripod, the booking desk with a typewriter
  k.at(0, () => {
    G.bb(k, { x: x0 + 0.5, z: rear0 + 1.2, yaw: Math.PI / 2 }, -0.3, 0, -0.2, 0.3, 1.0, 0.2, tint(M.woodDark, '#4a3a28'), 0.015, { collide: true });
    G.bb(k, { x: x0 + 0.5, z: rear0 + 1.2, yaw: Math.PI / 2 }, -0.2, 1.0, -0.12, 0.2, 1.02, 0.12, M.black, 0.004); // ink slab
    P.desk(k, { x: x0 + 2.0, z: zc - 1.4, yaw: 0 }, 1.3, 0.7, M.steel);
    P.chromeChair(k, { x: x0 + 2.0, z: zc - 0.8, yaw: Math.PI }, M.vinylGreen);
  });
  k.box(xBook1 - 0.03, 0.3, rear0 + 0.8, xBook1 - 0.02, 2.1, rear0 + 1.4, tint(M.paper, '#e0d8c0'), { occlude: false }); // height chart
  k.artSlot('notice', xBook1 - 0.04, 1.2, rear0 + 1.1, 0.6, 1.8, -1, 0);
  for (const [lx, lz] of [[-0.25, 0], [0.13, 0.22], [0.13, -0.22]]) k.tube([x0 + 2.6 + lx, 0, rear0 + 2.8 + lz], [x0 + 2.6, 1.4, rear0 + 2.8], 0.012, M.steel, 5);
  k.bbox(x0 + 2.6, 1.5, rear0 + 2.8, 0.13, 0.1, 0.11, 0, M.black, 0.015);   // mugshot camera
  k.marker('service', x0 + 2.0, 0, zc - 2.2, 'booking desk (arrests are processed here)');
  k.marker('hide', x0 + 0.4, 0, zc - 0.4, 'behind the fingerprint stand');
  for (let z = rear0 + 1.5; z < zc - 0.5; z += 2.8) P.fluorescent(k, (x0 + xBook1) / 2, z, H, 1.22, 2.6, 0, r.chance(0.25) ? 1 : 0);
  P.bareBulb(k, x0 + cw / 2, zEnd - cellD / 2, H, 0.8); P.bareBulb(k, x0 + cw * 1.5, zEnd - cellD / 2, H, 0.8);

  // ------------------------------------------------ muster room
  const must = k.cell('precinct_muster', [xBook1, 0, rear0, xProp0, H, zEnd], 0);
  k.portalRect(hall, must, dMuster, rear0, dMuster + 0.9, rear0, 0, 2.1);
  k.door(`${u.id}:muster`, dMuster, 0, rear0 + 0.04, 0.9, 2.1, 0, 1, { cellA: hall, cellB: must, mat: tint(M.paintBrown, '#4a3a2a') });
  k.room(xBook1, rear0, xProp0, zEnd, 0, H, { floor: tint(M.planksWorn, '#5a4634'), wall: GREEN, ceiling: M.tin }, {}, { skip: ['z0', 'x0'] });
  k.wall(xBook1, zEnd, xBook1, rear0, 0, H, GREEN, 1); // faces +x, into the muster room
  const mw = xProp0 - xBook1;
  k.at(0, () => {
    G.bb(k, { x: xBook1 + mw / 2, z: zEnd - 0.7, yaw: Math.PI }, -0.3, 0, -0.25, 0.3, 1.15, 0.25, M.woodDark, 0.02, { collide: 'cover' }); // lectern
    for (let z = rear0 + 1.0; z < zEnd - 1.8; z += 0.9) for (let x = xBook1 + 0.6; x < xProp0 - 0.4; x += 0.6) if (!r.chance(0.15)) G.dinetteChair(k, { x, z, yaw: Math.PI }, M.paintGrey);
  });
  k.box(xBook1 + 0.5, 1.1, zEnd - 0.03, xProp0 - 0.5, 2.1, zEnd - 0.02, tint(M.paintDarkGreen, '#2a3a2a'), { occlude: false }); // roll-call board
  k.artSlot('notice', xBook1 + mw / 2, 1.6, zEnd - 0.04, Math.max(0.8, mw - 1.2), 0.9, 0, -1);
  k.marker('wait', xBook1 + mw / 2, 0.45, rear0 + 1.0, 'roll call (muster)');
  for (let z = rear0 + 1.5; z < zEnd; z += 3) P.fluorescent(k, xBook1 + mw / 2, z, H, 1.22, 2.0, 0);

  // ------------------------------------------------ property clerk's cage
  const prop = k.cell('precinct_property', [xProp0, 0, rear0, x1, H, zEnd], 0);
  k.portalRect(hall, prop, dProp, rear0, dProp + 0.9, rear0, 0, 2.1);
  k.room(xProp0, rear0, x1, zEnd, 0, H, { floor: tint(M.concrete, '#6a665e'), wall: GREEN, ceiling: M.ceilingPlaster }, {}, { skip: ['z0', 'x0'] });
  k.wall(xProp0, zEnd, xProp0, rear0, 0, H, GREEN, 1); // faces +x, into the property room
  // wire-mesh cage across the room with a pass-through counter; steel shelves of envelopes and tagged evidence behind
  const zCage = rear0 + 1.4;
  for (let x = xProp0 + 0.05; x < x1; x += 0.1) k.tube([x, 1.1, zCage], [x, 2.6, zCage], 0.004, M.steel, 4);
  k.tube([xProp0, 2.6, zCage], [x1, 2.6, zCage], 0.02, M.steel, 6);
  k.box(xProp0, 0, zCage - 0.3, x1, 1.05, zCage + 0.05, M.woodDark, { collide: 'cover' });
  k.collider({ c: [(xProp0 + x1) / 2, 1.8, zCage], h: [(x1 - xProp0) / 2, 0.8, 0.02], yaw: 0 });
  k.at(0, () => { for (let z = zCage + 0.8; z < zEnd - 0.4; z += 1.3) P.shelves(k, { x: xProp0 + 0.2, z, yaw: 0 }, x1 - xProp0 - 0.4, { goods: 'boxes', h: 2.2 }); });
  k.marker('deposit_box', (xProp0 + x1) / 2, 1.05, zCage - 0.15, 'property clerk (claim / impound)');
  k.marker('stash', x1 - 0.4, 0, zEnd - 0.3, 'evidence bin, bottom shelf');
  k.slot('property_clerk', (xProp0 + x1) / 2, 0, zCage + 0.5, Math.PI);
  for (let z = zCage + 1; z < zEnd; z += 3) P.bareBulb(k, (xProp0 + x1) / 2, z, H, 1.4);
  P.fluorescent(k, (xProp0 + x1) / 2, rear0 + 0.7, H, 1.22, 1.8, 0);
}
