import * as THREE from 'three/webgpu';
import { GeoBuilder, SLOTS, extractRegions, type Slot, type V3, clamp, lerp, pw, smooth } from './builder';
import { type ModelSpec, type GlassKind, type CargoSpec, sMid } from './spec';

/** Where decals (canvas textures) go; created by decals.ts. */
export interface DecalAnchor {
  kind: 'fare' | 'police' | 'unit' | 'taxiSign' | 'destSign' | 'fleet' | 'operator' | 'ambulance' | 'fireDept' | 'mail' | 'icecream';
  pos: V3; normal: V3; w: number; h: number;
}
export interface WheelMount { x: number; y: number; z: number; front: boolean; side: 1 | -1; dual: boolean; r: number }
export interface BoxCollider { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }

export interface GeneratedModel {
  body: THREE.BufferGeometry;
  hood: THREE.BufferGeometry | null;
  /** LOD0 passenger cars: the steering wheel rim and spokes (turns about `axis` through `centre`). */
  steering: { geo: THREE.BufferGeometry; centre: V3; axis: V3 } | null;
  /** LOD0 passenger cars: doors cut from the body (front-hinged; swing open, hang, detach). */
  doors: DoorPart[];
  /** LOD0 only: bumpers as separate meshes (sag, detach); null at LOD1 (merged into the body). */
  bumperF: THREE.BufferGeometry | null;
  bumperR: THREE.BufferGeometry | null;
  /** Hood hinge (rear edge of the hood), local space. */
  hoodPivot: V3;
  wheelR: THREE.BufferGeometry; wheelL: THREE.BufferGeometry;
  wheels: WheelMount[];
  beacon: THREE.BufferGeometry | null;
  decals: DecalAnchor[];
  colliders: BoxCollider[];
  /** Licence-plate mounts (front may be absent on some classes). */
  plates: { pos: V3; normal: V3 }[];
  /** Local-space lamp anchor points (for light cones / glows) */
  lamps: { head: V3[]; tail: V3[] };
  /** Extents in local space. */
  minZ: number; maxZ: number; halfW: number; height: number;
  tris: number;
}

export interface GenOptions {
  lod: 0 | 1;
  vinyl: 'none' | 'full' | 'landau';
  whitewall: boolean;
  wheelStyle: ModelSpec['wheelStyle'];
  /**
   * Hero detail (player car and the near ring): every surface grid refined with a smooth spline,
   * 64-segment wheels with tread and sidewall geometry, finer trims, relief badges, gauges.
   * Only meaningful with lod 0.
   */
  hero?: boolean;
}

/** A door cut out of the body: side, z span, hinge point (body space), its own geometry. */
export interface DoorPart { side: 1 | -1; z0: number; z1: number; hinge: V3; geo: THREE.BufferGeometry }

/** Body cross-section run indices: right side, top, left side, underside. */
interface Section { s: number; side: V3[]; top: V3[]; under: [V3, V3] }

