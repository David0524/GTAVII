/**
 * Randomised no-snag test for the movement course (docs/briefs/MOVEMENT.md: "no snagging, no
 * tunnelling, no stuck states after 1,000 randomised runs").
 *   npx tsx tools/characters/move-test.ts [runs=1000]
 * Each run varies the speed scale (0.8-1.15), the start position and the frame step (30-120 Hz).
 * Fails (exit 1) if any run snags (blocked or stalled with a non-zero target speed), tunnels (feet
 * below the floor while grounded), skips a feature, or doesn't finish within 120 s of sim time.
 */
import { MoveCourseSim, FEATURES, moveGround, speedScript } from '../../src/characters/test/moveCourseSim';

const runs = Number(process.argv[2] ?? 1000);
let seed = 1974;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const fails: string[] = [];
let totalT = 0, steps = 0, traversals = 0;
for (let r = 0; r < runs; r++) {
  const scale = 0.8 + rnd() * 0.35, startX = -3 + rnd() * 2, hz = 30 + Math.floor(rnd() * 90);
  const sim = new MoveCourseSim({ scale, startX });
  let stall = 0, ok = true;
  while (!sim.s.done && sim.s.t < 120) {
    const st = sim.step(1 / hz);
    if (!st.traversal && st.grounded) {
      const g = moveGround(st.x).y;
      if (st.y < g - 0.02) { fails.push(`run ${r}: tunnelled at x=${st.x.toFixed(2)} (y ${st.y.toFixed(2)} < floor ${g.toFixed(2)})`); ok = false; break; }
      const target = speedScript(st.x, scale);
      stall = target > 0 && st.speed < 0.05 ? stall + 1 / hz : 0;
      if (stall > 0.5) { fails.push(`run ${r}: stuck at x=${st.x.toFixed(2)} (scale ${scale.toFixed(2)}, ${hz} Hz)`); ok = false; break; }
    }
  }
  if (!ok) continue;
  if (!sim.s.done) { fails.push(`run ${r}: didn't finish (x=${sim.s.x.toFixed(2)})`); continue; }
  const done = new Set(sim.events.filter((e) => e.type === 'traversal').map((e) => (e as any).label));
  const missing = FEATURES.filter((f) => !done.has(f.label)).map((f) => f.label);
  if (missing.length) fails.push(`run ${r}: skipped ${missing.join(', ')}`);
  totalT += sim.s.t; steps += sim.events.filter((e) => e.type === 'step').length; traversals += done.size;
}
console.log(`${runs} runs: ${runs - new Set(fails.map((f) => f.split(':')[0])).size} clean; mean course time ${(totalT / runs).toFixed(1)} s; ${(steps / runs).toFixed(0)} steps and ${(traversals / runs).toFixed(1)} traversals per run`);
for (const f of fails.slice(0, 20)) console.log('  ' + f);
process.exit(fails.length ? 1 : 0);
