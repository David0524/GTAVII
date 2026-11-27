import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rig } from './harness';
import { MEMORY_OF, Gameplay } from '../index';
import fs from 'node:fs';
import path from 'node:path';

// sim memory.ts (39af2cb): gameplay reports what the player did; the block's standing feeds vendors.
const VJ = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/narrative/vendors.json'), 'utf8'));
const T = 'char.teddy_arce';

test('memory: the player\'s crimes reach sim\'s block memory with the right kind; other people\'s do not', () => {
  const r = rig();
  const log = (r.sim as any).memLog as { kind: string }[];
  r.g.crime('theft');
  r.g.crime('shots_fired', { noise: 120 });
  r.g.crime('homicide', { victim: 'ped:42' });
  r.g.crime('fare_evasion');
  r.g.crime('assault', { perp: 'someone_else' });
  assert.deepEqual(log.map((x) => x.kind), ['theft', 'gunfire', 'killed']);
  assert.equal((log[2] as any).pedId, 42, 'the victim is passed as sim\'s ped number');
  for (const k of Object.keys(MEMORY_OF)) assert.ok(MEMORY_OF[k as keyof typeof MEMORY_OF] === null || ['reckless', 'theft', 'robbed', 'assault', 'gunfire', 'killed'].includes(MEMORY_OF[k as keyof typeof MEMORY_OF]!), k);
  assert.ok(r.g.reputation(0, 0).score < -10);
});

test('memory: robbing a cart is remembered as a robbery; that vendor (and the block) won\'t serve you until it fades', () => {
  const r = rig(); r.g.loadVendorContent(VJ); r.g.inv.addMoney(T, 5000);
  r.g.registerVendor('cart', 'hot_dog', 1, 0);
  r.g.registerVendor('ice', 'italian_ice', 20, 5); // the same 60 m block
  r.g.robVendor('cart');
  assert.equal((r.sim as any).memLog.at(-1).kind, 'robbed');
  assert.ok(r.g.vendorRefuses('ice'));
  assert.equal(r.g.vendorMenu('ice')!.refuses, true);
  const notices: any[] = []; r.g.on('notice', (e: any) => notices.push(e));
  assert.ok(!r.g.buyFromVendor('ice', 'italian_ice.small_ice'));
  assert.ok(notices.some((n) => n.kind === 'vendorRefuses'));
  // a robbery (-4) halves every 15 sim minutes: after half an hour (-1) he serves you again
  r.step(31 * 60, 1);
  assert.ok(!r.g.vendorRefuses('ice'));
  assert.ok(r.g.buyFromVendor('ice', 'italian_ice.small_ice'));
});

test('memory: a tip and a caught purse snatcher are remembered kindly; a well-liked block makes you a regular sooner', () => {
  const r = rig(); r.g.loadVendorContent(VJ); r.g.inv.addMoney(T, 5000);
  r.pos[0] = 20; r.pos[2] = 20; // inside one block (the stand-in's 60 m grid)
  r.g.registerVendor('shine', 'shoeshine', 21, 20);
  r.g.shoeshine('shine');
  assert.equal((r.sim as any).memLog.at(-1).kind, 'tipped');
  // a lawful chase quarry tackled: the street saw you help
  r.g.spawnCombatant({ id: 'snatcher', faction: 'hood', squad: 'q', pos: [20, 0, 18], weapon: null, hp: 30 });
  r.g.setChaseTarget('snatcher', { lawful: true });
  r.g.setContext({ speed: 6, sprinting: true });
  for (let i = 0; i < 8 && !(r.sim as any).memLog.some((x: any) => x.kind === 'helped'); i++) { r.g.tackle(); r.step(1.2); }
  assert.ok((r.sim as any).memLog.some((x: any) => x.kind === 'helped'));
  assert.ok(r.g.reputation(20, 20).score >= Gameplay.STANDING.liked, `${r.g.reputation(20, 20).score}`);
  r.g.registerVendor('cart', 'hot_dog', 23, 22);
  r.g.buyFromVendor('cart', 'hot_dog.frank');
  assert.ok(!r.g.isRegular('cart'));
  r.g.buyFromVendor('cart', 'hot_dog.frank');
  assert.ok(r.g.isRegular('cart'), 'two franks on a block that likes you');
});
