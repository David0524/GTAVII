import * as THREE from 'three/webgpu';
import { GeoBuilder, type V3, type Slot } from '../gen/builder';

/**
 * Street-vendor props (docs/briefs/STREET_VENDORS.md): pushcarts, stands, the news kiosk and the
 * peddlers' cases. Generated like the cars (one grouped geometry per LOD, car material slots), so
 * they share the vehicle materials, CC0 textures, grime, LOD crossfade and contact shadows.
 *
 * Local frame: length along z (push handle at +z), width along x, the customer side is +x, the
 * vendor stands at -x, ground at y = 0. All brands are invented (Narrative's content/vendors.json, see brands.ts).
 */
export type VendorPropId = 'cart_hot_dog' | 'cart_pretzel' | 'cart_ices' | 'cart_nuts' | 'cart_coffee'
  | 'stand_fruit' | 'stand_flowers' | 'stand_news' | 'stand_shoeshine' | 'peddler_case' | 'monte_box';

export type GoodsKind = 'frank' | 'can' | 'pretzel' | 'cup' | 'cone' | 'roll' | 'apple' | 'orange' | 'lemon' | 'bunch' | 'paper' | 'tin' | 'watch' | 'card' | 'bottle';

export interface VendorPropSpec {
  id: VendorPropId;
  /** Footprint (m): width (x), length (z), height (y, without the umbrella). */
  w: number; l: number; h: number;
  mass: number;
  /** Rests on wheels (pushable, rolls) or on feet / the ground (slides, tips). */
  wheeled: boolean;
  /** Static: never becomes dynamic (the kiosk); only its goods spill. */
  fixed?: boolean;
  /** Paint colours (sRGB): body, accent. */
  paint: number[]; paint2: number;
  /** Canvas colour (umbrella / awning stripes alternate with white). */
  canvas: number[];
  /** Goods that spill: kind, count, where they sit (local), spread. */
  goods: { kind: GoodsKind; n: number; at: V3; spread: [number, number] }[];
  /** Where the brand panel goes (local position, outward normal, size). */
  panel?: { pos: V3; normal: V3; w: number; h: number };
}

