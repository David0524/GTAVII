/** Save-format guarantees: every historical fixture loads; files round-trip; tampering is caught. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { migrate, toFile, fromFile, SAVE_VERSION, SaveFormatError, MIGRATIONS } from '../src/save/schema.ts';
import { MemorySaveStore } from '../src/save/SaveStore.ts';

const FIX = path.join(import.meta.dirname, 'save-fixtures');
const fixtures = fs.readdirSync(FIX).filter((f) => /^v\d+\.json$/.test(f));

test('a fixture exists for every save version up to the current one', () => {
  for (let v = 1; v <= SAVE_VERSION; v++) assert.ok(fixtures.includes(`v${v}.json`), `missing tests/save-fixtures/v${v}.json`);
  for (let v = 1; v < SAVE_VERSION; v++) assert.ok(MIGRATIONS[v], `missing migration v${v}->v${v + 1}`);
});

for (const f of fixtures) {
  test(`fixture ${f} migrates to v${SAVE_VERSION} and validates`, () => {
    const s = migrate(JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')));
    assert.equal(s.version, SAVE_VERSION);
    assert.ok(s.party.characters[s.party.activeCharacter]);
  });
}

test('export -> import round-trips exactly', async () => {
  const s = migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'v1.json'), 'utf8')));
  const back = await fromFile(await toFile(s));
  assert.deepEqual(back, s);
});

test('tampered save file is rejected by checksum', async () => {
  const s = migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'v1.json'), 'utf8')));
  const file = JSON.parse(await toFile(s));
  file.data.party.characters['char.teddy_arce'].money = 999999;
  await assert.rejects(() => fromFile(JSON.stringify(file)), SaveFormatError);
});

test('saves from a newer game version are refused, not mangled', () => {
  assert.throws(() => migrate({ version: SAVE_VERSION + 1 }), /newer game version/);
});

test('invalid structure names the failing path', () => {
  const s = JSON.parse(fs.readFileSync(path.join(FIX, 'v1.json'), 'utf8'));
  s.party.activeCharacter = 'char.nobody';
  assert.throws(() => migrate(s), /party.activeCharacter/);
});

test('memory store: profiles, slots, overwrite, delete', async () => {
  const st = new MemorySaveStore();
  const p = await st.createProfile('Tester');
  const s = migrate(JSON.parse(fs.readFileSync(path.join(FIX, 'v1.json'), 'utf8')));
  await st.write(p.id, 'manual-1', s);
  await st.write(p.id, 'manual-1', { ...s, playtimeSec: 999 });
  assert.equal((await st.listSlots(p.id)).length, 1);
  assert.equal((migrate(await st.read(p.id, 'manual-1'))).playtimeSec, 999);
  await st.deleteProfile(p.id);
  assert.equal((await st.listSlots(p.id)).length, 0);
});
