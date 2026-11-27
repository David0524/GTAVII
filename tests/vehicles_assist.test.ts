/** Vehicles: driver assist (touch pedals, steering assist, auto-accelerate). Pure; no WebGL. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriverAssist, TOUCH_DEFAULTS, type AssistTarget } from '../src/vehicles/assist.ts';

const car = (speed: number, yaw: number): AssistTarget => ({
  speed, body: { linvel: () => ({ x: 0, y: 0, z: -speed }), angvel: () => ({ x: 0, y: yaw, z: 0 }) },
  object: { quaternion: { x: 0, y: 0, z: 0, w: 1 } }, handling: { wheelbase: 3.07, maxSteer: 0.6 },
});
const raw = (o: Partial<{ throttle: number; brake: number; steer: number; handbrake: boolean }>) => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, ...o });

test('pedal curves give fine control at the bottom of a thumb slider', () => {
  const a = new DriverAssist();
  const low = a.apply(raw({ throttle: 0.2 }), car(0, 0), 1 / 60).throttle;
  assert.ok(low < 0.1 && low > 0, `20% thumb -> ${low}`);
  assert.equal(a.apply(raw({ throttle: 1 }), car(0, 0), 1 / 60).throttle, 1);
  assert.ok(a.apply(raw({ brake: 0.5 }), car(10, 0), 1 / 60).brake < 0.5);
});

test('no counter-steer in ordinary cornering (yaw matches the steering)', () => {
  const a = new DriverAssist();
  const v = 15, steer = 0.5, delta = steer * 0.6 / (1 + v / 22), want = -(v * Math.tan(delta)) / 3.07;
  let out = a.apply(raw({ steer }), car(v, want), 1 / 60);
  for (let i = 0; i < 30; i++) out = a.apply(raw({ steer }), car(v, want), 1 / 60);
  assert.equal(out.steerExtra, 0);
  assert.equal(a.counterSteer, 0);
});

test('oversteer: counter-steers against excess rotation and lifts the throttle', () => {
  const a = new DriverAssist();
  let out = a.apply(raw({ throttle: 0.8, steer: 0 }), car(15, 1.2), 1 / 60); // rotating left, wheel straight
  for (let i = 0; i < 20; i++) out = a.apply(raw({ throttle: 0.8, steer: 0 }), car(15, 1.2), 1 / 60);
  assert.ok((out.steerExtra ?? 0) > 0.1, `steers right against a left spin: ${out.steerExtra}`);
  assert.ok(out.throttle < 0.8 ** 1.7 * 0.5, `lifts off: ${out.throttle}`);
  let o2 = a.apply(raw({ steer: 0 }), car(15, -1.2), 1 / 60);
  for (let i = 0; i < 20; i++) o2 = a.apply(raw({ steer: 0 }), car(15, -1.2), 1 / 60);
  assert.ok((o2.steerExtra ?? 0) < -0.1, 'and left against a right spin');
});

test('assist off passes steering through; auto-accelerate governs speed and yields to the brake', () => {
  const off = new DriverAssist({ steerAssist: false });
  assert.equal(off.apply(raw({ steer: 0.7 }), car(20, 0), 1 / 60).steer, 0.7);
  const auto = new DriverAssist({ ...TOUCH_DEFAULTS, autoAccelerate: true });
  assert.equal(auto.apply(raw({}), car(5, 0), 1 / 60).throttle, 1);
  assert.equal(auto.apply(raw({ brake: 0.3 }), car(5, 0), 1 / 60).throttle, 0);
  assert.ok(auto.apply(raw({}), car(TOUCH_DEFAULTS.autoCruise + 2, 0), 1 / 60).throttle === 0);
});