export function generate(m: ModelSpec, o: GenOptions): GeneratedModel {
  const b = new GeoBuilder();
  const hoodB = new GeoBuilder();
  if (o.hero) { b.sub = hoodB.sub = 1; b.tubeSegs = hoodB.tubeSegs = 6; }
  const lod = o.lod;
  const mid = sMid(m);
  const Z = (s: number) => s - mid;
  const L = m.L;
  const R = m.wheelR;

  // ---------------------------------------------------------------- plan & profile functions
  const halfW = (s: number) => {
    let inset = 0;
    const cf = m.cornerF, cr = m.cornerR;
    if (s < cf) { const t = (cf - s) / cf; inset = cf * 0.55 * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
    if (s > L - cr) { const t = (s - (L - cr)) / cr; inset = Math.max(inset, cr * 0.55 * (1 - Math.sqrt(Math.max(0, 1 - t * t)))); }
    let hw = m.W / 2 - inset;
    const hip = m.shape?.hip;
    if (hip) { const t = (s - hip.s) / hip.w; hw *= 1 + hip.amount * Math.exp(-t * t * 2.2); }
    return hw;
  };
  const axles: { s: number; skirt: boolean }[] = [];
  const rearS = m.sF + m.wheelbase;
  if (m.sF < L) axles.push({ s: m.sF, skirt: false });
  if (rearS < L) axles.push({ s: rearS, skirt: !!m.skirts });
  const archR = R + m.archGap;
  const bottomY = (s: number) => {
    let y = m.sillY;
    for (const a of axles) {
      const d = Math.abs(s - a.s);
      if (d < archR) {
        let ay = R + Math.sqrt(archR * archR - d * d);
        if (a.skirt) ay = Math.min(ay, R * 0.92);
        y = Math.max(y, ay);
      }
    }
    return y;
  };
  const topY = (s: number) => pw(m.top, s);
  const beltAt = (s: number) => Math.min(m.beltY, topY(s));
  /** Longitudinal setback of the front/rear faces with height (raked nose/tail). */
  const rake = (s: number, y: number) => {
    const y0 = m.sillY, yt = topY(s);
    const hn = clamp((y - y0) / Math.max(0.1, yt - y0), 0, 1);
    return m.noseRake * hn * (1 - smooth(0, 0.35, s)) - m.tailRake * hn * smooth(L - 0.35, L, s);
  };

  // Heights where the side needs an edge (stripes, wood, two-tone, trim) for crisp boundaries.
  const extraY: number[] = [];
  if (m.stripe) extraY.push(...m.stripe);
  if (m.wood) extraY.push(m.wood.y0, m.wood.y1);
  if (m.trim.side) extraY.push(m.trim.side.y - 0.02, m.trim.side.y + 0.02);
  // Row order from the nominal (mid-body) heights.
  const nominal = (lod0: boolean) => {
    const yb = m.beltY, c = lerp(m.sillY, m.beltY, m.crease);
    return [m.sillY, m.sillY + 0.05, lerp(m.sillY + 0.05, c, 0.5), c, lerp(c, yb - 0.07, 0.5), ...(lod0 ? extraY : []), yb - 0.07, yb - 0.025, yb];
  };
  const order = nominal(lod === 0).map((y, k) => [y, k]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((e) => e[1]);
  const SIDE_ORDER = (n: number) => (n === order.length ? order : [...Array(n).keys()]);

  const sideX = (s: number, y: number) => {
    const hw = halfW(s), y0 = bottomY(s), yb = beltAt(s);
    const creaseY = lerp(m.sillY, m.beltY, m.crease);
    // over the wheel arches the skin stays vertical (a clean cut-out), only the sill tucks under
    const arch = y0 > m.sillY + 0.01;
    const sh = m.shape ?? {};
    const tuck = sh.tuck ?? 0.92, tumble = sh.tumble ?? 0.994, round = sh.round ?? 0;
    const cY = Math.max(y0 + 0.06, creaseY);
    const w05 = arch ? 0.998 : lerp(tuck, 1, 0.81);
    // convex lower side: the mid point between sill and crease bulges out by `round`
    const lowY = lerp(y0 + 0.05, cY, 0.5), lowLin = lerp(w05, 1, 0.5);
    const low = arch ? 0.999 : lerp(lowLin, 1, round * 0.85);
    const upY = lerp(cY, yb - 0.07, 0.5), up = lerp(1, tumble, 0.42);
    // fender-top peak over the front fender only (fades out at the cowl)
    const peak = 1 + (sh.peak ?? 0) * (1 - smooth(m.gh.sA0 - 0.3, m.gh.sA0 + 0.2, s));
    return hw * pw([[y0, arch ? 0.992 : tuck], [y0 + 0.05, w05], [lowY, low], [cY, 1], [upY, up], [yb - 0.07, tumble], [yb - 0.025, peak], [yb, 0.968]], y);
  };

  const section = (s: number): Section => {
    const hw = halfW(s), y0 = bottomY(s), yt = topY(s), yb = Math.min(beltAt(s), yt);
    const creaseY = lerp(m.sillY, m.beltY, m.crease);
    // Every station gets the same rows in the same order (the order they have mid-body), clamped
    // into [y0, yb] and kept monotonic. Dropping rows at the arches (as before) shifted row
    // indices between neighbouring stations, twisting the quads into visible shading bands.
    const cY = Math.max(y0 + 0.06, creaseY);
    const raw = [y0, y0 + 0.05, lerp(y0 + 0.05, cY, 0.5), creaseY, lerp(cY, yb - 0.07, 0.5), ...(lod === 0 ? extraY : []), yb - 0.07, yb - 0.025, yb];
    let prev = -Infinity;
    const ys = SIDE_ORDER(raw.length).map((k) => {
      let y = clamp(raw[k], y0, yb);
      if (y < prev + 0.0015) y = prev + 0.0015;
      return (prev = y);
    });
    const side: V3[] = ys.map((y) => [sideX(s, y), y, Z(s + rake(s, y))]);
    const crown = m.crown * (yt > yb + 0.02 ? 1 : 0);
    const topPts: [number, number][] = lod === 0
      ? [[0.968, yb], [0.95, yt], [0.74, yt + crown * 0.5], [0.4, yt + crown * 0.88], [0, yt + crown]]
      : [[0.975, yb], [0.955, yt], [0.5, yt + crown * 0.8], [0, yt + crown]];
    const half = topPts.map(([f, y]) => [hw * f, y, Z(s + rake(s, y))] as V3);
    const top = [...half, ...half.slice(0, -1).reverse().map((p) => [-p[0], p[1], p[2]] as V3)];
    return { s, side, top, under: [[-side[0][0], side[0][1], side[0][2]], side[0]] };
  };

  // ---------------------------------------------------------------- door seams (shared by stations, trim, door split)
  const doorSeams: number[] = [];
  if (m.trim.doors) {
    const g2 = m.gh;
    const beltS = (u: number) => lerp(g2.sA0, g2.sC0, u);
    const bandCentres = g2.bands.map((b2, i) => ({ ...b2, c: (b2.u + (g2.bands[i + 1]?.u ?? 1)) / 2 }));
    const bPillar = bandCentres.find((b2, i) => i > 0 && b2.k === 'pillar' && b2.c < 0.8);
    const lastGlass = [...g2.bands].reverse().find((b2) => b2.k === 'glass' || b2.k === 'opera');
    doorSeams.push(g2.sA0 + 0.03);
    if (bPillar) doorSeams.push(beltS(bPillar.c));
    doorSeams.push(bPillar ? Math.min(rearS - archR - 0.05, beltS(g2.bands[g2.bands.length - 1].u) + 0.05) : beltS(lastGlass && lastGlass.k === 'opera' ? lastGlass.u : 0.6));
  }

  // ---------------------------------------------------------------- stations
  const st = new Set<number>();
  if (lod === 0) for (const sd of doorSeams) { st.add(sd); st.add(sd - 0.004); st.add(sd + 0.004); } // doors cut cleanly along their seams
  const n = Math.max(lod === 0 ? 14 : 7, Math.round(L / (lod === 0 ? 0.42 : 0.85)));
  for (let i = 0; i <= n; i++) st.add(L * i / n);
  for (const a of axles) {
    const k = lod === 0 ? 8 : 1;
    for (let i = -k; i <= k; i++) st.add(a.s + (archR * i) / k);
    st.add(a.s - archR - 0.01); st.add(a.s + archR + 0.01);
  }
  for (const [s] of m.top) st.add(s);
  if (m.hood) { st.add(m.hood[0]); st.add(m.hood[1]); }
  st.add(m.gh.sA0); st.add(m.gh.sC0);
  if (lod === 0) for (const s of [0.03, 0.08, 0.16, L - 0.03, L - 0.08, L - 0.16]) st.add(s);
  if (m.wood) { st.add(m.wood.s0); st.add(m.wood.s1); }
  const stations = [...st].filter((s) => s >= 0 && s <= L).map((s) => Math.round(s * 1000) / 1000).sort((a, b) => a - b)
    .filter((s, i, arr) => i === 0 || i === arr.length - 1 || s - arr[i - 1] > (lod === 0 ? 0.004 : 0.12));
  const secs = stations.map(section);

  // Side rows must have equal vertex counts along a grid: resample each section's side to the
  // maximum count by duplicating the top vertex (degenerate quads, invisible).
  const sideN = Math.max(...secs.map((c) => c.side.length));
  for (const c of secs) while (c.side.length < sideN) c.side.splice(c.side.length - 1, 0, c.side[c.side.length - 1]);

  const inside: V3 = [0, (m.sillY + m.beltY) / 2, Z(L / 2)];
  const sCell = (i: number) => (stations[i] + stations[i + 1]) / 2;
  const lowerSlot = (s: number, y: number): Slot => {
    if (m.wood && s > m.wood.s0 && s < m.wood.s1 && y > m.wood.y0 && y < m.wood.y1) return 'wood';
    if (m.stripe && y > m.stripe[0] && y < m.stripe[1]) return 'paint2';
    if (m.twoTone?.(s, y)) return 'paint2';
    return 'paint';
  };
  // Right and left sides
  for (const sideSign of [1, -1]) {
    const rows = secs.map((c) => c.side.map((p) => [p[0] * sideSign, p[1], p[2]] as V3));
    b.grid(rows, (i, j) => {
      const yc = (rows[i][j][1] + rows[i][j + 1][1]) / 2;
      return lowerSlot(sCell(i), yc);
    }, { inside });
  }
  // Top (hood cells go to the hood builder)
  const topRows = secs.map((c) => c.top);
  const nTop = topRows[0].length;
  const isHood = (i: number, j: number) => lod === 0 && !!m.hood && sCell(i) > m.hood[0] && sCell(i) < m.hood[1] && j >= 1 && j < nTop - 2;
  // passenger cars with a modelled cabin: no painted deck across the cabin at the belt (it hid the
  // seats and dash from outside the glass); the cabin shell and floor close it instead
  const openCabin = (i: number, j: number) => lod === 0 && PASSENGER.has(m.cls) && sCell(i) > m.gh.sA0 + 0.01 && sCell(i) < m.gh.sC0 - 0.01 && j >= 1 && j < nTop - 2;
  b.grid(topRows, (i, j) => (isHood(i, j) || openCabin(i, j) ? null : m.twoTone?.(sCell(i), 9) ? 'paint2' : 'paint'), { inside });
  if (m.hood) hoodB.grid(topRows, (i, j) => (isHood(i, j) ? (m.twoTone?.(sCell(i), 9) ? 'paint2' : 'paint') : null), { inside });
  // Underside
  b.grid(secs.map((c) => c.under), 'under', { facing: [0, -1, 0] });
  // Shoulder join (side top vertex to top first vertex are the same point: hard crease, nothing to fill).
  // End caps
  for (const [c, f] of [[secs[0], -1], [secs[secs.length - 1], 1]] as const) {
    const ring: V3[] = [...c.side, ...c.top.slice(1, -1), ...c.side.slice().reverse().map((p) => [-p[0], p[1], p[2]] as V3)];
    b.cap(ring, f < 0 ? 'paint' : 'paint', [0, 0, f]);
  }
  // Wheelhouse liners (dark boxes inside the arches so you never see through the body)
  if (lod === 0) for (const a of axles) {
    const liner: Slot = 'under';
    const wx = m.W / 2 - 0.05;
    b.box(liner, wx - 0.17, R + archR * 0.45, Z(a.s), 0.3, archR * 0.9, archR * 2, 0);
    b.box(liner, -(wx - 0.17), R + archR * 0.45, Z(a.s), 0.3, archR * 0.9, archR * 2, 0);
  }

  // ---------------------------------------------------------------- greenhouse
  greenhouse(b, m, o, Z, halfW, lod);
  if (lod === 0 && PASSENGER.has(m.cls)) cabin(b, m, Z, halfW, !!o.hero);
  if (lod === 0 && PASSENGER.has(m.cls) && m.hood) engineBay(b, m, Z, halfW, topY);

  // ---------------------------------------------------------------- cargo modules
  for (const c of m.cargo ?? []) cargo(b, c, Z, lod);
  if (m.frameRails) {
    const f = m.frameRails;
    const len = f.s1 - f.s0;
    for (const sx of [-1, 1]) b.box('under', sx * 0.45, f.y, Z((f.s0 + f.s1) / 2), 0.1, 0.22, len);
    // fuel tank + battery box
    b.box('trim', 0.82, f.y - 0.05, Z(f.s0 + 0.9), 0.5, 0.45, 1.1);
    b.box('under', -0.82, f.y - 0.05, Z(f.s0 + 0.6), 0.45, 0.4, 0.6);
  }

  // ---------------------------------------------------------------- front: grille, lamps, bumper
  const faceZ = (s: number, y: number) => Z(s + rake(s, y));
  const hwF = halfW(0.0);
  const g = m.grille;
  const gz = faceZ(0, (g.y0 + g.y1) / 2) - 0.012 - (g.prow ?? 0);
  {
    const gw = g.hw, gh = g.y1 - g.y0, gy = (g.y0 + g.y1) / 2;
    b.box('grille', 0, gy, gz + 0.03, gw * 2, gh, 0.05);
    const fr = 0.028;
    const frameSlot: Slot = g.kind === 'truck' || g.kind === 'bus' ? 'trim' : 'chrome';
    b.box(frameSlot, 0, g.y1 - fr / 2, gz, gw * 2 + fr, fr, 0.04);
    b.box(frameSlot, 0, g.y0 + fr / 2, gz, gw * 2 + fr, fr, 0.04);
    b.box(frameSlot, gw, gy, gz, fr, gh, 0.04);
    b.box(frameSlot, -gw, gy, gz, fr, gh, 0.04);
    const bars = lod === 0 ? g.bars : Math.min(2, g.bars);
    const barSlot: Slot = g.kind === 'bus' ? 'trim' : 'chrome';
    if (g.kind === 'vert' || g.kind === 'egg') for (let i = 1; i < bars; i++) b.box(barSlot, -gw + (2 * gw * i) / bars, gy, gz + 0.008, 0.012, gh - fr, 0.03);
    if (g.kind === 'horiz' || g.kind === 'egg' || g.kind === 'bus' || g.kind === 'truck') {
      const hb = g.kind === 'egg' ? 2 : bars;
      for (let i = 1; i < hb; i++) b.box(g.kind === 'truck' ? 'chrome' : barSlot, 0, g.y0 + (gh * i) / hb, gz + 0.006, gw * 2, g.kind === 'truck' ? 0.03 : 0.014, 0.03);
    }
    if (g.prow) { // stand-up grille: side blades back to the face
      for (const sx of [-1, 1]) b.box('chrome', sx * gw, gy, gz + (g.prow ?? 0) / 2 + 0.01, 0.02, gh, (g.prow ?? 0) + 0.02);
      b.box('chrome', 0, g.y1 + 0.01, gz + (g.prow ?? 0) / 2, gw * 2 + 0.03, 0.02, (g.prow ?? 0) + 0.03);
    }
  }
  const head: V3[] = [];
  {
    const h = m.headlamps;
    const centers: number[] = [];
    const xo = hwF - h.xOut;
    if (h.kind === 'quadRound' || h.kind === 'quadRect') centers.push(xo, xo - h.size * 1.22);
    else centers.push(xo);
    const hz = faceZ(0, h.y) - 0.01;
    // housing panel
    const hsSlot = h.housing ?? 'grille';
    const span = Math.abs(centers[0] - centers[centers.length - 1]);
    for (const sx of [-1, 1]) {
      const cx = sx * (centers[0] + centers[centers.length - 1]) / 2;
      b.box(hsSlot, cx, h.y, hz + 0.02, span + h.size * 1.3, h.size * 1.3, 0.05);
      for (const c of centers) {
        const x = sx * c;
        head.push([x, h.y, hz - 0.03]);
        if (lod === 1) { b.box('headlamp', x, h.y, hz - 0.02, h.size, h.size, 0.03); continue; }
        if (h.kind === 'quadRound' || h.kind === 'dualRound') {
          const r = h.size / 2, segs = lod === 0 ? 12 : 6;
          const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
          const bez = new THREE.CylinderGeometry(r * 1.18, r * 1.22, 0.035, segs, 1, true);
          b.add('chrome', bez, new THREE.Matrix4().makeTranslation(x, h.y, hz - 0.012).multiply(rot));
          b.add('chrome', new THREE.SphereGeometry(r * 0.98, segs, 2, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.Matrix4().makeTranslation(x, h.y, hz + 0.02).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 0.45, 1))); // reflector bowl
          const lens = new THREE.SphereGeometry(r, segs, lod === 0 ? 3 : 1, 0, Math.PI * 2, 0, Math.PI / 2);
          b.add('headlamp', lens, new THREE.Matrix4().makeTranslation(x, h.y, hz - 0.005).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 0.35, 1)));
        } else {
          const w = h.size * 1.15, hh = h.size * 0.85;
          b.box('chrome', x, h.y, hz - 0.01, w + 0.03, hh + 0.03, 0.03);
          b.box('headlamp', x, h.y, hz - 0.03, w, hh, 0.02);
        }
      }
      // parking / turn lamps (amber) below the headlamps, in the grille line
      b.box('indicator', sx * (centers[0] + 0.02), m.bumper.y + m.bumper.h + 0.05, faceZ(0, m.bumper.y + 0.1) - 0.015, 0.16, 0.05, 0.02);
    }
  }
  const bodies = (m.cargo ?? []).filter((c) => c.kind === 'box' || c.kind === 'packer');
  const lastCargo = bodies.length ? bodies[bodies.length - 1] : null;
  // LOD0 bumpers are their own meshes, so they can sag and come off; LOD1 keeps them in the body
  const bumpFB = lod === 0 ? new GeoBuilder() : b, bumpRB = lod === 0 ? new GeoBuilder() : b;
  if (o.hero) { bumpFB.sub = bumpRB.sub = 1; bumpFB.tubeSegs = bumpRB.tubeSegs = 6; }
  bumper(bumpFB, m.bumper, 'front', m, Z, halfW, lod);
  bumper(bumpRB, m.rearBumper ?? m.bumper, 'rear', m, Z, halfW, lod, lastCargo ? { s: lastCargo.s1, hw: lastCargo.hw } : undefined);

  // ---------------------------------------------------------------- rear lamps
  const tail: V3[] = [];
  {
    const t = m.taillamps;
    const tz = (y: number) => (lastCargo ? Z(lastCargo.s1) : Z(L + rake(L, y))) + 0.012;
    const hwR = (lastCargo ? lastCargo.hw : halfW(L)) - 0.03;
    const ty = (t.y0 + t.y1) / 2, th = t.y1 - t.y0;
    const addLamp = (x: number, w: number) => {
      if (lod === 0) b.box('chrome', x, ty, tz(ty) - 0.004, w + 0.03, th + 0.03, 0.02);
      b.box('taillamp', x, ty, tz(ty) + 0.004, w, th, 0.02);
      tail.push([x, ty, tz(ty) + 0.02]);
    };
    if (t.kind === 'band') {
      const w = hwR - 0.12;
      for (const sx of [-1, 1]) addLamp(sx * (0.12 + w / 2), w);
      b.box('reverse', 0, ty, tz(ty) + 0.004, 0.2, th * 0.6, 0.02);
    } else if (t.kind === 'corner' || t.kind === 'block') {
      const w = t.kind === 'corner' ? 0.32 : 0.42;
      for (const sx of [-1, 1]) { addLamp(sx * (hwR - w / 2), w); b.box('reverse', sx * (hwR - w - 0.1), ty, tz(ty) + 0.004, 0.1, th * 0.7, 0.02); }
    } else if (t.kind === 'vertical') {
      for (const sx of [-1, 1]) addLamp(sx * (hwR - 0.06), 0.1);
    } else if (t.kind === 'truck') {
      for (const sx of [-1, 1]) for (const k of [0, 1]) {
        const x = sx * (hwR - 0.12 - k * 0.2);
        b.box(k ? 'indicator' : 'taillamp', x, ty, tz(ty) + 0.004, 0.14, Math.min(0.14, th), 0.03);
        if (!k) tail.push([x, ty, tz(ty) + 0.02]);
      }
    }
  }

  // ---------------------------------------------------------------- trim
  if (lod === 0) {
    const sideRun = (y: number, slot: Slot, prof: [number, number][]) => {
      for (const sx of [1, -1]) {
        let run: V3[] = [];
        const flush = () => { if (run.length > 1) b.sweep(slot, sx > 0 ? run : run.slice().reverse(), prof); run = []; };
        let lastS = -9;
        for (const s of stations) {
          if (s < 0.12 || s > L - 0.12 || bottomY(s) > y - 0.03 || beltAt(s) < y + 0.02) { flush(); lastS = -9; continue; }
          if (s - lastS < 0.4 && bottomY(s + 0.05) <= y - 0.03 && s < L - 0.5) continue;
          run.push([sx * (sideX(s, y) - 0.002), y, Z(s)]); lastS = s;
        }
        flush();
      }
    };
    if (m.trim.side) sideRun(m.trim.side.y, m.trim.side.kind === 'chrome' ? 'chrome' : 'rubber', [[0, -0.016], [0.012, -0.012], [0.014, 0.012], [0, 0.016]]);
    if (m.trim.rocker) sideRun(m.sillY + 0.045, 'chrome', [[0, -0.03], [0.008, -0.025], [0.008, 0.025], [0, 0.03]]);
    // wheel-lip mouldings follow the arch edge
    if (m.trim.wheelLip) for (const a of axles) for (const sx of [1, -1]) {
      const pts: V3[] = [];
      for (let k = 0; k <= 7; k++) {
        const s0 = a.s - archR + (2 * archR * k) / 7;
        const y = bottomY(s0);
        if (y <= m.sillY + 0.005 && k > 0 && k < 7) continue;
        pts.push([sx * (sideX(s0, y + 0.01) + 0.004), y + 0.008, Z(s0)]);
      }
      if (pts.length > 2) b.tubePath('chrome', pts, 0.011, 3);
    }
    // door shut lines + handles: front edge at the A-pillar foot, a seam at the B-pillar, the rear edge ahead of the rear arch
    if (m.trim.doors) {
      const seams = doorSeams;
      for (const sx of [1, -1]) {
        for (const sSeam of seams) {
          const pts: V3[] = [];
          const nk = o.hero ? 10 : 2;
          for (let k = 0; k <= nk; k++) { const y = lerp(Math.max(bottomY(sSeam), m.sillY) + 0.04, m.beltY - 0.012, k / nk); pts.push([sx * (sideX(sSeam, y) + 0.0015), y, Z(sSeam)]); }
          b.tubePath('grille', pts, o.hero ? 0.0028 : 0.0035, 3);
        }
        // handles just ahead of each door's rear edge, below the belt
        for (let i = 1; i < seams.length; i++) {
          const hs = seams[i] - 0.16, hx = sx * (sideX(hs, m.beltY - 0.07) + 0.01);
          b.box('chrome', hx, m.beltY - 0.07, Z(hs), 0.02, 0.028, 0.17);
          if (o.hero) { // recessed pull cup and the lock barrel
            b.box('grille', hx - sx * 0.006, m.beltY - 0.084, Z(hs), 0.012, 0.012, 0.13);
            b.add('chrome', new THREE.CylinderGeometry(0.009, 0.009, 0.012, 12).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(hx + sx * 0.004, m.beltY - 0.07, Z(hs) + 0.11));
          }
        }
      }
    }
    if (o.hero) heroDetails(b, m, Z, halfW, topY, stations, rearS, archR);
  }

  // ---------------------------------------------------------------- extras
  const decals: DecalAnchor[] = [];
  let beacon: THREE.BufferGeometry | null = null;
  const bb = new GeoBuilder(); // emergency lights (animated separately: taillamp slot -> beacon material)
  const gh = m.gh;
  const roofTop = gh.roofY + gh.crown;
  const roofMidZ = Z((gh.sA1 + gh.sC1) / 2);
  for (const e of m.extras) {
    if (e === 'taxiLight') {
      b.box('trim', 0, roofTop + 0.02, roofMidZ - 0.1, 0.62, 0.04, 0.24);
      b.box('white', 0, roofTop + 0.13, roofMidZ - 0.1, 0.56, 0.18, 0.2);
      for (const f of [-1, 1]) decals.push({ kind: 'taxiSign', pos: [0, roofTop + 0.13, roofMidZ - 0.1 + f * 0.102], normal: [0, 0, f], w: 0.54, h: 0.16 });
    } else if (e === 'bubble') {
      const segs = lod === 0 ? 14 : 8;
      bb.add('chrome', new THREE.CylinderGeometry(0.12, 0.13, 0.05, segs), new THREE.Matrix4().makeTranslation(0, roofTop + 0.025, roofMidZ - 0.15));
      bb.add('taillamp', new THREE.SphereGeometry(0.11, segs, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(0, roofTop + 0.05, roofMidZ - 0.15).multiply(new THREE.Matrix4().makeScale(1, 1.5, 1)));
    } else if (e === 'lightBar') {
      // period twin-beacon bar on the cab roof, plus a siren can in the middle
      const segs = lod === 0 ? 12 : 6, z = Z(gh.sA1 + 0.25);
      bb.add('chrome', new THREE.BoxGeometry(gh.roofHalfW * 1.6, 0.06, 0.22), new THREE.Matrix4().makeTranslation(0, roofTop + 0.03, z));
      for (const sx of [-1, 1]) bb.add('taillamp', new THREE.SphereGeometry(0.1, segs, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * gh.roofHalfW * 0.62, roofTop + 0.06, z).multiply(new THREE.Matrix4().makeScale(1, 1.6, 1)));
      bb.add('chrome', new THREE.CylinderGeometry(0.09, 0.09, 0.16, segs), new THREE.Matrix4().makeTranslation(0, roofTop + 0.11, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    } else if (e === 'boxBeacons') {
      const c = m.cargo?.find((k) => k.kind === 'box');
      if (c) for (const sx of [-1, 1]) for (const ss of [c.s0 + 0.12, c.s1 - 0.12]) bb.add('taillamp', new THREE.SphereGeometry(0.08, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * (c.hw - 0.12), c.y1, Z(ss)).multiply(new THREE.Matrix4().makeScale(1, 1.4, 1)));
    } else if (e === 'coneSign') {
      // roof sign: a giant cone with a swirl of soft-serve (original shape, no character or face)
      const c = m.cargo?.find((k) => k.kind === 'box');
      const y = (c ? c.y1 : roofTop) + 0.05, z = Z(c ? c.s0 + 0.6 : gh.sA1 + 0.6);
      b.add('paint2', new THREE.ConeGeometry(0.22, 0.7, lod === 0 ? 12 : 6), new THREE.Matrix4().makeTranslation(0, y + 0.35, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI)));
      for (let k = 0; k < (lod === 0 ? 3 : 1); k++) b.add('white', new THREE.SphereGeometry(0.24 - k * 0.06, lod === 0 ? 12 : 6, 6), new THREE.Matrix4().makeTranslation(0, y + 0.75 + k * 0.16, z));
    } else if (e === 'serviceWindow') {
      const c = m.cargo?.find((k) => k.kind === 'box');
      const s0 = c ? c.s0 + 0.5 : 2, len = 1.3, x = (c ? c.hw : m.W / 2) + 0.006, yb = (c ? c.y0 : m.beltY) + 0.75;
      b.box('interior', x, yb + 0.4, Z(s0 + len / 2), 0.012, 0.8, len);
      b.box('chrome', x + 0.03, yb - 0.02, Z(s0 + len / 2), 0.1, 0.04, len + 0.1); // counter
      b.box('paint2', x + 0.25, yb + 0.92, Z(s0 + len / 2), 0.5, 0.03, len + 0.2, 0, 0, -0.25); // awning
    } else if (e === 'bell' && lod === 0) {
      b.add('chrome', new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.Matrix4().makeTranslation(-0.5, m.bumper.y + m.bumper.h + 0.12, Z(0) - m.bumper.depth * 0.5).multiply(new THREE.Matrix4().makeRotationX(Math.PI)));
    } else if (e === 'roofRack' && lod === 0) {
      for (const sx of [-1, 1]) b.sweep('chrome', [[sx * (gh.roofHalfW - 0.08), roofTop - 0.005, Z(gh.sA1 + 0.35)], [sx * (gh.roofHalfW - 0.08), roofTop + 0.04, Z(gh.sA1 + 0.45)], [sx * (gh.roofHalfW - 0.08), roofTop + 0.04, Z(gh.sC1 - 0.1)], [sx * (gh.roofHalfW - 0.08), roofTop - 0.02, Z(gh.sC1)]], [[-0.012, -0.012], [0.012, -0.012], [0.012, 0.012], [-0.012, 0.012]]);
      for (let k = 0; k < 3; k++) b.box('chrome', 0, roofTop + 0.045, Z(lerp(gh.sA1 + 0.6, gh.sC1 - 0.25, k / 2)), gh.roofHalfW * 2 - 0.16, 0.015, 0.03);
    } else if (e === 'mirrorsBoth' && lod === 0 && m.cls === 'bus') {
      // transit-coach mirrors on long chrome arms from the front corners, out and forward
      for (const sx of [-1, 1]) {
        const x0 = sx * (halfW(0.35) - 0.02), yTop = gh.roofY - 0.28, z0 = Z(0.35);
        const hx = sx * (halfW(0.35) + 0.32), hy = m.beltY + 0.95, hz = Z(-0.32);
        b.tubePath('chrome', [[x0, yTop, z0], [x0 + sx * 0.12, yTop + 0.04, z0 - 0.25], [hx, yTop - 0.02, hz + 0.08], [hx, hy + 0.2, hz]], 0.016, 6);
        b.box('trim', hx, hy, hz, 0.06, 0.38, 0.22, sx * 0.25);
        b.box('glass', hx - sx * 0.032, hy, hz, 0.005, 0.34, 0.18, sx * 0.25);
      }
    } else if ((e === 'mirrorL' || e === 'mirrorsBoth') && lod === 0) {
      const big = !['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi'].includes(m.cls);
      for (const sx of e === 'mirrorsBoth' ? [-1, 1] : [-1]) {
        const x = sx * (halfW(gh.sA0) - gh.beltInset + (big ? 0.18 : 0.06));
        const y = m.beltY + (big ? 0.35 : 0.09), z = Z(gh.sA0 + 0.12);
        if (big) { b.box('chrome', x, y, z, 0.05, 0.36, 0.03); b.box('trim', sx * (halfW(gh.sA0) + 0.06), y, z, 0.18, 0.02, 0.02); }
        else { b.box('chrome', x, y, z, 0.1, 0.07, 0.04); b.box('chrome', x - sx * 0.04, y - 0.05, z, 0.02, 0.06, 0.02); }
      }
    } else if (e === 'spotlight' && lod === 0) {
      const x = -(halfW(gh.sA0) - gh.beltInset + 0.05), y = m.beltY + 0.16, z = Z(gh.sA0 + 0.05);
      b.add('chrome', new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10), new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
      b.add('headlamp', new THREE.CircleGeometry(0.06, 10), new THREE.Matrix4().makeTranslation(x, y, z - 0.061).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
    } else if (e === 'antenna' && lod === 0) {
      b.add('chrome', new THREE.CylinderGeometry(0.003, 0.005, 0.8, 4), new THREE.Matrix4().makeTranslation(halfW(0.6) - 0.15, topY(0.6) + 0.4, Z(0.6)));
    } else if (e === 'destSign') {
      const [v0, v1] = gh.signBand ?? [0.82, 0.97];
      const y0 = lerp(m.beltY, gh.roofY, v0), y1 = lerp(m.beltY, gh.roofY, v1);
      const s = lerp(gh.sA0, gh.sA1, (v0 + v1) / 2);
      decals.push({ kind: 'destSign', pos: [0, (y0 + y1) / 2, Z(s - gh.bow) - 0.02], normal: [0, 0, -1], w: gh.roofHalfW * 1.5, h: (y1 - y0) * 0.9 });
      // rear engine louvres
      for (let k = 0; k < 6; k++) b.box('trim', 0, 0.62 + k * 0.08, Z(L) + 0.012, m.W * 0.62, 0.03, 0.02);
    } else if (e === 'busDoor') {
      // two-leaf glazed doors (front and centre): aluminium frames, upper and lower glass with a
      // mid-rail, rubber centre seal, a dark step well; the leaves reach the side-window line
      const yTop = m.beltY + (m.gh.roofY - m.beltY) * (m.gh.winV[1] - 0.02), yBot = m.sillY - 0.08;
      for (const [s0, s1] of [[0.22, 1.38], [6.3, 7.4]] as const) {
        const x = halfW((s0 + s1) / 2) + 0.012;
        b.box('under', x - 0.01, (yBot + yTop) / 2, Z((s0 + s1) / 2), 0.012, yTop - yBot + 0.04, s1 - s0 + 0.04); // opening recess
        const leaf = (s1 - s0) / 2;
        for (let k = 0; k < 2; k++) {
          const a0 = s0 + k * leaf, a1 = a0 + leaf, zc = Z((a0 + a1) / 2), mid = lerp(yBot, yTop, 0.42);
          const fr = (y: number, h: number, z: number, d: number) => b.box('chrome', x + 0.006, y, z, 0.03, h, d);
          fr(yTop - 0.03, 0.06, zc, leaf); fr(yBot + 0.05, 0.1, zc, leaf); fr(mid, 0.05, zc, leaf);
          fr((yBot + yTop) / 2, yTop - yBot, Z(a0) + 0.025, 0.05); fr((yBot + yTop) / 2, yTop - yBot, Z(a1) - 0.025, 0.05);
          b.box('glass', x + 0.002, (mid + yTop) / 2, zc, 0.01, yTop - mid - 0.08, leaf - 0.08);
          b.box('glass', x + 0.002, (yBot + mid) / 2 + 0.04, zc, 0.01, mid - yBot - 0.16, leaf - 0.08);
        }
        b.box('rubber', x + 0.02, (yBot + yTop) / 2, Z((s0 + s1) / 2), 0.03, yTop - yBot - 0.04, 0.03); // centre seal
        b.box('under', x - 0.25, yBot + 0.02, Z((s0 + s1) / 2), 0.5, 0.04, s1 - s0); // step well
      }
    } else if (e === 'stepDoor') {
      for (const sx of [-1, 1]) b.box('interior', sx * (halfW(0.9) + 0.003), (m.sillY + m.beltY) / 2 + 0.05, Z(0.95), 0.01, m.beltY - m.sillY - 0.1, 0.62);
    }
  }
  if (bb.pos.length) beacon = bb.build();
  // windscreen wipers, parked along the base of the glass (two arms; split screens get one each)
  if (lod === 0 && gh.sA0 > 0.01) {
    const big = m.cls === 'bus' || !PASSENGER.has(m.cls);
    const baseHw = halfW(gh.sA0) - gh.beltInset;
    const len = big ? baseHw * 0.78 : baseHw * 0.62;
    const yb = m.beltY + (big ? 0.06 : 0.025), zb = Z(gh.sA0) + (big ? 0.04 : 0.03);
    for (const [px, dir] of (big ? [[-baseHw * 0.08, -1], [baseHw * 0.9, -1]] : [[-baseHw * 0.55, 1], [baseHw * 0.05, 1]]) as [number, number][]) {
      b.box('trim', px + (dir * len) / 2, yb, zb, len, 0.012, 0.012);         // arm + blade
      b.box('rubber', px + (dir * len) / 2, yb + 0.006, zb + 0.008, len * 0.92, 0.008, 0.008);
      b.add('trim', new THREE.CylinderGeometry(0.014, 0.016, 0.03, 8), new THREE.Matrix4().makeTranslation(px, yb - 0.01, zb)); // pivot
    }
  }
  // coach front: a chrome band across the headlamp line, and a chrome nose strip
  if (m.cls === 'bus' && lod === 0) {
    const fz = Z(0) - 0.004, hw2 = halfW(0.02);
    b.box('chrome', 0, m.headlamps.y + m.headlamps.size * 0.75, fz, hw2 * 1.9, 0.03, 0.012);
    b.box('chrome', 0, m.beltY - 0.04, fz - 0.002, hw2 * 1.9, 0.025, 0.012);
  }
  const sideOf = (c: { hw: number }) => c.hw + 0.012;
  const box0 = m.cargo?.find((k) => k.kind === 'box');
  if (m.cls === 'ambulance' && box0) {
    for (const sx of [1, -1]) decals.push({ kind: 'ambulance', pos: [sx * sideOf(box0), box0.y0 + 0.95, Z((box0.s0 + box0.s1) / 2)], normal: [sx, 0, 0], w: (box0.s1 - box0.s0) * 0.7, h: 0.34 });
    decals.push({ kind: 'ambulance', pos: [0, box0.y1 - 0.45, Z(box0.s1) + 0.015], normal: [0, 0, 1], w: box0.hw * 1.6, h: 0.3 });
  }
  if (m.cls === 'fire' || m.cls === 'ladder') for (const sx of [1, -1]) decals.push({ kind: 'fireDept', pos: [sx * (sideX(gh.sA0 + 0.5, m.beltY - 0.35) + 0.01), m.beltY - 0.35, Z(gh.sA0 + 0.5)], normal: [sx, 0, 0], w: 0.9, h: 0.45 });
  if (m.cls === 'mail') for (const sx of [1, -1]) decals.push({ kind: 'mail', pos: [sx * (halfW(m.L * 0.6) + 0.01), m.beltY + 0.45, Z(m.L * 0.6)], normal: [sx, 0, 0], w: 1.4, h: 0.4 });
  if (m.cls === 'icecream' && box0) for (const sx of [1, -1]) decals.push({ kind: 'icecream', pos: [sx * sideOf(box0), box0.y1 - 0.42, Z((box0.s0 + box0.s1) / 2)], normal: [sx, 0, 0], w: (box0.s1 - box0.s0) * 0.85, h: 0.42 });
  if (m.cls === 'taxi') {
    const sFare = lerp(gh.sA0, gh.sC0, 0.7); // middle of the rear door
    for (const sx of [1, -1]) decals.push({ kind: 'fare', pos: [sx * (sideX(sFare, 0.62) + 0.008), 0.62, Z(sFare)], normal: [sx, 0, 0], w: 0.42, h: 0.21 });
    for (const sx of [1, -1]) decals.push({ kind: 'unit', pos: [sx * (sideX(1.4, 0.68) + 0.008), 0.68, Z(1.4)], normal: [sx, 0, 0], w: 0.34, h: 0.11 });
  }
  if (m.cls === 'police') {
    for (const sx of [1, -1]) decals.push({ kind: 'police', pos: [sx * (sideX(2.6, 0.6) + 0.008), 0.6, Z(2.6)], normal: [sx, 0, 0], w: 0.82, h: 0.2 });
    for (const sx of [1, -1]) decals.push({ kind: 'unit', pos: [sx * (sideX(4.6, 0.66) + 0.008), 0.66, Z(4.6)], normal: [sx, 0, 0], w: 0.34, h: 0.12 });
  }
  if (m.cls === 'bus') {
    for (const sx of [1, -1]) decals.push({ kind: 'operator', pos: [sx * (halfW(5) + 0.008), 0.95, Z(5)], normal: [sx, 0, 0], w: 2.4, h: 0.26 });
    decals.push({ kind: 'fleet', pos: [0, 0.95, Z(0) - 0.02], normal: [0, 0, -1], w: 0.5, h: 0.16 });
  }
  if (m.cls === 'garbage' || m.cls === 'boxtruck') {
    const c = m.cargo?.[0];
    if (c) for (const sx of [1, -1]) decals.push({ kind: m.cls === 'garbage' ? 'operator' : 'fleet', pos: [sx * (c.hw + 0.01), (c.y0 + c.y1) / 2, Z((c.s0 + c.s1) / 2 - (m.cls === 'garbage' ? 0.6 : 0))], normal: [sx, 0, 0], w: (c.s1 - c.s0) * 0.6, h: 0.5 });
  }
  if (m.cls === 'stepvan') for (const sx of [1, -1]) decals.push({ kind: 'fleet', pos: [sx * (halfW(3.6) + 0.006), 1.75, Z(3.6)], normal: [sx, 0, 0], w: 2.6, h: 0.55 });

  // ---------------------------------------------------------------- wheels
  const wheels: WheelMount[] = [];
  const trR = m.trackR ?? m.track;
  for (const a of [m.sF, rearS]) for (const side of [1, -1] as const) {
    const front = a === m.sF;
    const tr = front ? m.track : trR;
    wheels.push({ x: (side * tr) / 2, y: R, z: Z(a), front, side, dual: !front && !!m.dualRear, r: R });
  }
  const wheelR = wheel(m, o, 1);
  const wheelL = wheel(m, o, -1);

  // ---------------------------------------------------------------- colliders
  const fDepth = m.bumper.depth, rDepth = (m.rearBumper ?? m.bumper).depth;
  const maxTop = Math.max(...m.top.map((t) => t[1]));
  const lowY0 = m.sillY - 0.08;
  const colliders: BoxCollider[] = [{
    cx: 0, cy: (lowY0 + maxTop) / 2, cz: Z((L + rDepth - fDepth) / 2), hx: m.W / 2, hy: (maxTop - lowY0) / 2, hz: (L + fDepth + rDepth) / 2,
  }, {
    cx: 0, cy: (m.beltY + gh.roofY) / 2 + 0.02, cz: Z((gh.sA0 + gh.sA1 + gh.sC1 + gh.sC0) / 4), hx: (gh.roofHalfW + halfW(gh.sA0) - gh.beltInset) / 2, hy: (gh.roofY - m.beltY) / 2, hz: ((gh.sC0 + gh.sC1) / 2 - (gh.sA0 + gh.sA1) / 2) / 2,
  }];
  for (const c of m.cargo ?? []) if (!c.dressing) colliders.push({ cx: 0, cy: (c.y0 + c.y1) / 2, cz: Z((c.s0 + c.s1) / 2), hx: c.hw, hy: (c.y1 - c.y0) / 2, hz: (c.s1 - c.s0) / 2 });

  let body = b.build();
  // ---------------------------------------------------------------- doors: cut out of the body (LOD0 passenger cars)
  const doors: DoorPart[] = [];
  if (lod === 0 && PASSENGER.has(m.cls) && doorSeams.length >= 2) {
    const gh2 = m.gh;
    const hwCab = halfW((gh2.sA0 + gh2.sC0) / 2) - gh2.beltInset - 0.06;
    const regions: { side: 1 | -1; z0: number; z1: number; sFront: number }[] = [];
    for (const side of [1, -1] as const) for (let i = 0; i < doorSeams.length - 1; i++) regions.push({ side, z0: Z(doorSeams[i]), z1: Z(doorSeams[i + 1]), sFront: doorSeams[i] });
    const glassSlots = new Set([SLOTS.indexOf('glassL'), SLOTS.indexOf('glassR')]);
    const split = extractRegions(body, regions.map((r) => (cx: number, cy: number, cz: number, slot: number) => {
      if (cx * r.side < hwCab + 0.012) return false;
      if (cz < Math.min(r.z0, r.z1) + 0.002 || cz > Math.max(r.z0, r.z1) - 0.002) return false;
      if (cy < m.sillY - 0.06) return false;
      if (cy <= m.beltY + 0.015) return true;                 // skin, handle, shut lines, door card below the belt
      return glassSlots.has(slot) && cy < gh2.roofY - 0.06;   // and the door's side glass
    }));
    body = split.rest;
    regions.forEach((r, i) => {
      const geo = split.parts[i];
      if (!geo.index || geo.index.count < 3) return;
      const hingeZ = Math.min(r.z0, r.z1); // the front seam (the car faces -z): doors open front-hinged
      doors.push({ side: r.side, z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1), hinge: [r.side * (sideX(r.sFront, (m.sillY + m.beltY) / 2) + 0.01), (m.sillY + m.beltY) / 2, hingeZ], geo });
    });
  }
  // ---------------------------------------------------------------- steering wheel: its own part so it can turn
  let steering: GeneratedModel['steering'] = null;
  if (lod === 0 && PASSENGER.has(m.cls)) {
    const d = m.seats.driver;
    const c: V3 = [d[0], m.beltY + 0.08, d[2] - 0.42];
    const ax: V3 = [0, Math.sin(0.45), Math.cos(0.45)]; // column axis toward the driver (rotationX(-0.45) of +z)
    const sw = extractRegions(body, [(cx, cy, cz) => {
      const dx = cx - c[0], dy = cy - c[1], dz = cz - c[2];
      const along = dx * ax[0] + dy * ax[1] + dz * ax[2];
      const r2 = dx * dx + dy * dy + dz * dz - along * along;
      return Math.abs(along) < 0.045 && r2 < 0.215 * 0.215;
    }]);
    if (sw.parts[0].index && sw.parts[0].index.count >= 3) { body = sw.rest; steering = { geo: sw.parts[0], centre: c, axis: ax }; }
  }
  const hood = lod === 0 && m.hood && hoodB.pos.length ? hoodB.build() : null;
  const tris = (g2: THREE.BufferGeometry | null) => (g2 ? (g2.index ? g2.index.count : g2.getAttribute('position').count) / 3 : 0);
  let maxZ = Z(L) + rDepth;
  for (const c of m.cargo ?? []) maxZ = Math.max(maxZ, Z(c.s1));
  return {
    body, hood, doors, steering, bumperF: lod === 0 && bumpFB.pos.length ? bumpFB.build() : null, bumperR: lod === 0 && bumpRB.pos.length ? bumpRB.build() : null, hoodPivot: m.hood ? [0, topY(m.hood[1]), Z(m.hood[1])] : [0, 0, 0],
    wheelR, wheelL, wheels, beacon, decals, colliders,
    lamps: { head, tail }, plates: plateMounts(m, Z, lastCargo),
    minZ: Z(0) - fDepth, maxZ, halfW: m.W / 2, height: Math.max(roofTop, ...(m.cargo ?? []).map((c) => c.y1)),
    tris: tris(body) + tris(hood) + doors.reduce((a, d) => a + tris(d.geo), 0) + (steering ? tris(steering.geo) : 0) + (tris(wheelR) * (wheels.length + (m.dualRear ? 2 : 0))) + tris(beacon),
  };
}

// ======================================================================= engine bay
/** A V8 under the hood (seen once the hood is off): block, valve covers, air cleaner, radiator, battery, hoses. */
function engineBay(b: GeoBuilder, m: ModelSpec, Z: (s: number) => number, halfW: (s: number) => number, topY: (s: number) => number) {
  const [h0, h1] = m.hood!;
  const s0 = h0 + 0.22, s1 = h1 - 0.12, sc = (s0 + s1) / 2, len = s1 - s0;
  const yTop = topY(sc) - 0.1, yBot = m.sillY + 0.08;
  const hw = halfW(sc) * 0.8;
  b.box('under', 0, yBot, Z(sc), hw * 2, 0.02, len + 0.2); // bay floor (dark)
  for (const sx of [-1, 1]) b.box('under', sx * hw, (yTop + yBot) / 2, Z(sc), 0.02, yTop - yBot, len + 0.2); // inner fender walls
  const blkW = Math.min(0.62, hw * 0.9), blkH = Math.min(0.42, yTop - yBot - 0.12), blkL = Math.min(0.75, len * 0.55);
  const zc = Z(sc + 0.05), yb = yTop - blkH / 2 - 0.08;
  b.box('trim', 0, yb, zc, blkW * 0.6, blkH, blkL);                     // block
  for (const sx of [-1, 1]) {
    b.box('trim', sx * blkW * 0.33, yb + blkH * 0.1, zc, blkW * 0.28, blkH * 0.6, blkL, 0, 0, sx * 0.5);   // heads (V)
    b.box('paint2', sx * blkW * 0.42, yb + blkH * 0.42, zc, blkW * 0.18, 0.05, blkL * 0.92, 0, 0, sx * 0.5); // valve covers
    b.tubePath('trim', [[sx * blkW * 0.5, yb + blkH * 0.2, zc - blkL * 0.45], [sx * blkW * 0.58, yb - blkH * 0.3, zc - blkL * 0.3], [sx * blkW * 0.6, yb - blkH * 0.5, zc + blkL * 0.4]], 0.025, 6); // exhaust manifold
  }
  b.add('chrome', new THREE.CylinderGeometry(0.23, 0.24, 0.08, 24), new THREE.Matrix4().makeTranslation(0, yb + blkH / 2 + 0.06, zc)); // air cleaner
  b.add('trim', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), new THREE.Matrix4().makeTranslation(0, yb + blkH / 2 + 0.12, zc));
  const rz = Z(h0 + 0.1);
  b.box('grille', 0, (yTop + yBot) / 2 + 0.02, rz, hw * 1.5, yTop - yBot - 0.08, 0.06);         // radiator core
  b.box('trim', 0, yTop - 0.04, rz, hw * 1.5 + 0.04, 0.04, 0.08);                             // radiator tank
  b.add('trim', new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, yb + 0.02, rz + 0.12)); // fan
  b.tubePath('rubber', [[0.15, yTop - 0.06, rz + 0.05], [0.12, yb + blkH * 0.4, zc - blkL / 2 - 0.02]], 0.022, 8); // top hose
  b.box('interior', -hw * 0.75, yTop - 0.12, Z(h1 - 0.35), 0.18, 0.2, 0.26);                  // battery
  b.box('white', -hw * 0.75, yTop - 0.01, Z(h1 - 0.35), 0.16, 0.01, 0.06);
}

