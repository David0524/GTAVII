/**
 * Retail and service storefronts. Each follows a period plan: counter by the door (cash handled
 * up front), goods down the walls, a back room. Fixtures are 1974: mechanical registers, wire
 * racks, enamel signs, fluorescent tubes on 1950s-60s remodels.
 */
import { M, tint } from '../kit/materials';
import * as P from '../kit/props';
import { type GenCtx, type ShopShell, shopShell, shopLights, backRoom } from './common';
import { wallFrame } from './food';
import type { ShopKind } from '../catalog';

/** Counter near the door on one side with a register and a staff slot; returns the counter side. */
function frontCounter(c: GenCtx, s: ShopShell, len: number, o: { top?: typeof M.formicaCream; front?: typeof M.formicaRed; glass?: 'jewelry' | 'candy' | 'cigars' | 'watches'; h?: number } = {}): 'x0' | 'x1' {
  const { k } = c;
  const doorLeft = s.doorX < (s.x0 + s.x1) / 2, side: 'x0' | 'x1' = doorLeft ? 'x1' : 'x0';
  const D = s.z1 - s.z0; const along = side === 'x1' ? D - 1.4 - len : 1.4;
  const f = wallFrame(s, side, along, 0.62 + 0.85);
  if (o.glass) P.displayCase(k, f, len, { goods: o.glass, d: 0.62 }); else P.counter(k, f, len, { top: o.top ?? M.formicaCream, front: o.front ?? M.panelingLight, h: o.h ?? 0.95 });
  const sx = side === 'x1' ? -1 : 1, wx = side === 'x1' ? s.x1 : s.x0;
  const zMid = side === 'x1' ? s.z1 - along - len / 2 : s.z0 + along + len / 2;
  P.register(k, { x: wx + sx * (0.85 + 0.3), z: side === 'x1' ? s.z1 - along - 0.5 : s.z0 + along + 0.5, yaw: side === 'x1' ? Math.PI / 2 : -Math.PI / 2 }, o.h ?? (o.glass ? 1.0 : 0.95));
  k.slot('shopkeeper', wx + sx * 0.45, 0, zMid, side === 'x1' ? Math.PI / 2 : -Math.PI / 2);
  k.marker('shop', wx + sx * (0.85 + 0.62 + 0.6), 0, zMid, 'counter');
  return side;
}
const opp = (s: 'x0' | 'x1'): 'x0' | 'x1' => (s === 'x1' ? 'x0' : 'x1');

export function genLiquor(c: GenCtx) {
  const { k } = c; const s = shopShell(c, 'liquor'); shopLights(c, s, { kind: 'fluor' });
  const side = frontCounter(c, s, Math.min(3, s.z1 - s.z0 - 3));
  const D = s.z1 - s.z0;
  P.shelves(k, wallFrame(s, opp(side), 1.0, 0.36), D - 1.4, { goods: 'bottles', h: 2.3, levels: 6, d: 0.32 });
  P.shelves(k, wallFrame(s, 'z1', 0.3, 0.36), s.x1 - s.x0 - 0.6, { goods: 'bottles', h: 2.3, levels: 6, d: 0.32 });
  P.shelves(k, wallFrame(s, side, 0.2, 0.32), Math.min(3, D - 3), { goods: 'bottles', h: 2.3, levels: 6, d: 0.3 });
  // case stacks (cartons) in the middle
  for (let q = 0; q < c.r.int(1, 3); q++) { const x = (s.x0 + s.x1) / 2 + c.r.range(-0.6, 0.6), z = s.z0 + 3 + q * 1.4; for (let h = 0; h < c.r.int(2, 5); h++) k.box(x - 0.25, h * 0.32, z - 0.2, x + 0.25, h * 0.32 + 0.3, z + 0.2, tint(M.paper, '#a98a5a'), { collide: h === 0 ? 'cover' : false }); }
  backRoom(c, s, 'office');
}

