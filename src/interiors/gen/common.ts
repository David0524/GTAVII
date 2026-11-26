/**
 * Shared generator pieces: the generation context, the storefront shell (facade wall with a
 * recessed entry, display windows and transom, street portals), back rooms, and style picks by
 * building year (a 1890s cast-iron front gets a tin ceiling; a 1950s remodel gets acoustic tile
 * and an aluminium front).
 */
import { type Kit, type Opening, Rng } from '../kit/Kit';
import { M, type Mat, tint } from '../kit/materials';
import * as P from '../kit/props';
import type { UnitRec } from '../indexFormat';
import { KINDS, type InteriorKind } from '../catalog';
import { facadeOpenings, groundCeiling, unitEra } from '../facade';
import { shipLadder } from './vertical';
import { bayWidth, sillFrac, windowFrac } from '../../shared/facade';

export interface BuildingInfo { id: number; use: number; style: number; year: number; floors: number; fh: number; top: number; gAvg: number; district: string; roof: boolean; address?: string; cond?: number }
export interface GenCtx {
  k: Kit;
  unit: UnitRec;
  b: BuildingInfo;
  r: Rng;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  /** footprint outer ring in unit-local x/z (for upper floors that spread beyond the unit rect) */
  ring: Float64Array | null;
  /** street name for signage/marker naming */
  street: string;
  /** ground-floor ceiling height */
  H: number;
  /** remodel era of the storefront: original | 1930s | 1950s-60s */
  era: 'original' | 'deco' | 'modern';
  /** open now (affects lights on/off baked as lamp state, shutters): handled at runtime; kept for gallery */
  hero?: string;
}
/** Content overrides of the shared grade for heroes (homes.json grades: Teddy's Corwin worn; Delphine kept; Nick pristine). */
export const HERO_COND: Record<string, number> = { 'interior.corwin_lobby': 1 };
export const WALL_T = 0.3; // facade wall thickness (engine facade quad at z=0)
export const PARTY = 0.12; // party-wall inset

export function makeCtx(k: Kit, unit: UnitRec, b: BuildingInfo, quality: GenCtx['quality'], ring: Float64Array | null, street: string): GenCtx {
  const r = new Rng(unit.seed ^ 0x51ed);
  const H = groundCeiling(b.fh);
  const era = unitEra(unit, b.year);
  k.setCondition(unit.kind === 'hero' && HERO_COND[unit.hero ?? ''] !== undefined ? HERO_COND[unit.hero ?? '']! : b.cond ?? 2);
  return { k, unit, b, r, quality, ring, street, H, era };
}

export function wallMatFor(c: GenCtx, kind: InteriorKind): Mat {
  const r = c.r;
  if (c.k.grade >= 4 && r.chance(0.75)) return r.pick([M.paneling, M.marble, M.wallpaper, M.panelingLight]);
  if (c.k.grade === 0 && r.chance(0.5)) return r.pick([M.brickPainted, tint(M.plasterCream, '#a89a7a'), M.brick]);
  switch (kind) {
    case 'diner': case 'coffee_shop': return r.pick([M.subway, M.plasterCream, tint(M.subway, '#d9cfae')]);
    case 'bar': return r.pick([M.paneling, M.wallpaper, M.brick, tint(M.plasterCream, '#8c6a4a')]);
    case 'barber': case 'beauty': return r.pick([M.subway, M.plasterBlue, tint(M.subway, '#c9d6c9'), M.plasterCream]);
    case 'pawn': case 'hardware': return r.pick([M.plasterCream, M.brickPainted, M.panelingLight]);
    case 'laundromat': return r.pick([M.plasterYellow, M.plasterBlue, tint(M.plasterCream, '#c9c19a')]);
    case 'clothing': case 'fur_showroom': case 'garment_showroom': return r.pick([M.wallpaper, M.plasterCream, M.panelingLight, M.wallpaperGreen]);
    default: return r.pick([M.plasterCream, M.plasterGreen, M.brickPainted, M.panelingLight, M.plasterYellow]);
  }
}
export function ceilingMatFor(c: GenCtx): Mat { if (c.k.grade >= 4) return c.era === 'modern' ? M.ceilingPlaster : M.tin; return c.era === 'modern' ? (c.r.chance(0.6) ? M.acoustic : M.ceilingPlaster) : c.era === 'deco' ? M.ceilingPlaster : M.tin; }
export function floorMatFor(c: GenCtx, kind: InteriorKind): Mat {
  const r = c.r;
  if (c.k.grade >= 4 && r.chance(0.7)) return r.pick([M.terrazzo, M.marble, M.carpetRed]);
  if (c.k.grade <= 1 && r.chance(0.6)) return r.pick([M.planksWorn, M.lino, M.linoGreen, M.concrete]);
  switch (kind) {
    case 'diner': return r.pick([M.checkerBW, M.checkerRed, M.terrazzo, M.lino]);
    case 'coffee_shop': return r.pick([M.hexWhite, M.terrazzo, M.lino, M.checkerBW]);
    case 'bar': return r.pick([M.hexWhite, M.planksWorn, M.lino, tint(M.hexWhite, '#b9ad96')]);
    case 'barber': case 'beauty': return r.pick([M.checkerBW, M.hexWhite, M.lino]);
    case 'deli': case 'bodega': case 'liquor': return r.pick([M.lino, M.hexWhite, M.planksWorn, M.linoGreen]);
    case 'laundromat': return r.pick([M.lino, M.linoGreen, M.terrazzo]);
    case 'clothing': case 'fur_showroom': case 'garment_showroom': return r.pick([M.carpetRed, M.carpetGreen, M.planks, M.terrazzo]);
    default: return r.pick([M.planksWorn, M.lino, M.linoGreen, M.hexWhite]);
  }
}

