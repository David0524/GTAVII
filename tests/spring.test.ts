import test from 'node:test';
import assert from 'node:assert/strict';
import { criticalSpring } from '../src/shared/spring';

// Regression: the characters' kerb-step spring used explicit Euler and diverged at long frames
// (dt 0.1 s, w 14), flinging the player body ~1e11 m up in the integrated game.
test('critical spring stays bounded and settles at any frame time', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.1, 0.5]) {
    let x = -0.4, v = 0, peak = 0;
    for (let t = 0; t < 3; t += dt) { [x, v] = criticalSpring(x, v, 14, dt); peak = Math.max(peak, Math.abs(x)); }
    assert.ok(peak <= 0.4 + 1e-9, `dt ${dt}: overshoot ${peak}`);
    assert.ok(Math.abs(x) < 1e-3 && Math.abs(v) < 1e-2, `dt ${dt}: not settled x=${x} v=${v}`);
  }
});

test('critical spring is frame-rate independent', () => {
  let a: [number, number] = [-0.3, 0.5], b: [number, number] = [-0.3, 0.5];
  for (let k = 0; k < 6; k++) a = criticalSpring(a[0], a[1], 14, 1 / 60);
  b = criticalSpring(b[0], b[1], 14, 0.1);
  assert.ok(Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
});
