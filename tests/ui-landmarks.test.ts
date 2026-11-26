import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Landmarks } from '../src/ui/map/landmarks';

test('landmark labels come from the registry, by real name, alias or id; unknown names fall back', () => {
  const lm = new Landmarks([{ id: 'lm.met_life', real: 'Metropolitan Life Insurance Company Tower', aliases: ['Met Life Tower'], name: 'Mercantile Life Tower', short: 'Mercantile Tower' },
    { real: "Macy's", name: "Garrity's" }]);
  assert.equal(lm.short('Metropolitan Life Insurance Company Tower'), 'Mercantile Tower');
  assert.equal(lm.name('met life tower'), 'Mercantile Life Tower');
  assert.equal(lm.short('lm.met_life'), 'Mercantile Tower');
  assert.equal(lm.short("Macy’s"), "Garrity's", 'curly apostrophe and no short: falls back to the display name');
  assert.equal(lm.short('Flatiron Building'), 'Flatiron Bldg.', 'not renamed: the abbreviation');
  assert.equal(lm.name('Corwin Hotel'), 'Corwin Hotel');
});

test("the shipped registry renames every world.json hero that has a brand or trademarked name", async () => {
  const fs = await import('node:fs');
  const reg = new Landmarks(JSON.parse(fs.readFileSync('content/landmarks.json', 'utf8')).landmarks);
  const heroes: { name: string }[] = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')).heroes;
  // Flatiron: a building name, kept as a place name (user decision).
  const KEEP = new Set(['Flatiron Building']);
  for (const h of heroes) if (!KEEP.has(h.name)) assert.notEqual(reg.short(h.name), h.name, `${h.name} is shown under its real name`);
});