export interface ShopShell {
  cell: number;
  /** interior usable box (inside the walls) */
  x0: number; x1: number; z0: number; z1: number; H: number;
  /** clear zone in front of the door (keep props out) */
  doorX: number; doorZ: number;
  /** display window spans along x (for window displays) */
  windows: [number, number][];
  backCell: number | null;
  /** back wall door x (into the back room), if any */
  backDoorX: number | null;
  wall: Mat; floor: Mat; ceil: Mat;
}

/**
 * Storefront: room shell, facade wall with the street door (recessed alcove or flush), display
 * windows with a raised display bed, transom; a back room behind a partition if deep enough.
 */
export function shopShell(c: GenCtx, kind: InteriorKind, o: { back?: number | false; noWindows?: boolean; wall?: Mat; floor?: Mat; ceil?: Mat } = {}): ShopShell {
  const { k, unit: u, r } = c, H = c.H;
  const W = u.w, D = u.d;
  const x0 = PARTY, x1 = W - PARTY, z0 = WALL_T, z1 = D - PARTY;
  const wall = o.wall ?? wallMatFor(c, kind), floor = o.floor ?? floorMatFor(c, kind), ceil = o.ceil ?? ceilingMatFor(c);
  const backDepth = o.back === false ? 0 : (o.back ?? (D > 9 ? Math.min(4.5, D * 0.28) : 0));
  const zb = backDepth > 0 ? z1 - backDepth : z1; // partition line
  const main = k.cell('shop', [x0, 0, 0, x1, H, zb], 0);
  const dt = u.door.t, dw = u.door.w, recess = u.door.recess;
  const doorH = 2.25, winTop = Math.min(H - 0.35, 2.9);
  const fo = facadeOpenings(u, c.b.year, c.b.fh).filter((q) => !(o.noWindows && q.kind === 'window'));
  const sill = fo.find((q) => q.kind === 'window')?.y0 ?? 0.55;
  const frame = c.era === 'modern' ? tint(M.chrome, '#a8a49a') : c.era === 'deco' ? M.steel : M.paintDarkGreen;
  const ops: Opening[] = fo.map((q) => ({ s0: q.s0, s1: q.s1, y0: q.y0, y1: q.y1, depth: WALL_T, revealMat: frame }));
  const windows: [number, number][] = fo.filter((q) => q.kind === 'window').map((q) => [q.s0, q.s1]);
  const door = fo.find((q) => q.kind === 'door' || q.kind === 'alcove')!;
  const a0 = door.s0, a1 = door.s1;
  // facade inner wall, at z = WALL_T, visible from inside (side=1 for +x travel faces +z)
  k.wall(0, WALL_T, W, WALL_T, 0, H, wall, 1, ops.map((q) => ({ ...q, depth: 0 })));
  // reveals: through-wall jambs between z=0 and z=WALL_T (visible from the street and inside)
  for (const q of ops) revealBox(k, q.s0, q.s1, q.y0, q.y1, frame, q.y0 > 0.01);
  // above-ceiling spandrel cap so you can't see into the wall from the street
  // glass + street portals
  const boarded = k.grade === 0 && r.chance(0.55); // derelict storefronts: plywood over the display glass (DOCUMERICA street refs)
  for (const [s0, s1] of windows) {
    if (boarded) for (let x = s0; x < s1 - 0.05; x += 1.22) k.box(x, sill - 0.05, 0.08, Math.min(s1, x + 1.2), winTop + 0.05, 0.1, tint(M.planksWorn, '#8a7a5a'), { occlude: true, collide: true });
    k.box(s0, sill, 0.06, s1, winTop, 0.075, M.glass, { glass: true, occlude: false });
    k.portalRect(main, -1, s0, 0.06, s1, 0.06, sill, winTop);
    // display bed (raised platform behind the glass), with a low back screen on older fronts
    const bedD = r.range(0.8, 1.2);
    k.box(s0, 0, WALL_T, s1, sill, WALL_T + bedD, c.era === 'modern' ? M.carpetRed : M.planks, { collide: true });
    k.box(s0, sill, WALL_T + bedD - 0.03, s1, sill + 0.01, WALL_T + bedD, M.woodDark, { occlude: false });
    // transom bars and a mullion every ~1.5 m
    const nm = Math.floor((s1 - s0) / 1.6);
    for (let m = 1; m <= nm; m++) { const x = s0 + ((s1 - s0) * m) / (nm + 1); k.box(x - 0.025, sill, 0.04, x + 0.025, winTop, 0.09, frame, { occlude: false }); }
    if (winTop < H - 0.6 && c.era !== 'modern') k.box(s0, winTop - 0.55, 0.04, s1, winTop - 0.5, 0.09, frame, { occlude: false });
  }
  if (recess === 0 && winTop - doorH > 0.4) {
    k.box(a0, doorH + 0.08, 0.06, a1, winTop, 0.075, M.glass, { glass: true, occlude: false });
    k.box(a0, doorH, 0.04, a1, doorH + 0.08, WALL_T, frame, { occlude: false });
  }
  // the street door
  let doorZ = 0.12;
  if (recess > 0) {
    // alcove: tiled floor, angled-in display glass on both sides (modelled straight), door at the back
    const zr = Math.min(recess, (zb - z0) * 0.4);
    doorZ = zr;
    k.floor(a0, 0, a1, zr + 0.02, 0.005, tint(M.hexWhite, '#cfc6b0'));
    k.ceiling(a0, 0.0, a1, zr, winTop, M.ceilingPlaster);
    for (const side of [0, 1]) {
      const x = side ? a1 : a0;
      // display glass flanking the alcove, low bulkhead below it
      k.box(x - 0.02, sill, 0.05, x + 0.02, winTop, zr, M.glass, { glass: true, occlude: false });
      k.box(x - 0.05, 0, 0.05, x + 0.05, sill, zr, frame, { collide: true });
      k.collider({ c: [x, winTop / 2, (zr + 0.05) / 2], h: [0.05, winTop / 2, (zr - 0.05) / 2], yaw: 0 });
    }
    // back wall of the alcove (the door wall) across a0..a1 at z=zr, with the door opening
    const doorOp: Opening = { s0: dt - dw / 2 - a0, s1: dt + dw / 2 - a0, y0: 0, y1: doorH, depth: 0 };
    k.wall(a0, zr, a1, zr, 0, winTop, frame, -1, [doorOp, { s0: doorOp.s0, s1: doorOp.s1, y0: doorH + 0.08, y1: winTop - 0.05 }]);
    k.wall(a0, zr + 0.06, a1, zr + 0.06, 0, H, wall, 1, [doorOp, { s0: doorOp.s0, s1: doorOp.s1, y0: doorH + 0.08, y1: winTop - 0.05 }], { collide: false });
    k.box(dt - dw / 2, doorH + 0.08, zr + 0.02, dt + dw / 2, winTop - 0.05, zr + 0.035, M.glass, { glass: true, occlude: false });
    // alcove side display windows open into the room: the display beds continue to the alcove
    k.portalRect(main, -1, a0, 0.0, a1, 0.0, 0, winTop);
  } else {
    k.portalRect(main, -1, a0, 0.0, a1, 0.0, 0, doorH);
  }
  k.door(`${u.id}:street`, dt - dw / 2, 0, doorZ + 0.03, dw, doorH, 0, -1, { street: true, glazed: true, locked: u.locked, cellA: main, cellB: -1, mat: c.era === 'modern' ? tint(M.chrome, '#a8a49a') : M.woodDark });
  k.marker('spawn', dt, 0, doorZ + 1.2, 'entry');
  // room shell (facade wall built above)
  k.room(x0, z0, x1, zb, 0, H, { floor, wall, ceiling: ceil }, {}, { skip: ['z0', ...(backDepth > 0 ? ['z1' as const] : [])] });
  // side walls between facade and z0 (wall thickness strip) closed by the party walls already
  k.floor(x0, 0.0, a0, z0, 0, floor); k.floor(a1, 0.0, x1, z0, 0, floor);
  k.ceiling(x0, 0, x1, z0, H, ceil);
  if (c.era !== 'modern') for (const [xa, xb] of [[x0, x1]]) { k.baseboard(xa, zb, xa, z0, 1, 0); k.baseboard(xb, z0, xb, zb, -1, 0); }
  let backCell: number | null = null, backDoorX: number | null = null;
  if (backDepth > 0) {
    const bdx = r.chance(0.5) ? x0 + 0.5 : x1 - 1.4; backDoorX = bdx + 0.45;
    const bop: Opening = { s0: x1 - (bdx + 0.9), s1: x1 - bdx, y0: 0, y1: 2.1, depth: 0.12 };
    // partition, visible both sides
    k.wall(x1, zb, x0, zb, 0, H, wall, 1, [bop]);
    backCell = k.cell('back', [x0, 0, zb + 0.12, x1, H, z1], 0);
    k.wall(x0, zb + 0.12, x1, zb + 0.12, 0, H, M.plasterCream, 1, [{ s0: bdx - x0, s1: bdx - x0 + 0.9, y0: 0, y1: 2.1 }], { collide: false });
    k.room(x0, zb + 0.12, x1, z1, 0, H, { floor: M.concrete, wall: r.pick([M.plasterCream, M.brickPainted, M.brick]), ceiling: M.ceilingPlaster }, {}, { skip: ['z0'] });
    k.portalRect(main, backCell, bdx + 0.9, zb, bdx, zb, 0, 2.1);
    k.door(`${u.id}:back`, bdx, 0, zb + 0.06, 0.9, 2.05, 0, 1, { cellA: main, cellB: backCell, locked: r.chance(0.35), mat: M.woodDark });
    k.use(main);
  }
  return { cell: main, x0, x1, z0, z1: zb, H, doorX: dt, doorZ: doorZ + 1.4, windows, backCell, backDoorX, wall, floor, ceil };
}

