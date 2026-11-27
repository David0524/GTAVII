import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { adaptNarrative } from '../data/narrativeAdapter';
import { validateContent } from '../data/schema';
import { Gameplay } from '../index';

const F = (n: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/narrative', `${n}.json`), 'utf8'));
const files = { ammo: F('ammo'), consumables: F('consumables'), keys: F('keys'), evidence: F('evidence'), weapons: F('weapons'), shops: F('shops'), precincts: F('precincts') };

test("narrative's systems content (snapshot) adapts, validates and runs", () => {
  const warns: string[] = [];
  const c = adaptNarrative(files, (m) => warns.push(m));
  validateContent(c);
  const svc = c.items.find((i) => i.id === 'item.revolver_service')!;
  assert.equal(svc.price, 11000, '$110 → 11000¢'); assert.equal(svc.tier, 'service'); assert.ok(svc.illicit);
  const coffee = c.items.find((i) => i.id === 'item.coffee')!; assert.equal(coffee.price, 20);
  assert.equal(c.items.find((i) => i.id === 'item.first_aid')!.stopsBleeding, true);
  const vp = c.weapons.find((w) => w.id === 'weapon.akers_25_vestpocket')!;
  assert.equal(vp.bulk, 'pocket'); assert.equal(vp.ammo, 'item.ammo_25');
  assert.equal(c.precincts.length, 3);
  assert.ok(c.precincts.every((p) => p.id.startsWith('precinct.')));
  assert.equal(c.precincts.find((p) => p.id === 'precinct.midtown_central')!.corruptibility, 0.8, 'corruptibility 4/5');
  const g = new Gameplay({ quality: 'high', content: c as any });
  g.bindPlayer({ id: 'p', lead: 'char.teddy_arce', position: () => [-742, 0, -700], aim: () => ({ origin: [0, 1.5, 0], dir: [0, 0, -1] }) });
  assert.ok(g.inv.has('char.teddy_arce', 'item.revolver_service'), "Teddy's start revolver maps to narrative's service revolver");
  assert.equal(g.inv.ensure('char.teddy_arce').guns.get('weapon.revolver_service')?.tier, 'service');
  assert.equal(g.policeSys.precinctAt(-742, -700).id, 'precinct.midtown_central', 'W 31st & 7th–8th is Midtown Central');
  assert.equal(g.policeSys.precinctAt(-100, -1300).id, 'precinct.bryant_park');
  assert.equal(g.policeSys.precinctAt(-300, -200).id, 'precinct.madison_square');
  // a fence-less pawn shop with narrative stock, buying a street gun at a 1974 price
  assert.ok(g.shops.listing('shop.eighth_ave_loan').some((x) => x.item === 'item.boone_22_parlor'));
  console.log(`adapter warnings (${warns.length}): ${warns.join(' | ')}`);
});
