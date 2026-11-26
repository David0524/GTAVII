/**
 * Big rooms: office and hotel lobbies, garages, churches, union halls, cinemas, and the
 * upstairs trades (pool hall, boxing gym) reached by a straight stair from a street door.
 */
import { M, type Mat, tint } from '../kit/materials';
import * as P from '../kit/props';
import { type GenCtx, WALL_T, PARTY, fitRect, revealBox } from './common';
import { coreFacade, stairTower } from './vertical';
import { coreLayout, towerLayout } from '../layout';
import { facadeOpenings } from '../facade';

function bigRoom(c: GenCtx, name: string, H: number, m: { floor: Mat; wall: Mat; ceiling: Mat; frame?: Mat; door?: Mat }) {
  const { k, unit: u } = c;
  const x0 = PARTY, x1 = u.w - PARTY, z1 = u.d - PARTY;
  const cell = k.cell(name, [x0, 0, WALL_T, x1, H, z1], 0);
  const L = { ...coreLayout(u, c.b), fh: H };
  coreFacade(c, cell, L, m.wall, m.frame ?? M.chrome, m.door ?? M.woodDark, true);
  k.room(x0, WALL_T, x1, z1, 0, H, { floor: m.floor, wall: m.wall, ceiling: m.ceiling }, {}, { skip: ['z0'] });
  // strip between the facade wall and z0 is part of the room already (room starts at WALL_T)
  return { cell, x0, x1, z0: WALL_T, z1, H };
}

export function genOfficeLobby(c: GenCtx) {
  const { k, r } = c; const H = Math.min(5.2, Math.max(3.8, c.b.fh * 1.25));
  const s = bigRoom(c, 'lobby', H, { floor: r.pick([M.terrazzo, M.marble, tint(M.terrazzo, '#9a8e7a')]), wall: r.pick([M.marble, tint(M.marble, '#b8a98a'), M.panelingLight]), ceiling: c.b.year < 1935 ? M.tin : M.acoustic, frame: tint(M.chrome, '#b08a4a'), door: tint(M.chrome, '#a8a49a') });
  const tower = c.b.roof ? towerLayout(c.unit, c.b) : null;
  if (tower) stairTower(c, tower, s.cell);
  const W = s.x1 - s.x0 - (tower ? 2.9 : 0), D = s.z1 - s.z0;
  // elevator bank on the back wall (or both side walls in deep lobbies)
  const cars = Math.max(1, Math.min(4, Math.floor((W - 0.6) / 1.8)));
  for (let q = 0; q < cars; q++) P.elevatorDoors(k, { x: s.x0 + (W / cars) * (q + 0.5), z: s.z1 - 0.02, yaw: 0 }, 1.05, 2.25, tint(M.chrome, r.pick(['#8a7a5a', '#9a9a92', '#6a5a3a'])));
  if (D > 12 && W > 5) for (let q = 0; q < 2; q++) { P.elevatorDoors(k, { x: s.x0 + 0.02, z: s.z1 - 3 - q * 1.9 - (tower ? 2 : 0), yaw: -Math.PI / 2 }, 1.05); if (!tower) P.elevatorDoors(k, { x: s.x1 - 0.02, z: s.z1 - 3 - q * 1.9, yaw: Math.PI / 2 }, 1.05); }
  // directory board, starter's podium, cigar stand by the door, mail chute, sand urn ashtrays
  const dirf = { x: s.x0 + 0.02, z: s.z0 + Math.min(3, D * 0.3), yaw: -Math.PI / 2 };
  P.pbox(k, dirf, -0.6, 1.0, -0.03, 0.6, 2.2, 0.0, M.black, { occlude: false });
  P.pbox(k, dirf, -0.55, 1.05, -0.035, 0.55, 2.15, -0.03, tint(M.newsprint, '#2a2622', { p: 2 }), { occlude: false });
  P.pbox(k, { x: (s.x0 + s.x1) / 2, z: s.z1 - 2.6, yaw: Math.PI }, -0.4, 0, -0.25, 0.4, 1.1, 0.25, M.woodDark, { collide: 'cover' });
  k.slot('starter', (s.x0 + s.x1) / 2, 0, s.z1 - 2.1, 0);
  if (W > 4.5) { P.displayCase(k, { x: s.x1 - 0.7, z: s.z0 + 0.8, yaw: Math.PI / 2 }, 2.0, { goods: 'cigars' }); k.slot('cigar_stand', s.x1 - 0.35, 0, s.z0 + 1.8, Math.PI / 2); k.marker('shop', s.x1 - 1.5, 0, s.z0 + 1.8, 'cigar stand'); }
  k.box(s.x0 + 0.02, 0.9, s.z1 - 0.35, s.x0 + 0.1, 3.2, s.z1 - 0.2, tint(M.chrome, '#b08a4a'), { occlude: false });
  for (let z = s.z0 + 2; z < s.z1 - 2; z += 4) k.cyl(s.x0 + 0.4, 0, z, 0.18, 0.65, M.steel, 10, { collide: true });
  for (let z = s.z0 + 1.5; z < s.z1 - 0.5; z += 3) for (let x = s.x0 + W / 4; x < s.x1; x += W / 2) {
    if (c.era === 'modern' || c.b.year > 1945) P.fluorescent(k, x, z, H, 1.22, 2.6, Math.PI / 2); else P.globeLight(k, x, z, H, 2.6);
  }
  P.payphone(k, { x: s.x0 + 0.02, z: s.z1 - 1.5, yaw: -Math.PI / 2 }, 'lobby payphone');
  k.marker('hide', s.x1 - 0.5, 0, s.z1 - 0.5, 'fire stair');
  k.slot('guard', s.x0 + 1, 0, s.z1 - 3.5, -Math.PI / 2);
}

