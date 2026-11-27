/** Fog of war: the explored grid, its serialisation, bounds widening, MapModel hooks and the v1 -> v2 migration. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Explored } from '../src/ui/map/Explored';
import { MapModel, restoreExplored, EXPLORE_FOOT_M, EXPLORE_VEHICLE_M } from '../src/ui/map/MapModel';
import { Discovery } from '../src/ui/map/Discovery';
import { migrate } from '../src/save/schema';
import { PLAYABLE } from '../src/shared/bounds';
import '../src/ui/save/uiSection';
import type { Place, PlacesFile } from '../src/ui/map/places';

const B = { minX: 0, maxX: 200, minZ: 0, maxZ: 100 }; // 10 x 5 cells
const P = (o: Partial<Place> & { id: string }): Place => ({ name: o.id, cat: 'food', x: 0, z: 0, address: '', reveal: ['sight'], sightM: 30, source: 'generated', ...o });
const load = (f: string) => JSON.parse(fs.readFileSync(`tests/save-fixtures/${f}`, 'utf8'));

test('grid covers PLAYABLE with 20 m cells', () => {
  const g = new Explored();
  assert.equal(g.cols, Math.ceil((PLAYABLE.maxX - PLAYABLE.minX) / 20));
  assert.equal(g.rows, Math.ceil((PLAYABLE.maxZ - PLAYABLE.minZ) / 20));
  assert.equal(g.fraction(), 0);
});

test('mark explores a circle of cells and reports new cells only', () => {
  const g = new Explored(B);
  const n = g.mark(100, 50, 45);
  assert.ok(n > 0 && n === g.exploredCount);
  assert.equal(g.isExplored(100, 50), true);
  assert.equal(g.isExplored(130, 50), true);   // cell centre 130 is 30 m away
  assert.equal(g.isExplored(190, 50), false);
  assert.equal(g.isExplored(10, 10), false);    // corner is outside the circle
  assert.equal(g.mark(100, 50, 45), 0, 'second mark adds nothing');
  assert.ok(g.mark(100, 50, 80) > 0, 'a bigger radius adds more');
  assert.equal(g.isExplored(-5, 50), false, 'outside bounds is never explored');
  assert.ok(Math.abs(g.fraction() - g.exploredCount / 50) < 1e-9);
});

test('mark near and beyond the edge is clipped, not an error', () => {
  const g = new Explored(B);
  g.mark(-500, -500, 100); assert.equal(g.exploredCount, 0);
  g.mark(0, 0, 50); assert.ok(g.exploredCount > 0);
});

test('version bumps only on change', () => {
  const g = new Explored(B); const v = g.version;
  g.mark(100, 50, 30); assert.ok(g.version > v);
  const v2 = g.version; g.mark(100, 50, 30); assert.equal(g.version, v2);
});

test('mask: explored cells are 255, fog is 0, at the requested resolution', () => {
  const g = new Explored(B);
  g.mark(30, 30, 5); // exactly the cell (1,1): x 20..40, z 20..40
  const m = g.mask(0, 0, 100, 60, 10); // 10 x 6 px, one px per 10 m
  assert.equal(m.w, 10); assert.equal(m.h, 6); assert.equal(m.data.length, 60);
  const at = (x: number, z: number) => m.data[z * m.w + x];
  for (const [x, z] of [[2, 2], [3, 2], [2, 3], [3, 3]]) assert.equal(at(x, z), 255);
  assert.equal(at(1, 2), 0); assert.equal(at(4, 2), 0); assert.equal(at(2, 1), 0); assert.equal(at(2, 4), 0);
  assert.equal(m.data.reduce((a, b) => a + (b ? 1 : 0), 0), 4);
  // a rectangle that starts inside the cell and a finer scale
  const m2 = g.mask(30, 30, 50, 50, 5);
  assert.equal(m2.w, 4); assert.equal(m2.h, 4);
  assert.equal(at2(m2, 0, 0), 255); assert.equal(at2(m2, 1, 1), 255); assert.equal(at2(m2, 2, 2), 0);
});
const at2 = (m: { w: number; data: Uint8ClampedArray }, x: number, z: number) => m.data[z * m.w + x];

test('mask matches isExplored for the whole playable area', () => {
  const g = new Explored(); g.mark(-600, -800, 150); g.mark(100, 0, 60);
  const mpp = 10, m = g.mask(PLAYABLE.minX, PLAYABLE.minZ, PLAYABLE.maxX, PLAYABLE.maxZ, mpp);
  let bad = 0;
  for (let y = 0; y < m.h; y += 3) for (let x = 0; x < m.w; x += 3) {
    const wx = PLAYABLE.minX + (x + 0.5) * mpp, wz = PLAYABLE.minZ + (y + 0.5) * mpp;
    if ((m.data[y * m.w + x] === 255) !== g.isExplored(wx, wz)) bad++;
  }
  assert.ok(bad < m.w * m.h / 9 * 0.02, `${bad} mismatches at cell boundaries`);
});

test('serialize round-trips exactly', () => {
  const g = new Explored(); g.mark(-600, -800, 150); g.mark(100, 0, 60); g.mark(-1000, -1500, 300);
  const s = g.serialize(); const h = Explored.deserialize(s);
  assert.equal(h.exploredCount, g.exploredCount);
  assert.equal(h.serialize(), s);
  for (let x = PLAYABLE.minX; x < PLAYABLE.maxX; x += 37) for (let z = PLAYABLE.minZ; z < PLAYABLE.maxZ; z += 37) assert.equal(h.isExplored(x, z), g.isExplored(x, z));
  assert.equal(Explored.deserialize(new Explored().serialize()).exploredCount, 0);
});

test('a half-explored grid serializes under 6 KB, even noisy ones', () => {
  const half = new Explored();
  half.mark(PLAYABLE.minX, PLAYABLE.minZ, 0); // no-op
  for (let x = PLAYABLE.minX; x < PLAYABLE.maxX; x += 20) for (let z = PLAYABLE.minZ; z < (PLAYABLE.minZ + PLAYABLE.maxZ) / 2; z += 20) half.mark(x + 10, z + 10, 1);
  assert.ok(Math.abs(half.fraction() - 0.5) < 0.02);
  assert.ok(half.serialize().length < 6144, `half block: ${half.serialize().length} B`);
  // worst case: a checkerboard (no runs), falls back to the raw bitset
  const noisy = new Explored();
  for (let r = 0; r < noisy.rows; r++) for (let c = 0; c < noisy.cols; c++) if ((r + c) & 1) noisy.mark(noisy.minX + (c + 0.5) * 20, noisy.minZ + (r + 0.5) * 20, 1);
  assert.ok(Math.abs(noisy.fraction() - 0.5) < 0.01);
  assert.ok(noisy.serialize().length < 6144, `checkerboard: ${noisy.serialize().length} B`);
  assert.equal(Explored.deserialize(noisy.serialize()).exploredCount, noisy.exploredCount);
});

test('malformed grids throw instead of loading garbage', () => {
  for (const bad of ['', 'x', '1|0|0|10|5|20|r', '1|0|0|10|5|20|rAA==', '1|0|0|10|5|20|q', '2|0|0|1|1|20|bAA==']) assert.throws(() => Explored.deserialize(bad), bad);
});

test('widening PLAYABLE keeps explored ground where it was', () => {
  const old = new Explored(B); old.mark(100, 50, 45);
  const wider = { minX: -100, maxX: 300, minZ: -60, maxZ: 140 };
  const g = Explored.deserialize(old.serialize(), wider);
  assert.equal(g.cols, 20); assert.equal(g.rows, 10);
  assert.equal(g.exploredCount, old.exploredCount, 'same 20 m lattice: nothing lost or gained');
  for (let x = 0; x < 200; x += 10) for (let z = 0; z < 100; z += 10) assert.equal(g.isExplored(x, z), old.isExplored(x, z));
  assert.equal(g.isExplored(-50, 0), false); assert.equal(g.isExplored(250, 100), false);
  // an off-lattice origin remaps by cell centre
  const g2 = Explored.deserialize(old.serialize(), { minX: -7, maxX: 193, minZ: 3, maxZ: 103 });
  assert.ok(g2.exploredCount > 0 && g2.isExplored(100, 50));
  // narrowing drops what falls outside
  const g3 = Explored.deserialize(old.serialize(), { minX: 100, maxX: 200, minZ: 0, maxZ: 100 });
  assert.ok(g3.exploredCount > 0 && g3.exploredCount < old.exploredCount);
});

test('MapModel marks around the player at 2 Hz: 70 m on foot, 110 m in a vehicle', () => {
  const m = new MapModel([], []);
  m.update(0.016, -500, -800, false);
  const foot = m.explored.exploredCount; assert.ok(foot > 0);
  m.update(0.016, -400, -800, false);
  assert.equal(m.explored.exploredCount, foot, 'throttled: no second mark within half a second');
  m.update(0.5, -400, -800, false); assert.ok(m.explored.exploredCount > foot);
  const v0 = new MapModel([], []); v0.update(0.016, -500, -800, true);
  assert.ok(v0.explored.exploredCount > foot, 'vehicle radius is larger');
  assert.equal(m.explored.isExplored(-500 + EXPLORE_FOOT_M - 15, -800), true);
  assert.equal(v0.explored.isExplored(-500 + EXPLORE_VEHICLE_M - 15, -800), true);
  assert.equal(m.explored.isExplored(-500 - 100, -800), false, 'beyond 70 m on foot');
  const before = m.version; m.update(0.5, -300, -800, false); assert.ok(m.version > before, 'model version bumps so redraws happen');
});

test('a place revealed by sight lifts the fog 40 m around it', () => {
  const m = new MapModel([P({ id: 'diner', x: -300, z: -500 })], []);
  m.discovery.tick(-300, -500 + 25);
  assert.ok(m.discovery.isKnown('diner'));
  assert.equal(m.explored.isExplored(-300, -500), true);
  assert.equal(m.explored.isExplored(-300 + 30, -500), true);
  assert.equal(m.explored.isExplored(-300 + 80, -500), false);
  const t = new MapModel([P({ id: 'tip', x: -300, z: -500, reveal: ['tip'] })], []);
  t.discovery.reveal('tip', 'tip'); assert.equal(t.explored.exploredCount, 0, 'only sight lifts fog');
});

test('MapModel save round-trip keeps the grid', () => {
  const a = new MapModel([], []); a.update(0.5, -200, -300, true);
  const b = new MapModel([], []); b.deserialize(JSON.parse(JSON.stringify(a.serialize())));
  assert.equal(b.explored.exploredCount, a.explored.exploredCount);
  assert.equal(b.explored.isExplored(-200, -300), true);
});

test('ui.v1 fixture migrates to v2 and is seeded from known places and the player', () => {
  const s = migrate(load('ui.v1.json'));
  assert.equal(s.sections.ui.v, 2);
  const ui = s.sections.ui.data as { explored: string | null };
  assert.equal(ui.explored, null, 'migration marks the save for seeding');
  const places = (JSON.parse(fs.readFileSync('public/data/ui/places.json', 'utf8')) as PlacesFile).places;
  const m = new MapModel(places, []);
  const ids = Object.keys((s.sections.ui.data as { discovery: object }).discovery);
  m.lastPos = { x: -2.15, z: -19.4 };
  m.deserialize(s.sections.ui.data as never);
  assert.ok(m.explored.exploredCount > 0);
  assert.equal(m.explored.isExplored(-2.15, -19.4), true, 'around the player');
  assert.equal(m.explored.isExplored(-2.15 + 140, -19.4), true);
  const known = m.discovery.known(); assert.ok(known.length > 0 && ids.length === 3);
  for (const p of known) assert.equal(m.explored.isExplored(p.x, p.z), true, `${p.id} sits on explored ground`);
  assert.ok(m.explored.fraction() < 0.2, 'old saves are not wiped clear of fog');
  // seeding is stable: saving and reloading keeps exactly this grid
  const m2 = new MapModel(places, []); m2.deserialize(m.serialize()); assert.equal(m2.explored.exploredCount, m.explored.exploredCount);
});

test('restoreExplored: null seeds, absent or damaged is empty, valid loads', () => {
  const d = new Discovery([P({ id: 'a', x: -300, z: -500 })]); d.reveal('a', 'mission', true);
  assert.ok(restoreExplored(null, d, null).isExplored(-300 + 70, -500));
  assert.equal(restoreExplored(null, d, { x: -800, z: -900 }).isExplored(-800 + 130, -900), true);
  assert.equal(restoreExplored(undefined, d, null).exploredCount, 0);
  assert.equal(restoreExplored('garbage', d, null).exploredCount, 0);
  const g = new Explored(); g.mark(-300, -500, 50);
  assert.equal(restoreExplored(g.serialize(), d, null).exploredCount, g.exploredCount);
});

test('ui.v2 fixture loads, validates and restores its grid', () => {
  const s = migrate(load('ui.v2.json'));
  const ui = s.sections.ui.data as { explored: string };
  assert.equal(s.sections.ui.v, 2);
  const g = Explored.deserialize(ui.explored);
  assert.ok(g.exploredCount > 100 && g.isExplored(-2, -19) && g.isExplored(-205, -300));
  assert.ok(ui.explored.length < 6144);
  const bad = load('ui.v2.json'); bad.sections.ui.data.explored = 'nonsense';
  assert.throws(() => migrate(bad), /sections\.ui\.explored/);
});
