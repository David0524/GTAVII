/**
 * Lead homes in apartment towers (content/homes.json): a lobby with the building's character, the fire stair open at the
 * home's floor, a corridor, and a one-bedroom plan fitted to the footprint:
 *   front (facade windows): living room + bedroom   ·   back (along the corridor): foyer, kitchenette, bath.
 * Two buildings use it:
 *   - Delphine Moore, Penn South (1962 ILGWU co-op slab, 7th floor). Grade KEPT: glazed-brick halls, parquet, everything
 *     clean and modest, plants everywhere (portrait: pressing iron on a shelf like a trophy, sewing machine under a cover
 *     she made, framed 1963 union card, her mother's photo, a green notebook, two good dresses and five practical ones).
 *   - Nick Varelas, prewar doorman building at Madison & E 37th (11th floor). Grade PRISTINE: marble lobby with the
 *     doorman's desk (Cas Wojcik), panelled living room, a grand piano nobody plays, Eleni's reading chair, the desk with
 *     the drawer of unpaid bills, the Delacroix 9mm in a velvet case, a balcony door with dead geraniums.
 * References: pass 3 (references/contact/pass3_coop_apartment.jpg, pass3_luxury_apartment.jpg): modest 1956 compact NYC
 * flat (loc_2018728524/-522), panelled living room with a grand piano and a library (loc_2018727227/-228, 2018733682),
 * doorman lobbies (loc_2018732479, 2018727973).
 */
import { M, type Mat, tint } from '../../kit/materials';
import type { Kit } from '../../kit/Kit';
import * as P from '../../kit/props';
import * as G from '../../kit/propsGap';
import { W as WM } from '../../kit/wear';
import { type GenCtx, WALL_T, PARTY, fitRect, bayWindowSpans, floorWindowY } from '../common';
import { coreFacade, stairTower } from '../vertical';
import { towerLayout } from '../../layout';

type R4 = [number, number, number, number];
export interface HomePlan { living: R4; bed: R4; foyer: R4; kitchen: R4; bath: R4; y0: number; H: number; win: { living?: [number, number]; bed?: [number, number]; sill: number; head: number } }
interface HomeSpec {
  floor: number;                         // 0-based floor index of the home
  grand?: boolean;                       // wide pre-war plan: gallery foyer, living room with every facade bay
  label: string;                         // apartment number on the door
  lobby: 'coop1960' | 'prewar';
  finishes: { floor: Mat; wall: Mat; bedWall: Mat; ceiling: Mat; hall: Mat; hallFloor: Mat };
  dress: (k: Kit, p: HomePlan, c: GenCtx) => void;
}