export function genPawn(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'pawn'); shopLights(c, s, { kind: 'fluor', intensity: 0.85 });
  const D = s.z1 - s.z0;
  const side = frontCounter(c, s, Math.min(4, D - 3), { glass: 'jewelry' });
  // a second L of display cases across the back; guitars, radios and TVs on wall shelves
  P.displayCase(k, wallFrame(s, 'z1', 0.5, 1.4), Math.max(1, s.x1 - s.x0 - 2), { goods: 'watches' });
  const of = wallFrame(s, opp(side), 0.8, 0.4);
  P.shelves(k, of, D - 1.6, { goods: 'hardware', h: 2.4, levels: 4, d: 0.4 });
  for (let a = 0.6; a < D - 1; a += 0.55) { const [wx, wz] = P.toWorld(wallFrame(s, opp(side), a, 0.06), 0, 0); k.obox(wx, 2.65, wz, 0.18, 0.5, 0.05, of.yaw, r.pick([M.wood, M.woodLight, M.paintRed, M.black])); }
  // window display: watches, a guitar, a typewriter
  for (const [w0, w1] of s.windows) for (let x = w0 + 0.3; x < w1 - 0.3; x += 0.6) k.box(x - 0.18, 0.55, 0.5, x + 0.18, 0.55 + r.range(0.1, 0.45), 0.8, r.pick([M.chrome, M.wood, M.black, M.paintGrey]));
  k.box(s.x0, 2.3, s.z0 + 0.05, s.x1, 2.35, s.z0 + 0.1, M.steel, { occlude: false }); // security gate rail
  backRoom(c, s, 'office');
}

export function genBarber(c: GenCtx, beauty = false) {
  const { k, r } = c; const s = shopShell(c, beauty ? 'beauty' : 'barber'); shopLights(c, s);
  const D = s.z1 - s.z0, W = s.x1 - s.x0;
  const side: 'x0' | 'x1' = s.doorX < (s.x0 + s.x1) / 2 ? 'x1' : 'x0';
  const n = Math.max(1, Math.min(4, Math.floor((D - 2.5) / 1.6)));
  const mx = side === 'x1' ? s.x1 : s.x0, sx = side === 'x1' ? -1 : 1;
  // long mirror + shelf on the station wall, chairs facing it
  const mf = wallFrame(s, side, 1.4, 0.02);
  P.pbox(k, mf, 0, 1.0, 0, n * 1.6, 1.9, 0.02, M.mirror, { occlude: false });
  P.pbox(k, mf, 0, 0.92, -0.25, n * 1.6, 0.96, 0.02, M.formicaCream, { occlude: false });
  for (let q = 0; q < n; q++) {
    const z = side === 'x1' ? s.z1 - 1.4 - q * 1.6 - 0.8 : s.z0 + 1.4 + q * 1.6 + 0.8;
    if (beauty) { P.chromeChair(k, { x: mx + sx * 1.0, z, yaw: side === 'x1' ? -Math.PI / 2 : Math.PI / 2 }, M.vinylGreen); k.cyl(mx + sx * 1.15, 1.1, z, 0.25, 0.35, M.chrome, 12, { r1: 0.18 }); }
    else P.barberChair(k, { x: mx + sx * 1.0, z, yaw: side === 'x1' ? -Math.PI / 2 : Math.PI / 2 });
    P.sink(k, { x: mx + sx * 0.3, z: z + 0.6, yaw: side === 'x1' ? -Math.PI / 2 : Math.PI / 2 });
    k.slot(beauty ? 'beautician' : 'barber', mx + sx * 1.6, 0, z, side === 'x1' ? Math.PI / 2 : -Math.PI / 2);
    if (r.chance(0.5)) k.slot('customer_chair', mx + sx * 1.0, 0.47, z, side === 'x1' ? -Math.PI / 2 : Math.PI / 2);
  }
  // waiting chairs + magazine table on the other wall, coat rack, barber pole by the door (outside is engine's)
  const ox = side === 'x1' ? s.x0 : s.x1;
  if (W > 3.6) for (let z = s.z0 + 1.6; z < s.z1 - 1; z += 0.62) P.chromeChair(k, { x: ox - sx * 0.35, z, yaw: side === 'x1' ? Math.PI / 2 : -Math.PI / 2 }, beauty ? M.vinylGreen : M.vinylRed);
  P.coatRack(k, ox - sx * 0.4, s.z1 - 0.5);
  P.register(k, { x: mx + sx * 0.35, z: s.z0 + 1.0, yaw: side === 'x1' ? Math.PI / 2 : -Math.PI / 2 }, 0.96);
  k.box(mx + sx * 0.05, 0, s.z0 + 0.7, mx + sx * 0.6, 0.96, s.z0 + 1.3, M.paneling, { collide: 'cover' });
  k.marker('shop', mx + sx * 1.2, 0, s.z0 + 1.0, beauty ? 'beauty parlor' : 'barber');
  P.wallClock(k, (s.x0 + s.x1) / 2, 2.5, s.z1 - 0.02, 0, -1);
  backRoom(c, s, 'storage');
}