// ======================================================================= hero details
/**
 * Hood and deck-lid shut lines, invented relief badges (a hood crest, a deck-lid crest, fender
 * emblems): chrome extrusions with a bevel. Shapes are made up for this game: no real marques.
 */
function heroDetails(b: GeoBuilder, m: ModelSpec, Z: (s: number) => number, halfW: (s: number) => number, topY: (s: number) => number, stations: number[], rearS: number, archR: number) {
  const L = m.L;
  const gap = (pts: V3[]) => { if (pts.length > 1) b.tubePath('grille', pts, 0.0026, 3); };
  // hood shut lines: along both fender edges, and across the cowl
  if (m.hood) {
    const [h0, h1] = m.hood;
    for (const sx of [1, -1]) gap(stations.filter((s) => s >= h0 && s <= h1).map((s) => [sx * halfW(s) * 0.952, topY(s) + 0.002, Z(s)] as V3));
    const sc = h1;
    gap([-1, -0.5, 0, 0.5, 1].map((f) => [f * halfW(sc) * 0.952, topY(sc) + m.crown * (1 - f * f) * 0.9 + 0.002, Z(sc)] as V3));
  }
  // deck lid: a rectangle on the rear deck of notchback cars
  const deck0 = m.gh.sC0 + 0.12, deck1 = L - 0.1;
  const isNotch = topY((deck0 + deck1) / 2) < m.gh.roofY - 0.3 && deck1 - deck0 > 0.6 && m.cls !== 'wagon' && !m.cargo;
  if (isNotch) {
    for (const sx of [1, -1]) gap(stations.filter((s) => s >= deck0 && s <= deck1).map((s) => [sx * halfW(s) * 0.9, topY(s) + 0.003, Z(s)] as V3));
    for (const sc of [deck0, deck1]) gap([-1, -0.5, 0, 0.5, 1].map((f) => [f * halfW(sc) * 0.9, topY(sc) + m.crown * (1 - (f * 0.9) ** 2) * 0.85 + 0.003, Z(sc)] as V3));
  }
  // crest: a shield with a chevron (invented), bevelled chrome
  const crest = new THREE.Shape();
  crest.moveTo(-0.035, 0.03); crest.lineTo(0.035, 0.03); crest.lineTo(0.035, -0.005); crest.quadraticCurveTo(0.03, -0.03, 0, -0.04); crest.quadraticCurveTo(-0.03, -0.03, -0.035, -0.005); crest.closePath();
  const crestGeo = () => new THREE.ExtrudeGeometry(crest, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 6 });
  const chevron = new THREE.Shape();
  chevron.moveTo(-0.022, 0.008); chevron.lineTo(0, -0.012); chevron.lineTo(0.022, 0.008); chevron.lineTo(0.022, 0.016); chevron.lineTo(0, -0.004); chevron.lineTo(-0.022, 0.016); chevron.closePath();
  const chevGeo = () => new THREE.ExtrudeGeometry(chevron, { depth: 0.006, bevelEnabled: false });
  // hood front, lying on the hood (faces up, nose toward -z)
  const sF = 0.22, yF = topY(sF) + m.crown * 0.9;
  const onHood = new THREE.Matrix4().makeTranslation(0, yF + 0.002, Z(sF)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  b.add('chrome', crestGeo(), onHood.clone());
  b.add('grille', chevGeo(), onHood.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.004, 0.006)));
  if (isNotch) {
    const sR = L - 0.22, yR = topY(sR) + m.crown * 0.85;
    const onDeck = new THREE.Matrix4().makeTranslation(0, yR + 0.002, Z(sR)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI));
    b.add('chrome', crestGeo(), onDeck.clone());
  }
  // fender emblem: three stacked chrome bars behind the front arch (both sides; cars only)
  const sE = m.sF + archR + 0.25, yE = lerp(m.sillY, m.beltY, 0.62);
  if (PASSENGER.has(m.cls)) for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
    const len = 0.12 - k * 0.025;
    b.box('chrome', sx * (halfW(sE) + 0.004), yE + k * 0.016, Z(sE + len / 2), 0.006, 0.008, len);
  }
  void rearS;
}

