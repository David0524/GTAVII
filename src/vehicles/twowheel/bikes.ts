/**
 * Two- and three-wheelers: original designs (registry in docs/VEHICLE_REGISTRY.md).
 * Built from primitives (tubes, lathes, boxes) into one grouped geometry per model; wheels separate.
 * Local frame as cars: forward = -Z, x = right, y = up, ground at y = 0, origin at mid-wheelbase.
 */
import * as THREE from 'three/webgpu';
import { GeoBuilder, type Slot, type V3 } from '../gen/builder';

export interface BikeSpec {
  id: string;
  cls: 'motorcycle' | 'bicycle' | 'tricycle';
  displayName: string;
  wheelbase: number; wheelR: number; tireW: number;
  /** Machine mass (kg); the rider's mass is added in physics. */
  mass: number;
  /** Peak power at the wheel (W) and a standing-start force cap (N). */
  power: number; launchForce: number;
  cdA: number; mu: number; brakeG: number; maxSteer: number;
  lean: boolean;
  police?: boolean;
  /** Front axle track for tricycles (two front wheels). */
  frontTrack?: number;
  seats: { driver: V3; passenger?: V3 };
  palette: number[];
  paint2?: number;
}

export const BIKES: readonly BikeSpec[] = [
  {
    id: 'calder650', cls: 'motorcycle', displayName: 'Calder Twin 650', wheelbase: 1.42, wheelR: 0.33, tireW: 0.1, mass: 195,
    power: 36000, launchForce: 2600, cdA: 0.6, mu: 0.9, brakeG: 0.75, maxSteer: 0.6, lean: true,
    seats: { driver: [0, 0.95, 0.12], passenger: [0, 1.0, 0.45] },
    palette: [0x7a1d16, 0x1f2a40, 0x2e3d2c, 0x121314, 0xc89a2c, 0x5a3326],
  },
  {
    id: 'calder_patrol', cls: 'motorcycle', displayName: 'Calder Patrol 650', wheelbase: 1.44, wheelR: 0.33, tireW: 0.1, mass: 230,
    power: 40000, launchForce: 2700, cdA: 0.75, mu: 0.92, brakeG: 0.78, maxSteer: 0.6, lean: true, police: true,
    seats: { driver: [0, 0.95, 0.12] },
    palette: [0xe6e3da], paint2: 0x121314,
  },
  {
    id: 'wexford_roadster', cls: 'bicycle', displayName: 'Wexford Roadster (messenger)', wheelbase: 1.02, wheelR: 0.34, tireW: 0.032, mass: 14,
    power: 300, launchForce: 260, cdA: 0.5, mu: 0.85, brakeG: 0.5, maxSteer: 0.7, lean: true,
    seats: { driver: [0, 1.0, 0.18] },
    palette: [0x1f2a40, 0x7a1d16, 0x2e3d2c, 0x121314, 0xb8a684],
  },
  {
    id: 'wexford_carrier', cls: 'tricycle', displayName: 'Wexford Carrier Trike', wheelbase: 1.45, wheelR: 0.3, tireW: 0.04, mass: 42,
    power: 260, launchForce: 300, cdA: 0.75, mu: 0.8, brakeG: 0.4, maxSteer: 0.45, lean: false, frontTrack: 0.78,
    seats: { driver: [0, 1.0, 0.35] },
    palette: [0x2e3d2c, 0x1f2a40, 0x7a1d16], paint2: 0x6b4a2e,
  },
];
export const BIKE_BY_ID = new Map(BIKES.map((b) => [b.id, b]));

function tube(b: GeoBuilder, slot: Slot, a: V3, c: V3, r: number, segs = 6) {
  const va = new THREE.Vector3(...a), vc = new THREE.Vector3(...c);
  const len = va.distanceTo(vc);
  if (len < 1e-4) return;
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, true);
  const m = new THREE.Matrix4().compose(va.clone().add(vc).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vc.clone().sub(va).normalize()), new THREE.Vector3(1, 1, 1));
  b.add(slot, g, m);
}
function ellipsoid(b: GeoBuilder, slot: Slot, c: V3, s: V3, segs = 12) {
  b.add(slot, new THREE.SphereGeometry(1, segs, Math.max(4, segs / 2)), new THREE.Matrix4().compose(new THREE.Vector3(...c), new THREE.Quaternion(), new THREE.Vector3(...s)));
}

