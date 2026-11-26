/**
 * Diners, coffee shops, luncheonettes, bars, delis: the counter trades. Layouts follow 1970s
 * Manhattan storefront practice: a long counter with stools down one party wall, booths or deuces
 * down the other, a back bar with urns and a pie case, and the kitchen or office behind.
 */
import { M, tint } from '../kit/materials';
import type { Frame } from '../kit/props';
import * as P from '../kit/props';
import { type GenCtx, type ShopShell, shopShell, shopLights, backRoom } from './common';

export type Side = 'x0' | 'x1' | 'z1';
/** Frame on a wall: frame x runs along the wall, frame z points into the wall; `depth` from the wall. */
export function wallFrame(s: ShopShell, side: Side, along: number, depth: number): Frame {
  if (side === 'z1') return { x: s.x0 + along, z: s.z1 - depth, yaw: 0 };
  if (side === 'x1') return { x: s.x1 - depth, z: s.z1 - along, yaw: Math.PI / 2 };
  return { x: s.x0 + depth, z: s.z0 + along, yaw: -Math.PI / 2 };
}

/** Counter run along a side wall: back bar against the wall, staff aisle, counter, stools. */
function counterRun(c: GenCtx, s: ShopShell, side: 'x0' | 'x1', zStart: number, zEnd: number, o: { seat: typeof M.vinylRed; top: typeof M.formicaCream; front: typeof M.formicaRed; backBar: 'diner' | 'bar' | 'deli'; aisle?: number }) {
  const { k, r } = c; const len = zEnd - zStart; if (len < 2) return;
  const aisle = o.aisle ?? 0.85, backD = o.backBar === 'bar' ? 0.5 : 0.62;
  const along0 = side === 'x1' ? s.z1 - zEnd : zStart - s.z0;
  // back bar / back counter against the wall
  const bf = wallFrame(s, side, along0, backD);
  P.counter(k, bf, len, { h: 0.92, d: backD, top: o.backBar === 'bar' ? M.woodDark : M.steel, front: o.backBar === 'bar' ? M.woodDark : M.steel, kick: M.black, overhang: 0.02 });
  // the customer counter: front faces the room (frame z into the wall => front at frame z = 0 faces room)
  const cf = wallFrame(s, side, along0, backD + aisle + 0.62);
  const isBar = o.backBar === 'bar';
  P.counter(k, cf, len, { h: isBar ? 1.07 : 1.0, d: 0.62, top: o.top, front: o.front, overhang: isBar ? 0.28 : 0.22 });
  // flip-up gap at the far end is implied by leaving 0.7 m: block the aisle ends with colliders so the player enters only via the end gap
  const sx = side === 'x1' ? -1 : 1; // room direction in x
  const wallX = side === 'x1' ? s.x1 : s.x0;
  const counterFrontX = wallX + sx * (backD + aisle + 0.62);
  // stools
  const stoolX = counterFrontX + sx * 0.42;
  for (let z = zStart + 0.45; z < zEnd - 0.3; z += isBar ? 0.66 : 0.6) {
    P.stool(k, stoolX, z, o.seat, isBar ? 0.78 : 0.72);
    if (r.chance(0.35)) k.slot('customer_counter', stoolX, 0, z, side === 'x1' ? -Math.PI / 2 : Math.PI / 2);
  }
  if (isBar) k.box(counterFrontX + sx * 0.18 - 0.025, 0.18, zStart, counterFrontX + sx * 0.18 + 0.025, 0.23, zEnd, tint(M.chrome, '#b08a4a'), { occlude: false });
  // staff slot behind the counter, facing the room
  const staffX = wallX + sx * (backD + aisle / 2);
  k.slot(isBar ? 'bartender' : 'counterman', staffX, 0, (zStart + zEnd) / 2, side === 'x1' ? Math.PI / 2 : -Math.PI / 2);
  k.marker('shop', counterFrontX + sx * 0.6, 0, (zStart + zEnd) / 2, isBar ? 'bar' : 'counter');
  k.marker('wait', stoolX, 0.72, zStart + 0.45, isBar ? 'bar stool' : 'counter stool');
  // register at the door end of the counter
  const regZ = side === 'x1' ? zStart + 0.5 : zStart + 0.5;
  P.register(k, { x: counterFrontX - sx * 0.35, z: regZ, yaw: side === 'x1' ? Math.PI / 2 : -Math.PI / 2 }, isBar ? 1.07 : 1.0);
  // back bar dressing
  const topY = 0.92;
  if (o.backBar === 'diner') {
    // coffee urns, pie case, milkshake mixer, toaster; menu board on the wall above
    let a = along0 + 0.3;
    const place = (fn: (f: Frame) => void, w: number) => { if (a + w > along0 + len - 0.2) return; fn(wallFrame(s, side, a, backD - 0.05)); a += w + r.range(0.1, 0.4); };
    place((f) => { for (const ox of [0.18, 0.55]) P.pcyl(k, f, ox, topY, 0.3, 0.16, 0.55, M.chrome, 12); }, 0.8);
    place((f) => { P.pbox(k, f, 0, topY, 0.05, 0.9, topY + 0.5, 0.55, M.glass, { glass: true }); for (const y of [0.05, 0.27]) for (let q = 0; q < 3; q++) P.pcyl(k, f, 0.15 + q * 0.3, topY + y, 0.3, 0.12, 0.05, tint(M.paper, r.pick(['#c99a5a', '#b04a3a', '#e0c9a0'])), 10); }, 0.9);
    place((f) => { P.pbox(k, f, 0, topY, 0.15, 0.3, topY + 0.45, 0.45, M.chrome); for (let q = 0; q < 3; q++) P.pcyl(k, f, 0.05 + q * 0.1, topY + 0.15, 0.08, 0.035, 0.18, M.steel, 6); }, 0.3);
    place((f) => { P.pbox(k, f, 0, topY, 0.15, 0.35, topY + 0.2, 0.4, M.chrome); }, 0.35);
    place((f) => { P.pbox(k, f, 0, topY, 0.05, 0.9, topY + 0.04, 0.55, M.black); P.pbox(k, f, 0, topY + 0.04, 0.05, 0.9, topY + 0.06, 0.55, M.steel); }, 0.9);
    // menu board with changeable letters
    const mf = wallFrame(s, side, along0 + len * 0.15, 0.04);
    { const [ax, az] = P.toWorld(mf, len * 0.35, -0.01); k.artSlot('menu', ax, 2.1, az, len * 0.7, 0.7, side === 'x1' ? -1 : 1, 0); }
    P.pbox(k, mf, 0, 1.75, 0, len * 0.7, 2.45, 0.04, M.black, { occlude: false });
    P.pbox(k, mf, 0.05, 1.8, -0.005, len * 0.7 - 0.05, 2.4, 0, tint(M.newsprint, '#2a2622', { p: 2 }), { occlude: false });
    // shelf of cups above the back bar
    const sf = wallFrame(s, side, along0 + 0.2, 0.3);
    P.pbox(k, sf, 0, 1.45, 0, len - 0.4, 1.48, 0.3, M.steel, { occlude: false });
    for (let q = 0.1; q < len - 0.5; q += 0.12) { const [wx, wz] = P.toWorld(sf, q, 0.15); k.cyl(wx, 1.48, wz, 0.04, 0.08, M.porcelain, 6); }
    k.slot('cook', staffX, 0, zStart + len * 0.75, side === 'x1' ? -Math.PI / 2 : Math.PI / 2);
  } else if (o.backBar === 'bar') {
    // mirror, tiered bottle shelves, cash register, TV on a high shelf
    const mf = wallFrame(s, side, along0 + 0.3, 0.02);
    P.pbox(k, mf, 0, topY + 0.25, 0, len - 0.6, topY + 1.25, 0.02, M.mirror, { occlude: false });
    P.pbox(k, mf, -0.1, topY + 1.25, -0.08, len - 0.5, topY + 1.5, 0.02, M.woodDark, { occlude: false });
    for (const [y, dz] of [[topY, 0.3], [topY + 0.32, 0.18], [topY + 0.62, 0.12]] as [number, number][]) {
      const tf = wallFrame(s, side, along0 + 0.35, dz + 0.04);
      P.pbox(k, tf, 0, y, 0, len - 0.7, y + 0.025, dz, M.woodDark, { occlude: false });
      for (let q = 0.05; q < len - 0.8; q += r.range(0.08, 0.14)) { const [wx, wz] = P.toWorld(tf, q, dz / 2); const bc = r.pick([tint(M.glass, '#5a3a1a'), tint(M.glass, '#2e4a2a'), tint(M.glass, '#b08a4a'), M.glass, tint(M.glass, '#7a2a1a')]); k.cyl(wx, y + 0.025, wz, 0.035, r.range(0.2, 0.28), bc, 7, { top: false, glass: true, breakable: 'bottle' }); k.cyl(wx, y + 0.27, wz, 0.012, 0.06, bc, 5); }
    }
    // beer taps on the counter
    for (let q = 0; q < 3; q++) { const z = zStart + len * 0.4 + q * 0.18; k.cyl(counterFrontX - sx * 0.45, 1.07, z, 0.015, 0.3, M.chrome, 6); k.box(counterFrontX - sx * 0.45 - 0.02, 1.3, z - 0.02, counterFrontX - sx * 0.45 + 0.02, 1.42, z + 0.02, M.black, { occlude: false }); }
    // TV on a high shelf in the corner
    const tf = wallFrame(s, side, along0 + len - 0.5, 0.45);
    P.pbox(k, tf, -0.05, 2.25, 0, 0.6, 2.28, 0.45, M.woodDark, { occlude: false });
    P.pbox(k, tf, 0.02, 2.28, 0.05, 0.55, 2.7, 0.42, M.woodDark, { occlude: false });
    P.pbox(k, tf, 0.07, 2.33, 0.04, 0.45, 2.64, 0.05, r.chance(0.7) ? M.tvGlow : tint(M.glass, '#2a3230'), { occlude: false });
    { const [tx, tz] = P.toWorld(tf, 0.26, 0.04); k.marker('tv', tx, 2.48, tz, 'bar TV'); }
  }
}