const S = (o: VendorPropSpec) => o;
export const VENDOR_SPECS: Record<VendorPropId, VendorPropSpec> = {
  cart_hot_dog: S({ id: 'cart_hot_dog', w: 0.8, l: 1.5, h: 1.0, mass: 140, wheeled: true, paint: [0xd8d6cf], paint2: 0xb8262a, canvas: [0x1f5fa8, 0xc8382c, 0xe0a020], goods: [{ kind: 'frank', n: 8, at: [0, 0.98, -0.2], spread: [0.25, 0.3] }, { kind: 'can', n: 6, at: [0.15, 0.98, 0.35], spread: [0.15, 0.15] }], panel: { pos: [0.405, 0.62, -0.05], normal: [1, 0, 0], w: 1.0, h: 0.34 } }),
  cart_pretzel: S({ id: 'cart_pretzel', w: 0.75, l: 1.3, h: 1.1, mass: 110, wheeled: true, paint: [0x2f5a3a, 0x8a2b20], paint2: 0xd9b25a, canvas: [0x2f5a3a], goods: [{ kind: 'pretzel', n: 10, at: [0, 1.05, -0.05], spread: [0.22, 0.3] }], panel: { pos: [0.38, 0.55, -0.05], normal: [1, 0, 0], w: 0.9, h: 0.3 } }),
  cart_ices: S({ id: 'cart_ices', w: 0.7, l: 1.2, h: 1.0, mass: 100, wheeled: true, paint: [0xeeeae0], paint2: 0x2a7fb8, canvas: [0x2a7fb8, 0xd03a58], goods: [{ kind: 'cup', n: 10, at: [0.1, 1.02, 0.2], spread: [0.2, 0.2] }, { kind: 'bottle', n: 3, at: [-0.1, 1.08, -0.3], spread: [0.15, 0.08] }], panel: { pos: [0.355, 0.55, -0.05], normal: [1, 0, 0], w: 0.85, h: 0.3 } }),
  cart_nuts: S({ id: 'cart_nuts', w: 0.7, l: 1.1, h: 1.1, mass: 95, wheeled: true, paint: [0x7a2a1a, 0x2c3e2a], paint2: 0xc89a3a, canvas: [0x7a2a1a], goods: [{ kind: 'cone', n: 10, at: [0.12, 1.02, 0.25], spread: [0.15, 0.15] }], panel: { pos: [0.355, 0.55, -0.05], normal: [1, 0, 0], w: 0.8, h: 0.28 } }),
  cart_coffee: S({ id: 'cart_coffee', w: 0.8, l: 1.4, h: 1.0, mass: 120, wheeled: true, paint: [0x3a4a5c, 0xa8a49a], paint2: 0xc23a1e, canvas: [0x3a4a5c], goods: [{ kind: 'cup', n: 8, at: [0.15, 1.02, 0.25], spread: [0.15, 0.2] }, { kind: 'roll', n: 8, at: [0.1, 1.0, -0.3], spread: [0.2, 0.15] }], panel: { pos: [0.405, 0.6, -0.05], normal: [1, 0, 0], w: 0.95, h: 0.3 } }),
  stand_fruit: S({ id: 'stand_fruit', w: 1.0, l: 2.0, h: 1.1, mass: 160, wheeled: false, paint: [0x6a4a2a], paint2: 0x2f6a3a, canvas: [0x2f6a3a, 0xc8382c], goods: [{ kind: 'apple', n: 12, at: [0.15, 0.95, -0.6], spread: [0.3, 0.3] }, { kind: 'orange', n: 12, at: [0.15, 0.95, 0.0], spread: [0.3, 0.3] }, { kind: 'lemon', n: 8, at: [0.15, 0.95, 0.6], spread: [0.3, 0.3] }], panel: { pos: [0.52, 1.95, 0], normal: [1, 0, 0], w: 1.6, h: 0.22 } }),
  stand_flowers: S({ id: 'stand_flowers', w: 0.9, l: 1.6, h: 1.2, mass: 90, wheeled: false, paint: [0x4a5a4a], paint2: 0xd8d4c8, canvas: [0x6a3a6a, 0x2f6a3a], goods: [{ kind: 'bunch', n: 12, at: [0.1, 1.0, 0], spread: [0.3, 0.6] }], panel: { pos: [0.47, 1.9, 0], normal: [1, 0, 0], w: 1.3, h: 0.2 } }),
  stand_news: S({ id: 'stand_news', w: 1.2, l: 2.2, h: 2.2, mass: 900, wheeled: false, fixed: true, paint: [0x2a4a3a, 0x5a3a2a], paint2: 0xd8c890, canvas: [0x2a4a3a], goods: [{ kind: 'paper', n: 14, at: [0.75, 0.95, 0], spread: [0.15, 0.8] }], panel: { pos: [0.62, 2.05, 0], normal: [1, 0, 0], w: 1.9, h: 0.26 } }),
  stand_shoeshine: S({ id: 'stand_shoeshine', w: 0.9, l: 1.0, h: 1.3, mass: 70, wheeled: false, paint: [0x4a2a1a], paint2: 0xb08a4a, canvas: [0x4a2a1a], goods: [{ kind: 'tin', n: 6, at: [-0.15, 0.5, 0.35], spread: [0.15, 0.1] }], panel: { pos: [0.455, 0.3, 0], normal: [1, 0, 0], w: 0.7, h: 0.18 } }),
  peddler_case: S({ id: 'peddler_case', w: 0.6, l: 0.45, h: 0.9, mass: 12, wheeled: false, paint: [0x2a2420], paint2: 0x8a1a1a, canvas: [0x2a2420], goods: [{ kind: 'watch', n: 12, at: [0, 0.88, 0], spread: [0.22, 0.15] }] }),
  monte_box: S({ id: 'monte_box', w: 0.5, l: 0.4, h: 0.75, mass: 4, wheeled: false, paint: [0x9a7a52], paint2: 0x6a5232, canvas: [0x9a7a52], goods: [{ kind: 'card', n: 3, at: [0, 0.76, 0], spread: [0.1, 0.06] }] }),
};

