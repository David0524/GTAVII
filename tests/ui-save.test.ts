/** The UI save section: fixture per version loads and validates; old saves without it get an empty one. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { migrate, SaveFormatError } from '../src/save/schema';
import '../src/ui/save/uiSection';
import { UI_SECTION_VERSION } from '../src/ui/save/uiSection';

const load = (f: string) => JSON.parse(fs.readFileSync(`tests/save-fixtures/${f}`, 'utf8'));

test('a ui fixture exists for every section version', () => {
  for (let v = 1; v <= UI_SECTION_VERSION; v++) assert.ok(fs.existsSync(`tests/save-fixtures/ui.v${v}.json`));
});
test('ui.v1 fixture migrates and keeps discovery, waypoint and marks', () => {
  const s = migrate(load('ui.v1.json'));
  const ui = s.sections.ui.data as { discovery: Record<string, { via: string; seen: boolean }>; waypoint: { x: number }; annotations: unknown[] };
  assert.equal(s.sections.ui.v, UI_SECTION_VERSION);
  assert.equal(ui.discovery['ui.food.3'].via, 'sight');
  assert.equal(ui.discovery['ui.food.3'].seen, false);
  assert.equal(ui.waypoint.x, -205);
  assert.equal(ui.annotations.length, 1);
});
test('a save from before the ui section gets an empty one', () => {
  const s = migrate(load('v1.json'));
  assert.deepEqual((s.sections.ui.data as { discovery: object }).discovery, {});
});
test('a damaged ui section is rejected with a precise path', () => {
  const bad = load('ui.v1.json'); bad.sections.ui.data.discovery['x'] = { at: 'soon' };
  assert.throws(() => migrate(bad), (e: Error) => e instanceof SaveFormatError && /sections\.ui\.discovery\.x/.test(e.message));
});