export function genHomeTower(c: GenCtx, s: HomeSpec) {
  const { k, unit: u } = c;
  const L = towerLayout(u, c.b);
  const x0 = PARTY, zl = L.zs - 0.15, Hl = s.lobby === 'prewar' ? 4.4 : 3.3;
  // ------------------------------------------------ lobby
  const lobby = k.cell('home_lobby', [x0, 0, WALL_T, u.w - PARTY, Hl, zl], 0);
  const coop = s.lobby === 'coop1960';
  coreFacade(c, lobby, { ...L, fh: Hl }, coop ? tint(M.subway, '#c9c2a8') : M.marble, coop ? M.chrome : tint(M.chrome, '#9a8458'), coop ? tint(M.steel, '#8a8a84') : M.woodDark, true);
  k.room(x0, WALL_T, u.w - PARTY, zl, 0, Hl, { floor: coop ? M.terrazzo : M.marble, wall: coop ? tint(M.subway, '#c9c2a8') : M.paneling, ceiling: coop ? M.acoustic : M.ceilingPlaster }, {}, { skip: ['z0', 'z1'] });
  k.wall(L.x0 - 0.15, zl, x0, zl, 0, Hl, coop ? tint(M.subway, '#c9c2a8') : M.marble, 1);
  const lx = (x0 + L.x0) / 2;
  P.elevatorDoors(k, { x: Math.max(x0 + 0.8, L.x0 - 1.4), z: zl - 0.02, yaw: 0 }, 1.0, 2.2, coop ? tint(M.steel, '#9a9a92') : tint(M.chrome, '#9a8458'));
  k.marker('prop', Math.max(x0 + 0.8, L.x0 - 1.4), 0, zl - 0.6, 'elevator (engine request 5: moving platforms)');
  P.mailboxes(k, { x: x0 + 0.02, z: WALL_T + 1.4, yaw: -Math.PI / 2 }, 6, 4);
  if (coop) {
    // 1962 co-op: terrazzo, glazed tile, a bulletin board of co-op notices, a bench and a rubber plant, globe ceiling lights
    k.box(x0 + 0.02, 1.2, zl - 2.4, x0 + 0.04, 1.9, zl - 1.4, tint(M.wood, '#8a6a44'), { occlude: false });
    k.artSlot('notice', x0 + 0.05, 1.55, zl - 1.9, 0.9, 0.6, 1, 0);
    k.at(0, () => P.bench(k, { x: u.w - PARTY - 0.3, z: WALL_T + 1.0, yaw: -Math.PI / 2 }, 1.6, M.woodLight));
    for (let z = WALL_T + 1.5; z < zl; z += 3) P.globeLight(k, lx, z, Hl, 1.8);
  } else {
    // prewar: marble, panelling, the doorman's desk and stool, a console with a mirror, a brass chandelier
    k.at(0, () => G.bb(k, { x: u.w - PARTY - 0.8, z: WALL_T + 1.8, yaw: Math.PI / 2 }, -0.7, 0, -0.3, 0.7, 1.05, 0.3, M.woodDark, 0.02, { collide: 'cover' }));
    k.slot('doorman', u.w - PARTY - 0.35, 0, WALL_T + 1.8, -Math.PI / 2); // Cas Wojcik: his mood tracks Nick's finances
    k.marker('service', u.w - PARTY - 1.4, 0, WALL_T + 1.8, 'doorman (Cas Wojcik)');
    P.mirror(k, { x: x0 + 0.02, z: (WALL_T + zl) / 2, yaw: -Math.PI / 2 }, 1.1, 1.3, 1.0);
    P.chandelier(k, lx, (WALL_T + zl) / 2, Hl, 2.6);
  }
  k.marker('spawn', u.door.t, 0, WALL_T + 1.2, `${s.label} lobby`);
  // ------------------------------------------------ the fire stair, open at the home's floor
  const f = Math.min(s.floor, L.floors - 1);
  const stairs = stairTower(c, L, lobby, [f]);
  const y0 = f * L.fh, H = Math.min(s.grand ? 3.2 : 2.8, L.fh - 0.2);
  // corridor in front of the stair door, running -x
  const cz1 = L.zs - 0.15, cz0 = cz1 - 1.5, dx0 = L.x0 + 0.2;
  const crc = fitRect(c.ring, [dx0 - 1, cz0, L.x1, cz1], [-40, cz0, L.x1, cz1], [], 0.3);
  const cx0 = Math.max(crc[0], (L.x1 - (s.grand ? 19 : 14)));
  const hall = k.cell(`home_hall${f}`, [cx0, y0, cz0, L.x1, y0 + H, cz1], f);
  k.portalRect(stairs[f], hall, dx0, cz1, dx0 + 0.9, cz1, y0, y0 + 2.1);
  // the apartment: from the facade to the corridor, left of the door
  const aw = s.grand ? 15.5 : 8;
  const front = fitRect(c.ring, [cx0, cz0 - 3, Math.min(L.x1, cx0 + aw - 1), cz0], [cx0, WALL_T, Math.min(L.x1, cx0 + aw), cz0], [], 0.25);
  const ax0 = front[0], ax1 = front[2], az0 = Math.max(WALL_T, front[1]), D = cz0 - az0, Wd = ax1 - ax0;
  const doorX = ax1 - 1.1;
  k.floor(cx0, cz0, L.x1, cz1, y0, s.finishes.hallFloor); k.ceiling(cx0, cz0, L.x1, cz1, y0 + H, M.ceilingPlaster);
  k.box(cx0, y0 - 0.25, cz0, L.x1, y0, cz1, M.concrete, { collide: true, faces: 0b000100 });
  k.wall(cx0, cz0, L.x1, cz0, y0, y0 + H, s.finishes.hall, 1, [{ s0: doorX - 0.45 - cx0, s1: doorX + 0.45 - cx0, y0, y1: y0 + 2.05, depth: 0.12 }]);
  k.wall(L.x1, cz1, cx0, cz1, y0, y0 + H, s.finishes.hall, 1, [{ s0: L.x1 - (dx0 + 0.9), s1: L.x1 - dx0, y0, y1: y0 + 2.1, depth: 0 }]);
  k.wall(cx0, cz1, cx0, cz0, y0, y0 + H, s.finishes.hall, 1); k.wall(L.x1, cz0, L.x1, cz1, y0, y0 + H, s.finishes.hall, 1);
  for (let x = cx0 + 1.2; x < L.x1; x += 3.5) P.globeLight(k, x, (cz0 + cz1) / 2, y0 + H, 1.4);
  k.door(`${u.id}:apt${s.label}`, doorX + 0.45, y0, cz0 + 0.03, 0.9, 2.05, Math.PI, -1, { cellA: hall, cellB: -1, mat: s.lobby === 'prewar' ? M.woodDark : tint(M.paintBrown, '#6a5a48'), key: `key.home.${s.label}` });
  k.box(doorX - 0.08, y0 + 1.55, cz0 + 0.012, doorX + 0.08, y0 + 1.62, cz0 + 0.016, tint(M.chrome, '#b08a4a'), { occlude: false }); // number plate
  k.use(hall);
  // plan: front rooms (living + bed) up to 4.6 m deep, back strip foyer | kitchen | bath
  const zf = az0 + Math.min(4.6, Math.max(3.2, D - 2.4)), lw = Wd * 0.58;
  const living: R4 = [ax0, az0, ax0 + lw, zf], bed: R4 = [ax0 + lw + 0.1, az0, ax1, zf];
  // grand: a gallery-width entrance hall
  const foyer: R4 = [ax1 - (s.grand ? 4.6 : 2.0), zf + 0.1, ax1, cz0], bath: R4 = [ax0, zf + 0.1, ax0 + Math.min(2.2, Wd * 0.3), cz0], kitchen: R4 = [bath[2] + 0.1, zf + 0.1, foyer[0] - 0.1, cz0];
  const fin = s.finishes;
  const cellOf = (name: string, r: R4) => k.cell(name, [r[0], y0, r[1], r[2], y0 + H, r[3]], f);
  const cf = cellOf(`home_foyer`, foyer), cl = cellOf('home_living', living), cb = cellOf('home_bedroom', bed), ck = cellOf('home_kitchen', kitchen), cbt = cellOf('home_bath', bath);
  k.portalRect(hall, cf, doorX - 0.45, cz0, doorX + 0.45, cz0, y0, y0 + 2.05);
  // openings: foyer->living (wide arch through the shared z wall), foyer->kitchen (open side), living->bed door, kitchen->bath door
  const arch = { x0: Math.max(foyer[0], living[0]) + 0.2, x1: Math.min(foyer[2], living[2]) - 0.2 };
  const hasArch = arch.x1 - arch.x0 > 0.9;
  const bwins = bayWindowSpans(c, living[0], living[2]), bwin = bwins[0], bwin2 = bayWindowSpans(c, bed[0], bed[2])[0];
  const lwins = s.grand ? bwins : bwins.slice(0, 1);
  const [wy0, wy1] = floorWindowY(c, f);
  const sill = Math.max(y0 + 0.35, wy0), head = Math.min(y0 + H - 0.15, wy1);
  // living room
  k.use(cl);
  k.room(...living.slice(0, 2) as [number, number], ...living.slice(2) as [number, number], y0, y0 + H, { floor: fin.floor, wall: fin.wall, ceiling: fin.ceiling },
    { z0: lwins.map((bw) => ({ s0: bw[0] - living[0], s1: bw[1] - living[0], y0: sill, y1: head, depth: 0.3 })), x1: [{ s0: 0.6, s1: 1.5, y0, y1: y0 + 2.05 }], z1: hasArch ? [{ s0: living[2] - arch.x1, s1: living[2] - arch.x0, y0, y1: y0 + 2.2 }] : [] });
  for (const bw of lwins) { k.portalRect(cl, -1, bw[0], living[1], bw[1], living[1], sill, head); k.box(bw[0], sill, living[1] - 0.02, bw[1], head, living[1] - 0.01, M.glass, { glass: true, occlude: false }); }
  if (hasArch) k.portalRect(cf, cl, arch.x0, zf, arch.x1, zf, y0, y0 + 2.2);
  // bedroom
  k.use(cb);
  k.room(bed[0], bed[1], bed[2], bed[3], y0, y0 + H, { floor: fin.floor, wall: fin.bedWall, ceiling: fin.ceiling },
    { z0: bwin2 ? [{ s0: bwin2[0] - bed[0], s1: bwin2[1] - bed[0], y0: sill, y1: head, depth: 0.3 }] : [], x0: [{ s0: bed[3] - bed[1] - 1.5, s1: bed[3] - bed[1] - 0.6, y0, y1: y0 + 2.05 }] });
  if (bwin2) { k.portalRect(cb, -1, bwin2[0], bed[1], bwin2[1], bed[1], sill, head); k.box(bwin2[0], sill, bed[1] - 0.02, bwin2[1], head, bed[1] - 0.01, M.glass, { glass: true, occlude: false }); }
  k.portalRect(cl, cb, living[2], living[1] + 0.6, living[2], living[1] + 1.5, y0, y0 + 2.05);
  k.door(`${u.id}:bedroom`, living[2] + 0.05, y0, living[1] + 0.6, 0.9, 2.05, Math.PI / 2, 1, { cellA: cl, cellB: cb, mat: fin.floor === M.marble ? M.woodDark : tint(M.paintBrown, '#7a6a58') });
  // foyer, kitchen, bath
  k.use(cf); k.room(foyer[0], foyer[1], foyer[2], foyer[3], y0, y0 + H, { floor: fin.floor, wall: fin.wall, ceiling: fin.ceiling }, { z1: [{ s0: foyer[2] - (doorX + 0.45), s1: foyer[2] - (doorX - 0.45), y0, y1: y0 + 2.05 }], z0: hasArch ? [{ s0: arch.x0 - foyer[0], s1: arch.x1 - foyer[0], y0, y1: y0 + 2.2 }] : [] }, { skip: ['x0'] });
  k.use(ck); k.room(kitchen[0], kitchen[1], kitchen[2], kitchen[3], y0, y0 + H, { floor: M.lino, wall: tint(M.enamelWhite, '#e0d8c4'), ceiling: fin.ceiling }, { x0: [{ s0: 0.4, s1: 1.2, y0, y1: y0 + 2.05 }] }, { skip: ['x1'] });
  k.portalRect(cf, ck, foyer[0], foyer[1], foyer[0], foyer[3], y0, y0 + H);
  k.use(cbt); k.room(bath[0], bath[1], bath[2], bath[3], y0, y0 + H, { floor: M.hexWhite, wall: M.subway, ceiling: fin.ceiling });
  k.portalRect(ck, cbt, bath[2], bath[1] + 0.4, bath[2], bath[1] + 1.2, y0, y0 + 2.05);
  k.door(`${u.id}:bath`, bath[2] + 0.05, y0, bath[1] + 0.4, 0.8, 2.05, Math.PI / 2, -1, { cellA: ck, cellB: cbt, mat: tint(M.enamelWhite, '#d8d0bc') });
  // fixtures common to both: kitchen run, bath fixtures, ceiling lights
  k.use(ck); k.at(y0, () => {
    P.counter(k, { x: kitchen[0] + 0.1, z: kitchen[3] - 0.65, yaw: 0 }, Math.max(1.2, kitchen[2] - kitchen[0] - 0.9), { top: M.formicaCream, front: tint(M.enamelWhite, '#e8e0cc'), h: 0.9, overhang: 0.03 });
    G.bb(k, { x: kitchen[2] - 0.4, z: kitchen[3] - 0.35, yaw: 0 }, -0.33, 0, -0.32, 0.33, 1.6, 0.32, M.enamelWhite, 0.06, { collide: 'cover' }); // rounded refrigerator
  });
  P.globeLight(k, (kitchen[0] + kitchen[2]) / 2, (kitchen[1] + kitchen[3]) / 2, y0 + H, 1.6);
  k.use(cbt); k.at(y0, () => { G.clawfootTub(k, { x: bath[0] + 0.85, z: bath[3] - 0.45, yaw: 0 }); P.sink(k, { x: bath[2] - 0.35, z: bath[1] + 0.3, yaw: Math.PI }); });
  P.globeLight(k, (bath[0] + bath[2]) / 2, (bath[1] + bath[3]) / 2, y0 + H, 1.8);
  k.use(cl); P.globeLight(k, (living[0] + living[2]) / 2, (living[1] + living[3]) / 2, y0 + H, 1.9);
  k.use(cb); P.globeLight(k, (bed[0] + bed[2]) / 2, (bed[1] + bed[3]) / 2, y0 + H, 1.5);
  k.use(cf); P.globeLight(k, (foyer[0] + foyer[2]) / 2, (foyer[1] + foyer[3]) / 2, y0 + H, 1.2);
  k.marker('spawn', (foyer[0] + foyer[2]) / 2, y0, (foyer[1] + foyer[3]) / 2, `home: ${s.label}`);
  s.dress(k, { living, bed, foyer, kitchen, bath, y0, H, win: { living: bwin, bed: bwin2, sill, head } }, c);
  k.use(lobby);
}