// ------------------------------------------------------------------ helpers
function wheel(b: GeoBuilder, x: number, y: number, z: number, r: number, w: number, spokes: number, lod: 0 | 1) {
  const segs = lod === 0 ? 24 : 8;
  b.latheX('rubber', [[r * 0.82, -w / 2], [r, -w / 3], [r, w / 3], [r * 0.82, w / 2]], segs, [x, y, z], false, 0);
  b.latheX('trim', [[r * 0.82, w * 0.3], [r * 0.15, w * 0.45], [0.001, w * 0.5]], segs, [x, y, z], false, 0);
  b.latheX('trim', [[r * 0.82, -w * 0.3], [r * 0.15, -w * 0.45], [0.001, -w * 0.5]], segs, [x, y, z], false, 0);
  if (lod === 0) for (let k = 0; k < spokes; k++) {
    const t = (k / spokes) * Math.PI;
    b.box('chrome', x, y, z, 0.012, r * 1.6, 0.012, 0, t);
  }
}
/** Rounded stainless box: a box with chamfered vertical edges (8-sided plan). */
function body(b: GeoBuilder, slot: Parameters<GeoBuilder['box']>[0], cx: number, y0: number, y1: number, cz: number, w: number, l: number, ch = 0.04) {
  const ring = (y: number): V3[] => {
    const hx = w / 2, hz = l / 2;
    return [[hx - ch, y, -hz], [hx, y, -hz + ch], [hx, y, hz - ch], [hx - ch, y, hz], [-hx + ch, y, hz], [-hx, y, hz - ch], [-hx, y, -hz + ch], [-hx + ch, y, -hz]]
      .map(([x, yy, z]) => [x + cx, yy, z + cz] as V3);
  };
  b.grid([ring(y0), ring(y1)], slot, { closeJ: true, inside: [cx, (y0 + y1) / 2, cz], smooth: false });
  b.cap(ring(y1), slot, [0, 1, 0]);
  b.cap(ring(y0), 'under', [0, -1, 0]);
}
function handle(b: GeoBuilder, w: number, z: number, y: number) {
  b.tubePath('chrome', [[-w / 2 + 0.05, y - 0.15, z - 0.12], [-w / 2 + 0.05, y, z + 0.05], [w / 2 - 0.05, y, z + 0.05], [w / 2 - 0.05, y - 0.15, z - 0.12]], 0.014, 8);
}
/** Market umbrella: pole, 8 ribs, a striped canopy (alternating slots) with a scalloped valance. */
function umbrella(b: GeoBuilder, x: number, z: number, y0: number, top: number, r: number, lod: 0 | 1, slots: Slot[] = ['vinyl', 'white']) {
  b.tubePath('chrome', [[x, y0, z], [x, top + 0.08, z]], 0.017, 8);
  const n = 8, rings = lod === 0 ? 4 : 2;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const rows: V3[][] = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings, rr = r * t, yy = top - 0.38 * t * t;
      const row: V3[] = [];
      for (let j = 0; j <= (lod === 0 ? 3 : 1); j++) { const a = a0 + ((a1 - a0) * j) / (lod === 0 ? 3 : 1); row.push([x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr]); }
      rows.push(row);
    }
    const sl = slots[k % slots.length], sl2 = slots[(k + 1) % slots.length];
    b.grid(rows, sl, { facing: [0, 1, 0], smooth: false });
    b.grid(rows, sl, { facing: [0, -1, 0], smooth: false }); // underside (seen from below)
    // valance flap
    const va: V3[] = [[x + Math.cos(a0) * r, top - 0.38, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, top - 0.38, z + Math.sin(a1) * r]];
    b.grid([va, va.map((p) => [p[0], p[1] - 0.14, p[2]] as V3)], sl2, { facing: [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], smooth: false });
    if (lod === 0) b.tubePath('chrome', [[x, top - 0.04, z], [x + Math.cos(a0) * r, top - 0.4, z + Math.sin(a0) * r]], 0.006, 4);
  }
}
/** Sloped canvas awning on two front posts (stands). */
function awning(b: GeoBuilder, w: number, l: number, yBack: number, yFront: number, reach: number) {
  const n = 8;
  for (let k = 0; k < n; k++) {
    const z0 = -l / 2 + (l * k) / n, z1 = -l / 2 + (l * (k + 1)) / n;
    const rows: V3[][] = [[[-w / 2, yBack, z0], [-w / 2, yBack, z1]], [[w / 2 + reach, yFront, z0], [w / 2 + reach, yFront, z1]]];
    b.grid(rows, k % 2 ? 'white' : 'vinyl', { facing: [0.3, 1, 0], smooth: false });
    b.grid(rows, k % 2 ? 'white' : 'vinyl', { facing: [-0.3, -1, 0], smooth: false });
    b.box(k % 2 ? 'vinyl' : 'white', w / 2 + reach, yFront - 0.08, (z0 + z1) / 2, 0.01, 0.16, z1 - z0);
  }
  for (const z of [-l / 2 + 0.05, l / 2 - 0.05]) b.tubePath('chrome', [[w / 2 + reach - 0.03, 0, z], [w / 2 + reach - 0.03, yFront, z]], 0.018, 6);
}

