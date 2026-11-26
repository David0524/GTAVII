import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pinball, TABLE, BALLS } from '../arcade/pinball';
import { Rng } from '../core/rng';

/** A simple player: flips when the ball comes down onto a flipper, launches at a random pull. */
function play(seed: number, skill: boolean, maxSeconds = 600) {
  const p = new Pinball(new Rng(seed));
  const rng = new Rng(seed + 1);
  let t = 0, escaped = 0, flips = 0;
  const holdUntil: Record<string, number> = { L: 0, R: 0 }, restUntil: Record<string, number> = { L: 0, R: 0 };
  while (!p.over && t < maxSeconds) {
    if (p.ball.inLane) p.launch(0.6 + rng.next() * 0.4);
    // tap a flipper as the ball comes onto it: hold 0.2 s, then let it drop for 0.3 s (no endless cradling)
    if (skill) for (const f of p.t.flippers) {
      const near = Math.hypot(p.ball.x - f.pivot.x, p.ball.y - f.pivot.y) < f.len * 1.1 && p.ball.y < f.pivot.y + 0.015;
      if (near && t >= restUntil[f.side] && t >= holdUntil[f.side]) { holdUntil[f.side] = t + 0.2; restUntil[f.side] = t + 0.5; flips++; }
      p.flip(f.side, t < holdUntil[f.side]);
    }
    p.step(1 / 60); t += 1 / 60;
    const b = p.ball; if (b.live && !b.inLane && (b.x < -0.02 || b.x > TABLE.w + 0.02 || b.y < -0.05)) escaped++;
    p.events.length = 0;
  }
  return { p, t, escaped, flips };
}

test('pinball: the ball stays on the table, every game ends after three balls, and it is deterministic', () => {
  for (const seed of [1, 2, 3]) {
    const a = play(seed, true), b = play(seed, true);
    assert.equal(a.escaped, 0, `ball left the playfield (seed ${seed})`);
    assert.ok(a.p.over, `game ended within the time (seed ${seed}, ${a.t.toFixed(0)} s)`);
    assert.equal(a.p.ballNo, BALLS + 1);
    assert.equal(a.p.score, b.p.score, 'same seed and inputs, same score');
  }
});

test('pinball: skill matters (flipping keeps the ball alive longer and scores more than not flipping)', () => {
  const seeds = [11, 12, 13, 14, 15, 16, 17, 18];
  const skilled = seeds.map((s) => play(s, true)), idle = seeds.map((s) => play(s, false));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const ts = avg(skilled.map((r) => r.t)), ti = avg(idle.map((r) => r.t));
  const ss = avg(skilled.map((r) => r.p.score)), si = avg(idle.map((r) => r.p.score));
  console.log(`skilled: ${ts.toFixed(1)} s, ${ss.toFixed(0)} pts | idle: ${ti.toFixed(1)} s, ${si.toFixed(0)} pts`);
  assert.ok(ts > ti * 1.3, `flipping keeps balls alive (${ts.toFixed(1)} vs ${ti.toFixed(1)} s)`);
  assert.ok(ss > si, `and scores more (${ss} vs ${si})`);
  assert.ok(skilled.every((r) => r.flips > 0));
});

test('pinball: a held flipper cradles the ball; a flip timed as the ball lands on the bat sends it up the table', () => {
  const p = new Pinball(new Rng(5));
  const f = p.t.flippers[0];
  p.flip('L', true); p.step(0.1);
  const tip = p.flipperTip(f);
  Object.assign(p.ball, { x: (f.pivot.x + tip.x) / 2 + 0.01, y: Math.min(f.pivot.y, tip.y) - 0.05, vx: 0, vy: 0, inLane: false, live: true });
  p.step(1.0);
  assert.ok(p.ball.live && p.ball.y < f.pivot.y + 0.01, `cradled (${p.ball.y.toFixed(3)})`);
  // a ball coming down onto the middle of the lowered bat, flipped as it lands
  p.flip('L', false); p.step(0.2);
  const rest = p.flipperTip(f);
  Object.assign(p.ball, { x: (f.pivot.x + rest.x) / 2, y: (f.pivot.y + rest.y) / 2 - 0.02, vx: 0, vy: 0.05 });
  p.step(0.05);
  p.flip('L', true);
  let top = p.ball.y; for (let i = 0; i < 60; i++) { p.step(1 / 120); top = Math.min(top, p.ball.y); }
  assert.ok(top < 0.6, `a flip sends it up the table (reached y=${top.toFixed(2)})`);
});

test('pinball: bumpers score, the drop bank raises the multiplier, three quick nudges tilt and kill the flippers', () => {
  const p = new Pinball(new Rng(9));
  const bu = p.t.bumpers[0];
  Object.assign(p.ball, { x: bu.x, y: bu.y - 0.06, vx: 0, vy: 1, inLane: false });
  p.step(0.2);
  assert.ok(p.events.some((e) => e.type === 'bumper'), 'pop bumper fired');
  assert.ok(p.score >= 100);
  for (const d of p.t.drops) (p as any).dropHit(d);
  assert.equal(p.mult, 2, 'all three drop targets: bonus x2');
  assert.ok(p.t.drops.every((d) => !d.down), 'the bank resets');
  assert.ok(p.nudge(1) && p.nudge(-1));
  assert.equal(p.nudge(1), false, 'third nudge inside 4 s tilts');
  p.flip('L', true); assert.equal(p.t.flippers[0].held, false, 'tilted flippers are dead');
  const before = p.score; (p as any).add(5000); assert.equal(p.score, before, 'no scoring while tilted');
});

test('pinball: reaching the replay score knocks a free game once', () => {
  const p = new Pinball(new Rng(3));
  (p as any).add(59990); assert.equal(p.credits, 0);
  (p as any).add(100); assert.equal(p.credits, 1);
  (p as any).add(100000); assert.equal(p.credits, 1);
  assert.ok(p.events.some((e) => e.type === 'replay'));
});