export function genHotelLobby(c: GenCtx) {
  const { k, r } = c; const H = Math.min(6, Math.max(4.2, c.b.fh * 1.4));
  const s = bigRoom(c, 'lobby', H, { floor: r.pick([M.terrazzo, M.carpetRed, M.marble]), wall: r.pick([M.wallpaper, M.marble, M.panelingLight, M.wallpaperGreen]), ceiling: M.tin, frame: tint(M.chrome, '#b08a4a'), door: M.woodDark });
  const tower = c.b.roof ? towerLayout(c.unit, c.b) : null;
  if (tower) stairTower(c, tower, s.cell);
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  // front desk across the back third, key rack and pigeonholes behind it, bell, register book
  const dz = s.z0 + D * 0.62;
  const deskLen = Math.min(W - 2.2, 5);
  P.counter(k, { x: s.x0 + (W - deskLen) / 2, z: dz, yaw: 0 }, deskLen, { h: 1.1, d: 0.7, top: M.marble, front: M.paneling, overhang: 0.1 });
  const kf = { x: s.x0 + (W - deskLen) / 2, z: Math.min(s.z1 - 0.06, dz + 2.0), yaw: 0 };
  P.pbox(k, kf, 0, 1.0, 0, deskLen, 2.4, 0.06, M.woodDark, { occlude: false });
  for (let x = 0.08; x < deskLen - 0.1; x += 0.14) for (let y = 1.08; y < 2.3; y += 0.18) P.pbox(k, kf, x, y, -0.02, x + 0.11, y + 0.14, 0, r.chance(0.3) ? M.paper : M.black, { occlude: false });
  k.slot('desk_clerk', s.x0 + W / 2, 0, dz + 1.2, 0);
  k.marker('shop', s.x0 + W / 2, 0, dz - 0.7, 'front desk');
  k.marker('wait', s.x0 + 1, 0.42, s.z0 + 2.2, 'lobby armchair');
  P.register(k, { x: s.x0 + W / 2 + 1, z: dz + 0.35, yaw: 0 }, 1.1);
  // lounge: armchairs, sofa, potted palms (tubs), standing ashtrays, columns
  for (let q = 0; q < Math.min(4, Math.floor(W / 2)); q++) { const x = s.x0 + 1 + q * 1.8; P.armchair(k, { x, z: s.z0 + 2.2, yaw: Math.PI }, r.pick([M.vinylGreen, M.fabricCamel, M.vinylBrown, M.fabricRust])); if (r.chance(0.3)) k.slot('guest_lounge', x, 0.42, s.z0 + 2.2, Math.PI); }
  if (W > 6) for (const x of [s.x0 + W / 3, s.x0 + (2 * W) / 3]) k.box(x - 0.3, 0, s.z0 + D * 0.4 - 0.3, x + 0.3, H, s.z0 + D * 0.4 + 0.3, M.marble, { collide: 'cover' });
  for (const x of [s.x0 + 0.6, s.x1 - 0.6]) { k.cyl(x, 0, s.z0 + 0.9, 0.3, 0.5, tint(M.steel, '#7a6a4a'), 10, { collide: true }); for (let q = 0; q < 6; q++) k.obox(x, 0.9, s.z0 + 0.9, 0.04, 0.5, 0.35, q, tint(M.fabricOlive, '#3a5a2a')); }
  P.elevatorDoors(k, { x: tower ? s.x0 + 0.02 : s.x1 - 0.02, z: s.z1 - (tower ? 3.4 : 1.4), yaw: tower ? -Math.PI / 2 : Math.PI / 2 }, 1.05);
  for (let q = 0; q < 2; q++) P.payphone(k, { x: s.x0 + 0.02, z: s.z1 - 1 - q * 0.75, yaw: -Math.PI / 2 }, 'hotel payphone');
  for (let z = s.z0 + 2; z < s.z1; z += 3.5) P.pendant(k, s.x0 + W / 2, z, H, 1.2, 3.0, tint(M.chrome, '#b08a4a'));
  k.marker('hide', s.x0 + 0.5, 0, s.z1 - 0.5, 'luggage room');
}