/** Slatted produce crate (open top), tilted toward the customer (rotation about z). */
function crate(b: GeoBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, tilt: number, lod: 0 | 1) {
  const slats = lod === 0 ? 3 : 1, gap = sy / (slats * 2);
  b.box('wood', x, y - sy / 2 + 0.008, z, sx, 0.016, sz, 0, 0, tilt);
  for (let k = 0; k < slats; k++) {
    const yy = y - sy / 2 + gap + k * 2 * gap;
    for (const sgn of [-1, 1]) {
      b.box('wood', x, yy, z + sgn * (sz / 2 - 0.008), sx, gap * 1.1, 0.016, 0, 0, tilt);
      b.box('wood', x + sgn * (sx / 2 - 0.008), yy, z, 0.016, gap * 1.1, sz, 0, 0, tilt);
    }
  }
  for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) b.box('wood', x + sx2 * (sx / 2 - 0.015), y, z + sz2 * (sz / 2 - 0.015), 0.03, sy, 0.03, 0, 0, tilt);
}
/** A heap of round produce (low-poly spheres) filling a crate. */
function heap(b: GeoBuilder, slot: Slot, x: number, y: number, z: number, hx: number, hz: number, tilt: number, n: number, r: number) {
  if (n === 0) { b.box(slot, x, y, z, hx * 2, 0.06, hz * 2, 0, 0, tilt); return; }
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < n * 2; i++) {
    const u = ((i * 0.618) % 1) * 2 - 1, v = ((i * 0.382 + 0.17) % 1) * 2 - 1, lift = (i % 3) * r * 0.6;
    const lx = u * hx, ly = lift;
    b.add(slot, new THREE.SphereGeometry(r, 7, 5), new THREE.Matrix4().makeTranslation(x + lx * ct - ly * st, y + lx * st + ly * ct, z + v * hz));
  }
}

