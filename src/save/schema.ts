/**
 * Versioned save schema. RULES (saves must survive every game update):
 *  1. Never change the meaning of an existing field in place. Add a new version instead.
 *  2. Each version bump adds one entry to MIGRATIONS (vN -> vN+1) and a fixture file
 *     tests/save-fixtures/vN.json (a real save of that version); the test suite loads every fixture.
 *  3. migrate() runs on every load and import, so old saves upgrade transparently.
 */
export const SAVE_VERSION = 1;

export interface LeadSave {
  money: number;
  inventory: string[];
  wardrobe: string;
  at: { x: number; y: number; z: number; heading: number };
}

export interface SaveV1 {
  version: 1;
  savedAt: string; // ISO
  build: string; // game build id at save time (informational)
  playtimeSec: number;
  label: string; // shown in the slot list, e.g. "W 31st St & Broadway — Fri Jun 21, 8:14 PM"
  world: { date: string; minutes: number; weather: 'clear' | 'overcast' | 'rain' };
  party: { activeCharacter: string; characters: Record<string, LeadSave> };
  narrative: {
    act: number;
    flags: Record<string, boolean | number | string>;
    missions: Record<string, 'locked' | 'available' | 'active' | 'done' | 'failed'>;
    relationships: Record<string, number>;
  };
}

export type SaveData = SaveV1; // the current version

/** vN -> vN+1 upgrade functions (input is the raw object of version N). */
export const MIGRATIONS: Record<number, (s: any) => any> = {
  // 1: (s) => ({ ...s, version: 2, newField: default }),
};

export class SaveFormatError extends Error {}

export function migrate(raw: unknown): SaveData {
  if (!raw || typeof raw !== 'object') throw new SaveFormatError('save is not an object');
  let s = raw as { version?: number };
  if (typeof s.version !== 'number' || s.version < 1) throw new SaveFormatError('save has no version');
  if (s.version > SAVE_VERSION) throw new SaveFormatError(`save is from a newer game version (v${s.version}); update the game`);
  while (s.version! < SAVE_VERSION) {
    const step = MIGRATIONS[s.version!];
    if (!step) throw new SaveFormatError(`no migration from v${s.version}`);
    s = step(s);
  }
  validate(s as SaveData);
  return s as SaveData;
}

/** Structural validation of the current version; throws SaveFormatError with a precise path. */
export function validate(s: SaveData): void {
  const fail = (p: string) => { throw new SaveFormatError(`invalid save: ${p}`); };
  if (s.version !== SAVE_VERSION) fail('version');
  if (typeof s.savedAt !== 'string') fail('savedAt');
  if (typeof s.playtimeSec !== 'number') fail('playtimeSec');
  if (!s.world || !/^\d{4}-\d{2}-\d{2}$/.test(s.world.date) || typeof s.world.minutes !== 'number') fail('world');
  if (!s.party || typeof s.party.activeCharacter !== 'string' || !s.party.characters) fail('party');
  if (!(s.party.activeCharacter in s.party.characters)) fail('party.activeCharacter not in characters');
  for (const [id, c] of Object.entries(s.party.characters)) {
    if (typeof c.money !== 'number' || !Array.isArray(c.inventory) || !c.at || ![c.at.x, c.at.y, c.at.z, c.at.heading].every(Number.isFinite)) fail(`party.characters.${id}`);
  }
  if (!s.narrative || typeof s.narrative.act !== 'number' || typeof s.narrative.flags !== 'object') fail('narrative');
}

// ---------------------------------------------------------------- portable file format (export/import)
export interface SaveFile { format: 't74-save'; version: number; sha256: string; data: SaveData }

/** Canonical JSON (sorted keys) so checksums are stable across engines. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function toFile(data: SaveData): Promise<string> {
  const file: SaveFile = { format: 't74-save', version: data.version, sha256: await sha256(canonical(data)), data };
  return JSON.stringify(file, null, 1);
}

export async function fromFile(text: string): Promise<SaveData> {
  let f: SaveFile;
  try { f = JSON.parse(text); } catch { throw new SaveFormatError('not a save file (bad JSON)'); }
  if (f?.format !== 't74-save' || !f.data) throw new SaveFormatError('not a Tenderloin \'74 save file');
  if ((await sha256(canonical(f.data))) !== f.sha256) throw new SaveFormatError('save file is damaged or was edited (checksum mismatch)');
  return migrate(f.data);
}
