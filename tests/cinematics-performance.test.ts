/** Cutscene performance tracks (docs/CUTSCENE_PERFORMANCE.md): resolution, validation and the M1 pass. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Timeline } from '../src/cinematics/Timeline';
import { validateCutscene, applyLayout, extractLayout, type Cutscene, type CutsceneLayout, type DialogueLine } from '../src/cinematics/schema';
import { estimateVisemes, VISEMES, keysOf, type ActorTrack } from '../src/cinematics/performance';

const m01Script = JSON.parse(fs.readFileSync('content/cutscenes/m01_opening.json', 'utf8')) as Cutscene;
const m01Layout = JSON.parse(fs.readFileSync('content/cutscenes/layout/m01_opening.layout.json', 'utf8')) as CutsceneLayout;
const prow = JSON.parse(fs.readFileSync('content/dialogue/m01_prow.json', 'utf8')) as { id: string; lines: DialogueLine[] };
const dlg = (ref: string) => { const [s, l] = ref.split('#'); return s === prow.id ? prow.lines.find((x) => x.id === l) ?? null : null; };
const near = (a: number, b: number, e = 1e-3) => Math.abs(a - b) < e;

/** Two actors, two shots; performance keys in both so carry-over across the cut is exercised. */
function scene(): Cutscene {
  const a: ActorTrack = {
    keys: [{ t: 0, x: 0, z: 0, heading: 0 }],
    clips: [{ t: 0, clip: 'idle', loop: true }, { t: 1, clip: 'wave', blend: 0.5, layer: 'upper', loop: false }, { t: 2, clip: null, layer: 'upper', blend: 0.5 }, { t: 3, clip: 'walk', blend: 1 }],
    look: [{ t: 0.5, at: { actor: 'b' }, blend: 0.5 }, { t: 3, at: null, blend: 0.5 }],
    ik: [{ t: 1, chain: 'hand_r', at: [1, 1.3, 0], blend: 0.2 }, { t: 2, chain: 'hand_r', at: null, blend: 0.2 }],
    expr: [{ t: 0, name: 'smile', w: 0.8, blend: 0.4 }, { t: 2, name: 'smile', w: 0.2, blend: 0.4 }],
    props: [{ t: 0, prop: 'coat', attach: 'hand_l' }, { t: 3, prop: 'coat', attach: null }],
  };
  return {
    id: 'perf', cast: { a: { cast: 'char.a' }, b: { cast: 'char.b', after: 'companion' } },
    shots: [
      { id: 's1', durationSec: 4, dialogue: [{ ref: 'dlg.x#l1', t: 0.5, seconds: 2 }], actors: { a, b: [{ t: 0, x: 3, z: 0, heading: 0 }] } },
      { id: 's2', durationSec: 3, actors: { a: { keys: [{ t: 0, x: 0, z: 0, heading: 0 }], look: [{ t: 0.5, at: 'camera', blend: 0 }] } } },
    ],
  };
}
const lines = (ref: string): DialogueLine | null => (ref === 'dlg.x#l1' ? { id: 'l1', speaker: 'char.a', text: 'Walk with me, Teddy.' } : null);
const world = { camera: () => [0, 1.7, 5] as [number, number, number], clipInfo: (c: string) => (c === 'wave' ? { duration: 1.5, loop: false } : c === 'walk' ? { duration: 1.1, loop: true } : null) };

test('clips: the newest fades in over its blend; upper layer releases; looped time wraps', () => {
  const tl = new Timeline(scene(), lines);
  const at = (t: number) => tl.actorFrame('a', t, world)!.clips;
  assert.deepEqual(at(0.5).map((c) => [c.clip, c.weight]), [['idle', 1]]);
  const mid = at(1.25); // wave half in on the upper layer, idle still full
  assert.ok(near(mid.find((c) => c.clip === 'wave')!.weight, 0.5) && mid.find((c) => c.clip === 'wave')!.layer === 'upper');
  assert.ok(!at(2.6).some((c) => c.clip === 'wave'), 'upper layer released by the null key');
  const blend = at(3.5); // walk half in over idle on the full layer: weights sum to 1
  assert.ok(near(blend.filter((c) => c.layer === 'full').reduce((s, c) => s + c.weight, 0), 1));
  const walk = at(3.95).find((c) => c.clip === 'walk')!;
  assert.ok(walk.loop && walk.time < 1.1 && near(walk.time, 0.95));
  assert.ok(near(at(1.25).find((c) => c.clip === 'wave')!.time, 0.25));
});

test('look-at resolves actors and the camera, blends in and releases; carries over the cut', () => {
  const tl = new Timeline(scene(), lines);
  const f = (t: number) => tl.actorFrame('a', t, world)!.look;
  assert.equal(f(0.2).weight, 0);
  assert.ok(near(f(0.75).weight, 0.5) && f(0.75).at![0] === 3 && near(f(0.75).at![1], 1.62), 'eyes on b (head height) half-blended');
  assert.ok(near(f(3.25).weight, 0.5), 'releasing');
  assert.equal(f(3.6).weight, 0);
  assert.deepEqual(f(4.6).at, [0, 1.7, 5], 'shot 2: to camera');
});

