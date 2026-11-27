import * as THREE from 'three/webgpu';
import { smooth } from './builder';

/** Damage zones, in morph-target order. */
export const ZONES = ['front', 'rear', 'left', 'right'] as const;
export type Zone = (typeof ZONES)[number];

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth value noise in [-1, 1]. */
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}

export interface Extents { minZ: number; maxZ: number; halfW: number; height: number }

/** Displacement for a vertex at full damage in a zone (crumpled, not a clean push). */
export function zoneDisplacement(zone: Zone, p: THREE.Vector3, e: Extents, seed: number, out: THREE.Vector3) {
  out.set(0, 0, 0);
  const n1 = vnoise(p.x * 3.1 + seed, p.y * 3.3, p.z * 2.7), n2 = vnoise(p.x * 7 + 11, p.y * 6 + seed, p.z * 7);
  const crumple = 0.65 + 0.35 * n1 + 0.15 * n2;
  const len = e.maxZ - e.minZ;
  const reach = Math.min(1.25, len * 0.22);
  if (zone === 'front' || zone === 'rear') {
    const w = zone === 'front' ? smooth(e.minZ + reach, e.minZ, p.z) : smooth(e.maxZ - reach, e.maxZ, p.z);
    if (w <= 0) return out;
    const dir = zone === 'front' ? 1 : -1;
    const ww = Math.pow(w, 1.3);
    out.z = dir * 0.36 * ww * crumple;
    // panels buckle: the middle of the hood/deck rises, corners fold inward
    const centre = 1 - Math.min(1, Math.abs(p.x) / e.halfW);
    out.y = ww * (0.07 * centre * (0.6 + 0.4 * n2) + 0.03 * n1) * (p.y > 0.55 ? 1 : 0.3);
    out.x = -Math.sign(p.x) * 0.05 * ww * (0.5 + 0.5 * n1);
  } else {
    const side = zone === 'right' ? 1 : -1;
    if (p.x * side <= 0) return out;
    const w = smooth(e.halfW - 0.5, e.halfW, Math.abs(p.x));
    const along = smooth(e.minZ, e.minZ + 0.6, p.z) * smooth(e.maxZ, e.maxZ - 0.6, p.z);
    const ww = w * along;
    if (ww <= 0) return out;
    // dished door skins, strongest at mid height
    const hband = Math.exp(-(((p.y - 0.6) / 0.35) ** 2));
    out.x = -side * 0.2 * ww * (0.4 + 0.6 * hband) * crumple;
    out.y = -0.015 * ww * n2;
  }
  return out;
}

/** Bake the four zone morph targets (relative positions + normals) into a geometry. */
export function addDamageMorphs(g: THREE.BufferGeometry, e: Extents, seed: number) {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  const morphPos: THREE.BufferAttribute[] = [], morphNrm: THREE.BufferAttribute[] = [];
  for (const z of ZONES) {
    const dp = new Float32Array(pos.count * 3);
    const moved = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      zoneDisplacement(z, p, e, seed, d);
      dp[i * 3] = d.x; dp[i * 3 + 1] = d.y; dp[i * 3 + 2] = d.z;
      moved[i * 3] = p.x + d.x; moved[i * 3 + 1] = p.y + d.y; moved[i * 3 + 2] = p.z + d.z;
    }
    const tmp = new THREE.BufferGeometry();
    tmp.setAttribute('position', new THREE.BufferAttribute(moved, 3));
    tmp.setIndex(g.index);
    tmp.computeVertexNormals();
    const tn = tmp.getAttribute('normal') as THREE.BufferAttribute;
    const dn = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count * 3; i++) dn[i] = (tn.array as Float32Array)[i] - (nrm.array as Float32Array)[i];
    morphPos.push(new THREE.BufferAttribute(dp, 3));
    morphNrm.push(new THREE.BufferAttribute(dn, 3));
  }
  g.morphAttributes.position = morphPos;
  g.morphAttributes.normal = morphNrm;
  g.morphTargetsRelative = true;
}