export function genGarage(c: GenCtx) {
  const { k, r } = c; const H = Math.min(5, Math.max(3.6, c.b.fh));
  const s = bigRoom(c, 'garage', H, { floor: M.concrete, wall: r.pick([M.brickPainted, M.brick, tint(M.plasterCream, '#b0a888')]), ceiling: M.ceilingPlaster, frame: M.steel, door: tint(M.steel, '#6a6a5a') });
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  for (let x = s.x0 + 6; x < s.x1 - 2; x += 6) for (let z = s.z0 + 6; z < s.z1 - 2; z += 6) k.box(x - 0.25, 0, z - 0.25, x + 0.25, H, z + 0.25, M.concrete, { collide: 'cover' });
  // painted bay lines, a glass dispatch booth, tool benches, tires, oil drums, a grease pit hint
  for (let x = s.x0 + 2.8; x < s.x1 - 1; x += 2.8) k.box(x - 0.05, 0.003, s.z0 + D * 0.4, x + 0.05, 0.008, s.z1 - 0.3, tint(M.paper, '#d8c86a'), { occlude: false });
  const bx = s.x0 + 0.2, bz = s.z0 + 1.6;
  k.box(bx, 0, bz, bx + 2.4, 1.0, bz + 2.0, M.paintGrey, { collide: true });
  k.box(bx, 1.0, bz, bx + 2.4, 2.4, bz + 0.03, M.glass, { glass: true, occlude: false }); k.box(bx + 2.37, 1.0, bz, bx + 2.4, 2.4, bz + 2.0, M.glass, { glass: true, occlude: false });
  k.box(bx, 2.4, bz, bx + 2.4, 2.5, bz + 2.0, M.paintGrey, { occlude: false });
  P.desk(k, { x: bx + 1.2, z: bz + 1.2, yaw: Math.PI }, 1.2, 0.6, M.steel);
  k.slot('dispatcher', bx + 1.2, 0, bz + 1.6, Math.PI);
  k.marker('shop', bx + 1.2, 0, bz - 0.6, 'dispatch window');
  for (let q = 0; q < r.int(3, 8); q++) k.cyl(s.x1 - 0.5 - (q % 3) * 0.65, 0, s.z1 - 0.5 - Math.floor(q / 3) * 0.65, 0.29, 0.88, r.pick([M.paintRed, tint(M.paintRed, '#3a5a3a'), M.paintGrey]), 10, { collide: 'cover' });
  for (let q = 0; q < r.int(4, 10); q++) k.cyl(s.x0 + 0.5, 0.0 + (q % 4) * 0.22, s.z1 - 1 - Math.floor(q / 4) * 0.7, 0.33, 0.21, M.rubber, 12);
  P.counter(k, { x: s.x0 + 3, z: s.z1 - 0.7, yaw: 0 }, Math.min(4, W - 4), { top: M.woodDark, front: M.paintGrey, h: 0.9 });
  for (let x = s.x0 + 2; x < s.x1; x += 4) for (let z = s.z0 + 2; z < s.z1; z += 4) P.fluorescent(k, x, z, H, 2.4, 2.2, 0);
  for (let q = 0; q < 3; q++) k.slot('mechanic', s.x0 + 4 + q * 3, 0, s.z0 + D * 0.6, 0);
  k.marker('hide', s.x1 - 1.5, 0, s.z1 - 1.5, 'behind drums');
  k.marker('spawn', s.x0 + W / 2, 0, s.z0 + D / 2, 'bay');
}