/** Build a prop at a detail level. Returns the grouped geometry (car SLOTS order). */
/** Umbrella stripe slots by colour count: 1 colour + white, 2 colours, or 3 (colour, white, colour). */
export const stripeSlots = (n: number): Slot[] => (n >= 3 ? ['vinyl', 'white', 'roof'] : n === 2 ? ['vinyl', 'roof'] : ['vinyl', 'white']);
export function buildVendorProp(spec: VendorPropSpec, lod: 0 | 1, open = true, withUmbrella = true, stripeCount = 1): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const { w, l, h } = spec;
  switch (spec.id) {
    case 'cart_hot_dog': {
      body(b, 'chrome', 0, 0.38, h - 0.06, 0, w, l);
      b.box('paint2', 0, 0.42, 0, w + 0.01, 0.06, l + 0.01); // red kick band
      // steam table: hinged lids (open: tilted up), wells, condiment bottles
      for (const [k, z] of [[0, -0.35], [1, 0.05]] as const) {
        if (open) b.box('chrome', -0.05, h + 0.06, z - 0.14, 0.6, 0.01, 0.3, 0, -1.1); else b.box('chrome', 0, h - 0.04, z, 0.62, 0.02, 0.34);
        b.box('under', 0, h - 0.055, z, 0.56, 0.01, 0.3); void k;
      }
      for (const [x, c] of [[0.2, 'paint2'], [0.28, 'headlamp']] as const) b.add(c === 'paint2' ? 'paint2' : 'indicator', new THREE.CylinderGeometry(0.03, 0.03, 0.18, lod === 0 ? 10 : 5), new THREE.Matrix4().makeTranslation(x, h + 0.03, 0.42));
      wheel(b, 0, 0.3, -l / 2 + 0.3, 0.3, 0.05, 12, lod);
      for (const sx of [-1, 1]) b.box('trim', sx * (w / 2 - 0.06), 0.19, l / 2 - 0.15, 0.04, 0.38, 0.04);
      handle(b, w, l / 2, 0.95);
      if (withUmbrella) umbrella(b, -w / 2 + 0.08, 0, h, 2.3, 1.05, lod, stripeSlots(stripeCount));
      break;
    }
    case 'cart_pretzel': {
      body(b, 'paint', 0, 0.35, 0.85, 0, w, l);
      b.box('chrome', 0, 0.86, 0, w + 0.02, 0.02, l + 0.02);
      // glass display case with a chrome frame
      b.box('glass', 0, 0.98, -0.05, w - 0.1, 0.22, l - 0.25);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('chrome', sx * (w / 2 - 0.05), 0.98, -0.05 + sz * (l / 2 - 0.125), 0.02, 0.24, 0.02);
      b.box('chrome', 0, 1.1, -0.05, w - 0.08, 0.015, l - 0.23);
      wheel(b, 0, 0.32, -l / 2 + 0.3, 0.32, 0.05, 12, lod);
      for (const sx of [-1, 1]) b.box('trim', sx * (w / 2 - 0.06), 0.18, l / 2 - 0.15, 0.04, 0.36, 0.04);
      handle(b, w, l / 2, 0.92);
      break;
    }
    case 'cart_ices': {
      body(b, 'paint', 0, 0.3, h - 0.05, 0, w, l, 0.06);
      b.box('paint2', 0, h - 0.25, 0, w + 0.01, 0.08, l + 0.01);
      for (const z of [-0.25, 0.15]) b.add('chrome', new THREE.CylinderGeometry(0.17, 0.17, 0.03, lod === 0 ? 20 : 8), new THREE.Matrix4().makeTranslation(0, h - 0.035, z)); // tub lids
      for (const [x, c] of [[-0.18, 'taillamp'], [-0.1, 'indicator'], [-0.02, 'paint2']] as const) b.add(c, new THREE.CylinderGeometry(0.03, 0.03, 0.2, lod === 0 ? 10 : 5), new THREE.Matrix4().makeTranslation(x, h + 0.08, -0.45));
      wheel(b, 0, 0.27, -l / 2 + 0.28, 0.27, 0.05, 10, lod);
      for (const sx of [-1, 1]) b.box('trim', sx * (w / 2 - 0.06), 0.15, l / 2 - 0.14, 0.04, 0.3, 0.04);
      handle(b, w, l / 2, 0.92);
      if (withUmbrella) umbrella(b, -w / 2 + 0.07, 0.1, h, 2.1, 0.8, lod, stripeSlots(stripeCount));
      break;
    }
    case 'cart_nuts': {
      body(b, 'paint', 0, 0.32, 0.88, 0, w, l);
      b.box('chrome', 0, 0.89, 0, w + 0.02, 0.02, l + 0.02);
      // brass roaster drum with a chimney, glowing coal tray below
      b.add('wood', new THREE.CylinderGeometry(0.17, 0.17, 0.42, lod === 0 ? 20 : 8).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 1.08, -0.2));
      b.add('chrome', new THREE.TorusGeometry(0.175, 0.012, 6, lod === 0 ? 20 : 8).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.21, 1.08, -0.2));
      b.add('chrome', new THREE.TorusGeometry(0.175, 0.012, 6, lod === 0 ? 20 : 8).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(-0.21, 1.08, -0.2));
      b.add('trim', new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), new THREE.Matrix4().makeTranslation(-0.2, 1.4, -0.38));
      b.box('taillamp', 0, 0.9, -0.2, 0.3, 0.02, 0.25);
      wheel(b, 0, 0.3, -l / 2 + 0.28, 0.3, 0.05, 10, lod);
      for (const sx of [-1, 1]) b.box('trim', sx * (w / 2 - 0.06), 0.16, l / 2 - 0.14, 0.04, 0.32, 0.04);
      handle(b, w, l / 2, 0.92);
      break;
    }
    case 'cart_coffee': {
      body(b, 'paint', 0, 0.35, h - 0.05, 0, w, l);
      b.box('chrome', 0, h - 0.04, 0, w + 0.02, 0.02, l + 0.02);
      // two coffee urns with spigots, a roll tray under a glass hood, a cup stack
      for (const z of [-0.42, -0.12]) {
        b.add('chrome', new THREE.CylinderGeometry(0.12, 0.13, 0.4, lod === 0 ? 20 : 8), new THREE.Matrix4().makeTranslation(-0.12, h + 0.2, z));
        b.add('trim', new THREE.SphereGeometry(0.035, 8, 4), new THREE.Matrix4().makeTranslation(-0.12, h + 0.42, z));
        b.box('trim', 0.0, h + 0.06, z, 0.05, 0.03, 0.03);
      }
      b.box('glass', 0.12, h + 0.08, 0.3, 0.4, 0.14, 0.5);
      wheel(b, 0, 0.3, -l / 2 + 0.3, 0.3, 0.05, 12, lod);
      for (const sx of [-1, 1]) b.box('trim', sx * (w / 2 - 0.06), 0.18, l / 2 - 0.15, 0.04, 0.36, 0.04);
      handle(b, w, l / 2, 0.95);
      break;
    }
    case 'stand_fruit': {
      // timber rack: four legs and rails, three stepped tiers of slatted crates heaped with fruit,
      // a chalkboard price sign, and a striped awning on two poles
      for (const [x, z] of [[-w / 2 + 0.04, -l / 2 + 0.04], [-w / 2 + 0.04, l / 2 - 0.04], [w / 2 - 0.04, -l / 2 + 0.04], [w / 2 - 0.04, l / 2 - 0.04]] as const) b.box('wood', x, 0.45, z, 0.05, 0.9, 0.05);
      for (const y of [0.18, 0.5]) for (const sx of [-1, 1]) b.box('wood', sx * (w / 2 - 0.04), y, 0, 0.04, 0.04, l - 0.08);
      const fruitSlots = ['taillamp', 'indicator', 'paint2', 'taillamp'] as const;
      for (let t = 0; t < 3; t++) {
        const x = w / 2 - 0.2 - t * 0.28, y = 0.58 + t * 0.2;
        for (let k = 0; k < 4; k++) {
          const z = -l / 2 + 0.25 + k * ((l - 0.5) / 3);
          crate(b, x, y, z, 0.34, 0.14, 0.44, -0.22, lod);
          heap(b, fruitSlots[(k + t) % 4], x, y + 0.08, z, 0.15, 0.2, -0.22, lod === 0 ? 9 : 0, 0.04 + ((k + t) % 2) * 0.006);
        }
      }
      b.box('trim', w / 2 + 0.02, 0.32, 0, 0.02, 0.3, 0.5); // chalkboard
      b.box('wood', w / 2 + 0.03, 0.32, 0, 0.01, 0.34, 0.54);
      awning(b, w, l, 1.95, 1.7, 0.35);
      break;
    }
    case 'stand_flowers': {
      // slatted green step bench with galvanised buckets (rolled rims), bunches of mixed colours in paper cones
      for (let t = 0; t < 3; t++) {
        const x = w / 2 - 0.15 - t * 0.27, top = 0.5 + t * 0.44;
        for (let k = 0; k < 4; k++) b.box('paint', x - 0.1 + k * 0.067, top - 0.015, 0, 0.055, 0.03, l); // slats
        for (const sz of [-1, 1]) b.box('paint', x, top / 2, sz * (l / 2 - 0.03), 0.25, top, 0.04);
      }
      for (let t = 0; t < 3; t++) for (let k = 0; k < 5; k++) {
        const x = w / 2 - 0.15 - t * 0.27, y = 0.5 + t * 0.44, z = -l / 2 + 0.18 + k * ((l - 0.36) / 4);
        b.add('chrome', new THREE.CylinderGeometry(0.11, 0.09, 0.24, lod === 0 ? 14 : 6, 1, true), new THREE.Matrix4().makeTranslation(x, y + 0.12, z));
        b.add('chrome', new THREE.TorusGeometry(0.11, 0.008, 4, lod === 0 ? 14 : 6).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + 0.24, z));
        b.add('under', new THREE.CircleGeometry(0.1, lod === 0 ? 12 : 6).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y + 0.2, z));
        if (lod === 0) {
          b.add('white', new THREE.ConeGeometry(0.1, 0.22, 8, 1, true), new THREE.Matrix4().makeTranslation(x, y + 0.3, z)); // paper cone
          const cols = (['taillamp', 'white', 'indicator', 'paint2'] as const);
          for (let f = 0; f < 5; f++) {
            const a = (f / 5) * Math.PI * 2 + k;
            b.add(cols[(f + t + k) % 4], new THREE.SphereGeometry(0.045, 6, 4), new THREE.Matrix4().makeTranslation(x + Math.cos(a) * 0.05, y + 0.42 + (f % 2) * 0.04, z + Math.sin(a) * 0.05));
          }
        }
      }
      awning(b, w, l, 1.85, 1.65, 0.25);
      break;
    }
    case 'stand_news': {
      // kiosk: panelled wooden body with a roof cornice and a raised shutter, slanted magazine racks
      // on the front, stacked papers on the counter, posters on the sides
      b.box('paint', -0.1, 1.0, 0, w - 0.2, 2.0, l);
      for (let k = 0; k < 4; k++) for (const sz of [-1, 1]) b.box('paint2', -0.1 + (k - 1.5) * 0.24, 0.45, sz * (l / 2 + 0.004), 0.2, 0.6, 0.01); // panel mouldings
      b.box('paint2', -0.05, 2.12, 0, w + 0.15, 0.1, l + 0.2); // roof
      b.box('paint', -0.05, 2.2, 0, w + 0.05, 0.06, l + 0.1);
      b.box('paint', w / 2 + 0.05, 1.95, 0, 0.5, 0.03, l - 0.1, 0, 0, -0.35); // raised shutter
      for (const sz of [-1, 1]) b.box('chrome', w / 2 + 0.2, 1.75, sz * (l / 2 - 0.1), 0.02, 0.45, 0.02, 0, 0, 0.5); // shutter props
      b.box('interior', w / 2 - 0.12, 1.45, 0, 0.02, 0.8, l - 0.3); // dark opening
      b.box('wood', w / 2 - 0.05, 0.9, 0, 0.35, 0.06, l - 0.1); // counter
      const covers = ['taillamp', 'indicator', 'white', 'paint2', 'reverse', 'headlamp'] as const;
      for (let r = 0; r < 3; r++) {
        const x = w / 2 + 0.05 + r * 0.08, y = 0.25 + r * 0.2;
        b.box('wood', x, y - 0.06, 0, 0.12, 0.02, l - 0.2, 0, 0, 0.5); // slanted shelf
        for (let k = 0; k < 9; k++) b.box(covers[(k + r * 2) % 6], x - 0.02, y + 0.04, -l / 2 + 0.2 + k * ((l - 0.4) / 8), 0.01, 0.2, 0.15, 0, 0, 0.5);
      }
      for (let k = 0; k < 4; k++) for (let n = 0; n < (lod === 0 ? 6 : 1); n++) b.box(n % 2 ? 'white' : 'headlamp', w / 2 + 0.02, 0.945 + n * 0.012, -0.55 + k * 0.36, 0.26, 0.011, 0.32, 0.03 * n);
      for (const sz of [-1, 1]) b.box(covers[sz > 0 ? 3 : 0], -0.1, 1.5, sz * (l / 2 + 0.006), 0.5, 0.7, 0.01); // posters
      break;
    }
    case 'stand_shoeshine': {
      // wooden box with two drawers (brass pulls), a raised upholstered chair with armrests,
      // chrome footrests on posts, polish tins and a brush on the step
      b.box('wood', 0, 0.3, 0, w, 0.6, l);
      b.box('wood', 0, 0.61, 0, w + 0.03, 0.03, l + 0.03);
      for (const y of [0.15, 0.42]) {
        b.box('wood', w / 2 + 0.004, y, 0, 0.01, 0.22, l - 0.12);
        b.box('chrome', w / 2 + 0.014, y, 0, 0.01, 0.025, 0.16);
      }
      b.box('wood', -0.12, 0.66, 0, 0.55, 0.08, 0.66);
      b.box('seat', -0.1, 0.74, 0, 0.5, 0.08, 0.58);
      b.box('seat', -0.33, 1.02, 0, 0.07, 0.52, 0.58);
      b.box('wood', -0.37, 1.02, 0, 0.03, 0.62, 0.64);
      for (const sz of [-1, 1]) { b.box('wood', -0.1, 0.92, sz * 0.31, 0.46, 0.05, 0.06); b.box('wood', 0.1, 0.83, sz * 0.31, 0.04, 0.14, 0.04); }
      for (const sz of [-1, 1]) {
        b.box('chrome', w / 2 + 0.12, 0.5, sz * 0.14, 0.26, 0.02, 0.11); // sole plate
        b.box('chrome', w / 2 + 0.22, 0.52, sz * 0.14, 0.02, 0.05, 0.11); // heel stop
        b.box('chrome', w / 2 + 0.02, 0.32, sz * 0.14, 0.03, 0.36, 0.03);
      }
      if (lod === 0) for (let k = 0; k < 3; k++) b.add(k % 2 ? 'paint2' : 'trim', new THREE.CylinderGeometry(0.035, 0.035, 0.025, 10), new THREE.Matrix4().makeTranslation(w / 2 - 0.12, 0.635, -0.3 + k * 0.08));
      break;
    }
    case 'peddler_case': {
      // open attaché case on a folding stand; red velvet lining
      for (const sx of [-1, 1]) b.tubePath('trim', [[sx * 0.22, 0, -0.18], [sx * 0.22, 0.8, 0.12]], 0.01, 4);
      for (const sx of [-1, 1]) b.tubePath('trim', [[sx * 0.22, 0, 0.18], [sx * 0.22, 0.8, -0.12]], 0.01, 4);
      b.box('paint', 0, 0.82, 0, 0.56, 0.06, 0.4);
      b.box('paint2', 0, 0.855, 0, 0.52, 0.01, 0.36);
      b.box('paint', 0, 1.0, -0.24, 0.56, 0.36, 0.05, 0, -0.35); // lid
      b.box('chrome', 0, 0.82, 0.205, 0.12, 0.03, 0.01);
      break;
    }
    case 'monte_box': {
      b.box('paint', 0, 0.36, 0, 0.5, 0.72, 0.4);
      b.box('paint2', 0, 0.725, 0, 0.5, 0.01, 0.4);
      break;
    }
  }
  return b.build();
}