// ---------------------------------------------------------------- Delphine Moore, Penn South 7th floor (kept)
const plantAt = (k: Kit, x: number, z: number, y0: number, tall: boolean) => {
  const r = k.wr; k.cyl(x, y0, z, 0.16, 0.3, WM.terracotta, 10, { r1: 0.2, collide: true });
  const h = tall ? r.range(0.9, 1.3) : r.range(0.35, 0.6);
  for (let q = 0; q < (tall ? 12 : 8); q++) {
    const a = (q / (tall ? 12 : 8)) * Math.PI * 2 + r.range(-0.3, 0.3), L = r.range(0.3, 0.5) * (tall ? 1 : 0.7), y1 = y0 + 0.3 + h * r.range(0.5, 0.8);
    k.tube([x, y0 + 0.3, z], [x + Math.cos(a) * L * 0.45, y1 + L * 0.3, z + Math.sin(a) * L * 0.45], 0.03, WM.leaf, 5);
    k.tube([x + Math.cos(a) * L * 0.45, y1 + L * 0.3, z + Math.sin(a) * L * 0.45], [x + Math.cos(a) * L, y1 - L * 0.05, z + Math.sin(a) * L], 0.022, WM.leaf, 5);
  }
};
export function genDelphine(c: GenCtx) {
  genHomeTower(c, {
    floor: 6, label: '7C', lobby: 'coop1960',
    finishes: { floor: tint(M.planks, '#8a6a46'), wall: tint(M.plasterCream, '#e2d8bc'), bedWall: tint(M.plasterBlue, '#a8b4b4'), ceiling: M.ceilingPlaster, hall: tint(M.subway, '#d0c8ae'), hallFloor: M.terrazzo },
    dress: (k, p) => {
      const { living: Lr, bed: Br, y0 } = p;
      k.use(k.cells.findIndex((cc) => cc.name === 'home_living'));
      // living: a small sofa, the sewing machine under its cover by the window, the pressing iron on a shelf like a trophy
      k.at(y0, () => {
        P.sofa(k, { x: (Lr[0] + Lr[2]) / 2, z: Lr[3] - 0.5, yaw: 0 }, Math.min(1.8, Lr[2] - Lr[0] - 1.2), tint(M.fabricOlive, '#7a8058'));
        G.dinetteTable(k, { x: Lr[0] + 0.9, z: Lr[1] + 1.6, yaw: 0 }, 0.9, 0.7, M.formicaTeal);
        G.dinetteChair(k, { x: Lr[0] + 0.9, z: Lr[1] + 2.2, yaw: Math.PI }, M.vinylGreen);
        P.sewingMachine(k, { x: Lr[2] - 0.7, z: Lr[1] + 0.55, yaw: Math.PI });
      });
      k.box(Lr[2] - 1.05, y0 + 0.74, Lr[1] + 0.3, Lr[2] - 0.35, y0 + 1.02, Lr[1] + 0.8, tint(M.fabricRust, '#b06a4a'), { occlude: false }); // the cover she made
      k.box(Lr[0] + 0.02, y0 + 1.5, Lr[1] + 1.0, Lr[0] + 0.3, y0 + 1.53, Lr[1] + 2.2, M.woodDark, { occlude: false });            // shelf
      k.box(Lr[0] + 0.08, y0 + 1.53, Lr[1] + 1.4, Lr[0] + 0.24, y0 + 1.66, Lr[1] + 1.65, tint(M.chrome, '#8a8a84'));             // the pressing iron
      k.marker('prop', Lr[0] + 0.15, y0 + 1.6, Lr[1] + 1.5, 'the pressing iron she kept, like a trophy');
      k.artSlot('photo', Lr[0] + 0.03, y0 + 1.85, Lr[1] + 1.9, 0.22, 0.28, 1, 0);   // framed union card, 1963
      k.artSlot('photo', Lr[0] + 0.03, y0 + 1.85, Lr[1] + 1.3, 0.2, 0.25, 1, 0);    // her mother's photo, Wilmington
      k.box(Lr[0] + 0.7, y0 + 0.761, Lr[1] + 1.45, Lr[0] + 0.88, y0 + 0.775, Lr[1] + 1.7, tint(M.fabricOlive, '#3a6a3a'), { occlude: false }); // the green notebook (decoy)
      k.marker('stash', Lr[0] + 0.8, y0 + 0.78, Lr[1] + 1.55, 'green notebook (decoy: she never writes in it)');
      k.marker('wait', (Lr[0] + Lr[2]) / 2, y0 + 0.44, Lr[3] - 0.5, 'sofa');
      // plants: a lot of plants (sill, corners, table)
      for (const [px, pz, tall] of [[Lr[0] + 0.35, Lr[1] + 0.35, true], [Lr[2] - 0.35, Lr[3] - 0.35, true], [Lr[0] + 0.35, Lr[3] - 0.4, false], [(Lr[0] + Lr[2]) / 2 - 0.4, Lr[1] + 0.3, false], [(Lr[0] + Lr[2]) / 2 + 0.3, Lr[1] + 0.3, false]] as [number, number, boolean][]) plantAt(k, px, pz, y0, tall);
      k.box(Lr[0] + 0.6, y0 + 0.004, Lr[1] + 2.4, Lr[2] - 0.6, y0 + 0.012, Lr[3] - 1.1, WM.rug[1], { occlude: false });
      // bedroom: bed with a chenille spread, wardrobe (outfit change), dresser, a plant on the sill
      k.use(k.cells.findIndex((cc) => cc.name === 'home_bedroom'));
      k.at(y0, () => { P.bed(k, { x: (Br[0] + Br[2]) / 2, z: Br[1] + 0.25, yaw: 0 }, 1.35, Math.min(1.95, Br[3] - Br[1] - 1.0), tint(M.fabricCamel, '#e0cfa8')); P.dresser(k, { x: Br[2] - 0.55, z: Br[3] - 0.3, yaw: Math.PI }, 0.9); });
      k.at(y0, () => G.bb(k, { x: Br[0] + 0.35, z: Br[3] - 0.8, yaw: Math.PI / 2 }, -0.5, 0, -0.3, 0.5, 1.9, 0.3, tint(M.wood, '#6a4a30'), 0.02, { collide: 'cover' }));
      k.marker('wardrobe', Br[0] + 0.7, y0, Br[3] - 0.8, 'two good dresses, five practical ones');
      k.marker('bed', (Br[0] + Br[2]) / 2, y0 + 0.55, Br[1] + 1.0, "Delphine's bed (save / sleep)");
      plantAt(k, Br[2] - 0.35, Br[1] + 0.3, y0, false);
      // bath: the string over the tub for drying prints (act 2 dressing hangs prints on it)
      const bt = p.bath; k.use(k.cells.findIndex((cc) => cc.name === 'home_bath'));
      k.tube([bt[0] + 0.1, y0 + 1.9, bt[3] - 0.45], [bt[2] - 0.1, y0 + 1.9, bt[3] - 0.45], 0.003, M.paper, 4);
      k.marker('prop', (bt[0] + bt[2]) / 2, y0 + 1.85, bt[3] - 0.45, 'string over the bath (act 2: prints drying)');
    },
  });
}

