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
  assert.equal(lm.short('Empire State Building'), 'Empire State Bldg.', 'no registry entry yet: the legacy abbreviation');
  assert.equal(lm.name('Corwin Hotel'), 'Corwin Hotel');
});
