/**
 * Gameplay firearms as meshes (invented makes; period-plausible 1974 shapes): a service revolver,
 * a snub-nose revolver, a semi-automatic pistol, a pump shotgun and a sawn-off double-barrel.
 * Each is one mesh with two material groups (blued steel, wood/rubber grips) in its own frame:
 *   origin = the centre of the grip where the palm closes, +Z = barrel direction, +Y = sights up.
 * Points (same frame): muzzle, forend (support hand on long guns), butt (stock end at the shoulder).
 * The character attaches it to hand_r (drawn) or a holster/sling (Character.setWeapon).
 */
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type WeaponKind = 'revolver' | 'snub' | 'pistol' | 'shotgun' | 'sawnoff';
export interface WeaponDef {
  kind: WeaponKind;
  /** two-handed shouldered weapon (shotgun, sawn-off) vs handgun */
  long: boolean;
  muzzle: THREE.Vector3; forend: THREE.Vector3 | null; butt: THREE.Vector3 | null;
  /** where it rides when holstered: right hip (handguns), across the back (shotgun), under the coat (hidden) */
  carry: 'hip' | 'back' | 'hidden';
  /** recoil kick (radians of muzzle rise, metres back) */
  kick: [number, number];
}

const steel = () => new THREE.MeshStandardNodeMaterial({ color: 0x23262b, metalness: 0.85, roughness: 0.38 });
const wood = (c = 0x5a3420) => new THREE.MeshStandardNodeMaterial({ color: c, metalness: 0, roughness: 0.55 });
let MATS: [THREE.Material, THREE.Material] | null = null;
const mats = () => (MATS ??= [steel(), wood()]);

type G = THREE.BufferGeometry;
const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(x, y, z); return g; };
/** cylinder along +Z from z0 to z1 */
const tube = (r: number, z0: number, z1: number, x: number, y: number, seg = 12) => { const g = new THREE.CylinderGeometry(r, r, z1 - z0, seg); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; };
const ring = (R: number, r: number, x: number, y: number, z: number) => { const g = new THREE.TorusGeometry(R, r, 6, 14, Math.PI * 1.25); g.rotateY(Math.PI / 2); g.rotateX(Math.PI * 0.12); g.translate(x, y, z); return g; };

function build(metal: G[], grip: G[]) {
  const a = mergeGeometries(metal.map((g) => g.toNonIndexed()), false)!, b = mergeGeometries(grip.map((g) => g.toNonIndexed()), false)!;
  const g = mergeGeometries([a, b], true)!;
  g.computeVertexNormals();
  return g;
}

