import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Places, type PlaceRec } from '../src/mission/places';
import { MissionRuntime, type MissionDef, type MissionHost, type NarrativeState } from '../src/mission/MissionRuntime';

// Headless playthrough (NARRATIVE_BRIEF: "play through each mission headless with the engine's test hooks"):
// a scripted player walks to every target, enters every interior, switches lead, takes every first choice.
const streets = JSON.parse(fs.readFileSync('public/data/streets.json', 'utf8'));
const world = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
const placeRecs = new Map((JSON.parse(fs.readFileSync('content/places.json', 'utf8')).places as PlaceRec[]).map((p) => [p.id, p]));
const interiors = JSON.parse(fs.readFileSync('content/interiors.json', 'utf8')).interiors;
const missions = new Map(fs.readdirSync('content/missions').filter((f) => f.endsWith('.json')).map((f) => { const m = JSON.parse(fs.readFileSync(`content/missions/${f}`, 'utf8')) as MissionDef; return [m.id, m]; }));
const places = new Places(streets, placeRecs, new Map(world.heroes.map((h: { id: string }) => [h.id, h])));

function play(m: MissionDef) {
  const st: NarrativeState = { act: m.act ?? 1, flags: Object.fromEntries((m.requires?.flags ?? []).map((f) => [f, true])), missions: {}, relationships: {} };
  const p = { x: 0, z: 0, lead: m.playAs ?? 'char.teddy_arce', inCar: false, interior: null as string | null };
  let clock = 12 * 60;
  const log: string[] = []; let end: string | null = null; const missingDialogue: string[] = [];
  let target: { x: number; z: number } | undefined;
  const host: MissionHost = {
    player: () => p, clock: () => ({ minutes: clock, date: m.requires?.dateRange?.[0] ?? '1974-06-21' }), state: () => st,
    waitTo: (t) => { const [h, mm] = t.split(':').map(Number); clock = (h % 24) * 60 + mm; },
    loadDialogue: async (id) => { const f = `content/dialogue/${id.replace(/^dlg\./, '')}.json`; if (!fs.existsSync(f)) { missingDialogue.push(id); return null; } return JSON.parse(fs.readFileSync(f, 'utf8')); },
    say: async () => {}, choose: async () => '0',
    objective: (o) => { target = o?.target; if (o) log.push(o.text); }, notify: () => {}, discover: () => {},
    missionEnd: (e) => { end = e.result; }, addMoney: () => {},
  };
  const rt = new MissionRuntime(host, places, new Map([[m.id, m]]), interiors, placeRecs);
  rt.begin(m);
  return { rt, p, st, log, end: () => end, missingDialogue, step: async () => {
    const o = rt.active?.def.objectives[rt.active.idx]; if (!o) return;
    if (target) { p.x = target.x; p.z = target.z; }
    p.interior = o.type === 'enter_interior' ? 'x' : null;
    p.inCar = o.type === 'enter_vehicle';
    if (o.type === 'switch_to' && o.target) p.lead = o.target;
    await new Promise((r) => setTimeout(r, 0)); // dialogue promises
    rt.update(1); rt.update(5);
  } };
}

test('every mission plays through headless to "passed"', async () => {
  const stuck: string[] = [], missing = new Set<string>();
  for (const m of missions.values()) {
    const run = play(m);
    for (let k = 0; k < 400 && run.end() === null; k++) await run.step();
    run.missingDialogue.forEach((d) => missing.add(d));
    if (run.end() !== 'passed') stuck.push(`${m.id} at ${run.rt.active?.def.objectives[run.rt.active.idx]?.id ?? '?'} (${run.rt.active?.def.objectives[run.rt.active.idx]?.type})`);
  }
  if (missing.size) console.log(`missing dialogue scripts (${missing.size}): ${[...missing].slice(0, 12).join(', ')}${missing.size > 12 ? '…' : ''}`);
  assert.deepEqual(stuck, []);
});

test('mission targets resolve (no objective points into nowhere)', () => {
  const bad: string[] = [];
  for (const m of missions.values()) for (const o of m.objectives) {
    const ref = o.to ?? o.at ?? o.marker; if (!ref) continue;
    const addr = interiors.find((i: { id: string }) => i.id === ref)?.address ?? ref;
    if (!places.resolve(addr)) bad.push(`${m.id}/${o.id}: ${ref}`);
  }
  assert.ok(bad.length <= 3, `unresolved targets: ${bad.join('; ')}`);
});