// ---------------------------------------------------------------- Nick Varelas, Madison & E 37th, 11th floor (pristine)
export function genVarelas(c: GenCtx) {
  genHomeTower(c, {
    floor: 10, label: '11A', lobby: 'prewar', grand: true,
    finishes: { floor: tint(M.planks, '#6a4a2a'), wall: M.paneling, bedWall: tint(M.wallpaper, '#8a7a5a'), ceiling: M.ceilingPlaster, hall: tint(M.wallpaper, '#a08a64'), hallFloor: M.carpetRed },
    dress: (k, p) => {
      const { living: Lr, bed: Br, y0 } = p;
      k.use(k.cells.findIndex((cc) => cc.name === 'home_living'));
      k.at(y0, () => {
        // the grand piano nobody plays: curved case on three legs, lid closed, a runner and photos on top
        const px = Lr[0] + 1.3, pz = Lr[1] + 1.4;
        const rings = [0, 1].map((q) => { const out: [number, number, number][] = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, rx = 0.75, rz = 0.95 * (Math.sin(a) > 0 ? 1 : 0.55); out.push([px + Math.cos(a) * rx, 0.62 + q * 0.3, pz - Math.sin(a) * rz]); } return out; });
        k.loft(rings, tint(M.black, '#141210'), { capEnd: true });
        for (const [lx, lz] of [[-0.6, -0.4], [0.6, -0.4], [0, 0.8]]) k.cyl(px + lx, 0, pz - lz, 0.04, 0.62, tint(M.black, '#141210'), 8, { r1: 0.05 });
        G.bb(k, { x: px, z: pz + 0.75, yaw: 0 }, -0.4, 0, -0.18, 0.4, 0.5, 0.18, tint(M.black, '#141210'), 0.02); // bench
        k.collider({ c: [px, 0.46, pz], h: [0.75, 0.46, 0.9], yaw: 0, cover: true });
        // Eleni's reading chair with her glasses on a ledger, a lamp table, the sofa, worry beads on every table
        P.armchair(k, { x: Lr[2] - 0.8, z: Lr[1] + 1.2, yaw: Math.PI * 0.85 }, tint(M.fabricRust, '#7a3a2a'));
        P.sofa(k, { x: (Lr[0] + Lr[2]) / 2, z: Lr[3] - 0.55, yaw: 0 }, Math.min(2.2, Lr[2] - Lr[0] - 1.4), tint(M.fabricCamel, '#b89a6a'));
        P.table(k, { x: Lr[2] - 0.6, z: Lr[1] + 2.1, yaw: 0 }, 0.5, 0.5, M.woodDark, 0.6, M.woodDark);
        P.table(k, { x: (Lr[0] + Lr[2]) / 2, z: Lr[3] - 1.6, yaw: 0 }, 1.1, 0.6, M.woodDark, 0.45, M.woodDark);
      });
      k.marker('prop', Lr[0] + 1.3, y0 + 0.92, Lr[1] + 1.4, 'the grand piano nobody plays');
      k.marker('prop', Lr[2] - 0.6, y0 + 0.62, Lr[1] + 2.1, "Eleni's glasses on a ledger");
      k.marker('wait', Lr[2] - 0.8, y0 + 0.47, Lr[1] + 1.2, "Eleni's reading chair");
      for (const [ax, az, nx] of [[Lr[0] + 0.03, Lr[1] + 2.6, 1], [Lr[0] + 0.03, Lr[1] + 3.2, 1], [Lr[2] - 0.03, Lr[3] - 1.4, -1]] as [number, number, number][]) k.artSlot('photo', ax, y0 + 1.6, az, 0.4, 0.3, nx, 0); // Kastoria lake, the first shop, the 1962 banquet
      k.box(Lr[0] + 0.6, y0 + 0.004, Lr[1] + 2.2, Lr[2] - 0.6, y0 + 0.012, Lr[3] - 1.0, WM.rug[0], { occlude: false });
      P.chandelier(k, (Lr[0] + Lr[2]) / 2, (Lr[1] + Lr[3]) / 2, y0 + p.H, 2.4);
      // bedroom: the desk with the bills drawer and the velvet case, the bed, wardrobe
      k.use(k.cells.findIndex((cc) => cc.name === 'home_bedroom'));
      k.at(y0, () => {
        P.bed(k, { x: (Br[0] + Br[2]) / 2, z: Br[1] + 0.25, yaw: 0 }, 1.5, Math.min(2.0, Br[3] - Br[1] - 1.1), tint(M.fabricRust, '#5a2a2a'));
        P.desk(k, { x: Br[2] - 0.8, z: Br[3] - 0.5, yaw: Math.PI }, 1.2, 0.6, M.woodDark);
        G.bb(k, { x: Br[0] + 0.35, z: Br[3] - 0.9, yaw: Math.PI / 2 }, -0.6, 0, -0.3, 0.6, 2.0, 0.3, M.woodDark, 0.02, { collide: 'cover' });
      });
      k.box(Br[2] - 1.2, y0 + 0.76, Br[3] - 0.65, Br[2] - 0.85, y0 + 0.82, Br[3] - 0.45, tint(M.fabricRust, '#4a1a2a'), { occlude: false }); // velvet case
      k.marker('stash', Br[2] - 1.0, y0 + 0.8, Br[3] - 0.55, 'the Delacroix 9mm in a velvet case (unloaded since 1956)');
      k.marker('burglary', Br[2] - 0.6, y0 + 0.6, Br[3] - 0.5, 'desk drawer of unpaid bills');
      k.marker('wardrobe', Br[0] + 0.7, y0, Br[3] - 0.9, 'wardrobe');
      k.marker('bed', (Br[0] + Br[2]) / 2, y0 + 0.55, Br[1] + 1.0, "Nick's bed (save / sleep)");
      // the balcony door in the living-room window bay, dead geraniums in a box outside it
      if (p.win.living) { const [w0, w1] = p.win.living; k.use(k.cells.findIndex((cc) => cc.name === 'home_living')); k.box(w0 + 0.1, y0, Lr[1] - 0.6, w1 - 0.1, y0 + 0.3, Lr[1] - 0.35, tint(M.wood, '#5a3a24'), { occlude: false }); for (let q = 0; q < 5; q++) k.tube([w0 + 0.2 + q * (w1 - w0 - 0.4) / 4, y0 + 0.3, Lr[1] - 0.48], [w0 + 0.25 + q * (w1 - w0 - 0.4) / 4, y0 + 0.55, Lr[1] - 0.5], 0.01, WM.deadLeaf, 4); k.marker('prop', (w0 + w1) / 2, y0 + 0.3, Lr[1] - 0.5, 'balcony with dead geraniums'); }
    },
  });
}