export function genChurch(c: GenCtx) {
  const { k, r } = c; const H = Math.min(12, Math.max(6, c.b.top - c.unit.y - 1));
  const s = bigRoom(c, 'nave', H, { floor: r.pick([M.terrazzo, M.planks, M.marble]), wall: r.pick([M.plasterCream, tint(M.marble, '#c9bc9a'), M.brickPainted]), ceiling: tint(M.ceilingPlaster, '#b8ab8a'), frame: M.woodDark, door: M.woodDark });
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  // pews in two banks with a centre aisle, sanctuary rail and altar, stained-glass glow, votive stand
  const aisle = 1.4, pewLen = (W - aisle - 1.2) / 2;
  for (let z = s.z0 + 2.5; z < s.z1 - 4.5; z += 1.0) for (const side of [0, 1]) {
    const x = side ? s.x0 + 0.6 + pewLen + aisle : s.x0 + 0.6;
    P.bench(k, { x, z, yaw: 0 }, pewLen, M.woodDark);
    k.box(x, 0.47, z + 0.18, x + pewLen, 0.95, z + 0.24, M.woodDark, { occlude: false });
    if (r.chance(0.12)) k.slot('parishioner', x + r.range(0.3, pewLen - 0.3), 0.45, z, Math.PI);
  }
  k.box(s.x0, 0, s.z1 - 3.6, s.x1, 0.35, s.z1, M.marble, { collide: true });
  k.box(s.x0 + 0.5, 0.35, s.z1 - 3.6, s.x1 - 0.5, 1.15, s.z1 - 3.5, M.woodDark, { collide: 'cover' });
  k.box(s.x0 + W / 2 - 1.2, 0.35, s.z1 - 1.8, s.x0 + W / 2 + 1.2, 1.35, s.z1 - 1.0, M.marble, { collide: 'cover' });
  k.box(s.x0 + W / 2 - 1.3, 1.35, s.z1 - 1.85, s.x0 + W / 2 + 1.3, 1.37, s.z1 - 0.95, M.enamelWhite, { occlude: false });
  for (let z = s.z0 + 3; z < s.z1 - 3; z += 3.2) for (const x of [s.x0 + 0.01, s.x1 - 0.01]) {
    const nx = x < s.x0 + 1 ? 1 : -1;
    k.box(x - 0.005 * nx, H * 0.35, z - 0.6, x + 0.02 * nx, H * 0.8, z + 0.6, r.pick([tint(M.neonBlue, '#6a8ac0', { e: 0.9 }), tint(M.neonRed, '#c05a4a', { e: 0.9 }), tint(M.bulb, '#d0a050', { e: 0.9 })]), { occlude: false });
    k.light(x + nx * 0.8, H * 0.6, z, [0.8, 0.7, 0.85], 2.0, 'window');
  }
  for (let q = 0; q < 12; q++) k.cyl(s.x0 + 1 + (q % 6) * 0.1, 0.9, s.z1 - 4.2 - Math.floor(q / 6) * 0.1, 0.025, 0.06, tint(M.bulb, '#ffb060', { e: 2 }), 6);
  k.light(s.x0 + 1.2, 1.2, s.z1 - 4.3, [1, 0.6, 0.3], 0.6, 'bulb');
  for (let z = s.z0 + 3; z < s.z1; z += 4.5) P.pendant(k, s.x0 + W / 2, z, H, H * 0.5, 4.5, tint(M.chrome, '#b08a4a'));
  k.slot('priest', s.x0 + W / 2, 0.35, s.z1 - 2.2, Math.PI);
  k.marker('hide', s.x1 - 0.8, 0, s.z0 + 1.0, 'confessional');
  void D;
}

