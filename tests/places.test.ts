import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Places, normStreet, type PlaceRec } from '../src/mission/places';

// Mission runtime: every narrative place must resolve to a point inside the modelled region.
test('street names normalise', () => {
  assert.equal(normStreet('W 31st St'), 'west 31st street');
  assert.equal(normStreet('7th Ave'), '7th avenue');
  assert.equal(normStreet('West 31st Street'), 'west 31st street');
});

test('every content/places.json place resolves', () => {
  const streets = JSON.parse(fs.readFileSync('public/data/streets.json', 'utf8'));
  const world = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8'));
  const places = (JSON.parse(fs.readFileSync('content/places.json', 'utf8')).places as PlaceRec[]);
  const P = new Places(streets, new Map(places.map((p) => [p.id, p])), new Map(world.heroes.map((h: any) => [h.id, h])));
  const bad: string[] = [];
  for (const p of places) { const r = P.resolve(p.id); if (!r || !Number.isFinite(r.x)) bad.push(`${p.id} (${p.at}${p.between ? ' / ' + p.between.join(', ') : ''})`); }
  assert.deepEqual(bad, [], `unresolved: ${bad.join('; ')}`);
});
