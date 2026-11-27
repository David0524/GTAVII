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

test("no world.json hero carries a real brand name, and each renamed hero gets the registry's map label", async () => {
  const fs = await import('node:fs');
  const entries = JSON.parse(fs.readFileSync('content/landmarks.json', 'utf8')).landmarks as { real: string; name: string; short?: string }[];
  const reg = new Landmarks(entries);
  const heroes: { name: string }[] = JSON.parse(fs.readFileSync('public/data/world.json', 'utf8')).heroes;
  const real = new Set(entries.map((e) => e.real));
  for (const h of heroes) {
    assert.ok(!real.has(h.name), `${h.name} is a real name in world.json`);
    const e = entries.find((x) => x.name === h.name);
    if (e) assert.equal(reg.short(h.name), e.short ?? e.name);
  }
});