/** Through-wall reveal frame for an opening (z from 0 to WALL_T): jambs, head, optional sill. */
export function revealBox(k: Kit, s0: number, s1: number, y0: number, y1: number, mat: Mat, sill: boolean) {
  k.quad([s0, y0, 0], [0, 0, WALL_T], [0, y1 - y0, 0], [1, 0, 0], mat);
  k.quad([s1, y0, 0], [0, 0, WALL_T], [0, y1 - y0, 0], [-1, 0, 0], mat);
  k.quad([s0, y1, 0], [s1 - s0, 0, 0], [0, 0, WALL_T], [0, -1, 0], mat);
  if (sill) k.quad([s0, y0, 0], [s1 - s0, 0, 0], [0, 0, WALL_T], [0, 1, 0], mat);
}

/** Lights for a shop by era: fluorescent rows (modern), schoolhouse globes (deco), pendants (original). */
export function shopLights(c: GenCtx, s: ShopShell, o: { intensity?: number; kind?: 'fluor' | 'globe' | 'pendant' | 'bulb' } = {}) {
  const { k } = c;
  // grade-driven fixtures (references: grade 3-4 chandeliers and pendants, Gottscho 1939-41; grade 0-1 bare bulbs and tubes, DOCUMERICA 1973-74)
  const g = k.grade;
  let kind: 'fluor' | 'globe' | 'pendant' | 'bulb' | 'chandelier' = o.kind ?? (c.era === 'modern' ? 'fluor' : c.era === 'deco' ? 'globe' : 'pendant');
  if (g >= 4 && kind !== 'fluor') kind = 'chandelier';
  else if (g >= 4 && kind === 'fluor') kind = 'globe';
  else if (g <= 1 && kind === 'pendant') kind = c.r.chance(0.5) ? 'bulb' : 'pendant';
  else if (g === 0) kind = c.r.chance(0.6) ? 'bulb' : kind;
  const I = o.intensity ?? 1;
  const W = s.x1 - s.x0, D = s.z1 - s.z0;
  const cols = Math.max(1, Math.round(W / 3.2)), rows = Math.max(1, Math.round(D / 3.2));
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = s.x0 + ((i + 0.5) * W) / cols, z = s.z0 + ((j + 0.5) * D) / rows;
    if (kind === 'fluor') P.fluorescent(k, x, z, s.H, 1.22, 2.6 * I, Math.PI / 2, c.r.chance(0.08) ? 1 : 0);
    else if (kind === 'chandelier') P.chandelier(k, x, z, s.H, 3.0 * I);
    else if (kind === 'globe') P.globeLight(k, x, z, s.H, 2.4 * I);
    else if (kind === 'pendant') P.pendant(k, x, z, s.H, Math.min(1.2, s.H - 2.5), 2.6 * I);
    else P.bareBulb(k, x, z, s.H, 1.6 * I);
  }
}