// ======================================================================= cabin (visible through the glass)
const PASSENGER = new Set<ModelSpec['cls']>(['sedan', 'police', 'coupe', 'compact', 'wagon', 'taxi']);
function cabin(b: GeoBuilder, m: ModelSpec, Z: (s: number) => number, halfW: (s: number) => number, hero = false) {
  const g = m.gh, belt = m.beltY;
  const hw = halfW((g.sA0 + g.sC0) / 2) - g.beltInset - 0.06;
  const d = m.seats.driver;
  // layout from the driver's H-point (z = d[2]): wheel 0.42 m ahead, dash face 0.6 m ahead,
  // seat back just behind the hip; the rear bench one row (0.95 m) back, under the roof
  const front = Z(g.sA0), rearLimit = Z(g.sC0) - 0.2;
  const hip = d[2], dashFace = hip - 0.6;
  const dashD = Math.max(0.2, dashFace - (front + 0.02));
  // dash: lower body, padded top with a rolled lip over the instruments, a glovebox line
  b.box('interior', 0, belt - 0.07, dashFace - dashD / 2, hw * 2, 0.26, dashD);
  b.box('trim', 0, belt + 0.075, dashFace - dashD / 2 + 0.04, hw * 2, 0.04, dashD + 0.02);
  b.box('trim', 0, belt + 0.05, dashFace + 0.015, hw * 2, 0.05, 0.05); // padded lip
  if (hero) b.box('grille', -d[0] * 0.95, belt - 0.12, dashFace + 0.002, 0.36, 0.004, 0.004); // glovebox shut line
  // steering wheel on its column, tilted toward the driver
  const wz = hip - 0.42, wy = belt + 0.08;
  const wheelM = new THREE.Matrix4().makeTranslation(d[0], wy, wz).multiply(new THREE.Matrix4().makeRotationX(-0.45));
  b.add('trim', new THREE.TorusGeometry(0.19, hero ? 0.017 : 0.016, hero ? 8 : 4, hero ? 32 : 12), wheelM.clone());
  const colLen = Math.hypot(wz - dashFace, 0.12) + 0.05;
  b.add('trim', new THREE.CylinderGeometry(0.025, 0.03, colLen, 6), new THREE.Matrix4().makeTranslation(d[0], wy - 0.06, (wz + dashFace) / 2).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.45)));
  if (hero) {
    // three-spoke wheel with a horn pad, and the instrument cluster: two big dials, two small, chrome bezels
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.3, Math.PI / 2 - 2.3]) b.add('trim', new THREE.BoxGeometry(0.17, 0.022, 0.012).translate(0.085, 0, 0).applyMatrix4(new THREE.Matrix4().makeRotationZ(a)), wheelM.clone());
    b.add('chrome', new THREE.CylinderGeometry(0.045, 0.05, 0.03, 16).rotateX(Math.PI / 2), wheelM.clone());
    const panelZ = dashFace + 0.004, panelY = belt - 0.02;
    for (const [dx, r] of [[-0.1, 0.06], [0.06, 0.06], [0.19, 0.036], [-0.23, 0.036]] as [number, number][]) {
      const x = d[0] + dx;
      const face = new THREE.Matrix4().makeTranslation(x, panelY, panelZ).multiply(new THREE.Matrix4().makeRotationX(-0.12));
      b.add('chrome', new THREE.TorusGeometry(r, 0.006, 6, 24), face.clone());
      b.add('white', new THREE.CircleGeometry(r * 0.96, 24).translate(0, 0, -0.002), face.clone()); // faces the driver (+z)
      for (let k = 0; k <= 8; k++) {
        const t = -2.3 + (k / 8) * 4.6;
        b.add('trim', new THREE.BoxGeometry(0.003, r * 0.18, 0.002).translate(0, r * 0.78, 0.001).applyMatrix4(new THREE.Matrix4().makeRotationZ(t)), face.clone());
      }
      b.add('reverse', new THREE.BoxGeometry(0.004, r * 0.8, 0.002).translate(0, r * 0.38, 0.003).applyMatrix4(new THREE.Matrix4().makeRotationZ(-1.1 + dx * 3)), face.clone());
    }
    // centre stack: radio with a chrome face and two knobs, heater slider panel below
    b.box('chrome', 0.05, belt - 0.06, dashFace + 0.006, 0.18, 0.05, 0.01);
    for (const dx of [-0.02, 0.12]) b.add('trim', new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(dx, belt - 0.06, dashFace + 0.02));
    b.box('trim', 0.05, belt - 0.13, dashFace + 0.006, 0.2, 0.035, 0.01);
    // pedals and the column-shift lever
    for (const dx of [-0.08, 0.06]) b.box('rubber', d[0] + dx, m.sillY + 0.18, dashFace + 0.12, 0.08, 0.1, 0.02, 0, 0.5);
    b.add('chrome', new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6).rotateZ(Math.PI / 2 - 0.3), new THREE.Matrix4().makeTranslation(d[0] + 0.14, wy - 0.07, wz + 0.1));
  }
  // bench seats with headrests (mandatory on new cars from 1969); the back leans 12°
  // the inside of the glasshouse at a body z: seats must stay under it (a coupe's rear bench sits
  // under the sloping back light and used to poke through the glass)
  const mid = -Z(0);
  const ghTop = (z: number) => {
    const s = z + mid;
    if (s <= g.sA1) return lerp(belt, g.roofY, clamp((s - g.sA0) / Math.max(0.05, g.sA1 - g.sA0), 0, 1));
    if (s <= g.sC1) return g.roofY;
    return lerp(g.roofY, belt, clamp((s - g.sC1) / Math.max(0.05, g.sC0 - g.sC1), 0, 1));
  };
  const bench = (back: number, headrests: boolean) => {
    b.box('seat', 0, belt - 0.24, back - 0.27, hw * 2, 0.15, 0.52); // cushion (mostly below the belt)
    if (hero) for (const sx of [-1, 1]) b.box('seat', sx * Math.abs(d[0]), belt - 0.16, back - 0.27, 0.5, 0.02, 0.46); // pleated top panels
    // the back's top leans 0.06 m rearward: check the glass there, keep 7 cm of clearance
    const bottom = belt - 0.25, top = Math.min(belt + 0.33, ghTop(back + 0.06) - 0.07);
    const hb = Math.max(0.25, top - bottom);
    b.add('seat', new THREE.BoxGeometry(hw * 2, hb, 0.13), new THREE.Matrix4().makeTranslation(0, bottom + hb / 2, back).multiply(new THREE.Matrix4().makeRotationX(-0.21)));
    if (headrests && ghTop(back + 0.12) - 0.05 > belt + 0.5) for (const sx of [-1, 1]) b.box('seat', sx * Math.abs(d[0]), belt + 0.4, back + 0.07, 0.26, 0.2, 0.1, 0, -0.21);
  };
  const frontBack = hip + 0.22;
  bench(frontBack, true);
  const rearBack = Math.min(hip + 0.95 + 0.22, rearLimit);
  if (rearBack - frontBack > 0.6) bench(rearBack, false);
  // parcel shelf behind the rear seat and the headliner
  if (m.cls !== 'wagon' && rearLimit - rearBack > 0.05) b.box('interior', 0, belt + 0.03, (rearBack + rearLimit) / 2 + 0.08, hw * 2, 0.03, rearLimit - rearBack + 0.1);
  const rows: V3[][] = [];
  for (const u of [0, 0.5, 1]) {
    const s = lerp(g.sA1 + 0.05, g.sC1 - 0.05, u);
    rows.push([-1, -0.5, 0, 0.5, 1].map((xf) => [xf * (g.roofHalfW - 0.04), g.roofY - 0.025 + g.crown * (1 - xf * xf) * 0.8, Z(s)] as V3));
  }
  b.grid(rows, 'white', { facing: [0, -1, 0] });
  if (hero) {
    // cabin shell: inner door cards with armrests and pulls, floor with the transmission hump, firewall
    const sill = m.sillY + 0.06, len = rearLimit - front;
    for (const sx of [-1, 1]) {
      b.box('interior', sx * (hw + 0.035), (sill + belt) / 2, (front + rearLimit) / 2, 0.03, belt - sill, len);
      for (const zz of [hip - 0.1, hip + 0.85]) {
        b.box('seat', sx * (hw + 0.005), belt - 0.16, zz, 0.06, 0.05, 0.4); // armrest
        b.box('chrome', sx * (hw + 0.018), belt - 0.07, zz - 0.25, 0.01, 0.02, 0.09); // door pull
      }
      b.box('chrome', sx * (hw + 0.02), belt - 0.03, hip - 0.25, 0.012, 0.008, 0.14); // window crank
    }
    b.box('interior', 0, sill, (front + rearLimit) / 2, hw * 2 + 0.1, 0.03, len);
    b.box('interior', 0, sill + 0.09, (front + rearLimit) / 2, 0.24, 0.16, len * 0.9);
    b.box('interior', 0, (sill + belt) / 2, front + 0.04, hw * 2 + 0.1, belt - sill, 0.03);
    // rear-view mirror on the windshield header
    b.box('chrome', 0, g.roofY - 0.09, Z(g.sA1) + 0.12, 0.24, 0.06, 0.02);
  }
}

