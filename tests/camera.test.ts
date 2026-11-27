/**
 * ThirdPersonCamera acceptance (docs/CAMERA_SPEC.md "Acceptance"), against real Rapier colliders:
 * a 1970s alley course (2.6 m between walls, fire-escape rails overhead, a stoop well, an L corner,
 * a parked car and a pedestrian). Checks no clipping over a 1,000-step random walk, no pops,
 * the spec timings, the ignore list, alley mode and the per-frame cost.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../src/physics/Physics';
import { GROUPS, G, groups } from '../src/shared/physicsGroups';
import { ThirdPersonCamera, type CamLoco } from '../src/camera/ThirdPersonCamera';

const DT = 1 / 60;
const box = (ph: Physics, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, grp = GROUPS.world) =>
  ph.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz).setCollisionGroups(grp));

/** Alley along z from 0 to -40 between x = ±1.3, then an L turn east; open square at z > 0. */
async function course() {
  const ph = await Physics.create();
  box(ph, -1.3 - 2, 6, -20, 2, 6, 20);          // west wall
  box(ph, 1.3 + 2, 6, -18, 2, 6, 18);           // east wall (ends at z = -36: the corner)
  box(ph, 3, 6, -42.3 - 2, 6, 6, 2);            // north wall closing the L
  for (let z = -4; z > -36; z -= 6) box(ph, 0, 3.4 + (z % 12 === 0 ? 0 : 1.2), z, 1.3, 0.03, 0.03); // fire-escape rails
  box(ph, 0.95, 0.5, -14, 0.35, 0.5, 1.2);      // stoop (steps beside the well)
  box(ph, 8, 0.7, 6, 1.0, 0.7, 2.4, GROUPS.vehicle);  // parked car in the square
  box(ph, -8, 0.9, 6, 0.3, 0.9, 0.3, groups(G.NPC, G.WORLD | G.PLAYER | G.VEHICLE)); // pedestrian
  ph.world.step();
  return ph;
}

const loco = (o: Partial<CamLoco> = {}): CamLoco => ({ velocity: [0, 0, 0], grounded: true, climbing: false, ...o });
const make = (ph: Physics) => new ThirdPersonCamera(new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500), null, ph);
const solidAt = (ph: Physics, p: THREE.Vector3, r: number) => {
  let hit = false;
  ph.world.intersectionsWithShape(p, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Ball(r), () => { hit = true; return false; }, undefined, groups(G.PLAYER, G.WORLD | G.VEHICLE));
  return hit;
};

test('no clipping: 1,000-step random walk through the alley course', async () => {
  const ph = await course(), cam = make(ph);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const feet = { x: 0, y: 0, z: 4 };
  cam.snap(feet, 0);
  let inside = 0, maxGrow = 0, prevArm = cam.debug.arm || 5.6;
  for (let i = 0; i < 1000; i++) {
    // walk: mostly up the alley, wobbling, then into the L; yaw and pitch drift like a player's thumb
    const goingEast = feet.z < -38;
    feet.x = goingEast ? Math.min(14, feet.x + 0.06) : THREE.MathUtils.clamp(feet.x + (rnd() - 0.5) * 0.3, -1.0, 1.0);
    feet.z = goingEast ? THREE.MathUtils.clamp(feet.z + (rnd() - 0.5) * 0.2, -41.8, -37) : feet.z - 0.06 + (rnd() - 0.5) * 0.05;
    cam.yaw += (rnd() - 0.5) * 0.25;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + (rnd() - 0.5) * 0.08, -0.9, 0.6);
    if (i % 97 === 0) cam.swapShoulder();
    cam.lookBehind = i % 200 > 180;
    cam.update(DT, feet, loco({ velocity: [0, 0, -3.5], climbing: i % 150 > 140, aiming: i % 300 > 280 }));
    if (solidAt(ph, cam.camera.position, 0.08)) inside++;
    maxGrow = Math.max(maxGrow, cam.debug.arm - prevArm); prevArm = cam.debug.arm;
  }
  assert.equal(inside, 0, `camera inside geometry on ${inside} frames`);
  // no pop: the arm only ever grows at the ease-out rate (pull-ins are allowed to be instant)
  assert.ok(maxGrow <= 2.5 * DT + 1e-6, `arm grew ${maxGrow.toFixed(3)} m in one frame`);
});

