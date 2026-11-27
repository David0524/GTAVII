/**
 * Street-canyon acoustics at the listener, measured from the real footprints every ~100 ms.
 *
 * Rays fan out horizontally. Hits roughly perpendicular to the local street axis are the two
 * facades; hits along the axis are end walls (a building closing a T, the far side of a
 * square). From them:
 *  - early reflections: one tap per facade at 2d/c, scaled by how much of the vertical view
 *    the wall fills (atan(h/d)); between two strong parallel facades closer than ~30 m, the
 *    L-R-L flutter taps that give a narrow street its slapback;
 *  - late reverb: a Sabine estimate over the canyon segment, where the open sky and open
 *    ends count as fully absorbing area, so a tall narrow street rings and a park doesn't;
 *  - avenue intersections: wider, later and less dense (the "bigger room");
 *  - parks: open air, only distant facades.
 * Interiors replace all of this with a per-`kind` profile.
 */
import type { AcousticGeometry } from './geometry';
import type { ReverbParams } from '../core/mixer';

export interface CanyonState {
  kind: 'street' | 'avenue' | 'intersection' | 'park' | 'open';
  street: string;
  dL: number; dR: number; hL: number; hR: number; gL: number; gR: number;
  dF: number; dB: number; gF: number; gB: number;
  width: number; height: number; openness: number; rt60: number; wet: number; flutter: number;
  /** Unit street axis (x, z) at the listener. */
  ax: number; az: number;
}

const MAXD = 150;

export class CanyonAnalyzer {
  state: CanyonState = { kind: 'open', street: '', dL: 20, dR: 20, hL: 0, hR: 0, gL: 0, gR: 0, dF: MAXD, dB: MAXD, gF: 0, gB: 0, width: 40, height: 0, openness: 1, rt60: 0.5, wet: 0.05, flutter: 0, ax: 0, az: 1 };
  lastRays: { a: number; d: number; h: number }[] = [];
  constructor(private geo: AcousticGeometry, private rays: number) {}

  analyze(x: number, z: number): CanyonState {
    const g = this.geo;
    const ns = g.nearestStreet(x, z, 80);
    const ax = ns ? ns.dx : 0, az = ns ? ns.dz : 1;
    const side: { L: number[]; R: number[]; hL: number[]; hR: number[] } = { L: [], R: [], hL: [], hR: [] };
    let F = MAXD, B = MAXD, hF = 0, hB = 0, escaped = 0, sumH = 0, nh = 0;
    this.lastRays.length = 0;
    const N = this.rays;
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      // rotate by street axis so ray 0 points along the street
      const ca = Math.cos(a), sa = Math.sin(a);
      const dx = ax * ca - az * sa, dz = ax * sa + az * ca;
      const hit = g.raycast(x, z, dx, dz, MAXD);
      const d = hit ? hit.d : MAXD, h = hit ? hit.h : 0;
      this.lastRays.push({ a: Math.atan2(dz, dx), d, h });
      if (!hit) { escaped++; } else { sumH += h; nh++; }
      if (Math.abs(sa) > 0.8) { if (sa > 0) { side.R.push(d); side.hR.push(h); } else { side.L.push(d); side.hL.push(h); } }
      else if (Math.abs(ca) > 0.92) { if (ca > 0) { if (d < F) { F = d; hF = h; } } else if (d < B) { B = d; hB = h; } }
    }
    const med = (v: number[]) => { if (!v.length) return MAXD; const s = [...v].sort((p, q) => p - q); return s[s.length >> 1]; };
    const mean = (v: number[]) => (v.length ? v.reduce((p, q) => p + q, 0) / v.length : 0);
    const hitFrac = (v: number[]) => (v.length ? v.filter((d) => d < MAXD).length / v.length : 0);
    const dL = med(side.L), dR = med(side.R), hL = mean(side.hL), hR = mean(side.hR);
    const wall = (d: number, h: number, frac: number) => (d >= MAXD ? 0 : Math.min(0.9, (Math.atan2(h, d) / (Math.PI / 2)) * 1.5) * frac * 0.8);
    const gL = wall(dL, hL, hitFrac(side.L)), gR = wall(dR, hR, hitFrac(side.R));
    const gF = F < MAXD ? wall(F, hF, 1) * 0.6 : 0, gB = B < MAXD ? wall(B, hB, 1) * 0.6 : 0;
    const openness = escaped / N;
    const W = Math.min(dL, 80) + Math.min(dR, 80);
    const height = nh ? sumH / nh : 0;
    const flutter = gL > 0.15 && gR > 0.15 ? Math.max(0, Math.min(1, (34 - W) / 18)) : 0;
    // Sabine over the canyon segment; sky and open ends absorb fully.
    const Lseg = Math.min(F + B, 260), hEff = Math.max(3, (hL + hR) / 2);
    const V = W * hEff * Lseg;
    const endsOpen = (F >= MAXD ? 1 : 0.15) + (B >= MAXD ? 1 : 0.15);
    const A = 0.07 * 2 * hEff * Lseg + 0.02 * W * Lseg + W * Lseg + endsOpen * W * hEff;
    // Sabine assumes a diffuse field, which an open canyon is not: energy leaves through the sky after
    // a few bounces. 0.35 is an empirical scale toward published street-canyon RTs (~0.8-2.5 s).
    let rt60 = Math.max(0.35, Math.min(2.6, (0.161 * V) / A * 0.35));
    let wet = Math.pow(1 - openness, 1.3) * Math.min(0.9, Math.max(0.08, hEff / (W + hEff))) * 0.42 + 0.03;
    const park = g.inPark(x, z);
    const wide = ns ? ns.street.w >= 17 || /Avenue|Broadway/.test(ns.street.n) : false;
    let near = Infinity;
    for (const it of g.intersections) { const d = Math.hypot(it.x - x, it.z - z); if (d < near) near = d; }
    let kind: CanyonState['kind'] = wide ? 'avenue' : 'street';
    if (near < 14 && openness > 0.2) kind = 'intersection';
    if (park || (openness > 0.7 && nh < N * 0.3)) kind = park ? 'park' : 'open';
    if (kind === 'intersection') { rt60 = Math.min(3.5, rt60 * 1.25); }
    if (kind === 'park') { wet *= 0.45; rt60 = Math.min(rt60, 1.2); }
    this.state = { kind, street: ns?.street.n ?? '', dL, dR, hL, hR, gL, gR, dF: F, dB: B, gF, gB, width: W, height, openness, rt60, wet, flutter, ax, az };
    return this.state;
  }

  toReverb(s: CanyonState): ReverbParams {
    const big = s.kind === 'intersection' ? 1.35 : 1;
    return {
      early: { dL: Math.min(s.dL, 140), dR: Math.min(s.dR, 140), gL: s.gL, gR: s.gR, dF: Math.min(s.dF, 140), gF: s.gF, dB: Math.min(s.dB, 140), gB: s.gB, flutter: s.flutter, gain: s.kind === 'park' ? 0.5 : 0.9 },
      late: { rt60: s.rt60, damp: 0.5, size: Math.max(0.5, Math.min(2.2, (s.width / 24) * big)), predelay: Math.max(0.006, Math.min(0.09, (Math.min(s.dL, s.dR) * 2) / 343 * big)), gain: s.wet },
    };
  }
}