// ======================================================================= greenhouse
function greenhouse(b: GeoBuilder, m: ModelSpec, o: GenOptions, Z: (s: number) => number, halfW: (s: number) => number, lod: 0 | 1) {
  const g = m.gh;
  const vinyl = o.vinyl;
  const hwBelt = halfW((g.sA0 + g.sC0) / 2) - g.beltInset;
  const hwAt = (v: number) => lerp(hwBelt, g.roofHalfW, v * 0.65 + v * v * 0.35);
  const yAt = (v: number) => lerp(m.beltY, g.roofY, v);
  const pillarSlot = (u: number): Slot => (vinyl === 'landau' && u > 0.55 ? 'vinyl' : 'roof');

  // u breakpoints
  const us = new Set<number>([0, 1]);
  for (const band of g.bands) us.add(band.u);
  const bandAt = (u: number): { k: GlassKind; u0: number; u1: number } => {
    let k: GlassKind = 'pillar', u0 = 0, u1 = 1;
    for (let i = 0; i < g.bands.length; i++) if (u >= g.bands[i].u) { k = g.bands[i].k; u0 = g.bands[i].u; u1 = g.bands[i + 1]?.u ?? 1; }
    return { k, u0, u1 };
  };
  for (const band of g.bands) if (band.k === 'opera') {
    const u1 = g.bands[g.bands.indexOf(band) + 1]?.u ?? 1;
    us.add(lerp(band.u, u1, 0.28)); us.add(lerp(band.u, u1, 0.72));
  }
  if (lod === 0) { const sorted = [...us].sort((a, b2) => a - b2); for (let i = 0; i < sorted.length - 1; i++) { const d = sorted[i + 1] - sorted[i]; const k = Math.ceil(d / 0.1); for (let j = 1; j < k; j++) us.add(sorted[i] + (d * j) / k); } }
  const uList = [...us].sort((a, b2) => a - b2);
  const vs = new Set<number>([0, 1, g.winV[0], g.winV[1]]);
  if (lod === 0) { vs.add(0.5); vs.add(0.4); vs.add(0.72); }
  if (g.signBand) { vs.add(g.signBand[0]); vs.add(g.signBand[1]); }
  const vList = [...vs].sort((a, b2) => a - b2);

  let paneSlot: Slot = 'glassR';
  const sideCell = (uc: number, vc: number): Slot => {
    const { k, u0, u1 } = bandAt(uc);
    const inWin = vc > g.winV[0] && vc < g.winV[1];
    if (k === 'glass') return inWin ? paneSlot : pillarSlot(uc);
    if (k === 'door') return vc < g.winV[1] ? 'interior' : pillarSlot(uc);
    if (k === 'opera') { const t = (uc - u0) / (u1 - u0); return t > 0.28 && t < 0.72 && vc > 0.4 && vc < 0.72 ? paneSlot : pillarSlot(uc); }
    return pillarSlot(uc);
  };
  const inside: V3 = [0, m.beltY - 0.3, Z((g.sA0 + g.sC0) / 2)];
  for (const sx of [1, -1]) {
    paneSlot = sx > 0 ? 'glassR' : 'glassL';
    const rows = uList.map((u) => vList.map((v) => [sx * hwAt(v), yAt(v), Z(lerp(lerp(g.sA0, g.sC0, u), lerp(g.sA1, g.sC1, u), v))] as V3));
    b.grid(rows, (i, j) => sideCell((uList[i] + uList[i + 1]) / 2, (vList[j] + vList[j + 1]) / 2), { inside });
    // cars with a cabin: an inner skin on the opaque pillar panels (one-sided faces vanished from
    // inside, so the C-pillars and sail panels looked missing from the seats)
    if (lod === 0 && PASSENGER.has(m.cls)) {
      const inner = rows.map((r) => r.map((p) => [p[0] - sx * 0.012, p[1], p[2]] as V3));
      b.grid(inner, (i, j) => {
        const sl = sideCell((uList[i] + uList[i + 1]) / 2, (vList[j] + vList[j + 1]) / 2);
        return sl === paneSlot ? null : 'interior';
      }, { inside: [sx * 10, m.beltY, Z((g.sA0 + g.sC0) / 2)] });
    }
  }
  // windshield + backlight: columns across the width (xf -1..1)
  const nx = lod === 0 ? 10 : 4;
  const xfs: number[] = [];
  const fr = g.wsFrame ?? 0.05;
  for (let i = 0; i <= nx; i++) xfs.push(-1 + (2 * i) / nx);
  xfs.push(-1 + fr, 1 - fr); if (g.splitWindshield) xfs.push(-0.02, 0.02);
  const xList = [...new Set(xfs.map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b2) => a - b2);
  const glassV = (v: number) => v > 0.05 && v < (g.signBand ? g.signBand[0] : 0.95);
  for (const end of ['front', 'back'] as const) {
    const rows = vList.map((v) => xList.map((xf) => {
      const sEdge = end === 'front' ? lerp(g.sA0, g.sA1, v) : lerp(g.sC0, g.sC1, v);
      const bowS = (end === 'front' ? -1 : 1) * g.bow * (1 - xf * xf);
      return [xf * hwAt(v), yAt(v) + g.crown * (1 - xf * xf) * v * v * v, Z(sEdge + bowS)] as V3;
    }));
    b.grid(rows, (i, j) => {
      const vc = (vList[i] + vList[i + 1]) / 2, xc = (xList[j] + xList[j + 1]) / 2;
      if (g.signBand && vc > g.signBand[0] && vc < g.signBand[1]) return 'trim';
      const kind = end === 'front' ? 'glass' : g.backlight ?? 'glass';
      const pane: Slot = end === 'front' ? 'glassF' : 'glassB';
      const inFrame = Math.abs(xc) < 1 - fr && glassV(vc);
      if (kind === 'glass') { if (g.splitWindshield && end === 'front' && Math.abs(xc) < 0.02) return 'trim'; return inFrame ? pane : end === 'back' ? pillarSlot(1) : 'roof'; }
      if (kind === 'twoWindows') return Math.abs(xc) > 0.06 && Math.abs(xc) < 0.82 && vc > 0.3 && vc < 0.88 ? pane : 'roof';
      return pillarSlot(1);
    }, { inside });
  }
  // roof
  const nu = lod === 0 ? 8 : 3;
  const roofRows: V3[][] = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    roofRows.push(xList.map((xf) => {
      const s = lerp(g.sA1 - g.bow * (1 - xf * xf), g.sC1 + g.bow * (1 - xf * xf), u);
      return [xf * g.roofHalfW, g.roofY + g.crown * (1 - xf * xf), Z(s)] as V3;
    }));
  }
  b.grid(roofRows, (i) => (vinyl === 'full' || (vinyl === 'landau' && i >= nu / 2) ? 'vinyl' : 'roof'), { inside });
  // window surrounds and belt moulding
  const frame = m.trim.windowFrame;
  if (frame && lod === 0) for (const sx of [1, -1]) {
    const P = (u: number, v: number): V3 => [sx * (hwAt(v) + 0.007), yAt(v), Z(lerp(lerp(g.sA0, g.sC0, u), lerp(g.sA1, g.sC1, u), v))];
    for (let i = 0; i < g.bands.length; i++) {
      const band = g.bands[i];
      if (band.k !== 'glass' && band.k !== 'opera') continue;
      let u0 = band.u, u1 = g.bands[i + 1]?.u ?? 1, v0 = g.winV[0], v1 = g.winV[1];
      if (band.k === 'opera') { const w = u1 - u0; u0 += w * 0.28; u1 -= w * 0.28; v0 = 0.4; v1 = 0.72; }
      const ring: V3[] = [];
      const n = 3;
      for (let k = 0; k <= n; k++) ring.push(P(lerp(u0, u1, k / n), v0));
      ring.push(P(u1, v1));
      for (let k = 1; k <= n; k++) ring.push(P(lerp(u1, u0, k / n), v1));
      ring.push(P(u0, v0));
      b.tubePath(frame, ring, 0.009, 3);
    }
    // belt moulding along the base of the glass
    const belt: V3[] = [];
    for (let k = 0; k <= 4; k++) belt.push([sx * (hwAt(0) + 0.012), yAt(0) + 0.006, Z(lerp(g.sA0, g.sC0, k / 4))]);
    b.tubePath(frame, belt, 0.011, 4);
  }
  if (g.drip && lod === 0) for (const sx of [1, -1]) {
    const path: V3[] = [];
    for (let k = 0; k <= 8; k++) { const u = k / 8; path.push([sx * (g.roofHalfW + 0.006), g.roofY - 0.004, Z(lerp(g.sA1, g.sC1, u))]); }
    b.sweep('chrome', sx > 0 ? path : path.reverse(), [[-0.006, -0.012], [0.008, -0.012], [0.008, 0.006], [-0.006, 0.006]]);
  }
}