export function genLaundromat(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'laundromat'); shopLights(c, s, { kind: 'fluor' });
  const D = s.z1 - s.z0, W = s.x1 - s.x0;
  // washers along one wall, dryers stacked along the other, folding table + plastic chairs in the middle
  for (let z = s.z0 + 1.6; z < s.z1 - 0.8; z += 0.72) P.washer(k, { x: s.x0 + 0.45, z, yaw: -Math.PI / 2 });
  for (let z = s.z0 + 1.6; z < s.z1 - 0.8; z += 0.72) P.washer(k, { x: s.x1 - 0.45, z, yaw: Math.PI / 2 }, true);
  if (W > 4) { P.table(k, { x: (s.x0 + s.x1) / 2, z: s.z0 + D / 2, yaw: 0 }, 0.8, Math.min(3, D - 4), M.formicaCream); for (let z = s.z0 + 2; z < s.z1 - 2; z += 1.1) if (r.chance(0.6)) P.chromeChair(k, { x: (s.x0 + s.x1) / 2 + 0.7, z, yaw: Math.PI / 2 }, M.vinylOrange); }
  // change machine, soap vending, bulletin board, laundry carts
  k.box(s.x0 + 0.2, 0, s.z1 - 0.5, s.x0 + 0.8, 1.6, s.z1 - 0.1, M.steel, { collide: true });
  k.box(s.x1 - 2.2, 1.2, s.z1 - 0.04, s.x1 - 1.0, 1.9, s.z1 - 0.01, tint(M.paper, '#a8834a'), { occlude: false });
  for (let q = 0; q < 6; q++) k.box(s.x1 - 2.15 + r.range(0, 1.0), 1.25 + r.range(0, 0.5), s.z1 - 0.045, s.x1 - 2.0 + r.range(0, 1.0), 1.4 + r.range(0, 0.5), s.z1 - 0.04, M.paper, { occlude: false });
  for (let q = 0; q < r.int(1, 3); q++) { const x = (s.x0 + s.x1) / 2 + r.range(-0.8, 0.8), z = s.z0 + 2 + r.range(0, D - 4); k.box(x - 0.3, 0.2, z - 0.25, x + 0.3, 0.75, z + 0.25, M.chrome, { collide: 'cover', occlude: false }); }
  k.slot('attendant', s.x0 + 1.2, 0, s.z1 - 1.0, 0);
  for (let q = 0; q < 3; q++) k.slot('customer', (s.x0 + s.x1) / 2, 0, s.z0 + 2 + q * 1.5, Math.PI / 2);
  k.marker('shop', s.x0 + 0.6, 0, s.z1 - 0.9, 'change machine');
  backRoom(c, s, 'storage');
}

export function genShoeRepair(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'shoe_repair'); shopLights(c, s, { kind: c.era === 'modern' ? 'fluor' : 'bulb' });
  const side = frontCounter(c, s, Math.min(2.4, s.z1 - s.z0 - 3), { front: M.paneling });
  const D = s.z1 - s.z0;
  P.shelves(k, wallFrame(s, side, 0.2, 0.32), Math.min(2.6, D - 3), { goods: 'shoes', h: 2.2, d: 0.3, levels: 7 });
  // finishing machine with brushes, cobbler's bench and last stand
  const bf = wallFrame(s, 'z1', 0.4, 0.8);
  P.pbox(k, bf, 0, 0, 0, 1.8, 1.0, 0.7, M.paintGrey, { collide: 'cover' });
  for (let q = 0; q < 5; q++) P.pcyl(k, bf, 0.2 + q * 0.33, 1.0, 0.35, 0.09, 0.08, q % 2 ? M.black : M.fabricBrown, 8);
  P.pbox(k, wallFrame(s, 'z1', 2.5, 1.2), 0, 0.6, 0, 1.0, 0.65, 0.6, M.woodDark, { collide: 'cover' });
  // shoeshine stand: two raised chairs (classic)
  if (s.x1 - s.x0 > 3.6) for (let q = 0; q < 2; q++) { const f = wallFrame(s, opp(side), 1.5 + q * 0.75, 0.5); P.pbox(k, f, -0.3, 0, 0, 0.3, 0.55, 0.6, M.woodDark, { collide: 'cover' }); P.pbox(k, f, -0.25, 0.55, 0.05, 0.25, 0.95, 0.5, M.vinylRed); P.pbox(k, f, -0.25, 0.95, 0.4, 0.25, 1.45, 0.5, M.vinylRed); }
  k.slot('cobbler', (s.x0 + s.x1) / 2, 0, s.z1 - 1.5, 0); void r;
  backRoom(c, s, 'storage');
}

