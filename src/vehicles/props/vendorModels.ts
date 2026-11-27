import * as THREE from 'three/webgpu';
import { GeoBuilder, type V3 } from '../gen/builder';

/**
 * Street-vendor props (docs/briefs/STREET_VENDORS.md): pushcarts, stands, the news kiosk and the
 * peddlers' cases. Generated like the cars (one grouped geometry per LOD, car material slots), so
 * they share the vehicle materials, CC0 textures, grime, LOD crossfade and contact shadows.
 *
 * Local frame: length along z (push handle at +z), width along x, the customer side is +x, the
 * vendor stands at -x, ground at y = 0. All brands are invented (see VENDOR_BRANDS).
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

/** Invented brand copy per prop, picked by sim's `variant` (Narrative can replace these). */
export const VENDOR_BRANDS: Record<VendorPropId, string[][]> = {
  cart_hot_dog: [['PAPPAS', 'FRANKS · SODA'], ['KATZBERG\'S', 'HOT DOGS 35¢'], ['FIORELLI', 'FRANKS & KNISHES']],
  cart_pretzel: [['HOT PRETZELS', '15¢ · 2 FOR 25¢'], ['KNISHES', 'POTATO · KASHA'], ['ZUCKERMAN', 'PRETZELS']],
  cart_ices: [['NONNA ROSA', 'ITALIAN ICES'], ['LEMON ICE', 'CHERRY · LEMON 20¢'], ['MARINO\'S', 'ICES']],
  cart_nuts: [['HOT NUTS', 'CASHEWS · PEANUTS'], ['ROASTED', 'NUTS 25¢'], ['CHESTNUTS', 'HOT']],
  cart_coffee: [['COFFEE & ROLL', '30¢'], ['DANNY\'S', 'COFFEE · DANISH'], ['HOT COFFEE', 'BUTTERED ROLLS']],
  stand_fruit: [['FRESH FRUIT', ''], ['ESPOSITO', 'FRUIT & VEG'], ['PRODUCE', '']],
  stand_flowers: [['FLOWERS', ''], ['KIM\'S', 'FLOWERS'], ['FRESH CUT', 'FLOWERS']],
  stand_news: [['NEWS', 'PAPERS · MAGAZINES'], ['NEWS · CIGARS', ''], ['PAPERS', 'CANDY · SMOKES']],
  stand_shoeshine: [['SHINE 50¢', ''], ['SHOE SHINE', ''], ['SHINE', '']],
  peddler_case: [['', '']],
  monte_box: [['', '']],
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
function umbrella(b: GeoBuilder, x: number, z: number, y0: number, top: number, r: number, lod: 0 | 1) {
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
    b.grid(rows, k % 2 ? 'white' : 'vinyl', { facing: [0, 1, 0], smooth: false });
    b.grid(rows, k % 2 ? 'white' : 'vinyl', { facing: [0, -1, 0], smooth: false }); // underside (seen from below)
    // valance flap
    const va: V3[] = [[x + Math.cos(a0) * r, top - 0.38, z + Math.sin(a0) * r], [x + Math.cos(a1) * r, top - 0.38, z + Math.sin(a1) * r]];
    b.grid([va, va.map((p) => [p[0], p[1] - 0.14, p[2]] as V3)], k % 2 ? 'vinyl' : 'white', { facing: [Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2)], smooth: false });
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

/** Build a prop at a detail level. Returns the grouped geometry (car SLOTS order). */
export function buildVendorProp(spec: VendorPropSpec, lod: 0 | 1, open = true, withUmbrella = true): THREE.BufferGeometry {
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
      if (withUmbrella) umbrella(b, -w / 2 + 0.08, 0, h, 2.3, 1.05, lod);
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
      if (withUmbrella) umbrella(b, -w / 2 + 0.07, 0.1, h, 2.1, 0.8, lod);
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
      // wooden frame with three slanted tiers of crates facing the customer side, an awning
      for (const [x, z] of [[-w / 2 + 0.04, -l / 2 + 0.04], [-w / 2 + 0.04, l / 2 - 0.04], [w / 2 - 0.04, -l / 2 + 0.04], [w / 2 - 0.04, l / 2 - 0.04]] as const) b.box('wood', x, 0.45, z, 0.05, 0.9, 0.05);
      for (let t = 0; t < 3; t++) {
        const x = w / 2 - 0.18 - t * 0.3, y = 0.55 + t * 0.2;
        for (let k = 0; k < 4; k++) {
          const z = -l / 2 + 0.25 + k * ((l - 0.5) / 3);
          b.box('wood', x, y, z, 0.32, 0.12, 0.42, 0, 0, -0.25);
          b.box(k % 2 ? 'taillamp' : 'indicator', x, y + 0.07, z, 0.28, 0.04, 0.38, 0, 0, -0.25); // the fruit bed (colour from the crate)
        }
      }
      awning(b, w, l, 1.95, 1.7, 0.35);
      break;
    }
    case 'stand_flowers': {
      // stepped green bench with galvanised buckets, bunches as coloured cones
      for (let t = 0; t < 3; t++) b.box('paint', w / 2 - 0.15 - t * 0.27, 0.25 + t * 0.22, 0, 0.27, 0.5 + t * 0.44, l);
      for (let t = 0; t < 3; t++) for (let k = 0; k < 5; k++) {
        const x = w / 2 - 0.15 - t * 0.27, y = 0.5 + t * 0.44, z = -l / 2 + 0.18 + k * ((l - 0.36) / 4);
        b.add('chrome', new THREE.CylinderGeometry(0.11, 0.09, 0.24, lod === 0 ? 12 : 6), new THREE.Matrix4().makeTranslation(x, y + 0.12, z));
        if (lod === 0) b.add((t + k) % 3 === 0 ? 'taillamp' : (t + k) % 3 === 1 ? 'white' : 'indicator', new THREE.SphereGeometry(0.12, 8, 5), new THREE.Matrix4().makeTranslation(x, y + 0.36, z));
      }
      awning(b, w, l, 1.85, 1.65, 0.25);
      break;
    }
    case 'stand_news': {
      // kiosk: wooden box with a deep roof overhang, an open front counter, magazine racks
      b.box('paint', -0.1, 1.0, 0, w - 0.2, 2.0, l);
      b.box('paint2', -0.05, 2.12, 0, w + 0.15, 0.1, l + 0.2); // roof
      b.box('interior', w / 2 - 0.12, 1.45, 0, 0.02, 0.8, l - 0.3); // dark opening
      b.box('wood', w / 2 - 0.05, 0.9, 0, 0.35, 0.06, l - 0.1); // counter
      for (let k = 0; k < 6; k++) for (let r = 0; r < 3; r++) {
        const z = -l / 2 + 0.2 + k * ((l - 0.4) / 5), y = 1.2 + r * 0.25;
        b.box(['taillamp', 'indicator', 'white', 'paint2', 'reverse', 'headlamp'][(k + r) % 6] as never, w / 2 - 0.1, y, z, 0.01, 0.2, 0.16);
      }
      for (let k = 0; k < 4; k++) b.box('white', w / 2 + 0.02, 0.97 + k * 0.012, -0.5 + k * 0.32, 0.25, 0.04, 0.3);
      break;
    }
    case 'stand_shoeshine': {
      // wooden box with drawers, a raised armchair on top, two brass footrests in front
      b.box('wood', 0, 0.3, 0, w, 0.6, l);
      for (const y of [0.15, 0.42]) b.box('chrome', w / 2 + 0.003, y, 0, 0.01, 0.02, 0.18);
      b.box('seat', -0.1, 0.72, 0, 0.5, 0.1, 0.6);
      b.box('seat', -0.33, 1.0, 0, 0.08, 0.55, 0.6);
      for (const sz of [-1, 1]) b.box('wood', -0.1, 0.86, sz * 0.3, 0.45, 0.06, 0.06);
      for (const sz of [-1, 1]) {
        b.box('chrome', w / 2 + 0.1, 0.48, sz * 0.14, 0.24, 0.02, 0.1);
        b.box('chrome', w / 2 + 0.02, 0.3, sz * 0.14, 0.03, 0.36, 0.03);
      }
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