export interface BikeGeometry {
  body: THREE.BufferGeometry;
  /** Steering assembly (fork, bars, headlamp, front wheel mount) pivoting at `steerPivot` about `steerAxis`. */
  steer: THREE.BufferGeometry;
  steerPivot: V3; steerAxis: V3;
  wheel: THREE.BufferGeometry;
  wheels: { x: number; y: number; z: number; front: boolean }[];
  beacon: THREE.BufferGeometry | null;
  plate: { pos: V3; normal: V3 } | null;
  halfW: number; minZ: number; maxZ: number; height: number;
  tris: number;
}

export function buildBike(s: BikeSpec, lod: 0 | 1): BikeGeometry {
  const b = new GeoBuilder(), st = new GeoBuilder(), bb = new GeoBuilder();
  const R = s.wheelR, hw = s.wheelbase / 2;
  const zf = -hw, zr = hw;
  const seg = lod === 0 ? 8 : 5;
  const thin = s.cls === 'motorcycle' ? 0.022 : 0.014;
  const frame: Slot = s.police ? 'paint2' : 'paint';
  let head: V3;
  let plate: BikeGeometry['plate'] = null;
  if (s.cls === 'motorcycle') {
    head = [0, 0.98, zf + 0.3];
    const seatRear: V3 = [0, 0.82, zr - 0.05], pivot: V3 = [0, 0.42, 0.2], engBot: V3 = [0, 0.3, -0.15];
    tube(b, frame, head, [0, 0.86, 0.05], thin * 1.3, seg); tube(b, frame, [0, 0.86, 0.05], seatRear, thin, seg);
    tube(b, frame, head, engBot, thin * 1.3, seg); tube(b, frame, engBot, pivot, thin, seg); tube(b, frame, pivot, [0, 0.86, 0.05], thin, seg);
    for (const sx of [-1, 1]) {
      tube(b, frame, [sx * 0.08, 0.42, 0.2], [sx * 0.07, R, zr], thin, seg); // swingarm
      tube(b, 'chrome', [sx * 0.1, R + 0.06, zr - 0.05], [sx * 0.1, 0.8, zr - 0.18], 0.025, seg); // shocks
      tube(b, 'chrome', [sx * 0.14, 0.38, -0.12], [sx * 0.16, 0.42, zr + 0.15], 0.035, seg); // exhausts
    }
    // parallel-twin engine with finned cylinders
    b.box('trim', 0, 0.42, -0.05, 0.3, 0.22, 0.4);
    for (let k = 0; k < (lod === 0 ? 6 : 2); k++) b.box('chrome', 0, 0.56 + k * 0.035, -0.12 - k * 0.01, 0.26, 0.012, 0.18);
    ellipsoid(b, s.police ? 'paint' : 'paint', [0, 0.93, -0.22], [0.17, 0.11, 0.3], lod === 0 ? 14 : 8); // tank
    b.box('trim', 0, 0.9, 0.3, 0.26, 0.09, 0.62); // seat
    // fenders
    b.add('chrome', new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.12, lod === 0 ? 12 : 6, 1, true, -0.2, 1.9), new THREE.Matrix4().makeTranslation(0, R, zr).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
    b.box('taillamp', 0, 0.72, zr + 0.36, 0.1, 0.06, 0.04);
    plate = { pos: [0, 0.58, zr + 0.4], normal: [0, 0, 1] };
    if (s.police) {
      for (const sx of [-1, 1]) b.box('white', sx * 0.24, 0.62, zr - 0.1, 0.16, 0.3, 0.42); // saddlebags
      bb.add('chrome', new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), new THREE.Matrix4().makeTranslation(0.2, 1.05, zr + 0.1));
      bb.add('taillamp', new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(0.2, 1.3, zr + 0.1).multiply(new THREE.Matrix4().makeScale(1, 1.4, 1)));
    }
  } else if (s.cls === 'bicycle') {
    head = [0, 0.86, zf + 0.12];
    const bb0: V3 = [0, 0.3, 0.02], seatT: V3 = [0, 0.86, 0.12];
    tube(b, frame, head, seatT, thin, seg); tube(b, frame, head, bb0, thin, seg); tube(b, frame, bb0, seatT, thin, seg);
    for (const sx of [-1, 1]) { tube(b, frame, bb0, [sx * 0.05, R, zr], thin * 0.8, seg); tube(b, frame, seatT, [sx * 0.05, R, zr], thin * 0.8, seg); }
    tube(b, 'chrome', seatT, [0, 0.98, 0.16], 0.012, seg);
    b.box('trim', 0, 1.0, 0.17, 0.12, 0.05, 0.24); // saddle
    b.add('chrome', new THREE.CylinderGeometry(0.09, 0.09, 0.02, 10), new THREE.Matrix4().makeTranslation(0.03, 0.3, 0.02).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))); // chainring
    b.box('chrome', 0, R + 0.17, zr - 0.02, 0.14, 0.015, 0.36); // rear rack
    b.box('taillamp', 0, R + 0.17, zr + 0.17, 0.05, 0.03, 0.02);
  } else {
    // carrier trike: big wooden box between two front wheels, one rear wheel
    head = [0, 0.85, zf + 0.62];
    const ft = s.frontTrack ?? 0.78;
    b.box('paint2', 0, 0.6, zf, ft - 0.08, 0.42, 0.62); // the box (wood-brown)
    b.box('trim', 0, 0.82, zf, ft - 0.04, 0.03, 0.66); // lid edge
    tube(b, frame, [0, 0.45, zf + 0.32], [0, 0.32, 0.25], thin * 1.4, seg);
    tube(b, frame, [0, 0.32, 0.25], [0, 0.88, 0.35], thin, seg);
    for (const sx of [-1, 1]) { tube(b, frame, [0, 0.32, 0.25], [sx * 0.05, R, zr], thin, seg); tube(b, frame, [0, 0.88, 0.35], [sx * 0.05, R, zr], thin, seg); }
    for (const sx of [-1, 1]) tube(b, frame, [sx * (ft / 2 - 0.05), R, zf], [0, 0.45, zf + 0.32], thin, seg); // front axle frame
    b.box('trim', 0, 1.0, 0.38, 0.12, 0.05, 0.24); // saddle
    b.box('taillamp', 0, R + 0.25, zr + 0.25, 0.05, 0.03, 0.02);
  }
  // ---- steering assembly (rotates about the head axis)
  const axleF: V3 = [0, R, zf];
  if (s.cls === 'tricycle') {
    tube(st, frame, head, [0, 0.45, zf + 0.6], thin, seg);
    tube(st, 'chrome', [-0.25, 1.02, head[2] + 0.05], [0.25, 1.02, head[2] + 0.05], 0.012, seg);
    tube(st, 'chrome', head, [0, 1.02, head[2] + 0.05], 0.014, seg);
  } else {
    for (const sx of [-1, 1]) tube(st, s.cls === 'motorcycle' ? 'chrome' : frame, [sx * 0.08, head[1] - 0.05, head[2] + 0.01], [sx * 0.06, R, zf], s.cls === 'motorcycle' ? 0.02 : thin * 0.8, seg);
    const barY = head[1] + (s.cls === 'motorcycle' ? 0.14 : 0.1);
    tube(st, 'chrome', head, [0, barY, head[2] + 0.02], 0.014, seg);
    tube(st, 'chrome', [-0.34, barY + 0.04, head[2] + 0.12], [0.34, barY + 0.04, head[2] + 0.12], 0.012, seg);
    for (const sx of [-1, 1]) b.box('rubber', sx * 0.36, barY + 0.04, head[2] + 0.12, 0.06, 0.035, 0.035);
    if (s.cls === 'motorcycle') {
      st.add('chrome', new THREE.SphereGeometry(0.09, 10, 6), new THREE.Matrix4().makeTranslation(0, head[1] - 0.05, head[2] - 0.13));
      st.add('headlamp', new THREE.CircleGeometry(0.075, 12), new THREE.Matrix4().makeTranslation(0, head[1] - 0.05, head[2] - 0.215).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
      st.add('chrome', new THREE.CylinderGeometry(R + 0.04, R + 0.04, 0.1, lod === 0 ? 10 : 6, 1, true, 4.2, 1.6), new THREE.Matrix4().makeTranslation(0, R, zf).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)));
      if (s.police) { // painted handlebar fairing with a short smoked screen
        st.add('paint', new THREE.BoxGeometry(0.56, 0.3, 0.06), new THREE.Matrix4().makeTranslation(0, head[1] + 0.02, head[2] - 0.2).multiply(new THREE.Matrix4().makeRotationX(-0.3)));
        st.add('glassF', new THREE.BoxGeometry(0.48, 0.16, 0.008), new THREE.Matrix4().makeTranslation(0, head[1] + 0.24, head[2] - 0.15).multiply(new THREE.Matrix4().makeRotationX(-0.45)));
      }
    } else {
      st.add('headlamp', new THREE.CircleGeometry(0.03, 8), new THREE.Matrix4().makeTranslation(0, head[1] - 0.05, head[2] - 0.06).multiply(new THREE.Matrix4().makeRotationY(Math.PI)));
    }
  }
  // ---- wheel: tyre + rim + spokes (lathe around X)
  const w = new GeoBuilder();
  const segs = lod === 0 ? 18 : 8, tw = s.tireW;
  w.latheX('rubber', [[R - tw * 0.9, -tw / 2], [R - tw * 0.2, -tw / 2], [R, 0], [R - tw * 0.2, tw / 2], [R - tw * 0.9, tw / 2]], segs, [0, 0, 0]);
  w.latheX('chrome', [[R - tw * 0.9, -tw * 0.3], [R - tw * 1.15, 0], [R - tw * 0.9, tw * 0.3]], segs, [0, 0, 0]);
  w.add('chrome', new THREE.CylinderGeometry(0.04, 0.04, tw + 0.04, 8), new THREE.Matrix4().makeRotationZ(Math.PI / 2));
  if (lod === 0) for (let k = 0; k < (s.cls === 'motorcycle' ? 20 : 28); k++) {
    const a = (k / (s.cls === 'motorcycle' ? 20 : 28)) * Math.PI * 2, rr = R - tw * 1.1;
    tube(w, 'chrome', [(k % 2 ? 1 : -1) * 0.02, 0, 0], [0, Math.cos(a) * rr, Math.sin(a) * rr], 0.0018, 3);
  }
  const wheels: BikeGeometry['wheels'] = s.cls === 'tricycle'
    ? [{ x: -(s.frontTrack ?? 0.78) / 2, y: R, z: zf, front: true }, { x: (s.frontTrack ?? 0.78) / 2, y: R, z: zf, front: true }, { x: 0, y: R, z: zr, front: false }]
    : [{ x: 0, y: R, z: zf, front: true }, { x: 0, y: R, z: zr, front: false }];
  const body = b.build(), steer = st.build(), wheel = w.build(), beacon = bb.pos.length ? bb.build() : null;
  const t = (g: THREE.BufferGeometry | null) => (g ? (g.index ? g.index.count : 0) / 3 : 0);
  const ax = new THREE.Vector3(axleF[0] - head[0], axleF[1] - head[1], axleF[2] - head[2]).normalize();
  return {
    body, steer, steerPivot: head, steerAxis: [-ax.x, -ax.y, -ax.z], wheel, wheels, beacon, plate,
    halfW: s.cls === 'tricycle' ? (s.frontTrack ?? 0.78) / 2 + 0.1 : 0.4, minZ: zf - R - 0.1, maxZ: zr + R + 0.1, height: 1.3,
    tris: t(body) + t(steer) + t(wheel) * wheels.length + t(beacon),
  };
}