export function genDiner(c: GenCtx, coffee = false) {
  const { k, r } = c;
  const s = shopShell(c, coffee ? 'coffee_shop' : 'diner');
  shopLights(c, s, { kind: c.era === 'original' ? 'globe' : undefined });
  const W = s.x1 - s.x0;
  const doorLeft = s.doorX < (s.x0 + s.x1) / 2;
  const side: 'x0' | 'x1' = doorLeft ? 'x1' : 'x0';
  const zStart = s.z0 + 1.5, zEnd = s.z1 - (s.backCell === null ? 1.4 : 0.6);
  const seat = r.pick([M.vinylRed, M.vinylGreen, M.vinylBrown, M.vinylOrange]);
  const top = c.k.grade >= 3 ? M.enamelWhite /* linen (kept/pristine: Stouffer's, Schrafft's references) */ : r.pick([M.formicaCream, M.formicaTeal, tint(M.formicaCream, '#c9c2b0')]);
  const front = r.pick([M.formicaRed, M.steel, tint(M.formicaRed, '#7a4a2a'), M.subway]);
  counterRun(c, s, side, zStart, zEnd, { seat, top, front, backBar: 'diner' });
  const counterSpan = 0.62 + 0.85 + 0.62 + 0.42 + 0.45; // back bar + aisle + counter + stools reach
  const freeW = W - counterSpan;
  const bx = side === 'x1' ? s.x0 : s.x1;
  if (freeW >= 2.6) {
    // booth row along the opposite wall
    const len = 1.85; const along = side === 'x1' ? 1 : -1;
    for (let z = s.z0 + 1.6; z + len < s.z1 - 0.5; z += len) {
      P.booth(k, { x: bx + along * 0.6, z, yaw: 0 }, len, seat, top);
      if (r.chance(0.4)) k.slot('customer_booth', bx + along * 0.6, 0, z + 0.3, Math.PI);
      if (r.chance(0.5)) P.pendant(k, bx + along * 0.6, z + len / 2, s.H, Math.min(1.4, s.H - 2.0), 0.9, M.enamelCream);
    }
    if (freeW >= 4.4) for (let z = s.z0 + 2.2; z < s.z1 - 1.5; z += 2.2) { const x = bx + along * 2.3; P.table(k, { x, z, yaw: 0 }, 0.7, 0.7, top); P.chromeChair(k, { x, z: z - 0.55, yaw: Math.PI }, seat); P.chromeChair(k, { x, z: z + 0.55, yaw: 0 }, seat); }
  }
  // payphone + restroom door at the back, coat hooks, ceiling fans in older rooms
  P.payphone(k, wallFrame(s, side === 'x1' ? 'x0' : 'x1', s.z1 - s.z0 - 0.7, 0));
  P.wallClock(k, (s.x0 + s.x1) / 2, 2.6, s.z1 - 0.02, 0, -1);
  if (c.era !== 'modern' && s.H > 3.3) P.ceilingFan(k, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, s.H);
  if (r.chance(0.5)) P.jukebox(k, wallFrame(s, 'z1', side === 'x1' ? 0.6 : W - 1.4, 0.32));
  P.neonSign(k, (s.windows[0]?.[0] ?? s.x0 + 0.5) + 0.9, 2.2, 0.35, 1.4, r.pick([M.neonRed, M.neonPink, M.neonBlue]));
  backRoom(c, s, s.backCell !== null ? 'kitchen' : 'storage');
  c.k.slot('waitress', (s.x0 + s.x1) / 2, 0, (s.z0 + s.z1) / 2, 0);
  k.marker('hide', s.x0 + 0.5, 0, s.z1 - 0.5, 'restroom');
}