// ======================================================================= cargo modules
function cargo(b: GeoBuilder, c: CargoSpec, Z: (s: number) => number, lod: 0 | 1) {
  if (c.kind === 'ladder') {
    // two rails with rungs, rising from y0 at s1 (base) to y1 at s0 (tip)
    const len = c.s1 - c.s0, rise = c.y1 - c.y0, ang = Math.atan2(rise, len);
    const mid = (c.y0 + c.y1) / 2, zc = Z((c.s0 + c.s1) / 2);
    for (const sx of [-1, 1]) b.box(c.slot, sx * c.hw, mid, zc, 0.07, 0.16, Math.hypot(len, rise), 0, ang);
    const n = lod === 0 ? Math.floor(len / 0.35) : Math.floor(len / 1.2);
    for (let i = 1; i < n; i++) { const t = i / n; b.box(c.slot, 0, lerp(c.y1, c.y0, t), Z(lerp(c.s0, c.s1, t)), c.hw * 2, 0.035, 0.035); }
    return;
  }
  if (c.kind === 'turntable') {
    b.add(c.slot, new THREE.CylinderGeometry(c.hw, c.hw * 1.05, c.y1 - c.y0, lod === 0 ? 16 : 8), new THREE.Matrix4().makeTranslation(0, (c.y0 + c.y1) / 2, Z((c.s0 + c.s1) / 2)));
    return;
  }
  if (c.band) for (const sx of [-1, 1]) b.box(c.band[2], sx * (c.hw + 0.006), (c.band[0] + c.band[1]) / 2, Z((c.s0 + c.s1) / 2), 0.012, c.band[1] - c.band[0], c.s1 - c.s0 - 0.02);
  const r = 0.06;
  // rounded-corner rectangular section lofted along s
  const sec = (s: number, y0: number, y1: number, hw: number): V3[] => {
    const pts: [number, number][] = [[hw, y0], [hw, y1 - r], [hw - r * 0.3, y1 - r * 0.3], [hw - r, y1], [-hw + r, y1], [-hw + r * 0.3, y1 - r * 0.3], [-hw, y1 - r], [-hw, y0]];
    return pts.map(([x, y]) => [x, y, Z(s)]);
  };
  const rows: V3[][] = [];
  if (c.kind === 'box') {
    rows.push(sec(c.s0, c.y0, c.y1, c.hw), sec(c.s1, c.y0, c.y1, c.hw));
  } else {
    // packer: body, then a rear hopper that rises and drops its sill to the loading lip
    const hs = c.s1 - 1.4;
    const n = lod === 0 ? 6 : 2;
    rows.push(sec(c.s0, c.y0, c.y1 - 0.15, c.hw * 0.97));
    rows.push(sec(c.s0 + 0.25, c.y0, c.y1, c.hw));
    rows.push(sec(hs, c.y0, c.y1, c.hw));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      rows.push(sec(lerp(hs, c.s1, t), lerp(c.y0, c.y0 - 0.35, smooth(0.2, 1, t)), lerp(c.y1, c.y1 + 0.15, Math.sin(t * Math.PI * 0.6)) - (t > 0.85 ? (t - 0.85) * 2.5 : 0), c.hw * 1.01));
    }
  }
  const inside: V3 = [0, (c.y0 + c.y1) / 2, Z((c.s0 + c.s1) / 2)];
  // separate grids per face run so corners shade crisp (side | rounded top | side | bottom)
  const run = (j0: number, j1: number, slot: Slot) => b.grid(rows.map((r) => { const o: V3[] = []; for (let j = j0; j <= j1; j++) o.push(r[j % r.length]); return o; }), slot, { inside });
  run(0, 1, c.slot); run(1, 6, c.slot); run(6, 7, c.slot); run(7, 8, 'under');
  b.cap(rows[0], c.slot, [0, 0, -1]);
  b.cap(rows[rows.length - 1], c.kind === 'packer' ? 'interior' : c.slot, [0, 0, 1]);
  const ribs = lod === 0 ? c.ribs ?? 0 : 0;
  for (let i = 1; i < ribs; i++) {
    const s = lerp(c.s0 + 0.1, c.kind === 'packer' ? c.s1 - 1.5 : c.s1 - 0.1, i / ribs);
    for (const sx of [-1, 1]) b.box(c.ribSlot ?? 'trim', sx * (c.hw + 0.012), (c.y0 + c.y1) / 2, Z(s), 0.025, c.y1 - c.y0 - 0.04, 0.05);
  }
  if (c.kind === 'box') { // rear door seam + hinges + latch bar
    b.box('trim', 0, (c.y0 + c.y1) / 2, Z(c.s1) + 0.012, 0.02, c.y1 - c.y0 - 0.08, 0.02);
    for (const sx of [-1, 1]) b.box('chrome', sx * 0.25, (c.y0 + c.y1) / 2, Z(c.s1) + 0.02, 0.03, c.y1 - c.y0 - 0.25, 0.03);
    b.box('trim', 0, c.y0 + 0.05, Z(c.s1) + 0.05, c.hw * 2, 0.1, 0.12);
  } else {
    // hopper lip and the packer blade guide rails
    b.box('trim', 0, c.y0 - 0.32, Z(c.s1) - 0.05, c.hw * 2, 0.12, 0.2);
    for (const sx of [-1, 1]) b.box('trim', sx * (c.hw + 0.03), c.y0 + 0.6, Z(c.s1 - 0.9), 0.06, 1.4, 0.12, 0, 0.35);
  }
}