/** Fill a back room with storage clutter, a desk or a kitchen by kind. Returns nothing. */
export function backRoom(c: GenCtx, s: ShopShell, style: 'storage' | 'kitchen' | 'office') {
  if (s.backCell === null) return;
  const { k, r } = c; k.use(s.backCell);
  const b = k.cells[s.backCell].box; const x0 = b[0], x1 = b[3], z0 = b[2], z1 = b[5];
  P.bareBulb(k, (x0 + x1) / 2, (z0 + z1) / 2, s.H, 1.4);
  if (style === 'kitchen') {
    P.counter(k, { x: x0 + 0.1, z: z1 - 0.7, yaw: 0 }, Math.min(3, x1 - x0 - 0.3), { top: M.steel, front: M.steel, h: 0.9, overhang: 0.02 });
    k.box(x1 - 1.1, 0, z1 - 0.9, x1 - 0.1, 0.9, z1 - 0.1, M.black, { collide: true });
    k.box(x1 - 1.0, 0.9, z1 - 0.8, x1 - 0.2, 0.93, z1 - 0.2, M.steel);
    P.sink(k, { x: x0 + 0.5, z: z0 + 0.35, yaw: Math.PI });
  } else if (style === 'office') {
    P.desk(k, { x: (x0 + x1) / 2, z: z1 - 1.3, yaw: 0 }, 1.4, 0.7, M.woodDark);
    P.chair(k, { x: (x0 + x1) / 2, z: z1 - 0.35, yaw: Math.PI });
    P.fileCabinet(k, { x: x1 - 0.4, z: z1 - 0.75, yaw: 0 });
    k.box(x0 + 0.1, 0, z1 - 0.7, x0 + 0.8, 0.9, z1 - 0.1, M.black, { collide: 'cover' }); // safe
    k.marker('safe', x0 + 0.45, 0.9, z1 - 0.8, 'office safe');
  }
  // cartons stacked along a wall
  for (let x = x0 + 0.2; x < x1 - 0.6; x += r.range(0.5, 0.8)) {
    if (r.chance(0.35)) continue;
    let y = 0; const h = r.int(1, 4);
    for (let q = 0; q < h; q++) { const hh = r.range(0.3, 0.45); k.box(x, y, z0 + 0.15, x + 0.48, y + hh, z0 + 0.6, tint(M.paper, r.pick(['#b8996a', '#a98a5a', '#c4a87a'])), { collide: q === 0 }); y += hh; }
  }
  k.marker('hide', (x0 + x1) / 2, 0, (z0 + z1) / 2, 'back room');
  if (c.unit.roofAccess) shipLadder(c, s.backCell, s.H);
  k.use(s.cell);
}