export function genUnionHall(c: GenCtx) {
  const { k, r } = c; const H = Math.min(5, Math.max(3.8, c.b.fh * 1.2));
  const s = bigRoom(c, 'hall', H, { floor: M.linoGreen, wall: r.pick([M.plasterGreen, M.plasterCream, M.panelingLight]), ceiling: M.acoustic, frame: M.steel, door: M.paintBrown });
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  // low stage with lectern and flags (generic), folding chairs in rows, bulletin boards, coffee urn table
  k.box(s.x0, 0, s.z1 - 2.6, s.x1, 0.6, s.z1, M.planks, { collide: true });
  k.box(s.x0 + W / 2 - 0.3, 0.6, s.z1 - 1.8, s.x0 + W / 2 + 0.3, 1.8, s.z1 - 1.4, M.woodDark, { collide: 'cover' });
  for (const x of [s.x0 + 0.8, s.x1 - 0.8]) { k.cyl(x, 0.6, s.z1 - 0.6, 0.02, 2.3, tint(M.chrome, '#b08a4a'), 6); k.box(x, 2.0, s.z1 - 0.62, x + 0.9 * (x < s.x0 + 2 ? 1 : -1), 2.8, s.z1 - 0.6, r.pick([M.paintRed, tint(M.paintRed, '#3c4a63')]), { occlude: false }); }
  for (let z = s.z0 + 2; z < s.z1 - 3.5; z += 0.95) for (let x = s.x0 + 0.8; x < s.x1 - 0.5; x += 0.55) { if (Math.abs(x - (s.x0 + W / 2)) < 0.5) continue; if (r.chance(0.08)) continue; P.chromeChair(k, { x, z, yaw: Math.PI }, M.paintGrey); }
  P.table(k, { x: s.x0 + 1.0, z: s.z0 + 1.0, yaw: 0 }, 1.6, 0.7, M.formicaCream);
  for (const ox of [0.5, 1.0]) k.cyl(s.x0 + 0.2 + ox, 0.75, s.z0 + 1.0, 0.14, 0.5, M.chrome, 10);
  for (let z = s.z0 + 2; z < s.z1 - 3; z += 3) { k.box(s.x1 - 0.03, 1.1, z, s.x1 - 0.01, 2.1, z + 1.6, tint(M.paper, '#a8834a'), { occlude: false }); for (let q = 0; q < 5; q++) k.box(s.x1 - 0.035, 1.2 + r.range(0, 0.7), z + 0.1 + r.range(0, 1.2), s.x1 - 0.03, 1.4 + r.range(0, 0.7), z + 0.3 + r.range(0, 1.2), M.paper, { occlude: false }); }
  for (let x = s.x0 + 1.5; x < s.x1; x += 3) for (let z = s.z0 + 1.5; z < s.z1; z += 3) P.fluorescent(k, x, z, H, 1.22, 2.4, Math.PI / 2);
  k.slot('speaker', s.x0 + W / 2, 0.6, s.z1 - 1.2, 0);
  for (let q = 0; q < 6; q++) k.slot('member', s.x0 + 1 + r.range(0, W - 2), 0, s.z0 + 2 + r.range(0, D - 6), Math.PI);
  P.payphone(k, { x: s.x0 + 0.02, z: s.z0 + 2.5, yaw: -Math.PI / 2 }, 'hall payphone');
  k.marker('hide', s.x1 - 0.5, 0.6, s.z1 - 0.4, 'backstage');
}