export function genBar(c: GenCtx) {
  const { k, r } = c;
  const s = shopShell(c, 'bar');
  const W = s.x1 - s.x0;
  const doorLeft = s.doorX < (s.x0 + s.x1) / 2;
  const side: 'x0' | 'x1' = doorLeft ? 'x1' : 'x0';
  const zStart = s.z0 + 1.2, zEnd = s.z1 - (s.backCell === null ? 1.6 : 0.8);
  counterRun(c, s, side, zStart, zEnd, { seat: r.pick([M.vinylRed, M.vinylBrown, M.black]), top: M.woodDark, front: r.pick([M.paneling, M.woodDark, M.vinylRed]), backBar: 'bar', aisle: 0.8 });
  // dim lighting: a few pendants over the bar, wall sconces
  const lx = side === 'x1' ? s.x1 - 1.6 : s.x0 + 1.6;
  for (let z = zStart + 0.8; z < zEnd; z += 2.2) P.pendant(k, lx, z, s.H, Math.min(1.5, s.H - 2.2), 1.1, tint(M.enamelCream, '#b07a3a'));
  const ox = side === 'x1' ? s.x0 : s.x1, inward = side === 'x1' ? 1 : -1;
  const freeW = W - 2.9;
  if (freeW > 1.4) {
    // deuce tables along the other wall, or booths in a deep room
    for (let z = s.z0 + 1.8; z < s.z1 - 1.2; z += 1.9) {
      if (r.chance(0.5) && freeW > 2.3) { P.booth(k, { x: ox + inward * 0.6, z, yaw: 0 }, 1.8, M.vinylRed, M.woodDark); z += 0.1; }
      else { const x = ox + inward * 0.7; P.table(k, { x, z: z + 0.5, yaw: 0 }, 0.6, 0.6, M.woodDark, 0.74, M.black); P.chair(k, { x: x + inward * 0.45, z: z + 0.5, yaw: inward > 0 ? -Math.PI / 2 : Math.PI / 2 }); }
      k.light(ox + inward * 0.1, 2.0, z + 0.8, [1, 0.7, 0.42], 0.55, 'bulb');
      k.box(ox + inward * 0.01, 1.85, z + 0.7, ox + inward * 0.08, 2.05, z + 0.9, tint(M.bulb, '#ffc080', { e: 1.2 }), { occlude: false });
    }
  }
  // pool table in a deep room, cigarette machine and payphone, jukebox
  if (s.z1 - s.z0 > 11 && W > 4.6) { P.poolTable(k, { x: (s.x0 + s.x1) / 2 + inward * 0.4, z: s.z1 - 2.2, yaw: 0 }); P.pendant(k, (s.x0 + s.x1) / 2 + inward * 0.4, s.z1 - 2.2, s.H, 1.2, 1.2, M.enamelGreen); k.slot('pool_player', (s.x0 + s.x1) / 2, 0, s.z1 - 0.9, 0); }
  P.cigaretteMachine(k, wallFrame(s, side === 'x1' ? 'x0' : 'x1', 0.9, 0.3));
  P.payphone(k, wallFrame(s, 'z1', side === 'x1' ? 0.5 : W - 1.0, 0));
  P.jukebox(k, wallFrame(s, side === 'x1' ? 'x0' : 'x1', (s.z1 - s.z0) * 0.6, 0.32));
  // window neon: generic script and a "BAR" block
  for (const [w0, w1] of s.windows) P.neonSign(k, (w0 + w1) / 2, 2.0, 0.35, Math.min(1.6, w1 - w0 - 0.2), r.pick([M.neonRed, M.neonBlue, M.neonPink]));
  backRoom(c, s, 'office');
  k.marker('hide', ox + inward * 0.5, 0, s.z1 - 0.4, 'men\'s room');
}