// ======================================================================= bumpers
function bumper(b: GeoBuilder, bp: NonNullable<ModelSpec['rearBumper']>, end: 'front' | 'rear', m: ModelSpec, Z: (s: number) => number, halfW: (s: number) => number, lod: 0 | 1, over?: { s: number; hw: number }) {
  const L = m.L;
  const sEdge = end === 'front' ? 0 : over ? over.s : L;
  const dir = end === 'front' ? -1 : 1; // outward along s
  const hw = over ? over.hw - 0.02 : halfW(sEdge === 0 ? 0.05 : L - 0.05) + 0.015;
  const d = bp.depth;
  const pts: [number, number][] = [];
  const wrapS = bp.wrap;
  // plan path from left to right for the front (outward = -z), right to left for the rear
  const half: [number, number][] = lod === 0
    ? [[-hw + 0.01, wrapS], [-hw + 0.03, wrapS * 0.35], [-hw + 0.1, -d * 0.6], [-hw + 0.25, -d * 0.95], [0, -d]]
    : [[-hw + 0.01, wrapS], [-hw + 0.12, -d * 0.8], [0, -d]];
  for (const p of half) pts.push(p);
  for (const p of half.slice(0, -1).reverse()) pts.push([-p[0], p[1]]);
  const path: V3[] = pts.map(([x, ds]) => [end === 'front' ? x : -x, bp.y, Z(end === 'front' ? sEdge + ds : sEdge - ds)]);
  const h = bp.h;
  const slot: Slot = bp.kind === 'chrome' || bp.kind === '5mph' ? 'chrome' : bp.kind === 'painted' ? 'trim' : 'rubber';
  const prof: [number, number][] = bp.kind === '5mph'
    ? [[0, 0], [0.04, 0.02], [0.06, h * 0.5], [0.04, h - 0.02], [0, h], [-0.08, h], [-0.08, 0]]
    : bp.kind === 'chrome'
      ? [[0, 0.01], [0.025, 0.03], [0.035, h * 0.55], [0.02, h - 0.01], [-0.01, h], [-0.05, h * 0.9], [-0.05, 0]]
      : [[0, 0], [0.03, 0.02], [0.03, h - 0.02], [0, h], [-0.06, h], [-0.06, 0]];
  b.sweep(slot, path, prof);
  if (bp.kind === '5mph') {
    const mid = path.slice(1, -1);
    b.sweep('rubber', mid, [[0.055, h * 0.38], [0.075, h * 0.42], [0.075, h * 0.58], [0.055, h * 0.62]]);
    for (const sx of [-1, 1]) b.box('rubber', sx * hw * 0.42, bp.y + h * 0.5, Z(sEdge) + dir * (d + 0.04), 0.08, h * 1.08, 0.06);
  }
  // brackets (dark) back to the body
  if (lod === 0) for (const sx of [-1, 1]) b.box('under', sx * hw * 0.5, bp.y + h * 0.4, Z(sEdge) + dir * d * 0.5, 0.08, h * 0.5, d);
}