/** Goods meshes (one small geometry per kind) and their spill collider half-extents. */
export const GOODS: Record<GoodsKind, { geo: () => THREE.BufferGeometry; color: number; half: [number, number, number]; mass: number }> = {
  frank: { geo: () => new THREE.CapsuleGeometry(0.022, 0.15, 3, 8).rotateX(Math.PI / 2), color: 0xd8b070, half: [0.03, 0.03, 0.1], mass: 0.15 },
  can: { geo: () => new THREE.CylinderGeometry(0.033, 0.033, 0.12, 10), color: 0xb02020, half: [0.033, 0.06, 0.033], mass: 0.37 },
  pretzel: { geo: () => new THREE.TorusGeometry(0.06, 0.018, 6, 12).rotateX(Math.PI / 2), color: 0x8a5222, half: [0.075, 0.02, 0.075], mass: 0.12 },
  cup: { geo: () => new THREE.CylinderGeometry(0.04, 0.03, 0.09, 10), color: 0xe8e4d8, half: [0.04, 0.045, 0.04], mass: 0.05 },
  cone: { geo: () => new THREE.ConeGeometry(0.04, 0.14, 8).rotateX(Math.PI), color: 0xd8c8a0, half: [0.04, 0.07, 0.04], mass: 0.08 },
  roll: { geo: () => new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.6, 1.2), color: 0xc8904a, half: [0.05, 0.03, 0.06], mass: 0.08 },
  apple: { geo: () => new THREE.SphereGeometry(0.04, 10, 7), color: 0xa81c1c, half: [0.04, 0.04, 0.04], mass: 0.18 },
  orange: { geo: () => new THREE.SphereGeometry(0.042, 10, 7), color: 0xe07818, half: [0.042, 0.042, 0.042], mass: 0.2 },
  lemon: { geo: () => new THREE.SphereGeometry(0.035, 10, 7).scale(1, 1, 1.3), color: 0xe0c828, half: [0.035, 0.035, 0.045], mass: 0.12 },
  bunch: { geo: () => new THREE.ConeGeometry(0.08, 0.35, 8).rotateX(Math.PI), color: 0xc83a6a, half: [0.07, 0.17, 0.07], mass: 0.3 },
  paper: { geo: () => new THREE.BoxGeometry(0.3, 0.02, 0.38), color: 0xd8d2c0, half: [0.15, 0.01, 0.19], mass: 0.25 },
  tin: { geo: () => new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10), color: 0x2a2018, half: [0.04, 0.015, 0.04], mass: 0.1 },
  watch: { geo: () => new THREE.CylinderGeometry(0.02, 0.02, 0.008, 10), color: 0xd8c070, half: [0.02, 0.006, 0.02], mass: 0.05 },
  card: { geo: () => new THREE.BoxGeometry(0.063, 0.003, 0.088), color: 0xf0ece0, half: [0.032, 0.003, 0.044], mass: 0.01 },
  bottle: { geo: () => new THREE.CylinderGeometry(0.03, 0.035, 0.2, 10), color: 0xd03a58, half: [0.035, 0.1, 0.035], mass: 0.5 },
};