export { KINDS };

// ---------------------------------------------------------------- engine facade grid alignment (src/shared/facade.ts)
/**
 * Upper-floor window openings on the unit's facade, seated on the engine's bay grid: centres where the ring coordinate
 * (unit.ringU + ringDir * x) sits mid-bay. Returns local [s0, s1] spans within [x0, x1].
 */
export function bayWindowSpans(c: GenCtx, x0: number, x1: number): [number, number][] {
  const bay = bayWidth(c.b.style), w = bay * windowFrac(c.b.style), ru = c.unit.ringU ?? 0, dir = c.unit.ringDir ?? 1;
  const out: [number, number][] = [];
  const uA = ru + dir * x0, uB = ru + dir * x1;
  for (let k = Math.floor(Math.min(uA, uB) / bay) - 1; k <= Math.ceil(Math.max(uA, uB) / bay) + 1; k++) {
    const x = (k * bay + bay / 2 - ru) * dir;
    if (x - w / 2 >= x0 + 0.15 && x + w / 2 <= x1 - 0.15) out.push([x - w / 2, x + w / 2]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
/** Local y range of the engine's window on floor f (sill and head as fractions of the shared floor height). */
export function floorWindowY(c: GenCtx, f: number): [number, number] {
  const fh = c.b.fh, base = (c.b.gAvg - c.unit.y) + f * fh;
  const head = c.b.style === 2 || c.b.style === 3 ? 0.86 : 0.84;
  return [base + sillFrac(c.b.style) * fh, base + head * fh];
}

/** Point-in-ring (unit-local footprint). */
export function inRing(r: Float64Array, x: number, z: number) {
  let ins = false; const n = r.length / 2;
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const xi = r[2 * k], zi = r[2 * k + 1], xj = r[2 * j], zj = r[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins;
  }
  return ins;
}
type R4 = [number, number, number, number];
/**
 * Grow a rectangle [x0,z0,x1,z1] from `seed` inside the footprint, one 0.5 m strip at a time per side,
 * up to `max` extents, staying clear of `avoid` rects. With no footprint, the seed grows to `max`.
 */
export function fitRect(ring: Float64Array | null, seed: R4, max: R4, avoid: R4[] = [], margin = 0.25): R4 {
  const r: R4 = [...seed];
  const ok = (x0: number, z0: number, x1: number, z1: number) => {
    for (let x = x0; x <= x1 + 1e-6; x += Math.max(0.25, (x1 - x0) / Math.ceil((x1 - x0) / 0.6))) for (let z = z0; z <= z1 + 1e-6; z += Math.max(0.25, (z1 - z0) / Math.ceil((z1 - z0) / 0.6))) {
      if (ring && !inRing(ring, Math.min(Math.max(x, x0 + margin), x1 - margin), Math.min(Math.max(z, z0 + margin), z1 - margin))) return false;
      for (const a of avoid) if (x > a[0] + 0.01 && x < a[2] - 0.01 && z > a[1] + 0.01 && z < a[3] - 0.01) return false;
    }
    return true;
  };
  if (!ok(...r)) return [0, 0, 0, 0];
  const grow = [true, true, true, true];
  while (grow.some((g) => g)) {
    if (grow[0]) { if (r[0] - 0.5 >= max[0] && ok(r[0] - 0.5, r[1], r[0], r[3])) r[0] -= 0.5; else grow[0] = false; }
    if (grow[2]) { if (r[2] + 0.5 <= max[2] && ok(r[2], r[1], r[2] + 0.5, r[3])) r[2] += 0.5; else grow[2] = false; }
    if (grow[3]) { if (r[3] + 0.5 <= max[3] && ok(r[0], r[3], r[2], r[3] + 0.5)) r[3] += 0.5; else grow[3] = false; }
    if (grow[1]) { if (r[1] - 0.5 >= max[1] && ok(r[0], r[1] - 0.5, r[2], r[1])) r[1] -= 0.5; else grow[1] = false; }
  }
  return r;
}