export function genTailor(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'tailor'); shopLights(c, s);
  const side = frontCounter(c, s, Math.min(2.4, s.z1 - s.z0 - 3), { front: M.panelingLight });
  const D = s.z1 - s.z0;
  for (let q = 0; q < r.int(1, 3); q++) P.dressForm(k, (s.x0 + s.x1) / 2 + r.range(-0.5, 0.5), s.z0 + 1.0 + q * 0.6);
  P.sewingMachine(k, { x: (s.x0 + s.x1) / 2, z: s.z1 - 1.0, yaw: 0 });
  P.rollingRack(k, wallFrame(s, opp(side), 1.0, 0.35), Math.min(2.5, D - 2), 0.7);
  P.mirror(k, wallFrame(s, opp(side), D - 0.8, 0), 0.6, 1.6, 0.3);
  // fitting curtain booth in the corner
  const fx = side === 'x1' ? s.x0 : s.x1 - 1.0;
  k.box(fx, 0.02, s.z1 - 1.0, fx + 1.0, 2.1, s.z1 - 0.98, tint(M.fabricRust, '#6a2a24'), { occlude: false });
  k.marker('hide', fx + 0.5, 0, s.z1 - 0.5, 'fitting booth');
  k.slot('tailor', (s.x0 + s.x1) / 2, 0, s.z1 - 1.6, 0);
  backRoom(c, s, 'storage');
}

export function genNewsstand(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'newsstand'); shopLights(c, s, { kind: c.era === 'modern' ? 'fluor' : 'pendant' });
  const D = s.z1 - s.z0;
  const side = frontCounter(c, s, Math.min(2.6, D - 3), { glass: 'candy' });
  // magazine rack (stepped) down the other wall, newspaper piles by the door, soda fountain or cooler at the back
  const mf = wallFrame(s, opp(side), 1.0, 0.5);
  for (let t = 0; t < 5; t++) P.pbox(k, mf, 0, 0.5 + t * 0.32, 0.4 - t * 0.08, D - 2, 0.53 + t * 0.32, 0.5 - t * 0.08, M.woodDark, { occlude: false });
  for (let a = 0.05; a < D - 2.1; a += 0.24) for (let t = 0; t < 5; t++) P.pbox(k, mf, a, 0.53 + t * 0.32, 0.38 - t * 0.08, a + 0.21, 0.53 + t * 0.32 + 0.28, 0.4 - t * 0.08, r.pick([M.newsprint, tint(M.newsprint, '#b2302a'), tint(M.newsprint, '#e3a92a'), tint(M.newsprint, '#3c4a63'), M.sign]), { occlude: false });
  P.pbox(k, mf, 0, 0, 0, D - 2, 0.5, 0.5, M.woodDark, { collide: 'cover' });
  for (let q = 0; q < 3; q++) k.box(s.doorX - 0.9 + q * 0.4, 0, s.z0 + 0.4, s.doorX - 0.6 + q * 0.4, 0.2 + r.range(0, 0.25), s.z0 + 0.8, M.newsprint, { collide: q === 0 });
  if (D > 6) { P.counter(k, wallFrame(s, 'z1', 0.3, 1.5), Math.min(3, s.x1 - s.x0 - 0.6), { top: M.formicaCream, front: M.formicaRed }); P.stoolsAlong(k, s.x0 + 0.6, s.z1 - 1.9, Math.min(s.x1 - 0.5, s.x0 + 3), 0.6); k.slot('soda_jerk', s.x0 + 1.5, 0, s.z1 - 0.8, Math.PI); }
  backRoom(c, s, 'storage');
}

export function genClothing(c: GenCtx, kind: ShopKind) {
  const { k, r } = c; const s = shopShell(c, kind); shopLights(c, s, { kind: kind === 'fur_showroom' ? 'globe' : undefined, intensity: 1.15 });
  const D = s.z1 - s.z0, W = s.x1 - s.x0;
  const side: 'x0' | 'x1' = s.doorX < (s.x0 + s.x1) / 2 ? 'x1' : 'x0';
  if (kind !== 'garment_showroom') frontCounter(c, s, 1.8, { glass: kind === 'fur_showroom' ? 'jewelry' : undefined });
  // racks: rows in the middle, folded goods on wall shelves, mirror + fitting room
  for (let z = s.z0 + 2.4; z < s.z1 - 1.6; z += 1.6) {
    const n = Math.max(1, Math.floor((W - 1.8) / 1.8));
    for (let q = 0; q < n; q++) P.rollingRack(k, { x: s.x0 + 0.9 + q * 1.8, z, yaw: 0 }, 1.4, kind === 'fur_showroom' ? 0.6 : 0.85);
  }
  P.shelves(k, wallFrame(s, opp(side), 1.0, 0.45), D - 2.2, { goods: kind === 'clothing' ? 'folded' : 'folded', h: 2.2, levels: 5, d: 0.42 });
  P.mirror(k, wallFrame(s, 'z1', W / 2 - 0.4, 0), 0.8, 1.7, 0.25);
  if (kind === 'garment_showroom' || kind === 'fur_showroom') {
    // salesman's desk, armchairs for buyers, a dress form
    P.desk(k, { x: (s.x0 + s.x1) / 2, z: s.z1 - 1.6, yaw: 0 }, 1.4, 0.7, M.woodDark);
    P.armchair(k, { x: (s.x0 + s.x1) / 2 - 0.6, z: s.z1 - 2.6, yaw: Math.PI }, r.pick([M.fabricCamel, M.vinylBrown]));
    P.dressForm(k, s.x0 + 0.8, s.z0 + 1.6);
    k.slot('salesman', (s.x0 + s.x1) / 2, 0, s.z1 - 1.0, Math.PI);
  }
  for (const [w0, w1] of s.windows) for (let x = w0 + 0.4; x < w1 - 0.3; x += 0.9) P.dressForm(k, x, 0.75);
  backRoom(c, s, 'storage');
}