test('ease-out waits 0.25 s clear, then 2.5 m/s', async () => {
  const ph = await course(), cam = make(ph);
  const feet = { x: 0, y: 0, z: -10 };
  cam.snap(feet, 0); cam.yaw = Math.PI / 2; // facing west: the arm points east into the wall
  for (let i = 0; i < 10; i++) cam.update(DT, feet, loco());
  const pinned = cam.debug.arm;
  assert.ok(pinned < 1.4, `pulled in against the wall (${pinned.toFixed(2)})`);
  cam.yaw = 0; // look up the alley: the arm is free behind
  const arms: number[] = [];
  for (let i = 0; i < 60; i++) { cam.update(DT, feet, loco()); arms.push(cam.debug.arm); }
  assert.ok(arms[12] - pinned < 0.01, 'held for 0.25 s');
  const rate = (arms[40] - arms[30]) / (10 * DT);
  assert.ok(Math.abs(rate - 2.5) < 0.05, `eases out at ${rate.toFixed(2)} m/s`);
});

test('ignore list: a pedestrian does not pull the camera in, a parked car does', async () => {
  const ph = await course();
  const at = (x: number) => { const cam = make(ph), feet = { x, y: 0, z: 2.5 }; cam.snap(feet, 0); for (let i = 0; i < 30; i++) cam.update(DT, feet, loco()); return cam.debug.arm; };
  // the person (x = -8) and the car (x = 8) stand 3.5 m behind; the open-square arm is the walk length 5.2
  assert.ok(at(-8 - 0.75) > 5.1, 'pedestrian ignored');
  assert.ok(at(8 - 0.75) < 3.6, 'parked car pulls in');
});

test('alley mode narrows the shoulder and lifts the camera; the open square does not', async () => {
  const ph = await course(), cam = make(ph);
  const alley = { x: 0, y: 0, z: -20 }, open = { x: 0, y: 0, z: 8 };
  cam.snap(alley, 0); for (let i = 0; i < 40; i++) cam.update(DT, alley, loco());
  assert.ok(cam.debug.alley && Math.abs(cam.shoulder) <= 0.25 + 1e-6, `alley shoulder ${cam.shoulder.toFixed(2)}`);
  cam.snap(open, 0); for (let i = 0; i < 40; i++) cam.update(DT, open, loco());
  assert.ok(!cam.debug.alley && Math.abs(cam.shoulder - 0.75) < 1e-3);
});

test('timings: shoulder swap 0.22 s, look-behind 0.18 s, climb framing in 0.25 s', async () => {
  const ph = await course(), cam = make(ph), feet = { x: 0, y: 0, z: 12 };
  cam.snap(feet, 0); cam.update(DT, feet, loco());
  cam.swapShoulder();
  let t = 0; while (cam.debug.sideT > -1 + 1e-6 && t < 1) { cam.update(DT, feet, loco()); t += DT; }
  assert.ok(Math.abs(t - 0.22) <= DT + 1e-9, `swap took ${t.toFixed(3)} s`);
  const fwd = () => { const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion); return Math.atan2(-d.x, -d.z); };
  const y0 = fwd(); cam.lookBehind = true; t = 0;
  while (Math.abs(Math.abs(fwd() - y0) - Math.PI) > 1e-3 && t < 1) { cam.update(DT, feet, loco()); t += DT; }
  assert.ok(Math.abs(t - 0.18) <= DT + 1e-9, `look-behind took ${t.toFixed(3)} s`);
  cam.lookBehind = false; for (let i = 0; i < 30; i++) cam.update(DT, feet, loco());
  for (let i = 0; i < 120; i++) cam.update(DT, feet, loco()); // settle the arm
  const before = cam.debug.want;
  for (let i = 0; i < 15; i++) cam.update(DT, feet, loco({ climbing: true, handY: 2 }));
  assert.ok(Math.abs(cam.debug.want - before - 0.8) < 0.02, `climb adds ${(cam.debug.want - before).toFixed(2)} m`);
});