// ======================================================================= wheels
function wheel(m: ModelSpec, o: GenOptions, side: 1 | -1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const R = m.wheelR, w = m.tireW;
  const segs = o.hero ? 48 : o.lod === 0 ? 18 : 10;
  if (o.hero) return heroWheel(b, m, o, side, segs);
  const rim = R * (m.cls === 'bus' || m.cls === 'boxtruck' || m.cls === 'garbage' ? 0.56 : 0.62);
  const mir = side < 0;
  const tire: [number, number][] = o.lod === 0
    ? [[rim * 0.98, -w / 2], [R - 0.035, -w / 2 - 0.005], [R - 0.008, -w / 2 + 0.02], [R, -w / 4], [R, w / 4], [R - 0.008, w / 2 - 0.02], [R - 0.035, w / 2 + 0.005], [rim * 0.98, w / 2]]
    : [[rim, -w / 2], [R - 0.03, -w / 2], [R, 0], [R - 0.03, w / 2], [rim, w / 2]];
  b.latheX('rubber', tire, segs, [0, 0, 0], mir);
  // inboard back of the wheel, so far-side wheels seen under the body never look hollow
  if (m.sillY > 0.4) b.latheX('under', [[rim * 0.99, -w / 2 + 0.004], [0.001, -w / 2 + 0.004]], segs, [0, 0, 0], mir, w);
  const style = o.wheelStyle;
  if (o.lod === 1) { // shallow disc in the cover colour, plus the whitewall: LOD1 must read like LOD0 at 40 m
    b.latheX(style === 'fullcover' || style === 'wire' || style === 'hubcap' || style === 'dogdish' ? 'chrome' : 'trim', [[rim, w / 2], [rim * 0.6, w / 2 + 0.025], [0.001, w / 2 + 0.04]], segs, [0, 0, 0], mir, -w);
    if (o.whitewall) b.latheX('white', [[rim + 0.012, w / 2 + 0.004], [R - 0.04, w / 2 + 0.004]], segs, [0, 0, 0], mir, -w);
    return b.build();
  }
  const face = w / 2;
  // period wide whitewall band, slightly proud of the black sidewall
  if (o.whitewall) b.latheX('white', [[rim + 0.018, face + 0.006], [R - 0.045, face + 0.008], [R - 0.04, face + 0.004]], segs, [0, 0, 0], mir, -w);
  if (style === 'fullcover' || style === 'wire') {
    // full wheel cover: rolled outer lip, a recessed concentric groove, a domed centre cap
    b.latheX('chrome', [[rim, face - 0.005], [rim * 0.9, face + 0.018], [rim * 0.72, face + 0.01], [rim * 0.6, face + 0.028], [rim * 0.3, face + 0.03], [rim * 0.22, face + 0.05], [0.001, face + 0.056]], segs, [0, 0, 0], mir, -w);
  } else if (style === 'hubcap' || style === 'dogdish') {
    b.latheX('trim', [[rim, face - 0.005], [rim * 0.9, face + 0.004], [rim * 0.55, face + 0.012], [0.001, face + 0.012]], segs, [0, 0, 0], mir, -w);
    const cr = style === 'dogdish' ? rim * 0.5 : rim * 0.72;
    b.latheX('chrome', [[cr, face + 0.012], [cr * 0.8, face + 0.03], [cr * 0.3, face + 0.04], [0.001, face + 0.041]], segs, [0, 0, 0], mir, -w);
  } else { // truck steel: deep dish with a hub
    b.latheX('trim', [[rim, face - 0.01], [rim * 0.85, face - 0.04], [rim * 0.5, face - 0.05], [rim * 0.35, face - 0.02], [rim * 0.2, face + 0.03], [0.001, face + 0.04]], segs, [0, 0, 0], mir, -w);
  }
  return b.build();
}

/**
 * Hero wheel: 48 segments; the tyre is real geometry. Crown: two circumferential grooves and
 * 24 staggered transverse blocks per shoulder (period bias-ply rib pattern). Shoulders rounded, sidewall with
 * a moulded bead ring and a raised lettering band (blank: no real tyre brands).
 */
function heroWheel(b: GeoBuilder, m: ModelSpec, o: GenOptions, side: 1 | -1, segs: number): THREE.BufferGeometry {
  const R = m.wheelR, w = m.tireW, mir = side < 0;
  const rim = R * (m.cls === 'bus' || m.cls === 'boxtruck' || m.cls === 'garbage' ? 0.56 : 0.62);
  const face = w / 2;
  // profile across the tyre [radius, x]: bead, sidewall (lettering band), shoulder, crown with grooves
  const xs = (t: number) => -w / 2 + t * w;
  const prof: { r: number; x: number; crown: number }[] = [];
  const P = (r: number, x: number, crown = 0) => prof.push({ r, x, crown });
  P(rim * 0.985, -w / 2 + 0.004); P(rim + 0.012, -w / 2 - 0.004); P(rim + 0.03, -w / 2 - 0.008);
  P(lerp(rim, R, 0.45), -w / 2 - 0.012); P(lerp(rim, R, 0.56), -w / 2 - 0.016); P(lerp(rim, R, 0.67), -w / 2 - 0.012);
  P(R - 0.03, -w / 2 - 0.006); P(R - 0.012, -w / 2 + 0.008); P(R - 0.003, xs(0.12), 1);
  // crown: grooves at 1/3 and 2/3
  for (const [t, groove] of [[0.3, 0], [0.315, 1], [0.35, 1], [0.365, 0], [0.635, 0], [0.65, 1], [0.685, 1], [0.7, 0]] as [number, number][]) P(R - (groove ? 0.009 : 0), xs(t), groove ? 2 : 1);
  P(R - 0.003, xs(0.88), 1); P(R - 0.012, w / 2 - 0.008); P(R - 0.03, w / 2 + 0.006);
  P(lerp(rim, R, 0.67), w / 2 + 0.012); P(lerp(rim, R, 0.56), w / 2 + 0.016); P(lerp(rim, R, 0.45), w / 2 + 0.012);
  P(rim + 0.03, w / 2 + 0.008); P(rim + 0.012, w / 2 + 0.004); P(rim * 0.985, w / 2 - 0.004);
  // transverse blocks: crown rows (not the grooves) sink 4 mm in a staggered 48-pitch pattern
  const pitch = segs / 2;
  const rows: V3[][] = prof.map((pp) => {
    const row: V3[] = [];
    for (let k = 0; k < segs; k++) {
      const t = (k / segs) * Math.PI * 2;
      let r = pp.r;
      if (pp.crown === 1) {
        // one block per two segments, staggered between the shoulders and the centre rib
        const cell = Math.floor((k / segs) * pitch * 2) + (pp.x > w * 0.2 ? 1 : pp.x < -w * 0.2 ? 0 : 1);
        if (cell % 2 === 1) r -= 0.004;
      }
      row.push([mir ? -pp.x : pp.x, Math.cos(t) * r, Math.sin(t) * r]);
    }
    return row;
  });
  b.grid(rows, 'rubber', { closeJ: true, inside: [0, 0, 0], smooth: false });
  if (m.sillY > 0.4) b.latheX('under', [[rim * 0.99, -w / 2 + 0.004], [0.001, -w / 2 + 0.004]], segs, [0, 0, 0], mir, w);
  // rim lip (steel, visible inside the cover's edge)
  b.latheX('trim', [[rim * 0.985, face - 0.004], [rim * 1.01, face + 0.004], [rim * 0.97, face + 0.008], [rim * 0.93, face]], segs, [0, 0, 0], mir, -w);
  const style = o.wheelStyle;
  if (o.whitewall) b.latheX('white', [[rim + 0.018, face + 0.0125], [lerp(rim, R, 0.45), face + 0.0155], [R - 0.05, face + 0.0145], [R - 0.044, face + 0.011]], segs, [0, 0, 0], mir, -w);
  if (style === 'fullcover' || style === 'wire') {
    // cover: rolled lip, fluted ring (24 flutes), recessed groove, domed cap with a centre medallion
    const flutes = 24;
    const ring: V3[][] = [];
    const radii = [rim * 0.97, rim * 0.9, rim * 0.82, rim * 0.74];
    for (let q = 0; q < radii.length; q++) {
      const row: V3[] = [];
      for (let k = 0; k < segs; k++) {
        const t = (k / segs) * Math.PI * 2;
        const fl = q === 1 || q === 2 ? 0.006 * Math.max(0, Math.cos(t * flutes)) : 0;
        const x = face + [0.004, 0.02, 0.026, 0.014][q] + fl;
        row.push([mir ? -x : x, Math.cos(t) * radii[q], Math.sin(t) * radii[q]]);
      }
      ring.push(row);
    }
    b.grid(ring, 'chrome', { closeJ: true, inside: [mir ? w : -w, 0, 0], smooth: false });
    b.latheX('chrome', [[rim * 0.74, face + 0.014], [rim * 0.62, face + 0.03], [rim * 0.42, face + 0.042], [rim * 0.24, face + 0.054], [rim * 0.12, face + 0.06], [0.001, face + 0.062]], segs, [0, 0, 0], mir, -w);
    b.latheX('trim', [[rim * 0.11, face + 0.0615], [0.001, face + 0.0625]], 24, [0, 0, 0], mir, -w); // medallion
  } else if (style === 'hubcap' || style === 'dogdish') {
    b.latheX('trim', [[rim * 0.93, face], [rim * 0.9, face + 0.004], [rim * 0.55, face + 0.012], [0.001, face + 0.012]], segs, [0, 0, 0], mir, -w);
    const cr = style === 'dogdish' ? rim * 0.5 : rim * 0.72;
    b.latheX('chrome', [[cr, face + 0.012], [cr * 0.92, face + 0.026], [cr * 0.8, face + 0.032], [cr * 0.5, face + 0.04], [cr * 0.3, face + 0.042], [0.001, face + 0.043]], segs, [0, 0, 0], mir, -w);
    // lug nuts
    for (let k = 0; k < 5; k++) {
      const t = (k / 5) * Math.PI * 2, rr = rim * 0.38;
      b.add('chrome', new THREE.CylinderGeometry(0.011, 0.013, 0.02, 6).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(mir ? -(face + 0.016) : face + 0.016, Math.cos(t) * rr, Math.sin(t) * rr));
    }
  } else {
    b.latheX('trim', [[rim * 0.93, face - 0.01], [rim * 0.85, face - 0.04], [rim * 0.5, face - 0.05], [rim * 0.35, face - 0.02], [rim * 0.2, face + 0.03], [0.001, face + 0.04]], segs, [0, 0, 0], mir, -w);
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2, rr = rim * 0.3;
      b.add('chrome', new THREE.CylinderGeometry(0.014, 0.016, 0.03, 6).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(mir ? -(face - 0.035) : face - 0.035, Math.cos(t) * rr, Math.sin(t) * rr));
    }
  }
  return b.build();
}

// ======================================================================= plates
function plateMounts(m: ModelSpec, Z: (s: number) => number, lastCargo: { s1: number } | null): { pos: V3; normal: V3 }[] {
  const fb = m.bumper, rb = m.rearBumper ?? m.bumper;
  const out = (k: string) => (k === '5mph' ? 0.085 : k === 'chrome' ? 0.045 : 0.04);
  const front: { pos: V3; normal: V3 } = { pos: [0, fb.y + fb.h * 0.5, Z(0) - fb.depth - out(fb.kind)], normal: [0, 0, -1] };
  const rearS = lastCargo ? lastCargo.s1 : m.L;
  const rear: { pos: V3; normal: V3 } = lastCargo
    ? { pos: [0.55, rb.y + rb.h + 0.12, Z(rearS) + 0.03], normal: [0, 0, 1] }
    : { pos: [0, rb.y + rb.h + 0.1, Z(rearS) + 0.02], normal: [0, 0, 1] };
  return m.cls === 'bus' ? [rear] : [front, rear];
}