export function genDeli(c: GenCtx, bodega = false) {
  const { k, r } = c;
  const s = shopShell(c, bodega ? 'bodega' : 'deli');
  shopLights(c, s, { kind: 'fluor' });
  const doorLeft = s.doorX < (s.x0 + s.x1) / 2;
  const side: 'x0' | 'x1' = doorLeft ? 'x1' : 'x0';
  const other: 'x0' | 'x1' = side === 'x1' ? 'x0' : 'x1';
  const D = s.z1 - s.z0, W = s.x1 - s.x0;
  // deli case + slicer counter down one side (deli), or a short register counter by the door (bodega)
  if (!bodega) {
    const len = Math.min(D - 3, 6);
    P.displayCase(k, wallFrame(s, side, side === 'x1' ? D - 1.5 - len : 1.5, 1.6), len, { goods: 'deli' });
    P.counter(k, wallFrame(s, side, side === 'x1' ? D - 1.5 - len : 1.5, 0.62), len, { top: M.steel, front: M.steel, h: 0.92, overhang: 0.02 });
    k.slot('counterman', side === 'x1' ? s.x1 - 1.1 : s.x0 + 1.1, 0, s.z0 + 1.5 + len / 2, side === 'x1' ? Math.PI / 2 : -Math.PI / 2);
    k.marker('shop', side === 'x1' ? s.x1 - 2.4 : s.x0 + 2.4, 0, s.z0 + 1.5 + len / 2, 'deli counter');
    // hanging salamis over the case
    for (let z = s.z0 + 1.8; z < s.z0 + 1.5 + len; z += 0.25) k.cyl(side === 'x1' ? s.x1 - 0.95 : s.x0 + 0.95, s.H - 1.3 - r.range(0, 0.3), z, 0.04, 0.45, tint(M.paper, '#7a3a2a'), 6);
    P.cooler(k, wallFrame(s, 'z1', side === 'x1' ? 0.2 : W - 2.6, 0.72), Math.min(2.4, W - 0.6), { goods: 'soda' });
    P.register(k, { x: side === 'x1' ? s.x1 - 1.0 : s.x0 + 1.0, z: s.z0 + 1.2, yaw: side === 'x1' ? Math.PI / 2 : -Math.PI / 2 }, 0.92);
  } else {
    const cf = wallFrame(s, side, side === 'x1' ? D - 2.6 : 0.4, 0.62 + 0.9);
    P.counter(k, cf, 2.2, { top: M.formicaCream, front: M.panelingLight, h: 0.95 });
    const [rx, rz] = P.toWorld(cf, 0.5, 0.3);
    P.register(k, { x: rx, z: rz, yaw: cf.yaw + Math.PI }, 0.95);
    // candy rack on the counter front, cigarette rack behind, lottery-free (no state lottery terminals in 1974)
    P.shelves(k, wallFrame(s, side, side === 'x1' ? D - 2.6 : 0.4, 0.35), 2.2, { h: 2.0, d: 0.3, goods: 'boxes', levels: 6 });
    k.slot('counterman', side === 'x1' ? s.x1 - 0.6 : s.x0 + 0.6, 0, s.z0 + 1.6, side === 'x1' ? Math.PI / 2 : -Math.PI / 2);
    k.marker('shop', side === 'x1' ? s.x1 - 2.0 : s.x0 + 2.0, 0, s.z0 + 1.6, 'counter');
    P.cooler(k, wallFrame(s, side, side === 'x1' ? 0.3 : D - 0.3 - Math.min(3, D - 3.5), 0.72), Math.min(3, D - 3.5), { goods: 'beer' });
  }
  // grocery shelving: wall shelves on the other side + a gondola down the middle if wide enough
  P.shelves(k, wallFrame(s, other, 1.2, 0.42), D - 2.0, { goods: 'mixed', h: 2.2 });
  if (W > 4.8) {
    const gx = (s.x0 + s.x1) / 2 + (side === 'x1' ? -0.6 : 0.6);
    const gl = Math.max(1, D - 4.4), gd = 0.38;
    P.shelves(k, { x: gx + gd, z: s.z0 + 2.4, yaw: -Math.PI / 2 }, gl, { goods: 'mixed', h: 1.5, d: gd, levels: 4 });
    P.shelves(k, { x: gx - gd, z: s.z0 + 2.4 + gl, yaw: Math.PI / 2 }, gl, { goods: 'mixed', h: 1.5, d: gd, levels: 4 });
  }
  // bread rack, newspaper bundle, cat (no), a fan
  k.box(s.doorX + (doorLeft ? 0.8 : -1.4), 0, s.z0 + 0.4, s.doorX + (doorLeft ? 1.4 : -0.8), 0.25, s.z0 + 0.8, M.newsprint, { collide: true });
  backRoom(c, s, 'storage');
}