export function genCinemaLobby(c: GenCtx) {
  const { k, r, unit: u } = c; const H = Math.min(6.5, Math.max(4.5, c.b.fh * 1.4));
  const s = bigRoom(c, 'lobby', H, { floor: M.carpetRed, wall: r.pick([tint(M.wallpaper, '#8a3a2a'), M.panelingLight, tint(M.plasterCream, '#b88a5a')]), ceiling: M.tin, frame: tint(M.chrome, '#b08a4a'), door: tint(M.chrome, '#b08a4a') });
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  const lobbyD = Math.min(7, D * 0.35);
  // ticket booth inside the doors, concession stand, poster frames, then the auditorium behind a wall with two doors
  k.box(s.x0 + 0.3, 0, s.z0 + 0.6, s.x0 + 1.8, 1.0, s.z0 + 1.8, tint(M.chrome, '#b08a4a'), { collide: true });
  k.box(s.x0 + 0.3, 1.0, s.z0 + 0.6, s.x0 + 1.8, 2.2, s.z0 + 0.63, M.glass, { glass: true, occlude: false });
  k.slot('cashier', s.x0 + 1.0, 0, s.z0 + 1.3, 0); k.marker('register', s.x0 + 1.0, 1.0, s.z0 + 0.8, 'ticket booth');
  P.displayCase(k, { x: s.x1 - 0.8, z: s.z0 + 1.0, yaw: Math.PI / 2 }, Math.min(3.5, lobbyD - 1.5), { goods: 'candy', d: 0.7 });
  k.slot('concession', s.x1 - 0.35, 0, s.z0 + 2.2, Math.PI / 2); k.marker('shop', s.x1 - 1.6, 0, s.z0 + 2.2, 'concession');
  for (let z = s.z0 + 1.5; z < s.z0 + lobbyD; z += 1.4) { k.box(s.x0 + 0.01, 1.0, z, s.x0 + 0.05, 2.4, z + 0.9, M.black, { occlude: false }); k.box(s.x0 + 0.05, 1.08, z + 0.06, s.x0 + 0.055, 2.32, z + 0.84, tint(M.sign, r.pick(['#c0503a', '#d0a040', '#3a5a8a', '#efe3c4']), { e: 0.6 }), { occlude: false }); }
  for (let x = s.x0 + 1; x < s.x1; x += 2.5) P.globeLight(k, x, s.z0 + lobbyD / 2, H, 2.6);
  // auditorium cell
  const za = s.z0 + lobbyD;
  const dw = 1.4, ops = [{ s0: s.x1 - (s.x0 + 1.0 + dw), s1: s.x1 - (s.x0 + 1.0), y0: 0, y1: 2.3 }, { s0: 1.0, s1: 1.0 + dw, y0: 0, y1: 2.3 }];
  k.wall(s.x1, za, s.x0, za, 0, H, tint(M.wallpaper, '#6a2a24'), 1, ops);
  const aud = k.cell('auditorium', [s.x0, 0, za + 0.15, s.x1, H, s.z1], 0);
  k.wall(s.x0, za + 0.15, s.x1, za + 0.15, 0, H, M.black, 1, [{ s0: 1.0, s1: 1.0 + dw, y0: 0, y1: 2.3 }, { s0: W - 1.0 - dw, s1: W - 1.0, y0: 0, y1: 2.3 }], { collide: false });
  k.portalRect(s.cell, aud, s.x0 + 1.0, za, s.x0 + 1.0 + dw, za, 0, 2.3);
  k.portalRect(s.cell, aud, s.x1 - 1.0 - dw, za, s.x1 - 1.0, za, 0, 2.3);
  const ad = s.z1 - za - 0.15;
  // raked floor approximated by stepped risers, seat rows, screen glow
  for (let z = za + 1.5, row = 0; z < s.z1 - 3; z += 0.95, row++) {
    const y = Math.min(1.8, row * 0.12);
    k.box(s.x0 + 0.3, 0, z - 0.5, s.x1 - 0.3, y + 0.001, z + 0.45, M.carpetRed, { collide: y > 0.05 });
    for (let x = s.x0 + 1.4; x < s.x1 - 1.3; x += 0.55) { if (Math.abs(x - (s.x0 + W / 2)) < 0.6) continue; k.box(x - 0.24, y, z - 0.2, x + 0.24, y + 0.45, z + 0.22, M.vinylRed, { occlude: false }); k.box(x - 0.24, y + 0.45, z + 0.12, x + 0.24, y + 0.95, z + 0.22, M.vinylRed, { occlude: false }); }
  }
  void ad;
  k.box(s.x0 + 0.8, 1.6, s.z1 - 0.12, s.x1 - 0.8, H - 0.6, s.z1 - 0.05, tint(M.tvGlow, '#b0b8c0', { e: 0.9 }), { occlude: false });
  k.light(s.x0 + W / 2, H / 2, s.z1 - 2, [0.7, 0.75, 0.85], 3.0, 'neon', 2);
  for (let z = za + 2; z < s.z1 - 2; z += 4) for (const x of [s.x0 + 0.05, s.x1 - 0.05]) { k.box(x - 0.04, 2.2, z - 0.15, x + 0.04, 2.5, z + 0.15, tint(M.bulb, '#ff9050', { e: 1.2 }), { occlude: false }); k.light(x + (x < s.x0 + 1 ? 0.4 : -0.4), 2.3, z, [1, 0.5, 0.3], 0.35, 'bulb'); }
  k.box(s.x0 + 0.2, 2.25, za + 0.2, s.x0 + 0.6, 2.4, za + 0.25, M.exitSign, { occlude: false });
  for (let q = 0; q < 8; q++) k.slot('moviegoer', s.x0 + 1.5 + r.range(0, W - 3), 0.5, za + 2 + r.range(0, Math.max(1, s.z1 - za - 6)), Math.PI);
  k.marker('hide', s.x0 + 0.5, 0, s.z1 - 1, 'under the screen');
  void u; void D;
}

