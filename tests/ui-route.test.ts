import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RouteGraph, turns, callout, routeVoice, voicedCallout } from '../src/ui/map/Route';
import { StreetIndex } from '../src/ui/map/grid';

const streets = JSON.parse(fs.readFileSync('public/data/streets.json', 'utf8'));
const g = new RouteGraph(streets);
const idx = new StreetIndex(streets);

test('foot route Flatiron -> Hotel Corwin is close to the grid distance', () => {
  const a = idx.resolve('Broadway & 5th Ave & E 23rd St')!, b = idx.resolve('W 31st St', ['Broadway', '6th Ave'], 'north')!;
  const t0 = performance.now();
  const r = g.find(a[0], a[1], b[0], b[1], 'foot');
  const ms = performance.now() - t0;
  assert.ok(r, 'route found');
  const manhattan = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  assert.ok(r!.length < manhattan * 1.25, `length ${r!.length.toFixed(0)} vs grid ${manhattan.toFixed(0)}`);
  assert.ok(ms < 60, `A* took ${ms.toFixed(1)} ms`);
});

test('car route honours 1974 one-ways (never shorter than on foot)', () => {
  const a = idx.resolve('W 34th St & 8th Ave')!, b = idx.resolve('W 26th St & 7th Ave')!;
  const foot = g.find(a[0], a[1], b[0], b[1], 'foot')!, car = g.find(a[0], a[1], b[0], b[1], 'car')!;
  assert.ok(car && foot);
  assert.ok(car.length >= foot.length - 1);
  // every car segment on a one-way street runs the right way
  for (let i = 0; i < car.streets.length; i++) {
    const s = streets[car.streets[i]]; if (!s.o) continue;
    const ax = car.pts[2 + 2 * i], az = car.pts[3 + 2 * i], bx = car.pts[4 + 2 * i], bz = car.pts[5 + 2 * i];
    // find direction of this street near the segment
    let best = Infinity, dir = [0, 0];
    for (let k = 2; k < s.p.length; k += 2) { const mx = (s.p[k] + s.p[k - 2]) / 2, mz = (s.p[k + 1] + s.p[k - 1]) / 2, d = Math.hypot(mx - (ax + bx) / 2, mz - (az + bz) / 2); if (d < best) { best = d; dir = [s.p[k] - s.p[k - 2], s.p[k + 1] - s.p[k - 1]]; } }
    const dot = (bx - ax) * dir[0] + (bz - az) * dir[1];
    if (Math.hypot(bx - ax, bz - az) > 1) assert.ok(dot * s.o > 0, `wrong way on ${s.n}`);
  }
});

test('turn call-outs read like a 1974 passenger', () => {
  const a = idx.resolve('W 34th St & 8th Ave')!, b = idx.resolve('W 26th St & 7th Ave')!;
  const r = g.find(a[0], a[1], b[0], b[1], 'car')!;
  const t = turns(r, streets);
  assert.ok(t.length >= 1 && t.length < 8, `turns: ${t.length}`);
  for (const x of t) assert.match(callout(x), /^(Left|Right|Bear left|Bear right) on /);
  assert.equal(callout({ atM: 0, dir: 'left', onto: 'West 34th Street', x: 0, z: 0 }), 'Left on Thirty-Fourth');
  assert.equal(callout({ atM: 0, dir: 'right', onto: '8th Avenue', x: 0, z: 0 }), 'Right on Eighth Avenue');
});

test('voiced call-outs never contradict the printed one', async () => {
  const { voicedCallout } = await import('../src/ui/map/Route');
  const pool = JSON.parse(fs.readFileSync('content/barks/route_calls.json', 'utf8')).lines;
  const left = { atM: 0, dir: 'left' as const, onto: 'West 34th Street', x: 0, z: 0 };
  for (let seed = 0; seed < 20; seed++) {
    const l = voicedCallout(left, 'cabbie', pool, seed) ?? voicedCallout(left, 'fare', pool, seed);
    if (l) { assert.doesNotMatch(l, /\bright\b/i); assert.match(l, /Thirty-Fourth/); }
  }
  const right = { atM: 0, dir: 'right' as const, onto: '8th Avenue', x: 0, z: 0 };
  const r = voicedCallout(right, 'fare', pool, 1);
  assert.ok(r === null || (/\bright\b/i.test(r) && /Eighth Avenue/.test(r)), String(r));
});

test("route-call voice follows narrative's passenger table (voice-line coverage gaps are reported, not failed: the HUD always prints the turn)", () => {
  const rc = JSON.parse(fs.readFileSync('content/barks/route_calls.json', 'utf8'));
  const t = rc.voiceByPassenger as Record<string, string>;
  assert.equal(routeVoice(t), null, 'alone: silent');
  assert.equal(routeVoice(t, 'char.delphine_moore'), 'delphine');
  assert.equal(routeVoice(t, 'npc.cab_driver'), 'cabbie');
  assert.equal(routeVoice(t, 'npc.somebody_new'), 'fare');
  assert.equal(routeVoice(t, 'char.nick_varelas', 'side.baby_cab'), 'labour');
  const gaps: string[] = [];
  for (const v of new Set(Object.values(t))) for (const dir of ['left', 'right'] as const) for (const onto of ['West 34th Street', '7th Avenue']) {
    if (!voicedCallout({ atM: 100, dir, onto, x: 0, z: 0 }, v, rc.lines, 3)) gaps.push(`${v}: ${dir} onto ${/Avenue/.test(onto) ? 'an avenue' : 'a street'}`);
  }
  if (gaps.length) console.log(`route-call voice gaps (silent turns): ${gaps.join('; ')}`);
});
