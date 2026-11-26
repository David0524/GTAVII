import * as THREE from 'three/webgpu';
import { GeoBuilder, type Slot, type V3, clamp, lerp, pw, smooth } from './builder';
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
}

/** Body cross-section run indices: right side, top, left side, underside. */
interface Section { s: number; side: V3[]; top: V3[]; under: [V3, V3] }

export function generate(m: ModelSpec, o: GenOptions): GeneratedModel {
  const b = new GeoBuilder();
  const hoodB = new GeoBuilder();
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
    return m.W / 2 - inset;
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

  const sideX = (s: number, y: number) => {
    const hw = halfW(s), y0 = bottomY(s), yb = beltAt(s);
    const creaseY = lerp(m.sillY, m.beltY, m.crease);
    return hw * pw([[y0, 0.92], [y0 + 0.05, 0.985], [Math.max(y0 + 0.06, creaseY), 1], [yb - 0.05, 0.995], [yb, 0.975]], y);
  };

  const section = (s: number): Section => {
    const hw = halfW(s), y0 = bottomY(s), yt = topY(s), yb = Math.min(beltAt(s), yt);
    const creaseY = lerp(m.sillY, m.beltY, m.crease);
    let ys = [y0, y0 + 0.05, creaseY, yb - 0.05, yb];
    if (lod === 0) ys.push(...extraY);
    ys = [...new Set(ys.filter((y) => y >= y0 && y <= yb).map((y) => Math.round(y * 1000) / 1000))].sort((a, b) => a - b);
    const side: V3[] = ys.map((y) => [sideX(s, y), y, Z(s + rake(s, y))]);
    const crown = m.crown * (yt > yb + 0.02 ? 1 : 0);
    const topPts: [number, number][] = lod === 0
      ? [[0.975, yb], [0.955, yt], [0.78, yt + crown * 0.45], [0.5, yt + crown * 0.8], [0.25, yt + crown * 0.95], [0, yt + crown]]
      : [[0.975, yb], [0.955, yt], [0.5, yt + crown * 0.8], [0, yt + crown]];
    const half = topPts.map(([f, y]) => [hw * f, y, Z(s + rake(s, y))] as V3);
    const top = [...half, ...half.slice(0, -1).reverse().map((p) => [-p[0], p[1], p[2]] as V3)];
    return { s, side, top, under: [[-side[0][0], side[0][1], side[0][2]], side[0]] };
  };

  // ---------------------------------------------------------------- stations
  const st = new Set<number>();
  const n = Math.max(lod === 0 ? 24 : 7, Math.round(L / (lod === 0 ? 0.22 : 0.85)));
  for (let i = 0; i <= n; i++) st.add(L * i / n);
  for (const a of axles) {
    const k = lod === 0 ? 6 : 1;
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
  b.grid(topRows, (i, j) => (isHood(i, j) ? null : m.twoTone?.(sCell(i), 9) ? 'paint2' : 'paint'), { inside });
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
          const lens = new THREE.SphereGeometry(r, segs, lod === 0 ? 3 : 1, 0, Math.PI * 2, 0, Math.PI / 2);
          b.add('headlamp', lens, new THREE.Matrix4().makeTranslation(x, h.y, hz - 0.005).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(1, 0.25, 1)));
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
  bumper(b, m.bumper, 'front', m, Z, halfW, lod);
  bumper(b, m.rearBumper ?? m.bumper, 'rear', m, Z, halfW, lod, lastCargo ? { s: lastCargo.s1, hw: lastCargo.hw } : undefined);

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
      for (const [s0, s1] of [[0.25, 1.35], [6.3, 7.4]] as const) {
        const x = halfW((s0 + s1) / 2) + 0.004;
        b.box('glass', x, (m.sillY + m.beltY) / 2 + 0.05, Z((s0 + s1) / 2), 0.012, m.beltY - m.sillY - 0.15, s1 - s0 - 0.1);
        b.box('trim', x + 0.004, (m.sillY + m.beltY) / 2 + 0.05, Z((s0 + s1) / 2), 0.014, m.beltY - m.sillY - 0.12, 0.05);
      }
    } else if (e === 'stepDoor') {
      for (const sx of [-1, 1]) b.box('interior', sx * (halfW(0.9) + 0.003), (m.sillY + m.beltY) / 2 + 0.05, Z(0.95), 0.01, m.beltY - m.sillY - 0.1, 0.62);
    }
  }
  if (bb.pos.length) beacon = bb.build();
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

  const body = b.build();
  const hood = lod === 0 && m.hood && hoodB.pos.length ? hoodB.build() : null;
  const tris = (g2: THREE.BufferGeometry | null) => (g2 ? (g2.index ? g2.index.count : g2.getAttribute('position').count) / 3 : 0);
  let maxZ = Z(L) + rDepth;
  for (const c of m.cargo ?? []) maxZ = Math.max(maxZ, Z(c.s1));
  return {
    body, hood, hoodPivot: m.hood ? [0, topY(m.hood[1]), Z(m.hood[1])] : [0, 0, 0],
    wheelR, wheelL, wheels, beacon, decals, colliders,
    lamps: { head, tail }, plates: plateMounts(m, Z, lastCargo),
    minZ: Z(0) - fDepth, maxZ, halfW: m.W / 2, height: Math.max(roofTop, ...(m.cargo ?? []).map((c) => c.y1)),
    tris: tris(body) + tris(hood) + (tris(wheelR) * (wheels.length + (m.dualRear ? 2 : 0))) + tris(beacon),
  };
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
  const segs = o.lod === 0 ? 16 : 7;
  const rim = R * (m.cls === 'bus' || m.cls === 'boxtruck' || m.cls === 'garbage' ? 0.56 : 0.62);
  const mir = side < 0;
  const tire: [number, number][] = o.lod === 0
    ? [[rim * 0.98, -w / 2], [R - 0.035, -w / 2 - 0.005], [R - 0.008, -w / 2 + 0.02], [R, -w / 4], [R, w / 4], [R - 0.008, w / 2 - 0.02], [R - 0.035, w / 2 + 0.005], [rim * 0.98, w / 2]]
    : [[rim, -w / 2], [R - 0.03, -w / 2], [R, 0], [R - 0.03, w / 2], [rim, w / 2]];
  b.latheX('rubber', tire, segs, [0, 0, 0], mir);
  const style = o.wheelStyle;
  if (o.lod === 1) { // flat disc in the trim colour
    b.latheX(style === 'fullcover' || style === 'wire' ? 'chrome' : 'trim', [[rim, w / 2], [0.001, w / 2 + 0.02]], segs, [0, 0, 0], mir);
    return b.build();
  }
  const face = w / 2;
  if (o.whitewall) b.latheX('white', [[rim + 0.03, face + 0.006], [R - 0.06, face + 0.006]], segs, [0, 0, 0], mir);
  if (style === 'fullcover' || style === 'wire') {
    b.latheX('chrome', [[rim, face - 0.005], [rim * 0.92, face + 0.012], [rim * 0.7, face + 0.02], [rim * 0.45, face + 0.035], [rim * 0.2, face + 0.04], [0.001, face + 0.045]], segs, [0, 0, 0], mir);
  } else if (style === 'hubcap' || style === 'dogdish') {
    b.latheX('trim', [[rim, face - 0.005], [rim * 0.9, face + 0.004], [rim * 0.55, face + 0.012], [0.001, face + 0.012]], segs, [0, 0, 0], mir);
    const cr = style === 'dogdish' ? rim * 0.5 : rim * 0.72;
    b.latheX('chrome', [[cr, face + 0.012], [cr * 0.8, face + 0.03], [cr * 0.3, face + 0.04], [0.001, face + 0.041]], segs, [0, 0, 0], mir);
  } else { // truck steel: deep dish with a hub
    b.latheX('trim', [[rim, face - 0.01], [rim * 0.85, face - 0.04], [rim * 0.5, face - 0.05], [rim * 0.35, face - 0.02], [rim * 0.2, face + 0.03], [0.001, face + 0.04]], segs, [0, 0, 0], mir);
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
