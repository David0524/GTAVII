import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Timeline, readingTime } from '../src/cinematics/Timeline';
import { validateCutscene, lensToFov, fovToLens, applyLayout, extractLayout, type Cutscene, type CutsceneLayout, type DialogueLine } from '../src/cinematics/schema';

const m01Script = JSON.parse(fs.readFileSync('content/cutscenes/m01_opening.json', 'utf8')) as Cutscene;
const m01Layout = JSON.parse(fs.readFileSync('content/cutscenes/layout/m01_opening.layout.json', 'utf8')) as CutsceneLayout;
const m01 = applyLayout(m01Script, m01Layout).scene;
const prow = JSON.parse(fs.readFileSync('content/dialogue/m01_prow.json', 'utf8')) as { id: string; lines: DialogueLine[] };
const dlg = (ref: string) => { const [s, l] = ref.split('#'); return s === prow.id ? prow.lines.find((x) => x.id === l) ?? null : null; };

test('M1 opening validates and every dialogue ref resolves', () => {
  assert.deepEqual(validateCutscene(m01), []);
  const tl = new Timeline(m01, dlg);
  assert.ok(Math.abs(tl.duration - 46) < 0.01, String(tl.duration));
  assert.ok(tl.lines.length === 5 && tl.lines.every((l) => !l.text.startsWith('[')), 'all five prow lines found');
});

test('dialogue fits its shot at reading pace and never overlaps', () => {
  const tl = new Timeline(m01, dlg);
  for (let i = 1; i < tl.lines.length; i++) assert.ok(tl.lines[i].t0 >= tl.lines[i - 1].t1 - 1e-6, `line ${i} overlaps`);
  for (const l of tl.lines) {
    const si = m01.shots.findIndex((s) => s.id === l.shot), end = tl.shotStart[si] + m01.shots[si].durationSec;
    assert.ok(l.t1 <= end + 0.6 + 1e-6, `${l.ref} runs past its shot`);
    assert.ok(l.t1 - l.t0 >= Math.min(readingTime(l.text), end + 0.6 - l.t0) - 1e-6);
  }
});

test('camera is continuous inside shots (no jumps between frames)', () => {
  const tl = new Timeline(m01, dlg);
  for (let i = 0; i < m01.shots.length; i++) {
    const s0 = tl.shotStart[i], d = m01.shots[i].durationSec;
    let prev = tl.camera(s0 + 0.001);
    for (let t = s0 + 1 / 60; t < s0 + d - 0.01; t += 1 / 60) {
      const c = tl.camera(t), jump = Math.hypot(c.pos[0] - prev.pos[0], c.pos[1] - prev.pos[1], c.pos[2] - prev.pos[2]);
      assert.ok(jump < 1.2, `shot ${m01.shots[i].id}: ${jump.toFixed(2)} m in one frame at t=${t.toFixed(2)}`);
      prev = c;
    }
  }
});

test('the last shot lands exactly on the gameplay pose (seamless blend out)', () => {
  const tl = new Timeline(m01, dlg);
  const gp = { pos: [-0.9, 2.2, -16.2] as [number, number, number], look: [-4, 1.7, -30] as [number, number, number], fov: 55 };
  const end = tl.camera(tl.duration - 1e-4, gp);
  assert.ok(Math.hypot(end.pos[0] - gp.pos[0], end.pos[1] - gp.pos[1], end.pos[2] - gp.pos[2]) < 0.01);
  assert.ok(Math.abs(end.fov - gp.fov) < 0.5);
});

test('lens maths: 35 mm film focal length <-> vertical FOV', () => {
  assert.ok(Math.abs(lensToFov(50) - 26.99) < 0.05);
  assert.ok(Math.abs(fovToLens(lensToFov(85)) - 85) < 1e-6);
});

test('actors carry blocking across cuts and walk between keys', () => {
  const tl = new Timeline(m01, dlg);
  const s5 = tl.shotStart[4];
  const a = tl.actor('mayhew', s5 + 2)!;
  assert.equal(a.anim, 'walk');
  assert.ok(a.x > -27 && a.x < -9.5);
  assert.ok(tl.actor('teddy', 0) && tl.actor('teddy', 40));
});

test('validation catches broken layouts with precise paths', () => {
  const bad = structuredClone(m01); bad.shots[1].camera!.keys[1].t = 99; (bad.shots[2] as { dialogue: string[] }).dialogue = ['m01#x'];
  const errs = validateCutscene(bad);
  assert.ok(errs.some((e) => /shots\[1\].*keys\[1\]\.t outside/.test(e)));
  assert.ok(errs.some((e) => /shots\[2\].*dialogue/.test(e)));
});

test("every cutscene narrative ships validates and times (script-only files play with placeholders)", () => {
  for (const f of fs.readdirSync('content/cutscenes').filter((n) => n.endsWith('.json'))) {
    const c = JSON.parse(fs.readFileSync(`content/cutscenes/${f}`, 'utf8')) as Cutscene;
    const tl = new Timeline(c);
    assert.ok(Number.isFinite(tl.duration) && tl.duration > 0, `${f}: duration ${tl.duration}`);
    const errs = validateCutscene(c).filter((e) => !/not in cast/.test(e));
    assert.deepEqual(errs, [], `${f}: ${errs.join('; ')}`);
    for (let t = 0; t <= tl.duration; t += 0.5) { const p = tl.camera(t); assert.ok(p.pos.every(Number.isFinite), `${f} camera NaN at ${t}`); }
  }
});

test('script and layout stay separate: every layout matches a script, and extract(apply) round-trips', () => {
  for (const f of fs.readdirSync('content/cutscenes/layout')) {
    const id = f.replace('.layout.json', '');
    assert.ok(fs.existsSync(`content/cutscenes/${id}.json`), `${f}: no script`);
    const script = JSON.parse(fs.readFileSync(`content/cutscenes/${id}.json`, 'utf8')) as Cutscene;
    const layout = JSON.parse(fs.readFileSync(`content/cutscenes/layout/${f}`, 'utf8')) as CutsceneLayout;
    const { scene, orphans } = applyLayout(script, layout);
    assert.deepEqual(orphans, [], `${f}: layout shots missing from the script`);
    const again = applyLayout(script, extractLayout(scene, script)).scene;
    assert.deepEqual(new Timeline(again, dlg).camera(20), new Timeline(scene, dlg).camera(20));
    assert.equal(new Timeline(again).duration, new Timeline(scene).duration);
    // the script's own text survives the merge
    for (const s of script.shots) assert.equal(scene.shots.find((x) => x.id === s.id)!.framing, s.framing);
  }
});