function revolver(barrel: number): G {
  // frame above the grip; cylinder (drum) over the trigger; barrel with an under-lug; hammer
  const yB = 0.036;
  return build([
    box(0.016, 0.03, 0.05, 0, 0.026, 0.008), // frame
    tube(0.0185, -0.008, 0.032, 0, yB - 0.004, 16), // cylinder
    tube(0.0075, 0.032, 0.032 + barrel, 0, yB), // barrel
    box(0.008, 0.009, barrel * 0.9, 0, yB - 0.009, 0.032 + barrel * 0.45), // ejector lug
    box(0.004, 0.006, 0.006, 0, yB + 0.009, 0.03 + barrel), // front sight
    box(0.006, 0.014, 0.012, 0, 0.044, -0.022, -0.5), // hammer
    ring(0.013, 0.0022, 0, 0.0, 0.008), // trigger guard
    box(0.003, 0.012, 0.003, 0, 0.004, 0.006, 0.3), // trigger
  ], [box(0.026, 0.07, 0.032, 0, -0.022, -0.012, 0.32)]);
}
function pistol(): G {
  return build([
    box(0.026, 0.028, 0.19, 0, 0.034, 0.05), // slide
    tube(0.006, 0.145, 0.152, 0, 0.034), // muzzle crown
    box(0.022, 0.016, 0.12, 0, 0.012, 0.035), // frame / dust cover
    box(0.005, 0.006, 0.008, 0, 0.051, 0.13), box(0.012, 0.006, 0.008, 0, 0.051, -0.03), // sights
    box(0.008, 0.012, 0.01, 0, 0.042, -0.05, -0.4), // hammer
    ring(0.013, 0.0022, 0, -0.002, 0.018),
  ], [box(0.03, 0.085, 0.036, 0, -0.03, -0.012, 0.24)]);
}
function shotgun(): G {
  // receiver over the grip; 0.7 m barrel with the magazine tube under it; pump forend; stock
  return build([
    box(0.03, 0.05, 0.2, 0, 0.03, 0.08), // receiver
    tube(0.011, 0.17, 0.72, 0, 0.042), // barrel
    tube(0.0095, 0.17, 0.6, 0, 0.018), // magazine tube
    box(0.004, 0.006, 0.006, 0, 0.056, 0.71), // bead
    ring(0.014, 0.0025, 0, 0.0, 0.03),
  ], [
    box(0.044, 0.042, 0.16, 0, 0.018, 0.3), // forend (pump back)
    box(0.03, 0.07, 0.07, 0, -0.012, -0.02, 0.35), // wrist
    box(0.036, 0.1, 0.26, 0, -0.03, -0.18, 0.12), // stock
  ]);
}
function sawnoff(): G {
  return build([
    box(0.042, 0.045, 0.08, 0, 0.03, 0.04), // action
    tube(0.0115, 0.08, 0.36, -0.0115, 0.04), tube(0.0115, 0.08, 0.36, 0.0115, 0.04), // side-by-side barrels
    box(0.006, 0.01, 0.014, 0, 0.056, 0.0, -0.4), // hammers
    ring(0.014, 0.0025, 0, -0.002, 0.03),
  ], [
    box(0.044, 0.03, 0.14, 0, 0.022, 0.18), // forend
    box(0.03, 0.09, 0.05, 0, -0.03, -0.025, 0.45), // cut-down pistol grip
  ]);
}

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  revolver: { kind: 'revolver', long: false, muzzle: new THREE.Vector3(0, 0.036, 0.132), forend: null, butt: null, carry: 'hip', kick: [0.32, 0.02] },
  snub: { kind: 'snub', long: false, muzzle: new THREE.Vector3(0, 0.036, 0.083), forend: null, butt: null, carry: 'hip', kick: [0.38, 0.018] },
  pistol: { kind: 'pistol', long: false, muzzle: new THREE.Vector3(0, 0.034, 0.152), forend: null, butt: null, carry: 'hip', kick: [0.26, 0.022] },
  shotgun: { kind: 'shotgun', long: true, muzzle: new THREE.Vector3(0, 0.042, 0.72), forend: new THREE.Vector3(0, 0.018, 0.3), butt: new THREE.Vector3(0, -0.04, -0.31), carry: 'back', kick: [0.16, 0.05] },
  sawnoff: { kind: 'sawnoff', long: true, muzzle: new THREE.Vector3(0, 0.04, 0.36), forend: new THREE.Vector3(0, 0.022, 0.18), butt: null, carry: 'hidden', kick: [0.42, 0.04] },
};

const CACHE = new Map<WeaponKind, G>();
export function weaponGeometry(kind: WeaponKind): G {
  let g = CACHE.get(kind);
  if (!g) { g = kind === 'revolver' ? revolver(0.1) : kind === 'snub' ? revolver(0.051) : kind === 'pistol' ? pistol() : kind === 'shotgun' ? shotgun() : sawnoff(); CACHE.set(kind, g); }
  return g;
}
export function weaponMesh(kind: WeaponKind): THREE.Mesh {
  const m = new THREE.Mesh(weaponGeometry(kind), mats());
  m.castShadow = true; m.name = `weapon.${kind}`;
  return m;
}
/** Triangle count, for the stats. */
export const weaponTris = (kind: WeaponKind) => { const g = weaponGeometry(kind); return (g.index ? g.index.count : g.attributes.position.count) / 3; };