/** Upstairs trades: street door -> straight stair -> a room fitted over the shops below. */
export function genUpstairs(c: GenCtx, kind: 'pool_hall' | 'gym') {
  const { k, r, unit: u } = c;
  const fh = Math.max(3.2, Math.min(4.6, c.b.fh * 1.1));
  const x0 = PARTY, x1 = u.w - PARTY;
  const stairCell = k.cell('stair', [x0, 0, WALL_T, x1, fh + 2.6, u.d - PARTY], 0);
  const fo = facadeOpenings(u, c.b.year, c.b.fh);
  k.wall(0, WALL_T, u.w, WALL_T, 0, fh, M.dadoHall, 1, fo.map((q) => ({ ...q, y1: Math.min(q.y1, fh - 0.05) })));
  for (const q of fo) revealBox(k, q.s0, q.s1, q.y0, Math.min(q.y1, fh - 0.05), M.woodDark, q.y0 > 0.01);
  const d = fo.find((q) => q.kind === 'door')!;
  k.portalRect(stairCell, -1, d.s0, 0, d.s1, 0, 0, d.y1);
  k.door(`${u.id}:street`, d.s0, 0, 0.12, d.s1 - d.s0, d.y1, 0, -1, { street: true, glazed: true, locked: u.locked, cellA: stairCell, cellB: -1, mat: M.woodDark });
  // straight stair running into the building
  const sw = Math.min(1.2, x1 - x0 - 0.1);
  const run = 0.25, steps = Math.round(fh / 0.19), L = steps * run;
  const zStart = WALL_T + 1.0;
  k.floor(x0, WALL_T, x1, zStart, 0, M.hexWhite);
  k.stair(x0 + (x1 - x0 + sw) / 2, zStart, 0, 1, sw, 0, fh, M.woodDark, { run, rail: 'both', stringer: M.paintBrown });
  k.wall(x1, WALL_T, x1, zStart + L + 1, 0, fh + 2.6, M.dadoHall, 1);
  k.wall(x0, zStart + L + 1, x0, WALL_T, 0, fh + 2.6, M.dadoHall, 1);
  k.ceiling(x0, WALL_T, x1, zStart + L + 1, fh + 2.6, M.ceilingPlaster);
  P.bareBulb(k, (x0 + x1) / 2, zStart + L / 2, fh + 2.6, 1.6);
  // hand-painted sign at the foot of the stair
  k.box(x0 + 0.05, 2.4, zStart + 0.5, x0 + 0.08, 2.9, zStart + 1.6, tint(M.sign, kind === 'gym' ? '#d8c8a0' : '#c84a3a'), { occlude: false });
  // the room upstairs: grow over the neighbours' ceilings within the footprint
  const y0 = fh;
  const top = zStart + L;
  const rc = fitRect(c.ring, [x0, top - 1, x1, top + 2], [x0 - 14, WALL_T, x1 + 14, u.d + 22], [], 0.3);
  const room = k.cell(kind, [rc[0], y0, rc[1], rc[2], y0 + 3.4, rc[3]], 1);
  const H = Math.min(3.6, c.b.top - u.y - y0 - 0.2 > 3 ? 3.6 : 3.1);
  k.room(rc[0], rc[1], rc[2], rc[3], y0, y0 + H, { floor: kind === 'gym' ? M.planksWorn : M.planks, wall: kind === 'gym' ? M.brickPainted : r.pick([M.plasterGreen, M.panelingLight]), ceiling: kind === 'gym' ? M.ceilingPlaster : M.tin }, {}, {});
  // stair arrives through a floor opening
  k.portalFloor(stairCell, room, x0, zStart, x1, top + 0.01, y0);
  k.use(room);
  // a rail around the stair opening, cut the room floor visually with a dark box
  k.box(x0 - 0.05, y0 + 0.9, zStart - 0.05, x0, y0 + 0.95, top, M.woodDark, { occlude: false });
  k.collider({ c: [x0 - 0.03, y0 + 0.5, (zStart + top) / 2], h: [0.03, 0.5, (top - zStart) / 2], yaw: 0 });
  k.box(x1, y0 + 0.9, zStart - 0.05, x1 + 0.05, y0 + 0.95, top, M.woodDark, { occlude: false });
  k.collider({ c: [x1 + 0.03, y0 + 0.5, (zStart + top) / 2], h: [0.03, 0.5, (top - zStart) / 2], yaw: 0 });
  const W = rc[2] - rc[0], D = rc[3] - rc[1];
  if (kind === 'pool_hall') {
    let n = 0;
    for (let x = rc[0] + 1.6; x < rc[2] - 1.4; x += 2.9) for (let z = rc[1] + 2.0; z < rc[3] - 1.6; z += 3.9) {
      if (x > x0 - 1.5 && x < x1 + 1.5 && z < top + 1.6) continue;
      P.poolTable(k, { x, z, yaw: 0 }); P.pendant(k, x, z, y0 + H, 0.9, 1.6, M.enamelGreen); n++;
      if (r.chance(0.5)) k.slot('pool_player', x + 0.9, y0, z, -Math.PI / 2);
    }
    k.box(rc[0] + 0.05, y0 + 0.9, rc[3] - 0.08, rc[0] + 1.6, y0 + 1.9, rc[3] - 0.03, M.woodDark, { occlude: false });
    for (let q = 0; q < 10; q++) k.box(rc[0] + 0.1 + q * 0.14, y0 + 0.9, rc[3] - 0.12, rc[0] + 0.12 + q * 0.14, y0 + 2.3, rc[3] - 0.1, M.woodLight, { occlude: false });
    P.counter(k, { x: rc[2] - 0.8, z: rc[1] + 1.0, yaw: Math.PI / 2 }, Math.min(3, D - 2), { top: M.woodDark, front: M.paneling });
    k.slot('rack_man', rc[2] - 0.4, y0, rc[1] + 2, Math.PI / 2); k.marker('shop', rc[2] - 1.6, y0, rc[1] + 2, 'counter');
    P.register(k, { x: rc[2] - 0.5, z: rc[1] + 1.4, yaw: Math.PI / 2 }, y0 + 1.0);
    void n;
  } else {
    // boxing ring with ropes, heavy bags, speed bags, benches, lockers, a scale
    const rx = rc[0] + W / 2, rz = rc[1] + D / 2 + 1;
    const rs = Math.min(5, Math.min(W, D) - 3);
    if (rs > 3) {
      k.box(rx - rs / 2, y0, rz - rs / 2, rx + rs / 2, y0 + 0.9, rz + rs / 2, M.fabricBrown, { collide: true });
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(rx + (px * rs) / 2, y0 + 0.9, rz + (pz * rs) / 2, 0.06, 1.3, M.paintRed, 8);
      for (const h of [1.3, 1.65, 2.0]) for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        const cx = rx + ((ax + bx) * rs) / 4, cz = rz + ((az + bz) * rs) / 4; const lx = Math.abs(bx - ax) * rs / 2, lz = Math.abs(bz - az) * rs / 2;
        k.box(cx - lx / 2 - 0.015, y0 + h, cz - lz / 2 - 0.015, cx + lx / 2 + 0.015, y0 + h + 0.03, cz + lz / 2 + 0.015, M.enamelWhite, { occlude: false });
      }
      k.slot('boxer', rx - 0.8, y0 + 0.9, rz, Math.PI / 2); k.slot('boxer', rx + 0.8, y0 + 0.9, rz, -Math.PI / 2); k.slot('trainer', rx + rs / 2 + 0.6, y0, rz, -Math.PI / 2);
      P.fluorescent(k, rx, rz, y0 + H, 2.4, 3.2, 0);
    }
    for (let q = 0; q < 4; q++) { const x = rc[0] + 1 + q * 1.4; if (x > rc[2] - 0.8) break; k.cyl(x, y0 + H - 0.5, rc[3] - 1.0, 0.012, 0.5, M.steel, 4, { top: false }); k.cyl(x, y0 + 0.9, rc[3] - 1.0, 0.18, 1.1, r.pick([M.vinylRed, M.vinylBrown, M.black]), 10, { collide: true }); }
    for (let q = 0; q < 6; q++) k.box(rc[2] - 0.5, y0, rc[1] + 0.5 + q * 0.42, rc[2] - 0.05, y0 + 1.8, rc[1] + 0.9 + q * 0.42, tint(M.paintGrey, '#5a6a5a'), { collide: q === 0 });
    P.bench(k, { x: rc[0] + 0.5, z: rc[1] + 1.2, yaw: 0 }, 2.2, M.woodLight);
    for (let x = rc[0] + 1.5; x < rc[2]; x += 3) for (let z = rc[1] + 1.5; z < rc[3]; z += 3) P.bareBulb(k, x, z, y0 + H, 1.6);
  }
  P.payphone(k, { x: rc[0] + 0.02, z: (rc[1] + rc[3]) / 2, yaw: -Math.PI / 2 });
  k.marker('hide', rc[2] - 0.6, y0, rc[3] - 0.6, kind === 'gym' ? 'locker room' : 'back corner');
  k.use(stairCell);
}