export function genHardware(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'hardware'); shopLights(c, s, { kind: 'bulb', intensity: 1.2 });
  const side = frontCounter(c, s, 2.2);
  const D = s.z1 - s.z0, W = s.x1 - s.x0;
  P.shelves(k, wallFrame(s, opp(side), 0.8, 0.45), D - 1.2, { goods: 'hardware', h: 2.6, levels: 7, d: 0.42 });
  P.shelves(k, wallFrame(s, side, 0.2, 0.45), Math.max(1, D - 4.2), { goods: 'hardware', h: 2.6, levels: 7, d: 0.42 });
  if (W > 4.6) { const gx = (s.x0 + s.x1) / 2, gl = Math.max(1, D - 4.5); P.shelves(k, { x: gx + 0.4, z: s.z0 + 2.6, yaw: -Math.PI / 2 }, gl, { goods: 'hardware', h: 1.6, d: 0.4, levels: 4 }); P.shelves(k, { x: gx - 0.4, z: s.z0 + 2.6 + gl, yaw: Math.PI / 2 }, gl, { goods: 'hardware', h: 1.6, d: 0.4, levels: 4 }); }
  // hanging brooms, paint cans by the door, ladder
  for (let q = 0; q < 6; q++) k.cyl(s.doorX + (side === 'x1' ? -1.2 : 1.2) + q * 0.08 * (side === 'x1' ? -1 : 1), 0.1, s.z0 + 0.7, 0.012, 1.4, M.woodLight, 4);
  for (let q = 0; q < r.int(3, 8); q++) k.cyl(s.doorX + r.range(-1.2, 1.2), 0, s.z0 + 1.0 + r.range(0, 0.4), 0.09, 0.19, M.steel, 8);
  backRoom(c, s, 'storage');
}

export function genFlorist(c: GenCtx) {
  const { k, r } = c; const s = shopShell(c, 'florist', { floor: M.concrete }); shopLights(c, s, { kind: 'bulb' });
  frontCounter(c, s, 1.6, { top: M.woodLight });
  const D = s.z1 - s.z0;
  P.cooler(k, wallFrame(s, 'z1', 0.3, 0.72), Math.min(3, s.x1 - s.x0 - 0.6), { goods: 'milk' });
  for (let z = s.z0 + 1.2; z < s.z1 - 1.2; z += 0.45) for (const x of [s.x0 + 0.35, s.x1 - 0.35]) {
    if (r.chance(0.25)) continue; k.cyl(x, 0, z, 0.16, 0.42, M.steel, 8, { top: false });
    for (let q = 0; q < 5; q++) k.cyl(x + r.range(-0.1, 0.1), 0.4, z + r.range(-0.1, 0.1), 0.06, 0.25 + r.range(0, 0.3), r.pick([tint(M.paper, '#b2302a'), tint(M.paper, '#e3a92a'), tint(M.paper, '#d9d4c8'), tint(M.paper, '#ff6fa8'), tint(M.paper, '#5a7a3a')]), 6);
  }
  void D; backRoom(c, s, 'storage');
}

/** Fallback for any unmapped retail kind: counter + wall shelves of mixed goods. */
export function genGenericShop(c: GenCtx) {
  const { k } = c; const s = shopShell(c, c.unit.kind); shopLights(c, s);
  const side = frontCounter(c, s, Math.min(2.4, s.z1 - s.z0 - 3));
  P.shelves(k, wallFrame(s, opp(side), 1.0, 0.4), s.z1 - s.z0 - 1.6, { goods: 'mixed' });
  backRoom(c, s, 'storage');
}