test('falls: lag and pull-back after 0.35 s; the landing dip respects shake and reduce motion', async () => {
  const ph = await course(), feet = { x: 0, y: 12, z: 14 };
  const run = (tune: { shake?: number; reduceMotion?: boolean }) => {
    const cam = make(ph); Object.assign(cam.tune, tune); cam.snap(feet, 0);
    for (let i = 0; i < 60; i++) cam.update(DT, feet, loco());
    const base = cam.debug.want;
    let vy = 0, y = 12, pulled = false; const ys: number[] = [];
    for (let i = 0; i < 90 && y > 0; i++) {
      vy -= 9.81 * DT; y = Math.max(0, y + vy * DT);
      cam.update(DT, { ...feet, y }, loco({ grounded: y <= 0, velocity: [0, vy, 0] }));
      if (cam.debug.want > base + 0.9) pulled = true;
    }
    for (let i = 0; i < 10; i++) { cam.update(DT, { ...feet, y: 0 }, loco()); ys.push(cam.camera.position.y); }
    return { pulled, ys };
  };
  const plain = run({}), still = run({ shake: 0 }), reduced = run({ reduceMotion: true });
  assert.ok(plain.pulled, 'pulled back while falling');
  assert.ok(Math.min(...plain.ys.map((v, i) => v - still.ys[i])) < -0.05, 'landing dip with shake on');
  assert.deepEqual(reduced.ys, still.ys, 'no dip with reduce motion');
});

test('cost: camera update well under the 0.15 ms phone budget on this machine', async () => {
  const ph = await course(), cam = make(ph), feet = { x: 0, y: 0, z: -20 };
  cam.snap(feet, 0);
  for (let i = 0; i < 200; i++) cam.update(DT, feet, loco({ velocity: [0, 0, -3] }));
  const t0 = performance.now(); for (let i = 0; i < 2000; i++) { cam.yaw += 0.01; cam.update(DT, feet, loco({ velocity: [0, 0, -3] })); }
  const ms = (performance.now() - t0) / 2000;
  console.log(`# camera update ${(ms * 1000).toFixed(1)} µs/frame (desktop node; phone Low budget 150 µs)`);
  assert.ok(ms < 0.05, `${ms.toFixed(3)} ms`);
});

test('automatic swap: pinned to a wall on the near shoulder for 0.4 s while walking; stays swapped', async () => {
  const ph = await course(), cam = make(ph), feet = { x: 1.0, y: 0, z: -8 }; // 0.3 m from the east wall, right shoulder
  cam.snap(feet, 0);
  let t = 0; while (cam.debug.autoSwaps === 0 && t < 2) { feet.z -= 3 * DT; cam.update(DT, feet, loco({ velocity: [0, 0, -3] })); t += DT; }
  assert.equal(cam.debug.autoSwaps, 1); assert.ok(Math.abs(t - 0.4) < 2 * DT, `swapped after ${t.toFixed(2)} s`);
  feet.x = 0; for (let i = 0; i < 60; i++) cam.update(DT, feet, loco({ velocity: [0, 0, -3] }));
  assert.equal(cam.side, -1, 'stays on the left until the player swaps');
  const aimCam = make(ph); aimCam.snap({ x: 1.0, y: 0, z: -8 }, 0);
  for (let i = 0; i < 60; i++) aimCam.update(DT, { x: 1.0, y: 0, z: -8 - i * 0.05 }, loco({ velocity: [0, 0, -3], aiming: true }));
  assert.equal(aimCam.debug.autoSwaps, 0, 'never while aiming');
});