/** Interior profiles by narrative interior `kind` (content/interiors.json). */
export const INTERIORS: Record<string, { rt60: number; damp: number; size: number; predelay: number; wet: number; walls: number; flutter: number }> = {
  diner: { rt60: 0.7, damp: 0.3, size: 0.6, predelay: 0.008, wet: 0.32, walls: 4, flutter: 0.2 }, // tile, formica, glass
  sro: { rt60: 1.1, damp: 0.35, size: 0.7, predelay: 0.01, wet: 0.36, walls: 5, flutter: 0.35 }, // SRO lobby: terrazzo, plaster
  bar: { rt60: 0.55, damp: 0.6, size: 0.55, predelay: 0.006, wet: 0.22, walls: 3.5, flutter: 0.1 }, // wood, bodies, smoke
  precinct: { rt60: 1.3, damp: 0.3, size: 0.8, predelay: 0.012, wet: 0.38, walls: 6, flutter: 0.3 }, // hard, institutional
  loft: { rt60: 1.6, damp: 0.4, size: 1.2, predelay: 0.018, wet: 0.36, walls: 9, flutter: 0.15 }, // cast iron, wood floors
  cinema: { rt60: 0.8, damp: 0.7, size: 1.4, predelay: 0.02, wet: 0.2, walls: 12, flutter: 0 }, // upholstery, drapes
  shop: { rt60: 0.5, damp: 0.5, size: 0.5, predelay: 0.005, wet: 0.2, walls: 3, flutter: 0.1 },
  subway: { rt60: 1.9, damp: 0.25, size: 1.3, predelay: 0.015, wet: 0.45, walls: 5, flutter: 0.4 }, // tiled mezzanine
  stairwell: { rt60: 1.5, damp: 0.25, size: 0.6, predelay: 0.006, wet: 0.42, walls: 2, flutter: 0.6 },
  /** Not an interior acoustically: open air above the canyons (no muffling; see OUTDOOR_KINDS). */
  rooftop: { rt60: 0.6, damp: 0.5, size: 1.8, predelay: 0.05, wet: 0.08, walls: 30, flutter: 0 },
};
export const OUTDOOR_KINDS = new Set(['rooftop']);

/** roomVolume (m^3, from the interiors' inside() query) scales size and RT60 around the kind's typical room. */
export function interiorReverb(kind: string, roomVolume?: number): ReverbParams {
  const base = INTERIORS[kind] ?? INTERIORS.shop; const typical = Math.pow(base.walls * 2, 3) * 0.4;
  const k = roomVolume && roomVolume > 0 ? Math.max(0.5, Math.min(2.2, Math.cbrt(roomVolume / typical))) : 1;
  const p = { ...base, rt60: base.rt60 * Math.sqrt(k), size: Math.min(2.4, base.size * k), walls: base.walls * k, predelay: base.predelay * k };
  return {
    early: { dL: p.walls, dR: p.walls * 1.3, gL: 0.55, gR: 0.5, dF: p.walls * 1.8, gF: 0.35, dB: p.walls * 1.5, gB: 0.3, flutter: p.flutter, gain: 0.8 },
    late: { rt60: p.rt60, damp: p.damp, size: p.size, predelay: p.predelay, gain: p.wet },
  };
}

/** Blend two reverb settings (doorway transitions). */
export function lerpReverb(a: ReverbParams, b: ReverbParams, t: number): ReverbParams {
  const m = <T extends Record<string, number>>(x: T, y: T) => Object.fromEntries(Object.keys(x).map((k) => [k, x[k] + (y[k] - x[k]) * t])) as T;
  return { early: m(a.early, b.early), late: m(a.late, b.late) };
}
