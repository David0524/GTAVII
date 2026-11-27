import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Discovery } from '../src/ui/map/Discovery';
import type { Place, PlacesFile } from '../src/ui/map/places';
import { StreetIndex, normaliseStreet } from '../src/ui/map/grid';

const P = (o: Partial<Place> & { id: string }): Place => ({ name: o.id, cat: 'food', x: 0, z: 0, address: '', reveal: ['sight'], sightM: 30, source: 'generated', ...o });

test('starts with only lead homes', () => {
  const d = new Discovery([P({ id: 'home.t', cat: 'home', reveal: ['start'], lead: 'char.teddy_arce' }), P({ id: 'home.d', cat: 'home', reveal: ['start'], lead: 'char.delphine_moore' }), P({ id: 'diner' })]);
  d.start(['char.teddy_arce']);
  assert.deepEqual(d.known().map((p) => p.id), ['home.t']);
  assert.equal(d.isNew('home.t'), false, 'start places are not "new"');
});

test('sight reveals nearby visible places, never shady ones', () => {
  const d = new Discovery([P({ id: 'diner', x: 10, z: 0 }), P({ id: 'fence', cat: 'crime', x: 5, z: 0, shady: true, reveal: ['tip', 'mission'] }), P({ id: 'far', x: 400, z: 0 })]);
  const events: string[] = []; d.on((e) => events.push(`${e.place.id}:${e.via}`));
  assert.equal(d.tick(0, 0), 1);
  assert.deepEqual(events, ['diner:sight']);
  assert.ok(d.isNew('diner'));
  assert.equal(d.reveal('fence', 'sight'), false);
  assert.equal(d.reveal('fence', 'tip'), true);
  assert.equal(d.isKnown('far'), false);
});

test('channels are enforced but missions always reveal', () => {
  const d = new Discovery([P({ id: 'job', cat: 'job', reveal: ['news'] })]);
  assert.equal(d.reveal('job', 'sight'), false);
  assert.equal(d.reveal('job', 'mission'), true);
  assert.equal(d.reveal('job', 'mission'), false, 'already known');
});

test('new marks clear when seen; state round-trips through the save', () => {
  const d = new Discovery([P({ id: 'a' }), P({ id: 'b', x: 1000 })]);
  d.now = 42; d.tick(0, 0); d.reveal('b', 'mission');
  d.markSeen(['a']);
  const saved = JSON.parse(JSON.stringify(d.serialize()));
  const e = new Discovery([P({ id: 'a' }), P({ id: 'b', x: 1000 })]);
  e.deserialize(saved);
  assert.equal(e.isNew('a'), false); assert.equal(e.isNew('b'), true);
  assert.equal(e.entry('a')!.at, 42); assert.equal(e.entry('b')!.via, 'mission');
});

test('collectibles are absent until found', () => {
  const d = new Discovery([]);
  assert.equal(d.counts.total, 0);
  assert.ok(d.addFound(P({ id: 'stash.1', cat: 'collectible', reveal: [] })));
  assert.ok(d.isNew('stash.1'));
});

test('built catalogue: every place is inside the map and correctly flagged', () => {
  const f = JSON.parse(fs.readFileSync('public/data/ui/places.json', 'utf8')) as PlacesFile;
  assert.ok(f.places.length > 200);
  const ids = new Set<string>();
  for (const p of f.places) {
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z), p.id);
    if (p.cat === 'crime') { assert.ok(p.shady, `${p.id} crime must be shady`); assert.ok(!p.reveal.includes('sight')); }
    if (p.reveal.includes('start')) assert.equal(p.cat, 'home', `${p.id}: only homes are known at start`);
  }
  for (const c of ['home', 'food', 'payphone', 'callbox', 'subway', 'crime', 'service', 'garage', 'clothes', 'job', 'forsale'] as const)
    assert.ok(f.places.some((p) => p.cat === c), `category ${c} present`);
});

test('street names normalise and narrative corners resolve', () => {
  assert.equal(normaliseStreet('W 31st St'), 'West 31st Street');
  assert.equal(normaliseStreet('8th Ave'), '8th Avenue');
  assert.equal(normaliseStreet('E 23rd St'), 'East 23rd Street');
  const idx = new StreetIndex(JSON.parse(fs.readFileSync('public/data/streets.json', 'utf8')));
  const flat = idx.resolve('Broadway & 5th Ave & E 23rd St');
  assert.ok(flat && Math.hypot(flat[0] - 5.7, flat[1] - 19.3) < 80, `Flatiron corner near the building: ${flat}`);
  const lib = idx.resolve('5th Ave & W 41st St'); assert.ok(lib, 'Fifth Ave west/east split handled');
});