test('IK, expressions and props hold between keys and release cleanly', () => {
  const tl = new Timeline(scene(), lines);
  const f = (t: number) => tl.actorFrame('a', t, world)!;
  assert.ok(near(f(1.1).ik.hand_r!.weight, 0.5));
  assert.equal(f(2.5).ik.hand_r, undefined);
  assert.ok(near(f(1.5).expr.smile, 0.8));
  assert.ok(near(f(2.2).expr.smile, 0.5), 'cross-fading 0.8 → 0.2');
  assert.deepEqual(f(1).props, [{ prop: 'coat', attach: 'hand_l' }]);
  assert.deepEqual(f(3.1).props, []);
});

test('lips: auto from the actor\'s own lines (text estimate without a file), at most two visemes, closed after', () => {
  const tl = new Timeline(scene(), lines);
  let max = 0, open = 0;
  for (let t = 0; t < 4; t += 0.01) {
    const v = tl.actorFrame('a', t, world)!.visemes, n = Object.keys(v).length;
    max = Math.max(max, n); if (t > 0.6 && t < 2.3 && n) open++;
    if (t < 0.5 || t > 2.6) assert.equal(n, 0, `mouth closed at ${t.toFixed(2)}`);
  }
  assert.ok(max <= 2 && open > 100, `max ${max}, open frames ${open}`);
  assert.equal(Object.keys(tl.actorFrame('b', 1, world)!.visemes).length, 0, 'b does not speak');
  // a lip-sync file wins over the estimate
  const tl2 = new Timeline(scene(), lines, undefined, undefined, (r) => (r === 'dlg.x#l1' ? [[0.1, 'O', 1]] : null));
  assert.deepEqual(tl2.actorFrame('a', 1, world)!.visemes, { O: 1 });
});

test('estimateVisemes uses only the 15-viseme set and fits the line', () => {
  const v = estimateVisemes("Walk with me — it's a nice night, Teddy.", 2.4);
  assert.ok(v.length > 10 && v.every(([t, x]) => (VISEMES as readonly string[]).includes(x) && t >= 0 && t <= 2.4));
});

test('validation catches unknown tracks, bad targets, out-of-shot keys and bad visemes', () => {
  const sc = scene();
  assert.deepEqual(validateCutscene(sc), []);
  const a = sc.shots[0].actors!.a as ActorTrack & Record<string, unknown>;
  a.dance = []; a.look!.push({ t: 9, at: { actor: 'nobody' } }); a.lips = [{ t: 0, v: 'ZZ' }]; a.ik!.push({ t: 1, chain: 'hand_r', at: { actor: 'a' } });
  const errs = validateCutscene(sc).join('\n');
  for (const s of ['dance: unknown track', 'outside the shot', 'targets nobody', 'not a viseme', 'targets itself']) assert.ok(errs.includes(s), s);
});

test('tracks survive the script/layout split (extract then apply)', () => {
  const sc = scene();
  const script: Cutscene = { id: 'perf', shots: sc.shots.map((s) => ({ id: s.id, durationSec: s.durationSec, dialogue: s.dialogue })) };
  const back = applyLayout(structuredClone(script), extractLayout(sc, script)).scene;
  assert.deepEqual(back.shots[0].actors, sc.shots[0].actors);
  assert.equal(back.cast?.b.after, 'companion');
});

test('M1: performance pass validates, eye lines meet in s6, Mayhew hands off as the companion', () => {
  const m01 = applyLayout(structuredClone(m01Script), m01Layout).scene;
  assert.deepEqual(validateCutscene(m01), []);
  assert.equal(m01.cast?.mayhew.after, 'companion');
  const tl = new Timeline(m01, dlg);
  const s6 = tl.shotStart[m01.shots.findIndex((s) => s.id === 's6')];
  const t = s6 + 5, ted = tl.actor('teddy', t)!, may = tl.actor('mayhew', t)!;
  const fT = tl.actorFrame('teddy', t)!, fM = tl.actorFrame('mayhew', t)!;
  assert.ok(near(fT.look.at![0], may.x) && near(fM.look.at![0], ted.x) && fT.look.weight === 1 && fM.look.weight === 1, 'they hold each other\'s eyes');
  assert.ok(Object.keys(fM.visemes).length > 0 || Object.keys(tl.actorFrame('teddy', t)!.visemes).length > 0 || tl.lineAt(t) === null, 'whoever speaks has a moving mouth');
  // Mayhew ends the scene on set (the hand-off pose exists) and past the last key he holds still
  const end = tl.actor('mayhew', tl.duration)!;
  assert.ok(end && Number.isFinite(end.x) && keysOf(m01.shots[m01.shots.length - 1].actors!.mayhew).length > 0);
});
